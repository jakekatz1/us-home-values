/*
  tooltip.js: the box that follows the pointer, and the outline around the area under it.
*/

const tip = document.getElementById('tip');
let hoverZ = ''; // id of the outlined area

// Census figures are capped ("top-coded") at both ends
const valueText = (p) => (p.v >= 2000001 ? '$2,000,000+' : p.v <= 9999 ? '$9,999 or less' : fmt$(p.v));
const rentText = (p) => (p.r >= 3501 ? '$3,500+' : p.r <= 99 ? '$99 or less' : fmt$(p.r));
const incomeText = (p) => (p.i >= 250001 ? '$250,000+' : p.i <= 2499 ? '$2,499 or less' : fmt$(p.i));
const margin = (m, ok) => (m && ok ? ' · ±' + fmt$(m) : ''); // 90% margin of error, if the value isn't capped

// small builders for the tooltip's parts
const tipTitle = (text) => `<div class="z">${text}</div>`;
const tipRow = (label, value) => `<div class="row"><span>${label}</span><b>${value}</b></div>`;
const tipNote = (text) => `<div class="src">${text}</div>`;

function tipHtml(p) {
  p = Object.assign({}, BYZ.get(p.z) || {}, p); // the map only carries the id; the numbers come from BYZ
  if (DS === 'crime') return tipCrime(p);

  const title = tipTitle(
    DS === 'zip'
      ? `ZIP ${p.z}${p.c ? ' · ' + p.c + ', ' + p.s : ''}`
      : p.lv === 'g'
        ? `Tract ${p.name} · ${p.county}, ${p.s}`
        : `Census tract ${p.name} · ${p.county}, ${p.s}`
  );
  if (VIEW === 'age') return title + tipAge(p);
  if (VIEW === 'commute') return title + tipCommute(p);
  if (VIEW === 'income') return title + tipIncome(p);
  if (DS === 'tract' || DS === 'bg') return title + tipCensusPrices(p);
  return title + tipZillow(p);
}

function tipCrime(p) {
  const name = p.name + ', ' + p.s;
  const title = tipTitle(p.kind === 'k' ? name + ' · outside city police areas' : name);
  if (p.kind === 'n')
    return (
      title +
      tipNote(
        'No county sheriff or county police reported a full year of 2025 to the FBI for this area. State police or a non-reporting agency may patrol it.'
      )
    );
  if (p.kind === 'p')
    return (
      title +
      tipNote(`${p.ag} reported only ${p.months} month${p.months === 1 ? '' : 's'} of 2025, so it has no yearly rate.`)
    );
  if (p.kind === 's' || !p.n) return title + tipNote('Too few residents for a rate.');

  // n: [violent, murder, rape, robbery, aggravated assault, property, burglary, theft, vehicle theft]
  const c = (i) => (p.n[i] == null ? '—' : p.n[i].toLocaleString());
  const rate = (x) => `${x != null ? r1(x) : '—'} <small>per 1,000</small>`;
  return (
    title +
    tipRow('Violent crime', rate(p.vr)) +
    tipNote(`${c(0)} reported: ${c(1)} murders, ${c(2)} rapes, ${c(3)} robberies, ${c(4)} aggravated assaults`) +
    tipRow('Property crime', rate(p.pr)) +
    tipNote(`${c(5)} reported: ${c(6)} burglaries, ${c(7)} thefts, ${c(8)} vehicle thefts`) +
    tipNote(
      `${p.pop.toLocaleString()} residents${p.kind === 'k' ? ' (Census estimate for the area outside city police)' : ''} · ${p.ag}, FBI 2025`
    )
  );
}

function tipAge(p) {
  if (!p.yb) return tipNote('Too few homes for an estimate');
  const when = p.yb <= 1939 ? 'in 1939 or earlier' : 'before ' + p.yb + ', half since';
  return (
    tipRow('Median year built', yr(p.yb)) + tipNote(`Half the homes here were built ${when} · Census ACS 2020–2024`)
  );
}

function tipCommute(p) {
  if (p.cda == null) return tipNote('Fewer than 20 workers: no estimate');
  // the row for the measure being mapped is highlighted
  const row = (k, label) =>
    `<div class="row"${measure === k ? ' style="color:var(--ink)"' : ''}><span>${measure === k ? '<b>' + label + '</b>' : label}</span><b>${p[MEASURES[k].prop]}%</b></div>`;
  return (
    row('drive', 'Drove alone') +
    row('carpool', 'Carpooled') +
    row('transit', 'Public transit') +
    row('walk', 'Walked or biked') +
    row('home', 'Worked from home') +
    tipRow('Other (taxi, motorcycle…)', p.cot + '%') +
    tipNote(`${p.w.toLocaleString()} workers 16+ · Census ACS 2020–2024`)
  );
}

function tipIncome(p) {
  if (!p.i) return tipRow('Median household income', '—') + tipNote('Too few households for an estimate');
  return (
    tipRow('Median household income', incomeText(p)) +
    tipNote('Census ACS 2020–2024, 2024 dollars' + margin(p.im, p.i < 250001 && p.i > 2499))
  );
}

function tipCensusPrices(p) {
  const value = p.v
    ? tipRow('Median home value', valueText(p)) +
      tipNote("Owners' estimates, Census ACS 2020–2024" + margin(p.vm, p.v < 2000001 && p.v > 9999))
    : tipRow('Median home value', '—') + tipNote('Too few owner homes for an estimate');
  const rent = p.r
    ? tipRow('Median gross rent', rentText(p) + '/mo') +
      tipNote('Incl. utilities, Census ACS 2020–2024' + margin(p.rm, p.r < 3501 && p.r > 99))
    : tipRow('Median gross rent', '—') + tipNote('Too few rentals for an estimate');
  return value + rent;
}

function tipZillow(p) {
  let h = '';
  if (p.v) {
    const change =
      p.vc != null
        ? `<span class="chg ${p.vc >= 0 ? 'up' : 'down'}">${p.vc >= 0 ? '+' : ''}${p.vc}% in a year</span>`
        : '';
    h +=
      tipRow('Typical home value', fmt$(p.v)) +
      tipNote(`Zillow ZHVI, ${monthName(META.zhvi_month)} ${change ? '· ' + change : ''}`);
  } else {
    h += tipRow('Typical home value', '—') + tipNote('No Zillow estimate for this ZIP');
  }
  if (p.rs === 'z') {
    h +=
      tipRow('Typical rent', fmt$(p.r) + '/mo') + tipNote(`Zillow asking rent (ZORI), ${monthName(META.zori_month)}`);
  } else if (p.rs === 'c') {
    h +=
      tipRow('Median gross rent', (p.rt ? '$3,500+' : fmt$(p.r)) + '/mo') +
      tipNote(`Census ACS 2020–2024 average, incl. utilities${margin(p.rm, !p.rt)}. Not an asking rent.`);
  } else {
    h += tipRow('Rent', '—') + tipNote('No Zillow or Census rent estimate');
  }
  return h;
}

// pointer moved over the map: outline the area under it and show its numbers
function onMouseMove(e) {
  if (VIEW === 'race') {
    tip.style.display = 'none';
    return;
  }
  const layers = LAYERS.map((s) => s + '-fill').filter((l) => map.getLayer(l));
  const f = map.queryRenderedFeatures(e.point, { layers })[0];

  const z = f ? f.properties.z : '';
  if (z !== hoverZ) {
    const outline = (id, on) => {
      if (!id) return;
      if (map.getSource(DS + '-c')) map.setFeatureState({ source: DS + '-c', id }, { h: on });
      const p = BYZ.get(id),
        s = p && sourceOfState(p.t);
      if (s) map.setFeatureState({ source: s, id }, { h: on });
    };
    outline(hoverZ, false);
    hoverZ = z;
    outline(z, true);
  }

  if (!f) {
    tip.style.display = 'none';
    map.getCanvas().style.cursor = '';
    return;
  }
  map.getCanvas().style.cursor = 'crosshair';
  tip.innerHTML = tipHtml(f.properties);
  tip.style.display = 'block';

  // keep the box on screen
  const r = tip.getBoundingClientRect();
  let x = e.point.x + 14,
    y = e.point.y + 14;
  if (x + r.width > innerWidth - 8) x = e.point.x - r.width - 14;
  if (y + r.height > innerHeight - 8) y = e.point.y - r.height - 14;
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}
