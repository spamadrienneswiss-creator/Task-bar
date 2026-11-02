// The flyout above the bar: all apps when the search box is empty, grouped results while typing.
// Typing happens in the bar's search box; arrow keys and Enter arrive here as messages.
const $ = (s) => document.querySelector(s);
const I = window.TB_ICONS;
let state = null;
let apps = [];
let results = { query: '', groups: [] };
let items = []; // what arrow keys move through: { el, run }
let sel = 0;

function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = state.theme;
  for (const [v, k] of [['--accent', 'accent'], ['--accent-text', 'accentText'], ['--ink', 'ink']]) {
    if (state.tint) root.style.setProperty(v, state.tint[k]); else root.style.removeProperty(v);
  }
}

const TYPE_ICON = { setting: 'gear', file: 'file', web: 'globe', app: 'grid' };
function icon(src, name, type, glyph) {
  const img = window.safeImg(src);
  if (img) return `<img src="${img}" alt="">`;
  if (glyph === 'settings') return I.svg('gear', 22);
  if (glyph === 'web') return I.svg('globe', 22);
  if (type && type !== 'app') return I.svg(TYPE_ICON[type] || 'file', 20);
  return `<span class="mono-icon">${window.esc((name || '?').trim().charAt(0).toUpperCase())}</span>`;
}

function renderStart() {
  $('#title').textContent = state && state.theme === 'overclock' ? 'APPS // ALL' : 'All apps';
  $('#hint').textContent = 'Type to search apps, files and settings';
  const pins = (state && state.pins) || [];
  let html = '';
  if (pins.length) {
    html += '<div class="group">Pinned</div><div class="pins">'
      + pins.map((p) => `<button class="tile" data-pin="${p.i}">`
        + `<span class="ic">${icon(p.icon, p.name, null, p.glyph)}</span><span class="t">${window.esc(p.name)}</span></button>`).join('')
      + '</div>';
  }
  html += '<div class="group">All apps</div><div class="apps">';
  if (!apps.length) html += '<div class="empty">Loading your apps…</div>';
  let letter = '';
  for (const a of apps) {
    const l = /^[a-z]/i.test(a.name) ? a.name[0].toUpperCase() : '#';
    if (l !== letter) { letter = l; html += `<div class="letter">${letter}</div>`; }
    html += `<button class="row" data-app="${window.esc(a.name)}"><span class="ic">${icon(a.icon, a.name, 'app')}</span>`
      + `<span class="tx"><span class="t">${window.esc(a.name)}</span></span><span class="go">OPEN ↵</span></button>`;
  }
  html += '</div>';
  $('#body').innerHTML = html;
  collect();
}

let flat = [];
function renderResults() {
  $('#title').textContent = 'Search';
  $('#hint').textContent = 'Enter opens · ↑ ↓ to choose';
  flat = [];
  let html = '';
  for (const g of results.groups) {
    html += `<div class="group">${window.esc(g.name)}</div>`;
    for (const it of g.items) {
      const k = flat.push(it) - 1;
      html += `<button class="row${g.name === 'Best match' ? ' best' : ''}" data-res="${k}">`
        + `<span class="ic">${icon(it.icon, it.title, it.type)}</span>`
        + `<span class="tx"><span class="t">${window.esc(it.title)}</span><span class="s">${window.esc(it.sub || '')}</span></span>`
        + '<span class="go">OPEN ↵</span></button>';
    }
  }
  $('#body').innerHTML = html || `<div class="empty">Nothing found for “${window.esc(results.query)}”</div>`;
  collect();
}

function collect() {
  items = [...document.querySelectorAll('#body [data-pin], #body [data-app], #body [data-res]')];
  sel = 0;
  mark();
}
function mark() {
  items.forEach((el, i) => el.classList.toggle('sel', i === sel));
  if (items[sel]) items[sel].scrollIntoView({ block: 'nearest' });
}
function run(el) {
  if (!el) return;
  if (el.dataset.pin != null) { window.tb.launchPin(Number(el.dataset.pin)); window.tb.hidePanel(); return; }
  if (el.dataset.app != null) return window.tb.run({ kind: 'app', value: el.dataset.app });
  if (el.dataset.res != null) { const it = flat[Number(el.dataset.res)]; if (it) window.tb.run(it.action); }
}

function render() { if (results.query) renderResults(); else renderStart(); }

document.addEventListener('click', (e) => { const el = e.target.closest('[data-pin], [data-app], [data-res]'); if (el) run(el); });
document.addEventListener('mousemove', (e) => {
  const el = e.target.closest('[data-pin], [data-app], [data-res]');
  const i = items.indexOf(el);
  if (i >= 0 && i !== sel) { sel = i; items.forEach((x, k) => x.classList.toggle('sel', k === sel)); }
});
$('#winStart').addEventListener('click', () => window.tb.run({ kind: 'internal', value: 'windows-start' }));
$('#openSettings').addEventListener('click', () => window.tb.run({ kind: 'internal', value: 'settings' }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.tb.hidePanel(); });

window.tb.onKey((key) => {
  if (!items.length) return;
  if (key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); mark(); }
  if (key === 'ArrowUp') { sel = Math.max(0, sel - 1); mark(); }
  if (key === 'Enter') run(items[sel]);
});
window.tb.onMode(() => { results = { query: '', groups: [] }; render(); });
window.tb.onApps((list) => { apps = list || []; if (!results.query) renderStart(); });
window.tb.onResults((r) => { results = r || { query: '', groups: [] }; render(); });
let pinsSig = '';
window.tb.onState((s) => {
  const themeChanged = !state || s.theme !== state.theme;
  const sig = JSON.stringify((s.pins || []).map((p) => [p.name, !!p.icon, p.glyph]));
  const pinsChanged = sig !== pinsSig;
  pinsSig = sig; state = s; applyTheme();
  // The state arrives often (windows open and close); only redraw when something here changed.
  if (themeChanged || (pinsChanged && !results.query)) render();
});

$('#winStart').innerHTML = `${I.svg('windows', 16)}Windows Start`;
$('#openSettings').innerHTML = `${I.svg('gear', 16)}Task Bar settings`;
window.tb.getState().then((s) => { state = s; applyTheme(); render(); });
