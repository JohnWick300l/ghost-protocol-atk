import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALLOWED_SHARED_MODULE_IDS,
  FIREBASE_FREE_TIER_LIMITS,
  HYBRID_STORAGE_MANIFEST,
  canPerformCloudRead,
  canPerformCloudWrite,
  classifyFeatureStorageTier,
  computePayloadChecksum,
  loadDailyQuotaUsage,
  mergeHybridDataset,
  recordCloudRead,
  recordCloudWrite,
  sanitizeBundleItemsForFirestore,
  sanitizeFirestoreId
} from './hybridDatabase.ts';
import { type StorageLike } from './telemetryCache.ts';

function createMockStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    }
  };
}

test('Hybrid Database classifies offline-only vs cloud-synced modules accurately', () => {
  const offlineModules = HYBRID_STORAGE_MANIFEST.filter(m => m.tier === 'offline_device_only');
  const syncedModules = HYBRID_STORAGE_MANIFEST.filter(m => m.tier === 'hybrid_cloud_synced');

  assert.equal(offlineModules.length, 10);
  assert.equal(syncedModules.length, 14);

  assert.equal(classifyFeatureStorageTier('bike_telemetry'), 'offline_device_only');
  assert.equal(classifyFeatureStorageTier('offline_routes'), 'offline_device_only');
  assert.equal(classifyFeatureStorageTier('baseline_chargers'), 'offline_device_only');
  assert.equal(classifyFeatureStorageTier('jet_chat_history'), 'offline_device_only');

  for (const modId of ALLOWED_SHARED_MODULE_IDS) {
    assert.equal(classifyFeatureStorageTier(modId), 'hybrid_cloud_synced');
  }
});

test('Firebase Spark Free-Tier Quota Guard guarantees 600 riders stay strictly within free daily limits', () => {
  const totalReadsFor600Members =
    FIREBASE_FREE_TIER_LIMITS.TARGET_SQUADRON_CAPACITY *
    FIREBASE_FREE_TIER_LIMITS.MAX_DAILY_READS_PER_DEVICE;
  const totalWritesFor600Members =
    FIREBASE_FREE_TIER_LIMITS.TARGET_SQUADRON_CAPACITY *
    FIREBASE_FREE_TIER_LIMITS.MAX_DAILY_WRITES_PER_DEVICE;

  assert.ok(
    totalReadsFor600Members < FIREBASE_FREE_TIER_LIMITS.SPARK_DAILY_READS_LIMIT,
    `Expected ${totalReadsFor600Members} < ${FIREBASE_FREE_TIER_LIMITS.SPARK_DAILY_READS_LIMIT}`
  );
  assert.ok(
    totalWritesFor600Members < FIREBASE_FREE_TIER_LIMITS.SPARK_DAILY_WRITES_LIMIT,
    `Expected ${totalWritesFor600Members} < ${FIREBASE_FREE_TIER_LIMITS.SPARK_DAILY_WRITES_LIMIT}`
  );

  const storage = createMockStorage();
  const baseTime = Date.parse('2026-10-26T10:00:00.000Z');

  // First read is allowed
  const firstCheck = canPerformCloudRead('discussions', { nowMs: baseTime, storage });
  assert.equal(firstCheck.allowed, true);
  recordCloudRead('discussions', 'chk_1', { nowMs: baseTime, storage });

  // Second read within 45s cooldown is blocked and served from local cache
  const cooldownCheck = canPerformCloudRead('discussions', { nowMs: baseTime + 10_000, storage });
  assert.equal(cooldownCheck.allowed, false);
  assert.equal(cooldownCheck.reason, 'cooldown_active_serving_from_local_cache');
  assert.equal(cooldownCheck.usage.savedReadsByCache, 1);

  // Read after 46s cooldown is allowed
  const afterCooldownCheck = canPerformCloudRead('discussions', {
    nowMs: baseTime + 46_000,
    storage
  });
  assert.equal(afterCooldownCheck.allowed, true);

  // Write with identical checksum is skipped (0 Firestore writes)
  const dupWrite = canPerformCloudWrite('discussions', 'chk_1', {
    nowMs: baseTime + 50_000,
    storage
  });
  assert.equal(dupWrite.allowed, false);
  assert.equal(dupWrite.reason, 'payload_unchanged_skipped_redundant_write');
  assert.equal(dupWrite.usage.savedWritesByDedup, 1);

  // Write with new checksum is allowed
  const newWrite = canPerformCloudWrite('discussions', 'chk_2', {
    nowMs: baseTime + 50_000,
    storage
  });
  assert.equal(newWrite.allowed, true);
  recordCloudWrite('discussions', 'chk_2', { nowMs: baseTime + 50_000, storage });

  // Next day UTC resets quota counters automatically
  const nextDayTime = Date.parse('2026-10-27T00:05:00.000Z');
  const resetUsage = loadDailyQuotaUsage(storage, nextDayTime);
  assert.equal(resetUsage.reads, 0);
  assert.equal(resetUsage.writes, 0);
});

test('sanitizeBundleItemsForFirestore enforces blueprint volumetric limits and strips sensitive/heavy fields', () => {
  const oversizedText = 'A'.repeat(6000);
  const oversizedImage = 'data:image/png;base64,' + 'B'.repeat(12000);
  const rawItems = Array.from({ length: 130 }, (_, idx) => ({
    id: `item_${idx}`,
    title: `Post ${idx}`,
    summary: oversizedText,
    photoUrl: oversizedImage,
    passwordHash: 'secret_hash_should_never_sync',
    upvotes: idx
  }));

  const sanitized = sanitizeBundleItemsForFirestore(rawItems);
  assert.equal(sanitized.length, FIREBASE_FREE_TIER_LIMITS.MAX_BUNDLE_ITEMS);
  assert.equal(sanitized[0].summary.length, FIREBASE_FREE_TIER_LIMITS.MAX_STRING_FIELD_LENGTH);
  assert.equal('passwordHash' in sanitized[0], false);
  assert.equal('photoUrl' in sanitized[0], false);
});

test('mergeHybridDataset deterministically merges local and remote items and respects deletedIds', () => {
  const local = [
    { id: 'd_1', title: 'Local Older', updatedAt: '2026-10-26T08:00:00Z' },
    { id: 'd_2', title: 'Local Newer', updatedAt: '2026-10-26T10:00:00Z' },
    { id: 'd_local_only', title: 'Offline Draft Post', updatedAt: '2026-10-26T11:00:00Z' }
  ];
  const remote = [
    { id: 'd_1', title: 'Remote Newer', updatedAt: '2026-10-26T09:30:00Z' },
    { id: 'd_2', title: 'Remote Older', updatedAt: '2026-10-26T09:00:00Z' },
    { id: 'd_deleted', title: 'Should Be Removed', updatedAt: '2026-10-26T09:00:00Z' }
  ];

  const merged = mergeHybridDataset(local, remote, ['d_deleted']);
  assert.equal(merged.length, 3);
  assert.equal(merged.find(x => x.id === 'd_1')?.title, 'Remote Newer');
  assert.equal(merged.find(x => x.id === 'd_2')?.title, 'Local Newer');
  assert.equal(merged.find(x => x.id === 'd_local_only')?.title, 'Offline Draft Post');
  assert.equal(merged.find(x => x.id === 'd_deleted'), undefined);
});

test('firebase-blueprint.json and firestore.rules enforce all Dirty Dozen security invariants', () => {
  const blueprintRaw = fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf8');
  const blueprint = JSON.parse(blueprintRaw);

  assert.ok(blueprint.entities.AdminRecord);
  assert.ok(blueprint.entities.PublicPilotProfile);
  assert.ok(blueprint.entities.PrivatePilotInfo);
  assert.ok(blueprint.entities.SharedModuleBundle);
  assert.ok(blueprint.entities.CommunityRecord);

  const rulesRaw = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert.ok(rulesRaw.includes("rules_version = '2';"));
  assert.ok(rulesRaw.includes('match /{document=**}'));
  assert.ok(rulesRaw.includes('allow read, write: if false;'));
  assert.ok(rulesRaw.includes('request.auth.token.email_verified == true'));
  assert.ok(rulesRaw.includes('isValidSharedModuleBundle(incoming())'));
  assert.ok(rulesRaw.includes('isValidCommunityRecord(incoming())'));
  assert.ok(rulesRaw.includes('isValidPrivatePilotInfo(incoming())'));
  assert.equal(sanitizeFirestoreId('bad$id!@#'), 'bad_id___');
  assert.ok(computePayloadChecksum([{ a: 1 }]).startsWith('fnv1a_'));
});
