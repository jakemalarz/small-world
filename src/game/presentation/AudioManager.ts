// ── Audio Manager interface ───────────────────────────────────────────────────
// All game audio flows through this interface. In M5, StubAudioManager
// is replaced with PhaserAudioManager that plays real sound assets.

export interface IAudioManager {
  playTokenPlace(): void;
  playTokenSlide(): void;
  playConquest(): void;
  playDieRoll(): void;
  playCoinScore(): void;
  playDecline(): void;
  playTurnTransition(): void;
  playVictory(): void;
  setAmbient(on: boolean): void;
  setVolume(volume: number): void;
}

// ── Stub implementation ───────────────────────────────────────────────────────
// No-ops in production; logs in development so wiring can be verified.

const DEV = import.meta.env.DEV;

export class StubAudioManager implements IAudioManager {
  playTokenPlace(): void    { if (DEV) console.debug('[audio] tokenPlace'); }
  playTokenSlide(): void    { if (DEV) console.debug('[audio] tokenSlide'); }
  playConquest(): void      { if (DEV) console.debug('[audio] conquest'); }
  playDieRoll(): void       { if (DEV) console.debug('[audio] dieRoll'); }
  playCoinScore(): void     { if (DEV) console.debug('[audio] coinScore'); }
  playDecline(): void       { if (DEV) console.debug('[audio] decline'); }
  playTurnTransition(): void { if (DEV) console.debug('[audio] turnTransition'); }
  playVictory(): void       { if (DEV) console.debug('[audio] victory'); }
  setAmbient(_on: boolean): void   { /* no-op */ }
  setVolume(_volume: number): void { /* no-op */ }
}
