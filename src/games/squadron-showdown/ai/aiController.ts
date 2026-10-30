import {
  AIState,
  CombatantRuntimeState,
  CombatInputFrame,
  DifficultyLevel,
} from '../types';
import { EMPTY_INPUT, SPECIAL_ENERGY_COST } from '../combat/combatEngine';

export interface AIControllerConfig {
  decisionIntervalMs: number;
  aggression: number;       // 0 to 1
  blockProbability: number; // 0 to 1
  dodgeProbability: number; // 0 to 1
  specialProbability: number; // 0 to 1
  kickRatio: number;        // 0 to 1
}

export const AI_DIFFICULTY_PROFILES: Record<DifficultyLevel, AIControllerConfig> = {
  EASY: {
    decisionIntervalMs: 420,
    aggression: 0.42,
    blockProbability: 0.18,
    dodgeProbability: 0.1,
    specialProbability: 0.25,
    kickRatio: 0.3,
  },
  MEDIUM: {
    decisionIntervalMs: 240,
    aggression: 0.68,
    blockProbability: 0.45,
    dodgeProbability: 0.32,
    specialProbability: 0.65,
    kickRatio: 0.45,
  },
  HARD: {
    decisionIntervalMs: 135,
    aggression: 0.88,
    blockProbability: 0.72,
    dodgeProbability: 0.55,
    specialProbability: 0.9,
    kickRatio: 0.55,
  },
};

export class SquadronAIController {
  public currentState: AIState = 'IDLE';
  private difficulty: DifficultyLevel;
  private decisionTimerMs = 0;
  private stateHoldMs = 0;
  private rng: () => number;

  constructor(difficulty: DifficultyLevel = 'MEDIUM', customRng?: () => number) {
    this.difficulty = difficulty;
    this.rng = customRng || Math.random;
  }

  public setDifficulty(difficulty: DifficultyLevel): void {
    this.difficulty = difficulty;
  }

  public getDifficulty(): DifficultyLevel {
    return this.difficulty;
  }

  public reset(): void {
    this.currentState = 'IDLE';
    this.decisionTimerMs = 0;
    this.stateHoldMs = 0;
  }

  public computeNextInput(
    ai: CombatantRuntimeState,
    player: CombatantRuntimeState,
    dtMs: number,
    isTrainingDummy = false
  ): CombatInputFrame {
    // AI must never act when defeated or stunned
    if (ai.hp <= 0 || ai.hitStunTimerMs > 0) {
      this.currentState = 'RECOVER';
      return { ...EMPTY_INPUT };
    }

    if (isTrainingDummy) {
      this.currentState = 'IDLE';
      return { ...EMPTY_INPUT };
    }

    const profile = AI_DIFFICULTY_PROFILES[this.difficulty];
    this.decisionTimerMs += dtMs;
    this.stateHoldMs = Math.max(0, this.stateHoldMs - dtMs);

    const dx = player.x - ai.x;
    const distance = Math.abs(dx);
    const dirToPlayer = dx >= 0 ? 1 : -1;
    const playerIsAttacking =
      player.action === 'PUNCH' ||
      player.action === 'KICK' ||
      player.action === 'SPECIAL';

    // Re-evaluate FSM state on reaction interval
    if (this.decisionTimerMs >= profile.decisionIntervalMs && this.stateHoldMs <= 0) {
      this.decisionTimerMs = 0;
      this.transitionState(ai, player, distance, playerIsAttacking, profile);
    }

    return this.buildInputForCurrentState(ai, dirToPlayer, distance, profile);
  }

  private transitionState(
    ai: CombatantRuntimeState,
    player: CombatantRuntimeState,
    distance: number,
    playerIsAttacking: boolean,
    profile: AIControllerConfig
  ): void {
    // 1. Low stamina recovery behavior
    if (ai.stamina < 22) {
      this.currentState = distance < 220 ? 'RETREAT' : 'RECOVER';
      this.stateHoldMs = 260;
      return;
    }

    // 2. Defensive reaction if player is attacking within threat range
    if (playerIsAttacking && distance < 210) {
      const roll = this.rng();
      if (roll < profile.dodgeProbability && ai.stamina >= 22 && ai.dodgeCooldownMs <= 0) {
        this.currentState = 'DODGE';
        this.stateHoldMs = 180;
        return;
      }
      if (roll < profile.dodgeProbability + profile.blockProbability) {
        this.currentState = 'BLOCK';
        this.stateHoldMs = 280;
        return;
      }
    }

    // 3. Special attack opportunity when energy is full and within strike range
    if (
      ai.energy >= SPECIAL_ENERGY_COST &&
      ai.specialCooldownMs <= 0 &&
      distance <= 245 &&
      this.rng() < profile.specialProbability
    ) {
      this.currentState = 'SPECIAL';
      this.stateHoldMs = 200;
      return;
    }

    // 4. Close range combat
    if (distance <= 145) {
      const roll = this.rng();
      if (roll < profile.aggression) {
        this.currentState = 'ATTACK';
        this.stateHoldMs = 150;
      } else if (roll < profile.aggression + 0.18) {
        this.currentState = 'RETREAT';
        this.stateHoldMs = 220;
      } else {
        this.currentState = 'BLOCK';
        this.stateHoldMs = 200;
      }
      return;
    }

    // 5. Mid/Far range spacing
    if (distance > 145) {
      const roll = this.rng();
      if (roll < profile.aggression + 0.15) {
        this.currentState = 'APPROACH';
        this.stateHoldMs = 240;
      } else if (roll < profile.aggression + 0.25 && player.y < 540) {
        this.currentState = 'JUMP';
        this.stateHoldMs = 180;
      } else {
        this.currentState = 'IDLE';
        this.stateHoldMs = 180;
      }
    }
  }

  private buildInputForCurrentState(
    ai: CombatantRuntimeState,
    dirToPlayer: 1 | -1,
    distance: number,
    profile: AIControllerConfig
  ): CombatInputFrame {
    const input: CombatInputFrame = { ...EMPTY_INPUT };

    switch (this.currentState) {
      case 'APPROACH':
        if (dirToPlayer === 1) input.right = true;
        else input.left = true;
        break;

      case 'RETREAT':
        if (dirToPlayer === 1) input.left = true;
        else input.right = true;
        break;

      case 'BLOCK':
        input.block = true;
        break;

      case 'DODGE':
        input.dodge = true;
        if (dirToPlayer === 1) input.left = true;
        else input.right = true;
        this.currentState = 'IDLE';
        break;

      case 'JUMP':
        input.up = true;
        if (dirToPlayer === 1) input.right = true;
        else input.left = true;
        this.currentState = 'APPROACH';
        break;

      case 'SPECIAL':
        if (ai.energy >= SPECIAL_ENERGY_COST && ai.specialCooldownMs <= 0) {
          input.special = true;
        } else {
          input.punch = true;
        }
        this.currentState = 'IDLE';
        this.stateHoldMs = profile.decisionIntervalMs * 1.5;
        break;

      case 'ATTACK':
        if (distance <= 155) {
          if (this.rng() < profile.kickRatio && ai.stamina >= 18) {
            input.kick = true;
          } else {
            input.punch = true;
          }
          this.currentState = 'IDLE';
          this.stateHoldMs = profile.decisionIntervalMs * 1.4;
        } else {
          if (dirToPlayer === 1) input.right = true;
          else input.left = true;
        }
        break;

      case 'RECOVER':
      case 'IDLE':
      default:
        break;
    }

    return input;
  }
}
