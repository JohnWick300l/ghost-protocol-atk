import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Search,
  Navigation,
  ExternalLink,
  Trash2,
  Route,
  LocateFixed
} from 'lucide-react';
import { useAudio } from '../context/AudioContext';
import {
  searchAndRankPlaces,
  resolveTrueWaypointCoordinates,
  extractCoordinatesFromGoogleMapsUrl,
  extractQueryTextFromGoogleMapsUrl,
  buildGoogleMapsUrl as rulesBuildGoogleMapsUrl,
  openInGoogleMaps as rulesOpenInGoogleMaps,
  buildMasterRouteGoogleMapsUrl as rulesBuildMasterRouteGoogleMapsUrl,
  type PlaceSuggestion
} from '../utils/rules';
import {
  INDIA_TOWN_PLACE_SUGGESTIONS,
  fetchLiveIndiaPlaces
} from '../utils/indiaLocations';

export interface RouteWaypoint {
  id: string;
  type: 'meeting' | 'destination' | 'break' | 'charging';
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  notes?: string;
  chargerType?: string;
  googleMapsUrl?: string;
}

export interface MissionRouteMapProps {
  mode?: 'view' | 'edit';
  meetingPoint?: {
    name: string;
    address?: string;
    lat?: number;
    lng?: number;
    googleMapsUrl?: string;
  };
  destination?: {
    name: string;
    address?: string;
    lat?: number;
    lng?: number;
    googleMapsUrl?: string;
  };
  stops?: {
    id: string;
    name: string;
    address?: string;
    lat?: number;
    lng?: number;
    notes?: string;
    googleMapsUrl?: string;
  }[];
  chargingStops?: {
    id?: string;
    locationName: string;
    chargerType: string;
    lat?: number;
    lng?: number;
    notes?: string;
    googleMapsUrl?: string;
  }[];
  routeGmapsUrl?: string;
  onSelectMeetingPoint?: (point: { name: string; address?: string; lat: number; lng: number; googleMapsUrl?: string }) => void;
  onSelectDestination?: (point: { name: string; address?: string; lat: number; lng: number; googleMapsUrl?: string }) => void;
  onAddStop?: (stop: { id: string; name: string; address?: string; lat: number; lng: number; notes?: string; googleMapsUrl?: string }) => void;
  onRemoveStop?: (id: string) => void;
  onAddChargingStop?: (charger: { locationName: string; chargerType: string; lat: number; lng: number; notes?: string; googleMapsUrl?: string }) => void;
  onRemoveChargingStop?: (idx: number) => void;
}

export function buildGoogleMapsUrl(lat?: number, lng?: number, queryName?: string): string {
  return rulesBuildGoogleMapsUrl(lat, lng, queryName);
}

export function openInGoogleMaps(customUrl?: string, lat?: number, lng?: number, queryName?: string) {
  return rulesOpenInGoogleMaps(customUrl, lat, lng, queryName);
}

export function buildMasterRouteGoogleMapsUrl(params: {
  meetingPoint?: { name: string; lat?: number; lng?: number; googleMapsUrl?: string };
  destination?: { name: string; lat?: number; lng?: number; googleMapsUrl?: string };
  stops?: { name: string; lat?: number; lng?: number; googleMapsUrl?: string }[];
  chargingStops?: { locationName: string; lat?: number; lng?: number; googleMapsUrl?: string }[];
  customRouteUrl?: string;
}): string {
  return rulesBuildMasterRouteGoogleMapsUrl(params, INDIA_TOWN_PLACE_SUGGESTIONS);
}

export const MissionRouteMap: React.FC<MissionRouteMapProps> = ({
  mode = 'view',
  meetingPoint,
  destination,
  stops = [],
  chargingStops = [],
  routeGmapsUrl,
  onSelectMeetingPoint,
  onSelectDestination,
  onAddStop,
  onRemoveStop,
  onAddChargingStop,
  onRemoveChargingStop
}) => {
  const { playTacticalClick } = useAudio();
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Search & Geocoding State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Cache for live-geocoded waypoint names that were saved without explicit coordinates
  const [geocodedCache, setGeocodedCache] = useState<Record<string, { latitude: number; longitude: number }>>({});

  // Separate pin coordinates from editable pin name so typing does not jitter the map
  const [activePinCoords, setActivePinCoords] = useState<{
    lat: number;
    lng: number;
    address?: string;
  } | null>(null);
  const [activePinName, setActivePinName] = useState('');

  const [stopNoteInput, setStopNoteInput] = useState('');
  const [chargerTypeInput, setChargerTypeInput] = useState<'Supernova' | 'Type 6' | 'Type 2' | 'Socket'>('Supernova');
  const [customGmapsUrlInput, setCustomGmapsUrlInput] = useState('');

  // Resolve any un-cached waypoint names via live geocoding if not found in local dictionaries
  useEffect(() => {
    const itemsToResolve: { key: string; query: string }[] = [];

    const checkCandidate = (rawObj: any) => {
      if (!rawObj) return;
      const name = String(rawObj.name || rawObj.locationName || rawObj.title || '').trim();
      if (!name) return;
      const resolved = resolveTrueWaypointCoordinates(rawObj, INDIA_TOWN_PLACE_SUGGESTIONS);
      if (!resolved) {
        const key = name.toLowerCase();
        if (!geocodedCache[key]) {
          const urlQuery = extractQueryTextFromGoogleMapsUrl(rawObj.googleMapsUrl);
          itemsToResolve.push({ key, query: urlQuery || name });
        }
      }
    };

    checkCandidate(meetingPoint);
    checkCandidate(destination);
    if (Array.isArray(stops)) stops.forEach(checkCandidate);
    if (Array.isArray(chargingStops)) chargingStops.forEach(checkCandidate);

    if (itemsToResolve.length === 0) return;

    let cancelled = false;
    (async () => {
      const updates: Record<string, { latitude: number; longitude: number }> = {};
      for (const item of itemsToResolve) {
        try {
          const live = await fetchLiveIndiaPlaces(item.query);
          if (live.length > 0 && Number.isFinite(live[0].latitude) && Number.isFinite(live[0].longitude)) {
            updates[item.key] = {
              latitude: live[0].latitude,
              longitude: live[0].longitude
            };
          }
        } catch {
          // ignore network error
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setGeocodedCache(prev => ({ ...prev, ...updates }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [meetingPoint, destination, stops, chargingStops, geocodedCache]);

  // Collect all valid waypoints with TRUE coordinates (never fake Nandi Hills fallback)
  const allWaypoints: RouteWaypoint[] = useMemo(() => {
    const list: RouteWaypoint[] = [];

    const resolveCoords = (rawObj: any, fallbackIfMeeting?: { latitude: number; longitude: number }) => {
      const direct = resolveTrueWaypointCoordinates(rawObj, INDIA_TOWN_PLACE_SUGGESTIONS);
      if (direct) return direct;
      const nameKey = String(rawObj?.name || rawObj?.locationName || rawObj?.title || '').trim().toLowerCase();
      if (nameKey && geocodedCache[nameKey]) {
        return geocodedCache[nameKey];
      }
      return fallbackIfMeeting || null;
    };

    if (meetingPoint && meetingPoint.name) {
      const coords = resolveCoords(meetingPoint, { latitude: 12.9719, longitude: 77.6412 });
      if (coords) {
        list.push({
          id: 'meeting_point',
          type: 'meeting',
          name: meetingPoint.name,
          address: meetingPoint.address,
          latitude: coords.latitude,
          longitude: coords.longitude,
          googleMapsUrl:
            meetingPoint.googleMapsUrl ||
            buildGoogleMapsUrl(coords.latitude, coords.longitude, meetingPoint.name)
        });
      }
    }

    if (Array.isArray(stops)) {
      stops.forEach((s: any, idx) => {
        const sName = s.name || s.locationName || s.title;
        if (sName) {
          const coords = resolveCoords(s);
          if (coords) {
            list.push({
              id: s.id || `stop_${idx}`,
              type: 'break',
              name: sName,
              address: s.address,
              latitude: coords.latitude,
              longitude: coords.longitude,
              notes: s.notes,
              googleMapsUrl:
                s.googleMapsUrl || buildGoogleMapsUrl(coords.latitude, coords.longitude, sName)
            });
          }
        }
      });
    }

    if (Array.isArray(chargingStops)) {
      chargingStops.forEach((c: any, idx) => {
        const cName = c.locationName || c.name || c.location;
        if (cName) {
          const coords = resolveCoords(c);
          if (coords) {
            list.push({
              id: c.id || `charge_${idx}`,
              type: 'charging',
              name: cName,
              address: c.location || c.address,
              latitude: coords.latitude,
              longitude: coords.longitude,
              chargerType: c.chargerType || 'Fast Charger',
              notes: c.notes,
              googleMapsUrl:
                c.googleMapsUrl || buildGoogleMapsUrl(coords.latitude, coords.longitude, cName)
            });
          }
        }
      });
    }

    if (destination && destination.name) {
      const coords = resolveCoords(destination);
      if (coords) {
        list.push({
          id: 'destination_point',
          type: 'destination',
          name: destination.name,
          address: destination.address,
          latitude: coords.latitude,
          longitude: coords.longitude,
          googleMapsUrl:
            destination.googleMapsUrl ||
            buildGoogleMapsUrl(coords.latitude, coords.longitude, destination.name)
        });
      }
    }

    return list;
  }, [meetingPoint, destination, stops, chargingStops, geocodedCache]);

  // Live Location Search Handler (Supports Google Maps URLs, Coordinates, Nominatim + All-India Directory)
  const handlePerformSearch = async (query: string) => {
    const trimmed = query.trim();
    setSearchQuery(query);
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }

    // Check if the user pasted a Google Maps URL or raw lat,lng coordinates directly into search
    const urlCoords = extractCoordinatesFromGoogleMapsUrl(trimmed);
    const urlQueryName = extractQueryTextFromGoogleMapsUrl(trimmed);
    if (urlCoords) {
      const displayLabel =
        urlQueryName || `Pinned Location (${urlCoords.latitude.toFixed(4)}, ${urlCoords.longitude.toFixed(4)})`;
      const directSuggestion: PlaceSuggestion = {
        id: `gmaps_pin_${urlCoords.latitude}_${urlCoords.longitude}`,
        name: displayLabel,
        locality: `${urlCoords.latitude.toFixed(5)}°N, ${urlCoords.longitude.toFixed(5)}°E`,
        address: trimmed.startsWith('http') ? 'Extracted from Google Maps Link' : 'Direct GPS Coordinates',
        category: 'Google Maps Pin',
        latitude: urlCoords.latitude,
        longitude: urlCoords.longitude
      };
      setSearchResults([directSuggestion]);
      return;
    }

    const effectiveQuery = urlQueryName || trimmed;
    const immediateLocal = searchAndRankPlaces(effectiveQuery, INDIA_TOWN_PLACE_SUGGESTIONS);
    setSearchResults(immediateLocal);

    setIsSearching(true);
    try {
      const liveResults = await fetchLiveIndiaPlaces(effectiveQuery);
      const combined = searchAndRankPlaces(
        effectiveQuery,
        [...liveResults, ...INDIA_TOWN_PLACE_SUGGESTIONS]
      );
      setSearchResults(combined);
    } catch {
      setSearchResults(immediateLocal);
    } finally {
      setIsSearching(false);
    }
  };

  // Select search item
  const handleSelectSearchResult = (item: PlaceSuggestion) => {
    playTacticalClick();
    setActivePinName(item.name);
    setActivePinCoords({
      lat: item.latitude,
      lng: item.longitude,
      address: item.address || item.locality
    });
    setCustomGmapsUrlInput(buildGoogleMapsUrl(item.latitude, item.longitude, item.name));
    setSearchResults([]);
  };

  // Handle Google Maps URL input change (automatically sync pin if URL embeds coordinates)
  const handleCustomGmapsUrlChange = (rawUrl: string) => {
    setCustomGmapsUrlInput(rawUrl);
    const extracted = extractCoordinatesFromGoogleMapsUrl(rawUrl);
    if (extracted) {
      setActivePinCoords(prev => ({
        lat: extracted.latitude,
        lng: extracted.longitude,
        address: prev?.address || `Pinned coordinates ${extracted.latitude.toFixed(5)}°N, ${extracted.longitude.toFixed(5)}°E`
      }));
      const extractedName = extractQueryTextFromGoogleMapsUrl(rawUrl);
      if (extractedName && (!activePinName || activePinName.startsWith('Waypoint Pin'))) {
        setActivePinName(extractedName);
      }
    }
  };

  // Focus map on a specific waypoint
  const handleFocusWaypointOnMap = (wp: RouteWaypoint) => {
    playTacticalClick();
    if (mapRef.current) {
      mapRef.current.stop();
      mapRef.current.invalidateSize({ pan: false });
      mapRef.current.setView([wp.latitude, wp.longitude], 14, { animate: false });
    }
  };

  // Initialize Leaflet Map once & attach ResizeObserver so container layout changes never shift pins
  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;

    const initialCenter: [number, number] =
      allWaypoints.length > 0
        ? [allWaypoints[0].latitude, allWaypoints[0].longitude]
        : [12.9719, 77.6412];

    const map = L.map(mapElRef.current, {
      center: initialCenter,
      zoom: allWaypoints.length > 1 ? 9 : 11,
      minZoom: 4,
      maxZoom: 18,
      zoomControl: true,
      attributionControl: false
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    const lg = L.layerGroup().addTo(map);
    layerGroupRef.current = lg;
    mapRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (modeRef.current !== 'edit') return;
      playTacticalClick();
      const { lat, lng } = e.latlng;
      const latFixed = lat.toFixed(5);
      const lngFixed = lng.toFixed(5);

      setActivePinName(`Waypoint Pin (${latFixed}, ${lngFixed})`);
      setActivePinCoords({
        lat,
        lng,
        address: `Pinned coordinates ${latFixed}°N, ${lngFixed}°E`
      });
      setCustomGmapsUrlInput(buildGoogleMapsUrl(lat, lng));
    });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapElRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize({ pan: false });
        }
      });
      resizeObserver.observe(mapElRef.current);
    }

    const timer = setTimeout(() => {
      map.invalidateSize({ pan: false });
    }, 150);

    return () => {
      clearTimeout(timer);
      if (resizeObserver) resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Render Markers, Polyline & Synchronize Camera Bounds without animation race conditions
  useEffect(() => {
    if (!layerGroupRef.current || !mapRef.current) return;

    const map = mapRef.current;
    const lg = layerGroupRef.current;

    // Stop any in-flight pan/zoom and sync container size before placing pins
    map.stop();
    map.invalidateSize({ pan: false });
    lg.clearLayers();

    const routePoints: [number, number][] = [];

    allWaypoints.forEach(wp => {
      if (!Number.isFinite(wp.latitude) || !Number.isFinite(wp.longitude)) return;
      routePoints.push([wp.latitude, wp.longitude]);

      let badgeBg = '#38BDF8';
      let badgeIcon = '📍';
      let typeLabel = 'MEETING POINT';

      if (wp.type === 'destination') {
        badgeBg = '#10B981';
        badgeIcon = '🏁';
        typeLabel = 'DESTINATION';
      } else if (wp.type === 'break') {
        badgeBg = '#F59E0B';
        badgeIcon = '☕';
        typeLabel = 'STOP / BREAK';
      } else if (wp.type === 'charging') {
        badgeBg = '#8B5CF6';
        badgeIcon = '⚡';
        typeLabel = 'CHARGING STOP';
      }

      const customIcon = L.divIcon({
        html: `
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: 9999px;
            background: ${badgeBg};
            border: 2.5px solid #08090B;
            color: #08090B;
            font-family: 'JetBrains Mono', monospace;
            font-weight: 800;
            font-size: 15px;
            box-shadow: 0 0 18px ${badgeBg}99;
            cursor: pointer;
          " title="${typeLabel}: ${wp.name} (${wp.latitude.toFixed(4)}, ${wp.longitude.toFixed(4)})">
            <span>${badgeIcon}</span>
          </div>
        `,
        className: 'mission-route-pin',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      const marker = L.marker([wp.latitude, wp.longitude], { icon: customIcon });

      const popupHtml = `
        <div style="color: #F8FAFC; background: #050811; padding: 10px; border-radius: 8px; font-family: sans-serif; max-width: 240px;">
          <div style="color: ${badgeBg}; font-size: 10px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">${typeLabel}</div>
          <div style="font-size: 13px; font-weight: bold; margin-top: 2px;">${wp.name}</div>
          <div style="font-size: 10px; color: #38BDF8; font-family: monospace; margin-top: 2px;">${wp.latitude.toFixed(5)}°N, ${wp.longitude.toFixed(5)}°E</div>
          ${wp.address ? `<div style="font-size: 11px; color: #94A3B8; margin-top: 4px;">${wp.address}</div>` : ''}
          ${wp.notes ? `<div style="font-size: 11px; color: #FDE68A; margin-top: 4px; background: rgba(245,158,11,0.15); padding: 4px; border-radius: 4px;">${wp.notes}</div>` : ''}
          <div style="margin-top: 8px;">
            <a href="${wp.googleMapsUrl || buildGoogleMapsUrl(wp.latitude, wp.longitude, wp.name)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: #38BDF8; color: #08090B; font-size: 10px; font-weight: bold; text-decoration: none; padding: 4px 8px; border-radius: 4px; text-transform: uppercase;">
              Open in Google Maps ↗
            </a>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { className: 'ghost-map-popup' });
      lg.addLayer(marker);
    });

    // Draw route polyline connecting Meeting -> Stops/Chargers -> Destination
    if (routePoints.length >= 2) {
      const polyline = L.polyline(routePoints, {
        color: '#38BDF8',
        weight: 4,
        opacity: 0.85,
        dashArray: '8, 8'
      });
      lg.addLayer(polyline);
    }

    // Active selected temporary pin
    if (activePinCoords && Number.isFinite(activePinCoords.lat) && Number.isFinite(activePinCoords.lng)) {
      const activeIcon = L.divIcon({
        html: `
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            border-radius: 9999px;
            background: #EF4444;
            border: 3px solid #FFFFFF;
            color: #FFFFFF;
            font-weight: 900;
            font-size: 18px;
            box-shadow: 0 0 24px rgba(239, 68, 68, 0.9);
          ">
            <span>🎯</span>
          </div>
        `,
        className: 'mission-active-target-pin',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });
      const activeMarker = L.marker([activePinCoords.lat, activePinCoords.lng], { icon: activeIcon });
      lg.addLayer(activeMarker);

      map.setView([activePinCoords.lat, activePinCoords.lng], 13, { animate: false });
    } else if (routePoints.length >= 2) {
      const bounds = L.latLngBounds(routePoints);
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14, animate: false });
    } else if (routePoints.length === 1) {
      map.setView(routePoints[0], 13, { animate: false });
    }
  }, [allWaypoints, activePinCoords]);

  const masterGmapsUrl = useMemo(
    () =>
      buildMasterRouteGoogleMapsUrl({
        meetingPoint,
        destination,
        stops,
        chargingStops,
        customRouteUrl: routeGmapsUrl
      }),
    [meetingPoint, destination, stops, chargingStops, routeGmapsUrl]
  );

  return (
    <div className="space-y-4">
      {/* Search Bar & Edit Controls Header (For Edit / Create Mode) */}
      {mode === 'edit' && (
        <div className="bg-[#050811] border border-[#1E2D42] rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-sans font-bold text-xs sm:text-sm text-[#F8FAFC] uppercase tracking-wider flex items-center gap-2 break-words">
              <Search className="w-4 h-4 text-[#38BDF8] shrink-0" />
              <span>SEARCH WAYPOINT OR PASTE GOOGLE MAPS LINK</span>
            </h3>
            <span className="font-mono text-[10px] text-[#38BDF8] shrink-0">ALL INDIA PLACES & GMAPS</span>
          </div>

          {/* Search Input Box */}
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => handlePerformSearch(e.target.value)}
                  placeholder="Search Kolar, Hoskote, Nandi Hills, Munnar, Coorg, or paste Google Maps URL..."
                  className="w-full bg-[#080D1A] border border-[#1E2D42] rounded-lg pl-9 pr-8 py-2 text-xs sm:text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#38BDF8] font-mono"
                />
                <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
                {isSearching && (
                  <div className="w-3.5 h-3.5 border-2 border-[#38BDF8] border-t-transparent rounded-full animate-spin absolute right-3 top-3" />
                )}
              </div>
            </div>

            {/* Search Dropdown Results */}
            {searchResults.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-[#050811] border border-[#1E2D42] rounded-xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-[#131C2B]">
                {searchResults.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectSearchResult(item)}
                    className="w-full text-left p-3 hover:bg-[#0F172A] transition-colors flex items-start gap-2.5 text-xs text-[#CBD5E1]"
                  >
                    <MapPin className="w-4 h-4 text-[#38BDF8] shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-[#F8FAFC]">{item.name}</div>
                      <div className="text-[11px] text-[#94A3B8] font-mono">{item.address || item.locality}</div>
                      <div className="text-[10px] text-[#38BDF8] font-mono mt-0.5 uppercase">
                        {item.category} • {item.latitude.toFixed(4)}°N, {item.longitude.toFixed(4)}°E
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Active Pin Target Setter Modal / Bar */}
          {activePinCoords && (
            <div className="p-3.5 rounded-xl bg-[#0A1224] border border-[#38BDF8]/40 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-ping" />
                  <div>
                    <div className="font-bold text-xs text-[#F8FAFC]">{activePinName || 'Selected Waypoint'}</div>
                    <div className="text-[10px] font-mono text-[#94A3B8]">
                      {activePinCoords.lat.toFixed(5)}°N, {activePinCoords.lng.toFixed(5)}°E
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActivePinCoords(null);
                    setActivePinName('');
                  }}
                  className="text-[10px] font-mono text-[#64748B] hover:text-[#CBD5E1]"
                >
                  Clear Pin
                </button>
              </div>

              {/* Editable Name & Address */}
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-[#94A3B8] mb-1">
                    Waypoint Name *
                  </label>
                  <input
                    type="text"
                    value={activePinName}
                    onChange={e => setActivePinName(e.target.value)}
                    className="w-full bg-[#050811] border border-[#1E2D42] rounded px-2.5 py-1.5 text-xs text-[#F8FAFC] font-sans focus:outline-none focus:border-[#38BDF8]"
                    placeholder="e.g. Hoskote Toll Plaza / CCD Kolar Highway"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-[#F59E0B] mb-1">
                      Stop Note / Details (For Breaks)
                    </label>
                    <input
                      type="text"
                      value={stopNoteInput}
                      onChange={e => setStopNoteInput(e.target.value)}
                      placeholder="e.g. Regroup & coffee break (20 mins)"
                      className="w-full bg-[#050811] border border-[#1E2D42] rounded px-2.5 py-1.5 text-xs text-[#F8FAFC] font-sans focus:outline-none focus:border-[#F59E0B]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-[#C084FC] mb-1">
                      Charger Type (For Charging Hubs)
                    </label>
                    <select
                      value={chargerTypeInput}
                      onChange={e => setChargerTypeInput(e.target.value as any)}
                      className="w-full bg-[#050811] border border-[#1E2D42] rounded px-2.5 py-1.5 text-xs text-[#F8FAFC] font-sans focus:outline-none focus:border-[#8B5CF6]"
                    >
                      <option value="Supernova">UV Supernova Fast DC 30kW</option>
                      <option value="Type 6">IEC Type 6 DC Fast</option>
                      <option value="Type 2">Type 2 AC (7.4kW / 11kW)</option>
                      <option value="Socket">15A 3-Pin Industrial Socket</option>
                    </select>
                  </div>
                </div>

                {/* Paste Custom Google Maps Link for Waypoint */}
                <div>
                  <label className="block text-[10px] font-mono uppercase text-[#94A3B8] mb-1">
                    Google Maps URL for this Waypoint
                  </label>
                  <input
                    type="url"
                    value={customGmapsUrlInput}
                    onChange={e => handleCustomGmapsUrlChange(e.target.value)}
                    placeholder="https://www.google.com/maps/search/?api=1&query=..."
                    className="w-full bg-[#050811] border border-[#1E2D42] rounded px-2.5 py-1.5 text-xs text-[#F8FAFC] font-mono focus:outline-none focus:border-[#38BDF8]"
                  />
                </div>
              </div>

              {/* Waypoint Assignment Action Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {onSelectMeetingPoint && (
                  <button
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      const finalName = activePinName.trim() || 'Meeting Point';
                      onSelectMeetingPoint({
                        name: finalName,
                        address: activePinCoords.address,
                        lat: activePinCoords.lat,
                        lng: activePinCoords.lng,
                        googleMapsUrl:
                          customGmapsUrlInput.trim() ||
                          buildGoogleMapsUrl(activePinCoords.lat, activePinCoords.lng, finalName)
                      });
                      setActivePinCoords(null);
                      setActivePinName('');
                      setSearchQuery('');
                    }}
                    className="flex items-center justify-center gap-1.5 p-2 rounded bg-[#38BDF8]/20 hover:bg-[#38BDF8]/30 text-[#38BDF8] border border-[#38BDF8]/40 font-mono font-bold text-[11px] uppercase transition-all"
                  >
                    <span>📍</span>
                    <span>Set Meeting</span>
                  </button>
                )}

                {onSelectDestination && (
                  <button
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      const finalName = activePinName.trim() || 'Destination';
                      onSelectDestination({
                        name: finalName,
                        address: activePinCoords.address,
                        lat: activePinCoords.lat,
                        lng: activePinCoords.lng,
                        googleMapsUrl:
                          customGmapsUrlInput.trim() ||
                          buildGoogleMapsUrl(activePinCoords.lat, activePinCoords.lng, finalName)
                      });
                      setActivePinCoords(null);
                      setActivePinName('');
                      setSearchQuery('');
                    }}
                    className="flex items-center justify-center gap-1.5 p-2 rounded bg-[#10B981]/20 hover:bg-[#10B981]/30 text-[#10B981] border border-[#10B981]/40 font-mono font-bold text-[11px] uppercase transition-all"
                  >
                    <span>🏁</span>
                    <span>Set Destination</span>
                  </button>
                )}

                {onAddStop && (
                  <button
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      const finalName = activePinName.trim() || 'Rest / Break Stop';
                      onAddStop({
                        id: `stop_${Date.now()}`,
                        name: finalName,
                        address: activePinCoords.address,
                        lat: activePinCoords.lat,
                        lng: activePinCoords.lng,
                        notes: stopNoteInput || 'Rest / Coffee Stop',
                        googleMapsUrl:
                          customGmapsUrlInput.trim() ||
                          buildGoogleMapsUrl(activePinCoords.lat, activePinCoords.lng, finalName)
                      });
                      setActivePinCoords(null);
                      setActivePinName('');
                      setStopNoteInput('');
                      setSearchQuery('');
                    }}
                    className="flex items-center justify-center gap-1.5 p-2 rounded bg-[#F59E0B]/20 hover:bg-[#F59E0B]/30 text-[#F59E0B] border border-[#F59E0B]/40 font-mono font-bold text-[11px] uppercase transition-all"
                  >
                    <span>☕</span>
                    <span>Add Stop</span>
                  </button>
                )}

                {onAddChargingStop && (
                  <button
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      const finalName = activePinName.trim() || 'EV Charging Hub';
                      onAddChargingStop({
                        locationName: finalName,
                        chargerType: chargerTypeInput,
                        lat: activePinCoords.lat,
                        lng: activePinCoords.lng,
                        notes: stopNoteInput || 'Intermediate Charging Stop',
                        googleMapsUrl:
                          customGmapsUrlInput.trim() ||
                          buildGoogleMapsUrl(activePinCoords.lat, activePinCoords.lng, finalName)
                      });
                      setActivePinCoords(null);
                      setActivePinName('');
                      setStopNoteInput('');
                      setSearchQuery('');
                    }}
                    className="flex items-center justify-center gap-1.5 p-2 rounded bg-[#8B5CF6]/20 hover:bg-[#8B5CF6]/30 text-[#C084FC] border border-[#8B5CF6]/40 font-mono font-bold text-[11px] uppercase transition-all"
                  >
                    <span>⚡</span>
                    <span>Add Charger</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Interactive Map Canvas */}
      <div className="relative rounded-xl overflow-hidden border border-[#1E2D42] shadow-2xl bg-[#03060D]">
        <div ref={mapElRef} className="w-full h-80 sm:h-96 z-10" />

        {/* Fit All Pins & Master Route GMaps Quick Launch Buttons */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          {allWaypoints.length > 0 && (
            <button
              type="button"
              onClick={() => {
                playTacticalClick();
                if (!mapRef.current) return;
                mapRef.current.stop();
                mapRef.current.invalidateSize({ pan: false });
                const pts = allWaypoints.map(w => [w.latitude, w.longitude] as [number, number]);
                if (pts.length >= 2) {
                  mapRef.current.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 14, animate: false });
                } else if (pts.length === 1) {
                  mapRef.current.setView(pts[0], 13, { animate: false });
                }
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#050811]/90 hover:bg-[#0F172A] text-[#38BDF8] border border-[#38BDF8]/40 font-mono font-bold text-[11px] uppercase shadow-xl transition-all"
              title="Fit all route pins on map"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              <span>FIT ALL PINS</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => openInGoogleMaps(masterGmapsUrl)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#38BDF8] hover:bg-[#0284C7] text-[#03060D] font-sans font-bold text-xs uppercase shadow-xl tracking-wider transition-all"
          >
            <Navigation className="w-3.5 h-3.5 fill-current" />
            <span>OPEN FULL ROUTE IN GMAPS ↗</span>
          </button>
        </div>
      </div>

      {/* Waypoint Chips & Links Summary */}
      <div className="bg-[#050811] border border-[#1E2D42] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-[#131C2B] pb-2">
          <span className="font-sans font-bold text-xs uppercase tracking-wider text-[#F8FAFC] flex items-center gap-2">
            <Route className="w-4 h-4 text-[#38BDF8]" />
            <span>RIDE WAYPOINTS & GOOGLE MAPS DIRECT LINKS</span>
          </span>
          <span className="font-mono text-[10px] text-[#38BDF8]">{allWaypoints.length} WAYPOINT(S)</span>
        </div>

        {allWaypoints.length === 0 ? (
          <p className="text-xs text-[#94A3B8] font-mono">
            No route waypoints configured yet. Use the search bar or click on the map to add meeting point, stops, and destination.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {allWaypoints.map((wp, idx) => {
              const isMeeting = wp.type === 'meeting';
              const isDest = wp.type === 'destination';
              const isBreak = wp.type === 'break';
              const isCharge = wp.type === 'charging';

              const badgeColor = isMeeting
                ? 'text-[#38BDF8] border-[#38BDF8]/40 bg-[#38BDF8]/10'
                : isDest
                ? 'text-[#10B981] border-[#10B981]/40 bg-[#10B981]/10'
                : isBreak
                ? 'text-[#F59E0B] border-[#F59E0B]/40 bg-[#F59E0B]/10'
                : 'text-[#C084FC] border-[#8B5CF6]/40 bg-[#8B5CF6]/10';

              const icon = isMeeting ? '📍' : isDest ? '🏁' : isBreak ? '☕' : '⚡';

              return (
                <div
                  key={wp.id || idx}
                  className="p-3 rounded-lg bg-[#080D1A] border border-[#1E2D42] flex items-start justify-between gap-2"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{icon}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase border ${badgeColor}`}>
                        {wp.type}
                      </span>
                      <span className="text-xs font-bold text-[#F8FAFC] truncate">{wp.name}</span>
                    </div>

                    <div className="text-[10px] font-mono text-[#64748B]">
                      {wp.latitude.toFixed(4)}°N, {wp.longitude.toFixed(4)}°E
                    </div>

                    {wp.address && <p className="text-[11px] text-[#94A3B8] truncate">{wp.address}</p>}
                    {wp.notes && <p className="text-[11px] text-[#FDE68A] font-mono">{wp.notes}</p>}

                    <div className="pt-1 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleFocusWaypointOnMap(wp)}
                        className="inline-flex items-center gap-1 text-[10px] font-mono text-[#10B981] hover:underline"
                      >
                        <LocateFixed className="w-3 h-3" />
                        <span>Locate Pin on Map</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openInGoogleMaps(wp.googleMapsUrl, wp.latitude, wp.longitude, wp.name)}
                        className="inline-flex items-center gap-1 text-[10px] font-mono text-[#38BDF8] hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Open in Google Maps ↗</span>
                      </button>
                    </div>
                  </div>

                  {/* Remove Button for Edit Mode */}
                  {mode === 'edit' && (
                    <div className="shrink-0">
                      {isBreak && onRemoveStop && (
                        <button
                          type="button"
                          onClick={() => onRemoveStop(wp.id)}
                          className="p-1 text-[#64748B] hover:text-[#EF4444] transition-colors"
                          title="Remove Stop"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isCharge && onRemoveChargingStop && (
                        <button
                          type="button"
                          onClick={() => {
                            const cIdx = chargingStops.findIndex(c => c.locationName === wp.name);
                            if (cIdx >= 0) onRemoveChargingStop(cIdx);
                          }}
                          className="p-1 text-[#64748B] hover:text-[#EF4444] transition-colors"
                          title="Remove Charging Stop"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
