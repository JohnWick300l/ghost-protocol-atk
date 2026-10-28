// GHOST PROTOCOL — AUTO PILOT ELECTRIC MOTORCYCLE TRIP PLANNER ENGINE
// Pure, deterministic route-planning, charger-intelligence, backup-selection,
// range-guard, and external Google Maps navigation stage utilities.

import {
  calculateDistanceKm,
  isPubliclyPublishedCharger,
  buildChargerNavigationUrl,
  VERIFIED_INDIA_PLACES_DIRECTORY,
  type ChargerPlugType,
  type PlaceSuggestion
} from './rules.ts';

export type ChargerReportCategory =
  | 'WORKING'
  | 'FAULTY'
  | 'INACCESSIBLE'
  | 'SUCCESSFULLY CHARGED';

export const VALID_CHARGER_REPORT_CATEGORIES: ChargerReportCategory[] = [
  'WORKING',
  'FAULTY',
  'INACCESSIBLE',
  'SUCCESSFULLY CHARGED'
];

export type ChargerConfidenceLabel =
  | 'RECENTLY REPORTED WORKING'
  | 'MIXED REPORTS'
  | 'RECENT ISSUE REPORTED'
  | 'NO RECENT REPORTS';

export interface ChargerCommunityReport {
  id: string;
  chargerId: string;
  userId: string;
  reporterCallsign: string;
  category: ChargerReportCategory;
  comment?: string;
  createdAt: string;
  sourceLabel: 'Community Report';
}

export interface ChargerIntelligenceSummary {
  chargerId: string;
  confidenceLabel: ChargerConfidenceLabel;
  latestReport: ChargerCommunityReport | null;
  recentPositiveCount: number;
  recentNegativeCount: number;
  uniqueReportersCount: number;
  totalReportsCount: number;
  shortSummary: string;
  hasRecentIssue: boolean;
  sourceLabel: 'Community Report';
  disclaimer: string;
}

export interface RouteCoordinate {
  name: string;
  locality?: string;
  address: string;
  latitude: number;
  longitude: number;
  source?: string;
}

export interface EligibleChargerRecord {
  id: string;
  name: string;
  location: string;
  latitude: number;
  longitude: number;
  chargerType?: ChargerPlugType;
  uvChargingLink?: string;
  chargerDetails?: string;
  vehicleCompatibility?: string;
  connectorTypes: string[];
  powerOutputKw: number;
  chargerSource?: 'Supernova' | '3rd Party Station' | 'Community Provided Charger';
  isSupernova: boolean;
  isCommunityReported: boolean;
  verifiedByAdmin: boolean;
  approvalStatus?: 'approved' | 'pending' | 'rejected' | 'deleted';
  published?: boolean;
  submittedByUserId?: string;
  submittedByRole?: 'admin' | 'user';
  submittedByPhone?: string;
  operatingStatus: 'Operational' | 'Degraded' | 'Offline' | 'Temporarily Inaccessible';
  accessConditions:
    | 'Public 24/7'
    | 'Commercial Hours Only'
    | 'Security Permission Required'
    | 'Private/Restricted';
  pricing?: string;
  lastVerifiedDate: string;
  userNotes?: string;
  reportedBy?: string;
}

export interface BackupChargerOption {
  station: EligibleChargerRecord;
  distanceFromPrimaryKm: number;
  detourDistanceKm: number;
  estimatedDetourDurationMin: number | null;
  routePositionKm: number;
  intelligence: ChargerIntelligenceSummary;
  reason: string;
}

export interface PlannedChargingStop {
  station: EligibleChargerRecord;
  order: number;
  distanceFromStartKm: number;
  distanceFromPrevStopKm: number;
  distanceToNextStopKm: number;
  detourDistanceKm: number;
  estimatedDetourDurationMin: number | null;
  selectionReason: string;
  isManuallyAdded?: boolean;
  intelligence: ChargerIntelligenceSummary;
  backupChargers: BackupChargerOption[];
  reached: boolean;
  reachedAt?: string;
  chargingConfirmed: boolean;
  chargingConfirmedAt?: string;
}

export interface PlannedPitStop {
  id: string;
  name: string;
  address: string;
  category: string;
  latitude: number;
  longitude: number;
  distanceFromStartKm: number;
  detourDistanceKm: number;
  estimatedDetourDurationMin: number | null;
  includedInNavigation: boolean;
}

export interface RangeGuardConfig {
  enabled: boolean;
  startingBatteryPercent?: number;
  estimatedUsableRangeKm?: number;
  reserveRangeKm?: number;
}

export interface RangeGuardLegWarning {
  legIndex: number;
  fromName: string;
  toName: string;
  legDistanceKm: number;
  effectiveLimitKm: number;
  severity: 'warning' | 'critical';
  message: string;
  recommendedEarlierCharger?: EligibleChargerRecord;
}

export interface RangeGuardEvaluation {
  enabled: boolean;
  startingBatteryPercent?: number;
  estimatedUsableRangeKm?: number;
  reserveRangeKm?: number;
  effectiveSafeLegKm: number | null;
  firstLegMaxKm: number | null;
  warnings: RangeGuardLegWarning[];
  disclaimer: string;
}

export interface RouteSegmentBrief {
  fromName: string;
  toName: string;
  distanceKm: number;
  durationMin: number | null;
  isLongGap: boolean;
  stopType: 'charger' | 'pitstop' | 'destination';
}

export interface MissionBriefingData {
  startLocation: RouteCoordinate;
  destination: RouteCoordinate;
  totalDrivingDistanceKm: number;
  baseDirectDrivingDistanceKm: number;
  estimatedDrivingDurationMin: number | null;
  routingSource: 'OSRM Driving Route' | 'Geodesic Fallback (Routing Service Unavailable)';
  routingAvailable: boolean;
  routingLimitationNote?: string;
  selectedStopsCount: number;
  orderedStopNames: string[];
  segments: RouteSegmentBrief[];
  totalDetourDistanceKm: number;
  estimatedDetourDurationMin: number | null;
  longestGapKm: number;
  unusuallyLongGaps: { fromName: string; toName: string; distanceKm: number }[];
  chargerReportWarnings: string[];
  ineligibleChargerAlerts: string[];
  networkSparseWarning?: string;
  rangeGuardEvaluation: RangeGuardEvaluation;
  generalRangeDisclaimer: string;
}

export interface NavigationStage {
  stageNumber: number;
  totalStages: number;
  label: string;
  originName: string;
  destinationName: string;
  waypointNames: string[];
  url: string;
  instruction: string;
}

export interface AutoPilotMissionShareSettings {
  isShared: boolean;
  sharedWithUserIds: string[];
  includeMeetingPoint: boolean;
  meetingPointName?: string;
  includeDepartureTime: boolean;
  includeGroupNotes: boolean;
  groupNotes?: string;
}

export interface AutoPilotMissionRecord {
  id: string;
  userId: string;
  ownerName: string;
  missionName: string;
  createdAt: string;
  updatedAt: string;
  departureDateTime?: string;
  startLocation: RouteCoordinate;
  destination: RouteCoordinate;
  targetIntervalKm: number;
  preferredChargerTypes: ChargerPlugType[];
  rangeGuard: RangeGuardConfig;
  plannedRouteDistanceKm: number;
  estimatedDrivingDurationMin: number | null;
  routingSource: string;
  chargingStops: {
    stationId: string;
    stationName: string;
    stationLocation: string;
    chargerType?: ChargerPlugType;
    powerOutputKw: number;
    latitude: number;
    longitude: number;
    order: number;
    distanceFromStartKm: number;
    distanceFromPrevStopKm: number;
    detourDistanceKm: number;
    reached: boolean;
    reachedAt?: string;
    chargingConfirmed: boolean;
    chargingConfirmedAt?: string;
  }[];
  pitStops: PlannedPitStop[];
  status: 'Planned' | 'In Progress' | 'Completed';
  completedAt?: string;
  riderNotes: string;
  isFavourite: boolean;
  shareSettings: AutoPilotMissionShareSettings;
}

export const RECENCY_WINDOW_DAYS = 30;
export const RECENCY_WINDOW_MS = RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
export const DEFAULT_TARGET_INTERVAL_KM = 100;
export const UNUSUALLY_LONG_GAP_THRESHOLD_KM = 125;
export const MAX_GOOGLE_MAPS_WAYPOINTS = 8;

/**
 * Validates that a report category is one of the 4 official categories.
 */
export function isValidChargerReportCategory(val: unknown): val is ChargerReportCategory {
  return (
    typeof val === 'string' &&
    VALID_CHARGER_REPORT_CATEGORIES.includes(val as ChargerReportCategory)
  );
}

/**
 * Evaluates community reports for a charger into a confidence label and summary.
 * - Deduplicates repeated reports from the same user within the recency window
 *   (only each user's most recent report counts toward confidence balance).
 * - Never claims live hardware telemetry.
 */
export function evaluateChargerIntelligence(
  chargerId: string,
  allReports: ChargerCommunityReport[],
  nowMs: number = Date.now()
): ChargerIntelligenceSummary {
  const chargerReports = (allReports || [])
    .filter(r => r && r.chargerId === chargerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const latestReport = chargerReports[0] || null;
  const disclaimer =
    'Community Report — Reflects rider-submitted observations, not live hardware telemetry, and status may have changed.';

  // Filter to recent reports within the 30-day recency window
  const recentReports = chargerReports.filter(r => {
    const ts = new Date(r.createdAt).getTime();
    return isFinite(ts) && nowMs - ts <= RECENCY_WINDOW_MS;
  });

  if (recentReports.length === 0) {
    const olderNote = latestReport
      ? `Last report (${latestReport.category}) was over ${RECENCY_WINDOW_DAYS} days ago.`
      : 'No community reports logged yet.';
    return {
      chargerId,
      confidenceLabel: 'NO RECENT REPORTS',
      latestReport,
      recentPositiveCount: 0,
      recentNegativeCount: 0,
      uniqueReportersCount: 0,
      totalReportsCount: chargerReports.length,
      shortSummary: olderNote,
      hasRecentIssue: false,
      sourceLabel: 'Community Report',
      disclaimer
    };
  }

  // Deduplicate by userId so one user's repeated reports cannot dominate confidence
  const latestByUser = new Map<string, ChargerCommunityReport>();
  for (const rep of recentReports) {
    const uid = rep.userId || rep.reporterCallsign || rep.id;
    if (!latestByUser.has(uid)) {
      latestByUser.set(uid, rep);
    }
  }

  let positiveCount = 0;
  let negativeCount = 0;

  for (const rep of latestByUser.values()) {
    if (rep.category === 'WORKING' || rep.category === 'SUCCESSFULLY CHARGED') {
      positiveCount++;
    } else if (rep.category === 'FAULTY' || rep.category === 'INACCESSIBLE') {
      negativeCount++;
    }
  }

  const uniqueReportersCount = latestByUser.size;
  const mostRecent = recentReports[0];
  const mostRecentIsNegative =
    mostRecent.category === 'FAULTY' || mostRecent.category === 'INACCESSIBLE';

  let confidenceLabel: ChargerConfidenceLabel = 'NO RECENT REPORTS';
  let hasRecentIssue = false;
  let shortSummary = '';

  if (positiveCount > 0 && negativeCount === 0) {
    confidenceLabel = 'RECENTLY REPORTED WORKING';
    hasRecentIssue = false;
    shortSummary = `${positiveCount} recent positive report(s) from ${uniqueReportersCount} rider(s). Latest: ${mostRecent.category}.`;
  } else if (negativeCount > 0 && positiveCount === 0) {
    confidenceLabel = 'RECENT ISSUE REPORTED';
    hasRecentIssue = true;
    shortSummary = `${negativeCount} recent issue report(s) (${mostRecent.category}). Review backup chargers before takeoff.`;
  } else if (positiveCount > 0 && negativeCount > 0) {
    if (mostRecentIsNegative && negativeCount > positiveCount) {
      confidenceLabel = 'RECENT ISSUE REPORTED';
      hasRecentIssue = true;
      shortSummary = `Recent issue reported (${mostRecent.category}); ${negativeCount} negative vs ${positiveCount} positive report(s).`;
    } else {
      confidenceLabel = 'MIXED REPORTS';
      hasRecentIssue = mostRecentIsNegative;
      shortSummary = `Mixed community reports (${positiveCount} working/charged, ${negativeCount} faulty/inaccessible). Latest: ${mostRecent.category}.`;
    }
  }

  return {
    chargerId,
    confidenceLabel,
    latestReport,
    recentPositiveCount: positiveCount,
    recentNegativeCount: negativeCount,
    uniqueReportersCount,
    totalReportsCount: chargerReports.length,
    shortSummary,
    hasRecentIssue,
    sourceLabel: 'Community Report',
    disclaimer
  };
}

/**
 * Filters a list of stations to strictly eligible, approved, published chargers with valid coordinates.
 */
export function getEligibleAutoPilotChargers(
  stations: EligibleChargerRecord[]
): EligibleChargerRecord[] {
  if (!Array.isArray(stations)) return [];
  return stations.filter(st => {
    if (!st || !st.id || !st.name) return false;
    if (!isPubliclyPublishedCharger(st)) return false;
    const lat = Number(st.latitude);
    const lon = Number(st.longitude);
    if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return false;
    }
    return true;
  });
}

/**
 * Computes cumulative distance array along a polyline of [lat, lng] coordinates.
 */
export function computePolylineCumulativeDistances(
  polyline: [number, number][]
): number[] {
  if (!Array.isArray(polyline) || polyline.length === 0) return [];
  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < polyline.length; i++) {
    const seg = calculateDistanceKm(
      polyline[i - 1][0],
      polyline[i - 1][1],
      polyline[i][0],
      polyline[i][1]
    );
    total += seg;
    cum.push(Number(total.toFixed(2)));
  }
  return cum;
}

/**
 * Projects a geographic coordinate onto a route polyline (or start->destination line if no polyline),
 * calculating position along the route (km from start) and perpendicular/road detour distance.
 */
export function projectPointOntoRoute(
  lat: number,
  lon: number,
  polyline: [number, number][],
  cumulativeDistancesKm: number[],
  totalRouteDistanceKm: number
): {
  alongRouteKm: number;
  perpendicularDistanceKm: number;
  estimatedDetourKm: number;
  estimatedDetourDurationMin: number;
  progressFraction: number;
} {
  if (!polyline || polyline.length < 2) {
    return {
      alongRouteKm: 0,
      perpendicularDistanceKm: 0,
      estimatedDetourKm: 0,
      estimatedDetourDurationMin: 0,
      progressFraction: 0
    };
  }

  let minPerpDist = Infinity;
  let bestAlongKm = 0;
  const polyTotal = cumulativeDistancesKm[cumulativeDistancesKm.length - 1] || 1;
  const scaleFactor = totalRouteDistanceKm > 0 && polyTotal > 0 ? totalRouteDistanceKm / polyTotal : 1;

  for (let i = 0; i < polyline.length - 1; i++) {
    const [latA, lonA] = polyline[i];
    const [latB, lonB] = polyline[i + 1];

    const dx = lonB - lonA;
    const dy = latB - latA;
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 1e-12) {
      t = ((lon - lonA) * dx + (lat - latA) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }

    const projLat = latA + t * dy;
    const projLon = lonA + t * dx;

    const perpDist = calculateDistanceKm(lat, lon, projLat, projLon);
    if (perpDist < minPerpDist) {
      minPerpDist = perpDist;
      const segStartKm = cumulativeDistancesKm[i] || 0;
      const segEndKm = cumulativeDistancesKm[i + 1] || segStartKm;
      bestAlongKm = (segStartKm + t * (segEndKm - segStartKm)) * scaleFactor;
    }
  }

  const clampedAlong = Math.max(
    0,
    Math.min(totalRouteDistanceKm, Number(bestAlongKm.toFixed(1)))
  );
  // Round-trip road detour from highway exit to charger and back (2x perpendicular * 1.25 road winding factor)
  const estimatedDetourKm = Number((minPerpDist * 2.3).toFixed(1));
  const estimatedDetourDurationMin = Math.round((estimatedDetourKm / 42) * 60);
  const progressFraction =
    totalRouteDistanceKm > 0 ? Math.min(1, Math.max(0, clampedAlong / totalRouteDistanceKm)) : 0;

  return {
    alongRouteKm: clampedAlong,
    perpendicularDistanceKm: Number(minPerpDist.toFixed(1)),
    estimatedDetourKm,
    estimatedDetourDurationMin,
    progressFraction
  };
}

/**
 * Scores a candidate charger for selection near a target route position.
 */
function scoreCandidateCharger(
  station: EligibleChargerRecord,
  alongRouteKm: number,
  detourKm: number,
  idealTargetKm: number,
  intelligence: ChargerIntelligenceSummary,
  preferredTypes?: ChargerPlugType[]
): number {
  let score = 100;

  // 1. Proximity to ideal target interval position along route
  const distanceFromTarget = Math.abs(alongRouteKm - idealTargetKm);
  score -= distanceFromTarget * 0.85;

  // 2. Detour penalty (prefer chargers right on the highway corridor)
  score -= detourKm * 2.2;

  // 3. Community report intelligence
  if (intelligence.confidenceLabel === 'RECENTLY REPORTED WORKING') {
    score += 28;
  } else if (intelligence.confidenceLabel === 'MIXED REPORTS') {
    score -= 8;
  } else if (intelligence.confidenceLabel === 'RECENT ISSUE REPORTED') {
    score -= 55;
  }

  // 4. Stored operational status
  if (station.operatingStatus === 'Operational') {
    score += 10;
  } else if (station.operatingStatus === 'Degraded') {
    score -= 25;
  } else if (
    station.operatingStatus === 'Offline' ||
    station.operatingStatus === 'Temporarily Inaccessible'
  ) {
    score -= 80;
  }

  // 5. Access conditions
  if (station.accessConditions === 'Public 24/7') {
    score += 12;
  } else if (station.accessConditions === 'Commercial Hours Only') {
    score += 4;
  } else {
    score -= 10;
  }

  // 6. Power & Supernova preference
  const plugType = station.chargerType || (station.isSupernova ? 'Supernova' : 'Socket');
  if (plugType === 'Supernova') score += 16;
  else if (plugType === 'Type 6' || plugType === 'Type 2') score += 10;
  else score += 5;

  if (preferredTypes && preferredTypes.length > 0) {
    if (preferredTypes.includes(plugType)) {
      score += 20;
    } else {
      score -= 15;
    }
  }

  return Number(score.toFixed(2));
}

export interface PlanAutoPilotRouteInput {
  startLocation: RouteCoordinate;
  destination: RouteCoordinate;
  routePolyline?: [number, number][];
  roadDistanceKm?: number | null;
  roadDurationMin?: number | null;
  routingAvailable: boolean;
  routingLimitationNote?: string;
  allStations: EligibleChargerRecord[];
  reports: ChargerCommunityReport[];
  targetIntervalKm?: number;
  preferredChargerTypes?: ChargerPlugType[];
  manualAddedStationIds?: string[];
  removedStationIds?: string[];
  replacedStopMap?: Record<string, string>; // originalId -> replacementId
  reachedStopIds?: Record<string, string>; // stationId -> timestamp
  confirmedChargedIds?: Record<string, string>; // stationId -> timestamp
  pitStops?: PlannedPitStop[];
  rangeGuard?: RangeGuardConfig;
  previousPlannedStationIds?: string[];
}

export interface PlanAutoPilotRouteResult {
  valid: boolean;
  error?: string;
  chargingStops: PlannedChargingStop[];
  pitStops: PlannedPitStop[];
  briefing: MissionBriefingData;
  navigationStages: NavigationStage[];
  eligibleCorridorChargers: {
    station: EligibleChargerRecord;
    alongRouteKm: number;
    detourDistanceKm: number;
    intelligence: ChargerIntelligenceSummary;
  }[];
}

/**
 * Detects if any charger previously selected in a mission has been unpublished, deleted,
 * rejected, or received a recent FAULTY/INACCESSIBLE community report.
 */
export function detectIneligiblePlannedChargers(
  plannedStationIds: string[],
  allStations: EligibleChargerRecord[],
  reports: ChargerCommunityReport[]
): string[] {
  const alerts: string[] = [];
  if (!Array.isArray(plannedStationIds) || plannedStationIds.length === 0) return alerts;

  const byId = new Map((allStations || []).map(s => [s.id, s]));
  for (const id of plannedStationIds) {
    const st = byId.get(id);
    if (!st) {
      alerts.push(
        `Previously planned charger (${id}) was removed from the database. Route has been recalculated using active approved chargers.`
      );
      continue;
    }
    if (!isPubliclyPublishedCharger(st)) {
      alerts.push(
        `Charger "${st.name}" is no longer approved/published (${st.approvalStatus || 'unpublished'}) and has been excluded from the active mission.`
      );
      continue;
    }
    const intel = evaluateChargerIntelligence(st.id, reports);
    if (intel.hasRecentIssue) {
      alerts.push(
        `Charger "${st.name}" has a recent community issue report (${intel.latestReport?.category}). Review its backup charger options before takeoff.`
      );
    }
  }
  return alerts;
}

/**
 * Core intelligent charging-stop planner & mission briefing generator.
 * Adapts to dense networks (~100 km intervals), sparse networks (earlier stepping-stone stops),
 * short trips (zero unnecessary stops), and off-route detours.
 */
export function planAutoPilotMission(
  input: PlanAutoPilotRouteInput
): PlanAutoPilotRouteResult {
  const {
    startLocation,
    destination,
    routePolyline,
    roadDistanceKm,
    roadDurationMin,
    routingAvailable,
    routingLimitationNote,
    allStations,
    reports,
    targetIntervalKm = DEFAULT_TARGET_INTERVAL_KM,
    preferredChargerTypes = [],
    manualAddedStationIds = [],
    removedStationIds = [],
    replacedStopMap = {},
    reachedStopIds = {},
    confirmedChargedIds = {},
    pitStops = [],
    rangeGuard = { enabled: false },
    previousPlannedStationIds = []
  } = input;

  const geodesicDistKm = calculateDistanceKm(
    startLocation.latitude,
    startLocation.longitude,
    destination.latitude,
    destination.longitude
  );

  const effectivePoly: [number, number][] =
    routePolyline && routePolyline.length >= 2
      ? routePolyline
      : [
          [startLocation.latitude, startLocation.longitude],
          [destination.latitude, destination.longitude]
        ];

  const baseDistanceKm =
    routingAvailable && typeof roadDistanceKm === 'number' && roadDistanceKm > 0
      ? Number(roadDistanceKm.toFixed(1))
      : geodesicDistKm;

  const baseDurationMin =
    routingAvailable && typeof roadDurationMin === 'number' && roadDurationMin > 0
      ? Math.round(roadDurationMin)
      : null;

  const generalRangeDisclaimer =
    'Advertised or nominal motorcycle range does not guarantee a safe journey. A 100 km stop interval is a planning preference — actual battery consumption depends on riding speed, elevation gain, wind, ambient temperature, payload, and battery health.';

  if (geodesicDistKm < 0.3) {
    const emptyRg: RangeGuardEvaluation = {
      enabled: Boolean(rangeGuard?.enabled),
      effectiveSafeLegKm: null,
      firstLegMaxKm: null,
      warnings: [],
      disclaimer:
        'Estimates are based on rider-entered values, not live motorcycle battery telemetry.'
    };
    return {
      valid: false,
      error:
        'Starting location and destination are identical or less than 300 metres apart. Please select two distinct locations.',
      chargingStops: [],
      pitStops: [],
      eligibleCorridorChargers: [],
      navigationStages: [],
      briefing: {
        startLocation,
        destination,
        totalDrivingDistanceKm: 0,
        baseDirectDrivingDistanceKm: 0,
        estimatedDrivingDurationMin: null,
        routingSource: routingAvailable
          ? 'OSRM Driving Route'
          : 'Geodesic Fallback (Routing Service Unavailable)',
        routingAvailable,
        routingLimitationNote,
        selectedStopsCount: 0,
        orderedStopNames: [],
        segments: [],
        totalDetourDistanceKm: 0,
        estimatedDetourDurationMin: null,
        longestGapKm: 0,
        unusuallyLongGaps: [],
        chargerReportWarnings: [],
        ineligibleChargerAlerts: [],
        rangeGuardEvaluation: emptyRg,
        generalRangeDisclaimer
      }
    };
  }

  const clampedIntervalKm = Math.max(40, Math.min(220, Number(targetIntervalKm) || 100));

  // If Range Guard specifies an estimated usable range smaller than targetIntervalKm, respect it
  let effectiveTargetStepKm = clampedIntervalKm;
  if (
    rangeGuard?.enabled &&
    typeof rangeGuard.estimatedUsableRangeKm === 'number' &&
    rangeGuard.estimatedUsableRangeKm > 20
  ) {
    const reserve = Math.max(0, Number(rangeGuard.reserveRangeKm) || 15);
    const safeLeg = Math.max(30, rangeGuard.estimatedUsableRangeKm - reserve);
    effectiveTargetStepKm = Math.min(clampedIntervalKm, safeLeg);
  }

  const eligibleStations = getEligibleAutoPilotChargers(allStations);
  const ineligibleChargerAlerts = detectIneligiblePlannedChargers(
    previousPlannedStationIds,
    allStations,
    reports
  );

  const cumDistances = computePolylineCumulativeDistances(effectivePoly);

  // Project all eligible stations onto the route
  // Maximum practical corridor detour threshold: 45 km perpendicular (~95 km round-trip detour)
  const MAX_CORRIDOR_PERP_KM = Math.min(50, Math.max(25, baseDistanceKm * 0.28));

  const projectedCandidates = eligibleStations
    .map(station => {
      const proj = projectPointOntoRoute(
        station.latitude,
        station.longitude,
        effectivePoly,
        cumDistances,
        baseDistanceKm
      );
      const intelligence = evaluateChargerIntelligence(station.id, reports);
      return {
        station,
        alongRouteKm: proj.alongRouteKm,
        perpendicularDistanceKm: proj.perpendicularDistanceKm,
        detourDistanceKm: proj.estimatedDetourKm,
        estimatedDetourDurationMin: routingAvailable ? proj.estimatedDetourDurationMin : null,
        intelligence
      };
    })
    .filter(c => {
      // Include if within corridor or explicitly added by user
      if (manualAddedStationIds.includes(c.station.id)) return true;
      if (Object.values(replacedStopMap).includes(c.station.id)) return true;
      return (
        c.perpendicularDistanceKm <= MAX_CORRIDOR_PERP_KM &&
        c.alongRouteKm >= 2 &&
        c.alongRouteKm <= Math.max(baseDistanceKm - 2, 2)
      );
    })
    .sort((a, b) => a.alongRouteKm - b.alongRouteKm);

  const removedSet = new Set(removedStationIds);
  const selectedCandidatesMap = new Map<string, (typeof projectedCandidates)[number]>();

  // Scenario C: Destination reachable without another stop
  const needsAutomaticStops = baseDistanceKm > effectiveTargetStepKm * 1.08;

  if (needsAutomaticStops) {
    const activePool = projectedCandidates.filter(c => !removedSet.has(c.station.id));
    let currentPosKm = 0;
    const usedIds = new Set<string>();

    // Stepping algorithm along the route from 0 to baseDistanceKm
    let safetyCounter = 0;
    while (baseDistanceKm - currentPosKm > effectiveTargetStepKm * 1.08 && safetyCounter < 25) {
      safetyCounter++;
      const idealNextKm = currentPosKm + effectiveTargetStepKm;
      const minWindowKm = currentPosKm + Math.max(18, effectiveTargetStepKm * 0.55);
      const maxWindowKm = currentPosKm + effectiveTargetStepKm * 1.28;

      // Scenario A: Look for candidates inside the primary target window [minWindowKm, maxWindowKm]
      const windowCandidates = activePool.filter(
        c =>
          !usedIds.has(c.station.id) &&
          c.alongRouteKm >= minWindowKm &&
          c.alongRouteKm <= maxWindowKm
      );

      if (windowCandidates.length > 0) {
        let best = windowCandidates[0];
        let bestScore = -Infinity;
        for (const cand of windowCandidates) {
          const sc = scoreCandidateCharger(
            cand.station,
            cand.alongRouteKm,
            cand.detourDistanceKm,
            idealNextKm,
            cand.intelligence,
            preferredChargerTypes
          );
          if (sc > bestScore) {
            bestScore = sc;
            best = cand;
          }
        }
        selectedCandidatesMap.set(best.station.id, best);
        usedIds.add(best.station.id);
        currentPosKm = best.alongRouteKm;
        continue;
      }

      // Scenario B (Sparse Network): No charger in [minWindowKm, maxWindowKm].
      // Check if there is an earlier stepping-stone charger in (currentPosKm + 8, minWindowKm)
      // that reduces the gap to the next charger or destination.
      const earlierSteppingStones = activePool.filter(
        c =>
          !usedIds.has(c.station.id) &&
          c.alongRouteKm > currentPosKm + 8 &&
          c.alongRouteKm < minWindowKm
      );

      if (earlierSteppingStones.length > 0) {
        // Pick the furthest-along stepping stone with acceptable reliability
        const bestSteppingStone =
          earlierSteppingStones[earlierSteppingStones.length - 1];
        selectedCandidatesMap.set(bestSteppingStone.station.id, bestSteppingStone);
        usedIds.add(bestSteppingStone.station.id);
        currentPosKm = bestSteppingStone.alongRouteKm;
        continue;
      }

      // Otherwise look for the next available charger beyond maxWindowKm
      const laterCandidates = activePool.filter(
        c => !usedIds.has(c.station.id) && c.alongRouteKm > maxWindowKm
      );
      if (laterCandidates.length > 0) {
        const nextClosest = laterCandidates[0];
        selectedCandidatesMap.set(nextClosest.station.id, nextClosest);
        usedIds.add(nextClosest.station.id);
        currentPosKm = nextClosest.alongRouteKm;
      } else {
        break;
      }
    }
  }

  // Apply user replacements (replacedStopMap: oldId -> newId)
  for (const [oldId, newId] of Object.entries(replacedStopMap)) {
    if (selectedCandidatesMap.has(oldId)) {
      selectedCandidatesMap.delete(oldId);
    }
    if (!removedSet.has(newId)) {
      const replacementCand = projectedCandidates.find(c => c.station.id === newId);
      if (replacementCand) {
        selectedCandidatesMap.set(newId, replacementCand);
      }
    }
  }

  // Apply manual additions
  for (const manualId of manualAddedStationIds) {
    if (!removedSet.has(manualId)) {
      const found = projectedCandidates.find(c => c.station.id === manualId);
      if (found) {
        selectedCandidatesMap.set(manualId, found);
      }
    }
  }

  // Sort selected stops strictly in driving order along the route
  const orderedSelected = Array.from(selectedCandidatesMap.values()).sort(
    (a, b) => a.alongRouteKm - b.alongRouteKm
  );

  // Build backup charger options for each selected stop
  const chargingStops: PlannedChargingStop[] = orderedSelected.map((sel, idx) => {
    const prevAlongKm = idx === 0 ? 0 : orderedSelected[idx - 1].alongRouteKm;
    const nextAlongKm =
      idx === orderedSelected.length - 1
        ? baseDistanceKm
        : orderedSelected[idx + 1].alongRouteKm;

    const legFromPrev = Math.max(
      1,
      Number((sel.alongRouteKm - prevAlongKm + sel.detourDistanceKm * 0.5).toFixed(1))
    );
    const legToNext = Math.max(
      1,
      Number((nextAlongKm - sel.alongRouteKm + sel.detourDistanceKm * 0.5).toFixed(1))
    );

    // Find eligible backup chargers near this route segment that are not already primary stops
    const backups: BackupChargerOption[] = projectedCandidates
      .filter(cand => {
        if (cand.station.id === sel.station.id) return false;
        if (selectedCandidatesMap.has(cand.station.id)) return false;
        const routeDelta = Math.abs(cand.alongRouteKm - sel.alongRouteKm);
        return routeDelta <= 45;
      })
      .map(cand => {
        const directFromPrimary = calculateDistanceKm(
          sel.station.latitude,
          sel.station.longitude,
          cand.station.latitude,
          cand.station.longitude
        );
        const plug = cand.station.chargerType || (cand.station.isSupernova ? 'Supernova' : 'Socket');
        const reasonParts: string[] = [];
        if (Math.abs(cand.alongRouteKm - sel.alongRouteKm) <= 15) {
          reasonParts.push('Covers the same highway corridor segment');
        } else if (cand.alongRouteKm < sel.alongRouteKm) {
          reasonParts.push(
            `Earlier fallback at KM ${cand.alongRouteKm} before primary stop`
          );
        } else {
          reasonParts.push(`Forward fallback at KM ${cand.alongRouteKm} along route`);
        }
        if (cand.intelligence.confidenceLabel === 'RECENTLY REPORTED WORKING') {
          reasonParts.push('Recently reported working by community');
        }
        reasonParts.push(`${plug} (${cand.station.powerOutputKw} kW)`);

        return {
          station: cand.station,
          distanceFromPrimaryKm: directFromPrimary,
          detourDistanceKm: cand.detourDistanceKm,
          estimatedDetourDurationMin: cand.estimatedDetourDurationMin,
          routePositionKm: cand.alongRouteKm,
          intelligence: cand.intelligence,
          reason: reasonParts.join(' • ')
        };
      })
      .sort((a, b) => a.distanceFromPrimaryKm - b.distanceFromPrimaryKm)
      .slice(0, 3);

    const isManual = manualAddedStationIds.includes(sel.station.id);
    let selectionReason = isManual
      ? 'Manually selected by pilot'
      : `Selected near KM ${sel.alongRouteKm} (${sel.detourDistanceKm} km detour)`;
    if (sel.intelligence.confidenceLabel === 'RECENTLY REPORTED WORKING') {
      selectionReason += ' • Community verified working';
    }

    return {
      station: sel.station,
      order: idx + 1,
      distanceFromStartKm: sel.alongRouteKm,
      distanceFromPrevStopKm: legFromPrev,
      distanceToNextStopKm: legToNext,
      detourDistanceKm: sel.detourDistanceKm,
      estimatedDetourDurationMin: sel.estimatedDetourDurationMin,
      selectionReason,
      isManuallyAdded: isManual,
      intelligence: sel.intelligence,
      backupChargers: backups,
      reached: Boolean(reachedStopIds[sel.station.id]),
      reachedAt: reachedStopIds[sel.station.id],
      chargingConfirmed: Boolean(confirmedChargedIds[sel.station.id]),
      chargingConfirmedAt: confirmedChargedIds[sel.station.id]
    };
  });

  // Project Pit Stops onto route
  const projectedPitStops: PlannedPitStop[] = (pitStops || [])
    .map(ps => {
      const proj = projectPointOntoRoute(
        ps.latitude,
        ps.longitude,
        effectivePoly,
        cumDistances,
        baseDistanceKm
      );
      return {
        ...ps,
        distanceFromStartKm: proj.alongRouteKm,
        detourDistanceKm: proj.estimatedDetourKm,
        estimatedDetourDurationMin: routingAvailable ? proj.estimatedDetourDurationMin : null,
        includedInNavigation: ps.includedInNavigation !== false
      };
    })
    .sort((a, b) => a.distanceFromStartKm - b.distanceFromStartKm);

  // Compute segments between charging stops (and destination) for Mission Briefing & Range Guard
  const segments: RouteSegmentBrief[] = [];
  const unusuallyLongGaps: { fromName: string; toName: string; distanceKm: number }[] = [];
  let longestGapKm = 0;

  const stopPoints: {
    name: string;
    alongKm: number;
    detourKm: number;
    stopType: 'charger' | 'destination';
  }[] = [
    ...chargingStops.map(cs => ({
      name: cs.station.name,
      alongKm: cs.distanceFromStartKm,
      detourKm: cs.detourDistanceKm,
      stopType: 'charger' as const
    })),
    {
      name: destination.name,
      alongKm: baseDistanceKm,
      detourKm: 0,
      stopType: 'destination' as const
    }
  ];

  let prevName = startLocation.name;
  let prevKm = 0;

  for (const sp of stopPoints) {
    const rawGap = Math.max(0.5, sp.alongKm - prevKm + sp.detourKm * 0.5);
    const segDistKm = Number(rawGap.toFixed(1));
    const segDurationMin =
      baseDurationMin !== null && baseDistanceKm > 0
        ? Math.max(1, Math.round((segDistKm / baseDistanceKm) * baseDurationMin))
        : null;
    const isLongGap = segDistKm > Math.max(UNUSUALLY_LONG_GAP_THRESHOLD_KM, clampedIntervalKm * 1.3);

    segments.push({
      fromName: prevName,
      toName: sp.name,
      distanceKm: segDistKm,
      durationMin: segDurationMin,
      isLongGap,
      stopType: sp.stopType
    });

    if (segDistKm > longestGapKm) {
      longestGapKm = segDistKm;
    }
    if (isLongGap) {
      unusuallyLongGaps.push({
        fromName: prevName,
        toName: sp.name,
        distanceKm: segDistKm
      });
    }

    prevName = sp.name;
    prevKm = sp.alongKm;
  }

  const totalChargerDetourKm = chargingStops.reduce((acc, s) => acc + s.detourDistanceKm, 0);
  const totalPitStopDetourKm = projectedPitStops
    .filter(p => p.includedInNavigation)
    .reduce((acc, p) => acc + p.detourDistanceKm, 0);
  const totalDetourDistanceKm = Number((totalChargerDetourKm + totalPitStopDetourKm).toFixed(1));

  const totalDrivingDistanceKm = Number((baseDistanceKm + totalDetourDistanceKm).toFixed(1));
  const estimatedDetourDurationMin = routingAvailable
    ? Math.round((totalDetourDistanceKm / 42) * 60)
    : null;
  const estimatedDrivingDurationMin =
    baseDurationMin !== null && estimatedDetourDurationMin !== null
      ? baseDurationMin + estimatedDetourDurationMin
      : baseDurationMin;

  // Charger report warnings
  const chargerReportWarnings: string[] = [];
  for (const cs of chargingStops) {
    if (cs.intelligence.hasRecentIssue) {
      chargerReportWarnings.push(
        `Stop #${cs.order} (${cs.station.name}): ${cs.intelligence.shortSummary}`
      );
    } else if (cs.intelligence.confidenceLabel === 'MIXED REPORTS') {
      chargerReportWarnings.push(
        `Stop #${cs.order} (${cs.station.name}): ${cs.intelligence.shortSummary}`
      );
    }
  }

  // Sparse network warning
  let networkSparseWarning: string | undefined;
  if (baseDistanceKm > clampedIntervalKm * 1.15 && chargingStops.length === 0) {
    networkSparseWarning =
      eligibleStations.length === 0
        ? 'No approved and published chargers exist in the GHOST PROTOCOL database yet.'
        : `No approved chargers were found within the ${Math.round(MAX_CORRIDOR_PERP_KM)} km corridor along this ${baseDistanceKm} km route. Plan alternative charging arrangements before departing.`;
  } else if (unusuallyLongGaps.length > 0) {
    networkSparseWarning = `Sparse charger coverage detected: ${unusuallyLongGaps.length} route segment(s) exceed ${ Math.round(Math.max(UNUSUALLY_LONG_GAP_THRESHOLD_KM, clampedIntervalKm * 1.3)) } km (longest gap: ${longestGapKm} km). Ride in Glide/Combat mode and carry your portable charger.`;
  }

  // Range Guard evaluation
  const rgWarnings: RangeGuardLegWarning[] = [];
  let effectiveSafeLegKm: number | null = null;
  let firstLegMaxKm: number | null = null;

  if (rangeGuard?.enabled) {
    const usableRange = Number(rangeGuard.estimatedUsableRangeKm) || 0;
    const reserveKm = Math.max(0, Number(rangeGuard.reserveRangeKm) || 0);
    const startSoc =
      typeof rangeGuard.startingBatteryPercent === 'number' &&
      rangeGuard.startingBatteryPercent > 0 &&
      rangeGuard.startingBatteryPercent <= 100
        ? rangeGuard.startingBatteryPercent
        : 100;

    if (usableRange > 0) {
      effectiveSafeLegKm = Math.max(10, Number((usableRange - reserveKm).toFixed(1)));
      firstLegMaxKm = Math.max(
        5,
        Number(((usableRange * (startSoc / 100)) - reserveKm).toFixed(1))
      );

      segments.forEach((seg, idx) => {
        const limitForLeg = idx === 0 && firstLegMaxKm !== null ? firstLegMaxKm : effectiveSafeLegKm!;
        const rawMaxWithoutReserve =
          idx === 0 ? Number((usableRange * (startSoc / 100)).toFixed(1)) : usableRange;

        if (seg.distanceKm > limitForLeg) {
          const isCritical = seg.distanceKm > rawMaxWithoutReserve;
          // Look for an earlier unselected eligible charger along this leg
          const segStartKm = idx === 0 ? 0 : chargingStops[idx - 1]?.distanceFromStartKm || 0;
          const segEndKm =
            idx < chargingStops.length
              ? chargingStops[idx].distanceFromStartKm
              : baseDistanceKm;

          const earlierCandidate = projectedCandidates.find(
            c =>
              !selectedCandidatesMap.has(c.station.id) &&
              c.alongRouteKm > segStartKm + 5 &&
              c.alongRouteKm <= segStartKm + limitForLeg &&
              c.alongRouteKm < segEndKm - 5
          );

          rgWarnings.push({
            legIndex: idx + 1,
            fromName: seg.fromName,
            toName: seg.toName,
            legDistanceKm: seg.distanceKm,
            effectiveLimitKm: limitForLeg,
            severity: isCritical ? 'critical' : 'warning',
            message: isCritical
              ? `Leg #${idx + 1} (${seg.fromName} → ${seg.toName}: ${seg.distanceKm} km) exceeds your estimated total range (${rawMaxWithoutReserve} km).`
              : `Leg #${idx + 1} (${seg.fromName} → ${seg.toName}: ${seg.distanceKm} km) encroaches into your ${reserveKm} km safety reserve (safe threshold: ${limitForLeg} km).`,
            recommendedEarlierCharger: earlierCandidate?.station
          });
        }
      });
    }
  }

  const rangeGuardEvaluation: RangeGuardEvaluation = {
    enabled: Boolean(rangeGuard?.enabled),
    startingBatteryPercent: rangeGuard?.startingBatteryPercent,
    estimatedUsableRangeKm: rangeGuard?.estimatedUsableRangeKm,
    reserveRangeKm: rangeGuard?.reserveRangeKm,
    effectiveSafeLegKm,
    firstLegMaxKm,
    warnings: rgWarnings,
    disclaimer:
      'Range Guard calculations are estimates based strictly on rider-entered battery and range values, not live motorcycle telemetry. Road gradient, headwinds, speed, and battery temperature can reduce actual range.'
  };

  const navigationStages = buildAutoPilotNavigationStages(
    startLocation,
    chargingStops,
    projectedPitStops.filter(p => p.includedInNavigation),
    destination
  );

  return {
    valid: true,
    chargingStops,
    pitStops: projectedPitStops,
    eligibleCorridorChargers: projectedCandidates.map(c => ({
      station: c.station,
      alongRouteKm: c.alongRouteKm,
      detourDistanceKm: c.detourDistanceKm,
      intelligence: c.intelligence
    })),
    navigationStages,
    briefing: {
      startLocation,
      destination,
      totalDrivingDistanceKm,
      baseDirectDrivingDistanceKm: baseDistanceKm,
      estimatedDrivingDurationMin,
      routingSource: routingAvailable
        ? 'OSRM Driving Route'
        : 'Geodesic Fallback (Routing Service Unavailable)',
      routingAvailable,
      routingLimitationNote,
      selectedStopsCount: chargingStops.length,
      orderedStopNames: chargingStops.map(s => s.station.name),
      segments,
      totalDetourDistanceKm,
      estimatedDetourDurationMin,
      longestGapKm,
      unusuallyLongGaps,
      chargerReportWarnings,
      ineligibleChargerAlerts,
      networkSparseWarning,
      rangeGuardEvaluation,
      generalRangeDisclaimer
    }
  };
}

/**
 * Builds external Google Maps navigation stages reusing the exact URL convention of
 * `buildChargerNavigationUrl`. Automatically splits trips into sequential stages if
 * total intermediate waypoints exceed `maxWaypointsPerStage` (default 8), never dropping stops.
 */
export function buildAutoPilotNavigationStages(
  startLocation: RouteCoordinate,
  chargingStops: PlannedChargingStop[],
  pitStops: PlannedPitStop[],
  destination: RouteCoordinate,
  maxWaypointsPerStage: number = MAX_GOOGLE_MAPS_WAYPOINTS
): NavigationStage[] {
  // Combine charging stops and pit stops in travel distance order
  type OrderedStopItem = {
    name: string;
    latitude: number;
    longitude: number;
    alongKm: number;
    kind: 'charger' | 'pitstop';
  };

  const combinedIntermediate: OrderedStopItem[] = [
    ...chargingStops.map(cs => ({
      name: cs.station.name,
      latitude: cs.station.latitude,
      longitude: cs.station.longitude,
      alongKm: cs.distanceFromStartKm,
      kind: 'charger' as const
    })),
    ...pitStops
      .filter(ps => ps.includedInNavigation !== false)
      .map(ps => ({
        name: `${ps.name} (Pit Stop)`,
        latitude: ps.latitude,
        longitude: ps.longitude,
        alongKm: ps.distanceFromStartKm,
        kind: 'pitstop' as const
      }))
  ].sort((a, b) => a.alongKm - b.alongKm);

  // If 0 intermediate stops, reuse buildChargerNavigationUrl directly from start to destination
  if (combinedIntermediate.length === 0) {
    const singleUrl = buildChargerNavigationUrl(
      {
        latitude: destination.latitude,
        longitude: destination.longitude,
        name: destination.name
      },
      {
        latitude: startLocation.latitude,
        longitude: startLocation.longitude
      }
    );
    return [
      {
        stageNumber: 1,
        totalStages: 1,
        label: 'Complete Route (Direct)',
        originName: startLocation.name,
        destinationName: destination.name,
        waypointNames: [],
        url: singleUrl,
        instruction: 'Opens external Google Maps turn-by-turn directions from Start to Destination.'
      }
    ];
  }

  // All points in sequence: [Start, ...Intermediate, Destination]
  const allChainPoints: { name: string; latitude: number; longitude: number }[] = [
    {
      name: startLocation.name,
      latitude: startLocation.latitude,
      longitude: startLocation.longitude
    },
    ...combinedIntermediate,
    {
      name: destination.name,
      latitude: destination.latitude,
      longitude: destination.longitude
    }
  ];

  // Each stage has 1 origin, up to `maxWaypointsPerStage` intermediate points, and 1 stage destination.
  // That means each stage advances by at most `maxWaypointsPerStage + 1` edges in `allChainPoints`.
  const stepAdvance = Math.max(1, maxWaypointsPerStage + 1);
  const stages: NavigationStage[] = [];
  let cursor = 0;

  while (cursor < allChainPoints.length - 1) {
    const nextCursor = Math.min(allChainPoints.length - 1, cursor + stepAdvance);
    const stageOrigin = allChainPoints[cursor];
    const stageDest = allChainPoints[nextCursor];
    const stageIntermediates = allChainPoints.slice(cursor + 1, nextCursor);

    // Construct URL starting from buildChargerNavigationUrl(stageDest, stageOrigin)
    const baseUrl = buildChargerNavigationUrl(stageDest, stageOrigin);
    let finalUrl = baseUrl;
    if (stageIntermediates.length > 0) {
      const wpStr = stageIntermediates
        .map(w => `${Number(w.latitude).toFixed(6)},${Number(w.longitude).toFixed(6)}`)
        .join('|');
      const parsed = new URL(baseUrl);
      parsed.searchParams.set('waypoints', wpStr);
      finalUrl = parsed.toString();
    }

    stages.push({
      stageNumber: stages.length + 1,
      totalStages: 0, // updated below
      label: '',
      originName: stageOrigin.name,
      destinationName: stageDest.name,
      waypointNames: stageIntermediates.map(w => w.name),
      url: finalUrl,
      instruction: ''
    });

    cursor = nextCursor;
  }

  const totalStages = stages.length;
  return stages.map(st => ({
    ...st,
    totalStages,
    label:
      totalStages === 1
        ? `Complete Route (${st.waypointNames.length} Stop${st.waypointNames.length === 1 ? '' : 's'})`
        : `Stage ${st.stageNumber} of ${totalStages}: ${st.originName} → ${st.destinationName}`,
    instruction:
      totalStages === 1
        ? 'Opens external Google Maps with your starting point, all planned stops in order, and final destination.'
        : st.stageNumber < totalStages
        ? `Open Stage ${st.stageNumber} first. Upon reaching "${st.destinationName}", return here and launch Stage ${st.stageNumber + 1}.`
        : `Final navigation stage to "${st.destinationName}".`
  }));
}

/**
 * Identifies the next unreached charging stop and constructs its external Google Maps URL
 * using the existing `buildChargerNavigationUrl` helper.
 */
export function resolveNextChargerNavigation(
  startLocation: RouteCoordinate,
  chargingStops: PlannedChargingStop[],
  gpsOrigin?: { latitude: number; longitude: number } | null
): {
  allReached: boolean;
  nextStop: PlannedChargingStop | null;
  url: string | null;
  originDescription: string;
} {
  const nextStop = chargingStops.find(s => !s.reached) || null;
  if (!nextStop) {
    return {
      allReached: chargingStops.length > 0,
      nextStop: null,
      url: null,
      originDescription: 'All planned charging stops have been marked as reached.'
    };
  }

  if (
    gpsOrigin &&
    isFinite(gpsOrigin.latitude) &&
    isFinite(gpsOrigin.longitude)
  ) {
    return {
      allReached: false,
      nextStop,
      url: buildChargerNavigationUrl(nextStop.station, gpsOrigin),
      originDescription: `Using your permissioned GPS location (${gpsOrigin.latitude.toFixed(4)}°N, ${gpsOrigin.longitude.toFixed(4)}°E) as origin.`
    };
  }

  // Find the most recently reached stop prior to nextStop, or fall back to startLocation
  const priorStops = chargingStops.filter(s => s.order < nextStop.order && s.reached);
  const lastReached = priorStops.length > 0 ? priorStops[priorStops.length - 1] : null;
  const fallbackOrigin = lastReached
    ? {
        latitude: lastReached.station.latitude,
        longitude: lastReached.station.longitude,
        name: lastReached.station.name
      }
    : {
        latitude: startLocation.latitude,
        longitude: startLocation.longitude,
        name: startLocation.name
      };

  return {
    allReached: false,
    nextStop,
    url: buildChargerNavigationUrl(nextStop.station, fallbackOrigin),
    originDescription: `Using confirmed waypoint "${fallbackOrigin.name}" as origin (browser GPS not active — you may adjust origin in Google Maps).`
  };
}

/**
 * Discovers real rider pit stops (restaurants, cafes, fuel/rest areas, hotels, landmarks)
 * near the planned route corridor using verified OSM places and external search results.
 */
export function discoverCorridorPitStops(
  polyline: [number, number][],
  totalRouteDistanceKm: number,
  categoryFilter: string = 'ALL',
  externalPlaces: PlaceSuggestion[] = []
): PlannedPitStop[] {
  if (!polyline || polyline.length < 2 || totalRouteDistanceKm <= 0) return [];
  const cumDistances = computePolylineCumulativeDistances(polyline);
  const pool = [...VERIFIED_INDIA_PLACES_DIRECTORY, ...externalPlaces];

  const seenIds = new Set<string>();
  const results: PlannedPitStop[] = [];

  for (const place of pool) {
    if (!place || seenIds.has(place.id)) continue;
    seenIds.add(place.id);

    // Exclude pure EV charging stations from Pit Stops (those belong in Charging Stops)
    const catLower = (place.category || '').toLowerCase();
    if (catLower === 'ev charging station' || catLower === 'ev charging station & hub') {
      continue;
    }

    if (categoryFilter && categoryFilter !== 'ALL') {
      const f = categoryFilter.toLowerCase();
      if (!catLower.includes(f) && !place.name.toLowerCase().includes(f)) {
        continue;
      }
    }

    const proj = projectPointOntoRoute(
      place.latitude,
      place.longitude,
      polyline,
      cumDistances,
      totalRouteDistanceKm
    );

    if (
      proj.perpendicularDistanceKm <= 20 &&
      proj.alongRouteKm >= 3 &&
      proj.alongRouteKm <= Math.max(3, totalRouteDistanceKm - 3)
    ) {
      results.push({
        id: place.id,
        name: place.name,
        address: place.address,
        category: place.category,
        latitude: place.latitude,
        longitude: place.longitude,
        distanceFromStartKm: proj.alongRouteKm,
        detourDistanceKm: proj.estimatedDetourKm,
        estimatedDetourDurationMin: proj.estimatedDetourDurationMin,
        includedInNavigation: true
      });
    }
  }

  return results.sort((a, b) => a.distanceFromStartKm - b.distanceFromStartKm);
}
