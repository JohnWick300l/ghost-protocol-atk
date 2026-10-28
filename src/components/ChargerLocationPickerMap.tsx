import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Search,
  Crosshair,
  CheckCircle2,
  Compass,
  Loader2,
  RefreshCw,
  X,
  Building2,
  Coffee,
  Fuel,
  Navigation,
  SlidersHorizontal
} from 'lucide-react';
import {
  INDIA_CHARGER_LANDMARKS,
  ChargerMapLandmark,
  PlaceSuggestion,
  searchAndRankPlaces,
  describeMapPinLocation,
  calculateDistanceKm,
  validateManualCoordinates,
  formatManualCoordinatesFallback,
  createTacticalOfflineTileDataUrl
} from '../utils/rules';
import {
  loadCachedPlacesFromPhone,
  saveCachedPlacesToPhone
} from '../utils/telemetryCache';

export interface SelectedChargerPlace {
  placeName: string;
  address: string;
  locality?: string;
  category?: string;
  latitude: number;
  longitude: number;
  isFineTuned?: boolean;
}

interface ChargerLocationPickerMapProps {
  latitude: string;
  longitude: string;
  currentStationName: string;
  currentLocationText: string;
  locationError?: string;
  coordinateError?: string;
  onSelectPlace: (place: SelectedChargerPlace) => void;
}

const DEFAULT_MAP_CENTER = { lat: 12.9719, lng: 77.6412 };

export const ChargerLocationPickerMap: React.FC<ChargerLocationPickerMapProps> = ({
  latitude,
  longitude,
  currentStationName,
  currentLocationText,
  locationError,
  coordinateError,
  onSelectPlace
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const activePinRef = useRef<L.Marker | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autocomplete search state
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  // Confirmed place / marker state
  const [selectedPlace, setSelectedPlace] = useState<SelectedChargerPlace | null>(() => {
    const latNum = Number(latitude);
    const lngNum = Number(longitude);
    if (
      latitude !== '' &&
      longitude !== '' &&
      isFinite(latNum) &&
      isFinite(lngNum) &&
      currentLocationText
    ) {
      return {
        placeName: currentStationName || currentLocationText.split(',')[0] || 'Selected Location',
        address: currentLocationText,
        latitude: latNum,
        longitude: lngNum,
        isFineTuned: false
      };
    }
    return null;
  });

  const [pinFeedback, setPinFeedback] = useState<string | null>(null);
  const [showAdvancedCoords, setShowAdvancedCoords] = useState(false);

  // Manual coordinate input & validation state
  const [manualLatInput, setManualLatInput] = useState(latitude || '');
  const [manualLonInput, setManualLonInput] = useState(longitude || '');
  const [manualLatError, setManualLatError] = useState<string | undefined>(undefined);
  const [manualLonError, setManualLonError] = useState<string | undefined>(undefined);
  const [resolvingManualCoords, setResolvingManualCoords] = useState(false);

  const searchReqIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Keep manual coordinate text fields synced when external latitude/longitude props change
  useEffect(() => {
    setManualLatInput(latitude || '');
  }, [latitude]);

  useEffect(() => {
    setManualLonInput(longitude || '');
  }, [longitude]);

  const coordValidationCheck = validateManualCoordinates(latitude, longitude);
  const hasValidCoordinates = coordValidationCheck.valid;

  const activeLat =
    hasValidCoordinates && coordValidationCheck.latitude !== undefined
      ? coordValidationCheck.latitude
      : DEFAULT_MAP_CENTER.lat;
  const activeLng =
    hasValidCoordinates && coordValidationCheck.longitude !== undefined
      ? coordValidationCheck.longitude
      : DEFAULT_MAP_CENTER.lng;

  const pinDescription = useMemo(
    () => describeMapPinLocation(activeLat, activeLng),
    [activeLat, activeLng]
  );

  // Keep latest callbacks/state in ref for Leaflet map listeners
  const onSelectPlaceRef = useRef(onSelectPlace);
  const selectedPlaceRef = useRef(selectedPlace);
  useEffect(() => {
    onSelectPlaceRef.current = onSelectPlace;
    selectedPlaceRef.current = selectedPlace;
  }, [onSelectPlace, selectedPlace]);

  // Close autocomplete dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(ev.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Perform live place search (server-side Nominatim + Photon + verified India commercial POI directory)
  const executePlaceSearch = useCallback(async (queryText: string) => {
    const trimmed = queryText.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      setSearchError(null);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const reqId = ++searchReqIdRef.current;

    setIsLoading(true);
    setSearchError(null);

    const mapCenter = mapInstanceRef.current?.getCenter();
    const biasObj = mapCenter
      ? { latitude: mapCenter.lat, longitude: mapCenter.lng }
      : null;

    // Instant local + phone-cached match preview while server fetches live geographic results
    const phoneCachedPlaces = loadCachedPlacesFromPhone();
    const instantLocal = searchAndRankPlaces(trimmed, phoneCachedPlaces, biasObj);
    if (instantLocal.length > 0) {
      setSuggestions(instantLocal);
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSuggestions(instantLocal);
      setHighlightedIndex(instantLocal.length > 0 ? 0 : -1);
      setIsLoading(false);
      return;
    }

    try {
      const biasParams = biasObj
        ? `&lat=${biasObj.latitude.toFixed(4)}&lon=${biasObj.longitude.toFixed(4)}`
        : '';
      const res = await fetch(
        `/api/places/autocomplete?q=${encodeURIComponent(trimmed)}${biasParams}`,
        { signal: abortController.signal }
      );
      if (reqId !== searchReqIdRef.current) return;

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setSearchError(
          errBody.error ||
            (res.status === 429
              ? 'Location search rate limit reached. Please wait a moment and click Retry.'
              : 'Live place search encountered a network issue. Showing available matches or click Retry.')
        );
        return;
      }
      const data = await res.json();
      if (reqId !== searchReqIdRef.current) return;

      const serverSuggestions: PlaceSuggestion[] = Array.isArray(data.suggestions)
        ? data.suggestions
        : instantLocal;
      if (serverSuggestions.length > 0) {
        saveCachedPlacesToPhone(serverSuggestions);
      }
      setSuggestions(serverSuggestions);
      setHighlightedIndex(serverSuggestions.length > 0 ? 0 : -1);
      if (data.providerError) {
        setSearchError(data.providerError);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || reqId !== searchReqIdRef.current) return;
      if (instantLocal.length > 0) {
        setSuggestions(instantLocal);
        setHighlightedIndex(0);
      } else {
        setSuggestions([]);
      }
      setSearchError(
        'Offline mode: showing verified India landmarks & phone-cached places.'
      );
    } finally {
      if (reqId === searchReqIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Debounced input change handler
  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (val.trim().length < 2) {
      setSuggestions([]);
      setIsDropdownOpen(false);
      setIsLoading(false);
      setSearchError(null);
      return;
    }

    setIsDropdownOpen(true);
    setIsLoading(true);
    debounceTimerRef.current = setTimeout(() => {
      executePlaceSearch(val);
    }, 220);
  };

  // Select a place suggestion from dropdown
  const handleSelectSuggestion = (suggestion: PlaceSuggestion) => {
    const confirmed: SelectedChargerPlace = {
      placeName: suggestion.name,
      address: suggestion.address,
      locality: suggestion.locality,
      category: suggestion.category,
      latitude: Number(suggestion.latitude.toFixed(6)),
      longitude: Number(suggestion.longitude.toFixed(6)),
      isFineTuned: false
    };

    setSelectedPlace(confirmed);
    setSearchQuery(suggestion.name);
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
    setPinFeedback(
      `Selected "${suggestion.name}" — You can drag the map pin or click the map below to fine-tune the exact charger spot.`
    );

    onSelectPlace(confirmed);

    if (mapInstanceRef.current && activePinRef.current) {
      activePinRef.current.setLatLng([confirmed.latitude, confirmed.longitude]);
      mapInstanceRef.current.setView([confirmed.latitude, confirmed.longitude], 16, {
        animate: true
      });
    }
  };

  // Keyboard navigation for autocomplete input
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen && e.key === 'ArrowDown' && suggestions.length > 0) {
      setIsDropdownOpen(true);
      setHighlightedIndex(0);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setHighlightedIndex(prev => (prev + 1) % suggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setHighlightedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
      }
    } else if (e.key === 'Enter') {
      if (isDropdownOpen && suggestions.length > 0) {
        e.preventDefault();
        const targetIdx = highlightedIndex >= 0 ? highlightedIndex : 0;
        const chosen = suggestions[targetIdx];
        if (chosen) {
          handleSelectSuggestion(chosen);
        }
      } else if (searchQuery.trim().length >= 2) {
        e.preventDefault();
        setIsDropdownOpen(true);
        executePlaceSearch(searchQuery);
      }
    } else if (e.key === 'Escape') {
      if (isDropdownOpen) {
        e.preventDefault();
        setIsDropdownOpen(false);
      }
    }
  };

  // Handle manual map click or marker drag (preserves selected place if fine-tuning nearby, or reverse-geocodes new spot)
  const handleManualMapPosition = useCallback(async (lat: number, lng: number, sourceLabel: string) => {
    const cleanLat = Number(lat.toFixed(6));
    const cleanLng = Number(lng.toFixed(6));
    const currentSelected = selectedPlaceRef.current;

    // If user already chose a place and is fine-tuning the pin within 600m (0.6 km) of that place,
    // preserve the chosen place's name & address while saving the fine-tuned charger coordinates!
    if (currentSelected) {
      const distKm = calculateDistanceKm(
        currentSelected.latitude,
        currentSelected.longitude,
        cleanLat,
        cleanLng
      );
      if (distKm <= 0.6) {
        const fineTuned: SelectedChargerPlace = {
          ...currentSelected,
          latitude: cleanLat,
          longitude: cleanLng,
          isFineTuned: true
        };
        setSelectedPlace(fineTuned);
        setPinFeedback(
          `Fine-tuned charger marker within premises (${cleanLat.toFixed(5)}°N, ${cleanLng.toFixed(5)}°E)`
        );
        onSelectPlaceRef.current(fineTuned);
        return;
      }
    }

    // Otherwise resolve address for the manually chosen map location
    const localDesc = describeMapPinLocation(cleanLat, cleanLng);
    const fallback = formatManualCoordinatesFallback(cleanLat, cleanLng);
    const immediatePlace: SelectedChargerPlace = {
      placeName:
        localDesc.distanceKm <= 2.0
          ? localDesc.nearestLandmark.name
          : localDesc.distanceKm <= 25
          ? `${localDesc.nearestLandmark.city} Map Pin`
          : fallback.name,
      address: localDesc.suggestedLocationLabel,
      locality: localDesc.nearestLandmark.city,
      category: 'Map Pin Location',
      latitude: cleanLat,
      longitude: cleanLng,
      isFineTuned: true
    };

    setSelectedPlace(immediatePlace);
    setPinFeedback(`${sourceLabel}: ${cleanLat.toFixed(4)}, ${cleanLng.toFixed(4)}`);
    onSelectPlaceRef.current(immediatePlace);

    // Fetch live reverse-geocoded street/place name from backend
    try {
      const res = await fetch(`/api/places/reverse?lat=${cleanLat}&lon=${cleanLng}`);
      if (res.ok) {
        const rev = await res.json();
        if (rev && rev.reverseGeocodeSuccess !== false && rev.address) {
          const enriched: SelectedChargerPlace = {
            placeName: rev.name || immediatePlace.placeName,
            address: rev.address,
            locality: rev.locality || immediatePlace.locality,
            category: 'Selected on Map',
            latitude: cleanLat,
            longitude: cleanLng,
            isFineTuned: true
          };
          setSelectedPlace(enriched);
          onSelectPlaceRef.current(enriched);
        }
      }
    } catch {
      // Keep immediate local reverse description
    }
  }, []);

  // Validate and confirm manually entered latitude and longitude
  const handleConfirmManualCoordinates = async () => {
    const validation = validateManualCoordinates(manualLatInput, manualLonInput);
    if (!validation.valid || validation.latitude === undefined || validation.longitude === undefined) {
      setManualLatError(validation.latError);
      setManualLonError(validation.lonError);
      return;
    }

    const cleanLat = validation.latitude;
    const cleanLng = validation.longitude;
    setManualLatError(undefined);
    setManualLonError(undefined);
    setResolvingManualCoords(true);

    // Update map marker immediately to exact entered coordinates
    if (mapInstanceRef.current && activePinRef.current) {
      activePinRef.current.setLatLng([cleanLat, cleanLng]);
      mapInstanceRef.current.setView([cleanLat, cleanLng], 15, { animate: true });
    }

    const fallback = formatManualCoordinatesFallback(cleanLat, cleanLng);
    let nextPlaceName = currentStationName.trim() || selectedPlace?.placeName || fallback.name;
    let nextAddress = currentLocationText.trim() || fallback.address;
    let nextLocality = fallback.locality;

    try {
      const res = await fetch(`/api/places/reverse?lat=${cleanLat}&lon=${cleanLng}`);
      if (res.ok) {
        const rev = await res.json();
        if (rev && rev.reverseGeocodeSuccess !== false && rev.address) {
          nextPlaceName = rev.name || nextPlaceName;
          nextAddress = rev.address;
          nextLocality = rev.locality || nextLocality;
        }
      }
    } catch {
      // Preserve valid coordinates and existing/manual address if reverse geocoding fails
    } finally {
      setResolvingManualCoords(false);
    }

    const confirmedManual: SelectedChargerPlace = {
      placeName: nextPlaceName,
      address: nextAddress,
      locality: nextLocality,
      category: 'Manual Coordinates',
      latitude: cleanLat,
      longitude: cleanLng,
      isFineTuned: true
    };

    setSelectedPlace(confirmedManual);
    setPinFeedback(
      `Confirmed manual coordinates: ${cleanLat.toFixed(5)}, ${cleanLng.toFixed(5)}`
    );
    onSelectPlace(confirmedManual);
  };

  const createSelectedPinIcon = () =>
    L.divIcon({
      className: 'ghost-picker-selected-pin',
      html: `
        <div style="
          width: 36px;
          height: 36px;
          border-radius: 9999px;
          background: #0D0F12;
          border: 2.5px solid #E8AA45;
          box-shadow: 0 0 0 6px rgba(232,170,69,0.28), 0 4px 12px rgba(0,0,0,0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #E8AA45;
          font-family: monospace;
          font-weight: 800;
          font-size: 14px;
          cursor: grab;
        ">
          📍
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

  const createLandmarkDotIcon = () =>
    L.divIcon({
      className: 'ghost-picker-landmark-dot',
      html: `
        <div style="
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #13161A;
          border: 1.5px solid #729BCB;
          box-shadow: 0 2px 6px rgba(0,0,0,0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #729BCB;
          font-size: 9px;
          font-family: monospace;
          font-weight: 700;
        " title="Click landmark on map">
          ★
        </div>
      `,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });

  // Mount interactive Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [activeLat, activeLng],
      zoom: hasValidCoordinates ? 14 : 11,
      minZoom: 4,
      maxZoom: 18,
      zoomControl: true
    });

    const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    });
    tileLayer.on('tileerror', (errEvent: any) => {
      const tileImg = errEvent?.tile as HTMLImageElement | undefined;
      if (tileImg && !tileImg.dataset.offlineFallbackApplied) {
        tileImg.dataset.offlineFallbackApplied = 'true';
        const coords = errEvent?.coords;
        tileImg.src = createTacticalOfflineTileDataUrl(coords?.z, coords?.x, coords?.y);
      }
    });
    tileLayer.addTo(map);

    const landmarkGroup = L.layerGroup().addTo(map);
    INDIA_CHARGER_LANDMARKS.forEach(lm => {
      const lmMarker = L.marker([lm.latitude, lm.longitude], {
        icon: createLandmarkDotIcon(),
        title: `${lm.name} (${lm.city})`
      });
      lmMarker.on('click', (ev: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(ev);
        const confirmed: SelectedChargerPlace = {
          placeName: lm.name,
          address: lm.address,
          locality: lm.city,
          category: 'Highway / Urban Landmark',
          latitude: lm.latitude,
          longitude: lm.longitude,
          isFineTuned: false
        };
        setSelectedPlace(confirmed);
        setSearchQuery(lm.name);
        setPinFeedback(`Landmark selected: ${lm.name} (${lm.city})`);
        onSelectPlaceRef.current(confirmed);
        map.setView([lm.latitude, lm.longitude], 15, { animate: true });
      });
      lmMarker.addTo(landmarkGroup);
    });

    const marker = L.marker([activeLat, activeLng], {
      icon: createSelectedPinIcon(),
      draggable: true,
      title: 'Drag marker or click on the map to position charger'
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      handleManualMapPosition(pos.lat, pos.lng, 'Marker fine-tuned');
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng([e.latlng.lat, e.latlng.lng]);
      handleManualMapPosition(e.latlng.lat, e.latlng.lng, 'Location chosen on map');
    });

    activePinRef.current = marker;
    mapInstanceRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 120);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      activePinRef.current = null;
    };
  }, []);

  // Keep map pin synced with external coordinate updates
  useEffect(() => {
    const map = mapInstanceRef.current;
    const marker = activePinRef.current;
    if (!map || !marker || !hasValidCoordinates) return;

    const currentPos = marker.getLatLng();
    if (
      Math.abs(currentPos.lat - activeLat) > 0.00001 ||
      Math.abs(currentPos.lng - activeLng) > 0.00001
    ) {
      marker.setLatLng([activeLat, activeLng]);
      map.setView([activeLat, activeLng], Math.max(map.getZoom(), 14), { animate: true });
    }
  }, [activeLat, activeLng, hasValidCoordinates]);

  const handleSelectQuickLandmark = (lm: ChargerMapLandmark) => {
    const confirmed: SelectedChargerPlace = {
      placeName: lm.name,
      address: lm.address,
      locality: lm.city,
      category: 'Landmark',
      latitude: lm.latitude,
      longitude: lm.longitude,
      isFineTuned: false
    };
    setSelectedPlace(confirmed);
    setSearchQuery(lm.name);
    setIsDropdownOpen(false);
    setPinFeedback(`Selected landmark: ${lm.name} (${lm.city})`);
    onSelectPlace(confirmed);
    if (mapInstanceRef.current && activePinRef.current) {
      activePinRef.current.setLatLng([lm.latitude, lm.longitude]);
      mapInstanceRef.current.setView([lm.latitude, lm.longitude], 15, { animate: true });
    }
  };

  const handleDropPinAtMapCenter = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const center = map.getCenter();
    if (activePinRef.current) {
      activePinRef.current.setLatLng([center.lat, center.lng]);
    }
    handleManualMapPosition(center.lat, center.lng, 'Pin placed at map center');
  };

  const handleNudgeMarker = (deltaLat: number, deltaLng: number, dirLabel: string) => {
    const baseLat = hasValidCoordinates ? Number(latitude) : DEFAULT_MAP_CENTER.lat;
    const baseLng = hasValidCoordinates ? Number(longitude) : DEFAULT_MAP_CENTER.lng;
    const nextLat = Number((baseLat + deltaLat).toFixed(6));
    const nextLng = Number((baseLng + deltaLng).toFixed(6));
    if (activePinRef.current) {
      activePinRef.current.setLatLng([nextLat, nextLng]);
    }
    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo([nextLat, nextLng], { animate: true });
    }
    handleManualMapPosition(nextLat, nextLng, `Marker adjusted (${dirLabel})`);
  };

  const getCategoryIcon = (category?: string) => {
    const c = (category || '').toLowerCase();
    if (c.includes('café') || c.includes('cafe') || c.includes('coffee') || c.includes('restaurant')) {
      return <Coffee className="w-3.5 h-3.5 text-[#E8AA45] shrink-0" />;
    }
    if (c.includes('petrol') || c.includes('fuel') || c.includes('service')) {
      return <Fuel className="w-3.5 h-3.5 text-[#42B883] shrink-0" />;
    }
    if (c.includes('mall') || c.includes('hotel') || c.includes('commercial')) {
      return <Building2 className="w-3.5 h-3.5 text-[#729BCB] shrink-0" />;
    }
    return <MapPin className="w-3.5 h-3.5 text-[#E8AA45] shrink-0" />;
  };

  return (
    <div
      data-testid="charger-location-picker"
      className="p-3.5 rounded-lg bg-[#0D0F12] border border-[#282D34] space-y-3.5"
    >
      {/* ================================================================= */}
      {/* 1. GOOGLE MAPS-STYLE SMART PLACE AUTOCOMPLETE SEARCH */}
      {/* ================================================================= */}
      <div ref={searchContainerRef} className="relative z-30 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="smart-place-search-input"
            className="text-[#F1F3F5] font-bold flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5 text-[#E8AA45]" />
            <span>
              SEARCH LOCATION, CAFÉ, RESTAURANT, LANDMARK OR ADDRESS{' '}
              <span className="text-[#E8AA45]">*</span>
            </span>
          </label>
          <button
            type="button"
            data-testid="toggle-charger-manual-coords-btn"
            onClick={() => {
              setShowAdvancedCoords(prev => !prev);
              setManualLatError(undefined);
              setManualLonError(undefined);
            }}
            className={`px-2 py-0.5 rounded border text-[10px] font-mono uppercase transition-colors cursor-pointer ${
              showAdvancedCoords
                ? 'bg-[#E8AA45]/20 border-[#E8AA45] text-[#E8AA45] font-bold'
                : 'bg-[#13161A] border-[#414851] text-[#D4D8DE] hover:border-[#E8AA45]'
            }`}
          >
            {showAdvancedCoords ? 'Back to Place Search' : 'Enter Coordinates Manually'}
          </button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#707883]" />
          <input
            id="smart-place-search-input"
            type="text"
            role="combobox"
            aria-expanded={isDropdownOpen}
            aria-autocomplete="list"
            aria-controls="smart-place-suggestions-listbox"
            aria-activedescendant={
              highlightedIndex >= 0 && suggestions[highlightedIndex]
                ? `place-option-${suggestions[highlightedIndex].id}`
                : undefined
            }
            value={searchQuery}
            onChange={handleSearchInputChange}
            onFocus={() => {
              if (searchQuery.trim().length >= 2) {
                setIsDropdownOpen(true);
              }
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search Google Maps-style (e.g. Kolar CCD, Cafe Coffee Day Kolar, petrol pump near Kolar, EV charging station Bangalore)..."
            className={`w-full bg-[#08090B] border rounded pl-9 pr-9 py-2 text-[#F1F3F5] text-xs focus:outline-none transition-colors ${
              locationError || coordinateError
                ? 'border-[#E04F5F]'
                : 'border-[#414851] focus:border-[#E8AA45]'
            }`}
          />

          {isLoading ? (
            <Loader2
              data-testid="place-search-loading"
              className="w-4 h-4 absolute right-3 top-2.5 text-[#E8AA45] animate-spin"
            />
          ) : searchQuery ? (
            <button
              type="button"
              aria-label="Clear location search"
              onClick={() => {
                setSearchQuery('');
                setSuggestions([]);
                setIsDropdownOpen(false);
                setSearchError(null);
              }}
              className="absolute right-2.5 top-2.5 text-[#707883] hover:text-[#F1F3F5]"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        {/* Live Autocomplete Suggestions Dropdown */}
        {isDropdownOpen && searchQuery.trim().length >= 2 && (
          <div
            id="smart-place-suggestions-listbox"
            role="listbox"
            aria-label="Matching places in India"
            data-testid="place-autocomplete-dropdown"
            className="absolute left-0 right-0 top-full mt-1 z-[10020] bg-[#13161A] border border-[#414851] rounded-lg shadow-2xl max-h-64 overflow-y-auto divide-y divide-[#282D34]"
          >
            {isLoading && suggestions.length === 0 && (
              <div className="p-3.5 text-xs text-[#A0A7B0] flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-[#E8AA45] animate-spin shrink-0" />
                <span>Searching cafés, restaurants, landmarks & addresses across India...</span>
              </div>
            )}

            {!isLoading && suggestions.length === 0 && (
              <div
                data-testid="no-matching-places"
                className="p-3.5 text-xs text-[#A0A7B0] space-y-2"
              >
                <div className="font-bold text-[#F1F3F5]">No matching places found</div>
                <p className="text-[11px] text-[#707883] font-sans">
                  Try searching with a nearby town, highway, or landmark name, or choose the location directly on the map below.
                </p>
                {searchError && (
                  <button
                    type="button"
                    onClick={() => executePlaceSearch(searchQuery)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#252A30] hover:bg-[#414851] text-[#E8AA45] text-[11px] font-bold"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry Search</span>
                  </button>
                )}
              </div>
            )}

            {suggestions.map((item, idx) => {
              const isHighlighted = idx === highlightedIndex;
              return (
                <div
                  key={item.id}
                  id={`place-option-${item.id}`}
                  role="option"
                  aria-selected={isHighlighted}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onMouseDown={e => {
                    // Prevent input blur before selection fires
                    e.preventDefault();
                    handleSelectSuggestion(item);
                  }}
                  className={`p-3 cursor-pointer transition-colors flex items-start gap-2.5 ${
                    isHighlighted ? 'bg-[#191D22]' : 'hover:bg-[#191D22]/70'
                  }`}
                >
                  <div className="mt-0.5">{getCategoryIcon(item.category)}</div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span className="text-xs font-bold text-[#F1F3F5] truncate">
                        {item.name}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#0D0F12] border border-[#282D34] text-[#E8AA45] font-mono shrink-0">
                        {item.category}
                      </span>
                    </div>
                    <div className="text-[11px] font-semibold text-[#AEB5BE]">
                      {item.locality}
                    </div>
                    <div className="text-[11px] text-[#707883] font-sans leading-snug line-clamp-2">
                      {item.address}
                    </div>
                  </div>
                </div>
              );
            })}

            {searchError && suggestions.length > 0 && (
              <div className="p-2 bg-[#0D0F12] flex items-center justify-between text-[10px] text-[#A0A7B0]">
                <span>{searchError}</span>
                <button
                  type="button"
                  onClick={() => executePlaceSearch(searchQuery)}
                  className="px-2 py-0.5 rounded bg-[#252A30] text-[#E8AA45] font-bold flex items-center gap-1 shrink-0"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span>Retry</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* 2. SELECTED PLACE CONFIRMATION BANNER (CLEARLY DISPLAYED BEFORE SUBMIT) */}
      {/* ================================================================= */}
      {hasValidCoordinates && currentLocationText ? (
        <div
          data-testid="confirmed-location-summary"
          className="p-3 rounded-lg bg-[#13161A] border border-[#42B883]/50 space-y-1.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[#42B883] font-bold text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                SELECTED CHARGER LOCATION:{' '}
                <span className="text-[#F1F3F5]">
                  {selectedPlace?.placeName || currentStationName || 'Verified Pin'}
                </span>
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-[#0D0F12] border border-[#282D34] text-[#E8AA45] font-mono">
              {selectedPlace?.isFineTuned ? 'Marker Fine-Tuned' : 'Exact Place Pin'} •{' '}
              {Number(latitude).toFixed(4)}°N, {Number(longitude).toFixed(4)}°E
            </span>
          </div>

          <div className="text-[11px] text-[#D4D8DE] font-sans leading-relaxed">
            {currentLocationText}
          </div>

          <div className="text-[10px] text-[#A0A7B0] font-sans flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#282D34]">
            <span>
              Tip: If the charger is inside a parking lot or building entrance, drag the 📍 marker on the map below to fine-tune its exact position.
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleNudgeMarker(0.00025, 0, 'North +25m')}
                className="px-1.5 py-0.5 rounded bg-[#0D0F12] hover:bg-[#191D22] border border-[#282D34] text-[#AEB5BE] text-[10px] cursor-pointer"
                title="Fine-tune marker 25m North"
              >
                Fine-Tune Pin (+25m N)
              </button>
              <button
                type="button"
                onClick={() => handleNudgeMarker(0, 0.00025, 'East +25m')}
                className="px-1.5 py-0.5 rounded bg-[#0D0F12] hover:bg-[#191D22] border border-[#282D34] text-[#AEB5BE] text-[10px] cursor-pointer"
                title="Fine-tune marker 25m East"
              >
                Fine-Tune Pin (+25m E)
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          data-testid="unselected-location-prompt"
          className={`p-2.5 rounded bg-[#13161A] border text-[11px] font-sans ${
            locationError || coordinateError
              ? 'border-[#E04F5F] text-[#E04F5F]'
              : 'border-[#282D34] text-[#A0A7B0]'
          }`}
        >
          Search for a café, restaurant, fuel station, or landmark above (e.g.{' '}
          <strong className="text-[#F1F3F5]">Kolar CCD</strong>), or click directly on the map below to place the charger marker.
        </div>
      )}

      {(locationError || coordinateError) && (
        <p role="alert" data-testid="location-selection-error" className="text-[11px] text-[#E04F5F] font-semibold">
          {locationError || coordinateError}
        </p>
      )}

      {/* ================================================================= */}
      {/* 3. PRESERVED MANUAL MAP SELECTION & MARKER FINE-TUNING PREVIEW */}
      {/* ================================================================= */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-[#D4D8DE] font-semibold flex items-center gap-1.5">
            <Navigation className="w-3.5 h-3.5 text-[#E8AA45]" />
            <span>CHOOSE LOCATION ON MAP OR ADJUST MARKER</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (mapInstanceRef.current) {
                  mapInstanceRef.current.setView([20.5937, 78.9629], 5, { animate: true });
                }
              }}
              className="px-2 py-1 rounded bg-[#13161A] hover:bg-[#191D22] text-[#AEB5BE] border border-[#282D34] text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Compass className="w-3 h-3 text-[#729BCB]" />
              <span>India View</span>
            </button>
            <button
              type="button"
              onClick={handleDropPinAtMapCenter}
              className="px-2.5 py-1 rounded bg-[#191D22] hover:bg-[#252A30] text-[#E8AA45] border border-[#E8AA45]/40 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Crosshair className="w-3 h-3" />
              <span>Set Pin at Map Center</span>
            </button>
          </div>
        </div>

        {/* Quick Highway / City Landmark Chips */}
        <div
          role="group"
          aria-label="Quick Landmark Locations"
          className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-1"
        >
          {INDIA_CHARGER_LANDMARKS.map(lm => {
            const isSelected =
              hasValidCoordinates &&
              Math.abs(activeLat - lm.latitude) < 0.001 &&
              Math.abs(activeLng - lm.longitude) < 0.001;
            return (
              <button
                key={lm.id}
                type="button"
                onClick={() => handleSelectQuickLandmark(lm)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors flex items-center gap-1 cursor-pointer ${
                  isSelected
                    ? 'bg-[#E8AA45] text-[#08090B] font-bold'
                    : 'bg-[#13161A] hover:bg-[#191D22] text-[#D4D8DE] border border-[#282D34]'
                }`}
              >
                <MapPin className="w-2.5 h-2.5 shrink-0" />
                <span>
                  {lm.name} ({lm.city})
                </span>
              </button>
            );
          })}
        </div>

        {/* Interactive Leaflet Map Preview & Pin Fine-Tuner */}
        <div className="relative z-0 isolate rounded-lg overflow-hidden border border-[#414851]">
          <div
            ref={mapContainerRef}
            data-testid="charger-picker-map-canvas"
            aria-label="Interactive charger location picker map"
            className="w-full h-[210px] bg-[#08090B] cursor-crosshair"
          />
          <div className="bg-[#13161A] border-t border-[#282D34] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-[#42B883] font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span data-testid="picker-selected-coords">
                {hasValidCoordinates
                  ? `Confirmed Pin: ${activeLat.toFixed(5)}°N, ${activeLng.toFixed(5)}°E`
                  : `Map Preview (${pinDescription.nearestLandmark.city}) — Select place or click map`}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowAdvancedCoords(prev => !prev);
                setManualLatError(undefined);
                setManualLonError(undefined);
              }}
              className="text-[10px] text-[#AEB5BE] hover:text-[#F1F3F5] flex items-center gap-1 cursor-pointer"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>
                {showAdvancedCoords
                  ? 'Hide Manual Coordinates'
                  : 'Enter Coordinates Manually'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {pinFeedback && (
        <div
          role="status"
          data-testid="map-picker-feedback"
          className="text-[11px] text-[#E8AA45] font-mono flex items-center gap-1.5"
        >
          <MapPin className="w-3 h-3 shrink-0" />
          <span>{pinFeedback}</span>
        </div>
      )}

      {/* Optional collapsible manual coordinates & address override */}
      {showAdvancedCoords && (
        <div
          data-testid="charger-manual-coords-panel"
          className="p-3 rounded bg-[#13161A] border border-[#E8AA45]/50 space-y-2.5 text-[11px]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[#E8AA45] font-bold uppercase">
              ENTER COORDINATES MANUALLY (WGS84 DECIMAL)
            </span>
            <button
              type="button"
              onClick={() => setShowAdvancedCoords(false)}
              className="text-[10px] text-[#A0A7B0] hover:text-[#F1F3F5] underline"
            >
              Switch to Place Search
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="station-lat-input" className="block text-[10px] text-[#D4D8DE] mb-1">
                LATITUDE (-90 TO +90) <span className="text-[#E8AA45]">*</span>
              </label>
              <input
                id="station-lat-input"
                data-testid="station-lat-input"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 12.9716"
                value={manualLatInput}
                onChange={e => {
                  setManualLatInput(e.target.value);
                  if (manualLatError) setManualLatError(undefined);
                }}
                className={`w-full bg-[#08090B] border rounded p-1.5 text-[#F1F3F5] font-mono focus:outline-none ${
                  manualLatError ? 'border-[#E04F5F]' : 'border-[#282D34] focus:border-[#E8AA45]'
                }`}
              />
              {manualLatError && (
                <p
                  role="alert"
                  data-testid="station-lat-error"
                  className="text-[10px] text-[#E04F5F] mt-1"
                >
                  {manualLatError}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="station-lng-input" className="block text-[10px] text-[#D4D8DE] mb-1">
                LONGITUDE (-180 TO +180) <span className="text-[#E8AA45]">*</span>
              </label>
              <input
                id="station-lng-input"
                data-testid="station-lng-input"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 77.5946"
                value={manualLonInput}
                onChange={e => {
                  setManualLonInput(e.target.value);
                  if (manualLonError) setManualLonError(undefined);
                }}
                className={`w-full bg-[#08090B] border rounded p-1.5 text-[#F1F3F5] font-mono focus:outline-none ${
                  manualLonError ? 'border-[#E04F5F]' : 'border-[#282D34] focus:border-[#E8AA45]'
                }`}
              />
              {manualLonError && (
                <p
                  role="alert"
                  data-testid="station-lng-error"
                  className="text-[10px] text-[#E04F5F] mt-1"
                >
                  {manualLonError}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="text-[10px] text-[#A0A7B0]">
              Updates map marker &amp; reverse-geocodes address when available.
            </span>
            <button
              type="button"
              data-testid="confirm-charger-manual-coords-btn"
              disabled={resolvingManualCoords}
              onClick={handleConfirmManualCoordinates}
              className="px-3 py-1.5 rounded bg-[#E8AA45] hover:bg-[#E8AA45]/90 text-[#08090B] font-bold text-[11px] uppercase flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
            >
              {resolvingManualCoords ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>Confirm Coordinates</span>
            </button>
          </div>

          <div>
            <label htmlFor="station-location-input" className="block text-[10px] text-[#D4D8DE] mb-1">
              FULL ADDRESS / LOCATION DESCRIPTION <span className="text-[#E8AA45]">*</span>
            </label>
            <input
              id="station-location-input"
              data-testid="station-location-input"
              type="text"
              placeholder="Auto-populated from reverse geocoding or enter manual address description"
              value={currentLocationText}
              onChange={e => {
                const vCheck = validateManualCoordinates(manualLatInput, manualLonInput);
                const useLat =
                  vCheck.valid && vCheck.latitude !== undefined
                    ? vCheck.latitude
                    : hasValidCoordinates
                    ? activeLat
                    : DEFAULT_MAP_CENTER.lat;
                const useLng =
                  vCheck.valid && vCheck.longitude !== undefined
                    ? vCheck.longitude
                    : hasValidCoordinates
                    ? activeLng
                    : DEFAULT_MAP_CENTER.lng;
                onSelectPlace({
                  placeName:
                    selectedPlace?.placeName ||
                    currentStationName ||
                    formatManualCoordinatesFallback(useLat, useLng).name,
                  address: e.target.value,
                  latitude: useLat,
                  longitude: useLng,
                  isFineTuned: true
                });
              }}
              className="w-full bg-[#08090B] border border-[#282D34] rounded p-1.5 text-[#F1F3F5] focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
};
