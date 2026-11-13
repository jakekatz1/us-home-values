/*
  labels.js: city names on the map (used when the background map has no names of its own).
  Bigger cities appear first; labels that would overlap are skipped.
*/

const cityMarkers = new Map(); // "name + state" -> its marker on the map

function syncCities() {
  const want = new Map();
  const show = document.getElementById('tCity').checked && !(BASEMAP_HAS_LABELS && baseOn());
  if (show) {
    const z = map.getZoom(),
      b = map.getBounds(),
      placed = [];
    // how far down the size ranking to go at this zoom
    const maxRank = z < 4 ? 25 : z < 5 ? 60 : z < 6 ? 150 : z < 7 ? 400 : z < 8 ? 1200 : z < 9 ? 3000 : 8000;
    // each city: [name, lon, lat, size rank, state]
    for (const c of BASE ? BASE.places : META.cities) {
      if (c[3] >= maxRank) break;
      if (!b.contains([c[1], c[2]])) continue;
      const p = map.project([c[1], c[2]]);
      if (placed.some((q) => Math.abs(q.x - p.x) < 90 && Math.abs(q.y - p.y) < 20)) continue;
      placed.push(p);
      want.set(c[0] + c[4], c);
    }
  }
  for (const [k, marker] of cityMarkers) {
    if (want.has(k)) continue;
    marker.remove();
    cityMarkers.delete(k);
  }
  for (const [k, c] of want) {
    if (cityMarkers.has(k)) continue;
    const el = document.createElement('div');
    el.className = 'citylab' + (c[3] < 25 ? ' b' : '');
    el.textContent = c[0];
    cityMarkers.set(k, new maplibregl.Marker({ element: el }).setLngLat([c[1], c[2]]).addTo(map));
  }
}
