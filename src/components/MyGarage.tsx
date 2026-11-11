import React, { useState, useEffect, useRef } from 'react';
import {
  User as UserIcon,
  Layers,
  ShieldCheck,
  Lock,
  Phone,
  Mail,
  KeyRound,
  FileText,
  Upload,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  X,
  Bike,
  CreditCard,
  Calendar,
  Save,
  Loader2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { VALID_BLOOD_GROUPS, BloodGroup, processUploadedDevicePhoto } from '../utils/rules';

export const MyGarage: React.FC = () => {
  const { currentUser, updateProfile, changePassword, openAuthModal } = useAuth();
  const { playTacticalClick, playChime } = useAudio();

  // Active Section: 'profile' | 'vehicle'
  const [activeSection, setActiveSection] = useState<'profile' | 'vehicle'>('profile');

  // --- Profile Section State ---
  const [fullName, setFullName] = useState(currentUser?.fullName || '');
  const [mobile, setMobile] = useState(currentUser?.mobile || '');
  const [email, setEmail] = useState(currentUser?.email || '');

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Safety / Emergency State
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>(
    (currentUser?.bloodGroup as BloodGroup) || 'O+'
  );
  const [emergencyName, setEmergencyName] = useState(currentUser?.emergencyContact?.name || '');
  const [emergencyPhone, setEmergencyPhone] = useState(currentUser?.emergencyContact?.phone || '');
  const [emergencyRelation, setEmergencyRelation] = useState(
    currentUser?.emergencyContact?.relationship || 'Family'
  );

  // --- Vehicle Section State ---
  const [bikeModel, setBikeModel] = useState<'F77' | 'X47'>(
    currentUser?.motorcycleModel === 'X47' ? 'X47' : 'F77'
  );
  const [variant, setVariant] = useState(currentUser?.variant || 'Recon');
  const [regNumber, setRegNumber] = useState(currentUser?.registrationNumber || '');
  const [chassisNumber, setChassisNumber] = useState(currentUser?.chassisNumber || '');

  // Vehicle Documents State
  // RC
  const [rcUrl, setRcUrl] = useState(currentUser?.rcDocumentUrl || '');
  const [rcName, setRcName] = useState(currentUser?.rcDocumentName || '');
  const [rcExpiry, setRcExpiry] = useState(currentUser?.rcExpiryDate || '');

  // Insurance
  const [insuranceUrl, setInsuranceUrl] = useState(currentUser?.insuranceDocumentUrl || '');
  const [insuranceName, setInsuranceName] = useState(currentUser?.insuranceDocumentName || '');
  const [insuranceProvider, setInsuranceProvider] = useState(currentUser?.insuranceProvider || '');
  const [insurancePolicyNum, setInsurancePolicyNum] = useState(currentUser?.insurancePolicyNumber || '');
  const [insuranceExpiry, setInsuranceExpiry] = useState(currentUser?.insuranceExpiryDate || '');

  // DL
  const [dlUrl, setDlUrl] = useState(currentUser?.dlDocumentUrl || '');
  const [dlName, setDlName] = useState(currentUser?.dlDocumentName || '');
  const [dlNumber, setDlNumber] = useState(currentUser?.dlNumber || '');
  const [dlExpiry, setDlExpiry] = useState(currentUser?.dlExpiryDate || '');

  // Global Notification / Feedback
  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState<string | null>(null);

  // Modal Lightbox for Viewing Documents
  const [viewingDoc, setViewingDoc] = useState<{ title: string; url: string; details?: string } | null>(null);

  // Hidden File Inputs
  const rcFileInputRef = useRef<HTMLInputElement>(null);
  const insuranceFileInputRef = useRef<HTMLInputElement>(null);
  const dlFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentUser) {
      setFullName(currentUser.fullName || '');
      setMobile(currentUser.mobile || '');
      setEmail(currentUser.email || '');

      if (currentUser.bloodGroup && VALID_BLOOD_GROUPS.includes(currentUser.bloodGroup as BloodGroup)) {
        setBloodGroup(currentUser.bloodGroup as BloodGroup);
      }
      setEmergencyName(currentUser.emergencyContact?.name || '');
      setEmergencyPhone(currentUser.emergencyContact?.phone || '');
      setEmergencyRelation(currentUser.emergencyContact?.relationship || 'Family');

      setBikeModel(currentUser.motorcycleModel === 'X47' ? 'X47' : 'F77');
      setVariant(currentUser.variant || 'Recon');
      setRegNumber(currentUser.registrationNumber || '');
      setChassisNumber(currentUser.chassisNumber || '');

      setRcUrl(currentUser.rcDocumentUrl || '');
      setRcName(currentUser.rcDocumentName || '');
      setRcExpiry(currentUser.rcExpiryDate || '');

      setInsuranceUrl(currentUser.insuranceDocumentUrl || '');
      setInsuranceName(currentUser.insuranceDocumentName || '');
      setInsuranceProvider(currentUser.insuranceProvider || '');
      setInsurancePolicyNum(currentUser.insurancePolicyNumber || '');
      setInsuranceExpiry(currentUser.insuranceExpiryDate || '');

      setDlUrl(currentUser.dlDocumentUrl || '');
      setDlName(currentUser.dlDocumentName || '');
      setDlNumber(currentUser.dlNumber || '');
      setDlExpiry(currentUser.dlExpiryDate || '');
    }
  }, [currentUser]);

  // Notice auto-dismiss
  useEffect(() => {
    if (statusNotice) {
      const timer = setTimeout(() => setStatusNotice(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [statusNotice]);

  useEffect(() => {
    if (passwordNotice) {
      const timer = setTimeout(() => setPasswordNotice(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [passwordNotice]);

  // Handle single profile update helper
  const handleSaveProfileDetails = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    playTacticalClick();
    setStatusNotice(null);

    const trimmedName = fullName.trim();
    const trimmedMobile = mobile.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setStatusNotice({ type: 'error', text: 'Full Name cannot be empty.' });
      return;
    }
    if (!trimmedMobile) {
      setStatusNotice({ type: 'error', text: 'Phone Number cannot be empty.' });
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setStatusNotice({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }
    if (!emergencyName.trim() || !emergencyPhone.trim()) {
      setStatusNotice({ type: 'error', text: 'Emergency contact name and phone number are required.' });
      return;
    }

    setIsSaving(true);
    const res = await updateProfile({
      fullName: trimmedName,
      mobile: trimmedMobile,
      email: trimmedEmail,
      bloodGroup: bloodGroup,
      emergencyContact: {
        name: emergencyName.trim(),
        phone: emergencyPhone.trim(),
        relationship: emergencyRelation.trim() || 'Family'
      }
    });

    setIsSaving(false);
    if (res.success) {
      playChime();
      setStatusNotice({ type: 'success', text: 'Profile details updated and synchronized successfully.' });
    } else {
      setStatusNotice({ type: 'error', text: res.error || 'Failed to update profile details.' });
    }
  };

  // Handle Password Change
  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    playTacticalClick();
    setPasswordNotice(null);

    if (!currentPassword) {
      setPasswordNotice({ type: 'error', text: 'Please enter your current password.' });
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setPasswordNotice({ type: 'error', text: 'New password must be at least 6 characters long.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    setIsUpdatingPassword(true);
    const res = await changePassword(currentPassword, newPassword);
    setIsUpdatingPassword(false);

    if (res.success) {
      playChime();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice({ type: 'success', text: 'Password changed successfully.' });
    } else {
      setPasswordNotice({ type: 'error', text: res.error || 'Failed to update password.' });
    }
  };

  // Handle Document Upload
  const handleUploadDocument = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'rc' | 'insurance' | 'dl'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so re-selecting same file works
    e.target.value = '';

    playTacticalClick();
    setIsUploadingDoc(type);
    setStatusNotice(null);

    try {
      const compressedDataUrl = await processUploadedDevicePhoto(file);
      if (!compressedDataUrl) {
        throw new Error('Could not process image file.');
      }

      if (type === 'rc') {
        setRcUrl(compressedDataUrl);
        setRcName(file.name);
        await updateProfile({
          rcDocumentUrl: compressedDataUrl,
          rcDocumentName: file.name
        });
      } else if (type === 'insurance') {
        setInsuranceUrl(compressedDataUrl);
        setInsuranceName(file.name);
        await updateProfile({
          insuranceDocumentUrl: compressedDataUrl,
          insuranceDocumentName: file.name
        });
      } else if (type === 'dl') {
        setDlUrl(compressedDataUrl);
        setDlName(file.name);
        await updateProfile({
          dlDocumentUrl: compressedDataUrl,
          dlDocumentName: file.name
        });
      }

      playChime();
      setStatusNotice({
        type: 'success',
        text: `${type.toUpperCase()} document uploaded and saved successfully.`
      });
    } catch {
      setStatusNotice({
        type: 'error',
        text: `Failed to process and upload ${type.toUpperCase()} document.`
      });
    } finally {
      setIsUploadingDoc(null);
    }
  };

  // Handle Document Removal
  const handleRemoveDocument = async (type: 'rc' | 'insurance' | 'dl') => {
    playTacticalClick();
    setStatusNotice(null);

    if (type === 'rc') {
      setRcUrl('');
      setRcName('');
      await updateProfile({ rcDocumentUrl: '', rcDocumentName: '' });
    } else if (type === 'insurance') {
      setInsuranceUrl('');
      setInsuranceName('');
      await updateProfile({ insuranceDocumentUrl: '', insuranceDocumentName: '' });
    } else if (type === 'dl') {
      setDlUrl('');
      setDlName('');
      await updateProfile({ dlDocumentUrl: '', dlDocumentName: '' });
    }

    playChime();
    setStatusNotice({
      type: 'success',
      text: `${type.toUpperCase()} document removed.`
    });
  };

  // Save Vehicle Specs & Metadata
  const handleSaveVehicleSpecs = async (e: React.FormEvent) => {
    e.preventDefault();
    playTacticalClick();
    setStatusNotice(null);

    if (!regNumber.trim()) {
      setStatusNotice({ type: 'error', text: 'Motorcycle Registration Number is required.' });
      return;
    }

    setIsSaving(true);
    const res = await updateProfile({
      motorcycleModel: bikeModel,
      variant: variant.trim(),
      registrationNumber: regNumber.trim().toUpperCase(),
      chassisNumber: chassisNumber.trim().toUpperCase(),
      rcDocumentUrl: rcUrl,
      rcDocumentName: rcName,
      rcExpiryDate: rcExpiry,
      insuranceDocumentUrl: insuranceUrl,
      insuranceDocumentName: insuranceName,
      insuranceProvider: insuranceProvider.trim(),
      insurancePolicyNumber: insurancePolicyNum.trim(),
      insuranceExpiryDate: insuranceExpiry,
      dlDocumentUrl: dlUrl,
      dlDocumentName: dlName,
      dlNumber: dlNumber.trim().toUpperCase(),
      dlExpiryDate: dlExpiry
    });

    setIsSaving(false);
    if (res.success) {
      playChime();
      setStatusNotice({ type: 'success', text: 'Vehicle specifications and document metadata saved.' });
    } else {
      setStatusNotice({ type: 'error', text: res.error || 'Failed to save vehicle details.' });
    }
  };

  if (!currentUser) {
    return (
      <div className="max-w-xl mx-auto bg-[#0D0F12] border border-[#282D34] rounded-xl p-8 space-y-5 font-mono text-xs text-center shadow-2xl my-8">
        <div className="w-12 h-12 mx-auto rounded-full bg-[#13161A] border border-[#E8AA45]/50 flex items-center justify-center text-[#E8AA45]">
          <Lock className="w-6 h-6" />
        </div>
        <div>
          <div className="text-base font-bold text-[#F1F3F5] tracking-wide">
            MY GARAGE ACCESS LOCKED
          </div>
          <p className="text-[#A0A7B0] text-xs mt-2 leading-relaxed">
            Please sign in or register to access and manage your profile credentials, motorcycle details, registration documents, and safety records.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            playTacticalClick();
            openAuthModal();
          }}
          className="px-6 py-2.5 rounded-lg bg-[#E8AA45] hover:bg-[#F59E0B] text-[#0A0D14] font-bold transition-all shadow-md cursor-pointer uppercase tracking-wider"
        >
          SIGN IN TO MY GARAGE
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-mono text-xs pb-16">
      {/* Hidden File Upload Inputs */}
      <input
        ref={rcFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => handleUploadDocument(e, 'rc')}
      />
      <input
        ref={insuranceFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => handleUploadDocument(e, 'insurance')}
      />
      <input
        ref={dlFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => handleUploadDocument(e, 'dl')}
      />

      {/* Header Bar */}
      <div className="bg-[#13161A] border border-[#282D34] rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-lg">
        <div className="flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-lg bg-[#191D22] border border-[#E8AA45]/50 flex items-center justify-center text-[#E8AA45] shrink-0">
            <Layers className="w-6 h-6 text-[#E8AA45]" />
          </div>
          <div>
            <div className="text-lg font-bold text-[#F1F3F5] tracking-wider flex items-center gap-2">
              <span>MY GARAGE</span>
              <span className="text-[10px] bg-[#E8AA45]/20 text-[#E8AA45] border border-[#E8AA45]/40 px-2 py-0.5 rounded uppercase tracking-wider">
                {currentUser.motorcycleModel || 'F77'} HANGAR
              </span>
            </div>
            <div className="text-xs text-[#94A3B8] mt-0.5">
              Pilot Profile Center &amp; Motorcycle Hangar Registry
            </div>
          </div>
        </div>

        {/* Section Tabs Switcher */}
        <div className="flex items-center bg-[#070B12] p-1 rounded-lg border border-[#232F42] self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              playTacticalClick();
              setActiveSection('profile');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
              activeSection === 'profile'
                ? 'bg-[#E8AA45] text-[#0A0D14] shadow-md'
                : 'text-[#94A3B8] hover:text-[#F1F3F5] hover:bg-[#13161A]'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            <span>MY PROFILE</span>
          </button>
          <button
            type="button"
            onClick={() => {
              playTacticalClick();
              setActiveSection('vehicle');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
              activeSection === 'vehicle'
                ? 'bg-[#E8AA45] text-[#0A0D14] shadow-md'
                : 'text-[#94A3B8] hover:text-[#F1F3F5] hover:bg-[#13161A]'
            }`}
          >
            <Bike className="w-4 h-4" />
            <span>MY VEHICLE</span>
          </button>
        </div>
      </div>

      {/* Global Status Banner */}
      {statusNotice && (
        <div
          className={`p-3.5 rounded-lg text-xs font-mono flex items-center gap-2.5 border transition-all shadow-md ${
            statusNotice.type === 'error'
              ? 'bg-[#EF4444]/15 border-[#EF4444]/40 text-[#FCA5A5]'
              : 'bg-[#10B981]/15 border-[#10B981]/40 text-[#6EE7B7]'
          }`}
        >
          {statusNotice.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-[#EF4444] shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
          )}
          <span className="flex-1">{statusNotice.text}</span>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-zinc-400 hover:text-white p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: MY PROFILE */}
      {/* ========================================================================= */}
      {activeSection === 'profile' && (
        <div className="space-y-6">
          {/* Pilot Identity Overview Card */}
          <div className="bg-[#0D0F12] border border-[#282D34] rounded-xl p-5 sm:p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-[#1E2D42]">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 rounded-full bg-[#191D22] border-2 border-[#E8AA45] flex items-center justify-center text-[#E8AA45] font-bold text-xl uppercase shadow-md shrink-0">
                  {currentUser.fullName ? currentUser.fullName.slice(0, 2).toUpperCase() : 'UV'}
                </div>
                <div>
                  <div className="text-base sm:text-lg font-bold text-[#F1F3F5] tracking-wide flex items-center gap-2 flex-wrap">
                    <span>{currentUser.fullName || 'Ultraviolette Pilot'}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-cyan-950/70 border border-cyan-500/40 text-cyan-400 uppercase">
                      {currentUser.pilotNickname || `${currentUser.motorcycleModel || 'F77'} PILOT`}
                    </span>
                    {currentUser.role === 'admin' && (
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-purple-950/70 border border-purple-500/40 text-purple-300 uppercase">
                        COMMAND ADMIN
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#94A3B8] mt-1 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3 text-[#E8AA45]" />
                      {currentUser.email}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-[#E8AA45]" />
                      {currentUser.mobile || 'No phone set'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Profile Modification Form */}
            <form onSubmit={handleSaveProfileDetails} className="mt-6 space-y-6">
              <div className="text-xs font-bold text-[#E8AA45] uppercase tracking-wider flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-[#E8AA45]" />
                Personal Profile Credentials
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Change Name */}
                <div>
                  <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                    Full Name <span className="text-[#EF4444]">*</span>
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#E8AA45] focus:outline-none"
                    required
                  />
                  <span className="text-[10px] text-[#64748B] mt-1 block">
                    Your public squadron and hangar display name.
                  </span>
                </div>

                {/* Change Phone Number */}
                <div>
                  <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                    Phone Number <span className="text-[#EF4444]">*</span>
                  </label>
                  <input
                    type="tel"
                    value={mobile}
                    onChange={e => setMobile(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#E8AA45] focus:outline-none font-mono"
                    required
                  />
                  <span className="text-[10px] text-[#64748B] mt-1 block">
                    Used for squadron contact &amp; ride SOS verification.
                  </span>
                </div>

                {/* Change Email */}
                <div>
                  <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                    Email Address <span className="text-[#EF4444]">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="pilot@domain.com"
                    className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#E8AA45] focus:outline-none font-mono"
                    required
                  />
                  <span className="text-[10px] text-[#64748B] mt-1 block">
                    Account login email and mission notices.
                  </span>
                </div>
              </div>

              {/* Safety & Emergency Contact Section */}
              <div className="pt-4 border-t border-[#1E2D42] space-y-4">
                <div className="text-xs font-bold text-[#38BDF8] uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#38BDF8]" />
                  Emergency &amp; Medical Contact
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Blood Group */}
                  <div>
                    <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                      Blood Group <span className="text-[#EF4444]">*</span>
                    </label>
                    <select
                      value={bloodGroup}
                      onChange={e => setBloodGroup(e.target.value as BloodGroup)}
                      className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] focus:border-[#38BDF8] focus:outline-none cursor-pointer"
                      required
                    >
                      {VALID_BLOOD_GROUPS.map(bg => (
                        <option key={bg} value={bg}>
                          {bg}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Relationship */}
                  <div>
                    <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                      Emergency Contact Relationship
                    </label>
                    <input
                      type="text"
                      value={emergencyRelation}
                      onChange={e => setEmergencyRelation(e.target.value)}
                      placeholder="e.g. Spouse / Parent / Sibling"
                      className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#38BDF8] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Contact Name */}
                  <div>
                    <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                      Emergency Contact Name <span className="text-[#EF4444]">*</span>
                    </label>
                    <input
                      type="text"
                      value={emergencyName}
                      onChange={e => setEmergencyName(e.target.value)}
                      placeholder="Primary Emergency Contact"
                      className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#38BDF8] focus:outline-none"
                      required
                    />
                  </div>

                  {/* Contact Phone */}
                  <div>
                    <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                      Emergency Contact Phone <span className="text-[#EF4444]">*</span>
                    </label>
                    <input
                      type="tel"
                      value={emergencyPhone}
                      onChange={e => setEmergencyPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#38BDF8] focus:outline-none font-mono"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Submit Profile Changes */}
              <div className="pt-4 border-t border-[#1E2D42] flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-lg bg-[#E8AA45] hover:bg-[#F59E0B] text-[#0A0D14] font-bold text-xs tracking-wider uppercase transition-all flex items-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-[#0A0D14]" />}
                  <span>{isSaving ? 'SAVING PROFILE...' : 'SAVE PROFILE DETAILS'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Change Password Card */}
          <div className="bg-[#0D0F12] border border-[#282D34] rounded-xl p-5 sm:p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2D42]">
              <div className="text-xs font-bold text-[#E8AA45] uppercase tracking-wider flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#E8AA45]" />
                Change Password &amp; Security
              </div>
              <span className="text-[10px] text-[#64748B]">
                Minimum 6 characters
              </span>
            </div>

            {passwordNotice && (
              <div
                className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 border ${
                  passwordNotice.type === 'error'
                    ? 'bg-[#EF4444]/15 border-[#EF4444]/40 text-[#FCA5A5]'
                    : 'bg-[#10B981]/15 border-[#10B981]/40 text-[#6EE7B7]'
                }`}
              >
                {passwordNotice.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-[#EF4444] shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                )}
                <span>{passwordNotice.text}</span>
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Current Password */}
                <div>
                  <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                    Current Password <span className="text-[#EF4444]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPass ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 pr-10 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#E8AA45] focus:outline-none"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPass(!showCurrentPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#CBD5E1] cursor-pointer"
                    >
                      {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* New Password */}
                <div>
                  <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                    New Password <span className="text-[#EF4444]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 pr-10 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#E8AA45] focus:outline-none"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#CBD5E1] cursor-pointer"
                    >
                      {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm New Password */}
                <div>
                  <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                    Confirm New Password <span className="text-[#EF4444]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPass ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 pr-10 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#E8AA45] focus:outline-none"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#CBD5E1] cursor-pointer"
                    >
                      {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isUpdatingPassword}
                  className="px-5 py-2.5 rounded-lg bg-[#282D34] hover:bg-[#323942] text-[#F1F3F5] hover:text-[#E8AA45] border border-[#3A424D] font-bold text-xs tracking-wider uppercase transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isUpdatingPassword ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#E8AA45]" />
                  ) : (
                    <KeyRound className="w-4 h-4 text-[#E8AA45]" />
                  )}
                  <span>{isUpdatingPassword ? 'UPDATING PASSWORD...' : 'UPDATE PASSWORD'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: MY VEHICLE */}
      {/* ========================================================================= */}
      {activeSection === 'vehicle' && (
        <div className="space-y-6">
          {/* Motorcycle Specifications Card */}
          <div className="bg-[#0D0F12] border border-[#282D34] rounded-xl p-5 sm:p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2D42]">
              <div className="text-xs font-bold text-[#E8AA45] uppercase tracking-wider flex items-center gap-2">
                <Bike className="w-4 h-4 text-[#E8AA45]" />
                Motorcycle Identification &amp; Chassis
              </div>
              <span className="text-[10px] text-[#64748B] font-mono">
                ULTRAVIOLETTE HANGAR SPECS
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Bike Model */}
              <div>
                <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                  Motorcycle Platform <span className="text-[#EF4444]">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      setBikeModel('F77');
                    }}
                    className={`py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all border cursor-pointer ${
                      bikeModel === 'F77'
                        ? 'bg-[#E8AA45] text-[#0A0D14] border-[#E8AA45] shadow-md'
                        : 'bg-[#070B12] text-[#94A3B8] border-[#232F42] hover:border-[#CBD5E1]'
                    }`}
                  >
                    F77 MACH 2
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      setBikeModel('X47');
                    }}
                    className={`py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all border cursor-pointer ${
                      bikeModel === 'X47'
                        ? 'bg-[#E8AA45] text-[#0A0D14] border-[#E8AA45] shadow-md'
                        : 'bg-[#070B12] text-[#94A3B8] border-[#232F42] hover:border-[#CBD5E1]'
                    }`}
                  >
                    X47
                  </button>
                </div>
              </div>

              {/* Variant */}
              <div>
                <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                  Variant Trim
                </label>
                <input
                  type="text"
                  value={variant}
                  onChange={e => setVariant(e.target.value)}
                  placeholder="e.g. Recon / Original / Space"
                  className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#E8AA45] focus:outline-none"
                />
              </div>

              {/* Registration Number */}
              <div>
                <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                  Registration Plate <span className="text-[#EF4444]">*</span>
                </label>
                <input
                  type="text"
                  value={regNumber}
                  onChange={e => setRegNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. KA 01 EV 1234"
                  className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm font-mono text-[#F8FAFC] placeholder-[#64748B] focus:border-[#E8AA45] focus:outline-none uppercase"
                  required
                />
              </div>

              {/* Chassis / VIN Number */}
              <div>
                <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                  VIN / Chassis Number
                </label>
                <input
                  type="text"
                  value={chassisNumber}
                  onChange={e => setChassisNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. ME4UV77XXXXXXXX"
                  className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm font-mono text-[#F8FAFC] placeholder-[#64748B] focus:border-[#E8AA45] focus:outline-none uppercase"
                />
              </div>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* Official Vehicle Documents Upload Section */}
          {/* ===================================================================== */}
          <div className="bg-[#0D0F12] border border-[#282D34] rounded-xl p-5 sm:p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-[#1E2D42]">
              <div>
                <div className="text-xs font-bold text-[#E8AA45] uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#E8AA45]" />
                  Official Vehicle Documents &amp; Certificates
                </div>
                <div className="text-[11px] text-[#94A3B8] mt-0.5">
                  Upload Registration Certificate (RC), Motorcycle Insurance Policy &amp; Driving Licence (DL)
                </div>
              </div>
              <span className="text-[10px] text-[#64748B] font-mono">
                SECURE ENCRYPTED STORAGE
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* DOCUMENT 1: RC (Registration Certificate) */}
              <div className="bg-[#13161A] border border-[#232F42] rounded-xl p-4 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-[#F1F3F5] uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-[#E8AA45]" />
                      RC Certificate
                    </span>
                    {rcUrl ? (
                      <span className="text-[10px] font-mono bg-emerald-950/70 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded">
                        UPLOADED
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                        PENDING
                      </span>
                    )}
                  </div>

                  {/* RC Preview Thumbnail / Upload Box */}
                  {rcUrl ? (
                    <div className="relative group rounded-lg overflow-hidden border border-[#3A424D] bg-[#070B12] aspect-video flex items-center justify-center mb-3">
                      <img
                        src={rcUrl}
                        alt="Registration Certificate"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            playTacticalClick();
                            setViewingDoc({
                              title: 'Registration Certificate (RC)',
                              url: rcUrl,
                              details: `File: ${rcName || 'RC Document'} • Registration: ${regNumber || 'N/A'}`
                            });
                          }}
                          className="p-1.5 rounded bg-[#E8AA45] text-black hover:bg-amber-400 cursor-pointer"
                          title="View Full Document"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveDocument('rc')}
                          className="p-1.5 rounded bg-red-600 text-white hover:bg-red-500 cursor-pointer"
                          title="Remove RC"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => rcFileInputRef.current?.click()}
                      className="border-2 border-dashed border-[#282D34] hover:border-[#E8AA45]/70 rounded-lg aspect-video flex flex-col items-center justify-center text-center p-3 cursor-pointer bg-[#0A0D12] hover:bg-[#0F1318] transition-all mb-3 group"
                    >
                      {isUploadingDoc === 'rc' ? (
                        <Loader2 className="w-6 h-6 text-[#E8AA45] animate-spin mb-1" />
                      ) : (
                        <Upload className="w-6 h-6 text-[#64748B] group-hover:text-[#E8AA45] mb-1 transition-colors" />
                      )}
                      <span className="text-xs font-semibold text-[#CBD5E1] group-hover:text-[#F1F3F5]">
                        Upload RC
                      </span>
                      <span className="text-[10px] text-[#64748B]">
                        Click to take photo or choose file
                      </span>
                    </div>
                  )}

                  {/* RC Expiry Date Input */}
                  <div>
                    <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-[#E8AA45]" />
                      RC Expiry Date
                    </label>
                    <input
                      type="date"
                      value={rcExpiry}
                      onChange={e => setRcExpiry(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[#070B12] border border-[#232F42] rounded text-xs text-[#F8FAFC] focus:border-[#E8AA45] focus:outline-none"
                    />
                  </div>
                </div>

                {/* RC Action Buttons */}
                <div className="pt-2 border-t border-[#1E2D42] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => rcFileInputRef.current?.click()}
                    disabled={isUploadingDoc === 'rc'}
                    className="flex-1 py-1.5 px-2 bg-[#232F42] hover:bg-[#2F3E56] text-[#F1F3F5] rounded text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#E8AA45]" />
                    <span>{rcUrl ? 'Replace RC' : 'Upload RC'}</span>
                  </button>
                  {rcUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        playTacticalClick();
                        setViewingDoc({
                          title: 'Registration Certificate (RC)',
                          url: rcUrl,
                          details: `File: ${rcName || 'RC Document'}`
                        });
                      }}
                      className="p-1.5 bg-[#1F2937] hover:bg-[#374151] text-[#94A3B8] hover:text-[#F1F3F5] rounded cursor-pointer"
                      title="Inspect Document"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* DOCUMENT 2: INSURANCE (Motorcycle Insurance) */}
              <div className="bg-[#13161A] border border-[#232F42] rounded-xl p-4 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-[#F1F3F5] uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#38BDF8]" />
                      Insurance Policy
                    </span>
                    {insuranceUrl ? (
                      <span className="text-[10px] font-mono bg-emerald-950/70 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded">
                        UPLOADED
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                        PENDING
                      </span>
                    )}
                  </div>

                  {/* Insurance Preview Thumbnail / Upload Box */}
                  {insuranceUrl ? (
                    <div className="relative group rounded-lg overflow-hidden border border-[#3A424D] bg-[#070B12] aspect-video flex items-center justify-center mb-3">
                      <img
                        src={insuranceUrl}
                        alt="Insurance Policy"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            playTacticalClick();
                            setViewingDoc({
                              title: 'Motorcycle Insurance Policy',
                              url: insuranceUrl,
                              details: `Provider: ${insuranceProvider || 'N/A'} • Policy: ${insurancePolicyNum || 'N/A'}`
                            });
                          }}
                          className="p-1.5 rounded bg-[#38BDF8] text-black hover:bg-sky-400 cursor-pointer"
                          title="View Full Document"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveDocument('insurance')}
                          className="p-1.5 rounded bg-red-600 text-white hover:bg-red-500 cursor-pointer"
                          title="Remove Insurance"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => insuranceFileInputRef.current?.click()}
                      className="border-2 border-dashed border-[#282D34] hover:border-[#38BDF8]/70 rounded-lg aspect-video flex flex-col items-center justify-center text-center p-3 cursor-pointer bg-[#0A0D12] hover:bg-[#0F1318] transition-all mb-3 group"
                    >
                      {isUploadingDoc === 'insurance' ? (
                        <Loader2 className="w-6 h-6 text-[#38BDF8] animate-spin mb-1" />
                      ) : (
                        <Upload className="w-6 h-6 text-[#64748B] group-hover:text-[#38BDF8] mb-1 transition-colors" />
                      )}
                      <span className="text-xs font-semibold text-[#CBD5E1] group-hover:text-[#F1F3F5]">
                        Upload Insurance
                      </span>
                      <span className="text-[10px] text-[#64748B]">
                        Click to upload policy document
                      </span>
                    </div>
                  )}

                  {/* Insurance Fields: Provider & Policy Number */}
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                        Insurance Provider
                      </label>
                      <input
                        type="text"
                        value={insuranceProvider}
                        onChange={e => setInsuranceProvider(e.target.value)}
                        placeholder="e.g. Digit / ICICI / Acko"
                        className="w-full px-2.5 py-1.5 bg-[#070B12] border border-[#232F42] rounded text-xs text-[#F8FAFC] focus:border-[#38BDF8] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                        Policy Number
                      </label>
                      <input
                        type="text"
                        value={insurancePolicyNum}
                        onChange={e => setInsurancePolicyNum(e.target.value)}
                        placeholder="Policy number"
                        className="w-full px-2.5 py-1.5 bg-[#070B12] border border-[#232F42] rounded text-xs text-[#F8FAFC] focus:border-[#38BDF8] focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-[#38BDF8]" />
                        Policy Expiry Date
                      </label>
                      <input
                        type="date"
                        value={insuranceExpiry}
                        onChange={e => setInsuranceExpiry(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-[#070B12] border border-[#232F42] rounded text-xs text-[#F8FAFC] focus:border-[#38BDF8] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Insurance Action Buttons */}
                <div className="pt-2 border-t border-[#1E2D42] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => insuranceFileInputRef.current?.click()}
                    disabled={isUploadingDoc === 'insurance'}
                    className="flex-1 py-1.5 px-2 bg-[#232F42] hover:bg-[#2F3E56] text-[#F1F3F5] rounded text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <span>{insuranceUrl ? 'Replace Policy' : 'Upload Insurance'}</span>
                  </button>
                  {insuranceUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        playTacticalClick();
                        setViewingDoc({
                          title: 'Motorcycle Insurance Policy',
                          url: insuranceUrl,
                          details: `Provider: ${insuranceProvider || 'N/A'} • Policy: ${insurancePolicyNum || 'N/A'}`
                        });
                      }}
                      className="p-1.5 bg-[#1F2937] hover:bg-[#374151] text-[#94A3B8] hover:text-[#F1F3F5] rounded cursor-pointer"
                      title="Inspect Document"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* DOCUMENT 3: DRIVING LICENCE (DL) */}
              <div className="bg-[#13161A] border border-[#232F42] rounded-xl p-4 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-[#F1F3F5] uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-[#A78BFA]" />
                      Driving Licence (DL)
                    </span>
                    {dlUrl ? (
                      <span className="text-[10px] font-mono bg-emerald-950/70 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded">
                        UPLOADED
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                        PENDING
                      </span>
                    )}
                  </div>

                  {/* DL Preview Thumbnail / Upload Box */}
                  {dlUrl ? (
                    <div className="relative group rounded-lg overflow-hidden border border-[#3A424D] bg-[#070B12] aspect-video flex items-center justify-center mb-3">
                      <img
                        src={dlUrl}
                        alt="Driving Licence"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            playTacticalClick();
                            setViewingDoc({
                              title: 'Driving Licence (DL)',
                              url: dlUrl,
                              details: `DL Number: ${dlNumber || 'N/A'} • Expiry: ${dlExpiry || 'N/A'}`
                            });
                          }}
                          className="p-1.5 rounded bg-[#A78BFA] text-black hover:bg-violet-400 cursor-pointer"
                          title="View Full Document"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveDocument('dl')}
                          className="p-1.5 rounded bg-red-600 text-white hover:bg-red-500 cursor-pointer"
                          title="Remove DL"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => dlFileInputRef.current?.click()}
                      className="border-2 border-dashed border-[#282D34] hover:border-[#A78BFA]/70 rounded-lg aspect-video flex flex-col items-center justify-center text-center p-3 cursor-pointer bg-[#0A0D12] hover:bg-[#0F1318] transition-all mb-3 group"
                    >
                      {isUploadingDoc === 'dl' ? (
                        <Loader2 className="w-6 h-6 text-[#A78BFA] animate-spin mb-1" />
                      ) : (
                        <Upload className="w-6 h-6 text-[#64748B] group-hover:text-[#A78BFA] mb-1 transition-colors" />
                      )}
                      <span className="text-xs font-semibold text-[#CBD5E1] group-hover:text-[#F1F3F5]">
                        Upload DL
                      </span>
                      <span className="text-[10px] text-[#64748B]">
                        Click to upload driving licence
                      </span>
                    </div>
                  )}

                  {/* DL Fields: Licence Number & Expiry */}
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                        DL Licence Number
                      </label>
                      <input
                        type="text"
                        value={dlNumber}
                        onChange={e => setDlNumber(e.target.value.toUpperCase())}
                        placeholder="e.g. DL-0420110012345"
                        className="w-full px-2.5 py-1.5 bg-[#070B12] border border-[#232F42] rounded text-xs text-[#F8FAFC] focus:border-[#A78BFA] focus:outline-none font-mono uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-[#A78BFA]" />
                        DL Expiry Date
                      </label>
                      <input
                        type="date"
                        value={dlExpiry}
                        onChange={e => setDlExpiry(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-[#070B12] border border-[#232F42] rounded text-xs text-[#F8FAFC] focus:border-[#A78BFA] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* DL Action Buttons */}
                <div className="pt-2 border-t border-[#1E2D42] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => dlFileInputRef.current?.click()}
                    disabled={isUploadingDoc === 'dl'}
                    className="flex-1 py-1.5 px-2 bg-[#232F42] hover:bg-[#2F3E56] text-[#F1F3F5] rounded text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#A78BFA]" />
                    <span>{dlUrl ? 'Replace DL' : 'Upload DL'}</span>
                  </button>
                  {dlUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        playTacticalClick();
                        setViewingDoc({
                          title: 'Driving Licence (DL)',
                          url: dlUrl,
                          details: `DL Number: ${dlNumber || 'N/A'}`
                        });
                      }}
                      className="p-1.5 bg-[#1F2937] hover:bg-[#374151] text-[#94A3B8] hover:text-[#F1F3F5] rounded cursor-pointer"
                      title="Inspect Document"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Save All Vehicle Specifications & Document Info Button */}
            <div className="pt-4 border-t border-[#1E2D42] flex justify-end">
              <button
                type="button"
                onClick={handleSaveVehicleSpecs}
                disabled={isSaving}
                className="px-6 py-3 rounded-lg bg-[#E8AA45] hover:bg-[#F59E0B] text-[#0A0D14] font-bold text-xs tracking-wider uppercase transition-all flex items-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-[#0A0D14]" /> : <Save className="w-4 h-4 text-[#0A0D14]" />}
                <span>{isSaving ? 'SAVING VEHICLE DETAILS...' : 'SAVE VEHICLE & DOCUMENTS'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FULL DOCUMENT INSPECTION LIGHTBOX MODAL */}
      {/* ========================================================================= */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0D0F12] border border-[#282D34] rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in duration-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#1E2D42] flex items-center justify-between bg-[#13161A]">
              <div>
                <h3 className="text-sm font-bold text-[#F1F3F5] tracking-wide flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#E8AA45]" />
                  {viewingDoc.title}
                </h3>
                {viewingDoc.details && (
                  <p className="text-[11px] text-[#94A3B8] mt-0.5 font-mono">
                    {viewingDoc.details}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setViewingDoc(null)}
                className="p-2 text-[#94A3B8] hover:text-white rounded-lg hover:bg-[#1E2530] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Image Viewer */}
            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-[#070B12]">
              <img
                src={viewingDoc.url}
                alt={viewingDoc.title}
                className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain shadow-lg border border-[#232F42]"
              />
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-[#1E2D42] bg-[#13161A] flex items-center justify-between">
              <span className="text-[11px] text-[#64748B]">
                Private Hangar Document • Encrypted
              </span>
              <button
                type="button"
                onClick={() => setViewingDoc(null)}
                className="px-4 py-2 bg-[#282D34] hover:bg-[#323942] text-[#F1F3F5] rounded-lg text-xs font-semibold cursor-pointer"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
