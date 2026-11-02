// Search: ranks apps and Windows settings pages for what's typed, and builds the result list.
// Files come from the Windows search index (see search-host.ps1); this file only merges them in.

const SETTINGS = [
  ['Display', 'ms-settings:display', 'screen monitor resolution brightness scale night light hdr'],
  ['Sound', 'ms-settings:sound', 'audio volume speakers microphone output input'],
  ['Bluetooth & devices', 'ms-settings:bluetooth', 'bluetooth headphones devices pair mouse keyboard'],
  ['Wi-Fi', 'ms-settings:network-wifi', 'wifi wireless internet network'],
  ['Network & internet', 'ms-settings:network-status', 'network internet ethernet vpn proxy'],
  ['Background', 'ms-settings:personalization-background', 'wallpaper background desktop picture'],
  ['Colors', 'ms-settings:colors', 'accent dark mode light mode colors'],
  ['Themes', 'ms-settings:themes', 'themes cursor icons'],
  ['Lock screen', 'ms-settings:lockscreen', 'lock screen'],
  ['Windows taskbar', 'ms-settings:taskbar', 'taskbar auto hide'],
  ['Notifications', 'ms-settings:notifications', 'notifications alerts do not disturb focus'],
  ['Installed apps', 'ms-settings:appsfeatures', 'apps uninstall programs installed'],
  ['Default apps', 'ms-settings:defaultapps', 'default browser apps open with'],
  ['Startup apps', 'ms-settings:startupapps', 'startup boot apps'],
  ['Windows Update', 'ms-settings:windowsupdate', 'update updates patch'],
  ['Storage', 'ms-settings:storagesense', 'storage disk space drive clean'],
  ['Power & battery', 'ms-settings:powersleep', 'power battery sleep screen timeout'],
  ['Mouse', 'ms-settings:mousetouchpad', 'mouse cursor pointer scroll'],
  ['Keyboard', 'ms-settings:keyboard', 'keyboard typing'],
  ['Printers & scanners', 'ms-settings:printers', 'printer printers scanner print'],
  ['Date & time', 'ms-settings:dateandtime', 'date time clock time zone'],
  ['Language & region', 'ms-settings:regionlanguage', 'language region keyboard layout'],
  ['Your info', 'ms-settings:yourinfo', 'account profile picture sign in'],
  ['Privacy & security', 'ms-settings:privacy', 'privacy security permissions camera location'],
  ['Night light', 'ms-settings:nightlight', 'night light blue light'],
  ['Multitasking', 'ms-settings:multitasking', 'snap windows alt tab desktops'],
  ['About this PC', 'ms-settings:about', 'about pc name specs system info'],
  ['Windows Settings', 'ms-settings:', 'settings control'],
  ['Control Panel', 'control.exe', 'control panel'],
  ['Task Manager', 'taskmgr.exe', 'task manager processes cpu memory'],
  ['Task Bar settings', 'internal:settings', 'task bar taskbar theme pinned weather monitor']
].map(([title, target, words]) => ({ title, target, words }));

const ENGINES = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' }
};

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();

/** 0 when there is no match; higher is better. */
function scoreText(text, query) {
  const t = norm(text), q = norm(query);
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 85 - Math.min(10, t.length - q.length) * 0.5;
  const words = t.split(/[\s\-_.&()]+/).filter(Boolean);
  if (words.some((w) => w.startsWith(q))) return 70;
  // Initials: "vsc" finds "Visual Studio Code".
  if (q.length >= 2 && words.map((w) => w[0]).join('').startsWith(q)) return 60;
  if (t.includes(q)) return 50;
  // Every letter in order: "phtsp" finds "Photoshop".
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  return i === q.length && q.length >= 3 ? 20 : 0;
}

function rankApps(apps, query, limit = 6) {
  return apps
    .map((a) => ({ a, s: scoreText(a.name, query) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || x.a.name.localeCompare(y.a.name))
    .slice(0, limit)
    .map((x) => ({ ...x.a, score: x.s }));
}

function rankSettings(query, limit = 4) {
  return SETTINGS
    .map((s) => ({ s, score: Math.max(scoreText(s.title, query), scoreText(s.words, query) * 0.8) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => ({ ...x.s, score: x.score }));
}

/** Builds the grouped list the search panel shows. `files` comes from the Windows index. */
function buildResults({ query, apps = [], files = [], engine = 'google' }) {
  const q = String(query || '').trim();
  if (!q) return { query: q, groups: [] };
  const appHits = rankApps(apps, q).map((a) => ({
    type: 'app', title: a.name, sub: 'App', score: a.score, iconKey: a.iconKey || null,
    action: a.appId ? { kind: 'appid', value: a.appId } : { kind: 'path', value: a.path }
  }));
  const setHits = rankSettings(q).map((s) => ({
    type: 'setting', title: s.title, sub: s.target.startsWith('internal:') ? 'Task Bar' : 'System setting', score: s.score,
    action: s.target.startsWith('internal:') ? { kind: 'internal', value: s.target.slice(9) }
      : /^ms-settings:/.test(s.target) ? { kind: 'url', value: s.target } : { kind: 'exec', value: s.target }
  }));
  const fileHits = (files || []).slice(0, 6).map((f) => ({
    type: 'file', title: f.name, sub: f.folder || f.path, score: 30, iconKey: f.path,
    action: { kind: 'path', value: f.path }
  }));
  const eng = ENGINES[engine] || ENGINES.google;
  const web = [{ type: 'web', title: `Search the web for “${q}”`, sub: eng.name, score: 1, action: { kind: 'url', value: eng.url + encodeURIComponent(q) } }];

  const all = [...appHits, ...setHits, ...fileHits].sort((a, b) => b.score - a.score);
  const best = all[0] || web[0];
  const without = (list) => list.filter((x) => x !== best);
  const groups = [
    { name: 'Best match', items: [best] },
    { name: 'Apps', items: without(appHits) },
    { name: 'Settings', items: without(setHits) },
    { name: 'Files', items: without(fileHits) },
    { name: 'Web', items: best === web[0] ? [] : web }
  ].filter((g) => g.items.length);
  return { query: q, groups };
}

// Start menu entries like "{1AC14E77-...}\notepad.exe" use known-folder IDs.
const KNOWN_FOLDERS = {
  '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}': 'SystemRoot\\System32',
  '{F38BF404-1D43-42F2-9305-67DE0B28FC23}': 'SystemRoot',
  '{6D809377-6AF0-444B-8957-A3773F02200E}': 'ProgramFiles',
  '{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}': 'ProgramFiles(x86)',
  '{D65231B0-B2F1-4857-A4CE-A8E7C6EA7D27}': 'SystemRoot\\SysWOW64'
};
function resolveAppIdPath(appId, env = process.env) {
  const m = /^(\{[0-9A-F-]+\})\\(.+\.exe)$/i.exec(String(appId || ''));
  if (!m) return /^[a-z]:\\.+\.exe$/i.test(appId || '') ? appId : null;
  const base = KNOWN_FOLDERS[m[1].toUpperCase()];
  if (!base) return null;
  const [root, ...rest] = base.split('\\');
  const dir = env[root] || env[root.toUpperCase()];
  if (!dir) return null;
  return [dir, ...rest, m[2]].join('\\');
}

/** Makes a safe term for the Windows index CONTAINS() query. */
function indexTerm(q) {
  return String(q || '').replace(/["'%*\[\]\\;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

module.exports = { SETTINGS, ENGINES, scoreText, rankApps, rankSettings, buildResults, resolveAppIdPath, indexTerm };
