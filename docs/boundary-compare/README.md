# Park boundary comparison (review before merge)

Branch: `fix/real-park-polygon-boundary`  
Do **not** merge to `main` until screenshots are approved.

## Source findings

| Source | Result |
|--------|--------|
| Protomaps PMTiles `landuse` | No `theme_park` polygon |
| Protomaps PMTiles `pois` | Point only: `kind=theme_park` (TDL / TDS label points) |
| OpenStreetMap | Closed ways `tourism=theme_park` |

| Park | OSM way | Geometry | Points (closed GeoJSON) |
|------|---------|----------|-------------------------|
| TDL | [1282875870](https://www.openstreetmap.org/way/1282875870) | Polygon | 95 (94 open ring in app) |
| TDS | [203538370](https://www.openstreetmap.org/way/203538370) | Polygon | 229 (228 open ring in app) |

Static files:

- `data/boundaries/tdl-park-boundary.geojson`
- `data/boundaries/tds-park-boundary.geojson`
- `js/data/parkBoundaryGeojson.js` (generated)

## Screenshots in this folder

| File | What |
|------|------|
| `00-osm-source-tdl-way.png` | OSM website showing way/1282875870 |
| `01-tdl-before-manual-20pt.png` | App before: manual ~20pt hull (TDL) |
| `02-tds-before-manual-20pt.png` | App before: manual ~20pt hull (TDS) |
| `03-tdl-after-osm.png` | App after: OSM outline (TDL) — update after final reload |
| `04-tds-after-osm.png` | App after: OSM outline (TDS) — update after final reload |
| `05-tdl-entrance-z18.png` | Entrance gate line / markers at z18 |

## Notes for reviewers

- Manual attraction-hull polygons were removed.
- Filled `entranceZone` rectangles were removed (gate line + approach arrow instead).
- OSM theme_park ways can still include some service/edge land that OSM mappers attached to the park feature; they are **not** legal boundaries.
- App `minZoom`/`maxBounds` unchanged — at normal z16 framing you see the portion of the OSM ring inside the park viewport; zoom toward edges to see more of the real outline.
