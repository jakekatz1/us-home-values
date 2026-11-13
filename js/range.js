/*
  range.js: the two-handle "highlight" slider under the legend.
  Areas whose value is between the handles keep their color; everything else (and grey no-data areas) fades.
  The range is kept as values (e.g. $300k to $900k), so it stays put when the color scale refits.
*/

// the chosen range, for one measure; null ends are open (lowest / highest)
const RNG = { m: null, lo: null, hi: null };

const rngOn = () => RNG.m === measure && (RNG.lo != null || RNG.hi != null) && VIEW !== 'race';

// a value -> its position on the color ramp
const kOf = (x) => classOf({ [MEASURES[measure].prop]: x });

// the range as ramp positions
const rngK = () => [RNG.lo == null ? -2 : kOf(RNG.lo), RNG.hi == null ? 2 : kOf(RNG.hi)];

// map expression: is this area inside the range?
const inRange = () => {
  const [a, b] = rngK(),
    k = ['coalesce', ['feature-state', 'k'], -1];
  return ['all', ['>=', k, a], ['<=', k, b], ['>=', k, 0]];
};

// opacities of the area colors and borders (used by every area layer)
const fillOpacity = () => (rngOn() ? ['case', inRange(), colorOpacity(), colorOpacity() * 0.1] : colorOpacity());
const lineOpacity = () => (rngOn() ? ['case', inRange(), 1, 0.12] : 1);

// a value as the range label shows it
const fmtValue = (x) => {
  if (measure === 'built') return yr(x);
  if (isCrime(measure)) return r1(x) + ' per 1,000';
  if (isCommute(measure)) return r1(x) + '%';
  if (measure === 'rent') return '$' + Math.round(x).toLocaleString() + '/mo';
  return short$(x);
};

// put the handles and label where the chosen values are now (after the scale changed)
function syncRange() {
  if (RNG.m !== measure) {
    RNG.m = measure;
    RNG.lo = RNG.hi = null;
  }
  const lo = RNG.lo == null ? 0 : Math.round(kOf(RNG.lo) * 1000);
  const hi = RNG.hi == null ? 1000 : Math.round(kOf(RNG.hi) * 1000);
  document.getElementById('rLo').value = lo;
  document.getElementById('rHi').value = hi;

  // the colored bar between the handles (7px = half a handle)
  const fill = document.getElementById('rngFill');
  fill.style.left = `calc(7px + (100% - 14px) * ${lo / 1000})`;
  fill.style.width = `calc((100% - 14px) * ${(hi - lo) / 1000})`;

  const on = rngOn();
  document.getElementById('rngReset').hidden = !on;
  document.getElementById('rngText').innerHTML = on
    ? `Highlighting <b>${RNG.lo == null ? 'lowest' : fmtValue(RNG.lo)}</b> to <b>${RNG.hi == null ? 'highest' : fmtValue(RNG.hi)}</b>`
    : 'Drag the ends to highlight a range';
}

function applyRange() {
  for (const id of LAYERS) {
    if (map.getLayer(id + '-fill')) map.setPaintProperty(id + '-fill', 'fill-opacity', fillOpacity());
    if (map.getLayer(id + '-line')) map.setPaintProperty(id + '-line', 'line-opacity', lineOpacity());
  }
}

// a handle was dragged
let rangeFrame = 0;
function onRangeInput(e) {
  const L = document.getElementById('rLo'),
    H = document.getElementById('rHi');
  // keep the handles apart
  if (+L.value > +H.value - 10) {
    if (e.target === L) L.value = +H.value - 10;
    else H.value = +L.value + 10;
  }
  RNG.m = measure;
  RNG.lo = +L.value <= 0 ? null : nice(valueOfK(+L.value / 1000), measure);
  RNG.hi = +H.value >= 1000 ? null : nice(valueOfK(+H.value / 1000), measure);
  syncRange();
  // repaint once per animation frame, however fast the handle moves
  cancelAnimationFrame(rangeFrame);
  rangeFrame = requestAnimationFrame(() => {
    applyRange();
    drawHist();
  });
}

function resetRange() {
  RNG.lo = RNG.hi = null;
  syncRange();
  applyRange();
  drawHist();
}
