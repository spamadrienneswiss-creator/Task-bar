// Unit tests for the parts that don't need Windows.  node test/run-tests.js
const assert = require('assert');
const color = require('../src/color');
const search = require('../src/search');
const W = require('../src/windows');
const weather = require('../src/weather');
const { merge, DEFAULTS } = require('../src/store');
const { THEMES, byId } = require('../shared/themes');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n    ', e.message); }
}
const P = (arr) => arr.map(([hex, weight]) => ({ hex, rgb: color.hexToRgb(hex), weight }));

console.log('Themes');
test('seven themes, unique ids, every color a hex', () => {
  assert.strictEqual(THEMES.length, 7);
  assert.strictEqual(new Set(THEMES.map((t) => t.id)).size, 7);
  for (const t of THEMES) for (const k of ['desk', 'bar', 'accent', 'accentText', 'text', 'dim', 'ink']) assert.match(t[k], /^#[0-9A-F]{6}$/i, `${t.id}.${k}`);
});
test('text on every bar is readable', () => {
  for (const t of THEMES) {
    assert.ok(color.contrast(color.hexToRgb(t.text), color.hexToRgb(t.bar)) >= 7, `${t.id} text`);
    assert.ok(color.contrast(color.hexToRgb(t.dim), color.hexToRgb(t.bar)) >= 4.5, `${t.id} labels`);
    assert.ok(color.contrast(color.hexToRgb(t.accentText), color.hexToRgb(t.bar)) >= 4.5, `${t.id} accent text`);
  }
});
test('unknown theme falls back to Command', () => assert.strictEqual(byId('nope').id, 'command'));

console.log('Wallpaper match');
const pal = {
  bluesky: P([['#4A8FD6', 0.4], ['#9CC8F0', 0.3], ['#F4F7FA', 0.2], ['#2B5E9E', 0.1]]),
  neon: P([['#120822', 0.5], ['#FF3FC8', 0.15], ['#38E1F5', 0.1], ['#3A1F5C', 0.25]]),
  moon: P([['#9A9FA6', 0.5], ['#6E747C', 0.3], ['#D7DADF', 0.2]]),
  acid: P([['#0C0C0C', 0.6], ['#B8EE2A', 0.25], ['#EDEDE6', 0.15]]),
  yellow: P([['#0A0B0E', 0.55], ['#EADF14', 0.2], ['#24C8D0', 0.1], ['#2A2D33', 0.15]]),
  warm: P([['#060505', 0.6], ['#C98446', 0.2], ['#F6D7AE', 0.08], ['#2A1D12', 0.12]])
};
const top = (p) => color.rankThemes(p)[0].id;
test('blue sky -> Skydock', () => assert.strictEqual(top(pal.bluesky), 'skydock'));
test('neon night city -> Afterhours', () => assert.strictEqual(top(pal.neon), 'afterhours'));
test('grey moon -> Moonbase', () => assert.strictEqual(top(pal.moon), 'moonbase'));
test('acid green on black -> Hi-Vis', () => assert.strictEqual(top(pal.acid), 'hivis'));
test('yellow + cyan street -> Overclock', () => assert.strictEqual(top(pal.yellow), 'overclock'));
test('warm light on black -> Horizon', () => assert.strictEqual(top(pal.warm), 'horizon'));
test('palette from raw pixels (BGRA) finds both colors', () => {
  const px = [];
  for (let i = 0; i < 300; i++) px.push(255, 0, 0, 255);   // blue in BGRA
  for (let i = 0; i < 100; i++) px.push(0, 0, 255, 255);   // red in BGRA
  const p = color.extractPalette(Uint8Array.from(px), { bgra: true, k: 4 });
  assert.strictEqual(p[0].hex, '#0000FF');
  assert.ok(p.some((c) => c.hex === '#FF0000'));
  assert.ok(Math.abs(p[0].weight - 0.75) < 0.01);
});
test('greys have no vivid color', () => assert.strictEqual(color.vividColor(pal.moon), null));
test('tint stays readable on dark and light bars', () => {
  for (const t of THEMES) for (const hex of ['#4A8FD6', '#E07A3A', '#3A1F5C', '#F4F070']) {
    const tint = color.tintFor(t, hex);
    assert.ok(color.contrast(color.hexToRgb(tint.accentText), color.hexToRgb(t.bar)) >= 4.4, `${t.id} ${hex} -> ${tint.accentText}`);
    assert.ok(color.contrast(color.hexToRgb(tint.ink), color.hexToRgb(tint.accent)) >= 3, `${t.id} ink on ${tint.accent}`);
  }
});

console.log('Search');
const apps = [{ name: 'Visual Studio Code', appId: 'Microsoft.VisualStudioCode' }, { name: 'Notepad', appId: 'x' }, { name: 'Spotify', appId: 'y' }, { name: 'Adobe Photoshop 2026', appId: 'z' }, { name: 'Steam', path: 'C:\\s.lnk' }];
test('exact and prefix beat contains', () => {
  assert.ok(search.scoreText('Notepad', 'notepad') > search.scoreText('Notepad++', 'notepad'));
  assert.ok(search.scoreText('Spotify', 'spo') > search.scoreText('Esports', 'spo'));
});
test('initials find apps', () => assert.strictEqual(search.rankApps(apps, 'vsc')[0].name, 'Visual Studio Code'));
test('letters in order find apps', () => assert.strictEqual(search.rankApps(apps, 'phtsp')[0].name, 'Adobe Photoshop 2026'));
test('settings by keyword', () => {
  assert.strictEqual(search.rankSettings('wallpaper')[0].title, 'Background');
  assert.strictEqual(search.rankSettings('display')[0].target, 'ms-settings:display');
});
test('results: best match first, web last, nothing twice', () => {
  const r = search.buildResults({ query: 'steam', apps, files: [{ name: 'steam notes.txt', path: 'C:\\n.txt', folder: 'C:\\' }] });
  assert.strictEqual(r.groups[0].name, 'Best match');
  assert.strictEqual(r.groups[0].items[0].title, 'Steam');
  assert.deepStrictEqual(r.groups[0].items[0].action, { kind: 'path', value: 'C:\\s.lnk' });
  assert.strictEqual(r.groups[r.groups.length - 1].name, 'Web');
  const titles = r.groups.flatMap((g) => g.items.map((i) => i.title));
  assert.strictEqual(new Set(titles).size, titles.length);
});
test('no match: web search is the best match', () => {
  const r = search.buildResults({ query: 'zzqx', apps, engine: 'duckduckgo' });
  assert.strictEqual(r.groups.length, 1);
  assert.match(r.groups[0].items[0].action.value, /^https:\/\/duckduckgo\.com\/\?q=zzqx$/);
});
test('empty query gives nothing', () => assert.deepStrictEqual(search.buildResults({ query: '  ', apps }).groups, []));
test('Start menu IDs resolve to real paths', () => {
  const env = { SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files' };
  assert.strictEqual(search.resolveAppIdPath('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\notepad.exe', env), 'C:\\Windows\\System32\\notepad.exe');
  assert.strictEqual(search.resolveAppIdPath('{6D809377-6AF0-444B-8957-A3773F02200E}\\App\\a.exe', env), 'C:\\Program Files\\App\\a.exe');
  assert.strictEqual(search.resolveAppIdPath('Microsoft.WindowsCalculator_8wekyb3d8bbwe!App', env), null);
});
test('index term strips query syntax', () => assert.strictEqual(search.indexTerm(`budget" OR '1'='1 %*`), 'budget OR 1 = 1'));

console.log('Windows list + position');
const base = { title: 'Doc - Word', cls: 'OpusApp', owner: 0, exStyle: 0, cloaked: false, pid: 10 };
test('normal windows show', () => assert.ok(W.isTaskWindow(base, 1)));
test('hidden kinds are skipped', () => {
  assert.ok(!W.isTaskWindow({ ...base, title: '' }, 1));
  assert.ok(!W.isTaskWindow({ ...base, cloaked: true }, 1));
  assert.ok(!W.isTaskWindow({ ...base, pid: 1 }, 1));
  assert.ok(!W.isTaskWindow({ ...base, cls: 'Progman' }, 1));
  assert.ok(!W.isTaskWindow({ ...base, owner: 123 }, 1));
  assert.ok(!W.isTaskWindow({ ...base, exStyle: 0x80 }, 1));
});
test('app windows show even when owned or tool-style', () => {
  assert.ok(W.isTaskWindow({ ...base, owner: 123, exStyle: 0x40000 }, 1));
  assert.ok(W.isTaskWindow({ ...base, exStyle: 0x80 | 0x40000 }, 1));
});
test('bar strip sits on the monitor bottom', () => {
  const mon = { x: 2560, y: 0, width: 1920, height: 1080 };
  assert.deepStrictEqual(W.barRect(mon, 84), { left: 2560, right: 4480, top: 996, bottom: 1080 });
  assert.deepStrictEqual(W.fitRect({ left: 2560, right: 4480, top: 0, bottom: 1040 }, 84), { left: 2560, right: 4480, top: 956, bottom: 1040 });
});
test('full-screen detection', () => {
  const mon = { x: 0, y: 0, width: 100, height: 100 };
  assert.ok(W.coversMonitor({ left: 0, top: 0, right: 100, bottom: 100 }, mon));
  assert.ok(W.coversMonitor({ left: -8, top: -8, right: 108, bottom: 108 }, mon));
  assert.ok(!W.coversMonitor({ left: 0, top: 0, right: 100, bottom: 60 }, mon));
});
test('display pick: saved, else a side monitor, else the main one', () => {
  const ds = [{ id: 1, bounds: { x: 0, y: 0 } }, { id: 3, bounds: { x: 3840, y: 0 } }, { id: 2, bounds: { x: 1920, y: 0 } }];
  assert.strictEqual(W.pickDisplay(ds, 1, '3').id, 3);
  assert.strictEqual(W.pickDisplay(ds, 1, null).id, 2);
  assert.strictEqual(W.pickDisplay([ds[0]], 1, '9').id, 1);
});
test('exe name', () => assert.strictEqual(W.exeName('C:\\Program Files\\Code\\Code.exe'), 'Code'));

console.log('Weather + settings');
test('weather codes', () => {
  assert.deepStrictEqual(weather.describe(0, true), { text: 'Clear', icon: 'clear' });
  assert.deepStrictEqual(weather.describe(0, false), { text: 'Clear', icon: 'moon' });
  assert.strictEqual(weather.describe(63).icon, 'rain');
  assert.strictEqual(weather.describe(999).text, 'Weather');
});
test('forecast URL uses °F by default', () => {
  assert.match(weather.forecastUrl({ lat: 34.05, lon: -118.24 }), /temperature_unit=fahrenheit/);
  assert.doesNotMatch(weather.forecastUrl({ lat: 1, lon: 1, unit: 'C' }), /fahrenheit/);
});
test('settings merge keeps nested defaults', () => {
  const m = merge(DEFAULTS, { weather: { unit: 'C' }, pins: [{ name: 'x' }] });
  assert.strictEqual(m.weather.unit, 'C');
  assert.strictEqual(m.weather.name, 'Los Angeles');
  assert.strictEqual(m.pins.length, 1);
  assert.strictEqual(m.theme, 'command');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
