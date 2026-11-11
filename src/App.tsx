import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AudioProvider, useAudio } from './context/AudioContext';
import { Navigation } from './components/Navigation';
import { CockpitDashboard } from './components/CockpitDashboard';
import { MissionMode } from './components/MissionMode';
import { JetEngineer } from './components/JetEngineer';
import { SquadronAssist } from './components/SquadronAssist';
import { ProblemTracker } from './components/ProblemTracker';
import { ModificationsLab } from './components/ModificationsLab';
import { ChargingNetwork } from './components/ChargingNetwork';
import { Marketplace } from './components/Marketplace';
import { ServiceIntelligence } from './components/ServiceIntelligence';
import { Discussions } from './components/Discussions';
import { MyGarage } from './components/MyGarage';
import { AdminCentre } from './components/AdminCentre';
import { ContributionHub } from './components/ContributionHub';
import { GlobalSearch } from './components/GlobalSearch';
import { PilotWelcomeScreen } from './components/PilotWelcomeScreen';
import { AndroidPhotoBridge } from './components/AndroidPhotoBridge';
import { AvionicsPageTransition, AnimatePresence, motion } from './components/AvionicsTransition';
import { Ride, EmergencyRequest, ProblemReport, DiscussionPost, ChargingStation, NotificationItem } from './types';
import {
  openPhoneDialer,
  openMailClient,
  openInUpiApp
} from './utils/rules';
import { Shield, Radio, Lock, AlertTriangle, X } from 'lucide-react';

import { SquadronShowdownGame } from './games/squadron-showdown/SquadronShowdownGame';

import {
  CACHE_KEYS,
  loadCachedTelemetry,
  saveCachedTelemetry,
  saveToCache,
  getCacheRelativeAge,
  getOfflineQueue,
  processOfflineQueue,
  getCacheStorageStats,
  getDefaultBikeTelemetry,
  reconcileCollectionWithCache,
  hydrateAllCachesFromIndexedDB,
  OFFLINE_SYNC_EVENT,
  DATA_UPDATED_EVENT,
  NETWORK_MODE_CHANGED_EVENT,
  isManualOfflineMode,
  setManualOfflineMode,
  getSessionAuthHeaders,
  BikeTelemetrySnapshot,
  CacheStorageStats,
  QueuedOfflineAction
} from './utils/telemetryCache';
import { initHybridDatabaseEngine, runHybridSyncCycle } from './utils/firebaseHybridSync';

let hasBootedInCurrentAppInstance = false;

const AppContent: React.FC = () => {
  const { currentUser, loading, authModalOpen, closeAuthModal } = useAuth();
  const { playTacticalClick, playChime, reducedMotion } = useAudio();

  const [tabHistory, setTabHistory] = useState<string[]>(['dashboard']);
  const [showExitToast, setShowExitToast] = useState<boolean>(false);
  const [hasCompletedInitialBoot, setHasCompletedInitialBoot] = useState<boolean>(
    () => hasBootedInCurrentAppInstance
  );

  const handleCompleteInitialBoot = useCallback(() => {
    hasBootedInCurrentAppInstance = true;
    setHasCompletedInitialBoot(true);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('ghost_protocol_initial_boot_done', 'true');
      } catch {}
    }
  }, []);
  const lastBackPressRef = useRef<number>(0);

  const resolveInitialTab = (): string => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname === '/squadron-showdown') {
        return 'squadron-showdown';
      }
      try {
        // Ensure the app always starts cleanly on Home Screen (Cockpit Dashboard)
        const url = new URL(window.location.href);
        if (
          url.searchParams.has('route') ||
          url.searchParams.has('target') ||
          url.searchParams.has('photoBridgeSynced')
        ) {
          url.searchParams.delete('route');
          url.searchParams.delete('target');
          url.searchParams.delete('photoBridgeSynced');
          window.history.replaceState({ tab: 'dashboard', isGuard: false, isRoot: true }, '', url.pathname);
        }
        sessionStorage.removeItem('ghost_protocol_active_tab');
        localStorage.removeItem('ghost_protocol_active_tab');
        localStorage.removeItem('ghost_active_photo_target');
        localStorage.removeItem('ghost_active_photo_timestamp');
      } catch {}
    }
    return 'dashboard';
  };

  const [currentTab, setCurrentTabState] = useState<string>('dashboard');

  // Initialize initial history entry with a Root Guard so Android Back button can never close the app unexpectedly
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const initialTab = resolveInitialTab();
      setCurrentTabState(initialTab);
      setTabHistory([initialTab]);

      // Always establish a root_guard entry at the base of the history stack
      window.history.replaceState(
        { tab: 'root_guard', isGuard: true },
        '',
        window.location.href
      );
      // Immediately push the active tab entry so history.length >= 2 and Android hardware back button always fires popstate
      window.history.pushState(
        { tab: initialTab, isGuard: false, isRoot: initialTab === 'dashboard' },
        '',
        window.location.href
      );
    } catch {
      // Ignore
    }
  }, []);

  // Global Android WebView scheme guard: intercepts any <a href="tel:...">, <a href="mailto:...">,
  // or <a href="upi://..."> across the entire app so MainActivity.java receives intent:// URIs
  // instead of crashing with net::ERR_UNKNOWN_URL_SCHEME.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleGlobalAnchorScheme = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const rawHref = (anchor.getAttribute('href') || '').trim();
      if (!rawHref) return;

      if (/^tel:/i.test(rawHref)) {
        e.preventDefault();
        openPhoneDialer(rawHref);
      } else if (/^mailto:/i.test(rawHref)) {
        e.preventDefault();
        openMailClient(rawHref);
      } else if (/^(upi|tez|phonepe|paytmmp):\/\//i.test(rawHref)) {
        e.preventDefault();
        const lower = rawHref.toLowerCase();
        const app = lower.startsWith('tez://')
          ? 'gpay'
          : lower.startsWith('phonepe://')
          ? 'phonepe'
          : lower.startsWith('paytmmp://')
          ? 'paytm'
          : 'upi';
        openInUpiApp(rawHref, app);
      }
    };

    document.addEventListener('click', handleGlobalAnchorScheme);
    return () => document.removeEventListener('click', handleGlobalAnchorScheme);
  }, []);

  const setCurrentTab = (tab: string, isBackAction = false) => {
    if (tab === currentTab) return;

    handleCompleteInitialBoot();

    if (!isBackAction) {
      setTabHistory(h => [...h, currentTab]);
    }

    setCurrentTabState(tab);

    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('ghost_protocol_active_tab', tab);
        if (!isBackAction) {
          const url = new URL(window.location.href);
          if (tab === 'squadron-showdown' || tab === 'squadron_showdown') {
            url.pathname = '/squadron-showdown';
            url.searchParams.delete('route');
          } else {
            if (url.pathname === '/squadron-showdown') {
              url.pathname = '/';
            }
            url.searchParams.delete('route');
          }
          window.history.pushState(
            { tab, isGuard: false, isRoot: tab === 'dashboard' },
            '',
            url.toString()
          );
        }
      } catch {
        // Ignore storage or history errors
      }
    }
  };

  const [jetEngineerTab, setJetEngineerTab] = useState<'ask' | 'train'>('ask');
  const [jetEngineerModel, setJetEngineerModel] = useState<'F77' | 'X47' | 'Both'>('F77');
  const [chargingMode, setChargingMode] = useState<'map' | 'autopilot'>('map');
  const [searchOpen, setSearchOpen] = useState(false);

  // Pilot Welcome Screen state with cinematic take-off transition
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('welcome') === '1';
    }
    return false;
  });
  const [isTakingOff, setIsTakingOff] = useState<boolean>(false);

  const handleGoBack = () => {
    playTacticalClick();
    if (searchOpen) {
      setSearchOpen(false);
      return;
    }
    if (authModalOpen) {
      closeAuthModal();
      return;
    }
    if (showWelcome) {
      setShowWelcome(false);
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      if (tabHistory.length > 0 && tabHistory[tabHistory.length - 1] !== currentTab) {
        const prevTab = tabHistory[tabHistory.length - 1];
        setTabHistory(h => h.slice(0, h.length - 1));
        setCurrentTab(prevTab, true);
      } else {
        setCurrentTab('dashboard', true);
      }
    }
  };

  // Comprehensive Android Back-Button & Browser History popstate Handler
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = (e: PopStateEvent) => {
      // 1. Close active overlays first without leaving the page
      if (searchOpen) {
        setSearchOpen(false);
        try {
          window.history.pushState(
            { tab: currentTab, isGuard: false, isRoot: currentTab === 'dashboard' },
            '',
            window.location.href
          );
        } catch {}
        return;
      }
      if (authModalOpen) {
        closeAuthModal();
        try {
          window.history.pushState(
            { tab: currentTab, isGuard: false, isRoot: currentTab === 'dashboard' },
            '',
            window.location.href
          );
        } catch {}
        return;
      }
      if (showWelcome) {
        setShowWelcome(false);
        try {
          window.history.pushState(
            { tab: currentTab, isGuard: false, isRoot: currentTab === 'dashboard' },
            '',
            window.location.href
          );
        } catch {}
        return;
      }

      // 2. Check if we reached the root guard (base of browser history)
      const isGuardHit = e.state?.isGuard === true || e.state?.tab === 'root_guard';

      if (isGuardHit) {
        // If user was on a subpage (e.g. Jet Engineer, Priority Issues, Charging, etc.)
        // Never exit the app: navigate back to the previous tab or home dashboard!
        if (currentTab !== 'dashboard') {
          const prevTab =
            tabHistory.length > 0 && tabHistory[tabHistory.length - 1] !== currentTab
              ? tabHistory[tabHistory.length - 1]
              : 'dashboard';

          setHasCompletedInitialBoot(true);
          setCurrentTabState(prevTab);
          setTabHistory(h => (h.length > 0 ? h.slice(0, h.length - 1) : ['dashboard']));
          try {
            sessionStorage.setItem('ghost_protocol_active_tab', prevTab);
            const url = new URL(window.location.href);
            if (prevTab === 'dashboard') {
              url.pathname = '/';
              url.searchParams.delete('route');
            } else {
              url.searchParams.set('route', prevTab);
            }
            // Re-establish active entry so history stays resilient
            window.history.pushState(
              { tab: prevTab, isGuard: false, isRoot: prevTab === 'dashboard' },
              '',
              url.toString()
            );
          } catch {}
          return;
        }

        // We are on 'dashboard' (Root of the App).
        // Handle Android Double-Tap Back to Exit
        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          // Second back press within 2 seconds: allow exit
          setShowExitToast(false);
        } else {
          // First back press at root: DO NOT EXIT THE APP.
          // Show tactical exit warning toast, and re-push dashboard state to restore guard!
          lastBackPressRef.current = now;
          setShowExitToast(true);
          setTimeout(() => setShowExitToast(false), 2200);

          try {
            const url = new URL(window.location.href);
            url.pathname = '/';
            url.searchParams.delete('route');
            window.history.pushState(
              { tab: 'dashboard', isGuard: false, isRoot: true },
              '',
              url.toString()
            );
          } catch {}
        }
        return;
      }

      // 3. Regular History Navigation between subpages
      if (!hasCompletedInitialBoot) {
        return;
      }
      const stateTab = e.state?.tab;
      const fromPath =
        window.location.pathname === '/squadron-showdown' ? 'squadron-showdown' : null;
      const targetTab = stateTab || fromPath;

      if (targetTab && targetTab !== currentTab) {
        setCurrentTabState(targetTab);
        setTabHistory(h => (h.length > 0 ? h.slice(0, h.length - 1) : ['dashboard']));
        try {
          sessionStorage.setItem('ghost_protocol_active_tab', targetTab);
        } catch {}
        return;
      }

      // 4. Fallback if targetTab is missing or matches currentTab but we are on a subpage
      if (currentTab !== 'dashboard') {
        const prevTab =
          tabHistory.length > 0 && tabHistory[tabHistory.length - 1] !== currentTab
            ? tabHistory[tabHistory.length - 1]
            : 'dashboard';

        setHasCompletedInitialBoot(true);
        setCurrentTabState(prevTab);
        setTabHistory(h => (h.length > 0 ? h.slice(0, h.length - 1) : ['dashboard']));
        try {
          sessionStorage.setItem('ghost_protocol_active_tab', prevTab);
          const url = new URL(window.location.href);
          url.pathname = '/';
          url.searchParams.delete('route');
          window.history.replaceState(
            { tab: prevTab, isGuard: false, isRoot: prevTab === 'dashboard' },
            '',
            url.toString()
          );
        } catch {}
        return;
      }

      // 5. If we are on dashboard with no target tab, treat as root back press
      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        setShowExitToast(false);
      } else {
        lastBackPressRef.current = now;
        setShowExitToast(true);
        setTimeout(() => setShowExitToast(false), 2200);

        try {
          const url = new URL(window.location.href);
          url.pathname = '/';
          url.searchParams.delete('route');
          window.history.pushState(
            { tab: 'dashboard', isGuard: false, isRoot: true },
            '',
            url.toString()
          );
        } catch {}
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentTab, tabHistory, searchOpen, authModalOpen, showWelcome, closeAuthModal]);

  const handleTakeOffStart = () => {
    setIsTakingOff(true);
  };

  const handleTakeOffComplete = () => {
    setShowWelcome(false);
    setIsTakingOff(false);
  };

  // Load initial cached telemetry if available (prevents empty flash during network downtime)
  const initialCache = typeof window !== 'undefined' ? loadCachedTelemetry() : null;

  // Global state collections initialized from versioned cache
  const [rides, setRides] = useState<Ride[]>(initialCache?.data.rides || []);
  const [emergencies, setEmergencies] = useState<EmergencyRequest[]>(initialCache?.data.emergencies || []);
  const [problems, setProblems] = useState<ProblemReport[]>(initialCache?.data.problems || []);
  const [discussions, setDiscussions] = useState<DiscussionPost[]>(initialCache?.data.discussions || []);
  const [chargingStations, setChargingStations] = useState<ChargingStation[]>(initialCache?.data.chargingStations || []);
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialCache?.data.notifications || []);
  const [bikeTelemetry, setBikeTelemetry] = useState<BikeTelemetrySnapshot>(
    initialCache?.data.bikeTelemetry || getDefaultBikeTelemetry()
  );

  // Offline and cache version telemetry state
  const [isSimulatedOffline, setIsSimulatedOffline] = useState<boolean>(() =>
    typeof window !== 'undefined' ? isManualOfflineMode() : false
  );
  const isSimulatedOfflineRef = useRef<boolean>(isSimulatedOffline);
  isSimulatedOfflineRef.current = isSimulatedOffline;

  const [isOffline, setIsOffline] = useState<boolean>(() => {
    const netOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
    const manualOff = typeof window !== 'undefined' ? isManualOfflineMode() : false;
    return netOffline || manualOff;
  });
  const [cacheAge, setCacheAge] = useState<string>(getCacheRelativeAge(initialCache?.updatedAt));
  const [cacheStats, setCacheStats] = useState<CacheStorageStats | null>(
    typeof window !== 'undefined' ? getCacheStorageStats() : null
  );
  const [queuedActions, setQueuedActions] = useState<QueuedOfflineAction[]>(
    typeof window !== 'undefined' ? getOfflineQueue() : []
  );

  // Sync queued offline actions when network returns
  const syncOfflineQueue = async () => {
    if (isSimulatedOfflineRef.current || isManualOfflineMode()) return;
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    const syncedCount = await processOfflineQueue();
    setQueuedActions(getOfflineQueue());
    if (syncedCount > 0) {
      playChime();
      await loadGlobalData(true);
    }
  };

  // Load telemetry data from backend with versioned cache fallback & bidirectional reconciliation
  const loadGlobalData = async (forceOnline?: boolean) => {
    const manualOfflineActive =
      forceOnline === true ? false : isSimulatedOfflineRef.current || isManualOfflineMode();

    if (manualOfflineActive) {
      // In manual/simulated offline mode, serve directly from versioned local cache
      setIsOffline(true);
      const cached = loadCachedTelemetry();
      if (cached) {
        setRides(cached.data.rides);
        setEmergencies(cached.data.emergencies);
        setProblems(cached.data.problems);
        setDiscussions(cached.data.discussions);
        setChargingStations(cached.data.chargingStations);
        setNotifications(cached.data.notifications);
        if (cached.data.bikeTelemetry) setBikeTelemetry(cached.data.bikeTelemetry);
        setCacheAge(getCacheRelativeAge(cached.updatedAt));
        setCacheStats(getCacheStorageStats());
      } else {
        setCacheAge('Cached');
      }
      return;
    }

    try {
      const reqHeaders = getSessionAuthHeaders();
      const [rRes, eRes, pRes, dRes, cRes, nRes] = await Promise.all([
        fetch('/api/rides', { credentials: 'same-origin', headers: reqHeaders }),
        fetch('/api/emergency', { credentials: 'same-origin', headers: reqHeaders }),
        fetch('/api/problems', { credentials: 'same-origin', headers: reqHeaders }),
        fetch('/api/discussions', { credentials: 'same-origin', headers: reqHeaders }),
        fetch('/api/charging', { credentials: 'same-origin', headers: reqHeaders }),
        currentUser
          ? fetch('/api/notifications', { credentials: 'same-origin', headers: reqHeaders })
          : Promise.resolve(null)
      ]);

      const rawRides = rRes.ok ? (await rRes.json()).rides || [] : rides;
      const rawEmergencies = eRes.ok ? (await eRes.json()).emergencies || [] : emergencies;
      const rawProblems = pRes.ok ? (await pRes.json()).problems || [] : problems;
      const rawDiscussions = dRes.ok ? (await dRes.json()).discussions || [] : discussions;
      const rawChargers = cRes.ok ? (await cRes.json()).stations || [] : chargingStations;
      const fetchedNotifications =
        nRes && nRes.ok ? (await nRes.json()).notifications || [] : currentUser ? notifications : [];

      const fetchedRides = reconcileCollectionWithCache<Ride>(CACHE_KEYS.RIDES, rawRides);
      const fetchedEmergencies = reconcileCollectionWithCache<EmergencyRequest>(CACHE_KEYS.EMERGENCY, rawEmergencies);
      const fetchedProblems = reconcileCollectionWithCache<ProblemReport>(CACHE_KEYS.PROBLEMS, rawProblems);
      const fetchedDiscussions = reconcileCollectionWithCache<DiscussionPost>(CACHE_KEYS.DISCUSSIONS, rawDiscussions);
      const fetchedChargers = reconcileCollectionWithCache<ChargingStation>(CACHE_KEYS.CHARGING, rawChargers, {
        appendMissing: true
      });

      saveToCache(CACHE_KEYS.RIDES, fetchedRides, { silent: true });
      saveToCache(CACHE_KEYS.EMERGENCY, fetchedEmergencies, { silent: true });
      saveToCache(CACHE_KEYS.PROBLEMS, fetchedProblems, { silent: true });
      saveToCache(CACHE_KEYS.DISCUSSIONS, fetchedDiscussions, { silent: true });

      setRides(fetchedRides);
      setEmergencies(fetchedEmergencies);
      setProblems(fetchedProblems);
      setDiscussions(fetchedDiscussions);
      setChargingStations(fetchedChargers);
      setNotifications(fetchedNotifications);

      if (!isSimulatedOfflineRef.current && !isManualOfflineMode()) {
        setIsOffline(false);
        setCacheAge('Live');
      }

      // Persist fresh snapshot to versioned localStorage cache
      saveCachedTelemetry({
        rides: fetchedRides,
        emergencies: fetchedEmergencies,
        problems: fetchedProblems,
        discussions: fetchedDiscussions,
        chargingStations: fetchedChargers,
        notifications: fetchedNotifications,
        bikeTelemetry
      });
      setCacheStats(getCacheStorageStats());
    } catch (err) {
      console.warn('[GHOST PROTOCOL] Network request failed. Falling back to versioned telemetry cache:', err);
      setIsOffline(true);
      const cached = loadCachedTelemetry();
      if (cached) {
        setRides(cached.data.rides);
        setEmergencies(cached.data.emergencies);
        setProblems(cached.data.problems);
        setDiscussions(cached.data.discussions);
        setChargingStations(cached.data.chargingStations);
        setNotifications(cached.data.notifications);
        if (cached.data.bikeTelemetry) setBikeTelemetry(cached.data.bikeTelemetry);
        setCacheAge(getCacheRelativeAge(cached.updatedAt));
        setCacheStats(getCacheStorageStats());
      }
    }
  };

  useEffect(() => {
    void hydrateAllCachesFromIndexedDB();
    initHybridDatabaseEngine();
    const handleQueueEvent = () => {
      setQueuedActions(getOfflineQueue());
    };
    const handleDataUpdated = () => {
      const cached = loadCachedTelemetry();
      if (cached) {
        setRides(cached.data.rides);
        setEmergencies(cached.data.emergencies);
        setProblems(cached.data.problems);
        setDiscussions(cached.data.discussions);
        setChargingStations(cached.data.chargingStations);
        setCacheStats(getCacheStorageStats());
      }
      if (!isSimulatedOfflineRef.current && !isManualOfflineMode()) {
        void loadGlobalData();
      }
    };
    const handleNetworkModeChanged = () => {
      const manualOff = isManualOfflineMode();
      isSimulatedOfflineRef.current = manualOff;
      setIsSimulatedOffline(manualOff);
      const netOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      setIsOffline(manualOff || !netOnline);
    };
    window.addEventListener(OFFLINE_SYNC_EVENT, handleQueueEvent);
    window.addEventListener(DATA_UPDATED_EVENT, handleDataUpdated);
    window.addEventListener(NETWORK_MODE_CHANGED_EVENT, handleNetworkModeChanged);
    return () => {
      window.removeEventListener(OFFLINE_SYNC_EVENT, handleQueueEvent);
      window.removeEventListener(DATA_UPDATED_EVENT, handleDataUpdated);
      window.removeEventListener(NETWORK_MODE_CHANGED_EVENT, handleNetworkModeChanged);
    };
  }, []);

  const handleToggleSimulateOffline = () => {
    const next = !(isSimulatedOfflineRef.current || isManualOfflineMode());
    isSimulatedOfflineRef.current = next;
    setManualOfflineMode(next);
    setIsSimulatedOffline(next);

    if (next) {
      setIsOffline(true);
      const cached = loadCachedTelemetry();
      if (cached) {
        setRides(cached.data.rides);
        setEmergencies(cached.data.emergencies);
        setProblems(cached.data.problems);
        setDiscussions(cached.data.discussions);
        setChargingStations(cached.data.chargingStations);
        setNotifications(cached.data.notifications);
        if (cached.data.bikeTelemetry) setBikeTelemetry(cached.data.bikeTelemetry);
        setCacheAge(getCacheRelativeAge(cached.updatedAt));
        setCacheStats(getCacheStorageStats());
      } else {
        setCacheAge('Cached');
      }
    } else {
      const netOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      setIsOffline(!netOnline);
      if (netOnline) {
        void syncOfflineQueue();
        void loadGlobalData(true);
      }
    }
  };

  const handleForceRefreshCache = async () => {
    await loadGlobalData();
  };

  useEffect(() => {
    const handleOnline = () => {
      if (!isSimulatedOfflineRef.current && !isManualOfflineMode()) {
        setIsOffline(false);
        void syncOfflineQueue();
        void loadGlobalData(true);
      }
    };

    const handleOffline = () => {
      setIsOffline(true);
      const cached = loadCachedTelemetry();
      if (cached) setCacheAge(getCacheRelativeAge(cached.updatedAt));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [currentUser?.id, isSimulatedOffline]);

  useEffect(() => {
    loadGlobalData();
  }, [currentUser?.id]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as any });
  }, [currentTab]);

  // Global shortcut for search (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleMarkNotificationRead = async (id: string) => {
    // Optimistic local state update so unread count updates immediately
    setNotifications(prev => {
      const next = prev.map(n => (n.id === id ? { ...n, read: true } : n));
      const cached = loadCachedTelemetry();
      if (cached) {
        saveCachedTelemetry({ ...cached.data, notifications: next });
      }
      return next;
    });

    if (!currentUser) return;
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders()
      });
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    // Optimistic local state update so unread count updates immediately
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }));
      const cached = loadCachedTelemetry();
      if (cached) {
        saveCachedTelemetry({ ...cached.data, notifications: next });
      }
      return next;
    });

    if (!currentUser) return;
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders()
      });
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleClearAllNotifications = async () => {
    setNotifications([]);
    const cached = loadCachedTelemetry();
    if (cached) {
      saveCachedTelemetry({ ...cached.data, notifications: [] });
    }

    if (!currentUser) return;
    try {
      await fetch('/api/notifications/clear-all', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders()
      });
    } catch (err) {
      console.error('Failed to clear all notifications:', err);
    }
  };

  const handleClearNotification = async (id: string) => {
    setNotifications(prev => {
      const next = prev.filter(n => n.id !== id);
      const cached = loadCachedTelemetry();
      if (cached) {
        saveCachedTelemetry({ ...cached.data, notifications: next });
      }
      return next;
    });

    if (!currentUser) return;
    try {
      await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders()
      });
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  // Enforce Ultraviolette Employee role navigation restriction (strictly 'problems' or 'service')
  useEffect(() => {
    if (currentUser?.role === 'uv_employee') {
      if (currentTab !== 'problems' && currentTab !== 'service') {
        setCurrentTabState('problems');
      }
    }
  }, [currentUser?.role, currentTab]);

  if (typeof window !== 'undefined') {
    const bridgeParams = new URLSearchParams(window.location.search);
    const photoBridgeSession = bridgeParams.get('photoBridge');
    if (photoBridgeSession) {
      const bridgeMode = bridgeParams.get('mode') === 'camera' ? 'camera' : 'gallery';
      const bridgeTarget = bridgeParams.get('target') || 'modifications';
      return (
        <AndroidPhotoBridge
          sessionId={photoBridgeSession}
          initialMode={bridgeMode}
          target={bridgeTarget}
        />
      );
    }
  }

  if (currentTab === 'squadron-showdown' || currentTab === 'squadron_showdown') {
    return <SquadronShowdownGame onExitToGhostProtocol={() => setCurrentTab('dashboard')} />;
  }

  if (loading && !currentUser) {
    return (
      <div className="min-h-screen bg-[#010204] flex flex-col items-center justify-center font-mono text-xs text-[#94A3B8] p-6 relative overflow-hidden select-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.08)_0%,rgba(1,2,4,0.98)_70%)] pointer-events-none" />
        <div className="relative z-10 flex flex-col items-center space-y-5 text-center">
          <div className="relative w-16 h-16 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-2 border-[#1E2D42] border-t-[#38BDF8] border-r-[#38BDF8]/40 animate-spin" />
            <div className="w-10 h-10 rounded-full bg-[#030712] border border-[#38BDF8]/40 flex items-center justify-center shadow-[0_0_20px_rgba(56,189,248,0.25)]">
              <Shield className="w-5 h-5 text-[#38BDF8] animate-pulse" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="font-sans font-black text-sm tracking-[0.25em] text-[#F8FAFC] uppercase">
              GHOST PROTOCOL
            </div>
            <div className="font-mono text-[10px] tracking-[0.18em] text-[#38BDF8] uppercase font-bold flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] animate-ping" />
              <span>INITIALIZING TELEMETRY LINK...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mandatory Authentication Gate: Unauthenticated users MUST sign in or register
  if (!currentUser) {
    return (
      <PilotWelcomeScreen
        onTakeOffStart={handleTakeOffStart}
        onTakeOffComplete={handleTakeOffComplete}
        reducedMotion={reducedMotion}
      />
    );
  }

  const effectiveOffline = isOffline || isSimulatedOffline;

  return (
    <>
      {showWelcome && (
        <PilotWelcomeScreen
          onTakeOffStart={handleTakeOffStart}
          onTakeOffComplete={handleTakeOffComplete}
          reducedMotion={reducedMotion}
        />
      )}

      <div
        className={`min-h-[100dvh] bg-[#020305] text-[#F8FAFC] flex flex-col font-sans transition-[opacity,transform] duration-300 ease-out ${
          showWelcome && !isTakingOff
            ? 'opacity-0 pointer-events-none'
            : 'opacity-100 pointer-events-auto'
        }`}
        style={{
          transform: showWelcome && !isTakingOff ? 'translate3d(0, 12px, 0)' : 'none'
        }}
      >
        {/* Navigation Header - Rendered on all operational sub-systems with enter/exit animation */}
        <AnimatePresence initial={false}>
          {currentTab !== 'dashboard' && currentTab !== 'system_controls' && currentTab !== 'squadron-showdown' && currentTab !== 'squadron_showdown' && (
            <motion.div
              key="operational-nav-header"
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
              transition={{ duration: reducedMotion ? 0.12 : 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="sticky top-0 z-40"
            >
              <Navigation
                currentTab={currentTab}
                setCurrentTab={setCurrentTab}
                onGoBack={handleGoBack}
                openSearch={() => setSearchOpen(true)}
                notifications={notifications}
                onMarkNotificationRead={handleMarkNotificationRead}
                onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
                onClearAllNotifications={handleClearAllNotifications}
                onClearNotification={handleClearNotification}
                isOffline={effectiveOffline}
                isSimulatedOffline={isSimulatedOffline}
                onToggleSimulateOffline={handleToggleSimulateOffline}
                cacheAge={cacheAge}
                queuedActionCount={queuedActions.length}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Priority SOS Alert Banner for Registered City Riders & Admins (on subpages) */}
        {currentTab !== 'dashboard' && currentTab !== 'system_controls' && notifications.filter(n => !n.read && n.type === 'emergency').length > 0 && (
          <div className="bg-[#1A090D] border-b-2 border-[#E04F5F] px-4 py-2.5 z-40 shadow-[0_6px_24px_rgba(224,79,95,0.35)]">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 font-mono text-xs">
              {(() => {
                const topAlert = notifications.filter(n => !n.read && n.type === 'emergency')[0];
                const isAdminAlert =
                  topAlert.isAdminAlert ||
                  currentUser?.isOwner ||
                  currentUser?.role === 'admin' ||
                  currentUser?.role === 'superadmin';
                return (
                  <>
                    <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded bg-[#E04F5F] text-white flex items-center justify-center shrink-0 animate-pulse">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-[#E04F5F] text-white text-[10px] font-bold uppercase">
                            {isAdminAlert ? 'PRIORITY ADMIN SOS ALERT' : `YOUR CITY SOS ALERT${topAlert.city ? ` (${topAlert.city.toUpperCase()})` : ''}`}
                          </span>
                          <span className="font-bold text-[#F8FAFC] truncate">{topAlert.title}</span>
                        </div>
                        <div className="text-[11px] text-[#FCA5A5] truncate mt-0.5">{topAlert.message}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          playTacticalClick();
                          handleMarkNotificationRead(topAlert.id);
                          setCurrentTab('emergency');
                        }}
                        className="px-3 py-1.5 rounded bg-[#E04F5F] hover:bg-[#c93f4e] text-white font-bold text-[11px] uppercase cursor-pointer"
                      >
                        OPEN SQUADRON SOS
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          playTacticalClick();
                          handleMarkNotificationRead(topAlert.id);
                        }}
                        className="p-1.5 rounded bg-[#281318] hover:bg-[#3A1B22] text-[#FCA5A5] cursor-pointer"
                        title="Dismiss SOS Alert"
                        aria-label="Dismiss SOS Alert"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

      {/* Main Viewport Container with Directional Enter/Exit Avionics Transition */}
      <main className={`flex-1 w-full mx-auto ${currentTab === 'dashboard' || currentTab === 'system_controls' || currentTab === 'squadron-showdown' || currentTab === 'squadron_showdown' ? 'p-0 max-w-none' : 'max-w-7xl px-4 sm:px-6 py-6'}`}>
        <AvionicsPageTransition activeKey={currentTab} reducedMotion={reducedMotion}>
          {(currentTab === 'squadron-showdown' || currentTab === 'squadron_showdown') && (
            <SquadronShowdownGame onExitToGhostProtocol={() => setCurrentTab('dashboard')} />
          )}
          {(currentTab === 'dashboard' || currentTab === 'system_controls') && (
            <CockpitDashboard
              rides={rides}
              emergencies={emergencies}
              problems={problems}
              discussions={discussions}
              chargingStations={chargingStations}
              initialShowSystemControls={currentTab === 'system_controls'}
              skipBootAnimation={hasCompletedInitialBoot}
              onCompleteBoot={handleCompleteInitialBoot}
              onNavigate={(tabId, options) => {
                if (options?.jetMode) {
                  setJetEngineerTab(options.jetMode);
                }
                if (options?.jetModel) {
                  setJetEngineerModel(options.jetModel);
                }
                if (options?.chargingMode) {
                  setChargingMode(options.chargingMode);
                } else if (tabId === 'charging') {
                  setChargingMode('map');
                }
                setCurrentTab(tabId);
              }}
              selectedJetModel={jetEngineerModel}
              onSelectJetModel={setJetEngineerModel}
              isOffline={effectiveOffline}
              isSimulatedOffline={isSimulatedOffline}
              onToggleSimulateOffline={handleToggleSimulateOffline}
              cacheAge={cacheAge}
              queuedActionCount={queuedActions.length}
              notifications={notifications}
              onMarkNotificationRead={handleMarkNotificationRead}
              onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
              onClearAllNotifications={handleClearAllNotifications}
              onClearNotification={handleClearNotification}
              openSearch={() => setSearchOpen(true)}
            />
          )}
          {currentTab === 'mission' && <MissionMode />}
          {currentTab === 'jet_engineer' && (
            <JetEngineer initialTab={jetEngineerTab} initialModel={jetEngineerModel} />
          )}
          {currentTab === 'emergency' && <SquadronAssist />}
          {currentTab === 'problems' && <ProblemTracker />}
          {currentTab === 'modifications' && <ModificationsLab />}
          {currentTab === 'charging' && <ChargingNetwork initialMode={chargingMode} />}
          {currentTab === 'marketplace' && <Marketplace />}
          {currentTab === 'service' && <ServiceIntelligence />}
          {currentTab === 'discussions' && <Discussions />}
          {currentTab === 'garage' && <MyGarage />}
          {currentTab === 'admin' && <AdminCentre />}
          {currentTab === 'contribute' && (
            <ContributionHub onBackToCockpit={() => setCurrentTab('dashboard')} />
          )}
        </AvionicsPageTransition>
      </main>

      {/* Global Search Modal */}
      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={setCurrentTab}
      />

      {/* Android Back-Press Exit Confirmation Toast */}
      <AnimatePresence>
        {showExitToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-xl bg-[#0D121D]/95 border border-[#38BDF8]/60 text-[#F8FAFC] font-mono text-xs font-bold tracking-wider shadow-[0_10px_30px_rgba(0,0,0,0.9)] backdrop-blur-md flex items-center gap-2.5 pointer-events-none"
          >
            <div className="w-2 h-2 rounded-full bg-[#38BDF8] animate-ping" />
            <span>PRESS BACK AGAIN TO EXIT GHOST PROTOCOL</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Technical Footer (Rendered on sub-pages only; Home Screen is full-cockpit) */}
      {currentTab !== 'dashboard' && currentTab !== 'system_controls' && currentTab !== 'squadron-showdown' && currentTab !== 'squadron_showdown' && (
        <footer className="mt-auto border-t border-[#121B29] bg-[#010204] py-6 px-4 sm:px-6 text-xs font-mono text-[#64748B]">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 rounded bg-[#070B12] border border-[#1E2D42] flex items-center justify-center text-[#38BDF8]">
                <Shield className="w-3.5 h-3.5 text-[#38BDF8]" />
              </div>
              <div>
                <div className="text-[#E2E8F0] font-bold">GHOST PROTOCOL</div>
                <div className="text-[10px] text-[#64748B]">Ghost Protocol Digital Operations</div>
              </div>
            </div>

            <div className="text-center md:text-right text-[11px] leading-relaxed max-w-xl text-[#94A3B8]">
              Independent private owner platform for verified Ultraviolette motorcycle operators. Not an official Ultraviolette Automotive Pvt. Ltd. manufacturer platform.
            </div>
          </div>
        </footer>
      )}
    </div>
    </>
  );
};

export default function App() {
  return (
    <AudioProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </AudioProvider>
  );
}
