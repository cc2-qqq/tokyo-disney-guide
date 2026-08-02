# Park boundaries

Two layers are kept separate:

| Layer | Path | Shown on map? | Purpose |
|-------|------|---------------|---------|
| Raw OSM `tourism=theme_park` | `raw/tdl-osm-theme-park.geojson`, `raw/tds-osm-theme-park.geojson` | No | Audit / provenance |
| Guest area outline | `tdl-guest-area.geojson`, `tds-guest-area.geojson` | Yes | Guest-orientation outline |

## Properties (guest area)

- `boundaryPurpose`: `guest_orientation`
- `officialBoundary`: `false`
- `source`: OSM baseline + official Korean PDF + vector basemap visual alignment
- `notes`: orientation-only; not a legal boundary

## Why not Protomaps tiles alone?

Local PMTiles expose Disney parks only as **Point** features (`pois` / `kind=theme_park`). There is no usable `theme_park` landuse polygon in the bundled tiles.

## Rebuild

```bash
# Refresh raw OSM extracts (optional; Overpass)
node tools/extract-park-boundaries.mjs

# Build guest-area edits + js/data/parkBoundaryGeojson.js
node tools/build-guest-area-boundaries.mjs

npm run validate
```

Do **not** call Overpass at runtime in the app.
Do **not** widen `maxBounds` to hide outline overflow — shrink the guest outline instead.
