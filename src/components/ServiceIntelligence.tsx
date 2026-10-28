import React, { useState, useEffect } from 'react';
import { Building2, Plus, Star, CheckCircle2, MapPin, Search, ThumbsUp, ThumbsDown, UserCheck, X, Edit2, Trash2, CloudOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { ServiceReview } from '../types';
import {
  CACHE_KEYS,
  saveToCache,
  loadFromCache,
  saveFormDraft,
  loadFormDraft,
  clearFormDraft,
  enqueueOfflineAction,
  canUserModifyRecord,
  reconcileCollectionWithCache,
  recordDeletedId,
  OFFLINE_SYNC_EVENT
} from '../utils/telemetryCache';

const DRAFT_KEY = 'service_intel_review_form';

export const ServiceIntelligence: React.FC = () => {
  const { currentUser } = useAuth();
  const { playTacticalClick, playChime } = useAudio();

  const [reviews, setReviews] = useState<ServiceReview[]>(() =>
    loadFromCache<ServiceReview[]>(CACHE_KEYS.SERVICE_REVIEWS, [])
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusNotice, setStatusNotice] = useState<{ type: 'saved' | 'offline'; text: string } | null>(null);

  const initialDraft = loadFormDraft(DRAFT_KEY, {
    serviceCentreName: 'Ultraviolette Bengaluru Flagship Hangar (Indiranagar)',
    generalLocation: 'Bengaluru, Karnataka',
    motorcycleModel: 'F77 MACH 2 Recon',
    visitDate: new Date().toISOString().split('T')[0],
    issueReported: '',
    workPerformed: '',
    issueResolved: true,
    turnaroundDays: '1',
    customerRating: '5',
    preferredServiceAdvisor: '',
    positiveFeedback: '',
    negativeFeedback: '',
    notes: ''
  });

  // Form State
  const [serviceCentreName, setServiceCentreName] = useState(initialDraft.serviceCentreName);
  const [generalLocation, setGeneralLocation] = useState(initialDraft.generalLocation);
  const [motorcycleModel, setMotorcycleModel] = useState(initialDraft.motorcycleModel);
  const [visitDate, setVisitDate] = useState(initialDraft.visitDate);
  const [issueReported, setIssueReported] = useState(initialDraft.issueReported);
  const [workPerformed, setWorkPerformed] = useState(initialDraft.workPerformed);
  const [issueResolved, setIssueResolved] = useState(initialDraft.issueResolved);
  const [turnaroundDays, setTurnaroundDays] = useState(initialDraft.turnaroundDays);
  const [customerRating, setCustomerRating] = useState(initialDraft.customerRating);
  const [preferredServiceAdvisor, setPreferredServiceAdvisor] = useState(initialDraft.preferredServiceAdvisor);
  const [positiveFeedback, setPositiveFeedback] = useState(initialDraft.positiveFeedback);
  const [negativeFeedback, setNegativeFeedback] = useState(initialDraft.negativeFeedback);
  const [notes, setNotes] = useState(initialDraft.notes);

  useEffect(() => {
    if (!editingReviewId && (issueReported || workPerformed || positiveFeedback || negativeFeedback || notes)) {
      saveFormDraft(DRAFT_KEY, {
        serviceCentreName,
        generalLocation,
        motorcycleModel,
        visitDate,
        issueReported,
        workPerformed,
        issueResolved,
        turnaroundDays,
        customerRating,
        preferredServiceAdvisor,
        positiveFeedback,
        negativeFeedback,
        notes
      });
    }
  }, [
    editingReviewId,
    serviceCentreName,
    generalLocation,
    motorcycleModel,
    visitDate,
    issueReported,
    workPerformed,
    issueResolved,
    turnaroundDays,
    customerRating,
    preferredServiceAdvisor,
    positiveFeedback,
    negativeFeedback,
    notes
  ]);

  useEffect(() => {
    fetchReviews();
    const handleSync = () => fetchReviews();
    window.addEventListener(OFFLINE_SYNC_EVENT, handleSync);
    return () => window.removeEventListener(OFFLINE_SYNC_EVENT, handleSync);
  }, []);

  const fetchReviews = async () => {
    try {
      const res = await fetch('/api/service-reviews');
      if (res.ok) {
        const data = await res.json();
        const serverReviews: ServiceReview[] = data.reviews || [];
        const merged = reconcileCollectionWithCache<ServiceReview>(CACHE_KEYS.SERVICE_REVIEWS, serverReviews);
        setReviews(merged);
        saveToCache(CACHE_KEYS.SERVICE_REVIEWS, merged);
      }
    } catch (err) {
      const cached = loadFromCache<ServiceReview[]>(CACHE_KEYS.SERVICE_REVIEWS, []);
      if (cached.length > 0) setReviews(cached);
    }
  };

  const openEditModal = (rev: ServiceReview) => {
    playTacticalClick();
    setEditingReviewId(rev.id);
    setServiceCentreName(rev.serviceCentreName);
    setGeneralLocation(rev.generalLocation);
    setMotorcycleModel(rev.motorcycleModel);
    setVisitDate(rev.visitDate);
    setIssueReported(rev.issueReported || '');
    setWorkPerformed(rev.workPerformed || '');
    setIssueResolved(rev.issueResolved ?? true);
    setTurnaroundDays(String(rev.turnaroundDays ?? '1'));
    setCustomerRating(String(rev.customerRating ?? '5'));
    setPreferredServiceAdvisor(rev.preferredServiceAdvisor || '');
    setPositiveFeedback(rev.positiveFeedback || '');
    setNegativeFeedback(rev.negativeFeedback || '');
    setNotes(rev.notes || '');
    setShowAddModal(true);
  };

  const handleDeleteReview = async (rev: ServiceReview) => {
    if (!currentUser) return;
    playTacticalClick();
    recordDeletedId(rev.id);
    try {
      const res = await fetch(`/api/service-reviews/${rev.id}?userId=${encodeURIComponent(currentUser.id)}`, {
        method: 'DELETE',
        headers: { 'x-user-id': currentUser.id }
      });
      if (res.ok || (rev as any).pendingSync) {
        const next = reviews.filter(r => r.id !== rev.id);
        setReviews(next);
        saveToCache(CACHE_KEYS.SERVICE_REVIEWS, next);
        setStatusNotice({ type: 'saved', text: 'Service visit log deleted permanently.' });
        setTimeout(() => setStatusNotice(null), 4000);
      }
    } catch {
      const next = reviews.filter(r => r.id !== rev.id);
      setReviews(next);
      saveToCache(CACHE_KEYS.SERVICE_REVIEWS, next);
    }
  };

  const handleAddReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceCentreName || !workPerformed) return;

    playTacticalClick();
    const clientRequestId = `srv_req_${Date.now()}`;
    const payload = {
      userId: currentUser?.id,
      authorName: currentUser?.fullName || 'Squadron Pilot',
      serviceCentreName,
      generalLocation,
      motorcycleModel,
      visitDate,
      issueReported,
      workPerformed,
      issueResolved,
      turnaroundDays: Number(turnaroundDays),
      customerRating: Number(customerRating),
      preferredServiceAdvisor,
      positiveFeedback,
      negativeFeedback,
      notes,
      clientRequestId
    };

    try {
      const url = editingReviewId ? `/api/service-reviews/${editingReviewId}` : '/api/service-reviews';
      const method = editingReviewId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || '',
          'x-client-request-id': clientRequestId
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        playChime();
        clearFormDraft(DRAFT_KEY);
        setShowAddModal(false);
        setEditingReviewId(null);
        setIssueReported('');
        setWorkPerformed('');
        setPreferredServiceAdvisor('');
        setPositiveFeedback('');
        setNegativeFeedback('');
        setNotes('');
        if (data.review) {
          const updatedList = editingReviewId
            ? reviews.map(r => (r.id === data.review.id ? data.review : r))
            : [data.review, ...reviews.filter(r => r.id !== data.review.id)];
          setReviews(updatedList);
          saveToCache(CACHE_KEYS.SERVICE_REVIEWS, updatedList);
        }
        setStatusNotice({
          type: 'saved',
          text: editingReviewId ? 'Service log updated and saved permanently.' : 'Service visit logged and saved permanently.'
        });
        setTimeout(() => setStatusNotice(null), 4000);
      }
    } catch (err) {
      enqueueOfflineAction(
        editingReviewId ? `/api/service-reviews/${editingReviewId}` : '/api/service-reviews',
        editingReviewId ? 'PUT' : 'POST',
        payload,
        'Service Visit Log',
        clientRequestId
      );
      const localRev: any = {
        ...payload,
        id: editingReviewId || `srv_local_${Date.now()}`,
        createdAt: new Date().toISOString(),
        pendingSync: true
      };
      const updated = editingReviewId
        ? reviews.map(r => (r.id === editingReviewId ? localRev : r))
        : [localRev, ...reviews];
      setReviews(updated);
      saveToCache(CACHE_KEYS.SERVICE_REVIEWS, updated);
      clearFormDraft(DRAFT_KEY);
      setShowAddModal(false);
      setEditingReviewId(null);
      setStatusNotice({
        type: 'offline',
        text: 'Saved locally — pending sync. Your service visit log will automatically sync when online.'
      });
    }
  };

  const filteredReviews = reviews.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.serviceCentreName.toLowerCase().includes(q) ||
      r.generalLocation.toLowerCase().includes(q) ||
      r.motorcycleModel.toLowerCase().includes(q) ||
      (r.preferredServiceAdvisor && r.preferredServiceAdvisor.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#13161A] border border-[#282D34] rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded bg-[#191D22] border border-[#414851] flex items-center justify-center text-[#D4D8DE]">
            <Building2 className="w-5 h-5 text-[#D4D8DE]" />
          </div>
          <div>
            <div className="text-sm font-mono font-bold text-[#F1F3F5] tracking-wider flex items-center gap-2">
              SERVICE INTEL & REVIEWS
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#252A30] text-[#729BCB] border border-[#729BCB]/30">
                HANGAR BENCHMARKS
              </span>
            </div>
            <div className="text-xs text-[#A0A7B0] mt-0.5">
              Verified service center turnarounds • Repair quality logs • Diagnostic benchmarks
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            playTacticalClick();
            setEditingReviewId(null);
            setShowAddModal(true);
          }}
          className="flex items-center space-x-1.5 px-3.5 py-2 rounded bg-[#252A30] hover:bg-[#414851] text-xs font-mono font-bold text-[#F1F3F5] border border-[#414851] transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>LOG SERVICE VISIT</span>
        </button>
      </div>

      {statusNotice && (
        <div
          className={`p-3 rounded-lg border text-xs font-mono flex items-center justify-between ${
            statusNotice.type === 'saved'
              ? 'bg-[#42B883]/15 border-[#42B883]/40 text-[#42B883]'
              : 'bg-[#E8AA45]/15 border-[#E8AA45]/40 text-[#E8AA45]'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusNotice.type === 'offline' ? <CloudOff className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>{statusNotice.text}</span>
          </div>
          <button onClick={() => setStatusNotice(null)} className="text-[#707883] hover:text-[#F1F3F5]">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="flex justify-between items-center text-xs font-mono">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#707883]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search service center, advisor or city..."
            className="w-full bg-[#0D0F12] border border-[#282D34] focus:border-[#414851] rounded pl-8 pr-3 py-1.5 text-[#F1F3F5] text-xs focus:outline-none"
          />
        </div>
        <span className="text-[#707883] hidden sm:inline">{filteredReviews.length} LOGS FILED</span>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {filteredReviews.length === 0 ? (
          <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-10 text-center text-xs font-mono text-[#707883]">
            NO SERVICE BENCHMARKS RECORDED FOR THIS CRITERIA
          </div>
        ) : (
          filteredReviews.map(rev => {
            const canModify = canUserModifyRecord(currentUser, rev);
            return (
              <div
                key={rev.id}
                className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-5 space-y-3 font-mono text-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#282D34]">
                  <div>
                    <div className="text-sm font-bold text-[#F1F3F5] flex items-center gap-2 flex-wrap">
                      <span>{rev.serviceCentreName}</span>
                      {(rev as any).pendingSync && (
                        <span className="px-2 py-0.5 rounded bg-[#E8AA45]/20 text-[#E8AA45] border border-[#E8AA45]/40 text-[10px]">
                          SAVED LOCALLY — PENDING SYNC
                        </span>
                      )}
                      {rev.preferredServiceAdvisor && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#191D22] text-[#42B883] border border-[#42B883]/30 text-[10px] font-normal">
                          <UserCheck className="w-3 h-3 text-[#42B883]" />
                          <span>Advisor: {rev.preferredServiceAdvisor}</span>
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#A0A7B0] flex items-center gap-1 mt-0.5 font-sans">
                      <MapPin className="w-3 h-3 text-[#E04F5F] shrink-0" />
                      <span>{rev.generalLocation} • {rev.motorcycleModel}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 text-[11px]">
                    <div className="flex items-center text-[#E8AA45]">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3.5 h-3.5 ${i < rev.customerRating ? 'fill-[#E8AA45]' : 'text-[#414851]'}`}
                        />
                      ))}
                    </div>
                    <span className="text-[#707883]">Visit: {rev.visitDate}</span>
                    {canModify && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(rev)}
                          className="p-1 rounded bg-[#191D22] hover:bg-[#252A30] text-[#AEB5BE] hover:text-[#F1F3F5] border border-[#282D34]"
                          title="Edit Service Log"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteReview(rev)}
                          className="p-1 rounded bg-[#191D22] hover:bg-[#E04F5F]/20 text-[#AEB5BE] hover:text-[#E04F5F] border border-[#282D34]"
                          title="Delete Service Log"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Primary Work Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-[#13161A] border border-[#282D34]">
                    <div className="text-[10px] text-[#707883]">ISSUE REPORTED:</div>
                    <div className="text-[#D4D8DE] mt-0.5">{rev.issueReported || 'Routine Service / Inspection'}</div>
                  </div>
                  <div className="p-3 rounded bg-[#13161A] border border-[#282D34]">
                    <div className="text-[10px] text-[#707883]">WORK PERFORMED:</div>
                    <div className="text-[#D4D8DE] mt-0.5">{rev.workPerformed}</div>
                  </div>
                </div>

                {/* Positive and Negative Feedback */}
                {(rev.positiveFeedback || rev.negativeFeedback || rev.preferredServiceAdvisor) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {rev.positiveFeedback && (
                      <div className="p-3 rounded bg-[#0E1A14] border border-[#42B883]/30">
                        <div className="text-[10px] text-[#42B883] font-bold flex items-center gap-1">
                          <ThumbsUp className="w-3 h-3 text-[#42B883]" />
                          <span>POSITIVE FEEDBACK:</span>
                        </div>
                        <div className="text-[#D4D8DE] mt-1 text-[11px] font-sans leading-relaxed">
                          {rev.positiveFeedback}
                        </div>
                      </div>
                    )}

                    {rev.negativeFeedback && (
                      <div className="p-3 rounded bg-[#1A1112] border border-[#E04F5F]/30">
                        <div className="text-[10px] text-[#E04F5F] font-bold flex items-center gap-1">
                          <ThumbsDown className="w-3 h-3 text-[#E04F5F]" />
                          <span>NEGATIVE FEEDBACK / AREAS FOR IMPROVEMENT:</span>
                        </div>
                        <div className="text-[#D4D8DE] mt-1 text-[11px] font-sans leading-relaxed">
                          {rev.negativeFeedback}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {rev.notes && (
                  <div className="p-2.5 rounded bg-[#13161A] border border-[#282D34]/70 text-[11px] text-[#A0A7B0]">
                    <span className="text-[10px] font-bold text-[#707883] block mb-0.5">ADDITIONAL NOTES:</span>
                    {rev.notes}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-[#282D34] text-[11px]">
                  <div className="flex items-center space-x-4">
                    <span className="flex items-center gap-1 text-[#42B883]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {rev.issueResolved ? 'ISSUE RESOLVED' : 'RECURRING / UNRESOLVED'}
                    </span>
                    <span className="text-[#AEB5BE]">
                      TURNAROUND: {rev.turnaroundDays} DAY(S)
                    </span>
                  </div>
                  <span className="text-[#707883]">Filed by {rev.authorName}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Log Service Visit */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#13161A] border border-[#414851] rounded-lg max-w-lg w-full p-6 space-y-4 font-mono text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-[#282D34]">
              <div className="text-sm font-bold text-[#F1F3F5]">
                {editingReviewId ? 'EDIT SERVICE VISIT LOG' : 'LOG SERVICE VISIT'}
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded text-[#707883] hover:text-[#F1F3F5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddReview} className="space-y-3">
              <div>
                <label className="block text-[#D4D8DE] mb-1">SERVICE CENTRE NAME *</label>
                <input
                  type="text"
                  value={serviceCentreName}
                  onChange={e => setServiceCentreName(e.target.value)}
                  className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#D4D8DE] mb-1">CITY / REGION *</label>
                  <input
                    type="text"
                    value={generalLocation}
                    onChange={e => setGeneralLocation(e.target.value)}
                    className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[#D4D8DE] mb-1">VISIT DATE</label>
                  <input
                    type="date"
                    value={visitDate}
                    onChange={e => setVisitDate(e.target.value)}
                    className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#D4D8DE] mb-1">PREFERRED SERVICE ADVISOR</label>
                <input
                  type="text"
                  value={preferredServiceAdvisor}
                  onChange={e => setPreferredServiceAdvisor(e.target.value)}
                  placeholder="e.g. Rahul Sharma (Master Technician)"
                  className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#42B883] rounded p-2 text-[#F1F3F5] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#D4D8DE] mb-1">ISSUE REPORTED</label>
                <input
                  type="text"
                  value={issueReported}
                  onChange={e => setIssueReported(e.target.value)}
                  placeholder="e.g. 5,000 km Scheduled Service / Belt tension"
                  className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#D4D8DE] mb-1">WORK PERFORMED *</label>
                <textarea
                  rows={2}
                  value={workPerformed}
                  onChange={e => setWorkPerformed(e.target.value)}
                  placeholder="Details of adjustments, parts replaced, software flashed..."
                  className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-3 pt-1 border-t border-[#282D34]/70">
                <div>
                  <label className="block text-[#42B883] mb-1 font-bold flex items-center gap-1">
                    <ThumbsUp className="w-3.5 h-3.5" />
                    <span>POSITIVE FEEDBACK</span>
                  </label>
                  <textarea
                    rows={2}
                    value={positiveFeedback}
                    onChange={e => setPositiveFeedback(e.target.value)}
                    placeholder="Record what went well during your service visit..."
                    className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#42B883] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#E04F5F] mb-1 font-bold flex items-center gap-1">
                    <ThumbsDown className="w-3.5 h-3.5" />
                    <span>NEGATIVE FEEDBACK</span>
                  </label>
                  <textarea
                    rows={2}
                    value={negativeFeedback}
                    onChange={e => setNegativeFeedback(e.target.value)}
                    placeholder="Record any issues, delays, or areas for improvement..."
                    className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#E04F5F] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#D4D8DE] mb-1">TURNAROUND DAYS</label>
                  <input
                    type="number"
                    value={turnaroundDays}
                    onChange={e => setTurnaroundDays(e.target.value)}
                    className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[#D4D8DE] mb-1">RATING (1-5)</label>
                  <select
                    value={customerRating}
                    onChange={e => setCustomerRating(e.target.value)}
                    className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  >
                    <option value="5">5 - Exceptional</option>
                    <option value="4">4 - Good</option>
                    <option value="3">3 - Satisfactory</option>
                    <option value="2">2 - Poor</option>
                    <option value="1">1 - Deficient</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="flex items-center space-x-2 text-[11px] text-[#A0A7B0] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={issueResolved}
                    onChange={e => setIssueResolved(e.target.checked)}
                    className="rounded border-[#414851] bg-[#08090B]"
                  />
                  <span>ISSUE RESOLVED ON FIRST VISIT</span>
                </label>
              </div>

              <div>
                <label className="block text-[#D4D8DE] mb-1">ADDITIONAL NOTES</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Optional technician comments or warranty notes..."
                  className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#282D34]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded bg-[#191D22] text-[#A0A7B0] hover:text-[#F1F3F5]"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-[#252A30] hover:bg-[#414851] text-[#F1F3F5] border border-[#414851] font-bold"
                >
                  {editingReviewId ? 'SAVE CHANGES' : 'SUBMIT BENCHMARK'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
