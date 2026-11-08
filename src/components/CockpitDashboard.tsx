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
  Gamepad2
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
  isUserAuthorizedForAdmin,
  resolveCockpitOperatorBadge,
  resolveJetEngineerAction
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
  onClearAllNotifications?: () => void;
  onClearNotification?: (id: string) => void;
  openSearch?: () => void;
  initialShowSystemControls?: boolean;
  skipBootAnimation?: boolean;
  onCompleteBoot?: () => void;
}

/**
 * Exact approved GHOST PROTOCOL dashboard image asset (941 x 1672).
 */
export const ORIGINAL_COCKPIT_DASHBOARD_IMAGE =
  '/assets/aistudio/file_0000000090a482118b2116a9d000fd83_b78b8322.png';
export const COCKPIT_ALL_BLUE_IMAGE = ORIGINAL_COCKPIT_DASHBOARD_IMAGE;
export const COCKPIT_ALL_RED_IMAGE = ORIGINAL_COCKPIT_DASHBOARD_IMAGE;

interface TransparentHotspot {
  id: string;
  testId: string;
  ariaLabel: string;
  routeId: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

/**
 * Percentage-based transparent interactive touch regions aligned 1-to-1 with the 9
 * buttons visible in the approved final dashboard image (file_0000000090a482118b2116a9d000fd83_b78b8322.png).
 */
export const DASHBOARD_TRANSPARENT_HOTSPOTS: TransparentHotspot[] = [
  // 2. Jet Engineer (upper-left hexagonal panel)
  {
    id: 'sector_jet_engineer',
    testId: 'cockpit-hotspot-sector_jet_engineer',
    ariaLabel: 'Jet Engineer',
    routeId: 'jet_engineer',
    leftPct: 1.5,
    topPct: 44.5,
    widthPct: 27.0,
    heightPct: 15.5
  },
  // 3. Charging Network (center main hexagonal panel)
  {
    id: 'sector_charging_network',
    testId: 'cockpit-hotspot-sector_charging_network',
    ariaLabel: 'Charging Network',
    routeId: 'charging',
    leftPct: 29.0,
    topPct: 44.0,
    widthPct: 42.0,
    heightPct: 20.5
  },
  // 4. Priority Issues (upper-right hexagonal panel)
  {
    id: 'sector_priority_issues',
    testId: 'cockpit-hotspot-sector_priority_issues',
    ariaLabel: 'Priority Issues',
    routeId: 'problems',
    leftPct: 71.5,
    topPct: 44.5,
    widthPct: 27.0,
    heightPct: 15.5
  },
  // 5. Squadron Assist (middle-left hexagonal panel)
  {
    id: 'sector_squadron_assist',
    testId: 'cockpit-hotspot-sector_squadron_assist',
    ariaLabel: 'Squadron Assist',
    routeId: 'emergency',
    leftPct: 2.5,
    topPct: 63.0,
    widthPct: 32.0,
    heightPct: 10.5
  },
  // 6. Marketplace (middle-right hexagonal panel)
  {
    id: 'sector_marketplace',
    testId: 'cockpit-hotspot-sector_marketplace',
    ariaLabel: 'Marketplace',
    routeId: 'marketplace',
    leftPct: 65.5,
    topPct: 63.0,
    widthPct: 32.0,
    heightPct: 10.5
  },
  // 7. Mod Lab (lower-left wide button)
  {
    id: 'sector_mod_lab',
    testId: 'cockpit-hotspot-sector_mod_lab',
    ariaLabel: 'Mod Lab',
    routeId: 'modifications',
    leftPct: 6.0,
    topPct: 74.5,
    widthPct: 40.0,
    heightPct: 8.0
  },
  // 8. Discussions (lower-right wide button)
  {
    id: 'sector_discussions',
    testId: 'cockpit-hotspot-sector_discussions',
    ariaLabel: 'Discussions',
    routeId: 'discussions',
    leftPct: 54.0,
    topPct: 74.5,
    widthPct: 40.0,
    heightPct: 8.0
  },
  // 9. All Systems (lower-center full directory bar)
  {
    id: 'panel_all_system_controls',
    testId: 'cockpit-hotspot-panel_all_system_controls',
    ariaLabel: 'All Systems',
    routeId: 'system_controls',
    leftPct: 17.5,
    topPct: 83.5,
    widthPct: 65.0,
    heightPct: 5.0
  },
  // 10. Mission Mode (bottom trapezoidal bar)
  {
    id: 'sector_mission_mode',
    testId: 'cockpit-hotspot-sector_mission_mode',
    ariaLabel: 'Mission Mode',
    routeId: 'mission',
    leftPct: 23.0,
    topPct: 89.0,
    widthPct: 54.0,
    heightPct: 7.2
  }
];

interface CockpitTransformSectorSpec {
  id: string;
  label: string;
  points: string;
  conduitPath: string;
  centerX: number;
  centerY: number;
  delayMs: number;
  accent: '#38BDF8' | '#EF4444' | '#F59E0B';
}

/**
 * Exact 941x1672 polygonal geometries & power conduits for all 9 cockpit modules
 * so each module visibly transforms, receives core power, traces its perimeter,
 * and locks into place during the initial app startup sequence.
 */
const COCKPIT_TRANSFORM_SECTORS: readonly CockpitTransformSectorSpec[] = [
  {
    id: 'transform_charging_network',
    label: 'CHARGING RADAR // ONLINE',
    points: '342,762 608,762 666,942 602,1034 348,1034 283,942',
    conduitPath: 'M 474.5 898 L 474.5 762',
    centerX: 474.5,
    centerY: 898,
    delayMs: 0,
    accent: '#38BDF8'
  },
  {
    id: 'transform_jet_engineer',
    label: 'JET ENGINEER // ARMED',
    points: '32,750 252,750 268,776 268,976 248,1002 32,1002 16,976 16,776',
    conduitPath: 'M 312 898 L 268 876 L 141 876',
    centerX: 141,
    centerY: 876,
    delayMs: 120,
    accent: '#38BDF8'
  },
  {
    id: 'transform_priority_issues',
    label: 'PRIORITY ISSUES // ARMED',
    points: '689,750 909,750 925,776 925,976 909,1002 693,1002 673,976 673,776',
    conduitPath: 'M 636 898 L 673 876 L 800 876',
    centerX: 800,
    centerY: 876,
    delayMs: 120,
    accent: '#EF4444'
  },
  {
    id: 'transform_squadron_assist',
    label: 'SQUADRON SOS // ARMED',
    points: '42,1056 308,1056 325,1080 325,1205 308,1226 42,1226 24,1205 24,1080',
    conduitPath: 'M 348 1010 L 290 1056 L 174 1141',
    centerX: 174,
    centerY: 1141,
    delayMs: 240,
    accent: '#EF4444'
  },
  {
    id: 'transform_marketplace',
    label: 'MARKETPLACE // ARMED',
    points: '633,1056 899,1056 917,1080 917,1205 899,1226 633,1226 616,1205 616,1080',
    conduitPath: 'M 602 1010 L 650 1056 L 766 1141',
    centerX: 766,
    centerY: 1141,
    delayMs: 240,
    accent: '#38BDF8'
  },
  {
    id: 'transform_mod_lab',
    label: 'MOD LAB // ARMED',
    points: '76,1248 415,1248 433,1268 433,1360 415,1378 76,1378 56,1360 56,1268',
    conduitPath: 'M 410 1034 L 360 1248 L 244 1313',
    centerX: 244,
    centerY: 1313,
    delayMs: 360,
    accent: '#38BDF8'
  },
  {
    id: 'transform_discussions',
    label: 'DISCUSSIONS // ARMED',
    points: '526,1248 865,1248 885,1268 885,1360 865,1378 526,1378 508,1360 508,1268',
    conduitPath: 'M 540 1034 L 585 1248 L 696 1313',
    centerX: 696,
    centerY: 1313,
    delayMs: 360,
    accent: '#38BDF8'
  },
  {
    id: 'transform_all_systems',
    label: 'ALL SYSTEMS // LINKED',
    points: '185,1398 756,1398 776,1418 776,1462 756,1478 185,1478 165,1462 165,1418',
    conduitPath: 'M 474.5 1034 L 474.5 1438',
    centerX: 474.5,
    centerY: 1438,
    delayMs: 470,
    accent: '#38BDF8'
  },
  {
    id: 'transform_mission_mode',
    label: 'MISSION MODE // LOCKED',
    points: '240,1490 701,1490 725,1525 705,1606 236,1606 216,1525',
    conduitPath: 'M 474.5 1478 L 474.5 1548',
    centerX: 474.5,
    centerY: 1548,
    delayMs: 560,
    accent: '#F59E0B'
  }
];

/**
 * Generates an SVG pie/sector wedge path centered at (0,0) of radius R from startAngleDeg to endAngleDeg
 * (where 0 deg is 3 o'clock / positive X axis, matching standard SVG polar coordinates).
 */
function buildRadarPhosphorSlicePath(radius: number, startDeg: number, endDeg: number): string {
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  const x1 = (Math.cos(startRad) * radius).toFixed(2);
  const y1 = (Math.sin(startRad) * radius).toFixed(2);
  const x2 = (Math.cos(endRad) * radius).toFixed(2);
  const y2 = (Math.sin(endRad) * radius).toFixed(2);
  return `M 0 0 L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`;
}

/**
 * 14 graduated angular phosphor trail slices (-84 deg to 0 deg) for a smooth,
 * authentic fighter-jet AESA radar sweep that reaches the full Charging Network button boundaries.
 */
const RADAR_PHOSPHOR_TRAIL_SLICES = Array.from({ length: 14 }, (_, idx) => {
  const sliceSpan = 6;
  const startDeg = -84 + idx * sliceSpan;
  const endDeg = startDeg + sliceSpan + 0.4; // slight overlap prevents subpixel seams
  const progress = (idx + 1) / 14; // 0.07 -> 1.0
  const opacity = Number((0.025 + Math.pow(progress, 2.15) * 0.52).toFixed(3));
  const color =
    idx >= 12 ? '#E0F2FE' : idx >= 9 ? '#38BDF8' : idx >= 5 ? '#0EA5E9' : '#0284C7';
  return {
    id: `phosphor_slice_${idx}`,
    d: buildRadarPhosphorSlicePath(252, startDeg, endDeg),
    color,
    opacity
  };
});

/**
 * 36 azimuth compass ticks around the radar perimeter (every 10 degrees).
 */
const RADAR_AZIMUTH_TICKS = Array.from({ length: 36 }, (_, idx) => {
  const angleDeg = idx * 10;
  const rad = (angleDeg * Math.PI) / 180;
  const isCardinal = angleDeg % 90 === 0;
  const isMajor = angleDeg % 30 === 0;
  const outerR = 192;
  const innerR = isCardinal ? 174 : isMajor ? 180 : 185;
  return {
    angleDeg,
    x1: Number((474.5 + Math.cos(rad) * innerR).toFixed(1)),
    y1: Number((898 + Math.sin(rad) * innerR).toFixed(1)),
    x2: Number((474.5 + Math.cos(rad) * outerR).toFixed(1)),
    y2: Number((898 + Math.sin(rad) * outerR).toFixed(1)),
    strokeWidth: isCardinal ? 2.2 : isMajor ? 1.5 : 1,
    opacity: isCardinal ? 0.8 : isMajor ? 0.55 : 0.32,
    color: isCardinal ? '#E0F2FE' : '#38BDF8'
  };
});

export const CockpitDashboard: React.FC<CockpitDashboardProps> = ({
  onNavigate,
  selectedJetModel = 'F77',
  onSelectJetModel,
  isOffline = false,
  isSimulatedOffline = false,
  onToggleSimulateOffline,
  initialShowSystemControls = false,
  skipBootAnimation = false,
  onCompleteBoot
}) => {
  const { currentUser, openAuthModal, logout } = useAuth();
  const { soundEnabled, toggleSound, playTacticalClick } = useAudio();

  const effectiveOffline = isOffline || isSimulatedOffline;

  const canAccessAdmin = useMemo(
    () => isUserAuthorizedForAdmin(currentUser),
    [currentUser]
  );

  const [jetModel, setJetModel] = useState<'F77' | 'X47' | 'Both'>(selectedJetModel);
  const [showSystemControls, setShowSystemControls] = useState<boolean>(
    Boolean(initialShowSystemControls)
  );
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const personaRef = useRef<HTMLDivElement>(null);

  // Initial / First-Time App Startup Cockpit Transforming & Activation Sequence
  const [isBooting, setIsBooting] = useState<boolean>(() => !skipBootAnimation);
  const [bootPhase, setBootPhase] = useState<number>(skipBootAnimation ? 4 : 1);

  useEffect(() => {
    if (skipBootAnimation) {
      setIsBooting(false);
      setBootPhase(4);
      return;
    }

    setIsBooting(true);
    setBootPhase(1);

    const t1 = setTimeout(() => {
      setBootPhase(2);
    }, 520);

    const t2 = setTimeout(() => {
      setBootPhase(3);
    }, 1280);

    const t3 = setTimeout(() => {
      setBootPhase(4);
      setIsBooting(false);
      onCompleteBoot?.();
    }, 2100);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [skipBootAnimation, onCompleteBoot]);

  useEffect(() => {
    setJetModel(selectedJetModel);
  }, [selectedJetModel]);

  useEffect(() => {
    if (initialShowSystemControls) {
      setShowSystemControls(true);
    }
  }, [initialShowSystemControls]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (personaRef.current && !personaRef.current.contains(e.target as Node)) {
        setShowPersonaMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPersonaMenu(false);
        setShowSystemControls(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOverlayPopState = () => {
      setShowSystemControls(false);
      setShowPersonaMenu(false);
    };
    window.addEventListener('popstate', handleOverlayPopState);
    return () => window.removeEventListener('popstate', handleOverlayPopState);
  }, []);

  const operatorBadge = useMemo(
    () => resolveCockpitOperatorBadge(currentUser),
    [currentUser]
  );

  const handleHotspotClick = (routeId: string, options?: CockpitNavigateOptions) => {
    playTacticalClick();

    if (isBooting) {
      setIsBooting(false);
      setBootPhase(4);
      onCompleteBoot?.();
    }

    if (routeId === 'system_controls') {
      setShowSystemControls(true);
      try {
        window.history.pushState(
          { tab: 'dashboard', overlay: 'system_controls' },
          '',
          window.location.href
        );
      } catch {}
      return;
    }

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

  return (
    <div
      data-testid="cockpit-dashboard-root"
      className="relative w-full h-[100dvh] min-h-[100dvh] max-h-[100dvh] flex items-center justify-center overflow-hidden select-none bg-black"
    >
      {/* =====================================================================
          EXACT APPROVED GHOST PROTOCOL DASHBOARD IMAGE STAGE (941 x 1672)
          1-to-1 aspect ratio container ensuring all percentage touch regions
          stay locked to the attached image on every screen.
          ===================================================================== */}
      <div
        data-testid="cockpit-rotary-stage"
        className={`relative w-full h-full max-w-lg mx-auto select-none overflow-hidden ${
          isBooting ? 'animate-cockpit-stage-unfold' : ''
        }`}
      >
        {/* 1. Exact Attached Dashboard Image Rendered Pristine Filling Full Screen */}
        <img
          src={ORIGINAL_COCKPIT_DASHBOARD_IMAGE}
          alt="GHOST PROTOCOL Cockpit Dashboard"
          loading="eager"
          decoding="sync"
          fetchPriority="high"
          draggable={false}
          className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none"
        />

        {/* 2. Precision SVG Overlay for AESA Tactical Radar & Initial Cockpit Transformation */}
        <svg
          viewBox="0 0 941 1672"
          data-testid="cockpit-interactive-hud-svg"
          className="absolute inset-0 w-full h-full pointer-events-none select-none z-10"
        >
          <defs>
            <radialGradient id="cockpit-radar-core-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.42" />
              <stop offset="55%" stopColor="#0284C7" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="cockpit-beam-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
              <stop offset="35%" stopColor="#E0F2FE" stopOpacity="0.98" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id="cockpit-laser-scan-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0" />
              <stop offset="20%" stopColor="#38BDF8" stopOpacity="0.85" />
              <stop offset="50%" stopColor="#E0F2FE" stopOpacity="1" />
              <stop offset="80%" stopColor="#38BDF8" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
            </linearGradient>
            {/* Exact polygon clip-path matching the full inner boundaries of the Charging Network hexagon button */}
            <clipPath id="charging-network-hex-clip">
              <polygon points="342,762 608,762 666,942 602,1034 348,1034 283,942" />
            </clipPath>
          </defs>

          {/* =================================================================
              CENTER CONSOLE (CHARGING NETWORK) FULL-BOUNDARY AESA RADAR SWEEP
              Covers the entire hexagonal button up to its boundaries with
              14-layer angular phosphor decay, counter-rotating azimuth rings,
              pulse-doppler wavefronts, and laser leading beam (zero balls).
              ================================================================= */}
          <g
            data-testid="cockpit-center-console-radar"
            clipPath="url(#charging-network-hex-clip)"
            className="pointer-events-none select-none"
          >
            {/* Ambient AESA CRT/Hologram Backlight Glow */}
            <circle
              cx="474.5"
              cy="898"
              r="225"
              fill="url(#cockpit-radar-core-glow)"
            />

            {/* Hexagonal Inner Boundary Precision Frame & Corner Lock Chevrons */}
            <polygon
              points="345,765 605,765 662,942 599,1031 351,1031 287,942"
              fill="none"
              stroke="#38BDF8"
              strokeWidth="1.6"
              strokeDasharray="18 6 4 6"
              opacity="0.45"
            />
            <polyline
              points="336,784 346,766 368,766"
              fill="none"
              stroke="#E0F2FE"
              strokeWidth="2.4"
              opacity="0.8"
            />
            <polyline
              points="582,766 604,766 614,784"
              fill="none"
              stroke="#E0F2FE"
              strokeWidth="2.4"
              opacity="0.8"
            />
            <polyline
              points="651,920 661,942 646,962"
              fill="none"
              stroke="#E0F2FE"
              strokeWidth="2.4"
              opacity="0.8"
            />
            <polyline
              points="612,1012 598,1030 574,1030"
              fill="none"
              stroke="#E0F2FE"
              strokeWidth="2.4"
              opacity="0.8"
            />
            <polyline
              points="376,1030 352,1030 338,1012"
              fill="none"
              stroke="#E0F2FE"
              strokeWidth="2.4"
              opacity="0.8"
            />
            <polyline
              points="304,962 289,942 299,920"
              fill="none"
              stroke="#E0F2FE"
              strokeWidth="2.4"
              opacity="0.8"
            />

            {/* Expanding Pulse-Doppler Wavefront Rings (Pure Radar Waves, Zero Balls) */}
            <circle
              cx="474.5"
              cy="898"
              r="220"
              fill="none"
              stroke="#38BDF8"
              strokeWidth="1.8"
              className="radar-wavefront-1"
            />
            <circle
              cx="474.5"
              cy="898"
              r="220"
              fill="none"
              stroke="#7DD3FC"
              strokeWidth="1.4"
              className="radar-wavefront-2"
            />

            {/* Outer Boundary Range Ring (r=192) & 36 Azimuth Degree Compass Ticks */}
            <circle
              cx="474.5"
              cy="898"
              r="192"
              fill="none"
              stroke="#38BDF8"
              strokeWidth="1.2"
              opacity="0.38"
            />
            {RADAR_AZIMUTH_TICKS.map(tick => (
              <line
                key={tick.angleDeg}
                x1={tick.x1}
                y1={tick.y1}
                x2={tick.x2}
                y2={tick.y2}
                stroke={tick.color}
                strokeWidth={tick.strokeWidth}
                opacity={tick.opacity}
              />
            ))}

            {/* Counter-Rotating Segmented Tactical Avionics Ring (r=154) */}
            <g className="radar-ring-reverse">
              <circle
                cx="474.5"
                cy="898"
                r="154"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2"
                strokeDasharray="28 14 6 14"
                opacity="0.48"
              />
              <circle
                cx="474.5"
                cy="898"
                r="146"
                fill="none"
                stroke="#0EA5E9"
                strokeWidth="1"
                strokeDasharray="4 12"
                opacity="0.35"
              />
            </g>

            {/* Slow Clockwise Bearing Ring (r=110) & Inner Lock Ring (r=62) */}
            <g className="radar-ring-slow">
              <circle
                cx="474.5"
                cy="898"
                r="110"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="1.3"
                strokeDasharray="16 8 3 8"
                opacity="0.38"
              />
            </g>
            <circle
              cx="474.5"
              cy="898"
              r="62"
              fill="none"
              stroke="#7DD3FC"
              strokeWidth="1.2"
              opacity="0.36"
            />

            {/* Full-Span Tactical Split Crosshairs & Range Scale Graduations */}
            <line
              x1="474.5"
              y1="752"
              x2="474.5"
              y2="876"
              stroke="#38BDF8"
              strokeWidth="1.2"
              opacity="0.38"
            />
            <line
              x1="474.5"
              y1="920"
              x2="474.5"
              y2="1044"
              stroke="#38BDF8"
              strokeWidth="1.2"
              opacity="0.38"
            />
            <line
              x1="276"
              y1="898"
              x2="452.5"
              y2="898"
              stroke="#38BDF8"
              strokeWidth="1.2"
              opacity="0.38"
            />
            <line
              x1="496.5"
              y1="898"
              x2="673"
              y2="898"
              stroke="#38BDF8"
              strokeWidth="1.2"
              opacity="0.38"
            />
            {/* Diagonal 45° Reference Hairlines */}
            <line
              x1="335"
              y1="758"
              x2="614"
              y2="1038"
              stroke="#38BDF8"
              strokeWidth="0.8"
              strokeDasharray="5 7"
              opacity="0.22"
            />
            <line
              x1="614"
              y1="758"
              x2="335"
              y2="1038"
              stroke="#38BDF8"
              strokeWidth="0.8"
              strokeDasharray="5 7"
              opacity="0.22"
            />

            {/* 360-Degree Rotating Multi-Slice Angular Phosphor Radar Sweep */}
            <g transform="translate(474.5, 898)">
              <g className="radar-sweep" style={{ transformOrigin: '0 0' }}>
                {/* 14 Graduated Angular Phosphor Trail Wedges (-84° to 0°) */}
                {RADAR_PHOSPHOR_TRAIL_SLICES.map(slice => (
                  <path
                    key={slice.id}
                    d={slice.d}
                    fill={slice.color}
                    opacity={slice.opacity}
                  />
                ))}

                {/* Secondary 180° Counter-Vane Echo Trail (-204° to -180°) */}
                <path
                  d={buildRadarPhosphorSlicePath(248, -204, -180)}
                  fill="#0EA5E9"
                  opacity="0.14"
                />
                <line
                  x1="0"
                  y1="0"
                  x2="-248"
                  y2="0"
                  stroke="#38BDF8"
                  strokeWidth="1.3"
                  strokeDasharray="10 6"
                  opacity="0.45"
                />

                {/* Leading-Edge Arc Highlights where Sweep Beam Intersects Range Rings */}
                <path
                  d="M 154 0 A 154 154 0 0 0 144.7 -52.7"
                  fill="none"
                  stroke="#E0F2FE"
                  strokeWidth="2.8"
                  opacity="0.85"
                />
                <path
                  d="M 110 0 A 110 110 0 0 0 103.4 -37.6"
                  fill="none"
                  stroke="#7DD3FC"
                  strokeWidth="2.2"
                  opacity="0.75"
                />
                <path
                  d="M 62 0 A 62 62 0 0 0 58.3 -21.2"
                  fill="none"
                  stroke="#E0F2FE"
                  strokeWidth="2"
                  opacity="0.8"
                />

                {/* Outer Glow Halo Along Leading Radar Beam */}
                <line
                  x1="0"
                  y1="0"
                  x2="252"
                  y2="0"
                  stroke="#38BDF8"
                  strokeWidth="7"
                  strokeLinecap="round"
                  opacity="0.35"
                />
                {/* Razor-Sharp Core Plasma Leading Beam */}
                <line
                  x1="0"
                  y1="0"
                  x2="252"
                  y2="0"
                  stroke="url(#cockpit-beam-grad)"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  opacity="0.98"
                />
              </g>

              {/* Center AESA Emitter Lock Hub */}
              <circle
                cx="0"
                cy="0"
                r="16"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="1.5"
                opacity="0.65"
              />
              <circle
                cx="0"
                cy="0"
                r="7"
                fill="#38BDF8"
                opacity="0.45"
              />
              <circle
                cx="0"
                cy="0"
                r="3.2"
                fill="#F0F9FF"
              />
            </g>
          </g>

          {/* =================================================================
              INITIAL / FIRST-TIME STARTUP COCKPIT TRANSFORMATION & ACTIVATION
              Sequentially powers up, unfolds, traces, and arms every cockpit
              module from the central reactor core outward.
              ================================================================= */}
          {isBooting && (
            <g
              data-testid="cockpit-svg-transform-activation"
              className="pointer-events-none select-none"
            >
              {/* Expanding Reactor Core Shockwaves from Center Console (474.5, 898) */}
              <circle
                cx="474.5"
                cy="898"
                r="240"
                fill="none"
                stroke="#38BDF8"
                className="animate-cockpit-shockwave"
              />
              <polygon
                points="342,762 608,762 666,942 602,1034 348,1034 283,942"
                fill="none"
                stroke="#E0F2FE"
                strokeWidth="4"
                className="animate-cockpit-shockwave"
                style={{ animationDelay: '180ms' }}
              />

              {/* Energy Conduits Radiating from Center Core to All 9 Cockpit Modules & Canopy */}
              <path
                d="M 474.5 762 L 474.5 495"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2.5"
                className="animate-cockpit-conduit"
              />
              {COCKPIT_TRANSFORM_SECTORS.map(sector => (
                <g key={sector.id}>
                  {/* Power Conduit Circuit Line */}
                  <path
                    d={sector.conduitPath}
                    fill="none"
                    stroke={sector.accent}
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    className="animate-cockpit-conduit"
                    style={{ animationDelay: `${sector.delayMs}ms` }}
                  />

                  {/* Holographic Module Ignition Fill Pulse */}
                  <polygon
                    points={sector.points}
                    fill={sector.accent}
                    className="animate-cockpit-panel-fill"
                    style={{ animationDelay: `${sector.delayMs + 60}ms` }}
                  />

                  {/* Laser Perimeter Trace Around Exact Module Polygon */}
                  <polygon
                    points={sector.points}
                    fill="none"
                    stroke={sector.accent}
                    strokeWidth="3.2"
                    strokeLinejoin="round"
                    className="animate-cockpit-panel-trace"
                    style={{ animationDelay: `${sector.delayMs}ms` }}
                  />
                  <polygon
                    points={sector.points}
                    fill="none"
                    stroke="#E0F2FE"
                    strokeWidth="1.4"
                    strokeDasharray="16 10"
                    className="animate-cockpit-panel-trace"
                    style={{ animationDelay: `${sector.delayMs + 90}ms` }}
                  />

                  {/* Module Activation Lock Badge */}
                  {bootPhase >= 2 && (
                    <g
                      transform={`translate(${sector.centerX}, ${sector.centerY})`}
                      opacity={bootPhase === 2 ? 0.95 : 0.65}
                    >
                      <rect
                        x="-92"
                        y="-15"
                        width="184"
                        height="30"
                        rx="6"
                        fill="#020814"
                        fillOpacity="0.88"
                        stroke={sector.accent}
                        strokeWidth="1.6"
                      />
                      <text
                        x="0"
                        y="5"
                        textAnchor="middle"
                        fill="#F0F9FF"
                        fontSize="12.5"
                        fontWeight="800"
                        letterSpacing="1.6"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {sector.label}
                      </text>
                    </g>
                  )}
                </g>
              ))}
            </g>
          )}

          {effectiveOffline && (
            <g data-testid="cockpit-capsule-offline-visual">
              <rect
                x="50"
                y="150"
                width="184"
                height="52"
                rx="26"
                fill="#070A10"
                stroke="#EF4444"
                strokeWidth="2"
              />
              <circle cx="80" cy="176" r="10" fill="#EF4444" />
              <path
                d="M 103 172 A 14 14 0 0 1 125 172"
                fill="none"
                stroke="#EF4444"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <path
                d="M 107 177 A 9 9 0 0 1 121 177"
                fill="none"
                stroke="#EF4444"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <circle cx="114" cy="182" r="2" fill="#EF4444" />
              <line
                x1="103"
                y1="166"
                x2="125"
                y2="186"
                stroke="#EF4444"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <text
                x="176"
                y="183"
                textAnchor="middle"
                fill="#EF4444"
                fontSize="19"
                fontWeight="700"
                letterSpacing="0.8"
                fontFamily="sans-serif"
              >
                OFFLINE
              </text>
            </g>
          )}
        </svg>

        {/* Top-Left Status Pill Interactive Hotspot (ONLINE / OFFLINE) */}
        <button
          type="button"
          data-testid="cockpit-hotspot-online-status"
          data-network-mode={effectiveOffline ? 'offline' : 'online'}
          aria-pressed={effectiveOffline}
          onClick={() => {
            playTacticalClick();
            onToggleSimulateOffline?.();
          }}
          aria-label={effectiveOffline ? 'Offline Mode' : 'Online Status'}
          style={{
            left: '5.0%',
            top: '8.8%',
            width: '19.8%',
            height: '3.5%'
          }}
          className="absolute z-20 bg-transparent border-0 outline-none focus:outline-none cursor-pointer p-0 m-0"
        >
          <span className="sr-only">
            {effectiveOffline ? 'Offline Mode' : 'Online Status'}
          </span>
        </button>

        {/* Canopy Tactical Avionics HUD Welcome Overlay */}
        <div
          ref={personaRef}
          style={{
            left: '5.0%',
            top: '28.5%',
            width: '90.0%'
          }}
          className={`absolute z-30 text-center pointer-events-auto select-none transition-all duration-700 ease-out ${
            isBooting
              ? bootPhase === 1
                ? 'opacity-0 -translate-y-8 scale-75'
                : bootPhase === 2
                ? 'opacity-90 -translate-y-1 scale-105'
                : 'opacity-100 translate-y-0 scale-100'
              : ''
          }`}
        >
          <button
            type="button"
            data-testid="cockpit-hotspot-profile"
            onClick={() => {
              playTacticalClick();
              setShowPersonaMenu(prev => !prev);
            }}
            aria-label="Pilot Profile & Controls"
            className="w-full bg-transparent border-0 outline-none focus:outline-none cursor-pointer p-0 m-0 group flex flex-col items-center justify-center text-center relative"
          >
            {/* Line 1: Welcome <nickname> using Oxanium HUD font with glowing cyan capsule */}
            <div className="flex items-center justify-center gap-2 mb-1 px-4 py-1 rounded-full bg-[#020814]/90 backdrop-blur-md border border-[#38BDF8]/60 group-hover:border-[#38BDF8] transition-all shadow-[0_0_18px_rgba(56,189,248,0.35)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] animate-pulse shrink-0 shadow-[0_0_10px_#38BDF8]" />
              <span className="font-['Oxanium',sans-serif] text-xs sm:text-sm font-extrabold text-[#38BDF8] tracking-wider uppercase">
                Welcome {currentUser?.pilotNickname || 'Top Gun'}
              </span>
            </div>

            {/* Line 2: Clean plain username text without text box */}
            <div className="flex items-center justify-center mt-1">
              <span className="font-['Orbitron',sans-serif] font-black text-2xl sm:text-3xl md:text-4xl text-[#38BDF8] tracking-wider uppercase drop-shadow-[0_0_18px_rgba(56,189,248,0.7)] group-hover:text-[#7DD3FC] transition-all">
                {currentUser?.fullName?.split(' ')[0] || operatorBadge.fullName?.split(' ')[0] || 'Abinav'}
              </span>
            </div>
          </button>

          {showPersonaMenu && (
            <div
              role="dialog"
              aria-label="Operator Profile & Controls"
              className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-[#040812]/98 backdrop-blur-xl border border-[#1E3A5F] rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.98)] p-3.5 z-50 text-xs font-sans text-[#E8EDF2] text-left"
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

                  <div className="space-y-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        playTacticalClick();
                        setShowPersonaMenu(false);
                        onNavigate('garage');
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded bg-[#0A1324] hover:bg-[#112240] border border-[#1E3A5F]/60 text-[#F8FAFC] font-mono text-[11px]"
                    >
                      <span>MY GARAGE & PROFILE</span>
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
                    Sign in to display your registered pilot name, nickname, and garage profile.
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
          )}
        </div>

        {/* Transparent Holographic Transformation HUD Frame (No opaque curtain — lets user watch every cockpit panel transform & lock in) */}
        {isBooting && (
          <div
            data-testid="cockpit-initial-boot-animation-overlay"
            className="absolute inset-0 z-40 pointer-events-none select-none overflow-hidden"
          >
            {/* Full-Cockpit Vertical Calibration Laser Sweep */}
            <div className="absolute inset-x-0 h-1.5 bg-gradient-to-r from-transparent via-[#38BDF8] to-transparent shadow-[0_0_28px_#38BDF8] animate-hud-scanline pointer-events-none z-20" />

            {/* Mechanical Corner Lock Brackets */}
            <div className="absolute top-3 left-3 w-11 h-11 border-t-2 border-l-2 border-[#38BDF8] animate-hud-bracket-tl shadow-[0_0_14px_#38BDF8]" />
            <div className="absolute top-3 right-3 w-11 h-11 border-t-2 border-r-2 border-[#38BDF8] animate-hud-bracket-tr shadow-[0_0_14px_#38BDF8]" />
            <div className="absolute bottom-3 left-3 w-11 h-11 border-b-2 border-l-2 border-[#38BDF8] animate-hud-bracket-bl shadow-[0_0_14px_#38BDF8]" />
            <div className="absolute bottom-3 right-3 w-11 h-11 border-b-2 border-r-2 border-[#38BDF8] animate-hud-bracket-br shadow-[0_0_14px_#38BDF8]" />

            {/* Top Canopy Transformation Telemetry Bar */}
            <div className="absolute top-[14%] inset-x-6 flex flex-col items-center justify-center">
              <div className="px-4 py-2 rounded-xl bg-[#020814]/88 backdrop-blur-md border border-[#38BDF8]/70 shadow-[0_0_30px_rgba(56,189,248,0.4)] text-center font-mono max-w-sm w-full">
                <div className="text-[11px] sm:text-xs font-black text-[#E0F2FE] tracking-[0.2em] uppercase font-['Orbitron',sans-serif] animate-hud-glitch-text">
                  {bootPhase === 1
                    ? 'UNFOLDING COCKPIT CORE REACTOR...'
                    : bootPhase === 2
                    ? 'ACTIVATING & TRANSFORMING 9 SECTORS...'
                    : 'ALL AVIONICS LOCKED • SYSTEMS ONLINE'}
                </div>
                <div className="mt-1.5 w-full h-1.5 rounded-full bg-[#091526] overflow-hidden border border-[#38BDF8]/40">
                  <div
                    className="h-full bg-gradient-to-r from-[#0284C7] via-[#38BDF8] to-[#E0F2FE] transition-all duration-500 ease-out shadow-[0_0_12px_#38BDF8]"
                    style={{
                      width: bootPhase === 1 ? '34%' : bootPhase === 2 ? '76%' : '100%'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. Transparent Interactive Touch Regions over the 10 Dashboard Buttons */}
        {DASHBOARD_TRANSPARENT_HOTSPOTS.map(hotspot => (
          <button
            key={hotspot.id}
            type="button"
            data-testid={hotspot.testId}
            data-zone-id={hotspot.id}
            onClick={() => handleHotspotClick(hotspot.routeId)}
            aria-label={hotspot.ariaLabel}
            style={{
              left: `${hotspot.leftPct}%`,
              top: `${hotspot.topPct}%`,
              width: `${hotspot.widthPct}%`,
              height: `${hotspot.heightPct}%`
            }}
            className="absolute z-20 bg-transparent border-0 outline-none focus:outline-none cursor-pointer p-0 m-0"
          >
            <span className="sr-only">{hotspot.ariaLabel}</span>
          </button>
        ))}
      </div>

      {/* =====================================================================
          ALL SYSTEMS DIRECTORY MODAL (OPENS WHEN TAPPING "ALL SYSTEMS")
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
              if (
                typeof window !== 'undefined' &&
                window.history.state?.overlay === 'system_controls'
              ) {
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
                    if (
                      typeof window !== 'undefined' &&
                      window.history.state?.overlay === 'system_controls'
                    ) {
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
