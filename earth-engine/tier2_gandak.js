// JalNetra Tier 2 Earth Engine context layers.
// These layers describe historical water persistence and land cover.
// They are not current flood observations.

var CONFIG = {
  start: '2026-09-15',
  end: '2026-10-07',
  driveFolder: 'jalnetra-tier2',
  villagesAsset: 'projects/sihph-e6c8b/assets/jalnetra_villages',
  bounds: ee.Geometry.Rectangle([83.10, 25.50, 85.65, 28.45]),
};

var region = CONFIG.bounds;
var villages = ee.FeatureCollection(CONFIG.villagesAsset);

// JRC Global Surface Water occurrence: percentage of historical observations
// in which a pixel was water. This is historical context, not event evidence.
var surfaceWater = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
  .select('occurrence')
  .clip(region)
  .set({
    source: 'JRC Global Surface Water',
    evidence_status: 'historical_context',
    period: '1984-2021',
  });
var historicalWetness = surfaceWater.gte(25).selfMask();

// ESA WorldCover v200 land cover for 2021. Classes are contextual exposure
// categories, not flood status.
var worldCover = ee.ImageCollection('ESA/WorldCover/v200')
  .first()
  .select('Map')
  .clip(region)
  .set({
    source: 'ESA WorldCover v200',
    evidence_status: 'historical_context',
    year: 2021,
  });

// Summarise historical water occurrence and land-cover class at each village.
var villageContext = villages.map(function(village) {
  var water = surfaceWater.reduceRegion({
    reducer: ee.Reducer.first(),
    geometry: village.geometry(),
    scale: 30,
    maxPixels: 1e4,
  }).get('occurrence');
  var cover = worldCover.reduceRegion({
    reducer: ee.Reducer.first(),
    geometry: village.geometry(),
    scale: 10,
    maxPixels: 1e4,
  }).get('Map');
  return village.set({
    surface_water_occurrence_percent: water,
    worldcover_2021_class: cover,
    surface_water_status: 'historical_context',
    land_cover_status: 'historical_context',
  });
});

Map.centerObject(region, 8);
Map.addLayer(surfaceWater, {
  min: 0,
  max: 100,
  palette: ['f7fbff', 'c6dbef', '6baed6', '2171b5', '08306b'],
}, 'HISTORICAL surface-water occurrence');
Map.addLayer(historicalWetness, {palette: ['3155c7']}, 'HISTORICAL wetness >=25%', false);
Map.addLayer(worldCover, {}, 'HISTORICAL land cover 2021', false);

Export.table.toDrive({
  collection: villageContext,
  description: 'jalnetra_village_tier2_context',
  folder: CONFIG.driveFolder,
  fileFormat: 'GeoJSON',
});
Export.image.toDrive({
  image: surfaceWater,
  description: 'jalnetra_surface_water_occurrence',
  folder: CONFIG.driveFolder,
  region: region,
  scale: 30,
  maxPixels: 1e10,
});
Export.image.toDrive({
  image: worldCover,
  description: 'jalnetra_worldcover_2021',
  folder: CONFIG.driveFolder,
  region: region,
  scale: 10,
  maxPixels: 1e10,
});
