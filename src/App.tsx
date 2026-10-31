import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AudioProvider, useAudio } from './context/AudioContext';
import { Navigation } from './components/Navigation';
import { TacticalDashboard } from './components/TacticalDashboard';
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
import { AvionicsPageTransition, AnimatePresence, motion } from './components/AvionicsTransition';
import { Ride, EmergencyRequest, ProblemReport, DiscussionPost, ChargingStation, NotificationItem } from './types';
import { Shield, Radio, Lock, AlertTriangle, X } from 'lucide-react';

const SquadronShowdownGame = React.lazy(() => import('./games/squadron-showdown/SquadronShowdownGame'));

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
  getSessionAuthHeaders,
  BikeTelemetrySnapshot,
  CacheStorageStats,
  QueuedOfflineAction
} from './utils/telemetryCache';
import { initHybridDatabaseEngine, runHybridSyncCycle } from './utils/firebaseHybridSync';

const AppContent: React.FC = () => {
  const { currentUser, loading } = useAuth();
  const { playTacticalClick, playChime, reducedMotion } = useAudio();

  const [tabHistory, setTabHistory] = useState<string[]>(['dashboard']);

  const [currentTab, setCurrentTabState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname === '/squadron-showdown') {
        return 'squadron-showdown';
      }
      const params = new URLSearchParams(window.location.search);
      const urlRoute = params.get('route');
      if (urlRoute) return urlRoute;
      const savedRoute = sessionStorage.getItem('ghost_protocol_active_tab');
      if (savedRoute) return savedRoute;
    }
    return 'dashboard';
  });

  const setCurrentTab = (tab: string, isBackAction = false) => {
    setCurrentTabState(prev => {
      if (prev !== tab && !isBackAction) {
        setTabHistory(h => [...h, prev]);
      }
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('ghost_protocol_active_tab', tab);
          if (prev !== tab && !isBackAction) {
            const url = new URL(window.location.href);
            if (tab === 'squadron-showdown' || tab === 'squadron_showdown') {
              url.pathname = '/squadron-showdown';
              url.searchParams.delete('route');
            } else {
              if (url.pathname === '/squadron-showdown') {
                url.pathname = '/';
              }
              if (tab === 'dashboard') {
                url.searchParams.delete('route');
              } else {
                url.searchParams.set('route', tab);
              }
            }
            window.history.pushState({ tab }, '', url.toString());
          }
        } catch {
          // Ignore storage or history errors
        }
      }
      return tab;
    });
  };

  const handleGoBack = () => {
    playTacticalClick();
    if (tabHistory.length > 0 && tabHistory[tabHistory.length - 1] !== currentTab) {
      const prevTab = tabHistory[tabHistory.length - 1];
      setTabHistory(h => h.slice(0, h.length - 1));
      setCurrentTab(prevTab, true);
    } else if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      setCurrentTab('dashboard', true);
    }
  };

  const [jetEngineerTab, setJetEngineerTab] = useState<'ask' | 'train'>('ask');
  const [jetEngineerModel, setJetEngineerModel] = useState<'F77' | 'X47' | 'Both'>('F77');
  const [chargingMode, setChargingMode] = useState<'map' | 'autopilot'>('map');
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = (e: PopStateEvent) => {
      const stateTab = e.state?.tab;
      const params = new URLSearchParams(window.location.search);
      const fromPath = window.location.pathname === '/squadron-showdown' ? 'squadron-showdown' : null;
      const nextTab = stateTab || fromPath || params.get('route') || 'dashboard';
      setCurrentTabState(nextTab);
      try {
        sessionStorage.setItem('ghost_protocol_active_tab', nextTab);
      } catch {
        // Ignore storage errors
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Pilot Welcome Screen state with cinematic take-off transition (accessible via Welcome Screen control or ?welcome=1)
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('welcome') === '1';
    }
    return false;
  });
  const [isTakingOff, setIsTakingOff] = useState<boolean>(false);

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
  const [isOffline, setIsOffline] = useState<boolean>(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [isSimulatedOffline, setIsSimulatedOffline] = useState<boolean>(false);
  const [cacheAge, setCacheAge] = useState<string>(getCacheRelativeAge(initialCache?.updatedAt));
  const [cacheStats, setCacheStats] = useState<CacheStorageStats | null>(
    typeof window !== 'undefined' ? getCacheStorageStats() : null
  );
  const [queuedActions, setQueuedActions] = useState<QueuedOfflineAction[]>(
    typeof window !== 'undefined' ? getOfflineQueue() : []
  );

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
      void loadGlobalData();
    };
    window.addEventListener(OFFLINE_SYNC_EVENT, handleQueueEvent);
    window.addEventListener(DATA_UPDATED_EVENT, handleDataUpdated);
    return () => {
      window.removeEventListener(OFFLINE_SYNC_EVENT, handleQueueEvent);
      window.removeEventListener(DATA_UPDATED_EVENT, handleDataUpdated);
    };
  }, []);

  // Sync queued offline actions when network returns
  const syncOfflineQueue = async () => {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    const syncedCount = await processOfflineQueue();
    setQueuedActions(getOfflineQueue());
    if (syncedCount > 0) {
      playChime();
      await loadGlobalData();
    }
  };

  // Load telemetry data from backend with versioned cache fallback & bidirectional reconciliation
  const loadGlobalData = async () => {
    if (isSimulatedOffline) {
      // In simulated offline downtime, serve directly from versioned local cache
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

      setIsOffline(false);
      setCacheAge('Live');

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

  const handleToggleSimulateOffline = () => {
    setIsSimulatedOffline(prev => {
      const next = !prev;
      if (next) {
        setIsOffline(true);
        const cached = loadCachedTelemetry();
        if (cached) {
          setCacheAge(getCacheRelativeAge(cached.updatedAt));
          setCacheStats(getCacheStorageStats());
        }
      } else {
        const netOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
        setIsOffline(!netOnline);
        if (netOnline) {
          syncOfflineQueue();
          setTimeout(loadGlobalData, 100);
        }
      }
      return next;
    });
  };

  const handleForceRefreshCache = async () => {
    await loadGlobalData();
  };

  useEffect(() => {
    const handleOnline = () => {
      if (!isSimulatedOffline) {
        setIsOffline(false);
        syncOfflineQueue();
        loadGlobalData();
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
    const interval = setInterval(() => {
      if (!isSimulatedOffline) {
        loadGlobalData();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [currentUser?.id, isSimulatedOffline]);

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
    if (!currentUser) return;
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders()
      });
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (!currentUser) return;
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders()
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.error('Failed to mark all read:', err);
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

  if (currentTab === 'squadron-showdown' || currentTab === 'squadron_showdown') {
    return (
      <React.Suspense
        fallback={
          <div className="min-h-screen w-full bg-[#050811] flex flex-col items-center justify-center text-cyan-400 font-mono text-sm">
            INITIALIZING SQUADRON SHOWDOWN ARENA...
          </div>
        }
      >
        <SquadronShowdownGame onExitToGhostProtocol={() => setCurrentTab('dashboard')} />
      </React.Suspense>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020305] flex flex-col items-center justify-center font-mono text-xs text-[#64748B] space-y-3">
        <div className="w-8 h-8 rounded-full border border-[#1E2D42] border-t-[#38BDF8] animate-spin"></div>
        <div>INITIALIZING GHOST PROTOCOL TELEMETRY LINK...</div>
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
        className={`min-h-screen bg-[#020305] text-[#F8FAFC] flex flex-col font-sans transition-[opacity,transform] duration-300 ease-out ${
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
          {currentTab !== 'dashboard' && currentTab !== 'squadron-showdown' && currentTab !== 'squadron_showdown' && (
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
                isOffline={effectiveOffline}
                cacheAge={cacheAge}
                queuedActionCount={queuedActions.length}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Priority SOS Alert Banner for Registered City Riders & Admins */}
        {notifications.filter(n => !n.read && n.type === 'emergency').length > 0 && (
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
      <main className={`flex-1 w-full mx-auto ${currentTab === 'dashboard' || currentTab === 'squadron-showdown' || currentTab === 'squadron_showdown' ? 'p-0 max-w-none' : 'max-w-7xl px-4 sm:px-6 py-6'}`}>
        <AvionicsPageTransition activeKey={currentTab} reducedMotion={reducedMotion}>
          {(currentTab === 'squadron-showdown' || currentTab === 'squadron_showdown') && (
            <React.Suspense
              fallback={
                <div className="min-h-screen w-full bg-[#050811] flex flex-col items-center justify-center text-cyan-400 font-mono text-sm">
                  INITIALIZING SQUADRON SHOWDOWN ARENA...
                </div>
              }
            >
              <SquadronShowdownGame onExitToGhostProtocol={() => setCurrentTab('dashboard')} />
            </React.Suspense>
          )}
          {currentTab === 'dashboard' && (
            <CockpitDashboard
              rides={rides}
              emergencies={emergencies}
              problems={problems}
              discussions={discussions}
              chargingStations={chargingStations}
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

      {/* Technical Footer */}
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
