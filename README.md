# JalNetra Flood Map

React + TypeScript (Vite) flood propagation map for the September 2026 Gandak flood, Nepal to Bihar.
Rendering: deck.gl (BitmapLayer, TripsLayer, PathLayer, ScatterplotLayer, TextLayer). Styling: Tailwind v4 + CSS tokens.

## Run
```
npm install
npm run dev        # http://localhost:5173
npm run build      # single-file dist/index.html (vite-plugin-singlefile)
```

## Structure
- `src/App.tsx` – map, layers, timeline, Follow the water, village and river-segment panels
- `src/data.json` – generated: river path + GloFAS stations, rain, villages, roads, shelters, observation metadata
- `src/img/` – generated rasters: Sentinel-2 mosaic, Sentinel-1 flood footprints (o1–o3), risk corridor
- `pipeline/` – Python scripts that produce the data (run in this order):
  1. `s2b.py`, `s2c.py` – Sentinel-2 cloud-free mosaic (Planetary Computer)
  2. `s1.py` – Sentinel-1 change detection for 26 Sep, 29 Sep, 3 Oct passes
  3. `dem.py` – Copernicus GLO-30 elevation
  4. `corridor.py` – height above channel + risk corridor (needs `river_main.json` from OSM)
  5. `event.py` – per-village Sentinel-1 / elevation checks
  6. `build.py` – writes `src/data.json` and `src/img/*`
  Python deps: rasterio, numpy, scipy, shapely, pyproj, pillow, planetary-computer, pystac-client, networkx

## Data sources
Sentinel-1 RTC and Sentinel-2 L2A (Microsoft Planetary Computer), GloFAS discharge and daily rain (Open-Meteo),
Copernicus DEM GLO-30, OpenStreetMap (rivers, roads, schools/hospitals), GeoNames (villages, districts).
