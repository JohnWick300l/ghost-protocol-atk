import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin, Search, LocateFixed, CheckCircle2, SlidersHorizontal } from 'lucide-react';
import { useAudio } from '../context/AudioContext';

interface MapLocationPickerProps {
  latitude: string;
  longitude: string;
  onSelectCoordinates: (lat: string, lng: string, suggestedAddress?: string) => void;
  latError?: string;
  lngError?: string;
}

interface LandmarkSuggestion {
  label: string;
  address: string;
  lat: number;
  lng: number;
}

const POPULAR_INDIAN_LANDMARKS: LandmarkSuggestion[] = [
  {
    label: 'Indiranagar 100ft Rd (Bengaluru)',
    address: '100ft Road, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka',
    lat: 12.9719,
    lng: 77.6412
  },
  {
    label: 'Hebbal / Airport NH 44 (Bengaluru)',
    address: 'NH 44 Devanahalli Corridor, Bengaluru, Karnataka',
    lat: 13.2085,
    lng: 77.7082
  },
  {
    label: 'Maddur Bypass (Mysuru Expressway)',
    address: 'Bangalore-Mysore Expressway, Maddur Bypass, Karnataka',
    lat: 12.5841,
    lng: 77.0428
  },
  {
    label: 'Nandi Hills FootHills (Chikkaballapur)',
    address: 'Nandi Hills Road, Karahalli Cross, Karnataka',
    lat: 13.3702,
    lng: 77.6835
  },
  {
    label: 'Worli Sea Face (Mumbai)',
    address: 'Dr Annie Besant Road, Worli, Mumbai, Maharashtra',
    lat: 19.0176,
    lng: 72.8172
  },
  {
    label: 'Lonavala Food Mall (Mumbai-Pune Expy)',
    address: 'Mumbai-Pune Expressway KM 54, Lonavala, Maharashtra',
    lat: 18.7557,
    lng: 73.4091
  },
  {
    label: 'ECR Mahabalipuram (Chennai Corridor)',
    address: 'East Coast Road (ECR), Mamallapuram, Tamil Nadu',
    lat: 12.6208,
    lng: 80.1945
  },
  {
    label: 'Connaught Place Outer Circle (New Delhi)',
    address: 'Connaught Place, New Delhi, Delhi NCR',
    lat: 28.6315,
    lng: 77.2167
  },
  {
    label: 'HITEC City Cyber Towers (Hyderabad)',
    address: 'HITEC City, Madhapur, Hyderabad, Telangana',
    lat: 17.4435,
    lng: 78.3772
  },
  {
    label: 'Edappally NH 66 Bypass (Kochi)',
    address: 'NH 66 Edappally Junction, Kochi, Kerala',
    lat: 10.0261,
    lng: 76.3125
  }
];

export const MapLocationPicker: React.FC<MapLocationPickerProps> = ({
  latitude,
  longitude,
  onSelectCoordinates,
  latError,
  lngError
}) => {
  const { playTacticalClick } = useAudio();
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [landmarkQuery, setLandmarkQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LandmarkSuggestion[]>([]);
  const [searchingLandmark, setSearchingLandmark] = useState(false);
  const [selectedPlaceLabel, setSelectedPlaceLabel] = useState<string>(
    'Click anywhere on the map or pick a landmark below to place the charger pin'
  );
  const [showManualInputs, setShowManualInputs] = useState(false);

  const parsedLat = Number(latitude);
  const parsedLng = Number(longitude);
  const safeLat = !isNaN(parsedLat) && isFinite(parsedLat) ? parsedLat : 12.9719;
  const safeLng = !isNaN(parsedLng) && isFinite(parsedLng) ? parsedLng : 77.6412;

  // Store latest callback in ref so Leaflet click handler always invokes latest state updater
  const onSelectRef = useRef(onSelectCoordinates);
  useEffect(() => {
    onSelectRef.current = onSelectCoordinates;
  }, [onSelectCoordinates]);

  // Reverse geocode clicked coordinates softly in background (optional convenience)
  const reverseLookupLandmark = async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16`,
        { headers: { Accept: 'application/json' } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.display_name === 'string' && data.display_name.trim()) {
          const shortAddress = data.display_name
            .split(',')
            .slice(0, 4)
            .map((s: string) => s.trim())
            .join(', ');
          setSelectedPlaceLabel(`Pinned on map: ${shortAddress}`);
          onSelectRef.current(lat.toFixed(6), lng.toFixed(6), shortAddress);
          return;
        }
      }
    } catch {
      // Fallback to coordinate label if offline or rate-limited
    }
    setSelectedPlaceLabel(`Pinned on map at ${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E`);
    onSelectRef.current(lat.toFixed(6), lng.toFixed(6));
  };

  // Initialize interactive Leaflet map picker
  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;

    const map = L.map(mapElRef.current, {
      center: [safeLat, safeLng],
      zoom: 11,
      minZoom: 4,
      maxZoom: 18,
      zoomControl: true,
      attributionControl: false
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    const pinIcon = L.divIcon({
      html: `
        <div style="
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 9999px;
          background: #E8AA45;
          border: 2.5px solid #08090B;
          color: #08090B;
          font-family: 'JetBrains Mono', monospace;
          font-weight: 700;
          font-size: 14px;
          box-shadow: 0 0 16px rgba(232, 170, 69, 0.85);
          cursor: grab;
        " title="Selected Charger Location (Click map or drag pin)">
          <span>📍</span>
        </div>
      `,
      className: 'ghost-picker-pin-icon',
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });

    const marker = L.marker([safeLat, safeLng], {
      icon: pinIcon,
      draggable: true
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      reverseLookupLandmark(pos.lat, pos.lng);
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      playTacticalClick();
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);
      reverseLookupLandmark(lat, lng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Keep marker synced when latitude/longitude props change externally
  useEffect(() => {
    if (markerRef.current && mapRef.current) {
      const currentPos = markerRef.current.getLatLng();
      if (
        Math.abs(currentPos.lat - safeLat) > 0.0001 ||
        Math.abs(currentPos.lng - safeLng) > 0.0001
      ) {
        markerRef.current.setLatLng([safeLat, safeLng]);
      }
    }
  }, [safeLat, safeLng]);

  const handleSelectLandmark = (lm: LandmarkSuggestion) => {
    playTacticalClick();
    setSelectedPlaceLabel(`Selected Landmark: ${lm.label}`);
    setSearchResults([]);
    setLandmarkQuery('');
    onSelectCoordinates(lm.lat.toFixed(6), lm.lng.toFixed(6), lm.address);

    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([lm.lat, lm.lng]);
      mapRef.current.setView([lm.lat, lm.lng], 14, { animate: true });
    }
  };

  const handleSearchLandmarks = async () => {
    const q = landmarkQuery.trim();
    if (!q) return;
    playTacticalClick();
    setSearchingLandmark(true);

    // Filter local curated landmarks first
    const localMatches = POPULAR_INDIAN_LANDMARKS.filter(
      lm =>
        lm.label.toLowerCase().includes(q.toLowerCase()) ||
        lm.address.toLowerCase().includes(q.toLowerCase())
    );

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=in&limit=4&q=${encodeURIComponent(
          q
        )}`,
        { headers: { Accept: 'application/json' } }
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const remoteMatches: LandmarkSuggestion[] = data.map((item: any) => ({
            label: item.name || item.display_name.split(',')[0],
            address: item.display_name
              .split(',')
              .slice(0, 4)
              .map((s: string) => s.trim())
              .join(', '),
            lat: Number(item.lat),
            lng: Number(item.lon)
          }));
          setSearchResults([...localMatches, ...remoteMatches].slice(0, 5));
          setSearchingLandmark(false);
          return;
        }
      }
    } catch {
      // Fallback to local matches
    }

    setSearchResults(localMatches);
    setSearchingLandmark(false);
  };

  const handleUseMyGps = () => {
    playTacticalClick();
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (mapRef.current && markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
          mapRef.current.setView([lat, lng], 15, { animate: true });
        }
        reverseLookupLandmark(lat, lng);
      },
      () => {
        setSelectedPlaceLabel(
          'GPS access unavailable — Click directly on the map or pick a landmark below.'
        );
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  return (
    <div
      data-testid="map-location-picker"
      className="p-3.5 rounded bg-[#0D0F12] border border-[#282D34] space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[#D4D8DE] font-bold">
          <MapPin className="w-3.5 h-3.5 text-[#E8AA45]" />
          <span>CHOOSE CHARGER LOCATION ON MAP / LANDMARKS *</span>
        </div>

        <button
          type="button"
          onClick={handleUseMyGps}
          className="px-2.5 py-1 rounded bg-[#191D22] hover:bg-[#252A30] text-[#42B883] border border-[#414851] text-[10px] font-semibold flex items-center gap-1"
        >
          <LocateFixed className="w-3 h-3" />
          <span>Use Current GPS</span>
        </button>
      </div>

      {/* Landmark / City Search Input */}
      <div className="space-y-2">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#707883]" />
            <input
              type="text"
              value={landmarkQuery}
              onChange={e => setLandmarkQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearchLandmarks();
                }
              }}
              aria-label="Search landmark, city, or highway on map"
              placeholder="Search landmark, cafe, highway, or city (e.g. Indiranagar, Lonavala)..."
              className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#E8AA45] rounded pl-8 pr-2.5 py-1.5 text-[#F1F3F5] text-[11px] focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleSearchLandmarks}
            disabled={searchingLandmark}
            className="px-3 py-1.5 rounded bg-[#252A30] hover:bg-[#414851] text-[#F1F3F5] border border-[#414851] text-[11px] font-bold shrink-0"
          >
            {searchingLandmark ? '...' : 'Find'}
          </button>
        </div>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div className="bg-[#13161A] border border-[#414851] rounded divide-y divide-[#282D34] max-h-36 overflow-y-auto">
            {searchResults.map((res, idx) => (
              <button
                key={`${res.label}_${idx}`}
                type="button"
                onClick={() => handleSelectLandmark(res)}
                className="w-full text-left px-3 py-2 hover:bg-[#191D22] flex items-center justify-between gap-2 text-[11px]"
              >
                <div>
                  <div className="font-bold text-[#F1F3F5]">{res.label}</div>
                  <div className="text-[10px] text-[#A0A7B0] font-sans truncate max-w-[320px]">
                    {res.address}
                  </div>
                </div>
                <span className="text-[10px] text-[#E8AA45] shrink-0">Pin Here →</span>
              </button>
            ))}
          </div>
        )}

        {/* Quick Landmark Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-[#707883]">Quick Landmarks:</span>
          {POPULAR_INDIAN_LANDMARKS.slice(0, 5).map(lm => (
            <button
              key={lm.label}
              type="button"
              onClick={() => handleSelectLandmark(lm)}
              className="px-2 py-0.5 rounded bg-[#13161A] hover:bg-[#191D22] text-[#AEB5BE] hover:text-[#E8AA45] border border-[#282D34] text-[10px] transition-colors"
            >
              {lm.label}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Map Canvas for Clicking / Dragging Pin */}
      <div className="relative rounded overflow-hidden border border-[#414851] bg-[#08090B]">
        <div
          ref={mapElRef}
          data-testid="modal-interactive-map-picker"
          className="w-full h-[210px] cursor-crosshair"
        />
        <div className="bg-[#13161A] border-t border-[#282D34] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px]">
          <span className="text-[#42B883] flex items-center gap-1 truncate max-w-[330px]">
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            <span className="truncate">{selectedPlaceLabel}</span>
          </span>
          <span className="text-[#E8AA45] font-bold">
            {safeLat.toFixed(4)}°N, {safeLng.toFixed(4)}°E
          </span>
        </div>
      </div>

      {/* Optional toggle to view/edit exact coordinates only if desired */}
      <div>
        <button
          type="button"
          onClick={() => setShowManualInputs(prev => !prev)}
          className="text-[10px] text-[#707883] hover:text-[#AEB5BE] flex items-center gap-1"
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span>
            {showManualInputs
              ? 'Hide manual coordinate inputs'
              : 'Optional: Fine-tune coordinates manually'}
          </span>
        </button>

        {(showManualInputs || latError || lngError) && (
          <div className="grid grid-cols-2 gap-3 mt-2 pt-2 border-t border-[#282D34]">
            <div>
              <label htmlFor="station-lat-input" className="block text-[10px] text-[#707883] mb-1">
                LATITUDE (°N)
              </label>
              <input
                id="station-lat-input"
                type="number"
                step="any"
                value={latitude}
                onChange={e => onSelectCoordinates(e.target.value, longitude)}
                className="w-full bg-[#08090B] border border-[#282D34] rounded p-1.5 text-[#F1F3F5] text-[11px] focus:outline-none"
              />
              {latError && (
                <p role="alert" className="text-[10px] text-[#E04F5F] mt-1">
                  {latError}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="station-lng-input" className="block text-[10px] text-[#707883] mb-1">
                LONGITUDE (°E)
              </label>
              <input
                id="station-lng-input"
                type="number"
                step="any"
                value={longitude}
                onChange={e => onSelectCoordinates(latitude, e.target.value)}
                className="w-full bg-[#08090B] border border-[#282D34] rounded p-1.5 text-[#F1F3F5] text-[11px] focus:outline-none"
              />
              {lngError && (
                <p role="alert" className="text-[10px] text-[#E04F5F] mt-1">
                  {lngError}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
