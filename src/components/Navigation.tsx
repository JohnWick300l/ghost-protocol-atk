import React, { useState } from 'react';
import {
  Shield,
  Radio,
  Compass,
  Cpu,
  AlertTriangle,
  Wrench,
  Zap,
  MessageSquare,
  ShoppingBag,
  Building2,
  Lock,
  Volume2,
  VolumeX,
  Search,
  Bell,
  CheckCircle2,
  UserCheck,
  ChevronDown,
  Activity,
  Layers,
  X,
  Home
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { NotificationItem } from '../types';
import { AnimatePresence, motion } from './AvionicsTransition';

interface NavigationProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  openSearch: () => void;
  notifications: NotificationItem[];
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
  isOffline?: boolean;
  cacheAge?: string;
  queuedActionCount?: number;
  onOpenWelcome?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  setCurrentTab,
  openSearch,
  notifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  isOffline = false,
  cacheAge = 'Live',
  queuedActionCount = 0,
  onOpenWelcome
}) => {
  const { currentUser, switchPersona, availableUsers, openAuthModal, logout } = useAuth();
  const { soundEnabled, toggleSound, reducedMotion, toggleReducedMotion, playTacticalClick } = useAudio();
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNavClick = (tabId: string) => {
    playTacticalClick();
    setCurrentTab(tabId);
    setMobileMenuOpen(false);
  };

  const isEmployee = currentUser?.role === 'uv_employee';

  const navItems = isEmployee
    ? [
        { id: 'problems', label: 'PRIORITY ISSUES', icon: Activity },
        { id: 'service', label: 'SERVICE INTEL', icon: Building2 }
      ]
    : [
        { id: 'dashboard', label: 'COCKPIT', icon: Home },
        { id: 'mission', label: 'MISSION MODE', icon: Radio },
        { id: 'jet_engineer', label: 'THE JET ENGINEER', icon: Cpu },
        { id: 'emergency', label: 'SQUADRON ASSIST', icon: AlertTriangle, alert: true },
        { id: 'problems', label: 'PRIORITY ISSUES', icon: Activity },
        { id: 'modifications', label: 'MODIFICATIONS', icon: Wrench },
        { id: 'charging', label: 'CHARGING', icon: Zap },
        { id: 'discussions', label: 'DISCUSSION', icon: MessageSquare },
        { id: 'marketplace', label: 'MARKETPLACE', icon: ShoppingBag },
        { id: 'service', label: 'SERVICE INTEL', icon: Building2 },
        { id: 'garage', label: 'MY GARAGE', icon: Layers },
        ...(currentUser?.role === 'admin' || currentUser?.role === 'superadmin' || currentUser?.isOwner
          ? [{ id: 'admin', label: 'ADMIN CENTRE', icon: Shield }]
          : [])
      ];

  return (
    <header className="sticky top-0 z-50 bg-[#020305]/95 backdrop-blur-xl border-b border-[#131C2B] select-none shadow-[0_8px_32px_rgba(0,0,0,0.85)]">
      {/* Top Technical Status Bar (Clean & Real) */}
      <div className="hidden lg:flex items-center justify-between px-6 py-1 bg-[#04070D] border-b border-[#131C2B]/80 text-[11px] font-mono text-[#64748B]">
        <div className="flex items-center space-x-6">
          <span className="flex items-center gap-1.5 text-[#E2E8F0]">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                isOffline ? 'bg-[#F59E0B] animate-pulse' : currentUser ? 'bg-[#10B981]' : 'bg-[#38BDF8]'
              }`}
            ></span>
            {isOffline ? (
              <span className="text-[#F59E0B] font-semibold">
                NETWORK: OFFLINE / CACHED TELEMETRY ({cacheAge})
              </span>
            ) : currentUser ? (
              <span>NETWORK: GHOST PROTOCOL (AUTHENTICATED)</span>
            ) : (
              <span>NETWORK: PUBLIC READ-ONLY TELEMETRY (VISITOR MODE)</span>
            )}
          </span>
          {queuedActionCount > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-[#F59E0B]/20 text-[#F59E0B] font-bold border border-[#F59E0B]/30">
              OFFLINE SYNC: {queuedActionCount} ACTION(S) QUEUED
            </span>
          )}
          <span className="text-[#38BDF8]">AVIONICS: ONLINE</span>
        </div>
        <div className="flex items-center space-x-3">
          {onOpenWelcome && (
            <button
              onClick={() => {
                playTacticalClick();
                onOpenWelcome();
              }}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono tracking-wider uppercase text-[#F59E0B] hover:bg-[#F59E0B]/15 transition-colors border border-[#F59E0B]/40"
              title="Return to Pilot Welcome & Take-Off Interface"
            >
              <Zap className="w-3 h-3 text-[#F59E0B]" />
              <span>COCKPIT BRIEFING</span>
            </button>
          )}
          <button
            onClick={() => {
              playTacticalClick();
              toggleReducedMotion();
            }}
            className={`px-2 py-0.5 rounded text-[10px] uppercase transition-colors ${
              reducedMotion ? 'bg-[#0E1624] text-[#E2E8F0]' : 'text-[#64748B] hover:text-[#94A3B8]'
            }`}
            title="Toggle reduced motion preference"
          >
            MOTION: {reducedMotion ? 'REDUCED' : 'ACTIVE'}
          </button>
          <button
            onClick={() => {
              playTacticalClick();
              toggleSound();
            }}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase transition-colors ${
              soundEnabled ? 'bg-[#0E1624] text-[#38BDF8]' : 'text-[#64748B] hover:text-[#94A3B8]'
            }`}
            title="Toggle tactical audio effects"
          >
            {soundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
            AUDIO: {soundEnabled ? 'ONLINE' : 'MUTED'}
          </button>
        </div>
      </div>

      {/* Primary Header Row */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-2 h-14">
        {/* Brand */}
        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={() => handleNavClick('dashboard')}
            className="flex items-center space-x-2 text-left group"
          >
            <div className="w-8 h-8 rounded bg-[#070B12] border border-[#1E2D42] flex items-center justify-center text-[#38BDF8] group-hover:border-[#38BDF8] transition-colors shrink-0">
              <Shield className="w-4 h-4 text-[#38BDF8]" />
            </div>
            <div>
              <div className="font-mono text-xs sm:text-sm font-bold tracking-wider text-[#F8FAFC] flex items-center gap-1.5 whitespace-nowrap">
                <span>GHOST PROTOCOL</span>
                <span className="hidden 2xl:inline-block text-[10px] font-mono px-1.5 py-0.2 bg-[#090F1A] border border-[#1E2D42] text-[#38BDF8] rounded">
                  PILOT NETWORK
                </span>
              </div>
            </div>
          </button>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden xl:flex items-center space-x-0.5 flex-1 min-w-0 overflow-x-auto py-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                data-testid={`nav-tab-${item.id}`}
                onClick={() => handleNavClick(item.id)}
                className={`relative flex items-center space-x-1 px-2 py-1.5 rounded text-[10.5px] font-mono tracking-wider transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? item.id === 'emergency'
                      ? 'text-[#EF4444]'
                      : 'text-[#38BDF8]'
                    : item.id === 'emergency'
                    ? 'text-[#EF4444] font-semibold hover:bg-[#1F0707]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#070B12]'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="avionics-nav-active-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="pointer-events-none absolute inset-0 rounded bg-[#0A1220] border border-[#38BDF8]/55 shadow-[0_0_14px_rgba(56,189,248,0.2)]"
                  />
                )}
                {isActive && (
                  <motion.span
                    layoutId="avionics-nav-laser-bar"
                    transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                    className="pointer-events-none absolute bottom-0 inset-x-1.5 h-[2px] rounded-full bg-gradient-to-r from-[#38BDF8] via-[#FF5500] to-[#38BDF8] shadow-[0_0_8px_rgba(56,189,248,0.85)]"
                  />
                )}
                <Icon
                  className={`relative z-10 w-3.5 h-3.5 ${
                    item.id === 'emergency'
                      ? 'text-[#EF4444]'
                      : isActive
                      ? 'text-[#38BDF8]'
                      : ''
                  }`}
                />
                <span className="relative z-10">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Action Controls & Persona Switcher */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Global Search Button */}
          <button
            onClick={() => {
              playTacticalClick();
              openSearch();
            }}
            className="p-2 rounded bg-[#13161A] border border-[#282D34] text-[#A0A7B0] hover:text-[#F1F3F5] hover:border-[#414851] transition-colors"
            title="Global Search (Ctrl+K)"
            aria-label="Global Search"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Notifications Bell */}
          <div className="relative">
            <button
              onClick={() => {
                playTacticalClick();
                setShowNotifications(!showNotifications);
              }}
              className="p-2 rounded bg-[#13161A] border border-[#282D34] text-[#A0A7B0] hover:text-[#F1F3F5] hover:border-[#414851] transition-colors relative"
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#E04F5F] text-white text-[9px] font-mono font-bold rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown with Enter/Exit Animation */}
            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  key="notifications-dropdown"
                  initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.96, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.96, filter: 'blur(4px)' }}
                  transition={{ duration: reducedMotion ? 0.1 : 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#13161A] border border-[#414851] rounded-lg shadow-2xl p-3 z-50"
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#282D34]">
                    <span className="text-xs font-mono font-semibold text-[#D4D8DE] tracking-wide">
                      SQUADRON NOTIFICATIONS
                    </span>
                    {unreadCount > 0 && (
                      <button
                        onClick={onMarkAllNotificationsRead}
                        className="text-[10px] font-mono text-[#729BCB] hover:underline"
                      >
                        MARK ALL READ
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto space-y-2">
                    {notifications.length === 0 ? (
                      <div className="text-center py-6 text-xs text-[#707883] font-mono">
                        NO ACTIVE TRANSMISSIONS
                      </div>
                    ) : (
                      notifications.map(n => {
                        const isEmergency = n.type === 'emergency';
                        return (
                          <div
                            key={n.id}
                            onClick={() => {
                              onMarkNotificationRead(n.id);
                              if (n.link) setCurrentTab(n.link);
                              setShowNotifications(false);
                            }}
                            className={`p-2.5 rounded border text-xs cursor-pointer transition-colors ${
                              n.read
                                ? 'bg-[#0D0F12] border-[#282D34] text-[#707883]'
                                : isEmergency
                                ? 'bg-[#210D12] border-[#E04F5F] text-[#F1F3F5]'
                                : 'bg-[#191D22] border-[#414851] text-[#F1F3F5]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-[#AEB5BE] mb-1">
                              <span
                                className={`uppercase font-semibold truncate ${
                                  isEmergency && !n.read ? 'text-[#FCA5A5]' : 'text-[#D4D8DE]'
                                }`}
                              >
                                {n.title}
                              </span>
                              <span className="shrink-0">
                                {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            {isEmergency && (
                              <div className="mb-1 flex items-center gap-1.5 text-[9px] font-mono">
                                <span className="px-1.5 py-0.2 rounded bg-[#E04F5F] text-white font-bold uppercase">
                                  {n.isAdminAlert ? 'PRIORITY ADMIN SOS' : `CITY SOS${n.city ? `: ${n.city}` : ''}`}
                                </span>
                              </div>
                            )}
                            <p className="text-xs text-[#A0A7B0] leading-snug">{n.message}</p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User Persona & Verification Status Badge */}
          <div className="relative">
            <button
              onClick={() => {
                playTacticalClick();
                setShowPersonaMenu(!showPersonaMenu);
              }}
              className="flex items-center space-x-2 px-2.5 py-1.5 rounded bg-[#13161A] border border-[#282D34] hover:border-[#414851] text-xs font-mono transition-colors"
            >
              <div className={`w-2 h-2 rounded-full ${currentUser ? 'bg-[#42B883]' : 'bg-[#729BCB]'}`}></div>
              <span className="max-w-[100px] sm:max-w-[120px] truncate font-medium text-[#F1F3F5]">
                {currentUser ? currentUser.fullName.split(' ')[0] : 'VISITOR'}
              </span>
              <span
                className={`text-[9px] px-1 py-0.2 rounded uppercase ${
                  !currentUser
                    ? 'bg-[#729BCB]/15 text-[#729BCB] border border-[#729BCB]/30'
                    : currentUser.verificationStatus === 'verified'
                    ? 'bg-[#42B883]/15 text-[#42B883] border border-[#42B883]/30'
                    : 'bg-[#E8AA45]/15 text-[#E8AA45] border border-[#E8AA45]/30'
                }`}
              >
                {!currentUser
                  ? 'SIGN IN'
                  : currentUser.verificationStatus === 'verified'
                  ? 'VERIFIED'
                  : 'PENDING'}
              </span>
              <ChevronDown className="w-3 h-3 text-[#707883]" />
            </button>

            {/* Persona Switcher Menu with Enter/Exit Animation */}
            <AnimatePresence>
              {showPersonaMenu && (
                <motion.div
                  key="persona-switcher-dropdown"
                  initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.96, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.96, filter: 'blur(4px)' }}
                  transition={{ duration: reducedMotion ? 0.1 : 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute right-0 mt-2 w-72 bg-[#13161A] border border-[#414851] rounded-lg shadow-2xl p-2 z-50 font-mono text-xs"
                >
                  <div className="px-3 py-2 border-b border-[#282D34] text-[10px] text-[#707883] uppercase tracking-wider">
                    ACTIVE SQUADRON CREDENTIALS
                  </div>
                  {currentUser ? (
                    <div className="p-2 space-y-1">
                      <div className="text-[#F1F3F5] font-semibold">{currentUser.fullName}</div>
                      <div className="text-[11px] text-[#A0A7B0]">
                        {currentUser.motorcycleModel} • {currentUser.variant}
                      </div>
                      <div className="text-[10px] text-[#707883]">
                        CALLSIGN ROLE: {currentUser.role.toUpperCase()}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          playTacticalClick();
                          setShowPersonaMenu(false);
                          void logout();
                        }}
                        className="mt-2 w-full py-1.5 px-2.5 rounded bg-[#E04F5F]/15 hover:bg-[#E04F5F]/25 text-[#E04F5F] border border-[#E04F5F]/40 font-bold text-[10px] uppercase transition-colors"
                      >
                        SIGN OUT OF SESSION
                      </button>
                    </div>
                  ) : (
                    <div className="p-2 space-y-2">
                      <div className="text-[#A0A7B0] text-[11px]">
                        Browsing in Public Read-Only Mode. Sign in to post, join rides, or access confidential records.
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          playTacticalClick();
                          setShowPersonaMenu(false);
                          openAuthModal();
                        }}
                        className="w-full py-1.5 px-2.5 rounded bg-[#42B883] hover:bg-[#389d6f] text-[#08090B] font-bold text-[10px] uppercase transition-colors"
                      >
                        SIGN IN / INITIALIZE PASSWORD
                      </button>
                    </div>
                  )}

                  <div className="border-t border-[#282D34] mt-2 pt-2 px-2 pb-1 text-[10px] text-[#707883] uppercase flex items-center justify-between">
                    <span>SWITCH MEMBER PERSONA:</span>
                    <Lock className="w-3 h-3 text-[#707883]" />
                  </div>
                  <div className="space-y-1">
                    {availableUsers.map(u => (
                      <button
                        key={u.id}
                        onClick={() => {
                          playTacticalClick();
                          setShowPersonaMenu(false);
                          void switchPersona(u.id);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between text-xs transition-colors ${
                          currentUser?.id === u.id
                            ? 'bg-[#252A30] text-[#F1F3F5] font-semibold'
                            : 'text-[#A0A7B0] hover:bg-[#191D22] hover:text-[#F1F3F5]'
                        }`}
                      >
                        <div className="truncate">
                          <div>{u.fullName}</div>
                          <div className="text-[10px] text-[#707883]">
                            {u.role} • {u.verificationStatus}
                          </div>
                        </div>
                        {currentUser?.id === u.id ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#42B883]" />
                        ) : (
                          <Lock className="w-3 h-3 text-[#707883]" />
                        )}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="xl:hidden p-2 rounded bg-[#13161A] border border-[#282D34] text-[#A0A7B0] hover:text-[#F1F3F5]"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu with Enter/Exit Animation */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            key="mobile-drawer-menu"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -12, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -12, filter: 'blur(4px)' }}
            transition={{ duration: reducedMotion ? 0.1 : 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="xl:hidden bg-[#0D0F12] border-b border-[#414851] px-4 py-3 space-y-1 max-h-[80vh] overflow-y-auto"
          >
            <div className="grid grid-cols-2 gap-1.5 pb-3 mb-2 border-b border-[#282D34]">
              <button
                onClick={() => {
                  toggleSound();
                  playTacticalClick();
                }}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-[#13161A] text-xs font-mono text-[#D4D8DE]"
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-[#42B883]" /> : <VolumeX className="w-3.5 h-3.5" />}
                AUDIO: {soundEnabled ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={() => {
                  toggleReducedMotion();
                  playTacticalClick();
                }}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-[#13161A] text-xs font-mono text-[#D4D8DE]"
              >
                MOTION: {reducedMotion ? 'MIN' : 'FULL'}
              </button>
            </div>

            {onOpenWelcome && (
              <button
                onClick={() => {
                  playTacticalClick();
                  setMobileMenuOpen(false);
                  onOpenWelcome();
                }}
                className="w-full mb-2 flex items-center justify-center gap-2 py-2 px-3 rounded bg-[#E8AA45]/15 border border-[#E8AA45]/40 text-xs font-mono font-bold text-[#E8AA45]"
              >
                <Zap className="w-4 h-4 text-[#E8AA45]" />
                <span>PILOT COCKPIT BRIEFING & TAKE OFF</span>
              </button>
            )}

            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded text-xs font-mono tracking-wide transition-colors ${
                    isActive
                      ? item.id === 'emergency'
                        ? 'bg-[#1F0707] text-[#EF4444] border border-[#EF4444]/60 font-bold'
                        : 'bg-[#191D22] text-[#F1F3F5] border border-[#414851]'
                      : item.id === 'emergency'
                      ? 'text-[#EF4444] font-semibold hover:bg-[#1F0707]'
                      : 'text-[#A0A7B0] hover:bg-[#13161A] hover:text-[#F1F3F5]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      item.id === 'emergency'
                        ? 'text-[#EF4444]'
                        : ''
                    }`}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
