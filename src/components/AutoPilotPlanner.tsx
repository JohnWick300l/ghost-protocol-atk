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
  discoverRouteCorridorDefinitions,
  buildFallbackRouteCandidates,
  evaluateAutoPilotRouteOptions,
  VALID_CHARGER_REPORT_CATEGORIES,
  type RouteCoordinate,
  type EligibleChargerRecord,
  type ChargerCommunityReport,
  type ChargerReportCategory,
  type PlannedPitStop,
  type RangeGuardConfig,
  type AutoPilotMissionRecord,
  type AutoPilotRouteCandidateGeometry,
  type EvaluatedAutoPilotRouteOption
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


const SQUADRON_ROSTER = [
  { id: 'u_admin', name: 'Abinav Thejas K' }
];

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

  // 4. OSRM Driving Route Geometry, Multi-Route Candidates & Weather State
  const [routePolyline, setRoutePolyline] = useState<[number, number][]>([]);
  const [roadDistanceKm, setRoadDistanceKm] = useState<number | null>(null);
  const [roadDurationMin, setRoadDurationMin] = useState<number | null>(null);
  const [routingAvailable, setRoutingAvailable] = useState<boolean>(true);
  const [routingLimitationNote, setRoutingLimitationNote] = useState<string | undefined>(undefined);
  const [routeLoading, setRouteLoading] = useState<boolean>(false);
  const [candidateRoutes, setCandidateRoutes] = useState<AutoPilotRouteCandidateGeometry[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');

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

    const activeStationPool =
      allStationsForValidation.length > 0 ? allStationsForValidation : stations;
    const corridorDefs = discoverRouteCorridorDefinitions(
      startLocation,
      destination,
      activeStationPool
    );
    const instantFallbackRoutes = buildFallbackRouteCandidates(
      startLocation,
      destination,
      activeStationPool,
      corridorDefs
    );

    // 1. Immediately hydrate multi-route candidates so multiple routes are visible right away
    setCandidateRoutes(instantFallbackRoutes);
    setSelectedRouteId(prev =>
      instantFallbackRoutes.some(r => r.id === prev)
        ? prev
        : instantFallbackRoutes[0]?.id || ''
    );

    const cachedRoute = loadCachedRouteFromPhone(sLat, sLon, dLat, dLon);
    if (cachedRoute && Array.isArray(cachedRoute.polyline) && cachedRoute.polyline.length >= 2) {
      setRoutePolyline(cachedRoute.polyline);
      setRoadDistanceKm(cachedRoute.distanceKm);
      setRoadDurationMin(cachedRoute.durationMin);
      setRoutingAvailable(cachedRoute.routingAvailable);
      setRoutingLimitationNote(cachedRoute.routingLimitationNote);
    } else if (instantFallbackRoutes[0]) {
      setRoutePolyline(instantFallbackRoutes[0].polyline);
      setRoadDistanceKm(instantFallbackRoutes[0].distanceKm);
      setRoadDurationMin(instantFallbackRoutes[0].durationMin);
      setRoutingAvailable(true);
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
      setCandidateRoutes(instantFallbackRoutes);
      const firstRoute = instantFallbackRoutes[0];
      if (firstRoute) {
        setSelectedRouteId(prev =>
          instantFallbackRoutes.some(r => r.id === prev) ? prev : firstRoute.id
        );
        setRoutePolyline(firstRoute.polyline);
        setRoadDistanceKm(firstRoute.distanceKm);
        setRoadDurationMin(firstRoute.durationMin);
        setRoutingAvailable(true);
        setRoutingLimitationNote(
          'Offline multi-corridor highway geometry active (calculated from phone storage).'
        );
        saveCachedRouteToPhone(sLat, sLon, dLat, dLon, {
          polyline: firstRoute.polyline,
          distanceKm: firstRoute.distanceKm,
          durationMin: firstRoute.durationMin,
          routingAvailable: true,
          routingLimitationNote: 'Offline highway corridor geometry cached on phone.'
        });
      }
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
              {
                name: startLocation?.name,
                locality: startLocation?.locality,
                address: startLocation?.address,
                latitude: sLat,
                longitude: sLon
              },
              {
                name: destination?.name,
                locality: destination?.locality,
                address: destination?.address,
                latitude: dLat,
                longitude: dLon
              }
            ],
            corridors: corridorDefs
          })
        });

        if (!cancelled && routeRes.ok) {
          const rData = await routeRes.json();
          const serverRoutes: AutoPilotRouteCandidateGeometry[] =
            Array.isArray(rData.routes) && rData.routes.length > 0
              ? rData.routes
              : instantFallbackRoutes;

          setCandidateRoutes(serverRoutes);
          setSelectedRouteId(prev => {
            const matched = serverRoutes.find(r => r.id === prev) || serverRoutes[0];
            if (matched) {
              setRoutingAvailable(Boolean(matched.routingAvailable));
              setRoutingLimitationNote(rData.routingLimitationNote);
              setRoadDistanceKm(matched.distanceKm);
              setRoadDurationMin(matched.durationMin);
              setRoutePolyline(matched.polyline);
              return matched.id;
            }
            return prev;
          });

          const primaryCache = serverRoutes[0];
          const avail = Boolean(
            primaryCache ? primaryCache.routingAvailable : rData.routingAvailable
          );
          const dist =
            primaryCache && typeof primaryCache.distanceKm === 'number'
              ? primaryCache.distanceKm
              : typeof rData.distanceKm === 'number'
              ? rData.distanceKm
              : null;
          const dur =
            primaryCache && typeof primaryCache.durationMin === 'number'
              ? primaryCache.durationMin
              : typeof rData.durationMin === 'number'
              ? rData.durationMin
              : null;
          const poly: [number, number][] =
            primaryCache && Array.isArray(primaryCache.polyline) && primaryCache.polyline.length >= 2
              ? primaryCache.polyline
              : Array.isArray(rData.polyline) && rData.polyline.length >= 2
              ? rData.polyline
              : [
                  [sLat, sLon],
                  [dLat, dLon]
                ];

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

  // Evaluate all discovered routes so each route shows total distance and total chargers on route
  const evaluatedRouteOptions = useMemo<EvaluatedAutoPilotRouteOption[]>(() => {
    if (!startLocation || !destination) return [];
    const activeStations =
      allStationsForValidation.length > 0 ? allStationsForValidation : stations;
    const effectiveCandidates =
      candidateRoutes.length > 0
        ? candidateRoutes
        : buildFallbackRouteCandidates(startLocation, destination, activeStations);

    return evaluateAutoPilotRouteOptions(effectiveCandidates, {
      startLocation,
      destination,
      allStations: activeStations,
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
    candidateRoutes,
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

  const activeRouteOption = useMemo<EvaluatedAutoPilotRouteOption | null>(() => {
    if (evaluatedRouteOptions.length === 0) return null;
    return (
      evaluatedRouteOptions.find(r => r.id === selectedRouteId) ||
      evaluatedRouteOptions[0] ||
      null
    );
  }, [evaluatedRouteOptions, selectedRouteId]);

  const handleSelectRouteOption = (routeId: string) => {
    const found = evaluatedRouteOptions.find(r => r.id === routeId);
    setSelectedRouteId(routeId);
    if (found) {
      setRoutePolyline(found.polyline);
      setRoadDistanceKm(found.distanceKm);
      setRoadDurationMin(found.durationMin);
      setRoutingAvailable(found.routingAvailable);
      setRoutingLimitationNote(found.routingLimitationNote);
      setActiveStopId(null);
    }
  };

  // Compute complete Auto Pilot plan deterministically via pure engine (using active selected route)
  const planResult = useMemo(() => {
    if (!startLocation || !destination) return null;
    if (activeRouteOption) {
      return activeRouteOption.planResult;
    }
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
    activeRouteOption,
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

  const [showRouteOptions, setShowRouteOptions] = useState(false);
  const [showMoreTools, setShowMoreTools] = useState(false);

  return (
    <div className="space-y-4">
      {/* ========================================================= */}
      {/* 1. CHOOSE STARTING LOCATION & FINAL DESTINATION            */}
      {/* ========================================================= */}
      <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-4 sm:p-5 shadow-xl">
        {/* Quick Corridor Presets & Optional Settings Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3.5 border-b border-slate-800/80">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold mr-1">
              Quick Corridors:
            </span>
            {[
              {
                id: 'preset_blr_kerala',
                label: 'Bengaluru → Kerala (Mysuru / Salem)',
                start: {
                  name: 'Ultraviolette Hangar Indiranagar',
                  locality: 'Indiranagar, Bengaluru',
                  address: '529, 100 Feet Rd, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka',
                  latitude: 12.9719,
                  longitude: 77.6412
                },
                dest: {
                  name: 'Kerala — Kochi (Edappally NH 66 Hub)',
                  locality: 'Kochi, Kerala',
                  address: 'Edappally NH 66 / NH 544 Highway Junction, Kochi, Kerala 682024',
                  latitude: 10.0190,
                  longitude: 76.3142
                }
              },
              {
                id: 'preset_blr_mysuru',
                label: 'Bengaluru → Mysuru',
                start: {
                  name: 'Ultraviolette Hangar Indiranagar',
                  locality: 'Indiranagar, Bengaluru',
                  address: '529, 100 Feet Rd, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka',
                  latitude: 12.9719,
                  longitude: 77.6412
                },
                dest: {
                  name: 'Mysuru Palace & Chamundi Foothills',
                  locality: 'Agrahara, Mysuru',
                  address: 'Sayyaji Rao Road, Agrahara, Mysuru, Karnataka 570001',
                  latitude: 12.3051,
                  longitude: 76.6551
                }
              },
              {
                id: 'preset_blr_chennai',
                label: 'Bengaluru → Chennai',
                start: {
                  name: 'Ultraviolette Hangar Indiranagar',
                  locality: 'Indiranagar, Bengaluru',
                  address: '529, 100 Feet Rd, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka',
                  latitude: 12.9719,
                  longitude: 77.6412
                },
                dest: {
                  name: 'ECR Mahabalipuram Coastal Hub, Chennai',
                  locality: 'Mamallapuram, Chennai Corridor',
                  address: 'East Coast Road (ECR), Mamallapuram, Chennai Corridor, Tamil Nadu',
                  latitude: 12.6208,
                  longitude: 80.1945
                }
              }
            ].map(preset => (
              <button
                key={preset.id}
                type="button"
                data-testid={preset.id}
                onClick={() => {
                  setStartLocation(preset.start);
                  setDestination(preset.dest);
                  setStartSearchText(preset.start.name);
                  setDestSearchText(preset.dest.name);
                  setManualAddedIds([]);
                  setRemovedIds([]);
                  setReplacedStopMap({});
                  setActiveStopId(null);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-[#FF5500]/60 text-[10px] font-mono text-slate-200 hover:text-white transition-colors cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowRouteOptions(prev => !prev)}
            className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono uppercase font-bold flex items-center gap-1.5 transition-colors ${
              showRouteOptions
                ? 'bg-[#FF5500]/15 border-[#FF5500] text-[#FF5500]'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>{showRouteOptions ? 'Hide Route Options' : `Stop Interval (${targetIntervalKm} km)`}</span>
          </button>
        </div>

        {/* Start & Destination Search Inputs */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
          {/* Starting Location */}
          <div ref={startContainerRef} className="lg:col-span-5 relative">
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
              <label
                htmlFor="autopilot-start-input"
                className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1.5"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                STARTING LOCATION
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={gpsLocating}
                  className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 flex items-center gap-1 font-bold"
                >
                  {gpsLocating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <LocateFixed className="w-3 h-3" />
                  )}
                  GPS
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
                  <span>{mapPickMode === 'start' ? 'Tap Map...' : 'Map'}</span>
                </button>
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
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-emerald-400/60'
                  }`}
                >
                  {showStartManualCoords ? 'Search' : 'Coords'}
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
                placeholder="Enter starting city, area, or landmark..."
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="autopilot-start-lat-input"
                      className="block text-[10px] font-mono text-slate-300 uppercase mb-1"
                    >
                      Latitude *
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
                      Longitude *
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
                <div className="flex justify-end">
                  <button
                    type="button"
                    data-testid="confirm-start-coords-btn"
                    disabled={startResolvingCoords}
                    onClick={() => handleConfirmManualCoordinates('start')}
                    className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono text-[11px] uppercase font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {startResolvingCoords ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Confirm Start</span>
                  </button>
                </div>
              </div>
            )}

            {startLocation && (
              <div
                data-testid="confirmed-start-summary"
                className="mt-1.5 text-[11px] text-slate-300 flex items-center justify-between gap-2 bg-slate-900/60 px-2.5 py-1 rounded border border-slate-800/80"
              >
                <div className="truncate">
                  <span className="font-bold text-emerald-400 mr-1">{startLocation.name}</span>
                  <span className="text-slate-400">{startLocation.address}</span>
                </div>
              </div>
            )}

            {showStartDropdown && startSearchText.trim().length >= 2 && (
              <div
                role="listbox"
                aria-label="Starting location suggestions"
                className="absolute z-30 left-0 right-0 mt-1 bg-[#0D1322] border border-slate-700 rounded-lg shadow-2xl max-h-60 overflow-y-auto"
              >
                {startLoading && (
                  <div className="px-3 py-2 text-xs font-mono text-slate-400 flex items-center gap-2 border-b border-slate-800/60">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    Searching locations...
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
                    No locations found for &ldquo;{startSearchText}&rdquo;.
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
          <div className="lg:col-span-2 flex flex-col items-center justify-center pt-0.5 lg:pt-6">
            <button
              type="button"
              onClick={handleSwapEndpoints}
              disabled={!startLocation || !destination}
              className="w-full lg:w-auto px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
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
                className="text-xs font-mono uppercase tracking-wider text-[#FF5500] font-bold flex items-center gap-1.5"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF5500] inline-block" />
                FINAL DESTINATION
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {routeLoading && (
                  <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Routing...
                  </span>
                )}
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
                  <span>{mapPickMode === 'dest' ? 'Tap Map...' : 'Map'}</span>
                </button>
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
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-[#FF5500]/60'
                  }`}
                >
                  {showDestManualCoords ? 'Search' : 'Coords'}
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
                placeholder="Enter destination city, area, or landmark..."
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="autopilot-dest-lat-input"
                      className="block text-[10px] font-mono text-slate-300 uppercase mb-1"
                    >
                      Latitude *
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
                      placeholder="e.g. 13.0827"
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
                      Longitude *
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
                      placeholder="e.g. 80.2707"
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
                <div className="flex justify-end">
                  <button
                    type="button"
                    data-testid="confirm-dest-coords-btn"
                    disabled={destResolvingCoords}
                    onClick={() => handleConfirmManualCoordinates('dest')}
                    className="px-3 py-1.5 rounded bg-[#FF5500] hover:bg-[#FF5500]/90 text-white font-mono text-[11px] uppercase font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {destResolvingCoords ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Confirm Destination</span>
                  </button>
                </div>
              </div>
            )}

            {destination && (
              <div
                data-testid="confirmed-dest-summary"
                className="mt-1.5 text-[11px] text-slate-300 flex items-center justify-between gap-2 bg-slate-900/60 px-2.5 py-1 rounded border border-slate-800/80"
              >
                <div className="truncate">
                  <span className="font-bold text-[#FF5500] mr-1">{destination.name}</span>
                  <span className="text-slate-400">{destination.address}</span>
                </div>
              </div>
            )}

            {showDestDropdown && destSearchText.trim().length >= 2 && (
              <div
                role="listbox"
                aria-label="Destination location suggestions"
                className="absolute z-30 left-0 right-0 mt-1 bg-[#0D1322] border border-slate-700 rounded-lg shadow-2xl max-h-60 overflow-y-auto"
              >
                {destLoading && (
                  <div className="px-3 py-2 text-xs font-mono text-slate-400 flex items-center gap-2 border-b border-slate-800/60">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF5500]" />
                    Searching locations...
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
                    No locations found for &ldquo;{destSearchText}&rdquo;.
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

        {/* Collapsible Route Options (Stop Interval, Plug Filter, Range Guard) */}
        {showRouteOptions && (
          <div className="mt-4 pt-3.5 border-t border-slate-800/80 grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-center">
            <div className="lg:col-span-4 bg-slate-950/80 border border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                <span className="text-slate-400 uppercase">CHARGING STOP INTERVAL</span>
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
            </div>

            <div className="lg:col-span-4 bg-slate-950/80 border border-slate-800 rounded-lg p-3">
              <div className="text-[10px] font-mono uppercase text-slate-400 mb-1.5">
                PREFERRED CHARGER TYPE
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

            <div className="lg:col-span-4 bg-slate-950/80 border border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-cyan-400 font-bold">
                  RANGE GUARD
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
                  {rangeGuard.enabled ? 'ON' : 'OFF'}
                </button>
              </div>
              {rangeGuard.enabled && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <label className="block text-[9px] font-mono text-slate-400 uppercase">
                      SOC %
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
                      RANGE KM
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
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 2. INTERACTIVE ROUTE MAP                                  */}
      {/* ========================================================= */}
      {(!startLocation || !destination) && (
        <div
          data-testid="awaiting-confirmed-locations-banner"
          className="bg-amber-950/30 border border-amber-500/40 rounded-xl px-4 py-3 text-xs font-mono text-amber-200 flex flex-wrap items-center justify-between gap-2"
        >
          <span>
            Choose your <strong>Starting Location</strong> and <strong>Final Destination</strong> above or tap on the map below.
          </span>
          <div className="flex items-center gap-2">
            {!startLocation && (
              <button
                type="button"
                onClick={() => setMapPickMode('start')}
                className="px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-bold uppercase"
              >
                Set Start on Map
              </button>
            )}
            {!destination && (
              <button
                type="button"
                onClick={() => setMapPickMode('dest')}
                className="px-2.5 py-1 rounded bg-[#FF5500]/20 border border-[#FF5500] text-[#FF5500] font-bold uppercase"
              >
                Set Destination on Map
              </button>
            )}
          </div>
        </div>
      )}

      {planResult && !planResult.valid && (
        <div className="bg-red-950/40 border border-red-500/50 rounded-xl p-3.5 text-xs text-red-200 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{planResult.error}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* 1B. AVAILABLE ROUTES SELECTOR (COMPARE ROUTES & CHARGERS) */}
      {/* ========================================================= */}
      {startLocation && destination && evaluatedRouteOptions.length > 0 && (
        <div
          data-testid="autopilot-multi-route-selector"
          className="bg-[#0B0F19] border border-slate-800 rounded-xl p-4 sm:p-5 shadow-xl space-y-3.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-[#FF5500]" />
                <span className="text-xs sm:text-sm font-mono uppercase tracking-wider font-bold text-white">
                  AVAILABLE ROUTES TO DESTINATION ({evaluatedRouteOptions.length}{' '}
                  {evaluatedRouteOptions.length === 1 ? 'ROUTE' : 'ROUTES'} FOUND)
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                Compare total distance and total chargers on each route below — click any route to select it on the map.
              </p>
            </div>
            {routeLoading && (
              <span className="text-[10px] font-mono text-cyan-300 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Refining highway geometry...
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {evaluatedRouteOptions.map((opt, idx) => {
              const isSelected = activeRouteOption?.id === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`autopilot-route-option-${idx}`}
                  onClick={() => handleSelectRouteOption(opt.id)}
                  className={`text-left rounded-xl p-3.5 border transition-all flex flex-col justify-between gap-3 cursor-pointer ${
                    isSelected
                      ? 'bg-[#FF5500]/12 border-[#FF5500] shadow-lg shadow-[#FF5500]/15 ring-1 ring-[#FF5500]/50'
                      : 'bg-slate-950/90 border-slate-800 hover:border-cyan-400/60 hover:bg-slate-900/80'
                  }`}
                >
                  <div className="space-y-1.5 w-full">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border ${
                          isSelected
                            ? 'bg-[#FF5500] border-[#FF5500] text-black'
                            : 'bg-slate-900 border-slate-700 text-cyan-300'
                        }`}
                      >
                        ROUTE {idx + 1} • {opt.highwayBadge}
                      </span>
                      <span
                        className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded ${
                          isSelected
                            ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300'
                            : 'text-slate-400'
                        }`}
                      >
                        {isSelected ? '✓ SELECTED' : 'SELECT ROUTE'}
                      </span>
                    </div>

                    <div className="text-sm font-bold text-white leading-snug pt-0.5">
                      {opt.shortLabel}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 leading-relaxed">
                      {opt.viaSummary}
                    </div>
                  </div>

                  {/* Total Distance & Total Chargers Metrics */}
                  <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-800/80 w-full">
                    <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-2">
                      <div className="text-[9px] font-mono uppercase text-slate-400">
                        TOTAL DISTANCE
                      </div>
                      <div
                        data-testid={`route-option-${idx}-distance`}
                        className="text-sm font-mono font-bold text-white mt-0.5"
                      >
                        {opt.distanceKm} km
                      </div>
                      {opt.durationMin && (
                        <div className="text-[10px] font-mono text-slate-400">
                          ~{Math.floor(opt.durationMin / 60)}h {opt.durationMin % 60}m
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-2">
                      <div className="text-[9px] font-mono uppercase text-slate-400">
                        TOTAL CHARGERS
                      </div>
                      <div
                        data-testid={`route-option-${idx}-chargers`}
                        className="text-sm font-mono font-bold text-emerald-400 mt-0.5 flex items-center gap-1"
                      >
                        <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>
                          {opt.totalChargersOnRoute} Charger{opt.totalChargersOnRoute === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-cyan-300">
                        {opt.plannedStopsCount} Planned Stop{opt.plannedStopsCount === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <AutoPilotRouteMap
        startLocation={startLocation}
        destination={destination}
        routePolyline={
          planResult && planResult.valid
            ? activeRouteOption && activeRouteOption.polyline.length >= 2
              ? activeRouteOption.polyline
              : routePolyline.length >= 2
              ? routePolyline
              : startLocation && destination
              ? [
                  [startLocation.latitude, startLocation.longitude],
                  [destination.latitude, destination.longitude]
                ]
              : []
            : []
        }
        chargingStops={planResult && planResult.valid ? planResult.chargingStops : []}
        pitStops={planResult && planResult.valid ? planResult.pitStops : []}
        eligibleCorridorChargers={
          planResult && planResult.valid ? planResult.eligibleCorridorChargers : []
        }
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
        routeOptions={evaluatedRouteOptions}
        selectedRouteId={activeRouteOption?.id}
        onSelectRouteOption={handleSelectRouteOption}
      />

      {/* ========================================================= */}
      {/* 3. EASY-TO-UNDERSTAND JOURNEY SUMMARY BELOW THE MAP       */}
      {/* ========================================================= */}
      {planResult && planResult.valid && startLocation && destination && (
        <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-4 sm:p-5 shadow-xl space-y-5">
          {/* Top Journey Header + Primary Google Maps Launch */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 pb-4 border-b border-slate-800">
            <div className="min-w-0">
              <div className="text-xs font-mono uppercase tracking-widest text-emerald-400 font-bold">
                YOUR JOURNEY SUMMARY
              </div>
              <h4 className="text-lg sm:text-xl font-display font-bold text-white mt-0.5 leading-snug">
                {startLocation.name} <span className="text-[#FF5500]">→</span> {destination.name}
              </h4>
              {planResult.chargingStops.length > 0 && (
                <div className="text-xs font-mono text-cyan-300 mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="text-slate-400">Via Auto Pilot Stops:</span>
                  <span>
                    {planResult.chargingStops
                      .map((s, idx) => `Stop #${idx + 1} ${s.station.name}`)
                      .join(' → ')}
                  </span>
                </div>
              )}
            </div>

            {/* 1-Tap Google Maps Full Route Button (Start + All Charging Stops + Destination) */}
            {planResult.navigationStages.length > 0 && (
              <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {planResult.navigationStages.map(stage => (
                    <a
                      key={`nav_stage_${stage.stageNumber}`}
                      href={stage.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`take-off-stage-${stage.stageNumber}-link`}
                      className="w-full sm:w-auto px-4 py-3 rounded-xl bg-[#FF5500] hover:bg-[#FF5500]/90 text-white font-mono text-xs sm:text-sm uppercase tracking-wider font-bold flex items-center justify-center gap-2 no-underline shadow-lg shadow-[#FF5500]/25"
                    >
                      <Navigation className="w-4 h-4" />
                      <span>
                        {planResult.navigationStages.length === 1
                          ? 'Open Route in Google Maps'
                          : `Open Stage ${stage.stageNumber} in Google Maps`}
                      </span>
                      {stage.waypointNames.length > 0 && (
                        <span className="px-2 py-0.5 rounded bg-black/25 text-[11px] font-mono">
                          +{stage.waypointNames.length} Stop{stage.waypointNames.length === 1 ? '' : 's'}
                        </span>
                      )}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ))}
                </div>
                {planResult.chargingStops.length > 0 && (
                  <span className="text-[11px] font-mono text-slate-400">
                    Includes Start, {planResult.chargingStops.length} Charging Stop
                    {planResult.chargingStops.length === 1 ? '' : 's'} &amp; Final Destination
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 4 Simple Key Journey Stats (Including Total Chargers on Selected Route) */}
          {(() => {
            const longestSegment =
              planResult.briefing.segments.length > 0
                ? planResult.briefing.segments.reduce((max, seg) =>
                    seg.distanceKm > max.distanceKm ? seg : max
                  )
                : null;
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
                <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-3 sm:p-4 text-center sm:text-left">
                  <div className="text-[11px] font-mono text-slate-400 uppercase font-semibold">TOTAL DISTANCE</div>
                  <div className="text-lg sm:text-2xl font-mono font-bold text-white mt-1">
                    {planResult.briefing.totalDrivingDistanceKm}{' '}
                    <span className="text-xs text-slate-400">km</span>
                  </div>
                  {activeRouteOption && (
                    <div className="text-[10px] font-mono text-[#FF5500] truncate mt-0.5">
                      {activeRouteOption.shortLabel}
                    </div>
                  )}
                </div>

                <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-3 sm:p-4 text-center sm:text-left">
                  <div className="text-[11px] font-mono text-slate-400 uppercase font-semibold">TOTAL CHARGERS</div>
                  <div className="text-lg sm:text-2xl font-mono font-bold text-emerald-400 mt-1">
                    {planResult.eligibleCorridorChargers.length}{' '}
                    <span className="text-xs text-slate-400">on route</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                    Available along corridor
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-3 sm:p-4 text-center sm:text-left">
                  <div className="text-[11px] font-mono text-slate-400 uppercase font-semibold">LONGEST STRETCH</div>
                  <div className="text-lg sm:text-2xl font-mono font-bold text-amber-400 mt-1">
                    {planResult.briefing.longestGapKm}{' '}
                    <span className="text-xs text-slate-400">km</span>
                  </div>
                  {longestSegment && (
                    <div
                      className="text-[10px] font-mono text-slate-400 truncate mt-0.5"
                      title={`${longestSegment.fromName} → ${longestSegment.toName}`}
                    >
                      {longestSegment.fromName} → {longestSegment.toName}
                    </div>
                  )}
                </div>

                <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-3 sm:p-4 text-center sm:text-left">
                  <div className="text-[11px] font-mono text-slate-400 uppercase font-semibold">PLANNED STOPS</div>
                  <div className="text-lg sm:text-2xl font-mono font-bold text-[#00E5FF] mt-1">
                    {planResult.chargingStops.length}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                    Every ~{targetIntervalKm} km
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Step-by-Step Visual Journey Timeline (Start -> Charging Stops -> Destination) */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-300 font-bold">
                STEP-BY-STEP JOURNEY PLAN
              </span>

              {/* Optional Add Charger / Reset Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {unselectedCorridorChargers.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <select
                      aria-label="Add eligible corridor charger to route"
                      value={manualCorridorChargerToAdd}
                      onChange={e => setManualCorridorChargerToAdd(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-mono text-slate-200 max-w-[210px]"
                    >
                      <option value="">+ Add Stop ({unselectedCorridorChargers.length})...</option>
                      {unselectedCorridorChargers.map(c => (
                        <option key={c.station.id} value={c.station.id}>
                          KM {c.alongRouteKm} — {c.station.name}
                        </option>
                      ))}
                    </select>
                    {manualCorridorChargerToAdd && (
                      <button
                        type="button"
                        onClick={() => handleAddManualStop(manualCorridorChargerToAdd)}
                        className="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 font-mono text-[11px] uppercase font-bold"
                      >
                        Add
                      </button>
                    )}
                  </div>
                )}

                {(manualAddedIds.length > 0 ||
                  removedIds.length > 0 ||
                  Object.keys(replacedStopMap).length > 0) && (
                  <button
                    type="button"
                    onClick={handleResetAutomaticStops}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[10px] uppercase flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Start Point Card */}
            <div className="p-3 rounded-xl bg-emerald-950/15 border border-emerald-500/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                  A
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase text-emerald-400 font-bold">
                    START • 0 KM
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-white truncate">
                    {startLocation.name}
                  </div>
                </div>
              </div>
              {weather.available && weather.originWeather && (
                <span className="text-[11px] font-mono text-slate-300 shrink-0">
                  {weather.originWeather.temperatureC}°C • {weather.originWeather.condition}
                </span>
              )}
            </div>

            {/* Intermediate Charging Stops */}
            {planResult.chargingStops.length === 0 ? (
              <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center gap-3 text-xs text-slate-300">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <span className="font-bold text-white">Direct Ride — No Charging Stops Needed.</span>{' '}
                  <span className="text-slate-400">
                    Total distance is {planResult.briefing.totalDrivingDistanceKm} km.
                  </span>
                </div>
              </div>
            ) : (
              planResult.chargingStops.map(stop => {
                const navUrl = buildChargerNavigationUrl(stop.station);
                const stopSubmitter = resolveChargerSubmitterInfo(stop.station as any);
                const isCommunity =
                  stopSubmitter.isCommunityProvided || stopSubmitter.isUserSubmitted;

                return (
                  <div
                    key={stop.station.id}
                    className={`rounded-xl border p-3.5 sm:p-4 transition-colors ${
                      stop.reached
                        ? 'bg-emerald-950/15 border-emerald-500/40'
                        : 'bg-slate-950/90 border-slate-800'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-mono text-[10px] font-bold">
                            STOP #{stop.order}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200 font-mono text-[10px]">
                            KM {stop.distanceFromStartKm} ({stop.distanceFromPrevStopKm} km leg)
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#FF5500]/15 border border-[#FF5500]/40 text-[#FF5500] font-mono text-[10px] font-bold">
                            {stop.station.chargerType || 'Supernova'} • {stop.station.powerOutputKw} kW
                          </span>
                        </div>

                        <div className="text-sm font-bold text-white truncate">
                          {stop.station.name}
                        </div>
                        <div className="text-xs text-slate-400 line-clamp-1">
                          {stop.station.location}
                        </div>

                        {isCommunity && (
                          <div className="pt-1 flex flex-wrap items-center gap-2 text-[11px] font-mono text-amber-300">
                            <span>Host: {stopSubmitter.submitterName}</span>
                            <a
                              href={stopSubmitter.telHref}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold"
                            >
                              <Phone className="w-3 h-3" />
                              <span>{stopSubmitter.submitterPhone}</span>
                            </a>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <a
                          href={navUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-2 rounded-lg bg-[#FF5500] hover:bg-[#FF5500]/90 text-white font-mono text-xs uppercase font-bold flex items-center gap-1.5 no-underline"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Navigate</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => handleToggleReached(stop.station.id)}
                          className={`px-2.5 py-2 rounded-lg font-mono text-xs uppercase font-bold border flex items-center gap-1 transition-colors ${
                            stop.reached
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                              : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{stop.reached ? 'Reached' : 'Mark Reached'}</span>
                        </button>

                        <button
                          type="button"
                          aria-label={`Remove Stop ${stop.station.name}`}
                          onClick={() => handleRemoveStop(stop.station.id)}
                          className="p-2 rounded-lg bg-slate-900 hover:bg-red-950/50 border border-slate-800 hover:border-red-500/40 text-slate-400 hover:text-red-300"
                          title="Remove stop"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Final Destination Card */}
            <div className="p-3 rounded-xl bg-[#FF5500]/10 border border-[#FF5500]/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-6 h-6 rounded-full bg-[#FF5500]/20 border border-[#FF5500] text-[#FF5500] font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                  B
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase text-[#FF5500] font-bold">
                    FINAL DESTINATION • {planResult.briefing.totalDrivingDistanceKm} KM
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-white truncate">
                    {destination.name}
                  </div>
                </div>
              </div>
              {weather.available && weather.destinationWeather && (
                <span className="text-[11px] font-mono text-slate-300 shrink-0">
                  {weather.destinationWeather.temperatureC}°C • {weather.destinationWeather.condition}
                </span>
              )}
            </div>
          </div>

          {/* Alerts if Sparse Network or Range Guard Warning */}
          {(planResult.briefing.networkSparseWarning ||
            (planResult.briefing.rangeGuardEvaluation.enabled &&
              planResult.briefing.rangeGuardEvaluation.warnings.length > 0)) && (
            <div className="space-y-2 pt-1">
              {planResult.briefing.networkSparseWarning && (
                <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{planResult.briefing.networkSparseWarning}</span>
                </div>
              )}
              {planResult.briefing.rangeGuardEvaluation.enabled &&
                planResult.briefing.rangeGuardEvaluation.warnings.map((w, idx) => (
                  <div
                    key={`rg_w_${idx}`}
                    className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-200 flex items-start gap-2"
                  >
                    <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{w.message}</span>
                  </div>
                ))}
            </div>
          )}

          {/* Optional Collapsible Drawer for Pit Stops & Saving Route */}
          <div className="pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setShowMoreTools(prev => !prev)}
              className="w-full py-2 px-3 rounded-lg bg-slate-900/70 hover:bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 flex items-center justify-between"
            >
              <span className="flex items-center gap-2 font-bold uppercase">
                <Bookmark className="w-3.5 h-3.5 text-[#FF5500]" />
                Save Route &amp; Optional Pit Stops ({savedMissions.length} Saved)
              </span>
              <span className="text-[10px] uppercase text-[#FF5500]">
                {showMoreTools ? 'Hide ▲' : 'Expand ▼'}
              </span>
            </button>

            {showMoreTools && (
              <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
                {/* Save Route */}
                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-mono uppercase text-[#FF5500] font-bold">
                    Save or Load Journey
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={missionNameInput}
                      onChange={e => setMissionNameInput(e.target.value)}
                      placeholder="Route Name (e.g., Weekend Ride to Mysuru)"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                    />
                    <button
                      type="button"
                      disabled={savingMission}
                      onClick={handleSaveMission}
                      className="px-4 py-2 rounded-lg bg-[#FF5500] hover:bg-[#FF5500]/90 text-white font-mono text-xs uppercase font-bold shrink-0"
                    >
                      {savingMission ? 'Saving...' : 'Save Route'}
                    </button>
                  </div>
                  {saveFeedback && (
                    <div className="text-xs font-mono text-emerald-400">{saveFeedback}</div>
                  )}

                  {savedMissions.length > 0 && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pt-1">
                      {savedMissions.map(m => (
                        <div
                          key={m.id}
                          className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate">
                              {m.missionName}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {m.startLocation.name} → {m.destination.name} ({m.plannedRouteDistanceKm} km)
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleLoadSavedMission(m)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-white"
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

                {/* Optional Pit Stops */}
                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase text-violet-400 font-bold">
                      Optional Pit Stops ({planResult.pitStops.length})
                    </span>
                    <div className="flex gap-1">
                      {['ALL', 'Restaurant', 'Cafe'].map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setPitStopCategoryFilter(cat)}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${
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

                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {availableCorridorPitStops.slice(0, 6).map(place => {
                      const alreadyAdded = selectedPitStops.some(p => p.id === place.id);
                      return (
                        <div
                          key={`disc_pit_${place.id}`}
                          className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate">{place.name}</div>
                            <div className="text-[10px] text-slate-400 truncate">
                              KM {place.distanceFromStartKm} • {place.category}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={alreadyAdded}
                            onClick={() => handleAddPitStop(place)}
                            className="px-2 py-1 rounded bg-violet-500/20 border border-violet-500/40 text-violet-200 font-mono text-[10px] uppercase font-bold shrink-0"
                          >
                            {alreadyAdded ? 'Added' : '+ Add'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
