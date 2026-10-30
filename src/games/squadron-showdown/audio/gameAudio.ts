import { SquadronGameSettings } from '../types';
import { DEFAULT_GAME_SETTINGS } from '../storage/progressionStorage';

class SquadronAudioEngine {
  private ctx: AudioContext | null = null;
  private settings: SquadronGameSettings = { ...DEFAULT_GAME_SETTINGS };
  private bgmInterval: number | null = null;
  private bgmStep = 0;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch {
          return null;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public updateSettings(settings: SquadronGameSettings): void {
    this.settings = { ...settings };
    if (this.settings.muted || this.settings.musicVolume <= 0.01) {
      this.stopMusic();
    }
  }

  private getSfxGain(): number {
    if (this.settings.muted) return 0;
    return Math.max(0, Math.min(1, this.settings.sfxVolume));
  }

  private getMusicGain(): number {
    if (this.settings.muted) return 0;
    return Math.max(0, Math.min(1, this.settings.musicVolume));
  }

  public playMenuClick(): void {
    const vol = this.getSfxGain();
    if (vol <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.065);
    gain.gain.setValueAtTime(0.18 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.065);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  }

  public playPunchHit(): void {
    const vol = this.getSfxGain();
    if (vol <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.11);
    gain.gain.setValueAtTime(0.32 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }

  public playKickHit(): void {
    const vol = this.getSfxGain();
    if (vol <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(145, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(42, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.38 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.17);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.17);
  }

  public playBlockImpact(): void {
    const vol = this.getSfxGain();
    if (vol <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(680, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(290, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.24 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  public playDodgeWhoosh(): void {
    const vol = this.getSfxGain();
    if (vol <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(620, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.16 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.13);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
  }

  public playSwingWhoosh(type: 'PUNCH' | 'KICK'): void {
    const vol = this.getSfxGain();
    if (vol <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const startFreq = type === 'PUNCH' ? 340 : 240;
    const endFreq = type === 'PUNCH' ? 140 : 95;
    const dur = type === 'PUNCH' ? 0.08 : 0.12;
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + dur);
    gain.gain.setValueAtTime(0.14 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.01);
  }

  public playComboStinger(comboCount: number): void {
    const vol = this.getSfxGain();
    if (vol <= 0 || comboCount < 2) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const baseFreq = Math.min(1046, 392 + comboCount * 65);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, ctx.currentTime + 0.11);
    gain.gain.setValueAtTime(0.18 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }

  public playClashParry(): void {
    const vol = this.getSfxGain();
    if (vol <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.28 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.17);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.17);
  }

  public playGuardBreak(): void {
    const vol = this.getSfxGain();
    if (vol <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(68, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.32 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.26);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  }

  public playSpecialAttack(): void {
    const vol = this.getSfxGain();
    if (vol <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'square';
    osc1.frequency.setValueAtTime(220, now);
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.18);
    osc1.frequency.exponentialRampToValueAtTime(95, now + 0.42);

    osc2.frequency.setValueAtTime(440, now);
    osc2.frequency.exponentialRampToValueAtTime(110, now + 0.42);

    gain.gain.setValueAtTime(0.36 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.45);
    osc2.stop(now + 0.45);
  }

  public playCountdownBeep(isFinalFight = false): void {
    const vol = this.getSfxGain();
    if (vol <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(isFinalFight ? 880 : 440, ctx.currentTime);
    gain.gain.setValueAtTime(0.2 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isFinalFight ? 0.25 : 0.12));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (isFinalFight ? 0.26 : 0.13));
  }

  public playVictoryFanfare(): void {
    const vol = this.getSfxGain();
    if (vol <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      const start = ctx.currentTime + idx * 0.11;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.25 * vol, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.29);
    });
  }

  public playDefeatTone(): void {
    const vol = this.getSfxGain();
    if (vol <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const notes = [330, 293.66, 246.94, 196];
    notes.forEach((freq, idx) => {
      const start = ctx.currentTime + idx * 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.2 * vol, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    });
  }

  public startArenaMusic(): void {
    this.stopMusic();
    if (typeof window === 'undefined') return;
    if (this.getMusicGain() <= 0.01) return;

    const bassline = [110, 110, 130.81, 146.83, 110, 110, 164.81, 146.83];
    this.bgmStep = 0;

    this.bgmInterval = window.setInterval(() => {
      const musicVol = this.getMusicGain();
      if (musicVol <= 0.01) return;
      const ctx = this.ensureContext();
      if (!ctx) return;

      const freq = bassline[this.bgmStep % bassline.length];
      this.bgmStep += 1;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.06 * musicVol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.21);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    }, 240);
  }

  public stopMusic(): void {
    if (this.bgmInterval !== null && typeof window !== 'undefined') {
      window.clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }

  public destroy(): void {
    this.stopMusic();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export const gameAudio = new SquadronAudioEngine();
