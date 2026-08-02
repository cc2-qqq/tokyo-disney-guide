# Park boundary extracts (OpenStreetMap)

Static GeoJSON of OSM `tourism=theme_park` ways for Tokyo Disneyland / DisneySea.

| Park | OSM way | File |
|------|---------|------|
| TDL | [1282875870](https://www.openstreetmap.org/way/1282875870) | `tdl-park-boundary.geojson` |
| TDS | [203538370](https://www.openstreetmap.org/way/203538370) | `tds-park-boundary.geojson` |

These are **not** legal cadastral boundaries. License: ODbL.

## Why not Protomaps tiles?

Local PMTiles expose Disney parks only as **Point** features:

- source-layer: `pois`
- `kind=theme_park`
- No `landuse` polygon with `kind=theme_park`

So the app uses this static OSM extract instead of inventing manual hulls.

## Refresh

```bash
node tools/extract-park-boundaries.mjs
node tools/build-park-boundary-module.mjs
```

Do **not** call Overpass at runtime in the app.
