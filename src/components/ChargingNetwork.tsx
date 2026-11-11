import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Zap,
  Plus,
  MapPin,
  ExternalLink,
  CheckCircle2,
  Search,
  FileText,
  Save,
  Trash2,
  Edit3,
  Map as MapIcon,
  List,
  AlertCircle,
  ShieldCheck,
  X,
  Navigation as NavIcon,
  Compass,
  MessageSquarePlus,
  HardDrive,
  Download,
  RefreshCw,
  Wifi,
  WifiOff,
  Phone,
  User as UserIcon,
  Calendar,
  Clock,
  IndianRupee,
  Bell,
  BarChart3,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { ChargingStation, ChargerPlugType } from '../types';
import { BackButton } from './BackButton';
import {
  ChargerSource,
  VALID_CHARGER_SOURCES,
  VALID_CHARGER_PLUG_TYPES,
  CHARGER_PLUG_TYPE_SPECS,
  validateChargingPlugSubmission,
  matchesChargingStationFilter,
  isChargerAddedInLast24Hours,
  calculateChargingNetworkComposition,
  type NetworkCompositionResult,
  isPubliclyPublishedCharger,
  canModifyChargerRecord,
  isAdminOrOwnerAccount,
  buildChargerNavigationUrl,
  buildStationCategories,
  resolveChargerSubmitterInfo,
  resolveCommunityChargerTerms,
  calculateChargerReservationCost,
  validateAndCreateChargerReservation,
  canManageChargerReservation,
  updateChargerReservationStatus,
  buildChargerReservationOwnerNotification,
  parseMinimalChargingStationsDatabase,
  formatMinimalChargerType,
  searchAndFilterChargingStations,
  type SkippedMinimalStationRecord,
  type ChargerReservation,
  type CommunityChargerCostUnit,
  type ChargerReservationStatus,
  type ChargerOwnerReservationNotification
} from '../utils/rules';
import {
  evaluateChargerIntelligence,
  VALID_CHARGER_REPORT_CATEGORIES,
  type ChargerCommunityReport,
  type ChargerReportCategory
} from '../utils/autopilot';
import {
  CACHE_KEYS,
  saveToCache,
  loadFromCache,
  loadFromCacheAsync,
  enqueueOfflineAction,
  reconcileCollectionWithCache,
  recordDeletedId,
  getDeletedIds,
  OFFLINE_FALLBACK_CHARGING_STATIONS,
  OFFLINE_FALLBACK_CHARGER_REPORTS,
  OFFLINE_SYNC_EVENT,
  DATA_UPDATED_EVENT,
  getSessionAuthHeaders,
  getDeviceOfflineStorageStatus,
  downloadChargingNetworkOfflinePack,
  syncChargingNetworkOnReconnect,
  type DeviceOfflineStorageStatus
} from '../utils/telemetryCache';
import { ChargingIndiaMap } from './ChargingIndiaMap';
import { ChargerLocationPickerMap } from './ChargerLocationPickerMap';
import { AutoPilotPlanner } from './AutoPilotPlanner';
import { AvionicsToggleTransition, AnimatePresence, motion } from './AvionicsTransition';

const FILTER_OPTIONS = [
  { id: 'ALL', label: 'ALL' },
  { id: 'LAST_24H', label: 'NEW (LAST 24H)' },
  { id: 'SUPERNOVA', label: 'SUPERNOVA' },
  { id: 'BOLT_TYPE_6', label: 'BOLT TYPE 6' },
  { id: 'Community Provided Chargers', label: 'Community Chargers' },
  { id: '3rd Party Station', label: '3rd Party Station' }
];

interface ChargingNetworkProps {
  initialMode?: 'map' | 'autopilot';
}

export const ChargingNetwork: React.FC<ChargingNetworkProps> = ({ initialMode }) => {
  const { currentUser } = useAuth();
  const { playTacticalClick, playChime, reducedMotion } = useAudio();

  const [stations, setStations] = useState<ChargingStation[]>(() => {
    const cached = loadFromCache<ChargingStation[]>(
      CACHE_KEYS.CHARGING,
      OFFLINE_FALLBACK_CHARGING_STATIONS
    );
    return cached.filter(s => isPubliclyPublishedCharger(s));
  });
  const [allStations, setAllStations] = useState<ChargingStation[]>(() =>
    loadFromCache<ChargingStation[]>(CACHE_KEYS.CHARGING, OFFLINE_FALLBACK_CHARGING_STATIONS)
  );
  const [chargerReports, setChargerReports] = useState<ChargerCommunityReport[]>(() =>
    loadFromCache<ChargerCommunityReport[]>(
      CACHE_KEYS.CHARGER_REPORTS,
      OFFLINE_FALLBACK_CHARGER_REPORTS
    )
  );
  const [selectedStation, setSelectedStation] = useState<ChargingStation | null>(null);
  const [chargingPageMode, setChargingPageMode] = useState<'map' | 'autopilot'>(() => {
    if (initialMode) return initialMode;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autopilot') === '1' || params.get('mode') === 'autopilot') {
        return 'autopilot';
      }
    }
    return 'map';
  });

  useEffect(() => {
    if (initialMode) {
      setChargingPageMode(initialMode);
    }
  }, [initialMode]);

  const [activeViewTab, setActiveViewTab] = useState<'map' | 'list'>('map');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isNetworkOffline, setIsNetworkOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [storageStatus, setStorageStatus] = useState<DeviceOfflineStorageStatus | null>(null);
  const [savingOfflinePack, setSavingOfflinePack] = useState<boolean>(false);
  const [offlinePackProgressLabel, setOfflinePackProgressLabel] = useState<string | null>(null);
  const [syncingNow, setSyncingNow] = useState<boolean>(false);

  // Community Report inline state on Charging Map selected station
  const [showMapStationReportForm, setShowMapStationReportForm] = useState(false);
  const [mapReportCategory, setMapReportCategory] = useState<ChargerReportCategory>('WORKING');
  const [mapReportComment, setMapReportComment] = useState('');
  const [submittingMapReport, setSubmittingMapReport] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStationId, setEditingStationId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [submissionNotice, setSubmissionNotice] = useState<string | null>(null);
  const [isBreakdownSyncExpanded, setIsBreakdownSyncExpanded] = useState<boolean>(false);
  const [isAllChargersExpanded, setIsAllChargersExpanded] = useState<boolean>(false);
  const [isSkippedDrawerOpen, setIsSkippedDrawerOpen] = useState<boolean>(false);
  const [skippedMinimalRecords, setSkippedMinimalRecords] = useState<SkippedMinimalStationRecord[]>([]);
  const [minimalDbStats, setMinimalDbStats] = useState<{
    totalRecordsLoaded: number;
    recordsWithValidCoordinatesCount: number;
    validMapMarkersCount: number;
    skippedRecordsCount: number;
  }>({
    totalRecordsLoaded: 182,
    recordsWithValidCoordinatesCount: 29,
    validMapMarkersCount: 76,
    skippedRecordsCount: 153
  });
  const minimalValidStationsRef = useRef<ChargingStation[]>([]);

  const composition: NetworkCompositionResult = useMemo(
    () => calculateChargingNetworkComposition(stations),
    [stations]
  );

  // Long-Ride Planning Info State (persistent, admin-configurable, never fabricated)
  const [longRidePlanningText, setLongRidePlanningText] = useState<string>(() =>
    loadFromCache<string>(CACHE_KEYS.CHARGING_PLANNING, '')
  );
  const [planningDraft, setPlanningDraft] = useState<string>(() =>
    loadFromCache<string>(CACHE_KEYS.CHARGING_PLANNING, '')
  );
  const [savingPlanning, setSavingPlanning] = useState<boolean>(false);
  const [planningSavedFeedback, setPlanningSavedFeedback] = useState<string | null>(null);

  // Form State for + Submit Charging Plug / Edit Charger
  // NOTE: chargerType starts empty ('') on new submission so selection is strictly compulsory
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [autoFilledName, setAutoFilledName] = useState('');
  const [chargerType, setChargerType] = useState<ChargerPlugType | ''>('');
  const [uvChargingLink, setUvChargingLink] = useState('');
  const [chargerDetails, setChargerDetails] = useState('');
  const [vehicleCompatibility, setVehicleCompatibility] = useState(
    'F77, X47'
  );
  const [chargerSource, setChargerSource] = useState<ChargerSource>('Community Provided Charger');
  const [powerOutputKw, setPowerOutputKw] = useState('3.3');
  const [accessConditions, setAccessConditions] =
    useState<ChargingStation['accessConditions']>('Public 24/7');
  const [pricing, setPricing] = useState('Free / Commercial');
  const [pricingType, setPricingType] = useState<'Free' | 'Charged'>('Free');
  const [chargingCostAmount, setChargingCostAmount] = useState('15');
  const [chargingCostUnit, setChargingCostUnit] = useState<CommunityChargerCostUnit>('per kWh');
  const [availabilityStartTime, setAvailabilityStartTime] = useState('06:00');
  const [availabilityEndTime, setAvailabilityEndTime] = useState('22:00');
  const [availabilityDays, setAvailabilityDays] = useState('Daily');
  const [userNotes, setUserNotes] = useState('');
  const [submitterName, setSubmitterName] = useState('');
  const [submitterPhone, setSubmitterPhone] = useState('');

  // Community Charger Reservation System state
  const [resDate, setResDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [resStartTime, setResStartTime] = useState<string>('10:00');
  const [resDurationMinutes, setResDurationMinutes] = useState<string>('60');
  const [resRiderName, setResRiderName] = useState<string>(
    () => currentUser?.fullName || 'Abinav Thejas K'
  );
  const [resRiderPhone, setResRiderPhone] = useState<string>(
    () => currentUser?.mobile || '+91 98450 11099'
  );
  const [resBikeModel, setResBikeModel] = useState<string>(
    () => currentUser?.motorcycleModel || 'F77'
  );
  const [resNotes, setResNotes] = useState<string>('');
  const [resError, setResError] = useState<string | null>(null);
  const [resSuccess, setResSuccess] = useState<string | null>(null);
  const [lastOwnerNotification, setLastOwnerNotification] =
    useState<ChargerOwnerReservationNotification | null>(null);
  const [submittingReservation, setSubmittingReservation] = useState<boolean>(false);
  const [ownerNoteDrafts, setOwnerNoteDrafts] = useState<Record<string, string>>({});
  const [updatingResId, setUpdatingResId] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) {
      setResRiderName(currentUser.fullName || 'Abinav Thejas K');
      setResRiderPhone(currentUser.mobile || '+91 98450 11099');
      setResBikeModel(currentUser.motorcycleModel || 'F77');
      if (!editingStationId) {
        setSubmitterName(currentUser.fullName || '');
        setSubmitterPhone(currentUser.mobile || '');
      }
    }
  }, [currentUser, editingStationId]);

  useEffect(() => {
    setResError(null);
    setResSuccess(null);
    setLastOwnerNotification(null);
    if (selectedStation) {
      const terms = resolveCommunityChargerTerms(selectedStation);
      if (terms.availabilityStartTime && terms.availabilityStartTime > '10:00') {
        setResStartTime(terms.availabilityStartTime);
      } else {
        setResStartTime('10:00');
      }
    }
  }, [selectedStation?.id]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const isAdmin = isAdminOrOwnerAccount(currentUser);

  const mergeWithMinimalStations = useCallback((list: ChargingStation[]): ChargingStation[] => {
    const deletedSet = new Set<string>(getDeletedIds());
    const map = new Map<string, ChargingStation>();
    for (const s of list) {
      if (s && s.id && !deletedSet.has(s.id)) {
        map.set(s.id, s);
      }
    }
    for (const ms of minimalValidStationsRef.current) {
      if (ms && ms.id && !map.has(ms.id) && !deletedSet.has(ms.id)) {
        map.set(ms.id, ms);
      }
    }
    return Array.from(map.values()).filter(
      s => s.approvalStatus !== 'deleted' && !deletedSet.has(s.id)
    );
  }, []);

  const applyStationPayload = useCallback(
    (
      loadedPublic: ChargingStation[],
      loadedAll?: ChargingStation[],
      planningText?: string,
      loadedReports?: ChargerCommunityReport[]
    ) => {
      const reconciled = reconcileCollectionWithCache<ChargingStation>(
        CACHE_KEYS.CHARGING,
        loadedAll || loadedPublic,
        { appendMissing: true }
      ).filter(s => s.approvalStatus !== 'deleted');
      const mergedAll = mergeWithMinimalStations(reconciled);
      const pub = mergedAll.filter(s => isPubliclyPublishedCharger(s));
      setStations(pub);
      setAllStations(mergedAll);
      saveToCache(CACHE_KEYS.CHARGING, mergedAll);
      if (Array.isArray(loadedReports)) {
        const mergedReports = reconcileCollectionWithCache<ChargerCommunityReport>(
          CACHE_KEYS.CHARGER_REPORTS,
          loadedReports
        );
        setChargerReports(mergedReports);
        saveToCache(CACHE_KEYS.CHARGER_REPORTS, mergedReports);
      }
      setLastSyncedAt(new Date().toLocaleTimeString());

      setSelectedStation(prev => {
        if (prev) {
          const updatedMatch = mergedAll.find(s => s.id === prev.id);
          if (updatedMatch) return updatedMatch;
        }
        return null;
      });

      if (typeof planningText === 'string') {
        const cachedPlanning = loadFromCache<string>(CACHE_KEYS.CHARGING_PLANNING, '');
        const resolvedPlanning = planningText || cachedPlanning || '';
        setLongRidePlanningText(resolvedPlanning);
        saveToCache(CACHE_KEYS.CHARGING_PLANNING, resolvedPlanning);
      }
    },
    [mergeWithMinimalStations]
  );

  // Load /data/charging_stations_minimal.json directly on mount so all 182 records & 76 valid markers are guaranteed present
  useEffect(() => {
    let active = true;
    async function loadMinimalChargingDatabaseJson() {
      try {
        const res = await fetch('/data/charging_stations_minimal.json');
        if (!res.ok) return;
        const rawJson = await res.json();
        if (!active || !Array.isArray(rawJson)) return;
        const parsedDb = parseMinimalChargingStationsDatabase(rawJson);
        minimalValidStationsRef.current = parsedDb.validStations as unknown as ChargingStation[];
        setSkippedMinimalRecords(parsedDb.skippedRecords);
        setMinimalDbStats({
          totalRecordsLoaded: parsedDb.totalRecordsLoaded,
          recordsWithValidCoordinatesCount: parsedDb.recordsWithValidCoordinatesCount,
          validMapMarkersCount: parsedDb.validMapMarkersCount,
          skippedRecordsCount: parsedDb.skippedRecordsCount
        });
        setAllStations(prev => {
          const merged = mergeWithMinimalStations(prev);
          saveToCache(CACHE_KEYS.CHARGING, merged, { silent: true });
          setStations(merged.filter(s => isPubliclyPublishedCharger(s)));
          return merged;
        });
      } catch {
        // Ignore if fetch fails offline
      }
    }
    void loadMinimalChargingDatabaseJson();
    return () => {
      active = false;
    };
  }, [mergeWithMinimalStations]);

  const fetchStationsAndPlanning = useCallback(async () => {
    try {
      const res = await fetch('/api/charging');
      if (res.ok) {
        const data = await res.json();
        const loadedStations: ChargingStation[] = data.stations || [];
        const loadedAll: ChargingStation[] = data.allStations || loadedStations;
        if (data.minimalDatabaseStats) {
          setMinimalDbStats(data.minimalDatabaseStats);
        }
        if (Array.isArray(data.skippedMinimalRecords) && data.skippedMinimalRecords.length > 0) {
          setSkippedMinimalRecords(data.skippedMinimalRecords);
        }
        const configuredText =
          typeof data.longRidePlanningText === 'string' ? data.longRidePlanningText : '';
        applyStationPayload(
          loadedStations,
          loadedAll,
          configuredText,
          Array.isArray(data.chargerReports) ? data.chargerReports : undefined
        );
        setPlanningDraft(prev => (prev === '' ? configuredText : prev));
      }
    } catch (err) {
      const cached = mergeWithMinimalStations(
        loadFromCache<ChargingStation[]>(
          CACHE_KEYS.CHARGING,
          OFFLINE_FALLBACK_CHARGING_STATIONS
        )
      );
      if (cached.length > 0) {
        setAllStations(cached);
        setStations(cached.filter(s => isPubliclyPublishedCharger(s)));
      }
      const cachedReports = loadFromCache<ChargerCommunityReport[]>(
        CACHE_KEYS.CHARGER_REPORTS,
        OFFLINE_FALLBACK_CHARGER_REPORTS
      );
      if (cachedReports.length > 0) {
        setChargerReports(cachedReports);
      }
    }
  }, [applyStationPayload, mergeWithMinimalStations]);

  const refreshDeviceStorageStatus = useCallback(async () => {
    const status = await getDeviceOfflineStorageStatus();
    setStorageStatus(status);
  }, []);

  // Hydrate from IndexedDB phone storage on mount + listen for queue/data updates
  useEffect(() => {
    let active = true;
    async function hydratePhoneStorage() {
      const [idbStations, idbReports] = await Promise.all([
        loadFromCacheAsync<ChargingStation[]>(CACHE_KEYS.CHARGING),
        loadFromCacheAsync<ChargerCommunityReport[]>(CACHE_KEYS.CHARGER_REPORTS)
      ]);
      if (!active) return;
      if (idbStations && Array.isArray(idbStations.data) && idbStations.data.length > 0) {
        const merged = mergeWithMinimalStations(idbStations.data);
        setAllStations(merged);
        setStations(merged.filter(s => isPubliclyPublishedCharger(s)));
      } else {
        const baseline = mergeWithMinimalStations(OFFLINE_FALLBACK_CHARGING_STATIONS);
        saveToCache(CACHE_KEYS.CHARGING, baseline, { silent: true });
      }
      if (idbReports && Array.isArray(idbReports.data) && idbReports.data.length > 0) {
        setChargerReports(idbReports.data);
      } else {
        saveToCache(CACHE_KEYS.CHARGER_REPORTS, OFFLINE_FALLBACK_CHARGER_REPORTS, { silent: true });
      }
      await refreshDeviceStorageStatus();
    }
    void hydratePhoneStorage();

    const handleStorageEvents = () => {
      void refreshDeviceStorageStatus();
    };
    window.addEventListener(OFFLINE_SYNC_EVENT, handleStorageEvents);
    window.addEventListener(DATA_UPDATED_EVENT, handleStorageEvents);
    return () => {
      active = false;
      window.removeEventListener(OFFLINE_SYNC_EVENT, handleStorageEvents);
      window.removeEventListener(DATA_UPDATED_EVENT, handleStorageEvents);
    };
  }, [refreshDeviceStorageStatus, mergeWithMinimalStations]);

  const handleDownloadOfflinePack = async () => {
    playTacticalClick();
    setSavingOfflinePack(true);
    setOfflinePackProgressLabel('Initializing phone storage pack...');
    try {
      const updatedStatus = await downloadChargingNetworkOfflinePack((label, _pct) => {
        setOfflinePackProgressLabel(label);
      });
      setStorageStatus(updatedStatus);
      const cachedAll = loadFromCache<ChargingStation[]>(
        CACHE_KEYS.CHARGING,
        OFFLINE_FALLBACK_CHARGING_STATIONS
      );
      setAllStations(cachedAll);
      setStations(cachedAll.filter(s => isPubliclyPublishedCharger(s)));
      playChime();
      setSubmissionNotice(
        `Saved ${updatedStatus.savedChargersCount} chargers, ${updatedStatus.savedReportsCount} reports, ${updatedStatus.savedRoutesCount} Auto Pilot corridors, and ${updatedStatus.cachedTilesCount} map tiles to phone storage for offline use.`
      );
      setTimeout(() => setSubmissionNotice(null), 6000);
    } finally {
      setSavingOfflinePack(false);
      setOfflinePackProgressLabel(null);
    }
  };

  const handleManualSyncNow = async () => {
    playTacticalClick();
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSubmissionNotice(
        'Device is currently offline. All chargers, routes, and edits are saved in your phone storage and will automatically sync as soon as you reconnect online.'
      );
      setTimeout(() => setSubmissionNotice(null), 5000);
      return;
    }
    setSyncingNow(true);
    try {
      const syncRes = await syncChargingNetworkOnReconnect();
      await fetchStationsAndPlanning();
      await refreshDeviceStorageStatus();
      playChime();
      setLastSyncedAt(syncRes.updatedAt);
      setSubmissionNotice(
        syncRes.syncedQueueCount > 0
          ? `Synchronized ${syncRes.syncedQueueCount} offline change(s) and updated ${syncRes.chargersCount} chargers in phone storage.`
          : `Phone storage is up to date with live server (${syncRes.chargersCount} chargers, ${syncRes.reportsCount} community reports).`
      );
      setTimeout(() => setSubmissionNotice(null), 5000);
    } finally {
      setSyncingNow(false);
    }
  };

  // Initial load + Real-time SSE stream subscription + automatic fallback polling when SSE is disconnected
  useEffect(() => {
    fetchStationsAndPlanning();

    let eventSource: EventSource | null = null;
    let sseConnected = false;

    if (typeof window !== 'undefined' && 'EventSource' in window) {
      try {
        eventSource = new EventSource('/api/charging/stream');
        eventSource.onopen = () => {
          sseConnected = true;
        };
        eventSource.onmessage = event => {
          sseConnected = true;
          try {
            const payload = JSON.parse(event.data);
            if (payload && Array.isArray(payload.stations)) {
              applyStationPayload(
                payload.stations,
                payload.allStations,
                payload.longRidePlanningText,
                Array.isArray(payload.chargerReports) ? payload.chargerReports : undefined
              );
            }
          } catch {
            // Ignore malformed keep-alive frame
          }
        };
        eventSource.onerror = () => {
          const wasConnected = sseConnected;
          sseConnected = false;
          if (wasConnected) {
            // Immediately fetch fresh state on SSE disconnect so the map is never left stale
            void fetchStationsAndPlanning();
          }
        };
      } catch {
        sseConnected = false;
      }
    }

    // Only poll when SSE is unavailable or not in OPEN state
    const pollInterval = setInterval(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const isStreamHealthy =
        sseConnected &&
        eventSource !== null &&
        typeof EventSource !== 'undefined' &&
        eventSource.readyState === EventSource.OPEN;
      if (!isStreamHealthy) {
        void fetchStationsAndPlanning();
      }
    }, 8000);

    const handleOnline = async () => {
      setIsNetworkOffline(false);
      const syncRes = await syncChargingNetworkOnReconnect();
      await fetchStationsAndPlanning();
      await refreshDeviceStorageStatus();
      setSubmissionNotice(
        syncRes.syncedQueueCount > 0
          ? `Online connection restored — synced ${syncRes.syncedQueueCount} offline change(s) and updated phone storage.`
          : 'Online connection restored — Charging Network phone storage updated with latest live telemetry.'
      );
      setTimeout(() => setSubmissionNotice(null), 5000);
    };

    const handleOffline = () => {
      setIsNetworkOffline(true);
      void refreshDeviceStorageStatus();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      clearInterval(pollInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchStationsAndPlanning, applyStationPayload, refreshDeviceStorageStatus]);

  const resetForm = () => {
    setEditingStationId(null);
    setName('');
    setAutoFilledName('');
    setLocation('');
    setLatitude('');
    setLongitude('');
    setChargerType('');
    setUvChargingLink('');
    setChargerDetails('');
    setVehicleCompatibility('F77 MACH 2, F77 Recon, F77 Original');
    setChargerSource('Community Provided Charger');
    setPowerOutputKw('3.3');
    setAccessConditions('Public 24/7');
    setPricing('Free / Commercial');
    setPricingType('Free');
    setChargingCostAmount('15');
    setChargingCostUnit('per kWh');
    setAvailabilityStartTime('06:00');
    setAvailabilityEndTime('22:00');
    setAvailabilityDays('Daily');
    setUserNotes('');
    setSubmitterName(currentUser?.fullName || '');
    setSubmitterPhone(currentUser?.mobile || '');
    setFormErrors({});
  };

  const handleOpenAddModal = () => {
    playTacticalClick();
    resetForm();
    setShowAddModal(true);
  };

  const handleOpenEditModal = (station: ChargingStation) => {
    if (!canModifyChargerRecord(station, currentUser)) return;
    playTacticalClick();
    const submitterInfo = resolveChargerSubmitterInfo(station);
    const commTerms = resolveCommunityChargerTerms(station);
    const hasSpaceCategory =
      Array.isArray(station.categories) &&
      station.categories.some(c => /space\s*station/i.test(String(c || '')));
    const resolvedInitialSource: ChargerSource =
      station.chargerSource === 'UV Space Station' || hasSpaceCategory
        ? 'UV Space Station'
        : station.chargerSource === 'Supernova' || station.isSupernova
        ? 'Supernova'
        : station.chargerSource === '3rd Party Station'
        ? '3rd Party Station'
        : station.chargerSource || 'Community Provided Charger';
    const rawStationPricing = station.pricing || 'Free / Commercial';
    const cleanedInitialPricing =
      resolvedInitialSource !== 'Community Provided Charger' &&
      /community charger|community host|prior reservation/i.test(rawStationPricing)
        ? 'Free / Commercial Standard'
        : rawStationPricing;

    setEditingStationId(station.id);
    setName(station.name);
    setLocation(station.location);
    setLatitude(String(station.latitude));
    setLongitude(String(station.longitude));
    setChargerType(station.chargerType || (station.isSupernova ? 'Supernova' : 'Socket'));
    setUvChargingLink(station.uvChargingLink || '');
    setChargerDetails(station.chargerDetails || '');
    setVehicleCompatibility(
      station.vehicleCompatibility || 'F77 MACH 2, F77 Recon, F77 Original'
    );
    setChargerSource(resolvedInitialSource);
    setPowerOutputKw(String(station.powerOutputKw));
    setAccessConditions(station.accessConditions);
    setPricing(cleanedInitialPricing);
    setPricingType(commTerms.pricingType);
    setChargingCostAmount(String(commTerms.chargingCostAmount || 15));
    setChargingCostUnit(commTerms.chargingCostUnit);
    setAvailabilityStartTime(commTerms.availabilityStartTime);
    setAvailabilityEndTime(commTerms.availabilityEndTime);
    setAvailabilityDays(commTerms.availabilityDays);
    setUserNotes(station.userNotes || '');
    setSubmitterName(station.reportedBy || submitterInfo.submitterName || currentUser?.fullName || '');
    setSubmitterPhone(station.submittedByPhone || submitterInfo.submitterPhone || currentUser?.mobile || '');
    setFormErrors({});
    setShowAddModal(true);
  };

  const handleChargerTypeChange = (newType: ChargerPlugType | '') => {
    setChargerType(newType);
    setFormErrors(prev => {
      const next = { ...prev };
      delete next.chargerType;
      delete next.uvChargingLink;
      delete next.chargerDetails;
      return next;
    });

    if (newType === 'Supernova') {
      if (chargerSource !== 'UV Space Station') {
        setChargerSource('Supernova');
      }
      setPowerOutputKw('30');
    } else if (newType === 'Type 6') {
      setPowerOutputKw('6.0');
    } else if (newType === 'Type 2') {
      setPowerOutputKw('7.2');
    } else if (newType === 'Socket') {
      setPowerOutputKw('3.3');
    }
  };

  const handleSubmitStation = async (e: React.FormEvent) => {
    e.preventDefault();
    playTacticalClick();

    // Client-side validation using shared pure rules engine
    const validation = validateChargingPlugSubmission({
      name,
      location,
      chargerType,
      uvChargingLink,
      chargerDetails,
      latitude,
      longitude,
      vehicleCompatibility
    });

    if (!validation.valid || !validation.chargerType || !validation.coordinates) {
      setFormErrors(validation.errors);
      return;
    }

    if (
      chargerSource === 'Community Provided Charger' &&
      pricingType === 'Charged' &&
      (!chargingCostAmount.trim() || Number(chargingCostAmount) <= 0)
    ) {
      setFormErrors({
        general: 'Please enter a valid cost of charging (₹) for your Charged community charger.'
      });
      return;
    }

    setFormErrors({});
    const spec = CHARGER_PLUG_TYPE_SPECS[validation.chargerType];
    const resolvedSource: ChargerSource =
      validation.chargerType === 'Supernova' &&
      chargerSource !== 'UV Space Station' &&
      chargerSource !== 'Community Provided Charger'
        ? 'Supernova'
        : chargerSource;

    const isCommunitySource = resolvedSource === 'Community Provided Charger';
    const existingStation = editingStationId
      ? allStations.find(s => s.id === editingStationId)
      : undefined;
    const syncedCategories = buildStationCategories(
      validation.chargerType,
      resolvedSource,
      existingStation?.categories
    );

    const availText = isCommunitySource
      ? availabilityDays === '24/7 Anytime'
        ? '24/7 Anytime (Prior Reservation Required)'
        : `${availabilityStartTime || '06:00'} – ${availabilityEndTime || '22:00'} (${availabilityDays || 'Daily'})`
      : accessConditions || 'Public 24/7';

    const numericCost =
      isCommunitySource && pricingType === 'Charged'
        ? Math.max(1, Number(chargingCostAmount) || 15)
        : 0;
    const cleanedNonCommunityPricing =
      !pricing || /community charger|community host|prior reservation/i.test(pricing)
        ? 'Free / Commercial Standard'
        : pricing;
    const computedPricing = isCommunitySource
      ? pricingType === 'Charged'
        ? `Charged • ₹${numericCost} ${chargingCostUnit} (${availText})`
        : `Free Community Charger (${availText})`
      : cleanedNonCommunityPricing;

    const clientRequestId = `chg_req_${Date.now()}`;
    const payload = {
      name: name.trim(),
      location: location.trim(),
      latitude: validation.coordinates.latitude,
      longitude: validation.coordinates.longitude,
      chargerType: validation.chargerType,
      uvChargingLink: validation.sanitizedUvLink || undefined,
      chargerDetails: validation.sanitizedChargerDetails || spec.requirementSummary,
      vehicleCompatibility: vehicleCompatibility.trim(),
      chargerSource: resolvedSource,
      categories: syncedCategories,
      isSupernova: validation.chargerType === 'Supernova' || resolvedSource === 'Supernova',
      isCommunityReported: isCommunitySource,
      powerOutputKw: Number(powerOutputKw) || 3.3,
      connectorTypes: [spec.defaultConnectorLabel],
      accessConditions,
      pricingType: isCommunitySource ? pricingType : 'Free',
      chargingCostAmount: numericCost,
      chargingCostUnit: chargingCostUnit,
      availabilityStartTime: availabilityStartTime || '06:00',
      availabilityEndTime: availabilityEndTime || '22:00',
      availabilityDays: availabilityDays || 'Daily',
      availabilityTimeText: availText,
      requiresReservation: isCommunitySource,
      pricing: computedPricing,
      userNotes: userNotes.trim(),
      reportedBy: submitterName.trim() || currentUser?.fullName || 'Community Member',
      submittedByPhone: isCommunitySource
        ? submitterPhone.trim() || currentUser?.mobile || '+91 98450 11099'
        : undefined,
      userId: currentUser?.id,
      clientRequestId
    };

    try {
      const endpoint = editingStationId
        ? `/api/charging/${editingStationId}`
        : '/api/charging';
      const method = editingStationId ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-client-request-id': clientRequestId,
          ...getSessionAuthHeaders(),
          ...(currentUser?.id ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.errors) {
          setFormErrors(data.errors);
        } else {
          setFormErrors({ general: data.error || 'Submission failed.' });
        }
        return;
      }

      playChime();
      setShowAddModal(false);
      resetForm();
      setSearchQuery('');
      setFilterType('ALL');

      if (data.station) {
        const nextAll = editingStationId
          ? allStations.map(s => (s.id === data.station.id ? data.station : s))
          : [...allStations.filter(s => s.id !== data.station.id), data.station];
        setAllStations(nextAll);
        setStations(nextAll.filter(s => isPubliclyPublishedCharger(s)));
        saveToCache(CACHE_KEYS.CHARGING, nextAll);
      }

      if (data.station) {
        if (isPubliclyPublishedCharger(data.station)) {
          setSelectedStation(data.station);
          setSubmissionNotice(
            editingStationId
              ? `Updated "${data.station.name}" on the live Charging Map.`
              : `Published "${data.station.name}" (${data.station.chargerType}) to the live Charging Map.`
          );
        } else {
          setSubmissionNotice(
            `Submitted "${data.station.name}" (${data.station.chargerType}) for administrator approval. It will appear on the public map once approved.`
          );
        }
        setTimeout(() => setSubmissionNotice(null), 6000);
      }
    } catch (err) {
      const endpoint = editingStationId
        ? `/api/charging/${editingStationId}`
        : '/api/charging';
      const method = editingStationId ? 'PUT' : 'POST';
      enqueueOfflineAction(endpoint, method, payload, 'Charging Station Submission', clientRequestId);
      const canPublishOffline = true;
      const localStation: any = {
        ...payload,
        id: editingStationId || `cs_local_${Date.now()}`,
        approvalStatus: canPublishOffline ? 'approved' : 'pending',
        published: canPublishOffline,
        verified: canPublishOffline,
        verifiedByAdmin: canPublishOffline,
        isSupernova: validation.chargerType === 'Supernova',
        operatingStatus: 'Operational',
        lastVerifiedDate: new Date().toISOString().split('T')[0],
        reservations: [],
        pendingSync: true
      };
      const updatedAll = editingStationId
        ? allStations.map(s => (s.id === editingStationId ? localStation : s))
        : [localStation, ...allStations];
      setAllStations(updatedAll);
      setStations(updatedAll.filter(s => isPubliclyPublishedCharger(s)));
      saveToCache(CACHE_KEYS.CHARGING, updatedAll);
      setSearchQuery('');
      setFilterType('ALL');
      if (canPublishOffline) {
        setSelectedStation(localStation);
      }
      setShowAddModal(false);
      resetForm();
      setSubmissionNotice(
        `Saved "${payload.name}" locally — pending sync. It will automatically submit when connection returns.`
      );
      setTimeout(() => setSubmissionNotice(null), 6000);
    }
  };

  const handleBookReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation) return;
    playTacticalClick();
    setResError(null);
    setResSuccess(null);
    setLastOwnerNotification(null);

    const validation = validateAndCreateChargerReservation(selectedStation as any, {
      riderUserId: currentUser?.id || 'u_pilot07',
      riderName: resRiderName.trim() || currentUser?.fullName || 'Squadron Pilot',
      riderPhone: resRiderPhone.trim() || currentUser?.mobile || '+91 98450 11099',
      riderBikeModel: resBikeModel || currentUser?.motorcycleModel || 'F77 MACH 2',
      reservationDate: resDate,
      startTime: resStartTime,
      durationMinutes: Number(resDurationMinutes) || 60,
      vehicleNotes: resNotes.trim()
    });

    if (!validation.valid || !validation.reservation || !validation.updatedStation) {
      setResError(validation.error || 'Please verify your reservation details.');
      return;
    }

    const fallbackOwnerNotif = buildChargerReservationOwnerNotification(
      selectedStation as any,
      validation.reservation
    );

    setSubmittingReservation(true);
    try {
      const res = await fetch(`/api/charging/${encodeURIComponent(selectedStation.id)}/reservations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getSessionAuthHeaders(),
          ...(currentUser?.id ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify({
          riderUserId: currentUser?.id || 'u_pilot07',
          riderName: validation.reservation.riderName,
          riderPhone: validation.reservation.riderPhone,
          riderBikeModel: validation.reservation.riderBikeModel,
          reservationDate: validation.reservation.reservationDate,
          startTime: validation.reservation.startTime,
          durationMinutes: validation.reservation.durationMinutes,
          vehicleNotes: validation.reservation.vehicleNotes
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setResError(data.error || 'Could not submit reservation.');
        return;
      }

      const updatedStation: ChargingStation = data.station || (validation.updatedStation as any);
      const ownerNotif: ChargerOwnerReservationNotification =
        data.ownerNotification || fallbackOwnerNotif;

      const nextAll = allStations.map(s => (s.id === updatedStation.id ? updatedStation : s));
      setAllStations(nextAll);
      setStations(nextAll.filter(s => isPubliclyPublishedCharger(s)));
      setSelectedStation(updatedStation);
      saveToCache(CACHE_KEYS.CHARGING, nextAll);

      const existingNotifs = loadFromCache<any[]>(CACHE_KEYS.NOTIFICATIONS, []);
      saveToCache(CACHE_KEYS.NOTIFICATIONS, [ownerNotif, ...existingNotifs]);

      playChime();
      setResNotes('');
      setLastOwnerNotification(ownerNotif);
      setResSuccess(
        `Appointment reserved with ${validation.reservation.ownerName} (${validation.reservation.ownerPhone}) on ${validation.reservation.reservationDate} (${validation.reservation.startTime} – ${validation.reservation.endTime}). Owner notification sent!`
      );
      if (validation.reservation.endTime && validation.reservation.endTime < '21:00') {
        setResStartTime(validation.reservation.endTime);
      }
    } catch {
      const updatedStation = validation.updatedStation as ChargingStation;
      const nextAll = allStations.map(s => (s.id === updatedStation.id ? updatedStation : s));
      setAllStations(nextAll);
      setStations(nextAll.filter(s => isPubliclyPublishedCharger(s)));
      setSelectedStation(updatedStation);
      saveToCache(CACHE_KEYS.CHARGING, nextAll);

      const existingNotifs = loadFromCache<any[]>(CACHE_KEYS.NOTIFICATIONS, []);
      saveToCache(CACHE_KEYS.NOTIFICATIONS, [fallbackOwnerNotif, ...existingNotifs]);

      playChime();
      setResNotes('');
      setLastOwnerNotification(fallbackOwnerNotif);
      setResSuccess(
        `Appointment reserved with ${validation.reservation.ownerName} (${validation.reservation.ownerPhone}) on ${validation.reservation.reservationDate} (${validation.reservation.startTime} – ${validation.reservation.endTime}). Owner notification queued!`
      );
      if (validation.reservation.endTime && validation.reservation.endTime < '21:00') {
        setResStartTime(validation.reservation.endTime);
      }
    } finally {
      setSubmittingReservation(false);
    }
  };

  const handleUpdateReservationStatus = async (
    reservationId: string,
    nextStatus: ChargerReservationStatus
  ) => {
    if (!selectedStation) return;
    playTacticalClick();
    setResError(null);
    setUpdatingResId(reservationId);
    const noteText = (ownerNoteDrafts[reservationId] || '').trim();

    const localUpdate = updateChargerReservationStatus(
      selectedStation as any,
      reservationId,
      nextStatus,
      {
        id: currentUser?.id,
        role: currentUser?.role,
        isOwner: currentUser?.isOwner,
        fullName: currentUser?.fullName
      },
      noteText || undefined
    );

    if (!localUpdate.valid || !localUpdate.updatedStation) {
      setResError(localUpdate.error || 'Unable to update reservation status.');
      setUpdatingResId(null);
      return;
    }

    try {
      const res = await fetch(
        `/api/charging/${encodeURIComponent(selectedStation.id)}/reservations/${encodeURIComponent(
          reservationId
        )}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getSessionAuthHeaders(),
            ...(currentUser?.id ? { 'x-user-id': currentUser.id } : {})
          },
          body: JSON.stringify({
            actorId: currentUser?.id,
            actorName: currentUser?.fullName,
            status: nextStatus,
            ownerResponseNote: noteText || undefined
          })
        }
      );

      const data = await res.json();
      const updatedStation: ChargingStation =
        res.ok && data.station ? data.station : (localUpdate.updatedStation as any);
      const nextAll = allStations.map(s => (s.id === updatedStation.id ? updatedStation : s));
      setAllStations(nextAll);
      setStations(nextAll.filter(s => isPubliclyPublishedCharger(s)));
      setSelectedStation(updatedStation);
      saveToCache(CACHE_KEYS.CHARGING, nextAll);
      playChime();
      setResSuccess(`Reservation status updated to ${nextStatus}.`);
    } catch {
      const updatedStation = localUpdate.updatedStation as ChargingStation;
      const nextAll = allStations.map(s => (s.id === updatedStation.id ? updatedStation : s));
      setAllStations(nextAll);
      setStations(nextAll.filter(s => isPubliclyPublishedCharger(s)));
      setSelectedStation(updatedStation);
      saveToCache(CACHE_KEYS.CHARGING, nextAll);
      playChime();
      setResSuccess(`Reservation status updated to ${nextStatus}.`);
    } finally {
      setUpdatingResId(null);
    }
  };

  const handleDeleteStation = async (station: ChargingStation) => {
    if (!canModifyChargerRecord(station, currentUser)) return;
    playTacticalClick();
    recordDeletedId(station.id);
    const remaining = allStations.filter(s => s.id !== station.id);
    const remainingPub = remaining.filter(s => isPubliclyPublishedCharger(s));
    setAllStations(remaining);
    setStations(remainingPub);
    saveToCache(CACHE_KEYS.CHARGING, remaining);
    if (selectedStation?.id === station.id) {
      const nearbyMatch = remainingPub.find(
        s =>
          Math.abs(s.latitude - station.latitude) < 0.04 &&
          Math.abs(s.longitude - station.longitude) < 0.04
      );
      setSelectedStation(nearbyMatch || null);
    }
    if (editingStationId === station.id) {
      setShowAddModal(false);
      resetForm();
    }
    setSubmissionNotice(`Removed "${station.name}" from the Charging Map.`);
    setTimeout(() => setSubmissionNotice(null), 4000);
    try {
      const res = await fetch(
        `/api/charging/${encodeURIComponent(station.id)}?userId=${encodeURIComponent(currentUser?.id || '')}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...getSessionAuthHeaders(),
            ...(currentUser?.id ? { 'x-user-id': currentUser.id } : {})
          },
          body: JSON.stringify({ userId: currentUser?.id })
        }
      );

      if (res.ok) {
        playChime();
      }
    } catch (err) {
      console.error('Error deleting station:', err);
    }
  };

  const handleAdminApproval = async (stationId: string, status: 'approved' | 'rejected') => {
    if (!isAdmin) return;
    playTacticalClick();
    try {
      const res = await fetch(`/api/charging/${stationId}/approval`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getSessionAuthHeaders(),
          ...(currentUser?.id ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify({
          status,
          userId: currentUser?.id
        })
      });

      if (res.ok) {
        const data = await res.json();
        playChime();
        if (data.station) {
          const nextAll = allStations.map(s => (s.id === data.station.id ? data.station : s));
          setAllStations(nextAll);
          setStations(nextAll.filter(s => isPubliclyPublishedCharger(s)));
          saveToCache(CACHE_KEYS.CHARGING, nextAll);
        }
        if (status === 'approved' && data.station) {
          setSelectedStation(data.station);
          setSubmissionNotice(
            `Approved & published "${data.station.name}" — now live on the India Charging Map.`
          );
        } else {
          setSubmissionNotice('Charger submission marked as rejected.');
        }
        setTimeout(() => setSubmissionNotice(null), 5000);
      }
    } catch (err) {
      console.error('Error updating approval:', err);
    }
  };

  const handleSavePlanningText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isAdmin) return;

    playTacticalClick();
    setSavingPlanning(true);
    try {
      const res = await fetch('/api/charging/planning-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getSessionAuthHeaders(),
          ...(currentUser?.id ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify({
          text: planningDraft,
          adminName: currentUser?.fullName
        })
      });

      if (res.ok) {
        const data = await res.json();
        const updated =
          typeof data.longRidePlanningText === 'string' ? data.longRidePlanningText : '';
        setLongRidePlanningText(updated);
        setPlanningDraft(updated);
        playChime();
        setPlanningSavedFeedback('Planning text saved');
        setTimeout(() => setPlanningSavedFeedback(null), 3000);
      }
    } catch (err) {
      console.error('Error saving long-ride planning text:', err);
    } finally {
      setSavingPlanning(false);
    }
  };

  const handleRemovePlanningText = async () => {
    if (!isAdmin) return;

    playTacticalClick();
    setSavingPlanning(true);
    try {
      const res = await fetch('/api/charging/planning-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: '',
          adminName: currentUser?.fullName
        })
      });

      if (res.ok) {
        setLongRidePlanningText('');
        setPlanningDraft('');
        playChime();
        setPlanningSavedFeedback('Planning text removed');
        setTimeout(() => setPlanningSavedFeedback(null), 3000);
      }
    } catch (err) {
      console.error('Error removing long-ride planning text:', err);
    } finally {
      setSavingPlanning(false);
    }
  };

  // Filtered published stations for Map and Directory
  const filteredStations = useMemo(
    () => searchAndFilterChargingStations(stations, searchQuery, filterType),
    [stations, searchQuery, filterType]
  );

  useEffect(() => {
    if (selectedStation) {
      const existsInFilter = filteredStations.some(s => s.id === selectedStation.id);
      if (!existsInFilter) {
        setSelectedStation(null);
      }
    }
  }, [filterType, searchQuery, filteredStations, selectedStation]);

  // Pending submissions for admin approval queue or submitting user visibility
  const pendingStations = allStations.filter(s => s.approvalStatus === 'pending');
  const myPendingStations = pendingStations.filter(
    s => s.submittedByUserId && s.submittedByUserId === currentUser?.id
  );

  const getStationSourceBadge = (cs: ChargingStation) => {
    const isUvSpace =
      cs.chargerSource === 'UV Space Station' ||
      (Array.isArray(cs.categories) &&
        cs.categories.some(c => /space\s*station/i.test(String(c || ''))));
    if (isUvSpace) {
      return (
        <span className="px-2 py-0.5 rounded bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40 font-bold inline-flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
          <span>UV SPACE STATION</span>
        </span>
      );
    }
    if (cs.chargerSource === 'Supernova' || cs.isSupernova || cs.chargerType === 'Supernova') {
      return (
        <span className="px-2 py-0.5 rounded bg-[#42B883]/20 text-[#42B883] border border-[#42B883]/40 font-bold inline-flex items-center gap-1.5">
          <img src="/assets/aistudio/87f724dd-d91d-4b81-9fca-91a11dc2cbec_40fb2a9f.png" alt="Supernova" className="w-4 h-4 object-contain shrink-0" />
          <span>SUPERNOVA</span>
        </span>
      );
    }
    if (resolveChargerSubmitterInfo(cs).isCommunityProvided) {
      return (
        <span className="px-2 py-0.5 rounded bg-[#E8AA45]/20 text-[#E8AA45] border border-[#E8AA45]/40 font-bold inline-flex items-center gap-1.5">
          <img src="/assets/aistudio/batman_icon.svg" alt="Batman" className="w-4 h-4 object-contain shrink-0" />
          <span>COMMUNITY CHARGER</span>
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded bg-[#252A30] text-[#729BCB] border border-[#729BCB]/30 font-semibold">
        3RD PARTY STATION
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Clean Mobile-First Header */}
      <div className="bg-[#13161A] border border-[#282D34] rounded-xl p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#0D1015] border border-[#282D34] flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-[#42B883]" />
            </div>
            <div>
              <div className="text-base sm:text-lg font-mono font-bold text-[#F1F3F5] tracking-wider flex flex-wrap items-center gap-2">
                <span>CHARGING NETWORK</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#42B883]/15 text-[#42B883] border border-[#42B883]/30 whitespace-nowrap shrink-0">
                  {stations.length} Active
                </span>
              </div>
              <div className="text-xs text-[#A0A7B0] mt-0.5">
                Supernova • Community • Type 2 &amp; 6 • Sockets
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="sm:hidden flex items-center space-x-1 px-3 py-2 rounded-lg bg-[#252A30] hover:bg-[#414851] text-xs font-mono font-bold text-[#F1F3F5] border border-[#414851] transition-colors cursor-pointer shrink-0"
          >
            <span>+ Add</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 font-mono text-xs sm:text-sm">
          {/* Primary Mode Switch: CHARGING MAP vs AUTO PILOT */}
          <div
            role="tablist"
            aria-label="Charging Network Mode"
            className="flex items-center bg-[#090B0E] border border-[#2D343E] rounded-lg p-1 w-full sm:w-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={chargingPageMode === 'map'}
              onClick={() => {
                playTacticalClick();
                setChargingPageMode('map');
              }}
              className={`relative flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                chargingPageMode === 'map'
                  ? 'text-[#08090B] font-bold'
                  : 'text-[#A0A7B0] hover:text-[#F1F3F5]'
              }`}
            >
              {chargingPageMode === 'map' && (
                <motion.span
                  layoutId="charging-primary-mode-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  className="pointer-events-none absolute inset-0 rounded-md bg-[#E8AA45] shadow shadow-[#E8AA45]/30"
                />
              )}
              <MapIcon className="relative z-10 w-4 h-4 shrink-0" />
              <span className="relative z-10">CHARGING MAP</span>
            </button>
            <button
              type="button"
              role="tab"
              data-testid="charging-route-planner-tab"
              aria-selected={chargingPageMode === 'autopilot'}
              onClick={() => {
                playTacticalClick();
                setChargingPageMode('autopilot');
              }}
              className={`relative flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                chargingPageMode === 'autopilot'
                  ? 'text-white font-bold'
                  : 'text-[#A0A7B0] hover:text-[#F1F3F5]'
              }`}
            >
              {chargingPageMode === 'autopilot' && (
                <motion.span
                  layoutId="charging-primary-mode-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  className="pointer-events-none absolute inset-0 rounded-md bg-[#FF5500] shadow shadow-[#FF5500]/35"
                />
              )}
              <Compass className="relative z-10 w-4 h-4 shrink-0" />
              <span className="relative z-10">AUTO PILOT</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="hidden sm:flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-[#252A30] hover:bg-[#414851] text-xs font-mono font-bold text-[#F1F3F5] border border-[#414851] transition-colors cursor-pointer"
          >
            <span>+ Add Charger</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* EXPANDABLE & COLLAPSIBLE NETWORK BREAKDOWN & SYNC         */}
      {/* ========================================================= */}
      <section
        data-testid="charging-network-composition-graph"
        aria-label="Network Breakdown and Sync"
        className="bg-[#0D1015] border border-[#282D34] rounded-xl overflow-hidden font-mono transition-all"
      >
        <button
          type="button"
          data-testid="network-breakdown-sync-toggle"
          aria-expanded={isBreakdownSyncExpanded}
          onClick={() => {
            playTacticalClick();
            setIsBreakdownSyncExpanded(prev => !prev);
          }}
          className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-[#13171F] transition-colors cursor-pointer text-xs"
        >
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <BarChart3 className="w-3.5 h-3.5 text-[#42B883] shrink-0" />
            <span className="font-bold text-[#F1F3F5] tracking-wider uppercase text-[11px]">
              NETWORK BREAKDOWN &amp; SYNC
            </span>
            <span
              data-testid="charging-connection-badge"
              className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold border ${
                isNetworkOffline
                  ? 'bg-[#E8AA45]/20 border-[#E8AA45]/50 text-[#E8AA45]'
                  : 'bg-[#42B883]/15 border-[#42B883]/40 text-[#42B883]'
              }`}
            >
              {isNetworkOffline ? (
                <>
                  <WifiOff className="w-2.5 h-2.5" />
                  <span>OFFLINE</span>
                </>
              ) : (
                <>
                  <Wifi className="w-2.5 h-2.5" />
                  <span>ONLINE</span>
                </>
              )}
            </span>
            <span className="text-[10px] text-[#A0A7B0] hidden sm:inline">
              ({composition.totalCount} Stations • {composition.totalCapacityKw} kW)
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0 text-[10px] text-[#E8AA45] font-bold">
            <span>{isBreakdownSyncExpanded ? 'Hide' : 'Expand'}</span>
            {isBreakdownSyncExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </div>
        </button>

        {isBreakdownSyncExpanded && (
          <div className="px-3.5 pb-3.5 pt-2 border-t border-[#282D34] space-y-3">
            {/* Offline Cache & Manual Sync Controls */}
            <div
              data-testid="charging-offline-storage-hud"
              className={`rounded-lg border px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] transition-colors ${
                isNetworkOffline
                  ? 'bg-[#19150E] border-[#E8AA45]/50 text-[#F1F3F5]'
                  : 'bg-[#13161A] border-[#282D34] text-[#D4D8DE]'
              }`}
            >
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#A0A7B0]">
                <HardDrive className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                <span data-testid="phone-saved-chargers-count" className="text-[#F1F3F5] font-semibold">
                  {storageStatus?.savedChargersCount ?? allStations.length} Saved Chargers
                </span>
                <span>•</span>
                <span data-testid="phone-saved-routes-count">
                  {storageStatus?.savedRoutesCount ?? 0} Corridors
                </span>
                {storageStatus && storageStatus.queuedActionsCount > 0 && (
                  <span
                    data-testid="charging-queued-actions-badge"
                    className="px-1.5 py-0.5 rounded bg-[#E8AA45]/20 border border-[#E8AA45]/50 text-[#E8AA45] text-[10px] font-bold"
                  >
                    {storageStatus.queuedActionsCount} Pending
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {offlinePackProgressLabel && (
                  <span className="text-[10px] text-[#38BDF8] animate-pulse">
                    {offlinePackProgressLabel}
                  </span>
                )}
                <button
                  type="button"
                  data-testid="save-offline-pack-btn"
                  disabled={savingOfflinePack}
                  onClick={handleDownloadOfflinePack}
                  className="px-2.5 py-1.5 rounded-lg bg-[#192330] hover:bg-[#223042] border border-[#38BDF8]/40 text-[#38BDF8] font-bold text-[10px] flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3 h-3" />
                  <span>{savingOfflinePack ? 'Saving...' : 'Save Offline'}</span>
                </button>

                <button
                  type="button"
                  data-testid="charging-sync-now-btn"
                  disabled={syncingNow}
                  onClick={handleManualSyncNow}
                  className="px-2.5 py-1.5 rounded-lg bg-[#191D22] hover:bg-[#252A30] border border-[#414851] text-[#F1F3F5] font-bold text-[10px] flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 text-[#42B883] ${syncingNow ? 'animate-spin' : ''}`} />
                  <span>{syncingNow ? 'Syncing...' : 'Sync Now'}</span>
                </button>
              </div>
            </div>

            {/* Breakdown Header & 24h Filter */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-[#A0A7B0]">
                Total Capacity: <strong className="text-[#F1F3F5]">{composition.totalCapacityKw} kW</strong> across {composition.totalCount} verified stations
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="filter-last-24h-btn"
                  onClick={() => {
                    playTacticalClick();
                    setFilterType(prev => (prev === 'LAST_24H' ? 'ALL' : 'LAST_24H'));
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                    filterType === 'LAST_24H'
                      ? 'bg-[#42B883] text-[#08090B] border-[#42B883]'
                      : 'bg-[#13161A] hover:bg-[#1E232B] text-[#42B883] border-[#42B883]/40'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  <span>NEW (24H)</span>
                  <span
                    data-testid="composition-last-24h-count"
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      filterType === 'LAST_24H'
                        ? 'bg-[#08090B] text-[#42B883]'
                        : 'bg-[#42B883]/20 text-[#42B883]'
                    }`}
                  >
                    {composition.last24HoursCount}
                  </span>
                </button>

                {filterType !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      setFilterType('ALL');
                    }}
                    className="px-2 py-1 rounded-lg bg-[#191D22] hover:bg-[#252A30] text-[10px] text-[#A0A7B0] hover:text-[#F1F3F5] border border-[#282D34] cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Stacked Progress Bar */}
            <div
              role="progressbar"
              aria-label="Charging infrastructure distribution graph"
              className="w-full h-2.5 rounded-full bg-[#13171F] border border-[#282D34] overflow-hidden flex p-0.5 gap-0.5"
            >
              <div
                style={{ width: `${Math.max(8, composition.segments.uvSupernova.percentage)}%` }}
                className="h-full rounded-l-full bg-[#3B82F6] hover:opacity-90 transition-all duration-500 cursor-pointer"
                onClick={() => {
                  playTacticalClick();
                  setFilterType(prev => (prev === 'SUPERNOVA' ? 'ALL' : 'SUPERNOVA'));
                }}
              />
              <div
                style={{ width: `${Math.max(8, composition.segments.ownersChargers.percentage)}%` }}
                className="h-full bg-[#E8AA45] hover:opacity-90 transition-all duration-500 cursor-pointer"
                onClick={() => {
                  playTacticalClick();
                  setFilterType(prev =>
                    prev === 'Community Provided Chargers' ? 'ALL' : 'Community Provided Chargers'
                  );
                }}
              />
              <div
                style={{ width: `${Math.max(8, composition.segments.boltType6.percentage)}%` }}
                className="h-full rounded-r-full bg-[#42B883] hover:opacity-90 transition-all duration-500 cursor-pointer"
                onClick={() => {
                  playTacticalClick();
                  setFilterType(prev => (prev === 'BOLT_TYPE_6' ? 'ALL' : 'BOLT_TYPE_6'));
                }}
              />
            </div>

            {/* 3-Column Compact Metric Cards */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {/* Card 1: UV Supernova */}
              <div
                data-testid="composition-card-uv-supernova"
                role="button"
                tabIndex={0}
                onClick={() => {
                  playTacticalClick();
                  setFilterType(prev => (prev === 'SUPERNOVA' ? 'ALL' : 'SUPERNOVA'));
                }}
                className={`p-2.5 sm:p-3 rounded-lg border transition-all cursor-pointer ${
                  filterType === 'SUPERNOVA'
                    ? 'bg-[#3B82F6]/15 border-[#3B82F6] ring-1 ring-[#3B82F6]'
                    : 'bg-[#11151C] border-[#282D34] hover:border-[#3B82F6]/60'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-[#3B82F6] font-bold truncate">SUPERNOVA</span>
                  <span className="text-[#3B82F6] font-bold hidden sm:inline">
                    {composition.segments.uvSupernova.percentage}%
                  </span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-[#F1F3F5] leading-tight">
                  {composition.segments.uvSupernova.count}
                </div>
                <div className="text-[10px] text-[#707883] mt-0.5 truncate">
                  {composition.segments.uvSupernova.totalKw} kW total
                </div>
              </div>

              {/* Card 2: Owners Chargers */}
              <div
                data-testid="composition-card-owners-chargers"
                role="button"
                tabIndex={0}
                onClick={() => {
                  playTacticalClick();
                  setFilterType(prev =>
                    prev === 'Community Provided Chargers' ? 'ALL' : 'Community Provided Chargers'
                  );
                }}
                className={`p-2.5 sm:p-3 rounded-lg border transition-all cursor-pointer ${
                  filterType === 'Community Provided Chargers'
                    ? 'bg-[#E8AA45]/15 border-[#E8AA45] ring-1 ring-[#E8AA45]'
                    : 'bg-[#11151C] border-[#282D34] hover:border-[#E8AA45]/60'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-[#E8AA45] font-bold truncate">COMMUNITY</span>
                  <span className="text-[#E8AA45] font-bold hidden sm:inline">
                    {composition.segments.ownersChargers.percentage}%
                  </span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-[#F1F3F5] leading-tight">
                  {composition.segments.ownersChargers.count}
                </div>
                <div className="text-[10px] text-[#707883] mt-0.5 truncate">
                  {composition.segments.ownersChargers.totalKw} kW total
                </div>
              </div>

              {/* Card 3: Bolt Type 6 */}
              <div
                data-testid="composition-card-bolt-type6"
                role="button"
                tabIndex={0}
                onClick={() => {
                  playTacticalClick();
                  setFilterType(prev => (prev === 'BOLT_TYPE_6' ? 'ALL' : 'BOLT_TYPE_6'));
                }}
                className={`p-2.5 sm:p-3 rounded-lg border transition-all cursor-pointer ${
                  filterType === 'BOLT_TYPE_6'
                    ? 'bg-[#42B883]/15 border-[#42B883] ring-1 ring-[#42B883]'
                    : 'bg-[#11151C] border-[#282D34] hover:border-[#42B883]/60'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-[#42B883] font-bold truncate">TYPE 6</span>
                  <span className="text-[#42B883] font-bold hidden sm:inline">
                    {composition.segments.boltType6.percentage}%
                  </span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-[#F1F3F5] leading-tight">
                  {composition.segments.boltType6.count}
                </div>
                <div className="text-[10px] text-[#707883] mt-0.5 truncate">
                  {composition.segments.boltType6.totalKw} kW total
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Feedback Banner */}
      {submissionNotice && (
        <div
          role="status"
          className="bg-[#13161A] border border-[#42B883]/50 rounded-lg px-4 py-3 flex items-center justify-between text-xs font-mono text-[#42B883]"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{submissionNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSubmissionNotice(null)}
            className="text-[#707883] hover:text-[#F1F3F5]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Administrator Pending Charger Approval Queue */}
      {isAdmin && pendingStations.length > 0 && (
        <section
          aria-label="Pending Charger Submissions Approval Queue"
          className="bg-[#13161A] border border-[#E8AA45]/50 rounded-lg p-4 space-y-3 font-mono text-xs"
        >
          <div className="flex items-center justify-between pb-2 border-b border-[#282D34]">
            <div className="flex items-center gap-2 text-[#E8AA45] font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>
                ADMIN APPROVAL QUEUE ({pendingStations.length})
              </span>
            </div>
            <span className="text-[10px] text-[#A0A7B0]">
              Hidden until approved
            </span>
          </div>

          <div className="space-y-2.5">
            {pendingStations.map(ps => (
              <div
                key={ps.id}
                className="p-3 rounded bg-[#0D0F12] border border-[#282D34] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[#F1F3F5]">{ps.name}</span>
                    <span className="px-2 py-0.5 rounded bg-[#E8AA45]/15 text-[#E8AA45] border border-[#E8AA45]/40 text-[10px] font-bold">
                      {ps.chargerType || 'Socket'}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#A0A7B0] font-sans">{ps.location}</div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleAdminApproval(ps.id, 'approved')}
                    className="px-3 py-1.5 rounded bg-[#42B883] hover:bg-[#389d6f] text-[#08090B] font-bold text-[11px]"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdminApproval(ps.id, 'rejected')}
                    className="px-3 py-1.5 rounded bg-[#E04F5F]/15 hover:bg-[#E04F5F]/25 text-[#E04F5F] border border-[#E04F5F]/40 font-bold text-[11px]"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Non-admin user's own pending submissions notice */}
      {!isAdmin && myPendingStations.length > 0 && (
        <div className="bg-[#13161A] border border-[#E8AA45]/40 rounded-lg p-3 text-xs font-mono text-[#E8AA45] flex items-center justify-between">
          <span>
            {myPendingStations.length} submitted charger(s) pending administrator verification.
          </span>
        </div>
      )}

      <AvionicsToggleTransition
        activeKey={chargingPageMode}
        orderedKeys={['map', 'autopilot']}
        accentColor={chargingPageMode === 'autopilot' ? 'orange' : 'amber'}
        reducedMotion={reducedMotion}
        className="space-y-4"
      >
      {chargingPageMode === 'autopilot' ? (
        <AutoPilotPlanner
          stations={stations as any}
          allStationsForValidation={allStations as any}
          chargerReports={chargerReports}
          currentUserId={currentUser?.id || 'u_admin'}
          currentUserName={currentUser?.fullName || 'Pilot'}
          onReportSubmitted={updatedReports => setChargerReports(updatedReports)}
        />
      ) : (
        <div className="space-y-4">
          {/* Active 24hr Filter Notification Banner */}
          {filterType === 'LAST_24H' && (
            <div
              data-testid="last-24h-active-banner"
              className="bg-[#0F1B15] border border-[#42B883]/50 rounded-lg px-3 py-2 text-xs font-mono text-[#F1F3F5] flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[#42B883]" />
                <span>
                  Showing <strong className="text-[#42B883]">{filteredStations.length}</strong> charger(s) added in last 24h
                </span>
              </div>
              {filterType === 'LAST_24H' && (
                <button
                  type="button"
                  onClick={() => {
                    playTacticalClick();
                    setFilterType('ALL');
                  }}
                  className="text-[11px] underline text-[#42B883] font-bold cursor-pointer"
                >
                  Show All
                </button>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* INDIA CHARGING MAP + SELECTED CHARGER DETAILS */}
          {/* ========================================================= */}
          {(() => {
            const renderSelectedChargerReservationAndIntel = () => {
              if (!selectedStation) return null;
              const submitterInfo = resolveChargerSubmitterInfo(selectedStation);
              const selectedTerms = resolveCommunityChargerTerms(selectedStation);
              const costPreview = calculateChargerReservationCost({
                pricingType: selectedTerms.pricingType,
                chargingCostAmount: selectedTerms.chargingCostAmount,
                chargingCostUnit: selectedTerms.chargingCostUnit,
                durationMinutes: Number(resDurationMinutes) || 60,
                powerOutputKw: selectedStation.powerOutputKw
              });
              const ownerAccess = canManageChargerReservation(
                selectedStation as any,
                null,
                {
                  id: currentUser?.id,
                  role: currentUser?.role,
                  isOwner: currentUser?.isOwner,
                  fullName: currentUser?.fullName
                }
              );
              const stIntel = evaluateChargerIntelligence(
                selectedStation.id,
                chargerReports
              );

              return (
                <div className="space-y-3">
                  {/* COMMUNITY CHARGER RESERVATION SYSTEM (ONLY FOR COMMUNITY PROVIDED CHARGERS) */}
                  {submitterInfo.isCommunityProvided && (
                  <div
                    data-testid="community-charger-reservation-panel"
                    className="p-3.5 rounded-xl bg-[#11151C] border border-[#E8AA45]/40 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#282D34]">
                      <div className="text-xs font-bold text-[#E8AA45] flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>RESERVE SLOT WITH {submitterInfo.submitterName.toUpperCase()}</span>
                      </div>
                      <span
                        data-testid="reservation-cost-estimate"
                        className="text-[11px] font-bold text-[#42B883] flex items-center gap-1"
                      >
                        <IndianRupee className="w-3 h-3" />
                        <span>Est: {costPreview.costBreakdownLabel}</span>
                      </span>
                    </div>

                    {resError && (
                      <div
                        role="alert"
                        data-testid="reservation-error-banner"
                        className="p-2 rounded bg-[#E04F5F]/15 border border-[#E04F5F]/40 text-[#E04F5F] flex items-center gap-2 text-[11px]"
                      >
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{resError}</span>
                      </div>
                    )}

                    {resSuccess && (
                      <div
                        role="status"
                        data-testid="reservation-success-banner"
                        className="p-2 rounded bg-[#42B883]/15 border border-[#42B883]/40 text-[#42B883] flex items-center gap-2 text-[11px]"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{resSuccess}</span>
                      </div>
                    )}

                    {lastOwnerNotification && (
                      <div
                        data-testid="owner-reservation-notification-banner"
                        className="p-2.5 rounded bg-[#0C1814] border border-[#42B883]/50 space-y-1 text-[11px]"
                      >
                        <div className="flex items-center justify-between gap-2 text-[#42B883] font-bold">
                          <span className="flex items-center gap-1.5">
                            <Bell className="w-3 h-3" />
                            <span>Notified Owner: {lastOwnerNotification.ownerName}</span>
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#42B883]/20 text-[#42B883]">
                            SENT
                          </span>
                        </div>
                        <div className="text-[#D4D8DE] font-sans text-[10px]">
                          {lastOwnerNotification.message}
                        </div>
                      </div>
                    )}

                    {/* Compact Reservation Form */}
                    <form
                      onSubmit={handleBookReservation}
                      className="p-3 rounded-lg bg-[#08090B] border border-[#282D34] space-y-2.5"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label htmlFor="reservation-date-input" className="block text-[10px] text-[#A0A7B0] mb-1">
                            DATE *
                          </label>
                          <input
                            id="reservation-date-input"
                            data-testid="reservation-date-input"
                            type="date"
                            value={resDate}
                            onChange={e => setResDate(e.target.value)}
                            className="w-full bg-[#13161A] border border-[#282D34] rounded px-2 py-1.5 text-xs text-[#F1F3F5] focus:border-[#E8AA45] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label htmlFor="reservation-start-time-input" className="block text-[10px] text-[#A0A7B0] mb-1">
                            TIME ({selectedTerms.availabilityStartTime}–{selectedTerms.availabilityEndTime}) *
                          </label>
                          <input
                            id="reservation-start-time-input"
                            data-testid="reservation-start-time-input"
                            type="time"
                            value={resStartTime}
                            onChange={e => setResStartTime(e.target.value)}
                            className="w-full bg-[#13161A] border border-[#282D34] rounded px-2 py-1.5 text-xs text-[#F1F3F5] focus:border-[#E8AA45] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label htmlFor="reservation-duration-select" className="block text-[10px] text-[#A0A7B0] mb-1">
                            DURATION *
                          </label>
                          <select
                            id="reservation-duration-select"
                            data-testid="reservation-duration-select"
                            value={resDurationMinutes}
                            onChange={e => setResDurationMinutes(e.target.value)}
                            className="w-full bg-[#13161A] border border-[#282D34] rounded px-2 py-1.5 text-xs text-[#F1F3F5] focus:border-[#E8AA45] focus:outline-none"
                          >
                            <option value="30">30 mins</option>
                            <option value="60">60 mins (1 hr)</option>
                            <option value="90">90 mins (1.5 hrs)</option>
                            <option value="120">120 mins (2 hrs)</option>
                            <option value="180">180 mins (3 hrs)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label htmlFor="reservation-rider-name-input" className="block text-[10px] text-[#A0A7B0] mb-1">
                            YOUR NAME *
                          </label>
                          <input
                            id="reservation-rider-name-input"
                            data-testid="reservation-rider-name-input"
                            type="text"
                            value={resRiderName}
                            onChange={e => setResRiderName(e.target.value)}
                            placeholder="Pilot Name"
                            className="w-full bg-[#13161A] border border-[#282D34] rounded px-2 py-1.5 text-xs text-[#F1F3F5] focus:border-[#E8AA45] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label htmlFor="reservation-rider-phone-input" className="block text-[10px] text-[#A0A7B0] mb-1">
                            PHONE *
                          </label>
                          <input
                            id="reservation-rider-phone-input"
                            data-testid="reservation-rider-phone-input"
                            type="tel"
                            value={resRiderPhone}
                            onChange={e => setResRiderPhone(e.target.value)}
                            placeholder="+91 98450 11099"
                            className="w-full bg-[#13161A] border border-[#282D34] rounded px-2 py-1.5 text-xs text-[#F1F3F5] focus:border-[#E8AA45] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label htmlFor="reservation-bike-select" className="block text-[10px] text-[#A0A7B0] mb-1">
                            BIKE
                          </label>
                          <select
                            id="reservation-bike-select"
                            data-testid="reservation-bike-select"
                            value={resBikeModel}
                            onChange={e => setResBikeModel(e.target.value)}
                            className="w-full bg-[#13161A] border border-[#282D34] rounded px-2 py-1.5 text-xs text-[#F1F3F5] focus:border-[#E8AA45] focus:outline-none"
                          >
                            <option value="F77">F77</option>
                            <option value="X47">X47</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          data-testid="reservation-notes-input"
                          value={resNotes}
                          onChange={e => setResNotes(e.target.value)}
                          placeholder="Optional note for host..."
                          className="flex-1 bg-[#13161A] border border-[#282D34] rounded px-2.5 py-1.5 text-xs text-[#F1F3F5] font-sans focus:border-[#E8AA45] focus:outline-none"
                        />
                        <button
                          type="submit"
                          data-testid="submit-charger-reservation-btn"
                          disabled={submittingReservation}
                          className="px-4 py-2 rounded bg-[#E8AA45] hover:bg-[#d89b38] text-[#08090B] font-bold text-xs shrink-0 cursor-pointer disabled:opacity-50"
                        >
                          {submittingReservation ? 'Booking...' : 'Book Slot'}
                        </button>
                      </div>
                    </form>

                    {/* Existing Reservations List */}
                    {selectedTerms.reservations.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-bold text-[#A0A7B0]">
                          <span>BOOKED SLOTS ({selectedTerms.reservations.length})</span>
                          {ownerAccess.isChargerOwner && (
                            <span className="text-[#42B883]">HOST CONTROLS ACTIVE</span>
                          )}
                        </div>
                        {selectedTerms.reservations.map(resv => {
                          const perms = canManageChargerReservation(
                            selectedStation as any,
                            resv,
                            {
                              id: currentUser?.id,
                              role: currentUser?.role,
                              isOwner: currentUser?.isOwner,
                              fullName: currentUser?.fullName
                            }
                          );
                          const riderTel = `tel:${resv.riderPhone.replace(/[^\d+]/g, '')}`;
                          return (
                            <div
                              key={resv.id}
                              data-testid={`charger-reservation-item-${resv.id}`}
                              className="p-2.5 rounded bg-[#08090B] border border-[#282D34] space-y-1.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    data-testid={`reservation-status-${resv.id}`}
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                      resv.status === 'Approved'
                                        ? 'bg-[#42B883]/15 border-[#42B883]/40 text-[#42B883]'
                                        : resv.status === 'Requested'
                                        ? 'bg-[#E8AA45]/15 border-[#E8AA45]/40 text-[#E8AA45]'
                                        : resv.status === 'Completed'
                                        ? 'bg-[#729BCB]/15 border-[#729BCB]/40 text-[#729BCB]'
                                        : 'bg-[#E04F5F]/15 border-[#E04F5F]/40 text-[#E04F5F]'
                                    }`}
                                  >
                                    {resv.status.toUpperCase()}
                                  </span>
                                  <span className="font-bold text-[#F1F3F5] text-[11px]">
                                    {resv.reservationDate} • {resv.startTime}–{resv.endTime}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px]">
                                  <span className="text-[#D4D8DE]">{resv.riderName}</span>
                                  <a href={riderTel} className="text-[#42B883] font-bold hover:underline">
                                    {resv.riderPhone}
                                  </a>
                                </div>
                              </div>

                              {(perms.canApproveOrReject || perms.canCancel) && (
                                <div className="pt-1.5 border-t border-[#1E232B] flex flex-wrap items-center justify-between gap-2">
                                  {perms.canApproveOrReject && (
                                    <input
                                      type="text"
                                      value={ownerNoteDrafts[resv.id] || ''}
                                      onChange={e =>
                                        setOwnerNoteDrafts(prev => ({
                                          ...prev,
                                          [resv.id]: e.target.value
                                        }))
                                      }
                                      placeholder="Host note..."
                                      className="flex-1 bg-[#13161A] border border-[#282D34] rounded px-2 py-1 text-[10px] text-[#F1F3F5] font-sans"
                                    />
                                  )}
                                  <div className="flex items-center gap-1.5">
                                    {perms.canApproveOrReject && resv.status === 'Requested' && (
                                      <>
                                        <button
                                          type="button"
                                          data-testid={`approve-reservation-btn-${resv.id}`}
                                          disabled={updatingResId === resv.id}
                                          onClick={() => handleUpdateReservationStatus(resv.id, 'Approved')}
                                          className="px-2 py-1 rounded bg-[#42B883] text-[#08090B] font-bold text-[10px] cursor-pointer"
                                        >
                                          Approve
                                        </button>
                                        <button
                                          type="button"
                                          data-testid={`reject-reservation-btn-${resv.id}`}
                                          disabled={updatingResId === resv.id}
                                          onClick={() => handleUpdateReservationStatus(resv.id, 'Rejected')}
                                          className="px-2 py-1 rounded bg-[#E04F5F]/20 text-[#E04F5F] border border-[#E04F5F]/40 font-bold text-[10px] cursor-pointer"
                                        >
                                          Reject
                                        </button>
                                      </>
                                    )}
                                    {perms.canApproveOrReject && resv.status === 'Approved' && (
                                      <button
                                        type="button"
                                        data-testid={`complete-reservation-btn-${resv.id}`}
                                        disabled={updatingResId === resv.id}
                                        onClick={() => handleUpdateReservationStatus(resv.id, 'Completed')}
                                        className="px-2 py-1 rounded bg-[#729BCB]/20 text-[#729BCB] border border-[#729BCB]/40 font-bold text-[10px] cursor-pointer"
                                      >
                                        Complete
                                      </button>
                                    )}
                                    {perms.canCancel &&
                                      (resv.status === 'Requested' || resv.status === 'Approved') && (
                                        <button
                                          type="button"
                                          data-testid={`cancel-reservation-btn-${resv.id}`}
                                          disabled={updatingResId === resv.id}
                                          onClick={() => handleUpdateReservationStatus(resv.id, 'Cancelled')}
                                          className="px-2 py-1 rounded bg-[#252A30] text-[#A0A7B0] font-bold text-[10px] cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                      )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  )}

                  {/* Compact Charger Status & Report Strip */}
                  <div className="p-3 rounded-xl bg-[#0D0F12] border border-[#282D34] space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            stIntel.confidenceLabel === 'RECENTLY REPORTED WORKING'
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                              : stIntel.confidenceLabel === 'RECENT ISSUE REPORTED'
                              ? 'bg-red-500/15 border-red-500/40 text-red-300'
                              : 'bg-[#13161A] border-[#282D34] text-[#A0A7B0]'
                          }`}
                        >
                          {stIntel.confidenceLabel}
                        </span>
                        <span className="text-[11px] text-[#A0A7B0] font-sans hidden sm:inline">
                          {stIntel.shortSummary}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowMapStationReportForm(prev => !prev)}
                        className="px-2.5 py-1 rounded bg-[#191D22] hover:bg-[#252A30] border border-[#414851] text-[#E8AA45] text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <MessageSquarePlus className="w-3 h-3" />
                        <span>Report Status</span>
                      </button>
                    </div>

                    {showMapStationReportForm && (
                      <div className="pt-2 border-t border-[#282D34] space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {VALID_CHARGER_REPORT_CATEGORIES.map(cat => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setMapReportCategory(cat)}
                              className={`px-2 py-1 rounded text-[10px] font-bold border ${
                                mapReportCategory === cat
                                  ? 'bg-[#E8AA45] border-[#E8AA45] text-[#08090B]'
                                  : 'bg-[#0D0F12] border-[#282D34] text-[#A0A7B0]'
                              }`}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={mapReportComment}
                            onChange={e => setMapReportComment(e.target.value)}
                            placeholder="Optional rider observation..."
                            className="flex-1 bg-[#13161A] border border-[#282D34] rounded px-2.5 py-1.5 text-xs text-white font-sans"
                          />
                          <button
                            type="button"
                            disabled={submittingMapReport}
                            onClick={async () => {
                              setSubmittingMapReport(true);
                              const reportBody = {
                                category: mapReportCategory,
                                comment: mapReportComment.trim(),
                                userId: currentUser?.id || 'u_admin',
                                reporterCallsign: currentUser?.fullName || 'Pilot'
                              };
                              const endpoint = `/api/charging/${encodeURIComponent(selectedStation.id)}/reports`;
                              try {
                                const res = await fetch(endpoint, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(reportBody)
                                });
                                if (res.ok) {
                                  const data = await res.json();
                                  if (Array.isArray(data.chargerReports)) {
                                    setChargerReports(data.chargerReports);
                                    saveToCache(CACHE_KEYS.CHARGER_REPORTS, data.chargerReports);
                                  }
                                  setMapReportComment('');
                                  setShowMapStationReportForm(false);
                                  setSubmissionNotice(
                                    `Logged "${mapReportCategory}" status report for ${selectedStation.name}.`
                                  );
                                  setTimeout(() => setSubmissionNotice(null), 4000);
                                } else {
                                  throw new Error('Offline or server error');
                                }
                              } catch {
                                const clientReqId = `crep_req_${Date.now()}`;
                                enqueueOfflineAction(
                                  endpoint,
                                  'POST',
                                  { ...reportBody, clientRequestId: clientReqId },
                                  'Charger Status Report',
                                  clientReqId
                                );
                                const localReport: ChargerCommunityReport = {
                                  id: `crep_local_${Date.now()}`,
                                  chargerId: selectedStation.id,
                                  userId: reportBody.userId,
                                  reporterCallsign: reportBody.reporterCallsign,
                                  category: mapReportCategory,
                                  comment: reportBody.comment,
                                  createdAt: new Date().toISOString(),
                                  sourceLabel: 'Community Report'
                                };
                                const nextReports = [localReport, ...chargerReports];
                                setChargerReports(nextReports);
                                saveToCache(CACHE_KEYS.CHARGER_REPORTS, nextReports);
                                setMapReportComment('');
                                setShowMapStationReportForm(false);
                                setSubmissionNotice(
                                  `Saved "${mapReportCategory}" report for ${selectedStation.name} to phone storage.`
                                );
                                setTimeout(() => setSubmissionNotice(null), 5000);
                              } finally {
                                setSubmittingMapReport(false);
                                void refreshDeviceStorageStatus();
                              }
                            }}
                            className="px-3 py-1.5 rounded bg-[#42B883] text-[#08090B] font-bold text-[11px]"
                          >
                            {submittingMapReport ? 'Saving...' : 'Submit'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            };

            return (
              <>
                <AnimatePresence initial={false}>
                  {activeViewTab === 'map' ? (
                    <motion.div
                      key="charging-india-map-panel"
                      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.99 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.99 }}
                      transition={{ duration: reducedMotion ? 0.1 : 0.25, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <ChargingIndiaMap
                        stations={filteredStations}
                        allStations={stations}
                        activeFilter={filterType}
                        onFilterChange={setFilterType}
                        searchQuery={searchQuery}
                        onSearchQueryChange={setSearchQuery}
                        databaseStats={minimalDbStats}
                        selectedStation={selectedStation}
                        onSelectStation={st => setSelectedStation(st)}
                        currentUser={currentUser}
                        onEditStation={handleOpenEditModal}
                        onDeleteStation={handleDeleteStation}
                        lastSyncedAt={lastSyncedAt}
                        selectedChargerReservationAndIntelSlot={renderSelectedChargerReservationAndIntel()}
                      />
                    </motion.div>
                  ) : (
                    selectedStation && (
                      <div
                        data-testid="selected-charger-info-panel"
                        className="bg-[#0D0F12] border border-[#282D34] rounded-xl p-4 space-y-4 text-xs font-mono"
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-[#282D34]">
                          <div>
                            <h3 className="text-sm font-bold text-[#F1F3F5]">
                              {selectedStation.name}
                            </h3>
                            <p className="text-[11px] text-[#A0A7B0] font-sans">{selectedStation.location}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedStation(null)}
                            className="p-1.5 rounded bg-[#191D22] text-[#A0A7B0] hover:text-white"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {renderSelectedChargerReservationAndIntel()}
                      </div>
                    )
                  )}
                </AnimatePresence>

                {/* ========================================================= */}
                {/* SECTION BELOW MAP: ONLY SELECTED CHARGER OR EXPANDABLE ALL CHARGERS */}
                {/* ========================================================= */}
                <section aria-label="Charging Station Details and Directory" className="space-y-3">
                  <div className="space-y-3">
                      <button
                        type="button"
                        data-testid="toggle-view-all-chargers-btn"
                        aria-expanded={isAllChargersExpanded}
                        onClick={() => {
                          playTacticalClick();
                          setIsAllChargersExpanded(prev => !prev);
                        }}
                        className="w-full p-3.5 sm:p-4 rounded-xl bg-[#0D1015] hover:bg-[#13171F] border border-[#282D34] hover:border-[#E8AA45] flex items-center justify-between text-xs font-mono transition-all cursor-pointer shadow-lg"
                      >
                        <div className="flex items-center gap-2.5">
                          <Zap className="w-4 h-4 text-[#E8AA45]" />
                          <span className="font-bold text-[#F1F3F5] text-xs sm:text-sm uppercase tracking-wider">
                            VIEW ALL CHARGERS ({filteredStations.length} Active Stations)
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#191D22] border border-[#282D34] text-[#E8AA45] font-bold text-[11px]">
                          <span>{isAllChargersExpanded ? 'Hide Chargers' : 'View All Chargers'}</span>
                          {isAllChargersExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </button>

                      {isAllChargersExpanded && (
                        <div className="pt-2 space-y-3">
                          {filteredStations.length === 0 ? (
                            <div className="bg-[#0D0F12] border border-[#282D34] rounded-xl p-8 text-center text-xs font-mono text-[#707883]">
                              No charging stations match this filter.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {filteredStations.map(cs => {
                                const plugType =
                                  cs.rawChargerType !== undefined
                                    ? formatMinimalChargerType(cs.rawChargerType)
                                    : cs.chargerType || (cs.isSupernova ? 'Supernova' : 'Socket');
                                const submitterInfo = resolveChargerSubmitterInfo(cs);
                                const cardTerms = resolveCommunityChargerTerms(cs);
                                const navUrl = buildChargerNavigationUrl(cs as any, null);
                                const exactCoordsDisplay =
                                  cs.exactLocationCoordinates ||
                                  `${Number(cs.latitude).toFixed(6)}, ${Number(cs.longitude).toFixed(6)}`;
                                return (
                                  <div
                                    key={cs.id}
                                    data-testid={`charger-directory-card-${cs.id}`}
                                    onClick={() => {
                                      playTacticalClick();
                                      setSelectedStation(cs);
                                      const anchor = document.getElementById('selected-charger-details-anchor');
                                      if (anchor) {
                                        anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                      }
                                    }}
                                    className="p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-3 bg-[#0D0F12] border-[#282D34] hover:border-[#E8AA45]"
                                  >
                                    <div className="space-y-1.5">
                                      <div className="flex items-center justify-between text-[10px] font-mono">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          {getStationSourceBadge(cs)}
                                          {plugType.toLowerCase() !== 'supernova' && (
                                            <span className="px-2 py-0.5 rounded bg-[#13161A] border border-[#414851] text-[#E8AA45] font-bold">
                                              {plugType}
                                            </span>
                                          )}
                                          {isChargerAddedInLast24Hours(cs) && (
                                            <span
                                              data-testid={`charger-new-24h-badge-${cs.id}`}
                                              className="px-1.5 py-0.5 rounded bg-[#42B883]/20 border border-[#42B883]/50 text-[#42B883] text-[9px] font-bold"
                                            >
                                              NEW
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-[#42B883] font-bold">{cs.powerOutputKw} kW</span>
                                      </div>

                                      <div className="text-sm sm:text-base font-bold text-[#F8FAFC] line-clamp-1">
                                        {cs.referenceName || cs.name}
                                      </div>
                                      <div className="text-[11px] font-mono text-[#38BDF8] truncate">
                                        GPS: {exactCoordsDisplay}
                                      </div>
                                      <div className="text-xs text-[#A0A7B0] truncate font-sans">
                                        {cs.location}
                                      </div>

                                      {submitterInfo.isCommunityProvided && (
                                        <div
                                          data-testid={`charger-card-submitter-${cs.id}`}
                                          className="pt-1.5 flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-mono text-[#D4D8DE]"
                                        >
                                          <span className="truncate">
                                            Host: <strong className="text-[#F1F3F5]">{submitterInfo.submitterName}</strong>
                                          </span>
                                          <span
                                            className={`px-1.5 py-0.5 rounded font-bold border ${
                                              cardTerms.pricingType === 'Free'
                                                ? 'bg-[#42B883]/15 border-[#42B883]/40 text-[#42B883]'
                                                : 'bg-[#E8AA45]/15 border-[#E8AA45]/40 text-[#E8AA45]'
                                            }`}
                                          >
                                            {cardTerms.formattedPricingBadge}
                                          </span>
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#282D34] font-mono">
                                      <a
                                        href={navUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={e => {
                                          e.stopPropagation();
                                          playTacticalClick();
                                        }}
                                        className="flex-1 py-2 px-3 rounded-lg bg-[#191D22] hover:bg-[#E8AA45] text-[#E8AA45] hover:text-[#08090B] border border-[#E8AA45]/50 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                                      >
                                        <NavIcon className="w-3 h-3" />
                                        <span>Navigate</span>
                                      </a>

                                      {submitterInfo.isCommunityProvided && (
                                        <button
                                          type="button"
                                          data-testid={`directory-reserve-btn-${cs.id}`}
                                          onClick={e => {
                                            e.stopPropagation();
                                            playTacticalClick();
                                            setSelectedStation(cs);
                                          }}
                                          className="py-2 px-3 rounded-lg bg-[#E8AA45] hover:bg-[#d89b38] text-[#08090B] font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                        >
                                          <Calendar className="w-3 h-3" />
                                          <span>Reserve</span>
                                        </button>
                                      )}

                                      {canModifyChargerRecord(cs, currentUser) && (
                                        <>
                                          <button
                                            type="button"
                                            data-testid={`directory-edit-btn-${cs.id}`}
                                            onClick={e => {
                                              e.stopPropagation();
                                              handleOpenEditModal(cs);
                                            }}
                                            className="py-2 px-2.5 rounded-lg bg-[#191D22] hover:bg-[#252A30] text-[#E8AA45] border border-[#414851] font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                            title="Edit Charger"
                                          >
                                            <Edit3 className="w-3 h-3" />
                                            <span>Edit</span>
                                          </button>
                                          <button
                                            type="button"
                                            data-testid={`directory-delete-btn-${cs.id}`}
                                            onClick={e => {
                                              e.stopPropagation();
                                              void handleDeleteStation(cs);
                                            }}
                                            className="py-2 px-2.5 rounded-lg bg-[#E04F5F]/15 hover:bg-[#E04F5F]/25 text-[#E04F5F] border border-[#E04F5F]/50 font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                            title="Delete Charger"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                            <span>Delete</span>
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                </section>

                {/* ========================================================= */}
                {/* UNDERLYING DATASET — SKIPPED MAP MARKERS (NO VALID COORDS) */}
                {/* ========================================================= */}
                {skippedMinimalRecords.length > 0 && (
                  <section
                    data-testid="unmapped-dataset-records-section"
                    aria-label="Underlying Dataset Records Excluded from Map Markers"
                    className="bg-[#0D1015] border border-[#282D34] rounded-xl overflow-hidden font-mono text-xs"
                  >
                    <button
                      type="button"
                      data-testid="toggle-unmapped-records-btn"
                      aria-expanded={isSkippedDrawerOpen}
                      onClick={() => {
                        playTacticalClick();
                        setIsSkippedDrawerOpen(prev => !prev);
                      }}
                      className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-[#13171F] transition-colors cursor-pointer"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Layers className="w-4 h-4 text-[#E8AA45] shrink-0" />
                        <span className="font-bold text-[#F1F3F5]">
                          UNDERLYING DATASET — RECORDS WITHOUT COORDINATES ({skippedMinimalRecords.length})
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#191D22] border border-[#282D34] text-[#A0A7B0]">
                          Preserved in dataset • Not plotted as map pins
                        </span>
                      </div>
                      <span className="p-1 rounded-md bg-[#191D22] border border-[#282D34] text-[#E8AA45] flex items-center gap-1 text-[10px] font-bold px-2 shrink-0">
                        <span>{isSkippedDrawerOpen ? 'Hide Records' : 'Inspect Dataset'}</span>
                        {isSkippedDrawerOpen ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </span>
                    </button>

                    {isSkippedDrawerOpen && (
                      <div className="p-4 border-t border-[#282D34] space-y-2.5 max-h-80 overflow-y-auto">
                        <p className="text-[11px] text-[#A0A7B0] font-sans">
                          These {skippedMinimalRecords.length} records from{' '}
                          <code className="text-[#E8AA45] font-mono">charging_stations_minimal.json</code>{' '}
                          have empty or invalid GPS coordinates and are preserved in the underlying dataset without inventing coordinates or plotting false map markers.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {skippedMinimalRecords.map(rec => (
                            <div
                              key={`skipped-${rec.originalIndex}-${rec.reference_name}`}
                              className="p-2.5 rounded-lg bg-[#13161A] border border-[#282D34] space-y-1"
                            >
                              <div className="font-bold text-[#F1F3F5] truncate" title={rec.reference_name}>
                                {rec.reference_name}
                              </div>
                              <div className="text-[10px] text-[#E8AA45]">
                                {formatMinimalChargerType(rec.charger_type)}
                              </div>
                              <div className="text-[10px] text-[#707883] font-sans">
                                {rec.location_status || rec.reasonSkipped}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </>
            );
          })()}

          {/* Long-Ride Planning Section (Only shown when configured or for Admin) */}
          {(Boolean(longRidePlanningText) || isAdmin) && (
            <section
              aria-labelledby="planning-long-ride-heading"
              className="bg-[#13161A] border border-[#282D34] rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#282D34]">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-[#42B883]" />
                  <h2
                    id="planning-long-ride-heading"
                    className="text-xs font-mono font-bold text-[#F1F3F5] tracking-wider uppercase"
                  >
                    Long-Ride Advisory
                  </h2>
                </div>
                {planningSavedFeedback && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#42B883]/15 text-[#42B883]">
                    {planningSavedFeedback}
                  </span>
                )}
              </div>

              {longRidePlanningText && (
                <div
                  data-testid="long-ride-planning-display"
                  className="p-3 rounded-lg bg-[#0D0F12] border border-[#282D34] text-xs text-[#D4D8DE] leading-relaxed whitespace-pre-wrap font-sans"
                >
                  {longRidePlanningText}
                </div>
              )}

              {isAdmin && (
                <form
                  onSubmit={handleSavePlanningText}
                  className="space-y-2.5 font-mono text-xs"
                >
                  <textarea
                    id="long-ride-planning-textarea"
                    rows={2}
                    value={planningDraft}
                    onChange={e => setPlanningDraft(e.target.value)}
                    placeholder="Admin: Enter long-ride charging advisory for riders..."
                    className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#414851] rounded-lg p-2.5 text-[#F1F3F5] text-xs font-sans focus:outline-none"
                  />
                  <div className="flex items-center justify-end gap-2">
                    {longRidePlanningText && (
                      <button
                        type="button"
                        onClick={handleRemovePlanningText}
                        disabled={savingPlanning}
                        className="px-3 py-1.5 rounded bg-[#E04F5F]/15 text-[#E04F5F] border border-[#E04F5F]/40 font-bold text-[11px]"
                      >
                        Remove
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={savingPlanning}
                      className="px-3 py-1.5 rounded bg-[#42B883] text-[#08090B] font-bold text-[11px]"
                    >
                      {savingPlanning ? 'Saving...' : 'Save Advisory'}
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}
        </div>
      )}
      </AvionicsToggleTransition>

      {/* ========================================================= */}
      {/* MODAL: + SUBMIT CHARGING PLUG / EDIT CHARGING PLUG */}
      {/* ========================================================= */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-charging-plug-heading"
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
        >
          <div className="bg-[#13161A] border border-[#414851] rounded-lg max-w-lg w-full p-5 sm:p-6 space-y-4 font-mono text-xs max-h-[90vh] overflow-y-auto shadow-2xl relative z-[10000]">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#282D34]">
              <h2
                id="submit-charging-plug-heading"
                className="text-sm font-bold text-[#F1F3F5]"
              >
                {editingStationId ? 'EDIT CHARGING PLUG' : '+ SUBMIT CHARGING PLUG'}
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Close modal"
                className="text-[#707883] hover:text-[#F1F3F5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formErrors.general && (
              <div
                role="alert"
                className="p-2.5 rounded bg-[#E04F5F]/15 border border-[#E04F5F]/40 text-[#E04F5F] flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formErrors.general}</span>
              </div>
            )}

            <form onSubmit={handleSubmitStation} noValidate className="space-y-3.5">
              {/* 1. Smart Location Autocomplete + Interactive Map Preview & Marker Fine-Tuning */}
              <ChargerLocationPickerMap
                latitude={latitude}
                longitude={longitude}
                currentStationName={name}
                currentLocationText={location}
                locationError={formErrors.location}
                coordinateError={formErrors.latitude || formErrors.longitude}
                onSelectPlace={place => {
                  setLocation(place.address);
                  setLatitude(String(place.latitude));
                  setLongitude(String(place.longitude));
                  if (!name.trim() || name === autoFilledName) {
                    setName(place.placeName);
                    setAutoFilledName(place.placeName);
                  }
                  setFormErrors(prev => {
                    const next = { ...prev };
                    delete next.location;
                    delete next.latitude;
                    delete next.longitude;
                    if (!name.trim() || name === autoFilledName) {
                      delete next.name;
                    }
                    return next;
                  });
                }}
              />

              {/* 2. Station / Location Name (Auto-populated from selected place, editable) */}
              <div>
                <label htmlFor="station-name-input" className="block text-[#D4D8DE] mb-1">
                  STATION / LOCATION NAME <span className="text-[#E8AA45]">*</span>
                  <span className="text-[10px] text-[#707883] ml-1.5 font-normal">
                    (Auto-filled on place selection, editable)
                  </span>
                </label>
                <input
                  id="station-name-input"
                  type="text"
                  value={name}
                  onChange={e => {
                    setName(e.target.value);
                    if (formErrors.name) setFormErrors({ ...formErrors, name: '' });
                  }}
                  placeholder="Auto-populated when you select a place above (or enter custom name)"
                  className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#414851] rounded p-2 text-[#F1F3F5] focus:outline-none"
                />
                {formErrors.name && (
                  <p role="alert" className="text-[11px] text-[#E04F5F] mt-1">
                    {formErrors.name}
                  </p>
                )}
              </div>

              {/* 3. Compulsory Charger / Connector Type */}
              <div>
                <label htmlFor="charger-plug-type-select" className="block text-[#D4D8DE] mb-1">
                  CHARGER / CONNECTOR TYPE <span className="text-[#E8AA45]">* (MANDATORY)</span>
                </label>
                <select
                  id="charger-plug-type-select"
                  value={chargerType}
                  onChange={e => handleChargerTypeChange(e.target.value as ChargerPlugType | '')}
                  className={`w-full bg-[#08090B] border rounded p-2 text-[#F1F3F5] focus:outline-none ${
                    formErrors.chargerType ? 'border-[#E04F5F]' : 'border-[#282D34] focus:border-[#E8AA45]'
                  }`}
                >
                  <option value="">-- Select Charger / Connector Type (Required) --</option>
                  {VALID_CHARGER_PLUG_TYPES.map(pt => (
                    <option key={pt} value={pt}>
                      {pt} — {CHARGER_PLUG_TYPE_SPECS[pt].requirementSummary}
                    </option>
                  ))}
                </select>
                {formErrors.chargerType && (
                  <p
                    role="alert"
                    data-testid="charger-type-error"
                    className="text-[11px] text-[#E04F5F] mt-1 font-semibold"
                  >
                    {formErrors.chargerType}
                  </p>
                )}
              </div>

              {/* Dynamic Conditional Requirements Based on Selected Charger Type */}
              {chargerType === 'Supernova' || chargerType === 'Type 6' ? (
                <div
                  data-testid="no-separate-charger-notice"
                  className="p-3 rounded bg-[#42B883]/10 border border-[#42B883]/40 text-[#42B883] space-y-1"
                >
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{chargerType}: No separate charger required.</span>
                  </div>
                  <div className="text-[11px] text-[#D4D8DE] font-sans">
                    Direct plug-in supported for compatible Ultraviolette vehicles without carrying an external charger unit.
                  </div>
                </div>
              ) : null}

              {chargerType === 'Type 2' && (
                <div
                  data-testid="type2-dynamic-requirements"
                  className="p-3.5 rounded bg-[#0D0F12] border border-[#E8AA45]/50 space-y-3"
                >
                  <div className="text-[#E8AA45] font-bold">
                    TYPE 2 REQUIREMENT: Ultraviolette (UV) charging link and charger required.
                  </div>

                  <div>
                    <label htmlFor="uv-charging-link-input" className="block text-[#D4D8DE] mb-1">
                      ULTRAVIOLETTE (UV) CHARGING LINK URL <span className="text-[#E8AA45]">*</span>
                    </label>
                    <input
                      id="uv-charging-link-input"
                      type="url"
                      value={uvChargingLink}
                      onChange={e => {
                        setUvChargingLink(e.target.value);
                        if (formErrors.uvChargingLink)
                          setFormErrors({ ...formErrors, uvChargingLink: '' });
                      }}
                      placeholder="https://www.ultraviolette.com/charging/type2-adapter"
                      className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                    />
                    {formErrors.uvChargingLink && (
                      <p role="alert" className="text-[11px] text-[#E04F5F] mt-1">
                        {formErrors.uvChargingLink}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="type2-charger-details-input"
                      className="block text-[#D4D8DE] mb-1"
                    >
                      REQUIRED CHARGER & ADAPTER INFORMATION <span className="text-[#E8AA45]">*</span>
                    </label>
                    <input
                      id="type2-charger-details-input"
                      type="text"
                      value={chargerDetails}
                      onChange={e => {
                        setChargerDetails(e.target.value);
                        if (formErrors.chargerDetails)
                          setFormErrors({ ...formErrors, chargerDetails: '' });
                      }}
                      placeholder="e.g. UV Type 2 AC Link Cable + 3.3 kW Boost / Standard Charger required"
                      className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                    />
                    {formErrors.chargerDetails && (
                      <p role="alert" className="text-[11px] text-[#E04F5F] mt-1">
                        {formErrors.chargerDetails}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Vehicle Compatibility & Network Classification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="vehicle-compatibility-input"
                    className="block text-[#D4D8DE] mb-1"
                  >
                    VEHICLE COMPATIBILITY
                  </label>
                  <input
                    id="vehicle-compatibility-input"
                    type="text"
                    value={vehicleCompatibility}
                    onChange={e => setVehicleCompatibility(e.target.value)}
                    placeholder="e.g. F77 MACH 2, Recon, Original"
                    className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="charger-source-select" className="block text-[#D4D8DE] mb-1">
                    NETWORK CATEGORY
                  </label>
                  <select
                    id="charger-source-select"
                    value={chargerSource}
                    onChange={e => setChargerSource(e.target.value as ChargerSource)}
                    className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  >
                    {VALID_CHARGER_SOURCES.map(src => (
                      <option key={src} value={src}>
                        {src}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Power & Access Hours */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="power-output-input" className="block text-[#D4D8DE] mb-1">
                    POWER OUTPUT (KW)
                  </label>
                  <input
                    id="power-output-input"
                    type="number"
                    step="0.1"
                    value={powerOutputKw}
                    onChange={e => setPowerOutputKw(e.target.value)}
                    className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="access-hours-select" className="block text-[#D4D8DE] mb-1">
                    ACCESS HOURS
                  </label>
                  <select
                    id="access-hours-select"
                    value={accessConditions}
                    onChange={e => setAccessConditions(e.target.value as any)}
                    className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  >
                    <option value="Public 24/7">Public 24/7</option>
                    <option value="Commercial Hours Only">Commercial Hours Only</option>
                    <option value="Security Permission Required">Security Permission</option>
                    <option value="Private/Restricted">Private/Restricted</option>
                  </select>
                </div>
              </div>

              {/* Community Provided Charger: Free vs Charged, Cost of Charging, Availability Time & Submitter Contact (ONLY for Community Provided Charger) */}
              {chargerSource === 'Community Provided Charger' && (
                <>
                  <div
                    data-testid="modal-community-charger-terms"
                    className="p-3.5 rounded bg-[#0D0F12] border border-[#E8AA45]/50 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#E8AA45] flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5" />
                        <span>COMMUNITY CHARGER PRICING, COST &amp; AVAILABILITY TIME</span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#42B883]/15 border border-[#42B883]/40 text-[#42B883] font-bold">
                        RESERVATION SYSTEM ENABLED
                      </span>
                    </div>

                    {/* Free vs Charged Toggle */}
                    <div>
                      <label className="block text-[#D4D8DE] mb-1">
                        CHARGING MODE (FREE OR CHARGED) <span className="text-[#E8AA45]">*</span>
                      </label>
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          data-testid="modal-pricing-free-btn"
                          onClick={() => setPricingType('Free')}
                          className={`py-2 px-3 rounded border font-bold text-xs transition-colors cursor-pointer ${
                            pricingType === 'Free'
                              ? 'bg-[#42B883]/20 border-[#42B883] text-[#42B883]'
                              : 'bg-[#08090B] border-[#282D34] text-[#A0A7B0]'
                          }`}
                        >
                          Free Charging (₹0)
                        </button>
                        <button
                          type="button"
                          data-testid="modal-pricing-charged-btn"
                          onClick={() => setPricingType('Charged')}
                          className={`py-2 px-3 rounded border font-bold text-xs transition-colors cursor-pointer ${
                            pricingType === 'Charged'
                              ? 'bg-[#E8AA45]/20 border-[#E8AA45] text-[#E8AA45]'
                              : 'bg-[#08090B] border-[#282D34] text-[#A0A7B0]'
                          }`}
                        >
                          Charged (Paid Rate)
                        </button>
                      </div>
                    </div>

                    {/* Cost of Charging (shown when Charged is selected) */}
                    {pricingType === 'Charged' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-2.5 rounded bg-[#191610] border border-[#E8AA45]/40">
                        <div>
                          <label htmlFor="modal-charging-cost-input" className="block text-[#E8AA45] mb-1">
                            COST OF CHARGING (₹) <span className="text-[#E04F5F]">*</span>
                          </label>
                          <input
                            id="modal-charging-cost-input"
                            data-testid="modal-charging-cost-input"
                            type="number"
                            min="1"
                            step="1"
                            value={chargingCostAmount}
                            onChange={e => setChargingCostAmount(e.target.value)}
                            placeholder="e.g. 15"
                            className="w-full bg-[#08090B] border border-[#E8AA45]/50 rounded p-2 text-[#F1F3F5] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label htmlFor="modal-charging-unit-select" className="block text-[#E8AA45] mb-1">
                            BILLING RATE UNIT <span className="text-[#E04F5F]">*</span>
                          </label>
                          <select
                            id="modal-charging-unit-select"
                            data-testid="modal-charging-unit-select"
                            value={chargingCostUnit}
                            onChange={e => setChargingCostUnit(e.target.value as CommunityChargerCostUnit)}
                            className="w-full bg-[#08090B] border border-[#E8AA45]/50 rounded p-2 text-[#F1F3F5] focus:outline-none"
                          >
                            <option value="per kWh">₹ per kWh</option>
                            <option value="per hour">₹ per hour</option>
                            <option value="per session">₹ per session (Flat)</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Availability Time Window */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label htmlFor="modal-avail-start-input" className="block text-[#D4D8DE] mb-1">
                          AVAILABLE FROM
                        </label>
                        <input
                          id="modal-avail-start-input"
                          data-testid="modal-avail-start-input"
                          type="time"
                          value={availabilityStartTime}
                          disabled={availabilityDays === '24/7 Anytime'}
                          onChange={e => setAvailabilityStartTime(e.target.value)}
                          className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label htmlFor="modal-avail-end-input" className="block text-[#D4D8DE] mb-1">
                          AVAILABLE UNTIL
                        </label>
                        <input
                          id="modal-avail-end-input"
                          data-testid="modal-avail-end-input"
                          type="time"
                          value={availabilityEndTime}
                          disabled={availabilityDays === '24/7 Anytime'}
                          onChange={e => setAvailabilityEndTime(e.target.value)}
                          className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label htmlFor="modal-avail-days-select" className="block text-[#D4D8DE] mb-1">
                          AVAILABLE DAYS
                        </label>
                        <select
                          id="modal-avail-days-select"
                          data-testid="modal-avail-days-select"
                          value={availabilityDays}
                          onChange={e => setAvailabilityDays(e.target.value)}
                          className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                        >
                          <option value="Daily">Daily</option>
                          <option value="24/7 Anytime">24/7 Anytime</option>
                          <option value="Weekdays Only">Weekdays Only</option>
                          <option value="Weekends Only">Weekends Only</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Submitter Name & Contact Number (Displayed ONLY on Community Provided Chargers) */}
                  <div className="p-3 rounded bg-[#0D0F12] border border-[#E8AA45]/40 space-y-2.5">
                    <div className="text-[11px] font-bold text-[#E8AA45] flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5" />
                      <span>SUBMITTER DETAILS (DISPLAYED ON COMMUNITY CHARGER LISTING)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="submitter-name-input" className="block text-[#D4D8DE] mb-1">
                          SUBMITTED BY (YOUR NAME)
                        </label>
                        <input
                          id="submitter-name-input"
                          type="text"
                          value={submitterName}
                          onChange={e => setSubmitterName(e.target.value)}
                          placeholder={currentUser?.fullName || 'Enter your name'}
                          className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="submitter-phone-input" className="block text-[#D4D8DE] mb-1">
                          CONTACT PHONE NUMBER
                        </label>
                        <input
                          id="submitter-phone-input"
                          type="tel"
                          value={submitterPhone}
                          onChange={e => setSubmitterPhone(e.target.value)}
                          placeholder={currentUser?.mobile || '+91 98450 11099'}
                          className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label htmlFor="station-notes-input" className="block text-[#D4D8DE] mb-1">
                  NOTES
                </label>
                <textarea
                  id="station-notes-input"
                  rows={2}
                  value={userNotes}
                  onChange={e => setUserNotes(e.target.value)}
                  placeholder="Reliability, parking availability, weather protection..."
                  className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#282D34]">
                <div>
                  {editingStationId && (
                    <button
                      type="button"
                      data-testid="modal-delete-charger-btn"
                      onClick={() => {
                        const target = allStations.find(s => s.id === editingStationId);
                        if (target) {
                          void handleDeleteStation(target);
                        }
                      }}
                      className="px-3 py-2 rounded bg-[#E04F5F]/15 hover:bg-[#E04F5F]/25 text-[#E04F5F] border border-[#E04F5F]/50 font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>DELETE CHARGER</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-3 py-1.5 rounded bg-[#191D22] text-[#A0A7B0] cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded bg-[#E8AA45] hover:bg-[#d89b38] text-[#08090B] font-bold cursor-pointer"
                  >
                    {editingStationId ? 'SAVE CHANGES' : 'SUBMIT LOCATION'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
