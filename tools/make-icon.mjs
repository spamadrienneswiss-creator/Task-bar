// Draws the app icon and writes assets/icon.png (256) and assets/icon.ico (16-256, PNG entries).
// node tools/make-icon.mjs
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
import path from 'path';
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 256 256">
  <rect x="8" y="8" width="240" height="240" rx="52" fill="#10151C"/>
  <rect x="8" y="8" width="240" height="240" rx="52" fill="none" stroke="#2A3340" stroke-width="6"/>
  <path d="M128 52 L170 94 L128 136 L86 94 Z" fill="none" stroke="#F2A541" stroke-width="12" stroke-linejoin="round"/>
  <path d="M128 76 L146 94 L128 112 L110 94 Z" fill="#F2A541"/>
  <rect x="40" y="168" width="176" height="46" rx="12" fill="#1E2632"/>
  <rect x="40" y="166" width="176" height="6" rx="3" fill="#F2A541"/>
  <rect x="54" y="182" width="22" height="20" rx="5" fill="#F2A541"/>
  <rect x="86" y="184" width="44" height="16" rx="4" fill="#E6EDF3" opacity="0.85"/>
  <rect x="138" y="184" width="30" height="16" rx="4" fill="#9AA4AF" opacity="0.7"/>
  <rect x="180" y="184" width="22" height="16" rx="4" fill="#9AA4AF" opacity="0.5"/>
</svg>`;
const sizes = [256, 128, 64, 48, 32, 24, 16];
const browser = await chromium.launch();
const page = await browser.newPage();
const pngs = [];
for (const s of sizes) {
  await page.setViewportSize({ width: s, height: s });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(s)}</body></html>`);
  pngs.push(await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: s, height: s } }));
}
await browser.close();
fs.writeFileSync(path.join(root, 'assets', 'icon.png'), pngs[0]);
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
const dir = Buffer.alloc(16 * sizes.length);
let offset = 6 + dir.length;
sizes.forEach((s, i) => {
  const e = i * 16;
  dir.writeUInt8(s >= 256 ? 0 : s, e); dir.writeUInt8(s >= 256 ? 0 : s, e + 1);
  dir.writeUInt8(0, e + 2); dir.writeUInt8(0, e + 3); dir.writeUInt16LE(1, e + 4); dir.writeUInt16LE(32, e + 6);
  dir.writeUInt32LE(pngs[i].length, e + 8); dir.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
fs.writeFileSync(path.join(root, 'assets', 'icon.ico'), Buffer.concat([header, dir, ...pngs]));
console.log('icon written');
