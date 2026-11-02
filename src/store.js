// Settings, saved as JSON in the app's data folder.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  theme: 'command',
  tint: false,
  tintColor: null,
  suggestOnWallpaper: true,
  displayId: null,
  hideWindowsTaskbar: true,
  originalAutoHide: null,
  startWithWindows: true,
  showSeconds: null, // null = whatever the theme does
  clock24: false,
  searchEngine: 'google',
  winStyle: 'icons', // open windows: 'icons' only, or 'titles' (icon + window title)
  trayApps: ['command deck.exe'], // apps shown as small tray icons instead of open windows
  weather: { name: 'Los Angeles', region: 'California, US', lat: 34.0522, lon: -118.2437, unit: 'F' },
  pins: null, // filled on first run
  wallpaper: { sig: null, dismissedSig: null, suggestion: null, palette: null, vivid: null }
};

function merge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])
      ? merge(base[k], v) : v;
  }
  return out;
}

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { /* first run */ }
    this.data = merge(DEFAULTS, saved);
    this.timer = null;
  }
  get() { return this.data; }
  set(patch) {
    this.data = merge(this.data, patch);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
    return this.data;
  }
  flush() {
    clearTimeout(this.timer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (e) { /* best effort */ }
  }
}

module.exports = { Store, DEFAULTS, merge };
