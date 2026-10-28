import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Navigation as NavIcon,
  ExternalLink,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Compass,
  Layers,
  Crosshair,
  AlertTriangle,
  Edit3,
  Trash2,
  X,
  LocateFixed,
  Search,
  Loader2,
  Phone,
  User as UserIcon,
  Calendar,
  Clock
} from 'lucide-react';
import { ChargingStation, ChargerPlugType, User } from '../types';
import {
  clusterChargingStations,
  CHARGER_PLUG_TYPE_SPECS,
  canModifyChargerRecord,
  buildChargerNavigationUrl,
  calculateDistanceKm,
  ChargerCluster,
  PlaceSuggestion,
  searchAndRankPlaces,
  createTacticalOfflineTileDataUrl,
  resolveChargerSubmitterInfo,
  resolveCommunityChargerTerms
} from '../utils/rules';
import {
  loadCachedPlacesFromPhone,
  saveCachedPlacesToPhone
} from '../utils/telemetryCache';
import { useAudio } from '../context/AudioContext';

interface ChargingIndiaMapProps {
  stations: ChargingStation[];
  selectedStation: ChargingStation | null;
  onSelectStation: (station: ChargingStation) => void;
  currentUser: User | null;
  onEditStation: (station: ChargingStation) => void;
  onDeleteStation: (station: ChargingStation) => void;
  lastSyncedAt: string | null;
  selectedChargerReservationAndIntelSlot?: React.ReactNode;
}

const INDIA_CENTER: [number, number] = [20.5937, 78.9629];
const DEFAULT_INDIA_ZOOM = 5;

const REGION_PRESETS = [
  { id: 'india', label: 'ALL INDIA', center: [20.5937, 78.9629] as [number, number], zoom: 5 },
  { id: 'bengaluru', label: 'BENGALURU / SOUTH', center: [12.9716, 77.5946] as [number, number], zoom: 10 },
  { id: 'mumbai', label: 'MUMBAI / PUNE', center: [18.88, 73.12] as [number, number], zoom: 9 },
  { id: 'delhi', label: 'DELHI NCR', center: [28.6139, 77.2090] as [number, number], zoom: 11 }
];

function getChargerTypeBadgeStyle(type?: ChargerPlugType): {
  bg: string;
  text: string;
  border: string;
  hex: string;
} {
  switch (type) {
    case 'Supernova':
      return {
        bg: 'bg-[#42B883]/20',
        text: 'text-[#42B883]',
        border: 'border-[#42B883]/50',
        hex: '#42B883'
      };
    case 'Type 6':
      return {
        bg: 'bg-[#729BCB]/20',
        text: 'text-[#729BCB]',
        border: 'border-[#729BCB]/50',
        hex: '#729BCB'
      };
    case 'Type 2':
      return {
        bg: 'bg-[#E8AA45]/20',
        text: 'text-[#E8AA45]',
        border: 'border-[#E8AA45]/50',
        hex: '#E8AA45'
      };
    case 'Socket':
    default:
      return {
        bg: 'bg-[#D4D8DE]/15',
        text: 'text-[#D4D8DE]',
        border: 'border-[#D4D8DE]/40',
        hex: '#D4D8DE'
      };
  }
}

export const ChargingIndiaMap: React.FC<ChargingIndiaMapProps> = ({
  stations,
  selectedStation,
  onSelectStation,
  currentUser,
  onEditStation,
  onDeleteStation,
  lastSyncedAt,
  selectedChargerReservationAndIntelSlot
}) => {
  const { playTacticalClick } = useAudio();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const searchedPinRef = useRef<L.Marker | null>(null);
  const mapSearchBoxRef = useRef<HTMLDivElement | null>(null);
  const mapSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentZoom, setCurrentZoom] = useState<number>(DEFAULT_INDIA_ZOOM);
  const [activeRegionPreset, setActiveRegionPreset] = useState<string>('india');
  const [typeFilter, setTypeFilter] = useState<'ALL' | ChargerPlugType>('ALL');

  // Google Maps-style place & charger search on the map
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [mapSearchSuggestions, setMapSearchSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isMapSearching, setIsMapSearching] = useState(false);
  const [isMapDropdownOpen, setIsMapDropdownOpen] = useState(false);
  const [mapHighlightIdx, setMapHighlightIdx] = useState(-1);
  const [searchedPlaceSummary, setSearchedPlaceSummary] = useState<PlaceSuggestion | null>(null);

  // Navigation drawer state for Requirement 4 ("Navigate to Charger")
  const [showNavDrawer, setShowNavDrawer] = useState<boolean>(false);
  const [locatingOrigin, setLocatingOrigin] = useState<boolean>(false);
  const [userOrigin, setUserOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationFallbackMsg, setLocationFallbackMsg] = useState<string | null>(null);

  // Filter published stations by selected connector type if desired
  const visibleStations = useMemo(() => {
    if (typeFilter === 'ALL') return stations;
    return stations.filter(s => (s.chargerType || (s.isSupernova ? 'Supernova' : 'Socket')) === typeFilter);
  }, [stations, typeFilter]);

  // Compute spatial clusters based on current map zoom
  const clusters: ChargerCluster<ChargingStation>[] = useMemo(() => {
    return clusterChargingStations(visibleStations, currentZoom);
  }, [visibleStations, currentZoom]);

  // Reset navigation drawer origin state if selected station changes
  useEffect(() => {
    setLocationFallbackMsg(null);
  }, [selectedStation?.id]);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: INDIA_CENTER,
      zoom: DEFAULT_INDIA_ZOOM,
      minZoom: 4,
      maxZoom: 18,
      zoomControl: true,
      attributionControl: true
    });

    // Real geographical map tiles (OpenStreetMap India & Global cartography styled for GHOST PROTOCOL)
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
    markersLayerRef.current = layerGroup;
    mapInstanceRef.current = map;

    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    // Ensure proper sizing after mount
    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Render clustered and individual charger markers whenever clusters or selectedStation update
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = markersLayerRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    clusters.forEach(item => {
      if (item.isCluster) {
        const hasSelectedInside = item.stations.some(s => s.id === selectedStation?.id);
        const clusterHtml = `
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            border-radius: 9999px;
            background: rgba(19, 22, 26, 0.95);
            border: 2px solid ${hasSelectedInside ? '#42B883' : '#E8AA45'};
            color: #F1F3F5;
            font-family: 'JetBrains Mono', monospace;
            font-weight: 700;
            font-size: 12px;
            box-shadow: 0 0 14px rgba(232, 170, 69, 0.35);
          " title="${item.count} chargers in this area — Click to expand">
            <span>${item.count}</span>
          </div>
        `;

        const icon = L.divIcon({
          html: clusterHtml,
          className: 'ghost-charger-cluster-icon',
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });

        const marker = L.marker([item.latitude, item.longitude], { icon });
        marker.on('click', () => {
          playTacticalClick();
          const nextZoom = Math.min(map.getZoom() + 4, 13);
          map.setView([item.latitude, item.longitude], nextZoom, { animate: true });
          if (item.stations[0]) {
            onSelectStation(item.stations[0]);
          }
        });
        marker.addTo(layerGroup);
      } else {
        const st = item.stations[0];
        if (!st) return;
        const isSelected = selectedStation?.id === st.id;
        const effectiveType: ChargerPlugType =
          st.chargerType || (st.isSupernova ? 'Supernova' : 'Socket');
        const isSupernova =
          effectiveType === 'Supernova' || st.isSupernova || st.chargerSource === 'Supernova';
        const style = getChargerTypeBadgeStyle(effectiveType);

        let pinHtml = '';
        let iconSize: [number, number] = [28, 28];
        let iconAnchor: [number, number] = [14, 14];

        const isCommunity = st.chargerSource === 'Community Provided Charger' || (st as any).isCommunityCharger;
        const isType6 = effectiveType === 'Type 6';
        const isSocket = effectiveType === 'Socket';

        if (isCommunity) {
          const size = isSelected ? 60 : 48;
          iconSize = [size, size];
          iconAnchor = [size / 2, size / 2];
          pinHtml = `
            <div style="
              display: flex;
              align-items: center;
              justify-content: center;
              width: ${size}px;
              height: ${size}px;
              background: transparent;
              border: none;
              padding: 0;
              margin: 0;
              filter: drop-shadow(0 0 ${isSelected ? '18px' : '10px'} rgba(245, 158, 11, 0.95)) drop-shadow(0 0 20px rgba(56, 189, 248, 0.6)) drop-shadow(0 2px 10px rgba(0, 0, 0, 0.95));
              transition: all 0.2s ease;
              transform: ${isSelected ? 'scale(1.15)' : 'scale(1)'};
              cursor: pointer;
            " title="${st.name} (Community Provided Charger — Tactical Batman Network)">
              <img src="/assets/aistudio/batman_icon.svg" alt="Community Batman Charger" style="width: 100%; height: 100%; object-fit: contain; background: transparent; border: none; filter: brightness(1.1) contrast(1.15);" />
            </div>
          `;
        } else if (isSupernova) {
          const size = isSelected ? 62 : 50;
          iconSize = [size, size];
          iconAnchor = [size / 2, size / 2];
          pinHtml = `
            <div style="
              display: flex;
              align-items: center;
              justify-content: center;
              width: ${size}px;
              height: ${size}px;
              background: transparent;
              border: none;
              padding: 0;
              margin: 0;
              filter: drop-shadow(0 0 ${isSelected ? '16px' : '8px'} rgba(56, 189, 248, 0.95)) drop-shadow(0 2px 8px rgba(0, 0, 0, 0.9));
              transition: all 0.2s ease;
              transform: ${isSelected ? 'scale(1.15)' : 'scale(1)'};
              cursor: pointer;
            " title="${st.name} (Supernova DC Fast Charging)">
              <img src="/assets/aistudio/supernova_black.png" alt="Supernova" style="width: 100%; height: 100%; object-fit: contain; background: transparent; border: none; filter: brightness(0.9) contrast(1.1);" />
            </div>
          `;
        } else if (isType6) {
          const size = isSelected ? 44 : 34;
          iconSize = [size, size];
          iconAnchor = [size / 2, size / 2];
          pinHtml = `
            <div style="
              display: flex;
              align-items: center;
              justify-content: center;
              width: ${size}px;
              height: ${size}px;
              background: transparent;
              border: none;
              padding: 0;
              margin: 0;
              filter: drop-shadow(0 0 ${isSelected ? '14px' : '6px'} rgba(16, 185, 129, 0.95));
              transition: all 0.2s ease;
              transform: ${isSelected ? 'scale(1.15)' : 'scale(1)'};
              cursor: pointer;
            " title="${st.name} (Type 6 Fast Charging)">
              <img src="/assets/aistudio/type6_transparent.png" alt="Type 6" style="width: 100%; height: 100%; object-fit: contain; background: transparent; border: none;" />
            </div>
          `;
        } else if (isSocket) {
          const size = isSelected ? 48 : 36;
          iconSize = [size, size];
          iconAnchor = [size / 2, size / 2];
          pinHtml = `
            <div style="
              display: flex;
              align-items: center;
              justify-content: center;
              width: ${size}px;
              height: ${size}px;
              background: transparent;
              border: none;
              padding: 0;
              margin: 0;
              filter: drop-shadow(0 0 ${isSelected ? '16px' : '8px'} rgba(255, 255, 255, 0.95)) drop-shadow(0 2px 8px rgba(0, 0, 0, 0.85));
              transition: all 0.2s ease;
              transform: ${isSelected ? 'scale(1.15)' : 'scale(1)'};
              cursor: pointer;
            " title="${st.name} (15A/16A Industrial White Socket)">
              <img src="/assets/aistudio/socket_icon.svg" alt="Socket" style="width: 100%; height: 100%; object-fit: contain; background: transparent; border: none; filter: brightness(1.2) contrast(1.1);" />
            </div>
          `;
        } else {
          iconSize = [isSelected ? 34 : 28, isSelected ? 34 : 28];
          iconAnchor = [isSelected ? 17 : 14, isSelected ? 17 : 14];
          pinHtml = `
            <div style="
              display: flex;
              align-items: center;
              justify-content: center;
              width: ${isSelected ? '34px' : '28px'};
              height: ${isSelected ? '34px' : '28px'};
              border-radius: 9999px;
              background: ${isSelected ? style.hex : '#13161A'};
              border: 2.5px solid ${style.hex};
              color: ${isSelected ? '#08090B' : style.hex};
              font-family: 'JetBrains Mono', monospace;
              font-weight: 700;
              font-size: 11px;
              box-shadow: ${isSelected ? `0 0 16px ${style.hex}` : '0 2px 6px rgba(0,0,0,0.75)'};
              transition: all 0.15s ease;
              cursor: pointer;
            " title="${st.name} (${effectiveType})">
              <span>⚡</span>
            </div>
          `;
        }

        const icon = L.divIcon({
          html: pinHtml,
          className: 'ghost-charger-pin-icon',
          iconSize,
          iconAnchor
        });

        const marker = L.marker([st.latitude, st.longitude], { icon });
        marker.on('click', () => {
          playTacticalClick();
          onSelectStation(st);
        });
        marker.addTo(layerGroup);
      }
    });
  }, [clusters, selectedStation, onSelectStation, playTacticalClick]);

  const handleFlyToPreset = (preset: typeof REGION_PRESETS[number]) => {
    playTacticalClick();
    setActiveRegionPreset(preset.id);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(preset.center, preset.zoom, { animate: true });
    }
  };

  const handleFocusStationOnMap = (station: ChargingStation) => {
    playTacticalClick();
    onSelectStation(station);
    if (mapInstanceRef.current) {
      const targetZoom = Math.max(mapInstanceRef.current.getZoom(), 12);
      mapInstanceRef.current.setView([station.latitude, station.longitude], targetZoom, {
        animate: true
      });
    }
  };

  useEffect(() => {
    const handleOutside = (ev: MouseEvent) => {
      if (mapSearchBoxRef.current && !mapSearchBoxRef.current.contains(ev.target as Node)) {
        setIsMapDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const executeMapPlaceSearch = useCallback(async (qText: string) => {
    const trimmed = qText.trim();
    if (trimmed.length < 2) {
      setMapSearchSuggestions([]);
      setIsMapSearching(false);
      return;
    }
    setIsMapSearching(true);
    const cachedPlaces = loadCachedPlacesFromPhone();
    const localHits = searchAndRankPlaces(trimmed, cachedPlaces);
    if (localHits.length > 0) {
      setMapSearchSuggestions(localHits);
      setMapHighlightIdx(0);
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsMapSearching(false);
      return;
    }
    try {
      const center = mapInstanceRef.current?.getCenter();
      const biasParams = center
        ? `&lat=${center.lat.toFixed(4)}&lon=${center.lng.toFixed(4)}`
        : '';
      const res = await fetch(
        `/api/places/autocomplete?q=${encodeURIComponent(trimmed)}${biasParams}`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.suggestions)) {
          saveCachedPlacesToPhone(data.suggestions);
          setMapSearchSuggestions(data.suggestions);
          setMapHighlightIdx(data.suggestions.length > 0 ? 0 : -1);
        }
      }
    } catch {
      // Keep local + phone-cached hits
    } finally {
      setIsMapSearching(false);
    }
  }, []);

  const handleSelectMapPlace = (place: PlaceSuggestion) => {
    playTacticalClick();
    setMapSearchQuery(place.name);
    setSearchedPlaceSummary(place);
    setIsMapDropdownOpen(false);
    setMapHighlightIdx(-1);

    const map = mapInstanceRef.current;
    if (map) {
      if (searchedPinRef.current) {
        searchedPinRef.current.remove();
        searchedPinRef.current = null;
      }
      const searchPinIcon = L.divIcon({
        className: 'ghost-map-searched-place-pin',
        html: `
          <div style="
            width: 32px;
            height: 32px;
            border-radius: 9999px;
            background: #0D0F12;
            border: 2.5px solid #E8AA45;
            box-shadow: 0 0 0 5px rgba(232,170,69,0.28), 0 4px 10px rgba(0,0,0,0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
          " title="${place.name}">📍</div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      searchedPinRef.current = L.marker([place.latitude, place.longitude], {
        icon: searchPinIcon,
        title: `${place.name} — ${place.locality}`
      }).addTo(map);

      map.setView([place.latitude, place.longitude], 14, { animate: true });
    }

    // Also focus the closest published charging station if one exists nearby
    if (visibleStations.length > 0) {
      let closest = visibleStations[0];
      let minDist = calculateDistanceKm(
        place.latitude,
        place.longitude,
        closest.latitude,
        closest.longitude
      );
      for (const st of visibleStations) {
        const d = calculateDistanceKm(
          place.latitude,
          place.longitude,
          st.latitude,
          st.longitude
        );
        if (d < minDist) {
          minDist = d;
          closest = st;
        }
      }
      if (closest) {
        onSelectStation(closest);
      }
    }
  };

  const handleRequestCurrentLocation = () => {
    playTacticalClick();
    setLocationFallbackMsg(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationFallbackMsg(
        'Geolocation is not supported by this browser. Use the direct destination navigation link below to open directions to the charger coordinates.'
      );
      return;
    }

    setLocatingOrigin(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocatingOrigin(false);
        setUserOrigin({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6))
        });
      },
      err => {
        setLocatingOrigin(false);
        setUserOrigin(null);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationFallbackMsg(
            'Location permission was denied. Fallback active: You can still launch Google Maps directions directly to the charger coordinates below and enter your starting location in Maps.'
          );
        } else {
          setLocationFallbackMsg(
            'Could not determine current GPS position. Fallback active: Use the direct destination link below to navigate to the charger coordinates.'
          );
        }
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  const effectiveSelectedType: ChargerPlugType | undefined = selectedStation
    ? selectedStation.chargerType || (selectedStation.isSupernova ? 'Supernova' : 'Socket')
    : undefined;
  const selectedTypeSpec = effectiveSelectedType
    ? CHARGER_PLUG_TYPE_SPECS[effectiveSelectedType]
    : undefined;
  const selectedBadgeStyle = getChargerTypeBadgeStyle(effectiveSelectedType);
  const canModifySelected = selectedStation
    ? canModifyChargerRecord(selectedStation, currentUser)
    : false;

  const directDistanceKm =
    selectedStation && userOrigin
      ? calculateDistanceKm(
          userOrigin.latitude,
          userOrigin.longitude,
          selectedStation.latitude,
          selectedStation.longitude
        )
      : null;

  return (
    <div
      data-testid="charging-india-map-section"
      className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-4 sm:p-5 space-y-4 font-mono text-xs"
    >
      {/* Map Top Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#282D34]">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded bg-[#13161A] border border-[#414851] flex items-center justify-center text-[#E8AA45] shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xs sm:text-sm font-bold text-[#F1F3F5] tracking-wider uppercase">
                INDIA CHARGING NETWORK MAP
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] bg-[#42B883]/15 text-[#42B883] border border-[#42B883]/30 font-semibold">
                {visibleStations.length} PUBLISHED CHARGERS
              </span>
              {lastSyncedAt && (
                <span className="text-[10px] text-[#707883] hidden sm:inline">
                  LIVE SYNC ACTIVE
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#A0A7B0] font-sans mt-0.5">
              Showing approved user-submitted and administrator-verified chargers across India. Click any pin or cluster to inspect.
            </p>
          </div>
        </div>

        {/* Region Quick-Jump & Connector Type Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center bg-[#13161A] border border-[#282D34] rounded p-0.5 gap-0.5">
            {REGION_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleFlyToPreset(preset)}
                className={`px-2.5 py-1 rounded text-[10px] transition-colors ${
                  activeRegionPreset === preset.id
                    ? 'bg-[#252A30] text-[#E8AA45] font-bold border border-[#E8AA45]/40'
                    : 'text-[#707883] hover:text-[#D4D8DE]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter map by charger connector type"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as any)}
            className="w-full sm:w-auto max-w-full bg-[#13161A] border border-[#282D34] rounded px-2.5 py-1.5 text-[11px] text-[#F1F3F5] focus:outline-none focus:border-[#414851]"
          >
            <option value="ALL">All Types (Supernova, Type 6, Type 2, Socket)</option>
            <option value="Supernova">Supernova Only</option>
            <option value="Type 6">Type 6 Only</option>
            <option value="Type 2">Type 2 Only</option>
            <option value="Socket">Socket Only</option>
          </select>
        </div>
      </div>

      {/* Google Maps-Style Place & Charger Search Bar on the Map */}
      <div ref={mapSearchBoxRef} className="relative z-30">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-[#E8AA45]" />
          <input
            type="text"
            aria-label="Search places, cafés, petrol pumps, or EV charging stations on map"
            value={mapSearchQuery}
            onChange={e => {
              const val = e.target.value;
              setMapSearchQuery(val);
              if (mapSearchDebounceRef.current) {
                clearTimeout(mapSearchDebounceRef.current);
              }
              if (val.trim().length < 2) {
                setMapSearchSuggestions([]);
                setIsMapDropdownOpen(false);
                setIsMapSearching(false);
                return;
              }
              setIsMapDropdownOpen(true);
              setIsMapSearching(true);
              mapSearchDebounceRef.current = setTimeout(() => {
                executeMapPlaceSearch(val);
              }, 200);
            }}
            onFocus={() => {
              if (mapSearchQuery.trim().length >= 2) {
                setIsMapDropdownOpen(true);
              }
            }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown' && mapSearchSuggestions.length > 0) {
                e.preventDefault();
                setIsMapDropdownOpen(true);
                setMapHighlightIdx(prev => (prev + 1) % mapSearchSuggestions.length);
              } else if (e.key === 'ArrowUp' && mapSearchSuggestions.length > 0) {
                e.preventDefault();
                setMapHighlightIdx(
                  prev => (prev - 1 + mapSearchSuggestions.length) % mapSearchSuggestions.length
                );
              } else if (e.key === 'Enter' && isMapDropdownOpen && mapSearchSuggestions.length > 0) {
                e.preventDefault();
                const chosen =
                  mapSearchSuggestions[mapHighlightIdx >= 0 ? mapHighlightIdx : 0];
                if (chosen) handleSelectMapPlace(chosen);
              } else if (e.key === 'Escape') {
                setIsMapDropdownOpen(false);
              }
            }}
            placeholder="Search Google Maps-style across India (e.g. Kolar CCD, petrol pump near Kolar, EV charging station Bangalore)..."
            className="w-full bg-[#13161A] border border-[#414851] focus:border-[#E8AA45] rounded-lg pl-10 pr-10 py-2 text-xs text-[#F1F3F5] focus:outline-none transition-colors"
          />
          {isMapSearching ? (
            <Loader2 className="w-4 h-4 absolute right-3 top-2.5 text-[#E8AA45] animate-spin" />
          ) : mapSearchQuery ? (
            <button
              type="button"
              aria-label="Clear map place search"
              onClick={() => {
                setMapSearchQuery('');
                setMapSearchSuggestions([]);
                setIsMapDropdownOpen(false);
                setSearchedPlaceSummary(null);
                if (searchedPinRef.current) {
                  searchedPinRef.current.remove();
                  searchedPinRef.current = null;
                }
              }}
              className="absolute right-3 top-2.5 text-[#707883] hover:text-[#F1F3F5]"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        {isMapDropdownOpen && mapSearchQuery.trim().length >= 2 && (
          <div
            role="listbox"
            aria-label="Map place search suggestions"
            className="absolute left-0 right-0 top-full mt-1 z-[10020] bg-[#13161A] border border-[#414851] rounded-lg shadow-2xl max-h-64 overflow-y-auto divide-y divide-[#282D34]"
          >
            {isMapSearching && mapSearchSuggestions.length === 0 && (
              <div className="p-3 text-xs text-[#A0A7B0] flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-[#E8AA45] animate-spin" />
                <span>Searching places, businesses, highways & EV stations across India...</span>
              </div>
            )}
            {!isMapSearching && mapSearchSuggestions.length === 0 && (
              <div className="p-3 text-xs text-[#A0A7B0]">
                No matching places found for &ldquo;{mapSearchQuery}&rdquo;. Try a city, landmark, or business name.
              </div>
            )}
            {mapSearchSuggestions.map((item, idx) => (
              <div
                key={item.id}
                role="option"
                aria-selected={idx === mapHighlightIdx}
                onMouseEnter={() => setMapHighlightIdx(idx)}
                onMouseDown={e => {
                  e.preventDefault();
                  handleSelectMapPlace(item);
                }}
                className={`p-3 cursor-pointer flex items-start justify-between gap-3 transition-colors ${
                  idx === mapHighlightIdx ? 'bg-[#191D22]' : 'hover:bg-[#191D22]/70'
                }`}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-[#E8AA45] shrink-0" />
                    <span className="text-xs font-bold text-[#F1F3F5] truncate">{item.name}</span>
                  </div>
                  <div className="text-[11px] font-semibold text-[#AEB5BE] pl-5">
                    {item.locality}
                  </div>
                  <div className="text-[11px] text-[#707883] font-sans pl-5 line-clamp-1">
                    {item.address}
                  </div>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#0D0F12] border border-[#282D34] text-[#E8AA45] shrink-0">
                  {item.category}
                </span>
              </div>
            ))}
          </div>
        )}

        {searchedPlaceSummary && (
          <div className="mt-2 px-3 py-1.5 rounded bg-[#13161A] border border-[#E8AA45]/40 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-[#F1F3F5]">
              <MapPin className="w-3.5 h-3.5 text-[#E8AA45] shrink-0" />
              <span className="font-bold">{searchedPlaceSummary.name}</span>
              <span className="text-[#A0A7B0]">({searchedPlaceSummary.locality})</span>
            </div>
            <span className="text-[10px] text-[#42B883] font-mono">
              Centered at {searchedPlaceSummary.latitude.toFixed(4)}°N, {searchedPlaceSummary.longitude.toFixed(4)}°E
            </span>
          </div>
        )}
      </div>

      {/* Full-Width Geographical Map Canvas followed immediately below by ALL Selected Charger Details */}
      <div className="space-y-4">
        {/* 1. Full-Width Map Canvas */}
        <div className="relative rounded-lg overflow-hidden border border-[#282D34] bg-[#08090B]">
          <div
            ref={mapContainerRef}
            data-testid="leaflet-charging-map"
            className="w-full h-[380px] sm:h-[480px] z-10"
          />

          {/* Legend Overlay */}
          <div className="bg-[#13161A]/95 border-t border-[#282D34] px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[10px]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1 text-[#42B883]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#42B883] inline-block" />
                Supernova
              </span>
              <span className="flex items-center gap-1 text-[#729BCB]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#729BCB] inline-block" />
                Type 6
              </span>
              <span className="flex items-center gap-1 text-[#E8AA45]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E8AA45] inline-block" />
                Type 2
              </span>
              <span className="flex items-center gap-1 text-[#D4D8DE]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#D4D8DE] inline-block" />
                Socket
              </span>
              <span className="flex items-center gap-1 text-[#E8AA45]">
                <span className="px-1 rounded border border-[#E8AA45] text-[#F1F3F5] text-[9px]">
                  N
                </span>
                Cluster Group
              </span>
            </div>
            <span className="text-[#707883]">ZOOM: {currentZoom}x</span>
          </div>
        </div>

        {/* 2. IMMEDIATELY RIGHT BELOW THE MAP: Selected Charger Details Panel */}
        <div id="selected-charger-details-anchor">
          {selectedStation ? (
            <div
              data-testid="selected-charger-info-panel"
              className="bg-[#13161A] border border-[#414851] rounded-lg p-4 sm:p-5 space-y-5 shadow-xl"
            >
              {/* Status & Charger Type Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#282D34]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#252A30] text-[#E8AA45] border border-[#E8AA45]/40 uppercase">
                    SELECTED MAP CHARGER DETAILS
                  </span>
                  {selectedStation.chargerSource === 'Supernova' ||
                  selectedStation.isSupernova ||
                  selectedStation.chargerType === 'Supernova' ? (
                    <span className="px-2 py-0.5 rounded bg-[#42B883]/20 text-[#42B883] border border-[#42B883]/40 text-[10px] font-bold uppercase">
                      SUPERNOVA STATION
                    </span>
                  ) : resolveChargerSubmitterInfo(selectedStation).isCommunityProvided ? (
                    <span className="px-2 py-0.5 rounded bg-[#E8AA45]/20 text-[#E8AA45] border border-[#E8AA45]/40 text-[10px] font-bold uppercase">
                      COMMUNITY PROVIDED CHARGER
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-[#252A30] text-[#729BCB] border border-[#729BCB]/40 text-[10px] font-bold uppercase">
                      3RD PARTY STATION
                    </span>
                  )}
                  <span
                    className={`px-2.5 py-0.5 rounded border text-[11px] font-bold uppercase ${selectedBadgeStyle.bg} ${selectedBadgeStyle.text} ${selectedBadgeStyle.border}`}
                  >
                    {effectiveSelectedType}
                  </span>
                  <span className="text-[#42B883] font-bold flex items-center gap-1 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {selectedStation.operatingStatus.toUpperCase()}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#707883]">
                  <span>
                    COORDINATES: {selectedStation.latitude.toFixed(4)}°N, {selectedStation.longitude.toFixed(4)}°E
                  </span>
                  <span>•</span>
                  <span>LAST VERIFIED: {selectedStation.lastVerifiedDate}</span>
                </div>
              </div>

              {/* Station Name & Full Address */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-[#F1F3F5] leading-snug">
                    {selectedStation.name}
                  </h3>
                  <div className="text-xs text-[#A0A7B0] flex items-start gap-1.5 mt-1 font-sans">
                    <MapPin className="w-3.5 h-3.5 text-[#E8AA45] shrink-0 mt-0.5" />
                    <span>{selectedStation.location}</span>
                  </div>
                </div>

                {canModifySelected && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        playTacticalClick();
                        onEditStation(selectedStation);
                      }}
                      className="px-3 py-1.5 rounded bg-[#191D22] hover:bg-[#252A30] text-[#D4D8DE] border border-[#414851] flex items-center gap-1.5 text-[11px] font-bold cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[#E8AA45]" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playTacticalClick();
                        onDeleteStation(selectedStation);
                      }}
                      className="px-3 py-1.5 rounded bg-[#E04F5F]/15 hover:bg-[#E04F5F]/25 text-[#E04F5F] border border-[#E04F5F]/40 flex items-center gap-1.5 text-[11px] font-bold cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 4-Column Key Specifications Grid */}
              {(() => {
                const selectedTerms = resolveCommunityChargerTerms(selectedStation);
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded bg-[#0D0F12] border border-[#282D34]">
                      <div className="text-[10px] text-[#707883]">CHARGER TYPE</div>
                      <div className="text-[#E8AA45] font-bold text-sm mt-0.5 flex items-center gap-1.5">
                        {selectedStation.chargerType === 'Supernova' ||
                        selectedStation.isSupernova ||
                        selectedStation.chargerSource === 'Supernova' ? (
                          <>
                            <img
                              src="/assets/aistudio/87f724dd-d91d-4b81-9fca-91a11dc2cbec_40fb2a9f.png"
                              alt="Supernova"
                              className="w-5 h-5 object-contain shrink-0"
                            />
                            <span>Supernova</span>
                          </>
                        ) : selectedStation.chargerType === 'Type 6' ? (
                          <>
                            <img
                              src="/assets/aistudio/type6_transparent.png"
                              alt="Type 6"
                              className="w-5 h-5 object-contain shrink-0"
                            />
                            <span className="text-[#10B981]">Type 6</span>
                          </>
                        ) : selectedStation.chargerType === 'Socket' ? (
                          <>
                            <img
                              src="/assets/aistudio/socket_icon.svg"
                              alt="Socket"
                              className="w-5 h-5 object-contain shrink-0"
                            />
                            <span className="text-[#F8FAFC]">Socket (15A/16A)</span>
                          </>
                        ) : (
                          selectedStation.chargerType || 'Socket'
                        )}
                      </div>
                    </div>

                    <div className="p-3 rounded bg-[#0D0F12] border border-[#282D34]">
                      <div className="text-[10px] text-[#707883]">MAX POWER</div>
                      <div className="text-[#42B883] font-bold text-sm mt-0.5">
                        {selectedStation.powerOutputKw} kW
                      </div>
                    </div>

                    <div className="p-3 rounded bg-[#0D0F12] border border-[#282D34]">
                      <div className="text-[10px] text-[#707883]">AVAILABILITY TIME</div>
                      <div
                        data-testid="selected-charger-availability-time"
                        className="text-[#F1F3F5] font-semibold text-xs truncate mt-0.5 flex items-center gap-1"
                      >
                        <Clock className="w-3 h-3 text-[#729BCB] shrink-0" />
                        <span className="truncate">
                          {selectedTerms.isCommunityProvided
                            ? selectedTerms.availabilityTimeText
                            : selectedStation.accessConditions}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded bg-[#0D0F12] border border-[#282D34]">
                      <div className="text-[10px] text-[#707883]">PRICING &amp; COST</div>
                      <div
                        data-testid="selected-charger-pricing-badge"
                        className={`font-bold text-xs truncate mt-0.5 ${
                          selectedTerms.isCommunityProvided
                            ? selectedTerms.pricingType === 'Free'
                              ? 'text-[#42B883]'
                              : 'text-[#E8AA45]'
                            : 'text-[#D4D8DE]'
                        }`}
                      >
                        {selectedTerms.isCommunityProvided
                          ? selectedTerms.formattedPricingBadge
                          : selectedStation.pricing || 'Commercial Standard'}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Submitted-by Info & Contact Owner Card — ONLY FOR COMMUNITY PROVIDED CHARGERS */}
              {(() => {
                const submitterInfo = resolveChargerSubmitterInfo(selectedStation);
                if (!submitterInfo.isCommunityProvided) return null;
                return (
                  <div
                    data-testid="selected-charger-submitter-card"
                    className="p-3.5 rounded border bg-[#191610] border-[#E8AA45]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div
                      data-testid="map-selected-submitter-panel"
                      className="space-y-1"
                    >
                      <div className="text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5 text-[#E8AA45]">
                        <UserIcon className="w-3.5 h-3.5" />
                        <span>COMMUNITY PROVIDED CHARGER — SUBMITTED BY</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#191D22] text-[#AEB5BE] border border-[#282D34]">
                          {selectedStation.submittedByRole === 'admin' ? 'ADMIN' : 'COMMUNITY'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <div>
                          <span className="text-[#A0A7B0]">Name: </span>
                          <span
                            data-testid="selected-charger-submitter-name"
                            className="font-bold text-[#F1F3F5]"
                          >
                            <span data-testid="map-selected-submitter-name">
                              {submitterInfo.submitterName}
                            </span>
                          </span>
                        </div>
                        {submitterInfo.submitterPhone && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#A0A7B0]">Contact Number: </span>
                            <a
                              href={submitterInfo.telHref}
                              data-testid="map-selected-submitter-phone"
                              className="font-bold text-[#42B883] hover:underline"
                            >
                              <span data-testid="selected-charger-submitter-phone">
                                {submitterInfo.submitterPhone}
                              </span>
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {submitterInfo.submitterPhone && (
                      <a
                        href={submitterInfo.telHref}
                        data-testid="selected-charger-call-submitter-btn"
                        className="px-3.5 py-2 rounded bg-[#42B883]/20 hover:bg-[#42B883]/30 border border-[#42B883]/50 text-[#42B883] font-bold text-xs inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call {submitterInfo.submitterPhone}</span>
                      </a>
                    )}
                  </div>
                );
              })()}

              {/* Interactive Reservation System & Charger Intelligence Slot (Injected from ChargingNetwork) */}
              {selectedChargerReservationAndIntelSlot}

              {/* Charger Type Hardware, Compatibility, Connectors & Link Requirements Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="p-3.5 rounded bg-[#0D0F12] border border-[#282D34] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#707883] uppercase">
                      CHARGER / CONNECTOR REQUIREMENT &amp; COMPATIBILITY:
                    </span>
                    <span className="text-[10px] font-bold text-[#E8AA45]">
                      {effectiveSelectedType}
                    </span>
                  </div>

                  <div className="text-xs text-[#F1F3F5] font-sans leading-relaxed">
                    {selectedStation.chargerDetails ||
                      selectedTypeSpec?.requirementSummary ||
                      'Standard connector verification recommended.'}
                  </div>

                  <div className="text-[11px] text-[#A0A7B0] font-sans">
                    Compatible Vehicles:{' '}
                    <span className="text-[#D4D8DE]">
                      {selectedStation.vehicleCompatibility ||
                        'Check connector & model compatibility before charging'}
                    </span>
                  </div>

                  {selectedStation.uvChargingLink && (
                    <div className="pt-1.5 border-t border-[#282D34]">
                      <div className="text-[10px] text-[#707883] mb-1">
                        REQUIRED ULTRAVIOLETTE (UV) CHARGING LINK:
                      </div>
                      <a
                        href={selectedStation.uvChargingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-[#E8AA45] hover:underline break-all font-semibold"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span>{selectedStation.uvChargingLink}</span>
                      </a>
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded bg-[#0D0F12] border border-[#282D34] space-y-3">
                  <div>
                    <div className="text-[10px] text-[#707883] mb-1.5">
                      SUPPORTED CONNECTOR INTERFACES:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedStation.connectorTypes.map((c, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded bg-[#13161A] border border-[#414851] text-[#F1F3F5] text-xs font-semibold"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  {selectedStation.userNotes && (
                    <div className="pt-2 border-t border-[#282D34]">
                      <div className="text-[10px] text-[#707883] mb-1">
                        OPERATIONAL / AMENITY NOTES:
                      </div>
                      <div className="text-xs text-[#D4D8DE] font-sans leading-relaxed">
                        {selectedStation.userNotes}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Primary CTA: Navigate to Charger */}
              <div className="pt-2 border-t border-[#282D34] space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      setShowNavDrawer(prev => !prev);
                    }}
                    className="flex-1 px-4 py-2.5 rounded bg-[#E8AA45] hover:bg-[#d89b38] text-[#08090B] font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow"
                  >
                    <NavIcon className="w-4 h-4" />
                    <span>Navigate to Charger</span>
                  </button>

                  <a
                    href={buildChargerNavigationUrl(selectedStation, userOrigin)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2.5 rounded bg-[#252A30] hover:bg-[#414851] text-[#F1F3F5] border border-[#414851] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#E8AA45]" />
                    <span>Directions</span>
                  </a>

                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(
                      selectedStation.name + ' ' + selectedStation.location
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2.5 rounded bg-[#191D22] hover:bg-[#252A30] text-[#F1F3F5] border border-[#414851] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#729BCB]" />
                    <span>Open in Google Maps</span>
                  </a>
                </div>

                {/* Navigation & Location Permission Drawer */}
                {showNavDrawer && (
                  <div
                    data-testid="navigate-to-charger-drawer"
                    className="p-3.5 rounded bg-[#08090B] border border-[#E8AA45]/50 space-y-3"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-[#282D34]">
                      <span className="text-[#E8AA45] font-bold flex items-center gap-1.5">
                        <NavIcon className="w-3.5 h-3.5" />
                        <span>ROUTE NAVIGATION TO CHARGER</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowNavDrawer(false)}
                        aria-label="Close navigation panel"
                        className="text-[#707883] hover:text-[#F1F3F5]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-[11px] text-[#A0A7B0] font-sans leading-relaxed">
                      Destination coordinates:{' '}
                      <span className="font-mono text-[#F1F3F5] font-semibold">
                        {selectedStation.latitude.toFixed(5)}°N, {selectedStation.longitude.toFixed(5)}°E
                      </span>{' '}
                      ({selectedStation.location}).
                    </div>

                    <div className="p-2.5 rounded bg-[#13161A] border border-[#282D34] space-y-2">
                      <div className="text-[10px] text-[#AEB5BE] font-sans">
                        <strong>Why location permission is optional:</strong> Requesting your current location sets your exact starting point for turn-by-turn directions. If you prefer not to share location access, Google Maps will still open directly to the charger&apos;s destination coordinates.
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={handleRequestCurrentLocation}
                          disabled={locatingOrigin}
                          className="px-3 py-1.5 rounded bg-[#191D22] hover:bg-[#252A30] text-[#D4D8DE] border border-[#414851] text-[11px] font-semibold flex items-center gap-1.5"
                        >
                          <LocateFixed className="w-3.5 h-3.5 text-[#42B883]" />
                          <span>
                            {locatingOrigin
                              ? 'Requesting GPS...'
                              : userOrigin
                              ? 'Update Current Location Origin'
                              : 'Use My Current Location'}
                          </span>
                        </button>

                        {userOrigin && directDistanceKm !== null && (
                          <span className="text-[11px] text-[#42B883] font-semibold">
                            Direct Geodesic Distance: {directDistanceKm} km
                          </span>
                        )}
                      </div>

                      {locationFallbackMsg && (
                        <div
                          role="status"
                          className="p-2 rounded bg-[#E8AA45]/10 border border-[#E8AA45]/40 text-[11px] text-[#E8AA45] font-sans"
                        >
                          {locationFallbackMsg}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      <a
                        href={buildChargerNavigationUrl(selectedStation, userOrigin)}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="launch-google-maps-directions"
                        className="w-full sm:w-auto px-4 py-2 rounded bg-[#42B883] hover:bg-[#389d6f] text-[#08090B] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>
                          {userOrigin
                            ? 'Open Turn-by-Turn Directions from My Location'
                            : 'Open Destination in Google Maps Directions'}
                        </span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[#13161A] border border-[#282D34] rounded-lg p-10 text-center text-[#707883]">
              Select a charger marker on the India map to inspect connector requirements, compatibility, reservation options, and navigation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
