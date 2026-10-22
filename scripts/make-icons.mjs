// Generates the app icons as PNG + SVG with no dependencies (zlib only).
// Run: npm run icons
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [156, 47, 90]; // berry
const FG = [248, 236, 228]; // warm cream
const ACCENT = [240, 154, 132]; // coral

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const S = 4; // supersampling
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const c = pixel((x + (sx + 0.5) / S) / size, (y + (sy + 0.5) / S) / size);
          r += c[0]; g += c[1]; b += c[2];
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = Math.round(r / S / S);
      raw[o + 1] = Math.round(g / S / S);
      raw[o + 2] = Math.round(b / S / S);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Mark: a cream crescent (the moon that pulls the tide) above a coral wave line.
function mark(scale) {
  return (u, v) => {
    const x = (u - 0.5) / scale + 0.5;
    const y = (v - 0.5) / scale + 0.5;
    const inA = (x - 0.5) ** 2 + (y - 0.44) ** 2 < 0.27 ** 2;
    const inB = (x - 0.62) ** 2 + (y - 0.37) ** 2 < 0.23 ** 2;
    if (inA && !inB) return FG;
    const wave = 0.79 + 0.025 * Math.sin((x - 0.18) * Math.PI * 4);
    if (x > 0.2 && x < 0.8 && Math.abs(y - wave) < 0.024) return ACCENT;
    return BG;
  };
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, mark(1)));
writeFileSync('public/icons/icon-512.png', png(512, mark(1)));
writeFileSync('public/icons/apple-touch-icon.png', png(180, mark(1)));
writeFileSync('public/icons/icon-maskable-512.png', png(512, mark(0.78))); // inside the safe zone

const wavePts = Array.from({ length: 31 }, (_, i) => {
  const x = 0.2 + (0.6 * i) / 30;
  return `${(x * 100).toFixed(2)},${((0.79 + 0.025 * Math.sin((x - 0.18) * Math.PI * 4)) * 100).toFixed(2)}`;
}).join(' ');
writeFileSync(
  'public/icons/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><mask id="m"><rect width="100" height="100" fill="#fff"/><circle cx="62" cy="37" r="23" fill="#000"/></mask></defs>
  <rect width="100" height="100" rx="22" fill="rgb(${BG})"/>
  <circle cx="50" cy="44" r="27" fill="rgb(${FG})" mask="url(#m)"/>
  <polyline points="${wavePts}" fill="none" stroke="rgb(${ACCENT})" stroke-width="4.8" stroke-linecap="round"/>
</svg>
`,
);
console.log('icons written');
