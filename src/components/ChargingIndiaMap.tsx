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
  Clock,
  Maximize2,
  Minimize2,
  ArrowLeft,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { ChargingStation, ChargerPlugType, User } from '../types';
import {
  clusterChargingStations,
  groupCoLocatedChargingStations,
  resolveClusterLocationLabel,
  CHARGER_PLUG_TYPE_SPECS,
  canModifyChargerRecord,
  buildChargerNavigationUrl,
  buildGoogleMapsUrl,
  openInGoogleMaps,
  buildPhoneDialIntentUri,
  openPhoneDialer,
  calculateDistanceKm,
  ChargerCluster,
  PlaceSuggestion,
  searchAndRankPlaces,
  createTacticalOfflineTileDataUrl,
  resolveChargerSubmitterInfo,
  resolveCommunityChargerTerms,
  matchesChargingStationFilter,
  formatMinimalChargerType,
  searchAndFilterChargingStations
} from '../utils/rules';
import {
  loadCachedPlacesFromPhone,
  saveCachedPlacesToPhone
} from '../utils/telemetryCache';
import { useAudio } from '../context/AudioContext';

export interface MinimalDatabaseStats {
  totalRecordsLoaded: number;
  recordsWithValidCoordinatesCount: number;
  validMapMarkersCount: number;
  skippedRecordsCount: number;
}

interface ChargingIndiaMapProps {
  stations: ChargingStation[];
  allStations?: ChargingStation[];
  activeFilter?: string;
  onFilterChange?: (filter: string) => void;
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  databaseStats?: MinimalDatabaseStats;
  selectedStation: ChargingStation | null;
  onSelectStation: (station: ChargingStation) => void;
  currentUser: User | null;
  onEditStation: (station: ChargingStation) => void;
  onDeleteStation: (station: ChargingStation) => void;
  lastSyncedAt: string | null;
  selectedChargerReservationAndIntelSlot?: React.ReactNode;
}

const INDIA_CENTER: [number, number] = [15.6, 77.5];
const DEFAULT_INDIA_ZOOM = 5;

const REGION_PRESETS = [
  { id: 'india', label: 'ALL INDIA', shortLabel: 'INDIA', center: [15.6, 77.5] as [number, number], zoom: 5 },
  { id: 'bengaluru', label: 'BENGALURU / SOUTH', shortLabel: 'SOUTH', center: [12.9716, 77.5946] as [number, number], zoom: 10 },
  { id: 'mumbai', label: 'MUMBAI / PUNE', shortLabel: 'WEST', center: [18.88, 73.12] as [number, number], zoom: 9 },
  { id: 'delhi', label: 'DELHI NCR', shortLabel: 'NORTH', center: [28.6139, 77.2090] as [number, number], zoom: 11 }
];

const MAP_STATION_FILTER_OPTIONS = [
  {
    id: 'ALL',
    label: 'All',
    shortLabel: 'All',
    dotColor: 'bg-[#F1F3F5]',
    activeStyle: 'bg-[#F1F3F5] text-[#08090B] border-[#F1F3F5] shadow-sm'
  },
  {
    id: 'SUPERNOVA',
    label: 'Supernova',
    shortLabel: 'Supernova',
    dotColor: 'bg-[#3B82F6]',
    activeStyle: 'bg-[#3B82F6] text-[#FFFFFF] border-[#3B82F6] shadow-sm shadow-[#3B82F6]/30'
  },
  {
    id: 'Community Provided Chargers',
    label: 'Community Owned',
    shortLabel: 'Community',
    dotColor: 'bg-[#E8AA45]',
    activeStyle: 'bg-[#E8AA45] text-[#08090B] border-[#E8AA45] shadow-sm shadow-[#E8AA45]/20'
  },
  {
    id: 'TYPE_2',
    label: 'Type 2',
    shortLabel: 'Type 2',
    dotColor: 'bg-[#94A3B8]',
    activeStyle: 'bg-[#94A3B8] text-[#08090B] border-[#94A3B8] shadow-sm shadow-[#94A3B8]/30'
  },
  {
    id: 'BOLT_TYPE_6',
    label: 'Type 6',
    shortLabel: 'Type 6',
    dotColor: 'bg-[#42B883]',
    activeStyle: 'bg-[#42B883] text-[#08090B] border-[#42B883] shadow-sm shadow-[#42B883]/20'
  },
  {
    id: 'SOCKET',
    label: 'Sockets',
    shortLabel: 'Sockets',
    dotColor: 'bg-[#EF4444]',
    activeStyle: 'bg-[#EF4444] text-[#FFFFFF] border-[#EF4444] shadow-sm shadow-[#EF4444]/30'
  }
] as const;

function getChargerTypeBadgeStyle(type?: ChargerPlugType): {
  bg: string;
  text: string;
  border: string;
  hex: string;
} {
  switch (type) {
    case 'Supernova':
      return {
        bg: 'bg-[#3B82F6]/20',
        text: 'text-[#3B82F6]',
        border: 'border-[#3B82F6]/50',
        hex: '#3B82F6'
      };
    case 'Type 6':
      return {
        bg: 'bg-[#42B883]/20',
        text: 'text-[#42B883]',
        border: 'border-[#42B883]/50',
        hex: '#42B883'
      };
    case 'Type 2':
      return {
        bg: 'bg-[#94A3B8]/20',
        text: 'text-[#94A3B8]',
        border: 'border-[#94A3B8]/50',
        hex: '#94A3B8'
      };
    case 'Socket':
    default:
      return {
        bg: 'bg-[#EF4444]/20',
        text: 'text-[#EF4444]',
        border: 'border-[#EF4444]/50',
        hex: '#EF4444'
      };
  }
}

export const ChargingIndiaMap: React.FC<ChargingIndiaMapProps> = ({
  stations,
  allStations,
  activeFilter,
  onFilterChange,
  searchQuery,
  onSearchQueryChange,
  databaseStats,
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
  const hasAutoFittedRef = useRef<boolean>(false);

  const [currentZoom, setCurrentZoom] = useState<number>(DEFAULT_INDIA_ZOOM);
  const [activeRegionPreset, setActiveRegionPreset] = useState<string>('india');
  const [internalFilter, setInternalFilter] = useState<string>('ALL');
  const [isFullNavigation, setIsFullNavigation] = useState(false);
  const [showIndividualMarkers, setShowIndividualMarkers] = useState<boolean>(false);
  const [isTypeFiltersExpanded, setIsTypeFiltersExpanded] = useState<boolean>(false);

  const currentStationFilter = activeFilter !== undefined ? activeFilter : internalFilter;
  const handleSelectStationFilter = (nextFilter: string) => {
    playTacticalClick();
    const resolved =
      nextFilter !== 'ALL' && currentStationFilter === nextFilter ? 'ALL' : nextFilter;
    if (onFilterChange) {
      onFilterChange(resolved);
    } else {
      setInternalFilter(resolved);
    }
  };

  const baselineStationsForCounts = allStations || stations;
  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const opt of MAP_STATION_FILTER_OPTIONS) {
      counts[opt.id] = baselineStationsForCounts.filter(s =>
        matchesChargingStationFilter(s, opt.id)
      ).length;
    }
    return counts;
  }, [baselineStationsForCounts]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const delays = [0, 50, 100, 200, 300, 500];
    const timers = delays.map(d =>
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize({ pan: false });
          if (isFullNavigation && selectedStation) {
            mapInstanceRef.current.panTo([selectedStation.latitude, selectedStation.longitude], { animate: true });
          }
        }
      }, d)
    );
    return () => timers.forEach(clearTimeout);
  }, [isFullNavigation, selectedStation]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullNavigation) {
        setIsFullNavigation(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullNavigation]);

  // Google Maps-style place & charger search on the map
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const effectiveSearchQuery = searchQuery !== undefined ? searchQuery : internalSearchQuery;
  const handleUpdateSearchQuery = useCallback(
    (val: string) => {
      if (onSearchQueryChange) {
        onSearchQueryChange(val);
      } else {
        setInternalSearchQuery(val);
      }
    },
    [onSearchQueryChange]
  );

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

  // Filter published stations by selected station filter & search query (skipping any invalid coordinates)
  const visibleStations = useMemo(() => {
    const validCoordStations = stations.filter(
      s =>
        typeof s.latitude === 'number' &&
        typeof s.longitude === 'number' &&
        Number.isFinite(s.latitude) &&
        Number.isFinite(s.longitude) &&
        s.latitude >= -90 &&
        s.latitude <= 90 &&
        s.longitude >= -180 &&
        s.longitude <= 180
    );
    if (activeFilter !== undefined && searchQuery !== undefined) {
      return validCoordStations;
    }
    return searchAndFilterChargingStations(
      validCoordStations,
      effectiveSearchQuery,
      currentStationFilter
    );
  }, [stations, activeFilter, searchQuery, effectiveSearchQuery, currentStationFilter]);

  // Matching stations for the quick-jump search dropdown
  const matchingStationSuggestions = useMemo(() => {
    const q = effectiveSearchQuery.trim();
    if (!q) return [];
    const pool = (allStations || stations).filter(
      s =>
        typeof s.latitude === 'number' &&
        typeof s.longitude === 'number' &&
        Number.isFinite(s.latitude) &&
        Number.isFinite(s.longitude)
    );
    return searchAndFilterChargingStations(pool, q, 'ALL').slice(0, 12);
  }, [allStations, stations, effectiveSearchQuery]);

  // Always compute co-located / same-address / same-city clusters so 2+ chargers at the same location are grouped
  const coLocatedClusters: ChargerCluster<ChargingStation>[] = useMemo(() => {
    return groupCoLocatedChargingStations(visibleStations);
  }, [visibleStations]);

  // Compute spatial clusters or co-located location clusters based on mode
  const clusters: ChargerCluster<ChargingStation>[] = useMemo(() => {
    if (showIndividualMarkers) {
      return coLocatedClusters;
    }
    return clusterChargingStations(visibleStations, currentZoom);
  }, [visibleStations, currentZoom, showIndividualMarkers, coLocatedClusters]);

  const [selectedClusterStationIds, setSelectedClusterStationIds] = useState<string[] | null>(null);

  // Resolve all stations belonging to the currently selected location cluster (2+ chargers in the same location/city)
  const activeLocationStations: ChargingStation[] = useMemo(() => {
    if (!selectedStation) return [];

    if (
      selectedClusterStationIds &&
      selectedClusterStationIds.length >= 2 &&
      selectedClusterStationIds.includes(selectedStation.id)
    ) {
      const resolved = selectedClusterStationIds
        .map(id => visibleStations.find(s => s.id === id) || stations.find(s => s.id === id))
        .filter((s): s is ChargingStation => Boolean(s));
      if (resolved.length >= 2) return resolved;
    }

    const matchingCoLocated = coLocatedClusters.find(c =>
      c.stations.some(s => s.id === selectedStation.id)
    );
    if (matchingCoLocated && matchingCoLocated.stations.length >= 2) {
      return matchingCoLocated.stations;
    }

    return [selectedStation];
  }, [selectedStation, selectedClusterStationIds, coLocatedClusters, visibleStations, stations]);

  const activeClusterLocationLabel = useMemo(() => {
    if (activeLocationStations.length === 0) return '';
    return resolveClusterLocationLabel(activeLocationStations);
  }, [activeLocationStations]);

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

    // Observe container resizes dynamically to prevent map canvas blackout during layout transitions
    let resizeObserver: ResizeObserver | null = null;
    if (mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize({ pan: false });
        }
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    // Ensure proper sizing after mount
    setTimeout(() => {
      map.invalidateSize({ pan: false });
    }, 150);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Auto-fit map bounds once when minimal database stations load so all India chargers are visible
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || hasAutoFittedRef.current) return;
    if (visibleStations.length >= 25) {
      hasAutoFittedRef.current = true;
      try {
        const bounds = L.latLngBounds(
          visibleStations.map(s => [s.latitude, s.longitude] as [number, number])
        );
        if (bounds.isValid()) {
          const targetZoom = map.getBoundsZoom(bounds, false, L.point(20, 20));
          if (targetZoom <= 5) {
            map.setView([15.6, 77.5], 5, { animate: false });
          } else {
            map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 });
          }
        }
      } catch {
        // Ignore fitBounds error
      }
    }
  }, [visibleStations]);

  // Render clustered and individual charger markers whenever clusters or selectedStation update
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = markersLayerRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    const coordCountMap = new Map<string, number>();

    clusters.forEach(item => {
      if (item.isCluster) {
        const hasSelectedInside = item.stations.some(s => s.id === selectedStation?.id);
        const locTitle = item.locationLabel || `${item.count} Chargers`;
        const clusterSize = hasSelectedInside ? 44 : 38;
        const ringColor = hasSelectedInside ? '#A855F7' : '#8B5CF6';
        const boltColor = hasSelectedInside ? '#F0ABFC' : '#D8B4FE';
        const outerHalo = hasSelectedInside
          ? '0 0 0 4px rgba(168, 85, 247, 0.35), 0 0 18px rgba(168, 85, 247, 0.65), 0 4px 10px rgba(0, 0, 0, 0.9)'
          : '0 0 0 4px rgba(139, 92, 246, 0.25), 0 0 14px rgba(139, 92, 246, 0.5), 0 4px 10px rgba(0, 0, 0, 0.88)';

        const clusterHtml = `
          <div data-testid="charger-cluster-pin" data-cluster-count="${item.count}" style="
            position: relative;
            width: ${clusterSize}px;
            height: ${clusterSize}px;
            border-radius: 9999px;
            background: radial-gradient(circle at 32% 28%, #2A1742 0%, #120A1F 75%, #08040D 100%);
            border: 2px solid ${ringColor};
            box-shadow: ${outerHalo};
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1.5px;
            transform: ${hasSelectedInside ? 'scale(1.08)' : 'scale(1)'};
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            cursor: pointer;
          " title="${item.count} chargers at ${locTitle} — Tap to view chargers">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="${boltColor}" style="flex-shrink: 0;">
              <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" />
            </svg>
            <span style="
              color: #FFFFFF;
              font-family: 'JetBrains Mono', monospace;
              font-weight: 800;
              font-size: ${item.count >= 10 ? '12px' : '13px'};
              letter-spacing: -0.03em;
              line-height: 1;
            ">${item.count}</span>
          </div>
        `;

        const icon = L.divIcon({
          html: clusterHtml,
          className: 'ghost-charger-cluster-icon',
          iconSize: [clusterSize, clusterSize],
          iconAnchor: [clusterSize / 2, clusterSize / 2]
        });

        const marker = L.marker([item.latitude, item.longitude], {
          icon,
          title: `${item.count} Chargers at ${locTitle}`,
          zIndexOffset: 1000 + item.count * 10
        });
        const handleSelectCluster = () => {
          playTacticalClick();
          let isWideRegionalCluster = false;
          try {
            const clusterBounds = L.latLngBounds(
              item.stations.map(s => [s.latitude, s.longitude] as [number, number])
            );
            const spanKm =
              item.stations.length >= 2
                ? calculateDistanceKm(
                    clusterBounds.getSouthWest().lat,
                    clusterBounds.getSouthWest().lng,
                    clusterBounds.getNorthEast().lat,
                    clusterBounds.getNorthEast().lng
                  )
                : 0;
            if (spanKm > 20 && map.getZoom() < 10) {
              isWideRegionalCluster = true;
              map.fitBounds(clusterBounds, { padding: [36, 36], maxZoom: 10, animate: true });
            } else if (spanKm > 4 && map.getZoom() < 11) {
              map.fitBounds(clusterBounds, { padding: [36, 36], maxZoom: 12, animate: true });
            } else {
              const nextZoom = Math.max(map.getZoom(), 12);
              map.setView([item.latitude, item.longitude], nextZoom, { animate: true });
            }
          } catch {
            const nextZoom = Math.max(map.getZoom(), 11);
            map.setView([item.latitude, item.longitude], nextZoom, { animate: true });
          }

          if (isWideRegionalCluster) {
            setSelectedClusterStationIds(null);
            const targetStation =
              item.stations.find(s => s.id === selectedStation?.id) || item.stations[0];
            if (targetStation) {
              onSelectStation(targetStation);
            }
          } else {
            setSelectedClusterStationIds(item.stations.map(s => s.id));
            const targetStation =
              item.stations.find(s => s.id === selectedStation?.id) || item.stations[0];
            if (targetStation) {
              onSelectStation(targetStation);
            }
            setTimeout(() => {
              const anchor = document.getElementById('selected-charger-details-anchor');
              if (anchor && !isFullNavigation) {
                anchor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            }, 120);
          }
        };
        marker.on('click', handleSelectCluster);
        marker.addTo(layerGroup);
      } else {
        const st = item.stations[0];
        if (!st) return;
        const isSelected = selectedStation?.id === st.id;
        const effectiveType: ChargerPlugType =
          st.chargerType || (st.isSupernova ? 'Supernova' : 'Socket');
        const isSupernova =
          effectiveType === 'Supernova' || st.isSupernova || st.chargerSource === 'Supernova';

        const isCommunity =
          st.chargerSource === 'Community Provided Charger' || (st as any).isCommunityCharger;
        const isType6 = effectiveType === 'Type 6';
        const isSocket = effectiveType === 'Socket';

        const size = isSelected ? 38 : 31;
        const iconSize: [number, number] = [size, size];
        const iconAnchor: [number, number] = [size / 2, size / 2];
        const glyphSize = isSelected ? 16 : 13;

        let ringColor = '#94A3B8';
        let glowRgba = 'rgba(148, 163, 184, 0.5)';
        let coreBg = 'radial-gradient(circle at 30% 30%, #1E293B, #0F172A 85%)';
        let innerSvg = `
          <svg viewBox="0 0 24 24" width="${glyphSize}" height="${glyphSize}" fill="#94A3B8">
            <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" />
          </svg>
        `;
        let typeLabel = 'Type 2 AC';

        if (isSupernova) {
          ringColor = '#3B82F6';
          glowRgba = 'rgba(59, 130, 246, 0.65)';
          coreBg = 'radial-gradient(circle at 30% 30%, #0D2342, #061021 85%)';
          typeLabel = 'Supernova DC Fast';
          innerSvg = `
            <svg viewBox="0 0 24 24" width="${glyphSize}" height="${glyphSize}" fill="#3B82F6">
              <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" />
            </svg>
          `;
        } else if (isCommunity) {
          ringColor = '#E8AA45';
          glowRgba = 'rgba(232, 170, 69, 0.6)';
          coreBg = 'radial-gradient(circle at 30% 30%, #292011, #110D07 85%)';
          typeLabel = 'Community Provided Charger';
          innerSvg = `
            <svg viewBox="0 0 24 24" width="${glyphSize}" height="${glyphSize}" fill="none" stroke="#E8AA45" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="rgba(232, 170, 69, 0.18)" />
              <path d="M13 7L9 13h4l-1 4 4-6h-4l1-4z" fill="#E8AA45" stroke="none" />
            </svg>
          `;
        } else if (isType6) {
          ringColor = '#42B883';
          glowRgba = 'rgba(66, 184, 131, 0.6)';
          coreBg = 'radial-gradient(circle at 30% 30%, #0F2922, #07120F 85%)';
          typeLabel = 'Type 6 Fast Charging';
          innerSvg = `
            <svg viewBox="0 0 24 24" width="${glyphSize}" height="${glyphSize}" fill="#42B883">
              <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" />
            </svg>
          `;
        } else if (isSocket) {
          ringColor = '#EF4444';
          glowRgba = 'rgba(239, 68, 68, 0.5)';
          coreBg = 'radial-gradient(circle at 30% 30%, #2A0F0F, #120606 85%)';
          typeLabel = '15A/16A Socket';
          innerSvg = `
            <svg viewBox="0 0 24 24" width="${glyphSize}" height="${glyphSize}" fill="none" stroke="#EF4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8.5" r="1.4" fill="#EF4444" stroke="none" />
              <circle cx="8.5" cy="14" r="1.3" fill="#EF4444" stroke="none" />
              <circle cx="15.5" cy="14" r="1.3" fill="#EF4444" stroke="none" />
            </svg>
          `;
        }

        const pinHtml = `
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            width: ${size}px;
            height: ${size}px;
            border-radius: 9999px;
            background: ${coreBg};
            border: ${isSelected ? '2.5px' : '2px'} solid ${ringColor};
            box-shadow: 0 0 0 ${isSelected ? '3px' : '1.5px'} rgba(8, 10, 14, 0.9), 0 0 ${
              isSelected ? '14px' : '8px'
            } ${glowRgba}, 0 3px 6px rgba(0, 0, 0, 0.85);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            transform: ${isSelected ? 'scale(1.12)' : 'scale(1)'};
            cursor: pointer;
          " title="${st.name} (${typeLabel})">
            ${innerSvg}
          </div>
        `;

        const displayTitle = st.referenceName || st.name;
        const formattedType = formatMinimalChargerType(
          st.rawChargerType ?? st.chargerDetails ?? st.chargerType
        );
        const exactCoordsText =
          st.exactLocationCoordinates || `${st.latitude.toFixed(6)}, ${st.longitude.toFixed(6)}`;

        const icon = L.divIcon({
          html: pinHtml,
          className: 'ghost-charger-pin-icon',
          iconSize,
          iconAnchor
        });

        // Apply tiny deterministic radial separation ONLY when multiple records share identical GPS coordinates
        const coordKey = `${st.latitude.toFixed(5)},${st.longitude.toFixed(5)}`;
        const seenIndex = coordCountMap.get(coordKey) || 0;
        coordCountMap.set(coordKey, seenIndex + 1);
        let markerLat = st.latitude;
        let markerLng = st.longitude;
        if (seenIndex > 0) {
          const angle = (seenIndex * 137.5 * Math.PI) / 180;
          const radiusDeg = 0.00022 * Math.ceil(seenIndex / 2);
          markerLat = Number((st.latitude + Math.cos(angle) * radiusDeg).toFixed(6));
          markerLng = Number((st.longitude + Math.sin(angle) * radiusDeg).toFixed(6));
        }

        const marker = L.marker([markerLat, markerLng], {
          icon,
          title: `${displayTitle} (${exactCoordsText}) — ${formattedType}`,
          zIndexOffset: isSelected ? 900 : 100
        });
        marker.on('click', () => {
          playTacticalClick();
          setSelectedClusterStationIds(null);
          onSelectStation(st);
        });
        marker.addTo(layerGroup);
      }
    });
  }, [clusters, selectedStation, onSelectStation, playTacticalClick, isFullNavigation]);

  const handleFitAllStationsOnMap = useCallback(() => {
    playTacticalClick();
    setActiveRegionPreset('all_markers');
    const map = mapInstanceRef.current;
    if (!map || visibleStations.length === 0) return;
    try {
      const bounds = L.latLngBounds(
        visibleStations.map(s => [s.latitude, s.longitude] as [number, number])
      );
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12, animate: true });
      }
    } catch {
      // Ignore bounds error
    }
  }, [playTacticalClick, visibleStations]);

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
    handleUpdateSearchQuery(place.name);
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
      className="bg-[#0B0E14] border border-[#232934] rounded-2xl p-3.5 sm:p-5 space-y-3.5 font-mono text-xs shadow-xl"
    >
      {/* Clean, User-Friendly Map Control Panel */}
      <div className="flex flex-col gap-3">
        {/* Row 1: Map Title, Active Count & View Mode Controls */}
        <div className="flex items-center justify-between gap-1.5 sm:gap-2 pb-2.5 border-b border-[#1B212C]">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#131924] border border-[#38BDF8]/40 flex items-center justify-center text-[#38BDF8] shrink-0 shadow-inner">
              <Compass className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h2 className="text-[11px] sm:text-sm font-bold text-[#F8FAFC] tracking-wide uppercase font-sans whitespace-nowrap">
                  Charger Map
                </h2>
                <span
                  data-testid="map-visible-markers-badge"
                  className="px-1.5 sm:px-2 py-0.5 rounded-full text-[9.5px] sm:text-[10px] bg-[#42B883]/15 text-[#42B883] border border-[#42B883]/35 font-bold whitespace-nowrap"
                >
                  {visibleStations.length} Active
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {databaseStats && databaseStats.totalRecordsLoaded > 0 && (
              <div
                data-testid="minimal-db-status-strip"
                className="hidden md:flex items-center gap-1.5 text-[10px]"
              >
                <span className="px-2 py-1 rounded-full bg-[#131720] border border-[#252C38] text-[#94A3B8] whitespace-nowrap">
                  {databaseStats.totalRecordsLoaded} Stations
                </span>
              </div>
            )}

            <button
              type="button"
              data-testid="toggle-marker-clustering-btn"
              onClick={() => {
                playTacticalClick();
                setShowIndividualMarkers(prev => !prev);
              }}
              className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full text-[9.5px] sm:text-[10px] font-bold whitespace-nowrap transition-all border flex items-center gap-1 cursor-pointer ${
                showIndividualMarkers
                  ? 'bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/50'
                  : 'bg-[#131822] hover:bg-[#1A202C] text-[#E8AA45] border-[#E8AA45]/40'
              }`}
              title="Switch between Smart Grouped Circles and All Individual Pins"
            >
              <Layers className="w-3 h-3 shrink-0" />
              <span>{showIndividualMarkers ? 'All Pins' : 'Smart Clusters'}</span>
            </button>
          </div>
        </div>

        {/* Row 2: Station Name, City, Charger Type & GPS Search Bar */}
        <div ref={mapSearchBoxRef} className="relative z-30">
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#38BDF8]" />
              <input
                type="text"
                data-testid="map-station-search-input"
                aria-label="Search charging stations by name, charger type, coordinates, or city"
                value={effectiveSearchQuery}
                onChange={e => {
                  const val = e.target.value;
                  handleUpdateSearchQuery(val);
                  if (mapSearchDebounceRef.current) {
                    clearTimeout(mapSearchDebounceRef.current);
                  }
                  if (val.trim().length < 1) {
                    setMapSearchSuggestions([]);
                    setIsMapDropdownOpen(false);
                    setIsMapSearching(false);
                    return;
                  }
                  setIsMapDropdownOpen(true);
                  if (val.trim().length >= 2) {
                    setIsMapSearching(true);
                    mapSearchDebounceRef.current = setTimeout(() => {
                      executeMapPlaceSearch(val);
                    }, 200);
                  }
                }}
                onFocus={() => {
                  if (effectiveSearchQuery.trim().length >= 1) {
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
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (matchingStationSuggestions.length > 0) {
                      const topStation = matchingStationSuggestions[0];
                      handleFocusStationOnMap(topStation);
                      setIsMapDropdownOpen(false);
                    } else if (isMapDropdownOpen && mapSearchSuggestions.length > 0) {
                      const chosen =
                        mapSearchSuggestions[mapHighlightIdx >= 0 ? mapHighlightIdx : 0];
                      if (chosen) handleSelectMapPlace(chosen);
                    }
                  } else if (e.key === 'Escape') {
                    setIsMapDropdownOpen(false);
                  }
                }}
                placeholder="Search by city, station name, charger type, or coordinates..."
                className="w-full bg-[#12161F] border border-[#262E3B] focus:border-[#38BDF8] rounded-xl pl-10 pr-9 py-2.5 text-xs sm:text-sm text-[#F8FAFC] placeholder-[#64748B] font-sans focus:outline-none transition-colors"
              />
              {isMapSearching ? (
                <Loader2 className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-[#38BDF8] animate-spin" />
              ) : effectiveSearchQuery ? (
                <button
                  type="button"
                  data-testid="clear-map-station-search-btn"
                  aria-label="Clear station search"
                  onClick={() => {
                    handleUpdateSearchQuery('');
                    setMapSearchSuggestions([]);
                    setIsMapDropdownOpen(false);
                    setSearchedPlaceSummary(null);
                    if (searchedPinRef.current) {
                      searchedPinRef.current.remove();
                      searchedPinRef.current = null;
                    }
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#707883] hover:text-[#F1F3F5]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>

            {(effectiveSearchQuery || currentStationFilter !== 'ALL') && (
              <button
                type="button"
                data-testid="view-all-valid-stations-btn"
                onClick={() => {
                  playTacticalClick();
                  handleUpdateSearchQuery('');
                  if (onFilterChange) onFilterChange('ALL');
                  else setInternalFilter('ALL');
                  setIsMapDropdownOpen(false);
                }}
                className="px-3.5 py-2.5 rounded-xl bg-[#161B26] hover:bg-[#1E2534] border border-[#42B883]/50 text-[#42B883] text-xs font-bold whitespace-nowrap cursor-pointer shrink-0"
              >
                Reset
              </button>
            )}
          </div>

          {isMapDropdownOpen && effectiveSearchQuery.trim().length >= 1 && (
            <div
              role="listbox"
              data-testid="map-station-search-results"
              aria-label="Matching charging stations and places"
              className="absolute left-0 right-0 top-full mt-1 z-[10020] bg-[#13161A] border border-[#414851] rounded-lg shadow-2xl max-h-72 overflow-y-auto divide-y divide-[#282D34]"
            >
              {/* Matching Charging Stations from Database */}
              {matchingStationSuggestions.length > 0 && (
                <div className="p-2 bg-[#0D0F12]/90">
                  <div className="px-2 py-1 text-[10px] font-bold text-[#42B883] uppercase tracking-wider flex items-center justify-between">
                    <span>Matching Charging Stations ({matchingStationSuggestions.length})</span>
                    <span>Tap to select &amp; navigate</span>
                  </div>
                  <div className="divide-y divide-[#282D34]/60">
                    {matchingStationSuggestions.map(st => {
                      const dispName = st.referenceName || st.name;
                      const dispCoords =
                        st.exactLocationCoordinates ||
                        `${st.latitude.toFixed(6)}, ${st.longitude.toFixed(6)}`;
                      const dispType = formatMinimalChargerType(
                        st.rawChargerType ?? st.chargerDetails ?? st.chargerType
                      );
                      return (
                        <button
                          key={st.id}
                          type="button"
                          data-testid={`search-result-station-${st.id}`}
                          onMouseDown={e => {
                            e.preventDefault();
                            handleFocusStationOnMap(st);
                            setIsMapDropdownOpen(false);
                          }}
                          className="w-full text-left p-2.5 hover:bg-[#191D22] transition-colors flex items-start justify-between gap-2 cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <Zap className="w-3.5 h-3.5 text-[#42B883] shrink-0" />
                              <span className="text-xs font-bold text-[#F1F3F5] truncate">
                                {dispName}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#E8AA45] font-mono pl-5 truncate mt-0.5">
                              GPS: {dispCoords}
                            </div>
                            <div className="text-[11px] text-[#A0A7B0] font-sans pl-5 truncate">
                              Charger: {dispType}
                            </div>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-[#42B883]/15 border border-[#42B883]/40 text-[#42B883] font-bold shrink-0">
                            Select
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {matchingStationSuggestions.length === 0 &&
                !isMapSearching &&
                mapSearchSuggestions.length === 0 && (
                  <div className="p-3 text-xs text-[#A0A7B0]">
                    No matching stations or places found for &ldquo;{effectiveSearchQuery}&rdquo;.
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
                  className={`p-2.5 cursor-pointer flex items-start justify-between gap-2 transition-colors ${
                    idx === mapHighlightIdx ? 'bg-[#191D22]' : 'hover:bg-[#191D22]/70'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#E8AA45] shrink-0" />
                      <span className="text-xs font-bold text-[#F1F3F5] truncate">{item.name}</span>
                    </div>
                    <div className="text-[11px] text-[#707883] font-sans pl-5 truncate">
                      {item.locality} • {item.address}
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
            <div className="mt-1.5 px-3 py-1.5 rounded-lg bg-[#131822] border border-[#E8AA45]/40 flex items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-[#F1F3F5] truncate">
                <MapPin className="w-3.5 h-3.5 text-[#E8AA45] shrink-0" />
                <span className="font-bold truncate">{searchedPlaceSummary.name}</span>
              </div>
              <span className="text-[10px] text-[#42B883] shrink-0">
                {searchedPlaceSummary.latitude.toFixed(3)}°N, {searchedPlaceSummary.longitude.toFixed(3)}°E
              </span>
            </div>
          )}
        </div>

        {/* Row 3: Collapsible & Expandable Charger Type Filter Bar */}
        <div className="bg-[#10141D] border border-[#242C3A] rounded-xl overflow-hidden font-sans">
          <button
            type="button"
            data-testid="toggle-charger-type-filters-btn"
            aria-expanded={isTypeFiltersExpanded}
            onClick={() => {
              playTacticalClick();
              setIsTypeFiltersExpanded(prev => !prev);
            }}
            className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-[#161C28] transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Zap className="w-3.5 h-3.5 text-[#E8AA45] shrink-0" />
              <span className="text-xs font-bold text-[#F1F3F5] tracking-wide uppercase">
                Charger Type Filters
              </span>
              {currentStationFilter !== 'ALL' && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#E8AA45]/20 text-[#E8AA45] border border-[#E8AA45]/40 font-bold uppercase shrink-0">
                  Filter: {currentStationFilter}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono text-[#E8AA45] font-bold">
              <span>{isTypeFiltersExpanded ? 'Collapse Filters' : 'Filter by Plug Type'}</span>
              {isTypeFiltersExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </button>

          {isTypeFiltersExpanded && (
            <div
              data-testid="map-charger-type-filter-bar"
              role="group"
              aria-label="Filter charging stations on map by type"
              className="p-2.5 border-t border-[#242C3A] grid grid-cols-3 sm:grid-cols-6 gap-1.5"
            >
              {MAP_STATION_FILTER_OPTIONS.map(opt => {
                const isSelected =
                  currentStationFilter === opt.id ||
                  (opt.id === 'SUPERNOVA' &&
                    (currentStationFilter === 'Supernova' || currentStationFilter === 'UV_SUPERNOVA')) ||
                  (opt.id === 'Community Provided Chargers' &&
                    (currentStationFilter === 'COMMUNITY' || currentStationFilter === 'OWNERS')) ||
                  (opt.id === 'BOLT_TYPE_6' &&
                    (currentStationFilter === 'Type 6' || currentStationFilter === 'TYPE_6')) ||
                  (opt.id === 'TYPE_2' && currentStationFilter === 'Type 2') ||
                  (opt.id === 'SOCKET' &&
                    (currentStationFilter === 'Socket' || currentStationFilter === 'SOCKETS'));
                const count = filterCounts[opt.id] ?? 0;

                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`map-filter-chip-${opt.id.toLowerCase().replace(/\s+/g, '-')}`}
                    aria-pressed={isSelected}
                    onClick={() => handleSelectStationFilter(opt.id)}
                    className={`px-1.5 sm:px-2.5 py-1.5 sm:py-2 rounded-xl text-[9.5px] sm:text-xs font-bold whitespace-nowrap transition-all flex items-center justify-between gap-0.5 sm:gap-1 border cursor-pointer ${
                      isSelected
                        ? opt.activeStyle
                        : 'bg-[#12161F] hover:bg-[#181E2A] text-[#E2E8F0] border-[#242B38]'
                    }`}
                  >
                    <span className="flex items-center gap-1 min-w-0">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isSelected ? 'bg-[#08090B]' : opt.dotColor
                        }`}
                      />
                      <span className="tracking-tight">{opt.shortLabel}</span>
                    </span>
                    <span
                      className={`px-1 py-0.5 rounded-full text-[8.5px] sm:text-[10px] font-mono font-bold shrink-0 ${
                        isSelected
                          ? 'bg-[#08090B]/20 text-[#08090B]'
                          : 'bg-[#1C222E] text-[#94A3B8]'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Map Canvas + Selected Charger Details */}
      <div className="space-y-3">
        <div
          data-testid={isFullNavigation ? 'charging-map-fullscreen-overlay' : undefined}
          className={`transition-all duration-200 ${
            isFullNavigation
              ? 'fixed inset-0 z-[9999] bg-[#08090B] flex flex-col w-screen h-screen'
              : 'relative rounded-2xl overflow-hidden border border-[#242B38] bg-[#08090B] shadow-inner'
          }`}
          style={isFullNavigation ? { paddingTop: 'max(env(safe-area-inset-top), 12px)' } : undefined}
        >
          {/* Full Navigation HUD Header Bar */}
          {isFullNavigation && (
            <div className="flex flex-col gap-2 px-3 py-2 bg-[#0D1015] border-b border-[#282D34] shrink-0 z-30">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  data-testid="exit-full-navigation-btn"
                  onClick={() => {
                    playTacticalClick();
                    setIsFullNavigation(false);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#191D22] hover:bg-[#252A30] border border-[#E8AA45] text-[#E8AA45] font-mono font-bold text-xs uppercase transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Exit Full Map</span>
                </button>

                <div className="flex flex-wrap items-center gap-1">
                  {REGION_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleFlyToPreset(preset)}
                      className="px-2 py-1 rounded bg-[#13161A] hover:bg-[#252A30] border border-[#282D34] text-[#D4D8DE] text-[10px] font-bold uppercase whitespace-nowrap"
                    >
                      {preset.shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filter chips inside Full Screen Map too */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {MAP_STATION_FILTER_OPTIONS.map(opt => {
                  const isSelected = currentStationFilter === opt.id;
                  const count = filterCounts[opt.id] ?? 0;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectStationFilter(opt.id)}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold whitespace-nowrap flex items-center justify-between gap-1 border cursor-pointer ${
                        isSelected
                          ? opt.activeStyle
                          : 'bg-[#13161A] text-[#D4D8DE] border-[#282D34]'
                      }`}
                    >
                      <span className="flex items-center gap-1 truncate">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            isSelected ? 'bg-[#08090B]' : opt.dotColor
                          }`}
                        />
                        <span className="truncate">{opt.shortLabel}</span>
                      </span>
                      <span className="opacity-80">({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div
            ref={mapContainerRef}
            data-testid="leaflet-charging-map"
            className={`w-full z-10 transition-all ${
              isFullNavigation ? 'h-full flex-1' : 'h-[370px] sm:h-[450px]'
            }`}
          />

          {/* Clean Circular Icon Legend & Full Screen Footer Bar */}
          <div className="bg-[#0E131B] border-t border-[#222936] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-[11px] font-sans z-20">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="flex items-center gap-1.5 text-[#3B82F6] font-medium">
                <span className="w-3.5 h-3.5 rounded-full bg-[#0D2342] border-2 border-[#3B82F6] inline-flex items-center justify-center text-[8px] shadow-sm">⚡</span>
                Supernova
              </span>
              <span className="flex items-center gap-1.5 text-[#E8AA45] font-medium">
                <span className="w-3.5 h-3.5 rounded-full bg-[#191309] border-2 border-[#E8AA45] inline-flex items-center justify-center text-[8px] shadow-sm">⚡</span>
                Community
              </span>
              <span className="flex items-center gap-1.5 text-[#42B883] font-medium">
                <span className="w-3.5 h-3.5 rounded-full bg-[#0F2922] border-2 border-[#42B883] inline-flex items-center justify-center text-[8px] shadow-sm">⚡</span>
                Type 6
              </span>
              <span className="flex items-center gap-1.5 text-[#94A3B8] font-medium">
                <span className="w-3.5 h-3.5 rounded-full bg-[#1E293B] border-2 border-[#94A3B8] inline-flex items-center justify-center text-[8px] shadow-sm">⚡</span>
                Type 2
              </span>
              <span className="flex items-center gap-1.5 text-[#EF4444] font-medium">
                <span className="w-3.5 h-3.5 rounded-full bg-[#2A0F0F] border-2 border-[#EF4444] inline-flex items-center justify-center text-[8px] shadow-sm">•</span>
                Socket
              </span>
              <span className="flex items-center gap-1.5 text-[#A855F7] font-medium">
                <span className="w-4 h-4 rounded-full bg-[#2A1742] border-2 border-[#A855F7] inline-flex items-center justify-center text-[8px] text-[#E9D5FF] font-mono font-bold shadow-sm">3</span>
                Multi-Charger Circle
              </span>
            </div>
            <button
              type="button"
              data-testid="charging-map-view-full-navigation-btn"
              onClick={() => {
                playTacticalClick();
                setIsFullNavigation(prev => !prev);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161D2A] hover:bg-[#38BDF8] text-[#38BDF8] hover:text-[#08090B] border border-[#38BDF8]/40 font-mono font-bold text-[10px] uppercase transition-colors cursor-pointer shrink-0"
            >
              <Maximize2 className="w-3 h-3" />
              <span>{isFullNavigation ? 'Exit Full Map' : 'Full Screen Map'}</span>
            </button>
          </div>

          {/* Full Navigation Interactive Slide-Up Charger Details Drawer */}
          {isFullNavigation && selectedStation && (
            <div
              data-testid="fullscreen-charger-details-drawer"
              className="absolute bottom-4 left-3 right-3 sm:left-auto sm:right-5 sm:bottom-5 sm:max-w-sm max-h-[75vh] overflow-y-auto z-[1000] bg-[#0D1117]/95 backdrop-blur-md border border-[#E8AA45] rounded-xl p-4 shadow-2xl space-y-3 font-mono text-xs"
            >
              <div className="flex items-start justify-between gap-2 pb-2 border-b border-[#282D34]">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="px-2 py-0.5 rounded bg-[#42B883]/20 text-[#42B883] text-[9px] font-bold uppercase">
                      {selectedStation.operatingStatus}
                    </span>
                    <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase ${selectedBadgeStyle.bg} ${selectedBadgeStyle.text} ${selectedBadgeStyle.border}`}>
                      {effectiveSelectedType} • {selectedStation.powerOutputKw} kW
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-[#F1F3F5] leading-snug">
                    {selectedStation.name}
                  </h3>
                </div>
                <button
                  type="button"
                  data-testid="close-fullscreen-drawer-btn"
                  onClick={e => {
                    e.stopPropagation();
                    playTacticalClick();
                    onSelectStation(null as any);
                  }}
                  className="p-1.5 rounded-lg bg-[#191D22] hover:bg-[#252A30] text-[#A0A7B0] hover:text-white cursor-pointer"
                  title="Close station details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {activeLocationStations.length >= 2 && (
                <div
                  data-testid="fullscreen-co-located-chargers-list"
                  className="p-2.5 rounded-lg bg-[#13171F] border border-[#E8AA45]/60 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[10px] font-bold text-[#E8AA45] uppercase">
                    <span>{activeLocationStations.length} Chargers in {activeClusterLocationLabel}</span>
                    <button
                      type="button"
                      onClick={() => {
                        playTacticalClick();
                        setIsFullNavigation(false);
                      }}
                      className="underline text-[#F1F3F5] hover:text-[#E8AA45] cursor-pointer"
                    >
                      View All Below Map
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                    {activeLocationStations.map((st, idx) => {
                      const isCurr = st.id === selectedStation.id;
                      const stType: ChargerPlugType =
                        st.chargerType || (st.isSupernova ? 'Supernova' : 'Socket');
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => {
                            playTacticalClick();
                            onSelectStation(st);
                          }}
                          className={`text-left px-2 py-1.5 rounded border text-[10px] flex items-center justify-between gap-2 cursor-pointer ${
                            isCurr
                              ? 'bg-[#E8AA45]/15 border-[#E8AA45] text-[#F1F3F5] font-bold'
                              : 'bg-[#0D1117] border-[#282D34] text-[#A0A7B0] hover:text-white'
                          }`}
                        >
                          <span className="truncate">
                            #{idx + 1} {st.name}
                          </span>
                          <span className="shrink-0 text-[#E8AA45]">
                            {stType} • {st.powerOutputKw}kW
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="text-[11px] text-[#A0A7B0] flex items-start gap-1.5 font-sans">
                <MapPin className="w-3.5 h-3.5 text-[#E8AA45] shrink-0 mt-0.5" />
                <span>{selectedStation.location}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px] p-2.5 rounded-lg bg-[#13171F] border border-[#282D34]">
                <div>
                  <span className="text-[#707883] block">ACCESS</span>
                  <span className="font-bold text-[#D4D8DE]">{selectedStation.accessConditions}</span>
                </div>
                <div>
                  <span className="text-[#707883] block">PRICING</span>
                  <span className="font-bold text-[#E8AA45]">{selectedStation.pricing || 'Standard'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={buildChargerNavigationUrl(selectedStation, userOrigin)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => {
                    e.preventDefault();
                    playTacticalClick();
                    openInGoogleMaps(
                      buildChargerNavigationUrl(selectedStation, userOrigin),
                      selectedStation.latitude,
                      selectedStation.longitude,
                      `${selectedStation.name} ${selectedStation.location}`
                    );
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#42B883] hover:bg-[#349e6f] text-[#08090B] font-mono font-bold text-xs uppercase tracking-wider shadow-lg transition-colors cursor-pointer"
                >
                  <NavIcon className="w-3.5 h-3.5" />
                  <span>Navigate in Google Maps</span>
                </a>
                {selectedStation.submittedByPhone && (
                  <a
                    href={buildPhoneDialIntentUri(selectedStation.submittedByPhone)}
                    onClick={e => {
                      e.preventDefault();
                      playTacticalClick();
                      openPhoneDialer(selectedStation.submittedByPhone);
                    }}
                    className="px-3 py-2.5 rounded-lg bg-[#E8AA45] text-[#08090B] font-bold text-xs uppercase hover:bg-white shrink-0"
                  >
                    Call
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Selected Charger Details Panel (Only shown when a charger pin, cluster, or card is selected) */}
        <div id="selected-charger-details-anchor">
          {selectedStation ? (
            <div
              data-testid="selected-charger-info-panel"
              className="bg-[#13161A] border border-[#414851] rounded-xl p-4 space-y-4 shadow-xl"
            >
              {/* Multi-Charger Location Cluster Panel: Shows ALL chargers in this exact location/city */}
              {activeLocationStations.length >= 2 && (
                <div
                  data-testid="co-located-chargers-hub"
                  className="bg-[#0B0E14] border-2 border-[#E8AA45]/70 rounded-xl p-3.5 sm:p-4 space-y-3.5 shadow-lg"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#282D34]">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          data-testid="co-located-chargers-count-badge"
                          className="px-2.5 py-0.5 rounded-full bg-[#E8AA45] text-[#08090B] font-mono text-[11px] font-extrabold uppercase tracking-wider"
                        >
                          {activeLocationStations.length} CHARGERS IN THIS LOCATION
                        </span>
                        <span className="font-mono text-xs font-bold text-[#F1F3F5]">
                          {activeClusterLocationLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#A0A7B0] font-sans">
                        All chargers registered at this location are listed below. Choose any charger to navigate, call the host, or book a charging slot.
                      </p>
                    </div>
                  </div>

                  <div
                    data-testid="co-located-chargers-list"
                    className="grid grid-cols-1 md:grid-cols-2 gap-3"
                  >
                    {activeLocationStations.map((st, idx) => {
                      const isCurrentSelected = st.id === selectedStation.id;
                      const stEffectiveType: ChargerPlugType =
                        st.chargerType || (st.isSupernova ? 'Supernova' : 'Socket');
                      const stBadge = getChargerTypeBadgeStyle(stEffectiveType);
                      const stSubmitter = resolveChargerSubmitterInfo(st);
                      const stTerms = resolveCommunityChargerTerms(st);
                      const stCanModify = canModifyChargerRecord(st, currentUser);
                      const stCoords =
                        st.exactLocationCoordinates ||
                        `${st.latitude.toFixed(6)}, ${st.longitude.toFixed(6)}`;
                      const stPhone = stSubmitter.submitterPhone || st.submittedByPhone || '';

                      return (
                        <div
                          key={st.id}
                          data-testid={`co-located-charger-card-${st.id}`}
                          onClick={() => {
                            playTacticalClick();
                            onSelectStation(st);
                          }}
                          className={`rounded-xl p-3.5 border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                            isCurrentSelected
                              ? 'bg-[#141C26] border-[#42B883] shadow-[0_0_18px_rgba(66,184,131,0.2)]'
                              : 'bg-[#0F1319] border-[#282D34] hover:border-[#E8AA45]/70'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-2 py-0.5 rounded bg-[#1E2631] text-[#D4D8DE] font-mono text-[10px] font-bold">
                                  #{idx + 1}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold uppercase ${stBadge.bg} ${stBadge.text} ${stBadge.border}`}
                                >
                                  {stEffectiveType} • {st.powerOutputKw} kW
                                </span>
                                <span className="px-2 py-0.5 rounded bg-[#13161A] border border-[#282D34] text-[10px] font-mono text-[#A0A7B0]">
                                  {st.chargerSource || (st.isSupernova ? 'Supernova' : 'Station')}
                                </span>
                              </div>

                              {isCurrentSelected ? (
                                <span className="px-2 py-0.5 rounded bg-[#42B883]/20 border border-[#42B883] text-[#42B883] font-mono text-[10px] font-bold uppercase">
                                  ACTIVE / SELECTED
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-[#191D22] border border-[#414851] text-[#E8AA45] font-mono text-[10px] font-bold uppercase">
                                  TAP TO SELECT
                                </span>
                              )}
                            </div>

                            <div>
                              <h4 className="text-sm font-bold text-[#F8FAFC] leading-snug">
                                {st.referenceName || st.name}
                              </h4>
                              <div className="text-[11px] text-[#A0A7B0] font-sans mt-0.5">
                                {st.location}
                              </div>
                              <div className="text-[10px] font-mono text-[#38BDF8] mt-0.5">
                                GPS: {stCoords}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-[#090C10] border border-[#1E2631] rounded-lg p-2">
                              <div>
                                <span className="text-[#707883] block">HOURS / ACCESS</span>
                                <span className="text-[#F1F3F5] font-semibold truncate block">
                                  {stTerms.isCommunityProvided
                                    ? stTerms.availabilityTimeText
                                    : st.accessConditions || 'Public 24/7'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[#707883] block">PRICING</span>
                                <span className="text-[#E8AA45] font-bold truncate block">
                                  {stTerms.isCommunityProvided
                                    ? stTerms.formattedPricingBadge
                                    : st.pricing || 'Standard'}
                                </span>
                              </div>
                            </div>

                            {(stSubmitter.isCommunityProvided || st.reportedBy || stPhone) && (
                              <div className="px-2.5 py-1.5 rounded bg-[#16130D] border border-[#E8AA45]/30 flex flex-wrap items-center justify-between gap-1.5 text-[11px] font-mono">
                                <span className="text-[#D4D8DE]">
                                  Host/Contact:{' '}
                                  <strong className="text-[#F8FAFC]">
                                    {stSubmitter.submitterName || st.reportedBy || 'Squadron Host'}
                                  </strong>
                                </span>
                                {stPhone && (
                                  <span className="text-[#42B883] font-bold">{stPhone}</span>
                                )}
                              </div>
                            )}

                            {st.userNotes && (
                              <div className="text-[11px] text-[#CBD5E1] font-sans bg-[#090C10] border border-[#1E2631] rounded px-2.5 py-1.5">
                                {st.userNotes}
                              </div>
                            )}
                          </div>

                          <div
                            className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#1E2631]"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              data-testid={`select-co-located-charger-${st.id}`}
                              onClick={() => {
                                playTacticalClick();
                                onSelectStation(st);
                              }}
                              className={`px-3 py-2 rounded-lg font-mono text-[10px] font-bold uppercase cursor-pointer transition-colors ${
                                isCurrentSelected
                                  ? 'bg-[#42B883] text-[#08090B]'
                                  : 'bg-[#191D22] hover:bg-[#252A30] text-[#F1F3F5] border border-[#414851]'
                              }`}
                            >
                              {isCurrentSelected ? 'Selected Below' : 'Choose Charger'}
                            </button>

                            <a
                              href={buildChargerNavigationUrl(st, userOrigin)}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid={`navigate-co-located-charger-${st.id}`}
                              onClick={e => {
                                e.preventDefault();
                                playTacticalClick();
                                openInGoogleMaps(
                                  buildChargerNavigationUrl(st, userOrigin),
                                  st.latitude,
                                  st.longitude,
                                  st.referenceName || st.name
                                );
                              }}
                              className="flex-1 px-3 py-2 rounded-lg bg-[#E8AA45] hover:bg-[#d89b38] text-[#08090B] font-mono text-[10px] font-bold uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <NavIcon className="w-3.5 h-3.5" />
                              <span>Navigate</span>
                            </a>

                            {stPhone && (
                              <a
                                href={buildPhoneDialIntentUri(stPhone)}
                                data-testid={`call-co-located-charger-${st.id}`}
                                onClick={e => {
                                  e.preventDefault();
                                  playTacticalClick();
                                  openPhoneDialer(stPhone);
                                }}
                                className="px-3 py-2 rounded-lg bg-[#42B883]/20 hover:bg-[#42B883]/30 border border-[#42B883]/60 text-[#42B883] font-mono text-[10px] font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <Phone className="w-3 h-3" />
                                <span>Call</span>
                              </a>
                            )}

                            {stCanModify && (
                              <button
                                type="button"
                                onClick={() => {
                                  playTacticalClick();
                                  onEditStation(st);
                                }}
                                className="p-2 rounded-lg bg-[#191D22] hover:bg-[#252A30] text-[#E8AA45] border border-[#414851] cursor-pointer"
                                title="Edit Charger"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Compact Marker Information Panel (Station/Reference Name, Exact GPS Coordinates, Charger Type, Navigate) */}
              <div
                data-testid="compact-marker-info-panel"
                className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-3.5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-[#42B883]/20 text-[#42B883] border border-[#42B883]/40 text-[10px] font-bold uppercase">
                        CHARGING STATION
                      </span>
                      { effectiveSelectedType && (
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${selectedBadgeStyle.bg} ${selectedBadgeStyle.text} ${selectedBadgeStyle.border}`}
                        >
                          {effectiveSelectedType}
                        </span>
                      )}
                      {selectedStation.isUnverifiedAssociation && (
                        <span
                          data-testid="marker-unverified-association-badge"
                          className="px-2 py-0.5 rounded bg-[#E8AA45]/15 text-[#E8AA45] border border-[#E8AA45]/40 text-[10px] font-bold flex items-center gap-1"
                        >
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>{selectedStation.locationStatus || 'Verify coordinate association'}</span>
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="text-[10px] text-[#707883] uppercase">
                        Station / Reference Name
                      </div>
                      <h3
                        data-testid="marker-panel-reference-name"
                        className="text-sm sm:text-base font-bold text-[#F1F3F5] leading-snug"
                      >
                        {selectedStation.referenceName || selectedStation.name}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {canModifySelected && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            playTacticalClick();
                            onEditStation(selectedStation);
                          }}
                          className="p-2 rounded-lg bg-[#191D22] hover:bg-[#252A30] text-[#D4D8DE] border border-[#414851] cursor-pointer"
                          title="Edit Charger"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-[#E8AA45]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            playTacticalClick();
                            onDeleteStation(selectedStation);
                          }}
                          className="p-2 rounded-lg bg-[#E04F5F]/15 hover:bg-[#E04F5F]/25 text-[#E04F5F] border border-[#E04F5F]/40 cursor-pointer"
                          title="Delete Charger"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        playTacticalClick();
                        onSelectStation(null as any);
                      }}
                      className="p-2 rounded-lg bg-[#191D22] hover:bg-[#252A30] text-[#A0A7B0] hover:text-[#F1F3F5] border border-[#282D34] cursor-pointer"
                      title="Close details"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div className="p-2.5 rounded bg-[#13161A] border border-[#282D34]">
                    <div className="text-[10px] text-[#707883] uppercase">
                      Exact GPS Coordinates
                    </div>
                    <div
                      data-testid="marker-panel-coordinates"
                      className="text-xs font-bold text-[#42B883] font-mono mt-0.5 select-all"
                    >
                      {selectedStation.exactLocationCoordinates ||
                        `${selectedStation.latitude.toFixed(6)}, ${selectedStation.longitude.toFixed(6)}`}
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-[#13161A] border border-[#282D34]">
                    <div className="text-[10px] text-[#707883] uppercase">
                      Charger Type
                    </div>
                    <div
                      data-testid="marker-panel-charger-type"
                      className="text-xs font-bold text-[#E8AA45] font-sans mt-0.5 break-words"
                    >
                      {formatMinimalChargerType(
                        selectedStation.rawChargerType ??
                          selectedStation.chargerDetails ??
                          selectedStation.chargerType
                      )}
                    </div>
                  </div>
                </div>

                {/* Primary Action CTA: Direct Google Maps Navigation */}
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <a
                    href={buildChargerNavigationUrl(selectedStation, userOrigin)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="marker-panel-navigate-btn"
                    onClick={e => {
                      e.preventDefault();
                      playTacticalClick();
                      openInGoogleMaps(
                        buildChargerNavigationUrl(selectedStation, userOrigin),
                        selectedStation.latitude,
                        selectedStation.longitude,
                        selectedStation.referenceName || selectedStation.name
                      );
                    }}
                    className="flex-1 px-4 py-3 rounded-lg bg-[#E8AA45] hover:bg-[#d89b38] text-[#08090B] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md"
                  >
                    <NavIcon className="w-4 h-4" />
                    <span>Navigate (Google Maps Directions)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  {(() => {
                    const submitterInfo = resolveChargerSubmitterInfo(selectedStation);
                    if (!submitterInfo.isCommunityProvided || !submitterInfo.submitterPhone) return null;
                    return (
                      <a
                        href={submitterInfo.telHref}
                        data-testid="selected-charger-call-submitter-btn"
                        className="px-4 py-3 rounded-lg bg-[#42B883]/20 hover:bg-[#42B883]/30 border border-[#42B883]/50 text-[#42B883] font-bold text-xs inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call Host ({submitterInfo.submitterPhone})</span>
                      </a>
                    );
                  })()}
                </div>
              </div>

              {/* Compact 4-Metric Key Strip */}
              {(() => {
                const selectedTerms = resolveCommunityChargerTerms(selectedStation);
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-lg bg-[#0D0F12] border border-[#282D34]">
                      <div className="text-[10px] text-[#707883]">CONNECTOR</div>
                      <div className="text-[#E8AA45] font-bold text-xs mt-0.5 truncate">
                        {selectedStation.chargerType || 'Socket'} ({selectedStation.connectorTypes.join(', ')})
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#0D0F12] border border-[#282D34]">
                      <div className="text-[10px] text-[#707883]">MAX POWER</div>
                      <div className="text-[#42B883] font-bold text-xs mt-0.5">
                        {selectedStation.powerOutputKw} kW
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#0D0F12] border border-[#282D34]">
                      <div className="text-[10px] text-[#707883]">HOURS</div>
                      <div
                        data-testid="selected-charger-availability-time"
                        className="text-[#F1F3F5] font-semibold text-xs truncate mt-0.5"
                      >
                        {selectedTerms.isCommunityProvided
                          ? selectedTerms.availabilityTimeText
                          : selectedStation.accessConditions}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#0D0F12] border border-[#282D34]">
                      <div className="text-[10px] text-[#707883]">PRICING</div>
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
                          : selectedStation.pricing || 'Commercial'}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Community Host Info Strip (Only for Community Chargers) */}
              {(() => {
                const submitterInfo = resolveChargerSubmitterInfo(selectedStation);
                if (!submitterInfo.isCommunityProvided) return null;
                return (
                  <div
                    data-testid="selected-charger-submitter-card"
                    className="px-3 py-2.5 rounded-lg border bg-[#191610] border-[#E8AA45]/40 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div data-testid="map-selected-submitter-panel" className="flex flex-wrap items-center gap-2">
                      <UserIcon className="w-3.5 h-3.5 text-[#E8AA45]" />
                      <span className="text-[#A0A7B0]">Host:</span>
                      <span data-testid="selected-charger-submitter-name" className="font-bold text-[#F1F3F5]">
                        <span data-testid="map-selected-submitter-name">{submitterInfo.submitterName}</span>
                      </span>
                      {submitterInfo.submitterPhone && (
                        <>
                          <span className="text-[#707883]">•</span>
                          <a
                            href={submitterInfo.telHref}
                            data-testid="map-selected-submitter-phone"
                            className="font-bold text-[#42B883] hover:underline"
                          >
                            <span data-testid="selected-charger-submitter-phone">
                              {submitterInfo.submitterPhone}
                            </span>
                          </a>
                        </>
                      )}
                    </div>
                    {selectedStation.userNotes && (
                      <span className="text-[11px] text-[#D4D8DE] font-sans">
                        {selectedStation.userNotes}
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Non-community station notes if present */}
              {!resolveChargerSubmitterInfo(selectedStation).isCommunityProvided && selectedStation.userNotes && (
                <div className="px-3 py-2 rounded-lg bg-[#0D0F12] border border-[#282D34] text-xs text-[#D4D8DE] font-sans">
                  <span className="text-[10px] font-mono text-[#707883] uppercase mr-2">Notes:</span>
                  {selectedStation.userNotes}
                </div>
              )}

              {/* Interactive Reservation System & Charger Intelligence Slot */}
              {selectedChargerReservationAndIntelSlot}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
