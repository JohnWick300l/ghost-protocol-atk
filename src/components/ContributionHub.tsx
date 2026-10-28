import React, { useState, useEffect, useMemo } from 'react';
import {
  Heart,
  Shield,
  Copy,
  Check,
  ExternalLink,
  ArrowLeft,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Coffee,
  Utensils,
  Sliders,
  Smartphone,
  CreditCard
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import {
  CONTRIBUTION_OPTIONS,
  DEFAULT_CONTRIBUTION_CONFIG,
  sanitizeContributionConfig,
  redactContributionForPublicWall,
  buildUpiPaymentUri,
  validateContributionSubmission,
  type ContributionConfig,
  type ContributionOptionId,
  type ContributionRecord
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

export const ContributionHub: React.FC<ContributionHubProps> = ({ onBackToCockpit }) => {
  const { currentUser } = useAuth();
  const { playTacticalClick, playChime, reducedMotion } = useAudio();

  const [config, setConfig] = useState<ContributionConfig>(() => {
    const cached = loadFromCache<ContributionConfig>(CACHE_KEYS.CONTRIBUTION_CONFIG);
    return sanitizeContributionConfig(cached?.data, DEFAULT_CONTRIBUTION_CONFIG);
  });

  const [contributions, setContributions] = useState<Omit<ContributionRecord, 'amountInr'>[]>(() => {
    const cached = loadFromCache<ContributionRecord[]>(CACHE_KEYS.CONTRIBUTIONS);
    return Array.isArray(cached?.data)
      ? cached.data.map(item => redactContributionForPublicWall(item))
      : [];
  });

  // 3 Contribution Options state: 'chai' (20 Rs), 'biryani' (200 Rs), 'custom' (We accept anything 😂)
  const [selectedOption, setSelectedOption] = useState<ContributionOptionId>('chai');
  const [customAmountInput, setCustomAmountInput] = useState<string>('100');

  // Active Payment Mode tab on the payment terminal
  const [activePaymentTab, setActivePaymentTab] = useState<'qr' | 'upi' | 'link'>('qr');

  // Backer review form state
  const [contributorName, setContributorName] = useState<string>(currentUser?.fullName || '');
  const [contributorNote, setContributorNote] = useState<string>('');
  const [submittingContribution, setSubmittingContribution] = useState(false);
  const [submissionFeedback, setSubmissionFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [copiedUpi, setCopiedUpi] = useState(false);

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
          const redacted = data.contributions.map((item: ContributionRecord) =>
            redactContributionForPublicWall(item)
          );
          setContributions(redacted);
          saveToCache(CACHE_KEYS.CONTRIBUTIONS, redacted, { silent: true });
        }
      }
    } catch {
      // Serve from local cache when offline
    }
  };

  useEffect(() => {
    void fetchContributionData();
  }, []);

  const effectiveAmountInr = useMemo(() => {
    if (selectedOption === 'chai') return 20;
    if (selectedOption === 'biryani') return 200;
    const parsed = Math.round(Number(customAmountInput));
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return parsed;
  }, [selectedOption, customAmountInput]);

  const handleSelectOption = (optionId: ContributionOptionId) => {
    playTacticalClick();
    setSelectedOption(optionId);
  };

  const handleCopyUpi = async () => {
    playTacticalClick();
    try {
      await navigator.clipboard.writeText(config.upiId);
    } catch {
      // Fallback if clipboard API is restricted
    }
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2200);
  };

  const upiUri = useMemo(
    () =>
      buildUpiPaymentUri({
        upiId: config.upiId,
        amountInr: effectiveAmountInr,
        note:
          selectedOption === 'chai'
            ? 'Get us a chai (Ghost Protocol)'
            : selectedOption === 'biryani'
            ? 'Sponsor us a biryani (Ghost Protocol)'
            : 'We accept anything (Ghost Protocol)'
      }),
    [config.upiId, effectiveAmountInr, selectedOption]
  );

  const qrMatrix = useMemo(() => buildDeterministicQrMatrix(upiUri), [upiUri]);

  const handleContributionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    playTacticalClick();
    setSubmissionFeedback(null);

    const paymentMethodLabel =
      activePaymentTab === 'qr'
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
      note: contributorNote
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
        if (data.contribution) {
          const publicEntry = redactContributionForPublicWall(data.contribution);
          const nextList = [
            publicEntry,
            ...contributions.filter(c => c.id !== publicEntry.id)
          ];
          setContributions(nextList);
          saveToCache(CACHE_KEYS.CONTRIBUTIONS, nextList);
        }
        playChime();
        setContributorNote('');
        setSubmissionFeedback({
          type: 'success',
          text: `Thank you, ${validation.value.contributorName}! Your name and review have been added to Recent Squadron Backers.`
        });
      } else {
        const errData = await res.json().catch(() => ({}));
        setSubmissionFeedback({
          type: 'error',
          text: errData.error || 'Could not log contribution. Please try again.'
        });
      }
    } catch {
      const fallbackEntry = redactContributionForPublicWall({
        id: `contrib_local_${Date.now()}`,
        contributorName: validation.value.contributorName,
        contributorModel: validation.value.contributorModel,
        optionId: validation.value.optionId,
        paymentMethod: validation.value.paymentMethod,
        note: validation.value.note,
        createdAt: new Date().toISOString(),
        userId: currentUser?.id,
        clientRequestId
      });
      const nextList = [fallbackEntry, ...contributions];
      setContributions(nextList);
      saveToCache(CACHE_KEYS.CONTRIBUTIONS, nextList);
      playChime();
      setContributorNote('');
      setSubmissionFeedback({
        type: 'success',
        text: `Thank you, ${validation.value.contributorName}! Your name and review have been added to Recent Squadron Backers.`
      });
    } finally {
      setSubmittingContribution(false);
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
          {onBackToCockpit && (
            <button
              type="button"
              data-testid="contribution-back-cockpit-btn"
              onClick={() => {
                playTacticalClick();
                onBackToCockpit();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#080F1E] hover:bg-[#0E1A32] border border-[#1E2D42] hover:border-[#38BDF8]/60 text-xs font-mono uppercase tracking-wider text-[#E2E8F0] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>Cockpit</span>
            </button>
          )}
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

      {/* Clean Public Note Banner (No personal names, emails, or total money counter) */}
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
        {/* Left 7 Columns: 3 Contribution Options + Backer Review Form */}
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
                  className="pt-2 bg-[#080E1C] border border-[#F59E0B]/50 rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="custom-contribution-amount"
                      className="block font-mono text-[11px] uppercase tracking-wider text-[#FDE68A]"
                    >
                      Enter Any Custom Amount (Rs)
                    </label>
                    <span className="font-mono text-[11px] text-[#94A3B8]">
                      Min 1 Rs
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      id="custom-contribution-amount"
                      data-testid="input-contribution-amount"
                      type="number"
                      min={1}
                      value={customAmountInput}
                      onChange={e => setCustomAmountInput(e.target.value)}
                      className="w-full bg-[#020408] border border-[#1E2D42] focus:border-[#F59E0B] rounded-lg pl-3.5 pr-12 py-2.5 font-mono font-bold text-base text-[#F8FAFC] focus:outline-none"
                      placeholder="Enter any amount in Rs"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-xs text-[#F59E0B]">
                      Rs
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Step 3: Leave Your Name & Review for Recent Squadron Backers */}
          <form
            onSubmit={handleContributionSubmit}
            className="bg-[#050811] border border-[#1E2D42] rounded-xl p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#141E2E] pb-3">
              <h2 className="font-sans font-bold text-sm sm:text-base uppercase tracking-wider text-[#F8FAFC] flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#38BDF8]" />
                <span>3. Add Your Name & Review to Squadron Backers</span>
              </h2>
              <span className="font-mono text-[10px] text-[#10B981]">
                Amount Paid Kept 100% Anonymous
              </span>
            </div>

            {submissionFeedback && (
              <div
                data-testid="contribution-submit-feedback"
                className={`p-3.5 rounded-lg border text-xs font-mono flex items-start gap-2.5 ${
                  submissionFeedback.type === 'success'
                    ? 'bg-[#10B981]/15 border-[#10B981]/50 text-[#A7F3D0]'
                    : 'bg-[#E04F5F]/15 border-[#E04F5F]/50 text-[#FECDD3]'
                }`}
              >
                {submissionFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#10B981]" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#E04F5F]" />
                )}
                <span>{submissionFeedback.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3.5">
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
                ? 'SAVING BACKER ENTRY...'
                : 'POST NAME & REVIEW AS SQUADRON BACKER'}
            </button>
          </form>
        </div>

        {/* Right 5 Columns: Payment Modes Terminal + Anonymous Recent Squadron Backers Table */}
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

            {/* QR Scan Code View with Enter/Exit Toggle Animation */}
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
                      className="w-48 h-48 object-contain rounded-lg bg-white p-2"
                    />
                  ) : (
                    <div
                      data-testid="upi-qr-matrix"
                      className="w-48 h-48 bg-white p-3 rounded-xl shadow-[0_0_25px_rgba(245,158,11,0.2)] flex items-center justify-center"
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

                  <div className="mt-3 text-center">
                    <div className="font-mono text-[11px] text-[#94A3B8]">
                      Scan with GPay · PhonePe · Paytm · BHIM · Any UPI App
                    </div>
                  </div>
                </div>
              )}
            </AvionicsToggleTransition>

            {/* UPI ID Copy & App Launch View */}
            {config.enableUpiId && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 bg-[#020408] border border-[#1E2D42] rounded-lg px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="font-mono text-[9px] uppercase tracking-wider text-[#94A3B8]">
                      UPI ID
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

                <a
                  href={upiUri}
                  data-testid="launch-upi-pay-link"
                  onClick={() => playTacticalClick()}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#0A1426] hover:bg-[#10203C] border border-[#38BDF8]/70 text-[#38BDF8] font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Pay {effectiveAmountInr.toLocaleString('en-IN')} Rs via UPI App</span>
                </a>

                <div className="grid grid-cols-3 gap-2">
                  <a
                    href={upiUri.replace(/^upi:\/\/pay/, 'tez://upi/pay')}
                    onClick={() => playTacticalClick()}
                    className="py-1.5 px-2 rounded-lg bg-[#050B16] hover:bg-[#0D1A30] border border-[#1E2D42] text-[#CBD5E1] font-mono text-[10px] font-bold uppercase text-center transition-colors"
                  >
                    GPay
                  </a>
                  <a
                    href={upiUri.replace(/^upi:\/\/pay/, 'phonepe://pay')}
                    onClick={() => playTacticalClick()}
                    className="py-1.5 px-2 rounded-lg bg-[#050B16] hover:bg-[#0D1A30] border border-[#1E2D42] text-[#CBD5E1] font-mono text-[10px] font-bold uppercase text-center transition-colors"
                  >
                    PhonePe
                  </a>
                  <a
                    href={upiUri.replace(/^upi:\/\/pay/, 'paytmmp://pay')}
                    onClick={() => playTacticalClick()}
                    className="py-1.5 px-2 rounded-lg bg-[#050B16] hover:bg-[#0D1A30] border border-[#1E2D42] text-[#CBD5E1] font-mono text-[10px] font-bold uppercase text-center transition-colors"
                  >
                    Paytm
                  </a>
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

          {/* Recent Squadron Backers Table (Name + Review ONLY, Amount Paid Anonymous) */}
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
                Name & Review Only
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
                        Be the first to contribute and share a review!
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
                              Contributed
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
    </div>
  );
};
