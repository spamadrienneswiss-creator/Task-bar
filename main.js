// Task Bar: a themed Windows taskbar that docks to the side monitor without changing the main display.
// Main process: the bar window, the search / start panel, settings, and everything that talks to Windows.

const { app, BrowserWindow, screen, ipcMain, Menu, shell, nativeImage, dialog, net, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const { Store } = require('./src/store');
const W = require('./src/windows');
const color = require('./src/color');
const search = require('./src/search');
const weather = require('./src/weather');
const { THEMES, byId } = require('./shared/themes');
const win32mod = require('./src/win32');

const BAR_H = 56;              // bar height in screen points (scaled by Windows' display scaling)
const PANEL_W = 640, PANEL_H = 560;
const CB_MSG = 0x0400 + 0x0721; // the message Windows sends the bar about other bars and full-screen apps
const WM_ACTIVATE = 0x0006;

const isWin = process.platform === 'win32';
let w32 = null;
let w32Error = null;
try { if (isWin) w32 = win32mod.load(); } catch (e) { w32Error = String((e && e.message) || e); }

const smokeArg = process.argv.find((a) => a.startsWith('--smoke'));
const smokeFile = smokeArg ? (smokeArg.split('=')[1] || path.join(process.cwd(), 'smoke.json')) : null;

// ---- Uninstall: put Windows' own taskbar back the way it was ----------------------------------
const restoreMode = process.argv.includes('--restore-taskbar');
if (restoreMode) {
  try {
    const s = new Store(app.getPath('userData')).get();
    if (w32 && s.originalAutoHide !== null && s.originalAutoHide !== undefined) w32.setTaskbarAutoHide(!!s.originalAutoHide);
    else if (w32) w32.setTaskbarAutoHide(false);
  } catch (e) { /* nothing else to do */ }
  app.exit(0);
}

const gotLock = restoreMode ? false : smokeFile ? true : app.requestSingleInstanceLock();
if (!gotLock && !restoreMode) app.quit();

let store = null;
let bar = null, panel = null, settingsWin = null;
let barHwnd = 0;
const ownHwnds = new Set();
let barDisplay = null, monPhys = null, barRegistered = false, fullscreen = false;
let lastFg = 0;
let windowsList = [];
const windowOrder = [];
let weatherState = null;
let suggestion = null;
let wallpaperThumb = null;
let updateState = { state: 'idle' };
let apps = [];
const exeNames = new Map(); // exe path (lower case) -> app name from the Start menu
let host = null;
const log = (...a) => { if (!app.isPackaged || smokeFile) console.log('[task-bar]', ...a); };

// ---- Icons ------------------------------------------------------------------------------------
const iconCache = new Map();
const iconPending = new Map();
function iconFor(key) { return key ? (iconCache.get(String(key).toLowerCase()) || null) : null; }
function loadIcon(key) {
  if (!key) return Promise.resolve(null);
  const k = String(key).toLowerCase();
  if (iconCache.has(k)) return Promise.resolve(iconCache.get(k));
  if (iconPending.has(k)) return iconPending.get(k);
  const p = app.getFileIcon(key, { size: 'normal' })
    .then((img) => (img && !img.isEmpty() ? img.toDataURL() : null))
    .catch(() => null)
    .then((d) => { iconCache.set(k, d); iconPending.delete(k); return d; });
  iconPending.set(k, p);
  return p;
}

// ---- Search helper (PowerShell: Windows index + Start menu apps) -------------------------------
class SearchHost {
  constructor(script) {
    this.script = script; this.seq = 0; this.pending = new Map(); this.buf = ''; this.restarts = 0; this.start();
  }
  start() {
    if (!isWin) return;
    try {
      this.proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.script], { windowsHide: true });
    } catch (e) { this.proc = null; return; }
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (d) => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch (e) { continue; }
        const p = this.pending.get(msg.id);
        if (!p) continue;
        this.pending.delete(msg.id); clearTimeout(p.timer);
        if (msg.ok) p.resolve(Array.isArray(msg.items) ? msg.items : (msg.items ? [msg.items] : []));
        else p.reject(new Error(msg.error || 'search failed'));
      }
    });
    this.proc.stderr.on('data', () => {});
    this.proc.on('exit', () => {
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('search helper stopped')); }
      this.pending.clear(); this.proc = null;
      if (!app.isQuitting && this.restarts++ < 5) setTimeout(() => this.start(), 2000);
    });
  }
  request(op, extra = {}, timeout = 5000) {
    if (!this.proc) return Promise.reject(new Error('search helper not running'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('search timed out')); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.proc.stdin.write(JSON.stringify({ id, op, ...extra }) + '\n'); } catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
  files(q) { return this.request('files', { q: search.indexTerm(q) }, 4000); }
  apps() { return this.request('apps', {}, 20000); }
  stop() { try { if (this.proc) this.proc.kill(); } catch (e) { /* gone */ } }
}
function scriptPath() {
  return path.join(__dirname, 'src', 'search-host.ps1').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

// ---- Start menu apps ----------------------------------------------------------------------------
function scanStartMenu() {
  const roots = [
    process.env.ProgramData && path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ].filter(Boolean);
  const out = [];
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && depth < 4) walk(p, depth + 1);
      else if (/\.lnk$/i.test(e.name)) {
        let target = '';
        try { target = shell.readShortcutLink(p).target || ''; } catch (err) { /* not readable */ }
        out.push({ name: e.name.replace(/\.lnk$/i, ''), lnk: p, target });
      }
    }
  };
  roots.forEach((r) => walk(r, 0));
  return out;
}
const JUNK = /^(uninstall|readme|help|license|release notes|website|documentation)\b|\buninstall\b/i;
async function loadApps() {
  const lnks = isWin ? scanStartMenu() : [];
  const byName = new Map();
  for (const l of lnks) {
    if (!byName.has(l.name.toLowerCase())) byName.set(l.name.toLowerCase(), l);
    if (l.target && /\.exe$/i.test(l.target)) exeNames.set(l.target.toLowerCase(), l.name);
  }
  let start = [];
  if (host) { try { start = await host.apps(); } catch (e) { log('Start apps:', e.message); } }
  const list = start.length
    ? start.map((a) => {
      const l = byName.get(String(a.name).toLowerCase());
      return { name: a.name, appId: a.appId, iconKey: l ? l.lnk : search.resolveAppIdPath(a.appId) };
    })
    : lnks.map((l) => ({ name: l.name, path: l.lnk, iconKey: l.lnk }));
  const seen = new Set();
  apps = list.filter((a) => a.name && !JUNK.test(a.name) && !seen.has(a.name.toLowerCase()) && seen.add(a.name.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Warm the icon cache in the background, then refresh the open panel.
  Promise.all(apps.map((a) => loadIcon(a.iconKey))).then(() => { if (panel && panel.isVisible()) sendPanelApps(); });
  return apps;
}

// ---- Pins ---------------------------------------------------------------------------------------
function defaultPins() {
  const pins = [{ name: 'File Explorer', kind: 'path', value: path.join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe') }];
  const candidates = [
    ['Microsoft Edge', path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe')],
    ['Google Chrome', path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')],
    ['Command Deck', path.join(process.env.LOCALAPPDATA || '', 'Programs', 'command-deck', 'Command Deck.exe')]
  ];
  for (const [name, p] of candidates) if (p && fs.existsSync(p)) pins.push({ name, kind: 'path', value: p });
  pins.push({ name: 'Settings', kind: 'url', value: 'ms-settings:' });
  return pins;
}
function pinKey(p) { return p.kind === 'path' ? p.value : p.kind === 'appid' ? search.resolveAppIdPath(p.value) : null; }
function publicPins() {
  const running = new Set(windowsList.map((w) => (w.exe || '').toLowerCase()));
  return (store.get().pins || []).map((p, i) => {
    const key = pinKey(p);
    return {
      i, name: p.name, icon: iconFor(key), glyph: p.kind === 'url' ? (/^ms-settings/i.test(p.value) ? 'settings' : 'web') : null,
      running: !!(key && running.has(key.toLowerCase()))
    };
  });
}

// ---- Theme + state sent to the windows ---------------------------------------------------------
function tintColors() {
  const s = store.get();
  if (!s.tint) return null;
  const c = s.tintColor || (s.wallpaper && s.wallpaper.vivid);
  return c ? color.tintFor(byId(s.theme), c) : null;
}
function publicState() {
  const s = store.get();
  const t = byId(s.theme);
  return {
    version: app.getVersion(), theme: t.id, tint: tintColors(),
    seconds: s.showSeconds === null || s.showSeconds === undefined ? t.seconds : !!s.showSeconds,
    clock24: !!s.clock24,
    windows: windowsList.map((w) => ({ hwnd: w.hwnd, title: w.title, app: w.app, icon: iconFor(w.iconKey), active: w.hwnd === lastFg })),
    pins: publicPins(), weather: weatherState, suggestion, update: updateState, native: !!w32
  };
}
let lastSent = '';
function broadcast(force) {
  const st = publicState();
  const json = JSON.stringify(st);
  if (!force && json === lastSent) return;
  lastSent = json;
  for (const w of [bar, panel, settingsWin]) if (w && !w.isDestroyed()) w.webContents.send('state', st);
}

// ---- The bar window and its place on screen ----------------------------------------------------
function hwndOf(win) {
  const b = win.getNativeWindowHandle();
  return Number(b.length >= 8 ? b.readBigUInt64LE(0) : b.readUInt32LE(0));
}
function webPrefs() {
  return { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: false };
}
function createBar() {
  bar = new BrowserWindow({
    width: 1200, height: BAR_H, frame: false, transparent: true, backgroundColor: '#00000000', resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, show: false,
    hasShadow: false, thickFrame: false, title: 'Task Bar', webPreferences: webPrefs()
  });
  bar.setAlwaysOnTop(true, 'screen-saver');
  bar.loadFile(path.join(__dirname, 'renderer', 'bar.html'));
  barHwnd = hwndOf(bar);
  ownHwnds.add(barHwnd);
  if (isWin && w32) {
    bar.hookWindowMessage(CB_MSG, (wParam) => {
      const code = wParam.length >= 4 ? wParam.readUInt32LE(0) : -1;
      if (code === win32mod.ABN.POSCHANGED) schedulePlace();
      if (code === win32mod.ABN.FULLSCREENAPP) checkFullscreen();
    });
    bar.hookWindowMessage(WM_ACTIVATE, () => { try { w32.appBar(win32mod.ABM.ACTIVATE, { hWnd: barHwnd }); } catch (e) { /* ignore */ } });
  }
  bar.once('ready-to-show', () => { placeBar(); bar.showInactive(); });
  bar.on('closed', () => { bar = null; });
}

function placeBar() {
  if (!bar || bar.isDestroyed()) return;
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  barDisplay = W.pickDisplay(displays, primary.id, store.get().displayId);
  if (!barDisplay) return;
  const b = barDisplay.bounds;
  bar.setBounds({ x: b.x, y: b.y + b.height - BAR_H, width: b.width, height: BAR_H });
  if (!w32) return;
  try {
    const { ABM, ABE } = win32mod;
    monPhys = screen.dipToScreenRect(null, b);
    const h = Math.round(BAR_H * barDisplay.scaleFactor);
    if (!barRegistered) { w32.appBar(ABM.NEW, { hWnd: barHwnd, uCallbackMessage: CB_MSG }); barRegistered = true; }
    const q = w32.appBar(ABM.QUERYPOS, { hWnd: barHwnd, uEdge: ABE.BOTTOM, rc: W.barRect(monPhys, h) });
    const s = w32.appBar(ABM.SETPOS, { hWnd: barHwnd, uEdge: ABE.BOTTOM, rc: W.fitRect(q.abd.rc, h) });
    w32.move(barHwnd, W.fitRect(s.abd.rc, h));
  } catch (e) { log('placing the bar:', e.message); }
  positionPanel();
}
let placeTimer = null;
function schedulePlace() { clearTimeout(placeTimer); placeTimer = setTimeout(placeBar, 400); }

function removeAppBar() {
  if (!w32 || !barRegistered) return;
  try { w32.appBar(win32mod.ABM.REMOVE, { hWnd: barHwnd }); } catch (e) { /* ignore */ }
  barRegistered = false;
}

function checkFullscreen() {
  if (!w32 || !monPhys || !bar) return;
  let full = false;
  const fg = w32.foreground();
  if (fg && !ownHwnds.has(fg) && !W.SHELL_CLASSES.has(w32.className(fg))) full = W.coversMonitor(w32.rect(fg), monPhys);
  if (full !== fullscreen) {
    fullscreen = full;
    bar.setAlwaysOnTop(!full, 'screen-saver');
    if (full) hidePanel();
  }
}

// ---- Open windows -----------------------------------------------------------------------------
function pollWindows() {
  if (!w32) return;
  try {
    const fg = w32.foreground();
    if (fg && !ownHwnds.has(fg)) lastFg = fg;
    const raw = w32.listWindows().filter((w) => W.isTaskWindow(w, process.pid));
    const byHwnd = new Map(raw.map((w) => [w.hwnd, w]));
    for (let i = windowOrder.length - 1; i >= 0; i--) if (!byHwnd.has(windowOrder[i])) windowOrder.splice(i, 1);
    // Enumeration is newest first; add new windows at the end, oldest first.
    for (const w of raw.slice().reverse()) if (!windowOrder.includes(w.hwnd)) windowOrder.push(w.hwnd);
    windowsList = windowOrder.map((h) => {
      const w = byHwnd.get(h);
      const exe = w32.processPath(w.pid);
      const uwp = /applicationframehost\.exe$/i.test(exe);
      const iconKey = uwp ? null : exe;
      if (iconKey && !iconCache.has(iconKey.toLowerCase())) loadIcon(iconKey).then(() => broadcast());
      return { hwnd: h, title: w.title, exe, iconKey, app: exeNames.get(exe.toLowerCase()) || W.exeName(exe) };
    });
    checkFullscreen();
    if (bar && !bar.isDestroyed() && (!w32.isVisible(barHwnd) || w32.isIconic(barHwnd))) bar.showInactive();
    broadcast();
  } catch (e) { log('windows:', e.message); }
}

// ---- Panel (search + start) -------------------------------------------------------------------
function createPanel() {
  panel = new BrowserWindow({
    width: PANEL_W, height: PANEL_H, frame: false, transparent: true, backgroundColor: '#00000000', resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, show: false,
    hasShadow: false, thickFrame: false, title: 'Task Bar Search', webPreferences: webPrefs()
  });
  panel.setAlwaysOnTop(true, 'screen-saver');
  panel.loadFile(path.join(__dirname, 'renderer', 'panel.html'));
  ownHwnds.add(hwndOf(panel));
  panel.on('blur', () => setTimeout(() => { if (bar && !bar.isFocused() && panel && !panel.isFocused()) hidePanel(); }, 120));
}
function positionPanel() {
  if (!panel || !barDisplay) return;
  const b = barDisplay.bounds;
  panel.setBounds({ x: b.x + 8, y: b.y + b.height - BAR_H - PANEL_H - 6, width: PANEL_W, height: PANEL_H });
}
let panelMode = null;
function sendPanelApps() {
  if (!panel) return;
  panel.webContents.send('panel:apps', apps.map((a, i) => ({ i, name: a.name, icon: iconFor(a.iconKey) })));
}
function openPanel(mode) {
  if (!panel) return;
  panelMode = mode;
  positionPanel();
  sendPanelApps();
  panel.webContents.send('panel:mode', mode);
  if (!panel.isVisible()) panel.showInactive();
  if (bar) { bar.focus(); bar.webContents.send('bar:focusSearch'); }
}
function hidePanel() {
  if (panel && panel.isVisible()) panel.hide();
  panelMode = null;
  if (bar && !bar.isDestroyed()) bar.webContents.send('bar:panelClosed');
}
let qSeq = 0;
async function runQuery(text) {
  const seq = ++qSeq;
  const engine = store.get().searchEngine;
  const send = async (files) => {
    const res = search.buildResults({ query: text, apps, files, engine });
    const items = res.groups.flatMap((g) => g.items);
    await Promise.all(items.map((it) => (it.iconKey ? loadIcon(it.iconKey) : null)));
    for (const it of items) it.icon = iconFor(it.iconKey);
    if (seq === qSeq && panel) panel.webContents.send('panel:results', res);
  };
  if (!String(text || '').trim()) { if (panel) panel.webContents.send('panel:results', { query: '', groups: [] }); return; }
  if (!panel.isVisible()) openPanel('search');
  await send([]);
  if (host && String(text).trim().length >= 2) {
    await new Promise((r) => setTimeout(r, 150));
    if (seq !== qSeq) return;
    try { const files = await host.files(text); if (seq === qSeq) await send(files); } catch (e) { log('file search:', e.message); }
  }
}

// ---- Running things ----------------------------------------------------------------------------
const ALLOWED_EXEC = new Set(search.SETTINGS.map((s) => s.target).filter((t) => /\.exe$/i.test(t)));
function runAction(a) {
  if (!a || typeof a.value !== 'string') return;
  switch (a.kind) {
    case 'appid':
      spawn('explorer.exe', [`shell:AppsFolder\\${a.value}`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      break;
    case 'app': {
      const it = apps.find((x) => x.name === a.value);
      if (it) runAction(it.appId ? { kind: 'appid', value: it.appId } : { kind: 'path', value: it.path });
      break;
    }
    case 'path':
      shell.openPath(a.value);
      break;
    case 'url':
      if (/^(https?:|ms-settings:|ms-availablenetworks:)/i.test(a.value)) shell.openExternal(a.value);
      break;
    case 'exec':
      // Through the Windows shell, so Task Manager can ask for admin rights the usual way.
      if (ALLOWED_EXEC.has(a.value)) shell.openPath(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', a.value));
      break;
    case 'internal':
      if (a.value === 'settings') openSettings();
      if (a.value === 'windows-start' && w32) w32.tapKeys(win32mod.VK.LWIN);
      break;
    default:
  }
}
function tray(which) {
  if (!w32) return;
  const { VK } = win32mod;
  if (which === 'wifi') shell.openExternal('ms-availablenetworks:');
  if (which === 'volume') w32.tapKeys(VK.LWIN, VK.A);
  if (which === 'notifications' || which === 'clock') w32.tapKeys(VK.LWIN, VK.N);
  if (which === 'desktop') w32.tapKeys(VK.LWIN, VK.D);
}

// ---- Menus ------------------------------------------------------------------------------------
function themeMenu() {
  const cur = store.get().theme;
  return THEMES.map((t) => ({ label: t.name, type: 'radio', checked: t.id === cur, click: () => setTheme(t.id) }));
}
function barMenu() {
  const items = [
    { label: 'Theme', submenu: themeMenu() },
    { label: 'Task Bar settings…', click: openSettings },
    { type: 'separator' },
    { label: 'Task Manager', click: () => runAction({ kind: 'exec', value: 'taskmgr.exe' }) },
    { label: 'Windows taskbar settings', click: () => runAction({ kind: 'url', value: 'ms-settings:taskbar' }) }
  ];
  if (updateState.state === 'ready') items.push({ type: 'separator' }, { label: `Restart to update (v${updateState.version})`, click: installUpdate });
  items.push({ type: 'separator' }, { label: 'Quit Task Bar', click: () => app.quit() });
  Menu.buildFromTemplate(items).popup({ window: bar });
}
function windowMenu(hwnd) {
  const w = windowsList.find((x) => x.hwnd === hwnd);
  if (!w) return;
  const pins = store.get().pins || [];
  const pinned = pins.some((p) => p.kind === 'path' && p.value.toLowerCase() === (w.exe || '').toLowerCase());
  const items = [];
  if (w.exe && !/applicationframehost\.exe$/i.test(w.exe)) {
    items.push(pinned
      ? { label: `Unpin ${w.app}`, click: () => store.set({ pins: pins.filter((p) => !(p.kind === 'path' && p.value.toLowerCase() === w.exe.toLowerCase())) }) && broadcast(true) }
      : { label: `Pin ${w.app} to the bar`, click: () => { store.set({ pins: [...pins, { name: w.app, kind: 'path', value: w.exe }] }); broadcast(true); } });
    items.push({ label: `Open another ${w.app}`, click: () => shell.openPath(w.exe) }, { type: 'separator' });
  }
  items.push({ label: 'Close window', click: () => w32 && w32.close(hwnd) });
  Menu.buildFromTemplate(items).popup({ window: bar });
}
function movePin(i, d) {
  const pins = (store.get().pins || []).slice();
  const j = i + d;
  if (i < 0 || j < 0 || i >= pins.length || j >= pins.length) return;
  [pins[i], pins[j]] = [pins[j], pins[i]];
  store.set({ pins }); broadcast(true);
}
function removePin(i) {
  const pins = (store.get().pins || []).filter((_, k) => k !== i);
  store.set({ pins }); broadcast(true);
}
function pinMenu(i) {
  const pins = store.get().pins || [];
  if (!pins[i]) return;
  Menu.buildFromTemplate([
    { label: `Open ${pins[i].name}`, click: () => launchPin(i) },
    { type: 'separator' },
    { label: 'Move left', enabled: i > 0, click: () => movePin(i, -1) },
    { label: 'Move right', enabled: i < pins.length - 1, click: () => movePin(i, 1) },
    { label: 'Unpin', click: () => removePin(i) }
  ]).popup({ window: bar });
}
function launchPin(i) {
  const p = (store.get().pins || [])[i];
  if (p) runAction({ kind: p.kind, value: p.value });
}

// ---- Theme, wallpaper match -----------------------------------------------------------------
function setTheme(id) {
  store.set({ theme: byId(id).id });
  if (suggestion && suggestion.id === id) suggestion = null;
  broadcast(true);
}
function wallpaperFile() {
  const transcoded = process.env.APPDATA && path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Themes', 'TranscodedWallpaper');
  if (transcoded && fs.existsSync(transcoded)) return transcoded;
  try { const p = w32 && w32.wallpaperPath(); if (p && fs.existsSync(p)) return p; } catch (e) { /* none */ }
  return null;
}
function loadWallpaperImage(file) {
  let img = nativeImage.createFromPath(file);
  if (img.isEmpty()) { try { img = nativeImage.createFromBuffer(fs.readFileSync(file)); } catch (e) { /* unreadable */ } }
  return img;
}
function checkWallpaper({ force = false } = {}) {
  const file = wallpaperFile();
  if (!file) return null;
  let st;
  try { st = fs.statSync(file); } catch (e) { return null; }
  const sig = `${file}|${Math.round(st.mtimeMs)}|${st.size}`;
  const prev = store.get().wallpaper || {};
  if (!force && sig === prev.sig && wallpaperThumb) return prev;
  const img = loadWallpaperImage(file);
  if (img.isEmpty()) return null;
  wallpaperThumb = img.resize({ width: 320, quality: 'good' }).toDataURL();
  if (sig === prev.sig && !force) return prev;
  const small = img.resize({ width: 64, quality: 'good' });
  const palette = color.extractPalette(small.toBitmap(), { bgra: true });
  const ranks = color.rankThemes(palette);
  const wp = { sig, palette: palette.slice(0, 5).map((p) => p.hex), suggestion: ranks[0] ? ranks[0].id : null, vivid: color.vividColor(palette), dismissedSig: prev.dismissedSig || null };
  const firstLook = !prev.sig;
  store.set({ wallpaper: wp });
  const s = store.get();
  if (!firstLook && s.suggestOnWallpaper && wp.suggestion && wp.suggestion !== s.theme && wp.dismissedSig !== sig) {
    suggestion = { id: wp.suggestion, name: byId(wp.suggestion).name };
  } else if (!firstLook) suggestion = null;
  broadcast(true);
  return wp;
}
function wallpaperInfo() {
  checkWallpaper();
  const wp = store.get().wallpaper || {};
  return { thumb: wallpaperThumb, palette: wp.palette || [], suggestion: wp.suggestion, vivid: wp.vivid };
}

// ---- Weather ---------------------------------------------------------------------------------
async function refreshWeather() {
  try { weatherState = await weather.fetchWeather(store.get().weather, (u) => net.fetch(u)); broadcast(); } catch (e) { log('weather:', e.message); }
}

// ---- Windows' own taskbar ---------------------------------------------------------------------
function applyTaskbarHide() {
  if (!w32) return;
  try {
    const s = store.get();
    if (s.hideWindowsTaskbar) {
      if (s.originalAutoHide === null || s.originalAutoHide === undefined) store.set({ originalAutoHide: w32.taskbarAutoHide() });
      w32.setTaskbarAutoHide(true);
    } else if (s.originalAutoHide !== null && s.originalAutoHide !== undefined) {
      w32.setTaskbarAutoHide(!!s.originalAutoHide);
      store.set({ originalAutoHide: null });
    }
  } catch (e) { log('taskbar:', e.message); }
}
function restoreTaskbar() {
  if (!w32) return;
  try {
    const s = store.get();
    if (s.hideWindowsTaskbar && s.originalAutoHide !== null && s.originalAutoHide !== undefined) w32.setTaskbarAutoHide(!!s.originalAutoHide);
  } catch (e) { /* ignore */ }
}

// ---- Settings window --------------------------------------------------------------------------
function openSettings() {
  hidePanel();
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  const t = byId(store.get().theme);
  settingsWin = new BrowserWindow({
    width: 1000, height: 760, minWidth: 760, minHeight: 560, title: 'Task Bar Settings', backgroundColor: t.desk,
    autoHideMenuBar: true, show: false, icon: path.join(__dirname, 'assets', 'icon.png'), webPreferences: webPrefs()
  });
  settingsWin.removeMenu();
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  ownHwnds.add(hwndOf(settingsWin));
  if (barDisplay) {
    const b = barDisplay.workArea;
    settingsWin.setBounds({ x: Math.round(b.x + (b.width - 1000) / 2), y: Math.round(b.y + Math.max(0, (b.height - 760) / 2)), width: 1000, height: Math.min(760, b.height) });
  }
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => { settingsWin = null; });
}
function displaysInfo() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays()
    .slice().sort((a, b) => a.bounds.x - b.bounds.x)
    .map((d, i) => ({
      id: String(d.id), label: d.label || `Display ${i + 1}`, primary: d.id === primary,
      size: `${Math.round(d.size.width * d.scaleFactor)} × ${Math.round(d.size.height * d.scaleFactor)}`,
      current: barDisplay ? d.id === barDisplay.id : false
    }));
}
const SETTABLE = new Set(['theme', 'tint', 'suggestOnWallpaper', 'displayId', 'hideWindowsTaskbar', 'startWithWindows', 'showSeconds', 'clock24', 'searchEngine']);
function applySettings(patch) {
  const clean = {};
  for (const [k, v] of Object.entries(patch || {})) if (SETTABLE.has(k)) clean[k] = v;
  if ('theme' in clean) clean.theme = byId(clean.theme).id;
  if ('searchEngine' in clean && !search.ENGINES[clean.searchEngine]) delete clean.searchEngine;
  store.set(clean);
  if ('displayId' in clean) placeBar();
  if ('hideWindowsTaskbar' in clean) applyTaskbarHide();
  if ('startWithWindows' in clean) applyAutoStart();
  if ('theme' in clean && suggestion && suggestion.id === clean.theme) suggestion = null;
  broadcast(true);
}
function applyAutoStart() {
  if (!app.isPackaged || smokeFile) return;
  app.setLoginItemSettings({ openAtLogin: !!store.get().startWithWindows });
}

// ---- Updates (same as Command Deck: GitHub Releases) -----------------------------------------
const UPDATE_EVERY = 4 * 3600 * 1000;
let updater = null;
function setUpdate(next) { updateState = { ...updateState, ...next }; broadcast(true); }
function setupUpdates() {
  if (!app.isPackaged || smokeFile) { updateState = { state: 'dev' }; return; }
  try { updater = require('electron-updater').autoUpdater; } catch (e) { updateState = { state: 'error', message: 'Updater missing' }; return; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('checking-for-update', () => setUpdate({ state: 'checking', checkedAt: Date.now() }));
  updater.on('update-available', (info) => setUpdate({ state: 'downloading', version: info.version, percent: 0 }));
  updater.on('download-progress', (p) => setUpdate({ state: 'downloading', percent: Math.round(p.percent || 0) }));
  updater.on('update-not-available', () => setUpdate({ state: 'current', checkedAt: Date.now() }));
  updater.on('update-downloaded', (info) => setUpdate({ state: 'ready', version: info.version }));
  updater.on('error', (err) => setUpdate({ state: 'error', message: String((err && err.message) || err).slice(0, 200), checkedAt: Date.now() }));
  setTimeout(checkUpdates, 20000);
  setInterval(checkUpdates, UPDATE_EVERY);
}
function checkUpdates() {
  if (updater && updateState.state !== 'ready' && updateState.state !== 'downloading') updater.checkForUpdates().catch(() => {});
}
function installUpdate() { if (updater && updateState.state === 'ready') { app.isQuitting = true; updater.quitAndInstall(true, true); } }

// ---- IPC ---------------------------------------------------------------------------------------
function registerIpc() {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : -1);
  ipcMain.handle('state:get', () => publicState());
  ipcMain.on('win:activate', (_e, hwnd) => {
    hwnd = num(hwnd);
    if (!w32 || !windowsList.some((w) => w.hwnd === hwnd)) return;
    if (hwnd === lastFg && !w32.isIconic(hwnd)) w32.minimize(hwnd);
    else { w32.activate(hwnd); lastFg = hwnd; }
    setTimeout(pollWindows, 120);
  });
  ipcMain.on('win:menu', (_e, hwnd) => windowMenu(num(hwnd)));
  ipcMain.on('win:close', (_e, hwnd) => { hwnd = num(hwnd); if (w32 && windowsList.some((w) => w.hwnd === hwnd)) w32.close(hwnd); });
  ipcMain.on('pin:launch', (_e, i) => launchPin(num(i)));
  ipcMain.on('pin:menu', (_e, i) => pinMenu(num(i)));
  ipcMain.on('bar:menu', () => barMenu());
  ipcMain.on('tray', (_e, which) => tray(String(which)));
  ipcMain.on('panel:open', (_e, mode) => {
    const visible = panel && panel.isVisible();
    if (mode === 'start') { if (visible && panelMode === 'start') hidePanel(); else openPanel('start'); }
    else if (!visible) openPanel('search');
  });
  ipcMain.on('panel:hide', () => hidePanel());
  ipcMain.on('search:query', (_e, text) => runQuery(String(text || '').slice(0, 200)));
  ipcMain.on('search:key', (_e, key) => { if (panel) panel.webContents.send('panel:key', String(key)); });
  ipcMain.on('search:blur', () => setTimeout(() => { if (panel && !panel.isFocused() && bar && !bar.isFocused()) hidePanel(); }, 150));
  ipcMain.on('panel:run', (_e, action) => {
    runAction(action);
    hidePanel();
    if (bar) bar.webContents.send('bar:clearSearch');
  });
  ipcMain.on('suggest', (_e, accept) => {
    if (!suggestion) return;
    if (accept) setTheme(suggestion.id);
    else { const wp = store.get().wallpaper || {}; store.set({ wallpaper: { dismissedSig: wp.sig } }); }
    suggestion = null; broadcast(true);
  });
  ipcMain.on('weather:open', () => {
    const p = store.get().weather;
    shell.openExternal('https://www.google.com/search?q=' + encodeURIComponent(`weather ${p.name}`));
  });
  ipcMain.on('settings:open', () => openSettings());

  ipcMain.handle('settings:get', () => {
    const s = store.get();
    return {
      settings: { theme: s.theme, tint: s.tint, suggestOnWallpaper: s.suggestOnWallpaper, displayId: s.displayId, hideWindowsTaskbar: s.hideWindowsTaskbar, startWithWindows: s.startWithWindows, showSeconds: s.showSeconds, clock24: s.clock24, searchEngine: s.searchEngine, weather: s.weather },
      pins: (s.pins || []).map((p, i) => ({ i, name: p.name, kind: p.kind, value: p.value, icon: iconFor(pinKey(p)) })),
      displays: displaysInfo(), themes: THEMES, engines: Object.entries(search.ENGINES).map(([id, e]) => ({ id, name: e.name })),
      wallpaper: wallpaperInfo(), version: app.getVersion(), update: updateState, native: !!w32
    };
  });
  ipcMain.on('settings:set', (_e, patch) => applySettings(patch));
  ipcMain.handle('settings:pickApp', async () => {
    const r = await dialog.showOpenDialog(settingsWin || undefined, { title: 'Pick an app to pin', properties: ['openFile'], filters: [{ name: 'Apps and shortcuts', extensions: ['exe', 'lnk'] }] });
    if (r.canceled || !r.filePaths[0]) return false;
    const file = r.filePaths[0];
    let value = file;
    if (/\.lnk$/i.test(file)) { try { value = shell.readShortcutLink(file).target || file; } catch (e) { /* keep the shortcut */ } }
    const name = exeNames.get(value.toLowerCase()) || path.basename(file).replace(/\.(exe|lnk)$/i, '');
    store.set({ pins: [...(store.get().pins || []), { name, kind: 'path', value }] });
    await loadIcon(value);
    broadcast(true);
    return true;
  });
  ipcMain.on('settings:removePin', (_e, i) => removePin(num(i)));
  ipcMain.on('settings:movePin', (_e, i, d) => movePin(num(i), num(d) > 0 ? 1 : -1));
  ipcMain.handle('settings:searchPlace', async (_e, q) => {
    try { return await weather.searchPlaces(String(q || '').slice(0, 80), (u) => net.fetch(u)); } catch (e) { return []; }
  });
  ipcMain.on('settings:setPlace', (_e, p) => {
    if (!p || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lon))) return;
    store.set({ weather: { name: String(p.name || '').slice(0, 80), region: String(p.region || '').slice(0, 80), lat: Number(p.lat), lon: Number(p.lon) } });
    refreshWeather();
  });
  ipcMain.on('settings:setUnit', (_e, u) => { store.set({ weather: { unit: u === 'C' ? 'C' : 'F' } }); refreshWeather(); });
  ipcMain.handle('settings:rescanWallpaper', () => { checkWallpaper({ force: true }); return wallpaperInfo(); });
  ipcMain.on('settings:checkUpdates', () => checkUpdates());
  ipcMain.on('settings:installUpdate', () => installUpdate());
}

// ---- Smoke test (CI on Windows): start everything, report, quit ------------------------------
async function smoke() {
  const report = { ok: true, native: !!w32, nativeError: w32Error, checks: {} };
  const check = async (name, fn) => {
    try { report.checks[name] = { ok: true, value: await fn() }; } catch (e) { report.ok = false; report.checks[name] = { ok: false, error: String((e && e.stack) || e) }; }
  };
  await new Promise((r) => setTimeout(r, 3000));
  await check('structSizes', () => { if (w32.sizes.APPBARDATA !== 48) throw new Error('APPBARDATA is ' + w32.sizes.APPBARDATA); return w32.sizes; });
  await check('appbar', () => ({ registered: barRegistered, monitor: monPhys, bar: w32.rect(barHwnd) }));
  await check('windows', () => { pollWindows(); return { raw: w32.listWindows().length, shown: windowsList.length, sample: windowsList.slice(0, 5).map((w) => w.title) }; });
  await check('taskbarState', () => ({ tray: !!w32.trayWindow(), autoHide: w32.taskbarAutoHide() }));
  await check('searchHost', async () => {
    await host.request('ping');
    const svc = await host.request('index').catch((e) => [{ service: 'unknown: ' + e.message }]);
    const tryFiles = async (q) => { const f = await host.files(q).catch((e) => 'index: ' + e.message); return Array.isArray(f) ? f.length : f; };
    return { windowsSearch: svc[0] && svc[0].service, files_a: await tryFiles('a'), files_windows: await tryFiles('windows') };
  });
  await check('apps', async () => { const list = await loadApps(); return { count: list.length, sample: list.slice(0, 5).map((a) => a.name) }; });
  await check('search', () => search.buildResults({ query: 'set', apps }).groups.map((g) => g.name));
  await check('wallpaper', () => { const f = wallpaperFile(); return { file: f, info: f ? checkWallpaper({ force: true }) : null }; });
  await check('renderer', async () => bar.webContents.executeJavaScript('document.querySelectorAll(".pin").length + ":" + document.documentElement.dataset.theme'));
  fs.writeFileSync(smokeFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  app.isQuitting = true;
  removeAppBar();
  app.exit(report.ok ? 0 : 1);
}

// ---- Start up ---------------------------------------------------------------------------------
app.whenReady().then(async () => {
  if (!gotLock) return;
  store = new Store(app.getPath('userData'));
  if (!store.get().pins) store.set({ pins: defaultPins() });
  for (const p of store.get().pins) loadIcon(pinKey(p));

  registerIpc();
  if (isWin) host = new SearchHost(scriptPath());
  createBar();
  createPanel();
  if (!smokeFile) applyTaskbarHide();
  applyAutoStart();
  setupUpdates();

  loadApps().then(() => broadcast(true));
  setInterval(() => loadApps(), 30 * 60 * 1000);
  setInterval(pollWindows, 700);
  refreshWeather();
  setInterval(refreshWeather, 15 * 60 * 1000);
  setTimeout(() => checkWallpaper(), 4000);
  setInterval(() => checkWallpaper(), 20000);

  screen.on('display-added', schedulePlace);
  screen.on('display-removed', schedulePlace);
  screen.on('display-metrics-changed', schedulePlace);
  powerMonitor.on('resume', () => { schedulePlace(); refreshWeather(); });

  if (smokeFile) smoke();
});

app.on('second-instance', (_e, argv) => {
  if (argv.includes('--restore-taskbar')) { restoreTaskbar(); app.quit(); return; }
  openSettings();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  removeAppBar();
  if (!smokeFile) restoreTaskbar();
  if (host) host.stop();
  if (store) store.flush();
});

app.on('window-all-closed', (e) => e.preventDefault());
