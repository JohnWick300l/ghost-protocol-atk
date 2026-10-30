import {
  BloodGroup,
  UserRole,
  VerificationStatus,
  RiderStatus,
  RideStatus,
  RiderParticipant,
  PilotNickname,
  AdminPermission,
  ContributionConfig,
  ContributionRecord,
  ChargerReservation,
  CommunityChargerCostUnit,
  CommunityChargerPricingType,
  ChargerReservationStatus
} from '../utils/rules';

export type {
  RiderParticipant,
  PilotNickname,
  AdminPermission,
  ContributionConfig,
  ContributionRecord,
  ChargerReservation,
  CommunityChargerCostUnit,
  CommunityChargerPricingType,
  ChargerReservationStatus
};

export interface User {
  id: string;
  fullName: string; // Effective primary display name
  originalName?: string; // Immutable original account display name
  customPrimaryName?: string | null; // Owner-assigned primary name override
  pilotNickname?: PilotNickname | string | null; // Member-selected 'F77 PILOT' / 'X47 PILOT' or Owner custom nickname
  customSecondaryTag?: string | null; // Owner-assigned secondary nickname/tag override
  hideSecondaryTag?: boolean; // Owner option to display no secondary tag
  secondaryTag?: string | null; // Resolved effective secondary tag
  email: string;
  mobile: string;
  city: string;
  state: string;
  motorcycleModel: 'F77' | 'X47';
  variant: string;
  registrationNumber: string; // Private
  purchaseDate?: string;
  accountType?: 'customer' | 'employee';
  employeeId?: string;
  department?: string;
  communityChargerOptIn?: boolean;
  communityChargerDetails?: {
    pricingType: 'Free' | 'Charged' | 'Paid';
    chargingCostAmount?: number;
    chargingCostUnit?: CommunityChargerCostUnit;
    availabilityStartTime?: string;
    availabilityEndTime?: string;
    availabilityDays?: string;
    availabilityTimeText?: string;
    requiresReservation?: boolean;
    chargerType: 'Boost charger' | 'Standard charger' | 'Only socket';
    town: string;
    latitude?: number;
    longitude?: number;
  };
  proofDocumentUrl?: string; // Private
  rcDocumentUrl?: string; // Private RC Document
  rcDocumentName?: string; // Private RC Document filename
  rcExpiryDate?: string; // Private RC expiry
  insuranceDocumentUrl?: string; // Private Insurance Document
  insuranceDocumentName?: string; // Private Insurance filename
  insuranceProvider?: string; // Private Insurance provider
  insurancePolicyNumber?: string; // Private Insurance policy number
  insuranceExpiryDate?: string; // Private Insurance expiry
  bloodGroup: BloodGroup; // Private
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
    secondaryName?: string;
    secondaryPhone?: string;
  }; // Private
  role: UserRole;
  isOwner?: boolean;
  adminPermissions?: AdminPermission[];
  adminAppointedAt?: string;
  adminAppointedBy?: string;
  verificationStatus: VerificationStatus;
  verificationNotes?: string;
  verifiedAt?: string;
  joinedAt: string;
  avatarUrl?: string;
  optInSquadronAssist: boolean;
  hasPassword?: boolean;
  requiresPasswordSetup?: boolean;
  privacySettings: {
    showStartingPoint: boolean;
    showCity: boolean;
    showMotorcycleDetails: boolean;
  };
}

export interface EmergencyRequest {
  id: string;
  userId: string;
  requesterName: string;
  requesterModel: string;
  category: 
    | 'Motorcycle breakdown'
    | 'Charging problem'
    | 'Puncture or tyre problem'
    | 'Motorcycle will not start'
    | 'Stranded rider'
    | 'Accident'
    | 'Road hazard'
    | 'Other assistance';
  description: string;
  locationName: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  callbackPhone?: string;
  photoUrl?: string;
  status: 'Submitted' | 'Notified' | 'Acknowledged' | 'Assistance Arranged' | 'Resolved' | 'Cancelled';
  notifiedCount: number;
  notifiedCityUsers?: {
    id: string;
    name: string;
    city: string;
    role?: string;
  }[];
  adminAlerted?: boolean;
  adminAlertedAt?: string;
  adminNotifiedCount?: number;
  searchRadiusKm: number;
  responderId?: string;
  responderName?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  accessLogs: {
    userId: string;
    userName: string;
    accessedAt: string;
    reason: string;
  }[];
}

export interface Ride {
  id: string;
  name: string;
  description: string;
  rideDate: string;
  startTime: string;
  meetingPoint: string;
  meetingPointLat?: number;
  meetingPointLng?: number;
  meetingPointGmapsUrl?: string;
  destination: string;
  destinationLat?: number;
  destinationLng?: number;
  destinationGmapsUrl?: string;
  plannedRoute: string;
  maxDistanceKm: number;
  estimatedReturnTime?: string;
  maxRiders: number;
  rideLeaderId: string;
  rideLeaderName: string;
  specialInstructions?: string;
  pace: 'Relaxed' | 'Moderate' | 'Spirited';
  stops?: {
    id: string;
    name: string;
    address?: string;
    lat?: number;
    lng?: number;
    notes?: string;
    googleMapsUrl?: string;
  }[];
  chargingStops: {
    id?: string;
    locationName: string;
    chargerType: string;
    lat?: number;
    lng?: number;
    notes?: string;
    googleMapsUrl?: string;
  }[];
  routeGmapsUrl?: string;
  checklistConfig: string[];
  status: RideStatus;
  cancellationReason?: string;
  actualDepartureTime?: string;
  completedAt?: string;
  participants: RiderParticipant[];
  announcements: {
    id: string;
    senderName: string;
    message: string;
    timestamp: string;
    urgent: boolean;
  }[];
  createdAt: string;
}

export type RideSortie = Ride;

export interface JetEngineerSubmission {
  id: string;
  userId: string;
  authorName: string;
  title: string;
  motorcycleModel: string;
  variant?: string;
  symptoms: string;
  operatingConditions: string;
  troubleshootingAttempted: string;
  serviceCentreFindings?: string;
  resolutionOutcome: string;
  proposedSolution: string;
  photoUrl?: string;
  stepPhotos?: string[];
  sourceReferences?: string;
  status: 'Submitted' | 'Under Review' | 'Needs More Information' | 'Approved' | 'Rejected' | 'Archived';
  reviewerNotes?: string;
  reviewerId?: string;
  createdAt: string;
  reviewedAt?: string;
  isPreset?: boolean;
  presetUpdatedAt?: string;
  presetUpdatedBy?: string;
}

export interface ProblemReport {
  id: string;
  priorityOrder?: number;
  userId: string;
  reporterName: string;
  motorcycleModel: string;
  variant?: string;
  category: 'Battery & Power' | 'Motor & Drivetrain' | 'Console & Software' | 'Braking & ABS' | 'Suspension & Chassis' | 'Charging System';
  title: string;
  description: string;
  firstObservedDate: string;
  mileageKm?: number;
  warningMessageOrCode?: string;
  severity: 'Informational' | 'Low' | 'Moderate' | 'High' | 'Critical / Safety-Related';
  isRecurring: boolean;
  troubleshootingAttempted?: string;
  serviceVisits?: string;
  status: 'Reported' | 'Under Investigation' | 'Service Scheduled' | 'Resolved' | 'Recurring';
  resolvedDate?: string;
  updates: {
    id: string;
    authorName: string;
    date: string;
    note: string;
    mediaUrls?: string[];
  }[];
  photoUrl?: string;
  videoUrl?: string;
  mediaUrls?: string[];
  createdAt: string;
}

export interface ProductLink {
  url: string;
  name?: string;
}

export interface ModificationItem {
  id: string;
  title: string;
  motorcycleModel: string;
  variant?: string;
  component: 'Aesthetics & Bodywork' | 'Luggage & Touring' | 'Ergonomics & Controls' | 'Crash Protection';
  difficulty: 'Plug & Play' | 'Intermediate' | 'Advanced' | 'Professional Installation Required';
  costRange: 'Under ₹2,000' | '₹2,000 - ₹5,000' | '₹5,000 - ₹15,000' | '₹15,000+';
  compatibilityStatus: 'Verified Compatible' | 'Requires Modification' | 'Experimental';
  isOfficialAccessory: boolean;
  description: string;
  partsUsed: string;
  installationGuide: string;
  safetyConsiderations: string;
  warrantyConsiderations: string;
  authorName: string;
  createdAt: string;
  imageUrl?: string;
  imageUrls?: string[];
  productLinks?: ProductLink[];
  shopName?: string;
  shopMapLink?: string;
  shopNumber?: string;
}

export type ChargerPlugType = 'Supernova' | 'Type 6' | 'Type 2' | 'Socket';

export interface ChargingStation {
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
  accessConditions: 'Public 24/7' | 'Commercial Hours Only' | 'Security Permission Required' | 'Private/Restricted';
  pricing?: string;
  pricingType?: 'Free' | 'Charged' | 'Paid';
  chargingCostAmount?: number;
  chargingCostUnit?: CommunityChargerCostUnit;
  availabilityStartTime?: string;
  availabilityEndTime?: string;
  availabilityDays?: string;
  availabilityTimeText?: string;
  requiresReservation?: boolean;
  reservations?: ChargerReservation[];
  lastVerifiedDate: string;
  userNotes?: string;
  reportedBy?: string;
}

export interface MarketplaceItem {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerVerified: boolean;
  listingType?: 'buy' | 'rent' | 'auction';
  title: string;
  description: string;
  category: string;
  price: number;
  condition: string;
  compatibleModel: string;
  generalLocation: string;
  contactPhone?: string;
  contactEmail?: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  imageUrl?: string;
  imageUrls?: string[];
  // Rental-specific fields
  costPerDay?: number;
  securityDeposit?: number;
  minRentalDays?: number;
  maxRentalDays?: number;
  rentalRules?: string;
  rentalAvailability?: 'Available Now' | 'Currently Rented' | 'Booked Upcoming';
  rentalRequests?: {
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
  }[];
  // Auction-specific fields
  startingBid?: number;
  currentBid?: number;
  minBidIncrement?: number;
  reservePrice?: number;
  auctionEndTime?: string;
  auctionStatus?: 'active' | 'awarded' | 'closed';
  winnerBidId?: string;
  winnerUserId?: string;
  winnerName?: string;
  winnerPhone?: string;
  winnerEmail?: string;
  winningBidAmount?: number;
  awardedAt?: string;
  bids?: {
    id: string;
    bidderId: string;
    bidderName: string;
    bidderModel?: string;
    bidderPhone?: string;
    bidderEmail?: string;
    amount: number;
    note?: string;
    createdAt: string;
  }[];
}

export interface ServiceReview {
  id: string;
  userId: string;
  authorName: string;
  serviceCentreName: string;
  generalLocation: string;
  motorcycleModel: string;
  visitDate: string;
  issueReported: string;
  workPerformed: string;
  issueResolved: boolean;
  turnaroundDays: number;
  customerRating: number; // 1-5
  notes: string;
  positiveFeedback?: string;
  negativeFeedback?: string;
  preferredServiceAdvisor?: string;
  createdAt: string;
}

export interface DiscussionPost {
  id: string;
  authorId: string;
  authorName: string;
  authorModel: string;
  category: 
    | 'General Discussion'
    | 'Technical Help'
    | 'Battery & Charging'
    | 'Software & Dashboard'
    | 'Service & Repairs'
    | 'Accessories'
    | 'Modifications'
    | 'Riding & Touring'
    | 'Safety'
    | 'Ownership Experience';
  title: string;
  content: string;
  tags: string[];
  pinned?: boolean;
  reactions: {
    helpful: string[];
    salute: string[];
    confirmed: string[];
  };
  comments: {
    id: string;
    authorId: string;
    authorName: string;
    content: string;
    createdAt: string;
  }[];
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'system' | 'emergency' | 'mission' | 'jet_engineer' | 'discussion' | 'verification';
  title: string;
  message: string;
  link?: string;
  city?: string;
  emergencyId?: string;
  isAdminAlert?: boolean;
  priority?: 'normal' | 'high' | 'critical';
  read: boolean;
  createdAt: string;
}

export interface TelemetryConfig {
  batterySoc: boolean;
  estimatedRange: boolean;
  motorTemp: boolean;
  regenLevel: boolean;
  odometer: boolean;
  avionicsHealth: boolean;
}

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

export type { VisitedDestinationRecord, DestinationPresetTheme } from '../utils/rules';

