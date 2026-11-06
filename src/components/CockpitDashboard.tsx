import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Cpu,
  Radio,
  Wrench,
  Zap,
  Building2,
  Layers,
  MessageSquare,
  ShoppingBag,
  Calendar,
  Shield,
  Volume2,
  VolumeX,
  User as UserIcon,
  X,
  ChevronRight,
  BookOpen,
  LayoutGrid,
  MapPin,
  Gamepad2,
  Wifi,
  WifiOff,
  Info
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import {
  Ride,
  EmergencyRequest,
  ProblemReport,
  DiscussionPost,
  ChargingStation,
  NotificationItem
} from '../types';
import {
  ALL_SYSTEM_CONTROLS_DIRECTORY,
  COCKPIT_BOOT_TIMELINE_MS,
  COCKPIT_DIAL_CENTER,
  COCKPIT_INTERACTIVE_ZONES,
  COCKPIT_RADIAL_EXPANSION_RAYS,
  cycleCockpitSector,
  getCockpitBootTransformSpec,
  getCockpitZoneById,
  isUserAuthorizedForAdmin,
  resolveCockpitBootPhase,
  shouldSkipCockpitBootAnimation,
  resolveCockpitZoneFromCanvasPoint,
  resolveCockpitOperatorBadge,
  resolveJetEngineerAction,
  COCKPIT_COMMUNITY_DISCLAIMER_TEXT,
  COCKPIT_COMMUNITY_DISCLAIMER_TAGLINE,
  type CockpitBootPhase
} from '../utils/rules';

export interface CockpitNavigateOptions {
  jetMode?: 'ask' | 'train';
  jetModel?: 'F77' | 'X47' | 'Both';
  chargingMode?: 'map' | 'autopilot';
}

interface CockpitDashboardProps {
  rides: Ride[];
  emergencies: EmergencyRequest[];
  problems: ProblemReport[];
  discussions: DiscussionPost[];
  chargingStations: ChargingStation[];
  onNavigate: (tabId: string, options?: CockpitNavigateOptions) => void;
  selectedJetModel?: 'F77' | 'X47' | 'Both';
  onSelectJetModel?: (model: 'F77' | 'X47' | 'Both') => void;
  isOffline?: boolean;
  isSimulatedOffline?: boolean;
  onToggleSimulateOffline?: () => void;
  cacheAge?: string;
  queuedActionCount?: number;
  onOpenWelcome?: () => void;
  notifications?: NotificationItem[];
  onMarkNotificationRead?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
  openSearch?: () => void;
  initialShowSystemControls?: boolean;
  skipBootAnimation?: boolean;
}

/**
 * Tracks whether the initial Cockpit Core-to-Full-Interface transformation animation
 * has already played during the current application session so Back / Previous Page
 * navigation skips the animation immediately.
 */
let hasPlayedInitialCockpitBoot = false;

/**
 * Preserves the last active cockpit zone across navigation so the targeting arrow
 * and active sector remain aligned when returning from a subpage.
 */
let lastActiveCockpitZoneId = 'sector_priority_issues';

/**
 * Exact approved GHOST PROTOCOL dashboard image assets & photorealistic red-glow state layers.
 */
export const ORIGINAL_COCKPIT_DASHBOARD_IMAGE =
  '/assets/aistudio/file_00000000453c8208a2f1cff80222d13e_01cc3087.png';
export const COCKPIT_ALL_BLUE_IMAGE = '/assets/cockpit/cockpit_all_blue.png';
export const COCKPIT_ALL_RED_IMAGE = '/assets/cockpit/cockpit_all_red.png';

interface TransparentHotspot {
  id: string;
  testId: string;
  ariaLabel: string;
  routeId: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  clipPolygon?: string;
}

/**
 * Exact Transparent Hotspots across Navigation Bar, Contribute, 8 Dashboard Sectors, Reticle, and ALL SYSTEMS.
 * Percentage-based relative to the 941 x 1672 cockpit instrument canvas.
 */
const DASHBOARD_TRANSPARENT_HOTSPOTS: TransparentHotspot[] = [
  // --- TOP NAVIGATION BAR (RIDE • CONNECT • SUPPORT • UPGRADE) ---
  {
    id: 'nav_ride',
    testId: 'cockpit-hotspot-nav_ride',
    ariaLabel: 'RIDE',
    routeId: 'mission',
    leftPct: 11.5,
    topPct: 11.8,
    widthPct: 13.0,
    heightPct: 3.4
  },
  {
    id: 'nav_connect',
    testId: 'cockpit-hotspot-nav_connect',
    ariaLabel: 'CONNECT',
    routeId: 'discussions',
    leftPct: 28.0,
    topPct: 11.8,
    widthPct: 16.0,
    heightPct: 3.4
  },
  {
    id: 'nav_support',
    testId: 'cockpit-hotspot-nav_support',
    ariaLabel: 'SUPPORT',
    routeId: 'service',
    leftPct: 49.5,
    topPct: 11.8,
    widthPct: 16.5,
    heightPct: 3.4
  },
  {
    id: 'nav_upgrade',
    testId: 'cockpit-hotspot-nav_upgrade',
    ariaLabel: 'UPGRADE',
    routeId: 'modifications',
    leftPct: 71.5,
    topPct: 11.8,
    widthPct: 17.5,
    heightPct: 3.4
  },
  // --- STATUS ROW RIGHT: SUPPORT APP CONTRIBUTE ---
  {
    id: 'top_right_contribute',
    testId: 'cockpit-contribute-button',
    ariaLabel: 'SUPPORT APP CONTRIBUTE',
    routeId: 'contribute',
    leftPct: 71.8,
    topPct: 18.2,
    widthPct: 25.8,
    heightPct: 5.0
  },
  // --- 8 CIRCULAR COCKPIT SECTORS + AVIONICS CORE RETICLE ---
  {
    id: 'sector_jet_engineer',
    testId: 'cockpit-hotspot-sector_jet_engineer',
    ariaLabel: 'JET ENGINEER — AI ASSIST • DIAGNOSE • FIX',
    routeId: 'jet_engineer',
    leftPct: 28.5,
    topPct: 28.0,
    widthPct: 43.0,
    heightPct: 18.0,
    clipPolygon: 'polygon(18% 0%, 82% 0%, 100% 42%, 74% 100%, 26% 100%, 0% 42%)'
  },
  {
    id: 'sector_priority_issues',
    testId: 'cockpit-hotspot-sector_priority_issues',
    ariaLabel: 'PRIORITY ISSUES',
    routeId: 'problems',
    leftPct: 1.2,
    topPct: 37.5,
    widthPct: 16.0,
    heightPct: 11.5
  },
  {
    id: 'sector_mod_lab',
    testId: 'cockpit-hotspot-sector_mod_lab',
    ariaLabel: 'MOD LAB',
    routeId: 'modifications',
    leftPct: 1.2,
    topPct: 49.5,
    widthPct: 16.0,
    heightPct: 9.8
  },
  {
    id: 'sector_squadron_assist',
    testId: 'cockpit-hotspot-sector_squadron_assist',
    ariaLabel: 'SQUADRON ASSIST — RIDER HELP • EMERGENCY RSA',
    routeId: 'emergency',
    leftPct: 16.5,
    topPct: 37.0,
    widthPct: 21.8,
    heightPct: 22.0,
    clipPolygon: 'polygon(42% 0%, 100% 24%, 88% 50%, 100% 76%, 42% 100%, 0% 72%, 0% 28%)'
  },
  {
    id: 'sector_charging_network',
    testId: 'cockpit-hotspot-sector_charging_network',
    ariaLabel: 'CHARGING NETWORK — FIND • REPORT • NAVIGATE',
    routeId: 'charging',
    leftPct: 61.7,
    topPct: 37.0,
    widthPct: 21.8,
    heightPct: 22.0,
    clipPolygon: 'polygon(58% 0%, 100% 28%, 100% 72%, 58% 100%, 0% 76%, 12% 50%, 0% 24%)'
  },
  {
    id: 'sector_marketplace',
    testId: 'cockpit-hotspot-sector_marketplace',
    ariaLabel: 'MARKET PLACE',
    routeId: 'marketplace',
    leftPct: 82.8,
    topPct: 37.5,
    widthPct: 16.0,
    heightPct: 11.5
  },
  {
    id: 'sector_discussions',
    testId: 'cockpit-hotspot-sector_discussions',
    ariaLabel: 'DISCUSSIONS',
    routeId: 'discussions',
    leftPct: 82.8,
    topPct: 49.5,
    widthPct: 16.0,
    heightPct: 9.8
  },
  {
    id: 'sector_mission_mode',
    testId: 'cockpit-hotspot-sector_mission_mode',
    ariaLabel: 'MISSION MODE — PLAN • RIDE • LOG',
    routeId: 'mission',
    leftPct: 28.5,
    topPct: 56.5,
    widthPct: 43.0,
    heightPct: 14.5,
    clipPolygon: 'polygon(26% 0%, 74% 0%, 100% 58%, 82% 100%, 18% 100%, 0% 58%)'
  },
  {
    id: 'sector_center_core',
    testId: 'cockpit-hotspot-center-reticle',
    ariaLabel: 'AVIONICS CORE RETICLE',
    routeId: 'system_controls',
    leftPct: 37.0,
    topPct: 40.0,
    widthPct: 26.0,
    heightPct: 17.5,
    clipPolygon: 'circle(48% at 50% 50%)'
  },
  // --- BOTTOM ALL SYSTEMS BUTTON ---
  {
    id: 'panel_all_system_controls',
    testId: 'cockpit-hotspot-panel_all_system_controls',
    ariaLabel: 'ALL SYSTEMS',
    routeId: 'system_controls',
    leftPct: 16.5,
    topPct: 75.9,
    widthPct: 67.0,
    heightPct: 7.8
  }
];

export const CockpitDashboard: React.FC<CockpitDashboardProps> = ({
  onNavigate,
  selectedJetModel = 'F77',
  onSelectJetModel,
  isOffline = false,
  isSimulatedOffline = false,
  onToggleSimulateOffline,
  cacheAge = 'Just now',
  queuedActionCount = 0,
  notifications = [],
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  openSearch,
  initialShowSystemControls = false,
  skipBootAnimation = false
}) => {
  const { currentUser, openAuthModal, logout } = useAuth();
  const {
    soundEnabled,
    toggleSound,
    reducedMotion,
    playTacticalClick,
    playRadarPulse
  } = useAudio();

  const effectiveOffline = isOffline || isSimulatedOffline;

  const canAccessAdmin = useMemo(
    () => isUserAuthorizedForAdmin(currentUser),
    [currentUser]
  );

  const [jetModel, setJetModel] = useState<'F77' | 'X47' | 'Both'>(selectedJetModel);
  const [showSystemControls, setShowSystemControls] = useState<boolean>(Boolean(initialShowSystemControls));
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [networkToast, setNetworkToast] = useState<boolean>(false);
  const networkToastTimerRef = useRef<number | null>(null);

  // Interactive red-glow target state (defaults to 'sector_priority_issues' or last active zone)
  const [activeZoneId, setActiveZoneId] = useState<string>(() => lastActiveCockpitZoneId || 'sector_priority_issues');
  const [ignitingZoneId, setIgnitingZoneId] = useState<string | null>(null);
  const [isScrubbingDial, setIsScrubbingDial] = useState<boolean>(false);

  // Transforming Boot Animation State: 'core_logo' -> 'dial_expand' -> 'full_deploy' -> 'ready'
  const ForcedBootPhase = useMemo<CockpitBootPhase | null>(() => {
    if (typeof window === 'undefined') return null;
    const param = new URLSearchParams(window.location.search).get('bootPhase');
    if (
      param === 'core_logo' ||
      param === 'dial_expand' ||
      param === 'full_deploy' ||
      param === 'ready'
    ) {
      return param;
    }
    return null;
  }, []);

  const shouldSkipBoot = shouldSkipCockpitBootAnimation({
    hasBootedInSession: hasPlayedInitialCockpitBoot,
    skipBootAnimation,
    reducedMotion,
    initialShowSystemControls
  });

  const [bootPhase, setBootPhase] = useState<CockpitBootPhase>(() => {
    if (ForcedBootPhase) return ForcedBootPhase;
    if (shouldSkipBoot) return 'ready';
    return 'core_logo';
  });

  const stageRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const personaRef = useRef<HTMLDivElement>(null);

  const triggerNetworkStatusToast = () => {
    setNetworkToast(true);
    if (networkToastTimerRef.current !== null) {
      window.clearTimeout(networkToastTimerRef.current);
    }
    networkToastTimerRef.current = window.setTimeout(() => {
      setNetworkToast(false);
      networkToastTimerRef.current = null;
    }, 3400);
  };

  useEffect(() => {
    return () => {
      if (networkToastTimerRef.current !== null) {
        window.clearTimeout(networkToastTimerRef.current);
      }
    };
  }, []);

  const activeZone = useMemo(
    () => getCockpitZoneById(activeZoneId),
    [activeZoneId]
  );

  const bootSpec = useMemo(
    () => getCockpitBootTransformSpec(bootPhase),
    [bootPhase]
  );

  // Orchestrate the 4-stage Cockpit Core-to-Full-Interface Transforming Boot Sequence ONLY on first app start
  useEffect(() => {
    if (ForcedBootPhase) {
      setBootPhase(ForcedBootPhase);
      return;
    }
    if (
      shouldSkipCockpitBootAnimation({
        hasBootedInSession: hasPlayedInitialCockpitBoot,
        skipBootAnimation,
        reducedMotion,
        initialShowSystemControls
      })
    ) {
      setBootPhase('ready');
      return;
    }

    // Mark as played immediately so returning via Back / Previous Page always skips the animation
    hasPlayedInitialCockpitBoot = true;

    setBootPhase(resolveCockpitBootPhase(0, false));
    playRadarPulse();

    const t1 = window.setTimeout(() => {
      setBootPhase(resolveCockpitBootPhase(COCKPIT_BOOT_TIMELINE_MS.CORE_LOGO_END + 10, false));
    }, COCKPIT_BOOT_TIMELINE_MS.CORE_LOGO_END);

    const t2 = window.setTimeout(() => {
      setBootPhase(resolveCockpitBootPhase(COCKPIT_BOOT_TIMELINE_MS.DIAL_EXPAND_END + 10, false));
    }, COCKPIT_BOOT_TIMELINE_MS.DIAL_EXPAND_END);

    const t3 = window.setTimeout(() => {
      setBootPhase(resolveCockpitBootPhase(COCKPIT_BOOT_TIMELINE_MS.FULL_DEPLOY_END + 10, false));
    }, COCKPIT_BOOT_TIMELINE_MS.FULL_DEPLOY_END);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [skipBootAnimation, reducedMotion, initialShowSystemControls, ForcedBootPhase]);

  const activateCockpitZone = (zoneId: string, withAudioPulse = true) => {
    lastActiveCockpitZoneId = zoneId;
    setActiveZoneId(prev => {
      if (prev !== zoneId && withAudioPulse) {
        playRadarPulse();
      }
      return zoneId;
    });
  };

  useEffect(() => {
    setJetModel(selectedJetModel);
  }, [selectedJetModel]);

  useEffect(() => {
    if (initialShowSystemControls) {
      setBootPhase('ready');
      setShowSystemControls(true);
    }
  }, [initialShowSystemControls]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(e.target as Node)
      ) {
        setShowNotifications(false);
      }
      if (personaRef.current && !personaRef.current.contains(e.target as Node)) {
        setShowPersonaMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNotifications(false);
        setShowPersonaMenu(false);
        setNetworkToast(false);
        setShowSystemControls(false);
        return;
      }
      if (
        showSystemControls ||
        showPersonaMenu ||
        showNotifications
      )
        return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = cycleCockpitSector(activeZoneId, 'up');
        activateCockpitZone(next.id, true);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = cycleCockpitSector(activeZoneId, 'down');
        activateCockpitZone(next.id, true);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = cycleCockpitSector(activeZoneId, 'left');
        activateCockpitZone(next.id, true);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = cycleCockpitSector(activeZoneId, 'right');
        activateCockpitZone(next.id, true);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeZoneId, showSystemControls, showPersonaMenu, showNotifications]);

  // Close any active Cockpit overlays (All Systems, Notifications, Persona menu) on Android back navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOverlayPopState = () => {
      setShowSystemControls(false);
      setShowPersonaMenu(false);
      setShowNotifications(false);
    };
    window.addEventListener('popstate', handleOverlayPopState);
    return () => window.removeEventListener('popstate', handleOverlayPopState);
  }, []);

  const unreadNotificationsCount = notifications.filter(n => !n.read).length;

  const operatorBadge = useMemo(
    () => resolveCockpitOperatorBadge(currentUser),
    [currentUser]
  );

  const triggerCockpitNavigation = (
    controlId: string,
    routeId: string,
    options?: CockpitNavigateOptions
  ) => {
    // Tapping the GHOST PROTOCOL logo while on the home screen keeps the interface ready without replaying the boot animation
    if (controlId === 'header_logo' && routeId === 'dashboard') {
      activateCockpitZone('header_logo', false);
      playTacticalClick();
      return;
    }

    // Ensure any navigation click during boot immediately unlocks the full interface
    if (bootPhase !== 'ready') {
      setBootPhase('ready');
    }

    activateCockpitZone(controlId, false);
    setIgnitingZoneId(controlId);
    playTacticalClick();

    if (routeId === 'system_controls') {
      setTimeout(() => {
        setIgnitingZoneId(null);
        setShowSystemControls(true);
        try {
          window.history.pushState(
            { tab: 'dashboard', overlay: 'system_controls' },
            '',
            window.location.href
          );
        } catch {}
      }, reducedMotion ? 20 : 140);
      return;
    }

    const delay = reducedMotion ? 20 : 180;
    setTimeout(() => {
      setIgnitingZoneId(null);
      if (routeId === 'jet_engineer') {
        const desiredMode = options?.jetMode || 'ask';
        const resolved = resolveJetEngineerAction(
          desiredMode === 'train' ? 'train' : 'help'
        );
        onNavigate(resolved.routeId, {
          jetMode: desiredMode,
          jetModel
        });
      } else if (routeId === 'charging') {
        onNavigate('charging', {
          chargingMode: options?.chargingMode || 'map'
        });
      } else {
        onNavigate(routeId, options);
      }
    }, delay);
  };

  // Rotary pointer/touch scrub handler across the circular dial
  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!stageRef.current) return;
    // On touch devices, scrub when finger is pressed down; on mouse, track hover smoothly
    if (e.pointerType === 'touch' && !isScrubbingDial && e.buttons === 0) return;

    // Resolve the exact hotspot element under the pointer coordinates first (prevents touch-capture or boundary drift)
    const hitEl =
      typeof document !== 'undefined' && typeof document.elementFromPoint === 'function'
        ? (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)
        : (e.target as HTMLElement | null);
    const hotspotEl = hitEl?.closest?.('[data-zone-id]') as HTMLElement | null;
    const directZoneId = hotspotEl?.getAttribute('data-zone-id');
    if (directZoneId) {
      activateCockpitZone(directZoneId, true);
      return;
    }

    const rect = stageRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const canvasX = ((e.clientX - rect.left) / rect.width) * 941;
    const canvasY = ((e.clientY - rect.top) / rect.height) * 1672;

    const resolvedZone = resolveCockpitZoneFromCanvasPoint(canvasX, canvasY);
    if (resolvedZone) {
      activateCockpitZone(resolvedZone.id, true);
    }
  };

  const handleModelSelect = (model: 'F77' | 'X47' | 'Both') => {
    playTacticalClick();
    setJetModel(model);
    onSelectJetModel?.(model);
  };

  const getDirectoryIcon = (id: string) => {
    switch (id) {
      case 'dir_jet_engineer_ask':
        return <Cpu className="w-4 h-4 text-[#38BDF8]" />;
      case 'dir_jet_engineer_train':
        return <BookOpen className="w-4 h-4 text-[#38BDF8]" />;
      case 'dir_charging':
        return <Zap className="w-4 h-4 text-[#38BDF8]" />;
      case 'dir_route_planner':
        return <MapPin className="w-4 h-4 text-[#38BDF8]" />;
      case 'dir_squadron_assist':
        return <Radio className="w-4 h-4 text-[#EF4444]" />;
      case 'dir_mission_mode':
        return <Calendar className="w-4 h-4 text-[#F59E0B]" />;
      case 'dir_problems':
        return <Wrench className="w-4 h-4 text-[#F59E0B]" />;
      case 'dir_service':
        return <Building2 className="w-4 h-4 text-[#38BDF8]" />;
      case 'dir_garage':
        return <Layers className="w-4 h-4 text-[#42B883]" />;
      case 'dir_discussions':
        return <MessageSquare className="w-4 h-4 text-[#38BDF8]" />;
      case 'dir_modifications':
        return <Wrench className="w-4 h-4 text-[#42B883]" />;
      case 'dir_marketplace':
        return <ShoppingBag className="w-4 h-4 text-[#F59E0B]" />;
      case 'dir_squadron_showdown':
        return <Gamepad2 className="w-4 h-4 text-[#EF4444]" />;
      case 'dir_admin':
        return <Shield className="w-4 h-4 text-[#E04F5F]" />;
      default:
        return <LayoutGrid className="w-4 h-4 text-[#38BDF8]" />;
    }
  };

  const visibleDirectoryItems = ALL_SYSTEM_CONTROLS_DIRECTORY.filter(
    item => !item.requiresAdminOrOwner || canAccessAdmin
  );

  const renderNotificationsPopover = () => (
    <div
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-[#040812]/98 backdrop-blur-xl border border-[#1E3A5F] rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.98)] p-3.5 z-50 text-xs font-sans text-[#E8EDF2]"
    >
      <div className="flex items-center justify-between border-b border-[#142238] pb-2 mb-2.5">
        <span className="font-bold font-mono tracking-wider text-[#F8FAFC] uppercase">
          Notifications {unreadNotificationsCount > 0 ? `(${unreadNotificationsCount})` : ''}
        </span>
        {onMarkAllNotificationsRead && unreadNotificationsCount > 0 && (
          <button
            type="button"
            onClick={() => {
              playTacticalClick();
              onMarkAllNotificationsRead();
            }}
            className="text-[11px] font-mono text-[#38BDF8] hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>
      {notifications.length === 0 ? (
        <p className="text-[#8E98A4] py-4 text-center font-mono text-[11px]">
          No active alerts in queue.
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
          {notifications.slice(0, 12).map(n => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                playTacticalClick();
                onMarkNotificationRead?.(n.id);
                setShowNotifications(false);
                if (n.link) {
                  onNavigate(n.link);
                }
              }}
              className={`w-full text-left p-2.5 rounded border transition-colors ${
                n.read
                  ? 'bg-[#080F1E]/70 border-[#142238] text-[#8E98A4]'
                  : 'bg-[#0C1930] border-[#38BDF8]/50 text-[#F8FAFC]'
              }`}
            >
              <div className="font-semibold text-[11px] leading-snug">{n.title}</div>
              <div className="text-[11px] text-[#94A3B8] mt-0.5 line-clamp-2">
                {n.message}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const renderPersonaPopover = () => (
    <div
      role="dialog"
      aria-label="Operator Profile & Controls"
      className="absolute right-0 top-full mt-2 w-64 bg-[#040812]/98 backdrop-blur-xl border border-[#1E3A5F] rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.98)] p-3.5 z-50 text-xs font-sans text-[#E8EDF2]"
    >
      {currentUser ? (
        <div className="space-y-3">
          <div className="border-b border-[#142238] pb-2.5">
            <div className="font-bold text-[#F8FAFC] text-sm truncate">
              {operatorBadge.fullName}
            </div>
            <div className="text-[10px] font-mono text-[#38BDF8] uppercase tracking-wider mt-0.5">
              ID: {operatorBadge.userId}
            </div>
            <div className="text-[11px] font-mono text-[#EF4444] uppercase tracking-wider mt-0.5">
              {operatorBadge.pilotLabel} • {currentUser.motorcycleModel || 'F77'}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#8E98A4] mb-1.5">
              Platform Telemetry Filter
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(['F77', 'X47', 'Both'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleModelSelect(m)}
                  className={`py-1.5 rounded font-mono text-[11px] font-bold border transition-colors ${
                    jetModel === m
                      ? 'bg-[#38BDF8]/20 border-[#38BDF8] text-[#F8FAFC]'
                      : 'bg-[#080F1E] border-[#142238] text-[#8E98A4] hover:text-white'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 pt-1 border-t border-[#142238]">
            <button
              type="button"
              onClick={() => {
                playTacticalClick();
                setShowPersonaMenu(false);
                onNavigate('garage');
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded bg-[#0A1324] hover:bg-[#112240] border border-[#1E3A5F]/60 text-[#F8FAFC] font-mono text-[11px]"
            >
              <span>MY GARAGE</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#38BDF8]" />
            </button>

            <button
              type="button"
              onClick={() => {
                playTacticalClick();
                toggleSound();
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded bg-[#0A1324] hover:bg-[#112240] border border-[#1E3A5F]/60 text-[#F8FAFC] font-mono text-[11px]"
            >
              <span>AVIONICS AUDIO</span>
              <span className="flex items-center gap-1 text-[#38BDF8]">
                {soundEnabled ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5" /> ON
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5 text-[#8E98A4]" /> MUTED
                  </>
                )}
              </span>
            </button>

            {canAccessAdmin && (
              <button
                type="button"
                onClick={() => {
                  playTacticalClick();
                  setShowPersonaMenu(false);
                  onNavigate('admin');
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded bg-[#2A0A10] hover:bg-[#3F0F18] border border-[#EF4444]/60 text-[#FCA5A5] font-mono text-[11px]"
              >
                <span>ADMIN CENTRE</span>
                <Shield className="w-3.5 h-3.5 text-[#EF4444]" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                playTacticalClick();
                setShowPersonaMenu(false);
                logout();
              }}
              className="w-full text-left px-2.5 py-1.5 rounded text-[#EF4444] hover:bg-[#EF4444]/10 font-mono text-[11px]"
            >
              SIGN OUT
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <p className="text-[#94A3B8] text-[11px] leading-relaxed">
            Authenticate your Ultraviolette pilot profile to unlock squadron telemetry and garage records.
          </p>
          <button
            type="button"
            onClick={() => {
              playTacticalClick();
              setShowPersonaMenu(false);
              openAuthModal('login');
            }}
            className="w-full py-2 rounded bg-[#38BDF8]/20 hover:bg-[#38BDF8]/30 border border-[#38BDF8] text-[#F8FAFC] font-mono font-bold text-xs uppercase tracking-wider"
          >
            Sign In / Register
          </button>
        </div>
      )}
    </div>
  );

  // Compute compass laser x-offset inside the 330..020 compass window (x = 325..616)
  const compassShiftPx = useMemo(() => {
    const normalized = ((activeZone.bearingDeg + 180) % 360) - 180;
    return Math.max(-110, Math.min(110, (normalized / 180) * 105));
  }, [activeZone.bearingDeg]);

  return (
    <div
      data-testid="cockpit-dashboard-root"
      data-active-zone={activeZoneId}
      data-boot-phase={bootPhase}
      style={{
        backgroundColor: '#010204'
      }}
      className="relative w-full h-[100dvh] min-h-[100dvh] max-h-[100dvh] flex flex-col justify-between items-center overflow-hidden select-none bg-[#010204]"
    >
      {/* Inline Keyframe Animations for Fighter-Jet HUD, Laser Trace, Radar Sweep & Transforming Boot */}
      <style>{`
        @keyframes gpLaserPerimeterTrace {
          0% { stroke-dashoffset: 1200; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes gpCrimsonPulse {
          0%, 100% { opacity: 0.88; }
          50% { opacity: 1; }
        }
        @keyframes gpRadarSweepSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes gpCounterSpin {
          0% { transform: rotate(360deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes gpIgnitionShockwave {
          0% { transform: scale(0.25); opacity: 1; stroke-width: 10px; }
          100% { transform: scale(1.65); opacity: 0; stroke-width: 1px; }
        }
        @keyframes gpCompassScan {
          0%, 100% { opacity: 0.45; transform: scaleY(0.92); }
          50% { opacity: 0.95; transform: scaleY(1.06); }
        }
        @keyframes gpBootRayShoot {
          0% { stroke-dashoffset: 360; opacity: 1; }
          65% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: -120; opacity: 0.15; }
        }
        @keyframes gpBootPerimeterFlash {
          0% { stroke-dashoffset: 900; opacity: 0.95; }
          70% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
      `}</style>

      {/* =====================================================================
          EXACT APPROVED GHOST PROTOCOL COCKPIT DASHBOARD (941 x 1672)
          Accurate circular dial aspect-ratio without any stretching or compression
          ===================================================================== */}
      <div
        ref={stageRef}
        data-testid="cockpit-rotary-stage"
        onPointerDown={() => setIsScrubbingDial(true)}
        onPointerUp={() => setIsScrubbingDial(false)}
        onPointerCancel={() => setIsScrubbingDial(false)}
        onPointerMove={handleStagePointerMove}
        style={{
          width:
            'min(460px, 100vw, calc((100dvh - 52px - env(safe-area-inset-bottom, 0px)) * 0.5628))',
          aspectRatio: '941 / 1672'
        }}
        className="relative aspect-[941/1672] shrink-0 mx-auto select-none"
      >
        {/* Transforming Iris Wrapper: Starts at Central Core (9.2%) -> Expands Circular Interface (46.5%) -> Deploys All Buttons (115%) */}
        <div
          data-testid="cockpit-transform-iris"
          style={{
            clipPath: bootSpec.clipPathCss,
            transformOrigin: '50% 48.44%',
            transform:
              bootPhase === 'ready'
                ? 'none'
                : `scale(${bootSpec.stageScale}) rotate(${bootSpec.stageRotateDeg}deg)`,
            transition: reducedMotion
              ? 'none'
              : 'clip-path 760ms cubic-bezier(0.16, 1, 0.3, 1), transform 760ms cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          className="relative w-full h-full pointer-events-none select-none"
        >
          {/* Base Cockpit Layer: All sectors in electric blue so only the active toggled page glows red */}
          <img
            src={COCKPIT_ALL_BLUE_IMAGE}
            alt="GHOST PROTOCOL Cockpit Dashboard"
            width={941}
            height={1672}
            loading="eager"
            decoding="sync"
            fetchPriority="high"
            draggable={false}
            className="block w-full h-full object-contain pointer-events-none select-none"
          />

          {/* ===================================================================
              INTERACTIVE RED GLOW + FIGHTER-JET HUD ANIMATION SVG OVERLAY
              =================================================================== */}
          <svg
            viewBox="0 0 941 1672"
            data-testid="cockpit-interactive-hud-svg"
            className="absolute inset-0 w-full h-full pointer-events-none select-none z-10"
          >
            <defs>
              {/* Radial Crimson Inner Plasma Fill for Active Toggled Sector */}
              <radialGradient
                id="gp-active-crimson-plasma"
                cx={activeZone.centerPoint.x}
                cy={activeZone.centerPoint.y}
                r="210"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#FF1E27" stopOpacity="0.28" />
                <stop offset="55%" stopColor="#DC2626" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#991B1B" stopOpacity="0.0" />
              </radialGradient>

              {/* Conic-like Radar Sweep Gradient inside Central Reticle */}
              <linearGradient id="gp-radar-sweep-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FF1E27" stopOpacity="0.48" />
                <stop offset="45%" stopColor="#EF4444" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.0" />
              </linearGradient>

              {/* Hardware-Accelerated ClipPath revealing the exact photorealistic red-glow image over the active zone */}
              <clipPath id="cockpit-active-red-clip">
                <path d={activeZone.svgMaskPath} />
              </clipPath>
            </defs>

            {/* 1. Photorealistic Crimson-Red Cockpit Layer Clipped to the Exact Groove of the Active Button */}
            <image
              href={COCKPIT_ALL_RED_IMAGE}
              width="941"
              height="1672"
              clipPath="url(#cockpit-active-red-clip)"
              style={{
                transition: 'opacity 180ms ease-out',
                animation: reducedMotion ? 'none' : 'gpCrimsonPulse 2.2s ease-in-out infinite'
              }}
            />

            {/* 2. Active Zone Path Marker for Telemetry & Testing (zero artificial SVG bleed outside curved bevels) */}
            <path
              data-testid="cockpit-active-red-glow-path"
              d={activeZone.svgMaskPath}
              fill="none"
              stroke="none"
            />

            {/* 4. Dynamic Compass Heading Laser Scanner (330 • 340 • 000 • 010 • 020) */}
            <g
              transform={`translate(${compassShiftPx}, 0)`}
              style={{ transition: 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)' }}
            >
              <line
                x1="470.5"
                y1="316"
                x2="470.5"
                y2="378"
                stroke="#FF1E27"
                strokeWidth="6"
                strokeOpacity="0.28"
              />
              <line
                x1="470.5"
                y1="316"
                x2="470.5"
                y2="378"
                stroke="#FF3B44"
                strokeWidth="2.2"
                strokeOpacity="0.85"
                style={{
                  transformOrigin: '470.5px 347px',
                  animation: reducedMotion ? 'none' : 'gpCompassScan 1.6s ease-in-out infinite'
                }}
              />
              <circle
                cx="470.5"
                cy="347"
                r="6"
                fill="#FF1E27"
                fillOpacity="0.38"
              />
              <circle
                cx="470.5"
                cy="347"
                r="3"
                fill="#FFE4E6"
              />
            </g>

            {/* 5. Outer Cockpit Ring Rotating Micro-Telemetry Arcs */}
            {!reducedMotion && (
              <g
                style={{
                  transformOrigin: `${COCKPIT_DIAL_CENTER.x}px ${COCKPIT_DIAL_CENTER.y}px`,
                  animation: 'gpCounterSpin 28s linear infinite'
                }}
              >
                <circle
                  cx={COCKPIT_DIAL_CENTER.x}
                  cy={COCKPIT_DIAL_CENTER.y}
                  r="348"
                  fill="none"
                  stroke="#FF1E27"
                  strokeWidth="1.8"
                  strokeOpacity="0.42"
                  strokeDasharray="24 160 12 200"
                />
              </g>
            )}

            {/* 6. Central Avionics Targeting Reticle: Radar Sweep */}
            <g>
              {/* Continuous 360-degree Radar Sweep inside Central Reticle */}
              {!reducedMotion && (
                <g
                  style={{
                    transformOrigin: `${COCKPIT_DIAL_CENTER.x}px ${COCKPIT_DIAL_CENTER.y}px`,
                    animation: 'gpRadarSweepSpin 4.8s linear infinite'
                  }}
                >
                  <path
                    d={`M ${COCKPIT_DIAL_CENTER.x} ${COCKPIT_DIAL_CENTER.y} L ${COCKPIT_DIAL_CENTER.x} ${COCKPIT_DIAL_CENTER.y - 114} A 114 114 0 0 1 ${COCKPIT_DIAL_CENTER.x + 98} ${COCKPIT_DIAL_CENTER.y - 57} Z`}
                    fill="url(#gp-radar-sweep-grad)"
                  />
                  <circle
                    cx={COCKPIT_DIAL_CENTER.x}
                    cy={COCKPIT_DIAL_CENTER.y}
                    r="112"
                    fill="none"
                    stroke="#FF1E27"
                    strokeWidth="1.5"
                    strokeOpacity="0.5"
                    strokeDasharray="36 180"
                  />
                </g>
              )}
            </g>

            {/* 7. Target Lock-On Ignition Shockwave Burst on Click/Navigation */}
            {ignitingZoneId && (
              <g
                style={{
                  transformOrigin: `${activeZone.centerPoint.x}px ${activeZone.centerPoint.y}px`,
                  animation: 'gpIgnitionShockwave 220ms ease-out forwards'
                }}
              >
                <circle
                  cx={activeZone.centerPoint.x}
                  cy={activeZone.centerPoint.y}
                  r="85"
                  fill="rgba(255, 30, 39, 0.28)"
                  stroke="#FFE4E6"
                  strokeWidth="6"
                />
              </g>
            )}

            {/* 8. Dynamic ONLINE / OFFLINE Cockpit Status Capsule Overlay (x: 33..241, y: 315..373, centerY: 344) */}
            {effectiveOffline ? (
              <g data-testid="cockpit-capsule-offline-visual">
                {/* Inner dark cockpit pill mask covering baked-in green dot & ONLINE text */}
                <rect
                  x="33"
                  y="315"
                  width="208"
                  height="58"
                  rx="29"
                  fill="#060811"
                  stroke="#F59E0B"
                  strokeWidth="2.2"
                  strokeOpacity="0.92"
                />
                {/* Pulsing Amber/Red Offline Status Dot at (62, 344) */}
                <circle
                  cx="62"
                  cy="344"
                  r="14"
                  fill="#EF4444"
                  fillOpacity="0.34"
                  style={{
                    transformOrigin: '62px 344px',
                    animation: reducedMotion ? 'none' : 'gpReticlePulse 1.8s ease-in-out infinite'
                  }}
                />
                <circle
                  cx="62"
                  cy="344"
                  r="8"
                  fill="#F59E0B"
                  stroke="#FEF3C7"
                  strokeWidth="1.5"
                />
                {/* Wi-Fi Off / Disconnected Vector Icon at (101, 344) */}
                <path
                  d="M 89 339 A 17 17 0 0 1 113 339"
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
                <path
                  d="M 93 345 A 11 11 0 0 1 109 345"
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
                <circle cx="101" cy="351" r="2.2" fill="#F59E0B" />
                <line
                  x1="88"
                  y1="332"
                  x2="114"
                  y2="356"
                  stroke="#EF4444"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                {/* Crisp Tactical OFFLINE Label */}
                <text
                  x="176"
                  y="351"
                  textAnchor="middle"
                  fill="#FDE68A"
                  fontSize="20.5"
                  fontWeight="800"
                  letterSpacing="1.2"
                  fontFamily="sans-serif"
                >
                  OFFLINE
                </text>
              </g>
            ) : (
              <g data-testid="cockpit-capsule-online-visual">
                {/* Crisp Vector ONLINE Capsule Interior */}
                <rect
                  x="33"
                  y="315"
                  width="208"
                  height="58"
                  rx="29"
                  fill="#040914"
                  stroke="#38BDF8"
                  strokeWidth="1.6"
                  strokeOpacity="0.55"
                />
                {/* Live Pulsing Emerald Telemetry Halo & Status LED at (62, 344) */}
                <circle
                  cx="62"
                  cy="344"
                  r="14"
                  fill="#22C55E"
                  fillOpacity="0.32"
                  style={{
                    transformOrigin: '62px 344px',
                    animation: reducedMotion ? 'none' : 'gpReticlePulse 2.2s ease-in-out infinite'
                  }}
                />
                <circle
                  cx="62"
                  cy="344"
                  r="8"
                  fill="#4ADE80"
                  stroke="#DCFCE7"
                  strokeWidth="1.5"
                />
                {/* Crisp Wi-Fi Connected Vector Icon at (103, 344) */}
                <path
                  d="M 90 338 A 18 18 0 0 1 116 338"
                  fill="none"
                  stroke="#F8FAFC"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M 95 344 A 11.5 11.5 0 0 1 111 344"
                  fill="none"
                  stroke="#F8FAFC"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx="103" cy="351" r="2.4" fill="#4ADE80" />
                {/* Crisp Tactical ONLINE Label */}
                <text
                  x="176"
                  y="351"
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize="21.5"
                  fontWeight="800"
                  letterSpacing="1.4"
                  fontFamily="sans-serif"
                >
                  ONLINE
                </text>
              </g>
            )}

            {/* 9. Dynamic Top-Right Operator Identity & Bike Model Pilot Badge (x: 738..864, y: 96..158) */}
            <g data-testid="cockpit-operator-identity-badge">
              {/* Solid cockpit obsidian mask covering static baked-in 'ABINAV / F77 PILOT' raster text */}
              <rect
                x="738"
                y="96"
                width="126"
                height="62"
                rx="4"
                fill="#010102"
              />
              {/* Active User Name / Callsign */}
              <text
                data-testid="cockpit-operator-name-text"
                x="742"
                y="123"
                textAnchor="start"
                fill="#F8FAFC"
                fontSize={
                  operatorBadge.displayName.length > 9
                    ? '18'
                    : operatorBadge.displayName.length > 7
                    ? '20.5'
                    : '23.5'
                }
                fontWeight="800"
                letterSpacing="0.8"
                fontFamily="sans-serif"
              >
                {operatorBadge.displayName}
              </text>
              {/* Active User Bike Model Pilot Tag (e.g. F77 PILOT / X47 PILOT / Nickname) */}
              <text
                data-testid="cockpit-operator-pilot-text"
                x="742"
                y="149"
                textAnchor="start"
                fill="#FF1E27"
                fontSize={operatorBadge.pilotLabel.length > 10 ? '14.5' : '17.5'}
                fontWeight="800"
                letterSpacing="0.6"
                fontFamily="sans-serif"
              >
                {operatorBadge.pilotLabel}
              </text>
            </g>
          </svg>
        </div>

        {/* ===================================================================
            COCKPIT BOOT TRANSFORMATION OVERLAY SVG (UNCLIPPED)
            Starts with Logo in Center -> Expands Circular Interface -> Deploys All Buttons
            =================================================================== */}
        {bootPhase !== 'ready' && (
          <svg
            viewBox="0 0 941 1672"
            data-testid="cockpit-boot-transformation-layer"
            className="absolute inset-0 w-full h-full pointer-events-none select-none z-15"
          >
            <defs>
              <radialGradient
                id="gp-boot-core-aura"
                cx={COCKPIT_DIAL_CENTER.x}
                cy={COCKPIT_DIAL_CENTER.y}
                r="320"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#FF1E27" stopOpacity="0.45" />
                <stop offset="45%" stopColor="#38BDF8" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#020408" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Expanding Iris Perimeter Ring & Radial Shockwave */}
            <g
              style={{
                opacity: bootSpec.dialWaveOpacity,
                transition: 'opacity 500ms ease-out'
              }}
            >
              {/* Expanding Outer Plasma Shockwave Ring */}
              <circle
                cx={COCKPIT_DIAL_CENTER.x}
                cy={COCKPIT_DIAL_CENTER.y}
                r={bootSpec.dialWaveRadiusPx}
                fill="none"
                stroke="#38BDF8"
                strokeWidth="4.5"
                strokeOpacity="0.78"
                style={{
                  transition: 'r 760ms cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              />
              {/* Expanding Crimson Inner Lock Ring */}
              <circle
                cx={COCKPIT_DIAL_CENTER.x}
                cy={COCKPIT_DIAL_CENTER.y}
                r={Math.max(96, bootSpec.dialWaveRadiusPx - 22)}
                fill="none"
                stroke="#FF1E27"
                strokeWidth="3"
                strokeDasharray="36 18"
                strokeOpacity="0.88"
                style={{
                  transition: 'r 760ms cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              />

              {/* 8 Radial Vector Rays Slicing Out the Circular Interface Sectors */}
              {bootPhase === 'dial_expand' &&
                COCKPIT_RADIAL_EXPANSION_RAYS.map(ray => (
                  <line
                    key={ray.id}
                    x1={ray.x1}
                    y1={ray.y1}
                    x2={ray.x2}
                    y2={ray.y2}
                    stroke={ray.accentColor}
                    strokeWidth="3.2"
                    strokeDasharray="340"
                    style={{
                      animation: 'gpBootRayShoot 760ms cubic-bezier(0.16, 1, 0.3, 1) forwards'
                    }}
                  />
                ))}

              {/* Sector Perimeter Ignition Wave during Circular Interface Expansion */}
              {bootPhase === 'dial_expand' &&
                COCKPIT_INTERACTIVE_ZONES.filter(z => z.id.startsWith('sector_')).map(zone => (
                  <path
                    key={`boot_sector_trace_${zone.id}`}
                    d={zone.svgBorderPath}
                    fill="none"
                    stroke="#FF1E27"
                    strokeWidth="3.2"
                    strokeDasharray="900"
                    style={{
                      animation: 'gpBootPerimeterFlash 780ms ease-out forwards'
                    }}
                  />
                ))}
            </g>

            {/* Stage 3: Upward & Downward Conduits + All Outer Buttons Perimeter Lock-On */}
            {bootPhase === 'full_deploy' && (
              <g>
                {/* Upward Energy Conduits from Circular Ring to Top Nav & Header */}
                <line
                  x1="470.5"
                  y1="450"
                  x2="470.5"
                  y2="75"
                  stroke="#38BDF8"
                  strokeWidth="3.5"
                  strokeDasharray="380"
                  style={{ animation: 'gpBootRayShoot 680ms ease-out forwards' }}
                />
                {/* Downward Energy Conduits from Circular Ring to ALL SYSTEMS & Keel */}
                <line
                  x1="470.5"
                  y1="1165"
                  x2="470.5"
                  y2="1672"
                  stroke="#FF1E27"
                  strokeWidth="3.5"
                  strokeDasharray="500"
                  style={{ animation: 'gpBootRayShoot 680ms ease-out forwards' }}
                />
                {/* Outer Buttons & Panels Perimeter Lock-On Flash */}
                {COCKPIT_INTERACTIVE_ZONES.filter(z => !z.id.startsWith('sector_')).map(zone => (
                  <path
                    key={`boot_outer_trace_${zone.id}`}
                    d={zone.svgBorderPath}
                    fill="none"
                    stroke="#38BDF8"
                    strokeWidth="3.2"
                    strokeDasharray="900"
                    style={{
                      animation: 'gpBootPerimeterFlash 720ms ease-out forwards'
                    }}
                  />
                ))}
              </g>
            )}

            {/* Stage 1 & 2: Central GHOST PROTOCOL Logo & Turbine Core at (470.5, 810) */}
            <g
              data-testid="cockpit-boot-center-logo"
              style={{
                transformOrigin: `${COCKPIT_DIAL_CENTER.x}px ${COCKPIT_DIAL_CENTER.y}px`,
                transform: `scale(${bootSpec.centerLogoScale})`,
                opacity: bootSpec.centerLogoOpacity,
                transition:
                  'transform 620ms cubic-bezier(0.16, 1, 0.3, 1), opacity 520ms ease-out'
              }}
            >
              {/* Core Radial Plasma Glow */}
              <circle
                cx={COCKPIT_DIAL_CENTER.x}
                cy={COCKPIT_DIAL_CENTER.y}
                r="260"
                fill="url(#gp-boot-core-aura)"
              />

              {/* Outer Counter-Rotating Cyan Turbine Ring */}
              <g
                style={{
                  transformOrigin: `${COCKPIT_DIAL_CENTER.x}px ${COCKPIT_DIAL_CENTER.y}px`,
                  animation: 'gpCounterSpin 6s linear infinite'
                }}
              >
                <circle
                  cx={COCKPIT_DIAL_CENTER.x}
                  cy={COCKPIT_DIAL_CENTER.y}
                  r="154"
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="3.5"
                  strokeDasharray="48 24 16 24"
                />
              </g>

              {/* Inner Rotating Crimson Reactor Ring */}
              <g
                style={{
                  transformOrigin: `${COCKPIT_DIAL_CENTER.x}px ${COCKPIT_DIAL_CENTER.y}px`,
                  animation: 'gpRadarSweepSpin 4s linear infinite'
                }}
              >
                <circle
                  cx={COCKPIT_DIAL_CENTER.x}
                  cy={COCKPIT_DIAL_CENTER.y}
                  r="128"
                  fill="none"
                  stroke="#FF1E27"
                  strokeWidth="4.5"
                  strokeDasharray="64 28"
                />
              </g>

              {/* Central Delta Wing Emblem Glow */}
              <polygon
                points="470.5,856 420,766 470.5,788 521,766"
                fill="rgba(255, 30, 39, 0.32)"
                stroke="#FF1E27"
                strokeWidth="4"
              />
              <polygon
                points="470.5,848 430,774 470.5,793 511,774"
                fill="#F8FAFC"
                stroke="#38BDF8"
                strokeWidth="2"
              />

              {/* Holographic GHOST // PROTOCOL Callsign Banner Centered on the Circular Core */}
              <rect
                x="265"
                y="602"
                width="411"
                height="48"
                rx="10"
                fill="#030712"
                fillOpacity="0.92"
                stroke="#FF1E27"
                strokeWidth="2"
              />
              <text
                x="470.5"
                y="633"
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="24"
                fontWeight="900"
                fontStyle="italic"
                letterSpacing="7"
                fontFamily="sans-serif"
              >
                GHOST PROTOCOL
              </text>

              <rect
                x="305"
                y="972"
                width="331"
                height="34"
                rx="8"
                fill="#030712"
                fillOpacity="0.9"
                stroke="#38BDF8"
                strokeWidth="1.5"
              />
              <text
                x="470.5"
                y="994"
                textAnchor="middle"
                fill="#38BDF8"
                fontSize="14"
                fontWeight="700"
                letterSpacing="4"
                fontFamily="monospace"
              >
                {bootPhase === 'core_logo'
                  ? 'AVIONICS CORE IGNITION'
                  : 'EXPANDING TACTICAL SYSTEMS'}
              </text>
            </g>
          </svg>
        )}

        {/* Top Header Left: GHOST PROTOCOL Logo → Home Dashboard / Replay Transforming Animation */}
        <button
          type="button"
          data-testid="cockpit-hotspot-logo"
          data-zone-id="header_logo"
          onPointerDown={() => activateCockpitZone('header_logo')}
          onMouseEnter={() => activateCockpitZone('header_logo')}
          onFocus={() => activateCockpitZone('header_logo')}
          onClick={() => triggerCockpitNavigation('header_logo', 'dashboard')}
          aria-label="GHOST PROTOCOL Home Dashboard"
          style={{
            left: '4.5%',
            top: '4.2%',
            width: '41.5%',
            height: '6.5%'
          }}
          className="absolute z-20 bg-transparent border-0 outline-none focus:outline-none cursor-pointer p-0 m-0"
        >
          <span className="sr-only">GHOST PROTOCOL Home Dashboard</span>
        </button>

        {/* Top Header Right: Search Button → Global Search */}
        <button
          type="button"
          data-testid="cockpit-hotspot-search"
          data-zone-id="header_search"
          onPointerDown={() => activateCockpitZone('header_search')}
          onMouseEnter={() => activateCockpitZone('header_search')}
          onFocus={() => activateCockpitZone('header_search')}
          onClick={() => {
            activateCockpitZone('header_search', false);
            playTacticalClick();
            openSearch?.();
          }}
          aria-label="Global Search"
          style={{
            left: '52.8%',
            top: '5.5%',
            width: '7.4%',
            height: '4.3%'
          }}
          className="absolute z-20 bg-transparent border-0 outline-none focus:outline-none cursor-pointer p-0 m-0"
        >
          <span className="sr-only">Search</span>
        </button>

        {/* Top Header Right: Notification Bell → Existing Notifications */}
        <div
          ref={notificationsRef}
          style={{
            left: '61.6%',
            top: '5.5%',
            width: '7.4%',
            height: '4.3%'
          }}
          className="absolute z-30"
        >
          <button
            type="button"
            data-testid="cockpit-hotspot-notifications"
            data-zone-id="header_notifications"
            onPointerDown={() => activateCockpitZone('header_notifications')}
            onMouseEnter={() => activateCockpitZone('header_notifications')}
            onFocus={() => activateCockpitZone('header_notifications')}
            onClick={() => {
              activateCockpitZone('header_notifications', false);
              playTacticalClick();
              setShowNotifications(prev => !prev);
              setShowPersonaMenu(false);
            }}
            aria-label="Notifications"
            className="w-full h-full bg-transparent border-0 outline-none focus:outline-none cursor-pointer p-0 m-0"
          >
            <span className="sr-only">Notifications</span>
          </button>
          {showNotifications && renderNotificationsPopover()}
        </div>

        {/* Top Header Right: Profile → Existing Profile / Account */}
        <div
          ref={personaRef}
          style={{
            left: '70.0%',
            top: '5.2%',
            width: '26.0%',
            height: '4.7%'
          }}
          className="absolute z-30"
        >
          <button
            type="button"
            data-testid="cockpit-hotspot-profile"
            data-zone-id="header_profile"
            onPointerDown={() => activateCockpitZone('header_profile')}
            onMouseEnter={() => activateCockpitZone('header_profile')}
            onFocus={() => activateCockpitZone('header_profile')}
            onClick={() => {
              activateCockpitZone('header_profile', false);
              playTacticalClick();
              setShowPersonaMenu(prev => !prev);
              setShowNotifications(false);
            }}
            aria-label="Operator Profile"
            className="w-full h-full bg-transparent border-0 outline-none focus:outline-none cursor-pointer p-0 m-0"
          >
            <span className="sr-only">Profile</span>
          </button>
          {showPersonaMenu && renderPersonaPopover()}
        </div>

        {/* Status Panel Left: ONLINE / OFFLINE Mode Indicator & Interactive Toggle */}
        <button
          type="button"
          data-testid="cockpit-hotspot-online-status"
          data-zone-id="status_online"
          data-network-mode={effectiveOffline ? 'offline' : 'online'}
          data-active-glow={activeZoneId === 'status_online' ? 'true' : 'false'}
          aria-pressed={effectiveOffline}
          onPointerDown={() => activateCockpitZone('status_online')}
          onMouseEnter={() => activateCockpitZone('status_online')}
          onPointerEnter={e => {
            if (e.pointerType !== 'touch') {
              activateCockpitZone('status_online');
            }
          }}
          onTouchStart={() => activateCockpitZone('status_online')}
          onFocus={() => activateCockpitZone('status_online')}
          onClick={() => {
            activateCockpitZone('status_online', false);
            playTacticalClick();
            onToggleSimulateOffline?.();
            triggerNetworkStatusToast();
          }}
          aria-label={effectiveOffline ? 'Offline Mode' : 'Online Status'}
          title={
            effectiveOffline
              ? `OFFLINE MODE (${isOffline ? 'Network Disconnected' : 'Simulated Offline'}) • Cache: ${cacheAge} • Tap to go Online`
              : `ONLINE MODE (Live Telemetry) • Sync: ${cacheAge} • Tap to toggle Offline Mode`
          }
          style={{
            left: '2.4%',
            top: '18.2%',
            width: '25.5%',
            height: '5.0%'
          }}
          className="absolute z-20 bg-transparent border-0 outline-none focus:outline-none cursor-pointer p-0 m-0"
        >
          <span className="sr-only">
            {effectiveOffline ? 'Offline Mode' : 'Online Status'}
          </span>
        </button>

        {/* Tactical HUD Telemetry Micro-Banner below ONLINE/OFFLINE Capsule when Toggled */}
        {networkToast && (
          <div
            data-testid="cockpit-network-status-banner"
            style={{
              left: '2.4%',
              top: '23.4%'
            }}
            className={`absolute z-30 pointer-events-none flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-md text-[9px] font-mono font-bold tracking-wider uppercase shadow-lg transition-all duration-300 ${
              effectiveOffline
                ? 'bg-[#090D16]/95 border-amber-500/70 text-amber-300 shadow-[0_0_14px_rgba(245,158,11,0.35)]'
                : 'bg-[#090D16]/95 border-emerald-500/70 text-emerald-300 shadow-[0_0_14px_rgba(34,197,94,0.35)]'
            }`}
          >
            {effectiveOffline ? (
              <WifiOff className="w-2.5 h-2.5 text-amber-400 shrink-0" />
            ) : (
              <Wifi className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
            )}
            <span>
              {effectiveOffline
                ? isSimulatedOffline
                  ? 'OFFLINE MODE • CACHED'
                  : 'NO SIGNAL • LOCAL CACHE'
                : 'ONLINE • LIVE TELEMETRY'}
            </span>
            <span className="opacity-75">• {cacheAge}</span>
            {queuedActionCount > 0 && (
              <span className="px-1 py-0.2 rounded bg-red-500/25 border border-red-500/50 text-red-300">
                {queuedActionCount} Q
              </span>
            )}
          </div>
        )}

        {/* Transparent Clickable Hotspots across Navigation Bar, Contribute, 8 Sectors, Reticle, and ALL SYSTEMS */}
        {DASHBOARD_TRANSPARENT_HOTSPOTS.map(hotspot => (
          <button
            key={hotspot.id}
            type="button"
            data-testid={hotspot.testId}
            data-zone-id={hotspot.id}
            data-active-glow={activeZoneId === hotspot.id ? 'true' : 'false'}
            onPointerDown={() => activateCockpitZone(hotspot.id)}
            onMouseEnter={() => activateCockpitZone(hotspot.id)}
            onPointerEnter={e => {
              if (e.pointerType !== 'touch') {
                activateCockpitZone(hotspot.id);
              }
            }}
            onTouchStart={() => activateCockpitZone(hotspot.id)}
            onFocus={() => activateCockpitZone(hotspot.id)}
            onClick={() => triggerCockpitNavigation(hotspot.id, hotspot.routeId)}
            aria-label={hotspot.ariaLabel}
            style={{
              left: `${hotspot.leftPct}%`,
              top: `${hotspot.topPct}%`,
              width: `${hotspot.widthPct}%`,
              height: `${hotspot.heightPct}%`,
              ...(hotspot.clipPolygon ? { clipPath: hotspot.clipPolygon } : {})
            }}
            className="absolute z-20 bg-transparent border-0 outline-none focus:outline-none cursor-pointer p-0 m-0"
          >
            <span className="sr-only">{hotspot.ariaLabel}</span>
          </button>
        ))}
      </div>

      {/* =====================================================================
          CONTINUOUS COCKPIT AVIONICS LOWER CHASSIS EXTENSION
          Seamlessly extends the cockpit body armor to the bottom of the screen.
          Transforms in sync with the initial app boot sequence (and skips on Back).
          ===================================================================== */}
      <div
        data-testid="cockpit-community-disclaimer"
        data-boot-phase={bootPhase}
        style={{
          opacity: bootSpec.lowerChassisOpacity,
          clipPath: bootSpec.lowerChassisClipPathCss,
          transformOrigin: '50% 0%',
          transform:
            bootPhase === 'ready'
              ? 'none'
              : `translateY(${bootSpec.lowerChassisTranslateYPx}px) scale(${bootSpec.lowerChassisScale})`,
          transition: reducedMotion
            ? 'none'
            : 'opacity 680ms cubic-bezier(0.16, 1, 0.3, 1), transform 760ms cubic-bezier(0.16, 1, 0.3, 1), clip-path 760ms cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        className="relative w-full max-w-[460px] flex-1 flex flex-col justify-between items-center px-3.5 -mt-2 pt-0 pb-[max(env(safe-area-inset-bottom,6px),6px)] select-none z-10"
      >
        {/* Continuous Cockpit Armor & Cyber Conduits Extension */}
        <div className="relative w-full flex-1 flex flex-col items-center justify-center min-h-[44px] overflow-hidden">
          <svg
            viewBox="0 0 412 110"
            className="w-full h-full max-h-[120px] pointer-events-none select-none"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="gp-ext-armor-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0B132B" stopOpacity="0.9" />
                <stop offset="45%" stopColor="#050814" stopOpacity="0.98" />
                <stop offset="100%" stopColor="#020308" stopOpacity="0.95" />
              </linearGradient>
              <linearGradient id="gp-ext-rail-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#1E293B" stopOpacity="0.75" />
                <stop offset="50%" stopColor="#0D1527" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#030712" stopOpacity="0.9" />
              </linearGradient>
            </defs>

            {/* Left Outer Structural Armor Rail */}
            <path
              d="M 12 0 L 100 18 L 100 90 L 12 70 Z"
              fill="url(#gp-ext-rail-grad)"
              stroke="#1E293B"
              strokeWidth="1.2"
            />
            {/* Left Inner Chamfer Line */}
            <path
              d="M 18 6 L 94 22 L 94 84 L 18 66 Z"
              fill="#030610"
              stroke="#0F172A"
              strokeWidth="0.8"
            />

            {/* Right Outer Structural Armor Rail */}
            <path
              d="M 400 0 L 312 18 L 312 90 L 400 70 Z"
              fill="url(#gp-ext-rail-grad)"
              stroke="#1E293B"
              strokeWidth="1.2"
            />
            {/* Right Inner Chamfer Line */}
            <path
              d="M 394 6 L 318 22 L 318 84 L 394 66 Z"
              fill="#030610"
              stroke="#0F172A"
              strokeWidth="0.8"
            />

            {/* Center Angular Cockpit Sub-Plate (Double Beveled) */}
            <polygon
              points="150,8 262,8 290,75 206,102 122,75"
              fill="url(#gp-ext-armor-grad)"
              stroke="#1E293B"
              strokeWidth="1.4"
            />
            <polygon
              points="154,12 258,12 284,72 206,97 128,72"
              fill="#020409"
              stroke="#0F172A"
              strokeWidth="0.8"
            />

            {/* Boot Stage 3 Perimeter Ignition Trace across Lower Sub-Chassis Armor */}
            {bootPhase === 'full_deploy' && (
              <g data-testid="cockpit-lower-chassis-boot-trace">
                <polygon
                  points="150,8 262,8 290,75 206,102 122,75"
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="2.4"
                  strokeDasharray="480"
                  style={{ animation: 'gpBootPerimeterFlash 720ms ease-out forwards' }}
                />
                <path
                  d="M 12 0 L 100 18 L 100 90 L 12 70 Z"
                  fill="none"
                  stroke="#FF1E27"
                  strokeWidth="2.2"
                  strokeDasharray="360"
                  style={{ animation: 'gpBootPerimeterFlash 720ms ease-out forwards' }}
                />
                <path
                  d="M 400 0 L 312 18 L 312 90 L 400 70 Z"
                  fill="none"
                  stroke="#FF1E27"
                  strokeWidth="2.2"
                  strokeDasharray="360"
                  style={{ animation: 'gpBootPerimeterFlash 720ms ease-out forwards' }}
                />
              </g>
            )}

            {/* Center Downward Cyan Conduit connecting from Cockpit Chin */}
            <path
              d="M 166 0 L 206 18 L 246 0"
              fill="none"
              stroke="#38BDF8"
              strokeWidth="2.4"
              style={{ filter: 'drop-shadow(0 0 6px #38BDF8)' }}
            />
            {/* Upper Delta Tip */}
            <polygon
              points="206,24 200,16 212,16"
              fill="#38BDF8"
              style={{ filter: 'drop-shadow(0 0 5px #38BDF8)' }}
            />

            {/* Lower Cyber Conduits branching down the sub-chassis */}
            <path
              d="M 206 28 L 206 58"
              stroke="#38BDF8"
              strokeWidth="1.6"
              strokeDasharray="4 2"
              style={{ filter: 'drop-shadow(0 0 4px #38BDF8)' }}
            />
            <path
              d="M 172 45 L 206 65 L 240 45"
              fill="none"
              stroke="#38BDF8"
              strokeWidth="1.4"
              opacity="0.85"
            />
            <polygon
              points="206,72 201,65 211,65"
              fill="#38BDF8"
              opacity="0.9"
            />

            {/* Upper Crimson Laser Vents (Left & Right) with Hardware-Glow */}
            <rect
              x="22"
              y="10"
              width="66"
              height="3.2"
              rx="1.6"
              fill="#FF1E27"
              style={{ filter: 'drop-shadow(0 0 6px #FF1E27)' }}
            />
            <rect
              x="324"
              y="10"
              width="66"
              height="3.2"
              rx="1.6"
              fill="#FF1E27"
              style={{ filter: 'drop-shadow(0 0 6px #FF1E27)' }}
            />

            {/* Mid Crimson Laser Vents (Left & Right) with Hardware-Glow */}
            <rect
              x="30"
              y="40"
              width="52"
              height="2.6"
              rx="1.3"
              fill="#FF1E27"
              style={{ filter: 'drop-shadow(0 0 5px #FF1E27)' }}
            />
            <rect
              x="330"
              y="40"
              width="52"
              height="2.6"
              rx="1.3"
              fill="#FF1E27"
              style={{ filter: 'drop-shadow(0 0 5px #FF1E27)' }}
            />
          </svg>
        </div>

        {/* Bottom End: Small, clean community message cleanly integrated at the bottom of the screen */}
        <div className="w-full flex flex-col items-center justify-end shrink-0 pt-0.5 pb-0.5">
          <p
            data-testid="cockpit-community-disclaimer-text"
            className="font-sans text-[10px] sm:text-[10.5px] leading-relaxed text-[#94A3B8]/90 text-center max-w-[340px] px-2 select-none"
          >
            {COCKPIT_COMMUNITY_DISCLAIMER_TEXT}
          </p>

          {/* Bottom Grounding Titanium Chin Bezel */}
          <svg
            viewBox="0 0 412 12"
            className="w-full h-3 shrink-0 pointer-events-none select-none mt-1"
            preserveAspectRatio="none"
          >
            <path
              d="M 36 2 L 155 2 L 182 9 L 230 9 L 257 2 L 376 2"
              fill="none"
              stroke="#1E293B"
              strokeWidth="1.5"
            />
            <polygon points="206,8 202,3 210,3" fill="#38BDF8" opacity="0.85" />
          </svg>
        </div>
      </div>

      {/* =====================================================================
          ALL SYSTEMS DIRECTORY MODAL (OPENS WHEN CLICKING "ALL SYSTEMS")
          ===================================================================== */}
      {showSystemControls && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="ALL SYSTEMS"
          data-testid="all-system-controls-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
          onClick={() => {
            setShowSystemControls(false);
            try {
              if (typeof window !== 'undefined' && window.history.state?.overlay === 'system_controls') {
                window.history.back();
              }
            } catch {}
          }}
        >
          <div
            className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-xl bg-[#040914] border border-[#38BDF8]/50 shadow-[0_24px_80px_rgba(0,0,0,0.98)] p-5 text-[#F8FAFC]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#1E3A5F] pb-3.5 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444] shadow-[0_0_8px_#EF4444]" />
                <h2 className="font-sans font-extrabold text-base sm:text-lg tracking-[0.14em] uppercase text-[#FFFFFF]">
                  ALL SYSTEMS
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  playTacticalClick();
                  setShowSystemControls(false);
                  try {
                    if (typeof window !== 'undefined' && window.history.state?.overlay === 'system_controls') {
                      window.history.back();
                    }
                  } catch {}
                }}
                aria-label="Close All Systems"
                className="p-1.5 rounded-lg bg-[#0B1528] border border-[#1E3A5F] text-[#94A3B8] hover:text-white hover:border-[#38BDF8]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Complete Directory Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {visibleDirectoryItems.map(item => {
                const isShowdown = item.id === 'dir_squadron_showdown';
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`directory-item-${item.id}`}
                    onClick={() => {
                      playTacticalClick();
                      setShowSystemControls(false);
                      if (item.routeId === 'jet_engineer') {
                        onNavigate('jet_engineer', {
                          jetMode: item.jetMode || 'ask',
                          jetModel
                        });
                      } else if (item.routeId === 'charging') {
                        onNavigate('charging', {
                          chargingMode: item.chargingMode || 'map'
                        });
                      } else {
                        onNavigate(item.routeId);
                      }
                    }}
                    className={`flex items-center justify-between p-3.5 rounded-lg transition-all text-left group ${
                      isShowdown
                        ? 'bg-gradient-to-r from-[#1A0812] via-[#0C1830] to-[#091326] hover:from-[#280B1A] hover:to-[#12264A] border border-[#EF4444]/70 hover:border-[#EF4444] shadow-[0_0_18px_rgba(239,68,68,0.22)]'
                        : 'bg-[#091326]/90 hover:bg-[#102244] border border-[#1E3A5F] hover:border-[#38BDF8]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`p-2 rounded-md bg-[#040914] border shrink-0 ${
                          isShowdown
                            ? 'border-[#EF4444]/60 group-hover:border-[#EF4444]'
                            : 'border-[#1E3A5F] group-hover:border-[#38BDF8]/60'
                        }`}
                      >
                        {getDirectoryIcon(item.id)}
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-sans font-bold text-xs sm:text-sm tracking-[0.08em] text-[#F8FAFC] uppercase truncate">
                          {item.label}
                        </span>
                        {isShowdown && (
                          <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-[#EF4444]/20 border border-[#EF4444]/50 text-[#FCA5A5] font-mono text-[9px] font-bold uppercase tracking-wider shrink-0">
                            ARCADE 1V1
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 group-hover:translate-x-0.5 transition-all shrink-0 ${
                        isShowdown
                          ? 'text-[#EF4444] group-hover:text-[#FCA5A5]'
                          : 'text-[#64748B] group-hover:text-[#38BDF8]'
                      }`}
                    />
                  </button>
                );
              })}

              {/* Contribution Portal Entry */}
              <button
                type="button"
                data-testid="directory-item-contribute"
                onClick={() => {
                  playTacticalClick();
                  setShowSystemControls(false);
                  onNavigate('contribute');
                }}
                className="flex items-center justify-between p-3.5 rounded-lg bg-[#091326]/90 hover:bg-[#102244] border border-[#1E3A5F] hover:border-[#38BDF8] transition-all text-left group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-md bg-[#040914] border border-[#1E3A5F] group-hover:border-[#38BDF8]/60 shrink-0">
                    <Shield className="w-4 h-4 text-[#38BDF8]" />
                  </div>
                  <span className="font-sans font-bold text-xs sm:text-sm tracking-[0.08em] text-[#F8FAFC] uppercase truncate">
                    SUPPORT APP • CONTRIBUTE
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#EF4444] group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            </div>

            {/* Modal Footer: Quick Model Filter & Account Controls */}
            <div className="mt-5 pt-3.5 border-t border-[#1E3A5F] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="text-[#8E98A4] uppercase text-[10px]">Telemetry Filter:</span>
                {(['F77', 'X47', 'Both'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleModelSelect(m)}
                    className={`px-2.5 py-1 rounded border text-[11px] font-bold ${
                      jetModel === m
                        ? 'bg-[#38BDF8]/20 border-[#38BDF8] text-white'
                        : 'bg-[#081020] border-[#1E3A5F] text-[#8E98A4]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {currentUser ? (
                  <button
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      setShowSystemControls(false);
                      onNavigate('garage');
                    }}
                    className="px-3 py-1.5 rounded bg-[#0C1930] border border-[#38BDF8]/50 text-[#F8FAFC] hover:border-[#38BDF8] text-[11px] flex items-center gap-1.5"
                  >
                    <UserIcon className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <span>{currentUser.fullName}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      setShowSystemControls(false);
                      openAuthModal('login');
                    }}
                    className="px-3 py-1.5 rounded bg-[#38BDF8]/20 border border-[#38BDF8] text-white font-bold text-[11px]"
                  >
                    SIGN IN
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
