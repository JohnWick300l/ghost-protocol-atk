// GHOST PROTOCOL — Hybrid Database Partitioning, Free-Tier Quota Guard & Deterministic Merge Engine
import { CACHE_KEYS, type StorageLike } from './telemetryCache.ts';

export type StorageTier = 'offline_device_only' | 'hybrid_cloud_synced';

export type OfflineDeviceFeatureId =
  | 'bike_telemetry'
  | 'form_drafts'
  | 'offline_routes'
  | 'offline_weather'
  | 'offline_places'
  | 'offline_map_tiles'
  | 'jet_chat_history'
  | 'baseline_chargers'
  | 'baseline_jet_knowledge'
  | 'ui_preferences';

export type SharedCloudModuleId =
  | 'emergencies'
  | 'rides'
  | 'problems'
  | 'discussions'
  | 'polls'
  | 'petitions'
  | 'community_chargers'
  | 'charger_reports'
  | 'modifications'
  | 'marketplace'
  | 'service_reviews'
  | 'jet_submissions'
  | 'contributions'
  | 'contribution_config';

export type HybridFeatureId = OfflineDeviceFeatureId | SharedCloudModuleId;

export interface FeatureStorageSpec {
  id: HybridFeatureId;
  label: string;
  tier: StorageTier;
  cacheKey: string;
  syncCooldownMs: number;
  description: string;
}

export const ALLOWED_SHARED_MODULE_IDS: readonly SharedCloudModuleId[] = [
  'emergencies',
  'rides',
  'problems',
  'discussions',
  'polls',
  'petitions',
  'community_chargers',
  'charger_reports',
  'modifications',
  'marketplace',
  'service_reviews',
  'jet_submissions',
  'contributions',
  'contribution_config'
] as const;

export const FIREBASE_FREE_TIER_LIMITS = {
  SPARK_DAILY_READS_LIMIT: 50000,
  SPARK_DAILY_WRITES_LIMIT: 20000,
  SPARK_DAILY_DELETES_LIMIT: 20000,
  SPARK_STORAGE_MB_LIMIT: 1024,
  TARGET_SQUADRON_CAPACITY: 600,
  MAX_DAILY_READS_PER_DEVICE: 60,
  MAX_DAILY_WRITES_PER_DEVICE: 25,
  MAX_BUNDLE_ITEMS: 100,
  MAX_STRING_FIELD_LENGTH: 4000,
  MAX_TITLE_LENGTH: 200,
  MAX_AUTHOR_NAME_LENGTH: 80,
  MAX_ID_LENGTH: 128,
  DEFAULT_READ_COOLDOWN_MS: 45000,
  SOS_READ_COOLDOWN_MS: 15000,
  WRITE_DEBOUNCE_MS: 1500
} as const;

export const HYBRID_STORAGE_MANIFEST: readonly FeatureStorageSpec[] = [
  // Tier 1: 100% Offline Phone Storage (0 Firebase Quota Used)
  {
    id: 'bike_telemetry',
    label: 'My Garage Personal Telemetry',
    tier: 'offline_device_only',
    cacheKey: CACHE_KEYS.TELEMETRY,
    syncCooldownMs: 0,
    description: 'Personal SOC, range estimator, odometer, tire pressure, and ride mode stored on device.'
  },
  {
    id: 'form_drafts',
    label: 'Unsaved Form Drafts',
    tier: 'offline_device_only',
    cacheKey: 'ghost_form_draft_v1_*',
    syncCooldownMs: 0,
    description: 'Auto-saved form inputs across all modules kept strictly on user phone storage.'
  },
  {
    id: 'offline_routes',
    label: 'Auto-Pilot Route Corridor Cache',
    tier: 'offline_device_only',
    cacheKey: CACHE_KEYS.CACHED_ROUTES,
    syncCooldownMs: 0,
    description: 'Pre-computed highway corridors, waypoints, and elevation geometry stored locally.'
  },
  {
    id: 'offline_weather',
    label: 'Route Weather Radar Cache',
    tier: 'offline_device_only',
    cacheKey: CACHE_KEYS.CACHED_WEATHER,
    syncCooldownMs: 0,
    description: 'Cached route weather snapshots for dead-zone highway navigation.'
  },
  {
    id: 'offline_places',
    label: 'India Locality & Place Index',
    tier: 'offline_device_only',
    cacheKey: CACHE_KEYS.CACHED_PLACES,
    syncCooldownMs: 0,
    description: 'Offline Indian towns, localities, and highway landmarks.'
  },
  {
    id: 'offline_map_tiles',
    label: 'Tactical Radar Map Tiles',
    tier: 'offline_device_only',
    cacheKey: CACHE_KEYS.OFFLINE_PACK_META,
    syncCooldownMs: 0,
    description: 'Offline map tile packs and vector radar fallback.'
  },
  {
    id: 'jet_chat_history',
    label: 'Jet Engineer Personal Q&A History',
    tier: 'offline_device_only',
    cacheKey: CACHE_KEYS.JET_CHAT_HISTORY,
    syncCooldownMs: 0,
    description: 'Private diagnostic chat logs stored in phone storage.'
  },
  {
    id: 'baseline_chargers',
    label: 'Baseline Supernova & Destination Chargers',
    tier: 'offline_device_only',
    cacheKey: CACHE_KEYS.CHARGING,
    syncCooldownMs: 0,
    description: '120+ built-in charging stations available 100% offline with zero network.'
  },
  {
    id: 'baseline_jet_knowledge',
    label: 'Core Jet Engineer Diagnostic Manual',
    tier: 'offline_device_only',
    cacheKey: CACHE_KEYS.JET_KNOWLEDGE,
    syncCooldownMs: 0,
    description: 'Built-in F77/X47 fault codes, thermal recovery, and roadside checklists.'
  },
  {
    id: 'ui_preferences',
    label: 'Cockpit Avionics & Audio Preferences',
    tier: 'offline_device_only',
    cacheKey: 'ghost_ui_prefs_v1',
    syncCooldownMs: 0,
    description: 'Rotary selector state, audio mute, and motion settings.'
  },

  // Tier 2 & 3: Shared Community Modules (Local Cache + Server DB + Firebase Cloud Sync)
  {
    id: 'emergencies',
    label: 'Squadron Assist SOS & Breakdowns',
    tier: 'hybrid_cloud_synced',
    cacheKey: CACHE_KEYS.EMERGENCY,
    syncCooldownMs: FIREBASE_FREE_TIER_LIMITS.SOS_READ_COOLDOWN_MS,
    description: 'Real-time SOS alerts and nearby rider assistance synced across all pilots.'
  },
  {
    id: 'rides',
    label: 'Mission Mode Squadron Sorties',
    tier: 'hybrid_cloud_synced',
    cacheKey: CACHE_KEYS.RIDES,
    syncCooldownMs: FIREBASE_FREE_TIER_LIMITS.DEFAULT_READ_COOLDOWN_MS,
    description: 'Shared group rides, RSVP roster, and safety check-ins.'
  },
  {
    id: 'problems',
    label: 'Priority Issues & Severity Tracker',
    tier: 'hybrid_cloud_synced',
    cacheKey: CACHE_KEYS.PROBLEMS,
    syncCooldownMs: FIREBASE_FREE_TIER_LIMITS.DEFAULT_READ_COOLDOWN_MS,
    description: 'Community-reported motorcycle issues and severity votes.'
  },
  {
    id: 'discussions',
    label: 'Community Discussions & Replies',
    tier: 'hybrid_cloud_synced',
    cacheKey: CACHE_KEYS.DISCUSSIONS,
    syncCooldownMs: FIREBASE_FREE_TIER_LIMITS.DEFAULT_READ_COOLDOWN_MS,
    description: 'Squadron discussion threads, tips, and replies.'
  },
  {
    id: 'polls',
    label: 'Community Polls',
    tier: 'hybrid_cloud_synced',
    cacheKey: CACHE_KEYS.POLLS,
    syncCooldownMs: FIREBASE_FREE_TIER_LIMITS.DEFAULT_READ_COOLDOWN_MS,
    description: 'Shared squadron polls and live vote tallies.'
  },
  {
    id: 'petitions',
    label: 'Community Petitions',
    tier: 'hybrid_cloud_synced',
    cacheKey: CACHE_KEYS.PETITIONS,
    syncCooldownMs: FIREBASE_FREE_TIER_LIMITS.DEFAULT_READ_COOLDOWN_MS,
    description: 'Feature requests and community petition signatures.'
  },
  {
    id: 'community_chargers',
    label: 'Community Charging Plugs',
    tier: 'hybrid_cloud_synced',
    cacheKey: CACHE_KEYS.CHARGING,
    syncCooldownMs: FIREBASE_FREE_TIER_LIMITS.DEFAULT_READ_COOLDOWN_MS,
    description: 'Pilot-contributed charging plugs, sockets, and verifications.'
  },
  {
    id: 'charger_reports',
    label: 'Live Charger Status Reports',
    tier: 'hybrid_cloud_synced',
    cacheKey: CACHE_KEYS.CHARGER_REPORTS,
    syncCooldownMs: FIREBASE_FREE_TIER_LIMITS.DEFAULT_READ_COOLDOWN_MS,
    description: 'Real-time working/broken/busy reports for charging stations.'
  },
  {
    id: 'modifications',
    label: 'Modifications Showcase',
    tier: 'hybrid_cloud_synced',
    cacheKey: CACHE_KEYS.MODIFICATIONS,
    syncCooldownMs: FIREBASE_FREE_TIER_LIMITS.DEFAULT_READ_COOLDOWN_MS,
    description: 'Shared custom builds, accessories, and product links.'
  },
  {
    id: 'marketplace',
    label: 'Squadron Marketplace',
    tier: 'hybrid_cloud_synced',
    cacheKey: CACHE_KEYS.MARKETPLACE,
    syncCooldownMs: FIREBASE_FREE_TIER_LIMITS.DEFAULT_READ_COOLDOWN_MS,
    description: 'Pilot-to-pilot gear and parts listings.'
  },
  {
    id: 'service_reviews',
    label: 'Service Intel & Reviews',
    tier: 'hybrid_cloud_synced',
    cacheKey: CACHE_KEYS.SERVICE,
    syncCooldownMs: FIREBASE_FREE_TIER_LIMITS.DEFAULT_READ_COOLDOWN_MS,
    description: 'Shared service center ratings and turnaround reports.'
  },
  {
    id: 'jet_submissions',
    label: 'Community Jet Engineer Submissions',
    tier: 'hybrid_cloud_synced',
    cacheKey: CACHE_KEYS.JET_SUBMISSIONS,
    syncCooldownMs: FIREBASE_FREE_TIER_LIMITS.DEFAULT_READ_COOLDOWN_MS,
    description: 'Verified rider diagnostic solutions shared with the squadron.'
  },
  {
    id: 'contributions',
    label: 'Squadron Backers Wall',
    tier: 'hybrid_cloud_synced',
    cacheKey: CACHE_KEYS.CONTRIBUTIONS,
    syncCooldownMs: FIREBASE_FREE_TIER_LIMITS.DEFAULT_READ_COOLDOWN_MS,
    description: 'Public anonymous backer names and reviews.'
  },
  {
    id: 'contribution_config',
    label: 'Contribute Page Payment Config',
    tier: 'hybrid_cloud_synced',
    cacheKey: CACHE_KEYS.CONTRIBUTION_CONFIG,
    syncCooldownMs: FIREBASE_FREE_TIER_LIMITS.DEFAULT_READ_COOLDOWN_MS,
    description: 'Owner-configured UPI ID, QR code, and payment mode settings.'
  }
] as const;

export function classifyFeatureStorageTier(featureId: string): StorageTier {
  const found = HYBRID_STORAGE_MANIFEST.find(item => item.id === featureId);
  if (found) return found.tier;
  if (ALLOWED_SHARED_MODULE_IDS.includes(featureId as SharedCloudModuleId)) {
    return 'hybrid_cloud_synced';
  }
  return 'offline_device_only';
}

export function isSharedCloudModuleId(id: string): id is SharedCloudModuleId {
  return (ALLOWED_SHARED_MODULE_IDS as readonly string[]).includes(id);
}

export function sanitizeFirestoreId(rawId: unknown, fallbackPrefix: string = 'doc'): string {
  const raw = typeof rawId === 'string' ? rawId.trim() : '';
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, FIREBASE_FREE_TIER_LIMITS.MAX_ID_LENGTH);
  if (cleaned.length >= 1 && /^[a-zA-Z0-9_-]+$/.test(cleaned)) {
    return cleaned;
  }
  return `${fallbackPrefix}_${Date.now()}`;
}

export function computePayloadChecksum(payload: unknown): string {
  let str = '';
  try {
    str = typeof payload === 'string' ? payload : JSON.stringify(payload) || '';
  } catch {
    str = String(payload);
  }
  // FNV-1a 32-bit deterministic hash
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a_${hash.toString(16).padStart(8, '0')}_${str.length}`;
}

/**
 * Sanitizes and bounds an array of records before writing to Firestore `/shared_modules/{moduleId}`
 * so that:
 * 1. Total array length <= 100 (`MAX_BUNDLE_ITEMS`)
 * 2. Every element is a plain object (`map`)
 * 3. Oversized inline data URLs (> 8KB) are stripped/truncated to protect the 1GB free storage quota
 * 4. Every string field is bounded to <= 4000 characters
 */
export function sanitizeBundleItemsForFirestore<T extends Record<string, any>>(
  items: T[],
  maxItems: number = FIREBASE_FREE_TIER_LIMITS.MAX_BUNDLE_ITEMS
): Record<string, any>[] {
  if (!Array.isArray(items)) return [];
  const cap = Math.max(1, Math.min(maxItems, FIREBASE_FREE_TIER_LIMITS.MAX_BUNDLE_ITEMS));
  const sliced = items.slice(0, cap);
  const result: Record<string, any>[] = [];

  for (const rawItem of sliced) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue;
    const cleanObj: Record<string, any> = {};
    for (const [key, val] of Object.entries(rawItem)) {
      if (val === undefined || typeof val === 'function') continue;
      // Never sync sensitive credential fields
      if (key === 'passwordHash' || key === 'password' || key === 'setupToken') continue;

      if (typeof val === 'string') {
        if (val.startsWith('data:image/') && val.length > 8192) {
          // Omit heavy inline base64 blobs from cloud bundle to keep Firestore free tier lean
          continue;
        }
        cleanObj[key] = val.slice(0, FIREBASE_FREE_TIER_LIMITS.MAX_STRING_FIELD_LENGTH);
      } else if (Array.isArray(val)) {
        cleanObj[key] = val.slice(0, 50).map(entry => {
          if (typeof entry === 'string') {
            if (entry.startsWith('data:image/') && entry.length > 8192) return '';
            return entry.slice(0, 1000);
          }
          if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
            const cleanEntry: Record<string, any> = {};
            for (const [ek, ev] of Object.entries(entry)) {
              if (ev !== undefined && typeof ev !== 'function') {
                cleanEntry[ek] = typeof ev === 'string' ? ev.slice(0, 1000) : ev;
              }
            }
            return cleanEntry;
          }
          return entry;
        });
      } else {
        cleanObj[key] = val;
      }
    }
    result.push(cleanObj);
  }

  return result;
}

export const QUOTA_TRACKER_STORAGE_KEY = 'ghost_firebase_quota_tracker_v1';

export interface DailyQuotaUsage {
  dateKey: string; // YYYY-MM-DD (UTC)
  reads: number;
  writes: number;
  savedReadsByCache: number;
  savedWritesByDedup: number;
  lastSyncedByModule: Record<string, number>;
  lastChecksumByModule: Record<string, string>;
}

export function getCurrentUtcDateKey(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function getDefaultQuotaUsage(nowMs: number = Date.now()): DailyQuotaUsage {
  return {
    dateKey: getCurrentUtcDateKey(nowMs),
    reads: 0,
    writes: 0,
    savedReadsByCache: 0,
    savedWritesByDedup: 0,
    lastSyncedByModule: {},
    lastChecksumByModule: {}
  };
}

export function loadDailyQuotaUsage(storage?: StorageLike, nowMs: number = Date.now()): DailyQuotaUsage {
  const today = getCurrentUtcDateKey(nowMs);
  const store =
    storage ||
    (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null);
  if (!store) return getDefaultQuotaUsage(nowMs);

  try {
    const raw = store.getItem(QUOTA_TRACKER_STORAGE_KEY);
    if (!raw) return getDefaultQuotaUsage(nowMs);
    const parsed = JSON.parse(raw) as Partial<DailyQuotaUsage>;
    if (!parsed || parsed.dateKey !== today) {
      // Automatically reset daily counters at UTC midnight
      const fresh = getDefaultQuotaUsage(nowMs);
      store.setItem(QUOTA_TRACKER_STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    return {
      dateKey: today,
      reads: typeof parsed.reads === 'number' && parsed.reads >= 0 ? parsed.reads : 0,
      writes: typeof parsed.writes === 'number' && parsed.writes >= 0 ? parsed.writes : 0,
      savedReadsByCache:
        typeof parsed.savedReadsByCache === 'number' && parsed.savedReadsByCache >= 0
          ? parsed.savedReadsByCache
          : 0,
      savedWritesByDedup:
        typeof parsed.savedWritesByDedup === 'number' && parsed.savedWritesByDedup >= 0
          ? parsed.savedWritesByDedup
          : 0,
      lastSyncedByModule:
        parsed.lastSyncedByModule && typeof parsed.lastSyncedByModule === 'object'
          ? parsed.lastSyncedByModule
          : {},
      lastChecksumByModule:
        parsed.lastChecksumByModule && typeof parsed.lastChecksumByModule === 'object'
          ? parsed.lastChecksumByModule
          : {}
    };
  } catch {
    return getDefaultQuotaUsage(nowMs);
  }
}

export function saveDailyQuotaUsage(usage: DailyQuotaUsage, storage?: StorageLike): void {
  const store =
    storage ||
    (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null);
  if (!store) return;
  try {
    store.setItem(QUOTA_TRACKER_STORAGE_KEY, JSON.stringify(usage));
  } catch {
    // Ignore storage quota warning
  }
}

export function canPerformCloudRead(
  moduleId: SharedCloudModuleId,
  options?: {
    force?: boolean;
    nowMs?: number;
    storage?: StorageLike;
  }
): { allowed: boolean; reason: string; usage: DailyQuotaUsage } {
  const nowMs = options?.nowMs ?? Date.now();
  const usage = loadDailyQuotaUsage(options?.storage, nowMs);

  if (usage.reads >= FIREBASE_FREE_TIER_LIMITS.MAX_DAILY_READS_PER_DEVICE) {
    usage.savedReadsByCache += 1;
    saveDailyQuotaUsage(usage, options?.storage);
    return {
      allowed: false,
      reason: 'daily_device_read_budget_reached_using_local_cache',
      usage
    };
  }

  if (!options?.force) {
    const lastSync = usage.lastSyncedByModule[moduleId] || 0;
    const cooldown =
      moduleId === 'emergencies'
        ? FIREBASE_FREE_TIER_LIMITS.SOS_READ_COOLDOWN_MS
        : FIREBASE_FREE_TIER_LIMITS.DEFAULT_READ_COOLDOWN_MS;

    if (lastSync > 0 && nowMs - lastSync < cooldown) {
      usage.savedReadsByCache += 1;
      saveDailyQuotaUsage(usage, options?.storage);
      return {
        allowed: false,
        reason: 'cooldown_active_serving_from_local_cache',
        usage
      };
    }
  }

  return { allowed: true, reason: 'ok', usage };
}

export function recordCloudRead(
  moduleId: SharedCloudModuleId,
  checksum?: string,
  options?: { nowMs?: number; storage?: StorageLike }
): DailyQuotaUsage {
  const nowMs = options?.nowMs ?? Date.now();
  const usage = loadDailyQuotaUsage(options?.storage, nowMs);
  usage.reads += 1;
  usage.lastSyncedByModule[moduleId] = nowMs;
  if (checksum) {
    usage.lastChecksumByModule[moduleId] = checksum;
  }
  saveDailyQuotaUsage(usage, options?.storage);
  return usage;
}

export function canPerformCloudWrite(
  moduleId: SharedCloudModuleId,
  payloadChecksum: string,
  options?: { nowMs?: number; storage?: StorageLike }
): { allowed: boolean; reason: string; usage: DailyQuotaUsage } {
  const nowMs = options?.nowMs ?? Date.now();
  const usage = loadDailyQuotaUsage(options?.storage, nowMs);

  if (usage.writes >= FIREBASE_FREE_TIER_LIMITS.MAX_DAILY_WRITES_PER_DEVICE) {
    usage.savedWritesByDedup += 1;
    saveDailyQuotaUsage(usage, options?.storage);
    return {
      allowed: false,
      reason: 'daily_device_write_budget_reached_queued_locally',
      usage
    };
  }

  if (usage.lastChecksumByModule[moduleId] === payloadChecksum) {
    usage.savedWritesByDedup += 1;
    saveDailyQuotaUsage(usage, options?.storage);
    return {
      allowed: false,
      reason: 'payload_unchanged_skipped_redundant_write',
      usage
    };
  }

  return { allowed: true, reason: 'ok', usage };
}

export function recordCloudWrite(
  moduleId: SharedCloudModuleId,
  payloadChecksum: string,
  options?: { nowMs?: number; storage?: StorageLike }
): DailyQuotaUsage {
  const nowMs = options?.nowMs ?? Date.now();
  const usage = loadDailyQuotaUsage(options?.storage, nowMs);
  usage.writes += 1;
  usage.lastSyncedByModule[moduleId] = nowMs;
  usage.lastChecksumByModule[moduleId] = payloadChecksum;
  saveDailyQuotaUsage(usage, options?.storage);
  return usage;
}

/**
 * Deterministic conflict-free merge of local offline records and remote synced records.
 * - Filters out any ID in `deletedIds`
 * - Deduplicates by `id` (or `recordId`), picking the record with the newer `updatedAt` / `createdAt` timestamp
 * - Preserves local-only pending items so user creations never disappear during sync
 */
export function mergeHybridDataset<T extends Record<string, any>>(
  localItems: T[],
  remoteItems: T[],
  deletedIds: string[] = []
): T[] {
  const deletedSet = new Set(deletedIds.filter(Boolean));
  const byId = new Map<string, T>();
  const orderedIds: string[] = [];

  const getTimestampMs = (item: Record<string, any>): number => {
    const raw = item.updatedAt || item.createdAt || item.timestamp || item.date || '';
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string' && raw) {
      const parsed = Date.parse(raw);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return 0;
  };

  const getItemId = (item: Record<string, any>, fallbackIdx: number): string => {
    const id = item.id ?? item.recordId ?? item.slug ?? '';
    return typeof id === 'string' && id.trim() ? id.trim() : `idx_${fallbackIdx}`;
  };

  const upsert = (item: T, idx: number) => {
    if (!item || typeof item !== 'object') return;
    const id = getItemId(item, idx);
    if (deletedSet.has(id)) return;

    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, item);
      orderedIds.push(id);
      return;
    }

    const incomingTime = getTimestampMs(item);
    const existingTime = getTimestampMs(existing);
    if (incomingTime >= existingTime) {
      byId.set(id, { ...existing, ...item });
    }
  };

  (Array.isArray(remoteItems) ? remoteItems : []).forEach((item, i) => upsert(item, i));
  (Array.isArray(localItems) ? localItems : []).forEach((item, i) => upsert(item, i + 10000));

  return orderedIds.map(id => byId.get(id)!).filter(Boolean);
}
