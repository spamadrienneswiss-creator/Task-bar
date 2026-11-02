// Settings: theme picker with wallpaper match, pinned apps, weather place, monitor and behavior.
const $ = (s) => document.querySelector(s);
const I = window.TB_ICONS;
let data = null;
let state = null;

const TITLES = { theme: 'Theme', pins: 'Pinned apps', weather: 'Weather', bar: 'Bar' };
function showTab(id) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  document.querySelectorAll('.tab').forEach((t) => { t.hidden = t.id !== `tab-${id}`; });
  $('#pageTitle').textContent = TITLES[id];
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

function applyTheme(themeId, tint) {
  const root = document.documentElement;
  root.dataset.theme = themeId;
  for (const [v, k] of [['--accent', 'accent'], ['--accent-text', 'accentText'], ['--ink', 'ink']]) {
    if (tint) root.style.setProperty(v, tint[k]); else root.style.removeProperty(v);
  }
}

function icon(src, name, kind, value) {
  const img = window.safeImg(src);
  if (img) return `<img src="${img}" alt="">`;
  if (kind === 'url') return I.svg(/^ms-settings/i.test(value || '') ? 'gear' : 'globe', 22);
  return `<span class="mono-icon">${window.esc((name || '?').charAt(0).toUpperCase())}</span>`;
}
const setSwitch = (el, on) => el.setAttribute('aria-checked', String(!!on));

// ---- Theme tab ----
function renderWallpaper() {
  const w = data.wallpaper || {};
  const thumb = window.safeImg(w.thumb);
  $('#wallThumb').style.backgroundImage = thumb ? `url("${thumb}")` : '';
  $('#swatches').innerHTML = (w.palette || []).map((hex) => `<span style="background:${/^#[0-9a-f]{6}$/i.test(hex) ? hex : 'transparent'}" title="${window.esc(hex)}"></span>`).join('');
  const best = data.themes.find((t) => t.id === w.suggestion);
  $('#bestName').textContent = best ? best.name : 'No wallpaper found';
  const inUse = best && best.id === data.settings.theme;
  $('#useBest').hidden = !best || inUse;
  $('#useBest').textContent = best ? `Use ${best.name}` : 'Use it';
  $('#wallKicker').textContent = inUse ? 'YOUR WALLPAPER · ALREADY MATCHED' : (state && state.suggestion ? 'NEW WALLPAPER SPOTTED' : 'YOUR WALLPAPER');
}
function renderThemes() {
  const cur = data.settings.theme;
  const best = data.wallpaper && data.wallpaper.suggestion;
  $('#themes').innerHTML = data.themes.map((t) => {
    const accent = t.accent;
    return `<button class="theme" data-theme-id="${t.id}" aria-pressed="${t.id === cur}">`
      + `<span class="pv" style="background:${t.desk}"><span class="mini" style="background:${t.bar};border-top:2px solid ${accent}">`
      + `<i style="width:12px;height:12px;background:${accent}"></i><i style="width:40px;height:10px;border:1px solid ${accent}"></i>`
      + `<i style="width:30px;height:8px;background:${t.line}"></i><i style="width:30px;height:8px;background:${t.line}"></i>`
      + `<i style="margin-left:auto;width:22px;height:8px;background:${accent}"></i></span></span>`
      + `<span class="meta"><span class="name">${window.esc(t.name)}</span>`
      + (t.id === cur ? '<span class="tag">IN USE</span>' : t.id === best ? '<span class="tag">★ match</span>' : '')
      + `</span><span class="from">${window.esc(t.from)}</span></button>`;
  }).join('');
}
$('#themes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme-id]');
  if (b) { window.tb.set({ theme: b.dataset.themeId }); data.settings.theme = b.dataset.themeId; renderThemes(); renderWallpaper(); }
});
$('#useBest').addEventListener('click', () => {
  const id = data.wallpaper && data.wallpaper.suggestion;
  if (id) { window.tb.set({ theme: id }); data.settings.theme = id; renderThemes(); renderWallpaper(); }
});
$('#rescan').addEventListener('click', async () => { data.wallpaper = await window.tb.rescanWallpaper(); renderWallpaper(); renderThemes(); });
$('#tTint').addEventListener('click', () => { data.settings.tint = !data.settings.tint; setSwitch($('#tTint'), data.settings.tint); window.tb.set({ tint: data.settings.tint }); });
$('#tSuggest').addEventListener('click', () => { data.settings.suggestOnWallpaper = !data.settings.suggestOnWallpaper; setSwitch($('#tSuggest'), data.settings.suggestOnWallpaper); window.tb.set({ suggestOnWallpaper: data.settings.suggestOnWallpaper }); });

// ---- Pins tab ----
function renderPins() {
  const pins = data.pins || [];
  $('#pinList').innerHTML = pins.length ? pins.map((p, i) =>
    `<div class="item"><span class="ic">${icon(p.icon, p.name, p.kind, p.value)}</span>`
    + `<span class="tx"><strong>${window.esc(p.name)}</strong><span class="dim">${window.esc(p.value)}</span></span>`
    + `<button class="btn small" data-move="${i}" data-d="-1" aria-label="Move ${window.esc(p.name)} left" ${i === 0 ? 'disabled' : ''}>${I.svg('up', 16)}</button>`
    + `<button class="btn small" data-move="${i}" data-d="1" aria-label="Move ${window.esc(p.name)} right" ${i === pins.length - 1 ? 'disabled' : ''}>${I.svg('down', 16)}</button>`
    + `<button class="btn small" data-remove="${i}" aria-label="Unpin ${window.esc(p.name)}">${I.svg('close', 16)}</button></div>`
  ).join('') : '<div class="dim">Nothing pinned yet.</div>';
}
$('#pinList').addEventListener('click', async (e) => {
  const m = e.target.closest('[data-move]');
  const r = e.target.closest('[data-remove]');
  if (m) window.tb.movePin(Number(m.dataset.move), Number(m.dataset.d));
  if (r) window.tb.removePin(Number(r.dataset.remove));
  if (m || r) setTimeout(reload, 150);
});
$('#addPin').addEventListener('click', async () => { if (await window.tb.pickApp()) reload(); });

// ---- Weather tab ----
function renderWeather() {
  const w = data.settings.weather || {};
  $('#placeName').textContent = [w.name, w.region].filter(Boolean).join(', ') || '—';
  document.querySelectorAll('[data-unit]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.unit === (w.unit || 'F'))));
}
document.querySelectorAll('[data-unit]').forEach((b) => b.addEventListener('click', () => {
  data.settings.weather.unit = b.dataset.unit; window.tb.setUnit(b.dataset.unit); renderWeather();
}));
let places = [];
async function findPlace() {
  const q = $('#placeQ').value.trim();
  if (!q) return;
  $('#placeList').innerHTML = '<div class="dim">Searching…</div>';
  places = await window.tb.searchPlace(q);
  $('#placeList').innerHTML = places.length ? places.map((p, i) =>
    `<button class="item" data-place="${i}"><span class="tx"><strong>${window.esc(p.name)}</strong><span class="dim">${window.esc(p.region)}</span></span></button>`
  ).join('') : '<div class="dim">No places found.</div>';
}
$('#placeGo').addEventListener('click', findPlace);
$('#placeQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') findPlace(); });
$('#placeList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-place]');
  if (!b) return;
  const p = places[Number(b.dataset.place)];
  window.tb.setPlace(p);
  data.settings.weather = { ...data.settings.weather, ...p };
  $('#placeList').innerHTML = ''; $('#placeQ').value = '';
  renderWeather();
});

// ---- Bar tab ----
function renderDisplays() {
  $('#displayList').innerHTML = data.displays.map((d) =>
    `<button class="item${d.current ? ' current' : ''}" data-display="${window.esc(d.id)}">`
    + `<span class="ic">${I.svg('deck', 22)}</span><span class="tx"><strong>${window.esc(d.label)}${d.primary ? ' · main display' : ''}</strong><span class="dim">${window.esc(d.size)}</span></span>`
    + `${d.current ? '<span class="tag">BAR IS HERE</span>' : ''}</button>`
  ).join('');
}
$('#displayList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-display]');
  if (b) { window.tb.set({ displayId: b.dataset.display }); setTimeout(reload, 600); }
});
$('#tHide').addEventListener('click', () => { data.settings.hideWindowsTaskbar = !data.settings.hideWindowsTaskbar; setSwitch($('#tHide'), data.settings.hideWindowsTaskbar); window.tb.set({ hideWindowsTaskbar: data.settings.hideWindowsTaskbar }); });
$('#tStart').addEventListener('click', () => { data.settings.startWithWindows = !data.settings.startWithWindows; setSwitch($('#tStart'), data.settings.startWithWindows); window.tb.set({ startWithWindows: data.settings.startWithWindows }); });
$('#t24').addEventListener('click', () => { data.settings.clock24 = !data.settings.clock24; setSwitch($('#t24'), data.settings.clock24); window.tb.set({ clock24: data.settings.clock24 }); });
$('#seconds').addEventListener('change', (e) => window.tb.set({ showSeconds: e.target.value === 'theme' ? null : e.target.value === 'on' }));
$('#engine').addEventListener('change', (e) => window.tb.set({ searchEngine: e.target.value }));
$('#winStyle').addEventListener('change', (e) => window.tb.set({ winStyle: e.target.value }));

function renderUpdate() {
  const u = (state && state.update) || data.update || {};
  $('#version').textContent = `Task Bar v${data.version}`;
  const txt = {
    dev: 'Development copy: updates are off.', idle: 'Checks for updates every few hours.', checking: 'Checking for updates…',
    current: 'You have the latest version.', downloading: `Downloading v${u.version || ''}… ${u.percent || 0}%`,
    ready: `v${u.version} is ready. Restart Task Bar to finish.`, error: `Couldn't check for updates${u.message ? `: ${u.message}` : '.'}`
  };
  $('#updateText').textContent = txt[u.state] || '';
  $('#updateBtn').textContent = u.state === 'ready' ? 'Restart to update' : 'Check for updates';
  $('#updateBtn').disabled = u.state === 'dev' || u.state === 'checking' || u.state === 'downloading';
}
$('#updateBtn').addEventListener('click', () => { if (((state && state.update) || {}).state === 'ready') window.tb.installUpdate(); else window.tb.checkUpdates(); });

function renderAll() {
  const s = data.settings;
  setSwitch($('#tTint'), s.tint); setSwitch($('#tSuggest'), s.suggestOnWallpaper);
  setSwitch($('#tHide'), s.hideWindowsTaskbar); setSwitch($('#tStart'), s.startWithWindows); setSwitch($('#t24'), s.clock24);
  $('#winStyle').value = s.winStyle === 'titles' ? 'titles' : 'icons';
  $('#seconds').value = s.showSeconds === null || s.showSeconds === undefined ? 'theme' : s.showSeconds ? 'on' : 'off';
  $('#engine').innerHTML = data.engines.map((e) => `<option value="${e.id}"${e.id === s.searchEngine ? ' selected' : ''}>${window.esc(e.name)}</option>`).join('');
  renderWallpaper(); renderThemes(); renderPins(); renderWeather(); renderDisplays(); renderUpdate();
}
async function reload() {
  data = await window.tb.settings();
  applyTheme(data.settings.theme, state && state.tint);
  renderAll();
}

window.tb.onState((s) => {
  const pinsChanged = state && JSON.stringify(s.pins.map((p) => p.name)) !== JSON.stringify(state.pins.map((p) => p.name));
  const themeChanged = !state || state.theme !== s.theme || !!state.suggestion !== !!s.suggestion;
  state = s;
  applyTheme(s.theme, s.tint);
  if (data) {
    renderUpdate();
    if (themeChanged) { data.settings.theme = s.theme; renderThemes(); renderWallpaper(); }
    if (pinsChanged) reload();
  }
});
window.tb.getState().then((s) => { state = s; return reload(); });
