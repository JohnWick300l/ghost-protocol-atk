import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Phaser from './engine/canvasPhaserShim';
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
  Shuffle,
  Dices,
  Smile,
  ChevronDown,
  ChevronUp,
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
  const [showBonusFighters, setShowBonusFighters] = useState<boolean>(false);
  const [showMoveGuide, setShowMoveGuide] = useState<boolean>(false);

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

  const handleSetOpponent = (e: React.MouseEvent, fighterId: string) => {
    e.stopPropagation();
    gameAudio.playMenuClick();
    if (
      fighterId === playerFighterId &&
      !settings.allowMirrorMatchInArena &&
      !isTrainingMode
    ) {
      return;
    }
    setOpponentFighterId(fighterId);
  };

  const handleRandomRival = () => {
    gameAudio.playMenuClick();
    const pool = SQUADRON_ROSTER.filter((f) => f.id !== playerFighterId);
    if (pool.length > 0) {
      const picked = pool[Math.floor(Math.random() * pool.length)];
      setOpponentFighterId(picked.id);
    }
  };

  const handleSwapFighters = () => {
    gameAudio.playMenuClick();
    const prevP1 = playerFighterId;
    const prevAI = opponentFighterId;
    setPlayerFighterId(prevAI);
    setOpponentFighterId(prevP1);
  };

  // Keyboard shortcut: Space or Enter to quickly launch fight from selection screen
  useEffect(() => {
    if (screen !== 'MAIN_MENU' && screen !== 'CHARACTER_SELECT') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        startBattleNow(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, isTrainingMode, playerFighterId, opponentFighterId, arenaId, difficulty]);

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
        <header className="w-full border-b border-cyan-500/20 bg-[#070b16]/95 backdrop-blur-md px-3 sm:px-8 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2 z-20">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button
              type="button"
              onClick={handleBackToGhostProtocol}
              data-testid="back-to-ghost-protocol-btn"
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-[11px] sm:text-xs font-bold tracking-wider text-cyan-400 transition cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">EXIT</span>
              <span className="inline xs:hidden">BACK</span>
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-sm shadow-cyan-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs sm:text-base font-black tracking-wider sm:tracking-widest text-white uppercase flex items-center gap-1.5 truncate">
                  <span className="truncate">SQUADRON SHOWDOWN</span>
                  <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[8px] sm:text-[9px] font-bold shrink-0">
                    1V1
                  </span>
                </div>
                <div className="text-[9px] sm:text-[10px] tracking-[0.15em] sm:tracking-[0.25em] text-cyan-400 font-semibold uppercase truncate">
                  MOBILE ARCADE ARENA
                </div>
              </div>
            </div>
          </div>

          {/* Clean Nav Tabs */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                gameAudio.playMenuClick();
                setScreen('CHARACTER_SELECT');
              }}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-black tracking-wider uppercase transition cursor-pointer flex items-center gap-1 ${
                screen === 'MAIN_MENU' || screen === 'CHARACTER_SELECT'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'bg-slate-900/80 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              <Swords className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>ARENA</span>
            </button>

            <button
              type="button"
              data-testid="menu-fighter-profile-btn"
              onClick={() => {
                gameAudio.playMenuClick();
                setScreen('PROFILE');
              }}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-black tracking-wider uppercase transition cursor-pointer flex items-center gap-1 ${
                screen === 'PROFILE'
                  ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20'
                  : 'bg-slate-900/80 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
              <span className="hidden sm:inline">DOSSIER</span>
              <span className="inline sm:hidden">STATS</span>
            </button>

            <button
              type="button"
              data-testid="menu-battle-history-btn"
              onClick={() => {
                gameAudio.playMenuClick();
                setScreen('HISTORY');
              }}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-black tracking-wider uppercase transition cursor-pointer flex items-center gap-1 ${
                screen === 'HISTORY'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-900/80 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              <History className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
              <span>LOGS</span>
            </button>

            <button
              type="button"
              data-testid="menu-settings-btn"
              onClick={() => {
                gameAudio.playMenuClick();
                setScreen('SETTINGS');
              }}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-black tracking-wider uppercase transition cursor-pointer flex items-center gap-1 ${
                screen === 'SETTINGS'
                  ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                  : 'bg-slate-900/80 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              <Settings className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-sky-400" />
              <span className="hidden sm:inline">CONFIG</span>
            </button>

            <button
              type="button"
              onClick={() => updateSettingsState({ muted: !settings.muted })}
              aria-label={settings.muted ? 'Unmute Audio' : 'Mute Audio'}
              className="p-1.5 sm:p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-slate-300 cursor-pointer shrink-0"
            >
              {settings.muted ? (
                <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
              )}
            </button>
          </div>
        </header>
      )}

      {/* ===================================================================== */}
      {/* SCREEN 1 & 2: REFINED ARCADE BATTLE HUB & FIGHTER SELECTOR            */}
      {/* ===================================================================== */}
      {(screen === 'MAIN_MENU' || screen === 'CHARACTER_SELECT') && (
        <main className="flex-1 max-w-4xl w-full mx-auto p-3 sm:p-5 space-y-3.5 sm:space-y-4">
          {/* 1. HERO MATCHUP & INSTANT START CARD */}
          <div className="rounded-2xl border border-cyan-500/40 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/98 p-3 sm:p-4 shadow-xl space-y-3">
            {/* Top Action Row: Prominent 1-Tap START FIGHT */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="launch-battle-btn"
                onClick={() => startBattleNow(false)}
                className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 active:scale-[0.98] text-slate-950 font-black tracking-wider text-sm sm:text-base uppercase shadow-lg shadow-cyan-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Swords className="w-5 h-5 text-slate-950 shrink-0" />
                <span>START FIGHT!</span>
              </button>

              <button
                type="button"
                data-testid="menu-training-btn"
                onClick={() => startBattleNow(true)}
                className="py-3.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-300 font-bold text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer transition shrink-0"
                title="Practice moves without taking match damage"
              >
                <Flame className="w-4 h-4 text-amber-400" />
                <span className="hidden xs:inline">TRAINING</span>
              </button>
            </div>

            {/* Hidden Test Compatibility Buttons */}
            <button
              type="button"
              data-testid="menu-start-battle-btn"
              onClick={() => startBattleNow(false)}
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
            >
              Start Battle
            </button>
            <button
              type="button"
              data-testid="menu-character-select-btn"
              onClick={() => setScreen('CHARACTER_SELECT')}
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
            >
              Character Select
            </button>

            {/* Matchup Showcase: Clean side-by-side fighter preview */}
            <div className="grid grid-cols-11 items-stretch gap-1.5 sm:gap-3 bg-slate-950/70 rounded-xl p-2.5 sm:p-3 border border-slate-800/80">
              {/* P1 Section */}
              <div
                onClick={() => setSelectTarget('PLAYER')}
                className={`col-span-5 p-2.5 rounded-xl transition cursor-pointer flex flex-col sm:flex-row items-center sm:items-start gap-2 h-full overflow-hidden ${
                  selectTarget === 'PLAYER'
                    ? 'bg-cyan-950/50 border border-cyan-400 ring-2 ring-cyan-500/30'
                    : 'bg-slate-900/60 hover:bg-slate-900/80 border border-slate-800'
                }`}
              >
                <img
                  src={playerDef.spriteAsset}
                  alt={playerDef.name}
                  className="w-12 h-16 sm:w-16 sm:h-24 object-contain drop-shadow shrink-0"
                />
                <div className="text-center sm:text-left min-w-0 flex-1 flex flex-col justify-center w-full">
                  <div>
                    <span className="inline-block px-1.5 py-0.5 rounded bg-cyan-400 text-slate-950 text-[9px] font-black tracking-wider uppercase">
                      P1 (YOU)
                    </span>
                  </div>
                  <h3 className="text-xs sm:text-sm font-black text-white uppercase truncate mt-0.5">
                    {playerDef.name}
                  </h3>
                  <p className="text-[10px] text-cyan-300 font-bold truncate">
                    {playerDef.title}
                  </p>
                  {playerDef.tagline && (
                    <p className="text-[9.5px] sm:text-xs text-amber-300 font-semibold italic mt-1 leading-snug break-words whitespace-normal">
                      &ldquo;{playerDef.tagline}&rdquo;
                    </p>
                  )}
                  <p className="text-[9px] text-slate-400 truncate mt-0.5 hidden xs:block">
                    ⚡ {playerDef.specialName}
                  </p>
                </div>
              </div>

              {/* Center VS & Quick Swap */}
              <div className="col-span-1 flex flex-col items-center justify-center gap-1.5 py-1">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 via-amber-500 to-cyan-400 flex items-center justify-center font-black text-xs text-slate-950 shadow-md animate-pulse">
                  VS
                </div>
                <button
                  type="button"
                  onClick={handleSwapFighters}
                  title="Swap P1 & CPU"
                  className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  <Shuffle className="w-3 h-3 text-cyan-400" />
                </button>
              </div>

              {/* CPU Section */}
              <div
                onClick={() => setSelectTarget('AI')}
                className={`col-span-5 p-2.5 rounded-xl transition cursor-pointer flex flex-col sm:flex-row-reverse items-center sm:items-start gap-2 h-full overflow-hidden ${
                  selectTarget === 'AI'
                    ? 'bg-rose-950/50 border border-rose-400 ring-2 ring-rose-500/30'
                    : 'bg-slate-900/60 hover:bg-slate-900/80 border border-slate-800'
                }`}
              >
                <img
                  src={opponentDef.spriteAsset}
                  alt={opponentDef.name}
                  className="w-12 h-16 sm:w-16 sm:h-24 object-contain drop-shadow transform scale-x-[-1] shrink-0"
                />
                <div className="text-center sm:text-right min-w-0 flex-1 flex flex-col justify-center w-full">
                  <div>
                    <span className="inline-block px-1.5 py-0.5 rounded bg-rose-500 text-white text-[9px] font-black tracking-wider uppercase">
                      CPU RIVAL
                    </span>
                  </div>
                  <h3 className="text-xs sm:text-sm font-black text-white uppercase truncate mt-0.5">
                    {opponentDef.name}
                  </h3>
                  <p className="text-[10px] text-rose-300 font-bold truncate">
                    {opponentDef.title}
                  </p>
                  {opponentDef.tagline && (
                    <p className="text-[9.5px] sm:text-xs text-amber-300 font-semibold italic mt-1 leading-snug break-words whitespace-normal">
                      &ldquo;{opponentDef.tagline}&rdquo;
                    </p>
                  )}
                  <p className="text-[9px] text-slate-400 truncate mt-0.5 hidden xs:block">
                    ⚡ {opponentDef.specialName}
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Controls: Difficulty & Arena */}
            <div className="grid grid-cols-2 gap-2 pt-1 text-[10px]">
              {/* Difficulty Selector */}
              <div className="flex items-center justify-between bg-slate-950/80 rounded-xl px-2.5 py-1.5 border border-slate-800">
                <span className="text-slate-400 font-black uppercase text-[9px]">AI DIFF</span>
                <div className="flex gap-1">
                  {(['EASY', 'MEDIUM', 'HARD'] as DifficultyLevel[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        gameAudio.playMenuClick();
                        setDifficulty(d);
                      }}
                      className={`px-2 py-0.5 rounded text-[9px] font-black uppercase transition cursor-pointer ${
                        difficulty === d
                          ? 'bg-cyan-400 text-slate-950 shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Arena Quick Dropdown */}
              <div className="flex items-center justify-between bg-slate-950/80 rounded-xl px-2.5 py-1.5 border border-slate-800">
                <span className="text-slate-400 font-black uppercase text-[9px]">ARENA</span>
                <select
                  value={arenaId}
                  onChange={(e) => {
                    gameAudio.playMenuClick();
                    setArenaId(e.target.value);
                  }}
                  className="bg-slate-900 text-cyan-300 font-bold text-[10px] rounded px-1.5 py-0.5 border border-slate-700 focus:outline-none cursor-pointer max-w-[120px] truncate"
                >
                  {SQUADRON_ARENAS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Move & Strike Testing Lab Drawer */}
            <div className="border-t border-slate-800/80 pt-2">
              <details className="group">
                <summary className="flex items-center justify-between text-[11px] text-slate-400 hover:text-cyan-300 font-bold cursor-pointer select-none py-1">
                  <span className="flex items-center gap-1.5">
                    <span>🔬</span>
                    <span>TEST FIGHTER MOVES IN 60FPS LAB</span>
                  </span>
                  <span className="text-[10px] group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4 bg-slate-950/60 rounded-xl p-3 border border-slate-800/60 mt-1">
                  <div className="text-center">
                    <span className="text-[10px] font-black text-cyan-400 uppercase">P1 MOVE TEST</span>
                    <InteractiveFighterPreview fighter={playerDef} mirrored={false} showMoveTester={true} />
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] font-black text-rose-400 uppercase">CPU MOVE TEST</span>
                    <InteractiveFighterPreview fighter={opponentDef} mirrored={true} showMoveTester={true} />
                  </div>
                </div>
              </details>
            </div>
          </div>

          {/* 2. FIGHTER ROSTER SELECTION SECTION */}
          <div className="space-y-2.5">
            {/* Pick Target Switcher & Quick Random */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectTarget('PLAYER')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition cursor-pointer flex items-center gap-1.5 ${
                    selectTarget === 'PLAYER'
                      ? 'bg-cyan-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>🎮 Pick P1 (You)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectTarget('AI')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition cursor-pointer flex items-center gap-1.5 ${
                    selectTarget === 'AI'
                      ? 'bg-rose-500 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>🤖 Pick Rival</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleRandomRival}
                className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/40 text-rose-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                title="Pick Random CPU Rival"
              >
                <Dices className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden xs:inline">RANDOM</span>
              </button>
            </div>

            {/* Main Roster Grid: 8 Official Legends */}
            <div className="grid grid-cols-2 xs:grid-cols-4 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {OFFICIAL_FIGHTERS.map((fighter) => {
                const isP1 = playerFighterId === fighter.id;
                const isAI = opponentFighterId === fighter.id;

                return (
                  <div
                    key={fighter.id}
                    data-testid={`roster-card-${fighter.id}`}
                    onClick={() => {
                      if (selectTarget === 'PLAYER') {
                        setPlayerFighterId(fighter.id);
                        gameAudio.playFighterSelect();
                      } else {
                        setOpponentFighterId(fighter.id);
                        gameAudio.playMenuClick();
                      }
                    }}
                    className={`group relative rounded-xl p-2 border flex flex-col items-center justify-between transition-all duration-150 cursor-pointer active:scale-95 ${
                      isP1 && isAI
                        ? 'border-purple-400 bg-purple-950/40 ring-2 ring-purple-500/40'
                        : isP1
                        ? 'border-cyan-400 bg-cyan-950/40 ring-2 ring-cyan-500/40 shadow-lg shadow-cyan-500/20'
                        : isAI
                        ? 'border-rose-500 bg-rose-950/40 ring-2 ring-rose-500/40 shadow-lg shadow-rose-500/20'
                        : 'border-slate-800 bg-slate-900/80 hover:border-slate-600'
                    }`}
                  >
                    {/* Badges */}
                    <div className="w-full flex items-center justify-between min-h-[16px]">
                      <div className="flex gap-1">
                        {isP1 && (
                          <span className="px-1 py-0.2 rounded bg-cyan-400 text-slate-950 text-[8px] font-black">
                            P1
                          </span>
                        )}
                        {isAI && (
                          <span className="px-1 py-0.2 rounded bg-rose-500 text-white text-[8px] font-black">
                            CPU
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleSetOpponent(e, fighter.id)}
                        className={`text-[8px] font-bold px-1 rounded uppercase ${
                          isAI
                            ? 'text-rose-300'
                            : 'text-slate-500 hover:text-rose-300'
                        }`}
                        title="Quick Rival"
                      >
                        {isAI ? '✓ RIVAL' : '+ RIVAL'}
                      </button>
                    </div>

                    {/* Avatar */}
                    <div className="h-16 sm:h-20 w-full flex items-center justify-center my-1">
                      <img
                        src={fighter.spriteAsset}
                        alt={fighter.name}
                        className="h-full w-auto object-contain transition-transform group-hover:scale-105"
                      />
                    </div>

                    {/* Info */}
                    <div className="w-full text-center">
                      <div className="text-[11px] sm:text-xs font-black text-white uppercase truncate">
                        {fighter.name}
                      </div>
                      <div className="text-[8px] text-slate-400 font-bold truncate">
                        {fighter.title}
                      </div>
                      {fighter.tagline && (
                        <div
                          className="text-[8.5px] leading-tight text-amber-300 italic font-semibold mt-1 px-0.5 break-words whitespace-normal text-center"
                          title={fighter.tagline}
                        >
                          &ldquo;{fighter.tagline}&rdquo;
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 4 Bonus Circuit Biker Fighters (Collapsible) */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-2.5">
              <button
                type="button"
                onClick={() => setShowBonusFighters(!showBonusFighters)}
                className="w-full flex items-center justify-between text-xs font-black tracking-wider text-purple-400 uppercase hover:text-purple-300 transition cursor-pointer"
              >
                <span>⚡ CIRCUIT BIKER ROSTER (4 BONUS RIDERS)</span>
                {showBonusFighters ? (
                  <ChevronUp className="w-4 h-4 text-purple-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-purple-400" />
                )}
              </button>

              {showBonusFighters && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2.5">
                  {BONUS_FIGHTERS.map((fighter) => {
                    const isP1 = playerFighterId === fighter.id;
                    const isAI = opponentFighterId === fighter.id;

                    return (
                      <div
                        key={fighter.id}
                        data-testid={`roster-card-${fighter.id}`}
                        onClick={() => {
                          if (selectTarget === 'PLAYER') {
                            setPlayerFighterId(fighter.id);
                            gameAudio.playFighterSelect();
                          } else {
                            setOpponentFighterId(fighter.id);
                            gameAudio.playMenuClick();
                          }
                        }}
                        className={`rounded-xl p-2 border flex items-center gap-2 cursor-pointer transition ${
                          isP1
                            ? 'border-cyan-400 bg-cyan-950/40 ring-1 ring-cyan-500/40'
                            : isAI
                            ? 'border-rose-500 bg-rose-950/40 ring-1 ring-rose-500/40'
                            : 'border-slate-800 bg-slate-900/80 hover:border-purple-600/60'
                        }`}
                      >
                        <img
                          src={fighter.spriteAsset}
                          alt={fighter.name}
                          className="w-10 h-14 object-contain shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black text-white uppercase truncate">
                              {fighter.name}
                            </span>
                            {isP1 && <span className="text-[8px] font-bold text-cyan-300">P1</span>}
                            {isAI && <span className="text-[8px] font-bold text-rose-300">CPU</span>}
                          </div>
                          <div className="text-[9px] text-slate-400 truncate">{fighter.title}</div>
                          {fighter.tagline && (
                            <div className="text-[8.5px] text-amber-300 italic font-semibold leading-snug mt-0.5 break-words whitespace-normal" title={fighter.tagline}>
                              &ldquo;{fighter.tagline}&rdquo;
                            </div>
                          )}
                          <div className="text-[8px] text-cyan-400 truncate">⚡ {fighter.specialName}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 3. ARENA SELECTION GRID */}
          <div className="space-y-2">
            <div className="text-xs font-black tracking-widest text-cyan-400 uppercase">
              SELECT ARENA: <span className="text-white">{selectedArena.name}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                    className={`rounded-xl p-2.5 border text-left transition-all cursor-pointer ${
                      selected
                        ? 'border-cyan-400 bg-slate-900 shadow-md ring-1 ring-cyan-500/40'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span
                        className="text-[9px] font-black tracking-widest uppercase"
                        style={{ color: arena.themeColor }}
                      >
                        {arena.code}
                      </span>
                      {selected && (
                        <span className="px-1 py-0.2 rounded bg-cyan-400/20 text-cyan-300 text-[8px] font-black">
                          ✓
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-black text-white uppercase truncate">
                      {arena.name}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {arena.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. COMBAT CONTROLS & HOW TO PLAY (Collapsible Drawer) */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/80 p-3 text-xs">
            <button
              type="button"
              onClick={() => setShowMoveGuide(!showMoveGuide)}
              className="w-full flex items-center justify-between font-black text-white uppercase text-[11px] cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>🎮 COMBAT CONTROLS & PRO MOVES</span>
              </div>
              <span className="text-slate-400 text-[10px]">
                {showMoveGuide ? 'Hide ▲' : 'Show Moves ▼'}
              </span>
            </button>

            {showMoveGuide && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center mt-3 pt-3 border-t border-slate-800">
                <div className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="font-mono font-black text-cyan-400">A / D · ◀ / ▶</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">Move Left / Right</div>
                </div>
                <div className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="font-mono font-black text-cyan-400">W · ▲</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">Jump / Evade</div>
                </div>
                <div className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="font-mono font-black text-cyan-400">S · ▼</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">Crouch / Duck</div>
                </div>
                <div className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="font-mono font-black text-emerald-400">J · Space</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">Light Strike</div>
                </div>
                <div className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="font-mono font-black text-emerald-400">K (Hold)</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">Heavy / Charge</div>
                </div>
                <div className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="font-mono font-black text-amber-400">L</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">Guard / Block</div>
                </div>
                <div className="p-1.5 rounded-lg bg-slate-900/80 border border-purple-500/40 bg-purple-950/20">
                  <div className="font-mono font-black text-purple-300">U</div>
                  <div className="text-[9px] text-purple-200 mt-0.5">EX-Special (50%)</div>
                </div>
                <div className="p-1.5 rounded-lg bg-slate-900/80 border border-amber-500/40 bg-amber-950/20">
                  <div className="font-mono font-black text-amber-300">T</div>
                  <div className="text-[9px] text-amber-200 mt-0.5">Taunt (+15 Super)</div>
                </div>
              </div>
            )}
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
            <div className="relative z-20 w-full px-2 sm:px-4 pb-3 pt-1 flex items-end justify-between gap-2 bg-gradient-to-t from-slate-950/95 to-transparent select-none">
              {/* Left Movement D-Pad */}
              <div className="flex items-center gap-1.5">
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
                  className="w-11 h-11 sm:w-13 sm:h-13 rounded-xl bg-slate-900/90 active:bg-cyan-500 active:text-slate-950 border border-slate-700 font-black text-base text-white flex items-center justify-center cursor-pointer shadow-md"
                >
                  ◀
                </button>
                <div className="flex flex-col gap-1">
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
                    className="w-11 h-10 sm:w-13 sm:h-11 rounded-xl bg-slate-900/90 active:bg-cyan-500 active:text-slate-950 border border-slate-700 font-black text-[10px] text-white flex items-center justify-center cursor-pointer shadow-md"
                  >
                    ▲ JUMP
                  </button>
                  <button
                    type="button"
                    onPointerDown={() =>
                      battleSceneRef.current?.setTouchInputState({ down: true })
                    }
                    onPointerUp={() =>
                      battleSceneRef.current?.setTouchInputState({ down: false })
                    }
                    onPointerLeave={() =>
                      battleSceneRef.current?.setTouchInputState({ down: false })
                    }
                    className="w-11 h-8 sm:w-13 sm:h-9 rounded-xl bg-slate-900/90 active:bg-cyan-500 active:text-slate-950 border border-slate-700 font-black text-[9px] text-slate-300 flex items-center justify-center cursor-pointer shadow-md"
                  >
                    ▼ DUCK
                  </button>
                </div>
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
                  className="w-11 h-11 sm:w-13 sm:h-13 rounded-xl bg-slate-900/90 active:bg-cyan-500 active:text-slate-950 border border-slate-700 font-black text-base text-white flex items-center justify-center cursor-pointer shadow-md"
                >
                  ▶
                </button>
              </div>

              {/* Right Combat Action Cluster */}
              <div className="flex flex-col items-end gap-1">
                {/* Top Action Row: PUNCH, KICK, BLOCK */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="touch-punch-btn"
                    onClick={() => battleSceneRef.current?.triggerTouchAction('punch')}
                    className="w-11 h-11 sm:w-13 sm:h-13 rounded-xl bg-sky-500/25 active:bg-sky-400 active:text-slate-950 border border-sky-400/60 font-black text-[10px] sm:text-xs text-sky-200 flex items-center justify-center cursor-pointer shadow-md"
                  >
                    PUNCH
                  </button>
                  <button
                    type="button"
                    data-testid="touch-kick-btn"
                    onClick={() => battleSceneRef.current?.triggerTouchAction('kick')}
                    className="w-11 h-11 sm:w-13 sm:h-13 rounded-xl bg-amber-500/25 active:bg-amber-400 active:text-slate-950 border border-amber-400/60 font-black text-[10px] sm:text-xs text-amber-200 flex items-center justify-center cursor-pointer shadow-md"
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
                    className="w-11 h-11 sm:w-13 sm:h-13 rounded-xl bg-emerald-500/25 active:bg-emerald-400 active:text-slate-950 border border-emerald-400/60 font-black text-[10px] sm:text-xs text-emerald-200 flex items-center justify-center cursor-pointer shadow-md"
                  >
                    BLOCK
                  </button>
                </div>

                {/* Bottom Action Row: SPECIAL, TAUNT */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="touch-special-btn"
                    onClick={() =>
                      battleSceneRef.current?.triggerTouchAction('special')
                    }
                    className="h-9 sm:h-10 px-3 rounded-xl bg-purple-500/30 active:bg-purple-400 active:text-slate-950 border border-purple-400 font-black text-[10px] sm:text-xs text-purple-200 flex items-center justify-center cursor-pointer shadow-md"
                  >
                    ⚡ SPECIAL
                  </button>
                  <button
                    type="button"
                    data-testid="touch-taunt-btn"
                    onClick={() =>
                      battleSceneRef.current?.triggerTouchAction('taunt')
                    }
                    className="h-9 sm:h-10 px-2.5 rounded-xl bg-pink-500/30 active:bg-pink-400 active:text-slate-950 border border-pink-400 font-black text-[10px] sm:text-xs text-pink-200 flex items-center justify-center cursor-pointer shadow-md"
                    title="Taunt & Boost Super Meter (+15%)"
                  >
                    😄 TAUNT
                  </button>
                </div>
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
                <button
                  type="button"
                  data-testid="desktop-taunt-btn"
                  onClick={() =>
                    battleSceneRef.current?.triggerTouchAction('taunt')
                  }
                  className="px-3 py-1.5 rounded-lg bg-pink-500/25 hover:bg-pink-500/40 active:bg-pink-400 active:text-slate-950 border border-pink-400/60 font-black text-pink-200 cursor-pointer flex items-center gap-1.5"
                  title="Taunt / Catchphrase (T) — Laugh & Boosts +15% Super Meter!"
                >
                  😄 T TAUNT (+15% ⚡)
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
                      {fav.tagline && (
                        <div className="text-xs italic font-bold text-amber-300 bg-amber-950/30 border-l-2 border-amber-400 px-2.5 py-1.5 rounded-r mt-2">
                          &ldquo;{fav.tagline}&rdquo;
                        </div>
                      )}
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
