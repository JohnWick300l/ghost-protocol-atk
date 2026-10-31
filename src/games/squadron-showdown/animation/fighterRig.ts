import { CombatantRuntimeState, FighterActionState } from '../types';

export interface FighterRigPose {
  // Overall body adjustments
  bodyOffsetX: number;
  bodyOffsetY: number;
  torsoLeanDeg: number;
  torsoScaleX: number;
  torsoScaleY: number;
  headNodDeg: number;
  // Articulated arms (degrees relative to resting pose; negative = raised forward toward opponent)
  rearArmAngleDeg: number;
  punchArmAngleDeg: number;
  punchArmExtendPx: number;
  punchArmScale: number;
  // Articulated legs (degrees relative to vertical stance; negative = lifted forward/upward toward opponent)
  supportLegAngleDeg: number;
  kickLegAngleDeg: number;
  kickLegLiftPx: number;
  kickLegExtendPx: number;
  // Combo variant (0 = Jab / Snap Kick, 1 = Cross / Roundhouse, 2 = Uppercut / High Side Kick)
  strikeVariant: 0 | 1 | 2;
  isPunchActive: boolean;
  isKickActive: boolean;
}

export type SleeveStyle =
  | 'LONG_JACKET'
  | 'SHORT_SLEEVE_BARE_ARM'
  | 'ROLLED_SLEEVE_GLOVE'
  | 'RACING_ARMOR'
  | 'PENGUIN_FLIPPER';

export type HandStyle =
  | 'BARE_FIST'
  | 'FINGERLESS_GLOVE'
  | 'FULL_GAUNTLET'
  | 'PENGUIN_TIP';

export type BootStyle =
  | 'TACTICAL_SNEAKER'
  | 'ATHLETic_RUNNER'
  | 'NEON_HIGHTOP'
  | 'RACING_BOOT'
  | 'COMBAT_BOOT'
  | 'WEBBED_FOOT';

export interface OrientedLimbStripConfig {
  // Normalized coordinates (0..1) inside character bounding box:
  // p0 = proximal joint (elbow/shoulder for arm, hip/thigh for leg)
  // p1 = exact distal tip (front knuckles of hand/fist for arm, sneaker/boot/foot tip for leg)
  p0Rx: number;
  p0Ry: number;
  p1Rx: number;
  p1Ry: number;
  thicknessRatio: number;
  flipY?: boolean;
  // Optional pixel key-out filters to strip any adjacent shirt/chest pixels near the arm/fist
  clearDarkBgAtTip?: boolean;
  clearWhiteShirtBg?: boolean;
  clearYellowChestBg?: boolean;
}

export interface CharacterAnatomicalProfile {
  fighterId: string;
  // Normalized pivot coordinates within detected sprite bounds (0..1)
  shoulderRx: number;
  shoulderRy: number;
  hipRx: number;
  hipRy: number;
  // Scanned oriented vector in the source sprite for the upper sleeve (shoulder -> elbow)
  upperArmStrip: OrientedLimbStripConfig;
  // Scanned oriented vector in the source sprite from forearm/elbow -> exact front knuckles of hand/fist
  armStrip: OrientedLimbStripConfig;
  // Scanned oriented vector in the source sprite from hip -> exact sneaker/boot/foot tip
  legStrip: OrientedLimbStripConfig;
  // Optional transparent cutout for a raised resting front fist/elbow outside the torso
  outerArmCutout?: {
    rx: number;
    ry: number;
    rw: number;
    rh: number;
  };
  // Arm & Hand metadata
  sleeveStyle: SleeveStyle;
  handStyle: HandStyle;
  sleevePrimary: string;
  sleeveSecondary: string;
  sleeveHighlight: string;
  cuffColor: string;
  skinTone: string;
  skinShadow: string;
  gloveColor: string;
  gloveAccent: string;
  needsConstructedFistCap?: boolean;
  // Leg & Boot metadata
  bootStyle: BootStyle;
  pantsPrimary: string;
  pantsSecondary: string;
  pantsHighlight: string;
  shoePrimary: string;
  shoeSecondary: string;
  shoeSole: string;
  shoeAccent: string;
}

export interface ArticulatedLimbJoints {
  shoulder: { x: number; y: number };
  elbow: { x: number; y: number };
  wrist: { x: number; y: number };
  fistCenter: { x: number; y: number };
  hip: { x: number; y: number };
  knee: { x: number; y: number };
  ankle: { x: number; y: number };
  footTip: { x: number; y: number };
}

/**
 * Scanned per-character anatomical profiles for all 12 fighters in Squadron Showdown.
 * Uses each character's actual high-resolution sprite pixels for both punching (arm + hand/fist)
 * and kicking (thigh + shin + sneaker/boot/foot) so the character's real hand and foot
 * strike the opponent while preserving 100% of their original appearance and outfit.
 */
export const CHARACTER_ANATOMICAL_PROFILES: Record<
  string,
  CharacterAnatomicalProfile
> = {
  // 1. NARESH — Yellow UV bomber jacket, bare clenched fists, black cargo pants, black tactical sneakers
  FIGHTER_001: {
    fighterId: 'FIGHTER_001',
    shoulderRx: 0.48,
    shoulderRy: 0.25,
    hipRx: 0.56,
    hipRy: 0.50,
    // Clean yellow outer sleeve (no PILOT chest text)
    upperArmStrip: {
      p0Rx: 0.17,
      p0Ry: 0.22,
      p1Rx: 0.12,
      p1Ry: 0.34,
      thicknessRatio: 0.13,
      flipY: false,
    },
    // Naresh's real yellow forearm + green smartwatch + clenched bare fist ending right at the front knuckles
    armStrip: {
      p0Rx: 0.13,
      p0Ry: 0.33,
      p1Rx: 0.395,
      p1Ry: 0.285,
      thicknessRatio: 0.135,
      flipY: false,
      clearDarkBgAtTip: true,
    },
    // Naresh's real black cargo leg + black tactical sneaker
    legStrip: {
      p0Rx: 0.55,
      p0Ry: 0.50,
      p1Rx: 0.85,
      p1Ry: 0.96,
      thicknessRatio: 0.32,
      flipY: false,
    },
    outerArmCutout: {
      rx: 0.77,
      ry: 0.25,
      rw: 0.23,
      rh: 0.16,
    },
    sleeveStyle: 'LONG_JACKET',
    handStyle: 'BARE_FIST',
    sleevePrimary: '#f59e0b',
    sleeveSecondary: '#b45309',
    sleeveHighlight: '#fde047',
    cuffColor: '#d97706',
    skinTone: '#e09a6c',
    skinShadow: '#a8643c',
    gloveColor: '#e09a6c',
    gloveAccent: '#f59e0b',
    bootStyle: 'TACTICAL_SNEAKER',
    pantsPrimary: '#1e2128',
    pantsSecondary: '#12141a',
    pantsHighlight: '#374151',
    shoePrimary: '#181a20',
    shoeSecondary: '#374151',
    shoeSole: '#6b7280',
    shoeAccent: '#f8fafc',
  },

  // 2. DHEERAJ — White graphic tee, muscular bare forearms & fists, blue jeans, white/grey sneakers
  FIGHTER_002: {
    fighterId: 'FIGHTER_002',
    shoulderRx: 0.54,
    shoulderRy: 0.25,
    hipRx: 0.58,
    hipRy: 0.50,
    // Dheeraj's white short-sleeve upper arm
    upperArmStrip: {
      p0Rx: 0.28,
      p0Ry: 0.22,
      p1Rx: 0.22,
      p1Ry: 0.34,
      thicknessRatio: 0.13,
      flipY: false,
    },
    // Dheeraj's raised front muscular bare forearm + clenched bare fist (with white-shirt pixel filter so 100% pure skin arm & fist!)
    armStrip: {
      p0Rx: 0.83,
      p0Ry: 0.34,
      p1Rx: 0.71,
      p1Ry: 0.19,
      thicknessRatio: 0.135,
      flipY: true,
      clearWhiteShirtBg: true,
    },
    // Dheeraj's blue jeans leg + white/black athletic sneaker
    legStrip: {
      p0Rx: 0.57,
      p0Ry: 0.50,
      p1Rx: 0.88,
      p1Ry: 0.96,
      thicknessRatio: 0.30,
      flipY: false,
    },
    outerArmCutout: {
      rx: 0.67,
      ry: 0.16,
      rw: 0.32,
      rh: 0.24,
    },
    sleeveStyle: 'SHORT_SLEEVE_BARE_ARM',
    handStyle: 'BARE_FIST',
    sleevePrimary: '#f8fafc',
    sleeveSecondary: '#cbd5e1',
    sleeveHighlight: '#ffffff',
    cuffColor: '#e2e8f0',
    skinTone: '#e09869',
    skinShadow: '#b4693e',
    gloveColor: '#e09869',
    gloveAccent: '#ef4444',
    bootStyle: 'ATHLETic_RUNNER',
    pantsPrimary: '#4b7bb5',
    pantsSecondary: '#2e5484',
    pantsHighlight: '#7aa7dc',
    shoePrimary: '#f1f5f9',
    shoeSecondary: '#cbd5e1',
    shoeSole: '#1e293b',
    shoeAccent: '#0f172a',
  },

  // 3. VIJAY — Black bomber jacket over yellow tee, bare fists, black cargo pants, neon pink/purple/volt high-top sneakers
  FIGHTER_003: {
    fighterId: 'FIGHTER_003',
    shoulderRx: 0.54,
    shoulderRy: 0.24,
    hipRx: 0.58,
    hipRy: 0.49,
    upperArmStrip: {
      p0Rx: 0.66,
      p0Ry: 0.20,
      p1Rx: 0.82,
      p1Ry: 0.31,
      thicknessRatio: 0.13,
      flipY: false,
    },
    // Vijay's raised right black bomber sleeve + clenched bare fist (above lapel badge)
    armStrip: {
      p0Rx: 0.14,
      p0Ry: 0.25,
      p1Rx: 0.30,
      p1Ry: 0.16,
      thicknessRatio: 0.115,
      flipY: false,
      clearYellowChestBg: true,
    },
    // Vijay's black cargo leg + neon pink/purple high-top sneaker
    legStrip: {
      p0Rx: 0.56,
      p0Ry: 0.49,
      p1Rx: 0.90,
      p1Ry: 0.95,
      thicknessRatio: 0.30,
      flipY: false,
    },
    outerArmCutout: {
      rx: 0.72,
      ry: 0.22,
      rw: 0.27,
      rh: 0.17,
    },
    sleeveStyle: 'LONG_JACKET',
    handStyle: 'BARE_FIST',
    sleevePrimary: '#1b1f2a',
    sleeveSecondary: '#0f1219',
    sleeveHighlight: '#3b4254',
    cuffColor: '#11131a',
    skinTone: '#e5a073',
    skinShadow: '#b06b40',
    gloveColor: '#e5a073',
    gloveAccent: '#ef4444',
    bootStyle: 'NEON_HIGHTOP',
    pantsPrimary: '#1a1d26',
    pantsSecondary: '#0e1017',
    pantsHighlight: '#33394a',
    shoePrimary: '#ec4899',
    shoeSecondary: '#7e22ce',
    shoeSole: '#f43f5e',
    shoeAccent: '#a3e635',
  },

  // 4. ABHIYAN — Black & crimson-red leather racing suit, armored racing gloves, black & red racing boots
  FIGHTER_004: {
    fighterId: 'FIGHTER_004',
    shoulderRx: 0.52,
    shoulderRy: 0.24,
    hipRx: 0.55,
    hipRy: 0.50,
    upperArmStrip: {
      p0Rx: 0.24,
      p0Ry: 0.21,
      p1Rx: 0.17,
      p1Ry: 0.37,
      thicknessRatio: 0.13,
      flipY: true,
    },
    // Abhiyan's unobstructed right racing forearm + armored black/red racing glove fist
    armStrip: {
      p0Rx: 0.17,
      p0Ry: 0.38,
      p1Rx: 0.29,
      p1Ry: 0.555,
      thicknessRatio: 0.135,
      flipY: true,
    },
    legStrip: {
      p0Rx: 0.55,
      p0Ry: 0.50,
      p1Rx: 0.78,
      p1Ry: 0.96,
      thicknessRatio: 0.32,
      flipY: false,
    },
    sleeveStyle: 'RACING_ARMOR',
    handStyle: 'FULL_GAUNTLET',
    sleevePrimary: '#1a1c23',
    sleeveSecondary: '#0d0f14',
    sleeveHighlight: '#ef4444',
    cuffColor: '#ef4444',
    skinTone: '#d99164',
    skinShadow: '#9c5a34',
    gloveColor: '#181a20',
    gloveAccent: '#ef4444',
    bootStyle: 'RACING_BOOT',
    pantsPrimary: '#1a1c23',
    pantsSecondary: '#0e1015',
    pantsHighlight: '#ef4444',
    shoePrimary: '#181a20',
    shoeSecondary: '#ef4444',
    shoeSole: '#090b0e',
    shoeAccent: '#ef4444',
  },

  // 5. LEXI — Yellow & black tactical jacket, black fingerless combat gloves, black cargo pants, black/yellow/white high-top boots
  FIGHTER_005: {
    fighterId: 'FIGHTER_005',
    shoulderRx: 0.52,
    shoulderRy: 0.24,
    hipRx: 0.56,
    hipRy: 0.47,
    upperArmStrip: {
      p0Rx: 0.31,
      p0Ry: 0.21,
      p1Rx: 0.23,
      p1Ry: 0.32,
      thicknessRatio: 0.13,
      flipY: false,
    },
    // Lexi's raised right-side bare forearm + black fingerless combat glove fist (outer clean trajectory!)
    armStrip: {
      p0Rx: 0.79,
      p0Ry: 0.29,
      p1Rx: 0.64,
      p1Ry: 0.165,
      thicknessRatio: 0.135,
      flipY: true,
    },
    legStrip: {
      p0Rx: 0.55,
      p0Ry: 0.47,
      p1Rx: 0.80,
      p1Ry: 0.88,
      thicknessRatio: 0.32,
      flipY: false,
    },
    outerArmCutout: {
      rx: 0.62,
      ry: 0.15,
      rw: 0.32,
      rh: 0.21,
    },
    sleeveStyle: 'ROLLED_SLEEVE_GLOVE',
    handStyle: 'FINGERLESS_GLOVE',
    sleevePrimary: '#facc15',
    sleeveSecondary: '#ca8a04',
    sleeveHighlight: '#fef08a',
    cuffColor: '#eab308',
    skinTone: '#eab08a',
    skinShadow: '#bf7e56',
    gloveColor: '#1c1f26',
    gloveAccent: '#facc15',
    bootStyle: 'NEON_HIGHTOP',
    pantsPrimary: '#1b1d24',
    pantsSecondary: '#101217',
    pantsHighlight: '#374151',
    shoePrimary: '#181a20',
    shoeSecondary: '#facc15',
    shoeSole: '#f8fafc',
    shoeAccent: '#facc15',
  },

  // 6. PENGUIN BHAI — Black & cream flipper wings and bright orange webbed feet
  FIGHTER_006: {
    fighterId: 'FIGHTER_006',
    shoulderRx: 0.66,
    shoulderRy: 0.36,
    hipRx: 0.58,
    hipRy: 0.72,
    upperArmStrip: {
      p0Rx: 0.72,
      p0Ry: 0.39,
      p1Rx: 0.84,
      p1Ry: 0.31,
      thicknessRatio: 0.16,
      flipY: false,
    },
    armStrip: {
      p0Rx: 0.74,
      p0Ry: 0.38,
      p1Rx: 0.96,
      p1Ry: 0.22,
      thicknessRatio: 0.18,
      flipY: false,
    },
    legStrip: {
      p0Rx: 0.58,
      p0Ry: 0.72,
      p1Rx: 0.84,
      p1Ry: 0.93,
      thicknessRatio: 0.30,
      flipY: false,
    },
    outerArmCutout: {
      rx: 0.72,
      ry: 0.18,
      rw: 0.28,
      rh: 0.28,
    },
    sleeveStyle: 'PENGUIN_FLIPPER',
    handStyle: 'PENGUIN_TIP',
    sleevePrimary: '#181b22',
    sleeveSecondary: '#0d0f14',
    sleeveHighlight: '#f5f0e6',
    cuffColor: '#181b22',
    skinTone: '#f5f0e6',
    skinShadow: '#cbd5e1',
    gloveColor: '#181b22',
    gloveAccent: '#38bdf8',
    bootStyle: 'WEBBED_FOOT',
    pantsPrimary: '#f8fafc',
    pantsSecondary: '#e2e8f0',
    pantsHighlight: '#ffffff',
    shoePrimary: '#f97316',
    shoeSecondary: '#ea580c',
    shoeSole: '#c2410c',
    shoeAccent: '#181b22',
  },

  // 7. GIRIMON — Black short-sleeve UV crew shirt with grey cuff, bare brown forearms + watch, blue jeans, white/black sneakers
  FIGHTER_007: {
    fighterId: 'FIGHTER_007',
    shoulderRx: 0.53,
    shoulderRy: 0.24,
    hipRx: 0.54,
    hipRy: 0.49,
    upperArmStrip: {
      p0Rx: 0.62,
      p0Ry: 0.20,
      p1Rx: 0.70,
      p1Ry: 0.32,
      thicknessRatio: 0.13,
      flipY: false,
    },
    armStrip: {
      p0Rx: 0.71,
      p0Ry: 0.34,
      p1Rx: 0.62,
      p1Ry: 0.47,
      thicknessRatio: 0.13,
      flipY: false,
      clearDarkBgAtTip: true,
    },
    legStrip: {
      p0Rx: 0.54,
      p0Ry: 0.49,
      p1Rx: 0.72,
      p1Ry: 0.96,
      thicknessRatio: 0.32,
      flipY: false,
    },
    needsConstructedFistCap: true,
    sleeveStyle: 'SHORT_SLEEVE_BARE_ARM',
    handStyle: 'BARE_FIST',
    sleevePrimary: '#1e2028',
    sleeveSecondary: '#111318',
    sleeveHighlight: '#334155',
    cuffColor: '#94a3b8',
    skinTone: '#c67d4e',
    skinShadow: '#8f5129',
    gloveColor: '#c67d4e',
    gloveAccent: '#3b82f6',
    bootStyle: 'ATHLETic_RUNNER',
    pantsPrimary: '#3b6ca8',
    pantsSecondary: '#244875',
    pantsHighlight: '#6094d4',
    shoePrimary: '#f8fafc',
    shoeSecondary: '#181b22',
    shoeSole: '#e2e8f0',
    shoeAccent: '#d97706',
  },

  // 8. DQ (THE SHADOW RIDER) — Black hooded leather jacket, fingerless shadow gloves, black cargo pants, black combat boots
  FIGHTER_008: {
    fighterId: 'FIGHTER_008',
    shoulderRx: 0.52,
    shoulderRy: 0.24,
    hipRx: 0.56,
    hipRy: 0.49,
    upperArmStrip: {
      p0Rx: 0.24,
      p0Ry: 0.24,
      p1Rx: 0.20,
      p1Ry: 0.37,
      thicknessRatio: 0.13,
      flipY: true,
    },
    armStrip: {
      p0Rx: 0.20,
      p0Ry: 0.37,
      p1Rx: 0.23,
      p1Ry: 0.55,
      thicknessRatio: 0.135,
      flipY: true,
    },
    legStrip: {
      p0Rx: 0.56,
      p0Ry: 0.49,
      p1Rx: 0.76,
      p1Ry: 0.96,
      thicknessRatio: 0.30,
      flipY: false,
    },
    sleeveStyle: 'LONG_JACKET',
    handStyle: 'FINGERLESS_GLOVE',
    sleevePrimary: '#131824',
    sleeveSecondary: '#090c14',
    sleeveHighlight: '#2e3c56',
    cuffColor: '#1b2234',
    skinTone: '#d29972',
    skinShadow: '#996543',
    gloveColor: '#10131c',
    gloveAccent: '#38bdf8',
    bootStyle: 'COMBAT_BOOT',
    pantsPrimary: '#131722',
    pantsSecondary: '#090b12',
    pantsHighlight: '#283248',
    shoePrimary: '#0f131c',
    shoeSecondary: '#1e2638',
    shoeSole: '#07090e',
    shoeAccent: '#38bdf8',
  },

  // 10. KAEL VANCE — Cyber-Volt blue/slate armored biker suit
  FIGHTER_010: {
    fighterId: 'FIGHTER_010',
    shoulderRx: 0.58,
    shoulderRy: 0.27,
    hipRx: 0.56,
    hipRy: 0.54,
    upperArmStrip: {
      p0Rx: 0.32,
      p0Ry: 0.26,
      p1Rx: 0.24,
      p1Ry: 0.36,
      thicknessRatio: 0.20,
      flipY: false,
    },
    armStrip: {
      p0Rx: 0.24,
      p0Ry: 0.36,
      p1Rx: 0.41,
      p1Ry: 0.28,
      thicknessRatio: 0.21,
      flipY: false,
    },
    legStrip: {
      p0Rx: 0.56,
      p0Ry: 0.54,
      p1Rx: 0.78,
      p1Ry: 0.95,
      thicknessRatio: 0.30,
      flipY: false,
    },
    sleeveStyle: 'RACING_ARMOR',
    handStyle: 'FULL_GAUNTLET',
    sleevePrimary: '#1e293b',
    sleeveSecondary: '#0f172a',
    sleeveHighlight: '#38bdf8',
    cuffColor: '#0284c7',
    skinTone: '#38bdf8',
    skinShadow: '#0284c7',
    gloveColor: '#0284c7',
    gloveAccent: '#e0f2fe',
    bootStyle: 'RACING_BOOT',
    pantsPrimary: '#1e293b',
    pantsSecondary: '#0f172a',
    pantsHighlight: '#38bdf8',
    shoePrimary: '#0f172a',
    shoeSecondary: '#0284c7',
    shoeSole: '#38bdf8',
    shoeAccent: '#e0f2fe',
  },

  // 11. ZARA RAO — Cyber Valkyrie violet/silver aero suit
  FIGHTER_011: {
    fighterId: 'FIGHTER_011',
    shoulderRx: 0.58,
    shoulderRy: 0.27,
    hipRx: 0.56,
    hipRy: 0.54,
    upperArmStrip: {
      p0Rx: 0.32,
      p0Ry: 0.26,
      p1Rx: 0.24,
      p1Ry: 0.36,
      thicknessRatio: 0.20,
      flipY: false,
    },
    armStrip: {
      p0Rx: 0.24,
      p0Ry: 0.36,
      p1Rx: 0.41,
      p1Ry: 0.28,
      thicknessRatio: 0.21,
      flipY: false,
    },
    legStrip: {
      p0Rx: 0.56,
      p0Ry: 0.54,
      p1Rx: 0.78,
      p1Ry: 0.95,
      thicknessRatio: 0.30,
      flipY: false,
    },
    sleeveStyle: 'RACING_ARMOR',
    handStyle: 'FULL_GAUNTLET',
    sleevePrimary: '#2e1065',
    sleeveSecondary: '#1e1b4b',
    sleeveHighlight: '#e879f9',
    cuffColor: '#9333ea',
    skinTone: '#e879f9',
    skinShadow: '#9333ea',
    gloveColor: '#9333ea',
    gloveAccent: '#f5d0fe',
    bootStyle: 'RACING_BOOT',
    pantsPrimary: '#2e1065',
    pantsSecondary: '#1e1b4b',
    pantsHighlight: '#e879f9',
    shoePrimary: '#1e1b4b',
    shoeSecondary: '#9333ea',
    shoeSole: '#e879f9',
    shoeAccent: '#f5d0fe',
  },

  // 12. REX KAPOOR — Apex Titan molten orange heavy armor
  FIGHTER_012: {
    fighterId: 'FIGHTER_012',
    shoulderRx: 0.60,
    shoulderRy: 0.26,
    hipRx: 0.58,
    hipRy: 0.54,
    upperArmStrip: {
      p0Rx: 0.30,
      p0Ry: 0.26,
      p1Rx: 0.22,
      p1Ry: 0.36,
      thicknessRatio: 0.22,
      flipY: false,
    },
    armStrip: {
      p0Rx: 0.22,
      p0Ry: 0.36,
      p1Rx: 0.41,
      p1Ry: 0.28,
      thicknessRatio: 0.22,
      flipY: false,
    },
    legStrip: {
      p0Rx: 0.58,
      p0Ry: 0.54,
      p1Rx: 0.80,
      p1Ry: 0.95,
      thicknessRatio: 0.32,
      flipY: false,
    },
    sleeveStyle: 'RACING_ARMOR',
    handStyle: 'FULL_GAUNTLET',
    sleevePrimary: '#27272a',
    sleeveSecondary: '#18181b',
    sleeveHighlight: '#f97316',
    cuffColor: '#ea580c',
    skinTone: '#f97316',
    skinShadow: '#c2410c',
    gloveColor: '#ea580c',
    gloveAccent: '#ffedd5',
    bootStyle: 'RACING_BOOT',
    pantsPrimary: '#27272a',
    pantsSecondary: '#18181b',
    pantsHighlight: '#f97316',
    shoePrimary: '#18181b',
    shoeSecondary: '#ea580c',
    shoeSole: '#f97316',
    shoeAccent: '#fed7aa',
  },

  // 13. KENJI SATO — Neon Drift emerald cyber suit
  FIGHTER_013: {
    fighterId: 'FIGHTER_013',
    shoulderRx: 0.58,
    shoulderRy: 0.27,
    hipRx: 0.56,
    hipRy: 0.54,
    upperArmStrip: {
      p0Rx: 0.32,
      p0Ry: 0.26,
      p1Rx: 0.24,
      p1Ry: 0.36,
      thicknessRatio: 0.20,
      flipY: false,
    },
    armStrip: {
      p0Rx: 0.24,
      p0Ry: 0.36,
      p1Rx: 0.41,
      p1Ry: 0.28,
      thicknessRatio: 0.21,
      flipY: false,
    },
    legStrip: {
      p0Rx: 0.56,
      p0Ry: 0.54,
      p1Rx: 0.78,
      p1Ry: 0.95,
      thicknessRatio: 0.30,
      flipY: false,
    },
    sleeveStyle: 'RACING_ARMOR',
    handStyle: 'FULL_GAUNTLET',
    sleevePrimary: '#064e3b',
    sleeveSecondary: '#022c22',
    sleeveHighlight: '#34d399',
    cuffColor: '#10b981',
    skinTone: '#34d399',
    skinShadow: '#059669',
    gloveColor: '#10b981',
    gloveAccent: '#d1fae5',
    bootStyle: 'RACING_BOOT',
    pantsPrimary: '#064e3b',
    pantsSecondary: '#022c22',
    pantsHighlight: '#34d399',
    shoePrimary: '#022c22',
    shoeSecondary: '#10b981',
    shoeSole: '#34d399',
    shoeAccent: '#d1fae5',
  },
};

export function getCharacterAnatomicalProfile(
  fighterId?: string
): CharacterAnatomicalProfile {
  if (fighterId && CHARACTER_ANATOMICAL_PROFILES[fighterId]) {
    return CHARACTER_ANATOMICAL_PROFILES[fighterId];
  }
  return CHARACTER_ANATOMICAL_PROFILES.FIGHTER_001;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Pure kinematic solver that computes the exact limb angles and extensions
 * for any fighter action state, progress (0..1), combo count, and clock time.
 * Decoupled from DOM/Canvas so it can be unit-tested directly.
 */
export function computeFighterRigPose(
  action: FighterActionState,
  actionTimerMs: number,
  actionDurationMs: number,
  comboCount: number,
  timeMs: number,
  isAI = false
): FighterRigPose {
  const progress =
    actionDurationMs > 0 ? clamp01(actionTimerMs / actionDurationMs) : 0;
  const phaseOffset = isAI ? 1.7 : 0;
  const variant = (Math.max(0, comboCount) % 3) as 0 | 1 | 2;

  const pose: FighterRigPose = {
    bodyOffsetX: 0,
    bodyOffsetY: 0,
    torsoLeanDeg: 0,
    torsoScaleX: 1,
    torsoScaleY: 1,
    headNodDeg: 0,
    rearArmAngleDeg: 0,
    punchArmAngleDeg: 0,
    punchArmExtendPx: 0,
    punchArmScale: 1,
    supportLegAngleDeg: 0,
    kickLegAngleDeg: 0,
    kickLegLiftPx: 0,
    kickLegExtendPx: 0,
    strikeVariant: variant,
    isPunchActive: false,
    isKickActive: false,
  };

  switch (action) {
    case 'IDLE': {
      const breath = Math.sin(timeMs * 0.006 + phaseOffset);
      const rhythm = Math.cos(timeMs * 0.012 + phaseOffset);
      pose.torsoScaleY = 1 + breath * 0.018;
      pose.torsoScaleX = 1 - breath * 0.009;
      pose.bodyOffsetY = Math.abs(rhythm) * 3;
      pose.headNodDeg = breath * 2.5;
      pose.punchArmAngleDeg = -8 + rhythm * 5;
      pose.rearArmAngleDeg = -6 - rhythm * 4;
      pose.supportLegAngleDeg = breath * 1.5;
      pose.kickLegAngleDeg = -breath * 1.5;
      break;
    }

    case 'WALK_FORWARD': {
      const stride = Math.sin(timeMs * 0.018 + phaseOffset);
      pose.bodyOffsetY = -Math.abs(stride) * 9;
      pose.torsoLeanDeg = 7.5;
      pose.headNodDeg = 3;
      pose.supportLegAngleDeg = stride * 22;
      pose.kickLegAngleDeg = -stride * 24;
      pose.kickLegLiftPx = Math.max(0, -stride) * 14;
      pose.punchArmAngleDeg = -18 + stride * 16;
      pose.rearArmAngleDeg = -12 - stride * 16;
      break;
    }

    case 'WALK_BACKWARD': {
      const stride = Math.sin(timeMs * 0.016 + phaseOffset);
      pose.bodyOffsetY = -Math.abs(stride) * 7;
      pose.torsoLeanDeg = -6;
      pose.headNodDeg = -2;
      pose.supportLegAngleDeg = -stride * 18;
      pose.kickLegAngleDeg = stride * 18;
      pose.kickLegLiftPx = Math.max(0, stride) * 10;
      pose.punchArmAngleDeg = -22 - stride * 12;
      pose.rearArmAngleDeg = -18 + stride * 12;
      break;
    }

    case 'JUMP': {
      pose.torsoLeanDeg = 6;
      pose.torsoScaleY = 1.04;
      pose.supportLegAngleDeg = 18;
      pose.kickLegAngleDeg = -34;
      pose.kickLegLiftPx = 28;
      pose.punchArmAngleDeg = -35;
      pose.rearArmAngleDeg = -28;
      break;
    }

    case 'CROUCH': {
      pose.bodyOffsetY = 26;
      pose.torsoScaleY = 0.86;
      pose.torsoScaleX = 1.06;
      pose.torsoLeanDeg = 12;
      pose.supportLegAngleDeg = 22;
      pose.kickLegAngleDeg = -24;
      pose.kickLegLiftPx = 18;
      pose.punchArmAngleDeg = -32;
      pose.rearArmAngleDeg = -28;
      break;
    }

    case 'BLOCK': {
      const hum = Math.sin(timeMs * 0.025) * 1.5;
      pose.bodyOffsetY = 6;
      pose.torsoLeanDeg = -5;
      pose.headNodDeg = 6;
      pose.punchArmAngleDeg = -58 + hum;
      pose.rearArmAngleDeg = -52 - hum;
      pose.punchArmExtendPx = 12;
      pose.supportLegAngleDeg = 10;
      pose.kickLegAngleDeg = -8;
      break;
    }

    case 'DODGE': {
      pose.bodyOffsetX = -18;
      pose.bodyOffsetY = 10;
      pose.torsoLeanDeg = -16;
      pose.supportLegAngleDeg = 20;
      pose.kickLegAngleDeg = -18;
      pose.punchArmAngleDeg = -25;
      break;
    }

    case 'PUNCH': {
      pose.isPunchActive = true;
      let ext = 0;
      if (progress < 0.15) {
        ext = 0.55 + (progress / 0.15) * 0.45;
      } else if (progress < 0.72) {
        ext = 1.0;
      } else {
        ext = Math.cos(((progress - 0.72) / 0.28) * (Math.PI / 2));
      }

      const clampedExt = clamp01(ext);
      const targetAngle =
        variant === 0 ? -84 : variant === 1 ? -96 : -112;

      pose.bodyOffsetX = clampedExt * 32;
      pose.torsoLeanDeg = clampedExt * 12;
      pose.headNodDeg = clampedExt * 5;
      pose.punchArmAngleDeg = clampedExt * targetAngle;
      pose.punchArmExtendPx = clampedExt * (variant === 2 ? 78 : 88);
      pose.punchArmScale = 1 + clampedExt * 0.22;
      pose.rearArmAngleDeg = 18 * clampedExt;
      pose.supportLegAngleDeg = 2 * clampedExt;
      pose.kickLegAngleDeg = -2 * clampedExt;
      break;
    }

    case 'KICK': {
      pose.isKickActive = true;
      let kickCurve = 0;
      if (progress < 0.18) {
        kickCurve = 0.55 + (progress / 0.18) * 0.45;
      } else if (progress < 0.75) {
        kickCurve = 1.0;
      } else {
        kickCurve = Math.cos(((progress - 0.75) / 0.25) * (Math.PI / 2));
      }

      const clampedKick = clamp01(kickCurve);
      const targetLegAngle =
        variant === 0 ? -82 : variant === 1 ? -96 : -110;

      pose.bodyOffsetX = clampedKick * 28;
      pose.bodyOffsetY = -clampedKick * 10;
      pose.torsoLeanDeg = -clampedKick * 15;
      pose.headNodDeg = clampedKick * 6;
      pose.kickLegAngleDeg = clampedKick * targetLegAngle;
      pose.kickLegLiftPx = clampedKick * (variant === 2 ? 78 : 64);
      pose.kickLegExtendPx = clampedKick * 84;
      pose.supportLegAngleDeg = clampedKick * 10;
      pose.punchArmAngleDeg = -32 * clampedKick;
      pose.rearArmAngleDeg = 28 * clampedKick;
      break;
    }

    case 'SPECIAL': {
      const surge = Math.sin(progress * Math.PI);
      pose.isPunchActive = true;
      pose.isKickActive = progress > 0.35;
      pose.bodyOffsetX = surge * 42;
      pose.bodyOffsetY = -surge * 18;
      pose.torsoLeanDeg = surge * 16;
      pose.torsoScaleX = 1 + surge * 0.06;
      pose.torsoScaleY = 1 + surge * 0.06;
      pose.punchArmAngleDeg = -92 * surge;
      pose.punchArmExtendPx = 88 * surge;
      pose.punchArmScale = 1 + surge * 0.26;
      pose.kickLegAngleDeg = -84 * surge;
      pose.kickLegLiftPx = 56 * surge;
      pose.kickLegExtendPx = 74 * surge;
      break;
    }

    case 'HIT_STUN': {
      pose.bodyOffsetX = -16;
      pose.torsoLeanDeg = -19;
      pose.headNodDeg = -18;
      pose.punchArmAngleDeg = 22;
      pose.rearArmAngleDeg = 28;
      pose.supportLegAngleDeg = -12;
      pose.kickLegAngleDeg = 16;
      break;
    }

    case 'VICTORY': {
      const pump = Math.abs(Math.sin(timeMs * 0.009));
      pose.bodyOffsetY = -pump * 14;
      pose.torsoScaleY = 1 + pump * 0.04;
      pose.punchArmAngleDeg = -115 * pump;
      pose.punchArmExtendPx = 42 * pump;
      pose.headNodDeg = -6 * pump;
      break;
    }

    case 'DEFEAT':
    case 'KNOCKDOWN': {
      pose.bodyOffsetY = 20;
      pose.torsoLeanDeg = -65;
      pose.torsoScaleY = 0.65;
      break;
    }
  }

  return pose;
}

/**
 * Pure kinematic 2-joint solver for the character's striking arm (Shoulder -> Elbow -> Wrist -> Fist)
 * and striking leg (Hip -> Knee -> Ankle -> Boot/Foot Tip).
 */
export function computeArticulatedLimbJoints(
  pose: FighterRigPose,
  profile: CharacterAnatomicalProfile,
  canvasWidth = 520,
  canvasHeight = 460,
  targetWidth = 175,
  targetHeight = 295
): ArticulatedLimbJoints {
  const baseCenterX = canvasWidth * 0.44 + pose.bodyOffsetX;
  const groundY = canvasHeight - 32 + pose.bodyOffsetY;
  const topY = groundY - targetHeight;
  const leftX = baseCenterX - targetWidth / 2;

  // 1. Shoulder -> Elbow -> Wrist -> Fist kinematics
  const shoulderX = leftX + targetWidth * profile.shoulderRx;
  const shoulderY = topY + targetHeight * profile.shoulderRy;

  const extRatio = clamp01(pose.punchArmExtendPx / 88);
  const aimAngleDeg =
    pose.strikeVariant === 2
      ? -16
      : pose.strikeVariant === 1
      ? -5
      : 1;
  const aimRad = (aimAngleDeg * Math.PI) / 180;

  const upperArmLen = (30 + extRatio * 18) * pose.punchArmScale;
  const forearmLen = (36 + extRatio * 30) * pose.punchArmScale;
  const elbowBendRad = ((1 - extRatio) * 20 * Math.PI) / 180;

  const elbowX =
    shoulderX + Math.cos(aimRad + elbowBendRad * 0.5) * upperArmLen;
  const elbowY =
    shoulderY + Math.sin(aimRad + elbowBendRad * 0.5) * upperArmLen;

  const wristX =
    elbowX + Math.cos(aimRad - elbowBendRad * 0.35) * forearmLen;
  const wristY =
    elbowY + Math.sin(aimRad - elbowBendRad * 0.35) * forearmLen;

  const fistCenterX = wristX + Math.cos(aimRad) * 16;
  const fistCenterY = wristY + Math.sin(aimRad) * 16;

  // 2. Hip -> Knee -> Ankle -> Foot/Boot kinematics
  const hipX = leftX + targetWidth * profile.hipRx;
  const hipY = topY + targetHeight * profile.hipRy;

  const kickRatio = clamp01(Math.abs(pose.kickLegAngleDeg) / 76);
  const legPitchDeg =
    pose.strikeVariant === 2
      ? -34
      : pose.strikeVariant === 1
      ? -25
      : -18;
  const thighAngleDeg = 85 * (1 - kickRatio) + (legPitchDeg - 8) * kickRatio;
  const shinAngleDeg = 88 * (1 - kickRatio) + legPitchDeg * kickRatio;

  const thighRad = (thighAngleDeg * Math.PI) / 180;
  const shinRad = (shinAngleDeg * Math.PI) / 180;

  const thighLen = 54 + kickRatio * 14;
  const shinLen = 58 + kickRatio * 22;

  const kneeX = hipX + Math.cos(thighRad) * thighLen;
  const kneeY = hipY + Math.sin(thighRad) * thighLen;

  const ankleX = kneeX + Math.cos(shinRad) * shinLen;
  const ankleY = kneeY + Math.sin(shinRad) * shinLen;

  const footTipX = ankleX + Math.cos(shinRad - 0.15) * 34;
  const footTipY = ankleY + Math.sin(shinRad - 0.15) * 34;

  return {
    shoulder: { x: shoulderX, y: shoulderY },
    elbow: { x: elbowX, y: elbowY },
    wrist: { x: wristX, y: wristY },
    fistCenter: { x: fistCenterX, y: fistCenterY },
    hip: { x: hipX, y: hipY },
    knee: { x: kneeX, y: kneeY },
    ankle: { x: ankleX, y: ankleY },
    footTip: { x: footTipX, y: footTipY },
  };
}

interface CharacterBounds {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Computes the non-transparent pixel bounding box of an image so anatomical
 * pivots align accurately regardless of transparent padding around the sprite.
 */
function detectCharacterBounds(
  img: HTMLImageElement | HTMLCanvasElement
): CharacterBounds {
  const w = img.width || 512;
  const h = img.height || 768;
  try {
    const temp = document.createElement('canvas');
    const scale = Math.min(1, 256 / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    temp.width = tw;
    temp.height = th;
    const ctx = temp.getContext('2d');
    if (!ctx) return { sx: 0, sy: 0, sw: w, sh: h };
    ctx.drawImage(img, 0, 0, tw, th);
    const data = ctx.getImageData(0, 0, tw, th).data;

    let minX = tw;
    let maxX = 0;
    let minY = th;
    let maxY = 0;
    let found = false;

    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const a = data[(y * tw + x) * 4 + 3];
        if (a > 24) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          found = true;
        }
      }
    }

    if (!found) return { sx: 0, sy: 0, sw: w, sh: h };
    return {
      sx: Math.max(0, Math.floor(minX / scale)),
      sy: Math.max(0, Math.floor(minY / scale)),
      sw: Math.min(w, Math.ceil((maxX - minX + 1) / scale)),
      sh: Math.min(h, Math.ceil((maxY - minY + 1) / scale)),
    };
  } catch {
    return { sx: 0, sy: 0, sw: w, sh: h };
  }
}

/**
 * Renders an articulated 2D puppet of the fighter onto a dynamic Canvas
 * while preserving 100% of the character's original appearance and outfit.
 */
export class ArticulatedFighterPuppet {
  public fighterId: string;
  private sourceImg: HTMLImageElement | HTMLCanvasElement;
  private bounds: CharacterBounds;
  private profile: CharacterAnatomicalProfile;
  private orientedUpperArmCanvas: HTMLCanvasElement;
  private orientedForearmHandCanvas: HTMLCanvasElement;
  private orientedLegCanvas: HTMLCanvasElement;
  private supportLegCanvas: HTMLCanvasElement;
  private upperBodyCanvas: HTMLCanvasElement;

  constructor(
    sourceImg: HTMLImageElement | HTMLCanvasElement,
    fighterId = 'FIGHTER_001'
  ) {
    this.fighterId = fighterId;
    this.sourceImg = sourceImg;
    this.bounds = detectCharacterBounds(sourceImg);
    this.profile = getCharacterAnatomicalProfile(fighterId);
    this.upperBodyCanvas = this.extractRegionCanvas(0.0, 0.0, 1.0, 0.54, false);
    this.supportLegCanvas = this.extractRegionCanvas(0.0, 0.48, 0.53, 0.52, false);
    this.orientedUpperArmCanvas = this.extractOrientedLimbCanvas(
      this.profile.upperArmStrip,
      false
    );
    this.orientedForearmHandCanvas = this.extractOrientedLimbCanvas(
      this.profile.armStrip,
      this.profile.needsConstructedFistCap
    );
    this.orientedLegCanvas = this.extractOrientedLimbCanvas(
      this.profile.legStrip,
      false
    );
  }

  private extractRegionCanvas(
    rx: number,
    ry: number,
    rw: number,
    rh: number,
    roundedCapsule = false
  ): HTMLCanvasElement {
    const c = document.createElement('canvas');
    const sw = Math.max(1, Math.round(this.bounds.sw * rw));
    const sh = Math.max(1, Math.round(this.bounds.sh * rh));
    c.width = sw;
    c.height = sh;
    const ctx = c.getContext('2d');
    if (ctx) {
      if (roundedCapsule) {
        const r = Math.min(sw, sh) * 0.34;
        ctx.beginPath();
        ctx.roundRect(0, 0, sw, sh, r);
        ctx.clip();
      }
      const sx = this.bounds.sx + Math.round(this.bounds.sw * rx);
      const sy = this.bounds.sy + Math.round(this.bounds.sh * ry);
      ctx.drawImage(this.sourceImg, sx, sy, sw, sh, 0, 0, sw, sh);
    }
    return c;
  }

  /**
   * Extracts an oriented capsule strip directly from `sourceImg` along the vector
   * from proximal joint `(p0Rx, p0Ry)` to exact distal tip `(p1Rx, p1Ry)`.
   * In the resulting canvas:
   * - Left end `(0, height/2)` is the proximal joint (shoulder/elbow or hip).
   * - Right end `(width, height/2)` is the character's ACTUAL hand/fist or boot/foot!
   */
  private extractOrientedLimbCanvas(
    cfg: OrientedLimbStripConfig,
    addConstructedFistCap = false
  ): HTMLCanvasElement {
    const x0 = this.bounds.sx + this.bounds.sw * cfg.p0Rx;
    const y0 = this.bounds.sy + this.bounds.sh * cfg.p0Ry;
    const x1 = this.bounds.sx + this.bounds.sw * cfg.p1Rx;
    const y1 = this.bounds.sy + this.bounds.sh * cfg.p1Ry;

    const dx = x1 - x0;
    const dy = y1 - y0;
    const segLen = Math.max(16, Math.hypot(dx, dy));
    const segAngle = Math.atan2(dy, dx);
    const segThick = Math.max(
      20,
      Math.round(this.bounds.sw * cfg.thicknessRatio)
    );

    const padStart = Math.round(segThick * 0.16);
    const padEnd = addConstructedFistCap
      ? Math.round(segThick * 0.52)
      : Math.round(segThick * 0.04); // Stop right at the front knuckles (`p1`) so zero chest pixels are included!
    const c = document.createElement('canvas');
    c.width = Math.round(segLen + padStart + padEnd);
    c.height = segThick;

    const ctx = c.getContext('2d');
    if (!ctx) return c;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, c.width, c.height, segThick * 0.46);
    ctx.clip();

    ctx.save();
    ctx.translate(padStart, segThick * 0.5);
    if (cfg.flipY) {
      ctx.scale(1, -1);
    }
    ctx.rotate(-segAngle);
    ctx.drawImage(this.sourceImg, -x0, -y0);
    ctx.restore();

    // Key out any adjacent shirt/chest background pixels so ONLY the character's real arm & fist remain
    if (
      cfg.clearDarkBgAtTip ||
      cfg.clearWhiteShirtBg ||
      cfg.clearYellowChestBg
    ) {
      try {
        const imgData = ctx.getImageData(0, 0, c.width, c.height);
        const d = imgData.data;
        const startClearX = Math.floor(c.width * 0.45);
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            const idx = (y * c.width + x) * 4;
            const r = d[idx];
            const g = d[idx + 1];
            const b = d[idx + 2];

            if (cfg.clearDarkBgAtTip) {
              const isDarkShirt = r < 60 && g < 58 && b < 65;
              const isRedShirtLogo =
                x >= startClearX && r > 150 && g < 55 && b < 55;
              if ((x >= startClearX && isDarkShirt) || isRedShirtLogo) {
                d[idx + 3] = 0;
              }
            }

            if (cfg.clearWhiteShirtBg) {
              // Neutral white/grey t-shirt vs warm peach/brown skin tone (where r - b >= 28)
              const isNeutralWhiteShirt =
                r > 160 && g > 160 && b > 155 && r - b < 28;
              const isRedChestLogo = r > 170 && g < 70 && b < 70;
              if (isNeutralWhiteShirt || isRedChestLogo) {
                d[idx + 3] = 0;
              }
            }

            if (cfg.clearYellowChestBg) {
              // Bright yellow inner tee vs black bomber sleeve or warm skin fist (where b >= 85)
              const isBrightYellowTee = r > 175 && g > 145 && b < 75;
              if (isBrightYellowTee) {
                d[idx + 3] = 0;
              }
            }
          }
        }
        ctx.putImageData(imgData, 0, 0);
      } catch {
        // Fallback if canvas is tainted
      }
    }

    // For Girimon (whose hands are inside his jeans pockets in the standing photo),
    // cap the wrist end of his real bare forearm with a shaded fist in his exact skin tone.
    if (addConstructedFistCap) {
      const p = this.profile;
      const fistR = segThick * 0.36;
      const fx = padStart + segLen + fistR * 0.22;
      const fy = segThick * 0.5;

      ctx.fillStyle = p.skinTone;
      ctx.strokeStyle = '#0d1017';
      ctx.lineWidth = Math.max(2, segThick * 0.04);
      ctx.beginPath();
      ctx.roundRect(
        fx - fistR * 0.7,
        fy - fistR * 0.85,
        fistR * 1.45,
        fistR * 1.7,
        fistR * 0.4
      );
      ctx.fill();
      ctx.stroke();

      for (let i = 0; i < 4; i++) {
        const ky = fy - fistR * 0.72 + i * (fistR * 0.38);
        ctx.fillStyle = p.skinTone;
        ctx.beginPath();
        ctx.roundRect(
          fx + fistR * 0.1,
          ky,
          fistR * 0.62,
          fistR * 0.34,
          fistR * 0.15
        );
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.restore();
    return c;
  }

  /**
   * Draws the character's REAL extracted 2-segment arm (Upper Arm Sleeve + Forearm & Hand/Fist)
   * extending from the shoulder toward the opponent during PUNCH / SPECIAL.
   */
  private drawRealSpritePunchArm(
    ctx: CanvasRenderingContext2D,
    joints: ArticulatedLimbJoints,
    pose: FighterRigPose,
    _targetWidth: number,
    targetHeight: number,
    accentColor: string
  ): void {
    const p = this.profile;
    const { shoulder, elbow, wrist, fistCenter } = joints;
    const upperAngle = Math.atan2(elbow.y - shoulder.y, elbow.x - shoulder.x);
    const upperLen = Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y);
    const foreAngle = Math.atan2(
      fistCenter.y - elbow.y,
      fistCenter.x - elbow.x
    );
    const foreLen = Math.hypot(
      fistCenter.x - elbow.x,
      fistCenter.y - elbow.y
    );

    const upperThickPx = Math.max(28, targetHeight * 0.105 * pose.punchArmScale);
    const foreThickPx = Math.max(30, targetHeight * 0.112 * pose.punchArmScale);

    ctx.save();

    // 1. SEGMENT 1: Real Extracted Upper Arm Sleeve (Shoulder -> Elbow)
    ctx.save();
    ctx.translate(shoulder.x, shoulder.y);
    ctx.rotate(upperAngle);

    ctx.fillStyle = p.sleevePrimary;
    ctx.beginPath();
    ctx.arc(0, 0, upperThickPx * 0.42, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(
      this.orientedUpperArmCanvas,
      -upperThickPx * 0.18,
      -upperThickPx * 0.5,
      upperLen + upperThickPx * 0.36,
      upperThickPx
    );
    ctx.restore();

    // 3. SEGMENT 2: Real Extracted Forearm + Hand/Fist (Elbow -> Fist Knuckles!)
    ctx.save();
    ctx.translate(elbow.x, elbow.y);
    ctx.rotate(foreAngle);

    ctx.drawImage(
      this.orientedForearmHandCanvas,
      -foreThickPx * 0.22,
      -foreThickPx * 0.5,
      foreLen + foreThickPx * 0.26,
      foreThickPx
    );

    // 4. Focused kinetic impact crescent right in front of the striking knuckles
    if (pose.punchArmExtendPx > 28) {
      const tipX = foreLen + foreThickPx * 0.12;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(tipX, 0, 17, -Math.PI * 0.4, Math.PI * 0.4);
      ctx.stroke();

      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(tipX + 5, 0, 22, -Math.PI * 0.34, Math.PI * 0.34);
      ctx.stroke();
    }

    ctx.restore();
    ctx.restore();
  }

  /**
   * Draws the character's REAL extracted leg & sneaker/boot/foot swinging upward
   * from the hip joint to strike the opponent during KICK / SPECIAL.
   */
  private drawRealSpriteKickLeg(
    ctx: CanvasRenderingContext2D,
    joints: ArticulatedLimbJoints,
    pose: FighterRigPose,
    targetWidth: number,
    _targetHeight: number,
    accentColor: string
  ): void {
    const { hip, footTip } = joints;
    const legAngle = Math.atan2(footTip.y - hip.y, footTip.x - hip.x);
    const legReachPx = Math.hypot(footTip.x - hip.x, footTip.y - hip.y) * 1.08;
    const legThickPx = Math.max(48, targetWidth * 0.34);

    ctx.save();
    ctx.translate(hip.x - 6, hip.y + 4);
    ctx.rotate(legAngle);

    if (pose.isKickActive && Math.abs(pose.kickLegAngleDeg) > 25) {
      ctx.save();
      ctx.globalAlpha = 0.24;
      ctx.rotate(0.18);
      ctx.drawImage(
        this.orientedLegCanvas,
        -legThickPx * 0.18,
        -legThickPx * 0.5,
        legReachPx,
        legThickPx
      );
      ctx.restore();
    }

    ctx.drawImage(
      this.orientedLegCanvas,
      -legThickPx * 0.18,
      -legThickPx * 0.5,
      legReachPx,
      legThickPx
    );

    if (pose.isKickActive && Math.abs(pose.kickLegAngleDeg) > 25) {
      const bootTipX = legReachPx - legThickPx * 0.08;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(bootTipX, 0, 22, -Math.PI * 0.42, Math.PI * 0.42);
      ctx.stroke();

      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(bootTipX + 5, 0, 28, -Math.PI * 0.36, Math.PI * 0.36);
      ctx.stroke();
    }

    ctx.restore();
  }

  public renderPose(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    pose: FighterRigPose,
    accentColor: string,
    _secondaryColor?: string
  ): void {
    // Clear previous frame canvas pixels to prevent image accumulation/ghosting
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Body dimensions scaled naturally to original compact arcade fighter scale
    const bodyHeight = Math.min(canvasHeight * 0.64, 295);
    const aspect = (this.bounds.sw || 1) / (this.bounds.sh || 1);
    const bodyWidth = Math.max(120, bodyHeight * aspect);

    const baseCenterX = canvasWidth * 0.44 + pose.bodyOffsetX;
    const groundY = canvasHeight - 32 + pose.bodyOffsetY;
    const topY = groundY - bodyHeight;
    const leftX = baseCenterX - bodyWidth / 2;

    const joints = computeArticulatedLimbJoints(
      pose,
      this.profile,
      canvasWidth,
      canvasHeight,
      bodyWidth,
      bodyHeight
    );

    ctx.save();

    // Pivot transform at the character's feet base so all torso leans and crouching scale smoothly
    ctx.translate(baseCenterX, groundY);
    if (pose.headNodDeg !== 0) {
      ctx.rotate(((pose.torsoLeanDeg + pose.headNodDeg * 0.3) * Math.PI) / 180);
    } else {
      ctx.rotate((pose.torsoLeanDeg * Math.PI) / 180);
    }
    ctx.scale(pose.torsoScaleX, pose.torsoScaleY);
    ctx.translate(-baseCenterX, -groundY);

    // 1. Draw pristine full photo character sprite
    ctx.drawImage(
      this.sourceImg,
      this.bounds.sx,
      this.bounds.sy,
      this.bounds.sw,
      this.bounds.sh,
      leftX,
      topY,
      bodyWidth,
      bodyHeight
    );

    // 2. Lead Hand Punch extension overlay
    if (pose.isPunchActive || pose.punchArmExtendPx > 4) {
      this.drawRealSpritePunchArm(
        ctx,
        joints,
        pose,
        bodyWidth,
        bodyHeight,
        accentColor
      );
    }

    // 3. Lead Leg Kick extension overlay
    if (pose.isKickActive || Math.abs(pose.kickLegAngleDeg) > 12) {
      this.drawRealSpriteKickLeg(
        ctx,
        joints,
        pose,
        bodyWidth,
        bodyHeight,
        accentColor
      );
    }

    ctx.restore();
  }
}

export function extractCombatPoseFromState(
  state: CombatantRuntimeState,
  timeMs: number
): FighterRigPose {
  return computeFighterRigPose(
    state.action,
    state.actionTimerMs,
    state.actionDurationMs,
    state.comboCount,
    timeMs,
    state.isAI
  );
}
