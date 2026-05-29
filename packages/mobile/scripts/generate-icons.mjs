import { Jimp } from 'jimp';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, '../assets');

// Brand colours
const PLUM        = 0x1C1A2Eff;
const ORANGE      = 0xFF6B35ff;
const CORAL       = 0xFF9A6Cff;
const YELLOW      = 0xFFD166ff;
const WHITE       = 0xFFFFFFff;
const TRANSPARENT = 0x00000000;

function hexToRgba(hex) {
  return {
    r: (hex >>> 24) & 0xff,
    g: (hex >>> 16) & 0xff,
    b: (hex >>>  8) & 0xff,
    a: (hex       ) & 0xff,
  };
}

function toInt(c) {
  return ((c.r & 0xff) * 0x1000000) + ((c.g & 0xff) << 16) + ((c.b & 0xff) << 8) + (c.a & 0xff);
}

function blend(bg, fg, alpha) {
  const a = alpha / 255;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 255,
  };
}

// Draw a filled circle with soft edge
function drawCircle(img, cx, cy, r, colour, alpha = 255) {
  const fg = hexToRgba(colour);
  const r2 = r * r;
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const dx = x - cx, dy = y - cy;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > (r + 1) * (r + 1)) continue;
      const aa = Math.max(0, Math.min(255, Math.round((r + 0.5 - Math.sqrt(dist2)) * 255)));
      const effectiveAlpha = Math.round(aa * alpha / 255);
      if (effectiveAlpha === 0) continue;
      const bg = hexToRgba(img.getPixelColor(x, y));
      const blended = blend(bg, fg, effectiveAlpha);
      img.setPixelColor(toInt(blended), x, y);
    }
  }
}

// Draw a ring (annulus)
function drawRing(img, cx, cy, r, thickness, colour, alpha = 200) {
  const fg = hexToRgba(colour);
  const outer = r + thickness / 2;
  for (let y = Math.floor(cy - outer - 1); y <= cy + outer + 1; y++) {
    for (let x = Math.floor(cx - outer - 1); x <= cx + outer + 1; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const distFromRing = Math.abs(dist - r);
      if (distFromRing > thickness / 2 + 1) continue;
      const aa = Math.max(0, Math.min(255, Math.round((thickness / 2 + 0.5 - distFromRing) * 255)));
      const effectiveAlpha = Math.round(aa * alpha / 255);
      if (effectiveAlpha === 0) continue;
      const bg = hexToRgba(img.getPixelColor(x, y));
      const blended = blend(bg, fg, effectiveAlpha);
      img.setPixelColor(toInt(blended), x, y);
    }
  }
}

async function generateIcon(size, outputPath) {
  const img = new Jimp({ width: size, height: size, color: PLUM });
  const cx = size / 2, cy = size / 2;
  const scale = size / 1024;

  // Primary ring from centre
  drawRing(img, cx, cy, 280 * scale, 14 * scale, ORANGE, 180);

  // Three nodes (at 60°, 200°, 320° — offset for visual balance)
  const nodeRadius = 280 * scale;
  const nodes = [
    { angle: -50,  colour: YELLOW, r: 62 * scale },   // top right — Sun Yellow
    { angle: 70,   colour: ORANGE, r: 56 * scale },   // bottom right — Avail Orange
    { angle: 190,  colour: CORAL,  r: 50 * scale },   // bottom left — Soft Coral
  ];

  for (const node of nodes) {
    const rad = (node.angle * Math.PI) / 180;
    const nx = cx + Math.cos(rad) * nodeRadius;
    const ny = cy + Math.sin(rad) * nodeRadius;
    // Secondary ripple ring around each node
    drawRing(img, nx, ny, node.r * 1.9, 7 * scale, node.colour, 130);
    // Node dot
    drawCircle(img, nx, ny, node.r, node.colour, 255);
  }

  // Centre source dot — orange with yellow inner
  drawCircle(img, cx, cy, 72 * scale, ORANGE, 255);
  drawCircle(img, cx, cy, 36 * scale, YELLOW, 255);

  await img.write(outputPath);
  console.log(`Generated ${outputPath} (${size}x${size})`);
}

async function generateSplash(outputPath) {
  const w = 1284, h = 2778;
  const img = new Jimp({ width: w, height: h, color: PLUM });
  const cx = w / 2, cy = h / 2;
  const scale = 0.9;

  drawRing(img, cx, cy, 245 * scale, 12 * scale, ORANGE, 160);
  const nodes = [
    { angle: -50,  colour: YELLOW, r: 55 * scale },
    { angle: 70,   colour: ORANGE, r: 50 * scale },
    { angle: 190,  colour: CORAL,  r: 44 * scale },
  ];
  for (const node of nodes) {
    const rad = (node.angle * Math.PI) / 180;
    const nx = cx + Math.cos(rad) * (245 * scale);
    const ny = cy + Math.sin(rad) * (245 * scale);
    drawRing(img, nx, ny, node.r * 1.9, 6 * scale, node.colour, 120);
    drawCircle(img, nx, ny, node.r, node.colour, 255);
  }
  drawCircle(img, cx, cy, 63 * scale, ORANGE, 255);
  drawCircle(img, cx, cy, 32 * scale, YELLOW, 255);

  await img.write(outputPath);
  console.log(`Generated ${outputPath}`);
}

async function main() {
  await generateIcon(1024, `${assetsDir}/icon.png`);
  await generateIcon(1024, `${assetsDir}/adaptive-icon.png`);
  await generateIcon(96,   `${assetsDir}/notification-icon.png`);
  await generateSplash(`${assetsDir}/splash.png`);
  console.log('All assets generated.');
}

main().catch(console.error);
