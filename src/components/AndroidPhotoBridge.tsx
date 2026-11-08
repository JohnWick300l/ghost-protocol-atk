import React, { useState, useRef } from 'react';
import {
  Upload,
  Camera,
  CheckCircle2,
  ArrowLeft,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  Sparkles,
  Trash2
} from 'lucide-react';
import { loadFormDraft, saveFormDraft } from '../utils/telemetryCache';

interface AndroidPhotoBridgeProps {
  sessionId: string;
  initialMode?: 'gallery' | 'camera';
  target?: string;
  onReturnToApp?: () => void;
}

const DRAFT_KEY_MAP: Record<string, string> = {
  modifications: 'modifications_lab_form',
  problems: 'problem_tracker_form',
  marketplace: 'marketplace_listing_form'
};

export const AndroidPhotoBridge: React.FC<AndroidPhotoBridgeProps> = ({
  sessionId,
  initialMode = 'gallery',
  target = 'modifications',
  onReturnToApp
}) => {
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const compressImageFile = async (file: File): Promise<string> => {
    return new Promise(resolve => {
      if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string) || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = e => {
        const result = (e.target?.result as string) || '';
        if (!result) {
          resolve('');
          return;
        }

        if (file.size > 0 && file.size < 250 * 1024) {
          resolve(result);
          return;
        }

        const img = new Image();
        img.onload = () => {
          try {
            const MAX_DIM = 1400;
            let width = img.width;
            let height = img.height;
            if (width > MAX_DIM || height > MAX_DIM) {
              if (width > height) {
                height = Math.round((height * MAX_DIM) / width);
                width = MAX_DIM;
              } else {
                width = Math.round((width * MAX_DIM) / height);
                height = MAX_DIM;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(result);
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
            resolve(dataUrl || result);
          } catch {
            resolve(result);
          }
        };
        img.onerror = () => resolve(result);
        img.src = result;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const syncPhotosToServerAndDraft = async (newPhotos: string[]) => {
    if (newPhotos.length === 0) return;

    // 1. Send to server photo-bridge endpoint so the GHOST PROTOCOL Android WebView receives them immediately
    const res = await fetch(`/api/photo-bridge/${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images: newPhotos,
        target,
        mode: initialMode
      })
    });

    if (!res.ok) {
      throw new Error('Failed to sync photos to Ghost Protocol server.');
    }

    // 2. Also update localStorage draft in case user continues in same browser
    try {
      const draftKey = DRAFT_KEY_MAP[target] || 'modifications_lab_form';
      const existingDraft = loadFormDraft<Record<string, any>>(draftKey, {});
      const prevImgs = Array.isArray(existingDraft.uploadedImages) ? existingDraft.uploadedImages : [];
      saveFormDraft(draftKey, {
        ...existingDraft,
        uploadedImages: [...prevImgs, ...newPhotos]
      });
      localStorage.setItem('ghost_photo_bridge_session_id', sessionId);
      localStorage.setItem('ghost_photo_bridge_modal_open', target);
    } catch {
      // Ignore storage errors
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setErrorMsg(null);
    setUploadSuccess(false);

    try {
      const fileArray = Array.from(files);
      const compressedList: string[] = [];

      for (const file of fileArray) {
        const isImg =
          !file.type ||
          file.type.startsWith('image/') ||
          /\.(jpe?g|png|webp|gif|bmp|heic|heif|svg)$/i.test(file.name);
        if (!isImg && file.type) continue;
        const dataUrl = await compressImageFile(file);
        if (dataUrl) {
          compressedList.push(dataUrl);
        }
      }

      if (compressedList.length === 0) {
        setErrorMsg('Could not read the selected photo. Please select a JPG, PNG, or WEBP image.');
        setIsUploading(false);
        return;
      }

      await syncPhotosToServerAndDraft(compressedList);
      setUploadedImages(prev => [...prev, ...compressedList]);
      setUploadSuccess(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to upload selected photo(s). Please try again.');
    } finally {
      setIsUploading(false);
      try {
        e.target.value = '';
      } catch {}
    }
  };

  const handleReturn = () => {
    if (onReturnToApp) {
      onReturnToApp();
      return;
    }
    if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')) {
      try {
        window.location.replace(
          'intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.ghostprotocol.atk;launchFlags=0x10200000;end'
        );
      } catch {}
      setTimeout(() => {
        try {
          window.close();
        } catch {}
      }, 300);
      return;
    }
    try {
      window.close();
    } catch {}
    const url = new URL(window.location.origin);
    url.searchParams.set('route', target === 'problems' ? 'problems' : target === 'marketplace' ? 'marketplace' : 'modifications');
    url.searchParams.set('photoBridgeSynced', sessionId);
    window.location.href = url.toString();
  };

  return (
    <div
      data-testid="android-photo-bridge-screen"
      className="min-h-[100dvh] bg-[#030508] text-white flex flex-col justify-between p-4 sm:p-6 font-sans select-none"
    >
      <div className="max-w-md w-full mx-auto space-y-5 my-auto">
        {/* Header Badge */}
        <div className="bg-zinc-900/95 border border-amber-500/40 rounded-2xl p-5 shadow-[0_0_40px_rgba(245,158,11,0.12)] space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-400 font-bold">
                  GHOST PROTOCOL • ANDROID MEDIA LINK
                </div>
                <h1 className="text-base font-black tracking-tight text-white uppercase">
                  Select Photos From Phone
                </h1>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-[10px] font-mono font-bold uppercase">
              READY
            </span>
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed">
            Tap below to open your Android phone&apos;s <span className="text-amber-400 font-semibold">Gallery / Files</span> or <span className="text-sky-400 font-semibold">Camera</span>. Selected photos sync straight into your <span className="text-white font-semibold">Mod Lab</span> form automatically.
          </p>

          {/* Primary Gallery / Files Picker Button */}
          <div className="space-y-3 pt-1">
            <label
              data-testid="bridge-open-gallery-btn"
              className={`relative overflow-hidden w-full flex items-center justify-center gap-3 py-4 px-4 rounded-xl font-bold text-sm uppercase tracking-wider transition-all cursor-pointer shadow-lg ${
                initialMode === 'gallery'
                  ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950 border-2 border-amber-300 shadow-amber-500/20'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-amber-500/50'
              } ${isUploading ? 'opacity-60 pointer-events-none' : 'active:scale-[0.98]'}`}
            >
              {isUploading ? (
                <Loader2 className="w-5 h-5 animate-spin shrink-0" />
              ) : (
                <Upload className="w-5 h-5 shrink-0" />
              )}
              <span>
                {isUploading
                  ? 'Uploading Photos to App...'
                  : uploadedImages.length > 0
                  ? 'Select More Photos From Gallery / Files'
                  : 'Tap to Open Phone Gallery / Files'}
              </span>
              <input
                ref={galleryInputRef}
                data-testid="bridge-gallery-file-input"
                type="file"
                multiple
                accept="image/*,image/jpeg,image/png,image/webp,image/jpg,image/heic,image/heif"
                onChange={handleFileChange}
                disabled={isUploading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              />
            </label>

            {/* Camera Capture Button */}
            <label
              data-testid="bridge-open-camera-btn"
              className={`relative overflow-hidden w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                initialMode === 'camera'
                  ? 'bg-sky-500 hover:bg-sky-400 text-zinc-950 border-2 border-sky-300 shadow-lg shadow-sky-500/20'
                  : 'bg-zinc-950 hover:bg-zinc-800 text-sky-400 border border-sky-500/40'
              } ${isUploading ? 'opacity-60 pointer-events-none' : 'active:scale-[0.98]'}`}
            >
              <Camera className="w-4 h-4 shrink-0" />
              <span>Take Photo With Phone Camera</span>
              <input
                ref={cameraInputRef}
                data-testid="bridge-camera-file-input"
                type="file"
                accept="image/*,image/jpeg,image/png,image/webp,image/jpg"
                capture="environment"
                onChange={handleFileChange}
                disabled={isUploading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              />
            </label>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Uploaded Photos Preview & Return Action */}
          {uploadedImages.length > 0 && (
            <div
              data-testid="bridge-upload-success-panel"
              className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    {uploadedImages.length} {uploadedImages.length === 1 ? 'Photo' : 'Photos'} Synced to App!
                  </span>
                </div>
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>

              <div className="grid grid-cols-3 gap-2">
                {uploadedImages.map((imgUrl, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-video rounded-lg overflow-hidden border border-emerald-500/40 bg-zinc-950"
                  >
                    <img
                      src={imgUrl}
                      alt={`Uploaded ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-emerald-200/90 leading-relaxed">
                Your selected {uploadedImages.length === 1 ? 'photo is' : 'photos are'} now attached to your Modification submission. Tap below or press your phone&apos;s Back button to return to the GHOST PROTOCOL app!
              </p>

              <button
                type="button"
                data-testid="bridge-return-to-app-btn"
                onClick={handleReturn}
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer active:scale-[0.98]"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Done — Return to Ghost Protocol App</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer Return Link */}
        <div className="flex items-center justify-between px-1 text-xs text-zinc-500">
          <button
            type="button"
            onClick={handleReturn}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Mod Lab</span>
          </button>
          <span className="font-mono text-[10px] text-zinc-600">
            BRIDGE ID: {sessionId.slice(0, 12)}
          </span>
        </div>
      </div>
    </div>
  );
};
