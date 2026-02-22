import Phaser from 'phaser';
import type { GameAction } from '@/game/state/types';
import type { IAudioManager } from '@/game/presentation/AudioManager';
import { MAP_2P } from '@/game/data/map2p';

// ── Animation Choreographer ───────────────────────────────────────────────────
//
// Translates GameActions into Phaser tween sequences. Each public method
// returns a Promise that resolves when the animation completes, so the
// GameController can await animations before applying the next state.
//
// Speed multiplier: 1.0 = normal, 2.0 = 2× fast (AI vs AI).
// Set speed > 4 to effectively skip animations (instant resolve).

const INSTANT_THRESHOLD = 4.0; // above this, skip tweens

// Placeholder token circle size (must match TokenRenderer)
const TOKEN_RADIUS = 12;

export class AnimationChoreographer {
  private readonly scene: Phaser.Scene;
  private readonly audio: IAudioManager;
  private speed: number;

  constructor(scene: Phaser.Scene, audio: IAudioManager, speed = 1.0) {
    this.scene = scene;
    this.audio = audio;
    this.speed = speed;
  }

  /** Adjust playback speed. Values > INSTANT_THRESHOLD skip animations. */
  setSpeed(speed: number): void {
    this.speed = speed;
  }

  // ── Per-action animation entry point ─────────────────────────────────────

  /**
   * Play the animation for a given game action.
   * Returns a Promise that resolves when the animation (or immediate skip) finishes.
   */
  async playAction(action: GameAction): Promise<void> {
    if (this.speed > INSTANT_THRESHOLD) return; // skip all animations

    switch (action.type) {
      case 'selectCombo':      await this.animateComboSelection();   break;
      case 'conquer':          await this.animateConquest(action.regionId); break;
      case 'ghoulConquer':     await this.animateConquest(action.regionId); break;
      case 'placeDragon':      await this.animatePlaceDragon(action.regionId); break;
      case 'decline':          await this.animateDecline();           break;
      case 'redeploy':         await this.animateRedeploy();          break;
      case 'endPhase':         await this.animateEndPhase();          break;
      default:                 /* no animation for most actions */   break;
    }
  }

  // ── Individual animations ─────────────────────────────────────────────────

  /** Coin cascade + token appearance when picking a combo. */
  async animateComboSelection(): Promise<void> {
    this.audio.playCoinScore();
    await this._delay(200 / this.speed);
  }

  /**
   * Conquest: flash the target region, slide an attacker token in from the
   * camera center, play conquest sound.
   */
  async animateConquest(regionId: number): Promise<void> {
    this.audio.playConquest();

    const mapRegion = MAP_2P.regions.find((r) => r.id === regionId);
    if (!mapRegion) return;

    const [tx, ty] = mapRegion.center;

    // Pan camera to target region
    await this._panCamera(tx, ty, 300 / this.speed);

    // Flash circle at target
    const flash = this.scene.add.circle(tx, ty, TOKEN_RADIUS + 8, 0xffffff, 0.7).setDepth(20);
    await this._tween(flash, { alpha: 0, scaleX: 2, scaleY: 2 }, 300 / this.speed);
    flash.destroy();

    await this._delay(50 / this.speed);
  }

  /** Token placement sound. */
  async animateTokenPlace(regionId: number): Promise<void> {
    this.audio.playTokenPlace();
    const mapRegion = MAP_2P.regions.find((r) => r.id === regionId);
    if (!mapRegion) return;
    await this._panCamera(...mapRegion.center, 200 / this.speed);
  }

  /** Dragon placement flash. */
  async animatePlaceDragon(regionId: number): Promise<void> {
    const mapRegion = MAP_2P.regions.find((r) => r.id === regionId);
    if (!mapRegion) return;
    const [tx, ty] = mapRegion.center;

    await this._panCamera(tx, ty, 200 / this.speed);

    const flash = this.scene.add.circle(tx, ty, 20, 0xdc2626, 0.8).setDepth(20);
    await this._tween(flash, { alpha: 0, scaleX: 3, scaleY: 3 }, 400 / this.speed);
    flash.destroy();
  }

  /**
   * Decline: tokens on board briefly dim to show they're in decline.
   * Plays the decline audio cue.
   */
  async animateDecline(): Promise<void> {
    this.audio.playDecline();
    await this._delay(400 / this.speed);
  }

  /** Redeployment: slide tokens between regions (placeholder — just a delay). */
  async animateRedeploy(): Promise<void> {
    this.audio.playTokenSlide();
    await this._delay(300 / this.speed);
  }

  /** Short fade/sound at turn end. */
  async animateEndPhase(): Promise<void> {
    this.audio.playTurnTransition();
    await this._delay(150 / this.speed);
  }

  /** Scoring: coin cascade animation (placeholder — delay + sound). */
  async animateScoring(): Promise<void> {
    this.audio.playCoinScore();
    await this._delay(500 / this.speed);
  }

  /** Victory fanfare at game over. */
  async animateVictory(): Promise<void> {
    this.audio.playVictory();
    await this._delay(1000 / this.speed);
  }

  /** Reinforcement die tumble — shows the result value on the die face. */
  async animateDieRoll(result?: 0 | 1 | 2 | 3): Promise<void> {
    this.audio.playDieRoll();

    const cx = this.scene.scale.width / 2;
    const cy = this.scene.scale.height / 2;

    const die = this.scene.add.rectangle(cx, cy, 56, 56, 0xe8d5b7)
      .setStrokeStyle(3, 0x4a3520)
      .setDepth(30);

    const resultLabel = this.scene.add.text(cx, cy, '', {
      fontSize: '28px', fontFamily: 'Georgia, serif', color: '#1a1a30', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(31).setAlpha(0);

    // Tumble: rotate while shrinking
    await this._tween(die, { angle: 720, scaleX: 0.5, scaleY: 0.5 }, 400 / this.speed);
    await this._tween(die, { scaleX: 1, scaleY: 1 }, 150 / this.speed);

    // Reveal result number
    if (result !== undefined) {
      resultLabel.setText(`${result}`);
      resultLabel.setAlpha(1);
      const isZero = result === 0;
      resultLabel.setColor(isZero ? '#dc2626' : '#16a34a');
    }

    await this._delay(600 / this.speed);
    // Fade out
    await Promise.all([
      this._tween(die, { alpha: 0 }, 200 / this.speed),
      this._tween(resultLabel, { alpha: 0 }, 200 / this.speed),
    ]);
    die.destroy();
    resultLabel.destroy();
  }

  // ── Camera helpers ────────────────────────────────────────────────────────

  /** Smoothly pan the camera to world coordinates (wx, wy). */
  private _panCamera(wx: number, wy: number, duration: number): Promise<void> {
    return new Promise((resolve) => {
      const cam = this.scene.cameras.main;
      // Check if already close enough (within 50px)
      const scrollX = cam.scrollX + cam.width / 2;
      const scrollY = cam.scrollY + cam.height / 2;
      const dist = Math.hypot(wx - scrollX, wy - scrollY);
      if (dist < 50 || duration <= 0) {
        resolve();
        return;
      }
      this.scene.cameras.main.pan(wx, wy, duration, 'Sine.easeInOut', false, (_, progress) => {
        if (progress === 1) resolve();
      });
    });
  }

  // ── Tween helpers ─────────────────────────────────────────────────────────

  private _tween(
    target: Phaser.GameObjects.GameObject,
    props: Record<string, number>,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      if (duration <= 0) { resolve(); return; }
      this.scene.tweens.add({
        targets: target,
        ...props,
        duration,
        ease: 'Sine.easeOut',
        onComplete: () => resolve(),
      });
    });
  }

  private _delay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.scene.time.delayedCall(ms, resolve);
    });
  }
}
