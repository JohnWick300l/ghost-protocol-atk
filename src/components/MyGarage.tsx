import React, { useState, useEffect } from 'react';
import { Layers, ShieldCheck, Lock, Phone, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { VALID_BLOOD_GROUPS, BloodGroup } from '../utils/rules';

export const MyGarage: React.FC = () => {
  const { currentUser, updateProfile, openAuthModal } = useAuth();
  const { playTacticalClick, playChime } = useAudio();

  const [bikeModel, setBikeModel] = useState<'F77' | 'X47'>(
    currentUser?.motorcycleModel === 'X47' ? 'X47' : 'F77'
  );
  const [regNumber, setRegNumber] = useState(currentUser?.registrationNumber || '');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>(
    (currentUser?.bloodGroup as BloodGroup) || 'O+'
  );
  const [emergencyName, setEmergencyName] = useState(currentUser?.emergencyContact?.name || '');
  const [emergencyPhone, setEmergencyPhone] = useState(currentUser?.emergencyContact?.phone || '');
  const [emergencyRelation, setEmergencyRelation] = useState(
    currentUser?.emergencyContact?.relationship || 'Family'
  );

  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setBikeModel(currentUser.motorcycleModel === 'X47' ? 'X47' : 'F77');
      setRegNumber(currentUser.registrationNumber || '');
      if (currentUser.bloodGroup && VALID_BLOOD_GROUPS.includes(currentUser.bloodGroup as BloodGroup)) {
        setBloodGroup(currentUser.bloodGroup as BloodGroup);
      }
      setEmergencyName(currentUser.emergencyContact?.name || '');
      setEmergencyPhone(currentUser.emergencyContact?.phone || '');
      setEmergencyRelation(currentUser.emergencyContact?.relationship || 'Family');
    }
  }, [currentUser]);

  const handleSaveGarage = async (e: React.FormEvent) => {
    e.preventDefault();
    playTacticalClick();
    setSaveNotice(null);
    setIsError(false);

    if (!regNumber.trim()) {
      setIsError(true);
      setSaveNotice('Registration Number is required.');
      return;
    }
    if (!emergencyName.trim() || !emergencyPhone.trim()) {
      setIsError(true);
      setSaveNotice('Emergency Contact Name and Phone Number are required.');
      return;
    }

    setIsSaving(true);
    const res = await updateProfile({
      motorcycleModel: bikeModel,
      registrationNumber: regNumber.trim().toUpperCase(),
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
      setIsError(false);
      setSaveNotice('Garage details updated and synced successfully.');
    } else {
      setIsError(true);
      setSaveNotice(res.error || 'Failed to save garage details.');
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
            Please sign in or register to access and manage your motorcycle details, registration number, blood group, and emergency contact details.
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
    <div className="max-w-3xl mx-auto space-y-6 font-mono text-xs">
      {/* Header Card */}
      <div className="bg-[#13161A] border border-[#282D34] rounded-xl p-4 sm:p-5 flex items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-lg bg-[#191D22] border border-[#E8AA45]/50 flex items-center justify-center text-[#E8AA45] shrink-0">
            <Layers className="w-5 h-5 text-[#E8AA45]" />
          </div>
          <div>
            <div className="text-base sm:text-lg font-mono font-bold text-[#F1F3F5] tracking-wider flex items-center gap-2">
              <span>MY GARAGE</span>
            </div>
            <div className="text-xs sm:text-sm text-[#94A3B8] mt-0.5">
              Manage your motorcycle model, registration number, blood group &amp; emergency contact
            </div>
          </div>
        </div>
      </div>

      {/* Main Form Card */}
      <div className="bg-[#0D0F12] border border-[#282D34] rounded-xl p-6 sm:p-8 space-y-6 shadow-2xl">
        {saveNotice && (
          <div
            className={`p-3.5 rounded-lg text-xs font-mono flex items-center gap-2.5 border ${
              isError
                ? 'bg-[#EF4444]/15 border-[#EF4444]/40 text-[#FCA5A5]'
                : 'bg-[#10B981]/15 border-[#10B981]/40 text-[#6EE7B7]'
            }`}
          >
            {isError ? (
              <AlertCircle className="w-4 h-4 text-[#EF4444] shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
            )}
            <span>{saveNotice}</span>
          </div>
        )}

        <form onSubmit={handleSaveGarage} className="space-y-6">
          {/* Section 1: Bike Details */}
          <div className="space-y-4">
            <div className="text-xs font-bold text-[#E8AA45] uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-[#1E2D42]">
              <Layers className="w-4 h-4 text-[#E8AA45]" />
              Motorcycle Specifications
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Bike Model (F77 / X47) */}
              <div>
                <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                  Bike Model <span className="text-[#EF4444]">*</span>
                </label>
                <select
                  value={bikeModel}
                  onChange={e => setBikeModel(e.target.value as 'F77' | 'X47')}
                  className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] focus:border-[#E8AA45] focus:outline-none cursor-pointer"
                  required
                >
                  <option value="F77">F77</option>
                  <option value="X47">X47</option>
                </select>
              </div>

              {/* Registration Number */}
              <div>
                <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                  Registration Number <span className="text-[#EF4444]">*</span>
                </label>
                <input
                  type="text"
                  value={regNumber}
                  onChange={e => setRegNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. KA 01 EV 1234"
                  className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm font-mono text-[#F8FAFC] placeholder-[#64748B] focus:border-[#E8AA45] focus:outline-none"
                  required
                />
              </div>
            </div>
          </div>

          {/* Section 2: Personal Safety Details */}
          <div className="space-y-4 pt-2">
            <div className="text-xs font-bold text-[#38BDF8] uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-[#1E2D42]">
              <ShieldCheck className="w-4 h-4 text-[#38BDF8]" />
              Safety & Emergency Records
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
              {/* Emergency Contact Name */}
              <div>
                <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                  Emergency Contact Name <span className="text-[#EF4444]">*</span>
                </label>
                <input
                  type="text"
                  value={emergencyName}
                  onChange={e => setEmergencyName(e.target.value)}
                  placeholder="e.g. Primary Contact Full Name"
                  className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#38BDF8] focus:outline-none"
                  required
                />
              </div>

              {/* Emergency Contact Phone */}
              <div>
                <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-[#38BDF8]" />
                  Emergency Contact Phone <span className="text-[#EF4444]">*</span>
                </label>
                <input
                  type="tel"
                  value={emergencyPhone}
                  onChange={e => setEmergencyPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full px-3.5 py-2.5 bg-[#070B12] border border-[#232F42] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#38BDF8] focus:outline-none"
                  required
                />
              </div>
            </div>
          </div>

          {/* Submit Save Button */}
          <div className="pt-4 border-t border-[#1E2D42] flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-3 rounded-lg bg-[#E8AA45] hover:bg-[#F59E0B] text-[#0A0D14] font-bold text-xs tracking-wider uppercase transition-all flex items-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4 text-[#0A0D14]" />
              <span>{isSaving ? 'SAVING CHANGES...' : 'SAVE GARAGE DETAILS'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
