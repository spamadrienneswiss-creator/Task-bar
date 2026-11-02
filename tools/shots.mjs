// Screenshots of the bar, panel and settings in every theme, with stand-in data (no Electron needed).
// node tools/shots.mjs   -> tools/out/*.png
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { THEMES } = require('../shared/themes.js');
const color = require('../src/color.js');
const search = require('../src/search.js');

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'tools', 'out');
fs.mkdirSync(out, { recursive: true });
const only = process.argv[2];

function fakeState(theme, extra = {}) {
  const t = THEMES.find((x) => x.id === theme);
  return {
    version: '1.0.0', theme, tint: null, seconds: t.seconds, clock24: false, native: true,
    windows: [
      { hwnd: 11, title: 'Weather – Google Chrome', app: 'Chrome', icon: null, active: true },
      { hwnd: 12, title: 'Downloads', app: 'File Explorer', icon: null, active: false },
      { hwnd: 13, title: 'notes.txt – Notepad', app: 'Notepad', icon: null, active: false }
    ],
    pins: [
      { i: 0, name: 'File Explorer', icon: null, glyph: null, running: true },
      { i: 1, name: 'Google Chrome', icon: null, glyph: null, running: true },
      { i: 2, name: 'Command Deck', icon: null, glyph: null, running: false },
      { i: 3, name: 'Settings', icon: null, glyph: 'settings', running: false }
    ],
    weather: { temp: 64, unit: 'F', text: 'Clear', icon: 'clear', high: 71, low: 55, place: 'Los Angeles' },
    suggestion: null, update: { state: 'current' }, ...extra
  };
}

const fakeBridge = (st, extras) => `
  (() => {
    const st = ${JSON.stringify(st)};
    const extras = ${JSON.stringify(extras || {})};
    const noop = () => {};
    const sub = (name) => (cb) => { (window.__subs[name] = window.__subs[name] || []).push(cb); return noop; };
    window.__subs = {};
    window.__emit = (name, ...a) => (window.__subs[name] || []).forEach((f) => f(...a));
    window.tb = new Proxy({
      getState: async () => st, onState: sub('state'), onFocusSearch: sub('f'), onClearSearch: sub('c'), onPanelClosed: sub('p'),
      onMode: sub('mode'), onApps: sub('apps'), onResults: sub('results'), onKey: sub('key'),
      settings: async () => extras.settings, searchPlace: async () => [], rescanWallpaper: async () => extras.settings.wallpaper, pickApp: async () => false
    }, { get: (o, k) => (k in o ? o[k] : noop) });
  })();`;

const FAKE_APPS = ['Calculator', 'Camera', 'Clock', 'Command Deck', 'Discord', 'File Explorer', 'Google Chrome', 'Mail', 'Microsoft Edge', 'Notepad', 'Paint', 'Photos', 'Spotify', 'Steam', 'Terminal', 'Visual Studio Code']
  .map((name, i) => ({ i, name, icon: null }));

const browser = await chromium.launch();
const shots = [];
for (const t of THEMES) {
  if (only && only !== t.id) continue;
  const desk = t.desk;
  // Bar at a 1920-wide side monitor.
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 56 } });
    await page.addInitScript(fakeBridge(fakeState(t.id, t.id === 'horizon' ? { suggestion: { id: 'skydock', name: 'Skydock' } } : {})));
    await page.goto('file://' + path.join(root, 'renderer', 'bar.html'));
    await page.addStyleTag({ content: `html{background:${desk}}` });
    await page.waitForTimeout(500);
    const f = path.join(out, `bar-${t.id}.png`); await page.screenshot({ path: f }); shots.push(f);
    await page.close();
  }
  // Panel: all apps, then search results.
  {
    const page = await browser.newPage({ viewport: { width: 640, height: 560 } });
    await page.addInitScript(fakeBridge(fakeState(t.id)));
    await page.goto('file://' + path.join(root, 'renderer', 'panel.html'));
    await page.addStyleTag({ content: `html{background:${desk}}` });
    await page.evaluate((a) => { window.__emit('apps', a); window.__emit('mode', 'start'); }, FAKE_APPS);
    await page.waitForTimeout(300);
    let f = path.join(out, `panel-start-${t.id}.png`); await page.screenshot({ path: f }); shots.push(f);
    const res = search.buildResults({ query: 'display', apps: FAKE_APPS.map((a) => ({ name: a.name, appId: a.name })), files: [{ name: 'display-layout-notes.txt', path: 'C:\\Users\\Nick\\Documents\\display-layout-notes.txt', folder: 'C:\\Users\\Nick\\Documents' }] });
    await page.evaluate((r) => window.__emit('results', r), res);
    await page.waitForTimeout(200);
    f = path.join(out, `panel-search-${t.id}.png`); await page.screenshot({ path: f }); shots.push(f);
    await page.close();
  }
}
// Settings once, in two themes.
for (const id of only ? [only] : ['command', 'skydock']) {
  const palette = ['#1B1A3A', '#6B3A5A', '#E07A3A', '#FFE2B0', '#0D1626'];
  const settings = {
    settings: { theme: id, tint: false, suggestOnWallpaper: true, hideWindowsTaskbar: true, startWithWindows: true, showSeconds: null, clock24: false, searchEngine: 'google', weather: { name: 'Los Angeles', region: 'California, US', unit: 'F' } },
    pins: fakeState(id).pins.map((p) => ({ ...p, kind: p.glyph ? 'url' : 'path', value: p.glyph ? 'ms-settings:' : `C:\\Program Files\\${p.name}\\app.exe` })),
    displays: [{ id: '1', label: 'Display 1', primary: true, size: '2560 × 1440', current: false }, { id: '2', label: 'Display 2', primary: false, size: '1920 × 1080', current: true }],
    themes: THEMES, engines: [{ id: 'google', name: 'Google' }, { id: 'bing', name: 'Bing' }],
    wallpaper: { thumb: null, palette, suggestion: color.rankThemes(palette.map((hex) => ({ hex, weight: 0.2 })))[0].id },
    version: '1.0.0', update: { state: 'current' }, native: true
  };
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  await page.addInitScript(fakeBridge(fakeState(id), { settings }));
  await page.goto('file://' + path.join(root, 'renderer', 'settings.html'));
  await page.waitForTimeout(500);
  const f = path.join(out, `settings-${id}.png`); await page.screenshot({ path: f, fullPage: true }); shots.push(f);
  await page.close();
}
await browser.close();
console.log(shots.map((s) => path.relative(root, s)).join('\n'));
