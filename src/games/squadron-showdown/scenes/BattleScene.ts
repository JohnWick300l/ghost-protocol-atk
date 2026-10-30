import * as Phaser from 'phaser';
import {
  BattleMatchState,
  CombatHitEvent,
  CombatInputFrame,
  CombatantRuntimeState,
  DifficultyLevel,
  FighterActionState,
  FighterDefinition,
} from '../types';
import { getFighterById } from '../characters/roster';
import { getArenaById } from '../arenas/arenas';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  EMPTY_INPUT,
  GROUND_Y,
  createInitialMatchState,
  stepBattleSimulation,
} from '../combat/combatEngine';
import { SquadronAIController } from '../ai/aiController';
import { gameAudio } from '../audio/gameAudio';
import {
  ArticulatedFighterPuppet,
  extractCombatPoseFromState,
} from '../animation/fighterRig';

export interface BattleSceneConfig {
  playerFighterId: string;
  opponentFighterId: string;
  arenaId: string;
  difficulty: DifficultyLevel;
  isTrainingMode: boolean;
  onStateSync: (state: BattleMatchState) => void;
  onMatchFinished: (finalState: BattleMatchState) => void;
  onPauseRequested: () => void;
}

const PUPPET_CANVAS_WIDTH = 520;
const PUPPET_CANVAS_HEIGHT = 460;

interface ArenaParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: number;
  alpha: number;
  decayPerSec: number;
  hasGravity: boolean;
}

export class BattleScene extends Phaser.Scene {
  private configData!: BattleSceneConfig;
  private matchState!: BattleMatchState;
  private aiController!: SquadronAIController;
  private playerDef!: FighterDefinition;
  private opponentDef!: FighterDefinition;

  private playerSprite?: Phaser.GameObjects.Image;
  private opponentSprite?: Phaser.GameObjects.Image;
  private playerPuppet?: ArticulatedFighterPuppet;
  private opponentPuppet?: ArticulatedFighterPuppet;
  private playerCanvasTex?: Phaser.Textures.CanvasTexture;
  private opponentCanvasTex?: Phaser.Textures.CanvasTexture;

  private playerShadow?: Phaser.GameObjects.Ellipse;
  private opponentShadow?: Phaser.GameObjects.Ellipse;
  private arenaFxGraphics?: Phaser.GameObjects.Graphics;
  private combatFxGraphics?: Phaser.GameObjects.Graphics;
  private particleGraphics?: Phaser.GameObjects.Graphics;
  private announceText?: Phaser.GameObjects.Text;

  private particles: ArenaParticle[] = [];
  private bikeHeadlightPulseMs = 0;
  private prevPlayerAction: FighterActionState = 'IDLE';
  private prevOpponentAction: FighterActionState = 'IDLE';
  private prevPlayerGrounded = true;
  private prevOpponentGrounded = true;

  private isPausedByModal = false;
  private matchEndedEmitted = false;
  private lastCountdownShown = -1;
  private hitstopMs = 0;

  private externalInput: CombatInputFrame = { ...EMPTY_INPUT };
  private oneShotActions = {
    punch: false,
    kick: false,
    dodge: false,
    special: false,
  };

  private keys?: {
    A: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    W: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    LEFT: Phaser.Input.Keyboard.Key;
    RIGHT: Phaser.Input.Keyboard.Key;
    UP: Phaser.Input.Keyboard.Key;
    DOWN: Phaser.Input.Keyboard.Key;
    F: Phaser.Input.Keyboard.Key;
    G: Phaser.Input.Keyboard.Key;
    H: Phaser.Input.Keyboard.Key;
    R: Phaser.Input.Keyboard.Key;
    SHIFT: Phaser.Input.Keyboard.Key;
    P: Phaser.Input.Keyboard.Key;
    ESC: Phaser.Input.Keyboard.Key;
  };

  constructor(configData: BattleSceneConfig) {
    super({ key: 'BattleScene' });
    this.configData = configData;
  }

  public preload(): void {
    this.playerDef = getFighterById(this.configData.playerFighterId);
    this.opponentDef = getFighterById(this.configData.opponentFighterId);

    const pKey = `fighter_tex_${this.playerDef.id}`;
    const oKey = `fighter_tex_${this.opponentDef.id}`;

    if (!this.textures.exists(pKey)) {
      this.load.image(pKey, this.playerDef.spriteAsset);
    }
    if (!this.textures.exists(oKey)) {
      this.load.image(oKey, this.opponentDef.spriteAsset);
    }
  }

  public create(): void {
    this.matchState = createInitialMatchState({
      playerFighterId: this.configData.playerFighterId,
      opponentFighterId: this.configData.opponentFighterId,
      arenaId: this.configData.arenaId,
      difficulty: this.configData.difficulty,
      isTrainingMode: this.configData.isTrainingMode,
    });
    this.aiController = new SquadronAIController(this.configData.difficulty);

    this.buildArenaBackdrop();

    this.arenaFxGraphics = this.add.graphics().setDepth(3);
    this.combatFxGraphics = this.add.graphics().setDepth(15);
    this.particleGraphics = this.add.graphics().setDepth(18);

    // Ground shadows
    this.playerShadow = this.add
      .ellipse(this.matchState.player.x, GROUND_Y + 4, 124, 24, 0x000000, 0.58)
      .setDepth(5);
    this.opponentShadow = this.add
      .ellipse(this.matchState.opponent.x, GROUND_Y + 4, 124, 24, 0x000000, 0.58)
      .setDepth(5);

    const pKey = `fighter_tex_${this.playerDef.id}`;
    const oKey = `fighter_tex_${this.opponentDef.id}`;

    const pSource = this.textures.get(pKey).getSourceImage() as
      | HTMLImageElement
      | HTMLCanvasElement;
    const oSource = this.textures.get(oKey).getSourceImage() as
      | HTMLImageElement
      | HTMLCanvasElement;

    this.playerPuppet = new ArticulatedFighterPuppet(
      pSource,
      this.playerDef.id
    );
    this.opponentPuppet = new ArticulatedFighterPuppet(
      oSource,
      this.opponentDef.id
    );

    const pDynamicKey = `puppet_dyn_p1_${Date.now()}`;
    const oDynamicKey = `puppet_dyn_ai_${Date.now()}`;

    this.playerCanvasTex =
      this.textures.createCanvas(
        pDynamicKey,
        PUPPET_CANVAS_WIDTH,
        PUPPET_CANVAS_HEIGHT
      ) || undefined;
    this.opponentCanvasTex =
      this.textures.createCanvas(
        oDynamicKey,
        PUPPET_CANVAS_WIDTH,
        PUPPET_CANVAS_HEIGHT
      ) || undefined;

    this.playerSprite = this.add
      .image(this.matchState.player.x, GROUND_Y + 28, pDynamicKey)
      .setOrigin(0.44, 1)
      .setDepth(10);

    this.opponentSprite = this.add
      .image(this.matchState.opponent.x, GROUND_Y + 28, oDynamicKey)
      .setOrigin(0.44, 1)
      .setDepth(9);
    this.opponentSprite.setFlipX(true);

    // Center Arena Announcement Banner
    this.announceText = this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT * 0.36, 'READY', {
        fontFamily: 'Orbitron, Rajdhani, Impact, sans-serif',
        fontSize: '76px',
        fontStyle: '900',
        color: '#ffffff',
        stroke: '#090d1a',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setDepth(30);

    if (this.input.keyboard) {
      this.keys = {
        A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        LEFT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
        RIGHT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
        UP: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
        DOWN: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
        F: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F),
        G: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G),
        H: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H),
        R: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R),
        SHIFT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
        P: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P),
        ESC: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      };
    }

    gameAudio.startArenaMusic();
    this.configData.onStateSync({ ...this.matchState });
  }

  public setPausedState(paused: boolean): void {
    this.isPausedByModal = paused;
  }

  public setTouchInputState(partial: Partial<CombatInputFrame>): void {
    this.externalInput = {
      ...this.externalInput,
      ...partial,
    };
  }

  public triggerTouchAction(action: 'punch' | 'kick' | 'dodge' | 'special'): void {
    this.oneShotActions[action] = true;
  }

  private collectPlayerInput(): CombatInputFrame {
    const k = this.keys;
    const punchJust =
      (k ? Phaser.Input.Keyboard.JustDown(k.F) : false) ||
      this.externalInput.punch ||
      this.oneShotActions.punch;
    const kickJust =
      (k ? Phaser.Input.Keyboard.JustDown(k.G) : false) ||
      this.externalInput.kick ||
      this.oneShotActions.kick;
    const specialJust =
      (k ? Phaser.Input.Keyboard.JustDown(k.R) : false) ||
      this.externalInput.special ||
      this.oneShotActions.special;
    const dodgeJust =
      (k ? Phaser.Input.Keyboard.JustDown(k.SHIFT) : false) ||
      this.externalInput.dodge ||
      this.oneShotActions.dodge;

    this.oneShotActions.punch = false;
    this.oneShotActions.kick = false;
    this.oneShotActions.dodge = false;
    this.oneShotActions.special = false;

    return {
      left: Boolean((k && (k.A.isDown || k.LEFT.isDown)) || this.externalInput.left),
      right: Boolean((k && (k.D.isDown || k.RIGHT.isDown)) || this.externalInput.right),
      up: Boolean((k && (k.W.isDown || k.UP.isDown)) || this.externalInput.up),
      down: Boolean((k && (k.S.isDown || k.DOWN.isDown)) || this.externalInput.down),
      block: Boolean((k && k.H.isDown) || this.externalInput.block),
      punch: punchJust,
      kick: kickJust,
      dodge: dodgeJust,
      special: specialJust,
    };
  }

  public update(time: number, delta: number): void {
    if (this.keys) {
      if (
        Phaser.Input.Keyboard.JustDown(this.keys.P) ||
        Phaser.Input.Keyboard.JustDown(this.keys.ESC)
      ) {
        this.configData.onPauseRequested();
        return;
      }
    }

    if (this.isPausedByModal) {
      return;
    }

    if (this.hitstopMs > 0) {
      this.hitstopMs = Math.max(0, this.hitstopMs - delta);
      return;
    }

    this.bikeHeadlightPulseMs = Math.max(0, this.bikeHeadlightPulseMs - delta);

    const playerInput = this.collectPlayerInput();
    const aiInput = this.aiController.computeNextInput(
      this.matchState.opponent,
      this.matchState.player,
      delta,
      this.configData.isTrainingMode
    );

    const prevPhase = this.matchState.phase;
    if (
      this.matchState.phase === 'COUNTDOWN' &&
      (playerInput.punch ||
        playerInput.kick ||
        playerInput.special ||
        playerInput.dodge ||
        playerInput.block ||
        playerInput.left ||
        playerInput.right ||
        playerInput.up)
    ) {
      this.matchState.phase = 'FIGHTING';
      this.matchState.elapsedMs = 0;
    }
    stepBattleSimulation(this.matchState, playerInput, aiInput, delta);

    // Detect action transitions for realistic swing whooshes and tarmac dust puffs
    this.detectActionTransitions(this.matchState.player, true);
    this.detectActionTransitions(this.matchState.opponent, false);

    // Countdown audio & banner
    if (this.matchState.phase === 'COUNTDOWN') {
      const c = this.matchState.countdownSeconds;
      if (c !== this.lastCountdownShown) {
        this.lastCountdownShown = c;
        if (c > 0) {
          this.announceText?.setText(String(c)).setAlpha(1).setScale(1.2);
          this.tweens.add({
            targets: this.announceText,
            scale: 0.9,
            duration: 500,
          });
          gameAudio.playCountdownBeep(false);
        }
      }
    } else if (prevPhase === 'COUNTDOWN' && this.matchState.phase === 'FIGHTING') {
      this.announceText?.setText('FIGHT!').setColor('#38bdf8').setAlpha(1).setScale(1.35);
      gameAudio.playCountdownBeep(true);
      this.tweens.add({
        targets: this.announceText,
        alpha: 0,
        scale: 1.7,
        duration: 650,
      });
    } else if (prevPhase === 'FIGHTING' && this.matchState.phase === 'KO_SEQUENCE') {
      const label = this.matchState.winReason === 'TIME_OUT' ? 'TIME OVER!' : 'K.O.!';
      this.announceText?.setText(label).setColor('#f43f5e').setAlpha(1).setScale(1.5);
      this.cameras.main.shake(380, 0.018);
      this.bikeHeadlightPulseMs = 2000;
    }

    for (const ev of this.matchState.recentEvents) {
      this.handleCombatHitEvent(ev);
    }

    this.renderDynamicArenaFx(time);
    this.updateArticulatedFighter(
      this.matchState.player,
      this.playerSprite,
      this.playerPuppet,
      this.playerCanvasTex,
      this.playerShadow,
      this.playerDef,
      time
    );
    this.updateArticulatedFighter(
      this.matchState.opponent,
      this.opponentSprite,
      this.opponentPuppet,
      this.opponentCanvasTex,
      this.opponentShadow,
      this.opponentDef,
      time
    );
    this.renderCombatActionVfx(time);
    this.updateAndRenderParticles(delta);

    this.configData.onStateSync({
      ...this.matchState,
      player: { ...this.matchState.player },
      opponent: { ...this.matchState.opponent },
    });

    if (this.matchState.phase === 'FINISHED' && !this.matchEndedEmitted) {
      this.matchEndedEmitted = true;
      gameAudio.stopMusic();
      if (this.matchState.winner === 'PLAYER') {
        gameAudio.playVictoryFanfare();
      } else {
        gameAudio.playDefeatTone();
      }
      this.configData.onMatchFinished({ ...this.matchState });
    }
  }

  private detectActionTransitions(
    c: CombatantRuntimeState,
    isPlayer: boolean
  ): void {
    const prevAct = isPlayer ? this.prevPlayerAction : this.prevOpponentAction;
    const prevGrounded = isPlayer
      ? this.prevPlayerGrounded
      : this.prevOpponentGrounded;
    const nowGrounded = c.y >= GROUND_Y - 2;

    if (c.action !== prevAct) {
      if (c.action === 'PUNCH') {
        gameAudio.playSwingWhoosh('PUNCH');
        this.spawnTarmacDust(c.x, GROUND_Y, 4, 0x94a3b8);
      } else if (c.action === 'KICK') {
        gameAudio.playSwingWhoosh('KICK');
        this.spawnTarmacDust(c.x, GROUND_Y, 6, 0xcbd5e1);
      } else if (c.action === 'DODGE') {
        gameAudio.playDodgeWhoosh();
        this.spawnTarmacDust(c.x, GROUND_Y, 10, 0x38bdf8);
      } else if (c.action === 'JUMP') {
        this.spawnTarmacDust(c.x, GROUND_Y, 8, 0x94a3b8);
      } else if (c.action === 'SPECIAL') {
        this.bikeHeadlightPulseMs = 1200;
        this.spawnTarmacDust(c.x, GROUND_Y, 14, 0xfacc15);
      }
    }

    // Landing dust puff
    if (!prevGrounded && nowGrounded) {
      this.spawnTarmacDust(c.x, GROUND_Y, 10, 0x94a3b8);
    }

    if (isPlayer) {
      this.prevPlayerAction = c.action;
      this.prevPlayerGrounded = nowGrounded;
    } else {
      this.prevOpponentAction = c.action;
      this.prevOpponentGrounded = nowGrounded;
    }
  }

  private spawnTarmacDust(
    x: number,
    y: number,
    count: number,
    color: number
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI * (0.1 + Math.random() * 0.8);
      const speed = 40 + Math.random() * 140;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 36,
        y: y - 4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.5,
        radius: 3 + Math.random() * 5,
        color,
        alpha: 0.65,
        decayPerSec: 1.5,
        hasGravity: false,
      });
    }
  }

  private spawnImpactSparks(
    x: number,
    y: number,
    count: number,
    color: number
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 340;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        radius: 2.5 + Math.random() * 3.5,
        color,
        alpha: 1,
        decayPerSec: 2.1,
        hasGravity: true,
      });
    }
  }

  private updateAndRenderParticles(deltaMs: number): void {
    if (!this.particleGraphics) return;
    const dt = deltaMs / 1000;
    const g = this.particleGraphics;
    g.clear();

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.hasGravity) {
        p.vy += 980 * dt;
        if (p.y >= GROUND_Y) {
          p.y = GROUND_Y;
          p.vy = -Math.abs(p.vy) * 0.45;
          p.vx *= 0.75;
        }
      }
      p.alpha -= p.decayPerSec * dt;
      if (p.alpha <= 0.02) {
        this.particles.splice(i, 1);
        continue;
      }
      g.fillStyle(p.color, p.alpha);
      g.fillCircle(p.x, p.y, p.radius);
    }
  }

  private handleCombatHitEvent(ev: CombatHitEvent): void {
    if (ev.dodged) {
      gameAudio.playDodgeWhoosh();
      this.spawnFloatingBanner(ev.impactX, ev.impactY, 'EVADED!', '#38bdf8');
      return;
    }

    if (ev.blocked) {
      if (ev.isGuardBreak) {
        gameAudio.playGuardBreak();
        this.hitstopMs = 80;
        this.cameras.main.shake(220, 0.012);
        this.spawnImpactSparks(ev.impactX, ev.impactY, 22, 0xf43f5e);
        this.spawnFloatingBanner(
          ev.impactX,
          ev.impactY - 20,
          'GUARD BREAK!',
          '#f43f5e'
        );
      } else {
        gameAudio.playBlockImpact();
        this.spawnImpactSparks(ev.impactX, ev.impactY, 8, 0x38bdf8);
        this.spawnFloatingBanner(
          ev.impactX,
          ev.impactY,
          `BLOCKED -${ev.damage}`,
          '#94a3b8'
        );
        this.cameras.main.shake(90, 0.004);
      }
      return;
    }

    if (ev.comboCount && ev.comboCount >= 2) {
      gameAudio.playComboStinger(ev.comboCount);
      this.bikeHeadlightPulseMs = 900;
    }

    if (ev.isCounterHit) {
      this.spawnFloatingBanner(
        ev.impactX,
        ev.impactY - 58,
        'COUNTER HIT!',
        '#f43f5e'
      );
    }

    if (ev.attackType === 'SPECIAL') {
      gameAudio.playSpecialAttack();
      this.hitstopMs = 95;
      this.bikeHeadlightPulseMs = 1500;
      this.cameras.main.shake(260, 0.014);
      this.spawnImpactSparks(ev.impactX, ev.impactY, 28, 0xfacc15);
      this.spawnFloatingBanner(
        ev.impactX,
        ev.impactY - 30,
        `${ev.specialName || 'SPECIAL'}! -${ev.damage}`,
        '#facc15'
      );
    } else if (ev.attackType === 'KICK') {
      gameAudio.playKickHit();
      this.hitstopMs = 55;
      this.cameras.main.shake(140, 0.008);
      this.spawnImpactSparks(ev.impactX, ev.impactY, 16, 0xfb923c);
      this.spawnFloatingBanner(
        ev.impactX,
        ev.impactY,
        `${ev.strikeCallout || 'KICK!'} -${ev.damage}`,
        '#fb923c'
      );
    } else {
      gameAudio.playPunchHit();
      this.hitstopMs = 38;
      this.cameras.main.shake(95, 0.005);
      this.spawnImpactSparks(ev.impactX, ev.impactY, 12, 0x38bdf8);
      this.spawnFloatingBanner(
        ev.impactX,
        ev.impactY,
        `${ev.strikeCallout || 'PUNCH!'} -${ev.damage}`,
        '#ffffff'
      );
    }
  }

  private spawnFloatingBanner(
    x: number,
    y: number,
    text: string,
    color: string
  ): void {
    const label = this.add
      .text(x, y, text, {
        fontFamily: 'Orbitron, Rajdhani, sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
        color,
        stroke: '#050811',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(25);

    this.tweens.add({
      targets: label,
      y: y - 55,
      alpha: 0,
      duration: 680,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  private updateArticulatedFighter(
    state: CombatantRuntimeState,
    sprite: Phaser.GameObjects.Image | undefined,
    puppet: ArticulatedFighterPuppet | undefined,
    canvasTex: Phaser.Textures.CanvasTexture | undefined,
    shadow: Phaser.GameObjects.Ellipse | undefined,
    def: FighterDefinition,
    time: number
  ): void {
    if (!sprite || !puppet || !canvasTex || !shadow) return;

    const heightOffGround = Math.max(0, GROUND_Y - state.y);
    const shadowScale = Math.max(0.45, 1 - heightOffGround / 380);
    shadow.setPosition(state.x, GROUND_Y + 4);
    shadow.setScale(shadowScale);

    // Compute exact articulated limb angles & physical punch/kick extensions
    const pose = extractCombatPoseFromState(state, time);
    const ctx = canvasTex.getContext();
    puppet.renderPose(
      ctx,
      PUPPET_CANVAS_WIDTH,
      PUPPET_CANVAS_HEIGHT,
      pose,
      def.accentColor,
      def.secondaryColor
    );
    canvasTex.refresh();

    sprite.setFlipX(state.facing === -1);
    sprite.setOrigin(state.facing === 1 ? 0.44 : 0.56, 1);
    sprite.setPosition(state.x, state.y + 28);

    if (state.action === 'HIT_STUN') {
      sprite.setTint(0xff9999);
      sprite.setAlpha(1);
    } else if (state.action === 'DODGE' || state.invulnerableTimerMs > 0) {
      sprite.setTint(0x38bdf8);
      sprite.setAlpha(0.68);
    } else {
      sprite.clearTint();
      sprite.setAlpha(1);
    }
  }

  private renderCombatActionVfx(time: number): void {
    if (!this.combatFxGraphics) return;
    this.combatFxGraphics.clear();

    this.drawFighterCombatOverlay(this.matchState.player, this.playerDef, time);
    this.drawFighterCombatOverlay(
      this.matchState.opponent,
      this.opponentDef,
      time
    );
  }

  private drawFighterCombatOverlay(
    c: CombatantRuntimeState,
    def: FighterDefinition,
    time: number
  ): void {
    if (!this.combatFxGraphics) return;
    const g = this.combatFxGraphics;
    const accent = Phaser.Display.Color.HexStringToColor(def.accentColor).color;
    const secondary = Phaser.Display.Color.HexStringToColor(
      def.secondaryColor
    ).color;

    // 1. Block Shield Barrier
    if (c.action === 'BLOCK') {
      g.lineStyle(4, 0x38bdf8, 0.88);
      g.fillStyle(0x38bdf8, 0.18);
      const shieldX = c.x + c.facing * 42;
      const shieldY = c.y - 135;
      g.fillEllipse(shieldX, shieldY, 78, 205);
      g.strokeEllipse(shieldX, shieldY, 78, 205);
    }

    // 2. Special Attack Signature VFX
    if (c.action === 'SPECIAL') {
      const beamX = c.x + c.facing * 125;
      const beamY = c.y - 140;

      g.lineStyle(5, accent, 0.95);
      g.strokeEllipse(c.x + c.facing * 60, GROUND_Y, 230, 38);

      if (def.id === 'FIGHTER_008') {
        // DQ (THE SHADOW RIDER) — Electric Blue & Violet Dual-Blade X-Slash
        g.lineStyle(8, 0xa855f7, 0.95);
        g.lineBetween(beamX - 95, beamY - 75, beamX + 95, beamY + 75);
        g.lineStyle(8, 0x38bdf8, 0.95);
        g.lineBetween(beamX - 95, beamY + 75, beamX + 95, beamY - 75);
        g.fillStyle(0xe0f2fe, 0.45);
        g.fillCircle(beamX, beamY, 55);
      } else if (def.id === 'FIGHTER_009') {
        // LIVIN CHETTAN (THE SQUADRON LEGEND) — SQUADRON SURGE: Electric Blue & Cyan Forward Strike
        // 1. Electric blue charging aura surrounding Livin's body
        g.lineStyle(6, 0x00d2ff, 0.95);
        g.strokeEllipse(c.x, c.y - 120, 150 + Math.sin(time * 0.05) * 16, 220);
        // 2. Cyan forward energy surge cone & impact flash
        g.fillStyle(0x06b6d4, 0.45);
        g.fillEllipse(beamX, beamY, 230, 140);
        g.lineStyle(7, 0x22d3ee, 0.95);
        g.strokeEllipse(beamX, beamY, 245, 150);
        // 3. Short supersonic dash trail
        g.fillStyle(0x00d2ff, 0.25);
        g.fillTriangle(
          c.x - c.facing * 70, c.y - 120,
          beamX - c.facing * 30, beamY - 70,
          beamX - c.facing * 30, beamY + 70
        );
        // 4. Arc lightning branching from knuckles into impact zone
        g.lineStyle(4, 0xffffff, 0.95);
        for (let arc = 0; arc < 3; arc++) {
          const jitter1 = Math.sin(time * 0.08 + arc * 1.8) * 22;
          const jitter2 = Math.cos(time * 0.08 + arc * 2.4) * 22;
          g.lineBetween(c.x + c.facing * 40, beamY + jitter1, beamX - 20, beamY - 10 + jitter2);
          g.lineBetween(beamX - 20, beamY - 10 + jitter2, beamX + 75, beamY + jitter1 * 0.6);
        }
      } else {
        g.fillStyle(accent, 0.38);
        g.fillEllipse(beamX, beamY, 215, 130);
        g.lineStyle(6, secondary, 0.95);
        g.strokeEllipse(beamX, beamY, 230, 140);
        g.lineStyle(4, 0xffffff, 0.95);
        const jitter = Math.sin(time * 0.05) * 18;
        g.lineBetween(c.x, beamY, beamX - 40, beamY - 25 + jitter);
        g.lineBetween(
          beamX - 40,
          beamY - 25 + jitter,
          beamX + 80,
          beamY + 15 - jitter
        );
      }
    }

    // 3. Full Special Meter Aura Ring at Fighter's Feet
    if (c.energy >= 100 && c.hp > 0) {
      const pulse = 0.55 + Math.sin(time * 0.01) * 0.3;
      g.lineStyle(3, accent, pulse);
      g.strokeEllipse(c.x, GROUND_Y + 2, 136, 28);
    }
  }

  private buildArenaBackdrop(): void {
    const arena = getArenaById(this.configData.arenaId);
    const bg = this.add.graphics().setDepth(0);

    const topCol = Phaser.Display.Color.HexStringToColor(
      arena.skyGradient[0]
    ).color;
    const midCol = Phaser.Display.Color.HexStringToColor(
      arena.skyGradient[1]
    ).color;
    const botCol = Phaser.Display.Color.HexStringToColor(
      arena.skyGradient[2]
    ).color;
    const floorCol = Phaser.Display.Color.HexStringToColor(
      arena.floorColor
    ).color;
    const themeCol = Phaser.Display.Color.HexStringToColor(
      arena.themeColor
    ).color;
    const secCol = Phaser.Display.Color.HexStringToColor(
      arena.secondaryColor
    ).color;

    bg.fillGradientStyle(topCol, topCol, midCol, midCol, 1);
    bg.fillRect(0, 0, ARENA_WIDTH, 340);
    bg.fillGradientStyle(midCol, midCol, botCol, botCol, 1);
    bg.fillRect(0, 340, ARENA_WIDTH, GROUND_Y - 340);

    if (arena.id === 'ARENA_001') {
      const buildings = [
        [40, 160, 130, 400],
        [190, 110, 155, 450],
        [370, 190, 120, 370],
        [520, 130, 240, 430],
        [790, 175, 140, 385],
        [950, 105, 165, 455],
        [1135, 150, 120, 410],
      ];
      for (const [bx, by, bw, bh] of buildings) {
        bg.fillStyle(0x070b18, 0.94);
        bg.fillRect(bx, by, bw, bh);
        bg.lineStyle(2, themeCol, 0.42);
        bg.strokeRect(bx, by, bw, bh);
        bg.fillStyle(themeCol, 0.18);
        for (let wy = by + 22; wy < GROUND_Y - 55; wy += 34) {
          for (let wx = bx + 16; wx < bx + bw - 24; wx += 28) {
            bg.fillRect(wx, wy, 14, 16);
          }
        }
      }
      bg.fillStyle(secCol, 0.16);
      bg.fillRect(545, 165, 190, 64);
      bg.lineStyle(2, secCol, 0.75);
      bg.strokeRect(545, 165, 190, 64);
    } else if (arena.id === 'ARENA_002') {
      for (let x = 110; x < ARENA_WIDTH; x += 260) {
        bg.fillStyle(0x0b111a, 0.95);
        bg.fillRect(x, 80, 75, GROUND_Y - 120);
        bg.lineStyle(3, themeCol, 0.55);
        bg.strokeRect(x, 80, 75, GROUND_Y - 120);
      }
    } else if (arena.id === 'ARENA_003') {
      for (const px of [180, 460, 820, 1100]) {
        bg.fillStyle(0x110826, 0.92);
        bg.fillTriangle(
          px - 55,
          GROUND_Y - 40,
          px + 55,
          GROUND_Y - 40,
          px,
          130
        );
        bg.lineStyle(3, themeCol, 0.7);
        bg.strokeTriangle(
          px - 55,
          GROUND_Y - 40,
          px + 55,
          GROUND_Y - 40,
          px,
          130
        );
      }
    } else {
      bg.lineStyle(4, themeCol, 0.45);
      for (let i = 0; i < 10; i++) {
        bg.lineBetween(120 + i * 110, 70, 40 + i * 125, GROUND_Y - 40);
      }
    }

    this.drawParkedSuperbike(bg, 215, GROUND_Y - 38, themeCol);
    this.drawParkedSuperbike(bg, 1065, GROUND_Y - 38, secCol);

    bg.fillStyle(floorCol, 1);
    bg.fillRect(0, GROUND_Y - 35, ARENA_WIDTH, ARENA_HEIGHT - (GROUND_Y - 35));

    bg.lineStyle(2, themeCol, 0.28);
    bg.lineBetween(0, GROUND_Y - 35, ARENA_WIDTH, GROUND_Y - 35);
    bg.lineBetween(0, GROUND_Y + 25, ARENA_WIDTH, GROUND_Y + 25);
    bg.lineBetween(0, GROUND_Y + 75, ARENA_WIDTH, GROUND_Y + 75);
    for (let gx = 0; gx <= ARENA_WIDTH; gx += 128) {
      bg.lineBetween(
        gx,
        GROUND_Y - 35,
        (gx - 640) * 1.45 + 640,
        ARENA_HEIGHT
      );
    }

    this.add
      .text(ARENA_WIDTH / 2, GROUND_Y - 68, `${arena.code} // ${arena.name}`, {
        fontFamily: 'Orbitron, Rajdhani, monospace',
        fontSize: '15px',
        color: arena.themeColor,
      })
      .setOrigin(0.5)
      .setAlpha(0.55)
      .setDepth(2);
  }

  private drawParkedSuperbike(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    neonColor: number
  ): void {
    g.fillStyle(0x05070e, 0.95);
    g.fillCircle(cx - 46, cy, 24);
    g.fillCircle(cx + 46, cy, 24);
    g.lineStyle(3, neonColor, 0.75);
    g.strokeCircle(cx - 46, cy, 18);
    g.strokeCircle(cx + 46, cy, 18);
    g.fillStyle(0x0f172a, 0.95);
    g.fillTriangle(cx - 40, cy, cx + 10, cy - 42, cx + 42, cy - 8);
    g.lineStyle(3, neonColor, 0.85);
    g.lineBetween(cx - 20, cy - 18, cx + 32, cy - 28);
  }

  private renderDynamicArenaFx(time: number): void {
    if (!this.arenaFxGraphics) return;
    const arena = getArenaById(this.configData.arenaId);
    const themeCol = Phaser.Display.Color.HexStringToColor(
      arena.themeColor
    ).color;
    const secCol = Phaser.Display.Color.HexStringToColor(
      arena.secondaryColor
    ).color;

    this.arenaFxGraphics.clear();
    const pulse = 0.35 + Math.sin(time * 0.004) * 0.25;
    this.arenaFxGraphics.lineStyle(3, themeCol, pulse);
    this.arenaFxGraphics.lineBetween(
      60,
      GROUND_Y - 34,
      ARENA_WIDTH - 60,
      GROUND_Y - 34
    );

    // Interactive Superbike Headlight Beams when combos or specials trigger!
    if (this.bikeHeadlightPulseMs > 0) {
      const beamAlpha = 0.22 + Math.sin(time * 0.03) * 0.12;
      this.arenaFxGraphics.fillStyle(themeCol, beamAlpha);
      this.arenaFxGraphics.fillTriangle(
        255,
        GROUND_Y - 46,
        540,
        GROUND_Y - 120,
        540,
        GROUND_Y - 10
      );
      this.arenaFxGraphics.fillStyle(secCol, beamAlpha);
      this.arenaFxGraphics.fillTriangle(
        1025,
        GROUND_Y - 46,
        740,
        GROUND_Y - 120,
        740,
        GROUND_Y - 10
      );
    }

    this.arenaFxGraphics.fillStyle(secCol, pulse);
    this.arenaFxGraphics.fillCircle(95, GROUND_Y - 34, 6);
    this.arenaFxGraphics.fillCircle(1185, GROUND_Y - 34, 6);
  }
}
