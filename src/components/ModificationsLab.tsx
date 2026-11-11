import React, { useState, useEffect, useRef } from 'react';
import {
  Wrench,
  Plus,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  Upload,
  Camera,
  Image as ImageIcon,
  Edit2,
  Trash2,
  CloudOff,
  Search,
  MapPin,
  Phone,
  Store,
  Link2,
  Loader2,
  Info,
  Zap
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { ModificationItem } from '../types';
import {
  sanitizeGoogleMapsUrl,
  prepareNativePhotoPickerTarget,
  getActivePhotoTarget,
  claimNativePhotoDeliveryBatch,
  hasRecentNativePhotoDelivery,
  pollAndroidPhotoBridgeForTarget,
  processUploadedDevicePhoto,
  createMarketplacePresetIllustration,
  repairBase64JpegIfTruncated
} from '../utils/rules';
import { BackButton } from './BackButton';
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
  gpApiFetch,
  getSessionAuthHeaders,
  OFFLINE_SYNC_EVENT
} from '../utils/telemetryCache';

const DRAFT_KEY = 'modifications_lab_form';
const MODAL_OPEN_SESSION_KEY = 'ghost_mod_lab_add_modal_open';
const PHOTO_BRIDGE_SESSION_STORAGE_KEY = 'ghost_photo_bridge_session_id';

export const ALLOWED_MOD_COMPONENTS: ModificationItem['component'][] = [
  'Aesthetics & Bodywork',
  'Luggage & Touring',
  'Ergonomics & Controls',
  'Crash Protection'
];

export const ALLOWED_MOD_MODELS = ['F77', 'X47'] as const;

function normalizeModComponent(comp?: string): ModificationItem['component'] {
  if (comp && ALLOWED_MOD_COMPONENTS.includes(comp as ModificationItem['component'])) {
    return comp as ModificationItem['component'];
  }
  return 'Aesthetics & Bodywork';
}

function normalizeModModel(modelStr?: string): 'F77' | 'X47' {
  if (modelStr && modelStr.toUpperCase().includes('X47')) {
    return 'X47';
  }
  return 'F77';
}

const FALLBACK_CARBON_WHEELS_SVG = createMarketplacePresetIllustration('carbon_wheels');

function extractModImages(m: ModificationItem): string[] {
  let list: string[] = [];
  if (Array.isArray(m.imageUrls) && m.imageUrls.length > 0) {
    list = m.imageUrls.filter(Boolean);
  } else if (m.imageUrl && m.imageUrl.trim().length > 0) {
    list = [m.imageUrl.trim()];
  }
  const uniqueList = list.filter((url, idx, arr) => arr.indexOf(url) === idx);
  const repairedList = uniqueList
    .map(url => (typeof url === 'string' ? repairBase64JpegIfTruncated(url) : url))
    .filter(Boolean);
  const hasRealPhoto = repairedList.some(url => url !== FALLBACK_CARBON_WHEELS_SVG);
  return hasRealPhoto
    ? repairedList.filter(url => url !== FALLBACK_CARBON_WHEELS_SVG)
    : repairedList;
}

export const ModificationsLab: React.FC = () => {
  const { currentUser } = useAuth();
  const { playTacticalClick, playChime } = useAudio();

  const [mods, setMods] = useState<ModificationItem[]>(() =>
    loadFromCache<ModificationItem[]>(CACHE_KEYS.MODIFICATIONS, [])
  );
  const [loading, setLoading] = useState(true);
  const [selectedMod, setSelectedMod] = useState<ModificationItem | null>(null);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(() => new Set());
  const handleImageError = (url: string) => {
    if (!url) return;
    setFailedImageUrls(prev => {
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  };
  const [showAddModal, setShowAddModalState] = useState<boolean>(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        (sessionStorage.getItem(MODAL_OPEN_SESSION_KEY) === '1' ||
          localStorage.getItem(MODAL_OPEN_SESSION_KEY) === '1')
      );
    } catch {
      return false;
    }
  });
  const setShowAddModal = (open: boolean) => {
    setShowAddModalState(open);
    try {
      if (typeof window !== 'undefined') {
        if (open) {
          sessionStorage.setItem(MODAL_OPEN_SESSION_KEY, '1');
          localStorage.setItem(MODAL_OPEN_SESSION_KEY, '1');
        } else {
          sessionStorage.removeItem(MODAL_OPEN_SESSION_KEY);
          localStorage.removeItem(MODAL_OPEN_SESSION_KEY);
        }
      }
    } catch {
      // Ignore storage errors
    }
  };
  const [editingModId, setEditingModId] = useState<string | null>(null);
  const [componentFilter, setComponentFilter] = useState<string>('ALL');
  const [selectedModelFilter, setSelectedModelFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [statusNotice, setStatusNotice] = useState<{ type: 'saved' | 'offline'; text: string } | null>(null);

  const initialDraft = loadFormDraft(DRAFT_KEY, {
    title: '',
    model: 'F77',
    variant: '',
    component: 'Aesthetics & Bodywork' as ModificationItem['component'],
    difficulty: 'Intermediate' as ModificationItem['difficulty'],
    costRange: '₹5,000 - ₹15,000' as ModificationItem['costRange'],
    compatibilityStatus: 'Verified Compatible' as ModificationItem['compatibilityStatus'],
    isOfficial: false,
    description: '',
    partsUsed: '',
    installationGuide: '',
    safetyConsiderations: '',
    warrantyConsiderations: '',
    uploadedImages: [] as string[],
    productLinks: [{ url: '', name: '' }],
    shopName: '',
    shopMapLink: '',
    shopNumber: ''
  });

  // Form State
  const [title, setTitle] = useState(initialDraft.title);
  const [model, setModel] = useState<'F77' | 'X47'>(normalizeModModel(initialDraft.model));
  const [variant, setVariant] = useState(initialDraft.variant);
  const [component, setComponent] = useState<ModificationItem['component']>(
    normalizeModComponent(initialDraft.component)
  );
  const [difficulty, setDifficulty] = useState<ModificationItem['difficulty']>(initialDraft.difficulty);
  const [costRange, setCostRange] = useState<ModificationItem['costRange']>(initialDraft.costRange);
  const [compatibilityStatus, setCompatibilityStatus] = useState<ModificationItem['compatibilityStatus']>(
    initialDraft.compatibilityStatus
  );
  const [isOfficial, setIsOfficial] = useState(initialDraft.isOfficial);
  const [description, setDescription] = useState(initialDraft.description);
  const [partsUsed, setPartsUsed] = useState(initialDraft.partsUsed);
  const [installationGuide, setInstallationGuide] = useState(initialDraft.installationGuide);
  const [safetyConsiderations, setSafetyConsiderations] = useState(initialDraft.safetyConsiderations);
  const [warrantyConsiderations, setWarrantyConsiderations] = useState(initialDraft.warrantyConsiderations);
  const [uploadedImages, setUploadedImages] = useState<string[]>(() => {
    if (initialDraft.uploadedImages && initialDraft.uploadedImages.length > 0) {
      return initialDraft.uploadedImages;
    }
    try {
      const stored = localStorage.getItem('ghost_current_mod_photos');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [shopName, setShopName] = useState<string>(initialDraft.shopName || '');
  const [shopMapLink, setShopMapLink] = useState<string>(initialDraft.shopMapLink || '');
  const [shopNumber, setShopNumber] = useState<string>(initialDraft.shopNumber || '');

  // Product Links State
  const [productLinks, setProductLinks] = useState<{ url: string; name: string }[]>(
    initialDraft.productLinks?.length > 0 ? initialDraft.productLinks : [{ url: '', name: '' }]
  );
  const [linkErrors, setLinkErrors] = useState<Record<number, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Photo Selection & Camera Capture Refs and State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false);
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [photoBridgeNotice, setPhotoBridgeNotice] = useState<string | null>(null);
  const [showLegacyApkBridgeBanner, setShowLegacyApkBridgeBanner] = useState(false);
  const nativePickerLaunchRef = useRef<{ launchedAt: number; countBefore: number; mode: 'gallery' | 'camera' }>({
    launchedAt: 0,
    countBefore: 0,
    mode: 'gallery'
  });
  const photoBridgeSessionIdRef = useRef<string>('');
  if (!photoBridgeSessionIdRef.current && typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(PHOTO_BRIDGE_SESSION_STORAGE_KEY);
      if (saved && saved.trim()) {
        photoBridgeSessionIdRef.current = saved.trim();
      } else {
        const fresh = `pb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem(PHOTO_BRIDGE_SESSION_STORAGE_KEY, fresh);
        photoBridgeSessionIdRef.current = fresh;
      }
    } catch {
      photoBridgeSessionIdRef.current = `pb_${Date.now()}`;
    }
  }

  const appendIncomingPhotos = (incoming: string[] | string) => {
    const list = Array.isArray(incoming)
      ? incoming.filter(img => typeof img === 'string' && img.trim().length > 0)
      : typeof incoming === 'string' && incoming.trim().length > 0
      ? [incoming.trim()]
      : [];
    if (list.length === 0) return false;

    let addedCount = 0;
    setUploadedImages(prev => {
      const existingSet = new Set(prev);
      const uniqueNew = list.filter(img => !existingSet.has(img));
      addedCount = uniqueNew.length;
      const merged = uniqueNew.length > 0 ? [...prev, ...uniqueNew] : prev;
      try {
        localStorage.setItem('ghost_current_mod_photos', JSON.stringify(merged));
      } catch {}
      return merged;
    });
    setShowLegacyApkBridgeBanner(false);
    nativePickerLaunchRef.current.launchedAt = 0;
    setShowAddModal(true);
    playChime();
    setPhotoBridgeNotice(
      `✓ ${addedCount || list.length} ${(addedCount || list.length) === 1 ? 'photo' : 'photos'} loaded from your device!`
    );
    setTimeout(() => setPhotoBridgeNotice(null), 5000);
    return true;
  };

  // Register global native photo receiver callback, DOM event listener, localStorage poller, and server bridge poller
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pollServerPhotoBridge = async () => {
      const sid = photoBridgeSessionIdRef.current;
      const incoming = await pollAndroidPhotoBridgeForTarget('modifications', sid);
      if (incoming.length > 0) {
        appendIncomingPhotos(incoming);
      }
    };

    (window as any).__ghostReceiveNativePhotos = (incoming: string[] | string) => {
      if (getActivePhotoTarget() !== 'modifications') return;
      const claimed = claimNativePhotoDeliveryBatch('modifications', incoming);
      if (claimed.length > 0) {
        appendIncomingPhotos(claimed);
      }
    };

    const handleNativePhotoEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const activeTarget = getActivePhotoTarget();
      if (Array.isArray(detail) && activeTarget === 'modifications') {
        const claimed = claimNativePhotoDeliveryBatch('modifications', detail);
        if (claimed.length > 0) appendIncomingPhotos(claimed);
      } else if (
        detail &&
        Array.isArray(detail.images) &&
        (detail.target === 'modifications' || (!detail.target && activeTarget === 'modifications'))
      ) {
        const claimed = claimNativePhotoDeliveryBatch('modifications', detail.images);
        if (claimed.length > 0) appendIncomingPhotos(claimed);
      }
    };

    const handleFocusOrVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      pollServerPhotoBridge();
    };

    window.addEventListener('ghost-native-photos', handleNativePhotoEvent);
    window.addEventListener('focus', handleFocusOrVisibility);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);

    pollServerPhotoBridge();

    const pollTimer = setInterval(pollServerPhotoBridge, 600);

    return () => {
      clearInterval(pollTimer);
      window.removeEventListener('ghost-native-photos', handleNativePhotoEvent);
      window.removeEventListener('focus', handleFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
      if ((window as any).__ghostReceiveNativePhotos) {
        delete (window as any).__ghostReceiveNativePhotos;
      }
    };
  }, [showAddModal]);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [selectedMod?.id]);

  useEffect(() => {
    if (
      !editingModId &&
      (title ||
        description ||
        partsUsed ||
        installationGuide ||
        uploadedImages.length > 0 ||
        shopName ||
        shopMapLink ||
        shopNumber)
    ) {
      saveFormDraft(DRAFT_KEY, {
        title,
        model,
        variant,
        component,
        difficulty,
        costRange,
        compatibilityStatus,
        isOfficial,
        description,
        partsUsed,
        installationGuide,
        safetyConsiderations,
        warrantyConsiderations,
        uploadedImages,
        productLinks,
        shopName,
        shopMapLink,
        shopNumber
      });
    }
  }, [
    editingModId,
    title,
    model,
    variant,
    component,
    difficulty,
    costRange,
    compatibilityStatus,
    isOfficial,
    description,
    partsUsed,
    installationGuide,
    safetyConsiderations,
    warrantyConsiderations,
    uploadedImages,
    productLinks,
    shopName,
    shopMapLink,
    shopNumber
  ]);

  useEffect(() => {
    fetchMods();
    const handleSync = () => fetchMods();
    window.addEventListener(OFFLINE_SYNC_EVENT, handleSync);
    return () => window.removeEventListener(OFFLINE_SYNC_EVENT, handleSync);
  }, []);

  const fetchMods = async () => {
    try {
      const res = await fetch('/api/modifications');
      if (res.ok) {
        const data = await res.json();
        const serverMods: ModificationItem[] = (data.modifications || []).map((m: ModificationItem) => ({
          ...m,
          component: normalizeModComponent(m.component)
        }));
        const merged = reconcileCollectionWithCache<ModificationItem>(CACHE_KEYS.MODIFICATIONS, serverMods).map(m => ({
          ...m,
          component: normalizeModComponent(m.component)
        }));
        setMods(merged);
        saveToCache(CACHE_KEYS.MODIFICATIONS, merged);
      }
    } catch (err) {
      const cached = loadFromCache<ModificationItem[]>(CACHE_KEYS.MODIFICATIONS, []).map(m => ({
        ...m,
        component: normalizeModComponent(m.component)
      }));
      if (cached.length > 0) setMods(cached);
    } finally {
      setLoading(false);
    }
  };

  const resetFormForNewSubmission = () => {
    clearFormDraft(DRAFT_KEY);
    try {
      localStorage.removeItem('ghost_current_mod_photos');
    } catch {}
    setEditingModId(null);
    setTitle('');
    setModel((currentUser?.motorcycleModel === 'X47' ? 'X47' : 'F77') as 'F77' | 'X47');
    setVariant('');
    setComponent('Aesthetics & Bodywork');
    setDifficulty('Intermediate');
    setCostRange('₹5,000 - ₹15,000');
    setCompatibilityStatus('Verified Compatible');
    setIsOfficial(false);
    setDescription('');
    setPartsUsed('');
    setInstallationGuide('');
    setSafetyConsiderations('');
    setWarrantyConsiderations('');
    setUploadedImages([]);
    setShopName('');
    setShopMapLink('');
    // Auto-apply mobile number from saved user profile
    setShopNumber(currentUser?.mobile || '');
    setProductLinks([{ url: '', name: '' }]);
    setLinkErrors({});
    setSubmitError(null);
  };

  const handleOpenAddModal = () => {
    playTacticalClick();
    resetFormForNewSubmission();
    setShowAddModal(true);
  };

  const openEditMod = (m: ModificationItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    playTacticalClick();
    setEditingModId(m.id);
    setTitle(m.title);
    setModel(normalizeModModel(m.motorcycleModel));
    setVariant(m.variant || '');
    setComponent(normalizeModComponent(m.component));
    setDifficulty(m.difficulty);
    setCostRange(m.costRange);
    setCompatibilityStatus(m.compatibilityStatus);
    setIsOfficial(m.isOfficialAccessory ?? false);
    setDescription(m.description);
    setPartsUsed(m.partsUsed || '');
    setInstallationGuide(m.installationGuide || '');
    setSafetyConsiderations(m.safetyConsiderations || '');
    setWarrantyConsiderations(m.warrantyConsiderations || '');
    setUploadedImages(extractModImages(m));
    setShopName(m.shopName || '');
    setShopMapLink(m.shopMapLink || '');
    setShopNumber(m.shopNumber || '');
    setProductLinks(
      m.productLinks && m.productLinks.length > 0
        ? m.productLinks.map(l => ({ url: l.url, name: l.name || '' }))
        : [{ url: '', name: '' }]
    );
    setLinkErrors({});
    setSubmitError(null);
    setSelectedMod(null);
    setShowAddModal(true);
  };

  const handleDeleteMod = async (m: ModificationItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentUser) return;
    playTacticalClick();
    recordDeletedId(m.id);
    try {
      const res = await gpApiFetch(`/api/modifications/${m.id}?userId=${encodeURIComponent(currentUser.id)}`, {
        method: 'DELETE',
        headers: getSessionAuthHeaders({ 'x-user-id': currentUser.id })
      });
      if (res.ok || (m as any).pendingSync) {
        const next = mods.filter(item => item.id !== m.id);
        setMods(next);
        saveToCache(CACHE_KEYS.MODIFICATIONS, next);
        if (selectedMod?.id === m.id) {
          setSelectedMod(null);
        }
        setStatusNotice({ type: 'saved', text: 'Modification deleted permanently.' });
        setTimeout(() => setStatusNotice(null), 4000);
      }
    } catch {
      const next = mods.filter(item => item.id !== m.id);
      setMods(next);
      saveToCache(CACHE_KEYS.MODIFICATIONS, next);
      if (selectedMod?.id === m.id) {
        setSelectedMod(null);
      }
    }
  };

  const handleAddProductLink = () => {
    playTacticalClick();
    setProductLinks(prev => [...prev, { url: '', name: '' }]);
  };

  const handleRemoveProductLink = (index: number) => {
    playTacticalClick();
    setProductLinks(prev => prev.filter((_, idx) => idx !== index));
    setLinkErrors(prev => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
  };

  const handleLinkChange = (index: number, field: 'url' | 'name', value: string) => {
    setProductLinks(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });

    if (field === 'url') {
      const trimmed = value.trim();
      if (!trimmed) {
        setLinkErrors(prev => {
          const copy = { ...prev };
          delete copy[index];
          return copy;
        });
      } else if (!/^https?:\/\//i.test(trimmed)) {
        setLinkErrors(prev => ({
          ...prev,
          [index]: 'URL must begin with http:// or https://'
        }));
      } else {
        try {
          const parsed = new URL(trimmed);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            setLinkErrors(prev => ({ ...prev, [index]: 'Invalid protocol' }));
          } else {
            setLinkErrors(prev => {
              const copy = { ...prev };
              delete copy[index];
              return copy;
            });
          }
        } catch (_) {
          setLinkErrors(prev => ({ ...prev, [index]: 'Invalid URL format' }));
        }
      }
    }
  };

  // Resizes and optimizes photos on the client so large phone camera photos never exhaust storage or memory
  const compressImageFile = async (file: File): Promise<string> => {
    return processUploadedDevicePhoto(file);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget || e.target;
    const fileList = inputEl?.files ? Array.from(inputEl.files) : [];
    try {
      if (inputEl) inputEl.value = '';
    } catch (_) {}

    if (fileList.length === 0 || hasRecentNativePhotoDelivery()) return;

    setIsProcessingPhotos(true);
    setSubmitError(null);
    playTacticalClick();

    try {
      const results: string[] = [];
      for (const file of fileList) {
        const compressed = await compressImageFile(file);
        if (compressed && compressed.startsWith('data:image/')) {
          results.push(compressed);
        }
      }
      if (hasRecentNativePhotoDelivery()) {
        return;
      }
      if (results.length > 0) {
        const claimed = claimNativePhotoDeliveryBatch('modifications', results);
        if (claimed.length > 0) {
          appendIncomingPhotos(claimed);
        }
      }
    } catch (err) {
      console.warn('Failed to process image files:', err);
    } finally {
      setIsProcessingPhotos(false);
    }
  };

  const prepareModPhotoPicker = (mode: 'gallery' | 'camera') => {
    setSubmitError(null);
    // The upload form is already open. Do not trigger another state transition
    // before the native file input receives its trusted click.
    prepareNativePhotoPickerTarget('modifications', mode);
  };

  const handleClipboardPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    const files = e.clipboardData?.files;
    const fileList: File[] = [];

    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/') || !files[i].type) {
          fileList.push(files[i]);
        }
      }
    } else if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const f = items[i].getAsFile();
          if (f) fileList.push(f);
        }
      }
    }

    if (fileList.length > 0) {
      e.preventDefault();
      setIsProcessingPhotos(true);
      try {
        const compressed: string[] = [];
        for (const f of fileList) {
          const dataUrl = await compressImageFile(f);
          if (dataUrl && dataUrl.startsWith('data:image/')) {
            compressed.push(dataUrl);
          }
        }
        if (compressed.length > 0) {
          appendIncomingPhotos(compressed);
        }
      } finally {
        setIsProcessingPhotos(false);
      }
      return;
    }

    const pastedText = e.clipboardData?.getData('text/plain')?.trim() || '';
    if (pastedText.startsWith('data:image/') || /^https?:\/\/.+/i.test(pastedText)) {
      e.preventDefault();
      appendIncomingPhotos([pastedText]);
    }
  };

  const handleAddPhotoUrl = () => {
    const trimmed = photoUrlInput.trim();
    if (!trimmed) return;
    if (
      !trimmed.startsWith('http://') &&
      !trimmed.startsWith('https://') &&
      !trimmed.startsWith('data:image/')
    ) {
      setSubmitError('Photo link must begin with http://, https://, or data:image/');
      return;
    }
    setUploadedImages(prev => [...prev, trimmed]);
    setPhotoUrlInput('');
    setShowUrlInput(false);
    playTacticalClick();
  };

  const handleRemoveUploadedImage = (idxToRemove: number) => {
    playTacticalClick();
    setUploadedImages(prev => prev.filter((_, idx) => idx !== idxToRemove));
  };

  const handleCreateMod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description) return;
    setSubmitError(null);

    let hasLinkError = false;
    const newErrors: Record<number, string> = {};

    productLinks.forEach((link, idx) => {
      const trimmedUrl = link.url.trim();
      if (trimmedUrl) {
        if (!/^https?:\/\//i.test(trimmedUrl)) {
          newErrors[idx] = 'URL must begin with http:// or https://';
          hasLinkError = true;
        } else {
          try {
            const parsed = new URL(trimmedUrl);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
              newErrors[idx] = 'Invalid URL protocol';
              hasLinkError = true;
            }
          } catch (_) {
            newErrors[idx] = 'Invalid URL format';
            hasLinkError = true;
          }
        }
      }
    });

    if (shopMapLink.trim() && !/^https?:\/\//i.test(shopMapLink.trim())) {
      setSubmitError('Shop Map Link must begin with http:// or https://');
      return;
    }

    if (hasLinkError) {
      setLinkErrors(newErrors);
      setSubmitError('Please fix invalid product links before submitting.');
      return;
    }

    const filteredProductLinks = productLinks
      .map(l => ({ url: l.url.trim(), name: l.name.trim() }))
      .filter(l => l.url.length > 0);

    playTacticalClick();
    const clientRequestId = `mod_req_${Date.now()}`;
    const normalizedComp = normalizeModComponent(component);
    const payload = {
      userId: currentUser?.id,
      title,
      motorcycleModel: model,
      variant,
      component: normalizedComp,
      difficulty,
      costRange,
      compatibilityStatus,
      isOfficialAccessory: isOfficial,
      description,
      partsUsed,
      installationGuide,
      safetyConsiderations,
      warrantyConsiderations,
      authorName: currentUser?.fullName || 'Squadron Pilot',
      imageUrl: uploadedImages[0] || '',
      imageUrls: uploadedImages,
      productLinks: filteredProductLinks,
      shopName: shopName.trim(),
      shopMapLink: shopMapLink.trim(),
      shopNumber: shopNumber.trim(),
      clientRequestId
    };

    try {
      const url = editingModId ? `/api/modifications/${editingModId}` : '/api/modifications';
      const method = editingModId ? 'PUT' : 'POST';

      const res = await gpApiFetch(url, {
        method,
        headers: getSessionAuthHeaders({
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || '',
          'x-client-request-id': clientRequestId
        }),
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        playChime();
        clearFormDraft(DRAFT_KEY);
        try {
          localStorage.removeItem('ghost_current_mod_photos');
        } catch {}
        setShowAddModal(false);
        setEditingModId(null);
        setTitle('');
        setDescription('');
        setPartsUsed('');
        setInstallationGuide('');
        setUploadedImages([]);
        setShopName('');
        setShopMapLink('');
        setShopNumber('');
        setProductLinks([{ url: '', name: '' }]);
        setLinkErrors({});
        setSubmitError(null);
        if (data.modification) {
          const savedMod: ModificationItem = {
            ...data.modification,
            component: normalizeModComponent(data.modification.component)
          };
          const updatedList = editingModId
            ? mods.map(m => (m.id === savedMod.id ? savedMod : m))
            : [savedMod, ...mods.filter(m => m.id !== savedMod.id)];
          setMods(updatedList);
          saveToCache(CACHE_KEYS.MODIFICATIONS, updatedList);
        }
        setStatusNotice({
          type: 'saved',
          text: editingModId ? 'Modification updated and saved permanently.' : 'Modification published and saved permanently.'
        });
        setTimeout(() => setStatusNotice(null), 4000);
      } else {
        const errData = await res.json();
        setSubmitError(errData.error || 'Failed to submit modification.');
      }
    } catch (err) {
      enqueueOfflineAction(
        editingModId ? `/api/modifications/${editingModId}` : '/api/modifications',
        editingModId ? 'PUT' : 'POST',
        payload,
        'Modification Submission',
        clientRequestId
      );
      const localMod: any = {
        ...payload,
        id: editingModId || `mod_local_${Date.now()}`,
        upvotes: 0,
        createdAt: new Date().toISOString(),
        pendingSync: true
      };
      const updated = editingModId
        ? mods.map(m => (m.id === editingModId ? localMod : m))
        : [localMod, ...mods];
      setMods(updated);
      saveToCache(CACHE_KEYS.MODIFICATIONS, updated);
      clearFormDraft(DRAFT_KEY);
      setShowAddModal(false);
      setEditingModId(null);
      setStatusNotice({
        type: 'offline',
        text: 'Saved locally — pending sync. Your modification will automatically publish when connection returns.'
      });
    }
  };

  const filteredMods = mods.filter(m => {
    const matchesCategory = componentFilter === 'ALL' || m.component === componentFilter;
    const matchesModel =
      selectedModelFilter === 'ALL' ||
      (m.motorcycleModel || '').toLowerCase().includes(selectedModelFilter.toLowerCase());
    const matchesSearch =
      !searchQuery.trim() ||
      (m.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.partsUsed || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.shopName || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesModel && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Marketplace-Style Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <Wrench className="w-8 h-8 text-amber-500" />
            MODIFICATIONS
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Explore, share, and inspect owner-tested Ultraviolette modifications, factory accessories, and installation guides.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm rounded-lg transition-colors shadow-lg shadow-amber-500/10 cursor-pointer self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Submit Modification
        </button>
      </div>

      {statusNotice && (
        <div
          className={`mb-6 p-3.5 rounded-xl border text-xs font-mono flex items-center justify-between ${
            statusNotice.type === 'saved'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusNotice.type === 'offline' ? <CloudOff className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>{statusNotice.text}</span>
          </div>
          <button onClick={() => setStatusNotice(null)} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Marketplace-Style Filters Bar */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 mb-8 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search modifications, parts, shops, guides..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-amber-500/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select
            value={componentFilter}
            onChange={e => {
              playTacticalClick();
              setComponentFilter(e.target.value);
            }}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50 cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            {ALLOWED_MOD_COMPONENTS.map(comp => (
              <option key={comp} value={comp}>
                {comp}
              </option>
            ))}
          </select>

          <select
            value={selectedModelFilter}
            onChange={e => {
              playTacticalClick();
              setSelectedModelFilter(e.target.value);
            }}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50 cursor-pointer"
          >
            <option value="ALL">All Models</option>
            <option value="F77">F77</option>
            <option value="X47">X47</option>
          </select>
        </div>
      </div>

      {/* Marketplace-Style Card Grid */}
      {loading && mods.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">Loading modifications...</div>
      ) : filteredMods.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/30">
          <Wrench className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-zinc-300">No Modifications Found</h3>
          <p className="text-zinc-500 text-sm mt-1">Try adjusting your filters or search terms.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMods.map(m => {
            const photos = extractModImages(m);
            const mainPhoto = photos[0];
            const additionalPhotosCount = Math.max(0, photos.length - 1);
            const canModify = canUserModifyRecord(currentUser, m);

            return (
              <div
                key={m.id}
                onClick={() => {
                  playTacticalClick();
                  setSelectedMod(m);
                  setActiveImageIndex(0);
                }}
                className="bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 rounded-xl overflow-hidden flex flex-col cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-xl group"
              >
                {/* Photo Header Banner - clean image preview without blocking overlays */}
                <div className="relative aspect-video bg-zinc-950 overflow-hidden">
                  {mainPhoto && !failedImageUrls.has(mainPhoto) ? (
                    <img
                      src={mainPhoto}
                      alt={m.title}
                      onError={() => handleImageError(mainPhoto)}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <img
                      src={createMarketplacePresetIllustration('carbon_wheels')}
                      alt={m.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-90"
                    />
                  )}
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-amber-400 transition-colors leading-snug break-words flex-1 min-w-0">
                        {m.title}
                      </h3>
                      {m.costRange && (
                        <div className="bg-amber-500 text-black text-xs font-black px-2.5 py-1 rounded-md shadow shrink-0 self-start whitespace-nowrap">
                          {m.costRange}
                        </div>
                      )}
                    </div>
                    <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed mb-3 break-words whitespace-pre-line">
                      {m.description}
                    </p>
                    {m.shopName && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-400/90 mb-3 font-mono">
                        <Store className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                        <span className="break-words">{m.shopName}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-zinc-800/80 pt-3.5 mt-auto flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="font-semibold text-zinc-300 text-xs truncate" title={m.authorName}>
                        {m.authorName}
                      </span>
                      {m.isOfficialAccessory && (
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                      <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap">
                        {m.difficulty}
                      </span>
                      <span className="bg-zinc-950 text-zinc-400 px-1.5 py-0.5 rounded text-[10px] font-mono border border-zinc-800 shrink-0">
                        {m.motorcycleModel}
                      </span>
                      {canModify && (
                        <div className="flex items-center gap-1 ml-1 pl-1.5 border-l border-zinc-800">
                          <button
                            type="button"
                            onClick={e => openEditMod(m, e)}
                            className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-amber-400 transition-colors cursor-pointer"
                            title="Edit Modification"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={e => handleDeleteMod(m, e)}
                            className="p-1 rounded bg-zinc-800 hover:bg-red-900/60 text-zinc-300 hover:text-red-400 transition-colors cursor-pointer"
                            title="Delete Modification"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Marketplace-Style Detail Gallery & Specification Modal */}
      {selectedMod && (
        <div
          data-testid="mod-product-detail-modal"
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 md:p-6"
          onClick={() => setSelectedMod(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Close Button - Sticky Floating top right */}
            <button
              onClick={() => setSelectedMod(null)}
              aria-label="Close modal"
              className="absolute top-3 right-3 z-40 p-2 bg-black/80 hover:bg-black text-white hover:text-amber-400 rounded-full border border-white/20 shadow-xl transition-all cursor-pointer active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Scrollable Modal Body */}
            <div className="flex-1 overflow-y-auto space-y-6">
              {/* Photo & Thumbnail Gallery Header */}
              {(() => {
                const galleryPhotos = extractModImages(selectedMod);
                const activePhotoUrl = galleryPhotos[activeImageIndex] || galleryPhotos[0];

                return (
                  <div className="bg-zinc-950 border-b border-zinc-800 shrink-0">
                    <div className="relative aspect-video max-h-[260px] sm:max-h-[360px] bg-zinc-950 flex items-center justify-center overflow-hidden">
                      {activePhotoUrl && !failedImageUrls.has(activePhotoUrl) ? (
                        <img
                          src={activePhotoUrl}
                          alt={`${selectedMod.title} - photo ${activeImageIndex + 1}`}
                          onError={() => handleImageError(activePhotoUrl)}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full relative flex items-center justify-center">
                          <img
                            src={createMarketplacePresetIllustration('carbon_wheels')}
                            alt={selectedMod.title}
                            className="w-full h-full object-contain opacity-90"
                          />
                          <div className="absolute bottom-2 left-2 px-2.5 py-1 bg-black/80 rounded border border-amber-500/30 text-[10px] text-amber-400 font-mono">
                            SPECIFICATION SCHEMATIC PREVIEW
                          </div>
                        </div>
                      )}

                      {galleryPhotos.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setActiveImageIndex(prev => (prev === 0 ? galleryPhotos.length - 1 : prev - 1));
                            }}
                            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-black/70 hover:bg-black text-white rounded-full transition-colors cursor-pointer"
                          >
                            <ChevronLeft className="w-5 h-5" />
                          </button>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setActiveImageIndex(prev => (prev === galleryPhotos.length - 1 ? 0 : prev + 1));
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-black/70 hover:bg-black text-white rounded-full transition-colors cursor-pointer"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </button>
                        </>
                      )}
                    </div>

                    {galleryPhotos.length > 1 && (
                      <div className="p-2.5 bg-zinc-900/90 border-t border-zinc-800 flex items-center gap-2 overflow-x-auto">
                        <span className="text-xs font-semibold text-zinc-400 mr-1 shrink-0">
                          Photos ({galleryPhotos.length}):
                        </span>
                        {galleryPhotos.map((photo, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setActiveImageIndex(idx)}
                            className={`relative w-14 h-10 rounded-lg overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                              activeImageIndex === idx
                                ? 'border-amber-500 scale-105 shadow-md'
                                : 'border-zinc-800 opacity-60 hover:opacity-100'
                            }`}
                          >
                            <img
                              src={failedImageUrls.has(photo) ? createMarketplacePresetIllustration('carbon_wheels') : photo}
                              alt=""
                              onError={() => handleImageError(photo)}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Specification & Details Body */}
              <div className="p-4 sm:p-6 space-y-5">
                {/* Header Row: Title, Badges & Cost Range */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-zinc-800/80">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                        {selectedMod.component}
                      </span>
                      <span className="bg-zinc-800 text-zinc-300 text-xs font-medium px-2.5 py-0.5 rounded-full">
                        Model: {selectedMod.motorcycleModel}
                      </span>
                      <span className="bg-zinc-800 text-zinc-300 text-xs font-medium px-2.5 py-0.5 rounded-full">
                        Difficulty: {selectedMod.difficulty}
                      </span>
                      <span className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                        {selectedMod.compatibilityStatus}
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white leading-snug">
                      {selectedMod.title}
                    </h2>
                  </div>

                  {selectedMod.costRange && (
                    <div className="text-xl sm:text-2xl font-black text-amber-400 shrink-0">
                      {selectedMod.costRange}
                    </div>
                  )}
                </div>

                {/* Overview Box */}
                <div>
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-amber-400" />
                    Overview
                  </h4>
                  <p className="text-zinc-200 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap bg-zinc-950/80 p-3.5 sm:p-4 border border-zinc-800 rounded-xl font-sans">
                    {selectedMod.description}
                  </p>
                </div>

                {/* Shop / Installer Details */}
                {(selectedMod.shopName || selectedMod.shopMapLink || selectedMod.shopNumber) && (
                  <div className="p-3.5 sm:p-4 rounded-xl bg-zinc-950/90 border border-zinc-800 space-y-3">
                    <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Store className="w-4 h-4" /> Shop / Installer Details
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs sm:text-sm">
                      {selectedMod.shopName && (
                        <div>
                          <div className="text-[11px] text-zinc-500 font-semibold uppercase">Shop Name</div>
                          <div className="font-bold text-zinc-100 mt-0.5">{selectedMod.shopName}</div>
                        </div>
                      )}
                      {selectedMod.shopNumber && (
                        <div>
                          <div className="text-[11px] text-zinc-500 font-semibold uppercase">Shop Number</div>
                          <a
                            href={`tel:${selectedMod.shopNumber}`}
                            className="font-bold text-emerald-400 hover:underline mt-0.5 inline-flex items-center gap-1.5"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>{selectedMod.shopNumber}</span>
                          </a>
                        </div>
                      )}
                      {selectedMod.shopMapLink && (
                        <div>
                          <div className="text-[11px] text-zinc-500 font-semibold uppercase">Shop Location</div>
                          <a
                            href={sanitizeGoogleMapsUrl(
                              selectedMod.shopMapLink,
                              undefined,
                              undefined,
                              selectedMod.shopName || selectedMod.title
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-amber-400 hover:underline mt-0.5 inline-flex items-center gap-1.5"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                            <span>Open Shop Location</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Parts & Fasteners Used */}
                {selectedMod.partsUsed && (
                  <div>
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-amber-400" />
                      Parts & Fasteners Used
                    </h4>
                    <p className="text-zinc-200 text-xs sm:text-sm leading-relaxed bg-zinc-950/80 p-3.5 sm:p-4 border border-zinc-800 rounded-xl font-sans">
                      {selectedMod.partsUsed}
                    </p>
                  </div>
                )}

                {/* Installation Procedure */}
                {selectedMod.installationGuide && (
                  <div>
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      Installation Procedure
                    </h4>
                    <p className="text-zinc-200 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap bg-zinc-950/80 p-3.5 sm:p-4 border border-zinc-800 rounded-xl font-sans">
                      {selectedMod.installationGuide}
                    </p>
                  </div>
                )}

                {/* Safety & Warranty Considerations */}
                {(() => {
                  const customSafety =
                    selectedMod.safetyConsiderations &&
                    selectedMod.safetyConsiderations.trim().length > 0 &&
                    selectedMod.safetyConsiderations.trim() !== 'Check all torques to factory specs before riding.'
                      ? selectedMod.safetyConsiderations.trim()
                      : null;

                  const customWarranty =
                    selectedMod.warrantyConsiderations &&
                    selectedMod.warrantyConsiderations.trim().length > 0 &&
                    selectedMod.warrantyConsiderations.trim() !== 'Bolt-on modification. Reversible without electrical harness cut.'
                      ? selectedMod.warrantyConsiderations.trim()
                      : null;

                  if (!customSafety && !customWarranty) return null;

                  return (
                    <div
                      className={`grid gap-3 ${
                        customSafety && customWarranty ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
                      }`}
                    >
                      {customSafety && (
                        <div className="p-3.5 rounded-xl bg-zinc-950/90 border border-zinc-800">
                          <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5 mb-1.5">
                            <AlertCircle className="w-4 h-4" /> SAFETY CONSIDERATIONS
                          </div>
                          <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                            {customSafety}
                          </div>
                        </div>
                      )}

                      {customWarranty && (
                        <div className="p-3.5 rounded-xl bg-zinc-950/90 border border-zinc-800">
                          <div className="text-xs font-bold text-sky-400 flex items-center gap-1.5 mb-1.5">
                            <ShieldCheck className="w-4 h-4" /> WARRANTY IMPLICATIONS
                          </div>
                          <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                            {customWarranty}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Attached Product Links */}
                {selectedMod.productLinks && selectedMod.productLinks.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    <div className="text-xs text-zinc-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
                      <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                      <span>Attached Product Links ({selectedMod.productLinks.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {selectedMod.productLinks.map((link, idx) => {
                        let domain = '';
                        try {
                          domain = new URL(link.url).hostname.replace(/^www\./, '');
                        } catch (_) {
                          domain = link.url;
                        }
                        const titleText = link.name || domain || link.url;

                        return (
                          <a
                            key={idx}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-500/40 transition-colors group"
                          >
                            <div className="truncate pr-2">
                              <div className="text-white font-bold text-xs truncate group-hover:text-amber-400">
                                {titleText}
                              </div>
                              {link.name && domain && (
                                <div className="text-[10px] text-zinc-500 truncate">{domain}</div>
                              )}
                            </div>
                            <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 shrink-0" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sticky Footer Action Bar */}
            <div className="p-3.5 sm:p-5 bg-zinc-950 border-t border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0 z-10">
              <div className="text-xs text-zinc-400 font-mono truncate max-w-full">
                Contributed by <span className="font-bold text-zinc-100">{selectedMod.authorName}</span> •{' '}
                <span className="text-amber-400 font-semibold">
                  {selectedMod.isOfficialAccessory ? 'OEM Accessory' : 'Owner-Tested Mod'}
                </span>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
                {canUserModifyRecord(currentUser, selectedMod) && (
                  <>
                    <button
                      type="button"
                      onClick={() => openEditMod(selectedMod)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMod(selectedMod)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-800/60 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedMod(null)}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold uppercase tracking-wide rounded-lg shadow-md transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add / Edit Mod */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md overflow-y-auto p-2 sm:p-4 flex flex-col items-center justify-start pt-[max(1rem,env(safe-area-inset-top))] pb-16">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-4 text-xs shadow-2xl mt-2 mb-8">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="text-base font-bold text-white">
                {editingModId ? 'Edit Modification or Accessory' : 'Submit Modification or Accessory'}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingModId(null);
                }}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMod} className="space-y-4">
              <div>
                <label className="block text-zinc-300 mb-1 font-semibold">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Ergonomic Handlebar Riser (20mm offset)"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500/50 rounded-lg p-2.5 text-white focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block text-zinc-300 font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-amber-500" />
                    <span>Photographs (Upload one or multiple)</span>
                  </span>
                  <span className="text-[10px] text-zinc-500 font-normal">Supports camera & gallery</span>
                </label>

                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* Device Gallery / Photos Button */}
                    <button
                      type="button"
                      data-testid="mod-select-photos-button"
                      disabled={isProcessingPhotos}
                      onClick={() => {
                        prepareModPhotoPicker('gallery');
                        fileInputRef.current?.click();
                      }}
                      className={`flex items-center justify-center space-x-2 px-3 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] border border-amber-500/50 hover:border-amber-500 text-white font-semibold text-xs transition-all shadow-sm cursor-pointer select-none ${
                        isProcessingPhotos ? 'opacity-70 cursor-not-allowed' : ''
                      }`}
                    >
                      {isProcessingPhotos ? (
                        <Loader2 className="w-4 h-4 text-amber-500 animate-spin shrink-0" />
                      ) : (
                        <Upload className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                      <span className="truncate">
                        {isProcessingPhotos ? 'Reading Photos...' : 'Select Photos (Gallery)'}
                      </span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={isProcessingPhotos}
                      className="sr-only"
                      aria-label="Select Photos From Device"
                    />

                    {/* Camera Button */}
                    <button
                      type="button"
                      data-testid="mod-camera-photos-button"
                      disabled={isProcessingPhotos}
                      onClick={() => {
                        prepareModPhotoPicker('camera');
                        cameraInputRef.current?.click();
                      }}
                      className={`flex items-center justify-center space-x-2 px-3 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white font-medium text-xs transition-all cursor-pointer select-none ${
                        isProcessingPhotos ? 'opacity-70 cursor-not-allowed' : ''
                      }`}
                    >
                      <Camera className="w-4 h-4 text-sky-400 shrink-0" />
                      <span className="truncate">Take Photo (Camera)</span>
                    </button>
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageUpload}
                      disabled={isProcessingPhotos}
                      className="sr-only"
                      aria-label="Take Photo with Camera"
                    />

                    {/* Paste Image URL Button */}
                    <button
                      type="button"
                      onClick={() => setShowUrlInput(prev => !prev)}
                      className="flex items-center justify-center space-x-2 px-3 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white font-medium text-xs transition-all cursor-pointer"
                    >
                      <Link2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="truncate">Paste Image URL</span>
                    </button>
                  </div>

                  {/* Quick Clipboard Paste Target (works inside any Android WebView via keyboard clipboard) */}
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onPaste={handleClipboardPaste}
                    onInput={e => {
                      e.currentTarget.textContent = '';
                    }}
                    data-testid="mod-clipboard-paste-box"
                    className="px-3 py-1.5 rounded-lg bg-zinc-900/70 border border-zinc-800 focus:border-amber-500/60 text-zinc-400 text-[11px] text-center cursor-text focus:outline-none"
                  >
                    Tip: You can also tap here &amp; paste any copied photo from your phone keyboard clipboard
                  </div>

                  {photoBridgeNotice && (
                    <div
                      data-testid="mod-photo-bridge-notice"
                      className="px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{photoBridgeNotice}</span>
                    </div>
                  )}

                  {/* Optional Image URL Drawer */}
                  {showUrlInput && (
                    <div className="flex gap-2 p-2 bg-zinc-900/90 border border-zinc-800 rounded-lg">
                      <input
                        type="url"
                        placeholder="https://example.com/mod-photo.jpg"
                        value={photoUrlInput}
                        onChange={e => setPhotoUrlInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddPhotoUrl();
                          }
                        }}
                        className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddPhotoUrl}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded transition-colors cursor-pointer"
                      >
                        Add URL
                      </button>
                    </div>
                  )}

                  {/* Uploaded Images Preview Tray */}
                  {uploadedImages.length > 0 ? (
                    <div
                      data-testid="mod-uploaded-images-preview"
                      className="space-y-2 pt-2.5 border-t border-zinc-800"
                    >
                      <div className="text-xs flex items-center justify-between">
                        <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>
                            {uploadedImages.length} {uploadedImages.length === 1 ? 'photo attached' : 'photos attached'}
                          </span>
                          <span className="text-zinc-400 text-[10px] font-normal">(First photo is cover)</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            playTacticalClick();
                            setUploadedImages([]);
                          }}
                          className="text-[11px] text-red-400 hover:text-red-300 hover:underline cursor-pointer font-medium"
                        >
                          Clear All
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto p-1">
                        {uploadedImages.map((img, idx) => (
                          <div
                            key={idx}
                            data-testid={`mod-uploaded-image-item-${idx}`}
                            className="relative group rounded-lg overflow-hidden border-2 border-amber-500/50 bg-zinc-900 aspect-video shadow-md"
                          >
                            <img
                              src={img}
                              alt={`Selected photo ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                            {idx === 0 && (
                              <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500 text-black uppercase tracking-wider shadow">
                                Cover Photo
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveUploadedImage(idx)}
                              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/85 hover:bg-red-500 text-white flex items-center justify-center transition-colors shadow cursor-pointer"
                              title="Remove photo"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div
                      data-testid="mod-no-images-selected-yet"
                      className="py-2.5 px-3 rounded-lg bg-zinc-900/50 border border-dashed border-zinc-800 flex items-center justify-center gap-2 text-zinc-500 text-[11px]"
                    >
                      <ImageIcon className="w-4 h-4 text-zinc-600 shrink-0" />
                      <span>Selected photos will preview here before you submit</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-300 mb-1 font-semibold">Model *</label>
                  <select
                    value={model}
                    onChange={e => setModel(e.target.value as 'F77' | 'X47')}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500/50 rounded-lg p-2.5 text-white focus:outline-none"
                  >
                    <option value="F77">F77</option>
                    <option value="X47">X47</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-300 mb-1 font-semibold">Category *</label>
                  <select
                    value={component}
                    onChange={e => setComponent(e.target.value as ModificationItem['component'])}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500/50 rounded-lg p-2.5 text-white focus:outline-none"
                  >
                    {ALLOWED_MOD_COMPONENTS.map(comp => (
                      <option key={comp} value={comp}>
                        {comp}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-300 mb-1 font-semibold">Install Difficulty</label>
                  <select
                    value={difficulty}
                    onChange={e => setDifficulty(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500/50 rounded-lg p-2.5 text-white focus:outline-none"
                  >
                    <option value="Plug & Play">Plug & Play</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                    <option value="Professional Installation Required">Professional Installation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-300 mb-1 font-semibold">Approx Cost Range</label>
                  <select
                    value={costRange}
                    onChange={e => setCostRange(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500/50 rounded-lg p-2.5 text-white focus:outline-none"
                  >
                    <option value="Under ₹2,000">Under ₹2,000</option>
                    <option value="₹2,000 - ₹5,000">₹2,000 - ₹5,000</option>
                    <option value="₹5,000 - ₹15,000">₹5,000 - ₹15,000</option>
                    <option value="₹15,000+">₹15,000+</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-zinc-300 mb-1 font-semibold">Description *</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe functional improvement, weight delta, or visual styling..."
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500/50 rounded-lg p-2.5 text-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-zinc-300 mb-1 font-semibold">Installation Guide</label>
                <textarea
                  rows={2}
                  value={installationGuide}
                  onChange={e => setInstallationGuide(e.target.value)}
                  placeholder="Step-by-step instructions and bolt torque specs..."
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500/50 rounded-lg p-2.5 text-white focus:outline-none"
                />
              </div>

              {/* Optional Shop Details Section */}
              <div className="space-y-3 pt-2 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-300 font-semibold text-xs flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-amber-500" />
                    <span>Shop Details (Optional)</span>
                  </label>
                  <span className="text-[10px] text-zinc-500 font-normal">Where it was purchased or installed</span>
                </div>

                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">Shop Name (Optional)</label>
                    <input
                      type="text"
                      value={shopName}
                      onChange={e => setShopName(e.target.value)}
                      placeholder="e.g. Motocraft Customs Bengaluru"
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-lg p-2 text-white text-xs focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-zinc-400 text-[11px] mb-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-amber-500" />
                        <span>Shop Map Link (Optional)</span>
                      </label>
                      <input
                        type="url"
                        value={shopMapLink}
                        onChange={e => setShopMapLink(e.target.value)}
                        placeholder="https://maps.google.com/..."
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-lg p-2 text-white text-xs focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 text-[11px] mb-1 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-emerald-400" />
                        <span>Contact / Shop Number (Optional)</span>
                      </label>
                      <input
                        type="tel"
                        value={shopNumber}
                        onChange={e => setShopNumber(e.target.value)}
                        placeholder={currentUser?.mobile || 'e.g. +91 98765 43210'}
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-lg p-2 text-white text-xs focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-300 font-semibold text-xs flex items-center gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5 text-amber-500" />
                    <span>Product Links (Optional)</span>
                  </label>
                </div>

                <div className="space-y-2.5 bg-zinc-950 p-3 border border-zinc-800 rounded-xl">
                  {productLinks.map((link, idx) => (
                    <div key={idx} className="space-y-1.5 bg-zinc-900 p-2.5 rounded-lg border border-zinc-800">
                      <div className="flex items-center justify-between text-[10px] text-zinc-400">
                        <span>Product Link #{idx + 1}</span>
                        {productLinks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveProductLink(idx)}
                            className="text-red-400 hover:underline flex items-center gap-1 text-[10px]"
                          >
                            <X className="w-3 h-3" /> Remove
                          </button>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div>
                          <input
                            type="url"
                            value={link.url}
                            onChange={e => handleLinkChange(idx, 'url', e.target.value)}
                            placeholder="https://example.com/product"
                            className={`w-full bg-zinc-950 border ${
                              linkErrors[idx] ? 'border-red-500' : 'border-zinc-800 focus:border-amber-500/50'
                            } rounded-lg p-2 text-white text-xs focus:outline-none`}
                          />
                          {linkErrors[idx] && (
                            <span className="text-[10px] text-red-400 mt-0.5 block">{linkErrors[idx]}</span>
                          )}
                        </div>

                        <div>
                          <input
                            type="text"
                            value={link.name}
                            onChange={e => handleLinkChange(idx, 'name', e.target.value)}
                            placeholder="Optional product name (e.g., CNC Handlebar Riser)"
                            className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500/50 rounded-lg p-2 text-white focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={handleAddProductLink}
                    className="w-full py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-zinc-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Another Product Link</span>
                  </button>
                </div>
              </div>

              {submitError && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/40 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingModId(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold transition-colors"
                >
                  {editingModId ? 'Save Changes' : 'Save Modification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
