import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Cpu,
  Send,
  ThumbsUp,
  ThumbsDown,
  Flag,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Edit2,
  Trash2,
  CloudOff,
  Bookmark,
  Zap,
  Sliders,
  Search,
  X,
  Camera,
  Upload,
  ChevronLeft,
  ChevronRight,
  Maximize2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { JetEngineerSubmission } from '../types';
import { BackButton } from './BackButton';
import { isAdminOrOwnerAccount } from '../utils/rules';
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
  generateOfflineJetEngineerResponse,
  gpApiFetch,
  OFFLINE_SYNC_EVENT
} from '../utils/telemetryCache';
import { AvionicsToggleTransition, motion } from './AvionicsTransition';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  source?: string;
  aiPowered?: boolean;
  stepPhotos?: string[];
  timestamp: string;
  helpfulRating?: 'helpful' | 'unhelpful';
  reported?: boolean;
}

interface JetEngineerProps {
  initialTab?: 'ask' | 'train';
  initialModel?: 'F77' | 'X47' | 'Both';
}

const DEFAULT_WELCOME_MSG: Message = {
  id: 'm_welcome',
  sender: 'assistant',
  text: 'Hi, Pilot. How can I assist you today? The Jet Engineer operates as an offline empirical diagnostic engine, querying manufacturer specs and the verified TRAIN database entries added by squadron members and admins.',
  source: 'Offline Tactical Engine & Ghost Protocol Knowledge Base',
  aiPowered: false,
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
};

export const DEFAULT_PRESET_SUBMISSIONS: JetEngineerSubmission[] = [
  {
    id: 'js_01',
    userId: 'u_pilot07',
    authorName: 'Vikram Sengupta (Apex)',
    title: 'Regen Level 9 Calibration in Wet Monsoon Conditions',
    motorcycleModel: 'F77 MACH 2',
    variant: '10.3 kWh Recon',
    symptoms: 'Aggressive rear wheel slip during throttle roll-off on wet painted road markings when Dynamic Regen is set to Level 9 or 10.',
    operatingConditions: 'Wet tarmac, ambient temperature 22°C, MRF SteelX tyres at 36 PSI.',
    troubleshootingAttempted: 'Dialled down Dynamic Regen to Level 4 in Glide mode. Slip eliminated.',
    serviceCentreFindings: 'Technician verified traction control sensitivity is tuned for linear deceleration; excessive regen on low-friction road paint can cause momentary rear wheel deceleration slip before ABS/TCS modulation.',
    resolutionOutcome: 'Recommended rider practice: In wet weather, set Dynamic Regen to Level 3 or 4, switch traction control to Rain mode, and avoid harsh off-throttle over road paint.',
    proposedSolution: 'Add wet-weather regen safety guideline to knowledge base.',
    status: 'Approved',
    isPreset: true,
    reviewerNotes: 'Technically sound and directly matches Ultraviolette owner handbook safety advisory for wet road conditions.',
    reviewerId: 'u_admin',
    createdAt: '2026-09-10T16:00:00Z',
    reviewedAt: '2026-09-12T10:00:00Z'
  },
  {
    id: 'js_02',
    userId: 'u_admin',
    authorName: 'Abinav Thejas (Vanguard)',
    title: 'Thermal Derate on 60kW DC Fast Chargers',
    motorcycleModel: 'F77 MACH 2',
    variant: 'Laser Black (10.3 kWh)',
    symptoms: 'Charging throttles from 1.5C down to 0.4C with BMS-WARN-DELTA-TEMP warning icon when plugging in immediately after sustained high-speed Combat riding.',
    operatingConditions: 'Highway touring, ambient temperature 39°C, post-highway fast charge.',
    troubleshootingAttempted: 'Parked in shade for 12-15 minutes key-off to let pack temperature equilibrate.',
    serviceCentreFindings: 'BMS thermal safety boundary active above 46°C core cell temperature. Battery cooling circuit safely throttles charge current to prevent dendritic stress.',
    resolutionOutcome: 'Allow motorcycle a 15-minute key-off cold-soak in shade before plugging into high-power DC fast chargers when ambient exceeds 38°C.',
    proposedSolution: 'Cold soak protocol before high-power DC charging.',
    status: 'Approved',
    isPreset: true,
    reviewerNotes: 'Verified manufacturer thermal throttling threshold. Normal protective BMS behavior.',
    reviewerId: 'u_admin',
    createdAt: '2026-09-15T12:00:00Z',
    reviewedAt: '2026-09-15T14:00:00Z'
  },
  {
    id: 'js_03',
    userId: 'u_pilot07',
    authorName: 'Vikram Sengupta (Apex)',
    title: 'Carbon Drive Belt Acoustic Tension Tuning (210 Hz)',
    motorcycleModel: 'F77',
    variant: 'All Variants',
    symptoms: 'Low-frequency resonant hum or flutter between 45 km/h and 55 km/h under light regenerative load.',
    operatingConditions: 'City commuting, dry conditions, 4,500 km odometer check.',
    troubleshootingAttempted: 'Checked belt deflection using mechanical finger gauge.',
    serviceCentreFindings: 'Gates Carbon Drive tension had drifted from factory 210 Hz specification down to 175 Hz due to initial run-in elongation.',
    resolutionOutcome: 'Adjust rear axle eccentric tensioners equally to achieve 205-215 Hz resonance using an acoustic sonic frequency gauge or smartphone tension app.',
    proposedSolution: 'Sonic belt tension tuning standard operating procedure.',
    status: 'Approved',
    isPreset: true,
    reviewerNotes: 'Manufacturer standard spec for F77 carbon belt is 210 Hz ± 10 Hz.',
    reviewerId: 'u_admin',
    createdAt: '2026-09-20T09:00:00Z',
    reviewedAt: '2026-09-21T11:00:00Z'
  },
  {
    id: 'js_04',
    userId: 'u_pilot07',
    authorName: 'Devika Nair (Valkyrie)',
    title: 'TFT Console BLE Sync Recovery & Cold Reboot',
    motorcycleModel: 'F77',
    variant: 'F77 MACH 2',
    symptoms: 'Ultraviolette companion mobile app shows "Device Disconnected" despite active Bluetooth pairing, navigation turn-by-turn arrows freeze.',
    operatingConditions: 'Post-OTA firmware update reboot cycle.',
    troubleshootingAttempted: 'Toggled phone Bluetooth and restarted UV smartphone application.',
    serviceCentreFindings: 'Console BLE stack socket hung in unacknowledged handshake state after rapid key cycles.',
    resolutionOutcome: 'Perform a clean cold reboot: Key-off the motorcycle, toggle the kill switch to OFF, wait 45 seconds for capacitor discharge, key-on with kill switch engaged, then re-pair via UV mobile app.',
    proposedSolution: 'Hardware 45-second console cold discharge procedure.',
    status: 'Approved',
    isPreset: true,
    reviewerNotes: 'Standard 45-second capacitor discharge procedure verified effective across all model years.',
    reviewerId: 'u_admin',
    createdAt: '2026-09-25T14:30:00Z',
    reviewedAt: '2026-09-26T08:00:00Z'
  },
  {
    id: 'js_05',
    userId: 'u_admin',
    authorName: 'Abinav Thejas (Vanguard)',
    title: 'BMS Delta Voltage Balancing Protocol',
    motorcycleModel: 'F77',
    variant: '10.3 kWh Pack',
    symptoms: 'Displayed State-of-Charge drops abruptly by 3-5% when decelerating from 90% down to 85% during cold morning departures.',
    operatingConditions: 'Ambient temperature below 16°C, after prolonged partial shallow charging sessions.',
    troubleshootingAttempted: 'Performed slow overnight AC balance charge to 100%.',
    serviceCentreFindings: 'Occasional delta imbalance of 18mV between series modules caused by repeated 20-80% fast-charging without full saturation top balancing.',
    resolutionOutcome: 'Perform a full 100% saturation charge via standard AC Pod or 15A socket and leave connected for 60-90 minutes post-100% to allow the BMS passive balance resistors to equalize series string delta.',
    proposedSolution: 'Periodic overnight AC saturation cell balancing protocol.',
    status: 'Approved',
    isPreset: true,
    reviewerNotes: 'Critical preventive battery longevity measure. Recommend once every 3-4 weeks.',
    reviewerId: 'u_admin',
    createdAt: '2026-10-02T10:00:00Z',
    reviewedAt: '2026-10-03T12:00:00Z'
  }
];

const DRAFT_KEY = 'jet_engineer_train_form';

export const JetEngineer: React.FC<JetEngineerProps> = ({
  initialTab = 'ask',
  initialModel = 'F77'
}) => {
  const { currentUser } = useAuth();
  const { playTacticalClick, playChime, playAlert, reducedMotion } = useAudio();
  const isAdminOrOwner = isAdminOrOwnerAccount(currentUser);

  const [activeTab, setActiveTab] = useState<'ask' | 'train'>(initialTab);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [presetFilterQuery, setPresetFilterQuery] = useState('');

  // Initialize messages from local cache so Q&A survives refresh
  const [messages, setMessages] = useState<Message[]>(() => {
    const cached = loadFromCache<Message[]>(CACHE_KEYS.JET_QA_HISTORY, []);
    return cached && cached.length > 0 ? cached : [DEFAULT_WELCOME_MSG];
  });
  const [inputQuery, setInputQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState<'F77' | 'X47' | 'Both'>(initialModel);
  const [loadingAnswer, setLoadingAnswer] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setSelectedModel(initialModel);
    setTrainForm(prev => ({ ...prev, motorcycleModel: initialModel }));
  }, [initialModel]);

  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [reportModalMessageId, setReportModalMessageId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [lightboxPhotos, setLightboxPhotos] = useState<{ photos: string[]; index: number; title?: string } | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // TRAIN MODE STATE
  const [submissions, setSubmissions] = useState<JetEngineerSubmission[]>(() =>
    loadFromCache<JetEngineerSubmission[]>(CACHE_KEYS.JET_SUBMISSIONS, [])
  );
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);

  const rawDraft = loadFormDraft<any>(DRAFT_KEY, {});
  const initialDraft = {
    title: rawDraft.title || '',
    motorcycleModel: rawDraft.motorcycleModel || (initialModel as string),
    variant: rawDraft.variant || '',
    symptoms: rawDraft.symptoms || '',
    operatingConditions: rawDraft.operatingConditions || '',
    troubleshootingAttempted: rawDraft.troubleshootingAttempted || '',
    serviceCentreFindings: rawDraft.serviceCentreFindings || '',
    resolutionOutcome: rawDraft.resolutionOutcome || '',
    proposedSolution: rawDraft.proposedSolution || '',
    sourceReferences: rawDraft.sourceReferences || '',
    stepPhotos: Array.isArray(rawDraft.stepPhotos) ? rawDraft.stepPhotos : [],
    isPreset: Boolean(rawDraft.isPreset)
  };

  const [trainForm, setTrainForm] = useState(initialDraft);
  const [submittingTrain, setSubmittingTrain] = useState(false);
  const [trainSuccessNotice, setTrainSuccessNotice] = useState<string | null>(null);

  const handleStepPhotosUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newPhotos: string[] = [];
    let readCount = 0;
    const fileList = Array.from(files);

    fileList.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result && typeof event.target.result === 'string') {
          newPhotos.push(event.target.result);
        }
        readCount++;
        if (readCount === fileList.length) {
          setTrainForm(prev => ({
            ...prev,
            stepPhotos: [...(prev.stepPhotos || []), ...newPhotos]
          }));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveStepPhoto = (index: number) => {
    playTacticalClick();
    setTrainForm(prev => ({
      ...prev,
      stepPhotos: (prev.stepPhotos || []).filter((_: string, i: number) => i !== index)
    }));
  };

  const handleMoveStepPhoto = (index: number, direction: 'up' | 'down') => {
    playTacticalClick();
    const current = [...(trainForm.stepPhotos || [])];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= current.length) return;
    const temp = current[index];
    current[index] = current[targetIndex];
    current[targetIndex] = temp;
    setTrainForm(prev => ({ ...prev, stepPhotos: current }));
  };

  useEffect(() => {
    if (
      !editingSubmissionId &&
      (trainForm.title || trainForm.symptoms || trainForm.resolutionOutcome || trainForm.troubleshootingAttempted || trainForm.stepPhotos.length > 0)
    ) {
      saveFormDraft(DRAFT_KEY, trainForm);
    }
  }, [trainForm, editingSubmissionId]);

  // Persist messages to local cache whenever updated
  useEffect(() => {
    if (messages.length > 0) {
      saveToCache(CACHE_KEYS.JET_QA_HISTORY, messages);
    }
  }, [messages]);

  useEffect(() => {
    fetchSubmissions();
    fetchServerHistory();
    const handleSync = () => {
      fetchSubmissions();
      fetchServerHistory();
    };
    window.addEventListener(OFFLINE_SYNC_EVENT, handleSync);
    return () => window.removeEventListener(OFFLINE_SYNC_EVENT, handleSync);
  }, [currentUser?.id]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, loadingAnswer]);

  const fetchServerHistory = async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetch(`/api/jet-engineer/history?userId=${encodeURIComponent(currentUser.id)}`);
      if (res.ok) {
        const data = await res.json();
        const historyItems: any[] = data.history || [];
        if (historyItems.length > 0) {
          const rebuilt: Message[] = [DEFAULT_WELCOME_MSG];
          // History items are newest-first on server; reverse for chronological chat
          [...historyItems].reverse().forEach(item => {
            rebuilt.push({
              id: `m_u_${item.id}`,
              sender: 'user',
              text: item.question,
              timestamp: new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            rebuilt.push({
              id: `m_a_${item.id}`,
              sender: 'assistant',
              text: item.answer,
              source: item.source,
              aiPowered: item.aiPowered,
              timestamp: new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
          });
          setMessages(rebuilt);
          saveToCache(CACHE_KEYS.JET_QA_HISTORY, rebuilt);
        }
      }
    } catch {
      // Keep cached messages when offline
    }
  };

  const fetchSubmissions = async () => {
    try {
      const res = await fetch('/api/jet-engineer/submissions');
      if (res.ok) {
        const data = await res.json();
        const serverSubs: JetEngineerSubmission[] = data.submissions || [];
        const merged = reconcileCollectionWithCache<JetEngineerSubmission>(CACHE_KEYS.JET_SUBMISSIONS, serverSubs);
        setSubmissions(merged);
        saveToCache(CACHE_KEYS.JET_SUBMISSIONS, merged);
      }
    } catch (err) {
      const cached = loadFromCache<JetEngineerSubmission[]>(CACHE_KEYS.JET_SUBMISSIONS, []);
      if (cached.length > 0) setSubmissions(cached);
    }
  };

  const saveQaPairToBackend = async (question: string, answer: string, source: string, aiPowered: boolean) => {
    if (!currentUser?.id) return;
    const clientRequestId = `jqa_req_${Date.now()}`;
    const payload = {
      userId: currentUser.id,
      question,
      answer,
      modelContext: selectedModel,
      source,
      aiPowered,
      clientRequestId
    };
    try {
      await fetch('/api/jet-engineer/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || 'u_admin',
          'x-client-request-id': clientRequestId
        },
        body: JSON.stringify(payload)
      });
    } catch {
      enqueueOfflineAction('/api/jet-engineer/history', 'POST', payload, 'Jet Engineer Q&A Log', clientRequestId);
    }
  };

  const handleAsk = async (queryText?: string) => {
    const textToSend = (queryText || inputQuery).trim();
    if (!textToSend || loadingAnswer) return;

    playTacticalClick();
    setErrorNotice(null);

    const userMsg: Message = {
      id: `m_user_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputQuery('');
    setLoadingAnswer(true);

    try {
      const res = await gpApiFetch('/api/jet-engineer/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: textToSend,
          modelContext: selectedModel
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Server error querying The Jet Engineer');
      }

      const data = await res.json();
      playChime();

      const assistantMsg: Message = {
        id: `m_eng_${Date.now()}`,
        sender: 'assistant',
        text: data.answer,
        source: data.source,
        aiPowered: false,
        stepPhotos: data.stepPhotos,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, assistantMsg]);
      await saveQaPairToBackend(textToSend, data.answer, data.source || 'Offline Tactical Base', false);
    } catch {
      // Offline fallback: synthesize verified technical response from cached knowledge base and problem logs
      const cachedProblems = loadFromCache<any[]>(CACHE_KEYS.PROBLEMS, []);
      const offlineResult = generateOfflineJetEngineerResponse(
        textToSend,
        selectedModel,
        submissions,
        cachedProblems
      );
      playChime();
      const assistantMsg: Message = {
        id: `m_eng_off_${Date.now()}`,
        sender: 'assistant',
        text: offlineResult.answer,
        source: offlineResult.source,
        aiPowered: false,
        stepPhotos: offlineResult.stepPhotos,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, assistantMsg]);
      await saveQaPairToBackend(textToSend, offlineResult.answer, offlineResult.source, false);
    } finally {
      setLoadingAnswer(false);
    }
  };

  const handleRating = (msgId: string, rating: 'helpful' | 'unhelpful') => {
    playTacticalClick();
    setMessages(prev =>
      prev.map(m => (m.id === msgId ? { ...m, helpfulRating: rating } : m))
    );
  };

  const submitReport = () => {
    if (!reportModalMessageId) return;
    playTacticalClick();
    setMessages(prev =>
      prev.map(m => (m.id === reportModalMessageId ? { ...m, reported: true } : m))
    );
    setReportModalMessageId(null);
    setReportReason('');
  };

  const openEditSubmission = (sub: JetEngineerSubmission) => {
    playTacticalClick();
    setEditingSubmissionId(sub.id);
    setTrainForm({
      title: sub.title,
      motorcycleModel: sub.motorcycleModel,
      variant: sub.variant || '',
      symptoms: sub.symptoms,
      operatingConditions: sub.operatingConditions || '',
      troubleshootingAttempted: sub.troubleshootingAttempted || '',
      serviceCentreFindings: sub.serviceCentreFindings || '',
      resolutionOutcome: sub.resolutionOutcome,
      proposedSolution: sub.proposedSolution || '',
      sourceReferences: sub.sourceReferences || '',
      stepPhotos: sub.stepPhotos || (sub.photoUrl ? [sub.photoUrl] : []),
      isPreset: Boolean(sub.isPreset)
    });
  };

  const handleDeleteSubmission = async (sub: JetEngineerSubmission) => {
    if (!currentUser) return;
    playTacticalClick();
    recordDeletedId(sub.id);
    try {
      const res = await gpApiFetch(`/api/jet-engineer/submissions/${sub.id}?userId=${encodeURIComponent(currentUser.id)}`, {
        method: 'DELETE'
      });
      if (res.ok || (sub as any).pendingSync) {
        const next = submissions.filter(s => s.id !== sub.id);
        setSubmissions(next);
        saveToCache(CACHE_KEYS.JET_SUBMISSIONS, next);
      }
    } catch {
      const next = submissions.filter(s => s.id !== sub.id);
      setSubmissions(next);
      saveToCache(CACHE_KEYS.JET_SUBMISSIONS, next);
    }
  };

  const handleTrainSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trainForm.title || !trainForm.symptoms || !trainForm.resolutionOutcome) {
      setErrorNotice('Please fill all mandatory submission fields.');
      return;
    }

    setSubmittingTrain(true);
    playTacticalClick();

    const clientRequestId = `jet_req_${Date.now()}`;
    const payload = {
      ...trainForm,
      userId: currentUser?.id,
      authorName: currentUser?.fullName || 'Squadron Pilot',
      clientRequestId
    };

    try {
      const url = editingSubmissionId
        ? `/api/jet-engineer/submissions/${editingSubmissionId}`
        : '/api/jet-engineer/submissions';
      const method = editingSubmissionId ? 'PUT' : 'POST';

      const res = await gpApiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-client-request-id': clientRequestId
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        playChime();
        clearFormDraft(DRAFT_KEY);
        setTrainSuccessNotice(
          editingSubmissionId
            ? 'Empirical record updated and saved permanently.'
            : 'Empirical data recorded and saved permanently. Status: Submitted.'
        );
        if (data.submission) {
          const updatedList = editingSubmissionId
            ? submissions.map(s => (s.id === data.submission.id ? data.submission : s))
            : [data.submission, ...submissions.filter(s => s.id !== data.submission.id)];
          setSubmissions(updatedList);
          saveToCache(CACHE_KEYS.JET_SUBMISSIONS, updatedList);
        }
        setEditingSubmissionId(null);
        setTrainForm({
          title: '',
          motorcycleModel: 'F77',
          variant: '',
          symptoms: '',
          operatingConditions: '',
          troubleshootingAttempted: '',
          serviceCentreFindings: '',
          resolutionOutcome: '',
          proposedSolution: '',
          sourceReferences: '',
          stepPhotos: [],
          isPreset: false
        });
        setTimeout(() => setTrainSuccessNotice(null), 6000);
      }
    } catch (err) {
      enqueueOfflineAction(
        editingSubmissionId
          ? `/api/jet-engineer/submissions/${editingSubmissionId}`
          : '/api/jet-engineer/submissions',
        editingSubmissionId ? 'PUT' : 'POST',
        payload,
        'Jet Engineer Training Submission',
        clientRequestId
      );
      const localSub: any = {
        ...payload,
        id: editingSubmissionId || `jsub_local_${Date.now()}`,
        status: 'Submitted',
        submittedAt: new Date().toISOString().split('T')[0],
        pendingSync: true
      };
      const updated = editingSubmissionId
        ? submissions.map(s => (s.id === editingSubmissionId ? localSub : s))
        : [localSub, ...submissions];
      setSubmissions(updated);
      saveToCache(CACHE_KEYS.JET_SUBMISSIONS, updated);
      clearFormDraft(DRAFT_KEY);
      setEditingSubmissionId(null);
      setTrainForm({
        title: '',
        motorcycleModel: 'F77',
        variant: '',
        symptoms: '',
        operatingConditions: '',
        troubleshootingAttempted: '',
        serviceCentreFindings: '',
        resolutionOutcome: '',
        proposedSolution: '',
        sourceReferences: '',
        stepPhotos: [],
        isPreset: false
      });
      setTrainSuccessNotice('Saved locally — pending sync. Your empirical record will sync automatically when online.');
    } finally {
      setSubmittingTrain(false);
    }
  };

  const activePresets = useMemo(() => {
    const fromSubs = submissions.filter(s => Boolean(s.isPreset));
    if (fromSubs.length > 0) return fromSubs;
    return DEFAULT_PRESET_SUBMISSIONS;
  }, [submissions]);

  const filteredSubmissionsForPresets = submissions.filter(s => {
    if (!presetFilterQuery.trim()) return true;
    const q = presetFilterQuery.toLowerCase();
    return (
      (s.title || '').toLowerCase().includes(q) ||
      (s.symptoms || '').toLowerCase().includes(q) ||
      (s.resolutionOutcome || '').toLowerCase().includes(q) ||
      (s.motorcycleModel || '').toLowerCase().includes(q) ||
      (s.authorName || '').toLowerCase().includes(q)
    );
  });

  const handleTogglePreset = async (sub: JetEngineerSubmission) => {
    if (!currentUser || !isAdminOrOwner) return;
    playTacticalClick();
    const nextState = !sub.isPreset;
    const updated = submissions.map(s =>
      s.id === sub.id ? { ...s, isPreset: nextState, presetUpdatedAt: new Date().toISOString() } : s
    );
    setSubmissions(updated);
    saveToCache(CACHE_KEYS.JET_SUBMISSIONS, updated);

    try {
      const res = await gpApiFetch(`/api/jet-engineer/submissions/${sub.id}/preset`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPreset: nextState })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.submission) {
          const fresh = submissions.map(s => (s.id === sub.id ? { ...s, ...data.submission } : s));
          setSubmissions(fresh);
          saveToCache(CACHE_KEYS.JET_SUBMISSIONS, fresh);
        }
      }
    } catch {
      // Local optimistic cache update already applied
    }
  };

  const handleTriggerPreset = async (preset: JetEngineerSubmission) => {
    playTacticalClick();
    if (activeTab !== 'ask') {
      setActiveTab('ask');
    }
    const userMsg: Message = {
      id: `m_user_pre_${Date.now()}`,
      sender: 'user',
      text: `[INSTANT SOLUTION REQUEST] ${preset.title}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const presetPhotos = preset.stepPhotos && preset.stepPhotos.length > 0
      ? preset.stepPhotos
      : preset.photoUrl
      ? [preset.photoUrl]
      : undefined;

    const solutionBody = [
      `[INSTANT EMPIRICAL SOLUTION: ${preset.title}]`,
      `• Platform Model: ${preset.motorcycleModel}${preset.variant ? ` (${preset.variant})` : ''}`,
      `• Verification: ${preset.status === 'Approved' ? 'Verified Hangar / Admin Approved' : 'Empirical Community Record'}`,
      `\nOPERATIONAL RESOLUTION:`,
      `${preset.resolutionOutcome || preset.proposedSolution}`,
      preset.symptoms && preset.symptoms !== '--' ? `\nTECHNICAL SYMPTOMS:\n• ${preset.symptoms}` : '',
      preset.troubleshootingAttempted && preset.troubleshootingAttempted !== 'None reported'
        ? `\nFIELD TROUBLESHOOTING:\n• ${preset.troubleshootingAttempted}`
        : '',
      preset.serviceCentreFindings ? `\nHANGAR FINDINGS:\n• ${preset.serviceCentreFindings}` : '',
      presetPhotos && presetPhotos.length > 0 ? `\n• STEP-BY-STEP INSTRUCTION PHOTOS ATTACHED: ${presetPhotos.length} photo(s) available below.` : '',
      `\nSOURCE ATTRIBUTION:`,
      `Logged in TRAIN database by ${preset.authorName} • Reference: ${preset.sourceReferences || 'Tactical Empirical Database'}`
    ]
      .filter(Boolean)
      .join('\n');

    const assistantMsg: Message = {
      id: `m_inst_${Date.now()}`,
      sender: 'assistant',
      text: solutionBody,
      source: `Database Preset: ${preset.title}`,
      aiPowered: false,
      stepPhotos: presetPhotos,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    playChime();
    setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }, 60);

    await saveQaPairToBackend(
      `[INSTANT SOLUTION] ${preset.title}`,
      solutionBody,
      `Database Preset: ${preset.title}`,
      false
    );
  };

  return (
    <div className="space-y-6">
      {/* Header and Option Selector */}
      <div className="bg-[#13161A] border border-[#282D34] rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded bg-[#191D22] border border-[#414851] flex items-center justify-center text-[#D4D8DE]">
              <Cpu className="w-5 h-5 text-[#D4D8DE]" />
            </div>
            <div>
              <div className="text-sm font-mono font-bold text-[#F1F3F5] tracking-wider flex items-center gap-2">
                THE JET ENGINEER
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#252A30] text-[#42B883] border border-[#42B883]/30">
                  OFFLINE ENGINE
                </span>
              </div>
              <div className="text-xs text-[#A0A7B0] mt-0.5">
                Technical Knowledge Base & Empirical Owner Assistance System
              </div>
            </div>
          </div>

          {/* Distinct Two-Option Selector */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-md bg-[#0D0F12] border border-[#282D34] text-xs font-mono shrink-0">
            <button
              onClick={() => {
                playTacticalClick();
                setActiveTab('ask');
              }}
              className={`relative px-3.5 py-1.5 rounded font-semibold transition-colors cursor-pointer ${
                activeTab === 'ask'
                  ? 'text-[#F1F3F5]'
                  : 'text-[#707883] hover:text-[#D4D8DE]'
              }`}
            >
              {activeTab === 'ask' && (
                <motion.span
                  layoutId="jet-engineer-mode-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="pointer-events-none absolute inset-0 rounded bg-[#191D22] border border-[#414851]"
                />
              )}
              <span className="relative z-10">HELP</span>
            </button>
            <button
              onClick={() => {
                playTacticalClick();
                setActiveTab('train');
              }}
              className={`relative px-3.5 py-1.5 rounded font-semibold transition-colors cursor-pointer ${
                activeTab === 'train'
                  ? 'text-[#F1F3F5]'
                  : 'text-[#707883] hover:text-[#D4D8DE]'
              }`}
            >
              {activeTab === 'train' && (
                <motion.span
                  layoutId="jet-engineer-mode-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="pointer-events-none absolute inset-0 rounded bg-[#191D22] border border-[#414851]"
                />
              )}
              <span className="relative z-10">TRAIN</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* HELP / TRAIN TOGGLE TRANSITION                            */}
      {/* ========================================================= */}
      <AvionicsToggleTransition
        activeKey={activeTab}
        orderedKeys={['ask', 'train']}
        accentColor="emerald"
        reducedMotion={reducedMotion}
      >
      {activeTab === 'ask' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Offline Chatbot Column (8 Cols) */}
          <div className="lg:col-span-8 flex flex-col space-y-3">
            {/* Quick Solution Presets - Positioned directly on top of the offline chatbot */}
            <div
              data-testid="jet-engineer-quick-presets-bar"
              className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#F1F3F5] uppercase tracking-wide">
                  <Sparkles className="w-3.5 h-3.5 text-[#42B883]" />
                  <span>QUICK PRESETS</span>
                  <span className="text-[10px] font-normal text-[#707883] hidden sm:inline">
                    (Tap preset for instant solution)
                  </span>
                </div>
                {isAdminOrOwner && (
                  <button
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      setShowPresetManager(true);
                    }}
                    data-testid="manage-presets-btn"
                    className="px-2 py-0.5 rounded bg-[#191D22] hover:bg-[#252A30] text-[10px] font-mono text-[#42B883] border border-[#42B883]/40 flex items-center gap-1 transition-colors cursor-pointer"
                    title="Choose presets from database"
                  >
                    <Sliders className="w-2.5 h-2.5" />
                    <span>MANAGE</span>
                  </button>
                )}
              </div>

              {/* Ultra-compact presets: ONLY show main heading, nothing else */}
              <div
                role="group"
                aria-label="Quick Solution Presets"
                className="flex flex-wrap items-center gap-1.5"
              >
                {activePresets.length === 0 ? (
                  <div className="text-[11px] text-[#707883] font-mono py-1">
                    No presets configured.
                  </div>
                ) : (
                  activePresets.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`quick-preset-btn-${preset.id}`}
                      onClick={() => handleTriggerPreset(preset)}
                      title={`Get instant solution: ${preset.title}`}
                      className="px-2.5 py-1 rounded bg-[#13161A] hover:bg-[#191D22] active:bg-[#252A30] border border-[#282D34] hover:border-[#42B883] text-[#D4D8DE] hover:text-[#42B883] text-[11px] font-mono font-medium transition-all text-left truncate max-w-full cursor-pointer shadow-sm active:scale-95"
                    >
                      {preset.title}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Offline Chatbot Container */}
            <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg flex flex-col h-[580px]">
              {/* Model Context Header Bar */}
              <div className="p-3.5 bg-[#13161A] border-b border-[#282D34] flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-2">
                  <span className="text-[#707883]">PLATFORM MODEL:</span>
                  <select
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value as any)}
                    className="bg-[#08090B] border border-[#414851] text-[#D4D8DE] px-2 py-1 rounded text-xs focus:outline-none"
                  >
                    <option value="F77">F77</option>
                    <option value="X47">X47</option>
                    <option value="Both">Both</option>
                  </select>
                </div>
                <div className="text-[11px] text-[#42B883] flex items-center gap-1.5 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#42B883] animate-pulse"></span>
                  OFFLINE TACTICAL ENGINE
                </div>
              </div>

              {/* Messages Scroll Area */}
              <div ref={chatContainerRef} className="flex-1 p-4 overflow-y-auto space-y-4">
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.sender === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg p-4 text-xs leading-relaxed whitespace-pre-wrap ${
                        msg.sender === 'user'
                          ? 'bg-[#252A30] text-[#F1F3F5] border border-[#414851]'
                          : 'bg-[#13161A] text-[#D4D8DE] border border-[#282D34]'
                      }`}
                    >
                      {msg.sender === 'assistant' && (
                        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[#282D34] text-[10px] font-mono text-[#707883]">
                          <span className="text-[#42B883] font-semibold flex items-center gap-1">
                            <Cpu className="w-3 h-3" /> THE JET ENGINEER
                          </span>
                          <span>{msg.timestamp}</span>
                        </div>
                      )}

                      <div className="text-sm font-sans text-[#F1F3F5] leading-normal">{msg.text}</div>

                      {/* Step-by-step instruction photos attached */}
                      {msg.stepPhotos && msg.stepPhotos.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-[#282D34] space-y-2">
                          <div className="text-[10px] font-mono text-[#42B883] font-semibold flex items-center gap-1.5">
                            <Camera className="w-3.5 h-3.5 text-[#42B883]" />
                            STEP-BY-STEP INSTRUCTION PHOTOS ({msg.stepPhotos.length})
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {msg.stepPhotos.map((photo, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  playTacticalClick();
                                  setLightboxPhotos({
                                    photos: msg.stepPhotos!,
                                    index: idx,
                                    title: msg.source || 'Step-by-Step Instruction Photo'
                                  });
                                }}
                                className="relative group rounded border border-[#282D34] bg-[#08090B] overflow-hidden aspect-video hover:border-[#42B883]/60 transition-all text-left"
                              >
                                <img
                                  src={photo}
                                  alt={`Step ${idx + 1}`}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                />
                                <div className="absolute top-1 left-1 bg-black/80 text-[#42B883] font-mono font-bold text-[9px] px-1.5 py-0.5 rounded border border-[#42B883]/30">
                                  STEP {idx + 1}
                                </div>
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Maximize2 className="w-4 h-4 text-white" />
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Source Citations & Safety Footnote */}
                      {msg.source && (
                        <div className="mt-3 pt-2 border-t border-[#282D34] text-[10px] font-mono text-[#707883] flex items-center justify-between">
                          <span className="truncate">SOURCE: {msg.source}</span>
                          <span className="text-[#AEB5BE] shrink-0 ml-2">VERIFIED REF</span>
                        </div>
                      )}
                    </div>

                    {/* Feedback Controls on Assistant Messages */}
                    {msg.sender === 'assistant' && msg.id !== 'm_welcome' && (
                      <div className="flex items-center space-x-3 mt-1.5 px-1 text-[11px] font-mono text-[#707883]">
                        <button
                          onClick={() => handleRating(msg.id, 'helpful')}
                          className={`hover:text-[#42B883] flex items-center gap-1 transition-colors ${
                            msg.helpfulRating === 'helpful' ? 'text-[#42B883] font-bold' : ''
                          }`}
                          title="Mark answer helpful"
                        >
                          <ThumbsUp className="w-3 h-3" />
                          <span>HELPFUL</span>
                        </button>
                        <button
                          onClick={() => handleRating(msg.id, 'unhelpful')}
                          className={`hover:text-[#E04F5F] flex items-center gap-1 transition-colors ${
                            msg.helpfulRating === 'unhelpful' ? 'text-[#E04F5F] font-bold' : ''
                          }`}
                          title="Mark answer unhelpful"
                        >
                          <ThumbsDown className="w-3 h-3" />
                          <span>UNHELPFUL</span>
                        </button>
                        <button
                          onClick={() => setReportModalMessageId(msg.id)}
                          className={`hover:text-[#E8AA45] flex items-center gap-1 transition-colors ${
                            msg.reported ? 'text-[#E8AA45] font-bold' : ''
                          }`}
                          title="Report incorrect answer"
                        >
                          <Flag className="w-3 h-3" />
                          <span>{msg.reported ? 'REPORTED' : 'REPORT ISSUE'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {loadingAnswer && (
                  <div className="flex items-center space-x-2 text-xs font-mono text-[#AEB5BE] p-3 bg-[#13161A] rounded border border-[#282D34] w-fit">
                    <div className="w-2 h-2 rounded-full bg-[#42B883] animate-ping"></div>
                    <span>ANALYZING MOTORCYCLE TELEMETRY & SPECS...</span>
                  </div>
                )}

                {errorNotice && (
                  <div className="p-3 rounded bg-[#E04F5F]/10 border border-[#E04F5F]/40 text-xs text-[#E04F5F] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{errorNotice}</span>
                  </div>
                )}
              </div>

              {/* Input Form */}
              <div className="p-3.5 bg-[#13161A] border-t border-[#282D34]">
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    handleAsk();
                  }}
                  className="flex items-center space-x-2"
                >
                  <input
                    type="text"
                    value={inputQuery}
                    onChange={e => setInputQuery(e.target.value)}
                    placeholder="Ask regarding battery, charging, warning codes, service protocols..."
                    className="flex-1 bg-[#08090B] border border-[#282D34] focus:border-[#414851] rounded px-3 py-2 text-xs text-[#F1F3F5] focus:outline-none font-sans"
                    disabled={loadingAnswer}
                  />
                  <button
                    type="submit"
                    disabled={!inputQuery.trim() || loadingAnswer}
                    className="px-4 py-2 bg-[#252A30] hover:bg-[#414851] disabled:opacity-40 text-xs font-mono font-semibold text-[#F1F3F5] rounded border border-[#414851] transition-colors flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>TRANSMIT</span>
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Technical Diagnostics Sidebar (4 Cols) */}
          <div className="lg:col-span-4 space-y-4">
            {/* Database Telemetry Intel Card */}
            <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-4 font-mono text-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[#D4D8DE] font-semibold flex items-center gap-1.5 uppercase">
                  <Cpu className="w-3.5 h-3.5 text-[#42B883]" />
                  DATABASE INTEL
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#191D22] text-[#42B883] border border-[#42B883]/30">
                  {submissions.length} RECORDS
                </span>
              </div>
              <p className="text-[11px] text-[#A0A7B0] leading-relaxed">
                The Jet Engineer queries manufacturer specifications and empirical field logs submitted by verified squadron pilots.
              </p>
              <button
                type="button"
                onClick={() => {
                  playTacticalClick();
                  setActiveTab('train');
                }}
                className="w-full py-2 px-3 rounded bg-[#191D22] hover:bg-[#252A30] border border-[#414851] hover:border-[#42B883] text-[#F1F3F5] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>+ CONTRIBUTE TO TRAIN DB</span>
              </button>
            </div>

            {/* Official Grounding & Safety Guidance Notice */}
            <div className="bg-[#13161A] border border-[#282D34] rounded-lg p-4 text-xs font-mono space-y-3">
              <div className="text-[#D4D8DE] font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#42B883]" />
                DIAGNOSTIC SAFETY RULES
              </div>
              <p className="text-[11px] text-[#A0A7B0] leading-relaxed">
                1. High-voltage battery disassembly outside authorized Ultraviolette service facilities is strictly prohibited.
              </p>
              <p className="text-[11px] text-[#A0A7B0] leading-relaxed">
                2. If a red flashing BMS triangle or High Voltage Interlock warning displays, pull over safely, key-off, and contact Squadron Assist.
              </p>
              <p className="text-[11px] text-[#707883] leading-relaxed pt-2 border-t border-[#282D34]">
                Answers distinguish between factory engineering specifications and empirical community logs.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TRAIN: THE JET ENGINEER */}
      {/* ========================================================= */}
      {activeTab === 'train' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Submission Form (7 Cols) */}
          <div className="lg:col-span-7 bg-[#0D0F12] border border-[#282D34] rounded-lg p-5">
            <div className="pb-3 mb-4 border-b border-[#282D34] flex items-center justify-between">
              <div>
                <div className="text-sm font-mono font-bold text-[#F1F3F5]">
                  {editingSubmissionId ? 'EDIT EMPIRICAL TELEMETRY' : 'SUBMIT EMPIRICAL TELEMETRY'}
                </div>
                <div className="text-xs text-[#A0A7B0] mt-0.5">
                  Empirical troubleshooting, service findings, and resolutions submitted here enter the moderation pipeline and directly ground the offline Jet Engineer diagnostic engine.
                </div>
              </div>
              {editingSubmissionId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSubmissionId(null);
                    setTrainForm({
                      title: '',
                      motorcycleModel: 'F77',
                      variant: '',
                      symptoms: '',
                      operatingConditions: '',
                      troubleshootingAttempted: '',
                      serviceCentreFindings: '',
                      resolutionOutcome: '',
                      proposedSolution: '',
                      sourceReferences: '',
                      stepPhotos: [],
                      isPreset: false
                    });
                  }}
                  className="text-xs font-mono text-[#707883] hover:text-[#F1F3F5]"
                >
                  CANCEL EDIT
                </button>
              )}
            </div>

            {trainSuccessNotice && (
              <div className="mb-4 p-3 rounded bg-[#42B883]/15 border border-[#42B883]/40 text-xs text-[#42B883] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{trainSuccessNotice}</span>
              </div>
            )}

            <form onSubmit={handleTrainSubmit} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-[#D4D8DE] mb-1">ISSUE / FINDING TITLE *</label>
                <input
                  type="text"
                  value={trainForm.title}
                  onChange={e => setTrainForm({ ...trainForm, title: e.target.value })}
                  placeholder="e.g. Dynamic Regen Level 9 modulation on wet painted road markings"
                  className="w-full bg-[#13161A] border border-[#282D34] focus:border-[#414851] rounded px-3 py-2 text-[#F1F3F5] focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#D4D8DE] mb-1">MOTORCYCLE MODEL *</label>
                  <select
                    value={trainForm.motorcycleModel}
                    onChange={e => setTrainForm({ ...trainForm, motorcycleModel: e.target.value })}
                    className="w-full bg-[#13161A] border border-[#282D34] text-[#F1F3F5] px-3 py-2 rounded focus:outline-none"
                  >
                    <option value="F77">F77</option>
                    <option value="X47">X47</option>
                    <option value="Both">Both</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#D4D8DE] mb-1">VARIANT / PACK</label>
                  <input
                    type="text"
                    value={trainForm.variant}
                    onChange={e => setTrainForm({ ...trainForm, variant: e.target.value })}
                    placeholder="10.3 kWh Laser Black / 7.1 kWh"
                    className="w-full bg-[#13161A] border border-[#282D34] rounded px-3 py-2 text-[#F1F3F5] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#D4D8DE] mb-1">SYMPTOMS OBSERVED *</label>
                <textarea
                  rows={2}
                  value={trainForm.symptoms}
                  onChange={e => setTrainForm({ ...trainForm, symptoms: e.target.value })}
                  placeholder="Exact behavior, dash warning messages, sound, or throttle response..."
                  className="w-full bg-[#13161A] border border-[#282D34] rounded px-3 py-2 text-[#F1F3F5] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[#D4D8DE] mb-1">OPERATING CONDITIONS</label>
                <input
                  type="text"
                  value={trainForm.operatingConditions}
                  onChange={e => setTrainForm({ ...trainForm, operatingConditions: e.target.value })}
                  placeholder="e.g. Ambient 38°C, monsoon wet tarmac, high-speed Combat mode"
                  className="w-full bg-[#13161A] border border-[#282D34] rounded px-3 py-2 text-[#F1F3F5] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#D4D8DE] mb-1">TROUBLESHOOTING STEPS ATTEMPTED</label>
                <textarea
                  rows={2}
                  value={trainForm.troubleshootingAttempted}
                  onChange={e => setTrainForm({ ...trainForm, troubleshootingAttempted: e.target.value })}
                  placeholder="Actions taken, power cycles, cold-soak cooling, regen re-adjustments..."
                  className="w-full bg-[#13161A] border border-[#282D34] rounded px-3 py-2 text-[#F1F3F5] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#D4D8DE] mb-1">SERVICE CENTRE FINDINGS (IF VISITED)</label>
                <input
                  type="text"
                  value={trainForm.serviceCentreFindings}
                  onChange={e => setTrainForm({ ...trainForm, serviceCentreFindings: e.target.value })}
                  placeholder="Official technician diagnosis, firmware flash version, hardware inspection"
                  className="w-full bg-[#13161A] border border-[#282D34] rounded px-3 py-2 text-[#F1F3F5] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#D4D8DE] mb-1">CONFIRMED RESOLUTION / REPAIR OUTCOME *</label>
                <textarea
                  rows={3}
                  value={trainForm.resolutionOutcome}
                  onChange={e => setTrainForm({ ...trainForm, resolutionOutcome: e.target.value })}
                  placeholder="What specifically resolved the issue? Detail the verified solution..."
                  className="w-full bg-[#13161A] border border-[#282D34] rounded px-3 py-2 text-[#F1F3F5] focus:outline-none"
                  required
                />
              </div>

              {/* Step-by-Step Instruction Photos Upload */}
              <div className="p-3.5 rounded bg-[#13161A] border border-[#282D34] space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[#D4D8DE] font-semibold flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-[#42B883]" />
                    STEP-BY-STEP INSTRUCTION PHOTOS (OPTIONAL)
                  </label>
                  <span className="text-[10px] text-[#A0A7B0]">
                    {trainForm.stepPhotos?.length || 0} photo(s) attached
                  </span>
                </div>
                <p className="text-[11px] text-[#A0A7B0] leading-relaxed">
                  Upload step-by-step photos illustrating diagnostic or repair procedures. Other pilots will see these visual guides when asking help from the offline chatbot.
                </p>

                {trainForm.stepPhotos && trainForm.stepPhotos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {trainForm.stepPhotos.map((photo: string, idx: number) => (
                      <div
                        key={idx}
                        className="relative bg-[#08090B] border border-[#282D34] rounded overflow-hidden group aspect-video"
                      >
                        <img
                          src={photo}
                          alt={`Step ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-1 left-1 bg-black/80 text-[#42B883] font-mono font-bold text-[9px] px-1.5 py-0.5 rounded border border-[#42B883]/30">
                          STEP {idx + 1}
                        </div>

                        {/* Hover Overlay Controls */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-1">
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => handleMoveStepPhoto(idx, 'up')}
                              className="p-1 rounded bg-[#191D22] text-[#F1F3F5] hover:bg-[#252A30]"
                              title="Move photo left"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {idx < (trainForm.stepPhotos?.length || 0) - 1 && (
                            <button
                              type="button"
                              onClick={() => handleMoveStepPhoto(idx, 'down')}
                              className="p-1 rounded bg-[#191D22] text-[#F1F3F5] hover:bg-[#252A30]"
                              title="Move photo right"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              playTacticalClick();
                              setLightboxPhotos({
                                photos: trainForm.stepPhotos!,
                                index: idx,
                                title: `Step ${idx + 1} Preview`
                              });
                            }}
                            className="p-1 rounded bg-[#191D22] text-[#42B883] hover:bg-[#252A30]"
                            title="Preview photo"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveStepPhoto(idx)}
                            className="p-1 rounded bg-[#191D22] text-[#E04F5F] hover:bg-[#E04F5F]/20"
                            title="Remove photo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <label className="flex items-center justify-center gap-2 p-3 rounded bg-[#08090B] border border-dashed border-[#282D34] hover:border-[#42B883]/60 cursor-pointer transition-colors text-center block">
                  <Upload className="w-4 h-4 text-[#42B883]" />
                  <span className="text-xs text-[#D4D8DE] font-semibold">
                    + {trainForm.stepPhotos && trainForm.stepPhotos.length > 0 ? 'ADD MORE STEP PHOTOS' : 'UPLOAD STEP-BY-STEP PHOTOS'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleStepPhotosUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {isAdminOrOwner && (
                <label className="flex items-center gap-2.5 cursor-pointer p-2.5 rounded bg-[#13161A] border border-[#282D34] hover:border-[#42B883]/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={Boolean(trainForm.isPreset)}
                    onChange={e => setTrainForm({ ...trainForm, isPreset: e.target.checked })}
                    className="rounded bg-[#08090B] border-[#414851] text-[#42B883] focus:ring-0 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs text-[#D4D8DE] font-semibold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#42B883]" />
                    Feature as Instant Quick Preset for all pilots
                  </span>
                </label>
              )}

              <button
                type="submit"
                disabled={submittingTrain}
                className="w-full py-2.5 px-4 rounded bg-[#252A30] hover:bg-[#414851] text-xs font-mono font-bold text-[#F1F3F5] border border-[#414851] transition-colors"
              >
                {submittingTrain
                  ? 'TRANSMITTING EMPIRICAL RECORD...'
                  : editingSubmissionId
                  ? 'SAVE EMPIRICAL RECORD CHANGES'
                  : 'SUBMIT FOR SQUADRON REVIEW'}
              </button>
            </form>
          </div>

          {/* Submissions Pipeline & Approved Knowledge Base (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-4">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#282D34]">
                <div className="text-xs font-mono font-semibold text-[#D4D8DE] uppercase">
                  SUBMISSION REVIEW PIPELINE
                </div>
                <span className="text-[10px] font-mono text-[#707883]">
                  {submissions.length} LOGGED
                </span>
              </div>

              <div className="space-y-3 max-h-[520px] overflow-y-auto">
                {submissions.length === 0 ? (
                  <div className="text-center py-8 text-xs text-[#707883] font-mono">
                    NO EMPIRICAL SUBMISSIONS
                  </div>
                ) : (
                  submissions.map(sub => {
                    const statusColor =
                      sub.status === 'Approved'
                        ? 'bg-[#42B883]/15 text-[#42B883] border-[#42B883]/30'
                        : sub.status === 'Submitted'
                        ? 'bg-[#729BCB]/15 text-[#729BCB] border-[#729BCB]/30'
                        : sub.status === 'Under Review'
                        ? 'bg-[#E8AA45]/15 text-[#E8AA45] border-[#E8AA45]/30'
                        : 'bg-[#E04F5F]/15 text-[#E04F5F] border-[#E04F5F]/30';
                    const canModify = canUserModifyRecord(currentUser, sub);

                    return (
                      <div
                        key={sub.id}
                        className="p-3 rounded bg-[#13161A] border border-[#282D34] text-xs font-mono space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[#D4D8DE] font-semibold truncate">{sub.title}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {(sub as any).pendingSync && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded border uppercase bg-[#E8AA45]/20 text-[#E8AA45] border-[#E8AA45]/40">
                                PENDING SYNC
                              </span>
                            )}
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase ${statusColor}`}>
                              {sub.status}
                            </span>
                            {isAdminOrOwner && (
                              <button
                                type="button"
                                onClick={() => handleTogglePreset(sub)}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-mono border transition-all flex items-center gap-1 ${
                                  sub.isPreset
                                    ? 'bg-[#42B883]/20 border-[#42B883]/50 text-[#42B883]'
                                    : 'bg-[#191D22] border-[#282D34] text-[#707883] hover:text-[#D4D8DE]'
                                }`}
                                title={sub.isPreset ? 'Click to remove from Quick Presets' : 'Click to feature as Quick Preset'}
                              >
                                <Bookmark className="w-2.5 h-2.5 fill-current" />
                                <span>{sub.isPreset ? 'PRESET' : '+ PRESET'}</span>
                              </button>
                            )}
                            {canModify && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditSubmission(sub)}
                                  className="p-1 rounded bg-[#191D22] hover:bg-[#252A30] text-[#AEB5BE] hover:text-[#F1F3F5]"
                                  title="Edit Submission"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSubmission(sub)}
                                  className="p-1 rounded bg-[#191D22] hover:bg-[#E04F5F]/20 text-[#AEB5BE] hover:text-[#E04F5F]"
                                  title="Delete Submission"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-[11px] text-[#A0A7B0]">
                          Model: {sub.motorcycleModel} • Author: {sub.authorName}
                        </div>
                        <div className="text-[11px] text-[#D4D8DE] line-clamp-2 bg-[#0D0F12] p-2 rounded">
                          {sub.resolutionOutcome}
                        </div>

                        {/* Step-by-Step Instruction Photos Thumbnails */}
                        {((sub.stepPhotos && sub.stepPhotos.length > 0) || sub.photoUrl) && (
                          <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
                            <span className="text-[9px] font-mono text-[#42B883] flex items-center gap-1 shrink-0">
                              <Camera className="w-2.5 h-2.5" />
                              {sub.stepPhotos?.length || 1} photo(s):
                            </span>
                            {(sub.stepPhotos || [sub.photoUrl!]).map((pUrl, pIdx) => (
                              <img
                                key={pIdx}
                                src={pUrl}
                                alt={`Step ${pIdx + 1}`}
                                onClick={() => {
                                  playTacticalClick();
                                  setLightboxPhotos({
                                    photos: sub.stepPhotos || [sub.photoUrl!],
                                    index: pIdx,
                                    title: sub.title
                                  });
                                }}
                                className="w-8 h-8 object-cover rounded border border-[#282D34] hover:border-[#42B883] cursor-pointer shrink-0"
                              />
                            ))}
                          </div>
                        )}

                        {sub.reviewerNotes && (
                          <div className="text-[10px] text-[#AEB5BE] border-t border-[#282D34] pt-1">
                            Reviewer note: {sub.reviewerNotes}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </AvionicsToggleTransition>

      {/* Preset Management Modal for Admin/Owner */}
      {showPresetManager && isAdminOrOwner && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#13161A] border border-[#414851] rounded-lg max-w-xl w-full p-5 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#282D34]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#42B883]" />
                <span className="text-sm font-bold text-[#F1F3F5] uppercase">
                  MANAGE JET ENGINEER PRESETS
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPresetManager(false)}
                className="p-1 rounded text-[#707883] hover:text-[#F1F3F5] hover:bg-[#252A30]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[#A0A7B0] text-[11px] leading-relaxed">
              Select verified solutions uploaded in TRAIN by users or admins to feature as instant one-click presets for all squadron pilots in The Jet Engineer cockpit.
            </p>

            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#707883]" />
                <input
                  type="text"
                  value={presetFilterQuery}
                  onChange={e => setPresetFilterQuery(e.target.value)}
                  placeholder="Search solutions by title, symptoms, or model..."
                  className="w-full bg-[#08090B] border border-[#282D34] rounded pl-9 pr-3 py-2 text-xs text-[#F1F3F5] focus:outline-none focus:border-[#42B883]"
                />
              </div>
              <span className="text-[10px] text-[#42B883] shrink-0 font-bold px-2 py-1 rounded bg-[#42B883]/10 border border-[#42B883]/30">
                {submissions.filter(s => s.isPreset).length} SELECTED
              </span>
            </div>

            <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
              {filteredSubmissionsForPresets.length === 0 ? (
                <div className="text-center py-6 text-[#707883]">
                  No solutions match your search.
                </div>
              ) : (
                filteredSubmissionsForPresets.map(sub => {
                  const isChecked = Boolean(sub.isPreset);
                  return (
                    <div
                      key={sub.id}
                      onClick={() => handleTogglePreset(sub)}
                      className={`p-3 rounded border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                        isChecked
                          ? 'bg-[#42B883]/10 border-[#42B883]/50'
                          : 'bg-[#0D0F12] border-[#282D34] hover:border-[#414851]'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`font-semibold text-xs ${isChecked ? 'text-[#F1F3F5]' : 'text-[#D4D8DE]'}`}>
                            {sub.title}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#191D22] text-[#729BCB] border border-[#282D34]">
                            {sub.motorcycleModel}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded border ${
                            sub.status === 'Approved' ? 'text-[#42B883] border-[#42B883]/30' : 'text-[#E8AA45] border-[#E8AA45]/30'
                          }`}>
                            {sub.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#A0A7B0] line-clamp-2">
                          {sub.resolutionOutcome || sub.proposedSolution}
                        </p>
                        <div className="text-[10px] text-[#707883] mt-1">
                          By {sub.authorName}
                        </div>
                      </div>

                      <div className="pt-0.5 shrink-0">
                        <div
                          className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                            isChecked
                              ? 'bg-[#42B883] border-[#42B883] text-black font-bold'
                              : 'bg-[#191D22] border-[#414851] text-transparent'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 fill-current" />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#282D34]">
              <span className="text-[10px] text-[#707883]">
                Changes save immediately to the database and sync for all pilots.
              </span>
              <button
                type="button"
                onClick={() => setShowPresetManager(false)}
                className="px-4 py-1.5 rounded bg-[#252A30] hover:bg-[#414851] text-xs font-bold text-[#F1F3F5] transition-colors border border-[#414851]"
              >
                DONE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportModalMessageId && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#13161A] border border-[#414851] rounded-lg max-w-md w-full p-5 space-y-4 font-mono text-xs">
            <div className="text-sm font-bold text-[#F1F3F5] flex items-center gap-2">
              <Flag className="w-4 h-4 text-[#E8AA45]" />
              REPORT INACCURATE ASSISTANT ADVICE
            </div>
            <p className="text-[#A0A7B0]">
              Flagging technical answers ensures erroneous or non-compliant service advice is removed from the model grounding cache.
            </p>
            <textarea
              rows={3}
              value={reportReason}
              onChange={e => setReportReason(e.target.value)}
              placeholder="State what aspect was inaccurate, outdated, or potentially hazardous..."
              className="w-full bg-[#08090B] border border-[#282D34] rounded p-2 text-[#F1F3F5] focus:outline-none"
            />
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setReportModalMessageId(null)}
                className="px-3 py-1.5 rounded bg-[#191D22] text-[#A0A7B0] hover:text-[#F1F3F5]"
              >
                CANCEL
              </button>
              <button
                onClick={submitReport}
                className="px-3 py-1.5 rounded bg-[#E8AA45] text-black font-bold"
              >
                SUBMIT REPORT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Lightbox Zoom Viewer for Step Photos */}
      {lightboxPhotos && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
          <div className="relative max-w-4xl w-full flex flex-col items-center space-y-3">
            <div className="w-full flex items-center justify-between text-xs font-mono text-[#D4D8DE] px-2">
              <span className="font-semibold text-[#42B883] flex items-center gap-1.5 truncate">
                <Camera className="w-4 h-4 text-[#42B883] shrink-0" />
                {lightboxPhotos.title || 'STEP-BY-STEP INSTRUCTION PHOTO'}
              </span>
              <div className="flex items-center gap-3 shrink-0 ml-2">
                <span className="text-[#A0A7B0]">
                  STEP {lightboxPhotos.index + 1} OF {lightboxPhotos.photos.length}
                </span>
                <button
                  type="button"
                  onClick={() => setLightboxPhotos(null)}
                  className="p-1.5 rounded bg-[#191D22] text-[#707883] hover:text-[#F1F3F5] hover:bg-[#252A30] transition-colors"
                  title="Close lightbox"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="relative w-full flex items-center justify-center bg-[#0D0F12] border border-[#282D34] rounded-lg overflow-hidden max-h-[75vh] p-2">
              <img
                src={lightboxPhotos.photos[lightboxPhotos.index]}
                alt={`Step ${lightboxPhotos.index + 1}`}
                className="max-h-[72vh] w-auto object-contain rounded"
              />

              {lightboxPhotos.photos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      setLightboxPhotos(prev =>
                        prev
                          ? {
                              ...prev,
                              index: (prev.index - 1 + prev.photos.length) % prev.photos.length
                            }
                          : null
                      );
                    }}
                    className="absolute left-3 p-2 rounded-full bg-black/75 hover:bg-black text-[#F1F3F5] border border-[#282D34] transition-all hover:scale-110"
                    title="Previous step photo"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      setLightboxPhotos(prev =>
                        prev
                          ? {
                              ...prev,
                              index: (prev.index + 1) % prev.photos.length
                            }
                          : null
                      );
                    }}
                    className="absolute right-3 p-2 rounded-full bg-black/75 hover:bg-black text-[#F1F3F5] border border-[#282D34] transition-all hover:scale-110"
                    title="Next step photo"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            {lightboxPhotos.photos.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto py-1 max-w-full">
                {lightboxPhotos.photos.map((photo, pIdx) => (
                  <button
                    key={pIdx}
                    type="button"
                    onClick={() => {
                      playTacticalClick();
                      setLightboxPhotos(prev => (prev ? { ...prev, index: pIdx } : null));
                    }}
                    className={`w-12 h-12 rounded border overflow-hidden shrink-0 transition-all ${
                      lightboxPhotos.index === pIdx
                        ? 'border-[#42B883] ring-1 ring-[#42B883] scale-105'
                        : 'border-[#282D34] opacity-50 hover:opacity-100'
                    }`}
                  >
                    <img src={photo} alt={`Thumb ${pIdx + 1}`} className="w-full h-full object-cover" />
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
