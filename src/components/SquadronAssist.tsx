import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  Phone,
  MapPin,
  Shield,
  Compass,
  Bell,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { EmergencyRequest } from '../types';
import {
  CACHE_KEYS,
  saveToCache,
  loadFromCache,
  reconcileCollectionWithCache,
  enqueueOfflineAction,
  getSessionAuthHeaders,
  OFFLINE_SYNC_EVENT,
  DATA_UPDATED_EVENT
} from '../utils/telemetryCache';
import {
  calculateDistanceKm,
  buildPhoneDialIntentUri,
  openPhoneDialer
} from '../utils/rules';

const QUICK_SOS_CITIES = [
  { name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
  { name: 'Mysuru', lat: 12.2958, lng: 76.6394 },
  { name: 'Pune', lat: 18.5204, lng: 73.8567 },
  { name: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { name: 'Hyderabad', lat: 17.3850, lng: 78.4867 },
  { name: 'Kochi', lat: 9.9312, lng: 76.2673 },
  { name: 'Coimbatore', lat: 11.0168, lng: 76.9558 },
  { name: 'Mumbai', lat: 19.0760, lng: 72.8777 },
  { name: 'New Delhi', lat: 28.6139, lng: 77.2090 },
  { name: 'Kolar', lat: 13.1378, lng: 78.1291 },
  { name: 'Mangaluru', lat: 12.9141, lng: 74.8560 },
  { name: 'Hosur', lat: 12.7409, lng: 77.8253 }
];

const CITY_SYNONYMS: Record<string, string> = {
  bangalore: 'Bengaluru',
  bengaluru: 'Bengaluru',
  mysore: 'Mysuru',
  mysuru: 'Mysuru',
  pune: 'Pune',
  poona: 'Pune',
  mumbai: 'Mumbai',
  bombay: 'Mumbai',
  chennai: 'Chennai',
  madras: 'Chennai',
  hyderabad: 'Hyderabad',
  secunderabad: 'Hyderabad',
  kochi: 'Kochi',
  cochin: 'Kochi',
  coimbatore: 'Coimbatore',
  kolar: 'Kolar',
  delhi: 'New Delhi',
  'new delhi': 'New Delhi',
  gurgaon: 'Gurugram',
  gurugram: 'Gurugram',
  mangalore: 'Mangaluru',
  mangaluru: 'Mangaluru',
  hosur: 'Hosur',
  hassan: 'Hassan'
};

function normalizeCity(raw?: string | null): string {
  if (!raw) return '';
  const cleaned = raw.trim();
  if (!cleaned) return '';
  const lower = cleaned.toLowerCase();
  if (CITY_SYNONYMS[lower]) return CITY_SYNONYMS[lower];
  for (const [alias, canonical] of Object.entries(CITY_SYNONYMS)) {
    const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lower)) return canonical;
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

interface DispatchSummaryBanner {
  emergencyId: string;
  category: string;
  city: string;
  locationName: string;
  cityUsersNotified: { id: string; name: string; city: string }[];
  adminAlerted: boolean;
  adminNotifiedCount: number;
  timestamp: string;
}

export const SquadronAssist: React.FC = () => {
  const { currentUser, availableUsers } = useAuth();
  const { playTacticalClick, playChime, playAlert } = useAudio();

  const [emergencies, setEmergencies] = useState<EmergencyRequest[]>(() =>
    loadFromCache<EmergencyRequest[]>(CACHE_KEYS.EMERGENCY, [])
  );
  const [selectedEmergency, setSelectedEmergency] = useState<EmergencyRequest | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [acquiringGps, setAcquiringGps] = useState(false);
  const [dispatchConfirmation, setDispatchConfirmation] = useState<DispatchSummaryBanner | null>(null);

  // Form State
  const [formCategory, setFormCategory] = useState<EmergencyRequest['category']>('Motorcycle breakdown');
  const [formCity, setFormCity] = useState<string>(
    currentUser?.city || currentUser?.communityChargerDetails?.town || 'Bengaluru'
  );
  const [formDescription, setFormDescription] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formLatitude, setFormLatitude] = useState<number | undefined>();
  const [formLongitude, setFormLongitude] = useState<number | undefined>();
  const [formCallbackPhone, setFormCallbackPhone] = useState(currentUser?.mobile || '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (currentUser?.mobile && !formCallbackPhone) {
      setFormCallbackPhone(currentUser.mobile);
    }
    if ((currentUser?.city || currentUser?.communityChargerDetails?.town) && !formCity) {
      setFormCity(currentUser.city || currentUser.communityChargerDetails?.town || 'Bengaluru');
    }
  }, [currentUser]);

  useEffect(() => {
    fetchEmergencies();
    const handleSync = () => fetchEmergencies();
    window.addEventListener(OFFLINE_SYNC_EVENT, handleSync);
    return () => window.removeEventListener(OFFLINE_SYNC_EVENT, handleSync);
  }, []);

  const fetchEmergencies = async () => {
    try {
      const res = await fetch('/api/emergency', {
        credentials: 'same-origin',
        headers: getSessionAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        const merged = reconcileCollectionWithCache<EmergencyRequest>(
          CACHE_KEYS.EMERGENCY,
          data.emergencies || []
        );
        setEmergencies(merged);
        if (!selectedEmergency && merged.length > 0) {
          setSelectedEmergency(merged[0]);
        }
      }
    } catch (err) {
      const cached = loadFromCache<EmergencyRequest[]>(CACHE_KEYS.EMERGENCY, []);
      if (cached.length > 0) setEmergencies(cached);
    }
  };

  // Auto-detect city when rider types location landmark/address
  const handleLocationInputChange = (val: string) => {
    setFormLocation(val);
    const detected = normalizeCity(val);
    if (detected && Object.values(CITY_SYNONYMS).includes(detected)) {
      setFormCity(detected);
    }
  };

  // Live preview of registered users in the selected SOS city + Admin Command
  const targetCityCanonical = useMemo(
    () => normalizeCity(formCity || currentUser?.city || 'Bengaluru'),
    [formCity, currentUser?.city]
  );

  const matchedCityUsersPreview = useMemo(() => {
    const targetLower = targetCityCanonical.toLowerCase();
    return (availableUsers || []).filter(u => {
      if (!u || u.id === currentUser?.id) return false;
      const uCity = normalizeCity(u.city || u.communityChargerDetails?.town || '').toLowerCase();
      return uCity && uCity === targetLower;
    });
  }, [availableUsers, targetCityCanonical, currentUser?.id]);

  const adminUsersPreview = useMemo(() => {
    const admins = (availableUsers || []).filter(
      u => u.isOwner || u.role === 'admin' || u.role === 'superadmin' || u.id === 'u_admin'
    );
    return admins.length > 0 ? admins : [{ id: 'u_admin', fullName: 'Abinav Thejas K (Admin)' }];
  }, [availableUsers]);

  const handleAcquireGps = () => {
    if (!navigator.geolocation) {
      return;
    }
    setAcquiringGps(true);
    playTacticalClick();

    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setFormLatitude(lat);
        setFormLongitude(lng);

        // Find nearest known city within 45 km
        let nearestCity = formCity || currentUser?.city || 'Bengaluru';
        let minDistance = 45;
        for (const c of QUICK_SOS_CITIES) {
          const dist = calculateDistanceKm(lat, lng, c.lat, c.lng);
          if (dist < minDistance) {
            minDistance = dist;
            nearestCity = c.name;
          }
        }
        setFormCity(nearestCity);
        setFormLocation(`GPS: ${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E (${nearestCity} Sector)`);
        setAcquiringGps(false);
        playChime();
      },
      err => {
        console.warn('Geolocation failed or denied:', err);
        setAcquiringGps(false);
      },
      { timeout: 8000 }
    );
  };

  const handleCreateEmergency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCategory || !formDescription || !formLocation) {
      return;
    }

    const effectiveCity = normalizeCity(formCity || currentUser?.city || 'Bengaluru') || 'Bengaluru';

    setSubmitting(true);
    playAlert();

    const clientRequestId = `emg_req_${Date.now()}`;
    const payload = {
      userId: currentUser?.id,
      requesterName: currentUser?.fullName,
      requesterModel: currentUser?.motorcycleModel,
      category: formCategory,
      city: effectiveCity,
      description: formDescription,
      locationName: formLocation,
      latitude: formLatitude,
      longitude: formLongitude,
      callbackPhone: formCallbackPhone,
      clientRequestId
    };

    try {
      const res = await fetch('/api/emergency', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || '',
          'x-client-request-id': clientRequestId
        }),
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.emergency) {
          const next = [data.emergency, ...emergencies.filter(item => item.id !== data.emergency.id)];
          setEmergencies(next);
          setSelectedEmergency(data.emergency);
          saveToCache(CACHE_KEYS.EMERGENCY, next);

          const notifiedCityList =
            data.dispatchSummary?.cityUsersNotified ||
            data.emergency.notifiedCityUsers ||
            matchedCityUsersPreview.map(u => ({
              id: u.id,
              name: u.fullName,
              city: effectiveCity
            }));

          setDispatchConfirmation({
            emergencyId: data.emergency.id,
            category: formCategory,
            city: data.dispatchSummary?.city || data.emergency.city || effectiveCity,
            locationName: formLocation,
            cityUsersNotified: notifiedCityList,
            adminAlerted: true,
            adminNotifiedCount: data.dispatchSummary?.adminNotifiedCount || adminUsersPreview.length || 1,
            timestamp: new Date().toISOString()
          });
        }
        window.dispatchEvent(new CustomEvent(DATA_UPDATED_EVENT));
        setShowCreateModal(false);
        setFormDescription('');
        setFormLocation('');
      }
    } catch (err) {
      enqueueOfflineAction('/api/emergency', 'POST', payload, 'Squadron SOS Dispatch', clientRequestId);
      const nowIso = new Date().toISOString();
      const fallbackCityUsers = matchedCityUsersPreview.map(u => ({
        id: u.id,
        name: u.fullName,
        city: effectiveCity,
        role: u.role
      }));
      const localEmergency: EmergencyRequest & { pendingSync?: boolean; clientRequestId?: string } = {
        id: `emg_local_${Date.now()}`,
        userId: currentUser?.id || 'u_local',
        requesterName: currentUser?.fullName || 'Squadron Pilot',
        requesterModel: currentUser?.motorcycleModel || 'F77 MACH 2',
        category: formCategory,
        city: effectiveCity,
        description: formDescription,
        locationName: formLocation,
        latitude: formLatitude,
        longitude: formLongitude,
        callbackPhone: formCallbackPhone,
        status: 'Submitted',
        searchRadiusKm: 25,
        notifiedCount: Math.max(1, fallbackCityUsers.length + adminUsersPreview.length),
        notifiedCityUsers: fallbackCityUsers,
        adminAlerted: true,
        adminAlertedAt: nowIso,
        adminNotifiedCount: adminUsersPreview.length,
        createdAt: nowIso,
        updatedAt: nowIso,
        accessLogs: [
          {
            userId: currentUser?.id || 'u_local',
            userName: currentUser?.fullName || 'Squadron Pilot',
            accessedAt: nowIso,
            reason: `Emergency SOS transmitted for city sector: ${effectiveCity}`
          },
          {
            userId: 'u_admin',
            userName: 'ADMIN COMMAND DISPATCH',
            accessedAt: nowIso,
            reason: `Priority Admin SOS Alert queued for ${adminUsersPreview.length} administrator(s)`
          },
          {
            userId: 'system_city_broadcast',
            userName: `${effectiveCity.toUpperCase()} CITY NETWORK`,
            accessedAt: nowIso,
            reason: `City SOS alert broadcasted to ${fallbackCityUsers.length} registered ${effectiveCity} user(s)`
          }
        ],
        pendingSync: true,
        clientRequestId
      };
      const next = [localEmergency, ...emergencies];
      setEmergencies(next);
      setSelectedEmergency(localEmergency);
      saveToCache(CACHE_KEYS.EMERGENCY, next);
      setDispatchConfirmation({
        emergencyId: localEmergency.id,
        category: formCategory,
        city: effectiveCity,
        locationName: formLocation,
        cityUsersNotified: fallbackCityUsers,
        adminAlerted: true,
        adminNotifiedCount: adminUsersPreview.length || 1,
        timestamp: nowIso
      });
      setShowCreateModal(false);
      setFormDescription('');
      setFormLocation('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRespond = async (emergencyId: string) => {
    if (!currentUser) return;
    playTacticalClick();

    const updatedLocal = emergencies.map(emg =>
      emg.id === emergencyId
        ? {
            ...emg,
            status: 'Acknowledged' as const,
            responderId: currentUser.id,
            responderName: currentUser.fullName
          }
        : emg
    );
    setEmergencies(updatedLocal);
    saveToCache(CACHE_KEYS.EMERGENCY, updatedLocal);

    try {
      const res = await fetch(`/api/emergency/${emergencyId}/respond`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          responderId: currentUser.id,
          responderName: currentUser.fullName,
          reason: 'Squadron verified member roadside assistance response'
        })
      });

      if (res.ok) {
        const data = await res.json();
        playChime();
        if (data.emergency) {
          setEmergencies(prev => {
            const next = prev.map(emg => (emg.id === data.emergency.id ? data.emergency : emg));
            saveToCache(CACHE_KEYS.EMERGENCY, next);
            return next;
          });
          if (selectedEmergency?.id === data.emergency.id) {
            setSelectedEmergency(data.emergency);
          }
        }
      }
    } catch (err) {
      console.error('Response error:', err);
    }
  };

  const handleUpdateStatus = async (emergencyId: string, status: string) => {
    playTacticalClick();
    const updatedLocal = emergencies.map(emg =>
      emg.id === emergencyId ? { ...emg, status: status as any } : emg
    );
    setEmergencies(updatedLocal);
    saveToCache(CACHE_KEYS.EMERGENCY, updatedLocal);

    try {
      const res = await fetch(`/api/emergency/${emergencyId}/status`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.emergency) {
          setEmergencies(prev => {
            const next = prev.map(emg => (emg.id === data.emergency.id ? data.emergency : emg));
            saveToCache(CACHE_KEYS.EMERGENCY, next);
            return next;
          });
          if (selectedEmergency?.id === data.emergency.id) {
            setSelectedEmergency(data.emergency);
          }
        }
      }
    } catch (err) {
      console.error('Status update error:', err);
    }
  };

  const activeRequests = emergencies.filter(e => e.status !== 'Resolved' && e.status !== 'Cancelled');
  const activeSelectedEmergency =
    (selectedEmergency && activeRequests.find(e => e.id === selectedEmergency.id)) ||
    activeRequests[0] ||
    null;

  return (
    <div className="space-y-5">
      {/* Squadron Assist Roadside SOS Header */}
      <div className="bg-[#13161A] border border-[#282D34] rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-lg">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#E04F5F]/15 border border-[#E04F5F]/50 flex items-center justify-center text-[#E04F5F] shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-base sm:text-lg font-mono font-bold text-[#F1F3F5] tracking-wider uppercase flex flex-wrap items-center gap-2">
              <span>SQUADRON ASSIST</span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-[#E04F5F]/15 text-[#E04F5F] border border-[#E04F5F]/30">
                24/7 ROADSIDE SOS
              </span>
            </div>
            <div className="text-xs sm:text-sm text-[#A0A7B0] mt-0.5">
              Alerts nearby city riders &amp; Admin Command. Dial 112 for medical emergencies.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <a
            href={buildPhoneDialIntentUri('112')}
            data-testid="squadron-call-112-btn"
            onClick={e => {
              e.preventDefault();
              playAlert();
              openPhoneDialer('112');
            }}
            className="px-3.5 py-2.5 rounded-lg bg-[#252A30] hover:bg-[#414851] text-[#E04F5F] border border-[#E04F5F]/40 text-xs sm:text-sm font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Phone className="w-4 h-4" />
            <span>CALL 112</span>
          </a>
          <button
            onClick={() => {
              playAlert();
              if (!formCity && currentUser?.city) {
                setFormCity(currentUser.city);
              }
              setShowCreateModal(true);
            }}
            className="flex-1 sm:flex-initial justify-center px-4 py-2.5 rounded-lg bg-[#E04F5F] hover:bg-[#c93f4e] text-white text-xs sm:text-sm font-mono font-bold tracking-wide transition-all shadow-lg flex items-center gap-1.5 cursor-pointer"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>TRIGGER SQUADRON SOS</span>
          </button>
        </div>
      </div>
          {/* Live SOS Dispatch Confirmation Banner */}
          {dispatchConfirmation && (
            <div
              data-testid="sos-dispatch-confirmation-banner"
              className="bg-[#1A0D10] border border-[#E04F5F] rounded-xl p-4 font-mono text-xs space-y-2.5 shadow-[0_0_20px_rgba(224,79,95,0.2)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#E04F5F]/20 border border-[#E04F5F] flex items-center justify-center text-[#E04F5F] shrink-0 animate-pulse">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-[#F8FAFC] flex flex-wrap items-center gap-2">
                      <span>SOS BROADCAST ACTIVE</span>
                      <span className="px-2 py-0.5 rounded bg-[#E04F5F] text-white text-[10px] font-bold uppercase">
                        {dispatchConfirmation.city.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#FCA5A5] mt-0.5">
                      {dispatchConfirmation.category} • {dispatchConfirmation.locationName}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDispatchConfirmation(null)}
                  className="p-1 rounded text-[#A0A7B0] hover:text-white hover:bg-[#282D34]"
                  aria-label="Dismiss SOS confirmation"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="text-[11px] text-[#D4D8DE] pt-2 border-t border-[#E04F5F]/25 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  <strong className="text-[#FDE68A]">Admin Command:</strong> Priority alert dispatched ({dispatchConfirmation.adminNotifiedCount})
                </span>
                <span>
                  <strong className="text-[#BAE6FD]">{dispatchConfirmation.city} Riders Notified:</strong>{' '}
                  {dispatchConfirmation.cityUsersNotified.length > 0
                    ? dispatchConfirmation.cityUsersNotified.map(u => u.name).join(', ')
                    : 'Sector broadcast active'}
                </span>
              </div>
            </div>
          )}

          {/* Main Grid: Active Incidents & Selected Details */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Active Emergency Requests (7 Cols) */}
            <div className="lg:col-span-7 space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-[#282D34] text-xs font-mono">
                <span className="font-bold text-[#D4D8DE] uppercase">
                  ACTIVE INCIDENTS ({activeRequests.length})
                </span>
                <span className="text-[#42B883] text-[11px]">LIVE DISPATCH</span>
              </div>

              {activeRequests.length === 0 ? (
                <div className="bg-[#0D0F12] border border-[#282D34] rounded-xl p-10 text-center text-xs font-mono text-[#707883]">
                  NO ACTIVE DISTRESS SIGNALS IN YOUR SECTOR
                </div>
              ) : (
                activeRequests.map(emg => {
                  const isSelected = selectedEmergency?.id === emg.id;
                  const incidentCity = emg.city || normalizeCity(emg.locationName) || 'Bengaluru';
                  return (
                    <div
                      key={emg.id}
                      onClick={() => {
                        playTacticalClick();
                        setSelectedEmergency(emg);
                      }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#191D22] border-[#E04F5F]/70 shadow-lg'
                          : 'bg-[#0D0F12] border-[#282D34] hover:border-[#414851]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono mb-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-[#E04F5F]/20 text-[#E04F5F] font-bold uppercase">
                            {emg.category}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30 font-bold uppercase">
                            {incidentCity}
                          </span>
                        </div>
                        <span className="text-[#42B883] font-bold uppercase">{emg.status}</span>
                      </div>

                      <div className="flex items-baseline justify-between gap-2">
                        <div className="text-base font-bold text-[#F8FAFC]">{emg.requesterName}</div>
                        <div className="text-xs font-mono text-[#A0A7B0]">{emg.requesterModel}</div>
                      </div>

                      <p className="text-sm text-[#D4D8DE] mt-1.5 line-clamp-2 leading-relaxed">
                        {emg.description}
                      </p>

                      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[#282D34] text-xs font-mono gap-2">
                        <div className="flex items-center gap-1.5 text-[#AEB5BE] truncate">
                          <MapPin className="w-3.5 h-3.5 text-[#E04F5F] shrink-0" />
                          <span className="truncate">{emg.locationName}</span>
                        </div>
                        <span className="text-[10px] text-[#707883] shrink-0">
                          {emg.notifiedCount} riders alerted
                        </span>
                      </div>

                      {/* Actions inside card */}
                      <div className="mt-3 flex items-center justify-end gap-2">
                        {emg.status === 'Submitted' && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              handleRespond(emg.id);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#42B883]/20 hover:bg-[#42B883]/30 text-[#42B883] border border-[#42B883]/40 text-xs font-mono font-bold cursor-pointer"
                          >
                            ACKNOWLEDGE &amp; RESPOND
                          </button>
                        )}
                        {emg.status === 'Acknowledged' && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              handleUpdateStatus(emg.id, 'Assistance Arranged');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#729BCB]/20 text-[#729BCB] border border-[#729BCB]/40 text-xs font-mono font-bold cursor-pointer"
                          >
                            MARK ASSISTANCE ARRANGED
                          </button>
                        )}
                        {(emg.status === 'Acknowledged' || emg.status === 'Assistance Arranged') && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              handleUpdateStatus(emg.id, 'Resolved');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#252A30] hover:bg-[#414851] text-[#F1F3F5] text-xs font-mono font-bold cursor-pointer"
                          >
                            MARK RESOLVED
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Selected Incident Details (5 Cols) */}
            <div className="lg:col-span-5">
              <div className="bg-[#0D0F12] border border-[#282D34] rounded-xl p-5 lg:sticky lg:top-4">
                <div className="text-xs font-mono font-bold text-[#D4D8DE] uppercase pb-2.5 mb-3.5 border-b border-[#282D34] flex items-center justify-between">
                  <span>INCIDENT TELEMETRY</span>
                  {activeSelectedEmergency && (
                    <span className="text-[#38BDF8]">
                      {activeSelectedEmergency.city || normalizeCity(activeSelectedEmergency.locationName) || 'BENGALURU'}
                    </span>
                  )}
                </div>

                {activeSelectedEmergency ? (
                  <div className="space-y-3.5 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-[#707883]">RIDER / MODEL</div>
                        <div className="text-[#F1F3F5] font-bold">
                          {activeSelectedEmergency.requesterName} • {activeSelectedEmergency.requesterModel}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-[#E04F5F]/20 text-[#E04F5F] text-[10px] font-bold uppercase">
                        {activeSelectedEmergency.category}
                      </span>
                    </div>

                    <div>
                      <div className="text-[10px] text-[#707883]">LOCATION</div>
                      <div className="text-[#D4D8DE] bg-[#13161A] p-2.5 rounded-lg border border-[#282D34] mt-1">
                        {activeSelectedEmergency.locationName}
                      </div>
                    </div>

                    {activeSelectedEmergency.callbackPhone && (
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#13161A] border border-[#42B883]/30">
                        <span className="text-[10px] text-[#A0A7B0]">DIRECT RIDER CONTACT</span>
                        <a
                          href={buildPhoneDialIntentUri(activeSelectedEmergency.callbackPhone)}
                          onClick={e => {
                            e.preventDefault();
                            openPhoneDialer(activeSelectedEmergency.callbackPhone);
                          }}
                          className="text-[#42B883] font-bold hover:underline flex items-center gap-1.5 cursor-pointer"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>{activeSelectedEmergency.callbackPhone}</span>
                        </a>
                      </div>
                    )}

                    {activeSelectedEmergency.responderName && (
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#707883]">ASSIGNED RESPONDER:</span>
                        <span className="text-[#42B883] font-bold">{activeSelectedEmergency.responderName}</span>
                      </div>
                    )}

                    {/* Compact Alerted Riders & Dispatch Log */}
                    <div className="pt-2.5 border-t border-[#282D34] space-y-2">
                      <div className="text-[10px] font-bold text-[#A0A7B0] uppercase flex items-center justify-between">
                        <span>DISPATCH &amp; ACCESS LOG</span>
                        <span className="text-[#10B981]">ADMIN + {activeSelectedEmergency.notifiedCount} RIDERS</span>
                      </div>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {activeSelectedEmergency.accessLogs?.map((log, i) => (
                          <div key={i} className="p-2 rounded bg-[#13161A] border border-[#282D34] text-[10px] flex items-center justify-between gap-2">
                            <span className="text-[#D4D8DE] font-semibold truncate">{log.userName}</span>
                            <span className="text-[#707883] shrink-0">
                              {new Date(log.accessedAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center text-xs font-mono text-[#707883]">
                    SELECT AN INCIDENT TO INSPECT DETAILS
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* MODAL: DISPATCH SQUADRON ASSIST SOS */}
          {/* ========================================================= */}
          {showCreateModal && (
            <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
              <div className="bg-[#13161A] border border-[#E04F5F] rounded-lg max-w-lg w-full p-6 space-y-4 font-mono text-xs max-h-[90vh] overflow-y-auto">
                <div className="text-sm font-bold text-[#E04F5F] flex items-center justify-between pb-2 border-b border-[#282D34]">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-[#E04F5F]" />
                    <span>DISPATCH SQUADRON ASSIST REQUEST</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="text-[#707883] hover:text-[#F1F3F5]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleCreateEmergency} className="space-y-3.5">
                  <div>
                    <label className="block text-[#D4D8DE] mb-1">EMERGENCY CATEGORY *</label>
                    <select
                      value={formCategory}
                      onChange={e => setFormCategory(e.target.value as any)}
                      className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                    >
                      <option value="Motorcycle breakdown">Motorcycle breakdown</option>
                      <option value="Charging problem">Charging problem (battery depleted / charger incompatible)</option>
                      <option value="Puncture or tyre problem">Puncture or tyre problem</option>
                      <option value="Motorcycle will not start">Motorcycle will not start (electrical/BMS lockout)</option>
                      <option value="Stranded rider">Stranded rider</option>
                      <option value="Accident">Accident (call 112 directly if medical help is needed)</option>
                      <option value="Road hazard">Road hazard</option>
                      <option value="Other assistance">Other assistance</option>
                    </select>
                  </div>

                  {/* SOS CITY / REGISTERED AREA SELECTOR */}
                  <div>
                    <label className="block text-[#D4D8DE] mb-1">
                      SOS CITY / AREA (ALERTS ALL RIDERS REGISTERED IN THIS CITY + ADMIN) *
                    </label>
                    <input
                      type="text"
                      list="sos-city-datalist"
                      value={formCity}
                      onChange={e => setFormCity(e.target.value)}
                      placeholder="Enter or select SOS city (e.g. Bengaluru, Mysuru, Pune)..."
                      className="w-full bg-[#08090B] border border-[#38BDF8]/60 rounded p-2 text-[#F1F3F5] focus:border-[#38BDF8] focus:outline-none"
                      required
                    />
                    <datalist id="sos-city-datalist">
                      {QUICK_SOS_CITIES.map(c => (
                        <option key={c.name} value={c.name} />
                      ))}
                    </datalist>

                    {/* Quick City Buttons */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {QUICK_SOS_CITIES.slice(0, 8).map(c => {
                        const active = targetCityCanonical.toLowerCase() === c.name.toLowerCase();
                        return (
                          <button
                            key={c.name}
                            type="button"
                            onClick={() => {
                              playTacticalClick();
                              setFormCity(c.name);
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer border ${
                              active
                                ? 'bg-[#38BDF8]/20 border-[#38BDF8] text-[#38BDF8] font-bold'
                                : 'bg-[#08090B] border-[#282D34] text-[#A0A7B0] hover:text-[#F1F3F5]'
                            }`}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[#D4D8DE] mb-1">EXACT LOCATION & PERIMETER *</label>
                    <div className="flex gap-2 mb-1.5">
                      <input
                        type="text"
                        value={formLocation}
                        onChange={e => handleLocationInputChange(e.target.value)}
                        placeholder="Landmark, highway km marker, or street address..."
                        className="flex-1 bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                        required
                      />
                      <button
                        type="button"
                        onClick={handleAcquireGps}
                        disabled={acquiringGps}
                        className="px-3 py-2 bg-[#252A30] hover:bg-[#414851] text-[#D4D8DE] rounded border border-[#414851] shrink-0 flex items-center gap-1 cursor-pointer"
                      >
                        <Compass className="w-3.5 h-3.5 text-[#42B883]" />
                        <span>{acquiringGps ? 'ACQUIRING...' : 'GPS'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Live Alert Target Preview Box */}
                  <div className="p-3 rounded bg-[#08090B] border border-[#E04F5F]/40 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-[#F1F3F5]">
                      <span className="flex items-center gap-1.5 text-[#E04F5F]">
                        <Bell className="w-3.5 h-3.5" />
                        <span>AUTOMATIC SOS ALERT RECIPIENTS</span>
                      </span>
                      <span className="text-[#38BDF8] uppercase">{targetCityCanonical} SECTOR</span>
                    </div>
                    <div className="text-[11px] text-[#AEB5BE] leading-relaxed">
                      • <strong className="text-[#FDE68A]">Admin Command (Priority Alert):</strong> Immediate high-priority alert to{' '}
                      <span className="text-[#F1F3F5] font-semibold">
                        {adminUsersPreview.map(a => a.fullName).join(', ')}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#AEB5BE] leading-relaxed">
                      • <strong className="text-[#38BDF8]">Registered {targetCityCanonical} Users ({matchedCityUsersPreview.length}):</strong>{' '}
                      {matchedCityUsersPreview.length > 0 ? (
                        <span className="text-[#F1F3F5]">
                          {matchedCityUsersPreview.map(u => u.fullName).join(', ')}
                        </span>
                      ) : (
                        <span>
                          All users registered with {targetCityCanonical} as their home/area will receive an instant notification
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[#D4D8DE] mb-1">DESCRIPTION *</label>
                    <textarea
                      rows={3}
                      value={formDescription}
                      onChange={e => setFormDescription(e.target.value)}
                      placeholder="Describe failure symptoms, tools needed (puncture kit, portable inflator, tow rope, 15A socket)..."
                      className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[#D4D8DE] mb-1">CALLBACK MOBILE NUMBER</label>
                    <input
                      type="text"
                      value={formCallbackPhone}
                      onChange={e => setFormCallbackPhone(e.target.value)}
                      placeholder="+91 98XXX XXXXX"
                      className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#282D34]">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="px-3 py-1.5 rounded bg-[#191D22] text-[#A0A7B0] cursor-pointer"
                    >
                      CANCEL
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 rounded bg-[#E04F5F] hover:bg-[#c93f4e] text-white font-bold cursor-pointer"
                    >
                      {submitting ? 'TRANSMITTING...' : `DISPATCH SOS (${targetCityCanonical.toUpperCase()} + ADMIN)`}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
    </div>
  );
};
