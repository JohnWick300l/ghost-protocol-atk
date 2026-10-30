import React, { useEffect, useRef, useState } from 'react';
import { FighterActionState, FighterDefinition } from '../types';
import {
  ArticulatedFighterPuppet,
  computeFighterRigPose,
} from '../animation/fighterRig';
import { gameAudio } from '../audio/gameAudio';

interface InteractiveFighterPreviewProps {
  fighter: FighterDefinition;
  mirrored?: boolean;
  showMoveTester?: boolean;
}

export const InteractiveFighterPreview: React.FC<
  InteractiveFighterPreviewProps
> = ({ fighter, mirrored = false, showMoveTester = true }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const puppetRef = useRef<ArticulatedFighterPuppet | null>(null);
  const [activeAction, setActiveAction] = useState<FighterActionState>('IDLE');
  const [comboStep, setComboStep] = useState<number>(0);
  const actionStartRef = useRef<number>(0);
  const actionDurationRef = useRef<number>(0);
  const activeActionRef = useRef<FighterActionState>('IDLE');
  const comboStepRef = useRef<number>(0);

  // Load fighter image into ArticulatedFighterPuppet whenever fighter changes
  useEffect(() => {
    let cancelled = false;
    puppetRef.current = null;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      puppetRef.current = new ArticulatedFighterPuppet(img, fighter.id);
    };
    img.src = fighter.spriteAsset;
    return () => {
      cancelled = true;
    };
  }, [fighter.id, fighter.spriteAsset]);

  // 60 FPS animation loop for the interactive preview
  useEffect(() => {
    let rafId = 0;

    const renderLoop = (now: number) => {
      const canvas = canvasRef.current;
      const puppet = puppetRef.current;
      if (canvas && puppet) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          let currentAct = activeActionRef.current;
          let elapsed = now - actionStartRef.current;
          const dur = actionDurationRef.current;

          if (currentAct !== 'IDLE' && dur > 0 && elapsed >= dur) {
            currentAct = 'IDLE';
            activeActionRef.current = 'IDLE';
            setActiveAction('IDLE');
            elapsed = 0;
          }

          const pose = computeFighterRigPose(
            currentAct,
            elapsed,
            dur,
            comboStepRef.current,
            now,
            mirrored
          );

          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (mirrored) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }
          puppet.renderPose(
            ctx,
            canvas.width,
            canvas.height,
            pose,
            fighter.accentColor,
            fighter.secondaryColor
          );
          ctx.restore();
        }
      }
      rafId = window.requestAnimationFrame(renderLoop);
    };

    rafId = window.requestAnimationFrame(renderLoop);
    return () => window.cancelAnimationFrame(rafId);
  }, [fighter.accentColor, fighter.secondaryColor, mirrored]);

  const triggerPreviewMove = (
    e: React.MouseEvent,
    move: 'PUNCH' | 'KICK' | 'BLOCK' | 'SPECIAL'
  ) => {
    e.stopPropagation();
    const now = performance.now();
    const nextCombo = (comboStep + 1) % 3;
    setComboStep(nextCombo);
    comboStepRef.current = nextCombo;

    const dur =
      move === 'PUNCH'
        ? 360
        : move === 'KICK'
        ? 460
        : move === 'BLOCK'
        ? 520
        : 640;

    activeActionRef.current = move;
    actionStartRef.current = now;
    actionDurationRef.current = dur;
    setActiveAction(move);

    if (move === 'PUNCH') {
      gameAudio.playSwingWhoosh('PUNCH');
      gameAudio.playPunchHit();
    } else if (move === 'KICK') {
      gameAudio.playSwingWhoosh('KICK');
      gameAudio.playKickHit();
    } else if (move === 'BLOCK') {
      gameAudio.playBlockImpact();
    } else {
      gameAudio.playSpecialAttack();
    }
  };

  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      <div className="relative w-32 h-44 sm:w-36 sm:h-48 rounded-xl bg-slate-950/95 border border-slate-800 flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          width={420}
          height={420}
          className="w-full h-full object-contain"
        />
        {activeAction !== 'IDLE' && (
          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-cyan-500/25 border border-cyan-400/50 text-[9px] font-black text-cyan-200 uppercase">
            {activeAction}
          </span>
        )}
      </div>

      {showMoveTester && (
        <div className="grid grid-cols-4 gap-1 w-full">
          <button
            type="button"
            data-testid={`preview-punch-${fighter.id}`}
            onClick={(e) => triggerPreviewMove(e, 'PUNCH')}
            className="py-1 px-1 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/40 text-[9px] font-black text-sky-200 uppercase cursor-pointer"
            title="Test Right Hand Punch"
          >
            PUNCH
          </button>
          <button
            type="button"
            data-testid={`preview-kick-${fighter.id}`}
            onClick={(e) => triggerPreviewMove(e, 'KICK')}
            className="py-1 px-1 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/40 text-[9px] font-black text-amber-200 uppercase cursor-pointer"
            title="Test Leg Rise Kick"
          >
            KICK
          </button>
          <button
            type="button"
            onClick={(e) => triggerPreviewMove(e, 'BLOCK')}
            className="py-1 px-1 rounded bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/40 text-[9px] font-black text-emerald-200 uppercase cursor-pointer"
            title="Test Guard Block"
          >
            BLOCK
          </button>
          <button
            type="button"
            onClick={(e) => triggerPreviewMove(e, 'SPECIAL')}
            className="py-1 px-1 rounded bg-purple-500/20 hover:bg-purple-500/35 border border-purple-400/40 text-[9px] font-black text-purple-200 uppercase cursor-pointer"
            title="Test Special Move"
          >
            SPEC
          </button>
        </div>
      )}
    </div>
  );
};
