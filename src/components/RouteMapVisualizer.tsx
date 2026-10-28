import React, { useState, useMemo } from 'react';
import {
  MapPin,
  Compass,
  Zap,
  TrendingUp,
  Activity,
  Layers,
  Maximize2,
  Navigation as NavIcon,
  Crosshair,
  Gauge,
  Clock,
  ArrowRight,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Radio
} from 'lucide-react';
import { LatestRideRouteTelemetry, RoutePoint } from '../utils/telemetryCache';
import {
  computeBoundingBox,
  projectCoordinates,
  generateSvgRoutePath,
  generateGraticules,
  calculateDirectBearing,
  BoundingBox
} from '../utils/mapProjection';
import { useAudio } from '../context/AudioContext';

interface RouteMapVisualizerProps {
  routeTelemetry?: LatestRideRouteTelemetry;
  onNavigateToMission?: () => void;
  reducedMotion?: boolean;
}

export const RouteMapVisualizer: React.FC<RouteMapVisualizerProps> = ({
  routeTelemetry,
  onNavigateToMission,
  reducedMotion = false
}) => {
  const { playTacticalClick } = useAudio();
  const [selectedPoint, setSelectedPoint] = useState<RoutePoint | null>(null);
  const [showWaypoints, setShowWaypoints] = useState<boolean>(true);
  const [showGraticules, setShowGraticules] = useState<boolean>(true);
  const [viewPreset, setViewPreset] = useState<'all' | 'start' | 'end'>('all');

  // Fallback route telemetry if none provided
  const route: LatestRideRouteTelemetry = useMemo(() => {
    if (routeTelemetry) return routeTelemetry;
    return {
      rideId: 'ride_01',
      rideName: 'Operation Thunderhead: Nandi Foothills High-Speed Sortie',
      startTime: '05:35 IST',
      endTime: '07:20 IST (Est.)',
      status: 'In Progress',
      startPoint: {
        name: 'Hebbal Flyover Service Lane, Bengaluru',
        coordinates: [13.0358, 77.5970],
        elevationM: 920,
        time: '05:35 IST',
        type: 'start'
      },
      endPoint: {
        name: 'Nandi Hills Summit Parking Gate',
        coordinates: [13.3702, 77.6835],
        elevationM: 1478,
        time: '07:15 IST',
        type: 'end'
      },
      waypoints: [
        {
          name: 'Yelahanka Air Force Station Corridor',
          coordinates: [13.1352, 77.5985],
          elevationM: 915,
          time: '05:50 IST',
          type: 'waypoint'
        },
        {
          name: 'Devanahalli Supernova Fast Hub (NH 44)',
          coordinates: [13.2483, 77.7126],
          elevationM: 900,
          time: '06:12 IST',
          type: 'charging'
        },
        {
          name: 'Karahalli Cross Checkpoint',
          coordinates: [13.3150, 77.7015],
          elevationM: 980,
          time: '06:35 IST',
          type: 'waypoint'
        }
      ],
      gpsTrack: [
        [13.0358, 77.5970],
        [13.0650, 77.5975],
        [13.0950, 77.5980],
        [13.1352, 77.5985],
        [13.1720, 77.6150],
        [13.2100, 77.6520],
        [13.2350, 77.6900],
        [13.2483, 77.7126],
        [13.2750, 77.7110],
        [13.2980, 77.7060],
        [13.3150, 77.7015],
        [13.3320, 77.6940],
        [13.3510, 77.6890],
        [13.3620, 77.6860],
        [13.3702, 77.6835]
      ],
      totalDistanceKm: 128.5,
      durationMin: 75,
      avgSpeedKmh: 68.4,
      topSpeedKmh: 134.2,
      elevationGainM: 558,
      energyConsumedKwh: 4.62,
      avgEfficiencyWhKm: 35.9,
      regenEnergyRecoveredKwh: 0.84
    };
  }, [routeTelemetry]);

  // Viewport dimensions for SVG static projection
  const width = 860;
  const height = 440;
  const padding = 54;

  // Compute bounding box based on view preset
  const bbox: BoundingBox = useMemo(() => {
    if (viewPreset === 'start') {
      return computeBoundingBox(
        [
          route.startPoint.coordinates,
          [route.startPoint.coordinates[0] + 0.05, route.startPoint.coordinates[1] + 0.05],
          [route.startPoint.coordinates[0] - 0.05, route.startPoint.coordinates[1] - 0.05]
        ],
        0.3
      );
    }
    if (viewPreset === 'end') {
      return computeBoundingBox(
        [
          route.endPoint.coordinates,
          [route.endPoint.coordinates[0] + 0.05, route.endPoint.coordinates[1] + 0.05],
          [route.endPoint.coordinates[0] - 0.05, route.endPoint.coordinates[1] - 0.05]
        ],
        0.3
      );
    }
    // Full corridor
    const allCoords = [
      route.startPoint.coordinates,
      route.endPoint.coordinates,
      ...(route.waypoints?.map((w: any) => w.coordinates) || []),
      ...(route.gpsTrack || [])
    ];
    return computeBoundingBox(allCoords, 0.16);
  }, [route, viewPreset]);

  // Static projection path & points
  const routePathD = useMemo(() => {
    return generateSvgRoutePath(route.gpsTrack, bbox, width, height, padding);
  }, [route.gpsTrack, bbox]);

  const startProjected = useMemo(() => {
    return projectCoordinates(
      route.startPoint.coordinates[0],
      route.startPoint.coordinates[1],
      bbox,
      width,
      height,
      padding
    );
  }, [route.startPoint, bbox]);

  const endProjected = useMemo(() => {
    return projectCoordinates(
      route.endPoint.coordinates[0],
      route.endPoint.coordinates[1],
      bbox,
      width,
      height,
      padding
    );
  }, [route.endPoint, bbox]);

  const projectedWaypoints = useMemo(() => {
    if (!route.waypoints) return [];
    return route.waypoints.map((wp: any) => ({
      ...wp,
      projected: projectCoordinates(wp.coordinates[0], wp.coordinates[1], bbox, width, height, padding)
    }));
  }, [route.waypoints, bbox]);

  const graticules = useMemo(() => {
    return generateGraticules(bbox, width, height, padding, 3, 4);
  }, [bbox]);

  const bearing = useMemo(() => {
    return calculateDirectBearing(
      route.startPoint.coordinates[0],
      route.startPoint.coordinates[1],
      route.endPoint.coordinates[0],
      route.endPoint.coordinates[1]
    );
  }, [route.startPoint, route.endPoint]);

  const handlePointClick = (pt: RoutePoint) => {
    playTacticalClick();
    setSelectedPoint((prev: RoutePoint | null) => (prev?.name === pt.name ? null : pt));
  };

  return (
    <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-5 flex flex-col space-y-4 relative overflow-hidden">
      {/* Background Stealth Grid */}
      <div className="absolute inset-0 stealth-grid opacity-30 pointer-events-none"></div>

      {/* Visualizer Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 relative z-10 pb-3 border-b border-[#282D34]">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded bg-[#13161A] border border-[#414851] flex items-center justify-center text-[#42B883]">
            <Compass className="w-4 h-4 text-[#42B883]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-[#D4D8DE] uppercase tracking-wider">
                TACTICAL ROUTE MAP VISUALIZER
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#42B883]/15 text-[#42B883] border border-[#42B883]/30">
                STATIC WGS-84 PROJECTION
              </span>
              <span className="text-[10px] font-mono text-[#707883] hidden sm:inline">
                BEARING: {bearing.bearingDeg.toString().padStart(3, '0')}° {bearing.compassDir}
              </span>
            </div>
            <div className="text-xs text-[#A0A7B0] font-mono mt-0.5 flex items-center gap-2">
              <span className="text-[#F1F3F5] font-semibold">{route.rideName}</span>
              <span>•</span>
              <span className="text-[#42B883]">{route.status}</span>
            </div>
          </div>
        </div>

        {/* View Controls & Toggles */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <div className="flex items-center bg-[#13161A] border border-[#282D34] rounded p-0.5">
            <button
              onClick={() => {
                playTacticalClick();
                setViewPreset('all');
              }}
              className={`px-2 py-1 rounded text-[10px] transition-colors ${
                viewPreset === 'all'
                  ? 'bg-[#252A30] text-[#F1F3F5] font-bold border border-[#414851]'
                  : 'text-[#707883] hover:text-[#D4D8DE]'
              }`}
            >
              FULL CORRIDOR
            </button>
            <button
              onClick={() => {
                playTacticalClick();
                setViewPreset('start');
              }}
              className={`px-2 py-1 rounded text-[10px] transition-colors ${
                viewPreset === 'start'
                  ? 'bg-[#252A30] text-[#42B883] font-bold border border-[#414851]'
                  : 'text-[#707883] hover:text-[#D4D8DE]'
              }`}
            >
              ORIGIN
            </button>
            <button
              onClick={() => {
                playTacticalClick();
                setViewPreset('end');
              }}
              className={`px-2 py-1 rounded text-[10px] transition-colors ${
                viewPreset === 'end'
                  ? 'bg-[#252A30] text-[#729BCB] font-bold border border-[#414851]'
                  : 'text-[#707883] hover:text-[#D4D8DE]'
              }`}
            >
              SUMMIT
            </button>
          </div>

          <button
            onClick={() => {
              playTacticalClick();
              setShowWaypoints(prev => !prev);
            }}
            className={`px-2 py-1 rounded border text-[10px] transition-colors flex items-center gap-1 ${
              showWaypoints
                ? 'bg-[#191D22] border-[#414851] text-[#D4D8DE]'
                : 'bg-[#13161A] border-[#282D34] text-[#707883]'
            }`}
            title="Toggle intermediate tactical checkpoints"
          >
            <Layers className="w-3 h-3" />
            <span>NODES</span>
          </button>

          <button
            onClick={() => {
              playTacticalClick();
              setShowGraticules(prev => !prev);
            }}
            className={`px-2 py-1 rounded border text-[10px] transition-colors flex items-center gap-1 ${
              showGraticules
                ? 'bg-[#191D22] border-[#414851] text-[#D4D8DE]'
                : 'bg-[#13161A] border-[#282D34] text-[#707883]'
            }`}
            title="Toggle coordinate graticule grid"
          >
            <Crosshair className="w-3 h-3" />
            <span>GRID</span>
          </button>

          {onNavigateToMission && (
            <button
              onClick={() => {
                playTacticalClick();
                onNavigateToMission();
              }}
              className="px-2.5 py-1 rounded bg-[#191D22] border border-[#282D34] hover:border-[#42B883] text-[#D4D8DE] hover:text-[#42B883] text-[10px] transition-colors flex items-center gap-1"
            >
              <span>MISSION COCKPIT</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Static Map Projection Canvas (SVG Cartography) */}
      <div className="relative w-full bg-[#08090B] border border-[#282D34] rounded-lg overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto max-h-[460px] select-none block"
          style={{ aspectRatio: `${width} / ${height}` }}
        >
          <defs>
            {/* Route Glow Filters */}
            <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="beaconGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Linear Gradient for Flight Corridor */}
            <linearGradient id="corridorGradient" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#42B883" stopOpacity="0.85" />
              <stop offset="60%" stopColor="#729BCB" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#89E4B0" stopOpacity="1" />
            </linearGradient>

            {/* Pattern for background tactical grid */}
            <pattern id="staticGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1A1E24" strokeWidth="0.8" />
            </pattern>
          </defs>

          {/* Tactical Background Grid Pattern */}
          <rect width={width} height={height} fill="#08090B" />
          <rect width={width} height={height} fill="url(#staticGrid)" opacity="0.6" />

          {/* Graticule Lines and Coordinate Markers */}
          {showGraticules && (
            <g className="graticules opacity-50">
              {graticules.map(g => (
                <g key={g.id}>
                  <line
                    x1={g.start.x}
                    y1={g.start.y}
                    x2={g.end.x}
                    y2={g.end.y}
                    stroke="#252A30"
                    strokeWidth="0.7"
                    strokeDasharray="4 4"
                  />
                  {g.type === 'latitude' ? (
                    <text
                      x={padding - 8}
                      y={g.start.y + 3}
                      fill="#707883"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      {g.formatted}
                    </text>
                  ) : (
                    <text
                      x={g.start.x}
                      y={height - padding + 16}
                      fill="#707883"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {g.formatted}
                    </text>
                  )}
                </g>
              ))}
            </g>
          )}

          {/* Route Corridor Border Shadow */}
          <path
            d={routePathD}
            fill="none"
            stroke="#13161A"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Tactical Route Glow Track */}
          <path
            d={routePathD}
            fill="none"
            stroke="url(#corridorGradient)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#routeGlow)"
          />

          {/* Pulsing Flight Dash Overlay */}
          {!reducedMotion && (
            <path
              d={routePathD}
              fill="none"
              stroke="#F1F3F5"
              strokeWidth="1.5"
              strokeDasharray="8 20"
              strokeLinecap="round"
              className="route-pulse"
              opacity="0.8"
            />
          )}

          {/* GPS Track Polyline Waypoint Dots */}
          {route.gpsTrack.map(([lat, lng]: [number, number], i: number) => {
            const pt = projectCoordinates(lat, lng, bbox, width, height, padding);
            return (
              <circle
                key={`gps_${i}`}
                cx={pt.x}
                cy={pt.y}
                r="1.8"
                fill="#414851"
                opacity="0.7"
              />
            );
          })}

          {/* Intermediate Waypoints (Nodes) */}
          {showWaypoints &&
            projectedWaypoints.map((wp: any, i: number) => {
              const isSelected = selectedPoint?.name === wp.name;
              return (
                <g
                  key={`wp_${i}`}
                  className="cursor-pointer transition-transform"
                  onClick={() => handlePointClick(wp)}
                >
                  <circle
                    cx={wp.projected.x}
                    cy={wp.projected.y}
                    r={isSelected ? '8' : '5'}
                    fill="#13161A"
                    stroke={wp.type === 'charging' ? '#E8AA45' : '#729BCB'}
                    strokeWidth="2"
                  />
                  <circle
                    cx={wp.projected.x}
                    cy={wp.projected.y}
                    r="2.5"
                    fill={wp.type === 'charging' ? '#E8AA45' : '#729BCB'}
                  />
                  {/* Waypoint Label */}
                  <text
                    x={wp.projected.x + 10}
                    y={wp.projected.y + 3}
                    fill={isSelected ? '#F1F3F5' : '#AEB5BE'}
                    fontSize="9.5"
                    fontFamily="monospace"
                    fontWeight={isSelected ? 'bold' : 'normal'}
                  >
                    {wp.name.split(' ')[0]} {wp.type === 'charging' ? '⚡' : ''}
                  </text>
                </g>
              );
            })}

          {/* START POINT: Hebbal Flyover Origin Badge */}
          <g
            className="cursor-pointer group"
            onClick={() => handlePointClick(route.startPoint)}
          >
            {/* Outer animated radar pulse ring */}
            <circle
              cx={startProjected.x}
              cy={startProjected.y}
              r="14"
              fill="none"
              stroke="#42B883"
              strokeWidth="1.2"
              strokeDasharray="3 3"
              opacity="0.7"
              className={reducedMotion ? '' : 'animate-spin'}
              style={{ transformOrigin: `${startProjected.x}px ${startProjected.y}px` }}
            />
            <circle
              cx={startProjected.x}
              cy={startProjected.y}
              r="8"
              fill="#13161A"
              stroke="#42B883"
              strokeWidth="2.5"
              filter="url(#beaconGlow)"
            />
            <circle
              cx={startProjected.x}
              cy={startProjected.y}
              r="3.5"
              fill="#42B883"
            />

            {/* Start Point Callout Box */}
            <g transform={`translate(${startProjected.x + 14}, ${startProjected.y - 12})`}>
              <rect
                x="0"
                y="-10"
                width="168"
                height="32"
                rx="4"
                fill="#13161A"
                stroke="#42B883"
                strokeWidth="1"
                opacity="0.95"
              />
              <text
                x="8"
                y="3"
                fill="#42B883"
                fontSize="9"
                fontFamily="monospace"
                fontWeight="bold"
              >
                ● DEPARTURE ORIGIN [START]
              </text>
              <text
                x="8"
                y="15"
                fill="#D4D8DE"
                fontSize="9"
                fontFamily="monospace"
              >
                {route.startPoint.coordinates[0].toFixed(4)}°N, {route.startPoint.coordinates[1].toFixed(4)}°E
              </text>
            </g>
          </g>

          {/* END POINT: Nandi Hills Summit Destination Badge */}
          <g
            className="cursor-pointer group"
            onClick={() => handlePointClick(route.endPoint)}
          >
            {/* Outer target crosshairs */}
            <circle
              cx={endProjected.x}
              cy={endProjected.y}
              r="15"
              fill="none"
              stroke="#729BCB"
              strokeWidth="1.2"
              opacity="0.8"
            />
            <line
              x1={endProjected.x - 20}
              y1={endProjected.y}
              x2={endProjected.x + 20}
              y2={endProjected.y}
              stroke="#729BCB"
              strokeWidth="1"
              opacity="0.7"
            />
            <line
              x1={endProjected.x}
              y1={endProjected.y - 20}
              x2={endProjected.x}
              y2={endProjected.y + 20}
              stroke="#729BCB"
              strokeWidth="1"
              opacity="0.7"
            />

            <circle
              cx={endProjected.x}
              cy={endProjected.y}
              r="8"
              fill="#13161A"
              stroke="#729BCB"
              strokeWidth="2.5"
              filter="url(#beaconGlow)"
            />
            <circle
              cx={endProjected.x}
              cy={endProjected.y}
              r="3.5"
              fill="#729BCB"
            />

            {/* End Point Callout Box */}
            <g transform={`translate(${endProjected.x - 184}, ${endProjected.y - 12})`}>
              <rect
                x="0"
                y="-10"
                width="176"
                height="32"
                rx="4"
                fill="#13161A"
                stroke="#729BCB"
                strokeWidth="1"
                opacity="0.95"
              />
              <text
                x="8"
                y="3"
                fill="#729BCB"
                fontSize="9"
                fontFamily="monospace"
                fontWeight="bold"
              >
                ◆ SUMMIT DESTINATION [END]
              </text>
              <text
                x="8"
                y="15"
                fill="#D4D8DE"
                fontSize="9"
                fontFamily="monospace"
              >
                {route.endPoint.coordinates[0].toFixed(4)}°N, {route.endPoint.coordinates[1].toFixed(4)}°E
              </text>
            </g>
          </g>

          {/* Compass Rose Indicator Overlay */}
          <g transform={`translate(${width - 45}, 45)`}>
            <circle cx="0" cy="0" r="18" fill="#13161A" stroke="#414851" strokeWidth="1" opacity="0.8" />
            <line x1="0" y1="-14" x2="0" y2="14" stroke="#707883" strokeWidth="0.8" />
            <line x1="-14" y1="0" x2="14" y2="0" stroke="#707883" strokeWidth="0.8" />
            {/* North pointer arrow */}
            <polygon points="0,-14 -3.5,-4 3.5,-4" fill="#E04F5F" />
            <text x="0" y="-16" fill="#E04F5F" fontSize="8" fontFamily="monospace" textAnchor="middle" fontWeight="bold">
              N
            </text>
          </g>

          {/* Map Scale Metric Indicator */}
          <g transform={`translate(${padding}, ${height - 20})`}>
            <rect x="0" y="-6" width="70" height="3" fill="#D4D8DE" />
            <line x1="0" y1="-9" x2="0" y2="-3" stroke="#D4D8DE" strokeWidth="1.5" />
            <line x1="70" y1="-9" x2="70" y2="-3" stroke="#D4D8DE" strokeWidth="1.5" />
            <text x="35" y="8" fill="#707883" fontSize="8" fontFamily="monospace" textAnchor="middle">
              20 KM
            </text>
          </g>
        </svg>

        {/* Selected Coordinate Details Floating Banner */}
        {selectedPoint && (
          <div className="absolute bottom-3 right-3 bg-[#13161A]/95 border border-[#414851] rounded p-3 text-xs font-mono max-w-xs shadow-xl backdrop-blur-sm z-20">
            <div className="flex items-center justify-between pb-1.5 border-b border-[#282D34]">
              <span className="text-[#F1F3F5] font-bold truncate flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#42B883]" />
                {selectedPoint.name}
              </span>
              <button
                onClick={() => setSelectedPoint(null)}
                className="text-[#707883] hover:text-[#D4D8DE] text-xs ml-2"
              >
                ✕
              </button>
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-[#A0A7B0]">
              <div className="flex justify-between">
                <span>COORDINATES:</span>
                <span className="text-[#D4D8DE]">
                  {selectedPoint.coordinates[0].toFixed(4)}°N, {selectedPoint.coordinates[1].toFixed(4)}°E
                </span>
              </div>
              {selectedPoint.elevationM && (
                <div className="flex justify-between">
                  <span>ELEVATION:</span>
                  <span className="text-[#42B883]">{selectedPoint.elevationM} m MSL</span>
                </div>
              )}
              {selectedPoint.time && (
                <div className="flex justify-between">
                  <span>SORTIE TIME:</span>
                  <span className="text-[#D4D8DE]">{selectedPoint.time}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>POINT ROLE:</span>
                <span className="uppercase text-[#729BCB]">{selectedPoint.type || 'WAYPOINT'}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Start and End Point Coordinate Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
        {/* Start Point Card */}
        <div
          onClick={() => handlePointClick(route.startPoint)}
          className={`p-3 rounded bg-[#13161A] border transition-all cursor-pointer ${
            selectedPoint?.name === route.startPoint.name
              ? 'border-[#42B883] bg-[#161D19]'
              : 'border-[#282D34] hover:border-[#414851]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[#42B883] font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#42B883] animate-pulse"></span>
              ORIGIN (START POINT)
            </span>
            <span className="text-[10px] text-[#707883]">{route.startPoint.time || route.startTime}</span>
          </div>
          <div className="text-sm font-semibold text-[#F1F3F5] mt-1 truncate">
            {route.startPoint.name}
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#A0A7B0] mt-1.5 pt-1.5 border-t border-[#282D34]">
            <span>COORDS: {route.startPoint.coordinates[0].toFixed(4)}° N, {route.startPoint.coordinates[1].toFixed(4)}° E</span>
            <span className="text-[#D4D8DE]">{route.startPoint.elevationM ? `${route.startPoint.elevationM}m MSL` : 'Base Level'}</span>
          </div>
        </div>

        {/* End Point Card */}
        <div
          onClick={() => handlePointClick(route.endPoint)}
          className={`p-3 rounded bg-[#13161A] border transition-all cursor-pointer ${
            selectedPoint?.name === route.endPoint.name
              ? 'border-[#729BCB] bg-[#141A22]'
              : 'border-[#282D34] hover:border-[#414851]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[#729BCB] font-bold flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5 text-[#729BCB]" />
              DESTINATION (END POINT)
            </span>
            <span className="text-[10px] text-[#707883]">{route.endPoint.time || route.endTime}</span>
          </div>
          <div className="text-sm font-semibold text-[#F1F3F5] mt-1 truncate">
            {route.endPoint.name}
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#A0A7B0] mt-1.5 pt-1.5 border-t border-[#282D34]">
            <span>COORDS: {route.endPoint.coordinates[0].toFixed(4)}° N, {route.endPoint.coordinates[1].toFixed(4)}° E</span>
            <span className="text-[#42B883] font-semibold">{route.endPoint.elevationM ? `${route.endPoint.elevationM}m MSL (+${route.elevationGainM}m)` : 'Summit'}</span>
          </div>
        </div>
      </div>

      {/* Latest Ride Telemetry Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
        <div className="bg-[#13161A] border border-[#282D34] rounded p-2.5">
          <div className="text-[10px] font-mono text-[#707883] uppercase flex items-center justify-between">
            <span>TOTAL FLIGHT</span>
            <Gauge className="w-3 h-3 text-[#AEB5BE]" />
          </div>
          <div className="text-base font-bold font-mono text-[#F1F3F5] mt-0.5">
            {route.totalDistanceKm} <span className="text-xs font-normal text-[#707883]">KM</span>
          </div>
          <div className="text-[10px] font-mono text-[#707883]">Planned Highway</div>
        </div>

        <div className="bg-[#13161A] border border-[#282D34] rounded p-2.5">
          <div className="text-[10px] font-mono text-[#707883] uppercase flex items-center justify-between">
            <span>ELEVATION DELTA</span>
            <TrendingUp className="w-3 h-3 text-[#42B883]" />
          </div>
          <div className="text-base font-bold font-mono text-[#42B883] mt-0.5">
            +{route.elevationGainM} <span className="text-xs font-normal text-[#707883]">M</span>
          </div>
          <div className="text-[10px] font-mono text-[#707883]">Hill Switchbacks</div>
        </div>

        <div className="bg-[#13161A] border border-[#282D34] rounded p-2.5">
          <div className="text-[10px] font-mono text-[#707883] uppercase flex items-center justify-between">
            <span>AVG VELOCITY</span>
            <Activity className="w-3 h-3 text-[#729BCB]" />
          </div>
          <div className="text-base font-bold font-mono text-[#F1F3F5] mt-0.5">
            {route.avgSpeedKmh} <span className="text-xs font-normal text-[#707883]">KM/H</span>
          </div>
          <div className="text-[10px] font-mono text-[#707883]">Top: {route.topSpeedKmh} km/h</div>
        </div>

        <div className="bg-[#13161A] border border-[#282D34] rounded p-2.5">
          <div className="text-[10px] font-mono text-[#707883] uppercase flex items-center justify-between">
            <span>ENERGY USED</span>
            <Zap className="w-3 h-3 text-[#E8AA45]" />
          </div>
          <div className="text-base font-bold font-mono text-[#F1F3F5] mt-0.5">
            {route.energyConsumedKwh} <span className="text-xs font-normal text-[#707883]">KWH</span>
          </div>
          <div className="text-[10px] font-mono text-[#E8AA45]">{route.avgEfficiencyWhKm} Wh/km</div>
        </div>

        <div className="bg-[#13161A] border border-[#282D34] rounded p-2.5">
          <div className="text-[10px] font-mono text-[#707883] uppercase flex items-center justify-between">
            <span>REGEN HARVEST</span>
            <Zap className="w-3 h-3 text-[#42B883]" />
          </div>
          <div className="text-base font-bold font-mono text-[#42B883] mt-0.5">
            +{route.regenEnergyRecoveredKwh} <span className="text-xs font-normal text-[#707883]">KWH</span>
          </div>
          <div className="text-[10px] font-mono text-[#707883]">Downhill Braking</div>
        </div>

        <div className="bg-[#13161A] border border-[#282D34] rounded p-2.5">
          <div className="text-[10px] font-mono text-[#707883] uppercase flex items-center justify-between">
            <span>GPS SATELLITES</span>
            <Radio className="w-3 h-3 text-[#42B883]" />
          </div>
          <div className="text-base font-bold font-mono text-[#42B883] mt-0.5">
            3D LOCK
          </div>
          <div className="text-[10px] font-mono text-[#707883]">14 Sats • 0.8m HDOP</div>
        </div>
      </div>
    </div>
  );
};
