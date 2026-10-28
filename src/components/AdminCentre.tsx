import React, { useState, useEffect } from 'react';
import {
  Shield,
  UserCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Cpu,
  FileText,
  Lock,
  Activity,
  Sliders,
  BatteryCharging,
  Gauge,
  Compass,
  Zap,
  Tag,
  Search,
  RefreshCw,
  X,
  Sparkles,
  Heart,
  QrCode,
  Smartphone,
  CreditCard,
  Upload,
  Save,
  Trash2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { User, JetEngineerSubmission, TelemetryConfig, EmergencyRequest } from '../types';
import {
  CACHE_KEYS,
  saveToCache,
  loadFromCache,
  getStoredSessionToken,
  getSessionAuthHeaders,
  gpApiFetch
} from '../utils/telemetryCache';
import { UserIdentityBadge } from './UserIdentityBadge';
import {
  resolveUserDisplayIdentity,
  canEditContributionPage,
  canPermanentlyRemoveUser,
  DEFAULT_CONTRIBUTION_CONFIG,
  sanitizeContributionConfig,
  redactContributionForPublicWall,
  type ContributionConfig,
  type ContributionRecord
} from '../utils/rules';
import { AvionicsToggleTransition, motion } from './AvionicsTransition';
import {
  HYBRID_STORAGE_MANIFEST,
  FIREBASE_FREE_TIER_LIMITS
} from '../utils/hybridDatabase';
import {
  getHybridSyncStateSnapshot,
  runHybridSyncCycle,
  HYBRID_SYNC_STATUS_EVENT,
  type HybridSyncStateSnapshot
} from '../utils/firebaseHybridSync';
import {
  signInWithGoogleForCloudSync,
  signOutFromFirebaseCloudSync
} from '../firebase';

export const AdminCentre: React.FC = () => {
  const {
    currentUser,
    availableUsers,
    refreshUsers,
    openAuthModal,
    issueSetupToken,
    updatePilotNickname,
    permanentlyRemoveUser
  } = useAuth();
  const { playTacticalClick, playChime, playAlert, reducedMotion } = useAudio();

  const isWebsiteOwner = canEditContributionPage(currentUser);
  const [hybridSyncState, setHybridSyncState] = useState<HybridSyncStateSnapshot>(() =>
    getHybridSyncStateSnapshot()
  );

  const [metrics, setMetrics] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<JetEngineerSubmission[]>([]);
  const [adminEmergencies, setAdminEmergencies] = useState<EmergencyRequest[]>([]);
  const [activeSection, setActiveSection] = useState<
    'registrations' | 'jet_submissions' | 'telemetry_config' | 'contribution_config' | 'audit'
  >('registrations');
  const [issuedTokenInfo, setIssuedTokenInfo] = useState<{
    userId: string;
    userName: string;
    token: string;
    expiresAt: string;
  } | null>(null);

  // Owner Pilot Nickname modal state
  const [editingNicknameUser, setEditingNicknameUser] = useState<User | null>(null);
  const [nicknameInput, setNicknameInput] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [nicknameSuccessMessage, setNicknameSuccessMessage] = useState<string | null>(null);

  // Pilot roster search & filter state
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'pending' | 'verified' | 'suspended'>('all');

  // Permanent user removal confirmation modal state (Admins & Website Owner)
  const [removingUser, setRemovingUser] = useState<User | null>(null);
  const [removalReason, setRemovalReason] = useState('');
  const [removingInProgress, setRemovingInProgress] = useState(false);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [removalBannerMessage, setRemovalBannerMessage] = useState<string | null>(null);

  // Telemetry configuration state
  const [telemetryConfig, setTelemetryConfig] = useState<TelemetryConfig>({
    batterySoc: true,
    estimatedRange: true,
    motorTemp: true,
    regenLevel: true,
    odometer: true,
    avionicsHealth: true
  });
  const [savingTelemetryConfig, setSavingTelemetryConfig] = useState(false);
  const [telemetrySavedSuccess, setTelemetrySavedSuccess] = useState(false);

  // Charging page long-ride planning text state
  const [longRidePlanningText, setLongRidePlanningText] = useState('');
  const [savingPlanningText, setSavingPlanningText] = useState(false);
  const [planningTextSavedFeedback, setPlanningTextSavedFeedback] = useState<string | null>(null);

  // Review modal state
  const [reviewUserId, setReviewUserId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  // Jet Engineer submission review modal
  const [reviewSubmissionId, setReviewSubmissionId] = useState<string | null>(null);
  const [subReviewNotes, setSubReviewNotes] = useState('');

  // Website Owner-only Contribution Payment Modes, UPI ID & QR Scan Code state
  const [contribConfig, setContribConfig] = useState<ContributionConfig>(() => {
    const cached = loadFromCache<ContributionConfig>(CACHE_KEYS.CONTRIBUTION_CONFIG);
    return sanitizeContributionConfig(cached?.data, DEFAULT_CONTRIBUTION_CONFIG);
  });
  const [draftHeadline, setDraftHeadline] = useState(contribConfig.headline);
  const [draftMessage, setDraftMessage] = useState(contribConfig.creatorMessage);
  const [draftUpiId, setDraftUpiId] = useState(contribConfig.upiId);
  const [draftCustomQrUrl, setDraftCustomQrUrl] = useState(contribConfig.customQrUrl);
  const [draftPaymentLink, setDraftPaymentLink] = useState(contribConfig.paymentLink);
  const [draftOtherPaymentDetails, setDraftOtherPaymentDetails] = useState(contribConfig.otherPaymentDetails);
  const [draftEnableQrScan, setDraftEnableQrScan] = useState(contribConfig.enableQrScan);
  const [draftEnableUpiId, setDraftEnableUpiId] = useState(contribConfig.enableUpiId);
  const [draftEnablePaymentLink, setDraftEnablePaymentLink] = useState(contribConfig.enablePaymentLink);
  const [savingContribConfig, setSavingContribConfig] = useState(false);
  const [contribConfigFeedback, setContribConfigFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [adminContributions, setAdminContributions] = useState<Omit<ContributionRecord, 'amountInr'>[]>([]);

  const syncDraftFromContributionConfig = (cfg: ContributionConfig) => {
    setDraftHeadline(cfg.headline);
    setDraftMessage(cfg.creatorMessage);
    setDraftUpiId(cfg.upiId);
    setDraftCustomQrUrl(cfg.customQrUrl);
    setDraftPaymentLink(cfg.paymentLink);
    setDraftOtherPaymentDetails(cfg.otherPaymentDetails);
    setDraftEnableQrScan(cfg.enableQrScan);
    setDraftEnableUpiId(cfg.enableUpiId);
    setDraftEnablePaymentLink(cfg.enablePaymentLink);
  };

  const fetchContributionAdminData = async () => {
    try {
      const res = await gpApiFetch('/api/contributions', {
        credentials: 'same-origin',
        headers: getSessionAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          const normalized = sanitizeContributionConfig(data.config, DEFAULT_CONTRIBUTION_CONFIG);
          setContribConfig(normalized);
          syncDraftFromContributionConfig(normalized);
          saveToCache(CACHE_KEYS.CONTRIBUTION_CONFIG, normalized, { silent: true });
        }
        if (Array.isArray(data.contributions)) {
          const redacted = data.contributions.map((item: ContributionRecord) =>
            redactContributionForPublicWall(item)
          );
          setAdminContributions(redacted);
          saveToCache(CACHE_KEYS.CONTRIBUTIONS, redacted, { silent: true });
        }
      }
    } catch (err) {
      console.error('Failed to load contribution config in Admin Centre:', err);
    }
  };

  const handleQrFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setDraftCustomQrUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveContributionConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isWebsiteOwner) return;
    playTacticalClick();
    setSavingContribConfig(true);
    setContribConfigFeedback(null);

    const nextPayload = {
      headline: draftHeadline,
      creatorMessage: draftMessage,
      upiId: draftUpiId,
      customQrUrl: draftCustomQrUrl,
      paymentLink: draftPaymentLink,
      otherPaymentDetails: draftOtherPaymentDetails,
      enableQrScan: draftEnableQrScan,
      enableUpiId: draftEnableUpiId,
      enablePaymentLink: draftEnablePaymentLink,
      updatedAt: new Date().toISOString()
    };

    const optimisticConfig = sanitizeContributionConfig(nextPayload, contribConfig);

    try {
      const res = await gpApiFetch('/api/contributions/config', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(nextPayload)
      });

      if (res.ok) {
        const data = await res.json();
        const saved = sanitizeContributionConfig(data.config || optimisticConfig, contribConfig);
        setContribConfig(saved);
        syncDraftFromContributionConfig(saved);
        saveToCache(CACHE_KEYS.CONTRIBUTION_CONFIG, saved);
        playChime();
        setContribConfigFeedback({
          type: 'success',
          text: 'Payment modes, UPI ID, QR scan code, and Contribute page settings updated.'
        });
      } else {
        const errData = await res.json().catch(() => ({}));
        playAlert();
        setContribConfigFeedback({
          type: 'error',
          text: errData.error || 'Failed to update payment modes.'
        });
      }
    } catch {
      setContribConfig(optimisticConfig);
      syncDraftFromContributionConfig(optimisticConfig);
      saveToCache(CACHE_KEYS.CONTRIBUTION_CONFIG, optimisticConfig);
      playChime();
      setContribConfigFeedback({
        type: 'success',
        text: 'Payment modes, UPI ID, and QR scan code saved.'
      });
    } finally {
      setSavingContribConfig(false);
    }
  };

  const handleDeleteContributionEntry = async (id: string) => {
    if (!isWebsiteOwner) return;
    playTacticalClick();
    const nextList = adminContributions.filter(c => c.id !== id);
    setAdminContributions(nextList);
    saveToCache(CACHE_KEYS.CONTRIBUTIONS, nextList);
    try {
      await gpApiFetch(`/api/contributions/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders()
      });
    } catch {
      // Ignore network error after local update
    }
  };

  useEffect(() => {
    const handleSyncStatus = (e: Event) => {
      const custom = e as CustomEvent<HybridSyncStateSnapshot>;
      if (custom.detail) {
        setHybridSyncState(custom.detail);
      } else {
        setHybridSyncState(getHybridSyncStateSnapshot());
      }
    };
    window.addEventListener(HYBRID_SYNC_STATUS_EVENT, handleSyncStatus);
    return () => window.removeEventListener(HYBRID_SYNC_STATUS_EVENT, handleSyncStatus);
  }, []);

  useEffect(() => {
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin' || currentUser.isOwner)) {
      fetchMetrics();
      fetchSubmissions();
      fetchTelemetryConfig();
      fetchPlanningText();
      if (canEditContributionPage(currentUser)) {
        void fetchContributionAdminData();
      }
    }
  }, [currentUser?.id]);

  const fetchMetrics = async () => {
    const isAutostartAdminPreview =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('autostart') === 'admin' &&
      !getStoredSessionToken();
    if (isAutostartAdminPreview) {
      setMetrics({
        totalMembers: availableUsers.length,
        verifiedMembers: availableUsers.filter(u => u.verificationStatus === 'verified').length,
        pendingRegistrations: availableUsers.filter(u => u.verificationStatus === 'pending').length,
        appointedAdmins: availableUsers.filter(u => u.role === 'admin' && !u.isOwner).length,
        activeEmergencies: 0,
        openProblems: 0,
        activeRides: 0,
        pendingJetSubmissions: 0,
        totalDiscussions: 0,
        chargingStationsCount: 31
      });
      return;
    }

    try {
      const [res, emgRes] = await Promise.all([
        fetch('/api/admin/metrics', { headers: getSessionAuthHeaders() }),
        fetch('/api/emergency', { headers: getSessionAuthHeaders() })
      ]);
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.metrics);
        setAuditLogs(data.auditLogs || []);
      }
      if (emgRes.ok) {
        const emgData = await emgRes.json();
        setAdminEmergencies(
          (emgData.emergencies || []).filter(
            (e: EmergencyRequest) => e.status !== 'Resolved' && e.status !== 'Cancelled'
          )
        );
      }
    } catch (err) {
      console.error('Failed to load metrics:', err);
    }
  };

  const fetchSubmissions = async () => {
    try {
      const res = await fetch('/api/jet-engineer/submissions', { headers: getSessionAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions || []);
      }
    } catch (err) {
      console.error('Failed to load submissions:', err);
    }
  };

  const fetchTelemetryConfig = async () => {
    try {
      const res = await fetch('/api/admin/telemetry-config', { headers: getSessionAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.telemetryConfig) {
          setTelemetryConfig(data.telemetryConfig);
        }
      }
    } catch (err) {
      console.error('Failed to load telemetry config:', err);
    }
  };

  const fetchPlanningText = async () => {
    try {
      const res = await fetch('/api/charging/planning-info', { headers: getSessionAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setLongRidePlanningText(typeof data.longRidePlanningText === 'string' ? data.longRidePlanningText : '');
      }
    } catch (err) {
      console.error('Failed to load planning text:', err);
    }
  };

  const handleSavePlanningText = async (textToSave: string) => {
    playTacticalClick();
    setSavingPlanningText(true);
    try {
      const res = await fetch('/api/charging/planning-info', {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          text: textToSave,
          adminName: currentUser?.fullName
        })
      });
      if (res.ok) {
        const data = await res.json();
        const updated = typeof data.longRidePlanningText === 'string' ? data.longRidePlanningText : '';
        setLongRidePlanningText(updated);
        playChime();
        setPlanningTextSavedFeedback(updated ? 'PLANNING TEXT SAVED' : 'PLANNING TEXT REMOVED');
        setTimeout(() => setPlanningTextSavedFeedback(null), 4000);
        await fetchMetrics();
      }
    } catch (err) {
      console.error('Failed to save planning text:', err);
    } finally {
      setSavingPlanningText(false);
    }
  };

  const handleSaveTelemetryConfig = async () => {
    playTacticalClick();
    setSavingTelemetryConfig(true);
    try {
      const res = await fetch('/api/admin/telemetry-config', {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          telemetryConfig,
          adminName: currentUser?.fullName
        })
      });
      if (res.ok) {
        playChime();
        setTelemetrySavedSuccess(true);
        setTimeout(() => setTelemetrySavedSuccess(false), 4000);
        await fetchMetrics();
      }
    } catch (err) {
      console.error('Failed to save telemetry configuration:', err);
    } finally {
      setSavingTelemetryConfig(false);
    }
  };

  const handleUpdateUserStatus = async (userId: string, status: 'verified' | 'rejected' | 'suspended', role?: string) => {
    playTacticalClick();
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          status,
          role: role || (status === 'verified' ? 'verified_member' : undefined),
          notes: reviewNotes || `Admin action performed by ${currentUser?.fullName}`,
          adminName: currentUser?.fullName
        })
      });

      if (res.ok) {
        playChime();
        setReviewUserId(null);
        setReviewNotes('');
        await refreshUsers();
        await fetchMetrics();
      }
    } catch (err) {
      console.error('Error updating user status:', err);
    }
  };

  const handleReviewJetSubmission = async (subId: string, status: 'Approved' | 'Rejected' | 'Needs More Information') => {
    playTacticalClick();
    try {
      const res = await fetch(`/api/jet-engineer/submissions/${subId}/review`, {
        method: 'PUT',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          status,
          reviewerNotes: subReviewNotes || `Reviewed by ${currentUser?.fullName}`,
          reviewerId: currentUser?.id,
          reviewerName: currentUser?.fullName
        })
      });

      if (res.ok) {
        playChime();
        setReviewSubmissionId(null);
        setSubReviewNotes('');
        await fetchSubmissions();
        await fetchMetrics();
      }
    } catch (err) {
      console.error('Submission review error:', err);
    }
  };

  const handleIssueSetupToken = async (targetUser: User) => {
    playTacticalClick();
    const res = await issueSetupToken(targetUser.id);
    if (res.success && res.setupToken) {
      playChime();
      setIssuedTokenInfo({
        userId: targetUser.id,
        userName: targetUser.fullName,
        token: res.setupToken,
        expiresAt: res.expiresAt || ''
      });
      await fetchMetrics();
    }
  };

  const handleOpenNicknameModal = (targetUser: User) => {
    playTacticalClick();
    setEditingNicknameUser(targetUser);
    const resolved = resolveUserDisplayIdentity(targetUser);
    setNicknameInput(resolved.secondaryTag || '');
    setNicknameError(null);
    setNicknameSuccessMessage(null);
  };

  const handleSaveNickname = async (nicknameToSave: string, isReset: boolean = false) => {
    if (!editingNicknameUser) return;
    playTacticalClick();
    setSavingNickname(true);
    setNicknameError(null);

    try {
      const res = await updatePilotNickname(editingNicknameUser.id, nicknameToSave, isReset);
      if (res.success) {
        playChime();
        setNicknameSuccessMessage(
          isReset
            ? `Nickname reset to model default for ${editingNicknameUser.fullName}`
            : `Nickname updated to "${nicknameToSave}" for ${editingNicknameUser.fullName}`
        );
        await refreshUsers();
        await fetchMetrics();
        setTimeout(() => {
          setEditingNicknameUser(null);
          setNicknameSuccessMessage(null);
        }, 1200);
      } else {
        playAlert();
        setNicknameError(res.error || 'Failed to update nickname');
      }
    } catch (err: any) {
      playAlert();
      setNicknameError(err?.message || 'Network error updating nickname');
    } finally {
      setSavingNickname(false);
    }
  };

  const handleOpenRemoveUserModal = (targetUser: User) => {
    playTacticalClick();
    setRemovingUser(targetUser);
    setRemovalReason('');
    setRemovalError(null);
  };

  const handleConfirmPermanentRemoveUser = async () => {
    if (!removingUser) return;
    playTacticalClick();
    setRemovingInProgress(true);
    setRemovalError(null);

    try {
      const res = await permanentlyRemoveUser(
        removingUser.id,
        removalReason.trim() || `Permanently removed from database by ${currentUser?.fullName || 'Administrator'}`
      );
      if (res.success) {
        playChime();
        const removedDisplayName =
          res.removedUserName || resolveUserDisplayIdentity(removingUser).primaryName || removingUser.fullName;
        setRemovalBannerMessage(
          `User "${removedDisplayName}" (ID: ${removingUser.id}) has been permanently removed from the database.`
        );
        setRemovingUser(null);
        setRemovalReason('');
        await fetchMetrics();
      } else {
        playAlert();
        setRemovalError(res.error || 'Failed to permanently remove user from database.');
      }
    } catch (err: any) {
      playAlert();
      setRemovalError(err?.message || 'Network error while permanently removing user.');
    } finally {
      setRemovingInProgress(false);
    }
  };

  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'superadmin' && !currentUser.isOwner)) {
    return (
      <div className="max-w-xl mx-auto bg-[#0D0F12] border border-[#282D34] rounded-lg p-6 space-y-4 font-mono text-xs text-center">
        <div className="w-10 h-10 mx-auto rounded bg-[#13161A] border border-[#E04F5F]/40 flex items-center justify-center text-[#E04F5F]">
          <Lock className="w-5 h-5" />
        </div>
        <div className="text-sm font-bold text-[#F1F3F5]">
          LEVEL 5 ADMINISTRATIVE CLEARANCE REQUIRED
        </div>
        <p className="text-[#A0A7B0] leading-relaxed">
          Administrative controls, member verification records, and audit logs require an authenticated Owner or Administrator session.
        </p>
        <button
          type="button"
          onClick={() => {
            playTacticalClick();
            openAuthModal('u_admin');
          }}
          className="px-4 py-2 rounded bg-[#42B883] hover:bg-[#389d6f] text-[#08090B] font-bold transition-colors"
        >
          AUTHENTICATE AS ADMINISTRATOR
        </button>
      </div>
    );
  }

  const pendingUsers = availableUsers.filter(u => u.verificationStatus === 'pending');
  const pendingSubmissions = submissions.filter(s => s.status === 'Submitted' || s.status === 'Under Review');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#13161A] border border-[#282D34] rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded bg-[#191D22] border border-[#414851] flex items-center justify-center text-[#D4D8DE]">
            <Shield className="w-5 h-5 text-[#42B883]" />
          </div>
          <div>
            <div className="text-sm font-mono font-bold text-[#F1F3F5] tracking-wider flex items-center gap-2">
              ADMIN CONTROL CENTRE
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#42B883]/15 text-[#42B883] border border-[#42B883]/30">
                LEVEL 5 CLEARANCE
              </span>
            </div>
            <div className="text-xs text-[#A0A7B0] mt-0.5">
              Verified member management • Knowledge base moderation • Audit logs
            </div>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex flex-wrap p-1 rounded-md bg-[#0D0F12] border border-[#282D34] text-xs font-mono gap-1">
          <button
            onClick={() => {
              playTacticalClick();
              setActiveSection('registrations');
            }}
            className={`relative px-3 py-1.5 rounded transition-colors cursor-pointer ${
              activeSection === 'registrations'
                ? 'text-[#F1F3F5] font-semibold'
                : 'text-[#707883] hover:text-[#AEB5BE]'
            }`}
          >
            {activeSection === 'registrations' && (
              <motion.span
                layoutId="admin-section-tab-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="pointer-events-none absolute inset-0 rounded bg-[#191D22] border border-[#414851]"
              />
            )}
            <span className="relative z-10">PILOTS & REGISTRATIONS ({availableUsers.length})</span>
          </button>
          <button
            onClick={() => {
              playTacticalClick();
              setActiveSection('jet_submissions');
            }}
            className={`relative px-3 py-1.5 rounded transition-colors cursor-pointer ${
              activeSection === 'jet_submissions'
                ? 'text-[#F1F3F5] font-semibold'
                : 'text-[#707883] hover:text-[#AEB5BE]'
            }`}
          >
            {activeSection === 'jet_submissions' && (
              <motion.span
                layoutId="admin-section-tab-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="pointer-events-none absolute inset-0 rounded bg-[#191D22] border border-[#414851]"
              />
            )}
            <span className="relative z-10">JET KNOWLEDGE ({pendingSubmissions.length})</span>
          </button>
          <button
            onClick={() => {
              playTacticalClick();
              setActiveSection('telemetry_config');
            }}
            className={`relative px-3 py-1.5 rounded transition-colors cursor-pointer ${
              activeSection === 'telemetry_config'
                ? 'text-[#F1F3F5] font-semibold'
                : 'text-[#707883] hover:text-[#AEB5BE]'
            }`}
          >
            {activeSection === 'telemetry_config' && (
              <motion.span
                layoutId="admin-section-tab-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="pointer-events-none absolute inset-0 rounded bg-[#191D22] border border-[#414851]"
              />
            )}
            <span className="relative z-10">TELEMETRY CONFIG</span>
          </button>
          {isWebsiteOwner && (
            <button
              type="button"
              data-testid="admin-tab-contribution-config"
              onClick={() => {
                playTacticalClick();
                setActiveSection('contribution_config');
              }}
              className={`relative px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeSection === 'contribution_config'
                  ? 'text-[#FDE68A] font-semibold'
                  : 'text-[#FDE68A]/80 hover:text-[#FDE68A]'
              }`}
            >
              {activeSection === 'contribution_config' && (
                <motion.span
                  layoutId="admin-section-tab-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="pointer-events-none absolute inset-0 rounded bg-[#F59E0B]/20 border border-[#F59E0B]/70"
                />
              )}
              <Heart className="relative z-10 w-3.5 h-3.5 text-[#F59E0B]" />
              <span className="relative z-10">PAYMENT MODES & UPI / QR</span>
            </button>
          )}
          <button
            onClick={() => {
              playTacticalClick();
              setActiveSection('audit');
            }}
            className={`relative px-3 py-1.5 rounded transition-colors cursor-pointer ${
              activeSection === 'audit'
                ? 'text-[#F1F3F5] font-semibold'
                : 'text-[#707883] hover:text-[#AEB5BE]'
            }`}
          >
            {activeSection === 'audit' && (
              <motion.span
                layoutId="admin-section-tab-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="pointer-events-none absolute inset-0 rounded bg-[#191D22] border border-[#414851]"
              />
            )}
            <span className="relative z-10">AUDIT LOGS</span>
          </button>
        </div>
      </div>

      {/* Real Stored Metrics Grid */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs font-mono">
          <div className="p-3 rounded bg-[#0D0F12] border border-[#282D34]">
            <div className="text-[10px] text-[#707883]">TOTAL MEMBERS</div>
            <div className="text-[#F1F3F5] font-bold text-sm mt-0.5">{metrics.totalMembers}</div>
          </div>
          <div className="p-3 rounded bg-[#0D0F12] border border-[#282D34]">
            <div className="text-[10px] text-[#42B883]">VERIFIED OWNERS</div>
            <div className="text-[#42B883] font-bold text-sm mt-0.5">{metrics.verifiedMembers}</div>
          </div>
          <div className="p-3 rounded bg-[#0D0F12] border border-[#282D34]">
            <div className="text-[10px] text-[#E8AA45]">PENDING REGISTRATIONS</div>
            <div className="text-[#E8AA45] font-bold text-sm mt-0.5">{metrics.pendingRegistrations}</div>
          </div>
          <div className="p-3 rounded bg-[#0D0F12] border border-[#282D34]">
            <div className="text-[10px] text-[#729BCB]">ACTIVE SORTIES</div>
            <div className="text-[#729BCB] font-bold text-sm mt-0.5">{metrics.activeRides}</div>
          </div>
          <div className="p-3 rounded bg-[#0D0F12] border border-[#282D34]">
            <div className="text-[10px] text-[#E04F5F]">ACTIVE EMERGENCIES</div>
            <div className="text-[#E04F5F] font-bold text-sm mt-0.5">{metrics.activeEmergencies}</div>
          </div>
          <div className="p-3 rounded bg-[#0D0F12] border border-[#282D34]">
            <div className="text-[10px] text-[#AEB5BE]">OPEN ISSUES</div>
            <div className="text-[#AEB5BE] font-bold text-sm mt-0.5">{metrics.openProblems}</div>
          </div>
        </div>
      )}

      {/* Priority Admin SOS Dispatch Monitor */}
      {adminEmergencies.length > 0 && (
        <div className="bg-[#1A090D] border border-[#E04F5F] rounded-lg p-4 space-y-3 font-mono text-xs shadow-[0_0_20px_rgba(224,79,95,0.2)]">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E04F5F]/30">
            <div className="flex items-center gap-2 text-[#FCA5A5] font-bold uppercase">
              <AlertTriangle className="w-4 h-4 text-[#E04F5F] animate-pulse" />
              <span>PRIORITY ADMIN SOS MONITOR ({adminEmergencies.length} ACTIVE INCIDENT{adminEmergencies.length > 1 ? 'S' : ''})</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-[#E04F5F] text-white text-[10px] font-bold">
              IMMEDIATE ADMIN OVERSIGHT
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {adminEmergencies.map(emg => (
              <div key={emg.id} className="p-3 rounded bg-[#0D0F12] border border-[#E04F5F]/50 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
                  <span className="px-1.5 py-0.5 rounded bg-[#E04F5F]/20 text-[#E04F5F] font-bold uppercase">
                    {emg.category}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[#38BDF8]/20 text-[#38BDF8] font-bold uppercase">
                    CITY: {emg.city || 'Bengaluru'}
                  </span>
                  <span className="text-[#42B883] font-bold">{emg.status}</span>
                </div>
                <div className="text-sm font-bold text-[#F1F3F5]">
                  {emg.requesterName} <span className="text-xs text-[#A0A7B0] font-normal">({emg.requesterModel})</span>
                </div>
                <div className="text-[11px] text-[#D4D8DE]">{emg.description}</div>
                <div className="text-[11px] text-[#AEB5BE] pt-1 border-t border-[#282D34] flex flex-wrap items-center justify-between gap-2">
                  <span>📍 {emg.locationName}</span>
                  {emg.callbackPhone && (
                    <a href={`tel:${emg.callbackPhone}`} className="text-[#42B883] font-bold hover:underline">
                      📞 {emg.callbackPhone}
                    </a>
                  )}
                </div>
                {emg.notifiedCityUsers && emg.notifiedCityUsers.length > 0 && (
                  <div className="text-[10px] text-[#38BDF8]">
                    Notified {emg.city} Riders: {emg.notifiedCityUsers.map(u => u.name).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <AvionicsToggleTransition
        activeKey={activeSection}
        orderedKeys={[
          'registrations',
          'jet_submissions',
          'telemetry_config',
          'contribution_config',
          'audit'
        ]}
        accentColor={activeSection === 'contribution_config' ? 'amber' : 'emerald'}
        reducedMotion={reducedMotion}
      >
      {/* ========================================================= */}
      {/* SECTION 1: MEMBER REGISTRATIONS & VERIFICATION */}
      {/* ========================================================= */}
      {activeSection === 'registrations' && (
        <div className="space-y-4 font-mono text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#282D34]">
            <div>
              <span className="font-bold text-[#D4D8DE] uppercase text-sm">
                PILOT ROSTER & VERIFICATION REGISTRY ({availableUsers.length})
              </span>
              <div className="text-[11px] text-[#A0A7B0] font-sans mt-0.5">
                {currentUser.isOwner ? (
                  <span className="text-[#42B883]">
                    ★ Website Owner Clearance: You can change the nickname (F77 PILOT / X47 PILOT or any custom callsign) of any user.
                  </span>
                ) : (
                  'Review member credentials, verification status, and registered motorcycles.'
                )}
              </div>
            </div>
            {currentUser.isOwner && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#42B883]/15 text-[#42B883] border border-[#42B883]/30 font-bold uppercase shrink-0">
                OWNER NICKNAME OVERRIDE ACTIVE
              </span>
            )}
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between bg-[#13161A] border border-[#282D34] rounded-lg p-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#707883] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearchQuery}
                onChange={e => setUserSearchQuery(e.target.value)}
                placeholder="Search pilots by name, email, motorcycle, or nickname..."
                className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#42B883]/60 rounded pl-9 pr-3 py-1.5 text-xs text-[#F1F3F5] placeholder-[#707883] focus:outline-none font-mono"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] shrink-0">
              <button
                type="button"
                onClick={() => {
                  playTacticalClick();
                  setUserStatusFilter('all');
                }}
                className={`px-2.5 py-1 rounded transition-colors ${
                  userStatusFilter === 'all'
                    ? 'bg-[#191D22] text-[#F1F3F5] border border-[#414851] font-bold'
                    : 'text-[#707883] hover:text-[#D4D8DE]'
                }`}
              >
                ALL ({availableUsers.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  playTacticalClick();
                  setUserStatusFilter('pending');
                }}
                className={`px-2.5 py-1 rounded transition-colors ${
                  userStatusFilter === 'pending'
                    ? 'bg-[#E8AA45]/15 text-[#E8AA45] border border-[#E8AA45]/40 font-bold'
                    : 'text-[#707883] hover:text-[#D4D8DE]'
                }`}
              >
                PENDING ({pendingUsers.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  playTacticalClick();
                  setUserStatusFilter('verified');
                }}
                className={`px-2.5 py-1 rounded transition-colors ${
                  userStatusFilter === 'verified'
                    ? 'bg-[#42B883]/15 text-[#42B883] border border-[#42B883]/40 font-bold'
                    : 'text-[#707883] hover:text-[#D4D8DE]'
                }`}
              >
                VERIFIED ({availableUsers.filter(u => u.verificationStatus === 'verified').length})
              </button>
              <button
                type="button"
                onClick={() => {
                  playTacticalClick();
                  setUserStatusFilter('suspended');
                }}
                className={`px-2.5 py-1 rounded transition-colors ${
                  userStatusFilter === 'suspended'
                    ? 'bg-[#E04F5F]/15 text-[#E04F5F] border border-[#E04F5F]/40 font-bold'
                    : 'text-[#707883] hover:text-[#D4D8DE]'
                }`}
              >
                SUSPENDED ({availableUsers.filter(u => u.verificationStatus === 'suspended').length})
              </button>
            </div>
          </div>

          {removalBannerMessage && (
            <div
              data-testid="user-removal-feedback-banner"
              className="p-3.5 rounded-lg bg-[#E04F5F]/15 border border-[#E04F5F]/40 flex items-center justify-between gap-3 text-xs text-[#F1F3F5]"
            >
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-[#E04F5F] shrink-0" />
                <span className="font-bold text-[#E04F5F]">{removalBannerMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setRemovalBannerMessage(null)}
                className="text-[10px] text-[#A0A7B0] hover:text-[#F1F3F5] uppercase font-bold"
              >
                DISMISS
              </button>
            </div>
          )}

          {issuedTokenInfo && (
            <div className="p-4 rounded-lg bg-[#13161A] border border-[#E8AA45]/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#E8AA45] uppercase">
                  SINGLE-USE 24-HOUR PASSWORD SETUP TOKEN GENERATED FOR {issuedTokenInfo.userName}
                </span>
                <button
                  type="button"
                  onClick={() => setIssuedTokenInfo(null)}
                  className="text-[10px] text-[#707883] hover:text-[#F1F3F5]"
                >
                  DISMISS
                </button>
              </div>
              <div className="p-2.5 rounded bg-[#08090B] border border-[#282D34] text-[#42B883] font-bold select-all break-all">
                {issuedTokenInfo.token}
              </div>
              <div className="text-[10px] text-[#A0A7B0]">
                Share this token securely with the member. Only its SHA-256 hash is stored on the server; this plaintext token will not be shown again. Expires: {new Date(issuedTokenInfo.expiresAt).toLocaleString()}
              </div>
            </div>
          )}

          {/* Pilot List */}
          <div className="divide-y divide-[#282D34] border border-[#282D34] rounded-lg overflow-hidden bg-[#0D0F12]">
            {availableUsers
              .filter(u => {
                if (userStatusFilter !== 'all' && u.verificationStatus !== userStatusFilter) {
                  return false;
                }
                if (userSearchQuery.trim()) {
                  const q = userSearchQuery.trim().toLowerCase();
                  const resolved = resolveUserDisplayIdentity(u);
                  const matchesName =
                    u.fullName.toLowerCase().includes(q) ||
                    (u.originalName && u.originalName.toLowerCase().includes(q));
                  const matchesEmail = (u.email || '').toLowerCase().includes(q);
                  const matchesModel = (u.motorcycleModel || '').toLowerCase().includes(q);
                  const matchesTag = (resolved.secondaryTag || '').toLowerCase().includes(q);
                  return Boolean(matchesName || matchesEmail || matchesModel || matchesTag);
                }
                return true;
              })
              .map(user => {
                const identity = resolveUserDisplayIdentity(user);
                return (
                  <div key={user.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <UserIdentityBadge user={user} showRoleBadge size="sm" />
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold border ${
                            user.verificationStatus === 'verified'
                              ? 'bg-[#42B883]/15 text-[#42B883] border-[#42B883]/30'
                              : user.verificationStatus === 'pending'
                              ? 'bg-[#E8AA45]/15 text-[#E8AA45] border-[#E8AA45]/30'
                              : 'bg-[#E04F5F]/15 text-[#E04F5F] border-[#E04F5F]/30'
                          }`}
                        >
                          {user.verificationStatus}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#252A30] text-[#707883] uppercase">
                          ROLE: {user.role}
                        </span>
                      </div>

                      {/* Pilot Nickname Display Row */}
                      <div className="flex items-center gap-2 font-mono text-[11px] flex-wrap pt-0.5">
                        <span className="text-[#707883] text-[10px] uppercase tracking-wider">PILOT NICKNAME:</span>
                        <span className="px-2 py-0.5 rounded bg-[#161B22] border border-[#282D34] text-[#42B883] font-bold tracking-wide">
                          {identity.secondaryTag || 'NONE'}
                        </span>
                        {user.customSecondaryTag ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#E8AA45]/15 text-[#E8AA45] border border-[#E8AA45]/30 font-bold uppercase">
                            OWNER CUSTOM
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#282D34]/40 text-[#707883] border border-[#282D34] uppercase">
                            DEFAULT
                          </span>
                        )}
                        {identity.customPrimaryName && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#729BCB]/15 text-[#729BCB] border border-[#729BCB]/30 font-bold uppercase">
                            CUSTOM NAME: {identity.customPrimaryName}
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-[#A0A7B0] font-sans">
                        {user.motorcycleModel} • {user.variant} • Reg: {user.registrationNumber || 'Pending'}
                      </div>
                      <div className="text-[10px] text-[#707883]">
                        Email: {user.email} • Mobile: {user.mobile || 'Unregistered'} • City: {user.city}, {user.state}
                      </div>
                      {user.verificationNotes && (
                        <div className="text-[10px] text-[#AEB5BE] italic">
                          Review Note: {user.verificationNotes}
                        </div>
                      )}
                    </div>

                    {/* Actions: Owner Nickname Customization & Verification */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {currentUser.isOwner && (
                        <button
                          type="button"
                          onClick={() => handleOpenNicknameModal(user)}
                          className="px-3 py-1.5 rounded bg-[#42B883]/15 hover:bg-[#42B883]/25 text-[#42B883] border border-[#42B883]/40 font-bold text-[10px] flex items-center gap-1.5 cursor-pointer transition-colors shadow-[0_0_10px_rgba(66,184,131,0.15)]"
                          title="Website Owner Clearance: Change this pilot's nickname to whatever you want"
                        >
                          <Tag className="w-3.5 h-3.5 text-[#42B883]" />
                          <span>CHANGE NICKNAME</span>
                        </button>
                      )}

                      {currentUser.isOwner && (
                        <button
                          type="button"
                          onClick={() => handleIssueSetupToken(user)}
                          className="px-2.5 py-1.5 rounded bg-[#E8AA45]/15 hover:bg-[#E8AA45]/25 text-[#E8AA45] border border-[#E8AA45]/40 font-bold text-[10px]"
                          title="Generate single-use 24h setup token for this member"
                        >
                          ISSUE SETUP TOKEN
                        </button>
                      )}
                      {user.verificationStatus !== 'verified' && (
                        <button
                          onClick={() => handleUpdateUserStatus(user.id, 'verified', 'verified_member')}
                          className="px-3 py-1.5 rounded bg-[#42B883]/20 hover:bg-[#42B883]/30 text-[#42B883] border border-[#42B883]/40 font-bold"
                        >
                          APPROVE & VERIFY
                        </button>
                      )}
                      {user.verificationStatus === 'pending' && (
                        <button
                          onClick={() => handleUpdateUserStatus(user.id, 'rejected')}
                          className="px-3 py-1.5 rounded bg-[#E04F5F]/20 hover:bg-[#E04F5F]/30 text-[#E04F5F] border border-[#E04F5F]/40 font-bold"
                        >
                          REJECT
                        </button>
                      )}
                      {user.verificationStatus === 'verified' && (user.role !== 'admin' || currentUser.isOwner) && !user.isOwner && (
                        <button
                          type="button"
                          onClick={() => handleUpdateUserStatus(user.id, 'suspended')}
                          className="px-3 py-1.5 rounded bg-[#252A30] hover:bg-[#414851] text-[#E8AA45] border border-[#414851] font-bold text-[10px] cursor-pointer transition-colors"
                        >
                          SUSPEND
                        </button>
                      )}
                      {user.verificationStatus === 'suspended' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateUserStatus(user.id, 'verified')}
                          className="px-3 py-1.5 rounded bg-[#42B883]/20 text-[#42B883] border border-[#42B883]/40 font-bold text-[10px] cursor-pointer transition-colors"
                        >
                          REINSTATE
                        </button>
                      )}
                      {canPermanentlyRemoveUser(currentUser, user).allowed && (
                        <button
                          type="button"
                          data-testid={`btn-permanently-remove-user-${user.id}`}
                          onClick={() => handleOpenRemoveUserModal(user)}
                          className="px-3 py-1.5 rounded bg-[#E04F5F]/15 hover:bg-[#E04F5F]/30 text-[#E04F5F] border border-[#E04F5F]/50 font-bold text-[10px] flex items-center gap-1.5 cursor-pointer transition-colors"
                          title="Permanently delete this user account from the database"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-[#E04F5F]" />
                          <span>PERMANENTLY REMOVE</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECTION 2: THE JET ENGINEER KNOWLEDGE MODERATION */}
      {/* ========================================================= */}
      {activeSection === 'jet_submissions' && (
        <div className="space-y-4 font-mono text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-[#282D34]">
            <span className="font-bold text-[#D4D8DE] uppercase">
              COMMUNITY TELEMETRY SUBMISSIONS ({submissions.length})
            </span>
          </div>

          <div className="space-y-3">
            {submissions.map(sub => (
              <div
                key={sub.id}
                className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-5 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#282D34]">
                  <div>
                    <div className="text-sm font-bold text-[#F1F3F5]">{sub.title}</div>
                    <div className="text-[11px] text-[#A0A7B0] mt-0.5">
                      Platform: {sub.motorcycleModel} • Author: {sub.authorName}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                      sub.status === 'Approved'
                        ? 'bg-[#42B883]/15 text-[#42B883]'
                        : sub.status === 'Submitted'
                        ? 'bg-[#729BCB]/15 text-[#729BCB]'
                        : 'bg-[#E8AA45]/15 text-[#E8AA45]'
                    }`}
                  >
                    {sub.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-[#13161A] border border-[#282D34]">
                    <div className="text-[10px] text-[#707883]">SYMPTOMS & CONDITIONS:</div>
                    <div className="text-[#D4D8DE] mt-0.5">{sub.symptoms}</div>
                    <div className="text-[10px] text-[#707883] mt-1">{sub.operatingConditions}</div>
                  </div>
                  <div className="p-3 rounded bg-[#13161A] border border-[#282D34]">
                    <div className="text-[10px] text-[#707883]">CONFIRMED RESOLUTION:</div>
                    <div className="text-[#42B883] mt-0.5">{sub.resolutionOutcome}</div>
                  </div>
                </div>

                {sub.reviewerNotes && (
                  <div className="text-[10px] text-[#AEB5BE] border-t border-[#282D34] pt-2">
                    Reviewer Notes: {sub.reviewerNotes}
                  </div>
                )}

                {/* Moderation Actions */}
                <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#282D34]">
                  {sub.status !== 'Approved' && (
                    <button
                      onClick={() => handleReviewJetSubmission(sub.id, 'Approved')}
                      className="px-3 py-1.5 rounded bg-[#42B883]/20 hover:bg-[#42B883]/30 text-[#42B883] border border-[#42B883]/40 font-bold"
                    >
                      APPROVE TO KNOWLEDGE BASE
                    </button>
                  )}
                  {sub.status !== 'Rejected' && (
                    <button
                      onClick={() => handleReviewJetSubmission(sub.id, 'Rejected')}
                      className="px-3 py-1.5 rounded bg-[#E04F5F]/20 hover:bg-[#E04F5F]/30 text-[#E04F5F] border border-[#E04F5F]/40 font-bold"
                    >
                      REJECT
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECTION: THE JET ENGINEER TELEMETRY DISPLAY CONFIGURATION */}
      {/* ========================================================= */}
      {activeSection === 'telemetry_config' && (
        <div className="space-y-4 font-mono text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-[#282D34]">
            <div>
              <span className="font-bold text-[#D4D8DE] uppercase text-sm">
                THE JET ENGINEER — TELEMETRY METRICS CONFIGURATION
              </span>
              <div className="text-[11px] text-[#A0A7B0] font-sans mt-0.5">
                Select which motorcycle telemetry metrics are displayed on The Jet Engineer page. Disabled metrics are completely hidden from the user-facing view.
              </div>
            </div>
            {telemetrySavedSuccess && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#42B883]/20 border border-[#42B883]/50 text-[#42B883] font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>CONFIGURATION PERSISTED</span>
              </span>
            )}
          </div>

          <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-5 space-y-4">
            <div className="text-xs text-[#D4D8DE] font-semibold uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-[#282D34]">
              <Sliders className="w-4 h-4 text-[#729BCB]" />
              <span>SUPPORTED TELEMETRY FIELDS</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Battery SOC */}
              <label className="flex items-start space-x-3 p-3.5 rounded bg-[#13161A] border border-[#282D34] hover:border-[#414851] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={telemetryConfig.batterySoc}
                  onChange={e => setTelemetryConfig({ ...telemetryConfig, batterySoc: e.target.checked })}
                  className="mt-0.5 rounded border-[#414851] bg-[#08090B] text-[#42B883] focus:ring-0 w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2 text-[#F1F3F5] font-bold">
                    <BatteryCharging className="w-4 h-4 text-[#42B883]" />
                    <span>Battery State of Charge (SOC %)</span>
                  </div>
                  <div className="text-[11px] text-[#707883] font-sans mt-0.5">
                    Live battery charge percentage & SRB battery pack status.
                  </div>
                </div>
              </label>

              {/* Estimated Range */}
              <label className="flex items-start space-x-3 p-3.5 rounded bg-[#13161A] border border-[#282D34] hover:border-[#414851] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={telemetryConfig.estimatedRange}
                  onChange={e => setTelemetryConfig({ ...telemetryConfig, estimatedRange: e.target.checked })}
                  className="mt-0.5 rounded border-[#414851] bg-[#08090B] text-[#42B883] focus:ring-0 w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2 text-[#F1F3F5] font-bold">
                    <Compass className="w-4 h-4 text-[#729BCB]" />
                    <span>Estimated Range (KM)</span>
                  </div>
                  <div className="text-[11px] text-[#707883] font-sans mt-0.5">
                    Remaining range in kilometers based on active ride mode.
                  </div>
                </div>
              </label>

              {/* Motor Temperature */}
              <label className="flex items-start space-x-3 p-3.5 rounded bg-[#13161A] border border-[#282D34] hover:border-[#414851] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={telemetryConfig.motorTemp}
                  onChange={e => setTelemetryConfig({ ...telemetryConfig, motorTemp: e.target.checked })}
                  className="mt-0.5 rounded border-[#414851] bg-[#08090B] text-[#42B883] focus:ring-0 w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2 text-[#F1F3F5] font-bold">
                    <Activity className="w-4 h-4 text-[#42B883]" />
                    <span>Motor Temperature (°C)</span>
                  </div>
                  <div className="text-[11px] text-[#707883] font-sans mt-0.5">
                    Thermal sensor envelope reading for the permanent magnet electric motor.
                  </div>
                </div>
              </label>

              {/* Dynamic Regen Level */}
              <label className="flex items-start space-x-3 p-3.5 rounded bg-[#13161A] border border-[#282D34] hover:border-[#414851] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={telemetryConfig.regenLevel}
                  onChange={e => setTelemetryConfig({ ...telemetryConfig, regenLevel: e.target.checked })}
                  className="mt-0.5 rounded border-[#414851] bg-[#08090B] text-[#42B883] focus:ring-0 w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2 text-[#F1F3F5] font-bold">
                    <Zap className="w-4 h-4 text-[#E8AA45]" />
                    <span>Dynamic Regen Level</span>
                  </div>
                  <div className="text-[11px] text-[#707883] font-sans mt-0.5">
                    Current active regenerative braking level (1-10 steps).
                  </div>
                </div>
              </label>

              {/* Total Odometer */}
              <label className="flex items-start space-x-3 p-3.5 rounded bg-[#13161A] border border-[#282D34] hover:border-[#414851] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={telemetryConfig.odometer}
                  onChange={e => setTelemetryConfig({ ...telemetryConfig, odometer: e.target.checked })}
                  className="mt-0.5 rounded border-[#414851] bg-[#08090B] text-[#42B883] focus:ring-0 w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2 text-[#F1F3F5] font-bold">
                    <Gauge className="w-4 h-4 text-[#AEB5BE]" />
                    <span>Total Odometer (KM)</span>
                  </div>
                  <div className="text-[11px] text-[#707883] font-sans mt-0.5">
                    Total lifetime cumulative distance logged on vehicle dash.
                  </div>
                </div>
              </label>

              {/* Avionics Health */}
              <label className="flex items-start space-x-3 p-3.5 rounded bg-[#13161A] border border-[#282D34] hover:border-[#414851] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={telemetryConfig.avionicsHealth}
                  onChange={e => setTelemetryConfig({ ...telemetryConfig, avionicsHealth: e.target.checked })}
                  className="mt-0.5 rounded border-[#414851] bg-[#08090B] text-[#42B883] focus:ring-0 w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2 text-[#F1F3F5] font-bold">
                    <Shield className="w-4 h-4 text-[#42B883]" />
                    <span>Avionics Health Link</span>
                  </div>
                  <div className="text-[11px] text-[#707883] font-sans mt-0.5">
                    System diagnostic health status (NOMINAL / DEGRADED / CHECK_REQUIRED).
                  </div>
                </div>
              </label>
            </div>

            <div className="pt-3 border-t border-[#282D34] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <span className="text-[11px] text-[#707883]">
                Changes are saved to the persistent database and reflect immediately on The Jet Engineer page.
              </span>
              <button
                onClick={handleSaveTelemetryConfig}
                disabled={savingTelemetryConfig}
                className="px-5 py-2.5 rounded bg-[#42B883] hover:bg-[#389d6f] disabled:opacity-50 text-[#08090B] font-bold text-xs flex items-center space-x-2 transition-all cursor-pointer shadow-[0_0_15px_rgba(66,184,131,0.3)] shrink-0"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{savingTelemetryConfig ? 'PERSISTING...' : 'SAVE TELEMETRY CONFIGURATION'}</span>
              </button>
            </div>
          </div>

          {/* CHARGING PAGE: PLANNING A LONG RIDE? CONFIGURATION */}
          <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#282D34]">
              <div className="text-xs text-[#D4D8DE] font-semibold uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#42B883]" />
                <span>CHARGING PAGE — "Planning a Long Ride?" TEXT</span>
              </div>
              {planningTextSavedFeedback && (
                <span className="text-[10px] px-2.5 py-1 rounded bg-[#42B883]/20 border border-[#42B883]/40 text-[#42B883] font-bold">
                  {planningTextSavedFeedback}
                </span>
              )}
            </div>

            <textarea
              rows={3}
              value={longRidePlanningText}
              onChange={e => setLongRidePlanningText(e.target.value)}
              placeholder="Configure the text displayed in the 'Planning a Long Ride?' section on the Charging page..."
              className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#414851] rounded p-3 text-[#F1F3F5] text-xs font-sans focus:outline-none"
            />

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleSavePlanningText('')}
                disabled={savingPlanningText}
                className="px-4 py-2 rounded bg-[#E04F5F]/15 hover:bg-[#E04F5F]/25 text-[#E04F5F] border border-[#E04F5F]/40 font-bold text-xs transition-colors disabled:opacity-50"
              >
                REMOVE TEXT
              </button>
              <button
                type="button"
                onClick={() => handleSavePlanningText(longRidePlanningText)}
                disabled={savingPlanningText}
                className="px-5 py-2 rounded bg-[#42B883] hover:bg-[#389d6f] text-[#08090B] font-bold text-xs transition-colors disabled:opacity-50"
              >
                {savingPlanningText ? 'SAVING...' : 'SAVE PLANNING TEXT'}
              </button>
            </div>
          </div>

          {/* HYBRID DATABASE ARCHITECTURE: LOCAL OFFLINE PHONE STORAGE + FIREBASE CLOUD SYNC */}
          <div
            data-testid="hybrid-database-panel"
            className="bg-[#0D0F12] border border-[#38BDF8]/40 rounded-lg p-5 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#282D34]">
              <div>
                <div className="text-xs text-[#F1F3F5] font-bold uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#38BDF8]" />
                  <span>HYBRID DATABASE ENGINE — OFFLINE PHONE STORAGE + FIREBASE CLOUD SYNC</span>
                </div>
                <div className="text-[11px] text-[#A0A7B0] font-sans mt-0.5">
                  Offline-capable features run 100% on user phone storage (0 Firebase quota used). Shared community features sync with Firebase Spark Free-Tier quota guards for 600+ pilots.
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="btn-force-hybrid-sync"
                  onClick={() => {
                    playTacticalClick();
                    void runHybridSyncCycle({ force: true });
                  }}
                  className="px-3 py-1.5 rounded bg-[#191D22] hover:bg-[#232930] border border-[#414851] text-[#F1F3F5] font-bold text-[11px] flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#38BDF8]" />
                  <span>SYNC NOW</span>
                </button>
                {hybridSyncState.firebaseConnected ? (
                  <button
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      void signOutFromFirebaseCloudSync();
                    }}
                    className="px-3 py-1.5 rounded bg-[#E04F5F]/15 hover:bg-[#E04F5F]/25 border border-[#E04F5F]/40 text-[#E04F5F] font-bold text-[11px] cursor-pointer"
                  >
                    UNLINK FIREBASE ({hybridSyncState.firebaseUserEmail})
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="btn-link-firebase-google"
                    onClick={() => {
                      playTacticalClick();
                      void signInWithGoogleForCloudSync().catch(() => {});
                    }}
                    className="px-3 py-1.5 rounded bg-[#38BDF8] hover:bg-[#0EA5E9] text-[#08090B] font-bold text-[11px] cursor-pointer"
                  >
                    LINK GOOGLE CLOUD AUTH
                  </button>
                )}
              </div>
            </div>

            {/* Free-Tier Quota Guard Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded bg-[#13161A] border border-[#282D34]">
                <div className="text-[10px] text-[#707883] uppercase">DAILY CLOUD READS</div>
                <div className="text-sm font-bold text-[#42B883] mt-1">
                  {hybridSyncState.quotaUsage.reads} / {FIREBASE_FREE_TIER_LIMITS.MAX_DAILY_READS_PER_DEVICE}
                </div>
                <div className="text-[10px] text-[#A0A7B0] mt-0.5">
                  Per-device cap (50k/day free limit)
                </div>
              </div>
              <div className="p-3 rounded bg-[#13161A] border border-[#282D34]">
                <div className="text-[10px] text-[#707883] uppercase">DAILY CLOUD WRITES</div>
                <div className="text-sm font-bold text-[#38BDF8] mt-1">
                  {hybridSyncState.quotaUsage.writes} / {FIREBASE_FREE_TIER_LIMITS.MAX_DAILY_WRITES_PER_DEVICE}
                </div>
                <div className="text-[10px] text-[#A0A7B0] mt-0.5">
                  Per-device cap (20k/day free limit)
                </div>
              </div>
              <div className="p-3 rounded bg-[#13161A] border border-[#282D34]">
                <div className="text-[10px] text-[#707883] uppercase">READS SAVED BY CACHE</div>
                <div className="text-sm font-bold text-[#FDE68A] mt-1">
                  {hybridSyncState.quotaUsage.savedReadsByCache}
                </div>
                <div className="text-[10px] text-[#A0A7B0] mt-0.5">
                  Served from phone storage
                </div>
              </div>
              <div className="p-3 rounded bg-[#13161A] border border-[#282D34]">
                <div className="text-[10px] text-[#707883] uppercase">WRITES SAVED BY DEDUP</div>
                <div className="text-sm font-bold text-[#FDE68A] mt-1">
                  {hybridSyncState.quotaUsage.savedWritesByDedup}
                </div>
                <div className="text-[10px] text-[#A0A7B0] mt-0.5">
                  Checksum-matched skips
                </div>
              </div>
            </div>

            {/* Storage Tier Partitioning Table */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 rounded bg-[#13161A] border border-[#282D34] space-y-2">
                <div className="text-[11px] font-bold text-[#42B883] uppercase">
                  TIER 1: OFFLINE PHONE STORAGE ONLY (0 FIREBASE QUOTA)
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {HYBRID_STORAGE_MANIFEST.filter(m => m.tier === 'offline_device_only').map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 text-[11px] py-1 border-b border-[#191D22] last:border-0"
                    >
                      <span className="text-[#F1F3F5] font-sans font-medium">{item.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#42B883]/15 text-[#42B883]">
                        DEVICE LOCAL
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded bg-[#13161A] border border-[#282D34] space-y-2">
                <div className="text-[11px] font-bold text-[#38BDF8] uppercase">
                  TIER 2 & 3: HYBRID CLOUD SYNCED (SHARED ACROSS 600+ PILOTS)
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {HYBRID_STORAGE_MANIFEST.filter(m => m.tier === 'hybrid_cloud_synced').map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 text-[11px] py-1 border-b border-[#191D22] last:border-0"
                    >
                      <span className="text-[#F1F3F5] font-sans font-medium">{item.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#38BDF8]/15 text-[#38BDF8]">
                        FIREBASE + CACHE
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECTION: WEBSITE OWNER-ONLY CONTRIBUTION & PAYMENT MODES */}
      {/* ========================================================= */}
      {activeSection === 'contribution_config' && isWebsiteOwner && (
        <div className="space-y-6 font-mono text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#282D34]">
            <div>
              <span className="font-bold text-[#FDE68A] uppercase text-sm flex items-center gap-2">
                <Heart className="w-4 h-4 text-[#F59E0B]" />
                <span>CONTRIBUTE PAGE — PAYMENT MODES, UPI ID & QR SCAN CODE</span>
              </span>
              <div className="text-[11px] text-[#A0A7B0] font-sans mt-0.5">
                ★ Website Owner Exclusive Clearance: Only you can configure payment modes, UPI ID, QR scan code, and Contribute page settings. Visitors and regular users cannot view or access these controls.
              </div>
            </div>
            <span className="text-[10px] px-2.5 py-1 rounded bg-[#F59E0B]/15 text-[#FDE68A] border border-[#F59E0B]/40 font-bold uppercase shrink-0">
              OWNER EXCLUSIVE
            </span>
          </div>

          {contribConfigFeedback && (
            <div
              data-testid="contribution-config-feedback"
              className={`p-3.5 rounded-lg border flex items-center justify-between gap-3 text-xs font-mono ${
                contribConfigFeedback.type === 'success'
                  ? 'bg-[#42B883]/15 border-[#42B883]/50 text-[#42B883]'
                  : 'bg-[#E04F5F]/15 border-[#E04F5F]/50 text-[#E04F5F]'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{contribConfigFeedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setContribConfigFeedback(null)}
                className="text-current opacity-75 hover:opacity-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <form
            onSubmit={handleSaveContributionConfig}
            data-testid="contribution-config-editor"
            className="bg-[#0D0F12] border border-[#F59E0B]/50 rounded-lg p-5 space-y-5"
          >
            {/* Payment Mode Toggles */}
            <div className="space-y-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-[#FDE68A] font-bold">
                Enabled Payment Modes (Select one or more)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label
                  data-testid="toggle-mode-qr"
                  className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                    draftEnableQrScan
                      ? 'bg-[#F59E0B]/15 border-[#F59E0B] text-[#F1F3F5]'
                      : 'bg-[#08090B] border-[#282D34] text-[#707883]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={draftEnableQrScan}
                    onChange={e => setDraftEnableQrScan(e.target.checked)}
                    className="accent-[#F59E0B]"
                  />
                  <QrCode className="w-4 h-4 text-[#F59E0B] shrink-0" />
                  <span className="font-mono text-xs font-bold uppercase">UPI QR Scan Code</span>
                </label>

                <label
                  data-testid="toggle-mode-upi"
                  className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                    draftEnableUpiId
                      ? 'bg-[#38BDF8]/15 border-[#38BDF8] text-[#F1F3F5]'
                      : 'bg-[#08090B] border-[#282D34] text-[#707883]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={draftEnableUpiId}
                    onChange={e => setDraftEnableUpiId(e.target.checked)}
                    className="accent-[#38BDF8]"
                  />
                  <Smartphone className="w-4 h-4 text-[#38BDF8] shrink-0" />
                  <span className="font-mono text-xs font-bold uppercase">UPI ID & App Pay</span>
                </label>

                <label
                  data-testid="toggle-mode-link"
                  className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                    draftEnablePaymentLink
                      ? 'bg-[#42B883]/15 border-[#42B883] text-[#F1F3F5]'
                      : 'bg-[#08090B] border-[#282D34] text-[#707883]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={draftEnablePaymentLink}
                    onChange={e => setDraftEnablePaymentLink(e.target.checked)}
                    className="accent-[#42B883]"
                  />
                  <CreditCard className="w-4 h-4 text-[#42B883] shrink-0" />
                  <span className="font-mono text-xs font-bold uppercase">Payment Link / Other</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* UPI ID Input */}
              <div>
                <label
                  htmlFor="admin-contrib-upi-input"
                  className="block font-mono text-[11px] uppercase tracking-wider text-[#FDE68A] mb-1.5"
                >
                  UPI ID *
                </label>
                <input
                  id="admin-contrib-upi-input"
                  data-testid="input-contribution-upi"
                  type="text"
                  value={draftUpiId}
                  onChange={e => setDraftUpiId(e.target.value)}
                  required
                  className="w-full bg-[#08090B] border border-[#F59E0B]/60 focus:border-[#F59E0B] rounded-lg px-3.5 py-2 text-sm text-[#F1F3F5] font-mono focus:outline-none"
                  placeholder="yourupi@bank"
                />
              </div>

              {/* Payment Link URL */}
              <div>
                <label
                  htmlFor="admin-contrib-link-input"
                  className="block font-mono text-[11px] uppercase tracking-wider text-[#D4D8DE] mb-1.5"
                >
                  Payment Link URL (Optional)
                </label>
                <input
                  id="admin-contrib-link-input"
                  data-testid="input-contribution-link"
                  type="url"
                  value={draftPaymentLink}
                  onChange={e => setDraftPaymentLink(e.target.value)}
                  className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#38BDF8] rounded-lg px-3.5 py-2 text-sm text-[#F1F3F5] font-mono focus:outline-none"
                  placeholder="https://..."
                />
              </div>

              {/* Upload or Paste QR Scan Code */}
              <div className="md:col-span-2">
                <label
                  htmlFor="admin-contrib-qr-input"
                  className="block font-mono text-[11px] uppercase tracking-wider text-[#FDE68A] mb-1.5"
                >
                  QR Scan Code Image (Upload QR Image or Paste Image URL)
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="admin-contrib-qr-input"
                    data-testid="input-contribution-qr"
                    type="text"
                    value={draftCustomQrUrl}
                    onChange={e => setDraftCustomQrUrl(e.target.value)}
                    className="flex-1 min-w-[200px] bg-[#08090B] border border-[#282D34] focus:border-[#38BDF8] rounded-lg px-3 py-2 text-xs text-[#F1F3F5] font-mono focus:outline-none"
                    placeholder="Leave blank to auto-generate QR from UPI ID, or upload your own QR scan code"
                  />
                  <label className="px-3.5 py-2 rounded-lg bg-[#13161A] hover:bg-[#191D22] border border-[#38BDF8]/60 text-xs font-mono font-bold text-[#38BDF8] cursor-pointer flex items-center gap-1.5 shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload QR Scan Code</span>
                    <input
                      data-testid="upload-qr-file-input"
                      type="file"
                      accept="image/*"
                      onChange={handleQrFileUpload}
                      className="hidden"
                    />
                  </label>
                  {draftCustomQrUrl && (
                    <button
                      type="button"
                      data-testid="clear-custom-qr-btn"
                      onClick={() => setDraftCustomQrUrl('')}
                      className="px-3 py-2 rounded-lg bg-[#E04F5F]/15 hover:bg-[#E04F5F]/25 border border-[#E04F5F]/50 text-xs font-mono text-[#E04F5F] cursor-pointer"
                    >
                      Use Auto UPI QR
                    </button>
                  )}
                </div>
              </div>

              {/* Additional Payment Mode Details */}
              <div>
                <label
                  htmlFor="admin-contrib-other-payment-input"
                  className="block font-mono text-[11px] uppercase tracking-wider text-[#D4D8DE] mb-1.5"
                >
                  Additional Payment Mode Details (Optional)
                </label>
                <input
                  id="admin-contrib-other-payment-input"
                  data-testid="input-other-payment-details"
                  type="text"
                  value={draftOtherPaymentDetails}
                  onChange={e => setDraftOtherPaymentDetails(e.target.value)}
                  className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#38BDF8] rounded-lg px-3.5 py-2 text-sm text-[#F1F3F5] font-sans focus:outline-none"
                  placeholder="e.g. GPay / PhonePe / Paytm / Bank details"
                />
              </div>

              {/* Page Title */}
              <div>
                <label
                  htmlFor="admin-contrib-headline-input"
                  className="block font-mono text-[11px] uppercase tracking-wider text-[#D4D8DE] mb-1.5"
                >
                  Contribute Page Title
                </label>
                <input
                  id="admin-contrib-headline-input"
                  data-testid="input-contribution-headline"
                  type="text"
                  value={draftHeadline}
                  onChange={e => setDraftHeadline(e.target.value)}
                  required
                  className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#F59E0B] rounded-lg px-3.5 py-2 text-sm text-[#F1F3F5] font-sans focus:outline-none"
                  placeholder="CONTRIBUTE"
                />
              </div>

              {/* Public Page Note */}
              <div className="md:col-span-2">
                <label
                  htmlFor="admin-contrib-message-input"
                  className="block font-mono text-[11px] uppercase tracking-wider text-[#D4D8DE] mb-1.5"
                >
                  Public Page Note
                </label>
                <input
                  id="admin-contrib-message-input"
                  data-testid="input-contribution-message"
                  type="text"
                  value={draftMessage}
                  onChange={e => setDraftMessage(e.target.value)}
                  className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#F59E0B] rounded-lg px-3.5 py-2 text-sm text-[#F1F3F5] font-sans focus:outline-none"
                  placeholder="GHOST PROTOCOL is 100% free for all users including every feature."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#282D34]">
              <button
                type="submit"
                data-testid="save-contribution-config-btn"
                disabled={savingContribConfig}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#F59E0B] hover:bg-[#D97706] text-[#08090B] font-mono font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingContribConfig ? 'SAVING...' : 'SAVE PAYMENT MODES & UPI / QR'}</span>
              </button>
            </div>
          </form>

          {/* Moderate Recent Squadron Backers Reviews */}
          <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-[#282D34] pb-2.5">
              <span className="font-bold text-[#D4D8DE] uppercase">
                RECENT SQUADRON BACKERS MODERATION ({adminContributions.length})
              </span>
              <span className="text-[10px] text-[#707883]">
                Public wall displays Backer Name & Review only (Amounts anonymous)
              </span>
            </div>

            {adminContributions.length === 0 ? (
              <div className="text-center py-6 text-[#707883]">
                No Squadron Backer entries logged yet.
              </div>
            ) : (
              <div className="divide-y divide-[#282D34]">
                {adminContributions.map(item => (
                  <div
                    key={item.id}
                    className="py-3 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-[#F1F3F5] text-xs">{item.contributorName}</div>
                      <div className="text-[#A0A7B0] text-xs font-sans mt-0.5">
                        {item.note ? `“${item.note}”` : '—'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteContributionEntry(item.id)}
                      aria-label={`Remove backer ${item.contributorName}`}
                      className="px-2.5 py-1.5 rounded bg-[#E04F5F]/15 hover:bg-[#E04F5F]/25 border border-[#E04F5F]/40 text-[#E04F5F] flex items-center gap-1 text-[10px] font-bold cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>REMOVE</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECTION 3: AUDIT LOGS */}
      {/* ========================================================= */}
      {activeSection === 'audit' && (
        <div className="space-y-4 font-mono text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-[#282D34]">
            <span className="font-bold text-[#D4D8DE] uppercase">
              SENSITIVE ACTIONS & ADMINISTRATIVE AUDIT TRAIL ({auditLogs.length})
            </span>
          </div>

          <div className="divide-y divide-[#282D34] border border-[#282D34] rounded-lg overflow-hidden bg-[#0D0F12]">
            {auditLogs.map(log => (
              <div key={log.id} className="p-3.5 space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-[#D4D8DE] font-bold">{log.action}</span>
                  <span className="text-[#707883]">{new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <div className="text-[11px] text-[#A0A7B0]">{log.details}</div>
                <div className="text-[10px] text-[#707883]">Executed by: {log.adminName}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      </AvionicsToggleTransition>

      {/* ========================================================= */}
      {/* OWNER PILOT NICKNAME EDITOR MODAL */}
      {/* ========================================================= */}
      {editingNicknameUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pilot Nickname Manager"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-mono text-xs"
        >
          <div className="bg-[#0D0F12] border border-[#282D34] rounded-xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 bg-[#13161A] border-b border-[#282D34] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-[#191D22] border border-[#42B883]/40 flex items-center justify-center text-[#42B883]">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-[#F1F3F5] text-sm flex items-center gap-2">
                    CHANGE PILOT NICKNAME
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#42B883]/15 text-[#42B883] border border-[#42B883]/30 font-bold uppercase">
                      OWNER CLEARANCE
                    </span>
                  </div>
                  <div className="text-[11px] text-[#A0A7B0]">
                    Customize this pilot's nickname to whatever you want
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  playTacticalClick();
                  setEditingNicknameUser(null);
                }}
                className="text-[#707883] hover:text-[#F1F3F5] p-1.5 rounded hover:bg-[#191D22] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Pilot Target Info */}
              <div className="p-3.5 rounded bg-[#13161A] border border-[#282D34] space-y-2">
                <div className="text-[10px] text-[#707883] uppercase tracking-wider">TARGET PILOT</div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#F1F3F5] text-sm">{editingNicknameUser.fullName}</span>
                  <span className="text-[11px] text-[#AEB5BE]">{editingNicknameUser.motorcycleModel}</span>
                </div>
                <div className="text-[11px] text-[#707883]">
                  Account: {editingNicknameUser.email || editingNicknameUser.id}
                </div>
                <div className="flex items-center gap-2 pt-1.5 border-t border-[#282D34] text-[11px] flex-wrap">
                  <span className="text-[#707883]">CURRENT ACTIVE NICKNAME:</span>
                  <span className="px-2 py-0.5 rounded bg-[#08090B] border border-[#282D34] text-[#42B883] font-bold">
                    {resolveUserDisplayIdentity(editingNicknameUser).secondaryTag || 'F77 PILOT'}
                  </span>
                </div>
              </div>

              {/* Quick Selection Presets */}
              <div className="space-y-1.5">
                <div className="text-[10px] text-[#707883] uppercase tracking-wider flex items-center justify-between">
                  <span>QUICK PRESETS</span>
                  <span className="text-[10px] text-[#AEB5BE]">CLICK TO APPLY</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'F77 PILOT',
                    'X47 PILOT',
                    'SQUADRON LEADER',
                    'TOP GUN',
                    'TEST PILOT',
                    'VANGUARD 01',
                    'STEALTH PILOT',
                    'GHOST 01'
                  ].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        playTacticalClick();
                        setNicknameInput(preset);
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors border cursor-pointer ${
                        nicknameInput.toUpperCase() === preset
                          ? 'bg-[#42B883]/20 text-[#42B883] border-[#42B883] font-bold'
                          : 'bg-[#13161A] text-[#AEB5BE] border-[#282D34] hover:border-[#414851] hover:text-[#F1F3F5]'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-[#D4D8DE] uppercase tracking-wider font-bold">
                    CUSTOM NICKNAME (WHATEVER YOU WANT)
                  </span>
                  <span className="text-[#707883]">{nicknameInput.length}/40 CHARS</span>
                </div>
                <input
                  type="text"
                  maxLength={40}
                  value={nicknameInput}
                  onChange={e => {
                    setNicknameInput(e.target.value);
                    setNicknameError(null);
                  }}
                  placeholder="Type any nickname (e.g. SQUADRON ACE, SHADOW 9, APEX...)"
                  className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#42B883] rounded p-2.5 text-xs text-[#F1F3F5] placeholder-[#707883] focus:outline-none font-mono"
                />
                <div className="text-[10px] text-[#707883] leading-relaxed">
                  As Website Owner, you have full clearance to set any nickname. This replaces 'F77 PILOT' or 'X47 PILOT' across discussions, squadron telemetry, and badges.
                </div>
              </div>

              {/* Live Preview */}
              <div className="p-3.5 rounded bg-[#13161A] border border-[#282D34] space-y-1.5">
                <div className="text-[10px] text-[#707883] uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-[#42B883]" />
                  <span>LIVE BADGE PREVIEW</span>
                </div>
                <div className="p-2.5 rounded bg-[#08090B] border border-[#282D34] flex items-center gap-2">
                  <UserIdentityBadge
                    user={{
                      ...editingNicknameUser,
                      customSecondaryTag: nicknameInput.trim() || null,
                      secondaryTag: nicknameInput.trim() || resolveUserDisplayIdentity(editingNicknameUser).secondaryTag
                    }}
                    showRoleBadge
                    size="sm"
                  />
                </div>
              </div>

              {/* Error Feedback */}
              {nicknameError && (
                <div className="p-2.5 rounded bg-[#E04F5F]/15 border border-[#E04F5F]/40 text-[#E04F5F] text-[11px] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{nicknameError}</span>
                </div>
              )}

              {/* Success Feedback */}
              {nicknameSuccessMessage && (
                <div className="p-2.5 rounded bg-[#42B883]/15 border border-[#42B883]/40 text-[#42B883] text-[11px] flex items-center gap-2 font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{nicknameSuccessMessage}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[#13161A] border-t border-[#282D34] flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleSaveNickname('', true)}
                disabled={savingNickname}
                className="px-3 py-1.5 rounded bg-[#E04F5F]/15 hover:bg-[#E04F5F]/25 text-[#E04F5F] border border-[#E04F5F]/40 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                title="Restore default motorcycle model nickname (F77 PILOT / X47 PILOT)"
              >
                RESTORE DEFAULT (RESET)
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    playTacticalClick();
                    setEditingNicknameUser(null);
                  }}
                  disabled={savingNickname}
                  className="px-3.5 py-1.5 rounded bg-[#191D22] hover:bg-[#252A30] text-[#AEB5BE] hover:text-[#F1F3F5] text-xs transition-colors cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveNickname(nicknameInput)}
                  disabled={savingNickname || !nicknameInput.trim()}
                  className="px-4 py-1.5 rounded bg-[#42B883] hover:bg-[#389d6f] text-[#08090B] font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_12px_rgba(66,184,131,0.25)] disabled:opacity-50"
                >
                  {savingNickname ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>SAVING...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>SAVE NICKNAME</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: PERMANENT USER REMOVAL FROM DATABASE (ADMIN & OWNER) */}
      {/* ========================================================= */}
      {removingUser && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="confirm-remove-user-modal"
          aria-label={`Permanently remove user ${removingUser.fullName}`}
          className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-mono"
        >
          <div className="w-full max-w-lg bg-[#0D0F12] border border-[#E04F5F]/60 rounded-lg shadow-2xl overflow-hidden text-xs text-[#F1F3F5]">
            <div className="px-5 py-3.5 bg-[#13161A] border-b border-[#282D34] flex items-center justify-between">
              <div className="flex items-center space-x-2 text-[#E04F5F]">
                <Trash2 className="w-4 h-4" />
                <span className="font-bold tracking-wider uppercase text-xs">
                  PERMANENT DATABASE ACCOUNT REMOVAL
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!removingInProgress) {
                    setRemovingUser(null);
                    setRemovalError(null);
                  }
                }}
                className="p-1 rounded text-[#707883] hover:text-[#F1F3F5]"
                aria-label="Close permanent removal modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3.5 rounded bg-[#E04F5F]/10 border border-[#E04F5F]/35 text-[#F1F3F5] space-y-1.5">
                <div className="font-bold text-[#E04F5F] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>IRREVERSIBLE DATABASE DELETION</span>
                </div>
                <p className="text-[11px] text-[#D4D8DE] leading-relaxed">
                  You are about to permanently remove this user from the GHOST PROTOCOL database (not merely suspend them). Their account record will be erased, active sessions immediately revoked, and the deletion logged in the security audit trail.
                </p>
              </div>

              <div className="p-3.5 rounded bg-[#13161A] border border-[#282D34] space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <UserIdentityBadge user={removingUser} showRoleBadge size="sm" />
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#252A30] text-[#A0A7B0] uppercase">
                    ID: {removingUser.id}
                  </span>
                </div>
                <div className="text-[11px] text-[#A0A7B0] pt-1">
                  {removingUser.motorcycleModel} • {removingUser.variant} • Reg: {removingUser.registrationNumber || 'Pending'}
                </div>
                <div className="text-[10px] text-[#707883]">
                  Email: {removingUser.email || 'Unlisted'} • Mobile: {removingUser.mobile || 'Unregistered'} • Status: {removingUser.verificationStatus.toUpperCase()}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] text-[#A0A7B0] uppercase font-bold tracking-wider">
                  AUDIT LOG REMOVAL REASON (OPTIONAL)
                </label>
                <input
                  type="text"
                  data-testid="input-permanent-remove-reason"
                  maxLength={200}
                  value={removalReason}
                  onChange={e => setRemovalReason(e.target.value)}
                  placeholder="e.g. Duplicate account, fraudulent registration, policy violation..."
                  className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#E04F5F] rounded p-2.5 text-xs text-[#F1F3F5] placeholder-[#707883] focus:outline-none font-mono"
                />
              </div>

              {removalError && (
                <div className="p-2.5 rounded bg-[#E04F5F]/15 border border-[#E04F5F]/40 text-[#E04F5F] text-[11px] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{removalError}</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-[#13161A] border-t border-[#282D34] flex items-center justify-end gap-2">
              <button
                type="button"
                data-testid="cancel-permanent-remove-btn"
                disabled={removingInProgress}
                onClick={() => {
                  playTacticalClick();
                  setRemovingUser(null);
                  setRemovalError(null);
                }}
                className="px-3.5 py-1.5 rounded bg-[#191D22] hover:bg-[#252A30] text-[#AEB5BE] hover:text-[#F1F3F5] text-xs transition-colors cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                data-testid="confirm-permanent-remove-btn"
                disabled={removingInProgress}
                onClick={handleConfirmPermanentRemoveUser}
                className="px-4 py-1.5 rounded bg-[#E04F5F] hover:bg-[#c93f4e] text-[#F1F3F5] font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_12px_rgba(224,79,95,0.35)] disabled:opacity-50"
              >
                {removingInProgress ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>REMOVING FROM DB...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>CONFIRM PERMANENT REMOVAL</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

