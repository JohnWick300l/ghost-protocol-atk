import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_CACHE_VERSION,
  SCHEMA_VERSION,
  TELEMETRY_CACHE_KEY,
  OFFLINE_QUEUE_KEY,
  migrateCachePayload,
  isCacheExpired,
  loadCachedTelemetry,
  saveCachedTelemetry,
  getCacheRelativeAge,
  getCacheStorageStats,
  clearCachedTelemetry,
  getOfflineQueue,
  queueOfflineAction,
  clearOfflineQueue,
  getDefaultBikeTelemetry
} from './telemetryCache.ts';

// Mock in-memory localStorage implementation
function createMockStorage(initialData: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initialData };
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, val: string) => {
      store[key] = String(val);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    _store: store
  };
}

test('telemetryCache: save and load roundtrip with schema versioning v3', () => {
  const storage = createMockStorage();

  const mockData = {
    rides: [{ id: 'ride-1', name: 'Nandi Sunrise Sortie' }],
    emergencies: [{ id: 'em-1', status: 'Active' }],
    problems: [{ id: 'prob-1', title: 'Regen Cutout' }],
    discussions: [{ id: 'disc-1', title: 'Aero Winglets' }],
    chargingStations: [{ id: 'cs-1', name: 'Indiranagar Supernova' }],
    notifications: [{ id: 'notif-1', title: 'Sortie Departure' }]
  };

  const success = saveCachedTelemetry(mockData, storage);
  assert.equal(success, true);

  const cached = loadCachedTelemetry(storage);
  assert.ok(cached !== null);
  assert.equal(cached?.version, CURRENT_CACHE_VERSION);
  assert.equal(cached?.schemaVersion, SCHEMA_VERSION);
  assert.equal(cached?.data.rides.length, 1);
  assert.equal(cached?.data.rides[0].name, 'Nandi Sunrise Sortie');
  assert.equal(cached?.data.emergencies.length, 1);
  assert.equal(cached?.data.problems.length, 1);
  assert.equal(cached?.data.chargingStations.length, 1);
  assert.ok(cached?.data.bikeTelemetry !== undefined);
  assert.equal(cached?.data.bikeTelemetry?.avionicsHealth, 'NOMINAL');
});

test('telemetryCache: migrates legacy v1 flat payloads into v3 schema', () => {
  const legacyV1 = {
    rides: [{ id: 'v1-ride', name: 'Legacy Ride' }],
    problems: [{ id: 'v1-prob', title: 'Legacy Prob' }]
  };

  const migrated = migrateCachePayload(legacyV1);
  assert.ok(migrated !== null);
  assert.equal(migrated?.version, CURRENT_CACHE_VERSION);
  assert.equal(migrated?.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated?.data.rides.length, 1);
  assert.equal(migrated?.data.rides[0].name, 'Legacy Ride');
  assert.equal(migrated?.data.emergencies.length, 0); // safe fallback array
  assert.ok(migrated?.data.bikeTelemetry !== undefined);
});

test('telemetryCache: migrates v2 envelope payloads into v3 schema with bike telemetry', () => {
  const v2Payload = {
    version: 2,
    updatedAt: new Date().toISOString(),
    data: {
      rides: [{ id: 'v2-ride' }],
      emergencies: [],
      problems: [],
      discussions: [],
      chargingStations: [],
      notifications: []
    }
  };

  const migrated = migrateCachePayload(v2Payload);
  assert.ok(migrated !== null);
  assert.equal(migrated?.version, CURRENT_CACHE_VERSION);
  assert.equal(migrated?.data.rides.length, 1);
  assert.equal(migrated?.data.bikeTelemetry?.model, 'Ultraviolette F77 MACH 2 Recon');
});

test('telemetryCache: detects cache expiration based on TTL', () => {
  const past = new Date(Date.now() - 3600 * 1000).toISOString();
  const future = new Date(Date.now() + 3600 * 1000).toISOString();

  const expiredPayload: any = {
    version: CURRENT_CACHE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: past,
    expiresAt: past,
    data: { rides: [], emergencies: [], problems: [], discussions: [], chargingStations: [], notifications: [] }
  };

  const validPayload: any = {
    version: CURRENT_CACHE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    expiresAt: future,
    data: { rides: [], emergencies: [], problems: [], discussions: [], chargingStations: [], notifications: [] }
  };

  assert.equal(isCacheExpired(expiredPayload), true);
  assert.equal(isCacheExpired(validPayload), false);
  assert.equal(isCacheExpired(null), true);
});

test('telemetryCache: relative age string formatting', () => {
  const now = Date.now();
  assert.equal(getCacheRelativeAge(undefined, now), 'Never');
  assert.equal(getCacheRelativeAge(new Date(now - 15000).toISOString(), now), 'Just now');
  assert.equal(getCacheRelativeAge(new Date(now - 45000).toISOString(), now), '45s ago');
  assert.equal(getCacheRelativeAge(new Date(now - 120000).toISOString(), now), '2m ago');
  assert.equal(getCacheRelativeAge(new Date(now - 7200000).toISOString(), now), '2h ago');
});

test('telemetryCache: cache storage stats calculation and clear', () => {
  const storage = createMockStorage();
  saveCachedTelemetry(
    {
      rides: [{ id: '1' }, { id: '2' }],
      problems: [{ id: 'p1' }]
    },
    storage
  );

  const stats = getCacheStorageStats(storage);
  assert.ok(stats !== null);
  assert.equal(stats?.version, CURRENT_CACHE_VERSION);
  assert.equal(stats?.breakdown.rides, 2);
  assert.equal(stats?.breakdown.problems, 1);
  assert.equal(stats?.hasBikeTelemetry, true);
  assert.ok((stats?.approxSizeKb || 0) > 0);

  clearCachedTelemetry(storage);
  assert.equal(loadCachedTelemetry(storage), null);
});

test('telemetryCache: offline action queue operations', () => {
  const storage = createMockStorage();

  assert.equal(getOfflineQueue(storage).length, 0);

  const item1 = queueOfflineAction(
    {
      endpoint: '/api/problems',
      method: 'POST',
      body: { title: 'Chain Tension' },
      description: 'Report motorcycle problem offline'
    },
    storage
  );

  assert.ok(item1.id.startsWith('qa_'));
  assert.equal(getOfflineQueue(storage).length, 1);

  queueOfflineAction(
    {
      endpoint: '/api/rides/r1/status',
      method: 'POST',
      body: { status: 'Reached Home Safely' },
      description: 'Confirm safe arrival'
    },
    storage
  );

  assert.equal(getOfflineQueue(storage).length, 2);

  clearOfflineQueue(storage);
  assert.equal(getOfflineQueue(storage).length, 0);
});
