/*
  display.js: the display switches in the panel that the background maps and color layers both read:
  background map on/off, color strength, light/dark style, area borders.
*/

const baseOn = () => document.getElementById('tBase').checked;
const bordersOn = () => document.getElementById('tBorders').checked;

// how solid the area colors are: the Color strength slider with the background map on, nearly solid without it
const colorOpacity = () => (baseOn() ? +document.getElementById('opac').value / 100 : 0.92);

// roads drawn over the colors fade as the colors get stronger (strong colors: faint roads; weak colors: full roads)
const roadOpacity = () => {
  const t = Math.max(0, (colorOpacity() - 0.15) / 0.85);
  return Math.max(0.1, 1 - 1.05 * t ** 0.8);
};

// ---- light or dark map, remembered in this browser
let DARK = false;
try {
  DARK = localStorage.getItem('usmap-mode') === 'dark';
} catch (e) {}

function setMode(dark) {
  DARK = dark;
  try {
    localStorage.setItem('usmap-mode', dark ? 'dark' : 'light');
  } catch (e) {}
  document.getElementById('mLight').setAttribute('aria-pressed', String(!dark));
  document.getElementById('mDark').setAttribute('aria-pressed', String(dark));
  if (map.loaded() || map.getLayer('states-line')) applyBase();
}

// ---- outlines around every area: off by default (hovering still outlines the area under the pointer)
function applyBorders() {
  const visible = VIEW !== 'race' && bordersOn() ? 'visible' : 'none';
  for (const id of LAYERS) if (map.getLayer(id + '-line')) map.setLayoutProperty(id + '-line', 'visibility', visible);
}

// ---- after a display change: re-apply opacities and colors that every area layer shares
function applyAreaLayerStyle() {
  for (const id of LAYERS) {
    if (map.getLayer(id + '-fill')) map.setPaintProperty(id + '-fill', 'fill-opacity', fillOpacity());
    if (map.getLayer(id + '-line')) map.setPaintProperty(id + '-line', 'line-opacity', lineOpacity());
    if (map.getLayer(id + '-hatch'))
      map.setPaintProperty(id + '-hatch', 'fill-opacity', Math.min(1, colorOpacity() + 0.1));
    if (map.getLayer(id + '-hover')) map.setPaintProperty(id + '-hover', 'line-color', DARK ? '#ffffff' : '#1b1f27');
  }
  if (map.getLayer('states-line')) map.setPaintProperty('states-line', 'line-color', DARK ? '#9aa1b0' : '#6f7686');
  document.getElementById('opacRow').hidden = !baseOn();
}
