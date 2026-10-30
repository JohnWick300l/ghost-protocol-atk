import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SQUADRON_ROSTER,
  OFFICIAL_FIGHTERS,
  BONUS_FIGHTERS,
  getFighterById,
} from './characters/roster';
import { SQUADRON_ARENAS, getArenaById } from './arenas/arenas';
import {
  EMPTY_INPUT,
  LEFT_BOUND,
  RIGHT_BOUND,
  MIN_FIGHTER_SEPARATION,
  canPerformAttack,
  createInitialMatchState,
  stepBattleSimulation,
} from './combat/combatEngine';
import { SquadronAIController, AI_DIFFICULTY_PROFILES } from './ai/aiController';
import {
  DEFAULT_PROGRESSION_PROFILE,
  applyMatchToProfile,
  calculateLevelFromXp,
  calculateMatchXp,
  getFavouriteFighterId,
} from './storage/progressionStorage';

describe('SQUADRON SHOWDOWN — Roster & Arena Integrity', () => {
  it('contains all 9 official fighters (FIGHTER_001 to FIGHTER_009) with exact stats and specials', () => {
    assert.equal(OFFICIAL_FIGHTERS.length, 9);
    assert.equal(BONUS_FIGHTERS.length, 4);
    assert.equal(SQUADRON_ROSTER.length, 13);

    const naresh = getFighterById('FIGHTER_001');
    assert.equal(naresh.name, 'NARESH');
    assert.equal(naresh.specialName, 'THUNDER PUNCH');
    assert.deepEqual(naresh.stats, { strength: 80, speed: 80, defense: 75, stamina: 80 });

    const dheeraj = getFighterById('FIGHTER_002');
    assert.equal(dheeraj.name, 'DHEERAJ');
    assert.equal(dheeraj.specialName, 'PRECISION STRIKE');
    assert.deepEqual(dheeraj.stats, { strength: 75, speed: 80, defense: 80, stamina: 75 });

    const vijay = getFighterById('FIGHTER_003');
    assert.equal(vijay.name, 'VIJAY');
    assert.equal(vijay.specialName, 'PHANTOM DASH');
    assert.deepEqual(vijay.stats, { strength: 70, speed: 95, defense: 65, stamina: 80 });

    const abhiyan = getFighterById('FIGHTER_004');
    assert.equal(abhiyan.name, 'ABHIYAN');
    assert.equal(abhiyan.specialName, 'REDLINE OVERDRIVE');
    assert.deepEqual(abhiyan.stats, { strength: 95, speed: 80, defense: 90, stamina: 85 });

    const lexi = getFighterById('FIGHTER_005');
    assert.equal(lexi.name, 'LEXI');
    assert.equal(lexi.specialName, 'VOLTAGE KICK');
    assert.deepEqual(lexi.stats, { strength: 75, speed: 90, defense: 75, stamina: 85 });

    const penguin = getFighterById('FIGHTER_006');
    assert.equal(penguin.name, 'PENGUIN BHAI');
    assert.equal(penguin.specialName, 'BELLY BOUNCE');
    assert.deepEqual(penguin.stats, { strength: 65, speed: 85, defense: 70, stamina: 100 });

    const girimon = getFighterById('FIGHTER_007');
    assert.equal(girimon.name, 'GIRIMON');
    assert.equal(girimon.specialName, 'ELECTRIC IMPACT');
    assert.deepEqual(girimon.stats, { strength: 80, speed: 75, defense: 85, stamina: 85 });

    const dq = getFighterById('FIGHTER_008');
    assert.equal(dq.name, 'DQ (THE SHADOW RIDER)');
    assert.equal(dq.specialName, 'SHADOW STRIKE');
    assert.deepEqual(dq.stats, { strength: 85, speed: 90, defense: 80, stamina: 85 });

    const livin = getFighterById('FIGHTER_009');
    assert.equal(livin.name, 'LIVIN CHETTAN');
    assert.equal(livin.title, 'THE SQUADRON LEGEND');
    assert.equal(livin.style, 'BALANCED SQUADRON FIGHTER');
    assert.equal(livin.isOfficial, true);
    assert.equal(livin.specialName, 'SQUADRON SURGE');
    assert.deepEqual(livin.stats, { strength: 80, speed: 85, defense: 80, stamina: 85 });
  });

  it('executes Livin Chettan SQUADRON SURGE special attack with energy consumption, forward dash, and knockback', () => {
    const state = createInitialMatchState({
      playerFighterId: 'FIGHTER_009',
      opponentFighterId: 'FIGHTER_008',
      arenaId: 'ARENA_001',
      difficulty: 'MEDIUM',
    });
    state.phase = 'FIGHTING';
    state.player.energy = 100;
    state.player.x = 500;
    state.opponent.x = 620;
    const prevOppHp = state.opponent.hp;

    stepBattleSimulation(state, { ...EMPTY_INPUT, special: true }, EMPTY_INPUT, 20);
    assert.equal(state.player.action, 'SPECIAL');
    assert.equal(state.player.energy, 0);
    assert.ok(state.player.specialCooldownMs > 0);
    assert.ok(state.player.vx > 0, 'Expected forward dash velocity during SQUADRON SURGE');

    for (let i = 0; i < 6; i++) {
      stepBattleSimulation(state, EMPTY_INPUT, EMPTY_INPUT, 20);
    }
    assert.ok(state.opponent.hp < prevOppHp, 'Expected SQUADRON SURGE hitbox to deal damage');
  });

  it('contains all 4 official battle arenas', () => {
    assert.equal(SQUADRON_ARENAS.length, 4);
    assert.equal(getArenaById('ARENA_001').name, 'NEON CITY');
    assert.equal(getArenaById('ARENA_002').name, 'ELECTRIC FACTORY');
    assert.equal(getArenaById('ARENA_003').name, 'SUPERNOVA STATION');
    assert.equal(getArenaById('ARENA_004').name, 'MIDNIGHT HIGHWAY');
  });
});

describe('SQUADRON SHOWDOWN — 2D Combat Engine & Physics', () => {
  it('transitions from COUNTDOWN to FIGHTING after intro sequence', () => {
    const state = createInitialMatchState({
      playerFighterId: 'FIGHTER_001',
      opponentFighterId: 'FIGHTER_008',
      arenaId: 'ARENA_001',
      difficulty: 'MEDIUM',
    });
    assert.equal(state.phase, 'COUNTDOWN');

    for (let i = 0; i < 60; i++) {
      stepBattleSimulation(state, EMPTY_INPUT, EMPTY_INPUT, 50);
    }
    assert.equal(state.phase, 'FIGHTING');
  });

  it('prevents an attack from hitting multiple times across consecutive frames', () => {
    const state = createInitialMatchState({
      playerFighterId: 'FIGHTER_004',
      opponentFighterId: 'FIGHTER_001',
      arenaId: 'ARENA_001',
      difficulty: 'EASY',
    });
    state.phase = 'FIGHTING';
    state.player.x = 500;
    state.opponent.x = 585;

    const initialOpponentHp = state.opponent.hp;

    // Trigger a single punch on frame 1
    stepBattleSimulation(
      state,
      { ...EMPTY_INPUT, punch: true },
      EMPTY_INPUT,
      20
    );

    // Advance 15 frames during the same punch animation
    for (let i = 0; i < 15; i++) {
      stepBattleSimulation(state, EMPTY_INPUT, EMPTY_INPUT, 20);
    }

    assert.equal(state.player.successfulHits, 1);
    assert.ok(state.opponent.hp < initialOpponentHp);
  });

  it('reduces incoming damage when opponent is blocking', () => {
    const unblockedState = createInitialMatchState({
      playerFighterId: 'FIGHTER_001',
      opponentFighterId: 'FIGHTER_002',
      arenaId: 'ARENA_001',
      difficulty: 'MEDIUM',
    });
    unblockedState.phase = 'FIGHTING';
    unblockedState.player.x = 500;
    unblockedState.opponent.x = 590;

    stepBattleSimulation(unblockedState, { ...EMPTY_INPUT, kick: true }, EMPTY_INPUT, 25);
    for (let i = 0; i < 12; i++) {
      stepBattleSimulation(unblockedState, EMPTY_INPUT, EMPTY_INPUT, 25);
    }
    const unblockedDamage = unblockedState.player.damageDealt;

    const blockedState = createInitialMatchState({
      playerFighterId: 'FIGHTER_001',
      opponentFighterId: 'FIGHTER_002',
      arenaId: 'ARENA_001',
      difficulty: 'MEDIUM',
    });
    blockedState.phase = 'FIGHTING';
    blockedState.player.x = 500;
    blockedState.opponent.x = 590;

    const blockInput = { ...EMPTY_INPUT, block: true };
    stepBattleSimulation(blockedState, { ...EMPTY_INPUT, kick: true }, blockInput, 25);
    for (let i = 0; i < 12; i++) {
      stepBattleSimulation(blockedState, EMPTY_INPUT, blockInput, 25);
    }
    const blockedDamage = blockedState.player.damageDealt;

    assert.ok(unblockedDamage > blockedDamage);
    assert.equal(blockedState.opponent.blocksSucceeded, 1);
  });

  it('prevents stunned or defeated fighters from attacking and clamps arena boundaries', () => {
    const state = createInitialMatchState({
      playerFighterId: 'FIGHTER_008',
      opponentFighterId: 'FIGHTER_003',
      arenaId: 'ARENA_004',
      difficulty: 'HARD',
    });
    state.phase = 'FIGHTING';
    state.player.hitStunTimerMs = 200;
    assert.equal(canPerformAttack(state.player), false);

    state.player.hitStunTimerMs = 0;
    state.player.hp = 0;
    assert.equal(canPerformAttack(state.player), false);

    // Boundary & overlap enforcement
    state.player.hp = 100;
    state.player.x = -500;
    state.opponent.x = 5000;
    stepBattleSimulation(state, EMPTY_INPUT, EMPTY_INPUT, 20);
    assert.ok(state.player.x >= LEFT_BOUND);
    assert.ok(state.opponent.x <= RIGHT_BOUND);

    state.player.x = 600;
    state.opponent.x = 610;
    stepBattleSimulation(state, EMPTY_INPUT, EMPTY_INPUT, 20);
    assert.ok(Math.abs(state.opponent.x - state.player.x) >= MIN_FIGHTER_SEPARATION - 1);
  });
});

describe('SQUADRON SHOWDOWN — AI Finite State Machine', () => {
  it('defines distinct decision intervals and aggression for EASY, MEDIUM, and HARD', () => {
    assert.ok(
      AI_DIFFICULTY_PROFILES.EASY.decisionIntervalMs >
        AI_DIFFICULTY_PROFILES.MEDIUM.decisionIntervalMs
    );
    assert.ok(
      AI_DIFFICULTY_PROFILES.MEDIUM.decisionIntervalMs >
        AI_DIFFICULTY_PROFILES.HARD.decisionIntervalMs
    );
    assert.ok(
      AI_DIFFICULTY_PROFILES.HARD.aggression >
        AI_DIFFICULTY_PROFILES.EASY.aggression
    );
  });

  it('never issues attack inputs when AI is knocked out or stunned', () => {
    const aiCtrl = new SquadronAIController('HARD', () => 0.1);
    const state = createInitialMatchState({
      playerFighterId: 'FIGHTER_001',
      opponentFighterId: 'FIGHTER_008',
      arenaId: 'ARENA_001',
      difficulty: 'HARD',
    });
    state.opponent.hp = 0;
    const koInput = aiCtrl.computeNextInput(state.opponent, state.player, 200);
    assert.equal(koInput.punch, false);
    assert.equal(koInput.kick, false);
    assert.equal(koInput.special, false);
  });
});

describe('SQUADRON SHOWDOWN — Offline Progression & Telemetry', () => {
  it('computes match XP and updates profile wins, level, and battle history', () => {
    const xp = calculateMatchXp({
      result: 'VICTORY',
      difficulty: 'HARD',
      winReason: 'KO',
      successfulAttacks: 8,
      specialMovesUsed: 2,
    });
    assert.ok(xp > 150);

    const updated = applyMatchToProfile(DEFAULT_PROGRESSION_PROFILE, {
      id: 'm1',
      timestamp: new Date().toISOString(),
      playerFighterId: 'FIGHTER_008',
      opponentFighterId: 'FIGHTER_001',
      arenaId: 'ARENA_001',
      difficulty: 'HARD',
      result: 'VICTORY',
      winReason: 'KO',
      durationSeconds: 34,
      damageDealt: 105,
      damageReceived: 40,
      successfulAttacks: 8,
      specialMovesUsed: 2,
      xpEarned: 300,
    });

    assert.equal(updated.totalBattles, 1);
    assert.equal(updated.totalWins, 1);
    assert.equal(updated.level, calculateLevelFromXp(300));
    assert.equal(getFavouriteFighterId(updated), 'FIGHTER_008');
  });
});

import {
  CHARACTER_ANATOMICAL_PROFILES,
  computeArticulatedLimbJoints,
  computeFighterRigPose,
  getCharacterAnatomicalProfile,
} from './animation/fighterRig';

describe('SQUADRON SHOWDOWN — Articulated Fighter Kinematic Rig (Physical Punch & Kick)', () => {
  it('defines scanned anatomical hand/arm and leg/boot profiles for all 12 fighters and computes 2-joint hand & foot strikes', () => {
    for (const fighter of SQUADRON_ROSTER) {
      const profile = getCharacterAnatomicalProfile(fighter.id);
      assert.equal(profile.fighterId, fighter.id);
      assert.ok(CHARACTER_ANATOMICAL_PROFILES[fighter.id]);

      const punchPose = computeFighterRigPose('PUNCH', 120, 260, 0, 1000, false);
      const punchJoints = computeArticulatedLimbJoints(punchPose, profile);
      // Verify shoulder -> elbow -> wrist -> fistCenter extend progressively forward toward the opponent
      assert.ok(
        punchJoints.elbow.x > punchJoints.shoulder.x + 25,
        `Expected ${fighter.name} elbow to extend past shoulder`
      );
      assert.ok(
        punchJoints.wrist.x > punchJoints.elbow.x + 25,
        `Expected ${fighter.name} wrist to extend past elbow`
      );
      assert.ok(
        punchJoints.fistCenter.x > punchJoints.wrist.x + 8,
        `Expected ${fighter.name} fist/hand center to lead ahead of wrist`
      );

      const kickPose = computeFighterRigPose('KICK', 180, 360, 1, 1000, false);
      const kickJoints = computeArticulatedLimbJoints(kickPose, profile);
      // Verify hip -> knee -> ankle -> footTip extend forward and lift upward during a kick
      assert.ok(
        kickJoints.knee.x > kickJoints.hip.x + 30,
        `Expected ${fighter.name} knee to extend forward from hip during kick`
      );
      assert.ok(
        kickJoints.ankle.x > kickJoints.knee.x + 35,
        `Expected ${fighter.name} ankle to extend forward from knee during kick`
      );
      assert.ok(
        kickJoints.footTip.x > kickJoints.ankle.x + 20,
        `Expected ${fighter.name} boot/foot tip to strike ahead of ankle`
      );
      assert.ok(
        kickJoints.ankle.y < kickJoints.hip.y,
        `Expected ${fighter.name} kicking boot to rise above hip level`
      );
    }
  });

  it('physically extends right/lead hand outward when PUNCH action is active', () => {
    // At peak impact (~50% into a 250ms punch)
    const punchPose = computeFighterRigPose('PUNCH', 125, 250, 1, 1000, false);
    assert.ok(
      punchPose.punchArmExtendPx > 40,
      `Expected right hand punch extension > 40px, got ${punchPose.punchArmExtendPx}`
    );
    assert.ok(
      punchPose.punchArmAngleDeg < -45,
      `Expected forward arm elevation angle < -45deg, got ${punchPose.punchArmAngleDeg}`
    );
    assert.ok(punchPose.torsoLeanDeg > 6);
  });

  it('physically lifts and extends leg upward when KICK action is active', () => {
    // At peak impact (~50% into a 360ms kick)
    const kickPose = computeFighterRigPose('KICK', 180, 360, 1, 1000, false);
    assert.ok(
      kickPose.kickLegLiftPx > 35,
      `Expected kicking leg vertical lift > 35px, got ${kickPose.kickLegLiftPx}`
    );
    assert.ok(
      kickPose.kickLegExtendPx > 45,
      `Expected kicking leg forward reach > 45px, got ${kickPose.kickLegExtendPx}`
    );
    assert.ok(
      kickPose.kickLegAngleDeg < -55,
      `Expected kicking leg upward swing angle < -55deg, got ${kickPose.kickLegAngleDeg}`
    );
  });

  it('cycles through Jab, Cross, and Uppercut / Axe Kick strike variants across 3-hit combos', () => {
    const v0 = computeFighterRigPose('PUNCH', 125, 250, 0, 1000, false);
    const v1 = computeFighterRigPose('PUNCH', 125, 250, 1, 1000, false);
    const v2 = computeFighterRigPose('PUNCH', 125, 250, 2, 1000, false);
    assert.equal(v0.strikeVariant, 0);
    assert.equal(v1.strikeVariant, 1);
    assert.equal(v2.strikeVariant, 2);
    // Uppercut reaches higher angle than jab
    assert.ok(v2.punchArmAngleDeg < v0.punchArmAngleDeg);
  });

  it('triggers COUNTER HIT bonus when interrupting an opponent attack startup', () => {
    const state = createInitialMatchState({
      playerFighterId: 'FIGHTER_001',
      opponentFighterId: 'FIGHTER_002',
      arenaId: 'ARENA_001',
      difficulty: 'MEDIUM',
    });
    state.phase = 'FIGHTING';
    state.player.x = 500;
    state.opponent.x = 580;

    // Player starts punch and advances until active window connects during opponent startup
    let sawCounterHit = false;
    stepBattleSimulation(state, { ...EMPTY_INPUT, punch: true }, EMPTY_INPUT, 20);
    if (state.recentEvents.some((e) => e.isCounterHit)) sawCounterHit = true;

    for (let i = 0; i < 6; i++) {
      // Keep opponent in startup window (20ms elapsed out of 360ms) right as punch active frame hits
      state.opponent.action = 'KICK';
      state.opponent.actionDurationMs = 360;
      state.opponent.actionTimerMs = 20;
      stepBattleSimulation(state, EMPTY_INPUT, EMPTY_INPUT, 20);
      if (state.recentEvents.some((e) => e.isCounterHit)) sawCounterHit = true;
    }

    assert.equal(
      sawCounterHit,
      true,
      'Expected isCounterHit: true when interrupting opponent startup'
    );
  });
});


