import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Settings,
  Cpu,
  Radio,
  Wrench,
  Zap,
  Building2,
  Layers,
  MessageSquare,
  ShoppingBag,
  ShoppingCart,
  Calendar,
  Shield,
  Search,
  Bell,
  Volume2,
  VolumeX,
  User as UserIcon,
  X,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Compass,
  LayoutGrid,
  Users,
  Navigation as NavArrow,
  ClipboardList,
  BarChart3,
  MapPin,
  KeyRound
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
  COCKPIT_ROTARY_STAGE_ASSET_PATH,
  ALL_SYSTEM_CONTROLS_DIRECTORY,
  getAuthorizedRotaryDestinations,
  formatRotarySelectionCounter,
  isUserAuthorizedForAdmin,
  calculatePointerAngleDeg,
  shortestAngularDelta,
  getSegmentStepDeg,
  getNearestRotaryIndex,
  getTargetWheelRotationForIndex,
  computeInertialSnapIndex,
  resolveJetEngineerAction,
  type RotaryDestinationItem,
  type RotaryIconKey
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
}

const ROTARY_SELECTION_STORAGE_KEY = 'ghost_protocol_rotary_selected_id';
let hasPlayedCockpitEntranceInSession = false;

/**
 * Generates a mathematically exact SVG annular sector path centered at 12 o'clock (0°).
 * All segments share identical inner/outer radii and angular span so radial dividers meet
 * cleanly at the concentric inner and outer rings with uniform segment geometry.
 */
function buildAnnularWedgePath(
  rInner: number,
  rOuter: number,
  halfSpanDeg: number
): string {
  const aRad = Math.max(1, halfSpanDeg) * (Math.PI / 180);

  const x1In = -rInner * Math.sin(aRad);
  const y1In = -rInner * Math.cos(aRad);
  const x2In = rInner * Math.sin(aRad);
  const y2In = -rInner * Math.cos(aRad);

  const x1Out = -rOuter * Math.sin(aRad);
  const y1Out = -rOuter * Math.cos(aRad);
  const x2Out = rOuter * Math.sin(aRad);
  const y2Out = -rOuter * Math.cos(aRad);

  return [
    `M ${x1In.toFixed(2)} ${y1In.toFixed(2)}`,
    `L ${x1Out.toFixed(2)} ${y1Out.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 0 1 ${x2Out.toFixed(2)} ${y2Out.toFixed(2)}`,
    `L ${x2In.toFixed(2)} ${y2In.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 0 0 ${x1In.toFixed(2)} ${y1In.toFixed(2)}`,
    'Z'
  ].join(' ');
}

export const CockpitDashboard: React.FC<CockpitDashboardProps> = ({
  onNavigate,
  selectedJetModel = 'F77',
  onSelectJetModel,
  onOpenWelcome,
  notifications = [],
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  openSearch
}) => {
  const { currentUser, switchPersona, availableUsers, openAuthModal, logout } = useAuth();
  const { soundEnabled, toggleSound, reducedMotion, playTacticalClick } = useAudio();

  const canAccessAdmin = useMemo(
    () => isUserAuthorizedForAdmin(currentUser),
    [currentUser]
  );

  const authorizedDestinations = useMemo(
    () => getAuthorizedRotaryDestinations(currentUser),
    [currentUser]
  );

  const totalDestinations = authorizedDestinations.length;
  const stepDeg = useMemo(
    () => getSegmentStepDeg(totalDestinations),
    [totalDestinations]
  );

  // Restore last selected destination in session if valid & authorized
  const [selectedIndex, setSelectedIndex] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedId = sessionStorage.getItem(ROTARY_SELECTION_STORAGE_KEY);
        if (savedId) {
          const idx = authorizedDestinations.findIndex(d => d.id === savedId);
          if (idx >= 0) return idx;
        }
      } catch {
        // Ignore storage errors
      }
    }
    return 0;
  });

  const [wheelRotationDeg, setWheelRotationDeg] = useState<number>(() => {
    return -selectedIndex * getSegmentStepDeg(authorizedDestinations.length);
  });

  const [isDraggingDial, setIsDraggingDial] = useState(false);
  const [hubPressed, setHubPressed] = useState(false);
  const [selectionPulse, setSelectionPulse] = useState(false);
  const [pressedControlId, setPressedControlId] = useState<string | null>(null);
  const [jetModel, setJetModel] = useState<'F77' | 'X47' | 'Both'>(selectedJetModel);
  const [showSystemControls, setShowSystemControls] = useState(false);
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [entranceActive, setEntranceActive] = useState<boolean>(() => {
    if (hasPlayedCockpitEntranceInSession) return false;
    return true;
  });

  const dialContainerRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const personaRef = useRef<HTMLDivElement>(null);
  const isNavigatingRef = useRef<boolean>(false);
  const lastWheelTimestampRef = useRef<number>(0);

  // Mutable gesture state for 60fps pointer tracking without stale closures
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    centerX: number;
    centerY: number;
    lastPointerAngleDeg: number;
    currentWheelDeg: number;
    totalAbsMovedDeg: number;
    lastMoveTimeMs: number;
    angularVelocityDegPerSec: number;
    tappedSegmentIndex: number | null;
  }>({
    active: false,
    pointerId: null,
    centerX: 0,
    centerY: 0,
    lastPointerAngleDeg: 0,
    currentWheelDeg: 0,
    totalAbsMovedDeg: 0,
    lastMoveTimeMs: 0,
    angularVelocityDegPerSec: 0,
    tappedSegmentIndex: null
  });

  useEffect(() => {
    if (!hasPlayedCockpitEntranceInSession) {
      hasPlayedCockpitEntranceInSession = true;
      const timer = setTimeout(() => {
        setEntranceActive(false);
      }, reducedMotion ? 50 : 650);
      return () => clearTimeout(timer);
    }
  }, [reducedMotion]);

  useEffect(() => {
    setJetModel(selectedJetModel);
  }, [selectedJetModel]);

  // Keep selectedIndex within bounds if user permissions change (e.g. signing out from Admin)
  useEffect(() => {
    if (selectedIndex >= totalDestinations) {
      const safeIdx = 0;
      setSelectedIndex(safeIdx);
      setWheelRotationDeg(prev =>
        getTargetWheelRotationForIndex(prev, safeIdx, totalDestinations)
      );
    } else {
      setWheelRotationDeg(prev =>
        getTargetWheelRotationForIndex(prev, selectedIndex, totalDestinations)
      );
    }
  }, [totalDestinations, selectedIndex]);

  // Persist selected destination ID to sessionStorage
  useEffect(() => {
    const activeItem = authorizedDestinations[selectedIndex];
    if (!activeItem || typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(ROTARY_SELECTION_STORAGE_KEY, activeItem.id);
    } catch {
      // Ignore storage errors
    }
  }, [selectedIndex, authorizedDestinations]);

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

  const unreadNotificationsCount = notifications.filter(n => !n.read).length;

  const operatorDisplayName = currentUser?.fullName
    ? currentUser.fullName.toUpperCase()
    : 'SIGN IN';

  const operatorRoleLabel = currentUser
    ? (
        currentUser.pilotNickname ||
        (currentUser.motorcycleModel?.toUpperCase().includes('X47')
          ? 'X47 PILOT'
          : 'F77 PILOT')
      ).toUpperCase()
    : 'VISITOR MODE';

  const selectedDestination: RotaryDestinationItem =
    authorizedDestinations[selectedIndex] || authorizedDestinations[0];

  const selectDestinationByIndex = useCallback(
    (targetIdx: number, playAudio = true) => {
      const normalizedIdx =
        ((targetIdx % totalDestinations) + totalDestinations) % totalDestinations;
      if (playAudio) {
        playTacticalClick();
      }
      setSelectedIndex(normalizedIdx);
      setWheelRotationDeg(prev =>
        getTargetWheelRotationForIndex(prev, normalizedIdx, totalDestinations)
      );
      if (!reducedMotion) {
        setSelectionPulse(true);
        setTimeout(() => setSelectionPulse(false), 240);
      }
    },
    [totalDestinations, playTacticalClick, reducedMotion]
  );

  const activateDestination = useCallback(
    (destination: RotaryDestinationItem, overrideJetMode?: 'ask' | 'train') => {
      if (isNavigatingRef.current) return;
      // Enforce authorization check before navigating to restricted route
      if (destination.requiresAdminOrOwner && !canAccessAdmin) {
        return;
      }

      isNavigatingRef.current = true;
      playTacticalClick();
      setHubPressed(true);

      const delay = reducedMotion ? 20 : 150;
      setTimeout(() => {
        setHubPressed(false);
        isNavigatingRef.current = false;
        if (destination.routeId === 'jet_engineer') {
          const desiredMode = overrideJetMode || destination.jetMode || 'ask';
          const resolved = resolveJetEngineerAction(
            desiredMode === 'train' ? 'train' : 'help'
          );
          onNavigate(resolved.routeId, {
            jetMode: desiredMode,
            jetModel
          });
          return;
        }
        if (destination.routeId === 'charging') {
          onNavigate('charging', {
            chargingMode: destination.chargingMode || 'map'
          });
          return;
        }
        onNavigate(destination.routeId);
      }, delay);
    },
    [canAccessAdmin, jetModel, onNavigate, playTacticalClick, reducedMotion]
  );

  const triggerCockpitNavigation = (
    controlId: string,
    routeId: string,
    options?: CockpitNavigateOptions
  ) => {
    playTacticalClick();
    setPressedControlId(controlId);

    if (routeId === 'system_controls') {
      setShowSystemControls(true);
      setPressedControlId(null);
      return;
    }

    const delay = reducedMotion ? 20 : 120;
    setTimeout(() => {
      onNavigate(routeId, options);
      setPressedControlId(null);
    }, delay);
  };

  const handleModelSelect = (model: 'F77' | 'X47' | 'Both') => {
    playTacticalClick();
    setJetModel(model);
    onSelectJetModel?.(model);
  };

  // Pointer Gesture Handlers for the Rotary Dial
  const handleDialPointerDown = (
    e: React.PointerEvent<HTMLElement>,
    tappedSegmentIndex: number | null = null
  ) => {
    // Ignore right-clicks
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!dialContainerRef.current) return;

    const rect = dialContainerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distFromCenter = Math.hypot(e.clientX - centerX, e.clientY - centerY);
    const hubRadiusPx = rect.width * (148 / 768);

    // If pointer down is inside the central activation hub, let the hub button handle it directly
    if (distFromCenter < hubRadiusPx && tappedSegmentIndex === null) {
      return;
    }

    const startAngle = calculatePointerAngleDeg(centerX, centerY, e.clientX, e.clientY);
    dragStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      centerX,
      centerY,
      lastPointerAngleDeg: startAngle,
      currentWheelDeg: wheelRotationDeg,
      totalAbsMovedDeg: 0,
      lastMoveTimeMs: performance.now(),
      angularVelocityDegPerSec: 0,
      tappedSegmentIndex
    };

    setIsDraggingDial(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore pointer capture errors on synthetic events
    }
  };

  const handleDialPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state.active || state.pointerId !== e.pointerId) return;

    const now = performance.now();
    const newPointerAngle = calculatePointerAngleDeg(
      state.centerX,
      state.centerY,
      e.clientX,
      e.clientY
    );
    const deltaDeg = shortestAngularDelta(state.lastPointerAngleDeg, newPointerAngle);
    if (Math.abs(deltaDeg) < 0.05) return;

    const dtSec = Math.max(0.008, (now - state.lastMoveTimeMs) / 1000);
    const instVelocity = deltaDeg / dtSec;

    state.angularVelocityDegPerSec =
      state.angularVelocityDegPerSec * 0.4 + instVelocity * 0.6;
    state.lastPointerAngleDeg = newPointerAngle;
    state.lastMoveTimeMs = now;
    state.currentWheelDeg += deltaDeg;
    state.totalAbsMovedDeg += Math.abs(deltaDeg);

    setWheelRotationDeg(state.currentWheelDeg);

    const nearestIdx = getNearestRotaryIndex(state.currentWheelDeg, totalDestinations);
    if (nearestIdx !== selectedIndex) {
      setSelectedIndex(nearestIdx);
      playTacticalClick();
    }
  };

  const finishDialPointerGesture = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state.active) return;

    state.active = false;
    setIsDraggingDial(false);
    try {
      if (state.pointerId !== null && e.currentTarget.hasPointerCapture(state.pointerId)) {
        e.currentTarget.releasePointerCapture(state.pointerId);
      }
    } catch {
      // Ignore release errors
    }

    // If movement was minimal (< 5°), treat as a click/tap on a segment to select & align it
    if (state.totalAbsMovedDeg < 5 && state.tappedSegmentIndex !== null) {
      selectDestinationByIndex(state.tappedSegmentIndex, true);
      return;
    }

    // Otherwise, perform deterministic magnetic snapping with controlled inertia
    const { targetIndex, targetRotationDeg } = computeInertialSnapIndex(
      state.currentWheelDeg,
      state.angularVelocityDegPerSec,
      totalDestinations,
      reducedMotion
    );

    if (targetIndex !== selectedIndex) {
      playTacticalClick();
    }
    setSelectedIndex(targetIndex);
    setWheelRotationDeg(targetRotationDeg);
    if (!reducedMotion) {
      setSelectionPulse(true);
      setTimeout(() => setSelectionPulse(false), 240);
    }
  };

  const handleDialKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      selectDestinationByIndex(selectedIndex + 1, true);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      selectDestinationByIndex(selectedIndex - 1, true);
    } else if (e.key === 'Home') {
      e.preventDefault();
      selectDestinationByIndex(0, true);
    } else if (e.key === 'End') {
      e.preventDefault();
      selectDestinationByIndex(totalDestinations - 1, true);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (selectedDestination) {
        activateDestination(selectedDestination);
      }
    }
  };

  const handleDialWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const now = performance.now();
    if (now - lastWheelTimestampRef.current < 130) return;
    if (Math.abs(e.deltaY) < 8 && Math.abs(e.deltaX) < 8) return;
    lastWheelTimestampRef.current = now;
    const dir = (e.deltaY || e.deltaX) > 0 ? 1 : -1;
    selectDestinationByIndex(selectedIndex + dir, true);
  };

  const renderRotaryIcon = (iconKey: RotaryIconKey, className: string) => {
    switch (iconKey) {
      case 'cog':
        return <Settings className={className} />;
      case 'zap':
        return <Zap className={className} />;
      case 'users':
        return <Users className={className} />;
      case 'navigation':
        return <NavArrow className={className} />;
      case 'clipboard':
        return <ClipboardList className={className} />;
      case 'message':
        return <MessageSquare className={className} />;
      case 'cart':
        return <ShoppingCart className={className} />;
      case 'book':
        return <BookOpen className={className} />;
      case 'chart':
        return <BarChart3 className={className} />;
      case 'pin':
        return <MapPin className={className} />;
      case 'key':
        return <KeyRound className={className} />;
      case 'shield':
        return <Shield className={className} />;
      default:
        return <Cpu className={className} />;
    }
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
      case 'dir_admin':
        return <Shield className="w-4 h-4 text-[#E04F5F]" />;
      default:
        return <LayoutGrid className="w-4 h-4 text-[#38BDF8]" />;
    }
  };

  const visibleDirectoryItems = ALL_SYSTEM_CONTROLS_DIRECTORY.filter(
    item => !item.requiresAdminOrOwner || canAccessAdmin
  );

  // Precompute uniform SVG wedge geometry for the current number of authorized destinations.
  // Both idle and active segments use the exact same annular wedge path (rInner=198, rOuter=374)
  // so radial dividers meet cleanly at the inner and outer concentric rings and the active segment
  // remains the exact same size and geometry as all other segments.
  const halfSpanDeg = stepDeg / 2;
  const segmentWedgePath = useMemo(
    () => buildAnnularWedgePath(198, 374, halfSpanDeg),
    [halfSpanDeg]
  );

  const renderNotificationsPopover = () => (
    <div
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-[#020408]/95 backdrop-blur-xl border border-[#1E2D42] rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.98)] p-3.5 z-50 text-xs font-sans text-[#E8EDF2]"
    >
      <div className="flex items-center justify-between border-b border-[#141E2E] pb-2 mb-2.5">
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
            className="text-[11px] font-mono text-[#38BDF8] hover:underline cursor-pointer"
          >
            Mark all read
          </button>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto space-y-2">
        {notifications.length === 0 ? (
          <div className="text-center py-5 text-[#64748B] text-[11px] font-mono">
            No active notifications
          </div>
        ) : (
          notifications.map(n => (
            <button
              type="button"
              key={n.id}
              onClick={() => {
                playTacticalClick();
                onMarkNotificationRead?.(n.id);
              }}
              className={`w-full text-left p-2.5 rounded border transition-colors cursor-pointer ${
                n.read
                  ? 'bg-[#060A12]/80 border-[#131C2B] text-[#94A3B8]'
                  : 'bg-[#09101C] border-[#38BDF8]/50 text-[#F8FAFC]'
              }`}
            >
              <div className="font-semibold text-[11px] mb-0.5 flex items-center justify-between gap-2">
                <span>{n.title}</span>
                {!n.read && (
                  <span className="w-2 h-2 rounded-full bg-[#F59E0B] shrink-0" />
                )}
              </div>
              <div className="text-[10px] leading-snug text-[#CBD5E1]">{n.message}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );

  const renderProfilePopover = () => (
    <div
      role="dialog"
      aria-label="Operator Profile Menu"
      className="absolute right-0 top-full mt-2 w-72 bg-[#020408]/95 backdrop-blur-xl border border-[#1E2D42] rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.98)] p-3.5 z-50 text-xs font-sans text-[#E8EDF2]"
    >
      <div className="text-[10px] font-mono tracking-wider text-[#94A3B8] uppercase mb-2 border-b border-[#141E2E] pb-1.5 flex items-center justify-between">
        <span>Active Operator</span>
        <span className="text-[#38BDF8]">{operatorRoleLabel}</span>
      </div>

      {currentUser ? (
        <div className="space-y-2 mb-3">
          <div>
            <div className="font-bold text-sm text-[#F8FAFC]">{currentUser.fullName}</div>
            <div className="text-[11px] font-mono text-[#94A3B8]">
              {currentUser.motorcycleModel} · {currentUser.role.toUpperCase()}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setShowPersonaMenu(false);
                triggerCockpitNavigation('profile_garage', 'garage');
              }}
              className="py-1.5 px-2.5 rounded bg-[#070B13] hover:bg-[#0D1524] text-[#F8FAFC] border border-[#1E2D42] font-mono text-[10px] uppercase transition-colors cursor-pointer text-left"
            >
              My Garage
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPersonaMenu(false);
                setShowSystemControls(true);
              }}
              className="py-1.5 px-2.5 rounded bg-[#070B13] hover:bg-[#0D1524] text-[#38BDF8] border border-[#1E2D42] font-mono text-[10px] uppercase transition-colors cursor-pointer text-left"
            >
              All Controls
            </button>
          </div>

          {canAccessAdmin && (
            <button
              type="button"
              onClick={() => {
                setShowPersonaMenu(false);
                triggerCockpitNavigation('profile_admin', 'admin');
              }}
              className="w-full py-1.5 px-2.5 rounded bg-[#F59E0B]/15 hover:bg-[#F59E0B]/25 text-[#F59E0B] border border-[#F59E0B]/40 font-mono font-bold text-[10px] uppercase transition-colors cursor-pointer text-left flex items-center justify-between"
            >
              <span>Admin Centre</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setShowPersonaMenu(false);
              void logout();
            }}
            className="w-full py-1.5 px-2.5 rounded bg-[#E04F5F]/15 hover:bg-[#E04F5F]/25 text-[#E04F5F] border border-[#E04F5F]/40 font-mono font-bold text-[10px] uppercase transition-colors cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      ) : (
        <div className="space-y-2 mb-3">
          <div className="text-[11px] text-[#94A3B8]">
            Public Visitor Mode (Read-Only Telemetry)
          </div>
          <button
            type="button"
            onClick={() => {
              setShowPersonaMenu(false);
              openAuthModal();
            }}
            className="w-full py-2 px-3 rounded bg-[#38BDF8] hover:bg-[#0EA5E9] text-[#020408] font-mono font-bold text-[11px] uppercase transition-colors cursor-pointer"
          >
            Sign In / Register Motorcycle
          </button>
        </div>
      )}

      {/* Cockpit Audio & Welcome Utilities */}
      <div className="border-t border-[#141E2E] pt-2.5 mb-2.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            toggleSound();
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded border font-mono text-[10px] uppercase transition-colors cursor-pointer ${
            soundEnabled
              ? 'bg-[#08111E] border-[#38BDF8]/50 text-[#38BDF8]'
              : 'bg-[#05080F] border-[#1E2D42] text-[#94A3B8] hover:text-[#F8FAFC]'
          }`}
        >
          {soundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
          <span>Audio: {soundEnabled ? 'Online' : 'Muted'}</span>
        </button>

        {onOpenWelcome && (
          <button
            type="button"
            onClick={() => {
              setShowPersonaMenu(false);
              playTacticalClick();
              onOpenWelcome();
            }}
            className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded bg-[#05080F] border border-[#1E2D42] text-[#F59E0B] hover:border-[#F59E0B]/60 font-mono text-[10px] uppercase transition-colors cursor-pointer"
          >
            <Compass className="w-3 h-3" />
            <span>Briefing</span>
          </button>
        )}
      </div>
    </div>
  );

  // CSS transition for the rotating ring: immediate during pointer drag, smooth magnetic snap on release
  const wheelTransitionStyle: React.CSSProperties = {
    transform: `rotate(${wheelRotationDeg.toFixed(2)}deg)`,
    transition:
      isDraggingDial || reducedMotion
        ? 'none'
        : 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1)'
  };

  return (
    <div className="relative w-full min-h-[calc(100vh-3.5rem)] bg-[#010204] text-[#F8FAFC] overflow-x-hidden select-none font-sans flex flex-col items-center justify-start">
      {/* Desktop Wide Cool-Black Obsidian Cockpit Framing Backdrop (md+) */}
      <div
        aria-hidden="true"
        className="hidden md:block fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#010204]"
      >
        <div
          className="absolute inset-0 opacity-20 bg-cover bg-top blur-3xl scale-110 brightness-75 contrast-125 saturate-75"
          style={{
            backgroundImage: `url('${COCKPIT_ROTARY_STAGE_ASSET_PATH}')`
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 50% 42%, rgba(56, 189, 248, 0.06) 0%, rgba(2, 4, 8, 0.88) 48%, rgba(1, 2, 4, 0.99) 100%)'
          }}
        />
        <div className="absolute inset-0 stealth-grid opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#010204] via-transparent to-[#010204]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#010204]/80 via-transparent to-[#010204]/95" />
      </div>

      {/* =====================================================================
          AUTHORITATIVE COCKPIT STAGE (848 × 1855 Reference Proportions)
          Combines the exact supplied GHOST PROTOCOL cockpit artwork with
          the live interactive Rotary Navigation Instrument, live Selected-Page
          panel, live Header controls, and All System Controls.
          ===================================================================== */}
      <div className="relative z-10 w-full flex justify-center">
        <div
          data-testid="cockpit-rotary-stage"
          className={`relative w-full max-w-[440px] md:max-w-[420px] lg:max-w-[436px] aspect-[848/1855] mx-auto bg-[#010204] border-x border-[#121D2D]/70 shadow-[0_0_120px_rgba(0,0,0,1),0_0_40px_rgba(14,165,233,0.08)] transition-opacity duration-500 ${
            entranceActive && !reducedMotion ? 'opacity-95' : 'opacity-100'
          }`}
        >
          {/* Layer 1: Exact Cleaned Reference Artwork (848x1855) with Cool-Black Obsidian Toning */}
          {!imageLoadFailed ? (
            <>
              <img
                src={COCKPIT_ROTARY_STAGE_ASSET_PATH}
                alt="GHOST PROTOCOL — Tactical Cockpit Flight Deck"
                referrerPolicy="no-referrer"
                draggable={false}
                onError={() => setImageLoadFailed(true)}
                className="w-full h-full object-contain block pointer-events-none select-none brightness-[0.88] contrast-[1.16] saturate-[0.92]"
              />
              {/* Subtle Cool-Black Obsidian Vignette Scrim over non-interactive edges */}
              <div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'radial-gradient(ellipse 82% 76% at 50% 48%, rgba(2, 4, 8, 0.08) 0%, rgba(2, 4, 8, 0.36) 72%, rgba(1, 2, 4, 0.72) 100%)'
                }}
              />
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-b from-[#03060C] via-[#050912] to-[#010204] border border-[#141E2E]" />
          )}

          {/* =================================================================
              Layer 2: TOP HEADER INTERACTION CONTROLS
              Search, Notifications, and Dynamic Authenticated Operator Profile
              ================================================================= */}
          {/* Search Trigger (x=476..532, y=126..184) */}
          <button
            type="button"
            onClick={() => {
              playTacticalClick();
              openSearch?.();
            }}
            aria-label="Search System"
            title="Search System (Ctrl+K)"
            style={{
              left: '56.13%',
              top: '6.79%',
              width: '6.60%',
              height: '3.13%'
            }}
            className="absolute z-30 rounded-full flex items-center justify-center transition-all duration-150 hover:bg-[#38BDF8]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] cursor-pointer"
          >
            <span className="sr-only">Search System</span>
          </button>

          {/* Notifications Trigger (x=548..608, y=126..184) */}
          <div
            ref={notificationsRef}
            style={{
              left: '64.62%',
              top: '6.79%',
              width: '7.08%',
              height: '3.13%'
            }}
            className="absolute z-30"
          >
            <button
              type="button"
              onClick={() => {
                playTacticalClick();
                setShowNotifications(prev => !prev);
                setShowPersonaMenu(false);
              }}
              aria-label={
                unreadNotificationsCount > 0
                  ? `Notifications (${unreadNotificationsCount} unread)`
                  : 'Notifications'
              }
              aria-expanded={showNotifications}
              className="w-full h-full rounded-full flex items-center justify-center relative transition-all duration-150 hover:bg-[#38BDF8]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] cursor-pointer"
            >
              {unreadNotificationsCount > 0 && (
                <span
                  data-testid="unread-notifications-dot"
                  className="absolute top-[10%] right-[14%] w-2.5 h-2.5 rounded-full bg-[#F59E0B] shadow-[0_0_8px_#F59E0B]"
                />
              )}
            </button>
            {showNotifications && renderNotificationsPopover()}
          </div>

          {/* Operator Profile Pill Trigger (x=618..844, y=120..190) */}
          <div
            ref={personaRef}
            style={{
              left: '72.0%',
              top: '6.47%',
              width: '27.4%',
              height: '3.77%'
            }}
            className="absolute z-30"
          >
            <button
              type="button"
              onClick={() => {
                playTacticalClick();
                setShowPersonaMenu(prev => !prev);
                setShowNotifications(false);
              }}
              aria-label={`Operator Profile: ${operatorDisplayName}, ${operatorRoleLabel}`}
              aria-expanded={showPersonaMenu}
              className="w-full h-full rounded-full flex items-center justify-end pr-[2%] pl-[29%] text-left transition-all duration-150 hover:bg-[#38BDF8]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] cursor-pointer"
            >
              <div className="flex items-center justify-between w-full min-w-0 gap-0.5">
                <div className="min-w-0 flex-1 leading-tight">
                  <div
                    data-testid="cockpit-operator-name"
                    className="font-sans font-bold text-[9.5px] sm:text-[10.5px] tracking-wide text-[#F8FAFC] truncate"
                  >
                    {operatorDisplayName}
                  </div>
                  <div
                    data-testid="cockpit-operator-role"
                    className="font-mono font-medium text-[8px] sm:text-[9px] tracking-wider text-[#38BDF8] whitespace-nowrap"
                  >
                    {operatorRoleLabel}
                  </div>
                </div>
                <ChevronDown className="w-3 h-3 text-[#CBD5E1] shrink-0" />
              </div>
            </button>
            {showPersonaMenu && renderProfilePopover()}
          </div>

          {/* =================================================================
              Layer 2B: TOP-RIGHT CONTRIBUTION EMBLEM & INTERFACE (BELOW LOGIN)
              Separate from the circular rotary dashboard.
              ================================================================= */}
          <button
            type="button"
            data-testid="cockpit-contribute-button"
            onClick={() => triggerCockpitNavigation('top_right_contribute', 'contribute')}
            aria-label="Contribute to GHOST PROTOCOL"
            title="Contribute to GHOST PROTOCOL"
            style={{
              right: '2.2%',
              top: '11.0%'
            }}
            className="absolute z-30 flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-xl bg-gradient-to-r from-[#171105]/95 via-[#0B0F19]/95 to-[#1B1205]/95 border border-[#F59E0B]/80 hover:border-[#FDE68A] shadow-[0_6px_22px_rgba(0,0,0,0.88),0_0_18px_rgba(245,158,11,0.32)] hover:shadow-[0_6px_28px_rgba(245,158,11,0.55)] transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B] cursor-pointer group"
          >
            {/* Attractive Custom Gold Reactor-Heart Patron Crest SVG */}
            <div className="relative w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gradient-to-br from-[#FDE68A] via-[#F59E0B] to-[#B45309] p-[1px] shadow-[0_0_12px_rgba(245,158,11,0.65)] shrink-0">
              <div className="w-full h-full rounded-[7px] bg-[#090603] flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 sm:w-[17px] sm:h-[17px] transition-transform duration-200 group-hover:scale-110"
                  fill="none"
                >
                  <path
                    d="M12 2L14.8 4.5L18.5 4.2L19.5 7.8L22 10.5L20.2 13.8L21 17.5L17.5 19L15.2 22L12 20.4L8.8 22L6.5 19L3 17.5L3.8 13.8L2 10.5L4.5 7.8L5.5 4.2L9.2 4.5L12 2Z"
                    stroke="#38BDF8"
                    strokeWidth="1.2"
                    strokeOpacity="0.7"
                  />
                  <path
                    d="M12 17.6C12 17.6 6.8 14.1 6.8 10.1C6.8 8.3 8.2 7 9.8 7C10.8 7 11.6 7.5 12 8.3C12.4 7.5 13.2 7 14.2 7C15.8 7 17.2 8.3 17.2 10.1C17.2 14.1 12 17.6 12 17.6Z"
                    fill="#F59E0B"
                    stroke="#FDE68A"
                    strokeWidth="1.3"
                  />
                </svg>
              </div>
            </div>

            <div className="text-left leading-none">
              <div className="font-mono font-bold text-[7px] sm:text-[7.5px] tracking-[0.14em] text-[#FDE68A] uppercase">
                SUPPORT APP
              </div>
              <div className="font-sans font-bold text-[9.5px] sm:text-[10.5px] tracking-[0.05em] text-[#FFFFFF] group-hover:text-[#FDE68A] uppercase mt-0.5 flex items-center gap-1">
                <span>CONTRIBUTE</span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#F59E0B] shadow-[0_0_6px_#F59E0B]" />
              </div>
            </div>
          </button>

          {/* =================================================================
              Layer 3: INTERACTIVE ROTARY NAVIGATION INSTRUMENT
              Strictly circular (aspect-square) centered at (cx=424, cy=860),
              width=90.57% of stage width.
              Supports Mouse Drag, Touch Drag/Swipe, Click-to-Select, Keyboard
              Arrow navigation, and Mouse Wheel.
              ================================================================= */}
          <div
            ref={dialContainerRef}
            data-testid="cockpit-rotary-dial"
            role="region"
            aria-label={`Cockpit Rotary Navigation Selector — Selected: ${selectedDestination?.label} (${formatRotarySelectionCounter(selectedIndex, totalDestinations)})`}
            tabIndex={0}
            onPointerDown={e => handleDialPointerDown(e, null)}
            onPointerMove={handleDialPointerMove}
            onPointerUp={finishDialPointerGesture}
            onPointerCancel={finishDialPointerGesture}
            onKeyDown={handleDialKeyDown}
            onWheel={handleDialWheel}
            style={{
              left: '50%',
              top: '46.36%',
              width: '90.57%',
              transform: 'translate(-50%, -50%)',
              touchAction: 'none'
            }}
            className={`absolute z-20 aspect-square rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
              isDraggingDial ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            {/* SVG Rotary Instrument Layer (Concentric Rings + Uniform Segmented Wheel) */}
            <svg
              viewBox="-384 -384 768 768"
              className="w-full h-full overflow-visible pointer-events-none select-none"
            >
              <defs>
                <radialGradient id="idleSegmentFill" cx="50%" cy="50%" r="55%">
                  <stop offset="0%" stopColor="#060B15" stopOpacity="0.96" />
                  <stop offset="70%" stopColor="#02050B" stopOpacity="0.98" />
                  <stop offset="100%" stopColor="#071222" stopOpacity="0.99" />
                </radialGradient>
                <radialGradient id="redIdleSegmentFill" cx="50%" cy="50%" r="55%">
                  <stop offset="0%" stopColor="#22070A" stopOpacity="0.96" />
                  <stop offset="70%" stopColor="#140204" stopOpacity="0.98" />
                  <stop offset="100%" stopColor="#2C080D" stopOpacity="0.99" />
                </radialGradient>
                <radialGradient id="greenIdleSegmentFill" cx="50%" cy="50%" r="55%">
                  <stop offset="0%" stopColor="#061D13" stopOpacity="0.96" />
                  <stop offset="70%" stopColor="#02100A" stopOpacity="0.98" />
                  <stop offset="100%" stopColor="#082519" stopOpacity="0.99" />
                </radialGradient>
                <linearGradient id="activeSegmentFill" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#082442" stopOpacity="0.97" />
                  <stop offset="52%" stopColor="#051326" stopOpacity="0.98" />
                  <stop offset="100%" stopColor="#0A2E52" stopOpacity="0.98" />
                </linearGradient>
                <linearGradient id="redActiveSegmentFill" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#450A0A" stopOpacity="0.98" />
                  <stop offset="52%" stopColor="#180202" stopOpacity="0.98" />
                  <stop offset="100%" stopColor="#550D0D" stopOpacity="0.98" />
                </linearGradient>
                <linearGradient id="greenActiveSegmentFill" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#064E3B" stopOpacity="0.98" />
                  <stop offset="52%" stopColor="#022118" stopOpacity="0.98" />
                  <stop offset="100%" stopColor="#065F46" stopOpacity="0.98" />
                </linearGradient>
                <radialGradient id="centerHubFill" cx="50%" cy="42%" r="58%">
                  <stop offset="0%" stopColor="#070E1B" stopOpacity="0.98" />
                  <stop offset="65%" stopColor="#020409" stopOpacity="0.99" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="1" />
                </radialGradient>
                <filter id="amberGlow" x="-15%" y="-15%" width="130%" height="130%">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <filter id="cyanGlow" x="-15%" y="-15%" width="130%" height="130%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <filter id="redGlow" x="-15%" y="-15%" width="130%" height="130%">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <filter id="greenGlow" x="-15%" y="-15%" width="130%" height="130%">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Outer Cool-Black Stealth Bezel Ring */}
              <circle
                cx="0"
                cy="0"
                r="380"
                fill="rgba(1, 2, 4, 0.78)"
                stroke="#1E2D42"
                strokeWidth="1.5"
              />

              {/* Rotating Segmented Wheel Assembly */}
              <g style={wheelTransitionStyle}>
                {/* Pass 1: Render all idle segments (only Squadron Assist in red, all others including Jet Engineer in blue) */}
                {authorizedDestinations.map((dest, idx) => {
                  if (idx === selectedIndex) return null;
                  const segAngleDeg = idx * stepDeg;
                  const isEmergency = dest.routeId === 'emergency';
                  const fillUrl = isEmergency
                    ? 'url(#redIdleSegmentFill)'
                    : 'url(#idleSegmentFill)';
                  const strokeColor = isEmergency
                    ? '#EF4444'
                    : '#0EA5E9';
                  const strokeWidth = isEmergency ? '1.8' : '1.4';
                  const strokeOpacity = isEmergency ? '0.92' : '0.62';
                  const filterAttr = isEmergency
                    ? 'url(#redGlow)'
                    : undefined;

                  return (
                    <g key={dest.id} transform={`rotate(${segAngleDeg.toFixed(2)})`}>
                      <path
                        d={segmentWedgePath}
                        fill={fillUrl}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeOpacity={strokeOpacity}
                        strokeLinejoin="round"
                        filter={filterAttr}
                      />
                    </g>
                  );
                })}

                {/* Outer & Inner Concentric Segment Boundary Rings so radial dividers meet cleanly */}
                <circle
                  cx="0"
                  cy="0"
                  r="374"
                  fill="none"
                  stroke="#0EA5E9"
                  strokeWidth="1.5"
                  strokeOpacity="0.7"
                />
                <circle
                  cx="0"
                  cy="0"
                  r="198"
                  fill="none"
                  stroke="#0EA5E9"
                  strokeWidth="1.5"
                  strokeOpacity="0.7"
                />

                {/* Pass 2: Render the active segment on top with identical wedge geometry, dedicated accent outline, and restrained glow */}
                {authorizedDestinations[selectedIndex] && (() => {
                  const activeDest = authorizedDestinations[selectedIndex];
                  const isEmergency = activeDest.routeId === 'emergency';

                  const fillUrl = isEmergency
                    ? 'url(#redActiveSegmentFill)'
                    : 'url(#activeSegmentFill)';
                  const strokeColor = isEmergency
                    ? '#EF4444'
                    : '#38BDF8';
                  const innerStroke = isEmergency
                    ? '#FCA5A5'
                    : '#7DD3FC';
                  const glowFilter = isEmergency
                    ? 'url(#redGlow)'
                    : 'url(#cyanGlow)';
                  const pointerFill = isEmergency
                    ? '#FCA5A5'
                    : '#7DD3FC';
                  const pointerStroke = isEmergency
                    ? '#EF4444'
                    : '#38BDF8';

                  return (
                    <g
                      key={activeDest.id}
                      transform={`rotate(${(selectedIndex * stepDeg).toFixed(2)})`}
                    >
                      <path
                        d={segmentWedgePath}
                        fill={fillUrl}
                        stroke={strokeColor}
                        strokeWidth="2.4"
                        strokeOpacity="0.98"
                        strokeLinejoin="round"
                        filter={glowFilter}
                      />
                      <path
                        d={segmentWedgePath}
                        fill="none"
                        stroke={innerStroke}
                        strokeWidth="0.9"
                        strokeOpacity="0.8"
                        strokeLinejoin="round"
                      />
                      {/* Compact inward selection pointer at the inner rim of the active segment */}
                      <polygon
                        points="0,-188 -7,-198 7,-198"
                        fill={pointerFill}
                        stroke={pointerStroke}
                        strokeWidth="1.2"
                      />
                    </g>
                  );
                })()}
              </g>

              {/* Stationary Concentric Inner Instrument Rings & Restrained Technical Ticks */}
              <circle
                cx="0"
                cy="0"
                r="188"
                fill="none"
                stroke={
                  authorizedDestinations[selectedIndex]?.routeId === 'emergency'
                    ? '#EF4444'
                    : '#0EA5E9'
                }
                strokeWidth="1.2"
                strokeOpacity="0.6"
              />
              <circle
                cx="0"
                cy="0"
                r="174"
                fill="none"
                stroke={
                  authorizedDestinations[selectedIndex]?.routeId === 'emergency'
                    ? '#EF4444'
                    : selectionPulse
                    ? '#F59E0B'
                    : '#38BDF8'
                }
                strokeWidth={selectionPulse ? '2.6' : '2'}
                strokeOpacity="0.88"
                filter={
                  authorizedDestinations[selectedIndex]?.routeId === 'emergency'
                    ? 'url(#redGlow)'
                    : 'url(#cyanGlow)'
                }
              />
              {/* 72 Restrained Degree Tick Marks around r=179..186 */}
              {Array.from({ length: 72 }).map((_, i) => {
                const deg = i * 5;
                const isMajor = i % 6 === 0;
                const isTopIndex = i === 0 || i === 36;
                return (
                  <line
                    key={i}
                    x1="0"
                    y1={isMajor ? -179 : -182}
                    x2="0"
                    y2={-186}
                    stroke={
                      isTopIndex
                        ? authorizedDestinations[selectedIndex]?.routeId === 'emergency'
                          ? '#EF4444'
                          : '#F59E0B'
                        : '#38BDF8'
                    }
                    strokeWidth={isMajor ? 1.6 : 0.9}
                    strokeOpacity={isMajor ? 0.75 : 0.32}
                    transform={`rotate(${deg})`}
                  />
                );
              })}

              {/* Top & Cardinal Fixed Alignment Pointers */}
              <polygon
                points="0,-166 -7,-179 7,-179"
                fill={
                  authorizedDestinations[selectedIndex]?.routeId === 'emergency'
                    ? '#EF4444'
                    : '#F59E0B'
                }
              />
              <polygon points="0,166 -6,179 6,179" fill="#F59E0B" opacity="0.8" />
              <polygon points="-166,0 -179,-5 -179,5" fill="#F59E0B" opacity="0.7" />
              <polygon points="166,0 179,-5 179,5" fill="#F59E0B" opacity="0.7" />

              {/* Central Hub Outer Bezel */}
              <circle
                cx="0"
                cy="0"
                r="152"
                fill="url(#centerHubFill)"
                stroke="#38BDF8"
                strokeWidth="1.8"
                strokeOpacity="0.82"
              />
              <circle
                cx="0"
                cy="0"
                r="138"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="1"
                strokeOpacity="0.28"
                strokeDasharray="6 4"
              />
            </svg>

            {/* Upright HTML Segment Buttons (Calculated from angular position; counter-rotated so labels remain strictly horizontal) */}
            <div
              style={wheelTransitionStyle}
              className="absolute inset-0 pointer-events-none"
            >
              {authorizedDestinations.map((dest, idx) => {
                const isSelected = idx === selectedIndex;
                const segAngleDeg = idx * stepDeg;
                const rad = (segAngleDeg * Math.PI) / 180;
                // Position segment content at exact radial midpoint r = (198 + 374) / 2 = 286 out of 768 (37.24%)
                const radiusPct = (286 / 768) * 100;
                const leftPct = 50 + Math.sin(rad) * radiusPct;
                const topPct = 50 - Math.cos(rad) * radiusPct;
                // Counter-rotate by -wheelRotationDeg so icons & labels remain 100% horizontal/upright at every wheel angle
                const uprightCounterDeg = -wheelRotationDeg;

                return (
                  <button
                    key={dest.id}
                    type="button"
                    data-testid={`rotary-segment-${dest.id}`}
                    aria-label={`${dest.label}${isSelected ? ' (Selected)' : ''}`}
                    aria-pressed={isSelected}
                    onPointerDown={e => {
                      e.stopPropagation();
                      handleDialPointerDown(e, idx);
                    }}
                    onClick={e => {
                      // Keyboard click or assistive technology activation (where pointer events did not fire)
                      if (e.detail === 0) {
                        selectDestinationByIndex(idx, true);
                      }
                    }}
                    style={{
                      left: `${leftPct.toFixed(2)}%`,
                      top: `${topPct.toFixed(2)}%`,
                      width: '21%',
                      height: '17%',
                      transform: `translate(-50%, -50%) rotate(${uprightCounterDeg.toFixed(2)}deg)`,
                      transition:
                        isDraggingDial || reducedMotion
                          ? 'none'
                          : 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1)'
                    }}
                    className={`absolute pointer-events-auto flex flex-col items-center justify-center gap-1 text-center rounded-xl p-1 focus-visible:outline-none focus-visible:ring-2 ${
                      dest.routeId === 'emergency'
                        ? 'focus-visible:ring-[#EF4444]'
                        : 'focus-visible:ring-[#F59E0B]'
                    } group ${
                      isDraggingDial ? 'cursor-grabbing' : 'cursor-pointer'
                    }`}
                  >
                    {/* Segment Icon */}
                    <div
                      className={`transition-transform duration-150 group-hover:scale-105 flex items-center justify-center relative ${
                        dest.routeId === 'emergency'
                          ? isSelected
                            ? 'text-[#FCA5A5] drop-shadow-[0_0_10px_rgba(239,68,68,0.95)]'
                            : 'text-[#EF4444] group-hover:text-[#F87171] drop-shadow-[0_0_8px_rgba(239,68,68,0.7)]'
                          : isSelected
                          ? 'text-[#7DD3FC] drop-shadow-[0_0_8px_rgba(56,189,248,0.85)]'
                          : 'text-[#38BDF8] group-hover:text-[#7DD3FC] drop-shadow-[0_0_5px_rgba(56,189,248,0.4)]'
                      }`}
                    >
                      {renderRotaryIcon(
                        dest.iconKey,
                        isSelected
                          ? 'w-4 h-4 sm:w-5 sm:h-5 stroke-[2]'
                          : 'w-4 h-4 sm:w-[18px] sm:h-[18px] stroke-[1.85]'
                      )}
                    </div>

                    {/* Segment Actual Page Name (Strictly Horizontal & Upright, Zero Subtitles) */}
                    <div
                      className={`font-sans font-semibold uppercase tracking-[0.04em] leading-[1.15] ${
                        dest.routeId === 'emergency'
                          ? isSelected
                            ? 'text-[9px] sm:text-[10.5px] text-[#FFFFFF] font-bold drop-shadow-[0_1px_4px_rgba(239,68,68,0.95)]'
                            : 'text-[8.5px] sm:text-[9.5px] text-[#FCA5A5] font-bold group-hover:text-white drop-shadow-[0_1px_3px_rgba(185,28,28,0.8)]'
                          : isSelected
                          ? 'text-[9px] sm:text-[10.5px] text-[#FFFFFF] drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]'
                          : 'text-[8.5px] sm:text-[9.5px] text-[#E2E8F0] group-hover:text-white'
                      }`}
                    >
                      {dest.segmentLines.map((line, lIdx) => (
                        <div key={lIdx} className="whitespace-nowrap flex items-center justify-center gap-1">
                          <span>{line}</span>
                          {dest.routeId === 'emergency' && lIdx === 0 && (
                            <span
                              data-testid="squadron-assist-indicator-dot"
                              className="inline-block w-1.5 h-1.5 rounded-full bg-[#EF4444] shadow-[0_0_6px_#EF4444] animate-pulse shrink-0"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Central Activation Hub Button (Radius = 136px / 384px = 35.4% of dial, well inside r=138 border) */}
            <button
              type="button"
              data-testid="cockpit-central-hub"
              onClick={e => {
                e.stopPropagation();
                if (selectedDestination) {
                  activateDestination(selectedDestination);
                }
              }}
              aria-label={`Open Module: ${selectedDestination?.label}`}
              style={{
                left: '50%',
                top: '50%',
                width: '35.4%',
                height: '35.4%',
                transform: `translate(-50%, -50%) scale(${hubPressed ? 0.97 : 1})`
              }}
              className={`absolute z-30 rounded-full flex flex-col items-center justify-center gap-1.5 text-center px-2.5 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${
                selectedDestination?.routeId === 'emergency'
                  ? 'focus-visible:ring-[#EF4444]'
                  : 'focus-visible:ring-[#38BDF8]'
              } group ${
                selectedDestination?.routeId === 'emergency'
                  ? 'hover:shadow-[0_0_32px_rgba(239,68,68,0.6)] shadow-[0_0_20px_rgba(239,68,68,0.35)]'
                  : hubPressed
                  ? 'shadow-[0_0_32px_rgba(56,189,248,0.65)]'
                  : 'hover:shadow-[0_0_24px_rgba(56,189,248,0.35)]'
              }`}
            >
              {/* GHOST PROTOCOL Central Hub Emblem */}
              <div className="flex flex-col items-center leading-none">
                <div className="flex items-center justify-center gap-1">
                  <span className="font-sans font-black italic text-sm sm:text-lg tracking-wider text-white">
                    GHOST
                  </span>
                  <span className="flex flex-col gap-[2px]">
                    <span className="w-3 h-[2px] bg-[#00D8FF] -skew-x-12 block" />
                    <span className="w-2 h-[2px] bg-[#00D8FF] -skew-x-12 block" />
                    <span className="w-1 h-[2px] bg-[#00D8FF] -skew-x-12 block" />
                  </span>
                </div>
                <div className="font-mono text-[6.5px] sm:text-[7.5px] tracking-[0.34em] text-[#CBD5E1] mt-0.5">
                  PROTOCOL
                </div>
              </div>

              {/* Essential Navigation Instruction */}
              <div className="font-mono text-[7px] sm:text-[8px] tracking-[0.12em] text-[#38BDF8] uppercase">
                ROTATE TO NAVIGATE
              </div>

              {/* Compact Interactive Activation Button */}
              <div
                data-testid="central-hub-action-label"
                className={`px-2.5 py-1 rounded font-mono font-semibold text-[7.5px] sm:text-[8.5px] tracking-[0.1em] uppercase transition-colors whitespace-nowrap ${
                  selectedDestination?.routeId === 'emergency'
                    ? 'bg-[#1F0707] border border-[#EF4444]/70 group-hover:border-[#EF4444] text-[#FCA5A5] group-hover:text-white shadow-[0_0_12px_rgba(239,68,68,0.3)]'
                    : 'bg-[#071120] border border-[#38BDF8]/55 group-hover:border-[#38BDF8] group-hover:bg-[#38BDF8]/20 text-[#F8FAFC] group-hover:text-[#7DD3FC] shadow-[0_0_10px_rgba(56,189,248,0.18)]'
                }`}
              >
                OPEN MODULE
              </div>
            </button>
          </div>

          {/* =================================================================
              Layer 4: REDESIGNED SELECTED-PAGE PANEL
              Positioned inside the metallic chamfered bay below the rotary dial
              (left=10.85%, top=70.62%, width=78.30%, height=7.55%).
              Contains ONLY:
              - Left: Medium-sized icon for the selected page.
              - Centre: Selected page's full name displayed prominently (never truncated).
              - Right: Compact selection counter ("01 / 09") + OPEN MODULE button.
              ================================================================= */}
          {(() => {
            const isSelectedEmergency = selectedDestination?.routeId === 'emergency';

            const iconBoxBorder = isSelectedEmergency
              ? 'border-[#EF4444] bg-[#1A0707] shadow-[0_0_16px_rgba(239,68,68,0.5)]'
              : 'border-[#38BDF8]/85 bg-[#06101E] shadow-[0_0_12px_rgba(56,189,248,0.28)]';

            const iconClass = isSelectedEmergency
              ? 'w-4 h-4 sm:w-[18px] sm:h-[18px] text-[#EF4444]'
              : 'w-4 h-4 sm:w-[18px] sm:h-[18px] text-[#38BDF8]';

            const labelSubtext = isSelectedEmergency
              ? 'EMERGENCY RAPID RESPONSE'
              : 'SELECTED PAGE';

            const labelSubtextColor = isSelectedEmergency
              ? 'text-[#F87171]'
              : 'text-[#38BDF8]';

            const openBtnStyle = isSelectedEmergency
              ? 'bg-[#EF4444]/25 hover:bg-[#EF4444]/40 border-[#EF4444] text-[#FCA5A5] shadow-[0_0_14px_rgba(239,68,68,0.45)]'
              : 'bg-[#38BDF8]/15 hover:bg-[#38BDF8]/28 border-[#38BDF8]/85 text-[#7DD3FC] shadow-[0_0_10px_rgba(56,189,248,0.2)]';

            return (
              <div
                data-testid="cockpit-selected-page-panel"
                style={{
                  left: '10.85%',
                  top: '70.62%',
                  width: '78.30%',
                  height: '7.55%'
                }}
                className={`absolute z-20 flex items-center justify-between gap-2.5 sm:gap-3 px-[3.6%] py-[1.4%] rounded-xl bg-[#03060C]/95 backdrop-blur-md border ${
                  isSelectedEmergency
                    ? 'border-[#EF4444]/70 shadow-[0_0_20px_rgba(239,68,68,0.25)]'
                    : 'border-[#1E2D42]/60'
                }`}
              >
                {/* Left: Medium-Sized Selected Page Icon */}
                <div
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg border flex items-center justify-center shrink-0 transition-all ${iconBoxBorder}`}
                >
                  {selectedDestination &&
                    renderRotaryIcon(selectedDestination.iconKey, iconClass)}
                </div>

                {/* Centre: Selected Page Indicator + Full Name Displayed Prominently */}
                <div className="min-w-0 flex-1 flex flex-col justify-center">
                  <span
                    className={`font-mono text-[7px] sm:text-[8px] tracking-[0.14em] uppercase leading-none mb-0.5 whitespace-nowrap font-bold flex items-center gap-1.5 ${labelSubtextColor}`}
                  >
                    {isSelectedEmergency && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] shadow-[0_0_5px_#EF4444] animate-pulse" />
                    )}
                    {labelSubtext}
                  </span>
                  <div
                    data-testid="cockpit-selected-page-title"
                    className="font-sans font-semibold text-[11px] sm:text-[13px] tracking-[0.03em] text-[#F8FAFC] uppercase leading-[1.15]"
                  >
                    {selectedDestination?.label}
                  </div>
                </div>

                {/* Right: Compact Selection Counter + OPEN MODULE Button */}
                <div className="flex flex-col items-end justify-center gap-1 shrink-0">
                  <span
                    data-testid="cockpit-selected-page-counter"
                    className={`font-mono font-semibold text-[8.5px] sm:text-[9.5px] tracking-[0.1em] tabular-nums whitespace-nowrap leading-none ${
                      isSelectedEmergency
                        ? 'text-[#FCA5A5]'
                        : 'text-[#CBD5E1]'
                    }`}
                  >
                    {formatRotarySelectionCounter(selectedIndex, totalDestinations)}
                  </span>

                  <button
                    type="button"
                    data-testid="cockpit-selected-page-open-btn"
                    onClick={() => {
                      if (selectedDestination) {
                        activateDestination(selectedDestination);
                      }
                    }}
                    aria-label={`Open Module: ${selectedDestination?.label}`}
                    className={`px-2 sm:px-2.5 py-1 rounded border font-mono font-semibold text-[7.5px] sm:text-[8.5px] tracking-[0.08em] uppercase transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 whitespace-nowrap ${openBtnStyle}`}
                  >
                    OPEN MODULE
                  </button>
                </div>
              </div>
            );
          })()}

          {/* =================================================================
              Layer 5: BOTTOM-CENTER ALL SYSTEM CONTROLS PANEL
              Positioned over the exact reference panel (x=160..688, y=1502..1636)
              left=18.87%, top=80.97%, width=62.26%, height=7.22%
              ================================================================= */}
          <button
            type="button"
            data-testid="cockpit-hotspot-panel_all_system_controls"
            onClick={() =>
              triggerCockpitNavigation('panel_all_system_controls', 'system_controls')
            }
            aria-label="ALL SYSTEM CONTROLS"
            style={{
              left: '18.87%',
              top: '80.97%',
              width: '62.26%',
              height: '7.22%',
              transform:
                pressedControlId === 'panel_all_system_controls'
                  ? 'scale(0.985)'
                  : 'scale(1)'
            }}
            className="absolute z-20 rounded-xl transition-all duration-150 cursor-pointer bg-[#02050B]/92 hover:bg-[#060D1A]/95 border border-[#1E2D42]/80 hover:border-[#38BDF8]/60 hover:shadow-[0_0_28px_rgba(56,189,248,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] flex items-center justify-between px-[7%] group"
          >
            <div className="flex items-center gap-2.5 sm:gap-3">
              <LayoutGrid className="w-4 h-4 sm:w-5 sm:h-5 text-[#CBD5E1] group-hover:text-[#38BDF8] transition-colors shrink-0" />
              <span className="font-sans font-semibold text-[10.5px] sm:text-xs tracking-[0.1em] text-[#F8FAFC] uppercase whitespace-nowrap">
                ALL SYSTEM CONTROLS
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#38BDF8] transition-colors shrink-0" />
          </button>
        </div>
      </div>

      {/* =====================================================================
          ALL SYSTEM CONTROLS — TACTICAL FEATURE DIRECTORY MODAL (COOL BLACK)
          ===================================================================== */}
      {showSystemControls && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="All System Controls Directory"
          className="fixed inset-0 z-50 bg-[#010204]/90 backdrop-blur-xl flex items-center justify-center p-4"
          onClick={() => setShowSystemControls(false)}
        >
          <div
            className="w-full max-w-4xl bg-[#03050A] border border-[#1E2D42] rounded-xl shadow-[0_24px_90px_rgba(0,0,0,1)] overflow-hidden text-[#F8FAFC]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[#141E2E] flex flex-wrap items-center justify-between gap-3 bg-[#050811]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#080E1A] border border-[#38BDF8]/40 flex items-center justify-center text-[#38BDF8]">
                  <LayoutGrid className="w-5 h-5" />
                </div>
                <h2 className="font-sans font-bold text-base tracking-wider uppercase text-[#F8FAFC]">
                  ALL SYSTEM CONTROLS
                </h2>
              </div>

              {/* Jet Engineer Platform Selector inside System Controls */}
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#94A3B8]">
                  Platform:
                </span>
                <div className="inline-flex rounded-md bg-[#020408] border border-[#1E2D42] p-0.5">
                  {(['F77', 'X47', 'Both'] as const).map(model => (
                    <button
                      key={model}
                      type="button"
                      onClick={() => handleModelSelect(model)}
                      className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase transition-colors cursor-pointer ${
                        jetModel === model
                          ? 'bg-[#38BDF8] text-[#020408]'
                          : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                      }`}
                    >
                      {model}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    playTacticalClick();
                    setShowSystemControls(false);
                  }}
                  aria-label="Close All System Controls"
                  className="ml-2 p-1.5 rounded-lg bg-[#080E1A] hover:bg-[#101A2C] border border-[#1E2D42] text-[#CBD5E1] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Directory Grid (Minimal Icon + Page Name Only) */}
            <div className="p-5 max-h-[75vh] overflow-y-auto space-y-5">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#38BDF8] mb-2.5">
                  Primary Flight & Engineering Modules
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {visibleDirectoryItems
                    .filter(item => item.category === 'primary')
                    .map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setShowSystemControls(false);
                          triggerCockpitNavigation(item.id, item.routeId, {
                            jetMode: item.jetMode,
                            jetModel,
                            chargingMode: item.chargingMode
                          });
                        }}
                        className={`text-left p-3.5 rounded-lg bg-[#060A12] hover:bg-[#0B1220] border transition-all group cursor-pointer flex items-center justify-between gap-2 ${
                          item.routeId === 'emergency'
                            ? 'border-[#EF4444]/40 hover:border-[#EF4444] hover:shadow-[0_0_16px_rgba(239,68,68,0.25)]'
                            : 'border-[#162234] hover:border-[#38BDF8]/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {getDirectoryIcon(item.id)}
                          <span
                            className={`font-sans font-semibold text-xs tracking-wide uppercase transition-colors truncate ${
                              item.routeId === 'emergency'
                                ? 'text-[#FCA5A5] group-hover:text-[#EF4444]'
                                : 'text-[#F8FAFC] group-hover:text-[#38BDF8]'
                            }`}
                          >
                            {item.label}
                          </span>
                        </div>
                        <ChevronRight
                          className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                            item.routeId === 'emergency'
                              ? 'text-[#EF4444]/70 group-hover:text-[#EF4444]'
                              : 'text-[#64748B] group-hover:text-[#38BDF8]'
                          }`}
                        />
                      </button>
                    ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#F59E0B] mb-2.5">
                  Fleet Systems, Diagnostics & Community Modules
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {visibleDirectoryItems
                    .filter(item => item.category !== 'primary')
                    .map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setShowSystemControls(false);
                          triggerCockpitNavigation(item.id, item.routeId, {
                            jetMode: item.jetMode,
                            jetModel,
                            chargingMode: item.chargingMode
                          });
                        }}
                        className={`text-left p-3.5 rounded-lg bg-[#060A12] hover:bg-[#0B1220] border transition-all group cursor-pointer flex items-center justify-between gap-2 ${
                          item.routeId === 'emergency'
                            ? 'border-[#EF4444]/40 hover:border-[#EF4444] hover:shadow-[0_0_16px_rgba(239,68,68,0.25)]'
                            : 'border-[#162234] hover:border-[#F59E0B]/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {getDirectoryIcon(item.id)}
                          <span
                            className={`font-sans font-semibold text-xs tracking-wide uppercase transition-colors truncate ${
                              item.routeId === 'emergency'
                                ? 'text-[#FCA5A5] group-hover:text-[#EF4444]'
                                : 'text-[#F8FAFC] group-hover:text-[#F59E0B]'
                            }`}
                          >
                            {item.label}
                          </span>
                        </div>
                        <ChevronRight
                          className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                            item.routeId === 'emergency'
                              ? 'text-[#EF4444]/70 group-hover:text-[#EF4444]'
                              : 'text-[#64748B] group-hover:text-[#F59E0B]'
                          }`}
                        />
                      </button>
                    ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#38BDF8] mb-2.5">
                  Squadron Arcade Arena (Offline 2D Combat)
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowSystemControls(false);
                    onNavigate('squadron-showdown');
                  }}
                  className="w-full text-left p-3.5 rounded-lg bg-[#060A12] hover:bg-[#0B1220] border border-[#38BDF8]/50 hover:border-[#38BDF8] transition-all group cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-sans font-bold text-xs tracking-wide uppercase text-[#38BDF8]">
                      SQUADRON SHOWDOWN — FIGHT. RIDE. DOMINATE.
                    </span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[#38BDF8]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SQUADRON SHOWDOWN — DEDICATED ARCADE ARENA LAUNCHER CARD
          ===================================================================== */}
      <div className="w-full max-w-[920px] px-4 pb-8 pt-2">
        <div
          data-testid="squadron-showdown-launcher-card"
          className="relative overflow-hidden rounded-2xl border border-[#38BDF8]/40 bg-gradient-to-r from-[#050B16] via-[#0B1528] to-[#140C24] p-5 sm:p-6 shadow-[0_12px_40px_rgba(0,0,0,0.85)] flex flex-col sm:flex-row items-center justify-between gap-5"
        >
          <div className="flex items-center gap-4">
            <div className="w-16 h-20 rounded-xl bg-[#03060C] border border-[#38BDF8]/40 flex items-center justify-center p-1.5 shrink-0">
              <img
                src="/assets/squadron-showdown/characters/dq_sprite.png"
                alt="Squadron Showdown Fighter"
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#38BDF8]/15 border border-[#38BDF8]/40 text-[#38BDF8] font-mono text-[10px] font-bold tracking-widest uppercase mb-1">
                <span>FIGHT. RIDE. DOMINATE. • OFFLINE 2D ARENA</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-wider text-white uppercase">
                SQUADRON SHOWDOWN
              </h2>
              <p className="text-xs sm:text-sm text-[#CBD5E1] mt-0.5">
                Enter the arena. Challenge the squadron. Your squadron. Your fighter. Your battle.
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="enter-arena-btn"
            onClick={() => {
              playTacticalClick();
              onNavigate('squadron-showdown');
            }}
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#2563EB] hover:from-[#7DD3FC] hover:to-[#3B82F6] text-[#020408] font-black tracking-wider text-xs sm:text-sm uppercase shadow-[0_0_24px_rgba(56,189,248,0.35)] transition cursor-pointer shrink-0"
          >
            ENTER ARENA →
          </button>
        </div>
      </div>
    </div>
  );
};
