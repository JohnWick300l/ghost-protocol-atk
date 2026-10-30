import {
  BattleHistoryEntry,
  DifficultyLevel,
  PlayerProgressionProfile,
  SquadronGameSettings,
} from '../types';
import { SQUADRON_ARENAS } from '../arenas/arenas';

const DB_NAME = 'ghost_protocol_squadron_showdown_db';
const DB_VERSION = 1;
const STORE_PROFILE = 'progression_profile';
const STORE_SETTINGS = 'game_settings';
const LOCAL_PROFILE_KEY = 'gp_squadron_showdown_profile_v1';
const LOCAL_SETTINGS_KEY = 'gp_squadron_showdown_settings_v1';

export const DEFAULT_PROGRESSION_PROFILE: PlayerProgressionProfile = {
  totalBattles: 0,
  totalWins: 0,
  totalLosses: 0,
  xp: 0,
  level: 1,
  unlockedArenaIds: SQUADRON_ARENAS.map((a) => a.id),
  unlockedBannerTitles: [
    'SQUADRON ROOKIE',
    'STREET INTERCEPTOR',
    'HIGH-VOLTAGE VANGUARD',
  ],
  selectedBannerTitle: 'HIGH-VOLTAGE VANGUARD',
  fighterUsage: {},
  battleHistory: [],
};

export const DEFAULT_GAME_SETTINGS: SquadronGameSettings = {
  musicVolume: 0.45,
  sfxVolume: 0.8,
  muted: false,
  defaultDifficulty: 'MEDIUM',
  showTouchControlsOnDesktop: false,
  allowMirrorMatchInArena: false,
};

export function calculateLevelFromXp(xp: number): number {
  return Math.max(1, Math.floor(xp / 250) + 1);
}

export function calculateMatchXp(params: {
  result: 'VICTORY' | 'DEFEAT' | 'DRAW';
  difficulty: DifficultyLevel;
  winReason: 'KO' | 'TIME_OUT';
  successfulAttacks: number;
  specialMovesUsed: number;
}): number {
  const base =
    params.result === 'VICTORY' ? 120 : params.result === 'DRAW' ? 65 : 45;
  const diffMult =
    params.difficulty === 'HARD'
      ? 1.5
      : params.difficulty === 'MEDIUM'
      ? 1.2
      : 1.0;
  const koBonus = params.result === 'VICTORY' && params.winReason === 'KO' ? 35 : 0;
  const combatBonus = Math.min(60, params.successfulAttacks * 3 + params.specialMovesUsed * 12);
  return Math.round((base + koBonus + combatBonus) * diffMult);
}

export function applyMatchToProfile(
  profile: PlayerProgressionProfile,
  entry: BattleHistoryEntry
): PlayerProgressionProfile {
  const next: PlayerProgressionProfile = {
    ...profile,
    totalBattles: profile.totalBattles + 1,
    totalWins: profile.totalWins + (entry.result === 'VICTORY' ? 1 : 0),
    totalLosses: profile.totalLosses + (entry.result === 'DEFEAT' ? 1 : 0),
    xp: profile.xp + entry.xpEarned,
    level: calculateLevelFromXp(profile.xp + entry.xpEarned),
    unlockedArenaIds: [...profile.unlockedArenaIds],
    unlockedBannerTitles: [...profile.unlockedBannerTitles],
    fighterUsage: { ...profile.fighterUsage },
    battleHistory: [entry, ...profile.battleHistory].slice(0, 50),
  };

  const prevUsage = next.fighterUsage[entry.playerFighterId] || {
    fighterId: entry.playerFighterId,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    totalDamageDealt: 0,
  };

  next.fighterUsage[entry.playerFighterId] = {
    fighterId: entry.playerFighterId,
    matchesPlayed: prevUsage.matchesPlayed + 1,
    wins: prevUsage.wins + (entry.result === 'VICTORY' ? 1 : 0),
    losses: prevUsage.losses + (entry.result === 'DEFEAT' ? 1 : 0),
    totalDamageDealt: prevUsage.totalDamageDealt + entry.damageDealt,
  };

  if (next.totalWins >= 3 && !next.unlockedBannerTitles.includes('REDLINE DOMINATOR')) {
    next.unlockedBannerTitles.push('REDLINE DOMINATOR');
  }
  if (next.totalWins >= 10 && !next.unlockedBannerTitles.includes('APEX SQUADRON LEGEND')) {
    next.unlockedBannerTitles.push('APEX SQUADRON LEGEND');
  }

  return next;
}

export function getFavouriteFighterId(profile: PlayerProgressionProfile): string {
  const entries = Object.values(profile.fighterUsage);
  if (entries.length === 0) return 'FIGHTER_001';
  entries.sort((a, b) => b.matchesPlayed - a.matchesPlayed || b.wins - a.wins);
  return entries[0].fighterId;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_PROFILE)) {
          db.createObjectStore(STORE_PROFILE);
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function loadProgressionProfile(): Promise<PlayerProgressionProfile> {
  try {
    const db = await openDatabase();
    if (db) {
      const fromIdb = await new Promise<PlayerProgressionProfile | null>((resolve) => {
        const tx = db.transaction(STORE_PROFILE, 'readonly');
        const store = tx.objectStore(STORE_PROFILE);
        const req = store.get('main');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      if (fromIdb) {
        return { ...DEFAULT_PROGRESSION_PROFILE, ...fromIdb };
      }
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(LOCAL_PROFILE_KEY);
      if (raw) {
        return { ...DEFAULT_PROGRESSION_PROFILE, ...JSON.parse(raw) };
      }
    }
  } catch {
    // Fallback to default
  }
  return { ...DEFAULT_PROGRESSION_PROFILE };
}

export async function saveProgressionProfile(profile: PlayerProgressionProfile): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(profile));
    }
    const db = await openDatabase();
    if (db) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_PROFILE, 'readwrite');
        const store = tx.objectStore(STORE_PROFILE);
        store.put(profile, 'main');
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  } catch {
    // Ignore storage quota errors
  }
}

export async function resetProgressionProfile(): Promise<PlayerProgressionProfile> {
  const fresh = { ...DEFAULT_PROGRESSION_PROFILE, fighterUsage: {}, battleHistory: [] };
  await saveProgressionProfile(fresh);
  return fresh;
}

export async function loadGameSettings(): Promise<SquadronGameSettings> {
  try {
    const db = await openDatabase();
    if (db) {
      const fromIdb = await new Promise<SquadronGameSettings | null>((resolve) => {
        const tx = db.transaction(STORE_SETTINGS, 'readonly');
        const store = tx.objectStore(STORE_SETTINGS);
        const req = store.get('main');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      if (fromIdb) {
        return { ...DEFAULT_GAME_SETTINGS, ...fromIdb };
      }
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(LOCAL_SETTINGS_KEY);
      if (raw) {
        return { ...DEFAULT_GAME_SETTINGS, ...JSON.parse(raw) };
      }
    }
  } catch {
    // Fallback to default
  }
  return { ...DEFAULT_GAME_SETTINGS };
}

export async function saveGameSettings(settings: SquadronGameSettings): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
    }
    const db = await openDatabase();
    if (db) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_SETTINGS, 'readwrite');
        const store = tx.objectStore(STORE_SETTINGS);
        store.put(settings, 'main');
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  } catch {
    // Ignore storage errors
  }
}
