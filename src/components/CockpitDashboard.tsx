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

  // Session-persisted initial boot spatial cockpit formation transformation
  const [isBooting, setIsBooting] = useState<boolean>(() => !skipBootAnimation);
  const [bootPhase, setBootPhase] = useState<number>(skipBootAnimation ? 3 : 1);

  useEffect(() => {
    if (skipBootAnimation) {
      setIsBooting(false);
      setBootPhase(3);
      return;
    }

    setIsBooting(true);
    setBootPhase(1);

    const t1 = setTimeout(() => {
      setBootPhase(2);
    }, 450);

    const t2 = setTimeout(() => {
      setBootPhase(3);
      setIsBooting(false);
      onCompleteBoot?.();
    }, 1250);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
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
      setBootPhase(3);
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
        className="relative w-full h-full max-w-lg mx-auto select-none overflow-hidden"
      >
        {/* 1. Exact Attached Dashboard Image Rendered Pristine Filling Full Screen */}
        <img
          src={ORIGINAL_COCKPIT_DASHBOARD_IMAGE}
          alt="GHOST PROTOCOL Cockpit Dashboard"
          loading="eager"
          decoding="sync"
          fetchPriority="high"
          draggable={false}
          className={`absolute inset-0 w-full h-full object-fill pointer-events-none select-none ${
            isBooting
              ? `transition-all duration-700 ease-out ${
                  bootPhase === 1
                    ? 'scale-[1.12] opacity-40 blur-[3px] brightness-75'
                    : 'scale-[1.02] opacity-90 blur-[0.5px] brightness-110'
                }`
              : ''
          }`}
        />

        {/* 2. Precision SVG Overlay for Offline Status Indicator (if toggled offline) */}
        <svg
          viewBox="0 0 941 1672"
          data-testid="cockpit-interactive-hud-svg"
          className="absolute inset-0 w-full h-full pointer-events-none select-none z-10"
        >
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
          className={`absolute z-30 text-center pointer-events-auto select-none ${
            isBooting
              ? `transition-all duration-700 ease-out ${
                  bootPhase === 1
                    ? 'opacity-0 translate-y-[-28px] scale-90'
                    : 'opacity-85 translate-y-[-4px] scale-98'
                }`
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



        {/* Spatial Cockpit Formation Transformation Curtain (Only on first app launch) */}
        {isBooting && (
          <div
            data-testid="cockpit-initial-boot-animation-overlay"
            className="absolute inset-0 z-50 bg-[#01040A]/90 backdrop-blur-xl flex flex-col items-center justify-center p-6 transition-all duration-700 pointer-events-none select-none"
          >
            {/* Expanding Laser HUD Calibration Ring */}
            <div className="relative w-32 h-32 sm:w-40 sm:h-40 mb-6 flex items-center justify-center">
              <div
                className="absolute inset-0 rounded-full border-2 border-dashed border-[#38BDF8] animate-spin"
                style={{ animationDuration: '4s' }}
              />
              <div
                className="absolute inset-3 rounded-full border-2 border-[#EF4444] animate-ping"
                style={{ animationDuration: '1.2s' }}
              />
              <div className="w-16 h-16 rounded-full bg-[#030A1C] border-2 border-[#38BDF8] shadow-[0_0_30px_#38BDF8] flex items-center justify-center">
                <Cpu className="w-8 h-8 text-[#38BDF8] animate-pulse" />
              </div>
            </div>

            <div className="text-center font-mono space-y-2">
              <div className="text-xs sm:text-sm font-black text-[#38BDF8] tracking-[0.2em] uppercase font-['Orbitron',sans-serif] animate-pulse">
                {bootPhase === 1
                  ? 'FORMING COCKPIT AVIONICS INTERFACE...'
                  : bootPhase === 2
                  ? 'LOCKING INSTRUMENT PANELS & HUD...'
                  : 'COCKPIT ONLINE'}
              </div>
              <div className="text-[10px] text-[#E8AA45] tracking-widest uppercase">
                {bootPhase === 1
                  ? '▶ POWER CORE: 100%'
                  : '▶ HUD AVIONICS LINK: ACTIVE'}
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
