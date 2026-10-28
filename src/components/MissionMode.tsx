import React, { useState, useEffect, useMemo } from 'react';
import {
  Compass,
  MapPin,
  Calendar,
  Clock,
  Users,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Radio,
  Zap,
  Award,
  CheckSquare,
  Square,
  Send,
  Sparkles,
  UserPlus,
  UserMinus,
  ExternalLink,
  Camera,
  Navigation,
  Route,
  Upload,
  Search,
  Check,
  X,
  Info
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { RideSortie, RiderParticipant, VisitedDestinationRecord, DestinationPresetTheme } from '../types';
import {
  calculateRideStatusSummary,
  evaluateRideCompletion,
  validateRideDistance,
  resolveUserDisplayIdentity,
  joinSortieRoster,
  leaveOrBackOffSortieRoster,
  validateVisitedDestinationSubmission,
  createDestinationPresetIllustration,
  DEFAULT_VISITED_DESTINATIONS
} from '../utils/rules';
import {
  CACHE_KEYS,
  loadFromCache,
  saveToCache,
  gpApiFetch,
  saveFormDraft,
  loadFormDraft,
  clearFormDraft,
  getSessionAuthHeaders
} from '../utils/telemetryCache';

const CREATE_RIDE_DRAFT_KEY = 'mission_create_ride_v2';
const UPLOAD_DEST_DRAFT_KEY = 'mission_upload_destination_v1';
const LOCAL_GUEST_RIDERS_STORAGE_KEY = 'ghost_mission_local_rider_registrations_v1';

interface LocalRiderIdentity {
  userId: string;
  participantId?: string;
  displayName: string;
  motorcycleModel: string;
}

function readLocalRiderMap(): Record<string, LocalRiderIdentity> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_GUEST_RIDERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalRiderMap(map: Record<string, LocalRiderIdentity>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_GUEST_RIDERS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

const CHARGER_OPTION_CHIPS = [
  'UV Supernova',
  'CCS2 / Fast Charger',
  '15A 3-Pin Socket',
  'Community Charger',
  'Single Charge Capable'
];

const PRESET_THEME_OPTIONS: { id: DestinationPresetTheme; label: string }[] = [
  { id: 'mountain_ghat', label: 'Mountain Ghat / Hills' },
  { id: 'coastal_highway', label: 'Coastal Highway / Beach' },
  { id: 'coffee_estate', label: 'Coffee Estate / Forest' },
  { id: 'heritage_temple', label: 'Heritage / Temple Trail' },
  { id: 'lakeside_dam', label: 'Lakeside / Dam Reservoir' }
];

export const MissionMode: React.FC = () => {
  const { currentUser, refreshNotifications } = useAuth();

  // Top-level sub-page switcher: 'sorties' vs 'destinations'
  const [activeSubPage, setActiveSubPage] = useState<'sorties' | 'destinations'>('sorties');

  // Sorties state
  const [rides, setRides] = useState<RideSortie[]>(() =>
    loadFromCache<RideSortie[]>(CACHE_KEYS.RIDES, [])
  );
  const [selectedRideId, setSelectedRideId] = useState<string | null>(() => {
    const cached = loadFromCache<RideSortie[]>(CACHE_KEYS.RIDES, []);
    return cached.length > 0 ? cached[0].id : null;
  });
  const [loading, setLoading] = useState(() =>
    loadFromCache<RideSortie[]>(CACHE_KEYS.RIDES, []).length === 0
  );

  // Local map of rideId -> rider identity so any user (even guest/visitor) can join & back off seamlessly
  const [localRiderMap, setLocalRiderMap] = useState<Record<string, LocalRiderIdentity>>(() =>
    readLocalRiderMap()
  );

  // Modals & banners
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showBackOffModal, setShowBackOffModal] = useState(false);
  const [backOffReason, setBackOffReason] = useState('');
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  // Join Sortie Form State
  const [joinForm, setJoinForm] = useState({
    displayName: '',
    motorcycleModel: 'F77 MACH 2',
    variant: 'Recon',
    startingPoint: '',
    shareStartingPoint: true,
    intercomStatus: 'Has an intercom' as RiderParticipant['intercomStatus'],
    intercomModel: '',
    notes: ''
  });

  // Create Ride Form State
  const [createForm, setCreateForm] = useState(() =>
    loadFormDraft(CREATE_RIDE_DRAFT_KEY, {
      name: '',
      description: '',
      rideDate: '',
      startTime: '06:00',
      meetingPoint: '',
      destination: '',
      plannedRoute: '',
      maxDistanceKm: '',
      estimatedReturnTime: '12:30',
      maxRiders: 15,
      specialInstructions: '',
      pace: 'Moderate' as RideSortie['pace'],
      chargingStopLocation: '',
      chargingStopType: 'Supernova' as 'Supernova' | '15A Socket' | 'Fast Charger',
      chargingStopNotes: '',
      organizerName: ''
    })
  );
  const [createError, setCreateError] = useState('');

  // Leader Announcement State
  const [announcementText, setAnnouncementText] = useState('');

  // Visited Destinations Sub-Page State
  const [visitedDestinations, setVisitedDestinations] = useState<VisitedDestinationRecord[]>(() =>
    loadFromCache<VisitedDestinationRecord[]>(
      CACHE_KEYS.VISITED_DESTINATIONS,
      DEFAULT_VISITED_DESTINATIONS
    )
  );
  const [destSearchQuery, setDestSearchQuery] = useState('');
  const [showUploadDestModal, setShowUploadDestModal] = useState(false);
  const [uploadDestError, setUploadDestError] = useState('');
  const [destForm, setDestForm] = useState(() =>
    loadFormDraft(UPLOAD_DEST_DRAFT_KEY, {
      title: '',
      startingPoint: 'Bengaluru',
      totalDistanceKm: '',
      chargingOptionsOnWay: '',
      chargerTypesUsed: ['UV Supernova', '15A 3-Pin Socket'] as string[],
      locationMapUrl: '',
      routeSummary: '',
      riderTips: '',
      bestTimeToVisit: 'Early Morning (05:30 AM – 10:00 AM)',
      authorName: '',
      authorModel: 'F77 MACH 2',
      presetTheme: 'mountain_ghat' as DestinationPresetTheme,
      customPhotoUrl: '',
      uploadedPhotos: [] as string[]
    })
  );

  useEffect(() => {
    saveFormDraft(CREATE_RIDE_DRAFT_KEY, createForm);
  }, [createForm]);

  useEffect(() => {
    saveFormDraft(UPLOAD_DEST_DRAFT_KEY, destForm);
  }, [destForm]);

  // Pre-fill user details when currentUser changes
  useEffect(() => {
    if (currentUser) {
      const displayName = resolveUserDisplayIdentity(currentUser).primaryName;
      setJoinForm(prev => ({
        ...prev,
        displayName: prev.displayName || displayName,
        motorcycleModel: currentUser.motorcycleModel || prev.motorcycleModel || 'F77 MACH 2',
        variant: currentUser.variant || prev.variant || 'Recon',
        startingPoint: prev.startingPoint || currentUser.city || ''
      }));
    }
  }, [currentUser]);

  const fetchRides = async () => {
    try {
      const res = await gpApiFetch('/api/rides');
      if (res.ok) {
        const data = await res.json();
        const serverRides: RideSortie[] = Array.isArray(data?.rides) ? data.rides : [];
        if (serverRides.length > 0) {
          setRides(serverRides);
          saveToCache(CACHE_KEYS.RIDES, serverRides);
          if (!selectedRideId) {
            setSelectedRideId(serverRides[0].id);
          }
        }
      }
    } catch {
      const cached = loadFromCache<RideSortie[]>(CACHE_KEYS.RIDES, []);
      if (cached.length > 0) setRides(cached);
    } finally {
      setLoading(false);
    }
  };

  const fetchVisitedDestinations = async () => {
    try {
      const res = await gpApiFetch('/api/mission/destinations');
      if (res.ok) {
        const data = await res.json();
        const list: VisitedDestinationRecord[] = Array.isArray(data?.destinations)
          ? data.destinations
          : [];
        if (list.length > 0) {
          setVisitedDestinations(list);
          saveToCache(CACHE_KEYS.VISITED_DESTINATIONS, list);
        }
      }
    } catch {
      const cached = loadFromCache<VisitedDestinationRecord[]>(
        CACHE_KEYS.VISITED_DESTINATIONS,
        DEFAULT_VISITED_DESTINATIONS
      );
      if (cached.length > 0) setVisitedDestinations(cached);
    }
  };

  useEffect(() => {
    fetchRides();
    fetchVisitedDestinations();
  }, []);

  const selectedRide = useMemo(
    () => rides.find(r => r.id === selectedRideId) || rides[0] || null,
    [rides, selectedRideId]
  );

  // Determine if the current user (authenticated OR local guest rider) is joined in the selected ride
  const myParticipant: RiderParticipant | undefined = useMemo(() => {
    if (!selectedRide) return undefined;
    const participants = Array.isArray(selectedRide.participants) ? selectedRide.participants : [];

    // 1. Check authenticated user ID
    if (currentUser?.id) {
      const byAuthId = participants.find(p => p.userId === currentUser.id);
      if (byAuthId) return byAuthId;
    }

    // 2. Check stored local rider registration for this ride
    const localEntry = localRiderMap[selectedRide.id];
    if (localEntry) {
      const byLocal = participants.find(
        p =>
          (localEntry.userId && p.userId === localEntry.userId) ||
          (localEntry.participantId && p.id === localEntry.participantId) ||
          (localEntry.displayName &&
            p.displayName.toLowerCase() === localEntry.displayName.toLowerCase())
      );
      if (byLocal) return byLocal;
    }

    return undefined;
  }, [selectedRide, currentUser, localRiderMap]);

  const isJoinedInSelectedRide = Boolean(myParticipant);
  const isRideLeader = Boolean(
    selectedRide &&
      currentUser &&
      (selectedRide.rideLeaderId === currentUser.id || currentUser.role === 'admin')
  );

  const saveUpdatedRideToStateAndCache = (updatedRide: RideSortie) => {
    const exists = rides.some(r => r.id === updatedRide.id);
    const next = exists
      ? rides.map(r => (r.id === updatedRide.id ? updatedRide : r))
      : [updatedRide, ...rides];
    setRides(next);
    saveToCache(CACHE_KEYS.RIDES, next);
  };

  // Join Sortie Handler (works for both signed-in users and guests/visitors anytime)
  const handleJoinRide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRide) return;

    const resolvedName = currentUser
      ? resolveUserDisplayIdentity(currentUser).primaryName
      : joinForm.displayName.trim();

    if (!resolvedName || resolvedName.length < 2) {
      setFeedbackBanner({
        type: 'error',
        text: 'Please enter your name so the Ride Leader and squadron know who is joining.'
      });
      return;
    }

    const existingLocal = localRiderMap[selectedRide.id];
    const resolvedUserId =
      currentUser?.id || existingLocal?.userId || `rider_${Date.now()}`;

    const payload = {
      userId: resolvedUserId,
      displayName: resolvedName,
      motorcycleModel: joinForm.motorcycleModel || currentUser?.motorcycleModel || 'F77 MACH 2',
      variant: joinForm.variant || currentUser?.variant || '',
      startingPoint: joinForm.startingPoint.trim(),
      shareStartingPoint: joinForm.shareStartingPoint,
      intercomStatus: joinForm.intercomStatus,
      intercomModel: joinForm.intercomModel.trim(),
      notes: joinForm.notes.trim()
    };

    try {
      const res = await fetch(`/api/rides/${selectedRide.id}/join`, {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.ride) {
          saveUpdatedRideToStateAndCache(data.ride);
          const nextMap = {
            ...localRiderMap,
            [selectedRide.id]: {
              userId: data.participant?.userId || resolvedUserId,
              participantId: data.participant?.id,
              displayName: resolvedName,
              motorcycleModel: payload.motorcycleModel
            }
          };
          setLocalRiderMap(nextMap);
          writeLocalRiderMap(nextMap);
          setShowJoinModal(false);
          setFeedbackBanner({
            type: 'success',
            text: `You have joined "${selectedRide.name}"! You can update your status or cancel/back off anytime if your plans change.`
          });
          return;
        }
      }
    } catch {
      // Fallback to local helper below
    }

    // Offline / local fallback using joinSortieRoster
    const fallbackResult = joinSortieRoster(selectedRide, payload);
    if (!fallbackResult.valid || !fallbackResult.updatedRide) {
      setFeedbackBanner({
        type: 'error',
        text: fallbackResult.error || 'Could not join this ride.'
      });
      return;
    }

    saveUpdatedRideToStateAndCache(fallbackResult.updatedRide);
    const nextMap = {
      ...localRiderMap,
      [selectedRide.id]: {
        userId: fallbackResult.participant?.userId || resolvedUserId,
        participantId: fallbackResult.participant?.id,
        displayName: resolvedName,
        motorcycleModel: payload.motorcycleModel
      }
    };
    setLocalRiderMap(nextMap);
    writeLocalRiderMap(nextMap);
    setShowJoinModal(false);
    setFeedbackBanner({
      type: 'success',
      text: `You have joined "${selectedRide.name}"! You can cancel or back off anytime if you can't make it.`
    });
  };

  // Cancel / Back Off from Sortie Handler
  const handleBackOffRide = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedRide || !myParticipant) return;

    const payload = {
      userId: myParticipant.userId,
      participantId: myParticipant.id,
      displayName: myParticipant.displayName,
      reason: backOffReason.trim()
    };

    try {
      const res = await fetch(`/api/rides/${selectedRide.id}/leave`, {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.ride) {
          saveUpdatedRideToStateAndCache(data.ride);
          const nextMap = { ...localRiderMap };
          delete nextMap[selectedRide.id];
          setLocalRiderMap(nextMap);
          writeLocalRiderMap(nextMap);
          setShowBackOffModal(false);
          setBackOffReason('');
          setFeedbackBanner({
            type: 'info',
            text: `You have backed off from "${selectedRide.name}". You can rejoin anytime if your schedule clears up.`
          });
          return;
        }
      }
    } catch {
      // Fallback to local helper below
    }

    const fallbackLeave = leaveOrBackOffSortieRoster(selectedRide, payload);
    if (fallbackLeave.valid && fallbackLeave.updatedRide) {
      saveUpdatedRideToStateAndCache(fallbackLeave.updatedRide);
      const nextMap = { ...localRiderMap };
      delete nextMap[selectedRide.id];
      setLocalRiderMap(nextMap);
      writeLocalRiderMap(nextMap);
      setShowBackOffModal(false);
      setBackOffReason('');
      setFeedbackBanner({
        type: 'info',
        text: `You have backed off from "${selectedRide.name}". You can rejoin anytime if your schedule clears up.`
      });
    }
  };

  // Update Rider Status
  const handleUpdateStatus = async (status: RiderParticipant['status']) => {
    if (!selectedRide || !myParticipant) return;
    try {
      const res = await fetch(`/api/rides/${selectedRide.id}/status`, {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          userId: myParticipant.userId,
          participantId: myParticipant.id,
          status
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ride) {
          saveUpdatedRideToStateAndCache(data.ride);
          refreshNotifications();
          return;
        }
      }
    } catch {
      // Local fallback
    }

    const updatedRide: RideSortie = {
      ...selectedRide,
      participants: selectedRide.participants.map(p =>
        p.id === myParticipant.id || p.userId === myParticipant.userId
          ? { ...p, status, statusUpdatedAt: new Date().toISOString() }
          : p
      )
    };
    saveUpdatedRideToStateAndCache(updatedRide);
  };

  // Confirm Safe Arrival Home
  const handleSafeArrival = async () => {
    if (!selectedRide || !myParticipant) return;
    try {
      const res = await fetch(`/api/rides/${selectedRide.id}/safe-arrival`, {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          userId: myParticipant.userId,
          participantId: myParticipant.id
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ride) {
          saveUpdatedRideToStateAndCache(data.ride);
          refreshNotifications();
          setFeedbackBanner({
            type: 'success',
            text: 'Safe arrival home confirmed! The Ride Leader and squadron have been updated.'
          });
          return;
        }
      }
    } catch {
      // Local fallback
    }

    const now = new Date().toISOString();
    const updatedRide: RideSortie = {
      ...selectedRide,
      participants: selectedRide.participants.map(p =>
        p.id === myParticipant.id || p.userId === myParticipant.userId
          ? {
              ...p,
              status: 'Reached Home Safely',
              safeArrivalConfirmedAt: now,
              statusUpdatedAt: now
            }
          : p
      )
    };
    saveUpdatedRideToStateAndCache(updatedRide);
    setFeedbackBanner({
      type: 'success',
      text: 'Safe arrival home confirmed!'
    });
  };

  // Toggle Pre-Ride Checklist
  const handleToggleChecklist = async (completed: boolean) => {
    if (!selectedRide || !myParticipant) return;
    try {
      const res = await fetch(`/api/rides/${selectedRide.id}/checklist`, {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          completed,
          userId: myParticipant.userId,
          participantId: myParticipant.id
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ride) {
          saveUpdatedRideToStateAndCache(data.ride);
          return;
        }
      }
    } catch {
      // Local fallback
    }

    const updatedRide: RideSortie = {
      ...selectedRide,
      participants: selectedRide.participants.map(p =>
        p.id === myParticipant.id || p.userId === myParticipant.userId
          ? { ...p, checklistCompleted: completed, statusUpdatedAt: new Date().toISOString() }
          : p
      )
    };
    saveUpdatedRideToStateAndCache(updatedRide);
  };

  // Organize New Group Ride
  const handleCreateRide = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    const distanceValidation = validateRideDistance(createForm.maxDistanceKm);
    if (!distanceValidation.valid) {
      setCreateError(distanceValidation.error || 'Invalid distance in kilometres.');
      return;
    }

    const chargingStops = createForm.chargingStopLocation
      ? [
          {
            locationName: createForm.chargingStopLocation,
            chargerType: createForm.chargingStopType,
            notes: createForm.chargingStopNotes
          }
        ]
      : [];

    const organizerName = currentUser
      ? resolveUserDisplayIdentity(currentUser).primaryName
      : createForm.organizerName.trim() || 'Squadron Rider';

    try {
      const res = await fetch('/api/rides', {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...createForm,
          organizerName,
          organizerModel: currentUser?.motorcycleModel || 'F77 MACH 2',
          maxDistanceKm: distanceValidation.value,
          chargingStops
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.ride) {
          saveUpdatedRideToStateAndCache(data.ride);
          setSelectedRideId(data.ride.id);
          const leaderParticipant = data.ride.participants?.[0];
          if (leaderParticipant) {
            const nextMap = {
              ...localRiderMap,
              [data.ride.id]: {
                userId: leaderParticipant.userId,
                participantId: leaderParticipant.id,
                displayName: leaderParticipant.displayName,
                motorcycleModel: leaderParticipant.motorcycleModel
              }
            };
            setLocalRiderMap(nextMap);
            writeLocalRiderMap(nextMap);
          }
          clearFormDraft(CREATE_RIDE_DRAFT_KEY);
          setShowCreateModal(false);
          setFeedbackBanner({
            type: 'success',
            text: `New group ride "${data.ride.name}" published and open for riders!`
          });
          return;
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setCreateError(err.error || 'Could not create group ride.');
        return;
      }
    } catch {
      // Offline fallback creation
      const leaderId = currentUser?.id || `guest_leader_${Date.now()}`;
      const fallbackRide: RideSortie = {
        id: `ride_${Date.now()}`,
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        rideDate: createForm.rideDate || new Date().toISOString().split('T')[0],
        startTime: createForm.startTime || '06:00',
        meetingPoint: createForm.meetingPoint.trim(),
        destination: createForm.destination.trim(),
        plannedRoute:
          createForm.plannedRoute.trim() ||
          `${createForm.meetingPoint.trim()} → ${createForm.destination.trim()}`,
        maxDistanceKm: distanceValidation.value || 100,
        estimatedReturnTime: createForm.estimatedReturnTime,
        maxRiders: Number(createForm.maxRiders) || 15,
        rideLeaderId: leaderId,
        rideLeaderName: organizerName,
        specialInstructions: createForm.specialInstructions,
        pace: createForm.pace,
        chargingStops,
        checklistConfig: [
          'Battery SoC > 90% and voltage delta verified',
          'Tyre cold pressure verified',
          'Lights, horn and Bosch ABS check passed',
          'ECE 22.06 certified helmet & riding gear equipped'
        ],
        status: 'Registration Open',
        participants: [
          {
            id: `rp_${Date.now()}`,
            userId: leaderId,
            displayName: organizerName,
            motorcycleModel: currentUser?.motorcycleModel || 'F77 MACH 2',
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
      saveUpdatedRideToStateAndCache(fallbackRide);
      setSelectedRideId(fallbackRide.id);
      setShowCreateModal(false);
      setFeedbackBanner({
        type: 'success',
        text: `New group ride "${fallbackRide.name}" published!`
      });
    }
  };

  // Leader Controls
  const handleLeaderAction = async (status?: string, announcement?: string) => {
    if (!selectedRide) return;
    try {
      const res = await fetch(`/api/rides/${selectedRide.id}/leader-control`, {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          status,
          announcement,
          departureTime: status === 'Active / Riding' ? new Date().toISOString() : undefined
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ride) {
          saveUpdatedRideToStateAndCache(data.ride);
        }
        setAnnouncementText('');
        refreshNotifications();
      }
    } catch {
      // Ignore error
    }
  };

  // Handle Photo File Upload for Visited Destination
  const handleDestinationPhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files)
      .slice(0, 3)
      .forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            setDestForm(prev => ({
              ...prev,
              uploadedPhotos: [...prev.uploadedPhotos, reader.result as string].slice(0, 4)
            }));
          }
        };
        reader.readAsDataURL(file);
      });
  };

  const toggleDestChargerChip = (chip: string) => {
    setDestForm(prev => {
      const exists = prev.chargerTypesUsed.includes(chip);
      const next = exists
        ? prev.chargerTypesUsed.filter(c => c !== chip)
        : [...prev.chargerTypesUsed, chip];
      return { ...prev, chargerTypesUsed: next };
    });
  };

  // Submit New Visited Destination
  const handleUploadDestination = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadDestError('');

    const combinedPhotos: string[] = [...destForm.uploadedPhotos];
    if (destForm.customPhotoUrl.trim()) {
      combinedPhotos.push(destForm.customPhotoUrl.trim());
    }

    const authorName = currentUser
      ? resolveUserDisplayIdentity(currentUser).primaryName
      : destForm.authorName.trim() || 'Squadron Rider';
    const authorModel =
      currentUser?.motorcycleModel || destForm.authorModel.trim() || 'F77 MACH 2';

    const validation = validateVisitedDestinationSubmission({
      title: destForm.title,
      startingPoint: destForm.startingPoint,
      totalDistanceKm: destForm.totalDistanceKm,
      chargingOptionsOnWay: destForm.chargingOptionsOnWay,
      chargerTypesUsed: destForm.chargerTypesUsed,
      locationMapUrl: destForm.locationMapUrl,
      photos: combinedPhotos,
      presetTheme: destForm.presetTheme,
      routeSummary: destForm.routeSummary,
      riderTips: destForm.riderTips,
      bestTimeToVisit: destForm.bestTimeToVisit,
      authorId: currentUser?.id || `rider_${Date.now()}`,
      authorName,
      authorModel
    });

    if (!validation.valid || !validation.record) {
      setUploadDestError(validation.error || 'Please fill in all required destination details.');
      return;
    }

    try {
      const res = await fetch('/api/mission/destinations', {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...validation.record,
          presetTheme: destForm.presetTheme
        })
      });

      if (res.ok) {
        const data = await res.json();
        const nextList = Array.isArray(data?.destinations)
          ? data.destinations
          : [validation.record, ...visitedDestinations];
        setVisitedDestinations(nextList);
        saveToCache(CACHE_KEYS.VISITED_DESTINATIONS, nextList);
      } else {
        const nextList = [validation.record, ...visitedDestinations];
        setVisitedDestinations(nextList);
        saveToCache(CACHE_KEYS.VISITED_DESTINATIONS, nextList);
      }
    } catch {
      const nextList = [validation.record, ...visitedDestinations];
      setVisitedDestinations(nextList);
      saveToCache(CACHE_KEYS.VISITED_DESTINATIONS, nextList);
    }

    clearFormDraft(UPLOAD_DEST_DRAFT_KEY);
    setDestForm({
      title: '',
      startingPoint: 'Bengaluru',
      totalDistanceKm: '',
      chargingOptionsOnWay: '',
      chargerTypesUsed: ['UV Supernova', '15A 3-Pin Socket'],
      locationMapUrl: '',
      routeSummary: '',
      riderTips: '',
      bestTimeToVisit: 'Early Morning (05:30 AM – 10:00 AM)',
      authorName: '',
      authorModel: 'F77 MACH 2',
      presetTheme: 'mountain_ghat',
      customPhotoUrl: '',
      uploadedPhotos: []
    });
    setShowUploadDestModal(false);
    setFeedbackBanner({
      type: 'success',
      text: `Destination "${validation.record.title}" uploaded! Other riders can now view your photos, charging stops, and map link to plan their next ride.`
    });
  };

  // Quick-Action: Plan a Group Ride from a Visited Destination Card
  const handlePlanSortieFromDestination = (dest: VisitedDestinationRecord) => {
    setCreateForm(prev => ({
      ...prev,
      name: `${dest.title.toUpperCase()} GROUP RIDE`,
      description: dest.routeSummary || dest.riderTips || `Group ride to ${dest.title}.`,
      meetingPoint: dest.startingPoint || 'Bengaluru Hangar',
      destination: dest.title,
      plannedRoute: `${dest.startingPoint || 'Bengaluru'} → ${dest.title}`,
      maxDistanceKm: String(dest.totalDistanceKm),
      chargingStopLocation: dest.chargingOptionsOnWay.slice(0, 90),
      chargingStopNotes: dest.chargingOptionsOnWay,
      specialInstructions: dest.riderTips || ''
    }));
    setActiveSubPage('sorties');
    setShowCreateModal(true);
  };

  const filteredDestinations = useMemo(() => {
    const q = destSearchQuery.trim().toLowerCase();
    if (!q) return visitedDestinations;
    return visitedDestinations.filter(
      d =>
        d.title.toLowerCase().includes(q) ||
        d.startingPoint.toLowerCase().includes(q) ||
        d.chargingOptionsOnWay.toLowerCase().includes(q) ||
        d.authorName.toLowerCase().includes(q) ||
        (d.riderTips || '').toLowerCase().includes(q)
    );
  }, [visitedDestinations, destSearchQuery]);

  const statusSummary = selectedRide ? calculateRideStatusSummary(selectedRide.participants) : null;
  const rideCompletion = selectedRide ? evaluateRideCompletion(selectedRide.participants) : null;

  return (
    <div className="space-y-6">
      {/* Clean Header & Simple Sub-Page Switcher */}
      <div className="glass-panel rounded-xl p-5 border border-cyan-500/25 bg-gradient-to-r from-[#07101d] via-[#0a1424] to-[#07101d]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-cyan-400 text-xs font-mono tracking-widest uppercase mb-1">
              <Compass className="w-4 h-4" />
              <span>MISSION MODE • SQUADRON RIDES & ROUTE GUIDES</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-black text-white tracking-wider">
              GROUP SORTIES & VISITED DESTINATIONS
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Join an upcoming group ride anytime, back off easily if your plans change, or explore & share rider-tested destinations with charging stops and map links.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {activeSubPage === 'sorties' ? (
              <button
                data-testid="btn-open-create-ride"
                onClick={() => setShowCreateModal(true)}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-xs tracking-wider transition-all shadow-lg shadow-cyan-500/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>ORGANIZE NEW RIDE</span>
              </button>
            ) : (
              <button
                data-testid="btn-open-upload-destination"
                onClick={() => {
                  setUploadDestError('');
                  setShowUploadDestModal(true);
                }}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs tracking-wider transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>+ UPLOAD VISITED DESTINATION</span>
              </button>
            )}
          </div>
        </div>

        {/* Two Clear Sub-Page Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 pt-4 border-t border-slate-800/80">
          <button
            type="button"
            data-testid="mission-tab-sorties"
            onClick={() => setActiveSubPage('sorties')}
            className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              activeSubPage === 'sorties'
                ? 'bg-cyan-500/15 border-cyan-400 text-white shadow-[0_0_20px_rgba(0,229,255,0.15)]'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center space-x-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  activeSubPage === 'sorties'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="font-display font-bold text-sm tracking-wider uppercase">
                  1. GROUP RIDES & SORTIES
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Join any upcoming ride or cancel/back off anytime if you can't make it
                </div>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded bg-slate-950/80 border border-slate-700 text-cyan-400 font-mono text-xs font-bold">
              {rides.length} RIDES
            </span>
          </button>

          <button
            type="button"
            data-testid="mission-tab-destinations"
            onClick={() => setActiveSubPage('destinations')}
            className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              activeSubPage === 'destinations'
                ? 'bg-emerald-500/15 border-emerald-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center space-x-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  activeSubPage === 'destinations'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <div className="font-display font-bold text-sm tracking-wider uppercase">
                  2. VISITED DESTINATIONS & GUIDES
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Rider-uploaded places with photos, distance, charging stops & map links
                </div>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded bg-slate-950/80 border border-slate-700 text-emerald-400 font-mono text-xs font-bold">
              {visitedDestinations.length} PLACES
            </span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          data-testid="mission-feedback-banner"
          className={`rounded-xl p-4 border flex items-center justify-between gap-3 ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
              : feedbackBanner.type === 'error'
              ? 'bg-red-500/15 border-red-500/40 text-red-200'
              : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
          }`}
        >
          <div className="flex items-center space-x-3 text-sm font-medium">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{feedbackBanner.text}</span>
          </div>
          <button
            onClick={() => setFeedbackBanner(null)}
            className="text-xs font-mono uppercase px-2 py-1 rounded bg-slate-950/50 hover:bg-slate-950 text-slate-300 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-PAGE 1: GROUP RIDES & SORTIES                                     */}
      {/* ===================================================================== */}
      {activeSubPage === 'sorties' && (
        <>
          {/* Simple 3-Step Guide Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="glass-panel rounded-xl p-3.5 border border-slate-800/90 flex items-start space-x-3">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-mono text-xs font-bold shrink-0">
                1
              </div>
              <div>
                <div className="text-xs font-display font-bold text-white uppercase tracking-wider">
                  PICK A GROUP RIDE
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select any ride on the left to see its meeting point, total distance, and charging stops.
                </p>
              </div>
            </div>

            <div className="glass-panel rounded-xl p-3.5 border border-slate-800/90 flex items-start space-x-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono text-xs font-bold shrink-0">
                2
              </div>
              <div>
                <div className="text-xs font-display font-bold text-white uppercase tracking-wider">
                  JOIN ANYTIME OR BACK OFF
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Any rider can click <span className="text-emerald-400 font-semibold">Join This Sortie</span> whenever they want, or <span className="text-amber-400 font-semibold">Cancel / Back Off</span> if they can't make it.
                </p>
              </div>
            </div>

            <div className="glass-panel rounded-xl p-3.5 border border-slate-800/90 flex items-start space-x-3">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 font-mono text-xs font-bold shrink-0">
                3
              </div>
              <div>
                <div className="text-xs font-display font-bold text-white uppercase tracking-wider">
                  RIDE & CONFIRM HOME SAFE
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tick off your pre-ride safety checklist before take-off and tap <span className="text-cyan-400 font-semibold">I'm Home Safe</span> after returning.
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 py-4">
              <div className="lg:col-span-4 space-y-3">
                {[1, 2].map(n => (
                  <div
                    key={n}
                    className="glass-panel rounded-xl p-4 border border-slate-800/80 animate-pulse space-y-3"
                  >
                    <div className="h-3 w-20 bg-slate-800 rounded" />
                    <div className="h-5 w-3/4 bg-slate-800 rounded" />
                    <div className="h-3 w-1/2 bg-slate-900 rounded" />
                  </div>
                ))}
              </div>
              <div className="lg:col-span-8 glass-panel rounded-xl p-6 border border-slate-800/80 animate-pulse space-y-6">
                <div className="h-7 w-2/3 bg-slate-800 rounded" />
                <div className="h-24 bg-slate-900 rounded-lg" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Simple List of Rides */}
              <div className="lg:col-span-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xs font-bold text-slate-300 tracking-wider uppercase">
                    AVAILABLE GROUP RIDES ({rides.length})
                  </h2>
                  <span className="text-[11px] font-mono text-cyan-400">Tap to view details</span>
                </div>

                {rides.map(ride => {
                  const isSelected = selectedRide?.id === ride.id;
                  const userJoinedThisRide = Boolean(
                    (currentUser?.id &&
                      ride.participants.some(p => p.userId === currentUser.id)) ||
                      (localRiderMap[ride.id] &&
                        ride.participants.some(
                          p =>
                            p.userId === localRiderMap[ride.id].userId ||
                            p.id === localRiderMap[ride.id].participantId
                        ))
                  );

                  return (
                    <button
                      type="button"
                      key={ride.id}
                      data-testid={`ride-card-${ride.id}`}
                      onClick={() => setSelectedRideId(ride.id)}
                      className={`w-full text-left glass-panel rounded-xl p-4 cursor-pointer transition-all border ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_20px_rgba(0,229,255,0.12)]'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                            ride.status === 'Active / Riding'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : ride.status === 'Completed'
                              ? 'bg-slate-800 text-slate-400'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          }`}
                        >
                          {ride.status === 'Full' ? 'Open to Join' : ride.status}
                        </span>

                        {userJoinedThisRide && (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold uppercase flex items-center space-x-1">
                            <Check className="w-3 h-3" />
                            <span>JOINED</span>
                          </span>
                        )}
                      </div>

                      <h3 className="font-display font-bold text-white text-base mb-1">
                        {ride.name}
                      </h3>

                      <div className="text-xs text-slate-300 flex items-center space-x-1.5 mb-2">
                        <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="truncate">
                          {ride.meetingPoint} → {ride.destination}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-800/80">
                        <span className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3 text-cyan-400" />
                          <span>{ride.rideDate}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-cyan-400" />
                          <span>{ride.startTime}</span>
                        </span>
                        <span className="text-cyan-400 font-bold">{ride.maxDistanceKm} KM</span>
                        <span className="flex items-center space-x-1 ml-auto text-slate-300">
                          <Users className="w-3 h-3 text-emerald-400" />
                          <span>{ride.participants.length} Riders</span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right Column: Selected Ride Details */}
              <div className="lg:col-span-8 space-y-5">
                {selectedRide ? (
                  <>
                    {/* Ride Summary & Join / Cancel Action Card */}
                    <div className="glass-panel rounded-xl p-6 border border-cyan-500/30 space-y-5">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="px-2.5 py-0.5 rounded text-xs font-mono uppercase font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                              {selectedRide.status === 'Full' ? 'Open to Join' : selectedRide.status}
                            </span>
                            <span className="px-2.5 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono">
                              Pace: {selectedRide.pace}
                            </span>
                            <span className="px-2.5 py-0.5 rounded bg-slate-800 text-cyan-400 text-xs font-mono font-bold">
                              Total Distance: {selectedRide.maxDistanceKm} KM
                            </span>
                          </div>

                          <h2 className="font-display text-2xl font-black text-white tracking-wide">
                            {selectedRide.name}
                          </h2>
                          <p className="text-slate-300 text-sm mt-1">{selectedRide.description}</p>
                        </div>
                      </div>

                      {/* JOIN OR CANCEL / BACK OFF ACTION BAR */}
                      <div
                        data-testid="sortie-participation-bar"
                        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                          isJoinedInSelectedRide
                            ? 'bg-emerald-950/30 border-emerald-500/40'
                            : 'bg-cyan-950/30 border-cyan-500/40'
                        }`}
                      >
                        {isJoinedInSelectedRide && myParticipant ? (
                          <>
                            <div className="flex items-start space-x-3">
                              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                                <CheckCircle2 className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="font-display font-bold text-sm text-emerald-300 tracking-wider uppercase">
                                  YOU ARE JOINED IN THIS SORTIE ({myParticipant.displayName})
                                </div>
                                <p className="text-xs text-slate-300 mt-0.5">
                                  Bike: <span className="text-white font-semibold">{myParticipant.motorcycleModel}</span> • Status:{' '}
                                  <span className="text-cyan-300 font-semibold">{myParticipant.status}</span>. Can't make it to the ride? You can cancel or back off below.
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              data-testid="btn-backoff-sortie"
                              onClick={() => setShowBackOffModal(true)}
                              className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 font-display font-bold text-xs tracking-wider uppercase transition-all shrink-0 cursor-pointer"
                            >
                              <UserMinus className="w-4 h-4" />
                              <span>CANCEL / BACK OFF RIDE</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="flex items-start space-x-3">
                              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
                                <UserPlus className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="font-display font-bold text-sm text-white tracking-wider uppercase">
                                  OPEN FOR ALL RIDERS — JOIN THIS SORTIE ANYTIME
                                </div>
                                <p className="text-xs text-slate-300 mt-0.5">
                                  Want to ride along? Join the roster now. If your plans change later, you can cancel or back off with one click.
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              data-testid="btn-join-sortie"
                              onClick={() => setShowJoinModal(true)}
                              className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs tracking-wider uppercase transition-all shadow-lg shadow-emerald-500/25 shrink-0 cursor-pointer"
                            >
                              <UserPlus className="w-4 h-4" />
                              <span>JOIN THIS SORTIE</span>
                            </button>
                          </>
                        )}
                      </div>

                      {/* Key Ride Facts Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                          <div className="text-[10px] font-mono text-slate-400 uppercase">
                            DATE & START TIME
                          </div>
                          <div className="text-sm font-bold text-white mt-1">
                            {selectedRide.rideDate} • {selectedRide.startTime}
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                          <div className="text-[10px] font-mono text-slate-400 uppercase">
                            MEETING POINT
                          </div>
                          <div className="text-sm font-bold text-cyan-400 mt-1 truncate">
                            {selectedRide.meetingPoint}
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                          <div className="text-[10px] font-mono text-slate-400 uppercase">
                            DESTINATION
                          </div>
                          <div className="text-sm font-bold text-emerald-400 mt-1 truncate">
                            {selectedRide.destination}
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                          <div className="text-[10px] font-mono text-slate-400 uppercase">
                            RIDE LEADER
                          </div>
                          <div className="text-sm font-bold text-white mt-1 truncate">
                            {selectedRide.rideLeaderName}
                          </div>
                        </div>
                      </div>

                      {/* Route & Charging Stops on the Way */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                          <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400 uppercase">
                            <Route className="w-4 h-4" />
                            <span>PLANNED ROUTE & BRIEFING</span>
                          </div>
                          <p className="text-sm text-white font-medium">
                            {selectedRide.plannedRoute}
                          </p>
                          {selectedRide.specialInstructions && (
                            <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 mt-2">
                              <span className="font-bold uppercase">Rider Note: </span>
                              {selectedRide.specialInstructions}
                            </p>
                          )}
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                          <div className="flex items-center space-x-2 text-xs font-mono text-emerald-400 uppercase">
                            <Zap className="w-4 h-4" />
                            <span>CHARGING STOPS ON THE WAY</span>
                          </div>
                          {selectedRide.chargingStops && selectedRide.chargingStops.length > 0 ? (
                            <div className="space-y-2">
                              {selectedRide.chargingStops.map((stop, idx) => (
                                <div
                                  key={idx}
                                  className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 flex items-start justify-between gap-2"
                                >
                                  <div>
                                    <div className="text-xs font-bold text-white">
                                      {stop.locationName}
                                    </div>
                                    <div className="text-[11px] text-slate-400">{stop.notes}</div>
                                  </div>
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono shrink-0">
                                    {stop.chargerType}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400">
                              Single-charge sortie — no mandatory intermediate charging stop required.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Joined Rider Quick Controls: Pre-Ride Checklist, Live Status & Home Safe Confirmation */}
                    {isJoinedInSelectedRide && myParticipant && (
                      <div className="glass-panel rounded-xl p-5 border border-emerald-500/30 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                          <div>
                            <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                              <Shield className="w-4 h-4 text-cyan-400" />
                              <span>YOUR RIDE CHECKLIST & SAFE ARRIVAL STATUS</span>
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Update your live status during the ride or confirm when you reach home safely.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleChecklist(!myParticipant.checklistCompleted)}
                            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                              myParticipant.checklistCompleted
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                            }`}
                          >
                            {myParticipant.checklistCompleted ? (
                              <CheckSquare className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                            <span>
                              {myParticipant.checklistCompleted
                                ? 'PRE-RIDE CHECKLIST DONE'
                                : 'MARK PRE-RIDE CHECKLIST DONE'}
                            </span>
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {(
                            [
                              'Checked In at Meeting Point',
                              'Riding with Group',
                              'Reached Destination',
                              'Heading Home',
                              'Needs Assistance'
                            ] as RiderParticipant['status'][]
                          ).map(st => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleUpdateStatus(st)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                                myParticipant.status === st
                                  ? st === 'Needs Assistance'
                                    ? 'bg-red-500 text-white font-bold'
                                    : 'bg-cyan-500 text-slate-950 font-bold'
                                  : st === 'Needs Assistance'
                                  ? 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20'
                                  : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-cyan-500/40'
                              }`}
                            >
                              {st}
                            </button>
                          ))}

                          <button
                            type="button"
                            onClick={handleSafeArrival}
                            disabled={myParticipant.status === 'Reached Home Safely'}
                            className={`ml-auto flex items-center space-x-1.5 px-4 py-1.5 rounded-lg font-display font-bold text-xs tracking-wider uppercase transition-all cursor-pointer ${
                              myParticipant.status === 'Reached Home Safely'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20'
                            }`}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>
                              {myParticipant.status === 'Reached Home Safely'
                                ? 'HOME SAFE CONFIRMED'
                                : "CONFIRM I'M HOME SAFE"}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Ride Leader Controls (Only shown to Ride Leader / Admin) */}
                    {isRideLeader && (
                      <div className="glass-panel rounded-xl p-4 border border-amber-500/30 bg-amber-950/10 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-mono uppercase text-amber-400 font-bold">
                            RIDE LEADER CONTROLS
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {['Registration Open', 'Active / Riding', 'Completed'].map(st => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => handleLeaderAction(st)}
                                className={`px-2.5 py-1 rounded text-[11px] font-mono cursor-pointer ${
                                  selectedRide.status === st
                                    ? 'bg-amber-500 text-slate-950 font-bold'
                                    : 'bg-slate-900 text-slate-300 border border-slate-700'
                                }`}
                              >
                                Set: {st}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex space-x-2">
                          <input
                            type="text"
                            value={announcementText}
                            onChange={e => setAnnouncementText(e.target.value)}
                            placeholder="Post an announcement to all riders on this sortie..."
                            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              announcementText.trim() &&
                              handleLeaderAction(undefined, announcementText.trim())
                            }
                            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs flex items-center space-x-1 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>POST</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Riders Going (Participant Roster) */}
                    <div className="glass-panel rounded-xl p-5 border border-slate-800 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                          <Users className="w-4 h-4 text-cyan-400" />
                          <span>RIDERS GOING ON THIS SORTIE ({selectedRide.participants.length})</span>
                        </h3>

                        {statusSummary && (
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                            <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300">
                              Riding: {statusSummary.ridingCount}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                              Home Safe: {statusSummary.safeHomeCount}
                            </span>
                            {rideCompletion?.allSafe && (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold flex items-center space-x-1">
                                <Award className="w-3 h-3" />
                                <span>100% SAFE ARRIVAL</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {selectedRide.participants.map(p => {
                          const isMe = myParticipant?.id === p.id || myParticipant?.userId === p.userId;
                          return (
                            <div
                              key={p.id}
                              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                                isMe
                                  ? 'bg-emerald-950/25 border-emerald-500/40'
                                  : 'bg-slate-900/60 border-slate-800'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center space-x-2">
                                  <span className="font-display font-bold text-white text-sm truncate">
                                    {p.displayName}
                                  </span>
                                  {isMe && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                                      YOU
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                                  <span className="text-cyan-400 font-mono">{p.motorcycleModel}</span>
                                  {p.startingPoint && p.shareStartingPoint && (
                                    <span>• From: {p.startingPoint}</span>
                                  )}
                                  {p.intercomStatus === 'Has an intercom' && (
                                    <span className="inline-flex items-center space-x-1 text-slate-300">
                                      <Radio className="w-3 h-3 text-cyan-400" />
                                      <span>Intercom</span>
                                    </span>
                                  )}
                                </div>
                              </div>

                              <span
                                className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase font-bold shrink-0 ${
                                  p.status === 'Reached Home Safely'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : p.status === 'Needs Assistance'
                                    ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                    : 'bg-slate-800 text-cyan-300'
                                }`}
                              >
                                {p.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="glass-panel rounded-xl p-12 text-center border border-slate-800">
                    <Compass className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                    <div className="text-white font-display font-bold">
                      Select a group ride on the left to view full details
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* SUB-PAGE 2: VISITED DESTINATIONS & RIDER ROUTE GUIDES                 */}
      {/* ===================================================================== */}
      {activeSubPage === 'destinations' && (
        <div className="space-y-6" data-testid="visited-destinations-section">
          {/* Intro + Search + Upload Action Bar */}
          <div className="glass-panel rounded-xl p-5 border border-emerald-500/30 bg-slate-900/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-mono text-emerald-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4" />
                <span>COMMUNITY RIDER ROUTE LOGBOOK</span>
              </div>
              <h2 className="font-display text-lg font-bold text-white">
                DESTINATIONS ALREADY VISITED BY RIDERS
              </h2>
              <p className="text-xs text-slate-300 max-w-2xl">
                Been on a great ride? Upload the destination with photos, total distance, options to charge your bike on the way, and the Google Maps location link so other riders can go next or plan a sortie!
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={destSearchQuery}
                  onChange={e => setDestSearchQuery(e.target.value)}
                  placeholder="Search destinations or chargers..."
                  className="bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-400 w-full sm:w-60"
                />
              </div>

              <button
                type="button"
                data-testid="btn-upload-destination-secondary"
                onClick={() => {
                  setUploadDestError('');
                  setShowUploadDestModal(true);
                }}
                className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs tracking-wider uppercase shadow-lg shadow-emerald-500/20 shrink-0 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>+ UPLOAD VISITED DESTINATION</span>
              </button>
            </div>
          </div>

          {/* Grid of Visited Destinations */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDestinations.map(dest => {
              const primaryPhoto =
                dest.photos && dest.photos.length > 0
                  ? dest.photos[0]
                  : createDestinationPresetIllustration('mountain_ghat', dest.title);

              return (
                <div
                  key={dest.id}
                  data-testid={`visited-dest-card-${dest.id}`}
                  className="glass-panel rounded-xl overflow-hidden border border-slate-800 hover:border-emerald-500/40 transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Destination Photo Header */}
                    <div className="relative h-48 bg-slate-950 overflow-hidden border-b border-slate-800">
                      <img
                        src={primaryPhoto}
                        alt={dest.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />

                      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                        <span className="px-2.5 py-1 rounded-md bg-slate-950/90 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold">
                          {dest.totalDistanceKm} KM TOTAL
                        </span>
                      </div>

                      {dest.photos && dest.photos.length > 1 && (
                        <div className="absolute top-3 right-3 px-2 py-0.5 rounded bg-slate-950/85 border border-slate-700 text-slate-200 text-[10px] font-mono flex items-center space-x-1">
                          <Camera className="w-3 h-3 text-emerald-400" />
                          <span>{dest.photos.length} PHOTOS</span>
                        </div>
                      )}

                      <div className="absolute bottom-3 left-3 right-3">
                        <div className="text-[11px] font-mono text-emerald-300 flex items-center space-x-1">
                          <Navigation className="w-3 h-3" />
                          <span>From {dest.startingPoint || 'Bengaluru'}</span>
                        </div>
                        <h3 className="font-display font-bold text-white text-lg leading-snug mt-0.5">
                          {dest.title}
                        </h3>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 space-y-3.5">
                      {/* Rider attribution & Best Time */}
                      <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/80 pb-2.5">
                        <span>
                          Visited by <strong className="text-white">{dest.authorName}</strong> ({dest.authorModel})
                        </span>
                        {dest.bestTimeToVisit && (
                          <span className="text-[10px] font-mono text-cyan-400">
                            {dest.bestTimeToVisit}
                          </span>
                        )}
                      </div>

                      {/* Options to Charge Bike on the Way */}
                      <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 space-y-2">
                        <div className="flex items-center space-x-1.5 text-[11px] font-mono font-bold text-emerald-400 uppercase">
                          <Zap className="w-3.5 h-3.5" />
                          <span>OPTIONS TO CHARGE BIKE ON THE WAY</span>
                        </div>
                        <p className="text-xs text-slate-200 leading-relaxed">
                          {dest.chargingOptionsOnWay}
                        </p>
                        {dest.chargerTypesUsed && dest.chargerTypesUsed.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {dest.chargerTypesUsed.map((ct, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded bg-slate-950/80 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono"
                              >
                                {ct}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Route Summary / Rider Tips */}
                      {(dest.routeSummary || dest.riderTips) && (
                        <div className="space-y-1 text-xs text-slate-300">
                          {dest.routeSummary && <p>{dest.routeSummary}</p>}
                          {dest.riderTips && (
                            <p className="text-slate-400 italic">
                              <strong className="text-cyan-400 not-italic">Rider Tip: </strong>
                              {dest.riderTips}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer: Map Link & Plan a Ride Button */}
                  <div className="p-4 pt-0 flex flex-col sm:flex-row gap-2">
                    <a
                      href={dest.locationMapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`btn-dest-map-link-${dest.id}`}
                      className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 font-display font-bold text-xs tracking-wider uppercase transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>OPEN LOCATION MAP</span>
                    </a>

                    <button
                      type="button"
                      data-testid={`btn-plan-sortie-from-dest-${dest.id}`}
                      onClick={() => handlePlanSortieFromDestination(dest)}
                      className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-display font-bold text-xs tracking-wider uppercase transition-all cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>PLAN RIDE HERE</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: JOIN SORTIE ANYTIME                                          */}
      {/* ===================================================================== */}
      {showJoinModal && selectedRide && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-lg w-full p-6 border border-emerald-500/40 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-white uppercase">
                  JOIN SORTIE: {selectedRide.name}
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedRide.rideDate} at {selectedRide.startTime} • {selectedRide.meetingPoint} → {selectedRide.destination}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowJoinModal(false)}
                className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleJoinRide} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                    YOUR NAME / CALLSIGN *
                  </label>
                  <input
                    type="text"
                    required
                    data-testid="input-join-name"
                    value={
                      currentUser
                        ? resolveUserDisplayIdentity(currentUser).primaryName
                        : joinForm.displayName
                    }
                    onChange={e => setJoinForm({ ...joinForm, displayName: e.target.value })}
                    readOnly={Boolean(currentUser)}
                    placeholder="e.g., Arjun Menon"
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                    MOTORCYCLE MODEL *
                  </label>
                  <select
                    data-testid="select-join-bike"
                    value={joinForm.motorcycleModel}
                    onChange={e => setJoinForm({ ...joinForm, motorcycleModel: e.target.value })}
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                  >
                    <option value="F77 MACH 2">F77 MACH 2</option>
                    <option value="F77 Recon">F77 Recon</option>
                    <option value="F77 Original">F77 Original</option>
                    <option value="F77 Space Edition">F77 Space Edition</option>
                    <option value="F77 SuperStreet">F77 SuperStreet</option>
                    <option value="Tesseract">Tesseract</option>
                    <option value="Shockwave">Shockwave</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                    STARTING AREA / LOCALITY (OPTIONAL)
                  </label>
                  <input
                    type="text"
                    data-testid="input-join-start"
                    value={joinForm.startingPoint}
                    onChange={e => setJoinForm({ ...joinForm, startingPoint: e.target.value })}
                    placeholder="e.g., Indiranagar / Hebbal"
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                    HELMET INTERCOM
                  </label>
                  <select
                    value={joinForm.intercomStatus}
                    onChange={e =>
                      setJoinForm({
                        ...joinForm,
                        intercomStatus: e.target.value as RiderParticipant['intercomStatus']
                      })
                    }
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                  >
                    <option value="Has an intercom">Has an intercom</option>
                    <option value="Does not have an intercom">Does not have an intercom</option>
                    <option value="Intercom details not specified">Prefer not to specify</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                  OPTIONAL NOTE FOR RIDE LEADER
                </label>
                <input
                  type="text"
                  data-testid="input-join-note"
                  value={joinForm.notes}
                  onChange={e => setJoinForm({ ...joinForm, notes: e.target.value })}
                  placeholder="e.g., Carrying portable 15A charger & tyre inflator"
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-300 flex items-center space-x-2">
                <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>
                  You can cancel or back off from this ride at any time if you cannot make it.
                </span>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-mono uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="btn-confirm-join-sortie"
                  className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs tracking-wider uppercase cursor-pointer"
                >
                  CONFIRM & JOIN SORTIE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: CANCEL / BACK OFF FROM SORTIE                                */}
      {/* ===================================================================== */}
      {showBackOffModal && selectedRide && myParticipant && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-md w-full p-6 border border-red-500/40 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-red-400">
                <UserMinus className="w-5 h-5" />
                <h3 className="font-display text-lg font-bold text-white uppercase">
                  CANCEL / BACK OFF FROM RIDE
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBackOffModal(false)}
                className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-slate-300">
              Can't make it to <strong className="text-white">{selectedRide.name}</strong>? Confirming below will remove <strong className="text-emerald-300">{myParticipant.displayName}</strong> from the active rider roster so the Ride Leader knows not to wait at the meeting point.
            </p>

            <form onSubmit={handleBackOffRide} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-1">
                  REASON FOR BACKING OFF (OPTIONAL)
                </label>
                <input
                  type="text"
                  data-testid="input-backoff-reason"
                  value={backOffReason}
                  onChange={e => setBackOffReason(e.target.value)}
                  placeholder="e.g., Work commitment / family plan came up"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-400"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBackOffModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-mono uppercase cursor-pointer"
                >
                  Keep My Spot
                </button>
                <button
                  type="submit"
                  data-testid="btn-confirm-backoff-sortie"
                  className="px-5 py-2.5 rounded-lg bg-red-500 hover:bg-red-400 text-slate-950 font-display font-bold text-xs tracking-wider uppercase cursor-pointer"
                >
                  CONFIRM BACK OFF
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: UPLOAD VISITED DESTINATION                                   */}
      {/* ===================================================================== */}
      {showUploadDestModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-2xl w-full p-6 border border-emerald-500/40 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="text-[11px] font-mono text-emerald-400 uppercase">
                  SHARE YOUR RIDE EXPERIENCE
                </div>
                <h3 className="font-display text-xl font-bold text-white uppercase">
                  UPLOAD A DESTINATION YOU HAVE VISITED
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadDestModal(false)}
                className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {uploadDestError && (
              <div className="p-3 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{uploadDestError}</span>
              </div>
            )}

            <form onSubmit={handleUploadDestination} className="space-y-4">
              {/* Destination Name & Starting Point */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                    DESTINATION NAME *
                  </label>
                  <input
                    type="text"
                    required
                    data-testid="input-dest-title"
                    value={destForm.title}
                    onChange={e => setDestForm({ ...destForm, title: e.target.value })}
                    placeholder="e.g., Mullayanagiri Peak / Gokarna Cliff"
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                    STARTING CITY / POINT *
                  </label>
                  <input
                    type="text"
                    required
                    data-testid="input-dest-start"
                    value={destForm.startingPoint}
                    onChange={e => setDestForm({ ...destForm, startingPoint: e.target.value })}
                    placeholder="e.g., Bengaluru (Indiranagar)"
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              {/* Total Distance & Location Map Link */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                    TOTAL DISTANCE (IN KM) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    required
                    data-testid="input-dest-distance"
                    value={destForm.totalDistanceKm}
                    onChange={e => setDestForm({ ...destForm, totalDistanceKm: e.target.value })}
                    placeholder="e.g., 280"
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                    LOCATION MAP LINK (GOOGLE MAPS URL OR PLACE) *
                  </label>
                  <input
                    type="text"
                    required
                    data-testid="input-dest-map-link"
                    value={destForm.locationMapUrl}
                    onChange={e => setDestForm({ ...destForm, locationMapUrl: e.target.value })}
                    placeholder="https://maps.google.com/... or place name"
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              {/* Options to Charge Bike on the Way */}
              <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-3">
                <label className="block text-xs font-mono text-emerald-400 font-bold uppercase">
                  OPTIONS TO CHARGE BIKE ON THE WAY *
                </label>

                <div className="flex flex-wrap gap-1.5">
                  {CHARGER_OPTION_CHIPS.map(chip => {
                    const active = destForm.chargerTypesUsed.includes(chip);
                    return (
                      <button
                        type="button"
                        key={chip}
                        onClick={() => toggleDestChargerChip(chip)}
                        className={`px-2.5 py-1 rounded text-xs font-mono transition-all cursor-pointer ${
                          active
                            ? 'bg-emerald-500 text-slate-950 font-bold'
                            : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-emerald-500/40'
                        }`}
                      >
                        {active ? `✓ ${chip}` : `+ ${chip}`}
                      </button>
                    );
                  })}
                </div>

                <textarea
                  rows={2}
                  required
                  data-testid="input-dest-charging"
                  value={destForm.chargingOptionsOnWay}
                  onChange={e =>
                    setDestForm({ ...destForm, chargingOptionsOnWay: e.target.value })
                  }
                  placeholder="Describe charging stops on the way (e.g., UV Supernova at Hassan + 15A 3-Pin plug at homestay)..."
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                />
              </div>

              {/* Photos Section: Upload Photo File, Paste Photo URL, or Pick Scenic Preset */}
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-mono text-cyan-400 font-bold uppercase">
                    DESTINATION PHOTOS
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Upload photo files, paste an image link, or choose a scenic cover
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center justify-center space-x-2 px-3 py-2.5 rounded-lg bg-slate-950 border border-dashed border-cyan-500/40 hover:border-cyan-400 text-cyan-300 text-xs font-mono cursor-pointer">
                    <Camera className="w-4 h-4" />
                    <span>UPLOAD PHOTO FROM DEVICE</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleDestinationPhotoFileChange}
                      className="hidden"
                    />
                  </label>

                  <input
                    type="text"
                    data-testid="input-dest-photo-url"
                    value={destForm.customPhotoUrl}
                    onChange={e => setDestForm({ ...destForm, customPhotoUrl: e.target.value })}
                    placeholder="Or paste photo URL (https://...)"
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {/* Scenic Theme Selector */}
                <div>
                  <div className="text-[10px] font-mono text-slate-400 uppercase mb-1.5">
                    SCENIC COVER THEME (USED IF NO CUSTOM PHOTO UPLOADED):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_THEME_OPTIONS.map(theme => (
                      <button
                        type="button"
                        key={theme.id}
                        onClick={() => setDestForm({ ...destForm, presetTheme: theme.id })}
                        className={`px-2.5 py-1 rounded text-[11px] font-mono cursor-pointer ${
                          destForm.presetTheme === theme.id
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'bg-slate-950 text-slate-300 border border-slate-800'
                        }`}
                      >
                        {theme.label}
                      </button>
                    ))}
                  </div>
                </div>

                {destForm.uploadedPhotos.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    {destForm.uploadedPhotos.map((src, idx) => (
                      <div
                        key={idx}
                        className="relative w-16 h-12 rounded overflow-hidden border border-emerald-500/40"
                      >
                        <img src={src} alt="Uploaded preview" className="w-full h-full object-cover" />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setDestForm({ ...destForm, uploadedPhotos: [] })}
                      className="text-[11px] font-mono text-red-400 underline cursor-pointer"
                    >
                      Clear uploaded photos
                    </button>
                  </div>
                )}
              </div>

              {/* Rider Tips & Route Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                    RIDER TIPS & ROAD CONDITION NOTES
                  </label>
                  <textarea
                    rows={2}
                    data-testid="input-dest-tips"
                    value={destForm.riderTips}
                    onChange={e => setDestForm({ ...destForm, riderTips: e.target.value })}
                    placeholder="e.g., Use Combat Mode + Regen R4 on the hairpins; great breakfast stop at..."
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                      BEST TIME TO VISIT
                    </label>
                    <input
                      type="text"
                      value={destForm.bestTimeToVisit}
                      onChange={e =>
                        setDestForm({ ...destForm, bestTimeToVisit: e.target.value })
                      }
                      placeholder="e.g., October – February (06:00 AM)"
                      className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                    />
                  </div>

                  {!currentUser && (
                    <div>
                      <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                        YOUR NAME / CALLSIGN
                      </label>
                      <input
                        type="text"
                        data-testid="input-dest-author"
                        value={destForm.authorName}
                        onChange={e => setDestForm({ ...destForm, authorName: e.target.value })}
                        placeholder="e.g., Karthik Rao"
                        className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowUploadDestModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-mono uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="btn-submit-visited-destination"
                  className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs tracking-wider uppercase shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  PUBLISH VISITED DESTINATION
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: ORGANIZE A NEW GROUP RIDE                                    */}
      {/* ===================================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-2xl w-full p-6 border border-cyan-500/30 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-display text-lg font-bold text-white uppercase">
                ORGANIZE A NEW GROUP RIDE
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateRide} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">
                    RIDE TITLE *
                  </label>
                  <input
                    type="text"
                    required
                    value={createForm.name}
                    onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="e.g., Sunday Nandi Hills Breakfast Run"
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">
                    RIDE PACE *
                  </label>
                  <select
                    value={createForm.pace}
                    onChange={e =>
                      setCreateForm({ ...createForm, pace: e.target.value as RideSortie['pace'] })
                    }
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="Relaxed">Relaxed (Scenic / Beginner Friendly)</option>
                    <option value="Moderate">Moderate (Standard Highway Cruise)</option>
                    <option value="Spirited">Spirited (Experienced Ghat Pace)</option>
                    <option value="Endurance">Endurance (Long-Distance Multi-Charge)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">
                    RIDE DATE *
                  </label>
                  <input
                    type="date"
                    required
                    value={createForm.rideDate}
                    onChange={e => setCreateForm({ ...createForm, rideDate: e.target.value })}
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">
                    START TIME *
                  </label>
                  <input
                    type="time"
                    required
                    value={createForm.startTime}
                    onChange={e => setCreateForm({ ...createForm, startTime: e.target.value })}
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">
                    TOTAL DISTANCE (KM) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    required
                    value={createForm.maxDistanceKm}
                    onChange={e => setCreateForm({ ...createForm, maxDistanceKm: e.target.value })}
                    placeholder="e.g., 145"
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">
                    MEETING POINT *
                  </label>
                  <input
                    type="text"
                    required
                    value={createForm.meetingPoint}
                    onChange={e => setCreateForm({ ...createForm, meetingPoint: e.target.value })}
                    placeholder="e.g., UV Hangar Indiranagar"
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">
                    DESTINATION *
                  </label>
                  <input
                    type="text"
                    required
                    value={createForm.destination}
                    onChange={e => setCreateForm({ ...createForm, destination: e.target.value })}
                    placeholder="e.g., Nandi Hills Summit"
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-1">
                  ROUTE & CHARGING STOP DETAILS
                </label>
                <input
                  type="text"
                  value={createForm.chargingStopLocation}
                  onChange={e =>
                    setCreateForm({ ...createForm, chargingStopLocation: e.target.value })
                  }
                  placeholder="Optional charging stop on the way (e.g., Devanahalli Supernova)"
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-mono uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-xs tracking-wider uppercase cursor-pointer"
                >
                  PUBLISH GROUP RIDE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
