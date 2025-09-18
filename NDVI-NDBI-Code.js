// Step 1: DEFINE YOUR AREA OF INTEREST (AOI)
// Replace the path below with the path to YOUR shapefile asset.
var wardBoundaryShapefile = ee.FeatureCollection('projects/your-project/assets/Your-AOI-Shapefile');
// Or Define your area of interest (AOI) in Rectangle.
// You can use the geometry drawing tools in the GEE Code Editor
// or define it programmatically. For this example, let's use a rectangle.
var aoi = ee.Geometry.Rectangle([[-123.5, 36.5], [-120.0, 38.5]]); // Example: California coast

// Center the map on your AOI and add it as a layer
Map.centerObject(wardBoundaryShapefile, 13);
Map.addLayer(wardBoundaryShapefile, {color: 'blue'}, "My AOI Boundary");

// Function to load and merge Landsat 8 and 9 collections for optical bands
function loadLandsat(region, start, end) {
  var collection9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
                      .filterDate(start, end)
                      .filterBounds(region);
  var collection8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
                      .filterDate(start, end)
                      .filterBounds(region);
  return collection9.merge(collection8)
                    .select(['SR_B4', 'SR_B5', 'SR_B6', 'QA_PIXEL']); // Red, NIR, SWIR1, Pixel Quality
}

// Function to mask clouds from a Landsat image
function maskClouds(image) {
  var qa = image.select('QA_PIXEL');
  var cloudMask = qa.bitwiseAnd(1 << 3).or(qa.bitwiseAnd(1 << 4));
  return image.updateMask(cloudMask.not());
}

// Function to calculate NDVI
function calculateNDVI(image) {
  return image.addBands(image.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI'));
}

// Function to calculate NDBI
function calculateNDBI(image) {
  return image.addBands(image.normalizedDifference(['SR_B6', 'SR_B5']).rename('NDBI'));
}

// Step 2: CUSTOMIZE YOUR ANALYSIS PARAMETERS
var years = [2014, 2019, 2024]; // The years you want to analyze
var startMonth = '-01-01'; // January 1st
var endMonth = '-12-31';   // December 31st

// Iterate over each year to calculate and export indices
years.forEach(function(year) {
  var start = year + startMonth;
  var end = year + endMonth;
  print('Processing year: ' + year);

  var collection = loadLandsat(wardBoundaryShapefile, start, end)
                      .map(maskClouds)
                      .map(calculateNDVI)
                      .map(calculateNDBI);

  var medianImage = collection.median().clip(wardBoundaryShapefile);
  var ndvi_median = medianImage.select('NDVI');
  var ndbi_median = medianImage.select('NDBI');

  // Visualization parameters
  var ndviVisParams = {min: -1, max: 1, palette: ['blue', 'white', 'green']}; // Water, bare, vegetation
  var ndbiVisParams = {min: -1, max: 1, palette: ['green', 'white', 'red']};   // Vegetation, bare, built-up

  // Add layers to the map
  Map.addLayer(ndvi_median, ndviVisParams, 'NDVI_' + year);
  Map.addLayer(ndbi_median, ndbiVisParams, 'NDBI_' + year);

  // --- Exporting the Results ---
  Export.image.toDrive({
    image: ndvi_median,
    description: 'NDVI_Median_' + year + '_MyCity',
    folder: 'GEE_NDVI_Exports',
    scale: 30,
    region: wardBoundaryShapefile.geometry(),
    maxPixels: 1e9
  });

  Export.image.toDrive({
    image: ndbi_median,
    description: 'NDBI_Median_' + year + '_MyCity',
    folder: 'GEE_NDBI_Exports',
    scale: 30,
    region: wardBoundaryShapefile.geometry(),
    maxPixels: 1e9
  });
});
