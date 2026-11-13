/*
  main.js: start here. Connects the panel's controls and the map's events to the functions in the other files,
  then loads the first data when the map is ready.
*/

const on = (id, event, handler) => document.getElementById(id).addEventListener(event, handler);

// ---- view tabs and measure buttons (panel.js)
for (const [id, view] of VIEW_BUTTONS) on(id, 'click', () => setView(view));
on('mValue', 'click', () => setMeasure('value'));
on('mRent', 'click', () => setMeasure('rent'));
on('mViolent', 'click', () => setCrime('violent'));
on('mProperty', 'click', () => setCrime('property'));
for (const [id, m] of COMMUTE_BUTTONS) on(id, 'click', () => setCommute(m));

// ---- which areas (map.js)
on('dBg', 'click', () => setDataset('bg'));
on('dTract', 'click', () => setDataset('tract'));
on('dZip', 'click', () => setDataset('zip'));

// ---- highlight range (range.js)
on('rLo', 'input', onRangeInput);
on('rHi', 'input', onRangeInput);
on('rngReset', 'click', resetRange);

// ---- search (search.js)
on('search', 'submit', onSearch);

// ---- display switches (display.js and the background map file)
on('tBase', 'change', applyBase);
on('opac', 'input', (e) => {
  document.getElementById('opacOut').textContent = e.target.value + '%';
  applyBase();
  if (VIEW === 'race') renderDots();
});
on('mLight', 'click', () => setMode(false));
on('mDark', 'click', () => setMode(true));
document.getElementById('mLight').setAttribute('aria-pressed', String(!DARK));
document.getElementById('mDark').setAttribute('aria-pressed', String(DARK));
on('tCensus', 'change', applyMeasure);
on('tCity', 'change', () => {
  applyBase(); // the street map shows or hides its own names
  syncCities();
});
on('tState', 'change', (e) => {
  if (map.getLayer('states-line'))
    map.setLayoutProperty('states-line', 'visibility', e.target.checked ? 'visible' : 'none');
});
on('tFit', 'change', (e) => {
  FIT = e.target.checked;
  applyMeasure();
});
on('tBorders', 'change', applyBorders);

// the city list for the search box
document.getElementById('cityList').innerHTML = META.cities.map((c) => `<option value="${c[0]}, ${c[4]}">`).join('');

// ---- map events
map.on('mousemove', onMouseMove);
map.getCanvas().addEventListener('mouseleave', () => (tip.style.display = 'none'));

map.on('moveend', () => {
  loadFine(); // detailed shapes for states now in view
  loadRoads(); // county roads (local background only)
  syncCities();
  if (ALL) applyMeasure(); // refit colors and redraw the legend for the new view
  if (VIEW === 'race') {
    showDots();
    setHeader();
  }
});
map.on('zoom', () => {
  if (map.getZoom() >= FINEZ - 0.8) loadFine();
});

// ---- first load
map.on('load', async () => {
  map.addImage('hatch', hatchImage());

  // block groups need ~15 MB of numbers: start fetching now. Meanwhile the map opens on tracts (they look the
  // same zoomed out) and swaps in block groups when they arrive.
  GPRE = Promise.all([gunzipJSON(DATASETS.bg.pts), fetchJSON(DATASETS.bg.meta)]);

  const [statesURL, baseMeta] = await Promise.all([blobURL('states.wasm'), fetchJSON('b/meta.json')]);
  BASE = baseMeta;
  gunzipJSON('pts.wasm').then((p) => (ZIPALL = DSDATA.zip = DSDATA.zip || unpackPts('zip', p))); // for ZIP search

  // state outlines: a plain fill (shown when the background map is off) and lines on top
  map.addSource('states', { type: 'geojson', data: statesURL });
  map.addLayer({ id: 'states-fill', type: 'fill', source: 'states', paint: { 'fill-color': '#181d28' } });
  map.addLayer({
    id: 'states-line',
    type: 'line',
    source: 'states',
    paint: {
      'line-color': '#c7ccd6',
      'line-opacity': 0.6,
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 8, 1.4],
    },
  });

  addBase();
  applyBase();
  await setDataset('tract', true);
  syncCities();
  if (DS === 'tract' && document.getElementById('dBg').getAttribute('aria-pressed') === 'true') await setDataset('bg');
});
