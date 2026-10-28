import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { db, auth, OperationType, handleFirestoreError } from '../firebase.ts';
import {
  CACHE_KEYS,
  loadFromCache,
  saveToCache,
  getDeletedIds,
  gpApiFetch
} from './telemetryCache.ts';
import {
  ALLOWED_SHARED_MODULE_IDS,
  FIREBASE_FREE_TIER_LIMITS,
  canPerformCloudRead,
  canPerformCloudWrite,
  computePayloadChecksum,
  isSharedCloudModuleId,
  loadDailyQuotaUsage,
  mergeHybridDataset,
  recordCloudRead,
  recordCloudWrite,
  sanitizeBundleItemsForFirestore,
  sanitizeFirestoreId,
  type DailyQuotaUsage,
  type SharedCloudModuleId
} from './hybridDatabase.ts';

export const HYBRID_SYNC_STATUS_EVENT = 'ghost-hybrid-sync-status';

export interface HybridSyncStateSnapshot {
  mode: 'firebase_and_local' | 'server_and_local' | 'offline_local_only';
  firebaseConnected: boolean;
  firebaseUserEmail: string | null;
  firebaseUid: string | null;
  lastSyncedAt: string | null;
  quotaUsage: DailyQuotaUsage;
  activeSyncCount: number;
}

const MODULE_TO_CACHE_KEY: Record<SharedCloudModuleId, string> = {
  emergencies: CACHE_KEYS.EMERGENCY,
  rides: CACHE_KEYS.RIDES,
  problems: CACHE_KEYS.PROBLEMS,
  discussions: CACHE_KEYS.DISCUSSIONS,
  polls: CACHE_KEYS.POLLS,
  petitions: CACHE_KEYS.PETITIONS,
  community_chargers: CACHE_KEYS.CHARGING,
  charger_reports: CACHE_KEYS.CHARGER_REPORTS,
  modifications: CACHE_KEYS.MODIFICATIONS,
  marketplace: CACHE_KEYS.MARKETPLACE,
  service_reviews: CACHE_KEYS.SERVICE,
  jet_submissions: CACHE_KEYS.JET_SUBMISSIONS,
  contributions: CACHE_KEYS.CONTRIBUTIONS,
  contribution_config: CACHE_KEYS.CONTRIBUTION_CONFIG
};

const CACHE_KEY_TO_MODULE: Record<string, SharedCloudModuleId> = {
  [CACHE_KEYS.EMERGENCY]: 'emergencies',
  [CACHE_KEYS.RIDES]: 'rides',
  [CACHE_KEYS.PROBLEMS]: 'problems',
  [CACHE_KEYS.DISCUSSIONS]: 'discussions',
  [CACHE_KEYS.POLLS]: 'polls',
  [CACHE_KEYS.PETITIONS]: 'petitions',
  [CACHE_KEYS.CHARGER_REPORTS]: 'charger_reports',
  [CACHE_KEYS.MODIFICATIONS]: 'modifications',
  [CACHE_KEYS.MARKETPLACE]: 'marketplace',
  [CACHE_KEYS.SERVICE]: 'service_reviews',
  [CACHE_KEYS.JET_SUBMISSIONS]: 'jet_submissions',
  [CACHE_KEYS.CONTRIBUTIONS]: 'contributions',
  [CACHE_KEYS.CONTRIBUTION_CONFIG]: 'contribution_config'
};

let currentFirebaseUser: FirebaseUser | null = null;
let lastGlobalSyncedAt: string | null = null;
let activeSyncOperations = 0;
const writeDebounceTimers = new Map<SharedCloudModuleId, ReturnType<typeof setTimeout>>();

function emitSyncStatus(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(
      new CustomEvent(HYBRID_SYNC_STATUS_EVENT, {
        detail: getHybridSyncStateSnapshot()
      })
    );
  } catch {
    // Ignore in non-DOM test contexts
  }
}

export function getHybridSyncStateSnapshot(): HybridSyncStateSnapshot {
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  const fbVerified = Boolean(currentFirebaseUser && currentFirebaseUser.emailVerified);
  return {
    mode: !isOnline
      ? 'offline_local_only'
      : fbVerified
      ? 'firebase_and_local'
      : 'server_and_local',
    firebaseConnected: fbVerified,
    firebaseUserEmail: currentFirebaseUser?.email || null,
    firebaseUid: currentFirebaseUser?.uid || null,
    lastSyncedAt: lastGlobalSyncedAt,
    quotaUsage: loadDailyQuotaUsage(),
    activeSyncCount: activeSyncOperations
  };
}

/**
 * Syncs the authenticated Firebase user's non-PII public profile to `/users/{uid}/public/profile`
 * adhering strictly to `PublicPilotProfile` in `firebase-blueprint.json`.
 */
export async function syncPublicPilotProfileToFirestore(pilot: {
  fullName?: string;
  nickname?: string;
  bikeModel?: string;
  city?: string;
}): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return;

  const uid = sanitizeFirestoreId(fbUser.uid, 'usr');
  const path = `users/${uid}/public/profile`;
  const ref = doc(db, 'users', uid, 'public', 'profile');

  const fullName = (pilot.fullName || fbUser.displayName || 'Ghost Pilot').trim().slice(0, 80) || 'Ghost Pilot';
  const nickname = (pilot.nickname || 'F77 PILOT').trim().slice(0, 40) || 'F77 PILOT';
  const bikeModel = (pilot.bikeModel || 'F77 MACH 2').trim().slice(0, 60) || 'F77 MACH 2';
  const city = (pilot.city || 'Bengaluru').trim().slice(0, 80) || 'Bengaluru';

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ownerId: uid,
        fullName,
        nickname,
        bikeModel,
        city,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      await updateDoc(ref, {
        fullName,
        nickname,
        bikeModel,
        city,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}

/**
 * Pulls a shared module bundle from Firestore `/shared_modules/{moduleId}` (1 single document read!)
 * while strictly enforcing the daily Spark Free-Tier read budget and cooldowns.
 */
export async function pullModuleFromFirestore(
  moduleId: SharedCloudModuleId,
  options?: { force?: boolean }
): Promise<any[] | null> {
  if (!isSharedCloudModuleId(moduleId)) return null;
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return null;

  const guard = canPerformCloudRead(moduleId, { force: options?.force });
  if (!guard.allowed) {
    emitSyncStatus();
    return null;
  }

  const path = `shared_modules/${moduleId}`;
  activeSyncOperations += 1;
  emitSyncStatus();

  try {
    const snap = await getDoc(doc(db, 'shared_modules', moduleId));
    if (!snap.exists()) {
      recordCloudRead(moduleId);
      return null;
    }
    const data = snap.data();
    const rawItems = Array.isArray(data?.items) ? data.items : [];
    const checksum = typeof data?.payloadChecksum === 'string' ? data.payloadChecksum : undefined;
    recordCloudRead(moduleId, checksum);
    lastGlobalSyncedAt = new Date().toISOString();

    const cacheKey = MODULE_TO_CACHE_KEY[moduleId];
    if (cacheKey && moduleId !== 'contribution_config') {
      const localCached = loadFromCache<any[]>(cacheKey, []);
      const deletedIds = getDeletedIds();
      const merged =
        moduleId === 'community_chargers'
          ? mergeHybridDataset(
              localCached,
              rawItems.filter((c: any) => c && c.source === 'community'),
              deletedIds
            )
          : mergeHybridDataset(localCached, rawItems, deletedIds);
      saveToCache(cacheKey, merged, { silent: false });
      return merged;
    }
    return rawItems;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    return null;
  } finally {
    activeSyncOperations = Math.max(0, activeSyncOperations - 1);
    emitSyncStatus();
  }
}

/**
 * Pushes a shared module snapshot to Firestore `/shared_modules/{moduleId}` with:
 * - Debouncing (`WRITE_DEBOUNCE_MS = 1500ms`)
 * - Checksum deduplication (skips write if unchanged)
 * - Strict payload bounding (`<= 100` items, strings `<= 4000` chars)
 * - Daily write budget enforcement (`MAX_DAILY_WRITES_PER_DEVICE = 25`)
 */
export function schedulePushModuleToFirestore(
  moduleId: SharedCloudModuleId,
  rawItemsOrConfig: any
): void {
  if (!isSharedCloudModuleId(moduleId)) return;
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return;

  if (moduleId === 'contribution_config' && fbUser.email !== 'abinavthejas2001@gmail.com') {
    return;
  }

  const existingTimer = writeDebounceTimers.get(moduleId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    writeDebounceTimers.delete(moduleId);
    void executePushModuleToFirestore(moduleId, rawItemsOrConfig);
  }, FIREBASE_FREE_TIER_LIMITS.WRITE_DEBOUNCE_MS);

  writeDebounceTimers.set(moduleId, timer);
}

async function executePushModuleToFirestore(
  moduleId: SharedCloudModuleId,
  rawItemsOrConfig: any
): Promise<boolean> {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return false;

  const rawArray = Array.isArray(rawItemsOrConfig)
    ? moduleId === 'community_chargers'
      ? rawItemsOrConfig.filter((c: any) => c && c.source === 'community')
      : rawItemsOrConfig
    : rawItemsOrConfig && typeof rawItemsOrConfig === 'object'
    ? [rawItemsOrConfig]
    : [];

  const sanitizedItems = sanitizeBundleItemsForFirestore(rawArray);
  const checksum = computePayloadChecksum(sanitizedItems);

  const guard = canPerformCloudWrite(moduleId, checksum);
  if (!guard.allowed) {
    emitSyncStatus();
    return false;
  }

  const uid = sanitizeFirestoreId(fbUser.uid, 'usr');
  const path = `shared_modules/${moduleId}`;
  const ref = doc(db, 'shared_modules', moduleId);

  activeSyncOperations += 1;
  emitSyncStatus();

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        moduleId,
        ownerId: uid,
        lastUpdatedBy: uid,
        version: 1,
        recordCount: sanitizedItems.length,
        payloadChecksum: checksum,
        items: sanitizedItems,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      const existingData = existingSnap.data();
      if (existingData?.payloadChecksum === checksum) {
        recordCloudRead(moduleId, checksum);
        return true;
      }
      const nextVersion =
        typeof existingData?.version === 'number' && existingData.version >= 1
          ? existingData.version + 1
          : 2;

      await updateDoc(ref, {
        lastUpdatedBy: uid,
        version: nextVersion,
        recordCount: sanitizedItems.length,
        payloadChecksum: checksum,
        items: sanitizedItems,
        updatedAt: serverTimestamp()
      });
    }

    recordCloudWrite(moduleId, checksum);
    lastGlobalSyncedAt = new Date().toISOString();
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
    return false;
  } finally {
    activeSyncOperations = Math.max(0, activeSyncOperations - 1);
    emitSyncStatus();
  }
}

/**
 * Performs a hybrid synchronization cycle across priority shared modules:
 * 1. Syncs with the backend `/api/hybrid-sync` digest so all 600+ pilots share data even without Google OAuth
 * 2. When Firebase Auth is connected, syncs priority shared modules with Firestore `/shared_modules/{moduleId}`
 */
export async function runHybridSyncCycle(options?: { force?: boolean }): Promise<void> {
  if (typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    emitSyncStatus();
    return;
  }

  activeSyncOperations += 1;
  emitSyncStatus();

  try {
    // Step 1: Lightweight server digest check & merge
    const res = await gpApiFetch('/api/hybrid-sync');
    if (res.ok) {
      const payload = await res.json();
      const deletedIds = getDeletedIds();

      if (Array.isArray(payload.emergencies)) {
        const merged = mergeHybridDataset(
          loadFromCache<any[]>(CACHE_KEYS.EMERGENCY, []),
          payload.emergencies,
          deletedIds
        );
        saveToCache(CACHE_KEYS.EMERGENCY, merged, { silent: true });
      }
      if (Array.isArray(payload.discussions)) {
        const merged = mergeHybridDataset(
          loadFromCache<any[]>(CACHE_KEYS.DISCUSSIONS, []),
          payload.discussions,
          deletedIds
        );
        saveToCache(CACHE_KEYS.DISCUSSIONS, merged, { silent: true });
      }
      if (Array.isArray(payload.problems)) {
        const merged = mergeHybridDataset(
          loadFromCache<any[]>(CACHE_KEYS.PROBLEMS, []),
          payload.problems,
          deletedIds
        );
        saveToCache(CACHE_KEYS.PROBLEMS, merged, { silent: true });
      }
      if (Array.isArray(payload.rides)) {
        const merged = mergeHybridDataset(
          loadFromCache<any[]>(CACHE_KEYS.RIDES, []),
          payload.rides,
          deletedIds
        );
        saveToCache(CACHE_KEYS.RIDES, merged, { silent: true });
      }
      if (Array.isArray(payload.marketplace)) {
        const merged = mergeHybridDataset(
          loadFromCache<any[]>(CACHE_KEYS.MARKETPLACE, []),
          payload.marketplace,
          deletedIds
        );
        saveToCache(CACHE_KEYS.MARKETPLACE, merged, { silent: true });
      }
      lastGlobalSyncedAt = payload.syncedAt || new Date().toISOString();
    }

    // Step 2: If Firebase Auth is active, sync priority modules with Firestore within quota guard
    if (auth.currentUser && auth.currentUser.emailVerified) {
      const priorityModules: SharedCloudModuleId[] = [
        'emergencies',
        'discussions',
        'problems',
        'marketplace',
        'community_chargers',
        'contributions'
      ];
      for (const modId of priorityModules) {
        await pullModuleFromFirestore(modId, { force: options?.force });
      }
    }
  } catch {
    // Graceful offline fallback — local phone storage remains authoritative
  } finally {
    activeSyncOperations = Math.max(0, activeSyncOperations - 1);
    emitSyncStatus();
  }
}

let initialized = false;

export function initHybridDatabaseEngine(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  onAuthStateChanged(auth, user => {
    currentFirebaseUser = user;
    emitSyncStatus();
    if (user && user.emailVerified) {
      void syncPublicPilotProfileToFirestore({
        fullName: user.displayName || undefined
      });
      void runHybridSyncCycle({ force: false });
    }
  });

  // Automatically mirror shared cache updates to Firestore when authenticated
  window.addEventListener('ghost-data-updated', ((event: CustomEvent) => {
    const cacheKey = event?.detail?.key as string | undefined;
    if (!cacheKey) return;
    const mappedModule =
      cacheKey === CACHE_KEYS.CHARGING ? 'community_chargers' : CACHE_KEY_TO_MODULE[cacheKey];
    if (!mappedModule) return;

    const currentData = loadFromCache(cacheKey);
    if (currentData && currentData.data !== undefined) {
      schedulePushModuleToFirestore(mappedModule, currentData.data);
    }
  }) as EventListener);

  window.addEventListener('online', () => {
    emitSyncStatus();
    void runHybridSyncCycle({ force: false });
  });

  window.addEventListener('offline', () => {
    emitSyncStatus();
  });
}

export { ALLOWED_SHARED_MODULE_IDS };
