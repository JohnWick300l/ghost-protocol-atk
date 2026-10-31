export type DifficultyLevel = 'EASY' | 'MEDIUM' | 'HARD';

export type AIState =
  | 'IDLE'
  | 'APPROACH'
  | 'RETREAT'
  | 'ATTACK'
  | 'BLOCK'
  | 'DODGE'
  | 'JUMP'
  | 'SPECIAL'
  | 'RECOVER';

export type FighterActionState =
  | 'IDLE'
  | 'WALK_FORWARD'
  | 'WALK_BACKWARD'
  | 'JUMP'
  | 'CROUCH'
  | 'PUNCH'
  | 'KICK'
  | 'BLOCK'
  | 'DODGE'
  | 'SPECIAL'
  | 'HIT_STUN'
  | 'KNOCKDOWN'
  | 'VICTORY'
  | 'DEFEAT';

export interface FighterStats {
  strength: number; // 0-100
  speed: number;    // 0-100
  defense: number;  // 0-100
  stamina: number;  // 0-100
}

export interface FighterDefinition {
  id: string;
  code: string;
  name: string;
  title: string;
  style: string;
  isOfficial: boolean;
  spriteAsset: string;
  cardAsset: string;
  accentColor: string;
  secondaryColor: string;
  specialName: string;
  specialDescription: string;
  tagline?: string;
  lore: string;
  stats: FighterStats;
}

export interface ArenaDefinition {
  id: string;
  code: string;
  name: string;
  subtitle: string;
  description: string;
  themeColor: string;
  secondaryColor: string;
  skyGradient: [string, string, string];
  floorColor: string;
  gridColor: string;
  ambientHazardText: string;
}

export interface ActiveAttackBox {
  id: string;
  type: 'PUNCH' | 'KICK' | 'SPECIAL';
  x: number;
  y: number;
  width: number;
  height: number;
  damage: number;
  staminaDamage: number;
  knockbackX: number;
  knockbackY: number;
  hitStunMs: number;
  hasHitTarget: boolean; // Prevents infinite damage per frame
}

export interface CombatantRuntimeState {
  fighterId: string;
  isAI: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1; // 1 = facing right, -1 = facing left
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  energy: number;
  maxEnergy: number;
  action: FighterActionState;
  actionTimerMs: number;
  actionDurationMs: number;
  hitStunTimerMs: number;
  invulnerableTimerMs: number;
  specialCooldownMs: number;
  attackCooldownMs: number;
  dodgeCooldownMs: number;
  comboCount: number;
  comboTimerMs: number;
  activeAttack: ActiveAttackBox | null;
  // Match telemetry
  damageDealt: number;
  damageReceived: number;
  successfulHits: number;
  specialsUsed: number;
  blocksSucceeded: number;
}

export interface CombatInputFrame {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  punch: boolean;
  kick: boolean;
  block: boolean;
  dodge: boolean;
  special: boolean;
}

export interface CombatHitEvent {
  attackerIsAI: boolean;
  attackType: 'PUNCH' | 'KICK' | 'SPECIAL';
  damage: number;
  blocked: boolean;
  dodged: boolean;
  impactX: number;
  impactY: number;
  specialName?: string;
  comboCount?: number;
  isCounterHit?: boolean;
  isGuardBreak?: boolean;
  isClash?: boolean;
  strikeCallout?: string;
}

export interface BattleMatchState {
  phase: 'COUNTDOWN' | 'FIGHTING' | 'KO_SEQUENCE' | 'FINISHED';
  countdownSeconds: number;
  timerSeconds: number;
  maxTimerSeconds: number;
  elapsedMs: number;
  player: CombatantRuntimeState;
  opponent: CombatantRuntimeState;
  winner: 'PLAYER' | 'AI' | 'DRAW' | null;
  winReason: 'KO' | 'TIME_OUT' | null;
  isTrainingMode: boolean;
  difficulty: DifficultyLevel;
  arenaId: string;
  recentEvents: CombatHitEvent[];
}

export interface BattleHistoryEntry {
  id: string;
  timestamp: string;
  playerFighterId: string;
  opponentFighterId: string;
  arenaId: string;
  difficulty: DifficultyLevel;
  result: 'VICTORY' | 'DEFEAT' | 'DRAW';
  winReason: 'KO' | 'TIME_OUT';
  durationSeconds: number;
  damageDealt: number;
  damageReceived: number;
  successfulAttacks: number;
  specialMovesUsed: number;
  xpEarned: number;
}

export interface FighterUsageRecord {
  fighterId: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  totalDamageDealt: number;
}

export interface PlayerProgressionProfile {
  totalBattles: number;
  totalWins: number;
  totalLosses: number;
  xp: number;
  level: number;
  unlockedArenaIds: string[];
  unlockedBannerTitles: string[];
  selectedBannerTitle: string;
  fighterUsage: Record<string, FighterUsageRecord>;
  battleHistory: BattleHistoryEntry[];
}

export interface SquadronGameSettings {
  musicVolume: number; // 0 to 1
  sfxVolume: number;   // 0 to 1
  muted: boolean;
  defaultDifficulty: DifficultyLevel;
  showTouchControlsOnDesktop: boolean;
  allowMirrorMatchInArena: boolean;
}
