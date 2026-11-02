// Runs on the Windows build machine before the installer is built: loads every Windows call
// and tries the read-only ones, so a wrong signature fails the build instead of a user's PC.
const win32 = require('../src/win32');
const W = require('../src/windows');

const api = win32.load();
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const ok = (m, v) => console.log('ok  ', m, v === undefined ? '' : JSON.stringify(v));

if (api.sizes.APPBARDATA !== 48) fail(`APPBARDATA is ${api.sizes.APPBARDATA} bytes, expected 48`); else ok('APPBARDATA size', 48);
if (api.sizes.RECT !== 16) fail(`RECT is ${api.sizes.RECT} bytes`); else ok('RECT size', 16);

const all = api.listWindows();
if (!Array.isArray(all)) fail('listWindows did not return a list'); else ok('windows found', all.length);
const shown = all.filter((w) => W.isTaskWindow(w, process.pid));
ok('task windows', shown.map((w) => `${w.title} [${api.processPath(w.pid).split('\\').pop()}]`).slice(0, 8));
for (const w of all.slice(0, 3)) {
  const r = api.rect(w.hwnd);
  if (!r || typeof r.left !== 'number') fail('GetWindowRect gave nothing'); else ok('rect', r);
}
ok('foreground', api.foreground());
const tray = api.trayWindow();
ok('Shell_TrayWnd', tray);
if (tray) ok('taskbar auto-hide is', api.taskbarAutoHide());
const ret = api.appBar(win32.ABM.GETSTATE, { hWnd: tray });
if (typeof ret.ret !== 'number') fail('SHAppBarMessage returned ' + typeof ret.ret); else ok('ABM_GETSTATE', ret.ret);
ok('wallpaper path', api.wallpaperPath());
ok('own process path', api.processPath(process.pid));
if (process.exitCode) console.error('Windows calls check failed.'); else console.log('Windows calls check passed.');
