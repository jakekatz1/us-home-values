/*
  race.js: the Race view's dot map, drawn with deck.gl on top of the map.

  Zoomed out, ready-made dots are loaded (each standing for 500 people, then 100).
  From zoom 8, the page makes the dots itself from 2020 Census blocks: 1 per 20 people, then 1 per 4,
  then one for every person. Each dot lands at a random spot inside its own block's footprint (a rectangle
  turned to the street grid), so streets, parks and water stay empty.

  File formats (all gzipped, little-endian):
    ready-made dots  header (west, south, east, north: float64; count n: uint32),
                     then x (uint16 × n), y (uint16 × n), group (uint8 × n); x and y are scaled to the header's box
    block tiles      the same header, then center x, y (uint16 × n), half-length, half-width in metres (uint16 × n),
                     angle (uint8 × n, in 1/256ths of a half turn), then people per group (uint16 × n, 8 times)
*/

// the 8 groups, in file order, and their colors
const RACE = [
  ['White', '#3f7fd8'],
  ['Black', '#2fa84f'],
  ['Hispanic or Latino', '#f0a11f'],
  ['Asian', '#e2483d'],
  ['Native American', '#9b6a3c'],
  ['Pacific Islander', '#b65ac9'],
  ['Other', '#7d7f86'],
  ['Two or more', '#3fc0bd'],
];
const RGB = RACE.map(([, c]) => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
]);

let RACE_META = null; // d/meta.json: which tiles exist, and national totals
let deckOverlay = null; // the deck.gl layer on top of the map
const DOTS = new Map(),
  DOTLOAD = new Set(); // ready-made dot files: loaded / loading
const BLOCKS = new Map(),
  BLOAD = new Set(); // block tiles: loaded / loading
let GEN = null; // the dots last made from blocks (reused while the view hasn't changed)

// 0 = 1 dot per 500 people, 1 = 1 per 100 (both ready-made), 2 = made from blocks
const dotLevel = () => {
  const z = map.getZoom();
  return z < 5 ? 0 : z < 8 ? 1 : 2;
};
const BLOCK_PER = () => {
  const z = map.getZoom();
  return z < 10.5 ? 20 : z < 12.5 ? 4 : 1;
};
const RACE_PER = () => [500, 100, BLOCK_PER()][dotLevel()];

// read the shared file header
function readHeader(ab) {
  const dv = new DataView(ab);
  return {
    west: dv.getFloat64(0, true),
    south: dv.getFloat64(8, true),
    east: dv.getFloat64(16, true),
    north: dv.getFloat64(24, true),
    n: dv.getUint32(32, true),
  };
}
const HEADER = 36;

async function loadDotFile(key, url) {
  if (DOTS.has(key) || DOTLOAD.has(key)) return;
  DOTLOAD.add(key);
  try {
    const ab = await gunzipAB(url);
    const { west, south, east, north, n } = readHeader(ab);
    const qx = new Uint16Array(ab.slice(HEADER, HEADER + 2 * n));
    const qy = new Uint16Array(ab.slice(HEADER + 2 * n, HEADER + 4 * n));
    const group = new Uint8Array(ab, HEADER + 4 * n, n);
    const pos = new Float32Array(2 * n),
      col = new Uint8Array(4 * n);
    const dx = (east - west) / 65535,
      dy = (north - south) / 65535;
    for (let i = 0; i < n; i++) {
      pos[2 * i] = west + qx[i] * dx;
      pos[2 * i + 1] = south + qy[i] * dy;
      const c = RGB[group[i]];
      col.set([c[0], c[1], c[2], 255], 4 * i);
    }
    DOTS.set(key, { n, pos, col, g: new Uint8Array(group), bb: [west, south, east, north] });
  } catch (e) {
  } finally {
    DOTLOAD.delete(key);
  }
  if (VIEW === 'race') {
    renderDots();
    updateRaceLegend();
  }
}

// key: "6_x_y" or "7_x_y" (zoom, tile column, tile row)
async function loadBlockTile(key) {
  if (BLOCKS.has(key) || BLOAD.has(key)) return;
  BLOAD.add(key);
  try {
    const ab = await gunzipAB('d/b/' + key + '.wasm');
    const { west, south, east, north, n } = readHeader(ab);
    const part = (Type, from, bytes) => new Type(ab.slice(HEADER + from * n, HEADER + (from + bytes) * n));
    const qx = part(Uint16Array, 0, 2),
      qy = part(Uint16Array, 2, 2);
    const ha = part(Uint16Array, 4, 2),
      hb = part(Uint16Array, 6, 2),
      an = part(Uint8Array, 8, 1);
    const cnt = part(Uint16Array, 9, 16); // 8 groups × n blocks
    const x = new Float64Array(n),
      y = new Float64Array(n);
    const dx = (east - west) / 65535,
      dy = (north - south) / 65535;
    for (let i = 0; i < n; i++) {
      x[i] = west + qx[i] * dx;
      y[i] = south + qy[i] * dy;
    }
    const [z, tx, ty] = key.split('_').map(Number);
    const seed = (tx * 7919 + ty * 104729 + z * 31) | 0;
    BLOCKS.set(key, { n, x, y, ha, hb, an, cnt, bb: [west, south, east, north], seed });
  } catch (e) {
  } finally {
    BLOAD.delete(key);
  }
  if (VIEW === 'race') {
    renderDots();
    updateRaceLegend();
  }
}

// web-map tile numbers for a longitude / latitude at 2^z tiles across
const tileX = (lon, n) => Math.floor(((lon + 180) / 360) * n);
const tileY = (lat, n) => Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n);

// block tiles in view: zoom-6 tiles, or their four zoom-7 quarters where a crowded tile was split
function blockKeys() {
  const T = RACE_META.levels.b.tiles,
    b = map.getBounds(),
    out = [];
  for (let x = tileX(b.getWest(), 64); x <= tileX(b.getEast(), 64); x++) {
    for (let y = tileY(b.getNorth(), 64); y <= tileY(b.getSouth(), 64); y++) {
      if (T['6/' + x + '_' + y]) {
        out.push('6_' + x + '_' + y);
        continue;
      }
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const X = 2 * x + i,
            Y = 2 * y + j;
          const visible =
            X >= tileX(b.getWest(), 128) &&
            X <= tileX(b.getEast(), 128) &&
            Y >= tileY(b.getNorth(), 128) &&
            Y <= tileY(b.getSouth(), 128);
          if (T['7/' + X + '_' + Y] && visible) out.push('7_' + X + '_' + Y);
        }
      }
    }
  }
  return out;
}

// ready-made dot files for the view: [key, url]
function wantedDots() {
  const L = dotLevel();
  if (L === 0) return [['0', 'd/0.wasm']];
  if (L === 2) return [];
  const level = RACE_META.levels[1],
    n = 2 ** level.z,
    b = map.getBounds(),
    out = [];
  for (let x = tileX(b.getWest(), n); x <= tileX(b.getEast(), n); x++) {
    for (let y = tileY(b.getNorth(), n); y <= tileY(b.getSouth(), n); y++) {
      const k = x + '_' + y;
      if (level.tiles[k]) out.push(['1/' + k, 'd/1/' + k + '.wasm']);
    }
  }
  return out;
}

// a small seeded random-number generator (mulberry32). One per block and group, so the same people land in the
// same places every time, and the dots at 1 per 4 are a subset of the dots at 1 per person.
function rng32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// make the dots for the blocks in (and a little around) the view
function genDots() {
  const per = BLOCK_PER(),
    b = map.getBounds(),
    pad = 0.25;
  const pw = (b.getEast() - b.getWest()) * pad,
    ph = (b.getNorth() - b.getSouth()) * pad;
  const W = b.getWest() - pw,
    E = b.getEast() + pw,
    S = b.getSouth() - ph,
    N = b.getNorth() + ph;
  const keys = blockKeys().filter((k) => BLOCKS.has(k));
  const sig = per + '|' + keys.join(',') + '|' + [W, E, S, N].map((v) => v.toFixed(3)).join(',');
  if (GEN && GEN.sig === sig) return GEN;

  const inBox = (x, y) => x >= W && x <= E && y >= S && y <= N;

  // first pass: an upper bound on the number of dots, to size the arrays
  let cap = 0;
  for (const k of keys) {
    const B = BLOCKS.get(k);
    for (let i = 0; i < B.n; i++) {
      if (!inBox(B.x[i], B.y[i])) continue;
      for (let g = 0; g < 8; g++) {
        const c = B.cnt[g * B.n + i];
        if (c) cap += Math.ceil(c / per);
      }
    }
  }

  // second pass: place the dots
  const pos = new Float32Array(2 * cap),
    col = new Uint8Array(4 * cap);
  let m = 0;
  const left = new Int32Array(8),
    R = new Array(8);
  for (const k of keys) {
    const B = BLOCKS.get(k);
    for (let i = 0; i < B.n; i++) {
      const x0 = B.x[i],
        y0 = B.y[i];
      if (!inBox(x0, y0)) continue;

      // the block's footprint: a rectangle (half-sides ha, hb metres) turned by angle ang
      const my = 1 / 111320,
        mx = my / Math.cos((y0 * Math.PI) / 180);
      const ang = (B.an[i] * Math.PI) / 256,
        ca = Math.cos(ang),
        sa = Math.sin(ang),
        ha = B.ha[i],
        hb = B.hb[i];

      // dots per group, rounded at random so totals come out right on average
      let remaining = 0;
      for (let g = 0; g < 8; g++) {
        const c = B.cnt[g * B.n + i];
        left[g] = 0;
        if (!c) continue;
        R[g] = rng32(B.seed + i * 8 + g);
        left[g] = Math.min(Math.ceil(c / per), Math.floor(c / per + R[g]()));
        remaining += left[g];
      }

      // interleave the groups so no color is always drawn on top
      while (remaining > 0) {
        for (let g = 0; g < 8; g++) {
          if (!left[g]) continue;
          left[g]--;
          remaining--;
          const u = (R[g]() * 2 - 1) * ha,
            v = (R[g]() * 2 - 1) * hb;
          pos[2 * m] = x0 + (u * ca - v * sa) * mx;
          pos[2 * m + 1] = y0 + (u * sa + v * ca) * my;
          const c = RGB[g];
          col.set([c[0], c[1], c[2], 255], 4 * m);
          m++;
        }
      }
    }
  }
  GEN = { sig, n: m, pos, col, per };
  return GEN;
}

// a deck.gl layer of dots from position and color arrays
function dotLayer(id, d, metres, minPx, maxPx, opacity, trigger) {
  return new deck.ScatterplotLayer({
    id,
    data: {
      length: d.n,
      attributes: { getPosition: { value: d.pos, size: 2 }, getFillColor: { value: d.col, size: 4 } },
    },
    radiusUnits: 'meters', // a dot covers a patch of ground, so the amount of color shows population density
    getRadius: metres,
    radiusMinPixels: minPx,
    radiusMaxPixels: maxPx,
    stroked: false,
    opacity,
    antialiasing: true,
    parameters: { depthTest: false },
    updateTriggers: { getRadius: metres, getPosition: trigger },
  });
}

function renderDots() {
  if (!deckOverlay) return;
  const L = dotLevel(),
    z = map.getZoom();
  const op = Math.min(0.9, (baseOn() ? +document.getElementById('opac').value / 100 : 0.8) + 0.15);

  // zoomed in: dots made from blocks (once at least one block tile has arrived)
  if (L === 2 && blockKeys().some((k) => BLOCKS.has(k))) {
    const G = genDots(),
      per = G.per;
    const metres = per === 20 ? 16 : per === 4 ? 7 : 3.2; // smaller as each dot stands for fewer people
    const maxPx = per === 1 ? Math.min(4.5, 1.6 + (z - 12.5) * 0.7) : 2.2;
    deckOverlay.setProps({ layers: [dotLayer('dots-gen', G, metres, 0.65, maxPx, Math.max(0.5, op), G.sig)] });
    return;
  }

  // ready-made dots (also the stand-in while block tiles load)
  let use = wantedDots()
    .map((w) => w[0])
    .filter((k) => DOTS.has(k));
  if (!use.length) use = [...DOTS.keys()].filter((k) => k === '0' || (L === 2 && k[0] === '1')).slice(0, 40);
  deckOverlay.setProps({
    layers: use.map((k) =>
      dotLayer('dots-' + k, DOTS.get(k), [100, 45][+k[0]], z < 5 ? 0.55 : 0.65, 2.4, Math.max(0.45, op), null)
    ),
  });
}

// the legend: people in view by group (exact from blocks when zoomed in, estimated from dots further out)
function updateRaceLegend() {
  if (!RACE_META) return;
  const b = map.getBounds(),
    w = b.getWest(),
    e = b.getEast(),
    s = b.getSouth(),
    n = b.getNorth();
  const inView = (x, y) => x >= w && x <= e && y >= s && y <= n;
  const cnt = new Array(8).fill(0);
  const L = dotLevel(),
    per = L === 2 ? 1 : L === 0 ? 500 : 100;

  if (L === 2) {
    for (const k of blockKeys()) {
      const B = BLOCKS.get(k);
      if (!B) continue;
      for (let i = 0; i < B.n; i++)
        if (inView(B.x[i], B.y[i])) for (let g = 0; g < 8; g++) cnt[g] += B.cnt[g * B.n + i];
    }
  } else {
    for (const [k, d] of DOTS) {
      if (!(k === String(L) || k.startsWith(L + '/'))) continue;
      const [bw, bs, be, bn] = d.bb;
      if (be < w || bw > e || bn < s || bs > n) continue; // file entirely out of view
      const whollyInside = bw >= w && be <= e && bs >= s && bn <= n;
      for (let i = 0; i < d.n; i++) if (whollyInside || inView(d.pos[2 * i], d.pos[2 * i + 1])) cnt[d.g[i]]++;
    }
  }

  const tot = cnt.reduce((a, c) => a + c, 0) || 1;
  const people = tot * per;
  const order = RACE.map((r, i) => i).sort((a, c) => cnt[c] - cnt[a]);
  const pct = (i) => ((cnt[i] / tot) * 100).toFixed(1);
  const perText = RACE_PER() === 1 ? 'person' : RACE_PER() + ' people';
  document.getElementById('raceLegend').innerHTML =
    `<div class="big"><span class="num">${people >= 1e6 ? (people / 1e6).toFixed(1) + 'M' : Math.round(people / 1000) + 'k'}</span>` +
    `<span class="what">people in view${L === 2 ? '' : ' (estimated from the dots)'}<br>2020 Census</span></div>` +
    `<div class="bar">${order.map((i) => `<span style="width:${((cnt[i] / tot) * 100).toFixed(2)}%;background:${RACE[i][1]}"></span>`).join('')}</div>` +
    order
      .map(
        (i) =>
          `<div class="r"><i style="background:${RACE[i][1]}"></i><span>${RACE[i][0]}</span><b>${(cnt[i] * per).toLocaleString()}</b><small>${pct(i)}%</small></div>`
      )
      .join('') +
    `<p class="note">All groups except Hispanic or Latino are non-Hispanic; Hispanic or Latino people can be of any race. One dot for every ${perText} at this zoom, placed at random inside its Census block (in cities, a street block), so a dot marks a block, not a home.</p>`;
}

// start (or refresh) the dot map for the current view
async function showDots() {
  if (!RACE_META) {
    RACE_META = await fetchJSON('d/meta.json');
    RACE_META.people = Object.values(RACE_META.totals).reduce((a, b) => a + b, 0);
    setHeader();
  }
  if (!deckOverlay) {
    deckOverlay = new deck.MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(deckOverlay);
  }
  for (const [k, u] of wantedDots()) loadDotFile(k, u);
  if (dotLevel() === 2) {
    if (!DOTS.size) loadDotFile('0', 'd/0.wasm'); // something to show while block tiles load
    for (const k of blockKeys()) loadBlockTile(k);
  }
  renderDots();
  updateRaceLegend();
}

function hideDots() {
  if (deckOverlay) deckOverlay.setProps({ layers: [] });
}
