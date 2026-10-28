// GHOST PROTOCOL — AUTO PILOT Electric Motorcycle Trip Planner Pure Logic Engine
// Uses OpenStreetMap road routing geometry, real approved GHOST PROTOCOL chargers,
// community report confidence scoring, backup charger identification, Range Guard,
// and external Google Maps navigation stage generation.

import {
  calculateDistanceKm,
  isPubliclyPublishedCharger,
  buildChargerNavigationUrl,
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
  reporterCallsign: string; // Public callsign/first name only; no private account data
  category: ChargerReportCategory;
  comment?: string;
  createdAt: string; // Server-generated ISO timestamp
}

export interface ChargerConfidenceSummary {
  chargerId: string;
  confidenceLabel: ChargerConfidenceLabel;
  latestReport: ChargerCommunityReport | null;
  recentPositiveUserCount: number;
  recentNegativeUserCount: number;
  totalReportCount: number;
  statusSummary: string;
  sourceLabel: 'Community Report';
  disclaimer: string;
  hasRecentIssue: boolean;
}

export interface AutoPilotLocationPoint {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface AutoPilotChargerRecord {
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
  verifiedByAdmin: boolean;
  approvalStatus?: 'approved' | 'pending' | 'rejected' | 'deleted';
  published?: boolean;
  operatingStatus: string;
  accessConditions: string;
  pricing?: string;
  lastVerifiedDate: string;
  userNotes?: string;
  reportedBy?: string;
}

export type PitStopCategory =
  | 'Restaurant'
  | 'Cafe'
  | 'Restroom'
  | 'Hotel'
  | 'Rest Area'
  | 'Scenic Viewpoint'
  | 'Tourist Attraction';

export interface AutoPilotPitStop {
  id: string;
  name: string;
  address: string;
  category: PitStopCategory | string;
  latitude: number;
  longitude: number;
  distanceAlongRouteKm?: number;
  distanceFromRouteKm?: number;
  detourDistanceKm?: number;
  detourDurationMin?: number;
}

export interface PlannedBackupCharger {
  charger: AutoPilotChargerRecord;
  distanceAlongRouteKm: number;
  detourDistanceKm: number;
  detourDurationMin: number;
  confidence: ChargerConfidenceSummary;
  reason: string;
}

export interface PlannedChargingStop {
  orderIndex: number; // 1-based
  charger: AutoPilotChargerRecord;
  distanceFromStartKm: number;
  segmentDistanceFromPrevKm: number;
  estimatedSegmentMinutes: number;
  detourDistanceKm: number;
  detourDurationMin: number;
  confidence: ChargerConfidenceSummary;
  selectionReason: string;
  backups: PlannedBackupCharger[];
  reached?: boolean;
  reachedAt?: string;
  chargingConfirmed?: boolean;
}

export interface RouteSegmentDetail {
  fromLabel: string;
  toLabel: string;
  distanceKm: number;
  estimatedDurationMin: number;
  isLongGap: boolean;
  exceedsRangeGuard: boolean;
  warningMessage?: string;
}

export interface RangeGuardConfig {
  enabled: boolean;
  currentBatteryPercent?: number;
  estimatedUsableRangeKm?: number;
  preferredReservePercent?: number;
}

export interface RangeGuardEvaluation {
  enabled: boolean;
  effectiveFirstLegRangeKm: number | null;
  effectiveSubsequentLegRangeKm: number | null;
  flaggedSegments: {
    segmentIndex: number;
    fromLabel: string;
    toLabel: string;
    segmentDistanceKm: number;
    availableRangeKm: number;
    warning: string;
    recommendedEarlierCharger?: AutoPilotChargerRecord;
  }[];
  overallWarning: string | null;
  disclaimer: string;
}

export interface NavigationStage {
  stageNumber: number;
  totalStages: number;
  stageLabel: string;
  originLabel: string;
  destinationLabel: string;
  waypointNames: string[];
  googleMapsUrl: string;
  instruction: string;
}

export interface MissionBriefingPlan {
  startLocation: AutoPilotLocationPoint;
  destination: AutoPilotLocationPoint;
  routingProvider: string;
  totalDrivingDistanceKm: number;
  baseRouteDistanceKm: number;
  estimatedDrivingTimeMin: number;
  totalDetourDistanceKm: number;
  estimatedDetourTimeMin: number;
  chargingStops: PlannedChargingStop[];
  pitStops: AutoPilotPitStop[];
  segments: RouteSegmentDetail[];
  longestGapKm: number;
  unusuallyLongGaps: RouteSegmentDetail[];
  chargerReportWarnings: string[];
  networkDensityStatus: 'DENSE' | 'MODERATE' | 'SPARSE' | 'DIRECT_REACHABLE' | 'NO_ELIGIBLE_CHARGERS';
  networkSummaryNote: string;
  rangeGuard: RangeGuardEvaluation;
  routeLimitations: string[];
  routeGeometry: [number, number][]; // [lat, lng][]
  navigationStages: NavigationStage[];
  ineligibleRemovedChargerIds: string[];
}

export interface SavedAutoPilotMission {
  id: string;
  userId: string;
  ownerName: string;
  missionName: string;
  createdAt: string;
  updatedAt: string;
  departureDateTime?: string;
  startLocation: AutoPilotLocationPoint;
  destination: AutoPilotLocationPoint;
  targetIntervalKm: number;
  rangeGuardConfig?: RangeGuardConfig;
  tripPreferences?: string;
  plannedDistanceKm: number;
  estimatedDurationMin: number;
  plannedChargerIds: string[];
  chargingStopsSnapshot: {
    chargerId: string;
    name: string;
    address: string;
    chargerType?: string;
    distanceFromStartKm: number;
    detourDistanceKm: number;
    reached: boolean;
    reachedAt?: string;
    chargingConfirmed: boolean;
  }[];
  pitStops: AutoPilotPitStop[];
  status: 'Planned' | 'In Progress' | 'Completed';
  riderNotes: string;
  isFavourite: boolean;
  sharing: {
    isShared: boolean;
    sharedWithUserIds: string[]; // specific GHOST PROTOCOL member IDs
    shareMeetingPoint: boolean;
    meetingPoint?: string;
    shareDepartureTime: boolean;
    sharePitStops: boolean;
    groupNotes?: string;
  };
}

// ============================================================================
// 1. LIVE CHARGER INTELLIGENCE & COMMUNITY REPORT CONFIDENCE ENGINE
// ============================================================================

const RECENT_REPORT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RECENT_ISSUE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export function validateChargerReportSubmission(input: {
  chargerId?: unknown;
  category?: unknown;
  comment?: unknown;
}): {
  valid: boolean;
  chargerId?: string;
  category?: ChargerReportCategory;
  comment?: string;
  error?: string;
} {
  const chargerId = typeof input.chargerId === 'string' ? input.chargerId.trim() : '';
  if (!chargerId) {
    return { valid: false, error: 'Charger ID is required.' };
  }

  const category = typeof input.category === 'string' ? input.category.trim() : '';
  if (!VALID_CHARGER_REPORT_CATEGORIES.includes(category as ChargerReportCategory)) {
    return {
      valid: false,
      error: 'Report category must be WORKING, FAULTY, INACCESSIBLE, or SUCCESSFULLY CHARGED.'
    };
  }

  const rawComment = typeof input.comment === 'string' ? input.comment.trim() : '';
  if (rawComment.length > 280) {
    return {
      valid: false,
      error: 'Report comment must be 280 characters or fewer.'
    };
  }

  return {
    valid: true,
    chargerId,
    category: category as ChargerReportCategory,
    comment: rawComment || undefined
  };
}

/**
 * Computes a charger's confidence label and summary from community reports.
 * Deduplicates by userId within the recency window so repeated reports from a single user
 * cannot dominate confidence calculations.
 */
export function evaluateChargerCommunityConfidence(
  chargerId: string,
  reports: ChargerCommunityReport[],
  nowMs: number = Date.now()
): ChargerConfidenceSummary {
  const disclaimer =
    'Community Report — Not live hardware telemetry; operational status may have changed.';

  const forCharger = (Array.isArray(reports) ? reports : [])
    .filter(r => r && r.chargerId === chargerId && r.createdAt)
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (forCharger.length === 0) {
    return {
      chargerId,
      confidenceLabel: 'NO RECENT REPORTS',
      latestReport: null,
      recentPositiveUserCount: 0,
      recentNegativeUserCount: 0,
      totalReportCount: 0,
      statusSummary: 'No community reports logged yet.',
      sourceLabel: 'Community Report',
      disclaimer,
      hasRecentIssue: false
    };
  }

  const latestReport = forCharger[0];
  const recentReports = forCharger.filter(r => {
    const ageMs = nowMs - new Date(r.createdAt).getTime();
    return ageMs >= -60000 && ageMs <= RECENT_REPORT_WINDOW_MS;
  });

  if (recentReports.length === 0) {
    return {
      chargerId,
      confidenceLabel: 'NO RECENT REPORTS',
      latestReport,
      recentPositiveUserCount: 0,
      recentNegativeUserCount: 0,
      totalReportCount: forCharger.length,
      statusSummary: `Last report (${latestReport.category}) is over 30 days old.`,
      sourceLabel: 'Community Report',
      disclaimer,
      hasRecentIssue: false
    };
  }

  // Deduplicate by userId: keep only each user's most recent report in the 30-day window
  const latestByUser = new Map<string, ChargerCommunityReport>();
  for (const rep of recentReports) {
    const uid = rep.userId || rep.id;
    if (!latestByUser.has(uid)) {
      latestByUser.set(uid, rep);
    }
  }

  let positiveUsers = 0;
  let negativeUsers = 0;

  for (const rep of latestByUser.values()) {
    if (rep.category === 'WORKING' || rep.category === 'SUCCESSFULLY CHARGED') {
      positiveUsers++;
    } else if (rep.category === 'FAULTY' || rep.category === 'INACCESSIBLE') {
      negativeUsers++;
    }
  }

  const latestAgeMs = nowMs - new Date(latestReport.createdAt).getTime();
  const latestIsNegative =
    latestReport.category === 'FAULTY' || latestReport.category === 'INACCESSIBLE';
  const latestIsRecentIssue = latestIsNegative && latestAgeMs <= RECENT_ISSUE_WINDOW_MS;

  let confidenceLabel: ChargerConfidenceLabel = 'NO RECENT REPORTS';
  let hasRecentIssue = false;

  if (positiveUsers > 0 && negativeUsers === 0) {
    confidenceLabel = 'RECENTLY REPORTED WORKING';
  } else if (negativeUsers > 0 && positiveUsers === 0) {
    confidenceLabel = 'RECENT ISSUE REPORTED';
    hasRecentIssue = true;
  } else if (positiveUsers > 0 && negativeUsers > 0) {
    if (latestIsRecentIssue && negativeUsers >= positiveUsers) {
      confidenceLabel = 'RECENT ISSUE REPORTED';
      hasRecentIssue = true;
    } else {
      confidenceLabel = 'MIXED REPORTS';
      hasRecentIssue = latestIsRecentIssue;
    }
  }

  const latestDateStr = latestReport.createdAt.replace('T', ' ').slice(0, 16);
  const statusSummary = `Latest: ${latestReport.category} (${latestDateStr} UTC)${
    latestReport.comment ? ` — "${latestReport.comment}"` : ''
  }`;

  return {
    chargerId,
    confidenceLabel,
    latestReport,
    recentPositiveUserCount: positiveUsers,
    recentNegativeUserCount: negativeUsers,
    totalReportCount: forCharger.length,
    statusSummary,
    sourceLabel: 'Community Report',
    disclaimer,
    hasRecentIssue
  };
}

// ============================================================================
// 2. ROUTE POLYLINE GEOMETRY & PROJECTION MATH
// ============================================================================

export function computePolylineCumulativeDistances(routeGeometry: [number, number][]): number[] {
  if (!Array.isArray(routeGeometry) || routeGeometry.length === 0) return [];
  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < routeGeometry.length; i++) {
    const [lat1, lng1] = routeGeometry[i - 1];
    const [lat2, lng2] = routeGeometry[i];
    total += calculateDistanceKm(lat1, lng1, lat2, lng2);
    cum.push(Number(total.toFixed(3)));
  }
  return cum;
}

/**
 * Projects a geographic coordinate (lat, lng) onto a driving route polyline
 * to determine its exact position along the road route and perpendicular off-route distance.
 */
export function projectPointOntoRoutePolyline(
  pointLat: number,
  pointLng: number,
  routeGeometry: [number, number][],
  cumulativeDistances?: number[]
): {
  distanceAlongRouteKm: number;
  offRouteDistanceKm: number;
  nearestSegmentIndex: number;
} {
  if (!Array.isArray(routeGeometry) || routeGeometry.length === 0) {
    return { distanceAlongRouteKm: 0, offRouteDistanceKm: Infinity, nearestSegmentIndex: 0 };
  }

  const cum = cumulativeDistances || computePolylineCumulativeDistances(routeGeometry);

  if (routeGeometry.length === 1) {
    const d = calculateDistanceKm(pointLat, pointLng, routeGeometry[0][0], routeGeometry[0][1]);
    return { distanceAlongRouteKm: 0, offRouteDistanceKm: d, nearestSegmentIndex: 0 };
  }

  let bestOffRouteKm = Infinity;
  let bestAlongKm = 0;
  let bestIndex = 0;

  for (let i = 0; i < routeGeometry.length - 1; i++) {
    const [latA, lngA] = routeGeometry[i];
    const [latB, lngB] = routeGeometry[i + 1];

    // Local equirectangular approximation for segment projection parameter t in [0, 1]
    const cosLat = Math.cos(((latA + latB) * 0.5 * Math.PI) / 180);
    const dx = (lngB - lngA) * cosLat;
    const dy = latB - latA;
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 1e-12) {
      const px = (pointLng - lngA) * cosLat;
      const py = pointLat - latA;
      t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
    }

    const projLat = latA + t * (latB - latA);
    const projLng = lngA + t * (lngB - lngA);
    const offDist = calculateDistanceKm(pointLat, pointLng, projLat, projLng);
    const segLen = cum[i + 1] - cum[i];
    const alongDist = cum[i] + t * segLen;

    if (offDist < bestOffRouteKm) {
      bestOffRouteKm = offDist;
      bestAlongKm = alongDist;
      bestIndex = i;
    }
  }

  return {
    distanceAlongRouteKm: Number(bestAlongKm.toFixed(1)),
    offRouteDistanceKm: Number(bestOffRouteKm.toFixed(2)),
    nearestSegmentIndex: bestIndex
  };
}

// ============================================================================
// 3. INTELLIGENT CHARGING-STOP PLANNER & RANGE GUARD ENGINE
// ============================================================================

export interface PlanAutoPilotInput {
  startLocation: AutoPilotLocationPoint;
  destination: AutoPilotLocationPoint;
  routeGeometry: [number, number][];
  baseRouteDistanceKm: number;
  baseRouteDurationMin: number;
  routingProvider: string;
  allStations: AutoPilotChargerRecord[];
  chargerReports: ChargerCommunityReport[];
  targetIntervalKm?: number;
  maxCorridorDetourKm?: number;
  rangeGuard?: RangeGuardConfig;
  manualAddedChargerIds?: string[];
  removedChargerIds?: string[];
  replacedChargerMap?: Record<string, string>; // originalChargerId -> replacementChargerId
  pitStops?: AutoPilotPitStop[];
  previouslyPlannedChargerIds?: string[];
  nowMs?: number;
}

/**
 * Filters a list of stations to only eligible, approved, published GHOST PROTOCOL chargers
 * with valid numeric coordinates.
 */
export function filterEligibleAutoPilotChargers(
  stations: AutoPilotChargerRecord[]
): AutoPilotChargerRecord[] {
  if (!Array.isArray(stations)) return [];
  return stations.filter(s => {
    if (!isPubliclyPublishedCharger(s)) return false;
    if (
      typeof s.latitude !== 'number' ||
      typeof s.longitude !== 'number' ||
      !isFinite(s.latitude) ||
      !isFinite(s.longitude) ||
      s.latitude < -90 ||
      s.latitude > 90 ||
      s.longitude < -180 ||
      s.longitude > 180
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Core intelligent charging-stop selection, backup charger identification,
 * pit-stop routing, and Mission Briefing calculation.
 */
export function planAutoPilotMission(input: PlanAutoPilotInput): MissionBriefingPlan {
  const nowMs = input.nowMs || Date.now();
  const rawTargetInterval = Number(input.targetIntervalKm) || 100;
  const targetIntervalKm = Math.max(40, Math.min(220, rawTargetInterval));
  const maxCorridorOffRouteKm = Number(input.maxCorridorDetourKm) || 25;

  const eligibleChargers = filterEligibleAutoPilotChargers(input.allStations);
  const eligibleIdSet = new Set(eligibleChargers.map(c => c.id));

  // Detect any previously planned chargers that became unpublished, rejected, or removed
  const ineligibleRemovedChargerIds = (input.previouslyPlannedChargerIds || []).filter(
    id => !eligibleIdSet.has(id)
  );

  const routeGeometry: [number, number][] =
    Array.isArray(input.routeGeometry) && input.routeGeometry.length >= 2
      ? input.routeGeometry
      : [
          [input.startLocation.latitude, input.startLocation.longitude],
          [input.destination.latitude, input.destination.longitude]
        ];

  const cumDistances = computePolylineCumulativeDistances(routeGeometry);
  const polyLengthKm = cumDistances[cumDistances.length - 1] || 0;
  const baseRouteDistanceKm = Number(
    (input.baseRouteDistanceKm > 0 ? input.baseRouteDistanceKm : polyLengthKm).toFixed(1)
  );
  const baseRouteDurationMin = Math.max(
    1,
    Math.round(
      input.baseRouteDurationMin > 0
        ? input.baseRouteDurationMin
        : (baseRouteDistanceKm / 55) * 60
    )
  );
  const avgSpeedKmPerMin = baseRouteDistanceKm / Math.max(1, baseRouteDurationMin);

  // Project all eligible chargers onto the driving route
  interface ProjectedCandidate {
    charger: AutoPilotChargerRecord;
    distanceAlongRouteKm: number;
    offRouteDistanceKm: number;
    detourDistanceKm: number;
    detourDurationMin: number;
    confidence: ChargerConfidenceSummary;
    baseUtilityScore: number;
  }

  const removedSet = new Set(input.removedChargerIds || []);
  const manualSet = new Set(input.manualAddedChargerIds || []);
  const replacements = input.replacedChargerMap || {};

  const allProjected: ProjectedCandidate[] = eligibleChargers.map(charger => {
    const proj = projectPointOntoRoutePolyline(
      charger.latitude,
      charger.longitude,
      routeGeometry,
      cumDistances
    );
    // Road detour is round-trip from highway exit to charger and back (~2.3x perpendicular distance)
    const detourDistanceKm =
      proj.offRouteDistanceKm <= 0.4
        ? 0.2
        : Number((proj.offRouteDistanceKm * 2.3).toFixed(1));
    const detourDurationMin = Math.max(
      1,
      Math.round(detourDistanceKm / Math.max(0.55, avgSpeedKmPerMin * 0.75))
    );
    const confidence = evaluateChargerCommunityConfidence(
      charger.id,
      input.chargerReports,
      nowMs
    );

    // Base quality score from power/type, access, and community report confidence
    let baseUtilityScore = 50;
    if (charger.chargerType === 'Supernova' || charger.isSupernova) baseUtilityScore += 22;
    else if (charger.chargerType === 'Type 6') baseUtilityScore += 14;
    else if (charger.chargerType === 'Type 2') baseUtilityScore += 10;
    else baseUtilityScore += 6;

    if (charger.accessConditions === 'Public 24/7') baseUtilityScore += 8;
    if (confidence.confidenceLabel === 'RECENTLY REPORTED WORKING') baseUtilityScore += 18;
    else if (confidence.confidenceLabel === 'MIXED REPORTS') baseUtilityScore -= 6;
    else if (confidence.confidenceLabel === 'RECENT ISSUE REPORTED') baseUtilityScore -= 32;

    // Penalize detour distance
    baseUtilityScore -= detourDistanceKm * 1.4;

    return {
      charger,
      distanceAlongRouteKm: proj.distanceAlongRouteKm,
      offRouteDistanceKm: proj.offRouteDistanceKm,
      detourDistanceKm,
      detourDurationMin,
      confidence,
      baseUtilityScore
    };
  });

  // Corridor candidates: within maxCorridorOffRouteKm (or slightly wider 38km if sparse/needed)
  // and positioned between start (> 1.5 km) and destination (< baseRouteDistanceKm - 1.5 km)
  const corridorCandidates = allProjected
    .filter(c => {
      if (manualSet.has(c.charger.id)) return true;
      if (removedSet.has(c.charger.id)) return false;
      const withinBuffer =
        c.distanceAlongRouteKm >= Math.min(2, baseRouteDistanceKm * 0.03) &&
        c.distanceAlongRouteKm <= Math.max(baseRouteDistanceKm - 2, baseRouteDistanceKm * 0.97);
      return withinBuffer && c.offRouteDistanceKm <= maxCorridorOffRouteKm;
    })
    .sort((a, b) => a.distanceAlongRouteKm - b.distanceAlongRouteKm);

  // Determine effective first-leg and subsequent-leg range if Range Guard is configured
  const rg = input.rangeGuard;
  let effectiveFirstLegMaxKm = targetIntervalKm;
  if (rg?.enabled && rg.estimatedUsableRangeKm && rg.estimatedUsableRangeKm > 0) {
    const reservePct = Math.max(0, Math.min(50, Number(rg.preferredReservePercent) || 0));
    const usableAfterReserve = rg.estimatedUsableRangeKm * (1 - reservePct / 100);
    effectiveFirstLegMaxKm = Math.min(targetIntervalKm, Math.max(30, usableAfterReserve));
  }

  const selectedCandidates: { candidate: ProjectedCandidate; reason: string }[] = [];

  // Scenario C: Destination reachable without a charging stop
  const canReachDirectly =
    baseRouteDistanceKm <= Math.max(effectiveFirstLegMaxKm, targetIntervalKm * 1.08) &&
    manualSet.size === 0;

  if (!canReachDirectly && corridorCandidates.length > 0) {
    let currentKm = 0;
    let isFirstLeg = true;
    const usedIds = new Set<string>();

    while (true) {
      const targetLegKm = isFirstLeg ? effectiveFirstLegMaxKm : targetIntervalKm;
      const remainingToDestKm = baseRouteDistanceKm - currentKm;

      // If destination is comfortably reachable from current position, stop adding chargers
      if (remainingToDestKm <= targetLegKm * 1.08) {
        break;
      }

      const ahead = corridorCandidates.filter(
        c => !usedIds.has(c.charger.id) && c.distanceAlongRouteKm > currentKm + 3
      );

      if (ahead.length === 0) {
        break;
      }

      // Ideal window around targetLegKm: [0.55 * target, 1.25 * target]
      const minIdealAhead = currentKm + targetLegKm * 0.55;
      const maxIdealAhead = currentKm + targetLegKm * 1.25;

      const inIdealWindow = ahead.filter(
        c => c.distanceAlongRouteKm >= minIdealAhead && c.distanceAlongRouteKm <= maxIdealAhead
      );

      let chosen: ProjectedCandidate | null = null;
      let reason = '';

      if (inIdealWindow.length > 0) {
        // Dense or well-spaced corridor: score candidates in the target window
        let bestScore = -Infinity;
        for (const cand of inIdealWindow) {
          const distFromCurrent = cand.distanceAlongRouteKm - currentKm;
          const intervalDelta = Math.abs(distFromCurrent - targetLegKm);
          let score = cand.baseUtilityScore - intervalDelta * 0.55;

          // Lookahead bonus: does picking this charger avoid a huge gap to the next charger/destination?
          const nextAfterCand = ahead.find(
            n => n.distanceAlongRouteKm > cand.distanceAlongRouteKm + 8
          );
          const nextGap = nextAfterCand
            ? nextAfterCand.distanceAlongRouteKm - cand.distanceAlongRouteKm
            : baseRouteDistanceKm - cand.distanceAlongRouteKm;
          if (nextGap <= targetIntervalKm * 1.25) {
            score += 15;
          } else if (nextGap > targetIntervalKm * 1.6) {
            score -= (nextGap - targetIntervalKm) * 0.3;
          }

          if (score > bestScore) {
            bestScore = score;
            chosen = cand;
          }
        }
        if (chosen) {
          const segDist = Math.round(chosen.distanceAlongRouteKm - currentKm);
          reason = `Selected near ${targetIntervalKm} km target interval (${segDist} km segment, ${chosen.detourDistanceKm} km detour).`;
        }
      } else {
        // Sparse network adaptation:
        // Check if there are chargers before minIdealAhead (closer than 55% of target)
        // vs chargers beyond maxIdealAhead
        const beforeIdeal = ahead.filter(c => c.distanceAlongRouteKm < minIdealAhead);
        const afterIdeal = ahead.filter(c => c.distanceAlongRouteKm > maxIdealAhead);

        if (beforeIdeal.length > 0) {
          // Pick the furthest high-utility charger before the gap so the rider tops up before the sparse stretch
          chosen = beforeIdeal[beforeIdeal.length - 1];
          const segDist = Math.round(chosen.distanceAlongRouteKm - currentKm);
          reason = `Sparse corridor ahead — selected useful approved charger at ${segDist} km before long highway gap.`;
        } else if (afterIdeal.length > 0) {
          // Pick the earliest reachable charger after the target interval
          chosen = afterIdeal[0];
          const segDist = Math.round(chosen.distanceAlongRouteKm - currentKm);
          reason = `Sparse corridor — nearest approved charger ahead at ${segDist} km along route.`;
        }
      }

      if (!chosen) break;

      // Apply user replacement if specified
      const replacementId = replacements[chosen.charger.id];
      if (replacementId && eligibleIdSet.has(replacementId) && !usedIds.has(replacementId)) {
        const repCand = allProjected.find(p => p.charger.id === replacementId);
        if (repCand) {
          chosen = repCand;
          reason = 'Rider-selected replacement charging stop.';
        }
      }

      usedIds.add(chosen.charger.id);
      selectedCandidates.push({ candidate: chosen, reason });
      currentKm = chosen.distanceAlongRouteKm;
      isFirstLeg = false;
    }
  }

  // Include any manually added eligible chargers not already in the list
  for (const manualId of manualSet) {
    if (removedSet.has(manualId)) continue;
    if (!selectedCandidates.some(s => s.candidate.charger.id === manualId)) {
      const found = allProjected.find(p => p.charger.id === manualId);
      if (found) {
        selectedCandidates.push({
          candidate: found,
          reason: 'Manually added by rider.'
        });
      }
    }
  }

  // Keep selected chargers strictly in driving order along the route
  selectedCandidates.sort(
    (a, b) => a.candidate.distanceAlongRouteKm - b.candidate.distanceAlongRouteKm
  );

  const selectedIdSet = new Set(selectedCandidates.map(s => s.candidate.charger.id));

  // Build ordered PlannedChargingStop objects with Backup Chargers for each stop
  const chargingStops: PlannedChargingStop[] = [];
  let prevKm = 0;

  for (let idx = 0; idx < selectedCandidates.length; idx++) {
    const { candidate, reason } = selectedCandidates[idx];
    const segKm = Math.max(
      0.5,
      Number((candidate.distanceAlongRouteKm - prevKm).toFixed(1))
    );
    const segMin = Math.max(
      1,
      Math.round(segKm / Math.max(0.4, avgSpeedKmPerMin)) + candidate.detourDurationMin
    );

    // Find up to 2 practical backup chargers for this route segment
    const backupCandidates = allProjected
      .filter(
        b =>
          !selectedIdSet.has(b.charger.id) &&
          !removedSet.has(b.charger.id) &&
          b.offRouteDistanceKm <= maxCorridorOffRouteKm * 1.4 &&
          Math.abs(b.distanceAlongRouteKm - candidate.distanceAlongRouteKm) <=
            Math.max(45, targetIntervalKm * 0.55)
      )
      .sort((a, b) => b.baseUtilityScore - a.baseUtilityScore)
      .slice(0, 2);

    const backups: PlannedBackupCharger[] = backupCandidates.map(b => {
      const deltaKm = Number(
        (b.distanceAlongRouteKm - candidate.distanceAlongRouteKm).toFixed(1)
      );
      const posPhrase =
        deltaKm < -1
          ? `${Math.abs(deltaKm)} km earlier along route`
          : deltaKm > 1
          ? `${deltaKm} km further along route`
          : 'At same route milestone';
      return {
        charger: b.charger,
        distanceAlongRouteKm: b.distanceAlongRouteKm,
        detourDistanceKm: b.detourDistanceKm,
        detourDurationMin: b.detourDurationMin,
        confidence: b.confidence,
        reason: `${posPhrase} (${b.detourDistanceKm} km detour) • ${b.confidence.confidenceLabel}`
      };
    });

    chargingStops.push({
      orderIndex: idx + 1,
      charger: candidate.charger,
      distanceFromStartKm: candidate.distanceAlongRouteKm,
      segmentDistanceFromPrevKm: segKm,
      estimatedSegmentMinutes: segMin,
      detourDistanceKm: candidate.detourDistanceKm,
      detourDurationMin: candidate.detourDurationMin,
      confidence: candidate.confidence,
      selectionReason: reason,
      backups,
      reached: false,
      chargingConfirmed: false
    });

    prevKm = candidate.distanceAlongRouteKm;
  }

  // Project optional pit stops onto route (preserving all charging stops untouched)
  const pitStops: AutoPilotPitStop[] = (input.pitStops || []).map(ps => {
    const proj = projectPointOntoRoutePolyline(
      ps.latitude,
      ps.longitude,
      routeGeometry,
      cumDistances
    );
    const detourKm =
      proj.offRouteDistanceKm <= 0.4
        ? 0.2
        : Number((proj.offRouteDistanceKm * 2.2).toFixed(1));
    const detourMin = Math.max(1, Math.round(detourKm / Math.max(0.5, avgSpeedKmPerMin * 0.75)));
    return {
      ...ps,
      distanceAlongRouteKm: proj.distanceAlongRouteKm,
      distanceFromRouteKm: proj.offRouteDistanceKm,
      detourDistanceKm: detourKm,
      detourDurationMin: detourMin
    };
  });

  // Compute consecutive route segments (Start -> Stop 1 -> ... -> Destination)
  const segments: RouteSegmentDetail[] = [];
  const longGapThresholdKm = Math.max(targetIntervalKm * 1.2, 125);

  // Range Guard thresholds
  const rgEnabled = Boolean(
    rg?.enabled && rg.estimatedUsableRangeKm && rg.estimatedUsableRangeKm > 0
  );
  const reservePct = rgEnabled
    ? Math.max(0, Math.min(50, Number(rg?.preferredReservePercent) || 0))
    : 0;
  const fullUsableRangeKm = rgEnabled ? Number(rg!.estimatedUsableRangeKm) : null;
  const effectiveFirstLegRangeKm =
    rgEnabled && fullUsableRangeKm
      ? Number((fullUsableRangeKm * (1 - reservePct / 100)).toFixed(1))
      : null;
  // After charging at a stop, rider has full usable range minus reserve (or at least 1.2x first leg if starting battery was low)
  const effectiveSubsequentLegRangeKm =
    rgEnabled && fullUsableRangeKm
      ? Number(
          (
            (rg?.currentBatteryPercent && rg.currentBatteryPercent < 80
              ? fullUsableRangeKm / (rg.currentBatteryPercent / 85)
              : fullUsableRangeKm) *
            (1 - reservePct / 100)
          ).toFixed(1)
        )
      : null;

  const flaggedRangeSegments: RangeGuardEvaluation['flaggedSegments'] = [];

  let cursorKm = 0;
  let cursorLabel = input.startLocation.name || 'Starting Point';

  const waypointsForSegments = [
    ...chargingStops.map(cs => ({
      label: cs.charger.name,
      alongKm: cs.distanceFromStartKm,
      detourKm: cs.detourDistanceKm,
      detourMin: cs.detourDurationMin
    })),
    {
      label: input.destination.name || 'Destination',
      alongKm: baseRouteDistanceKm,
      detourKm: 0,
      detourMin: 0
    }
  ];

  waypointsForSegments.forEach((wp, sIdx) => {
    const segDistKm = Number(
      Math.max(0.5, wp.alongKm - cursorKm + wp.detourKm * 0.5).toFixed(1)
    );
    const segDurMin = Math.max(
      1,
      Math.round(segDistKm / Math.max(0.45, avgSpeedKmPerMin)) + wp.detourMin
    );
    const isLongGap = segDistKm > longGapThresholdKm;

    const legAvailableRange =
      sIdx === 0 ? effectiveFirstLegRangeKm : effectiveSubsequentLegRangeKm;
    const exceedsRangeGuard = Boolean(
      rgEnabled && legAvailableRange !== null && segDistKm > legAvailableRange
    );

    let warningMessage: string | undefined;
    if (exceedsRangeGuard && legAvailableRange !== null) {
      warningMessage = `Segment (${segDistKm} km) exceeds estimated safe range (${legAvailableRange} km after ${reservePct}% reserve).`;
      // Look for an earlier approved charger along this segment
      const earlierCand = allProjected.find(
        p =>
          !selectedIdSet.has(p.charger.id) &&
          p.distanceAlongRouteKm > cursorKm + 3 &&
          p.distanceAlongRouteKm - cursorKm <= legAvailableRange
      );
      flaggedRangeSegments.push({
        segmentIndex: sIdx,
        fromLabel: cursorLabel,
        toLabel: wp.label,
        segmentDistanceKm: segDistKm,
        availableRangeKm: legAvailableRange,
        warning: warningMessage,
        recommendedEarlierCharger: earlierCand?.charger
      });
    } else if (isLongGap) {
      warningMessage = `Long gap of ${segDistKm} km exceeds preferred ${targetIntervalKm} km target interval.`;
    }

    segments.push({
      fromLabel: cursorLabel,
      toLabel: wp.label,
      distanceKm: segDistKm,
      estimatedDurationMin: segDurMin,
      isLongGap,
      exceedsRangeGuard,
      warningMessage
    });

    cursorKm = wp.alongKm;
    cursorLabel = wp.label;
  });

  const totalChargerDetourKm = chargingStops.reduce((acc, s) => acc + s.detourDistanceKm, 0);
  const totalPitStopDetourKm = pitStops.reduce((acc, p) => acc + (p.detourDistanceKm || 0), 0);
  const totalDetourDistanceKm = Number((totalChargerDetourKm + totalPitStopDetourKm).toFixed(1));

  const totalChargerDetourMin = chargingStops.reduce((acc, s) => acc + s.detourDurationMin, 0);
  const totalPitStopDetourMin = pitStops.reduce((acc, p) => acc + (p.detourDurationMin || 0), 0);
  const estimatedDetourTimeMin = totalChargerDetourMin + totalPitStopDetourMin;

  const totalDrivingDistanceKm = Number((baseRouteDistanceKm + totalDetourDistanceKm).toFixed(1));
  const estimatedDrivingTimeMin = baseRouteDurationMin + estimatedDetourTimeMin;

  const longestGapKm =
    segments.length > 0 ? Math.max(...segments.map(s => s.distanceKm)) : baseRouteDistanceKm;
  const unusuallyLongGaps = segments.filter(s => s.isLongGap || s.exceedsRangeGuard);

  // Collect community report warnings
  const chargerReportWarnings: string[] = [];
  for (const stop of chargingStops) {
    if (stop.confidence.confidenceLabel === 'RECENT ISSUE REPORTED') {
      chargerReportWarnings.push(
        `${stop.charger.name}: Recent community issue reported (${stop.confidence.latestReport?.category}). Review backup charger options before takeoff.`
      );
    } else if (stop.confidence.confidenceLabel === 'MIXED REPORTS') {
      chargerReportWarnings.push(
        `${stop.charger.name}: Mixed recent community reports. Verify backup charger availability.`
      );
    }
  }

  if (ineligibleRemovedChargerIds.length > 0) {
    chargerReportWarnings.push(
      `${ineligibleRemovedChargerIds.length} previously planned charger(s) were unpublished or removed from the approved database and have been excluded from this refreshed route.`
    );
  }

  // Classify network density
  let networkDensityStatus: MissionBriefingPlan['networkDensityStatus'] = 'MODERATE';
  let networkSummaryNote = '';

  if (canReachDirectly) {
    networkDensityStatus = 'DIRECT_REACHABLE';
    networkSummaryNote = `Destination is ${baseRouteDistanceKm} km away and reachable directly within your ${targetIntervalKm} km planning interval without intermediate charging stops.`;
  } else if (corridorCandidates.length === 0) {
    networkDensityStatus = 'NO_ELIGIBLE_CHARGERS';
    networkSummaryNote = `No approved GHOST PROTOCOL chargers found within ${maxCorridorOffRouteKm} km of this ${baseRouteDistanceKm} km route corridor. Exercise extreme caution or carry portable charging gear.`;
  } else if (corridorCandidates.length >= Math.max(3, (baseRouteDistanceKm / targetIntervalKm) * 1.5)) {
    networkDensityStatus = 'DENSE';
    networkSummaryNote = `Dense charger network (${corridorCandidates.length} approved chargers along corridor). Selected ${chargingStops.length} optimal stop(s) near ~${targetIntervalKm} km intervals while skipping redundant stops.`;
  } else if (unusuallyLongGaps.length > 0) {
    networkDensityStatus = 'SPARSE';
    networkSummaryNote = `Sparse charger network along segments of this route (longest gap: ${longestGapKm} km). Useful approved chargers have been included; review long-gap warnings carefully.`;
  } else {
    networkDensityStatus = 'MODERATE';
    networkSummaryNote = `Selected ${chargingStops.length} approved charging stop(s) in driving order along the ${totalDrivingDistanceKm} km route.`;
  }

  const rangeGuardEvaluation: RangeGuardEvaluation = {
    enabled: rgEnabled,
    effectiveFirstLegRangeKm,
    effectiveSubsequentLegRangeKm,
    flaggedSegments: flaggedRangeSegments,
    overallWarning:
      flaggedRangeSegments.length > 0
        ? `${flaggedRangeSegments.length} route segment(s) exceed your estimated riding range after reserve.`
        : null,
    disclaimer:
      'Estimates are based solely on rider-entered range/battery values, not live motorcycle telemetry. Road gradient, headwind, speed, rider weight, ambient temperature, and battery state of health are not automatically measured.'
  };

  const navigationStages = buildAutoPilotNavigationStages({
    startLocation: input.startLocation,
    destination: input.destination,
    chargingStops,
    pitStops
  });

  const routeLimitations = [
    `Route geometry and distances calculated via ${input.routingProvider}.`,
    'A 100 km target interval is a planning preference, not a guarantee of sufficient battery range under all riding speeds, terrain gradients, payload, or weather conditions.',
    'Community charger reports reflect member submissions and are not live hardware telemetry.'
  ];

  return {
    startLocation: input.startLocation,
    destination: input.destination,
    routingProvider: input.routingProvider,
    totalDrivingDistanceKm,
    baseRouteDistanceKm,
    estimatedDrivingTimeMin,
    totalDetourDistanceKm,
    estimatedDetourTimeMin,
    chargingStops,
    pitStops,
    segments,
    longestGapKm,
    unusuallyLongGaps,
    chargerReportWarnings,
    networkDensityStatus,
    networkSummaryNote,
    rangeGuard: rangeGuardEvaluation,
    routeLimitations,
    routeGeometry,
    navigationStages,
    ineligibleRemovedChargerIds
  };
}

// ============================================================================
// 4. EXTERNAL GOOGLE MAPS NAVIGATION URL & MULTI-STAGE SPLITTER
// ============================================================================

export const MAX_GOOGLE_MAPS_WAYPOINTS = 9;

/**
 * Extends the existing Navigate to Charger Google Maps URL approach (`https://www.google.com/maps/dir/?api=1...`)
 * to support a complete trip with start location, ordered charging stops, optional pit stops, and destination.
 * If the total intermediate stops exceed MAX_GOOGLE_MAPS_WAYPOINTS (9), splits the itinerary into sequential
 * stages without ever dropping a single stop.
 */
export function buildAutoPilotNavigationStages(input: {
  startLocation: AutoPilotLocationPoint;
  destination: AutoPilotLocationPoint;
  chargingStops: PlannedChargingStop[];
  pitStops?: AutoPilotPitStop[];
  includePitStops?: boolean;
  maxWaypointsPerStage?: number;
}): NavigationStage[] {
  const maxWp = Math.max(1, input.maxWaypointsPerStage || MAX_GOOGLE_MAPS_WAYPOINTS);
  const includePits = input.includePitStops !== false;

  interface OrderedStop {
    name: string;
    latitude: number;
    longitude: number;
    alongKm: number;
  }

  const intermediateStops: OrderedStop[] = [
    ...input.chargingStops.map(cs => ({
      name: cs.charger.name,
      latitude: cs.charger.latitude,
      longitude: cs.charger.longitude,
      alongKm: cs.distanceFromStartKm
    })),
    ...(includePits && Array.isArray(input.pitStops)
      ? input.pitStops.map(ps => ({
          name: `${ps.name} (Pit Stop)`,
          latitude: ps.latitude,
          longitude: ps.longitude,
          alongKm: ps.distanceAlongRouteKm ?? 0
        }))
      : [])
  ].sort((a, b) => a.alongKm - b.alongKm);

  // If no intermediate stops, build a single direct stage using the existing helper pattern
  if (intermediateStops.length === 0) {
    const directUrl = buildChargerNavigationUrl(
      {
        latitude: input.destination.latitude,
        longitude: input.destination.longitude,
        name: input.destination.name
      },
      {
        latitude: input.startLocation.latitude,
        longitude: input.startLocation.longitude
      }
    );
    return [
      {
        stageNumber: 1,
        totalStages: 1,
        stageLabel: 'Complete Route',
        originLabel: input.startLocation.name,
        destinationLabel: input.destination.name,
        waypointNames: [],
        googleMapsUrl: directUrl,
        instruction: 'Opens external Google Maps navigation directly from Start to Destination.'
      }
    ];
  }

  // Chain all points: [Start, ...intermediateStops, Destination]
  const allPoints: { name: string; latitude: number; longitude: number }[] = [
    {
      name: input.startLocation.name,
      latitude: input.startLocation.latitude,
      longitude: input.startLocation.longitude
    },
    ...intermediateStops,
    {
      name: input.destination.name,
      latitude: input.destination.latitude,
      longitude: input.destination.longitude
    }
  ];

  // Each stage can cover at most (maxWp + 1) segments:
  // stageOrigin -> up to maxWp intermediate waypoints -> stageDestination
  const stages: NavigationStage[] = [];
  let cursor = 0;

  while (cursor < allPoints.length - 1) {
    const stageOrigin = allPoints[cursor];
    const maxDestIndex = Math.min(allPoints.length - 1, cursor + maxWp + 1);
    const stageDest = allPoints[maxDestIndex];
    const stageWaypoints = allPoints.slice(cursor + 1, maxDestIndex);

    const params = new URLSearchParams({
      api: '1',
      origin: `${Number(stageOrigin.latitude).toFixed(6)},${Number(stageOrigin.longitude).toFixed(6)}`,
      destination: `${Number(stageDest.latitude).toFixed(6)},${Number(stageDest.longitude).toFixed(6)}`,
      travelmode: 'driving'
    });

    if (stageWaypoints.length > 0) {
      const wpParam = stageWaypoints
        .map(w => `${Number(w.latitude).toFixed(6)},${Number(w.longitude).toFixed(6)}`)
        .join('|');
      params.set('waypoints', wpParam);
    }

    stages.push({
      stageNumber: stages.length + 1,
      totalStages: 0, // populated below
      stageLabel: '',
      originLabel: stageOrigin.name,
      destinationLabel: stageDest.name,
      waypointNames: stageWaypoints.map(w => w.name),
      googleMapsUrl: `https://www.google.com/maps/dir/?${params.toString()}`,
      instruction: ''
    });

    cursor = maxDestIndex;
  }

  const totalStages = stages.length;
  return stages.map(s => ({
    ...s,
    totalStages,
    stageLabel:
      totalStages === 1
        ? 'Complete Route'
        : `Stage ${s.stageNumber} of ${totalStages}: ${s.originLabel} → ${s.destinationLabel}`,
    instruction:
      totalStages === 1
        ? `Includes ${ s.waypointNames.length } planned stop(s) in driving order.`
        : s.stageNumber < totalStages
        ? `Navigate Stage ${s.stageNumber} up to ${s.destinationLabel}. Once reached, open Stage ${
            s.stageNumber + 1
          } to continue.`
        : `Final Stage ${s.stageNumber} to ${s.destinationLabel}.`
  }));
}

/**
 * Identifies the next unreached charging stop and constructs its external Google Maps URL
 * using the existing buildChargerNavigationUrl implementation.
 */
export function resolveNextChargerNavigation(input: {
  startLocation: AutoPilotLocationPoint;
  destination: AutoPilotLocationPoint;
  chargingStops: PlannedChargingStop[];
  riderCurrentLocation?: { latitude: number; longitude: number } | null;
}): {
  nextStop: PlannedChargingStop | null;
  allStopsReached: boolean;
  originUsed: 'CURRENT_GPS' | 'PREVIOUS_REACHED_STOP' | 'START_LOCATION';
  originExplanation: string;
  googleMapsUrl: string;
} {
  const unreached = input.chargingStops.find(s => !s.reached) || null;
  const reachedStops = input.chargingStops.filter(s => s.reached);
  const lastReached = reachedStops.length > 0 ? reachedStops[reachedStops.length - 1] : null;

  let originCoords: { latitude: number; longitude: number } = {
    latitude: input.startLocation.latitude,
    longitude: input.startLocation.longitude
  };
  let originUsed: 'CURRENT_GPS' | 'PREVIOUS_REACHED_STOP' | 'START_LOCATION' = 'START_LOCATION';
  let originExplanation = `Origin set to planned starting location (${input.startLocation.name}). Adjust origin in Google Maps if departing from elsewhere.`;

  if (
    input.riderCurrentLocation &&
    isFinite(input.riderCurrentLocation.latitude) &&
    isFinite(input.riderCurrentLocation.longitude)
  ) {
    originCoords = input.riderCurrentLocation;
    originUsed = 'CURRENT_GPS';
    originExplanation = 'Origin set to your permissioned current browser location.';
  } else if (lastReached) {
    originCoords = {
      latitude: lastReached.charger.latitude,
      longitude: lastReached.charger.longitude
    };
    originUsed = 'PREVIOUS_REACHED_STOP';
    originExplanation = `Origin set to last reached stop (${lastReached.charger.name}). Adjust origin in Google Maps if needed.`;
  }

  if (!unreached) {
    const finalUrl = buildChargerNavigationUrl(
      {
        latitude: input.destination.latitude,
        longitude: input.destination.longitude,
        name: input.destination.name
      },
      originCoords
    );
    return {
      nextStop: null,
      allStopsReached: true,
      originUsed,
      originExplanation,
      googleMapsUrl: finalUrl
    };
  }

  const nextUrl = buildChargerNavigationUrl(unreached.charger, originCoords);
  return {
    nextStop: unreached,
    allStopsReached: false,
    originUsed,
    originExplanation,
    googleMapsUrl: nextUrl
  };
}

// ============================================================================
// 5. VERIFIED INDIAN HIGHWAY ROAD CORRIDOR ROUTER (OFFLINE / HERMETIC FALLBACK)
// ============================================================================

interface HighwayNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

const INDIA_HIGHWAY_NODES: HighwayNode[] = [
  { id: 'blr_indiranagar', name: 'Bengaluru Central', lat: 12.9716, lng: 77.5946 },
  { id: 'blr_hebbal', name: 'Hebbal NH 44', lat: 13.0358, lng: 77.597 },
  { id: 'blr_devanahalli', name: 'Devanahalli NH 44', lat: 13.2085, lng: 77.7082 },
  { id: 'chikkaballapur', name: 'Chikkaballapur NH 44', lat: 13.4355, lng: 77.7315 },
  { id: 'anantapur', name: 'Anantapur NH 44', lat: 14.6819, lng: 77.6006 },
  { id: 'kurnool', name: 'Kurnool NH 44', lat: 15.8281, lng: 78.0373 },
  { id: 'hyderabad', name: 'Hyderabad', lat: 17.385, lng: 78.4867 },
  { id: 'blr_krpuram', name: 'KR Puram NH 75', lat: 13.0068, lng: 77.6993 },
  { id: 'hoskote', name: 'Hoskote NH 75', lat: 13.0707, lng: 77.7981 },
  { id: 'kolar', name: 'Kolar NH 75 Bypass', lat: 13.1367, lng: 78.1336 },
  { id: 'mulbagal', name: 'Mulbagal NH 75', lat: 13.165, lng: 78.3936 },
  { id: 'chittoor', name: 'Chittoor Highway', lat: 13.2172, lng: 79.1003 },
  { id: 'vellore', name: 'Vellore NH 48', lat: 12.9165, lng: 79.1325 },
  { id: 'kanchipuram', name: 'Kanchipuram NH 48', lat: 12.8342, lng: 79.7036 },
  { id: 'chennai', name: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { id: 'mahabalipuram', name: 'ECR Mahabalipuram', lat: 12.6208, lng: 80.1945 },
  { id: 'puducherry', name: 'Puducherry ECR', lat: 11.9416, lng: 79.8083 },
  { id: 'blr_ecity', name: 'Electronic City NH 44', lat: 12.8452, lng: 77.6602 },
  { id: 'hosur', name: 'Hosur NH 44', lat: 12.7409, lng: 77.8253 },
  { id: 'krishnagiri', name: 'Krishnagiri NH 44 Junction', lat: 12.5186, lng: 78.2137 },
  { id: 'salem', name: 'Salem NH 44', lat: 11.6643, lng: 78.146 },
  { id: 'coimbatore', name: 'Coimbatore NH 544', lat: 11.0168, lng: 76.9558 },
  { id: 'kochi', name: 'Kochi NH 544', lat: 9.9312, lng: 76.2673 },
  { id: 'blr_kengeri', name: 'Kengeri NH 275', lat: 12.9081, lng: 77.4854 },
  { id: 'ramangara', name: 'Ramanagara NH 275', lat: 12.7209, lng: 77.2799 },
  { id: 'maddur', name: 'Maddur NH 275', lat: 12.5841, lng: 77.0428 },
  { id: 'mandya', name: 'Mandya NH 275', lat: 12.5218, lng: 76.8951 },
  { id: 'mysuru', name: 'Mysuru', lat: 12.2958, lng: 76.6394 },
  { id: 'tumakuru', name: 'Tumakuru NH 48', lat: 13.3379, lng: 77.1173 },
  { id: 'chitradurga', name: 'Chitradurga NH 48', lat: 14.2251, lng: 76.398 },
  { id: 'hubballi', name: 'Hubballi NH 48', lat: 15.3647, lng: 75.124 },
  { id: 'belagavi', name: 'Belagavi NH 48', lat: 15.8497, lng: 74.4977 },
  { id: 'kolhapur', name: 'Kolhapur NH 48', lat: 16.705, lng: 74.2433 },
  { id: 'satara', name: 'Satara NH 48', lat: 17.6805, lng: 74.0183 },
  { id: 'pune', name: 'Pune', lat: 18.5204, lng: 73.8567 },
  { id: 'lonavala', name: 'Lonavala Expressway', lat: 18.7557, lng: 73.4091 },
  { id: 'panvel', name: 'Panvel Navi Mumbai', lat: 18.9894, lng: 73.1175 },
  { id: 'mumbai', name: 'Mumbai Worli', lat: 19.0176, lng: 72.8172 },
  { id: 'delhi', name: 'New Delhi Connaught Place', lat: 28.6315, lng: 77.2167 },
  { id: 'gurugram', name: 'Gurugram NH 48', lat: 28.4595, lng: 77.0266 },
  { id: 'jaipur', name: 'Jaipur NH 48', lat: 26.9124, lng: 75.7873 }
];

const INDIA_HIGHWAY_EDGES: [string, string][] = [
  ['blr_indiranagar', 'blr_hebbal'],
  ['blr_hebbal', 'blr_devanahalli'],
  ['blr_devanahalli', 'chikkaballapur'],
  ['chikkaballapur', 'anantapur'],
  ['anantapur', 'kurnool'],
  ['kurnool', 'hyderabad'],
  ['blr_indiranagar', 'blr_krpuram'],
  ['blr_krpuram', 'hoskote'],
  ['hoskote', 'kolar'],
  ['kolar', 'mulbagal'],
  ['mulbagal', 'chittoor'],
  ['chittoor', 'vellore'],
  ['vellore', 'kanchipuram'],
  ['kanchipuram', 'chennai'],
  ['chennai', 'mahabalipuram'],
  ['mahabalipuram', 'puducherry'],
  ['blr_indiranagar', 'blr_ecity'],
  ['blr_ecity', 'hosur'],
  ['hosur', 'krishnagiri'],
  ['krishnagiri', 'vellore'],
  ['krishnagiri', 'salem'],
  ['salem', 'coimbatore'],
  ['coimbatore', 'kochi'],
  ['blr_indiranagar', 'blr_kengeri'],
  ['blr_kengeri', 'ramangara'],
  ['ramangara', 'maddur'],
  ['maddur', 'mandya'],
  ['mandya', 'mysuru'],
  ['blr_indiranagar', 'tumakuru'],
  ['blr_hebbal', 'tumakuru'],
  ['tumakuru', 'chitradurga'],
  ['chitradurga', 'hubballi'],
  ['hubballi', 'belagavi'],
  ['belagavi', 'kolhapur'],
  ['kolhapur', 'satara'],
  ['satara', 'pune'],
  ['pune', 'lonavala'],
  ['lonavala', 'panvel'],
  ['panvel', 'mumbai'],
  ['delhi', 'gurugram'],
  ['gurugram', 'jaipur']
];

/**
 * Computes a road route using the Verified Indian Highway Graph when external OSRM API
 * is unreachable (e.g., offline container testing), or returns null if routing is unavailable.
 */
export function computeVerifiedHighwayCorridorRoute(
  startLat: number,
  startLng: number,
  destLat: number,
  destLng: number
): {
  distanceKm: number;
  durationMin: number;
  geometry: [number, number][];
  provider: string;
} | null {
  if (
    !isFinite(startLat) ||
    !isFinite(startLng) ||
    !isFinite(destLat) ||
    !isFinite(destLng)
  ) {
    return null;
  }

  const directKm = calculateDistanceKm(startLat, startLng, destLat, destLng);
  if (directKm < 0.2) {
    return null; // Start and destination are identical
  }

  // Find closest highway graph node to start and destination
  let startNode: HighwayNode | null = null;
  let startNodeDist = Infinity;
  let destNode: HighwayNode | null = null;
  let destNodeDist = Infinity;

  for (const node of INDIA_HIGHWAY_NODES) {
    const dS = calculateDistanceKm(startLat, startLng, node.lat, node.lng);
    if (dS < startNodeDist) {
      startNodeDist = dS;
      startNode = node;
    }
    const dD = calculateDistanceKm(destLat, destLng, node.lat, node.lng);
    if (dD < destNodeDist) {
      destNodeDist = dD;
      destNode = node;
    }
  }

  // Run Dijkstra on the highway graph if both start and dest are within 120 km of the Indian highway network
  if (startNode && destNode && startNodeDist <= 120 && destNodeDist <= 120) {
    const adj = new Map<string, { to: string; weight: number }[]>();
    const nodeMap = new Map<string, HighwayNode>();
    for (const n of INDIA_HIGHWAY_NODES) {
      nodeMap.set(n.id, n);
      adj.set(n.id, []);
    }
    for (const [u, v] of INDIA_HIGHWAY_EDGES) {
      const nu = nodeMap.get(u)!;
      const nv = nodeMap.get(v)!;
      const w = calculateDistanceKm(nu.lat, nu.lng, nv.lat, nv.lng) * 1.14; // road winding factor
      adj.get(u)!.push({ to: v, weight: w });
      adj.get(v)!.push({ to: u, weight: w });
    }

    const dist = new Map<string, number>();
    const prev = new Map<string, string | null>();
    const unvisited = new Set<string>();
    for (const n of INDIA_HIGHWAY_NODES) {
      dist.set(n.id, Infinity);
      prev.set(n.id, null);
      unvisited.add(n.id);
    }
    dist.set(startNode.id, 0);

    while (unvisited.size > 0) {
      let u: string | null = null;
      let best = Infinity;
      for (const id of unvisited) {
        const d = dist.get(id)!;
        if (d < best) {
          best = d;
          u = id;
        }
      }
      if (!u || u === destNode.id || best === Infinity) break;
      unvisited.delete(u);

      for (const edge of adj.get(u) || []) {
        if (!unvisited.has(edge.to)) continue;
        const alt = best + edge.weight;
        if (alt < dist.get(edge.to)!) {
          dist.set(edge.to, alt);
          prev.set(edge.to, u);
        }
      }
    }

    const pathNodes: HighwayNode[] = [];
    let curr: string | null = destNode.id;
    if (prev.get(curr) !== null || curr === startNode.id) {
      while (curr) {
        pathNodes.unshift(nodeMap.get(curr)!);
        curr = prev.get(curr) || null;
      }
    }

    if (pathNodes.length > 0) {
      const rawPoints: [number, number][] = [[startLat, startLng]];
      for (const pn of pathNodes) {
        const dFromStart = calculateDistanceKm(startLat, startLng, pn.lat, pn.lng);
        const dFromDest = calculateDistanceKm(destLat, destLng, pn.lat, pn.lng);
        if (dFromStart > 2 && dFromDest > 2) {
          rawPoints.push([pn.lat, pn.lng]);
        }
      }
      rawPoints.push([destLat, destLng]);

      // Interpolate intermediate points every ~8 km along highway segments for smooth polyline projection
      const densified: [number, number][] = [rawPoints[0]];
      let totalRoadKm = 0;
      for (let i = 0; i < rawPoints.length - 1; i++) {
        const [aLat, aLng] = rawPoints[i];
        const [bLat, bLng] = rawPoints[i + 1];
        const segDirect = calculateDistanceKm(aLat, aLng, bLat, bLng);
        totalRoadKm += segDirect * 1.14;
        const steps = Math.max(1, Math.ceil(segDirect / 8));
        for (let s = 1; s <= steps; s++) {
          const frac = s / steps;
          densified.push([
            Number((aLat + (bLat - aLat) * frac).toFixed(6)),
            Number((aLng + (bLng - aLng) * frac).toFixed(6))
          ]);
        }
      }

      const distanceKm = Number(totalRoadKm.toFixed(1));
      const durationMin = Math.max(5, Math.round((distanceKm / 58) * 60));
      return {
        distanceKm,
        durationMin,
        geometry: densified,
        provider: 'OpenStreetMap India Highway Corridor Router'
      };
    }
  }

  return null;
}
