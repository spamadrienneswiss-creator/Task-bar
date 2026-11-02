// Direct calls into Windows (user32, shell32, kernel32, dwmapi) through koffi.
// Window handles (HWND) are passed around as plain numbers.
// Only loads on Windows; elsewhere load() throws and callers fall back.

const ABM = { NEW: 0, REMOVE: 1, QUERYPOS: 2, SETPOS: 3, GETSTATE: 4, ACTIVATE: 6, WINDOWPOSCHANGED: 9, SETSTATE: 10 };
const ABE = { LEFT: 0, TOP: 1, RIGHT: 2, BOTTOM: 3 };
const ABN = { STATECHANGE: 0, POSCHANGED: 1, FULLSCREENAPP: 2, WINDOWARRANGE: 3 };
const ABS = { AUTOHIDE: 1, ALWAYSONTOP: 2 };
const SW = { MINIMIZE: 6, RESTORE: 9, SHOW: 5 };
const VK = { LWIN: 0x5B, MENU: 0x12, A: 0x41, D: 0x44, N: 0x4E };
const KEYEVENTF_KEYUP = 0x0002;
const GW_OWNER = 4;
const GWL_EXSTYLE = -20;
const WS_EX = { TOOLWINDOW: 0x80, APPWINDOW: 0x40000, NOACTIVATE: 0x08000000 };
const DWMWA_CLOAKED = 14;
const WM_CLOSE = 0x0010;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const SPI_GETDESKWALLPAPER = 0x0073;

let api = null;

function load() {
  if (api) return api;
  if (process.platform !== 'win32') throw new Error('Windows only');
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const shell32 = koffi.load('shell32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  const dwmapi = koffi.load('dwmapi.dll');

  const RECT = koffi.struct('TB_RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
  const APPBARDATA = koffi.struct('TB_APPBARDATA', {
    cbSize: 'uint32', hWnd: 'uintptr_t', uCallbackMessage: 'uint32', uEdge: 'uint32', rc: RECT, lParam: 'intptr_t'
  });
  const EnumProc = koffi.proto('bool __stdcall TB_EnumWindowsProc(uintptr_t hwnd, intptr_t lParam)');

  const f = {
    SHAppBarMessage: shell32.func('uintptr_t __stdcall SHAppBarMessage(uint32 dwMessage, _Inout_ TB_APPBARDATA *pData)'),
    EnumWindows: user32.func('bool __stdcall EnumWindows(TB_EnumWindowsProc *cb, intptr_t lParam)'),
    IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(uintptr_t hWnd)'),
    IsWindow: user32.func('bool __stdcall IsWindow(uintptr_t hWnd)'),
    IsIconic: user32.func('bool __stdcall IsIconic(uintptr_t hWnd)'),
    GetWindowTextLengthW: user32.func('int __stdcall GetWindowTextLengthW(uintptr_t hWnd)'),
    GetWindowTextW: user32.func('int __stdcall GetWindowTextW(uintptr_t hWnd, void *lpString, int nMaxCount)'),
    GetClassNameW: user32.func('int __stdcall GetClassNameW(uintptr_t hWnd, void *lpClassName, int nMaxCount)'),
    GetWindow: user32.func('uintptr_t __stdcall GetWindow(uintptr_t hWnd, uint32 uCmd)'),
    GetWindowLongPtrW: user32.func('intptr_t __stdcall GetWindowLongPtrW(uintptr_t hWnd, int nIndex)'),
    GetForegroundWindow: user32.func('uintptr_t __stdcall GetForegroundWindow()'),
    SetForegroundWindow: user32.func('bool __stdcall SetForegroundWindow(uintptr_t hWnd)'),
    ShowWindow: user32.func('bool __stdcall ShowWindow(uintptr_t hWnd, int nCmdShow)'),
    PostMessageW: user32.func('bool __stdcall PostMessageW(uintptr_t hWnd, uint32 Msg, uintptr_t wParam, intptr_t lParam)'),
    GetWindowThreadProcessId: user32.func('uint32 __stdcall GetWindowThreadProcessId(uintptr_t hWnd, _Out_ uint32 *lpdwProcessId)'),
    GetWindowRect: user32.func('bool __stdcall GetWindowRect(uintptr_t hWnd, _Out_ TB_RECT *lpRect)'),
    MoveWindow: user32.func('bool __stdcall MoveWindow(uintptr_t hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint)'),
    FindWindowW: user32.func('uintptr_t __stdcall FindWindowW(const char16_t *lpClassName, const char16_t *lpWindowName)'),
    keybd_event: user32.func('void __stdcall keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr_t dwExtraInfo)'),
    SystemParametersInfoW: user32.func('bool __stdcall SystemParametersInfoW(uint32 uiAction, uint32 uiParam, void *pvParam, uint32 fWinIni)'),
    OpenProcess: kernel32.func('void * __stdcall OpenProcess(uint32 dwDesiredAccess, bool bInheritHandle, uint32 dwProcessId)'),
    QueryFullProcessImageNameW: kernel32.func('bool __stdcall QueryFullProcessImageNameW(void *hProcess, uint32 dwFlags, void *lpExeName, _Inout_ uint32 *lpdwSize)'),
    CloseHandle: kernel32.func('bool __stdcall CloseHandle(void *hObject)'),
    DwmGetWindowAttribute: dwmapi.func('int32 __stdcall DwmGetWindowAttribute(uintptr_t hwnd, uint32 dwAttribute, void *pvAttribute, uint32 cbAttribute)')
  };

  const wstr = (buf, chars) => buf.toString('utf16le', 0, Math.max(0, chars) * 2);

  function text(hwnd) {
    const n = f.GetWindowTextLengthW(hwnd);
    if (n <= 0) return '';
    const buf = Buffer.alloc((n + 1) * 2);
    return wstr(buf, f.GetWindowTextW(hwnd, buf, n + 1));
  }
  function className(hwnd) {
    const buf = Buffer.alloc(512);
    return wstr(buf, f.GetClassNameW(hwnd, buf, 256));
  }
  function cloaked(hwnd) {
    const buf = Buffer.alloc(4);
    return f.DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, buf, 4) === 0 && buf.readUInt32LE(0) !== 0;
  }
  function processId(hwnd) {
    const pid = [0];
    f.GetWindowThreadProcessId(hwnd, pid);
    return pid[0];
  }
  const exeCache = new Map();
  function processPath(pid) {
    if (!pid) return '';
    if (exeCache.has(pid)) return exeCache.get(pid);
    let out = '';
    const h = f.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
    if (h) {
      try {
        const buf = Buffer.alloc(2048);
        const size = [1024];
        if (f.QueryFullProcessImageNameW(h, 0, buf, size)) out = wstr(buf, size[0]);
      } finally { f.CloseHandle(h); }
    }
    if (exeCache.size > 500) exeCache.clear();
    exeCache.set(pid, out);
    return out;
  }
  function rect(hwnd) {
    const r = {};
    return f.GetWindowRect(hwnd, r) ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
  }

  /** Every top-level window, with what's needed to decide if it belongs on the bar. */
  function listWindows() {
    const out = [];
    f.EnumWindows((hwnd) => {
      try {
        if (!f.IsWindowVisible(hwnd)) return true;
        out.push({
          hwnd,
          title: text(hwnd),
          cls: className(hwnd),
          owner: f.GetWindow(hwnd, GW_OWNER),
          exStyle: Number(f.GetWindowLongPtrW(hwnd, GWL_EXSTYLE)),
          cloaked: cloaked(hwnd),
          pid: processId(hwnd)
        });
      } catch (e) { /* skip this window */ }
      return true;
    }, 0);
    return out;
  }

  function tapKeys(...vks) {
    for (const vk of vks) f.keybd_event(vk, 0, 0, 0);
    for (const vk of vks.slice().reverse()) f.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
  }

  function activate(hwnd) {
    // The bar was just clicked, so it owns the foreground and Windows lets it hand focus over.
    if (f.IsIconic(hwnd)) f.ShowWindow(hwnd, SW.RESTORE);
    return f.SetForegroundWindow(hwnd);
  }

  function appBar(msg, data) {
    const abd = {
      cbSize: koffi.sizeof(APPBARDATA), hWnd: data.hWnd || 0, uCallbackMessage: data.uCallbackMessage || 0,
      uEdge: data.uEdge || 0, rc: data.rc || { left: 0, top: 0, right: 0, bottom: 0 }, lParam: data.lParam || 0
    };
    const ret = f.SHAppBarMessage(msg, abd);
    return { ret: Number(ret), abd };
  }

  function trayWindow() { return f.FindWindowW('Shell_TrayWnd', null); }
  function taskbarAutoHide() {
    const { ret } = appBar(ABM.GETSTATE, { hWnd: trayWindow() });
    return (ret & ABS.AUTOHIDE) !== 0;
  }
  function setTaskbarAutoHide(on) {
    const hWnd = trayWindow();
    if (!hWnd) return false;
    appBar(ABM.SETSTATE, { hWnd, lParam: on ? ABS.AUTOHIDE : 0 });
    return taskbarAutoHide() === !!on;
  }

  function wallpaperPath() {
    const buf = Buffer.alloc(520 * 2);
    if (!f.SystemParametersInfoW(SPI_GETDESKWALLPAPER, 520, buf, 0)) return '';
    const s = buf.toString('utf16le');
    const end = s.indexOf('\u0000');
    return end >= 0 ? s.slice(0, end) : s;
  }

  api = {
    koffi, f, sizes: { APPBARDATA: koffi.sizeof(APPBARDATA), RECT: koffi.sizeof(RECT) },
    text, className, cloaked, processId, processPath, rect, listWindows, activate, tapKeys, appBar,
    trayWindow, taskbarAutoHide, setTaskbarAutoHide, wallpaperPath,
    minimize: (h) => f.ShowWindow(h, SW.MINIMIZE),
    isIconic: (h) => f.IsIconic(h),
    isWindow: (h) => f.IsWindow(h),
    isVisible: (h) => f.IsWindowVisible(h),
    close: (h) => f.PostMessageW(h, WM_CLOSE, 0, 0),
    foreground: () => f.GetForegroundWindow(),
    move: (h, r) => f.MoveWindow(h, r.left, r.top, r.right - r.left, r.bottom - r.top, true)
  };
  return api;
}

module.exports = { load, ABM, ABE, ABN, ABS, SW, VK, WS_EX };
