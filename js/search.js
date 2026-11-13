/*
  search.js: "Go to a ZIP code or city". A 5-digit ZIP zooms to its area; anything else is looked up in the city list.
*/

function onSearch(ev) {
  ev.preventDefault();
  const q = document.getElementById('q').value.trim();
  const msg = document.getElementById('msg');
  msg.textContent = '';
  if (!q || !ZIPALL) return;

  const wide = innerWidth > 720; // on phones the panel is at the bottom, so leave room there instead
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200;
  const padding = { left: wide ? 400 : 40, right: 40, top: 40, bottom: wide ? 40 : innerHeight * 0.48 };

  if (/^\d{5}$/.test(q)) {
    const f = ZIPALL.features.find((f) => f.properties.z === q);
    if (!f) msg.textContent = `No ZIP code area ${q} (PO-box-only ZIPs have none).`;
    else map.fitBounds(f._bb, { padding, maxZoom: 12, duration });
    return;
  }

  // "Denver, CO" or just "Denver"; each city: [name, lon, lat, size rank, state]
  const lc = q.toLowerCase();
  const c =
    META.cities.find((c) => (c[0] + ', ' + c[4]).toLowerCase() === lc) ||
    META.cities.find((c) => c[0].toLowerCase() === lc.split(',')[0].trim());
  if (!c) {
    msg.textContent = 'Not found. Try a 5-digit ZIP code or a larger city.';
    return;
  }
  map.flyTo({ center: [c[1], c[2]], zoom: c[3] < 50 ? 9.5 : 10.5, duration });
}
