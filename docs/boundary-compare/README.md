# Park boundary comparison (review before merge)

Branch: `fix/real-park-polygon-boundary`  
Do **not** merge to `main` until screenshots are approved.

## Current model

| Layer | File | Map |
|-------|------|-----|
| Raw OSM | `data/boundaries/raw/*-osm-theme-park.geojson` | Not shown |
| Guest area | `data/boundaries/*-guest-area.geojson` | Stroke-only “파크 영역(안내용)” |

Guest outlines start from OSM `tourism=theme_park` ways, then trim over-included service/hotel/road areas and add missing guest perimeters (esp. Fantasy Springs) using official Korean PDF + vector basemap alignment. Not cadastral.

## Verification shots (guest-v2)

See `docs/boundary-compare/review/guest-v2/`:

- TDL/TDS zoom 16–18 guest outline
- Entrance zoom 18 (TDL arrow south into park)
- Fantasy Springs zoom 18
- Debug: guest vs maxBounds, raw OSM vs guest

## Rebuild

```bash
node tools/build-guest-area-boundaries.mjs
npm run validate
```
