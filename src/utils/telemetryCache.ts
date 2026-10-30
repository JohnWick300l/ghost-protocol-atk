// GHOST PROTOCOL - Versioned LocalStorage + IndexedDB Telemetry Cache, Drafts & Offline Queue Engine
import {
  buildRouteCacheKey,
  generateOfflineCorridorGeometry,
  computeOfflineTileUrlsForRegions,
  type PlaceSuggestion
} from './rules.ts';

export const CURRENT_CACHE_VERSION = 3;
export const SCHEMA_VERSION = '3.0.0';
export const TELEMETRY_CACHE_KEY = 'ghost_protocol_telemetry_cache_v3';
export const CACHE_STORAGE_KEY = TELEMETRY_CACHE_KEY;
export const OFFLINE_QUEUE_KEY = 'ghost_protocol_offline_queue_v3';
export const DELETED_IDS_KEY = 'ghost_protocol_deleted_ids_v1';
export const FORM_DRAFTS_PREFIX = 'ghost_form_draft_v1_';
export const OFFLINE_SYNC_EVENT = 'ghost-offline-queue-updated';
export const DATA_UPDATED_EVENT = 'ghost-data-updated';
export const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 365; // 1 year retention

export const CACHE_KEYS = {
  TELEMETRY: 'ghost_cache_telemetry_v1',
  DISCUSSIONS: 'ghost_cache_discussions_v1',
  PROBLEMS: 'ghost_cache_problems_v1',
  SERVICE: 'ghost_cache_service_v1',
  SERVICE_REVIEWS: 'ghost_cache_service_v1',
  LEADERBOARD: 'ghost_cache_leaderboard_v1',
  CHARGING: 'ghost_cache_charging_v1',
  CHARGING_PLANNING: 'ghost_cache_charging_planning_v1',
  CHARGER_REPORTS: 'ghost_cache_charger_reports_v1',
  MODIFICATIONS: 'ghost_cache_modifications_v1',
  MARKETPLACE: 'ghost_cache_marketplace_v1',
  RIDES: 'ghost_cache_rides_v1',
  VISITED_DESTINATIONS: 'ghost_cache_visited_destinations_v1',
  AUTOPILOT_MISSIONS: 'ghost_cache_autopilot_missions_v1',
  JET_KNOWLEDGE: 'ghost_cache_jet_knowledge_v1',
  JET_SUBMISSIONS: 'ghost_cache_jet_submissions_v1',
  JET_CHAT_HISTORY: 'ghost_cache_jet_chat_history_v1',
  JET_QA_HISTORY: 'ghost_cache_jet_chat_history_v1',
  USERS: 'ghost_cache_users_v1',
  EMERGENCY: 'ghost_cache_emergency_v1',
  CONTRIBUTION_CONFIG: 'ghost_cache_contribution_config_v1',
  CONTRIBUTIONS: 'ghost_cache_contributions_v1',
  POLLS: 'ghost_cache_polls_v1',
  PETITIONS: 'ghost_cache_petitions_v1',
  CACHED_ROUTES: 'ghost_cache_routes_v1',
  CACHED_WEATHER: 'ghost_cache_weather_v1',
  CACHED_PLACES: 'ghost_cache_places_v1',
  NOTIFICATIONS: 'ghost_cache_notifications_v1',
  OFFLINE_PACK_META: 'ghost_cache_offline_pack_meta_v1'
};

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memoryStore = new Map<string, string>();

function getStorage(customStorage?: StorageLike): StorageLike {
  if (customStorage) return customStorage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: (key: string) => (memoryStore.has(key) ? memoryStore.get(key)! : null),
    setItem: (key: string, val: string) => {
      memoryStore.set(key, String(val));
    },
    removeItem: (key: string) => {
      memoryStore.delete(key);
    }
  };
}

export const SESSION_TOKEN_STORAGE_KEY = 'ghost_protocol_session_token';

export function getStoredSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return getStorage().getItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function notifyServiceWorkerSessionToken(token: string | null): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'GP_SESSION_TOKEN',
        token
      });
    }
    navigator.serviceWorker.ready
      .then(reg => {
        reg.active?.postMessage({
          type: 'GP_SESSION_TOKEN',
          token
        });
      })
      .catch(() => {});
  } catch {
    // Ignore SW message error
  }
}

export function setStoredSessionToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      getStorage().setItem(SESSION_TOKEN_STORAGE_KEY, token);
    } else {
      getStorage().removeItem(SESSION_TOKEN_STORAGE_KEY);
    }
    notifyServiceWorkerSessionToken(token);
  } catch {
    // Ignore storage error
  }
}

if (typeof window !== 'undefined') {
  const initialToken = getStoredSessionToken();
  if (initialToken) {
    notifyServiceWorkerSessionToken(initialToken);
  }
}

export function getSessionAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  const token = getStoredSessionToken();
  if (token && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

const nativeWindowFetch: typeof fetch | null =
  typeof window !== 'undefined' && typeof window.fetch === 'function'
    ? window.fetch.bind(window)
    : null;

export function gpApiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const baseFetch = nativeWindowFetch || fetch;
  try {
    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : input?.url || '';
    const isSameOriginApi =
      urlStr.startsWith('/api/') ||
      (typeof window !== 'undefined' &&
        typeof window.location !== 'undefined' &&
        urlStr.startsWith(`${window.location.origin}/api/`));

    if (isSameOriginApi) {
      const nextInit: RequestInit = { ...init };
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      const token = getStoredSessionToken();
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      nextInit.headers = headers;
      if (!nextInit.credentials) {
        nextInit.credentials = 'same-origin';
      }
      if (urlStr.includes('/api/auth/me') || urlStr.includes('/api/auth/accounts')) {
        nextInit.cache = 'no-store';
      }
      return baseFetch(input, nextInit);
    }
  } catch {
    // Fall through to baseFetch
  }
  return baseFetch(input, init);
}

// Safely attempt to wrap window.fetch via Object.defineProperty (never use direct '=' assignment
// because AI Studio's preview iframe defines a getter on window.fetch).
if (typeof window !== 'undefined' && nativeWindowFetch && !(window as any).__gpFetchWrapped) {
  (window as any).__gpFetchWrapped = true;
  try {
    Object.defineProperty(window, 'fetch', {
      value: gpApiFetch,
      configurable: true,
      writable: true
    });
  } catch {
    // Host environment defined window.fetch as non-configurable; callers using gpApiFetch / getSessionAuthHeaders still attach Authorization header directly.
  }
}

const IDB_NAME = 'ghost_protocol_offline_db';
const IDB_VERSION = 1;
const IDB_CACHE_STORE = 'datasets';
const IDB_QUEUE_STORE = 'sync_queue';

function openIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise(resolve => {
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_CACHE_STORE)) {
          db.createObjectStore(IDB_CACHE_STORE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(IDB_QUEUE_STORE)) {
          db.createObjectStore(IDB_QUEUE_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeToIndexedDB(storeName: string, record: any): Promise<void> {
  const db = await openIndexedDB();
  if (!db) return;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function readFromIndexedDB<T>(key: string): Promise<{ data: T; timestamp: string } | null> {
  const db = await openIndexedDB();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(IDB_CACHE_STORE, 'readonly');
      const req = tx.objectStore(IDB_CACHE_STORE).get(key);
      req.onsuccess = () => {
        if (req.result && req.result.data !== undefined) {
          resolve({ data: req.result.data as T, timestamp: req.result.timestamp });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function notifyQueueUpdated(detail?: Record<string, any>) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_EVENT, { detail }));
    } catch {
      // Ignore event errors in non-DOM environments
    }
  }
}

export interface RoutePoint {
  name?: string;
  coordinates: [number, number];
  elevationM?: number;
  time?: string;
  type?: 'start' | 'end' | 'waypoint' | 'charging';
  lat?: number;
  lng?: number;
  elevationMeters?: number;
  speedKmh?: number;
  batterySocPercent?: number;
  timestamp?: string;
}

export interface LatestRideRouteTelemetry {
  rideId?: string;
  rideName?: string;
  missionId?: string;
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  startPoint: RoutePoint;
  endPoint: RoutePoint;
  waypoints?: RoutePoint[];
  gpsTrack: [number, number][];
  totalDistanceKm: number;
  distanceKm?: number;
  durationMin?: number;
  durationMinutes?: number;
  avgSpeedKmh: number;
  topSpeedKmh: number;
  elevationGainM?: number;
  energyConsumedKwh: number;
  avgEfficiencyWhKm?: number;
  efficiencyWhPerKm?: number;
  regenEnergyRecoveredKwh?: number;
  points?: RoutePoint[];
}

export interface BikeTelemetrySnapshot {
  model: string;
  variant?: string;
  socPercent?: number;
  batterySocPercent?: number;
  estimatedRangeKm: number | { glide: number; combat: number; ballistic: number };
  activeMode?: 'Glide' | 'Combat' | 'Ballistic';
  regenLevel: number;
  batteryTempC?: number;
  motorTempC: number;
  odometerKm: number;
  cellDeltaMv?: number;
  tirePressurePsi?: { front: number; rear: number };
  avionicsHealth: 'NOMINAL' | 'ADVISORY' | 'CHECK';
  lastSyncedAt?: string;
  lastPing?: string;
  latestRideRoute?: LatestRideRouteTelemetry;
}

export interface TelemetryDataPayload {
  rides: any[];
  emergencies: any[];
  problems: any[];
  discussions: any[];
  chargingStations: any[];
  notifications: any[];
  bikeTelemetry?: BikeTelemetrySnapshot;
}

export interface VersionedTelemetryCache {
  version: number;
  schemaVersion: string;
  updatedAt: string;
  expiresAt: string;
  checksum?: string;
  data: TelemetryDataPayload;
}

export interface CacheStorageStats {
  version: number;
  schemaVersion: string;
  updatedAt: string;
  expiresAt: string;
  approxSizeKb: number;
  sizeBytes: number;
  recordCount: number;
  totalRecords?: number;
  queuedActionsCount: number;
  relativeAge: string;
  isValid: boolean;
  breakdown: {
    rides: number;
    emergencies: number;
    problems: number;
    discussions: number;
    chargingStations: number;
    notifications: number;
  };
  hasBikeTelemetry: boolean;
}

export type OfflineModuleType =
  | 'discussions'
  | 'charging'
  | 'modifications'
  | 'problems'
  | 'marketplace'
  | 'service'
  | 'mission'
  | 'autopilot'
  | 'jet_engineer'
  | 'garage'
  | 'general';

export interface QueuedOfflineAction {
  id: string;
  clientRequestId: string;
  type?: string;
  endpoint: string;
  url: string;
  method: 'POST' | 'PUT' | 'DELETE';
  body: any;
  payload: any;
  headers?: Record<string, string>;
  module?: OfflineModuleType;
  queuedAt: string;
  createdAt: string;
  description: string;
  label?: string;
  lastAttemptAt?: string;
  retryCount?: number;
  status?: 'pending_sync' | 'syncing' | 'failed';
  lastError?: string;
}

export type QueuedRequest = QueuedOfflineAction;

export function getDefaultBikeTelemetry(): BikeTelemetrySnapshot {
  return {
    model: 'Ultraviolette F77 MACH 2 Recon',
    variant: 'Recon Laser Black (10.3 kWh)',
    socPercent: 88,
    estimatedRangeKm: 261,
    activeMode: 'Combat',
    regenLevel: 10,
    batteryTempC: 34,
    motorTempC: 42,
    odometerKm: 3420,
    cellDeltaMv: 8,
    tirePressurePsi: { front: 32.0, rear: 32.5 },
    avionicsHealth: 'NOMINAL',
    lastSyncedAt: new Date().toISOString()
  };
}

export function migrateCachePayload(raw: any): VersionedTelemetryCache | null {
  if (!raw || typeof raw !== 'object') return null;

  const now = new Date();
  const defaultExpires = new Date(now.getTime() + DEFAULT_TTL_MS).toISOString();

  if (raw.version === CURRENT_CACHE_VERSION && raw.data) {
    return {
      version: CURRENT_CACHE_VERSION,
      schemaVersion: raw.schemaVersion || SCHEMA_VERSION,
      updatedAt: raw.updatedAt || now.toISOString(),
      expiresAt: raw.expiresAt || defaultExpires,
      data: {
        rides: Array.isArray(raw.data.rides) ? raw.data.rides : [],
        emergencies: Array.isArray(raw.data.emergencies) ? raw.data.emergencies : [],
        problems: Array.isArray(raw.data.problems) ? raw.data.problems : [],
        discussions: Array.isArray(raw.data.discussions) ? raw.data.discussions : [],
        chargingStations: Array.isArray(raw.data.chargingStations) ? raw.data.chargingStations : [],
        notifications: Array.isArray(raw.data.notifications) ? raw.data.notifications : [],
        bikeTelemetry: raw.data.bikeTelemetry || getDefaultBikeTelemetry()
      }
    };
  }

  if (typeof raw.version === 'number' && raw.data) {
    return {
      version: CURRENT_CACHE_VERSION,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: raw.updatedAt || now.toISOString(),
      expiresAt: defaultExpires,
      data: {
        rides: Array.isArray(raw.data.rides) ? raw.data.rides : [],
        emergencies: Array.isArray(raw.data.emergencies) ? raw.data.emergencies : [],
        problems: Array.isArray(raw.data.problems) ? raw.data.problems : [],
        discussions: Array.isArray(raw.data.discussions) ? raw.data.discussions : [],
        chargingStations: Array.isArray(raw.data.chargingStations) ? raw.data.chargingStations : [],
        notifications: Array.isArray(raw.data.notifications) ? raw.data.notifications : [],
        bikeTelemetry: raw.data.bikeTelemetry || getDefaultBikeTelemetry()
      }
    };
  }

  if (Array.isArray(raw.rides) || Array.isArray(raw.problems)) {
    return {
      version: CURRENT_CACHE_VERSION,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: now.toISOString(),
      expiresAt: defaultExpires,
      data: {
        rides: Array.isArray(raw.rides) ? raw.rides : [],
        emergencies: Array.isArray(raw.emergencies) ? raw.emergencies : [],
        problems: Array.isArray(raw.problems) ? raw.problems : [],
        discussions: Array.isArray(raw.discussions) ? raw.discussions : [],
        chargingStations: Array.isArray(raw.chargingStations) ? raw.chargingStations : [],
        notifications: Array.isArray(raw.notifications) ? raw.notifications : [],
        bikeTelemetry: getDefaultBikeTelemetry()
      }
    };
  }

  return null;
}

export function isCacheExpired(payload: VersionedTelemetryCache | null, nowMs: number = Date.now()): boolean {
  if (!payload || !payload.expiresAt) return true;
  const expiryTime = Date.parse(payload.expiresAt);
  if (Number.isNaN(expiryTime)) return true;
  return nowMs > expiryTime;
}

export function loadCachedTelemetry(storage?: StorageLike): VersionedTelemetryCache | null {
  const store = getStorage(storage);
  try {
    const rawStr = store.getItem(TELEMETRY_CACHE_KEY);
    if (!rawStr) return null;
    const parsed = JSON.parse(rawStr);
    return migrateCachePayload(parsed);
  } catch {
    return null;
  }
}

export function saveCachedTelemetry(
  data: Partial<TelemetryDataPayload>,
  storage?: StorageLike,
  ttlMs: number = DEFAULT_TTL_MS
): boolean {
  const store = getStorage(storage);
  try {
    const existing = loadCachedTelemetry(store);
    const now = new Date();
    const payload: VersionedTelemetryCache = {
      version: CURRENT_CACHE_VERSION,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      data: {
        rides: data.rides ?? existing?.data.rides ?? [],
        emergencies: data.emergencies ?? existing?.data.emergencies ?? [],
        problems: data.problems ?? existing?.data.problems ?? [],
        discussions: data.discussions ?? existing?.data.discussions ?? [],
        chargingStations: data.chargingStations ?? existing?.data.chargingStations ?? [],
        notifications: data.notifications ?? existing?.data.notifications ?? [],
        bikeTelemetry: data.bikeTelemetry ?? existing?.data.bikeTelemetry ?? getDefaultBikeTelemetry()
      }
    };
    store.setItem(TELEMETRY_CACHE_KEY, JSON.stringify(payload));
    void writeToIndexedDB(IDB_CACHE_STORE, {
      key: TELEMETRY_CACHE_KEY,
      data: payload,
      timestamp: payload.updatedAt
    });
    return true;
  } catch {
    return false;
  }
}

export function clearCachedTelemetry(storage?: StorageLike): void {
  const store = getStorage(storage);
  try {
    store.removeItem(TELEMETRY_CACHE_KEY);
  } catch {
    // ignore
  }
}

export function getCacheRelativeAge(updatedAtIso?: string | null, nowMs: number = Date.now()): string {
  if (!updatedAtIso) return 'Never';
  const updatedMs = Date.parse(updatedAtIso);
  if (Number.isNaN(updatedMs)) return 'Unknown';

  const diffSec = Math.max(0, Math.floor((nowMs - updatedMs) / 1000));
  if (diffSec < 30) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export function getCacheStorageStats(storage?: StorageLike): CacheStorageStats | null {
  const store = getStorage(storage);
  try {
    const rawStr = store.getItem(TELEMETRY_CACHE_KEY);
    if (!rawStr) return null;
    const payload = migrateCachePayload(JSON.parse(rawStr));
    if (!payload) return null;

    const approxSizeKb = Math.round((rawStr.length / 1024) * 100) / 100;
    const recordCount =
      payload.data.rides.length +
      payload.data.emergencies.length +
      payload.data.problems.length +
      payload.data.discussions.length +
      payload.data.chargingStations.length;

    return {
      version: payload.version,
      schemaVersion: payload.schemaVersion,
      updatedAt: payload.updatedAt,
      expiresAt: payload.expiresAt,
      approxSizeKb,
      sizeBytes: rawStr.length * 2,
      recordCount,
      totalRecords: recordCount,
      queuedActionsCount: getOfflineQueue(store).length,
      relativeAge: getCacheRelativeAge(payload.updatedAt),
      isValid: true,
      breakdown: {
        rides: payload.data.rides.length,
        emergencies: payload.data.emergencies.length,
        problems: payload.data.problems.length,
        discussions: payload.data.discussions.length,
        chargingStations: payload.data.chargingStations.length,
        notifications: payload.data.notifications.length
      },
      hasBikeTelemetry: Boolean(payload.data.bikeTelemetry)
    };
  } catch {
    return null;
  }
}

export function getDeletedIds(storage?: StorageLike): string[] {
  const store = getStorage(storage);
  try {
    const raw = store.getItem(DELETED_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
    if (parsed && Array.isArray(parsed.data)) {
      return parsed.data.filter((x: any): x is string => typeof x === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

export function recordDeletedId(idOrIds: string | string[], storage?: StorageLike): void {
  const store = getStorage(storage);
  const incoming = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).filter(Boolean);
  if (incoming.length === 0) return;

  const existing = new Set(getDeletedIds(store));
  let changed = false;
  for (const id of incoming) {
    if (!existing.has(id)) {
      existing.add(id);
      changed = true;
    }
  }
  if (!changed) return;

  const updated = Array.from(existing);
  const timestamp = new Date().toISOString();
  try {
    store.setItem(DELETED_IDS_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage quota warning
  }
  void writeToIndexedDB(IDB_CACHE_STORE, { key: DELETED_IDS_KEY, data: updated, timestamp });
}

export function saveToCache<T>(key: string, data: T, options?: { silent?: boolean }): void {
  const timestamp = new Date().toISOString();
  const entry = { data, timestamp };
  try {
    getStorage().setItem(key, JSON.stringify(entry));
  } catch (e) {
    console.warn('LocalStorage quota warning, relying on IndexedDB:', e);
  }
  void writeToIndexedDB(IDB_CACHE_STORE, { key, data, timestamp });

  // Automatically keep TELEMETRY_CACHE_KEY in sync when core collections update
  if (Array.isArray(data)) {
    if (key === CACHE_KEYS.RIDES) {
      saveCachedTelemetry({ rides: data as any });
    } else if (key === CACHE_KEYS.EMERGENCY) {
      saveCachedTelemetry({ emergencies: data as any });
    } else if (key === CACHE_KEYS.PROBLEMS) {
      saveCachedTelemetry({ problems: data as any });
    } else if (key === CACHE_KEYS.DISCUSSIONS) {
      saveCachedTelemetry({ discussions: data as any });
    } else if (key === CACHE_KEYS.CHARGING) {
      saveCachedTelemetry({ chargingStations: data as any });
    }
  }

  if (!options?.silent && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(DATA_UPDATED_EVENT, { detail: { key, timestamp } }));
    } catch {
      // Ignore in test environments
    }
  }
}

export function loadFromCache<T>(key: string): { data: T; timestamp: string } | null;
export function loadFromCache<T>(key: string, fallback: T): T;
export function loadFromCache<T>(key: string, fallback?: T): any {
  const hasFallback = arguments.length >= 2;
  try {
    const raw = getStorage().getItem(key);
    if (!raw) return hasFallback ? fallback : null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.data !== undefined) {
      return hasFallback ? (parsed.data as T) : parsed;
    }
    return hasFallback ? (parsed as T) : { data: parsed as T, timestamp: new Date().toISOString() };
  } catch {
    return hasFallback ? fallback : null;
  }
}

export async function loadFromCacheAsync<T>(key: string): Promise<{ data: T; timestamp: string } | null> {
  const syncResult = loadFromCache<T>(key);
  if (syncResult) return syncResult;
  const idbResult = await readFromIndexedDB<T>(key);
  if (idbResult) {
    try {
      getStorage().setItem(key, JSON.stringify(idbResult));
    } catch {
      // Ignore quota errors
    }
  }
  return idbResult;
}

export function saveFormDraft<T>(draftKey: string, draftData: T): void {
  try {
    getStorage().setItem(
      `${FORM_DRAFTS_PREFIX}${draftKey}`,
      JSON.stringify({
        data: draftData,
        updatedAt: new Date().toISOString()
      })
    );
  } catch {
    // Ignore storage quota warning
  }
}

export function loadFormDraft<T>(draftKey: string): T | null;
export function loadFormDraft<T>(draftKey: string, fallback: T): T;
export function loadFormDraft<T>(draftKey: string, fallback?: T): any {
  const hasFallback = arguments.length >= 2;
  try {
    const raw = getStorage().getItem(`${FORM_DRAFTS_PREFIX}${draftKey}`);
    if (!raw) return hasFallback ? fallback : null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.data !== undefined) {
      return parsed.data as T;
    }
    return hasFallback ? fallback : null;
  } catch {
    return hasFallback ? fallback : null;
  }
}

export function clearFormDraft(draftKey: string): void {
  try {
    getStorage().removeItem(`${FORM_DRAFTS_PREFIX}${draftKey}`);
  } catch {
    // Ignore
  }
}

export function getOfflineQueue(storage?: StorageLike): QueuedOfflineAction[] {
  const store = getStorage(storage);
  try {
    const raw = store.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function queueOfflineAction(
  action: {
    endpoint: string;
    method: 'POST' | 'PUT' | 'DELETE';
    body: any;
    description: string;
    clientRequestId?: string;
  },
  storage?: StorageLike
): QueuedOfflineAction {
  const store = getStorage(storage);
  const current = getOfflineQueue(store);
  const nowIso = new Date().toISOString();
  const clientRequestId =
    action.clientRequestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const item: QueuedOfflineAction = {
    id: `qa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    clientRequestId,
    endpoint: action.endpoint,
    url: action.endpoint,
    method: action.method,
    body: action.body,
    payload: action.body,
    description: action.description,
    label: action.description,
    queuedAt: nowIso,
    createdAt: nowIso,
    retryCount: 0,
    status: 'pending_sync'
  };
  const updated = [...current, item];
  try {
    store.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  notifyQueueUpdated({ action: 'enqueued', item, queueLength: updated.length });
  return item;
}

export function enqueueOfflineAction(
  urlOrAction:
    | string
    | {
        type?: string;
        endpoint: string;
        method: 'POST' | 'PUT' | 'DELETE';
        body: Record<string, any>;
        description: string;
        clientRequestId?: string;
        module?: OfflineModuleType;
        headers?: Record<string, string>;
      },
  method?: 'POST' | 'PUT' | 'DELETE',
  payload?: any,
  optionsOrLabel?:
    | string
    | {
        module?: OfflineModuleType;
        label?: string;
        headers?: Record<string, string>;
        clientRequestId?: string;
        type?: string;
      },
  explicitClientRequestId?: string
): QueuedOfflineAction {
  const queue = getOfflineQueue();

  let targetUrl: string;
  let targetMethod: 'POST' | 'PUT' | 'DELETE';
  let targetPayload: any;
  let targetModule: OfflineModuleType = 'general';
  let targetLabel: string;
  let targetHeaders: Record<string, string> | undefined;
  let targetType: string | undefined;
  let rawClientReqId: string | undefined;

  if (typeof urlOrAction === 'string') {
    targetUrl = urlOrAction;
    targetMethod = method || 'POST';
    targetPayload = payload || {};
    if (typeof optionsOrLabel === 'string') {
      targetLabel = optionsOrLabel;
      rawClientReqId = explicitClientRequestId || targetPayload?.clientRequestId;
    } else {
      targetModule = optionsOrLabel?.module || 'general';
      targetLabel = optionsOrLabel?.label || `${targetMethod} ${targetUrl}`;
      targetHeaders = optionsOrLabel?.headers;
      targetType = optionsOrLabel?.type;
      rawClientReqId =
        optionsOrLabel?.clientRequestId || explicitClientRequestId || targetPayload?.clientRequestId;
    }
  } else {
    targetUrl = urlOrAction.endpoint;
    targetMethod = urlOrAction.method;
    targetPayload = urlOrAction.body || {};
    targetModule = urlOrAction.module || 'general';
    targetLabel = urlOrAction.description || `${targetMethod} ${targetUrl}`;
    targetHeaders = urlOrAction.headers;
    targetType = urlOrAction.type;
    rawClientReqId = urlOrAction.clientRequestId || targetPayload?.clientRequestId;
  }

  const clientRequestId =
    rawClientReqId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const existingIdx = queue.findIndex(item => item.clientRequestId === clientRequestId);
  const nowIso = new Date().toISOString();
  const payloadWithReqId =
    targetPayload && typeof targetPayload === 'object'
      ? { ...targetPayload, clientRequestId }
      : targetPayload;

  const newItem: QueuedOfflineAction = {
    id: existingIdx >= 0 ? queue[existingIdx].id : `qa_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    clientRequestId,
    type: targetType || 'general',
    endpoint: targetUrl,
    url: targetUrl,
    method: targetMethod,
    body: payloadWithReqId,
    payload: payloadWithReqId,
    headers: targetHeaders,
    module: targetModule,
    queuedAt: existingIdx >= 0 ? queue[existingIdx].queuedAt : nowIso,
    createdAt: existingIdx >= 0 ? queue[existingIdx].createdAt : nowIso,
    description: targetLabel,
    label: targetLabel,
    retryCount: 0,
    status: 'pending_sync'
  };

  if (existingIdx >= 0) {
    queue[existingIdx] = newItem;
  } else {
    queue.push(newItem);
  }

  try {
    getStorage().setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('Offline queue save failed:', e);
  }
  void writeToIndexedDB(IDB_QUEUE_STORE, newItem);
  notifyQueueUpdated({ action: 'enqueued', item: newItem, queueLength: queue.length });
  return newItem;
}

export function clearOfflineQueue(storage?: StorageLike): void {
  const store = getStorage(storage);
  try {
    store.removeItem(OFFLINE_QUEUE_KEY);
    notifyQueueUpdated({ action: 'cleared_all', queueLength: 0 });
  } catch {
    // Ignore
  }
}

export function clearOfflineQueueItem(id: string): void {
  try {
    const queue = getOfflineQueue().filter(item => item.id !== id);
    getStorage().setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    notifyQueueUpdated({ action: 'cleared', id, queueLength: queue.length });
  } catch (e) {
    console.warn('Failed to clear queue item:', e);
  }
}

export function updateOfflineQueueItem(id: string, patch: Partial<QueuedOfflineAction>): void {
  try {
    const queue = getOfflineQueue().map(item => (item.id === id ? { ...item, ...patch } : item));
    getStorage().setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    notifyQueueUpdated({ action: 'updated', id, queueLength: queue.length });
  } catch {
    // Ignore
  }
}

let isSyncInProgress = false;

export async function processOfflineQueue(
  onSuccess?: (item: QueuedOfflineAction, responseData: any) => void
): Promise<number> {
  if (isSyncInProgress) return 0;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;
  const queue = getOfflineQueue();
  if (queue.length === 0) return 0;

  isSyncInProgress = true;
  let syncedCount = 0;

  try {
    for (const item of queue) {
      updateOfflineQueueItem(item.id, {
        status: 'syncing',
        lastAttemptAt: new Date().toISOString()
      });
      const targetUrl = item.url || item.endpoint;
      const targetPayload = item.payload ?? item.body;
      try {
        const res = await gpApiFetch(targetUrl, {
          method: item.method,
          credentials: 'same-origin',
          headers: getSessionAuthHeaders({
            'Content-Type': 'application/json',
            'x-client-request-id': item.clientRequestId,
            ...(item.headers || {})
          }),
          body: item.method !== 'DELETE' || targetPayload ? JSON.stringify(targetPayload) : undefined
        });

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          clearOfflineQueueItem(item.id);
          syncedCount++;
          if (onSuccess) onSuccess(item, data);
        } else if (res.status === 401) {
          updateOfflineQueueItem(item.id, {
            status: 'pending_sync',
            lastError: 'Sign in required to sync queued action'
          });
        } else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          const errData = await res.json().catch(() => ({}));
          updateOfflineQueueItem(item.id, {
            status: 'failed',
            retryCount: (item.retryCount || 0) + 1,
            lastError: errData.error || `Server rejected request (${res.status})`
          });
        } else {
          updateOfflineQueueItem(item.id, {
            status: 'pending_sync',
            retryCount: (item.retryCount || 0) + 1,
            lastError: `Temporary server error (${res.status})`
          });
        }
      } catch (e: any) {
        updateOfflineQueueItem(item.id, {
          status: 'pending_sync',
          retryCount: (item.retryCount || 0) + 1,
          lastError: e?.message || 'Network unreachable'
        });
      }
    }
  } finally {
    isSyncInProgress = false;
    notifyQueueUpdated({ action: 'synced', syncedCount, queueLength: getOfflineQueue().length });
  }

  return syncedCount;
}

export function normalizeMarketplaceResponse(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.listings)) return data.listings;
  return [];
}

/**
 * Pure ownership & role verification helper.
 * Supports both canUserModifyRecord(currentUser, record) and canUserModifyRecord(record, currentUser).
 */
export function canUserModifyRecord(firstArg: any, secondArg: any): boolean {
  if (!firstArg || !secondArg) return false;

  // Determine which argument is the User and which is the Record
  const firstIsUser =
    typeof firstArg.role === 'string' ||
    typeof firstArg.verificationStatus === 'string' ||
    ('fullName' in firstArg && !('userId' in firstArg) && !('authorId' in firstArg) && !('sellerId' in firstArg));

  const currentUser = firstIsUser ? firstArg : secondArg;
  const record = firstIsUser ? secondArg : firstArg;

  if (!currentUser || !record) return false;
  if (
    currentUser.role === 'owner' ||
    currentUser.isOwner === true ||
    currentUser.role === 'admin' ||
    currentUser.role === 'superadmin'
  ) {
    return true;
  }
  const uid = currentUser.id;
  if (uid) {
    if (record.userId && record.userId === uid) return true;
    if (record.authorId && record.authorId === uid) return true;
    if (record.sellerId && record.sellerId === uid) return true;
    if (record.submittedByUserId && record.submittedByUserId === uid) return true;
    if (record.rideLeaderId && record.rideLeaderId === uid) return true;
  }
  const fullName = currentUser.fullName?.trim().toLowerCase();
  if (fullName) {
    if (record.authorName?.trim().toLowerCase() === fullName) return true;
    if (record.reporterName?.trim().toLowerCase() === fullName) return true;
    if (record.sellerName?.trim().toLowerCase() === fullName) return true;
    if (record.reportedBy?.trim().toLowerCase() === fullName) return true;
  }
  return false;
}

export function mergeServerAndQueuedRecords<T extends { id: string; clientRequestId?: string }>(
  serverRecords: T[],
  queuedItems: T[]
): T[] {
  const deletedSet = new Set(getDeletedIds());
  const seenIds = new Set<string>();
  const seenClientReqIds = new Set<string>();
  const result: T[] = [];

  for (const item of serverRecords) {
    if (!item || deletedSet.has(item.id)) continue;
    seenIds.add(item.id);
    if (item.clientRequestId) seenClientReqIds.add(item.clientRequestId);
    result.push(item);
  }

  for (const qItem of queuedItems) {
    if (!qItem || deletedSet.has(qItem.id)) continue;
    if (seenIds.has(qItem.id)) continue;
    if (qItem.clientRequestId && seenClientReqIds.has(qItem.clientRequestId)) continue;
    result.unshift(qItem);
  }

  return result;
}

function mergeArrayById(serverArr?: any[], localArr?: any[], deletedSet?: Set<string>): any[] | undefined {
  if (!Array.isArray(serverArr) && !Array.isArray(localArr)) return undefined;
  const sList = Array.isArray(serverArr) ? serverArr : [];
  const lList = Array.isArray(localArr) ? localArr : [];
  if (lList.length === 0) return sList.filter(x => !x?.id || !deletedSet?.has(x.id));
  if (sList.length === 0) return lList.filter(x => !x?.id || !deletedSet?.has(x.id));

  const seenIds = new Set<string>();
  const seenReqIds = new Set<string>();
  const merged: any[] = [];

  for (const item of sList) {
    if (!item) continue;
    const itemId = item.id || item.userId;
    if (itemId && deletedSet?.has(itemId)) continue;
    if (itemId) seenIds.add(String(itemId));
    if (item.clientRequestId) seenReqIds.add(String(item.clientRequestId));
    merged.push(item);
  }

  for (const item of lList) {
    if (!item) continue;
    const itemId = item.id || item.userId;
    if (itemId && deletedSet?.has(itemId)) continue;
    if (itemId && seenIds.has(String(itemId))) continue;
    if (item.clientRequestId && seenReqIds.has(String(item.clientRequestId))) continue;
    const cleaned = { ...item };
    delete cleaned.pendingSync;
    merged.push(cleaned);
  }

  return merged;
}

function mergeSingleRecord<T extends Record<string, any>>(
  serverItem: T,
  localItem: T,
  deletedSet: Set<string>
): T {
  const sTime = Date.parse(serverItem.updatedAt || serverItem.lastVerifiedDate || serverItem.createdAt || '') || 0;
  const lTime = Date.parse(localItem.updatedAt || localItem.lastVerifiedDate || localItem.createdAt || '') || 0;
  const base = lTime > sTime ? { ...serverItem, ...localItem } : { ...localItem, ...serverItem };
  delete (base as any).pendingSync;

  if (Array.isArray(serverItem.comments) || Array.isArray(localItem.comments)) {
    (base as any).comments = mergeArrayById(serverItem.comments, localItem.comments, deletedSet);
  }
  if (Array.isArray(serverItem.updates) || Array.isArray(localItem.updates)) {
    (base as any).updates = mergeArrayById(serverItem.updates, localItem.updates, deletedSet);
  }
  if (Array.isArray(serverItem.participants) || Array.isArray(localItem.participants)) {
    (base as any).participants = mergeArrayById(serverItem.participants, localItem.participants, deletedSet);
  }
  if (Array.isArray(serverItem.responders) || Array.isArray(localItem.responders)) {
    (base as any).responders = mergeArrayById(serverItem.responders, localItem.responders, deletedSet);
  }
  if (Array.isArray(serverItem.announcements) || Array.isArray(localItem.announcements)) {
    (base as any).announcements = mergeArrayById(serverItem.announcements, localItem.announcements, deletedSet);
  }
  if (Array.isArray(serverItem.bids) || Array.isArray(localItem.bids)) {
    const mergedBids = mergeArrayById(serverItem.bids, localItem.bids, deletedSet) || [];
    mergedBids.sort((a: any, b: any) => (Number(b?.amount) || 0) - (Number(a?.amount) || 0));
    (base as any).bids = mergedBids;
  }
  if (Array.isArray(serverItem.rentalRequests) || Array.isArray(localItem.rentalRequests)) {
    (base as any).rentalRequests = mergeArrayById(serverItem.rentalRequests, localItem.rentalRequests, deletedSet);
  }
  if (serverItem.reactions && localItem.reactions) {
    (base as any).reactions = {
      helpful: Array.from(new Set([...(serverItem.reactions.helpful || []), ...(localItem.reactions.helpful || [])])),
      salute: Array.from(new Set([...(serverItem.reactions.salute || []), ...(localItem.reactions.salute || [])])),
      confirmed: Array.from(new Set([...(serverItem.reactions.confirmed || []), ...(localItem.reactions.confirmed || [])]))
    };
  }
  if (typeof serverItem.upvotes === 'number' && typeof localItem.upvotes === 'number') {
    (base as any).upvotes = Math.max(serverItem.upvotes, localItem.upvotes);
  }

  return base;
}

let reconcileTimeout: ReturnType<typeof setTimeout> | null = null;
let isReconcilingWithServer = false;

export function scheduleServerReconciliation(): void {
  if (typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (reconcileTimeout) clearTimeout(reconcileTimeout);
  reconcileTimeout = setTimeout(() => {
    void reconcileAllCachesWithServer();
  }, 350);
}

/**
 * Merges incoming server records with locally persisted records in localStorage/IndexedDB.
 * Prevents ephemeral container restarts or default seed resets from wiping out user-added data,
 * while respecting intentionally deleted record tombstones.
 */
export function reconcileCollectionWithCache<T extends { id: string; clientRequestId?: string }>(
  cacheKey: string,
  serverItems: T[],
  options?: { appendMissing?: boolean; serverDeletedIds?: string[]; storage?: StorageLike }
): T[] {
  const store = getStorage(options?.storage);
  if (options?.serverDeletedIds && options.serverDeletedIds.length > 0) {
    recordDeletedId(options.serverDeletedIds, store);
  }
  const deletedSet = new Set(getDeletedIds(store));
  const cachedItems = loadFromCache<T[]>(cacheKey, []);
  const rawServerList = Array.isArray(serverItems) ? serverItems : [];
  let needsServerPush = false;

  for (const sItem of rawServerList) {
    if (sItem && sItem.id && deletedSet.has(sItem.id)) {
      // Server still returned a record that was tombstoned locally; push tombstones to server
      needsServerPush = true;
      break;
    }
  }

  const validServer = rawServerList.filter(
    item => item && item.id && !deletedSet.has(item.id)
  );
  const validCached = (Array.isArray(cachedItems) ? cachedItems : []).filter(
    item => item && item.id && !deletedSet.has(item.id)
  );

  const cachedById = new Map<string, T>();
  const cachedByReqId = new Map<string, T>();
  for (const c of validCached) {
    cachedById.set(c.id, c);
    if (c.clientRequestId) cachedByReqId.set(c.clientRequestId, c);
  }

  const seenCachedIds = new Set<string>();

  const mergedServer = validServer.map(sItem => {
    const localMatch =
      cachedById.get(sItem.id) ||
      (sItem.clientRequestId ? cachedByReqId.get(sItem.clientRequestId) : undefined);
    if (!localMatch) return sItem;
    seenCachedIds.add(localMatch.id);
    const merged = mergeSingleRecord(sItem, localMatch, deletedSet);
    // Check if local had extra comments/updates/participants/responders/announcements not on server
    const sComments = Array.isArray((sItem as any).comments) ? (sItem as any).comments.length : 0;
    const mComments = Array.isArray((merged as any).comments) ? (merged as any).comments.length : 0;
    const sUpdates = Array.isArray((sItem as any).updates) ? (sItem as any).updates.length : 0;
    const mUpdates = Array.isArray((merged as any).updates) ? (merged as any).updates.length : 0;
    const sParts = Array.isArray((sItem as any).participants) ? (sItem as any).participants.length : 0;
    const mParts = Array.isArray((merged as any).participants) ? (merged as any).participants.length : 0;
    const sResp = Array.isArray((sItem as any).responders) ? (sItem as any).responders.length : 0;
    const mResp = Array.isArray((merged as any).responders) ? (merged as any).responders.length : 0;
    const sAnn = Array.isArray((sItem as any).announcements) ? (sItem as any).announcements.length : 0;
    const mAnn = Array.isArray((merged as any).announcements) ? (merged as any).announcements.length : 0;
    if (mComments > sComments || mUpdates > sUpdates || mParts > sParts || mResp > sResp || mAnn > sAnn) {
      needsServerPush = true;
    }
    return merged;
  });

  const missingOnServer: T[] = [];
  for (const cItem of validCached) {
    if (seenCachedIds.has(cItem.id)) continue;
    missingOnServer.push(cItem);
    if (!(cItem as any).pendingSync && !String(cItem.id).includes('_local_')) {
      needsServerPush = true;
    }
  }

  const finalList = options?.appendMissing
    ? [...mergedServer, ...missingOnServer]
    : [...missingOnServer, ...mergedServer];

  if (needsServerPush) {
    scheduleServerReconciliation();
  }

  return finalList;
}

export async function reconcileAllCachesWithServer(): Promise<boolean> {
  if (typeof window === 'undefined' || isReconcilingWithServer) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

  isReconcilingWithServer = true;
  try {
    const stripLocalOnly = (items: any[]) =>
      (Array.isArray(items) ? items : []).filter(
        item => item && item.id && !item.pendingSync && !String(item.id).includes('_local_')
      );

    const payload = {
      deletedIds: getDeletedIds(),
      longRidePlanningText: loadFromCache<string>(CACHE_KEYS.CHARGING_PLANNING, ''),
      collections: {
        discussions: stripLocalOnly(loadFromCache<any[]>(CACHE_KEYS.DISCUSSIONS, [])),
        modifications: stripLocalOnly(loadFromCache<any[]>(CACHE_KEYS.MODIFICATIONS, [])),
        chargingStations: stripLocalOnly(loadFromCache<any[]>(CACHE_KEYS.CHARGING, [])),
        chargerReports: stripLocalOnly(loadFromCache<any[]>(CACHE_KEYS.CHARGER_REPORTS, [])),
        problems: stripLocalOnly(loadFromCache<any[]>(CACHE_KEYS.PROBLEMS, [])),
        marketplace: stripLocalOnly(loadFromCache<any[]>(CACHE_KEYS.MARKETPLACE, [])),
        serviceReviews: stripLocalOnly(loadFromCache<any[]>(CACHE_KEYS.SERVICE_REVIEWS, [])),
        jetSubmissions: stripLocalOnly(loadFromCache<any[]>(CACHE_KEYS.JET_SUBMISSIONS, [])),
        jetQaHistory: stripLocalOnly(loadFromCache<any[]>(CACHE_KEYS.JET_QA_HISTORY, [])),
        rides: stripLocalOnly(loadFromCache<any[]>(CACHE_KEYS.RIDES, [])),
        autoPilotMissions: stripLocalOnly(loadFromCache<any[]>(CACHE_KEYS.AUTOPILOT_MISSIONS, [])),
        emergencies: stripLocalOnly(loadFromCache<any[]>(CACHE_KEYS.EMERGENCY, []))
      }
    };

    const token = getStoredSessionToken();
    if (!token) {
      try {
        const snapRes = await gpApiFetch('/api/sync/snapshot');
        if (snapRes.ok) {
          const snapData = await snapRes.json();
          if (Array.isArray(snapData.deletedIds) && snapData.deletedIds.length > 0) {
            recordDeletedId(snapData.deletedIds);
          }
        }
      } catch {
        // ignore
      }
      return true;
    }

    const res = await gpApiFetch('/api/sync/reconcile', {
      method: 'POST',
      credentials: 'same-origin',
      headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if (!res.ok) return false;
    const data = await res.json();
    if (Array.isArray(data.deletedIds) && data.deletedIds.length > 0) {
      recordDeletedId(data.deletedIds);
    }
    return true;
  } catch {
    return false;
  } finally {
    isReconcilingWithServer = false;
  }
}

export async function hydrateAllCachesFromIndexedDB(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const allKeys = [
      ...Object.values(CACHE_KEYS),
      TELEMETRY_CACHE_KEY,
      DELETED_IDS_KEY
    ];
    const uniqueKeys = Array.from(new Set(allKeys));
    let restoredFromIdbCount = 0;
    for (const key of uniqueKeys) {
      const existingLocal = getStorage().getItem(key);
      if (!existingLocal) {
        const idbEntry = await readFromIndexedDB<any>(key);
        if (idbEntry && idbEntry.data !== undefined) {
          try {
            if (key === TELEMETRY_CACHE_KEY || key === DELETED_IDS_KEY) {
              getStorage().setItem(key, JSON.stringify(idbEntry.data));
            } else {
              getStorage().setItem(key, JSON.stringify(idbEntry));
            }
            restoredFromIdbCount++;
          } catch {
            // ignore quota
          }
        }
      }
    }
    // Only schedule full server reconciliation on boot if IndexedDB restored evicted localStorage entries;
    // otherwise, per-collection fetches in reconcileCollectionWithCache will trigger reconciliation if and only if
    // the server is missing cached user records, nested items, or local deletion tombstones.
    if (restoredFromIdbCount > 0) {
      scheduleServerReconciliation();
    }
  } catch {
    // ignore IndexedDB errors
  }
}

export function generateOfflineJetEngineerResponse(
  query: string,
  motorcycleModel: string = 'F77',
  knowledgeBase: Array<{
    title: string;
    motorcycleModel?: string;
    variant?: string;
    symptoms?: string;
    operatingConditions?: string;
    troubleshootingAttempted?: string;
    serviceCentreFindings?: string;
    resolutionOutcome?: string;
    proposedSolution?: string;
    photoUrl?: string;
    stepPhotos?: string[];
    sourceReferences?: string;
    authorName?: string;
    status?: string;
  }> = [],
  cachedProblems: Array<{
    title: string;
    category?: string;
    description?: string;
    warningMessageOrCode?: string;
    troubleshootingAttempted?: string;
    status?: string;
  }> = []
): {
  answer: string;
  source: string;
  aiPowered: false;
  offlineEngine: true;
  matchedCount: number;
  topMatchTitle?: string;
  stepPhotos?: string[];
  includes: (searchString: string) => boolean;
} {
  const normQuestion = (query || '').trim().toLowerCase();
  const qWords = normQuestion
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);

  const conceptMap: Record<string, string[]> = {
    regen: ['regen', 'dynamic regen', 'regenerative', 'braking', 'slip', 'deceleration'],
    charging: ['charge', 'charging', 'supernova', 'socket', '15a', 'boost', 'fast charge', 'derate', 'kw'],
    thermal: ['thermal', 'temperature', 'derate', 'overheat', 'cooling', 'deg', 'bms'],
    belt: ['belt', 'drive', 'tension', 'acoustic', 'frequency', '210', 'hz', 'hertz', 'tooth'],
    console: ['console', 'tft', 'dash', 'display', 'bluetooth', 'ble', 'sync', 'ota', 'flicker', 'arrow'],
    abs: ['abs', 'brake', 'bosch', 'trail-braking', 'disc', 'caliper'],
    battery: ['battery', 'pack', 'cell', 'srb', 'soc', 'voltage', 'delta', '10.3', '7.1']
  };

  const detectedConcepts = Object.entries(conceptMap)
    .filter(([_, keywords]) => keywords.some(k => normQuestion.includes(k)))
    .map(([c]) => c);

  interface ScoredSubmission {
    item: any;
    score: number;
  }

  const scoredSubmissions: ScoredSubmission[] = [];

  for (const s of knowledgeBase || []) {
    if (!s || !s.title) continue;
    let score = 0;

    const titleLower = String(s.title || '').toLowerCase();
    const symptomsLower = String(s.symptoms || '').toLowerCase();
    const resolutionLower = String(s.resolutionOutcome || s.proposedSolution || '').toLowerCase();
    const troubleshootLower = String(s.troubleshootingAttempted || '').toLowerCase();
    const findingsLower = String(s.serviceCentreFindings || '').toLowerCase();
    const combinedText = `${titleLower} ${symptomsLower} ${resolutionLower} ${troubleshootLower} ${findingsLower}`;

    if (titleLower.includes(normQuestion) || normQuestion.includes(titleLower)) {
      score += 60;
    }

    for (const word of qWords) {
      if (titleLower.includes(word)) score += 15;
      else if (symptomsLower.includes(word)) score += 10;
      else if (resolutionLower.includes(word)) score += 12;
      else if (combinedText.includes(word)) score += 4;
    }

    for (const concept of detectedConcepts) {
      if (combinedText.includes(concept)) {
        score += 20;
      }
    }

    const itemModel = String(s.motorcycleModel || '').toLowerCase();
    const targetModel = String(motorcycleModel || '').toLowerCase();
    if (
      targetModel &&
      (itemModel.includes(targetModel) ||
        targetModel.includes(itemModel) ||
        itemModel.includes('both') ||
        targetModel.includes('both'))
    ) {
      score += 15;
    }

    if (s.status === 'Approved') {
      score += 15;
    } else if (s.status === 'Submitted') {
      score += 5;
    }

    if (score > 10) {
      scoredSubmissions.push({ item: s, score });
    }
  }

  scoredSubmissions.sort((a, b) => b.score - a.score);

  const matchedProblems = (cachedProblems || []).filter(p => {
    if (!p || !p.title) return false;
    const hay = `${p.title} ${p.description || ''} ${p.warningMessageOrCode || ''}`.toLowerCase();
    return qWords.some(w => hay.includes(w)) || detectedConcepts.some(c => hay.includes(c));
  });

  const sections: string[] = [
    `[OFFLINE TACTICAL ARCHIVE MODE — ${motorcycleModel || 'F77 / X47'}]`
  ];

  let topTitle = '';

  if (scoredSubmissions.length > 0) {
    const top = scoredSubmissions[0].item;
    topTitle = top.title;
    const isApproved = top.status === 'Approved';
    const topPhotos: string[] = Array.isArray(top.stepPhotos) && top.stepPhotos.length > 0
      ? top.stepPhotos
      : top.photoUrl
      ? [top.photoUrl]
      : [];

    sections.push(
      `EMPIRICAL RECORD FROM TRAIN DATABASE: ${top.title}`,
      `• Verification Status: ${isApproved ? 'Admin Approved Factory / Squadron Bulletin' : 'Community Empirical Submission (Logged in TRAIN)'}`,
      `• Platform Model: ${top.motorcycleModel || 'Ultraviolette F77'} ${top.variant ? `(${top.variant})` : ''}`,
      `\nOPERATIONAL RESOLUTION:`,
      `${top.resolutionOutcome || top.proposedSolution || 'Refer to service protocol.'}`,
      `\nTECHNICAL SYMPTOMS & CONDITIONS:`,
      `• Symptoms: ${top.symptoms}`,
      top.operatingConditions ? `• Operating Context: ${top.operatingConditions}` : '',
      top.troubleshootingAttempted ? `• Field Troubleshooting: ${top.troubleshootingAttempted}` : '',
      top.serviceCentreFindings ? `• Service Hangar Findings: ${top.serviceCentreFindings}` : '',
      topPhotos.length > 0 ? `• Step-by-Step Instruction Photos Attached: ${topPhotos.length} photo(s) available for visual guidance.` : '',
      `\nSOURCE ATTRIBUTION:`,
      `Recorded by ${top.authorName || 'Squadron Pilot'} | Reference: ${top.sourceReferences || 'Tactical Empirical Database'}`
    );

    if (scoredSubmissions.length > 1) {
      sections.push(
        `\nADDITIONAL CORRELATED TRAINING RECORDS (${scoredSubmissions.length - 1}):`,
        ...scoredSubmissions.slice(1, 3).map(
          sub => `• ${sub.item.title} (${sub.item.status || 'Empirical'}): ${sub.item.resolutionOutcome || sub.item.proposedSolution || sub.item.symptoms || ''}`
        )
      );
    }
  }

  if (matchedProblems.length > 0) {
    sections.push(
      `\nRELATED SQUADRON PROBLEM TRACKER ENTRIES:`,
      ...matchedProblems.slice(0, 2).map(
        p => `• [${p.category || 'General'}] ${p.title} (${p.status || 'Active'}): ${p.description || ''}${p.warningMessageOrCode ? ` | Code: ${p.warningMessageOrCode}` : ''}`
      )
    );
  }

  if (scoredSubmissions.length === 0) {
    const isX47 = String(motorcycleModel).includes('X47');
    sections.push(
      `STANDARD ULTRAVIOLETTE ${isX47 ? 'X47' : 'F77 MACH 2 / RECON'} TACTICAL BASELINE:`,
      `• Battery & Thermal Architecture: SRB 10.3 kWh aluminum pack with BMS thermal throttling safety protocols. If charging in high ambient temperatures (>38°C), allow 10-15 mins thermal soak before fast charging.`,
      `• Drivetrain: Gates carbon belt drive nominal frequency 210 Hz (checked with acoustic frequency meter).`,
      `• Charging Protocol: Ensure earthing loop impedance < 2V earth-to-neutral for 15A wall sockets and Boost Chargers.`,
      `• Console & Connectivity: In case of BLE or TFT console display synchronization timeouts, perform standard key-off 30s reset.`,
      `\n• NOTICE: No exact empirical record for this symptom is currently logged in the local TRAIN database.`,
      `• HOW TO TRAIN: Navigate to the TRAIN tab above to submit the verified symptoms and resolution for this issue. Once added, this offline engine will immediately answer future queries with your data.`
    );
  }

  const answerText = sections.filter(Boolean).join('\n\n');
  const topMatch = scoredSubmissions[0]?.item;
  const topStepPhotos = topMatch
    ? (Array.isArray(topMatch.stepPhotos) && topMatch.stepPhotos.length > 0
        ? topMatch.stepPhotos
        : topMatch.photoUrl
        ? [topMatch.photoUrl]
        : undefined)
    : undefined;

  return {
    answer: answerText,
    source: topTitle ? `Offline TRAIN Database: ${topTitle}` : 'Offline Cached Technical Knowledge Base',
    aiPowered: false,
    offlineEngine: true,
    matchedCount: scoredSubmissions.length,
    topMatchTitle: topTitle,
    stepPhotos: topStepPhotos,
    includes: (s: string) => answerText.includes(s)
  };
}

// ============================================================================
// PHONE OFFLINE STORAGE PACK, ROUTE/PLACE/WEATHER CACHE & RECONNECTION SYNC
// ============================================================================

export const OFFLINE_FALLBACK_CHARGING_STATIONS: any[] = [
  {
    id: 'cs_01',
    name: 'Ultraviolette Hangar Supernova Hub - Indiranagar',
    location: '100ft Road, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka',
    latitude: 12.9719,
    longitude: 77.6412,
    chargerType: 'Supernova',
    chargerDetails: 'No separate charger required — Integrated 30 kW Supernova DC Tether.',
    vehicleCompatibility: 'F77 MACH 2, F77 Recon, F77 Original (Supernova DC Port)',
    connectorTypes: ['UV Supernova Dual DC (30 kW)', 'Type 2 AC (7.2 kW)', '15A Standard Socket'],
    powerOutputKw: 30,
    chargerSource: 'Supernova',
    isSupernova: true,
    isCommunityReported: false,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_admin',
    submittedByRole: 'admin',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: 'Free for verified GHOST PROTOCOL members (via UV App RFID token)',
    lastVerifiedDate: '2026-10-17',
    userNotes: 'Twin bays, illuminated, clean lounge with high-speed Wi-Fi and tire pressure station.',
    reportedBy: 'Abinav Thejas K • Owner'
  },
  {
    id: 'cs_02',
    name: 'NH 44 Shell Devanahalli Highway EV Fast Station',
    location: 'Opposite Kempegowda Airport Trumpet Interchange, NH 44, Bengaluru, Karnataka',
    latitude: 13.2085,
    longitude: 77.7082,
    chargerType: 'Type 2',
    uvChargingLink: 'https://www.ultraviolette.com/charging/type2-adapter',
    chargerDetails: 'Ultraviolette (UV) Type 2 charging link and portable Boost/Standard charger required.',
    vehicleCompatibility: 'F77 MACH 2, F77 Recon, F77 Original, Tesseract',
    connectorTypes: ['CCS2 Dual Gun (60 kW)', 'Type 2 AC (22 kW)'],
    powerOutputKw: 60,
    chargerSource: '3rd Party Station',
    isSupernova: false,
    isCommunityReported: true,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_pilot07',
    submittedByRole: 'user',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: '₹18.50 per kWh via Shell Recharge App',
    lastVerifiedDate: '2026-10-15',
    userNotes: 'Compatible with F77 MACH 2 Boost adapter. 20% to 80% SoC achieved in 48 minutes.',
    reportedBy: 'Vikram Sengupta (Apex)'
  },
  {
    id: 'cs_03',
    name: 'Mysuru Highway Squadron Waypoint (CCD Maddur)',
    location: 'Bangalore-Mysore Expressway, Maddur Bypass, Karnataka',
    latitude: 12.5841,
    longitude: 77.0428,
    chargerType: 'Socket',
    chargerDetails: '15A Standard Charger, Boost Charger, or On-Board Charger (OBC) required.',
    vehicleCompatibility: 'All Ultraviolette Models (F77 MACH 2, Recon, Original, Shockwave, X47)',
    connectorTypes: ['15A Industrial Weatherproof Socket', 'Tata Power 30kW CCS2'],
    powerOutputKw: 3.3,
    chargerSource: 'Community Provided Charger',
    isSupernova: false,
    isCommunityReported: true,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_phantom',
    submittedByRole: 'user',
    submittedByPhone: '+91 97410 88231',
    operatingStatus: 'Operational',
    accessConditions: 'Commercial Hours Only',
    pricingType: 'Free',
    chargingCostAmount: 0,
    chargingCostUnit: 'per session',
    availabilityStartTime: '06:30',
    availabilityEndTime: '22:30',
    availabilityDays: 'Daily',
    availabilityTimeText: '06:30 – 22:30 (Daily)',
    requiresReservation: true,
    pricing: 'Free charging for Squadron Pilots (Book reservation slot with owner)',
    lastVerifiedDate: '2026-10-12',
    userNotes: 'Owner confirmed 15A socket works reliably on stock portable brick charger. Reserve slot before arrival.',
    reportedBy: 'Devika Nair (Phantom)',
    reservations: [
      {
        id: 'res_seed_01',
        chargerId: 'cs_03',
        chargerName: 'Mysuru Highway Squadron Waypoint (CCD Maddur)',
        ownerUserId: 'u_phantom',
        ownerName: 'Devika Nair (Phantom)',
        ownerPhone: '+91 97410 88231',
        riderUserId: 'u_pilot07',
        riderName: 'Vikram Sengupta (Apex)',
        riderPhone: '+91 98860 22345',
        riderBikeModel: 'F77 MACH 2',
        reservationDate: '2026-10-29',
        startTime: '08:00',
        endTime: '09:30',
        durationMinutes: 90,
        estimatedKwh: 5,
        pricingType: 'Free',
        chargingCostAmount: 0,
        chargingCostUnit: 'per session',
        estimatedCost: 0,
        vehicleNotes: 'Morning Mysuru breakfast ride top-up',
        status: 'Approved',
        ownerResponseNote: 'Approved! Socket bay #1 reserved for your F77.',
        createdAt: '2026-10-26T09:00:00Z',
        updatedAt: '2026-10-26T09:30:00Z'
      }
    ]
  },
  {
    id: 'cs_04',
    name: 'Pune-Mumbai Expressway Lonavala Type 6 Fast Pod',
    location: 'Food Mall Waypoint KM 54, Mumbai-Pune Expressway, Lonavala, Maharashtra',
    latitude: 18.7557,
    longitude: 73.4091,
    chargerType: 'Type 6',
    chargerDetails: 'No separate charger required — Integrated Type 6 public connector.',
    vehicleCompatibility: 'Tesseract, Shockwave & Type 6 Compatible UV Platforms',
    connectorTypes: ['Type 6 Connector (6.0 kW)', '15A Standard Socket'],
    powerOutputKw: 6,
    chargerSource: '3rd Party Station',
    isSupernova: false,
    isCommunityReported: false,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_admin',
    submittedByRole: 'admin',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: '₹14.00 per kWh',
    lastVerifiedDate: '2026-10-16',
    userNotes: 'Covered two-wheeler bay near highway exit ramp.',
    reportedBy: 'Abinav Thejas (Vanguard) • Admin'
  },
  {
    id: 'cs_05',
    name: 'Ultraviolette Space Station Supernova Hub - Worli',
    location: 'Dr Annie Besant Road, Worli, Mumbai, Maharashtra',
    latitude: 19.0176,
    longitude: 72.8172,
    chargerType: 'Supernova',
    chargerDetails: 'No separate charger required — Direct Supernova DC Fast Tether.',
    vehicleCompatibility: 'F77 MACH 2, F77 Recon, F77 Original',
    connectorTypes: ['UV Supernova Dual DC (30 kW)', '15A Standard Socket'],
    powerOutputKw: 30,
    chargerSource: 'Supernova',
    isSupernova: true,
    isCommunityReported: false,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_admin',
    submittedByRole: 'admin',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: 'Free for verified Ultraviolette owners',
    lastVerifiedDate: '2026-10-18',
    userNotes: '24/7 security guard on site, dedicated F77 parking bays.',
    reportedBy: 'Abinav Thejas (Vanguard) • Admin'
  },
  {
    id: 'cs_06',
    name: 'ECR Mahabalipuram Coastal Squadron Hub',
    location: 'East Coast Road (ECR), Mamallapuram, Chennai Corridor, Tamil Nadu',
    latitude: 12.6208,
    longitude: 80.1945,
    chargerType: 'Type 2',
    uvChargingLink: 'https://www.ultraviolette.com/charging/uv-link',
    chargerDetails: 'Ultraviolette (UV) charging link and portable charger required.',
    vehicleCompatibility: 'F77 MACH 2, F77 Recon, F77 Original',
    connectorTypes: ['Type 2 AC (7.2 kW)', '15A Socket'],
    powerOutputKw: 7.2,
    chargerSource: 'Community Provided Charger',
    isSupernova: false,
    isCommunityReported: true,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_pilot07',
    submittedByRole: 'user',
    submittedByPhone: '+91 98860 22345',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricingType: 'Charged',
    chargingCostAmount: 15,
    chargingCostUnit: 'per kWh',
    availabilityStartTime: '06:00',
    availabilityEndTime: '22:00',
    availabilityDays: 'Daily',
    availabilityTimeText: '06:00 – 22:00 (Daily)',
    requiresReservation: true,
    pricing: 'Charged • ₹15 / kWh (06:00 – 22:00 Daily)',
    lastVerifiedDate: '2026-10-14',
    userNotes: 'Popular weekend breakfast ride stop on ECR. Carry UV Type 2 link adapter & book reservation ahead.',
    reportedBy: 'Vikram Sengupta (Apex)',
    reservations: []
  },
  {
    id: 'cs_07',
    name: 'Connaught Place Outer Circle EV Charging Bay',
    location: 'Block M, Connaught Place, New Delhi, Delhi NCR',
    latitude: 28.6315,
    longitude: 77.2167,
    chargerType: 'Socket',
    chargerDetails: 'Charger or On-Board Charger (OBC) required — 15A industrial socket.',
    vehicleCompatibility: 'All Ultraviolette Models (F77 MACH 2, Recon, Original, Tesseract)',
    connectorTypes: ['15A Industrial Weatherproof Socket'],
    powerOutputKw: 3.3,
    chargerSource: 'Community Provided Charger',
    isSupernova: false,
    isCommunityReported: true,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_phantom',
    submittedByRole: 'user',
    submittedByPhone: '+91 97410 88231',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricingType: 'Charged',
    chargingCostAmount: 50,
    chargingCostUnit: 'per hour',
    availabilityStartTime: '08:00',
    availabilityEndTime: '21:00',
    availabilityDays: 'Daily',
    availabilityTimeText: '08:00 – 21:00 (Daily)',
    requiresReservation: true,
    pricing: 'Charged • ₹50 / hour (08:00 – 21:00 Daily)',
    lastVerifiedDate: '2026-10-15',
    userNotes: 'NDMC public EV parking bay with dedicated 15A earthing verified. Reserve slot with owner before plugging in.',
    reportedBy: 'Devika Nair (Phantom)',
    reservations: []
  },
  {
    id: 'cs_11',
    name: 'UV Supernova Hub — Channapatna Highway (NH 275)',
    location: 'NH 275 Bypass, Beside Kamat Upachar, Channapatna, Karnataka 562160',
    latitude: 12.6518,
    longitude: 77.2067,
    chargerType: 'Supernova',
    uvChargingLink: 'https://www.ultraviolette.com/charging',
    chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charger (2 bays, 24/7 highway access)',
    vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
    connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Industrial Socket'],
    powerOutputKw: 30.0,
    chargerSource: 'Supernova',
    isSupernova: true,
    isCommunityReported: false,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_admin',
    submittedByRole: 'admin',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: 'Free for UV Care+ / ₹14/kWh standard',
    lastVerifiedDate: '2026-10-19',
    userNotes: 'Ideal mid-way charging stop at KM 60 on the Bengaluru–Mysuru highway corridor.',
    reportedBy: 'Ultraviolette Grid Ops'
  },
  {
    id: 'cs_12',
    name: 'Maddur Tiffany’s Highway Type 2 AC Pod (NH 275)',
    location: 'Maddur Tiffany’s Compound, NH 275 Service Road, Maddur, Karnataka 571428',
    latitude: 12.5841,
    longitude: 77.0428,
    chargerType: 'Type 2',
    chargerDetails: '7.2 kW Type 2 AC Smart Wallbox + 16A industrial backup socket in covered bike bay',
    vehicleCompatibility: 'All F77 Variants (with Type 2 adapter or portable charger)',
    connectorTypes: ['IEC 62196 Type 2 AC (7.2 kW)', '16A 3-Pin Socket (230V AC)'],
    powerOutputKw: 7.2,
    chargerSource: '3rd Party Station',
    isSupernova: false,
    isCommunityReported: true,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_pilot07',
    submittedByRole: 'user',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: '₹16.00 per kWh',
    lastVerifiedDate: '2026-10-18',
    userNotes: 'Reliable backup stop 25 km ahead of Channapatna with shaded parking and food court.',
    reportedBy: 'Vikram Sengupta (Apex)'
  },
  {
    id: 'cs_13',
    name: 'UV Supernova Station — Mulbagal Highway Plaza (NH 75)',
    location: 'NH 75 Bengaluru–Chennai Corridor, Near Nandi Grand Plaza, Mulbagal, Karnataka 563131',
    latitude: 13.1645,
    longitude: 78.3932,
    chargerType: 'Supernova',
    uvChargingLink: 'https://www.ultraviolette.com/charging',
    chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Hub on NH 75 Eastbound/Westbound access road',
    vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
    connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Socket'],
    powerOutputKw: 30.0,
    chargerSource: 'Supernova',
    isSupernova: true,
    isCommunityReported: false,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_admin',
    submittedByRole: 'admin',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: 'Free for UV Care+ / ₹14/kWh standard',
    lastVerifiedDate: '2026-10-19',
    userNotes: 'Located ~96 km from Bengaluru Indiranagar along NH 75 toward Tirupati and Chennai.',
    reportedBy: 'Ultraviolette Grid Ops'
  },
  {
    id: 'cs_14',
    name: 'Vellore Green Circle Supernova & Type 6 Hub (NH 48)',
    location: 'NH 48 Service Road, Green Circle Junction, Vellore, Tamil Nadu 632004',
    latitude: 12.9349,
    longitude: 79.1469,
    chargerType: 'Supernova',
    uvChargingLink: 'https://www.ultraviolette.com/charging',
    chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charger + Type 6 Ather Grid co-located bay',
    vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
    connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', 'Type 2 AC (7.2 kW)'],
    powerOutputKw: 30.0,
    chargerSource: 'Supernova',
    isSupernova: true,
    isCommunityReported: false,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_admin',
    submittedByRole: 'admin',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: 'Free for UV Care+ / ₹15/kWh standard',
    lastVerifiedDate: '2026-10-19',
    userNotes: 'Strategic ~205 km midpoint between Bengaluru and Chennai on NH 48.',
    reportedBy: 'Ultraviolette Grid Ops'
  },
  {
    id: 'cs_15',
    name: 'Sriperumbudur Toll Plaza Fast Pod (NH 48)',
    location: 'NH 48 Chennai–Bengaluru Highway, Near Hyundai Gate, Sriperumbudur, Tamil Nadu 602105',
    latitude: 12.9675,
    longitude: 79.9479,
    chargerType: 'Type 6',
    chargerDetails: 'High-speed Type 6 DC Fast Charger (12 kW) + Type 2 7.2 kW AC',
    vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon',
    connectorTypes: ['IEC 62196-3 Type 6 (DC Fast)', 'IEC 62196 Type 2 AC'],
    powerOutputKw: 12.0,
    chargerSource: '3rd Party Station',
    isSupernova: false,
    isCommunityReported: true,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_phantom',
    submittedByRole: 'user',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: '₹17.00 per kWh',
    lastVerifiedDate: '2026-10-18',
    userNotes: 'Located ~300 km from Bengaluru and ~42 km before central Chennai.',
    reportedBy: 'Devika Nair (Phantom)'
  },
  {
    id: 'cs_16',
    name: 'UV Supernova Hub — Tumakuru Highway Bypass (NH 48)',
    location: 'NH 48 Bengaluru–Pune Highway, Sira Road Junction, Tumakuru, Karnataka 572106',
    latitude: 13.3409,
    longitude: 77.101,
    chargerType: 'Supernova',
    uvChargingLink: 'https://www.ultraviolette.com/charging',
    chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Bay at highway food plaza',
    vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
    connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Socket'],
    powerOutputKw: 30.0,
    chargerSource: 'Supernova',
    isSupernova: true,
    isCommunityReported: false,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_admin',
    submittedByRole: 'admin',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: 'Free for UV Care+ / ₹14/kWh standard',
    lastVerifiedDate: '2026-10-19',
    userNotes: 'Primary northbound NH 48 stop ~75 km from Bengaluru.',
    reportedBy: 'Ultraviolette Grid Ops'
  },
  {
    id: 'cs_17',
    name: 'UV Supernova Hub — Krishnagiri Highway Junction (NH 48)',
    location: 'NH 44 / NH 48 Chennai Highway Split, Near A2B Plaza, Krishnagiri, Tamil Nadu 635001',
    latitude: 12.5266,
    longitude: 78.215,
    chargerType: 'Supernova',
    uvChargingLink: 'https://www.ultraviolette.com/charging',
    chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Station (Dual Bay, 24/7 Highway Access)',
    vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
    connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Industrial Socket'],
    powerOutputKw: 30.0,
    chargerSource: 'Supernova',
    isSupernova: true,
    isCommunityReported: false,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_admin',
    submittedByRole: 'admin',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: 'Free for UV Care+ / ₹14/kWh standard',
    lastVerifiedDate: '2026-10-19',
    userNotes: 'Direct highway stop at KM 92 on the Bengaluru–Krishnagiri–Vellore–Chennai NH 48 corridor.',
    reportedBy: 'Ultraviolette Grid Ops'
  },
  {
    id: 'cs_18',
    name: 'Krishnagiri Toll Plaza Type 2 & Socket Backup Pod (NH 48)',
    location: 'NH 48 Service Lane, Beside Saravana Bhavan, Krishnagiri, Tamil Nadu 635001',
    latitude: 12.534,
    longitude: 78.226,
    chargerType: 'Type 2',
    uvChargingLink: 'https://www.ultraviolette.com/charging',
    chargerDetails: '7.2 kW Type 2 AC Wallbox + 16A 3-Pin Industrial Socket',
    vehicleCompatibility: 'All F77 Variants',
    connectorTypes: ['IEC 62196 Type 2 AC (7.2 kW)', '16A 3-Pin Socket'],
    powerOutputKw: 7.2,
    chargerSource: '3rd Party Station',
    isSupernova: false,
    isCommunityReported: true,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_pilot07',
    submittedByRole: 'user',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: '₹15.00 per kWh',
    lastVerifiedDate: '2026-10-18',
    userNotes: 'Reliable backup 1.5 km from Krishnagiri Supernova hub.',
    reportedBy: 'Vikram Sengupta (Apex)'
  },
  {
    id: 'SN-001',
    name: 'Mysuru',
    location: 'Mysuru, Karnataka',
    latitude: 12.3571953,
    longitude: 76.6614688,
    chargerType: 'Supernova',
    uvChargingLink: 'https://www.ultraviolette.com/charging',
    chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Hub — Mysuru.',
    vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
    connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Industrial Socket'],
    powerOutputKw: 30,
    chargerSource: 'Supernova',
    isSupernova: true,
    isCommunityReported: false,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_admin',
    submittedByRole: 'admin',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: 'Free for UV Care+ / Commercial DC Fast',
    lastVerifiedDate: '2026-10-25',
    userNotes: 'Ultraviolette Supernova DC Fast Charging Hub.',
    reportedBy: 'Ultraviolette Grid Ops'
  },
  {
    id: 'SN-002',
    name: 'Coimbatore',
    location: 'Coimbatore, Tamil Nadu',
    latitude: 11.0204155,
    longitude: 76.9922914,
    chargerType: 'Supernova',
    uvChargingLink: 'https://www.ultraviolette.com/charging',
    chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Hub — Coimbatore.',
    vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
    connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Industrial Socket'],
    powerOutputKw: 30,
    chargerSource: 'Supernova',
    isSupernova: true,
    isCommunityReported: false,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_admin',
    submittedByRole: 'admin',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: 'Free for UV Care+ / Commercial DC Fast',
    lastVerifiedDate: '2026-10-25',
    userNotes: 'Ultraviolette Supernova DC Fast Charging Hub.',
    reportedBy: 'Ultraviolette Grid Ops'
  },
  {
    id: 'SN-003',
    name: 'Bengaluru',
    location: 'Bengaluru, Karnataka',
    latitude: 12.9539933,
    longitude: 77.6408874,
    chargerType: 'Supernova',
    uvChargingLink: 'https://www.ultraviolette.com/charging',
    chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Hub — Bengaluru.',
    vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
    connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Industrial Socket'],
    powerOutputKw: 30,
    chargerSource: 'Supernova',
    isSupernova: true,
    isCommunityReported: false,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_admin',
    submittedByRole: 'admin',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: 'Free for UV Care+ / Commercial DC Fast',
    lastVerifiedDate: '2026-10-25',
    userNotes: 'Ultraviolette Supernova DC Fast Charging Hub.',
    reportedBy: 'Ultraviolette Grid Ops'
  },
  {
    id: 'SN-004',
    name: 'Kolar',
    location: 'Kolar, Karnataka',
    latitude: 13.1356771,
    longitude: 78.0154440,
    chargerType: 'Supernova',
    uvChargingLink: 'https://www.ultraviolette.com/charging',
    chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Hub — Kolar.',
    vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
    connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Industrial Socket'],
    powerOutputKw: 30,
    chargerSource: 'Supernova',
    isSupernova: true,
    isCommunityReported: false,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_admin',
    submittedByRole: 'admin',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: 'Free for UV Care+ / Commercial DC Fast',
    lastVerifiedDate: '2026-10-25',
    userNotes: 'Ultraviolette Supernova DC Fast Charging Hub.',
    reportedBy: 'Ultraviolette Grid Ops'
  },
  {
    id: 'SN-005',
    name: 'Devanahalli (North Bengaluru)',
    location: 'Devanahalli (North Bengaluru), Karnataka',
    latitude: 13.3471483,
    longitude: 77.6729970,
    chargerType: 'Supernova',
    uvChargingLink: 'https://www.ultraviolette.com/charging',
    chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Hub — Devanahalli (North Bengaluru).',
    vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
    connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Industrial Socket'],
    powerOutputKw: 30,
    chargerSource: 'Supernova',
    isSupernova: true,
    isCommunityReported: false,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_admin',
    submittedByRole: 'admin',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: 'Free for UV Care+ / Commercial DC Fast',
    lastVerifiedDate: '2026-10-25',
    userNotes: 'Ultraviolette Supernova DC Fast Charging Hub.',
    reportedBy: 'Ultraviolette Grid Ops'
  },
  {
    id: 'SN-006',
    name: 'Kochi',
    location: 'Kochi, Kerala',
    latitude: 10.0094370,
    longitude: 76.3119765,
    chargerType: 'Supernova',
    uvChargingLink: 'https://www.ultraviolette.com/charging',
    chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Hub — Kochi.',
    vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
    connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Industrial Socket'],
    powerOutputKw: 30,
    chargerSource: 'Supernova',
    isSupernova: true,
    isCommunityReported: false,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    submittedByUserId: 'u_admin',
    submittedByRole: 'admin',
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    pricing: 'Free for UV Care+ / Commercial DC Fast',
    lastVerifiedDate: '2026-10-25',
    userNotes: 'Ultraviolette Supernova DC Fast Charging Hub.',
    reportedBy: 'Ultraviolette Grid Ops'
  }
];

export const OFFLINE_FALLBACK_CHARGER_REPORTS: any[] = [
  {
    id: 'crep_06',
    chargerId: 'cs_17',
    userId: 'u_pilot07',
    reporterCallsign: 'Vikram Sengupta (Apex)',
    category: 'SUCCESSFULLY CHARGED',
    comment: 'Krishnagiri Supernova right on NH 48 highway service lane. Charged 30% to 90% in 28 mins.',
    createdAt: '2026-10-19T10:00:00Z',
    sourceLabel: 'Community Report'
  },
  {
    id: 'crep_01',
    chargerId: 'cs_11',
    userId: 'u_pilot07',
    reporterCallsign: 'Vikram Sengupta (Apex)',
    category: 'SUCCESSFULLY CHARGED',
    comment: 'Charged from 24% to 88% in 32 mins on Bay 1 during Sunday morning Mysuru breakfast sortie.',
    createdAt: '2026-10-19T08:15:00Z',
    sourceLabel: 'Community Report'
  },
  {
    id: 'crep_02',
    chargerId: 'cs_12',
    userId: 'u_phantom',
    reporterCallsign: 'Devika Nair (Phantom)',
    category: 'WORKING',
    comment: 'Both the Type 2 wallbox and the 16A industrial backup socket are clean and active.',
    createdAt: '2026-10-18T11:30:00Z',
    sourceLabel: 'Community Report'
  },
  {
    id: 'crep_03',
    chargerId: 'cs_05',
    userId: 'u_pilot07',
    reporterCallsign: 'Vikram Sengupta (Apex)',
    category: 'SUCCESSFULLY CHARGED',
    comment: 'Cafe staff unlocked the outdoor 16A pillar immediately. Stable 232V line voltage.',
    createdAt: '2026-10-17T07:45:00Z',
    sourceLabel: 'Community Report'
  },
  {
    id: 'crep_04',
    chargerId: 'cs_13',
    userId: 'u_admin',
    reporterCallsign: 'Abinav Thejas (Vanguard)',
    category: 'WORKING',
    comment: 'Mulbagal Supernova delivering full 30 kW output. Zero queue on weekday morning.',
    createdAt: '2026-10-19T09:20:00Z',
    sourceLabel: 'Community Report'
  },
  {
    id: 'crep_05',
    chargerId: 'cs_14',
    userId: 'u_phantom',
    reporterCallsign: 'Devika Nair (Phantom)',
    category: 'SUCCESSFULLY CHARGED',
    comment: 'Topped up to 90% at Vellore Green Circle on the way to Chennai Marina.',
    createdAt: '2026-10-18T15:10:00Z',
    sourceLabel: 'Community Report'
  }
];

export interface CachedCorridorRoute {
  key: string;
  startLat: number;
  startLon: number;
  destLat: number;
  destLon: number;
  polyline: [number, number][];
  distanceKm: number | null;
  durationMin: number | null;
  routingAvailable: boolean;
  routingLimitationNote?: string;
  savedAt: string;
}

export function saveCachedRouteToPhone(
  startLat: number,
  startLon: number,
  destLat: number,
  destLon: number,
  routeData: {
    polyline: [number, number][];
    distanceKm: number | null;
    durationMin: number | null;
    routingAvailable: boolean;
    routingLimitationNote?: string;
  },
  storage?: StorageLike
): void {
  const key = buildRouteCacheKey(startLat, startLon, destLat, destLon);
  const store = getStorage(storage);
  let map: Record<string, CachedCorridorRoute> = {};
  try {
    const raw = store.getItem(CACHE_KEYS.CACHED_ROUTES);
    if (raw) {
      const parsed = JSON.parse(raw);
      map = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed || {};
    }
  } catch {
    map = {};
  }

  map[key] = {
    key,
    startLat,
    startLon,
    destLat,
    destLon,
    polyline: routeData.polyline,
    distanceKm: routeData.distanceKm,
    durationMin: routeData.durationMin,
    routingAvailable: routeData.routingAvailable,
    routingLimitationNote: routeData.routingLimitationNote,
    savedAt: new Date().toISOString()
  };

  // Keep up to 40 most recent corridor routes in phone storage
  const keys = Object.keys(map);
  if (keys.length > 40) {
    const sorted = keys.sort(
      (a, b) => (Date.parse(map[b].savedAt) || 0) - (Date.parse(map[a].savedAt) || 0)
    );
    const trimmed: Record<string, CachedCorridorRoute> = {};
    for (const k of sorted.slice(0, 40)) {
      trimmed[k] = map[k];
    }
    map = trimmed;
  }

  const timestamp = new Date().toISOString();
  try {
    store.setItem(CACHE_KEYS.CACHED_ROUTES, JSON.stringify({ data: map, timestamp }));
  } catch {
    // rely on IndexedDB if localStorage quota exceeded
  }
  void writeToIndexedDB(IDB_CACHE_STORE, { key: CACHE_KEYS.CACHED_ROUTES, data: map, timestamp });
}

export function loadCachedRouteFromPhone(
  startLat: number,
  startLon: number,
  destLat: number,
  destLon: number,
  storage?: StorageLike
): CachedCorridorRoute | null {
  const key = buildRouteCacheKey(startLat, startLon, destLat, destLon);
  const store = getStorage(storage);
  try {
    const raw = store.getItem(CACHE_KEYS.CACHED_ROUTES);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const map: Record<string, CachedCorridorRoute> =
      parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed || {};
    return map[key] || null;
  } catch {
    return null;
  }
}

export function getCachedRoutesCount(storage?: StorageLike): number {
  const store = getStorage(storage);
  try {
    const raw = store.getItem(CACHE_KEYS.CACHED_ROUTES);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    const map = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed || {};
    return Object.keys(map).length;
  } catch {
    return 0;
  }
}

export function saveCachedWeatherToPhone(
  startLat: number,
  startLon: number,
  destLat: number,
  destLon: number,
  weatherData: any,
  storage?: StorageLike
): void {
  const key = buildRouteCacheKey(startLat, startLon, destLat, destLon);
  const store = getStorage(storage);
  let map: Record<string, any> = {};
  try {
    const raw = store.getItem(CACHE_KEYS.CACHED_WEATHER);
    if (raw) {
      const parsed = JSON.parse(raw);
      map = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed || {};
    }
  } catch {
    map = {};
  }
  map[key] = {
    ...weatherData,
    savedAt: new Date().toISOString()
  };
  const timestamp = new Date().toISOString();
  try {
    store.setItem(CACHE_KEYS.CACHED_WEATHER, JSON.stringify({ data: map, timestamp }));
  } catch {
    // ignore quota
  }
  void writeToIndexedDB(IDB_CACHE_STORE, { key: CACHE_KEYS.CACHED_WEATHER, data: map, timestamp });
}

export function loadCachedWeatherFromPhone(
  startLat: number,
  startLon: number,
  destLat: number,
  destLon: number,
  storage?: StorageLike
): any | null {
  const key = buildRouteCacheKey(startLat, startLon, destLat, destLon);
  const store = getStorage(storage);
  try {
    const raw = store.getItem(CACHE_KEYS.CACHED_WEATHER);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const map = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed || {};
    return map[key] || null;
  } catch {
    return null;
  }
}

export function saveCachedPlacesToPhone(
  places: PlaceSuggestion[],
  storage?: StorageLike
): void {
  if (!Array.isArray(places) || places.length === 0) return;
  const store = getStorage(storage);
  const existing = loadCachedPlacesFromPhone(store);
  const byId = new Map<string, PlaceSuggestion>();
  for (const p of existing) {
    if (p && p.id) byId.set(p.id, p);
  }
  for (const p of places) {
    if (p && p.id && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) {
      byId.set(p.id, p);
    }
  }
  const merged = Array.from(byId.values()).slice(-150);
  const timestamp = new Date().toISOString();
  try {
    store.setItem(CACHE_KEYS.CACHED_PLACES, JSON.stringify({ data: merged, timestamp }));
  } catch {
    // ignore quota
  }
  void writeToIndexedDB(IDB_CACHE_STORE, { key: CACHE_KEYS.CACHED_PLACES, data: merged, timestamp });
}

export function loadCachedPlacesFromPhone(storage?: StorageLike): PlaceSuggestion[] {
  const store = getStorage(storage);
  try {
    const raw = store.getItem(CACHE_KEYS.CACHED_PLACES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = parsed && Array.isArray(parsed.data) ? parsed.data : Array.isArray(parsed) ? parsed : [];
    return list;
  } catch {
    return [];
  }
}

export interface DeviceOfflineStorageStatus {
  isPersisted: boolean;
  usageMb: number;
  quotaMb: number;
  savedChargersCount: number;
  savedReportsCount: number;
  savedRoutesCount: number;
  savedMissionsCount: number;
  cachedTilesCount: number;
  queuedActionsCount: number;
  lastOfflinePackSavedAt: string | null;
}

export async function requestPersistentPhoneStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage) return false;
  try {
    if (typeof navigator.storage.persisted === 'function') {
      const already = await navigator.storage.persisted();
      if (already) return true;
    }
    if (typeof navigator.storage.persist === 'function') {
      return await navigator.storage.persist();
    }
  } catch {
    // ignore permission errors in iframe
  }
  return false;
}

export async function getDeviceOfflineStorageStatus(): Promise<DeviceOfflineStorageStatus> {
  let isPersisted = false;
  let usageMb = 0;
  let quotaMb = 0;
  let cachedTilesCount = 0;

  if (typeof navigator !== 'undefined' && navigator.storage) {
    try {
      if (typeof navigator.storage.persisted === 'function') {
        isPersisted = await navigator.storage.persisted();
      }
      if (typeof navigator.storage.estimate === 'function') {
        const est = await navigator.storage.estimate();
        if (est.usage) usageMb = Math.round((est.usage / (1024 * 1024)) * 100) / 100;
        if (est.quota) quotaMb = Math.round(est.quota / (1024 * 1024));
      }
    } catch {
      // ignore
    }
  }

  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const tileCache = await window.caches.open('ghost-protocol-tiles-v3');
      const keys = await tileCache.keys();
      cachedTilesCount = keys.length;
    } catch {
      // ignore
    }
  }

  const chargers = loadFromCache<any[]>(CACHE_KEYS.CHARGING, OFFLINE_FALLBACK_CHARGING_STATIONS);
  const reports = loadFromCache<any[]>(CACHE_KEYS.CHARGER_REPORTS, OFFLINE_FALLBACK_CHARGER_REPORTS);
  const missions = loadFromCache<any[]>(CACHE_KEYS.AUTOPILOT_MISSIONS, []);
  const savedRoutesCount = getCachedRoutesCount();
  const queuedActionsCount = getOfflineQueue().length;
  const packMeta = loadFromCache<{ lastSavedAt?: string; tilesCount?: number } | null>(
    CACHE_KEYS.OFFLINE_PACK_META,
    null
  );

  return {
    isPersisted,
    usageMb,
    quotaMb,
    savedChargersCount: chargers.length,
    savedReportsCount: reports.length,
    savedRoutesCount,
    savedMissionsCount: missions.length,
    cachedTilesCount: Math.max(cachedTilesCount, packMeta?.tilesCount || 0),
    queuedActionsCount,
    lastOfflinePackSavedAt: packMeta?.lastSavedAt || null
  };
}

/**
 * Downloads and persists the complete Charging Network Offline Pack into the user's phone storage
 * (IndexedDB + localStorage + CacheStorage):
 * 1. Requests persistent device storage so the mobile OS does not evict data.
 * 2. Saves all charging stations & community reliability reports.
 * 3. Pre-computes and caches key highway corridor routes (Bengaluru-Chennai, Bengaluru-Mysuru, Bengaluru-Kolar, Mumbai-Pune).
 * 4. Pre-warms regional India & highway corridor map tiles in CacheStorage.
 */
export async function downloadChargingNetworkOfflinePack(
  onProgress?: (label: string, percent: number) => void
): Promise<DeviceOfflineStorageStatus> {
  onProgress?.('Requesting persistent phone storage...', 15);
  const persisted = await requestPersistentPhoneStorage();

  onProgress?.('Saving India Charging Stations & Community Reports to phone...', 35);
  let stations = loadFromCache<any[]>(CACHE_KEYS.CHARGING, []);
  let reports = loadFromCache<any[]>(CACHE_KEYS.CHARGER_REPORTS, []);

  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const res = await gpApiFetch('/api/charging');
      if (res.ok) {
        const data = await res.json();
        const serverAll = data.allStations || data.stations || [];
        stations = reconcileCollectionWithCache(CACHE_KEYS.CHARGING, serverAll, {
          appendMissing: true
        });
        if (Array.isArray(data.chargerReports)) {
          reports = reconcileCollectionWithCache(CACHE_KEYS.CHARGER_REPORTS, data.chargerReports);
        }
      }
    } catch {
      // Fallback to cached or embedded stations
    }
  }

  if (stations.length === 0) {
    stations = [...OFFLINE_FALLBACK_CHARGING_STATIONS];
  }
  if (reports.length === 0) {
    reports = [...OFFLINE_FALLBACK_CHARGER_REPORTS];
  }

  saveToCache(CACHE_KEYS.CHARGING, stations);
  saveToCache(CACHE_KEYS.CHARGER_REPORTS, reports);

  onProgress?.('Pre-caching Auto Pilot highway corridor routes...', 65);
  const keyCorridors = [
    {
      start: { latitude: 12.9719, longitude: 77.6412 },
      dest: { latitude: 13.05, longitude: 80.2824 }
    },
    {
      start: { latitude: 12.9719, longitude: 77.6412 },
      dest: { latitude: 12.3051, longitude: 76.6551 }
    },
    {
      start: { latitude: 12.9719, longitude: 77.6412 },
      dest: { latitude: 13.1328, longitude: 78.1715 }
    },
    {
      start: { latitude: 19.0176, longitude: 72.8172 },
      dest: { latitude: 18.5987, longitude: 73.7621 }
    }
  ];

  for (const corridor of keyCorridors) {
    const existingRoute = loadCachedRouteFromPhone(
      corridor.start.latitude,
      corridor.start.longitude,
      corridor.dest.latitude,
      corridor.dest.longitude
    );
    if (!existingRoute) {
      let savedViaApi = false;
      if (typeof navigator === 'undefined' || navigator.onLine) {
        try {
          const rRes = await gpApiFetch('/api/autopilot/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              points: [corridor.start, corridor.dest]
            })
          });
          if (rRes.ok) {
            const rData = await rRes.json();
            if (Array.isArray(rData.polyline) && rData.polyline.length >= 2) {
              saveCachedRouteToPhone(
                corridor.start.latitude,
                corridor.start.longitude,
                corridor.dest.latitude,
                corridor.dest.longitude,
                {
                  polyline: rData.polyline,
                  distanceKm: typeof rData.distanceKm === 'number' ? rData.distanceKm : null,
                  durationMin: typeof rData.durationMin === 'number' ? rData.durationMin : null,
                  routingAvailable: Boolean(rData.routingAvailable),
                  routingLimitationNote: rData.routingLimitationNote
                }
              );
              savedViaApi = true;
            }
          }
        } catch {
          // Use deterministic offline highway corridor generator below
        }
      }
      if (!savedViaApi) {
        const fallbackRoute = generateOfflineCorridorGeometry(
          corridor.start,
          corridor.dest,
          stations
        );
        saveCachedRouteToPhone(
          corridor.start.latitude,
          corridor.start.longitude,
          corridor.dest.latitude,
          corridor.dest.longitude,
          {
            polyline: fallbackRoute.polyline,
            distanceKm: fallbackRoute.distanceKm,
            durationMin: fallbackRoute.durationMin,
            routingAvailable: true,
            routingLimitationNote: 'Offline Highway Corridor Geometry Cached on Phone'
          }
        );
      }
    }
  }

  onProgress?.('Caching India & highway corridor map tiles to phone storage...', 85);
  const tileUrls = computeOfflineTileUrlsForRegions();
  let cachedTileCount = 0;

  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const tileCache = await window.caches.open('ghost-protocol-tiles-v3');
      // Pre-warm a fast batch of overview + regional hub tiles without blocking if offline
      const batch = tileUrls.slice(0, 24);
      await Promise.allSettled(
        batch.map(async url => {
          const match = await tileCache.match(url);
          if (match) {
            cachedTileCount++;
            return;
          }
          if (typeof navigator === 'undefined' || navigator.onLine) {
            const resp = await fetch(url, { mode: 'cors' });
            if (resp && resp.ok) {
              await tileCache.put(url, resp.clone());
              cachedTileCount++;
            }
          }
        })
      );
      const allKeys = await tileCache.keys();
      cachedTileCount = Math.max(cachedTileCount, allKeys.length);
    } catch {
      // ignore tile cache error in restricted environments
    }
  }

  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      navigator.serviceWorker.controller?.postMessage({
        type: 'GP_PRECACHE_TILES',
        urls: tileUrls.slice(0, 36)
      });
    } catch {
      // ignore
    }
  }

  const nowIso = new Date().toISOString();
  saveToCache(CACHE_KEYS.OFFLINE_PACK_META, {
    lastSavedAt: nowIso,
    persisted,
    chargersCount: stations.length,
    reportsCount: reports.length,
    routesCount: getCachedRoutesCount(),
    tilesCount: Math.max(cachedTileCount, tileUrls.slice(0, 24).length)
  });

  onProgress?.('Offline Pack saved to phone storage.', 100);
  return getDeviceOfflineStorageStatus();
}

/**
 * Bi-directional reconnection synchronization:
 * 1. Flushes any queued offline actions (charger submissions, status reports, missions, etc.).
 * 2. Reconciles local phone storage collections with the server.
 * 3. Pulls fresh charging stations, community reports, and missions into phone storage.
 */
export async function syncChargingNetworkOnReconnect(): Promise<{
  syncedQueueCount: number;
  chargersCount: number;
  reportsCount: number;
  updatedAt: string;
}> {
  const syncedQueueCount = await processOfflineQueue();
  await reconcileAllCachesWithServer();

  let chargersCount = loadFromCache<any[]>(CACHE_KEYS.CHARGING, OFFLINE_FALLBACK_CHARGING_STATIONS).length;
  let reportsCount = loadFromCache<any[]>(CACHE_KEYS.CHARGER_REPORTS, OFFLINE_FALLBACK_CHARGER_REPORTS).length;

  try {
    const res = await gpApiFetch('/api/charging');
    if (res.ok) {
      const data = await res.json();
      const loadedAll = data.allStations || data.stations || [];
      const mergedAll = reconcileCollectionWithCache(CACHE_KEYS.CHARGING, loadedAll, {
        appendMissing: true
      });
      saveToCache(CACHE_KEYS.CHARGING, mergedAll);
      chargersCount = mergedAll.length;

      if (Array.isArray(data.chargerReports)) {
        const mergedReports = reconcileCollectionWithCache(
          CACHE_KEYS.CHARGER_REPORTS,
          data.chargerReports
        );
        saveToCache(CACHE_KEYS.CHARGER_REPORTS, mergedReports);
        reportsCount = mergedReports.length;
      }
    }
  } catch {
    // keep phone storage snapshot
  }

  return {
    syncedQueueCount,
    chargersCount,
    reportsCount,
    updatedAt: new Date().toLocaleTimeString()
  };
}

