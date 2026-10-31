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
  Info,
  ArrowLeft,
  Coffee,
  Trash2
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
  DEFAULT_VISITED_DESTINATIONS,
  searchAndRankPlaces,
  resolveTrueWaypointCoordinates,
  extractCoordinatesFromGoogleMapsUrl,
  extractQueryTextFromGoogleMapsUrl,
  type PlaceSuggestion
} from '../utils/rules';
import {
  INDIA_TOWN_PLACE_SUGGESTIONS,
  fetchLiveIndiaPlaces
} from '../utils/indiaLocations';
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
import {
  MissionRouteMap,
  openInGoogleMaps,
  buildMasterRouteGoogleMapsUrl,
  buildGoogleMapsUrl
} from './MissionRouteMap';

const CREATE_RIDE_DRAFT_KEY = 'mission_create_ride_v3';
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

function normalizeRideWaypoints(ride: RideSortie): RideSortie {
  const mCoords = resolveTrueWaypointCoordinates(
    {
      name: ride.meetingPoint,
      lat: ride.meetingPointLat,
      lng: ride.meetingPointLng,
      googleMapsUrl: ride.meetingPointGmapsUrl
    },
    INDIA_TOWN_PLACE_SUGGESTIONS
  );
  const dCoords = resolveTrueWaypointCoordinates(
    {
      name: ride.destination,
      lat: ride.destinationLat,
      lng: ride.destinationLng,
      googleMapsUrl: ride.destinationGmapsUrl
    },
    INDIA_TOWN_PLACE_SUGGESTIONS
  );

  const normalizedStops = Array.isArray(ride.stops)
    ? ride.stops.map(s => {
        const sCoords = resolveTrueWaypointCoordinates(s, INDIA_TOWN_PLACE_SUGGESTIONS);
        const lat = sCoords ? sCoords.latitude : s.lat;
        const lng = sCoords ? sCoords.longitude : s.lng;
        return {
          ...s,
          lat,
          lng,
          googleMapsUrl: s.googleMapsUrl || buildGoogleMapsUrl(lat, lng, s.name)
        };
      })
    : [];

  const normalizedCharging = Array.isArray(ride.chargingStops)
    ? ride.chargingStops.map(c => {
        const cCoords = resolveTrueWaypointCoordinates(c, INDIA_TOWN_PLACE_SUGGESTIONS);
        const lat = cCoords ? cCoords.latitude : c.lat;
        const lng = cCoords ? cCoords.longitude : c.lng;
        return {
          ...c,
          lat,
          lng,
          googleMapsUrl: c.googleMapsUrl || buildGoogleMapsUrl(lat, lng, c.locationName)
        };
      })
    : [];

  return {
    ...ride,
    meetingPointLat: mCoords ? mCoords.latitude : ride.meetingPointLat,
    meetingPointLng: mCoords ? mCoords.longitude : ride.meetingPointLng,
    meetingPointGmapsUrl:
      ride.meetingPointGmapsUrl ||
      buildGoogleMapsUrl(
        mCoords ? mCoords.latitude : ride.meetingPointLat,
        mCoords ? mCoords.longitude : ride.meetingPointLng,
        ride.meetingPoint
      ),
    destinationLat: dCoords ? dCoords.latitude : ride.destinationLat,
    destinationLng: dCoords ? dCoords.longitude : ride.destinationLng,
    destinationGmapsUrl:
      ride.destinationGmapsUrl ||
      buildGoogleMapsUrl(
        dCoords ? dCoords.latitude : ride.destinationLat,
        dCoords ? dCoords.longitude : ride.destinationLng,
        ride.destination
      ),
    stops: normalizedStops,
    chargingStops: normalizedCharging
  };
}

export const MissionMode: React.FC = () => {
  const { currentUser } = useAuth();

  // Top-level sub-page switcher: 'sorties' vs 'destinations'
  const [activeSubPage, setActiveSubPage] = useState<'sorties' | 'destinations'>('sorties');

  // Sorties view mode: 'list' (browsing group rides) vs 'details' (dedicated ride details page)
  const [activeSortieView, setActiveSortieView] = useState<'list' | 'details'>('list');
  const [rideSearchQuery, setRideSearchQuery] = useState('');

  // Sorties state
  const [rides, setRides] = useState<RideSortie[]>(() =>
    loadFromCache<RideSortie[]>(CACHE_KEYS.RIDES, []).map(normalizeRideWaypoints)
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
    motorcycleModel: 'F77',
    variant: 'Recon',
    startingPoint: '',
    shareStartingPoint: true,
    intercomStatus: 'Has an intercom' as RiderParticipant['intercomStatus'],
    intercomModel: '',
    notes: ''
  });

  // Create Ride Form State (with Map Waypoints & GMaps Links)
  const [createForm, setCreateForm] = useState(() =>
    loadFormDraft(CREATE_RIDE_DRAFT_KEY, {
      name: '',
      description: '',
      rideDate: '',
      startTime: '06:00',
      meetingPoint: 'Bengaluru Hangar',
      meetingPointLat: 12.9719 as number | undefined,
      meetingPointLng: 77.6412 as number | undefined,
      meetingPointGmapsUrl: '',
      destination: 'Nandi Hills Summit',
      destinationLat: 13.3702 as number | undefined,
      destinationLng: 77.6835 as number | undefined,
      destinationGmapsUrl: '',
      plannedRoute: '',
      maxDistanceKm: '120',
      estimatedReturnTime: '12:30',
      maxRiders: 15,
      specialInstructions: '',
      pace: 'Moderate' as RideSortie['pace'],
      stops: [] as {
        id: string;
        name: string;
        address?: string;
        lat?: number;
        lng?: number;
        notes?: string;
        googleMapsUrl?: string;
      }[],
      chargingStops: [] as {
        id?: string;
        locationName: string;
        chargerType: string;
        lat?: number;
        lng?: number;
        notes?: string;
        googleMapsUrl?: string;
      }[],
      routeGmapsUrl: '',
      organizerName: ''
    })
  );
  const [createError, setCreateError] = useState('');

  // Add Stop / Break to Selected Ride Modal State
  const [showAddStopModal, setShowAddStopModal] = useState(false);
  const [addStopType, setAddStopType] = useState<'stop' | 'charging'>('stop');
  const [addStopForm, setAddStopForm] = useState({
    name: '',
    address: '',
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
    notes: '',
    googleMapsUrl: '',
    chargerType: 'Supernova'
  });
  const [addStopSearchQuery, setAddStopSearchQuery] = useState('');
  const [addStopSearchResults, setAddStopSearchResults] = useState<PlaceSuggestion[]>([]);
  const [isAddStopSearching, setIsAddStopSearching] = useState(false);
  const [addStopError, setAddStopError] = useState('');

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
      const normalizedBike = String(currentUser.motorcycleModel || '').toUpperCase().includes('X47')
        ? 'X47'
        : 'F77';
      setJoinForm(prev => ({
        ...prev,
        displayName: prev.displayName || displayName,
        motorcycleModel: normalizedBike,
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
        const serverRides: RideSortie[] = Array.isArray(data?.rides)
          ? data.rides.map(normalizeRideWaypoints)
          : [];
        if (serverRides.length > 0) {
          setRides(serverRides);
          saveToCache(CACHE_KEYS.RIDES, serverRides);
          if (!selectedRideId) {
            setSelectedRideId(serverRides[0].id);
          }
        }
      }
    } catch {
      const cached = loadFromCache<RideSortie[]>(CACHE_KEYS.RIDES, []).map(normalizeRideWaypoints);
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

  // Determine if the current user is joined in the selected ride
  const myParticipant: RiderParticipant | undefined = useMemo(() => {
    if (!selectedRide) return undefined;
    const participants = Array.isArray(selectedRide.participants) ? selectedRide.participants : [];

    if (currentUser?.id) {
      const byAuthId = participants.find(p => p.userId === currentUser.id);
      if (byAuthId) return byAuthId;
    }

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
    const normalized = normalizeRideWaypoints(updatedRide);
    const exists = rides.some(r => r.id === normalized.id);
    const next = exists
      ? rides.map(r => (r.id === normalized.id ? normalized : r))
      : [normalized, ...rides];
    setRides(next);
    saveToCache(CACHE_KEYS.RIDES, next);
  };

  // Join Sortie Handler
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
              userId: resolvedUserId,
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
            text: `You have joined "${selectedRide.name}"! You can cancel or back off anytime.`
          });
          return;
        }
      }
    } catch {
      // Local fallback
    }

    const fallbackResult = joinSortieRoster(selectedRide, payload);
    if (!fallbackResult.valid || !fallbackResult.updatedRide) {
      setFeedbackBanner({
        type: 'error',
        text: fallbackResult.error || 'Could not join group ride.'
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
      text: `You have joined "${selectedRide.name}"! You can cancel or back off anytime.`
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
            text: `You have backed off from "${selectedRide.name}".`
          });
          return;
        }
      }
    } catch {
      // Local fallback
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
        text: `You have backed off from "${selectedRide.name}".`
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
          window.dispatchEvent(new Event('ghost-data-updated'));
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
          window.dispatchEvent(new Event('ghost-data-updated'));
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

  // Search places for Add Stop Modal (OpenStreetMap Nominatim + Verified Indian Directory + GMaps Links)
  const handleSearchAddStopPlaces = async (query: string) => {
    const trimmed = query.trim();
    setAddStopSearchQuery(query);
    if (trimmed.length < 2) {
      setAddStopSearchResults([]);
      return;
    }

    const urlCoords = extractCoordinatesFromGoogleMapsUrl(trimmed);
    const urlQueryName = extractQueryTextFromGoogleMapsUrl(trimmed);
    if (urlCoords) {
      const displayLabel =
        urlQueryName || `Pinned Location (${urlCoords.latitude.toFixed(4)}, ${urlCoords.longitude.toFixed(4)})`;
      setAddStopSearchResults([
        {
          id: `gmaps_pin_${urlCoords.latitude}_${urlCoords.longitude}`,
          name: displayLabel,
          locality: `${urlCoords.latitude.toFixed(5)}°N, ${urlCoords.longitude.toFixed(5)}°E`,
          address: trimmed.startsWith('http') ? 'Extracted from Google Maps Link' : 'Direct GPS Coordinates',
          category: 'Google Maps Pin',
          latitude: urlCoords.latitude,
          longitude: urlCoords.longitude
        }
      ]);
      return;
    }

    const effectiveQuery = urlQueryName || trimmed;
    const immediateLocal = searchAndRankPlaces(effectiveQuery, INDIA_TOWN_PLACE_SUGGESTIONS);
    setAddStopSearchResults(immediateLocal);

    setIsAddStopSearching(true);
    try {
      const liveResults = await fetchLiveIndiaPlaces(effectiveQuery);
      const ranked = searchAndRankPlaces(
        effectiveQuery,
        [...liveResults, ...INDIA_TOWN_PLACE_SUGGESTIONS]
      );
      setAddStopSearchResults(ranked);
    } catch {
      setAddStopSearchResults(immediateLocal);
    } finally {
      setIsAddStopSearching(false);
    }
  };

  const handleSelectAddStopSearchResult = (item: PlaceSuggestion) => {
    setAddStopForm(prev => ({
      ...prev,
      name: item.name,
      address: item.address || item.locality,
      lat: item.latitude,
      lng: item.longitude,
      googleMapsUrl: buildGoogleMapsUrl(item.latitude, item.longitude, item.name)
    }));
    setAddStopSearchResults([]);
    setAddStopSearchQuery('');
  };

  // Handler to add a stop or charging hub directly to the currently selected ride
  const handleAddStopToSelectedRide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRide) return;
    setAddStopError('');

    const rawName = (addStopForm.name.trim() || addStopSearchQuery.trim()).trim();
    if (!rawName) {
      setAddStopError('Please provide a name for the stop or waypoint.');
      return;
    }

    // Resolve true coordinates deterministically from explicit selection, Google Maps link, local directory, or live geocoding
    let resolvedLat = addStopForm.lat;
    let resolvedLng = addStopForm.lng;

    const directResolved = resolveTrueWaypointCoordinates(
      {
        name: rawName,
        address: addStopForm.address,
        lat: resolvedLat,
        lng: resolvedLng,
        googleMapsUrl: addStopForm.googleMapsUrl
      },
      INDIA_TOWN_PLACE_SUGGESTIONS
    );

    if (directResolved) {
      resolvedLat = directResolved.latitude;
      resolvedLng = directResolved.longitude;
    } else if (typeof resolvedLat !== 'number' || typeof resolvedLng !== 'number') {
      try {
        const live = await fetchLiveIndiaPlaces(rawName);
        if (live.length > 0 && Number.isFinite(live[0].latitude) && Number.isFinite(live[0].longitude)) {
          resolvedLat = live[0].latitude;
          resolvedLng = live[0].longitude;
        }
      } catch {
        // ignore network failure
      }
    }

    const resetAddStopForm = () => {
      setShowAddStopModal(false);
      setAddStopSearchQuery('');
      setAddStopSearchResults([]);
      setAddStopForm({
        name: '',
        address: '',
        lat: undefined,
        lng: undefined,
        notes: '',
        googleMapsUrl: '',
        chargerType: 'Supernova'
      });
    };

    if (addStopType === 'stop') {
      const payload = {
        name: rawName,
        address: addStopForm.address.trim() || undefined,
        lat: resolvedLat,
        lng: resolvedLng,
        notes: addStopForm.notes.trim() || 'Rest / Coffee Stop',
        googleMapsUrl:
          addStopForm.googleMapsUrl.trim() ||
          buildGoogleMapsUrl(resolvedLat, resolvedLng, rawName)
      };

      try {
        const res = await fetch(`/api/rides/${selectedRide.id}/stops`, {
          method: 'POST',
          headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.ride) {
            saveUpdatedRideToStateAndCache(data.ride);
            resetAddStopForm();
            setFeedbackBanner({
              type: 'success',
              text: `Added stop "${payload.name}" to ride plan!`
            });
            return;
          }
        }
      } catch {
        // Fallback below
      }

      // Offline fallback
      const newStop = {
        id: `stop_${Date.now()}`,
        ...payload
      };
      const updated: RideSortie = {
        ...selectedRide,
        stops: [...(selectedRide.stops || []), newStop]
      };
      saveUpdatedRideToStateAndCache(updated);
      resetAddStopForm();
      setFeedbackBanner({
        type: 'success',
        text: `Added stop "${payload.name}" to ride plan!`
      });
    } else {
      // Charging stop
      const payload = {
        locationName: rawName,
        chargerType: addStopForm.chargerType || 'UV Supernova Fast DC 30kW',
        lat: resolvedLat,
        lng: resolvedLng,
        notes: addStopForm.notes.trim() || 'Designated Charging Stop',
        googleMapsUrl:
          addStopForm.googleMapsUrl.trim() ||
          buildGoogleMapsUrl(resolvedLat, resolvedLng, rawName)
      };

      try {
        const res = await fetch(`/api/rides/${selectedRide.id}/charging-stops`, {
          method: 'POST',
          headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.ride) {
            saveUpdatedRideToStateAndCache(data.ride);
            resetAddStopForm();
            setFeedbackBanner({
              type: 'success',
              text: `Added charging hub "${payload.locationName}" to ride plan!`
            });
            return;
          }
        }
      } catch {
        // Fallback below
      }

      // Offline fallback
      const newCharge = {
        id: `charge_${Date.now()}`,
        ...payload
      };
      const updated: RideSortie = {
        ...selectedRide,
        chargingStops: [...(selectedRide.chargingStops || []), newCharge]
      };
      saveUpdatedRideToStateAndCache(updated);
      resetAddStopForm();
      setFeedbackBanner({
        type: 'success',
        text: `Added charging hub "${payload.locationName}" to ride plan!`
      });
    }
  };

  // Handler to remove a stop from the selected ride
  const handleRemoveStopFromRide = async (stopId: string) => {
    if (!selectedRide) return;
    try {
      const res = await fetch(`/api/rides/${selectedRide.id}/stops/${stopId}`, {
        method: 'DELETE',
        headers: getSessionAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ride) {
          saveUpdatedRideToStateAndCache(data.ride);
          setFeedbackBanner({ type: 'info', text: 'Stop removed from ride plan.' });
          return;
        }
      }
    } catch {
      // Fallback
    }

    const updated: RideSortie = {
      ...selectedRide,
      stops: (selectedRide.stops || []).filter(s => s.id !== stopId)
    };
    saveUpdatedRideToStateAndCache(updated);
    setFeedbackBanner({ type: 'info', text: 'Stop removed from ride plan.' });
  };

  // Handler to remove a charging stop from the selected ride
  const handleRemoveChargingStopFromRide = async (stopId: string) => {
    if (!selectedRide) return;
    try {
      const res = await fetch(`/api/rides/${selectedRide.id}/charging-stops/${stopId}`, {
        method: 'DELETE',
        headers: getSessionAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ride) {
          saveUpdatedRideToStateAndCache(data.ride);
          setFeedbackBanner({ type: 'info', text: 'Charging hub removed from ride plan.' });
          return;
        }
      }
    } catch {
      // Fallback
    }

    const updated: RideSortie = {
      ...selectedRide,
      chargingStops: (selectedRide.chargingStops || []).filter(c => c.id !== stopId && c.locationName !== stopId)
    };
    saveUpdatedRideToStateAndCache(updated);
    setFeedbackBanner({ type: 'info', text: 'Charging hub removed from ride plan.' });
  };

  // Organize New Group Ride with Map & GMaps Links
  const handleCreateRide = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    const distanceValidation = validateRideDistance(createForm.maxDistanceKm);
    if (!distanceValidation.valid) {
      setCreateError(distanceValidation.error || 'Invalid distance in kilometres.');
      return;
    }

    const organizerName = currentUser
      ? resolveUserDisplayIdentity(currentUser).primaryName
      : createForm.organizerName.trim() || 'Squadron Rider';

    const meetingName = createForm.meetingPoint.trim() || 'Bengaluru Hangar';
    const destName = createForm.destination.trim() || 'Destination';

    let mCoords: { latitude: number; longitude: number } | null = resolveTrueWaypointCoordinates(
      {
        name: meetingName,
        lat: createForm.meetingPointLat,
        lng: createForm.meetingPointLng,
        googleMapsUrl: createForm.meetingPointGmapsUrl
      },
      INDIA_TOWN_PLACE_SUGGESTIONS
    );
    if (!mCoords) {
      try {
        const liveM = await fetchLiveIndiaPlaces(meetingName);
        if (liveM.length > 0) {
          mCoords = { latitude: liveM[0].latitude, longitude: liveM[0].longitude };
        }
      } catch {
        // ignore
      }
    }

    let dCoords: { latitude: number; longitude: number } | null = resolveTrueWaypointCoordinates(
      {
        name: destName,
        lat: createForm.destinationLat,
        lng: createForm.destinationLng,
        googleMapsUrl: createForm.destinationGmapsUrl
      },
      INDIA_TOWN_PLACE_SUGGESTIONS
    );
    if (!dCoords) {
      try {
        const liveD = await fetchLiveIndiaPlaces(destName);
        if (liveD.length > 0) {
          dCoords = { latitude: liveD[0].latitude, longitude: liveD[0].longitude };
        }
      } catch {
        // ignore
      }
    }

    const resolvedStops = await Promise.all(
      (createForm.stops || []).map(async s => {
        const sc = resolveTrueWaypointCoordinates(s, INDIA_TOWN_PLACE_SUGGESTIONS);
        if (sc) {
          return {
            ...s,
            lat: sc.latitude,
            lng: sc.longitude,
            googleMapsUrl: s.googleMapsUrl || buildGoogleMapsUrl(sc.latitude, sc.longitude, s.name)
          };
        }
        return s;
      })
    );

    const resolvedCharging = await Promise.all(
      (createForm.chargingStops || []).map(async c => {
        const cc = resolveTrueWaypointCoordinates(c, INDIA_TOWN_PLACE_SUGGESTIONS);
        if (cc) {
          return {
            ...c,
            lat: cc.latitude,
            lng: cc.longitude,
            googleMapsUrl: c.googleMapsUrl || buildGoogleMapsUrl(cc.latitude, cc.longitude, c.locationName)
          };
        }
        return c;
      })
    );

    const normalizedModel = String(currentUser?.motorcycleModel || '').toUpperCase().includes('X47')
      ? 'X47'
      : 'F77';

    const payload = {
      ...createForm,
      name: createForm.name.trim(),
      description: createForm.description.trim(),
      meetingPoint: meetingName,
      meetingPointLat: mCoords?.latitude ?? createForm.meetingPointLat,
      meetingPointLng: mCoords?.longitude ?? createForm.meetingPointLng,
      meetingPointGmapsUrl:
        createForm.meetingPointGmapsUrl.trim() ||
        buildGoogleMapsUrl(mCoords?.latitude, mCoords?.longitude, meetingName),
      destination: destName,
      destinationLat: dCoords?.latitude,
      destinationLng: dCoords?.longitude,
      destinationGmapsUrl:
        createForm.destinationGmapsUrl.trim() ||
        buildGoogleMapsUrl(dCoords?.latitude, dCoords?.longitude, destName),
      plannedRoute:
        createForm.plannedRoute.trim() || `${meetingName} → ${destName}`,
      organizerName,
      organizerModel: normalizedModel,
      maxDistanceKm: distanceValidation.value,
      stops: resolvedStops,
      chargingStops: resolvedCharging,
      routeGmapsUrl: createForm.routeGmapsUrl
    };

    try {
      const res = await fetch('/api/rides', {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.ride) {
          saveUpdatedRideToStateAndCache(data.ride);
          setSelectedRideId(data.ride.id);
          setActiveSortieView('details');
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
        name: payload.name,
        description: payload.description,
        rideDate: createForm.rideDate || new Date().toISOString().split('T')[0],
        startTime: createForm.startTime || '06:00',
        meetingPoint: payload.meetingPoint,
        meetingPointLat: payload.meetingPointLat,
        meetingPointLng: payload.meetingPointLng,
        meetingPointGmapsUrl: payload.meetingPointGmapsUrl,
        destination: payload.destination,
        destinationLat: payload.destinationLat,
        destinationLng: payload.destinationLng,
        destinationGmapsUrl: payload.destinationGmapsUrl,
        plannedRoute: payload.plannedRoute,
        maxDistanceKm: distanceValidation.value || 100,
        estimatedReturnTime: createForm.estimatedReturnTime,
        maxRiders: Number(createForm.maxRiders) || 15,
        rideLeaderId: leaderId,
        rideLeaderName: organizerName,
        specialInstructions: createForm.specialInstructions,
        pace: createForm.pace,
        stops: resolvedStops,
        chargingStops: resolvedCharging,
        routeGmapsUrl: createForm.routeGmapsUrl,
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
            motorcycleModel: normalizedModel,
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
      setActiveSortieView('details');
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
        window.dispatchEvent(new Event('ghost-data-updated'));
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
        reader.onload = ev => {
          if (ev.target?.result && typeof ev.target.result === 'string') {
            setDestForm(prev => ({
              ...prev,
              uploadedPhotos: [...prev.uploadedPhotos, ev.target!.result as string]
            }));
          }
        };
        reader.readAsDataURL(file);
      });
  };

  // Upload Visited Destination Submission
  const handleUploadVisitedDestination = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadDestError('');

    const authorName = currentUser
      ? resolveUserDisplayIdentity(currentUser).primaryName
      : destForm.authorName.trim() || 'Squadron Pilot';

    const authorModel = currentUser?.motorcycleModel || destForm.authorModel || 'F77 MACH 2';

    const validation = validateVisitedDestinationSubmission({
      title: destForm.title,
      startingPoint: destForm.startingPoint,
      totalDistanceKm: destForm.totalDistanceKm,
      chargingOptionsOnWay: destForm.chargingOptionsOnWay,
      chargerTypesUsed: destForm.chargerTypesUsed,
      locationMapUrl: destForm.locationMapUrl,
      customPhotoUrl: destForm.customPhotoUrl,
      uploadedPhotos: destForm.uploadedPhotos,
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
      text: `Destination "${validation.record.title}" uploaded!`
    });
  };

  // Quick-Action: Plan a Group Ride from a Visited Destination Card
  const handlePlanSortieFromDestination = (dest: VisitedDestinationRecord) => {
    const startName = dest.startingPoint || 'Bengaluru Hangar';
    const mCoords = resolveTrueWaypointCoordinates(
      { name: startName },
      INDIA_TOWN_PLACE_SUGGESTIONS
    );
    const dCoords = resolveTrueWaypointCoordinates(
      { name: dest.title, googleMapsUrl: dest.locationMapUrl },
      INDIA_TOWN_PLACE_SUGGESTIONS
    );

    setCreateForm(prev => ({
      ...prev,
      name: `${dest.title.toUpperCase()} GROUP RIDE`,
      description: dest.routeSummary || dest.riderTips || `Group ride to ${dest.title}.`,
      meetingPoint: startName,
      meetingPointLat: mCoords?.latitude ?? 12.9719,
      meetingPointLng: mCoords?.longitude ?? 77.6412,
      meetingPointGmapsUrl: buildGoogleMapsUrl(mCoords?.latitude ?? 12.9719, mCoords?.longitude ?? 77.6412, startName),
      destination: dest.title,
      destinationLat: dCoords?.latitude,
      destinationLng: dCoords?.longitude,
      destinationGmapsUrl: dest.locationMapUrl || buildGoogleMapsUrl(dCoords?.latitude, dCoords?.longitude, dest.title),
      plannedRoute: `${startName} → ${dest.title}`,
      maxDistanceKm: String(dest.totalDistanceKm),
      routeGmapsUrl: dest.locationMapUrl
    }));
    setActiveSubPage('sorties');
    setShowCreateModal(true);
  };

  const filteredRides = useMemo(() => {
    const q = rideSearchQuery.trim().toLowerCase();
    if (!q) return rides;
    return rides.filter(
      r =>
        r.name.toLowerCase().includes(q) ||
        r.meetingPoint.toLowerCase().includes(q) ||
        r.destination.toLowerCase().includes(q) ||
        r.rideLeaderName.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
    );
  }, [rides, rideSearchQuery]);

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

  return (
    <div className="space-y-6 text-[#F8FAFC]">
      {/* Top Header & Sub-Page Switcher */}
      <div className="glass-panel rounded-xl p-4 sm:p-5 border border-cyan-500/25 bg-gradient-to-r from-[#07101d] via-[#0a1424] to-[#07101d]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-cyan-400 text-xs font-mono tracking-widest uppercase mb-1">
              <Compass className="w-4 h-4 shrink-0" />
              <span>MISSION MODE • SQUADRON RIDES & ROUTE GUIDES</span>
            </div>
            <h1 className="font-display text-xl sm:text-3xl font-black text-white tracking-wider break-words">
              GROUP RIDES & COOL DESTINATIONS
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl break-words">
              Join an upcoming group ride anytime, view full ride plans with interactive maps & Google Maps links, or explore rider-tested destinations.
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

        {/* Sub-Page Tabs: Side-by-side Left and Right */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3.5 mt-4 sm:mt-5 pt-3 sm:pt-4 border-t border-slate-800/80">
          <button
            type="button"
            data-testid="mission-tab-sorties"
            onClick={() => {
              setActiveSubPage('sorties');
              setActiveSortieView('list');
            }}
            className={`w-full text-left p-2.5 sm:p-3.5 rounded-xl border transition-all cursor-pointer overflow-hidden flex flex-col justify-between min-w-0 box-border ${
              activeSubPage === 'sorties'
                ? 'bg-cyan-500/15 border-cyan-400 text-white shadow-[0_0_20px_rgba(0,229,255,0.15)] ring-1 ring-cyan-400/40'
                : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center justify-between gap-1 w-full min-w-0 mb-1.5 sm:mb-2">
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  activeSubPage === 'sorties'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <span className="px-1.5 py-0.5 sm:px-2 rounded bg-slate-950/80 border border-slate-700/80 text-cyan-400 font-mono text-[9px] sm:text-xs font-bold shrink-0">
                {rides.length} Rides
              </span>
            </div>

            <div className="w-full min-w-0">
              <div className="font-display font-bold text-xs sm:text-sm tracking-wide text-white leading-tight break-words">
                1. Group Rides
              </div>
              <div className="text-[10px] sm:text-xs text-slate-400 mt-0.5 leading-snug truncate">
                Upcoming sorties & plans
              </div>
            </div>
          </button>

          <button
            type="button"
            data-testid="mission-tab-destinations"
            onClick={() => setActiveSubPage('destinations')}
            className={`w-full text-left p-2.5 sm:p-3.5 rounded-xl border transition-all cursor-pointer overflow-hidden flex flex-col justify-between min-w-0 box-border ${
              activeSubPage === 'destinations'
                ? 'bg-emerald-500/15 border-emerald-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-400/40'
                : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center justify-between gap-1 w-full min-w-0 mb-1.5 sm:mb-2">
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  activeSubPage === 'destinations'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <span className="px-1.5 py-0.5 sm:px-2 rounded bg-slate-950/80 border border-slate-700/80 text-emerald-400 font-mono text-[9px] sm:text-xs font-bold shrink-0">
                {visitedDestinations.length} Places
              </span>
            </div>

            <div className="w-full min-w-0">
              <div className="font-display font-bold text-xs sm:text-sm tracking-wide text-white leading-tight break-words">
                2. Cool Destinations and Places
              </div>
              <div className="text-[10px] sm:text-xs text-slate-400 mt-0.5 leading-snug truncate">
                Scenic routes & photos
              </div>
            </div>
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
          {/* VIEW MODE 1: BROWSING ALL AVAILABLE GROUP RIDES LIST */}
          {activeSortieView === 'list' && (
            <div className="space-y-6">
              {/* Search & Filter Bar for Available Group Rides */}
              <div className="glass-panel rounded-xl p-4 border border-cyan-500/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#050811]">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={rideSearchQuery}
                    onChange={e => setRideSearchQuery(e.target.value)}
                    placeholder="Search group rides by title, leader, meeting point, destination..."
                    className="w-full bg-[#080D1A] border border-[#1E2D42] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-cyan-400 font-bold">
                    {filteredRides.length} AVAILABLE RIDE(S)
                  </span>
                </div>
              </div>

              {/* Grid of Available Group Rides */}
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {[1, 2, 3].map(n => (
                    <div key={n} className="glass-panel rounded-xl p-5 border border-slate-800 animate-pulse space-y-3">
                      <div className="h-4 w-24 bg-slate-800 rounded" />
                      <div className="h-6 w-3/4 bg-slate-800 rounded" />
                      <div className="h-4 w-1/2 bg-slate-900 rounded" />
                    </div>
                  ))}
                </div>
              ) : filteredRides.length === 0 ? (
                <div className="glass-panel rounded-xl p-8 text-center border border-slate-800 space-y-3">
                  <Users className="w-10 h-10 text-slate-500 mx-auto" />
                  <h3 className="font-display font-bold text-white text-base uppercase">
                    NO GROUP RIDES FOUND
                  </h3>
                  <p className="text-xs text-slate-400">
                    No rides match your search query. Be the first to organize a group ride!
                  </p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-display font-bold text-xs uppercase"
                  >
                    + ORGANIZE GROUP RIDE
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredRides.map(ride => {
                    const userJoinedThisRide = Boolean(
                      (currentUser?.id && ride.participants.some(p => p.userId === currentUser.id)) ||
                        (localRiderMap[ride.id] &&
                          ride.participants.some(
                            p =>
                              p.userId === localRiderMap[ride.id].userId ||
                              p.id === localRiderMap[ride.id].participantId
                          ))
                    );

                    return (
                      <div
                        key={ride.id}
                        data-testid={`ride-card-${ride.id}`}
                        className="glass-panel rounded-xl p-5 border border-slate-800 hover:border-cyan-500/50 transition-all flex flex-col justify-between space-y-4 bg-[#050811] shadow-xl"
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`px-2.5 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                                ride.status === 'In Progress' || (ride.status as string) === 'Active / Riding'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : ride.status === 'Completed'
                                  ? 'bg-slate-800 text-slate-400'
                                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              }`}
                            >
                              {ride.status === 'Full' ? 'Open to Join' : ride.status}
                            </span>

                            {userJoinedThisRide && (
                              <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold uppercase flex items-center gap-1">
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>YOU JOINED</span>
                              </span>
                            )}
                          </div>

                          <div>
                            <h3 className="font-display font-bold text-white text-lg leading-snug">
                              {ride.name}
                            </h3>
                            <p className="text-xs text-slate-300 mt-1 line-clamp-2">
                              {ride.description}
                            </p>
                          </div>

                          <div className="p-3 rounded-lg bg-[#080D1A] border border-[#1E2D42] space-y-1.5">
                            <div className="text-xs text-cyan-400 font-bold flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{ride.meetingPoint} → {ride.destination}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                              <span>Pace: <strong className="text-white">{ride.pace}</strong></span>
                              <span className="text-cyan-300 font-bold">{ride.maxDistanceKm} KM</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400 pt-1">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-cyan-400" />
                              <span>{ride.rideDate} ({ride.startTime})</span>
                            </span>
                            <span className="flex items-center gap-1 text-slate-300">
                              <Users className="w-3 h-3 text-emerald-400" />
                              <span>{ride.participants.length} / {ride.maxRiders} Riders</span>
                            </span>
                          </div>
                        </div>

                        {/* Dedicated View Details Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRideId(ride.id);
                            setActiveSortieView('details');
                          }}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-xs tracking-wider uppercase transition-all shadow-lg shadow-cyan-500/20 cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>VIEW FULL RIDE DETAILS & MAP ↗</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* VIEW MODE 2: DEDICATED GROUP RIDE DETAILS PAGE */}
          {activeSortieView === 'details' && selectedRide && (
            <div className="space-y-6" data-testid="dedicated-ride-details-page">
              {/* Back to Group Rides Header Bar */}
              <div className="flex items-center justify-between gap-3 bg-[#050811] border border-[#1E2D42] rounded-xl px-4 py-3 shadow-2xl">
                <button
                  type="button"
                  data-testid="btn-back-to-rides-list"
                  onClick={() => setActiveSortieView('list')}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#080D1A] hover:bg-[#0F172A] text-[#38BDF8] border border-[#1E2D42] font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>← BACK TO ALL GROUP RIDES</span>
                </button>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                    {selectedRide.status === 'Full' ? 'Open to Join' : selectedRide.status}
                  </span>
                  <span className="hidden sm:inline px-2.5 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono">
                    Pace: {selectedRide.pace}
                  </span>
                </div>
              </div>

              {/* Ride Summary Overview Card */}
              <div className="glass-panel rounded-xl p-6 border border-cyan-500/30 space-y-5 bg-[#050811]">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-2xl sm:text-3xl font-black text-white tracking-wide">
                      {selectedRide.name}
                    </h2>
                    <p className="text-slate-300 text-sm mt-1">{selectedRide.description}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="px-3 py-1 rounded bg-[#080D1A] border border-[#1E2D42] text-cyan-400 font-mono text-xs font-bold">
                      Leader: {selectedRide.rideLeaderName}
                    </span>
                  </div>
                </div>

                {/* Key Ride Facts Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-[#080D1A] border border-[#1E2D42]">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">DATE & START TIME</div>
                    <div className="text-sm font-bold text-white mt-1">
                      {selectedRide.rideDate} • {selectedRide.startTime}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-[#080D1A] border border-[#1E2D42]">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">MEETING POINT</div>
                    <div className="text-sm font-bold text-cyan-400 mt-1 truncate">
                      {selectedRide.meetingPoint}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-[#080D1A] border border-[#1E2D42]">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">DESTINATION</div>
                    <div className="text-sm font-bold text-emerald-400 mt-1 truncate">
                      {selectedRide.destination}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-[#080D1A] border border-[#1E2D42]">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">TOTAL DISTANCE</div>
                    <div className="text-sm font-bold text-white mt-1">
                      {selectedRide.maxDistanceKm} KM
                    </div>
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
              </div>

              {/* DEDICATED MISSION MODE MAP & WAYPOINTS DISPLAY */}
              <div className="glass-panel rounded-xl p-5 border border-cyan-500/30 space-y-4 bg-[#050811]">
                <div className="flex items-center justify-between border-b border-[#131C2B] pb-3">
                  <h3 className="font-display text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Route className="w-5 h-5 text-[#38BDF8]" />
                    <span>RIDE ROUTE MAP & WAYPOINTS PLAN</span>
                  </h3>
                  <span className="font-mono text-xs text-[#38BDF8]">
                    {selectedRide.meetingPoint} → {selectedRide.destination}
                  </span>
                </div>

                {/* Interactive Leaflet Route Map */}
                <MissionRouteMap
                  mode="view"
                  meetingPoint={{
                    name: selectedRide.meetingPoint,
                    lat: selectedRide.meetingPointLat,
                    lng: selectedRide.meetingPointLng,
                    googleMapsUrl: selectedRide.meetingPointGmapsUrl
                  }}
                  destination={{
                    name: selectedRide.destination,
                    lat: selectedRide.destinationLat,
                    lng: selectedRide.destinationLng,
                    googleMapsUrl: selectedRide.destinationGmapsUrl
                  }}
                  stops={selectedRide.stops}
                  chargingStops={selectedRide.chargingStops}
                  routeGmapsUrl={selectedRide.routeGmapsUrl}
                />
              </div>

              {/* DEDICATED RIDE PLAN & STOPS BREAKDOWN CARD */}
              <div
                data-testid="ride-plan-breakdown-card"
                className="glass-panel rounded-xl p-5 sm:p-6 border border-cyan-500/30 space-y-5 bg-[#050811] shadow-2xl"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#131C2B] pb-4">
                  <div>
                    <h3 className="font-display text-base sm:text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Route className="w-5 h-5 text-cyan-400 shrink-0" />
                      <span>RIDE PLAN: STOPS, REST BREAKS & CHARGING HUBS</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Sequential route schedule with direct Google Maps navigation for each waypoint.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid="btn-add-stop-modal"
                      onClick={() => {
                        setAddStopType('stop');
                        setAddStopError('');
                        setShowAddStopModal(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-mono text-xs font-bold uppercase transition-all cursor-pointer"
                    >
                      <Coffee className="w-3.5 h-3.5" />
                      <span>+ ADD STOP / BREAK</span>
                    </button>

                    <button
                      type="button"
                      data-testid="btn-add-charger-modal"
                      onClick={() => {
                        setAddStopType('charging');
                        setAddStopError('');
                        setShowAddStopModal(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 font-mono text-xs font-bold uppercase transition-all cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>+ ADD CHARGING HUB</span>
                    </button>
                  </div>
                </div>

                {/* Sequential Itinerary Waypoints Timeline */}
                <div className="space-y-4">
                  {/* 1. Meeting Point */}
                  <div className="p-4 rounded-xl bg-[#080D1A] border border-cyan-500/30 relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center text-cyan-300 shrink-0 text-base shadow-[0_0_12px_rgba(56,189,248,0.3)]">
                        📍
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                            START • MEETING POINT
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            {selectedRide.startTime} IST
                          </span>
                        </div>
                        <h4 className="font-display font-bold text-sm sm:text-base text-white">
                          {selectedRide.meetingPoint}
                        </h4>
                        {(selectedRide.meetingPointLat && selectedRide.meetingPointLng) && (
                          <div className="text-[11px] font-mono text-slate-400">
                            GPS: {selectedRide.meetingPointLat.toFixed(5)}°N, {selectedRide.meetingPointLng.toFixed(5)}°E
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        openInGoogleMaps(
                          selectedRide.meetingPointGmapsUrl,
                          selectedRide.meetingPointLat,
                          selectedRide.meetingPointLng,
                          selectedRide.meetingPoint
                        )
                      }
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-mono text-xs uppercase transition-all shrink-0 cursor-pointer"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>OPEN IN GMAPS ↗</span>
                    </button>
                  </div>

                  {/* 2. Intermediate Stops & Coffee Breaks */}
                  {Array.isArray(selectedRide.stops) && selectedRide.stops.length > 0 ? (
                    <div className="space-y-3 pl-2 sm:pl-4 border-l-2 border-dashed border-amber-500/40 my-2">
                      <div className="text-[11px] font-mono uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1.5">
                        <Coffee className="w-3.5 h-3.5" />
                        <span>INTERMEDIATE STOPS & REST BREAKS ({selectedRide.stops.length})</span>
                      </div>

                      {selectedRide.stops.map((stop, idx) => (
                        <div
                          key={stop.id || idx}
                          data-testid={`ride-stop-item-${stop.id || idx}`}
                          className="p-3.5 rounded-xl bg-[#080D1A] border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-300 shrink-0 text-sm shadow-[0_0_10px_rgba(245,158,11,0.3)]">
                              ☕
                            </div>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  STOP {idx + 1} • REST / REGROUP
                                </span>
                              </div>
                              <h5 className="font-display font-bold text-sm text-white">
                                {stop.name}
                              </h5>
                              {stop.address && (
                                <p className="text-xs text-slate-400">{stop.address}</p>
                              )}
                              {stop.notes && (
                                <p className="text-xs text-amber-200/90 font-mono bg-amber-950/30 px-2 py-0.5 rounded border border-amber-500/20 inline-block mt-0.5">
                                  {stop.notes}
                                </p>
                              )}
                              {(stop.lat && stop.lng) && (
                                <div className="text-[10px] font-mono text-slate-500">
                                  GPS: {stop.lat.toFixed(5)}°N, {stop.lng.toFixed(5)}°E
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                openInGoogleMaps(
                                  stop.googleMapsUrl,
                                  stop.lat,
                                  stop.lng,
                                  stop.name
                                )
                              }
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-mono text-xs uppercase transition-all cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>OPEN IN GMAPS ↗</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRemoveStopFromRide(stop.id)}
                              title="Remove this stop from ride plan"
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-[#080D1A]/60 border border-slate-800 text-slate-400 text-xs flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Coffee className="w-4 h-4 text-slate-500" />
                        <span>No intermediate rest/coffee stops added yet.</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setAddStopType('stop');
                          setAddStopError('');
                          setShowAddStopModal(true);
                        }}
                        className="text-[11px] font-mono text-amber-400 hover:underline cursor-pointer"
                      >
                        + Add First Stop
                      </button>
                    </div>
                  )}

                  {/* 3. Intermediate Charging Stations */}
                  {Array.isArray(selectedRide.chargingStops) && selectedRide.chargingStops.length > 0 ? (
                    <div className="space-y-3 pl-2 sm:pl-4 border-l-2 border-dashed border-purple-500/40 my-2">
                      <div className="text-[11px] font-mono uppercase tracking-wider text-purple-400 font-bold flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5" />
                        <span>CHARGING STATIONS & HUBS ({selectedRide.chargingStops.length})</span>
                      </div>

                      {selectedRide.chargingStops.map((charger, idx) => (
                        <div
                          key={charger.id || idx}
                          data-testid={`ride-charger-item-${charger.id || idx}`}
                          className="p-3.5 rounded-xl bg-[#080D1A] border border-purple-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/50 flex items-center justify-center text-purple-300 shrink-0 text-sm shadow-[0_0_10px_rgba(168,85,247,0.3)]">
                              ⚡
                            </div>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                  CHARGER {idx + 1} • {charger.chargerType}
                                </span>
                              </div>
                              <h5 className="font-display font-bold text-sm text-white">
                                {charger.locationName || (charger as any).name || (charger as any).location}
                              </h5>
                              {charger.notes && (
                                <p className="text-xs text-purple-200/90 font-mono bg-purple-950/30 px-2 py-0.5 rounded border border-purple-500/20 inline-block mt-0.5">
                                  {charger.notes}
                                </p>
                              )}
                              {(charger.lat && charger.lng) && (
                                <div className="text-[10px] font-mono text-slate-500">
                                  GPS: {charger.lat.toFixed(5)}°N, {charger.lng.toFixed(5)}°E
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                openInGoogleMaps(
                                  charger.googleMapsUrl,
                                  charger.lat,
                                  charger.lng,
                                  charger.locationName || (charger as any).name
                                )
                              }
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 font-mono text-xs uppercase transition-all cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>OPEN IN GMAPS ↗</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRemoveChargingStopFromRide(charger.id || charger.locationName || (charger as any).name)}
                              title="Remove this charger from ride plan"
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {/* 4. Final Destination */}
                  <div className="p-4 rounded-xl bg-[#080D1A] border border-emerald-500/30 relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-300 shrink-0 text-base shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                        🏁
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            FINISH • DESTINATION
                          </span>
                          {selectedRide.estimatedReturnTime && (
                            <span className="text-xs font-mono text-slate-400">
                              Est. Return: {selectedRide.estimatedReturnTime}
                            </span>
                          )}
                        </div>
                        <h4 className="font-display font-bold text-sm sm:text-base text-white">
                          {selectedRide.destination}
                        </h4>
                        {(selectedRide.destinationLat && selectedRide.destinationLng) && (
                          <div className="text-[11px] font-mono text-slate-400">
                            GPS: {selectedRide.destinationLat.toFixed(5)}°N, {selectedRide.destinationLng.toFixed(5)}°E
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        openInGoogleMaps(
                          selectedRide.destinationGmapsUrl,
                          selectedRide.destinationLat,
                          selectedRide.destinationLng,
                          selectedRide.destination
                        )
                      }
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-mono text-xs uppercase transition-all shrink-0 cursor-pointer"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>OPEN IN GMAPS ↗</span>
                    </button>
                  </div>
                </div>

                {/* Master Route Quick Launch Banner */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/40 via-[#080D1A] to-emerald-950/40 border border-cyan-500/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="font-display font-bold text-xs sm:text-sm text-white uppercase tracking-wider flex items-center gap-2">
                      <Route className="w-4 h-4 text-cyan-400" />
                      <span>COMPLETE MULTI-STOP GMAPS NAVIGATION</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Opens full turn-by-turn route connecting meeting point, all intermediate stops & destination directly in Google Maps on your phone.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      openInGoogleMaps(
                        buildMasterRouteGoogleMapsUrl({
                          meetingPoint: {
                            name: selectedRide.meetingPoint,
                            lat: selectedRide.meetingPointLat,
                            lng: selectedRide.meetingPointLng
                          },
                          destination: {
                            name: selectedRide.destination,
                            lat: selectedRide.destinationLat,
                            lng: selectedRide.destinationLng
                          },
                          stops: selectedRide.stops,
                          chargingStops: selectedRide.chargingStops,
                          customRouteUrl: selectedRide.routeGmapsUrl
                        })
                      )
                    }
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-cyan-500/25 shrink-0 cursor-pointer"
                  >
                    <Navigation className="w-4 h-4 fill-current" />
                    <span>OPEN FULL ROUTE IN GMAPS ↗</span>
                  </button>
                </div>
              </div>

              {/* Joined Rider Controls: Checklist & Live Status */}
              {isJoinedInSelectedRide && myParticipant && (
                <div className="glass-panel rounded-xl p-5 border border-emerald-500/30 space-y-4 bg-[#050811]">
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

              {/* Ride Leader Controls */}
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
                      className="px-4 py-2 rounded-lg bg-amber-500 text-slate-950 font-display font-bold text-xs uppercase cursor-pointer"
                    >
                      Broadcast
                    </button>
                  </div>
                </div>
              )}

              {/* Joined Riders Roster */}
              <div className="glass-panel rounded-xl p-5 border border-slate-800 space-y-4 bg-[#050811]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="font-display font-bold text-white text-base uppercase flex items-center space-x-2">
                    <Users className="w-5 h-5 text-emerald-400" />
                    <span>SQUADRON RIDER ROSTER ({selectedRide.participants.length})</span>
                  </h3>
                  <span className="text-xs font-mono text-slate-400">
                    Max Capacity: {selectedRide.maxRiders}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase">
                        <th className="py-2.5 px-3">Pilot Name</th>
                        <th className="py-2.5 px-3">Bike Model</th>
                        <th className="py-2.5 px-3">Starting Point</th>
                        <th className="py-2.5 px-3">Intercom</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {selectedRide.participants.map(p => (
                        <tr key={p.id} className="hover:bg-slate-900/40">
                          <td className="py-2.5 px-3 font-bold text-white">{p.displayName}</td>
                          <td className="py-2.5 px-3 text-cyan-400">{p.motorcycleModel}</td>
                          <td className="py-2.5 px-3 text-slate-300">
                            {p.shareStartingPoint ? p.startingPoint || 'Not specified' : 'Private'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">{p.intercomStatus}</td>
                          <td className="py-2.5 px-3 text-right">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                p.status === 'Reached Home Safely'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : p.status === 'Needs Assistance'
                                  ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                  : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* SUB-PAGE 2: VISITED DESTINATIONS & RIDER ROUTE GUIDES */}
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
                COOL DESTINATIONS & PLACES VISITED BY RIDERS
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
                      {/* Rider attribution */}
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
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Map Link & Plan a Ride Button */}
                  <div className="p-4 pt-0 flex flex-col sm:flex-row gap-2">
                    <a
                      href={dest.locationMapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 font-display font-bold text-xs tracking-wider uppercase transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>OPEN LOCATION MAP</span>
                    </a>

                    <button
                      type="button"
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

      {/* MODAL 1: JOIN SORTIE */}
      {showJoinModal && selectedRide && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-lg w-full p-6 border border-emerald-500/40 space-y-4 bg-[#050811]">
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
                    value={joinForm.motorcycleModel === 'X47' ? 'X47' : 'F77'}
                    onChange={e => setJoinForm({ ...joinForm, motorcycleModel: e.target.value })}
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                  >
                    <option value="F77">F77</option>
                    <option value="X47">X47</option>
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

      {/* MODAL 2: CANCEL / BACK OFF FROM SORTIE */}
      {showBackOffModal && selectedRide && myParticipant && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-md w-full p-6 border border-red-500/40 space-y-4 bg-[#050811]">
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
              Can't make it to <strong className="text-white">{selectedRide.name}</strong>? Confirming below will remove <strong className="text-emerald-300">{myParticipant.displayName}</strong> from the active rider roster so the Ride Leader knows not to wait.
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
                  placeholder="e.g., Work commitment came up"
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

      {/* MODAL: ADD STOP / CHARGING HUB TO SELECTED RIDE */}
      {showAddStopModal && selectedRide && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-lg w-full p-6 border border-cyan-500/40 space-y-4 max-h-[92vh] overflow-y-auto bg-[#050811]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="text-[10px] font-mono uppercase text-cyan-400 font-bold">
                  SORTIE ITINERARY PLANNER
                </div>
                <h3 className="font-display text-lg font-bold text-white uppercase">
                  ADD {addStopType === 'stop' ? 'REST STOP / BREAK' : 'CHARGING HUB'} TO RIDE
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddStopModal(false)}
                className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Type selector toggle */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setAddStopType('stop')}
                className={`py-2 px-3 rounded-lg font-mono text-xs font-bold uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  addStopType === 'stop'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Coffee className="w-4 h-4" />
                <span>Rest / Coffee Stop</span>
              </button>

              <button
                type="button"
                onClick={() => setAddStopType('charging')}
                className={`py-2 px-3 rounded-lg font-mono text-xs font-bold uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  addStopType === 'charging'
                    ? 'bg-purple-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span>Charging Hub</span>
              </button>
            </div>

            {/* Location Search Bar */}
            <div className="space-y-1">
              <label className="block text-xs font-mono text-slate-300 uppercase">
                SEARCH ANY TOWN, CITY, HILL, CAFE OR SPOT
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={addStopSearchQuery}
                  onChange={e => handleSearchAddStopPlaces(e.target.value)}
                  placeholder="e.g. Indian Paratha Company, CCD Kolar, Devanahalli Toll..."
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                />
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                {isAddStopSearching && (
                  <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin absolute right-3 top-3" />
                )}
              </div>

              {addStopSearchResults.length > 0 && (
                <div className="bg-[#050811] border border-slate-700 rounded-xl shadow-2xl max-h-48 overflow-y-auto divide-y divide-slate-800 mt-1">
                  {addStopSearchResults.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectAddStopSearchResult(item)}
                      className="w-full text-left p-2.5 hover:bg-slate-900 transition-colors flex items-start gap-2 text-xs text-slate-300 cursor-pointer"
                    >
                      <MapPin className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-white">{item.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{item.address || item.locality}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {addStopError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono">
                {addStopError}
              </div>
            )}

            <form onSubmit={handleAddStopToSelectedRide} className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                  {addStopType === 'stop' ? 'STOP / VENUE NAME *' : 'CHARGING HUB / LOCATION NAME *'}
                </label>
                <input
                  type="text"
                  required
                  value={addStopForm.name}
                  onChange={e => setAddStopForm({ ...addStopForm, name: e.target.value })}
                  placeholder={addStopType === 'stop' ? 'e.g. Indian Paratha Company' : 'e.g. Shell Devanahalli Highway Hub'}
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              {addStopType === 'charging' && (
                <div>
                  <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                    CHARGER TYPE *
                  </label>
                  <select
                    value={addStopForm.chargerType}
                    onChange={e => setAddStopForm({ ...addStopForm, chargerType: e.target.value })}
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-400"
                  >
                    <option value="Supernova">UV Supernova Fast DC 30kW</option>
                    <option value="Type 6">IEC Type 6 DC Fast</option>
                    <option value="Type 2">Type 2 AC (7.4kW / 11kW)</option>
                    <option value="Socket">15A 3-Pin Industrial Socket</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                  NOTES FOR SQUADRON RIDERS (OPTIONAL)
                </label>
                <input
                  type="text"
                  value={addStopForm.notes}
                  onChange={e => setAddStopForm({ ...addStopForm, notes: e.target.value })}
                  placeholder={addStopType === 'stop' ? 'e.g. Regroup & tyre pressure check (20 mins)' : 'e.g. 30 min top-up before ghat section'}
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                  GOOGLE MAPS LINK FOR THIS STOP (OPTIONAL OVERRIDE)
                </label>
                <input
                  type="url"
                  value={addStopForm.googleMapsUrl}
                  onChange={e => {
                    const url = e.target.value;
                    const extracted = extractCoordinatesFromGoogleMapsUrl(url);
                    const extractedName = extractQueryTextFromGoogleMapsUrl(url);
                    setAddStopForm(prev => ({
                      ...prev,
                      googleMapsUrl: url,
                      lat: extracted ? extracted.latitude : prev.lat,
                      lng: extracted ? extracted.longitude : prev.lng,
                      name: prev.name || extractedName || ''
                    }));
                  }}
                  placeholder="https://www.google.com/maps/search/?api=1&query=..."
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                />
                {typeof addStopForm.lat === 'number' && typeof addStopForm.lng === 'number' && (
                  <p className="text-[11px] font-mono text-emerald-400 mt-1">
                    ✓ Locked Coordinates: {addStopForm.lat.toFixed(5)}°N, {addStopForm.lng.toFixed(5)}°E
                  </p>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddStopModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-mono uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="btn-confirm-add-stop"
                  className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-xs tracking-wider uppercase cursor-pointer shadow-lg shadow-cyan-500/25"
                >
                  SAVE STOP TO RIDE PLAN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showUploadDestModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-2xl w-full p-6 border border-emerald-500/40 space-y-4 max-h-[92vh] overflow-y-auto bg-[#050811]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="text-[11px] font-mono text-emerald-400 uppercase">
                  SHARE YOUR RIDE EXPERIENCE
                </div>
                <h3 className="font-display text-xl font-bold text-white uppercase">
                  UPLOAD VISITED DESTINATION
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
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {uploadDestError}
              </div>
            )}

            <form onSubmit={handleUploadVisitedDestination} className="space-y-4">
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
                    placeholder="e.g., Mullayanagiri Peak & Chikmagalur"
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                    STARTING POINT / CITY *
                  </label>
                  <input
                    type="text"
                    required
                    data-testid="input-dest-start"
                    value={destForm.startingPoint}
                    onChange={e => setDestForm({ ...destForm, startingPoint: e.target.value })}
                    placeholder="e.g., Bengaluru (Nelamangala Toll)"
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                    TOTAL ROUND TRIP DISTANCE (KM) *
                  </label>
                  <input
                    type="number"
                    required
                    data-testid="input-dest-dist"
                    value={destForm.totalDistanceKm}
                    onChange={e => setDestForm({ ...destForm, totalDistanceKm: e.target.value })}
                    placeholder="e.g., 485"
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                    GOOGLE MAPS LOCATION LINK *
                  </label>
                  <input
                    type="url"
                    required
                    data-testid="input-dest-map-url"
                    value={destForm.locationMapUrl}
                    onChange={e => setDestForm({ ...destForm, locationMapUrl: e.target.value })}
                    placeholder="https://www.google.com/maps/search/..."
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                  OPTIONS TO CHARGE BIKE ON THE WAY *
                </label>
                <textarea
                  rows={2}
                  required
                  data-testid="input-dest-charging"
                  value={destForm.chargingOptionsOnWay}
                  onChange={e => setDestForm({ ...destForm, chargingOptionsOnWay: e.target.value })}
                  placeholder="e.g., UV Supernova fast charger at Hassan Highway Plaza + 15A sockets at CCD Kunigal."
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                />
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

      {/* MODAL 4: ORGANIZE A NEW GROUP RIDE (WITH MISSION ROUTE MAP & GOOGLE MAPS LINKS) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-4xl w-full p-6 border border-cyan-500/40 space-y-5 max-h-[92vh] overflow-y-auto bg-[#050811]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-display text-xl font-bold text-white uppercase">
                  ORGANIZE A NEW GROUP RIDE
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Set meeting point, destination, stops/breaks & charging stations using the interactive map and search bar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateRide} className="space-y-5">
              {/* Ride Basic Info */}
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
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
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
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="Relaxed">Relaxed (Scenic / Beginner Friendly)</option>
                    <option value="Moderate">Moderate (Standard Highway Cruise)</option>
                    <option value="Spirited">Spirited (Experienced Ghat Pace)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-1">
                  RIDE DETAILS & DESCRIPTION
                </label>
                <textarea
                  rows={2}
                  value={createForm.description}
                  onChange={e => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Provide ride description, road expectations, gear recommendations..."
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                />
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
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
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
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
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
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              {/* Direct Meeting Point & Destination Inputs + Interactive Route Map */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono text-cyan-400 uppercase mb-1">
                      📍 MEETING POINT *
                    </label>
                    <input
                      type="text"
                      required
                      value={createForm.meetingPoint}
                      onChange={e => {
                        const val = e.target.value;
                        const resolved = resolveTrueWaypointCoordinates({ name: val }, INDIA_TOWN_PLACE_SUGGESTIONS);
                        setCreateForm(prev => ({
                          ...prev,
                          meetingPoint: val,
                          meetingPointLat: resolved?.latitude,
                          meetingPointLng: resolved?.longitude
                        }));
                      }}
                      placeholder="e.g., Bengaluru Hangar / Hebbal Flyover"
                      className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-emerald-400 uppercase mb-1">
                      🏁 DESTINATION *
                    </label>
                    <input
                      type="text"
                      required
                      value={createForm.destination}
                      onChange={e => {
                        const val = e.target.value;
                        const resolved = resolveTrueWaypointCoordinates({ name: val }, INDIA_TOWN_PLACE_SUGGESTIONS);
                        setCreateForm(prev => ({
                          ...prev,
                          destination: val,
                          destinationLat: resolved?.latitude,
                          destinationLng: resolved?.longitude
                        }));
                      }}
                      placeholder="e.g., Kolar / Nandi Hills / Coorg"
                      className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-sm text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                    <Route className="w-4 h-4" />
                    <span>MISSION ROUTE MAP & WAYPOINTS PICKER</span>
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    Search any town/city/hill or pick on map
                  </span>
                </div>

                <MissionRouteMap
                  mode="edit"
                  meetingPoint={{
                    name: createForm.meetingPoint,
                    lat: createForm.meetingPointLat,
                    lng: createForm.meetingPointLng,
                    googleMapsUrl: createForm.meetingPointGmapsUrl
                  }}
                  destination={{
                    name: createForm.destination,
                    lat: createForm.destinationLat,
                    lng: createForm.destinationLng,
                    googleMapsUrl: createForm.destinationGmapsUrl
                  }}
                  stops={createForm.stops}
                  chargingStops={createForm.chargingStops}
                  routeGmapsUrl={createForm.routeGmapsUrl}
                  onSelectMeetingPoint={pt => {
                    setCreateForm(prev => ({
                      ...prev,
                      meetingPoint: pt.name,
                      meetingPointLat: pt.lat,
                      meetingPointLng: pt.lng,
                      meetingPointGmapsUrl: pt.googleMapsUrl || buildGoogleMapsUrl(pt.lat, pt.lng, pt.name)
                    }));
                  }}
                  onSelectDestination={pt => {
                    setCreateForm(prev => ({
                      ...prev,
                      destination: pt.name,
                      destinationLat: pt.lat,
                      destinationLng: pt.lng,
                      destinationGmapsUrl: pt.googleMapsUrl || buildGoogleMapsUrl(pt.lat, pt.lng, pt.name)
                    }));
                  }}
                  onAddStop={st => {
                    setCreateForm(prev => ({
                      ...prev,
                      stops: [...prev.stops, st]
                    }));
                  }}
                  onRemoveStop={id => {
                    setCreateForm(prev => ({
                      ...prev,
                      stops: prev.stops.filter(s => s.id !== id)
                    }));
                  }}
                  onAddChargingStop={c => {
                    setCreateForm(prev => ({
                      ...prev,
                      chargingStops: [...prev.chargingStops, c]
                    }));
                  }}
                  onRemoveChargingStop={idx => {
                    setCreateForm(prev => ({
                      ...prev,
                      chargingStops: prev.chargingStops.filter((_, i) => i !== idx)
                    }));
                  }}
                />

                {/* Configured Stops & Charging Stations Preview in Create Form */}
                {(createForm.stops.length > 0 || createForm.chargingStops.length > 0) && (
                  <div className="p-3.5 rounded-xl bg-[#080D1A] border border-[#1E2D42] space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-mono font-bold text-white uppercase">
                      <span className="flex items-center gap-1.5 text-cyan-400">
                        <Route className="w-4 h-4" />
                        <span>CONFIGURED STOPS IN THIS RIDE PLAN ({createForm.stops.length + createForm.chargingStops.length})</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {createForm.stops.map((st, sIdx) => (
                        <div
                          key={st.id || sIdx}
                          className="p-2.5 rounded-lg bg-[#050811] border border-amber-500/30 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs">☕</span>
                              <span className="text-[9px] font-mono font-bold uppercase text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/30">
                                STOP {sIdx + 1}
                              </span>
                              <span className="text-xs font-bold text-white truncate">{st.name}</span>
                            </div>
                            {st.notes && <p className="text-[11px] text-amber-200/80 font-mono truncate mt-0.5">{st.notes}</p>}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setCreateForm(prev => ({
                                ...prev,
                                stops: prev.stops.filter(s => s.id !== st.id)
                              }))
                            }
                            className="p-1 text-slate-500 hover:text-red-400 transition-colors cursor-pointer shrink-0"
                            title="Remove Stop"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}

                      {createForm.chargingStops.map((ch, cIdx) => (
                        <div
                          key={ch.id || cIdx}
                          className="p-2.5 rounded-lg bg-[#050811] border border-purple-500/30 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs">⚡</span>
                              <span className="text-[9px] font-mono font-bold uppercase text-purple-400 bg-purple-500/10 px-1.5 py-0.2 rounded border border-purple-500/30">
                                CHARGER {cIdx + 1}
                              </span>
                              <span className="text-xs font-bold text-white truncate">{ch.locationName}</span>
                            </div>
                            <p className="text-[11px] text-purple-200/80 font-mono truncate mt-0.5">{ch.chargerType}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setCreateForm(prev => ({
                                ...prev,
                                chargingStops: prev.chargingStops.filter((_, i) => i !== cIdx)
                              }))
                            }
                            className="p-1 text-slate-500 hover:text-red-400 transition-colors cursor-pointer shrink-0"
                            title="Remove Charger"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Custom Google Maps Links Overrides */}
              <div className="p-4 rounded-xl bg-[#080D1A] border border-[#1E2D42] space-y-3">
                <div className="font-display font-bold text-xs text-white uppercase tracking-wider flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-[#38BDF8]" />
                  <span>CUSTOM GOOGLE MAPS LINKS (OPTIONAL OVERRIDES)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                      Meeting Point GMaps Link
                    </label>
                    <input
                      type="url"
                      value={createForm.meetingPointGmapsUrl}
                      onChange={e => setCreateForm({ ...createForm, meetingPointGmapsUrl: e.target.value })}
                      placeholder="https://maps.app.goo.gl/..."
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                      Destination GMaps Link
                    </label>
                    <input
                      type="url"
                      value={createForm.destinationGmapsUrl}
                      onChange={e => setCreateForm({ ...createForm, destinationGmapsUrl: e.target.value })}
                      placeholder="https://maps.app.goo.gl/..."
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                    Master Full Route GMaps Link
                  </label>
                  <input
                    type="url"
                    value={createForm.routeGmapsUrl}
                    onChange={e => setCreateForm({ ...createForm, routeGmapsUrl: e.target.value })}
                    placeholder="https://www.google.com/maps/dir/..."
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-mono uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-xs tracking-wider uppercase cursor-pointer shadow-lg shadow-cyan-500/20"
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
