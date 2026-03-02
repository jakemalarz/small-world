import { describe, it, expect } from 'vitest';
import { MAP_2P, getRegionData } from '@/game/data/map2p';

describe('2-player map data', () => {
  it('has 23 regions', () => {
    expect(MAP_2P.regions).toHaveLength(23);
  });

  it('region IDs are unique', () => {
    const ids = MAP_2P.regions.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every region has required fields', () => {
    for (const r of MAP_2P.regions) {
      expect(r.id, 'id').toBeTypeOf('number');
      expect(r.name.length, `name for ${r.id}`).toBeGreaterThan(0);
      expect(r.terrain, `terrain for ${r.id}`).toBeTypeOf('string');
      expect(r.polygon.length, `polygon for ${r.id}`).toBeGreaterThanOrEqual(3);
      expect(r.center).toHaveLength(2);
      expect(Array.isArray(r.adjacentRegionIds), `adjacency for ${r.id}`).toBe(true);
    }
  });

  it('adjacency is symmetric', () => {
    const adjMap = new Map<number, Set<number>>();
    for (const r of MAP_2P.regions) {
      adjMap.set(r.id, new Set(r.adjacentRegionIds));
    }
    for (const r of MAP_2P.regions) {
      for (const neighborId of r.adjacentRegionIds) {
        expect(
          adjMap.get(neighborId)?.has(r.id),
          `Region ${neighborId} should list ${r.id} as neighbor`,
        ).toBe(true);
      }
    }
  });

  it('all adjacent region IDs reference existing regions', () => {
    const ids = new Set(MAP_2P.regions.map((r) => r.id));
    for (const r of MAP_2P.regions) {
      for (const neighborId of r.adjacentRegionIds) {
        expect(ids.has(neighborId), `Region ${r.id} references unknown id ${neighborId}`).toBe(true);
      }
    }
  });

  it('no region is adjacent to itself', () => {
    for (const r of MAP_2P.regions) {
      expect(r.adjacentRegionIds).not.toContain(r.id);
    }
  });

  it('every polygon vertex has exactly 2 coordinates', () => {
    for (const r of MAP_2P.regions) {
      for (const vertex of r.polygon) {
        expect(vertex).toHaveLength(2);
      }
    }
  });

  it('sea and lake terrain regions exist', () => {
    const waterRegions = MAP_2P.regions.filter(
      (r) => r.terrain === 'sea' || r.terrain === 'lake',
    );
    expect(waterRegions.length).toBeGreaterThan(0);
  });

  it('regions adjacent to sea/lake are marked coastal', () => {
    const waterIds = new Set(
      MAP_2P.regions.filter((r) => r.terrain === 'sea' || r.terrain === 'lake').map((r) => r.id),
    );
    for (const r of MAP_2P.regions) {
      const bordersWater = r.adjacentRegionIds.some((id) => waterIds.has(id));
      if (bordersWater && r.terrain !== 'sea' && r.terrain !== 'lake') {
        expect(r.isCoastal, `Region ${r.id} (${r.name}) borders water but isCoastal is false`).toBe(true);
      }
    }
  });

  it('has at least one mine, magic source, and underworld', () => {
    expect(MAP_2P.regions.some((r) => r.hasMine)).toBe(true);
    expect(MAP_2P.regions.some((r) => r.hasMagicSource)).toBe(true);
    expect(MAP_2P.regions.some((r) => r.hasUnderworld)).toBe(true);
  });

  it('has correct terrain distribution', () => {
    const counts = new Map<string, number>();
    for (const r of MAP_2P.regions) {
      counts.set(r.terrain, (counts.get(r.terrain) ?? 0) + 1);
    }
    expect(counts.get('sea')).toBe(2);
    expect(counts.get('lake')).toBe(1);
    expect(counts.get('farmland')).toBe(4);
    expect(counts.get('mountain')).toBe(4);
    expect(counts.get('forest')).toBe(4);
    expect(counts.get('hill')).toBe(4);
    expect(counts.get('swamp')).toBe(4);
  });

  it('has correct secondary classification counts', () => {
    const mines = MAP_2P.regions.filter((r) => r.hasMine);
    const magics = MAP_2P.regions.filter((r) => r.hasMagicSource);
    const underworlds = MAP_2P.regions.filter((r) => r.hasUnderworld);
    expect(mines.length).toBe(4); // Mtn+Mine, Mtn+Mine+UW, Forest+Mine, Swamp+Mine
    expect(magics.length).toBe(4); // 2 Farmland+Magic, Forest+Magic, Swamp+Magic
    expect(underworlds.length).toBe(4); // 2 Hill+UW, Mtn+Mine+UW, Swamp+UW
  });

  it('no region has mine as primary terrain', () => {
    for (const r of MAP_2P.regions) {
      expect(r.terrain).not.toBe('mine');
    }
  });

  it('has lost tribes on some regions', () => {
    const ltCount = MAP_2P.regions.filter((r) => r.hasLostTribe).length;
    expect(ltCount).toBeGreaterThanOrEqual(4);
    expect(ltCount).toBeLessThanOrEqual(10);
  });

  it('isMountainAdjacent matches actual adjacency to mountain terrain', () => {
    const mountainIds = new Set(
      MAP_2P.regions.filter((r) => r.terrain === 'mountain').map((r) => r.id),
    );
    for (const r of MAP_2P.regions) {
      const expected = r.adjacentRegionIds.some((id) => mountainIds.has(id));
      expect(
        r.isMountainAdjacent,
        `Region ${r.id} (${r.name}) isMountainAdjacent should be ${expected}`,
      ).toBe(expected);
    }
  });

  it('getRegionData returns the correct region', () => {
    const r = getRegionData(1);
    expect(r.id).toBe(1);
    expect(r.terrain).toBe('sea');
  });

  it('getRegionData throws for unknown id', () => {
    expect(() => getRegionData(999)).toThrow();
  });
});
