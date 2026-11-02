// The bar itself: start, search box, pinned apps, open windows, weather, tray buttons, clock.
const $ = (s) => document.querySelector(s);
const I = window.TB_ICONS;
let state = null;
let shownTheme = null;

// What each theme calls things, and its start button.
const LOOK = {
  command: { start: () => I.svg('grid', 20, 2), placeholder: 'Search apps, files & settings', label: () => I.svg('search', 16, 2) },
  horizon: { start: () => I.svg('hole', 24, 1.4), placeholder: 'Ask the ship computer…', label: () => I.svg('search', 16, 2) },
  hivis: { start: () => '00', placeholder: 'apps, files, settings', label: () => 'FIND /' },
  overclock: { start: () => 'RUN', placeholder: 'search the net', label: () => '&gt;_' },
  afterhours: { start: () => I.svg('diamond', 20, 1.8), placeholder: 'search the city…', label: () => I.svg('search', 16, 2) },
  moonbase: { start: () => I.svg('diamond', 18, 1.8), placeholder: 'apps, files, settings', label: () => 'QUERY' },
  skydock: { start: () => `${I.svg('globe', 16, 2)}DOCK`, placeholder: 'Search apps, files, settings', label: () => I.svg('search', 16, 2) }
};
const look = () => LOOK[(state && state.theme) || 'command'] || LOOK.command;

function applyTheme() {
  const root = document.documentElement;
  if (shownTheme !== state.theme) {
    shownTheme = state.theme;
    root.dataset.theme = state.theme;
    $('#start').innerHTML = look().start();
    $('#searchLabel').innerHTML = look().label();
    $('#q').placeholder = look().placeholder;
  }
  for (const [v, k] of [['--accent', 'accent'], ['--accent-text', 'accentText'], ['--ink', 'ink']]) {
    if (state.tint) root.style.setProperty(v, state.tint[k]); else root.style.removeProperty(v);
  }
}

function iconHtml(src, name, glyph) {
  const img = window.safeImg(src);
  if (img) return `<img src="${img}" alt="">`;
  if (glyph === 'settings') return I.svg('gear', 22);
  if (glyph === 'web') return I.svg('globe', 22);
  return `<span class="mono-icon">${window.esc((name || '?').trim().charAt(0).toUpperCase())}</span>`;
}

function renderPins() {
  $('#pins').innerHTML = (state.pins || []).map((p) =>
    `<button class="pin${p.running ? ' running' : ''}" data-pin="${p.i}" title="${window.esc(p.name)}" aria-label="${window.esc(p.name)}">${iconHtml(p.icon, p.name, p.glyph)}</button>`
  ).join('');
}

function renderWindows() {
  $('#wins').innerHTML = (state.windows || []).map((w, i) =>
    `<button class="win${w.active ? ' active' : ''}" data-hwnd="${w.hwnd}" title="${window.esc(w.title)}">`
    + `<span class="num">${String(i + 1).padStart(2, '0')}${w.active && state.theme === 'hivis' ? ' / ACTIVE' : ''}</span>`
    + `${iconHtml(w.icon, w.app || w.title)}<span class="title">${window.esc(w.title)}</span></button>`
  ).join('');
}

function renderWeather() {
  const w = state.weather;
  const el = $('#weather');
  if (!w || !Number.isFinite(w.temp)) { el.hidden = true; return; }
  el.hidden = false;
  el.title = `${w.place}: ${w.text}${w.high != null ? ` · H ${w.high}° · L ${w.low}°` : ''}`;
  el.setAttribute('aria-label', `Weather: ${w.temp} degrees, ${w.text}`);
  const sub = state.theme === 'hivis' ? '02 / ATMOS' : state.theme === 'horizon' ? `SURFACE · ${w.text.toUpperCase()}` : state.theme === 'overclock' ? `ATMOS · ${w.text.toUpperCase()}` : w.text;
  el.innerHTML = `<span class="w-icon">${I.svg(I.has(w.icon) ? w.icon : 'cloud', 20, 1.7)}</span>`
    + `<span class="w-text"><span class="w-temp">${w.temp}°</span><span class="w-sub">${window.esc(sub)}</span></span>`;
}

function renderSuggestion() {
  const s = state.suggestion;
  $('#suggest').hidden = !s;
  if (!s) return;
  $('#suggestText').textContent = 'New wallpaper · best match';
  $('#suggestUse').textContent = `Use ${s.name}`;
}

function renderTray() {
  const map = { wifi: 'wifi', volume: 'volume', notifications: 'bell' };
  document.querySelectorAll('.tray-btn').forEach((b) => { b.innerHTML = I.svg(map[b.dataset.tray], 17, 1.8); });
  $('#suggestNo').innerHTML = I.svg('close', 14, 2);
}

function tick() {
  const now = new Date();
  const h24 = state && state.clock24;
  let h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (!h24) h = h % 12 || 12;
  const hh = h24 ? String(h).padStart(2, '0') : (state && state.theme === 'overclock' ? String(h).padStart(2, '0') : String(h));
  const secs = state && state.seconds ? `<span class="sec">:${s}</span>` : '';
  const ap = h24 ? '' : `<span class="ampm">${ampm}</span>`;
  $('#clockTime').innerHTML = `${hh}:${m}${secs}${ap}`;
  const theme = state && state.theme;
  const dd = String(now.getDate()).padStart(2, '0'), mm = String(now.getMonth() + 1).padStart(2, '0');
  const day = now.toLocaleDateString('en-US', { weekday: 'short' });
  const mon = now.toLocaleDateString('en-US', { month: 'short' });
  $('#clockDate').textContent = theme === 'hivis' ? `${dd}.${mm}.${now.getFullYear()}${h24 ? '' : ' / ' + ampm}`
    : theme === 'overclock' ? `${day} · ${mm}.${dd}` : `${day}, ${mon} ${now.getDate()}`;
}

function render() {
  if (!state) return;
  applyTheme();
  renderPins();
  renderWindows();
  renderWeather();
  renderSuggestion();
  tick();
}

// ---- Events ----
document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.id === 'start') return window.tb.openPanel('start');
  if (t.dataset.pin != null) return window.tb.launchPin(Number(t.dataset.pin));
  if (t.dataset.hwnd != null) return window.tb.activate(Number(t.dataset.hwnd));
  if (t.dataset.tray) return window.tb.tray(t.dataset.tray);
  if (t.id === 'clock') return window.tb.tray('clock');
  if (t.id === 'weather') return window.tb.openWeather();
  if (t.id === 'suggestUse') return window.tb.suggestion(true);
  if (t.id === 'suggestNo') return window.tb.suggestion(false);
});
document.addEventListener('auxclick', (e) => {
  const t = e.target.closest('.win');
  if (t && e.button === 1) window.tb.closeWindow(Number(t.dataset.hwnd));
});
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const w = e.target.closest('.win');
  const p = e.target.closest('.pin');
  if (w) window.tb.windowMenu(Number(w.dataset.hwnd));
  else if (p) window.tb.pinMenu(Number(p.dataset.pin));
  else if (!e.target.closest('.search')) window.tb.barMenu();
});

const q = $('#q');
q.addEventListener('focus', () => window.tb.openPanel('search'));
q.addEventListener('input', () => window.tb.query(q.value));
q.addEventListener('blur', () => window.tb.searchBlur());
q.addEventListener('keydown', (e) => {
  if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(e.key)) { e.preventDefault(); window.tb.searchKey(e.shiftKey && e.key === 'Tab' ? 'ArrowUp' : e.key === 'Tab' ? 'ArrowDown' : e.key); }
  if (e.key === 'Escape') { q.value = ''; window.tb.query(''); window.tb.hidePanel(); q.blur(); }
});
// Wheel over the windows strip scrolls it sideways when it overflows.
$('#wins').addEventListener('wheel', (e) => { $('#wins').scrollLeft += e.deltaY; }, { passive: true });

window.tb.onFocusSearch(() => { if (document.activeElement !== q) q.focus(); });
window.tb.onClearSearch(() => { q.value = ''; q.blur(); });
window.tb.onPanelClosed(() => { if (!q.value && document.activeElement === q) q.blur(); });
window.tb.onState((s) => { state = s; render(); });

renderTray();
window.tb.getState().then((s) => { state = s; render(); });
setInterval(tick, 1000);
