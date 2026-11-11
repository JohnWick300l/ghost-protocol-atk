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
  formatDirectJetEngineerSolution,
  JET_ENGINEER_WELCOME_MESSAGE,
  reconcileCollectionWithCache,
  recordDeletedId,
  getDeletedIds,
  JET_ENGINEER_COST_KB_VERSION,
  JET_ENGINEER_COST_KB_LAST_UPDATED,
  JET_ENGINEER_UNKNOWN_FALLBACK_MESSAGE,
  getJetEngineerCostKnowledgeIndex,
  queryJetEngineerCostKnowledgeBase,
  formatInrAmount
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

test('generateOfflineJetEngineerResponse and formatDirectJetEngineerSolution return direct clean solutions without boilerplate metadata', () => {
  assert.equal(JET_ENGINEER_WELCOME_MESSAGE, 'Welcome Pilot, how can I help you today?');

  const presetSolution = formatDirectJetEngineerSolution({
    title: 'Debug',
    resolutionOutcome: 'Perform a 45-second key-off cold reboot and verify the 15A earthing loop.'
  });
  assert.equal(
    presetSolution,
    'Perform a 45-second key-off cold reboot and verify the 15A earthing loop.'
  );
  assert.equal(presetSolution.includes('INSTANT EMPIRICAL SOLUTION'), false);
  assert.equal(presetSolution.includes('Platform Model'), false);
  assert.equal(presetSolution.includes('Verification:'), false);

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
  assert.equal(
    response.answer,
    'Use a dedicated grounded 15A wall socket with verified earth-to-neutral < 2V.'
  );
  assert.equal(response.answer.includes('OFFLINE TACTICAL ARCHIVE MODE'), false);
  assert.equal(response.answer.includes('Platform Model'), false);
  assert.equal(response.answer.includes('Verification'), false);
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

test('Jet Engineer Cost Knowledge Base: clean responses without metadata clutter and exact learning fallback', () => {
  // Idempotent singleton indexing & dataset version metadata
  const idx1 = getJetEngineerCostKnowledgeIndex();
  const idx2 = getJetEngineerCostKnowledgeIndex();
  assert.strictEqual(idx1, idx2);
  assert.equal(idx1.schemaVersion, JET_ENGINEER_COST_KB_VERSION);
  assert.equal(idx1.lastUpdated, JET_ENGINEER_COST_KB_LAST_UPDATED);
  assert.equal(idx1.records.length, 4);
  assert.equal(idx1.unitemisedRecords.length, 1);

  // Criterion 1, 2 & 3: F77 chain slider part price ₹105.00, labour ₹29.50, combined ₹134.50, no STATUS/Part number/Source clutter
  const qChainPart = generateOfflineJetEngineerResponse('How much does an F77 chain slider cost?', 'F77');
  assert.ok(qChainPart.answer.includes('₹105.00'), 'Must include ₹105.00 part price');
  assert.ok(qChainPart.answer.includes('₹29.50'), 'Must include ₹29.50 labour');
  assert.ok(qChainPart.answer.includes('₹134.50'), 'Must include ₹134.50 combined amount');
  assert.equal(qChainPart.answer.includes('STATUS:'), false, 'Must not include STATUS line');
  assert.equal(qChainPart.answer.includes('Part number:'), false, 'Must not include Part number line');
  assert.equal(qChainPart.answer.includes('Source:'), false, 'Must not include Source line');

  const qChainLabour = generateOfflineJetEngineerResponse(
    'What is the labour charge for replacing the chain slider?',
    'F77'
  );
  assert.ok(qChainLabour.answer.includes('₹29.50'), 'Must include ₹29.50 labour charge');
  assert.ok(qChainLabour.answer.includes('Chain Slider Removal and Replacement'));
  assert.equal(qChainLabour.answer.includes('STATUS:'), false);
  assert.equal(qChainLabour.answer.includes('Source:'), false);

  // Criterion 4: F77 3rd paid service returns 20,000 km / 720 days and service labour ₹4,823.25
  const qService = generateOfflineJetEngineerResponse('What is the 20K service cost?', 'F77');
  assert.ok(qService.answer.includes('20,000 km / 720 days'), 'Must include 20,000 km / 720 days');
  assert.ok(qService.answer.includes('₹4,823.25'), 'Must include ₹4,823.25 service labour');
  assert.equal(qService.answer.includes('STATUS:'), false);
  assert.equal(qService.answer.includes('Source:'), false);

  // Criterion 5: X47 handlebar tube part price returns ₹3,984.00 and matching labour ₹590.00
  const qHandlebar = generateOfflineJetEngineerResponse('What is the price of an X47 handlebar?', 'F77');
  assert.ok(qHandlebar.answer.includes('Ultraviolette X47'));
  assert.ok(qHandlebar.answer.includes('₹3,984.00'), 'Must include ₹3,984.00 part price');
  assert.ok(qHandlebar.answer.includes('₹590.00'), 'Must include ₹590.00 labour');
  assert.ok(qHandlebar.answer.includes('₹4,574.00'), 'Must include ₹4,574.00 combined');
  assert.equal(qHandlebar.answer.includes('STATUS:'), false);
  assert.equal(qHandlebar.answer.includes('Part number:'), false);
  assert.equal(qHandlebar.answer.includes('Source:'), false);

  // Criterion 6: X47 LH ADAS mirror returns part price ₹1,559.00 and matching labour ₹44.25
  const qAdasMirror = generateOfflineJetEngineerResponse(
    'How much is the left ADAS mirror including labour?',
    'F77'
  );
  assert.ok(qAdasMirror.answer.includes('Ultraviolette X47'));
  assert.ok(qAdasMirror.answer.includes('₹1,559.00'), 'Must include ₹1,559.00 part price');
  assert.ok(qAdasMirror.answer.includes('₹44.25'), 'Must include ₹44.25 labour');
  assert.ok(qAdasMirror.answer.includes('₹1,603.25'), 'Must include ₹1,603.25 combined');

  // Criterion 7: X47 Recon high-range fixed battery returns ₹1,62,929.42 without STATUS/Part number/Source clutter
  const qBattery = generateOfflineJetEngineerResponse(
    'What is the high-range X47 Recon battery price?',
    'X47'
  );
  assert.ok(qBattery.answer.includes('₹1,62,929.42'), 'Must include ₹1,62,929.42');
  assert.equal(qBattery.answer.includes('ESTIMATE — NOT CONFIRMED PAID'), false);
  assert.equal(qBattery.answer.includes('Part number:'), false);
  assert.equal(qBattery.answer.includes('Source:'), false);
  assert.ok(
    qBattery.answer.includes(
      'A separate labour charge for this exact part was not listed in the supplied records.'
    )
  );

  // Criterion 8: X47 Recon fork leg assembly LH returns part price ₹14,813.32 and labour ₹977.71
  const qForkLeg = generateOfflineJetEngineerResponse(
    'What is the labour charge for replacing the fork leg?',
    'F77'
  );
  assert.ok(qForkLeg.answer.includes('₹14,813.32'), 'Must include ₹14,813.32 part price');
  assert.ok(qForkLeg.answer.includes('₹977.71'), 'Must include ₹977.71 labour');
  assert.equal(qForkLeg.answer.includes('ESTIMATE — NOT CONFIRMED PAID'), false);

  // Criterion 9: Unlisted part or unknown question returns the exact learning fallback message
  const qUnlisted = generateOfflineJetEngineerResponse(
    'How much does a rear brake caliper piston cost?',
    'F77'
  );
  assert.equal(qUnlisted.answer, JET_ENGINEER_UNKNOWN_FALLBACK_MESSAGE);
  assert.equal(/₹\d/.test(qUnlisted.answer), false, 'Must never fabricate a price');

  const qWrongModel = generateOfflineJetEngineerResponse(
    'How much does an X47 chain slider cost?',
    'X47'
  );
  assert.equal(qWrongModel.answer, JET_ENGINEER_UNKNOWN_FALLBACK_MESSAGE);
  assert.equal(qWrongModel.answer.includes('₹105.00'), false);

  const qUnknownGeneral = generateOfflineJetEngineerResponse(
    'What is the tyre pressure for flying on Mars?',
    'F77'
  );
  assert.equal(qUnknownGeneral.answer, JET_ENGINEER_UNKNOWN_FALLBACK_MESSAGE);

  // Criterion 10: The ₹87,535 unitemised record must never be used to answer an individual part-price query
  assert.equal(
    idx1.partsIndex.some(p => p.record.record_id === 'UNITEMISED-ESTIMATE-87535'),
    false
  );
  assert.equal(
    idx1.labourIndex.some(l => l.record.record_id === 'UNITEMISED-ESTIMATE-87535'),
    false
  );
  assert.equal(qUnlisted.answer.includes('87,535'), false);
});


