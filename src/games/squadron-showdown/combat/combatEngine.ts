import {
  BattleMatchState,
  CombatantRuntimeState,
  CombatHitEvent,
  CombatInputFrame,
  DifficultyLevel,
} from '../types';
import { getFighterById } from '../characters/roster';

export const ARENA_WIDTH = 1280;
export const ARENA_HEIGHT = 720;
export const GROUND_Y = 595;
export const LEFT_BOUND = 95;
export const RIGHT_BOUND = 1185;
export const FIGHTER_HURTBOX_WIDTH = 92;
export const FIGHTER_HURTBOX_HEIGHT = 230;
export const MIN_FIGHTER_SEPARATION = 74;
export const GRAVITY_PX_PER_S2 = 2200;
export const JUMP_VELOCITY_Y = -880;

export const PUNCH_STAMINA_COST = 10;
export const KICK_STAMINA_COST = 16;
export const DODGE_STAMINA_COST = 20;
export const SPECIAL_ENERGY_COST = 100;

export const EMPTY_INPUT: CombatInputFrame = {
  left: false,
  right: false,
  up: false,
  down: false,
  punch: false,
  kick: false,
  block: false,
  dodge: false,
  special: false,
};

export function createCombatantState(
  fighterId: string,
  isAI: boolean,
  spawnX: number,
  facing: 1 | -1
): CombatantRuntimeState {
  const def = getFighterById(fighterId);
  const maxHp = Math.round(180 + (def.stats.defense - 70) * 0.8);
  const maxStamina = Math.round(100 + (def.stats.stamina - 75) * 0.6);

  return {
    fighterId,
    isAI,
    x: spawnX,
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    facing,
    hp: maxHp,
    maxHp,
    stamina: maxStamina,
    maxStamina,
    energy: 35, // Start with a tactical charge so players can build up to Special quickly
    maxEnergy: 100,
    action: 'IDLE',
    actionTimerMs: 0,
    actionDurationMs: 0,
    hitStunTimerMs: 0,
    invulnerableTimerMs: 0,
    specialCooldownMs: 0,
    attackCooldownMs: 0,
    dodgeCooldownMs: 0,
    comboCount: 0,
    comboTimerMs: 0,
    activeAttack: null,
    damageDealt: 0,
    damageReceived: 0,
    successfulHits: 0,
    specialsUsed: 0,
    blocksSucceeded: 0,
  };
}

export function createInitialMatchState(params: {
  playerFighterId: string;
  opponentFighterId: string;
  arenaId: string;
  difficulty: DifficultyLevel;
  isTrainingMode?: boolean;
  roundTimeSeconds?: number;
}): BattleMatchState {
  const roundSeconds = params.roundTimeSeconds ?? 90;
  return {
    phase: 'COUNTDOWN',
    countdownSeconds: 3,
    timerSeconds: roundSeconds,
    maxTimerSeconds: roundSeconds,
    elapsedMs: 0,
    player: createCombatantState(params.playerFighterId, false, 340, 1),
    opponent: createCombatantState(params.opponentFighterId, true, 940, -1),
    winner: null,
    winReason: null,
    isTrainingMode: Boolean(params.isTrainingMode),
    difficulty: params.difficulty,
    arenaId: params.arenaId,
    recentEvents: [],
  };
}

export function canPerformAttack(c: CombatantRuntimeState): boolean {
  if (c.hp <= 0) return false;
  if (c.hitStunTimerMs > 0) return false;
  if (
    c.action === 'HIT_STUN' ||
    c.action === 'KNOCKDOWN' ||
    c.action === 'DEFEAT' ||
    c.action === 'VICTORY' ||
    c.action === 'SPECIAL' ||
    c.action === 'DODGE'
  ) {
    return false;
  }
  // Allow Gatling / Combo Cancel after 45% of a Punch or Kick animation
  if (c.action === 'PUNCH' || c.action === 'KICK') {
    return c.actionTimerMs >= c.actionDurationMs * 0.45;
  }
  if (c.attackCooldownMs > 0) return false;
  return true;
}

function startFighterAttack(
  c: CombatantRuntimeState,
  type: 'PUNCH' | 'KICK' | 'SPECIAL',
  matchElapsedMs: number
): void {
  const def = getFighterById(c.fighterId);
  const strScale = 0.75 + (def.stats.strength / 100) * 0.55;

  if (type === 'PUNCH') {
    c.stamina = Math.max(0, c.stamina - PUNCH_STAMINA_COST);
    c.action = 'PUNCH';
    c.actionTimerMs = 0;
    c.actionDurationMs = 310;
    c.attackCooldownMs = 240;
    const reach = 132;
    c.activeAttack = {
      id: `${c.fighterId}_PUNCH_${matchElapsedMs}`,
      type: 'PUNCH',
      x: c.facing === 1 ? c.x + 25 : c.x - 25 - reach,
      y: c.y - 185,
      width: reach,
      height: 85,
      damage: Math.round(9 * strScale),
      staminaDamage: 6,
      knockbackX: c.facing * 150,
      knockbackY: -40,
      hitStunMs: 220,
      hasHitTarget: false,
    };
  } else if (type === 'KICK') {
    c.stamina = Math.max(0, c.stamina - KICK_STAMINA_COST);
    c.action = 'KICK';
    c.actionTimerMs = 0;
    c.actionDurationMs = 410;
    c.attackCooldownMs = 320;
    const reach = 162;
    c.activeAttack = {
      id: `${c.fighterId}_KICK_${matchElapsedMs}`,
      type: 'KICK',
      x: c.facing === 1 ? c.x + 25 : c.x - 25 - reach,
      y: c.y - 175,
      width: reach,
      height: 98,
      damage: Math.round(14 * strScale),
      staminaDamage: 12,
      knockbackX: c.facing * 230,
      knockbackY: -110,
      hitStunMs: 280,
      hasHitTarget: false,
    };
  } else {
    // SPECIAL ATTACK
    c.energy = 0;
    c.specialCooldownMs = 3000;
    c.attackCooldownMs = 820;
    c.action = 'SPECIAL';
    c.actionTimerMs = 0;
    c.actionDurationMs = 560;
    c.specialsUsed += 1;
    // Forward dash boost on special
    c.vx = c.facing * (280 + def.stats.speed * 1.6);
    const reach = 215;
    c.activeAttack = {
      id: `${c.fighterId}_SPECIAL_${matchElapsedMs}`,
      type: 'SPECIAL',
      x: c.facing === 1 ? c.x + 10 : c.x - 10 - reach,
      y: c.y - 210,
      width: reach,
      height: 155,
      damage: Math.round(26 * strScale),
      staminaDamage: 24,
      knockbackX: c.facing * 350,
      knockbackY: -210,
      hitStunMs: 380,
      hasHitTarget: false,
    };
  }
}

function updateSingleCombatant(
  c: CombatantRuntimeState,
  opponent: CombatantRuntimeState,
  input: CombatInputFrame,
  dtMs: number,
  matchElapsedMs: number,
  isTrainingMode: boolean
): void {
  const dtSec = dtMs / 1000;
  const def = getFighterById(c.fighterId);

  // Cooldowns & timers
  c.attackCooldownMs = Math.max(0, c.attackCooldownMs - dtMs);
  c.specialCooldownMs = Math.max(0, c.specialCooldownMs - dtMs);
  c.dodgeCooldownMs = Math.max(0, c.dodgeCooldownMs - dtMs);
  c.invulnerableTimerMs = Math.max(0, c.invulnerableTimerMs - dtMs);

  if (c.comboTimerMs > 0) {
    c.comboTimerMs = Math.max(0, c.comboTimerMs - dtMs);
    if (c.comboTimerMs === 0) {
      c.comboCount = 0;
    }
  }

  // Always face opponent when not locked into an attack or dodge
  if (
    c.action !== 'PUNCH' &&
    c.action !== 'KICK' &&
    c.action !== 'SPECIAL' &&
    c.action !== 'DODGE' &&
    c.hp > 0
  ) {
    c.facing = opponent.x >= c.x ? 1 : -1;
  }

  // Hit stun recovery
  if (c.hitStunTimerMs > 0) {
    c.hitStunTimerMs = Math.max(0, c.hitStunTimerMs - dtMs);
    c.activeAttack = null;
    if (c.hitStunTimerMs === 0 && c.hp > 0) {
      c.action = 'IDLE';
    }
  }

  // Action progress timer
  if (
    c.action === 'PUNCH' ||
    c.action === 'KICK' ||
    c.action === 'SPECIAL' ||
    c.action === 'DODGE'
  ) {
    c.actionTimerMs += dtMs;
    // Update active hitbox position to follow fighter
    if (c.activeAttack) {
      const reach = c.activeAttack.width;
      c.activeAttack.x = c.facing === 1 ? c.x + 20 : c.x - 20 - reach;
      c.activeAttack.y = c.y - (c.activeAttack.type === 'SPECIAL' ? 210 : 185);
    }
    if (c.actionTimerMs >= c.actionDurationMs) {
      c.action = 'IDLE';
      c.actionTimerMs = 0;
      c.activeAttack = null;
    }
  }

  // Passive stamina regeneration when not attacking or dodging
  if (
    c.action === 'IDLE' ||
    c.action === 'WALK_FORWARD' ||
    c.action === 'WALK_BACKWARD' ||
    c.action === 'CROUCH'
  ) {
    const regenRate = 18 + (def.stats.stamina / 100) * 10;
    c.stamina = Math.min(c.maxStamina, c.stamina + regenRate * dtSec);
  }

  if (isTrainingMode) {
    c.stamina = c.maxStamina;
    if (!c.isAI) {
      c.energy = c.maxEnergy;
    }
  }

  // Process inputs if fighter is free to act
  if (c.hp > 0 && c.hitStunTimerMs <= 0) {
    const canAct = canPerformAttack(c);

    if (canAct && input.special && c.energy >= SPECIAL_ENERGY_COST && c.specialCooldownMs <= 0) {
      startFighterAttack(c, 'SPECIAL', matchElapsedMs);
    } else if (canAct && input.dodge && c.stamina >= DODGE_STAMINA_COST && c.dodgeCooldownMs <= 0) {
      c.stamina = Math.max(0, c.stamina - DODGE_STAMINA_COST);
      c.action = 'DODGE';
      c.actionTimerMs = 0;
      c.actionDurationMs = 270;
      c.dodgeCooldownMs = 650;
      c.invulnerableTimerMs = 230;
      const dodgeDir = input.left ? -1 : input.right ? 1 : -c.facing;
      c.vx = dodgeDir * (480 + def.stats.speed * 2.2);
    } else if (canAct && input.kick && c.stamina >= KICK_STAMINA_COST) {
      startFighterAttack(c, 'KICK', matchElapsedMs);
    } else if (canAct && input.punch && c.stamina >= PUNCH_STAMINA_COST) {
      startFighterAttack(c, 'PUNCH', matchElapsedMs);
    } else if (
      c.action !== 'PUNCH' &&
      c.action !== 'KICK' &&
      c.action !== 'SPECIAL' &&
      c.action !== 'DODGE'
    ) {
      if (input.block && c.stamina > 4) {
        c.action = 'BLOCK';
        c.vx *= 0.65;
      } else {
        const moveSpeed = 240 + def.stats.speed * 2.1;
        if (input.up && c.y >= GROUND_Y - 2) {
          c.vy = JUMP_VELOCITY_Y;
          c.action = 'JUMP';
        }

        if (input.left && !input.right) {
          c.vx = -moveSpeed;
          if (c.y >= GROUND_Y - 2) {
            c.action = c.facing === -1 ? 'WALK_FORWARD' : 'WALK_BACKWARD';
          }
        } else if (input.right && !input.left) {
          c.vx = moveSpeed;
          if (c.y >= GROUND_Y - 2) {
            c.action = c.facing === 1 ? 'WALK_FORWARD' : 'WALK_BACKWARD';
          }
        } else {
          c.vx *= 0.72;
          if (Math.abs(c.vx) < 8) c.vx = 0;
          if (c.y >= GROUND_Y - 2) {
            c.action = input.down ? 'CROUCH' : 'IDLE';
          }
        }
      }
    }
  }

  // Apply horizontal friction during attacks/stun
  if (c.action === 'PUNCH' || c.action === 'KICK' || c.hitStunTimerMs > 0) {
    c.vx *= 0.85;
  }

  // Integrate physics
  c.x += c.vx * dtSec;
  c.y += c.vy * dtSec;

  if (c.y < GROUND_Y) {
    c.vy += GRAVITY_PX_PER_S2 * dtSec;
  } else {
    c.y = GROUND_Y;
    c.vy = 0;
    if (c.action === 'JUMP') {
      c.action = 'IDLE';
    }
  }

  // Clamp arena boundaries
  c.x = Math.max(LEFT_BOUND, Math.min(RIGHT_BOUND, c.x));
}

function boxesOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function resolveAttackCollision(
  attacker: CombatantRuntimeState,
  defender: CombatantRuntimeState,
  events: CombatHitEvent[],
  isTrainingMode: boolean
): void {
  const atk = attacker.activeAttack;
  if (!atk || atk.hasHitTarget) return;

  // Activate hit frames after brief windup (20% into attack duration)
  if (attacker.actionTimerMs < attacker.actionDurationMs * 0.18) return;

  const defX = defender.x - FIGHTER_HURTBOX_WIDTH / 2;
  const defY = defender.y - FIGHTER_HURTBOX_HEIGHT;

  if (
    !boxesOverlap(
      atk.x,
      atk.y,
      atk.width,
      atk.height,
      defX,
      defY,
      FIGHTER_HURTBOX_WIDTH,
      FIGHTER_HURTBOX_HEIGHT
    )
  ) {
    return;
  }

  // Mark attack as consumed so it never deals damage on multiple frames
  atk.hasHitTarget = true;

  const impactX = (attacker.x + defender.x) / 2;
  const impactY = defender.y - 135;

  // Dodge invulnerability check
  if (defender.invulnerableTimerMs > 0 || defender.action === 'DODGE') {
    events.push({
      attackerIsAI: attacker.isAI,
      attackType: atk.type,
      damage: 0,
      blocked: false,
      dodged: true,
      impactX,
      impactY,
    });
    return;
  }

  const defenderDef = getFighterById(defender.fighterId);
  const attackerDef = getFighterById(attacker.fighterId);
  const defenseReduction = 1 - ((defenderDef.stats.defense - 50) / 100) * 0.35;

  const isBlocking = defender.action === 'BLOCK' && defender.stamina >= 5;

  if (isBlocking) {
    // Blocked hit reduces damage by 78% and drains some block stamina
    const chipDamage = Math.max(1, Math.round(atk.damage * defenseReduction * 0.22));
    defender.hp = Math.max(0, defender.hp - chipDamage);
    defender.stamina = Math.max(0, defender.stamina - atk.staminaDamage * 0.9);
    defender.vx = atk.knockbackX * 0.35;
    defender.blocksSucceeded += 1;
    defender.energy = Math.min(defender.maxEnergy, defender.energy + 8);
    attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + 6);
    attacker.damageDealt += chipDamage;
    defender.damageReceived += chipDamage;

    const isGuardBreak = defender.stamina <= 2;
    if (isGuardBreak) {
      defender.action = 'HIT_STUN';
      defender.hitStunTimerMs = 420;
      defender.vx = atk.knockbackX * 0.85;
    }

    events.push({
      attackerIsAI: attacker.isAI,
      attackType: atk.type,
      damage: chipDamage,
      blocked: true,
      dodged: false,
      impactX,
      impactY,
      specialName: atk.type === 'SPECIAL' ? attackerDef.specialName : undefined,
      isGuardBreak,
      strikeCallout: isGuardBreak ? 'GUARD BREAK!' : 'BLOCKED',
    });
  } else {
    // Check if interrupting defender's attack startup (Counter Hit!)
    const isCounterHit =
      (defender.action === 'PUNCH' ||
        defender.action === 'KICK' ||
        defender.action === 'SPECIAL') &&
      defender.actionTimerMs < defender.actionDurationMs * 0.45;

    const nextComboCount = attacker.comboCount + 1;
    const isThirdComboFinisher = nextComboCount >= 3 && nextComboCount % 3 === 0;
    const comboMult = isThirdComboFinisher ? 1.2 : 1.0;
    const counterMult = isCounterHit ? 1.2 : 1.0;

    const finalDamage = Math.max(
      2,
      Math.round(atk.damage * defenseReduction * comboMult * counterMult)
    );
    defender.hp = Math.max(0, defender.hp - finalDamage);
    defender.hitStunTimerMs = atk.hitStunMs + (isCounterHit ? 60 : 0);
    defender.action = defender.hp <= 0 ? 'DEFEAT' : 'HIT_STUN';
    defender.activeAttack = null;
    defender.vx = atk.knockbackX * (isThirdComboFinisher ? 1.25 : 1.0);
    if (
      (atk.knockbackY < -120 || isThirdComboFinisher) &&
      defender.y >= GROUND_Y - 5
    ) {
      defender.vy = isThirdComboFinisher ? -220 : atk.knockbackY;
    }

    attacker.successfulHits += 1;
    attacker.comboCount = nextComboCount;
    attacker.comboTimerMs = 2100;
    attacker.damageDealt += finalDamage;
    defender.damageReceived += finalDamage;

    if (atk.type !== 'SPECIAL') {
      attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + 18);
    }
    defender.energy = Math.min(defender.maxEnergy, defender.energy + 12);

    const variantIdx = (nextComboCount - 1) % 3;
    let callout = '';
    if (atk.type === 'SPECIAL') {
      callout = attackerDef.specialName;
    } else if (atk.type === 'PUNCH') {
      callout =
        variantIdx === 0
          ? 'RIGHT JAB!'
          : variantIdx === 1
          ? 'POWER CROSS!'
          : 'HEAVY UPPERCUT!';
    } else {
      callout =
        variantIdx === 0
          ? 'ROUNDHOUSE KICK!'
          : variantIdx === 1
          ? 'HIGH SIDE KICK!'
          : 'SKY AXE KICK!';
    }

    events.push({
      attackerIsAI: attacker.isAI,
      attackType: atk.type,
      damage: finalDamage,
      blocked: false,
      dodged: false,
      impactX,
      impactY,
      specialName: atk.type === 'SPECIAL' ? attackerDef.specialName : undefined,
      comboCount: attacker.comboCount,
      isCounterHit,
      strikeCallout: callout,
    });
  }

  // In Training Mode, auto-refill AI dummy health if it drops to 0 so player can keep practicing
  if (isTrainingMode && defender.isAI && defender.hp <= 0) {
    defender.hp = defender.maxHp;
    defender.action = 'HIT_STUN';
  }
}

function enforceNonOverlappingFighters(
  a: CombatantRuntimeState,
  b: CombatantRuntimeState
): void {
  const dx = b.x - a.x;
  const dist = Math.abs(dx);
  if (dist < MIN_FIGHTER_SEPARATION) {
    const push = (MIN_FIGHTER_SEPARATION - dist) / 2;
    const dir = dx >= 0 ? 1 : -1;
    a.x = Math.max(LEFT_BOUND, Math.min(RIGHT_BOUND, a.x - dir * push));
    b.x = Math.max(LEFT_BOUND, Math.min(RIGHT_BOUND, b.x + dir * push));
  }
}

export function stepBattleSimulation(
  state: BattleMatchState,
  playerInput: CombatInputFrame,
  aiInput: CombatInputFrame,
  dtMs: number
): BattleMatchState {
  state.recentEvents = [];
  const clampedDt = Math.min(dtMs, 50);

  if (state.phase === 'COUNTDOWN') {
    state.elapsedMs += clampedDt;
    const remainingCountdown = Math.max(0, 3 - Math.floor(state.elapsedMs / 850));
    state.countdownSeconds = remainingCountdown;
    if (state.elapsedMs >= 2600) {
      state.phase = 'FIGHTING';
      state.elapsedMs = 0;
    }
    return state;
  }

  if (state.phase === 'FINISHED') {
    return state;
  }

  if (state.phase === 'KO_SEQUENCE') {
    state.elapsedMs += clampedDt;
    // Allow airborne bodies to land
    updateSingleCombatant(state.player, state.opponent, EMPTY_INPUT, clampedDt, state.elapsedMs, state.isTrainingMode);
    updateSingleCombatant(state.opponent, state.player, EMPTY_INPUT, clampedDt, state.elapsedMs, state.isTrainingMode);
    if (state.elapsedMs >= 1300) {
      state.phase = 'FINISHED';
    }
    return state;
  }

  // Active FIGHTING phase
  state.elapsedMs += clampedDt;

  if (!state.isTrainingMode) {
    state.timerSeconds = Math.max(
      0,
      state.maxTimerSeconds - Math.floor(state.elapsedMs / 1000)
    );
  }

  updateSingleCombatant(
    state.player,
    state.opponent,
    playerInput,
    clampedDt,
    state.elapsedMs,
    state.isTrainingMode
  );
  updateSingleCombatant(
    state.opponent,
    state.player,
    aiInput,
    clampedDt,
    state.elapsedMs,
    state.isTrainingMode
  );

  enforceNonOverlappingFighters(state.player, state.opponent);

  resolveAttackCollision(state.player, state.opponent, state.recentEvents, state.isTrainingMode);
  resolveAttackCollision(state.opponent, state.player, state.recentEvents, state.isTrainingMode);

  // Check KO / Time-Out Victory & Defeat Conditions
  if (!state.isTrainingMode) {
    if (state.player.hp <= 0 || state.opponent.hp <= 0) {
      state.phase = 'KO_SEQUENCE';
      state.elapsedMs = 0;
      state.winReason = 'KO';
      if (state.opponent.hp <= 0 && state.player.hp > 0) {
        state.winner = 'PLAYER';
        state.player.action = 'VICTORY';
        state.opponent.action = 'DEFEAT';
      } else if (state.player.hp <= 0 && state.opponent.hp > 0) {
        state.winner = 'AI';
        state.opponent.action = 'VICTORY';
        state.player.action = 'DEFEAT';
      } else {
        state.winner = 'DRAW';
      }
    } else if (state.timerSeconds <= 0) {
      state.phase = 'KO_SEQUENCE';
      state.elapsedMs = 0;
      state.winReason = 'TIME_OUT';
      const playerPct = state.player.hp / state.player.maxHp;
      const aiPct = state.opponent.hp / state.opponent.maxHp;
      if (playerPct > aiPct) {
        state.winner = 'PLAYER';
        state.player.action = 'VICTORY';
        state.opponent.action = 'DEFEAT';
      } else if (aiPct > playerPct) {
        state.winner = 'AI';
        state.opponent.action = 'VICTORY';
        state.player.action = 'DEFEAT';
      } else {
        state.winner = 'DRAW';
      }
    }
  }

  return state;
}
