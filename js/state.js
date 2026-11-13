/*
  state.js: what the page is currently showing. Shared by all the other files.
  (Feature-specific state lives at the top of that feature's file.)
*/

// which tab is open: 'price' | 'income' | 'race' | 'commute' | 'crime' | 'age'
let VIEW = 'price';

// what the areas are colored by: a key of MEASURES (config.js)
let measure = 'value';

// which areas are on the map: 'bg' | 'tract' | 'zip' | 'crime' ('' until the first set loads)
let DS = '';

// the area set to return to when leaving the Crime view
let PREVDS = 'bg';

// the numbers for the areas on the map: { features: [{ properties, _c: center, _bb: bounding box }] }
let ALL = null;

// area id -> its properties, for the tooltip and hover outline
const BYZ = new Map();

// everything loaded so far, by area set: DSDATA.tract, DSDATA.tractCoarse (shapes URL), ...
const DSDATA = {};

// the ZIP numbers, kept for ZIP-code search whichever areas are shown
let ZIPALL = null;

// per-state bounding boxes for each area set's detailed shapes (from its meta.json)
let TMETA = null,
  GMETA = null,
  CMETA = null;

// the block-group numbers, requested as soon as the page opens (they are large)
let GPRE = null;

// the background map's place list and per-state road files (b/meta.json)
let BASE = null;

// class boundaries in use for each measure: fitted to the view, or the national ones
const BR = Object.fromEntries(Object.entries(MEASURES).map(([k, M]) => [k, M.breaks.slice()]));

// "Fit colors to the view" is on, and whether the current breaks actually are fitted
let FIT = false;
let FITTED = false;

// area id -> color position currently set on the map (so only changed areas are repainted)
const K = new Map();

// the layer-group ids currently on the map (each has -fill, -hatch, -line and -hover layers)
const LAYERS = [];

// states whose detailed shapes are on the map / on their way
const loadedStates = new Set();
const loadingStates = new Set();
