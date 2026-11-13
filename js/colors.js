/*
  colors.js: turning numbers into colors.
    classOf      an area's value -> its position on the color ramp (0..1, or -1 for no data)
    fitBreaks    the 15 class boundaries: national, or fitted to the areas in view
    paintClasses push the positions to the map (only for areas whose color changed)
    applyMeasure redo all of the above after anything changes
*/

// Is this area's value shown? (Census rents in ZIP mode are optional, see the "Census rent" switch)
const hiddenCensusRent = (p) =>
  DS === 'zip' && measure === 'rent' && p.rs === 'c' && !document.getElementById('tCensus').checked;

// the low and high value of color class i (the two end classes are as wide as their neighbors)
function classRange(B, i) {
  const lo = i > 0 ? B[i - 1] : B[0] - (B[1] - B[0]);
  const hi = i < NC - 1 ? B[i] : B[NC - 2] + (B[NC - 2] - B[NC - 3]);
  return [lo, hi];
}

// value -> position on the ramp. The position inside a class is kept, so neighbouring values blend
// into each other (a gradient rather than bands).
function classOf(p) {
  const x = p[MEASURES[measure].prop];
  if (x == null || hiddenCensusRent(p)) return -1;
  const B = BR[measure];
  let i = 0;
  while (i < NC - 1 && x >= B[i]) i++;
  const [a, b] = classRange(B, i);
  const f = Math.max(0, Math.min(1, (x - a) / (b - a || 1)));
  return Math.round(((i + f) / NC) * 400) / 400;
}

// the reverse: a position on the ramp -> a value (used by the highlight slider)
function valueOfK(k) {
  const B = BR[measure];
  const p = Math.max(0, Math.min(NC - 1e-6, k * NC)),
    i = Math.floor(p),
    f = p - i;
  const [a, b] = classRange(B, i);
  return Math.max(0, a + f * (b - a));
}

// the areas whose center is in view and that have a value for the current measure.
// (Block groups: tract records stand in below FINEZ, block-group records above it.)
function inView() {
  const b = map.getBounds(),
    w = b.getWest(),
    e = b.getEast(),
    s = b.getSouth(),
    n = b.getNorth();
  const prop = MEASURES[measure].prop,
    level = map.getZoom() < FINEZ ? 't' : 'g',
    out = [];
  for (const f of ALL.features) {
    const p = f.properties;
    if (p[prop] == null || hiddenCensusRent(p)) continue;
    if (DS === 'bg' && p.lv !== level) continue;
    const [x, y] = f._c;
    if (x < w || x > e || y < s || y > n) continue;
    out.push(p);
  }
  return out;
}

// round a class boundary to something readable for its measure
function nice(v, m) {
  if (m === 'rent') return v < 2000 ? Math.round(v / 25) * 25 : Math.round(v / 50) * 50;
  if (m === 'income') return Math.round(v / 1000) * 1000;
  if (m === 'built') return Math.round(v);
  if (isCrime(m) || isCommute(m)) return v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1); // two significant figures
  return Math.round(v / mag) * mag;
}

// the smallest step between two boundaries, so rounding never makes two equal
function minStep(m, b) {
  if (m === 'built') return 1;
  if (m === 'rent') return 25;
  if (m === 'income') return 1000;
  if (isCrime(m) || isCommute(m)) return b < 10 ? 0.1 : 1;
  return nice(Math.max(b, 1000) / 50, 'value');
}

/*
  fitBreaks: with "Fit colors to the view" on, the 12 middle colors each get about a twelfth of the areas in view,
  and the two deepest colors at each end the lowest/highest 1% and 3%. Otherwise the national breaks are used.
*/
function fitBreaks() {
  for (const m in MEASURES) BR[m] = MEASURES[m].breaks.slice();
  FITTED = false;
  if (!ALL || !FIT) return;

  const m = measure,
    prop = MEASURES[m].prop;
  const vals = inView()
    .map((p) => p[prop])
    .sort((a, b) => a - b);
  if (vals.length < 40) return; // too few areas to fit 16 colors: keep the national scale

  const quantile = (f) => vals[Math.min(vals.length - 1, Math.floor(vals.length * f))];
  const lo = EXT[1],
    hi = 1 - EXT[1];
  const cuts = [EXT[0], EXT[1]];
  for (let k = 1; k < 12; k++) cuts.push(lo + ((hi - lo) * k) / 12);
  cuts.push(hi, 1 - EXT[0]);

  const breaks = [];
  for (const cut of cuts) {
    let b = nice(quantile(cut), m);
    const last = breaks[breaks.length - 1];
    if (breaks.length && b <= last) b = last + minStep(m, b);
    breaks.push(b);
  }
  BR[m] = breaks;
  FITTED = true;
}

// push color positions to the map. only = a state's code: set all its areas (its detailed shapes just loaded).
function paintClasses(only) {
  for (const f of ALL.features) {
    const p = f.properties;
    if (only) {
      if (p.t === only) map.setFeatureState({ source: DS + '-s-' + only, id: p.z }, { k: K.get(p.z) ?? -1 });
      continue;
    }
    const k = classOf(p);
    if (K.get(p.z) === k) continue;
    K.set(p.z, k);
    map.setFeatureState({ source: DS + '-c', id: p.z }, { k });
    const s = sourceOfState(p.t);
    if (s) map.setFeatureState({ source: s, id: p.z }, { k });
  }
}

// after a change of view, measure, areas, or a move of the map: recolor and redraw the legend
function applyMeasure() {
  if (!ALL) return;
  if (VIEW === 'race') {
    updateRaceLegend();
    return;
  }
  fitBreaks();
  paintClasses();
  applyHatch();
  syncRange();
  applyRange();
  drawHist();
}
