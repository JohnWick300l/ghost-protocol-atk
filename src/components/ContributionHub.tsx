import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Heart,
  Shield,
  Copy,
  Check,
  ExternalLink,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Coffee,
  Utensils,
  Sliders,
  Smartphone,
  CreditCard,
  ArrowDownCircle,
  Maximize2,
  X,
  Clock,
  XCircle,
  ShieldAlert,
  BadgeCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import {
  CONTRIBUTION_OPTIONS,
  DEFAULT_CONTRIBUTION_CONFIG,
  ACTIVE_RECIPIENT_UPI_NUMBER,
  ACTIVE_RECIPIENT_COUNTRY_CODE,
  maskUpiMobileNumber,
  resolveActiveUpiNumberToDestination,
  generateUpiTransactionRef,
  isConfirmedContributionRecord,
  validateUpiUtrNumber,
  sanitizeContributionConfig,
  redactContributionForPublicWall,
  buildUpiPaymentUri,
  buildUpiAppLaunchIntentUri,
  openUpiAppForNumberLookup,
  getUpiNumberLookupInstructions,
  validateContributionSubmission,
  canEditContributionPage,
  isAdminOrOwnerAccount,
  type ContributionConfig,
  type ContributionOptionId,
  type ContributionRecord,
  type PaymentTransactionStatus,
  type UpiAppTarget,
  type UpiNumberResolutionResult
} from '../utils/rules';
import {
  CACHE_KEYS,
  saveToCache,
  loadFromCache,
  getSessionAuthHeaders,
  gpApiFetch
} from '../utils/telemetryCache';
import { AvionicsToggleTransition, AnimatePresence, motion } from './AvionicsTransition';
import QRCode from 'qrcode';

interface ContributionHubProps {
  onBackToCockpit?: () => void;
}

/**
 * Generates a real, camera-scannable ISO/IEC 18004 QR code matrix from the UPI URI string
 * (`upi://pay?pa=...&am=...&cu=INR`) so scanning with GPay, PhonePe, Paytm, or BHIM
 * opens the payment screen with the exact recipient UPI ID and amount pre-filled.
 */
function buildDeterministicQrMatrix(payload: string): boolean[][] {
  try {
    const qr = QRCode.create(payload || 'upi://pay', { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    const data = qr.modules.data;
    const grid: boolean[][] = [];
    for (let r = 0; r < size; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < size; c++) {
        row.push(Boolean(data[r * size + c]));
      }
      grid.push(row);
    }
    return grid;
  } catch {
    return [[true]];
  }
}

export const ContributionHub: React.FC<ContributionHubProps> = ({ onBackToCockpit: _onBackToCockpit }) => {
  const { currentUser } = useAuth();
  const { playTacticalClick, playChime, reducedMotion } = useAudio();

  const isAdminOrOwner = useMemo(
    () => canEditContributionPage(currentUser) || isAdminOrOwnerAccount(currentUser),
    [currentUser]
  );

  const [config, setConfig] = useState<ContributionConfig>(() => {
    const cached = loadFromCache<ContributionConfig>(CACHE_KEYS.CONTRIBUTION_CONFIG);
    return sanitizeContributionConfig(cached?.data, DEFAULT_CONTRIBUTION_CONFIG);
  });

  const [contributions, setContributions] = useState<Omit<ContributionRecord, 'amountInr' | 'utrNumber'>[]>(() => {
    const cached = loadFromCache<ContributionRecord[]>(CACHE_KEYS.CONTRIBUTIONS);
    return Array.isArray(cached?.data)
      ? cached.data
          .filter(item => isConfirmedContributionRecord(item))
          .map(item => redactContributionForPublicWall(item))
      : [];
  });

  // Admin / Owner full contribution list (includes UNVERIFIED entries for verification)
  const [adminContributions, setAdminContributions] = useState<ContributionRecord[]>([]);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // 3 Contribution Options state: 'chai' (20 Rs), 'biryani' (200 Rs), 'custom' (We accept anything 😂)
  const [selectedOption, setSelectedOption] = useState<ContributionOptionId>('chai');
  const [customAmountInput, setCustomAmountInput] = useState<string>('100');

  // Active Payment Mode tab on the payment terminal
  const [activePaymentTab, setActivePaymentTab] = useState<'qr' | 'upi' | 'link'>('qr');

  // Enlarge QR Modal state
  const [showEnlargedQr, setShowEnlargedQr] = useState<boolean>(false);

  // Mobile-Number-First Active UPI Number Resolution & Transaction State Machine
  const [activeResolution, setActiveResolution] = useState<UpiNumberResolutionResult | null>(null);
  const [activeTransactionRef, setActiveTransactionRef] = useState<string>('');
  const [transactionStatus, setTransactionStatus] = useState<PaymentTransactionStatus | null>(null);
  const [selectedUpiApp, setSelectedUpiApp] = useState<UpiAppTarget | null>(null);
  const [appLaunchError, setAppLaunchError] = useState<string | null>(null);
  const [usingFallbackUpiIdNotice, setUsingFallbackUpiIdNotice] = useState<boolean>(false);
  const [copiedUpiNumber, setCopiedUpiNumber] = useState<boolean>(false);

  // Backer review & UTR verification form state
  const [contributorName, setContributorName] = useState<string>(currentUser?.fullName || '');
  const [contributorNote, setContributorNote] = useState<string>('');
  const [contributorUtr, setContributorUtr] = useState<string>('');
  const [submittingContribution, setSubmittingContribution] = useState(false);
  const [submissionFeedback, setSubmissionFeedback] = useState<{
    type: 'success' | 'error' | 'unverified';
    text: string;
  } | null>(null);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [launchedUpiAppLabel, setLaunchedUpiAppLabel] = useState<string | null>(null);

  const upiAppsSectionRef = useRef<HTMLDivElement | null>(null);
  const customAmountInputRef = useRef<HTMLInputElement | null>(null);
  const utrInputRef = useRef<HTMLInputElement | null>(null);
  const [highlightUpiApps, setHighlightUpiApps] = useState(false);
  const [customAmountError, setCustomAmountError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser?.fullName && !contributorName) {
      setContributorName(currentUser.fullName);
    }
  }, [currentUser]);

  // Keep activePaymentTab aligned with enabled payment modes
  useEffect(() => {
    if (activePaymentTab === 'qr' && !config.enableQrScan) {
      if (config.enableUpiId) setActivePaymentTab('upi');
      else if (config.enablePaymentLink) setActivePaymentTab('link');
    } else if (activePaymentTab === 'upi' && !config.enableUpiId) {
      if (config.enableQrScan) setActivePaymentTab('qr');
      else if (config.enablePaymentLink) setActivePaymentTab('link');
    } else if (activePaymentTab === 'link' && !config.enablePaymentLink) {
      if (config.enableQrScan) setActivePaymentTab('qr');
      else if (config.enableUpiId) setActivePaymentTab('upi');
    }
  }, [config.enableQrScan, config.enableUpiId, config.enablePaymentLink, activePaymentTab]);

  const fetchContributionData = async () => {
    try {
      const res = await gpApiFetch('/api/contributions', {
        credentials: 'same-origin',
        headers: getSessionAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          const normalized = sanitizeContributionConfig(data.config, DEFAULT_CONTRIBUTION_CONFIG);
          setConfig(normalized);
          saveToCache(CACHE_KEYS.CONTRIBUTION_CONFIG, normalized, { silent: true });
        }
        if (Array.isArray(data.contributions)) {
          const confirmedOnly = data.contributions
            .filter((item: ContributionRecord) => isConfirmedContributionRecord(item))
            .map((item: ContributionRecord) => redactContributionForPublicWall(item));
          setContributions(confirmedOnly);
          saveToCache(CACHE_KEYS.CONTRIBUTIONS, confirmedOnly, { silent: true });
        }
        if (Array.isArray(data.adminContributions)) {
          setAdminContributions(data.adminContributions);
        }
      }
    } catch {
      // Serve from local cache when offline
    }
  };

  useEffect(() => {
    void fetchContributionData();
  }, [currentUser?.id]);

  // Sync transaction status to backend
  const updateServerTransactionStatus = async (
    tr: string,
    status: PaymentTransactionStatus,
    failureReason?: string
  ) => {
    if (!tr) return;
    try {
      await gpApiFetch('/api/contributions/transaction-status', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ tr, status, failureReason })
      });
    } catch {
      // Ignore offline sync errors
    }
  };

  // Listen for native Android MainActivity UPI result & app unavailability callbacks
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleNativeUpiResult = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const rawStatus = String(detail.status || 'PENDING').toUpperCase() as PaymentTransactionStatus;
      const approvalRefNo = String(detail.approvalRefNo || '').trim();

      if (approvalRefNo && /^\d{12}$/.test(approvalRefNo)) {
        setContributorUtr(approvalRefNo);
      }

      if (rawStatus === 'FAILED') {
        setTransactionStatus('FAILED');
        setAppLaunchError(
          'The UPI application reported that the payment could not be completed. If you saw a Google Pay / PSP UPI Risk Policy warning on the direct link, please scan the verified QR code or pay directly to Active UPI Number 9019884970 inside your UPI app.'
        );
        if (activeTransactionRef) {
          void updateServerTransactionStatus(activeTransactionRef, 'FAILED', 'Native UPI app returned FAILURE');
        }
      } else if (rawStatus === 'CANCELLED') {
        setTransactionStatus('CANCELLED');
        if (activeTransactionRef) {
          void updateServerTransactionStatus(activeTransactionRef, 'CANCELLED', 'Cancelled by user in UPI app');
        }
      } else if (rawStatus === 'UNVERIFIED') {
        setTransactionStatus('UNVERIFIED');
        if (activeTransactionRef) {
          void updateServerTransactionStatus(activeTransactionRef, 'UNVERIFIED');
        }
      } else {
        setTransactionStatus('PENDING');
      }
    };

    const handleNativeAppUnavailable = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const pkg = String(detail.package || '');
      const appName = pkg.includes('nbu.paisa')
        ? 'Google Pay'
        : pkg.includes('phonepe')
        ? 'PhonePe'
        : pkg.includes('paytm')
        ? 'Paytm'
        : 'The selected UPI app';
      setTransactionStatus('FAILED');
      setAppLaunchError(
        `${appName} is not installed or unavailable on this device. Please select another UPI app or scan the verified QR code.`
      );
      if (activeTransactionRef) {
        void updateServerTransactionStatus(
          activeTransactionRef,
          'FAILED',
          `${appName} unavailable on device`
        );
      }
    };

    window.addEventListener('ghost-upi-payment-result', handleNativeUpiResult);
    window.addEventListener('ghost-upi-app-unavailable', handleNativeAppUnavailable);
    return () => {
      window.removeEventListener('ghost-upi-payment-result', handleNativeUpiResult);
      window.removeEventListener('ghost-upi-app-unavailable', handleNativeAppUnavailable);
    };
  }, [activeTransactionRef]);

  const effectiveAmountInr = useMemo(() => {
    if (selectedOption === 'chai') return 20;
    if (selectedOption === 'biryani') return 200;
    const parsed = Math.round(Number(customAmountInput));
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return parsed;
  }, [selectedOption, customAmountInput]);

  const recipientMobile = config.recipientMobileNumber || ACTIVE_RECIPIENT_UPI_NUMBER;
  const recipientCountryCode = config.recipientCountryCode || ACTIVE_RECIPIENT_COUNTRY_CODE;
  const maskedMobileDisplay = useMemo(
    () => maskUpiMobileNumber(recipientMobile, recipientCountryCode),
    [recipientMobile, recipientCountryCode]
  );

  const scrollToUpiAppsSection = () => {
    setHighlightUpiApps(true);
    setTimeout(() => {
      upiAppsSectionRef.current?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'center'
      });
    }, 90);
    setTimeout(() => {
      setHighlightUpiApps(false);
    }, 2400);
  };

  const handleSelectOption = (optionId: ContributionOptionId) => {
    playTacticalClick();
    setCustomAmountError(null);
    setSelectedOption(optionId);

    if (optionId === 'chai' || optionId === 'biryani') {
      scrollToUpiAppsSection();
    } else if (optionId === 'custom') {
      setTimeout(() => {
        customAmountInputRef.current?.focus();
      }, 120);
    }
  };

  const handleCustomAmountSubmit = () => {
    playTacticalClick();
    const rawNum = Number(customAmountInput);
    if (!Number.isFinite(rawNum) || rawNum < 1) {
      setCustomAmountError('Please enter a valid positive INR amount (minimum 1 Rs).');
      return;
    }
    if (!Number.isInteger(rawNum)) {
      setCustomAmountError('Please enter a whole INR amount without decimals.');
      return;
    }
    const parsed = Math.round(rawNum);
    setCustomAmountError(null);
    setCustomAmountInput(String(parsed));
    scrollToUpiAppsSection();
  };

  // Fallback Copy UPI ID handler (explicitly informs contributor when fallback UPI ID is used)
  const handleCopyUpi = async () => {
    playTacticalClick();
    try {
      await navigator.clipboard.writeText(config.upiId);
    } catch {
      // Fallback if clipboard API is restricted
    }
    setCopiedUpi(true);
    setUsingFallbackUpiIdNotice(true);
    setTimeout(() => setCopiedUpi(false), 2600);
  };

  // Copy Active UPI Number (9019884970) for direct in-app mobile number transfer
  const handleCopyActiveUpiNumber = async () => {
    playTacticalClick();
    try {
      await navigator.clipboard.writeText(recipientMobile);
    } catch {
      // Fallback if clipboard API is restricted
    }
    setCopiedUpiNumber(true);
    setTimeout(() => setCopiedUpiNumber(false), 3000);
  };

  /**
   * Mobile-Number Lookup-Based UPI Payment Workflow:
   * 1. Validates the selected contribution amount (INR).
   * 2. Copies the registered Active UPI Number (9019884970) to the clipboard.
   * 3. Performs a local configuration lookup (POST /api/upi/resolve-number) to log an INITIATED transaction ref (tr).
   * 4. Opens the selected UPI app (Google Pay, PhonePe, or Paytm) via standard Android package launch
   *    WITHOUT launching an unsigned personal-VPA `upi://pay` intent as the default method.
   * 5. Displays step-by-step instructions to search the copied number (9019884970), verify the recipient name,
   *    manually enter the selected INR amount, complete the UPI PIN transfer, and return to submit the 12-digit UTR.
   */
  const handleLaunchUpiApp = async (app: UpiAppTarget) => {
    playTacticalClick();
    setAppLaunchError(null);
    setUsingFallbackUpiIdNotice(false);
    setSelectedUpiApp(app);

    // Validate amount before initiating
    if (!Number.isFinite(effectiveAmountInr) || effectiveAmountInr < 1) {
      setAppLaunchError('Invalid contribution amount. Please select a valid INR amount (>= 1 Rs).');
      setTransactionStatus('FAILED');
      return;
    }

    const appLabel =
      app === 'gpay'
        ? 'Google Pay (GPay)'
        : app === 'phonepe'
        ? 'PhonePe'
        : app === 'paytm'
        ? 'Paytm'
        : 'UPI App (Copy UPI Number)';

    setTransactionStatus('INITIATED');

    // Copy 9019884970 to the clipboard immediately for the Mobile-Number Lookup workflow
    try {
      await navigator.clipboard.writeText(recipientMobile);
      setCopiedUpiNumber(true);
      setTimeout(() => setCopiedUpiNumber(false), 4500);
    } catch {
      // Ignore clipboard restriction
    }

    // Perform local configuration lookup and log an auditable INITIATED transaction record
    let resolution: UpiNumberResolutionResult;
    let txRef = generateUpiTransactionRef('GP');

    try {
      const res = await gpApiFetch('/api/upi/resolve-number', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          mobileNumber: recipientMobile,
          countryCode: recipientCountryCode,
          targetApp: app,
          optionId: selectedOption,
          amountInr: effectiveAmountInr
        })
      });
      if (res.ok) {
        const data = await res.json();
        resolution = data;
        if (data.transactionRef) {
          txRef = data.transactionRef;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setTransactionStatus('FAILED');
        setAppLaunchError(
          errData.error ||
            'Local configuration lookup failed. You may scan the QR code or copy the fallback UPI ID below.'
        );
        return;
      }
    } catch {
      resolution = resolveActiveUpiNumberToDestination({
        mobileNumber: recipientMobile,
        countryCode: recipientCountryCode,
        targetApp: app,
        config
      });
    }

    if (!resolution.resolved) {
      setTransactionStatus('FAILED');
      setAppLaunchError(
        resolution.error ||
          'Local configuration lookup failed. Please scan the QR code or copy the fallback UPI ID.'
      );
      return;
    }

    setActiveResolution(resolution);
    setActiveTransactionRef(txRef);
    setLaunchedUpiAppLabel(appLabel);
    setTransactionStatus('PENDING');
    void updateServerTransactionStatus(txRef, 'PENDING');

    // Open Google Pay, PhonePe, or Paytm via standard Android package launch (never launching unsigned personal-VPA intent)
    if (app === 'gpay' || app === 'phonepe' || app === 'paytm') {
      openUpiAppForNumberLookup(app);
    }
  };

  const upiUri = useMemo(
    () =>
      buildUpiPaymentUri({
        upiId: config.upiId,
        amountInr: effectiveAmountInr,
        note:
          selectedOption === 'chai'
            ? 'Ghost Protocol Chai Contribution'
            : selectedOption === 'biryani'
            ? 'Ghost Protocol Biryani Contribution'
            : 'Ghost Protocol Contribution'
      }),
    [config.upiId, effectiveAmountInr, selectedOption]
  );

  const qrMatrix = useMemo(() => buildDeterministicQrMatrix(upiUri), [upiUri]);

  const handleContributionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    playTacticalClick();
    setSubmissionFeedback(null);

    // Validate 12-digit UTR number for payment verification
    const utrValidation = validateUpiUtrNumber(contributorUtr);
    if (!utrValidation.valid || !utrValidation.utr) {
      setSubmissionFeedback({
        type: 'error',
        text: utrValidation.error || 'Please enter your 12-digit UPI UTR / Reference Number.'
      });
      utrInputRef.current?.focus();
      return;
    }

    const paymentMethodLabel =
      selectedUpiApp === 'gpay'
        ? 'UPI Number (GPay)'
        : selectedUpiApp === 'phonepe'
        ? 'UPI Number (PhonePe)'
        : selectedUpiApp === 'paytm'
        ? 'UPI Number (Paytm)'
        : selectedUpiApp === 'upi'
        ? 'UPI Number (Instant)'
        : activePaymentTab === 'qr'
        ? 'UPI QR Scan'
        : activePaymentTab === 'upi'
        ? 'UPI ID'
        : 'Payment Link / Other';

    const validation = validateContributionSubmission({
      contributorName,
      contributorModel: currentUser?.motorcycleModel || 'Squadron Backer',
      optionId: selectedOption,
      amountInr: selectedOption === 'custom' ? Number(customAmountInput) : effectiveAmountInr,
      paymentMethod: paymentMethodLabel,
      note: contributorNote,
      utrNumber: utrValidation.utr,
      requireUtr: true,
      transactionReference: activeTransactionRef || undefined
    });

    if (!validation.valid || !validation.value) {
      setSubmissionFeedback({
        type: 'error',
        text: validation.error || 'Please check your contribution details.'
      });
      return;
    }

    setSubmittingContribution(true);
    const clientRequestId = `contrib_req_${Date.now()}`;

    try {
      const res = await gpApiFetch('/api/contributions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...validation.value,
          clientRequestId
        })
      });

      if (res.ok) {
        const data = await res.json();
        playChime();
        setContributorNote('');
        setContributorUtr('');
        setTransactionStatus('UNVERIFIED');

        // Refresh admin queue if owner/admin is viewing
        if (isAdminOrOwner) {
          void fetchContributionData();
        }

        // Only add to public wall if server explicitly confirmed it as SUCCESS
        if (data.contribution && data.verificationStatus === 'SUCCESS') {
          const publicEntry = redactContributionForPublicWall(data.contribution);
          const nextList = [
            publicEntry,
            ...contributions.filter(c => c.id !== publicEntry.id)
          ];
          setContributions(nextList);
          saveToCache(CACHE_KEYS.CONTRIBUTIONS, nextList);
        }

        setSubmissionFeedback({
          type: 'unverified',
          text: `UTR ${utrValidation.utr} recorded as UNVERIFIED for ${validation.value.contributorName}. Your contribution will appear on the confirmed Squadron Backers list as soon as the UTR is verified.`
        });
      } else {
        const errData = await res.json().catch(() => ({}));
        setSubmissionFeedback({
          type: 'error',
          text: errData.error || 'Could not log contribution. Please verify your UTR and try again.'
        });
      }
    } catch {
      setSubmissionFeedback({
        type: 'error',
        text: 'Network unreachable: UTR verification requires a live server connection so duplicate UTRs can be checked.'
      });
    } finally {
      setSubmittingContribution(false);
    }
  };

  // Admin / Website Owner verification handler
  const handleAdminVerifyContribution = async (
    contributionId: string,
    nextStatus: PaymentTransactionStatus
  ) => {
    playTacticalClick();
    setVerifyingId(contributionId);
    try {
      const res = await gpApiFetch(`/api/contributions/${contributionId}/verify`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        playChime();
        await fetchContributionData();
      }
    } finally {
      setVerifyingId(null);
    }
  };

  const renderStatusBadge = (status: PaymentTransactionStatus) => {
    switch (status) {
      case 'INITIATED':
        return (
          <span
            data-testid="payment-status-badge"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/50 text-sky-300 font-mono text-[10px] font-bold uppercase"
          >
            <Clock className="w-3 h-3" />
            INITIATED
          </span>
        );
      case 'PENDING':
        return (
          <span
            data-testid="payment-status-badge"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 font-mono text-[10px] font-bold uppercase"
          >
            <Clock className="w-3 h-3 animate-spin" />
            PENDING IN UPI APP
          </span>
        );
      case 'UNVERIFIED':
        return (
          <span
            data-testid="payment-status-badge"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/20 border border-purple-400/50 text-purple-300 font-mono text-[10px] font-bold uppercase"
          >
            <ShieldAlert className="w-3 h-3" />
            UNVERIFIED (AWAITING UTR CHECK)
          </span>
        );
      case 'SUCCESS':
        return (
          <span
            data-testid="payment-status-badge"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-mono text-[10px] font-bold uppercase"
          >
            <BadgeCheck className="w-3 h-3" />
            SUCCESS (VERIFIED)
          </span>
        );
      case 'FAILED':
        return (
          <span
            data-testid="payment-status-badge"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 border border-rose-400/50 text-rose-300 font-mono text-[10px] font-bold uppercase"
          >
            <XCircle className="w-3 h-3" />
            FAILED
          </span>
        );
      case 'CANCELLED':
        return (
          <span
            data-testid="payment-status-badge"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-700/50 border border-slate-500/50 text-slate-300 font-mono text-[10px] font-bold uppercase"
          >
            <X className="w-3 h-3" />
            CANCELLED
          </span>
        );
    }
  };

  return (
    <div
      data-testid="contribution-hub-page"
      className="space-y-6 text-[#F8FAFC] pb-12"
    >
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#050811] border border-[#1E2D42] rounded-xl px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.85)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#F59E0B]/25 to-[#D97706]/10 border border-[#F59E0B]/70 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)]">
              <Heart className="w-4 h-4 text-[#FDE68A] fill-[#F59E0B]" />
            </div>
            <div>
              <h1
                data-testid="contribution-public-headline"
                className="font-sans font-bold text-sm sm:text-base tracking-wider uppercase text-[#F8FAFC]"
              >
                {config.headline || 'CONTRIBUTE'}
              </h1>
              <div className="font-mono text-[10px] text-[#38BDF8]">
                100% Free App & Features for All Users · Optional Community Support
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Clean Public Note Banner */}
      {config.creatorMessage && (
        <div
          data-testid="contribution-public-message"
          className="rounded-xl bg-[#070C18] border border-[#1E2D42] px-4 py-3 text-xs sm:text-sm text-[#CBD5E1] font-sans flex items-center justify-between gap-3"
        >
          <span>{config.creatorMessage}</span>
        </div>
      )}

      {/* =====================================================================
          MAIN INTERACTIVE CONTRIBUTION & PAYMENT MODES GRID
          ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Columns: 3 Contribution Options + Backer Review & UTR Verification Form */}
        <div className="lg:col-span-7 space-y-6">
          {/* Step 1: 3 Multiple Options (Chai 20 Rs, Biryani 200 Rs, Custom: We accept anything 😂) */}
          <div className="bg-[#050811] border border-[#1E2D42] rounded-xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-sans font-bold text-sm sm:text-base uppercase tracking-wider text-[#F8FAFC] flex items-center gap-2">
                <Heart className="w-4 h-4 text-[#F59E0B]" />
                <span>1. Pick an Option to Contribute</span>
              </h2>
              <span className="font-mono text-[11px] text-[#38BDF8]">ALL FEATURES 100% FREE</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {CONTRIBUTION_OPTIONS.map(opt => {
                const isSelected = selectedOption === opt.id;
                const IconComponent =
                  opt.id === 'chai' ? Coffee : opt.id === 'biryani' ? Utensils : Sliders;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`contribution-option-${opt.id}`}
                    onClick={() => handleSelectOption(opt.id)}
                    className={`relative p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-gradient-to-b from-[#F59E0B]/25 to-[#090F1C] border-[#F59E0B] shadow-[0_0_20px_rgba(245,158,11,0.28)]'
                        : 'bg-[#080D18] hover:bg-[#0D1526] border-[#1E2D42] hover:border-[#38BDF8]/50'
                    }`}
                  >
                    {isSelected && (
                      <motion.span
                        layoutId="contribution-option-active-ring"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="pointer-events-none absolute inset-0 rounded-xl border-2 border-[#F59E0B] shadow-[0_0_18px_rgba(245,158,11,0.3)]"
                      />
                    )}
                    <div className="relative z-10 flex items-center justify-between w-full">
                      <div className="w-9 h-9 rounded-lg bg-[#03060C] border border-[#1E2D42] flex items-center justify-center">
                        <IconComponent className="w-4 h-4 text-[#F59E0B]" />
                      </div>
                      <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-[#020408] border border-[#1E2D42] text-[#FDE68A]">
                        {opt.id === 'chai'
                          ? '20 Rs'
                          : opt.id === 'biryani'
                          ? '200 Rs'
                          : 'Any Amount'}
                      </span>
                    </div>

                    <div className="relative z-10">
                      <div className="font-sans font-bold text-sm text-[#F8FAFC] flex items-center gap-1.5 flex-wrap">
                        <span>{opt.label}</span>
                        {opt.id === 'chai' && (
                          <span
                            data-testid="animated-emoji-chai"
                            role="img"
                            aria-label="Steaming hot tea"
                            className="inline-block text-lg animate-bounce select-none"
                          >
                            ☕
                          </span>
                        )}
                        {opt.id === 'biryani' && (
                          <span
                            data-testid="animated-emoji-biryani"
                            role="img"
                            aria-label="Yummy face"
                            className="inline-block text-lg animate-bounce select-none"
                          >
                            😋
                          </span>
                        )}
                        {opt.id === 'custom' && (
                          <span
                            data-testid="animated-emoji-laughing"
                            role="img"
                            aria-label="Laughing face"
                            className="inline-block text-lg animate-bounce select-none"
                          >
                            😂
                          </span>
                        )}
                      </div>
                      <div
                        data-testid={`contribution-option-subtitle-${opt.id}`}
                        className="font-mono text-[11px] text-[#94A3B8] mt-1 flex items-center gap-1"
                      >
                        <span data-testid={opt.id === 'custom' ? 'custom-accept-anything-text' : undefined}>
                          {opt.subtitle}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom Amount Input shown when Custom option is active with Enter/Exit Animation */}
            <AnimatePresence initial={false}>
              {selectedOption === 'custom' && (
                <motion.div
                  key="custom-amount-drawer"
                  data-testid="custom-amount-panel"
                  initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: reducedMotion ? 0.1 : 0.24, ease: [0.16, 1, 0.3, 1] }}
                  className="pt-2 bg-[#080E1C] border border-[#F59E0B]/50 rounded-xl p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="custom-contribution-amount"
                      className="block font-mono text-[11px] uppercase tracking-wider text-[#FDE68A]"
                    >
                      Enter Any Custom Amount (Rs)
                    </label>
                    <span className="font-mono text-[11px] text-[#94A3B8]">
                      Min 1 Rs · INR
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <div className="relative flex-1">
                      <input
                        ref={customAmountInputRef}
                        id="custom-contribution-amount"
                        data-testid="input-contribution-amount"
                        type="number"
                        min={1}
                        step={1}
                        value={customAmountInput}
                        onChange={e => {
                          setCustomAmountInput(e.target.value);
                          if (customAmountError) setCustomAmountError(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCustomAmountSubmit();
                          }
                        }}
                        className="w-full bg-[#020408] border border-[#1E2D42] focus:border-[#F59E0B] rounded-lg pl-3.5 pr-12 py-2.5 font-mono font-bold text-base text-[#F8FAFC] focus:outline-none"
                        placeholder="Enter any amount in Rs"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-xs text-[#F59E0B]">
                        Rs
                      </span>
                    </div>
                    <button
                      type="button"
                      data-testid="submit-custom-amount-btn"
                      onClick={handleCustomAmountSubmit}
                      className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#F59E0B] to-[#D97706] hover:from-[#FBBF24] hover:to-[#F59E0B] text-[#020408] font-mono font-extrabold text-xs uppercase tracking-wider shadow-[0_0_16px_rgba(245,158,11,0.35)] flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
                    >
                      <span>Submit</span>
                      <ArrowDownCircle className="w-4 h-4" />
                    </button>
                  </div>
                  {customAmountError && (
                    <div className="text-[11px] font-mono text-[#FCA5A5] flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-[#EF4444] shrink-0" />
                      <span>{customAmountError}</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Step 3: Verify Payment via 12-Digit UTR & Add Name to Squadron Backers */}
          <form
            onSubmit={handleContributionSubmit}
            className="bg-[#050811] border border-[#1E2D42] rounded-xl p-5 sm:p-6 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#141E2E] pb-3">
              <h2 className="font-sans font-bold text-sm sm:text-base uppercase tracking-wider text-[#F8FAFC] flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#38BDF8]" />
                <span>3. Verify UPI UTR & Join Squadron Backers</span>
              </h2>
              <span className="font-mono text-[10px] text-[#10B981]">
                Verified Backers Only · Amount Anonymous
              </span>
            </div>

            {submissionFeedback && (
              <div
                data-testid="contribution-submit-feedback"
                className={`p-3.5 rounded-lg border text-xs font-mono flex items-start gap-2.5 ${
                  submissionFeedback.type === 'success'
                    ? 'bg-[#10B981]/15 border-[#10B981]/50 text-[#A7F3D0]'
                    : submissionFeedback.type === 'unverified'
                    ? 'bg-purple-500/15 border-purple-400/50 text-purple-200'
                    : 'bg-[#E04F5F]/15 border-[#E04F5F]/50 text-[#FECDD3]'
                }`}
              >
                {submissionFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#10B981]" />
                ) : submissionFeedback.type === 'unverified' ? (
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-purple-300" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#E04F5F]" />
                )}
                <span>{submissionFeedback.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label
                  htmlFor="contributor-name-input"
                  className="block font-mono text-[11px] uppercase tracking-wider text-[#CBD5E1] mb-1"
                >
                  Your Name / Callsign *
                </label>
                <input
                  id="contributor-name-input"
                  data-testid="input-contributor-name"
                  type="text"
                  value={contributorName}
                  onChange={e => setContributorName(e.target.value)}
                  required
                  placeholder="e.g. Vikram Sengupta"
                  className="w-full bg-[#020408] border border-[#1E2D42] focus:border-[#38BDF8] rounded-lg px-3 py-2 text-sm text-[#F8FAFC] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="contributor-utr-input"
                  className="block font-mono text-[11px] uppercase tracking-wider text-[#FDE68A] mb-1"
                >
                  12-Digit UPI UTR / Ref No. *
                </label>
                <input
                  ref={utrInputRef}
                  id="contributor-utr-input"
                  data-testid="input-contributor-utr"
                  type="text"
                  inputMode="numeric"
                  maxLength={12}
                  value={contributorUtr}
                  onChange={e => setContributorUtr(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  required
                  placeholder="12-digit UTR from GPay/PhonePe/Paytm"
                  className="w-full bg-[#020408] border border-[#F59E0B]/60 focus:border-[#F59E0B] rounded-lg px-3 py-2 font-mono text-sm text-[#F8FAFC] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="contributor-note-input"
                  className="block font-mono text-[11px] uppercase tracking-wider text-[#CBD5E1] mb-1"
                >
                  Your Review / Message
                </label>
                <textarea
                  id="contributor-note-input"
                  data-testid="input-contributor-note"
                  rows={2}
                  value={contributorNote}
                  onChange={e => setContributorNote(e.target.value)}
                  placeholder="Write a review or message for the community..."
                  className="w-full bg-[#020408] border border-[#1E2D42] focus:border-[#38BDF8] rounded-lg px-3 py-2 text-sm text-[#F8FAFC] focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              data-testid="submit-contribution-btn"
              disabled={submittingContribution}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#D97706] hover:from-[#FBBF24] hover:to-[#F59E0B] text-[#020408] font-mono font-bold text-xs sm:text-sm uppercase tracking-wider shadow-[0_0_24px_rgba(245,158,11,0.35)] transition-all cursor-pointer disabled:opacity-50"
            >
              {submittingContribution
                ? 'SUBMITTING UTR FOR VERIFICATION...'
                : 'SUBMIT UTR & REVIEW FOR VERIFICATION'}
            </button>
          </form>

          {/* Admin / Website Owner Verification Facility (Only visible to Owner / Admins) */}
          {isAdminOrOwner && (
            <div
              data-testid="admin-utr-verification-facility"
              className="bg-[#070B14] border border-[#38BDF8]/50 rounded-xl p-5 space-y-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#141E2E] pb-2.5">
                <div className="font-mono font-bold text-xs uppercase tracking-wider text-[#38BDF8] flex items-center gap-2">
                  <BadgeCheck className="w-4 h-4 text-[#38BDF8]" />
                  <span>ADMIN UTR VERIFICATION QUEUE ({adminContributions.length})</span>
                </div>
                <span className="font-mono text-[10px] text-[#94A3B8]">
                  Reconcile UTR, Amount, Date & Bank Credit before confirming SUCCESS
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-[#04101F] border border-[#38BDF8]/30 font-mono text-[10px] text-[#CBD5E1]">
                Admin Reconciliation Checklist: Verify (1) 12-Digit UTR, (2) Exact Amount (₹), (3) Transaction Date, (4) Receiving Account (+91 {recipientMobile} / {config.upiId}), and (5) Actual Bank Statement Credit before clicking Verify (SUCCESS).
              </div>

              {adminContributions.length === 0 ? (
                <div className="text-xs font-mono text-[#64748B] py-4 text-center">
                  No submitted UTR records awaiting verification.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {adminContributions.map(item => {
                    const status = item.transactionStatus || 'SUCCESS';
                    return (
                      <div
                        key={item.id}
                        data-testid={`admin-verify-row-${item.id}`}
                        className="p-3 rounded-lg bg-[#03060C] border border-[#1E2D42] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-sans font-bold text-xs text-[#F8FAFC]">
                              {item.contributorName}
                            </span>
                            {renderStatusBadge(status)}
                            {item.amountInr && (
                              <span className="font-mono text-[11px] font-bold text-[#FDE68A]">
                                ₹{item.amountInr} Rs
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[11px] text-[#94A3B8] flex flex-wrap items-center gap-3">
                            <span>UTR: {item.utrNumber || 'Legacy / None'}</span>
                            {item.transactionReference && <span>Ref: {item.transactionReference}</span>}
                            <span>Method: {item.paymentMethod}</span>
                            {item.createdAt && (
                              <span>Date: {new Date(item.createdAt).toLocaleString('en-IN')}</span>
                            )}
                            <span>Receiving A/C: +91 {recipientMobile} ({config.upiId})</span>
                          </div>
                          {item.note && (
                            <div className="text-xs text-[#CBD5E1] italic">“{item.note}”</div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {status !== 'SUCCESS' && (
                            <button
                              type="button"
                              data-testid={`verify-approve-btn-${item.id}`}
                              disabled={verifyingId === item.id}
                              onClick={() => handleAdminVerifyContribution(item.id, 'SUCCESS')}
                              className="px-3 py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/60 text-emerald-300 font-mono text-[10px] font-bold uppercase cursor-pointer"
                            >
                              Verify (SUCCESS)
                            </button>
                          )}
                          {status !== 'FAILED' && (
                            <button
                              type="button"
                              data-testid={`verify-reject-btn-${item.id}`}
                              disabled={verifyingId === item.id}
                              onClick={() => handleAdminVerifyContribution(item.id, 'FAILED')}
                              className="px-2.5 py-1.5 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/50 text-rose-300 font-mono text-[10px] font-bold uppercase cursor-pointer"
                            >
                              Mark Failed
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right 5 Columns: Payment Modes Terminal + Confirmed Squadron Backers Table */}
        <div className="lg:col-span-5 space-y-6">
          {/* Step 2: Payment Modes Card */}
          <div className="bg-[#050811] border border-[#F59E0B]/60 rounded-xl p-5 sm:p-6 shadow-[0_16px_50px_rgba(0,0,0,0.9)] space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E2D42] pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-[#F59E0B]" />
                <h2 className="font-sans font-bold text-sm sm:text-base uppercase tracking-wider text-[#F8FAFC]">
                  2. Payment Modes
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-[#FDE68A]">
                  {selectedOption === 'chai'
                    ? 'Get us a chai ☕ · 20 Rs'
                    : selectedOption === 'biryani'
                    ? 'Sponsor us a biryani 😋 · 200 Rs'
                    : `We accept anything 😂 · ${effectiveAmountInr.toLocaleString('en-IN')} Rs`}
                </span>
              </div>
            </div>

            {/* Primary Recipient Identifier Card: ACTIVE UPI NUMBER (Mobile Number Lookup Workflow) */}
            <div
              data-testid="active-upi-number-card"
              className="rounded-xl bg-[#030710] border border-[#38BDF8]/40 p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#38BDF8] font-bold">
                  Primary Payment · Active UPI Number
                </span>
                <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/40 font-mono text-[9px] text-sky-300 font-bold uppercase">
                  Mobile Number Lookup
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-mono font-bold text-sm text-[#F8FAFC] tracking-wide">
                    +91 {recipientMobile}
                  </div>
                  <div className="font-mono text-[10px] text-[#94A3B8] mt-0.5 flex flex-wrap items-center gap-2">
                    <span className="text-emerald-400">● GPay: Active</span>
                    <span className="text-emerald-400">● PhonePe: Active</span>
                    <span className="text-emerald-400">● Paytm: Active</span>
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="copy-active-upi-number-btn"
                  onClick={handleCopyActiveUpiNumber}
                  className="px-2.5 py-1.5 rounded-lg bg-[#0A1426] hover:bg-[#12223E] border border-[#38BDF8]/50 text-[#38BDF8] font-mono text-[10px] font-bold uppercase flex items-center gap-1 cursor-pointer shrink-0"
                  title="Copy 9019884970 to search in Google Pay, PhonePe, or Paytm"
                >
                  {copiedUpiNumber ? (
                    <>
                      <Check className="w-3 h-3 text-[#10B981]" />
                      <span className="text-[#10B981]">9019884970 Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy UPI No.</span>
                    </>
                  )}
                </button>
              </div>
              <div className="font-mono text-[10px] text-[#94A3B8] border-t border-[#14263D] pt-1.5">
                Select GPay, PhonePe, or Paytm below to copy <span className="text-[#F8FAFC] font-bold">9019884970</span> and open the app. Search the copied number in the app&apos;s Pay Phone / UPI Number feature and manually enter <span className="text-[#FDE68A] font-bold">₹{effectiveAmountInr.toLocaleString('en-IN')} Rs</span>.
              </div>
            </div>

            {/* Payment Mode Selector Tabs */}
            <div className="grid grid-cols-3 gap-2">
              {config.enableQrScan && (
                <button
                  type="button"
                  data-testid="payment-tab-qr"
                  onClick={() => {
                    playTacticalClick();
                    setActivePaymentTab('qr');
                  }}
                  className={`py-2 px-2.5 rounded-lg border font-mono text-[11px] font-bold uppercase transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                    activePaymentTab === 'qr'
                      ? 'bg-[#F59E0B]/20 border-[#F59E0B] text-[#FDE68A]'
                      : 'bg-[#020408] border-[#1E2D42] text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Scan Code</span>
                </button>
              )}

              {config.enableUpiId && (
                <button
                  type="button"
                  data-testid="payment-tab-upi"
                  onClick={() => {
                    playTacticalClick();
                    setActivePaymentTab('upi');
                  }}
                  className={`py-2 px-2.5 rounded-lg border font-mono text-[11px] font-bold uppercase transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                    activePaymentTab === 'upi'
                      ? 'bg-[#38BDF8]/20 border-[#38BDF8] text-[#38BDF8]'
                      : 'bg-[#020408] border-[#1E2D42] text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>UPI ID</span>
                </button>
              )}

              {config.enablePaymentLink && (
                <button
                  type="button"
                  data-testid="payment-tab-link"
                  onClick={() => {
                    playTacticalClick();
                    setActivePaymentTab('link');
                  }}
                  className={`py-2 px-2.5 rounded-lg border font-mono text-[11px] font-bold uppercase transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                    activePaymentTab === 'link'
                      ? 'bg-[#10B981]/20 border-[#10B981] text-[#A7F3D0]'
                      : 'bg-[#020408] border-[#1E2D42] text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Pay Link</span>
                </button>
              )}
            </div>

            {/* QR Scan Code View with Enter/Exit Toggle Animation (Preserved + Enlarge Option) */}
            <AvionicsToggleTransition
              activeKey={activePaymentTab}
              orderedKeys={['qr', 'upi', 'link']}
              accentColor={activePaymentTab === 'qr' ? 'amber' : activePaymentTab === 'upi' ? 'sky' : 'emerald'}
              reducedMotion={reducedMotion}
            >
              {activePaymentTab === 'qr' && config.enableQrScan && (
                <div className="flex flex-col items-center justify-center bg-[#020408] border border-[#1E2D42] rounded-xl p-5">
                  {config.customQrUrl ? (
                    <img
                      data-testid="custom-uploaded-qr-img"
                      src={config.customQrUrl}
                      alt="UPI Scan Code"
                      onClick={() => setShowEnlargedQr(true)}
                      className="w-48 h-48 object-contain rounded-lg bg-white p-2 cursor-pointer hover:scale-[1.02] transition-transform"
                    />
                  ) : (
                    <div
                      data-testid="upi-qr-matrix"
                      onClick={() => setShowEnlargedQr(true)}
                      className="w-48 h-48 bg-white p-3 rounded-xl shadow-[0_0_25px_rgba(245,158,11,0.2)] flex items-center justify-center cursor-pointer hover:scale-[1.02] transition-transform"
                    >
                      <svg
                        viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
                        className="w-full h-full"
                        shapeRendering="crispEdges"
                      >
                        {qrMatrix.map((row, rIdx) =>
                          row.map((cell, cIdx) =>
                            cell ? (
                              <rect
                                key={`${rIdx}-${cIdx}`}
                                x={cIdx}
                                y={rIdx}
                                width={1}
                                height={1}
                                fill="#020408"
                              />
                            ) : null
                          )
                        )}
                      </svg>
                    </div>
                  )}

                  <div className="mt-3 flex flex-col items-center gap-2 text-center">
                    <div className="font-mono text-[11px] text-[#94A3B8]">
                      Scan with GPay · PhonePe · Paytm · BHIM · Any UPI App
                    </div>
                    <button
                      type="button"
                      data-testid="enlarge-qr-code-btn"
                      onClick={() => {
                        playTacticalClick();
                        setShowEnlargedQr(true);
                      }}
                      className="px-3 py-1 rounded-lg bg-[#0A1324] hover:bg-[#12223E] border border-[#F59E0B]/50 text-[#FDE68A] font-mono text-[10px] font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>Enlarge QR Code</span>
                    </button>
                  </div>
                </div>
              )}
            </AvionicsToggleTransition>

            {/* Mobile-Number Lookup UPI Payment + Preserved Fallback UPI ID */}
            {config.enableUpiId && (
              <div className="space-y-3">
                <div
                  ref={upiAppsSectionRef}
                  data-testid="upi-apps-payment-section"
                  className={`space-y-2.5 rounded-xl p-3 transition-all duration-300 ${
                    highlightUpiApps
                      ? 'bg-[#08162B] ring-2 ring-[#F59E0B] shadow-[0_0_28px_rgba(245,158,11,0.4)]'
                      : 'bg-[#030710] border border-[#1E2D42]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono px-0.5">
                    <span className="text-[#38BDF8] font-bold uppercase">
                      Pay via UPI Number ({recipientMobile})
                    </span>
                    <span className="text-[#FDE68A] font-bold">
                      Enter in App: ₹{effectiveAmountInr.toLocaleString('en-IN')} Rs
                    </span>
                  </div>

                  <button
                    type="button"
                    data-testid="launch-upi-pay-link"
                    onClick={() => void handleLaunchUpiApp('upi')}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#0A1426] hover:bg-[#10203C] border border-[#38BDF8]/70 text-[#38BDF8] font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                    <span>
                      Copy UPI No. ({recipientMobile}) · Pay ₹{effectiveAmountInr.toLocaleString('en-IN')} Rs
                    </span>
                  </button>

                  <div className="grid grid-cols-3 gap-2">
                    <a
                      href={buildUpiAppLaunchIntentUri('gpay')}
                      data-testid="launch-gpay-btn"
                      onClick={e => {
                        e.preventDefault();
                        void handleLaunchUpiApp('gpay');
                      }}
                      className="py-2 px-2 rounded-lg bg-[#050B16] hover:bg-[#0D1A30] border border-[#1E2D42] hover:border-[#38BDF8]/60 text-[#CBD5E1] font-mono text-[10px] font-bold uppercase text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-0.5"
                    >
                      <span className="text-[#F8FAFC]">GPay</span>
                      <span className="text-[9px] text-[#38BDF8]">
                        Copy No. & Open · ₹{effectiveAmountInr.toLocaleString('en-IN')}
                      </span>
                    </a>
                    <a
                      href={buildUpiAppLaunchIntentUri('phonepe')}
                      data-testid="launch-phonepe-btn"
                      onClick={e => {
                        e.preventDefault();
                        void handleLaunchUpiApp('phonepe');
                      }}
                      className="py-2 px-2 rounded-lg bg-[#050B16] hover:bg-[#0D1A30] border border-[#1E2D42] hover:border-[#38BDF8]/60 text-[#CBD5E1] font-mono text-[10px] font-bold uppercase text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-0.5"
                    >
                      <span className="text-[#F8FAFC]">PhonePe</span>
                      <span className="text-[9px] text-[#38BDF8]">
                        Copy No. & Open · ₹{effectiveAmountInr.toLocaleString('en-IN')}
                      </span>
                    </a>
                    <a
                      href={buildUpiAppLaunchIntentUri('paytm')}
                      data-testid="launch-paytm-btn"
                      onClick={e => {
                        e.preventDefault();
                        void handleLaunchUpiApp('paytm');
                      }}
                      className="py-2 px-2 rounded-lg bg-[#050B16] hover:bg-[#0D1A30] border border-[#1E2D42] hover:border-[#38BDF8]/60 text-[#CBD5E1] font-mono text-[10px] font-bold uppercase text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-0.5"
                    >
                      <span className="text-[#F8FAFC]">Paytm</span>
                      <span className="text-[9px] text-[#38BDF8]">
                        Copy No. & Open · ₹{effectiveAmountInr.toLocaleString('en-IN')}
                      </span>
                    </a>
                  </div>

                  {/* Live Mobile-Number Lookup Instructions & Transaction Status Panel */}
                  {(transactionStatus || launchedUpiAppLabel) && (
                    <div
                      data-testid="upi-app-launch-status"
                      className="mt-2 p-3 rounded-lg bg-[#04111D] border border-[#38BDF8]/40 space-y-2.5 text-[11px] font-mono"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[#7DD3FC] font-bold">
                          {launchedUpiAppLabel
                            ? `${launchedUpiAppLabel} · Selected Amount: ₹${effectiveAmountInr.toLocaleString('en-IN')} Rs`
                            : 'UPI Number Lookup Instructions'}
                        </span>
                        {transactionStatus && renderStatusBadge(transactionStatus)}
                      </div>

                      {/* Step-by-Step Mobile-Number Lookup Instructions */}
                      {(() => {
                        const lookupTarget: Exclude<UpiAppTarget, 'upi'> =
                          selectedUpiApp === 'phonepe'
                            ? 'phonepe'
                            : selectedUpiApp === 'paytm'
                            ? 'paytm'
                            : 'gpay';
                        const guide = getUpiNumberLookupInstructions(
                          lookupTarget,
                          recipientMobile,
                          effectiveAmountInr
                        );
                        return (
                          <div
                            data-testid="upi-number-lookup-instructions"
                            className="text-[10px] text-[#CBD5E1] space-y-1.5 border-t border-[#14263D] pt-2"
                          >
                            <div className="flex items-center justify-between gap-2 bg-[#02060D] border border-[#1E2D42] rounded px-2.5 py-1.5">
                              <div>
                                <span className="text-[#94A3B8]">Copied UPI Number: </span>
                                <span className="text-[#F8FAFC] font-bold">+91 {recipientMobile}</span>
                              </div>
                              <span className="text-[#FDE68A] font-bold">
                                Enter Amount: ₹{effectiveAmountInr.toLocaleString('en-IN')} Rs
                              </span>
                            </div>
                            <ul className="space-y-1 text-[#CBD5E1] list-none pl-0">
                              {guide.steps.map((stepText, idx) => (
                                <li key={idx} className="leading-relaxed">
                                  {stepText}
                                </li>
                              ))}
                            </ul>
                            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-[#FDE68A] text-[10px] leading-relaxed">
                              {guide.manualEntryNotice}
                            </div>
                            {activeTransactionRef && (
                              <div className="text-[#94A3B8]">
                                Local Session Ref: <span className="text-[#FDE68A]">{activeTransactionRef}</span> (Local Config Lookup)
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {appLaunchError && (
                        <div className="p-2 rounded bg-rose-950/60 border border-rose-500/50 text-rose-200 text-[10px] leading-relaxed">
                          {appLaunchError}
                        </div>
                      )}

                      {/* Post-Launch User Status Actions */}
                      <div className="pt-1.5 border-t border-[#14263D] space-y-1.5">
                        <div className="text-[10px] text-[#94A3B8]">
                          Completed the transfer to {recipientMobile} in {launchedUpiAppLabel || 'your UPI app'}? Select outcome:
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            data-testid="status-action-enter-utr"
                            onClick={() => {
                              playTacticalClick();
                              setTransactionStatus('UNVERIFIED');
                              utrInputRef.current?.scrollIntoView({
                                behavior: reducedMotion ? 'auto' : 'smooth',
                                block: 'center'
                              });
                              setTimeout(() => utrInputRef.current?.focus(), 150);
                            }}
                            className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-300 text-[10px] font-bold uppercase cursor-pointer"
                          >
                            Paid · Enter 12-Digit UTR
                          </button>
                          <button
                            type="button"
                            data-testid="status-action-risk-qr"
                            onClick={() => {
                              playTacticalClick();
                              setShowEnlargedQr(true);
                            }}
                            className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 text-[10px] font-bold uppercase cursor-pointer"
                          >
                            Or Scan QR Code
                          </button>
                          <button
                            type="button"
                            data-testid="status-action-cancelled"
                            onClick={() => {
                              playTacticalClick();
                              setTransactionStatus('CANCELLED');
                              if (activeTransactionRef) {
                                void updateServerTransactionStatus(
                                  activeTransactionRef,
                                  'CANCELLED',
                                  'Cancelled by contributor'
                                );
                              }
                            }}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 text-[10px] uppercase cursor-pointer"
                          >
                            Cancelled
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Preserved Fallback Alternative Payment Method: Existing UPI ID */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 bg-[#020408] border border-[#1E2D42] rounded-lg px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-[#94A3B8]">
                        Fallback Alternative · Existing UPI ID
                      </div>
                      <span
                        data-testid="contribution-upi-id-display"
                        className="font-mono font-bold text-xs sm:text-sm text-[#38BDF8] select-all truncate block"
                      >
                        {config.upiId}
                      </span>
                    </div>
                    <button
                      type="button"
                      data-testid="copy-upi-id-btn"
                      onClick={handleCopyUpi}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#0A1324] hover:bg-[#12223E] border border-[#38BDF8]/50 text-[#38BDF8] font-mono text-[11px] uppercase transition-colors cursor-pointer shrink-0"
                    >
                      {copiedUpi ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#10B981]" />
                          <span className="text-[#10B981]">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy UPI</span>
                        </>
                      )}
                    </button>
                  </div>

                  {usingFallbackUpiIdNotice && (
                    <div
                      data-testid="fallback-upi-id-notice"
                      className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/40 font-mono text-[10px] text-[#FDE68A]"
                    >
                      Fallback Payment Method Active: You copied the fallback UPI ID ({config.upiId}). Paste it in your UPI app, complete the ₹{effectiveAmountInr} Rs transfer, and submit your 12-digit UTR in Step 3.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Optional Payment Link / Other Mode */}
            {(config.enablePaymentLink || config.paymentLink || config.otherPaymentDetails) && (
              <div className="space-y-2 pt-2 border-t border-[#141E2E]">
                {config.otherPaymentDetails && (
                  <div className="text-xs font-mono text-[#CBD5E1] bg-[#020408] border border-[#1E2D42] rounded-lg p-3">
                    {config.otherPaymentDetails}
                  </div>
                )}
                {config.paymentLink && (
                  <a
                    href={config.paymentLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="external-payment-link"
                    className="w-full py-2.5 px-4 rounded-xl bg-[#080E1A] hover:bg-[#111C32] border border-[#F59E0B]/60 text-[#FDE68A] font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Payment Link</span>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Confirmed Recent Squadron Backers Table (Verified Only, Amount Paid Anonymous) */}
          <div
            data-testid="recent-squadron-backers-card"
            className="bg-[#050811] border border-[#1E2D42] rounded-xl p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between border-b border-[#141E2E] pb-2.5">
              <div className="font-mono font-bold text-xs uppercase tracking-wider text-[#F8FAFC] flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>RECENT SQUADRON BACKERS ({contributions.length})</span>
              </div>
              <span className="font-mono text-[10px] text-[#94A3B8]">
                Verified Only · Name & Review
              </span>
            </div>

            <div className="overflow-x-auto">
              <table
                data-testid="recent-squadron-backers-table"
                className="w-full text-left border-collapse"
              >
                <thead>
                  <tr className="border-b border-[#141E2E] text-[10px] font-mono uppercase text-[#94A3B8]">
                    <th className="py-2 pr-3">Backer Name</th>
                    <th className="py-2 px-2">Review</th>
                    <th className="py-2 pl-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141E2E]">
                  {contributions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="text-center py-6 text-xs font-mono text-[#64748B]"
                      >
                        Be the first verified Squadron Backer to share a review!
                      </td>
                    </tr>
                  ) : (
                    contributions.map(item => (
                      <tr
                        key={item.id}
                        data-testid="contribution-wall-entry"
                        className="align-top"
                      >
                        <td className="py-3 pr-3 whitespace-nowrap">
                          <div className="font-sans font-bold text-xs text-[#F8FAFC]">
                            {item.contributorName}
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <p className="text-xs text-[#CBD5E1] leading-snug">
                            {item.note ? `“${item.note}”` : '—'}
                          </p>
                        </td>
                        <td className="py-3 pl-2 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-[#10B981]/15 border border-[#10B981]/40 font-mono text-[10px] text-[#A7F3D0]">
                              Verified
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Enlarged QR Code Lightbox Modal */}
      <AnimatePresence>
        {showEnlargedQr && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-testid="enlarged-qr-modal"
            onClick={() => setShowEnlargedQr(false)}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          >
            <div
              onClick={e => e.stopPropagation()}
              className="bg-[#050811] border border-[#F59E0B]/70 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-[0_24px_80px_rgba(0,0,0,0.95)] text-center"
            >
              <div className="flex items-center justify-between border-b border-[#1E2D42] pb-3">
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-[#F59E0B]" />
                  <span className="font-sans font-bold text-sm uppercase tracking-wider text-[#F8FAFC]">
                    Scan Verified QR Code (₹{effectiveAmountInr.toLocaleString('en-IN')} Rs)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEnlargedQr(false)}
                  className="p-1.5 rounded-lg bg-[#0B1528] text-[#94A3B8] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-center py-2">
                {config.customQrUrl ? (
                  <img
                    src={config.customQrUrl}
                    alt="Enlarged UPI QR Code"
                    className="w-72 h-72 sm:w-80 sm:h-80 object-contain rounded-xl bg-white p-3 shadow-xl"
                  />
                ) : (
                  <div className="w-72 h-72 sm:w-80 sm:h-80 bg-white p-4 rounded-xl shadow-xl flex items-center justify-center">
                    <svg
                      viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
                      className="w-full h-full"
                      shapeRendering="crispEdges"
                    >
                      {qrMatrix.map((row, rIdx) =>
                        row.map((cell, cIdx) =>
                          cell ? (
                            <rect
                              key={`${rIdx}-${cIdx}`}
                              x={cIdx}
                              y={rIdx}
                              width={1}
                              height={1}
                              fill="#020408"
                            />
                          ) : null
                        )
                      )}
                    </svg>
                  </div>
                )}
              </div>

              <div className="space-y-1 font-mono text-xs text-[#CBD5E1]">
                <div>
                  Works with Google Pay, PhonePe, Paytm & BHIM without browser link restrictions.
                </div>
                <div className="text-[11px] text-[#FDE68A]">
                  After scanning & paying, enter your 12-digit UTR in Step 3 to verify.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowEnlargedQr(false)}
                className="w-full py-2.5 rounded-xl bg-[#131C2E] hover:bg-[#1C2942] border border-[#38BDF8]/50 text-[#F8FAFC] font-mono text-xs font-bold uppercase cursor-pointer"
              >
                Close QR View
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
