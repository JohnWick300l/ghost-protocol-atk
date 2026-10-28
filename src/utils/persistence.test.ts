import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CACHE_KEYS,
  saveToCache,
  loadFromCache,
  saveFormDraft,
  loadFormDraft,
  clearFormDraft,
  enqueueOfflineAction,
  getOfflineQueue,
  clearOfflineQueueItem,
  normalizeMarketplaceResponse,
  canUserModifyRecord,
  mergeServerAndQueuedRecords,
  generateOfflineJetEngineerResponse,
  reconcileCollectionWithCache,
  recordDeletedId,
  getDeletedIds
} from './telemetryCache.ts';

test('normalizeMarketplaceResponse handles both { items: [...] } and raw arrays so listings never vanish', () => {
  const sampleItem = { id: 'mkt_1', title: 'Aero Disc Cover', price: 3200 };
  assert.deepEqual(normalizeMarketplaceResponse({ items: [sampleItem] }), [sampleItem]);
  assert.deepEqual(normalizeMarketplaceResponse([sampleItem]), [sampleItem]);
  assert.deepEqual(normalizeMarketplaceResponse({ listings: [sampleItem] }), [sampleItem]);
  assert.deepEqual(normalizeMarketplaceResponse(null), []);
  assert.deepEqual(normalizeMarketplaceResponse({}), []);
});

test('canUserModifyRecord enforces ownership, owner, and administrator role rules accurately', () => {
  const adminUser = { id: 'u_admin', fullName: 'Abinav Thejas', role: 'admin' };
  const platformOwner = { id: 'u_owner', fullName: 'Abinav Thejas', role: 'owner', isOwner: true };
  const ownerUser = { id: 'u_pilot07', fullName: 'Vikram Sengupta', role: 'verified_member' };
  const otherUser = { id: 'u_phantom', fullName: 'Devika Nair', role: 'verified_member' };

  const record = {
    id: 'disc_101',
    userId: 'u_pilot07',
    authorName: 'Vikram Sengupta'
  };

  assert.equal(canUserModifyRecord(record, ownerUser), true);
  assert.equal(canUserModifyRecord(record, adminUser), true);
  assert.equal(canUserModifyRecord(record, platformOwner), true);
  assert.equal(canUserModifyRecord(record, otherUser), false);
  assert.equal(canUserModifyRecord(record, null), false);
});

test('saveToCache and loadFromCache persist and retrieve datasets reliably', () => {
  const sampleDiscussions = [{ id: 'd1', title: 'Persistent thread' }];
  saveToCache(CACHE_KEYS.DISCUSSIONS, sampleDiscussions);
  const loaded = loadFromCache<typeof sampleDiscussions>(CACHE_KEYS.DISCUSSIONS);
  assert.ok(loaded);
  assert.deepEqual(loaded.data, sampleDiscussions);
  assert.equal(typeof loaded.timestamp, 'string');
});

test('reconcileCollectionWithCache retains user-saved records and nested comments when server resets to default seed data', () => {
  const seedDiscussion = {
    id: 'disc_seed_1',
    title: 'Seed Thread',
    comments: [{ id: 'c_seed_1', text: 'Initial seed comment' }]
  };
  const userAddedDiscussion = {
    id: 'disc_user_999',
    title: 'User Created Thread That Was Already Synced',
    comments: [{ id: 'c_user_1', text: 'My custom comment' }]
  };
  const seedWithUserReply = {
    id: 'disc_seed_1',
    title: 'Seed Thread',
    comments: [
      { id: 'c_seed_1', text: 'Initial seed comment' },
      { id: 'c_user_reply_2', text: 'User reply added before container restart' }
    ]
  };

  // Client cache has both the user-created thread and the user's reply on the seed thread
  saveToCache(CACHE_KEYS.DISCUSSIONS, [userAddedDiscussion, seedWithUserReply]);

  // Simulate server container restarting and returning only the bare seed discussion
  const reconciled = reconcileCollectionWithCache(CACHE_KEYS.DISCUSSIONS, [seedDiscussion]);

  assert.equal(reconciled.length, 2);
  const foundUserThread = reconciled.find(d => d.id === 'disc_user_999');
  assert.ok(foundUserThread, 'User-created thread must not be wiped out by default server seed response');
  assert.equal(foundUserThread?.title, 'User Created Thread That Was Already Synced');

  const foundSeedThread = reconciled.find(d => d.id === 'disc_seed_1');
  assert.ok(foundSeedThread);
  assert.equal(foundSeedThread?.comments.length, 2, 'User reply on seed thread must be preserved');
});

test('recordDeletedId prevents deleted records from resurrecting during reconciliation', () => {
  const itemA = { id: 'prob_keep_1', title: 'Keep Me' };
  const itemB = { id: 'prob_delete_2', title: 'Delete Me' };
  saveToCache(CACHE_KEYS.PROBLEMS, [itemA, itemB]);

  recordDeletedId('prob_delete_2');
  assert.ok(getDeletedIds().includes('prob_delete_2'));

  // Even if server still returns itemB, reconciliation filters it out via tombstone
  const reconciled = reconcileCollectionWithCache(CACHE_KEYS.PROBLEMS, [itemA, itemB]);
  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].id, 'prob_keep_1');
});

test('saveFormDraft, loadFormDraft, and clearFormDraft preserve unsaved user inputs', () => {
  saveFormDraft('mod_submission', { title: 'Ohlins Damper', partNumbers: 'OH-77' });
  const loaded = loadFormDraft<{ title: string; partNumbers: string }>('mod_submission');
  assert.deepEqual(loaded, { title: 'Ohlins Damper', partNumbers: 'OH-77' });

  clearFormDraft('mod_submission');
  assert.equal(loadFormDraft('mod_submission'), null);
});

test('enqueueOfflineAction deduplicates by clientRequestId and manages queue items', () => {
  // Clear any existing items
  for (const item of getOfflineQueue()) {
    clearOfflineQueueItem(item.id);
  }

  const q1 = enqueueOfflineAction(
    '/api/discussions',
    'POST',
    { title: 'Offline Post' },
    { clientRequestId: 'req_test_100', module: 'discussions', label: 'Offline Post' }
  );
  const q2 = enqueueOfflineAction(
    '/api/discussions',
    'POST',
    { title: 'Offline Post Updated' },
    { clientRequestId: 'req_test_100', module: 'discussions', label: 'Offline Post Updated' }
  );

  const queue = getOfflineQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, q1.id);
  assert.equal(queue[0].payload.title, 'Offline Post Updated');
  assert.equal(queue[0].clientRequestId, 'req_test_100');

  clearOfflineQueueItem(q2.id);
  assert.equal(getOfflineQueue().length, 0);
});

test('mergeServerAndQueuedRecords prevents duplicate display after sync', () => {
  const serverRecords = [
    { id: 'srv_1', clientRequestId: 'req_abc', title: 'Synced Item' },
    { id: 'srv_2', title: 'Existing Item' }
  ];
  const queuedItems = [
    { id: 'local_1', clientRequestId: 'req_abc', title: 'Synced Item' },
    { id: 'local_2', clientRequestId: 'req_xyz', title: 'Still Pending Item' }
  ];

  const merged = mergeServerAndQueuedRecords(serverRecords, queuedItems);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].id, 'local_2');
  assert.equal(merged[1].id, 'srv_1');
  assert.equal(merged[2].id, 'srv_2');
});

test('generateOfflineJetEngineerResponse synthesizes grounded answers from cached knowledge base', () => {
  const response = generateOfflineJetEngineerResponse(
    'charger earthing fault blinking red',
    'F77 MACH 2',
    [
      {
        title: '15A Socket Earthing Fault & Surge Protector Bypass',
        motorcycleModel: 'F77 MACH 2',
        symptoms: 'Red blinking LED on Boost Charger',
        resolutionOutcome: 'Use a dedicated grounded 15A wall socket with verified earth-to-neutral < 2V.'
      }
    ],
    []
  );
  assert.ok(response.includes('OFFLINE TACTICAL ARCHIVE MODE'));
  assert.ok(response.includes('15A Socket Earthing Fault'));
  assert.ok(response.includes('earth-to-neutral < 2V'));
});

test('Phase 1: reconcileCollectionWithCache preserves MissionMode participants and announcements on server reset', () => {
  const cachedRide = {
    id: 'ride_phase1_1',
    title: 'Dawn Squadron Run',
    participants: [
      { userId: 'u_1', fullName: 'Pilot 1', status: 'joined' },
      { userId: 'u_2', fullName: 'Pilot 2', status: 'joined' }
    ],
    announcements: [{ id: 'ann_1', message: 'Rendezvous 0530' }]
  };
  const resetServerRide = {
    id: 'ride_phase1_1',
    title: 'Dawn Squadron Run',
    participants: [{ userId: 'u_1', fullName: 'Pilot 1', status: 'joined' }],
    announcements: []
  };

  saveToCache(CACHE_KEYS.RIDES, [cachedRide]);
  const reconciled = reconcileCollectionWithCache(CACHE_KEYS.RIDES, [resetServerRide]);
  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].participants.length, 2);
  assert.equal(reconciled[0].announcements.length, 1);
});

