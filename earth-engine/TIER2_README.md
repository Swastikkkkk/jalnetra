# JalNetra Tier 2 context exports

[`tier2_gandak.js`](./tier2_gandak.js) exports:

- JRC Global Surface Water occurrence (1984–2021)
- historical wetness derived from occurrence >= 25%
- ESA WorldCover v200 land cover for 2021
- village-level historical water occurrence and land-cover class

These are background/context layers. They must not be displayed as current
Sentinel-1 flood observations or used alone to label a village affected.

## Run

1. Open the Earth Engine Code Editor.
2. Open the `Jalnetra-Tier1-Gandak` repository.
3. Create a new file named `JalNetra-Tier2-Context`.
4. Paste [`tier2_gandak.js`](./tier2_gandak.js).
5. Confirm `villagesAsset` is:

   `projects/sihph-e6c8b/assets/jalnetra_villages`

6. Save and click **Run**.
7. Open **Tasks** and run the three Tier 2 exports.

The exports will appear in a new Google Drive folder named `jalnetra-tier2`.
