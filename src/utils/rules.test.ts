import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRideDistance,
  isValidBloodGroup,
  canAccessOwnerFeatures,
  calculateRideStatusSummary,
  evaluateRideCompletion,
  calculateDistanceKm,
  isWithinAssistanceRadius,
  sortProblemsBySeverity,
  getSeverityRank,
  X47_PRIORITY_ISSUES_SEED,
  F77_PRIORITY_ISSUES_SEED,
  isValidChargerSource,
  matchesChargingStationFilter,
  LEFT_MFD_SYSTEMS_ITEMS,
  RIGHT_MFD_COMMUNITY_ITEMS,
  DEDICATED_COCKPIT_CONTROLS,
  resolveJetEngineerAction,
  extractMarketplaceItemImages,
  isValidChargerPlugType,
  validateAndSanitizeUrl,
  validateChargingPlugSubmission,
  isPubliclyPublishedCharger,
  canModifyChargerRecord,
  clusterChargingStations,
  buildChargerNavigationUrl,
  resolveChargerSubmitterInfo,
  CHARGER_PLUG_TYPE_SPECS,
  searchChargerLandmarks,
  describeMapPinLocation,
  expandIndianPlaceQuery,
  searchAndRankPlaces,
  isValidHttpUrl,
  sanitizeAndValidateProductLinks,
  validateManualCoordinates,
  formatManualCoordinatesFallback,
  COCKPIT_IMAGE_ASSET_PATH,
  COCKPIT_IMAGE_DIMENSIONS,
  COCKPIT_ROTARY_STAGE_ASSET_PATH,
  COCKPIT_ROTARY_REFERENCE_ASSET_PATH,
  COCKPIT_ROTARY_STAGE_DIMENSIONS,
  COCKPIT_HOME_CARD_HOTSPOTS,
  COCKPIT_ALL_SYSTEM_CONTROLS_HOTSPOT,
  ALL_SYSTEM_CONTROLS_DIRECTORY,
  ROTARY_NAVIGATION_REGISTRY,
  getAuthorizedRotaryDestinations,
  formatRotarySelectionCounter,
  normalizeDegrees,
  shortestAngularDelta,
  calculatePointerAngleDeg,
  getSegmentStepDeg,
  getNearestRotaryIndex,
  getTargetWheelRotationForIndex,
  computeInertialSnapIndex,
  areHotspotsNonOverlapping,
  CONTRIBUTION_OPTIONS,
  DEFAULT_CONTRIBUTION_CONFIG,
  canEditContributionPage,
  sanitizeContributionConfig,
  redactContributionForPublicWall,
  buildUpiPaymentUri,
  validateContributionSubmission,
  validatePollCreation,
  castPollVote,
  calculatePollResults,
  validatePetitionCreation,
  togglePetitionSupport,
  calculatePetitionProgress,
  PAGE_TRANSITION_ORDER,
  computeTransitionDirection,
  getAvionicsTransitionVariants,
  buildRouteCacheKey,
  generateOfflineCorridorGeometry,
  latLonToTileXY,
  computeOfflineTileUrlsForRegions,
  createTacticalOfflineTileDataUrl,
  resolveMarketplaceListingType,
  resolveMarketplaceOwnerContact,
  calculateRentalBookingCost,
  getSortedAuctionBids,
  getAuctionBidSummary,
  validateAndPlaceAuctionBid,
  selectAuctionWinner,
  createMarketplacePresetIllustration,
  resolveCommunityChargerTerms,
  calculateChargerReservationCost,
  validateAndCreateChargerReservation,
  canManageChargerReservation,
  updateChargerReservationStatus,
  buildChargerReservationOwnerNotification,
  canPermanentlyRemoveUser,
  permanentlyRemoveUserRecord,
  joinSortieRoster,
  leaveOrBackOffSortieRoster,
  validateVisitedDestinationSubmission,
  createDestinationPresetIllustration,
  DEFAULT_VISITED_DESTINATIONS,
  sanitizeGoogleMapsUrl,
  openInGoogleMaps,
  parseMinimalCoordinatePairs,
  formatMinimalChargerType,
  parseMinimalChargingStationsDatabase,
  searchAndFilterChargingStations,
  COCKPIT_INTERACTIVE_ZONES,
  getCockpitZoneById,
  computeShortestRotationDelta,
  resolveCockpitZoneFromCanvasPoint,
  cycleCockpitSector,
  resolveCockpitBootPhase,
  shouldSkipCockpitBootAnimation,
  getCockpitBootTransformSpec,
  resolveCockpitOperatorBadge,
  COCKPIT_RADIAL_EXPANSION_RAYS,
  COCKPIT_COMMUNITY_DISCLAIMER_TEXT,
  COCKPIT_COMMUNITY_DISCLAIMER_TAGLINE,
  type ParsedMinimalChargingDatabaseResult,
  type RiderParticipant
} from './rules.ts';
import fs from 'node:fs';
import path from 'node:path';

test('validateRideDistance enforces strictly positive finite kilometers', () => {
  assert.equal(validateRideDistance(150).valid, true);
  assert.equal(validateRideDistance(150).value, 150);
  assert.equal(validateRideDistance('75.5').valid, true);
  assert.equal(validateRideDistance('75.5').value, 75.5);

  assert.equal(validateRideDistance(0).valid, false);
  assert.equal(validateRideDistance(-50).valid, false);
  assert.equal(validateRideDistance('invalid').valid, false);
  assert.equal(validateRideDistance(3000).valid, false); // exceeds max single-ride limit
});

test('isValidBloodGroup restricts to approved privacy-compliant options', () => {
  assert.equal(isValidBloodGroup('O+'), true);
  assert.equal(isValidBloodGroup('AB-'), true);
  assert.equal(isValidBloodGroup('Unknown'), true);
  assert.equal(isValidBloodGroup('Prefer not to disclose'), true);

  assert.equal(isValidBloodGroup('C+'), false);
  assert.equal(isValidBloodGroup(''), false);
  assert.equal(isValidBloodGroup('O_positive'), false);
});

test('canAccessOwnerFeatures allows only verified owners or admins', () => {
  assert.equal(canAccessOwnerFeatures('verified', 'verified_member'), true);
  assert.equal(canAccessOwnerFeatures('pending', 'regular'), false);
  assert.equal(canAccessOwnerFeatures('rejected', 'regular'), false);
  assert.equal(canAccessOwnerFeatures('suspended', 'verified_member'), false);
  assert.equal(canAccessOwnerFeatures('pending', 'admin'), true); // admin bypass
});

test('calculateRideStatusSummary correctly tallies riders and verifies allSafe constraint', () => {
  const riders: RiderParticipant[] = [
    {
      id: 'r1',
      userId: 'u1',
      displayName: 'StealthLead',
      motorcycleModel: 'F77 MACH 2',
      shareStartingPoint: true,
      intercomStatus: 'Has an intercom',
      status: 'Reached Home Safely',
      statusUpdatedAt: new Date().toISOString(),
      checklistCompleted: true
    },
    {
      id: 'r2',
      userId: 'u2',
      displayName: 'ViperPilot',
      motorcycleModel: 'F77 Recon',
      shareStartingPoint: false,
      intercomStatus: 'No intercom',
      status: 'Reached Home Safely',
      statusUpdatedAt: new Date().toISOString(),
      checklistCompleted: true
    }
  ];

  const summary1 = calculateRideStatusSummary(riders);
  assert.equal(summary1.totalRegistered, 2);
  assert.equal(summary1.homeSafe, 2);
  assert.equal(summary1.allSafe, true);

  // Add rider still riding
  riders.push({
    id: 'r3',
    userId: 'u3',
    displayName: 'GhostRider',
    motorcycleModel: 'X47',
    shareStartingPoint: true,
    intercomStatus: 'Intercom details not specified',
    status: 'Heading Home',
    statusUpdatedAt: new Date().toISOString(),
    checklistCompleted: true
  });

  const summary2 = calculateRideStatusSummary(riders);
  assert.equal(summary2.totalRegistered, 3);
  assert.equal(summary2.homeSafe, 2);
  assert.equal(summary2.headingHome, 1);
  assert.equal(summary2.allSafe, false); // must never be true if someone hasn't confirmed!

  const completionCheck = evaluateRideCompletion(riders);
  assert.equal(completionCheck.canComplete, true);
  assert.equal(completionCheck.outstandingCount, 1);
  assert.match(completionCheck.warning || '', /have not confirmed/);
});

test('calculateDistanceKm and isWithinAssistanceRadius calculate correct proximity', () => {
  // Bangalore Koramangala (12.9352, 77.6245) to Indiranagar (12.9719, 77.6412) ~ 4.4 km
  const dist = calculateDistanceKm(12.9352, 77.6245, 12.9719, 77.6412);
  assert.ok(dist >= 4 && dist <= 6, `Expected distance ~4.5km, got ${dist}`);
  assert.equal(isWithinAssistanceRadius(12.9352, 77.6245, 12.9719, 77.6412, 25), true);
  // Bangalore to Mysore (~140 km)
  assert.equal(isWithinAssistanceRadius(12.9716, 77.5946, 12.2958, 76.6394, 25), false);
});

test('sortProblemsBySeverity orders issues strictly Critical -> High -> Moderate -> Low -> Informational', () => {
  const items = [
    { title: 'Item 1', severity: 'Low' },
    { title: 'Item 2', severity: 'Critical / Safety-Related' },
    { title: 'Item 3', severity: 'Informational' },
    { title: 'Item 4', severity: 'High' },
    { title: 'Item 5', severity: 'Moderate' }
  ];

  const sorted = sortProblemsBySeverity(items);
  assert.deepEqual(sorted.map(i => i.title), [
    'Item 2', // Critical
    'Item 4', // High
    'Item 5', // Moderate
    'Item 1', // Low
    'Item 3'  // Informational
  ]);
});

test('isValidChargerSource and matchesChargingStationFilter handle legacy and new charger sources accurately', () => {
  assert.equal(isValidChargerSource('Supernova'), true);
  assert.equal(isValidChargerSource('3rd Party Station'), true);
  assert.equal(isValidChargerSource('Community Provided Charger'), true);
  assert.equal(isValidChargerSource('Unknown Source'), false);

  const legacySupernova = { isSupernova: true, isCommunityReported: false, powerOutputKw: 30 };
  const legacyFast = { isSupernova: false, isCommunityReported: true, powerOutputKw: 60 };
  const newThirdParty = {
    isSupernova: false,
    isCommunityReported: false,
    powerOutputKw: 7.2,
    chargerSource: '3rd Party Station' as const
  };
  const newCommunity = {
    isSupernova: false,
    isCommunityReported: true,
    powerOutputKw: 3.3,
    chargerSource: 'Community Provided Charger' as const
  };

  assert.equal(matchesChargingStationFilter(legacySupernova, 'SUPERNOVA'), true);
  assert.equal(matchesChargingStationFilter(legacyFast, '3rd Party Station'), true);
  assert.equal(matchesChargingStationFilter(legacyFast, 'Community Provided Chargers'), true);
  assert.equal(matchesChargingStationFilter(newThirdParty, '3rd Party Station'), true);
  assert.equal(matchesChargingStationFilter(newThirdParty, 'Community Provided Chargers'), false);
  assert.equal(matchesChargingStationFilter(newCommunity, 'Community Provided Chargers'), true);
  assert.equal(matchesChargingStationFilter(newCommunity, '3rd Party Station'), false);
});

test('Cockpit MFD items and dedicated physical controls map to existing routes accurately', () => {
  assert.deepEqual(
    LEFT_MFD_SYSTEMS_ITEMS.map(i => ({ label: i.label, routeId: i.routeId })),
    [
      { label: 'Priority Issues', routeId: 'problems' },
      { label: 'Charging', routeId: 'charging' },
      { label: 'Service Intel & Reviews', routeId: 'service' },
      { label: 'My Garage', routeId: 'garage' }
    ]
  );

  assert.deepEqual(
    RIGHT_MFD_COMMUNITY_ITEMS.map(i => ({ label: i.label, routeId: i.routeId })),
    [
      { label: 'Discussions', routeId: 'discussions' },
      { label: 'Modifications Lab', routeId: 'modifications' },
      { label: 'Marketplace', routeId: 'marketplace' },
      { label: 'Events', routeId: 'mission' }
    ]
  );

  assert.deepEqual(
    DEDICATED_COCKPIT_CONTROLS.map(c => ({ label: c.label, routeId: c.routeId, tone: c.tone })),
    [
      { label: 'THE JET ENGINEER', routeId: 'jet_engineer', tone: 'green' },
      { label: 'SQUADRON ASSIST', routeId: 'emergency', tone: 'red' },
      { label: 'MISSION MODE', routeId: 'mission', tone: 'amber' },
      { label: 'PRIORITY ISSUES', routeId: 'problems', tone: 'amber' }
    ]
  );

  assert.deepEqual(resolveJetEngineerAction('help'), { routeId: 'jet_engineer', mode: 'ask' });
  assert.deepEqual(resolveJetEngineerAction('train'), { routeId: 'jet_engineer', mode: 'train' });
  assert.deepEqual(resolveJetEngineerAction('main'), { routeId: 'jet_engineer', mode: 'ask' });
});

test('extractMarketplaceItemImages normalizes single and multiple photos accurately', () => {
  assert.deepEqual(extractMarketplaceItemImages(undefined), []);
  assert.deepEqual(extractMarketplaceItemImages({ imageUrl: 'https://example.com/photo1.jpg' }), [
    'https://example.com/photo1.jpg'
  ]);
  assert.deepEqual(
    extractMarketplaceItemImages({
      imageUrl: 'https://example.com/photo1.jpg',
      imageUrls: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg']
    }),
    ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg']
  );
});

test('validateChargingPlugSubmission enforces mandatory chargerType and type-specific requirements', () => {
  assert.equal(isValidChargerPlugType('Supernova'), true);
  assert.equal(isValidChargerPlugType('Type 6'), true);
  assert.equal(isValidChargerPlugType('Type 2'), true);
  assert.equal(isValidChargerPlugType('Socket'), true);
  assert.equal(isValidChargerPlugType(''), false);

  // Missing chargerType must fail
  const missingType = validateChargingPlugSubmission({
    name: 'Test Station',
    location: 'Bengaluru',
    chargerType: '',
    latitude: 12.9716,
    longitude: 77.5946
  });
  assert.equal(missingType.valid, false);
  assert.ok(missingType.errors.chargerType);

  // Supernova & Type 6 require no separate charger
  const supernovaOk = validateChargingPlugSubmission({
    name: 'Supernova Hub',
    location: 'Indiranagar, Bengaluru',
    chargerType: 'Supernova',
    latitude: 12.9719,
    longitude: 77.6412
  });
  assert.equal(supernovaOk.valid, true);

  const type6Ok = validateChargingPlugSubmission({
    name: 'Type 6 Fast Pod',
    location: 'Pune Expressway',
    chargerType: 'Type 6',
    latitude: 18.5204,
    longitude: 73.8567
  });
  assert.equal(type6Ok.valid, true);

  // Type 2 requires both uvChargingLink and chargerDetails
  const type2Missing = validateChargingPlugSubmission({
    name: 'Type 2 AC Hub',
    location: 'Mumbai Bandra',
    chargerType: 'Type 2',
    latitude: 19.0596,
    longitude: 72.8295
  });
  assert.equal(type2Missing.valid, false);
  assert.ok(type2Missing.errors.uvChargingLink);
  assert.ok(type2Missing.errors.chargerDetails);

  const type2Ok = validateChargingPlugSubmission({
    name: 'Type 2 AC Hub',
    location: 'Mumbai Bandra',
    chargerType: 'Type 2',
    uvChargingLink: 'https://ultraviolette.com/charging-link/type2',
    chargerDetails: 'UV Type 2 charging link cable + 3.3 kW Boost Charger required',
    latitude: 19.0596,
    longitude: 72.8295
  });
  assert.equal(type2Ok.valid, true);
  assert.equal(type2Ok.sanitizedUvLink, 'https://ultraviolette.com/charging-link/type2');

  // Socket is valid directly without requiring a separate chargerDetails text field
  const socketOk = validateChargingPlugSubmission({
    name: 'Highway Waypoint Socket',
    location: 'Maddur',
    chargerType: 'Socket',
    latitude: 12.5841,
    longitude: 77.0428
  });
  assert.equal(socketOk.valid, true);

  // Malicious URL rejected
  assert.equal(validateAndSanitizeUrl('javascript:alert(1)').valid, false);
});

test('isPubliclyPublishedCharger, canModifyChargerRecord, clusterChargingStations, and buildChargerNavigationUrl work accurately', () => {
  // Visibility rules
  assert.equal(isPubliclyPublishedCharger({ verifiedByAdmin: true, approvalStatus: 'approved', published: true }), true);
  assert.equal(isPubliclyPublishedCharger({ verifiedByAdmin: false, approvalStatus: 'pending', published: false }), false);
  assert.equal(isPubliclyPublishedCharger({ verifiedByAdmin: false, approvalStatus: 'rejected', published: false }), false);
  assert.equal(isPubliclyPublishedCharger({ verifiedByAdmin: true, approvalStatus: 'deleted', published: false }), false);

  // Edit/delete permissions
  assert.equal(canModifyChargerRecord({ submittedByUserId: 'u_pilot07' }, { id: 'u_pilot07', role: 'verified_member' }), true);
  assert.equal(canModifyChargerRecord({ submittedByUserId: 'u_pilot07' }, { id: 'u_other', role: 'verified_member' }), false);
  assert.equal(canModifyChargerRecord({ submittedByUserId: 'u_pilot07' }, { id: 'u_admin', role: 'admin' }), true);

  // Clustering at India-wide zoom (zoom=5) groups nearby Bengaluru stations
  const sampleStations = [
    { id: 's1', name: 'Indiranagar', latitude: 12.9719, longitude: 77.6412 },
    { id: 's2', name: 'Devanahalli', latitude: 13.2085, longitude: 77.7082 },
    { id: 's3', name: 'Mumbai Hub', latitude: 19.0760, longitude: 72.8777 }
  ];
  const zoomedOutClusters = clusterChargingStations(sampleStations, 5);
  assert.equal(zoomedOutClusters.length, 2); // Bengaluru cluster (2) + Mumbai (1)
  assert.equal(zoomedOutClusters[0].isCluster, true);
  assert.equal(zoomedOutClusters[0].count, 2);

  const zoomedInClusters = clusterChargingStations(sampleStations, 13);
  assert.equal(zoomedInClusters.length, 3); // All individual pins

  // Navigation URL builder
  const navUrl = buildChargerNavigationUrl({ latitude: 12.9719, longitude: 77.6412 });
  assert.ok(navUrl.includes('daddr=12.971900,77.641200'));
  const navUrlWithOrigin = buildChargerNavigationUrl(
    { latitude: 12.9719, longitude: 77.6412 },
    { latitude: 12.9352, longitude: 77.6245 }
  );
  assert.ok(navUrlWithOrigin.includes('saddr=12.935200,77.624500'));
});

test('Socket charger type has no OBC requirement and map landmark picker helpers resolve accurately', () => {
  assert.equal(CHARGER_PLUG_TYPE_SPECS.Socket.requiresChargerDetails, false);
  assert.equal(
    CHARGER_PLUG_TYPE_SPECS.Socket.requirementSummary.includes('On-Board Charger'),
    false
  );

  // Landmark search
  const maddurMatches = searchChargerLandmarks('Maddur');
  assert.equal(maddurMatches.length, 1);
  assert.equal(maddurMatches[0].id, 'lm_maddur_highway');

  const mumbaiMatches = searchChargerLandmarks('Mumbai');
  assert.ok(mumbaiMatches.length >= 2);

  // Map pin reverse description
  const exactPin = describeMapPinLocation(12.5841, 77.0428);
  assert.equal(exactPin.nearestLandmark.id, 'lm_maddur_highway');
  assert.equal(exactPin.distanceKm, 0);
  assert.ok(exactPin.suggestedLocationLabel.includes('Maddur'));

  const nearbyPin = describeMapPinLocation(12.985, 77.645);
  assert.equal(nearbyPin.nearestLandmark.id, 'lm_blr_indiranagar');
  assert.ok(nearbyPin.suggestedLocationLabel.includes('Indiranagar'));
});

test('Smart Location Autocomplete expands Indian shorthand (Kolar CCD) and ranks branch-level places accurately', () => {
  const expanded = expandIndianPlaceQuery('Kolar CCD');
  assert.ok(expanded.includes('Kolar CCD'));
  assert.ok(expanded.includes('Kolar Cafe Coffee Day'));
  assert.ok(expanded.includes('Cafe Coffee Day Kolar'));

  // Under 2 characters returns empty
  assert.deepEqual(searchAndRankPlaces('K'), []);

  // "Kolar CCD" returns Kolar Café Coffee Day branches at top with locality and full address
  const kolarCcdResults = searchAndRankPlaces('Kolar CCD');
  assert.ok(kolarCcdResults.length >= 3);
  assert.ok(kolarCcdResults[0].name.includes('Café Coffee Day'));
  assert.ok(kolarCcdResults[0].locality.includes('Kolar'));
  assert.ok(kolarCcdResults[0].address.includes('NH 75'));
  // Ensure branch-level coordinates, not city center
  assert.notEqual(kolarCcdResults[0].latitude, kolarCcdResults[1].latitude);

  // Also ranks live external results alongside verified directory
  const withExternal = searchAndRankPlaces('Kolar CCD', [
    {
      id: 'osm_custom_kolar',
      name: 'Coffee Day Highway Express',
      locality: 'Vemagal, Kolar',
      address: 'SH 96 Vemagal Junction, Kolar District, Karnataka 563102',
      category: 'Café / Coffee Shop',
      latitude: 13.1892,
      longitude: 78.0215
    }
  ]);
  assert.ok(withExternal.some(p => p.id === 'osm_custom_kolar'));

  // "Cafe Coffee Day Kolar" returns Kolar CCD branches
  const fullCcdKolar = searchAndRankPlaces('Cafe Coffee Day Kolar');
  assert.ok(fullCcdKolar.length >= 3);
  assert.ok(fullCcdKolar[0].name.includes('Café Coffee Day'));
  assert.ok(fullCcdKolar[0].locality.includes('Kolar'));

  // Natural-language query: "petrol pump near Kolar"
  const petrolKolar = searchAndRankPlaces('petrol pump near Kolar');
  assert.ok(petrolKolar.length >= 2);
  assert.ok(
    petrolKolar[0].category.includes('Petrol Pump') ||
      petrolKolar[0].name.toLowerCase().includes('petrol') ||
      petrolKolar[0].name.toLowerCase().includes('indianoil')
  );
  assert.ok(petrolKolar[0].locality.includes('Kolar'));

  // Natural-language query: "EV charging station Bangalore"
  const evBangalore = searchAndRankPlaces('EV charging station Bangalore');
  assert.ok(evBangalore.length >= 3);
  assert.ok(evBangalore[0].category.includes('EV Charging Station'));
  assert.ok(
    evBangalore[0].locality.includes('Bengaluru') ||
      evBangalore[0].locality.includes('Bangalore')
  );

  // Natural-language query: "restaurants near Kolar"
  const restaurantsKolar = searchAndRankPlaces('restaurants near Kolar');
  assert.ok(restaurantsKolar.length >= 2);
  assert.ok(restaurantsKolar[0].locality.includes('Kolar'));

  // Typo tolerance: "Cofe Day Kolr"
  const typoKolar = searchAndRankPlaces('Cofe Day Kolr');
  assert.ok(typoKolar.length >= 1);
  assert.ok(typoKolar[0].locality.includes('Kolar'));
});

test('isValidHttpUrl validates safe http/https URLs', () => {
  assert.strictEqual(isValidHttpUrl('https://example.com/product/123'), true);
  assert.strictEqual(isValidHttpUrl('http://shop.ultraviolette.com/part'), true);
  assert.strictEqual(isValidHttpUrl('javascript:alert(1)'), false);
  assert.strictEqual(isValidHttpUrl('ftp://files.example.com'), false);
  assert.strictEqual(isValidHttpUrl('not-a-url'), false);
  assert.strictEqual(isValidHttpUrl(''), false);
});

test('sanitizeAndValidateProductLinks processes single and multiple product links correctly', () => {
  // No product links
  const emptyRes = sanitizeAndValidateProductLinks([]);
  assert.strictEqual(emptyRes.valid, true);
  assert.strictEqual(emptyRes.productLinks.length, 0);

  // One valid link
  const singleRes = sanitizeAndValidateProductLinks([
    { url: ' https://example.com/part-a ', name: ' CNC Clamp ' }
  ]);
  assert.strictEqual(singleRes.valid, true);
  assert.strictEqual(singleRes.productLinks.length, 1);
  assert.strictEqual(singleRes.productLinks[0].url, 'https://example.com/part-a');
  assert.strictEqual(singleRes.productLinks[0].name, 'CNC Clamp');

  // Multiple valid links
  const multiRes = sanitizeAndValidateProductLinks([
    { url: 'https://example.com/item1', name: 'Item 1' },
    { url: 'https://example.com/item2', name: 'Item 2' },
    { url: '   ', name: '  ' } // empty optional link ignored
  ]);
  assert.strictEqual(multiRes.valid, true);
  assert.strictEqual(multiRes.productLinks.length, 2);

  // Invalid protocol or unsafe URL
  const invalidRes = sanitizeAndValidateProductLinks([
    { url: 'javascript:alert(1)', name: 'Hacker Link' }
  ]);
  assert.strictEqual(invalidRes.valid, false);
  assert.ok(invalidRes.errors.length > 0);
});

test('validateManualCoordinates strictly validates latitude (-90..90) and longitude (-180..180) without swapping', () => {
  // Valid positive decimal coordinates with whitespace
  const validBlr = validateManualCoordinates(' 12.9716 ', ' 77.5946 ');
  assert.equal(validBlr.valid, true);
  assert.equal(validBlr.latitude, 12.9716);
  assert.equal(validBlr.longitude, 77.5946);
  assert.equal(validBlr.latError, undefined);
  assert.equal(validBlr.lonError, undefined);

  // Valid negative coordinates (Southern & Western hemispheres)
  const validNeg = validateManualCoordinates('-33.8688', '-70.6693');
  assert.equal(validNeg.valid, true);
  assert.equal(validNeg.latitude, -33.8688);
  assert.equal(validNeg.longitude, -70.6693);

  // Out-of-range latitude (> 90 or < -90) — must NOT silently swap with longitude
  const badLat = validateManualCoordinates('95.123', '77.5946');
  assert.equal(badLat.valid, false);
  assert.ok(badLat.latError);
  assert.equal(badLat.lonError, undefined);

  const negBadLat = validateManualCoordinates('-91', '77.5946');
  assert.equal(negBadLat.valid, false);
  assert.ok(negBadLat.latError);

  // Out-of-range longitude (> 180 or < -180)
  const badLon = validateManualCoordinates('12.9716', '185.5');
  assert.equal(badLon.valid, false);
  assert.equal(badLon.latError, undefined);
  assert.ok(badLon.lonError);

  // Malformed values, combined strings, or empty strings
  assert.equal(validateManualCoordinates('', '77.5946').valid, false);
  assert.equal(validateManualCoordinates('12.9716', '').valid, false);
  assert.equal(validateManualCoordinates('12.97abc', '77.5946').valid, false);
  assert.equal(validateManualCoordinates('12.9716, 77.5946', '').valid, false);
  assert.equal(validateManualCoordinates('NaN', 'Infinity').valid, false);

  // Fallback label for coordinates when reverse geocoding fails
  const fb = formatManualCoordinatesFallback(-15.5, 75.25);
  assert.ok(fb.name.includes('-15.5000'));
  assert.ok(fb.name.includes('75.2500'));
  assert.ok(fb.address.includes('Manually entered coordinates'));
});

test('searchAndRankPlaces prioritizes general geographic results and does not restrict or pollute results with chargers', () => {
  // Searching "Kanhangad, Kerala" with live OSM results returns Kanhangad and NOT unrelated Kochi malls
  const kanhangadOsm = [
    {
      id: 'osm_kanhangad',
      name: 'Kanhangad',
      locality: 'Kasaragod, Kerala',
      address: 'Kanhangad, Hosdurg, Kasaragod District, Kerala, 671315, India',
      category: 'City / Locality',
      latitude: 12.3069,
      longitude: 75.0911,
      source: 'OpenStreetMap'
    }
  ];
  const kanhangadResults = searchAndRankPlaces('Kanhangad, Kerala', kanhangadOsm);
  assert.equal(kanhangadResults.length, 1);
  assert.equal(kanhangadResults[0].name, 'Kanhangad');
  assert.equal(kanhangadResults[0].latitude, 12.3069);

  // Searching "Bengaluru" prioritizes the city of Bengaluru over static EV charging stations
  const blrOsm = [
    {
      id: 'osm_blr_city',
      name: 'Bengaluru',
      locality: 'Bengaluru Urban, Karnataka',
      address: 'Bengaluru, Bengaluru Urban, Karnataka, India',
      category: 'City / Locality',
      latitude: 12.9768,
      longitude: 77.5901,
      source: 'OpenStreetMap'
    }
  ];
  const blrResults = searchAndRankPlaces('Bengaluru', blrOsm);
  assert.equal(blrResults[0].id, 'osm_blr_city');
  assert.equal(
    blrResults.some(r => r.category.toLowerCase().includes('ev charging')),
    false
  );

  // Preserves distinct places with similar names in different locations
  const similarNamedPlaces = searchAndRankPlaces('MG Road', [
    {
      id: 'osm_mg_blr',
      name: 'MG Road',
      locality: 'Shivajinagar, Bengaluru, Karnataka',
      address: 'Mahatma Gandhi Road, Bengaluru, Karnataka 560001',
      category: 'Street / Highway',
      latitude: 12.9756,
      longitude: 77.6066,
      source: 'OpenStreetMap'
    },
    {
      id: 'osm_mg_kochi',
      name: 'MG Road',
      locality: 'Ernakulam, Kochi, Kerala',
      address: 'Mahatma Gandhi Road, Ernakulam, Kochi, Kerala 682016',
      category: 'Street / Highway',
      latitude: 9.9732,
      longitude: 76.2825,
      source: 'OpenStreetMap'
    }
  ]);
  assert.ok(similarNamedPlaces.some(p => p.id === 'osm_mg_blr'));
  assert.ok(similarNamedPlaces.some(p => p.id === 'osm_mg_kochi'));
});

test('Cockpit reference image hotspots are strictly non-overlapping and map to real routes', () => {
  assert.equal(COCKPIT_IMAGE_ASSET_PATH, '/assets/ghost-protocol-cockpit-clean.jpg');
  assert.deepEqual(COCKPIT_IMAGE_DIMENSIONS, { width: 1536, height: 864 });

  const allHotspots = [...COCKPIT_HOME_CARD_HOTSPOTS, COCKPIT_ALL_SYSTEM_CONTROLS_HOTSPOT];
  assert.equal(allHotspots.length, 5);
  assert.equal(areHotspotsNonOverlapping(allHotspots), true);

  assert.deepEqual(
    COCKPIT_HOME_CARD_HOTSPOTS.map(c => ({ label: c.label, subtitle: c.subtitle, routeId: c.routeId })),
    [
      { label: 'JET ENGINEER', subtitle: 'LEARN · FIX · MAINTAIN', routeId: 'jet_engineer' },
      { label: 'CHARGING', subtitle: 'FIND · PLAN · SHARE', routeId: 'charging' },
      { label: 'SQUADRON ASSIST', subtitle: 'COMMUNITY · SUPPORT · RIDE', routeId: 'emergency' },
      { label: 'MISSION MODE', subtitle: 'PLAN · TRACK · EXPLORE', routeId: 'mission' }
    ]
  );

  assert.equal(COCKPIT_ALL_SYSTEM_CONTROLS_HOTSPOT.label, 'ALL SYSTEM CONTROLS');
  assert.equal(COCKPIT_ALL_SYSTEM_CONTROLS_HOTSPOT.subtitle, 'Access all features');
  assert.ok(ALL_SYSTEM_CONTROLS_DIRECTORY.length >= 10);
});

test('Rotary navigation registry enforces role security (11 main pages including MISSION MODE & SQUADRON SHOWDOWN, 12 for admin) and uses MY GARAGE', () => {
  assert.equal(COCKPIT_ROTARY_STAGE_ASSET_PATH, '/assets/ghost-protocol-rotary-stage.jpg');
  assert.equal(COCKPIT_ROTARY_REFERENCE_ASSET_PATH, '/assets/ghost-protocol-rotary-reference.png');
  assert.deepEqual(COCKPIT_ROTARY_STAGE_DIMENSIONS, { width: 848, height: 1855 });

  // Visitor / unauthenticated user sees 11 main application pages including MISSION MODE & SQUADRON SHOWDOWN ("01 / 11")
  const visitorItems = getAuthorizedRotaryDestinations(null);
  assert.equal(visitorItems.length, 11);
  assert.deepEqual(
    visitorItems.map(i => i.label),
    [
      'JET ENGINEER',
      'CHARGING NETWORK',
      'SQUADRON ASSIST',
      'MISSION MODE',
      'PRIORITY ISSUES',
      'DISCUSSION',
      'MARKETPLACE',
      'MY GARAGE',
      'SERVICE INTEL & REVIEWS',
      'MODIFICATIONS',
      'SQUADRON SHOWDOWN'
    ]
  );

  // Confirm MISSION MODE and MY GARAGE are in the main rotary selector while nested sub-tabs remain inside their pages
  const rotaryLabels = ROTARY_NAVIGATION_REGISTRY.map(i => i.label);
  assert.equal(rotaryLabels.includes('ROUTE PLANNER'), false);
  assert.equal(rotaryLabels.includes('TRAIN DATABASE'), false);
  assert.equal(rotaryLabels.includes('MISSION MODE'), true);
  assert.equal(rotaryLabels.includes('MY GARAGE & CREDENTIALS'), false);
  assert.equal(rotaryLabels.includes('MY GARAGE'), true);

  const missionRotaryItem = visitorItems.find(i => i.routeId === 'mission');
  assert.ok(missionRotaryItem);
  assert.equal(missionRotaryItem.label, 'MISSION MODE');
  assert.deepEqual(missionRotaryItem.segmentLines, ['MISSION', 'MODE']);

  const garageRotaryItem = visitorItems.find(i => i.routeId === 'garage');
  assert.ok(garageRotaryItem);
  assert.equal(garageRotaryItem.label, 'MY GARAGE');
  assert.deepEqual(garageRotaryItem.segmentLines, ['MY GARAGE']);

  assert.equal(
    visitorItems.some(i => i.routeId === 'admin'),
    false
  );

  // Every item has empty subtitle and no descriptive text
  for (const item of ROTARY_NAVIGATION_REGISTRY) {
    assert.equal(item.subtitle, '');
    assert.deepEqual(item.segmentSubLines, ['']);
  }
  for (const dirItem of ALL_SYSTEM_CONTROLS_DIRECTORY) {
    assert.equal(dirItem.subtitle, '');
    assert.equal(dirItem.description, '');
  }
  const garageDirItem = ALL_SYSTEM_CONTROLS_DIRECTORY.find(i => i.id === 'dir_garage');
  assert.equal(garageDirItem?.label, 'MY GARAGE');
  const autoPilotDirItem = ALL_SYSTEM_CONTROLS_DIRECTORY.find(i => i.id === 'dir_route_planner');
  assert.equal(autoPilotDirItem?.label, 'AUTO PILOT');
  assert.equal(autoPilotDirItem?.chargingMode, 'autopilot');
  const showdownDirItem = ALL_SYSTEM_CONTROLS_DIRECTORY.find(i => i.id === 'dir_squadron_showdown');
  assert.ok(showdownDirItem, 'Expected SQUADRON SHOWDOWN option in ALL_SYSTEM_CONTROLS_DIRECTORY');
  assert.equal(showdownDirItem?.label, 'SQUADRON SHOWDOWN');
  assert.equal(showdownDirItem?.routeId, 'squadron-showdown');

  // Ordinary verified member also sees 11 destinations without ADMIN CENTRE
  const memberItems = getAuthorizedRotaryDestinations({
    email: 'pilot@example.com',
    role: 'verified'
  });
  assert.equal(memberItems.length, 11);
  assert.equal(
    memberItems.some(i => i.routeId === 'admin'),
    false
  );

  // Authorized administrator or owner sees 12 destinations including ADMIN CENTRE
  const adminItems = getAuthorizedRotaryDestinations({
    email: 'abinavthejas2001@gmail.com',
    role: 'owner'
  });
  assert.equal(adminItems.length, 12);
  assert.equal(adminItems[11].label, 'ADMIN CENTRE');
  assert.equal(adminItems[11].routeId, 'admin');

  // Selection counter formatting ("01 / 11" for standard users, "01 / 12" for admins)
  assert.equal(formatRotarySelectionCounter(0, 11), '01 / 11');
  assert.equal(formatRotarySelectionCounter(10, 11), '11 / 11');
  assert.equal(formatRotarySelectionCounter(11, 12), '12 / 12');
});

test('Rotary angular math, 0°/360° boundary handling, and magnetic snapping', () => {
  assert.equal(normalizeDegrees(0), 0);
  assert.equal(normalizeDegrees(360), 0);
  assert.equal(normalizeDegrees(-30), 330);
  assert.equal(normalizeDegrees(725), 5);

  // Shortest angular delta across 0°/360° boundary
  assert.equal(shortestAngularDelta(350, 10), 20);
  assert.equal(shortestAngularDelta(10, 350), -20);
  assert.equal(shortestAngularDelta(0, 180), 180);

  // Pointer angle relative to dial center (0° at top, clockwise positive)
  assert.equal(calculatePointerAngleDeg(100, 100, 100, 50), 0);
  assert.equal(calculatePointerAngleDeg(100, 100, 150, 100), 90);
  assert.equal(calculatePointerAngleDeg(100, 100, 100, 150), 180);
  assert.equal(calculatePointerAngleDeg(100, 100, 50, 100), 270);

  // 9-segment step (40°) & snapping
  const total = 9;
  const step = getSegmentStepDeg(total);
  assert.equal(step, 40);

  assert.equal(getNearestRotaryIndex(0, total), 0);
  assert.equal(getNearestRotaryIndex(-step, total), 1);
  assert.equal(getNearestRotaryIndex(-step * 1.4, total), 1);
  assert.equal(getNearestRotaryIndex(-step * 1.6, total), 2);
  assert.equal(getNearestRotaryIndex(step, total), 8); // 1 step clockwise selects index 8 (MODIFICATIONS)

  // Shortest continuous rotation from index 0 (0°) to index 8 (+40°) does not spin -320°
  const rotTo8 = getTargetWheelRotationForIndex(0, 8, total);
  assert.ok(Math.abs(rotTo8 - step) < 0.001);

  // And rotating from index 8 (+40°) back to index 0 returns to 0°
  const rotBackTo0 = getTargetWheelRotationForIndex(rotTo8, 0, total);
  assert.ok(Math.abs(rotBackTo0 - 0) < 0.001);

  // Deterministic inertial snap respects reducedMotion
  const snapReduced = computeInertialSnapIndex(-step * 0.2, -500, total, true);
  assert.equal(snapReduced.targetIndex, 0);

  const snapWithInertia = computeInertialSnapIndex(-step * 0.2, -300, total, false);
  assert.equal(snapWithInertia.targetIndex, 1);
});

test('Contribution page 3 options, strict Owner-only editing, animated emojis, and anonymous backer redaction', () => {
  // Confirm Contribution is NOT in the circular rotary dashboard
  const rotaryRouteIds = ROTARY_NAVIGATION_REGISTRY.map(r => r.routeId);
  assert.equal(rotaryRouteIds.includes('contribute'), false);

  // Strict Owner-only permission: visitors, regular members, and non-owner admins cannot edit payment modes
  assert.equal(canEditContributionPage(null), false);
  assert.equal(canEditContributionPage(undefined), false);
  assert.equal(canEditContributionPage({ id: 'u_pilot07', role: 'verified_member', isOwner: false }), false);
  assert.equal(canEditContributionPage({ id: 'u_subadmin', role: 'admin', isOwner: false }), false);
  assert.equal(
    canEditContributionPage({
      id: 'u_admin',
      email: 'abinavthejas2001@gmail.com',
      role: 'admin',
      isOwner: true
    }),
    true
  );

  // Confirm 3 contribution options: Chai (20 Rs ☕), Biryani (200 Rs 😋), Custom (We accept anything 😂)
  assert.equal(CONTRIBUTION_OPTIONS.length, 3);
  assert.equal(CONTRIBUTION_OPTIONS[0].id, 'chai');
  assert.equal(CONTRIBUTION_OPTIONS[0].label, 'Get us a chai');
  assert.equal(CONTRIBUTION_OPTIONS[0].fixedAmountInr, 20);
  assert.equal(CONTRIBUTION_OPTIONS[0].emoji, '☕');
  assert.equal(CONTRIBUTION_OPTIONS[1].id, 'biryani');
  assert.equal(CONTRIBUTION_OPTIONS[1].label, 'Sponsor us a biryani');
  assert.equal(CONTRIBUTION_OPTIONS[1].fixedAmountInr, 200);
  assert.equal(CONTRIBUTION_OPTIONS[1].emoji, '😋');
  assert.equal(CONTRIBUTION_OPTIONS[2].id, 'custom');
  assert.equal(CONTRIBUTION_OPTIONS[2].label, 'We accept anything');
  assert.equal(CONTRIBUTION_OPTIONS[2].subtitle, 'Custom amount');
  assert.equal(CONTRIBUTION_OPTIONS[2].fixedAmountInr, null);
  assert.equal(CONTRIBUTION_OPTIONS[2].emoji, '😂');

  // Default config has no personal name, email, or FUEL THE GHOST PROTOCOL MISSION boilerplate
  assert.equal(DEFAULT_CONTRIBUTION_CONFIG.headline, 'CONTRIBUTE');
  assert.equal(DEFAULT_CONTRIBUTION_CONFIG.creatorMessage.includes('Abinav'), false);
  assert.equal(DEFAULT_CONTRIBUTION_CONFIG.creatorMessage.includes('independently engineered'), false);

  // Sanitization scrubs legacy boilerplate and preserves custom UPI ID, QR scan code, and payment modes
  const scrubbed = sanitizeContributionConfig({
    headline: 'FUEL THE GHOST PROTOCOL MISSION',
    creatorMessage: 'GHOST PROTOCOL is independently engineered and maintained...',
    upiId: 'customrider@upi',
    customQrUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
    enableQrScan: true,
    enableUpiId: true,
    enablePaymentLink: true,
    customLimitInr: 75000
  });
  assert.equal(scrubbed.headline, 'CONTRIBUTE');
  assert.equal(scrubbed.creatorMessage, DEFAULT_CONTRIBUTION_CONFIG.creatorMessage);
  assert.equal(scrubbed.upiId, 'customrider@upi');
  assert.equal(scrubbed.customQrUrl, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==');
  assert.equal(scrubbed.enablePaymentLink, true);

  // UPI URI builder encodes payee and INR amount without personal name
  const upiUri = buildUpiPaymentUri({
    upiId: 'customrider@upi',
    amountInr: 200,
    note: 'Sponsor us a biryani'
  });
  assert.ok(upiUri.startsWith('upi://pay?'));
  assert.ok(upiUri.includes('pa=customrider%40upi'));
  assert.ok(upiUri.includes('am=200.00'));
  assert.ok(upiUri.includes('cu=INR'));

  // Contribution submission validation for Chai (20 Rs), Biryani (200 Rs), and Custom ("We accept anything 😂")
  assert.equal(validateContributionSubmission({ contributorName: '', amountInr: 20 }).valid, false);
  const chaiSub = validateContributionSubmission({
    contributorName: 'Vikram Sengupta',
    optionId: 'chai',
    note: 'Enjoy the chai!'
  });
  assert.equal(chaiSub.valid, true);
  assert.equal(chaiSub.value?.amountInr, 20);

  const biryaniSub = validateContributionSubmission({
    contributorName: 'Devika Nair',
    optionId: 'biryani',
    note: 'Enjoy the biryani!'
  });
  assert.equal(biryaniSub.valid, true);
  assert.equal(biryaniSub.value?.amountInr, 200);

  const customAnyAmount = validateContributionSubmission({
    contributorName: 'Arjun',
    optionId: 'custom',
    amountInr: 100000
  });
  assert.equal(customAnyAmount.valid, true);
  assert.equal(customAnyAmount.value?.amountInr, 100000);

  // Public wall redaction removes amountInr so amounts are strictly anonymous
  const redacted = redactContributionForPublicWall({
    id: 'c_1',
    contributorName: 'Vikram Sengupta',
    amountInr: 200,
    paymentMethod: 'UPI QR Scan',
    note: 'Awesome app!',
    createdAt: '2026-10-23T00:00:00Z'
  });
  assert.equal('amountInr' in redacted, false);
  assert.equal(redacted.contributorName, 'Vikram Sengupta');
  assert.equal(redacted.note, 'Awesome app!');
});

test('Discussion rename and Community Polls creation, voting, and tallying', () => {
  // Confirm rotary & directory label is DISCUSSION (not DISCUSSIONS & Q&A)
  const discRotary = ROTARY_NAVIGATION_REGISTRY.find(i => i.routeId === 'discussions');
  assert.ok(discRotary);
  assert.equal(discRotary.label, 'DISCUSSION');
  assert.deepEqual(discRotary.segmentLines, ['DISCUSSION']);

  const discDir = ALL_SYSTEM_CONTROLS_DIRECTORY.find(i => i.id === 'dir_discussions');
  assert.ok(discDir);
  assert.equal(discDir.label, 'DISCUSSION');

  // Validate poll creation edge cases
  assert.equal(validatePollCreation({ question: 'Hi', options: ['A', 'B'] }).valid, false);
  assert.equal(validatePollCreation({ question: 'Best tyre compound?', options: ['A'] }).valid, false);
  assert.equal(
    validatePollCreation({ question: 'Best tyre compound?', options: ['Metzeler', 'metzeler'] }).valid,
    false
  );

  const validPollInput = validatePollCreation({
    question: 'Which riding mode do you use most on city commutes?',
    category: 'Riding & Touring',
    options: ['Glide', 'Combat', 'Ballistic', ''],
    authorName: 'Vikram Sengupta',
    authorModel: 'F77 MACH 2'
  });
  assert.equal(validPollInput.valid, true);
  assert.deepEqual(validPollInput.value?.options, ['Glide', 'Combat', 'Ballistic']);

  // Voting and switching votes
  const samplePoll = {
    id: 'poll_test_1',
    authorId: 'u_pilot07',
    authorName: 'Vikram Sengupta',
    authorModel: 'F77 MACH 2',
    question: 'Which riding mode do you use most on city commutes?',
    category: 'Riding & Touring',
    options: [
      { id: 'opt_1', text: 'Glide', votes: ['u_1'] },
      { id: 'opt_2', text: 'Combat', votes: ['u_2', 'u_3'] },
      { id: 'opt_3', text: 'Ballistic', votes: [] }
    ],
    createdAt: '2026-10-23T00:00:00Z'
  };

  // Cast vote for opt_3 by voter u_4
  const afterVote1 = castPollVote(samplePoll, 'opt_3', 'u_4');
  const stats1 = calculatePollResults(afterVote1, 'u_4');
  assert.equal(stats1.totalVotes, 4);
  assert.equal(stats1.selectedOptionId, 'opt_3');
  assert.equal(stats1.options[0].percentage, 25); // 1/4
  assert.equal(stats1.options[1].percentage, 50); // 2/4
  assert.equal(stats1.options[2].percentage, 25); // 1/4

  // Switch vote from opt_3 to opt_2 by voter u_4 (no duplicate vote)
  const afterSwitch = castPollVote(afterVote1, 'opt_2', 'u_4');
  const stats2 = calculatePollResults(afterSwitch, 'u_4');
  assert.equal(stats2.totalVotes, 4);
  assert.equal(stats2.selectedOptionId, 'opt_2');
  assert.equal(stats2.options[1].voteCount, 3);
  assert.equal(stats2.options[1].percentage, 75);
  assert.equal(stats2.options[2].voteCount, 0);
});

test('Community Petitions validation, support toggling, and goal progress calculation', () => {
  assert.equal(validatePetitionCreation({ title: 'Hi', description: 'Too short' }).valid, false);
  assert.equal(
    validatePetitionCreation({ title: 'Valid petition title', description: 'Short' }).valid,
    false
  );

  const validPet = validatePetitionCreation({
    title: 'Deploy Supernova Fast Charger on NH 66',
    description: 'We need a 30kW DC fast charger midway between Mumbai and Goa.',
    category: 'Battery & Charging',
    targetGoal: 10,
    authorName: 'Vikram Sengupta',
    authorModel: 'F77 MACH 2'
  });
  assert.equal(validPet.valid, true);
  assert.equal(validPet.value?.targetGoal, 10);

  const samplePetition = {
    id: 'pet_test_1',
    authorId: 'u_pilot07',
    authorName: 'Vikram Sengupta',
    authorModel: 'F77 MACH 2',
    title: 'Deploy Supernova Fast Charger on NH 66',
    description: 'We need a 30kW DC fast charger midway between Mumbai and Goa.',
    category: 'Battery & Charging',
    targetGoal: 4,
    supporters: [
      {
        voterId: 'u_pilot07',
        supporterName: 'Vikram Sengupta',
        supporterModel: 'F77 MACH 2',
        supportedAt: '2026-10-23T00:00:00Z'
      }
    ],
    createdAt: '2026-10-23T00:00:00Z'
  };

  // Support petition as u_2
  const afterSupport = togglePetitionSupport(samplePetition, {
    voterId: 'u_2',
    supporterName: 'Devika Nair',
    supporterModel: 'F77 Original'
  });
  const prog1 = calculatePetitionProgress(afterSupport, 'u_2');
  assert.equal(prog1.supporterCount, 2);
  assert.equal(prog1.progressPercent, 50);
  assert.equal(prog1.isSupported, true);
  assert.equal(prog1.goalReached, false);

  // Toggling again by u_2 removes their support cleanly
  const afterUnsupport = togglePetitionSupport(afterSupport, {
    voterId: 'u_2',
    supporterName: 'Devika Nair'
  });
  const prog2 = calculatePetitionProgress(afterUnsupport, 'u_2');
  assert.equal(prog2.supporterCount, 1);
  assert.equal(prog2.progressPercent, 25);
  assert.equal(prog2.isSupported, false);
});

test('Avionics page and toggle transition direction and variants compute deterministic motion states', () => {
  assert.ok(PAGE_TRANSITION_ORDER.includes('dashboard'));
  assert.ok(PAGE_TRANSITION_ORDER.includes('charging'));
  assert.ok(PAGE_TRANSITION_ORDER.includes('discussions'));
  assert.ok(PAGE_TRANSITION_ORDER.includes('contribute'));

  // Forward vs backward direction across pages
  assert.equal(computeTransitionDirection('dashboard', 'charging'), 1);
  assert.equal(computeTransitionDirection('charging', 'dashboard'), -1);
  assert.equal(computeTransitionDirection('charging', 'charging'), 0);
  assert.equal(computeTransitionDirection(null, 'dashboard'), 0);

  // Forward vs backward direction across internal toggles
  const chargingModes = ['chargers', 'route_planner'] as const;
  assert.equal(computeTransitionDirection('chargers', 'route_planner', chargingModes), 1);
  assert.equal(computeTransitionDirection('route_planner', 'chargers', chargingModes), -1);

  const discussionSections = ['threads', 'polls', 'petitions'] as const;
  assert.equal(computeTransitionDirection('threads', 'polls', discussionSections), 1);
  assert.equal(computeTransitionDirection('polls', 'petitions', discussionSections), 1);
  assert.equal(computeTransitionDirection('petitions', 'threads', discussionSections), -1);

  // Page transition variants (forward vs backward)
  const forwardPage = getAvionicsTransitionVariants(1, false, 'page');
  assert.equal(forwardPage.direction, 1);
  assert.equal(forwardPage.initial.x, 18);
  assert.equal(forwardPage.exit.x, -18);
  assert.equal(forwardPage.animate.x, 0);
  assert.equal(forwardPage.animate.opacity, 1);
  assert.equal(forwardPage.initial.filter, 'blur(0px)');

  const backwardToggle = getAvionicsTransitionVariants(-1, false, 'toggle');
  assert.equal(backwardToggle.direction, -1);
  assert.equal(backwardToggle.initial.x, -12);
  assert.equal(backwardToggle.exit.x, 12);
  assert.equal(backwardToggle.durationSec, 0.22);
  assert.equal(backwardToggle.initial.filter, 'blur(0px)');

  // Reduced motion eliminates spatial shift and blur
  const reduced = getAvionicsTransitionVariants(1, true, 'page');
  assert.equal(reduced.direction, 0);
  assert.equal(reduced.initial.x, 0);
  assert.equal(reduced.exit.x, 0);
  assert.equal(reduced.initial.filter, 'blur(0px)');
  assert.equal(reduced.durationSec, 0.12);
});

test('Offline Charging Network & Auto Pilot helpers: route cache keys, corridor geometry, tile URLs, and tactical radar tile fallback', () => {
  const key1 = buildRouteCacheKey(12.9716, 77.5946, 12.3052, 76.6552);
  assert.equal(key1, 'route_12.972_77.595_to_12.305_76.655');

  // Offline highway corridor geometry generates multi-segment polyline and realistic road distance/duration
  const origin = { latitude: 12.9716, longitude: 77.5946 };
  const dest = { latitude: 12.3052, longitude: 76.6552 };
  const midCharger = { latitude: 12.5218, longitude: 76.8951 }; // Mandya corridor station

  const corridor = generateOfflineCorridorGeometry(origin, dest, [midCharger]);
  assert.equal(corridor.source, 'offline-highway-corridor');
  assert.ok(corridor.polyline.length >= 6);
  assert.ok(corridor.distanceKm > 120 && corridor.distanceKm < 200);
  assert.ok(corridor.durationMin > 100 && corridor.durationMin < 240);
  assert.equal(corridor.polyline[0][0], Number(origin.latitude.toFixed(5)));
  assert.equal(corridor.polyline[0][1], Number(origin.longitude.toFixed(5)));
  assert.equal(
    corridor.polyline[corridor.polyline.length - 1][0],
    Number(dest.latitude.toFixed(5))
  );
  assert.equal(
    corridor.polyline[corridor.polyline.length - 1][1],
    Number(dest.longitude.toFixed(5))
  );

  // Slippy map tile XY math and offline region tile URL pre-warming
  const tile = latLonToTileXY(12.9716, 77.5946, 6);
  assert.ok(tile.x >= 0 && tile.x < 64);
  assert.ok(tile.y >= 0 && tile.y < 64);
  assert.equal(tile.z, 6);

  const tileUrls = computeOfflineTileUrlsForRegions();
  assert.ok(tileUrls.length >= 20 && tileUrls.length <= 200);
  assert.ok(tileUrls.every(u => u.startsWith('https://tile.openstreetmap.org/')));

  // Tactical dark radar SVG data URL fallback for offline map tiles
  const svgDataUrl = createTacticalOfflineTileDataUrl(6, tile.x, tile.y);
  assert.ok(svgDataUrl.startsWith('data:image/svg+xml;charset=utf-8,'));
  assert.ok(decodeURIComponent(svgDataUrl).includes('OFFLINE GRID Z6'));
});

test('Marketplace Rentals, Owner Contact, and Live Auctions: cost calculation, bid validation, and winner selection', () => {
  // 1. Listing type resolution
  assert.equal(resolveMarketplaceListingType({ listingType: 'rent' }), 'rent');
  assert.equal(resolveMarketplaceListingType({ listingType: 'auction' }), 'auction');
  assert.equal(resolveMarketplaceListingType({ category: 'rentals' }), 'rent');
  assert.equal(resolveMarketplaceListingType({ category: 'parts' }), 'buy');

  // 2. Owner Phone & Email contact resolution across Buy, Rent, and Auction
  const contact = resolveMarketplaceOwnerContact({
    title: 'Boost Charger 3.0kW',
    sellerName: 'Vikram Sengupta',
    contactPhone: '+91 98450 22334',
    contactEmail: 'vikram@ultraviolette-squadron.in'
  });
  assert.equal(contact.phone, '+91 98450 22334');
  assert.equal(contact.email, 'vikram@ultraviolette-squadron.in');
  assert.ok(contact.telHref.startsWith('tel:+919845022334'));
  assert.ok(contact.mailtoHref.startsWith('mailto:vikram@ultraviolette-squadron.in?subject='));

  // 3. Rental booking cost calculation
  const rentalCalc = calculateRentalBookingCost({
    costPerDay: 850,
    securityDeposit: 5000,
    days: 3
  });
  assert.equal(rentalCalc.valid, true);
  assert.equal(rentalCalc.days, 3);
  assert.equal(rentalCalc.rentalSubtotal, 2550);
  assert.equal(rentalCalc.securityDeposit, 5000);
  assert.equal(rentalCalc.totalPayable, 7550);

  // 4. Live Auction bidding & Owner Winner Selection
  const sampleAuction = {
    id: 'mp_auc_test',
    listingType: 'auction' as const,
    title: 'F77 Space Edition Carbon Shroud',
    startingBid: 18000,
    currentBid: 21500,
    minBidIncrement: 500,
    auctionStatus: 'active' as const,
    bids: [
      {
        id: 'bid_1',
        bidderId: 'u_1',
        bidderName: 'Rohan Kulkarni',
        bidderModel: 'F77 MACH 2',
        amount: 19500,
        createdAt: '2026-10-25T10:00:00Z'
      },
      {
        id: 'bid_2',
        bidderId: 'u_2',
        bidderName: 'Devika Nair',
        bidderModel: 'F77 Original',
        amount: 21500,
        createdAt: '2026-10-26T10:00:00Z'
      }
    ]
  };

  const summaryBefore = getAuctionBidSummary(sampleAuction);
  assert.equal(summaryBefore.currentHighAmount, 21500);
  assert.equal(summaryBefore.minimumNextBid, 22000);
  assert.equal(summaryBefore.bidCount, 2);

  // Reject bid below minimum increment
  const lowBid = validateAndPlaceAuctionBid(sampleAuction, {
    bidderId: 'u_3',
    bidderName: 'Karthik Rao',
    amount: 21800
  });
  assert.equal(lowBid.valid, false);

  // Accept valid higher bid
  const validBid = validateAndPlaceAuctionBid(sampleAuction, {
    bidderId: 'u_3',
    bidderName: 'Karthik Rao',
    bidderModel: 'F77 Recon',
    amount: 23000,
    note: 'Immediate pickup'
  });
  assert.equal(validBid.valid, true);
  assert.equal(validBid.updatedItem?.currentBid, 23000);
  assert.equal(getSortedAuctionBids(validBid.updatedItem)[0].bidderName, 'Karthik Rao');

  // Owner chooses specific winner (or highest bid)
  const awardHighest = selectAuctionWinner(validBid.updatedItem!);
  assert.equal(awardHighest.valid, true);
  assert.equal(awardHighest.winningBid?.bidderName, 'Karthik Rao');
  assert.equal(awardHighest.updatedItem?.auctionStatus, 'awarded');
  assert.equal(awardHighest.updatedItem?.winningBidAmount, 23000);

  // Also test SVG illustration preset generator
  const presetSvg = createMarketplacePresetIllustration('carbon_wheels');
  assert.ok(presetSvg.startsWith('data:image/svg+xml;charset=utf-8,'));
});

test('Community Provided Chargers resolve submitter name and phone number with tel link', () => {
  // 1. Seed community charger submitted by Devika Nair (u_phantom)
  const devikaCharger = resolveChargerSubmitterInfo({
    chargerSource: 'Community Provided Charger',
    isCommunityReported: true,
    submittedByUserId: 'u_phantom',
    submittedByRole: 'user',
    reportedBy: 'Devika Nair (Phantom)'
  });
  assert.equal(devikaCharger.isCommunityProvided, true);
  assert.equal(devikaCharger.isUserSubmitted, true);
  assert.equal(devikaCharger.submitterName, 'Devika Nair (Phantom)');
  assert.equal(devikaCharger.submitterPhone, '+91 97410 88231');
  assert.equal(devikaCharger.telHref, 'tel:+919741088231');

  // 2. Custom user-submitted community charger with explicit submittedByPhone
  const customCharger = resolveChargerSubmitterInfo({
    chargerSource: 'Community Provided Charger',
    isCommunityReported: true,
    submittedByUserId: 'u_custom_rider',
    submittedByRole: 'user',
    reportedBy: 'Arjun Menon (Falcon)',
    submittedByPhone: '+91 98451 77889'
  });
  assert.equal(customCharger.isCommunityProvided, true);
  assert.equal(customCharger.submitterName, 'Arjun Menon (Falcon)');
  assert.equal(customCharger.submitterPhone, '+91 98451 77889');
  assert.equal(customCharger.telHref, 'tel:+919845177889');

  // 3. Public chargers (Supernova and 3rd Party Station) must NOT expose any phone number
  const supernovaCharger = resolveChargerSubmitterInfo({
    chargerSource: 'Supernova',
    isSupernova: true,
    reportedBy: 'Ultraviolette Hangar',
    submittedByPhone: '+91 98450 11099'
  });
  assert.equal(supernovaCharger.isCommunityProvided, false);
  assert.equal(supernovaCharger.submitterPhone, '');
  assert.equal(supernovaCharger.telHref, '');

  const thirdPartyCharger = resolveChargerSubmitterInfo({
    chargerSource: '3rd Party Station',
    isCommunityReported: true,
    submittedByUserId: 'u_pilot07',
    reportedBy: 'Vikram Sengupta (Raptor-07)',
    submittedByPhone: '+91 98860 22345'
  });
  assert.equal(thirdPartyCharger.isCommunityProvided, false);
  assert.equal(thirdPartyCharger.submitterPhone, '');
  assert.equal(thirdPartyCharger.telHref, '');
});

test('Community Provided Charger pricing, availability time, and reservation system workflows', () => {
  // 1. Free Community Charger resolution
  const freeTerms = resolveCommunityChargerTerms({
    chargerSource: 'Community Provided Charger',
    pricingType: 'Free',
    availabilityStartTime: '07:00',
    availabilityEndTime: '21:30',
    availabilityDays: 'Daily'
  });
  assert.equal(freeTerms.isCommunityProvided, true);
  assert.equal(freeTerms.pricingType, 'Free');
  assert.equal(freeTerms.chargingCostAmount, 0);
  assert.equal(freeTerms.formattedPricingBadge, 'FREE CHARGING');
  assert.equal(freeTerms.availabilityTimeText, '07:00 – 21:30 (Daily)');
  assert.equal(freeTerms.requiresReservation, true);

  // 2. Charged (Paid) Community Charger resolution & cost calculation
  const chargedStation = {
    id: 'cs_comm_test',
    name: 'Koramangala Rider Hangar Plug',
    chargerSource: 'Community Provided Charger',
    isCommunityReported: true,
    submittedByUserId: 'u_phantom',
    reportedBy: 'Devika Nair (Phantom)',
    submittedByPhone: '+91 97410 88231',
    powerOutputKw: 3.3,
    pricingType: 'Charged' as const,
    chargingCostAmount: 15,
    chargingCostUnit: 'per kWh' as const,
    availabilityStartTime: '08:00',
    availabilityEndTime: '20:00',
    availabilityDays: 'Daily',
    requiresReservation: true,
    reservations: []
  };

  const chargedTerms = resolveCommunityChargerTerms(chargedStation);
  assert.equal(chargedTerms.pricingType, 'Charged');
  assert.equal(chargedTerms.chargingCostAmount, 15);
  assert.equal(chargedTerms.chargingCostUnit, 'per kWh');
  assert.equal(chargedTerms.formattedPricingBadge, 'CHARGED • ₹15 per kWh');
  assert.equal(chargedTerms.availabilityTimeText, '08:00 – 20:00 (Daily)');

  // Cost calculation for 120 minutes (2 hours) @ 3.3 kW = 6.6 kWh * ₹15 = ₹99
  const costEst = calculateChargerReservationCost({
    pricingType: 'Charged',
    chargingCostAmount: 15,
    chargingCostUnit: 'per kWh',
    durationMinutes: 120,
    powerOutputKw: 3.3
  });
  assert.equal(costEst.estimatedKwh, 6.6);
  assert.equal(costEst.estimatedCost, 99);

  // 3. Reject reservation outside availability window (e.g. 19:00 + 120 mins = 21:00 when end is 20:00)
  const outsideWindow = validateAndCreateChargerReservation(chargedStation, {
    riderUserId: 'u_pilot07',
    riderName: 'Vikram Sengupta',
    riderPhone: '+91 98860 22345',
    riderBikeModel: 'F77 MACH 2',
    reservationDate: '2026-11-05',
    startTime: '19:00',
    durationMinutes: 120
  });
  assert.equal(outsideWindow.valid, false);
  assert.ok(outsideWindow.error?.includes('08:00'));

  // 4. Create valid reservation within window
  const validBooking = validateAndCreateChargerReservation(chargedStation, {
    riderUserId: 'u_pilot07',
    riderName: 'Vikram Sengupta',
    riderPhone: '+91 98860 22345',
    riderBikeModel: 'F77 MACH 2',
    reservationDate: '2026-11-05',
    startTime: '10:00',
    durationMinutes: 120,
    vehicleNotes: 'Arriving from Hosur Road'
  });
  assert.equal(validBooking.valid, true);
  assert.equal(validBooking.reservation?.status, 'Requested');
  assert.equal(validBooking.reservation?.endTime, '12:00');
  assert.equal(validBooking.reservation?.estimatedCost, 99);
  assert.equal(validBooking.reservation?.ownerName, 'Devika Nair (Phantom)');
  assert.equal(validBooking.reservation?.ownerPhone, '+91 97410 88231');

  // 5. Reject overlapping time slot on the same date
  const stationWithOneBooking = {
    ...chargedStation,
    reservations: [validBooking.reservation!]
  };
  const overlappingBooking = validateAndCreateChargerReservation(stationWithOneBooking, {
    riderUserId: 'u_other',
    riderName: 'Arjun Menon',
    riderPhone: '+91 98451 77889',
    reservationDate: '2026-11-05',
    startTime: '11:00',
    durationMinutes: 90
  });
  assert.equal(overlappingBooking.valid, false);
  assert.ok(overlappingBooking.error?.includes('overlaps'));

  // 6. Owner approves the reservation
  const permissions = canManageChargerReservation(stationWithOneBooking, validBooking.reservation!, {
    id: 'u_phantom',
    role: 'verified_member'
  });
  assert.equal(permissions.isChargerOwner, true);
  assert.equal(permissions.canApproveOrReject, true);

  const approvedResult = updateChargerReservationStatus(
    stationWithOneBooking,
    validBooking.reservation!.id,
    'Approved',
    { id: 'u_phantom', role: 'verified_member', fullName: 'Devika Nair (Phantom)' },
    'Gate security notified, plug ready.'
  );
  assert.equal(approvedResult.valid, true);
  assert.equal(approvedResult.reservation?.status, 'Approved');
  assert.equal(approvedResult.reservation?.ownerResponseNote, 'Gate security notified, plug ready.');

  // 7. Build charger owner reservation notification
  const ownerNotif = buildChargerReservationOwnerNotification(
    stationWithOneBooking,
    validBooking.reservation!,
    '2026-11-05T09:00:00.000Z'
  );
  assert.equal(ownerNotif.userId, 'u_phantom');
  assert.equal(ownerNotif.ownerName, 'Devika Nair (Phantom)');
  assert.equal(ownerNotif.ownerPhone, '+91 97410 88231');
  assert.equal(ownerNotif.reservationId, validBooking.reservation!.id);
  assert.ok(ownerNotif.title.includes('Koramangala Rider Hangar Plug'));
  assert.ok(ownerNotif.message.includes('Vikram Sengupta'));
  assert.ok(ownerNotif.message.includes('2026-11-05'));
  assert.ok(ownerNotif.message.includes('from 10:00 to 12:00'));
});

test('canPermanentlyRemoveUser and permanentlyRemoveUserRecord allow Admins and Owner to permanently delete users while protecting Owner and self', () => {
  const owner = {
    id: 'u_admin',
    email: 'abinavthejas2001@gmail.com',
    role: 'admin',
    isOwner: true,
    fullName: 'Abinav Thejas K'
  };
  const appointedAdmin = {
    id: 'u_mod_1',
    email: 'moderator@ultraviolette-squadron.in',
    role: 'admin',
    isOwner: false,
    fullName: 'Squadron Moderator'
  };
  const anotherAdmin = {
    id: 'u_mod_2',
    email: 'mod2@ultraviolette-squadron.in',
    role: 'admin',
    isOwner: false,
    fullName: 'Second Moderator'
  };
  const verifiedPilot = {
    id: 'u_pilot07',
    email: 'vikram@example.com',
    role: 'verified_member',
    isOwner: false,
    fullName: 'Vikram Sengupta'
  };
  const pendingPilot = {
    id: 'u_pending_99',
    email: 'newbie@example.com',
    role: 'guest',
    isOwner: false,
    fullName: 'New Applicant'
  };

  // 1. Website Owner can permanently remove regular members, pending users, and appointed admins
  assert.equal(canPermanentlyRemoveUser(owner, verifiedPilot).allowed, true);
  assert.equal(canPermanentlyRemoveUser(owner, pendingPilot).allowed, true);
  assert.equal(canPermanentlyRemoveUser(owner, appointedAdmin).allowed, true);

  // 2. Appointed Admin can permanently remove regular verified/pending/suspended users
  assert.equal(canPermanentlyRemoveUser(appointedAdmin, verifiedPilot).allowed, true);
  assert.equal(canPermanentlyRemoveUser(appointedAdmin, pendingPilot).allowed, true);

  // 3. Appointed Admin CANNOT permanently remove the Website Owner or another Admin
  assert.equal(canPermanentlyRemoveUser(appointedAdmin, owner).allowed, false);
  assert.equal(canPermanentlyRemoveUser(appointedAdmin, anotherAdmin).allowed, false);

  // 4. Nobody can permanently remove their own account (including Owner or Admin)
  assert.equal(canPermanentlyRemoveUser(owner, owner).allowed, false);
  assert.equal(canPermanentlyRemoveUser(appointedAdmin, appointedAdmin).allowed, false);

  // 5. Non-admin members and unauthenticated callers cannot permanently remove anyone
  assert.equal(canPermanentlyRemoveUser(verifiedPilot, pendingPilot).allowed, false);
  assert.equal(canPermanentlyRemoveUser(null, pendingPilot).allowed, false);

  // 6. permanentlyRemoveUserRecord removes target user and returns remaining users
  const roster = [owner, appointedAdmin, verifiedPilot, pendingPilot];
  const adminDeletesMember = permanentlyRemoveUserRecord(roster, 'u_pending_99', appointedAdmin);
  assert.equal(adminDeletesMember.valid, true);
  assert.equal(adminDeletesMember.removedUser?.id, 'u_pending_99');
  assert.equal(adminDeletesMember.remainingUsers?.length, 3);
  assert.equal(adminDeletesMember.remainingUsers?.some(u => u.id === 'u_pending_99'), false);

  // 7. Rejects invalid removal attempts
  const adminTriesDeleteOwner = permanentlyRemoveUserRecord(roster, 'u_admin', appointedAdmin);
  assert.equal(adminTriesDeleteOwner.valid, false);
  assert.ok(adminTriesDeleteOwner.error?.includes('Owner'));
});

test('Mission Mode: joinSortieRoster, leaveOrBackOffSortieRoster, and validateVisitedDestinationSubmission', () => {
  const sampleRide = {
    id: 'ride_test_01',
    name: 'Nandi Hills Dawn Run',
    status: 'Full',
    maxRiders: 1,
    participants: [
      {
        id: 'rp_1',
        userId: 'u_admin',
        displayName: 'Abinav Thejas K',
        motorcycleModel: 'F77 MACH 2',
        status: 'Registered'
      }
    ]
  };

  // 1. Any user can join a sortie whenever required, even if previously Full
  const joinRes = joinSortieRoster(sampleRide, {
    userId: 'u_pilot07',
    displayName: 'Vikram Sengupta',
    motorcycleModel: 'F77 Recon',
    startingPoint: 'Indiranagar Hangar',
    shareStartingPoint: true,
    notes: 'Joining with fast charger adapter'
  });
  assert.equal(joinRes.valid, true);
  assert.equal(joinRes.updatedRide?.participants.length, 2);
  assert.ok((joinRes.updatedRide?.maxRiders || 0) >= 2);
  assert.equal(joinRes.participant?.displayName, 'Vikram Sengupta');

  // 2. Duplicate join by the same user is prevented
  const dupJoin = joinSortieRoster(joinRes.updatedRide, {
    userId: 'u_pilot07',
    displayName: 'Vikram Sengupta'
  });
  assert.equal(dupJoin.valid, false);
  assert.ok(dupJoin.error?.includes('already joined'));

  // 3. Guest/visitor rider can also join by entering their name
  const guestJoin = joinSortieRoster(joinRes.updatedRide, {
    displayName: 'Rohan Guest Rider',
    motorcycleModel: 'F77 Original',
    startingPoint: 'Hebbal Flyover'
  });
  assert.equal(guestJoin.valid, true);
  assert.equal(guestJoin.updatedRide?.participants.length, 3);

  // 4. Joined user can cancel / back off from the ride anytime
  const leaveRes = leaveOrBackOffSortieRoster(guestJoin.updatedRide, {
    userId: 'u_pilot07',
    reason: 'Caught up with work, cannot make it this Sunday'
  });
  assert.equal(leaveRes.valid, true);
  assert.equal(leaveRes.removedParticipant?.userId, 'u_pilot07');
  assert.equal(leaveRes.updatedRide?.participants.length, 2);
  assert.equal(
    leaveRes.updatedRide?.participants.some((p: any) => p.userId === 'u_pilot07'),
    false
  );

  // 5. Guest rider can also cancel / back off by displayName or participantId
  const guestLeave = leaveOrBackOffSortieRoster(leaveRes.updatedRide, {
    displayName: 'Rohan Guest Rider'
  });
  assert.equal(guestLeave.valid, true);
  assert.equal(guestLeave.updatedRide?.participants.length, 1);

  // 6. Visited Destination validation & seed records
  assert.equal(DEFAULT_VISITED_DESTINATIONS.length, 3);
  const presetSvg = createDestinationPresetIllustration('coastal_highway', 'Gokarna Beach Run');
  assert.ok(presetSvg.startsWith('data:image/svg+xml;charset=utf-8,'));

  const validDest = validateVisitedDestinationSubmission({
    title: 'Gokarna Cliffside & Murudeshwar Coastal Run',
    startingPoint: 'Bengaluru (Yeshwanthpur)',
    totalDistanceKm: 485,
    chargingOptionsOnWay: 'UV Supernova at Tumakuru & Hubballi + 15A resort plug at Gokarna',
    chargerTypesUsed: ['UV Supernova', '15A 3-Pin Socket'],
    locationMapUrl: 'Gokarna Kudle Beach Viewpoint Karnataka',
    presetTheme: 'coastal_highway',
    riderTips: 'Start at 5 AM to cross Chitradurga windmills before noon.'
  });
  assert.equal(validDest.valid, true);
  assert.equal(validDest.record?.totalDistanceKm, 485);
  assert.ok(validDest.record?.locationMapUrl.startsWith('https://maps.google.com/maps'));
  assert.ok((validDest.record?.photos.length || 0) >= 1);

  // Rejects missing charging options or invalid distance
  const invalidDest = validateVisitedDestinationSubmission({
    title: 'Short Test',
    totalDistanceKm: 120,
    chargingOptionsOnWay: '',
    locationMapUrl: 'https://maps.google.com/?q=Mysuru'
  });
  assert.equal(invalidDest.valid, false);
});

test('Mission Mode: buildGoogleMapsUrl and buildMasterRouteGoogleMapsUrl format coordinates and stops into valid GMaps URLs', async () => {
  const {
    buildGoogleMapsUrl,
    buildMasterRouteGoogleMapsUrl,
    extractCoordinatesFromGoogleMapsUrl,
    resolveTrueWaypointCoordinates
  } = await import('./rules.ts');
  const { INDIA_TOWN_PLACE_SUGGESTIONS } = await import('./indiaLocations.ts');

  // Single waypoint coordinate URL
  const gmapsCoord = buildGoogleMapsUrl(13.2085, 77.7082, 'Devanahalli Regroup');
  assert.ok(gmapsCoord.includes('13.208500,77.708200'));

  // Master multi-stop route linking origin, intermediate stops, charging hubs, and destination
  const masterRoute = buildMasterRouteGoogleMapsUrl({
    meetingPoint: {
      name: 'Hebbal Flyover',
      lat: 13.0358,
      lng: 77.5970
    },
    destination: {
      name: 'Nandi Hills Summit',
      lat: 13.3702,
      lng: 77.6835
    },
    stops: [
      {
        name: 'Devanahalli Toll Plaza',
        lat: 13.2085,
        lng: 77.7082
      },
      {
        name: 'Indian Paratha Company',
        lat: 13.2980,
        lng: 77.7120
      }
    ],
    chargingStops: [
      {
        locationName: 'Shell Highway Fast Hub',
        lat: 13.2200,
        lng: 77.7100
      }
    ]
  });

  assert.ok(masterRoute.includes('saddr=13.035800%2C77.597000'));
  assert.ok(masterRoute.includes('daddr=13.370200%2C77.683500'));

  // Extract coordinates from Google Maps links
  const parsedSearchUrl = extractCoordinatesFromGoogleMapsUrl(
    'https://www.google.com/maps/search/?api=1&query=13.132800,78.171500'
  );
  assert.equal(parsedSearchUrl?.latitude, 13.1328);
  assert.equal(parsedSearchUrl?.longitude, 78.1715);

  const parsedAtUrl = extractCoordinatesFromGoogleMapsUrl(
    'https://www.google.com/maps/place/Kolar/@13.1362,78.1291,14z/data=!3d13.1362!4d78.1291'
  );
  assert.equal(parsedAtUrl?.latitude, 13.1362);
  assert.equal(parsedAtUrl?.longitude, 78.1291);

  // Resolve true coordinates for Kolar, CCD Kolar, Bengaluru Hangar, Hoskote without shifting to Nandi Hills
  const kolarCoords = resolveTrueWaypointCoordinates(
    { name: 'Kolar' },
    INDIA_TOWN_PLACE_SUGGESTIONS
  );
  assert.ok(kolarCoords);
  assert.ok(Math.abs(kolarCoords.latitude - 13.1362) < 0.05);
  assert.ok(Math.abs(kolarCoords.longitude - 78.1291) < 0.06);

  const ccdKolarCoords = resolveTrueWaypointCoordinates(
    { name: 'Café Coffee Day (CCD) — Kolar NH 75 Bypass' },
    INDIA_TOWN_PLACE_SUGGESTIONS
  );
  assert.equal(ccdKolarCoords?.latitude, 13.1328);
  assert.equal(ccdKolarCoords?.longitude, 78.1715);

  // Guard against stale Nandi Hills default coordinates (13.3702, 77.6835) when destination is Kolar
  const staleDefaultGuarded = resolveTrueWaypointCoordinates(
    { name: 'Kolar', lat: 13.3702, lng: 77.6835 },
    INDIA_TOWN_PLACE_SUGGESTIONS
  );
  assert.ok(staleDefaultGuarded);
  assert.ok(Math.abs(staleDefaultGuarded.latitude - 13.1362) < 0.05);
  assert.ok(Math.abs(staleDefaultGuarded.longitude - 78.1291) < 0.06);
});

test('X47 Priority Issues: all 17 X47 issues are present and ordered prioritywise (Critical -> High -> Moderate -> Low)', () => {
  assert.equal(X47_PRIORITY_ISSUES_SEED.length, 17);
  assert.ok(X47_PRIORITY_ISSUES_SEED.every(p => p.motorcycleModel === 'X47'));

  const critical = X47_PRIORITY_ISSUES_SEED.filter(p => getSeverityRank(p.severity) === 1);
  const high = X47_PRIORITY_ISSUES_SEED.filter(p => getSeverityRank(p.severity) === 2);
  const moderate = X47_PRIORITY_ISSUES_SEED.filter(p => getSeverityRank(p.severity) === 3);
  const low = X47_PRIORITY_ISSUES_SEED.filter(p => getSeverityRank(p.severity) === 4);

  assert.equal(critical.length, 2);
  assert.equal(high.length, 6);
  assert.equal(moderate.length, 4);
  assert.equal(low.length, 5);

  const shuffled = [...X47_PRIORITY_ISSUES_SEED].reverse();
  const sorted = sortProblemsBySeverity(shuffled);
  assert.deepEqual(
    sorted.map(p => p.id),
    X47_PRIORITY_ISSUES_SEED.map(p => p.id)
  );
});

test('F77 Priority Issues: all 18 F77 issues are present and ordered prioritywise (High 1-9 -> Medium 10-13 -> Low 14-18)', () => {
  assert.equal(F77_PRIORITY_ISSUES_SEED.length, 18);
  assert.ok(F77_PRIORITY_ISSUES_SEED.every(p => p.motorcycleModel === 'F77'));

  const high = F77_PRIORITY_ISSUES_SEED.filter(p => getSeverityRank(p.severity) === 2);
  const moderate = F77_PRIORITY_ISSUES_SEED.filter(p => getSeverityRank(p.severity) === 3);
  const low = F77_PRIORITY_ISSUES_SEED.filter(p => getSeverityRank(p.severity) === 4);

  assert.equal(high.length, 9);
  assert.equal(moderate.length, 4);
  assert.equal(low.length, 5);

  const shuffled = [...F77_PRIORITY_ISSUES_SEED].reverse();
  const sorted = sortProblemsBySeverity(shuffled);
  assert.deepEqual(
    sorted.map(p => p.id),
    F77_PRIORITY_ISSUES_SEED.map(p => p.id)
  );
});

test('Google Maps Android WebView protection: sanitizeGoogleMapsUrl and builders prevent net::ERR_UNKNOWN_URL_SCHEME', () => {
  // 1. buildChargerNavigationUrl returns clean https://maps.google.com/maps?daddr= directions URL
  const chargerNav = buildChargerNavigationUrl(
    { latitude: 12.971891, longitude: 77.641151, name: 'Ultraviolette Hangar' },
    { latitude: 12.9352, longitude: 77.6245 }
  );
  assert.ok(chargerNav.startsWith('https://maps.google.com/maps?'));
  assert.ok(!chargerNav.includes('api=1'));
  assert.ok(chargerNav.includes('daddr=12.971891,77.641151'));
  assert.ok(chargerNav.includes('saddr=12.935200,77.624500'));

  // 2. intent:// URL is sanitized to clean https://maps.google.com/maps? format
  const intentWithFallback =
    'intent://www.google.com/maps/search/?api=1&query=12.934900,79.146900&entry=ml&utm_campaign=ml-ardl-wv#Intent;scheme=https;package=com.google.android.apps.maps;end;';
  const sanitizedIntent = sanitizeGoogleMapsUrl(intentWithFallback);
  assert.ok(sanitizedIntent.startsWith('https://maps.google.com/maps?'));
  assert.ok(!sanitizedIntent.includes('intent://'));
  assert.ok(!sanitizedIntent.includes('api=1'));

  // 3. google.navigation: scheme converts to https://maps.google.com/maps?
  const googleNavUri = 'google.navigation:q=12.971891,77.641151&mode=d';
  const sanitizedGoogleNav = sanitizeGoogleMapsUrl(googleNavUri);
  assert.ok(sanitizedGoogleNav.startsWith('https://maps.google.com/maps?'));

  // 4. geo: scheme converts to https://maps.google.com/maps?
  const geoUri = 'geo:12.971891,77.641151?q=12.971891,77.641151(Ultraviolette+Hangar)';
  const sanitizedGeo = sanitizeGoogleMapsUrl(geoUri);
  assert.ok(sanitizedGeo.startsWith('https://maps.google.com/maps?'));

  // 5. openInGoogleMaps returns clean https://maps.google.com/maps? URL
  const openedUrl = openInGoogleMaps('geo:13.1362,78.1291', 13.1362, 78.1291, 'Kolar');
  assert.ok(openedUrl.startsWith('https://maps.google.com/maps?'));
  assert.ok(!openedUrl.includes('intent://'));
  assert.ok(!openedUrl.includes('api=1'));
});

test('Charging Network: 24h new charger detection, composition breakdown (UV vs Owners vs Bolt Type 6), and filter matching', async () => {
  const {
    isChargerAddedInLast24Hours,
    calculateChargingNetworkComposition,
    matchesChargingStationFilter
  } = await import('./rules.ts');

  const now = Date.now();
  const threeHoursAgo = new Date(now - 3 * 3600 * 1000).toISOString();
  const twoDaysAgo = new Date(now - 48 * 3600 * 1000).toISOString();

  const stationUv = {
    id: 'cs_uv_1',
    name: 'Hangar Supernova Indiranagar',
    chargerType: 'Supernova',
    isSupernova: true,
    isCommunityReported: false,
    chargerSource: 'Supernova' as const,
    powerOutputKw: 30,
    createdAt: threeHoursAgo,
    connectorTypes: ['UV Supernova Dual DC (30 kW)']
  };

  const stationOwner = {
    id: 'cs_owner_1',
    name: 'Maddur Waypoint Socket',
    chargerType: 'Socket',
    isSupernova: false,
    isCommunityReported: true,
    chargerSource: 'Community Provided Charger' as const,
    powerOutputKw: 3.3,
    createdAt: twoDaysAgo,
    connectorTypes: ['15A Industrial Weatherproof Socket']
  };

  const stationType6 = {
    id: 'cs_t6_1',
    name: 'Lonavala Type 6 Fast Pod',
    chargerType: 'Type 6',
    isSupernova: false,
    isCommunityReported: false,
    chargerSource: '3rd Party Station' as const,
    powerOutputKw: 6,
    createdAt: threeHoursAgo,
    connectorTypes: ['Type 6 LEV DC Fast (6.0 kW)']
  };

  // 1. Check isChargerAddedInLast24Hours
  assert.equal(isChargerAddedInLast24Hours(stationUv, now), true);
  assert.equal(isChargerAddedInLast24Hours(stationOwner, now), false);
  assert.equal(isChargerAddedInLast24Hours(stationType6, now), true);
  assert.equal(isChargerAddedInLast24Hours({ id: 'new_custom_1' }, now), true);

  // 2. Check calculateChargingNetworkComposition
  const composition = calculateChargingNetworkComposition(
    [stationUv, stationOwner, stationType6],
    now
  );
  assert.equal(composition.totalCount, 3);
  assert.equal(composition.last24HoursCount, 2);
  assert.equal(composition.segments.uvSupernova.count, 1);
  assert.equal(composition.segments.uvSupernova.totalKw, 30);
  assert.equal(composition.segments.ownersChargers.count, 1);
  assert.equal(composition.segments.ownersChargers.totalKw, 3);
  assert.equal(composition.segments.boltType6.count, 1);
  assert.equal(composition.segments.boltType6.totalKw, 6);

  const stationType2 = {
    id: 'cs_t2_1',
    name: 'Mumbai Bandra Type 2 Hub',
    chargerType: 'Type 2',
    isSupernova: false,
    isCommunityReported: false,
    chargerSource: '3rd Party Station' as const,
    powerOutputKw: 7.2,
    createdAt: twoDaysAgo,
    connectorTypes: ['Type 2 AC (7.2 kW)']
  };

  // 3. Check matchesChargingStationFilter
  assert.equal(matchesChargingStationFilter(stationUv, 'LAST_24H', now), true);
  assert.equal(matchesChargingStationFilter(stationOwner, 'LAST_24H', now), false);

  assert.equal(matchesChargingStationFilter(stationUv, 'UV_SUPERNOVA'), true);
  assert.equal(matchesChargingStationFilter(stationOwner, 'UV_SUPERNOVA'), false);

  assert.equal(matchesChargingStationFilter(stationOwner, 'OWNERS'), true);
  assert.equal(matchesChargingStationFilter(stationUv, 'OWNERS'), false);

  assert.equal(matchesChargingStationFilter(stationType6, 'BOLT_TYPE_6'), true);
  assert.equal(matchesChargingStationFilter(stationUv, 'BOLT_TYPE_6'), false);

  assert.equal(matchesChargingStationFilter(stationType2, 'TYPE_2'), true);
  assert.equal(matchesChargingStationFilter(stationUv, 'TYPE_2'), false);

  assert.equal(matchesChargingStationFilter(stationOwner, 'SOCKET'), true);
  assert.equal(matchesChargingStationFilter(stationType6, 'SOCKET'), false);

  // 4. Supernova stations with mixed connector labels must NEVER leak into Type 2, Type 6, Socket, or Community filters
  const supernovaWithMixedConnectors = {
    id: 'cs_supernova_mixed',
    name: 'UV Supernova Hub with Secondary Labels',
    chargerType: 'Supernova',
    isSupernova: true,
    isCommunityReported: false,
    chargerSource: 'Supernova' as const,
    powerOutputKw: 30,
    createdAt: twoDaysAgo,
    connectorTypes: [
      'IEC 62196-3 Type 6 (UV DC Fast)',
      'Type 2 AC (7.2 kW)',
      '15A 3-Pin Industrial Socket'
    ]
  };
  assert.equal(matchesChargingStationFilter(supernovaWithMixedConnectors, 'SUPERNOVA'), true);
  assert.equal(matchesChargingStationFilter(supernovaWithMixedConnectors, 'UV_SUPERNOVA'), true);
  assert.equal(matchesChargingStationFilter(supernovaWithMixedConnectors, 'ALL'), true);
  assert.equal(matchesChargingStationFilter(supernovaWithMixedConnectors, 'TYPE_2'), false);
  assert.equal(matchesChargingStationFilter(supernovaWithMixedConnectors, 'Type 2'), false);
  assert.equal(matchesChargingStationFilter(supernovaWithMixedConnectors, 'BOLT_TYPE_6'), false);
  assert.equal(matchesChargingStationFilter(supernovaWithMixedConnectors, 'Type 6'), false);
  assert.equal(matchesChargingStationFilter(supernovaWithMixedConnectors, 'SOCKET'), false);
  assert.equal(matchesChargingStationFilter(supernovaWithMixedConnectors, 'Socket'), false);
  assert.equal(matchesChargingStationFilter(supernovaWithMixedConnectors, 'Community Provided Chargers'), false);
});

test('parseMinimalChargingStationsDatabase parses all 182 records, 76 valid coordinate markers, and 153 skipped records from charging_stations_minimal.json', () => {
  const filePath = path.resolve(process.cwd(), 'public/data/charging_stations_minimal.json');
  let result: ParsedMinimalChargingDatabaseResult;

  if (fs.existsSync(filePath)) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    result = parseMinimalChargingStationsDatabase(raw);

    // 182 total records, 29 records with coordinates, 76 valid map markers, 153 skipped records
    assert.equal(result.totalRecordsLoaded, 182);
    assert.equal(result.recordsWithValidCoordinatesCount, 29);
    assert.equal(result.validMapMarkersCount, 76);
    assert.equal(result.skippedRecordsCount, 153);
    assert.equal(result.validStations.length, 76);
    assert.equal(result.skippedRecords.length, 153);

    // Check duplicate coordinate preservation (e.g. 10.710361, 76.428667 appears in two records)
    const dupMatches = result.validStations.filter(
      s => s.exactLocationCoordinates === '10.710361, 76.428667'
    );
    assert.equal(dupMatches.length, 2);
    assert.equal(result.validStations.every(s => s.isUnverifiedAssociation === true), true);
  } else {
    const sample = [
      { reference_name: 'ChargeMod Station A', exact_location_coordinates: '10.710361, 76.428667', charger_type: 'Blaze DC' },
      { reference_name: 'ChargeMod Station B', exact_location_coordinates: '10.710361, 76.428667', charger_type: '' },
      { reference_name: 'Station C', exact_location_coordinates: '', charger_type: 'Type 2' }
    ];
    result = parseMinimalChargingStationsDatabase(sample);
    assert.equal(result.validStations.length, 2);
    assert.equal(result.skippedRecords.length, 1);
  }

  // Check blank charger_type fallback
  assert.equal(formatMinimalChargerType(''), 'Charger type unavailable');
  assert.equal(formatMinimalChargerType(null), 'Charger type unavailable');
  assert.equal(formatMinimalChargerType('3.3kW AC charging point'), '3.3kW AC charging point');

  // Check search by reference_name, charger_type, and coordinates
  const byName = searchAndFilterChargingStations(result.validStations, 'ChargeMod', 'ALL');
  assert.ok(byName.length >= 1);

  const byChargerType = searchAndFilterChargingStations(result.validStations, 'Blaze DC', 'ALL');
  assert.ok(byChargerType.length >= 1);

  const byCoords = searchAndFilterChargingStations(result.validStations, '10.710361', 'ALL');
  assert.equal(byCoords.length, 2);
});

test('Interactive Cockpit Red-Glow Zone Registry: rotary hit-testing, directional cycling, and shortest bearing rotation', () => {
  assert.equal(COCKPIT_INTERACTIVE_ZONES.length, 20);

  // Default priority issues zone has valid mask and border SVG paths
  const prio = getCockpitZoneById('sector_priority_issues');
  assert.equal(prio.label, 'PRIORITY ISSUES');
  assert.equal(prio.routeId, 'problems');
  assert.ok(prio.svgMaskPath.startsWith('M '));
  assert.ok(prio.svgBorderPath.startsWith('M '));

  // Rotary canvas hit-testing resolves all 8 dial sectors + center reticle accurately
  assert.equal(resolveCockpitZoneFromCanvasPoint(470.5, 810)?.id, 'sector_center_core');
  assert.equal(resolveCockpitZoneFromCanvasPoint(470.5, 560)?.id, 'sector_jet_engineer');
  assert.equal(resolveCockpitZoneFromCanvasPoint(700, 810)?.id, 'sector_charging_network');
  assert.equal(resolveCockpitZoneFromCanvasPoint(470.5, 1050)?.id, 'sector_mission_mode');
  assert.equal(resolveCockpitZoneFromCanvasPoint(240, 810)?.id, 'sector_squadron_assist');
  assert.equal(resolveCockpitZoneFromCanvasPoint(85, 720)?.id, 'sector_priority_issues');
  assert.equal(resolveCockpitZoneFromCanvasPoint(85, 900)?.id, 'sector_mod_lab');
  assert.equal(resolveCockpitZoneFromCanvasPoint(855, 720)?.id, 'sector_marketplace');
  assert.equal(resolveCockpitZoneFromCanvasPoint(855, 900)?.id, 'sector_discussions');
  assert.equal(resolveCockpitZoneFromCanvasPoint(470.5, 100), null);

  // Directional and sequential cycling around the dial
  assert.equal(cycleCockpitSector('sector_priority_issues', 'up').id, 'sector_jet_engineer');
  assert.equal(cycleCockpitSector('sector_jet_engineer', 'down').id, 'sector_mission_mode');
  assert.equal(cycleCockpitSector('sector_jet_engineer', 'right').id, 'sector_charging_network');
  assert.equal(cycleCockpitSector('sector_charging_network', 'right').id, 'sector_marketplace');
  assert.equal(cycleCockpitSector('sector_jet_engineer', 'next').id, 'sector_marketplace');

  // Shortest rotation delta across 0/360 boundary
  assert.equal(computeShortestRotationDelta(350, 10), 20);
  assert.equal(computeShortestRotationDelta(10, 350), -20);
});

test('Cockpit Core-to-Full-Interface Transforming Boot Animation: phase timeline, iris expansion specs, and radial rays', () => {
  // Phase timeline resolution
  assert.equal(resolveCockpitBootPhase(0, false), 'core_logo');
  assert.equal(resolveCockpitBootPhase(300, false), 'core_logo');
  assert.equal(resolveCockpitBootPhase(700, false), 'dial_expand');
  assert.equal(resolveCockpitBootPhase(1500, false), 'full_deploy');
  assert.equal(resolveCockpitBootPhase(2500, false), 'ready');

  // Reduced motion immediately resolves to ready
  assert.equal(resolveCockpitBootPhase(0, true), 'ready');

  // Transform specs progress monotonically from central logo core -> circular interface -> full buttons -> ready
  const specCore = getCockpitBootTransformSpec('core_logo');
  const specDial = getCockpitBootTransformSpec('dial_expand');
  const specFull = getCockpitBootTransformSpec('full_deploy');
  const specReady = getCockpitBootTransformSpec('ready');

  assert.ok(specCore.irisRadiusPct < specDial.irisRadiusPct);
  assert.ok(specDial.irisRadiusPct < specFull.irisRadiusPct);
  assert.ok(specFull.irisRadiusPct < specReady.irisRadiusPct);

  assert.equal(specCore.centerLogoOpacity, 1);
  assert.equal(specReady.centerLogoOpacity, 0);
  assert.equal(specReady.clipPathCss, 'none');

  // Lower chassis extension transforms in sync with boot phases (hidden in core_logo & dial_expand, deploys in full_deploy & ready)
  assert.equal(specCore.lowerChassisOpacity, 0);
  assert.equal(specDial.lowerChassisOpacity, 0);
  assert.equal(specFull.lowerChassisOpacity, 1);
  assert.equal(specReady.lowerChassisOpacity, 1);
  assert.equal(specReady.lowerChassisClipPathCss, 'none');

  // 8 radial expansion rays emanate from (470.5, 810)
  assert.equal(COCKPIT_RADIAL_EXPANSION_RAYS.length, 8);
  assert.ok(COCKPIT_RADIAL_EXPANSION_RAYS.every(r => Number.isFinite(r.x1) && Number.isFinite(r.y2)));

  // First app start plays animation; subsequent back / previous page navigation skips animation
  assert.equal(
    shouldSkipCockpitBootAnimation({
      hasBootedInSession: false,
      skipBootAnimation: false,
      reducedMotion: false,
      initialShowSystemControls: false
    }),
    false
  );
  assert.equal(
    shouldSkipCockpitBootAnimation({
      hasBootedInSession: true,
      skipBootAnimation: false,
      reducedMotion: false,
      initialShowSystemControls: false
    }),
    true
  );
  assert.equal(
    shouldSkipCockpitBootAnimation({
      hasBootedInSession: false,
      skipBootAnimation: true,
      reducedMotion: false,
      initialShowSystemControls: false
    }),
    true
  );
});

test('resolveCockpitOperatorBadge dynamically resolves user name, ID, and bike model pilot tag for every user', () => {
  // Unauthenticated visitor
  const guestBadge = resolveCockpitOperatorBadge(null);
  assert.equal(guestBadge.displayName, 'SIGN IN');
  assert.equal(guestBadge.pilotLabel, 'UV PILOT');

  // Vikram Sengupta on F77
  const vikramF77 = resolveCockpitOperatorBadge({
    id: 'u_pilot07',
    fullName: 'Vikram Sengupta',
    motorcycleModel: 'F77',
    pilotNickname: 'F77 PILOT'
  });
  assert.equal(vikramF77.displayName, 'VIKRAM');
  assert.equal(vikramF77.pilotLabel, 'F77 PILOT');
  assert.equal(vikramF77.userId, 'U_PILOT07');

  // Rider on X47 automatically shows X47 PILOT even if legacy pilotNickname had F77 PILOT
  const x47Pilot = resolveCockpitOperatorBadge({
    id: 'u_pilot99',
    fullName: 'Rohan Kulkarni',
    motorcycleModel: 'X47 Crossover',
    pilotNickname: 'F77 PILOT'
  });
  assert.equal(x47Pilot.displayName, 'ROHAN');
  assert.equal(x47Pilot.pilotLabel, 'X47 PILOT');
  assert.equal(x47Pilot.userId, 'U_PILOT99');

  // Custom primary name and custom nickname override
  const customPilot = resolveCockpitOperatorBadge({
    id: 'u_custom',
    fullName: 'Devika Nair',
    customPrimaryName: 'APEX_01',
    motorcycleModel: 'F77',
    pilotNickname: 'NIGHTHAWK'
  });
  assert.equal(customPilot.displayName, 'APEX_01');
  assert.equal(customPilot.pilotLabel, 'NIGHTHAWK');
});

test('Cockpit Community Disclaimer: verifies official community notice text and purpose', () => {
  assert.ok(COCKPIT_COMMUNITY_DISCLAIMER_TEXT.includes('not official Ultraviolette Automotive app'));
  assert.ok(COCKPIT_COMMUNITY_DISCLAIMER_TEXT.includes('discover, help , assist Ultraviolette owners'));
  assert.ok(COCKPIT_COMMUNITY_DISCLAIMER_TEXT.includes('have some fun!'));
  assert.equal(COCKPIT_COMMUNITY_DISCLAIMER_TAGLINE, 'COMMUNITY PLATFORM • NOT AN OFFICIAL APP');
});

test('UPI App Launch Android WebView Protection: buildUpiIntentUri and openInUpiApp generate intent:// URIs for UPI App, GPay, PhonePe, and Paytm without raw upi:// or tez:// schemes', async () => {
  const {
    buildUpiPaymentUri,
    buildUpiIntentUri,
    openInUpiApp,
    UPI_APP_PACKAGE_MAP
  } = await import('./rules.ts');

  const rawUpi = buildUpiPaymentUri({
    upiId: 'abinavthejas2001-1@okaxis',
    amountInr: 20,
    note: 'Get us a chai (Ghost Protocol)'
  });
  assert.ok(rawUpi.startsWith('upi://pay?'));

  // 1. Generic UPI App intent
  const upiIntent = buildUpiIntentUri(rawUpi, 'upi');
  assert.ok(upiIntent.startsWith('intent://pay?pa=abinavthejas2001-1%40okaxis'));
  assert.ok(upiIntent.includes('#Intent;scheme=upi;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;'));
  assert.ok(upiIntent.includes('S.browser_fallback_url=upi%3A%2F%2Fpay%3F'));
  assert.ok(!upiIntent.includes('package='));
  assert.ok(upiIntent.endsWith(';end'));

  // 2. GPay intent targets com.google.android.apps.nbu.paisa.user
  const gpayIntent = buildUpiIntentUri(rawUpi, 'gpay');
  assert.ok(gpayIntent.startsWith('intent://pay?pa=abinavthejas2001-1%40okaxis'));
  assert.ok(gpayIntent.includes(`package=${UPI_APP_PACKAGE_MAP.gpay};`));
  assert.ok(gpayIntent.includes('S.browser_fallback_url=upi%3A%2F%2Fpay%3F'));
  assert.ok(gpayIntent.endsWith(';end'));

  // 3. PhonePe intent targets com.phonepe.app
  const phonepeIntent = buildUpiIntentUri(rawUpi, 'phonepe');
  assert.ok(phonepeIntent.startsWith('intent://pay?pa=abinavthejas2001-1%40okaxis'));
  assert.ok(phonepeIntent.includes(`package=${UPI_APP_PACKAGE_MAP.phonepe};`));
  assert.ok(phonepeIntent.includes('S.browser_fallback_url=upi%3A%2F%2Fpay%3F'));
  assert.ok(phonepeIntent.endsWith(';end'));

  // 4. Paytm intent targets net.one97.paytm
  const paytmIntent = buildUpiIntentUri(rawUpi, 'paytm');
  assert.ok(paytmIntent.startsWith('intent://pay?pa=abinavthejas2001-1%40okaxis'));
  assert.ok(paytmIntent.includes(`package=${UPI_APP_PACKAGE_MAP.paytm};`));
  assert.ok(paytmIntent.includes('S.browser_fallback_url=upi%3A%2F%2Fpay%3F'));
  assert.ok(paytmIntent.endsWith(';end'));

  // 5. openInUpiApp returns the clean intent:// URI
  assert.equal(openInUpiApp(rawUpi, 'gpay', 'Mozilla/5.0 (X11; Linux x86_64)'), gpayIntent);
  assert.equal(openInUpiApp(rawUpi, 'phonepe', 'Mozilla/5.0 (X11; Linux x86_64)'), phonepeIntent);
  assert.equal(openInUpiApp(rawUpi, 'paytm', 'Mozilla/5.0 (X11; Linux x86_64)'), paytmIntent);
  assert.equal(openInUpiApp(rawUpi, 'upi', 'Mozilla/5.0 (X11; Linux x86_64)'), upiIntent);
});

test('Squadron Assist Call 112 & Phone Dialer Android WebView Protection: buildPhoneDialIntentUri and openPhoneDialer generate intent:// URIs with tel: fallback', async () => {
  const {
    buildPhoneDialIntentUri,
    openPhoneDialer,
    buildMailtoIntentUri,
    openMailClient
  } = await import('./rules.ts');

  // 1. Call 112 emergency button
  const call112Intent = buildPhoneDialIntentUri('112');
  assert.equal(
    call112Intent,
    'intent://112#Intent;scheme=tel;action=android.intent.action.DIAL;category=android.intent.category.BROWSABLE;S.browser_fallback_url=tel%3A112;end'
  );
  assert.ok(call112Intent.startsWith('intent://112#Intent;scheme=tel;'));
  assert.equal(openPhoneDialer('tel:112', 'Mozilla/5.0 (X11; Linux x86_64)'), call112Intent);

  // 2. Formatted Indian mobile number with spaces
  const riderPhoneIntent = buildPhoneDialIntentUri('tel:+91 98450 11223');
  assert.equal(
    riderPhoneIntent,
    'intent://+919845011223#Intent;scheme=tel;action=android.intent.action.DIAL;category=android.intent.category.BROWSABLE;S.browser_fallback_url=tel%3A%2B919845011223;end'
  );
  assert.equal(openPhoneDialer('+91 98450 11223', 'Mozilla/5.0 (X11; Linux x86_64)'), riderPhoneIntent);

  // 3. Mailto link conversion
  const mailIntent = buildMailtoIntentUri('mailto:pilot@ghostprotocol.io?subject=SOS');
  assert.ok(mailIntent.startsWith('intent://pilot@ghostprotocol.io?subject=SOS#Intent;scheme=mailto;'));
  assert.ok(mailIntent.includes('S.browser_fallback_url=mailto%3Apilot%40ghostprotocol.io'));
  assert.equal(openMailClient('mailto:pilot@ghostprotocol.io?subject=SOS', 'Mozilla/5.0 (X11; Linux x86_64)'), mailIntent);
});

test('Charging Network Co-Located & Same-City Clustering: groups 2+ chargers sharing exact coordinates, same address, or same city/town across Community, Supernova, Type 6, Type 2, and Socket types', async () => {
  const {
    normalizeChargerLocationKey,
    extractChargerCityOrTownKey,
    areChargingStationsCoLocated,
    groupCoLocatedChargingStations,
    resolveClusterLocationLabel,
    clusterChargingStations
  } = await import('./rules.ts');

  // 1. Address and city normalization
  assert.equal(
    normalizeChargerLocationKey('NH 275 Bengaluru–Mysuru Access Controlled Hwy, Maddur, Karnataka'),
    normalizeChargerLocationKey('NH 275 Bengaluru-Mysuru Access Controlled Hwy, Maddur, Karnataka!')
  );
  assert.equal(extractChargerCityOrTownKey('MG Road, Kolar, Karnataka 563101'), 'kolar');
  assert.equal(extractChargerCityOrTownKey('NH 75 Bypass, Kolar'), 'kolar');
  assert.equal(extractChargerCityOrTownKey('Mysore, Karnataka'), 'mysuru');
  assert.equal(extractChargerCityOrTownKey('Mysuru, Karnataka'), 'mysuru');

  // 2. Three heterogeneous chargers (Community Socket, Supernova, Type 6) submitted in the same town/location (Maddur)
  const maddurCommunitySocket = {
    id: 'cs_maddur_comm',
    name: 'Maddur Rider Hangar 15A Socket',
    location: 'Maddur Tiffany Bypass Plaza, Maddur, Karnataka 571428',
    latitude: 12.5841,
    longitude: 77.0428,
    chargerType: 'Socket',
    chargerSource: 'Community Provided Charger',
    isCommunityReported: true,
    powerOutputKw: 3.3
  };
  const maddurType2 = {
    id: 'cs_maddur_t2',
    name: 'Maddur Express AC Type 2 Pod',
    location: 'NH 275 Service Road, Maddur, Karnataka',
    latitude: 12.5890,
    longitude: 77.0480,
    chargerType: 'Type 2',
    chargerSource: '3rd Party Station',
    isCommunityReported: true,
    powerOutputKw: 7.2
  };
  const maddurSupernova = {
    id: 'cs_maddur_sn',
    name: 'UV Supernova — Maddur Highway Hub',
    location: 'Maddur, Karnataka',
    latitude: 12.5920,
    longitude: 77.0510,
    chargerType: 'Supernova',
    chargerSource: 'Supernova',
    isSupernova: true,
    powerOutputKw: 30
  };
  const standaloneTumakuru = {
    id: 'cs_tumakuru_sn',
    name: 'UV Supernova — Tumakuru Bypass',
    location: 'NH 48 Sira Road, Tumakuru, Karnataka 572106',
    latitude: 13.3409,
    longitude: 77.1010,
    chargerType: 'Supernova',
    chargerSource: 'Supernova',
    isSupernova: true,
    powerOutputKw: 30
  };

  assert.equal(areChargingStationsCoLocated(maddurCommunitySocket, maddurType2), true);
  assert.equal(areChargingStationsCoLocated(maddurType2, maddurSupernova), true);
  assert.equal(areChargingStationsCoLocated(maddurCommunitySocket, standaloneTumakuru), false);

  // 3. groupCoLocatedChargingStations groups the 3 Maddur chargers into 1 cluster with count = 3 while keeping Tumakuru as count = 1
  const grouped = groupCoLocatedChargingStations([
    maddurCommunitySocket,
    maddurType2,
    maddurSupernova,
    standaloneTumakuru
  ]);
  assert.equal(grouped.length, 2);

  const maddurCluster = grouped.find(c => c.count === 3);
  assert.ok(maddurCluster, 'Expected a cluster of 3 Maddur chargers');
  assert.equal(maddurCluster.isCluster, true);
  assert.equal(maddurCluster.stations.length, 3);
  assert.ok(resolveClusterLocationLabel(maddurCluster.stations).includes('Maddur'));

  const tumakuruSingle = grouped.find(c => c.count === 1);
  assert.ok(tumakuruSingle, 'Expected standalone Tumakuru charger to remain unclustered');
  assert.equal(tumakuruSingle.isCluster, false);
  assert.equal(tumakuruSingle.stations[0].id, 'cs_tumakuru_sn');

  // 4. Even at max zoom (zoom 16), clusterChargingStations keeps co-located / same-city chargers grouped together
  const highZoomClusters = clusterChargingStations(
    [maddurCommunitySocket, maddurType2, maddurSupernova, standaloneTumakuru],
    16
  );
  const highZoomMaddur = highZoomClusters.find(c => c.count === 3);
  assert.ok(highZoomMaddur);
  assert.equal(highZoomMaddur.isCluster, true);
});

import {
  discoverRouteCorridorDefinitions,
  buildFallbackRouteCandidates,
  evaluateAutoPilotRouteOptions,
  type EligibleChargerRecord
} from './autopilot.ts';

test('AutoPilot Multi-Route Engine: discovers multiple routes (including Bengaluru -> Kerala via Salem/Coimbatore and via Mysuru) and computes total distance and total chargers for each route', () => {
  const blrStart = {
    name: 'Ultraviolette Hangar Indiranagar',
    locality: 'Indiranagar, Bengaluru',
    address: '100 Feet Road, Indiranagar, Bengaluru, Karnataka',
    latitude: 12.9719,
    longitude: 77.6412
  };
  const keralaDest = {
    name: 'Kerala — Kochi (Edappally NH 66 Hub)',
    locality: 'Kochi, Kerala',
    address: 'Edappally Junction, Kochi, Kerala',
    latitude: 10.0190,
    longitude: 76.3142
  };

  const sampleStations: EligibleChargerRecord[] = [
    {
      id: 'st_mysuru_1',
      name: 'Bolt.Earth Mysuru',
      location: 'Mysuru, Karnataka',
      latitude: 12.3010,
      longitude: 76.6341,
      chargerType: 'Type 6',
      connectorTypes: ['Type 6'],
      powerOutputKw: 6,
      isSupernova: false,
      isCommunityReported: false,
      verifiedByAdmin: true,
      approvalStatus: 'approved',
      published: true,
      operatingStatus: 'Operational',
      accessConditions: 'Public 24/7',
      lastVerifiedDate: '2026-10-20'
    },
    {
      id: 'st_nilambur_1',
      name: 'Bolt.Earth Nilambur',
      location: 'Nilambur, Kerala',
      latitude: 11.2448,
      longitude: 76.1831,
      chargerType: 'Type 6',
      connectorTypes: ['Type 6'],
      powerOutputKw: 6,
      isSupernova: false,
      isCommunityReported: false,
      verifiedByAdmin: true,
      approvalStatus: 'approved',
      published: true,
      operatingStatus: 'Operational',
      accessConditions: 'Public 24/7',
      lastVerifiedDate: '2026-10-20'
    },
    {
      id: 'st_salem_1',
      name: 'Zeon Salem Highway',
      location: 'Salem, Tamil Nadu',
      latitude: 11.6646,
      longitude: 78.1233,
      chargerType: 'Socket',
      connectorTypes: ['15A Socket'],
      powerOutputKw: 3.3,
      isSupernova: false,
      isCommunityReported: false,
      verifiedByAdmin: true,
      approvalStatus: 'approved',
      published: true,
      operatingStatus: 'Operational',
      accessConditions: 'Public 24/7',
      lastVerifiedDate: '2026-10-20'
    },
    {
      id: 'st_thrissur_1',
      name: 'Bolt.Earth Thrissur',
      location: 'Thrissur, Kerala',
      latitude: 10.4937,
      longitude: 76.2541,
      chargerType: 'Type 6',
      connectorTypes: ['Type 6'],
      powerOutputKw: 6,
      isSupernova: false,
      isCommunityReported: false,
      verifiedByAdmin: true,
      approvalStatus: 'approved',
      published: true,
      operatingStatus: 'Operational',
      accessConditions: 'Public 24/7',
      lastVerifiedDate: '2026-10-20'
    }
  ];

  // 1. Discover corridors between Bengaluru and Kerala
  const corridors = discoverRouteCorridorDefinitions(blrStart, keralaDest, sampleStations);
  assert.equal(corridors.length, 3);
  assert.ok(
    corridors.some(c => c.shortLabel.toLowerCase().includes('salem')),
    'Expected a route via Salem & Coimbatore'
  );
  assert.ok(
    corridors.some(c => c.shortLabel.toLowerCase().includes('mysuru')),
    'Expected a route via Mysuru (Mysore)'
  );

  // 2. Build candidate route geometries and evaluate each route
  const candidateGeoms = buildFallbackRouteCandidates(
    blrStart,
    keralaDest,
    sampleStations,
    corridors
  );
  assert.equal(candidateGeoms.length, 3);

  const evaluated = evaluateAutoPilotRouteOptions(candidateGeoms, {
    startLocation: blrStart,
    destination: keralaDest,
    allStations: sampleStations,
    reports: [],
    targetIntervalKm: 100
  });
  assert.equal(evaluated.length, 3);

  for (const opt of evaluated) {
    assert.ok(opt.distanceKm > 350, `Expected realistic distance > 350 km for ${opt.shortLabel}`);
    assert.ok(
      opt.totalChargersOnRoute >= 2,
      `Expected chargers on route for ${opt.shortLabel}, got ${opt.totalChargersOnRoute}`
    );
  }

  const salemRoute = evaluated.find(r => r.id === 'route_salem_coimbatore')!;
  const mysuruRoute = evaluated.find(r => r.id === 'route_mysuru_nilambur')!;
  assert.ok(salemRoute);
  assert.ok(mysuruRoute);

  // Verify Mysuru route includes the Mysuru & Nilambur chargers, while Salem route includes the Salem charger
  const mysuruChargerIds = mysuruRoute.planResult.eligibleCorridorChargers.map(c => c.station.id);
  assert.ok(mysuruChargerIds.includes('st_mysuru_1'));
  assert.ok(mysuruChargerIds.includes('st_nilambur_1'));

  const salemChargerIds = salemRoute.planResult.eligibleCorridorChargers.map(c => c.station.id);
  assert.ok(salemChargerIds.includes('st_salem_1'));
});


