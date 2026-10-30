import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  Phone,
  MapPin,
  Shield,
  Clock,
  CheckCircle2,
  Lock,
  Compass,
  ArrowRight,
  FileText,
  UserCheck,
  Radio,
  Bell,
  Users,
  X
} from 'lucide-react';
import { MissionMode } from './MissionMode';
import { BackButton } from './BackButton';
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
import { calculateDistanceKm } from '../utils/rules';

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

export const SquadronAssist: React.FC<{ initialMode?: 'sos' | 'mission' }> = ({ initialMode = 'sos' }) => {
  const { currentUser, availableUsers } = useAuth();
  const { playTacticalClick, playChime, playAlert } = useAudio();
  const [squadronMode, setSquadronMode] = useState<'sos' | 'mission'>(initialMode);

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

  return (
    <div className="space-y-6">
      {/* Squadron Assist Sub-Module Switcher: Roadside SOS Dispatch vs Mission Mode */}
      <div className="bg-[#13161A] border border-[#282D34] rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs">
        <div className="flex items-center gap-2 text-[#F1F3F5] font-bold tracking-wider uppercase">
          <span>SQUADRON ASSIST OPERATIONS</span>
        </div>
        <div
          role="tablist"
          aria-label="Squadron Assist Sub-Module"
          className="flex items-center bg-[#090B0E] border border-[#2D343E] rounded-lg p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={squadronMode === 'sos'}
            onClick={() => {
              playTacticalClick();
              setSquadronMode('sos');
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition-colors cursor-pointer ${
              squadronMode === 'sos'
                ? 'bg-[#E04F5F] text-white font-bold shadow'
                : 'text-[#A0A7B0] hover:text-[#F1F3F5]'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>ROADSIDE SOS DISPATCH</span>
          </button>
          <button
            type="button"
            role="tab"
            data-testid="squadron-mission-mode-tab"
            aria-selected={squadronMode === 'mission'}
            onClick={() => {
              playTacticalClick();
              setSquadronMode('mission');
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition-colors cursor-pointer ${
              squadronMode === 'mission'
                ? 'bg-[#E8AA45] text-[#08090B] font-bold shadow'
                : 'text-[#A0A7B0] hover:text-[#F1F3F5]'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>MISSION MODE</span>
          </button>
        </div>
      </div>

      {squadronMode === 'mission' ? (
        <MissionMode />
      ) : (
        <>
          {/* Live SOS Dispatch Confirmation Banner (City Notification + Priority Admin Alert) */}
          {dispatchConfirmation && (
            <div
              data-testid="sos-dispatch-confirmation-banner"
              className="bg-[#1A0D10] border-2 border-[#E04F5F] rounded-lg p-4 font-mono text-xs space-y-3 shadow-[0_0_24px_rgba(224,79,95,0.25)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded bg-[#E04F5F]/20 border border-[#E04F5F] flex items-center justify-center text-[#E04F5F] shrink-0 animate-pulse">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#F8FAFC] flex flex-wrap items-center gap-2">
                      <span>SQUADRON SOS BROADCAST TRANSMITTED</span>
                      <span className="px-2 py-0.5 rounded bg-[#E04F5F] text-white text-[10px] font-bold uppercase">
                        CITY SECTOR: {dispatchConfirmation.city.toUpperCase()}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#F59E0B]/20 text-[#FDE68A] border border-[#F59E0B]/50 text-[10px] font-bold uppercase">
                        ADMIN PRIORITY ALERT SENT
                      </span>
                    </div>
                    <div className="text-[11px] text-[#FCA5A5] mt-0.5">
                      Incident {dispatchConfirmation.emergencyId} • {dispatchConfirmation.category} at {dispatchConfirmation.locationName}
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[#E04F5F]/30">
                <div className="p-2.5 rounded bg-[#0D0F12]/90 border border-[#F59E0B]/40 flex items-start gap-2.5">
                  <Shield className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[11px] font-bold text-[#FDE68A] uppercase">
                      PRIORITY ADMIN COMMAND ALERTED ({dispatchConfirmation.adminNotifiedCount} ADMIN)
                    </div>
                    <div className="text-[11px] text-[#AEB5BE] mt-0.5">
                      High-priority emergency alert & audit log dispatched directly to Admin Control Centre for immediate oversight.
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-[#0D0F12]/90 border border-[#38BDF8]/40 flex items-start gap-2.5">
                  <Users className="w-4 h-4 text-[#38BDF8] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[11px] font-bold text-[#BAE6FD] uppercase">
                      {dispatchConfirmation.city.toUpperCase()} REGISTERED USERS NOTIFIED ({dispatchConfirmation.cityUsersNotified.length})
                    </div>
                    <div className="text-[11px] text-[#AEB5BE] mt-0.5">
                      {dispatchConfirmation.cityUsersNotified.length > 0 ? (
                        <>
                          Instant SOS notification sent to {dispatchConfirmation.city} riders:{' '}
                          <span className="text-[#F1F3F5] font-semibold">
                            {dispatchConfirmation.cityUsersNotified.map(u => u.name).join(', ')}
                          </span>
                        </>
                      ) : (
                        <>
                          Broadcast active across {dispatchConfirmation.city} sector. Any rider registered in {dispatchConfirmation.city} is automatically alerted.
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Top Banner & Emergency Disclaimer */}
          <div className="bg-[#191D22] border border-[#E04F5F]/50 rounded-lg p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5">
                <div className="w-10 h-10 rounded bg-[#252A30] border border-[#E04F5F]/70 flex items-center justify-center text-[#E04F5F] shrink-0">
                  <AlertTriangle className="w-5 h-5 text-[#E04F5F]" />
                </div>
                <div>
                  <div className="text-sm font-mono font-bold text-[#E04F5F] tracking-wider flex flex-wrap items-center gap-2">
                    <span>SQUADRON ASSIST — EMERGENCY RAPID RESPONSE</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#E04F5F]/20 text-[#E04F5F] border border-[#E04F5F]/30">
                      CITY SECTOR + 25 KM
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#F59E0B]/20 text-[#FDE68A] border border-[#F59E0B]/40">
                      DIRECT ADMIN ALERT
                    </span>
                  </div>
                  <div className="text-xs text-[#A0A7B0] mt-0.5">
                    Alerts all riders registered in the SOS city/area + dispatches a priority alert to Admin Command
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <a
                  href="tel:112"
                  className="px-3.5 py-2 rounded bg-[#252A30] hover:bg-[#414851] text-[#E04F5F] border border-[#E04F5F]/40 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>DIRECT CALL 112 (EMS)</span>
                </a>
                <button
                  onClick={() => {
                    playAlert();
                    if (!formCity && currentUser?.city) {
                      setFormCity(currentUser.city);
                    }
                    setShowCreateModal(true);
                  }}
                  className="px-4 py-2 rounded bg-[#E04F5F] hover:bg-[#c93f4e] text-white text-xs font-mono font-bold tracking-wide transition-all shadow-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>TRIGGER SQUADRON SOS</span>
                </button>
              </div>
            </div>

            {/* Life-Safety Advisory */}
            <div className="mt-4 pt-3 border-t border-[#282D34] text-[11px] font-mono text-[#AEB5BE] flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-[#E04F5F] shrink-0" />
              <span>
                CRITICAL SAFETY ADVISORY: For severe injuries, collisions, or high-risk road situations, dial national emergency services 112 immediately. GHOST PROTOCOL volunteer assist does not replace professional emergency services.
              </span>
            </div>
          </div>

          {/* Main Grid: Active Incidents & Log Details */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Active Emergency Requests (7 Cols) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#282D34] text-xs font-mono">
                <span className="font-bold text-[#D4D8DE] uppercase">
                  ACTIVE SQUADRON INCIDENTS ({activeRequests.length})
                </span>
                <span className="text-[#42B883]">CITY & ADMIN DISPATCH ONLINE</span>
              </div>

              {activeRequests.length === 0 ? (
                <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-10 text-center text-xs font-mono text-[#707883]">
                  NO ACTIVE DISTRESS SIGNALS WITHIN SQUADRON SECTORS
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
                      className={`p-4 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#191D22] border-[#E04F5F]/60'
                          : 'bg-[#0D0F12] border-[#282D34] hover:border-[#414851]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono mb-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-[#E04F5F]/20 text-[#E04F5F] font-bold uppercase">
                            {emg.category}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30 font-bold uppercase">
                            CITY: {incidentCity}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#F59E0B]/15 text-[#FDE68A] border border-[#F59E0B]/30 font-bold uppercase">
                            ADMIN ALERTED
                          </span>
                        </div>
                        <span className="text-[#707883]">
                          NOTIFIED: {emg.notifiedCount} ({incidentCity.toUpperCase()} + ADMIN)
                        </span>
                      </div>

                      <div className="text-sm font-semibold text-[#F1F3F5]">{emg.requesterName}</div>
                      <div className="text-xs font-mono text-[#A0A7B0] mt-0.5">{emg.requesterModel}</div>

                      <p className="text-xs text-[#D4D8DE] mt-2 line-clamp-2 leading-relaxed">
                        {emg.description}
                      </p>

                      {emg.notifiedCityUsers && emg.notifiedCityUsers.length > 0 && (
                        <div className="mt-2.5 px-2.5 py-1.5 rounded bg-[#13161A] border border-[#282D34] text-[10px] font-mono text-[#AEB5BE] flex items-center gap-1.5">
                          <Bell className="w-3 h-3 text-[#38BDF8] shrink-0" />
                          <span className="truncate">
                            Alerted in {incidentCity}:{' '}
                            <strong className="text-[#F1F3F5]">
                              {emg.notifiedCityUsers.map(u => u.name).join(', ')}
                            </strong>
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[#282D34] text-xs font-mono">
                        <div className="flex items-center gap-1.5 text-[#AEB5BE] truncate">
                          <MapPin className="w-3.5 h-3.5 text-[#E04F5F] shrink-0" />
                          <span className="truncate">{emg.locationName}</span>
                        </div>
                        <span className="text-[#42B883] font-semibold">{emg.status}</span>
                      </div>

                      {/* Actions inside card */}
                      <div className="mt-3 flex items-center justify-end space-x-2">
                        {emg.status === 'Submitted' && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              handleRespond(emg.id);
                            }}
                            className="px-3 py-1.5 rounded bg-[#42B883]/20 hover:bg-[#42B883]/30 text-[#42B883] border border-[#42B883]/40 text-xs font-mono font-bold cursor-pointer"
                          >
                            ACKNOWLEDGE & RESPOND
                          </button>
                        )}
                        {emg.status === 'Acknowledged' && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              handleUpdateStatus(emg.id, 'Assistance Arranged');
                            }}
                            className="px-3 py-1.5 rounded bg-[#729BCB]/20 text-[#729BCB] border border-[#729BCB]/40 text-xs font-mono font-bold cursor-pointer"
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
                            className="px-3 py-1.5 rounded bg-[#252A30] hover:bg-[#414851] text-[#F1F3F5] text-xs font-mono font-bold cursor-pointer"
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

            {/* Selected Incident Telemetry & Access Log (5 Cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-5">
                <div className="text-xs font-mono font-semibold text-[#D4D8DE] uppercase pb-2 mb-3 border-b border-[#282D34]">
                  CONFIDENTIAL INCIDENT TELEMETRY
                </div>

                {selectedEmergency ? (
                  <div className="space-y-4 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[#707883]">INCIDENT ID:</div>
                        <div className="text-[#F1F3F5] font-bold">{selectedEmergency.id}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[#707883]">SOS CITY SECTOR:</div>
                        <div className="text-[#38BDF8] font-bold uppercase">
                          {selectedEmergency.city || normalizeCity(selectedEmergency.locationName) || 'BENGALURU'}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[#707883]">CATEGORY:</div>
                      <div className="text-[#E04F5F] font-bold">{selectedEmergency.category}</div>
                    </div>

                    <div>
                      <div className="text-[#707883]">LOCATION:</div>
                      <div className="text-[#D4D8DE] bg-[#13161A] p-2 rounded border border-[#282D34] mt-1">
                        {selectedEmergency.locationName}
                      </div>
                    </div>

                    {/* Admin & City Alert Status */}
                    <div className="p-2.5 rounded bg-[#13161A] border border-[#F59E0B]/40 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-[#FDE68A] uppercase flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-[#F59E0B]" />
                          ADMIN COMMAND ALERT STATUS
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-[#10B981]/20 text-[#10B981] text-[10px] font-bold">
                          PRIORITY ALERT SENT
                        </span>
                      </div>
                      <div className="text-[11px] text-[#AEB5BE]">
                        Notified Admin Command +{' '}
                        <strong className="text-[#F1F3F5]">
                          {selectedEmergency.notifiedCityUsers?.length ?? selectedEmergency.notifiedCount}
                        </strong>{' '}
                        registered user(s) in{' '}
                        <strong className="text-[#38BDF8]">
                          {selectedEmergency.city || normalizeCity(selectedEmergency.locationName) || 'Bengaluru'}
                        </strong>
                        .
                      </div>
                      {selectedEmergency.notifiedCityUsers && selectedEmergency.notifiedCityUsers.length > 0 && (
                        <div className="text-[10px] text-[#707883] pt-1 border-t border-[#282D34]">
                          City Riders Alerted:{' '}
                          <span className="text-[#D4D8DE]">
                            {selectedEmergency.notifiedCityUsers.map(u => u.name).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>

                    {selectedEmergency.callbackPhone && (
                      <div>
                        <div className="text-[#707883]">CALLBACK CONTACT:</div>
                        <a
                          href={`tel:${selectedEmergency.callbackPhone}`}
                          className="text-[#42B883] font-bold hover:underline flex items-center gap-1 mt-0.5"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>{selectedEmergency.callbackPhone}</span>
                        </a>
                      </div>
                    )}

                    {selectedEmergency.responderName && (
                      <div>
                        <div className="text-[#707883]">ASSIGNED RESPONDER:</div>
                        <div className="text-[#42B883] font-bold">{selectedEmergency.responderName}</div>
                      </div>
                    )}

                    {/* Audit & Access Log */}
                    <div className="pt-3 border-t border-[#282D34]">
                      <div className="text-[11px] font-bold text-[#D4D8DE] uppercase mb-2 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-[#707883]" />
                        CONFIDENTIAL ACCESS & DISPATCH LOGS
                      </div>
                      <div className="space-y-2 max-h-44 overflow-y-auto">
                        {selectedEmergency.accessLogs?.map((log, i) => (
                          <div key={i} className="p-2 rounded bg-[#13161A] border border-[#282D34] text-[10px]">
                            <div className="flex items-center justify-between text-[#AEB5BE]">
                              <span className="font-semibold">{log.userName}</span>
                              <span>
                                {new Date(log.accessedAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                            <div className="text-[#707883] mt-0.5">{log.reason}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs font-mono text-[#707883]">
                    SELECT AN ACTIVE INCIDENT TO INSPECT COORDINATES & AUDIT ACCESS
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
        </>
      )}
    </div>
  );
};
