import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Compass,
  Navigation,
  MapPin,
  ArrowUpDown,
  Zap,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  Coffee,
  Bookmark,
  Share2,
  Star,
  Clock,
  ExternalLink,
  Search,
  Loader2,
  X,
  MessageSquarePlus,
  CloudRain,
  Wind,
  Thermometer,
  Info,
  Check,
  LocateFixed,
  SlidersHorizontal,
  Crosshair,
  Phone,
  User as UserIcon
} from 'lucide-react';
import {
  planAutoPilotMission,
  resolveNextChargerNavigation,
  discoverCorridorPitStops,
  VALID_CHARGER_REPORT_CATEGORIES,
  type RouteCoordinate,
  type EligibleChargerRecord,
  type ChargerCommunityReport,
  type ChargerReportCategory,
  type PlannedPitStop,
  type RangeGuardConfig,
  type AutoPilotMissionRecord
} from '../utils/autopilot';
import {
  VALID_CHARGER_PLUG_TYPES,
  searchAndRankPlaces,
  buildChargerNavigationUrl,
  validateManualCoordinates,
  formatManualCoordinatesFallback,
  generateOfflineCorridorGeometry,
  resolveChargerSubmitterInfo,
  type ChargerPlugType,
  type PlaceSuggestion
} from '../utils/rules';
import {
  CACHE_KEYS,
  saveToCache,
  loadFromCache,
  reconcileCollectionWithCache,
  recordDeletedId,
  enqueueOfflineAction,
  getStoredSessionToken,
  saveCachedRouteToPhone,
  loadCachedRouteFromPhone,
  saveCachedWeatherToPhone,
  loadCachedWeatherFromPhone,
  saveCachedPlacesToPhone,
  loadCachedPlacesFromPhone
} from '../utils/telemetryCache';
import { AutoPilotRouteMap } from './AutoPilotRouteMap';

interface AutoPilotPlannerProps {
  stations: EligibleChargerRecord[];
  allStationsForValidation: EligibleChargerRecord[];
  chargerReports: ChargerCommunityReport[];
  currentUserId: string;
  currentUserName: string;
  onReportSubmitted: (updatedReports: ChargerCommunityReport[]) => void;
}

interface CorridorWeatherState {
  loading: boolean;
  available: boolean;
  originWeather?: {
    temperatureC: number;
    windSpeedKmh: number;
    precipitationMm: number;
    condition: string;
  };
  destinationWeather?: {
    temperatureC: number;
    windSpeedKmh: number;
    precipitationMm: number;
    condition: string;
  };
  note?: string;
}

const DEFAULT_START: RouteCoordinate = {
  name: 'Ultraviolette Hangar Indiranagar',
  locality: 'Indiranagar, Bengaluru',
  address: '529, 100 Feet Rd, Indiranagar, Bengaluru, Karnataka 560038',
  latitude: 12.9719,
  longitude: 77.6412
};

const DEFAULT_DESTINATION: RouteCoordinate = {
  name: 'Marina Beach Corridor, Chennai',
  locality: 'Triplicane, Chennai',
  address: 'Kamarajar Salai, Marina Beach, Chennai, Tamil Nadu 600005',
  latitude: 13.05,
  longitude: 80.2824
};

const QUICK_CORRIDOR_PRESETS: {
  id: string;
  label: string;
  subtitle: string;
  start: RouteCoordinate;
  destination: RouteCoordinate;
}[] = [
  {
    id: 'blr_chn',
    label: 'Bengaluru → Chennai (345 km)',
    subtitle: 'Multi-stop NH 75 / NH 48 corridor via Kolar, Mulbagal, Vellore & Sriperumbudur',
    start: DEFAULT_START,
    destination: DEFAULT_DESTINATION
  },
  {
    id: 'blr_mys',
    label: 'Bengaluru → Mysuru Palace (146 km)',
    subtitle: 'NH 275 Expressway sortie via Channapatna Supernova & Maddur',
    start: DEFAULT_START,
    destination: {
      name: 'Mysuru Palace Main Gate',
      locality: 'Agrahara, Mysuru',
      address: 'Sayyaji Rao Rd, Agrahara, Chamrajpura, Mysuru, Karnataka 570001',
      latitude: 12.3051,
      longitude: 76.6551
    }
  },
  {
    id: 'blr_kolar',
    label: 'Bengaluru → Kolar CCD (68 km)',
    subtitle: 'Short breakfast run — reachable without intermediate charging stops',
    start: DEFAULT_START,
    destination: {
      name: 'Café Coffee Day — Kolar NH75 Highway',
      locality: 'Tamaka, Kolar',
      address: 'NH 75 Bengaluru-Tirupati Highway, Tamaka, Kolar, Karnataka 563103',
      latitude: 13.1328,
      longitude: 78.1715
    }
  }
];

const SQUADRON_ROSTER = [
  { id: 'u_pilot07', name: 'Vikram Sengupta (Apex)' },
  { id: 'u_phantom', name: 'Devika Nair (Phantom)' },
  { id: 'u_admin', name: 'Abinav Thejas (Vanguard)' }
];

function formatDuration(minutes: number | null): string {
  if (minutes === null || !isFinite(minutes) || minutes <= 0) return 'N/A';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs === 0) return `${mins} min`;
  return `${hrs}h ${mins}m`;
}

export const AutoPilotPlanner: React.FC<AutoPilotPlannerProps> = ({
  stations,
  allStationsForValidation,
  chargerReports,
  currentUserId,
  currentUserName,
  onReportSubmitted
}) => {
  // 1. Start & Destination State
  const [startLocation, setStartLocation] = useState<RouteCoordinate | null>(DEFAULT_START);
  const [destination, setDestination] = useState<RouteCoordinate | null>(DEFAULT_DESTINATION);

  const [startSearchText, setStartSearchText] = useState(DEFAULT_START.name);
  const [destSearchText, setDestSearchText] = useState(DEFAULT_DESTINATION.name);

  const [startSuggestions, setStartSuggestions] = useState<PlaceSuggestion[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<PlaceSuggestion[]>([]);
  const [startLoading, setStartLoading] = useState(false);
  const [destLoading, setDestLoading] = useState(false);
  const [startSearchError, setStartSearchError] = useState<string | null>(null);
  const [destSearchError, setDestSearchError] = useState<string | null>(null);
  const [startSearchRetryCount, setStartSearchRetryCount] = useState(0);
  const [destSearchRetryCount, setDestSearchRetryCount] = useState(0);
  const [showStartDropdown, setShowStartDropdown] = useState(false);
  const [showDestDropdown, setShowDestDropdown] = useState(false);
  const [startHighlightIdx, setStartHighlightIdx] = useState(-1);
  const [destHighlightIdx, setDestHighlightIdx] = useState(-1);

  // Manual Coordinate Entry & Map Picking State for Start and Destination
  const [showStartManualCoords, setShowStartManualCoords] = useState(false);
  const [startManualLat, setStartManualLat] = useState('');
  const [startManualLon, setStartManualLon] = useState('');
  const [startLatError, setStartLatError] = useState<string | undefined>(undefined);
  const [startLonError, setStartLonError] = useState<string | undefined>(undefined);
  const [startResolvingCoords, setStartResolvingCoords] = useState(false);

  const [showDestManualCoords, setShowDestManualCoords] = useState(false);
  const [destManualLat, setDestManualLat] = useState('');
  const [destManualLon, setDestManualLon] = useState('');
  const [destLatError, setDestLatError] = useState<string | undefined>(undefined);
  const [destLonError, setDestLonError] = useState<string | undefined>(undefined);
  const [destResolvingCoords, setDestResolvingCoords] = useState(false);

  const [mapPickMode, setMapPickMode] = useState<'start' | 'dest' | null>(null);

  const startSearchReqIdRef = useRef(0);
  const destSearchReqIdRef = useRef(0);

  const [gpsOrigin, setGpsOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsStatusMsg, setGpsStatusMsg] = useState<string | null>(null);
  const [gpsLocating, setGpsLocating] = useState(false);

  // 2. Planning Parameters & Customizations
  const [targetIntervalKm, setTargetIntervalKm] = useState<number>(100);
  const [preferredChargerTypes, setPreferredChargerTypes] = useState<ChargerPlugType[]>([]);
  const [manualAddedIds, setManualAddedIds] = useState<string[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [replacedStopMap, setReplacedStopMap] = useState<Record<string, string>>({});
  const [reachedStopIds, setReachedStopIds] = useState<Record<string, string>>({});
  const [confirmedChargedIds, setConfirmedChargedIds] = useState<Record<string, string>>({});
  const [selectedPitStops, setSelectedPitStops] = useState<PlannedPitStop[]>([]);
  const [previousPlannedStationIds, setPreviousPlannedStationIds] = useState<string[]>([]);

  // 3. Range Guard Optional Configuration
  const [rangeGuard, setRangeGuard] = useState<RangeGuardConfig>({
    enabled: false,
    startingBatteryPercent: 90,
    estimatedUsableRangeKm: 165,
    reserveRangeKm: 25
  });

  // 4. OSRM Driving Route Geometry & Weather State
  const [routePolyline, setRoutePolyline] = useState<[number, number][]>([]);
  const [roadDistanceKm, setRoadDistanceKm] = useState<number | null>(null);
  const [roadDurationMin, setRoadDurationMin] = useState<number | null>(null);
  const [routingAvailable, setRoutingAvailable] = useState<boolean>(true);
  const [routingLimitationNote, setRoutingLimitationNote] = useState<string | undefined>(undefined);
  const [routeLoading, setRouteLoading] = useState<boolean>(false);

  const [weather, setWeather] = useState<CorridorWeatherState>({
    loading: false,
    available: false
  });

  // 5. UI Selection, Community Report Drawer & Pit Stop Discovery
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [reportingChargerId, setReportingChargerId] = useState<string | null>(null);
  const [reportCategory, setReportCategory] = useState<ChargerReportCategory>('WORKING');
  const [reportComment, setReportComment] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);

  const [pitStopCategoryFilter, setPitStopCategoryFilter] = useState<string>('ALL');
  const [manualCorridorChargerToAdd, setManualCorridorChargerToAdd] = useState<string>('');

  // 6. Saved Auto Pilot Missions & Sharing State
  const [savedMissions, setSavedMissions] = useState<AutoPilotMissionRecord[]>(() =>
    loadFromCache<AutoPilotMissionRecord[]>(CACHE_KEYS.AUTOPILOT_MISSIONS, [])
  );
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
  const [missionNameInput, setMissionNameInput] = useState<string>(
    'OPERATION COROMANDEL: BENGALURU → CHENNAI'
  );
  const [departureDateTime, setDepartureDateTime] = useState<string>('2026-10-25T06:00');
  const [riderNotes, setRiderNotes] = useState<string>(
    'Maintain Glide/Combat mode on highway stretches. Verify 15A earthing adapter in tail pack.'
  );
  const [missionStatus, setMissionStatus] = useState<'Planned' | 'In Progress' | 'Completed'>('Planned');
  const [isFavourite, setIsFavourite] = useState<boolean>(false);
  const [shareEnabled, setShareEnabled] = useState<boolean>(false);
  const [sharedWithUserIds, setSharedWithUserIds] = useState<string[]>(['u_pilot07']);
  const [includeMeetingPoint, setIncludeMeetingPoint] = useState<boolean>(true);
  const [meetingPointName, setMeetingPointName] = useState<string>('Hoskote Toll Plaza (06:15 AM)');
  const [includeDepartureTime, setIncludeDepartureTime] = useState<boolean>(true);
  const [includeGroupNotes, setIncludeGroupNotes] = useState<boolean>(true);
  const [groupNotes, setGroupNotes] = useState<string>('Intercom Channel 2. Regroup at each Supernova stop.');
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [savingMission, setSavingMission] = useState<boolean>(false);

  const startContainerRef = useRef<HTMLDivElement | null>(null);
  const destContainerRef = useRef<HTMLDivElement | null>(null);

  // Close autocomplete dropdowns on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (startContainerRef.current && !startContainerRef.current.contains(e.target as Node)) {
        setShowStartDropdown(false);
      }
      if (destContainerRef.current && !destContainerRef.current.contains(e.target as Node)) {
        setShowDestDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Fetch saved missions on mount
  const fetchSavedMissions = useCallback(async () => {
    const token = getStoredSessionToken();
    if (!token) {
      const cached = loadFromCache<AutoPilotMissionRecord[]>(CACHE_KEYS.AUTOPILOT_MISSIONS, []);
      if (cached.length > 0) setSavedMissions(cached);
      return;
    }
    try {
      const res = await fetch(`/api/autopilot/missions?userId=${encodeURIComponent(currentUserId)}`, {
        headers: {
          'x-user-id': currentUserId,
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.missions)) {
          const merged = reconcileCollectionWithCache<AutoPilotMissionRecord>(
            CACHE_KEYS.AUTOPILOT_MISSIONS,
            data.missions
          );
          setSavedMissions(merged);
        }
      }
    } catch {
      const cached = loadFromCache<AutoPilotMissionRecord[]>(CACHE_KEYS.AUTOPILOT_MISSIONS, []);
      if (cached.length > 0) setSavedMissions(cached);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchSavedMissions();
  }, [fetchSavedMissions]);

  // Debounced place search for Start Location with stale-response prevention & offline phone storage fallback
  useEffect(() => {
    const q = startSearchText.trim();
    if (!showStartDropdown || q.length < 2) {
      setStartSuggestions([]);
      setStartLoading(false);
      setStartSearchError(null);
      return;
    }

    const reqId = ++startSearchReqIdRef.current;
    const abortController = new AbortController();

    const cachedPhonePlaces = loadCachedPlacesFromPhone();
    const localMatches = searchAndRankPlaces(q, cachedPhonePlaces, gpsOrigin).slice(0, 6);
    setStartSuggestions(localMatches);
    setStartHighlightIdx(localMatches.length > 0 ? 0 : -1);
    setStartSearchError(null);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStartLoading(false);
      return;
    }

    setStartLoading(true);

    const timer = setTimeout(async () => {
      try {
        const biasParams = gpsOrigin
          ? `&lat=${gpsOrigin.latitude.toFixed(4)}&lon=${gpsOrigin.longitude.toFixed(4)}`
          : '';
        const res = await fetch(
          `/api/places/search?q=${encodeURIComponent(q)}${biasParams}`,
          { signal: abortController.signal }
        );
        if (reqId !== startSearchReqIdRef.current) return;

        if (!res.ok) {
          if (localMatches.length === 0) {
            const errBody = await res.json().catch(() => ({}));
            setStartSearchError(
              errBody.error ||
                (res.status === 429
                  ? 'Location search rate limit reached. Please wait a moment and click Retry.'
                  : 'Location search network error. Showing available matches or click Retry.')
            );
          }
          return;
        }

        const data = await res.json();
        if (reqId !== startSearchReqIdRef.current) return;

        if (Array.isArray(data.suggestions)) {
          saveCachedPlacesToPhone(data.suggestions);
          setStartSuggestions(data.suggestions);
          setStartHighlightIdx(data.suggestions.length > 0 ? 0 : -1);
        }
        if (data.providerError && (!Array.isArray(data.suggestions) || data.suggestions.length === 0)) {
          setStartSearchError(data.providerError);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || reqId !== startSearchReqIdRef.current) return;
        if (localMatches.length === 0) {
          setStartSearchError(
            'Unable to reach location search service. Check your connection or click Retry.'
          );
        }
      } finally {
        if (reqId === startSearchReqIdRef.current) {
          setStartLoading(false);
        }
      }
    }, 240);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [startSearchText, showStartDropdown, gpsOrigin, startSearchRetryCount]);

  // Debounced place search for Destination with stale-response prevention & offline phone storage fallback
  useEffect(() => {
    const q = destSearchText.trim();
    if (!showDestDropdown || q.length < 2) {
      setDestSuggestions([]);
      setDestLoading(false);
      setDestSearchError(null);
      return;
    }

    const reqId = ++destSearchReqIdRef.current;
    const abortController = new AbortController();

    const cachedPhonePlaces = loadCachedPlacesFromPhone();
    const localMatches = searchAndRankPlaces(q, cachedPhonePlaces, gpsOrigin).slice(0, 6);
    setDestSuggestions(localMatches);
    setDestHighlightIdx(localMatches.length > 0 ? 0 : -1);
    setDestSearchError(null);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setDestLoading(false);
      return;
    }

    setDestLoading(true);

    const timer = setTimeout(async () => {
      try {
        const biasParams = gpsOrigin
          ? `&lat=${gpsOrigin.latitude.toFixed(4)}&lon=${gpsOrigin.longitude.toFixed(4)}`
          : '';
        const res = await fetch(
          `/api/places/search?q=${encodeURIComponent(q)}${biasParams}`,
          { signal: abortController.signal }
        );
        if (reqId !== destSearchReqIdRef.current) return;

        if (!res.ok) {
          if (localMatches.length === 0) {
            const errBody = await res.json().catch(() => ({}));
            setDestSearchError(
              errBody.error ||
                (res.status === 429
                  ? 'Location search rate limit reached. Please wait a moment and click Retry.'
                  : 'Location search network error. Showing available matches or click Retry.')
            );
          }
          return;
        }

        const data = await res.json();
        if (reqId !== destSearchReqIdRef.current) return;

        if (Array.isArray(data.suggestions)) {
          saveCachedPlacesToPhone(data.suggestions);
          setDestSuggestions(data.suggestions);
          setDestHighlightIdx(data.suggestions.length > 0 ? 0 : -1);
        }
        if (data.providerError && (!Array.isArray(data.suggestions) || data.suggestions.length === 0)) {
          setDestSearchError(data.providerError);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || reqId !== destSearchReqIdRef.current) return;
        if (localMatches.length === 0) {
          setDestSearchError(
            'Unable to reach location search service. Check your connection or click Retry.'
          );
        }
      } finally {
        if (reqId === destSearchReqIdRef.current) {
          setDestLoading(false);
        }
      }
    }, 240);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [destSearchText, showDestDropdown, gpsOrigin, destSearchRetryCount]);

  // Fetch OSRM driving route and Open-Meteo weather whenever startLocation or destination changes,
  // with instant phone storage hydration and offline highway corridor geometry fallback
  useEffect(() => {
    if (!startLocation || !destination) return;

    let cancelled = false;
    const sLat = startLocation.latitude;
    const sLon = startLocation.longitude;
    const dLat = destination.latitude;
    const dLon = destination.longitude;

    // 1. Immediately hydrate from phone storage if this corridor was previously cached
    const cachedRoute = loadCachedRouteFromPhone(sLat, sLon, dLat, dLon);
    if (cachedRoute && Array.isArray(cachedRoute.polyline) && cachedRoute.polyline.length >= 2) {
      setRoutePolyline(cachedRoute.polyline);
      setRoadDistanceKm(cachedRoute.distanceKm);
      setRoadDurationMin(cachedRoute.durationMin);
      setRoutingAvailable(cachedRoute.routingAvailable);
      setRoutingLimitationNote(cachedRoute.routingLimitationNote);
    }

    const cachedWeather = loadCachedWeatherFromPhone(sLat, sLon, dLat, dLon);
    if (cachedWeather && cachedWeather.available) {
      setWeather({
        loading: false,
        available: true,
        originWeather: cachedWeather.originWeather,
        destinationWeather: cachedWeather.destinationWeather,
        note: cachedWeather.note
      });
    }

    const applyOfflineFallbackRoute = () => {
      if (cachedRoute && Array.isArray(cachedRoute.polyline) && cachedRoute.polyline.length >= 2) {
        setRoutePolyline(cachedRoute.polyline);
        setRoadDistanceKm(cachedRoute.distanceKm);
        setRoadDurationMin(cachedRoute.durationMin);
        setRoutingAvailable(true);
        setRoutingLimitationNote('Loaded cached corridor route from phone storage (Offline Mode).');
        return;
      }
      const generated = generateOfflineCorridorGeometry(
        startLocation,
        destination,
        allStationsForValidation.length > 0 ? allStationsForValidation : stations
      );
      setRoutePolyline(generated.polyline);
      setRoadDistanceKm(generated.distanceKm);
      setRoadDurationMin(generated.durationMin);
      setRoutingAvailable(true);
      setRoutingLimitationNote(
        'Offline highway corridor geometry active (calculated from phone storage).'
      );
      saveCachedRouteToPhone(sLat, sLon, dLat, dLon, {
        polyline: generated.polyline,
        distanceKm: generated.distanceKm,
        durationMin: generated.durationMin,
        routingAvailable: true,
        routingLimitationNote: 'Offline highway corridor geometry cached on phone.'
      });
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      applyOfflineFallbackRoute();
      setRouteLoading(false);
      return;
    }

    setRouteLoading(!cachedRoute);

    async function loadRouteAndWeather() {
      try {
        const routeRes = await fetch('/api/autopilot/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: [
              { latitude: sLat, longitude: sLon },
              { latitude: dLat, longitude: dLon }
            ]
          })
        });

        if (!cancelled && routeRes.ok) {
          const rData = await routeRes.json();
          const avail = Boolean(rData.routingAvailable);
          const dist = typeof rData.distanceKm === 'number' ? rData.distanceKm : null;
          const dur = typeof rData.durationMin === 'number' ? rData.durationMin : null;
          const poly: [number, number][] =
            Array.isArray(rData.polyline) && rData.polyline.length >= 2
              ? rData.polyline
              : [
                  [sLat, sLon],
                  [dLat, dLon]
                ];
          setRoutingAvailable(avail);
          setRoutingLimitationNote(rData.routingLimitationNote);
          setRoadDistanceKm(dist);
          setRoadDurationMin(dur);
          setRoutePolyline(poly);

          saveCachedRouteToPhone(sLat, sLon, dLat, dLon, {
            polyline: poly,
            distanceKm: dist,
            durationMin: dur,
            routingAvailable: avail,
            routingLimitationNote: rData.routingLimitationNote
          });
        } else if (!cancelled) {
          applyOfflineFallbackRoute();
        }
      } catch {
        if (!cancelled) {
          applyOfflineFallbackRoute();
        }
      } finally {
        if (!cancelled) setRouteLoading(false);
      }

      // Fetch real weather at origin & destination (or keep cached phone weather)
      if (!cachedWeather) {
        setWeather({ loading: true, available: false });
      }
      try {
        const wRes = await fetch(
          `/api/autopilot/weather?startLat=${sLat}&startLon=${sLon}&destLat=${dLat}&destLon=${dLon}`
        );
        if (!cancelled && wRes.ok) {
          const wData = await wRes.json();
          const nextWeather = {
            loading: false,
            available: Boolean(wData.available),
            originWeather: wData.originWeather,
            destinationWeather: wData.destinationWeather,
            note: wData.note
          };
          setWeather(nextWeather);
          if (wData.available) {
            saveCachedWeatherToPhone(sLat, sLon, dLat, dLon, nextWeather);
          }
        } else if (!cancelled && !cachedWeather) {
          setWeather({ loading: false, available: false });
        }
      } catch {
        if (!cancelled && !cachedWeather) {
          setWeather({ loading: false, available: false });
        }
      }
    }

    loadRouteAndWeather();
    return () => {
      cancelled = true;
    };
  }, [
    startLocation?.latitude,
    startLocation?.longitude,
    destination?.latitude,
    destination?.longitude
  ]);

  // Compute complete Auto Pilot plan deterministically via pure engine
  const planResult = useMemo(() => {
    if (!startLocation || !destination) return null;
    return planAutoPilotMission({
      startLocation,
      destination,
      routePolyline,
      roadDistanceKm,
      roadDurationMin,
      routingAvailable,
      routingLimitationNote,
      allStations: allStationsForValidation.length > 0 ? allStationsForValidation : stations,
      reports: chargerReports,
      targetIntervalKm,
      preferredChargerTypes,
      manualAddedStationIds: manualAddedIds,
      removedStationIds: removedIds,
      replacedStopMap,
      reachedStopIds,
      confirmedChargedIds,
      pitStops: selectedPitStops,
      rangeGuard,
      previousPlannedStationIds
    });
  }, [
    startLocation,
    destination,
    routePolyline,
    roadDistanceKm,
    roadDurationMin,
    routingAvailable,
    routingLimitationNote,
    allStationsForValidation,
    stations,
    chargerReports,
    targetIntervalKm,
    preferredChargerTypes,
    manualAddedIds,
    removedIds,
    replacedStopMap,
    reachedStopIds,
    confirmedChargedIds,
    selectedPitStops,
    rangeGuard,
    previousPlannedStationIds
  ]);

  // Discover real corridor pit stops along the current route
  const availableCorridorPitStops = useMemo(() => {
    if (!planResult || !planResult.valid) return [];
    const effPoly: [number, number][] =
      routePolyline.length >= 2
        ? routePolyline
        : startLocation && destination
        ? [
            [startLocation.latitude, startLocation.longitude],
            [destination.latitude, destination.longitude]
          ]
        : [];
    return discoverCorridorPitStops(
      effPoly,
      planResult.briefing.baseDirectDrivingDistanceKm,
      pitStopCategoryFilter
    );
  }, [planResult, routePolyline, startLocation, destination, pitStopCategoryFilter]);

  // Next unreached charger navigation resolution
  const nextChargerNav = useMemo(() => {
    if (!startLocation || !planResult) return null;
    return resolveNextChargerNavigation(startLocation, planResult.chargingStops, gpsOrigin);
  }, [startLocation, planResult, gpsOrigin]);

  // Handlers
  const handleSelectStartPlace = (p: PlaceSuggestion) => {
    setStartLocation({
      name: p.name,
      locality: p.locality,
      address: p.address,
      latitude: p.latitude,
      longitude: p.longitude,
      source: p.source
    });
    setStartSearchText(p.name);
    setStartManualLat(String(p.latitude));
    setStartManualLon(String(p.longitude));
    setStartLatError(undefined);
    setStartLonError(undefined);
    setShowStartDropdown(false);
    setStartHighlightIdx(-1);
  };

  const handleSelectDestPlace = (p: PlaceSuggestion) => {
    setDestination({
      name: p.name,
      locality: p.locality,
      address: p.address,
      latitude: p.latitude,
      longitude: p.longitude,
      source: p.source
    });
    setDestSearchText(p.name);
    setDestManualLat(String(p.latitude));
    setDestManualLon(String(p.longitude));
    setDestLatError(undefined);
    setDestLonError(undefined);
    setShowDestDropdown(false);
    setDestHighlightIdx(-1);
  };

  const handleConfirmManualCoordinates = async (target: 'start' | 'dest') => {
    const isStart = target === 'start';
    const rawLat = isStart ? startManualLat : destManualLat;
    const rawLon = isStart ? startManualLon : destManualLon;

    const validation = validateManualCoordinates(rawLat, rawLon);
    if (!validation.valid || validation.latitude === undefined || validation.longitude === undefined) {
      if (isStart) {
        setStartLatError(validation.latError);
        setStartLonError(validation.lonError);
      } else {
        setDestLatError(validation.latError);
        setDestLonError(validation.lonError);
      }
      return;
    }

    const lat = validation.latitude;
    const lon = validation.longitude;
    const fallback = formatManualCoordinatesFallback(lat, lon);

    if (isStart) {
      setStartLatError(undefined);
      setStartLonError(undefined);
      setStartResolvingCoords(true);
    } else {
      setDestLatError(undefined);
      setDestLonError(undefined);
      setDestResolvingCoords(true);
    }

    let resolvedLoc: RouteCoordinate = {
      name: fallback.name,
      locality: fallback.locality,
      address: fallback.address,
      latitude: lat,
      longitude: lon,
      source: 'manual-coordinates'
    };

    try {
      const res = await fetch(`/api/places/reverse?lat=${lat}&lon=${lon}`);
      if (res.ok) {
        const rev = await res.json();
        if (rev && rev.reverseGeocodeSuccess !== false && rev.name) {
          resolvedLoc = {
            name: rev.name,
            locality: rev.locality || fallback.locality,
            address: rev.address || fallback.address,
            latitude: lat,
            longitude: lon,
            source: 'manual-coordinates'
          };
        }
      }
    } catch {
      // Preserve valid coordinates with manual fallback label when reverse geocoding fails
    } finally {
      if (isStart) {
        setStartLocation(resolvedLoc);
        setStartSearchText(resolvedLoc.name);
        setStartResolvingCoords(false);
        setShowStartDropdown(false);
      } else {
        setDestination(resolvedLoc);
        setDestSearchText(resolvedLoc.name);
        setDestResolvingCoords(false);
        setShowDestDropdown(false);
      }
    }
  };

  const handleConfirmMapLocation = (target: 'start' | 'dest', loc: RouteCoordinate) => {
    if (target === 'start') {
      setStartLocation(loc);
      setStartSearchText(loc.name);
      setStartManualLat(String(loc.latitude));
      setStartManualLon(String(loc.longitude));
      setStartLatError(undefined);
      setStartLonError(undefined);
      setShowStartDropdown(false);
    } else {
      setDestination(loc);
      setDestSearchText(loc.name);
      setDestManualLat(String(loc.latitude));
      setDestManualLon(String(loc.longitude));
      setDestLatError(undefined);
      setDestLonError(undefined);
      setShowDestDropdown(false);
    }
  };

  const handleSwapEndpoints = () => {
    if (!startLocation || !destination) return;
    const prevStart = startLocation;
    const prevDest = destination;
    setStartLocation(prevDest);
    setDestination(prevStart);
    setStartSearchText(prevDest.name);
    setDestSearchText(prevStart.name);
    setStartManualLat(String(prevDest.latitude));
    setStartManualLon(String(prevDest.longitude));
    setDestManualLat(String(prevStart.latitude));
    setDestManualLon(String(prevStart.longitude));
    setManualAddedIds([]);
    setRemovedIds([]);
    setReplacedStopMap({});
    setReachedStopIds({});
    setConfirmedChargedIds({});
  };

  const handleUseCurrentLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatusMsg(
        'Browser geolocation is not supported in this environment. Use the location search box above.'
      );
      return;
    }
    setGpsLocating(true);
    setGpsStatusMsg('Acquiring satellite GPS lock...');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lon = Number(pos.coords.longitude.toFixed(6));
        setGpsOrigin({ latitude: lat, longitude: lon });
        try {
          const res = await fetch(`/api/places/reverse?lat=${lat}&lon=${lon}`);
          if (res.ok) {
            const rev = await res.json();
            const loc: RouteCoordinate = {
              name: rev.name || 'Current GPS Position',
              locality: rev.locality || '',
              address: rev.address || `${lat}°N, ${lon}°E`,
              latitude: lat,
              longitude: lon
            };
            setStartLocation(loc);
            setStartSearchText(loc.name);
            setGpsStatusMsg(`GPS lock acquired: ${loc.name} (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`);
          }
        } catch {
          const loc: RouteCoordinate = {
            name: 'Current Rider GPS Position',
            address: `${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E`,
            latitude: lat,
            longitude: lon
          };
          setStartLocation(loc);
          setStartSearchText(loc.name);
          setGpsStatusMsg(`GPS lock acquired (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`);
        } finally {
          setGpsLocating(false);
        }
      },
      () => {
        setGpsLocating(false);
        setGpsStatusMsg(
          'Location permission denied or unavailable. Please search and select your starting location manually.'
        );
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  const handleApplyPreset = (preset: (typeof QUICK_CORRIDOR_PRESETS)[number]) => {
    setStartLocation(preset.start);
    setDestination(preset.destination);
    setStartSearchText(preset.start.name);
    setDestSearchText(preset.destination.name);
    setMissionNameInput(`AUTO PILOT: ${preset.label.toUpperCase()}`);
    setManualAddedIds([]);
    setRemovedIds([]);
    setReplacedStopMap({});
    setReachedStopIds({});
    setConfirmedChargedIds({});
    setSelectedPitStops([]);
    setPreviousPlannedStationIds([]);
    setActiveMissionId(null);
  };

  const handleTogglePlugPreference = (plug: ChargerPlugType) => {
    setPreferredChargerTypes(prev =>
      prev.includes(plug) ? prev.filter(p => p !== plug) : [...prev, plug]
    );
  };

  const handleToggleReached = (stationId: string) => {
    setReachedStopIds(prev => {
      const next = { ...prev };
      if (next[stationId]) {
        delete next[stationId];
      } else {
        next[stationId] = new Date().toISOString();
      }
      return next;
    });
  };

  const handleToggleCharged = (stationId: string) => {
    setConfirmedChargedIds(prev => {
      const next = { ...prev };
      if (next[stationId]) {
        delete next[stationId];
      } else {
        next[stationId] = new Date().toISOString();
        // Confirming charge also implies the rider reached the stop
        setReachedStopIds(rPrev => ({
          ...rPrev,
          [stationId]: rPrev[stationId] || new Date().toISOString()
        }));
      }
      return next;
    });
  };

  const handleRemoveStop = (stationId: string) => {
    setRemovedIds(prev => (prev.includes(stationId) ? prev : [...prev, stationId]));
    setManualAddedIds(prev => prev.filter(id => id !== stationId));
  };

  const handleAddManualStop = (stationId: string) => {
    if (!stationId) return;
    setRemovedIds(prev => prev.filter(id => id !== stationId));
    setManualAddedIds(prev => (prev.includes(stationId) ? prev : [...prev, stationId]));
    setManualCorridorChargerToAdd('');
  };

  const handleReplaceWithBackup = (primaryId: string, backupId: string) => {
    setRemovedIds(prev => prev.filter(id => id !== backupId));
    setReplacedStopMap(prev => ({
      ...prev,
      [primaryId]: backupId
    }));
  };

  const handleResetAutomaticStops = () => {
    setManualAddedIds([]);
    setRemovedIds([]);
    setReplacedStopMap({});
  };

  const handleAddPitStop = (pit: PlannedPitStop) => {
    setSelectedPitStops(prev =>
      prev.some(p => p.id === pit.id) ? prev : [...prev, { ...pit, includedInNavigation: true }]
    );
  };

  const handleRemovePitStop = (pitId: string) => {
    setSelectedPitStops(prev => prev.filter(p => p.id !== pitId));
  };

  const handleTogglePitStopNav = (pitId: string) => {
    setSelectedPitStops(prev =>
      prev.map(p =>
        p.id === pitId ? { ...p, includedInNavigation: !p.includedInNavigation } : p
      )
    );
  };

  const handleSubmitChargerReport = async (chargerId: string) => {
    setSubmittingReport(true);
    setReportFeedback(null);
    const reportBody = {
      category: reportCategory,
      comment: reportComment.trim(),
      userId: currentUserId,
      reporterCallsign: currentUserName
    };
    const endpoint = `/api/charging/${encodeURIComponent(chargerId)}/reports`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUserId
        },
        body: JSON.stringify(reportBody)
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.chargerReports)) {
          onReportSubmitted(data.chargerReports);
          saveToCache(CACHE_KEYS.CHARGER_REPORTS, data.chargerReports);
        }
        setReportComment('');
        setReportFeedback('Community charger report logged and intelligence updated.');
        setTimeout(() => {
          setReportingChargerId(null);
          setReportFeedback(null);
        }, 1200);
      } else {
        throw new Error('Offline or server error');
      }
    } catch {
      const clientReqId = `crep_ap_${Date.now()}`;
      enqueueOfflineAction(
        endpoint,
        'POST',
        { ...reportBody, clientRequestId: clientReqId },
        'Auto Pilot Charger Status Report',
        clientReqId
      );
      const localReport: ChargerCommunityReport = {
        id: `crep_local_${Date.now()}`,
        chargerId,
        userId: currentUserId,
        reporterCallsign: currentUserName,
        category: reportCategory,
        comment: reportComment.trim(),
        createdAt: new Date().toISOString(),
        sourceLabel: 'Community Report'
      };
      const nextReports = [localReport, ...chargerReports];
      onReportSubmitted(nextReports);
      saveToCache(CACHE_KEYS.CHARGER_REPORTS, nextReports);
      setReportComment('');
      setReportFeedback(
        'Saved charger report to phone storage — will sync automatically when online.'
      );
      setTimeout(() => {
        setReportingChargerId(null);
        setReportFeedback(null);
      }, 1600);
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleSaveMission = async () => {
    if (!startLocation || !destination || !planResult || !planResult.valid) return;
    setSavingMission(true);
    setSaveFeedback(null);

    const payload = {
      userId: currentUserId,
      ownerName: currentUserName,
      missionName:
        missionNameInput.trim() || `${startLocation.name} → ${destination.name}`,
      departureDateTime: departureDateTime || undefined,
      startLocation,
      destination,
      targetIntervalKm,
      preferredChargerTypes,
      rangeGuard,
      plannedRouteDistanceKm: planResult.briefing.totalDrivingDistanceKm,
      estimatedDrivingDurationMin: planResult.briefing.estimatedDrivingDurationMin,
      routingSource: planResult.briefing.routingSource,
      chargingStops: planResult.chargingStops.map(cs => ({
        stationId: cs.station.id,
        stationName: cs.station.name,
        stationLocation: cs.station.location,
        chargerType: cs.station.chargerType,
        powerOutputKw: cs.station.powerOutputKw,
        latitude: cs.station.latitude,
        longitude: cs.station.longitude,
        order: cs.order,
        distanceFromStartKm: cs.distanceFromStartKm,
        distanceFromPrevStopKm: cs.distanceFromPrevStopKm,
        detourDistanceKm: cs.detourDistanceKm,
        reached: cs.reached,
        reachedAt: cs.reachedAt,
        chargingConfirmed: cs.chargingConfirmed,
        chargingConfirmedAt: cs.chargingConfirmedAt
      })),
      pitStops: planResult.pitStops,
      status: missionStatus,
      riderNotes: riderNotes.trim(),
      isFavourite,
      shareSettings: {
        isShared: shareEnabled,
        sharedWithUserIds: shareEnabled ? sharedWithUserIds : [],
        includeMeetingPoint,
        meetingPointName: includeMeetingPoint ? meetingPointName.trim() : undefined,
        includeDepartureTime,
        includeGroupNotes,
        groupNotes: includeGroupNotes ? groupNotes.trim() : undefined
      }
    };

    try {
      const isUpdatingExisting =
        activeMissionId &&
        savedMissions.some(m => m.id === activeMissionId && m.userId === currentUserId);
      const url = isUpdatingExisting
        ? `/api/autopilot/missions/${encodeURIComponent(activeMissionId!)}`
        : '/api/autopilot/missions';
      const method = isUpdatingExisting ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUserId
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.mission) {
          setActiveMissionId(data.mission.id);
          const nextMissions = isUpdatingExisting
            ? savedMissions.map(m => (m.id === data.mission.id ? data.mission : m))
            : [data.mission, ...savedMissions.filter(m => m.id !== data.mission.id)];
          setSavedMissions(nextMissions);
          saveToCache(CACHE_KEYS.AUTOPILOT_MISSIONS, nextMissions);
          setSaveFeedback(
            isUpdatingExisting
              ? 'Saved mission updated in your Auto Pilot flight log.'
              : 'Mission saved to your Auto Pilot flight log.'
          );
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setSaveFeedback(err.error || 'Unable to save mission.');
      }
    } catch {
      const isUpdatingExisting =
        activeMissionId &&
        savedMissions.some(m => m.id === activeMissionId && m.userId === currentUserId);
      const url = isUpdatingExisting
        ? `/api/autopilot/missions/${encodeURIComponent(activeMissionId!)}`
        : '/api/autopilot/missions';
      const method = isUpdatingExisting ? 'PUT' : 'POST';
      const clientRequestId = `apm_req_${Date.now()}`;
      enqueueOfflineAction(url, method, { ...payload, clientRequestId }, 'Auto Pilot Mission', clientRequestId);
      const localMission: any = {
        ...payload,
        id: activeMissionId || `apm_local_${Date.now()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pendingSync: true
      };
      const updated = isUpdatingExisting
        ? savedMissions.map(m => (m.id === activeMissionId ? localMission : m))
        : [localMission, ...savedMissions];
      setSavedMissions(updated);
      saveToCache(CACHE_KEYS.AUTOPILOT_MISSIONS, updated);
      setActiveMissionId(localMission.id);
      setSaveFeedback('Mission saved locally — pending sync when connection returns.');
    } finally {
      setSavingMission(false);
    }
  };

  const handleLoadSavedMission = (mission: AutoPilotMissionRecord) => {
    setActiveMissionId(mission.id);
    setStartLocation(mission.startLocation);
    setDestination(mission.destination);
    setStartSearchText(mission.startLocation.name);
    setDestSearchText(mission.destination.name);
    setTargetIntervalKm(mission.targetIntervalKm || 100);
    setPreferredChargerTypes(mission.preferredChargerTypes || []);
    setRangeGuard(mission.rangeGuard || { enabled: false });
    setMissionNameInput(mission.missionName);
    setDepartureDateTime(mission.departureDateTime || '');
    setRiderNotes(mission.riderNotes || '');
    setMissionStatus(mission.status || 'Planned');
    setIsFavourite(Boolean(mission.isFavourite));
    setSelectedPitStops(mission.pitStops || []);

    const savedIds = (mission.chargingStops || []).map(s => s.stationId);
    setPreviousPlannedStationIds(savedIds);
    setManualAddedIds(savedIds);
    setRemovedIds([]);
    setReplacedStopMap({});

    const nextReached: Record<string, string> = {};
    const nextCharged: Record<string, string> = {};
    for (const s of mission.chargingStops || []) {
      if (s.reached) nextReached[s.stationId] = s.reachedAt || new Date().toISOString();
      if (s.chargingConfirmed)
        nextCharged[s.stationId] = s.chargingConfirmedAt || new Date().toISOString();
    }
    setReachedStopIds(nextReached);
    setConfirmedChargedIds(nextCharged);

    if (mission.shareSettings) {
      setShareEnabled(Boolean(mission.shareSettings.isShared));
      setSharedWithUserIds(mission.shareSettings.sharedWithUserIds || []);
      setIncludeMeetingPoint(Boolean(mission.shareSettings.includeMeetingPoint));
      setMeetingPointName(mission.shareSettings.meetingPointName || '');
      setIncludeDepartureTime(Boolean(mission.shareSettings.includeDepartureTime));
      setIncludeGroupNotes(Boolean(mission.shareSettings.includeGroupNotes));
      setGroupNotes(mission.shareSettings.groupNotes || '');
    }
    setSaveFeedback(`Loaded mission "${mission.missionName}".`);
  };

  const handleDeleteSavedMission = async (missionId: string) => {
    recordDeletedId(missionId);
    const nextMissions = savedMissions.filter(m => m.id !== missionId);
    setSavedMissions(nextMissions);
    saveToCache(CACHE_KEYS.AUTOPILOT_MISSIONS, nextMissions);
    if (activeMissionId === missionId) setActiveMissionId(null);

    try {
      await fetch(
        `/api/autopilot/missions/${encodeURIComponent(missionId)}?userId=${encodeURIComponent(currentUserId)}`,
        {
          method: 'DELETE',
          headers: { 'x-user-id': currentUserId }
        }
      );
    } catch {
      // already deleted locally and recorded in tombstones
    }
  };

  const unselectedCorridorChargers = useMemo(() => {
    if (!planResult) return [];
    const selectedSet = new Set(planResult.chargingStops.map(s => s.station.id));
    return planResult.eligibleCorridorChargers.filter(c => !selectedSet.has(c.station.id));
  }, [planResult]);

  return (
    <div className="space-y-6">
      {/* ========================================================= */}
      {/* 1. ROUTE CONFIGURATION & LOCATION AUTOCOMPLETE DECK        */}
      {/* ========================================================= */}
      <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 mb-5 border-b border-slate-800/80">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-[#FF5500]/15 border border-[#FF5500]/40 text-[#FF5500] text-[10px] font-mono uppercase tracking-widest mb-1.5 font-bold">
              <Compass className="w-3.5 h-3.5" />
              GHOST PROTOCOL // AUTO PILOT FLIGHT DECK
            </div>
            <h3 className="text-xl sm:text-2xl font-display font-bold text-white uppercase tracking-wider">
              AUTO PILOT — Intelligent EV Motorcycle Corridor &amp; Charger Planner
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Plans optimal charging stops (~{targetIntervalKm} km target intervals), identifies corridor backup chargers, and generates 1-click Google Maps turn-by-turn navigation handoffs.
            </p>
          </div>

          {/* Quick Corridor Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mr-1">
              QUICK CORRIDORS:
            </span>
            {QUICK_CORRIDOR_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-[#FF5500]/50 text-[11px] font-mono text-slate-200 transition-colors"
                title={preset.subtitle}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Start & Destination Search Inputs */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Starting Location */}
          <div ref={startContainerRef} className="lg:col-span-5 relative">
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
              <label
                htmlFor="autopilot-start-input"
                className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1.5"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                STARTING LOCATION *
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="toggle-start-manual-coords-btn"
                  onClick={() => {
                    setShowStartManualCoords(prev => !prev);
                    setStartLatError(undefined);
                    setStartLonError(undefined);
                  }}
                  className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border transition-colors ${
                    showStartManualCoords
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-emerald-400/60 hover:text-emerald-300'
                  }`}
                >
                  {showStartManualCoords ? 'BACK TO PLACE SEARCH' : 'ENTER COORDINATES'}
                </button>
                <button
                  type="button"
                  data-testid="pick-start-on-map-btn"
                  onClick={() => setMapPickMode(prev => (prev === 'start' ? null : 'start'))}
                  className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border flex items-center gap-1 transition-colors ${
                    mapPickMode === 'start'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-emerald-400/60'
                  }`}
                >
                  <Crosshair className="w-3 h-3 text-emerald-400" />
                  <span>{mapPickMode === 'start' ? 'Picking on Map...' : 'Pick on Map'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={gpsLocating}
                  className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  {gpsLocating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <LocateFixed className="w-3 h-3" />
                  )}
                  Use My Current Location
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="autopilot-start-input"
                type="text"
                value={startSearchText}
                onFocus={() => setShowStartDropdown(true)}
                onChange={e => {
                  const val = e.target.value;
                  setStartSearchText(val);
                  if (!val.trim()) {
                    setStartLocation(null);
                  }
                  setShowStartDropdown(true);
                  setStartHighlightIdx(-1);
                }}
                onKeyDown={e => {
                  if (!showStartDropdown || startSuggestions.length === 0) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setStartHighlightIdx(prev => (prev + 1) % startSuggestions.length);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setStartHighlightIdx(prev =>
                      prev <= 0 ? startSuggestions.length - 1 : prev - 1
                    );
                  } else if (e.key === 'Enter' && startHighlightIdx >= 0) {
                    e.preventDefault();
                    handleSelectStartPlace(startSuggestions[startHighlightIdx]);
                  } else if (e.key === 'Escape') {
                    setShowStartDropdown(false);
                  }
                }}
                placeholder="Search city, town, village, landmark, cafe, hospital, or address..."
                className="w-full bg-slate-950 border border-slate-700/90 focus:border-emerald-500 rounded-lg pl-10 pr-9 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none"
              />
              {startSearchText && (
                <button
                  type="button"
                  aria-label="Clear Starting Location"
                  onClick={() => {
                    setStartSearchText('');
                    setStartLocation(null);
                    setShowStartDropdown(true);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Manual Coordinate Entry Panel for Starting Location */}
            {showStartManualCoords && (
              <div
                data-testid="start-manual-coords-panel"
                className="mt-2 p-3 rounded-lg bg-slate-900/95 border border-emerald-500/40 space-y-2.5"
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-emerald-300 uppercase">
                  <span>Manual Starting Coordinates (WGS84 Decimal)</span>
                  <button
                    type="button"
                    onClick={() => setShowStartManualCoords(false)}
                    className="text-slate-400 hover:text-white underline"
                  >
                    Switch to Place Search
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="autopilot-start-lat-input"
                      className="block text-[10px] font-mono text-slate-300 uppercase mb-1"
                    >
                      Latitude (-90 to +90) *
                    </label>
                    <input
                      id="autopilot-start-lat-input"
                      data-testid="autopilot-start-lat-input"
                      type="text"
                      inputMode="decimal"
                      value={startManualLat}
                      onChange={e => {
                        setStartManualLat(e.target.value);
                        if (startLatError) setStartLatError(undefined);
                      }}
                      placeholder="e.g. 12.9716"
                      className={`w-full bg-slate-950 border rounded px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none ${
                        startLatError
                          ? 'border-red-500 focus:border-red-400'
                          : 'border-slate-700 focus:border-emerald-400'
                      }`}
                    />
                    {startLatError && (
                      <p
                        role="alert"
                        data-testid="autopilot-start-lat-error"
                        className="text-[10px] font-mono text-red-400 mt-1"
                      >
                        {startLatError}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="autopilot-start-lon-input"
                      className="block text-[10px] font-mono text-slate-300 uppercase mb-1"
                    >
                      Longitude (-180 to +180) *
                    </label>
                    <input
                      id="autopilot-start-lon-input"
                      data-testid="autopilot-start-lon-input"
                      type="text"
                      inputMode="decimal"
                      value={startManualLon}
                      onChange={e => {
                        setStartManualLon(e.target.value);
                        if (startLonError) setStartLonError(undefined);
                      }}
                      placeholder="e.g. 77.5946"
                      className={`w-full bg-slate-950 border rounded px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none ${
                        startLonError
                          ? 'border-red-500 focus:border-red-400'
                          : 'border-slate-700 focus:border-emerald-400'
                      }`}
                    />
                    {startLonError && (
                      <p
                        role="alert"
                        data-testid="autopilot-start-lon-error"
                        className="text-[10px] font-mono text-red-400 mt-1"
                      >
                        {startLonError}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[10px] text-slate-400 font-mono">
                    Resolves address when available or uses exact coordinates directly.
                  </span>
                  <button
                    type="button"
                    data-testid="confirm-start-coords-btn"
                    disabled={startResolvingCoords}
                    onClick={() => handleConfirmManualCoordinates('start')}
                    className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono text-[11px] uppercase font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                  >
                    {startResolvingCoords ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Confirm Coordinates</span>
                  </button>
                </div>
              </div>
            )}

            {startLocation ? (
              <div
                data-testid="confirmed-start-summary"
                className="mt-1.5 text-[11px] text-slate-300 flex items-center justify-between gap-2 bg-slate-900/60 px-2.5 py-1.5 rounded border border-slate-800/80"
              >
                <div className="truncate">
                  <span className="font-bold text-emerald-400 mr-1.5">{startLocation.name}:</span>
                  <span className="text-slate-400">{startLocation.address}</span>
                </div>
                <span className="font-mono text-[10px] text-emerald-400 shrink-0">
                  {startLocation.latitude.toFixed(4)}, {startLocation.longitude.toFixed(4)}
                </span>
              </div>
            ) : (
              <div className="mt-1.5 text-[11px] font-mono text-amber-400/90 bg-amber-950/20 border border-amber-500/30 px-2.5 py-1 rounded">
                Select a place from suggestions, enter coordinates, or pick on map to confirm start.
              </div>
            )}

            {showStartDropdown && startSearchText.trim().length >= 2 && (
              <div
                role="listbox"
                aria-label="Starting location suggestions"
                className="absolute z-30 left-0 right-0 mt-1 bg-[#0D1322] border border-slate-700 rounded-lg shadow-2xl max-h-64 overflow-y-auto"
              >
                {startLoading && (
                  <div className="px-3 py-2 text-xs font-mono text-slate-400 flex items-center gap-2 border-b border-slate-800/60">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    Searching geographic locations...
                  </div>
                )}

                {startSearchError && (
                  <div className="p-2.5 bg-amber-950/40 border-b border-amber-500/40 text-[11px] font-mono text-amber-200 flex items-center justify-between gap-2">
                    <span>{startSearchError}</span>
                    <button
                      type="button"
                      data-testid="retry-start-search-btn"
                      onClick={() => setStartSearchRetryCount(c => c + 1)}
                      className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 text-amber-200 text-[10px] uppercase font-bold flex items-center gap-1 shrink-0"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Retry
                    </button>
                  </div>
                )}

                {!startLoading && startSuggestions.length === 0 ? (
                  <div
                    data-testid="start-no-locations-found"
                    className="p-3 text-xs font-mono text-slate-400"
                  >
                    No locations found for &ldquo;{startSearchText}&rdquo;. Try another place name or use ENTER COORDINATES.
                  </div>
                ) : (
                  startSuggestions.map((item, idx) => (
                    <button
                      key={`start_sug_${item.id}_${idx}`}
                      type="button"
                      onClick={() => handleSelectStartPlace(item)}
                      className={`w-full text-left px-3.5 py-2.5 border-b border-slate-800/70 last:border-none transition-colors flex items-start justify-between gap-2 ${
                        idx === startHighlightIdx ? 'bg-emerald-500/15' : 'hover:bg-slate-900'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold text-white">
                          {item.name}
                          {item.locality && !item.name.toLowerCase().includes(item.locality.toLowerCase())
                            ? ` — ${item.locality}`
                            : ''}
                        </div>
                        <div className="text-[11px] text-slate-400 line-clamp-1">{item.address}</div>
                      </div>
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 shrink-0">
                        {item.category}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Swap Button */}
          <div className="lg:col-span-2 flex flex-col items-center justify-center pt-1 lg:pt-6">
            <button
              type="button"
              onClick={handleSwapEndpoints}
              disabled={!startLocation || !destination}
              className="w-full lg:w-auto px-3.5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
              title="Swap Starting Location and Destination"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-[#FF5500]" />
              <span>Swap</span>
            </button>
          </div>

          {/* Destination Location */}
          <div ref={destContainerRef} className="lg:col-span-5 relative">
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
              <label
                htmlFor="autopilot-dest-input"
                className="text-[11px] font-mono uppercase tracking-wider text-[#FF5500] font-bold flex items-center gap-1.5"
              >
                <span className="w-2 h-2 rounded-full bg-[#FF5500] inline-block" />
                FINAL DESTINATION *
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {routeLoading && (
                  <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Calculating road geometry...
                  </span>
                )}
                <button
                  type="button"
                  data-testid="toggle-dest-manual-coords-btn"
                  onClick={() => {
                    setShowDestManualCoords(prev => !prev);
                    setDestLatError(undefined);
                    setDestLonError(undefined);
                  }}
                  className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border transition-colors ${
                    showDestManualCoords
                      ? 'bg-[#FF5500]/20 border-[#FF5500] text-[#FF5500] font-bold'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-[#FF5500]/60 hover:text-[#FF5500]'
                  }`}
                >
                  {showDestManualCoords ? 'BACK TO PLACE SEARCH' : 'ENTER COORDINATES'}
                </button>
                <button
                  type="button"
                  data-testid="pick-dest-on-map-btn"
                  onClick={() => setMapPickMode(prev => (prev === 'dest' ? null : 'dest'))}
                  className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border flex items-center gap-1 transition-colors ${
                    mapPickMode === 'dest'
                      ? 'bg-[#FF5500]/20 border-[#FF5500] text-[#FF5500] font-bold'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-[#FF5500]/60'
                  }`}
                >
                  <Crosshair className="w-3 h-3 text-[#FF5500]" />
                  <span>{mapPickMode === 'dest' ? 'Picking on Map...' : 'Pick on Map'}</span>
                </button>
              </div>
            </div>

            <div className="relative">
              <MapPin className="w-4 h-4 text-[#FF5500] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="autopilot-dest-input"
                type="text"
                value={destSearchText}
                onFocus={() => setShowDestDropdown(true)}
                onChange={e => {
                  const val = e.target.value;
                  setDestSearchText(val);
                  if (!val.trim()) {
                    setDestination(null);
                  }
                  setShowDestDropdown(true);
                  setDestHighlightIdx(-1);
                }}
                onKeyDown={e => {
                  if (!showDestDropdown || destSuggestions.length === 0) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setDestHighlightIdx(prev => (prev + 1) % destSuggestions.length);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setDestHighlightIdx(prev =>
                      prev <= 0 ? destSuggestions.length - 1 : prev - 1
                    );
                  } else if (e.key === 'Enter' && destHighlightIdx >= 0) {
                    e.preventDefault();
                    handleSelectDestPlace(destSuggestions[destHighlightIdx]);
                  } else if (e.key === 'Escape') {
                    setShowDestDropdown(false);
                  }
                }}
                placeholder="Search destination city, town, village, landmark, cafe, or address..."
                className="w-full bg-slate-950 border border-slate-700/90 focus:border-[#FF5500] rounded-lg pl-10 pr-9 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none"
              />
              {destSearchText && (
                <button
                  type="button"
                  aria-label="Clear Destination"
                  onClick={() => {
                    setDestSearchText('');
                    setDestination(null);
                    setShowDestDropdown(true);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Manual Coordinate Entry Panel for Destination */}
            {showDestManualCoords && (
              <div
                data-testid="dest-manual-coords-panel"
                className="mt-2 p-3 rounded-lg bg-slate-900/95 border border-[#FF5500]/40 space-y-2.5"
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-[#FF5500] uppercase">
                  <span>Manual Destination Coordinates (WGS84 Decimal)</span>
                  <button
                    type="button"
                    onClick={() => setShowDestManualCoords(false)}
                    className="text-slate-400 hover:text-white underline"
                  >
                    Switch to Place Search
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="autopilot-dest-lat-input"
                      className="block text-[10px] font-mono text-slate-300 uppercase mb-1"
                    >
                      Latitude (-90 to +90) *
                    </label>
                    <input
                      id="autopilot-dest-lat-input"
                      data-testid="autopilot-dest-lat-input"
                      type="text"
                      inputMode="decimal"
                      value={destManualLat}
                      onChange={e => {
                        setDestManualLat(e.target.value);
                        if (destLatError) setDestLatError(undefined);
                      }}
                      placeholder="e.g. 12.9716"
                      className={`w-full bg-slate-950 border rounded px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none ${
                        destLatError
                          ? 'border-red-500 focus:border-red-400'
                          : 'border-slate-700 focus:border-[#FF5500]'
                      }`}
                    />
                    {destLatError && (
                      <p
                        role="alert"
                        data-testid="autopilot-dest-lat-error"
                        className="text-[10px] font-mono text-red-400 mt-1"
                      >
                        {destLatError}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="autopilot-dest-lon-input"
                      className="block text-[10px] font-mono text-slate-300 uppercase mb-1"
                    >
                      Longitude (-180 to +180) *
                    </label>
                    <input
                      id="autopilot-dest-lon-input"
                      data-testid="autopilot-dest-lon-input"
                      type="text"
                      inputMode="decimal"
                      value={destManualLon}
                      onChange={e => {
                        setDestManualLon(e.target.value);
                        if (destLonError) setDestLonError(undefined);
                      }}
                      placeholder="e.g. 77.5946"
                      className={`w-full bg-slate-950 border rounded px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none ${
                        destLonError
                          ? 'border-red-500 focus:border-red-400'
                          : 'border-slate-700 focus:border-[#FF5500]'
                      }`}
                    />
                    {destLonError && (
                      <p
                        role="alert"
                        data-testid="autopilot-dest-lon-error"
                        className="text-[10px] font-mono text-red-400 mt-1"
                      >
                        {destLonError}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[10px] text-slate-400 font-mono">
                    Resolves address when available or uses exact coordinates directly.
                  </span>
                  <button
                    type="button"
                    data-testid="confirm-dest-coords-btn"
                    disabled={destResolvingCoords}
                    onClick={() => handleConfirmManualCoordinates('dest')}
                    className="px-3 py-1.5 rounded bg-[#FF5500] hover:bg-[#FF5500]/90 text-white font-mono text-[11px] uppercase font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                  >
                    {destResolvingCoords ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Confirm Coordinates</span>
                  </button>
                </div>
              </div>
            )}

            {destination ? (
              <div
                data-testid="confirmed-dest-summary"
                className="mt-1.5 text-[11px] text-slate-300 flex items-center justify-between gap-2 bg-slate-900/60 px-2.5 py-1.5 rounded border border-slate-800/80"
              >
                <div className="truncate">
                  <span className="font-bold text-[#FF5500] mr-1.5">{destination.name}:</span>
                  <span className="text-slate-400">{destination.address}</span>
                </div>
                <span className="font-mono text-[10px] text-[#FF5500] shrink-0">
                  {destination.latitude.toFixed(4)}, {destination.longitude.toFixed(4)}
                </span>
              </div>
            ) : (
              <div className="mt-1.5 text-[11px] font-mono text-amber-400/90 bg-amber-950/20 border border-amber-500/30 px-2.5 py-1 rounded">
                Select a place from suggestions, enter coordinates, or pick on map to confirm destination.
              </div>
            )}

            {showDestDropdown && destSearchText.trim().length >= 2 && (
              <div
                role="listbox"
                aria-label="Destination location suggestions"
                className="absolute z-30 left-0 right-0 mt-1 bg-[#0D1322] border border-slate-700 rounded-lg shadow-2xl max-h-64 overflow-y-auto"
              >
                {destLoading && (
                  <div className="px-3 py-2 text-xs font-mono text-slate-400 flex items-center gap-2 border-b border-slate-800/60">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF5500]" />
                    Searching geographic locations...
                  </div>
                )}

                {destSearchError && (
                  <div className="p-2.5 bg-amber-950/40 border-b border-amber-500/40 text-[11px] font-mono text-amber-200 flex items-center justify-between gap-2">
                    <span>{destSearchError}</span>
                    <button
                      type="button"
                      data-testid="retry-dest-search-btn"
                      onClick={() => setDestSearchRetryCount(c => c + 1)}
                      className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 text-amber-200 text-[10px] uppercase font-bold flex items-center gap-1 shrink-0"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Retry
                    </button>
                  </div>
                )}

                {!destLoading && destSuggestions.length === 0 ? (
                  <div
                    data-testid="dest-no-locations-found"
                    className="p-3 text-xs font-mono text-slate-400"
                  >
                    No locations found for &ldquo;{destSearchText}&rdquo;. Try another place name or use ENTER COORDINATES.
                  </div>
                ) : (
                  destSuggestions.map((item, idx) => (
                    <button
                      key={`dest_sug_${item.id}_${idx}`}
                      type="button"
                      onClick={() => handleSelectDestPlace(item)}
                      className={`w-full text-left px-3.5 py-2.5 border-b border-slate-800/70 last:border-none transition-colors flex items-start justify-between gap-2 ${
                        idx === destHighlightIdx ? 'bg-[#FF5500]/15' : 'hover:bg-slate-900'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold text-white">
                          {item.name}
                          {item.locality && !item.name.toLowerCase().includes(item.locality.toLowerCase())
                            ? ` — ${item.locality}`
                            : ''}
                        </div>
                        <div className="text-[11px] text-slate-400 line-clamp-1">{item.address}</div>
                      </div>
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 shrink-0">
                        {item.category}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {gpsStatusMsg && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-700 text-xs font-mono text-cyan-300 flex items-center justify-between">
            <span>{gpsStatusMsg}</span>
            <button
              type="button"
              onClick={() => setGpsStatusMsg(null)}
              className="text-slate-400 hover:text-white ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Planning Interval, Plug Preferences & Optional Range Guard */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          {/* Target Stop Interval */}
          <div className="lg:col-span-4 bg-slate-950/80 border border-slate-800 rounded-lg p-3">
            <div className="flex items-center justify-between text-xs font-mono mb-1.5">
              <span className="text-slate-400 uppercase flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#FF5500]" />
                TARGET CHARGING INTERVAL
              </span>
              <span className="text-white font-bold">{targetIntervalKm} KM</span>
            </div>
            <input
              type="range"
              min={60}
              max={180}
              step={10}
              aria-label="Target Charging Interval in Kilometers"
              value={targetIntervalKm}
              onChange={e => setTargetIntervalKm(Number(e.target.value))}
              className="w-full accent-[#FF5500] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
              <span>60 km (Conservative)</span>
              <span>100 km (Default)</span>
              <span>180 km (Long Leg)</span>
            </div>
          </div>

          {/* Preferred Plug Types */}
          <div className="lg:col-span-4 bg-slate-950/80 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] font-mono uppercase text-slate-400 mb-2">
              PREFERRED PLUG PRIORITY (OPTIONAL)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {VALID_CHARGER_PLUG_TYPES.map(plug => {
                const active = preferredChargerTypes.includes(plug);
                return (
                  <button
                    key={plug}
                    type="button"
                    onClick={() => handleTogglePlugPreference(plug)}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono uppercase font-bold border transition-colors ${
                      active
                        ? 'bg-[#FF5500]/20 border-[#FF5500] text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {plug}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Range Guard Toggle */}
          <div className="lg:col-span-4 bg-slate-950/80 border border-slate-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-mono uppercase text-cyan-400 font-bold flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                RANGE GUARD (RIDER ESTIMATE)
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={rangeGuard.enabled}
                onClick={() =>
                  setRangeGuard(prev => ({ ...prev, enabled: !prev.enabled }))
                }
                className={`px-2.5 py-0.5 rounded text-[10px] font-mono uppercase font-bold border transition-colors ${
                  rangeGuard.enabled
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                    : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}
              >
                {rangeGuard.enabled ? 'ENABLED' : 'OPTIONAL / OFF'}
              </button>
            </div>

            {rangeGuard.enabled ? (
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div>
                  <label className="block text-[9px] font-mono text-slate-400 uppercase">
                    START SOC %
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={100}
                    value={rangeGuard.startingBatteryPercent ?? 90}
                    onChange={e =>
                      setRangeGuard(prev => ({
                        ...prev,
                        startingBatteryPercent: Number(e.target.value)
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-mono text-slate-400 uppercase">
                    USABLE KM
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={320}
                    value={rangeGuard.estimatedUsableRangeKm ?? 165}
                    onChange={e =>
                      setRangeGuard(prev => ({
                        ...prev,
                        estimatedUsableRangeKm: Number(e.target.value)
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-mono text-slate-400 uppercase">
                    RESERVE KM
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={80}
                    value={rangeGuard.reserveRangeKm ?? 25}
                    onChange={e =>
                      setRangeGuard(prev => ({
                        ...prev,
                        reserveRangeKm: Number(e.target.value)
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white"
                  />
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">
                Enable to enter starting battery %, usable full-charge range, and safety reserve buffer.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Unconfirmed Endpoint Notice & Map Picker when one or both locations are missing */}
      {(!startLocation || !destination) && (
        <div className="space-y-4">
          <div
            data-testid="awaiting-confirmed-locations-banner"
            className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-4 text-xs font-mono text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Route calculation requires both a confirmed <strong>Starting Location</strong> and{' '}
                <strong>Final Destination</strong>. Search &amp; select a suggestion, use{' '}
                <strong>ENTER COORDINATES</strong>, or click directly on the OpenStreetMap below.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!startLocation && (
                <button
                  type="button"
                  onClick={() => setMapPickMode('start')}
                  className="px-2.5 py-1.5 rounded bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-bold uppercase"
                >
                  Pick Start on Map
                </button>
              )}
              {!destination && (
                <button
                  type="button"
                  onClick={() => setMapPickMode('dest')}
                  className="px-2.5 py-1.5 rounded bg-[#FF5500]/20 border border-[#FF5500] text-[#FF5500] font-bold uppercase"
                >
                  Pick Destination on Map
                </button>
              )}
            </div>
          </div>

          <AutoPilotRouteMap
            startLocation={startLocation}
            destination={destination}
            routePolyline={[]}
            chargingStops={[]}
            pitStops={[]}
            eligibleCorridorChargers={[]}
            activeStopId={null}
            mapPickMode={mapPickMode}
            onChangeMapPickMode={setMapPickMode}
            onConfirmMapLocation={handleConfirmMapLocation}
            onSelectStop={() => {}}
            onToggleReached={() => {}}
            onToggleCharged={() => {}}
            onReplaceWithBackup={() => {}}
            onAddManualStop={() => {}}
            onRemoveStop={() => {}}
            onRemovePitStop={() => {}}
          />
        </div>
      )}

      {/* Validation Error if Start == Destination */}
      {planResult && !planResult.valid && (
        <div className="bg-red-950/40 border border-red-500/50 rounded-xl p-4 text-sm text-red-200 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{planResult.error}</span>
        </div>
      )}

      {planResult && planResult.valid && (
        <>
          {/* ========================================================= */}
          {/* 2. INTERACTIVE ROUTE MAP & MISSION BRIEFING GRID          */}
          {/* ========================================================= */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Left 7 Cols: Interactive Route Map + External Google Maps Handoff */}
            <div className="xl:col-span-7 space-y-6">
              <AutoPilotRouteMap
                startLocation={startLocation}
                destination={destination}
                routePolyline={
                  routePolyline.length >= 2
                    ? routePolyline
                    : startLocation && destination
                    ? [
                        [startLocation.latitude, startLocation.longitude],
                        [destination.latitude, destination.longitude]
                      ]
                    : []
                }
                chargingStops={planResult.chargingStops}
                pitStops={planResult.pitStops}
                eligibleCorridorChargers={planResult.eligibleCorridorChargers}
                activeStopId={activeStopId}
                mapPickMode={mapPickMode}
                onChangeMapPickMode={setMapPickMode}
                onConfirmMapLocation={handleConfirmMapLocation}
                onSelectStop={id => setActiveStopId(id)}
                onToggleReached={handleToggleReached}
                onToggleCharged={handleToggleCharged}
                onReplaceWithBackup={handleReplaceWithBackup}
                onAddManualStop={handleAddManualStop}
                onRemoveStop={handleRemoveStop}
                onRemovePitStop={handleRemovePitStop}
              />

              {/* External Google Maps Turn-by-Turn Navigation Handoff Deck */}
              <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-800">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-[#FF5500] font-bold">
                      EXTERNAL TURN-BY-TURN HANDOFF // GOOGLE MAPS
                    </div>
                    <h4 className="text-base font-display font-bold text-white uppercase tracking-wider">
                      Launch Multi-Stop Highway Navigation
                    </h4>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-300">
                    {planResult.navigationStages.length === 1
                      ? 'SINGLE-STAGE HANDOFF READY'
                      : `${planResult.navigationStages.length}-STAGE SEQUENTIAL HANDOFF`}
                  </span>
                </div>

                {/* Primary Full Route / Stage Buttons */}
                <div className="space-y-3 mb-4">
                  {planResult.navigationStages.map(stage => (
                    <div
                      key={`nav_stage_${stage.stageNumber}`}
                      className="p-3.5 rounded-lg bg-slate-950/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-xs font-mono font-bold text-white">
                          {stage.label}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {stage.instruction}
                        </div>
                        {stage.waypointNames.length > 0 && (
                          <div className="text-[10px] font-mono text-cyan-300 mt-1">
                            Waypoints ({stage.waypointNames.length}): {stage.waypointNames.join(' → ')}
                          </div>
                        )}
                      </div>

                      <a
                        href={stage.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`take-off-stage-${stage.stageNumber}-link`}
                        className="px-4 py-2.5 rounded-lg bg-[#FF5500] hover:bg-[#FF5500]/90 text-white font-mono text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-2 shrink-0 no-underline shadow-lg shadow-[#FF5500]/20"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>
                          {planResult.navigationStages.length === 1
                            ? 'TAKE OFF — START NAVIGATION IN GOOGLE MAPS'
                            : `TAKE OFF — OPEN STAGE ${stage.stageNumber} IN GOOGLE MAPS`}
                        </span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ))}
                </div>

                {/* Navigate to Next Charger Action */}
                {planResult.chargingStops.length > 0 && nextChargerNav && (
                  <div className="p-3.5 rounded-lg bg-cyan-950/20 border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold">
                        NEXT UNREACHED CHARGING STOP
                      </div>
                      {nextChargerNav.allReached ? (
                        <div className="text-xs text-emerald-300 font-mono mt-0.5">
                          All planned charging stops have been marked as reached! Proceed to final destination.
                        </div>
                      ) : nextChargerNav.nextStop ? (
                        <>
                          <div className="text-sm font-bold text-white mt-0.5">
                            Stop #{nextChargerNav.nextStop.order}: {nextChargerNav.nextStop.station.name} (KM{' '}
                            {nextChargerNav.nextStop.distanceFromStartKm})
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {nextChargerNav.originDescription}
                          </div>
                        </>
                      ) : null}
                    </div>

                    {!nextChargerNav.allReached && nextChargerNav.url && (
                      <a
                        href={nextChargerNav.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-2 shrink-0 no-underline"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>NAVIGATE TO NEXT CHARGER</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right 5 Cols: Mission Briefing Panel */}
            <div className="xl:col-span-5 space-y-6">
              <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 shadow-xl">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                      PRE-FLIGHT TELEMETRY // MISSION BRIEFING
                    </div>
                    <h4 className="text-lg font-display font-bold text-white uppercase tracking-wider">
                      Route &amp; Charging Summary
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-300">
                    {planResult.briefing.routingSource}
                  </span>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
                  <div className="bg-slate-950 border border-slate-800/90 rounded-lg p-3">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">TOTAL DISTANCE</div>
                    <div className="text-lg font-mono font-bold text-white mt-0.5">
                      {planResult.briefing.totalDrivingDistanceKm} <span className="text-xs text-slate-400">KM</span>
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800/90 rounded-lg p-3">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">EST. DRIVE TIME</div>
                    <div className="text-lg font-mono font-bold text-white mt-0.5">
                      {formatDuration(planResult.briefing.estimatedDrivingDurationMin)}
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800/90 rounded-lg p-3">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">CHARGING STOPS</div>
                    <div className="text-lg font-mono font-bold text-cyan-400 mt-0.5">
                      {planResult.briefing.selectedStopsCount}
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800/90 rounded-lg p-3">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">LONGEST LEG</div>
                    <div
                      className={`text-lg font-mono font-bold mt-0.5 ${
                        planResult.briefing.longestGapKm > 125 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {planResult.briefing.longestGapKm} <span className="text-xs">KM</span>
                    </div>
                  </div>
                </div>

                {/* Detour Impact Summary */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800 text-xs font-mono text-slate-300 mb-4">
                  <span>
                    Direct Corridor: <strong>{planResult.briefing.baseDirectDrivingDistanceKm} km</strong>
                  </span>
                  <span>
                    Stop Detour Overhead:{' '}
                    <strong className="text-[#FF5500]">
                      +{planResult.briefing.totalDetourDistanceKm} km
                    </strong>
                    {planResult.briefing.estimatedDetourDurationMin !== null
                      ? ` (~${planResult.briefing.estimatedDetourDurationMin} min)`
                      : ''}
                  </span>
                </div>

                {/* Weather & Riding Conditions Snapshot */}
                {weather.available && weather.originWeather && weather.destinationWeather && (
                  <div className="mb-4 p-3 rounded-lg bg-slate-950/90 border border-slate-800">
                    <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-400 mb-2">
                      <span className="flex items-center gap-1.5 text-cyan-300 font-bold">
                        <CloudRain className="w-3.5 h-3.5" />
                        LIVE CORRIDOR WEATHER SNAPSHOT (OPEN-METEO)
                      </span>
                      <span>METEOROLOGICAL FEED</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                      <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                        <div className="text-[10px] font-mono text-emerald-400 uppercase font-bold truncate">
                          ORIGIN: {startLocation?.name}
                        </div>
                        <div className="flex items-center gap-3 mt-1 font-mono text-slate-200">
                          <span className="flex items-center gap-1">
                            <Thermometer className="w-3 h-3 text-[#FF5500]" />
                            {weather.originWeather.temperatureC}°C
                          </span>
                          <span className="flex items-center gap-1">
                            <Wind className="w-3 h-3 text-cyan-400" />
                            {weather.originWeather.windSpeedKmh} km/h
                          </span>
                          <span className="text-slate-400">{weather.originWeather.condition}</span>
                        </div>
                      </div>
                      <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                        <div className="text-[10px] font-mono text-[#FF5500] uppercase font-bold truncate">
                          DEST: {destination?.name}
                        </div>
                        <div className="flex items-center gap-3 mt-1 font-mono text-slate-200">
                          <span className="flex items-center gap-1">
                            <Thermometer className="w-3 h-3 text-[#FF5500]" />
                            {weather.destinationWeather.temperatureC}°C
                          </span>
                          <span className="flex items-center gap-1">
                            <Wind className="w-3 h-3 text-cyan-400" />
                            {weather.destinationWeather.windSpeedKmh} km/h
                          </span>
                          <span className="text-slate-400">{weather.destinationWeather.condition}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Segment-by-Segment Breakdown */}
                <div className="mb-4">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold mb-2">
                    ORDERED ROUTE LEG BREAKDOWN ({planResult.briefing.segments.length} LEG
                    {planResult.briefing.segments.length === 1 ? '' : 'S'})
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {planResult.briefing.segments.map((seg, idx) => (
                      <div
                        key={`seg_${idx}`}
                        className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                          seg.isLongGap
                            ? 'bg-amber-950/25 border-amber-500/40'
                            : 'bg-slate-950/80 border-slate-800'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-[10px] text-slate-400 uppercase">
                            LEG #{idx + 1} {seg.isLongGap ? '• LONG STRETCH WARNING' : ''}
                          </div>
                          <div className="text-white font-medium truncate">
                            {seg.fromName} <span className="text-[#FF5500]">→</span> {seg.toName}
                          </div>
                        </div>
                        <div className="text-right font-mono shrink-0">
                          <div
                            className={`font-bold ${
                              seg.isLongGap ? 'text-amber-300' : 'text-cyan-300'
                            }`}
                          >
                            {seg.distanceKm} km
                          </div>
                          {seg.durationMin !== null && (
                            <div className="text-[10px] text-slate-400">~{seg.durationMin} min</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Alerts: Routing Limitation, Sparse Network, Ineligible Chargers, Charger Report Warnings */}
                <div className="space-y-2.5">
                  {planResult.briefing.routingLimitationNote && (
                    <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>{planResult.briefing.routingLimitationNote}</span>
                    </div>
                  )}

                  {planResult.briefing.networkSparseWarning && (
                    <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>{planResult.briefing.networkSparseWarning}</span>
                    </div>
                  )}

                  {planResult.briefing.ineligibleChargerAlerts.map((alert, i) => (
                    <div
                      key={`ineligible_${i}`}
                      className="p-3 rounded-lg bg-red-950/30 border border-red-500/40 text-xs text-red-200 flex items-start gap-2"
                    >
                      <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <span>{alert}</span>
                    </div>
                  ))}

                  {planResult.briefing.chargerReportWarnings.map((warn, i) => (
                    <div
                      key={`crep_warn_${i}`}
                      className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2"
                    >
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>{warn}</span>
                    </div>
                  ))}

                  {/* Range Guard Warnings */}
                  {planResult.briefing.rangeGuardEvaluation.enabled && (
                    <div className="p-3 rounded-lg bg-cyan-950/20 border border-cyan-500/30 space-y-2">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300 font-bold flex items-center justify-between">
                        <span>RANGE GUARD ASSESSMENT</span>
                        <span>
                          SAFE LEG LIMIT: {planResult.briefing.rangeGuardEvaluation.effectiveSafeLegKm ?? '--'} KM
                        </span>
                      </div>

                      {planResult.briefing.rangeGuardEvaluation.warnings.length === 0 ? (
                        <div className="text-xs text-emerald-300 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          All route legs are within your rider-estimated usable range and reserve buffer.
                        </div>
                      ) : (
                        planResult.briefing.rangeGuardEvaluation.warnings.map((w, idx) => (
                          <div
                            key={`rg_w_${idx}`}
                            className="p-2.5 rounded bg-red-950/40 border border-red-500/40 text-xs text-red-200 space-y-1.5"
                          >
                            <div className="font-medium">{w.message}</div>
                            {w.recommendedEarlierCharger && (
                              <button
                                type="button"
                                onClick={() => handleAddManualStop(w.recommendedEarlierCharger!.id)}
                                className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 font-mono text-[10px] uppercase font-bold inline-flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" />
                                Add Earlier Stop: {w.recommendedEarlierCharger.name}
                              </button>
                            )}
                          </div>
                        ))
                      )}

                      <p className="text-[10px] text-slate-400 italic">
                        {planResult.briefing.rangeGuardEvaluation.disclaimer}
                      </p>
                    </div>
                  )}

                  {/* Mandatory Range Disclaimer */}
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                    <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>{planResult.briefing.generalRangeDisclaimer}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 3. ORDERED CHARGING STOPS, BACKUPS & COMMUNITY REPORTS    */}
          {/* ========================================================= */}
          <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 sm:p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-800">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                  HIGHWAY CHARGING SEQUENCE // PRIMARY &amp; BACKUP PODS
                </div>
                <h4 className="text-lg font-display font-bold text-white uppercase tracking-wider">
                  Ordered Charging Stops ({planResult.chargingStops.length})
                </h4>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {unselectedCorridorChargers.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <select
                      aria-label="Add eligible corridor charger to route"
                      value={manualCorridorChargerToAdd}
                      onChange={e => setManualCorridorChargerToAdd(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200"
                    >
                      <option value="">+ Add Corridor Charger ({unselectedCorridorChargers.length})...</option>
                      {unselectedCorridorChargers.map(c => (
                        <option key={c.station.id} value={c.station.id}>
                          KM {c.alongRouteKm} — {c.station.name} ({c.station.chargerType || 'Plug'})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!manualCorridorChargerToAdd}
                      onClick={() => handleAddManualStop(manualCorridorChargerToAdd)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 font-mono text-xs uppercase font-bold disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                )}

                {(manualAddedIds.length > 0 ||
                  removedIds.length > 0 ||
                  Object.keys(replacedStopMap).length > 0) && (
                  <button
                    type="button"
                    onClick={handleResetAutomaticStops}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs uppercase flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reset to Auto-Selected Stops
                  </button>
                )}
              </div>
            </div>

            {planResult.chargingStops.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-950/80 border border-slate-800 text-center space-y-2">
                <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto" />
                <div className="text-sm font-bold text-white uppercase font-mono">
                  {planResult.briefing.baseDirectDrivingDistanceKm <= targetIntervalKm * 1.08
                    ? `Direct Corridor Reachable (${planResult.briefing.baseDirectDrivingDistanceKm} km) — Zero Intermediate Charging Stops Needed`
                    : 'No Eligible Chargers Selected on This Corridor'}
                </div>
                <p className="text-xs text-slate-400 max-w-xl mx-auto">
                  {planResult.briefing.baseDirectDrivingDistanceKm <= targetIntervalKm * 1.08
                    ? `Your destination is within your ${targetIntervalKm} km target interval. You can still manually add any corridor charger from the dropdown above if you want a top-up.`
                    : 'No approved chargers matched within the highway corridor. Adjust your preferred plug filter or add a charger along the route.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {planResult.chargingStops.map(stop => {
                  const navUrl = buildChargerNavigationUrl(stop.station);
                  const isReportingThis = reportingChargerId === stop.station.id;
                  const intel = stop.intelligence;

                  return (
                    <div
                      key={stop.station.id}
                      className={`rounded-xl border p-4 sm:p-5 transition-colors ${
                        stop.reached
                          ? 'bg-emerald-950/15 border-emerald-500/40'
                          : intel.hasRecentIssue
                          ? 'bg-amber-950/15 border-amber-500/40'
                          : 'bg-slate-950/90 border-slate-800'
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold">
                              STOP #{stop.order}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200 font-mono text-xs">
                              KM {stop.distanceFromStartKm} FROM START
                            </span>
                            <span className="px-2 py-0.5 rounded bg-[#FF5500]/15 border border-[#FF5500]/40 text-[#FF5500] font-mono text-xs font-bold">
                              {stop.station.chargerType || 'Supernova'} • {stop.station.powerOutputKw} kW
                            </span>
                            {/* Community Report Confidence Badge */}
                            <span
                              className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase border ${
                                intel.confidenceLabel === 'RECENTLY REPORTED WORKING'
                                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                  : intel.confidenceLabel === 'RECENT ISSUE REPORTED'
                                  ? 'bg-red-500/15 border-red-500/40 text-red-300'
                                  : intel.confidenceLabel === 'MIXED REPORTS'
                                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                  : 'bg-slate-900 border-slate-700 text-slate-400'
                              }`}
                            >
                              {intel.confidenceLabel} ({intel.sourceLabel})
                            </span>
                          </div>

                          <h5 className="text-base sm:text-lg font-bold text-white">
                            {stop.station.name}
                          </h5>
                          <p className="text-xs text-slate-400">{stop.station.location}</p>

                          {(() => {
                            const stopSubmitter = resolveChargerSubmitterInfo(stop.station as any);
                            if (!stopSubmitter.isCommunityProvided && !stopSubmitter.isUserSubmitted) {
                              return null;
                            }
                            return (
                              <div className="mt-1.5 px-3 py-1.5 rounded-lg bg-[#191610] border border-[#E8AA45]/45 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                                <div className="flex items-center gap-1.5 text-slate-200">
                                  <UserIcon className="w-3.5 h-3.5 text-[#E8AA45]" />
                                  <span className="text-slate-400">Community Submitter:</span>
                                  <span className="font-bold text-white">
                                    {stopSubmitter.submitterName}
                                  </span>
                                </div>
                                <a
                                  href={stopSubmitter.telHref}
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-[11px]"
                                >
                                  <Phone className="w-3 h-3" />
                                  <span>{stopSubmitter.submitterPhone}</span>
                                </a>
                              </div>
                            );
                          })()}

                          {/* Distance & Selection Telemetry */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] font-mono">
                            <div className="bg-slate-900/80 border border-slate-800 rounded p-2">
                              <span className="text-slate-500 block text-[9px]">FROM PREV STOP</span>
                              <span className="text-white font-bold">{stop.distanceFromPrevStopKm} km</span>
                            </div>
                            <div className="bg-slate-900/80 border border-slate-800 rounded p-2">
                              <span className="text-slate-500 block text-[9px]">TO NEXT POINT</span>
                              <span className="text-white font-bold">{stop.distanceToNextStopKm} km</span>
                            </div>
                            <div className="bg-slate-900/80 border border-slate-800 rounded p-2">
                              <span className="text-slate-500 block text-[9px]">DETOUR IMPACT</span>
                              <span className="text-[#FF5500] font-bold">
                                +{stop.detourDistanceKm} km
                                {stop.estimatedDetourDurationMin !== null
                                  ? ` (~${stop.estimatedDetourDurationMin}m)`
                                  : ''}
                              </span>
                            </div>
                            <div className="bg-slate-900/80 border border-slate-800 rounded p-2">
                              <span className="text-slate-500 block text-[9px]">ACCESS / STATUS</span>
                              <span className="text-emerald-300 font-bold">
                                {stop.station.accessConditions}
                              </span>
                            </div>
                          </div>

                          <div className="text-[11px] text-slate-400 pt-1">
                            <strong className="text-slate-300 font-mono uppercase text-[10px]">
                              Why Selected:{' '}
                            </strong>
                            {stop.selectionReason} — {intel.shortSummary}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap lg:flex-col gap-2 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleReached(stop.station.id)}
                              className={`px-3 py-1.5 rounded-lg font-mono text-xs uppercase font-bold border flex items-center gap-1.5 transition-colors ${
                                stop.reached
                                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {stop.reached ? 'Reached' : 'Mark Reached'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleCharged(stop.station.id)}
                              className={`px-3 py-1.5 rounded-lg font-mono text-xs uppercase font-bold border flex items-center gap-1.5 transition-colors ${
                                stop.chargingConfirmed
                                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                              }`}
                            >
                              <Zap className="w-3.5 h-3.5" />
                              {stop.chargingConfirmed ? 'Charged' : 'Confirm Charged'}
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <a
                              href={navUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 px-3 py-1.5 rounded-lg bg-[#FF5500] hover:bg-[#FF5500]/90 text-white font-mono text-xs uppercase font-bold flex items-center justify-center gap-1.5 no-underline"
                            >
                              <Navigation className="w-3.5 h-3.5" />
                              Navigate
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                setReportingChargerId(isReportingThis ? null : stop.station.id)
                              }
                              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 font-mono text-xs uppercase font-bold flex items-center gap-1"
                            >
                              <MessageSquarePlus className="w-3.5 h-3.5" />
                              Report Status
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove Stop ${stop.station.name}`}
                              onClick={() => handleRemoveStop(stop.station.id)}
                              className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-red-300"
                              title="Remove this stop from route"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Community Charger Status Reporting Drawer */}
                      {isReportingThis && (
                        <div className="mt-4 pt-3 border-t border-slate-800 bg-slate-900/70 rounded-lg p-3.5 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono uppercase text-cyan-300 font-bold">
                              LOG COMMUNITY REPORT FOR {stop.station.name}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              Labeled as: Community Report (Not live hardware telemetry)
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {VALID_CHARGER_REPORT_CATEGORIES.map(cat => (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setReportCategory(cat)}
                                className={`px-3 py-1.5 rounded text-xs font-mono font-bold uppercase border transition-colors ${
                                  reportCategory === cat
                                    ? 'bg-[#FF5500] border-[#FF5500] text-white'
                                    : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500'
                                }`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              value={reportComment}
                              onChange={e => setReportComment(e.target.value)}
                              placeholder="Optional observation (e.g., Charged from 20% to 85%, Bay 1 working, ask security for key)..."
                              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                            />
                            <button
                              type="button"
                              disabled={submittingReport}
                              onClick={() => handleSubmitChargerReport(stop.station.id)}
                              className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono text-xs uppercase font-bold shrink-0"
                            >
                              {submittingReport ? 'Saving...' : 'Submit Report'}
                            </button>
                          </div>

                          {reportFeedback && (
                            <div className="text-xs font-mono text-emerald-300">{reportFeedback}</div>
                          )}
                        </div>
                      )}

                      {/* Backup Chargers Along Route for this Primary Stop */}
                      <div className="mt-4 pt-3 border-t border-slate-800/80">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold mb-2">
                          BACKUP CHARGERS COVERING THIS SEGMENT ({stop.backupChargers.length})
                        </div>
                        {stop.backupChargers.length === 0 ? (
                          <div className="text-xs font-mono text-slate-500">
                            No secondary approved backup charger within 45 km of this segment. Carry your portable 15A adapter.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {stop.backupChargers.map(bkp => (
                              <div
                                key={`bkp_${stop.station.id}_${bkp.station.id}`}
                                className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[9px] font-mono font-bold">
                                      BACKUP
                                    </span>
                                    <span className="text-xs font-bold text-white truncate">
                                      {bkp.station.name}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                    {bkp.distanceFromPrimaryKm} km from primary • +{bkp.detourDistanceKm} km detour •{' '}
                                    {bkp.intelligence.confidenceLabel}
                                  </div>
                                  <div className="text-[10px] font-mono text-amber-300/90 mt-0.5">
                                    {bkp.reason}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleReplaceWithBackup(stop.station.id, bkp.station.id)
                                  }
                                  className="px-2.5 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-mono text-[10px] uppercase font-bold shrink-0 flex items-center gap-1"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  Use as Primary
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* 4. RIDER PIT STOPS ALONG THE ROUTE & SAVED MISSIONS       */}
          {/* ========================================================= */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Left 6 Cols: Rider Pit Stops Along the Route */}
            <div className="xl:col-span-6 bg-[#0B0F19] border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-violet-400 font-bold flex items-center gap-1.5">
                    <Coffee className="w-3.5 h-3.5" />
                    RIDER PIT STOPS // RESTAURANTS, CAFÉS &amp; REST HALTS
                  </div>
                  <h4 className="text-base font-display font-bold text-white uppercase tracking-wider">
                    Optional Corridor Pit Stops ({planResult.pitStops.length} Selected)
                  </h4>
                </div>

                <div className="flex flex-wrap gap-1">
                  {['ALL', 'Restaurant', 'Cafe', 'Fuel', 'Hotel'].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setPitStopCategoryFilter(cat)}
                      className={`px-2 py-1 rounded text-[10px] font-mono uppercase font-bold border ${
                        pitStopCategoryFilter === cat
                          ? 'bg-violet-500/20 border-violet-400 text-violet-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected Pit Stops */}
              {planResult.pitStops.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-mono uppercase text-violet-300 font-bold">
                    INCLUDED IN CURRENT MISSION:
                  </div>
                  {planResult.pitStops.map(pit => (
                    <div
                      key={pit.id}
                      className="p-3 rounded-lg bg-violet-950/20 border border-violet-500/40 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white">
                          {pit.name}{' '}
                          <span className="text-[10px] font-mono text-violet-300">
                            (KM {pit.distanceFromStartKm} • +{pit.detourDistanceKm} km)
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">{pit.address}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleTogglePitStopNav(pit.id)}
                          className={`px-2 py-1 rounded text-[10px] font-mono uppercase border ${
                            pit.includedInNavigation
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                              : 'bg-slate-900 border-slate-700 text-slate-400'
                          }`}
                        >
                          {pit.includedInNavigation ? 'In Google Maps' : 'Map Only'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemovePitStop(pit.id)}
                          className="p-1 text-red-400 hover:text-red-300"
                          title="Remove Pit Stop"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Discoverable Corridor Pit Stops */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                <div className="text-[10px] font-mono uppercase text-slate-400 font-bold">
                  DISCOVERED ALONG ROUTE CORRIDOR ({availableCorridorPitStops.length}):
                </div>
                {availableCorridorPitStops.length === 0 ? (
                  <div className="text-xs font-mono text-slate-500 py-3">
                    No matching corridor pit stops found within 20 km of this route for filter &ldquo;{pitStopCategoryFilter}&rdquo;.
                  </div>
                ) : (
                  availableCorridorPitStops.map(place => {
                    const alreadyAdded = selectedPitStops.some(p => p.id === place.id);
                    return (
                      <div
                        key={`disc_pit_${place.id}`}
                        className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[9px] font-mono text-violet-300">
                              {place.category}
                            </span>
                            <span className="text-xs font-bold text-white truncate">
                              {place.name}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            KM {place.distanceFromStartKm} • +{place.detourDistanceKm} km detour •{' '}
                            {place.address}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={alreadyAdded}
                          onClick={() => handleAddPitStop(place)}
                          className={`px-2.5 py-1 rounded font-mono text-[10px] uppercase font-bold border shrink-0 flex items-center gap-1 ${
                            alreadyAdded
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                              : 'bg-violet-500/20 hover:bg-violet-500/30 border-violet-500/40 text-violet-200'
                          }`}
                        >
                          {alreadyAdded ? (
                            <>
                              <Check className="w-3 h-3" /> Added
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" /> Add Pit Stop
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right 6 Cols: Save Mission, Ride History & Squadron Sharing */}
            <div className="xl:col-span-6 bg-[#0B0F19] border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-[#FF5500] font-bold flex items-center gap-1.5">
                    <Bookmark className="w-3.5 h-3.5" />
                    FLIGHT LOG // SAVE MISSION &amp; SQUADRON SHARING
                  </div>
                  <h4 className="text-base font-display font-bold text-white uppercase tracking-wider">
                    Save or Share Auto Pilot Route
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFavourite(prev => !prev)}
                  className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase font-bold border flex items-center gap-1 ${
                    isFavourite
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  <Star className="w-3 h-3" />
                  {isFavourite ? 'Favourite Corridor' : 'Mark Favourite'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                    MISSION CALLSIGN / NAME
                  </label>
                  <input
                    type="text"
                    value={missionNameInput}
                    onChange={e => setMissionNameInput(e.target.value)}
                    placeholder="e.g., Sunday Breakfast Run to Mysuru"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                      DEPARTURE TIME
                    </label>
                    <input
                      type="datetime-local"
                      value={departureDateTime}
                      onChange={e => setDepartureDateTime(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                      RIDE STATUS
                    </label>
                    <select
                      value={missionStatus}
                      onChange={e =>
                        setMissionStatus(
                          e.target.value as 'Planned' | 'In Progress' | 'Completed'
                        )
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white font-mono"
                    >
                      <option value="Planned">Planned</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  PERSONAL RIDER NOTES
                </label>
                <input
                  type="text"
                  value={riderNotes}
                  onChange={e => setRiderNotes(e.target.value)}
                  placeholder="Adapter checklist, tyre pressure, regen preferences..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>

              {/* Squadron Sharing Controls */}
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-cyan-300 font-bold flex items-center gap-1.5">
                    <Share2 className="w-3.5 h-3.5" />
                    SHARE WITH SQUADRON RIDERS
                  </span>
                  <button
                    type="button"
                    onClick={() => setShareEnabled(prev => !prev)}
                    className={`px-2.5 py-0.5 rounded text-[10px] font-mono uppercase font-bold border ${
                      shareEnabled
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}
                  >
                    {shareEnabled ? 'SHARING ENABLED' : 'PRIVATE MISSION'}
                  </button>
                </div>

                {shareEnabled && (
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-wrap gap-1.5">
                      {SQUADRON_ROSTER.map(member => {
                        const selected = sharedWithUserIds.includes(member.id);
                        return (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() =>
                              setSharedWithUserIds(prev =>
                                prev.includes(member.id)
                                  ? prev.filter(id => id !== member.id)
                                  : [...prev, member.id]
                              )
                            }
                            className={`px-2 py-1 rounded text-[10px] font-mono border ${
                              selected
                                ? 'bg-cyan-500/20 border-cyan-400 text-white'
                                : 'bg-slate-900 border-slate-700 text-slate-400'
                            }`}
                          >
                            {member.name}
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={meetingPointName}
                        onChange={e => setMeetingPointName(e.target.value)}
                        placeholder="Optional Meeting Point..."
                        className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                      />
                      <input
                        type="text"
                        value={groupNotes}
                        onChange={e => setGroupNotes(e.target.value)}
                        placeholder="Optional Group Ride Notes..."
                        className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={savingMission}
                  onClick={handleSaveMission}
                  className="px-5 py-2.5 rounded-lg bg-[#FF5500] hover:bg-[#FF5500]/90 text-white font-mono text-xs uppercase tracking-wider font-bold flex items-center gap-2"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  {savingMission
                    ? 'Saving Mission...'
                    : activeMissionId
                    ? 'Update Saved Mission'
                    : 'Save Mission to Flight Log'}
                </button>
                {saveFeedback && (
                  <span className="text-xs font-mono text-emerald-400">{saveFeedback}</span>
                )}
              </div>

              {/* Saved Missions List */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="text-[10px] font-mono uppercase text-slate-400 font-bold">
                  SAVED MISSIONS &amp; SHARED SQUADRON ROUTES ({savedMissions.length})
                </div>
                {savedMissions.length === 0 ? (
                  <div className="text-xs font-mono text-slate-500">
                    No saved Auto Pilot missions yet.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {savedMissions.map(m => (
                      <div
                        key={m.id}
                        className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${
                          activeMissionId === m.id
                            ? 'bg-[#FF5500]/10 border-[#FF5500]/50'
                            : 'bg-slate-950 border-slate-800'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {m.isFavourite && (
                              <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                            )}
                            <span className="text-xs font-bold text-white truncate">
                              {m.missionName}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[9px] font-mono text-cyan-300">
                              {m.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            {m.startLocation.name} → {m.destination.name} ({m.plannedRouteDistanceKm} km •{' '}
                            {m.chargingStops.length} stop{m.chargingStops.length === 1 ? '' : 's'})
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleLoadSavedMission(m)}
                            className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-white"
                          >
                            Load
                          </button>
                          {m.userId === currentUserId && (
                            <button
                              type="button"
                              aria-label={`Delete saved mission ${m.missionName}`}
                              onClick={() => handleDeleteSavedMission(m.id)}
                              className="p-1 text-red-400 hover:text-red-300"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
