/*
  map.js: the map itself and the colored areas on it.

  How areas are drawn: each area set has
    - one source of simplified national shapes ("<set>-c"), drawn below zoom FINEZ, and
    - one source per state of detailed shapes ("<set>-s-<state>"), loaded as you zoom in on that state.
  Every source gets four layers: -fill (the color), -hatch (stripes for Census rents), -line (optional borders)
  and -hover (the outline under the pointer).

  Colors are not baked into the shapes. Each area gets a "feature state" k (its position on the color ramp,
  0..1, or -1 for no data), and the paint expression below turns k into a color. So a new color scale only
  updates k for the areas whose color changed (colors.js), and no shapes are rebuilt.
*/

const map = new maplibregl.Map({
  container: 'map',
  style: MAP_STYLE,
  attributionControl: false,
  dragRotate: false,
  pitchWithRotate: false,
  minZoom: 2.5,
  maxZoom: 17,
  bounds: [
    [-125, 24.3],
    [-66.5, 49.5],
  ],
  fitBoundsOptions: {
    padding: {
      left: innerWidth > 720 ? 390 : 20,
      right: 20,
      top: 20,
      bottom: innerWidth > 720 ? 20 : innerHeight * 0.46,
    },
  },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
map.addControl(
  new maplibregl.AttributionControl({
    compact: true,
    customAttribution:
      'Zillow Research (ZHVI, ZORI) · US Census Bureau (ACS 2020–2024, 2020 Census) · FBI Crime Data Explorer',
  }),
  'bottom-right'
);

// the fill color from the feature state k
// prettier-ignore
const FILL = ['case', ['<', ['coalesce', ['feature-state', 'k'], -1], 0], NO_DATA,
  ['interpolate', ['linear'], ['feature-state', 'k'], ...RAMP.flatMap((c, i) => [(i + 0.5) / RAMP.length, c])]];

// rent from the Census (not Zillow) is drawn with stripes; this makes the stripe image
function hatchImage() {
  const s = 8,
    canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const g = canvas.getContext('2d');
  g.strokeStyle = 'rgba(17,21,29,0.75)';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(-2, s + 2);
  g.lineTo(s + 2, -2);
  g.moveTo(-2, 2);
  g.lineTo(2, -2);
  g.moveTo(s - 2, s + 2);
  g.lineTo(s + 2, s - 2);
  g.stroke();
  return g.getImageData(0, 0, s, s);
}
const hatchOn = () =>
  VIEW === 'price' && DS === 'zip' && measure === 'rent' && document.getElementById('tCensus').checked;
function applyHatch() {
  for (const id of LAYERS)
    map.getLayer(id + '-hatch') && map.setLayoutProperty(id + '-hatch', 'visibility', hatchOn() ? 'visible' : 'none');
}

// the four layers for one source of area shapes
function addAreaLayerGroup(source, id, minzoom, maxzoom, filter) {
  const zoomRange = {};
  if (minzoom != null) zoomRange.minzoom = minzoom;
  if (maxzoom != null) zoomRange.maxzoom = maxzoom;
  const withFilter = (f) => {
    const combined = filter ? (f ? ['all', filter, f] : filter) : f;
    return combined ? { filter: combined } : {};
  };
  const shown = (on) => ({ visibility: on ? 'visible' : 'none' });

  map.addLayer(
    {
      source,
      ...zoomRange,
      id: id + '-fill',
      type: 'fill',
      ...withFilter(null),
      layout: shown(VIEW !== 'race'),
      paint: { 'fill-color': FILL, 'fill-opacity': fillOpacity() },
    },
    'base-over'
  );
  map.addLayer(
    {
      source,
      ...zoomRange,
      id: id + '-hatch',
      type: 'fill',
      ...withFilter(['==', ['get', 'rs'], 'c']),
      layout: shown(hatchOn()),
      paint: { 'fill-pattern': 'hatch', 'fill-opacity': Math.min(1, colorOpacity() + 0.1) },
    },
    'base-over'
  );
  map.addLayer(
    {
      source,
      ...zoomRange,
      id: id + '-line',
      type: 'line',
      ...withFilter(null),
      layout: shown(VIEW !== 'race' && bordersOn()),
      paint: {
        'line-color': '#11151d',
        'line-opacity': lineOpacity(),
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.05, 8, 0.4, 12, 0.9],
      },
    },
    'states-line'
  );
  map.addLayer({
    source,
    ...zoomRange,
    id: id + '-hover',
    type: 'line',
    ...withFilter(null),
    paint: {
      'line-color': '#ffffff',
      'line-width': 2.5,
      'line-opacity': ['case', ['boolean', ['feature-state', 'h'], false], 1, 0],
    },
  });
  LAYERS.push(id);
}

// national shapes: everywhere below FINEZ; above it, only in states whose detailed shapes haven't arrived yet
function addCoarseLayers(coarseURL) {
  map.addSource(DS + '-c', { type: 'geojson', data: coarseURL, tolerance: 0.5, maxzoom: 9, promoteId: 'z' });
  addAreaLayerGroup(DS + '-c', DS + '-c', null, FINEZ, null);
  addAreaLayerGroup(DS + '-c', DS + '-h', FINEZ, null, ['!', ['in', ['get', 't'], ['literal', []]]]);
}

// the source holding an area's detailed shapes, if its state is loaded
const sourceOfState = (t) => (loadedStates.has(t) ? DS + '-s-' + t : null);
const allSources = () => [DS + '-c', ...[...loadedStates].map((s) => DS + '-s-' + s)];

/*
  setDataset: switch the map to another set of areas ('bg', 'tract', 'zip' or 'crime').
  Removes the current areas' layers, loads the new set's numbers and national shapes if needed, and redraws.
  interim = true leaves the area buttons as they are (used when opening on tracts before block groups arrive,
  and when the Crime view swaps in police areas).
*/
async function setDataset(ds, interim) {
  if (ds === DS) return;
  // an area button pressed while the Crime view is up: remember it for when the view changes
  if (ds !== 'crime' && DS === 'crime' && VIEW === 'crime') return;

  if (!interim) {
    document.getElementById('dZip').setAttribute('aria-pressed', String(ds === 'zip'));
    document.getElementById('dTract').setAttribute('aria-pressed', String(ds === 'tract'));
    document.getElementById('dBg').setAttribute('aria-pressed', String(ds === 'bg'));
  }
  const loading = document.getElementById('loading');
  const names = { zip: 'ZIP codes', tract: 'Census tracts', crime: 'police areas', bg: 'block groups' };
  loading.textContent = 'Loading ' + names[ds] + '…';
  loading.hidden = false;

  if (!DSDATA[ds] || !DSDATA[ds + 'Coarse']) await loadDataset(ds);

  // take the old areas off the map
  if (hoverZ) hoverZ = '';
  for (const id of LAYERS)
    for (const l of ['-fill', '-hatch', '-line', '-hover']) if (map.getLayer(id + l)) map.removeLayer(id + l);
  for (const s of allSources()) if (map.getSource(s)) map.removeSource(s);
  LAYERS.length = 0;
  loadedStates.clear();
  loadingStates.clear();
  K.clear();
  BYZ.clear();

  // put the new ones on
  DS = ds;
  ALL = DSDATA[ds];
  for (const f of ALL.features) BYZ.set(f.properties.z, f.properties);
  addCoarseLayers(DSDATA[ds + 'Coarse']);
  document.getElementById('censusRow').hidden = ds !== 'zip';
  initPanel();
  applyMeasure();
  loadFine();
  map.once('idle', () => (loading.hidden = true));
}

// fetch an area set's numbers, national shapes and state boxes
async function loadDataset(ds) {
  if (ds === 'bg') {
    // block groups are shown as tracts when zoomed out, so they need the tract data too
    if (!DSDATA.tract) {
      const [pts, coarse, meta] = await Promise.all([
        gunzipJSON(DATASETS.tract.pts),
        blobURL(DATASETS.tract.coarse),
        fetchJSON('t/meta.json'),
      ]);
      DSDATA.tract = unpackPts('tract', pts);
      DSDATA.tractCoarse = coarse;
      TMETA = meta;
    }
    const [pts, meta] = await (GPRE || Promise.all([gunzipJSON(DATASETS.bg.pts), fetchJSON(DATASETS.bg.meta)]));
    // tract records first (lv 't', drawn when zoomed out), then block groups (lv 'g')
    if (!DSDATA.bg) DSDATA.bg = { features: DSDATA.tract.features.concat(unpackPts('bg', pts, 'g').features) };
    DSDATA.bgCoarse = DSDATA.tractCoarse;
    GMETA = meta;
    return;
  }
  const D = DATASETS[ds];
  const [pts, coarse, meta] = await Promise.all([
    DSDATA[ds] ? null : gunzipJSON(D.pts),
    blobURL(D.coarse),
    D.meta ? fetchJSON(D.meta) : null,
  ]);
  if (!DSDATA[ds]) DSDATA[ds] = unpackPts(ds, pts);
  DSDATA[ds + 'Coarse'] = coarse;
  if (ds === 'crime') CMETA = meta;
  if (ds === 'tract') TMETA = meta;
}

// detailed shapes: one file per state, loaded (nearest the center first) when zoomed in on it
function loadFine() {
  if (map.getZoom() < FINEZ - 0.8) return; // start a little early so shapes are ready when they're shown
  const b = map.getBounds(),
    c = map.getCenter();
  const boxes = DS === 'zip' ? META.states : DS === 'bg' ? GMETA.states : DS === 'crime' ? CMETA.states : TMETA.states;
  const inView = (bb) => !(bb[2] < b.getWest() || bb[0] > b.getEast() || bb[3] < b.getSouth() || bb[1] > b.getNorth());
  const distance = (bb) => Math.hypot((bb[0] + bb[2]) / 2 - c.lng, (bb[1] + bb[3]) / 2 - c.lat);
  const want = Object.entries(boxes)
    .filter(([st, bb]) => !loadedStates.has(st) && !loadingStates.has(st) && inView(bb))
    .sort((a, d) => distance(a[1]) - distance(d[1]));

  const ds = DS;
  for (const [st] of want) {
    loadingStates.add(st);
    blobURL(DATASETS[ds].dir + st + '.wasm')
      .then((url) => {
        if (ds !== DS) return; // areas were switched while this file loaded
        const source = ds + '-s-' + st;
        map.addSource(source, { type: 'geojson', data: url, tolerance: 0.3, maxzoom: 12, promoteId: 'z' });
        addAreaLayerGroup(source, source, FINEZ, null, null);
        loadedStates.add(st);
        paintClasses(st);
        // once drawn, hide the national shapes for this state
        map.once('idle', () => {
          if (ds !== DS) return;
          const notLoaded = ['!', ['in', ['get', 't'], ['literal', [...loadedStates]]]];
          for (const l of ['-fill', '-hatch', '-line', '-hover']) {
            if (!map.getLayer(ds + '-h' + l)) continue;
            map.setFilter(ds + '-h' + l, l === '-hatch' ? ['all', notLoaded, ['==', ['get', 'rs'], 'c']] : notLoaded);
          }
        });
      })
      .catch(() => {})
      .finally(() => {
        if (ds === DS) loadingStates.delete(st);
      });
  }
}
