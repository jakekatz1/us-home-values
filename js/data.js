/*
  data.js: loading the data files.
  The files are gzip-compressed and named .wasm (claude.ai serves only some file types; the name doesn't matter
  to the page). The browser unzips them itself with DecompressionStream.
*/

const fetchBytes = (url) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return r.arrayBuffer();
  });

const gunzip = (bytes) => new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));

// a gzipped JSON file -> the parsed value
const gunzipJSON = (url) => fetchBytes(url).then((b) => gunzip(b).json());

// a gzipped binary file -> an ArrayBuffer (race dots)
const gunzipAB = (url) => fetchBytes(url).then((b) => gunzip(b).arrayBuffer());

// a gzipped GeoJSON file -> a blob: URL, so the map library parses it off the main thread
const blobURL = (url) =>
  fetchBytes(url)
    .then((b) => gunzip(b).blob())
    .then((b) => URL.createObjectURL(b));

const fetchJSON = (url) => fetch(url).then((r) => r.json());

/*
  unpackPts: turn the rows of a pts.wasm file into area records.
  Rows are plain arrays (smaller than objects); the columns are written by the Python build scripts:

    ZIP codes   [zip, x, y, value, rent, rentSource, city, state, bbox, stateFile, valueChange, rentMargin, rentTopCoded,
                 income, incomeMargin, workers, driveAlone%, carpool%, transit%, walkBike%, home%, other%, yearBuilt-1900]
    tracts      [id, x, y, value, rent, rentSource, name, state, bbox, stateFile, county, valueMargin, rentMargin,
                 income, incomeMargin, workers, ... same commute columns ..., yearBuilt-1900]
    block groups  as tracts, except "other%" is left out (worked out from the rest) and year built is column 21
    police areas  [id, x, y, violentRate, propertyRate, kind, name, state, bbox, population, counts, agencies, months]

  Each record is { properties, _c: [x, y] (a point inside the area), _bb: bounding box }.
  lv marks block-group records 'g' (tract records loaded alongside them are 't').
*/
function unpackPts(ds, rows, lv) {
  const features = rows.map((row) => {
    const bbox = (bb) => [
      [bb[0], bb[1]],
      [bb[2], bb[3]],
    ];

    if (ds === 'crime') {
      const [z, x, y, vr, pr, kind, name, s, bb, pop, n, ag, months] = row;
      const props = { z, name, s, t: s, kind, pop, n, ag, months };
      if (vr != null) props.vr = vr;
      if (pr != null) props.pr = pr;
      return { properties: props, _c: [x, y], _bb: bbox(bb) };
    }

    // year built and commute shares (same columns for all three area sets)
    const ybRaw = ds === 'bg' ? row[21] : row[22];
    const [w, cda, ccp, ctr, cwb, cwh, cotRaw] = row.slice(15);
    const commute = {};
    if (cda != null) {
      const cot = ds !== 'bg' && cotRaw != null ? cotRaw : Math.max(0, 100 - cda - ccp - ctr - cwb - cwh);
      Object.assign(commute, { w, cda, ccp, ctr, cwb, cwh, cot });
    }
    const built = ybRaw != null ? { yb: 1900 + ybRaw } : {};

    if (ds === 'zip') {
      const [z, x, y, v, r, rs, c, s, bb, t, vc, rm, rt, i, im] = row;
      const props = { z, c, s, t };
      if (v != null) props.v = v;
      if (r != null) Object.assign(props, { r, rs });
      if (vc != null) props.vc = vc;
      if (rm != null) props.rm = rm;
      if (rt) props.rt = rt;
      if (i != null) Object.assign(props, { i, im });
      return { properties: Object.assign(props, commute, built), _c: [x, y], _bb: bbox(bb) };
    }

    const [z, x, y, v, r, rs, name, s, bb, t, county, vm, rm, i, im] = row;
    const props = { z, name, s, t, county, lv: lv || ds[0] };
    if (v != null) Object.assign(props, { v, vm });
    if (r != null) Object.assign(props, { r, rs, rm });
    if (i != null) Object.assign(props, { i, im });
    return { properties: Object.assign(props, commute, built), _c: [x, y], _bb: bbox(bb) };
  });
  return { features };
}
