// The small, fixed set of things the bar, panel and settings pages may ask the app to do.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const fn = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('tb', {
  // shared
  getState: () => ipcRenderer.invoke('state:get'),
  onState: on('state'),
  openSettings: () => ipcRenderer.send('settings:open'),
  // bar
  activate: (hwnd) => ipcRenderer.send('win:activate', hwnd),
  windowMenu: (hwnd) => ipcRenderer.send('win:menu', hwnd),
  closeWindow: (hwnd) => ipcRenderer.send('win:close', hwnd),
  launchPin: (i) => ipcRenderer.send('pin:launch', i),
  pinMenu: (i) => ipcRenderer.send('pin:menu', i),
  barMenu: () => ipcRenderer.send('bar:menu'),
  tray: (which) => ipcRenderer.send('tray', which),
  openPanel: (mode) => ipcRenderer.send('panel:open', mode),
  hidePanel: () => ipcRenderer.send('panel:hide'),
  query: (text) => ipcRenderer.send('search:query', text),
  searchKey: (key) => ipcRenderer.send('search:key', key),
  searchBlur: () => ipcRenderer.send('search:blur'),
  suggestion: (accept) => ipcRenderer.send('suggest', !!accept),
  openWeather: () => ipcRenderer.send('weather:open'),
  onFocusSearch: on('bar:focusSearch'),
  onClearSearch: on('bar:clearSearch'),
  onPanelClosed: on('bar:panelClosed'),
  // panel
  run: (action) => ipcRenderer.send('panel:run', action),
  onMode: on('panel:mode'),
  onApps: on('panel:apps'),
  onResults: on('panel:results'),
  onKey: on('panel:key'),
  // settings
  settings: () => ipcRenderer.invoke('settings:get'),
  set: (patch) => ipcRenderer.send('settings:set', patch),
  pickApp: () => ipcRenderer.invoke('settings:pickApp'),
  removePin: (i) => ipcRenderer.send('settings:removePin', i),
  movePin: (i, d) => ipcRenderer.send('settings:movePin', i, d),
  searchPlace: (q) => ipcRenderer.invoke('settings:searchPlace', q),
  setPlace: (p) => ipcRenderer.send('settings:setPlace', p),
  setUnit: (u) => ipcRenderer.send('settings:setUnit', u),
  rescanWallpaper: () => ipcRenderer.invoke('settings:rescanWallpaper'),
  checkUpdates: () => ipcRenderer.send('settings:checkUpdates'),
  installUpdate: () => ipcRenderer.send('settings:installUpdate')
});
