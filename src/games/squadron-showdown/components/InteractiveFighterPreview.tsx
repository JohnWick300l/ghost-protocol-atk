import React, { useEffect, useRef, useState } from 'react';
import { FighterActionState, FighterDefinition } from '../types';
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
  const [activeAction, setActiveAction] = useState<FighterActionState>('IDLE');
  const actionStartRef = useRef<number>(0);
  const actionDurationRef = useRef<number>(0);
  const activeActionRef = useRef<FighterActionState>('IDLE');
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});

  // Preload all action sprites for this fighter
  useEffect(() => {
    let cancelled = false;
    const poses = ['idle', 'punch', 'kick', 'block', 'special', 'jump', 'victory', 'defeat'] as const;
    const loadedImages: Record<string, HTMLImageElement> = {};

    poses.forEach((pose) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const url = fighter.actionSprites?.[pose] || fighter.spriteAsset;
      img.src = url;
      img.onload = () => {
        if (!cancelled) {
          loadedImages[pose] = img;
        }
      };
      loadedImages[pose] = img;
    });

    imagesRef.current = loadedImages;
    return () => {
      cancelled = true;
    };
  }, [fighter.id, fighter.actionSprites, fighter.spriteAsset]);

  // 60 FPS animation loop for the interactive preview
  useEffect(() => {
    let rafId = 0;

    const renderLoop = (now: number) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          let currentAct = activeActionRef.current;
          const elapsed = now - actionStartRef.current;
          const dur = actionDurationRef.current;

          if (currentAct !== 'IDLE' && dur > 0 && elapsed >= dur) {
            currentAct = 'IDLE';
            activeActionRef.current = 'IDLE';
            setActiveAction('IDLE');
          }

          let poseKey = 'idle';
          if (currentAct === 'PUNCH') poseKey = 'punch';
          else if (currentAct === 'KICK') poseKey = 'kick';
          else if (currentAct === 'BLOCK') poseKey = 'block';
          else if (currentAct === 'SPECIAL') poseKey = 'special';
          else if (currentAct === 'JUMP') poseKey = 'jump';
          else if (currentAct === 'TAUNT') poseKey = 'victory';

          const activeImg = imagesRef.current[poseKey] || imagesRef.current['idle'];

          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Background glow during SPECIAL attack
          if (currentAct === 'SPECIAL') {
            const grad = ctx.createRadialGradient(
              canvas.width / 2,
              canvas.height / 2,
              20,
              canvas.width / 2,
              canvas.height / 2,
              canvas.width / 2
            );
            grad.addColorStop(0, `${fighter.accentColor}44`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }

          if (mirrored) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }

          if (activeImg && activeImg.complete && activeImg.naturalWidth > 0) {
            // Standardize display height ~320px
            const drawH = 340;
            const drawW = (activeImg.naturalWidth / activeImg.naturalHeight) * drawH;
            const groundY = canvas.height - 18;
            let drawX = (canvas.width - drawW) / 2;
            let drawY = groundY - drawH;

            // Subtle breathing idle bob
            if (currentAct === 'IDLE') {
              drawY += Math.sin(now * 0.004) * 2;
            } else if (currentAct === 'PUNCH' || currentAct === 'KICK') {
              // Punch/kick forward extension
              drawX += 6;
            }

            ctx.drawImage(activeImg, drawX, drawY, drawW, drawH);
          }

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
    move: 'PUNCH' | 'KICK' | 'BLOCK' | 'SPECIAL' | 'TAUNT'
  ) => {
    e.stopPropagation();
    const now = performance.now();

    const dur =
      move === 'PUNCH'
        ? 340
        : move === 'KICK'
        ? 440
        : move === 'BLOCK'
        ? 500
        : move === 'TAUNT'
        ? 520
        : 650;

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
    } else if (move === 'TAUNT') {
      gameAudio.playTauntLaugh(fighter.id === 'FIGHTER_006');
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
        <div className="grid grid-cols-5 gap-1 w-full">
          <button
            type="button"
            data-testid={`preview-punch-${fighter.id}`}
            onClick={(e) => triggerPreviewMove(e, 'PUNCH')}
            className="py-1 px-0.5 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/40 text-[9px] font-black text-sky-200 uppercase cursor-pointer text-center"
            title="Test Right Hand Punch"
          >
            PUNCH
          </button>
          <button
            type="button"
            data-testid={`preview-kick-${fighter.id}`}
            onClick={(e) => triggerPreviewMove(e, 'KICK')}
            className="py-1 px-0.5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/40 text-[9px] font-black text-amber-200 uppercase cursor-pointer text-center"
            title="Test Leg Rise Kick"
          >
            KICK
          </button>
          <button
            type="button"
            onClick={(e) => triggerPreviewMove(e, 'BLOCK')}
            className="py-1 px-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/40 text-[9px] font-black text-emerald-200 uppercase cursor-pointer text-center"
            title="Test Guard Block"
          >
            BLOCK
          </button>
          <button
            type="button"
            onClick={(e) => triggerPreviewMove(e, 'SPECIAL')}
            className="py-1 px-0.5 rounded bg-purple-500/20 hover:bg-purple-500/35 border border-purple-400/40 text-[9px] font-black text-purple-200 uppercase cursor-pointer text-center"
            title="Test Special Move"
          >
            SPEC
          </button>
          <button
            type="button"
            onClick={(e) => triggerPreviewMove(e, 'TAUNT')}
            className="py-1 px-0.5 rounded bg-pink-500/20 hover:bg-pink-500/35 border border-pink-400/40 text-[9px] font-black text-pink-200 uppercase cursor-pointer text-center"
            title="Test Taunt Laugh"
          >
            TAUNT
          </button>
        </div>
      )}
    </div>
  );
};
