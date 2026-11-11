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
  Heart
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
  points: string;
  delayMs: number;
  accent: '#38BDF8' | '#EF4444';
}

/**
 * Exact measured vertices of the Charging Network button's red hexagonal border
 * in the 941x1672 dashboard image asset.
 */
const CHARGING_NETWORK_HEX_VERTICES: readonly [number, number][] = [
  [338, 760],
  [612, 760],
  [673, 950],
  [603, 1039],
  [346, 1039],
  [276, 950]
];

const CHARGING_RADAR_CENTER = { x: 474.5, y: 900 };

function buildScaledHexagonPoints(scale: number): string {
  return CHARGING_NETWORK_HEX_VERTICES.map(([vx, vy]) => {
    const sx = (CHARGING_RADAR_CENTER.x + (vx - CHARGING_RADAR_CENTER.x) * scale).toFixed(1);
    const sy = (CHARGING_RADAR_CENTER.y + (vy - CHARGING_RADAR_CENTER.y) * scale).toFixed(1);
    return `${sx},${sy}`;
  }).join(' ');
}

const CHARGING_HEX_CLIP_POINTS = buildScaledHexagonPoints(1);
const CHARGING_HEX_MID_POINTS = buildScaledHexagonPoints(0.68);
const CHARGING_HEX_CORE_POINTS = buildScaledHexagonPoints(0.38);

/**
 * Precision 941x1672 polygonal bevel contours for all 9 cockpit modules.
 * Used during initial startup for a clean, text-free light-guide perimeter cascade.
 */
const COCKPIT_TRANSFORM_SECTORS: readonly CockpitTransformSectorSpec[] = [
  {
    id: 'transform_charging_network',
    points: CHARGING_HEX_CLIP_POINTS,
    delayMs: 0,
    accent: '#38BDF8'
  },
  {
    id: 'transform_jet_engineer',
    points: '70,792 282,742 225,976 88,976 20,868',
    delayMs: 140,
    accent: '#38BDF8'
  },
  {
    id: 'transform_priority_issues',
    points: '659,742 871,792 921,868 853,976 716,976',
    delayMs: 140,
    accent: '#EF4444'
  },
  {
    id: 'transform_squadron_assist',
    points: '68,1038 242,1038 325,1132 266,1196 68,1196 28,1148 28,1084',
    delayMs: 280,
    accent: '#EF4444'
  },
  {
    id: 'transform_marketplace',
    points: '699,1038 873,1038 913,1084 913,1148 873,1196 675,1196 616,1132',
    delayMs: 280,
    accent: '#EF4444'
  },
  {
    id: 'transform_mod_lab',
    points: '122,1222 396,1222 431,1260 431,1318 396,1350 92,1350 62,1315',
    delayMs: 440,
    accent: '#38BDF8'
  },
  {
    id: 'transform_discussions',
    points: '545,1222 819,1222 879,1315 849,1350 545,1350 510,1318 510,1260',
    delayMs: 440,
    accent: '#38BDF8'
  },
  {
    id: 'transform_all_systems',
    points: '224,1372 717,1372 752,1410 705,1456 236,1456 189,1410',
    delayMs: 600,
    accent: '#38BDF8'
  },
  {
    id: 'transform_mission_mode',
    points: '282,1470 662,1470 726,1542 676,1594 265,1594 215,1542',
    delayMs: 760,
    accent: '#EF4444'
  }
];


/**
 * Generates an SVG pie/sector wedge path centered at (0,0) of radius R from startAngleDeg to endAngleDeg.
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
 * 30 ultra-smooth angular phosphor trail slices (-81 deg to 0 deg) behind a SINGLE
 * radiant leading radar beam, extending to radius 236 and clipped strictly to the exact
 * hexagonal border of the Charging Network button.
 */
const RADAR_PHOSPHOR_TRAIL_SLICES = Array.from({ length: 30 }, (_, idx) => {
  const sliceSpan = 2.7;
  const startDeg = -81 + idx * sliceSpan;
  const endDeg = startDeg + sliceSpan + 0.35; // subtle overlap eliminates subpixel seams
  const progress = (idx + 1) / 30;
  const opacity = Number((0.015 + Math.pow(progress, 2.2) * 0.42).toFixed(3));
  const color =
    idx >= 26
      ? '#E0F2FE'
      : idx >= 19
      ? '#38BDF8'
      : idx >= 11
      ? '#0EA5E9'
      : '#0284C7';
  return {
    id: `phosphor_slice_${idx}`,
    d: buildRadarPhosphorSlicePath(236, startDeg, endDeg),
    color,
    opacity
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

  // Smooth Single-Timeline Initial Cockpit Startup Choreography (zero mid-animation React re-renders)
  const [isBooting, setIsBooting] = useState<boolean>(() => !skipBootAnimation);

  useEffect(() => {
    if (skipBootAnimation) {
      setIsBooting(false);
      return;
    }

    setIsBooting(true);

    const doneTimer = setTimeout(() => {
      setIsBooting(false);
      onCompleteBoot?.();
    }, 3200);

    return () => {
      clearTimeout(doneTimer);
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

        {/* 2. Precision SVG Overlay Locked 1:1 (preserveAspectRatio="none") with Image */}
        <svg
          viewBox="0 0 941 1672"
          preserveAspectRatio="none"
          data-testid="cockpit-interactive-hud-svg"
          className="absolute inset-0 w-full h-full pointer-events-none select-none z-10"
        >
          <defs>
            <radialGradient id="cockpit-radar-core-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.24" />
              <stop offset="60%" stopColor="#0284C7" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="cockpit-beam-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
              <stop offset="45%" stopColor="#7DD3FC" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.75" />
            </linearGradient>
            {/* Exact polygon clip-path locked 1-to-1 to the red hexagonal border of the Charging Network button */}
            <clipPath id="charging-network-hex-clip">
              <polygon points={CHARGING_HEX_CLIP_POINTS} />
            </clipPath>
          </defs>

          {/* =================================================================
              CENTER CONSOLE (CHARGING NETWORK) BORDER-ALIGNED HIGH-TECH AESA RADAR
              Clipped strictly to the exact hexagonal borders of the Charging
              Network button (338,760 -> 612,760 -> 673,950 -> 603,1039 ->
              346,1039 -> 276,950), featuring:
              - Single 360° rotating radar sweep line with luminous plasma core
              - 30-slice authentic phosphor trail decay
              - Hexagonal tactical range contours & vertex corner lock brackets
              - Authentic charging station detection blips with pulsing radar pings
              ================================================================= */}
          <g
            data-testid="cockpit-center-console-radar"
            clipPath="url(#charging-network-hex-clip)"
            className="pointer-events-none select-none"
          >
            {/* Ambient AESA Cyan Core Glow */}
            <circle
              cx={CHARGING_RADAR_CENTER.x}
              cy={CHARGING_RADAR_CENTER.y}
              r="220"
              fill="url(#cockpit-radar-core-glow)"
            />

            {/* Tactical Hexagonal Concentric Range Contours */}
            <polygon
              points={CHARGING_HEX_MID_POINTS}
              fill="none"
              stroke="#38BDF8"
              strokeWidth="1.2"
              strokeDasharray="14 8"
              opacity="0.3"
            />
            <polygon
              points={CHARGING_HEX_CORE_POINTS}
              fill="none"
              stroke="#38BDF8"
              strokeWidth="1"
              strokeDasharray="8 6"
              opacity="0.22"
            />

            {/* Hexagonal Outer Border Accent Line Locked to Button Edge */}
            <polygon
              points={CHARGING_HEX_CLIP_POINTS}
              fill="none"
              stroke="#38BDF8"
              strokeWidth="1.4"
              opacity="0.4"
            />

            {/* 6 Precision Corner Lock Chevrons at Hexagon Vertices */}
            {CHARGING_NETWORK_HEX_VERTICES.map(([vx, vy], idx) => {
              const dx = Math.sign(vx - CHARGING_RADAR_CENTER.x);
              const dy = Math.sign(vy - CHARGING_RADAR_CENTER.y);
              return (
                <polyline
                  key={idx}
                  points={`${vx - dx * 16},${vy} ${vx},${vy} ${vx},${vy - dy * 16}`}
                  fill="none"
                  stroke="#E0F2FE"
                  strokeWidth="2.2"
                  opacity="0.75"
                />
              );
            })}

            {/* Single 360-Degree Rotating Radar Sweep Reaching Exact Hexagon Borders */}
            <g transform={`translate(${CHARGING_RADAR_CENTER.x}, ${CHARGING_RADAR_CENTER.y})`}>
              <g className="radar-sweep" style={{ transformOrigin: '0 0' }}>
                {/* 30 Smooth Conical Phosphor Trail Slices (-81° to 0°) */}
                {RADAR_PHOSPHOR_TRAIL_SLICES.map(slice => (
                  <path
                    key={slice.id}
                    d={slice.d}
                    fill={slice.color}
                    opacity={slice.opacity}
                  />
                ))}

                {/* Soft Outer Glow Along the Single Leading Sweep Beam */}
                <line
                  x1="0"
                  y1="0"
                  x2="236"
                  y2="0"
                  stroke="#38BDF8"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  opacity="0.3"
                />
                {/* Single Crisp Luminous Plasma Leading Radar Sweep Line */}
                <line
                  x1="0"
                  y1="0"
                  x2="236"
                  y2="0"
                  stroke="url(#cockpit-beam-grad)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  opacity="0.96"
                />
              </g>
            </g>
          </g>

          {/* =================================================================
              PRO-GRADE SMOOTH STARTUP LIGHT-GUIDE CHOREOGRAPHY (NO TEXT CLUTTER)
              Cleanly traces the exact physical bevel contours of the cockpit
              modules with full loop completion and graceful group dissolution.
              ================================================================= */}
          {isBooting && (
            <g
              data-testid="cockpit-svg-transform-activation"
              className="pointer-events-none select-none animate-cockpit-boot-group"
            >
              {/* Canopy HUD Reticle Ring Smooth Calibration Trace */}
              <circle
                cx="470.5"
                cy="396"
                r="118"
                pathLength={100}
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2.2"
                strokeLinecap="round"
                className="animate-cockpit-panel-trace"
              />

              {/* Soft Expanding Hexagonal Ignition Pulse from Center Console */}
              <polygon
                points={CHARGING_HEX_CLIP_POINTS}
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2.2"
                className="animate-cockpit-shockwave"
              />

              {/* Symmetric Traveling Light-Guide Filaments Along All 9 Panel Borders */}
              {COCKPIT_TRANSFORM_SECTORS.map(sector => (
                <polygon
                  key={sector.id}
                  points={sector.points}
                  pathLength={100}
                  fill="none"
                  stroke={sector.accent}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="animate-cockpit-panel-trace"
                  style={{ animationDelay: `${sector.delayMs}ms` }}
                />
              ))}
            </g>
          )}

          {effectiveOffline && (
            <g data-testid="cockpit-capsule-offline-visual">
              <rect
                x="32"
                y="120"
                width="199"
                height="62"
                rx="31"
                ry="31"
                fill="#060A0F"
                stroke="#EF4444"
                strokeWidth="2.6"
              />
              <circle cx="68.5" cy="151.5" r="11.5" fill="#EF4444" />
              <path
                d="M 94 146 A 16 16 0 0 1 118 146"
                fill="none"
                stroke="#EF4444"
                strokeWidth="2.3"
                strokeLinecap="round"
              />
              <path
                d="M 98.5 151.5 A 10 10 0 0 1 113.5 151.5"
                fill="none"
                stroke="#EF4444"
                strokeWidth="2.3"
                strokeLinecap="round"
              />
              <circle cx="106" cy="157.5" r="2.2" fill="#EF4444" />
              <line
                x1="95"
                y1="140"
                x2="117"
                y2="161"
                stroke="#EF4444"
                strokeWidth="2.3"
                strokeLinecap="round"
              />
              <text
                x="169.5"
                y="158.5"
                textAnchor="middle"
                fill="#EF4444"
                fontSize="18.5"
                fontWeight="700"
                letterSpacing="0.5"
                fontFamily="sans-serif"
              >
                OFFLINE
              </text>
            </g>
          )}
        </svg>

        {/* Top-Left Status Pill Interactive Hotspot (ONLINE / OFFLINE) — Exact 1:1 Lock to Pill (x:32..231, y:120..182 in 941x1672) */}
        <button
          type="button"
          data-testid="cockpit-hotspot-online-status"
          data-network-mode={effectiveOffline ? 'offline' : 'online'}
          aria-pressed={effectiveOffline}
          title={
            effectiveOffline
              ? 'Working Offline (Local Cache Active) — Click to switch to Online Mode'
              : 'Online Mode Active — Click to switch to Offline Mode'
          }
          onClick={() => {
            playTacticalClick();
            onToggleSimulateOffline?.();
          }}
          aria-label={effectiveOffline ? 'Offline Mode (Tap to go Online)' : 'Online Status (Tap to go Offline)'}
          style={{
            left: '3.40%',
            top: '7.18%',
            width: '21.15%',
            height: '3.71%'
          }}
          className="absolute z-30 bg-transparent border-0 outline-none focus:outline-none cursor-pointer p-0 m-0 rounded-full"
        >
          <span className="sr-only">
            {effectiveOffline ? 'Offline Mode — Working from Local Cache' : 'Online Status — Live Network Link'}
          </span>
        </button>

        {/* Top-Right "Support app" Tactical Avionics Button -> Navigates to Contribution Hub */}
        <button
          type="button"
          data-testid="cockpit-top-right-support-app-btn"
          onClick={() => {
            playTacticalClick();
            onNavigate('contribute');
          }}
          aria-label="Support app"
          title="Support app — Open Contribution Page"
          style={{
            right: '3.40%',
            top: '7.18%'
          }}
          className="absolute z-30 group flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-[#1A070D]/95 via-[#091326]/95 to-[#06182C]/95 backdrop-blur-md border border-[#EF4444]/80 hover:border-[#38BDF8] shadow-[0_0_14px_rgba(239,68,68,0.4),inset_0_0_8px_rgba(56,189,248,0.18)] hover:shadow-[0_0_20px_rgba(56,189,248,0.6),inset_0_0_10px_rgba(239,68,68,0.25)] transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer select-none"
        >
          <span className="relative flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#EF4444]/20 border border-[#EF4444]/60 group-hover:border-[#38BDF8] transition-colors shrink-0">
            <Heart className="w-2 h-2 text-[#EF4444] fill-[#EF4444] group-hover:text-[#38BDF8] group-hover:fill-[#38BDF8] transition-colors animate-pulse" />
          </span>
          <span className="font-['Oxanium',sans-serif] font-extrabold text-[10px] sm:text-[11px] tracking-[0.08em] text-[#F8FAFC] group-hover:text-[#7DD3FC] transition-colors whitespace-nowrap leading-none drop-shadow-[0_0_6px_rgba(239,68,68,0.5)]">
            Support app
          </span>
          <span className="w-1 h-1 rounded-full bg-[#38BDF8] shadow-[0_0_6px_#38BDF8] animate-ping shrink-0" />
        </button>

        {/* Canopy Tactical Avionics HUD Welcome Overlay */}
        <div
          ref={personaRef}
          style={{
            left: '5.0%',
            top: '28.5%',
            width: '90.0%'
          }}
          className={`absolute z-30 text-center pointer-events-auto select-none ${
            isBooting ? 'animate-cockpit-canopy-enter' : ''
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
              <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] shrink-0 shadow-[0_0_10px_#38BDF8]" />
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

        {/* Clean, Text-Free Optical Ignition Veil & Horizon Light Pass During Initial Startup */}
        {isBooting && (
          <div
            data-testid="cockpit-initial-boot-animation-overlay"
            className="absolute inset-0 z-40 pointer-events-none select-none overflow-hidden animate-cockpit-boot-group"
          >
            {/* Smooth Radial Aperture Vignette Opening from Cockpit Core */}
            <div
              className="absolute inset-0 animate-cockpit-ignition-veil"
              style={{
                background:
                  'radial-gradient(circle at 50% 53%, rgba(2,4,10,0.18) 0%, rgba(2,4,10,0.75) 55%, rgba(2,4,10,0.95) 100%)'
              }}
            />
            {/* Single Silky GPU-Composited Optical Horizon Pass */}
            <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-transparent via-[#38BDF8]/14 to-transparent animate-cockpit-horizon-pass" />
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
