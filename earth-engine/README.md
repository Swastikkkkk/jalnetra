# JalNetra Tier 1 Earth Engine exports

[`tier1_gandak.js`](./tier1_gandak.js) is the first real-data processing step for the Gandak corridor. It uses:

- Sentinel-1 GRD for an observed event-water mask
- NASA GPM IMERG for observed rainfall accumulation
- Copernicus GLO-30 for elevation and derived slope
- An uploaded FeatureCollection for the 291 JalNetra villages

## Run it

1. Open [Earth Engine Code Editor](https://code.earthengine.google.com/).
2. Select the complete Google Cloud project ID for the SIH-PH project.
3. Upload the village GeoJSON as an Earth Engine table asset named `jalnetra_villages`, or change `villagesAsset` in the script.
4. Replace the abbreviated project ID in `CONFIG` and `villagesAsset` if `sihph-e6c8b` was truncated in the Cloud Console.
5. Paste the script and click **Run**.
6. Review the map layers, then start the four export tasks from the **Tasks** panel.

The exports are deliberately separate:

- observed Sentinel-1 flood polygons
- village-level Sentinel-1 evidence
- observed GPM rainfall summary
- modelled DEM and slope

The repository includes generated 291-village upload files:
[`jalnetra_villages.geojson`](./jalnetra_villages.geojson).
For the Earth Engine upload dialog, use the CSV version:
[`jalnetra_villages.csv`](./jalnetra_villages.csv). It has `latitude` and
`longitude` columns, which Earth Engine converts into point geometry.

The script does not make GPM or terrain look like observed flooding, and it does not turn a river corridor into a flood polygon. The Sentinel-1 threshold is a documented starting method that should be validated against the event and adjusted only with evidence.

## What is not automated yet

Earth Engine export tasks require the authenticated Google account to start them. This repository cannot start those tasks without your Google authentication. After export, the resulting GeoJSON/JSON needs to be uploaded to an authenticated endpoint and configured as:

- `SENTINEL1_FEED_URL`
- `NASA_GPM_FEED_URL`
- `LIVE_VILLAGES_URL`

The GloFAS forecast and CWC gauge adapters remain separate because Earth Engine does not provide authoritative local gauge readings or the complete GloFAS operational forecast API.
