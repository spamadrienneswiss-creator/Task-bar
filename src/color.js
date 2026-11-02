// Color helpers: wallpaper palette, theme matching and the accent tint. No Electron here, so it's testable.
const { THEMES } = require('../shared/themes');

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const toHex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}
function hslToRgb({ h, s, l }) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255 };
}

function luminance({ r, g, b }) {
  const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function rgbToLab({ r, g, b }) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const R = lin(r), G = lin(g), B = lin(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}
const deltaE = (p, q) => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);

/**
 * Picks the main colors out of a small image. `pixels` is a flat RGBA or BGRA byte array.
 * Returns up to `k` colors with the share of the picture each covers, biggest first.
 */
function extractPalette(pixels, { k = 6, bgra = false, iterations = 10 } = {}) {
  const pts = [];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    pts.push(bgra ? [pixels[i + 2], pixels[i + 1], pixels[i]] : [pixels[i], pixels[i + 1], pixels[i + 2]]);
  }
  if (!pts.length) return [];
  // Start from evenly spaced brightness levels so the result is the same every time.
  const sorted = pts.slice().sort((p, q) => (p[0] + p[1] + p[2]) - (q[0] + q[1] + q[2]));
  const n = Math.min(k, pts.length);
  let centers = Array.from({ length: n }, (_, i) => sorted[Math.floor((i + 0.5) * sorted.length / n)].slice());
  let assign = new Array(pts.length).fill(0);
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < pts.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = (pts[i][0] - centers[c][0]) ** 2 + (pts[i][1] - centers[c][1]) ** 2 + (pts[i][2] - centers[c][2]) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      assign[i] = best;
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) { const s = sums[assign[i]]; s[0] += pts[i][0]; s[1] += pts[i][1]; s[2] += pts[i][2]; s[3]++; }
    centers = sums.map((s, c) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centers[c]));
  }
  const counts = centers.map(() => 0);
  for (const a of assign) counts[a]++;
  const out = centers.map((c, i) => ({ rgb: { r: c[0], g: c[1], b: c[2] }, weight: counts[i] / pts.length }))
    .filter((c) => c.weight > 0.01);
  // Merge near-duplicates.
  const merged = [];
  for (const c of out.sort((a, b) => b.weight - a.weight)) {
    const twin = merged.find((m) => deltaE(rgbToLab(m.rgb), rgbToLab(c.rgb)) < 8);
    if (twin) twin.weight += c.weight; else merged.push({ ...c });
  }
  return merged.map((c) => ({ hex: toHex(c.rgb), rgb: c.rgb, weight: c.weight })).sort((a, b) => b.weight - a.weight);
}

/** How well each theme fits a palette. Highest score first. */
function rankThemes(palette, themes = THEMES) {
  if (!palette || !palette.length) return [];
  const pal = palette.map((p) => ({ lab: rgbToLab(p.rgb || hexToRgb(p.hex)), weight: p.weight }));
  const meanL = pal.reduce((s, p) => s + p.lab.L * p.weight, 0) / pal.reduce((s, p) => s + p.weight, 0);
  return themes.map((t) => {
    let score = 0;
    for (const [hex, w] of t.match) {
      const lab = rgbToLab(hexToRgb(hex));
      let best = 0;
      for (const p of pal) {
        const sim = Math.exp(-Math.pow(deltaE(lab, p.lab) / 32, 2));
        const area = 0.4 + 0.6 * Math.min(1, p.weight * 4);
        best = Math.max(best, sim * area);
      }
      score += w * best;
    }
    // Light pictures suit the light themes, dark ones the dark themes.
    const wantLight = meanL > 58;
    if (t.light !== wantLight) score *= 0.6;
    return { id: t.id, score };
  }).sort((a, b) => b.score - a.score);
}

/** The most vivid color in a palette, or null if the picture is mostly greys. */
function vividColor(palette) {
  let best = null, bestScore = 0;
  for (const p of palette || []) {
    const hsl = rgbToHsl(p.rgb || hexToRgb(p.hex));
    if (hsl.s < 0.25 || hsl.l < 0.18 || hsl.l > 0.85) continue;
    const score = hsl.s * (1 - Math.abs(hsl.l - 0.55)) * (0.3 + Math.min(1, p.weight * 5));
    if (score > bestScore) { bestScore = score; best = p.hex; }
  }
  return best;
}

/**
 * Turns a wallpaper color into accent colors that read well on a theme's bar:
 * `accent` for fills and lines, `accentText` for colored text, `ink` for text on an accent fill.
 */
function tintFor(theme, hex) {
  const bar = hexToRgb(theme.bar);
  let hsl = rgbToHsl(hexToRgb(hex));
  hsl.s = Math.max(hsl.s, 0.55);
  // Fills: bright enough to stand out on a dark bar, deep enough on a light one.
  let accent = hslToRgb(hsl);
  for (let i = 0; i < 20 && contrast(accent, bar) < 3; i++) {
    hsl = { ...hsl, l: theme.light ? hsl.l - 0.03 : hsl.l + 0.03 };
    accent = hslToRgb(hsl);
  }
  let th = rgbToHsl(accent);
  let accentText = accent;
  for (let i = 0; i < 25 && contrast(accentText, bar) < 4.5; i++) {
    th = { ...th, l: theme.light ? th.l - 0.03 : th.l + 0.03 };
    accentText = hslToRgb(th);
  }
  const ink = contrast(accent, { r: 0, g: 0, b: 0 }) >= contrast(accent, { r: 255, g: 255, b: 255 }) ? '#0B0B0C' : '#FFFFFF';
  return { accent: toHex(accent), accentText: toHex(accentText), ink };
}

module.exports = { hexToRgb, toHex, rgbToHsl, hslToRgb, luminance, contrast, rgbToLab, deltaE, extractPalette, rankThemes, vividColor, tintFor };
