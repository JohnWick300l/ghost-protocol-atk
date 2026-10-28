import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Shield,
  ChevronRight,
  Zap,
  Volume2,
  VolumeX,
  User,
  Lock,
  Phone,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Search,
  Building2,
  Radio,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
  KeyRound,
  Loader2,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { PlaceSuggestion } from '../utils/rules';
import { searchAllIndiaLocations, fetchLiveIndiaPlaces } from '../utils/indiaLocations';

interface PilotWelcomeScreenProps {
  onTakeOffStart?: () => void;
  onTakeOffComplete: () => void;
  reducedMotion?: boolean;
}

type AuthPortalMode = 'customer_login' | 'employee_login' | 'register';

export const PilotWelcomeScreen: React.FC<PilotWelcomeScreenProps> = ({
  onTakeOffStart,
  onTakeOffComplete,
  reducedMotion = false
}) => {
  const { currentUser, login, register, availableUsers } = useAuth();
  const { soundEnabled, toggleSound, playTacticalClick, playChime } = useAudio();

  // Active portal mode
  const [authMode, setAuthMode] = useState<AuthPortalMode>('customer_login');

  // Customer Login Form state
  const [custIdentifier, setCustIdentifier] = useState('vikram.sengupta@example.com');
  const [custPassword, setCustPassword] = useState('GhostProtocol_F77_Pilot!');
  const [custLoginError, setCustLoginError] = useState<string | null>(null);
  const [custLoading, setCustLoading] = useState(false);
  const [showCustPassword, setShowCustPassword] = useState(false);

  // Employee Login Form state
  const [empIdentifier, setEmpIdentifier] = useState('employee@ultraviolette.com');
  const [empPassword, setEmpPassword] = useState('UV_Employee_2026!');
  const [empLoginError, setEmpLoginError] = useState<string | null>(null);
  const [empLoading, setEmpLoading] = useState(false);
  const [showEmpPassword, setShowEmpPassword] = useState(false);

  // Registration Form state
  const [regAccountType, setRegAccountType] = useState<'customer' | 'employee'>('customer');
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regMobile, setRegMobile] = useState('+91 ');
  const [regCity, setRegCity] = useState('Bengaluru');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Customer specific registration fields
  const [regBikeNumber, setRegBikeNumber] = useState('');
  const [regBikeModel, setRegBikeModel] = useState<'F77' | 'X47' | 'X47 Venom'>('F77');


  // Home City / Registered Area Google Maps-style autocomplete state
  const [homeCitySuggestions, setHomeCitySuggestions] = useState<PlaceSuggestion[]>(() =>
    searchAllIndiaLocations('')
  );
  const [showHomeCityDropdown, setShowHomeCityDropdown] = useState(false);
  const [loadingHomeCitySearch, setLoadingHomeCitySearch] = useState(false);
  const homeCityContainerRef = useRef<HTMLDivElement | null>(null);

  // Charging Station Compulsory Opt-In
  const [chargingStationOptIn, setChargingStationOptIn] = useState<'yes' | 'no' | null>(null);
  const [chargerPricing, setChargerPricing] = useState<'Free' | 'Charged'>('Free');
  const [chargerCostAmount, setChargerCostAmount] = useState('15');
  const [chargerCostUnit, setChargerCostUnit] = useState<'per kWh' | 'per hour' | 'per session'>('per kWh');
  const [chargerAvailStart, setChargerAvailStart] = useState('06:00');
  const [chargerAvailEnd, setChargerAvailEnd] = useState('22:00');
  const [chargerAvailDays, setChargerAvailDays] = useState('Daily');
  const [chargerType, setChargerType] = useState<'Boost charger' | 'Standard charger' | 'Only socket'>('Only socket');
  const [chargerTownQuery, setChargerTownQuery] = useState('');
  const [selectedTown, setSelectedTown] = useState<PlaceSuggestion | null>(null);
  const [showTownSuggestions, setShowTownSuggestions] = useState(false);
  const [liveTownSuggestions, setLiveTownSuggestions] = useState<PlaceSuggestion[]>(() =>
    searchAllIndiaLocations('')
  );
  const [loadingTownSearch, setLoadingTownSearch] = useState(false);
  const townSearchContainerRef = useRef<HTMLDivElement | null>(null);

  // OTP Verification state
  const [otpSent, setOtpSent] = useState(false);
  const [otpCodeInput, setOtpCodeInput] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpDispatchBanner, setOtpDispatchBanner] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [regError, setRegError] = useState<string | null>(null);
  const [regLoading, setRegLoading] = useState(false);

  // Mouse parallax tracking
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);

  // Transition stage: 'idle' | 'pressed' | 'accelerating' | 'fading' | 'complete'
  const [transitionStage, setTransitionStage] = useState<'idle' | 'pressed' | 'accelerating' | 'fading' | 'complete'>('idle');
  const isTransitioning = transitionStage !== 'idle';

  // Mount animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  // Parallax handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reducedMotion || isTransitioning) return;
    const { clientWidth, clientHeight } = e.currentTarget;
    const normX = (e.clientX / clientWidth - 0.5) * 2;
    const normY = (e.clientY / clientHeight - 0.5) * 2;
    setMousePos({ x: normX, y: normY });
  };

  const handleMouseLeave = () => {
    if (reducedMotion || isTransitioning) return;
    setMousePos({ x: 0, y: 0 });
  };

  const skyOffset = reducedMotion ? { x: 0, y: 0 } : { x: mousePos.x * 5, y: mousePos.y * 3 };
  const jetOffset = reducedMotion ? { x: 0, y: 0 } : { x: mousePos.x * 14, y: mousePos.y * 8 };

  // Close location dropdowns when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        homeCityContainerRef.current &&
        !homeCityContainerRef.current.contains(e.target as Node)
      ) {
        setShowHomeCityDropdown(false);
      }
      if (
        townSearchContainerRef.current &&
        !townSearchContainerRef.current.contains(e.target as Node)
      ) {
        setShowTownSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Live Google Maps-style India search for Home City / Registered Area
  useEffect(() => {
    const q = regCity.trim();
    const instant = searchAllIndiaLocations(q);
    setHomeCitySuggestions(instant);

    if (q.length < 2) {
      setLoadingHomeCitySearch(false);
      return;
    }

    const controller = new AbortController();
    setLoadingHomeCitySearch(true);
    const timer = setTimeout(async () => {
      try {
        const results = await fetchLiveIndiaPlaces(q, controller.signal);
        setHomeCitySuggestions(results);
      } catch {
        // Ignore abort
      } finally {
        setLoadingHomeCitySearch(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [regCity]);

  // Live Google Maps-style India search for Community Charger City / Town
  useEffect(() => {
    const q = chargerTownQuery.trim();
    const instant = searchAllIndiaLocations(q);
    setLiveTownSuggestions(instant);

    if (q.length < 2) {
      setLoadingTownSearch(false);
      return;
    }

    const controller = new AbortController();
    setLoadingTownSearch(true);
    const timer = setTimeout(async () => {
      try {
        const results = await fetchLiveIndiaPlaces(q, controller.signal);
        setLiveTownSuggestions(results);
      } catch {
        // Ignore abort
      } finally {
        setLoadingTownSearch(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [chargerTownQuery]);

  const townSuggestions = useMemo(() => {
    return liveTownSuggestions;
  }, [liveTownSuggestions]);

  // Take-Off animation execution
  const executeTakeOffSequence = () => {
    playTacticalClick();
    if (soundEnabled) {
      setTimeout(() => playChime(), 160);
    }

    if (reducedMotion) {
      onTakeOffStart?.();
      setTransitionStage('fading');
      setTimeout(() => {
        setTransitionStage('complete');
        onTakeOffComplete();
      }, 350);
      return;
    }

    setTransitionStage('pressed');
    setTimeout(() => {
      setTransitionStage('accelerating');
    }, 120);

    setTimeout(() => {
      onTakeOffStart?.();
      setTransitionStage('fading');
    }, 500);

    setTimeout(() => {
      setTransitionStage('complete');
      onTakeOffComplete();
    }, 850);
  };

  // 1. Customer Sign In Handler
  const handleCustomerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustLoginError(null);
    setCustLoading(true);
    playTacticalClick();

    try {
      const res = await login(custIdentifier, custPassword);
      if (res.success) {
        executeTakeOffSequence();
      } else {
        setCustLoginError(res.error || 'Invalid credentials. Please verify your pilot email/password.');
      }
    } catch (err: any) {
      setCustLoginError(err?.message || 'Network error connecting to telemetry link.');
    } finally {
      setCustLoading(false);
    }
  };

  // 2. Employee Sign In Handler
  const handleEmployeeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmpLoginError(null);
    setEmpLoading(true);
    playTacticalClick();

    try {
      const res = await login(empIdentifier, empPassword);
      if (res.success) {
        executeTakeOffSequence();
      } else {
        setEmpLoginError(res.error || 'Invalid employee credentials. Please verify your work email/password.');
      }
    } catch (err: any) {
      setEmpLoginError(err?.message || 'Network error connecting to telemetry link.');
    } finally {
      setEmpLoading(false);
    }
  };

  // 3. Send OTP Handler
  const handleSendOtp = async () => {
    setOtpError(null);
    const cleanNumber = regMobile.trim();
    if (!cleanNumber || cleanNumber.length < 9) {
      setOtpError('Please enter a valid Indian mobile number (+91).');
      return;
    }

    setOtpLoading(true);
    playTacticalClick();

    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: cleanNumber })
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || 'Failed to dispatch OTP SMS.');
      } else {
        setOtpSent(true);
        setOtpDispatchBanner(`SMS Dispatched: Your 6-digit verification code is [ ${data.otpCode} ]`);
        setOtpCodeInput(data.otpCode || ''); // Auto-fill for seamless pilot experience
        playChime();
      }
    } catch {
      // Offline fallback: Generate simulated 6-digit OTP
      const fallbackCode = Math.floor(100000 + Math.random() * 900000).toString();
      setOtpSent(true);
      setOtpDispatchBanner(`Tactical Dispatch (Local link): Verification code is [ ${fallbackCode} ]`);
      setOtpCodeInput(fallbackCode);
    } finally {
      setOtpLoading(false);
    }
  };

  // 4. Verify OTP Handler
  const handleVerifyOtp = async () => {
    setOtpError(null);
    if (!otpCodeInput || otpCodeInput.trim().length !== 6) {
      setOtpError('Please enter the 6-digit OTP code.');
      return;
    }

    setOtpLoading(true);
    playTacticalClick();

    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: regMobile.trim(), code: otpCodeInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.verified) {
        setOtpVerified(true);
        setOtpError(null);
        playChime();
      } else {
        setOtpError(data.error || 'Invalid OTP code. Please recheck the 6-digit code.');
      }
    } catch {
      // Fallback verification for demo
      setOtpVerified(true);
      setOtpError(null);
      playChime();
    } finally {
      setOtpLoading(false);
    }
  };

  // 5. Complete Registration Handler
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);

    // Validation
    if (!regFullName.trim()) {
      setRegError('Full Name is compulsory for all users.');
      return;
    }
    if (!regEmail.trim()) {
      setRegError('Email address is compulsory.');
      return;
    }
    if (!otpVerified) {
      setRegError('Mobile number OTP verification is compulsory. Please verify your phone number.');
      return;
    }

    // Role-specific validation
    if (regAccountType === 'customer') {
      if (!regBikeNumber.trim()) {
        setRegError('Bike registration number is compulsory for customers.');
        return;
      }
      if (!regBikeModel) {
        setRegError('Bike model selection (F77, X47, or X47 Venom) is compulsory.');
        return;
      }
      if (chargingStationOptIn === null) {
        setRegError('Please answer the compulsory question: "Use your location as charging station?" (YES or NO).');
        return;
      }
      if (chargingStationOptIn === 'yes' && (!selectedTown && !chargerTownQuery.trim())) {
        setRegError('Please select your city or town from the maps search bar.');
        return;
      }
      if (
        chargingStationOptIn === 'yes' &&
        chargerPricing === 'Charged' &&
        (!chargerCostAmount.trim() || Number(chargerCostAmount) <= 0)
      ) {
        setRegError('Please enter a valid cost of charging (₹) for your Charged community charger.');
        return;
      }
    }

    setRegLoading(true);
    playTacticalClick();

    const rawTownInput = selectedTown?.name || chargerTownQuery.trim() || regCity.trim() || 'Bengaluru';
    const matchedIndiaPlace =
      selectedTown ||
      liveTownSuggestions.find(p => p.name.toLowerCase() === rawTownInput.toLowerCase()) ||
      homeCitySuggestions.find(p => p.name.toLowerCase() === rawTownInput.toLowerCase()) ||
      searchAllIndiaLocations(rawTownInput)[0];

    const townName = rawTownInput;
    const townLat = matchedIndiaPlace?.latitude || 12.9716;
    const townLng = matchedIndiaPlace?.longitude || 77.5946;
    const resolvedState = matchedIndiaPlace?.locality?.split(',').pop()?.trim() || 'India';

    const payload: any = {
      fullName: regFullName.trim(),
      email: regEmail.trim(),
      mobile: regMobile.trim(),
      city: townName,
      state: resolvedState,
      password: regPassword || (regAccountType === 'employee' ? 'UV_Employee_2026!' : 'UV_Pilot_2026!'),
      accountType: regAccountType
    };

    if (regAccountType === 'customer') {
      payload.motorcycleModel = regBikeModel;
      payload.registrationNumber = regBikeNumber.trim().toUpperCase();
      if (chargingStationOptIn === 'yes') {
        payload.communityCharger = {
          town: townName,
          pricingType: chargerPricing,
          chargingCostAmount: chargerPricing === 'Charged' ? Math.max(1, Number(chargerCostAmount) || 15) : 0,
          chargingCostUnit: chargerCostUnit,
          availabilityStartTime: chargerAvailStart || '06:00',
          availabilityEndTime: chargerAvailEnd || '22:00',
          availabilityDays: chargerAvailDays || 'Daily',
          requiresReservation: true,
          chargerType,
          latitude: townLat,
          longitude: townLng
        };
      }
    } else {
      payload.role = 'uv_employee';
    }

    try {
      const res = await register(payload);
      if (res.success) {
        executeTakeOffSequence();
      } else {
        setRegError(res.error || 'Registration failed. Please review your details.');
      }
    } catch (err: any) {
      setRegError(err?.message || 'Network error registering account.');
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Ultraviolette Ghost Protocol Portal"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`fixed inset-0 z-50 overflow-y-auto bg-[#08090B] select-none transition-opacity duration-300 ${
        transitionStage === 'fading' || transitionStage === 'complete' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background Cinematic Sky & Escort Formation */}
      <div
        className={`fixed inset-[-4%] w-[108%] h-[108%] pointer-events-none transition-transform ease-out ${
          reducedMotion
            ? ''
            : transitionStage === 'accelerating' || transitionStage === 'fading'
            ? 'duration-700 scale-110'
            : 'duration-500 scale-100'
        }`}
        style={{ transformOrigin: '50% 45%' }}
      >
        {/* Layer 1: Sky & Atmosphere */}
        <div
          className="absolute inset-0"
          style={{
            transform: `translate3d(${skyOffset.x}px, ${skyOffset.y}px, 0)`,
            background: `
              radial-gradient(ellipse 90% 65% at 75% 62%, rgba(245, 158, 11, 0.35) 0%, rgba(217, 119, 6, 0.18) 30%, transparent 70%),
              radial-gradient(ellipse 70% 50% at 20% 70%, rgba(220, 38, 38, 0.18) 0%, transparent 60%),
              linear-gradient(180deg, 
                #07080A 0%, 
                #0B0E14 25%, 
                #181524 50%, 
                #3B1622 68%, 
                #852C0E 80%, 
                #C26705 92%, 
                #E8AA45 100%
              )
            `
          }}
        />

        {/* Layer 2: Sun Glow */}
        <div
          className="absolute right-[14%] top-[35%] w-[420px] h-[420px] rounded-full pointer-events-none animate-sun-glow"
          style={{
            background: 'radial-gradient(circle, rgba(254, 243, 199, 0.35) 0%, rgba(245, 158, 11, 0.18) 35%, transparent 70%)',
            filter: 'blur(36px)'
          }}
        />

        {/* Layer 3: Formation Stealth Fighter Jets */}
        <div
          className="absolute inset-0 pointer-events-none opacity-80"
          style={{ transform: `translate3d(${jetOffset.x}px, ${jetOffset.y}px, 0)` }}
        >
          {/* Jet 1 */}
          <div className="absolute right-[16%] top-[14%] w-[150px] h-[85px] animate-jet-lead">
            <svg viewBox="0 0 160 90" className="w-full h-full drop-shadow-[0_6px_16px_rgba(0,0,0,0.8)]">
              <polygon points="12,45 -22,43 -22,47" fill="#38BDF8" opacity="0.9" filter="blur(1.5px)" />
              <polygon points="12,51 -22,49 -22,53" fill="#38BDF8" opacity="0.9" filter="blur(1.5px)" />
              <polygon points="148,48 42,18 16,33 26,48 16,63 42,78" fill="#1F2937" stroke="#4B5563" strokeWidth="1" />
              <polygon points="120,48 94,43 82,48 94,53" fill="#F59E0B" fillOpacity="0.85" stroke="#FEF08A" strokeWidth="0.8" />
              <polygon points="36,30 18,14 12,20 28,32" fill="#111827" />
              <polygon points="36,66 18,82 12,76 28,64" fill="#111827" />
              <circle cx="40" cy="18" r="2" fill="#10B981" />
            </svg>
          </div>
          {/* Jet 2 */}
          <div className="absolute left-[12%] top-[22%] w-[110px] h-[65px] animate-jet-trail opacity-75">
            <svg viewBox="0 0 160 90" className="w-full h-full drop-shadow-[0_4px_12px_rgba(0,0,0,0.7)]">
              <polygon points="12,45 -14,43 -14,47" fill="#38BDF8" opacity="0.85" filter="blur(1px)" />
              <polygon points="12,51 -14,49 -14,53" fill="#38BDF8" opacity="0.85" filter="blur(1px)" />
              <polygon points="148,48 42,18 16,33 26,48 16,63 42,78" fill="#1F2937" stroke="#4B5563" strokeWidth="0.8" />
              <polygon points="120,48 94,43 82,48 94,53" fill="#F59E0B" fillOpacity="0.7" />
              <polygon points="36,30 18,14 12,20 28,32" fill="#111827" />
              <polygon points="36,66 18,82 12,76 28,64" fill="#111827" />
              <circle cx="40" cy="18" r="1.8" fill="#10B981" />
            </svg>
          </div>
        </div>

        {/* Layer 4: Vignette Overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 90% 80% at 50% 50%, transparent 35%, rgba(8, 9, 11, 0.85) 100%)'
          }}
        />
      </div>

      {/* Top Tactical Header Strip */}
      <div className="relative z-20 flex items-center justify-between px-4 sm:px-8 py-4 border-b border-[#1E2D42]/60 bg-[#08090B]/85 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded bg-[#0D0F12] border border-[#E8AA45]/50 flex items-center justify-center text-[#E8AA45] shadow-[0_0_15px_rgba(232,170,69,0.25)]">
            <Shield className="w-5 h-5 text-[#E8AA45]" />
          </div>
          <div>
            <div className="text-xs font-mono font-bold tracking-widest text-[#F1F3F5] flex items-center gap-2">
              GHOST PROTOCOL
              <span className="text-[9px] px-2 py-0.5 rounded bg-[#E8AA45]/15 border border-[#E8AA45]/40 text-[#E8AA45] font-semibold">
                SQUADRON AVIONICS
              </span>
            </div>
            <div className="text-[10px] font-mono text-[#94A3B8]">
              ULTRAVIOLETTE ELECTRIC MOTORCYCLE PLATFORM
            </div>
          </div>
        </div>

        {/* Audio Toggle */}
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => {
              playTacticalClick();
              toggleSound();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-mono transition-colors border backdrop-blur-md ${
              soundEnabled
                ? 'bg-[#191D22]/80 border-[#10B981]/60 text-[#10B981]'
                : 'bg-[#0D0F12]/80 border-[#282D34] text-[#707883] hover:text-[#AEB5BE]'
            }`}
            title="Toggle tactical audio sound effects"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">AUDIO: {soundEnabled ? 'ONLINE' : 'MUTED'}</span>
          </button>
        </div>
      </div>

      {/* Hero Announcement Banner: FREE APP EXCLUSIVELY FOR ULTRAVIOLETTE CUSTOMERS */}
      <div className="relative z-20 mx-auto max-w-4xl px-4 pt-6">
        <div className="rounded-xl border border-[#E8AA45]/60 bg-gradient-to-r from-[#191D24]/90 via-[#0E131C]/95 to-[#191D24]/90 backdrop-blur-xl p-4 sm:p-5 shadow-[0_12px_36px_rgba(0,0,0,0.8)] text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8AA45]/15 border border-[#E8AA45]/40 text-[#E8AA45] text-[11px] font-mono font-bold tracking-wider mb-2">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></span>
            MANDATORY ACCESS GATE
          </div>
          <h2 className="text-lg sm:text-xl md:text-2xl font-mono font-extrabold text-[#F8FAFC] tracking-tight">
            Free App Exclusively For Ultraviolette Customers & Personnel
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-[#94A3B8] max-w-2xl mx-auto leading-relaxed">
            Only registered Ultraviolette pilots and authorized personnel can access Ghost Protocol avionics.
            Visitor bypass is disabled to preserve telemetry confidentiality and flight squadron safety.
          </p>
        </div>
      </div>

      {/* Main Authentication & Registration Card */}
      <div className="relative z-20 max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <div className="rounded-2xl border border-[#232F42] bg-[#0A0D14]/95 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.95)] overflow-hidden">
          {/* 3 Main Action Tabs */}
          <div className="grid grid-cols-3 border-b border-[#1E2D42] bg-[#06080D]">
            <button
              type="button"
              id="tab-customer-login"
              onClick={() => {
                playTacticalClick();
                setAuthMode('customer_login');
              }}
              className={`py-3.5 px-2 text-center font-mono text-xs sm:text-sm font-bold tracking-wide transition-colors border-b-2 flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer ${
                authMode === 'customer_login'
                  ? 'border-[#E8AA45] text-[#F8FAFC] bg-[#141A24]'
                  : 'border-transparent text-[#94A3B8] hover:text-[#E2E8F0] hover:bg-[#0C1017]'
              }`}
            >
              <Zap className={`w-4 h-4 ${authMode === 'customer_login' ? 'text-[#E8AA45]' : 'text-[#64748B]'}`} />
              <span>Customer Sign In</span>
            </button>

            <button
              type="button"
              id="tab-employee-login"
              onClick={() => {
                playTacticalClick();
                setAuthMode('employee_login');
              }}
              className={`py-3.5 px-2 text-center font-mono text-xs sm:text-sm font-bold tracking-wide transition-colors border-b-2 flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer ${
                authMode === 'employee_login'
                  ? 'border-[#10B981] text-[#F8FAFC] bg-[#141A24]'
                  : 'border-transparent text-[#94A3B8] hover:text-[#E2E8F0] hover:bg-[#0C1017]'
              }`}
            >
              <Building2 className={`w-4 h-4 ${authMode === 'employee_login' ? 'text-[#10B981]' : 'text-[#64748B]'}`} />
              <span>UV Employee Sign In</span>
            </button>

            <button
              type="button"
              id="tab-pilot-register"
              onClick={() => {
                playTacticalClick();
                setAuthMode('register');
              }}
              className={`py-3.5 px-2 text-center font-mono text-xs sm:text-sm font-bold tracking-wide transition-colors border-b-2 flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer ${
                authMode === 'register'
                  ? 'border-[#38BDF8] text-[#F8FAFC] bg-[#141A24]'
                  : 'border-transparent text-[#94A3B8] hover:text-[#E2E8F0] hover:bg-[#0C1017]'
              }`}
            >
              <User className={`w-4 h-4 ${authMode === 'register' ? 'text-[#38BDF8]' : 'text-[#64748B]'}`} />
              <span>Sign Up (Register)</span>
            </button>
          </div>

          <div className="p-5 sm:p-7">
            {/* -------------------- TAB 1: CUSTOMER SIGN IN -------------------- */}
            {authMode === 'customer_login' && (
              <form onSubmit={handleCustomerLogin} className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#1E2D42]">
                  <div>
                    <h3 className="text-base sm:text-lg font-mono font-bold text-[#F8FAFC] flex items-center gap-2">
                      <Zap className="w-5 h-5 text-[#E8AA45]" />
                      Ultraviolette Customer (Pilot) Portal
                    </h3>
                    <p className="text-xs text-[#94A3B8]">
                      Full avionics access: Cockpit, Squadron Assist, Jet Engineer, Charging, and Missions.
                    </p>
                  </div>
                </div>

                {custLoginError && (
                  <div className="p-3 rounded-lg bg-[#EF4444]/15 border border-[#EF4444]/40 text-[#FCA5A5] text-xs font-mono flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#EF4444] shrink-0" />
                    <span>{custLoginError}</span>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-mono text-[#CBD5E1] mb-1">
                      Pilot Email or Pilot ID
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={custIdentifier}
                        onChange={e => setCustIdentifier(e.target.value)}
                        placeholder="e.g. vikram.sengupta@example.com"
                        className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#E8AA45] focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-[#CBD5E1] mb-1">
                      Security Password
                    </label>
                    <div className="relative">
                      <input
                        type={showCustPassword ? 'text' : 'password'}
                        value={custPassword}
                        onChange={e => setCustPassword(e.target.value)}
                        placeholder="Enter password"
                        className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#E8AA45] focus:outline-none pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowCustPassword(!showCustPassword)}
                        className="absolute right-3 top-2.5 text-[#64748B] hover:text-[#CBD5E1]"
                      >
                        {showCustPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Fast Fill Demo Credentials for User Testing */}
                <div className="pt-2">
                  <div className="text-[11px] font-mono text-[#64748B] mb-1.5">Quick Demo Credentials:</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCustIdentifier('vikram.sengupta@example.com');
                        setCustPassword('GhostProtocol_F77_Pilot!');
                        playTacticalClick();
                      }}
                      className="px-2.5 py-1 rounded bg-[#131C2A] hover:bg-[#1A2638] text-[11px] font-mono text-[#E8AA45] border border-[#232F42]"
                    >
                      Pilot 07 (F77 Recon)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustIdentifier('abinavthejas2001@gmail.com');
                        setCustPassword('GhostProtocol_F77_Pilot!');
                        playTacticalClick();
                      }}
                      className="px-2.5 py-1 rounded bg-[#131C2A] hover:bg-[#1A2638] text-[11px] font-mono text-[#38BDF8] border border-[#232F42]"
                    >
                      Admin Pilot (Abinav)
                    </button>
                  </div>
                </div>

                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={custLoading}
                    className="w-full py-3.5 rounded-lg bg-[#E8AA45] hover:bg-[#F59E0B] text-[#0A0D14] font-mono font-bold text-sm tracking-wider uppercase transition-all duration-150 flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(232,170,69,0.35)] cursor-pointer disabled:opacity-50"
                  >
                    <Zap className="w-4 h-4 text-[#0A0D14]" />
                    <span>{custLoading ? 'AUTHENTICATING PILOT...' : 'SIGN IN & TAKE OFF'}</span>
                    <ChevronRight className="w-4 h-4 text-[#0A0D14]" />
                  </button>
                </div>
              </form>
            )}

            {/* -------------------- TAB 2: EMPLOYEE SIGN IN -------------------- */}
            {authMode === 'employee_login' && (
              <form onSubmit={handleEmployeeLogin} className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#1E2D42]">
                  <div>
                    <h3 className="text-base sm:text-lg font-mono font-bold text-[#F8FAFC] flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-[#10B981]" />
                      Ultraviolette Employee Portal
                    </h3>
                    <p className="text-xs text-[#94A3B8]">
                      Authorized personnel portal. Strictly gated to <strong className="text-[#10B981]">Priority Issues</strong> and <strong className="text-[#10B981]">Service Intel</strong>.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#10B981]/10 border border-[#10B981]/30 text-[#A7F3D0] text-xs font-mono">
                  <strong>Access Policy Notice:</strong> Per Ultraviolette security guidelines, company employees are authorized to view and triage customer priority issues and manage service intelligence telemetry only. All other consumer pages are restricted.
                </div>

                {empLoginError && (
                  <div className="p-3 rounded-lg bg-[#EF4444]/15 border border-[#EF4444]/40 text-[#FCA5A5] text-xs font-mono flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#EF4444] shrink-0" />
                    <span>{empLoginError}</span>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-mono text-[#CBD5E1] mb-1">
                      Ultraviolette Work Email
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={empIdentifier}
                        onChange={e => setEmpIdentifier(e.target.value)}
                        placeholder="e.g. employee@ultraviolette.com"
                        className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#10B981] focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-[#CBD5E1] mb-1">
                      Employee Password
                    </label>
                    <div className="relative">
                      <input
                        type={showEmpPassword ? 'text' : 'password'}
                        value={empPassword}
                        onChange={e => setEmpPassword(e.target.value)}
                        placeholder="Enter employee password"
                        className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#10B981] focus:outline-none pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowEmpPassword(!showEmpPassword)}
                        className="absolute right-3 top-2.5 text-[#64748B] hover:text-[#CBD5E1]"
                      >
                        {showEmpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Fast Fill Demo Credentials */}
                <div className="pt-2">
                  <div className="text-[11px] font-mono text-[#64748B] mb-1.5">Quick Demo Employee Credentials:</div>
                  <button
                    type="button"
                    onClick={() => {
                      setEmpIdentifier('employee@ultraviolette.com');
                      setEmpPassword('UV_Employee_2026!');
                      playTacticalClick();
                    }}
                    className="px-2.5 py-1 rounded bg-[#131C2A] hover:bg-[#1A2638] text-[11px] font-mono text-[#10B981] border border-[#232F42]"
                  >
                    UV Service Engineer (employee@ultraviolette.com / UV_Employee_2026!)
                  </button>
                </div>

                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={empLoading}
                    className="w-full py-3.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-[#0A0D14] font-mono font-bold text-sm tracking-wider uppercase transition-all duration-150 flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(16,185,129,0.35)] cursor-pointer disabled:opacity-50"
                  >
                    <Building2 className="w-4 h-4 text-[#0A0D14]" />
                    <span>{empLoading ? 'VERIFYING CREDENTIALS...' : 'SIGN IN AS UV EMPLOYEE'}</span>
                    <ChevronRight className="w-4 h-4 text-[#0A0D14]" />
                  </button>
                </div>
              </form>
            )}

            {/* -------------------- TAB 3: REGISTRATION (SIGN UP) -------------------- */}
            {authMode === 'register' && (
              <form onSubmit={handleRegister} className="space-y-5">
                <div className="flex items-center justify-between pb-2 border-b border-[#1E2D42]">
                  <div>
                    <h3 className="text-base sm:text-lg font-mono font-bold text-[#F8FAFC] flex items-center gap-2">
                      <User className="w-5 h-5 text-[#38BDF8]" />
                      New Pilot & Personnel Registration
                    </h3>
                    <p className="text-xs text-[#94A3B8]">
                      Free membership exclusively for verified Ultraviolette customers and employees.
                    </p>
                  </div>
                </div>

                {regError && (
                  <div className="p-3 rounded-lg bg-[#EF4444]/15 border border-[#EF4444]/40 text-[#FCA5A5] text-xs font-mono flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#EF4444] shrink-0" />
                    <span>{regError}</span>
                  </div>
                )}

                {/* Account Type Selector: Customer vs Employee */}
                <div>
                  <label className="block text-xs font-mono text-[#CBD5E1] mb-2 font-semibold">
                    1. Account Classification <span className="text-[#EF4444]">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setRegAccountType('customer');
                        playTacticalClick();
                      }}
                      className={`py-2.5 px-3 rounded-lg border font-mono text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                        regAccountType === 'customer'
                          ? 'bg-[#E8AA45]/20 border-[#E8AA45] text-[#F8FAFC]'
                          : 'bg-[#070B12] border-[#232F42] text-[#94A3B8] hover:text-[#CBD5E1]'
                      }`}
                    >
                      <Zap className="w-4 h-4 text-[#E8AA45]" />
                      <span>Ultraviolette Customer</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRegAccountType('employee');
                        playTacticalClick();
                      }}
                      className={`py-2.5 px-3 rounded-lg border font-mono text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                        regAccountType === 'employee'
                          ? 'bg-[#10B981]/20 border-[#10B981] text-[#F8FAFC]'
                          : 'bg-[#070B12] border-[#232F42] text-[#94A3B8] hover:text-[#CBD5E1]'
                      }`}
                    >
                      <Building2 className="w-4 h-4 text-[#10B981]" />
                      <span>Ultraviolette Employee</span>
                    </button>
                  </div>
                </div>

                {/* Common Compulsory Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono text-[#CBD5E1] mb-1 font-semibold">
                      Full Name <span className="text-[#EF4444]">*</span>
                    </label>
                    <input
                      type="text"
                      value={regFullName}
                      onChange={e => setRegFullName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full px-3.5 py-2 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#38BDF8] focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-[#CBD5E1] mb-1 font-semibold">
                      Email Address <span className="text-[#EF4444]">*</span>
                    </label>
                    <input
                      type="email"
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                      placeholder={regAccountType === 'customer' ? 'e.g. rahul@example.com' : 'e.g. rahul.s@ultraviolette.com'}
                      className="w-full px-3.5 py-2 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#38BDF8] focus:outline-none"
                      required
                    />
                  </div>
                </div>

                {/* Compulsory Phone with OTP Verification */}
                <div className="p-3.5 rounded-xl border border-[#232F42] bg-[#070B12]/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono text-[#CBD5E1] font-semibold flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-[#38BDF8]" />
                      Phone Number & OTP Verification <span className="text-[#EF4444]">*</span>
                    </label>
                    {otpVerified ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#10B981]/20 border border-[#10B981]/50 text-[#10B981] font-mono text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3" /> VERIFIED
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-[#F59E0B]">OTP VERIFICATION REQUIRED</span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2 relative">
                      <input
                        type="tel"
                        value={regMobile}
                        onChange={e => {
                          setRegMobile(e.target.value);
                          setOtpVerified(false);
                        }}
                        disabled={otpVerified}
                        placeholder="+91 98765 43210"
                        className="w-full px-3.5 py-2 bg-[#0D121D] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#38BDF8] focus:outline-none disabled:opacity-70"
                        required
                      />
                    </div>
                    <button
                      type="button"
                      id="btn-send-otp"
                      onClick={handleSendOtp}
                      disabled={otpLoading || otpVerified}
                      className="py-2 px-3 rounded-lg bg-[#38BDF8]/20 hover:bg-[#38BDF8]/30 border border-[#38BDF8]/50 text-[#38BDF8] font-mono text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {otpLoading ? 'Sending...' : otpSent ? 'Resend OTP' : 'Send OTP'}
                    </button>
                  </div>

                  {/* High Visibility Tactical OTP Dispatch Banner */}
                  {otpDispatchBanner && !otpVerified && (
                    <div className="p-3 rounded-lg bg-[#38BDF8]/15 border border-[#38BDF8]/50 text-[#BAE6FD] text-xs font-mono flex items-center justify-between gap-2 animate-pulse">
                      <div className="flex items-center gap-2">
                        <Radio className="w-4 h-4 text-[#38BDF8] shrink-0" />
                        <span>{otpDispatchBanner}</span>
                      </div>
                      <span className="text-[10px] text-[#38BDF8] uppercase font-bold">LIVE CODE</span>
                    </div>
                  )}

                  {otpSent && !otpVerified && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          maxLength={6}
                          value={otpCodeInput}
                          onChange={e => setOtpCodeInput(e.target.value.replace(/\D/g, ''))}
                          placeholder="Enter 6-digit OTP code"
                          className="w-full px-3.5 py-2 bg-[#0D121D] border border-[#38BDF8]/60 rounded-lg text-sm font-mono tracking-widest text-[#F8FAFC] placeholder-[#64748B] focus:border-[#38BDF8] focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        id="btn-verify-otp"
                        onClick={handleVerifyOtp}
                        disabled={otpLoading || otpCodeInput.length !== 6}
                        className="py-2 px-3 rounded-lg bg-[#10B981] hover:bg-[#059669] text-[#0A0D14] font-mono text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verify OTP</span>
                      </button>
                    </div>
                  )}

                  {otpError && (
                    <div className="text-[11px] font-mono text-[#EF4444]">{otpError}</div>
                  )}
                </div>

                {/* ----------------- CUSTOMER COMPULSORY FIELDS ----------------- */}
                {regAccountType === 'customer' && (
                  <div className="space-y-4 pt-2 border-t border-[#1E2D42]">
                    <div className="text-xs font-mono font-bold text-[#E8AA45] uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-[#E8AA45]" />
                      Ultraviolette Motorcycle Ownership Credentials
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Bike Number */}
                      <div>
                        <label className="block text-xs font-mono text-[#CBD5E1] mb-1 font-semibold">
                          Bike Registration Number <span className="text-[#EF4444]">*</span>
                        </label>
                        <input
                          type="text"
                          value={regBikeNumber}
                          onChange={e => setRegBikeNumber(e.target.value.toUpperCase())}
                          placeholder="e.g. KA 01 EV 1234"
                          className="w-full px-3.5 py-2 bg-[#070B12] border border-[#232F42] rounded-lg text-sm font-mono text-[#F8FAFC] placeholder-[#64748B] focus:border-[#E8AA45] focus:outline-none"
                          required
                        />
                      </div>

                      {/* Bike Model: Strictly F77, X47, X47 Venom */}
                      <div>
                        <label className="block text-xs font-mono text-[#CBD5E1] mb-1 font-semibold">
                          Bike Model <span className="text-[#EF4444]">*</span>
                        </label>
                        <select
                          id="select-bike-model"
                          value={regBikeModel}
                          onChange={e => setRegBikeModel(e.target.value as any)}
                          className="w-full px-3.5 py-2 bg-[#070B12] border border-[#232F42] rounded-lg text-sm font-mono text-[#F8FAFC] focus:border-[#E8AA45] focus:outline-none cursor-pointer"
                          required
                        >
                          <option value="F77">F77</option>
                          <option value="X47">X47</option>
                          <option value="X47 Venom">X47 Venom</option>
                        </select>
                      </div>
                    </div>

                    {/* COMPULSORY COMMUNITY CHARGING LOCATION QUESTION */}
                    <div className="p-4 rounded-xl border border-[#E8AA45]/50 bg-[#121722]/90 space-y-3 shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
                      <div className="space-y-1">
                        <div className="text-xs sm:text-sm font-mono font-bold text-[#F8FAFC] flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-[#E8AA45]" />
                          Use your location as charging station? <span className="text-[#EF4444]">*</span>
                        </div>
                        <div className="text-[11px] sm:text-xs text-[#E8AA45] font-sans font-medium leading-relaxed">
                          Note: Help squadron and yourself to fly more without any charging anxiety (only provide your city or town name).
                        </div>
                      </div>

                      {/* YES or NO Buttons */}
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <button
                          type="button"
                          id="btn-opt-in-yes"
                          onClick={() => {
                            setChargingStationOptIn('yes');
                            playTacticalClick();
                          }}
                          className={`py-2.5 px-4 rounded-lg border font-mono text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                            chargingStationOptIn === 'yes'
                              ? 'bg-[#10B981] border-[#10B981] text-[#0A0D14] shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                              : 'bg-[#070B12] border-[#232F42] text-[#94A3B8] hover:text-[#F8FAFC]'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>YES</span>
                        </button>

                        <button
                          type="button"
                          id="btn-opt-in-no"
                          onClick={() => {
                            setChargingStationOptIn('no');
                            playTacticalClick();
                          }}
                          className={`py-2.5 px-4 rounded-lg border font-mono text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                            chargingStationOptIn === 'no'
                              ? 'bg-[#E8AA45]/20 border-[#E8AA45] text-[#F8FAFC]'
                              : 'bg-[#070B12] border-[#232F42] text-[#94A3B8] hover:text-[#F8FAFC]'
                          }`}
                        >
                          <span>NO (Skip Charging Share)</span>
                        </button>
                      </div>

                      {/* IF YES: Compulsory Charger Details & Town Search */}
                      {chargingStationOptIn === 'yes' && (
                        <div className="pt-3 border-t border-[#232F42] space-y-3.5 animate-fadeIn">
                          {/* Confidentiality Notice */}
                          <div className="p-2.5 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/30 text-[#BAE6FD] text-xs font-mono">
                            <strong>Confidentiality Guarantee:</strong> Please provide only your city or town name to maintain confidentiality. Your precise home address will never be shared publicly.
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Free or Charged */}
                            <div>
                              <label className="block text-xs font-mono text-[#CBD5E1] mb-1 font-semibold">
                                Charging Mode (Free or Charged) <span className="text-[#EF4444]">*</span>
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  id="btn-pricing-free"
                                  onClick={() => setChargerPricing('Free')}
                                  className={`py-2 px-3 rounded-lg border font-mono text-xs font-bold transition-colors cursor-pointer ${
                                    chargerPricing === 'Free'
                                      ? 'bg-[#10B981]/20 border-[#10B981] text-[#10B981]'
                                      : 'bg-[#070B12] border-[#232F42] text-[#94A3B8]'
                                  }`}
                                >
                                  Free
                                </button>
                                <button
                                  type="button"
                                  id="btn-pricing-charged"
                                  onClick={() => setChargerPricing('Charged')}
                                  className={`py-2 px-3 rounded-lg border font-mono text-xs font-bold transition-colors cursor-pointer ${
                                    chargerPricing === 'Charged'
                                      ? 'bg-[#E8AA45]/20 border-[#E8AA45] text-[#E8AA45]'
                                      : 'bg-[#070B12] border-[#232F42] text-[#94A3B8]'
                                  }`}
                                >
                                  Charged (Paid)
                                </button>
                              </div>
                            </div>

                            {/* Charger Type: Only socket, Standard charger, Boost charger */}
                            <div>
                              <label className="block text-xs font-mono text-[#CBD5E1] mb-1 font-semibold">
                                Charger Type <span className="text-[#EF4444]">*</span>
                              </label>
                              <select
                                id="select-charger-type"
                                value={chargerType}
                                onChange={e => setChargerType(e.target.value as any)}
                                className="w-full px-3 py-2 bg-[#070B12] border border-[#232F42] rounded-lg text-xs font-mono text-[#F8FAFC] focus:border-[#E8AA45] focus:outline-none cursor-pointer"
                              >
                                <option value="Only socket">Only socket</option>
                                <option value="Standard charger">Standard charger</option>
                                <option value="Boost charger">Boost charger</option>
                              </select>
                            </div>
                          </div>

                          {/* Cost of Charging (shown when Charged is selected) */}
                          {chargerPricing === 'Charged' && (
                            <div className="p-3 rounded-lg bg-[#E8AA45]/10 border border-[#E8AA45]/35 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fadeIn">
                              <div>
                                <label
                                  htmlFor="input-charger-cost-amount"
                                  className="block text-xs font-mono text-[#FDE68A] mb-1 font-semibold"
                                >
                                  Cost of Charging (₹) <span className="text-[#EF4444]">*</span>
                                </label>
                                <input
                                  id="input-charger-cost-amount"
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={chargerCostAmount}
                                  onChange={e => setChargerCostAmount(e.target.value)}
                                  placeholder="e.g. 15"
                                  className="w-full px-3 py-2 bg-[#070B12] border border-[#E8AA45]/50 rounded-lg text-xs font-mono text-[#F8FAFC] focus:border-[#E8AA45] focus:outline-none"
                                />
                              </div>
                              <div>
                                <label
                                  htmlFor="select-charger-cost-unit"
                                  className="block text-xs font-mono text-[#FDE68A] mb-1 font-semibold"
                                >
                                  Billing Rate Unit <span className="text-[#EF4444]">*</span>
                                </label>
                                <select
                                  id="select-charger-cost-unit"
                                  value={chargerCostUnit}
                                  onChange={e => setChargerCostUnit(e.target.value as any)}
                                  className="w-full px-3 py-2 bg-[#070B12] border border-[#E8AA45]/50 rounded-lg text-xs font-mono text-[#F8FAFC] focus:border-[#E8AA45] focus:outline-none cursor-pointer"
                                >
                                  <option value="per kWh">₹ per kWh</option>
                                  <option value="per hour">₹ per hour</option>
                                  <option value="per session">₹ per session (Flat)</option>
                                </select>
                              </div>
                            </div>
                          )}

                          {/* Availability Time & Schedule */}
                          <div className="p-3 rounded-lg bg-[#070B12] border border-[#232F42] space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-mono text-[#E2E8F0] font-semibold">
                                Charger Availability Time &amp; Schedule <span className="text-[#EF4444]">*</span>
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#10B981]/15 border border-[#10B981]/40 text-[#34D399]">
                                RESERVATION REQUIRED
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              <div>
                                <label
                                  htmlFor="input-charger-avail-start"
                                  className="block text-[11px] font-mono text-[#94A3B8] mb-1"
                                >
                                  Start Time
                                </label>
                                <input
                                  id="input-charger-avail-start"
                                  type="time"
                                  value={chargerAvailStart}
                                  disabled={chargerAvailDays === '24/7 Anytime'}
                                  onChange={e => setChargerAvailStart(e.target.value)}
                                  className="w-full px-2.5 py-2 bg-[#0B101B] border border-[#232F42] rounded-lg text-xs font-mono text-[#F8FAFC] focus:border-[#E8AA45] focus:outline-none disabled:opacity-50"
                                />
                              </div>
                              <div>
                                <label
                                  htmlFor="input-charger-avail-end"
                                  className="block text-[11px] font-mono text-[#94A3B8] mb-1"
                                >
                                  End Time
                                </label>
                                <input
                                  id="input-charger-avail-end"
                                  type="time"
                                  value={chargerAvailEnd}
                                  disabled={chargerAvailDays === '24/7 Anytime'}
                                  onChange={e => setChargerAvailEnd(e.target.value)}
                                  className="w-full px-2.5 py-2 bg-[#0B101B] border border-[#232F42] rounded-lg text-xs font-mono text-[#F8FAFC] focus:border-[#E8AA45] focus:outline-none disabled:opacity-50"
                                />
                              </div>
                              <div>
                                <label
                                  htmlFor="select-charger-avail-days"
                                  className="block text-[11px] font-mono text-[#94A3B8] mb-1"
                                >
                                  Available Days
                                </label>
                                <select
                                  id="select-charger-avail-days"
                                  value={chargerAvailDays}
                                  onChange={e => setChargerAvailDays(e.target.value)}
                                  className="w-full px-2.5 py-2 bg-[#0B101B] border border-[#232F42] rounded-lg text-xs font-mono text-[#F8FAFC] focus:border-[#E8AA45] focus:outline-none cursor-pointer"
                                >
                                  <option value="Daily">Daily</option>
                                  <option value="24/7 Anytime">24/7 Anytime</option>
                                  <option value="Weekdays Only">Weekdays Only</option>
                                  <option value="Weekends Only">Weekends Only</option>
                                </select>
                              </div>
                            </div>
                            <p className="text-[11px] font-mono text-[#94A3B8]">
                              Any rider who wants to charge at your Community Provided Charger must request a time-slot reservation with you first.
                            </p>
                          </div>

                          {/* Town Search Bar with Live All-India Google Maps-style Autocomplete */}
                          <div ref={townSearchContainerRef} className="relative">
                            <label className="block text-xs font-mono text-[#CBD5E1] mb-1 font-semibold">
                              select your locality ( please choose your locality not major city or town , ex: whitefield , shivajinagar , thrissur etc ) <span className="text-[#EF4444]">*</span>
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                id="input-search-town"
                                value={chargerTownQuery}
                                onChange={e => {
                                  const val = e.target.value;
                                  setSelectedTown(null);
                                  setChargerTownQuery(val);
                                  setShowTownSuggestions(true);
                                }}
                                onFocus={() => setShowTownSuggestions(true)}
                                placeholder="Type any city, town, or location across India..."
                                className="w-full pl-9 pr-8 py-2.5 bg-[#070B12] border border-[#E8AA45]/60 rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#E8AA45] focus:outline-none"
                              />
                              <Search className="w-4 h-4 text-[#E8AA45] absolute left-3 top-3 pointer-events-none" />
                              {loadingTownSearch ? (
                                <Loader2 className="w-4 h-4 text-[#E8AA45] animate-spin absolute right-3 top-3" />
                              ) : chargerTownQuery ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTown(null);
                                    setChargerTownQuery('');
                                    setShowTownSuggestions(true);
                                  }}
                                  className="absolute right-3 top-3 text-[#64748B] hover:text-[#CBD5E1]"
                                  title="Clear location search"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              ) : null}
                            </div>

                            {/* Autocomplete Dropdown List */}
                            {showTownSuggestions && (
                              <div className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto rounded-lg bg-[#070B12] border border-[#232F42] shadow-2xl z-30 divide-y divide-[#1A2638]">
                                {townSuggestions.map(p => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedTown(p);
                                      setChargerTownQuery(p.name);
                                      setRegCity(p.name);
                                      setShowTownSuggestions(false);
                                      playTacticalClick();
                                    }}
                                    className="w-full px-3 py-2 text-left hover:bg-[#131C2A] transition-colors flex items-center justify-between text-xs cursor-pointer"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <div className="font-bold text-[#F8FAFC] flex items-center gap-1.5 truncate">
                                        <MapPin className="w-3.5 h-3.5 text-[#E8AA45] shrink-0" />
                                        <span className="truncate">{p.name}</span>
                                      </div>
                                      <div className="text-[10px] text-[#94A3B8] pl-5 truncate">
                                        {p.locality || p.address}
                                      </div>
                                    </div>
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1A2638] text-[#38BDF8] shrink-0">
                                      Select
                                    </span>
                                  </button>
                                ))}

                                {chargerTownQuery.trim().length > 0 &&
                                  !townSuggestions.some(
                                    s => s.name.toLowerCase() === chargerTownQuery.trim().toLowerCase()
                                  ) && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const customTownName = chargerTownQuery.trim();
                                        const fallbackMatch = townSuggestions[0];
                                        const customSuggestion: PlaceSuggestion = {
                                          id: `custom_town_${Date.now()}`,
                                          name: customTownName,
                                          locality: fallbackMatch?.locality || 'India',
                                          address: `${customTownName}, India`,
                                          category: 'City / Town',
                                          latitude: fallbackMatch?.latitude || 12.9716,
                                          longitude: fallbackMatch?.longitude || 77.5946
                                        };
                                        setSelectedTown(customSuggestion);
                                        setChargerTownQuery(customTownName);
                                        setRegCity(customTownName);
                                        setShowTownSuggestions(false);
                                        playTacticalClick();
                                      }}
                                      className="w-full px-3 py-2.5 text-left bg-[#0D1524] hover:bg-[#131C2A] transition-colors flex items-center justify-between text-xs cursor-pointer"
                                    >
                                      <div className="flex items-center gap-1.5 text-[#E8AA45] font-mono">
                                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                                        <span>Use &ldquo;{chargerTownQuery.trim()}&rdquo; as Location</span>
                                      </div>
                                      <span className="text-[10px] font-mono text-[#38BDF8]">Select Location</span>
                                    </button>
                                  )}
                              </div>
                            )}

                            {(selectedTown || chargerTownQuery.trim()) && (
                              <div className="mt-2 text-[11px] font-mono text-[#10B981] flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                                <span>
                                  Selected: {selectedTown ? selectedTown.name : chargerTownQuery.trim()}
                                  {selectedTown?.locality ? `, ${selectedTown.locality}` : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}


                {/* Submit Registration Button */}
                <div className="pt-3">
                  <button
                    type="submit"
                    id="btn-complete-registration"
                    disabled={regLoading || !otpVerified}
                    className="w-full py-3.5 rounded-lg bg-[#38BDF8] hover:bg-[#0284C7] text-[#0A0D14] font-mono font-bold text-sm tracking-wider uppercase transition-all duration-150 flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(56,189,248,0.35)] cursor-pointer disabled:opacity-50"
                  >
                    <Shield className="w-4 h-4 text-[#0A0D14]" />
                    <span>{regLoading ? 'PROCESSING REGISTRATION...' : 'COMPLETE REGISTRATION & TAKE OFF'}</span>
                    <ChevronRight className="w-4 h-4 text-[#0A0D14]" />
                  </button>
                  {!otpVerified && (
                    <div className="mt-1.5 text-center text-[10px] font-mono text-[#F59E0B]">
                      * Verify mobile OTP above to activate registration
                    </div>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
