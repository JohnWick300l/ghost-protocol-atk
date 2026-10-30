import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Phaser from 'phaser';
import {
  Shield,
  Zap,
  Trophy,
  History,
  Settings,
  ArrowLeft,
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  Maximize2,
  Swords,
  UserCheck,
  Flame,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import {
  BattleHistoryEntry,
  BattleMatchState,
  DifficultyLevel,
  PlayerProgressionProfile,
  SquadronGameSettings,
} from './types';
import {
  SQUADRON_ROSTER,
  OFFICIAL_FIGHTERS,
  BONUS_FIGHTERS,
  getFighterById,
} from './characters/roster';
import { SQUADRON_ARENAS, getArenaById } from './arenas/arenas';
import { ARENA_HEIGHT, ARENA_WIDTH } from './combat/combatEngine';
import { BattleScene } from './scenes/BattleScene';
import {
  DEFAULT_GAME_SETTINGS,
  DEFAULT_PROGRESSION_PROFILE,
  applyMatchToProfile,
  calculateMatchXp,
  getFavouriteFighterId,
  loadGameSettings,
  loadProgressionProfile,
  resetProgressionProfile,
  saveGameSettings,
  saveProgressionProfile,
} from './storage/progressionStorage';
import { gameAudio } from './audio/gameAudio';
import { InteractiveFighterPreview } from './components/InteractiveFighterPreview';

export type SquadronScreen =
  | 'MAIN_MENU'
  | 'CHARACTER_SELECT'
  | 'BATTLE'
  | 'RESULT'
  | 'PROFILE'
  | 'HISTORY'
  | 'SETTINGS';

interface SquadronShowdownGameProps {
  onExitToGhostProtocol?: () => void;
}

export const SquadronShowdownGame: React.FC<SquadronShowdownGameProps> = ({
  onExitToGhostProtocol,
}) => {
  const [screen, setScreen] = useState<SquadronScreen>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return 'BATTLE';
      if (params.get('screen') === 'select') return 'CHARACTER_SELECT';
    }
    return 'MAIN_MENU';
  });
  const [selectTarget, setSelectTarget] = useState<'PLAYER' | 'AI'>('PLAYER');
  const [playerFighterId, setPlayerFighterId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p1 = new URLSearchParams(window.location.search).get('p1');
      if (p1 && SQUADRON_ROSTER.some((f) => f.id === p1)) return p1;
    }
    return 'FIGHTER_001'; // NARESH
  });
  const [opponentFighterId, setOpponentFighterId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const ai = new URLSearchParams(window.location.search).get('ai');
      if (ai && SQUADRON_ROSTER.some((f) => f.id === ai)) return ai;
    }
    return 'FIGHTER_008'; // DQ (THE SHADOW RIDER)
  });
  const [arenaId, setArenaId] = useState<string>('ARENA_001');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('MEDIUM');
  const [isTrainingMode, setIsTrainingMode] = useState<boolean>(false);

  const [profile, setProfile] = useState<PlayerProgressionProfile>(
    DEFAULT_PROGRESSION_PROFILE
  );
  const [settings, setSettings] = useState<SquadronGameSettings>(
    DEFAULT_GAME_SETTINGS
  );

  // Active battle state synced from Phaser scene
  const [liveMatch, setLiveMatch] = useState<BattleMatchState | null>(null);
  const [lastResultEntry, setLastResultEntry] = useState<BattleHistoryEntry | null>(
    null
  );
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showPauseSettings, setShowPauseSettings] = useState<boolean>(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState<boolean>(false);
  const [battleInstanceKey, setBattleInstanceKey] = useState<number>(0);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(false);
  const [isPortraitMobile, setIsPortraitMobile] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const phaserHostRef = useRef<HTMLDivElement | null>(null);
  const phaserGameRef = useRef<Phaser.Game | null>(null);
  const battleSceneRef = useRef<BattleScene | null>(null);

  // Load offline progression and settings on mount
  useEffect(() => {
    let mounted = true;
    Promise.all([loadProgressionProfile(), loadGameSettings()]).then(
      ([loadedProfile, loadedSettings]) => {
        if (!mounted) return;
        setProfile(loadedProfile);
        setSettings(loadedSettings);
        setDifficulty(loadedSettings.defaultDifficulty);
        gameAudio.updateSettings(loadedSettings);
      }
    );
    return () => {
      mounted = false;
      gameAudio.stopMusic();
    };
  }, []);

  // Track responsive viewport for touch controls and landscape hint
  useEffect(() => {
    const checkViewport = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const touchCapable =
        w < 960 || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsMobileViewport(touchCapable);
      setIsPortraitMobile(w < 768 && h > w);
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  // Prevent same character selection for Player and AI unless mirror match is enabled
  const handleSelectFighter = (fighterId: string) => {
    gameAudio.playMenuClick();
    if (selectTarget === 'PLAYER') {
      setPlayerFighterId(fighterId);
      if (
        fighterId === opponentFighterId &&
        !settings.allowMirrorMatchInArena &&
        !isTrainingMode
      ) {
        const fallback =
          SQUADRON_ROSTER.find((f) => f.id !== fighterId)?.id || 'FIGHTER_008';
        setOpponentFighterId(fallback);
      }
    } else {
      if (
        fighterId === playerFighterId &&
        !settings.allowMirrorMatchInArena &&
        !isTrainingMode
      ) {
        return;
      }
      setOpponentFighterId(fighterId);
    }
  };

  const updateSettingsState = async (patch: Partial<SquadronGameSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    gameAudio.updateSettings(next);
    await saveGameSettings(next);
  };

  const handleMatchFinished = useCallback(
    async (finalState: BattleMatchState) => {
      if (finalState.isTrainingMode) {
        return;
      }
      const result: 'VICTORY' | 'DEFEAT' | 'DRAW' =
        finalState.winner === 'PLAYER'
          ? 'VICTORY'
          : finalState.winner === 'AI'
          ? 'DEFEAT'
          : 'DRAW';
      const winReason = finalState.winReason || 'KO';
      const durationSeconds = Math.max(
        1,
        finalState.maxTimerSeconds - finalState.timerSeconds
      );
      const xpEarned = calculateMatchXp({
        result,
        difficulty: finalState.difficulty,
        winReason,
        successfulAttacks: finalState.player.successfulHits,
        specialMovesUsed: finalState.player.specialsUsed,
      });

      const entry: BattleHistoryEntry = {
        id: `match_${Date.now()}`,
        timestamp: new Date().toISOString(),
        playerFighterId: finalState.player.fighterId,
        opponentFighterId: finalState.opponent.fighterId,
        arenaId: finalState.arenaId,
        difficulty: finalState.difficulty,
        result,
        winReason,
        durationSeconds,
        damageDealt: finalState.player.damageDealt,
        damageReceived: finalState.player.damageReceived,
        successfulAttacks: finalState.player.successfulHits,
        specialMovesUsed: finalState.player.specialsUsed,
        xpEarned,
      };

      setLastResultEntry(entry);
      const currentProfile = await loadProgressionProfile();
      const updatedProfile = applyMatchToProfile(currentProfile, entry);
      setProfile(updatedProfile);
      await saveProgressionProfile(updatedProfile);
      setScreen('RESULT');
    },
    []
  );

  // Mount & destroy Phaser 3 instance cleanly when entering/leaving BATTLE screen
  useEffect(() => {
    if (screen !== 'BATTLE' || !phaserHostRef.current) {
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
        phaserGameRef.current = null;
        battleSceneRef.current = null;
      }
      gameAudio.stopMusic();
      return;
    }

    const scene = new BattleScene({
      playerFighterId,
      opponentFighterId,
      arenaId,
      difficulty,
      isTrainingMode,
      onStateSync: (st) => setLiveMatch(st),
      onMatchFinished: (finalSt) => handleMatchFinished(finalSt),
      onPauseRequested: () => {
        setIsPaused((prev) => {
          const next = !prev;
          battleSceneRef.current?.setPausedState(next);
          return next;
        });
      },
    });

    battleSceneRef.current = scene;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: phaserHostRef.current,
      width: ARENA_WIDTH,
      height: ARENA_HEIGHT,
      backgroundColor: '#050811',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [scene],
    });

    phaserGameRef.current = game;

    return () => {
      gameAudio.stopMusic();
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
        phaserGameRef.current = null;
        battleSceneRef.current = null;
      }
    };
  }, [
    screen,
    battleInstanceKey,
    playerFighterId,
    opponentFighterId,
    arenaId,
    difficulty,
    isTrainingMode,
    handleMatchFinished,
  ]);

  const startBattleNow = (training = false) => {
    gameAudio.playMenuClick();
    setIsTrainingMode(training);
    setIsPaused(false);
    setShowPauseSettings(false);
    setBattleInstanceKey((k) => k + 1);
    setScreen('BATTLE');
  };

  const togglePause = (forceValue?: boolean) => {
    gameAudio.playMenuClick();
    const next = forceValue !== undefined ? forceValue : !isPaused;
    setIsPaused(next);
    if (!next) setShowPauseSettings(false);
    battleSceneRef.current?.setPausedState(next);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const handleBackToGhostProtocol = () => {
    gameAudio.stopMusic();
    if (onExitToGhostProtocol) {
      onExitToGhostProtocol();
    } else {
      window.location.href = '/';
    }
  };

  const playerDef = getFighterById(playerFighterId);
  const opponentDef = getFighterById(opponentFighterId);
  const selectedArena = getArenaById(arenaId);
  const inspectedFighter =
    selectTarget === 'PLAYER' ? playerDef : opponentDef;

  return (
    <div
      ref={containerRef}
      data-testid="squadron-showdown-root"
      className="min-h-screen w-full bg-[#050811] text-slate-100 flex flex-col select-none overflow-x-hidden font-sans"
    >
      {/* Top Tactical Navigation Header (Hidden during active battle so arena fills viewport) */}
      {screen !== 'BATTLE' && (
        <header className="w-full border-b border-cyan-500/20 bg-[#070b16]/90 backdrop-blur-md px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-3 z-20">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleBackToGhostProtocol}
              data-testid="back-to-ghost-protocol-btn"
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-xs font-bold tracking-wider text-cyan-400 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>BACK TO GHOST PROTOCOL</span>
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <div>
                <div className="text-sm sm:text-base font-black tracking-widest text-white uppercase">
                  SQUADRON SHOWDOWN
                </div>
                <div className="text-[10px] tracking-[0.25em] text-cyan-400 font-semibold uppercase">
                  FIGHT. RIDE. DOMINATE. • PLAYER VS AI
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {screen !== 'MAIN_MENU' && (
              <button
                type="button"
                onClick={() => {
                  gameAudio.playMenuClick();
                  setScreen('MAIN_MENU');
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400/60 text-xs font-bold tracking-wider text-slate-200 transition cursor-pointer"
              >
                MAIN MENU
              </button>
            )}

            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400">LVL {profile.level}</span>
              <span className="text-slate-600">•</span>
              <span className="text-cyan-400 font-bold">{profile.totalWins} WINS</span>
            </div>

            <button
              type="button"
              onClick={() => updateSettingsState({ muted: !settings.muted })}
              aria-label={settings.muted ? 'Unmute Audio' : 'Mute Audio'}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-slate-300 cursor-pointer"
            >
              {settings.muted ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-cyan-400" />
              )}
            </button>
          </div>
        </header>
      )}

      {/* ===================================================================== */}
      {/* SCREEN 1: MAIN MENU                                                   */}
      {/* ===================================================================== */}
      {screen === 'MAIN_MENU' && (
        <main className="flex-1 relative flex flex-col justify-between p-4 sm:p-8 lg:p-12 overflow-hidden">
          {/* Atmospheric Neon Grid Background */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(56,189,248,0.16),transparent_55%),radial-gradient(circle_at_25%_75%,rgba(168,85,247,0.14),transparent_55%)]" />

          <div className="relative z-10 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center my-auto">
            {/* Left Column: Arcade Title & Primary Action Stack */}
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 text-xs font-bold tracking-[0.2em] uppercase">
                <Sparkles className="w-3.5 h-3.5" />
                <span>ULTRAVIOLETTE SQUADRON ARCADE ARENA</span>
              </div>

              <div>
                <h1 className="text-4xl sm:text-6xl font-black tracking-tight uppercase text-white leading-none">
                  SQUADRON{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-purple-400">
                    SHOWDOWN
                  </span>
                </h1>
                <p className="mt-2 text-lg sm:text-xl font-extrabold tracking-[0.28em] text-amber-400 uppercase">
                  FIGHT. RIDE. DOMINATE.
                </p>
                <p className="mt-3 text-sm sm:text-base text-slate-300 max-w-xl leading-relaxed">
                  Your squadron. Your fighter. Your battle. Step onto the neon tarmac with
                  8 official Squadron legends and 4 custom circuit riders in high-voltage
                  1v1 Player vs AI combat.
                </p>
              </div>

              {/* Primary Menu Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  data-testid="menu-start-battle-btn"
                  onClick={() => {
                    gameAudio.playMenuClick();
                    setIsTrainingMode(false);
                    setScreen('CHARACTER_SELECT');
                  }}
                  className="sm:col-span-2 flex items-center justify-between px-6 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black tracking-wider text-lg shadow-lg shadow-cyan-500/25 transition cursor-pointer"
                >
                  <span className="flex items-center gap-3">
                    <Swords className="w-6 h-6" />
                    <span>START BATTLE (PLAYER VS AI)</span>
                  </span>
                  <span className="text-xs font-extrabold px-2.5 py-1 rounded bg-slate-950/20 text-slate-950 uppercase">
                    ENTER ARENA →
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="menu-character-select-btn"
                  onClick={() => {
                    gameAudio.playMenuClick();
                    setIsTrainingMode(false);
                    setScreen('CHARACTER_SELECT');
                  }}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-400/60 text-sm font-bold tracking-wider text-white transition cursor-pointer"
                >
                  <UserCheck className="w-4 h-4 text-cyan-400" />
                  <span>CHARACTER SELECT</span>
                </button>

                <button
                  type="button"
                  data-testid="menu-training-btn"
                  onClick={() => startBattleNow(true)}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-400/60 text-sm font-bold tracking-wider text-white transition cursor-pointer"
                >
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span>TRAINING MODE</span>
                </button>

                <button
                  type="button"
                  data-testid="menu-fighter-profile-btn"
                  onClick={() => {
                    gameAudio.playMenuClick();
                    setScreen('PROFILE');
                  }}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-purple-400/60 text-sm font-bold tracking-wider text-white transition cursor-pointer"
                >
                  <Trophy className="w-4 h-4 text-purple-400" />
                  <span>FIGHTER PROFILE</span>
                </button>

                <button
                  type="button"
                  data-testid="menu-battle-history-btn"
                  onClick={() => {
                    gameAudio.playMenuClick();
                    setScreen('HISTORY');
                  }}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-emerald-400/60 text-sm font-bold tracking-wider text-white transition cursor-pointer"
                >
                  <History className="w-4 h-4 text-emerald-400" />
                  <span>BATTLE HISTORY</span>
                </button>

                <button
                  type="button"
                  data-testid="menu-settings-btn"
                  onClick={() => {
                    gameAudio.playMenuClick();
                    setScreen('SETTINGS');
                  }}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-sky-400/60 text-sm font-bold tracking-wider text-white transition cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-sky-400" />
                  <span>SETTINGS</span>
                </button>

                <button
                  type="button"
                  onClick={handleBackToGhostProtocol}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-slate-950/90 hover:bg-slate-900 border border-slate-800 text-sm font-bold tracking-wider text-slate-300 transition cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-slate-400" />
                  <span>BACK TO GHOST PROTOCOL</span>
                </button>
              </div>
            </div>

            {/* Right Column: Featured Official Squadron Lineup Showcase */}
            <div className="lg:col-span-6">
              <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-slate-900/90 to-[#070b16]/95 p-5 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-xs font-bold tracking-[0.2em] text-cyan-400 uppercase">
                      OFFICIAL SQUADRON ROSTER
                    </div>
                    <div className="text-lg font-black text-white uppercase">
                      8 CORE LEGENDS + 4 CIRCUIT RIDERS
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-purple-500/20 border border-purple-400/40 text-purple-300 text-xs font-bold">
                    OFFLINE-READY
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2.5">
                  {OFFICIAL_FIGHTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setPlayerFighterId(f.id);
                        setScreen('CHARACTER_SELECT');
                      }}
                      className="group relative rounded-xl overflow-hidden border border-slate-800 hover:border-cyan-400/70 bg-slate-950/80 p-2 flex flex-col items-center transition cursor-pointer"
                    >
                      <div className="h-28 sm:h-32 w-full flex items-center justify-center overflow-hidden">
                        <img
                          src={f.spriteAsset}
                          alt={f.name}
                          className="h-full w-auto object-contain group-hover:scale-105 transition duration-200"
                        />
                      </div>
                      <div className="mt-1.5 text-[11px] font-black tracking-wider text-white uppercase truncate w-full text-center">
                        {f.name}
                      </div>
                      <div className="text-[9px] text-cyan-400 font-semibold truncate w-full text-center">
                        {f.specialName}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ===================================================================== */}
      {/* SCREEN 2: CHARACTER & ARENA SELECTION                                 */}
      {/* ===================================================================== */}
      {screen === 'CHARACTER_SELECT' && (
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
          {/* Top Matchup Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            {/* Player Fighter Preview Card */}
            <div
              onClick={() => setSelectTarget('PLAYER')}
              className={`lg:col-span-5 rounded-2xl p-4 border transition cursor-pointer flex gap-4 items-center ${
                selectTarget === 'PLAYER'
                  ? 'border-cyan-400 bg-cyan-950/25 shadow-lg shadow-cyan-500/10'
                  : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
              }`}
            >
              <InteractiveFighterPreview
                fighter={playerDef}
                mirrored={false}
                showMoveTester={true}
              />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-black tracking-widest uppercase">
                    MY FIGHTER (P1)
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {playerDef.code}
                  </span>
                </div>
                <h2 className="text-xl font-black text-white uppercase truncate">
                  {playerDef.name}
                </h2>
                <div className="text-xs text-amber-400 font-bold uppercase">
                  SPECIAL: {playerDef.specialName}
                </div>
                <p className="text-xs text-slate-400 line-clamp-2">
                  {playerDef.style} — {playerDef.specialDescription}
                </p>
                {/* Stat Bars */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 text-[10px]">
                  <div>
                    <div className="flex justify-between text-slate-300">
                      <span>STR</span>
                      <span>{playerDef.stats.strength}</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-rose-500"
                        style={{ width: `${playerDef.stats.strength}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-slate-300">
                      <span>SPD</span>
                      <span>{playerDef.stats.speed}</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-cyan-400"
                        style={{ width: `${playerDef.stats.speed}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-slate-300">
                      <span>DEF</span>
                      <span>{playerDef.stats.defense}</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-emerald-400"
                        style={{ width: `${playerDef.stats.defense}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-slate-300">
                      <span>STA</span>
                      <span>{playerDef.stats.stamina}</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-amber-400"
                        style={{ width: `${playerDef.stats.stamina}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Center VS & Launch Controls */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/75 p-4 flex flex-col items-center justify-between gap-3">
              <div className="text-center">
                <div className="text-xs font-bold tracking-widest text-slate-400 uppercase">
                  MODE
                </div>
                <div className="text-sm font-black text-cyan-400 uppercase">
                  {isTrainingMode ? 'TRAINING' : 'PLAYER VS AI'}
                </div>
              </div>

              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center font-black text-lg text-slate-950 shadow-md">
                VS
              </div>

              {/* Difficulty Selector */}
              <div className="w-full space-y-1">
                <div className="text-[10px] text-center font-bold tracking-wider text-slate-400 uppercase">
                  AI DIFFICULTY
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(['EASY', 'MEDIUM', 'HARD'] as DifficultyLevel[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        gameAudio.playMenuClick();
                        setDifficulty(d);
                      }}
                      className={`py-1 rounded text-[10px] font-black uppercase transition cursor-pointer ${
                        difficulty === d
                          ? 'bg-cyan-400 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                data-testid="launch-battle-btn"
                onClick={() => startBattleNow(isTrainingMode)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black tracking-wider text-sm uppercase shadow-lg shadow-cyan-500/20 transition cursor-pointer"
              >
                FIGHT NOW
              </button>
            </div>

            {/* AI Opponent Fighter Preview Card */}
            <div
              onClick={() => setSelectTarget('AI')}
              className={`lg:col-span-5 rounded-2xl p-4 border transition cursor-pointer flex gap-4 items-center ${
                selectTarget === 'AI'
                  ? 'border-rose-500 bg-rose-950/25 shadow-lg shadow-rose-500/10'
                  : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
              }`}
            >
              <InteractiveFighterPreview
                fighter={opponentDef}
                mirrored={true}
                showMoveTester={true}
              />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-black tracking-widest uppercase">
                    AI OPPONENT (CPU)
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {opponentDef.code}
                  </span>
                </div>
                <h2 className="text-xl font-black text-white uppercase truncate">
                  {opponentDef.name}
                </h2>
                <div className="text-xs text-amber-400 font-bold uppercase">
                  SPECIAL: {opponentDef.specialName}
                </div>
                <p className="text-xs text-slate-400 line-clamp-2">
                  {opponentDef.style} — {opponentDef.specialDescription}
                </p>
                {/* Stat Bars */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 text-[10px]">
                  <div>
                    <div className="flex justify-between text-slate-300">
                      <span>STR</span>
                      <span>{opponentDef.stats.strength}</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-rose-500"
                        style={{ width: `${opponentDef.stats.strength}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-slate-300">
                      <span>SPD</span>
                      <span>{opponentDef.stats.speed}</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-cyan-400"
                        style={{ width: `${opponentDef.stats.speed}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-slate-300">
                      <span>DEF</span>
                      <span>{opponentDef.stats.defense}</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-emerald-400"
                        style={{ width: `${opponentDef.stats.defense}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-slate-300">
                      <span>STA</span>
                      <span>{opponentDef.stats.stamina}</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-amber-400"
                        style={{ width: `${opponentDef.stats.stamina}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Target Slot Selector Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectTarget('PLAYER')}
                className={`px-4 py-2 rounded-lg text-xs font-black tracking-wider uppercase transition cursor-pointer ${
                  selectTarget === 'PLAYER'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-900 text-slate-300 border border-slate-800'
                }`}
              >
                SELECTING: MY FIGHTER ({playerDef.name})
              </button>
              <button
                type="button"
                onClick={() => setSelectTarget('AI')}
                className={`px-4 py-2 rounded-lg text-xs font-black tracking-wider uppercase transition cursor-pointer ${
                  selectTarget === 'AI'
                    ? 'bg-rose-500 text-white'
                    : 'bg-slate-900 text-slate-300 border border-slate-800'
                }`}
              >
                SELECTING: AI OPPONENT ({opponentDef.name})
              </button>
            </div>
            <div className="text-xs text-slate-400">
              Inspecting <strong className="text-white">{inspectedFighter.name}</strong> —{' '}
              <span className="text-cyan-400">{inspectedFighter.lore}</span>
            </div>
          </div>

          {/* Roster Grid: 8 Official Squadron Fighters + 4 Circuit Biker Fighters */}
          <div className="space-y-3">
            <div className="text-xs font-bold tracking-[0.2em] text-cyan-400 uppercase">
              OFFICIAL SQUADRON ROSTER (8 CORE FIGHTERS)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
              {OFFICIAL_FIGHTERS.map((fighter) => {
                const isP1 = playerFighterId === fighter.id;
                const isAI = opponentFighterId === fighter.id;
                const disabledForAI =
                  selectTarget === 'AI' &&
                  isP1 &&
                  !settings.allowMirrorMatchInArena &&
                  !isTrainingMode;

                return (
                  <button
                    key={fighter.id}
                    type="button"
                    data-testid={`roster-card-${fighter.id}`}
                    disabled={disabledForAI}
                    onClick={() => handleSelectFighter(fighter.id)}
                    className={`relative rounded-xl p-2 border flex flex-col items-center transition cursor-pointer ${
                      isP1 && isAI
                        ? 'border-purple-400 bg-purple-950/30'
                        : isP1
                        ? 'border-cyan-400 bg-cyan-950/30'
                        : isAI
                        ? 'border-rose-500 bg-rose-950/30'
                        : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
                    } ${disabledForAI ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <div className="absolute top-1.5 left-1.5 flex gap-1">
                      {isP1 && (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-400 text-slate-950 text-[9px] font-black">
                          P1
                        </span>
                      )}
                      {isAI && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[9px] font-black">
                          AI
                        </span>
                      )}
                    </div>
                    <div className="h-28 w-full flex items-center justify-center overflow-hidden mt-3">
                      <img
                        src={fighter.spriteAsset}
                        alt={fighter.name}
                        className="h-full w-auto object-contain"
                      />
                    </div>
                    <div className="mt-1.5 text-xs font-black text-white uppercase truncate w-full text-center">
                      {fighter.name}
                    </div>
                    <div className="text-[10px] text-amber-400 font-semibold truncate w-full text-center">
                      {fighter.specialName}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-bold tracking-[0.2em] text-purple-400 uppercase">
              ADDITIONAL CIRCUIT BIKER FIGHTERS (4 BONUS FIGHTERS)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {BONUS_FIGHTERS.map((fighter) => {
                const isP1 = playerFighterId === fighter.id;
                const isAI = opponentFighterId === fighter.id;
                const disabledForAI =
                  selectTarget === 'AI' &&
                  isP1 &&
                  !settings.allowMirrorMatchInArena &&
                  !isTrainingMode;

                return (
                  <button
                    key={fighter.id}
                    type="button"
                    data-testid={`roster-card-${fighter.id}`}
                    disabled={disabledForAI}
                    onClick={() => handleSelectFighter(fighter.id)}
                    className={`relative rounded-xl p-3 border flex items-center gap-3 transition cursor-pointer ${
                      isP1
                        ? 'border-cyan-400 bg-cyan-950/30'
                        : isAI
                        ? 'border-rose-500 bg-rose-950/30'
                        : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
                    } ${disabledForAI ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <img
                      src={fighter.spriteAsset}
                      alt={fighter.name}
                      className="w-14 h-20 object-contain shrink-0"
                    />
                    <div className="text-left min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-white uppercase truncate">
                          {fighter.name}
                        </span>
                        {isP1 && (
                          <span className="px-1.5 py-0.5 rounded bg-cyan-400 text-slate-950 text-[9px] font-black">
                            P1
                          </span>
                        )}
                        {isAI && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[9px] font-black">
                            AI
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400">{fighter.title}</div>
                      <div className="text-[10px] text-amber-400 font-bold mt-0.5">
                        {fighter.specialName}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Arena Selection Strip */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold tracking-[0.2em] text-cyan-400 uppercase">
                SELECT BATTLE ARENA ({selectedArena.code} — {selectedArena.name})
              </div>
              <div className="text-xs text-slate-400 hidden sm:block">
                {selectedArena.description}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {SQUADRON_ARENAS.map((arena) => {
                const selected = arena.id === arenaId;
                return (
                  <button
                    key={arena.id}
                    type="button"
                    data-testid={`arena-card-${arena.id}`}
                    onClick={() => {
                      gameAudio.playMenuClick();
                      setArenaId(arena.id);
                    }}
                    className={`rounded-xl p-3.5 border text-left transition cursor-pointer ${
                      selected
                        ? 'border-cyan-400 bg-slate-900 shadow-lg shadow-cyan-500/10'
                        : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-[10px] font-black tracking-widest uppercase"
                        style={{ color: arena.themeColor }}
                      >
                        {arena.code}
                      </span>
                      {selected && (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-300 text-[9px] font-bold">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-black text-white uppercase">
                      {arena.name}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {arena.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      )}

      {/* ===================================================================== */}
      {/* SCREEN 3: ACTIVE BATTLE ARENA + HUD OVERLAY                           */}
      {/* ===================================================================== */}
      {screen === 'BATTLE' && (
        <main className="relative flex-1 w-full h-screen bg-[#050811] flex flex-col justify-between overflow-hidden">
          {/* Portrait Orientation Suggestion Banner on narrow mobile */}
          {isPortraitMobile && (
            <div className="bg-amber-500/20 border-b border-amber-400/40 px-3 py-1 text-center text-[11px] font-bold text-amber-200 z-30">
              TIP: Rotate your phone to Landscape for the widest arcade arena view.
            </div>
          )}

          {/* Top Translucent Combat HUD Overlay */}
          <div className="relative z-20 w-full max-w-7xl mx-auto px-3 sm:px-6 pt-2 sm:pt-3 pointer-events-none">
            <div className="grid grid-cols-12 gap-2 sm:gap-4 items-start">
              {/* Top-Left: Player 1 Status */}
              <div className="col-span-5 space-y-1.5 bg-slate-950/75 backdrop-blur-md p-2.5 sm:p-3 rounded-xl border border-cyan-500/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-1.5 py-0.5 rounded bg-cyan-400 text-slate-950 text-[10px] font-black">
                      YOU
                    </span>
                    <span
                      data-testid="hud-player-name"
                      className="text-xs sm:text-sm font-black text-white uppercase truncate"
                    >
                      {playerDef.name}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-cyan-300">
                    {liveMatch
                      ? `${liveMatch.player.hp}/${liveMatch.player.maxHp}`
                      : '100/100'}
                  </span>
                </div>

                {/* Health Bar */}
                <div className="h-3 sm:h-3.5 w-full bg-slate-900 rounded-md overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-100"
                    style={{
                      width: `${
                        liveMatch
                          ? Math.max(
                              0,
                              (liveMatch.player.hp / liveMatch.player.maxHp) * 100
                            )
                          : 100
                      }%`,
                    }}
                  />
                </div>

                {/* Stamina & Special Energy Bars */}
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <div>
                    <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                      <span>STAMINA</span>
                      <span>
                        {liveMatch ? Math.round(liveMatch.player.stamina) : 100}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-900 rounded overflow-hidden">
                      <div
                        className="h-full bg-amber-400 transition-all duration-75"
                        style={{
                          width: `${
                            liveMatch
                              ? Math.max(
                                  0,
                                  (liveMatch.player.stamina /
                                    liveMatch.player.maxStamina) *
                                    100
                                )
                              : 100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                      <span>{playerDef.specialName}</span>
                      <span
                        className={
                          (liveMatch?.player.energy ?? 0) >= 100
                            ? 'text-cyan-300 animate-pulse'
                            : ''
                        }
                      >
                        {liveMatch ? Math.round(liveMatch.player.energy) : 35}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-900 rounded overflow-hidden">
                      <div
                        className="h-full bg-purple-400 transition-all duration-75"
                        style={{
                          width: `${liveMatch ? liveMatch.player.energy : 35}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                {/* Live Action & Combo Telemetry Strip */}
                <div className="flex items-center justify-between pt-1 text-[10px] font-black tracking-wider uppercase">
                  <span className="text-cyan-400">
                    ACTION: {liveMatch?.player.action || 'READY'}
                  </span>
                  {(liveMatch?.player.comboCount ?? 0) >= 2 && (
                    <span
                      data-testid="player-combo-badge"
                      className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 animate-bounce"
                    >
                      {liveMatch?.player.comboCount}x COMBO!
                    </span>
                  )}
                </div>
              </div>

              {/* Top-Center: Round Timer & Pause/Fullscreen Buttons */}
              <div className="col-span-2 flex flex-col items-center">
                <div className="bg-slate-950/85 border border-slate-700/80 rounded-xl px-3 py-1.5 text-center shadow-lg">
                  <div className="text-[9px] font-bold tracking-widest text-cyan-400 uppercase">
                    {isTrainingMode ? 'TRAINING' : difficulty}
                  </div>
                  <div
                    data-testid="hud-timer"
                    className="text-xl sm:text-2xl font-black font-mono text-white leading-tight"
                  >
                    {isTrainingMode
                      ? '∞'
                      : String(liveMatch?.timerSeconds ?? 90).padStart(2, '0')}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 mt-1.5 pointer-events-auto">
                  <button
                    type="button"
                    data-testid="battle-pause-btn"
                    onClick={() => togglePause()}
                    className="p-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer"
                    title="Pause (P / Esc)"
                  >
                    <Pause className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="p-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer"
                    title="Fullscreen"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Top-Right: AI Opponent Status */}
              <div className="col-span-5 space-y-1.5 bg-slate-950/75 backdrop-blur-md p-2.5 sm:p-3 rounded-xl border border-rose-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-rose-300">
                    {liveMatch
                      ? `${liveMatch.opponent.hp}/${liveMatch.opponent.maxHp}`
                      : '100/100'}
                  </span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      data-testid="hud-opponent-name"
                      className="text-xs sm:text-sm font-black text-white uppercase truncate"
                    >
                      {opponentDef.name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-black">
                      AI
                    </span>
                  </div>
                </div>

                {/* AI Health Bar */}
                <div className="h-3 sm:h-3.5 w-full bg-slate-900 rounded-md overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-l from-rose-500 to-orange-400 transition-all duration-100 ml-auto"
                    style={{
                      width: `${
                        liveMatch
                          ? Math.max(
                              0,
                              (liveMatch.opponent.hp / liveMatch.opponent.maxHp) *
                                100
                            )
                          : 100
                      }%`,
                    }}
                  />
                </div>

                {/* AI Stamina & Energy */}
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <div>
                    <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                      <span>STAMINA</span>
                      <span>
                        {liveMatch ? Math.round(liveMatch.opponent.stamina) : 100}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-900 rounded overflow-hidden">
                      <div
                        className="h-full bg-amber-400 transition-all duration-75"
                        style={{
                          width: `${
                            liveMatch
                              ? Math.max(
                                  0,
                                  (liveMatch.opponent.stamina /
                                    liveMatch.opponent.maxStamina) *
                                    100
                                )
                              : 100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                      <span>{opponentDef.specialName}</span>
                      <span>
                        {liveMatch ? Math.round(liveMatch.opponent.energy) : 35}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-900 rounded overflow-hidden">
                      <div
                        className="h-full bg-purple-400 transition-all duration-75"
                        style={{
                          width: `${liveMatch ? liveMatch.opponent.energy : 35}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                {/* AI Live Action & Combo Telemetry Strip */}
                <div className="flex items-center justify-between pt-1 text-[10px] font-black tracking-wider uppercase">
                  {(liveMatch?.opponent.comboCount ?? 0) >= 2 ? (
                    <span className="px-2 py-0.5 rounded bg-rose-500 text-white animate-bounce">
                      {liveMatch?.opponent.comboCount}x COMBO!
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="text-rose-400">
                    AI: {liveMatch?.opponent.action || 'READY'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Center Phaser 3 Canvas Mount Container */}
          <div className="relative flex-1 w-full flex items-center justify-center overflow-hidden">
            <div
              ref={phaserHostRef}
              data-testid="phaser-arena-container"
              className="w-full h-full flex items-center justify-center"
            />
          </div>

          {/* Mobile Touch Controls OR Desktop Compact Keybind Bar */}
          {isMobileViewport || settings.showTouchControlsOnDesktop ? (
            <div className="relative z-20 w-full px-4 pb-4 pt-1 flex items-end justify-between gap-4 bg-gradient-to-t from-slate-950/95 to-transparent">
              {/* Left Movement Pad */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onPointerDown={() =>
                    battleSceneRef.current?.setTouchInputState({ left: true })
                  }
                  onPointerUp={() =>
                    battleSceneRef.current?.setTouchInputState({ left: false })
                  }
                  onPointerLeave={() =>
                    battleSceneRef.current?.setTouchInputState({ left: false })
                  }
                  className="w-14 h-14 rounded-2xl bg-slate-900/90 active:bg-cyan-500 active:text-slate-950 border border-slate-700 font-black text-lg text-white flex items-center justify-center"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onPointerDown={() =>
                    battleSceneRef.current?.setTouchInputState({ up: true })
                  }
                  onPointerUp={() =>
                    battleSceneRef.current?.setTouchInputState({ up: false })
                  }
                  onPointerLeave={() =>
                    battleSceneRef.current?.setTouchInputState({ up: false })
                  }
                  className="w-14 h-14 rounded-2xl bg-slate-900/90 active:bg-cyan-500 active:text-slate-950 border border-slate-700 font-black text-xs text-white flex items-center justify-center"
                >
                  JUMP
                </button>
                <button
                  type="button"
                  onPointerDown={() =>
                    battleSceneRef.current?.setTouchInputState({ right: true })
                  }
                  onPointerUp={() =>
                    battleSceneRef.current?.setTouchInputState({ right: false })
                  }
                  onPointerLeave={() =>
                    battleSceneRef.current?.setTouchInputState({ right: false })
                  }
                  className="w-14 h-14 rounded-2xl bg-slate-900/90 active:bg-cyan-500 active:text-slate-950 border border-slate-700 font-black text-lg text-white flex items-center justify-center"
                >
                  ▶
                </button>
              </div>

              {/* Right Combat Action Cluster */}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  data-testid="touch-punch-btn"
                  onClick={() => battleSceneRef.current?.triggerTouchAction('punch')}
                  className="w-14 h-14 rounded-2xl bg-sky-500/25 active:bg-sky-400 active:text-slate-950 border border-sky-400/60 font-black text-xs text-sky-200 flex items-center justify-center"
                >
                  PUNCH
                </button>
                <button
                  type="button"
                  data-testid="touch-kick-btn"
                  onClick={() => battleSceneRef.current?.triggerTouchAction('kick')}
                  className="w-14 h-14 rounded-2xl bg-amber-500/25 active:bg-amber-400 active:text-slate-950 border border-amber-400/60 font-black text-xs text-amber-200 flex items-center justify-center"
                >
                  KICK
                </button>
                <button
                  type="button"
                  onPointerDown={() =>
                    battleSceneRef.current?.setTouchInputState({ block: true })
                  }
                  onPointerUp={() =>
                    battleSceneRef.current?.setTouchInputState({ block: false })
                  }
                  onPointerLeave={() =>
                    battleSceneRef.current?.setTouchInputState({ block: false })
                  }
                  className="w-14 h-14 rounded-2xl bg-emerald-500/25 active:bg-emerald-400 active:text-slate-950 border border-emerald-400/60 font-black text-xs text-emerald-200 flex items-center justify-center"
                >
                  BLOCK
                </button>
                <button
                  type="button"
                  data-testid="touch-special-btn"
                  onClick={() =>
                    battleSceneRef.current?.triggerTouchAction('special')
                  }
                  className="px-4 h-14 rounded-2xl bg-purple-500/30 active:bg-purple-400 active:text-slate-950 border border-purple-400 font-black text-xs text-purple-200 flex items-center justify-center"
                >
                  SPECIAL
                </button>
              </div>
            </div>
          ) : (
            <div className="relative z-20 w-full bg-slate-950/95 border-t border-cyan-500/20 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onPointerDown={() =>
                    battleSceneRef.current?.setTouchInputState({ left: true })
                  }
                  onPointerUp={() =>
                    battleSceneRef.current?.setTouchInputState({ left: false })
                  }
                  onPointerLeave={() =>
                    battleSceneRef.current?.setTouchInputState({ left: false })
                  }
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-cyan-500 active:text-slate-950 border border-slate-700 font-bold text-slate-200 cursor-pointer"
                >
                  ◀ A Move Left
                </button>
                <button
                  type="button"
                  onPointerDown={() =>
                    battleSceneRef.current?.setTouchInputState({ up: true })
                  }
                  onPointerUp={() =>
                    battleSceneRef.current?.setTouchInputState({ up: false })
                  }
                  onPointerLeave={() =>
                    battleSceneRef.current?.setTouchInputState({ up: false })
                  }
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-cyan-500 active:text-slate-950 border border-slate-700 font-bold text-slate-200 cursor-pointer"
                >
                  ▲ W Jump
                </button>
                <button
                  type="button"
                  onPointerDown={() =>
                    battleSceneRef.current?.setTouchInputState({ right: true })
                  }
                  onPointerUp={() =>
                    battleSceneRef.current?.setTouchInputState({ right: false })
                  }
                  onPointerLeave={() =>
                    battleSceneRef.current?.setTouchInputState({ right: false })
                  }
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-cyan-500 active:text-slate-950 border border-slate-700 font-bold text-slate-200 cursor-pointer"
                >
                  D Move Right ▶
                </button>

                <div className="h-4 w-px bg-slate-800 mx-1" />

                <button
                  type="button"
                  data-testid="desktop-punch-btn"
                  onClick={() =>
                    battleSceneRef.current?.triggerTouchAction('punch')
                  }
                  className="px-3.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/35 active:bg-sky-400 active:text-slate-950 border border-sky-400/50 font-black text-sky-200 cursor-pointer"
                >
                  👊 F PUNCH (RIGHT HAND)
                </button>
                <button
                  type="button"
                  data-testid="desktop-kick-btn"
                  onClick={() =>
                    battleSceneRef.current?.triggerTouchAction('kick')
                  }
                  className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 active:bg-amber-400 active:text-slate-950 border border-amber-400/50 font-black text-amber-200 cursor-pointer"
                >
                  🦵 G KICK (LEG RISE)
                </button>
                <button
                  type="button"
                  data-testid="desktop-block-btn"
                  onPointerDown={() =>
                    battleSceneRef.current?.setTouchInputState({ block: true })
                  }
                  onPointerUp={() =>
                    battleSceneRef.current?.setTouchInputState({ block: false })
                  }
                  onPointerLeave={() =>
                    battleSceneRef.current?.setTouchInputState({ block: false })
                  }
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 active:bg-emerald-400 active:text-slate-950 border border-emerald-400/50 font-black text-emerald-200 cursor-pointer"
                >
                  🛡 H BLOCK
                </button>
                <button
                  type="button"
                  onClick={() =>
                    battleSceneRef.current?.triggerTouchAction('dodge')
                  }
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 font-bold text-slate-300 cursor-pointer"
                >
                  ⚡ SHIFT DODGE
                </button>
                <button
                  type="button"
                  data-testid="desktop-special-btn"
                  onClick={() =>
                    battleSceneRef.current?.triggerTouchAction('special')
                  }
                  className="px-3.5 py-1.5 rounded-lg bg-purple-500/25 hover:bg-purple-500/40 active:bg-purple-400 active:text-slate-950 border border-purple-400/60 font-black text-purple-200 cursor-pointer"
                >
                  🔥 R {playerDef.specialName}
                </button>
              </div>
              <div className="flex items-center gap-3">
                {isTrainingMode && (
                  <button
                    type="button"
                    onClick={() => setScreen('MAIN_MENU')}
                    className="text-amber-400 hover:underline font-bold cursor-pointer"
                  >
                    Exit Training
                  </button>
                )}
                <span className="text-slate-400">
                  <strong className="text-slate-200">P / ESC</strong> Pause
                </span>
              </div>
            </div>
          )}

          {/* PAUSE MODAL */}
          {isPaused && (
            <div
              data-testid="pause-modal"
              className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md rounded-2xl border border-cyan-500/40 bg-slate-900 p-6 shadow-2xl space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <div className="text-xs font-bold tracking-widest text-cyan-400 uppercase">
                      SYSTEM PAUSED
                    </div>
                    <h3 className="text-2xl font-black text-white uppercase">
                      BATTLE PAUSED
                    </h3>
                  </div>
                  <Pause className="w-6 h-6 text-cyan-400" />
                </div>

                {!showPauseSettings ? (
                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={() => togglePause(false)}
                      className="w-full py-3 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black tracking-wider text-sm uppercase flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Play className="w-4 h-4" />
                      <span>RESUME BATTLE</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => startBattleNow(isTrainingMode)}
                      className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold tracking-wider text-sm uppercase flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>RESTART BATTLE</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowPauseSettings(true)}
                      className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold tracking-wider text-sm uppercase flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Settings className="w-4 h-4" />
                      <span>AUDIO & TOUCH SETTINGS</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsPaused(false);
                        setScreen('MAIN_MENU');
                      }}
                      className="w-full py-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold tracking-wider text-sm uppercase cursor-pointer"
                    >
                      EXIT TO MAIN MENU
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="flex justify-between text-xs font-bold text-slate-300 mb-1">
                        <span>MUSIC VOLUME</span>
                        <span>{Math.round(settings.musicVolume * 100)}%</span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={settings.musicVolume}
                        onChange={(e) =>
                          updateSettingsState({
                            musicVolume: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="flex justify-between text-xs font-bold text-slate-300 mb-1">
                        <span>SFX VOLUME</span>
                        <span>{Math.round(settings.sfxVolume * 100)}%</span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={settings.sfxVolume}
                        onChange={(e) =>
                          updateSettingsState({
                            sfxVolume: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-cyan-400"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPauseSettings(false)}
                      className="w-full py-2.5 rounded-xl bg-slate-800 text-cyan-400 font-bold text-xs uppercase cursor-pointer"
                    >
                      ← BACK TO PAUSE MENU
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      )}

      {/* ===================================================================== */}
      {/* SCREEN 4: VICTORY & DEFEAT RESULT SCREEN                              */}
      {/* ===================================================================== */}
      {screen === 'RESULT' && lastResultEntry && (
        <main
          data-testid="battle-result-screen"
          className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-8 flex items-center justify-center"
        >
          <div className="w-full rounded-3xl border border-cyan-500/30 bg-slate-900/90 p-6 sm:p-8 shadow-2xl grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            {/* Winner Fighter Artwork */}
            <div className="md:col-span-5 flex flex-col items-center">
              <div className="w-56 h-72 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center p-4">
                <img
                  src={
                    getFighterById(
                      lastResultEntry.result === 'DEFEAT'
                        ? lastResultEntry.opponentFighterId
                        : lastResultEntry.playerFighterId
                    ).spriteAsset
                  }
                  alt="Match Spotlight Fighter"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="mt-3 text-center">
                <div className="text-xs font-bold tracking-widest text-slate-400 uppercase">
                  ARENA CHAMPION
                </div>
                <div className="text-xl font-black text-white uppercase">
                  {
                    getFighterById(
                      lastResultEntry.result === 'DEFEAT'
                        ? lastResultEntry.opponentFighterId
                        : lastResultEntry.playerFighterId
                    ).name
                  }
                </div>
              </div>
            </div>

            {/* Match Telemetry & Actions */}
            <div className="md:col-span-7 space-y-6">
              <div>
                <div className="text-xs font-bold tracking-[0.25em] text-cyan-400 uppercase">
                  {lastResultEntry.winReason} FINISH • {lastResultEntry.difficulty} AI
                </div>
                <h2
                  className={`text-4xl sm:text-5xl font-black uppercase ${
                    lastResultEntry.result === 'VICTORY'
                      ? 'text-emerald-400'
                      : lastResultEntry.result === 'DEFEAT'
                      ? 'text-rose-500'
                      : 'text-amber-400'
                  }`}
                >
                  {lastResultEntry.result}
                </h2>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-3">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">
                    XP EARNED
                  </div>
                  <div className="text-xl font-black text-amber-400">
                    +{lastResultEntry.xpEarned} XP
                  </div>
                </div>
                <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-3">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">
                    DURATION
                  </div>
                  <div className="text-xl font-black text-white">
                    {lastResultEntry.durationSeconds}s
                  </div>
                </div>
                <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-3">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">
                    DAMAGE DEALT
                  </div>
                  <div className="text-xl font-black text-cyan-400">
                    {lastResultEntry.damageDealt}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-3">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">
                    DAMAGE RECEIVED
                  </div>
                  <div className="text-xl font-black text-rose-400">
                    {lastResultEntry.damageReceived}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-3">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">
                    SUCCESSFUL HITS
                  </div>
                  <div className="text-xl font-black text-emerald-400">
                    {lastResultEntry.successfulAttacks}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-3">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">
                    SPECIALS USED
                  </div>
                  <div className="text-xl font-black text-purple-400">
                    {lastResultEntry.specialMovesUsed}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  data-testid="result-rematch-btn"
                  onClick={() => startBattleNow(false)}
                  className="px-6 py-3.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black tracking-wider text-sm uppercase cursor-pointer"
                >
                  REMATCH
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('CHARACTER_SELECT')}
                  className="px-5 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold tracking-wider text-sm uppercase cursor-pointer"
                >
                  CHANGE FIGHTER
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('MAIN_MENU')}
                  className="px-5 py-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 font-bold tracking-wider text-sm uppercase cursor-pointer"
                >
                  MAIN MENU
                </button>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ===================================================================== */}
      {/* SCREEN 5: FIGHTER PROFILE (OFFLINE PROGRESSION)                       */}
      {/* ===================================================================== */}
      {screen === 'PROFILE' && (
        <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-8 space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="text-xs font-bold tracking-widest text-cyan-400 uppercase">
                OFFLINE SQUADRON DOSSIER
              </div>
              <h2 className="text-3xl font-black text-white uppercase">
                LEVEL {profile.level} • {profile.selectedBannerTitle}
              </h2>
              <div className="text-xs text-slate-400 mt-1">
                Total XP: <strong className="text-amber-400">{profile.xp} XP</strong> •
                Next Level at {profile.level * 250} XP
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <div className="text-[10px] text-slate-400 font-bold">BATTLES</div>
                <div className="text-xl font-black text-white">
                  {profile.totalBattles}
                </div>
              </div>
              <div className="px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <div className="text-[10px] text-slate-400 font-bold">WINS</div>
                <div className="text-xl font-black text-emerald-400">
                  {profile.totalWins}
                </div>
              </div>
              <div className="px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <div className="text-[10px] text-slate-400 font-bold">LOSSES</div>
                <div className="text-xl font-black text-rose-400">
                  {profile.totalLosses}
                </div>
              </div>
              <div className="px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <div className="text-[10px] text-slate-400 font-bold">WIN RATE</div>
                <div className="text-xl font-black text-cyan-400">
                  {profile.totalBattles > 0
                    ? `${Math.round(
                        (profile.totalWins / profile.totalBattles) * 100
                      )}%`
                    : '0%'}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
              <div className="text-xs font-bold tracking-widest text-amber-400 uppercase">
                FAVOURITE SQUADRON FIGHTER
              </div>
              {(() => {
                const fav = getFighterById(getFavouriteFighterId(profile));
                return (
                  <div className="flex items-center gap-4">
                    <img
                      src={fav.spriteAsset}
                      alt={fav.name}
                      className="w-20 h-28 object-contain rounded-xl bg-slate-950 p-2 border border-slate-800"
                    />
                    <div>
                      <div className="text-xl font-black text-white uppercase">
                        {fav.name}
                      </div>
                      <div className="text-xs text-cyan-400 font-bold">
                        {fav.specialName}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{fav.lore}</p>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
              <div className="text-xs font-bold tracking-widest text-purple-400 uppercase">
                UNLOCKED BANNER TITLES
              </div>
              <div className="flex flex-wrap gap-2">
                {profile.unlockedBannerTitles.map((title) => (
                  <button
                    key={title}
                    type="button"
                    onClick={async () => {
                      const next = { ...profile, selectedBannerTitle: title };
                      setProfile(next);
                      await saveProgressionProfile(next);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase border cursor-pointer ${
                      profile.selectedBannerTitle === title
                        ? 'bg-purple-500/25 border-purple-400 text-purple-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    {title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ===================================================================== */}
      {/* SCREEN 6: BATTLE HISTORY                                              */}
      {/* ===================================================================== */}
      {screen === 'HISTORY' && (
        <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold tracking-widest text-emerald-400 uppercase">
                LOCAL INDEXEDDB COMBAT LOGS
              </div>
              <h2 className="text-2xl font-black text-white uppercase">
                RECENT BATTLE HISTORY
              </h2>
            </div>
          </div>

          {profile.battleHistory.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center space-y-3">
              <Swords className="w-10 h-10 text-slate-600 mx-auto" />
              <div className="text-base font-bold text-slate-300">
                No arena battles recorded yet.
              </div>
              <p className="text-xs text-slate-500">
                Complete a Player vs AI match to log your combat telemetry offline.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {profile.battleHistory.map((item) => {
                const pFighter = getFighterById(item.playerFighterId);
                const oFighter = getFighterById(item.opponentFighterId);
                const arena = getArenaById(item.arenaId);
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2.5 py-1 rounded text-xs font-black uppercase ${
                          item.result === 'VICTORY'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {item.result}
                      </span>
                      <div>
                        <div className="text-sm font-black text-white uppercase">
                          {pFighter.name}{' '}
                          <span className="text-slate-500">VS</span>{' '}
                          {oFighter.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          {arena.name} • {item.difficulty} AI • {item.winReason} in{' '}
                          {item.durationSeconds}s
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      <div>
                        <span className="text-slate-400">DMG: </span>
                        <strong className="text-cyan-400">{item.damageDealt}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">XP: </span>
                        <strong className="text-amber-400">+{item.xpEarned}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* ===================================================================== */}
      {/* SCREEN 7: SETTINGS & RESET CONFIRMATION                               */}
      {/* ===================================================================== */}
      {screen === 'SETTINGS' && (
        <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-8 space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-5">
            <div>
              <div className="text-xs font-bold tracking-widest text-cyan-400 uppercase">
                LOCAL CONFIGURATION
              </div>
              <h2 className="text-2xl font-black text-white uppercase">
                ARENA & AUDIO SETTINGS
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="flex justify-between text-xs font-bold text-slate-300 mb-1.5">
                  <span>MUSIC SYNTH VOLUME</span>
                  <span>{Math.round(settings.musicVolume * 100)}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.musicVolume}
                  onChange={(e) =>
                    updateSettingsState({
                      musicVolume: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <label className="flex justify-between text-xs font-bold text-slate-300 mb-1.5">
                  <span>COMBAT SFX VOLUME</span>
                  <span>{Math.round(settings.sfxVolume * 100)}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.sfxVolume}
                  onChange={(e) =>
                    updateSettingsState({
                      sfxVolume: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-cyan-400"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <div className="text-sm font-bold text-white">
                    Show On-Screen Touch Controls on Desktop
                  </div>
                  <div className="text-xs text-slate-400">
                    Enable touch buttons alongside keyboard controls
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showTouchControlsOnDesktop}
                  onChange={(e) =>
                    updateSettingsState({
                      showTouchControlsOnDesktop: e.target.checked,
                    })
                  }
                  className="w-5 h-5 accent-cyan-400"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-rose-400">
                    Reset Offline Progression
                  </div>
                  <div className="text-xs text-slate-400">
                    Clears local XP, win/loss records, and battle history
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="open-reset-progress-modal-btn"
                  onClick={() => setShowResetConfirmModal(true)}
                  className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-bold uppercase cursor-pointer"
                >
                  RESET PROGRESS
                </button>
              </div>
            </div>
          </div>

          {showResetConfirmModal && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="max-w-md w-full rounded-2xl border border-rose-500/40 bg-slate-900 p-6 space-y-4">
                <div className="flex items-center gap-3 text-rose-400">
                  <AlertTriangle className="w-6 h-6 shrink-0" />
                  <h3 className="text-lg font-black uppercase">
                    Confirm Progress Reset
                  </h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Are you sure you want to reset your Squadron Showdown local
                  stats, XP, and battle history? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowResetConfirmModal(false)}
                    className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold uppercase cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    data-testid="confirm-reset-progress-btn"
                    onClick={async () => {
                      const fresh = await resetProgressionProfile();
                      setProfile(fresh);
                      setShowResetConfirmModal(false);
                    }}
                    className="px-4 py-2 rounded-lg bg-rose-500 text-white text-xs font-black uppercase cursor-pointer"
                  >
                    CONFIRM RESET
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
};

export default SquadronShowdownGame;
