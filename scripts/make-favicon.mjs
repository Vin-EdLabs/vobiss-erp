import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, '..', 'public');
const SRC = process.argv[2];

if (!SRC) {
  console.error('Usage: node scripts/make-favicon.mjs <source-png>');
  process.exit(1);
}

function toIco(png32, png16) {
  // Minimal ICO with two PNG images (Vista+ / all modern browsers).
  const images = [png16, png32];
  const count = images.length;
  const headerSize = 6 + 16 * count;
  let offset = headerSize;
  const entries = [];
  for (const buf of images) {
    const size = buf.length;
    entries.push({ buf, offset, size });
    offset += size;
  }
  const out = Buffer.alloc(offset);
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(count, 4);
  entries.forEach((e, i) => {
    const p = 6 + i * 16;
    const dim = i === 0 ? 16 : 32;
    out[p] = dim;
    out[p + 1] = dim;
    out[p + 2] = 0;
    out[p + 3] = 0;
    out.writeUInt16LE(1, p + 4);
    out.writeUInt16LE(32, p + 6);
    out.writeUInt32LE(e.size, p + 8);
    out.writeUInt32LE(e.offset, p + 12);
    e.buf.copy(out, e.offset);
  });
  return out;
}

const meta = await sharp(SRC).metadata();
console.log('source', meta.width, 'x', meta.height, meta.format);

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width;
const h = info.height;

let blueMinX = w;
let blueMaxX = 0;
let blueMinY = h;
let blueMaxY = 0;
let blueCount = 0;
let redLeftMinX = w;
let redLeftMaxX = 0;

for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 20) continue;
    // Blue/cyan stripes of the emblem
    if (b > 70 && b >= r + 15 && g > 30) {
      blueCount++;
      if (x < blueMinX) blueMinX = x;
      if (x > blueMaxX) blueMaxX = x;
      if (y < blueMinY) blueMinY = y;
      if (y > blueMaxY) blueMaxY = y;
    }
    // Red pixels on the left half (pixel squares, not "Solutions")
    if (x < w * 0.55 && r > 140 && r > g + 40 && r > b + 40) {
      if (x < redLeftMinX) redLeftMinX = x;
      if (x > redLeftMaxX) redLeftMaxX = x;
    }
  }
}

console.log({ blueCount, blueMinX, blueMinY, blueMaxX, blueMaxY, redLeftMinX, redLeftMaxX });

if (blueCount < 50) {
  throw new Error('Could not find the circular emblem in the source image');
}

const circleW = blueMaxX - blueMinX;
const circleH = blueMaxY - blueMinY;
const pad = Math.round(Math.max(circleW, circleH) * 0.12);
const left = Math.max(0, Math.min(blueMinX, redLeftMinX) - pad);
const top = Math.max(0, blueMinY - pad);
const right = Math.min(w, blueMaxX + pad);
const bottom = Math.min(h, blueMaxY + pad);
let cropW = right - left;
let cropH = bottom - top;
const side = Math.max(cropW, cropH);
const cx = left + cropW / 2;
const cy = top + cropH / 2;
let sqLeft = Math.round(cx - side / 2);
let sqTop = Math.round(cy - side / 2);
sqLeft = Math.max(0, Math.min(sqLeft, w - side));
sqTop = Math.max(0, Math.min(sqTop, h - side));
const extractW = Math.min(side, w - sqLeft);
const extractH = Math.min(side, h - sqTop);

console.log('crop', { sqLeft, sqTop, extractW, extractH });

const emblem = await sharp(SRC)
  .extract({ left: sqLeft, top: sqTop, width: extractW, height: extractH })
  .resize(512, 512, { fit: 'cover' })
  .png()
  .toBuffer();

async function writePng(size, name, innerFraction = 1) {
  const inner = Math.round(size * innerFraction);
  const logo = await sharp(emblem)
    .resize(inner, inner, { fit: 'cover' })
    .png()
    .toBuffer();
  const out = path.join(PUBLIC, name);
  if (inner === size) {
    await sharp(logo).toFile(out);
  } else {
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .composite([{ input: logo, gravity: 'center' }])
      .png({ compressionLevel: 9 })
      .toFile(out);
  }
  console.log('wrote', name, `${size}x${size}`);
}

await writePng(32, 'favicon-32.png');
await writePng(16, 'favicon-16.png');
await writePng(48, 'favicon.png');
await writePng(180, 'apple-touch-icon.png');
await writePng(192, 'vobiss-logo-192.png');
await writePng(512, 'vobiss-logo-512.png');
await writePng(192, 'pwa-192.png');
await writePng(512, 'pwa-512.png');
await writePng(512, 'vobiss-logo-maskable.png', 0.72);
await writePng(192, 'pwa-192-maskable.png', 0.72);
await writePng(512, 'pwa-512-maskable.png', 0.72);

const png16 = await sharp(emblem).resize(16, 16, { fit: 'cover' }).png().toBuffer();
const png32 = await sharp(emblem).resize(32, 32, { fit: 'cover' }).png().toBuffer();
await fs.promises.writeFile(path.join(PUBLIC, 'favicon.ico'), toIco(png32, png16));
console.log('wrote favicon.ico');
console.log('Done.');
