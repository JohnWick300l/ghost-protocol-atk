import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Compass,
  RotateCcw,
  Navigation,
  CheckCircle2,
  Zap,
  Trash2,
  MapPin,
  Crosshair,
  Loader2,
  X
} from 'lucide-react';
import {
  type RouteCoordinate,
  type PlannedChargingStop,
  type PlannedPitStop,
  type EligibleChargerRecord,
  type ChargerIntelligenceSummary
} from '../utils/autopilot';
import {
  buildChargerNavigationUrl,
  formatManualCoordinatesFallback,
  describeMapPinLocation,
  createTacticalOfflineTileDataUrl
} from '../utils/rules';

export interface MapPickedLocationCandidate {
  target: 'start' | 'dest';
  latitude: number;
  longitude: number;
  name: string;
  locality: string;
  address: string;
  reverseGeocodeSuccess: boolean;
  resolving: boolean;
}

interface AutoPilotRouteMapProps {
  startLocation: RouteCoordinate | null;
  destination: RouteCoordinate | null;
  routePolyline: [number, number][];
  chargingStops: PlannedChargingStop[];
  pitStops: PlannedPitStop[];
  eligibleCorridorChargers: {
    station: EligibleChargerRecord;
    alongRouteKm: number;
    detourDistanceKm: number;
    intelligence: ChargerIntelligenceSummary;
  }[];
  activeStopId: string | null;
  mapPickMode: 'start' | 'dest' | null;
  onChangeMapPickMode: (mode: 'start' | 'dest' | null) => void;
  onConfirmMapLocation: (
    target: 'start' | 'dest',
    location: RouteCoordinate
  ) => void;
  onSelectStop: (stationId: string) => void;
  onToggleReached: (stationId: string) => void;
  onToggleCharged: (stationId: string) => void;
  onReplaceWithBackup: (primaryId: string, backupId: string) => void;
  onAddManualStop: (stationId: string) => void;
  onRemoveStop: (stationId: string) => void;
  onRemovePitStop: (pitStopId: string) => void;
}

function createEndpointIcon(kind: 'start' | 'dest'): L.DivIcon {
  const isStart = kind === 'start';
  const color = isStart ? '#10B981' : '#FF5500';
  const label = isStart ? 'START' : 'DEST';
  const html = `
    <div style="position:relative;width:46px;height:46px;display:flex;align-items:center;justify-content:center;cursor:grab;" title="Drag marker to refine ${isStart ? 'Starting Location' : 'Destination'}">
      <span style="position:absolute;width:38px;height:38px;border-radius:9999px;background:${color};opacity:0.22;border:1px solid ${color};"></span>
      <div style="position:relative;z-index:2;padding:3px 7px;border-radius:4px;background:#080B11;border:2px solid ${color};box-shadow:0 0 12px ${color};font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:800;color:#FFFFFF;letter-spacing:0.08em;">
        ${label}
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'uv-autopilot-endpoint-marker',
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    popupAnchor: [0, -20]
  });
}

function createCandidatePinIcon(target: 'start' | 'dest'): L.DivIcon {
  const isStart = target === 'start';
  const color = isStart ? '#10B981' : '#FF5500';
  const label = isStart ? 'NEW START' : 'NEW DEST';
  const html = `
    <div style="position:relative;width:54px;height:54px;display:flex;align-items:center;justify-content:center;cursor:grab;">
      <span style="position:absolute;width:46px;height:46px;border-radius:9999px;background:${color};opacity:0.30;border:2px dashed ${color};"></span>
      <div style="position:relative;z-index:2;padding:3px 6px;border-radius:4px;background:#080B11;border:2px solid #FFFFFF;box-shadow:0 0 14px ${color};font-family:'JetBrains Mono',monospace;font-size:8px;font-weight:800;color:${color};letter-spacing:0.06em;white-space:nowrap;">
        ${label}
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'uv-autopilot-candidate-marker',
    iconSize: [54, 54],
    iconAnchor: [27, 27],
    popupAnchor: [0, -22]
  });
}

function createPrimaryStopIcon(
  order: number,
  reached: boolean,
  hasIssue: boolean,
  isSelected: boolean,
  isSupernova: boolean = false
): L.DivIcon {
  const borderColor = reached ? '#10B981' : hasIssue ? '#F59E0B' : '#00E5FF';
  const bgColor = reached ? '#064E3B' : isSelected ? '#00E5FF' : '#0B101B';
  const textColor = isSelected && !reached ? '#05070B' : '#FFFFFF';
  const size = isSelected ? 46 : 38;

  if (isSupernova) {
    const snSize = size + 10;
    const html = `
      <div style="position:relative;width:${snSize}px;height:${snSize}px;display:flex;align-items:center;justify-content:center;background:transparent;">
        <div style="position:relative;z-index:2;width:${snSize}px;height:${snSize}px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 0 10px ${borderColor}) drop-shadow(0 2px 6px rgba(0,0,0,0.8));background:transparent;">
          <img src="/assets/aistudio/supernova_black.png" alt="Supernova" style="width:100%;height:100%;object-fit:contain;background:transparent;border:none;" />
          <span style="position:absolute;bottom:-2px;right:-2px;background:#090D16;border:1.5px solid ${borderColor};border-radius:9999px;padding:1px 4px;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:800;color:${textColor};">#${order}</span>
        </div>
      </div>
    `;
    return L.divIcon({
      html,
      className: 'uv-autopilot-stop-marker-supernova',
      iconSize: [snSize, snSize],
      iconAnchor: [snSize / 2, snSize / 2],
      popupAnchor: [0, -snSize / 2]
    });
  }

  const html = `
    <div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;">
      <span style="position:absolute;width:${size - 2}px;height:${size - 2}px;border-radius:9999px;background:${borderColor};opacity:${isSelected ? 0.35 : 0.18};"></span>
      <div style="position:relative;z-index:2;width:${size - 8}px;height:${size - 8}px;border-radius:9999px;background:${bgColor};border:2px solid ${borderColor};box-shadow:0 0 12px ${borderColor};display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:800;color:${textColor};">
        #${order}
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'uv-autopilot-stop-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
}

function createBackupOrCorridorIcon(isBackup: boolean, isSupernova: boolean = false): L.DivIcon {
  const color = isBackup ? '#F59E0B' : '#64748B';
  const label = isBackup ? 'BKP' : 'CHG';

  if (isSupernova) {
    const html = `
      <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:transparent;filter:drop-shadow(0 0 8px ${color});">
        <img src="/assets/aistudio/supernova_black.png" alt="Supernova" style="width:100%;height:100%;object-fit:contain;background:transparent;border:none;" />
      </div>
    `;
    return L.divIcon({
      html,
      className: 'uv-autopilot-backup-supernova-marker',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      popupAnchor: [0, -15]
    });
  }

  const html = `
    <div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
      <div style="padding:2px 5px;border-radius:4px;background:#090D16;border:1.5px dashed ${color};font-family:'JetBrains Mono',monospace;font-size:8px;font-weight:700;color:${color};">
        ${label}
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'uv-autopilot-backup-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -14]
  });
}

function createPitStopIcon(): L.DivIcon {
  const html = `
    <div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
      <div style="padding:2px 5px;border-radius:4px;background:#1E1B4B;border:1.5px solid #A78BFA;font-family:'JetBrains Mono',monospace;font-size:8px;font-weight:700;color:#DDD6FE;">
        PIT
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'uv-autopilot-pitstop-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -14]
  });
}

export const AutoPilotRouteMap: React.FC<AutoPilotRouteMapProps> = ({
  startLocation,
  destination,
  routePolyline,
  chargingStops,
  pitStops,
  eligibleCorridorChargers,
  activeStopId,
  mapPickMode,
  onChangeMapPickMode,
  onConfirmMapLocation,
  onSelectStop,
  onToggleReached,
  onToggleCharged,
  onRemoveStop
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const candidateMarkerRef = useRef<L.Marker | null>(null);

  const [candidatePin, setCandidatePin] = useState<MapPickedLocationCandidate | null>(null);

  const mapPickModeRef = useRef(mapPickMode);
  const startLocationRef = useRef(startLocation);
  const destinationRef = useRef(destination);
  useEffect(() => {
    mapPickModeRef.current = mapPickMode;
    startLocationRef.current = startLocation;
    destinationRef.current = destination;
  }, [mapPickMode, startLocation, destination]);

  const primaryStopIds = new Set(chargingStops.map(s => s.station.id));
  const backupMap = new Map<string, { primaryId: string; primaryName: string; reason: string }>();
  for (const stop of chargingStops) {
    for (const bkp of stop.backupChargers) {
      if (!backupMap.has(bkp.station.id)) {
        backupMap.set(bkp.station.id, {
          primaryId: stop.station.id,
          primaryName: stop.station.name,
          reason: bkp.reason
        });
      }
    }
  }

  const activeStopObj =
    chargingStops.find(s => s.station.id === activeStopId) || chargingStops[0] || null;

  // Resolve reverse-geocoded address for a map-picked or dragged coordinate
  const stageMapCandidate = async (target: 'start' | 'dest', rawLat: number, rawLon: number) => {
    const lat = Number(rawLat.toFixed(6));
    const lon = Number(rawLon.toFixed(6));
    const fallback = formatManualCoordinatesFallback(lat, lon);
    const localPinDesc = describeMapPinLocation(lat, lon);
    const offlineName =
      localPinDesc.distanceKm <= 15
        ? localPinDesc.nearestLandmark.name
        : fallback.name;
    const offlineAddr =
      localPinDesc.distanceKm <= 25
        ? localPinDesc.suggestedLocationLabel
        : fallback.address;

    setCandidatePin({
      target,
      latitude: lat,
      longitude: lon,
      name: offlineName,
      locality: localPinDesc.nearestLandmark.city || fallback.locality,
      address: offlineAddr,
      reverseGeocodeSuccess: localPinDesc.distanceKm <= 25,
      resolving: typeof navigator === 'undefined' || navigator.onLine
    });

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }

    try {
      const res = await fetch(`/api/places/reverse?lat=${lat}&lon=${lon}`);
      if (res.ok) {
        const data = await res.json();
        setCandidatePin(prev => {
          if (!prev || prev.latitude !== lat || prev.longitude !== lon) return prev;
          return {
            target: prev.target,
            latitude: lat,
            longitude: lon,
            name: data.name || offlineName,
            locality: data.locality || fallback.locality,
            address: data.address || offlineAddr,
            reverseGeocodeSuccess: Boolean(data.reverseGeocodeSuccess),
            resolving: false
          };
        });
      } else {
        setCandidatePin(prev => (prev ? { ...prev, resolving: false } : null));
      }
    } catch {
      setCandidatePin(prev => (prev ? { ...prev, resolving: false } : null));
    }
  };

  const stageMapCandidateRef = useRef(stageMapCandidate);
  stageMapCandidateRef.current = stageMapCandidate;

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [12.9716, 77.5946],
      zoom: 7,
      zoomControl: true,
      scrollWheelZoom: true,
      attributionControl: true
    });

    const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    });
    tileLayer.on('tileerror', (errEvent: any) => {
      if (errEvent?.tile) {
        const coords = errEvent.coords || { z: 0, x: 0, y: 0 };
        errEvent.tile.src = createTacticalOfflineTileDataUrl(coords.z, coords.x, coords.y);
      }
    });
    tileLayer.addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = layerGroup;

    map.on('click', (e: L.LeafletMouseEvent) => {
      const activeMode =
        mapPickModeRef.current ||
        (!startLocationRef.current ? 'start' : !destinationRef.current ? 'dest' : null);
      if (activeMode) {
        stageMapCandidateRef.current(activeMode, e.latlng.lat, e.latlng.lng);
      }
    });

    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Render candidate pin on map when staging a map-picked location
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (candidateMarkerRef.current) {
      candidateMarkerRef.current.remove();
      candidateMarkerRef.current = null;
    }

    if (candidatePin) {
      const marker = L.marker([candidatePin.latitude, candidatePin.longitude], {
        icon: createCandidatePinIcon(candidatePin.target),
        draggable: true,
        zIndexOffset: 1000
      });
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        stageMapCandidateRef.current(candidatePin.target, pos.lat, pos.lng);
      });
      marker.addTo(map);
      candidateMarkerRef.current = marker;
    }
  }, [candidatePin]);

  // Render route polyline & markers whenever route or stops change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    // 1. Route Polyline (only when both startLocation and destination are confirmed)
    if (startLocation && destination && routePolyline && routePolyline.length >= 2) {
      L.polyline(routePolyline, {
        color: '#FF5500',
        weight: 8,
        opacity: 0.24
      }).addTo(layerGroup);

      L.polyline(routePolyline, {
        color: '#FF5500',
        weight: 3.5,
        opacity: 0.95
      }).addTo(layerGroup);
    }

    // 2. Start Marker (Draggable to refine position)
    if (startLocation) {
      const m = L.marker([startLocation.latitude, startLocation.longitude], {
        icon: createEndpointIcon('start'),
        draggable: true
      });
      m.on('dragend', () => {
        const pos = m.getLatLng();
        stageMapCandidateRef.current('start', pos.lat, pos.lng);
      });
      m.bindPopup(
        `<div style="font-family:sans-serif;color:#0F172A;min-width:190px;">
          <div style="font-size:10px;font-weight:800;color:#059669;text-transform:uppercase;">STARTING POINT (KM 0.0)</div>
          <div style="font-size:13px;font-weight:700;margin-top:2px;">${startLocation.name}</div>
          <div style="font-size:11px;color:#475569;margin-top:2px;">${startLocation.address}</div>
          <div style="font-size:10px;font-family:monospace;color:#059669;margin-top:4px;">${startLocation.latitude.toFixed(5)}, ${startLocation.longitude.toFixed(5)} (Drag pin to refine)</div>
        </div>`
      );
      m.addTo(layerGroup);
    }

    // 3. Destination Marker (Draggable to refine position)
    if (destination) {
      const m = L.marker([destination.latitude, destination.longitude], {
        icon: createEndpointIcon('dest'),
        draggable: true
      });
      m.on('dragend', () => {
        const pos = m.getLatLng();
        stageMapCandidateRef.current('dest', pos.lat, pos.lng);
      });
      m.bindPopup(
        `<div style="font-family:sans-serif;color:#0F172A;min-width:190px;">
          <div style="font-size:10px;font-weight:800;color:#EA580C;text-transform:uppercase;">FINAL DESTINATION</div>
          <div style="font-size:13px;font-weight:700;margin-top:2px;">${destination.name}</div>
          <div style="font-size:11px;color:#475569;margin-top:2px;">${destination.address}</div>
          <div style="font-size:10px;font-family:monospace;color:#EA580C;margin-top:4px;">${destination.latitude.toFixed(5)}, ${destination.longitude.toFixed(5)} (Drag pin to refine)</div>
        </div>`
      );
      m.addTo(layerGroup);
    }

    // 4. Primary Charging Stops
    for (const stop of chargingStops) {
      const isSelected = activeStopId === stop.station.id;
      const isSupernova =
        stop.station.chargerType === 'Supernova' ||
        stop.station.isSupernova ||
        stop.station.chargerSource === 'Supernova';
      const m = L.marker([stop.station.latitude, stop.station.longitude], {
        icon: createPrimaryStopIcon(
          stop.order,
          stop.reached,
          stop.intelligence.hasRecentIssue,
          isSelected,
          isSupernova
        )
      });
      m.on('click', () => {
        onSelectStop(stop.station.id);
      });
      m.bindPopup(
        `<div style="font-family:sans-serif;color:#0F172A;min-width:210px;">
          <div style="font-size:10px;font-weight:800;color:#0284C7;text-transform:uppercase;">
            STOP #${stop.order} • KM ${stop.distanceFromStartKm} (+${stop.detourDistanceKm} km detour)
          </div>
          <div style="font-size:13px;font-weight:700;margin-top:2px;">${stop.station.name}</div>
          <div style="font-size:11px;color:#475569;margin-top:2px;">${stop.station.location}</div>
          <div style="font-size:11px;font-weight:700;color:#0F172A;margin-top:4px;">
            ${stop.station.chargerType || 'Supernova'} • ${stop.station.powerOutputKw} kW • ${stop.intelligence.confidenceLabel}
          </div>
        </div>`
      );
      m.addTo(layerGroup);
    }

    // 5. Secondary & Backup Chargers
    const secondaryChargers = eligibleCorridorChargers.filter(
      c => !primaryStopIds.has(c.station.id)
    );
    for (const cand of secondaryChargers) {
      const bkpInfo = backupMap.get(cand.station.id);
      const isBackup = Boolean(bkpInfo);
      const isSupernova =
        cand.station.chargerType === 'Supernova' ||
        cand.station.isSupernova ||
        cand.station.chargerSource === 'Supernova';
      const m = L.marker([cand.station.latitude, cand.station.longitude], {
        icon: createBackupOrCorridorIcon(isBackup, isSupernova)
      });
      m.bindPopup(
        `<div style="font-family:sans-serif;color:#0F172A;min-width:200px;">
          <div style="font-size:10px;font-weight:800;color:${isBackup ? '#D97706' : '#475569'};text-transform:uppercase;">
            ${isBackup ? 'BACKUP CHARGER' : 'CORRIDOR CHARGER'} • KM ${cand.alongRouteKm}
          </div>
          <div style="font-size:13px;font-weight:700;margin-top:2px;">${cand.station.name}</div>
          <div style="font-size:11px;color:#475569;margin-top:2px;">${cand.station.location}</div>
          <div style="font-size:11px;font-weight:600;margin-top:3px;">
            ${cand.station.chargerType || 'Supernova'} (${cand.station.powerOutputKw} kW)
          </div>
        </div>`
      );
      m.addTo(layerGroup);
    }

    // 6. Selected Pit Stops
    for (const pit of pitStops) {
      const m = L.marker([pit.latitude, pit.longitude], {
        icon: createPitStopIcon()
      });
      m.bindPopup(
        `<div style="font-family:sans-serif;color:#0F172A;min-width:190px;">
          <div style="font-size:10px;font-weight:800;color:#6D28D9;text-transform:uppercase;">
            PIT STOP • KM ${pit.distanceFromStartKm}
          </div>
          <div style="font-size:13px;font-weight:700;margin-top:2px;">${pit.name}</div>
          <div style="font-size:11px;color:#475569;margin-top:2px;">${pit.address}</div>
        </div>`
      );
      m.addTo(layerGroup);
    }
  }, [
    startLocation,
    destination,
    routePolyline,
    chargingStops,
    pitStops,
    eligibleCorridorChargers,
    activeStopId
  ]);

  // Fit bounds when route or endpoints change
  const handleFitRouteBounds = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (startLocation && destination && routePolyline && routePolyline.length >= 2) {
      const bounds = L.latLngBounds(routePolyline.map(p => [p[0], p[1]] as [number, number]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [44, 44], maxZoom: 12, animate: true });
      }
    } else if (startLocation && destination) {
      const bounds = L.latLngBounds([
        [startLocation.latitude, startLocation.longitude],
        [destination.latitude, destination.longitude]
      ]);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [44, 44], maxZoom: 12, animate: true });
      }
    } else if (startLocation) {
      map.setView([startLocation.latitude, startLocation.longitude], 11, { animate: true });
    } else if (destination) {
      map.setView([destination.latitude, destination.longitude], 11, { animate: true });
    }
  };

  useEffect(() => {
    handleFitRouteBounds();
  }, [
    startLocation?.latitude,
    startLocation?.longitude,
    destination?.latitude,
    destination?.longitude,
    routePolyline.length
  ]);

  const handlePlacePinAtMapCenter = (target: 'start' | 'dest') => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const c = map.getCenter();
    onChangeMapPickMode(target);
    stageMapCandidate(target, c.lat, c.lng);
  };

  return (
    <div className="relative rounded-xl border border-slate-800 bg-[#070A10] overflow-hidden shadow-2xl">
      {/* Top Tactical HUD Bar */}
      <div className="px-4 py-3 bg-[#0B0F18]/95 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Compass className="w-4 h-4 text-[#FF5500]" />
          <span className="font-mono text-xs uppercase tracking-widest text-white font-bold">
            AUTO PILOT CORRIDOR RADAR // OPENSTREETMAP
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-300">
          <button
            type="button"
            data-testid="map-pick-start-mode-btn"
            onClick={() =>
              onChangeMapPickMode(mapPickMode === 'start' ? null : 'start')
            }
            className={`px-2 py-1 rounded border flex items-center gap-1 transition-colors ${
              mapPickMode === 'start'
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
            }`}
            title="Click the OpenStreetMap radar to set Starting Location"
          >
            <Crosshair className="w-3 h-3 text-emerald-400" />
            <span>{mapPickMode === 'start' ? 'Click Map for Start...' : 'Set Start on Map'}</span>
          </button>

          <button
            type="button"
            data-testid="map-pick-dest-mode-btn"
            onClick={() =>
              onChangeMapPickMode(mapPickMode === 'dest' ? null : 'dest')
            }
            className={`px-2 py-1 rounded border flex items-center gap-1 transition-colors ${
              mapPickMode === 'dest'
                ? 'bg-[#FF5500]/20 border-[#FF5500] text-[#FF5500] font-bold'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
            }`}
            title="Click the OpenStreetMap radar to set Final Destination"
          >
            <Crosshair className="w-3 h-3 text-[#FF5500]" />
            <span>{mapPickMode === 'dest' ? 'Click Map for Dest...' : 'Set Dest on Map'}</span>
          </button>

          <button
            type="button"
            onClick={handleFitRouteBounds}
            className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3 text-[#FF5500]" />
            <span>Fit Route</span>
          </button>
        </div>
      </div>

      {/* Active Map Pick Instruction Banner */}
      {mapPickMode && !candidatePin && (
        <div className="px-4 py-2 bg-slate-900/95 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-2 text-slate-200">
            <MapPin
              className={`w-3.5 h-3.5 ${
                mapPickMode === 'start' ? 'text-emerald-400' : 'text-[#FF5500]'
              }`}
            />
            <span>
              Click anywhere on the OpenStreetMap below to place your{' '}
              <strong className={mapPickMode === 'start' ? 'text-emerald-400' : 'text-[#FF5500]'}>
                {mapPickMode === 'start' ? 'STARTING LOCATION' : 'FINAL DESTINATION'}
              </strong>{' '}
              marker, or drop a pin at the map center:
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="drop-pin-map-center-btn"
              onClick={() => handlePlacePinAtMapCenter(mapPickMode)}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-[11px] font-bold"
            >
              Drop Pin at Map Center
            </button>
            <button
              type="button"
              onClick={() => onChangeMapPickMode(null)}
              className="text-slate-400 hover:text-white p-1"
              aria-label="Cancel map selection mode"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Candidate Map Pin Confirmation Banner */}
      {candidatePin && (
        <div
          data-testid="map-candidate-confirmation-bar"
          className="px-4 py-3 bg-[#0D1322] border-b border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
              <span
                className={`px-2 py-0.5 rounded font-bold uppercase ${
                  candidatePin.target === 'start'
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                    : 'bg-[#FF5500]/20 border border-[#FF5500]/40 text-[#FF5500]'
                }`}
              >
                MAP PIN: {candidatePin.target === 'start' ? 'STARTING LOCATION' : 'FINAL DESTINATION'}
              </span>
              <span
                data-testid="map-candidate-coords"
                className="text-cyan-300 font-bold"
              >
                {candidatePin.latitude.toFixed(6)}, {candidatePin.longitude.toFixed(6)}
              </span>
              {candidatePin.resolving && (
                <span className="text-slate-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Resolving address...
                </span>
              )}
            </div>
            <div className="text-xs font-bold text-white truncate">{candidatePin.name}</div>
            <div className="text-[11px] text-slate-300 line-clamp-1">{candidatePin.address}</div>
            <div className="text-[10px] text-slate-400 font-mono">
              Drag the pin on the map to refine its position, then press Confirm Location.
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="confirm-map-location-btn"
              onClick={() => {
                onConfirmMapLocation(candidatePin.target, {
                  name: candidatePin.name,
                  locality: candidatePin.locality,
                  address: candidatePin.address,
                  latitude: candidatePin.latitude,
                  longitude: candidatePin.longitude
                });
                setCandidatePin(null);
                onChangeMapPickMode(null);
              }}
              className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono text-xs uppercase font-bold flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Confirm Location</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCandidatePin(null);
                onChangeMapPickMode(null);
              }}
              className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div
        ref={mapContainerRef}
        data-testid="autopilot-route-map"
        className={`h-[420px] sm:h-[460px] w-full z-0 bg-[#06090F] [&_.leaflet-tile-pane]:invert [&_.leaflet-tile-pane]:hue-rotate-180 [&_.leaflet-tile-pane]:brightness-90 [&_.leaflet-tile-pane]:contrast-110 ${
          mapPickMode ? 'cursor-crosshair' : ''
        }`}
      />

      {/* Legend Bar */}
      <div className="px-4 py-2 bg-[#090D16] border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            START (DRAGGABLE)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00E5FF] inline-block" />
            PRIMARY STOP ({chargingStops.length})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            BACKUP ({backupMap.size})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-400 inline-block" />
            PIT STOP ({pitStops.length})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5500] inline-block" />
            DESTINATION (DRAGGABLE)
          </span>
        </div>
        <span>Click map or drag START / DEST markers to set custom coordinates</span>
      </div>

      {/* Interactive Selected Stop Quick-Action Bar Beneath Map */}
      {activeStopObj && (
        <div className="px-4 py-3 bg-[#0B0F18] border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-bold">
                SELECTED STOP #{activeStopObj.order} • KM {activeStopObj.distanceFromStartKm}
              </span>
              <span className="text-slate-400">
                +{activeStopObj.detourDistanceKm} km detour •{' '}
                {activeStopObj.station.chargerType || 'Supernova'} (
                {activeStopObj.station.powerOutputKw} kW)
              </span>
            </div>
            <div className="text-xs font-bold text-white truncate mt-1">
              {activeStopObj.station.name} —{' '}
              <span className="text-slate-400 font-normal">{activeStopObj.station.location}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onToggleReached(activeStopObj.station.id)}
              className={`px-2.5 py-1.5 rounded text-[10px] font-mono uppercase font-bold border flex items-center gap-1 ${
                activeStopObj.reached
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              {activeStopObj.reached ? 'Reached' : 'Mark Reached'}
            </button>
            <button
              type="button"
              onClick={() => onToggleCharged(activeStopObj.station.id)}
              className={`px-2.5 py-1.5 rounded text-[10px] font-mono uppercase font-bold border flex items-center gap-1 ${
                activeStopObj.chargingConfirmed
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300'
              }`}
            >
              <Zap className="w-3 h-3" />
              {activeStopObj.chargingConfirmed ? 'Charged' : 'Confirm Charge'}
            </button>
            <a
              href={buildChargerNavigationUrl(activeStopObj.station)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded bg-[#FF5500] hover:bg-[#FF5500]/90 text-white font-mono text-[10px] uppercase font-bold flex items-center gap-1 no-underline"
            >
              <Navigation className="w-3 h-3" />
              Navigate
            </a>
            <button
              type="button"
              onClick={() => onRemoveStop(activeStopObj.station.id)}
              className="p-1.5 rounded bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-red-300"
              title="Remove Stop"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
