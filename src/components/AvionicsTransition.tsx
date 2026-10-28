import React, { useLayoutEffect, useRef } from 'react';
import {
  PAGE_TRANSITION_ORDER,
  computeTransitionDirection,
  getAvionicsTransitionVariants
} from '../utils/rules';

export interface MotionKeyframesSpec {
  opacity?: number;
  x?: number;
  y?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  filter?: string;
  pointerEvents?: 'none' | 'auto';
}

export interface MotionTransitionConfig {
  duration?: number;
  ease?: readonly [number, number, number, number] | string;
  type?: 'spring' | 'tween';
  stiffness?: number;
  damping?: number;
  mass?: number;
}

export interface MotionElementProps extends React.HTMLAttributes<HTMLElement> {
  initial?: MotionKeyframesSpec | false;
  animate?: MotionKeyframesSpec;
  exit?: MotionKeyframesSpec;
  transition?: MotionTransitionConfig;
  layoutId?: string;
  custom?: unknown;
  children?: React.ReactNode;
}

// Live registry of currently mounted layoutId elements + their last pre-interaction rects
const mountedLayoutElements = new Map<string, HTMLElement>();
const layoutRectRegistry = new Map<
  string,
  { rect: DOMRect; updatedAt: number }
>();

let globalListenersAttached = false;

function snapshotAllMountedLayoutRects() {
  const now = Date.now();
  mountedLayoutElements.forEach((el, id) => {
    if (el && el.isConnected) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        layoutRectRegistry.set(id, { rect, updatedAt: now });
      }
    }
  });
}

function ensureGlobalFlipCaptureListeners() {
  if (globalListenersAttached || typeof window === 'undefined') return;
  globalListenersAttached = true;
  // Capture rects synchronously in capture phase BEFORE any React onClick handler runs
  window.addEventListener('pointerdown', snapshotAllMountedLayoutRects, {
    capture: true,
    passive: true
  });
  window.addEventListener('mousedown', snapshotAllMountedLayoutRects, {
    capture: true,
    passive: true
  });
  window.addEventListener('keydown', snapshotAllMountedLayoutRects, {
    capture: true,
    passive: true
  });
}

function buildTransformString(state?: MotionKeyframesSpec): string {
  if (!state) return 'translate3d(0px, 0px, 0px) scale(1, 1)';
  const x = state.x ?? 0;
  const y = state.y ?? 0;
  const scale = state.scale ?? 1;
  const sx = (state.scaleX ?? 1) * scale;
  const sy = (state.scaleY ?? 1) * scale;
  return `translate3d(${x}px, ${y}px, 0px) scale(${sx}, ${sy})`;
}

function toWebAnimationKeyframe(state?: MotionKeyframesSpec): Keyframe {
  if (!state) {
    return {
      opacity: 1,
      transform: 'translate3d(0px, 0px, 0px) scale(1, 1)'
    };
  }
  const kf: Keyframe = {
    transform: buildTransformString(state)
  };
  if (typeof state.opacity === 'number') {
    kf.opacity = Math.max(0.15, state.opacity);
  }
  return kf;
}

function resolveEasingString(transition?: MotionTransitionConfig): string {
  if (!transition) return 'cubic-bezier(0.22, 1, 0.36, 1)';
  if (Array.isArray(transition.ease) && transition.ease.length === 4) {
    return `cubic-bezier(${transition.ease.join(', ')})`;
  }
  if (typeof transition.ease === 'string') {
    return transition.ease;
  }
  return 'cubic-bezier(0.22, 1, 0.36, 1)';
}

function resolveDurationMs(transition?: MotionTransitionConfig): number {
  if (!transition) return 220;
  if (typeof transition.duration === 'number') {
    return Math.max(60, Math.round(transition.duration * 1000));
  }
  if (transition.type === 'spring') {
    return 240;
  }
  return 220;
}

function createMotionComponent<Tag extends 'div' | 'span'>(tag: Tag) {
  const Component: React.FC<MotionElementProps> = ({
    initial,
    animate,
    exit: _exit,
    transition,
    layoutId,
    custom: _custom,
    style,
    children,
    ...rest
  }) => {
    const elRef = useRef<HTMLElement | null>(null);
    const hasAnimatedInRef = useRef(false);
    const transitionRef = useRef(transition);
    transitionRef.current = transition;
    const initialRef = useRef(initial);
    initialRef.current = initial;
    const animateRef = useRef(animate);
    animateRef.current = animate;

    // Run FLIP shared layoutId animation ONLY when layoutId mounts/changes (never on arbitrary re-renders)
    useLayoutEffect(() => {
      ensureGlobalFlipCaptureListeners();
      const el = elRef.current;
      if (!el || !layoutId) return;

      const nextRect = el.getBoundingClientRect();
      const prevEntry = layoutRectRegistry.get(layoutId);

      if (
        prevEntry &&
        Date.now() - prevEntry.updatedAt < 10000 &&
        nextRect.width > 0 &&
        nextRect.height > 0 &&
        prevEntry.rect.width > 0 &&
        prevEntry.rect.height > 0
      ) {
        const dx = prevEntry.rect.left - nextRect.left;
        const dy = prevEntry.rect.top - nextRect.top;
        const sx = prevEntry.rect.width / nextRect.width;
        const sy = prevEntry.rect.height / nextRect.height;

        if (
          (Math.abs(dx) > 0.5 ||
            Math.abs(dy) > 0.5 ||
            Math.abs(sx - 1) > 0.02 ||
            Math.abs(sy - 1) > 0.02) &&
          Math.abs(dy) < 320
        ) {
          try {
            el.getAnimations().forEach(a => a.cancel());
            el.animate(
              [
                {
                  transformOrigin: '0 0',
                  transform: `translate3d(${dx}px, ${dy}px, 0px) scale(${sx}, ${sy})`
                },
                {
                  transformOrigin: '0 0',
                  transform: 'translate3d(0px, 0px, 0px) scale(1, 1)'
                }
              ],
              {
                duration: resolveDurationMs(transitionRef.current),
                easing: resolveEasingString(transitionRef.current)
              }
            );
          } catch {
            // Ignore Web Animations API errors in non-visual environments
          }
        }
      }

      mountedLayoutElements.set(layoutId, el);
      if (nextRect.width > 0 && nextRect.height > 0) {
        layoutRectRegistry.set(layoutId, {
          rect: nextRect,
          updatedAt: Date.now()
        });
      }

      return () => {
        if (mountedLayoutElements.get(layoutId) === el) {
          mountedLayoutElements.delete(layoutId);
        }
      };
    }, [layoutId]);

    // Run enter animation ONCE on mount synchronously before paint (never on state re-renders)
    useLayoutEffect(() => {
      const el = elRef.current;
      const initVal = initialRef.current;
      const animVal = animateRef.current;
      if (!el || !animVal || layoutId) return;

      if (!hasAnimatedInRef.current && initVal !== false && initVal) {
        hasAnimatedInRef.current = true;
        try {
          el.getAnimations().forEach(a => a.cancel());
          const anim = el.animate(
            [toWebAnimationKeyframe(initVal), toWebAnimationKeyframe(animVal)],
            {
              duration: resolveDurationMs(transitionRef.current),
              easing: resolveEasingString(transitionRef.current)
            }
          );
          anim.onfinish = () => {
            try {
              anim.cancel();
            } catch {
              // ignore
            }
          };
        } catch {
          // Fallback static apply
        }
      }
    }, [layoutId]);

    const hasNonIdentityTransform =
      animate &&
      ((animate.x && animate.x !== 0) ||
        (animate.y && animate.y !== 0) ||
        (animate.scale !== undefined && animate.scale !== 1) ||
        (animate.scaleX !== undefined && animate.scaleX !== 1) ||
        (animate.scaleY !== undefined && animate.scaleY !== 1));

    const finalStyle: React.CSSProperties = {
      ...style,
      ...(animate
        ? {
            opacity: animate.opacity ?? 1,
            ...(hasNonIdentityTransform ? { transform: buildTransformString(animate) } : {})
          }
        : {})
    };

    return React.createElement(
      tag,
      {
        ...rest,
        ref: elRef,
        style: finalStyle,
        'data-layout-id': layoutId
      },
      children
    );
  };

  Component.displayName = `motion.${tag}`;
  return Component;
}

export const motion = {
  div: createMotionComponent('div'),
  span: createMotionComponent('span')
};

interface AnimatePresenceProps {
  children: React.ReactNode;
  mode?: 'sync' | 'wait' | 'popLayout';
  initial?: boolean;
  custom?: unknown;
}

/**
 * Clean, zero-flicker Presence wrapper that renders active children directly
 * without post-paint duplicate DOM re-mounting.
 */
export const AnimatePresence: React.FC<AnimatePresenceProps> = ({ children }) => {
  return <>{children}</>;
};

interface AvionicsPageTransitionProps {
  activeKey: string;
  reducedMotion?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Silky-smooth full-page transition wrapper using synchronous pre-paint
 * Web Animations on the GPU compositor thread. Strictly guarded so it ONLY
 * runs when activeKey actually changes (never on child state re-renders).
 */
export const AvionicsPageTransition: React.FC<AvionicsPageTransitionProps> = ({
  activeKey,
  reducedMotion = false,
  className = '',
  children
}) => {
  const prevKeyRef = useRef<string>(activeKey);
  const lastAnimatedKeyRef = useRef<string>(activeKey);
  const directionRef = useRef<1 | -1 | 0>(0);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const shimmerRef = useRef<HTMLDivElement | null>(null);

  if (prevKeyRef.current !== activeKey) {
    directionRef.current = computeTransitionDirection(
      prevKeyRef.current,
      activeKey,
      PAGE_TRANSITION_ORDER
    );
    prevKeyRef.current = activeKey;
  }

  const spec = getAvionicsTransitionVariants(directionRef.current, reducedMotion, 'page');
  const specRef = useRef(spec);
  specRef.current = spec;
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  useLayoutEffect(() => {
    if (lastAnimatedKeyRef.current === activeKey) {
      return;
    }
    lastAnimatedKeyRef.current = activeKey;

    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      try {
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      } catch {
        window.scrollTo(0, 0);
      }
    }

    const currentSpec = specRef.current;
    const isReduced = reducedMotionRef.current;
    const el = contentRef.current;

    if (el) {
      try {
        el.getAnimations().forEach(a => a.cancel());
        const startX = isReduced ? 0 : currentSpec.initial.x * 0.75;
        const startY = isReduced ? 0 : currentSpec.initial.y * 0.75;
        const startScale = isReduced ? 1 : 0.994;

        const anim = el.animate(
          [
            {
              opacity: 0.22,
              transform: `translate3d(${startX}px, ${startY}px, 0px) scale(${startScale})`,
              offset: 0
            },
            {
              opacity: 0.9,
              transform: `translate3d(${startX * 0.15}px, ${startY * 0.15}px, 0px) scale(0.999)`,
              offset: 0.45
            },
            {
              opacity: 1,
              transform: 'translate3d(0px, 0px, 0px) scale(1)',
              offset: 1
            }
          ],
          {
            duration: isReduced ? 110 : 240,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
          }
        );
        anim.onfinish = () => {
          try {
            anim.cancel();
          } catch {
            // ignore
          }
        };
      } catch {
        // Ignore in non-visual test environments
      }
    }

    const shimmerEl = shimmerRef.current;
    if (shimmerEl && !isReduced) {
      try {
        shimmerEl.getAnimations().forEach(a => a.cancel());
        shimmerEl.animate(
          [
            { opacity: 0.65, transform: 'scaleX(0.2)' },
            { opacity: 0, transform: 'scaleX(1)' }
          ],
          {
            duration: 260,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
          }
        );
      } catch {
        // ignore
      }
    }
  }, [activeKey]);

  return (
    <div
      data-testid="avionics-page-transition-stage"
      data-active-page={activeKey}
      data-transition-direction={spec.direction}
      className={`relative w-full overflow-x-clip ${className}`}
    >
      {!reducedMotion && (
        <div
          ref={shimmerRef}
          aria-hidden="true"
          style={{ opacity: 0 }}
          className="pointer-events-none absolute inset-x-0 top-0 z-30 h-[1.5px] bg-gradient-to-r from-transparent via-[#38BDF8]/70 to-transparent"
        />
      )}
      <div ref={contentRef} className="relative w-full">
        {children}
      </div>
    </div>
  );
};

interface AvionicsToggleTransitionProps {
  activeKey: string;
  orderedKeys?: readonly string[];
  reducedMotion?: boolean;
  accentColor?: 'sky' | 'orange' | 'amber' | 'emerald';
  className?: string;
  children: React.ReactNode;
}

/**
 * Silky-smooth Mode / Tab / Toggle transition wrapper.
 * Strictly guarded so it ONLY animates when activeKey changes (never on data fetches or form input).
 */
export const AvionicsToggleTransition: React.FC<AvionicsToggleTransitionProps> = ({
  activeKey,
  orderedKeys,
  reducedMotion = false,
  accentColor = 'sky',
  className = '',
  children
}) => {
  const prevKeyRef = useRef<string>(activeKey);
  const lastAnimatedKeyRef = useRef<string>(activeKey);
  const directionRef = useRef<1 | -1 | 0>(0);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const beamRef = useRef<HTMLDivElement | null>(null);

  if (prevKeyRef.current !== activeKey) {
    directionRef.current = computeTransitionDirection(
      prevKeyRef.current,
      activeKey,
      orderedKeys
    );
    prevKeyRef.current = activeKey;
  }

  const spec = getAvionicsTransitionVariants(directionRef.current, reducedMotion, 'toggle');
  const specRef = useRef(spec);
  specRef.current = spec;
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  const beamGradient =
    accentColor === 'orange'
      ? 'from-transparent via-[#FF5500]/65 to-transparent'
      : accentColor === 'amber'
      ? 'from-transparent via-[#F59E0B]/65 to-transparent'
      : accentColor === 'emerald'
      ? 'from-transparent via-[#10B981]/65 to-transparent'
      : 'from-transparent via-[#38BDF8]/65 to-transparent';

  useLayoutEffect(() => {
    if (lastAnimatedKeyRef.current === activeKey) {
      return;
    }
    lastAnimatedKeyRef.current = activeKey;

    const currentSpec = specRef.current;
    const isReduced = reducedMotionRef.current;
    const el = contentRef.current;

    if (el) {
      try {
        el.getAnimations().forEach(a => a.cancel());
        const startX = isReduced ? 0 : currentSpec.initial.x * 0.75;
        const startY = isReduced ? 0 : currentSpec.initial.y * 0.75;
        const startScale = isReduced ? 1 : 0.996;

        const anim = el.animate(
          [
            {
              opacity: 0.28,
              transform: `translate3d(${startX}px, ${startY}px, 0px) scale(${startScale})`,
              offset: 0
            },
            {
              opacity: 0.92,
              transform: `translate3d(${startX * 0.15}px, ${startY * 0.15}px, 0px) scale(0.999)`,
              offset: 0.45
            },
            {
              opacity: 1,
              transform: 'translate3d(0px, 0px, 0px) scale(1)',
              offset: 1
            }
          ],
          {
            duration: isReduced ? 100 : 200,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
          }
        );
        anim.onfinish = () => {
          try {
            anim.cancel();
          } catch {
            // ignore
          }
        };
      } catch {
        // Ignore in non-visual test environments
      }
    }

    const beamEl = beamRef.current;
    if (beamEl && !isReduced) {
      try {
        beamEl.getAnimations().forEach(a => a.cancel());
        beamEl.animate(
          [
            { opacity: 0.6, transform: 'scaleX(0.25)' },
            { opacity: 0, transform: 'scaleX(1)' }
          ],
          {
            duration: 220,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
          }
        );
      } catch {
        // ignore
      }
    }
  }, [activeKey]);

  return (
    <div
      data-testid={`avionics-toggle-stage-${activeKey}`}
      data-active-toggle={activeKey}
      className={`relative w-full overflow-x-clip ${className}`}
    >
      {!reducedMotion && (
        <div
          ref={beamRef}
          aria-hidden="true"
          style={{ opacity: 0 }}
          className={`pointer-events-none absolute inset-x-0 top-0 z-20 h-[1.5px] bg-gradient-to-r ${beamGradient}`}
        />
      )}
      <div ref={contentRef} className="relative w-full">
        {children}
      </div>
    </div>
  );
};
