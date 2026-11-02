// Line icons used across the bar, panel and settings. Each is the inside of a 24×24 SVG.
window.TB_ICONS = (() => {
  const P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    grid: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
    diamond: '<path d="M12 2.5 L21.5 12 L12 21.5 L2.5 12 Z"/><path d="M12 7.5 L16.5 12 L12 16.5 L7.5 12 Z" fill="currentColor" stroke="none"/>',
    hole: '<circle cx="12" cy="12" r="4.8" fill="#000"/><ellipse cx="12" cy="12" rx="10.5" ry="2.2" transform="rotate(-9 12 12)"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="0.8"/>',
    volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    power: '<path d="M12 3v9"/><path d="M6.3 7a8 8 0 1 0 11.4 0"/>',
    windows: '<rect x="3.5" y="3.5" width="7.5" height="7.5"/><rect x="13" y="3.5" width="7.5" height="7.5"/><rect x="3.5" y="13" width="7.5" height="7.5"/><rect x="13" y="13" width="7.5" height="7.5"/>',
    clear: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    partly: '<path d="M8 4v1.5M3.5 8.5H5M4.8 5.3l1 1M11.2 5.3l-1 1"/><path d="M5.5 11a3 3 0 0 1 5.4-2.4"/><path d="M8 19a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.3 1.8A3.2 3.2 0 0 1 18 19z"/>',
    cloud: '<path d="M7 18a4.5 4.5 0 0 1 .6-9 6 6 0 0 1 11.3 2.2A3.5 3.5 0 0 1 18 18z"/>',
    rain: '<path d="M7 14.5a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.3 1.8A3.2 3.2 0 0 1 17 14.5z"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/>',
    snow: '<path d="M7 14.5a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.3 1.8A3.2 3.2 0 0 1 17 14.5z"/><path d="M8 18.5h.01M12 19.5h.01M16 18.5h.01"/>',
    storm: '<path d="M7 14.5a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.3 1.8A3.2 3.2 0 0 1 17 14.5z"/><path d="M12.5 15l-2 3.5h3l-2 3.5"/>',
    fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',
    deck: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
  };
  const svg = (name, size = 20, stroke = 1.8) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.file}</svg>`;
  return { svg, has: (n) => !!P[n] };
})();

// Safe text for innerHTML templates.
window.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Only our own data: URLs from the app are allowed as image sources.
window.safeImg = (u) => (typeof u === 'string' && /^data:image\/(png|jpeg|jpg|webp|bmp|x-icon);base64,[a-z0-9+/=]+$/i.test(u) ? u : '');
