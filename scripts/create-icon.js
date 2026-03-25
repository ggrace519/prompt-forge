#!/usr/bin/env node
/**
 * create-icon.js
 *
 * Generates a minimal 16x16 PNG tray icon (solid accent-purple #7c6af7).
 * Runs automatically via `postinstall` — uses only built-in Node.js modules,
 * so it works even before dependencies are installed.
 *
 * Replace assets/tray-icon.png with a real design when you're ready.
 */

'use strict';

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── CRC-32 ────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ── PNG chunk builder ─────────────────────────────────────────────────────────

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf    = Buffer.alloc(4);
  const crcBuf    = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

// ── PNG constructor ───────────────────────────────────────────────────────────

function makeSolidPNG(width, height, r, g, b) {
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,  0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8]  = 8; // 8 bits per channel
  ihdr[9]  = 2; // colour type: RGB truecolour
  // compression method, filter method, interlace method — all 0

  // Raw scanline data: filter byte (0 = None) + RGB pixels
  const stride = 1 + width * 3;
  const raw    = Buffer.alloc(height * stride, 0);
  for (let y = 0; y < height; y++) {
    const base = y * stride;
    // raw[base] = 0  (filter None, already zeroed)
    for (let x = 0; x < width; x++) {
      raw[base + 1 + x * 3]     = r;
      raw[base + 1 + x * 3 + 1] = g;
      raw[base + 1 + x * 3 + 2] = b;
    }
  }

  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const dest = path.resolve(__dirname, '..', 'assets', 'tray-icon.png');
fs.mkdirSync(path.dirname(dest), { recursive: true });

if (fs.existsSync(dest)) {
  console.log('[PromptForge] assets/tray-icon.png already exists — skipping icon generation.');
} else {
  // Accent purple: #7c6af7 → RGB(124, 106, 247)
  const png = makeSolidPNG(16, 16, 124, 106, 247);
  fs.writeFileSync(dest, png);
  console.log('[PromptForge] Generated placeholder tray icon → assets/tray-icon.png');
  console.log('             Replace with a real icon when you are ready.');
}
