const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const CANVAS_W = 512;
const CANVAS_H = 640;
const BASELINE_Y = 599; // Ground contact line for feet
const TARGET_STANDING_H = 490; // All 9 characters normalized to exact same standing height (490px)

function scaleImage(src, targetW, targetH) {
  const dst = new PNG({ width: targetW, height: targetH });
  for (let dy = 0; dy < targetH; dy++) {
    const sy = (dy / targetH) * src.height;
    const y0 = Math.floor(sy);
    const y1 = Math.min(src.height - 1, y0 + 1);
    const fy = sy - y0;
    for (let dx = 0; dx < targetW; dx++) {
      const sx = (dx / targetW) * src.width;
      const x0 = Math.floor(sx);
      const x1 = Math.min(src.width - 1, x0 + 1);
      const fx = sx - x0;

      const i00 = (y0 * src.width + x0) * 4;
      const i10 = (y0 * src.width + x1) * 4;
      const i01 = (y1 * src.width + x0) * 4;
      const i11 = (y1 * src.width + x1) * 4;

      const didx = (dy * targetW + dx) * 4;
      for (let c = 0; c < 4; c++) {
        const top = src.data[i00 + c] * (1 - fx) + src.data[i10 + c] * fx;
        const bot = src.data[i01 + c] * (1 - fx) + src.data[i11 + c] * fx;
        dst.data[didx + c] = Math.round(top * (1 - fy) + bot * fy);
      }
    }
  }
  return dst;
}

function smoothEdges(png) {
  const w = png.width, h = png.height;
  const alphas = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    alphas[i] = png.data[i * 4 + 3];
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const a = alphas[idx];
      if (a > 30) {
        const minN = Math.min(alphas[idx - 1], alphas[idx + 1], alphas[idx - w], alphas[idx + w]);
        if (minN < 10) {
          png.data[idx * 4 + 3] = Math.min(a, 215);
        }
      }
    }
  }
}

function getTightBBox(src, mask, bx0, by0, bw, bh) {
  let minX = 9999, maxX = -1, minY = 9999, maxY = -1;
  const w = src.width;
  for (let y = by0; y < by0 + bh; y++) {
    for (let x = bx0; x < bx0 + bw; x++) {
      const idx = (y * w + x) * 4;
      let isSolid = false;
      if (mask) {
        const isGreen = (mask.data[idx] === 0 && mask.data[idx+1] === 215 && mask.data[idx+2] === 65);
        if (!isGreen) isSolid = true;
      } else {
        if (src.data[idx + 3] > 30) isSolid = true;
      }
      if (isSolid) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function cropPNG(src, bbox, mask) {
  const cropped = new PNG({ width: bbox.w, height: bbox.h });
  for (let y = 0; y < bbox.h; y++) {
    for (let x = 0; x < bbox.w; x++) {
      const srcX = bbox.minX + x;
      const srcY = bbox.minY + y;
      const srcIdx = (srcY * src.width + srcX) * 4;
      const cIdx = (y * bbox.w + x) * 4;
      let isBg = false;
      if (mask) {
        if (mask.data[srcIdx] === 0 && mask.data[srcIdx+1] === 215 && mask.data[srcIdx+2] === 65) {
          isBg = true;
        }
      } else {
        if (src.data[srcIdx + 3] <= 25) isBg = true;
      }

      if (!isBg) {
        cropped.data[cIdx] = src.data[srcIdx];
        cropped.data[cIdx + 1] = src.data[srcIdx + 1];
        cropped.data[cIdx + 2] = src.data[srcIdx + 2];
        cropped.data[cIdx + 3] = mask ? 255 : src.data[srcIdx + 3];
      } else {
        cropped.data[cIdx + 3] = 0;
      }
    }
  }
  return cropped;
}

function cropStandalonePNG(srcPath) {
  const src = PNG.sync.read(fs.readFileSync(srcPath));
  let minX = 9999, maxX = -1, minY = 9999, maxY = -1;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const idx = (y * src.width + x) * 4;
      if (src.data[idx + 3] > 30) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const cropped = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sidx = ((minY + y) * src.width + (minX + x)) * 4;
      const didx = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        cropped.data[didx + c] = src.data[sidx + c];
      }
    }
  }
  return cropped;
}

const FIGHTERS = [
  {
    id: 'FIGHTER_001',
    name: 'NARESH',
    sheetPath: 'public/assets/aistudio/naresh_update_81f43602.png',
    maskPath: null,
    idleCleanPath: 'public/assets/squadron-showdown/characters/naresh_clean.png',
    standingCut: [20, 8, 400, 502],
    cuts: {
      punch: [20, 8, 400, 502],
      kick: [395, 8, 390, 502],
      jump: [780, 8, 385, 430],
      block: [1135, 8, 385, 502],
      special: [40, 512, 470, 508],
      victory: [580, 512, 450, 508],
      defeat: [1060, 580, 440, 440]
    }
  },
  {
    id: 'FIGHTER_002',
    name: 'DHEERAJ',
    sheetPath: 'public/assets/aistudio/dheeraj_update_ae724c0c.png',
    maskPath: '/tmp/dheeraj_v4.png',
    idleCleanPath: 'public/assets/aistudio/dheeraj_b0cdc76b.png',
    standingCut: [10, 20, 380, 490],
    cuts: {
      punch: [10, 20, 380, 490],
      kick: [390, 20, 380, 490],
      jump: [770, 10, 390, 490],
      block: [1130, 20, 380, 490],
      special: [10, 512, 515, 490],
      victory: [525, 512, 550, 490],
      defeat: [1120, 560, 380, 450]
    }
  },
  {
    id: 'FIGHTER_003',
    name: 'VIJAY',
    sheetPath: 'public/assets/aistudio/vijay_update_1ca23367.png',
    maskPath: '/tmp/vijay_v4.png',
    idleCleanPath: 'public/assets/aistudio/vijay_e1402ef4.png',
    standingCut: [10, 15, 380, 495],
    cuts: {
      punch: [10, 15, 380, 495],
      kick: [385, 15, 385, 495],
      jump: [770, 10, 390, 495],
      block: [1130, 15, 385, 495],
      special: [10, 512, 515, 495],
      victory: [525, 512, 550, 495],
      defeat: [1120, 560, 385, 450]
    }
  },
  {
    id: 'FIGHTER_004',
    name: 'ABHIYAN',
    sheetPath: 'public/assets/aistudio/abhiyan_update_e234cbce.png',
    maskPath: '/tmp/abhiyan_v4.png',
    idleCleanPath: 'public/assets/aistudio/anhiyan_9b0cd04d.png',
    standingCut: [10, 15, 385, 495],
    cuts: {
      punch: [10, 15, 385, 495],
      kick: [395, 15, 385, 495],
      jump: [770, 10, 395, 495],
      block: [1130, 15, 385, 495],
      special: [10, 512, 515, 495],
      victory: [525, 512, 550, 495],
      defeat: [1120, 560, 385, 450]
    }
  },
  {
    id: 'FIGHTER_005',
    name: 'LEXI',
    sheetPath: 'public/assets/aistudio/lexi_update_f409e1de.png',
    maskPath: '/tmp/lexi_v4.png',
    idleCleanPath: 'public/assets/squadron-showdown/characters/lexi_clean.png',
    standingCut: [10, 15, 385, 495],
    cuts: {
      punch: [10, 15, 385, 495],
      kick: [395, 15, 385, 495],
      jump: [770, 10, 395, 495],
      block: [1130, 15, 385, 495],
      special: [10, 512, 515, 495],
      victory: [525, 512, 550, 495],
      defeat: [1120, 560, 385, 450]
    }
  },
  {
    id: 'FIGHTER_006',
    name: 'PENGUIN_BHAI',
    sheetPath: 'public/assets/aistudio/penguin_bhai_update_002f4f2f.png',
    maskPath: null,
    idleCleanPath: 'public/assets/squadron-showdown/characters/penguin_bhai_clean.png',
    standingCut: [20, 20, 360, 480],
    cuts: {
      punch: [20, 20, 360, 480],
      kick: [380, 20, 380, 480],
      jump: [760, 10, 390, 450],
      block: [1160, 20, 360, 480],
      special: [20, 512, 500, 490],
      victory: [520, 512, 480, 490],
      defeat: [1100, 560, 420, 450]
    }
  },
  {
    id: 'FIGHTER_007',
    name: 'GIRIMON',
    sheetPath: 'public/assets/aistudio/girimon_update_92116691.png',
    maskPath: '/tmp/girimon_v4.png',
    idleCleanPath: 'public/assets/squadron-showdown/characters/girimon_clean.png',
    standingCut: [10, 15, 385, 495],
    cuts: {
      punch: [10, 15, 385, 495],
      kick: [390, 15, 385, 495],
      jump: [770, 10, 395, 495],
      block: [1130, 15, 385, 495],
      special: [0, 512, 530, 508],
      victory: [530, 512, 550, 508],
      defeat: [1120, 560, 390, 450]
    }
  },
  {
    id: 'FIGHTER_008',
    name: 'DQ',
    sheetPath: 'public/assets/aistudio/dq_update_be0b114c.png',
    maskPath: null,
    idleCleanPath: 'public/assets/squadron-showdown/characters/dq_sprite.png',
    standingCut: [0, 0, 512, 384],
    cuts: {
      punch: [0, 0, 512, 384],
      kick: [512, 0, 512, 384],
      jump: [0, 384, 512, 384],
      block: [512, 384, 512, 384],
      special: [0, 768, 512, 384],
      victory: [512, 768, 512, 384],
      defeat: [0, 1152, 1024, 384]
    }
  },
  {
    id: 'FIGHTER_009',
    name: 'LIVIN_CHETTAN',
    sheetPath: 'public/assets/aistudio/livin_chettan_update_5fd782a6.png',
    maskPath: '/tmp/livin_test2.png',
    idleCleanPath: null,
    standingCut: [0, 55, 340, 395],
    cuts: {
      idle: [0, 55, 340, 395],
      punch: [340, 55, 400, 395],
      kick: [740, 55, 400, 395],
      jump: [1140, 55, 396, 395],
      block: [0, 485, 360, 447],
      special: [360, 485, 420, 447],
      victory: [780, 485, 360, 447],
      defeat: [1140, 560, 396, 372]
    }
  }
];

for (const fighter of FIGHTERS) {
  console.log('Processing fighter:', fighter.id, fighter.name);
  const outDir = path.join('public/assets/squadron-showdown/sprites', fighter.id);
  fs.mkdirSync(outDir, { recursive: true });

  const sheet = PNG.sync.read(fs.readFileSync(fighter.sheetPath));
  const mask = fighter.maskPath ? PNG.sync.read(fs.readFileSync(fighter.maskPath)) : null;

  // Compute reference standing height from action sheet
  const standingBBox = getTightBBox(sheet, mask, fighter.standingCut[0], fighter.standingCut[1], fighter.standingCut[2], fighter.standingCut[3]);
  const sheetStandingH = standingBBox.h;
  const actionScale = TARGET_STANDING_H / sheetStandingH;

  console.log(`  -> Sheet standing H = ${sheetStandingH}px. Action scale factor = ${actionScale.toFixed(4)}`);

  // 1. Process IDLE
  let idleCropped;
  if (fighter.idleCleanPath) {
    idleCropped = cropStandalonePNG(fighter.idleCleanPath);
  } else {
    const bbox = getTightBBox(sheet, mask, fighter.cuts.idle[0], fighter.cuts.idle[1], fighter.cuts.idle[2], fighter.cuts.idle[3]);
    idleCropped = cropPNG(sheet, bbox, mask);
  }

  const idleScale = TARGET_STANDING_H / idleCropped.height;
  const idleScaledW = Math.round(idleCropped.width * idleScale);
  const idleScaledH = Math.round(idleCropped.height * idleScale);
  const idleScaled = scaleImage(idleCropped, idleScaledW, idleScaledH);

  const idleCanvas = new PNG({ width: CANVAS_W, height: CANVAS_H });
  idleCanvas.data.fill(0);
  const idleDestX = Math.round((CANVAS_W - idleScaledW) / 2);
  const idleDestY = BASELINE_Y - idleScaledH;

  for (let y = 0; y < idleScaledH; y++) {
    for (let x = 0; x < idleScaledW; x++) {
      const sidx = (y * idleScaledW + x) * 4;
      const tx = idleDestX + x;
      const ty = idleDestY + y;
      if (tx >= 0 && tx < CANVAS_W && ty >= 0 && ty < CANVAS_H) {
        const tidx = (ty * CANVAS_W + tx) * 4;
        for (let c = 0; c < 4; c++) idleCanvas.data[tidx + c] = idleScaled.data[sidx + c];
      }
    }
  }
  smoothEdges(idleCanvas);
  fs.writeFileSync(path.join(outDir, 'idle.png'), PNG.sync.write(idleCanvas));
  console.log(`  -> idle.png written (charH = ${idleScaledH}px)`);

  // 2. Process all action poses using actionScale so action poses match 490px standing height
  for (const [pose, [bx0, by0, bw, bh]] of Object.entries(fighter.cuts)) {
    if (pose === 'idle') continue;

    const bbox = getTightBBox(sheet, mask, bx0, by0, bw, bh);
    const cropped = cropPNG(sheet, bbox, mask);

    const scaledW = Math.max(1, Math.round(cropped.width * actionScale));
    const scaledH = Math.max(1, Math.round(cropped.height * actionScale));
    const scaled = scaleImage(cropped, scaledW, scaledH);

    const poseCanvas = new PNG({ width: CANVAS_W, height: CANVAS_H });
    poseCanvas.data.fill(0);

    const destX = Math.round((CANVAS_W - scaledW) / 2);
    let destY;

    if (pose === 'jump') {
      destY = BASELINE_Y - scaledH - 85;
    } else {
      destY = BASELINE_Y - scaledH;
    }

    for (let y = 0; y < scaledH; y++) {
      for (let x = 0; x < scaledW; x++) {
        const sidx = (y * scaledW + x) * 4;
        const tx = destX + x;
        const ty = destY + y;
        if (tx >= 0 && tx < CANVAS_W && ty >= 0 && ty < CANVAS_H) {
          const tidx = (ty * CANVAS_W + tx) * 4;
          for (let c = 0; c < 4; c++) poseCanvas.data[tidx + c] = scaled.data[sidx + c];
        }
      }
    }

    smoothEdges(poseCanvas);
    fs.writeFileSync(path.join(outDir, pose + '.png'), PNG.sync.write(poseCanvas));
    console.log(`  -> ${pose}.png written (charH = ${scaledH}px, scale = ${actionScale.toFixed(4)})`);
  }
}

console.log('\nALL 9 FIGHTERS ACTION POSES NORMALIZED TO MATCH 490px STANDING HEIGHT SUCCESSFULLY!');
