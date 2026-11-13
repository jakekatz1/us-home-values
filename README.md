# US home values, rents, income, race, commuting, crime and age of homes

Live map: https://jakekatz1.github.io/us-home-values/

## How the page is organized

| File | What it does |
|---|---|
| `index.html` | Page layout only: the map, the side panel and its controls |
| `css/style.css` | How everything looks, in labeled sections |
| `js/main.js` | **Start here.** Connects every button and map event to the code below, and loads the first data |
| `js/config.js` | Fixed settings: color ramp, the measures each view colors by, number formats, data file names |
| `js/state.js` | What the page is showing right now (view, measure, areas) |
| `js/data.js` | Loading and unpacking the data files |
| `js/display.js` | Background on/off, color strength, light/dark, borders |
| `js/basemap-street.js` | The OpenStreetMap street map underneath, recolored for dark mode |
| `js/map.js` | The map and the colored areas: national shapes zoomed out, each state's detailed shapes zoomed in |
| `js/colors.js` | Turning numbers into colors, and fitting the scale to the view |
| `js/range.js` | The two-handle "highlight a range" slider |
| `js/panel.js` | The panel's title, legend histogram and notes; switching views |
| `js/race.js` | The race dot map: one dot per person up close, placed inside each Census block |
| `js/tooltip.js` | The hover box |
| `js/labels.js` | City names (when the street map is off) |
| `js/search.js` | Go to a ZIP code or city |

The data files (`*.wasm`, gzip-compressed despite the name) are built by separate Python scripts from Zillow,
Census and FBI downloads; see "About the data" on the page for sources.

Open `index.html` through any static web server (GitHub Pages serves it as is; opening the file directly won't load the data).

Data: Zillow Research (ZHVI, ZORI); US Census Bureau (American Community Survey 2020–2024, 2020 Census redistricting
data, 2020 ZIP Code Tabulation Areas, tract and block group boundaries, 2024 Gazetteer); FBI Crime Data Explorer (2025).
Map tiles: OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors.
