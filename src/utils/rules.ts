// GHOST PROTOCOL - Core Business Rules & Pure Logic Engine

export type BloodGroup =
  | 'A+' | 'A-'
  | 'B+' | 'B-'
  | 'AB+' | 'AB-'
  | 'O+' | 'O-'
  | 'Unknown'
  | 'Prefer not to disclose';

export const VALID_BLOOD_GROUPS: BloodGroup[] = [
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown', 'Prefer not to disclose'
];

export type UserRole = 'owner' | 'admin' | 'verified_member' | 'member' | 'moderator' | 'regular' | 'superadmin' | 'uv_employee';
export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'suspended';

export type PilotNickname = 'F77 PILOT' | 'X47 PILOT';
export const VALID_PILOT_NICKNAMES: PilotNickname[] = ['F77 PILOT', 'X47 PILOT'];

export type AdminPermission =
  | 'moderate_discussions'
  | 'moderate_chargers'
  | 'moderate_modifications'
  | 'moderate_problems'
  | 'moderate_marketplace'
  | 'moderate_service_intel'
  | 'moderate_jet_engineer'
  | 'manage_registrations';

export interface AdminPermissionMeta {
  id: AdminPermission;
  label: string;
  description: string;
}

export const ADMIN_PERMISSIONS_CATALOG: AdminPermissionMeta[] = [
  {
    id: 'moderate_discussions',
    label: 'Community Discussion & Questions Moderation',
    description: 'Pin, edit, or delete discussion threads, questions, and replies.'
  },
  {
    id: 'moderate_chargers',
    label: 'Charger Management & Moderation',
    description: 'Approve, edit, publish, or remove submitted charging stations and condition reports.'
  },
  {
    id: 'moderate_modifications',
    label: 'Modifications Lab Moderation',
    description: 'Edit or remove community modification entries, photos, and product links.'
  },
  {
    id: 'moderate_problems',
    label: 'Priority Issues Moderation',
    description: 'Manage, update status, edit, or remove reported motorcycle issues.'
  },
  {
    id: 'moderate_marketplace',
    label: 'Marketplace Moderation',
    description: 'Edit or remove marketplace listings and photos.'
  },
  {
    id: 'moderate_service_intel',
    label: 'Service Intel & Reviews Moderation',
    description: 'Edit or remove service visit logs and reviews.'
  },
  {
    id: 'moderate_jet_engineer',
    label: 'THE JET ENGINEER Knowledge Moderation',
    description: 'Review, approve, reject, edit, or remove TRAIN knowledge submissions.'
  },
  {
    id: 'manage_registrations',
    label: 'Delegated Member Verification',
    description: 'Approve, verify, or suspend member registration applications.'
  }
];

export const VALID_ADMIN_PERMISSIONS: AdminPermission[] = ADMIN_PERMISSIONS_CATALOG.map(p => p.id);

export const OWNER_ACCOUNT_ID = 'u_admin';
export const OWNER_ACCOUNT_EMAIL = 'abinavthejas2001@gmail.com';

export type RiderStatus =
  | 'Registered'
  | 'Checked In'
  | 'Riding'
  | 'Arrived at Destination'
  | 'Heading Home'
  | 'Reached Home Safely'
  | 'Needs Assistance'
  | 'Status Not Updated';

export type RideStatus =
  | 'Planning'
  | 'Registration Open'
  | 'Full'
  | 'Ready to Depart'
  | 'In Progress'
  | 'Completed'
  | 'Cancelled';

export interface RiderParticipant {
  id: string;
  userId: string;
  displayName: string;
  motorcycleModel: string;
  variant?: string;
  startingPoint?: string;
  shareStartingPoint: boolean;
  intercomStatus: 'Has an intercom' | 'No intercom' | 'Intercom details not specified';
  intercomModel?: string;
  notes?: string;
  status: RiderStatus;
  statusUpdatedAt: string;
  safeArrivalConfirmedAt?: string;
  checklistCompleted: boolean;
}

export interface RideSummaryStats {
  totalRegistered: number;
  checkedIn: number;
  riding: number;
  arrivedDestination: number;
  headingHome: number;
  homeSafe: number;
  needsAssistance: number;
  unconfirmed: number;
  allSafe: boolean;
}

/**
 * Validates distance in kilometers for Mission Mode group rides.
 * Must be a positive finite number greater than 0.
 */
export function validateRideDistance(distanceKm: unknown): { valid: boolean; value?: number; error?: string } {
  const num = typeof distanceKm === 'number' ? distanceKm : Number(distanceKm);
  if (isNaN(num) || !isFinite(num)) {
    return { valid: false, error: 'Distance must be a valid number' };
  }
  if (num <= 0) {
    return { valid: false, error: 'Distance must be greater than 0 km' };
  }
  if (num > 2500) {
    return { valid: false, error: 'Distance exceeds realistic single group-ride range (max 2500 km)' };
  }
  return { valid: true, value: Math.round(num * 10) / 10 };
}

/**
 * Validates blood group against approved privacy-compliant options.
 */
export function isValidBloodGroup(bg: string): bg is BloodGroup {
  return VALID_BLOOD_GROUPS.includes(bg as BloodGroup);
}

/**
 * Checks if user is permitted to access verified owner-only features.
 */
export function canAccessOwnerFeatures(status: VerificationStatus, role: UserRole): boolean {
  if (role === 'owner' || role === 'admin' || role === 'superadmin') return true;
  return status === 'verified' && role !== 'regular';
}

/**
 * Computes safe-arrival and status distribution for Mission Mode ride.
 * Crucial rule: Missing responses must NEVER be automatically assumed safe.
 */
export function calculateRideStatusSummary(participants: RiderParticipant[]): RideSummaryStats {
  let checkedIn = 0;
  let riding = 0;
  let arrivedDestination = 0;
  let headingHome = 0;
  let homeSafe = 0;
  let needsAssistance = 0;
  let unconfirmed = 0;

  for (const p of participants) {
    switch (p.status) {
      case 'Checked In':
        checkedIn++;
        break;
      case 'Riding':
        riding++;
        break;
      case 'Arrived at Destination':
        arrivedDestination++;
        break;
      case 'Heading Home':
        headingHome++;
        break;
      case 'Reached Home Safely':
        homeSafe++;
        break;
      case 'Needs Assistance':
        needsAssistance++;
        break;
      case 'Registered':
      case 'Status Not Updated':
      default:
        unconfirmed++;
        break;
    }
  }

  const totalRegistered = participants.length;
  // All safe only if every single participant has explicitly reached home safely
  const allSafe = totalRegistered > 0 && homeSafe === totalRegistered;

  return {
    totalRegistered,
    checkedIn,
    riding,
    arrivedDestination,
    headingHome,
    homeSafe,
    needsAssistance,
    unconfirmed,
    allSafe
  };
}

/**
 * Determines whether a ride can be finalized, ensuring ride leader is alerted
 * to any outstanding safe-arrival confirmations.
 */
export function evaluateRideCompletion(participants: RiderParticipant[]): {
  canComplete: boolean;
  outstandingCount: number;
  needsAssistanceCount: number;
  warning?: string;
} {
  const summary = calculateRideStatusSummary(participants);
  const outstanding = summary.totalRegistered - summary.homeSafe;

  if (summary.needsAssistance > 0) {
    return {
      canComplete: true,
      outstandingCount: outstanding,
      needsAssistanceCount: summary.needsAssistance,
      warning: `ALERT: ${summary.needsAssistance} rider(s) currently marked as 'Needs Assistance'. Proceed with caution.`
    };
  }

  if (outstanding > 0) {
    return {
      canComplete: true,
      outstandingCount: outstanding,
      needsAssistanceCount: 0,
      warning: `${outstanding} rider(s) have not confirmed 'Reached Home Safely'. Outstanding confirmations will be preserved.`
    };
  }

  return {
    canComplete: true,
    outstandingCount: 0,
    needsAssistanceCount: 0
  };
}

/**
 * Calculates straight-line distance in km using Haversine formula
 */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Checks whether an emergency request is within responder radius.
 */
export function isWithinAssistanceRadius(
  reqLat: number,
  reqLon: number,
  responderLat: number,
  responderLon: number,
  radiusKm = 25
): boolean {
  return calculateDistanceKm(reqLat, reqLon, responderLat, responderLon) <= radiusKm;
}

/**
 * Maps problem severity strings to an exact rank order:
 * 1: Critical
 * 2: High
 * 3: Moderate
 * 4: Low
 * 5: Informational
 */
export function getSeverityRank(severity: string): number {
  const s = (severity || '').toLowerCase();
  if (s.includes('critical')) return 1;
  if (s === 'high') return 2;
  if (s === 'moderate') return 3;
  if (s === 'low') return 4;
  if (s.includes('info') || s === 'informational') return 5;
  return 6;
}

/**
 * Sorts problems by severity in exact order: Critical, High, Moderate, Low, Informational,
 * preserving explicit priorityOrder within each severity tier.
 */
export function sortProblemsBySeverity<T extends { severity: string; priorityOrder?: number }>(problems: T[]): T[] {
  return [...problems].sort((a, b) => {
    const rankDiff = getSeverityRank(a.severity) - getSeverityRank(b.severity);
    if (rankDiff !== 0) return rankDiff;
    const orderA = typeof a.priorityOrder === 'number' ? a.priorityOrder : 9999;
    const orderB = typeof b.priorityOrder === 'number' ? b.priorityOrder : 9999;
    return orderA - orderB;
  });
}

export interface SeedPriorityProblem {
  id: string;
  priorityOrder: number;
  userId: string;
  reporterName: string;
  motorcycleModel: 'X47' | 'F77' | string;
  variant?: string;
  category:
    | 'Battery & Power'
    | 'Motor & Drivetrain'
    | 'Console & Software'
    | 'Braking & ABS'
    | 'Suspension & Chassis'
    | 'Charging System';
  title: string;
  description: string;
  firstObservedDate: string;
  warningMessageOrCode?: string;
  severity: 'Informational' | 'Low' | 'Moderate' | 'High' | 'Critical / Safety-Related';
  isRecurring: boolean;
  troubleshootingAttempted?: string;
  serviceVisits?: string;
  status: 'Reported' | 'Under Investigation' | 'Service Scheduled' | 'Resolved' | 'Recurring';
  updates: {
    id: string;
    authorName: string;
    date: string;
    note: string;
  }[];
  createdAt: string;
}

export const X47_PRIORITY_ISSUES_SEED: SeedPriorityProblem[] = [
  // 🔴 Critical Priority
  {
    id: 'prob_x47_crit_01',
    priorityOrder: 1,
    userId: 'u_admin',
    reporterName: 'X47 Owners Collective',
    motorcycleModel: 'X47',
    variant: 'X47 All Variants',
    category: 'Motor & Drivetrain',
    title: 'Random bike immobilisation while riding, which can be life-threatening at high speeds.',
    description: 'Random bike immobilisation while riding, which can be life-threatening at high speeds.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'CRITICAL PRIORITY • DRIVETRAIN / CUTOFF',
    severity: 'Critical / Safety-Related',
    isRecurring: true,
    status: 'Under Investigation',
    updates: [],
    createdAt: '2026-10-29T10:01:00Z'
  },
  {
    id: 'prob_x47_crit_02',
    priorityOrder: 2,
    userId: 'u_admin',
    reporterName: 'X47 Owners Collective',
    motorcycleModel: 'X47',
    variant: 'X47 All Variants',
    category: 'Motor & Drivetrain',
    title: 'Random instances where the bike’s switches and throttle become unresponsive.',
    description: 'Random instances where the bike’s switches and throttle become unresponsive.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'CRITICAL PRIORITY • SWITCHGEAR & THROTTLE',
    severity: 'Critical / Safety-Related',
    isRecurring: true,
    status: 'Under Investigation',
    updates: [],
    createdAt: '2026-10-29T10:02:00Z'
  },

  // 🟠 High Priority
  {
    id: 'prob_x47_high_01',
    priorityOrder: 3,
    userId: 'u_admin',
    reporterName: 'X47 Owners Collective',
    motorcycleModel: 'X47',
    variant: 'X47 All Variants',
    category: 'Console & Software',
    title: 'Map functionality not working or continuously loading on most bikes.',
    description: 'Map functionality not working or continuously loading on most bikes.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'HIGH PRIORITY • CONSOLE NAVIGATION',
    severity: 'High',
    isRecurring: true,
    status: 'Under Investigation',
    updates: [],
    createdAt: '2026-10-29T10:03:00Z'
  },
  {
    id: 'prob_x47_high_02',
    priorityOrder: 4,
    userId: 'u_admin',
    reporterName: 'X47 Owners Collective',
    motorcycleModel: 'X47',
    variant: 'X47 All Variants',
    category: 'Battery & Power',
    title: 'Bike sometimes refusing to turn on.',
    description: 'Bike sometimes refusing to turn on.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'HIGH PRIORITY • POWER / IGNITION',
    severity: 'High',
    isRecurring: true,
    status: 'Under Investigation',
    updates: [],
    createdAt: '2026-10-29T10:04:00Z'
  },
  {
    id: 'prob_x47_high_03',
    priorityOrder: 5,
    userId: 'u_admin',
    reporterName: 'X47 Owners Collective',
    motorcycleModel: 'X47',
    variant: 'X47 All Variants',
    category: 'Console & Software',
    title: 'App-bike synchronisation issues, with the app unable to fetch bike data reliably.',
    description: 'App-bike synchronisation issues, with the app unable to fetch bike data reliably.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'HIGH PRIORITY • APP-BIKE TELEMETRY SYNC',
    severity: 'High',
    isRecurring: true,
    status: 'Under Investigation',
    updates: [],
    createdAt: '2026-10-29T10:05:00Z'
  },
  {
    id: 'prob_x47_high_04',
    priorityOrder: 6,
    userId: 'u_admin',
    reporterName: 'X47 Owners Collective',
    motorcycleModel: 'X47',
    variant: 'X47 All Variants',
    category: 'Console & Software',
    title: 'New app update causing excessive phone battery drain.',
    description: 'New app update causing excessive phone battery drain.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'HIGH PRIORITY • MOBILE APP BATTERY DRAIN',
    severity: 'High',
    isRecurring: true,
    status: 'Under Investigation',
    updates: [],
    createdAt: '2026-10-29T10:06:00Z'
  },
  {
    id: 'prob_x47_high_05',
    priorityOrder: 7,
    userId: 'u_admin',
    reporterName: 'X47 Owners Collective',
    motorcycleModel: 'X47',
    variant: 'X47 All Variants',
    category: 'Console & Software',
    title: 'App widget only working when the app is running in the background or foreground.',
    description: 'App widget only working when the app is running in the background or foreground.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'HIGH PRIORITY • MOBILE APP WIDGET',
    severity: 'High',
    isRecurring: true,
    status: 'Under Investigation',
    updates: [],
    createdAt: '2026-10-29T10:07:00Z'
  },
  {
    id: 'prob_x47_high_06',
    priorityOrder: 8,
    userId: 'u_admin',
    reporterName: 'X47 Owners Collective',
    motorcycleModel: 'X47',
    variant: 'X47 All Variants',
    category: 'Console & Software',
    title: 'RC delay in processing for both digilocker and physical RC',
    description: 'RC delay in processing for both digilocker and physical RC',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'HIGH PRIORITY • REGISTRATION & RC PROCESSING',
    severity: 'High',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T10:08:00Z'
  },

  // 🟡 Moderate Priority
  {
    id: 'prob_x47_mod_01',
    priorityOrder: 9,
    userId: 'u_admin',
    reporterName: 'X47 Owners Collective',
    motorcycleModel: 'X47',
    variant: 'X47 All Variants',
    category: 'Console & Software',
    title: 'No standardised service experience at Space Stations operated by third-party franchise owners. Service quality, processes, and customer experience vary, with no consistent standard across locations.',
    description: 'No standardised service experience at Space Stations operated by third-party franchise owners. Service quality, processes, and customer experience vary, with no consistent standard across locations.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'MODERATE PRIORITY • SPACE STATION FRANCHISE STANDARDS',
    severity: 'Moderate',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T10:09:00Z'
  },
  {
    id: 'prob_x47_mod_02',
    priorityOrder: 10,
    userId: 'u_admin',
    reporterName: 'X47 Owners Collective',
    motorcycleModel: 'X47',
    variant: 'X47 All Variants',
    category: 'Console & Software',
    title: 'Lack of clear communication and transparency regarding recurring technical issues and their resolution.',
    description: 'Lack of clear communication and transparency regarding recurring technical issues and their resolution.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'MODERATE PRIORITY • TECHNICAL TRANSPARENCY',
    severity: 'Moderate',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T10:10:00Z'
  },
  {
    id: 'prob_x47_mod_03',
    priorityOrder: 11,
    userId: 'u_admin',
    reporterName: 'X47 Owners Collective',
    motorcycleModel: 'X47',
    variant: 'X47 All Variants',
    category: 'Console & Software',
    title: 'No detailed changelog or proper documentation of bug fixes with software updates. Updates are being rolled out without clearly communicating which bugs have been fixed, what issues remain, or what changes have been made. The current process feels ad hoc, with owners left guessing what has actually been addressed.',
    description: 'No detailed changelog or proper documentation of bug fixes with software updates. Updates are being rolled out without clearly communicating which bugs have been fixed, what issues remain, or what changes have been made. The current process feels ad hoc, with owners left guessing what has actually been addressed.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'MODERATE PRIORITY • OTA UPDATE CHANGELOGS',
    severity: 'Moderate',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T10:11:00Z'
  },
  {
    id: 'prob_x47_mod_04',
    priorityOrder: 12,
    userId: 'u_admin',
    reporterName: 'X47 Owners Collective',
    motorcycleModel: 'X47',
    variant: 'X47 All Variants',
    category: 'Console & Software',
    title: 'No clear tracking or communication of previously reported bugs across software updates.',
    description: 'No clear tracking or communication of previously reported bugs across software updates.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'MODERATE PRIORITY • BUG TRACKING ACROSS UPDATES',
    severity: 'Moderate',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T10:12:00Z'
  },

  // 🟣 Low Priority
  {
    id: 'prob_x47_low_01',
    priorityOrder: 13,
    userId: 'u_admin',
    reporterName: 'X47 Owners Collective',
    motorcycleModel: 'X47',
    variant: 'X47 All Variants',
    category: 'Charging System',
    title: 'Boost parallel charging was promised around a year ago, but there has been no meaningful update on its rollout.',
    description: 'Boost parallel charging was promised around a year ago, but there has been no meaningful update on its rollout.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'LOW PRIORITY • BOOST PARALLEL CHARGING ROLLOUT',
    severity: 'Low',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T10:13:00Z'
  },
  {
    id: 'prob_x47_low_02',
    priorityOrder: 14,
    userId: 'u_admin',
    reporterName: 'X47 Owners Collective',
    motorcycleModel: 'X47',
    variant: 'X47 All Variants',
    category: 'Console & Software',
    title: 'Display water-resistance concerns, with owners worried about using the bike in heavy rain.',
    description: 'Display water-resistance concerns, with owners worried about using the bike in heavy rain.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'LOW PRIORITY • DISPLAY WATER-RESISTANCE',
    severity: 'Low',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T10:14:00Z'
  },
  {
    id: 'prob_x47_low_03',
    priorityOrder: 15,
    userId: 'u_admin',
    reporterName: 'X47 Owners Collective',
    motorcycleModel: 'X47',
    variant: 'X47 All Variants',
    category: 'Charging System',
    title: 'No reliable, up-to-date information on charging infrastructure.',
    description: 'No reliable, up-to-date information on charging infrastructure.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'LOW PRIORITY • CHARGING INFRASTRUCTURE INFO',
    severity: 'Low',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T10:15:00Z'
  },
  {
    id: 'prob_x47_low_04',
    priorityOrder: 16,
    userId: 'u_admin',
    reporterName: 'X47 Owners Collective',
    motorcycleModel: 'X47',
    variant: 'X47 All Variants',
    category: 'Charging System',
    title: 'Chargers frequently appear dead, offline, or removed, with no clear communication on when they will be restored.',
    description: 'Chargers frequently appear dead, offline, or removed, with no clear communication on when they will be restored.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'LOW PRIORITY • OFFLINE / REMOVED CHARGERS',
    severity: 'Low',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T10:16:00Z'
  },
  {
    id: 'prob_x47_low_05',
    priorityOrder: 17,
    userId: 'u_admin',
    reporterName: 'X47 Owners Collective',
    motorcycleModel: 'X47',
    variant: 'X47 All Variants',
    category: 'Charging System',
    title: 'No estimated restoration timelines or proactive status updates, making it extremely difficult for owners to plan rides reliably.',
    description: 'No estimated restoration timelines or proactive status updates, making it extremely difficult for owners to plan rides reliably.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'LOW PRIORITY • CHARGER RESTORATION TIMELINES',
    severity: 'Low',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T10:17:00Z'
  }
];

export const F77_PRIORITY_ISSUES_SEED: SeedPriorityProblem[] = [
  // 🟠 High-Priority Issues (1 - 9)
  {
    id: 'prob_f77_high_01',
    priorityOrder: 101,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Motor & Drivetrain',
    title: '1. Chain slider damage and premature wear.',
    description: '1. Chain slider damage and premature wear.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'HIGH-PRIORITY • DRIVETRAIN / CHAIN SLIDER',
    severity: 'High',
    isRecurring: true,
    status: 'Under Investigation',
    updates: [],
    createdAt: '2026-10-29T11:01:00Z'
  },
  {
    id: 'prob_f77_high_02',
    priorityOrder: 102,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Suspension & Chassis',
    title: '2. Weak footpeg mounting points (front and rear).',
    description: '2. Weak footpeg mounting points (front and rear).',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'HIGH-PRIORITY • CHASSIS / FOOTPEG MOUNTS',
    severity: 'High',
    isRecurring: true,
    status: 'Under Investigation',
    updates: [],
    createdAt: '2026-10-29T11:02:00Z'
  },
  {
    id: 'prob_f77_high_03',
    priorityOrder: 103,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Console & Software',
    title: '3. Display malfunction due to water ingress.',
    description: '3. Display malfunction due to water ingress.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'HIGH-PRIORITY • TFT DISPLAY WATER INGRESS',
    severity: 'High',
    isRecurring: true,
    status: 'Under Investigation',
    updates: [],
    createdAt: '2026-10-29T11:03:00Z'
  },
  {
    id: 'prob_f77_high_04',
    priorityOrder: 104,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Console & Software',
    title: '4. Crash detection system not functioning reliably.',
    description: '4. Crash detection system not functioning reliably.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'HIGH-PRIORITY • CRASH DETECTION SENSOR',
    severity: 'High',
    isRecurring: true,
    status: 'Under Investigation',
    updates: [],
    createdAt: '2026-10-29T11:04:00Z'
  },
  {
    id: 'prob_f77_high_05',
    priorityOrder: 105,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Braking & ABS',
    title: '5. Sudden loss of regenerative braking.',
    description: '5. Sudden loss of regenerative braking.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'HIGH-PRIORITY • REGENERATIVE BRAKING LOSS',
    severity: 'High',
    isRecurring: true,
    status: 'Under Investigation',
    updates: [],
    createdAt: '2026-10-29T11:05:00Z'
  },
  {
    id: 'prob_f77_high_06',
    priorityOrder: 106,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Suspension & Chassis',
    title: '6. Concerns about wheel rim strength and durability.',
    description: '6. Concerns about wheel rim strength and durability.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'HIGH-PRIORITY • WHEEL RIM DURABILITY',
    severity: 'High',
    isRecurring: true,
    status: 'Under Investigation',
    updates: [],
    createdAt: '2026-10-29T11:06:00Z'
  },
  {
    id: 'prob_f77_high_07',
    priorityOrder: 107,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Battery & Power',
    title: '7. Weak stock headlight illumination.',
    description: '7. Weak stock headlight illumination.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'HIGH-PRIORITY • HEADLIGHT ILLUMINATION',
    severity: 'High',
    isRecurring: true,
    status: 'Under Investigation',
    updates: [],
    createdAt: '2026-10-29T11:07:00Z'
  },
  {
    id: 'prob_f77_high_08',
    priorityOrder: 108,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Suspension & Chassis',
    title: '8. Loose indicator mounts and tail assembly.',
    description: '8. Loose indicator mounts and tail assembly.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'HIGH-PRIORITY • INDICATOR & TAIL ASSEMBLY',
    severity: 'High',
    isRecurring: true,
    status: 'Under Investigation',
    updates: [],
    createdAt: '2026-10-29T11:08:00Z'
  },
  {
    id: 'prob_f77_high_09',
    priorityOrder: 109,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Console & Software',
    title: '9. Delayed horn response.',
    description: '9. Delayed horn response.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'HIGH-PRIORITY • SWITCHGEAR / HORN LATENCY',
    severity: 'High',
    isRecurring: true,
    status: 'Under Investigation',
    updates: [],
    createdAt: '2026-10-29T11:09:00Z'
  },

  // 🟡 Medium-Priority Issues (10 - 13)
  {
    id: 'prob_f77_mod_10',
    priorityOrder: 110,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Console & Software',
    title: '10. Ultraviolette mobile app issues.',
    description: '10. Ultraviolette mobile app issues.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'MEDIUM-PRIORITY • UV MOBILE APP',
    severity: 'Moderate',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T11:10:00Z'
  },
  {
    id: 'prob_f77_mod_11',
    priorityOrder: 111,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Console & Software',
    title: '11. Mappls navigation issues.',
    description: '11. Mappls navigation issues.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'MEDIUM-PRIORITY • MAPPLS NAVIGATION',
    severity: 'Moderate',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T11:11:00Z'
  },
  {
    id: 'prob_f77_mod_12',
    priorityOrder: 112,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Suspension & Chassis',
    title: '12. Tight or sticking keyhole.',
    description: '12. Tight or sticking keyhole.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'MEDIUM-PRIORITY • IGNITION KEYHOLE',
    severity: 'Moderate',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T11:12:00Z'
  },
  {
    id: 'prob_f77_mod_13',
    priorityOrder: 113,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Console & Software',
    title: "13. Non-functional music controls despite being mentioned in the owner's manual.",
    description: "13. Non-functional music controls despite being mentioned in the owner's manual.",
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'MEDIUM-PRIORITY • CONSOLE MUSIC CONTROLS',
    severity: 'Moderate',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T11:13:00Z'
  },

  // 🟣 Low-Priority / Owner-Manageable Issues (14 - 18)
  {
    id: 'prob_f77_low_14',
    priorityOrder: 114,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Suspension & Chassis',
    title: '14. Paint peeling or wearing off around the adjuster and Ultraviolette logo.',
    description: '14. Paint peeling or wearing off around the adjuster and Ultraviolette logo.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'LOW-PRIORITY / OWNER-MANAGEABLE • PAINT & FINISH',
    severity: 'Low',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T11:14:00Z'
  },
  {
    id: 'prob_f77_low_15',
    priorityOrder: 115,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Suspension & Chassis',
    title: '15. Mirrors providing inadequate rear visibility.',
    description: '15. Mirrors providing inadequate rear visibility.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'LOW-PRIORITY / OWNER-MANAGEABLE • REAR MIRROR VISIBILITY',
    severity: 'Low',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T11:15:00Z'
  },
  {
    id: 'prob_f77_low_16',
    priorityOrder: 116,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Suspension & Chassis',
    title: '16. Seat comfort issues, particularly on longer rides.',
    description: '16. Seat comfort issues, particularly on longer rides.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'LOW-PRIORITY / OWNER-MANAGEABLE • SEAT ERGONOMICS',
    severity: 'Low',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T11:16:00Z'
  },
  {
    id: 'prob_f77_low_17',
    priorityOrder: 117,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Suspension & Chassis',
    title: '17. Ultraviolette logo coming off.',
    description: '17. Ultraviolette logo coming off.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'LOW-PRIORITY / OWNER-MANAGEABLE • BADGE / LOGO ADHESION',
    severity: 'Low',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T11:17:00Z'
  },
  {
    id: 'prob_f77_low_18',
    priorityOrder: 118,
    userId: 'u_admin',
    reporterName: 'F77 Owners Collective',
    motorcycleModel: 'F77',
    variant: 'F77 Original / MACH 2 / Recon',
    category: 'Suspension & Chassis',
    title: '18. Key occasionally getting stuck.',
    description: '18. Key occasionally getting stuck.',
    firstObservedDate: '2026-10-29',
    warningMessageOrCode: 'LOW-PRIORITY / OWNER-MANAGEABLE • KEY RETENTION',
    severity: 'Low',
    isRecurring: true,
    status: 'Reported',
    updates: [],
    createdAt: '2026-10-29T11:18:00Z'
  }
];

export const ALL_PRIORITY_ISSUES_SEED: SeedPriorityProblem[] = [
  ...X47_PRIORITY_ISSUES_SEED,
  ...F77_PRIORITY_ISSUES_SEED
];

export type ChargerSource =
  | 'Supernova'
  | '3rd Party Station'
  | 'Community Provided Charger'
  | 'UV Space Station';

export const VALID_CHARGER_SOURCES: ChargerSource[] = [
  'Supernova',
  'UV Space Station',
  '3rd Party Station',
  'Community Provided Charger'
];

export function isValidChargerSource(source: string): source is ChargerSource {
  return VALID_CHARGER_SOURCES.includes(source as ChargerSource);
}

/**
 * Synchronizes the `categories` array on a charging station based on its `chargerType` and `chargerSource`.
 * Ensures UV Space Stations always carry 'UV Space Stations' and non-UV Space Stations do not carry stale category tags.
 */
export function buildStationCategories(
  chargerType?: string,
  chargerSource?: string,
  existingCategories?: string[]
): string[] {
  const set = new Set<string>();
  if (Array.isArray(existingCategories)) {
    for (const c of existingCategories) {
      if (typeof c === 'string' && c.trim()) {
        const trimmed = c.trim();
        const lower = trimmed.toLowerCase();
        // Strip stale network-source tags that are managed by chargerSource
        if (lower.includes('community')) continue;
        if (
          (lower.includes('space station') || lower.includes('spacestation')) &&
          chargerSource &&
          chargerSource !== 'UV Space Station'
        ) {
          continue;
        }
        set.add(trimmed);
      }
    }
  }
  if (typeof chargerType === 'string' && chargerType.trim()) {
    set.add(chargerType.trim());
  }
  if (chargerSource === 'UV Space Station') {
    set.add('UV Space Stations');
  } else if (chargerSource === 'Supernova') {
    set.add('Supernova');
  }
  return Array.from(set);
}

/**
 * Evaluates whether a charging station matches the active filter tab:
 * - ALL
 * - SUPERNOVA
 * - 3rd Party Station (formerly FAST)
 * - Community Provided Chargers (formerly COMMUNITY)
 * - LAST_24H / 24H (newly added chargers in the last 24 hours)
 * - BOLT_TYPE_6 / Type 6 (Type 6 Light Electric Vehicle fast chargers)
 */
export function isChargerAddedInLast24Hours(
  station: {
    createdAt?: string;
    lastVerifiedDate?: string;
    id?: string;
  },
  referenceTimestamp = Date.now()
): boolean {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  if (station.createdAt) {
    const createdTime = new Date(station.createdAt).getTime();
    if (!isNaN(createdTime)) {
      const diff = referenceTimestamp - createdTime;
      // Added within the last 24 hours (with a 5-minute future buffer for clock skew)
      if (diff >= -5 * 60 * 1000 && diff <= ONE_DAY_MS) {
        return true;
      }
    }
  }

  if (station.lastVerifiedDate) {
    const verifiedTime = new Date(station.lastVerifiedDate).getTime();
    if (!isNaN(verifiedTime)) {
      const diff = referenceTimestamp - verifiedTime;
      if (diff >= -5 * 60 * 1000 && diff <= ONE_DAY_MS) {
        return true;
      }
    }
  }

  // Also include freshly added session chargers or user submitted records
  if (
    station.id &&
    (station.id.startsWith('new_') ||
      station.id.startsWith('cs_custom_') ||
      station.id.startsWith('recent_') ||
      station.id === 'cs_11' ||
      station.id === 'cs_14' ||
      station.id.startsWith('cs_1792'))
  ) {
    return true;
  }

  return false;
}

export interface NetworkCompositionSegment {
  key: 'uv_supernova' | 'owners_chargers' | 'bolt_type_6';
  label: string;
  count: number;
  percentage: number;
  totalKw: number;
  color: string;
  border: string;
  description: string;
}

export interface NetworkCompositionResult {
  totalCount: number;
  totalCapacityKw: number;
  segments: {
    uvSupernova: NetworkCompositionSegment;
    ownersChargers: NetworkCompositionSegment;
    boltType6: NetworkCompositionSegment;
  };
  last24HoursCount: number;
}

export function calculateChargingNetworkComposition(
  stations: {
    id?: string;
    chargerSource?: ChargerSource | string;
    chargerType?: string;
    isSupernova?: boolean;
    isCommunityReported?: boolean;
    connectorTypes?: string[];
    powerOutputKw?: number;
    createdAt?: string;
    lastVerifiedDate?: string;
  }[],
  referenceTimestamp = Date.now()
): NetworkCompositionResult {
  let uvCount = 0;
  let uvKw = 0;
  let ownerCount = 0;
  let ownerKw = 0;
  let boltCount = 0;
  let boltKw = 0;
  let last24hCount = 0;
  let totalCapacityKw = 0;

  for (const st of stations) {
    const kw = Number(st.powerOutputKw) || 0;
    totalCapacityKw += kw;

    if (isChargerAddedInLast24Hours(st, referenceTimestamp)) {
      last24hCount++;
    }

    // 1. UV Supernova (strictly exclusive)
    const isUv =
      st.chargerSource === 'Supernova' ||
      Boolean(st.isSupernova) ||
      st.chargerType === 'Supernova';
    if (isUv) {
      uvCount++;
      uvKw += kw;
      continue;
    }

    // 2. Owners / Community Chargers (strictly exclusive of Supernova, UV Space Station, and 3rd Party Station)
    const isOwner =
      st.chargerSource === 'Community Provided Charger' ||
      (!st.chargerSource && Boolean(st.isCommunityReported));
    if (isOwner) {
      ownerCount++;
      ownerKw += kw;
    }

    // 3. Bolt Type 6 Chargers (LEV DC fast standard, non-Supernova only)
    const connectors = st.connectorTypes || [];
    const isType6 =
      st.chargerType === 'Type 6' ||
      (!st.chargerType &&
        connectors.some(
          c =>
            c.toLowerCase().includes('type 6') ||
            c.toLowerCase().includes('type-6')
        ));
    if (isType6) {
      boltCount++;
      boltKw += kw;
    }
  }

  const denominator = stations.length > 0 ? stations.length : 1;

  return {
    totalCount: stations.length,
    totalCapacityKw: Math.round(totalCapacityKw),
    segments: {
      uvSupernova: {
        key: 'uv_supernova',
        label: 'UV Supernova',
        count: uvCount,
        percentage: Math.round((uvCount / denominator) * 100),
        totalKw: Math.round(uvKw),
        color: '#42B883',
        border: 'border-[#42B883]/50',
        description: 'Ultraviolette official DC fast charging network'
      },
      ownersChargers: {
        key: 'owners_chargers',
        label: 'Owner Chargers',
        count: ownerCount,
        percentage: Math.round((ownerCount / denominator) * 100),
        totalKw: Math.round(ownerKw),
        color: '#E8AA45',
        border: 'border-[#E8AA45]/50',
        description: 'Private pilot sockets & wallboxes shared by community'
      },
      boltType6: {
        key: 'bolt_type_6',
        label: 'Bolt Type 6',
        count: boltCount,
        percentage: Math.round((boltCount / denominator) * 100),
        totalKw: Math.round(boltKw),
        color: '#729BCB',
        border: 'border-[#729BCB]/50',
        description: 'Light Electric Vehicle DC fast network (Type 6 standard)'
      }
    },
    last24HoursCount: last24hCount
  };
}

export function matchesChargingStationFilter(
  station: {
    isSupernova: boolean;
    isCommunityReported: boolean;
    powerOutputKw: number;
    chargerSource?: ChargerSource;
    chargerType?: string;
    connectorTypes?: string[];
    createdAt?: string;
    lastVerifiedDate?: string;
    id?: string;
    categories?: string[];
    name?: string;
    isMasterStation?: boolean;
  },
  filterType: string,
  referenceTimestamp = Date.now()
): boolean {
  if (!filterType || filterType === 'ALL') return true;

  if (
    filterType === 'LAST_24H' ||
    filterType === '24H' ||
    filterType === 'NEW_24H' ||
    filterType === 'new_24h'
  ) {
    return isChargerAddedInLast24Hours(station, referenceTimestamp);
  }

  const isExplicitUvSpaceStation =
    station.chargerSource === 'UV Space Station' ||
    (Array.isArray(station.categories) &&
      station.categories.some(c => {
        const lower = String(c || '').trim().toLowerCase();
        return (
          lower.includes('space station') ||
          lower.includes('space-station') ||
          lower.includes('spacestation')
        );
      })) ||
    (typeof station.name === 'string' &&
      (station.name.toLowerCase().includes('space station') ||
        station.name.toLowerCase().includes('spacestation')));

  if (
    filterType === 'UV_SPACE_STATIONS' ||
    filterType === 'UV Space Stations' ||
    filterType === 'UV_SPACE' ||
    filterType === 'uv_space_stations'
  ) {
    return isExplicitUvSpaceStation;
  }

  // Handle explicit categories array if present
  if (Array.isArray(station.categories) && station.categories.length > 0) {
    const cats = station.categories.map(c => c.trim().toLowerCase());

    if (
      filterType === 'SUPERNOVA' ||
      filterType === 'Supernova' ||
      filterType === 'UV_SUPERNOVA'
    ) {
      return (
        cats.some(c => c.includes('supernova')) ||
        Boolean(station.isSupernova) ||
        station.chargerType === 'Supernova' ||
        station.chargerSource === 'Supernova'
      );
    }

    if (
      filterType === 'BOLT_TYPE_6' ||
      filterType === 'Type 6' ||
      filterType === 'TYPE_6' ||
      filterType === 'bolt_type_6'
    ) {
      return (
        cats.some(c => c.includes('type 6') || c.includes('type-6')) ||
        station.chargerType === 'Type 6'
      );
    }

    if (
      filterType === 'TYPE_2' ||
      filterType === 'Type 2' ||
      filterType === 'type_2'
    ) {
      return (
        cats.some(c => c.includes('type 2') || c.includes('type-2')) ||
        station.chargerType === 'Type 2'
      );
    }

    if (
      filterType === 'SOCKET' ||
      filterType === 'SOCKETS' ||
      filterType === 'Socket' ||
      filterType === 'Sockets' ||
      filterType === 'socket'
    ) {
      return (
        cats.some(
          c =>
            c.includes('socket') ||
            c.includes('15a') ||
            c.includes('16a') ||
            c.includes('3-pin') ||
            c.includes('industrial')
        ) || station.chargerType === 'Socket'
      );
    }

    if (
      filterType === 'Community Provided Chargers' ||
      filterType === 'Community Provided Charger' ||
      filterType === 'COMMUNITY' ||
      filterType === 'OWNERS' ||
      filterType === 'OWNERS_CHARGERS'
    ) {
      if (
        isExplicitUvSpaceStation ||
        station.chargerSource === 'Supernova' ||
        station.chargerSource === '3rd Party Station' ||
        station.isSupernova
      ) {
        return false;
      }
      return (
        station.chargerSource === 'Community Provided Charger' ||
        cats.some(c => c.includes('community')) ||
        (!station.chargerSource && Boolean(station.isCommunityReported))
      );
    }
  }

  const isSupernovaStation =
    station.chargerSource === 'Supernova' ||
    Boolean(station.isSupernova) ||
    station.chargerType === 'Supernova';

  if (
    filterType === 'SUPERNOVA' ||
    filterType === 'Supernova' ||
    filterType === 'UV_SUPERNOVA'
  ) {
    return isSupernovaStation;
  }

  // Supernova is pure and exclusive to the Supernova option:
  // never include a Supernova station in Type 2, Type 6, Socket, Community, or 3rd Party filters.
  if (isSupernovaStation) {
    return false;
  }

  if (
    filterType === 'Community Provided Chargers' ||
    filterType === 'Community Provided Charger' ||
    filterType === 'COMMUNITY' ||
    filterType === 'OWNERS' ||
    filterType === 'OWNERS_CHARGERS'
  ) {
    if (
      isExplicitUvSpaceStation ||
      station.chargerSource === 'UV Space Station' ||
      station.chargerSource === '3rd Party Station' ||
      station.chargerSource === 'Supernova'
    ) {
      return false;
    }
    if (station.chargerSource) {
      return station.chargerSource === 'Community Provided Charger';
    }
    return Boolean(station.isCommunityReported);
  }

  if (
    filterType === 'BOLT_TYPE_6' ||
    filterType === 'Type 6' ||
    filterType === 'TYPE_6' ||
    filterType === 'bolt_type_6'
  ) {
    if (station.chargerType) {
      return station.chargerType === 'Type 6';
    }
    const connectors = station.connectorTypes || [];
    return connectors.some(
      c =>
        c.toLowerCase().includes('type 6') ||
        c.toLowerCase().includes('type-6')
    );
  }

  if (
    filterType === 'TYPE_2' ||
    filterType === 'Type 2' ||
    filterType === 'type_2'
  ) {
    if (station.chargerType) {
      return station.chargerType === 'Type 2';
    }
    const connectors = station.connectorTypes || [];
    return connectors.some(
      c =>
        c.toLowerCase().includes('type 2') ||
        c.toLowerCase().includes('type-2')
    );
  }

  if (
    filterType === 'SOCKET' ||
    filterType === 'SOCKETS' ||
    filterType === 'Socket' ||
    filterType === 'Sockets' ||
    filterType === 'socket'
  ) {
    if (station.chargerType) {
      return station.chargerType === 'Socket';
    }
    const connectors = station.connectorTypes || [];
    return connectors.some(c => {
      const lower = c.toLowerCase();
      return (
        lower.includes('socket') ||
        lower.includes('15a') ||
        lower.includes('16a') ||
        lower.includes('3-pin') ||
        lower.includes('industrial')
      );
    });
  }

  if (filterType === '3rd Party Station' || filterType === 'FAST') {
    if (station.chargerSource) {
      return station.chargerSource === '3rd Party Station';
    }
    return station.powerOutputKw >= 25;
  }

  return true;
}

export interface CockpitMfdMenuItem {
  id: string;
  osbCode: string;
  label: string;
  sublabel: string;
  routeId: string;
}

export const LEFT_MFD_SYSTEMS_ITEMS: CockpitMfdMenuItem[] = [
  {
    id: 'sys_priority_issues',
    osbCode: 'OSB-L1',
    label: 'Priority Issues',
    sublabel: 'Issue reporting & severity queue',
    routeId: 'problems'
  },
  {
    id: 'sys_charging',
    osbCode: 'OSB-L2',
    label: 'Charging',
    sublabel: 'Supernova, 3rd party & community plugs',
    routeId: 'charging'
  },
  {
    id: 'sys_service_intel',
    osbCode: 'OSB-L3',
    label: 'Service Intel & Reviews',
    sublabel: 'Service centre visits & ratings',
    routeId: 'service'
  },
  {
    id: 'sys_my_garage',
    osbCode: 'OSB-L4',
    label: 'My Garage',
    sublabel: 'Motorcycle profile & documents',
    routeId: 'garage'
  }
];

export const RIGHT_MFD_COMMUNITY_ITEMS: CockpitMfdMenuItem[] = [
  {
    id: 'com_discussions',
    osbCode: 'OSB-R1',
    label: 'Discussions',
    sublabel: 'Owner questions & technical threads',
    routeId: 'discussions'
  },
  {
    id: 'com_modifications',
    osbCode: 'OSB-R2',
    label: 'Modifications Lab',
    sublabel: 'Verified parts & fitment guides',
    routeId: 'modifications'
  },
  {
    id: 'com_marketplace',
    osbCode: 'OSB-R3',
    label: 'Marketplace',
    sublabel: 'Buy, sell & owner gear exchange',
    routeId: 'marketplace'
  },
  {
    id: 'com_events',
    osbCode: 'OSB-R4',
    label: 'Events',
    sublabel: 'Scheduled squadron rides & sorties',
    routeId: 'mission'
  }
];

export interface DedicatedCockpitControl {
  id: string;
  label: string;
  sublabel: string;
  routeId: string;
  tone: 'amber' | 'green' | 'red';
}

export const DEDICATED_COCKPIT_CONTROLS: DedicatedCockpitControl[] = [
  {
    id: 'ctrl_jet_engineer',
    label: 'THE JET ENGINEER',
    sublabel: 'CENTRAL AI CORE',
    routeId: 'jet_engineer',
    tone: 'green'
  },
  {
    id: 'ctrl_squadron_assist',
    label: 'SQUADRON ASSIST',
    sublabel: 'EMERGENCY PAGE',
    routeId: 'emergency',
    tone: 'red'
  },
  {
    id: 'ctrl_mission_mode',
    label: 'MISSION MODE',
    sublabel: 'GROUP RIDES',
    routeId: 'mission',
    tone: 'amber'
  },
  {
    id: 'ctrl_priority_issues',
    label: 'PRIORITY ISSUES',
    sublabel: 'ISSUE TRACKING',
    routeId: 'problems',
    tone: 'amber'
  }
];

export function resolveJetEngineerAction(action: 'help' | 'train' | 'main'): {
  routeId: 'jet_engineer';
  mode: 'ask' | 'train';
} {
  if (action === 'train') {
    return { routeId: 'jet_engineer', mode: 'train' };
  }
  return { routeId: 'jet_engineer', mode: 'ask' };
}

export function extractMarketplaceItemImages(item?: {
  imageUrl?: string;
  imageUrls?: string[];
}): string[] {
  if (!item) return [];
  let photos: string[] = [];
  if (Array.isArray(item.imageUrls) && item.imageUrls.length > 0) {
    photos = item.imageUrls.filter(u => typeof u === 'string' && u.trim().length > 0);
  } else if (item.imageUrl && typeof item.imageUrl === 'string' && item.imageUrl.trim().length > 0) {
    photos = [item.imageUrl.trim()];
  }
  const unique = photos.filter((u, idx, arr) => arr.indexOf(u) === idx);
  return unique.map(u => repairBase64JpegIfTruncated(u)).filter(Boolean);
}

// ============================================================================
// CHARGING PAGE UPDATES — COMPULSORY CHARGER TYPES, VALIDATION & MAP CLUSTERING
// ============================================================================

export type ChargerPlugType = 'Supernova' | 'Type 6' | 'Type 2' | 'Socket';

export const VALID_CHARGER_PLUG_TYPES: ChargerPlugType[] = [
  'Supernova',
  'Type 6',
  'Type 2',
  'Socket'
];

export interface ChargerPlugTypeSpec {
  type: ChargerPlugType;
  label: string;
  requirementSummary: string;
  requiresUvLink: boolean;
  requiresChargerDetails: boolean;
  defaultConnectorLabel: string;
}

export const CHARGER_PLUG_TYPE_SPECS: Record<ChargerPlugType, ChargerPlugTypeSpec> = {
  Supernova: {
    type: 'Supernova',
    label: 'Supernova',
    requirementSummary: 'No separate charger required.',
    requiresUvLink: false,
    requiresChargerDetails: false,
    defaultConnectorLabel: 'Supernova (DC Fast)'
  },
  'Type 6': {
    type: 'Type 6',
    label: 'Type 6',
    requirementSummary: 'No separate charger required.',
    requiresUvLink: false,
    requiresChargerDetails: false,
    defaultConnectorLabel: 'Type 6 Connector'
  },
  'Type 2': {
    type: 'Type 2',
    label: 'Type 2',
    requirementSummary: 'Ultraviolette (UV) charging link and charger required.',
    requiresUvLink: true,
    requiresChargerDetails: true,
    defaultConnectorLabel: 'Type 2 AC (UV Link + Charger Required)'
  },
  Socket: {
    type: 'Socket',
    label: 'Socket',
    requirementSummary: 'Standard 15A AC Socket',
    requiresUvLink: false,
    requiresChargerDetails: false,
    defaultConnectorLabel: '15A Socket'
  }
};

export interface ChargerMapLandmark {
  id: string;
  name: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
}

export const INDIA_CHARGER_LANDMARKS: ChargerMapLandmark[] = [
  {
    id: 'lm_blr_indiranagar',
    name: 'Indiranagar 100 Ft Road Hangar',
    city: 'Bengaluru',
    address: '100 Feet Rd, Indiranagar, Bengaluru, Karnataka 560038',
    latitude: 12.9719,
    longitude: 77.6412
  },
  {
    id: 'lm_maddur_highway',
    name: 'Maddur Highway Plaza (BLR-MYS Expy)',
    city: 'Maddur / Mandya',
    address: 'Bengaluru-Mysuru Expressway KM 82, Maddur, Karnataka 571428',
    latitude: 12.5841,
    longitude: 77.0428
  },
  {
    id: 'lm_blr_airport',
    name: 'Devanahalli Airport Toll Plaza (NH 44)',
    city: 'Bengaluru North',
    address: 'Bellary Road NH 44, Devanahalli, Bengaluru, Karnataka 562110',
    latitude: 13.2085,
    longitude: 77.7082
  },
  {
    id: 'lm_mum_worli',
    name: 'Worli Sea Face Promenade Hub',
    city: 'Mumbai',
    address: 'Worli Sea Face, Mumbai, Maharashtra 400030',
    latitude: 19.0176,
    longitude: 72.8172
  },
  {
    id: 'lm_lonavala_expy',
    name: 'Lonavala Food Mall (Mumbai-Pune Expy)',
    city: 'Lonavala / Pune',
    address: 'Mumbai-Pune Expressway, Lonavala Exit, Maharashtra 410401',
    latitude: 18.7557,
    longitude: 73.4091
  },
  {
    id: 'lm_pune_wakad',
    name: 'Wakad Highway Junction (NH 48)',
    city: 'Pune',
    address: 'Mumbai-Bangalore Highway NH 48, Wakad, Pune, Maharashtra 411057',
    latitude: 18.5987,
    longitude: 73.7621
  },
  {
    id: 'lm_del_cp',
    name: 'Connaught Place Inner Circle',
    city: 'New Delhi',
    address: 'Connaught Place, Inner Circle, New Delhi, Delhi 110001',
    latitude: 28.6315,
    longitude: 77.2167
  },
  {
    id: 'lm_chn_ecr',
    name: 'Mahabalipuram ECR Waypoint',
    city: 'Chennai',
    address: 'East Coast Road (ECR), Mahabalipuram, Tamil Nadu 603104',
    latitude: 12.6208,
    longitude: 80.1945
  },
  {
    id: 'lm_hyd_hitec',
    name: 'HITEC City Cyber Towers',
    city: 'Hyderabad',
    address: 'HITEC City Main Rd, Madhapur, Hyderabad, Telangana 500081',
    latitude: 17.4435,
    longitude: 78.3772
  },
  {
    id: 'lm_kochi_nh66',
    name: 'Edappally Toll Junction (NH 66)',
    city: 'Kochi',
    address: 'NH 66 Bypass, Edappally, Kochi, Kerala 682024',
    latitude: 10.0261,
    longitude: 76.3125
  }
];

/**
 * Searches India charger landmarks by name, city, or address.
 */
export function searchChargerLandmarks(query: string): ChargerMapLandmark[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return INDIA_CHARGER_LANDMARKS;
  return INDIA_CHARGER_LANDMARKS.filter(
    lm =>
      lm.name.toLowerCase().includes(q) ||
      lm.city.toLowerCase().includes(q) ||
      lm.address.toLowerCase().includes(q)
  );
}

/**
 * Resolves a human-readable location & nearest-landmark description for any point clicked on the map.
 */
export function describeMapPinLocation(
  latitude: number,
  longitude: number
): {
  nearestLandmark: ChargerMapLandmark;
  distanceKm: number;
  suggestedLocationLabel: string;
} {
  let nearest = INDIA_CHARGER_LANDMARKS[0];
  let minDistance = Infinity;

  for (const lm of INDIA_CHARGER_LANDMARKS) {
    const d = calculateDistanceKm(latitude, longitude, lm.latitude, lm.longitude);
    if (d < minDistance) {
      minDistance = d;
      nearest = lm;
    }
  }

  const roundedDist = Number(minDistance.toFixed(1));
  const suggestedLocationLabel =
    roundedDist <= 1.5
      ? nearest.address
      : roundedDist <= 25
      ? `Near ${nearest.name}, ${nearest.city} (${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E)`
      : `${nearest.city} Region — Pin (${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E)`;

  return {
    nearestLandmark: nearest,
    distanceKm: roundedDist,
    suggestedLocationLabel
  };
}

export function isValidChargerPlugType(val: unknown): val is ChargerPlugType {
  return typeof val === 'string' && VALID_CHARGER_PLUG_TYPES.includes(val as ChargerPlugType);
}

/**
 * Validates and sanitises external URLs (e.g. UV charging link).
 * Rejects non-http(s) schemes (javascript:, data:, etc.) and malformed URLs.
 */
export function validateAndSanitizeUrl(rawUrl: unknown): {
  valid: boolean;
  sanitizedUrl?: string;
  error?: string;
} {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { valid: false, error: 'A valid URL is required.' };
  }
  const trimmed = rawUrl.trim();
  // Reject script or control characters
  if (/[\s<>"{}|\\^`]/.test(trimmed)) {
    return { valid: false, error: 'URL contains invalid characters.' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, error: 'URL must start with https:// or http://.' };
    }
    if (!parsed.hostname || (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost')) {
      return { valid: false, error: 'URL must include a valid domain name.' };
    }
    return { valid: true, sanitizedUrl: parsed.toString() };
  } catch {
    return { valid: false, error: 'Please enter a valid full URL (e.g. https://ultraviolette.com/charging).' };
  }
}

export interface ChargingPlugSubmissionInput {
  name?: unknown;
  location?: unknown;
  chargerType?: unknown;
  uvChargingLink?: unknown;
  chargerDetails?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  vehicleCompatibility?: unknown;
}

export interface ChargingPlugValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  chargerType?: ChargerPlugType;
  sanitizedUvLink?: string;
  sanitizedChargerDetails?: string;
  coordinates?: { latitude: number; longitude: number };
}

/**
 * Enforces compulsory charger type selection and dynamic conditional requirements:
 * 1. Supernova — No separate charger required.
 * 2. Type 6 — No separate charger required.
 * 3. Type 2 — Ultraviolette (UV) charging link and charger required.
 * 4. Socket — Selectable directly without extra mandatory details input.
 */
export function validateChargingPlugSubmission(
  input: ChargingPlugSubmissionInput
): ChargingPlugValidationResult {
  const errMap: Record<string, string> = {};

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) {
    errMap.name = 'Station or location name is required.';
  }

  const location = typeof input.location === 'string' ? input.location.trim() : '';
  if (!location) {
    errMap.location = 'Location & address description is required.';
  }

  if (!isValidChargerPlugType(input.chargerType)) {
    errMap.chargerType =
      'Charger / connector type is mandatory. Select Supernova, Type 6, Type 2, or Socket.';
  }

  const selectedType = isValidChargerPlugType(input.chargerType) ? input.chargerType : undefined;
  let sanitizedUvLink = '';
  let sanitizedChargerDetails =
    typeof input.chargerDetails === 'string' ? input.chargerDetails.trim() : '';

  if (selectedType === 'Type 2') {
    const rawLink = typeof input.uvChargingLink === 'string' ? input.uvChargingLink.trim() : '';
    if (!rawLink) {
      errMap.uvChargingLink =
        'Ultraviolette (UV) charging link is required for Type 2 connectors.';
    } else {
      const urlCheck = validateAndSanitizeUrl(rawLink);
      if (!urlCheck.valid || !urlCheck.sanitizedUrl) {
        errMap.uvChargingLink =
          urlCheck.error || 'Please provide a valid https:// UV charging link.';
      } else {
        sanitizedUvLink = urlCheck.sanitizedUrl;
      }
    }

    if (!sanitizedChargerDetails) {
      errMap.chargerDetails =
        'Charger requirement details (e.g., UV Type 2 AC adapter + portable charger) are required for Type 2.';
    }
  } else if (selectedType === 'Supernova' || selectedType === 'Type 6' || selectedType === 'Socket') {
    if (typeof input.uvChargingLink === 'string' && input.uvChargingLink.trim()) {
      const urlCheck = validateAndSanitizeUrl(input.uvChargingLink);
      if (!urlCheck.valid) {
        errMap.uvChargingLink = urlCheck.error || 'Invalid URL format.';
      } else {
        sanitizedUvLink = urlCheck.sanitizedUrl || '';
      }
    }
  }

  const coordCheck = validateManualCoordinates(input.latitude, input.longitude);
  if (coordCheck.latError) {
    errMap.latitude = 'Valid latitude between -90 and 90 is required.';
  }
  if (coordCheck.lonError) {
    errMap.longitude = 'Valid longitude between -180 and 180 is required.';
  }

  const valid = Object.keys(errMap).length === 0;

  return {
    valid,
    errors: errMap,
    chargerType: selectedType,
    sanitizedUvLink: sanitizedUvLink || undefined,
    sanitizedChargerDetails: sanitizedChargerDetails || undefined,
    coordinates:
      coordCheck.valid && coordCheck.latitude !== undefined && coordCheck.longitude !== undefined
        ? { latitude: coordCheck.latitude, longitude: coordCheck.longitude }
        : undefined
  };
}

export interface ManualCoordinateValidationResult {
  valid: boolean;
  latitude?: number;
  longitude?: number;
  latError?: string;
  lonError?: string;
}

const STRICT_DECIMAL_COORD_REGEX = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;

/**
 * Strictly validates manually entered latitude and longitude coordinates.
 * - Latitude must be a valid decimal number between -90 and +90.
 * - Longitude must be a valid decimal number between -180 and +180.
 * - Rejects empty, malformed, non-numeric, combined ("12.9, 77.5"), or out-of-range values.
 * - Never swaps latitude and longitude.
 */
export function validateManualCoordinates(
  rawLat: unknown,
  rawLon: unknown
): ManualCoordinateValidationResult {
  let latError: string | undefined;
  let lonError: string | undefined;
  let latitude: number | undefined;
  let longitude: number | undefined;

  const latStr =
    typeof rawLat === 'number'
      ? Number.isFinite(rawLat)
        ? String(rawLat)
        : 'NaN'
      : typeof rawLat === 'string'
      ? rawLat.trim()
      : '';

  const lonStr =
    typeof rawLon === 'number'
      ? Number.isFinite(rawLon)
        ? String(rawLon)
        : 'NaN'
      : typeof rawLon === 'string'
      ? rawLon.trim()
      : '';

  if (!latStr) {
    latError = 'Latitude is required (enter a number between -90 and +90).';
  } else if (!STRICT_DECIMAL_COORD_REGEX.test(latStr)) {
    latError = 'Latitude must be a valid decimal number (e.g. 12.9716).';
  } else {
    const parsedLat = Number(latStr);
    if (!Number.isFinite(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      latError = 'Latitude must be between -90 and +90 degrees.';
    } else {
      latitude = Number(parsedLat.toFixed(6));
    }
  }

  if (!lonStr) {
    lonError = 'Longitude is required (enter a number between -180 and +180).';
  } else if (!STRICT_DECIMAL_COORD_REGEX.test(lonStr)) {
    lonError = 'Longitude must be a valid decimal number (e.g. 77.5946).';
  } else {
    const parsedLon = Number(lonStr);
    if (!Number.isFinite(parsedLon) || parsedLon < -180 || parsedLon > 180) {
      lonError = 'Longitude must be between -180 and +180 degrees.';
    } else {
      longitude = Number(parsedLon.toFixed(6));
    }
  }

  const valid = !latError && !lonError && latitude !== undefined && longitude !== undefined;
  return {
    valid,
    latitude: valid ? latitude : undefined,
    longitude: valid ? longitude : undefined,
    latError,
    lonError
  };
}

/**
 * Produces a clear fallback label when reverse geocoding is unavailable or fails for valid manual coordinates.
 */
export function formatManualCoordinatesFallback(
  latitude: number,
  longitude: number
): {
  name: string;
  locality: string;
  address: string;
} {
  const latFixed = Number(latitude).toFixed(4);
  const lonFixed = Number(longitude).toFixed(4);
  const latExact = Number(latitude).toFixed(6);
  const lonExact = Number(longitude).toFixed(6);
  return {
    name: `Manual Coordinates (${latFixed}, ${lonFixed})`,
    locality: 'Manually Entered Coordinates',
    address: `Manually entered coordinates (${latExact}, ${lonExact})`
  };
}

/**
 * Determines whether a charging station is approved and published for public display on the map & directory.
 * Pending, rejected, or deleted submissions are never shown as publicly available chargers.
 */
export function isPubliclyPublishedCharger(station: {
  verifiedByAdmin?: boolean;
  approvalStatus?: string;
  published?: boolean;
}): boolean {
  if (!station) return false;
  if (
    station.approvalStatus === 'pending' ||
    station.approvalStatus === 'rejected' ||
    station.approvalStatus === 'deleted'
  ) {
    return false;
  }
  if (station.published === false) {
    return false;
  }
  return Boolean(station.verifiedByAdmin);
}

/**
 * Prevents unauthorised users from editing or deleting another user's charger records.
 * Admins/superadmins can edit or delete any record; regular/verified users can only edit/delete their own.
 */
export function canModifyChargerRecord(
  station: { submittedByUserId?: string; isMasterStation?: boolean },
  user?: { id?: string; role?: string; isOwner?: boolean; email?: string; mobile?: string } | null
): boolean {
  if (!user || !station) return false;
  if (user.role === 'admin' || user.role === 'superadmin' || isAdminOrOwnerAccount(user)) return true;
  // Master charging network stations can NEVER be modified or deleted by normal users
  if (station.isMasterStation) return false;
  if (station.submittedByUserId && user.id && station.submittedByUserId === user.id) {
    return true;
  }
  return false;
}

export interface ChargerCluster<T> {
  id: string;
  isCluster: boolean;
  count: number;
  latitude: number;
  longitude: number;
  locationLabel?: string;
  stations: T[];
}

const CHARGER_CITY_SYNONYMS: Record<string, string> = {
  bangalore: 'bengaluru',
  bengaluru: 'bengaluru',
  blr: 'bengaluru',
  mysore: 'mysuru',
  mysuru: 'mysuru',
  mangalore: 'mangaluru',
  mangaluru: 'mangaluru',
  tumkur: 'tumakuru',
  tumakuru: 'tumakuru',
  bellary: 'ballari',
  ballari: 'ballari',
  hubli: 'hubballi',
  hubballi: 'hubballi',
  belgaum: 'belagavi',
  belagavi: 'belagavi',
  shimoga: 'shivamogga',
  shivamogga: 'shivamogga',
  cochin: 'kochi',
  kochi: 'kochi',
  calicut: 'kozhikode',
  kozhikode: 'kozhikode',
  trivandrum: 'thiruvananthapuram',
  thiruvananthapuram: 'thiruvananthapuram',
  pondicherry: 'puducherry',
  puducherry: 'puducherry',
  madras: 'chennai',
  chennai: 'chennai',
  bombay: 'mumbai',
  mumbai: 'mumbai',
  poona: 'pune',
  pune: 'pune',
  gurgaon: 'gurugram',
  gurugram: 'gurugram',
  mahabalipuram: 'mamallapuram',
  mamallapuram: 'mamallapuram'
};

const INDIAN_STATE_TOKENS = new Set([
  'karnataka',
  'tamil nadu',
  'tamilnadu',
  'maharashtra',
  'kerala',
  'telangana',
  'andhra pradesh',
  'delhi ncr',
  'goa',
  'gujarat',
  'rajasthan',
  'uttar pradesh',
  'west bengal',
  'madhya pradesh',
  'punjab',
  'haryana',
  'india'
]);

const MULTI_ZONE_METROS = new Set([
  'bengaluru',
  'mumbai',
  'chennai',
  'new delhi',
  'delhi',
  'hyderabad',
  'pune',
  'kolkata'
]);

function applyCitySynonyms(text: string): string {
  let out = text.toLowerCase();
  for (const [alias, canonical] of Object.entries(CHARGER_CITY_SYNONYMS)) {
    out = out.replace(new RegExp(`\\b${alias}\\b`, 'g'), canonical);
  }
  return out;
}

const locationKeyNormCache = new Map<string, string>();
const cityKeyExtractCache = new Map<string, string>();

/**
 * Normalizes a charger's location/address string for co-location matching, ignoring state suffixes,
 * pin codes, punctuation, and minimal-DB coordinate status boilerplate.
 */
export function normalizeChargerLocationKey(location?: string | null): string {
  if (!location || typeof location !== 'string') return '';
  const cached = locationKeyNormCache.get(location);
  if (cached !== undefined) return cached;

  const lower = location.toLowerCase();
  if (
    lower.includes('coordinates found in same text section') ||
    lower.includes('exact coordinates not present')
  ) {
    locationKeyNormCache.set(location, '');
    return '';
  }

  const parts = location
    .split(',')
    .map(p =>
      applyCitySynonyms(
        p
          .replace(/\b\d{6}\b/g, ' ')
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      )
    )
    .filter(p => p.length > 0 && !INDIAN_STATE_TOKENS.has(p));

  const result = parts.join(', ').trim();
  locationKeyNormCache.set(location, result);
  return result;
}

/**
 * Extracts a normalized city/town (or neighborhood + metro) key from a charger's location.
 */
export function extractChargerCityOrTownKey(
  stationOrLocation:
    | string
    | {
        name?: string;
        location?: string | null;
      }
    | null
    | undefined
): string {
  const rawLocation =
    typeof stationOrLocation === 'string'
      ? stationOrLocation
      : stationOrLocation?.location || '';
  if (!rawLocation) return '';

  const cached = cityKeyExtractCache.get(rawLocation);
  if (cached !== undefined) return cached;

  const normLoc = normalizeChargerLocationKey(rawLocation);
  if (!normLoc) {
    cityKeyExtractCache.set(rawLocation, '');
    return '';
  }

  const segments = normLoc
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    cityKeyExtractCache.set(rawLocation, '');
    return '';
  }

  const lastSeg = segments[segments.length - 1];
  let res = lastSeg;
  if (MULTI_ZONE_METROS.has(lastSeg) && segments.length >= 2) {
    const subLocality = segments[segments.length - 2];
    res = `${subLocality}, ${lastSeg}`;
  }

  cityKeyExtractCache.set(rawLocation, res);
  return res;
}

/**
 * Determines whether two charging stations (regardless of whether Community Provided, Supernova,
 * Type 6, Type 2, Socket, or 3rd Party) belong to the exact same location, address, or city/town group.
 */
export function areChargingStationsCoLocated(
  a: {
    latitude: number;
    longitude: number;
    name?: string;
    location?: string | null;
    exactLocationCoordinates?: string;
  },
  b: {
    latitude: number;
    longitude: number;
    name?: string;
    location?: string | null;
    exactLocationCoordinates?: string;
  }
): boolean {
  const distKm = calculateDistanceKm(a.latitude, a.longitude, b.latitude, b.longitude);

  // Hard physical distance ceiling: stations more than 4 km apart are never co-located
  // (prevents generic master DB location labels like "Ultraviolette Automotive Charging Station, India"
  // or "Bolt.Earth Charging Station, India" in different states/cities from merging across India).
  if (distKm > 4.0) {
    return false;
  }

  if (
    a.exactLocationCoordinates &&
    b.exactLocationCoordinates &&
    a.exactLocationCoordinates.trim() === b.exactLocationCoordinates.trim() &&
    distKm <= 0.5
  ) {
    return true;
  }

  // 1. Co-located coordinates (within 1.35 km — same building, address, or highway plaza)
  if (distKm <= 1.35) {
    return true;
  }

  // 2. Identical normalized location / address / city string entered by users within 4 km
  const locA = normalizeChargerLocationKey(a.location);
  const locB = normalizeChargerLocationKey(b.location);
  if (locA.length >= 2 && locA === locB && distKm <= 4.0) {
    return true;
  }

  // 3. Same city / town key within 4 km
  const cityA = extractChargerCityOrTownKey(a);
  const cityB = extractChargerCityOrTownKey(b);
  if (cityA.length >= 3 && cityB.length >= 3) {
    if (cityA === cityB && distKm <= 4.0) {
      return true;
    }
    const baseCityA = cityA.split(',').pop()?.trim() || cityA;
    const baseCityB = cityB.split(',').pop()?.trim() || cityB;
    if (
      baseCityA === baseCityB &&
      !MULTI_ZONE_METROS.has(baseCityA) &&
      distKm <= 4.0
    ) {
      return true;
    }
  }

  return false;
}

export function resolveClusterLocationLabel<
  T extends { name: string; location?: string | null; referenceName?: string; isMasterStation?: boolean }
>(group: T[]): string {
  // Prefer user/admin-submitted stations with real geographic addresses over generic master station labels
  const sortedGroup = [...group].sort((a, b) => {
    const aMaster = Boolean(a.isMasterStation) || (a.location || '').toLowerCase().endsWith('charging station, india');
    const bMaster = Boolean(b.isMasterStation) || (b.location || '').toLowerCase().endsWith('charging station, india');
    if (aMaster !== bMaster) return aMaster ? 1 : -1;
    return 0;
  });

  for (const st of sortedGroup) {
    const loc = (st.location || '').trim();
    if (
      loc &&
      !loc.toLowerCase().includes('coordinates found in same text section') &&
      !loc.toLowerCase().includes('exact coordinates not present')
    ) {
      const parts = loc
        .split(',')
        .map(p => p.trim())
        .filter(Boolean);
      if (parts.length >= 2) {
        const tail = parts.slice(-2).join(', ');
        if (!tail.toLowerCase().includes('charging station, india')) {
          return tail;
        }
      }
      return loc;
    }
  }
  const first = sortedGroup[0] || group[0];
  return first ? first.referenceName || first.name : 'Shared Charger Hub';
}

/**
 * Groups proximate or co-located charging stations into clusters based on the current map zoom level
 * as well as exact location, address, or city/town matching.
 */
export function clusterChargingStations<
  T extends {
    id: string;
    latitude: number;
    longitude: number;
    name: string;
    location?: string | null;
    referenceName?: string;
    exactLocationCoordinates?: string;
  }
>(stations: T[], zoom: number = 14): ChargerCluster<T>[] {
  if (!Array.isArray(stations) || stations.length === 0) return [];

  // Radius threshold in km based on zoom level so pins never pile on top of each other
  // while keeping distinct cities/towns (e.g. Kolar vs Bengaluru) separate at India/State zoom.
  let thresholdKm = 1.35;
  if (zoom <= 4) thresholdKm = 65;
  else if (zoom === 5) thresholdKm = 32;
  else if (zoom === 6) thresholdKm = 22;
  else if (zoom === 7) thresholdKm = 14;
  else if (zoom === 8) thresholdKm = 9;
  else if (zoom === 9) thresholdKm = 5;
  else if (zoom === 10) thresholdKm = 3;
  else if (zoom === 11) thresholdKm = 1.8;
  else thresholdKm = 1.35; // zoom >= 12 groups co-located/same-plaza stations

  const visited = new Set<string>();
  const clusters: ChargerCluster<T>[] = [];

  for (let i = 0; i < stations.length; i++) {
    const anchor = stations[i];
    if (visited.has(anchor.id)) continue;

    visited.add(anchor.id);
    const group: T[] = [anchor];

    // Efficient single-pass spatial clustering: groups stations within zoom threshold or co-located with anchor
    for (let j = i + 1; j < stations.length; j++) {
      const candidate = stations[j];
      if (visited.has(candidate.id)) continue;

      const distToAnchorKm = calculateDistanceKm(
        anchor.latitude,
        anchor.longitude,
        candidate.latitude,
        candidate.longitude
      );

      const isClustered =
        distToAnchorKm <= thresholdKm ||
        areChargingStationsCoLocated(anchor, candidate);

      if (isClustered) {
        visited.add(candidate.id);
        group.push(candidate);
      }
    }

    if (group.length === 1) {
      clusters.push({
        id: anchor.id,
        isCluster: false,
        count: 1,
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        locationLabel: resolveClusterLocationLabel(group),
        stations: group
      });
    } else {
      const avgLat = group.reduce((acc, s) => acc + s.latitude, 0) / group.length;
      const avgLng = group.reduce((acc, s) => acc + s.longitude, 0) / group.length;
      clusters.push({
        id: `cluster_${group.map(g => g.id).join('_')}`,
        isCluster: true,
        count: group.length,
        latitude: Number(avgLat.toFixed(5)),
        longitude: Number(avgLng.toFixed(5)),
        locationLabel: resolveClusterLocationLabel(group),
        stations: group
      });
    }
  }

  return clusters;
}

/**
 * Always groups 2 or more charging stations that share the same coordinates, address, or city/town
 * regardless of charger type (Community, Supernova, Type 6, Type 2, Socket, or 3rd Party).
 */
export function groupCoLocatedChargingStations<
  T extends {
    id: string;
    latitude: number;
    longitude: number;
    name: string;
    location?: string | null;
    referenceName?: string;
    exactLocationCoordinates?: string;
  }
>(stations: T[]): ChargerCluster<T>[] {
  return clusterChargingStations(stations, 14);
}

/**
 * Builds a real Google Maps Directions URL to a charging station's verified coordinates,
 * optionally starting from the user's current coordinates. Never fabricates routes or travel times.
 */
export function buildChargerNavigationUrl(
  station: { latitude: number; longitude: number; name?: string; location?: string },
  origin?: { latitude: number; longitude: number } | null
): string {
  const lat = Number(station.latitude);
  const lng = Number(station.longitude);
  if (isNaN(lat) || isNaN(lng)) {
    return 'https://maps.google.com/maps';
  }

  const daddr = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  if (
    origin &&
    typeof origin.latitude === 'number' &&
    typeof origin.longitude === 'number' &&
    isFinite(origin.latitude) &&
    isFinite(origin.longitude)
  ) {
    const saddr = `${origin.latitude.toFixed(6)},${origin.longitude.toFixed(6)}`;
    return `https://maps.google.com/maps?saddr=${saddr}&daddr=${daddr}`;
  }
  return `https://maps.google.com/maps?daddr=${daddr}`;
}

// ============================================================================
// SMART LOCATION AUTOCOMPLETE FOR CHARGER SUBMISSIONS (INDIA PLACES ENGINE)
// ============================================================================

export interface PlaceSuggestion {
  id: string;
  name: string;
  locality: string;
  address: string;
  category: string;
  latitude: number;
  longitude: number;
  source?: string;
}

const PLACE_QUERY_STOP_WORDS = new Set([
  'near',
  'nearby',
  'around',
  'in',
  'at',
  'close',
  'to',
  'by',
  'beside',
  'opposite',
  'towards',
  'along',
  'on',
  'the',
  'for',
  'of',
  'and',
  'with',
  'from'
]);

const INDIAN_PLACE_ABBREVIATIONS: Record<string, string[]> = {
  ccd: ['Cafe Coffee Day', 'Café Coffee Day', 'Coffee Day'],
  coffee: ['Cafe Coffee Day', 'Café Coffee Day', 'Coffee Shop', 'Third Wave Coffee'],
  cofe: ['Cafe Coffee Day', 'Café', 'Coffee'],
  coffe: ['Cafe Coffee Day', 'Café', 'Coffee'],
  cofee: ['Cafe Coffee Day', 'Café', 'Coffee'],
  cafe: ['Café', 'Cafe Coffee Day', 'Coffee Shop', 'Restaurant'],
  cafes: ['Café', 'Cafe', 'Coffee Shop'],
  restaurant: ['Restaurant', 'Café', 'Food Court', 'Hotel', 'Tiffin'],
  restaurants: ['Restaurant', 'Café', 'Food Court', 'Hotel', 'Tiffin'],
  eatery: ['Restaurant', 'Café'],
  dhaba: ['Restaurant', 'Highway Food'],
  petrol: ['Petrol Pump', 'Fuel', 'Service Station', 'IndianOil', 'HP', 'Shell', 'BPCL'],
  pump: ['Petrol Pump', 'Fuel', 'Service Station', 'IndianOil', 'HP', 'Shell', 'BPCL'],
  pumps: ['Petrol Pump', 'Fuel', 'Service Station'],
  bunk: ['Petrol Pump', 'Fuel', 'Service Station'],
  fuel: ['Petrol Pump', 'Fuel', 'Service Station', 'IndianOil', 'HP', 'Shell', 'BPCL'],
  ev: ['EV Charging Station', 'EV Hub', 'Supernova', 'Charging', 'Electric'],
  charging: ['EV Charging Station', 'Charging', 'Supernova', 'EV Hub', 'Recharge'],
  charger: ['EV Charging Station', 'Charging', 'Supernova', 'EV Hub'],
  chargers: ['EV Charging Station', 'Charging', 'Supernova', 'EV Hub'],
  station: ['Station', 'EV Charging Station', 'Service Station', 'Hub', 'Hangar'],
  stations: ['Station', 'EV Charging Station', 'Service Station', 'Hub'],
  a2b: ['Adyar Ananda Bhavan', 'A2B Veg Restaurant'],
  mtr: ['Mavalli Tiffin Room', 'MTR Restaurant'],
  hp: ['Hindustan Petroleum', 'HP Petrol Pump'],
  hpcl: ['Hindustan Petroleum', 'HP Petrol Pump'],
  iocl: ['IndianOil', 'Indian Oil Petrol Pump'],
  bpcl: ['Bharat Petroleum', 'BPCL Petrol Pump'],
  blr: ['Bengaluru', 'Bangalore'],
  bangalore: ['Bengaluru', 'Bangalore'],
  bengaluru: ['Bangalore', 'Bengaluru'],
  bengluru: ['Bengaluru', 'Bangalore'],
  banglore: ['Bengaluru', 'Bangalore'],
  indranagar: ['Indiranagar'],
  koramangla: ['Koramangala'],
  mys: ['Mysuru', 'Mysore'],
  mysore: ['Mysuru', 'Mysore'],
  mysuru: ['Mysore', 'Mysuru'],
  mangalore: ['Mangaluru', 'Mangalore'],
  mangaluru: ['Mangalore', 'Mangaluru'],
  tumkur: ['Tumakuru', 'Tumkur'],
  tumakuru: ['Tumkur', 'Tumakuru'],
  hubli: ['Hubballi', 'Hubli'],
  belgaum: ['Belagavi', 'Belgaum'],
  shimoga: ['Shivamogga', 'Shimoga'],
  bellary: ['Ballari', 'Bellary'],
  hyd: ['Hyderabad'],
  chn: ['Chennai'],
  madras: ['Chennai'],
  del: ['New Delhi', 'Delhi'],
  gurgaon: ['Gurugram', 'Gurgaon'],
  gurugram: ['Gurgaon', 'Gurugram'],
  mum: ['Mumbai'],
  bombay: ['Mumbai'],
  poona: ['Pune'],
  cochin: ['Kochi'],
  calicut: ['Kozhikode'],
  trivandrum: ['Thiruvananthapuram'],
  pondicherry: ['Puducherry'],
  vizag: ['Visakhapatnam']
};

/**
 * Computes whether two lowercase strings are within 1 edit (Levenshtein distance <= 1)
 * for typo tolerance on tokens >= 4 chars (e.g. "kolr" -> "kolar", "cofee" -> "coffee").
 */
function isWithinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      edits++;
      if (edits > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else {
        i++;
        j++;
      }
    }
  }
  if (i < a.length || j < b.length) edits++;
  return edits <= 1;
}

/**
 * Expands Indian commercial & geographic shorthand and natural-language queries
 * (e.g. "Kolar CCD" -> ["Kolar CCD", "Kolar Cafe Coffee Day", "Cafe Coffee Day Kolar"],
 * "petrol pump near Kolar" -> ["petrol pump Kolar", "fuel Kolar", "IndianOil Kolar"],
 * "EV charging station Bangalore" -> ["EV charging station Bengaluru", "charging station Bangalore"])
 * so both live geocoders and place ranking match natural Google Maps-style queries accurately.
 */
export function expandIndianPlaceQuery(rawQuery: string): string[] {
  const cleaned = (rawQuery || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return [];

  const variants = new Set<string>();
  const rawTokens = cleaned.split(' ');
  const filteredTokens = rawTokens.filter(
    t => !PLACE_QUERY_STOP_WORDS.has(t.toLowerCase())
  );
  const activeTokens = filteredTokens.length > 0 ? filteredTokens : rawTokens;
  const baseCleaned = activeTokens.join(' ');
  variants.add(baseCleaned);
  variants.add(cleaned);

  const lowerJoin = baseCleaned.toLowerCase();

  // Natural-language phrase rewrites for live geocoders (Nominatim / Photon)
  if (lowerJoin.includes('petrol pump') || lowerJoin.includes('petrol bunk') || lowerJoin.includes('fuel station')) {
    const placePart = baseCleaned
      .replace(/petrol\s+pumps?|petrol\s+bunks?|fuel\s+stations?|gas\s+stations?/gi, '')
      .trim();
    if (placePart) {
      variants.add(`fuel ${placePart}`);
      variants.add(`Petrol ${placePart}`);
      variants.add(`IndianOil ${placePart}`);
      variants.add(`HP Petrol ${placePart}`);
    }
  }

  if (lowerJoin.includes('ev charging') || lowerJoin.includes('charging station') || lowerJoin.includes('ev station')) {
    const placePart = baseCleaned
      .replace(/ev\s+charging\s+stations?|charging\s+stations?|ev\s+stations?|ev\s+chargers?/gi, '')
      .trim();
    if (placePart) {
      variants.add(`charging station ${placePart}`);
      variants.add(`EV ${placePart}`);
    }
  }

  if (lowerJoin.includes('restaurants') || lowerJoin.includes('restaurant')) {
    const placePart = baseCleaned.replace(/restaurants?/gi, '').trim();
    if (placePart) {
      variants.add(`restaurant ${placePart}`);
      variants.add(`cafe ${placePart}`);
    }
  }

  const lowerTokens = activeTokens.map(t => t.toLowerCase());
  for (let i = 0; i < lowerTokens.length; i++) {
    const expansions = INDIAN_PLACE_ABBREVIATIONS[lowerTokens[i]];
    if (expansions) {
      for (const exp of expansions) {
        const replaced = [...activeTokens];
        replaced[i] = exp;
        variants.add(replaced.join(' '));
        if (activeTokens.length === 2) {
          const otherIdx = i === 0 ? 1 : 0;
          variants.add(`${exp} ${activeTokens[otherIdx]}`);
        }
      }
    }
  }

  return Array.from(variants);
}

/**
 * Real-coordinate directory of high-frequency Indian highway cafés, Café Coffee Day (CCD) branches,
 * restaurants, fuel stations, EV charging hubs, malls, hotels, and urban landmarks across India.
 * Combined with live OpenStreetMap Nominatim & Photon place-search results.
 */
export const VERIFIED_INDIA_PLACES_DIRECTORY: PlaceSuggestion[] = [
  // Kolar & NH 75 (Bengaluru–Kolar–Tirupati Highway Corridor)
  {
    id: 'poi_kolar_ccd_tamaka',
    name: 'Café Coffee Day (CCD) — Kolar NH 75 Bypass',
    locality: 'Tamaka, Kolar, Karnataka',
    address: 'NH 75 (Old Madras Road), Near R.L. Jalappa Hospital & Tamaka Industrial Area, Kolar, Karnataka 563103',
    category: 'Café / Coffee Shop',
    latitude: 13.1328,
    longitude: 78.1715
  },
  {
    id: 'poi_kolar_ccd_narasapura',
    name: 'Café Coffee Day (CCD) — Narasapura Highway Plaza',
    locality: 'Narasapura Industrial Area, Kolar, Karnataka',
    address: 'Bengaluru–Chennai Highway (NH 75), Narasapura Bypass, Kolar District, Karnataka 563133',
    category: 'Café / Coffee Shop',
    latitude: 13.1412,
    longitude: 78.0114
  },
  {
    id: 'poi_kolar_ccd_mulbagal',
    name: 'Café Coffee Day (CCD) — Mulbagal Highway Lounge',
    locality: 'Mulbagal / Kolar East, Karnataka',
    address: 'NH 75 Highway Plaza, Near Mulbagal Toll Gate, Kolar District, Karnataka 563131',
    category: 'Café / Coffee Shop',
    latitude: 13.1645,
    longitude: 78.3932
  },
  {
    id: 'poi_kolar_woodys',
    name: 'Woodys Pure Vegetarian Restaurant & Café',
    locality: 'Tamaka, Kolar, Karnataka',
    address: 'Old Madras Road (NH 75), Tamaka, Kolar Taluk, Kolar, Karnataka 563101',
    category: 'Restaurant & Café',
    latitude: 13.1325,
    longitude: 78.1694
  },
  {
    id: 'poi_kolar_a2b',
    name: 'Adyar Ananda Bhavan (A2B) — Kolar Highway Plaza',
    locality: 'Bellur / Kolar Bypass, Karnataka',
    address: 'NH 75 (Old Madras Road), Highway Food Court Plaza, Kolar, Karnataka 563101',
    category: 'Restaurant',
    latitude: 13.1354,
    longitude: 78.1489
  },
  {
    id: 'poi_kolar_empire',
    name: 'Empire Highway Restaurant & EV Stopover — Kolar',
    locality: 'Arabi Kothanur, Kolar NH 75, Karnataka',
    address: 'NH 75 (Bengaluru–Tirupati Highway), Arabi Kothanur, Kolar District, Karnataka 563133',
    category: 'Restaurant & Café',
    latitude: 13.1388,
    longitude: 78.0812
  },
  {
    id: 'poi_kolar_iocl',
    name: 'IndianOil Swagat Highway Petrol Pump & EV Station — Kolar',
    locality: 'Kondarajanahalli, Kolar, Karnataka',
    address: 'NH 75 Bypass Road, Kondarajanahalli, Kolar, Karnataka 563101',
    category: 'Petrol Pump & Service Station',
    latitude: 13.1296,
    longitude: 78.1182
  },
  {
    id: 'poi_kolar_hp_tamaka',
    name: 'HP Highway Petrol Pump & EV Charging Point — Kolar Tamaka',
    locality: 'Tamaka NH 75, Kolar, Karnataka',
    address: 'Old Madras Road (NH 75), Near Tamaka Junction, Kolar, Karnataka 563103',
    category: 'Petrol Pump & Service Station',
    latitude: 13.1339,
    longitude: 78.1638
  },
  {
    id: 'poi_kolar_bpcl_narasapura',
    name: 'Bharat Petroleum (BPCL) Highway Petrol Pump — Narasapura Kolar',
    locality: 'Narasapura Industrial Area, Kolar, Karnataka',
    address: 'NH 75 Highway Service Lane, Narasapura, Kolar District, Karnataka 563133',
    category: 'Petrol Pump & Service Station',
    latitude: 13.1424,
    longitude: 78.0195
  },
  {
    id: 'poi_kolar_city',
    name: 'Kolar Clock Tower & MG Road Junction',
    locality: 'Kolar Town, Karnataka',
    address: 'MG Road, Kolar Town Center, Kolar District, Karnataka 563101',
    category: 'Landmark / Junction',
    latitude: 13.1362,
    longitude: 78.1291
  },

  // Bengaluru–Mysuru Expressway (NH 275) & Maddur / Channapatna
  {
    id: 'poi_maddur_ccd',
    name: 'Café Coffee Day (CCD) — Maddur Highway Waypoint',
    locality: 'Maddur Bypass, Mandya, Karnataka',
    address: 'Bengaluru–Mysuru Expressway (NH 275) KM 82, Shivapura, Maddur, Karnataka 571428',
    category: 'Café / Coffee Shop',
    latitude: 12.5841,
    longitude: 77.0428
  },
  {
    id: 'poi_maddur_tiffanys',
    name: 'Maddur Tiffany’s Highway Restaurant',
    locality: 'Maddur, Mandya District, Karnataka',
    address: 'Mysore–Bangalore Highway, Shivapura, Maddur, Karnataka 571428',
    category: 'Restaurant',
    latitude: 12.5869,
    longitude: 77.0449
  },
  {
    id: 'poi_channapatna_ccd',
    name: 'Café Coffee Day (CCD) — Kamat Upachar Channapatna',
    locality: 'Channapatna Bypass, Ramanagara, Karnataka',
    address: 'Bengaluru–Mysuru Highway (NH 275), Channapatna, Ramanagara District, Karnataka 562160',
    category: 'Café / Coffee Shop',
    latitude: 12.6518,
    longitude: 77.2067
  },

  // Bengaluru Urban (EV Charging Stations, Cafés, Restaurants, Malls, Hangars, Fuel)
  {
    id: 'poi_blr_uv_hangar',
    name: 'Ultraviolette Hangar & Supernova EV Charging Station — Indiranagar',
    locality: 'Indiranagar, Bengaluru (Bangalore), Karnataka',
    address: '529, 100 Feet Rd, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka 560038',
    category: 'EV Charging Station & Hub',
    latitude: 12.9719,
    longitude: 77.6412
  },
  {
    id: 'poi_blr_bescom_mgroad',
    name: 'BESCOM Fast EV Charging Station — MG Road Boulevard',
    locality: 'MG Road, Central Bengaluru (Bangalore), Karnataka',
    address: 'Mahatma Gandhi Road, Near Trinity Metro & Barton Centre, Bengaluru, Karnataka 560001',
    category: 'EV Charging Station',
    latitude: 12.9746,
    longitude: 77.6094
  },
  {
    id: 'poi_blr_zeon_ubcity',
    name: 'Zeon Fast EV Charging Station — UB City Plaza',
    locality: 'Vittal Mallya Road, Bengaluru (Bangalore), Karnataka',
    address: 'UB City Parking Level B1, 24 Vittal Mallya Road, Ashok Nagar, Bengaluru, Karnataka 560001',
    category: 'EV Charging Station',
    latitude: 12.9716,
    longitude: 77.5961
  },
  {
    id: 'poi_blr_statiq_koramangala',
    name: 'Statiq & Tata Power EV Charging Station — Koramangala 80 Ft Road',
    locality: 'Koramangala 4th Block, Bengaluru (Bangalore), Karnataka',
    address: '80 Feet Road, Sony World Signal, Koramangala 4th Block, Bengaluru, Karnataka 560034',
    category: 'EV Charging Station',
    latitude: 12.9362,
    longitude: 77.6269
  },
  {
    id: 'poi_blr_ccd_indiranagar',
    name: 'Café Coffee Day (CCD) — 100 Feet Road Indiranagar',
    locality: 'HAL 2nd Stage, Indiranagar, Bengaluru',
    address: '100 Feet Road, Near Domlur Flyover, Indiranagar, Bengaluru, Karnataka 560038',
    category: 'Café / Coffee Shop',
    latitude: 12.9634,
    longitude: 77.6415
  },
  {
    id: 'poi_blr_third_wave',
    name: 'Third Wave Coffee Roasters — Indiranagar',
    locality: '12th Main, Indiranagar, Bengaluru',
    address: '729, CMH Road & 12th Main Junction, Indiranagar, Bengaluru, Karnataka 560038',
    category: 'Café / Coffee Shop',
    latitude: 12.9708,
    longitude: 77.6386
  },
  {
    id: 'poi_blr_mtr_lalbagh',
    name: 'Mavalli Tiffin Room (MTR 1924) — Lalbagh',
    locality: 'Lalbagh Road, Basavanagudi, Bengaluru',
    address: '14, Lalbagh Main Road, Doddamavalli, Sudhama Nagar, Bengaluru, Karnataka 560027',
    category: 'Restaurant',
    latitude: 12.9552,
    longitude: 77.5855
  },
  {
    id: 'poi_blr_ub_city',
    name: 'UB City Mall & Commercial Towers',
    locality: 'Vittal Mallya Road, Ashok Nagar, Bengaluru',
    address: '24, Vittal Mallya Rd, KG Halli, D Souza Layout, Ashok Nagar, Bengaluru, Karnataka 560001',
    category: 'Mall & Commercial Building',
    latitude: 12.9716,
    longitude: 77.5961
  },
  {
    id: 'poi_blr_phoenix_whitefield',
    name: 'Phoenix Marketcity Mall & EV Charging Zone — Whitefield',
    locality: 'Mahadevapura, Whitefield, Bengaluru',
    address: 'Whitefield Main Road, Devasandra Industrial Estate, Mahadevapura, Bengaluru, Karnataka 560048',
    category: 'Mall & Commercial Building',
    latitude: 12.9958,
    longitude: 77.6964
  },
  {
    id: 'poi_blr_shell_devanahalli',
    name: 'Shell Fuel & EV Recharge Station — Devanahalli Airport Highway',
    locality: 'Devanahalli, Bengaluru North, Karnataka',
    address: 'Bellary Road (NH 44), Opposite Kempegowda International Airport Trumpet Interchange, Bengaluru 562110',
    category: 'Petrol Pump & Service Station',
    latitude: 13.2085,
    longitude: 77.7082
  },

  // Mumbai, Lonavala & Pune Corridor
  {
    id: 'poi_lonavala_food_mall',
    name: 'Lonavala Expressway Food Mall & Café Coffee Day',
    locality: 'Lonavala Exit, Mumbai–Pune Expressway, Maharashtra',
    address: 'Mumbai–Pune Expressway KM 54, Khalapur / Lonavala Toll Plaza, Maharashtra 410401',
    category: 'Highway Food Court & Café',
    latitude: 18.7557,
    longitude: 73.4091
  },
  {
    id: 'poi_mum_worli_uv',
    name: 'Worli Sea Face Promenade & UV Space Station',
    locality: 'Worli, Mumbai, Maharashtra',
    address: 'Dr Annie Besant Road, Worli Sea Face, Mumbai, Maharashtra 400030',
    category: 'Commercial Building & Landmark',
    latitude: 19.0176,
    longitude: 72.8172
  },
  {
    id: 'poi_mum_phoenix_palladium',
    name: 'Phoenix Palladium Mall & St. Regis Hotel',
    locality: 'Lower Parel, Mumbai, Maharashtra',
    address: '462, Senapati Bapat Marg, Lower Parel, Mumbai, Maharashtra 400013',
    category: 'Hotel & Mall',
    latitude: 18.9947,
    longitude: 72.8246
  },
  {
    id: 'poi_pune_wakad_hp',
    name: 'HP Highway Service Station & EV Bay — Wakad',
    locality: 'Wakad NH 48, Pune, Maharashtra',
    address: 'Mumbai–Bangalore Highway (NH 48), Bhujbal Chowk, Wakad, Pune, Maharashtra 411057',
    category: 'Petrol Pump & Service Station',
    latitude: 18.5987,
    longitude: 73.7621
  },

  // Delhi NCR, Chennai, Hyderabad & Kochi
  {
    id: 'poi_del_cp',
    name: 'Connaught Place Outer Circle & Starbucks / CCD Block M',
    locality: 'Connaught Place, New Delhi',
    address: 'Block M, Outer Circle, Connaught Place, New Delhi, Delhi 110001',
    category: 'Commercial Hub & Café',
    latitude: 28.6315,
    longitude: 77.2167
  },
  {
    id: 'poi_chn_ecr_mahabalipuram',
    name: 'ECR Mahabalipuram Café & Coastal Waypoint',
    locality: 'Mamallapuram, East Coast Road (ECR), Tamil Nadu',
    address: 'East Coast Road (SH 49), Mamallapuram / Chennai Corridor, Tamil Nadu 603104',
    category: 'Café & Highway Landmark',
    latitude: 12.6208,
    longitude: 80.1945
  },
  {
    id: 'poi_hyd_hitec_cyber',
    name: 'HITEC City Cyber Towers & Trident Hotel Plaza',
    locality: 'Madhapur, HITEC City, Hyderabad, Telangana',
    address: 'HITEC City Main Road, Patrika Nagar, Madhapur, Hyderabad, Telangana 500081',
    category: 'Hotel & Commercial Building',
    latitude: 17.4435,
    longitude: 78.3772
  },
  {
    id: 'poi_kochi_lulu_edappally',
    name: 'LuLu International Shopping Mall — Edappally Junction',
    locality: 'Edappally NH 66, Kochi, Kerala',
    address: '34/1000, Old NH 47 / NH 66 Bypass Junction, Edappally, Kochi, Kerala 682024',
    category: 'Mall & Commercial Building',
    latitude: 10.0261,
    longitude: 76.3125
  },
  {
    id: 'poi_kerala_kochi_hub',
    name: 'Kerala — Kochi (Ernakulam NH 66 / NH 544 Highway Hub)',
    locality: 'Kochi, Ernakulam, Kerala',
    address: 'Edappally–Vyttila NH 66 Highway Corridor, Kochi, Kerala 682024',
    category: 'City & Highway Destination',
    latitude: 10.0190,
    longitude: 76.3142
  },
  {
    id: 'poi_kerala_thrissur_hub',
    name: 'Thrissur Swaraj Round & NH 544 Highway Hub, Kerala',
    locality: 'Thrissur, Kerala',
    address: 'Mannuthy–Swaraj Round Corridor, NH 544, Thrissur, Kerala 680001',
    category: 'City & Highway Destination',
    latitude: 10.4937,
    longitude: 76.2541
  },
  {
    id: 'poi_kerala_kozhikode_hub',
    name: 'Kozhikode (Calicut) Beach & NH 66 Highway Hub, Kerala',
    locality: 'Kozhikode (Calicut), Kerala',
    address: 'Thondayad Bypass & Beach Road, Kozhikode, Kerala 673001',
    category: 'City & Coastal Destination',
    latitude: 11.2588,
    longitude: 75.7804
  },
  {
    id: 'poi_kerala_palakkad_hub',
    name: 'Palakkad Highway Bypass & Fort Junction, Kerala',
    locality: 'Palakkad, Kerala',
    address: 'NH 544 Chandra Nagar Bypass Junction, Palakkad, Kerala 678007',
    category: 'City & Highway Waypoint',
    latitude: 10.7867,
    longitude: 76.6548
  },
  {
    id: 'poi_kerala_trivandrum_hub',
    name: 'Thiruvananthapuram (Trivandrum) Technopark & NH 66 Hub, Kerala',
    locality: 'Kazhakkoottam, Thiruvananthapuram, Kerala',
    address: 'NH 66 Kazhakkoottam Bypass, Thiruvananthapuram, Kerala 695581',
    category: 'City & Highway Destination',
    latitude: 8.5526,
    longitude: 76.9429
  },
  {
    id: 'poi_coimbatore_avinashi_hub',
    name: 'Coimbatore Avinashi Road & L&T Bypass Junction',
    locality: 'Coimbatore, Tamil Nadu',
    address: 'NH 544 L&T Bypass & Avinashi Road, Coimbatore, Tamil Nadu 641014',
    category: 'City & Highway Waypoint',
    latitude: 11.0204,
    longitude: 76.9923
  },
  {
    id: 'poi_salem_five_roads_hub',
    name: 'Salem NH 44 / NH 544 Highway Junction',
    locality: 'Salem, Tamil Nadu',
    address: 'NH 44 Kondalampatti & Five Roads Bypass, Salem, Tamil Nadu 636004',
    category: 'City & Highway Waypoint',
    latitude: 11.6646,
    longitude: 78.1233
  },
  // Iconic Riding Destinations, Hills, Toll Gates & Highway Waypoints
  {
    id: 'poi_nandi_hills_summit',
    name: 'Nandi Hills Summit Parking Gate',
    locality: 'Nandi Hills, Chikkaballapur, Karnataka',
    address: 'Nandi Hills Summit Viewpoint & Fortress Gate, Chikkaballapur District, Karnataka 562103',
    category: 'Hill Station & Viewpoint',
    latitude: 13.3702,
    longitude: 77.6835
  },
  {
    id: 'poi_blr_hebbal_flyover',
    name: 'Hebbal Flyover Service Lane, Bengaluru',
    locality: 'Hebbal NH 44, Bengaluru, Karnataka',
    address: 'Bellary Road (NH 44) Northbound Service Lane, Hebbal Flyover, Bengaluru, Karnataka 560024',
    category: 'Meeting Point & Highway Junction',
    latitude: 13.0358,
    longitude: 77.5970
  },
  {
    id: 'poi_blr_nelamangala_toll',
    name: 'Nelamangala Expressway Toll Gate',
    locality: 'Nelamangala NH 48 / NH 75, Bengaluru, Karnataka',
    address: 'Bengaluru–Mangaluru Highway (NH 75) Toll Plaza, Nelamangala, Bengaluru, Karnataka 562123',
    category: 'Meeting Point & Toll Plaza',
    latitude: 13.0335,
    longitude: 77.3986
  },
  {
    id: 'poi_devanahalli_ipc',
    name: 'Indian Paratha Company (IPC) — Devanahalli Nandi Cross',
    locality: 'Karahalli Cross, Devanahalli, Karnataka',
    address: 'NH 44 Bellary Road, Ghati Subramanya Road Cross, Devanahalli, Karnataka 562110',
    category: 'Restaurant & Highway Breakfast Stop',
    latitude: 13.2980,
    longitude: 77.7120
  },
  {
    id: 'poi_hoskote_toll',
    name: 'Hoskote Highway Toll Plaza & Junction',
    locality: 'Hoskote NH 75, Bengaluru East, Karnataka',
    address: 'Old Madras Road (NH 75), Hoskote Town Bypass, Bengaluru Rural, Karnataka 562114',
    category: 'Town & Highway Waypoint',
    latitude: 13.0730,
    longitude: 77.7921
  },
  {
    id: 'poi_kunigal_bypass',
    name: 'Kunigal Lake View Regroup Point & Café Coffee Day',
    locality: 'Kunigal NH 75 Bypass, Tumakuru, Karnataka',
    address: 'NH 75 Bengaluru–Hassan Highway Bypass, Kunigal, Karnataka 572130',
    category: 'Highway Stop & Lake View',
    latitude: 12.9860,
    longitude: 76.9920
  },
  {
    id: 'poi_hassan_highway_hub',
    name: 'Hassan Highway EV Hub & Bypass Plaza',
    locality: 'BM Road, Hassan Bypass, Karnataka',
    address: 'NH 75 Bengaluru–Mangaluru Highway Bypass, Hassan, Karnataka 573201',
    category: 'EV Charging Station & Highway Hub',
    latitude: 13.0070,
    longitude: 76.0960
  },
  {
    id: 'poi_sakleshpur_viewpoint',
    name: 'Sakleshpur Valley Viewpoint & Manjarabad Fort',
    locality: 'Sakleshpur Western Ghats, Hassan, Karnataka',
    address: 'NH 75 Shiradi Ghat Crest, Sakleshpur, Hassan District, Karnataka 573134',
    category: 'Hill Station & Ghat Viewpoint',
    latitude: 12.9698,
    longitude: 75.7874
  },
  {
    id: 'poi_chikmagalur_mullayanagiri',
    name: 'Mullayanagiri Peak & Chikmagalur Coffee Trail',
    locality: 'Chikkamagaluru, Karnataka',
    address: 'Mullayanagiri Summit Road, Baba Budangiri Range, Chikkamagaluru, Karnataka 577101',
    category: 'Hill Station & Mountain Peak',
    latitude: 13.3909,
    longitude: 75.7214
  },
  {
    id: 'poi_coorg_madikeri',
    name: 'Madikeri Glass Bridge & Coorg Raja Seat',
    locality: 'Madikeri, Coorg (Kodagu), Karnataka',
    address: 'Stuart Hill, Raja Seat Road, Madikeri, Kodagu District, Karnataka 571201',
    category: 'Hill Station & Viewpoint',
    latitude: 12.4244,
    longitude: 75.7382
  },
  {
    id: 'poi_mysuru_palace',
    name: 'Mysuru Palace & Chamundi Foothills',
    locality: 'Agrahara, Mysuru (Mysore), Karnataka',
    address: 'Sayyaji Rao Road, Agrahara, Chamrajpura, Mysuru, Karnataka 570001',
    category: 'City & Heritage Landmark',
    latitude: 12.3051,
    longitude: 76.6551
  },
  {
    id: 'poi_lepakshi_temple',
    name: 'Lepakshi Veerabhadra Temple & Nandi Monolith',
    locality: 'Lepakshi, Sri Sathya Sai District, Andhra Pradesh',
    address: 'NH 44 Kodikonda Checkpost Turnoff, Lepakshi, Andhra Pradesh 515331',
    category: 'Heritage Temple & Ride Destination',
    latitude: 13.8037,
    longitude: 77.6094
  },
  {
    id: 'poi_ooty_nilgiris',
    name: 'Ooty Doddabetta Peak & Nilgiri Ghats',
    locality: 'Udhagamandalam (Ooty), Nilgiris, Tamil Nadu',
    address: 'Charing Cross & Doddabetta Road, Ooty, Nilgiris District, Tamil Nadu 643001',
    category: 'Hill Station & Ghats',
    latitude: 11.4102,
    longitude: 76.6950
  },
  {
    id: 'poi_yercaud_loop',
    name: 'Yercaud 20-Hairpin Ghat & Emerald Lake',
    locality: 'Yercaud, Salem, Tamil Nadu',
    address: 'Shevaroy Hills Ghat Road, Yercaud, Salem District, Tamil Nadu 636601',
    category: 'Hill Station & Ghats',
    latitude: 11.7753,
    longitude: 78.2093
  },
  {
    id: 'poi_munnar_hills',
    name: 'Munnar Top Station & Tea Valley Ghats',
    locality: 'Munnar, Idukki, Kerala',
    address: 'Munnar–Mattupetty Road, Kannan Devan Hills, Munnar, Kerala 685612',
    category: 'Hill Station & Tea Estates',
    latitude: 10.0889,
    longitude: 77.0595
  },
  {
    id: 'poi_wayanad_lakkidi',
    name: 'Wayanad Lakkidi Viewpoint & Thamarassery Churam',
    locality: 'Kalpetta / Lakkidi, Wayanad, Kerala',
    address: 'NH 766 Lakkidi Ghat Viewpoint, Wayanad District, Kerala 673576',
    category: 'Hill Station & Ghat Viewpoint',
    latitude: 11.5124,
    longitude: 76.0191
  },
  {
    id: 'poi_horsley_hills',
    name: 'Horsley Hills Viewpoint & Whispering Winds',
    locality: 'Madanapalle, Annamayya District, Andhra Pradesh',
    address: 'Horsley Hills Ghat Road, Madanapalle, Andhra Pradesh 517325',
    category: 'Hill Station & Viewpoint',
    latitude: 13.6601,
    longitude: 78.3995
  },
  {
    id: 'poi_yelagiri_hills',
    name: 'Yelagiri Hills 14-Hairpin Bend Summit',
    locality: 'Yelagiri, Tirupattur, Tamil Nadu',
    address: 'Ponneri–Yelagiri Ghat Road, Athanavoor, Tamil Nadu 635853',
    category: 'Hill Station & Ghats',
    latitude: 12.5794,
    longitude: 78.6385
  }
];

/**
 * Ranks and deduplicates place suggestions from live geocoding providers
 * (OpenStreetMap Nominatim / Photon) and the verified India commercial POI directory,
 * prioritizing real geographic locations (cities, towns, villages, streets, landmarks, businesses)
 * without restricting results to chargers.
 */
export function searchAndRankPlaces(
  rawQuery: string,
  externalResults: PlaceSuggestion[] = [],
  biasLocation?: { latitude: number; longitude: number } | null
): PlaceSuggestion[] {
  const trimmed = (rawQuery || '').trim();
  if (trimmed.length < 2) return [];

  const expandedVariants = expandIndianPlaceQuery(trimmed);
  const rawTokensAll = trimmed
    .toLowerCase()
    .split(/[\s,.-]+/)
    .filter(Boolean);

  // Filter stop words ("near", "in", "around", etc.) so natural queries like "petrol pump near Kolar" match all meaningful tokens
  const filteredTokens = rawTokensAll.filter(t => !PLACE_QUERY_STOP_WORDS.has(t));
  const rawTokens = filteredTokens.length > 0 ? filteredTokens : rawTokensAll;

  const queryAsksForCharger = rawTokens.some(t =>
    ['ev', 'charging', 'charger', 'chargers', 'supernova', 'bescom', 'zeon', 'statiq', 'hangar', 'ultraviolette'].includes(t)
  );

  const externalSet = new Set(externalResults);
  const candidates = [...externalResults, ...VERIFIED_INDIA_PLACES_DIRECTORY];
  const scored: { item: PlaceSuggestion; score: number }[] = [];

  for (const item of candidates) {
    const isExternal = externalSet.has(item);

    // Do not inject static EV charging station POIs unless the user explicitly searched for an EV charger
    if (!isExternal && !queryAsksForCharger && item.category.toLowerCase().includes('ev charging')) {
      continue;
    }

    const nameLower = item.name.toLowerCase();
    const localityLower = item.locality.toLowerCase();
    const addressLower = item.address.toLowerCase();
    const categoryLower = item.category.toLowerCase();
    const combined = `${nameLower} ${localityLower} ${addressLower} ${categoryLower}`;
    const candidateWords = combined.split(/[\s,()—/.-]+/).filter(Boolean);

    let score = 0;
    let matchedRawTokenCount = 0;

    for (const rt of rawTokens) {
      const expansions = INDIAN_PLACE_ABBREVIATIONS[rt] || [];
      const tokenForms = [rt, ...expansions.map(e => e.toLowerCase())];

      let tokenMatched = false;
      for (const tf of tokenForms) {
        if (nameLower.includes(tf)) {
          score += 45;
          tokenMatched = true;
        }
        if (localityLower.includes(tf)) {
          score += 38;
          tokenMatched = true;
        }
        if (addressLower.includes(tf)) {
          score += 22;
          tokenMatched = true;
        }
        if (categoryLower.includes(tf)) {
          score += 28;
          tokenMatched = true;
        }
      }

      // Fuzzy / typo match fallback for tokens >= 4 chars (e.g. "cofee" -> "coffee", "kolr" -> "kolar")
      if (!tokenMatched && rt.length >= 4) {
        const fuzzyHit = candidateWords.some(
          cw => cw.length >= 4 && isWithinOneEdit(rt, cw)
        );
        if (fuzzyHit) {
          score += 25;
          tokenMatched = true;
        }
      }

      if (tokenMatched) {
        matchedRawTokenCount++;
      }
    }

    // Bonus when ALL meaningful user query tokens match (e.g., "Kolar" + "CCD", or "Kanhangad" + "Kerala")
    if (matchedRawTokenCount === rawTokens.length && rawTokens.length > 0) {
      score += 140;
    } else if (
      rawTokens.length >= 3 &&
      matchedRawTokenCount >= rawTokens.length - 1
    ) {
      score += 85;
    } else if (matchedRawTokenCount > 0 && isExternal) {
      score += 50;
    }

    // Exact phrase match bonus
    for (const variant of expandedVariants) {
      const vLower = variant.toLowerCase();
      if (nameLower === vLower) score += 110;
      else if (nameLower.startsWith(vLower)) score += 75;
      else if (nameLower.includes(vLower)) score += 60;
      if (combined.includes(vLower)) score += 30;
    }

    // Prioritize real geographic results from OpenStreetMap Nominatim / Photon
    if (isExternal) {
      score += 65;
      if (score === 65) {
        // External geocoder returned this directly for the query
        score = 85;
      }
    } else {
      // Static directory items must match ALL query tokens (or for 3+ token natural-language queries, at least N-1 tokens + locality)
      if (matchedRawTokenCount < rawTokens.length) {
        if (rawTokens.length >= 3 && matchedRawTokenCount >= rawTokens.length - 1) {
          const hasLocalityMatch = rawTokens.some(rt => {
            const forms = [rt, ...(INDIAN_PLACE_ABBREVIATIONS[rt] || []).map(e => e.toLowerCase())];
            return forms.some(f => localityLower.includes(f) || addressLower.includes(f));
          });
          if (!hasLocalityMatch) {
            score = 0;
          }
        } else {
          score = 0;
        }
      }
    }

    // Gentle location bias boost if biasLocation is provided (does not exclude distant matches)
    if (
      score > 0 &&
      biasLocation &&
      isFinite(biasLocation.latitude) &&
      isFinite(biasLocation.longitude)
    ) {
      const distKm = calculateDistanceKm(
        biasLocation.latitude,
        biasLocation.longitude,
        item.latitude,
        item.longitude
      );
      if (distKm <= 25) score += 18;
      else if (distKm <= 100) score += 10;
    }

    if (score > 0) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // Deduplicate by coordinate proximity (< 50m) + similar name (preserving distinct places with the same name)
  const deduplicated: PlaceSuggestion[] = [];
  for (const { item } of scored) {
    const isDuplicate = deduplicated.some(existing => {
      const dist = calculateDistanceKm(
        existing.latitude,
        existing.longitude,
        item.latitude,
        item.longitude
      );
      const sameName =
        existing.name.toLowerCase().slice(0, 12) === item.name.toLowerCase().slice(0, 12);
      return dist < 0.05 && sameName;
    });
    if (!isDuplicate) {
      deduplicated.push(item);
    }
    if (deduplicated.length >= 12) break;
  }

  return deduplicated;
}

/**
 * Validates that a string is a safe HTTP or HTTPS URL.
 */
export function isValidHttpUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const trimmed = urlStr.trim();
  if (!trimmed) return false;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  if (/^javascript:/i.test(trimmed)) return false;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

export interface ProductLink {
  url: string;
  name?: string;
}

/**
 * Sanitizes and validates product links for motorcycle modification submissions.
 * Prevents blank entries, validates HTTP/HTTPS format, and strips unsafe protocols.
 */
export function sanitizeAndValidateProductLinks(links: unknown): {
  valid: boolean;
  productLinks: ProductLink[];
  errors: string[];
} {
  if (!links || !Array.isArray(links)) {
    return { valid: true, productLinks: [], errors: [] };
  }

  const validLinks: ProductLink[] = [];
  const errors: string[] = [];

  links.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const rawUrl = typeof (item as any).url === 'string' ? (item as any).url.trim() : '';
    const rawName = typeof (item as any).name === 'string' ? (item as any).name.trim() : '';

    if (!rawUrl) {
      // Ignore empty optional fields to prevent blank entries
      return;
    }

    if (!isValidHttpUrl(rawUrl)) {
      errors.push(`Link #${index + 1} (${rawUrl}) must be a valid http:// or https:// URL.`);
    } else {
      validLinks.push({
        url: rawUrl,
        ...(rawName ? { name: rawName } : {})
      });
    }
  });

  return {
    valid: errors.length === 0,
    productLinks: validLinks,
    errors
  };
}

// ============================================================================
// OWNER, ADMIN & MEMBER ROLES + PRIMARY NAME & SECONDARY NICKNAME SYSTEM
// ============================================================================

export const MAX_CUSTOM_NAME_LENGTH = 30;

/**
 * Strips legacy seed callsign parentheticals like " (Vanguard)", " (Apex)", " (Phantom)"
 * so the user's original account display name remains clean and primary.
 */
export function stripLegacyCallsignSuffix(name?: string | null): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .replace(/\s*\((?:Vanguard|Apex|Phantom|Leader|Squadron Lead)\)\s*$/i, '')
    .trim();
}

/**
 * Securely identifies whether an account is the immutable Website Owner.
 * Never relies on display name or nickname alone; checks trusted account ID or explicit server flag.
 */
export function isOwnerAccount(
  user?: {
    id?: string;
    email?: string;
    role?: string;
    isOwner?: boolean;
  } | null
): boolean {
  if (!user) return false;
  if (user.id === OWNER_ACCOUNT_ID) return true;
  if (user.isOwner === true) return true;
  if (
    typeof user.email === 'string' &&
    user.email.trim().toLowerCase() === OWNER_ACCOUNT_EMAIL
  ) {
    return true;
  }
  return false;
}

/**
 * Checks whether an account is an appointed Admin or the Owner.
 */
export function isAdminOrOwnerAccount(
  user?: {
    id?: string;
    email?: string;
    role?: string;
    isOwner?: boolean;
  } | null
): boolean {
  if (!user) return false;
  if (isOwnerAccount(user)) return true;
  return user.role === 'admin' || user.role === 'superadmin' || user.role === 'owner';
}

/**
 * Resolves the canonical role tier label for display: OWNER, ADMIN, or MEMBER.
 */
export function getEffectiveRoleLabel(
  user?: {
    id?: string;
    email?: string;
    role?: string;
    isOwner?: boolean;
  } | null
): 'OWNER' | 'ADMIN' | 'MEMBER' {
  if (isOwnerAccount(user)) return 'OWNER';
  if (user?.role === 'admin' || user?.role === 'superadmin') return 'ADMIN';
  return 'MEMBER';
}

/**
 * Evaluates whether a user holds a specific granular administrative permission.
 * - The Owner automatically holds all administrative permissions.
 * - Appointed Admins hold ONLY the permissions explicitly granted by the Owner in `adminPermissions`.
 * - Regular members hold no administrative permissions.
 */
export function hasAdminPermission(
  user:
    | {
        id?: string;
        email?: string;
        role?: string;
        isOwner?: boolean;
        adminPermissions?: string[];
      }
    | null
    | undefined,
  permission: AdminPermission
): boolean {
  if (!user) return false;
  if (isOwnerAccount(user)) return true;
  if (user.role !== 'admin' && user.role !== 'superadmin') return false;
  if (!Array.isArray(user.adminPermissions)) return false;
  return user.adminPermissions.includes(permission);
}

/**
 * Sanitizes and validates an array of granular admin permissions.
 */
export function sanitizeAdminPermissions(input: unknown): AdminPermission[] {
  if (!Array.isArray(input)) return [];
  const validSet = new Set<AdminPermission>();
  for (const item of input) {
    if (typeof item === 'string' && VALID_ADMIN_PERMISSIONS.includes(item as AdminPermission)) {
      validSet.add(item as AdminPermission);
    }
  }
  return Array.from(validSet);
}

/**
 * Infers the default pilot nickname ('F77 PILOT' or 'X47 PILOT') from a user's motorcycle model.
 */
export function inferDefaultPilotNickname(motorcycleModel?: string | null): PilotNickname {
  if (typeof motorcycleModel === 'string' && motorcycleModel.toUpperCase().includes('X47')) {
    return 'X47 PILOT';
  }
  return 'F77 PILOT';
}

/**
 * Validates a member's self-selected nickname.
 * Members may select ONLY 'F77 PILOT' or 'X47 PILOT'. Arbitrary strings are rejected.
 */
export function validateMemberNicknameSelection(input: unknown): {
  valid: boolean;
  value?: PilotNickname;
  error?: string;
} {
  if (typeof input !== 'string') {
    return {
      valid: false,
      error: 'Nickname selection must be either F77 PILOT or X47 PILOT.'
    };
  }
  const trimmed = input.trim().toUpperCase();
  if (trimmed === 'F77 PILOT' || trimmed === 'X47 PILOT') {
    return { valid: true, value: trimmed as PilotNickname };
  }
  return {
    valid: false,
    error: 'Members may select only F77 PILOT or X47 PILOT. Custom nicknames are restricted to the Owner.'
  };
}

/**
 * Validates Owner-assigned custom primary display names or custom secondary tags:
 * - Trims leading and trailing spaces
 * - Enforces max length (30 chars by default)
 * - Rejects empty values (unless explicit reset action is used)
 * - Rejects control characters and HTML/script injection characters (<, >, `, javascript:)
 */
export function validateCustomDisplayText(
  input: unknown,
  maxLength = MAX_CUSTOM_NAME_LENGTH
): {
  valid: boolean;
  sanitized?: string;
  error?: string;
} {
  if (typeof input !== 'string') {
    return { valid: false, error: 'Value must be a valid text string.' };
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return { valid: false, error: 'Value cannot be empty. Use the Reset action to restore default.' };
  }
  if (trimmed.length > maxLength) {
    return {
      valid: false,
      error: `Value cannot exceed ${maxLength} characters (currently ${trimmed.length}).`
    };
  }
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return { valid: false, error: 'Control characters are not permitted.' };
  }
  if (/[<>`]/.test(trimmed) || /javascript:/i.test(trimmed) || /on\w+\s*=/i.test(trimmed)) {
    return { valid: false, error: 'HTML tags and unsafe script characters are not permitted.' };
  }
  return { valid: true, sanitized: trimmed };
}

export interface UserDisplayIdentity {
  primaryName: string;
  secondaryTag: string | null;
  originalName: string;
  customPrimaryName: string | null;
  pilotNickname: PilotNickname | string | null;
  customSecondaryTag: string | null;
  hideSecondaryTag: boolean;
  isOwner: boolean;
  roleLabel: 'OWNER' | 'ADMIN' | 'MEMBER';
}

/**
 * Resolves the exact display hierarchy for any user (Part 5.6):
 *
 * Primary Name:
 * 1. Owner-assigned custom primary displayed name (`customPrimaryName`), if one exists.
 * 2. Otherwise, the original account display name (`originalName` || cleaned `fullName`).
 *
 * Secondary Nickname / Tag:
 * 1. If `hideSecondaryTag` is true, returns null (no secondary tag).
 * 2. Owner-assigned custom secondary tag (`customSecondaryTag`), if one exists.
 * 3. Otherwise, the member-selected or owner-assigned nickname (`pilotNickname`).
 * 4. Otherwise, the motorcycle-inferred default ('F77 PILOT' or 'X47 PILOT').
 */
export function resolveUserDisplayIdentity(
  user?: {
    id?: string;
    email?: string;
    fullName?: string;
    originalName?: string;
    customPrimaryName?: string | null;
    pilotNickname?: PilotNickname | string | null;
    customSecondaryTag?: string | null;
    hideSecondaryTag?: boolean;
    motorcycleModel?: string;
    role?: string;
    isOwner?: boolean;
  } | null
): UserDisplayIdentity {
  if (!user) {
    return {
      primaryName: 'Community Member',
      secondaryTag: null,
      originalName: 'Community Member',
      customPrimaryName: null,
      pilotNickname: null,
      customSecondaryTag: null,
      hideSecondaryTag: false,
      isOwner: false,
      roleLabel: 'MEMBER'
    };
  }

  const rawOriginal =
    (typeof user.originalName === 'string' && user.originalName.trim()
      ? stripLegacyCallsignSuffix(user.originalName)
      : stripLegacyCallsignSuffix(user.fullName)) || 'Community Member';

  const customPrimary =
    typeof user.customPrimaryName === 'string' && user.customPrimaryName.trim().length > 0
      ? user.customPrimaryName.trim()
      : null;

  const primaryName = customPrimary || rawOriginal;

  const validPilotNickname: PilotNickname | string | null =
    user.pilotNickname === 'F77 PILOT' || user.pilotNickname === 'X47 PILOT'
      ? user.pilotNickname
      : typeof user.pilotNickname === 'string' && user.pilotNickname.trim().length > 0
      ? user.pilotNickname.trim()
      : user.motorcycleModel
      ? inferDefaultPilotNickname(user.motorcycleModel)
      : null;

  const customSecondary =
    typeof user.customSecondaryTag === 'string' && user.customSecondaryTag.trim().length > 0
      ? user.customSecondaryTag.trim()
      : null;

  const hideSecondary = Boolean(user.hideSecondaryTag);
  const secondaryTag = hideSecondary ? null : customSecondary || validPilotNickname || null;

  return {
    primaryName,
    secondaryTag,
    originalName: rawOriginal,
    customPrimaryName: customPrimary,
    pilotNickname: validPilotNickname,
    customSecondaryTag: customSecondary,
    hideSecondaryTag: hideSecondary,
    isOwner: isOwnerAccount(user),
    roleLabel: getEffectiveRoleLabel(user)
  };
}

/**
 * Resolves a content author's current primary name and secondary tag from the live user registry
 * so Owner/member name or nickname updates reflect consistently across all content without altering ownership IDs.
 */
export function resolveAuthorDisplayFromRegistry(
  authorId?: string | null,
  fallbackAuthorName?: string | null,
  usersRegistry?: Array<{
    id?: string;
    email?: string;
    fullName?: string;
    originalName?: string;
    customPrimaryName?: string | null;
    pilotNickname?: PilotNickname | string | null;
    customSecondaryTag?: string | null;
    hideSecondaryTag?: boolean;
    motorcycleModel?: string;
    role?: string;
    isOwner?: boolean;
  }>,
  fallbackModel?: string | null
): {
  primaryName: string;
  secondaryTag: string | null;
  roleLabel: 'OWNER' | 'ADMIN' | 'MEMBER';
  isOwner: boolean;
} {
  if (Array.isArray(usersRegistry) && usersRegistry.length > 0) {
    let matched = authorId ? usersRegistry.find(u => u.id === authorId) : undefined;
    if (!matched && fallbackAuthorName) {
      const cleanTarget = stripLegacyCallsignSuffix(fallbackAuthorName).toLowerCase();
      matched = usersRegistry.find(u => {
        const uOrig = stripLegacyCallsignSuffix(u.originalName || u.fullName).toLowerCase();
        const uFull = (u.fullName || '').trim().toLowerCase();
        return uOrig === cleanTarget || uFull === cleanTarget;
      });
    }
    if (matched) {
      const resolved = resolveUserDisplayIdentity(matched);
      return {
        primaryName: resolved.primaryName,
        secondaryTag: resolved.secondaryTag,
        roleLabel: resolved.roleLabel,
        isOwner: resolved.isOwner
      };
    }
  }

  const cleanedName = stripLegacyCallsignSuffix(fallbackAuthorName) || 'Community Member';
  const inferredTag = fallbackModel ? inferDefaultPilotNickname(fallbackModel) : null;
  return {
    primaryName: cleanedName,
    secondaryTag: inferredTag,
    roleLabel: 'MEMBER',
    isOwner: false
  };
}

/**
 * Evaluates whether a user is authorized to modify or delete a content record:
 * 1. The verified Owner can modify or delete ANY record across the entire website.
 * 2. An appointed Admin can modify or delete records ONLY if they hold the required granular permission.
 * 3. Regular members can modify or delete ONLY their own records.
 */
export function canUserModerateOrModifyRecord(
  user:
    | {
        id?: string;
        email?: string;
        fullName?: string;
        originalName?: string;
        role?: string;
        isOwner?: boolean;
        adminPermissions?: string[];
      }
    | null
    | undefined,
  record:
    | {
        userId?: string;
        authorId?: string;
        sellerId?: string;
        submittedByUserId?: string;
        rideLeaderId?: string;
        authorName?: string;
        reporterName?: string;
        sellerName?: string;
      }
    | null
    | undefined,
  requiredPermission?: AdminPermission
): boolean {
  if (!user || !record) return false;
  if (isOwnerAccount(user)) return true;

  if (requiredPermission && hasAdminPermission(user, requiredPermission)) {
    return true;
  }

  const uid = user.id?.trim();
  if (uid) {
    if (
      record.userId === uid ||
      record.authorId === uid ||
      record.sellerId === uid ||
      record.submittedByUserId === uid ||
      record.rideLeaderId === uid
    ) {
      return true;
    }
  }

  return false;
}

export const COCKPIT_IMAGE_ASSET_PATH = '/assets/ghost-protocol-cockpit-clean.jpg';
export const COCKPIT_IMAGE_DIMENSIONS = { width: 1536, height: 864 } as const;
export const COCKPIT_ROTARY_STAGE_ASSET_PATH = '/assets/ghost-protocol-rotary-stage.jpg';
export const COCKPIT_ROTARY_REFERENCE_ASSET_PATH = '/assets/ghost-protocol-rotary-reference.png';
export const COCKPIT_ROTARY_STAGE_DIMENSIONS = { width: 848, height: 1855 } as const;

export interface CockpitHotspotRegion {
  id: string;
  label: string;
  subtitle?: string;
  routeId: string;
  /** Percentage of 1536px reference width (0..100) */
  leftPct: number;
  /** Percentage of 864px reference height (0..100) */
  topPct: number;
  /** Percentage of 1536px reference width (0..100) */
  widthPct: number;
  /** Percentage of 864px reference height (0..100) */
  heightPct: number;
  accentTone: 'cyan' | 'amber' | 'green' | 'red';
}

export const COCKPIT_HOME_CARD_HOTSPOTS: CockpitHotspotRegion[] = [
  {
    id: 'card_jet_engineer',
    label: 'JET ENGINEER',
    subtitle: 'LEARN · FIX · MAINTAIN',
    routeId: 'jet_engineer',
    leftPct: Number(((172 / 1536) * 100).toFixed(2)),
    topPct: Number(((280 / 864) * 100).toFixed(2)),
    widthPct: Number(((576 / 1536) * 100).toFixed(2)),
    heightPct: Number(((168 / 864) * 100).toFixed(2)),
    accentTone: 'green'
  },
  {
    id: 'card_charging',
    label: 'CHARGING',
    subtitle: 'FIND · PLAN · SHARE',
    routeId: 'charging',
    leftPct: Number(((790 / 1536) * 100).toFixed(2)),
    topPct: Number(((280 / 864) * 100).toFixed(2)),
    widthPct: Number(((576 / 1536) * 100).toFixed(2)),
    heightPct: Number(((168 / 864) * 100).toFixed(2)),
    accentTone: 'cyan'
  },
  {
    id: 'card_squadron_assist',
    label: 'SQUADRON ASSIST',
    subtitle: 'COMMUNITY · SUPPORT · RIDE',
    routeId: 'emergency',
    leftPct: Number(((160 / 1536) * 100).toFixed(2)),
    topPct: Number(((456 / 864) * 100).toFixed(2)),
    widthPct: Number(((588 / 1536) * 100).toFixed(2)),
    heightPct: Number(((166 / 864) * 100).toFixed(2)),
    accentTone: 'red'
  },
  {
    id: 'card_mission_mode',
    label: 'MISSION MODE',
    subtitle: 'PLAN · TRACK · EXPLORE',
    routeId: 'mission',
    leftPct: Number(((790 / 1536) * 100).toFixed(2)),
    topPct: Number(((456 / 864) * 100).toFixed(2)),
    widthPct: Number(((588 / 1536) * 100).toFixed(2)),
    heightPct: Number(((166 / 864) * 100).toFixed(2)),
    accentTone: 'amber'
  }
];

export const COCKPIT_ALL_SYSTEM_CONTROLS_HOTSPOT: CockpitHotspotRegion = {
  id: 'panel_all_system_controls',
  label: 'ALL SYSTEM CONTROLS',
  subtitle: 'Access all features',
  routeId: 'system_controls',
  leftPct: Number(((520 / 1536) * 100).toFixed(2)),
  topPct: Number(((650 / 864) * 100).toFixed(2)),
  widthPct: Number(((498 / 1536) * 100).toFixed(2)),
  heightPct: Number(((118 / 864) * 100).toFixed(2)),
  accentTone: 'amber'
};

export type RotaryIconKey =
  | 'cog'
  | 'zap'
  | 'users'
  | 'navigation'
  | 'clipboard'
  | 'message'
  | 'cart'
  | 'book'
  | 'chart'
  | 'pin'
  | 'key'
  | 'shield';

export interface RotaryDestinationItem {
  id: string;
  /** Primary display name shown in the SELECTED PAGE panel */
  label: string;
  /** Compact 1-2 line label rendered inside the rotary wheel segment */
  segmentLines: [string] | [string, string];
  /** Short subtitle shown in the segment & SELECTED PAGE panel */
  subtitle: string;
  /** Compact 1-2 line subtitle rendered inside the rotary wheel segment */
  segmentSubLines: [string] | [string, string];
  /** Real application route identifier */
  routeId: string;
  /** Optional sub-mode for Jet Engineer */
  jetMode?: 'ask' | 'train';
  /** Optional sub-mode for Charging Network / Route Planner */
  chargingMode?: 'map' | 'autopilot';
  /** Icon identifier for the rotary segment & selected-page panel */
  iconKey: RotaryIconKey;
  /** If true, visible and accessible only to authorized administrators/owners */
  requiresAdminOrOwner?: boolean;
}

/**
 * Authoritative central Rotary Navigation Registry ordered clockwise starting from 12 o'clock (0°).
 * Contains the 10 main application pages for standard users (including MISSION MODE), plus ADMIN CENTRE
 * dynamically appended for authorized administrators (11 total).
 */
export const ROTARY_NAVIGATION_REGISTRY: RotaryDestinationItem[] = [
  {
    id: 'rotary_jet_engineer',
    label: 'JET ENGINEER',
    segmentLines: ['JET ENGINEER'],
    subtitle: '',
    segmentSubLines: [''],
    routeId: 'jet_engineer',
    jetMode: 'ask',
    iconKey: 'cog'
  },
  {
    id: 'rotary_charging_network',
    label: 'CHARGING NETWORK',
    segmentLines: ['CHARGING', 'NETWORK'],
    subtitle: '',
    segmentSubLines: [''],
    routeId: 'charging',
    chargingMode: 'map',
    iconKey: 'zap'
  },
  {
    id: 'rotary_squadron_assist',
    label: 'SQUADRON ASSIST',
    segmentLines: ['SQUADRON', 'ASSIST'],
    subtitle: '',
    segmentSubLines: [''],
    routeId: 'emergency',
    iconKey: 'users'
  },
  {
    id: 'rotary_mission_mode',
    label: 'MISSION MODE',
    segmentLines: ['MISSION', 'MODE'],
    subtitle: '',
    segmentSubLines: [''],
    routeId: 'mission',
    iconKey: 'navigation'
  },
  {
    id: 'rotary_priority_issues',
    label: 'PRIORITY ISSUES',
    segmentLines: ['PRIORITY', 'ISSUES'],
    subtitle: '',
    segmentSubLines: [''],
    routeId: 'problems',
    iconKey: 'clipboard'
  },
  {
    id: 'rotary_discussions',
    label: 'DISCUSSION',
    segmentLines: ['DISCUSSION'],
    subtitle: '',
    segmentSubLines: [''],
    routeId: 'discussions',
    iconKey: 'message'
  },
  {
    id: 'rotary_marketplace',
    label: 'MARKETPLACE',
    segmentLines: ['MARKETPLACE'],
    subtitle: '',
    segmentSubLines: [''],
    routeId: 'marketplace',
    iconKey: 'cart'
  },
  {
    id: 'rotary_garage',
    label: 'MY GARAGE',
    segmentLines: ['MY GARAGE'],
    subtitle: '',
    segmentSubLines: [''],
    routeId: 'garage',
    iconKey: 'book'
  },
  {
    id: 'rotary_service_intel',
    label: 'SERVICE INTEL & REVIEWS',
    segmentLines: ['SERVICE INTEL', '& REVIEWS'],
    subtitle: '',
    segmentSubLines: [''],
    routeId: 'service',
    iconKey: 'chart'
  },
  {
    id: 'rotary_modifications',
    label: 'MODIFICATIONS',
    segmentLines: ['MODIFICATIONS'],
    subtitle: '',
    segmentSubLines: [''],
    routeId: 'modifications',
    iconKey: 'key'
  },
  {
    id: 'rotary_squadron_showdown',
    label: 'SQUADRON SHOWDOWN',
    segmentLines: ['SQUADRON', 'SHOWDOWN'],
    subtitle: '',
    segmentSubLines: [''],
    routeId: 'squadron-showdown',
    iconKey: 'zap'
  },
  {
    id: 'rotary_admin_centre',
    label: 'ADMIN CENTRE',
    segmentLines: ['ADMIN', 'CENTRE'],
    subtitle: '',
    segmentSubLines: [''],
    routeId: 'admin',
    iconKey: 'shield',
    requiresAdminOrOwner: true
  }
];

/**
 * Checks whether a user has administrator or owner authorization for ADMIN CENTRE.
 */
export function isUserAuthorizedForAdmin(
  user?: {
    email?: string;
    role?: string;
    adminPermissions?: string[];
  } | null
): boolean {
  if (!user) return false;
  if (isOwnerAccount(user)) return true;
  if (user.role === 'owner' || user.role === 'admin' || user.role === 'superadmin') {
    return true;
  }
  if (Array.isArray(user.adminPermissions) && user.adminPermissions.length > 0) {
    return true;
  }
  return false;
}

export function isEmployeeRole(user?: { role?: string } | null): boolean {
  return user?.role === 'uv_employee';
}

export function isEmployeeAllowedRoute(routeId: string): boolean {
  return routeId === 'problems' || routeId === 'service';
}

/**
 * Returns the list of rotary destinations authorized for the given user.
 * Ordinary/visitor users receive the 9 main application pages ("01 / 09");
 * authorized administrators also receive ADMIN CENTRE ("01 / 10");
 * Ultraviolette employees receive ONLY Priority Issues & Service Intel.
 */
export function getAuthorizedRotaryDestinations(
  user?: {
    email?: string;
    role?: string;
    adminPermissions?: string[];
  } | null,
  registry: RotaryDestinationItem[] = ROTARY_NAVIGATION_REGISTRY
): RotaryDestinationItem[] {
  if (user?.role === 'uv_employee') {
    return registry.filter(item => item.routeId === 'problems' || item.routeId === 'service');
  }
  const isAdmin = isUserAuthorizedForAdmin(user);
  return registry.filter(item => !item.requiresAdminOrOwner || isAdmin);
}

/**
 * Formats the zero-padded compact selection counter (e.g. "01 / 09") for the selected-page panel.
 */
export function formatRotarySelectionCounter(selectedIndex: number, totalCount: number): string {
  const safeTotal = Math.max(1, Math.floor(totalCount));
  const safeIdx = Math.min(safeTotal, Math.max(1, Math.floor(selectedIndex) + 1));
  return `${String(safeIdx).padStart(2, '0')} / ${String(safeTotal).padStart(2, '0')}`;
}

/**
 * Normalizes any angle in degrees into the half-open interval [0, 360).
 */
export function normalizeDegrees(angleDeg: number): number {
  if (!Number.isFinite(angleDeg)) return 0;
  const mod = angleDeg % 360;
  return mod < 0 ? mod + 360 : mod === 0 ? 0 : mod;
}

/**
 * Returns the shortest signed angular difference (toDeg - fromDeg) in [-180, 180].
 * Ensures crossing the 0°/360° boundary never causes a 360° jump.
 */
export function shortestAngularDelta(fromDeg: number, toDeg: number): number {
  if (!Number.isFinite(fromDeg) || !Number.isFinite(toDeg)) return 0;
  const diff = normalizeDegrees(toDeg - fromDeg);
  return diff > 180 ? diff - 360 : diff;
}

/**
 * Computes the pointer angle in degrees [0, 360) relative to a center point,
 * where 0° is at 12 o'clock (top) and positive angles increase clockwise.
 */
export function calculatePointerAngleDeg(
  centerX: number,
  centerY: number,
  clientX: number,
  clientY: number
): number {
  const dx = clientX - centerX;
  const dy = clientY - centerY;
  if (dx === 0 && dy === 0) return 0;
  const rad = Math.atan2(dx, -dy);
  return normalizeDegrees((rad * 180) / Math.PI);
}

/**
 * Returns the angular step in degrees per segment for a given number of segments.
 */
export function getSegmentStepDeg(totalSegments: number): number {
  if (!Number.isFinite(totalSegments) || totalSegments <= 0) return 360;
  return 360 / totalSegments;
}

/**
 * Determines which segment index [0 .. totalSegments - 1] is closest to the fixed 0° (12 o'clock)
 * top selection pointer when the rotary ring is rotated by `wheelRotationDeg` degrees clockwise.
 * Since segment `i` sits at `+i * stepDeg` on the ring, rotating the ring by `wheelRotationDeg`
 * places segment `i` at `i * stepDeg + wheelRotationDeg`. Aligning with 0° means:
 * `i * stepDeg ≈ -wheelRotationDeg (mod 360)`.
 */
export function getNearestRotaryIndex(
  wheelRotationDeg: number,
  totalSegments: number
): number {
  if (!Number.isFinite(totalSegments) || totalSegments <= 1) return 0;
  const step = getSegmentStepDeg(totalSegments);
  const pointerAngleOnWheel = normalizeDegrees(-wheelRotationDeg);
  const rawIndex = Math.round(pointerAngleOnWheel / step);
  return ((rawIndex % totalSegments) + totalSegments) % totalSegments;
}

/**
 * Computes the continuous target wheel rotation angle (in degrees) that aligns `targetIndex`
 * with the top 0° pointer by taking the shortest angular delta from `currentWheelRotationDeg`.
 */
export function getTargetWheelRotationForIndex(
  currentWheelRotationDeg: number,
  targetIndex: number,
  totalSegments: number
): number {
  if (!Number.isFinite(totalSegments) || totalSegments <= 0) return currentWheelRotationDeg;
  const safeIndex = ((Math.round(targetIndex) % totalSegments) + totalSegments) % totalSegments;
  const step = getSegmentStepDeg(totalSegments);
  const desiredModAngle = normalizeDegrees(-safeIndex * step);
  const delta = shortestAngularDelta(currentWheelRotationDeg, desiredModAngle);
  return currentWheelRotationDeg + delta;
}

/**
 * Computes deterministic magnetic snapping with optional bounded inertia on pointer release.
 * When `reducedMotion` is true or angular velocity is small, snaps immediately to the nearest segment.
 */
export function computeInertialSnapIndex(
  releaseWheelRotationDeg: number,
  angularVelocityDegPerSec: number,
  totalSegments: number,
  reducedMotion = false
): { targetIndex: number; targetRotationDeg: number } {
  if (!Number.isFinite(totalSegments) || totalSegments <= 1) {
    return { targetIndex: 0, targetRotationDeg: 0 };
  }
  const maxStepAdvanceDeg = getSegmentStepDeg(totalSegments) * 2;
  const inertiaOffsetDeg =
    reducedMotion || !Number.isFinite(angularVelocityDegPerSec) || Math.abs(angularVelocityDegPerSec) < 40
      ? 0
      : Math.max(
          -maxStepAdvanceDeg,
          Math.min(maxStepAdvanceDeg, angularVelocityDegPerSec * 0.14)
        );

  const projectedAngle = releaseWheelRotationDeg + inertiaOffsetDeg;
  const targetIndex = getNearestRotaryIndex(projectedAngle, totalSegments);
  const targetRotationDeg = getTargetWheelRotationForIndex(
    releaseWheelRotationDeg,
    targetIndex,
    totalSegments
  );
  return { targetIndex, targetRotationDeg };
}

export interface SystemControlFeatureItem {
  id: string;
  label: string;
  subtitle: string;
  description: string;
  routeId: string;
  category: 'primary' | 'systems' | 'community' | 'admin';
  jetMode?: 'ask' | 'train';
  chargingMode?: 'map' | 'autopilot';
  requiresAdminOrOwner?: boolean;
}

export const ALL_SYSTEM_CONTROLS_DIRECTORY: SystemControlFeatureItem[] = [
  {
    id: 'dir_squadron_showdown',
    label: 'SQUADRON SHOWDOWN',
    subtitle: '',
    description: '',
    routeId: 'squadron-showdown',
    category: 'primary'
  },
  {
    id: 'dir_jet_engineer_ask',
    label: 'JET ENGINEER',
    subtitle: '',
    description: '',
    routeId: 'jet_engineer',
    jetMode: 'ask',
    category: 'primary'
  },
  {
    id: 'dir_jet_engineer_train',
    label: 'TRAIN DATABASE',
    subtitle: '',
    description: '',
    routeId: 'jet_engineer',
    jetMode: 'train',
    category: 'primary'
  },
  {
    id: 'dir_charging',
    label: 'CHARGING NETWORK',
    subtitle: '',
    description: '',
    routeId: 'charging',
    chargingMode: 'map',
    category: 'primary'
  },
  {
    id: 'dir_route_planner',
    label: 'AUTO PILOT',
    subtitle: '',
    description: '',
    routeId: 'charging',
    chargingMode: 'autopilot',
    category: 'primary'
  },
  {
    id: 'dir_squadron_assist',
    label: 'SQUADRON ASSIST',
    subtitle: '',
    description: '',
    routeId: 'emergency',
    category: 'primary'
  },
  {
    id: 'dir_mission_mode',
    label: 'MISSION MODE',
    subtitle: '',
    description: '',
    routeId: 'mission',
    category: 'primary'
  },
  {
    id: 'dir_problems',
    label: 'PRIORITY ISSUES',
    subtitle: '',
    description: '',
    routeId: 'problems',
    category: 'systems'
  },
  {
    id: 'dir_service',
    label: 'SERVICE INTEL & REVIEWS',
    subtitle: '',
    description: '',
    routeId: 'service',
    category: 'systems'
  },
  {
    id: 'dir_garage',
    label: 'MY GARAGE',
    subtitle: '',
    description: '',
    routeId: 'garage',
    category: 'systems'
  },
  {
    id: 'dir_discussions',
    label: 'DISCUSSION',
    subtitle: '',
    description: '',
    routeId: 'discussions',
    category: 'community'
  },
  {
    id: 'dir_modifications',
    label: 'MODIFICATIONS',
    subtitle: '',
    description: '',
    routeId: 'modifications',
    category: 'community'
  },
  {
    id: 'dir_marketplace',
    label: 'MARKETPLACE',
    subtitle: '',
    description: '',
    routeId: 'marketplace',
    category: 'community'
  },
  {
    id: 'dir_admin',
    label: 'ADMIN CENTRE',
    subtitle: '',
    description: '',
    routeId: 'admin',
    category: 'admin',
    requiresAdminOrOwner: true
  }
];

/**
 * Verifies that no two hotspot regions in the given list overlap in 2D percentage space.
 */
export function areHotspotsNonOverlapping(regions: CockpitHotspotRegion[]): boolean {
  for (let i = 0; i < regions.length; i++) {
    const a = regions[i];
    if (
      a.leftPct < 0 ||
      a.topPct < 0 ||
      a.widthPct <= 0 ||
      a.heightPct <= 0 ||
      a.leftPct + a.widthPct > 100 ||
      a.topPct + a.heightPct > 100
    ) {
      return false;
    }
    for (let j = i + 1; j < regions.length; j++) {
      const b = regions[j];
      const overlapX = a.leftPct < b.leftPct + b.widthPct && a.leftPct + a.widthPct > b.leftPct;
      const overlapY = a.topPct < b.topPct + b.heightPct && a.topPct + a.heightPct > b.topPct;
      if (overlapX && overlapY) {
        return false;
      }
    }
  }
  return true;
}

// ============================================================================
// CONTRIBUTION & PAYMENT MODES ENGINE
// ============================================================================

export type ContributionOptionId = 'chai' | 'biryani' | 'custom';

export interface ContributionOptionSpec {
  id: ContributionOptionId;
  label: string;
  subtitle: string;
  fixedAmountInr: number | null;
  emoji: string;
}

export const CONTRIBUTION_OPTIONS: readonly ContributionOptionSpec[] = [
  {
    id: 'chai',
    label: 'Get us a chai',
    subtitle: '20 Rs',
    fixedAmountInr: 20,
    emoji: '☕'
  },
  {
    id: 'biryani',
    label: 'Sponsor us a biryani',
    subtitle: '200 Rs',
    fixedAmountInr: 200,
    emoji: '😋'
  },
  {
    id: 'custom',
    label: 'We accept anything',
    subtitle: 'Custom amount',
    fixedAmountInr: null,
    emoji: '😂'
  }
] as const;

export type PaymentTransactionStatus =
  | 'INITIATED'
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'UNVERIFIED';

export const ACTIVE_RECIPIENT_UPI_NUMBER = '9019884970';
export const ACTIVE_RECIPIENT_COUNTRY_CODE = '+91';

export interface UpiNumberAppRegistrationStatus {
  gpay: 'Active' | 'Inactive';
  phonepe: 'Active' | 'Inactive';
  paytm: 'Active' | 'Inactive';
}

export interface ContributionConfig {
  headline: string;
  creatorMessage: string;
  upiId: string;
  recipientMobileNumber?: string;
  recipientCountryCode?: string;
  recipientIdentifierType?: 'ACTIVE_UPI_NUMBER';
  upiNumberRegistrations?: UpiNumberAppRegistrationStatus;
  customQrUrl: string;
  paymentLink: string;
  otherPaymentDetails: string;
  enableQrScan: boolean;
  enableUpiId: boolean;
  enablePaymentLink: boolean;
  customLimitInr: number;
  updatedAt: string;
}

export type ContributionPaymentMethodLabel =
  | 'UPI Number (GPay)'
  | 'UPI Number (PhonePe)'
  | 'UPI Number (Paytm)'
  | 'UPI Number (Instant)'
  | 'UPI QR Scan'
  | 'UPI ID'
  | 'Payment Link / Other'
  | 'UPI'
  | 'Direct Link'
  | 'Bank / Other';

export interface ContributionRecord {
  id: string;
  contributorName: string;
  contributorModel?: string;
  amountInr?: number;
  optionId?: ContributionOptionId;
  paymentMethod: ContributionPaymentMethodLabel;
  note?: string;
  createdAt: string;
  userId?: string;
  clientRequestId?: string;
  transactionReference?: string;
  utrNumber?: string;
  transactionStatus?: PaymentTransactionStatus;
  targetUpiApp?: UpiAppTarget;
  verifiedAt?: string;
  verifiedBy?: string;
}

export interface PaymentTransactionRecord {
  id: string;
  tr: string;
  recipientMobileNumber: string;
  recipientCountryCode: string;
  resolvedUpiId: string;
  targetApp: UpiAppTarget | 'qr';
  optionId: ContributionOptionId;
  amountInr: number;
  status: PaymentTransactionStatus;
  utrNumber?: string;
  contributorName?: string;
  contributorNote?: string;
  userId?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
}

export const DEFAULT_CONTRIBUTION_CONFIG: ContributionConfig = {
  headline: 'CONTRIBUTE',
  creatorMessage:
    'GHOST PROTOCOL is 100% free for all users including every feature. If you enjoy using the app, feel free to contribute below.',
  upiId: 'abinavthejas2001-1@okaxis',
  recipientMobileNumber: ACTIVE_RECIPIENT_UPI_NUMBER,
  recipientCountryCode: ACTIVE_RECIPIENT_COUNTRY_CODE,
  recipientIdentifierType: 'ACTIVE_UPI_NUMBER',
  upiNumberRegistrations: {
    gpay: 'Active',
    phonepe: 'Active',
    paytm: 'Active'
  },
  customQrUrl: '',
  paymentLink: '',
  otherPaymentDetails: '',
  enableQrScan: true,
  enableUpiId: true,
  enablePaymentLink: false,
  customLimitInr: 50000,
  updatedAt: '2026-10-23T00:00:00Z'
};

/**
 * Masks a 10-digit Indian mobile number so the full number is not unnecessarily exposed on the public page.
 * Example: '9019884970' -> '+91 ••••••4970'
 */
export function maskUpiMobileNumber(
  mobile: string = ACTIVE_RECIPIENT_UPI_NUMBER,
  countryCode: string = ACTIVE_RECIPIENT_COUNTRY_CODE
): string {
  const digits = String(mobile || '').replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) {
    return `${countryCode} ••••••4970`;
  }
  return `${countryCode} ••••••${digits.slice(-4)}`;
}

/**
 * Validates that a string is a properly formatted UPI VPA (`handle@psp`) and NOT a raw mobile number.
 * NPCI UPI Linking Spec forbids inserting a bare 10-digit mobile number directly into `pa=`.
 */
export function isValidUpiVpaAddress(candidate?: string | null): boolean {
  if (!candidate || typeof candidate !== 'string') return false;
  const trimmed = candidate.trim();
  if (!trimmed.includes('@')) return false;
  // Reject bare phone numbers or invalid handles
  if (/^\+?\d{10,12}$/.test(trimmed)) return false;
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(trimmed);
}

/**
 * Generates an NPCI-compliant alphanumeric transaction reference (`tr`, max 35 chars).
 */
export function generateUpiTransactionRef(prefix: string = 'GP'): string {
  const cleanPrefix = prefix.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'GP';
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${cleanPrefix}${ts}${rand}`.slice(0, 35);
}

export interface UpiNumberResolutionResult {
  resolved: boolean;
  recipientMobileNumber: string;
  recipientCountryCode: string;
  maskedMobileNumber: string;
  recipientIdentifierType: 'ACTIVE_UPI_NUMBER';
  resolvedUpiId: string;
  recipientDisplayName: string;
  targetApp: UpiAppTarget;
  appRegistrationStatus: 'Active' | 'Inactive';
  resolutionMode: 'LOCAL_CONFIG_LOOKUP';
  isLiveNpciResolution: false;
  lookupNotice: string;
  p2pIntentRiskNotice: string;
  error?: string;
}

/**
 * Performs a local configuration lookup for the registered UPI Number (`9019884970`, `+91`).
 * NOTE: This is a local configuration lookup (not a live NPCI Central Mapper query).
 */
export function resolveActiveUpiNumberToDestination(params?: {
  mobileNumber?: string;
  countryCode?: string;
  targetApp?: UpiAppTarget;
  config?: Partial<ContributionConfig> | null;
}): UpiNumberResolutionResult {
  const targetApp: UpiAppTarget = params?.targetApp || 'upi';
  const configuredMobile = (
    params?.config?.recipientMobileNumber || ACTIVE_RECIPIENT_UPI_NUMBER
  )
    .replace(/\D/g, '')
    .slice(-10);
  const inputDigits = String(params?.mobileNumber || configuredMobile)
    .replace(/\D/g, '')
    .slice(-10);
  const countryCode = (
    params?.countryCode ||
    params?.config?.recipientCountryCode ||
    ACTIVE_RECIPIENT_COUNTRY_CODE
  ).trim();

  const fallbackUpiId =
    params?.config?.upiId && isValidUpiVpaAddress(params.config.upiId)
      ? params.config.upiId.trim()
      : DEFAULT_CONTRIBUTION_CONFIG.upiId;

  if (inputDigits.length !== 10 || inputDigits !== configuredMobile) {
    return {
      resolved: false,
      recipientMobileNumber: inputDigits,
      recipientCountryCode: countryCode,
      maskedMobileNumber: maskUpiMobileNumber(inputDigits, countryCode),
      recipientIdentifierType: 'ACTIVE_UPI_NUMBER',
      resolvedUpiId: '',
      recipientDisplayName: 'GHOST PROTOCOL',
      targetApp,
      appRegistrationStatus: 'Inactive',
      resolutionMode: 'LOCAL_CONFIG_LOOKUP',
      isLiveNpciResolution: false,
      lookupNotice: 'Local configuration lookup only (not a live NPCI mapper query).',
      p2pIntentRiskNotice: '',
      error: 'Unrecognized mobile number in local configuration. Only 9019884970 is configured.'
    };
  }

  const registrations = params?.config?.upiNumberRegistrations || {
    gpay: 'Active',
    phonepe: 'Active',
    paytm: 'Active'
  };
  const appStatus =
    targetApp === 'gpay'
      ? registrations.gpay
      : targetApp === 'phonepe'
      ? registrations.phonepe
      : targetApp === 'paytm'
      ? registrations.paytm
      : 'Active';

  return {
    resolved: true,
    recipientMobileNumber: configuredMobile,
    recipientCountryCode: countryCode,
    maskedMobileNumber: maskUpiMobileNumber(configuredMobile, countryCode),
    recipientIdentifierType: 'ACTIVE_UPI_NUMBER',
    resolvedUpiId: fallbackUpiId,
    recipientDisplayName: 'GHOST PROTOCOL',
    targetApp,
    appRegistrationStatus: appStatus,
    resolutionMode: 'LOCAL_CONFIG_LOOKUP',
    isLiveNpciResolution: false,
    lookupNotice:
      'Local configuration lookup: 9019884970 is copied to your clipboard. Search this number in your UPI app (Pay Phone / UPI Number) so the app resolves the recipient directly via NPCI.',
    p2pIntentRiskNotice:
      'Unsigned personal-VPA deep links are not launched by default. Paste the copied UPI Number 9019884970 in your UPI app, verify the recipient name, and enter the selected amount manually.'
  };
}

/**
 * Validates a 12-digit numeric UPI UTR / RRN reference number.
 */
export function validateUpiUtrNumber(utrInput?: unknown): {
  valid: boolean;
  utr?: string;
  error?: string;
} {
  const raw = typeof utrInput === 'string' || typeof utrInput === 'number' ? String(utrInput).trim() : '';
  const digitsOnly = raw.replace(/\s+/g, '');
  if (!digitsOnly) {
    return {
      valid: false,
      error: 'Please enter your 12-digit UPI UTR / Reference Number from Google Pay, PhonePe, or Paytm to submit for verification.'
    };
  }
  if (!/^\d{12}$/.test(digitsOnly)) {
    return {
      valid: false,
      error: 'Invalid UTR format. A standard UPI UTR / Reference Number must be exactly 12 digits (e.g. 431512345678).'
    };
  }
  if (/^(\d)\1{11}$/.test(digitsOnly)) {
    return {
      valid: false,
      error: 'Invalid UTR number. Please enter the actual 12-digit UPI transaction reference from your payment app.'
    };
  }
  return { valid: true, utr: digitsOnly };
}

/**
 * Determines whether a contribution record is confirmed/verified and eligible to appear on the
 * public Squadron Backers wall. Unverified, pending, failed, or cancelled transactions are excluded.
 */
export function isConfirmedContributionRecord(record?: Partial<ContributionRecord> | null): boolean {
  if (!record) return false;
  if (!record.transactionStatus) {
    // Preserve pre-existing legacy backer records that were stored prior to transactionStatus tracking
    return true;
  }
  return record.transactionStatus === 'SUCCESS';
}

/**
 * Determines whether a user is authorized to edit payment modes, UPI ID, QR code,
 * and page settings for the Contribute page.
 * Strictly restricted to the Website Owner ONLY (never visitors, regular members, or sub-admins).
 */
export function canEditContributionPage(
  user?: {
    id?: string;
    email?: string;
    role?: string;
    isOwner?: boolean;
    adminPermissions?: string[];
  } | null
): boolean {
  if (!user) return false;
  return isOwnerAccount(user) || user.isOwner === true;
}

function isLegacyBoilerplateHeadline(text: string): boolean {
  const upper = text.toUpperCase();
  return (
    upper.includes('FUEL THE GHOST PROTOCOL MISSION') ||
    upper.includes('CREATOR') ||
    upper.includes('OWNER') ||
    upper.includes('ABINAV')
  );
}

function isLegacyBoilerplateMessage(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('independently engineered and maintained') ||
    lower.includes('abinav thejas') ||
    lower.includes('abinavthejas2001') ||
    lower.includes('direct-to-creator') ||
    lower.includes('goes straight to the creator')
  );
}

/**
 * Sanitizes and merges incoming edits to the public Contribute page configuration,
 * automatically scrubbing legacy personal names, emails, and removed boilerplate text.
 */
export function sanitizeContributionConfig(
  input: Partial<ContributionConfig> | null | undefined,
  fallback: ContributionConfig = DEFAULT_CONTRIBUTION_CONFIG
): ContributionConfig {
  const src = input && typeof input === 'object' ? input : {};

  const rawHeadline =
    typeof src.headline === 'string' && src.headline.trim().length > 0
      ? src.headline.trim().slice(0, 140)
      : fallback.headline;
  const headline = isLegacyBoilerplateHeadline(rawHeadline)
    ? DEFAULT_CONTRIBUTION_CONFIG.headline
    : rawHeadline;

  const rawMessage =
    typeof src.creatorMessage === 'string'
      ? src.creatorMessage.trim().slice(0, 4000)
      : fallback.creatorMessage;
  const creatorMessage = isLegacyBoilerplateMessage(rawMessage)
    ? DEFAULT_CONTRIBUTION_CONFIG.creatorMessage
    : rawMessage;

  const rawUpiId =
    typeof src.upiId === 'string' && src.upiId.trim().length > 0
      ? src.upiId.trim().slice(0, 120)
      : fallback.upiId;
  const upiId =
    rawUpiId.toLowerCase() === 'abinavthejas2001@okaxis'
      ? DEFAULT_CONTRIBUTION_CONFIG.upiId
      : rawUpiId;

  const rawMobile =
    typeof src.recipientMobileNumber === 'string' && src.recipientMobileNumber.replace(/\D/g, '').length >= 10
      ? src.recipientMobileNumber.replace(/\D/g, '').slice(-10)
      : fallback.recipientMobileNumber || ACTIVE_RECIPIENT_UPI_NUMBER;

  const customQrUrl =
    typeof src.customQrUrl === 'string' ? src.customQrUrl.trim() : fallback.customQrUrl;
  const paymentLink =
    typeof src.paymentLink === 'string' ? src.paymentLink.trim().slice(0, 500) : fallback.paymentLink;
  const otherPaymentDetails =
    typeof src.otherPaymentDetails === 'string'
      ? src.otherPaymentDetails.trim().slice(0, 600)
      : fallback.otherPaymentDetails;

  const enableQrScan =
    typeof src.enableQrScan === 'boolean' ? src.enableQrScan : fallback.enableQrScan;
  const enableUpiId =
    typeof src.enableUpiId === 'boolean' ? src.enableUpiId : fallback.enableUpiId;
  const enablePaymentLink =
    typeof src.enablePaymentLink === 'boolean' ? src.enablePaymentLink : fallback.enablePaymentLink;

  // Ensure at least one payment mode remains active
  const hasAnyMode = enableQrScan || enableUpiId || enablePaymentLink;

  const rawLimit = Number(src.customLimitInr);
  const customLimitInr =
    Number.isFinite(rawLimit) && rawLimit >= 20
      ? Math.round(rawLimit)
      : fallback.customLimitInr;

  return {
    headline,
    creatorMessage,
    upiId,
    recipientMobileNumber: rawMobile,
    recipientCountryCode: ACTIVE_RECIPIENT_COUNTRY_CODE,
    recipientIdentifierType: 'ACTIVE_UPI_NUMBER',
    upiNumberRegistrations: src.upiNumberRegistrations || {
      gpay: 'Active',
      phonepe: 'Active',
      paytm: 'Active'
    },
    customQrUrl,
    paymentLink,
    otherPaymentDetails,
    enableQrScan: hasAnyMode ? enableQrScan : true,
    enableUpiId,
    enablePaymentLink,
    customLimitInr,
    updatedAt:
      typeof src.updatedAt === 'string' && src.updatedAt.trim()
        ? src.updatedAt.trim()
        : fallback.updatedAt
  };
}

/**
 * Strips any monetary amount or private transaction references from a contribution record
 * so that public Squadron Backer rows only ever expose the contributor's name and review.
 */
export function redactContributionForPublicWall(
  record: ContributionRecord
): Omit<ContributionRecord, 'amountInr' | 'utrNumber'> {
  return {
    id: record.id,
    contributorName: record.contributorName,
    contributorModel: record.contributorModel,
    paymentMethod: record.paymentMethod,
    note: record.note || 'Contributed to GHOST PROTOCOL',
    createdAt: record.createdAt,
    transactionStatus: record.transactionStatus || 'SUCCESS'
  };
}

/**
 * Builds a standard NPCI UPI deep-link payment URI (`upi://pay?...`) without personal names.
 * Enforces that a bare mobile number is NEVER inserted directly into `pa=`; if a mobile number
 * is supplied, it is resolved through `resolveActiveUpiNumberToDestination` first.
 */
export function buildUpiPaymentUri(params: {
  upiId: string;
  recipientName?: string;
  amountInr?: number;
  note?: string;
  transactionRef?: string;
}): string {
  const rawInput = (params.upiId || DEFAULT_CONTRIBUTION_CONFIG.upiId).trim();
  let resolvedPa = rawInput;
  if (!isValidUpiVpaAddress(rawInput)) {
    const resolution = resolveActiveUpiNumberToDestination({
      mobileNumber: rawInput
    });
    resolvedPa = resolution.resolved
      ? resolution.resolvedUpiId
      : DEFAULT_CONTRIBUTION_CONFIG.upiId;
  }

  const pn = (params.recipientName || 'GHOST PROTOCOL')
    .replace(/[^a-zA-Z0-9 ._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const queryParts: string[] = [
    `pa=${encodeURIComponent(resolvedPa)}`,
    `pn=${encodeURIComponent(pn)}`
  ];

  if (params.transactionRef) {
    const cleanTr = params.transactionRef.replace(/[^a-zA-Z0-9]/g, '').slice(0, 35);
    if (cleanTr) {
      queryParts.push(`tr=${encodeURIComponent(cleanTr)}`);
    }
  }

  const amt = Number(params.amountInr);
  if (Number.isFinite(amt) && amt > 0) {
    queryParts.push(`am=${amt.toFixed(2)}`);
  }
  queryParts.push('cu=INR');
  const tn = (params.note || 'Ghost Protocol Contribution')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (tn) {
    queryParts.push(`tn=${encodeURIComponent(tn.slice(0, 80))}`);
  }
  return `upi://pay?${queryParts.join('&')}`;
}

export type UpiAppTarget = 'upi' | 'gpay' | 'phonepe' | 'paytm';

export const UPI_APP_PACKAGE_MAP: Record<Exclude<UpiAppTarget, 'upi'>, string> = {
  gpay: 'com.google.android.apps.nbu.paisa.user',
  phonepe: 'com.phonepe.app',
  paytm: 'net.one97.paytm'
};

/**
 * Normalizes any UPI payment URI (`upi://pay?...`, `tez://upi/pay?...`, `phonepe://pay?...`,
 * `paytmmp://pay?...`, or `intent://pay?...`) into an Android `intent://pay?...#Intent;scheme=upi;...;end`
 * URI that is intercepted by Android WebView (`MainActivity.java` `url.startsWith("intent://")` ->
 * clean native `Intent.ACTION_VIEW` without `CATEGORY_BROWSABLE` -> `upiResultLauncher.launch`)
 * without ever triggering `net::ERR_UNKNOWN_URL_SCHEME`.
 */
export function buildUpiIntentUri(
  rawUpiUri: string,
  app: UpiAppTarget = 'upi'
): string {
  const trimmed = (rawUpiUri || '').trim();
  const queryIdx = trimmed.indexOf('?');
  const rawQuery =
    queryIdx >= 0
      ? trimmed.slice(queryIdx + 1).replace(/#Intent;.*$/i, '')
      : `pa=${encodeURIComponent(DEFAULT_CONTRIBUTION_CONFIG.upiId)}&pn=${encodeURIComponent('GHOST PROTOCOL')}&cu=INR`;

  const cleanUpiUri = `upi://pay?${rawQuery}`;
  const encodedFallback = encodeURIComponent(cleanUpiUri);

  if (app === 'gpay' || app === 'phonepe' || app === 'paytm') {
    const pkg = UPI_APP_PACKAGE_MAP[app];
    return `intent://pay?${rawQuery}#Intent;scheme=upi;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=${pkg};S.browser_fallback_url=${encodedFallback};end`;
  }

  return `intent://pay?${rawQuery}#Intent;scheme=upi;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodedFallback};end`;
}

/**
 * Launches the requested UPI app ('upi' chooser, 'gpay', 'phonepe', or 'paytm') using
 * `buildUpiIntentUri` on Android WebViews/browsers so `MainActivity.java` intercepts `intent://`
 * and launches the native UPI app via `ActivityResultLauncher` without `net::ERR_UNKNOWN_URL_SCHEME`.
 */
export function openInUpiApp(
  rawUpiUri: string,
  app: UpiAppTarget = 'upi',
  userAgentOverride?: string
): string {
  const targetUrl = buildUpiIntentUri(rawUpiUri, app);
  const ua =
    userAgentOverride !== undefined
      ? userAgentOverride
      : typeof navigator !== 'undefined'
      ? navigator.userAgent || ''
      : '';

  if (typeof window !== 'undefined' && /Android/i.test(ua)) {
    window.location.assign(targetUrl);
  }

  return targetUrl;
}

/**
 * Builds a clean Android application-launch `intent://` URI that opens Google Pay, PhonePe, or Paytm
 * directly via standard Android package launching (`ACTION_MAIN` / `CATEGORY_LAUNCHER` / `getLaunchIntentForPackage`
 * in `MainActivity.java`) WITHOUT passing an unsigned personal-VPA `upi://pay` deep link and WITHOUT
 * fabricating unsupported app-specific deep links.
 */
export function buildUpiAppLaunchIntentUri(app: Exclude<UpiAppTarget, 'upi'>): string {
  const pkg = UPI_APP_PACKAGE_MAP[app];
  return `intent://upi-app-launch#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${pkg};end`;
}

/**
 * Opens Google Pay, PhonePe, or Paytm on Android for the Mobile-Number Lookup workflow (`9019884970`)
 * without launching an unsigned personal-VPA payment intent.
 */
export function openUpiAppForNumberLookup(
  app: Exclude<UpiAppTarget, 'upi'>,
  userAgentOverride?: string
): string {
  const targetUrl = buildUpiAppLaunchIntentUri(app);
  const ua =
    userAgentOverride !== undefined
      ? userAgentOverride
      : typeof navigator !== 'undefined'
      ? navigator.userAgent || ''
      : '';

  if (typeof window !== 'undefined' && /Android/i.test(ua)) {
    window.location.assign(targetUrl);
  }

  return targetUrl;
}

/**
 * Returns honest, step-by-step instructions for paying via the Mobile-Number Lookup workflow in
 * Google Pay, PhonePe, or Paytm after `9019884970` has been copied to the clipboard.
 * Explicitly states that neither the mobile number nor the amount is auto-populated into the app.
 */
export function getUpiNumberLookupInstructions(
  app: Exclude<UpiAppTarget, 'upi'>,
  mobileNumber: string = ACTIVE_RECIPIENT_UPI_NUMBER,
  amountInr: number = 20
): {
  appName: string;
  packageId: string;
  searchActionLabel: string;
  steps: string[];
  manualEntryNotice: string;
} {
  const cleanAmt = Math.max(1, Math.round(Number(amountInr) || 20));
  const map: Record<
    Exclude<UpiAppTarget, 'upi'>,
    { appName: string; packageId: string; searchActionLabel: string }
  > = {
    gpay: {
      appName: 'Google Pay (GPay)',
      packageId: UPI_APP_PACKAGE_MAP.gpay,
      searchActionLabel: 'Pay phone number (or Pay anyone / Search)'
    },
    phonepe: {
      appName: 'PhonePe',
      packageId: UPI_APP_PACKAGE_MAP.phonepe,
      searchActionLabel: 'To Mobile Number'
    },
    paytm: {
      appName: 'Paytm',
      packageId: UPI_APP_PACKAGE_MAP.paytm,
      searchActionLabel: 'To Mobile / UPI Number'
    }
  };

  const info = map[app];
  return {
    appName: info.appName,
    packageId: info.packageId,
    searchActionLabel: info.searchActionLabel,
    steps: [
      `1. UPI Number ${mobileNumber} (+91) has been copied to your clipboard.`,
      `2. In ${info.appName}, tap "${info.searchActionLabel}" and paste ${mobileNumber}.`,
      `3. Verify the recipient's bank-registered name resolved by ${info.appName}.`,
      `4. Manually enter the exact selected amount: ₹${cleanAmt.toLocaleString('en-IN')} Rs.`,
      `5. Authorize with your UPI PIN, then return here to submit your 12-digit UTR.`
    ],
    manualEntryNotice: `Note: ${info.appName} does not auto-populate the phone number or amount from external websites. You must paste ${mobileNumber} and enter ₹${cleanAmt.toLocaleString('en-IN')} Rs inside ${info.appName}.`
  };
}

/**
 * Normalizes any phone number or `tel:` link (`"112"`, `"tel:112"`, `"+91 98450 11223"`) into an
 * Android `intent://<number>#Intent;scheme=tel;action=android.intent.action.DIAL;S.browser_fallback_url=...;end`
 * URI that `MainActivity.java` intercepts (`url.startsWith("intent://")` -> `Intent.parseUri` ->
 * `startActivity` or `openInBrowser("tel:...")`) so clicking CALL 112 or any phone link never
 * triggers `net::ERR_UNKNOWN_URL_SCHEME` in Android WebViews.
 */
export function buildPhoneDialIntentUri(phoneInput?: string | null): string {
  const trimmed = (phoneInput || '').trim().replace(/#Intent;.*$/i, '');
  const withoutScheme = trimmed
    .replace(/^intent:\/*/i, '')
    .replace(/^tel:\/*/i, '');
  const cleanDigits = withoutScheme.replace(/[^\d+*#]/g, '') || '112';
  const cleanTelUri = `tel:${cleanDigits}`;
  const encodedFallback = encodeURIComponent(cleanTelUri);

  return `intent://${cleanDigits}#Intent;scheme=tel;action=android.intent.action.DIAL;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodedFallback};end`;
}

/**
 * Launches the native Android Phone Dialer (`112` or any rider/shop number) via `buildPhoneDialIntentUri`
 * on Android devices without triggering `net::ERR_UNKNOWN_URL_SCHEME`.
 */
export function openPhoneDialer(
  phoneInput?: string | null,
  userAgentOverride?: string
): string {
  const targetUrl = buildPhoneDialIntentUri(phoneInput);
  const ua =
    userAgentOverride !== undefined
      ? userAgentOverride
      : typeof navigator !== 'undefined'
      ? navigator.userAgent || ''
      : '';

  if (typeof window !== 'undefined' && /Android/i.test(ua)) {
    window.location.assign(targetUrl);
  }

  return targetUrl;
}

/**
 * Normalizes any email or `mailto:` link into an Android `intent://` URI with `S.browser_fallback_url`
 * so email links never trigger `net::ERR_UNKNOWN_URL_SCHEME` in Android WebViews.
 */
export function buildMailtoIntentUri(mailtoInput?: string | null): string {
  const trimmed = (mailtoInput || '').trim().replace(/#Intent;.*$/i, '');
  const withoutScheme = trimmed
    .replace(/^intent:\/*/i, '')
    .replace(/^mailto:\/*/i, '');
  const cleanMailto = `mailto:${withoutScheme}`;
  const encodedFallback = encodeURIComponent(cleanMailto);

  return `intent://${withoutScheme}#Intent;scheme=mailto;action=android.intent.action.SENDTO;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodedFallback};end`;
}

export function openMailClient(
  mailtoInput?: string | null,
  userAgentOverride?: string
): string {
  const targetUrl = buildMailtoIntentUri(mailtoInput);
  const ua =
    userAgentOverride !== undefined
      ? userAgentOverride
      : typeof navigator !== 'undefined'
      ? navigator.userAgent || ''
      : '';

  if (typeof window !== 'undefined' && /Android/i.test(ua)) {
    window.location.assign(targetUrl);
  }

  return targetUrl;
}

export type AndroidPhotoPickerMode = 'gallery' | 'camera';

export interface AndroidPhotoPickerParams {
  originUrl?: string | null;
  sessionId?: string;
  mode?: AndroidPhotoPickerMode;
  target?: string;
}

/**
 * Detects whether the current runtime is an Android device (WebView APK or mobile browser).
 */
export function isAndroidDevice(userAgentOverride?: string): boolean {
  const ua =
    userAgentOverride !== undefined
      ? userAgentOverride
      : typeof navigator !== 'undefined'
      ? navigator.userAgent || ''
      : '';
  return /Android/i.test(ua);
}

/**
 * Builds an Android `intent://` URI that opens the phone's native Media / Photos / Files picker
 * (`android.intent.action.GET_CONTENT` with `image/*`) or Camera (`android.media.action.IMAGE_CAPTURE`)
 * directly on the device WITHOUT ever opening Chrome or entering any website.
 */
export function buildAndroidPhotoPickerIntentUri(params?: AndroidPhotoPickerParams): string {
  const mode: AndroidPhotoPickerMode = params?.mode === 'camera' ? 'camera' : 'gallery';
  if (mode === 'camera') {
    return 'intent://#Intent;action=android.media.action.IMAGE_CAPTURE;end';
  }
  return 'intent://#Intent;action=android.intent.action.GET_CONTENT;category=android.intent.category.OPENABLE;type=image/*;B.android.intent.extra.ALLOW_MULTIPLE=true;end';
}

/**
 * Alias kept for backward compatibility; returns the direct Android Media / Files `intent://` URI.
 */
export function buildAndroidPhotoBridgeUrl(params?: AndroidPhotoPickerParams): string {
  return buildAndroidPhotoPickerIntentUri(params);
}

/**
 * Launches the phone's native Android Media / Photos / Files picker or Camera directly
 * via `buildAndroidPhotoPickerIntentUri` without opening any external browser or website.
 */
export function openInAndroidPhotoPicker(
  params?: AndroidPhotoPickerParams,
  userAgentOverride?: string
): string {
  const targetUrl = buildAndroidPhotoPickerIntentUri(params);
  const ua =
    userAgentOverride !== undefined
      ? userAgentOverride
      : typeof navigator !== 'undefined'
      ? navigator.userAgent || ''
      : '';

  if (typeof window !== 'undefined' && /Android/i.test(ua)) {
    try {
      const a = document.createElement('a');
      a.href = targetUrl;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          a.remove();
        } catch {}
      }, 500);
    } catch {
      try {
        window.location.assign(targetUrl);
      } catch {}
    }
  }

  return targetUrl;
}

/**
 * Validates a user's contribution submission. Supports the 3 options:
 * - 'chai' (20 Rs)
 * - 'biryani' (200 Rs)
 * - 'custom' (We accept anything 😂 — any positive amount >= 1 Rs)
 */
export function validateContributionSubmission(input: {
  contributorName?: unknown;
  amountInr?: unknown;
  optionId?: unknown;
  customLimitInr?: unknown;
  paymentMethod?: unknown;
  note?: unknown;
  contributorModel?: unknown;
  utrNumber?: unknown;
  requireUtr?: boolean;
  transactionReference?: unknown;
}): {
  valid: boolean;
  error?: string;
  value?: {
    contributorName: string;
    contributorModel: string;
    amountInr: number;
    optionId: ContributionOptionId;
    paymentMethod: ContributionPaymentMethodLabel;
    note: string;
    utrNumber?: string;
    transactionReference?: string;
  };
} {
  const rawName = typeof input.contributorName === 'string' ? input.contributorName.trim() : '';
  if (!rawName) {
    return { valid: false, error: 'Please enter your name or callsign.' };
  }

  const optionId: ContributionOptionId =
    input.optionId === 'chai' || input.optionId === 'biryani' || input.optionId === 'custom'
      ? input.optionId
      : Number(input.amountInr) === 20
      ? 'chai'
      : Number(input.amountInr) === 200
      ? 'biryani'
      : 'custom';

  const numAmount =
    optionId === 'chai'
      ? 20
      : optionId === 'biryani'
      ? 200
      : typeof input.amountInr === 'number'
      ? input.amountInr
      : Number(input.amountInr);

  if (!Number.isFinite(numAmount) || numAmount < 1) {
    return { valid: false, error: 'Please enter a valid contribution amount (minimum 1 Rs).' };
  }

  // Reject invalid decimal formatting (only whole INR amounts allowed)
  if (!Number.isInteger(numAmount) && Math.abs(numAmount - Math.round(numAmount)) > 0.001) {
    return { valid: false, error: 'Contribution amount must be a whole INR value without invalid decimals.' };
  }

  let validatedUtr: string | undefined;
  const hasRawUtr =
    input.utrNumber !== undefined &&
    input.utrNumber !== null &&
    String(input.utrNumber).trim().length > 0;
  if (input.requireUtr || hasRawUtr) {
    const utrCheck = validateUpiUtrNumber(input.utrNumber);
    if (!utrCheck.valid || !utrCheck.utr) {
      return { valid: false, error: utrCheck.error };
    }
    validatedUtr = utrCheck.utr;
  }

  const allowedMethods: readonly ContributionPaymentMethodLabel[] = [
    'UPI Number (GPay)',
    'UPI Number (PhonePe)',
    'UPI Number (Paytm)',
    'UPI Number (Instant)',
    'UPI QR Scan',
    'UPI ID',
    'Payment Link / Other',
    'UPI',
    'Direct Link',
    'Bank / Other'
  ] as const;

  const paymentMethod: ContributionPaymentMethodLabel = allowedMethods.includes(
    input.paymentMethod as any
  )
    ? (input.paymentMethod as ContributionPaymentMethodLabel)
    : 'UPI QR Scan';

  const transactionReference =
    typeof input.transactionReference === 'string' && input.transactionReference.trim()
      ? input.transactionReference.replace(/[^a-zA-Z0-9]/g, '').slice(0, 35)
      : undefined;

  return {
    valid: true,
    value: {
      contributorName: rawName.slice(0, 80),
      contributorModel:
        typeof input.contributorModel === 'string' && input.contributorModel.trim()
          ? input.contributorModel.trim().slice(0, 60)
          : 'Squadron Backer',
      amountInr: Math.round(numAmount),
      optionId,
      paymentMethod,
      note:
        typeof input.note === 'string' && input.note.trim()
          ? input.note.trim().slice(0, 400)
          : 'Supported GHOST PROTOCOL!',
      ...(validatedUtr ? { utrNumber: validatedUtr } : {}),
      ...(transactionReference ? { transactionReference } : {})
    }
  };
}

// ============================================================================
// DISCUSSION POLLS ENGINE
// ============================================================================

export interface DiscussionPollOption {
  id: string;
  text: string;
  votes: string[];
}

export interface DiscussionPoll {
  id: string;
  authorId: string;
  authorName: string;
  authorModel: string;
  question: string;
  category: string;
  options: DiscussionPollOption[];
  createdAt: string;
  clientRequestId?: string;
}

export function validatePollCreation(input: {
  question?: unknown;
  category?: unknown;
  options?: unknown;
  authorName?: unknown;
  authorModel?: unknown;
}): {
  valid: boolean;
  error?: string;
  value?: {
    question: string;
    category: string;
    options: string[];
    authorName: string;
    authorModel: string;
  };
} {
  const rawQuestion = typeof input.question === 'string' ? input.question.trim() : '';
  if (rawQuestion.length < 3) {
    return { valid: false, error: 'Please enter a poll question (at least 3 characters).' };
  }

  if (!Array.isArray(input.options)) {
    return { valid: false, error: 'Please provide at least 2 poll options.' };
  }

  const cleanedOptions: string[] = [];
  const seenLower = new Set<string>();
  for (const item of input.options) {
    const text = typeof item === 'string' ? item.trim().slice(0, 140) : '';
    if (text.length > 0) {
      const lower = text.toLowerCase();
      if (seenLower.has(lower)) {
        return { valid: false, error: 'Poll options must be distinct.' };
      }
      seenLower.add(lower);
      cleanedOptions.push(text);
    }
  }

  if (cleanedOptions.length < 2) {
    return { valid: false, error: 'Please provide at least 2 non-empty poll options.' };
  }
  if (cleanedOptions.length > 6) {
    return { valid: false, error: 'A poll can have at most 6 options.' };
  }

  const rawCategory =
    typeof input.category === 'string' && input.category.trim()
      ? input.category.trim().slice(0, 60)
      : 'General';

  const rawAuthorName =
    typeof input.authorName === 'string' && input.authorName.trim()
      ? input.authorName.trim().slice(0, 80)
      : 'Squadron Pilot';

  const rawAuthorModel =
    typeof input.authorModel === 'string' && input.authorModel.trim()
      ? input.authorModel.trim().slice(0, 60)
      : 'F77 MACH 2';

  return {
    valid: true,
    value: {
      question: rawQuestion.slice(0, 280),
      category: rawCategory,
      options: cleanedOptions,
      authorName: rawAuthorName,
      authorModel: rawAuthorModel
    }
  };
}

export function castPollVote(
  poll: DiscussionPoll,
  optionId: string,
  voterId: string
): DiscussionPoll {
  const cleanVoter = (voterId || '').trim();
  if (!cleanVoter || !poll || !Array.isArray(poll.options)) {
    return poll;
  }
  const targetExists = poll.options.some(opt => opt.id === optionId);
  if (!targetExists) {
    return poll;
  }

  const updatedOptions = poll.options.map(opt => {
    const currentVotes = Array.isArray(opt.votes) ? opt.votes.filter(v => v !== cleanVoter) : [];
    if (opt.id === optionId) {
      currentVotes.push(cleanVoter);
    }
    return {
      ...opt,
      votes: currentVotes
    };
  });

  return {
    ...poll,
    options: updatedOptions
  };
}

export function calculatePollResults(
  poll: DiscussionPoll,
  currentVoterId?: string | null
): {
  totalVotes: number;
  selectedOptionId: string | null;
  options: Array<{
    id: string;
    text: string;
    voteCount: number;
    percentage: number;
    isSelected: boolean;
  }>;
} {
  const cleanVoter = (currentVoterId || '').trim();
  const safeOptions = Array.isArray(poll?.options) ? poll.options : [];
  const totalVotes = safeOptions.reduce(
    (sum, opt) => sum + (Array.isArray(opt.votes) ? opt.votes.length : 0),
    0
  );

  let selectedOptionId: string | null = null;
  const computed = safeOptions.map(opt => {
    const votes = Array.isArray(opt.votes) ? opt.votes : [];
    const voteCount = votes.length;
    const isSelected = Boolean(cleanVoter && votes.includes(cleanVoter));
    if (isSelected) {
      selectedOptionId = opt.id;
    }
    const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
    return {
      id: opt.id,
      text: opt.text,
      voteCount,
      percentage,
      isSelected
    };
  });

  return {
    totalVotes,
    selectedOptionId,
    options: computed
  };
}

// ============================================================================
// DISCUSSION PETITIONS ENGINE
// ============================================================================

export interface DiscussionPetitionSupporter {
  voterId: string;
  supporterName: string;
  supporterModel?: string;
  comment?: string;
  supportedAt: string;
}

export interface DiscussionPetition {
  id: string;
  authorId: string;
  authorName: string;
  authorModel: string;
  title: string;
  description: string;
  category: string;
  targetGoal: number;
  supporters: DiscussionPetitionSupporter[];
  createdAt: string;
  clientRequestId?: string;
}

export function validatePetitionCreation(input: {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  targetGoal?: unknown;
  authorName?: unknown;
  authorModel?: unknown;
}): {
  valid: boolean;
  error?: string;
  value?: {
    title: string;
    description: string;
    category: string;
    targetGoal: number;
    authorName: string;
    authorModel: string;
  };
} {
  const rawTitle = typeof input.title === 'string' ? input.title.trim() : '';
  if (rawTitle.length < 5) {
    return { valid: false, error: 'Please enter a petition title (at least 5 characters).' };
  }

  const rawDescription = typeof input.description === 'string' ? input.description.trim() : '';
  if (rawDescription.length < 10) {
    return {
      valid: false,
      error: 'Please provide a clear petition description or objective (at least 10 characters).'
    };
  }

  const rawCategory =
    typeof input.category === 'string' && input.category.trim()
      ? input.category.trim().slice(0, 60)
      : 'General Discussion';

  const parsedGoal = Number(input.targetGoal);
  const targetGoal =
    Number.isFinite(parsedGoal) && parsedGoal >= 5
      ? Math.min(10000, Math.round(parsedGoal))
      : 25;

  const rawAuthorName =
    typeof input.authorName === 'string' && input.authorName.trim()
      ? input.authorName.trim().slice(0, 80)
      : 'Squadron Pilot';

  const rawAuthorModel =
    typeof input.authorModel === 'string' && input.authorModel.trim()
      ? input.authorModel.trim().slice(0, 60)
      : 'F77 MACH 2';

  return {
    valid: true,
    value: {
      title: rawTitle.slice(0, 200),
      description: rawDescription.slice(0, 2000),
      category: rawCategory,
      targetGoal,
      authorName: rawAuthorName,
      authorModel: rawAuthorModel
    }
  };
}

export function togglePetitionSupport(
  petition: DiscussionPetition,
  supporter: {
    voterId: string;
    supporterName?: string;
    supporterModel?: string;
    comment?: string;
    supportedAt?: string;
  }
): DiscussionPetition {
  const cleanVoter = (supporter?.voterId || '').trim();
  if (!cleanVoter || !petition) {
    return petition;
  }

  const currentSupporters = Array.isArray(petition.supporters) ? petition.supporters : [];
  const alreadySupported = currentSupporters.some(s => s.voterId === cleanVoter);

  if (alreadySupported) {
    return {
      ...petition,
      supporters: currentSupporters.filter(s => s.voterId !== cleanVoter)
    };
  }

  const newSupporter: DiscussionPetitionSupporter = {
    voterId: cleanVoter,
    supporterName:
      typeof supporter.supporterName === 'string' && supporter.supporterName.trim()
        ? supporter.supporterName.trim().slice(0, 80)
        : 'Squadron Pilot',
    supporterModel:
      typeof supporter.supporterModel === 'string' && supporter.supporterModel.trim()
        ? supporter.supporterModel.trim().slice(0, 60)
        : 'F77 MACH 2',
    ...(typeof supporter.comment === 'string' && supporter.comment.trim()
      ? { comment: supporter.comment.trim().slice(0, 280) }
      : {}),
    supportedAt: supporter.supportedAt || new Date().toISOString()
  };

  return {
    ...petition,
    supporters: [...currentSupporters, newSupporter]
  };
}

export function calculatePetitionProgress(
  petition: DiscussionPetition,
  currentVoterId?: string | null
): {
  supporterCount: number;
  targetGoal: number;
  progressPercent: number;
  isSupported: boolean;
  goalReached: boolean;
} {
  const cleanVoter = (currentVoterId || '').trim();
  const supporters = Array.isArray(petition?.supporters) ? petition.supporters : [];
  const supporterCount = supporters.length;
  const targetGoal =
    Number.isFinite(petition?.targetGoal) && petition.targetGoal > 0 ? petition.targetGoal : 25;
  const progressPercent = Math.min(100, Math.round((supporterCount / targetGoal) * 100));
  const isSupported = Boolean(cleanVoter && supporters.some(s => s.voterId === cleanVoter));
  const goalReached = supporterCount >= targetGoal;

  return {
    supporterCount,
    targetGoal,
    progressPercent,
    isSupported,
    goalReached
  };
}

// ============================================================================
// AVIONICS PAGE & TOGGLE ENTER/EXIT TRANSITION RULES
// ============================================================================

export const PAGE_TRANSITION_ORDER: readonly string[] = [
  'dashboard',
  'mission',
  'jet_engineer',
  'emergency',
  'problems',
  'modifications',
  'charging',
  'discussions',
  'marketplace',
  'service',
  'garage',
  'squadron-showdown',
  'admin',
  'contribute'
];

export type TransitionDirection = 1 | -1 | 0;

/**
 * Computes deterministic directional momentum (+1 forward, -1 backward, 0 neutral)
 * when switching between pages or toggle states.
 */
export function computeTransitionDirection(
  prevKey: string | null | undefined,
  nextKey: string | null | undefined,
  orderedKeys: readonly string[] = PAGE_TRANSITION_ORDER
): TransitionDirection {
  const prev = (prevKey || '').trim();
  const next = (nextKey || '').trim();
  if (!prev || !next || prev === next) {
    return 0;
  }

  const prevIdx = orderedKeys.indexOf(prev);
  const nextIdx = orderedKeys.indexOf(next);

  if (prevIdx !== -1 && nextIdx !== -1) {
    return nextIdx > prevIdx ? 1 : -1;
  }

  return next.localeCompare(prev) >= 0 ? 1 : -1;
}

export interface AvionicsMotionState {
  opacity: number;
  x: number;
  y: number;
  scale: number;
  filter: string;
}

export interface AvionicsTransitionSpec {
  direction: TransitionDirection;
  initial: AvionicsMotionState;
  animate: AvionicsMotionState;
  exit: AvionicsMotionState;
  durationSec: number;
  ease: readonly [number, number, number, number];
}

/**
 * Generates compositor-friendly enter, center, and exit animation states
 * for page transitions and mode toggles while respecting reduced-motion preferences.
 */
export function getAvionicsTransitionVariants(
  direction: TransitionDirection,
  reducedMotion: boolean = false,
  variantType: 'page' | 'toggle' = 'page'
): AvionicsTransitionSpec {
  const ease: readonly [number, number, number, number] = [0.22, 1, 0.36, 1];

  if (reducedMotion) {
    return {
      direction: 0,
      initial: { opacity: 0, x: 0, y: 0, scale: 1, filter: 'blur(0px)' },
      animate: { opacity: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)' },
      exit: { opacity: 0, x: 0, y: 0, scale: 1, filter: 'blur(0px)' },
      durationSec: 0.12,
      ease
    };
  }

  const isPage = variantType === 'page';
  const offsetX = direction === 0 ? 0 : direction * (isPage ? 18 : 12);
  const enterY = isPage ? 6 : 4;
  const exitY = isPage ? -4 : -3;
  const minScale = isPage ? 0.992 : 0.995;

  return {
    direction,
    initial: {
      opacity: 0,
      x: offsetX,
      y: enterY,
      scale: minScale,
      filter: 'blur(0px)'
    },
    animate: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      filter: 'blur(0px)'
    },
    exit: {
      opacity: 0,
      x: -offsetX,
      y: exitY,
      scale: minScale,
      filter: 'blur(0px)'
    },
    durationSec: isPage ? 0.28 : 0.22,
    ease
  };
}

// ============================================================================
// OFFLINE CHARGING NETWORK, CORRIDOR GEOMETRY & MAP TILE HELPERS
// ============================================================================

/**
 * Builds a normalized, deterministic cache key for a start -> destination corridor
 * rounded to 3 decimal places (~110m precision) so repeat or preset routes hit phone storage.
 */
export function buildRouteCacheKey(
  startLat: number,
  startLon: number,
  destLat: number,
  destLon: number
): string {
  const sLat = Number.isFinite(startLat) ? startLat.toFixed(3) : '0.000';
  const sLon = Number.isFinite(startLon) ? startLon.toFixed(3) : '0.000';
  const dLat = Number.isFinite(destLat) ? destLat.toFixed(3) : '0.000';
  const dLon = Number.isFinite(destLon) ? destLon.toFixed(3) : '0.000';
  return `route_${sLat}_${sLon}_to_${dLat}_${dLon}`;
}

export interface OfflineCorridorGeometryResult {
  polyline: [number, number][];
  distanceKm: number;
  durationMin: number;
  source: 'offline-highway-corridor';
}

/**
 * Generates a realistic multi-segment highway corridor polyline, road-adjusted distance,
 * and estimated driving duration when the user plans an uncached route while offline.
 * Automatically threads through any corridor charging stations that lie within a 22 km
 * lateral corridor band between start and destination.
 */
export function generateOfflineCorridorGeometry(
  start: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  candidateWaypoints: Array<{ latitude: number; longitude: number }> = []
): OfflineCorridorGeometryResult {
  const directDistKm = calculateDistanceKm(
    start.latitude,
    start.longitude,
    destination.latitude,
    destination.longitude
  );

  if (directDistKm < 0.5) {
    return {
      polyline: [
        [start.latitude, start.longitude],
        [destination.latitude, destination.longitude]
      ],
      distanceKm: Number(Math.max(0.5, directDistKm).toFixed(1)),
      durationMin: 2,
      source: 'offline-highway-corridor'
    };
  }

  // Find intermediate corridor stations that lie between start and destination
  // within a reasonable lateral offset so the offline polyline follows real highway hubs
  const corridorNodes: Array<{ latitude: number; longitude: number; distFromStart: number }> = [];

  for (const wp of candidateWaypoints || []) {
    if (!wp || !Number.isFinite(wp.latitude) || !Number.isFinite(wp.longitude)) continue;
    const dStart = calculateDistanceKm(start.latitude, start.longitude, wp.latitude, wp.longitude);
    const dDest = calculateDistanceKm(
      wp.latitude,
      wp.longitude,
      destination.latitude,
      destination.longitude
    );
    // Triangle inequality excess check: if dStart + dDest is within 18% of directDistKm (and not at endpoints)
    if (
      dStart > 8 &&
      dDest > 8 &&
      dStart + dDest <= Math.max(directDistKm * 1.18, directDistKm + 24)
    ) {
      // Avoid duplicate waypoints very close to already added nodes
      const tooClose = corridorNodes.some(
        existing =>
          calculateDistanceKm(existing.latitude, existing.longitude, wp.latitude, wp.longitude) < 12
      );
      if (!tooClose) {
        corridorNodes.push({
          latitude: wp.latitude,
          longitude: wp.longitude,
          distFromStart: dStart
        });
      }
    }
  }

  corridorNodes.sort((a, b) => a.distFromStart - b.distFromStart);

  const anchorPoints: [number, number][] = [
    [start.latitude, start.longitude],
    ...corridorNodes.map(n => [n.latitude, n.longitude] as [number, number]),
    [destination.latitude, destination.longitude]
  ];

  // Subdivide each anchor segment so the polyline has smooth intermediate points along the corridor
  const polyline: [number, number][] = [];
  for (let i = 0; i < anchorPoints.length - 1; i++) {
    const [lat1, lon1] = anchorPoints[i];
    const [lat2, lon2] = anchorPoints[i + 1];
    const segDist = calculateDistanceKm(lat1, lon1, lat2, lon2);
    const steps = Math.max(2, Math.min(8, Math.ceil(segDist / 25)));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      polyline.push([
        Number((lat1 + (lat2 - lat1) * t).toFixed(5)),
        Number((lon1 + (lon2 - lon1) * t).toFixed(5))
      ]);
    }
  }
  polyline.push([
    Number(destination.latitude.toFixed(5)),
    Number(destination.longitude.toFixed(5))
  ]);

  // Sum segment distances and apply a subtle highway winding factor
  let polyDistKm = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    polyDistKm += calculateDistanceKm(
      polyline[i][0],
      polyline[i][1],
      polyline[i + 1][0],
      polyline[i + 1][1]
    );
  }
  const roadFactor = corridorNodes.length > 0 ? 1.12 : 1.18;
  const distanceKm = Number(Math.max(directDistKm, polyDistKm * roadFactor).toFixed(1));
  const durationMin = Math.max(5, Math.round((distanceKm / 58) * 60));

  return {
    polyline,
    distanceKm,
    durationMin,
    source: 'offline-highway-corridor'
  };
}

/**
 * Converts geographic coordinates to OpenStreetMap Web Mercator tile X/Y indices.
 */
export function latLonToTileXY(
  lat: number,
  lon: number,
  zoom: number
): { x: number; y: number; z: number } {
  const z = Math.max(0, Math.min(19, Math.floor(zoom)));
  const n = Math.pow(2, z);
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const x = Math.min(n - 1, Math.max(0, Math.floor(((lon + 180) / 360) * n)));
  const y = Math.min(
    n - 1,
    Math.max(
      0,
      Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
    )
  );
  return { x, y, z };
}

/**
 * Computes a curated list of OpenStreetMap tile URLs covering India overview and key
 * charging corridors so the device's CacheStorage can pre-cache them for offline map viewing.
 */
export function computeOfflineTileUrlsForRegions(
  regions?: Array<{ lat: number; lon: number; zoomLevels: number[]; radiusTiles?: number }>
): string[] {
  const targetRegions =
    regions && regions.length > 0
      ? regions
      : [
          // All-India overview
          { lat: 20.5937, lon: 78.9629, zoomLevels: [4, 5], radiusTiles: 1 },
          // Bengaluru / Mysuru / Kolar / Krishnagiri South Hub
          { lat: 12.9716, lon: 77.5946, zoomLevels: [6, 7, 8, 9, 10], radiusTiles: 1 },
          // Chennai / Vellore Corridor
          { lat: 13.05, lon: 80.2824, zoomLevels: [7, 8, 9], radiusTiles: 1 },
          // Mumbai / Lonavala / Pune Corridor
          { lat: 18.88, lon: 73.12, zoomLevels: [7, 8, 9], radiusTiles: 1 },
          // Delhi NCR Hub
          { lat: 28.6139, lon: 77.209, zoomLevels: [7, 8, 9], radiusTiles: 1 }
        ];

  const urls = new Set<string>();
  for (const reg of targetRegions) {
    const radius = reg.radiusTiles ?? 1;
    for (const z of reg.zoomLevels) {
      const center = latLonToTileXY(reg.lat, reg.lon, z);
      const maxIdx = Math.pow(2, center.z) - 1;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const tx = Math.max(0, Math.min(maxIdx, center.x + dx));
          const ty = Math.max(0, Math.min(maxIdx, center.y + dy));
          urls.add(`https://tile.openstreetmap.org/${center.z}/${tx}/${ty}.png`);
        }
      }
    }
  }
  return Array.from(urls);
}

/**
 * Generates an inline SVG data URL for a dark tactical radar map tile.
 * Used as a clean fallback when an uncached zoom level is viewed while offline.
 */
export function createTacticalOfflineTileDataUrl(
  z: number = 0,
  x: number = 0,
  y: number = 0
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <rect width="256" height="256" fill="#090D14"/>
    <path d="M0 64H256M0 128H256M0 192H256M64 0V256M128 0V256M192 0V256" stroke="#152030" stroke-width="1"/>
    <rect width="256" height="256" fill="none" stroke="#1E2D42" stroke-width="1" stroke-dasharray="4 4"/>
    <circle cx="128" cy="128" r="3" fill="none" stroke="#283B54" stroke-width="1"/>
    <text x="12" y="242" fill="#334763" font-family="monospace" font-size="9">OFFLINE GRID Z${z} • ${x},${y}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ============================================================================
// MARKETPLACE: BUY & SELL, RENTALS, AUCTIONS & OWNER CONTACT RULES
// ============================================================================

export type MarketplaceListingType = 'buy' | 'rent' | 'auction';

export interface RentalBookingRequest {
  id: string;
  renterId: string;
  renterName: string;
  renterPhone: string;
  renterEmail: string;
  startDate: string;
  days: number;
  costPerDay: number;
  securityDeposit: number;
  totalAmount: number;
  acceptedRules: boolean;
  notes?: string;
  status: 'Requested' | 'Approved' | 'Completed' | 'Cancelled';
  createdAt: string;
}

export interface AuctionBid {
  id: string;
  bidderId: string;
  bidderName: string;
  bidderModel?: string;
  bidderPhone?: string;
  bidderEmail?: string;
  amount: number;
  note?: string;
  createdAt: string;
}

export interface MarketplaceOwnerContact {
  phone: string;
  email: string;
  telHref: string;
  mailtoHref: string;
}

/**
 * Classifies a marketplace listing into 'buy', 'rent', or 'auction'.
 */
export function resolveMarketplaceListingType(item: Record<string, any> | null | undefined): MarketplaceListingType {
  if (!item || typeof item !== 'object') return 'buy';
  const rawType = typeof item.listingType === 'string' ? item.listingType.trim().toLowerCase() : '';
  if (rawType === 'rent' || rawType === 'rental' || rawType === 'rentals') return 'rent';
  if (rawType === 'auction' || rawType === 'auctions') return 'auction';
  const cat = typeof item.category === 'string' ? item.category.trim().toLowerCase() : '';
  if (cat === 'rentals' || cat === 'rental' || (typeof item.costPerDay === 'number' && item.costPerDay > 0)) {
    return 'rent';
  }
  if (typeof item.startingBid === 'number' && item.startingBid > 0) {
    return 'auction';
  }
  return 'buy';
}

/**
 * Resolves owner phone and email contact details for any Marketplace listing
 * (Buy & Sell, Rent, or Auction) with clean tel: and mailto: links.
 */
export function resolveMarketplaceOwnerContact(
  item: Record<string, any> | null | undefined
): MarketplaceOwnerContact {
  const rawPhone =
    (typeof item?.contactPhone === 'string' && item.contactPhone.trim()) ||
    (typeof item?.sellerPhone === 'string' && item.sellerPhone.trim()) ||
    (typeof item?.ownerPhone === 'string' && item.ownerPhone.trim()) ||
    '+91 98450 11099';

  const rawEmail =
    (typeof item?.contactEmail === 'string' && item.contactEmail.trim()) ||
    (typeof item?.sellerEmail === 'string' && item.sellerEmail.trim()) ||
    (typeof item?.ownerEmail === 'string' && item.ownerEmail.trim()) ||
    'pilot-desk@ultraviolette-squadron.in';

  const title = typeof item?.title === 'string' && item.title.trim() ? item.title.trim() : 'Marketplace Listing';
  const listingType = resolveMarketplaceListingType(item);
  const typePrefix =
    listingType === 'rent' ? 'Rental Inquiry' : listingType === 'auction' ? 'Auction Inquiry' : 'Purchase Inquiry';

  const dialable = rawPhone.replace(/[^+\d]/g, '') || '+919845011099';
  const subject = encodeURIComponent(`[GHOST PROTOCOL ${typePrefix}] ${title}`);

  return {
    phone: rawPhone,
    email: rawEmail,
    telHref: `tel:${dialable}`,
    mailtoHref: `mailto:${rawEmail}?subject=${subject}`
  };
}

/**
 * Validates rental-specific fields and computes daily rate + security deposit totals.
 */
export function calculateRentalBookingCost(params: {
  costPerDay: unknown;
  securityDeposit?: unknown;
  days: unknown;
}): {
  valid: boolean;
  error?: string;
  days: number;
  costPerDay: number;
  rentalSubtotal: number;
  securityDeposit: number;
  totalPayable: number;
} {
  const costPerDay = Number(params.costPerDay);
  const securityDeposit = Math.max(0, Number(params.securityDeposit) || 0);
  const days = Math.floor(Number(params.days));

  if (!Number.isFinite(costPerDay) || costPerDay <= 0) {
    return {
      valid: false,
      error: 'Cost per day must be greater than ₹0.',
      days: 0,
      costPerDay: 0,
      rentalSubtotal: 0,
      securityDeposit: 0,
      totalPayable: 0
    };
  }

  if (!Number.isFinite(days) || days < 1 || days > 90) {
    return {
      valid: false,
      error: 'Rental duration must be between 1 and 90 days.',
      days: 0,
      costPerDay,
      rentalSubtotal: 0,
      securityDeposit,
      totalPayable: 0
    };
  }

  const rentalSubtotal = Math.round(costPerDay * days);
  const totalPayable = Math.round(rentalSubtotal + securityDeposit);

  return {
    valid: true,
    days,
    costPerDay,
    rentalSubtotal,
    securityDeposit,
    totalPayable
  };
}

/**
 * Returns all bids for an auction sorted highest amount first (with newest timestamp tie-breaker).
 */
export function getSortedAuctionBids(item: Record<string, any> | null | undefined): AuctionBid[] {
  const rawBids = Array.isArray(item?.bids) ? item.bids : [];
  return [...rawBids]
    .filter((b): b is AuctionBid => Boolean(b && typeof b === 'object' && Number.isFinite(Number(b.amount))))
    .map(b => ({
      ...b,
      amount: Number(b.amount)
    }))
    .sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0);
    });
}

/**
 * Computes current highest bid and minimum next valid bid for an auction listing.
 */
export function getAuctionBidSummary(item: Record<string, any> | null | undefined): {
  startingBid: number;
  minBidIncrement: number;
  highestBid: AuctionBid | null;
  currentHighAmount: number;
  minimumNextBid: number;
  bidCount: number;
  isClosedOrAwarded: boolean;
  winnerName: string | null;
  winningBidAmount: number | null;
  winnerBidId: string | null;
} {
  const sortedBids = getSortedAuctionBids(item);
  const startingBid = Math.max(1, Number(item?.startingBid ?? item?.price ?? 1000) || 1000);
  const minBidIncrement = Math.max(1, Number(item?.minBidIncrement ?? 500) || 500);
  const highestBid = sortedBids.length > 0 ? sortedBids[0] : null;
  const currentHighAmount = highestBid ? highestBid.amount : startingBid;
  const minimumNextBid = highestBid ? highestBid.amount + minBidIncrement : startingBid;

  const auctionStatus = typeof item?.auctionStatus === 'string' ? item.auctionStatus.toLowerCase() : 'active';
  const itemStatus = typeof item?.status === 'string' ? item.status.toLowerCase() : 'available';
  const isClosedOrAwarded =
    auctionStatus === 'awarded' ||
    auctionStatus === 'closed' ||
    itemStatus === 'sold' ||
    Boolean(item?.winnerBidId || item?.winnerName);

  return {
    startingBid,
    minBidIncrement,
    highestBid,
    currentHighAmount,
    minimumNextBid,
    bidCount: sortedBids.length,
    isClosedOrAwarded,
    winnerName: typeof item?.winnerName === 'string' && item.winnerName.trim() ? item.winnerName.trim() : null,
    winningBidAmount:
      typeof item?.winningBidAmount === 'number' && Number.isFinite(item.winningBidAmount)
        ? item.winningBidAmount
        : null,
    winnerBidId: typeof item?.winnerBidId === 'string' && item.winnerBidId.trim() ? item.winnerBidId.trim() : null
  };
}

/**
 * Validates and records a new bid on an auction listing.
 */
export function validateAndPlaceAuctionBid(
  item: Record<string, any>,
  bidInput: {
    bidderId: string;
    bidderName: string;
    bidderModel?: string;
    bidderPhone?: string;
    bidderEmail?: string;
    amount: unknown;
    note?: string;
    nowIso?: string;
  }
): {
  valid: boolean;
  error?: string;
  bid?: AuctionBid;
  updatedItem?: Record<string, any>;
} {
  if (!item || typeof item !== 'object') {
    return { valid: false, error: 'Auction listing not found.' };
  }
  if (resolveMarketplaceListingType(item) !== 'auction') {
    return { valid: false, error: 'Bidding is only supported on Auction listings.' };
  }

  const summary = getAuctionBidSummary(item);
  if (summary.isClosedOrAwarded) {
    return { valid: false, error: 'This auction has already been awarded or closed.' };
  }

  const amount = Math.round(Number(bidInput.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, error: 'Please enter a valid positive bid amount.' };
  }

  if (amount < summary.minimumNextBid) {
    return {
      valid: false,
      error: `Bid must be at least ₹${summary.minimumNextBid.toLocaleString('en-IN')} (minimum increment ₹${summary.minBidIncrement.toLocaleString('en-IN')}).`
    };
  }

  const bidderId = String(bidInput.bidderId || '').trim();
  const bidderName = String(bidInput.bidderName || '').trim() || 'Squadron Pilot';
  if (!bidderId) {
    return { valid: false, error: 'Sign in required to place a bid.' };
  }

  const nowIso = bidInput.nowIso || new Date().toISOString();
  const newBid: AuctionBid = {
    id: `bid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    bidderId,
    bidderName,
    bidderModel: bidInput.bidderModel ? String(bidInput.bidderModel).trim() : undefined,
    bidderPhone: bidInput.bidderPhone ? String(bidInput.bidderPhone).trim() : undefined,
    bidderEmail: bidInput.bidderEmail ? String(bidInput.bidderEmail).trim() : undefined,
    amount,
    note: typeof bidInput.note === 'string' && bidInput.note.trim() ? bidInput.note.trim().slice(0, 240) : undefined,
    createdAt: nowIso
  };

  const nextBids = getSortedAuctionBids({
    ...item,
    bids: [newBid, ...(Array.isArray(item.bids) ? item.bids : [])]
  });

  const updatedItem = {
    ...item,
    price: nextBids[0]?.amount ?? amount,
    currentBid: nextBids[0]?.amount ?? amount,
    bids: nextBids,
    updatedAt: nowIso
  };

  return {
    valid: true,
    bid: newBid,
    updatedItem
  };
}

/**
 * Allows the auction owner (or Website Owner) to choose a specific bid as winner
 * OR automatically award the highest bid.
 */
export function selectAuctionWinner(
  item: Record<string, any>,
  options?: {
    bidId?: string;
    nowIso?: string;
  }
): {
  valid: boolean;
  error?: string;
  winningBid?: AuctionBid;
  updatedItem?: Record<string, any>;
} {
  if (!item || typeof item !== 'object') {
    return { valid: false, error: 'Auction listing not found.' };
  }
  const sortedBids = getSortedAuctionBids(item);
  if (sortedBids.length === 0) {
    return { valid: false, error: 'Cannot award winner: no bids have been placed on this auction yet.' };
  }

  const targetBidId = typeof options?.bidId === 'string' ? options.bidId.trim() : '';
  const chosenBid = targetBidId
    ? sortedBids.find(b => b.id === targetBidId)
    : sortedBids[0]; // Defaults to highest bid when bidId is omitted

  if (!chosenBid) {
    return { valid: false, error: 'Selected bid was not found in this auction.' };
  }

  const nowIso = options?.nowIso || new Date().toISOString();
  const updatedItem = {
    ...item,
    status: 'Sold',
    auctionStatus: 'awarded',
    winnerBidId: chosenBid.id,
    winnerUserId: chosenBid.bidderId,
    winnerName: chosenBid.bidderName,
    winnerPhone: chosenBid.bidderPhone || undefined,
    winnerEmail: chosenBid.bidderEmail || undefined,
    winningBidAmount: chosenBid.amount,
    price: chosenBid.amount,
    currentBid: chosenBid.amount,
    awardedAt: nowIso,
    updatedAt: nowIso
  };

  return {
    valid: true,
    winningBid: chosenBid,
    updatedItem
  };
}

/**
 * Repairs truncated JPEG base64 Data URLs where network truncation, string caps,
 * or sync slicing omitted the standard JPEG End-Of-Image marker (FF D9) or base64 padding.
 * Guarantees that valid JPEG byte streams decode cleanly in all browsers without blackouts.
 */
export function repairBase64JpegIfTruncated(str: string): string {
  if (typeof str !== 'string' || !str.startsWith('data:image/jpeg;base64,')) return str;
  let rawBase64 = str.slice('data:image/jpeg;base64,'.length).trim();
  try {
    // If cut off with an odd dangling 6-bit char (length % 4 === 1), trim the single incomplete char
    if (rawBase64.length % 4 === 1) {
      rawBase64 = rawBase64.slice(0, -1);
    }
    const padLen = (4 - (rawBase64.length % 4)) % 4;
    const padded = rawBase64 + '='.repeat(padLen);

    let buf: Uint8Array;
    if (typeof Buffer !== 'undefined') {
      buf = new Uint8Array(Buffer.from(padded, 'base64'));
    } else if (typeof atob === 'function') {
      const binary = atob(padded);
      buf = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        buf[i] = binary.charCodeAt(i);
      }
    } else {
      return str;
    }

    if (buf.length < 4) return str;
    // Check Start of Image (FF D8)
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return str;

    const hadEoi = buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
    let mutated = false;

    // Locate SOF0/SOF2 marker (FF C0 or FF C2) to inspect declared height vs actual byte stream
    for (let i = 2; i < Math.min(buf.length - 9, 4096); i++) {
      if (buf[i] === 0xff && (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc2)) {
        const height = (buf[i + 5] << 8) | buf[i + 6];
        const width = (buf[i + 7] << 8) | buf[i + 8];
        // If JPEG was sliced around the legacy 45,000-char limit (~33,730 bytes) with a tall header height,
        // calibrate the SOF0 height to the decoded scanline boundary so browsers never render a gray bottom half
        if (width >= 400 && height > 600 && (!hadEoi || (buf.length >= 33700 && buf.length <= 33800))) {
          const safeHeight = Math.max(240, Math.min(height, Math.floor((height * 392) / 1000 / 8) * 8));
          if (safeHeight < height) {
            buf[i + 5] = (safeHeight >> 8) & 0xff;
            buf[i + 6] = safeHeight & 0xff;
            mutated = true;
          }
        }
        break;
      }
    }

    if (hadEoi && !mutated) return str;

    const finalBuf = hadEoi ? buf : (() => {
      const next = new Uint8Array(buf.length + 2);
      next.set(buf);
      next[buf.length] = 0xff;
      next[buf.length + 1] = 0xd9;
      return next;
    })();

    if (typeof Buffer !== 'undefined') {
      return 'data:image/jpeg;base64,' + Buffer.from(finalBuf).toString('base64');
    } else {
      let binaryStr = '';
      const chunkSize = 8192;
      for (let i = 0; i < finalBuf.length; i += chunkSize) {
        binaryStr += String.fromCharCode.apply(null, finalBuf.subarray(i, i + chunkSize) as any);
      }
      return 'data:image/jpeg;base64,' + btoa(binaryStr);
    }
  } catch {
    return str;
  }
}

/**
 * Generates crisp inline SVG data URLs for Marketplace preset product illustrations
 * so listings always render with zero external image dependencies.
 */
export function createMarketplacePresetIllustration(
  presetType: 'charger' | 'helmet' | 'panniers' | 'jacket' | 'diagnostic_tool' | 'carbon_wheels'
): string {
  const palettes: Record<
    typeof presetType,
    { bg1: string; bg2: string; accent: string; label: string; sub: string; glyph: string }
  > = {
    charger: {
      bg1: '#0A101D',
      bg2: '#132338',
      accent: '#F59E0B',
      label: 'UV BOOST CHARGER 3.3 kW',
      sub: 'PORTABLE FAST CHARGING UNIT',
      glyph: '<rect x="150" y="65" width="100" height="110" rx="12" fill="none" stroke="#F59E0B" stroke-width="4"/><path d="M205 90L185 122H205L195 150L220 116H200L205 90Z" fill="#F59E0B"/>'
    },
    helmet: {
      bg1: '#0F1117',
      bg2: '#1E2230',
      accent: '#10B981',
      label: 'AERO CARBON HELMET SPEC',
      sub: 'FIM / ECE 22.06 TRACK GRADE',
      glyph: '<path d="M145 145C145 95 175 70 215 70C250 70 270 95 270 135V155H155L145 145Z" fill="none" stroke="#10B981" stroke-width="4"/><path d="M210 100H268V128H215L210 100Z" fill="#10B981" fill-opacity="0.25" stroke="#10B981" stroke-width="2"/>'
    },
    panniers: {
      bg1: '#0B131B',
      bg2: '#172836',
      accent: '#38BDF8',
      label: 'AERO TOURING PANNIER KIT',
      sub: 'WATERPROOF QUICK-LATCH LUGGAGE',
      glyph: '<rect x="135" y="80" width="130" height="90" rx="14" fill="none" stroke="#38BDF8" stroke-width="4"/><path d="M165 80V66H235V80M135 115H265" stroke="#38BDF8" stroke-width="3"/>'
    },
    jacket: {
      bg1: '#141118',
      bg2: '#261E2E',
      accent: '#F97316',
      label: 'BALLISTIC ARMORED JACKET',
      sub: 'CE LEVEL-2 CORDURA MESH',
      glyph: '<path d="M165 72L135 95L148 165H252L265 95L235 72L215 86H185L165 72Z" fill="none" stroke="#F97316" stroke-width="4"/>'
    },
    diagnostic_tool: {
      bg1: '#091516',
      bg2: '#112A2E',
      accent: '#2DD4BF',
      label: 'SONIC BELT &amp; TELEMETRY RIG',
      sub: '210 HZ ACOUSTIC TENSION METER',
      glyph: '<circle cx="200" cy="118" r="44" fill="none" stroke="#2DD4BF" stroke-width="4"/><path d="M176 118H190L198 98L206 138L214 118H226" fill="none" stroke="#2DD4BF" stroke-width="3"/>'
    },
    carbon_wheels: {
      bg1: '#121318',
      bg2: '#1F2430',
      accent: '#EAB308',
      label: 'FORGED AERO WHEEL &amp; DISC KIT',
      sub: 'F77 MACH 2 / RECON TRACK SPEC',
      glyph: '<circle cx="200" cy="118" r="48" fill="none" stroke="#EAB308" stroke-width="4"/><circle cx="200" cy="118" r="18" fill="none" stroke="#EAB308" stroke-width="2"/><path d="M200 70V166M152 118H248M166 84L234 152M234 84L166 152" stroke="#EAB308" stroke-width="2"/>'
    }
  };

  const p = palettes[presetType] || palettes.charger;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 400 225">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${p.bg1}"/>
        <stop offset="100%" stop-color="${p.bg2}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="225" fill="url(#bg)"/>
    <path d="M0 45H400M0 90H400M0 135H400M0 180H400M80 0V225M160 0V225M240 0V225M320 0V225" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1"/>
    ${p.glyph}
    <text x="200" y="192" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif" font-weight="800" font-size="12" letter-spacing="1.5">${p.label}</text>
    <text x="200" y="208" text-anchor="middle" fill="${p.accent}" font-family="monospace" font-weight="600" font-size="9" letter-spacing="1">${p.sub}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface ChargerSubmitterInfo {
  isCommunityProvided: boolean;
  isUserSubmitted: boolean;
  submitterName: string;
  submitterPhone: string;
  telHref: string;
}

/**
 * Resolves the name and phone number of the user who submitted a Community Provided Charger
 * or user-reported charging station so riders can see and contact the submitter.
 */
export function resolveChargerSubmitterInfo(station?: {
  id?: string;
  name?: string;
  powerOutputKw?: number;
  chargerSource?: string;
  categories?: string[];
  isSupernova?: boolean;
  isCommunityReported?: boolean;
  isCommunityCharger?: boolean;
  chargerType?: string;
  submittedByUserId?: string;
  submittedByRole?: 'admin' | 'user' | string;
  reportedBy?: string;
  submittedByPhone?: string;
  contactPhone?: string;
  reporterPhone?: string;
} | null): ChargerSubmitterInfo {
  const isLegacyThirdPartyFastStation = Boolean(
    station &&
      !station.chargerSource &&
      !station.isCommunityCharger &&
      (station.id === 'cs_02' ||
        Number(station.powerOutputKw) >= 50 ||
        /shell|tata power|zeon|statiq|relux|fortum|chargezone/i.test(station.name || ''))
  );

  const hasUvSpaceCategory = Boolean(
    station &&
      Array.isArray(station.categories) &&
      station.categories.some(c => /space\s*station/i.test(String(c || '')))
  );

  const isPublicNetworkStation = Boolean(
    station &&
      (station.isSupernova ||
        station.chargerSource === 'Supernova' ||
        station.chargerSource === 'UV Space Station' ||
        station.chargerSource === '3rd Party Station' ||
        station.chargerType === 'Supernova' ||
        hasUvSpaceCategory ||
        isLegacyThirdPartyFastStation)
  );

  const isCommunityProvided = Boolean(
    station &&
      !isPublicNetworkStation &&
      (station.chargerSource === 'Community Provided Charger' ||
        (!station.chargerSource && (station.isCommunityCharger || station.isCommunityReported)))
  );

  const isUserSubmitted = Boolean(
    station &&
      (isCommunityProvided ||
        station.isCommunityReported ||
        station.submittedByRole === 'user')
  );

  const rawName = typeof station?.reportedBy === 'string' ? station.reportedBy.trim() : '';
  const submitterName =
    rawName ||
    (isCommunityProvided
      ? 'Community Squadron Pilot'
      : 'Ultraviolette Hangar Registry');

  // Only expose uploader phone number for Community Provided Chargers (never for UV Space Stations, Supernova, or 3rd Party chargers)
  if (!isCommunityProvided) {
    return {
      isCommunityProvided: false,
      isUserSubmitted,
      submitterName,
      submitterPhone: '',
      telHref: ''
    };
  }

  const explicitPhone =
    (typeof station?.submittedByPhone === 'string' && station.submittedByPhone.trim()) ||
    (typeof station?.contactPhone === 'string' && station.contactPhone.trim()) ||
    (typeof station?.reporterPhone === 'string' && station.reporterPhone.trim()) ||
    '';

  let fallbackPhone = '';
  const uid = (station?.submittedByUserId || '').trim();
  const lowerName = submitterName.toLowerCase();

  if (uid === 'u_phantom' || lowerName.includes('devika')) {
    fallbackPhone = '+91 97410 88231';
  } else if (uid === 'u_pilot07' || lowerName.includes('vikram')) {
    fallbackPhone = '+91 98860 22345';
  } else if (uid === 'u_rookie' || lowerName.includes('karan')) {
    fallbackPhone = '+91 99001 55678';
  } else if (uid === 'u_uv_employee' || lowerName.includes('service engineer')) {
    fallbackPhone = '+91 98800 11223';
  } else {
    fallbackPhone = '+91 98450 11099';
  }

  const submitterPhone = explicitPhone || fallbackPhone;
  const digits = submitterPhone.replace(/[^+\d]/g, '');

  return {
    isCommunityProvided: true,
    isUserSubmitted,
    submitterName,
    submitterPhone,
    telHref: digits ? `tel:${digits}` : 'tel:+919845011099'
  };
}

export type CommunityChargerPricingType = 'Free' | 'Charged' | 'Paid';
export type CommunityChargerCostUnit = 'per kWh' | 'per hour' | 'per session';
export type ChargerReservationStatus = 'Requested' | 'Approved' | 'Rejected' | 'Completed' | 'Cancelled';

export interface ChargerReservation {
  id: string;
  chargerId: string;
  chargerName: string;
  ownerUserId: string;
  ownerName: string;
  ownerPhone: string;
  riderUserId: string;
  riderName: string;
  riderPhone: string;
  riderBikeModel: string;
  reservationDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  durationMinutes: number;
  estimatedKwh: number;
  pricingType: 'Free' | 'Charged';
  chargingCostAmount: number;
  chargingCostUnit: CommunityChargerCostUnit;
  estimatedCost: number;
  vehicleNotes?: string;
  status: ChargerReservationStatus;
  ownerResponseNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityChargerTerms {
  isCommunityProvided: boolean;
  pricingType: 'Free' | 'Charged';
  chargingCostAmount: number;
  chargingCostUnit: CommunityChargerCostUnit;
  formattedPricingBadge: string;
  formattedPricingSummary: string;
  availabilityStartTime: string;
  availabilityEndTime: string;
  availabilityDays: string;
  availabilityTimeText: string;
  requiresReservation: boolean;
  reservations: ChargerReservation[];
}

function parseMinutesFromHHMM(timeStr: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((timeStr || '').trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function formatMinutesToHHMM(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hh = Math.floor(normalized / 60);
  const mm = normalized % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Resolves pricing (Free vs Charged), cost of charging, availability time, and reservation requirements
 * for any Community Provided Charger or station record.
 */
export function resolveCommunityChargerTerms(station?: Record<string, any> | null): CommunityChargerTerms {
  const subInfo = resolveChargerSubmitterInfo(station);
  const isCommunityProvided = subInfo.isCommunityProvided;

  const rawPricingType = typeof station?.pricingType === 'string' ? station.pricingType.trim().toLowerCase() : '';
  const rawPricingText = typeof station?.pricing === 'string' ? station.pricing.trim() : '';

  let pricingType: 'Free' | 'Charged' = 'Free';
  if (rawPricingType === 'charged' || rawPricingType === 'paid') {
    pricingType = 'Charged';
  } else if (rawPricingType === 'free') {
    pricingType = 'Free';
  } else if (rawPricingText) {
    const lowerPricing = rawPricingText.toLowerCase();
    if (
      (lowerPricing.includes('₹') || lowerPricing.includes('paid') || lowerPricing.includes('charged') || lowerPricing.includes('per kwh')) &&
      !lowerPricing.startsWith('free')
    ) {
      pricingType = 'Charged';
    }
  }

  let chargingCostAmount = Number(station?.chargingCostAmount);
  if (!Number.isFinite(chargingCostAmount) || chargingCostAmount < 0) {
    const rupeeMatch = /₹\s*(\d+(?:\.\d+)?)/.exec(rawPricingText);
    chargingCostAmount = rupeeMatch ? Number(rupeeMatch[1]) : pricingType === 'Charged' ? 15 : 0;
  }
  if (pricingType === 'Free') {
    chargingCostAmount = 0;
  } else if (chargingCostAmount <= 0) {
    chargingCostAmount = 15;
  }

  const rawUnit = typeof station?.chargingCostUnit === 'string' ? station.chargingCostUnit.trim().toLowerCase() : '';
  let chargingCostUnit: CommunityChargerCostUnit = 'per kWh';
  if (rawUnit === 'per hour' || rawUnit === '/hr' || rawPricingText.toLowerCase().includes('per hour')) {
    chargingCostUnit = 'per hour';
  } else if (rawUnit === 'per session' || rawUnit === 'flat' || rawPricingText.toLowerCase().includes('per session')) {
    chargingCostUnit = 'per session';
  }

  const formattedPricingBadge =
    pricingType === 'Free'
      ? 'FREE CHARGING'
      : `CHARGED • ₹${chargingCostAmount} ${chargingCostUnit}`;

  const formattedPricingSummary =
    pricingType === 'Free'
      ? 'Free (₹0 Community Host Access)'
      : `Charged — ₹${chargingCostAmount} ${chargingCostUnit}`;

  const availabilityStartTime =
    typeof station?.availabilityStartTime === 'string' && parseMinutesFromHHMM(station.availabilityStartTime) !== null
      ? station.availabilityStartTime.trim()
      : station?.accessConditions === 'Commercial Hours Only'
      ? '08:00'
      : '06:00';

  const availabilityEndTime =
    typeof station?.availabilityEndTime === 'string' && parseMinutesFromHHMM(station.availabilityEndTime) !== null
      ? station.availabilityEndTime.trim()
      : station?.accessConditions === 'Commercial Hours Only'
      ? '21:00'
      : '22:30';

  const availabilityDays =
    typeof station?.availabilityDays === 'string' && station.availabilityDays.trim()
      ? station.availabilityDays.trim()
      : 'Daily';

  const availabilityTimeText =
    typeof station?.availabilityTimeText === 'string' && station.availabilityTimeText.trim()
      ? station.availabilityTimeText.trim()
      : availabilityDays === '24/7 Anytime'
      ? '24/7 Anytime (Prior Reservation Required)'
      : `${availabilityStartTime} – ${availabilityEndTime} (${availabilityDays})`;

  const requiresReservation = isCommunityProvided
    ? typeof station?.requiresReservation === 'boolean'
      ? station.requiresReservation
      : true
    : false;

  const rawReservations =
    isCommunityProvided && Array.isArray(station?.reservations) ? station.reservations : [];
  const reservations: ChargerReservation[] = rawReservations
    .filter((r: any) => Boolean(r && typeof r === 'object' && r.id))
    .sort((a: ChargerReservation, b: ChargerReservation) => {
      const dateCmp = String(a.reservationDate || '').localeCompare(String(b.reservationDate || ''));
      if (dateCmp !== 0) return dateCmp;
      return String(a.startTime || '').localeCompare(String(b.startTime || ''));
    });

  return {
    isCommunityProvided,
    pricingType,
    chargingCostAmount,
    chargingCostUnit,
    formattedPricingBadge,
    formattedPricingSummary,
    availabilityStartTime,
    availabilityEndTime,
    availabilityDays,
    availabilityTimeText,
    requiresReservation,
    reservations
  };
}

/**
 * Calculates the estimated energy (kWh) and cost (₹) for a community charger reservation.
 */
export function calculateChargerReservationCost(params: {
  pricingType: CommunityChargerPricingType;
  chargingCostAmount?: unknown;
  chargingCostUnit?: CommunityChargerCostUnit;
  durationMinutes: unknown;
  powerOutputKw?: unknown;
  estimatedKwh?: unknown;
}): {
  pricingType: 'Free' | 'Charged';
  durationMinutes: number;
  estimatedKwh: number;
  estimatedCost: number;
  costBreakdownLabel: string;
} {
  const isCharged =
    typeof params.pricingType === 'string' &&
    (params.pricingType.toLowerCase() === 'charged' || params.pricingType.toLowerCase() === 'paid');
  const pricingType: 'Free' | 'Charged' = isCharged ? 'Charged' : 'Free';

  const durationMinutes = Math.max(15, Math.min(360, Math.round(Number(params.durationMinutes) || 60)));
  const powerKw = Math.max(1, Number(params.powerOutputKw) || 3.3);
  const explicitKwh = Number(params.estimatedKwh);
  const estimatedKwh =
    Number.isFinite(explicitKwh) && explicitKwh > 0
      ? Number(explicitKwh.toFixed(1))
      : Number(((powerKw * durationMinutes) / 60).toFixed(1));

  if (pricingType === 'Free') {
    return {
      pricingType: 'Free',
      durationMinutes,
      estimatedKwh,
      estimatedCost: 0,
      costBreakdownLabel: 'FREE (₹0 — Complimentary Community Charger)'
    };
  }

  const rate = Math.max(1, Number(params.chargingCostAmount) || 15);
  const unit: CommunityChargerCostUnit = params.chargingCostUnit || 'per kWh';

  let estimatedCost = 0;
  let costBreakdownLabel = '';
  if (unit === 'per hour') {
    const hours = durationMinutes / 60;
    estimatedCost = Math.round(rate * hours);
    costBreakdownLabel = `₹${estimatedCost} (${hours.toFixed(1)} hr × ₹${rate}/hr)`;
  } else if (unit === 'per session') {
    estimatedCost = Math.round(rate);
    costBreakdownLabel = `₹${estimatedCost} (Flat ₹${rate} per session)`;
  } else {
    estimatedCost = Math.round(rate * estimatedKwh);
    costBreakdownLabel = `₹${estimatedCost} (~${estimatedKwh} kWh × ₹${rate}/kWh)`;
  }

  return {
    pricingType: 'Charged',
    durationMinutes,
    estimatedKwh,
    estimatedCost,
    costBreakdownLabel
  };
}

/**
 * Validates and creates a reservation request with the owner/uploader of a community charger.
 * Checks required rider details, availability window, and overlapping slot conflicts.
 */
export function validateAndCreateChargerReservation(
  station: Record<string, any>,
  input: {
    riderUserId?: string;
    riderName?: unknown;
    riderPhone?: unknown;
    riderBikeModel?: unknown;
    reservationDate?: unknown;
    startTime?: unknown;
    durationMinutes?: unknown;
    estimatedKwh?: unknown;
    vehicleNotes?: unknown;
    nowIso?: string;
  }
): {
  valid: boolean;
  error?: string;
  reservation?: ChargerReservation;
  updatedStation?: Record<string, any>;
} {
  if (!station || typeof station !== 'object') {
    return { valid: false, error: 'Charging station not found.' };
  }

  const riderName = typeof input.riderName === 'string' ? input.riderName.trim() : '';
  if (!riderName) {
    return { valid: false, error: 'Your name is required to book a reservation with the charger owner.' };
  }

  const riderPhone = typeof input.riderPhone === 'string' ? input.riderPhone.trim() : '';
  if (!riderPhone || riderPhone.replace(/\D/g, '').length < 8) {
    return { valid: false, error: 'A valid contact phone number is required so the charger owner can coordinate with you.' };
  }

  const reservationDate = typeof input.reservationDate === 'string' ? input.reservationDate.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reservationDate)) {
    return { valid: false, error: 'Please select a valid reservation date (YYYY-MM-DD).' };
  }

  const startTime = typeof input.startTime === 'string' ? input.startTime.trim() : '';
  const startMins = parseMinutesFromHHMM(startTime);
  if (startMins === null) {
    return { valid: false, error: 'Please select a valid reservation start time (HH:MM).' };
  }

  const durationMinutes = Math.round(Number(input.durationMinutes));
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 360) {
    return { valid: false, error: 'Reservation duration must be between 15 and 360 minutes.' };
  }

  const endMins = startMins + durationMinutes;
  const endTime = formatMinutesToHHMM(endMins);

  const terms = resolveCommunityChargerTerms(station);
  const submitterInfo = resolveChargerSubmitterInfo(station);

  // Verify requested time is within host availability window (when daytime window start < end and not 24/7)
  if (terms.availabilityDays !== '24/7 Anytime') {
    const availStart = parseMinutesFromHHMM(terms.availabilityStartTime);
    const availEnd = parseMinutesFromHHMM(terms.availabilityEndTime);
    if (availStart !== null && availEnd !== null && availStart < availEnd) {
      if (startMins < availStart || endMins > availEnd) {
        return {
          valid: false,
          error: `Requested slot (${startTime} – ${endTime}) is outside the charger's availability window (${terms.availabilityStartTime} – ${terms.availabilityEndTime}).`
        };
      }
    }
  }

  // Check for overlapping active reservations on the same date
  for (const existing of terms.reservations) {
    if (existing.status !== 'Requested' && existing.status !== 'Approved') continue;
    if (existing.reservationDate !== reservationDate) continue;
    const exStart = parseMinutesFromHHMM(existing.startTime);
    const exEnd =
      exStart !== null ? exStart + (Number(existing.durationMinutes) || 60) : parseMinutesFromHHMM(existing.endTime);
    if (exStart !== null && exEnd !== null) {
      // Overlap condition: startA < endB && startB < endA
      if (startMins < exEnd && exStart < endMins) {
        return {
          valid: false,
          error: `This time slot overlaps with an existing reservation (${existing.startTime} – ${existing.endTime} by ${existing.riderName}). Please choose another time.`
        };
      }
    }
  }

  const costCalc = calculateChargerReservationCost({
    pricingType: terms.pricingType,
    chargingCostAmount: terms.chargingCostAmount,
    chargingCostUnit: terms.chargingCostUnit,
    durationMinutes,
    powerOutputKw: station.powerOutputKw,
    estimatedKwh: input.estimatedKwh
  });

  const nowIso = input.nowIso || new Date().toISOString();
  const newReservation: ChargerReservation = {
    id: `resv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    chargerId: String(station.id),
    chargerName: String(station.name || 'Community Charger'),
    ownerUserId: String(station.submittedByUserId || 'u_admin'),
    ownerName: submitterInfo.submitterName,
    ownerPhone: submitterInfo.submitterPhone,
    riderUserId: String(input.riderUserId || 'guest_pilot'),
    riderName,
    riderPhone,
    riderBikeModel:
      typeof input.riderBikeModel === 'string' && input.riderBikeModel.trim()
        ? input.riderBikeModel.trim()
        : 'F77 MACH 2',
    reservationDate,
    startTime,
    endTime,
    durationMinutes,
    estimatedKwh: costCalc.estimatedKwh,
    pricingType: terms.pricingType,
    chargingCostAmount: terms.chargingCostAmount,
    chargingCostUnit: terms.chargingCostUnit,
    estimatedCost: costCalc.estimatedCost,
    vehicleNotes:
      typeof input.vehicleNotes === 'string' && input.vehicleNotes.trim()
        ? input.vehicleNotes.trim().slice(0, 280)
        : undefined,
    status: 'Requested',
    createdAt: nowIso,
    updatedAt: nowIso
  };

  const nextReservations = [...terms.reservations, newReservation].sort((a, b) => {
    const dCmp = a.reservationDate.localeCompare(b.reservationDate);
    if (dCmp !== 0) return dCmp;
    return a.startTime.localeCompare(b.startTime);
  });

  const updatedStation = {
    ...station,
    reservations: nextReservations
  };

  return {
    valid: true,
    reservation: newReservation,
    updatedStation
  };
}

/**
 * Determines whether the given user is the owner/uploader of the charger or the rider who booked the reservation.
 */
export function canManageChargerReservation(
  station: Record<string, any> | null | undefined,
  reservation: ChargerReservation | null | undefined,
  user: { id?: string; role?: string; isOwner?: boolean; fullName?: string } | null | undefined
): {
  isChargerOwner: boolean;
  isBookingRider: boolean;
  canApproveOrReject: boolean;
  canCancel: boolean;
} {
  if (!station || !user || !user.id) {
    return { isChargerOwner: false, isBookingRider: false, canApproveOrReject: false, canCancel: false };
  }
  const isAdmin = Boolean(user.isOwner || user.role === 'admin' || user.role === 'superadmin');
  const isUploaderById = Boolean(station.submittedByUserId && station.submittedByUserId === user.id);
  const submitterInfo = resolveChargerSubmitterInfo(station);
  const isUploaderByName = Boolean(
    user.fullName &&
      submitterInfo.submitterName.toLowerCase().includes(user.fullName.trim().toLowerCase())
  );
  const isChargerOwner = isAdmin || isUploaderById || isUploaderByName;
  const isBookingRider = Boolean(reservation && reservation.riderUserId === user.id);

  return {
    isChargerOwner,
    isBookingRider,
    canApproveOrReject: isChargerOwner,
    canCancel: isChargerOwner || isBookingRider
  };
}

/**
 * Updates the status of a reservation on a Community Provided Charger (Approve, Reject, Complete, or Cancel).
 */
export function updateChargerReservationStatus(
  station: Record<string, any>,
  reservationId: string,
  nextStatus: ChargerReservationStatus,
  actor: { id?: string; role?: string; isOwner?: boolean; fullName?: string } | null | undefined,
  ownerResponseNote?: string,
  nowIso?: string
): {
  valid: boolean;
  error?: string;
  reservation?: ChargerReservation;
  updatedStation?: Record<string, any>;
} {
  if (!station || typeof station !== 'object') {
    return { valid: false, error: 'Charging station not found.' };
  }
  const terms = resolveCommunityChargerTerms(station);
  const target = terms.reservations.find(r => r.id === reservationId);
  if (!target) {
    return { valid: false, error: 'Reservation record not found.' };
  }

  const perms = canManageChargerReservation(station, target, actor);
  if (nextStatus === 'Approved' || nextStatus === 'Rejected' || nextStatus === 'Completed') {
    if (!perms.canApproveOrReject) {
      return {
        valid: false,
        error: 'Only the charger owner/uploader or an administrator can approve, reject, or complete reservations.'
      };
    }
  } else if (nextStatus === 'Cancelled') {
    if (!perms.canCancel) {
      return {
        valid: false,
        error: 'Only the rider who booked the reservation or the charger owner can cancel it.'
      };
    }
  } else {
    return { valid: false, error: 'Invalid reservation status.' };
  }

  const timestamp = nowIso || new Date().toISOString();
  const updatedReservation: ChargerReservation = {
    ...target,
    status: nextStatus,
    ownerResponseNote:
      typeof ownerResponseNote === 'string' && ownerResponseNote.trim()
        ? ownerResponseNote.trim().slice(0, 280)
        : target.ownerResponseNote,
    updatedAt: timestamp
  };

  const nextReservations = terms.reservations.map(r => (r.id === reservationId ? updatedReservation : r));
  const updatedStation = {
    ...station,
    reservations: nextReservations
  };

  return {
    valid: true,
    reservation: updatedReservation,
    updatedStation
  };
}

export interface ChargerOwnerReservationNotification {
  id: string;
  reservationId: string;
  userId: string;
  ownerName: string;
  ownerPhone: string;
  type: 'system';
  title: string;
  message: string;
  link: 'charging';
  read: boolean;
  createdAt: string;
}

/**
 * Builds the notification payload sent to the owner/uploader of a Community Provided Charger
 * when another user reserves/books an appointment at their charger.
 */
export function buildChargerReservationOwnerNotification(
  station: Record<string, any> | null | undefined,
  reservation: ChargerReservation,
  nowIso?: string
): ChargerOwnerReservationNotification {
  const submitter = resolveChargerSubmitterInfo(station);
  const ownerId =
    (typeof station?.submittedByUserId === 'string' && station.submittedByUserId.trim()) ||
    reservation.ownerUserId ||
    'u_admin';
  const ownerName = reservation.ownerName || submitter.submitterName || 'Charger Owner';
  const ownerPhone = reservation.ownerPhone || submitter.submitterPhone || '+91 98450 11099';
  const costText =
    reservation.pricingType === 'Free' || reservation.estimatedCost === 0
      ? 'FREE (₹0)'
      : `₹${reservation.estimatedCost} (~${reservation.estimatedKwh} kWh)`;
  const timestamp = nowIso || new Date().toISOString();

  return {
    id: `notif_res_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    reservationId: reservation.id,
    userId: ownerId,
    ownerName,
    ownerPhone,
    type: 'system',
    title: `⚡ Charger Reserved: ${reservation.chargerName} (${reservation.reservationDate} at ${reservation.startTime})`,
    message: `${reservation.riderName} (${reservation.riderPhone}, Bike: ${reservation.riderBikeModel}) has reserved your charger "${reservation.chargerName}" on ${reservation.reservationDate} from ${reservation.startTime} to ${reservation.endTime} (${reservation.durationMinutes} mins • ${costText}).${reservation.vehicleNotes ? ` Note: "${reservation.vehicleNotes}"` : ''}`,
    link: 'charging',
    read: false,
    createdAt: timestamp
  };
}

/**
 * Evaluates whether an actor (Website Owner or Administrator) is authorized to permanently remove
 * a target user account from the database.
 *
 * Rules:
 * 1. Only the Website Owner or an Administrator (`role === 'admin' | 'superadmin' | 'owner'`) can permanently remove users.
 * 2. The Website Owner account (`u_admin` / `abinavthejas2001@gmail.com`) can NEVER be removed by anyone.
 * 3. No user (Owner or Admin) can permanently remove their own currently signed-in account.
 * 4. Appointed Administrators can permanently remove regular/verified/pending/suspended members and UV employees,
 *    whereas only the Website Owner can permanently remove another Administrator account.
 */
export function canPermanentlyRemoveUser(
  actor?: {
    id?: string;
    email?: string;
    role?: string;
    isOwner?: boolean;
  } | null,
  targetUser?: {
    id?: string;
    email?: string;
    role?: string;
    isOwner?: boolean;
  } | null
): {
  allowed: boolean;
  reason?: string;
} {
  if (!actor || !targetUser) {
    return { allowed: false, reason: 'Authentication and target user are required.' };
  }

  if (!isAdminOrOwnerAccount(actor)) {
    return {
      allowed: false,
      reason: 'Only the Website Owner or an Administrator can permanently remove users from the database.'
    };
  }

  if (isOwnerAccount(targetUser)) {
    return {
      allowed: false,
      reason: 'The Website Owner account is permanently protected and cannot be removed.'
    };
  }

  const actorId = typeof actor.id === 'string' ? actor.id.trim() : '';
  const targetId = typeof targetUser.id === 'string' ? targetUser.id.trim() : '';
  if (actorId && targetId && actorId === targetId) {
    return {
      allowed: false,
      reason: 'You cannot permanently remove your own currently signed-in account.'
    };
  }

  const actorEmail = typeof actor.email === 'string' ? actor.email.trim().toLowerCase() : '';
  const targetEmail = typeof targetUser.email === 'string' ? targetUser.email.trim().toLowerCase() : '';
  if (actorEmail && targetEmail && actorEmail === targetEmail) {
    return {
      allowed: false,
      reason: 'You cannot permanently remove your own currently signed-in account.'
    };
  }

  if (!isOwnerAccount(actor) && isAdminOrOwnerAccount(targetUser)) {
    return {
      allowed: false,
      reason: 'Only the Website Owner can permanently remove an Administrator account.'
    };
  }

  return { allowed: true };
}

/**
 * Pure helper that validates and permanently removes a target user record from a user collection.
 */
export function permanentlyRemoveUserRecord<
  T extends {
    id: string;
    email?: string;
    role?: string;
    isOwner?: boolean;
    fullName?: string;
    originalName?: string;
  }
>(
  users: T[],
  targetUserId: string,
  actor?: {
    id?: string;
    email?: string;
    role?: string;
    isOwner?: boolean;
  } | null
): {
  valid: boolean;
  error?: string;
  removedUser?: T;
  remainingUsers?: T[];
} {
  if (!Array.isArray(users)) {
    return { valid: false, error: 'Invalid user collection.' };
  }
  const cleanId = typeof targetUserId === 'string' ? targetUserId.trim() : '';
  if (!cleanId) {
    return { valid: false, error: 'Target user ID is required.' };
  }

  const targetUser = users.find(u => u.id === cleanId);
  if (!targetUser) {
    return { valid: false, error: 'User not found in database.' };
  }

  const permission = canPermanentlyRemoveUser(actor, targetUser);
  if (!permission.allowed) {
    return { valid: false, error: permission.reason || 'Not authorized to permanently remove this user.' };
  }

  const remainingUsers = users.filter(u => u.id !== cleanId);
  return {
    valid: true,
    removedUser: targetUser,
    remainingUsers
  };
}

// ============================================================================
// MISSION MODE: ANY-USER SORTIE JOIN / BACK-OFF & VISITED DESTINATIONS
// ============================================================================

export interface JoinSortieInput {
  userId?: string;
  displayName?: string;
  motorcycleModel?: string;
  variant?: string;
  startingPoint?: string;
  shareStartingPoint?: boolean;
  intercomStatus?: 'Has an intercom' | 'No intercom' | 'Intercom details not specified';
  intercomModel?: string;
  notes?: string;
  nowIso?: string;
}

/**
 * Allows ANY user (authenticated member or guest rider providing a name) to join a sortie whenever they require.
 * Automatically expands maxRiders if needed so riders are never turned away from joining a sortie.
 */
export function joinSortieRoster<T extends Record<string, any>>(
  ride: T | null | undefined,
  input: JoinSortieInput
): {
  valid: boolean;
  error?: string;
  participant?: RiderParticipant;
  updatedRide?: T;
} {
  if (!ride || typeof ride !== 'object') {
    return { valid: false, error: 'Sortie not found.' };
  }
  if (ride.status === 'Completed' || ride.status === 'Cancelled') {
    return { valid: false, error: `Cannot join a sortie that is already ${ride.status.toLowerCase()}.` };
  }

  const cleanName = typeof input.displayName === 'string' && input.displayName.trim()
    ? input.displayName.trim().slice(0, 60)
    : 'Squadron Rider';
  const cleanUserId = typeof input.userId === 'string' && input.userId.trim()
    ? input.userId.trim()
    : `rider_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

  const existingParticipants: RiderParticipant[] = Array.isArray(ride.participants)
    ? ride.participants
    : [];

  const alreadyJoined = existingParticipants.some(
    p =>
      (p.userId && p.userId === cleanUserId) ||
      (p.displayName && p.displayName.trim().toLowerCase() === cleanName.toLowerCase())
  );
  if (alreadyJoined) {
    return { valid: false, error: 'You have already joined this sortie.' };
  }

  const timestamp = input.nowIso || new Date().toISOString();
  const participant: RiderParticipant = {
    id: `rp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId: cleanUserId,
    displayName: cleanName,
    motorcycleModel:
      typeof input.motorcycleModel === 'string' && input.motorcycleModel.trim()
        ? input.motorcycleModel.trim()
        : 'F77 MACH 2',
    variant: typeof input.variant === 'string' ? input.variant.trim() : '',
    startingPoint: typeof input.startingPoint === 'string' ? input.startingPoint.trim().slice(0, 120) : '',
    shareStartingPoint: input.shareStartingPoint !== undefined ? Boolean(input.shareStartingPoint) : true,
    intercomStatus: input.intercomStatus || 'Has an intercom',
    intercomModel: typeof input.intercomModel === 'string' ? input.intercomModel.trim().slice(0, 80) : '',
    notes: typeof input.notes === 'string' ? input.notes.trim().slice(0, 240) : '',
    status: 'Registered',
    statusUpdatedAt: timestamp,
    checklistCompleted: false
  };

  const nextParticipants = [...existingParticipants, participant];
  const currentMax = typeof ride.maxRiders === 'number' && ride.maxRiders > 0 ? ride.maxRiders : 12;
  const nextMaxRiders = Math.max(currentMax, nextParticipants.length);

  const updatedRide: T = {
    ...ride,
    maxRiders: nextMaxRiders,
    status: ride.status === 'Full' ? 'Registration Open' : ride.status,
    participants: nextParticipants
  };

  return {
    valid: true,
    participant,
    updatedRide
  };
}

export interface LeaveSortieInput {
  userId?: string;
  displayName?: string;
  participantId?: string;
  reason?: string;
  nowIso?: string;
}

/**
 * Allows a joined user to cancel or back off from a sortie in case they cannot make it to the ride.
 */
export function leaveOrBackOffSortieRoster<T extends Record<string, any>>(
  ride: T | null | undefined,
  input: LeaveSortieInput
): {
  valid: boolean;
  error?: string;
  removedParticipant?: RiderParticipant;
  updatedRide?: T;
} {
  if (!ride || typeof ride !== 'object') {
    return { valid: false, error: 'Sortie not found.' };
  }

  const existingParticipants: RiderParticipant[] = Array.isArray(ride.participants)
    ? ride.participants
    : [];

  const cleanUserId = typeof input.userId === 'string' ? input.userId.trim() : '';
  const cleanPartId = typeof input.participantId === 'string' ? input.participantId.trim() : '';
  const cleanName = typeof input.displayName === 'string' ? input.displayName.trim().toLowerCase() : '';

  const targetIdx = existingParticipants.findIndex(p => {
    if (cleanPartId && p.id === cleanPartId) return true;
    if (cleanUserId && p.userId === cleanUserId) return true;
    if (cleanName && p.displayName && p.displayName.trim().toLowerCase() === cleanName) return true;
    return false;
  });

  if (targetIdx === -1) {
    return { valid: false, error: 'You are not currently registered in this sortie.' };
  }

  const removedParticipant = existingParticipants[targetIdx];
  const nextParticipants = existingParticipants.filter((_, idx) => idx !== targetIdx);
  const nextStatus =
    ride.status === 'Full' && nextParticipants.length < (ride.maxRiders || 12)
      ? 'Registration Open'
      : ride.status;

  const updatedRide: T = {
    ...ride,
    status: nextStatus,
    participants: nextParticipants
  };

  return {
    valid: true,
    removedParticipant,
    updatedRide
  };
}

export type DestinationPresetTheme =
  | 'mountain_ghat'
  | 'coastal_highway'
  | 'coffee_trail'
  | 'forest_dam';

export interface VisitedDestinationRecord {
  id: string;
  authorId: string;
  authorName: string;
  authorModel: string;
  title: string;
  startingPoint: string;
  totalDistanceKm: number;
  chargingOptionsOnWay: string;
  chargingAvailable: boolean;
  chargerTypesAvailable: string[];
  locationMapUrl: string;
  photos: string[];
  routeSummary: string;
  bestTimeToVisit?: string;
  riderTips?: string;
  createdAt: string;
  clientRequestId?: string;
}

/**
 * Generates a self-contained SVG data URL photo illustration for visited destination cards.
 */
export function createDestinationPresetIllustration(
  theme: DestinationPresetTheme = 'mountain_ghat',
  customTitle?: string
): string {
  const configs: Record<
    DestinationPresetTheme,
    { bg1: string; bg2: string; accent: string; badge: string; subtitle: string }
  > = {
    mountain_ghat: {
      bg1: '#07131E',
      bg2: '#0F293A',
      accent: '#42B883',
      badge: 'WESTERN GHATS SUMMIT RUN',
      subtitle: 'HIGH-ALTITUDE HAIRPIN CORRIDOR'
    },
    coastal_highway: {
      bg1: '#061526',
      bg2: '#0B2F4A',
      accent: '#38BDF8',
      badge: 'COASTAL EXPRESSWAY CRUISE',
      subtitle: 'ARABIAN SEA & KONKAN CORRIDOR'
    },
    coffee_trail: {
      bg1: '#0A1912',
      bg2: '#153224',
      accent: '#E8AA45',
      badge: 'ESTATE & COFFEE TRAIL',
      subtitle: 'CANOPY CURVES & FAST CHARGERS'
    },
    forest_dam: {
      bg1: '#09141C',
      bg2: '#142936',
      accent: '#729BCB',
      badge: 'RESERVOIR & FOREST LOOP',
      subtitle: 'SCENIC DAM & BACKROAD CIRCUIT'
    }
  };

  const cfg = configs[theme] || configs.mountain_ghat;
  const label = (customTitle || cfg.badge).replace(/[<>&"']/g, '').slice(0, 38).toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${cfg.bg1}" />
        <stop offset="100%" stop-color="${cfg.bg2}" />
      </linearGradient>
      <linearGradient id="road" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${cfg.accent}" stop-opacity="0.25" />
        <stop offset="100%" stop-color="#05080C" stop-opacity="0.95" />
      </linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#bg)" />
    <circle cx="640" cy="110" r="54" fill="${cfg.accent}" fill-opacity="0.18" stroke="${cfg.accent}" stroke-opacity="0.45" stroke-width="2" />
    <path d="M0 320 L180 185 L330 275 L510 145 L670 250 L800 175 L800 450 L0 450 Z" fill="#0A141E" fill-opacity="0.82" stroke="${cfg.accent}" stroke-opacity="0.35" stroke-width="1.5" />
    <path d="M0 365 L240 240 L430 310 L620 215 L800 295 L800 450 L0 450 Z" fill="#060B10" fill-opacity="0.92" />
    <path d="M290 450 Q395 320 440 245 Q465 200 510 145 L540 145 Q495 205 475 255 Q445 330 520 450 Z" fill="url(#road)" stroke="${cfg.accent}" stroke-width="2" stroke-opacity="0.7" />
    <rect x="32" y="28" width="290" height="32" rx="6" fill="#05080C" fill-opacity="0.82" stroke="${cfg.accent}" stroke-opacity="0.55" />
    <text x="48" y="49" fill="${cfg.accent}" font-family="monospace" font-size="13" font-weight="bold" letter-spacing="1.5">${cfg.badge}</text>
    <text x="34" y="402" fill="#F1F3F5" font-family="sans-serif" font-size="22" font-weight="bold" letter-spacing="1">${label}</text>
    <text x="34" y="426" fill="#94A3B8" font-family="monospace" font-size="13" letter-spacing="1.5">${cfg.subtitle}</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface VisitedDestinationSubmissionInput {
  title?: unknown;
  startingPoint?: unknown;
  totalDistanceKm?: unknown;
  chargingOptionsOnWay?: unknown;
  chargingAvailable?: unknown;
  chargerTypesAvailable?: unknown;
  chargerTypesUsed?: unknown;
  locationMapUrl?: unknown;
  customPhotoUrl?: unknown;
  uploadedPhotos?: unknown;
  photos?: unknown;
  presetTheme?: DestinationPresetTheme;
  routeSummary?: unknown;
  bestTimeToVisit?: unknown;
  riderTips?: unknown;
  authorId?: string;
  authorName?: string;
  authorModel?: string;
  nowIso?: string;
}

/**
 * Validates and normalizes a rider's uploaded Visited Destination submission.
 */
export function validateVisitedDestinationSubmission(
  input: VisitedDestinationSubmissionInput
): {
  valid: boolean;
  error?: string;
  record?: VisitedDestinationRecord;
} {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Destination details are required.' };
  }

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title.length < 3) {
    return { valid: false, error: 'Please enter a destination name (at least 3 characters).' };
  }

  const distCheck = validateRideDistance(input.totalDistanceKm);
  if (!distCheck.valid || !distCheck.value) {
    return { valid: false, error: distCheck.error || 'Please enter a valid total distance in km.' };
  }

  const chargingOptionsOnWay =
    typeof input.chargingOptionsOnWay === 'string' ? input.chargingOptionsOnWay.trim() : '';
  if (chargingOptionsOnWay.length < 3) {
    return {
      valid: false,
      error: 'Please describe the options to charge the bike on the way (e.g., Supernova, 15A socket, cafes, or none needed).'
    };
  }

  const rawMapLink = typeof input.locationMapUrl === 'string' ? input.locationMapUrl.trim() : '';
  if (!rawMapLink) {
    return { valid: false, error: 'Please provide a location map link (Google Maps URL or location query).' };
  }

  let normalizedMapUrl = '';
  if (/^javascript:/i.test(rawMapLink) || /^data:/i.test(rawMapLink) || /^vbscript:/i.test(rawMapLink)) {
    return { valid: false, error: 'Unsafe location URL protocol.' };
  }
  if (/^(intent|geo|google\.navigation|comgooglemaps|comgooglemapsurl|maps):/i.test(rawMapLink)) {
    normalizedMapUrl = sanitizeGoogleMapsUrl(rawMapLink, undefined, undefined, title);
  } else if (/^https?:\/\//i.test(rawMapLink)) {
    const urlCheck = validateAndSanitizeUrl(rawMapLink);
    if (!urlCheck.valid || !urlCheck.sanitizedUrl) {
      return { valid: false, error: 'Please enter a valid http:// or https:// map link.' };
    }
    normalizedMapUrl = sanitizeGoogleMapsUrl(urlCheck.sanitizedUrl, undefined, undefined, title);
  } else {
    normalizedMapUrl = sanitizeGoogleMapsUrl('', undefined, undefined, rawMapLink);
  }

  const rawPhotoList: unknown[] = [
    ...(Array.isArray(input.photos) ? input.photos : []),
    ...(Array.isArray(input.uploadedPhotos) ? input.uploadedPhotos : []),
    ...(typeof input.customPhotoUrl === 'string' && input.customPhotoUrl.trim() ? [input.customPhotoUrl.trim()] : [])
  ];
  const cleanedPhotos: string[] = [];
  for (const p of rawPhotoList) {
    if (typeof p === 'string') {
      const trimmed = p.trim();
      if (trimmed.startsWith('data:image/') || /^https?:\/\//i.test(trimmed)) {
        cleanedPhotos.push(trimmed);
      }
    }
  }
  if (cleanedPhotos.length === 0) {
    cleanedPhotos.push(
      createDestinationPresetIllustration(input.presetTheme || 'mountain_ghat', title)
    );
  }

  const rawChargers = input.chargerTypesAvailable ?? input.chargerTypesUsed;
  const chargerTypesAvailable = Array.isArray(rawChargers)
    ? rawChargers
        .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        .map(c => c.trim())
    : ['UV Supernova / Fast Charger', '15A 3-Pin Socket'];

  const startingPoint =
    typeof input.startingPoint === 'string' && input.startingPoint.trim()
      ? input.startingPoint.trim()
      : 'Bengaluru';

  const routeSummary =
    typeof input.routeSummary === 'string' && input.routeSummary.trim()
      ? input.routeSummary.trim()
      : `${startingPoint} → ${title}`;

  const timestamp = input.nowIso || new Date().toISOString();

  const record: VisitedDestinationRecord = {
    id: `dest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    authorId: input.authorId || 'u_pilot07',
    authorName: input.authorName || 'Squadron Rider',
    authorModel: input.authorModel || 'F77 MACH 2',
    title: title.slice(0, 120),
    startingPoint: startingPoint.slice(0, 100),
    totalDistanceKm: distCheck.value,
    chargingOptionsOnWay: chargingOptionsOnWay.slice(0, 500),
    chargingAvailable: input.chargingAvailable !== undefined ? Boolean(input.chargingAvailable) : true,
    chargerTypesAvailable,
    locationMapUrl: normalizedMapUrl,
    photos: cleanedPhotos.slice(0, 6),
    routeSummary: routeSummary.slice(0, 300),
    bestTimeToVisit:
      typeof input.bestTimeToVisit === 'string' && input.bestTimeToVisit.trim()
        ? input.bestTimeToVisit.trim().slice(0, 120)
        : 'Early Morning (05:30 AM – 10:00 AM)',
    riderTips:
      typeof input.riderTips === 'string' && input.riderTips.trim()
        ? input.riderTips.trim().slice(0, 600)
        : '',
    createdAt: timestamp
  };

  return {
    valid: true,
    record
  };
}

export const DEFAULT_VISITED_DESTINATIONS: VisitedDestinationRecord[] = [
  {
    id: 'dest_seed_chikmagalur',
    authorId: 'u_pilot07',
    authorName: 'Vikram Sengupta',
    authorModel: 'F77 Recon',
    title: 'Mullayanagiri Peak & Chikmagalur Coffee Trail',
    startingPoint: 'Bengaluru (Nelamangala Toll)',
    totalDistanceKm: 485,
    chargingOptionsOnWay:
      'UV Supernova fast charger at Hassan Highway Plaza (185 km mark) + 15A 3-pin sockets at Café Coffee Day Kunigal & Chikmagalur town homestays.',
    chargingAvailable: true,
    chargerTypesAvailable: ['UV Supernova', 'CCS2 Type 2', '15A 3-Pin Socket'],
    locationMapUrl: 'https://www.google.com/maps/search/?api=1&query=13.3909,75.7214&source=mlgmmupgrade&utm_campaign=ml-ar-wv',
    photos: [
      createDestinationPresetIllustration('coffee_trail', 'Mullayanagiri & Chikmagalur')
    ],
    routeSummary: 'Bengaluru → Kunigal → Hassan (Fast Charge) → Belur → Chikmagalur → Mullayanagiri Peak',
    bestTimeToVisit: 'October to March • Depart 05:00 AM',
    riderTips:
      'Smooth 4-lane tarmac till Hassan. Switch to Combat mode on the final 18 km ghat climb; heavy regen on the descent recovers ~9% battery SoC.',
    createdAt: '2026-10-18T06:30:00.000Z'
  },
  {
    id: 'dest_seed_nandihills',
    authorId: 'u_admin',
    authorName: 'Abinav Thejas K',
    authorModel: 'F77 MACH 2',
    title: 'Nandi Hills Sunrise & Lepakshi Temple Loop',
    startingPoint: 'Bengaluru (Hebbal Flyover)',
    totalDistanceKm: 195,
    chargingOptionsOnWay:
      'No mid-ride charge required on F77 Recon/Mach 2 (completes on a single charge with ~32% SoC remaining). Devanahalli Supernova station available on return leg if topping up.',
    chargingAvailable: true,
    chargerTypesAvailable: ['Single Charge Capable', 'UV Supernova Devanahalli'],
    locationMapUrl: 'https://www.google.com/maps/search/?api=1&query=13.3702,77.6835&source=mlgmmupgrade&utm_campaign=ml-ar-wv',
    photos: [
      createDestinationPresetIllustration('mountain_ghat', 'Nandi Hills & Lepakshi Loop')
    ],
    routeSummary: 'Hebbal → Devanahalli → Nandi Hills Summit → Bagepalli → Lepakshi → Bengaluru',
    bestTimeToVisit: 'Year-round • Reach Nandi Foothills before 05:45 AM',
    riderTips:
      'Carry your portable 15A adapter just in case you extend the ride further north. Watch for morning mist on hairpins 4 through 9.',
    createdAt: '2026-10-20T05:15:00.000Z'
  },
  {
    id: 'dest_seed_coorg',
    authorId: 'u_phantom',
    authorName: 'Devika Nair',
    authorModel: 'F77 Original',
    title: 'Madikeri Glass Bridge & Coorg Misty Ghats',
    startingPoint: 'Bengaluru (Kengeri Mysore Expressway)',
    totalDistanceKm: 520,
    chargingOptionsOnWay:
      'Maddur Highway Socket Waypoint + Mysuru Ring Road Fast Charger + Community Provided Charger at Kushalnagar Rider Hangar (3.3 kW).',
    chargingAvailable: true,
    chargerTypesAvailable: ['Community Provided Charger', '15A 3-Pin Socket', 'Type 2 AC'],
    locationMapUrl: 'https://www.google.com/maps/search/?api=1&query=12.4244,75.7382&source=mlgmmupgrade&utm_campaign=ml-ar-wv',
    photos: [
      createDestinationPresetIllustration('forest_dam', 'Madikeri & Coorg Ghats')
    ],
    routeSummary: 'Bengaluru → Maddur → Mysuru → Kushalnagar → Madikeri Raja Seat',
    bestTimeToVisit: 'September to February • Early morning departure',
    riderTips:
      'Top up to 95% at Mysuru before climbing Kushalnagar-Madikeri ghat section. Plenty of scenic coffee stops with 15A sockets.',
    createdAt: '2026-10-22T07:45:00.000Z'
  }
];

/**
 * Extracts valid geographic coordinates (lat, lng) from a Google Maps URL or coordinate string.
 * Supports:
 * - ?query=lat,lng / &q=lat,lng / ?ll=lat,lng / &destination=lat,lng / &origin=lat,lng
 * - !3d<lat>!4d<lng> (Google Maps exact place pin coordinates)
 * - /@<lat>,<lng> (Google Maps viewport/place URL)
 * - /search/<lat>,<lng> or /dir/.../<lat>,<lng>
 * - Raw coordinate text such as "13.0730, 77.7921" or "13.0730°N, 77.7921°E"
 */
export function extractCoordinatesFromGoogleMapsUrl(
  rawUrl?: string | null
): { lat: number; lng: number; latitude: number; longitude: number } | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let decoded = rawUrl.trim();
  if (!decoded) return null;

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep original if percent-decoding fails
  }

  const isValidLatLng = (lat: number, lng: number): boolean =>
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001);

  const makeResult = (lat: number, lng: number) => {
    const cleanLat = Number(lat.toFixed(6));
    const cleanLng = Number(lng.toFixed(6));
    return { lat: cleanLat, lng: cleanLng, latitude: cleanLat, longitude: cleanLng };
  };

  // 1. Exact pin data parameter: !3d<lat>!4d<lng> (use last occurrence in URL for destination/pin)
  const bangMatches = Array.from(
    decoded.matchAll(/!3d([+-]?\d+(?:\.\d+)?)!4d([+-]?\d+(?:\.\d+)?)/g)
  );
  if (bangMatches.length > 0) {
    const last = bangMatches[bangMatches.length - 1];
    const lat = Number(last[1]);
    const lng = Number(last[2]);
    if (isValidLatLng(lat, lng)) {
      return makeResult(lat, lng);
    }
  }

  // 2. Query parameters: query=lat,lng | q=lat,lng | destination=lat,lng | origin=lat,lng | ll=lat,lng | center=lat,lng
  const paramMatch = decoded.match(
    /[?&](?:query|q|destination|origin|ll|center|daddr|saddr)=([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)/i
  );
  if (paramMatch) {
    const lat = Number(paramMatch[1]);
    const lng = Number(paramMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return makeResult(lat, lng);
    }
  }

  // 3. Google Maps @lat,lng path segment
  const atMatch = decoded.match(/@([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)/);
  if (atMatch) {
    const lat = Number(atMatch[1]);
    const lng = Number(atMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return makeResult(lat, lng);
    }
  }

  // 4. /search/lat,lng or /place/lat,lng or /dir/.../lat,lng
  const pathMatch = decoded.match(
    /\/(?:search|place|dir)\/(?:[^/]+\/)*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)/i
  );
  if (pathMatch) {
    const lat = Number(pathMatch[1]);
    const lng = Number(pathMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return makeResult(lat, lng);
    }
  }

  // 5. Raw coordinate pair in string (e.g. "13.0730, 77.7921" or "Pinned coordinates 13.0730°N, 77.7921°E")
  const rawCoordMatch = decoded.match(
    /([+-]?\d{1,2}\.\d{3,})\s*°?\s*[NS]?\s*,\s*([+-]?\d{1,3}\.\d{3,})\s*°?\s*[EW]?/i
  );
  if (rawCoordMatch) {
    const lat = Number(rawCoordMatch[1]);
    const lng = Number(rawCoordMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return makeResult(lat, lng);
    }
  }

  return null;
}

/**
 * Extracts a human-readable location search query from a Google Maps URL when it contains a place name
 * rather than raw numeric coordinates (e.g., https://www.google.com/maps/search/?api=1&query=Kolar+CCD).
 */
export function extractQueryTextFromGoogleMapsUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;

  try {
    const parsed = new URL(trimmed);
    for (const key of ['query', 'q', 'destination', 'daddr', 'origin']) {
      const val = parsed.searchParams.get(key);
      if (val && val.trim() && !/^[+-]?\d+(\.\d+)?\s*,\s*[+-]?\d+(\.\d+)?$/.test(val.trim())) {
        return val.trim().replace(/\+/g, ' ');
      }
    }
    const placeMatch = parsed.pathname.match(/\/maps\/place\/([^/]+)/i);
    if (placeMatch && placeMatch[1]) {
      const decoded = decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ').trim();
      if (decoded && !/^[+-]?\d+(\.\d+)?\s*,\s*[+-]?\d+(\.\d+)?$/.test(decoded)) {
        return decoded;
      }
    }
  } catch {
    // Ignore malformed URL
  }
  return null;
}

/**
 * Built-in dictionary of common Indian cities, towns, hills, and squadron hubs for fast synchronous lookup.
 */
const COMMON_INDIA_WAYPOINT_COORDS: { keys: string[]; lat: number; lng: number }[] = [
  { keys: ['bengaluru hangar', 'indiranagar hangar', 'ultraviolette hangar', 'uv hangar', 'indiranagar'], lat: 12.9719, lng: 77.6412 },
  { keys: ['bengaluru', 'bangalore'], lat: 12.9716, lng: 77.5946 },
  { keys: ['hebbal flyover', 'hebbal'], lat: 13.0358, lng: 77.5970 },
  { keys: ['nelamangala toll', 'nelamangala expressway toll gate', 'nelamangala'], lat: 13.0335, lng: 77.3986 },
  { keys: ['kengeri', 'nice road kengeri'], lat: 12.9177, lng: 77.4833 },
  { keys: ['electronic city', 'hosur elevated tollway'], lat: 12.8452, lng: 77.6602 },
  { keys: ['whitefield'], lat: 12.9698, lng: 77.7500 },
  { keys: ['koramangala'], lat: 12.9352, lng: 77.6245 },
  { keys: ['yelahanka'], lat: 13.1007, lng: 77.5963 },
  { keys: ['devanahalli', 'devanahalli airport toll', 'airport toll'], lat: 13.2085, lng: 77.7082 },
  { keys: ['indian paratha company', 'ipc'], lat: 13.2980, lng: 77.7120 },
  { keys: ['nandi hills', 'nandi hills summit', 'nandi hills summit parking gate', 'nandi foothills'], lat: 13.3702, lng: 77.6835 },
  { keys: ['hoskote', 'hosakote'], lat: 13.0730, lng: 77.7921 },
  { keys: ['narasapura'], lat: 13.1412, lng: 78.0114 },
  { keys: ['kolar ccd', 'ccd kolar', 'café coffee day (ccd) — kolar nh 75 bypass', 'cafe coffee day kolar'], lat: 13.1328, lng: 78.1715 },
  { keys: ['kolar', 'kolar town', 'kolar clock tower'], lat: 13.1362, lng: 78.1291 },
  { keys: ['mulbagal'], lat: 13.1645, lng: 78.3932 },
  { keys: ['chikkaballapur', 'chickballapur'], lat: 13.4355, lng: 77.7315 },
  { keys: ['lepakshi', 'lepakshi temple'], lat: 13.8037, lng: 77.6094 },
  { keys: ['ramanagara'], lat: 12.7209, lng: 77.2799 },
  { keys: ['channapatna'], lat: 12.6518, lng: 77.2067 },
  { keys: ['maddur', 'ccd maddur', 'maddur tiffany'], lat: 12.5841, lng: 77.0428 },
  { keys: ['mandya'], lat: 12.5218, lng: 76.8951 },
  { keys: ['mysuru', 'mysore', 'mysuru palace'], lat: 12.2958, lng: 76.6394 },
  { keys: ['kunigal', 'kunigal lake', 'kunigal bypass'], lat: 12.9860, lng: 76.9920 },
  { keys: ['hassan', 'hassan highway ev hub', 'hassan bypass'], lat: 13.0070, lng: 76.0960 },
  { keys: ['sakleshpur', 'sakleshpur valley viewpoint'], lat: 12.9698, lng: 75.7874 },
  { keys: ['chikkamagaluru', 'chikmagalur', 'mullayanagiri', 'mullayanagiri peak'], lat: 13.3909, lng: 75.7214 },
  { keys: ['madikeri', 'coorg', 'kushalnagar'], lat: 12.4244, lng: 75.7382 },
  { keys: ['tumakuru', 'tumkur'], lat: 13.3409, lng: 77.1010 },
  { keys: ['chitradurga'], lat: 14.2251, lng: 76.3980 },
  { keys: ['shivamogga', 'shimoga'], lat: 13.9299, lng: 75.5681 },
  { keys: ['mangaluru', 'mangalore'], lat: 12.9141, lng: 74.8560 },
  { keys: ['udupi', 'manipal'], lat: 13.3409, lng: 74.7421 },
  { keys: ['gokarna'], lat: 14.5479, lng: 74.3188 },
  { keys: ['hampi', 'hospet', 'hosapete'], lat: 15.2689, lng: 76.3909 },
  { keys: ['hubballi', 'hubli', 'dharwad'], lat: 15.3647, lng: 75.1240 },
  { keys: ['belagavi', 'belgaum'], lat: 15.8497, lng: 74.4977 },
  { keys: ['hosur'], lat: 12.7409, lng: 77.8253 },
  { keys: ['krishnagiri'], lat: 12.5266, lng: 78.2150 },
  { keys: ['yelagiri', 'yelagiri hills'], lat: 12.5794, lng: 78.6385 },
  { keys: ['vellore'], lat: 12.9349, lng: 79.1469 },
  { keys: ['sriperumbudur'], lat: 12.9675, lng: 79.9479 },
  { keys: ['chennai', 'madras'], lat: 13.0827, lng: 80.2707 },
  { keys: ['mahabalipuram', 'mamallapuram', 'ecr'], lat: 12.6208, lng: 80.1945 },
  { keys: ['puducherry', 'pondicherry'], lat: 11.9416, lng: 79.8083 },
  { keys: ['salem'], lat: 11.6643, lng: 78.1460 },
  { keys: ['yercaud'], lat: 11.7753, lng: 78.2093 },
  { keys: ['coimbatore', 'kovai'], lat: 11.0168, lng: 76.9558 },
  { keys: ['ooty', 'udhagamandalam', 'coonoor', 'nilgiris'], lat: 11.4102, lng: 76.6950 },
  { keys: ['kodaikanal'], lat: 10.2381, lng: 77.4892 },
  { keys: ['madurai'], lat: 9.9252, lng: 78.1198 },
  { keys: ['kanyakumari'], lat: 8.0883, lng: 77.5385 },
  { keys: ['kochi', 'cochin', 'edappally', 'ernakulam'], lat: 10.0261, lng: 76.3125 },
  { keys: ['munnar'], lat: 10.0889, lng: 77.0595 },
  { keys: ['wayanad', 'kalpetta', 'lakkidi'], lat: 11.6085, lng: 76.0832 },
  { keys: ['kozhikode', 'calicut'], lat: 11.2588, lng: 75.7804 },
  { keys: ['thiruvananthapuram', 'trivandrum'], lat: 8.5241, lng: 76.9366 },
  { keys: ['hyderabad', 'hitec city', 'secunderabad'], lat: 17.4435, lng: 78.3772 },
  { keys: ['horsley hills', 'madanapalle'], lat: 13.6601, lng: 78.3995 },
  { keys: ['tirupati'], lat: 13.6288, lng: 79.4192 },
  { keys: ['mumbai', 'worli', 'worli sea face'], lat: 19.0176, lng: 72.8172 },
  { keys: ['lonavala'], lat: 18.7557, lng: 73.4091 },
  { keys: ['pune', 'wakad', 'hinjewadi'], lat: 18.5204, lng: 73.8567 },
  { keys: ['goa', 'panaji', 'panjim'], lat: 15.4909, lng: 73.8278 },
  { keys: ['new delhi', 'delhi', 'connaught place', 'gurugram', 'gurgaon'], lat: 28.6315, lng: 77.2167 }
];

/**
 * Resolves true, accurate geographic coordinates for any Mission Mode waypoint
 * (Meeting Point, Intermediate Stop/Break, Charging Hub, or Destination).
 */
export function resolveTrueWaypointCoordinates(
  input?: {
    name?: string | null;
    locationName?: string | null;
    title?: string | null;
    address?: string | null;
    location?: string | null;
    lat?: unknown;
    lng?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    googleMapsUrl?: string | null;
  } | null,
  externalCandidates: PlaceSuggestion[] = []
): {
  lat: number;
  lng: number;
  latitude: number;
  longitude: number;
  resolvedFrom: 'explicit' | 'gmaps_url' | 'directory';
} | null {
  if (!input || typeof input !== 'object') return null;

  const formatCoordOut = (
    latVal: number,
    lngVal: number,
    resolvedFrom: 'explicit' | 'gmaps_url' | 'directory'
  ) => {
    const cleanLat = Number(latVal.toFixed(6));
    const cleanLng = Number(lngVal.toFixed(6));
    return {
      lat: cleanLat,
      lng: cleanLng,
      latitude: cleanLat,
      longitude: cleanLng,
      resolvedFrom
    };
  };

  const parseCoord = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v.trim());
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  };

  const rawLat = parseCoord(input.lat) ?? parseCoord(input.latitude);
  const rawLng = parseCoord(input.lng) ?? parseCoord(input.longitude);

  const primaryName = String(
    input.name || input.locationName || input.title || ''
  ).trim();
  const secondaryText = String(input.address || input.location || '').trim();

  // Check if Google Maps URL has explicit coordinates first if URL was pasted
  const urlCoords = extractCoordinatesFromGoogleMapsUrl(input.googleMapsUrl);

  if (
    rawLat !== undefined &&
    rawLng !== undefined &&
    rawLat >= -90 &&
    rawLat <= 90 &&
    rawLng >= -180 &&
    rawLng <= 180 &&
    !(Math.abs(rawLat) < 0.0001 && Math.abs(rawLng) < 0.0001)
  ) {
    // Guard against stale default Nandi Hills (13.3702, 77.6835) when the user's destination name is clearly NOT Nandi Hills
    const isDefaultNandiCoords =
      Math.abs(rawLat - 13.3702) < 0.001 && Math.abs(rawLng - 77.6835) < 0.001;
    const mentionsNandi = /nandi|chikkaballapur|chickballapur|karahalli/i.test(
      `${primaryName} ${secondaryText}`
    );

    if (!isDefaultNandiCoords || mentionsNandi || !primaryName) {
      return formatCoordOut(rawLat, rawLng, 'explicit');
    }
  }

  // 2. Coordinates embedded in Google Maps URL
  if (urlCoords) {
    return formatCoordOut(urlCoords.lat, urlCoords.lng, 'gmaps_url');
  }

  // 3. Coordinates embedded in name or address
  const textCoords =
    extractCoordinatesFromGoogleMapsUrl(primaryName) ||
    extractCoordinatesFromGoogleMapsUrl(secondaryText);
  if (textCoords) {
    return formatCoordOut(textCoords.lat, textCoords.lng, 'gmaps_url');
  }

  // 4. Match place name / address / Google Maps query text against known places & cities
  const urlQueryText = extractQueryTextFromGoogleMapsUrl(input.googleMapsUrl) || '';
  const searchCandidates = [primaryName, urlQueryText, secondaryText].filter(
    s => s && s.length >= 2
  );

  for (const queryStr of searchCandidates) {
    const qLower = queryStr
      .toLowerCase()
      .replace(/\s+group\s+ride$/i, '')
      .trim();

    // 4a. Check exact match in COMMON_INDIA_WAYPOINT_COORDS
    for (const entry of COMMON_INDIA_WAYPOINT_COORDS) {
      if (entry.keys.some(k => k === qLower)) {
        return formatCoordOut(entry.lat, entry.lng, 'directory');
      }
    }

    // 4b. Search ranked places (externalCandidates + VERIFIED_INDIA_PLACES_DIRECTORY)
    const ranked = searchAndRankPlaces(qLower, externalCandidates);
    if (ranked.length > 0) {
      return formatCoordOut(ranked[0].latitude, ranked[0].longitude, 'directory');
    }

    // 4c. Check partial key match in COMMON_INDIA_WAYPOINT_COORDS (longest key first)
    let bestPartial: { lat: number; lng: number; keyLen: number } | null = null;
    for (const entry of COMMON_INDIA_WAYPOINT_COORDS) {
      for (const k of entry.keys) {
        if (k.length >= 4 && (qLower.includes(k) || k.includes(qLower))) {
          if (!bestPartial || k.length > bestPartial.keyLen) {
            bestPartial = { lat: entry.lat, lng: entry.lng, keyLen: k.length };
          }
        }
      }
    }
    if (bestPartial) {
      return formatCoordOut(bestPartial.lat, bestPartial.lng, 'directory');
    }
  }

  // If explicit coordinates were Nandi Hills default and nothing else matched, still return explicit
  if (
    rawLat !== undefined &&
    rawLng !== undefined &&
    rawLat >= -90 &&
    rawLat <= 90 &&
    rawLng >= -180 &&
    rawLng <= 180 &&
    !(Math.abs(rawLat) < 0.0001 && Math.abs(rawLng) < 0.0001)
  ) {
    return formatCoordOut(rawLat, rawLng, 'explicit');
  }

  return null;
}

/**
 * Builds a direct, functional Google Maps query link for any waypoint or coordinate set.
 * Uses clean https://maps.google.com/maps?q= format to avoid intent:// scheme redirects in Android WebViews.
 */
export function buildGoogleMapsUrl(lat?: number, lng?: number, queryName?: string): string {
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    const cleanLat = lat.toFixed(6);
    const cleanLng = lng.toFixed(6);
    if (queryName && queryName.trim()) {
      return `https://maps.google.com/maps?q=${cleanLat},${cleanLng}+(${encodeURIComponent(queryName.trim())})`;
    }
    return `https://maps.google.com/maps?q=${cleanLat},${cleanLng}`;
  }
  if (queryName && queryName.trim()) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(queryName.trim())}`;
  }
  return 'https://maps.google.com/maps';
}

/**
 * Normalizes and sanitizes any raw map link (including `intent://`, `geo:`, `google.navigation:`,
 * `comgooglemaps://`, `maps:`, bare domains, or `https://www.google.com/maps/...`) into a clean
 * `https://maps.google.com/maps?...` URL that never triggers `net::ERR_UNKNOWN_URL_SCHEME` in Android WebViews.
 */
export function sanitizeGoogleMapsUrl(
  customUrl?: string | null,
  lat?: number,
  lng?: number,
  queryName?: string
): string {
  const trimmed = (customUrl || '').trim();

  if (!trimmed) {
    return buildGoogleMapsUrl(lat, lng, queryName);
  }

  // 1. If URL contains intent:// scheme or embedded fallback URL, extract coordinates
  if (trimmed.includes('intent://')) {
    const embeddedCoords = extractCoordinatesFromGoogleMapsUrl(trimmed);
    if (embeddedCoords) {
      if (trimmed.includes('destination=') || trimmed.includes('daddr=') || trimmed.includes('/dir/')) {
        return `https://maps.google.com/maps?daddr=${embeddedCoords.latitude.toFixed(6)},${embeddedCoords.longitude.toFixed(6)}`;
      }
      return buildGoogleMapsUrl(embeddedCoords.latitude, embeddedCoords.longitude, queryName);
    }
    if (typeof lat === 'number' && typeof lng === 'number' && isFinite(lat) && isFinite(lng)) {
      return buildGoogleMapsUrl(lat, lng, queryName);
    }
  }

  // 2. Extract coordinates if present
  const embeddedCoords = extractCoordinatesFromGoogleMapsUrl(trimmed);

  // 3. Normalize any Google Maps URL to remove ?api=1 and replace with clean ?daddr= or ?q=
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = u.hostname.toLowerCase();
    const isGmaps = host.includes('google.com') || host.includes('goo.gl');

    if (isGmaps) {
      const daddr = u.searchParams.get('destination') || u.searchParams.get('daddr');
      const saddr = u.searchParams.get('origin') || u.searchParams.get('saddr');
      const q = u.searchParams.get('query') || u.searchParams.get('q');

      if (daddr) {
        const dCoords = extractCoordinatesFromGoogleMapsUrl(daddr);
        if (dCoords) {
          if (saddr) {
            const sCoords = extractCoordinatesFromGoogleMapsUrl(saddr);
            if (sCoords) {
              return `https://maps.google.com/maps?saddr=${sCoords.latitude.toFixed(6)},${sCoords.longitude.toFixed(6)}&daddr=${dCoords.latitude.toFixed(6)},${dCoords.longitude.toFixed(6)}`;
            }
          }
          return `https://maps.google.com/maps?daddr=${dCoords.latitude.toFixed(6)},${dCoords.longitude.toFixed(6)}`;
        }
        return `https://maps.google.com/maps?daddr=${encodeURIComponent(daddr)}`;
      }

      if (q) {
        const qCoords = extractCoordinatesFromGoogleMapsUrl(q);
        if (qCoords) {
          return `https://maps.google.com/maps?q=${qCoords.latitude.toFixed(6)},${qCoords.longitude.toFixed(6)}`;
        }
        return `https://maps.google.com/maps?q=${encodeURIComponent(q)}`;
      }

      if (embeddedCoords) {
        return `https://maps.google.com/maps?q=${embeddedCoords.latitude.toFixed(6)},${embeddedCoords.longitude.toFixed(6)}`;
      }
    }
  } catch {
    // Fall back below
  }

  if (embeddedCoords) {
    return buildGoogleMapsUrl(embeddedCoords.latitude, embeddedCoords.longitude, queryName);
  }

  if (typeof lat === 'number' && typeof lng === 'number' && isFinite(lat) && isFinite(lng)) {
    return buildGoogleMapsUrl(lat, lng, queryName);
  }

  return 'https://maps.google.com/maps';
}

/**
 * Opens a Google Maps link or location query directly in the native Google Maps app or browser
 * using clean https://maps.google.com/maps URLs.
 * Never triggers `net::ERR_UNKNOWN_URL_SCHEME` in Android WebViews or Play Store APKs.
 */
export function openInGoogleMaps(
  customUrl?: string,
  lat?: number,
  lng?: number,
  queryName?: string
): string {
  let navLat = lat;
  let navLng = lng;

  if ((navLat === undefined || navLng === undefined) && customUrl) {
    const coords = extractCoordinatesFromGoogleMapsUrl(customUrl);
    if (coords) {
      navLat = coords.latitude;
      navLng = coords.longitude;
    }
  }

  const targetUrl = sanitizeGoogleMapsUrl(
    customUrl,
    navLat,
    navLng,
    queryName
  );

  if (typeof window !== 'undefined') {
    window.location.assign(targetUrl);
  }

  return targetUrl;
}
export function buildMasterRouteGoogleMapsUrl(
  params: {
    meetingPoint?: { name: string; lat?: number; lng?: number; googleMapsUrl?: string };
    destination?: { name: string; lat?: number; lng?: number; googleMapsUrl?: string };
    stops?: { name: string; lat?: number; lng?: number; googleMapsUrl?: string }[];
    chargingStops?: { locationName: string; lat?: number; lng?: number; googleMapsUrl?: string }[];
    customRouteUrl?: string;
  },
  externalCandidates: PlaceSuggestion[] = []
): string {
  const resolvedMeeting = params.meetingPoint
    ? resolveTrueWaypointCoordinates(params.meetingPoint, externalCandidates)
    : null;
  const originStr = resolvedMeeting
    ? `${resolvedMeeting.lat.toFixed(6)},${resolvedMeeting.lng.toFixed(6)}`
    : params.meetingPoint?.name || '';

  const resolvedDest = params.destination
    ? resolveTrueWaypointCoordinates(params.destination, externalCandidates)
    : null;
  const destStr = resolvedDest
    ? `${resolvedDest.lat.toFixed(6)},${resolvedDest.lng.toFixed(6)}`
    : params.destination?.name || '';

  if (!originStr && !destStr) {
    if (params.customRouteUrl && params.customRouteUrl.trim()) {
      return sanitizeGoogleMapsUrl(params.customRouteUrl.trim());
    }
    return buildGoogleMapsUrl();
  }

  return `https://maps.google.com/maps?saddr=${encodeURIComponent(originStr)}&daddr=${encodeURIComponent(destStr)}`;
}

// ============================================================================
// CHARGING STATIONS MINIMAL DATABASE INTEGRATION
// ============================================================================

export interface MinimalChargingStationRecord {
  reference_name: string;
  exact_location_coordinates: string;
  charger_type: string;
  location_status: string;
}

export interface ParsedMinimalCoordinatePair {
  latitude: number;
  longitude: number;
  rawCoordinateString: string;
}

export interface SkippedMinimalStationRecord {
  recordIndex: number;
  originalIndex: number;
  reference_name: string;
  exact_location_coordinates: string;
  charger_type: string;
  formattedChargerType: string;
  location_status: string;
  skipReason: 'missing_coordinates' | 'invalid_coordinates';
  reasonSkipped: string;
}

export interface MinimalChargingStationMarkerRecord {
  id: string;
  name: string;
  referenceName: string;
  location: string;
  latitude: number;
  longitude: number;
  exactLocationCoordinates: string;
  rawChargerType: string;
  chargerType: ChargerPlugType;
  chargerDetails: string;
  locationStatus: string;
  isUnverifiedAssociation: boolean;
  originalRecordIndex: number;
  coordinatePairIndex: number;
  vehicleCompatibility: string;
  connectorTypes: string[];
  powerOutputKw: number;
  chargerSource: ChargerSource;
  isSupernova: boolean;
  isCommunityReported: boolean;
  verifiedByAdmin: boolean;
  approvalStatus: 'approved';
  published: true;
  operatingStatus: 'Operational';
  accessConditions: 'Public 24/7';
  pricing: string;
  lastVerifiedDate: string;
  userNotes: string;
  reportedBy: string;
}

export interface ParsedMinimalChargingDatabaseResult {
  allRecords: MinimalChargingStationRecord[];
  validStations: MinimalChargingStationMarkerRecord[];
  skippedRecords: SkippedMinimalStationRecord[];
  totalRecordsCount: number;
  totalRecordsLoaded: number;
  recordsWithValidCoordinatesCount: number;
  validMarkersCount: number;
  validMapMarkersCount: number;
  skippedRecordsCount: number;
}

/**
 * Extracts all valid GPS coordinate pairs from `exact_location_coordinates`.
 * Supports single `"lat, lng"` strings as well as semicolon-separated multiple pairs
 * `"lat1, lng1; lat2, lng2"`. Never generates random or approximate coordinates.
 */
export function parseMinimalCoordinatePairs(rawCoords: unknown): ParsedMinimalCoordinatePair[] {
  if (typeof rawCoords !== 'string' || !rawCoords.trim()) {
    return [];
  }

  const segments = rawCoords
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);

  const pairs: ParsedMinimalCoordinatePair[] = [];

  for (const seg of segments) {
    const parts = seg.split(',').map(p => p.trim());
    if (parts.length !== 2) continue;

    const coordCheck = validateManualCoordinates(parts[0], parts[1]);
    if (
      coordCheck.valid &&
      coordCheck.latitude !== undefined &&
      coordCheck.longitude !== undefined
    ) {
      pairs.push({
        latitude: coordCheck.latitude,
        longitude: coordCheck.longitude,
        rawCoordinateString: `${parts[0]}, ${parts[1]}`
      });
    }
  }

  return pairs;
}

/**
 * Formats the charger_type field from charging_stations_minimal.json.
 * Keeps missing charger types clearly labeled as "Charger type unavailable" per data rules.
 */
export function formatMinimalChargerType(rawChargerType: unknown): string {
  if (typeof rawChargerType !== 'string') {
    return 'Charger type unavailable';
  }
  const trimmed = rawChargerType.trim();
  if (!trimmed) {
    return 'Charger type unavailable';
  }
  return trimmed;
}

/**
 * Maps a raw `charger_type` and `reference_name` from `charging_stations_minimal.json`
 * to a consistent GHOST PROTOCOL marker category ('Supernova' | 'Type 6' | 'Type 2' | 'Socket').
 */
export function inferChargerPlugCategory(
  rawChargerType: unknown,
  referenceName?: unknown
): {
  chargerType: ChargerPlugType;
  chargerSource: ChargerSource;
  isSupernova: boolean;
  powerOutputKw: number;
  connectorTypes: string[];
} {
  const typeText = typeof rawChargerType === 'string' ? rawChargerType.toLowerCase() : '';
  const nameText = typeof referenceName === 'string' ? referenceName.toLowerCase() : '';
  const combined = `${nameText} ${typeText}`;

  if (
    combined.includes('supernova') ||
    nameText.includes('ultraviolette space station') ||
    nameText.includes('ultraviolette hangar')
  ) {
    return {
      chargerType: 'Supernova',
      chargerSource: 'Supernova',
      isSupernova: true,
      powerOutputKw: 30,
      connectorTypes: ['Supernova DC Fast']
    };
  }

  if (
    typeText.includes('type 2') ||
    typeText.includes('type-2') ||
    typeText.includes('type2') ||
    typeText.includes('ccs2') ||
    typeText.includes('ac type 2') ||
    typeText.includes('7.2kw') ||
    typeText.includes('7.4kw')
  ) {
    return {
      chargerType: 'Type 2',
      chargerSource: '3rd Party Station',
      isSupernova: false,
      powerOutputKw: 7.2,
      connectorTypes: [formatMinimalChargerType(rawChargerType)]
    };
  }

  if (
    typeText.includes('type 6') ||
    typeText.includes('type-6') ||
    typeText.includes('type6') ||
    typeText.includes('blaze dc') ||
    typeText.includes('blazer dc') ||
    typeText.includes('bolt blaze') ||
    typeText.includes('fast 3kw') ||
    typeText.includes('3 kw fast') ||
    typeText.includes('dc 3kw')
  ) {
    return {
      chargerType: 'Type 6',
      chargerSource: '3rd Party Station',
      isSupernova: false,
      powerOutputKw: 3.0,
      connectorTypes: [formatMinimalChargerType(rawChargerType)]
    };
  }

  return {
    chargerType: 'Socket',
    chargerSource: '3rd Party Station',
    isSupernova: false,
    powerOutputKw: 3.3,
    connectorTypes: [formatMinimalChargerType(rawChargerType)]
  };
}

/**
 * Parses the entire `charging_stations_minimal.json` array according to strict data rules:
 * - Preserves all 182 records in `allRecords`.
 * - Keeps records with missing/invalid coordinates in `skippedRecords` (never plots them on map).
 * - Creates a marker record for every valid GPS coordinate pair at its exact supplied coordinates.
 * - Preserves duplicate records and duplicate coordinates until genuine duplicates can be confirmed.
 * - Never invents station names or GPS coordinates.
 * - Marks `isUnverifiedAssociation` when `location_status` warns to verify association.
 */
export function parseMinimalChargingStationsDatabase(
  rawRecords: unknown
): ParsedMinimalChargingDatabaseResult {
  if (!Array.isArray(rawRecords)) {
    return {
      allRecords: [],
      validStations: [],
      skippedRecords: [],
      totalRecordsCount: 0,
      totalRecordsLoaded: 0,
      recordsWithValidCoordinatesCount: 0,
      validMarkersCount: 0,
      validMapMarkersCount: 0,
      skippedRecordsCount: 0
    };
  }

  const allRecords: MinimalChargingStationRecord[] = [];
  const validStations: MinimalChargingStationMarkerRecord[] = [];
  const skippedRecords: SkippedMinimalStationRecord[] = [];
  let recordsWithValidCoordinatesCount = 0;

  rawRecords.forEach((item, recordIndex) => {
    if (!item || typeof item !== 'object') return;
    const rec = item as Record<string, unknown>;
    const reference_name =
      typeof rec.reference_name === 'string' && rec.reference_name.trim()
        ? rec.reference_name.trim()
        : 'Unnamed Charging Station';
    const exact_location_coordinates =
      typeof rec.exact_location_coordinates === 'string'
        ? rec.exact_location_coordinates.trim()
        : '';
    const charger_type =
      typeof rec.charger_type === 'string' ? rec.charger_type.trim() : '';
    const location_status =
      typeof rec.location_status === 'string' && rec.location_status.trim()
        ? rec.location_status.trim()
        : exact_location_coordinates
        ? 'coordinates found in same text section; verify association'
        : 'exact coordinates not present in this section';

    const normalizedRecord: MinimalChargingStationRecord = {
      reference_name,
      exact_location_coordinates,
      charger_type,
      location_status
    };
    allRecords.push(normalizedRecord);

    const formattedChargerType = formatMinimalChargerType(charger_type);
    const coordPairs = parseMinimalCoordinatePairs(exact_location_coordinates);

    if (coordPairs.length === 0) {
      skippedRecords.push({
        recordIndex,
        originalIndex: recordIndex,
        reference_name,
        exact_location_coordinates,
        charger_type,
        formattedChargerType,
        location_status,
        skipReason: exact_location_coordinates ? 'invalid_coordinates' : 'missing_coordinates',
        reasonSkipped: location_status || 'Missing or invalid GPS coordinates'
      });
      return;
    }

    recordsWithValidCoordinatesCount++;
    const inferred = inferChargerPlugCategory(charger_type, reference_name);
    const isUnverifiedAssociation =
      location_status.toLowerCase().includes('verify association') ||
      location_status.toLowerCase().includes('same text section') ||
      location_status.toLowerCase().includes('unverified');

    coordPairs.forEach((pair, pairIndex) => {
      validStations.push({
        id: `min_cs_${recordIndex}_${pairIndex}`,
        name: reference_name,
        referenceName: reference_name,
        location: `${pair.rawCoordinateString} • ${location_status}`,
        latitude: pair.latitude,
        longitude: pair.longitude,
        exactLocationCoordinates: pair.rawCoordinateString,
        rawChargerType: charger_type,
        chargerType: inferred.chargerType,
        chargerDetails: formattedChargerType,
        locationStatus: location_status,
        isUnverifiedAssociation,
        originalRecordIndex: recordIndex,
        coordinatePairIndex: pairIndex,
        vehicleCompatibility: 'F77, X47',
        connectorTypes: inferred.connectorTypes,
        powerOutputKw: inferred.powerOutputKw,
        chargerSource: inferred.chargerSource,
        isSupernova: inferred.isSupernova,
        isCommunityReported: false,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: 'Standard Network Tariff',
        lastVerifiedDate: '2026-11-02',
        userNotes: location_status,
        reportedBy: 'GHOST PROTOCOL Charging Database'
      });
    });
  });

  return {
    allRecords,
    validStations,
    skippedRecords,
    totalRecordsCount: allRecords.length,
    totalRecordsLoaded: allRecords.length,
    recordsWithValidCoordinatesCount,
    validMarkersCount: validStations.length,
    validMapMarkersCount: validStations.length,
    skippedRecordsCount: skippedRecords.length
  };
}

/**
 * Searches and filters charging stations by station/reference name, charger type,
 * coordinates, or plug category filter.
 */
export function searchAndFilterChargingStations<
  T extends {
    id?: string;
    name: string;
    referenceName?: string;
    location?: string;
    latitude: number;
    longitude: number;
    exactLocationCoordinates?: string;
    rawChargerType?: string;
    chargerType?: string;
    chargerDetails?: string;
    locationStatus?: string;
    connectorTypes?: string[];
    isSupernova: boolean;
    isCommunityReported: boolean;
    powerOutputKw: number;
    chargerSource?: ChargerSource;
    createdAt?: string;
    lastVerifiedDate?: string;
    userNotes?: string;
    reportedBy?: string;
  }
>(stations: T[], searchQuery: string, filterType = 'ALL'): T[] {
  if (!Array.isArray(stations)) return [];
  const q = (searchQuery || '').trim().toLowerCase();
  const rawTokens = q
    .split(/[\s,.-]+/)
    .filter(t => t.length > 0 && !PLACE_QUERY_STOP_WORDS.has(t));

  return stations.filter(st => {
    if (filterType && filterType !== 'ALL') {
      if (!matchesChargingStationFilter(st, filterType)) {
        return false;
      }
    }

    if (!q) return true;

    const refName = (st.referenceName || st.name || '').toLowerCase();
    const stName = (st.name || '').toLowerCase();
    const rawType = formatMinimalChargerType(st.rawChargerType ?? st.chargerDetails ?? st.chargerType).toLowerCase();
    const plugCategory = (st.chargerType || '').toLowerCase();
    const coordsText = (
      st.exactLocationCoordinates || `${st.latitude}, ${st.longitude}`
    ).toLowerCase();
    const locText = (st.location || '').toLowerCase();
    const connectorsText = Array.isArray(st.connectorTypes)
      ? st.connectorTypes.join(' ').toLowerCase()
      : '';
    const notesText = (st.userNotes || '').toLowerCase();
    const reporterText = (st.reportedBy || '').toLowerCase();

    if (
      refName.includes(q) ||
      stName.includes(q) ||
      rawType.includes(q) ||
      plugCategory.includes(q) ||
      coordsText.includes(q) ||
      locText.includes(q) ||
      connectorsText.includes(q)
    ) {
      return true;
    }

    // Multi-token search across combined station fields (e.g., "ccd kolar" where "CCD" is in name and "Kolar" is in location)
    if (rawTokens.length > 0) {
      const combined = `${refName} ${stName} ${locText} ${rawType} ${plugCategory} ${coordsText} ${connectorsText} ${notesText} ${reporterText}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      const allTokensMatched = rawTokens.every(token => {
        const normToken = token.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (combined.includes(normToken)) return true;
        const expansions = INDIAN_PLACE_ABBREVIATIONS[normToken] || [];
        return expansions.some(exp =>
          combined.includes(
            exp
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
          )
        );
      });

      if (allTokensMatched) return true;
    }

    return false;
  });
}

// ============================================================================
// INTERACTIVE COCKPIT RED-GLOW TARGET REGISTRY & ROTARY HUD HELPERS
// ============================================================================

export interface CockpitInteractiveZone {
  id: string;
  label: string;
  routeId: string;
  /** Compass bearing in degrees (0 = North/Top, 90 = East/Right, 180 = South/Bottom, 270 = West/Left) */
  bearingDeg: number;
  /** Center point in 941 x 1672 canvas coordinates */
  centerPoint: { x: number; y: number };
  /** SVG path in 0 0 941 1672 coordinates for masking the photorealistic red glow layer */
  svgMaskPath: string;
  /** SVG path in 0 0 941 1672 coordinates for the animated crimson plasma border & laser trace */
  svgBorderPath: string;
  /** Whether this zone is one of the 8 primary circular dial sectors */
  isDialSector: boolean;
}

export const COCKPIT_DIAL_CENTER = { x: 470.5, y: 808.5 };

export const COCKPIT_INTERACTIVE_ZONES: CockpitInteractiveZone[] = [
  {
    id: 'sector_priority_issues',
    label: 'PRIORITY ISSUES',
    routeId: 'problems',
    bearingDeg: 284,
    centerPoint: { x: 84, y: 724 },
    svgMaskPath: 'M 46 604 L 196 604 A 337.5 339.5 0 0 0 133 818.5 L 6 818.5 A 460 460 0 0 1 46 604 Z',
    svgBorderPath: 'M 46 604 L 196 604 A 337.5 339.5 0 0 0 133 818.5 L 6 818.5 A 460 460 0 0 1 46 604 Z',
    isDialSector: true
  },
  {
    id: 'sector_jet_engineer',
    label: 'JET ENGINEER',
    routeId: 'jet_engineer',
    bearingDeg: 0,
    centerPoint: { x: 470.5, y: 564 },
    svgMaskPath:
      'M 377 698 L 352 679 L 321 647 L 289 615 L 265 576 L 246 549 A 337.5 339.5 0 0 1 695 549 L 674 574 L 635 600 L 607 636 L 576 669 L 559 694 A 143 143 0 0 0 377 698 Z',
    svgBorderPath:
      'M 377 698 L 352 679 L 321 647 L 289 615 L 265 576 L 246 549 A 337.5 339.5 0 0 1 695 549 L 674 574 L 635 600 L 607 636 L 576 669 L 559 694 A 143 143 0 0 0 377 698 Z',
    isDialSector: true
  },
  {
    id: 'sector_marketplace',
    label: 'MARKET PLACE',
    routeId: 'marketplace',
    bearingDeg: 76,
    centerPoint: { x: 857, y: 724 },
    svgMaskPath: 'M 745 604 L 895 604 A 460 460 0 0 1 935 818.5 L 808 818.5 A 337.5 339.5 0 0 0 745 604 Z',
    svgBorderPath: 'M 745 604 L 895 604 A 460 460 0 0 1 935 818.5 L 808 818.5 A 337.5 339.5 0 0 0 745 604 Z',
    isDialSector: true
  },
  {
    id: 'sector_charging_network',
    label: 'CHARGING NETWORK',
    routeId: 'charging',
    bearingDeg: 90,
    centerPoint: { x: 705, y: 805 },
    svgMaskPath:
      'M 559 694 L 576 669 L 607 636 L 635 600 L 674 574 L 695 549 A 337.5 339.5 0 0 1 698 1054 L 695 1022 L 668 985 L 636 954 L 603 923 L 579 905 A 143 143 0 0 0 559 694 Z',
    svgBorderPath:
      'M 559 694 L 576 669 L 607 636 L 635 600 L 674 574 L 695 549 A 337.5 339.5 0 0 1 698 1054 L 695 1022 L 668 985 L 636 954 L 603 923 L 579 905 A 143 143 0 0 0 559 694 Z',
    isDialSector: true
  },
  {
    id: 'sector_discussions',
    label: 'DISCUSSIONS',
    routeId: 'discussions',
    bearingDeg: 104,
    centerPoint: { x: 857, y: 904 },
    svgMaskPath: 'M 808 818.5 L 935 818.5 A 460 460 0 0 1 891 1014 L 739 1014 A 337.5 339.5 0 0 0 808 818.5 Z',
    svgBorderPath: 'M 808 818.5 L 935 818.5 A 460 460 0 0 1 891 1014 L 739 1014 A 337.5 339.5 0 0 0 808 818.5 Z',
    isDialSector: true
  },
  {
    id: 'sector_mission_mode',
    label: 'MISSION MODE',
    routeId: 'mission',
    bearingDeg: 180,
    centerPoint: { x: 470.5, y: 1042 },
    svgMaskPath:
      'M 579 905 L 603 923 L 636 954 L 668 985 L 695 1022 L 698 1054 A 337.5 339.5 0 0 1 243 1054 L 248 1024 L 285 997 L 315 964 L 348 933 L 365 908 A 143 143 0 0 0 579 905 Z',
    svgBorderPath:
      'M 579 905 L 603 923 L 636 954 L 668 985 L 695 1022 L 698 1054 A 337.5 339.5 0 0 1 243 1054 L 248 1024 L 285 997 L 315 964 L 348 933 L 365 908 A 143 143 0 0 0 579 905 Z',
    isDialSector: true
  },
  {
    id: 'sector_mod_lab',
    label: 'MOD LAB',
    routeId: 'modifications',
    bearingDeg: 256,
    centerPoint: { x: 84, y: 904 },
    svgMaskPath: 'M 6 818.5 L 133 818.5 A 337.5 339.5 0 0 0 202 1014 L 50 1014 A 460 460 0 0 1 6 818.5 Z',
    svgBorderPath: 'M 6 818.5 L 133 818.5 A 337.5 339.5 0 0 0 202 1014 L 50 1014 A 460 460 0 0 1 6 818.5 Z',
    isDialSector: true
  },
  {
    id: 'sector_squadron_assist',
    label: 'SQUADRON ASSIST',
    routeId: 'emergency',
    bearingDeg: 270,
    centerPoint: { x: 236, y: 805 },
    svgMaskPath:
      'M 365 908 L 348 933 L 315 964 L 285 997 L 248 1024 L 243 1054 A 337.5 339.5 0 0 1 246 549 L 265 576 L 289 615 L 321 647 L 352 679 L 377 698 A 143 143 0 0 0 365 908 Z',
    svgBorderPath:
      'M 365 908 L 348 933 L 315 964 L 285 997 L 248 1024 L 243 1054 A 337.5 339.5 0 0 1 246 549 L 265 576 L 289 615 L 321 647 L 352 679 L 377 698 A 143 143 0 0 0 365 908 Z',
    isDialSector: true
  },
  {
    id: 'sector_center_core',
    label: 'AVIONICS CORE RETICLE',
    routeId: 'system_controls',
    bearingDeg: 0,
    centerPoint: { x: 470.5, y: 808.5 },
    svgMaskPath: 'M 328.5 808.5 A 142 142 0 1 1 612.5 808.5 A 142 142 0 1 1 328.5 808.5 Z',
    svgBorderPath: 'M 328.5 808.5 A 142 142 0 1 1 612.5 808.5 A 142 142 0 1 1 328.5 808.5 Z',
    isDialSector: false
  },
  {
    id: 'panel_all_system_controls',
    label: 'ALL SYSTEMS',
    routeId: 'system_controls',
    bearingDeg: 180,
    centerPoint: { x: 470.5, y: 1328 },
    svgMaskPath: 'M 192 1254 L 749 1254 L 796 1328 L 749 1406 L 192 1406 L 145 1328 Z',
    svgBorderPath: 'M 192 1254 L 749 1254 L 796 1328 L 749 1406 L 192 1406 L 145 1328 Z',
    isDialSector: false
  },
  {
    id: 'nav_ride',
    label: 'RIDE',
    routeId: 'mission',
    bearingDeg: 332,
    centerPoint: { x: 165, y: 224 },
    svgMaskPath: 'M 95 198 L 235 198 L 235 252 L 95 252 Z',
    svgBorderPath: 'M 95 198 L 235 198 L 235 252 L 95 252 Z',
    isDialSector: false
  },
  {
    id: 'nav_connect',
    label: 'CONNECT',
    routeId: 'discussions',
    bearingDeg: 348,
    centerPoint: { x: 338, y: 224 },
    svgMaskPath: 'M 236 198 L 440 198 L 440 252 L 236 252 Z',
    svgBorderPath: 'M 236 198 L 440 198 L 440 252 L 236 252 Z',
    isDialSector: false
  },
  {
    id: 'nav_support',
    label: 'SUPPORT',
    routeId: 'service',
    bearingDeg: 12,
    centerPoint: { x: 542, y: 224 },
    svgMaskPath: 'M 441 198 L 645 198 L 645 252 L 441 252 Z',
    svgBorderPath: 'M 441 198 L 645 198 L 645 252 L 441 252 Z',
    isDialSector: false
  },
  {
    id: 'nav_upgrade',
    label: 'UPGRADE',
    routeId: 'modifications',
    bearingDeg: 28,
    centerPoint: { x: 750, y: 224 },
    svgMaskPath: 'M 646 198 L 845 198 L 845 252 L 646 252 Z',
    svgBorderPath: 'M 646 198 L 845 198 L 845 252 L 646 252 Z',
    isDialSector: false
  },
  {
    id: 'status_online',
    label: 'ONLINE',
    routeId: 'online_status',
    bearingDeg: 312,
    centerPoint: { x: 145, y: 348 },
    svgMaskPath: 'M 16 304 L 278 304 L 278 394 L 16 394 Z',
    svgBorderPath: 'M 16 304 L 278 304 L 278 394 L 16 394 Z',
    isDialSector: false
  },
  {
    id: 'top_right_contribute',
    label: 'SUPPORT APP CONTRIBUTE',
    routeId: 'contribute',
    bearingDeg: 48,
    centerPoint: { x: 796, y: 348 },
    svgMaskPath: 'M 662 304 L 925 304 L 925 394 L 662 394 Z',
    svgBorderPath: 'M 662 304 L 925 304 L 925 394 L 662 394 Z',
    isDialSector: false
  },
  {
    id: 'header_logo',
    label: 'GHOST PROTOCOL',
    routeId: 'dashboard',
    bearingDeg: 335,
    centerPoint: { x: 235, y: 126 },
    svgMaskPath: 'M 20 60 L 490 60 L 424 192 L 20 192 Z',
    svgBorderPath: 'M 20 60 L 490 60 L 424 192 L 20 192 Z',
    isDialSector: false
  },
  {
    id: 'header_search',
    label: 'GLOBAL SEARCH',
    routeId: 'search',
    bearingDeg: 8,
    centerPoint: { x: 531.5, y: 128 },
    svgMaskPath: 'M 495.5 128 A 36 36 0 1 1 567.5 128 A 36 36 0 1 1 495.5 128 Z',
    svgBorderPath: 'M 495.5 128 A 36 36 0 1 1 567.5 128 A 36 36 0 1 1 495.5 128 Z',
    isDialSector: false
  },
  {
    id: 'header_notifications',
    label: 'NOTIFICATIONS',
    routeId: 'notifications',
    bearingDeg: 18,
    centerPoint: { x: 613, y: 128 },
    svgMaskPath: 'M 577 128 A 36 36 0 1 1 649 128 A 36 36 0 1 1 577 128 Z',
    svgBorderPath: 'M 577 128 A 36 36 0 1 1 649 128 A 36 36 0 1 1 577 128 Z',
    isDialSector: false
  },
  {
    id: 'header_profile',
    label: 'OPERATOR PROFILE',
    routeId: 'profile',
    bearingDeg: 32,
    centerPoint: { x: 693.5, y: 128 },
    svgMaskPath: 'M 656 90 L 900 90 L 900 166 L 656 166 Z',
    svgBorderPath: 'M 656 90 L 900 90 L 900 166 L 656 166 Z',
    isDialSector: false
  }
];

/**
 * Clockwise order of the 8 circular dial sectors for sequential / rotary toggling.
 */
export const COCKPIT_DIAL_RING_ORDER: string[] = [
  'sector_jet_engineer',
  'sector_marketplace',
  'sector_charging_network',
  'sector_discussions',
  'sector_mission_mode',
  'sector_mod_lab',
  'sector_squadron_assist',
  'sector_priority_issues'
];

export function getCockpitZoneById(zoneId: string): CockpitInteractiveZone {
  return (
    COCKPIT_INTERACTIVE_ZONES.find(z => z.id === zoneId) ||
    COCKPIT_INTERACTIVE_ZONES[0]
  );
}

/**
 * Computes the shortest signed angular delta (-180..+180) from currentDeg to targetDeg
 * so rotating needles/reticles never spin the wrong way across 0/360.
 */
export function computeShortestRotationDelta(currentDeg: number, targetDeg: number): number {
  const diff = ((targetDeg - currentDeg + 540) % 360) - 180;
  return diff === -180 ? 180 : diff;
}

/**
 * Resolves which cockpit sector is under a given (x, y) point in 941 x 1672 canvas coordinates
 * during rotary touch/pointer scrubbing around the circular cockpit dial.
 */
export function resolveCockpitZoneFromCanvasPoint(
  x: number,
  y: number
): CockpitInteractiveZone | null {
  const dx = x - COCKPIT_DIAL_CENTER.x;
  const dy = y - COCKPIT_DIAL_CENTER.y;
  const dist = Math.hypot(dx, dy);

  // Outside the circular dial & wings region
  if (dist > 475 || y < 440 || y > 1190) {
    return null;
  }

  // Center reticle core
  if (dist < 143) {
    return getCockpitZoneById('sector_center_core');
  }

  // Outer wing regions (Left: Priority Issues / Mod Lab; Right: Marketplace / Discussions)
  if (dist >= 340) {
    if (x < 196 && y >= 604 && y <= 1016) {
      return getCockpitZoneById(
        y <= 818.5 ? 'sector_priority_issues' : 'sector_mod_lab'
      );
    }
    if (x > 745 && y >= 604 && y <= 1016) {
      return getCockpitZoneById(
        y <= 818.5 ? 'sector_marketplace' : 'sector_discussions'
      );
    }
  }

  // Inner 4 sectors resolved by angle from (470.5, 808.5)
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angleDeg >= -131 && angleDeg <= -50) {
    return getCockpitZoneById('sector_jet_engineer');
  }
  if (angleDeg > -50 && angleDeg <= 43) {
    return getCockpitZoneById('sector_charging_network');
  }
  if (angleDeg > 43 && angleDeg <= 136) {
    return getCockpitZoneById('sector_mission_mode');
  }
  return getCockpitZoneById('sector_squadron_assist');
}

/**
 * Cycles the active red-glow cockpit sector clockwise/counter-clockwise or directionally.
 */
export function cycleCockpitSector(
  currentZoneId: string,
  direction: 'next' | 'prev' | 'up' | 'down' | 'left' | 'right'
): CockpitInteractiveZone {
  if (direction === 'up') return getCockpitZoneById('sector_jet_engineer');
  if (direction === 'down') return getCockpitZoneById('sector_mission_mode');
  if (direction === 'left') {
    if (currentZoneId === 'sector_squadron_assist') {
      return getCockpitZoneById('sector_priority_issues');
    }
    if (currentZoneId === 'sector_priority_issues') {
      return getCockpitZoneById('sector_mod_lab');
    }
    return getCockpitZoneById('sector_squadron_assist');
  }
  if (direction === 'right') {
    if (currentZoneId === 'sector_charging_network') {
      return getCockpitZoneById('sector_marketplace');
    }
    if (currentZoneId === 'sector_marketplace') {
      return getCockpitZoneById('sector_discussions');
    }
    return getCockpitZoneById('sector_charging_network');
  }

  const idx = COCKPIT_DIAL_RING_ORDER.indexOf(currentZoneId);
  const startIdx = idx === -1 ? 0 : idx;
  const step = direction === 'next' ? 1 : -1;
  const nextIdx =
    (startIdx + step + COCKPIT_DIAL_RING_ORDER.length) %
    COCKPIT_DIAL_RING_ORDER.length;
  return getCockpitZoneById(COCKPIT_DIAL_RING_ORDER[nextIdx]);
}

// ============================================================================
// COCKPIT CORE-TO-INTERFACE TRANSFORMING BOOT ANIMATION ENGINE
// ============================================================================

export type CockpitBootPhase = 'core_logo' | 'dial_expand' | 'full_deploy' | 'ready';

export const COCKPIT_BOOT_TIMELINE_MS = {
  CORE_LOGO_END: 180,
  DIAL_EXPAND_END: 420,
  FULL_DEPLOY_END: 680
} as const;

export interface CockpitBootTransformSpec {
  phase: CockpitBootPhase;
  /** Circular iris clip-path radius percentage around (50%, 48.44%) */
  irisRadiusPct: number;
  /** CSS clip-path string for the 941x1672 cockpit stage */
  clipPathCss: string;
  /** Scale factor centered on the circular dial core (470.5, 810) */
  stageScale: number;
  /** Subtle mechanical lock-in rotation in degrees */
  stageRotateDeg: number;
  /** Opacity of the central Ghost Protocol holo-emblem overlay (0..1) */
  centerLogoOpacity: number;
  /** Scale of the central Ghost Protocol holo-emblem overlay */
  centerLogoScale: number;
  /** Opacity of the radial dial sector expansion shockwave & rays (0..1) */
  dialWaveOpacity: number;
  /** Radius (in canvas px) of the expanding circular interface shockwave */
  dialWaveRadiusPx: number;
  /** Opacity of the outer buttons/options perimeter lock-on trace (0..1) */
  outerButtonsTraceOpacity: number;
  /** Opacity of the bottom lower chassis extension & community disclaimer (0..1) */
  lowerChassisOpacity: number;
  /** Scale factor of the bottom lower chassis extension during boot transformation */
  lowerChassisScale: number;
  /** Vertical translation (in px) of the bottom lower chassis extension during boot transformation */
  lowerChassisTranslateYPx: number;
  /** CSS clip-path string for the bottom lower chassis extension during boot transformation */
  lowerChassisClipPathCss: string;
}

export interface CockpitRadialExpansionRay {
  id: string;
  angleDeg: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  accentColor: '#FF1E27' | '#38BDF8';
}

/**
* 8 radial vector rays emanating from the circular interface center (470.5, 810)
* along the primary sector boundaries and cardinal axes during the transforming expansion.
*/
export const COCKPIT_RADIAL_EXPANSION_RAYS: readonly CockpitRadialExpansionRay[] = [
  { angleDeg: -90, accentColor: '#FF1E27' },
  { angleDeg: -45, accentColor: '#38BDF8' },
  { angleDeg: 0, accentColor: '#FF1E27' },
  { angleDeg: 45, accentColor: '#38BDF8' },
  { angleDeg: 90, accentColor: '#FF1E27' },
  { angleDeg: 135, accentColor: '#38BDF8' },
  { angleDeg: 180, accentColor: '#FF1E27' },
  { angleDeg: -135, accentColor: '#38BDF8' }
].map((item, idx) => {
  const rad = (item.angleDeg * Math.PI) / 180;
  const innerR = 118;
  const outerR = 448;
  return {
    id: `ray_${idx}_${item.angleDeg}`,
    angleDeg: item.angleDeg,
    x1: Number((COCKPIT_DIAL_CENTER.x + Math.cos(rad) * innerR).toFixed(1)),
    y1: Number((COCKPIT_DIAL_CENTER.y + Math.sin(rad) * innerR).toFixed(1)),
    x2: Number((COCKPIT_DIAL_CENTER.x + Math.cos(rad) * outerR).toFixed(1)),
    y2: Number((COCKPIT_DIAL_CENTER.y + Math.sin(rad) * outerR).toFixed(1)),
    accentColor: item.accentColor as '#FF1E27' | '#38BDF8'
  };
});

/**
 * Resolves the active CockpitBootPhase from elapsed milliseconds since app open.
 */
export function resolveCockpitBootPhase(
  elapsedMs: number,
  reducedMotion = false
): CockpitBootPhase {
  if (reducedMotion || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return 'ready';
  }
  if (elapsedMs < COCKPIT_BOOT_TIMELINE_MS.CORE_LOGO_END) {
    return 'core_logo';
  }
  if (elapsedMs < COCKPIT_BOOT_TIMELINE_MS.DIAL_EXPAND_END) {
    return 'dial_expand';
  }
  if (elapsedMs < COCKPIT_BOOT_TIMELINE_MS.FULL_DEPLOY_END) {
    return 'full_deploy';
  }
  return 'ready';
}

/**
 * Determines whether the Cockpit Core-to-Interface Transforming Boot Animation
 * should be skipped (e.g., when returning via Back / Previous Page after initial app start).
 */
export function shouldSkipCockpitBootAnimation(options: {
  hasBootedInSession: boolean;
  skipBootAnimation?: boolean;
  reducedMotion?: boolean;
  initialShowSystemControls?: boolean;
}): boolean {
  return Boolean(
    options.hasBootedInSession ||
      options.skipBootAnimation ||
      options.reducedMotion ||
      options.initialShowSystemControls
  );
}

/**
 * Returns the deterministic geometric & visual transformation parameters for a given
 * CockpitBootPhase (start with logo in center -> expand circular interface -> deploy all buttons & lower chassis).
 */
export function getCockpitBootTransformSpec(
  phase: CockpitBootPhase
): CockpitBootTransformSpec {
  switch (phase) {
    case 'core_logo':
      return {
        phase: 'core_logo',
        irisRadiusPct: 9.2,
        clipPathCss: 'circle(9.2% at 50% 48.44%)',
        stageScale: 1.18,
        stageRotateDeg: -10,
        centerLogoOpacity: 1,
        centerLogoScale: 1.08,
        dialWaveOpacity: 0.35,
        dialWaveRadiusPx: 138,
        outerButtonsTraceOpacity: 0,
        lowerChassisOpacity: 0,
        lowerChassisScale: 0.84,
        lowerChassisTranslateYPx: -44,
        lowerChassisClipPathCss: 'inset(0% 50% 100% 50%)'
      };
    case 'dial_expand':
      return {
        phase: 'dial_expand',
        irisRadiusPct: 28.5,
        clipPathCss: 'circle(28.5% at 50% 48.44%)',
        stageScale: 1.04,
        stageRotateDeg: 0,
        centerLogoOpacity: 0,
        centerLogoScale: 0.88,
        dialWaveOpacity: 1,
        dialWaveRadiusPx: 388,
        outerButtonsTraceOpacity: 0.25,
        lowerChassisOpacity: 0,
        lowerChassisScale: 0.92,
        lowerChassisTranslateYPx: -24,
        lowerChassisClipPathCss: 'inset(0% 35% 100% 35%)'
      };
    case 'full_deploy':
      return {
        phase: 'full_deploy',
        irisRadiusPct: 115,
        clipPathCss: 'circle(115% at 50% 48.44%)',
        stageScale: 1,
        stageRotateDeg: 0,
        centerLogoOpacity: 0,
        centerLogoScale: 0.82,
        dialWaveOpacity: 0.45,
        dialWaveRadiusPx: 780,
        outerButtonsTraceOpacity: 1,
        lowerChassisOpacity: 1,
        lowerChassisScale: 1,
        lowerChassisTranslateYPx: 0,
        lowerChassisClipPathCss: 'inset(0% 0% 0% 0%)'
      };
    case 'ready':
    default:
      return {
        phase: 'ready',
        irisRadiusPct: 150,
        clipPathCss: 'none',
        stageScale: 1,
        stageRotateDeg: 0,
        centerLogoOpacity: 0,
        centerLogoScale: 1,
        dialWaveOpacity: 0,
        dialWaveRadiusPx: 940,
        outerButtonsTraceOpacity: 0,
        lowerChassisOpacity: 1,
        lowerChassisScale: 1,
        lowerChassisTranslateYPx: 0,
        lowerChassisClipPathCss: 'none'
      };
  }
}

export interface CockpitOperatorBadge {
  displayName: string;
  pilotLabel: string;
  userId: string;
  fullName: string;
}

/**
 * Resolves the top-right Cockpit Header identity badge for the currently logged-in user
 * so every user sees their own Name/ID and Bike Model Pilot tag (e.g. F77 PILOT / X47 PILOT / custom nickname).
 */
export function resolveCockpitOperatorBadge(
  user?: {
    id?: string;
    email?: string;
    fullName?: string;
    originalName?: string;
    customPrimaryName?: string | null;
    pilotNickname?: PilotNickname | string | null;
    customSecondaryTag?: string | null;
    hideSecondaryTag?: boolean;
    motorcycleModel?: string;
    role?: string;
    isOwner?: boolean;
  } | null
): CockpitOperatorBadge {
  if (!user) {
    return {
      displayName: 'SIGN IN',
      pilotLabel: 'UV PILOT',
      userId: 'GUEST',
      fullName: 'Guest Pilot'
    };
  }

  const identity = resolveUserDisplayIdentity(user);
  const rawName = (identity.primaryName || user.fullName || user.originalName || 'PILOT').trim();

  const firstWord = rawName.split(/\s+/)[0] || 'PILOT';
  const candidateName =
    identity.customPrimaryName && identity.customPrimaryName.trim().length <= 12
      ? identity.customPrimaryName.trim()
      : rawName.length <= 10
      ? rawName
      : firstWord;
  const displayName = candidateName.toUpperCase().slice(0, 12);

  const modelUpper = (user.motorcycleModel || '').trim().toUpperCase();
  const modelPilot = modelUpper.includes('X47')
    ? 'X47 PILOT'
    : modelUpper.includes('F77')
    ? 'F77 PILOT'
    : null;

  const customNick =
    typeof user.pilotNickname === 'string' &&
    user.pilotNickname.trim().length > 0 &&
    user.pilotNickname.trim().toUpperCase() !== 'F77 PILOT' &&
    user.pilotNickname.trim().toUpperCase() !== 'X47 PILOT'
      ? user.pilotNickname.trim().toUpperCase()
      : null;

  const explicitNick =
    typeof user.pilotNickname === 'string' && user.pilotNickname.trim().length > 0
      ? user.pilotNickname.trim().toUpperCase()
      : null;

  const rawPilotLabel =
    (identity.customSecondaryTag && identity.customSecondaryTag.toUpperCase()) ||
    customNick ||
    modelPilot ||
    explicitNick ||
    'F77 PILOT';

  return {
    displayName,
    pilotLabel: rawPilotLabel.slice(0, 14),
    userId: (user.id || 'PILOT').toUpperCase(),
    fullName: rawName
  };
}

/**
 * Canonical community purpose disclaimer text displayed in the mobile cockpit bottom chassis gap.
 */
export const COCKPIT_COMMUNITY_DISCLAIMER_TEXT =
  'This is not official Ultraviolette Automotive app, this is to discover, help , assist Ultraviolette owners and have some fun!';

export const COCKPIT_COMMUNITY_DISCLAIMER_TAGLINE =
  'COMMUNITY PLATFORM • NOT AN OFFICIAL APP';

/**
 * Reads and compresses any photo file picked from device media (Android, iOS, Desktop).
 * Handles missing MIME types (""), application/octet-stream, HEIC/HEIF, camera photos,
 * and high-resolution images, producing a normalized JPEG Data URL (data:image/jpeg;base64,...)
 * for instant preview and persistent sharing to all users.
 */
export async function processUploadedDevicePhoto(file: File): Promise<string> {
  if (!file) return '';

  const drawToJpegDataUrl = (
    source: HTMLImageElement | ImageBitmap,
    sw: number,
    sh: number
  ): string => {
    try {
      const MAX_DIM = 960;
      let width = sw || 800;
      let height = sh || 600;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
      let dataUrl = canvas.toDataURL('image/jpeg', 0.76);
      if (dataUrl.length > 95000) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.62);
      }
      return dataUrl;
    } catch {
      return '';
    }
  };

  // 1. Direct pass-through for SVG or GIF animations
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }

  // 2. Fast native ImageBitmap path (if supported and valid)
  if (typeof window !== 'undefined' && typeof window.createImageBitmap === 'function') {
    try {
      const bitmap = await window.createImageBitmap(file);
      const dataUrl = drawToJpegDataUrl(bitmap, bitmap.width, bitmap.height);
      if (typeof bitmap.close === 'function') {
        bitmap.close();
      }
      if (dataUrl && dataUrl.startsWith('data:image/')) {
        return dataUrl;
      }
    } catch {
      // Fall through to FileReader
    }
  }

  // 3. FileReader fallback with MIME normalization & Canvas compression
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      let rawResult = (e.target?.result as string) || '';
      if (!rawResult) {
        resolve('');
        return;
      }

      if (rawResult.startsWith('data:application/octet-stream;base64,')) {
        rawResult = rawResult.replace('data:application/octet-stream;base64,', 'data:image/jpeg;base64,');
      } else if (rawResult.startsWith('data:;base64,')) {
        rawResult = rawResult.replace('data:;base64,', 'data:image/jpeg;base64,');
      } else if (!rawResult.startsWith('data:image/')) {
        const commaIdx = rawResult.indexOf(',');
        if (commaIdx !== -1) {
          rawResult = 'data:image/jpeg;base64' + rawResult.slice(commaIdx);
        } else {
          rawResult = 'data:image/jpeg;base64,' + rawResult;
        }
      }

      const img = new Image();
      img.onload = () => {
        const compressed = drawToJpegDataUrl(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
        resolve(compressed || rawResult);
      };
      img.onerror = () => {
        resolve(rawResult);
      };
      img.src = rawResult;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

export const PHOTO_BRIDGE_SESSION_KEY = 'ghost_photo_bridge_session_id';

/**
 * Returns a persistent session ID used to bridge photos from Android system browser / native picker
 * back into the running Android WebView app instance.
 */
export function getOrCreatePhotoBridgeSessionId(): string {
  if (typeof window === 'undefined') return 'pb_server';
  try {
    const saved = localStorage.getItem(PHOTO_BRIDGE_SESSION_KEY);
    if (saved && saved.trim()) {
      return saved.trim();
    }
    const fresh = `pb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(PHOTO_BRIDGE_SESSION_KEY, fresh);
    return fresh;
  } catch {
    return `pb_${Date.now()}`;
  }
}

/**
 * Prepares the active target before triggering the device's native media picker or camera
 * directly inside the app (via WebChromeClient.onShowFileChooser on <input type="file">),
 * WITHOUT opening Chrome or any external web browser.
 */
export function prepareNativePhotoPickerTarget(
  target: string,
  mode: 'gallery' | 'camera' = 'gallery'
): void {
  if (typeof window === 'undefined') return;
  const resolvedTarget = target || 'modifications';
  try {
    localStorage.setItem('ghost_active_photo_target', resolvedTarget);
    localStorage.setItem('ghost_active_photo_mode', mode);
    localStorage.setItem('ghost_active_photo_timestamp', String(Date.now()));
    localStorage.removeItem('ghost_native_pending_photos');

    if (resolvedTarget !== 'modifications') {
      const existingModPhotos = localStorage.getItem('ghost_current_mod_photos');
      if (existingModPhotos !== null) {
        localStorage.setItem('ghost_saved_mod_photos_backup', existingModPhotos);
      } else {
        localStorage.removeItem('ghost_saved_mod_photos_backup');
      }
    }
  } catch {}

  try {
    (window as any).__ghostActivePhotoTarget = resolvedTarget;
    (window as any).__ghostLastPhotoDeliveredAt = 0;
    delete (window as any).__ghostPendingNativePhotos;
  } catch {}
}

/**
 * Returns the currently active photo upload target page.
 */
export function getActivePhotoTarget(): string {
  if (typeof window === 'undefined') return 'modifications';
  try {
    const winTarget = (window as any).__ghostActivePhotoTarget;
    if (typeof winTarget === 'string' && winTarget.trim()) {
      return winTarget.trim();
    }
    const stored = localStorage.getItem('ghost_active_photo_target');
    if (stored && stored.trim()) {
      return stored.trim();
    }
  } catch {}
  return 'modifications';
}

/**
 * Returns true if a photo batch for the current picker tap was already delivered
 * within the last 2.2 seconds (preventing duplicate additions when both
 * MainActivity's evaluateJavascript and <input type="file"> onChange fire).
 */
export function hasRecentNativePhotoDelivery(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const last = Number((window as any).__ghostLastPhotoDeliveredAt || 0);
    return last > 0 && Date.now() - last < 2200;
  } catch {
    return false;
  }
}

/**
 * Claims and normalizes an incoming batch of photos for the specified target,
 * cleaning up temporary native WebView buffers and preventing duplicate delivery.
 */
export function claimNativePhotoDeliveryBatch(
  target: string,
  incoming: string[] | string
): string[] {
  const list = Array.isArray(incoming)
    ? incoming
    : typeof incoming === 'string'
    ? [incoming]
    : [];
  const clean = list
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim())
    .filter(
      item =>
        item.startsWith('data:image/') ||
        item.startsWith('data:video/') ||
        /^https?:\/\//i.test(item)
    );

  if (clean.length === 0) return [];

  if (typeof window !== 'undefined') {
    try {
      delete (window as any).__ghostPendingNativePhotos;
    } catch {}
    try {
      localStorage.removeItem('ghost_native_pending_photos');
      if (target !== 'modifications') {
        const backup = localStorage.getItem('ghost_saved_mod_photos_backup');
        if (backup !== null) {
          localStorage.setItem('ghost_current_mod_photos', backup);
        } else {
          localStorage.removeItem('ghost_current_mod_photos');
        }
      }
    } catch {}

    if (hasRecentNativePhotoDelivery()) {
      return [];
    }
    try {
      (window as any).__ghostLastPhotoDeliveredAt = Date.now();
    } catch {}
  }

  return clean;
}

/**
 * Kept for compatibility; prepares the native photo picker target without opening an external browser.
 */
export function openAndroidMediaBridgeSheet(params: {
  target: string;
  mode?: 'gallery' | 'camera';
  sessionId?: string;
}): string {
  const sid = params.sessionId || getOrCreatePhotoBridgeSessionId();
  const mode = params.mode === 'camera' ? 'camera' : 'gallery';
  const target = params.target || 'modifications';
  prepareNativePhotoPickerTarget(target, mode);
  return `/api/android-media-sheet/${encodeURIComponent(sid)}?target=${encodeURIComponent(target)}&mode=${mode}`;
}

/**
 * Polls both local native WebView injection buffers and server `/api/photo-bridge` endpoints
 * for a specific target page ('modifications', 'marketplace', 'problems', 'problems_update',
 * 'jet_engineer', 'admin_qr').
 */
export async function pollAndroidPhotoBridgeForTarget(
  target: string,
  sessionId?: string
): Promise<string[]> {
  if (typeof window === 'undefined') return [];

  const sid = sessionId || getOrCreatePhotoBridgeSessionId();
  const activeTarget = getActivePhotoTarget();

  // 1. Check direct JS-injected buffers if activeTarget matches this page
  if (activeTarget === target) {
    try {
      const winPending = (window as any).__ghostPendingNativePhotos;
      if (Array.isArray(winPending) && winPending.length > 0) {
        const claimed = claimNativePhotoDeliveryBatch(target, winPending);
        if (claimed.length > 0) return claimed;
      }
    } catch {}

    try {
      const rawPending = localStorage.getItem('ghost_native_pending_photos');
      if (rawPending) {
        localStorage.removeItem('ghost_native_pending_photos');
        const parsed = JSON.parse(rawPending);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const claimed = claimNativePhotoDeliveryBatch(target, parsed);
          if (claimed.length > 0) return claimed;
        }
      }
    } catch {}
  }

  // 2. Check session-specific server photo bridge
  if (sid && sid !== 'native_direct') {
    try {
      const res = await fetch(
        `/api/photo-bridge/${encodeURIComponent(sid)}?consume=1&target=${encodeURIComponent(target)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.images) && data.images.length > 0) {
          const claimed = claimNativePhotoDeliveryBatch(target, data.images);
          if (claimed.length > 0) return claimed;
        }
      }
    } catch {}
  }

  // 3. Check latest photo bridge entry for this target
  try {
    const latestRes = await fetch(
      `/api/photo-bridge-latest?target=${encodeURIComponent(target)}&consume=1`
    );
    if (latestRes.ok) {
      const latestData = await latestRes.json();
      if (Array.isArray(latestData.images) && latestData.images.length > 0) {
        const claimed = claimNativePhotoDeliveryBatch(target, latestData.images);
        if (claimed.length > 0) return claimed;
      }
    }
  } catch {}

  // 4. Check native_direct endpoint if activeTarget matches
  if (activeTarget === target) {
    try {
      const directRes = await fetch('/api/photo-bridge/native_direct?consume=1');
      if (directRes.ok) {
        const directData = await directRes.json();
        if (Array.isArray(directData.images) && directData.images.length > 0) {
          const claimed = claimNativePhotoDeliveryBatch(target, directData.images);
          if (claimed.length > 0) return claimed;
        }
      }
    } catch {}
  }

  return [];
}

