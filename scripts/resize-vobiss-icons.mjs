// Pads the existing public/vobiss-logo.png onto proper PWA-sized squares.
// Run: node scripts/resize-vobiss-icons.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, '..', 'public');
const SRC = path.join(PUBLIC, 'vobiss-logo.png');

async function padToSquare(size, outName, { bg, innerFraction = 0.78 } = {}) {
  const inner = Math.round(size * innerFraction);
  const logo = await sharp(SRC)
    .resize({ width: inner, height: inner, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bg,
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC, outName));
  console.log(' ✓', outName, `${size}x${size}`);
}

async function main() {
  await fs.access(SRC);
  console.log('Padding', SRC, 'into proper PWA icon sizes...');
  const white = { r: 255, g: 255, b: 255, alpha: 1 };
  const slate = { r: 15, g: 23, b: 42, alpha: 1 };

  await padToSquare(192, 'vobiss-logo-192.png', { bg: white, innerFraction: 0.78 });
  await padToSquare(512, 'vobiss-logo-512.png', { bg: white, innerFraction: 0.78 });
  await padToSquare(180, 'apple-touch-icon.png', { bg: white, innerFraction: 0.82 });
  // Maskable icons need a generous safe zone (~60-70% of canvas).
  await padToSquare(512, 'vobiss-logo-maskable.png', { bg: slate, innerFraction: 0.6 });
  console.log('Done.');
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
