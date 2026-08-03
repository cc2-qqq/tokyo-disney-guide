# leaflet-rotate (vendored)

- Source: https://github.com/Raruto/leaflet-rotate
- Version: v0.2.0
- License: GPL-3.0 (see LICENSE)
- Compatible with Leaflet 1.9.x (project uses Leaflet 1.9.4)
- Used for: map bearing / two-finger rotate / shift+wheel rotate

Note: The official maplibre-gl-leaflet binding does not implement MapLibre-native
bearing. Rotation works by placing the GL canvas in Leaflet's `tilePane`, which
leaflet-rotate nests under `rotatePane` and CSS-transforms with the map.
