// The seven looks, shared by the main process (wallpaper matching) and the windows (picker cards).
// Colors come from the Command Deck design board kits.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TB_THEMES = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const THEMES = [
    {
      id: 'command', name: 'Command', from: 'The original Command Deck look',
      light: false, seconds: false,
      desk: '#0B0E13', bar: '#10151C', raised: '#1E2632', line: '#2A3340',
      text: '#E6EDF3', dim: '#9AA4AF', accent: '#F2A541', accentText: '#F2A541', ink: '#0B0E13', hot: '#FF5A4E',
      match: [['#0B0E13', 0.35], ['#F2A541', 0.4], ['#1E2632', 0.25]]
    },
    {
      id: 'horizon', name: 'Horizon', from: 'Interstellar · warm light on deep black',
      light: false, seconds: false,
      desk: '#050505', bar: '#0E0C0A', raised: '#1C1712', line: '#3A2E22',
      text: '#EDE3D6', dim: '#A39482', accent: '#F2C38B', accentText: '#F2C38B', ink: '#120D08', hot: '#FF8A5C',
      match: [['#050505', 0.35], ['#F2C38B', 0.3], ['#D9894A', 0.35]]
    },
    {
      id: 'hivis', name: 'Hi-Vis', from: 'Marathon · spec sheet in negative',
      light: false, seconds: false,
      desk: '#0A0A0B', bar: '#141415', raised: '#1C1C1E', line: '#55554F',
      text: '#F2F2EC', dim: '#A3A39C', accent: '#C6F432', accentText: '#C6F432', ink: '#0B0B0C', hot: '#FF3D6E',
      match: [['#0A0A0B', 0.3], ['#C6F432', 0.45], ['#F2F2EC', 0.25]]
    },
    {
      id: 'overclock', name: 'Overclock', from: 'Cyberpunk · street-tech rig',
      light: false, seconds: true,
      desk: '#08090B', bar: '#0E0F12', raised: '#181A1F', line: '#3A3E46',
      text: '#ECEDEE', dim: '#8E929B', accent: '#F3E600', accentText: '#F3E600', ink: '#0A0A0A', hot: '#FF2E4D', ice: '#2DE2E6',
      match: [['#08090B', 0.3], ['#F3E600', 0.45], ['#2DE2E6', 0.25]]
    },
    {
      id: 'afterhours', name: 'Afterhours', from: 'Cyberpunk · neon nights',
      light: false, seconds: false,
      desk: '#150A26', bar: '#1C1030', raised: '#2A1A44', line: '#4A3A66',
      text: '#EDE6F7', dim: '#A99BC4', accent: '#46F0FF', accentText: '#46F0FF', ink: '#0B0716', hot: '#FF5FD7', accent2: '#FF5FD7',
      match: [['#150A26', 0.35], ['#FF5FD7', 0.35], ['#46F0FF', 0.3]]
    },
    {
      id: 'moonbase', name: "Moonbase '79", from: 'Station issue, 1979',
      light: true, seconds: true,
      desk: '#8D939A', bar: '#E4E6E9', raised: '#F7F8F9', line: '#CDD1D6',
      text: '#1E2227', dim: '#5A616B', accent: '#F05A1A', accentText: '#B13A0A', ink: '#FFFFFF', hot: '#B13A0A',
      match: [['#9EA4AB', 0.45], ['#E4E6E9', 0.25], ['#F05A1A', 0.3]]
    },
    {
      id: 'skydock', name: 'Skydock', from: 'Day shift on an orbital dock',
      light: true, seconds: true,
      desk: '#79AEE0', bar: '#F2F4F7', raised: '#FFFFFF', line: '#BCC5CF',
      text: '#13233D', dim: '#45556E', accent: '#1FB8F0', accentText: '#0A6E9C', ink: '#111A2B', hot: '#FF4F86', sign: '#111A2B', signText: '#7FDFFF',
      match: [['#79AEE0', 0.4], ['#1E4C8F', 0.3], ['#F2F4F7', 0.3]]
    }
  ];
  const byId = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
  return { THEMES, byId };
});
