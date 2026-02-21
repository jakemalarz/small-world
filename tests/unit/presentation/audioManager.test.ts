import { describe, it, expect } from 'vitest';
import { StubAudioManager } from '@/game/presentation/AudioManager';

describe('StubAudioManager', () => {
  const audio = new StubAudioManager();

  it('implements IAudioManager — all methods exist', () => {
    expect(typeof audio.playTokenPlace).toBe('function');
    expect(typeof audio.playTokenSlide).toBe('function');
    expect(typeof audio.playConquest).toBe('function');
    expect(typeof audio.playDieRoll).toBe('function');
    expect(typeof audio.playCoinScore).toBe('function');
    expect(typeof audio.playDecline).toBe('function');
    expect(typeof audio.playTurnTransition).toBe('function');
    expect(typeof audio.playVictory).toBe('function');
    expect(typeof audio.setAmbient).toBe('function');
    expect(typeof audio.setVolume).toBe('function');
  });

  it('all play methods return undefined and do not throw', () => {
    expect(audio.playTokenPlace()).toBeUndefined();
    expect(audio.playTokenSlide()).toBeUndefined();
    expect(audio.playConquest()).toBeUndefined();
    expect(audio.playDieRoll()).toBeUndefined();
    expect(audio.playCoinScore()).toBeUndefined();
    expect(audio.playDecline()).toBeUndefined();
    expect(audio.playTurnTransition()).toBeUndefined();
    expect(audio.playVictory()).toBeUndefined();
  });

  it('setAmbient does not throw for true or false', () => {
    expect(() => audio.setAmbient(true)).not.toThrow();
    expect(() => audio.setAmbient(false)).not.toThrow();
  });

  it('setVolume does not throw for any number', () => {
    expect(() => audio.setVolume(0)).not.toThrow();
    expect(() => audio.setVolume(0.5)).not.toThrow();
    expect(() => audio.setVolume(1)).not.toThrow();
  });
});
