import React, { useState } from 'react';
import {
  Compass,
  Radio,
  Cpu,
  AlertTriangle,
  Activity,
  Zap,
  MessageSquare,
  Shield,
  ChevronRight,
  ArrowUpRight,
  Clock,
  MapPin,
  CheckCircle,
  Users,
  Database,
  Wifi,
  WifiOff,
  RefreshCw,
  Gauge,
  BatteryCharging,
  Layers,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { Ride, EmergencyRequest, ProblemReport, DiscussionPost, ChargingStation } from '../types';
import { BikeTelemetrySnapshot, CacheStorageStats, CURRENT_CACHE_VERSION, SCHEMA_VERSION } from '../utils/telemetryCache';
import { RouteMapVisualizer } from './RouteMapVisualizer';

interface TacticalDashboardProps {
  rides: Ride[];
  emergencies: EmergencyRequest[];
  problems: ProblemReport[];
  discussions: DiscussionPost[];
  chargingStations: ChargingStation[];
  onNavigate: (tabId: string) => void;
  isOffline?: boolean;
  isSimulatedOffline?: boolean;
  onToggleSimulateOffline?: () => void;
  cacheAge?: string;
  cacheStats?: CacheStorageStats | null;
  onForceRefreshCache?: () => Promise<void>;
  bikeTelemetry?: BikeTelemetrySnapshot;
  queuedActionCount?: number;
  onOpenWelcome?: () => void;
}

export const TacticalDashboard: React.FC<TacticalDashboardProps> = ({
  rides,
  emergencies,
  problems,
  discussions,
  chargingStations,
  onNavigate,
  isOffline = false,
  isSimulatedOffline = false,
  onToggleSimulateOffline,
  cacheAge = 'Live',
  cacheStats,
  onForceRefreshCache,
  bikeTelemetry = {
    model: 'Ultraviolette F77 MACH 2 Recon',
    batterySocPercent: 88,
    estimatedRangeKm: 261,
    odometerKm: 3420,
    regenLevel: 10,
    avionicsHealth: 'NOMINAL',
    motorTempC: 42,
    lastPing: new Date().toISOString()
  },
  queuedActionCount = 0,
  onOpenWelcome
}) => {
  const { currentUser } = useAuth();
  const { playTacticalClick, playChime, playAlert, reducedMotion } = useAudio();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const activeRides = rides.filter(r => r.status === 'In Progress');
  const upcomingRides = rides.filter(r => r.status === 'Registration Open' || r.status === 'Ready to Depart');
  const activeEmergencies = emergencies.filter(e => e.status !== 'Resolved' && e.status !== 'Cancelled');
  const unresolvedProblems = problems.filter(p => p.status !== 'Resolved');

  const handleRefreshClick = async () => {
    playTacticalClick();
    if (onForceRefreshCache) {
      setIsRefreshing(true);
      try {
        await onForceRefreshCache();
        playChime();
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  const handleToggleOffline = () => {
    playTacticalClick();
    if (onToggleSimulateOffline) {
      onToggleSimulateOffline();
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Tactical Alert Bar with Offline / Cache Status */}
      <div className={`bg-[#13161A] border rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-colors ${
        isOffline ? 'border-[#E8AA45]/50 bg-[#16140D]' : 'border-[#282D34]'
      }`}>
        <div className="flex items-center space-x-3.5">
          <div className={`w-10 h-10 rounded border flex items-center justify-center shrink-0 ${
            isOffline
              ? 'bg-[#2A200B] border-[#E8AA45]/60 text-[#E8AA45]'
              : 'bg-[#191D22] border-[#414851] text-[#42B883]'
          }`}>
            {isOffline ? <WifiOff className="w-5 h-5 text-[#E8AA45]" /> : <Radio className="w-5 h-5 text-[#42B883]" />}
          </div>
          <div>
            <div className="text-xs font-mono uppercase tracking-wider flex items-center gap-2">
              <span className="text-[#D4D8DE] font-semibold">SQUADRON TELEMETRY LINK</span>
              <span className={`w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-[#E8AA45] animate-pulse' : 'bg-[#42B883] animate-pulse'}`}></span>
              <span className={isOffline ? 'text-[#E8AA45] font-bold' : 'text-[#42B883] font-bold'}>
                {isOffline ? 'OFFLINE (TACTICAL CACHE ACTIVE)' : 'ONLINE (LIVE GRID)'}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#252A30] text-[#AEB5BE] border border-[#414851]/60">
                SCHEMA v{SCHEMA_VERSION}
              </span>
            </div>
            <div className="text-sm font-semibold text-[#F1F3F5] mt-0.5">
              {isOffline ? (
                <span className="text-[#E8AA45]">
                  Downtime Resilience Active • Cached Telemetry Snapshot ({cacheAge}) • Zero Service Interruption
                </span>
              ) : (
                <span>Verified Owner Network • Operational Grid Bengaluru - Mysuru - Western Corridor</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
          {onToggleSimulateOffline && (
            <button
              onClick={handleToggleOffline}
              className={`px-3 py-1.5 rounded border text-xs font-mono transition-colors flex items-center gap-1.5 ${
                isSimulatedOffline
                  ? 'bg-[#E8AA45]/20 border-[#E8AA45] text-[#E8AA45] hover:bg-[#E8AA45]/30'
                  : 'bg-[#191D22] border-[#414851] text-[#AEB5BE] hover:text-[#F1F3F5] hover:border-[#707883]'
              }`}
              title="Test offline resilience mode during network downtime"
            >
              {isSimulatedOffline ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
              <span>{isSimulatedOffline ? 'END DOWNTIME SIM' : 'SIMULATE DOWNTIME'}</span>
            </button>
          )}

          <button
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded bg-[#191D22] border border-[#282D34] hover:border-[#414851] text-[#D4D8DE] transition-colors flex items-center gap-1.5 disabled:opacity-50"
            title="Force immediate cache snapshot refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#42B883]' : 'text-[#AEB5BE]'}`} />
            <span>{isRefreshing ? 'SYNCING...' : 'FORCE RE-CACHE'}</span>
          </button>

          <div className="px-3 py-1.5 rounded bg-[#0D0F12] border border-[#282D34] text-[#D4D8DE]">
            ACTIVE SORTIES: <span className="font-bold text-[#42B883]">{activeRides.length}</span>
          </div>
          <div className="px-3 py-1.5 rounded bg-[#0D0F12] border border-[#282D34] text-[#D4D8DE]">
            DISTRESS ALERTS: <span className={`font-bold ${activeEmergencies.length > 0 ? 'text-[#E04F5F]' : 'text-[#707883]'}`}>{activeEmergencies.length}</span>
          </div>
        </div>
      </div>

      {/* Persistent Telemetry Resilience Cockpit Banner */}
      <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-[#282D34]/80">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-[#13161A] border border-[#414851] flex items-center justify-center text-[#729BCB]">
              <Database className="w-4 h-4 text-[#729BCB]" />
            </div>
            <div>
              <div className="text-xs font-mono font-bold text-[#D4D8DE] uppercase tracking-wider flex items-center gap-2">
                <span>ESSENTIAL TELEMETRY CACHE ENGINE</span>
                <span className="px-1.5 py-0.2 text-[10px] rounded bg-[#42B883]/15 text-[#42B883] border border-[#42B883]/30">
                  DUAL-LAYER PWA+STORAGE
                </span>
              </div>
              <div className="text-[11px] text-[#707883]">
                Service Worker Cache (<span className="text-[#AEB5BE]">gp-telemetry-v3</span>) + Versioned LocalStorage (<span className="text-[#AEB5BE]">gp_telemetry_cache_v3</span>)
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-[#AEB5BE]">
            <div className="flex items-center gap-1.5">
              <span className="text-[#707883]">LAST SYNC:</span>
              <span className={`font-semibold ${isOffline ? 'text-[#E8AA45]' : 'text-[#42B883]'}`}>
                {cacheAge === 'Live' ? 'LIVE STREAM' : cacheAge}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#707883]">TOTAL CACHED RECORDS:</span>
              <span className="text-[#F1F3F5] font-bold">
                {cacheStats?.totalRecords ?? (rides.length + emergencies.length + problems.length + chargingStations.length + discussions.length)}
              </span>
            </div>
            {cacheStats?.approxSizeKb && (
              <div className="flex items-center gap-1.5">
                <span className="text-[#707883]">CACHE SIZE:</span>
                <span className="text-[#D4D8DE]">{cacheStats.approxSizeKb} KB</span>
              </div>
            )}
            {queuedActionCount > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#E8AA45]/20 border border-[#E8AA45]/50 text-[#E8AA45]">
                <span>PENDING SYNC QUEUE:</span>
                <span className="font-bold">{queuedActionCount}</span>
              </div>
            )}
          </div>
        </div>

        {/* Bike Telemetry Avionics HUD (Cached Offline Data) */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-[#13161A] border border-[#282D34] rounded-md p-3">
            <div className="text-[10px] font-mono text-[#707883] uppercase flex items-center justify-between">
              <span>BATTERY SOC</span>
              <BatteryCharging className="w-3.5 h-3.5 text-[#42B883]" />
            </div>
            <div className="text-lg font-bold font-mono text-[#F1F3F5] mt-1">
              {(bikeTelemetry as any).batterySocPercent ?? (bikeTelemetry as any).socPercent ?? 92}%
            </div>
            <div className="text-[10px] font-mono text-[#42B883] mt-0.5">10.3 kWh SRB Pack</div>
          </div>

          <div className="bg-[#13161A] border border-[#282D34] rounded-md p-3">
            <div className="text-[10px] font-mono text-[#707883] uppercase flex items-center justify-between">
              <span>EST. RANGE</span>
              <Compass className="w-3.5 h-3.5 text-[#729BCB]" />
            </div>
            <div className="text-lg font-bold font-mono text-[#F1F3F5] mt-1">
              {typeof bikeTelemetry.estimatedRangeKm === 'object' ? (bikeTelemetry.estimatedRangeKm as any).combat : bikeTelemetry.estimatedRangeKm} <span className="text-xs font-normal text-[#707883]">KM</span>
            </div>
            <div className="text-[10px] font-mono text-[#729BCB] mt-0.5">Combat Mode</div>
          </div>

          <div className="bg-[#13161A] border border-[#282D34] rounded-md p-3">
            <div className="text-[10px] font-mono text-[#707883] uppercase flex items-center justify-between">
              <span>ODOMETER</span>
              <Gauge className="w-3.5 h-3.5 text-[#AEB5BE]" />
            </div>
            <div className="text-lg font-bold font-mono text-[#F1F3F5] mt-1">
              {bikeTelemetry.odometerKm.toLocaleString()} <span className="text-xs font-normal text-[#707883]">KM</span>
            </div>
            <div className="text-[10px] font-mono text-[#707883] mt-0.5">Total Flight Time</div>
          </div>

          <div className="bg-[#13161A] border border-[#282D34] rounded-md p-3">
            <div className="text-[10px] font-mono text-[#707883] uppercase flex items-center justify-between">
              <span>REGEN LEVEL</span>
              <Zap className="w-3.5 h-3.5 text-[#E8AA45]" />
            </div>
            <div className="text-lg font-bold font-mono text-[#F1F3F5] mt-1">
              LVL {bikeTelemetry.regenLevel} <span className="text-xs font-normal text-[#707883]">/ 10</span>
            </div>
            <div className="text-[10px] font-mono text-[#E8AA45] mt-0.5">Dynamic 10-Step</div>
          </div>

          <div className="bg-[#13161A] border border-[#282D34] rounded-md p-3">
            <div className="text-[10px] font-mono text-[#707883] uppercase flex items-center justify-between">
              <span>MOTOR TEMP</span>
              <Activity className="w-3.5 h-3.5 text-[#42B883]" />
            </div>
            <div className="text-lg font-bold font-mono text-[#F1F3F5] mt-1">
              {bikeTelemetry.motorTempC}°C
            </div>
            <div className="text-[10px] font-mono text-[#42B883] mt-0.5">Thermal Envelope OK</div>
          </div>

          <div className="bg-[#13161A] border border-[#282D34] rounded-md p-3">
            <div className="text-[10px] font-mono text-[#707883] uppercase flex items-center justify-between">
              <span>AVIONICS LINK</span>
              <Shield className="w-3.5 h-3.5 text-[#42B883]" />
            </div>
            <div className="text-sm font-bold font-mono text-[#42B883] mt-2">
              {bikeTelemetry.avionicsHealth}
            </div>
            <div className="text-[10px] font-mono text-[#707883] mt-0.5 truncate">{bikeTelemetry.model}</div>
          </div>
        </div>
      </div>

      {/* Main Grid: Tactical Radar + Quick Actions + Key Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Radar & Aviation Communications Waveform Visualizer (5 Cols) */}
        <div className="lg:col-span-5 bg-[#0D0F12] border border-[#282D34] rounded-lg p-5 flex flex-col justify-between relative overflow-hidden">
          {/* Subtle Grid Background */}
          <div className="absolute inset-0 stealth-grid opacity-50 pointer-events-none"></div>

          <div className="flex items-center justify-between relative z-10">
            <div className="text-xs font-mono font-semibold text-[#D4D8DE] tracking-wider uppercase flex items-center gap-2">
              <Compass className="w-4 h-4 text-[#AEB5BE]" />
              SQUADRON RADAR MONITOR
            </div>
            <span className="text-[10px] font-mono text-[#707883]">
              {isOffline ? 'OFFLINE PLOT: 150 KM' : 'RANGE: 150 KM'}
            </span>
          </div>

          {/* 2D Minimalist Aviation Radar Graphic */}
          <div className="my-6 flex justify-center items-center relative z-10">
            <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-full border border-[#414851]/60 flex items-center justify-center bg-[#13161A]/40">
              {/* Inner concentric range rings */}
              <div className="absolute w-36 h-36 rounded-full border border-[#282D34]/80"></div>
              <div className="absolute w-20 h-20 rounded-full border border-[#282D34]/80"></div>
              <div className="absolute w-2 h-2 rounded-full bg-[#42B883]"></div>

              {/* Crosshairs */}
              <div className="absolute inset-x-0 top-1/2 h-px bg-[#414851]/40"></div>
              <div className="absolute inset-y-0 left-1/2 w-px bg-[#414851]/40"></div>

              {/* Scanning sweep line */}
              <div
                className={`absolute top-1/2 left-1/2 w-24 sm:w-28 h-px origin-left bg-gradient-to-r from-transparent to-[#42B883] ${
                  reducedMotion ? '' : 'radar-sweep'
                }`}
              ></div>

              {/* Active Squadron Contacts on Radar */}
              <div className="absolute top-10 left-16 w-2 h-2 rounded-full bg-[#729BCB]" title="Vanguard (Leader)"></div>
              <div className="absolute bottom-12 right-14 w-2 h-2 rounded-full bg-[#42B883]" title="Apex (In Formation)"></div>
              <div className="absolute top-20 right-10 w-2 h-2 rounded-full bg-[#42B883]" title="Phantom (Sortie)"></div>
              {activeEmergencies.length > 0 && (
                <div className="absolute bottom-8 left-12 w-2.5 h-2.5 rounded-full bg-[#E04F5F] animate-ping" title="Distress Signal"></div>
              )}
            </div>
          </div>

          {/* Aviation Waveform Audio/Comms Visualizer */}
          <div className="space-y-2 relative z-10 pt-2 border-t border-[#282D34]">
            <div className="flex items-center justify-between text-[11px] font-mono text-[#707883]">
              <span>COMMS CHANNEL 4 (462.5625 MHz)</span>
              <span className={isOffline ? 'text-[#E8AA45]' : 'text-[#42B883]'}>
                {isOffline ? 'LOCAL BUFFERED' : 'SYNCHRONIZED'}
              </span>
            </div>
            {/* SVG Digital Waveform Bar Simulation */}
            <div className="h-6 flex items-center justify-between gap-1 px-1 bg-[#13161A] rounded border border-[#282D34]/60">
              {[12, 24, 18, 30, 16, 28, 40, 22, 14, 32, 26, 38, 20, 15, 34, 25, 18, 12].map((height, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-xs transition-colors ${isOffline ? 'bg-[#E8AA45]/60' : 'bg-[#414851]'}`}
                  style={{ height: `${height * 0.45}px` }}
                ></div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Action Operations Grid (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* The Jet Engineer */}
            <button
              onClick={() => {
                playTacticalClick();
                onNavigate('jet_engineer');
              }}
              className="text-left p-4 rounded-lg bg-[#13161A] border border-[#282D34] hover:border-[#414851] hover:bg-[#191D22] transition-all group flex flex-col justify-between h-32"
            >
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded bg-[#191D22] border border-[#414851] flex items-center justify-center text-[#D4D8DE] group-hover:border-[#D4D8DE]">
                  <Cpu className="w-4 h-4 text-[#D4D8DE]" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-[#707883] group-hover:text-[#F1F3F5] transition-colors" />
              </div>
              <div>
                <div className="text-xs font-mono font-bold text-[#F1F3F5] tracking-wide">THE JET ENGINEER</div>
                <div className="text-[11px] text-[#A0A7B0] mt-0.5">AI Technical Diagnostics & Knowledge Train</div>
              </div>
            </button>

            {/* Squadron Assist Emergency */}
            <button
              onClick={() => {
                playTacticalClick();
                onNavigate('emergency');
              }}
              className="text-left p-4 rounded-lg bg-[#191D22] border border-[#E04F5F]/40 hover:border-[#E04F5F] transition-all group flex flex-col justify-between h-32"
            >
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded bg-[#252A30] border border-[#E04F5F]/60 flex items-center justify-center text-[#E04F5F]">
                  <AlertTriangle className="w-4 h-4 text-[#E04F5F]" />
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#E04F5F]/20 text-[#E04F5F] font-bold">
                  25 KM RADIUS
                </span>
              </div>
              <div>
                <div className="text-xs font-mono font-bold text-[#E04F5F] tracking-wide">SQUADRON ASSIST</div>
                <div className="text-[11px] text-[#A0A7B0] mt-0.5">Emergency SOS & Roadside Volunteer Response</div>
              </div>
            </button>

            {/* Mission Mode */}
            <button
              onClick={() => {
                playTacticalClick();
                onNavigate('mission');
              }}
              className="text-left p-4 rounded-lg bg-[#13161A] border border-[#282D34] hover:border-[#414851] hover:bg-[#191D22] transition-all group flex flex-col justify-between h-32"
            >
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded bg-[#191D22] border border-[#414851] flex items-center justify-center text-[#D4D8DE] group-hover:border-[#D4D8DE]">
                  <Radio className="w-4 h-4 text-[#D4D8DE]" />
                </div>
                <span className="text-[10px] font-mono text-[#42B883]">
                  {activeRides.length > 0 ? 'SORTIE ACTIVE' : 'SORTIES READY'}
                </span>
              </div>
              <div>
                <div className="text-xs font-mono font-bold text-[#F1F3F5] tracking-wide">MISSION MODE</div>
                <div className="text-[11px] text-[#A0A7B0] mt-0.5">Tactical Group Rides & Safe-Arrival Confirmation</div>
              </div>
            </button>

            {/* Problem Tracker */}
            <button
              onClick={() => {
                playTacticalClick();
                onNavigate('problems');
              }}
              className="text-left p-4 rounded-lg bg-[#13161A] border border-[#282D34] hover:border-[#414851] hover:bg-[#191D22] transition-all group flex flex-col justify-between h-32"
            >
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded bg-[#191D22] border border-[#414851] flex items-center justify-center text-[#D4D8DE] group-hover:border-[#D4D8DE]">
                  <Activity className="w-4 h-4 text-[#D4D8DE]" />
                </div>
                <span className="text-[10px] font-mono text-[#E8AA45]">
                  {unresolvedProblems.length} LOGGED
                </span>
              </div>
              <div>
                <div className="text-xs font-mono font-bold text-[#F1F3F5] tracking-wide">PRIORITY ISSUES</div>
                <div className="text-[11px] text-[#A0A7B0] mt-0.5">Motorcycle Issue Logging & Symptom Matching</div>
              </div>
            </button>
          </div>

          {/* Active Sortie Live Tracker Strip */}
          {activeRides.length > 0 && (
            <div className="bg-[#191D22] border border-[#42B883]/40 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2 text-xs font-mono text-[#42B883] font-bold">
                  <span className="w-2 h-2 rounded-full bg-[#42B883] animate-pulse"></span>
                  <span>ACTIVE SORTIE IN PROGRESS</span>
                </div>
                <button
                  onClick={() => onNavigate('mission')}
                  className="text-xs font-mono text-[#D4D8DE] hover:underline flex items-center gap-1"
                >
                  ENTER COCKPIT <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="text-sm font-semibold text-[#F1F3F5]">{activeRides[0].name}</div>
              <div className="flex items-center space-x-4 text-xs font-mono text-[#A0A7B0] mt-1.5">
                <span>LEADER: {activeRides[0].rideLeaderName}</span>
                <span>•</span>
                <span>DISTANCE: {activeRides[0].maxDistanceKm} KM</span>
                <span>•</span>
                <span>RIDERS: {activeRides[0].participants.length}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tactical Route Map Visualizer - Static Map Projection for Latest Ride */}
      <RouteMapVisualizer
        routeTelemetry={(bikeTelemetry as any).latestRideRoute}
        onNavigateToMission={() => onNavigate('mission')}
        reducedMotion={reducedMotion}
      />

      {/* Operations Row 2: Unresolved Issues & Nearby Assistance & Discussions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Unresolved Motorcycle Issues */}
        <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#282D34]">
              <span className="text-xs font-mono font-semibold text-[#D4D8DE] uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#E8AA45]" />
                UNRESOLVED ISSUES
              </span>
              <button
                onClick={() => onNavigate('problems')}
                className="text-[10px] font-mono text-[#729BCB] hover:underline"
              >
                VIEW ALL
              </button>
            </div>
            <div className="divide-y divide-[#282D34] mt-2">
              {unresolvedProblems.length === 0 ? (
                <div className="py-4 text-center text-xs font-mono text-[#707883]">
                  NO UNRESOLVED ISSUES RECORDED
                </div>
              ) : (
                unresolvedProblems.slice(0, 3).map(prob => (
                  <div key={prob.id} className="py-2.5">
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#707883] mb-0.5">
                      <span className="text-[#D4D8DE] font-medium">{prob.motorcycleModel}</span>
                      <span className="px-1.5 py-0.2 rounded bg-[#252A30] text-[#E8AA45]">
                        {prob.severity}
                      </span>
                    </div>
                    <div className="text-xs text-[#F1F3F5] font-medium line-clamp-1">{prob.title}</div>
                    <div className="text-[11px] text-[#A0A7B0] mt-0.5">Status: {prob.status}</div>
                  </div>
                ))
              )}
            </div>
          </div>
          <button
            onClick={() => onNavigate('problems')}
            className="w-full mt-4 py-2 px-3 rounded bg-[#13161A] border border-[#282D34] hover:border-[#414851] text-xs font-mono text-[#D4D8DE] transition-colors"
          >
            REPORT NEW ISSUE
          </button>
        </div>

        {/* Nearby Squadron Assistance */}
        <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#282D34]">
              <span className="text-xs font-mono font-semibold text-[#D4D8DE] uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#42B883]" />
                SQUADRON ASSIST GRID
              </span>
              <span className="text-[10px] font-mono text-[#42B883]">PERIMETER: 25 KM</span>
            </div>
            <div className="mt-3 space-y-3">
              <div className="p-3 rounded bg-[#13161A] border border-[#282D34] text-xs">
                <div className="flex items-center justify-between font-mono text-[#A0A7B0]">
                  <span>REGISTERED RESPONDERS</span>
                  <span className="text-[#F1F3F5] font-bold">4 ONLINE</span>
                </div>
                <div className="text-[11px] text-[#707883] mt-1">
                  Active in Bengaluru Urban & Outer Ring Road sectors.
                </div>
              </div>

              {activeEmergencies.length > 0 ? (
                <div className="p-3 rounded bg-[#E04F5F]/10 border border-[#E04F5F]/40 text-xs">
                  <div className="flex items-center justify-between font-mono text-[#E04F5F] font-bold">
                    <span>ACTIVE DISTRESS DISPATCH</span>
                    <span>{activeEmergencies[0].status}</span>
                  </div>
                  <div className="text-[11px] text-[#F1F3F5] mt-1 font-medium">
                    {activeEmergencies[0].requesterName} • {activeEmergencies[0].category}
                  </div>
                  <div className="text-[10px] font-mono text-[#A0A7B0] mt-0.5">
                    {activeEmergencies[0].locationName}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded bg-[#13161A] border border-[#282D34] text-center text-xs text-[#707883] font-mono">
                  ALL SQUADRON SECTORS NORMAL
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => onNavigate('emergency')}
            className="w-full mt-4 py-2 px-3 rounded bg-[#E04F5F]/15 border border-[#E04F5F]/40 hover:bg-[#E04F5F]/25 text-xs font-mono text-[#E04F5F] font-bold transition-colors"
          >
            DISPATCH SQUADRON ASSIST
          </button>
        </div>

        {/* Technical Discussions & Fast Chargers */}
        <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#282D34]">
              <span className="text-xs font-mono font-semibold text-[#D4D8DE] uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#729BCB]" />
                FAST CHARGE & DISCUSSIONS
              </span>
              <button
                onClick={() => onNavigate('charging')}
                className="text-[10px] font-mono text-[#729BCB] hover:underline"
              >
                HUBS
              </button>
            </div>
            <div className="mt-2 divide-y divide-[#282D34]">
              {chargingStations.slice(0, 2).map(cs => (
                <div key={cs.id} className="py-2.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#707883]">
                    <span className="text-[#D4D8DE] font-semibold">{cs.name}</span>
                    <span className="text-[#42B883]">{cs.powerOutputKw} kW</span>
                  </div>
                  <div className="text-[11px] text-[#A0A7B0] truncate mt-0.5">{cs.location}</div>
                </div>
              ))}
              {discussions.slice(0, 1).map(disc => (
                <div key={disc.id} className="py-2.5">
                  <div className="text-[10px] font-mono text-[#729BCB]">{disc.category}</div>
                  <div className="text-xs text-[#F1F3F5] font-medium line-clamp-1 mt-0.5">{disc.title}</div>
                  <div className="text-[10px] font-mono text-[#707883] mt-0.5">By {disc.authorName}</div>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={() => onNavigate('discussions')}
            className="w-full mt-4 py-2 px-3 rounded bg-[#13161A] border border-[#282D34] hover:border-[#414851] text-xs font-mono text-[#D4D8DE] transition-colors"
          >
            ENTER DISCUSSIONS
          </button>
        </div>
      </div>
    </div>
  );
};
