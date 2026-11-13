/*
  panel.js: the side panel's text and legend, and the view / measure buttons.
    setView      switch tab (Prices, Income, Race, Commute, Crime, Age)
    setHeader    the title and the paragraph under it
    drawHist     the legend: histogram of the areas in view, the big number, and the note under it
*/

const $ = (id) => document.getElementById(id);
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

// ZIP-mode summary numbers for the legend note (computed once per area set)
function initPanel() {
  setHeader();
  if (DS === 'zip') {
    const P = ALL.features.map((f) => f.properties);
    const values = P.filter((p) => p.v).map((p) => p.v);
    const zillowRents = P.filter((p) => p.rs === 'z').map((p) => p.r);
    const censusRents = P.filter((p) => p.rs === 'c').map((p) => p.r);
    META.calc = {
      mv: median(values),
      nv: values.length,
      mrz: median(zillowRents),
      nrz: zillowRents.length,
      mrc: median(censusRents),
      nrc: censusRents.length,
    };
    $('nCensus').textContent = censusRents.length.toLocaleString() + ' ZIPs';
    $('cityList').innerHTML = META.cities.map((c) => `<option value="${c[0]}, ${c[4]}">`).join('');
  }
  fitBreaks();
  drawHist();
}

// ---------------------------------------------------------------------------
// Title and introduction
// ---------------------------------------------------------------------------
function setHeader() {
  const P = ALL ? ALL.features.map((f) => f.properties) : [];
  const n = DS === 'bg' ? P.filter((p) => p.lv === 'g').length : P.length;
  const what = DS === 'zip' ? 'ZIP codes' : DS === 'tract' ? 'Census tracts' : 'Census block groups';
  const areasLine = `<strong>${n.toLocaleString()} ${what}</strong>`;
  const set = (eyebrow, title, lede) => {
    if (eyebrow != null) $('eyebrow').textContent = eyebrow;
    $('h1').innerHTML = title;
    $('lede').innerHTML = lede;
  };

  if (VIEW === 'race') {
    const people = (+RACE_META?.people || 0).toLocaleString();
    const per = RACE_PER() === 1 ? 'one person' : RACE_PER() + ' people';
    return set(
      'United States, one dot per person',
      'Race <span>&amp; ethnicity</span>',
      `<strong>${people} people</strong> as colored dots, by race and Hispanic or Latino origin, from the 2020 Census. Each dot stands for ${per}, placed at random within its Census block.`
    );
  }

  if (VIEW === 'crime') {
    const C = CMETA;
    const lede =
      DS !== 'crime' || !C
        ? 'Loading police areas…'
        : `Offenses reported to the FBI in 2025 per 1,000 residents, for <strong>${P.filter((p) => p.kind === 'c' || p.kind === 'k').length.toLocaleString()} city and county police areas</strong> covering ${(C.covered_pop / 1e6).toFixed(0)} million people. Across them: <strong>${((1000 * C.v) / C.covered_pop).toFixed(1)} violent</strong> and <strong>${((1000 * C.p) / C.covered_pop).toFixed(1)} property crimes</strong> per 1,000 residents.`;
    return set('United States, by police agency', 'Reported <span>crime</span>', lede);
  }

  const eyebrow =
    'United States, by ' + (DS === 'zip' ? 'ZIP code' : DS === 'tract' ? 'Census tract' : 'Census block group');

  if (VIEW === 'age') {
    return set(
      eyebrow,
      'Age of <span>homes</span>',
      `${areasLine} colored by the median year their homes were built, from the Census Bureau's 2020–2024 survey. Half of all US homes were built before <strong>1980</strong>.`
    );
  }

  if (VIEW === 'commute') {
    return set(
      eyebrow,
      'Getting <span>to work</span>',
      `${areasLine} colored by the share of workers who ${MEASURES[measure].verb}, from the Census Bureau's 2020–2024 survey. Nationally, 68.8% drove alone, 8.5% carpooled, 3.2% took transit, 2.8% walked or biked and 15.1% worked from home.`
    );
  }

  // Prices and Income: include the median across areas
  const prop = VIEW === 'income' ? 'i' : 'v';
  const vals = P.filter((p) => p[prop] != null && (DS !== 'bg' || p.lv === 'g')).map((p) => p[prop]);
  const md = vals.length ? short$(median(vals)) : '—';

  if (VIEW === 'income') {
    return set(
      eyebrow,
      'Household <span>income</span>',
      `${areasLine} colored by median household income, from the Census Bureau's 2020–2024 survey. Half of these areas have a median under <strong>${md}</strong> a year.`
    );
  }
  const lede =
    DS === 'zip'
      ? `<strong>${vals.length.toLocaleString()} ZIP codes</strong> colored by Zillow's typical home value for ${monthName(META.zhvi_month)}, or by monthly rent. Half of these ZIPs have a typical value under <strong>${md}</strong>.`
      : `${areasLine} colored by median home value or median rent, from the Census Bureau's 2020–2024 survey. Half of these areas have a median value under <strong>${md}</strong>.`;
  set(eyebrow, 'Home values <span>&amp; rents</span>', lede);
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------
function drawHist() {
  if (!ALL || VIEW === 'race') return;
  const vis = inView();
  $('hist').innerHTML = histogramSVG(vis);
  $('scaleText').textContent = FIT
    ? FITTED
      ? 'Colors fit what is in view (set under Advanced).'
      : 'Too few areas in view to fit colors: national scale.'
    : 'Colors use one national scale (fit them to the view under Advanced).';
  const [num, what, note] = legendText(vis);
  $('bigNum').textContent = num;
  $('bigWhat').innerHTML = what;
  $('legendNote').innerHTML = note;
}

// one bar per color: how many areas in view fall in it (striped part: Census rents)
function histogramSVG(vis) {
  const prop = MEASURES[measure].prop,
    B = BR[measure];
  const counts = new Array(NC).fill(0),
    striped = new Array(NC).fill(0);
  for (const p of vis) {
    let i = 0;
    while (i < NC - 1 && p[prop] >= B[i]) i++;
    counts[i]++;
    if (measure === 'rent' && p.rs === 'c') striped[i]++;
  }

  const W = 320,
    H = 92,
    bw = W / NC,
    max = Math.max(...counts);
  const [ka, kb] = rngOn() ? rngK() : [-2, 2]; // bars outside the highlight range are dimmed
  let s = `<svg viewBox="0 -4 ${W} ${H + 30}" role="img">`;
  s += `<defs><pattern id="hp" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="5" fill="rgba(17,21,29,.75)"/></pattern></defs>`;
  counts.forEach((c, i) => {
    const dim = (i + 1) / NC <= ka || i / NC > kb ? ' opacity="0.22"' : '';
    const h = max ? Math.max(c ? 2 : 0, (c / max) * H) : 0;
    const hs = max ? (striped[i] / max) * H : 0;
    s += `<rect x="${i * bw + 1}" y="${H - h}" width="${bw - 2}" height="${h}" rx="1.5" fill="${RAMP[i]}"${dim}><title>${c.toLocaleString()} ${DATASETS[DS].many}</title></rect>`;
    if (hs > 0.5) s += `<rect x="${i * bw + 1}" y="${H - hs}" width="${bw - 2}" height="${hs}" fill="url(#hp)"/>`;
  });

  // three value labels under the bars, and the ramp itself
  const label = (b) =>
    measure === 'built'
      ? String(Math.round(b))
      : isCrime(measure)
        ? r1(b)
        : isCommute(measure)
          ? r1(b) + '%'
          : measure === 'rent'
            ? '$' + b.toLocaleString()
            : short$(b);
  B.forEach((b, i) => {
    if (i === 1 || i === 7 || i === 13)
      s += `<text x="${(i + 1) * bw}" y="${H + 18}" text-anchor="middle">${label(b)}</text>`;
  });
  s += `<defs><linearGradient id="lg">${RAMP.map((c, i) => `<stop offset="${(((i + 0.5) / NC) * 100).toFixed(1)}%" stop-color="${c}"/>`).join('')}</linearGradient></defs>`;
  s += `<rect x="0" y="${H + 2}" width="${W}" height="4" rx="2" fill="url(#lg)"/></svg>`;
  return s;
}

// [big number, what it is, note under the legend] for the current measure
function legendText(vis) {
  const prop = MEASURES[measure].prop,
    U = DATASETS[DS];
  const med = vis.length ? median(vis.map((p) => p[prop])) : null;
  const zoomedOutBg = DS === 'bg' && map.getZoom() < FINEZ;
  const zoomNote = zoomedOutBg ? ' Zoom in to see block groups; tracts are shown until then.' : '';
  const scale = FITTED
    ? `The 12 middle colors each hold about a twelfth of the ${vis.length.toLocaleString()} ${U.many} in view; the two deepest at each end mark the lowest and highest 3% (1% for the deepest). The same color means different amounts at different places and zooms.`
    : '';
  const areaWord = DS === 'zip' ? 'ZIP' : DS === 'tract' || zoomedOutBg ? 'tract' : 'block group';

  if (measure === 'built') {
    return [
      med ? yr(med) : '—',
      `median ${U.one} in view, median year homes were built<br>Census survey, 2020–2024`,
      scale +
        ` The year by which half of an area's homes (houses and apartments, lived-in or vacant) had been built, as residents reported it. Purple is oldest; "1939 or earlier" is the oldest answer the survey records. This is homes only, by area, not building by building.` +
        zoomNote,
    ];
  }

  if (isCommute(measure)) {
    // the share of all workers in view (areas weighted by how many workers they have)
    let workers = 0,
      sum = 0;
    for (const p of vis)
      if (p.w) {
        workers += p.w;
        sum += p.w * p[prop];
      }
    return [
      workers ? (sum / workers).toFixed(1) + '%' : '—',
      `of the ${Math.round(workers).toLocaleString()} workers in view ${MEASURES[measure].short}<br>Census survey, 2020–2024`,
      scale +
        ` How workers aged 16 and over usually got to work in the week before the survey (the mode used for the longest distance). Averaged over 2020–2024, so the work-from-home share mixes pandemic and later years. Grey areas have fewer than 20 workers.` +
        (zoomedOutBg ? zoomNote : DS === 'bg' ? ' Block groups have wide margins of error.' : ''),
    ];
  }

  if (isCrime(measure)) {
    // the rate across the areas in view: all their offenses over all their residents (big cities count by size)
    const col = measure === 'violent' ? 0 : 5;
    let pop = 0,
      count = 0;
    for (const p of vis)
      if (p.n && p.n[col] != null) {
        pop += p.pop;
        count += p.n[col];
      }
    const kinds =
      measure === 'violent'
        ? 'Violent crime: murder, rape, robbery and aggravated assault.'
        : 'Property crime: burglary, theft and motor vehicle theft.';
    return [
      pop ? ((1000 * count) / pop).toFixed(1) : '—',
      `${measure} crimes per 1,000 residents in view<br>reported to the FBI, 2025`,
      scale +
        ` Bars count police areas. ${kinds} Rates are per resident, so downtowns, tourist spots and towns with big stores or highway stops look high: visitors are victims too but not residents. Only crimes reported to police count. <b>Grey</b>: no county agency reported for 2025 (often state police patrol there), a city reported part of the year, or too few residents.`,
    ];
  }

  if (measure === 'income') {
    return [
      med ? short$(med) : '—',
      `median ${areaWord} in view, median household income<br>Census survey, 2020–2024`,
      scale +
        ` Median yearly income of households (all sources, before taxes), in 2024 dollars, averaged over the 2020–2024 survey. Grey areas have too few households for an estimate.` +
        zoomNote,
    ];
  }

  // Prices view, Census areas
  if (DS === 'tract' || DS === 'bg') {
    const note =
      measure === 'value'
        ? ` Owners' own estimates of what their homes would sell for, averaged over 2020–2024, so they run below current market values. Grey tracts have too few owner homes for an estimate.`
        : ` What renters paid, including utilities, averaged over 2020–2024 (long-time tenants included), so it runs below current asking rents. Grey tracts have too few rentals.`;
    return [
      med ? (measure === 'value' ? short$(med) : '$' + med.toLocaleString()) : '—',
      `median ${areaWord} in view, ${measure === 'value' ? 'median home value' : 'median gross rent'}<br>Census survey, 2020–2024`,
      scale +
        note +
        (zoomedOutBg
          ? zoomNote
          : DS === 'bg'
            ? ' Block groups (a few city blocks, about 1,500 people) have wide margins of error; hover to see them.'
            : ''),
    ];
  }

  // Prices view, ZIP codes (Zillow)
  const C = META.calc;
  if (measure === 'value') {
    return [
      med ? short$(med) : '—',
      `median ZIP in view, typical home value<br>${monthName(META.zhvi_month)}`,
      scale +
        ` Bars count ZIP codes in view in each color. Grey ZIPs have no Zillow value (${(ALL.features.length - C.nv).toLocaleString()}, mostly rural or with few homes).`,
    ];
  }
  const census = $('tCensus').checked;
  return [
    med ? '$' + med.toLocaleString() : '—',
    `median ZIP in view, monthly rent<br>${census ? 'Zillow and Census' : 'Zillow, ' + monthName(META.zori_month)}`,
    scale +
      ` <b>Solid</b>: Zillow asking rent (${C.nrz.toLocaleString()} ZIPs). ` +
      (census
        ? `<span class="sw"></span><b>Striped</b>: Census median gross rent, 2020–2024, incl. utilities (${C.nrc.toLocaleString()} ZIPs; median $${C.mrc.toLocaleString()}). Runs lower than asking rents.`
        : 'Census rents hidden: ZIPs without a Zillow rent are grey.'),
  ];
}

// ---------------------------------------------------------------------------
// Tabs and measure buttons
// ---------------------------------------------------------------------------
const VIEW_BUTTONS = [
  ['vPrice', 'price'],
  ['vIncome', 'income'],
  ['vRace', 'race'],
  ['vCommute', 'commute'],
  ['vCrime', 'crime'],
  ['vAge', 'age'],
];
const pressed = (id) => $(id).getAttribute('aria-pressed') === 'true';

function setView(v) {
  VIEW = v;
  for (const [id, k] of VIEW_BUTTONS) $(id).setAttribute('aria-pressed', String(v === k));
  const race = v === 'race',
    crime = v === 'crime';

  // which controls this view shows
  $('measureSeg').hidden = v !== 'price';
  $('commuteSeg').hidden = v !== 'commute';
  $('crimeSeg').hidden = !crime;
  $('areaSeg').hidden = race || crime;
  $('raceLegend').hidden = !race;
  for (const id of ['bigRow', 'hist', 'rngRow', 'legendNote', 'scaleRow']) $(id).hidden = race;
  $('zipSrc').textContent = v === 'price' ? 'Zillow' : 'Census';

  // the measure that goes with this view (remembering the last button pressed in each)
  if (v === 'price') measure = pressed('mRent') ? 'rent' : 'value';
  else if (v === 'income') measure = 'income';
  else if (v === 'age') measure = 'built';
  else if (v === 'commute') measure = COMMUTE_BUTTONS.find(([id]) => pressed(id))[1];
  else if (crime) measure = pressed('mProperty') ? 'property' : 'violent';

  // Crime uses its own areas (police agencies); leaving it brings back the areas from before
  if (crime && DS !== 'crime') {
    PREVDS = DS || 'bg';
    setDataset('crime', true);
  } else if (!crime && DS === 'crime') {
    const back = PREVDS;
    setDataset(back, true);
  }
  $('censusRow').hidden = v !== 'price' || DS !== 'zip';

  for (const id of LAYERS)
    for (const l of ['-fill', '-hover'])
      if (map.getLayer(id + l)) map.setLayoutProperty(id + l, 'visibility', race ? 'none' : 'visible');
  applyBorders();
  K.clear();
  setHeader();
  applyMeasure();
  applyHatch();
  if (race) showDots();
  else hideDots();
}

// Prices: home value or rent
function setMeasure(m) {
  $('mValue').setAttribute('aria-pressed', String(m === 'value'));
  $('mRent').setAttribute('aria-pressed', String(m === 'rent'));
  if (VIEW !== 'price') return;
  measure = m;
  applyMeasure();
}

// Crime: violent or property
function setCrime(m) {
  $('mViolent').setAttribute('aria-pressed', String(m === 'violent'));
  $('mProperty').setAttribute('aria-pressed', String(m === 'property'));
  if (VIEW !== 'crime') return;
  measure = m;
  K.clear();
  applyMeasure();
}

// Commute: which way of getting to work
function setCommute(m) {
  for (const [id, k] of COMMUTE_BUTTONS) $(id).setAttribute('aria-pressed', String(k === m));
  if (VIEW !== 'commute') return;
  measure = m;
  K.clear();
  setHeader();
  applyMeasure();
}
