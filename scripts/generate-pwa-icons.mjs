#!/usr/bin/env node
// Zero-dep PWA icon generator.
//
// Emits all the PNG variants the manifest + apple-touch + favicon + splash
// chain needs, using only Node built-ins (`zlib` for DEFLATE, `Buffer` for
// chunk assembly, a hand-rolled CRC32 table). Same posture as D-032 (in-house
// OOXML + STORED zip writer) — keep the dep tree tight, keep the output
// byte-deterministic, keep the attack surface small.
//
// Design: a solid accent-color square with a centered white disc. Trivially
// legible at 16×16 favicon scale, safe inside Android's 80% maskable safe
// zone, and acceptable as an iOS launch image. When the brand ships a real
// wordmark, re-author this script — every consumer reads from disk, nothing
// is computed at runtime.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'public', 'icons');

const ACCENT = [0x4f, 0x46, 0xe5]; // --color-accent (Indigo-600)
const WHITE = [0xff, 0xff, 0xff];

// --- CRC32 (IEEE 802.3, polynomial 0xEDB88320) ----------------------------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// --- PNG chunk + encoder --------------------------------------------------
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression (deflate)
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace (none)

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter 0 (None) per scanline
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- drawing --------------------------------------------------------------
// Renders accent-colored square with a centered white circle. `scale` is the
// disc diameter as a fraction of canvas size. 0.6 for regular icons; 0.48 for
// maskable (fits inside Android's 80% safe zone: 0.48 / 0.8 = 0.6 effective).
function renderIconBuffer(size, { scale = 0.6 } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const r = (size * scale) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      // 1-pixel antialias band at the circle edge.
      let t = 0;
      if (d <= r - 0.5) t = 1;
      else if (d < r + 0.5) t = r + 0.5 - d;
      const i = (y * size + x) * 4;
      buf[i] = Math.round(ACCENT[0] * (1 - t) + WHITE[0] * t);
      buf[i + 1] = Math.round(ACCENT[1] * (1 - t) + WHITE[1] * t);
      buf[i + 2] = Math.round(ACCENT[2] * (1 - t) + WHITE[2] * t);
      buf[i + 3] = 0xff;
    }
  }
  return buf;
}

function renderSplashBuffer(width, height) {
  const buf = Buffer.alloc(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      let t = 0;
      if (d <= r - 0.5) t = 1;
      else if (d < r + 0.5) t = r + 0.5 - d;
      const i = (y * width + x) * 4;
      buf[i] = Math.round(ACCENT[0] * (1 - t) + WHITE[0] * t);
      buf[i + 1] = Math.round(ACCENT[1] * (1 - t) + WHITE[1] * t);
      buf[i + 2] = Math.round(ACCENT[2] * (1 - t) + WHITE[2] * t);
      buf[i + 3] = 0xff;
    }
  }
  return buf;
}

// --- emit -----------------------------------------------------------------
mkdirSync(OUT, { recursive: true });

const writePng = (name, bytes) => {
  writeFileSync(join(OUT, name), bytes);
  process.stdout.write(`  ${name} (${bytes.length} bytes)\n`);
};

console.log('Emitting standard icons…');
for (const s of [72, 96, 128, 144, 152, 192, 384, 512]) {
  writePng(`icon-${s}.png`, encodePng(s, s, renderIconBuffer(s)));
}

console.log('Emitting maskable icon (80% safe zone)…');
writePng('icon-maskable-512.png', encodePng(512, 512, renderIconBuffer(512, { scale: 0.48 })));

console.log('Emitting apple-touch-icons…');
for (const s of [120, 152, 167, 180]) {
  writePng(`apple-touch-icon-${s}.png`, encodePng(s, s, renderIconBuffer(s)));
}

console.log('Emitting favicons…');
for (const s of [16, 32, 48]) {
  writePng(`favicon-${s}.png`, encodePng(s, s, renderIconBuffer(s)));
}

console.log('Emitting iPhone 14/15 Pro splash (1179×2556)…');
writePng('apple-splash-1179-2556.png', encodePng(1179, 2556, renderSplashBuffer(1179, 2556)));

console.log('Emitting SVG source…');
writeFileSync(
  join(OUT, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#4f46e5"/>
  <circle cx="256" cy="256" r="153.6" fill="#ffffff"/>
</svg>
`,
);

console.log('Done.');
