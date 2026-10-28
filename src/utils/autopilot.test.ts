import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateChargerIntelligence,
  getEligibleAutoPilotChargers,
  planAutoPilotMission,
  buildAutoPilotNavigationStages,
  resolveNextChargerNavigation,
  detectIneligiblePlannedChargers,
  discoverCorridorPitStops,
  type ChargerCommunityReport,
  type EligibleChargerRecord,
  type RouteCoordinate
} from './autopilot.ts';

const START_BLR: RouteCoordinate = {
  name: 'Ultraviolette Hangar Indiranagar',
  address: '100 Feet Rd, Indiranagar, Bengaluru, Karnataka',
  latitude: 12.9719,
  longitude: 77.6412
};

const DEST_MYS: RouteCoordinate = {
  name: 'Mysuru Palace Gate',
  address: 'Sayyaji Rao Rd, Mysuru, Karnataka',
  latitude: 12.3051,
  longitude: 76.6551
};

const DEST_CHN: RouteCoordinate = {
  name: 'Marina Beach Corridor, Chennai',
  address: 'Kamarajar Salai, Chennai, Tamil Nadu',
  latitude: 13.0500,
  longitude: 80.2824
};

function makeStation(overrides: Partial<EligibleChargerRecord> & { id: string; name: string; latitude: number; longitude: number }): EligibleChargerRecord {
  return {
    location: 'Highway Corridor, India',
    chargerType: 'Supernova',
    connectorTypes: ['Supernova DC'],
    powerOutputKw: 30,
    chargerSource: 'Supernova',
    isSupernova: true,
    isCommunityReported: false,
    verifiedByAdmin: true,
    approvalStatus: 'approved',
    published: true,
    operatingStatus: 'Operational',
    accessConditions: 'Public 24/7',
    lastVerifiedDate: '2026-10-18',
    ...overrides
  };
}

test('Auto Pilot: getEligibleAutoPilotChargers filters out pending, rejected, unpublished, deleted, and invalid coordinates', () => {
  const stations: EligibleChargerRecord[] = [
    makeStation({ id: 'cs_valid', name: 'Valid Charger', latitude: 12.65, longitude: 77.20 }),
    makeStation({ id: 'cs_pending', name: 'Pending Charger', latitude: 12.65, longitude: 77.20, approvalStatus: 'pending', verifiedByAdmin: false, published: false }),
    makeStation({ id: 'cs_rejected', name: 'Rejected Charger', latitude: 12.65, longitude: 77.20, approvalStatus: 'rejected', verifiedByAdmin: false, published: false }),
    makeStation({ id: 'cs_unpub', name: 'Unpublished Charger', latitude: 12.65, longitude: 77.20, published: false }),
    makeStation({ id: 'cs_bad_coord', name: 'Invalid Coords', latitude: 145, longitude: 77.20 })
  ];

  const eligible = getEligibleAutoPilotChargers(stations);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].id, 'cs_valid');
});

test('Auto Pilot: evaluateChargerIntelligence computes accurate confidence labels and deduplicates single-user spam', () => {
  const now = Date.parse('2026-10-20T00:00:00Z');
  const recentIso = '2026-10-18T10:00:00Z';
  const oldIso = '2026-07-01T10:00:00Z';

  // 1. No recent reports (only old report)
  const oldOnly: ChargerCommunityReport[] = [
    {
      id: 'r1',
      chargerId: 'cs_1',
      userId: 'u_1',
      reporterCallsign: 'Apex',
      category: 'WORKING',
      createdAt: oldIso,
      sourceLabel: 'Community Report'
    }
  ];
  const s1 = evaluateChargerIntelligence('cs_1', oldOnly, now);
  assert.equal(s1.confidenceLabel, 'NO RECENT REPORTS');
  assert.equal(s1.sourceLabel, 'Community Report');

  // 2. Recently reported working
  const workingReports: ChargerCommunityReport[] = [
    {
      id: 'r2',
      chargerId: 'cs_1',
      userId: 'u_1',
      reporterCallsign: 'Apex',
      category: 'SUCCESSFULLY CHARGED',
      createdAt: recentIso,
      sourceLabel: 'Community Report'
    }
  ];
  const s2 = evaluateChargerIntelligence('cs_1', workingReports, now);
  assert.equal(s2.confidenceLabel, 'RECENTLY REPORTED WORKING');
  assert.equal(s2.hasRecentIssue, false);

  // 3. Repeated spam from same user (u_spammer posts 5 WORKING reports, u_2 posts 1 FAULTY report later)
  const spamVsFaulty: ChargerCommunityReport[] = [
    {
      id: 'r_faulty',
      chargerId: 'cs_1',
      userId: 'u_2',
      reporterCallsign: 'Phantom',
      category: 'FAULTY',
      createdAt: '2026-10-19T12:00:00Z',
      sourceLabel: 'Community Report'
    },
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `r_spam_${i}`,
      chargerId: 'cs_1',
      userId: 'u_spammer',
      reporterCallsign: 'Spammer',
      category: 'WORKING' as const,
      createdAt: `2026-10-18T0${i}:00:00Z`,
      sourceLabel: 'Community Report' as const
    }))
  ];
  const s3 = evaluateChargerIntelligence('cs_1', spamVsFaulty, now);
  assert.equal(s3.uniqueReportersCount, 2);
  assert.equal(s3.recentPositiveCount, 1);
  assert.equal(s3.recentNegativeCount, 1);
  assert.equal(s3.confidenceLabel, 'MIXED REPORTS');
  assert.equal(s3.hasRecentIssue, true);
});

test('Auto Pilot: Scenario C (Reachable without stop) avoids adding unnecessary chargers', () => {
  const shortDest: RouteCoordinate = {
    name: 'Channapatna Highway Point',
    address: 'NH 275 Channapatna',
    latitude: 12.6518,
    longitude: 77.2067
  };

  const stations = [
    makeStation({ id: 'cs_mid', name: 'Bidadi Charger', latitude: 12.79, longitude: 77.38 })
  ];

  const plan = planAutoPilotMission({
    startLocation: START_BLR,
    destination: shortDest,
    roadDistanceKm: 62,
    roadDurationMin: 65,
    routingAvailable: true,
    allStations: stations,
    reports: [],
    targetIntervalKm: 100
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.chargingStops.length, 0);
  assert.equal(plan.briefing.selectedStopsCount, 0);
});

test('Auto Pilot: Scenario A (Dense charger network) selects optimal stops near ~100 km intervals and identifies backups', () => {
  // 345 km Bengaluru -> Chennai corridor
  const denseStations: EligibleChargerRecord[] = [
    makeStation({ id: 'cs_35km', name: 'Hoskote Hub (KM 35)', latitude: 13.07, longitude: 77.79 }),
    makeStation({ id: 'cs_70km', name: 'Kolar Tamaka Hub (KM 70)', latitude: 13.1328, longitude: 78.1715 }),
    makeStation({ id: 'cs_95km', name: 'Mulbagal Supernova (KM 95)', latitude: 13.1645, longitude: 78.3932 }),
    makeStation({ id: 'cs_98km_backup', name: 'Mulbagal Backup Type 2 (KM 98)', latitude: 13.1660, longitude: 78.4150, chargerType: 'Type 2', isSupernova: false }),
    makeStation({ id: 'cs_195km', name: 'Vellore Highway Supernova (KM 195)', latitude: 12.9349, longitude: 79.1469 }),
    makeStation({ id: 'cs_290km', name: 'Sriperumbudur Fast Pod (KM 290)', latitude: 12.9675, longitude: 79.9479 })
  ];

  const poly: [number, number][] = [
    [START_BLR.latitude, START_BLR.longitude],
    [13.1328, 78.1715],
    [13.1645, 78.3932],
    [12.9349, 79.1469],
    [12.9675, 79.9479],
    [DEST_CHN.latitude, DEST_CHN.longitude]
  ];

  const plan = planAutoPilotMission({
    startLocation: START_BLR,
    destination: DEST_CHN,
    routePolyline: poly,
    roadDistanceKm: 345,
    roadDurationMin: 390,
    routingAvailable: true,
    allStations: denseStations,
    reports: [],
    targetIntervalKm: 100
  });

  assert.equal(plan.valid, true);
  // Should not select every station (6 available), should pick ~3 stops in driving order
  assert.ok(plan.chargingStops.length >= 2 && plan.chargingStops.length <= 4);
  for (let i = 1; i < plan.chargingStops.length; i++) {
    assert.ok(
      plan.chargingStops[i].distanceFromStartKm >= plan.chargingStops[i - 1].distanceFromStartKm,
      'Charging stops must be strictly in driving order along route'
    );
  }
  // Stop near Mulbagal should have backup charger(s) identified
  const mulbagalStop = plan.chargingStops.find(s => s.station.id === 'cs_95km');
  assert.ok(mulbagalStop, 'Should select Mulbagal Supernova near KM 95');
  assert.ok(mulbagalStop.backupChargers.length >= 1, 'Should identify Mulbagal Backup Type 2');
});

test('Auto Pilot: Scenario B (Sparse charger network) includes earlier stepping-stone charger and warns of long gaps', () => {
  // 260 km trip where the ONLY charger is at KM 48 (before the 55-128 km target window)
  const sparseStations: EligibleChargerRecord[] = [
    makeStation({
      id: 'cs_stepping_stone',
      name: 'Early Highway Stepping Stone (KM 48)',
      latitude: 12.68,
      longitude: 77.25
    })
  ];

  const poly: [number, number][] = [
    [START_BLR.latitude, START_BLR.longitude],
    [12.68, 77.25],
    [DEST_MYS.latitude, DEST_MYS.longitude]
  ];

  const plan = planAutoPilotMission({
    startLocation: START_BLR,
    destination: DEST_MYS,
    routePolyline: poly,
    roadDistanceKm: 240,
    roadDurationMin: 270,
    routingAvailable: true,
    allStations: sparseStations,
    reports: [],
    targetIntervalKm: 100
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.chargingStops.length, 1);
  assert.equal(plan.chargingStops[0].station.id, 'cs_stepping_stone');
  assert.ok(plan.briefing.unusuallyLongGaps.length >= 1);
  assert.ok(plan.briefing.networkSparseWarning);
});

test('Auto Pilot: Range Guard flags legs exceeding rider-estimated range and recommends earlier charger', () => {
  const stations: EligibleChargerRecord[] = [
    makeStation({ id: 'cs_early', name: 'Channapatna KM 58', latitude: 12.6518, longitude: 77.2067 }),
    makeStation({ id: 'cs_maddur', name: 'Maddur KM 85', latitude: 12.5841, longitude: 77.0428 })
  ];
  const poly: [number, number][] = [
    [START_BLR.latitude, START_BLR.longitude],
    [12.6518, 77.2067],
    [12.5841, 77.0428],
    [DEST_MYS.latitude, DEST_MYS.longitude]
  ];

  // Rider removes both stops on a 145 km route with 110 km usable range and 20 km reserve (90 km safe leg)
  const plan = planAutoPilotMission({
    startLocation: START_BLR,
    destination: DEST_MYS,
    routePolyline: poly,
    roadDistanceKm: 145,
    roadDurationMin: 160,
    routingAvailable: true,
    allStations: stations,
    reports: [],
    removedStationIds: ['cs_early', 'cs_maddur'],
    rangeGuard: {
      enabled: true,
      startingBatteryPercent: 80,
      estimatedUsableRangeKm: 110,
      reserveRangeKm: 20
    }
  });

  assert.equal(plan.briefing.rangeGuardEvaluation.enabled, true);
  assert.ok(plan.briefing.rangeGuardEvaluation.warnings.length >= 1);
  assert.equal(plan.briefing.rangeGuardEvaluation.warnings[0].severity, 'critical');
  assert.ok(plan.briefing.rangeGuardEvaluation.warnings[0].recommendedEarlierCharger);
});

test('Auto Pilot: buildAutoPilotNavigationStages reuses Google Maps dir URL and splits stages when waypoints exceed limit', () => {
  const manyStops = Array.from({ length: 10 }, (_, idx) => {
    const st = makeStation({
      id: `cs_${idx + 1}`,
      name: `Stop ${idx + 1}`,
      latitude: 12.9 + idx * 0.1,
      longitude: 77.6 + idx * 0.1
    });
    return {
      station: st,
      order: idx + 1,
      distanceFromStartKm: (idx + 1) * 30,
      distanceFromPrevStopKm: 30,
      distanceToNextStopKm: 30,
      detourDistanceKm: 1,
      estimatedDetourDurationMin: 2,
      selectionReason: 'Test',
      intelligence: evaluateChargerIntelligence(st.id, []),
      backupChargers: [],
      reached: false,
      chargingConfirmed: false
    };
  });

  const stages = buildAutoPilotNavigationStages(START_BLR, manyStops, [], DEST_CHN, 8);
  assert.equal(stages.length, 2, '10 intermediate stops with limit 8 should split into 2 sequential stages');
  assert.ok(stages[0].url.startsWith('https://www.google.com/maps/dir/?api=1'));
  assert.ok(stages[0].url.includes('waypoints='));
  assert.equal(stages[0].waypointNames.length, 8);
  assert.equal(stages[1].originName, 'Stop 9');
  assert.equal(stages[1].destinationName, DEST_CHN.name);
});

test('Auto Pilot: detectIneligiblePlannedChargers flags unpublished, deleted, or newly faulty chargers', () => {
  const stations: EligibleChargerRecord[] = [
    makeStation({ id: 'cs_unpub', name: 'Unpublished Pod', latitude: 12.9, longitude: 77.6, published: false }),
    makeStation({ id: 'cs_faulty', name: 'Faulty Pod', latitude: 12.8, longitude: 77.5 })
  ];
  const reports: ChargerCommunityReport[] = [
    {
      id: 'rep_1',
      chargerId: 'cs_faulty',
      userId: 'u_1',
      reporterCallsign: 'Apex',
      category: 'FAULTY',
      createdAt: new Date().toISOString(),
      sourceLabel: 'Community Report'
    }
  ];

  const alerts = detectIneligiblePlannedChargers(
    ['cs_deleted_id', 'cs_unpub', 'cs_faulty'],
    stations,
    reports
  );
  assert.equal(alerts.length, 3);
});

test('Auto Pilot: resolveNextChargerNavigation identifies next unreached stop and advances after mark as reached', () => {
  const st1 = makeStation({ id: 'cs_1', name: 'First Stop', latitude: 12.8, longitude: 77.4 });
  const st2 = makeStation({ id: 'cs_2', name: 'Second Stop', latitude: 12.6, longitude: 77.1 });
  const stops = [
    {
      station: st1,
      order: 1,
      distanceFromStartKm: 45,
      distanceFromPrevStopKm: 45,
      distanceToNextStopKm: 45,
      detourDistanceKm: 1,
      estimatedDetourDurationMin: 2,
      selectionReason: 'Stop 1',
      intelligence: evaluateChargerIntelligence('cs_1', []),
      backupChargers: [],
      reached: true,
      reachedAt: '2026-10-20T06:00:00Z',
      chargingConfirmed: true
    },
    {
      station: st2,
      order: 2,
      distanceFromStartKm: 90,
      distanceFromPrevStopKm: 45,
      distanceToNextStopKm: 50,
      detourDistanceKm: 1,
      estimatedDetourDurationMin: 2,
      selectionReason: 'Stop 2',
      intelligence: evaluateChargerIntelligence('cs_2', []),
      backupChargers: [],
      reached: false,
      chargingConfirmed: false
    }
  ];

  const nav = resolveNextChargerNavigation(START_BLR, stops, null);
  assert.equal(nav.allReached, false);
  assert.equal(nav.nextStop?.station.id, 'cs_2');
  assert.ok(nav.url?.includes('12.800000%2C77.400000'), 'Uses last reached stop as origin when GPS is not active');
  assert.ok(nav.url?.includes('12.600000%2C77.100000'), 'Targets next unreached stop as destination');
});

test('Auto Pilot: discoverCorridorPitStops finds real restaurants/cafes along route without including pure EV chargers', () => {
  const poly: [number, number][] = [
    [12.9719, 77.6412],
    [12.6518, 77.2067],
    [12.5841, 77.0428],
    [12.3051, 76.6551]
  ];
  const pitStops = discoverCorridorPitStops(poly, 145, 'ALL');
  assert.ok(pitStops.length >= 2, 'Should discover Maddur / Channapatna corridor cafes & restaurants');
  assert.ok(pitStops.some(p => p.name.includes('Maddur') || p.name.includes('Channapatna')));
});
