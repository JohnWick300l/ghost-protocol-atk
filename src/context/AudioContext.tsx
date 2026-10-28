import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface AudioContextType {
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  toggleSound: () => void;
  reducedMotion: boolean;
  setReducedMotion: (enabled: boolean) => void;
  toggleReducedMotion: () => void;
  playBeep: (freq?: number, duration?: number) => void;
  playTacticalClick: () => void;
  playChime: () => void;
  playAlert: () => void;
  playRadarPulse: () => void;
}

const AudioContext = createContext<AudioContextType | null>(null);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Sound is off by default as required by specification
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    return localStorage.getItem('gp_sound_enabled') === 'true';
  });

  const [reducedMotion, setReducedMotionState] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return true;
    }
    return localStorage.getItem('gp_reduced_motion') === 'true';
  });

  const [audioCtx, setAudioCtx] = useState<AudioContext | null>(null);

  const setSoundEnabled = (enabled: boolean) => {
    setSoundEnabledState(enabled);
    localStorage.setItem('gp_sound_enabled', String(enabled));
  };

  const toggleSound = () => {
    setSoundEnabled(!soundEnabled);
  };

  const setReducedMotion = (enabled: boolean) => {
    setReducedMotionState(enabled);
    localStorage.setItem('gp_reduced_motion', String(enabled));
  };

  const toggleReducedMotion = () => {
    setReducedMotion(!reducedMotion);
  };

  const getAudioContext = useCallback(() => {
    if (!soundEnabled) return null;
    if (!audioCtx) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      setAudioCtx(ctx);
      return ctx;
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }, [audioCtx, soundEnabled]);

  const playBeep = useCallback((freq = 880, duration = 0.05) => {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio playback suppressed safely
    }
  }, [getAudioContext, soundEnabled]);

  const playTacticalClick = useCallback(() => {
    playBeep(1200, 0.03);
  }, [playBeep]);

  const playChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(987.77, now); // B5

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1318.51, now + 0.08); // E6

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.15);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.35);
    } catch {
      // Audio playback suppressed safely
    }
  }, [getAudioContext, soundEnabled]);

  const playAlert = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.setValueAtTime(440, now + 0.1);
      osc.frequency.setValueAtTime(660, now + 0.2);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.4);
    } catch {
      // Audio playback suppressed safely
    }
  }, [getAudioContext, soundEnabled]);

  const playRadarPulse = useCallback(() => {
    playBeep(620, 0.06);
  }, [playBeep]);

  return (
    <AudioContext.Provider
      value={{
        soundEnabled,
        setSoundEnabled,
        toggleSound,
        reducedMotion,
        setReducedMotion,
        toggleReducedMotion,
        playBeep,
        playTacticalClick,
        playChime,
        playAlert,
        playRadarPulse
      }}
    >
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};
