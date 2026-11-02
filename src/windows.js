// Pure helpers for the open-windows list and the bar's position. No Windows calls here.
const { WS_EX } = require('./win32');

const SHELL_CLASSES = new Set([
  'Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'Windows.UI.Core.CoreWindow',
  'NotifyIconOverflowWindow', 'TopLevelWindowForOverflowXamlIsland', 'XamlExplorerHostIslandWindow',
  'ForegroundStaging', 'MultitaskingViewFrame', 'TaskListThumbnailWnd', 'Xaml_WindowedPopupClass'
]);

/** Would this window show up in Alt+Tab? Same rule here. */
function isTaskWindow(w, ownPid) {
  if (!w || !w.title || !w.title.trim()) return false;
  if (w.cloaked) return false;
  if (ownPid && w.pid === ownPid) return false;
  if (SHELL_CLASSES.has(w.cls)) return false;
  const ex = Number(w.exStyle) || 0;
  const appWindow = (ex & WS_EX.APPWINDOW) !== 0;
  if (w.owner && !appWindow) return false;
  if ((ex & WS_EX.TOOLWINDOW) && !appWindow) return false;
  if ((ex & WS_EX.NOACTIVATE) && !appWindow) return false;
  return true;
}

/** The strip along the bottom of a monitor (physical pixels) that the bar asks Windows for. */
function barRect(monitor, heightPx) {
  const h = Math.max(1, Math.round(heightPx));
  return { left: monitor.x, right: monitor.x + monitor.width, top: monitor.y + monitor.height - h, bottom: monitor.y + monitor.height };
}

/** After Windows answers a position request, keep the bar's height and its bottom edge. */
function fitRect(answer, heightPx) {
  const h = Math.max(1, Math.round(heightPx));
  return { left: answer.left, right: answer.right, bottom: answer.bottom, top: answer.bottom - h };
}

/** Is a window covering the whole monitor (a game, a full-screen video)? */
function coversMonitor(r, monitor) {
  if (!r) return false;
  return r.left <= monitor.x && r.top <= monitor.y &&
    r.right >= monitor.x + monitor.width && r.bottom >= monitor.y + monitor.height;
}

/** Picks the display for the bar: the saved one, else the first one that isn't the main display. */
function pickDisplay(displays, primaryId, savedId) {
  if (!displays || !displays.length) return null;
  const saved = displays.find((d) => String(d.id) === String(savedId));
  if (saved) return saved;
  const side = displays.filter((d) => d.id !== primaryId).sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  return side[0] || displays.find((d) => d.id === primaryId) || displays[0];
}

/** Short app name from an exe path: "C:\\...\\Code.exe" -> "Code". */
function exeName(p) {
  const base = String(p || '').split(/[\\/]/).pop() || '';
  return base.replace(/\.exe$/i, '');
}

module.exports = { isTaskWindow, barRect, fitRect, coversMonitor, pickDisplay, exeName, SHELL_CLASSES };
