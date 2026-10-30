import React, { useState, useEffect } from 'react';
import {
  Activity,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Search,
  Info,
  Eye,
  Edit2,
  Trash2,
  CloudOff,
  X,
  Camera,
  Video,
  Upload,
  Film,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Play
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { ProblemReport } from '../types';
import { BackButton } from './BackButton';
import { sortProblemsBySeverity, getSeverityRank, X47_PRIORITY_ISSUES_SEED, F77_PRIORITY_ISSUES_SEED, ALL_PRIORITY_ISSUES_SEED } from '../utils/rules';
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
  getDeletedIds,
  OFFLINE_SYNC_EVENT
} from '../utils/telemetryCache';

const DRAFT_KEY = 'priority_issue_form';

function mergeWithX47PrioritySeed(list: ProblemReport[]): ProblemReport[] {
  const deletedSet = new Set(getDeletedIds());
  const seedMap = new Map(ALL_PRIORITY_ISSUES_SEED.map(s => [s.id, s]));
  const normalized = list
    .filter(p => p && !deletedSet.has(p.id) && p.id !== 'prob_01' && p.id !== 'prob_02')
    .map(p => {
      const seed = seedMap.get(p.id);
      if (seed && typeof p.priorityOrder !== 'number') {
        return { ...p, priorityOrder: seed.priorityOrder };
      }
      return p;
    });
  const existingIds = new Set(normalized.map(p => p.id));
  for (const seed of ALL_PRIORITY_ISSUES_SEED) {
    if (!existingIds.has(seed.id) && !deletedSet.has(seed.id)) {
      normalized.push(seed as ProblemReport);
    }
  }
  return sortProblemsBySeverity(normalized);
}

export function isVideoMedia(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.startsWith('data:video/') ||
    lower.endsWith('.mp4') ||
    lower.endsWith('.webm') ||
    lower.endsWith('.mov') ||
    lower.endsWith('.mkv') ||
    lower.endsWith('.avi')
  );
}

export const ProblemTracker: React.FC = () => {
  const { currentUser } = useAuth();
  const { playTacticalClick, playChime } = useAudio();

  const [problems, setProblems] = useState<ProblemReport[]>(() =>
    mergeWithX47PrioritySeed(loadFromCache<ProblemReport[]>(CACHE_KEYS.PROBLEMS, []))
  );
  const [selectedProblem, setSelectedProblem] = useState<ProblemReport | null>(() => {
    const cached = mergeWithX47PrioritySeed(loadFromCache<ProblemReport[]>(CACHE_KEYS.PROBLEMS, []));
    return cached[0] || null;
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editingProblemId, setEditingProblemId] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<{ type: 'saved' | 'offline' | 'error'; text: string } | null>(null);

  // Lightbox viewer state
  const [lightboxMedia, setLightboxMedia] = useState<{ mediaList: string[]; index: number; title?: string } | null>(null);

  // Filter state
  const [isViewAllMode, setIsViewAllMode] = useState<boolean>(true);
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [filterModel, setFilterModel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const rawDraft = loadFormDraft<any>(DRAFT_KEY, {});
  const initialDraft = {
    formTitle: rawDraft.formTitle || '',
    formModel: rawDraft.formModel || 'X47',
    formVariant: rawDraft.formVariant || 'Crossover',
    formCategory: (rawDraft.formCategory || 'Battery & Power') as ProblemReport['category'],
    formDescription: rawDraft.formDescription || '',
    formFirstObserved: rawDraft.formFirstObserved || new Date().toISOString().split('T')[0],
    formMileageKm: rawDraft.formMileageKm !== undefined ? String(rawDraft.formMileageKm) : '0',
    formWarningCode: rawDraft.formWarningCode || '',
    formSeverity: (rawDraft.formSeverity || 'Moderate') as ProblemReport['severity'],
    formStatus: (rawDraft.formStatus || 'Reported') as ProblemReport['status'],
    formIsRecurring: Boolean(rawDraft.formIsRecurring),
    formTroubleshooting: rawDraft.formTroubleshooting || '',
    formServiceVisits: rawDraft.formServiceVisits || '',
    formMediaUrls: Array.isArray(rawDraft.formMediaUrls) ? rawDraft.formMediaUrls : []
  };

  // Form State
  const [formTitle, setFormTitle] = useState(initialDraft.formTitle);
  const [formModel, setFormModel] = useState<string>(initialDraft.formModel);
  const [formVariant, setFormVariant] = useState<string>(initialDraft.formVariant);
  const [formCategory, setFormCategory] = useState<ProblemReport['category']>(initialDraft.formCategory);
  const [formDescription, setFormDescription] = useState(initialDraft.formDescription);
  const [formFirstObserved, setFormFirstObserved] = useState(initialDraft.formFirstObserved);
  const [formMileageKm, setFormMileageKm] = useState<string>(initialDraft.formMileageKm);
  const [formWarningCode, setFormWarningCode] = useState(initialDraft.formWarningCode);
  const [formSeverity, setFormSeverity] = useState<ProblemReport['severity']>(initialDraft.formSeverity);
  const [formStatus, setFormStatus] = useState<ProblemReport['status']>(initialDraft.formStatus);
  const [formIsRecurring, setFormIsRecurring] = useState(initialDraft.formIsRecurring);
  const [formTroubleshooting, setFormTroubleshooting] = useState(initialDraft.formTroubleshooting);
  const [formServiceVisits, setFormServiceVisits] = useState(initialDraft.formServiceVisits);
  const [formMediaUrls, setFormMediaUrls] = useState<string[]>(initialDraft.formMediaUrls);

  // Update Note State & Update Media
  const [updateNote, setUpdateNote] = useState('');
  const [newStatusUpdate, setNewStatusUpdate] = useState<ProblemReport['status']>('Under Investigation');
  const [updateMediaUrls, setUpdateMediaUrls] = useState<string[]>([]);

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>, isUpdateForm = false) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newMedia: string[] = [];
    let readCount = 0;
    const fileList = Array.from(files);

    fileList.forEach(file => {
      const isImg = file.type.startsWith('image/');
      const isVid = file.type.startsWith('video/');
      if (!isImg && !isVid) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result && typeof event.target.result === 'string') {
          newMedia.push(event.target.result);
        }
        readCount++;
        if (readCount === fileList.length) {
          if (isUpdateForm) {
            setUpdateMediaUrls(prev => [...prev, ...newMedia]);
          } else {
            setFormMediaUrls(prev => [...prev, ...newMedia]);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveMedia = (index: number, isUpdateForm = false) => {
    playTacticalClick();
    if (isUpdateForm) {
      setUpdateMediaUrls(prev => prev.filter((_, i) => i !== index));
    } else {
      setFormMediaUrls(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleMoveMedia = (index: number, direction: 'up' | 'down') => {
    playTacticalClick();
    const current = [...formMediaUrls];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= current.length) return;
    const temp = current[index];
    current[index] = current[targetIndex];
    current[targetIndex] = temp;
    setFormMediaUrls(current);
  };

  useEffect(() => {
    if (!editingProblemId && (formTitle || formDescription || formWarningCode || formTroubleshooting || formServiceVisits || formMediaUrls.length > 0)) {
      saveFormDraft(DRAFT_KEY, {
        formTitle,
        formModel,
        formVariant,
        formCategory,
        formDescription,
        formFirstObserved,
        formMileageKm,
        formWarningCode,
        formSeverity,
        formStatus,
        formIsRecurring,
        formTroubleshooting,
        formServiceVisits,
        formMediaUrls
      });
    }
  }, [
    editingProblemId,
    formTitle,
    formModel,
    formVariant,
    formCategory,
    formDescription,
    formFirstObserved,
    formMileageKm,
    formWarningCode,
    formSeverity,
    formStatus,
    formIsRecurring,
    formTroubleshooting,
    formServiceVisits,
    formMediaUrls
  ]);

  useEffect(() => {
    fetchProblems();
    const handleSync = () => fetchProblems();
    window.addEventListener(OFFLINE_SYNC_EVENT, handleSync);
    return () => window.removeEventListener(OFFLINE_SYNC_EVENT, handleSync);
  }, []);

  const fetchProblems = async () => {
    try {
      const res = await fetch('/api/problems');
      if (res.ok) {
        const data = await res.json();
        const rawProblems: ProblemReport[] = data.problems || [];
        const merged = reconcileCollectionWithCache<ProblemReport>(CACHE_KEYS.PROBLEMS, rawProblems);
        const sorted = mergeWithX47PrioritySeed(merged);
        setProblems(sorted);
        saveToCache(CACHE_KEYS.PROBLEMS, sorted);
        if (sorted.length > 0) {
          setSelectedProblem(prev => {
            if (!prev) return sorted[0];
            return sorted.find(p => p.id === prev.id) || sorted[0];
          });
        }
      }
    } catch (err) {
      const cached = mergeWithX47PrioritySeed(loadFromCache<ProblemReport[]>(CACHE_KEYS.PROBLEMS, []));
      if (cached.length > 0) setProblems(cached);
    }
  };

  const openEditProblem = (prob: ProblemReport) => {
    playTacticalClick();
    setSelectedProblem(prob);
    setEditingProblemId(prob.id);
    setFormTitle(prob.title);
    setFormModel(prob.motorcycleModel.includes('X47') ? 'X47' : 'F77');
    setFormVariant(prob.variant || (prob.motorcycleModel.includes('X47') ? 'Crossover' : 'Mach 2'));
    setFormCategory(prob.category);
    setFormDescription(prob.description);
    setFormFirstObserved(prob.firstObservedDate || new Date().toISOString().split('T')[0]);
    setFormMileageKm(String(prob.mileageKm ?? 0));
    setFormWarningCode(prob.warningMessageOrCode || '');
    setFormSeverity(prob.severity);
    setFormStatus(prob.status || 'Reported');
    setFormIsRecurring(prob.isRecurring ?? false);
    setFormTroubleshooting(prob.troubleshootingAttempted || '');
    setFormServiceVisits(prob.serviceVisits || '');
    const existingMedia = prob.mediaUrls && prob.mediaUrls.length > 0
      ? prob.mediaUrls
      : [prob.photoUrl, prob.videoUrl].filter((x): x is string => Boolean(x && typeof x === 'string' && x.trim().length > 0));
    setFormMediaUrls(existingMedia);
    setShowCreateModal(true);
  };

  const handleDeleteProblem = async (prob: ProblemReport) => {
    if (!currentUser) return;
    playTacticalClick();
    recordDeletedId(prob.id);
    try {
      const res = await fetch(`/api/problems/${prob.id}?userId=${encodeURIComponent(currentUser.id)}`, {
        method: 'DELETE',
        headers: { 'x-user-id': currentUser.id }
      });
      if (res.ok || (prob as any).pendingSync) {
        const next = problems.filter(p => p.id !== prob.id);
        setProblems(next);
        saveToCache(CACHE_KEYS.PROBLEMS, next);
        if (selectedProblem?.id === prob.id) {
          setSelectedProblem(next[0] || null);
          setShowDetailModal(false);
        }
        setStatusNotice({ type: 'saved', text: 'Priority issue deleted permanently.' });
        setTimeout(() => setStatusNotice(null), 4000);
      }
    } catch {
      const next = problems.filter(p => p.id !== prob.id);
      setProblems(next);
      saveToCache(CACHE_KEYS.PROBLEMS, next);
      if (selectedProblem?.id === prob.id) {
        setSelectedProblem(next[0] || null);
        setShowDetailModal(false);
      }
    }
  };

  const handleCreateProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle || !formDescription || !formModel) {
      setStatusNotice({ type: 'error', text: 'Please fill mandatory fields.' });
      return;
    }

    playTacticalClick();
    const clientRequestId = `prb_req_${Date.now()}`;
    const payload = {
      userId: currentUser?.id,
      reporterName: currentUser?.fullName || 'Squadron Pilot',
      motorcycleModel: formModel,
      variant: formVariant,
      category: formCategory,
      title: formTitle,
      description: formDescription,
      firstObservedDate: formFirstObserved,
      mileageKm: Number(formMileageKm) || 0,
      warningMessageOrCode: formWarningCode,
      severity: formSeverity,
      status: formStatus,
      isRecurring: formIsRecurring,
      troubleshootingAttempted: formTroubleshooting,
      serviceVisits: formServiceVisits,
      mediaUrls: formMediaUrls,
      clientRequestId
    };

    try {
      const url = editingProblemId ? `/api/problems/${editingProblemId}` : '/api/problems';
      const method = editingProblemId ? 'PUT' : 'POST';

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
        setShowCreateModal(false);
        setEditingProblemId(null);
        setFormTitle('');
        setFormDescription('');
        setFormWarningCode('');
        setFormTroubleshooting('');
        setFormServiceVisits('');
        setFormMediaUrls([]);
        if (data.problem) {
          const updatedList = mergeWithX47PrioritySeed(
            editingProblemId
              ? problems.map(p => (p.id === data.problem.id ? { ...p, ...data.problem } : p))
              : [data.problem, ...problems.filter(p => p.id !== data.problem.id)]
          );
          setProblems(updatedList);
          saveToCache(CACHE_KEYS.PROBLEMS, updatedList);
          const refreshed = updatedList.find(p => p.id === data.problem.id) || data.problem;
          setSelectedProblem(refreshed);
        }
        setStatusNotice({
          type: 'saved',
          text: editingProblemId ? 'Priority issue updated and saved permanently.' : 'Priority issue reported and saved permanently.'
        });
        setTimeout(() => setStatusNotice(null), 4000);
      }
    } catch (err) {
      enqueueOfflineAction(
        editingProblemId ? `/api/problems/${editingProblemId}` : '/api/problems',
        editingProblemId ? 'PUT' : 'POST',
        payload,
        'Priority Issue Report',
        clientRequestId
      );
      const existingTarget = editingProblemId ? problems.find(p => p.id === editingProblemId) : null;
      const localProb: any = {
        ...(existingTarget || {}),
        ...payload,
        id: editingProblemId || `prb_local_${Date.now()}`,
        status: formStatus || 'Under Investigation',
        updates: existingTarget?.updates || [],
        pendingSync: true
      };
      const updated = mergeWithX47PrioritySeed(
        editingProblemId ? problems.map(p => (p.id === editingProblemId ? localProb : p)) : [localProb, ...problems]
      );
      setProblems(updated);
      saveToCache(CACHE_KEYS.PROBLEMS, updated);
      setSelectedProblem(localProb);
      clearFormDraft(DRAFT_KEY);
      setShowCreateModal(false);
      setEditingProblemId(null);
      setFormMediaUrls([]);
      setStatusNotice({
        type: 'offline',
        text: 'Saved locally — pending sync. Your issue report will automatically sync when online.'
      });
    }
  };

  const handleAddUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProblem || !updateNote.trim()) return;

    playTacticalClick();
    const payload = {
      authorName: currentUser?.fullName || 'Squadron Pilot',
      note: updateNote,
      newStatus: newStatusUpdate,
      mediaUrls: updateMediaUrls
    };

    try {
      const res = await fetch(`/api/problems/${selectedProblem.id}/updates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || ''
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        playChime();
        setUpdateNote('');
        setUpdateMediaUrls([]);
        const data = await res.json();
        if (data.problem) {
          const next = mergeWithX47PrioritySeed(
            problems.map(p => (p.id === data.problem.id ? { ...p, ...data.problem } : p))
          );
          setProblems(next);
          saveToCache(CACHE_KEYS.PROBLEMS, next);
          const refreshed = next.find(p => p.id === data.problem.id) || data.problem;
          setSelectedProblem(refreshed);
          setStatusNotice({
            type: 'saved',
            text: 'Case progress update recorded.'
          });
          setTimeout(() => setStatusNotice(null), 4000);
        }
      }
    } catch (err) {
      enqueueOfflineAction(`/api/problems/${selectedProblem.id}/updates`, 'POST', payload, 'Priority Issue Update');
      const updatedProb: ProblemReport = {
        ...selectedProblem,
        status: newStatusUpdate || selectedProblem.status,
        updates: [
          ...(selectedProblem.updates || []),
          {
            id: `upd_local_${Date.now()}`,
            authorName: payload.authorName,
            date: new Date().toISOString().split('T')[0],
            note: payload.note,
            mediaUrls: payload.mediaUrls
          }
        ]
      };
      const next = mergeWithX47PrioritySeed(problems.map(p => (p.id === selectedProblem.id ? updatedProb : p)));
      setProblems(next);
      saveToCache(CACHE_KEYS.PROBLEMS, next);
      setSelectedProblem(updatedProb);
      setUpdateNote('');
      setUpdateMediaUrls([]);
      setStatusNotice({
        type: 'offline',
        text: 'Case update saved locally — pending sync.'
      });
    }
  };

  const displayedProblems = sortProblemsBySeverity(
    problems.filter(p => {
      if (filterModel !== 'ALL') {
        if (!p.motorcycleModel.includes(filterModel)) return false;
      }
      if (!isViewAllMode && filterSeverity !== 'ALL' && p.severity !== filterSeverity) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (p.warningMessageOrCode && p.warningMessageOrCode.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    })
  );

  useEffect(() => {
    if (displayedProblems.length > 0) {
      if (!selectedProblem || !displayedProblems.some(p => p.id === selectedProblem.id)) {
        setSelectedProblem(displayedProblems[0]);
      }
    }
  }, [filterModel, filterSeverity, isViewAllMode, searchQuery, problems]);

  const getSeverityBadge = (sev: ProblemReport['severity']) => {
    const rank = getSeverityRank(sev);
    switch (rank) {
      case 1:
        return (
          <span className="px-2 py-0.5 rounded bg-[#E04F5F]/20 text-[#E04F5F] border border-[#E04F5F]/40 font-bold">
            🔴 CRITICAL PRIORITY
          </span>
        );
      case 2:
        return (
          <span className="px-2 py-0.5 rounded bg-[#F97316]/20 text-[#FB923C] border border-[#F97316]/40 font-bold">
            🟠 HIGH PRIORITY
          </span>
        );
      case 3:
        return (
          <span className="px-2 py-0.5 rounded bg-[#EAB308]/20 text-[#FACC15] border border-[#EAB308]/40 font-semibold">
            🟡 MODERATE
          </span>
        );
      case 4:
        return (
          <span className="px-2 py-0.5 rounded bg-[#A855F7]/20 text-[#C084FC] border border-[#A855F7]/40 font-semibold">
            🟣 LOW
          </span>
        );
      case 5:
      default:
        return (
          <span className="px-2 py-0.5 rounded bg-[#191D22] text-[#707883] border border-[#282D34]">
            INFORMATIONAL
          </span>
        );
    }
  };

  const prioritySections = [
    {
      rank: 1,
      id: 'critical',
      label: '🔴 Critical Priority',
      headerClass: 'bg-[#E04F5F]/15 border-[#E04F5F]/40 text-[#FCA5A5]',
      items: displayedProblems.filter(p => getSeverityRank(p.severity) === 1)
    },
    {
      rank: 2,
      id: 'high',
      label: filterModel === 'F77' ? '🟠 High-Priority Issues' : '🟠 High Priority',
      headerClass: 'bg-[#F97316]/15 border-[#F97316]/40 text-[#FDBA74]',
      items: displayedProblems.filter(p => getSeverityRank(p.severity) === 2)
    },
    {
      rank: 3,
      id: 'moderate',
      label: filterModel === 'F77' ? '🟡 Medium-Priority Issues' : '🟡 Moderate',
      headerClass: 'bg-[#EAB308]/15 border-[#EAB308]/40 text-[#FEF08A]',
      items: displayedProblems.filter(p => getSeverityRank(p.severity) === 3)
    },
    {
      rank: 4,
      id: 'low',
      label: filterModel === 'F77' ? '🟣 Low-Priority / Owner-Manageable Issues' : '🟣 Low',
      headerClass: 'bg-[#A855F7]/15 border-[#A855F7]/40 text-[#E9D5FF]',
      items: displayedProblems.filter(p => getSeverityRank(p.severity) === 4)
    },
    {
      rank: 5,
      id: 'info',
      label: '⚪ Informational',
      headerClass: 'bg-[#191D22] border-[#282D34] text-[#A0A7B0]',
      items: displayedProblems.filter(p => getSeverityRank(p.severity) >= 5)
    }
  ].filter(sec => sec.items.length > 0);

  const renderIssueFullDetails = (prob: ProblemReport, isModal = false) => (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-[#282D34]">
          <div className="text-[10px] font-mono text-[#707883] flex flex-wrap items-center gap-2">
            <span>CASE ID: {prob.id.toUpperCase()}</span>
            <span>•</span>
            <span>LOGGED BY {prob.reporterName || 'Squadron Pilot'}</span>
            {prob.isRecurring && (
              <span className="px-1.5 py-0.5 rounded bg-[#E04F5F]/15 text-[#FCA5A5] border border-[#E04F5F]/30 font-bold">
                RECURRING SYMPTOM
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid={isModal ? 'modal-edit-issue-btn' : 'panel-edit-issue-btn'}
              onClick={() => openEditProblem(prob)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#E8AA45] hover:bg-[#F59E0B] text-[#08090B] font-mono text-xs font-bold transition-colors shadow-sm"
              title="Edit Issue Details"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>EDIT ISSUE</span>
            </button>
            {canUserModifyRecord(currentUser, prob) && (
              <button
                type="button"
                onClick={() => handleDeleteProblem(prob)}
                className="p-1.5 rounded bg-[#191D22] hover:bg-[#E04F5F]/20 text-[#AEB5BE] hover:text-[#E04F5F] border border-[#282D34]"
                title="Delete Issue Report"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            {getSeverityBadge(prob.severity)}
            {isModal && (
              <button
                type="button"
                data-testid="close-issue-detail-modal"
                onClick={() => setShowDetailModal(false)}
                className="p-1.5 rounded bg-[#191D22] hover:bg-[#252A30] text-[#A0A7B0] hover:text-[#F1F3F5] border border-[#282D34]"
                title="Close Full Details"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <h3 className="text-base sm:text-lg font-bold text-[#F1F3F5] leading-snug">{prob.title}</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
        <div className="p-2.5 rounded bg-[#13161A] border border-[#282D34]">
          <div className="text-[10px] text-[#707883]">MODEL & VARIANT</div>
          <div className="text-[#38BDF8] font-bold mt-0.5">
            {prob.motorcycleModel}
            {prob.variant ? ` • ${prob.variant}` : ''}
          </div>
        </div>
        <div className="p-2.5 rounded bg-[#13161A] border border-[#282D34]">
          <div className="text-[10px] text-[#707883]">SYSTEM CATEGORY</div>
          <div className="text-[#F1F3F5] font-semibold mt-0.5">{prob.category}</div>
        </div>
        <div className="p-2.5 rounded bg-[#13161A] border border-[#282D34]">
          <div className="text-[10px] text-[#707883]">CURRENT STATUS</div>
          <div className="text-[#42B883] font-bold mt-0.5">{prob.status}</div>
        </div>
        <div className="p-2.5 rounded bg-[#13161A] border border-[#282D34]">
          <div className="text-[10px] text-[#707883]">FIRST OBSERVED / ODO</div>
          <div className="text-[#F1F3F5] font-semibold mt-0.5">
            {prob.firstObservedDate}
            {prob.mileageKm ? ` • ${prob.mileageKm.toLocaleString()} km` : ''}
          </div>
        </div>
      </div>

      <div className="space-y-3 text-xs font-mono">
        <div>
          <div className="text-[#707883] mb-1">DASH / CAN BUS ERROR CODE:</div>
          <div className="text-[#E8AA45] bg-[#13161A] p-2.5 rounded border border-[#282D34] font-bold">
            {prob.warningMessageOrCode || 'NONE LOGGED'}
          </div>
        </div>

        <div>
          <div className="text-[#707883] mb-1">FULL ISSUE DESCRIPTION:</div>
          <div className="text-[#F1F3F5] bg-[#13161A] p-3.5 rounded border border-[#282D34] leading-relaxed font-sans text-sm">
            {prob.description}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="text-[#707883] mb-1">TROUBLESHOOTING ATTEMPTED:</div>
            <div className="text-[#D4D8DE] bg-[#13161A] p-3 rounded border border-[#282D34] leading-relaxed min-h-[60px]">
              {prob.troubleshootingAttempted || 'No troubleshooting steps logged yet.'}
            </div>
          </div>

          <div>
            <div className="text-[#707883] mb-1">SERVICE VISITS & ACTIONS:</div>
            <div className="text-[#D4D8DE] bg-[#13161A] p-3 rounded border border-[#282D34] leading-relaxed min-h-[60px]">
              {prob.serviceVisits || 'No service visits logged yet.'}
            </div>
          </div>
        </div>

        {/* Evidence Media Section (Photos & Videos) */}
        {((prob.mediaUrls && prob.mediaUrls.length > 0) || prob.photoUrl || prob.videoUrl) && (
          <div className="pt-2 border-t border-[#282D34]/80">
            <div className="text-[#707883] mb-1.5 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 font-bold text-[#D4D8DE] uppercase">
                <Camera className="w-3.5 h-3.5 text-[#E8AA45]" />
                EVIDENCE MEDIA (PHOTOS & VIDEOS)
              </span>
              <span className="text-[10px] text-[#A0A7B0]">
                {(prob.mediaUrls || [prob.photoUrl, prob.videoUrl].filter(Boolean)).length} file(s)
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-[#13161A] p-2.5 rounded border border-[#282D34]">
              {(prob.mediaUrls || [prob.photoUrl, prob.videoUrl].filter(Boolean) as string[]).map((mUrl, mIdx) => {
                const isVid = isVideoMedia(mUrl);
                return (
                  <div
                    key={mIdx}
                    onClick={() => {
                      playTacticalClick();
                      setLightboxMedia({
                        mediaList: prob.mediaUrls || ([prob.photoUrl, prob.videoUrl].filter(Boolean) as string[]),
                        index: mIdx,
                        title: prob.title
                      });
                    }}
                    className="relative bg-[#08090B] border border-[#282D34] hover:border-[#E8AA45]/60 rounded overflow-hidden aspect-video cursor-pointer group transition-all"
                  >
                    {isVid ? (
                      <div className="w-full h-full relative flex items-center justify-center bg-black">
                        <video src={mUrl} className="w-full h-full object-cover opacity-80" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/20 transition-colors">
                          <div className="w-8 h-8 rounded-full bg-[#E8AA45] text-black flex items-center justify-center font-bold">
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          </div>
                        </div>
                        <span className="absolute top-1 left-1 bg-black/80 text-[#E8AA45] text-[9px] font-bold px-1.5 py-0.2 rounded border border-[#E8AA45]/30 flex items-center gap-1">
                          <Film className="w-2.5 h-2.5" /> VIDEO
                        </span>
                      </div>
                    ) : (
                      <div className="w-full h-full relative">
                        <img src={mUrl} alt={`Media ${mIdx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <span className="absolute top-1 left-1 bg-black/80 text-[#42B883] text-[9px] font-bold px-1.5 py-0.2 rounded border border-[#42B883]/30 flex items-center gap-1">
                          <Camera className="w-2.5 h-2.5" /> PHOTO
                        </span>
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Maximize2 className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Progress Timeline & Updates */}
      <div className="space-y-3 pt-3 border-t border-[#282D34] text-xs font-mono">
        <div className="text-xs font-bold text-[#D4D8DE] uppercase">
          PROGRESS TIMELINE & SERVICE UPDATES ({prob.updates?.length || 0})
        </div>

        <div className="space-y-2">
          {prob.updates?.map(u => (
            <div key={u.id} className="p-3 rounded bg-[#13161A] border border-[#282D34] space-y-2">
              <div className="flex items-center justify-between text-[10px] text-[#707883]">
                <span className="text-[#D4D8DE] font-semibold">{u.authorName}</span>
                <span>{u.date}</span>
              </div>
              <div className="text-[11px] text-[#A0A7B0]">{u.note}</div>
              {u.mediaUrls && u.mediaUrls.length > 0 && (
                <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
                  {u.mediaUrls.map((mUrl, mIdx) => (
                    <div
                      key={mIdx}
                      onClick={() => {
                        playTacticalClick();
                        setLightboxMedia({
                          mediaList: u.mediaUrls!,
                          index: mIdx,
                          title: `Update Media by ${u.authorName}`
                        });
                      }}
                      className="w-10 h-10 rounded border border-[#282D34] overflow-hidden bg-[#08090B] cursor-pointer shrink-0 hover:border-[#E8AA45]"
                    >
                      {isVideoMedia(mUrl) ? (
                        <div className="w-full h-full flex items-center justify-center bg-black text-[#E8AA45]">
                          <Film className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <img src={mUrl} alt={`Update media ${mIdx}`} className="w-full h-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add Progress Note Form */}
        <form onSubmit={handleAddUpdate} className="pt-2 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={updateNote}
              onChange={e => setUpdateNote(e.target.value)}
              placeholder="Add diagnostic finding, service update, or resolution note..."
              className="flex-1 bg-[#08090B] border border-[#282D34] rounded px-3 py-2 text-[#F1F3F5] text-xs focus:outline-none"
            />
            <select
              value={newStatusUpdate}
              onChange={e => setNewStatusUpdate(e.target.value as any)}
              className="bg-[#13161A] border border-[#282D34] text-[#D4D8DE] px-2 py-2 rounded text-xs focus:outline-none"
            >
              <option value="Reported">Reported</option>
              <option value="Under Investigation">Under Investigation</option>
              <option value="Service Scheduled">Service Scheduled</option>
              <option value="Resolved">Resolved</option>
              <option value="Recurring">Recurring</option>
            </select>
          </div>

          {updateMediaUrls.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap p-1.5 rounded bg-[#13161A] border border-[#282D34]">
              {updateMediaUrls.map((m, idx) => (
                <div key={idx} className="relative w-12 h-12 bg-[#08090B] border border-[#282D34] rounded overflow-hidden group">
                  {isVideoMedia(m) ? (
                    <video src={m} className="w-full h-full object-cover" />
                  ) : (
                    <img src={m} alt={`Update media ${idx}`} className="w-full h-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveMedia(idx, true)}
                    className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[#E04F5F]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <label className="text-[10px] text-[#A0A7B0] hover:text-[#42B883] cursor-pointer flex items-center gap-1 font-mono">
              <Upload className="w-3 h-3 text-[#42B883]" />
              <span>+ Attach Photo / Video to Update</span>
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={e => handleMediaUpload(e, true)}
                className="hidden"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={!updateNote.trim()}
            className="w-full py-2 bg-[#252A30] hover:bg-[#414851] disabled:opacity-40 text-[#F1F3F5] rounded border border-[#414851] text-xs font-mono font-bold"
          >
            RECORD CASE UPDATE
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-[#13161A] border border-[#282D34] rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded bg-[#191D22] border border-[#414851] flex items-center justify-center text-[#D4D8DE]">
            <Activity className="w-5 h-5 text-[#E8AA45]" />
          </div>
          <div>
            <div className="text-sm font-mono font-bold text-[#F1F3F5] tracking-wider flex items-center gap-2">
              PRIORITY ISSUES
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#252A30] text-[#E8AA45] border border-[#E8AA45]/30">
                LOGS
              </span>
            </div>
            <div className="text-xs text-[#A0A7B0] mt-0.5">
              Press any specific issue below to inspect full details or edit the issue record
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            playTacticalClick();
            setEditingProblemId(null);
            setShowCreateModal(true);
          }}
          className="flex items-center space-x-1.5 px-3.5 py-2 rounded bg-[#252A30] hover:bg-[#414851] text-xs font-mono font-bold text-[#F1F3F5] border border-[#414851] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>REPORT ISSUE</span>
        </button>
      </div>

      {statusNotice && (
        <div
          className={`p-3 rounded-lg border text-xs font-mono flex items-center justify-between ${
            statusNotice.type === 'saved'
              ? 'bg-[#42B883]/15 border-[#42B883]/40 text-[#42B883]'
              : statusNotice.type === 'offline'
              ? 'bg-[#E8AA45]/15 border-[#E8AA45]/40 text-[#E8AA45]'
              : 'bg-[#E04F5F]/15 border-[#E04F5F]/40 text-[#E04F5F]'
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

      {/* Filter and View Controls Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between text-xs font-mono bg-[#13161A] p-3 rounded-lg border border-[#282D34]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              playTacticalClick();
              setIsViewAllMode(true);
              setFilterSeverity('ALL');
              setFilterModel('ALL');
              setSearchQuery('');
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded font-bold transition-all border ${
              isViewAllMode && filterModel === 'ALL'
                ? 'bg-[#E8AA45] text-[#08090B] border-[#E8AA45] shadow-[0_0_12px_rgba(232,170,69,0.3)]'
                : 'bg-[#0D0F12] text-[#D4D8DE] border-[#282D34] hover:border-[#414851] hover:text-[#F1F3F5]'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>View All Problems</span>
          </button>

          <button
            type="button"
            data-testid="btn-filter-model-x47"
            onClick={() => {
              playTacticalClick();
              setFilterModel('X47');
              setIsViewAllMode(false);
            }}
            className={`px-3 py-1.5 rounded font-bold transition-all border ${
              filterModel === 'X47'
                ? 'bg-[#38BDF8] text-[#08090B] border-[#38BDF8] shadow-[0_0_12px_rgba(56,189,248,0.3)]'
                : 'bg-[#0D0F12] text-[#D4D8DE] border-[#282D34] hover:border-[#414851] hover:text-[#F1F3F5]'
            }`}
          >
            X47 Model ({problems.filter(p => p.motorcycleModel.includes('X47')).length})
          </button>

          <button
            type="button"
            data-testid="btn-filter-model-f77"
            onClick={() => {
              playTacticalClick();
              setFilterModel('F77');
              setIsViewAllMode(false);
            }}
            className={`px-3 py-1.5 rounded font-bold transition-all border ${
              filterModel === 'F77'
                ? 'bg-[#42B883] text-[#08090B] border-[#42B883] shadow-[0_0_12px_rgba(66,184,131,0.3)]'
                : 'bg-[#0D0F12] text-[#D4D8DE] border-[#282D34] hover:border-[#414851] hover:text-[#F1F3F5]'
            }`}
          >
            F77 Model ({problems.filter(p => p.motorcycleModel.includes('F77')).length})
          </button>

          <span className="text-[#414851] hidden sm:inline">|</span>

          <select
            value={filterSeverity}
            onChange={e => {
              setFilterSeverity(e.target.value);
              setIsViewAllMode(false);
            }}
            className="bg-[#0D0F12] border border-[#282D34] text-[#D4D8DE] px-3 py-1.5 rounded focus:outline-none focus:border-[#414851]"
          >
            <option value="ALL">FILTER BY SEVERITY</option>
            <option value="Critical / Safety-Related">🔴 Critical Priority</option>
            <option value="High">🟠 High Priority</option>
            <option value="Moderate">🟡 Moderate</option>
            <option value="Low">🟣 Low</option>
            <option value="Informational">Informational</option>
          </select>

          <select
            value={filterModel}
            onChange={e => {
              setFilterModel(e.target.value);
              setIsViewAllMode(false);
            }}
            className="bg-[#0D0F12] border border-[#282D34] text-[#D4D8DE] px-3 py-1.5 rounded focus:outline-none focus:border-[#414851]"
          >
            <option value="ALL">ALL MODELS</option>
            <option value="F77">F77</option>
            <option value="X47">X47</option>
          </select>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#707883]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              if (e.target.value.trim()) {
                setIsViewAllMode(false);
              }
            }}
            placeholder="Search symptoms or error codes..."
            className="bg-[#0D0F12] border border-[#282D34] focus:border-[#414851] rounded pl-8 pr-3 py-1.5 text-[#F1F3F5] text-xs focus:outline-none w-full sm:w-64"
          />
        </div>
      </div>

      {/* View All Mode Indicator */}
      {isViewAllMode && (
        <div className="p-2.5 rounded bg-[#E8AA45]/10 border border-[#E8AA45]/30 text-xs font-mono text-[#E8AA45] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-[#E8AA45]" />
            <span>
              <strong>VIEW ALL PROBLEMS ACTIVE:</strong> Displaying all {problems.length} reported problems organized by priority (🔴 Critical → 🟠 High → 🟡 Moderate → 🟣 Low). Press any issue to view full details or edit.
            </span>
          </div>
        </div>
      )}

      {filterModel === 'F77' && (
        <div
          data-testid="f77-priority-banner"
          className="p-3 rounded-lg bg-[#42B883]/10 border border-[#42B883]/40 text-xs font-mono text-[#42B883] flex items-center justify-between"
        >
          <div className="font-bold tracking-wide">
            Ultraviolette F77 – Owner-Reported Issues &amp; Improvements (18 Priority Issues)
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-black/40 text-[#D4D8DE]">
            HIGH (1–9) • MEDIUM (10–13) • LOW (14–18)
          </span>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-5">
          {displayedProblems.length === 0 ? (
            <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-10 text-center text-xs font-mono text-[#707883]">
              NO PRIORITY ISSUES MATCHING CRITERIA
            </div>
          ) : (
            prioritySections.map(section => (
              <div key={section.id} data-testid={`priority-section-${section.id}`} className="space-y-2.5">
                <div
                  className={`px-3.5 py-2 rounded-lg border font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-between ${section.headerClass}`}
                >
                  <span>{section.label}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-black/40">
                    {section.items.length} {section.items.length === 1 ? 'ISSUE' : 'ISSUES'}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {section.items.map(prob => {
                    const isSelected = selectedProblem?.id === prob.id;
                    return (
                      <div
                        key={prob.id}
                        data-testid={`problem-card-${prob.id}`}
                        onClick={() => {
                          playTacticalClick();
                          setSelectedProblem(prob);
                          setShowDetailModal(true);
                        }}
                        className={`p-4 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[#191D22] border-[#E8AA45]/70 shadow-lg'
                            : 'bg-[#0D0F12] border-[#282D34] hover:border-[#414851]/80'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
                          <span className="text-[#AEB5BE] font-semibold flex items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold ${
                                prob.motorcycleModel.includes('X47')
                                  ? 'bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30'
                                  : 'bg-[#42B883]/15 text-[#42B883] border border-[#42B883]/30'
                              }`}
                            >
                              {prob.motorcycleModel}
                            </span>
                            <span className="text-[#707883]">{prob.category}</span>
                            {(prob as any).pendingSync && (
                              <span className="px-1.5 py-0.2 rounded bg-[#E8AA45]/20 text-[#E8AA45] border border-[#E8AA45]/40">
                                PENDING SYNC
                              </span>
                            )}
                          </span>
                          {getSeverityBadge(prob.severity)}
                        </div>

                        <div className="text-xs font-semibold text-[#F1F3F5] leading-relaxed">
                          {/^\d+\.\s/.test(prob.title) ? prob.title : `• ${prob.title}`}
                        </div>

                        {prob.warningMessageOrCode && (
                          <div className="text-[10px] font-mono text-[#E8AA45] mt-1.5 bg-[#13161A] px-2 py-0.5 rounded w-fit">
                            {prob.warningMessageOrCode}
                          </div>
                        )}

                        {/* Media Badge Indicator */}
                        {((prob.mediaUrls && prob.mediaUrls.length > 0) || prob.photoUrl || prob.videoUrl) && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] font-mono text-[#42B883]">
                            {prob.videoUrl || prob.mediaUrls?.some(m => isVideoMedia(m)) ? (
                              <Film className="w-3 h-3 text-[#E8AA45]" />
                            ) : (
                              <Camera className="w-3 h-3 text-[#42B883]" />
                            )}
                            <span>
                              {prob.mediaUrls?.length || 1} Media Attached (Photo/Video)
                            </span>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-[#282D34] text-[10px] font-mono text-[#707883]">
                          <div className="flex items-center gap-2">
                            <span className="text-[#42B883] font-semibold">STATUS: {prob.status.toUpperCase()}</span>
                            <span>• {prob.firstObservedDate}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              data-testid={`card-view-btn-${prob.id}`}
                              onClick={e => {
                                e.stopPropagation();
                                playTacticalClick();
                                setSelectedProblem(prob);
                                setShowDetailModal(true);
                              }}
                              className="px-2 py-1 rounded bg-[#13161A] hover:bg-[#252A30] text-[#D4D8DE] border border-[#282D34] flex items-center gap-1 font-bold transition-colors"
                            >
                              <Eye className="w-3 h-3 text-[#38BDF8]" />
                              <span>FULL DETAILS</span>
                            </button>
                            <button
                              type="button"
                              data-testid={`card-edit-btn-${prob.id}`}
                              onClick={e => {
                                e.stopPropagation();
                                openEditProblem(prob);
                              }}
                              className="px-2 py-1 rounded bg-[#E8AA45]/15 hover:bg-[#E8AA45]/30 text-[#E8AA45] border border-[#E8AA45]/40 flex items-center gap-1 font-bold transition-colors"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>EDIT</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Selected Issue Detail & Progress Updates */}
        <div className="lg:col-span-7">
          {selectedProblem ? (
            <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-5 lg:sticky lg:top-4">
              {renderIssueFullDetails(selectedProblem, false)}
            </div>
          ) : (
            <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-12 text-center text-xs font-mono text-[#707883]">
              SELECT A PRIORITY ISSUE TO INSPECT DETAILS
            </div>
          )}
        </div>
      </div>

      {/* Modal: Full Details & Actions when User Presses on a Specific Issue */}
      {showDetailModal && selectedProblem && (
        <div
          data-testid="issue-detail-modal"
          onClick={() => setShowDetailModal(false)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-[#0D0F12] border border-[#414851] rounded-xl max-w-3xl w-full p-5 sm:p-6 max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            {renderIssueFullDetails(selectedProblem, true)}
          </div>
        </div>
      )}

      {/* Modal: Report / Edit Issue */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            data-testid="issue-edit-modal"
            className="bg-[#13161A] border border-[#414851] rounded-lg max-w-2xl w-full p-6 space-y-4 font-mono text-xs max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            <div className="flex items-center justify-between text-sm font-bold text-[#F1F3F5] pb-2 border-b border-[#282D34]">
              <span>{editingProblemId ? 'EDIT PRIORITY ISSUE DETAILS' : 'REPORT PRIORITY ISSUE'}</span>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded bg-[#191D22] text-[#A0A7B0] hover:text-[#F1F3F5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProblem} className="space-y-3">
              <div>
                <label className="block text-[#D4D8DE] mb-1">ISSUE TITLE *</label>
                <input
                  type="text"
                  data-testid="input-issue-title"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="e.g. Throttle detent sticky in high humidity"
                  className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#D4D8DE] mb-1">MODEL *</label>
                  <select
                    value={formModel}
                    onChange={e => setFormModel(e.target.value)}
                    className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  >
                    <option value="X47">X47</option>
                    <option value="F77">F77</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#D4D8DE] mb-1">VARIANT</label>
                  <input
                    type="text"
                    value={formVariant}
                    onChange={e => setFormVariant(e.target.value)}
                    placeholder="e.g. Crossover / Recon / Mach 2"
                    className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[#D4D8DE] mb-1">CATEGORY *</label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value as any)}
                    className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  >
                    <option value="Battery & Power">Battery & Power</option>
                    <option value="Motor & Drivetrain">Motor & Drivetrain</option>
                    <option value="Console & Software">Console & Software</option>
                    <option value="Braking & ABS">Braking & ABS</option>
                    <option value="Suspension & Chassis">Suspension & Chassis</option>
                    <option value="Charging System">Charging System</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#D4D8DE] mb-1">PRIORITY / SEVERITY *</label>
                  <select
                    data-testid="select-issue-severity"
                    value={formSeverity}
                    onChange={e => setFormSeverity(e.target.value as any)}
                    className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  >
                    <option value="Critical / Safety-Related">🔴 Critical Priority</option>
                    <option value="High">🟠 High Priority</option>
                    <option value="Moderate">🟡 Moderate</option>
                    <option value="Low">🟣 Low</option>
                    <option value="Informational">Informational</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#D4D8DE] mb-1">CURRENT STATUS *</label>
                  <select
                    data-testid="select-issue-status"
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as any)}
                    className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  >
                    <option value="Reported">Reported</option>
                    <option value="Under Investigation">Under Investigation</option>
                    <option value="Service Scheduled">Service Scheduled</option>
                    <option value="Resolved">Resolved</option>
                    <option value="Recurring">Recurring</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#D4D8DE] mb-1">FIRST OBSERVED DATE</label>
                  <input
                    type="date"
                    value={formFirstObserved}
                    onChange={e => setFormFirstObserved(e.target.value)}
                    className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[#D4D8DE] mb-1">ODOMETER / MILEAGE (KM)</label>
                  <input
                    type="number"
                    min="0"
                    value={formMileageKm}
                    onChange={e => setFormMileageKm(e.target.value)}
                    className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer text-[#D4D8DE] select-none">
                    <input
                      type="checkbox"
                      checked={formIsRecurring}
                      onChange={e => setFormIsRecurring(e.target.checked)}
                      className="rounded border-[#282D34] bg-[#08090B]"
                    />
                    <span>RECURRING SYMPTOM</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[#D4D8DE] mb-1">DASHBOARD WARNING / ERROR CODE (IF ANY)</label>
                <input
                  type="text"
                  value={formWarningCode}
                  onChange={e => setFormWarningCode(e.target.value)}
                  placeholder="e.g. BMS-WARN-DELTA-TEMP / Code 0x5F"
                  className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#D4D8DE] mb-1">FULL ISSUE DESCRIPTION *</label>
                <textarea
                  rows={3}
                  data-testid="textarea-issue-description"
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="Describe operating conditions, symptom details, and frequency..."
                  className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#D4D8DE] mb-1">TROUBLESHOOTING ATTEMPTED</label>
                  <textarea
                    rows={2}
                    data-testid="textarea-issue-troubleshooting"
                    value={formTroubleshooting}
                    onChange={e => setFormTroubleshooting(e.target.value)}
                    placeholder="Key-cycle reset, app cache clear, fuse check..."
                    className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[#D4D8DE] mb-1">SERVICE VISITS & ACTIONS</label>
                  <textarea
                    rows={2}
                    data-testid="textarea-issue-service"
                    value={formServiceVisits}
                    onChange={e => setFormServiceVisits(e.target.value)}
                    placeholder="Hangar visit dates, technician notes, parts replaced..."
                    className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
                  />
                </div>
              </div>

              {/* Photos & Videos Upload Section */}
              <div className="p-3 rounded bg-[#08090B] border border-[#282D34] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[#D4D8DE] font-bold flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-[#E8AA45]" />
                    PHOTOS & VIDEOS (EVIDENCE MEDIA)
                  </label>
                  <span className="text-[10px] text-[#A0A7B0]">
                    {formMediaUrls.length} file(s) attached
                  </span>
                </div>
                <p className="text-[10px] text-[#A0A7B0] leading-relaxed">
                  Upload photos or video clips demonstrating dashboard codes, unusual sounds, or physical symptoms.
                </p>

                {formMediaUrls.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {formMediaUrls.map((mUrl: string, idx: number) => {
                      const isVid = isVideoMedia(mUrl);
                      return (
                        <div key={idx} className="relative bg-[#13161A] border border-[#282D34] rounded overflow-hidden group aspect-video">
                          {isVid ? (
                            <video src={mUrl} className="w-full h-full object-cover" />
                          ) : (
                            <img src={mUrl} alt={`Media ${idx + 1}`} className="w-full h-full object-cover" />
                          )}
                          <div className="absolute top-1 left-1 bg-black/80 text-[#E8AA45] font-mono font-bold text-[8px] px-1 py-0.2 rounded border border-[#E8AA45]/30">
                            {isVid ? 'VIDEO' : 'PHOTO'} {idx + 1}
                          </div>

                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 p-1">
                            {idx > 0 && (
                              <button
                                type="button"
                                onClick={() => handleMoveMedia(idx, 'up')}
                                className="p-1 rounded bg-[#191D22] text-white hover:bg-[#252A30]"
                                title="Move left"
                              >
                                <ChevronLeft className="w-3 h-3" />
                              </button>
                            )}
                            {idx < formMediaUrls.length - 1 && (
                              <button
                                type="button"
                                onClick={() => handleMoveMedia(idx, 'down')}
                                className="p-1 rounded bg-[#191D22] text-white hover:bg-[#252A30]"
                                title="Move right"
                              >
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                playTacticalClick();
                                setLightboxMedia({
                                  mediaList: formMediaUrls,
                                  index: idx,
                                  title: `Evidence ${idx + 1}`
                                });
                              }}
                              className="p-1 rounded bg-[#191D22] text-[#42B883] hover:bg-[#252A30]"
                              title="Preview"
                            >
                              <Maximize2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveMedia(idx, false)}
                              className="p-1 rounded bg-[#191D22] text-[#E04F5F] hover:bg-[#E04F5F]/20"
                              title="Remove"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <label className="flex items-center justify-center gap-2 p-2.5 rounded bg-[#13161A] border border-dashed border-[#282D34] hover:border-[#E8AA45]/60 cursor-pointer transition-colors text-center block">
                  <Upload className="w-3.5 h-3.5 text-[#E8AA45]" />
                  <span className="text-xs text-[#D4D8DE] font-semibold">
                    + {formMediaUrls.length > 0 ? 'ADD MORE PHOTOS / VIDEOS' : 'UPLOAD PHOTOS OR VIDEOS'}
                  </span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={e => handleMediaUpload(e, false)}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#282D34]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded bg-[#191D22] text-[#A0A7B0]"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  data-testid="save-issue-btn"
                  className="px-4 py-2 rounded bg-[#E8AA45] hover:bg-[#F59E0B] text-[#08090B] font-bold transition-colors"
                >
                  {editingProblemId ? 'SAVE CHANGES' : 'TRANSMIT REPORT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Media Lightbox Modal for Photos and Videos */}
      {lightboxMedia && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm font-mono text-xs">
          <div className="relative max-w-4xl w-full flex flex-col items-center space-y-3">
            <div className="w-full flex items-center justify-between text-xs text-[#D4D8DE] px-2">
              <span className="font-semibold text-[#E8AA45] flex items-center gap-1.5 truncate">
                <Film className="w-4 h-4 text-[#E8AA45] shrink-0" />
                {lightboxMedia.title || 'EVIDENCE MEDIA VIEWER'}
              </span>
              <div className="flex items-center gap-3 shrink-0 ml-2">
                <span className="text-[#A0A7B0]">
                  FILE {lightboxMedia.index + 1} OF {lightboxMedia.mediaList.length}
                </span>
                <button
                  type="button"
                  onClick={() => setLightboxMedia(null)}
                  className="p-1.5 rounded bg-[#191D22] text-[#707883] hover:text-[#F1F3F5] hover:bg-[#252A30] transition-colors"
                  title="Close viewer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="relative w-full flex items-center justify-center bg-[#0D0F12] border border-[#282D34] rounded-lg overflow-hidden max-h-[75vh] p-2">
              {isVideoMedia(lightboxMedia.mediaList[lightboxMedia.index]) ? (
                <video
                  src={lightboxMedia.mediaList[lightboxMedia.index]}
                  controls
                  autoPlay
                  className="max-h-[72vh] w-auto object-contain rounded"
                />
              ) : (
                <img
                  src={lightboxMedia.mediaList[lightboxMedia.index]}
                  alt={`Evidence ${lightboxMedia.index + 1}`}
                  className="max-h-[72vh] w-auto object-contain rounded"
                />
              )}

              {lightboxMedia.mediaList.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      setLightboxMedia(prev =>
                        prev
                          ? {
                              ...prev,
                              index: (prev.index - 1 + prev.mediaList.length) % prev.mediaList.length
                            }
                          : null
                      );
                    }}
                    className="absolute left-3 p-2 rounded-full bg-black/75 hover:bg-black text-[#F1F3F5] border border-[#282D34] transition-all hover:scale-110"
                    title="Previous file"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      setLightboxMedia(prev =>
                        prev
                          ? {
                              ...prev,
                              index: (prev.index + 1) % prev.mediaList.length
                            }
                          : null
                      );
                    }}
                    className="absolute right-3 p-2 rounded-full bg-black/75 hover:bg-black text-[#F1F3F5] border border-[#282D34] transition-all hover:scale-110"
                    title="Next file"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            {lightboxMedia.mediaList.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto py-1 max-w-full">
                {lightboxMedia.mediaList.map((mItem: string, mIdx: number) => (
                  <button
                    key={mIdx}
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      setLightboxMedia(prev => (prev ? { ...prev, index: mIdx } : null));
                    }}
                    className={`w-12 h-12 rounded border overflow-hidden shrink-0 transition-all ${
                      lightboxMedia.index === mIdx
                        ? 'border-[#E8AA45] ring-1 ring-[#E8AA45] scale-105'
                        : 'border-[#282D34] opacity-50 hover:opacity-100'
                    }`}
                  >
                    {isVideoMedia(mItem) ? (
                      <div className="w-full h-full bg-black flex items-center justify-center text-[#E8AA45]">
                        <Film className="w-4 h-4" />
                      </div>
                    ) : (
                      <img src={mItem} alt={`Thumb ${mIdx + 1}`} className="w-full h-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
