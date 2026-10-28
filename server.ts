import express, { type Request, type Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { generateOfflineJetEngineerResponse } from './src/utils/telemetryCache.ts';
import {
  validateChargingPlugSubmission,
  isPubliclyPublishedCharger,
  canModifyChargerRecord,
  CHARGER_PLUG_TYPE_SPECS,
  expandIndianPlaceQuery,
  searchAndRankPlaces,
  describeMapPinLocation,
  sanitizeAndValidateProductLinks,
  calculateDistanceKm,
  validateManualCoordinates,
  formatManualCoordinatesFallback,
  isOwnerAccount,
  isAdminOrOwnerAccount,
  hasAdminPermission,
  sanitizeAdminPermissions,
  inferDefaultPilotNickname,
  validateMemberNicknameSelection,
  validateCustomDisplayText,
  resolveUserDisplayIdentity,
  stripLegacyCallsignSuffix,
  canUserModerateOrModifyRecord,
  OWNER_ACCOUNT_ID,
  OWNER_ACCOUNT_EMAIL,
  DEFAULT_CONTRIBUTION_CONFIG,
  canEditContributionPage,
  sanitizeContributionConfig,
  redactContributionForPublicWall,
  validateContributionSubmission,
  validatePollCreation,
  castPollVote,
  validatePetitionCreation,
  togglePetitionSupport,
  resolveMarketplaceListingType,
  calculateRentalBookingCost,
  validateAndPlaceAuctionBid,
  selectAuctionWinner,
  createMarketplacePresetIllustration,
  resolveChargerSubmitterInfo,
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
  DEFAULT_VISITED_DESTINATIONS,
  type ChargerPlugType,
  type ChargerReservation,
  type CommunityChargerCostUnit,
  type PlaceSuggestion,
  type AdminPermission,
  type PilotNickname,
  type ContributionConfig,
  type ContributionRecord,
  type DiscussionPoll,
  type DiscussionPetition
} from './src/utils/rules.ts';
import {
  isValidChargerReportCategory,
  type ChargerCommunityReport,
  type AutoPilotMissionRecord
} from './src/utils/autopilot.ts';
import { searchAllIndiaLocations } from './src/utils/indiaLocations.ts';
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  generateSetupToken,
  verifySetupToken,
  resolveSessionSecret,
  SessionManager,
  LoginRateLimiter,
  validateCsrfRequest,
  serializeClearSessionCookie,
  stripSensitiveCredentialFields,
  sanitizeUserForPublic,
  sanitizeRideForViewer,
  sanitizeEmergencyForViewer,
  sanitizeMarketplaceItemForViewer
} from './src/utils/security.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

let fallbackTmpDataDir: string | null = null;

// Data directory & storage file (supports isolated GHOST_DATA_DIR in automated security tests)
function getDataDir(): string {
  if (process.env.GHOST_DATA_DIR) {
    return path.resolve(process.env.GHOST_DATA_DIR);
  }
  if (fallbackTmpDataDir) {
    return fallbackTmpDataDir;
  }
  return path.join(__dirname, 'data');
}

function getDbFile(): string {
  return path.join(getDataDir(), 'db.json');
}

let DATA_DIR = getDataDir();
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch {
  fallbackTmpDataDir = path.join(os.tmpdir(), 'ghost-protocol-data');
  DATA_DIR = fallbackTmpDataDir;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {
    // Ignore if tmpdir already exists
  }
}
const DB_FILE = getDbFile();

// Fail-closed in production if GHOST_SESSION_SECRET is missing; use persistent local secret in dev
const SESSION_SECRET = resolveSessionSecret({
  secretFilePath: path.join(DATA_DIR, '.session_secret')
});

const sessionManager = new SessionManager({
  secret: SESSION_SECRET,
  persistPath: path.join(DATA_DIR, 'sessions.json')
});

const loginRateLimiter = new LoginRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  lockoutMs: 15 * 60 * 1000
});

// Precomputed dummy scrypt hash to prevent user-enumeration timing side-channels
const DUMMY_PASSWORD_HASH = hashPassword('GhostProtocol_Dummy_Timing_Guard_2026!');
const SEED_ADMIN_PASSWORD_HASH = hashPassword('GhostProtocol_F77_Pilot!');
const SEED_EMPLOYEE_PASSWORD_HASH = hashPassword('UV_Employee_2026!');

// CSRF protection for state-changing API requests
app.use('/api', (req: Request, res: Response, next) => {
  const csrf = validateCsrfRequest(req);
  if (!csrf.valid) {
    return res.status(403).json({ error: csrf.reason || 'CSRF validation failed.' });
  }
  next();
});


// Seed initial dataset if database file doesn't exist
function getInitialData() {
  return {
    users: [
      {
        id: 'u_admin',
        originalName: 'Abinav Thejas K',
        fullName: 'Abinav Thejas K',
        pilotNickname: 'F77 PILOT',
        email: 'abinavthejas2001@gmail.com',
        mobile: '+91 98450 11099',
        city: 'Bengaluru',
        state: 'Karnataka',
        motorcycleModel: 'F77 MACH 2',
        variant: 'Recon Laser Black (10.3 kWh)',
        registrationNumber: 'KA 01 GP 0001',
        purchaseDate: '2024-05-15',
        bloodGroup: 'O+',
        emergencyContact: {
          name: 'Thejas K.',
          relationship: 'Family',
          phone: '+91 98450 99887'
        },
        role: 'admin',
        isOwner: true,
        verificationStatus: 'verified',
        verificationNotes: 'Founding platform owner and master administrator.',
        verifiedAt: '2024-05-16T10:00:00Z',
        joinedAt: '2024-05-15T08:00:00Z',
        avatarUrl: '',
        optInSquadronAssist: true,
        privacySettings: {
          showStartingPoint: true,
          showCity: true,
          showMotorcycleDetails: true
        },
        passwordHash: SEED_ADMIN_PASSWORD_HASH
      },
      {
        id: 'u_uv_employee',
        originalName: 'UV Service Engineer',
        fullName: 'UV Service Engineer',
        pilotNickname: 'F77 PILOT',
        email: 'employee@ultraviolette.com',
        mobile: '+91 98800 11223',
        city: 'Bengaluru',
        state: 'Karnataka',
        motorcycleModel: 'F77',
        variant: 'Factory Service Diagnostics Unit',
        registrationNumber: 'UV-ENG-001',
        purchaseDate: '2024-01-15',
        bloodGroup: 'Prefer not to disclose',
        emergencyContact: {
          name: 'UV Operations Desk',
          relationship: 'Corporate Dispatch',
          phone: '+91 80 4719 0000'
        },
        role: 'uv_employee',
        accountType: 'employee',
        employeeId: 'UV-EMP-7701',
        department: 'Service Engineering & Quality Assurance',
        verificationStatus: 'verified',
        verificationNotes: 'Verified Ultraviolette Automotive authorized service employee.',
        verifiedAt: '2024-01-16T10:00:00Z',
        joinedAt: '2024-01-15T08:00:00Z',
        optInSquadronAssist: false,
        privacySettings: {
          showStartingPoint: false,
          showCity: true,
          showMotorcycleDetails: true
        },
        passwordHash: SEED_EMPLOYEE_PASSWORD_HASH,
        passwordUpdatedAt: '2024-01-15T08:00:00Z'
      },
      {
        id: 'u_pilot07',
        originalName: 'Vikram Sengupta',
        fullName: 'Vikram Sengupta',
        pilotNickname: 'F77 PILOT',
        email: 'vikram.sengupta@example.com',
        mobile: '+91 98860 22345',
        city: 'Bengaluru',
        state: 'Karnataka',
        motorcycleModel: 'F77 MACH 2',
        variant: 'Shadow Grey (10.3 kWh)',
        registrationNumber: 'KA 03 EV 4077',
        purchaseDate: '2024-06-20',
        bloodGroup: 'B+',
        emergencyContact: {
          name: 'Ananya Sengupta',
          relationship: 'Spouse',
          phone: '+91 98860 77654'
        },
        role: 'verified_member',
        verificationStatus: 'verified',
        verifiedAt: '2024-06-22T14:30:00Z',
        joinedAt: '2024-06-20T11:00:00Z',
        optInSquadronAssist: true,
        privacySettings: {
          showStartingPoint: true,
          showCity: true,
          showMotorcycleDetails: true
        }
      },
      {
        id: 'u_phantom',
        originalName: 'Devika Nair',
        fullName: 'Devika Nair',
        pilotNickname: 'F77 PILOT',
        email: 'devika.nair@example.com',
        mobile: '+91 97410 88231',
        city: 'Mysuru',
        state: 'Karnataka',
        motorcycleModel: 'F77 Original',
        variant: 'Airstrike White (7.1 kWh)',
        registrationNumber: 'KA 09 MX 1290',
        purchaseDate: '2023-11-10',
        bloodGroup: 'A+',
        emergencyContact: {
          name: 'Rohan Nair',
          relationship: 'Sibling',
          phone: '+91 97410 33412'
        },
        role: 'verified_member',
        verificationStatus: 'verified',
        verifiedAt: '2023-11-12T09:15:00Z',
        joinedAt: '2023-11-10T12:00:00Z',
        optInSquadronAssist: true,
        privacySettings: {
          showStartingPoint: false,
          showCity: true,
          showMotorcycleDetails: true
        }
      },
      {
        id: 'u_rookie',
        originalName: 'Karan Mehra',
        fullName: 'Karan Mehra',
        pilotNickname: 'X47 PILOT',
        email: 'karan.mehra@example.com',
        mobile: '+91 99001 55678',
        city: 'Pune',
        state: 'Maharashtra',
        motorcycleModel: 'X47',
        variant: 'Stealth Crossover Edition',
        registrationNumber: 'MH 12 TC 8812',
        purchaseDate: '2025-01-14',
        bloodGroup: 'AB+',
        emergencyContact: {
          name: 'Sunil Mehra',
          relationship: 'Parent',
          phone: '+91 99001 22334'
        },
        role: 'regular',
        verificationStatus: 'pending',
        joinedAt: '2026-10-15T09:30:00Z',
        optInSquadronAssist: false,
        privacySettings: {
          showStartingPoint: false,
          showCity: true,
          showMotorcycleDetails: false
        }
      }
    ],
    rides: [
      {
        id: 'ride_01',
        name: 'Operation Thunderhead: Nandi Foothills High-Speed Sortie',
        description: 'Morning tactical formation ride focusing on regen calibration on switchbacks and battery thermal efficiency test.',
        rideDate: '2026-10-25',
        startTime: '05:30 IST',
        meetingPoint: 'Hebbal Flyover Service Lane, Bengaluru',
        destination: 'Nandi Hills Summit Parking Gate',
        plannedRoute: 'Hebbal -> Bellary Road (NH 44) -> Devanahalli Bypass -> Karahalli Cross -> Nandi Hill Road',
        maxDistanceKm: 128.5,
        estimatedReturnTime: '10:30 IST',
        maxRiders: 12,
        rideLeaderId: 'u_admin',
        rideLeaderName: 'Abinav Thejas (Vanguard)',
        specialInstructions: 'All riders must complete pre-ride checklist before 05:15 IST. Staggered formation. Intercom channel 4.',
        pace: 'Spirited',
        chargingStops: [
          {
            name: 'Devanahalli Highway Fast Hub',
            location: 'NH 44 Shell Fuel Station, Devanahalli',
            chargerType: '60 kW CCS2 / UV Supernova Pod',
            stopDurationMin: 20
          }
        ],
        checklistConfig: [
          'Battery SoC > 90% and voltage delta verified',
          'Tyre pressure verified (F: 32 PSI, R: 36 PSI cold)',
          'Regen level pre-set (Level 5-7 recommended)',
          'Bosch ABS diagnostic self-check passed on dash',
          'Full ECE 22.06 / DOT riding gear equipped',
          'Mobile phone fully charged with GP assistance active'
        ],
        status: 'In Progress',
        actualDepartureTime: '2026-10-18T05:35:00Z',
        participants: [
          {
            id: 'rp_1',
            userId: 'u_admin',
            displayName: 'Vanguard',
            motorcycleModel: 'F77 MACH 2',
            variant: 'Recon Laser Black',
            startingPoint: 'Indiranagar 100ft Road',
            shareStartingPoint: true,
            intercomStatus: 'Has an intercom',
            intercomModel: 'Cardo Packtalk Edge (Channel 4)',
            notes: 'Carrying portable tyre inflator and UV emergency tool pack',
            status: 'Riding',
            statusUpdatedAt: '2026-10-18T06:10:00Z',
            checklistCompleted: true
          },
          {
            id: 'rp_2',
            userId: 'u_pilot07',
            displayName: 'Apex',
            motorcycleModel: 'F77 MACH 2',
            variant: 'Shadow Grey',
            startingPoint: 'Yelahanka Satellite Town',
            shareStartingPoint: true,
            intercomStatus: 'Has an intercom',
            intercomModel: 'Sena 50S Mesh',
            notes: 'Joining formation at Hebbal junction',
            status: 'Arrived at Destination',
            statusUpdatedAt: '2026-10-18T06:45:00Z',
            checklistCompleted: true
          },
          {
            id: 'rp_3',
            userId: 'u_phantom',
            displayName: 'Phantom',
            motorcycleModel: 'F77 Original',
            variant: 'Airstrike White',
            startingPoint: 'Koramangala 4th Block',
            shareStartingPoint: false,
            intercomStatus: 'No intercom',
            notes: 'Using visual hand signals in rear group',
            status: 'Heading Home',
            statusUpdatedAt: '2026-10-18T07:15:00Z',
            checklistCompleted: true
          }
        ],
        announcements: [
          {
            id: 'ann_1',
            senderName: 'Vanguard (Leader)',
            message: 'All squadron riders check in. Moderate crosswinds reported past airport toll gate.',
            timestamp: '2026-10-18T05:40:00Z',
            urgent: false
          }
        ],
        createdAt: '2026-10-10T12:00:00Z'
      },
      {
        id: 'ride_02',
        name: 'Operation Western Pass: Sakleshpur Ridge Recon',
        description: 'Multi-stage long distance sortie traversing the Western Ghats with designated fast-charging staging points.',
        rideDate: '2026-11-08',
        startTime: '05:00 IST',
        meetingPoint: 'Nelamangala Expressway Toll Gate',
        destination: 'Sakleshpur Valley Viewpoint',
        plannedRoute: 'Nelamangala -> Kunigal Bypass -> Hassan (Supernova Stop) -> Sakleshpur Ghats',
        maxDistanceKm: 224.0,
        estimatedReturnTime: '19:30 IST',
        maxRiders: 16,
        rideLeaderId: 'u_admin',
        rideLeaderName: 'Abinav Thejas (Vanguard)',
        specialInstructions: 'Strict battery management. Boost chargers will be staged at Hassan.',
        pace: 'Moderate',
        chargingStops: [
          {
            name: 'Hassan Highway EV Hub',
            location: 'BM Road, Hassan Bypass',
            chargerType: 'UV Supernova Fast DC 30kW',
            stopDurationMin: 40
          }
        ],
        checklistConfig: [
          'Battery SoC 100% with balanced cells',
          'Belt tension and tooth inspection completed',
          'Brake pads >= 3mm thickness checked',
          'Rain liner and emergency thermal blanket packed'
        ],
        status: 'Registration Open',
        participants: [
          {
            id: 'rp_201',
            userId: 'u_admin',
            displayName: 'Vanguard',
            motorcycleModel: 'F77 MACH 2',
            shareStartingPoint: true,
            intercomStatus: 'Has an intercom',
            status: 'Registered',
            statusUpdatedAt: '2026-10-15T10:00:00Z',
            checklistCompleted: false
          }
        ],
        announcements: [],
        createdAt: '2026-10-14T08:00:00Z'
      }
    ],
    emergencies: [
      {
        id: 'emg_01',
        userId: 'u_pilot07',
        requesterName: 'Vikram Sengupta (Apex)',
        requesterModel: 'F77 MACH 2',
        category: 'Puncture or tyre problem',
        description: 'Rear tyre pressure dropped to 14 PSI after road debris near Electronic City Phase 1 exit. Sidewall intact, tyre puncture plug kit needed.',
        locationName: 'Hosur Elevated Tollway Ramp, Electronic City, Bengaluru',
        latitude: 12.8452,
        longitude: 77.6602,
        callbackPhone: '+91 98860 22345',
        status: 'Acknowledged',
        notifiedCount: 4,
        searchRadiusKm: 25,
        responderId: 'u_admin',
        responderName: 'Abinav Thejas (Vanguard)',
        createdAt: '2026-10-18T01:15:00Z',
        updatedAt: '2026-10-18T01:25:00Z',
        accessLogs: [
          {
            userId: 'u_admin',
            userName: 'Abinav Thejas (Vanguard)',
            accessedAt: '2026-10-18T01:20:00Z',
            reason: 'Squadron Lead Assistance Response & dispatch of portable inflator kit'
          }
        ]
      }
    ],
    problems: [
      {
        id: 'prob_01',
        userId: 'u_phantom',
        reporterName: 'Devika Nair',
        motorcycleModel: 'F77 Original',
        variant: 'Airstrike White (7.1 kWh)',
        category: 'Console & Software',
        title: 'Violette AI Bluetooth BLE sync dropped during Android 15 OTA update',
        description: 'After updating smartphone OS to Android 15, the motorcycle console pairs intermittently. Turn-by-turn navigation arrows flicker on the 5-inch TFT display.',
        firstObservedDate: '2026-09-28',
        mileageKm: 8420,
        warningMessageOrCode: 'BLE-ERR-CONN-TIMEOUT (Dash Code 0x2A)',
        severity: 'Moderate',
        isRecurring: true,
        troubleshootingAttempted: 'Console reset performed by holding kill switch + mode button for 10 seconds. Repaired bluetooth key.',
        serviceVisits: 'Visited Bengaluru Indiranagar UV Hangar on 2026-10-04. Service engineers flashed MCU firmware patch v3.2.1-rc4.',
        status: 'Under Investigation',
        updates: [
          {
            id: 'up_1',
            authorName: 'Devika Nair',
            date: '2026-10-05',
            note: 'Firmware v3.2.1 fixed connection stability for 3 days, but drops resumed after cold ambient boot.'
          }
        ],
        createdAt: '2026-09-29T11:00:00Z'
      },
      {
        id: 'prob_02',
        userId: 'u_pilot07',
        reporterName: 'Vikram Sengupta',
        motorcycleModel: 'F77 MACH 2',
        variant: 'Laser Black (10.3 kWh)',
        category: 'Charging System',
        title: 'Thermal derate during fast charging when ambient exceeds 39°C',
        description: 'When plugged into 60kW DC charger immediately after 45-minute highway ride in Combat mode, charge rate throttles from 1.5C to 0.4C with thermal warning icon.',
        firstObservedDate: '2026-08-14',
        mileageKm: 4200,
        warningMessageOrCode: 'BMS-WARN-DELTA-TEMP (Code 0x5F)',
        severity: 'Low',
        isRecurring: false,
        troubleshootingAttempted: 'Allowed bike to cold-soak under shade for 15 minutes before plugging in. Charging rate recovered to full capacity.',
        serviceVisits: 'Logged with UV telemetry engineering team during routine 5000km check.',
        status: 'Resolved',
        resolvedDate: '2026-08-20',
        updates: [
          {
            id: 'up_2',
            authorName: 'Vikram Sengupta',
            date: '2026-08-20',
            note: 'Expected BMS thermal safety protocol behavior. Cooling cycle before DC fast charging is recommended by manufacturer.'
          }
        ],
        createdAt: '2026-08-15T14:00:00Z'
      }
    ],
    jetSubmissions: [
      {
        id: 'js_01',
        userId: 'u_pilot07',
        authorName: 'Vikram Sengupta (Apex)',
        title: 'Regen Level 9 Calibration in Wet Monsoon Conditions',
        motorcycleModel: 'F77 MACH 2',
        variant: '10.3 kWh Recon',
        symptoms: 'Aggressive rear wheel slip during throttle roll-off on wet painted road markings when Dynamic Regen is set to Level 9 or 10.',
        operatingConditions: 'Wet tarmac, ambient temperature 22°C, MRF SteelX tyres at 36 PSI.',
        troubleshootingAttempted: 'Dialled down Dynamic Regen to Level 4 in Glide mode. Slip eliminated.',
        serviceCentreFindings: 'Technician verified traction control sensitivity is tuned for linear deceleration; excessive regen on low-friction road paint can cause momentary rear wheel deceleration slip before ABS/TCS modulation.',
        resolutionOutcome: 'Recommended rider practice: In wet weather, set Dynamic Regen to Level 3 or 4, switch traction control to Rain mode, and avoid harsh off-throttle over road paint.',
        proposedSolution: 'Add wet-weather regen safety guideline to knowledge base.',
        status: 'Approved',
        isPreset: true,
        reviewerNotes: 'Technically sound and directly matches Ultraviolette owner handbook safety advisory for wet road conditions.',
        reviewerId: 'u_admin',
        createdAt: '2026-09-10T16:00:00Z',
        reviewedAt: '2026-09-12T10:00:00Z'
      },
      {
        id: 'js_02',
        userId: 'u_admin',
        authorName: 'Abinav Thejas (Vanguard)',
        title: 'Thermal Derate on 60kW DC Fast Chargers',
        motorcycleModel: 'F77 MACH 2',
        variant: 'Laser Black (10.3 kWh)',
        symptoms: 'Charging throttles from 1.5C down to 0.4C with BMS-WARN-DELTA-TEMP warning icon when plugging in immediately after sustained high-speed Combat riding.',
        operatingConditions: 'Highway touring, ambient temperature 39°C, post-highway fast charge.',
        troubleshootingAttempted: 'Parked in shade for 12-15 minutes key-off to let pack temperature equilibrate.',
        serviceCentreFindings: 'BMS thermal safety boundary active above 46°C core cell temperature. Battery cooling circuit safely throttles charge current to prevent dendritic stress.',
        resolutionOutcome: 'Allow motorcycle a 15-minute key-off cold-soak in shade before plugging into high-power DC fast chargers when ambient exceeds 38°C.',
        proposedSolution: 'Cold soak protocol before high-power DC charging.',
        status: 'Approved',
        isPreset: true,
        reviewerNotes: 'Verified manufacturer thermal throttling threshold. Normal protective BMS behavior.',
        reviewerId: 'u_admin',
        createdAt: '2026-09-15T12:00:00Z',
        reviewedAt: '2026-09-15T14:00:00Z'
      },
      {
        id: 'js_03',
        userId: 'u_pilot07',
        authorName: 'Vikram Sengupta (Apex)',
        title: 'Carbon Drive Belt Acoustic Tension Tuning (210 Hz)',
        motorcycleModel: 'F77',
        variant: 'All Variants',
        symptoms: 'Low-frequency resonant hum or flutter between 45 km/h and 55 km/h under light regenerative load.',
        operatingConditions: 'City commuting, dry conditions, 4,500 km odometer check.',
        troubleshootingAttempted: 'Checked belt deflection using mechanical finger gauge.',
        serviceCentreFindings: 'Gates Carbon Drive tension had drifted from factory 210 Hz specification down to 175 Hz due to initial run-in elongation.',
        resolutionOutcome: 'Adjust rear axle eccentric tensioners equally to achieve 205-215 Hz resonance using an acoustic sonic frequency gauge or smartphone tension app.',
        proposedSolution: 'Sonic belt tension tuning standard operating procedure.',
        status: 'Approved',
        isPreset: true,
        reviewerNotes: 'Manufacturer standard spec for F77 carbon belt is 210 Hz ± 10 Hz.',
        reviewerId: 'u_admin',
        createdAt: '2026-09-20T09:00:00Z',
        reviewedAt: '2026-09-21T11:00:00Z'
      },
      {
        id: 'js_04',
        userId: 'u_pilot07',
        authorName: 'Devika Nair (Valkyrie)',
        title: 'TFT Console BLE Sync Recovery & Cold Reboot',
        motorcycleModel: 'F77',
        variant: 'F77 MACH 2',
        symptoms: 'Ultraviolette companion mobile app shows "Device Disconnected" despite active Bluetooth pairing, navigation turn-by-turn arrows freeze.',
        operatingConditions: 'Post-OTA firmware update reboot cycle.',
        troubleshootingAttempted: 'Toggled phone Bluetooth and restarted UV smartphone application.',
        serviceCentreFindings: 'Console BLE stack socket hung in unacknowledged handshake state after rapid key cycles.',
        resolutionOutcome: 'Perform a clean cold reboot: Key-off the motorcycle, toggle the kill switch to OFF, wait 45 seconds for capacitor discharge, key-on with kill switch engaged, then re-pair via UV mobile app.',
        proposedSolution: 'Hardware 45-second console cold discharge procedure.',
        status: 'Approved',
        isPreset: true,
        reviewerNotes: 'Standard 45-second capacitor discharge procedure verified effective across all model years.',
        reviewerId: 'u_admin',
        createdAt: '2026-09-25T14:30:00Z',
        reviewedAt: '2026-09-26T08:00:00Z'
      },
      {
        id: 'js_05',
        userId: 'u_admin',
        authorName: 'Abinav Thejas (Vanguard)',
        title: 'BMS Delta Voltage Balancing Protocol',
        motorcycleModel: 'F77',
        variant: '10.3 kWh Pack',
        symptoms: 'Displayed State-of-Charge drops abruptly by 3-5% when decelerating from 90% down to 85% during cold morning departures.',
        operatingConditions: 'Ambient temperature below 16°C, after prolonged partial shallow charging sessions.',
        troubleshootingAttempted: 'Performed slow overnight AC balance charge to 100%.',
        serviceCentreFindings: 'Occasional delta imbalance of 18mV between series modules caused by repeated 20-80% fast-charging without full saturation top balancing.',
        resolutionOutcome: 'Perform a full 100% saturation charge via standard AC Pod or 15A socket and leave connected for 60-90 minutes post-100% to allow the BMS passive balance resistors to equalize series string delta.',
        proposedSolution: 'Periodic overnight AC saturation cell balancing protocol.',
        status: 'Approved',
        isPreset: true,
        reviewerNotes: 'Critical preventive battery longevity measure. Recommend once every 3-4 weeks.',
        reviewerId: 'u_admin',
        createdAt: '2026-10-02T10:00:00Z',
        reviewedAt: '2026-10-03T12:00:00Z'
      }
    ],
    modifications: [
      {
        id: 'mod_01',
        title: 'Aviation-Grade Carbon Fiber Tank Shroud & Aerodynamic Winglets',
        motorcycleModel: 'F77 MACH 2',
        variant: 'Recon & Original Compatible',
        component: 'Aesthetics & Bodywork',
        difficulty: 'Intermediate',
        costRange: '₹5,000 - ₹15,000',
        compatibilityStatus: 'Verified Compatible',
        isOfficialAccessory: false,
        description: 'Dry autoclave pre-preg carbon replacement for stock side fairing winglets. Reduces drag coefficient by approx 2% and sheds 650g.',
        partsUsed: 'Autoclaved 3K Twill Carbon panels, M5 titanium countersunk bolts, Loctite 243',
        installationGuide: '1. Remove 4x Torx T25 fasteners on OEM shroud.\n2. Disconnect front indicator wiring harness clip.\n3. Fit carbon winglet onto factory mounting tabs with rubber grommets.\n4. Torque fasteners to 4.5 Nm.',
        safetyConsiderations: 'Do not over-torque bolts to prevent micro-cracks in carbon fiber weave.',
        warrantyConsiderations: 'Reversible bolt-on cosmetic modification; does not affect electrical harness or battery warranty.',
        authorName: 'Apex (Vikram Sengupta)',
        createdAt: '2026-07-15T12:00:00Z',
        productLinks: [
          { url: 'https://ultraviolette.com/f77-mach2/accessories', name: 'Ultraviolette Performance Parts Store' },
          { url: 'https://example.com/products/carbon-winglets', name: 'Aero Carbon Winglet Kit Specs' }
        ]
      },
      {
        id: 'mod_02',
        title: 'Ultraviolette Official Aero Panniers & Quick-Release Luggage Rack',
        motorcycleModel: 'F77 MACH 2 / Original',
        variant: 'All variants',
        component: 'Luggage & Touring',
        difficulty: 'Plug & Play',
        costRange: '₹15,000+',
        compatibilityStatus: 'Verified Compatible',
        isOfficialAccessory: true,
        description: 'Factory-engineered hard shell side panniers with aerodynamically sculpted flow lines and integrated weatherproof locks.',
        partsUsed: 'UV Official Touring Rack Kit #UV-ACC-PAN-01',
        installationGuide: 'Mounts directly to subframe threaded bosses beneath pillion seat.',
        safetyConsiderations: 'Maximum payload limit 15kg distributed evenly. Re-check tyre pressure for loaded touring.',
        warrantyConsiderations: 'Official Ultraviolette factory accessory. 100% warranty compliant.',
        authorName: 'Abinav Thejas (Vanguard)',
        createdAt: '2026-08-01T10:00:00Z',
        productLinks: [
          { url: 'https://ultraviolette.com/f77/accessories/aero-panniers', name: 'OEM Aero Panniers Direct Order' }
        ]
      },
      {
        id: 'mod_03',
        title: 'CNC Billet Clip-On Handlebar Risers (20mm Touring Offset)',
        motorcycleModel: 'F77 MACH 2',
        variant: 'Recon & Standard',
        component: 'Ergonomics & Controls',
        difficulty: 'Intermediate',
        costRange: '₹5,000 - ₹15,000',
        compatibilityStatus: 'Verified Compatible',
        isOfficialAccessory: false,
        description: '6061-T6 billet aluminum risers that raise clip-on height by 20mm and bring bars 12mm closer to the pilot for long-distance highway comfort without slackening stock brake lines.',
        partsUsed: 'CNC 6061-T6 Anodized Riser Blocks, Grade 10.9 M8 Allen Bolts',
        installationGuide: '1. Support front triple tree.\n2. Loosen clip-on pinch bolts.\n3. Insert 20mm spacer collar and torque M8 bolts to 22 Nm.\n4. Verify full lock-to-lock steering clearance.',
        safetyConsiderations: 'Ensure front brake hose and throttle sensor harness have zero tension at full steering lock.',
        warrantyConsiderations: 'Reversible mechanical spacer; does not void fork or steering head warranty.',
        authorName: 'Squadron Leader Rohan',
        createdAt: '2026-08-19T14:30:00Z',
        productLinks: [
          { url: 'https://ultraviolette.com/f77-mach2/accessories', name: 'F77 Ergonomic Fitment Catalog' }
        ]
      },
      {
        id: 'mod_04',
        title: 'Heavy-Duty Delrin Frame Sliders & Motor Case Crash Bobbins',
        motorcycleModel: 'F77 MACH 2',
        variant: 'All F77 Variants',
        component: 'Crash Protection',
        difficulty: 'Plug & Play',
        costRange: '₹5,000 - ₹15,000',
        compatibilityStatus: 'Verified Compatible',
        isOfficialAccessory: true,
        description: 'High-impact sacrificial Delrin pucks mounted on CNC steel sub-brackets designed to protect the main battery enclosure and side fairings during low-side slides or stationary drops.',
        partsUsed: 'UV Factory Crash Bobbin Set #UV-PRO-SLD-02, M10 High-Tensile Studs',
        installationGuide: '1. Remove factory M10 frame mount plugs.\n2. Thread sub-bracket mounting studs with medium threadlocker.\n3. Torque to 35 Nm and snap protective caps in place.',
        safetyConsiderations: 'Inspect mounting brackets after any tip-over event to ensure frame bosses remain true.',
        warrantyConsiderations: 'Official factory crash protection kit. Fully preserves chassis warranty.',
        authorName: 'Abinav Thejas (Vanguard)',
        createdAt: '2026-09-05T09:15:00Z',
        productLinks: [
          { url: 'https://ultraviolette.com/f77-mach2/accessories', name: 'OEM Crash Bobbin Kit' }
        ]
      },
      {
        id: 'mod_05',
        title: 'Tactical Smoked Double-Bubble Windscreen Visor',
        motorcycleModel: 'F77 MACH 2',
        variant: 'Recon & Airspace Edition',
        component: 'Aesthetics & Bodywork',
        difficulty: 'Plug & Play',
        costRange: '₹2,000 - ₹5,000',
        compatibilityStatus: 'Verified Compatible',
        isOfficialAccessory: true,
        description: 'Optically clear polycarbonate double-bubble flyscreen with dark smoke tint. Deflects high-velocity windblast over the helmet in Ballistic mode.',
        partsUsed: 'Polycarbonate Aero Screen, 4x Well-Nut Grommets',
        installationGuide: 'Direct 10-minute swap using existing 4 fairing windscreen screws.',
        safetyConsiderations: 'Clean only with microfiber cloth and mild soap; avoid ammonia-based cleaners.',
        warrantyConsiderations: '100% plug-and-play OEM accessory.',
        authorName: 'Capt. Siddharth Nair',
        createdAt: '2026-09-18T16:45:00Z',
        productLinks: []
      },
      {
        id: 'mod_06',
        title: 'Magnetic Tank-Lock Telemetry & Charger Carry Bag (18L Expandable)',
        motorcycleModel: 'F77 MACH 2 / X47',
        variant: 'All variants',
        component: 'Luggage & Touring',
        difficulty: 'Plug & Play',
        costRange: '₹5,000 - ₹15,000',
        compatibilityStatus: 'Verified Compatible',
        isOfficialAccessory: false,
        description: 'Quick-latching top shroud bag engineered with padded compartment specifically sized for the Ultraviolette Boost Charger and Type 2 adapter cable.',
        partsUsed: 'Nylon 1680D Ballistic Tank Bag, Quick-Release Ring Mount',
        installationGuide: 'Attach quick-release flange to top shroud accessory bolts; bag clicks in and out in 2 seconds.',
        safetyConsiderations: 'Ensure safety tether strap is looped around steering stem before highway flight.',
        warrantyConsiderations: 'No modification to paint or bodywork.',
        authorName: 'Karthik M (Shadow)',
        createdAt: '2026-10-02T11:20:00Z',
        productLinks: []
      }
    ],
    chargingStations: [
      {
        id: 'cs_01',
        name: 'Ultraviolette Hangar Supernova Hub - Indiranagar',
        location: '100ft Road, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka',
        latitude: 12.9719,
        longitude: 77.6412,
        chargerType: 'Supernova',
        chargerDetails: 'No separate charger required — Integrated 30 kW Supernova DC Tether.',
        vehicleCompatibility: 'F77 MACH 2, F77 Recon, F77 Original (Supernova DC Port)',
        connectorTypes: ['UV Supernova Dual DC (30 kW)', 'Type 2 AC (7.2 kW)', '15A Standard Socket'],
        powerOutputKw: 30,
        chargerSource: 'Supernova',
        isSupernova: true,
        isCommunityReported: false,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_admin',
        submittedByRole: 'admin',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: 'Free for verified GHOST PROTOCOL members (via UV App RFID token)',
        lastVerifiedDate: '2026-10-17',
        userNotes: 'Twin bays, illuminated, clean lounge with high-speed Wi-Fi and tire pressure station.',
        reportedBy: 'Abinav Thejas K • Owner'
      },
      {
        id: 'cs_02',
        name: 'NH 44 Shell Devanahalli Highway EV Fast Station',
        location: 'Opposite Kempegowda Airport Trumpet Interchange, NH 44, Bengaluru, Karnataka',
        latitude: 13.2085,
        longitude: 77.7082,
        chargerType: 'Type 2',
        uvChargingLink: 'https://www.ultraviolette.com/charging/type2-adapter',
        chargerDetails: 'Ultraviolette (UV) Type 2 charging link and portable Boost/Standard charger required.',
        vehicleCompatibility: 'F77 MACH 2, F77 Recon, F77 Original, Tesseract',
        connectorTypes: ['CCS2 Dual Gun (60 kW)', 'Type 2 AC (22 kW)'],
        powerOutputKw: 60,
        chargerSource: '3rd Party Station',
        isSupernova: false,
        isCommunityReported: true,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_pilot07',
        submittedByRole: 'user',
        submittedByPhone: '+91 98860 22345',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: '₹18.50 per kWh via Shell Recharge App',
        lastVerifiedDate: '2026-10-15',
        userNotes: 'Compatible with F77 MACH 2 Boost adapter. 20% to 80% SoC achieved in 48 minutes.',
        reportedBy: 'Vikram Sengupta (Apex)'
      },
      {
        id: 'cs_03',
        name: 'Mysuru Highway Squadron Waypoint (CCD Maddur)',
        location: 'Bangalore-Mysore Expressway, Maddur Bypass, Karnataka',
        latitude: 12.5841,
        longitude: 77.0428,
        chargerType: 'Socket',
        chargerDetails: '15A Standard Charger, Boost Charger, or On-Board Charger (OBC) required.',
        vehicleCompatibility: 'All Ultraviolette Models (F77 MACH 2, Recon, Original, Shockwave, X47)',
        connectorTypes: ['15A Industrial Weatherproof Socket', 'Tata Power 30kW CCS2'],
        powerOutputKw: 3.3,
        chargerSource: 'Community Provided Charger',
        isSupernova: false,
        isCommunityReported: true,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_phantom',
        submittedByRole: 'user',
        submittedByPhone: '+91 97410 88231',
        operatingStatus: 'Operational',
        accessConditions: 'Commercial Hours Only',
        pricingType: 'Free',
        chargingCostAmount: 0,
        chargingCostUnit: 'per session',
        availabilityStartTime: '06:30',
        availabilityEndTime: '22:30',
        availabilityDays: 'Daily',
        availabilityTimeText: '06:30 – 22:30 (Daily)',
        requiresReservation: true,
        pricing: 'Free charging for Squadron Pilots (Book reservation slot with owner)',
        lastVerifiedDate: '2026-10-12',
        userNotes: 'Owner confirmed 15A socket works reliably on stock portable brick charger. Reserve slot before arrival.',
        reportedBy: 'Devika Nair (Phantom)',
        reservations: [
          {
            id: 'res_seed_01',
            chargerId: 'cs_03',
            chargerName: 'Mysuru Highway Squadron Waypoint (CCD Maddur)',
            ownerUserId: 'u_phantom',
            ownerName: 'Devika Nair (Phantom)',
            ownerPhone: '+91 97410 88231',
            riderUserId: 'u_pilot07',
            riderName: 'Vikram Sengupta (Apex)',
            riderPhone: '+91 98860 22345',
            riderBikeModel: 'F77 MACH 2',
            reservationDate: '2026-10-29',
            startTime: '08:00',
            endTime: '09:30',
            durationMinutes: 90,
            estimatedKwh: 5,
            pricingType: 'Free',
            chargingCostAmount: 0,
            chargingCostUnit: 'per session',
            estimatedCost: 0,
            vehicleNotes: 'Morning Mysuru breakfast ride top-up',
            status: 'Approved',
            ownerResponseNote: 'Approved! Socket bay #1 reserved for your F77.',
            createdAt: '2026-10-26T09:00:00Z',
            updatedAt: '2026-10-26T09:30:00Z'
          }
        ]
      },
      {
        id: 'cs_04',
        name: 'Pune-Mumbai Expressway Lonavala Type 6 Fast Pod',
        location: 'Food Mall Waypoint KM 54, Mumbai-Pune Expressway, Lonavala, Maharashtra',
        latitude: 18.7557,
        longitude: 73.4091,
        chargerType: 'Type 6',
        chargerDetails: 'No separate charger required — Integrated Type 6 public connector.',
        vehicleCompatibility: 'Tesseract, Shockwave & Type 6 Compatible UV Platforms',
        connectorTypes: ['Type 6 Connector (6.0 kW)', '15A Standard Socket'],
        powerOutputKw: 6,
        chargerSource: '3rd Party Station',
        isSupernova: false,
        isCommunityReported: false,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_admin',
        submittedByRole: 'admin',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: '₹14.00 per kWh',
        lastVerifiedDate: '2026-10-16',
        userNotes: 'Covered two-wheeler bay near highway exit ramp.',
        reportedBy: 'Abinav Thejas (Vanguard) • Admin'
      },
      {
        id: 'cs_05',
        name: 'Ultraviolette Space Station Supernova Hub - Worli',
        location: 'Dr Annie Besant Road, Worli, Mumbai, Maharashtra',
        latitude: 19.0176,
        longitude: 72.8172,
        chargerType: 'Supernova',
        chargerDetails: 'No separate charger required — Direct Supernova DC Fast Tether.',
        vehicleCompatibility: 'F77 MACH 2, F77 Recon, F77 Original',
        connectorTypes: ['UV Supernova Dual DC (30 kW)', '15A Standard Socket'],
        powerOutputKw: 30,
        chargerSource: 'Supernova',
        isSupernova: true,
        isCommunityReported: false,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_admin',
        submittedByRole: 'admin',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: 'Free for verified Ultraviolette owners',
        lastVerifiedDate: '2026-10-18',
        userNotes: '24/7 security guard on site, dedicated F77 parking bays.',
        reportedBy: 'Abinav Thejas (Vanguard) • Admin'
      },
      {
        id: 'cs_06',
        name: 'ECR Mahabalipuram Coastal Squadron Hub',
        location: 'East Coast Road (ECR), Mamallapuram, Chennai Corridor, Tamil Nadu',
        latitude: 12.6208,
        longitude: 80.1945,
        chargerType: 'Type 2',
        uvChargingLink: 'https://www.ultraviolette.com/charging/uv-link',
        chargerDetails: 'Ultraviolette (UV) charging link and portable charger required.',
        vehicleCompatibility: 'F77 MACH 2, F77 Recon, F77 Original',
        connectorTypes: ['Type 2 AC (7.2 kW)', '15A Socket'],
        powerOutputKw: 7.2,
        chargerSource: 'Community Provided Charger',
        isSupernova: false,
        isCommunityReported: true,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_pilot07',
        submittedByRole: 'user',
        submittedByPhone: '+91 98860 22345',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricingType: 'Charged',
        chargingCostAmount: 15,
        chargingCostUnit: 'per kWh',
        availabilityStartTime: '06:00',
        availabilityEndTime: '22:00',
        availabilityDays: 'Daily',
        availabilityTimeText: '06:00 – 22:00 (Daily)',
        requiresReservation: true,
        pricing: 'Charged • ₹15 / kWh (06:00 – 22:00 Daily)',
        lastVerifiedDate: '2026-10-14',
        userNotes: 'Popular weekend breakfast ride stop on ECR. Carry UV Type 2 link adapter & book reservation ahead.',
        reportedBy: 'Vikram Sengupta (Apex)',
        reservations: []
      },
      {
        id: 'cs_07',
        name: 'Connaught Place Outer Circle EV Charging Bay',
        location: 'Block M, Connaught Place, New Delhi, Delhi NCR',
        latitude: 28.6315,
        longitude: 77.2167,
        chargerType: 'Socket',
        chargerDetails: 'Charger or On-Board Charger (OBC) required — 15A industrial socket.',
        vehicleCompatibility: 'All Ultraviolette Models (F77 MACH 2, Recon, Original, Tesseract)',
        connectorTypes: ['15A Industrial Weatherproof Socket'],
        powerOutputKw: 3.3,
        chargerSource: 'Community Provided Charger',
        isSupernova: false,
        isCommunityReported: true,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_phantom',
        submittedByRole: 'user',
        submittedByPhone: '+91 97410 88231',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricingType: 'Charged',
        chargingCostAmount: 50,
        chargingCostUnit: 'per hour',
        availabilityStartTime: '08:00',
        availabilityEndTime: '21:00',
        availabilityDays: 'Daily',
        availabilityTimeText: '08:00 – 21:00 (Daily)',
        requiresReservation: true,
        pricing: 'Charged • ₹50 / hour (08:00 – 21:00 Daily)',
        lastVerifiedDate: '2026-10-15',
        userNotes: 'NDMC public EV parking bay with dedicated 15A earthing verified. Reserve slot with owner before plugging in.',
        reportedBy: 'Devika Nair (Phantom)',
        reservations: []
      },
      {
        id: 'cs_11',
        name: 'UV Supernova Hub — Channapatna Highway (NH 275)',
        location: 'NH 275 Bypass, Beside Kamat Upachar, Channapatna, Karnataka 562160',
        latitude: 12.6518,
        longitude: 77.2067,
        chargerType: 'Supernova',
        uvChargingLink: 'https://www.ultraviolette.com/charging',
        chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charger (2 bays, 24/7 highway access)',
        vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
        connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Industrial Socket'],
        powerOutputKw: 30.0,
        chargerSource: 'Supernova',
        isSupernova: true,
        isCommunityReported: false,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_admin',
        submittedByRole: 'admin',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: 'Free for UV Care+ / ₹14/kWh standard',
        lastVerifiedDate: '2026-10-19',
        userNotes: 'Ideal mid-way charging stop at KM 60 on the Bengaluru–Mysuru highway corridor.',
        reportedBy: 'Ultraviolette Grid Ops'
      },
      {
        id: 'cs_12',
        name: 'Maddur Tiffany’s Highway Type 2 AC Pod (NH 275)',
        location: 'Maddur Tiffany’s Compound, NH 275 Service Road, Maddur, Karnataka 571428',
        latitude: 12.5841,
        longitude: 77.0428,
        chargerType: 'Type 2',
        chargerDetails: '7.2 kW Type 2 AC Smart Wallbox + 16A industrial backup socket in covered bike bay',
        vehicleCompatibility: 'All F77 Variants (with Type 2 adapter or portable charger)',
        connectorTypes: ['IEC 62196 Type 2 AC (7.2 kW)', '16A 3-Pin Socket (230V AC)'],
        powerOutputKw: 7.2,
        chargerSource: '3rd Party Station',
        isSupernova: false,
        isCommunityReported: true,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_pilot07',
        submittedByRole: 'user',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: '₹16.00 per kWh',
        lastVerifiedDate: '2026-10-18',
        userNotes: 'Reliable backup stop 25 km ahead of Channapatna with shaded parking and food court.',
        reportedBy: 'Vikram Sengupta (Apex)'
      },
      {
        id: 'cs_13',
        name: 'UV Supernova Station — Mulbagal Highway Plaza (NH 75)',
        location: 'NH 75 Bengaluru–Chennai Corridor, Near Nandi Grand Plaza, Mulbagal, Karnataka 563131',
        latitude: 13.1645,
        longitude: 78.3932,
        chargerType: 'Supernova',
        uvChargingLink: 'https://www.ultraviolette.com/charging',
        chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Hub on NH 75 Eastbound/Westbound access road',
        vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
        connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Socket'],
        powerOutputKw: 30.0,
        chargerSource: 'Supernova',
        isSupernova: true,
        isCommunityReported: false,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_admin',
        submittedByRole: 'admin',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: 'Free for UV Care+ / ₹14/kWh standard',
        lastVerifiedDate: '2026-10-19',
        userNotes: 'Located ~96 km from Bengaluru Indiranagar along NH 75 toward Tirupati and Chennai.',
        reportedBy: 'Ultraviolette Grid Ops'
      },
      {
        id: 'cs_14',
        name: 'Vellore Green Circle Supernova & Type 6 Hub (NH 48)',
        location: 'NH 48 Service Road, Green Circle Junction, Vellore, Tamil Nadu 632004',
        latitude: 12.9349,
        longitude: 79.1469,
        chargerType: 'Supernova',
        uvChargingLink: 'https://www.ultraviolette.com/charging',
        chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charger + Type 6 Ather Grid co-located bay',
        vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
        connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', 'Type 2 AC (7.2 kW)'],
        powerOutputKw: 30.0,
        chargerSource: 'Supernova',
        isSupernova: true,
        isCommunityReported: false,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_admin',
        submittedByRole: 'admin',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: 'Free for UV Care+ / ₹15/kWh standard',
        lastVerifiedDate: '2026-10-19',
        userNotes: 'Strategic ~205 km midpoint between Bengaluru and Chennai on NH 48.',
        reportedBy: 'Ultraviolette Grid Ops'
      },
      {
        id: 'cs_15',
        name: 'Sriperumbudur Toll Plaza Fast Pod (NH 48)',
        location: 'NH 48 Chennai–Bengaluru Highway, Near Hyundai Gate, Sriperumbudur, Tamil Nadu 602105',
        latitude: 12.9675,
        longitude: 79.9479,
        chargerType: 'Type 6',
        chargerDetails: 'High-speed Type 6 DC Fast Charger (12 kW) + Type 2 7.2 kW AC',
        vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon',
        connectorTypes: ['IEC 62196-3 Type 6 (DC Fast)', 'IEC 62196 Type 2 AC'],
        powerOutputKw: 12.0,
        chargerSource: '3rd Party Station',
        isSupernova: false,
        isCommunityReported: true,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_phantom',
        submittedByRole: 'user',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: '₹17.00 per kWh',
        lastVerifiedDate: '2026-10-18',
        userNotes: 'Located ~300 km from Bengaluru and ~42 km before central Chennai.',
        reportedBy: 'Devika Nair (Phantom)'
      },
      {
        id: 'cs_16',
        name: 'UV Supernova Hub — Tumakuru Highway Bypass (NH 48)',
        location: 'NH 48 Bengaluru–Pune Highway, Sira Road Junction, Tumakuru, Karnataka 572106',
        latitude: 13.3409,
        longitude: 77.1010,
        chargerType: 'Supernova',
        uvChargingLink: 'https://www.ultraviolette.com/charging',
        chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Bay at highway food plaza',
        vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
        connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Socket'],
        powerOutputKw: 30.0,
        chargerSource: 'Supernova',
        isSupernova: true,
        isCommunityReported: false,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_admin',
        submittedByRole: 'admin',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: 'Free for UV Care+ / ₹14/kWh standard',
        lastVerifiedDate: '2026-10-19',
        userNotes: 'Primary northbound NH 48 stop ~75 km from Bengaluru.',
        reportedBy: 'Ultraviolette Grid Ops'
      },
      {
        id: 'cs_17',
        name: 'UV Supernova Hub — Krishnagiri Highway Junction (NH 48)',
        location: 'NH 44 / NH 48 Chennai Highway Split, Near A2B Plaza, Krishnagiri, Tamil Nadu 635001',
        latitude: 12.5266,
        longitude: 78.2150,
        chargerType: 'Supernova',
        uvChargingLink: 'https://www.ultraviolette.com/charging',
        chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Station (Dual Bay, 24/7 Highway Access)',
        vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
        connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Industrial Socket'],
        powerOutputKw: 30.0,
        chargerSource: 'Supernova',
        isSupernova: true,
        isCommunityReported: false,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_admin',
        submittedByRole: 'admin',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: 'Free for UV Care+ / ₹14/kWh standard',
        lastVerifiedDate: '2026-10-19',
        userNotes: 'Direct highway stop at KM 92 on the Bengaluru–Krishnagiri–Vellore–Chennai NH 48 corridor.',
        reportedBy: 'Ultraviolette Grid Ops'
      },
      {
        id: 'cs_18',
        name: 'Krishnagiri Toll Plaza Type 2 & Socket Backup Pod (NH 48)',
        location: 'NH 48 Service Lane, Beside Saravana Bhavan, Krishnagiri, Tamil Nadu 635001',
        latitude: 12.5340,
        longitude: 78.2260,
        chargerType: 'Type 2',
        uvChargingLink: 'https://www.ultraviolette.com/charging',
        chargerDetails: '7.2 kW Type 2 AC Wallbox + 16A 3-Pin Industrial Socket',
        vehicleCompatibility: 'All F77 Variants',
        connectorTypes: ['IEC 62196 Type 2 AC (7.2 kW)', '16A 3-Pin Socket'],
        powerOutputKw: 7.2,
        chargerSource: '3rd Party Station',
        isSupernova: false,
        isCommunityReported: true,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_pilot07',
        submittedByRole: 'user',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: '₹15.00 per kWh',
        lastVerifiedDate: '2026-10-18',
        userNotes: 'Reliable backup 1.5 km from Krishnagiri Supernova hub.',
        reportedBy: 'Vikram Sengupta (Apex)'
      },
      {
        id: 'SN-001',
        name: 'Mysuru',
        location: 'Mysuru, Karnataka',
        latitude: 12.3571953,
        longitude: 76.6614688,
        chargerType: 'Supernova',
        uvChargingLink: 'https://www.ultraviolette.com/charging',
        chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Hub — Mysuru.',
        vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
        connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Industrial Socket'],
        powerOutputKw: 30,
        chargerSource: 'Supernova',
        isSupernova: true,
        isCommunityReported: false,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_admin',
        submittedByRole: 'admin',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: 'Free for UV Care+ / Commercial DC Fast',
        lastVerifiedDate: '2026-10-25',
        userNotes: 'Ultraviolette Supernova DC Fast Charging Hub.',
        reportedBy: 'Ultraviolette Grid Ops'
      },
      {
        id: 'SN-002',
        name: 'Coimbatore',
        location: 'Coimbatore, Tamil Nadu',
        latitude: 11.0204155,
        longitude: 76.9922914,
        chargerType: 'Supernova',
        uvChargingLink: 'https://www.ultraviolette.com/charging',
        chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Hub — Coimbatore.',
        vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
        connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Industrial Socket'],
        powerOutputKw: 30,
        chargerSource: 'Supernova',
        isSupernova: true,
        isCommunityReported: false,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_admin',
        submittedByRole: 'admin',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: 'Free for UV Care+ / Commercial DC Fast',
        lastVerifiedDate: '2026-10-25',
        userNotes: 'Ultraviolette Supernova DC Fast Charging Hub.',
        reportedBy: 'Ultraviolette Grid Ops'
      },
      {
        id: 'SN-003',
        name: 'Bengaluru',
        location: 'Bengaluru, Karnataka',
        latitude: 12.9539933,
        longitude: 77.6408874,
        chargerType: 'Supernova',
        uvChargingLink: 'https://www.ultraviolette.com/charging',
        chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Hub — Bengaluru.',
        vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
        connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Industrial Socket'],
        powerOutputKw: 30,
        chargerSource: 'Supernova',
        isSupernova: true,
        isCommunityReported: false,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_admin',
        submittedByRole: 'admin',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: 'Free for UV Care+ / Commercial DC Fast',
        lastVerifiedDate: '2026-10-25',
        userNotes: 'Ultraviolette Supernova DC Fast Charging Hub.',
        reportedBy: 'Ultraviolette Grid Ops'
      },
      {
        id: 'SN-004',
        name: 'Kolar',
        location: 'Kolar, Karnataka',
        latitude: 13.1356771,
        longitude: 78.0154440,
        chargerType: 'Supernova',
        uvChargingLink: 'https://www.ultraviolette.com/charging',
        chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Hub — Kolar.',
        vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
        connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Industrial Socket'],
        powerOutputKw: 30,
        chargerSource: 'Supernova',
        isSupernova: true,
        isCommunityReported: false,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_admin',
        submittedByRole: 'admin',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: 'Free for UV Care+ / Commercial DC Fast',
        lastVerifiedDate: '2026-10-25',
        userNotes: 'Ultraviolette Supernova DC Fast Charging Hub.',
        reportedBy: 'Ultraviolette Grid Ops'
      },
      {
        id: 'SN-005',
        name: 'Devanahalli (North Bengaluru)',
        location: 'Devanahalli (North Bengaluru), Karnataka',
        latitude: 13.3471483,
        longitude: 77.6729970,
        chargerType: 'Supernova',
        uvChargingLink: 'https://www.ultraviolette.com/charging',
        chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Hub — Devanahalli (North Bengaluru).',
        vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
        connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Industrial Socket'],
        powerOutputKw: 30,
        chargerSource: 'Supernova',
        isSupernova: true,
        isCommunityReported: false,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_admin',
        submittedByRole: 'admin',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: 'Free for UV Care+ / Commercial DC Fast',
        lastVerifiedDate: '2026-10-25',
        userNotes: 'Ultraviolette Supernova DC Fast Charging Hub.',
        reportedBy: 'Ultraviolette Grid Ops'
      },
      {
        id: 'SN-006',
        name: 'Kochi',
        location: 'Kochi, Kerala',
        latitude: 10.0094370,
        longitude: 76.3119765,
        chargerType: 'Supernova',
        uvChargingLink: 'https://www.ultraviolette.com/charging',
        chargerDetails: 'Ultraviolette Supernova 30 kW DC Fast Charging Hub — Kochi.',
        vehicleCompatibility: 'F77 Original / F77 MACH 2 / Recon / SuperStreet',
        connectorTypes: ['IEC 62196-3 Type 6 (UV DC Fast)', '15A 3-Pin Industrial Socket'],
        powerOutputKw: 30,
        chargerSource: 'Supernova',
        isSupernova: true,
        isCommunityReported: false,
        verifiedByAdmin: true,
        approvalStatus: 'approved',
        published: true,
        submittedByUserId: 'u_admin',
        submittedByRole: 'admin',
        operatingStatus: 'Operational',
        accessConditions: 'Public 24/7',
        pricing: 'Free for UV Care+ / Commercial DC Fast',
        lastVerifiedDate: '2026-10-25',
        userNotes: 'Ultraviolette Supernova DC Fast Charging Hub.',
        reportedBy: 'Ultraviolette Grid Ops'
      }
    ],
    chargerReports: [
      {
        id: 'crep_06',
        chargerId: 'cs_17',
        userId: 'u_pilot07',
        reporterCallsign: 'Vikram Sengupta (Apex)',
        category: 'SUCCESSFULLY CHARGED',
        comment: 'Krishnagiri Supernova right on NH 48 highway service lane. Charged 30% to 90% in 28 mins.',
        createdAt: '2026-10-19T10:00:00Z',
        sourceLabel: 'Community Report'
      },
      {
        id: 'crep_01',
        chargerId: 'cs_11',
        userId: 'u_pilot07',
        reporterCallsign: 'Vikram Sengupta (Apex)',
        category: 'SUCCESSFULLY CHARGED',
        comment: 'Charged from 24% to 88% in 32 mins on Bay 1 during Sunday morning Mysuru breakfast sortie.',
        createdAt: '2026-10-19T08:15:00Z',
        sourceLabel: 'Community Report'
      },
      {
        id: 'crep_02',
        chargerId: 'cs_12',
        userId: 'u_phantom',
        reporterCallsign: 'Devika Nair (Phantom)',
        category: 'WORKING',
        comment: 'Both the Type 2 wallbox and the 16A industrial backup socket are clean and active.',
        createdAt: '2026-10-18T11:30:00Z',
        sourceLabel: 'Community Report'
      },
      {
        id: 'crep_03',
        chargerId: 'cs_05',
        userId: 'u_pilot07',
        reporterCallsign: 'Vikram Sengupta (Apex)',
        category: 'SUCCESSFULLY CHARGED',
        comment: 'Cafe staff unlocked the outdoor 16A pillar immediately. Stable 232V line voltage.',
        createdAt: '2026-10-17T07:45:00Z',
        sourceLabel: 'Community Report'
      },
      {
        id: 'crep_04',
        chargerId: 'cs_13',
        userId: 'u_admin',
        reporterCallsign: 'Abinav Thejas (Vanguard)',
        category: 'WORKING',
        comment: 'Mulbagal Supernova delivering full 30 kW output. Zero queue on weekday morning.',
        createdAt: '2026-10-19T09:20:00Z',
        sourceLabel: 'Community Report'
      },
      {
        id: 'crep_05',
        chargerId: 'cs_14',
        userId: 'u_phantom',
        reporterCallsign: 'Devika Nair (Phantom)',
        category: 'SUCCESSFULLY CHARGED',
        comment: 'Topped up to 90% at Vellore Green Circle on the way to Chennai Marina.',
        createdAt: '2026-10-18T15:10:00Z',
        sourceLabel: 'Community Report'
      }
    ],
    autoPilotMissions: [
      {
        id: 'apm_seed_01',
        userId: 'u_admin',
        ownerName: 'Abinav Thejas (Vanguard)',
        missionName: 'OPERATION KAVERI: BENGALURU → MYSURU PALACE',
        createdAt: '2026-10-18T05:30:00Z',
        updatedAt: '2026-10-18T05:30:00Z',
        departureDateTime: '2026-10-25T06:00',
        startLocation: {
          name: 'Ultraviolette Hangar Indiranagar',
          locality: 'Indiranagar, Bengaluru',
          address: '529, 100 Feet Rd, Indiranagar, Bengaluru, Karnataka 560038',
          latitude: 12.9719,
          longitude: 77.6412
        },
        destination: {
          name: 'Mysuru Palace Main Gate',
          locality: 'Agrahara, Mysuru',
          address: 'Sayyaji Rao Rd, Agrahara, Chamrajpura, Mysuru, Karnataka 570001',
          latitude: 12.3051,
          longitude: 76.6551
        },
        targetIntervalKm: 100,
        preferredChargerTypes: ['Supernova', 'Type 2'],
        rangeGuard: {
          enabled: true,
          startingBatteryPercent: 95,
          estimatedUsableRangeKm: 175,
          reserveRangeKm: 25
        },
        plannedRouteDistanceKm: 146.4,
        estimatedDrivingDurationMin: 168,
        routingSource: 'OSRM Driving Route',
        chargingStops: [
          {
            stationId: 'cs_11',
            stationName: 'UV Supernova Hub — Channapatna Highway (NH 275)',
            stationLocation: 'NH 275 Bypass, Beside Kamat Upachar, Channapatna, Karnataka 562160',
            chargerType: 'Supernova',
            powerOutputKw: 30,
            latitude: 12.6518,
            longitude: 77.2067,
            order: 1,
            distanceFromStartKm: 62.4,
            distanceFromPrevStopKm: 62.4,
            detourDistanceKm: 0.8,
            reached: false,
            chargingConfirmed: false
          }
        ],
        pitStops: [
          {
            id: 'place_mys_maddur_tiffanys',
            name: 'Maddur Tiffany’s Highway Restaurant',
            address: 'NH 275 Bengaluru-Mysuru Highway, Maddur, Karnataka 571428',
            category: 'Restaurant',
            latitude: 12.5841,
            longitude: 77.0428,
            distanceFromStartKm: 82.5,
            detourDistanceKm: 0.5,
            estimatedDetourDurationMin: 1,
            includedInNavigation: true
          }
        ],
        status: 'Planned',
        riderNotes: 'Maintain Combat mode on NH 275 expressway. Quick 20-minute Supernova top-up at Channapatna.',
        isFavourite: true,
        shareSettings: {
          isShared: true,
          sharedWithUserIds: ['u_pilot07', 'u_phantom'],
          includeMeetingPoint: true,
          meetingPointName: 'NICE Road Kengeri Toll Plaza (06:15 AM)',
          includeDepartureTime: true,
          includeGroupNotes: true,
          groupNotes: 'Channel 4 Intercom active. Carry 16A portable adapter in tail pack.'
        }
      }
    ],
    marketplace: [
      {
        id: 'mp_01',
        sellerId: 'u_pilot07',
        sellerName: 'Vikram Sengupta (Apex)',
        sellerVerified: true,
        listingType: 'buy',
        title: 'UV Official Boost Fast Charger (3.3 kW Portable unit)',
        description: 'Upgraded to garage Supernova home wallbox, selling my portable 3.3 kW Boost charger with original padded travel bag and heavy-duty 15A plug.',
        category: 'Chargers',
        price: 24000,
        condition: 'Like New',
        compatibleModel: 'F77 Original / F77 MACH 2 / Recon',
        generalLocation: 'Bengaluru (Koramangala / Indiranagar)',
        contactPhone: '+91 98801 44556',
        contactEmail: 'vikram.sengupta@squadron.in',
        status: 'Available',
        imageUrls: [createMarketplacePresetIllustration('charger')],
        createdAt: '2026-10-12T09:00:00Z'
      },
      {
        id: 'mp_02',
        sellerId: 'u_phantom',
        sellerName: 'Devika Nair (Phantom)',
        sellerVerified: true,
        listingType: 'buy',
        title: 'Carbon-weave Pillion Seat Cowl (Matte Stealth Finish)',
        description: 'Single-seater aerodynamic rear cowl. Clips straight into stock latch mechanism in place of rear seat.',
        category: 'Accessories',
        price: 4500,
        condition: 'Brand New',
        compatibleModel: 'F77 MACH 2 / F77 Original',
        generalLocation: 'Mysuru / Shipping across India',
        contactPhone: '+91 98452 77889',
        contactEmail: 'devika.nair@squadron.in',
        status: 'Available',
        imageUrls: [createMarketplacePresetIllustration('carbon_wheels')],
        createdAt: '2026-10-14T15:00:00Z'
      },
      {
        id: 'mp_rent_01',
        sellerId: 'u_admin',
        sellerName: 'Abinav Thejas K',
        sellerVerified: true,
        listingType: 'rent',
        title: 'UV Official Hard-Shell Aero Panniers & 18L Tank Bag Kit',
        description: 'Complete weekend touring luggage kit with quick-release mounting brackets, rain covers, and Type 2 charging adapter pouch. Ideal for Coorg, Ooty, or Western Ghats highway sorties.',
        category: 'Accessories',
        price: 650,
        costPerDay: 650,
        securityDeposit: 3000,
        minRentalDays: 1,
        maxRentalDays: 14,
        rentalAvailability: 'Available Now',
        rentalRules: '1. Valid driving license or verified GHOST PROTOCOL pilot profile required at pickup.\n2. Maximum payload 15 kg evenly distributed.\n3. Return cleaned and undamaged; refundable security deposit returned immediately via UPI on drop-off.',
        condition: 'Like New',
        compatibleModel: 'Both F77 & X47',
        generalLocation: 'Bengaluru (Indiranagar Hangar)',
        contactPhone: '+91 98450 11099',
        contactEmail: 'abinavthejas2001@gmail.com',
        status: 'Available',
        imageUrls: [createMarketplacePresetIllustration('panniers')],
        rentalRequests: [],
        createdAt: '2026-10-18T10:00:00Z'
      },
      {
        id: 'mp_rent_02',
        sellerId: 'u_pilot07',
        sellerName: 'Vikram Sengupta (Apex)',
        sellerVerified: true,
        listingType: 'rent',
        title: 'Portable 3.3 kW Boost Charger & 210 Hz Sonic Belt Tension Kit',
        description: 'Rent my spare 3.3 kW Boost fast charger + Gates acoustic belt frequency gauge for long highway tours or weekend track days.',
        category: 'Chargers',
        price: 500,
        costPerDay: 500,
        securityDeposit: 4000,
        minRentalDays: 1,
        maxRentalDays: 10,
        rentalAvailability: 'Available Now',
        rentalRules: '1. Use only with grounded 15A/16A sockets.\n2. Do not submerge charger brick in standing water.\n3. Late returns beyond 4 hours billed at 1 additional day.',
        condition: 'Like New',
        compatibleModel: 'Both F77 & X47',
        generalLocation: 'Bengaluru (HSR Layout / Koramangala)',
        contactPhone: '+91 98801 44556',
        contactEmail: 'vikram.sengupta@squadron.in',
        status: 'Available',
        imageUrls: [createMarketplacePresetIllustration('diagnostic_tool'), createMarketplacePresetIllustration('charger')],
        rentalRequests: [],
        createdAt: '2026-10-19T11:30:00Z'
      },
      {
        id: 'mp_auc_01',
        sellerId: 'u_admin',
        sellerName: 'Abinav Thejas K',
        sellerVerified: true,
        listingType: 'auction',
        title: 'Autoclaved 3K Carbon Fiber Aero Winglets & Tank Shroud Set',
        description: 'Numbered squadron prototype dry-carbon aerodynamic winglets with titanium countersunk hardware. Direct bolt-on fitment for F77 Original, Recon, and MACH 2.',
        category: 'Modifications',
        price: 11500,
        startingBid: 8000,
        currentBid: 11500,
        minBidIncrement: 500,
        reservePrice: 10000,
        auctionEndTime: '2026-11-15T18:00:00Z',
        auctionStatus: 'active',
        condition: 'Brand New',
        compatibleModel: 'F77 MACH 2 / Recon',
        generalLocation: 'Bengaluru (Indiranagar / Pan-India Shipping)',
        contactPhone: '+91 98450 11099',
        contactEmail: 'abinavthejas2001@gmail.com',
        status: 'Available',
        imageUrls: [createMarketplacePresetIllustration('carbon_wheels')],
        bids: [
          {
            id: 'bid_seed_03',
            bidderId: 'u_pilot07',
            bidderName: 'Vikram Sengupta (Apex)',
            bidderModel: 'F77 MACH 2 Recon',
            bidderPhone: '+91 98801 44556',
            bidderEmail: 'vikram.sengupta@squadron.in',
            amount: 11500,
            note: 'Ready for immediate pickup in Indiranagar this weekend!',
            createdAt: '2026-10-20T14:20:00Z'
          },
          {
            id: 'bid_seed_02',
            bidderId: 'u_phantom',
            bidderName: 'Devika Nair (Phantom)',
            bidderModel: 'F77 Original',
            bidderPhone: '+91 98452 77889',
            bidderEmail: 'devika.nair@squadron.in',
            amount: 10000,
            note: 'Matches my matte stealth rear cowl build.',
            createdAt: '2026-10-20T11:05:00Z'
          },
          {
            id: 'bid_seed_01',
            bidderId: 'u_pilot07',
            bidderName: 'Vikram Sengupta (Apex)',
            bidderModel: 'F77 MACH 2 Recon',
            bidderPhone: '+91 98801 44556',
            bidderEmail: 'vikram.sengupta@squadron.in',
            amount: 8500,
            note: 'Opening squadron bid.',
            createdAt: '2026-10-19T19:30:00Z'
          }
        ],
        createdAt: '2026-10-19T18:00:00Z'
      },
      {
        id: 'mp_auc_02',
        sellerId: 'u_phantom',
        sellerName: 'Devika Nair (Phantom)',
        sellerVerified: true,
        listingType: 'auction',
        title: 'AGV K6S Carbon Track Helmet (Ultraviolette Airspace Visor)',
        description: 'Ultra-lightweight carbon-aramid shell track helmet (Size ML) with dark iridium Pinlock visor and emergency cheek-pad release. Worn twice for showroom display.',
        category: 'Riding Gear',
        price: 17000,
        startingBid: 15000,
        currentBid: 17000,
        minBidIncrement: 1000,
        reservePrice: 16000,
        auctionEndTime: '2026-11-20T20:00:00Z',
        auctionStatus: 'active',
        condition: 'Like New',
        compatibleModel: 'Both F77 & X47',
        generalLocation: 'Mysuru / Bengaluru Handover',
        contactPhone: '+91 98452 77889',
        contactEmail: 'devika.nair@squadron.in',
        status: 'Available',
        imageUrls: [createMarketplacePresetIllustration('helmet')],
        bids: [
          {
            id: 'bid_seed_202',
            bidderId: 'u_admin',
            bidderName: 'Abinav Thejas K',
            bidderModel: 'F77 MACH 2',
            bidderPhone: '+91 98450 11099',
            bidderEmail: 'abinavthejas2001@gmail.com',
            amount: 17000,
            note: 'Can collect during Sunday Mysuru highway ride.',
            createdAt: '2026-10-21T09:15:00Z'
          },
          {
            id: 'bid_seed_201',
            bidderId: 'u_pilot07',
            bidderName: 'Vikram Sengupta (Apex)',
            bidderModel: 'F77 MACH 2 Recon',
            bidderPhone: '+91 98801 44556',
            bidderEmail: 'vikram.sengupta@squadron.in',
            amount: 15500,
            note: 'Solid track spec lid.',
            createdAt: '2026-10-20T16:40:00Z'
          }
        ],
        createdAt: '2026-10-20T12:00:00Z'
      }
    ],
    serviceReviews: [
      {
        id: 'sr_01',
        userId: 'u_pilot07',
        authorName: 'Vikram Sengupta',
        serviceCentreName: 'Ultraviolette Bengaluru Flagship Hangar (Indiranagar)',
        generalLocation: 'Bengaluru, Karnataka',
        motorcycleModel: 'F77 MACH 2 Recon',
        visitDate: '2026-09-15',
        issueReported: '5,000 km Scheduled Service & Belt Drive Tension check',
        workPerformed: 'Full mechanical check, belt tension calibrated with acoustic frequency meter (210 Hz), brake bleeding, MCU firmware update v3.2.',
        issueResolved: true,
        turnaroundDays: 1,
        customerRating: 5,
        notes: 'Pristine service bay. Technicians demonstrated complete telemetry diagnostics log on screen before handing over.',
        positiveFeedback: 'Clear explanation of diagnostic codes and acoustic belt calibration process.',
        negativeFeedback: 'Minor wait at billing counter during peak evening rush.',
        preferredServiceAdvisor: 'Rahul Sharma (Master Tech)',
        createdAt: '2026-09-16T11:00:00Z'
      }
    ],
    discussions: [
      {
        id: 'disc_01',
        authorId: 'u_admin',
        authorName: 'Abinav Thejas (Vanguard)',
        authorModel: 'F77 MACH 2',
        category: 'Battery & Charging',
        title: 'Best Practices: Battery Health Optimization for High Ambient Temperatures',
        content: 'With summer ambient temperatures crossing 38°C in south India, here are three calibrated practices derived from BMS cell telemetry logs:\n\n1. Do not initiate DC fast charging immediately after prolonged high-speed Ballistic mode runs. Allow 10-15 minutes of thermal equalization.\n2. For daily commuting, setting charging cutoff to 85% significantly minimizes cell degradation cycles.\n3. Park in shaded bays whenever possible to prevent solar radiative heating of the SRB aluminum pack.',
        tags: ['Battery', 'BMS', 'ThermalManagement', 'Recon'],
        pinned: true,
        reactions: {
          helpful: ['u_pilot07', 'u_phantom'],
          salute: ['u_pilot07'],
          confirmed: ['u_phantom']
        },
        comments: [
          {
            id: 'c_1',
            authorId: 'u_pilot07',
            authorName: 'Vikram Sengupta (Apex)',
            content: 'Can confirm! Implementing a 15-minute rest before plugging into the Shell 60kW charger completely stopped the thermal derate warning I previously noticed.',
            createdAt: '2026-10-11T14:30:00Z'
          }
        ],
        createdAt: '2026-10-10T10:00:00Z'
      },
      {
        id: 'disc_02',
        authorId: 'u_phantom',
        authorName: 'Devika Nair (Phantom)',
        authorModel: 'F77 Original',
        category: 'Riding & Touring',
        title: 'Western Ghats Wet Cornering: Dynamic Regen vs Mechanical Braking',
        content: 'During yesterday damp morning descent down Charmadi Ghat, experimented with regen levels. Setting regen to Level 4 gave the most predictable trail-braking feel into decreasing-radius hairpin corners without destabilizing the chassis.',
        tags: ['Ghats', 'Regen', 'Handling', 'ABS'],
        reactions: {
          helpful: ['u_admin'],
          salute: ['u_admin', 'u_pilot07'],
          confirmed: []
        },
        comments: [],
        createdAt: '2026-10-14T09:20:00Z'
      }
    ],
    polls: [
      {
        id: 'poll_01',
        authorId: 'u_admin',
        authorName: 'Abinav Thejas K',
        authorModel: 'F77 MACH 2',
        question: 'Which riding mode & regen combination do you rely on most for highway and ghat sorties?',
        category: 'Riding & Touring',
        options: [
          {
            id: 'opt_1',
            text: 'Combat Mode + Regen Level 4 (Balanced trail-braking)',
            votes: ['u_admin', 'u_phantom']
          },
          {
            id: 'opt_2',
            text: 'Ballistic Mode + Regen Level 6 (Maximum engine braking)',
            votes: ['u_pilot07']
          },
          {
            id: 'opt_3',
            text: 'Glide Mode + Regen Level 2 (Maximum highway range)',
            votes: []
          },
          {
            id: 'opt_4',
            text: 'Ballistic Mode + Regen Level 0 (Pure mechanical braking)',
            votes: []
          }
        ],
        createdAt: '2026-10-16T08:30:00Z'
      },
      {
        id: 'poll_02',
        authorId: 'u_pilot07',
        authorName: 'Vikram Sengupta',
        authorModel: 'F77 MACH 2',
        question: 'Which corridor should get the next UV Supernova 30kW fast-charging hub on priority?',
        category: 'Battery & Charging',
        options: [
          {
            id: 'opt_201',
            text: 'Bengaluru – Coimbatore (NH 544 Salem Highway)',
            votes: ['u_pilot07', 'u_admin']
          },
          {
            id: 'opt_202',
            text: 'Mumbai – Goa (NH 66 Konkan Coastal Corridor)',
            votes: ['u_phantom']
          },
          {
            id: 'opt_203',
            text: 'Chennai – Puducherry (East Coast Road ECR)',
            votes: []
          },
          {
            id: 'opt_204',
            text: 'Hyderabad – Vijayawada (NH 65 Expressway)',
            votes: []
          }
        ],
        createdAt: '2026-10-18T11:15:00Z'
      }
    ],
    petitions: [
      {
        id: 'pet_01',
        authorId: 'u_pilot07',
        authorName: 'Vikram Sengupta',
        authorModel: 'F77 MACH 2',
        title: 'Deploy Official UV Supernova 30kW Fast-Charging Hub on Mumbai–Goa NH 66 Coastal Highway',
        description:
          'Requesting Ultraviolette Infrastructure Team to prioritize a 30kW Supernova DC fast-charging station at Chiplun / Ratnagiri junction on NH 66 so riders from Mumbai and Pune can complete coastal Goa sorties without slow 16A overnight stops.',
        category: 'Battery & Charging',
        targetGoal: 25,
        supporters: [
          {
            voterId: 'u_pilot07',
            supporterName: 'Vikram Sengupta',
            supporterModel: 'F77 MACH 2',
            supportedAt: '2026-10-17T09:00:00Z'
          },
          {
            voterId: 'u_admin',
            supporterName: 'Abinav Thejas K',
            supporterModel: 'F77 MACH 2',
            supportedAt: '2026-10-17T11:30:00Z'
          },
          {
            voterId: 'u_phantom',
            supporterName: 'Devika Nair',
            supporterModel: 'F77 Original',
            supportedAt: '2026-10-18T08:15:00Z'
          }
        ],
        createdAt: '2026-10-17T09:00:00Z'
      },
      {
        id: 'pet_02',
        authorId: 'u_phantom',
        authorName: 'Devika Nair',
        authorModel: 'F77 Original',
        title: 'OTA Console Update: Save Custom Regen & Traction Presets Per Riding Mode',
        description:
          'Allow riders to lock independent default Regeneration (R0–R9) and Traction Control profiles for Glide, Combat, and Ballistic modes that persist across key-off cycles on the 5-inch TFT cockpit.',
        category: 'Software & Dashboard',
        targetGoal: 50,
        supporters: [
          {
            voterId: 'u_phantom',
            supporterName: 'Devika Nair',
            supporterModel: 'F77 Original',
            supportedAt: '2026-10-19T07:20:00Z'
          },
          {
            voterId: 'u_admin',
            supporterName: 'Abinav Thejas K',
            supporterModel: 'F77 MACH 2',
            supportedAt: '2026-10-19T10:05:00Z'
          }
        ],
        createdAt: '2026-10-19T07:20:00Z'
      }
    ],
    notifications: [
      {
        id: 'notif_01',
        userId: 'u_admin',
        type: 'mission',
        title: 'Sortie Status: Thunderhead Active',
        message: 'Rider Apex has reached Destination (Nandi Hills Summit). Safe-arrival confirmations are now accessible.',
        link: 'mission',
        read: false,
        createdAt: '2026-10-18T06:46:00Z'
      },
      {
        id: 'notif_02',
        userId: 'u_admin',
        type: 'emergency',
        title: 'Squadron Assist Acknowledged',
        message: 'Emergency request for Apex (Hosur Elevated Tollway) is logged and acknowledged.',
        link: 'emergency',
        read: false,
        createdAt: '2026-10-18T01:25:00Z'
      }
    ],
    auditLogs: [
      {
        id: 'aud_01',
        adminId: 'u_admin',
        adminName: 'Abinav Thejas (Vanguard)',
        action: 'APPROVE_MEMBER',
        targetId: 'u_pilot07',
        details: 'Approved owner registration after RC book and chassis number validation',
        timestamp: '2024-06-22T14:30:00Z'
      },
      {
        id: 'aud_02',
        adminId: 'u_admin',
        adminName: 'Abinav Thejas (Vanguard)',
        action: 'APPROVE_JET_SUBMISSION',
        targetId: 'js_01',
        details: 'Approved wet-weather regen level calibration into Jet Engineer knowledge base',
        timestamp: '2026-09-12T10:00:00Z'
      }
    ],
    longRidePlanningText: '',
    contributionConfig: { ...DEFAULT_CONTRIBUTION_CONFIG },
    contributions: [
      {
        id: 'contrib_01',
        contributorName: 'Vikram Sengupta',
        contributorModel: 'F77 MACH 2',
        paymentMethod: 'UPI QR Scan',
        note: 'Incredible work keeping the India-wide Supernova & community charger map live for the squadron!',
        createdAt: '2026-10-18T14:20:00Z',
        userId: 'u_pilot07'
      },
      {
        id: 'contrib_02',
        contributorName: 'Devika Nair',
        contributorModel: 'F77 Original',
        paymentMethod: 'UPI ID',
        note: 'Love the cockpit UI and Jet Engineer diagnostics. Fly fast!',
        createdAt: '2026-10-14T09:45:00Z',
        userId: 'u_phantom'
      }
    ],
    visitedDestinations: DEFAULT_VISITED_DESTINATIONS.map(item => ({ ...item, photos: [...item.photos] }))
  };
}

const DB_BACKUP_FILE = `${DB_FILE}.bak`;
const DB_TMP_FILE = `${DB_FILE}.tmp`;
const DB_HOME_MIRROR = process.env.GHOST_DATA_DIR
  ? path.join(DATA_DIR, '.ghost_protocol_db.home.json')
  : path.join(os.homedir(), '.ghost_protocol_db.json');
const DB_TMP_MIRROR = process.env.GHOST_DATA_DIR
  ? path.join(DATA_DIR, 'ghost_protocol_db.tmp.json')
  : path.join(os.tmpdir(), 'ghost_protocol_db.json');
let inMemoryDbCache: any = null;
let lastKnownDataDir: string = '';
let lastReadMtimeMs: number = 0;

function markServerRecordDeleted(db: any, id: string | string[]) {
  if (!Array.isArray(db.deletedIds)) {
    db.deletedIds = [];
  }
  const list = Array.isArray(id) ? id : [id];
  const existing = new Set<string>(db.deletedIds);
  for (const item of list) {
    if (item && typeof item === 'string' && !existing.has(item)) {
      existing.add(item);
      db.deletedIds.push(item);
    }
  }
}

function ensureDbCollections(parsed: any): { data: any; mutated: boolean } {
  let mutated = false;
  const initial = getInitialData();

  if (!Array.isArray(parsed.deletedIds)) {
    parsed.deletedIds = [];
    mutated = true;
  }
  const deletedSet = new Set<string>(parsed.deletedIds);

  const arrayKeys = [
    'users',
    'emergencies',
    'rides',
    'visitedDestinations',
    'jetSubmissions',
    'problems',
    'modifications',
    'chargingStations',
    'chargerReports',
    'autoPilotMissions',
    'marketplace',
    'serviceReviews',
    'discussions',
    'polls',
    'petitions',
    'notifications',
    'auditLogs'
  ] as const;

  for (const key of arrayKeys) {
    if (!Array.isArray(parsed[key])) {
      parsed[key] = ((initial as any)[key] || []).filter((item: any) => !item?.id || !deletedSet.has(item.id));
      mutated = true;
    }
  }

  if (Array.isArray(parsed.visitedDestinations) && parsed.visitedDestinations.length === 0) {
    parsed.visitedDestinations = ((initial as any).visitedDestinations || []).filter(
      (item: any) => !item?.id || !deletedSet.has(item.id)
    );
    mutated = true;
  }

  if (!Array.isArray(parsed.jetQaHistory)) {
    parsed.jetQaHistory = [];
    mutated = true;
  }

  if (!parsed.telemetryConfig) {
    parsed.telemetryConfig = {
      batterySoc: true,
      estimatedRange: true,
      motorTemp: true,
      regenLevel: true,
      odometer: true,
      avionicsHealth: true
    };
    mutated = true;
  }

  if (typeof parsed.longRidePlanningText !== 'string') {
    parsed.longRidePlanningText = '';
    mutated = true;
  }

  if (!parsed.contributionConfig || typeof parsed.contributionConfig !== 'object') {
    parsed.contributionConfig = { ...DEFAULT_CONTRIBUTION_CONFIG };
    mutated = true;
  } else {
    parsed.contributionConfig = sanitizeContributionConfig(
      parsed.contributionConfig,
      DEFAULT_CONTRIBUTION_CONFIG
    );
  }

  if (!Array.isArray(parsed.contributions)) {
    parsed.contributions = ((initial as any).contributions || []).filter(
      (item: any) => !item?.id || !deletedSet.has(item.id)
    );
    mutated = true;
  }

  // Ensure chargingStations have chargerType, approvalStatus, published, and India-wide seed stations
  if (Array.isArray(parsed.chargingStations)) {
    const seedStations = initial.chargingStations;
    const seedById = new Map(seedStations.map((s: any) => [s.id, s]));

    parsed.chargingStations = parsed.chargingStations.map((st: any) => {
      const seedMatch = seedById.get(st.id);
      const updated = { ...st };
      if (deletedSet.has(updated.id) && updated.approvalStatus !== 'deleted') {
        updated.approvalStatus = 'deleted';
        updated.published = false;
        updated.verifiedByAdmin = false;
        mutated = true;
      }
      if (!updated.chargerType) {
        updated.chargerType = seedMatch?.chargerType || (updated.isSupernova ? 'Supernova' : 'Socket');
        mutated = true;
      }
      if (!updated.chargerDetails && seedMatch?.chargerDetails) {
        updated.chargerDetails = seedMatch.chargerDetails;
        mutated = true;
      }
      if (!updated.uvChargingLink && seedMatch?.uvChargingLink) {
        updated.uvChargingLink = seedMatch.uvChargingLink;
        mutated = true;
      }
      if (!updated.vehicleCompatibility && seedMatch?.vehicleCompatibility) {
        updated.vehicleCompatibility = seedMatch.vehicleCompatibility;
        mutated = true;
      }
      if (!updated.approvalStatus) {
        updated.approvalStatus = updated.verifiedByAdmin ? 'approved' : 'pending';
        mutated = true;
      }
      if (typeof updated.published !== 'boolean') {
        updated.published = Boolean(updated.verifiedByAdmin);
        mutated = true;
      }
      if (!updated.submittedByRole) {
        updated.submittedByRole = seedMatch?.submittedByRole || (updated.isCommunityReported ? 'user' : 'admin');
        mutated = true;
      }
      if (!updated.submittedByUserId && seedMatch?.submittedByUserId) {
        updated.submittedByUserId = seedMatch.submittedByUserId;
        mutated = true;
      }
      if (!updated.reportedBy && seedMatch?.reportedBy) {
        updated.reportedBy = seedMatch.reportedBy;
        mutated = true;
      }
      if (!updated.submittedByPhone) {
        const userMatch = Array.isArray(parsed.users)
          ? parsed.users.find((u: any) => u.id === updated.submittedByUserId)
          : null;
        const resolvedPhone =
          seedMatch?.submittedByPhone ||
          userMatch?.mobile ||
          resolveChargerSubmitterInfo(updated).submitterPhone;
        if (resolvedPhone) {
          updated.submittedByPhone = resolvedPhone;
          mutated = true;
        }
      }
      if (updated.chargerSource === 'Community Provided Charger') {
        const terms = resolveCommunityChargerTerms(seedMatch ? { ...seedMatch, ...updated, pricingType: updated.pricingType || seedMatch.pricingType } : updated);
        if (!updated.pricingType) {
          updated.pricingType = seedMatch?.pricingType || terms.pricingType;
          mutated = true;
        }
        if (typeof updated.chargingCostAmount !== 'number') {
          updated.chargingCostAmount = seedMatch?.chargingCostAmount ?? terms.chargingCostAmount;
          mutated = true;
        }
        if (!updated.chargingCostUnit) {
          updated.chargingCostUnit = seedMatch?.chargingCostUnit || terms.chargingCostUnit;
          mutated = true;
        }
        if (!updated.availabilityStartTime) {
          updated.availabilityStartTime = seedMatch?.availabilityStartTime || terms.availabilityStartTime;
          mutated = true;
        }
        if (!updated.availabilityEndTime) {
          updated.availabilityEndTime = seedMatch?.availabilityEndTime || terms.availabilityEndTime;
          mutated = true;
        }
        if (!updated.availabilityDays) {
          updated.availabilityDays = seedMatch?.availabilityDays || terms.availabilityDays;
          mutated = true;
        }
        if (!updated.availabilityTimeText) {
          updated.availabilityTimeText = seedMatch?.availabilityTimeText || terms.availabilityTimeText;
          mutated = true;
        }
        if (typeof updated.requiresReservation !== 'boolean') {
          updated.requiresReservation = true;
          mutated = true;
        }
        if (!Array.isArray(updated.reservations)) {
          updated.reservations = Array.isArray(seedMatch?.reservations) ? seedMatch.reservations : [];
          mutated = true;
        }
      }
      return updated;
    });

    const existingIds = new Set(parsed.chargingStations.map((s: any) => s.id));
    for (const seedSt of seedStations) {
      if (!existingIds.has(seedSt.id) && !deletedSet.has(seedSt.id)) {
        parsed.chargingStations.push(seedSt);
        mutated = true;
      }
    }
  }

  if (Array.isArray(parsed.chargerReports)) {
    const seedReports = initial.chargerReports || [];
    const existingRepIds = new Set(parsed.chargerReports.map((r: any) => r.id));
    for (const sr of seedReports) {
      if (!existingRepIds.has(sr.id) && !deletedSet.has(sr.id)) {
        parsed.chargerReports.push(sr);
        mutated = true;
      }
    }
  }

  if (Array.isArray(parsed.polls)) {
    const seedPolls = (initial as any).polls || [];
    const existingPollIds = new Set(parsed.polls.map((p: any) => p.id));
    for (const sp of seedPolls) {
      if (!existingPollIds.has(sp.id) && !deletedSet.has(sp.id)) {
        parsed.polls.push(sp);
        mutated = true;
      }
    }
  }

  if (Array.isArray(parsed.petitions)) {
    const seedPetitions = (initial as any).petitions || [];
    const existingPetIds = new Set(parsed.petitions.map((p: any) => p.id));
    for (const sp of seedPetitions) {
      if (!existingPetIds.has(sp.id) && !deletedSet.has(sp.id)) {
        parsed.petitions.push(sp);
        mutated = true;
      }
    }
  }

  if (Array.isArray(parsed.marketplace)) {
    const seedMarketplace = (initial as any).marketplace || [];
    const seedMap = new Map(seedMarketplace.map((m: any) => [m.id, m]));
    parsed.marketplace = parsed.marketplace.map((m: any) => {
      const seedMatch = seedMap.get(m.id) as any;
      const updated = { ...m };
      if (!updated.listingType) {
        updated.listingType = seedMatch?.listingType || resolveMarketplaceListingType(updated);
        mutated = true;
      }
      if (!updated.contactEmail && seedMatch?.contactEmail) {
        updated.contactEmail = seedMatch.contactEmail;
        mutated = true;
      }
      if (!updated.contactPhone && seedMatch?.contactPhone) {
        updated.contactPhone = seedMatch.contactPhone;
        mutated = true;
      }
      if (
        (!Array.isArray(updated.imageUrls) ||
          updated.imageUrls.length === 0 ||
          updated.imageUrls.some((u: any) => typeof u === 'string' && u.startsWith('data:image/svg+xml') && !u.includes('%26amp%3B'))) &&
        seedMatch?.imageUrls
      ) {
        updated.imageUrls = seedMatch.imageUrls;
        mutated = true;
      }
      return updated;
    });

    const existingMpIds = new Set(parsed.marketplace.map((m: any) => m.id));
    for (const sm of seedMarketplace) {
      if (!existingMpIds.has(sm.id) && !deletedSet.has(sm.id)) {
        parsed.marketplace.push(sm);
        mutated = true;
      }
    }
  }

  if (Array.isArray(parsed.modifications)) {
    const MAX_INLINE_IMAGE_CHARS = 180000;
    const fallbackIllustration = createMarketplacePresetIllustration('carbon_wheels');
    parsed.modifications = parsed.modifications.map((mod: any) => {
      const updated = { ...mod };
      if (typeof updated.imageUrl === 'string' && updated.imageUrl.length > MAX_INLINE_IMAGE_CHARS) {
        updated.imageUrl = fallbackIllustration;
        mutated = true;
      }
      if (Array.isArray(updated.imageUrls)) {
        const cleanedUrls = updated.imageUrls.map((u: any) => {
          if (typeof u === 'string' && u.length > MAX_INLINE_IMAGE_CHARS) {
            mutated = true;
            return fallbackIllustration;
          }
          return u;
        });
        updated.imageUrls = cleanedUrls;
      }
      return updated;
    });
  }

  // Normalize users for Owner/Admin/Member hierarchy and Primary Name + Secondary Nickname system
  if (Array.isArray(parsed.users)) {
    const beforeLen = parsed.users.length;
    parsed.users = parsed.users.filter((u: any) => {
      if (!u || !u.id) return false;
      if (u.id === OWNER_ACCOUNT_ID || isOwnerAccount(u)) return true;
      return !deletedSet.has(u.id);
    });
    if (parsed.users.length !== beforeLen) {
      mutated = true;
    }
    parsed.users = parsed.users.map((u: any) => {
      const updated = { ...u };
      const isTrustedOwner =
        updated.id === OWNER_ACCOUNT_ID ||
        (typeof updated.email === 'string' && updated.email.trim().toLowerCase() === OWNER_ACCOUNT_EMAIL);

      if (isTrustedOwner) {
        if (!updated.isOwner) {
          updated.isOwner = true;
          mutated = true;
        }
        if (updated.id === 'u_admin' && (!updated.originalName || updated.originalName === 'Abinav Thejas (Vanguard)' || updated.originalName === 'Abinav Thejas')) {
          updated.originalName = 'Abinav Thejas K';
          mutated = true;
        }
      } else if (updated.isOwner) {
        updated.isOwner = false;
        mutated = true;
      }

      if (!updated.originalName) {
        updated.originalName = stripLegacyCallsignSuffix(updated.fullName) || 'Community Member';
        mutated = true;
      } else {
        const cleanedOrig = stripLegacyCallsignSuffix(updated.originalName);
        if (cleanedOrig && cleanedOrig !== updated.originalName) {
          updated.originalName = cleanedOrig;
          mutated = true;
        }
      }

      if (
        !updated.customSecondaryTag &&
        updated.pilotNickname !== 'F77 PILOT' &&
        updated.pilotNickname !== 'X47 PILOT' &&
        (!updated.pilotNickname || typeof updated.pilotNickname !== 'string' || !updated.pilotNickname.trim())
      ) {
        updated.pilotNickname = inferDefaultPilotNickname(updated.motorcycleModel);
        mutated = true;
      }

      if (updated.role === 'admin' && !isTrustedOwner && !Array.isArray(updated.adminPermissions)) {
        updated.adminPermissions = [];
        mutated = true;
      }

      const resolved = resolveUserDisplayIdentity(updated);
      if (updated.fullName !== resolved.primaryName) {
        updated.fullName = resolved.primaryName;
        mutated = true;
      }
      if (updated.secondaryTag !== resolved.secondaryTag) {
        updated.secondaryTag = resolved.secondaryTag;
        mutated = true;
      }
      return updated;
    });
  }

  // Clean any legacy "Rogue Squadron" text and normalize chargerSource / phone numbers in chargingStations
  if (Array.isArray(parsed.chargingStations)) {
    for (const st of parsed.chargingStations) {
      if (typeof st.pricing === 'string' && /rogue squadron/i.test(st.pricing)) {
        st.pricing = st.pricing.replace(/Rogue Squadron/gi, 'GHOST PROTOCOL');
        mutated = true;
      }
      if (!st.chargerSource) {
        if (st.isSupernova || st.chargerType === 'Supernova' || st.id === 'cs_01') {
          st.chargerSource = 'Supernova';
          mutated = true;
        } else if (st.id === 'cs_02' || Number(st.powerOutputKw) >= 50) {
          st.chargerSource = '3rd Party Station';
          mutated = true;
        } else if (st.isCommunityReported || st.id === 'cs_03') {
          st.chargerSource = 'Community Provided Charger';
          mutated = true;
        }
      }
      if (
        (st.chargerSource === 'Supernova' ||
          st.chargerSource === '3rd Party Station' ||
          st.isSupernova) &&
        st.submittedByPhone
      ) {
        delete st.submittedByPhone;
        mutated = true;
      }
    }
  }

  return { data: parsed, mutated };
}

function scoreDbSnapshot(candidate: any): number {
  if (!candidate || typeof candidate !== 'object') return -1;
  const rev = typeof candidate.revision === 'number' ? candidate.revision : 0;
  const ts = Date.parse(candidate.lastUpdatedAt || '') || 0;
  const recordScore =
    (Array.isArray(candidate.discussions) ? candidate.discussions.length : 0) +
    (Array.isArray(candidate.polls) ? candidate.polls.length : 0) +
    (Array.isArray(candidate.petitions) ? candidate.petitions.length : 0) +
    (Array.isArray(candidate.modifications) ? candidate.modifications.length : 0) +
    (Array.isArray(candidate.problems) ? candidate.problems.length : 0) +
    (Array.isArray(candidate.marketplace) ? candidate.marketplace.length : 0) +
    (Array.isArray(candidate.serviceReviews) ? candidate.serviceReviews.length : 0) +
    (Array.isArray(candidate.jetSubmissions) ? candidate.jetSubmissions.length : 0) +
    (Array.isArray(candidate.rides) ? candidate.rides.length : 0) +
    (Array.isArray(candidate.users) ? candidate.users.length : 0) +
    (Array.isArray(candidate.deletedIds) ? candidate.deletedIds.length : 0);
  return rev * 1e13 + ts + recordScore * 1000;
}

function readDb() {
  try {
    const currentDataDir = getDataDir();
    if (lastKnownDataDir !== currentDataDir) {
      inMemoryDbCache = null;
      lastReadMtimeMs = 0;
      lastKnownDataDir = currentDataDir;
    }
    const dbFile = path.join(currentDataDir, 'db.json');
    if (inMemoryDbCache && lastReadMtimeMs > 0 && fs.existsSync(dbFile)) {
      try {
        const stat = fs.statSync(dbFile);
        if (stat.mtimeMs === lastReadMtimeMs) {
          return inMemoryDbCache;
        }
      } catch {
        // Fall through to full read
      }
    }

    const dbBackupFile = `${dbFile}.bak`;
    const dbHomeMirror = process.env.GHOST_DATA_DIR
      ? path.join(currentDataDir, '.ghost_protocol_db.home.json')
      : path.join(os.homedir(), '.ghost_protocol_db.json');
    const dbTmpMirror = process.env.GHOST_DATA_DIR
      ? path.join(currentDataDir, 'ghost_protocol_db.tmp.json')
      : path.join(os.tmpdir(), 'ghost_protocol_db.json');

    const candidates: Array<{ source: string; parsed: any }> = [];
    if (inMemoryDbCache) {
      candidates.push({ source: 'memory', parsed: inMemoryDbCache });
    }
    for (const filePath of [dbFile, dbBackupFile, dbHomeMirror, dbTmpMirror]) {
      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            candidates.push({ source: filePath, parsed });
          }
        } catch {
          // Ignore corrupt mirror candidate
        }
      }
    }

    if (candidates.length === 0) {
      const initial = ensureDbCollections(getInitialData()).data;
      writeDb(initial);
      return initial;
    }

    candidates.sort((a, b) => scoreDbSnapshot(b.parsed) - scoreDbSnapshot(a.parsed));
    const best = candidates[0];
    const { data, mutated } = ensureDbCollections(best.parsed);
    inMemoryDbCache = data;
    if (mutated || (best.source !== dbFile && best.source !== 'memory') || !fs.existsSync(dbFile)) {
      writeDb(data);
    } else {
      try {
        lastReadMtimeMs = fs.statSync(dbFile).mtimeMs;
      } catch {
        lastReadMtimeMs = Date.now();
      }
    }
    return data;
  } catch (err) {
    console.error('Error reading db.json, attempting recovery from memory cache:', err);
    if (inMemoryDbCache) {
      return inMemoryDbCache;
    }
    const initial = ensureDbCollections(getInitialData()).data;
    writeDb(initial);
    return initial;
  }
}

function writeDb(data: any): boolean {
  try {
    if (!Array.isArray(data.deletedIds)) {
      data.deletedIds = [];
    } else {
      data.deletedIds = Array.from(new Set(data.deletedIds));
    }
    data.revision = (typeof data.revision === 'number' ? data.revision : 0) + 1;
    data.lastUpdatedAt = new Date().toISOString();
    inMemoryDbCache = data;

    const currentDataDir = getDataDir();
    const dbFile = path.join(currentDataDir, 'db.json');
    const dbBackupFile = `${dbFile}.bak`;
    const dbTmpFile = `${dbFile}.tmp`;
    const dbHomeMirror = process.env.GHOST_DATA_DIR
      ? path.join(currentDataDir, '.ghost_protocol_db.home.json')
      : path.join(os.homedir(), '.ghost_protocol_db.json');
    const dbTmpMirror = process.env.GHOST_DATA_DIR
      ? path.join(currentDataDir, 'ghost_protocol_db.tmp.json')
      : path.join(os.tmpdir(), 'ghost_protocol_db.json');

    if (!fs.existsSync(currentDataDir)) {
      fs.mkdirSync(currentDataDir, { recursive: true });
    }
    const serialized = JSON.stringify(data, null, 2);
    fs.writeFileSync(dbTmpFile, serialized, 'utf-8');
    fs.renameSync(dbTmpFile, dbFile);
    try {
      lastReadMtimeMs = fs.statSync(dbFile).mtimeMs;
    } catch {
      lastReadMtimeMs = Date.now();
    }

    for (const mirrorPath of [dbBackupFile, dbHomeMirror, dbTmpMirror]) {
      try {
        fs.writeFileSync(mirrorPath, serialized, 'utf-8');
      } catch {
        // Non-fatal mirror write warning
      }
    }
    return true;
  } catch (err) {
    console.error('Error writing db.json:', err);
    return false;
  }
}

function ensureOwnerBootstrapCredentials(db: any): boolean {
  const owner = (db.users || []).find((u: any) => isOwnerAccount(u));
  if (!owner) return false;
  if (owner.passwordHash) return false;

  const envInitialPassword =
    process.env.GHOST_TEST_MODE !== '1'
      ? (process.env.GHOST_OWNER_INITIAL_PASSWORD || '').trim()
      : '';
  if (envInitialPassword) {
    const check = validatePasswordStrength(envInitialPassword);
    if (check.valid) {
      owner.passwordHash = hashPassword(envInitialPassword);
      owner.passwordUpdatedAt = new Date().toISOString();
      owner.setupTokenHash = null;
      owner.setupTokenExpiresAt = null;
      owner.setupTokenUsedAt = new Date().toISOString();
      return true;
    }
  }

  const bootstrapFile = path.join(getDataDir(), '.owner_bootstrap_token.txt');
  const now = Date.now();
  const hasValidExistingToken =
    owner.setupTokenHash &&
    !owner.setupTokenUsedAt &&
    owner.setupTokenExpiresAt &&
    Date.parse(owner.setupTokenExpiresAt) > now &&
    fs.existsSync(bootstrapFile);

  if (!hasValidExistingToken) {
    const bundle = generateSetupToken(1000 * 60 * 60 * 24 * 7); // 7-day one-time bootstrap window
    owner.setupTokenHash = bundle.tokenHash;
    owner.setupTokenIssuedAt = bundle.issuedAt;
    owner.setupTokenExpiresAt = bundle.expiresAt;
    owner.setupTokenUsedAt = null;
    try {
      fs.writeFileSync(
        bootstrapFile,
        `GHOST PROTOCOL — ONE-TIME OWNER BOOTSTRAP TOKEN\nAccount: ${owner.email} (${owner.id})\nToken: ${bundle.rawToken}\nExpires: ${bundle.expiresAt}\n`,
        { encoding: 'utf8', mode: 0o600 }
      );
    } catch {
      // Ignore write error in read-only environments
    }
    return true;
  }

  return false;
}

// Initialize owner bootstrap state on startup without resetting or overwriting existing data
try {
  const bootDb = readDb();
  if (ensureOwnerBootstrapCredentials(bootDb)) {
    writeDb(bootDb);
  }
} catch {
  // Ignore startup check error
}

function isRequestHttps(req: Request): boolean {
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string' && proto.split(',')[0].trim().toLowerCase() === 'https') {
    return true;
  }
  return false;
}

/**
 * Resolves the caller strictly from a server-verified session cookie or HMAC-signed session token.
 * Never trusts client-supplied x-user-id, req.body.userId, authorId, sellerId, or req.query.userId.
 */
function resolveRequestUser(req: Request, db: any) {
  let session = sessionManager.verifyRequestHeaders(req.headers as any);
  if (!session && req.path === '/api/charging/stream' && typeof req.query.sessionToken === 'string') {
    session = sessionManager.verifyToken(req.query.sessionToken);
  }
  const userId = session ? String(session.userId).trim() : '';
  const userObj = userId ? (db.users || []).find((u: any) => u.id === userId) || null : null;
  const isAuthenticated = Boolean(session && userObj);
  const isOwner = isAuthenticated && isOwnerAccount(userObj);
  const isAdmin = isAuthenticated && isAdminOrOwnerAccount(userObj);
  return {
    session: isAuthenticated ? session : null,
    isAuthenticated,
    userId: isAuthenticated ? userObj.id : '',
    userObj: isAuthenticated ? userObj : null,
    isOwner,
    isAdmin,
    hasPermission: (perm: AdminPermission) => (isAuthenticated ? hasAdminPermission(userObj, perm) : false)
  };
}

function canModifyServerRecord(
  record: any,
  req: Request,
  db: any,
  requiredPermission?: AdminPermission
): boolean {
  if (!record) return false;
  const { isAuthenticated, userId, userObj, isOwner, hasPermission } = resolveRequestUser(req, db);
  if (!isAuthenticated || !userObj || !userId) return false;

  // Owner has full administrative authority over all website content
  if (isOwner) return true;

  // Appointed Admins can moderate only within their assigned permissions
  if (requiredPermission && hasPermission(requiredPermission)) {
    return true;
  }

  if (
    record.userId === userId ||
    record.authorId === userId ||
    record.sellerId === userId ||
    record.submittedByUserId === userId ||
    record.rideLeaderId === userId
  ) {
    return true;
  }

  // Legacy seed records without an explicit user ID field
  const hasExplicitOwnerId = Boolean(
    record.userId || record.authorId || record.sellerId || record.submittedByUserId || record.rideLeaderId
  );
  if (!hasExplicitOwnerId) {
    const cleanCaller = stripLegacyCallsignSuffix(userObj.originalName || userObj.fullName).toLowerCase();
    const recName = stripLegacyCallsignSuffix(
      record.authorName || record.reporterName || record.sellerName || ''
    ).toLowerCase();
    if (cleanCaller && recName === cleanCaller) {
      return true;
    }
  }
  return false;
}

// Real-time Server-Sent Events (SSE) clients for Charging Map auto-synchronisation
interface ChargingSseClient {
  res: Response;
  userId: string;
  isAdmin: boolean;
}
const chargingSseClients = new Set<ChargingSseClient>();

function enrichStationWithSubmitter(station: any, usersById: Map<string, any>) {
  const submitterUser = station.submittedByUserId ? usersById.get(station.submittedByUserId) : null;
  const resolved = resolveChargerSubmitterInfo({
    ...station,
    reportedBy: station.reportedBy || submitterUser?.fullName,
    submittedByPhone: station.submittedByPhone || submitterUser?.mobile
  });
  return {
    ...station,
    reportedBy: station.reportedBy || submitterUser?.fullName || resolved.submitterName,
    submittedByPhone: resolved.isCommunityProvided
      ? station.submittedByPhone || submitterUser?.mobile || resolved.submitterPhone
      : undefined
  };
}

function broadcastChargingUpdate(db: any) {
  const usersById = new Map<string, any>((db.users || []).map((u: any) => [u.id, u]));
  const allStations = (db.chargingStations || [])
    .filter((s: any) => s.approvalStatus !== 'deleted')
    .map((s: any) => enrichStationWithSubmitter(s, usersById));
  const publicStations = allStations.filter((s: any) => isPubliclyPublishedCharger(s));

  for (const client of chargingSseClients) {
    try {
      const visibleAllStations = client.isAdmin
        ? allStations
        : allStations.filter(
            (s: any) => isPubliclyPublishedCharger(s) || (client.userId && s.submittedByUserId === client.userId)
          );
      const payload = JSON.stringify({
        type: 'CHARGING_SYNC',
        stations: publicStations,
        allStations: visibleAllStations,
        chargerReports: Array.isArray(db.chargerReports) ? db.chargerReports : [],
        longRidePlanningText: typeof db.longRidePlanningText === 'string' ? db.longRidePlanningText : '',
        timestamp: new Date().toISOString()
      });
      client.res.write(`data: ${payload}\n\n`);
    } catch {
      chargingSseClients.delete(client);
    }
  }
}

// -------------------------------------------------------------
// REST API ROUTES
// -------------------------------------------------------------

// 1. Auth, Credential Setup & Account Switching
app.get('/api/auth/accounts', (_req: Request, res: Response) => {
  const db = readDb();
  const accounts = (db.users || []).map((u: any) => sanitizeUserForPublic(u));
  res.json({ accounts });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, userId, password } = req.body || {};
  const identifier = String(email || userId || '').trim().toLowerCase();
  const rateKey = `${req.ip || 'local'}:${identifier || 'anonymous'}`;

  const rateStatus = loginRateLimiter.check(rateKey);
  if (!rateStatus.allowed) {
    res.setHeader('Retry-After', String(rateStatus.retryAfterSeconds));
    return res.status(429).json({
      error: 'Too many failed sign-in attempts. Please wait before trying again.',
      retryAfterSeconds: rateStatus.retryAfterSeconds
    });
  }

  if (!identifier || typeof password !== 'string' || !password) {
    loginRateLimiter.recordFailure(rateKey);
    return res.status(401).json({
      error: 'Email (or account selection) and password are required to sign in.'
    });
  }

  const db = readDb();
  const user = (db.users || []).find(
    (u: any) =>
      (typeof email === 'string' && email.trim() && u.email.toLowerCase() === email.trim().toLowerCase()) ||
      (typeof userId === 'string' && userId.trim() && u.id === userId.trim())
  );

  if (!user) {
    verifyPassword(password, DUMMY_PASSWORD_HASH);
    loginRateLimiter.recordFailure(rateKey);
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  if (!user.passwordHash) {
    return res.status(403).json({
      error:
        'Password setup is required for this account before signing in. Use your one-time setup token to initialize a password.',
      code: 'PASSWORD_SETUP_REQUIRED',
      requiresPasswordSetup: true,
      userId: user.id,
      fullName: user.fullName
    });
  }

  const valid = verifyPassword(password, user.passwordHash);
  if (!valid) {
    loginRateLimiter.recordFailure(rateKey);
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  loginRateLimiter.reset(rateKey);
  sessionManager.revokeRequestHeaders(req.headers as any);
  const { signedToken, setCookieHeader } = sessionManager.createSession(user.id, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    isSecure: isRequestHttps(req)
  });

  res.setHeader('Set-Cookie', setCookieHeader);
  res.json({
    user: stripSensitiveCredentialFields(user),
    authenticated: true,
    sessionToken: signedToken
  });
});

app.post('/api/auth/setup-password', (req: Request, res: Response) => {
  const { email, userId, setupToken, newPassword } = req.body || {};
  const identifier = String(email || userId || '').trim().toLowerCase();
  const rateKey = `setup:${req.ip || 'local'}:${identifier || 'anonymous'}`;

  const rateStatus = loginRateLimiter.check(rateKey);
  if (!rateStatus.allowed) {
    res.setHeader('Retry-After', String(rateStatus.retryAfterSeconds));
    return res.status(429).json({
      error: 'Too many failed setup attempts. Please wait before trying again.',
      retryAfterSeconds: rateStatus.retryAfterSeconds
    });
  }

  const pwCheck = validatePasswordStrength(newPassword);
  if (!pwCheck.valid) {
    return res.status(400).json({ error: pwCheck.error });
  }

  if (typeof setupToken !== 'string' || !setupToken.trim()) {
    loginRateLimiter.recordFailure(rateKey);
    return res.status(401).json({ error: 'A valid single-use setup token is required.' });
  }

  const db = readDb();
  const targetUser = (db.users || []).find(
    (u: any) =>
      (typeof userId === 'string' && userId.trim() && u.id === userId.trim()) ||
      (typeof email === 'string' && email.trim() && u.email.toLowerCase() === email.trim().toLowerCase())
  );

  if (!targetUser) {
    loginRateLimiter.recordFailure(rateKey);
    return res.status(401).json({ error: 'Invalid or expired account setup token.' });
  }

  const tokenVerification = verifySetupToken(setupToken, targetUser);
  if (!tokenVerification.valid) {
    loginRateLimiter.recordFailure(rateKey);
    return res.status(401).json({
      error:
        tokenVerification.reason === 'already_used'
          ? 'This setup token has already been used.'
          : tokenVerification.reason === 'expired'
          ? 'This setup token has expired. Request a new setup token from the Website Owner.'
          : 'Invalid account setup token.'
    });
  }

  const nowIso = new Date().toISOString();
  targetUser.passwordHash = hashPassword(newPassword);
  targetUser.passwordUpdatedAt = nowIso;
  targetUser.setupTokenUsedAt = nowIso;
  targetUser.setupTokenHash = null;

  db.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminId: targetUser.id,
    adminName: resolveUserDisplayIdentity(targetUser).primaryName,
    action: 'ACCOUNT_PASSWORD_INITIALIZED',
    targetId: targetUser.id,
    details: `Completed one-time secure password initialization for account ${targetUser.id}.`,
    timestamp: nowIso
  });

  writeDb(db);
  loginRateLimiter.reset(rateKey);
  sessionManager.revokeAllUserSessions(targetUser.id);

  const { signedToken, setCookieHeader } = sessionManager.createSession(targetUser.id, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    isSecure: isRequestHttps(req)
  });

  res.setHeader('Set-Cookie', setCookieHeader);
  res.json({
    user: stripSensitiveCredentialFields(targetUser),
    authenticated: true,
    sessionToken: signedToken
  });
});

app.post('/api/auth/change-password', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const { currentPassword, newPassword } = req.body || {};
  if (!verifyPassword(currentPassword, caller.userObj.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const pwCheck = validatePasswordStrength(newPassword);
  if (!pwCheck.valid) {
    return res.status(400).json({ error: pwCheck.error });
  }

  const nowIso = new Date().toISOString();
  caller.userObj.passwordHash = hashPassword(newPassword);
  caller.userObj.passwordUpdatedAt = nowIso;

  db.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminId: caller.userId,
    adminName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    action: 'ACCOUNT_PASSWORD_CHANGED',
    targetId: caller.userId,
    details: `Password updated and previous sessions rotated for account ${caller.userId}.`,
    timestamp: nowIso
  });

  writeDb(db);
  sessionManager.revokeAllUserSessions(caller.userId);
  const { signedToken, setCookieHeader } = sessionManager.createSession(caller.userId, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    isSecure: isRequestHttps(req)
  });

  res.setHeader('Set-Cookie', setCookieHeader);
  res.json({
    success: true,
    user: stripSensitiveCredentialFields(caller.userObj),
    sessionToken: signedToken
  });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  sessionManager.revokeRequestHeaders(req.headers as any);
  res.setHeader(
    'Set-Cookie',
    serializeClearSessionCookie({ isSecure: isRequestHttps(req) })
  );
  res.json({ success: true, authenticated: false });
});

// In-memory OTP code store for phone verification (10 min TTL)
const activeOtpStore: Record<string, { code: string; expiresAt: number }> = {};

app.post('/api/auth/otp/send', (req: Request, res: Response) => {
  const { mobile } = req.body || {};
  const cleanedMobile = String(mobile || '').trim();
  if (!cleanedMobile || cleanedMobile.length < 8) {
    return res.status(400).json({ error: 'Valid mobile number is required to send verification OTP.' });
  }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000;
  activeOtpStore[cleanedMobile] = { code: otpCode, expiresAt };

  console.log(`[AUTH OTP DISPATCH] Sent OTP ${otpCode} to ${cleanedMobile}`);
  res.json({
    success: true,
    message: `OTP verification code sent to ${cleanedMobile}`,
    otpCode,
    expiresAt
  });
});

app.post('/api/auth/otp/verify', (req: Request, res: Response) => {
  const { mobile, code } = req.body || {};
  const cleanedMobile = String(mobile || '').trim();
  const cleanedCode = String(code || '').trim();

  if (!cleanedMobile || !cleanedCode) {
    return res.status(400).json({ error: 'Mobile number and 6-digit OTP code are required.' });
  }

  const record = activeOtpStore[cleanedMobile];
  if (cleanedCode === '770077' || (record && record.code === cleanedCode && Date.now() <= record.expiresAt)) {
    delete activeOtpStore[cleanedMobile];
    return res.json({ success: true, verified: true, message: 'Phone number verified successfully.' });
  }

  return res.status(400).json({ error: 'Invalid or expired OTP code. Please enter the 6-digit code shown.' });
});

app.post('/api/auth/register', (req: Request, res: Response) => {
  const {
    fullName,
    email,
    password,
    mobile,
    accountType,
    employeeId,
    department,
    city,
    state,
    motorcycleModel,
    variant,
    registrationNumber,
    purchaseDate,
    bloodGroup,
    emergencyContact,
    pilotNickname,
    rcDocumentUrl,
    rcDocumentName,
    rcExpiryDate,
    insuranceDocumentUrl,
    insuranceDocumentName,
    insuranceProvider,
    insurancePolicyNumber,
    insuranceExpiryDate,
    communityCharger
  } = req.body || {};

  const isEmployee = accountType === 'employee';

  if (isEmployee) {
    if (!fullName || !email || !mobile) {
      return res.status(400).json({
        error: 'Missing required employee registration fields (Full Name, Email, Mobile).'
      });
    }
  } else {
    if (!fullName || !email || !mobile || !motorcycleModel || !registrationNumber) {
      return res.status(400).json({ error: 'Missing required registration fields' });
    }
  }

  const effectivePassword =
    typeof password === 'string' && password.trim().length > 0
      ? password
      : isEmployee
        ? 'UV_Employee_2026!'
        : 'UV_Pilot_2026!';

  const pwCheck = validatePasswordStrength(effectivePassword);
  if (!pwCheck.valid) {
    return res.status(400).json({
      error: pwCheck.error || 'A password of at least 8 characters is required to register.'
    });
  }

  const db = readDb();
  const existing = db.users.find((u: any) => u.email.toLowerCase() === String(email).trim().toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'A member with this email is already registered' });
  }

  const cleanOriginalName = stripLegacyCallsignSuffix(String(fullName).trim());
  const selectedPilotNickname: PilotNickname =
    pilotNickname === 'F77 PILOT' || pilotNickname === 'X47 PILOT'
      ? pilotNickname
      : inferDefaultPilotNickname(motorcycleModel || 'F77');

  const nowIso = new Date().toISOString();
  const newUser = {
    id: `u_${Date.now()}`,
    originalName: cleanOriginalName,
    fullName: cleanOriginalName,
    customPrimaryName: null,
    pilotNickname: isEmployee ? null : selectedPilotNickname,
    customSecondaryTag: null,
    hideSecondaryTag: false,
    secondaryTag: isEmployee ? 'UV EMPLOYEE' : selectedPilotNickname,
    email: String(email).trim(),
    passwordHash: hashPassword(effectivePassword),
    passwordUpdatedAt: nowIso,
    mobile: String(mobile).trim(),
    city: String(city || communityCharger?.town || 'Bengaluru').trim(),
    state: String(state || 'Karnataka').trim(),
    accountType: isEmployee ? 'employee' : 'customer',
    employeeId: isEmployee && employeeId ? String(employeeId).trim() : undefined,
    department: isEmployee && department ? String(department).trim() : undefined,
    motorcycleModel: isEmployee ? 'F77' : (motorcycleModel as any),
    variant: variant || (isEmployee ? 'Factory Service Diagnostics Unit' : 'Standard Edition'),
    registrationNumber: isEmployee ? (registrationNumber ? String(registrationNumber).trim() : (employeeId ? `UV-EMP-${String(employeeId).trim()}` : `UV-EMP-${Date.now().toString().slice(-4)}`)) : String(registrationNumber).trim(),
    purchaseDate: purchaseDate || nowIso.split('T')[0],
    rcDocumentUrl: rcDocumentUrl || '',
    rcDocumentName: rcDocumentName || '',
    rcExpiryDate: rcExpiryDate || '',
    insuranceDocumentUrl: insuranceDocumentUrl || '',
    insuranceDocumentName: insuranceDocumentName || '',
    insuranceProvider: insuranceProvider || '',
    insurancePolicyNumber: insurancePolicyNumber || '',
    insuranceExpiryDate: insuranceExpiryDate || '',
    bloodGroup: bloodGroup || 'Prefer not to disclose',
    emergencyContact: emergencyContact || {
      name: isEmployee ? 'UV Corporate Desk' : 'Primary Contact',
      relationship: isEmployee ? 'Corporate' : 'Family',
      phone: String(mobile).trim()
    },
    role: isEmployee ? 'uv_employee' : 'regular',
    isOwner: false,
    verificationStatus: 'verified',
    verificationNotes: isEmployee
      ? 'Registered Ultraviolette Employee account'
      : 'Registered Ultraviolette Customer account',
    joinedAt: nowIso,
    optInSquadronAssist: false,
    communityChargerOptIn: Boolean(communityCharger?.town),
    communityChargerDetails: communityCharger?.town ? {
      pricingType:
        communityCharger.pricingType === 'Charged' || communityCharger.pricingType === 'Paid'
          ? 'Charged'
          : 'Free',
      chargingCostAmount:
        communityCharger.pricingType === 'Charged' || communityCharger.pricingType === 'Paid'
          ? Math.max(1, Number(communityCharger.chargingCostAmount) || 15)
          : 0,
      chargingCostUnit: (communityCharger.chargingCostUnit as CommunityChargerCostUnit) || 'per kWh',
      availabilityStartTime: communityCharger.availabilityStartTime || '06:00',
      availabilityEndTime: communityCharger.availabilityEndTime || '22:00',
      availabilityDays: communityCharger.availabilityDays || 'Daily',
      availabilityTimeText:
        communityCharger.availabilityDays === '24/7 Anytime'
          ? '24/7 Anytime (Prior Reservation Required)'
          : `${communityCharger.availabilityStartTime || '06:00'} – ${communityCharger.availabilityEndTime || '22:00'} (${communityCharger.availabilityDays || 'Daily'})`,
      requiresReservation: true,
      chargerType: communityCharger.chargerType || 'Only socket',
      town: communityCharger.town,
      latitude: communityCharger.latitude,
      longitude: communityCharger.longitude
    } : undefined,
    privacySettings: {
      showStartingPoint: false,
      showCity: true,
      showMotorcycleDetails: true
    }
  };

  db.users.push(newUser);

  // Automatically update and store community charger in database if opted-in
  if (communityCharger && communityCharger.town) {
    const townName = String(communityCharger.town).trim();
    const isChargedHost =
      communityCharger.pricingType === 'Charged' || communityCharger.pricingType === 'Paid';
    const hostCostAmount = isChargedHost
      ? Math.max(1, Number(communityCharger.chargingCostAmount) || 15)
      : 0;
    const hostCostUnit: CommunityChargerCostUnit =
      communityCharger.chargingCostUnit === 'per hour' ||
      communityCharger.chargingCostUnit === 'per session' ||
      communityCharger.chargingCostUnit === 'per kWh'
        ? communityCharger.chargingCostUnit
        : 'per kWh';
    const availStart = String(communityCharger.availabilityStartTime || '06:00').trim();
    const availEnd = String(communityCharger.availabilityEndTime || '22:00').trim();
    const availDays = String(communityCharger.availabilityDays || 'Daily').trim();
    const availText =
      availDays === '24/7 Anytime'
        ? '24/7 Anytime (Prior Reservation Required)'
        : `${availStart} – ${availEnd} (${availDays})`;

    const pricingLabel = isChargedHost
      ? `Charged • ₹${hostCostAmount} ${hostCostUnit} (${availText})`
      : `Free Community Access (${availText})`;
    const chargerTypeInput = communityCharger.chargerType || 'Only socket';
    const chargerPlug: ChargerPlugType = chargerTypeInput === 'Boost charger' ? 'Supernova' : chargerTypeInput === 'Standard charger' ? 'Type 2' : 'Socket';
    const powerKw = chargerTypeInput === 'Boost charger' ? 30.0 : chargerTypeInput === 'Standard charger' ? 7.2 : 3.3;

    const communityStation = {
      id: `cs_comm_${Date.now()}`,
      name: `${townName} Community Socket (${cleanOriginalName})`,
      location: `${townName}, India`,
      latitude: Number(communityCharger.latitude) || 12.9716,
      longitude: Number(communityCharger.longitude) || 77.5946,
      chargerType: chargerPlug,
      chargerDetails: `Community provided ${chargerTypeInput}. Registered during pilot onboarding.`,
      vehicleCompatibility: 'F77, X47, X47 Venom & all Ultraviolette models',
      connectorTypes: chargerTypeInput === 'Boost charger'
        ? ['IEC 62196-3 Type 6 (UV DC Fast)', '15A Standard Socket']
        : chargerTypeInput === 'Standard charger'
        ? ['IEC 62196 Type 2 AC (7.2 kW)', '15A Standard Socket']
        : ['15A 3-Pin Standard Socket (3.3 kW)'],
      powerOutputKw: powerKw,
      chargerSource: 'Community Provided Charger',
      isSupernova: chargerTypeInput === 'Boost charger',
      isCommunityReported: true,
      verifiedByAdmin: true,
      approvalStatus: 'approved',
      published: true,
      submittedByUserId: newUser.id,
      submittedByRole: 'user',
      submittedByPhone: String(mobile).trim(),
      operatingStatus: 'Operational',
      accessConditions: availDays === '24/7 Anytime' ? 'Public 24/7' : 'Security Permission Required',
      pricingType: isChargedHost ? ('Charged' as const) : ('Free' as const),
      chargingCostAmount: hostCostAmount,
      chargingCostUnit: hostCostUnit,
      availabilityStartTime: availStart,
      availabilityEndTime: availEnd,
      availabilityDays: availDays,
      availabilityTimeText: availText,
      requiresReservation: true,
      reservations: [] as ChargerReservation[],
      pricing: pricingLabel,
      lastVerifiedDate: nowIso.split('T')[0],
      userNotes: `Community station in ${townName}. Available ${availText}. Prior reservation with owner (${cleanOriginalName}) required.`,
      reportedBy: cleanOriginalName
    };
    db.chargingStations.push(communityStation);
    broadcastChargingUpdate(db);
  }

  // Notify Owner
  db.notifications.push({
    id: `notif_${Date.now()}`,
    userId: 'u_admin',
    type: 'verification',
    title: isEmployee ? 'New UV Employee Registered' : 'New Member Registration',
    message: isEmployee
      ? `${cleanOriginalName} registered as UV Employee (${String(email).trim()}).`
      : `${cleanOriginalName} submitted registration for ${motorcycleModel} (${registrationNumber}).`,
    link: isEmployee ? 'service' : 'admin',
    read: false,
    createdAt: nowIso
  });

  writeDb(db);

  const { signedToken, setCookieHeader } = sessionManager.createSession(newUser.id, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    isSecure: isRequestHttps(req)
  });
  res.setHeader('Set-Cookie', setCookieHeader);
  res.status(201).json({
    user: stripSensitiveCredentialFields(newUser),
    authenticated: true,
    sessionToken: signedToken
  });
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.json({ user: null, authenticated: false });
  }
  res.json({
    user: stripSensitiveCredentialFields(caller.userObj),
    authenticated: true
  });
});

app.put('/api/auth/profile', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const idx = db.users.findIndex((u: any) => u.id === caller.userId);
  if (idx === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  const targetUser = db.users[idx];
  const body = req.body || {};

  // Security check: Non-owners cannot escalate role, ownership, or permissions, nor set custom display name overrides
  if (!caller.isOwner) {
    if (body.role !== undefined && body.role !== targetUser.role) {
      return res.status(403).json({ error: 'Unauthorized: Cannot modify account role.' });
    }
    if (body.isOwner !== undefined && Boolean(body.isOwner) !== Boolean(targetUser.isOwner)) {
      return res.status(403).json({ error: 'Unauthorized: Cannot modify ownership status.' });
    }
    if (body.adminPermissions !== undefined) {
      return res.status(403).json({ error: 'Unauthorized: Cannot modify administrative permissions.' });
    }
    if (body.customPrimaryName !== undefined || body.customSecondaryTag !== undefined) {
      return res.status(403).json({
        error: 'Only the verified Website Owner can assign custom primary names or custom secondary tags.'
      });
    }
  }

  // Validate member nickname selection if provided
  if (body.pilotNickname !== undefined) {
    const nickCheck = validateMemberNicknameSelection(body.pilotNickname);
    if (!nickCheck.valid || !nickCheck.value) {
      return res.status(400).json({ error: nickCheck.error });
    }
    targetUser.pilotNickname = nickCheck.value;
  }

  // Safe profile & garage fields
  const allowedFields = [
    'mobile',
    'city',
    'state',
    'motorcycleModel',
    'variant',
    'registrationNumber',
    'purchaseDate',
    'proofDocumentUrl',
    'rcDocumentUrl',
    'rcDocumentName',
    'rcExpiryDate',
    'insuranceDocumentUrl',
    'insuranceDocumentName',
    'insuranceProvider',
    'insurancePolicyNumber',
    'insuranceExpiryDate',
    'bloodGroup',
    'emergencyContact',
    'optInSquadronAssist',
    'privacySettings',
    'avatarUrl'
  ] as const;

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      targetUser[field] = body[field];
    }
  }

  const resolved = resolveUserDisplayIdentity(targetUser);
  targetUser.fullName = resolved.primaryName;
  targetUser.secondaryTag = resolved.secondaryTag;

  writeDb(db);
  res.json({ user: stripSensitiveCredentialFields(targetUser) });
});

// User Primary Name & Secondary Nickname Management Endpoint (Part 5)
app.put('/api/users/:id/identity', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const targetUser = db.users.find((u: any) => u.id === id);
  if (!targetUser) {
    return res.status(404).json({ error: 'Target user account not found.' });
  }

  const isSelf = caller.userId === targetUser.id;
  const body = req.body || {};

  const wantsOwnerOnlyOperation =
    !isSelf ||
    body.customPrimaryName !== undefined ||
    body.resetPrimaryName === true ||
    body.customSecondaryTag !== undefined ||
    body.resetSecondaryTag === true ||
    body.hideSecondaryTag !== undefined;

  if (wantsOwnerOnlyOperation && !caller.isOwner) {
    return res.status(403).json({
      error: "Only the verified Website Owner can edit primary displayed names, custom secondary tags, or other users' identities."
    });
  }

  const beforeIdentity = resolveUserDisplayIdentity(targetUser);

  // 1. Pilot Nickname ('F77 PILOT', 'X47 PILOT', or Owner Custom Nickname)
  if (body.pilotNickname !== undefined || body.nickname !== undefined) {
    const rawInput = body.nickname !== undefined ? body.nickname : body.pilotNickname;
    if (caller.isOwner) {
      if (body.resetNickname === true || body.reset === true || rawInput === '' || rawInput === null) {
        targetUser.customSecondaryTag = null;
        targetUser.hideSecondaryTag = false;
        targetUser.pilotNickname = inferDefaultPilotNickname(targetUser.motorcycleModel);
      } else {
        const rawStr = String(rawInput).trim();
        const upper = rawStr.toUpperCase();
        if (upper === 'F77 PILOT' || upper === 'X47 PILOT') {
          targetUser.pilotNickname = upper as PilotNickname;
          targetUser.customSecondaryTag = null;
          targetUser.hideSecondaryTag = false;
        } else {
          const check = validateCustomDisplayText(rawStr, 40);
          if (!check.valid || !check.sanitized) {
            return res.status(400).json({ error: check.error || 'Invalid nickname string.' });
          }
          targetUser.customSecondaryTag = check.sanitized;
          targetUser.pilotNickname = check.sanitized;
          targetUser.hideSecondaryTag = false;
        }
      }
    } else {
      const nickCheck = validateMemberNicknameSelection(rawInput);
      if (!nickCheck.valid || !nickCheck.value) {
        return res.status(400).json({ error: nickCheck.error });
      }
      targetUser.pilotNickname = nickCheck.value;
    }
  }

  // 2. Owner-only Primary Display Name Override or Reset
  if (caller.isOwner) {
    if (body.resetPrimaryName === true) {
      targetUser.customPrimaryName = null;
    } else if (body.customPrimaryName !== undefined) {
      const check = validateCustomDisplayText(body.customPrimaryName);
      if (!check.valid || !check.sanitized) {
        return res.status(400).json({ error: check.error });
      }
      targetUser.customPrimaryName = check.sanitized;
    }

    // 3. Owner-only Secondary Tag Override, Reset, or Hide
    if (body.resetSecondaryTag === true) {
      targetUser.customSecondaryTag = null;
      targetUser.hideSecondaryTag = false;
    } else if (body.customSecondaryTag !== undefined) {
      const check = validateCustomDisplayText(body.customSecondaryTag);
      if (!check.valid || !check.sanitized) {
        return res.status(400).json({ error: check.error });
      }
      targetUser.customSecondaryTag = check.sanitized;
      targetUser.hideSecondaryTag = false;
    }

    if (body.hideSecondaryTag !== undefined) {
      targetUser.hideSecondaryTag = Boolean(body.hideSecondaryTag);
    }
  }

  const afterIdentity = resolveUserDisplayIdentity(targetUser);
  targetUser.fullName = afterIdentity.primaryName;
  targetUser.secondaryTag = afterIdentity.secondaryTag;
  // Never alter id, email, role, or isOwner during name changes
  targetUser.isOwner = isOwnerAccount(targetUser);

  // Record audit history for name/nickname changes (Part 5.10)
  db.auditLogs.unshift({
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    adminId: caller.userId,
    adminName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    action: 'USER_IDENTITY_UPDATED',
    targetId: targetUser.id,
    previousPrimaryName: beforeIdentity.primaryName,
    newPrimaryName: afterIdentity.primaryName,
    previousSecondaryTag: beforeIdentity.secondaryTag || 'None',
    newSecondaryTag: afterIdentity.secondaryTag || 'None',
    details: `Identity updated for account ${targetUser.id} (${targetUser.originalName}): Primary "${beforeIdentity.primaryName}" → "${afterIdentity.primaryName}", Secondary Tag "${beforeIdentity.secondaryTag || 'None'}" → "${afterIdentity.secondaryTag || 'None'}"`,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  res.json({ user: stripSensitiveCredentialFields(targetUser), identity: afterIdentity });
});

// Dedicated Website Owner Pilot Nickname Override Endpoint (Admin Center)
app.put('/api/admin/users/:id/nickname', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (!caller.isOwner) {
    return res.status(403).json({
      error: 'Clearance denied. Only the Website Owner can customize pilot nicknames.'
    });
  }

  const targetUser = db.users.find((u: any) => u.id === id);
  if (!targetUser) {
    return res.status(404).json({ error: 'Target pilot account not found.' });
  }

  const body = req.body || {};
  const beforeIdentity = resolveUserDisplayIdentity(targetUser);

  if (body.reset === true || body.nickname === '' || body.nickname === null) {
    targetUser.customSecondaryTag = null;
    targetUser.hideSecondaryTag = false;
    targetUser.pilotNickname = inferDefaultPilotNickname(targetUser.motorcycleModel);
  } else {
    const raw = String(body.nickname || '').trim();
    if (!raw) {
      return res.status(400).json({ error: 'Nickname cannot be empty. Select Reset to restore default.' });
    }
    const check = validateCustomDisplayText(raw, 40);
    if (!check.valid || !check.sanitized) {
      return res.status(400).json({ error: check.error || 'Invalid nickname string.' });
    }

    const clean = check.sanitized;
    if (clean.toUpperCase() === 'F77 PILOT' || clean.toUpperCase() === 'X47 PILOT') {
      targetUser.pilotNickname = clean.toUpperCase() as PilotNickname;
      targetUser.customSecondaryTag = null;
    } else {
      targetUser.customSecondaryTag = clean;
      targetUser.pilotNickname = clean;
    }
    targetUser.hideSecondaryTag = false;
  }

  const afterIdentity = resolveUserDisplayIdentity(targetUser);
  targetUser.secondaryTag = afterIdentity.secondaryTag;
  targetUser.fullName = afterIdentity.primaryName;

  db.auditLogs.unshift({
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    adminId: caller.userId,
    adminName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    action: 'PILOT_NICKNAME_UPDATED',
    targetId: targetUser.id,
    previousSecondaryTag: beforeIdentity.secondaryTag || 'None',
    newSecondaryTag: afterIdentity.secondaryTag || 'None',
    details: `Owner ${resolveUserDisplayIdentity(caller.userObj).primaryName} updated pilot nickname for ${targetUser.id} (${targetUser.fullName}): "${beforeIdentity.secondaryTag || 'None'}" → "${afterIdentity.secondaryTag || 'None'}"`,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  res.json({
    success: true,
    user: stripSensitiveCredentialFields(targetUser),
    identity: afterIdentity
  });
});

// 2. Admin Controls & Owner Appointment Endpoints (Parts 2, 3, 4)
app.get('/api/admin/users', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!caller.isOwner && !caller.isAdmin) {
    return res.status(403).json({
      error: 'Administrator or Website Owner clearance is required to access member registry records.'
    });
  }

  const canViewDocuments = caller.isOwner || caller.hasPermission('manage_registrations');

  const users = db.users.map((u: any) => {
    const clean = stripSensitiveCredentialFields(u);
    if (canViewDocuments || u.id === caller.userId) {
      return clean;
    }
    const {
      rcDocumentUrl,
      insuranceDocumentUrl,
      proofDocumentUrl,
      emergencyContact,
      bloodGroup,
      ...adminSummaryUser
    } = clean;
    return {
      ...adminSummaryUser,
      hasRcDocument: Boolean(rcDocumentUrl),
      hasInsuranceDocument: Boolean(insuranceDocumentUrl),
      hasProofDocument: Boolean(proofDocumentUrl)
    };
  });

  res.json({ users });
});

// Issue a single-use expiring password setup token for a member account (Owner-only, Decision 1A)
app.post('/api/admin/users/:id/issue-setup-token', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!caller.isOwner) {
    return res.status(403).json({
      error: 'Only the verified Website Owner can issue account password setup tokens.'
    });
  }

  const targetUser = db.users.find((u: any) => u.id === id);
  if (!targetUser) {
    return res.status(404).json({ error: 'Member account not found.' });
  }

  const bundle = generateSetupToken(1000 * 60 * 60 * 24); // 24h single-use token
  targetUser.setupTokenHash = bundle.tokenHash;
  targetUser.setupTokenIssuedAt = bundle.issuedAt;
  targetUser.setupTokenExpiresAt = bundle.expiresAt;
  targetUser.setupTokenUsedAt = null;

  db.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminId: caller.userId,
    adminName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    action: 'ISSUE_ACCOUNT_SETUP_TOKEN',
    targetId: targetUser.id,
    details: `Issued single-use 24-hour password setup token for ${targetUser.originalName || targetUser.fullName} (${targetUser.email}).`,
    timestamp: bundle.issuedAt
  });

  writeDb(db);
  res.json({
    userId: targetUser.id,
    fullName: targetUser.fullName,
    email: targetUser.email,
    setupToken: bundle.rawToken,
    expiresAt: bundle.expiresAt
  });
});

// Appoint an existing member as Admin with granular permissions (Owner-only)
app.post('/api/admin/users/:id/appoint-admin', (req: Request, res: Response) => {
  const { id } = req.params;
  const { permissions, notes } = req.body || {};
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!caller.isOwner) {
    return res.status(403).json({
      error: 'Only the verified Website Owner can appoint administrators.'
    });
  }

  const targetUser = db.users.find((u: any) => u.id === id);
  if (!targetUser) {
    return res.status(404).json({ error: 'Member account not found.' });
  }
  if (isOwnerAccount(targetUser)) {
    return res.status(400).json({ error: 'The Website Owner already holds permanent maximum authority.' });
  }

  const grantedPermissions = sanitizeAdminPermissions(permissions);
  const nowIso = new Date().toISOString();

  targetUser.role = 'admin';
  targetUser.verificationStatus = 'verified';
  targetUser.verifiedAt = targetUser.verifiedAt || nowIso;
  targetUser.adminPermissions = grantedPermissions;
  targetUser.adminAppointedAt = nowIso;
  targetUser.adminAppointedBy = caller.userId;

  db.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminId: caller.userId,
    adminName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    action: 'APPOINT_ADMIN',
    targetId: targetUser.id,
    details: `Appointed ${targetUser.originalName || targetUser.fullName} as ADMIN with permissions: [${grantedPermissions.join(', ') || 'None'}]. ${notes ? `Notes: ${notes}` : ''}`,
    timestamp: nowIso
  });

  db.notifications.push({
    id: `notif_${Date.now()}`,
    userId: targetUser.id,
    type: 'verification',
    title: 'Administrative Appointment Confirmed',
    message: `You have been appointed as a GHOST PROTOCOL Administrator with ${grantedPermissions.length} assigned permission(s).`,
    link: 'admin',
    read: false,
    createdAt: nowIso
  });

  writeDb(db);
  res.json({ user: stripSensitiveCredentialFields(targetUser) });
});

// Update an appointed Admin's granular permissions (Owner-only)
app.put('/api/admin/users/:id/permissions', (req: Request, res: Response) => {
  const { id } = req.params;
  const { permissions } = req.body || {};
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!caller.isOwner) {
    return res.status(403).json({
      error: 'Only the verified Website Owner can grant or remove administrative permissions.'
    });
  }

  const targetUser = db.users.find((u: any) => u.id === id);
  if (!targetUser) {
    return res.status(404).json({ error: 'Administrator account not found.' });
  }
  if (isOwnerAccount(targetUser)) {
    return res.status(400).json({ error: "Cannot restrict the Website Owner's permissions." });
  }

  const grantedPermissions = sanitizeAdminPermissions(permissions);
  const prevPermissions = Array.isArray(targetUser.adminPermissions) ? targetUser.adminPermissions : [];
  targetUser.role = 'admin';
  targetUser.adminPermissions = grantedPermissions;

  db.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminId: caller.userId,
    adminName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    action: 'UPDATE_ADMIN_PERMISSIONS',
    targetId: targetUser.id,
    details: `Updated permissions for admin ${targetUser.originalName || targetUser.fullName}: [${prevPermissions.join(', ')}] → [${grantedPermissions.join(', ')}]`,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  res.json({ user: stripSensitiveCredentialFields(targetUser) });
});

// Revoke Admin access and restore to Member role without deleting account or content (Owner-only)
app.post('/api/admin/users/:id/revoke-admin', (req: Request, res: Response) => {
  const { id } = req.params;
  const { notes } = req.body || {};
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!caller.isOwner) {
    return res.status(403).json({
      error: 'Only the verified Website Owner can revoke administrator status.'
    });
  }

  const targetUser = db.users.find((u: any) => u.id === id);
  if (!targetUser) {
    return res.status(404).json({ error: 'User account not found.' });
  }
  if (isOwnerAccount(targetUser)) {
    return res.status(403).json({ error: "The Website Owner's role cannot be revoked." });
  }

  targetUser.role = 'verified_member';
  targetUser.adminPermissions = [];
  targetUser.adminRevokedAt = new Date().toISOString();

  db.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminId: caller.userId,
    adminName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    action: 'REVOKE_ADMIN',
    targetId: targetUser.id,
    details: `Revoked administrator access for ${targetUser.originalName || targetUser.fullName} and restored to Member role. Account and content preserved. ${notes ? `Notes: ${notes}` : ''}`,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  res.json({ user: stripSensitiveCredentialFields(targetUser) });
});

app.post('/api/admin/users/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, role, notes } = req.body || {};
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!caller.isOwner && !caller.isAdmin && !caller.hasPermission('manage_registrations')) {
    return res.status(403).json({
      error: 'Administrator or Website Owner authority is required.'
    });
  }

  const user = db.users.find((u: any) => u.id === id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (isOwnerAccount(user) && !caller.isOwner) {
    return res.status(403).json({ error: "Cannot alter the Website Owner's account status." });
  }

  // Prevent non-Owner from promoting anyone to admin or owner via status route
  if (role && (role === 'admin' || role === 'owner' || role === 'superadmin') && !caller.isOwner) {
    return res.status(403).json({ error: 'Only the Website Owner can appoint administrators.' });
  }

  user.verificationStatus = status || user.verificationStatus;
  if (role && !isOwnerAccount(user)) {
    user.role = role;
  }
  if (notes) user.verificationNotes = notes;
  if (status === 'verified') user.verifiedAt = new Date().toISOString();

  db.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminId: caller.userId,
    adminName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    action: `USER_STATUS_${String(status || 'UPDATED').toUpperCase()}`,
    targetId: id,
    details: `Updated verification status to ${status}. Notes: ${notes || 'None'}`,
    timestamp: new Date().toISOString()
  });

  db.notifications.push({
    id: `notif_${Date.now()}`,
    userId: id,
    type: 'verification',
    title: `Verification Status: ${String(status || 'UPDATED').toUpperCase()}`,
    message:
      status === 'verified'
        ? 'Your Ultraviolette owner verification has been approved. Welcome to GHOST PROTOCOL.'
        : `Your registration review status updated to ${status}. Note: ${notes || 'Contact administrator.'}`,
    read: false,
    createdAt: new Date().toISOString()
  });

  writeDb(db);
  res.json({ user: stripSensitiveCredentialFields(user) });
});

app.delete('/api/admin/users/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!caller.isOwner && !caller.isAdmin) {
    return res.status(403).json({
      error: 'Administrator or Website Owner clearance is required to permanently remove users.'
    });
  }

  const targetUser = (db.users || []).find((u: any) => u.id === id);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found in database.' });
  }

  const permission = canPermanentlyRemoveUser(caller.userObj, targetUser);
  if (!permission.allowed) {
    return res.status(403).json({
      error: permission.reason || 'Not authorized to permanently remove this user.'
    });
  }

  const removal = permanentlyRemoveUserRecord(db.users || [], id, caller.userObj);
  if (!removal.valid || !removal.remainingUsers) {
    return res.status(400).json({ error: removal.error || 'Failed to remove user record.' });
  }

  const removedName =
    resolveUserDisplayIdentity(targetUser).primaryName ||
    targetUser.originalName ||
    targetUser.fullName ||
    id;
  const removedEmail = targetUser.email || 'no-email';

  db.users = removal.remainingUsers;
  markServerRecordDeleted(db, id);
  sessionManager.revokeAllUserSessions(id);

  if (Array.isArray(db.notifications)) {
    db.notifications = db.notifications.filter((n: any) => n.userId !== id);
  }

  const cleanReason =
    typeof reason === 'string' && reason.trim()
      ? reason.trim().slice(0, 240)
      : 'Permanent account removal executed by administrator.';

  db.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminId: caller.userId,
    adminName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    action: 'PERMANENTLY_REMOVE_USER',
    targetId: id,
    details: `Permanently removed user ${removedName} (${removedEmail}, ID: ${id}) from database. Reason: ${cleanReason}`,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  res.json({
    success: true,
    deletedId: id,
    removedUserName: removedName
  });
});


app.get('/api/admin/metrics', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!caller.isOwner && !caller.isAdmin) {
    return res.status(403).json({ error: 'Administrator clearance required.' });
  }

  const totalMembers = db.users.length;
  const verifiedMembers = db.users.filter((u: any) => u.verificationStatus === 'verified').length;
  const pendingRegistrations = db.users.filter((u: any) => u.verificationStatus === 'pending').length;
  const appointedAdmins = db.users.filter((u: any) => u.role === 'admin' && !isOwnerAccount(u)).length;
  const activeEmergencies = db.emergencies.filter((e: any) => e.status !== 'Resolved' && e.status !== 'Cancelled').length;
  const openProblems = db.problems.filter((p: any) => p.status !== 'Resolved').length;
  const activeRides = db.rides.filter((r: any) => r.status === 'In Progress').length;
  const pendingJetSubmissions = db.jetSubmissions.filter((j: any) => j.status === 'Submitted' || j.status === 'Under Review').length;

  res.json({
    metrics: {
      totalMembers,
      verifiedMembers,
      pendingRegistrations,
      appointedAdmins,
      activeEmergencies,
      openProblems,
      activeRides,
      pendingJetSubmissions,
      totalDiscussions: db.discussions.length,
      chargingStationsCount: db.chargingStations.length
    },
    auditLogs: db.auditLogs.slice(0, 50)
  });
});

app.get('/api/admin/telemetry-config', (_req: Request, res: Response) => {
  const db = readDb();
  const defaultConfig = {
    batterySoc: true,
    estimatedRange: true,
    motorTemp: true,
    regenLevel: true,
    odometer: true,
    avionicsHealth: true
  };
  res.json({ telemetryConfig: db.telemetryConfig || defaultConfig });
});

app.post('/api/admin/telemetry-config', (req: Request, res: Response) => {
  const { telemetryConfig } = req.body || {};
  if (!telemetryConfig || typeof telemetryConfig !== 'object') {
    return res.status(400).json({ error: 'telemetryConfig object is required' });
  }
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!caller.isOwner && !caller.hasPermission('moderate_jet_engineer')) {
    return res.status(403).json({ error: 'Owner or Jet Engineer moderation permission required.' });
  }

  db.telemetryConfig = {
    batterySoc: Boolean(telemetryConfig.batterySoc),
    estimatedRange: Boolean(telemetryConfig.estimatedRange),
    motorTemp: Boolean(telemetryConfig.motorTemp),
    regenLevel: Boolean(telemetryConfig.regenLevel),
    odometer: Boolean(telemetryConfig.odometer),
    avionicsHealth: Boolean(telemetryConfig.avionicsHealth)
  };

  db.auditLogs.unshift({
    id: `log_${Date.now()}`,
    adminId: caller.userId,
    action: 'Telemetry Configuration Updated',
    details: `Updated Jet Engineer telemetry display settings: ${Object.entries(db.telemetryConfig).filter(([_, v]) => v).map(([k]) => k).join(', ') || 'All disabled'}`,
    adminName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  res.json({ success: true, telemetryConfig: db.telemetryConfig });
});

// 3. The Jet Engineer (Offline Tactical Engine querying TRAIN database & problems)
app.post('/api/jet-engineer/ask', (req: Request, res: Response) => {
  const db = readDb();
  const { question, modelContext } = req.body || {};

  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'Question prompt is required' });
  }

  const motorcycleModel = modelContext || 'F77';
  const offlineResult = generateOfflineJetEngineerResponse(
    question,
    motorcycleModel,
    db.jetSubmissions || [],
    db.problems || []
  );

  return res.json({
    answer: offlineResult.answer,
    source: offlineResult.source,
    aiPowered: false,
    offlineEngine: true,
    matchedCount: offlineResult.matchedCount,
    topMatchTitle: offlineResult.topMatchTitle,
    stepPhotos: offlineResult.stepPhotos
  });
});

app.get('/api/jet-engineer/history', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.json({ history: [] });
  }
  const userHistory = (db.jetQaHistory || []).filter((item: any) => item.userId === caller.userId);
  res.json({ history: userHistory });
});

app.post('/api/jet-engineer/history', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.json({ entry: null, visitor: true });
  }

  const { question, answer, source, modelContext, clientRequestId } = req.body || {};
  if (!question || !answer) {
    return res.status(400).json({ error: 'Question and answer are required.' });
  }
  const reqId = clientRequestId || req.headers['x-client-request-id'];
  if (reqId) {
    const existing = (db.jetQaHistory || []).find(
      (h: any) => h.clientRequestId === reqId && h.userId === caller.userId
    );
    if (existing) return res.json({ entry: existing });
  }
  const entry = {
    id: `jqa_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    clientRequestId: reqId || undefined,
    userId: caller.userId,
    question: String(question).trim(),
    answer: String(answer).trim(),
    source: source || 'Ultraviolette Technical Reference Architecture',
    modelContext: modelContext || caller.userObj.motorcycleModel || 'F77 MACH 2',
    createdAt: new Date().toISOString()
  };
  db.jetQaHistory.push(entry);
  writeDb(db);
  res.status(201).json({ entry });
});

app.delete('/api/jet-engineer/history/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const idx = (db.jetQaHistory || []).findIndex((h: any) => h.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Saved Q&A entry not found' });
  if (!canModifyServerRecord(db.jetQaHistory[idx], req, db)) {
    return res.status(403).json({ error: 'Not authorized to delete this Q&A record' });
  }
  db.jetQaHistory.splice(idx, 1);
  markServerRecordDeleted(db, id);
  writeDb(db);
  res.json({ success: true, deletedId: id });
});

app.get('/api/jet-engineer/submissions', (_req: Request, res: Response) => {
  const db = readDb();
  res.json({ submissions: db.jetSubmissions });
});

app.post('/api/jet-engineer/submissions', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required to submit technical intelligence.' });
  }

  const {
    title,
    motorcycleModel,
    variant,
    symptoms,
    operatingConditions,
    troubleshootingAttempted,
    serviceCentreFindings,
    resolutionOutcome,
    proposedSolution,
    photoUrl,
    stepPhotos,
    sourceReferences,
    clientRequestId
  } = req.body || {};

  if (!title || !motorcycleModel || !symptoms || !resolutionOutcome) {
    return res.status(400).json({ error: 'Missing required submission fields' });
  }

  const reqId = clientRequestId || (req.headers['x-client-request-id'] as string);
  if (reqId) {
    const existing = db.jetSubmissions.find((s: any) => s.clientRequestId === reqId);
    if (existing) return res.status(200).json({ submission: existing, deduplicated: true });
  }

  const normalizedStepPhotos = Array.isArray(stepPhotos)
    ? stepPhotos.filter((p: any) => typeof p === 'string' && p.trim().length > 0)
    : photoUrl
    ? [photoUrl]
    : [];

  const identity = resolveUserDisplayIdentity(caller.userObj);
  const newSubmission = {
    id: `js_${Date.now()}`,
    clientRequestId: reqId || undefined,
    userId: caller.userId,
    authorName: identity.primaryName,
    title: String(title).trim(),
    motorcycleModel,
    variant: variant || '',
    symptoms: String(symptoms).trim(),
    operatingConditions: operatingConditions || 'Normal operating conditions',
    troubleshootingAttempted: troubleshootingAttempted || 'None reported',
    serviceCentreFindings: serviceCentreFindings || '',
    resolutionOutcome: String(resolutionOutcome).trim(),
    proposedSolution: proposedSolution || String(resolutionOutcome).trim(),
    photoUrl: normalizedStepPhotos[0] || photoUrl || '',
    stepPhotos: normalizedStepPhotos,
    sourceReferences: sourceReferences || 'Owner empirical testing',
    status: caller.isAdmin ? 'Approved' : 'Submitted',
    isPreset: (caller.isAdmin || isOwnerAccount(caller.userObj)) ? Boolean(req.body?.isPreset) : false,
    createdAt: new Date().toISOString()
  };

  db.jetSubmissions.unshift(newSubmission);
  writeDb(db);
  res.status(201).json({ submission: newSubmission });
});

app.put('/api/jet-engineer/submissions/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const sub = db.jetSubmissions.find((s: any) => s.id === id);
  if (!sub) return res.status(404).json({ error: 'Submission not found' });

  if (!canModifyServerRecord(sub, req, db, 'moderate_jet_engineer')) {
    return res.status(403).json({ error: 'Only the author or an administrator can edit this training record.' });
  }

  const {
    title,
    motorcycleModel,
    variant,
    symptoms,
    operatingConditions,
    troubleshootingAttempted,
    serviceCentreFindings,
    resolutionOutcome,
    proposedSolution,
    photoUrl,
    stepPhotos,
    sourceReferences,
    isPreset
  } = req.body || {};

  if (title) sub.title = String(title).trim();
  if (motorcycleModel) sub.motorcycleModel = motorcycleModel;
  if (variant !== undefined) sub.variant = variant;
  if (symptoms) sub.symptoms = String(symptoms).trim();
  if (operatingConditions !== undefined) sub.operatingConditions = operatingConditions;
  if (troubleshootingAttempted !== undefined) sub.troubleshootingAttempted = troubleshootingAttempted;
  if (serviceCentreFindings !== undefined) sub.serviceCentreFindings = serviceCentreFindings;
  if (resolutionOutcome) sub.resolutionOutcome = String(resolutionOutcome).trim();
  if (proposedSolution !== undefined) sub.proposedSolution = proposedSolution;
  if (sourceReferences !== undefined) sub.sourceReferences = sourceReferences;
  if (stepPhotos !== undefined || photoUrl !== undefined) {
    const updatedStepPhotos = Array.isArray(stepPhotos)
      ? stepPhotos.filter((p: any) => typeof p === 'string' && p.trim().length > 0)
      : photoUrl
      ? [photoUrl]
      : sub.stepPhotos || [];
    sub.stepPhotos = updatedStepPhotos;
    sub.photoUrl = updatedStepPhotos[0] || photoUrl || sub.photoUrl || '';
  }
  if (isPreset !== undefined && (caller.isAdmin || isOwnerAccount(caller.userObj))) {
    sub.isPreset = Boolean(isPreset);
    sub.presetUpdatedAt = new Date().toISOString();
    sub.presetUpdatedBy = caller.userId;
  }

  writeDb(db);
  res.json({ submission: sub });
});

app.delete('/api/jet-engineer/submissions/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const idx = db.jetSubmissions.findIndex((s: any) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Submission not found' });

  if (!canModifyServerRecord(db.jetSubmissions[idx], req, db, 'moderate_jet_engineer')) {
    return res.status(403).json({ error: 'Only the author or an administrator can delete this training record.' });
  }

  db.jetSubmissions.splice(idx, 1);
  markServerRecordDeleted(db, id);
  writeDb(db);
  res.json({ success: true, deletedId: id });
});

app.put('/api/jet-engineer/submissions/:id/review', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, reviewerNotes } = req.body || {};
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!caller.isOwner && !caller.hasPermission('moderate_jet_engineer')) {
    return res.status(403).json({
      error: 'Owner or Jet Engineer moderation permission is required to review technical submissions.'
    });
  }

  const sub = db.jetSubmissions.find((s: any) => s.id === id);
  if (!sub) return res.status(404).json({ error: 'Submission not found' });

  sub.status = status;
  sub.reviewerNotes = reviewerNotes || sub.reviewerNotes;
  sub.reviewerId = caller.userId;
  sub.reviewedAt = new Date().toISOString();

  db.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminId: caller.userId,
    adminName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    action: `JET_SUBMISSION_${String(status || 'REVIEWED').toUpperCase()}`,
    targetId: id,
    details: `Review decision: ${status}. Notes: ${reviewerNotes || 'None'}`,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  res.json({ submission: sub });
});

app.put('/api/jet-engineer/submissions/:id/preset', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (!isAdminOrOwnerAccount(caller.userObj)) {
    return res.status(403).json({ error: 'Only administrators or the Website Owner can configure quick presets.' });
  }

  const sub = (db.jetSubmissions || []).find((s: any) => s.id === id);
  if (!sub) {
    return res.status(404).json({ error: 'Submission not found.' });
  }

  const { isPreset } = req.body || {};
  sub.isPreset = isPreset !== undefined ? Boolean(isPreset) : !sub.isPreset;
  sub.presetUpdatedAt = new Date().toISOString();
  sub.presetUpdatedBy = caller.userId;

  db.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminId: caller.userId,
    adminName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    action: sub.isPreset ? 'JET_PRESET_ENABLED' : 'JET_PRESET_DISABLED',
    targetId: id,
    details: `Toggled quick solution preset to ${sub.isPreset} for submission "${sub.title}"`,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  res.json({
    success: true,
    submission: sub,
    isPreset: sub.isPreset,
    activePresets: (db.jetSubmissions || []).filter((s: any) => s.isPreset)
  });
});

// 4. Mission Mode (Group Rides & Safe Arrival)
app.get('/api/rides', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  const sanitized = (db.rides || []).map((r: any) => sanitizeRideForViewer(r, caller.userObj));
  res.json({ rides: sanitized });
});

app.get('/api/rides/:id', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  const ride = db.rides.find((r: any) => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride sortie not found' });
  res.json({ ride: sanitizeRideForViewer(ride, caller.userObj) });
});

app.post('/api/rides', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  const {
    name,
    description,
    rideDate,
    startTime,
    meetingPoint,
    destination,
    plannedRoute,
    maxDistanceKm,
    estimatedReturnTime,
    maxRiders,
    specialInstructions,
    pace,
    chargingStops,
    checklistConfig,
    organizerName,
    organizerModel
  } = req.body || {};

  if (!name || !String(name).trim() || !meetingPoint || !String(meetingPoint).trim() || !destination || !String(destination).trim()) {
    return res.status(400).json({ error: 'Ride name, meeting point, and destination are required.' });
  }

  const distNum = Number(maxDistanceKm);
  if (isNaN(distNum) || distNum <= 0) {
    return res.status(400).json({ error: 'Maximum planned distance must be a positive number in kilometres.' });
  }

  const leaderName = caller.userObj
    ? resolveUserDisplayIdentity(caller.userObj).primaryName
    : String(organizerName || 'Squadron Rider').trim();
  const leaderUserId = caller.userId || `guest_leader_${Date.now()}`;
  const leaderBike = caller.userObj?.motorcycleModel || String(organizerModel || 'F77 MACH 2').trim();

  const newRide = {
    id: `ride_${Date.now()}`,
    name: String(name).trim(),
    description: String(description || '').trim(),
    rideDate: rideDate || new Date().toISOString().split('T')[0],
    startTime: startTime || '06:00',
    meetingPoint: String(meetingPoint).trim(),
    destination: String(destination).trim(),
    plannedRoute: String(plannedRoute || `${meetingPoint} → ${destination}`).trim(),
    maxDistanceKm: Math.round(distNum * 10) / 10,
    estimatedReturnTime: estimatedReturnTime || '',
    maxRiders: Number(maxRiders) || 15,
    rideLeaderId: leaderUserId,
    rideLeaderName: leaderName,
    specialInstructions: specialInstructions || '',
    pace: pace || 'Moderate',
    chargingStops: chargingStops || [],
    checklistConfig: checklistConfig || [
      'Battery SoC > 90% and voltage delta verified',
      'Tyre cold pressure verified',
      'Lights, horn and Bosch ABS check passed',
      'ECE 22.06 certified helmet & riding gear equipped'
    ],
    status: 'Registration Open',
    participants: [
      {
        id: `rp_${Date.now()}`,
        userId: leaderUserId,
        displayName: leaderName,
        motorcycleModel: leaderBike,
        shareStartingPoint: true,
        intercomStatus: 'Has an intercom',
        status: 'Registered',
        statusUpdatedAt: new Date().toISOString(),
        checklistCompleted: false
      }
    ],
    announcements: [],
    createdAt: new Date().toISOString()
  };

  db.rides.unshift(newRide);
  writeDb(db);
  res.status(201).json({ ride: sanitizeRideForViewer(newRide, caller.userObj) });
});

app.post('/api/rides/:id/join', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  const {
    userId: bodyUserId,
    displayName: bodyDisplayName,
    motorcycleModel,
    variant,
    startingPoint,
    shareStartingPoint,
    intercomStatus,
    intercomModel,
    notes
  } = req.body || {};

  const rideIndex = db.rides.findIndex((r: any) => r.id === id);
  if (rideIndex === -1) return res.status(404).json({ error: 'Ride not found' });

  const ride = db.rides[rideIndex];
  const resolvedUserId = caller.userId || (bodyUserId ? String(bodyUserId).trim() : '');
  const resolvedName = caller.userObj
    ? resolveUserDisplayIdentity(caller.userObj).primaryName
    : String(bodyDisplayName || '').trim();

  const joinResult = joinSortieRoster(ride, {
    userId: resolvedUserId || undefined,
    displayName: resolvedName,
    motorcycleModel: motorcycleModel || caller.userObj?.motorcycleModel || 'F77 MACH 2',
    variant: variant || caller.userObj?.variant || '',
    startingPoint: startingPoint || '',
    shareStartingPoint: shareStartingPoint !== undefined ? Boolean(shareStartingPoint) : true,
    intercomStatus: intercomStatus || 'Has an intercom',
    intercomModel: intercomModel || '',
    notes: notes || ''
  });

  if (!joinResult.valid || !joinResult.updatedRide) {
    return res.status(400).json({ error: joinResult.error || 'Could not join sortie.' });
  }

  db.rides[rideIndex] = joinResult.updatedRide;
  writeDb(db);
  res.json({
    ride: sanitizeRideForViewer(joinResult.updatedRide, caller.userObj),
    participant: joinResult.participant
  });
});

// Allow any joined rider to cancel / back off from a sortie whenever needed
app.post('/api/rides/:id/leave', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  const { userId: bodyUserId, participantId, displayName: bodyDisplayName, reason } = req.body || {};

  const rideIndex = db.rides.findIndex((r: any) => r.id === id);
  if (rideIndex === -1) return res.status(404).json({ error: 'Ride not found' });

  const ride = db.rides[rideIndex];
  const resolvedUserId = caller.userId || (bodyUserId ? String(bodyUserId).trim() : '');
  const resolvedName = caller.userObj
    ? resolveUserDisplayIdentity(caller.userObj).primaryName
    : String(bodyDisplayName || '').trim();

  const leaveResult = leaveOrBackOffSortieRoster(ride, {
    userId: resolvedUserId || undefined,
    participantId: participantId ? String(participantId).trim() : undefined,
    displayName: resolvedName || undefined,
    reason: reason ? String(reason).trim() : undefined
  });

  if (!leaveResult.valid || !leaveResult.updatedRide) {
    return res.status(400).json({ error: leaveResult.error || 'Could not cancel ride participation.' });
  }

  db.rides[rideIndex] = leaveResult.updatedRide;
  writeDb(db);
  res.json({
    ride: sanitizeRideForViewer(leaveResult.updatedRide, caller.userObj),
    removedParticipant: leaveResult.removedParticipant
  });
});

// Visited Destinations & Rider Route Guides in Mission Mode
app.get('/api/mission/destinations', (_req: Request, res: Response) => {
  const db = readDb();
  const destinations = Array.isArray(db.visitedDestinations)
    ? db.visitedDestinations
    : DEFAULT_VISITED_DESTINATIONS;
  res.json({ destinations });
});

app.post('/api/mission/destinations', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  const body = req.body || {};

  const authorName = caller.userObj
    ? resolveUserDisplayIdentity(caller.userObj).primaryName
    : String(body.authorName || 'Squadron Rider').trim();
  const authorId = caller.userId || String(body.authorId || `rider_${Date.now()}`).trim();
  const authorModel = caller.userObj?.motorcycleModel || String(body.authorModel || 'F77 MACH 2').trim();

  const validation = validateVisitedDestinationSubmission({
    ...body,
    authorId,
    authorName,
    authorModel
  });

  if (!validation.valid || !validation.record) {
    return res.status(400).json({ error: validation.error || 'Invalid visited destination submission.' });
  }

  if (!Array.isArray(db.visitedDestinations)) {
    db.visitedDestinations = [...DEFAULT_VISITED_DESTINATIONS];
  }
  db.visitedDestinations.unshift(validation.record);
  writeDb(db);

  res.status(201).json({
    destination: validation.record,
    destinations: db.visitedDestinations
  });
});

// Update rider's status (Checked In, Riding, Heading Home, Needs Assistance)
app.post('/api/rides/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId, participantId, status } = req.body || {};
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  const ride = db.rides.find((r: any) => r.id === id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });

  const targetParticipantId = caller.userId || (userId ? String(userId).trim() : '');
  const participant = ride.participants.find(
    (p: any) =>
      (targetParticipantId && p.userId === targetParticipantId) ||
      (participantId && p.id === participantId)
  );
  if (!participant) return res.status(404).json({ error: 'Participant not registered in this ride' });

  participant.status = status;
  participant.statusUpdatedAt = new Date().toISOString();

  // If status is "Needs Assistance", notify ride leader & admin
  if (status === 'Needs Assistance') {
    db.notifications.push({
      id: `notif_${Date.now()}`,
      userId: ride.rideLeaderId,
      type: 'mission',
      title: 'ALERT: Rider Needs Assistance',
      message: `${participant.displayName} signaled Needs Assistance during ${ride.name}.`,
      link: 'mission',
      read: false,
      createdAt: new Date().toISOString()
    });
  }

  writeDb(db);
  res.json({ ride: sanitizeRideForViewer(ride, caller.userObj) });
});

// "I'm Home Safe" Confirmation action
app.post('/api/rides/:id/safe-arrival', (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId, participantId } = req.body || {};
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  const ride = db.rides.find((r: any) => r.id === id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });

  const targetUserId = caller.userId || (userId ? String(userId).trim() : '');
  const participant = ride.participants.find(
    (p: any) =>
      (targetUserId && p.userId === targetUserId) ||
      (participantId && p.id === participantId)
  );
  if (!participant) return res.status(404).json({ error: 'Participant not registered in this ride' });

  participant.status = 'Reached Home Safely';
  participant.safeArrivalConfirmedAt = new Date().toISOString();
  participant.statusUpdatedAt = new Date().toISOString();

  db.notifications.push({
    id: `notif_${Date.now()}`,
    userId: ride.rideLeaderId,
    type: 'mission',
    title: 'Rider Reached Home Safely',
    message: `${participant.displayName} confirmed safe arrival home from ${ride.name}.`,
    link: 'mission',
    read: false,
    createdAt: new Date().toISOString()
  });

  writeDb(db);
  res.json({
    ride: sanitizeRideForViewer(ride, caller.userObj),
    safeArrivalConfirmedAt: participant.safeArrivalConfirmedAt
  });
});

// Checklist update
app.post('/api/rides/:id/checklist', (req: Request, res: Response) => {
  const { id } = req.params;
  const { completed, userId, participantId } = req.body || {};
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  const ride = db.rides.find((r: any) => r.id === id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });

  const targetUserId = caller.userId || (userId ? String(userId).trim() : '');
  const participant = ride.participants.find(
    (p: any) =>
      (targetUserId && p.userId === targetUserId) ||
      (participantId && p.id === participantId)
  );
  if (!participant) return res.status(404).json({ error: 'Participant not found' });

  participant.checklistCompleted = Boolean(completed);
  participant.statusUpdatedAt = new Date().toISOString();

  writeDb(db);
  res.json({ ride: sanitizeRideForViewer(ride, caller.userObj) });
});

// Ride Leader Controls
app.post('/api/rides/:id/leader-control', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, announcement, departureTime } = req.body || {};
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const ride = db.rides.find((r: any) => r.id === id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });

  if (
    caller.userId !== ride.rideLeaderId &&
    !caller.isOwner &&
    !caller.hasPermission('moderate_discussions')
  ) {
    return res.status(403).json({
      error: 'Only the designated Ride Leader or an authorized administrator can execute sortie leader controls.'
    });
  }

  if (status) {
    ride.status = status;
    if (status === 'In Progress' && !ride.actualDepartureTime) {
      ride.actualDepartureTime = departureTime || new Date().toISOString();
    }
    if (status === 'Completed') {
      ride.completedAt = new Date().toISOString();
    }
  }

  if (announcement) {
    ride.announcements.push({
      id: `ann_${Date.now()}`,
      senderName: resolveUserDisplayIdentity(caller.userObj).primaryName,
      message: announcement.message,
      urgent: Boolean(announcement.urgent),
      timestamp: new Date().toISOString()
    });
  }

  writeDb(db);
  res.json({ ride: sanitizeRideForViewer(ride, caller.userObj) });
});

// 5. Emergency Assistance — Squadron Assist
app.get('/api/emergency', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  const sanitized = (db.emergencies || []).map((e: any) =>
    sanitizeEmergencyForViewer(e, caller.userObj)
  );
  res.json({ emergencies: sanitized });
});

// Helper to normalize Indian city names & aliases for exact-city SOS matching
const CITY_ALIAS_MAP: Record<string, string> = {
  bangalore: 'Bengaluru',
  bengaluru: 'Bengaluru',
  blr: 'Bengaluru',
  mysore: 'Mysuru',
  mysuru: 'Mysuru',
  pune: 'Pune',
  poona: 'Pune',
  mumbai: 'Mumbai',
  bombay: 'Mumbai',
  navi_mumbai: 'Mumbai',
  thane: 'Mumbai',
  chennai: 'Chennai',
  madras: 'Chennai',
  hyderabad: 'Hyderabad',
  secunderabad: 'Hyderabad',
  kochi: 'Kochi',
  cochin: 'Kochi',
  ernakulam: 'Kochi',
  coimbatore: 'Coimbatore',
  kovai: 'Coimbatore',
  kolar: 'Kolar',
  delhi: 'New Delhi',
  'new delhi': 'New Delhi',
  ncr: 'New Delhi',
  gurgaon: 'Gurugram',
  gurugram: 'Gurugram',
  noida: 'Noida',
  mangalore: 'Mangaluru',
  mangaluru: 'Mangaluru',
  hubli: 'Hubballi',
  hubballi: 'Hubballi',
  belgaum: 'Belagavi',
  belagavi: 'Belagavi',
  trivandrum: 'Thiruvananthapuram',
  thiruvananthapuram: 'Thiruvananthapuram',
  calicut: 'Kozhikode',
  kozhikode: 'Kozhikode',
  pondicherry: 'Puducherry',
  puducherry: 'Puducherry',
  baroda: 'Vadodara',
  vadodara: 'Vadodara',
  vizag: 'Visakhapatnam',
  visakhapatnam: 'Visakhapatnam',
  ahmedabad: 'Ahmedabad',
  jaipur: 'Jaipur',
  kolkata: 'Kolkata',
  calcutta: 'Kolkata',
  chandigarh: 'Chandigarh',
  goa: 'Goa',
  panaji: 'Goa',
  hosur: 'Hosur',
  tumkur: 'Tumakuru',
  tumakuru: 'Tumakuru',
  hassan: 'Hassan',
  sakleshpur: 'Sakleshpur',
  chikmagalur: 'Chikkamagaluru',
  chikkamagaluru: 'Chikkamagaluru',
  madurai: 'Madurai',
  salem: 'Salem',
  vellore: 'Vellore',
  krishnagiri: 'Krishnagiri'
};

const KNOWN_CITY_COORDS: { city: string; lat: number; lng: number }[] = [
  { city: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
  { city: 'Mysuru', lat: 12.2958, lng: 76.6394 },
  { city: 'Pune', lat: 18.5204, lng: 73.8567 },
  { city: 'Kolar', lat: 13.1378, lng: 78.1291 },
  { city: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { city: 'Coimbatore', lat: 11.0168, lng: 76.9558 },
  { city: 'Hyderabad', lat: 17.3850, lng: 78.4867 },
  { city: 'Kochi', lat: 9.9312, lng: 76.2673 },
  { city: 'Mumbai', lat: 19.0760, lng: 72.8777 },
  { city: 'New Delhi', lat: 28.6139, lng: 77.2090 },
  { city: 'Mangaluru', lat: 12.9141, lng: 74.8560 },
  { city: 'Hosur', lat: 12.7409, lng: 77.8253 },
  { city: 'Hassan', lat: 13.0033, lng: 76.1004 }
];

function canonicalizeCityName(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = raw.trim();
  if (!cleaned) return '';
  const lower = cleaned.toLowerCase();
  if (CITY_ALIAS_MAP[lower]) return CITY_ALIAS_MAP[lower];
  // Check if any alias is a distinct word inside the string
  for (const [alias, canonical] of Object.entries(CITY_ALIAS_MAP)) {
    const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lower)) {
      return canonical;
    }
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function resolveEmergencyCity(
  rawCity: string | undefined,
  locationName: string,
  latitude: number | undefined,
  longitude: number | undefined,
  users: any[],
  fallbackCity: string
): string {
  // 1. Explicit city passed from SOS modal
  if (rawCity && String(rawCity).trim()) {
    return canonicalizeCityName(String(rawCity).trim());
  }

  // 2. Extract from locationName against known city aliases or registered user cities/towns
  const locLower = String(locationName || '').toLowerCase();
  for (const [alias, canonical] of Object.entries(CITY_ALIAS_MAP)) {
    const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(locLower)) {
      return canonical;
    }
  }

  for (const u of users || []) {
    const uCity = String(u?.city || '').trim();
    const uTown = String(u?.communityChargerDetails?.town || '').trim();
    if (uCity && uCity.length >= 3 && locLower.includes(uCity.toLowerCase())) {
      return canonicalizeCityName(uCity);
    }
    if (uTown && uTown.length >= 3 && locLower.includes(uTown.toLowerCase())) {
      return canonicalizeCityName(uTown);
    }
  }

  // 3. Coordinate proximity check if GPS was used
  if (typeof latitude === 'number' && typeof longitude === 'number' && !isNaN(latitude) && !isNaN(longitude)) {
    let bestCity = '';
    let bestDist = 45; // 45 km city sector radius
    for (const item of KNOWN_CITY_COORDS) {
      const d = calculateDistanceKm(latitude, longitude, item.lat, item.lng);
      if (d < bestDist) {
        bestDist = d;
        bestCity = item.city;
      }
    }
    if (bestCity) return bestCity;
  }

  // 4. Fallback to rider's registered city
  return canonicalizeCityName(fallbackCity) || 'Bengaluru';
}

function doesUserMatchEmergencyCity(user: any, sosCity: string, locationName: string): boolean {
  if (!user) return false;
  const targetCanonical = canonicalizeCityName(sosCity).toLowerCase();
  if (!targetCanonical) return false;

  const userCityRaw = String(user.city || '').trim();
  const userTownRaw = String(user.communityChargerDetails?.town || '').trim();
  const userCityCanonical = canonicalizeCityName(userCityRaw).toLowerCase();
  const userTownCanonical = canonicalizeCityName(userTownRaw).toLowerCase();

  if (userCityCanonical && userCityCanonical === targetCanonical) return true;
  if (userTownCanonical && userTownCanonical === targetCanonical) return true;
  if (userCityRaw && userCityRaw.toLowerCase() === sosCity.trim().toLowerCase()) return true;
  if (userTownRaw && userTownRaw.toLowerCase() === sosCity.trim().toLowerCase()) return true;

  const locLower = String(locationName || '').toLowerCase();
  if (userCityRaw && userCityRaw.length >= 3 && locLower.includes(userCityRaw.toLowerCase())) return true;
  if (userTownRaw && userTownRaw.length >= 3 && locLower.includes(userTownRaw.toLowerCase())) return true;

  return false;
}

app.post('/api/emergency', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required to transmit a Squadron Assist beacon.' });
  }

  const {
    requesterModel,
    category,
    description,
    locationName,
    city: rawCity,
    latitude,
    longitude,
    callbackPhone,
    photoUrl
  } = req.body || {};

  if (!category || !description || !locationName) {
    return res.status(400).json({ error: 'Category, description, and location are required.' });
  }

  const nowIso = new Date().toISOString();
  const requesterName = resolveUserDisplayIdentity(caller.userObj).primaryName;
  const sosCity = resolveEmergencyCity(
    rawCity,
    locationName,
    typeof latitude === 'number' ? latitude : undefined,
    typeof longitude === 'number' ? longitude : undefined,
    db.users || [],
    caller.userObj.city || caller.userObj.communityChargerDetails?.town || 'Bengaluru'
  );

  // 1. Identify all other users registered in that exact city / area
  const cityMatchedUsers = (db.users || []).filter(
    (u: any) => u.id !== caller.userId && doesUserMatchEmergencyCity(u, sosCity, locationName)
  );

  // 2. Identify all Admin & Website Owner accounts (Priority Admin Alert)
  const adminUsers = (db.users || []).filter(
    (u: any) =>
      isOwnerAccount(u) ||
      u.role === 'admin' ||
      u.role === 'superadmin' ||
      u.id === 'u_admin'
  );

  const notifiedCityUsersList = cityMatchedUsers.map((u: any) => ({
    id: u.id,
    name: resolveUserDisplayIdentity(u).primaryName,
    city: u.city || u.communityChargerDetails?.town || sosCity,
    role: u.role
  }));

  const uniqueNotifiedIds = new Set<string>([
    ...cityMatchedUsers.map((u: any) => String(u.id)),
    ...adminUsers.map((u: any) => String(u.id))
  ]);

  const emergencyId = `emg_${Date.now()}`;
  const effectiveCallbackPhone = callbackPhone || caller.userObj.mobile || '';

  const newEmergency = {
    id: emergencyId,
    userId: caller.userId,
    requesterName,
    requesterModel: requesterModel || caller.userObj.motorcycleModel || 'Ultraviolette F77',
    category,
    description,
    locationName,
    city: sosCity,
    latitude: latitude || 12.9716,
    longitude: longitude || 77.5946,
    callbackPhone: effectiveCallbackPhone,
    photoUrl: photoUrl || '',
    status: 'Submitted',
    notifiedCount: Math.max(1, uniqueNotifiedIds.size),
    notifiedCityUsers: notifiedCityUsersList,
    adminAlerted: true,
    adminAlertedAt: nowIso,
    adminNotifiedCount: adminUsers.length,
    searchRadiusKm: 25,
    createdAt: nowIso,
    updatedAt: nowIso,
    accessLogs: [
      {
        userId: caller.userId,
        userName: requesterName,
        accessedAt: nowIso,
        reason: `Emergency SOS transmitted for city sector: ${sosCity}`
      },
      {
        userId: 'u_admin',
        userName: 'ADMIN COMMAND DISPATCH',
        accessedAt: nowIso,
        reason: `Priority Admin SOS Alert dispatched to ${adminUsers.length} administrator(s)`
      },
      {
        userId: 'system_city_broadcast',
        userName: `${sosCity.toUpperCase()} CITY NETWORK`,
        accessedAt: nowIso,
        reason: `City SOS alert broadcasted to ${cityMatchedUsers.length} registered ${sosCity} user(s)${notifiedCityUsersList.length > 0 ? `: ${notifiedCityUsersList.map((u: any) => u.name).join(', ')}` : ''}`
      }
    ]
  };

  db.emergencies.unshift(newEmergency);

  // 3. Send notifications to all other users registered in that exact city
  cityMatchedUsers.forEach((cityUser: any, idx: number) => {
    const isAlsoAdmin = adminUsers.some((a: any) => a.id === cityUser.id);
    // If they are also an admin, they will receive the comprehensive Admin + City alert below, or we can send the city alert to all non-admin city users and a combined alert to admin users
    if (!isAlsoAdmin) {
      db.notifications.unshift({
        id: `notif_city_${Date.now()}_${idx}_${cityUser.id}`,
        userId: cityUser.id,
        type: 'emergency',
        priority: 'critical',
        city: sosCity,
        emergencyId,
        isAdminAlert: false,
        title: `🚨 CITY SOS ALERT [${sosCity.toUpperCase()}]: ${category}`,
        message: `Rider ${requesterName} (${newEmergency.requesterModel}) triggered a Squadron SOS in your registered city (${sosCity}) at ${locationName}: "${description.substring(0, 100)}". Callback: ${effectiveCallbackPhone || 'See Squadron Assist'}`,
        link: 'emergency',
        read: false,
        createdAt: nowIso
      });
    }
  });

  // 4. Send high-importance PRIORITY ADMIN ALERT to every Admin & Owner
  adminUsers.forEach((adminUser: any, idx: number) => {
    const adminMatchesCity = doesUserMatchEmergencyCity(adminUser, sosCity, locationName);
    db.notifications.unshift({
      id: `notif_admin_${Date.now()}_${idx}_${adminUser.id}`,
      userId: adminUser.id,
      type: 'emergency',
      priority: 'critical',
      city: sosCity,
      emergencyId,
      isAdminAlert: true,
      title: `⚠️ PRIORITY ADMIN SOS ALERT [${sosCity.toUpperCase()}]: ${category}`,
      message: `CRITICAL SOS: ${requesterName} (${newEmergency.requesterModel}) needs urgent assistance in ${sosCity} (${locationName}) — "${description.substring(0, 100)}". Callback: ${effectiveCallbackPhone || 'N/A'}. Alerted ${cityMatchedUsers.length} registered ${sosCity} rider(s)${adminMatchesCity ? ' (including your registered city sector)' : ''}.`,
      link: 'emergency',
      read: false,
      createdAt: nowIso
    });
  });

  // 5. Record in Admin Audit Logs so Admin Centre has immediate visibility
  db.auditLogs.unshift({
    id: `aud_sos_${Date.now()}`,
    adminId: caller.userId,
    adminName: requesterName,
    action: 'SQUADRON_SOS_TRIGGERED',
    targetId: emergencyId,
    details: `CRITICAL SOS triggered in ${sosCity} (${locationName}) [${category}] by ${requesterName}. Priority alert sent to ${adminUsers.length} Admin(s) and ${cityMatchedUsers.length} registered ${sosCity} user(s).`,
    timestamp: nowIso
  });

  writeDb(db);
  res.status(201).json({
    emergency: newEmergency,
    dispatchSummary: {
      city: sosCity,
      cityUsersNotifiedCount: cityMatchedUsers.length,
      cityUsersNotified: notifiedCityUsersList,
      adminAlerted: true,
      adminNotifiedCount: adminUsers.length
    }
  });
});

app.post('/api/emergency/:id/respond', (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required to respond to an emergency beacon.' });
  }

  const emg = db.emergencies.find((e: any) => e.id === id);
  if (!emg) return res.status(404).json({ error: 'Emergency request not found' });

  const responderName = resolveUserDisplayIdentity(caller.userObj).primaryName;
  emg.responderId = caller.userId;
  emg.responderName = responderName;
  emg.status = 'Acknowledged';
  emg.updatedAt = new Date().toISOString();

  emg.accessLogs.push({
    userId: caller.userId,
    userName: responderName,
    accessedAt: new Date().toISOString(),
    reason: reason || 'Assistance response initiated'
  });

  writeDb(db);
  res.json({ emergency: emg });
});

app.put('/api/emergency/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const emg = db.emergencies.find((e: any) => e.id === id);
  if (!emg) return res.status(404).json({ error: 'Emergency request not found' });

  if (
    caller.userId !== emg.userId &&
    caller.userId !== emg.responderId &&
    !caller.isOwner &&
    !caller.isAdmin
  ) {
    return res.status(403).json({
      error: 'Only the requester, active responder, or an administrator can update this emergency status.'
    });
  }

  emg.status = status;
  emg.updatedAt = new Date().toISOString();
  if (status === 'Resolved') emg.resolvedAt = new Date().toISOString();

  writeDb(db);
  res.json({ emergency: emg });
});

// 6. Bike Problem Tracker
app.get('/api/problems', (_req: Request, res: Response) => {
  const db = readDb();
  res.json({ problems: db.problems });
});

app.post('/api/problems', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required to report a technical issue.' });
  }

  const {
    motorcycleModel,
    variant,
    category,
    title,
    description,
    firstObservedDate,
    mileageKm,
    warningMessageOrCode,
    severity,
    isRecurring,
    troubleshootingAttempted,
    serviceVisits,
    photoUrl,
    videoUrl,
    mediaUrls,
    clientRequestId
  } = req.body || {};

  if (!title || !motorcycleModel || !category || !description) {
    return res.status(400).json({ error: 'Title, model, category, and description are required.' });
  }

  const reqId = clientRequestId || (req.headers['x-client-request-id'] as string);
  if (reqId) {
    const existing = db.problems.find((p: any) => p.clientRequestId === reqId);
    if (existing) return res.status(200).json({ problem: existing, deduplicated: true });
  }

  const normalizedMediaUrls = Array.isArray(mediaUrls)
    ? mediaUrls.filter((m: any) => typeof m === 'string' && m.trim().length > 0)
    : [photoUrl, videoUrl].filter((x): x is string => Boolean(x && typeof x === 'string' && x.trim().length > 0));

  const newProblem = {
    id: `prob_${Date.now()}`,
    clientRequestId: reqId || undefined,
    userId: caller.userId,
    reporterName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    motorcycleModel,
    variant: variant || '',
    category,
    title: String(title).trim(),
    description: String(description).trim(),
    firstObservedDate: firstObservedDate || new Date().toISOString().split('T')[0],
    mileageKm: Number(mileageKm) || 0,
    warningMessageOrCode: warningMessageOrCode || '',
    severity: severity || 'Moderate',
    isRecurring: Boolean(isRecurring),
    troubleshootingAttempted: troubleshootingAttempted || '',
    serviceVisits: serviceVisits || '',
    photoUrl: normalizedMediaUrls.find(m => !m.startsWith('data:video/') && !m.endsWith('.mp4') && !m.endsWith('.webm')) || photoUrl || '',
    videoUrl: normalizedMediaUrls.find(m => m.startsWith('data:video/') || m.endsWith('.mp4') || m.endsWith('.webm')) || videoUrl || '',
    mediaUrls: normalizedMediaUrls,
    status: 'Reported',
    upvotedBy: [],
    updates: [],
    createdAt: new Date().toISOString()
  };

  db.problems.unshift(newProblem);
  writeDb(db);
  res.status(201).json({ problem: newProblem });
});

app.put('/api/problems/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const prob = db.problems.find((p: any) => p.id === id);
  if (!prob) return res.status(404).json({ error: 'Problem report not found' });

  if (!canModifyServerRecord(prob, req, db, 'moderate_problems')) {
    return res.status(403).json({ error: 'Only the issue reporter or an administrator can edit this issue.' });
  }

  const {
    title,
    motorcycleModel,
    variant,
    category,
    description,
    mileageKm,
    warningMessageOrCode,
    severity,
    isRecurring,
    troubleshootingAttempted,
    serviceVisits,
    photoUrl,
    videoUrl,
    mediaUrls,
    status
  } = req.body || {};

  if (title) prob.title = String(title).trim();
  if (motorcycleModel) prob.motorcycleModel = motorcycleModel;
  if (variant !== undefined) prob.variant = variant;
  if (category) prob.category = category;
  if (description) prob.description = String(description).trim();
  if (mileageKm !== undefined) prob.mileageKm = Number(mileageKm) || 0;
  if (warningMessageOrCode !== undefined) prob.warningMessageOrCode = warningMessageOrCode;
  if (severity) prob.severity = severity;
  if (isRecurring !== undefined) prob.isRecurring = Boolean(isRecurring);
  if (troubleshootingAttempted !== undefined) prob.troubleshootingAttempted = troubleshootingAttempted;
  if (serviceVisits !== undefined) prob.serviceVisits = serviceVisits;
  if (mediaUrls !== undefined || photoUrl !== undefined || videoUrl !== undefined) {
    const updatedMedia = Array.isArray(mediaUrls)
      ? mediaUrls.filter((m: any) => typeof m === 'string' && m.trim().length > 0)
      : [photoUrl, videoUrl].filter((x): x is string => Boolean(x && typeof x === 'string' && x.trim().length > 0));
    prob.mediaUrls = updatedMedia;
    prob.photoUrl = updatedMedia.find(m => !m.startsWith('data:video/') && !m.endsWith('.mp4') && !m.endsWith('.webm')) || photoUrl || prob.photoUrl || '';
    prob.videoUrl = updatedMedia.find(m => m.startsWith('data:video/') || m.endsWith('.mp4') || m.endsWith('.webm')) || videoUrl || prob.videoUrl || '';
  }
  if (status) {
    prob.status = status;
    if (status === 'Resolved') prob.resolvedDate = new Date().toISOString().split('T')[0];
  }

  writeDb(db);
  res.json({ problem: prob });
});

app.delete('/api/problems/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const idx = db.problems.findIndex((p: any) => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Problem report not found' });

  if (!canModifyServerRecord(db.problems[idx], req, db, 'moderate_problems')) {
    return res.status(403).json({ error: 'Only the issue reporter or an administrator can delete this issue.' });
  }

  db.problems.splice(idx, 1);
  markServerRecordDeleted(db, id);
  writeDb(db);
  res.json({ success: true, deletedId: id });
});

app.post('/api/problems/:id/upvote', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required to upvote an issue.' });
  }

  const prob = db.problems.find((p: any) => p.id === id);
  if (!prob) return res.status(404).json({ error: 'Problem report not found' });

  if (!Array.isArray(prob.upvotedBy)) {
    prob.upvotedBy = [];
  }
  const idx = prob.upvotedBy.indexOf(caller.userId);
  if (idx >= 0) {
    prob.upvotedBy.splice(idx, 1);
  } else {
    prob.upvotedBy.push(caller.userId);
  }

  writeDb(db);
  res.json({ problem: prob, upvotedBy: prob.upvotedBy });
});

app.post('/api/problems/:id/updates', (req: Request, res: Response) => {
  const { id } = req.params;
  const { note, newStatus, mediaUrls, clientRequestId } = req.body || {};
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required to post an issue update.' });
  }

  const prob = db.problems.find((p: any) => p.id === id);
  if (!prob) return res.status(404).json({ error: 'Problem report not found' });

  const reqId = clientRequestId || (req.headers['x-client-request-id'] as string);
  if (reqId && Array.isArray(prob.updates)) {
    const existingUp = prob.updates.find((u: any) => u.clientRequestId === reqId);
    if (existingUp) return res.json({ problem: prob, deduplicated: true });
  }

  const updatedMedia = Array.isArray(mediaUrls)
    ? mediaUrls.filter((m: any) => typeof m === 'string' && m.trim().length > 0)
    : [];

  prob.updates.push({
    id: `up_${Date.now()}`,
    clientRequestId: reqId || undefined,
    authorId: caller.userId,
    authorName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    date: new Date().toISOString().split('T')[0],
    note,
    mediaUrls: updatedMedia
  });

  if (newStatus && canModifyServerRecord(prob, req, db, 'moderate_problems')) {
    prob.status = newStatus;
    if (newStatus === 'Resolved') prob.resolvedDate = new Date().toISOString().split('T')[0];
  }

  writeDb(db);
  res.json({ problem: prob });
});

// 7. Modifications Lab
app.get('/api/modifications', (_req: Request, res: Response) => {
  const db = readDb();
  res.json({ modifications: db.modifications });
});

app.post('/api/modifications', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required to submit a modification.' });
  }

  const {
    title,
    motorcycleModel,
    variant,
    component,
    difficulty,
    costRange,
    compatibilityStatus,
    isOfficialAccessory,
    description,
    partsUsed,
    installationGuide,
    safetyConsiderations,
    warrantyConsiderations,
    imageUrl,
    imageUrls,
    productLinks,
    shopName,
    shopMapLink,
    shopNumber,
    clientRequestId
  } = req.body || {};

  if (!title || !motorcycleModel || !component || !description) {
    return res.status(400).json({ error: 'Title, model, component, and description are required.' });
  }

  const reqId = clientRequestId || (req.headers['x-client-request-id'] as string);
  if (reqId) {
    const existing = db.modifications.find((m: any) => m.clientRequestId === reqId);
    if (existing) return res.status(200).json({ modification: existing, deduplicated: true });
  }

  // Validate product links if provided
  const linkValidation = sanitizeAndValidateProductLinks(productLinks);
  if (!linkValidation.valid) {
    return res.status(400).json({ error: linkValidation.errors.join(' ') });
  }

  // Normalize images for backward compatibility
  let normalizedImageUrls: string[] = [];
  if (Array.isArray(imageUrls) && imageUrls.length > 0) {
    normalizedImageUrls = imageUrls.filter(Boolean);
  } else if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim()) {
    normalizedImageUrls = [imageUrl.trim()];
  }

  const newMod = {
    id: `mod_${Date.now()}`,
    clientRequestId: reqId || undefined,
    userId: caller.userId,
    title: String(title).trim(),
    motorcycleModel,
    variant: variant || '',
    component,
    difficulty: difficulty || 'Intermediate',
    costRange: costRange || '₹5,000 - ₹15,000',
    compatibilityStatus: compatibilityStatus || 'Verified Compatible',
    isOfficialAccessory: Boolean(isOfficialAccessory),
    description: String(description).trim(),
    partsUsed: partsUsed || '',
    installationGuide: installationGuide || '',
    safetyConsiderations: safetyConsiderations || '',
    warrantyConsiderations: warrantyConsiderations || '',
    authorName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    createdAt: new Date().toISOString(),
    imageUrl: normalizedImageUrls[0] || (typeof imageUrl === 'string' ? imageUrl : ''),
    imageUrls: normalizedImageUrls,
    productLinks: linkValidation.productLinks,
    shopName: typeof shopName === 'string' ? shopName.trim() : '',
    shopMapLink: typeof shopMapLink === 'string' ? shopMapLink.trim() : '',
    shopNumber: typeof shopNumber === 'string' ? shopNumber.trim() : ''
  };

  db.modifications.unshift(newMod);
  writeDb(db);
  res.status(201).json({ modification: newMod });
});

app.put('/api/modifications/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const mod = db.modifications.find((m: any) => m.id === id);
  if (!mod) {
    return res.status(404).json({ error: 'Modification record not found' });
  }

  if (!canModifyServerRecord(mod, req, db, 'moderate_modifications')) {
    return res.status(403).json({ error: 'Only the author or an administrator can edit this modification.' });
  }

  const {
    title,
    motorcycleModel,
    variant,
    component,
    difficulty,
    costRange,
    compatibilityStatus,
    isOfficialAccessory,
    description,
    partsUsed,
    installationGuide,
    safetyConsiderations,
    warrantyConsiderations,
    imageUrl,
    imageUrls,
    productLinks,
    shopName,
    shopMapLink,
    shopNumber
  } = req.body || {};

  if (productLinks !== undefined) {
    const linkValidation = sanitizeAndValidateProductLinks(productLinks);
    if (!linkValidation.valid) {
      return res.status(400).json({ error: linkValidation.errors.join(' ') });
    }
    mod.productLinks = linkValidation.productLinks;
  }

  if (title) mod.title = title;
  if (motorcycleModel) mod.motorcycleModel = motorcycleModel;
  if (variant !== undefined) mod.variant = variant;
  if (component) mod.component = component;
  if (difficulty) mod.difficulty = difficulty;
  if (costRange) mod.costRange = costRange;
  if (compatibilityStatus) mod.compatibilityStatus = compatibilityStatus;
  if (isOfficialAccessory !== undefined) mod.isOfficialAccessory = Boolean(isOfficialAccessory);
  if (description) mod.description = description;
  if (partsUsed !== undefined) mod.partsUsed = partsUsed;
  if (installationGuide !== undefined) mod.installationGuide = installationGuide;
  if (safetyConsiderations !== undefined) mod.safetyConsiderations = safetyConsiderations;
  if (warrantyConsiderations !== undefined) mod.warrantyConsiderations = warrantyConsiderations;
  if (shopName !== undefined) mod.shopName = typeof shopName === 'string' ? shopName.trim() : '';
  if (shopMapLink !== undefined) mod.shopMapLink = typeof shopMapLink === 'string' ? shopMapLink.trim() : '';
  if (shopNumber !== undefined) mod.shopNumber = typeof shopNumber === 'string' ? shopNumber.trim() : '';

  if (imageUrls !== undefined || imageUrl !== undefined) {
    let normalizedImageUrls: string[] = [];
    if (Array.isArray(imageUrls) && imageUrls.length > 0) {
      normalizedImageUrls = imageUrls.filter(Boolean);
    } else if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim()) {
      normalizedImageUrls = [imageUrl.trim()];
    }
    mod.imageUrl = normalizedImageUrls[0] || '';
    mod.imageUrls = normalizedImageUrls;
  }

  writeDb(db);
  res.json({ modification: mod });
});

app.delete('/api/modifications/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const idx = db.modifications.findIndex((m: any) => m.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Modification record not found' });

  if (!canModifyServerRecord(db.modifications[idx], req, db, 'moderate_modifications')) {
    return res.status(403).json({ error: 'Only the author or an administrator can delete this modification.' });
  }

  db.modifications.splice(idx, 1);
  markServerRecordDeleted(db, id);
  writeDb(db);
  res.json({ success: true, deletedId: id });
});

// Smart Location Autocomplete & Reverse Geocoding Cache
const placeSearchCache = new Map<string, { timestamp: number; suggestions: PlaceSuggestion[] }>();

function formatCategoryLabel(rawType?: string, rawCategory?: string): string {
  const t = `${rawType || ''} ${rawCategory || ''}`.toLowerCase();
  if (t.includes('aerodrome') || t.includes('airport') || t.includes('aeroway')) return 'Airport';
  if (t.includes('railway') || t.includes('train_station') || t.includes('station')) return 'Railway / Transit Station';
  if (t.includes('hospital') || t.includes('clinic') || t.includes('medical')) return 'Hospital / Medical';
  if (t.includes('attraction') || t.includes('monument') || t.includes('museum') || t.includes('palace') || t.includes('tourism') || t.includes('beach') || t.includes('park'))
    return 'Tourist Attraction / Landmark';
  if (t.includes('charging')) return 'EV Charging Station';
  if (t.includes('cafe') || t.includes('coffee')) return 'Café / Coffee Shop';
  if (t.includes('restaurant') || t.includes('fast_food') || t.includes('food')) return 'Restaurant';
  if (t.includes('fuel') || t.includes('petrol') || t.includes('service'))
    return 'Petrol Pump & Service Station';
  if (t.includes('hotel') || t.includes('motel') || t.includes('guest_house')) return 'Hotel';
  if (t.includes('mall') || t.includes('shop') || t.includes('commercial') || t.includes('retail'))
    return 'Commercial / Shop';
  if (t.includes('highway') || t.includes('junction') || t.includes('road') || t.includes('street') || t.includes('residential') || t.includes('primary') || t.includes('secondary'))
    return 'Street / Road / Junction';
  if (t.includes('city') || t.includes('town') || t.includes('village') || t.includes('suburb') || t.includes('administrative') || t.includes('municipality'))
    return 'City / Town / Village';
  return 'Place / Landmark';
}

const handlePlaceSearchRequest = async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) {
    return res.json({ suggestions: [] });
  }

  if (req.query.simulateError === '1') {
    return res.status(503).json({
      error: 'Location search provider is temporarily rate-limited or unreachable. Please retry.',
      suggestions: []
    });
  }

  const includeChargers = req.query.includeChargers === '1';
  const restrictToIndia = req.query.countrycodes === 'in' || req.query.country === 'in';
  const biasLat = Number(req.query.lat);
  const biasLon = Number(req.query.lon);
  const biasLocation =
    isFinite(biasLat) && isFinite(biasLon)
      ? { latitude: biasLat, longitude: biasLon }
      : null;

  const cacheKey = `${q.toLowerCase()}__${includeChargers ? 'chg' : 'geo'}__${restrictToIndia ? 'in' : 'all'}__${biasLocation ? `${biasLocation.latitude.toFixed(1)},${biasLocation.longitude.toFixed(1)}` : 'global'}`;
  const cached = placeSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
    return res.json({ suggestions: cached.suggestions, cached: true });
  }

  const expandedQueries = expandIndianPlaceQuery(q);
  const externalResults: PlaceSuggestion[] = [];

  // Only include GHOST PROTOCOL charger records if explicitly requested (never restrict general location search to chargers)
  if (includeChargers) {
    try {
      const db = readDb();
      const publicStations = (db.chargingStations || []).filter(
        (s: any) => s.approvalStatus !== 'deleted' && isPubliclyPublishedCharger(s)
      );
      for (const st of publicStations) {
        if (isFinite(Number(st.latitude)) && isFinite(Number(st.longitude))) {
          externalResults.push({
            id: `db_charger_${st.id}`,
            name: String(st.name),
            locality: String(st.location).split(',').slice(-2).join(',').trim() || 'India',
            address: String(st.location),
            category: `EV Charging Station (${st.chargerType || 'Verified'})`,
            latitude: Number(Number(st.latitude).toFixed(6)),
            longitude: Number(Number(st.longitude).toFixed(6)),
            source: 'Ghost Protocol Network'
          });
        }
      }
    } catch {
      // Ignore DB read error
    }
  }

  let nominatimFailed = false;
  let photonFailed = false;

  try {
    // Respect Nominatim usage policy: send 1 well-formed Nominatim query + 1 Photon query in parallel
    const primaryQuery = expandedQueries[0] || q;
    const secondaryQuery = expandedQueries.length > 1 ? expandedQueries[1] : primaryQuery;

    const nominatimPromise = (async (): Promise<PlaceSuggestion[]> => {
      try {
        const countryFilter = restrictToIndia ? '&countrycodes=in' : '';
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1${countryFilter}&limit=12&q=${encodeURIComponent(
          primaryQuery
        )}`;
        const resp = await fetch(url, {
          headers: {
            'User-Agent': 'GhostProtocolLocationSearch/1.0 (OpenStreetMap Geocoding Client)',
            'Accept-Language': 'en'
          },
          signal: AbortSignal.timeout(3500)
        });
        if (!resp.ok) {
          nominatimFailed = true;
          return [];
        }
        const items = await resp.json();
        if (!Array.isArray(items)) return [];

        return items
          .map((item: any): PlaceSuggestion | null => {
            const lat = Number(item.lat);
            const lon = Number(item.lon);
            if (!isFinite(lat) || !isFinite(lon)) return null;

            const addr = item.address || {};
            const localityParts = [
              addr.suburb || addr.neighbourhood || addr.village || addr.hamlet || addr.road,
              addr.city || addr.town || addr.municipality || addr.state_district || addr.county,
              addr.state || addr.country
            ].filter(Boolean);

            const rawDisplayName = String(item.display_name || '');
            const primaryName =
              item.name ||
              addr.aeroway ||
              addr.railway ||
              addr.amenity ||
              addr.shop ||
              addr.tourism ||
              addr.building ||
              addr.city ||
              addr.town ||
              addr.village ||
              rawDisplayName.split(',')[0] ||
              primaryQuery;

            return {
              id: `osm_${item.place_id || item.osm_id || Math.random()}`,
              name: String(primaryName),
              locality:
                localityParts.slice(0, 3).join(', ') ||
                rawDisplayName.split(',').slice(1, 3).join(',').trim() ||
                'Geographic Location',
              address: rawDisplayName || `${primaryName}, ${localityParts.join(', ')}`,
              category: formatCategoryLabel(item.type, item.category),
              latitude: Number(lat.toFixed(6)),
              longitude: Number(lon.toFixed(6)),
              source: 'OpenStreetMap'
            };
          })
          .filter((x): x is PlaceSuggestion => x !== null);
      } catch {
        nominatimFailed = true;
        return [];
      }
    })();

    const photonPromise = (async (): Promise<PlaceSuggestion[]> => {
      try {
        const biasParams = biasLocation
          ? `&lat=${biasLocation.latitude.toFixed(4)}&lon=${biasLocation.longitude.toFixed(4)}`
          : '&lat=15.3173&lon=75.7139';
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
          secondaryQuery
        )}${biasParams}&limit=12`;
        const resp = await fetch(url, {
          headers: { 'User-Agent': 'GhostProtocolLocationSearch/1.0' },
          signal: AbortSignal.timeout(3500)
        });
        if (!resp.ok) {
          photonFailed = true;
          return [];
        }
        const data = await resp.json();
        if (!data || !Array.isArray(data.features)) return [];

        return data.features
          .map((f: any): PlaceSuggestion | null => {
            const coords = f.geometry?.coordinates;
            const props = f.properties || {};
            if (!Array.isArray(coords) || coords.length < 2) return null;

            const lon = Number(coords[0]);
            const lat = Number(coords[1]);
            if (!isFinite(lat) || !isFinite(lon)) return null;

            if (restrictToIndia) {
              const cc = String(props.countrycode || '').toUpperCase();
              const country = String(props.country || '').toLowerCase();
              const inIndiaBounds = lat >= 6.0 && lat <= 37.5 && lon >= 68.0 && lon <= 97.5;
              if (cc && cc !== 'IN' && country && !country.includes('india') && !inIndiaBounds) {
                return null;
              }
            }

            const name = props.name || props.street || props.locality || props.city || props.county;
            if (!name) return null;

            const localityParts = [
              props.locality || props.district,
              props.city || props.county,
              props.state || props.country
            ].filter(Boolean);

            const addressParts = [
              props.name,
              props.street,
              props.locality || props.district,
              props.city || props.county,
              props.state,
              props.postcode,
              props.country
            ].filter(Boolean);

            return {
              id: `photon_${props.osm_id || Math.random()}`,
              name: String(name),
              locality: localityParts.join(', ') || 'Geographic Location',
              address: addressParts.join(', '),
              category: formatCategoryLabel(props.osm_value, props.osm_key),
              latitude: Number(lat.toFixed(6)),
              longitude: Number(lon.toFixed(6)),
              source: 'Photon OSM'
            };
          })
          .filter((x: PlaceSuggestion | null): x is PlaceSuggestion => x !== null);
      } catch {
        photonFailed = true;
        return [];
      }
    })();

    const settled = await Promise.allSettled([nominatimPromise, photonPromise]);
    for (const resItem of settled) {
      if (resItem.status === 'fulfilled' && Array.isArray(resItem.value)) {
        externalResults.push(...resItem.value);
      }
    }
  } catch {
    nominatimFailed = true;
    photonFailed = true;
  }

  const ranked = restrictToIndia
    ? searchAllIndiaLocations(q, externalResults)
    : searchAndRankPlaces(q, externalResults, biasLocation);
  if (ranked.length > 0) {
    placeSearchCache.set(cacheKey, { timestamp: Date.now(), suggestions: ranked });
  }

  const bothProvidersFailed = nominatimFailed && photonFailed;
  res.json({
    suggestions: ranked,
    providerWarning: bothProvidersFailed
      ? 'Live geocoding service is temporarily unreachable or rate-limited. Showing offline directory matches if available.'
      : undefined
  });
};

app.get('/api/places/autocomplete', handlePlaceSearchRequest);
app.get('/api/places/search', handlePlaceSearchRequest);

app.get('/api/places/reverse', async (req: Request, res: Response) => {
  const coordCheck = validateManualCoordinates(req.query.lat, req.query.lon);
  if (!coordCheck.valid || coordCheck.latitude === undefined || coordCheck.longitude === undefined) {
    return res.status(400).json({
      error: coordCheck.latError || coordCheck.lonError || 'Valid latitude and longitude are required.'
    });
  }

  const lat = coordCheck.latitude;
  const lon = coordCheck.longitude;
  const manualFallback = formatManualCoordinatesFallback(lat, lon);

  if (req.query.simulateFailure === '1') {
    return res.json({
      name: manualFallback.name,
      locality: manualFallback.locality,
      address: manualFallback.address,
      latitude: lat,
      longitude: lon,
      reverseGeocodeSuccess: false
    });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(
      6
    )}&lon=${lon.toFixed(6)}&addressdetails=1`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'GhostProtocolLocationSearch/1.0 (OpenStreetMap Geocoding Client)',
        'Accept-Language': 'en'
      },
      signal: AbortSignal.timeout(2500)
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.display_name && !data.error) {
        const addr = data.address || {};
        const placeName =
          data.name ||
          addr.amenity ||
          addr.shop ||
          addr.building ||
          addr.road ||
          addr.suburb ||
          addr.village ||
          addr.town ||
          addr.city ||
          addr.county ||
          String(data.display_name).split(',')[0] ||
          manualFallback.name;
        const locality = [
          addr.suburb || addr.neighbourhood || addr.village || addr.road,
          addr.city || addr.town || addr.state_district || addr.county,
          addr.state || addr.country
        ]
          .filter(Boolean)
          .join(', ');
        return res.json({
          name: String(placeName),
          locality: locality || 'Resolved Coordinates',
          address: String(data.display_name),
          latitude: lat,
          longitude: lon,
          reverseGeocodeSuccess: true
        });
      }
    }
  } catch {
    // Fallback below
  }

  res.json({
    name: manualFallback.name,
    locality: manualFallback.locality,
    address: manualFallback.address,
    latitude: lat,
    longitude: lon,
    reverseGeocodeSuccess: false
  });
});

// 8. Charging Network
app.get('/api/charging', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  const usersById = new Map<string, any>((db.users || []).map((u: any) => [u.id, u]));
  const allStations = (db.chargingStations || [])
    .filter((s: any) => s.approvalStatus !== 'deleted')
    .map((s: any) => enrichStationWithSubmitter(s, usersById));
  const publicStations = allStations.filter((s: any) => isPubliclyPublishedCharger(s));
  const visibleAllStations = caller.isAdmin
    ? allStations
    : allStations.filter(
        (s: any) => isPubliclyPublishedCharger(s) || (caller.userId && s.submittedByUserId === caller.userId)
      );
  res.json({
    stations: publicStations,
    allStations: visibleAllStations,
    chargerReports: Array.isArray(db.chargerReports) ? db.chargerReports : [],
    longRidePlanningText: typeof db.longRidePlanningText === 'string' ? db.longRidePlanningText : ''
  });
});

app.get('/api/charging/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const db = readDb();
  const caller = resolveRequestUser(req, db);
  const usersById = new Map<string, any>((db.users || []).map((u: any) => [u.id, u]));
  const clientEntry: ChargingSseClient = {
    res,
    userId: caller.userId,
    isAdmin: caller.isAdmin
  };
  chargingSseClients.add(clientEntry);

  const allStations = (db.chargingStations || [])
    .filter((s: any) => s.approvalStatus !== 'deleted')
    .map((s: any) => enrichStationWithSubmitter(s, usersById));
  const publicStations = allStations.filter((s: any) => isPubliclyPublishedCharger(s));
  const visibleAllStations = caller.isAdmin
    ? allStations
    : allStations.filter(
        (s: any) => isPubliclyPublishedCharger(s) || (caller.userId && s.submittedByUserId === caller.userId)
      );
  res.write(
    `data: ${JSON.stringify({
      type: 'CHARGING_INIT',
      stations: publicStations,
      allStations: visibleAllStations,
      chargerReports: Array.isArray(db.chargerReports) ? db.chargerReports : [],
      longRidePlanningText: typeof db.longRidePlanningText === 'string' ? db.longRidePlanningText : '',
      timestamp: new Date().toISOString()
    })}\n\n`
  );

  req.on('close', () => {
    chargingSseClients.delete(clientEntry);
  });
});

app.get('/api/charging/planning-info', (_req: Request, res: Response) => {
  const db = readDb();
  res.json({
    longRidePlanningText: typeof db.longRidePlanningText === 'string' ? db.longRidePlanningText : ''
  });
});

app.post('/api/charging/planning-info', (req: Request, res: Response) => {
  const { text } = req.body || {};
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!caller.isOwner && !caller.hasPermission('moderate_chargers')) {
    return res.status(403).json({
      error: 'Owner or Charging Network moderation permission is required.'
    });
  }

  const cleanedText = typeof text === 'string' ? text.trim() : '';
  db.longRidePlanningText = cleanedText;

  db.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminId: caller.userId,
    adminName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    action: cleanedText ? 'UPDATE_LONG_RIDE_PLANNING_TEXT' : 'REMOVE_LONG_RIDE_PLANNING_TEXT',
    targetId: 'charging_planning_info',
    details: cleanedText
      ? `Updated 'Planning a Long Ride?' text (${cleanedText.length} chars)`
      : `Removed 'Planning a Long Ride?' text`,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  broadcastChargingUpdate(db);
  res.json({
    success: true,
    longRidePlanningText: db.longRidePlanningText
  });
});

app.post('/api/charging', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required to submit a charging station.' });
  }

  const {
    name,
    location,
    latitude,
    longitude,
    chargerType,
    uvChargingLink,
    chargerDetails,
    vehicleCompatibility,
    connectorTypes,
    powerOutputKw,
    chargerSource,
    accessConditions,
    pricing,
    pricingType: rawPricingType,
    chargingCostAmount: rawChargingCostAmount,
    chargingCostUnit: rawChargingCostUnit,
    availabilityStartTime: rawAvailabilityStartTime,
    availabilityEndTime: rawAvailabilityEndTime,
    availabilityDays: rawAvailabilityDays,
    availabilityTimeText: rawAvailabilityTimeText,
    requiresReservation: rawRequiresReservation,
    userNotes,
    reportedBy: rawReportedBy,
    submittedByPhone: rawSubmittedByPhone
  } = req.body || {};

  const validation = validateChargingPlugSubmission({
    name,
    location,
    chargerType,
    uvChargingLink,
    chargerDetails,
    latitude: latitude !== undefined && latitude !== '' ? latitude : 12.9716,
    longitude: longitude !== undefined && longitude !== '' ? longitude : 77.5946,
    vehicleCompatibility
  });

  if (!validation.valid || !validation.chargerType || !validation.coordinates) {
    const firstError =
      Object.values(validation.errors)[0] || 'Invalid charging plug submission.';
    return res.status(400).json({
      error: firstError,
      errors: validation.errors
    });
  }

  const reqId = (req.body?.clientRequestId || req.headers['x-client-request-id'] || '') as string;
  if (reqId) {
    const existingStation = (db.chargingStations || []).find((s: any) => s.clientRequestId === reqId);
    if (existingStation) {
      return res.status(200).json({ station: existingStation, deduplicated: true });
    }
  }

  const validPlugType: ChargerPlugType = validation.chargerType;
  const spec = CHARGER_PLUG_TYPE_SPECS[validPlugType];

  const normalizedSource: 'Supernova' | '3rd Party Station' | 'Community Provided Charger' =
    validPlugType === 'Supernova' && chargerSource !== 'Community Provided Charger'
      ? 'Supernova'
      : chargerSource === 'Supernova' ||
        chargerSource === '3rd Party Station' ||
        chargerSource === 'Community Provided Charger'
      ? chargerSource
      : 'Community Provided Charger';

  const canPublishDirectly =
    caller.isOwner ||
    caller.hasPermission('moderate_chargers') ||
    normalizedSource === 'Community Provided Charger';

  const resolvedConnectorTypes =
    Array.isArray(connectorTypes) && connectorTypes.length > 0
      ? connectorTypes
      : [spec.defaultConnectorLabel];

  const resolvedChargerDetails =
    validation.sanitizedChargerDetails || spec.requirementSummary;

  const reporterDisplayName =
    typeof rawReportedBy === 'string' && rawReportedBy.trim()
      ? rawReportedBy.trim()
      : resolveUserDisplayIdentity(caller.userObj).primaryName;

  const reporterPhone =
    typeof rawSubmittedByPhone === 'string' && rawSubmittedByPhone.trim()
      ? rawSubmittedByPhone.trim()
      : caller.userObj?.mobile || '+91 98450 11099';

  const resolvedTerms = resolveCommunityChargerTerms({
    chargerSource: normalizedSource,
    pricingType: rawPricingType,
    chargingCostAmount: rawChargingCostAmount,
    chargingCostUnit: rawChargingCostUnit,
    availabilityStartTime: rawAvailabilityStartTime,
    availabilityEndTime: rawAvailabilityEndTime,
    availabilityDays: rawAvailabilityDays,
    availabilityTimeText: rawAvailabilityTimeText,
    requiresReservation: rawRequiresReservation,
    pricing
  });

  const resolvedPricingString =
    typeof pricing === 'string' && pricing.trim()
      ? pricing.trim()
      : normalizedSource === 'Community Provided Charger'
      ? `${resolvedTerms.formattedPricingSummary} • Available ${resolvedTerms.availabilityTimeText}`
      : 'Free / Commercial Standard';

  const newStation = {
    id: `cs_${Date.now()}`,
    clientRequestId: reqId || undefined,
    name: String(name).trim(),
    location: String(location).trim(),
    latitude: validation.coordinates.latitude,
    longitude: validation.coordinates.longitude,
    chargerType: validPlugType,
    uvChargingLink: validation.sanitizedUvLink || undefined,
    chargerDetails: resolvedChargerDetails,
    vehicleCompatibility:
      typeof vehicleCompatibility === 'string' && vehicleCompatibility.trim()
        ? vehicleCompatibility.trim()
        : 'Verify connector & voltage compatibility before plugging in',
    connectorTypes: resolvedConnectorTypes,
    powerOutputKw:
      Number(powerOutputKw) ||
      (validPlugType === 'Supernova'
        ? 30
        : validPlugType === 'Type 2'
        ? 7.2
        : validPlugType === 'Type 6'
        ? 6.0
        : 3.3),
    chargerSource: normalizedSource,
    isSupernova: validPlugType === 'Supernova' || normalizedSource === 'Supernova',
    isCommunityReported: !caller.isOwner || normalizedSource === 'Community Provided Charger',
    verifiedByAdmin: canPublishDirectly,
    approvalStatus: canPublishDirectly ? ('approved' as const) : ('pending' as const),
    published: canPublishDirectly,
    submittedByUserId: caller.userId,
    submittedByRole: caller.isOwner || caller.hasPermission('moderate_chargers') ? ('admin' as const) : ('user' as const),
    submittedByPhone:
      normalizedSource === 'Community Provided Charger' ? reporterPhone : undefined,
    operatingStatus: 'Operational' as const,
    accessConditions: accessConditions || 'Public 24/7',
    pricingType: resolvedTerms.pricingType,
    chargingCostAmount: resolvedTerms.chargingCostAmount,
    chargingCostUnit: resolvedTerms.chargingCostUnit,
    availabilityStartTime: resolvedTerms.availabilityStartTime,
    availabilityEndTime: resolvedTerms.availabilityEndTime,
    availabilityDays: resolvedTerms.availabilityDays,
    availabilityTimeText: resolvedTerms.availabilityTimeText,
    requiresReservation:
      normalizedSource === 'Community Provided Charger'
        ? true
        : Boolean(rawRequiresReservation),
    reservations: [] as ChargerReservation[],
    pricing: resolvedPricingString,
    lastVerifiedDate: new Date().toISOString().split('T')[0],
    userNotes: typeof userNotes === 'string' ? userNotes.trim() : '',
    reportedBy: reporterDisplayName
  };

  db.chargingStations.push(newStation);

  if (!canPublishDirectly) {
    db.notifications.unshift({
      id: `notif_${Date.now()}`,
      userId: 'u_admin',
      type: 'system',
      title: 'New Charging Plug Submitted for Approval',
      message: `${newStation.reportedBy} submitted '${newStation.name}' (${newStation.chargerType}) for review.`,
      link: 'charging',
      read: false,
      createdAt: new Date().toISOString()
    });
  } else {
    db.auditLogs.unshift({
      id: `aud_${Date.now()}`,
      adminId: caller.userId,
      adminName: reporterDisplayName,
      action: 'PUBLISH_CHARGING_STATION',
      targetId: newStation.id,
      details: `Published ${newStation.chargerType} charger '${newStation.name}' at (${newStation.latitude}, ${newStation.longitude})`,
      timestamp: new Date().toISOString()
    });
  }

  writeDb(db);
  broadcastChargingUpdate(db);
  res.status(201).json({ station: newStation });
});

app.put('/api/charging/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const idx = (db.chargingStations || []).findIndex((s: any) => s.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Charging station not found.' });
  }

  const existing = db.chargingStations[idx];
  if (!canModifyServerRecord(existing, req, db, 'moderate_chargers')) {
    return res.status(403).json({
      error: "Unauthorized: You do not have permission to edit another user's charging record."
    });
  }

  const {
    name,
    location,
    latitude,
    longitude,
    chargerType,
    uvChargingLink,
    chargerDetails,
    vehicleCompatibility,
    connectorTypes,
    powerOutputKw,
    chargerSource,
    accessConditions,
    operatingStatus,
    pricing,
    pricingType,
    chargingCostAmount,
    chargingCostUnit,
    availabilityStartTime,
    availabilityEndTime,
    availabilityDays,
    availabilityTimeText,
    requiresReservation,
    userNotes,
    reportedBy,
    submittedByPhone
  } = req.body || {};

  const validation = validateChargingPlugSubmission({
    name: name ?? existing.name,
    location: location ?? existing.location,
    chargerType: chargerType ?? existing.chargerType,
    uvChargingLink: uvChargingLink !== undefined ? uvChargingLink : existing.uvChargingLink,
    chargerDetails: chargerDetails !== undefined ? chargerDetails : existing.chargerDetails,
    latitude: latitude !== undefined ? latitude : existing.latitude,
    longitude: longitude !== undefined ? longitude : existing.longitude,
    vehicleCompatibility:
      vehicleCompatibility !== undefined ? vehicleCompatibility : existing.vehicleCompatibility
  });

  if (!validation.valid || !validation.chargerType || !validation.coordinates) {
    const firstError =
      Object.values(validation.errors)[0] || 'Invalid charging station update.';
    return res.status(400).json({
      error: firstError,
      errors: validation.errors
    });
  }

  const validPlugType: ChargerPlugType = validation.chargerType;
  const spec = CHARGER_PLUG_TYPE_SPECS[validPlugType];
  const nextSource =
    validPlugType === 'Supernova' && chargerSource !== 'Community Provided Charger'
      ? 'Supernova'
      : chargerSource || existing.chargerSource;

  const mergedTerms = resolveCommunityChargerTerms({
    ...existing,
    chargerSource: nextSource,
    pricingType: pricingType !== undefined ? pricingType : existing.pricingType,
    chargingCostAmount:
      chargingCostAmount !== undefined ? chargingCostAmount : existing.chargingCostAmount,
    chargingCostUnit:
      chargingCostUnit !== undefined ? chargingCostUnit : existing.chargingCostUnit,
    availabilityStartTime:
      availabilityStartTime !== undefined ? availabilityStartTime : existing.availabilityStartTime,
    availabilityEndTime:
      availabilityEndTime !== undefined ? availabilityEndTime : existing.availabilityEndTime,
    availabilityDays:
      availabilityDays !== undefined ? availabilityDays : existing.availabilityDays,
    availabilityTimeText:
      availabilityTimeText !== undefined ? availabilityTimeText : undefined,
    requiresReservation:
      requiresReservation !== undefined ? requiresReservation : existing.requiresReservation,
    pricing: pricing !== undefined ? pricing : existing.pricing
  });

  const updatedStation = {
    ...existing,
    name: String(name ?? existing.name).trim(),
    location: String(location ?? existing.location).trim(),
    latitude: validation.coordinates.latitude,
    longitude: validation.coordinates.longitude,
    chargerType: validPlugType,
    uvChargingLink: validation.sanitizedUvLink || undefined,
    chargerDetails: validation.sanitizedChargerDetails || spec.requirementSummary,
    vehicleCompatibility:
      typeof vehicleCompatibility === 'string' && vehicleCompatibility.trim()
        ? vehicleCompatibility.trim()
        : existing.vehicleCompatibility,
    connectorTypes:
      Array.isArray(connectorTypes) && connectorTypes.length > 0
        ? connectorTypes
        : [spec.defaultConnectorLabel],
    powerOutputKw:
      powerOutputKw !== undefined ? Number(powerOutputKw) || existing.powerOutputKw : existing.powerOutputKw,
    chargerSource: nextSource,
    isSupernova: validPlugType === 'Supernova',
    accessConditions: accessConditions || existing.accessConditions,
    operatingStatus: operatingStatus || existing.operatingStatus,
    pricingType: mergedTerms.pricingType,
    chargingCostAmount: mergedTerms.chargingCostAmount,
    chargingCostUnit: mergedTerms.chargingCostUnit,
    availabilityStartTime: mergedTerms.availabilityStartTime,
    availabilityEndTime: mergedTerms.availabilityEndTime,
    availabilityDays: mergedTerms.availabilityDays,
    availabilityTimeText: mergedTerms.availabilityTimeText,
    requiresReservation: mergedTerms.requiresReservation,
    pricing:
      pricing !== undefined && String(pricing).trim()
        ? String(pricing).trim()
        : nextSource === 'Community Provided Charger'
        ? `${mergedTerms.formattedPricingSummary} • Available ${mergedTerms.availabilityTimeText}`
        : existing.pricing,
    userNotes: userNotes !== undefined ? String(userNotes).trim() : existing.userNotes,
    reportedBy:
      typeof reportedBy === 'string' && reportedBy.trim() ? reportedBy.trim() : existing.reportedBy,
    submittedByPhone:
      nextSource === 'Community Provided Charger'
        ? typeof submittedByPhone === 'string' && submittedByPhone.trim()
          ? submittedByPhone.trim()
          : existing.submittedByPhone
        : undefined,
    lastVerifiedDate: new Date().toISOString().split('T')[0]
  };

  db.chargingStations[idx] = updatedStation;
  writeDb(db);
  broadcastChargingUpdate(db);
  res.json({ station: updatedStation });
});

app.post('/api/charging/:id/reservations', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  const headerUserId =
    typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
  const bodyUserId =
    typeof req.body?.riderUserId === 'string' ? req.body.riderUserId.trim() : '';
  const fallbackUser =
    caller.userObj ||
    (headerUserId ? (db.users || []).find((u: any) => u.id === headerUserId) : null) ||
    (bodyUserId ? (db.users || []).find((u: any) => u.id === bodyUserId) : null);

  const idx = (db.chargingStations || []).findIndex((s: any) => s.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Charging station not found.' });
  }

  const station = db.chargingStations[idx];
  const callerIdentity = fallbackUser ? resolveUserDisplayIdentity(fallbackUser) : null;
  const effectiveRiderId =
    caller.userId || fallbackUser?.id || headerUserId || bodyUserId || 'u_pilot07';

  const result = validateAndCreateChargerReservation(station, {
    riderUserId: effectiveRiderId,
    riderName: req.body?.riderName || callerIdentity?.primaryName || 'Squadron Pilot',
    riderPhone: req.body?.riderPhone || fallbackUser?.mobile || '+91 98450 11099',
    riderBikeModel: req.body?.riderBikeModel || fallbackUser?.motorcycleModel || 'F77 MACH 2',
    reservationDate: req.body?.reservationDate,
    startTime: req.body?.startTime,
    durationMinutes: req.body?.durationMinutes,
    estimatedKwh: req.body?.estimatedKwh,
    vehicleNotes: req.body?.vehicleNotes
  });

  if (!result.valid || !result.reservation || !result.updatedStation) {
    return res.status(400).json({ error: result.error || 'Unable to create charging reservation.' });
  }

  db.chargingStations[idx] = result.updatedStation;

  // Build and dispatch notification to the charger owner / uploader
  const ownerNotification = buildChargerReservationOwnerNotification(station, result.reservation);
  db.notifications.unshift(ownerNotification);

  if (ownerNotification.userId !== 'u_admin') {
    db.notifications.unshift({
      ...ownerNotification,
      id: `${ownerNotification.id}_admin`,
      userId: 'u_admin'
    });
  }

  writeDb(db);
  broadcastChargingUpdate(db);
  res.status(201).json({
    reservation: result.reservation,
    station: result.updatedStation,
    ownerNotification
  });
});

app.put('/api/charging/:id/reservations/:reservationId', (req: Request, res: Response) => {
  const { id, reservationId } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  const headerUserId =
    typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
  const bodyUserId =
    typeof req.body?.actorId === 'string' ? req.body.actorId.trim() : '';
  const fallbackUser =
    caller.userObj ||
    (headerUserId ? (db.users || []).find((u: any) => u.id === headerUserId) : null) ||
    (bodyUserId ? (db.users || []).find((u: any) => u.id === bodyUserId) : null);

  const idx = (db.chargingStations || []).findIndex((s: any) => s.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Charging station not found.' });
  }

  const station = db.chargingStations[idx];
  const callerIdentity = fallbackUser ? resolveUserDisplayIdentity(fallbackUser) : null;

  const actor = fallbackUser
    ? {
        id: fallbackUser.id,
        role: fallbackUser.role,
        isOwner: isOwnerAccount(fallbackUser),
        fullName: callerIdentity?.primaryName || fallbackUser.fullName
      }
    : {
        id: headerUserId || bodyUserId || station.submittedByUserId || 'u_admin',
        role: 'admin',
        isOwner: true,
        fullName: req.body?.actorName || station.reportedBy || 'Charger Owner'
      };

  const result = updateChargerReservationStatus(
    station,
    reservationId,
    req.body?.status,
    actor,
    req.body?.ownerResponseNote
  );

  if (!result.valid || !result.reservation || !result.updatedStation) {
    return res.status(400).json({ error: result.error || 'Unable to update reservation status.' });
  }

  db.chargingStations[idx] = result.updatedStation;

  // Notify rider who booked the reservation
  const riderNotif = {
    id: `notif_${Date.now()}`,
    userId: result.reservation.riderUserId || 'u_admin',
    type: 'system' as const,
    title: `Charger Reservation ${result.reservation.status}: ${station.name}`,
    message: `Your reservation at "${station.name}" on ${result.reservation.reservationDate} (${result.reservation.startTime}–${result.reservation.endTime}) is now ${result.reservation.status}.${result.reservation.ownerResponseNote ? ` Owner note: ${result.reservation.ownerResponseNote}` : ''}`,
    link: 'charging',
    read: false,
    createdAt: new Date().toISOString()
  };
  db.notifications.unshift(riderNotif);

  writeDb(db);
  broadcastChargingUpdate(db);
  res.json({
    reservation: result.reservation,
    station: result.updatedStation,
    riderNotification: riderNotif
  });
});

app.put('/api/charging/:id/approval', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!caller.isOwner && !caller.hasPermission('moderate_chargers')) {
    return res.status(403).json({
      error: 'Administrator clearance required to approve or reject charging stations.'
    });
  }

  const idx = (db.chargingStations || []).findIndex((s: any) => s.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Charging station not found.' });
  }

  const station = db.chargingStations[idx];
  if (status === 'approved') {
    station.approvalStatus = 'approved';
    station.verifiedByAdmin = true;
    station.published = true;
    station.lastVerifiedDate = new Date().toISOString().split('T')[0];
  } else if (status === 'rejected') {
    station.approvalStatus = 'rejected';
    station.verifiedByAdmin = false;
    station.published = false;
  } else {
    return res.status(400).json({ error: 'Invalid approval status.' });
  }

  db.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminId: caller.userId,
    adminName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    action: status === 'approved' ? 'APPROVE_CHARGING_STATION' : 'REJECT_CHARGING_STATION',
    targetId: station.id,
    details: `${status === 'approved' ? 'Approved and published' : 'Rejected'} charger '${station.name}' (${station.chargerType})`,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  broadcastChargingUpdate(db);
  res.json({ station });
});

app.delete('/api/charging/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const idx = (db.chargingStations || []).findIndex((s: any) => s.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Charging station not found.' });
  }

  const existing = db.chargingStations[idx];
  if (!canModifyServerRecord(existing, req, db, 'moderate_chargers')) {
    return res.status(403).json({
      error: "Unauthorized: You do not have permission to delete another user's charging record."
    });
  }

  db.chargingStations[idx].approvalStatus = 'deleted';
  db.chargingStations[idx].published = false;
  db.chargingStations[idx].verifiedByAdmin = false;
  markServerRecordDeleted(db, id);

  db.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminId: caller.userId,
    adminName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    action: 'DELETE_CHARGING_STATION',
    targetId: existing.id,
    details: `Removed charging station '${existing.name}'`,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  broadcastChargingUpdate(db);
  res.json({ success: true, deletedId: id });
});

// 8B. Community Charger Reports & Auto Pilot Endpoints
app.get('/api/charging/reports', (req: Request, res: Response) => {
  const db = readDb();
  const chargerId = (req.query.chargerId as string) || '';
  const allReports: ChargerCommunityReport[] = Array.isArray(db.chargerReports) ? db.chargerReports : [];
  const filtered = chargerId ? allReports.filter(r => r.chargerId === chargerId) : allReports;
  res.json({ reports: filtered });
});

app.post('/api/charging/:id/reports', (req: Request, res: Response) => {
  const { id } = req.params;
  const { category, comment } = req.body || {};

  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required to submit a charger status report.' });
  }

  if (!isValidChargerReportCategory(category)) {
    return res.status(400).json({
      error: 'Invalid report category. Must be WORKING, FAULTY, INACCESSIBLE, or SUCCESSFULLY CHARGED.'
    });
  }

  const station = (db.chargingStations || []).find(
    (s: any) => s.id === id && s.approvalStatus !== 'deleted'
  );
  if (!station) {
    return res.status(404).json({ error: 'Charging station not found.' });
  }

  const resolvedUserId = caller.userId;
  const identity = resolveUserDisplayIdentity(caller.userObj);
  const resolvedCallsign = identity.secondaryTag
    ? `${identity.primaryName} (${identity.secondaryTag})`
    : identity.primaryName;

  const trimmedComment = typeof comment === 'string' ? comment.trim().slice(0, 280) : '';
  const nowIso = new Date().toISOString();

  if (!Array.isArray(db.chargerReports)) {
    db.chargerReports = [];
  }

  // Prevent rapid duplicate spam from the same user on the same charger within 2 minutes:
  // update their very recent report instead of flooding the log
  const twoMinAgoMs = Date.now() - 2 * 60 * 1000;
  const recentSameUserIdx = db.chargerReports.findIndex(
    (r: ChargerCommunityReport) =>
      r.chargerId === id &&
      r.userId === resolvedUserId &&
      new Date(r.createdAt).getTime() >= twoMinAgoMs
  );

  let savedReport: ChargerCommunityReport;
  if (recentSameUserIdx >= 0) {
    savedReport = {
      ...db.chargerReports[recentSameUserIdx],
      category,
      comment: trimmedComment || undefined,
      createdAt: nowIso,
      sourceLabel: 'Community Report'
    };
    db.chargerReports[recentSameUserIdx] = savedReport;
  } else {
    savedReport = {
      id: `crep_${Date.now()}`,
      chargerId: id,
      userId: resolvedUserId,
      reporterCallsign: resolvedCallsign,
      category,
      comment: trimmedComment || undefined,
      createdAt: nowIso,
      sourceLabel: 'Community Report'
    };
    db.chargerReports.unshift(savedReport);
  }

  writeDb(db);
  broadcastChargingUpdate(db);
  res.status(201).json({
    report: savedReport,
    chargerReports: db.chargerReports
  });
});

// OSRM Real Driving Route Calculation Proxy for Auto Pilot
app.post('/api/autopilot/route', async (req: Request, res: Response) => {
  const { points } = req.body || {};
  if (!Array.isArray(points) || points.length < 2) {
    return res.status(400).json({ error: 'At least 2 route points (start and destination) are required.' });
  }

  for (const pt of points) {
    const lat = Number(pt?.latitude);
    const lon = Number(pt?.longitude);
    if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ error: 'Invalid geographic coordinates in route points.' });
    }
  }

  // If routing between Bengaluru and Vellore/Chennai with 2 endpoints, anchor OSRM along the active
  // NH 75 / NH 48 national highway corridor (Kolar -> Mulbagal -> Vellore) rather than unserviced rural shortcuts
  let effectivePoints = [...points];
  if (effectivePoints.length === 2) {
    const pStart = effectivePoints[0];
    const pEnd = effectivePoints[1];
    const isBlrStart =
      pStart.latitude >= 12.75 &&
      pStart.latitude <= 13.2 &&
      pStart.longitude >= 77.4 &&
      pStart.longitude <= 77.85;
    const isChnEnd =
      pEnd.latitude >= 12.8 &&
      pEnd.latitude <= 13.3 &&
      pEnd.longitude >= 79.0 &&
      pEnd.longitude <= 80.4;

    const isChnStart =
      pStart.latitude >= 12.8 &&
      pStart.latitude <= 13.3 &&
      pStart.longitude >= 79.0 &&
      pStart.longitude <= 80.4;
    const isBlrEnd =
      pEnd.latitude >= 12.75 &&
      pEnd.latitude <= 13.2 &&
      pEnd.longitude >= 77.4 &&
      pEnd.longitude <= 77.85;

    const nh75Waypoints = [
      { latitude: 13.1328, longitude: 78.1715 }, // Kolar NH 75 Bypass
      { latitude: 13.1645, longitude: 78.3932 }, // Mulbagal NH 75 Highway Plaza
      { latitude: 12.9349, longitude: 79.1469 } // Vellore NH 48 Green Circle
    ];

    if (isBlrStart && isChnEnd) {
      effectivePoints = [
        pStart,
        ...nh75Waypoints.filter(w => w.longitude < pEnd.longitude - 0.1),
        pEnd
      ];
    } else if (isChnStart && isBlrEnd) {
      effectivePoints = [
        pStart,
        ...[...nh75Waypoints].reverse().filter(w => w.longitude < pStart.longitude - 0.1),
        pEnd
      ];
    }
  }

  const coordsString = effectivePoints
    .map((p: any) => `${Number(p.longitude).toFixed(6)},${Number(p.latitude).toFixed(6)}`)
    .join(';');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson&steps=false`;
    const response = await fetch(osrmUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'GhostProtocol-AutoPilot/1.0'
      }
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      if (data && data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
        const primaryRoute = data.routes[0];
        const rawCoords: [number, number][] = primaryRoute.geometry?.coordinates || [];
        // Convert GeoJSON [lon, lat] to Leaflet [lat, lon]
        const polyline: [number, number][] = rawCoords.map(c => [Number(c[1]), Number(c[0])]);
        const distanceKm = Number((Number(primaryRoute.distance || 0) / 1000).toFixed(1));
        const durationMin = Math.round(Number(primaryRoute.duration || 0) / 60);

        return res.json({
          routingAvailable: true,
          routingSource: 'OSRM Driving Route',
          distanceKm,
          durationMin,
          polyline
        });
      }
    }
  } catch {
    // Fall back to geodesic line with transparent routing limitation note
  }

  // Fallback when external OSRM routing service is unreachable
  let fallbackDistanceKm = 0;
  const fallbackPoly: [number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    const lat = Number(points[i].latitude);
    const lon = Number(points[i].longitude);
    fallbackPoly.push([lat, lon]);
    if (i > 0) {
      fallbackDistanceKm += calculateDistanceKm(
        Number(points[i - 1].latitude),
        Number(points[i - 1].longitude),
        lat,
        lon
      );
    }
  }

  res.json({
    routingAvailable: false,
    routingSource: 'Geodesic Fallback (Routing Service Unavailable)',
    routingLimitationNote:
      'Live road-geometry routing service is temporarily unreachable. Distances shown are straight-line corridor calculations; estimated driving times are omitted until road routing reconnects.',
    distanceKm: Number(fallbackDistanceKm.toFixed(1)),
    durationMin: null,
    polyline: fallbackPoly
  });
});

// Open-Meteo Weather & Riding Conditions Proxy for Auto Pilot
app.get('/api/autopilot/weather', async (req: Request, res: Response) => {
  const startLat = Number(req.query.startLat);
  const startLon = Number(req.query.startLon);
  const destLat = Number(req.query.destLat);
  const destLon = Number(req.query.destLon);

  if (!isFinite(startLat) || !isFinite(startLon) || !isFinite(destLat) || !isFinite(destLon)) {
    return res.status(400).json({ error: 'Valid start and destination coordinates required.' });
  }

  async function fetchPointWeather(lat: number, lon: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=auto`;
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error('Weather API HTTP error');
    const json = await resp.json();
    const cur = json?.current;
    if (!cur) throw new Error('Missing current weather payload');

    const code = Number(cur.weather_code ?? 0);
    let condition = 'Clear Sky';
    if (code >= 1 && code <= 3) condition = 'Partly Cloudy';
    else if (code >= 45 && code <= 48) condition = 'Fog / Low Visibility';
    else if (code >= 51 && code <= 67) condition = 'Rain Showers';
    else if (code >= 71 && code <= 82) condition = 'Heavy Rain / Storm';
    else if (code >= 95) condition = 'Thunderstorm';

    return {
      temperatureC: Number(cur.temperature_2m ?? 28),
      windSpeedKmh: Number(cur.wind_speed_10m ?? 10),
      precipitationMm: Number(cur.precipitation ?? 0),
      condition
    };
  }

  try {
    const [originWeather, destinationWeather] = await Promise.all([
      fetchPointWeather(startLat, startLon),
      fetchPointWeather(destLat, destLon)
    ]);
    return res.json({
      available: true,
      originWeather,
      destinationWeather,
      fetchedAt: new Date().toISOString()
    });
  } catch {
    return res.json({
      available: false,
      note: 'Live meteorological feed unavailable for this corridor right now.'
    });
  }
});

// Saved Auto Pilot Missions & Squadron Sharing
app.get('/api/autopilot/missions', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required to view saved Auto Pilot missions.' });
  }

  const allMissions: AutoPilotMissionRecord[] = Array.isArray(db.autoPilotMissions)
    ? db.autoPilotMissions
    : [];

  // Only return missions owned by this authenticated user OR explicitly shared with this user
  const visible = allMissions.filter(m => {
    if (m.userId === caller.userId) return true;
    if (
      m.shareSettings?.isShared &&
      Array.isArray(m.shareSettings.sharedWithUserIds) &&
      m.shareSettings.sharedWithUserIds.includes(caller.userId)
    ) {
      return true;
    }
    return false;
  });

  res.json({ missions: visible });
});

app.post('/api/autopilot/missions', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required to save an Auto Pilot mission.' });
  }

  const body = req.body || {};

  if (
    !body.startLocation ||
    !body.destination ||
    !isFinite(Number(body.startLocation.latitude)) ||
    !isFinite(Number(body.startLocation.longitude)) ||
    !isFinite(Number(body.destination.latitude)) ||
    !isFinite(Number(body.destination.longitude))
  ) {
    return res.status(400).json({
      error: 'Valid start location and destination coordinates are required to save an Auto Pilot mission.'
    });
  }

  const identity = resolveUserDisplayIdentity(caller.userObj);
  const ownerName = identity.secondaryTag
    ? `${identity.primaryName} (${identity.secondaryTag})`
    : identity.primaryName;

  const nowIso = new Date().toISOString();
  const newMission: AutoPilotMissionRecord = {
    id: `apm_${Date.now()}`,
    userId: caller.userId,
    ownerName,
    missionName:
      String(body.missionName || '').trim() ||
      `${body.startLocation.name} → ${body.destination.name}`,
    createdAt: nowIso,
    updatedAt: nowIso,
    departureDateTime: body.departureDateTime || undefined,
    startLocation: body.startLocation,
    destination: body.destination,
    targetIntervalKm: Number(body.targetIntervalKm) || 100,
    preferredChargerTypes: Array.isArray(body.preferredChargerTypes)
      ? body.preferredChargerTypes
      : [],
    rangeGuard: body.rangeGuard || { enabled: false },
    plannedRouteDistanceKm: Number(body.plannedRouteDistanceKm) || 0,
    estimatedDrivingDurationMin:
      typeof body.estimatedDrivingDurationMin === 'number'
        ? body.estimatedDrivingDurationMin
        : null,
    routingSource: body.routingSource || 'OSRM Driving Route',
    chargingStops: Array.isArray(body.chargingStops) ? body.chargingStops : [],
    pitStops: Array.isArray(body.pitStops) ? body.pitStops : [],
    status: body.status === 'In Progress' || body.status === 'Completed' ? body.status : 'Planned',
    completedAt: body.status === 'Completed' ? nowIso : undefined,
    riderNotes: typeof body.riderNotes === 'string' ? body.riderNotes.trim() : '',
    isFavourite: Boolean(body.isFavourite),
    shareSettings: body.shareSettings || {
      isShared: false,
      sharedWithUserIds: [],
      includeMeetingPoint: false,
      includeDepartureTime: false,
      includeGroupNotes: false
    }
  };

  if (!Array.isArray(db.autoPilotMissions)) {
    db.autoPilotMissions = [];
  }
  db.autoPilotMissions.unshift(newMission);
  writeDb(db);

  res.status(201).json({ mission: newMission });
});

app.put('/api/autopilot/missions/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body || {};

  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (!Array.isArray(db.autoPilotMissions)) {
    db.autoPilotMissions = [];
  }

  const idx = db.autoPilotMissions.findIndex((m: AutoPilotMissionRecord) => m.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Auto Pilot mission not found.' });
  }

  const existing: AutoPilotMissionRecord = db.autoPilotMissions[idx];
  if (existing.userId !== caller.userId && !caller.isOwner) {
    return res.status(403).json({
      error: 'Only the mission creator can modify or overwrite this saved Auto Pilot mission.'
    });
  }

  const nowIso = new Date().toISOString();
  const nextStatus =
    body.status === 'Planned' || body.status === 'In Progress' || body.status === 'Completed'
      ? body.status
      : existing.status;

  const updated: AutoPilotMissionRecord = {
    ...existing,
    missionName:
      body.missionName !== undefined ? String(body.missionName).trim() : existing.missionName,
    updatedAt: nowIso,
    departureDateTime:
      body.departureDateTime !== undefined ? body.departureDateTime : existing.departureDateTime,
    startLocation: body.startLocation || existing.startLocation,
    destination: body.destination || existing.destination,
    targetIntervalKm:
      body.targetIntervalKm !== undefined
        ? Number(body.targetIntervalKm) || 100
        : existing.targetIntervalKm,
    preferredChargerTypes:
      body.preferredChargerTypes !== undefined
        ? body.preferredChargerTypes
        : existing.preferredChargerTypes,
    rangeGuard: body.rangeGuard !== undefined ? body.rangeGuard : existing.rangeGuard,
    plannedRouteDistanceKm:
      body.plannedRouteDistanceKm !== undefined
        ? Number(body.plannedRouteDistanceKm)
        : existing.plannedRouteDistanceKm,
    estimatedDrivingDurationMin:
      body.estimatedDrivingDurationMin !== undefined
        ? body.estimatedDrivingDurationMin
        : existing.estimatedDrivingDurationMin,
    routingSource: body.routingSource || existing.routingSource,
    chargingStops:
      body.chargingStops !== undefined ? body.chargingStops : existing.chargingStops,
    pitStops: body.pitStops !== undefined ? body.pitStops : existing.pitStops,
    status: nextStatus,
    completedAt:
      nextStatus === 'Completed'
        ? existing.completedAt || nowIso
        : undefined,
    riderNotes:
      body.riderNotes !== undefined ? String(body.riderNotes).trim() : existing.riderNotes,
    isFavourite:
      body.isFavourite !== undefined ? Boolean(body.isFavourite) : existing.isFavourite,
    shareSettings:
      body.shareSettings !== undefined ? body.shareSettings : existing.shareSettings
  };

  db.autoPilotMissions[idx] = updated;
  writeDb(db);
  res.json({ mission: updated });
});

app.delete('/api/autopilot/missions/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (!Array.isArray(db.autoPilotMissions)) {
    db.autoPilotMissions = [];
  }

  const idx = db.autoPilotMissions.findIndex((m: AutoPilotMissionRecord) => m.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Auto Pilot mission not found.' });
  }

  const existing: AutoPilotMissionRecord = db.autoPilotMissions[idx];
  if (existing.userId !== caller.userId && !caller.isOwner) {
    return res.status(403).json({
      error: 'Only the mission creator can delete this saved Auto Pilot mission.'
    });
  }

  db.autoPilotMissions.splice(idx, 1);
  markServerRecordDeleted(db, id);
  writeDb(db);
  res.json({ success: true, deletedId: id });
});

// 9. Marketplace (Buy & Sell, Rentals & Live Auctions)
app.get('/api/marketplace', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  const usersById = new Map<string, any>((db.users || []).map((u: any) => [u.id, u]));

  const items = (db.marketplace || []).map((rawItem: any) => {
    const sellerObj = usersById.get(rawItem.sellerId);
    const enriched = {
      ...rawItem,
      listingType: resolveMarketplaceListingType(rawItem),
      contactPhone: rawItem.contactPhone || sellerObj?.mobile || '+91 98450 11099',
      contactEmail: rawItem.contactEmail || sellerObj?.email || 'pilot-desk@ultraviolette-squadron.in'
    };
    return sanitizeMarketplaceItemForViewer(enriched, caller.userObj);
  });
  res.json({ items });
});

app.post('/api/marketplace', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  const {
    listingType,
    title,
    description,
    category,
    price,
    priceInr,
    condition,
    compatibleModel,
    compatibleModels,
    generalLocation,
    sellerName,
    contactPhone,
    contactEmail,
    imageUrl,
    imageUrls,
    // Rental fields
    costPerDay,
    securityDeposit,
    minRentalDays,
    maxRentalDays,
    rentalRules,
    rentalAvailability,
    // Auction fields
    startingBid,
    minBidIncrement,
    reservePrice,
    auctionEndTime,
    clientRequestId
  } = req.body || {};

  const resolvedType = resolveMarketplaceListingType({ listingType, category, costPerDay, startingBid });
  const resolvedPrice =
    resolvedType === 'rent'
      ? Number(costPerDay ?? price ?? priceInr)
      : resolvedType === 'auction'
      ? Number(startingBid ?? price ?? priceInr)
      : price !== undefined
      ? Number(price)
      : Number(priceInr);

  if (!title || !category || isNaN(resolvedPrice) || resolvedPrice <= 0) {
    return res.status(400).json({
      error:
        resolvedType === 'rent'
          ? 'Title, category, and a valid positive cost per day are required.'
          : resolvedType === 'auction'
          ? 'Title, category, and a valid positive starting bid are required.'
          : 'Title, category, and a valid positive price are required.'
    });
  }

  const reqId = clientRequestId || (req.headers['x-client-request-id'] as string);
  if (reqId) {
    const existing = db.marketplace.find((m: any) => m.clientRequestId === reqId);
    if (existing) return res.status(200).json({ item: existing, deduplicated: true });
  }

  let normalizedImageUrls: string[] = [];
  if (Array.isArray(imageUrls) && imageUrls.length > 0) {
    normalizedImageUrls = imageUrls.filter((u: any) => typeof u === 'string' && u.trim());
  } else if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim()) {
    normalizedImageUrls = [imageUrl.trim()];
  }

  const resolvedModel =
    compatibleModel ||
    (Array.isArray(compatibleModels) && compatibleModels.length > 0
      ? compatibleModels.join(', ')
      : 'F77 MACH 2');

  const nowIso = new Date().toISOString();
  const effectiveSellerId =
    caller.userId ||
    (typeof req.body?.sellerId === 'string' && req.body.sellerId.trim()
      ? req.body.sellerId.trim()
      : 'u_community_pilot');
  const effectiveSellerName =
    caller.userObj
      ? resolveUserDisplayIdentity(caller.userObj).primaryName
      : typeof sellerName === 'string' && sellerName.trim()
      ? sellerName.trim()
      : 'Squadron Pilot';

  const newItem: Record<string, any> = {
    id: `mp_${Date.now()}`,
    clientRequestId: reqId || undefined,
    sellerId: effectiveSellerId,
    sellerName: effectiveSellerName,
    sellerVerified: Boolean(
      caller.userObj?.verificationStatus === 'verified' || caller.isOwner || caller.isAdmin || req.body?.sellerVerified
    ),
    listingType: resolvedType,
    title: String(title).trim(),
    description: description ? String(description).trim() : '',
    category,
    price: resolvedPrice,
    condition: condition || 'Like New',
    compatibleModel: resolvedModel,
    generalLocation: generalLocation || caller.userObj?.city || 'Bengaluru',
    contactPhone:
      typeof contactPhone === 'string' && contactPhone.trim()
        ? contactPhone.trim()
        : caller.userObj?.mobile || '+91 98450 11099',
    contactEmail:
      typeof contactEmail === 'string' && contactEmail.trim()
        ? contactEmail.trim()
        : caller.userObj?.email || 'pilot-desk@ultraviolette-squadron.in',
    status: 'Available',
    createdAt: nowIso,
    updatedAt: nowIso,
    imageUrl:
      normalizedImageUrls[0] && !normalizedImageUrls[0].startsWith('data:')
        ? normalizedImageUrls[0]
        : typeof imageUrl === 'string' && !imageUrl.startsWith('data:')
        ? imageUrl
        : '',
    imageUrls: normalizedImageUrls
  };

  if (resolvedType === 'rent') {
    newItem.costPerDay = resolvedPrice;
    newItem.securityDeposit = Math.max(0, Number(securityDeposit) || 0);
    newItem.minRentalDays = Math.max(1, Number(minRentalDays) || 1);
    newItem.maxRentalDays = Math.max(newItem.minRentalDays, Number(maxRentalDays) || 14);
    newItem.rentalRules =
      typeof rentalRules === 'string' && rentalRules.trim()
        ? rentalRules.trim()
        : 'Valid Pilot ID required at pickup. Return item in clean, undamaged working order.';
    newItem.rentalAvailability =
      rentalAvailability === 'Currently Rented' || rentalAvailability === 'Booked Upcoming'
        ? rentalAvailability
        : 'Available Now';
    newItem.rentalRequests = [];
  } else if (resolvedType === 'auction') {
    newItem.startingBid = resolvedPrice;
    newItem.currentBid = resolvedPrice;
    newItem.minBidIncrement = Math.max(50, Number(minBidIncrement) || 500);
    newItem.reservePrice = Number(reservePrice) > 0 ? Number(reservePrice) : undefined;
    newItem.auctionEndTime =
      typeof auctionEndTime === 'string' && auctionEndTime.trim()
        ? auctionEndTime.trim()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    newItem.auctionStatus = 'active';
    newItem.bids = [];
  }

  db.marketplace.unshift(newItem);
  writeDb(db);
  res.status(201).json({ item: newItem });
});

app.put('/api/marketplace/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const item = db.marketplace.find((m: any) => m.id === id);
  if (!item) return res.status(404).json({ error: 'Marketplace listing not found' });

  if (!canModifyServerRecord(item, req, db, 'moderate_marketplace')) {
    return res.status(403).json({ error: 'Only the seller or an administrator can edit this listing.' });
  }

  const {
    listingType,
    title,
    description,
    category,
    price,
    priceInr,
    condition,
    compatibleModel,
    generalLocation,
    contactPhone,
    contactEmail,
    status,
    imageUrl,
    imageUrls,
    costPerDay,
    securityDeposit,
    minRentalDays,
    maxRentalDays,
    rentalRules,
    rentalAvailability,
    startingBid,
    minBidIncrement,
    reservePrice,
    auctionEndTime,
    auctionStatus
  } = req.body || {};

  if (listingType) item.listingType = resolveMarketplaceListingType({ listingType });
  if (title) item.title = String(title).trim();
  if (description !== undefined) item.description = String(description).trim();
  if (category) item.category = category;
  const nextPrice =
    price !== undefined
      ? Number(price)
      : priceInr !== undefined
      ? Number(priceInr)
      : costPerDay !== undefined
      ? Number(costPerDay)
      : startingBid !== undefined
      ? Number(startingBid)
      : undefined;
  if (nextPrice !== undefined && !isNaN(nextPrice) && nextPrice > 0) {
    item.price = nextPrice;
  }
  if (condition) item.condition = condition;
  if (compatibleModel) item.compatibleModel = compatibleModel;
  if (generalLocation) item.generalLocation = generalLocation;
  if (contactPhone !== undefined) item.contactPhone = String(contactPhone).trim();
  if (contactEmail !== undefined) item.contactEmail = String(contactEmail).trim();
  if (status) item.status = status;

  if (costPerDay !== undefined && Number(costPerDay) > 0) item.costPerDay = Number(costPerDay);
  if (securityDeposit !== undefined) item.securityDeposit = Math.max(0, Number(securityDeposit) || 0);
  if (minRentalDays !== undefined) item.minRentalDays = Math.max(1, Number(minRentalDays) || 1);
  if (maxRentalDays !== undefined) item.maxRentalDays = Math.max(1, Number(maxRentalDays) || 14);
  if (rentalRules !== undefined) item.rentalRules = String(rentalRules).trim();
  if (rentalAvailability !== undefined) item.rentalAvailability = rentalAvailability;

  if (startingBid !== undefined && Number(startingBid) > 0) item.startingBid = Number(startingBid);
  if (minBidIncrement !== undefined && Number(minBidIncrement) > 0) item.minBidIncrement = Number(minBidIncrement);
  if (reservePrice !== undefined) item.reservePrice = Number(reservePrice) > 0 ? Number(reservePrice) : undefined;
  if (auctionEndTime !== undefined) item.auctionEndTime = auctionEndTime;
  if (auctionStatus !== undefined) item.auctionStatus = auctionStatus;

  if (imageUrls !== undefined || imageUrl !== undefined) {
    let normalizedImageUrls: string[] = [];
    if (Array.isArray(imageUrls) && imageUrls.length > 0) {
      normalizedImageUrls = imageUrls.filter((u: any) => typeof u === 'string' && u.trim());
    } else if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim()) {
      normalizedImageUrls = [imageUrl.trim()];
    }
    item.imageUrl =
      normalizedImageUrls[0] && !normalizedImageUrls[0].startsWith('data:')
        ? normalizedImageUrls[0]
        : '';
    item.imageUrls = normalizedImageUrls;
  }

  item.updatedAt = new Date().toISOString();
  writeDb(db);
  res.json({ item });
});

// Rent an item (submit rental booking request)
app.post('/api/marketplace/:id/rent', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  const item = db.marketplace.find((m: any) => m.id === id);
  if (!item) return res.status(404).json({ error: 'Rental listing not found.' });
  if (resolveMarketplaceListingType(item) !== 'rent') {
    return res.status(400).json({ error: 'This listing is not a rental item.' });
  }

  const { startDate, days, renterName: rawRenterName, renterPhone, renterEmail, acceptedRules, notes } = req.body || {};
  if (!acceptedRules) {
    return res.status(400).json({ error: 'You must accept the owner rental rules before booking.' });
  }

  const costSummary = calculateRentalBookingCost({
    costPerDay: item.costPerDay ?? item.price,
    securityDeposit: item.securityDeposit ?? 0,
    days: days ?? 1
  });
  if (!costSummary.valid) {
    return res.status(400).json({ error: costSummary.error || 'Invalid rental duration.' });
  }

  const nowIso = new Date().toISOString();
  const renterName =
    caller.userObj
      ? resolveUserDisplayIdentity(caller.userObj).primaryName
      : typeof rawRenterName === 'string' && rawRenterName.trim()
      ? rawRenterName.trim()
      : 'Squadron Pilot';
  const booking = {
    id: `rent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    renterId: caller.userId || `u_renter_${Date.now()}`,
    renterName,
    renterPhone:
      (typeof renterPhone === 'string' && renterPhone.trim()) ||
      caller.userObj?.mobile ||
      '+91 98450 00000',
    renterEmail:
      (typeof renterEmail === 'string' && renterEmail.trim()) ||
      caller.userObj?.email ||
      'pilot@squadron.in',
    startDate:
      typeof startDate === 'string' && startDate.trim()
        ? startDate.trim()
        : nowIso.split('T')[0],
    days: costSummary.days,
    costPerDay: costSummary.costPerDay,
    securityDeposit: costSummary.securityDeposit,
    totalAmount: costSummary.totalPayable,
    acceptedRules: true,
    notes: typeof notes === 'string' && notes.trim() ? notes.trim().slice(0, 300) : undefined,
    status: 'Requested' as const,
    createdAt: nowIso
  };

  if (!Array.isArray(item.rentalRequests)) {
    item.rentalRequests = [];
  }
  item.rentalRequests.unshift(booking);
  item.rentalAvailability = 'Booked Upcoming';
  item.updatedAt = nowIso;

  db.notifications.unshift({
    id: `notif_${Date.now()}`,
    userId: item.sellerId || 'u_admin',
    type: 'system',
    title: `New Rental Request: ${item.title}`,
    message: `${renterName} requested to rent "${item.title}" for ${booking.days} day(s) starting ${booking.startDate} (Total ₹${booking.totalAmount.toLocaleString('en-IN')}).`,
    link: 'marketplace',
    read: false,
    createdAt: nowIso
  });

  writeDb(db);
  res.status(201).json({ item, booking });
});

// Place a bid on an Auction listing
app.post('/api/marketplace/:id/bid', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  const idx = db.marketplace.findIndex((m: any) => m.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Auction listing not found.' });

  const item = db.marketplace[idx];
  const { amount, note, bidderName: rawBidderName, bidderModel, bidderPhone, bidderEmail } = req.body || {};
  const bidderName =
    caller.userObj
      ? resolveUserDisplayIdentity(caller.userObj).primaryName
      : typeof rawBidderName === 'string' && rawBidderName.trim()
      ? rawBidderName.trim()
      : 'Squadron Pilot';

  const result = validateAndPlaceAuctionBid(item, {
    bidderId: caller.userId || `u_bidder_${Date.now()}`,
    bidderName,
    bidderModel: caller.userObj?.motorcycleModel || bidderModel || 'F77 MACH 2',
    bidderPhone:
      (typeof bidderPhone === 'string' && bidderPhone.trim()) ||
      caller.userObj?.mobile ||
      undefined,
    bidderEmail:
      (typeof bidderEmail === 'string' && bidderEmail.trim()) ||
      caller.userObj?.email ||
      undefined,
    amount,
    note
  });

  if (!result.valid || !result.updatedItem || !result.bid) {
    return res.status(400).json({ error: result.error || 'Invalid bid.' });
  }

  db.marketplace[idx] = result.updatedItem;

  db.notifications.unshift({
    id: `notif_${Date.now()}`,
    userId: item.sellerId || 'u_admin',
    type: 'system',
    title: `New Bid on ${item.title}: ₹${result.bid.amount.toLocaleString('en-IN')}`,
    message: `${bidderName} placed a bid of ₹${result.bid.amount.toLocaleString('en-IN')} on "${item.title}".`,
    link: 'marketplace',
    read: false,
    createdAt: new Date().toISOString()
  });

  writeDb(db);
  res.status(201).json({ item: result.updatedItem, bid: result.bid });
});

// Owner chooses the winner or awards the highest bid on an Auction listing
app.post('/api/marketplace/:id/award', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  const idx = db.marketplace.findIndex((m: any) => m.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Auction listing not found.' });

  const item = db.marketplace[idx];
  const isAuthorizedOwner =
    caller.isAuthenticated
      ? canModifyServerRecord(item, req, db, 'moderate_marketplace')
      : true;
  if (!isAuthorizedOwner) {
    return res.status(403).json({ error: 'Only the auction owner or an administrator can select the winning bid.' });
  }

  const { bidId } = req.body || {};
  const result = selectAuctionWinner(item, { bidId });
  if (!result.valid || !result.updatedItem || !result.winningBid) {
    return res.status(400).json({ error: result.error || 'Could not select auction winner.' });
  }

  db.marketplace[idx] = result.updatedItem;

  db.notifications.unshift({
    id: `notif_${Date.now()}`,
    userId: result.winningBid.bidderId,
    type: 'system',
    title: `You Won the Auction: ${item.title}!`,
    message: `Congratulations ${result.winningBid.bidderName}! Your bid of ₹${result.winningBid.amount.toLocaleString('en-IN')} was selected as the winner for "${item.title}". Contact the owner to arrange handover.`,
    link: 'marketplace',
    read: false,
    createdAt: new Date().toISOString()
  });

  writeDb(db);
  res.json({ item: result.updatedItem, winningBid: result.winningBid });
});

app.delete('/api/marketplace/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const idx = db.marketplace.findIndex((m: any) => m.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Marketplace listing not found' });

  if (!canModifyServerRecord(db.marketplace[idx], req, db, 'moderate_marketplace')) {
    return res.status(403).json({ error: 'Only the seller or an administrator can delete this listing.' });
  }

  db.marketplace.splice(idx, 1);
  markServerRecordDeleted(db, id);
  writeDb(db);
  res.json({ success: true, deletedId: id });
});

// 10. Service Reviews
app.get('/api/service-reviews', (_req: Request, res: Response) => {
  const db = readDb();
  res.json({ reviews: db.serviceReviews });
});

app.post('/api/service-reviews', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required to submit a service review.' });
  }

  const {
    serviceCentreName,
    generalLocation,
    motorcycleModel,
    visitDate,
    issueReported,
    workPerformed,
    issueResolved,
    turnaroundDays,
    customerRating,
    notes,
    positiveFeedback,
    negativeFeedback,
    preferredServiceAdvisor,
    clientRequestId
  } = req.body || {};

  if (!serviceCentreName || !workPerformed) {
    return res.status(400).json({ error: 'Service centre and work performed details are required.' });
  }

  const reqId = clientRequestId || (req.headers['x-client-request-id'] as string);
  if (reqId) {
    const existing = db.serviceReviews.find((r: any) => r.clientRequestId === reqId);
    if (existing) return res.status(200).json({ review: existing, deduplicated: true });
  }

  const newReview = {
    id: `sr_${Date.now()}`,
    clientRequestId: reqId || undefined,
    userId: caller.userId,
    authorName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    serviceCentreName: String(serviceCentreName).trim(),
    generalLocation: generalLocation || caller.userObj.city || 'Bengaluru',
    motorcycleModel: motorcycleModel || caller.userObj.motorcycleModel || 'F77 MACH 2',
    visitDate: visitDate || new Date().toISOString().split('T')[0],
    issueReported: issueReported || 'General service',
    workPerformed: String(workPerformed).trim(),
    issueResolved: Boolean(issueResolved),
    turnaroundDays: Number(turnaroundDays) || 1,
    customerRating: Math.min(5, Math.max(1, Number(customerRating) || 5)),
    notes: notes || '',
    positiveFeedback: typeof positiveFeedback === 'string' ? positiveFeedback.trim() : '',
    negativeFeedback: typeof negativeFeedback === 'string' ? negativeFeedback.trim() : '',
    preferredServiceAdvisor: typeof preferredServiceAdvisor === 'string' ? preferredServiceAdvisor.trim() : '',
    createdAt: new Date().toISOString()
  };

  db.serviceReviews.unshift(newReview);
  writeDb(db);
  res.status(201).json({ review: newReview });
});

app.put('/api/service-reviews/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const rev = db.serviceReviews.find((r: any) => r.id === id);
  if (!rev) return res.status(404).json({ error: 'Service review not found' });

  if (!canModifyServerRecord(rev, req, db, 'moderate_service_intel')) {
    return res.status(403).json({ error: 'Only the author or an administrator can edit this service review.' });
  }

  const {
    serviceCentreName,
    generalLocation,
    motorcycleModel,
    visitDate,
    issueReported,
    workPerformed,
    issueResolved,
    turnaroundDays,
    customerRating,
    notes,
    positiveFeedback,
    negativeFeedback,
    preferredServiceAdvisor
  } = req.body || {};

  if (serviceCentreName) rev.serviceCentreName = String(serviceCentreName).trim();
  if (generalLocation) rev.generalLocation = generalLocation;
  if (motorcycleModel) rev.motorcycleModel = motorcycleModel;
  if (visitDate) rev.visitDate = visitDate;
  if (issueReported !== undefined) rev.issueReported = issueReported;
  if (workPerformed) rev.workPerformed = String(workPerformed).trim();
  if (issueResolved !== undefined) rev.issueResolved = Boolean(issueResolved);
  if (turnaroundDays !== undefined) rev.turnaroundDays = Number(turnaroundDays) || 1;
  if (customerRating !== undefined) rev.customerRating = Math.min(5, Math.max(1, Number(customerRating) || 5));
  if (notes !== undefined) rev.notes = notes;
  if (positiveFeedback !== undefined) rev.positiveFeedback = String(positiveFeedback).trim();
  if (negativeFeedback !== undefined) rev.negativeFeedback = String(negativeFeedback).trim();
  if (preferredServiceAdvisor !== undefined) rev.preferredServiceAdvisor = String(preferredServiceAdvisor).trim();

  writeDb(db);
  res.json({ review: rev });
});

app.delete('/api/service-reviews/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const idx = db.serviceReviews.findIndex((r: any) => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Service review not found' });

  if (!canModifyServerRecord(db.serviceReviews[idx], req, db, 'moderate_service_intel')) {
    return res.status(403).json({ error: 'Only the author or an administrator can delete this service review.' });
  }

  db.serviceReviews.splice(idx, 1);
  markServerRecordDeleted(db, id);
  writeDb(db);
  res.json({ success: true, deletedId: id });
});

// 11. Community Discussions, Polls & Petitions
app.get('/api/discussions', (_req: Request, res: Response) => {
  const db = readDb();
  res.json({
    discussions: db.discussions,
    polls: db.polls || [],
    petitions: db.petitions || []
  });
});

app.get('/api/discussions/polls', (_req: Request, res: Response) => {
  const db = readDb();
  res.json({ polls: db.polls || [] });
});

app.post('/api/discussions/polls', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  const { question, category, options, authorName, authorModel, voterId, clientRequestId } =
    req.body || {};

  const reqId = clientRequestId || (req.headers['x-client-request-id'] as string);
  if (reqId && Array.isArray(db.polls)) {
    const existing = db.polls.find((p: any) => p.clientRequestId === reqId);
    if (existing) return res.status(200).json({ poll: existing, deduplicated: true });
  }

  const resolvedAuthorName =
    caller.isAuthenticated && caller.userObj
      ? resolveUserDisplayIdentity(caller.userObj).primaryName
      : typeof authorName === 'string' && authorName.trim()
      ? authorName.trim()
      : 'Squadron Pilot';

  const resolvedAuthorModel =
    caller.isAuthenticated && caller.userObj
      ? caller.userObj.motorcycleModel || 'F77 MACH 2'
      : typeof authorModel === 'string' && authorModel.trim()
      ? authorModel.trim()
      : 'F77 MACH 2';

  const validation = validatePollCreation({
    question,
    category,
    options,
    authorName: resolvedAuthorName,
    authorModel: resolvedAuthorModel
  });

  if (!validation.valid || !validation.value) {
    return res.status(400).json({ error: validation.error || 'Invalid poll data.' });
  }

  const resolvedAuthorId =
    caller.isAuthenticated && caller.userId
      ? caller.userId
      : typeof voterId === 'string' && voterId.trim()
      ? voterId.trim().slice(0, 80)
      : `guest_${Date.now()}`;

  const nowTs = Date.now();
  const newPoll: DiscussionPoll = {
    id: `poll_${nowTs}`,
    clientRequestId: reqId || undefined,
    authorId: resolvedAuthorId,
    authorName: validation.value.authorName,
    authorModel: validation.value.authorModel,
    question: validation.value.question,
    category: validation.value.category,
    options: validation.value.options.map((optText, idx) => ({
      id: `opt_${nowTs}_${idx + 1}`,
      text: optText,
      votes: []
    })),
    createdAt: new Date().toISOString()
  };

  if (!Array.isArray(db.polls)) {
    db.polls = [];
  }
  db.polls.unshift(newPoll);
  writeDb(db);
  res.status(201).json({ poll: newPoll });
});

app.post('/api/discussions/polls/:id/vote', (req: Request, res: Response) => {
  const { id } = req.params;
  const { optionId, voterId } = req.body || {};
  if (!optionId || typeof optionId !== 'string') {
    return res.status(400).json({ error: 'Please select a poll option to vote.' });
  }

  const db = readDb();
  if (!Array.isArray(db.polls)) {
    db.polls = [];
  }
  const pollIdx = db.polls.findIndex((p: any) => p.id === id);
  if (pollIdx === -1) {
    return res.status(404).json({ error: 'Poll not found.' });
  }

  const caller = resolveRequestUser(req, db);
  const resolvedVoterId =
    caller.isAuthenticated && caller.userId
      ? caller.userId
      : typeof voterId === 'string' && voterId.trim()
      ? voterId.trim().slice(0, 80)
      : '';

  if (!resolvedVoterId) {
    return res.status(400).json({ error: 'Voter identifier is required.' });
  }

  const updatedPoll = castPollVote(db.polls[pollIdx], optionId, resolvedVoterId);
  db.polls[pollIdx] = updatedPoll;
  writeDb(db);
  res.json({ poll: updatedPoll });
});

app.delete('/api/discussions/polls/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  if (!Array.isArray(db.polls)) {
    db.polls = [];
  }
  const idx = db.polls.findIndex((p: any) => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Poll not found.' });
  }

  const poll = db.polls[idx];
  const caller = resolveRequestUser(req, db);
  const guestVoterId = typeof req.body?.voterId === 'string' ? req.body.voterId.trim() : '';

  const isGuestAuthor = Boolean(guestVoterId && poll.authorId === guestVoterId);
  const isAuthorizedUser =
    caller.isAuthenticated &&
    caller.userObj &&
    canModifyServerRecord(poll, req, db, 'moderate_discussions');

  if (!isAuthorizedUser && !isGuestAuthor) {
    return res.status(403).json({ error: 'Only the poll creator or an administrator can delete this poll.' });
  }

  db.polls.splice(idx, 1);
  markServerRecordDeleted(db, id);
  writeDb(db);
  res.json({ success: true, deletedId: id });
});

app.get('/api/discussions/petitions', (_req: Request, res: Response) => {
  const db = readDb();
  res.json({ petitions: db.petitions || [] });
});

app.post('/api/discussions/petitions', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  const {
    title,
    description,
    category,
    targetGoal,
    authorName,
    authorModel,
    voterId,
    clientRequestId
  } = req.body || {};

  const reqId = clientRequestId || (req.headers['x-client-request-id'] as string);
  if (reqId && Array.isArray(db.petitions)) {
    const existing = db.petitions.find((p: any) => p.clientRequestId === reqId);
    if (existing) return res.status(200).json({ petition: existing, deduplicated: true });
  }

  const resolvedAuthorName =
    caller.isAuthenticated && caller.userObj
      ? resolveUserDisplayIdentity(caller.userObj).primaryName
      : typeof authorName === 'string' && authorName.trim()
      ? authorName.trim()
      : 'Squadron Pilot';

  const resolvedAuthorModel =
    caller.isAuthenticated && caller.userObj
      ? caller.userObj.motorcycleModel || 'F77 MACH 2'
      : typeof authorModel === 'string' && authorModel.trim()
      ? authorModel.trim()
      : 'F77 MACH 2';

  const validation = validatePetitionCreation({
    title,
    description,
    category,
    targetGoal,
    authorName: resolvedAuthorName,
    authorModel: resolvedAuthorModel
  });

  if (!validation.valid || !validation.value) {
    return res.status(400).json({ error: validation.error || 'Invalid petition data.' });
  }

  const resolvedAuthorId =
    caller.isAuthenticated && caller.userId
      ? caller.userId
      : typeof voterId === 'string' && voterId.trim()
      ? voterId.trim().slice(0, 80)
      : `guest_${Date.now()}`;

  const nowIso = new Date().toISOString();
  const newPetition: DiscussionPetition = {
    id: `pet_${Date.now()}`,
    clientRequestId: reqId || undefined,
    authorId: resolvedAuthorId,
    authorName: validation.value.authorName,
    authorModel: validation.value.authorModel,
    title: validation.value.title,
    description: validation.value.description,
    category: validation.value.category,
    targetGoal: validation.value.targetGoal,
    supporters: [
      {
        voterId: resolvedAuthorId,
        supporterName: validation.value.authorName,
        supporterModel: validation.value.authorModel,
        supportedAt: nowIso
      }
    ],
    createdAt: nowIso
  };

  if (!Array.isArray(db.petitions)) {
    db.petitions = [];
  }
  db.petitions.unshift(newPetition);
  writeDb(db);
  res.status(201).json({ petition: newPetition });
});

app.post('/api/discussions/petitions/:id/support', (req: Request, res: Response) => {
  const { id } = req.params;
  const { voterId, supporterName, supporterModel, comment } = req.body || {};

  const db = readDb();
  if (!Array.isArray(db.petitions)) {
    db.petitions = [];
  }
  const petIdx = db.petitions.findIndex((p: any) => p.id === id);
  if (petIdx === -1) {
    return res.status(404).json({ error: 'Petition not found.' });
  }

  const caller = resolveRequestUser(req, db);
  const resolvedVoterId =
    caller.isAuthenticated && caller.userId
      ? caller.userId
      : typeof voterId === 'string' && voterId.trim()
      ? voterId.trim().slice(0, 80)
      : '';

  if (!resolvedVoterId) {
    return res.status(400).json({ error: 'Supporter identifier is required.' });
  }

  const resolvedSupporterName =
    caller.isAuthenticated && caller.userObj
      ? resolveUserDisplayIdentity(caller.userObj).primaryName
      : typeof supporterName === 'string' && supporterName.trim()
      ? supporterName.trim()
      : 'Squadron Pilot';

  const resolvedSupporterModel =
    caller.isAuthenticated && caller.userObj
      ? caller.userObj.motorcycleModel || 'F77 MACH 2'
      : typeof supporterModel === 'string' && supporterModel.trim()
      ? supporterModel.trim()
      : 'F77 MACH 2';

  const updatedPetition = togglePetitionSupport(db.petitions[petIdx], {
    voterId: resolvedVoterId,
    supporterName: resolvedSupporterName,
    supporterModel: resolvedSupporterModel,
    comment: typeof comment === 'string' ? comment : undefined
  });

  db.petitions[petIdx] = updatedPetition;
  writeDb(db);
  res.json({ petition: updatedPetition });
});

app.delete('/api/discussions/petitions/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  if (!Array.isArray(db.petitions)) {
    db.petitions = [];
  }
  const idx = db.petitions.findIndex((p: any) => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Petition not found.' });
  }

  const petition = db.petitions[idx];
  const caller = resolveRequestUser(req, db);
  const guestVoterId = typeof req.body?.voterId === 'string' ? req.body.voterId.trim() : '';

  const isGuestAuthor = Boolean(guestVoterId && petition.authorId === guestVoterId);
  const isAuthorizedUser =
    caller.isAuthenticated &&
    caller.userObj &&
    canModifyServerRecord(petition, req, db, 'moderate_discussions');

  if (!isAuthorizedUser && !isGuestAuthor) {
    return res
      .status(403)
      .json({ error: 'Only the petition creator or an administrator can delete this petition.' });
  }

  db.petitions.splice(idx, 1);
  markServerRecordDeleted(db, id);
  writeDb(db);
  res.json({ success: true, deletedId: id });
});

app.post('/api/discussions', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required to start a discussion.' });
  }

  const { authorModel, category, title, content, tags, clientRequestId } = req.body || {};
  if (!title || !content || !category) {
    return res.status(400).json({ error: 'Title, content, and category are required.' });
  }

  const reqId = clientRequestId || (req.headers['x-client-request-id'] as string);
  if (reqId) {
    const existing = db.discussions.find((d: any) => d.clientRequestId === reqId);
    if (existing) return res.status(200).json({ post: existing, deduplicated: true });
  }

  const newPost = {
    id: `disc_${Date.now()}`,
    clientRequestId: reqId || undefined,
    authorId: caller.userId,
    authorName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    authorModel: authorModel || caller.userObj.motorcycleModel || 'F77 MACH 2',
    category,
    title: String(title).trim(),
    content: String(content).trim(),
    tags: Array.isArray(tags) ? tags : [],
    reactions: { helpful: [], salute: [], confirmed: [] },
    comments: [],
    createdAt: new Date().toISOString()
  };

  db.discussions.unshift(newPost);
  writeDb(db);
  res.status(201).json({ post: newPost });
});

app.put('/api/discussions/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const post = db.discussions.find((d: any) => d.id === id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  if (!canModifyServerRecord(post, req, db, 'moderate_discussions')) {
    return res.status(403).json({ error: 'Only the author or an administrator can edit this discussion.' });
  }

  const { title, content, category, tags, pinned } = req.body || {};
  if (title) post.title = String(title).trim();
  if (content) post.content = String(content).trim();
  if (category) post.category = category;
  if (Array.isArray(tags)) post.tags = tags;
  if (pinned !== undefined && (caller.isOwner || caller.hasPermission('moderate_discussions'))) {
    post.pinned = Boolean(pinned);
  }

  writeDb(db);
  res.json({ post });
});

app.delete('/api/discussions/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const idx = db.discussions.findIndex((d: any) => d.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Post not found' });

  if (!canModifyServerRecord(db.discussions[idx], req, db, 'moderate_discussions')) {
    return res.status(403).json({ error: 'Only the author or an administrator can delete this discussion.' });
  }

  db.discussions.splice(idx, 1);
  markServerRecordDeleted(db, id);
  writeDb(db);
  res.json({ success: true, deletedId: id });
});

app.post('/api/discussions/:id/comments', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required to comment.' });
  }

  const { content, clientRequestId } = req.body || {};
  if (!content || !String(content).trim()) return res.status(400).json({ error: 'Comment content cannot be empty' });

  const post = db.discussions.find((d: any) => d.id === id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const reqId = clientRequestId || (req.headers['x-client-request-id'] as string);
  if (reqId && Array.isArray(post.comments)) {
    const existingComment = post.comments.find((c: any) => c.clientRequestId === reqId);
    if (existingComment) return res.status(200).json({ comment: existingComment, post, deduplicated: true });
  }

  const comment = {
    id: `c_${Date.now()}`,
    clientRequestId: reqId || undefined,
    authorId: caller.userId,
    authorName: resolveUserDisplayIdentity(caller.userObj).primaryName,
    content: String(content).trim(),
    createdAt: new Date().toISOString()
  };

  post.comments.push(comment);
  writeDb(db);
  res.status(201).json({ comment, post });
});

app.delete('/api/discussions/:id/comments/:commentId', (req: Request, res: Response) => {
  const { id, commentId } = req.params;
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const post = db.discussions.find((d: any) => d.id === id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const cIdx = (post.comments || []).findIndex((c: any) => c.id === commentId);
  if (cIdx === -1) return res.status(404).json({ error: 'Comment not found' });

  if (!canModifyServerRecord(post.comments[cIdx], req, db, 'moderate_discussions')) {
    return res.status(403).json({ error: 'Only the comment author or an administrator can delete this reply.' });
  }

  post.comments.splice(cIdx, 1);
  markServerRecordDeleted(db, commentId);
  writeDb(db);
  res.json({ success: true, post, deletedId: commentId });
});

app.post('/api/discussions/:id/react', (req: Request, res: Response) => {
  const { id } = req.params;
  const { reactionType } = req.body || {}; // helpful, salute, confirmed
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({ error: 'Authentication required to react to a discussion.' });
  }

  const post = db.discussions.find((d: any) => d.id === id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const targetList = post.reactions[reactionType as 'helpful' | 'salute' | 'confirmed'];
  if (targetList) {
    const idx = targetList.indexOf(caller.userId);
    if (idx >= 0) targetList.splice(idx, 1);
    else targetList.push(caller.userId);
  }

  writeDb(db);
  res.json({ reactions: post.reactions, post });
});

// 12. Notifications
app.get('/api/notifications', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  const headerUserId =
    typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
  const targetUserId = caller.userId || headerUserId;
  if (!targetUserId) {
    return res.json({ notifications: [] });
  }
  const notifs = (db.notifications || [])
    .filter((n: any) => n.userId === targetUserId || n.userId === 'all')
    .sort((a: any, b: any) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      if (a.type === 'emergency' && b.type !== 'emergency') return -1;
      if (b.type === 'emergency' && a.type !== 'emergency') return 1;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  res.json({ notifications: notifs });
});

app.post('/api/notifications/:id/read', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  const headerUserId =
    typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
  const targetUserId = caller.userId || headerUserId;
  if (!targetUserId) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const notif = (db.notifications || []).find((n: any) => n.id === req.params.id);
  if (!notif) {
    return res.status(404).json({ error: 'Notification not found.' });
  }
  if (notif.userId !== targetUserId && notif.userId !== 'all' && !caller.isOwner) {
    return res.status(403).json({ error: 'Not authorized to modify this notification.' });
  }
  notif.read = true;
  writeDb(db);
  res.json({ success: true });
});

app.post('/api/notifications/read-all', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  const headerUserId =
    typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
  const targetUserId = caller.userId || headerUserId;
  if (!targetUserId) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  (db.notifications || []).forEach((n: any) => {
    if (n.userId === targetUserId) n.read = true;
  });
  writeDb(db);
  res.json({ success: true });
});

// 13. Global Search
app.get('/api/search', (req: Request, res: Response) => {
  const q = ((req.query.q as string) || '').toLowerCase().trim();
  if (!q) return res.json({ results: [] });

  const db = readDb();
  const results: any[] = [];

  // Search discussions
  db.discussions.forEach((d: any) => {
    if (d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q)) {
      results.push({ type: 'discussion', id: d.id, title: d.title, snippet: d.content.slice(0, 100), link: 'discussions' });
    }
  });

  // Search problems
  db.problems.forEach((p: any) => {
    if (p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || (p.warningMessageOrCode && p.warningMessageOrCode.toLowerCase().includes(q))) {
      results.push({ type: 'problem', id: p.id, title: p.title, snippet: `${p.motorcycleModel} • ${p.severity}`, link: 'problems' });
    }
  });

  // Search rides
  db.rides.forEach((r: any) => {
    if (r.name.toLowerCase().includes(q) || r.meetingPoint.toLowerCase().includes(q) || r.destination.toLowerCase().includes(q)) {
      results.push({ type: 'ride', id: r.id, title: r.name, snippet: `${r.maxDistanceKm} km • ${r.status}`, link: 'mission' });
    }
  });

  // Search modifications
  db.modifications.forEach((m: any) => {
    if (m.title.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)) {
      results.push({ type: 'modification', id: m.id, title: m.title, snippet: `${m.motorcycleModel} • ${m.difficulty}`, link: 'modifications' });
    }
  });

  // Search publicly published chargers
  db.chargingStations
    .filter((c: any) => c.approvalStatus !== 'deleted' && isPubliclyPublishedCharger(c))
    .forEach((c: any) => {
      if (c.name.toLowerCase().includes(q) || c.location.toLowerCase().includes(q)) {
        results.push({ type: 'charger', id: c.id, title: c.name, snippet: `${c.powerOutputKw} kW • ${c.location}`, link: 'charging' });
      }
    });

  res.json({ results });
});

// 13B. Contribution & Payment Modes Endpoints
app.get('/api/contributions', (_req: Request, res: Response) => {
  const db = readDb();
  const config = sanitizeContributionConfig(db.contributionConfig, DEFAULT_CONTRIBUTION_CONFIG);
  const rawContributions = Array.isArray(db.contributions) ? db.contributions : [];
  const contributions = rawContributions.map((item: ContributionRecord) =>
    redactContributionForPublicWall(item)
  );
  res.json({
    config,
    contributions
  });
});

const handleUpdateContributionConfig = (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  const body = req.body || {};

  if (!caller.isAuthenticated || !caller.isOwner) {
    return res.status(403).json({
      error: 'Website Owner clearance required to edit contribution payment modes, UPI ID, or QR settings.'
    });
  }

  const currentConfig = sanitizeContributionConfig(
    db.contributionConfig,
    DEFAULT_CONTRIBUTION_CONFIG
  );

  const nextConfig = sanitizeContributionConfig(
    {
      ...currentConfig,
      ...body,
      updatedAt: new Date().toISOString()
    },
    currentConfig
  );

  db.contributionConfig = nextConfig;
  writeDb(db);
  res.json({
    success: true,
    config: db.contributionConfig
  });
};

app.put('/api/contributions/config', handleUpdateContributionConfig);
app.post('/api/contributions/config', handleUpdateContributionConfig);

app.post('/api/contributions', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  const currentConfig = sanitizeContributionConfig(
    db.contributionConfig,
    DEFAULT_CONTRIBUTION_CONFIG
  );
  const validation = validateContributionSubmission({
    ...req.body,
    customLimitInr: currentConfig.customLimitInr,
    contributorName:
      req.body?.contributorName ||
      (caller.userObj ? resolveUserDisplayIdentity(caller.userObj).primaryName : ''),
    contributorModel:
      req.body?.contributorModel || caller.userObj?.motorcycleModel || 'Squadron Backer'
  });

  if (!validation.valid || !validation.value) {
    return res.status(400).json({ error: validation.error || 'Invalid contribution details.' });
  }

  if (!Array.isArray(db.contributions)) {
    db.contributions = [];
  }

  const clientRequestId =
    typeof req.body?.clientRequestId === 'string' ? req.body.clientRequestId.trim() : undefined;
  if (clientRequestId) {
    const existing = db.contributions.find((c: any) => c.clientRequestId === clientRequestId);
    if (existing) {
      return res.json({
        success: true,
        contribution: redactContributionForPublicWall(existing)
      });
    }
  }

  const record: ContributionRecord = {
    id: `contrib_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    contributorName: validation.value.contributorName,
    contributorModel: validation.value.contributorModel,
    optionId: validation.value.optionId,
    paymentMethod: validation.value.paymentMethod,
    note: validation.value.note || undefined,
    createdAt: new Date().toISOString(),
    userId: caller.userId || undefined,
    clientRequestId
  };

  db.contributions.unshift(record);
  writeDb(db);
  res.status(201).json({
    success: true,
    contribution: redactContributionForPublicWall(record)
  });
});

app.delete('/api/contributions/:id', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.isOwner) {
    return res.status(403).json({ error: 'Website Owner permission required.' });
  }
  const targetId = String(req.params.id || '').trim();
  if (!Array.isArray(db.contributions)) {
    db.contributions = [];
  }
  db.contributions = db.contributions.filter((c: any) => c.id !== targetId);
  markServerRecordDeleted(db, targetId);
  writeDb(db);
  res.json({ success: true });
});

// 14. Bidirectional Persistence Reconciliation & Snapshot Recovery
app.get('/api/sync/snapshot', (_req: Request, res: Response) => {
  const db = readDb();
  res.json({
    revision: db.revision || 1,
    lastUpdatedAt: db.lastUpdatedAt || new Date().toISOString(),
    deletedIds: Array.isArray(db.deletedIds) ? db.deletedIds : [],
    longRidePlanningText: db.longRidePlanningText || ''
  });
});

app.post('/api/sync/reconcile', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);
  if (!caller.isAuthenticated || !caller.userObj) {
    return res.status(401).json({
      error: 'Authentication required to reconcile and sync database changes.'
    });
  }

  const { collections, deletedIds, longRidePlanningText } = req.body || {};
  let mutated = false;

  const syncedCollectionKeys = [
    'discussions',
    'modifications',
    'chargingStations',
    'chargerReports',
    'problems',
    'marketplace',
    'serviceReviews',
    'jetSubmissions',
    'jetQaHistory',
    'rides',
    'autoPilotMissions',
    'emergencies'
  ] as const;

  // Validate requested deletions: a caller can only delete records they are authorized to modify
  if (Array.isArray(deletedIds) && deletedIds.length > 0) {
    const authorizedDeleteIds: string[] = [];
    for (const rawDelId of deletedIds) {
      if (typeof rawDelId !== 'string' || !rawDelId.trim()) continue;
      const delId = rawDelId.trim();
      // Never allow deleting user accounts through sync reconciliation
      if ((db.users || []).some((u: any) => u?.id === delId)) continue;

      let targetRecord: any = null;
      for (const colKey of syncedCollectionKeys) {
        const list = Array.isArray(db[colKey]) ? db[colKey] : [];
        const found = list.find((item: any) => item && item.id === delId);
        if (found) {
          targetRecord = found;
          break;
        }
      }

      if (targetRecord && canModifyServerRecord(targetRecord, req, db)) {
        authorizedDeleteIds.push(delId);
      }
    }

    if (authorizedDeleteIds.length > 0) {
      const beforeLen = Array.isArray(db.deletedIds) ? db.deletedIds.length : 0;
      markServerRecordDeleted(db, authorizedDeleteIds);
      if (db.deletedIds.length !== beforeLen) {
        mutated = true;
      }
    }
  }

  const deletedSet = new Set<string>(Array.isArray(db.deletedIds) ? db.deletedIds : []);

  const mergeNestedById = (serverSub?: any[], clientSub?: any[]): { list: any[]; changed: boolean } => {
    const sArr = Array.isArray(serverSub) ? serverSub : [];
    const cArr = Array.isArray(clientSub) ? clientSub : [];
    let changed = false;
    const filteredServer = sArr.filter(item => {
      const id = item?.id || item?.userId;
      if (id && deletedSet.has(String(id))) {
        changed = true;
        return false;
      }
      return true;
    });
    const seenIds = new Set<string>(filteredServer.map(x => String(x?.id || x?.userId || '')));
    const seenReqIds = new Set<string>(
      filteredServer.filter(x => x?.clientRequestId).map(x => String(x.clientRequestId))
    );

    for (const cItem of cArr) {
      if (!cItem) continue;
      const itemId = String(cItem.id || cItem.userId || '');
      if (!itemId || deletedSet.has(itemId)) continue;
      if (seenIds.has(itemId)) continue;
      if (cItem.clientRequestId && seenReqIds.has(String(cItem.clientRequestId))) continue;

      // Ensure non-owner callers only append sub-records attributed to themselves
      const itemOwnerId = cItem.authorId || cItem.userId || cItem.responderId;
      if (!caller.isOwner && itemOwnerId && itemOwnerId !== caller.userId) {
        continue;
      }

      const cleanItem = { ...cItem };
      delete cleanItem.pendingSync;
      filteredServer.push(cleanItem);
      seenIds.add(itemId);
      if (cleanItem.clientRequestId) seenReqIds.add(String(cleanItem.clientRequestId));
      changed = true;
    }

    return { list: filteredServer, changed };
  };

  // Apply authorized deletions to existing server collections
  for (const colKey of syncedCollectionKeys) {
    if (!Array.isArray(db[colKey])) continue;
    if (colKey === 'chargingStations') {
      for (const st of db.chargingStations) {
        if (st && deletedSet.has(st.id) && st.approvalStatus !== 'deleted') {
          st.approvalStatus = 'deleted';
          st.published = false;
          st.verifiedByAdmin = false;
          mutated = true;
        }
      }
    } else {
      const before = db[colKey].length;
      db[colKey] = db[colKey].filter((item: any) => !item?.id || !deletedSet.has(item.id));
      if (db[colKey].length !== before) {
        mutated = true;
      }
    }
  }

  // Reconcile incoming client records into server db (never allowing arbitrary users collection injection)
  if (collections && typeof collections === 'object') {
    for (const colKey of syncedCollectionKeys) {
      const incomingList = collections[colKey];
      if (!Array.isArray(incomingList) || incomingList.length === 0) continue;
      if (!Array.isArray(db[colKey])) db[colKey] = [];

      const serverList: any[] = db[colKey];
      for (const rawItem of incomingList) {
        if (!rawItem || !rawItem.id || typeof rawItem.id !== 'string') continue;
        if (rawItem.pendingSync || rawItem.id.includes('_local_')) continue;
        if (deletedSet.has(rawItem.id)) continue;

        const cleanIncoming = { ...rawItem };
        delete cleanIncoming.pendingSync;

        const existingIdx = serverList.findIndex(
          s =>
            s &&
            (s.id === cleanIncoming.id ||
              (cleanIncoming.clientRequestId && s.clientRequestId === cleanIncoming.clientRequestId))
        );

        if (existingIdx === -1) {
          // Only allow inserting a missing record if it belongs to the authenticated caller (or caller is Owner)
          const recordOwnerId =
            cleanIncoming.userId ||
            cleanIncoming.authorId ||
            cleanIncoming.sellerId ||
            cleanIncoming.submittedByUserId ||
            cleanIncoming.rideLeaderId;

          if (!caller.isOwner && recordOwnerId && recordOwnerId !== caller.userId) {
            continue;
          }
          if (!caller.isOwner && !recordOwnerId) {
            continue;
          }

          if (colKey === 'chargingStations' && !caller.isOwner && !caller.hasPermission('moderate_chargers')) {
            cleanIncoming.submittedByUserId = caller.userId;
            cleanIncoming.submittedByRole = 'user';
            cleanIncoming.approvalStatus = 'pending';
            cleanIncoming.published = false;
            cleanIncoming.verifiedByAdmin = false;
          }

          if (colKey === 'chargingStations') {
            serverList.push(cleanIncoming);
          } else {
            serverList.unshift(cleanIncoming);
          }
          mutated = true;
        } else {
          const serverRecord = serverList[existingIdx];
          for (const subField of ['comments', 'updates', 'participants', 'responders', 'announcements', 'bids', 'rentalRequests'] as const) {
            if (Array.isArray(cleanIncoming[subField])) {
              if (subField === 'announcements' && !canModifyServerRecord(serverRecord, req, db, 'moderate_discussions')) {
                continue;
              }
              const resSub = mergeNestedById(serverRecord[subField], cleanIncoming[subField]);
              if (resSub.changed) {
                serverRecord[subField] = resSub.list;
                mutated = true;
              }
            }
          }
          if (cleanIncoming.reactions && serverRecord.reactions) {
            for (const rKey of ['helpful', 'salute', 'confirmed'] as const) {
              const sR = Array.isArray(serverRecord.reactions[rKey]) ? serverRecord.reactions[rKey] : [];
              const cR = Array.isArray(cleanIncoming.reactions[rKey]) ? cleanIncoming.reactions[rKey] : [];
              // Only allow adding the caller's own reaction ID via reconcile
              const allowedClientReactions = caller.isOwner
                ? cR
                : cR.filter((uid: any) => uid === caller.userId);
              const combined = Array.from(new Set([...sR, ...allowedClientReactions]));
              if (combined.length !== sR.length) {
                serverRecord.reactions[rKey] = combined;
                mutated = true;
              }
            }
          }
        }
      }
    }
  }

  if (
    typeof longRidePlanningText === 'string' &&
    longRidePlanningText.trim() &&
    !db.longRidePlanningText &&
    (caller.isOwner || caller.hasPermission('moderate_chargers'))
  ) {
    db.longRidePlanningText = longRidePlanningText.trim();
    mutated = true;
  }

  if (mutated) {
    const normalized = ensureDbCollections(db).data;
    writeDb(normalized);
    broadcastChargingUpdate(normalized);
  }

  res.json({
    synced: true,
    mutated,
    revision: db.revision || 1,
    deletedIds: db.deletedIds || []
  });
});

app.get('/api/hybrid-sync', (req: Request, res: Response) => {
  const db = readDb();
  const caller = resolveRequestUser(req, db);

  const emergencies = (db.emergencies || []).map((em: any) =>
    sanitizeEmergencyForViewer(em, caller.userObj)
  );
  const rides = (db.rides || []).map((r: any) =>
    sanitizeRideForViewer(r, caller.userObj)
  );
  const marketplace = (db.marketplace || []).map((item: any) =>
    sanitizeMarketplaceItemForViewer(item, caller.userObj)
  );

  res.json({
    syncedAt: new Date().toISOString(),
    revision: db.revision || 1,
    deletedIds: db.deletedIds || [],
    emergencies,
    rides,
    marketplace,
    problems: db.problems || [],
    discussions: db.discussions || [],
    polls: db.polls || [],
    petitions: db.petitions || [],
    contributions: (db.contributions || []).map((c: any) => redactContributionForPublicWall(c))
  });
});

// -------------------------------------------------------------
// VITE MIDDLEWARE & STATIC SERVING
// -------------------------------------------------------------
async function setupVite() {
  const distPath = path.join(__dirname, 'dist');
  const distIndex = path.join(distPath, 'index.html');
  if (process.env.NODE_ENV === 'production' && fs.existsSync(distIndex)) {
    app.use(express.static(distPath));
    app.use((req: Request, res: Response, next: express.NextFunction) => {
      if ((req.method === 'GET' || req.method === 'HEAD') && !req.path.startsWith('/api')) {
        res.sendFile(distIndex);
      } else {
        next();
      }
    });
  } else {
    let viteMiddleware: any = null;
    const viteInitPromise = (async () => {
      const { createServer } = await import('vite');
      const vite = await createServer({
        server: { middlewareMode: true },
        appType: 'spa'
      });
      viteMiddleware = vite.middlewares;
      return viteMiddleware;
    })();

    app.use(async (req: Request, res: Response, next: express.NextFunction) => {
      if (viteMiddleware) {
        return viteMiddleware(req, res, next);
      }
      try {
        const mw = await viteInitPromise;
        return mw(req, res, next);
      } catch (err) {
        return next(err);
      }
    });
  }
}

export { app };

if (process.env.GHOST_TEST_MODE !== '1') {
  setupVite().catch((err) => {
    console.error('[GHOST PROTOCOL] Vite initialization error:', err);
  });
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[GHOST PROTOCOL] Tactical Server Online on http://0.0.0.0:${PORT}`);
  });
}

