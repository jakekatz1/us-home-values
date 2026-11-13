/*
  basemap-street.js: the background map used on the website: OpenFreeMap's "Liberty" street map
  (OpenStreetMap data, free, no key). The area colors are slipped into its layer stack: they tint land,
  parks and buildings, while water, roads and place names stay on top.

  Inside claude.ai outside tiles are blocked, so basemap-local.js is used instead. Both files define:
  MAP_STYLE, BASEMAP_HAS_LABELS, addBase(), applyBase(), loadRoads().
*/

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// the street map has its own place names, so the page's city labels are hidden while it's on
const BASEMAP_HAS_LABELS = true;

let STREET = []; // the street map's own layer ids
let OVER = []; // [layer id, its original line-opacity] for the roads and paths drawn over the colors
let ORIG = null; // the light-mode colors of every street-map layer, saved before the first dark recolor

function addBase() {
  STREET = map
    .getStyle()
    .layers.map((l) => l.id)
    .filter((id) => !['states-fill', 'states-line'].includes(id));

  // two invisible marker layers: area colors are inserted between them, just below the street map's waterways
  const marker = (id) => ({
    id,
    type: 'background',
    layout: { visibility: 'none' },
    paint: { 'background-opacity': 0 },
  });
  const firstSymbol = STREET.find((id) => map.getLayer(id).type === 'symbol');
  map.addLayer(marker('base-over'), map.getLayer('waterway_tunnel') ? 'waterway_tunnel' : firstSymbol);
  map.addLayer(marker('base-anchor'), 'base-over');
  map.moveLayer('states-fill', STREET[1]);

  // buildings take the tint; roads, water and names stay on top
  for (const b of ['building', 'building-3d']) if (map.getLayer(b)) map.moveLayer(b, 'base-anchor');

  // the roads, rails and paths drawn over the colors: the color-strength slider fades them
  const ids = map.getStyle().layers.map((l) => l.id);
  OVER = ids
    .slice(ids.indexOf('base-over') + 1)
    .filter((id) => map.getLayer(id).type === 'line' && !/^(boundary|waterway|water|states)/.test(id))
    .map((id) => [id, map.getPaintProperty(id, 'line-opacity') ?? 1]);
}

// county road files are only needed by the local background
function loadRoads() {}

// ---- dark version of the street map: recolor every layer by what it is, keeping the light colors to switch back
const COLOR_KEYS = {
  background: ['background-color'],
  fill: ['fill-color'],
  line: ['line-color'],
  symbol: ['text-color', 'text-halo-color'],
  'fill-extrusion': ['fill-extrusion-color'],
};

function darkColor(id, type, key) {
  if (type === 'background') return '#141821';
  if (type === 'symbol') return key === 'text-color' ? '#c3c8d2' : '#0f131a';
  if (type === 'fill-extrusion' || /building/.test(id)) return '#272c37';
  if (type === 'fill') {
    if (/water/.test(id)) return '#15263c';
    if (/park|wood|grass|forest|wetland|landcover|nature|pitch|golf|cemetery/.test(id)) return '#19221f';
    if (/aeroway/.test(id)) return '#232733';
    return '#1a1e26';
  }
  // lines
  if (/water|river/.test(id)) return '#24446c';
  if (/casing/.test(id)) return '#0d1016';
  if (/boundary/.test(id)) return '#6a7080';
  if (/rail|transit/.test(id)) return '#3b404b';
  if (/motorway|trunk/.test(id)) return '#7a6644';
  if (/primary|secondary|tertiary/.test(id)) return '#525867';
  return '#3d4350';
}

function paintMode() {
  if (!ORIG) {
    ORIG = {};
    for (const id of STREET) {
      const layer = map.getLayer(id);
      if (!layer) continue;
      for (const key of COLOR_KEYS[layer.type] || []) ORIG[id + '|' + key] = map.getPaintProperty(id, key);
    }
  }
  for (const id of STREET) {
    const layer = map.getLayer(id);
    if (!layer || id === 'background') continue;
    for (const key of COLOR_KEYS[layer.type] || []) {
      // an undefined original resets the property to the style's default
      map.setPaintProperty(id, key, DARK ? darkColor(id, layer.type, key) : ORIG[id + '|' + key]);
    }
  }
}

// multiply a layer's line-opacity (a number, zoom stops, or an interpolate/step expression) by k
function scaleOpacity(o, k) {
  const times = (v) => (typeof v === 'number' ? v * k : k);
  if (typeof o === 'number') return o * k;
  if (o && o.stops) return { ...o, stops: o.stops.map(([z, v]) => [z, times(v)]) };
  if (Array.isArray(o) && o[0].startsWith('interpolate'))
    return o.map((v, i) => (i >= 4 && i % 2 === 0 ? times(v) : v));
  if (Array.isArray(o) && o[0] === 'step') return o.map((v, i) => (i >= 2 && i % 2 === 0 ? times(v) : v));
  return k;
}

// after any display change: show or hide the street map, recolor it for light/dark, fade roads with color strength
function applyBase() {
  const on = baseOn();
  const cityNames = document.getElementById('tCity').checked;
  for (const id of STREET) {
    if (!map.getLayer(id)) continue;
    if (id === 'background') {
      map.setPaintProperty(id, 'background-color', on ? (DARK ? '#141821' : '#f8f4f0') : DARK ? '#11151d' : '#e8ebf0');
      continue;
    }
    const isPlaceName = id.startsWith('label_');
    map.setLayoutProperty(id, 'visibility', on && (cityNames || !isPlaceName) ? 'visible' : 'none');
  }
  if (map.getLayer('states-fill')) {
    map.setLayoutProperty('states-fill', 'visibility', on ? 'none' : 'visible');
    map.setPaintProperty('states-fill', 'fill-color', DARK ? '#181d28' : '#ffffff');
  }
  if (on || ORIG) paintMode();
  const k = roadOpacity();
  for (const [id, o] of OVER) if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', scaleOpacity(o, k));

  applyAreaLayerStyle();
  syncCities();
}
