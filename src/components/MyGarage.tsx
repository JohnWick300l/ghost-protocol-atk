import React, { useState } from 'react';
import { Layers, ShieldCheck, Lock, Eye, EyeOff, Key, UserCheck, Wrench, Shield, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { VALID_BLOOD_GROUPS, BloodGroup } from '../utils/rules';
import { AvionicsToggleTransition, motion } from './AvionicsTransition';
import { BackButton } from './BackButton';

export const MyGarage: React.FC = () => {
  const { currentUser, updateProfile, register, openAuthModal, changePassword } = useAuth();
  const { playTacticalClick, playChime, reducedMotion } = useAudio();

  const [activeTab, setActiveTab] = useState<'garage' | 'profile' | 'privacy'>('garage');

  // Privacy toggles state
  const [showStartingPoint, setShowStartingPoint] = useState(currentUser?.privacySettings?.showStartingPoint ?? true);
  const [showCity, setShowCity] = useState(currentUser?.privacySettings?.showCity ?? true);
  const [showMotorcycleDetails, setShowMotorcycleDetails] = useState(currentUser?.privacySettings?.showMotorcycleDetails ?? true);
  const [optInSquadronAssist, setOptInSquadronAssist] = useState(currentUser?.optInSquadronAssist ?? true);
  const [privacyNotice, setPrivacyNotice] = useState<string | null>(null);

  // New registration form state
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regMobile, setRegMobile] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCity, setRegCity] = useState('Bengaluru');
  const [regState, setRegState] = useState('Karnataka');
  const [regModel, setRegModel] = useState<'F77' | 'X47'>('F77');
  const [regVariant, setRegVariant] = useState('Recon Laser Black (10.3 kWh)');
  const [regNumber, setRegNumber] = useState('KA 01 EV 1077');
  const [regBloodGroup, setRegBloodGroup] = useState<BloodGroup>('O+');
  const [regContactName, setRegContactName] = useState('');
  const [regContactPhone, setRegContactPhone] = useState('');
  const [regRelationship, setRegRelationship] = useState('Family');
  const [regNotice, setRegNotice] = useState<string | null>(null);

  // Password change state for authenticated users
  const [curPassword, setCurPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmNextPassword, setConfirmNextPassword] = useState('');
  const [pwdChangeNotice, setPwdChangeNotice] = useState<string | null>(null);

  const handleSavePrivacy = async () => {
    playTacticalClick();
    const res = await updateProfile({
      optInSquadronAssist,
      privacySettings: {
        showStartingPoint,
        showCity,
        showMotorcycleDetails
      }
    });
    if (res.success) {
      playChime();
      setPrivacyNotice('Squadron privacy settings updated and persisted.');
    } else {
      setPrivacyNotice(`Error: ${res.error || 'Failed to update privacy settings'}`);
    }
  };

  const handleRegisterNewOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    playTacticalClick();

    const res = await register({
      fullName: regFullName,
      email: regEmail,
      mobile: regMobile,
      password: regPassword.trim() || undefined,
      city: regCity,
      state: regState,
      motorcycleModel: regModel,
      variant: regVariant,
      registrationNumber: regNumber,
      bloodGroup: regBloodGroup,
      emergencyContact: {
        name: regContactName,
        phone: regContactPhone,
        relationship: regRelationship
      }
    });

    if (res.success) {
      playChime();
      setRegPassword('');
      setRegNotice('Registration submitted. Status: PENDING review by Ghost Protocol administrators.');
    } else {
      setRegNotice(`Error: ${res.error}`);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    playTacticalClick();
    setPwdChangeNotice(null);
    if (nextPassword !== confirmNextPassword) {
      setPwdChangeNotice('Error: New password confirmation does not match.');
      return;
    }
    const res = await changePassword(curPassword, nextPassword);
    if (res.success) {
      playChime();
      setCurPassword('');
      setNextPassword('');
      setConfirmNextPassword('');
      setPwdChangeNotice('Operator password updated and active session rotated.');
    } else {
      setPwdChangeNotice(`Error: ${res.error}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-[#13161A] border border-[#282D34] rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded bg-[#191D22] border border-[#414851] flex items-center justify-center text-[#D4D8DE]">
            <Layers className="w-5 h-5 text-[#D4D8DE]" />
          </div>
          <div>
            <div className="text-sm font-mono font-bold text-[#F1F3F5] tracking-wider flex items-center gap-2">
              MY GARAGE
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded uppercase border ${
                  currentUser?.verificationStatus === 'verified'
                    ? 'bg-[#42B883]/15 text-[#42B883] border-[#42B883]/30'
                    : 'bg-[#E8AA45]/15 text-[#E8AA45] border-[#E8AA45]/30'
                }`}
              >
                {currentUser?.verificationStatus === 'verified' ? 'VERIFIED OWNER' : 'PENDING APPLICATION'}
              </span>
            </div>
            <div className="text-xs text-[#A0A7B0] mt-0.5">
              Personal motorcycle telemetry • Ownership credentials • Confidential safety records
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex p-1 rounded-md bg-[#0D0F12] border border-[#282D34] text-xs font-mono">
          <button
            onClick={() => {
              playTacticalClick();
              setActiveTab('garage');
            }}
            className={`relative px-3 py-1.5 rounded transition-colors cursor-pointer ${
              activeTab === 'garage'
                ? 'text-[#F1F3F5] font-semibold'
                : 'text-[#707883] hover:text-[#AEB5BE]'
            }`}
          >
            {activeTab === 'garage' && (
              <motion.span
                layoutId="my-garage-tab-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="pointer-events-none absolute inset-0 rounded bg-[#191D22] border border-[#414851]"
              />
            )}
            <span className="relative z-10">GARAGE</span>
          </button>
          <button
            onClick={() => {
              playTacticalClick();
              setActiveTab('profile');
            }}
            className={`relative px-3 py-1.5 rounded transition-colors cursor-pointer ${
              activeTab === 'profile'
                ? 'text-[#F1F3F5] font-semibold'
                : 'text-[#707883] hover:text-[#AEB5BE]'
            }`}
          >
            {activeTab === 'profile' && (
              <motion.span
                layoutId="my-garage-tab-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="pointer-events-none absolute inset-0 rounded bg-[#191D22] border border-[#414851]"
              />
            )}
            <span className="relative z-10">CREDENTIALS</span>
          </button>
          <button
            onClick={() => {
              playTacticalClick();
              setActiveTab('privacy');
            }}
            className={`relative px-3 py-1.5 rounded transition-colors cursor-pointer ${
              activeTab === 'privacy'
                ? 'text-[#F1F3F5] font-semibold'
                : 'text-[#707883] hover:text-[#AEB5BE]'
            }`}
          >
            {activeTab === 'privacy' && (
              <motion.span
                layoutId="my-garage-tab-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="pointer-events-none absolute inset-0 rounded bg-[#191D22] border border-[#414851]"
              />
            )}
            <span className="relative z-10">PRIVACY</span>
          </button>
        </div>
      </div>

      <AvionicsToggleTransition
        activeKey={activeTab}
        orderedKeys={['garage', 'profile', 'privacy']}
        accentColor="sky"
        reducedMotion={reducedMotion}
      >
      {/* ========================================================= */}
      {/* UNAUTHENTICATED GUARD FOR GARAGE & PRIVACY TABS */}
      {/* ========================================================= */}
      {(activeTab === 'garage' || activeTab === 'privacy') && !currentUser && (
        <div className="max-w-xl mx-auto bg-[#0D0F12] border border-[#282D34] rounded-lg p-6 space-y-4 font-mono text-xs text-center">
          <div className="w-10 h-10 mx-auto rounded bg-[#13161A] border border-[#414851] flex items-center justify-center text-[#E8AA45]">
            <Lock className="w-5 h-5" />
          </div>
          <div className="text-sm font-bold text-[#F1F3F5]">
            CONFIDENTIAL GARAGE & SAFETY PROFILE LOCKED
          </div>
          <p className="text-[#A0A7B0] leading-relaxed">
            Personal vehicle registration numbers, blood group records, emergency family contacts, and privacy controls are protected behind verified session authentication.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                playTacticalClick();
                openAuthModal();
              }}
              className="px-4 py-2 rounded bg-[#42B883] hover:bg-[#389d6f] text-[#08090B] font-bold transition-colors"
            >
              SIGN IN TO MY GARAGE
            </button>
            <button
              type="button"
              onClick={() => {
                playTacticalClick();
                setActiveTab('profile');
              }}
              className="px-4 py-2 rounded bg-[#191D22] hover:bg-[#252A30] text-[#D4D8DE] border border-[#414851] font-bold transition-colors"
            >
              REGISTER NEW MOTORCYCLE
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: GARAGE TELEMETRY & SPECIFICATIONS */}
      {/* ========================================================= */}
      {activeTab === 'garage' && currentUser && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Bike Card (8 Cols) */}
          <div className="lg:col-span-8 bg-[#0D0F12] border border-[#282D34] rounded-lg p-5 space-y-6 font-mono text-xs">
            <div>
              <div className="flex items-center justify-between text-[10px] text-[#707883] pb-2 border-b border-[#282D34]">
                <span>SQUADRON ASSET IDENTIFIER: #UV-007</span>
                <span className="text-[#42B883] font-bold">TELEMETRY LINK ACTIVE</span>
              </div>
              <div className="text-lg font-bold text-[#F1F3F5] mt-2">{currentUser.motorcycleModel}</div>
              <div className="text-xs text-[#A0A7B0]">{currentUser.variant}</div>
            </div>

            {/* Vehicle Performance Specifications */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded bg-[#13161A] border border-[#282D34]">
                <div className="text-[10px] text-[#707883]">BATTERY PACK</div>
                <div className="text-[#42B883] font-bold text-sm mt-0.5">
                  {currentUser.motorcycleModel.includes('MACH 2') || currentUser.motorcycleModel.includes('Recon')
                    ? '10.3 kWh SRB'
                    : '7.1 kWh'}
                </div>
              </div>
              <div className="p-3 rounded bg-[#13161A] border border-[#282D34]">
                <div className="text-[10px] text-[#707883]">IDC RANGE</div>
                <div className="text-[#F1F3F5] font-bold text-sm mt-0.5">
                  {currentUser.motorcycleModel.includes('MACH 2') ? '323 KM' : '206 KM'}
                </div>
              </div>
              <div className="p-3 rounded bg-[#13161A] border border-[#282D34]">
                <div className="text-[10px] text-[#707883]">MOTOR OUTPUT</div>
                <div className="text-[#F1F3F5] font-bold text-sm mt-0.5">30 kW / 100 Nm</div>
              </div>
              <div className="p-3 rounded bg-[#13161A] border border-[#282D34]">
                <div className="text-[10px] text-[#707883]">ABS CONTROLLER</div>
                <div className="text-[#729BCB] font-bold text-sm mt-0.5">Bosch 9.3 MP</div>
              </div>
            </div>

            {/* Private Ownership Records (Strictly Private to Owner) */}
            <div className="p-4 rounded bg-[#13161A] border border-[#282D34] space-y-3">
              <div className="text-xs font-bold text-[#D4D8DE] uppercase flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#E8AA45]" />
                  PRIVATE REGISTRATION & VIN (CONFIDENTIAL)
                </span>
                <span className="text-[10px] text-[#707883]">NEVER EXPOSED PUBLICLY</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[#707883]">REGISTRATION NUMBER:</div>
                  <div className="text-[#F1F3F5] font-bold mt-0.5">{currentUser.registrationNumber}</div>
                </div>
                <div>
                  <div className="text-[#707883]">PURCHASE DATE:</div>
                  <div className="text-[#F1F3F5] font-semibold mt-0.5">{currentUser.purchaseDate || '2024-05-15'}</div>
                </div>
              </div>
            </div>

            {/* Maintenance & Telemetry Summary */}
            <div className="p-4 rounded bg-[#13161A] border border-[#282D34] space-y-2">
              <div className="text-xs font-bold text-[#D4D8DE] uppercase">
                CALIBRATED SERVICE INTERVALS
              </div>
              <div className="text-[11px] text-[#A0A7B0] leading-relaxed">
                Next scheduled inspection at 10,000 km or 6 months. Acoustic belt tension nominal frequency: 210 Hz. Brake fluid DOT 4 replenishment interval: 24 months.
              </div>
            </div>
          </div>

          {/* Confidential Emergency Profile Card (4 Cols) */}
          <div className="lg:col-span-4 bg-[#0D0F12] border border-[#282D34] rounded-lg p-5 space-y-4 font-mono text-xs">
            <div className="pb-2 border-b border-[#282D34]">
              <div className="text-xs font-bold text-[#E04F5F] uppercase flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-[#E04F5F]" />
                CONFIDENTIAL SAFETY PROFILE
              </div>
              <div className="text-[10px] text-[#707883] mt-0.5">
                Accessed only during active emergency dispatch workflows
              </div>
            </div>

            <div className="p-3 rounded bg-[#13161A] border border-[#282D34] space-y-1">
              <div className="text-[10px] text-[#707883]">RECORDED BLOOD GROUP</div>
              <div className="text-base font-bold text-[#F1F3F5]">{currentUser.bloodGroup}</div>
              <div className="text-[9px] text-[#707883]">
                Self-reported by member. Not treated as medically certified.
              </div>
            </div>

            <div className="p-3 rounded bg-[#13161A] border border-[#282D34] space-y-2">
              <div className="text-[10px] text-[#707883]">EMERGENCY CONTACT</div>
              <div className="text-[#F1F3F5] font-bold">{currentUser.emergencyContact?.name}</div>
              <div className="text-[#A0A7B0] text-[11px]">
                {currentUser.emergencyContact?.relationship} • {currentUser.emergencyContact?.phone}
              </div>
            </div>

            <div className="p-3 rounded bg-[#13161A] border border-[#282D34] text-[10px] text-[#AEB5BE] leading-relaxed">
              This data remains strictly locked behind server-side authorization and is never exposed in discussions, rides, or public profiles.
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: CREDENTIALS & NEW REGISTRATION */}
      {/* ========================================================= */}
      {activeTab === 'profile' && (
        <div className="max-w-2xl mx-auto bg-[#0D0F12] border border-[#282D34] rounded-lg p-6 space-y-5 font-mono text-xs">
          <div className="pb-3 border-b border-[#282D34]">
            <div className="text-sm font-bold text-[#F1F3F5]">REGISTER ULTRAVIOTTE MOTORCYCLE</div>
            <div className="text-xs text-[#A0A7B0] mt-0.5">
              Submit ownership documentation and personal safety contacts to gain verified Ghost Protocol clearance.
            </div>
          </div>

          {regNotice && (
            <div className="p-3 rounded bg-[#729BCB]/15 border border-[#729BCB]/30 text-xs text-[#D4D8DE]">
              {regNotice}
            </div>
          )}

          <form onSubmit={handleRegisterNewOwner} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#D4D8DE] mb-1">FULL NAME *</label>
                <input
                  type="text"
                  value={regFullName}
                  onChange={e => setRegFullName(e.target.value)}
                  placeholder="e.g. Vikram Sengupta"
                  className="w-full bg-[#13161A] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[#D4D8DE] mb-1">EMAIL ADDRESS *</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-[#13161A] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[#D4D8DE] mb-1">MOBILE NUMBER *</label>
                <input
                  type="tel"
                  value={regMobile}
                  onChange={e => setRegMobile(e.target.value)}
                  placeholder="+91 98XXX XXXXX"
                  className="w-full bg-[#13161A] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[#D4D8DE] mb-1">CITY</label>
                <input
                  type="text"
                  value={regCity}
                  onChange={e => setRegCity(e.target.value)}
                  placeholder="Bengaluru"
                  className="w-full bg-[#13161A] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[#D4D8DE] mb-1">STATE</label>
                <input
                  type="text"
                  value={regState}
                  onChange={e => setRegState(e.target.value)}
                  placeholder="Karnataka"
                  className="w-full bg-[#13161A] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[#D4D8DE] mb-1">MODEL *</label>
                <select
                  value={regModel}
                  onChange={e => setRegModel(e.target.value as any)}
                  className="w-full bg-[#13161A] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                >
                  <option value="F77">F77</option>
                  <option value="X47">X47</option>
                </select>
              </div>
              <div>
                <label className="block text-[#D4D8DE] mb-1">VARIANT</label>
                <input
                  type="text"
                  value={regVariant}
                  onChange={e => setRegVariant(e.target.value)}
                  placeholder="Recon Laser Black (10.3 kWh)"
                  className="w-full bg-[#13161A] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[#D4D8DE] mb-1">REGISTRATION NO. *</label>
                <input
                  type="text"
                  value={regNumber}
                  onChange={e => setRegNumber(e.target.value)}
                  placeholder="KA 01 EV 1077"
                  className="w-full bg-[#13161A] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  required
                />
              </div>
            </div>

            {/* Blood group dropdown from approved list */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#D4D8DE] mb-1">BLOOD GROUP *</label>
                <select
                  value={regBloodGroup}
                  onChange={e => setRegBloodGroup(e.target.value as BloodGroup)}
                  className="w-full bg-[#13161A] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                >
                  {VALID_BLOOD_GROUPS.map(bg => (
                    <option key={bg} value={bg}>
                      {bg}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#D4D8DE] mb-1">RELATIONSHIP</label>
                <input
                  type="text"
                  value={regRelationship}
                  onChange={e => setRegRelationship(e.target.value)}
                  placeholder="Spouse / Parent / Sibling"
                  className="w-full bg-[#13161A] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#D4D8DE] mb-1">EMERGENCY CONTACT NAME *</label>
                <input
                  type="text"
                  value={regContactName}
                  onChange={e => setRegContactName(e.target.value)}
                  placeholder="Primary contact full name"
                  className="w-full bg-[#13161A] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[#D4D8DE] mb-1">EMERGENCY CONTACT PHONE *</label>
                <input
                  type="tel"
                  value={regContactPhone}
                  onChange={e => setRegContactPhone(e.target.value)}
                  placeholder="+91 98XXX XXXXX"
                  className="w-full bg-[#13161A] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[#D4D8DE] mb-1">
                OPERATOR PASSWORD (MIN 10 CHARS, UPPER/LOWER/NUMBER)
              </label>
              <input
                type="password"
                value={regPassword}
                onChange={e => setRegPassword(e.target.value)}
                placeholder="Set account password now (or initialize later via setup token)"
                className="w-full bg-[#13161A] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded bg-[#252A30] hover:bg-[#414851] text-[#F1F3F5] font-bold border border-[#414851] transition-colors"
            >
              SUBMIT APPLICATION FOR VERIFICATION
            </button>
          </form>

          {currentUser && (
            <div className="pt-6 mt-6 border-t border-[#282D34] space-y-4">
              <div>
                <div className="text-sm font-bold text-[#F1F3F5] flex items-center gap-2">
                  <Key className="w-4 h-4 text-[#42B883]" />
                  <span>ROTATE OPERATOR PASSWORD</span>
                </div>
                <div className="text-xs text-[#A0A7B0] mt-0.5">
                  Changing your password immediately revokes all other active sessions for {currentUser.fullName}.
                </div>
              </div>

              {pwdChangeNotice && (
                <div className="p-3 rounded bg-[#13161A] border border-[#414851] text-xs text-[#D4D8DE]">
                  {pwdChangeNotice}
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[#D4D8DE] mb-1">CURRENT PASSWORD *</label>
                    <input
                      type="password"
                      value={curPassword}
                      onChange={e => setCurPassword(e.target.value)}
                      className="w-full bg-[#13161A] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[#D4D8DE] mb-1">NEW PASSWORD *</label>
                    <input
                      type="password"
                      value={nextPassword}
                      onChange={e => setNextPassword(e.target.value)}
                      className="w-full bg-[#13161A] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[#D4D8DE] mb-1">CONFIRM NEW *</label>
                    <input
                      type="password"
                      value={confirmNextPassword}
                      onChange={e => setConfirmNextPassword(e.target.value)}
                      className="w-full bg-[#13161A] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded bg-[#42B883] hover:bg-[#389d6f] text-[#08090B] font-bold"
                  >
                    UPDATE PASSWORD
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: PRIVACY CONTROLS */}
      {/* ========================================================= */}
      {activeTab === 'privacy' && currentUser && (
        <div className="max-w-2xl mx-auto bg-[#0D0F12] border border-[#282D34] rounded-lg p-6 space-y-6 font-mono text-xs">
          <div className="pb-3 border-b border-[#282D34]">
            <div className="text-sm font-bold text-[#F1F3F5]">MEMBER PRIVACY CONTROLS</div>
            <div className="text-xs text-[#A0A7B0] mt-0.5">
              Control which non-sensitive identifiers are visible to other verified squadron members.
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-start justify-between p-3 rounded bg-[#13161A] border border-[#282D34] cursor-pointer">
              <div className="pr-4">
                <div className="text-[#F1F3F5] font-semibold">Share Ride Starting Point</div>
                <div className="text-[11px] text-[#707883] mt-0.5">
                  Allows ride leader and participants to see your preferred rendezvous starting point on sorties.
                </div>
              </div>
              <input
                type="checkbox"
                checked={showStartingPoint}
                onChange={e => setShowStartingPoint(e.target.checked)}
                className="mt-1"
              />
            </label>

            <label className="flex items-start justify-between p-3 rounded bg-[#13161A] border border-[#282D34] cursor-pointer">
              <div className="pr-4">
                <div className="text-[#F1F3F5] font-semibold">Display City & Region</div>
                <div className="text-[11px] text-[#707883] mt-0.5">
                  Shows your general city on forum posts and public leaderboards.
                </div>
              </div>
              <input
                type="checkbox"
                checked={showCity}
                onChange={e => setShowCity(e.target.checked)}
                className="mt-1"
              />
            </label>

            <label className="flex items-start justify-between p-3 rounded bg-[#13161A] border border-[#282D34] cursor-pointer">
              <div className="pr-4">
                <div className="text-[#F1F3F5] font-semibold">Opt-in to Squadron Assist Dispatch</div>
                <div className="text-[11px] text-[#707883] mt-0.5">
                  Receive emergency notifications when a fellow owner signals distress within a 25 km radius.
                </div>
              </div>
              <input
                type="checkbox"
                checked={optInSquadronAssist}
                onChange={e => setOptInSquadronAssist(e.target.checked)}
                className="mt-1"
              />
            </label>
          </div>

          <div className="p-3.5 rounded bg-[#13161A] border border-[#282D34] text-[11px] text-[#AEB5BE] space-y-1">
            <div className="text-[#42B883] font-bold flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> ZERO-LEAK SAFETY GUARANTEE
            </div>
            <p>
              Blood group, mobile emergency contacts, motorcycle registration numbers, and precise GPS telemetry are encrypted and never exposed in member listings or public queries.
            </p>
          </div>

          {privacyNotice && (
            <div className="p-3 rounded bg-[#13161A] border border-[#42B883]/40 text-xs text-[#42B883]">
              {privacyNotice}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSavePrivacy}
              className="px-4 py-2 rounded bg-[#252A30] hover:bg-[#414851] text-[#F1F3F5] font-bold border border-[#414851]"
            >
              SAVE PRIVACY PREFERENCES
            </button>
          </div>
        </div>
      )}
      </AvionicsToggleTransition>
    </div>
  );
};
