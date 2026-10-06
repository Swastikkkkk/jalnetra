// JalNetra Tier 1 Earth Engine export plan.
// Run in the Earth Engine Code Editor with the Cloud project:
// https://code.earthengine.google.com/
//
// This script exports source-tagged products. It does not publish a village as
// affected unless the Sentinel-1 event mask intersects that village.

var CONFIG = {
  projectId: 'sihph-e6c8b', // replace with the complete Google Cloud project ID if truncated
  start: '2026-09-15',
  end: '2026-10-07',
  baselineStart: '2026-08-15',
  baselineEnd: '2026-09-14',
  scale: 30,
  driveFolder: 'jalnetra-tier1',
  // Upload the 291-village FeatureCollection as an Earth Engine asset and set
  // this value before running the village export.
  villagesAsset: 'projects/sihph-e6c8b/assets/jalnetra_villages',
  bounds: ee.Geometry.Rectangle([83.10, 25.50, 85.65, 28.45]),
};

var region = CONFIG.bounds;
var villages = ee.FeatureCollection(CONFIG.villagesAsset);
var admin1 = ee.FeatureCollection('FAO/GAUL/2015/level1').filterBounds(region);
var admin2 = ee.FeatureCollection('FAO/GAUL/2015/level2').filterBounds(region);

function taggedImage(image, source, status) {
  return image.set({
    jalnetra_source: source,
    jalnetra_status: status,
    jalnetra_fetched_at: ee.Date(Date.now()).format('YYYY-MM-dd HH:mm:ss'),
  });
}

// Sentinel-1 GRD: event water is a statistically significant VV decrease
// against the pre-event median. The output is evidence, not a forecast.
var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(region)
  .filterDate(CONFIG.start, CONFIG.end)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .select('VV');
var s1Baseline = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(region)
  .filterDate(CONFIG.baselineStart, CONFIG.baselineEnd)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .select('VV').median();
var s1Event = s1.median();
var floodMask = s1Baseline.subtract(s1Event).gt(2.5)
  .and(s1Event.lt(-15))
  .unmask(0)
  .clip(region);
var observedFloodMask = floodMask.selfMask();
var floodVectors = observedFloodMask.reduceToVectors({
  geometry: region,
  scale: 10,
  geometryType: 'polygon',
  eightConnected: true,
  maxPixels: 1e10,
  bestEffort: true,
});
floodVectors = floodVectors.map(function(feature) {
  return feature.set({
    source: 'Sentinel-1',
    evidence_status: 'observed',
    acquired_start: CONFIG.start,
    acquired_end: CONFIG.end,
    method: 'VV baseline decrease > 2.5 dB and event VV < -15 dB',
  });
});

// NASA GPM IMERG: observed precipitation summary over the corridor.
var rain = ee.ImageCollection('NASA/GPM_L3/IMERG_V07')
  .filterBounds(region)
  .filterDate(CONFIG.start, CONFIG.end)
  .select('precipitation');
var rain24h = rain.sum().rename('rainfall_mm');

// Copernicus GLO-30 DEM and a derived slope surface. These are supporting
// terrain evidence and must remain MODELLED in the JalNetra UI.
var dem = ee.ImageCollection('COPERNICUS/DEM/GLO30').select('DEM').mosaic().clip(region);
var slope = ee.Terrain.slope(dem).rename('slope_degrees');

// Village-level evidence. A village is OBSERVED only when its point intersects
// the Sentinel-1 event mask. All other labels remain modelled/unclassified.
var villageEvidence = villages.map(function(village) {
  var observed = floodMask.reduceRegion({
    reducer: ee.Reducer.max(),
    geometry: village.geometry(),
    scale: 10,
    maxPixels: 1e6,
  }).get('VV');
  return village.set({
    source: 'Sentinel-1',
    evidence_status: ee.Algorithms.If(ee.Number(observed).eq(1), 'affected', 'unaffected_observed'),
    observation_window_start: CONFIG.start,
    observation_window_end: CONFIG.end,
  });
});

Map.centerObject(region, 8);
Map.addLayer(s1Event, {min: -25, max: 0}, 'Sentinel-1 event', false);
Map.addLayer(observedFloodMask, {palette: ['ff3b30']}, 'OBSERVED flood mask');
Map.addLayer(rain24h, {min: 0, max: 300, palette: ['fff7bc', 'fec44f', 'd95f0e']}, 'OBSERVED GPM rainfall', false);
Map.addLayer(dem, {min: 20, max: 500, palette: ['0b132b', '3a86ff', 'fefae0']}, 'MODELLED terrain', false);

Export.table.toDrive({
  collection: floodVectors,
  description: 'jalnetra_sentinel1_observed_flood_polygons',
  folder: CONFIG.driveFolder,
  fileFormat: 'GeoJSON',
});
Export.table.toDrive({
  collection: villageEvidence,
  description: 'jalnetra_village_sentinel1_evidence',
  folder: CONFIG.driveFolder,
  fileFormat: 'GeoJSON',
});
Export.table.toDrive({
  collection: admin1,
  description: 'jalnetra_admin_level1',
  folder: CONFIG.driveFolder,
  fileFormat: 'GeoJSON',
});
Export.table.toDrive({
  collection: admin2,
  description: 'jalnetra_admin_level2',
  folder: CONFIG.driveFolder,
  fileFormat: 'GeoJSON',
});
Export.image.toDrive({
  image: rain24h.set({source: 'NASA GPM IMERG', evidence_status: 'observed'}),
  description: 'jalnetra_gpm_rainfall_summary',
  folder: CONFIG.driveFolder,
  region: region,
  scale: 10000,
  maxPixels: 1e10,
});
Export.image.toDrive({
  image: dem.addBands(slope).set({source: 'Copernicus GLO-30', evidence_status: 'modelled'}),
  description: 'jalnetra_copernicus_dem_slope',
  folder: CONFIG.driveFolder,
  region: region,
  scale: CONFIG.scale,
  maxPixels: 1e10,
});
