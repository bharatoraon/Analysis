// Step 1: DEFINE YOUR AREA OF INTEREST (AOI)
// Replace the path below with the path to YOUR shapefile asset.
var hyderabadRegion = ee.FeatureCollection('projects/your-project/assets/Your-AOI-Shapefile');

// Center the map on your region and add it as a layer
Map.centerObject(hyderabadRegion, 11);
Map.addLayer(hyderabadRegion, {color: 'green'}, "My AOI Boundary");

// Function to Load Landsat Collection (LC08 + LC09) for thermal analysis
function loadLandsat(region, start, end) {
  function maskL8AndL9Clouds(image) {
    var qa = image.select('QA_PIXEL');
    var cloudBitMask = 1 << 3;
    var cloudShadowBitMask = 1 << 5;
    var snowBitMask = 1 << 4;
    var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
        .and(qa.bitwiseAnd(cloudShadowBitMask).eq(0))
        .and(qa.bitwiseAnd(snowBitMask).eq(0));
    return image.updateMask(mask);
  }
  var collection9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
                      .filterDate(start, end)
                      .filterBounds(region)
                      .filter(ee.Filter.lt('CLOUD_COVER', 5))
                      .map(maskL8AndL9Clouds)
                      .select(['ST_B10']);
  var collection8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
                      .filterDate(start, end)
                      .filterBounds(region)
                      .filter(ee.Filter.lt('CLOUD_COVER', 5))
                      .map(maskL8AndL9Clouds)
                      .select(['ST_B10']);
  return collection9.merge(collection8);
}

// Function to Calculate LST from the thermal band
function calculateLST(image) {
  var lst = image.multiply(0.00341802).add(149.0)
                 .subtract(273.15)
                 .rename('LST');
  return lst.copyProperties(image, image.propertyNames());
}

// Step 2: CUSTOMIZE YOUR ANALYSIS PARAMETERS
var years = [2014, 2019, 2024]; // The years you want to analyze
var startMonth = '-04-01'; // Start date (e.g., April 1st for summer)
var endMonth = '-04-30';   // End date (e.g., April 30th)

// Loop over the specified years
years.forEach(function(year) {
  var start = year + startMonth;
  var end = year + endMonth;

  print('Processing year: ' + year + ', Period: ' + start + ' to ' + end);
  var collection = loadLandsat(hyderabadRegion, start, end).map(calculateLST);
  print('Number of usable images in collection for ' + year + ': ', collection.size());

  var lst_median_raw = collection.median().clip(hyderabadRegion);

  if (lst_median_raw === null || lst_median_raw.bandNames().getInfo().length === 0) {
    print('No valid LST data found for ' + year + '. Skipping this year.');
    return;
  }
  
  // --- UHI Map Calculation ---
  var mean_lst = lst_median_raw.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: hyderabadRegion.geometry(),
    scale: 30,
    maxPixels: 1e9
  }).get('LST');

  mean_lst = ee.Number(mean_lst);
  print('Mean LST for ' + year + ' (Celsius):', mean_lst);

  var uhi_map = lst_median_raw.subtract(mean_lst).rename('UHI_Intensity');

  // Visualization parameters
  var lstVisParams = {min: 25, max: 50, palette: ['blue', 'cyan', 'green', 'yellow', 'orange', 'red']};
  var uhiVisParams = {min: -5, max: 10, palette: ['blue', 'cyan', 'lightgray', 'yellow', 'orange', 'red']};
  
  var lstLayerName = 'LST_' + year;
  Map.addLayer(lst_median_raw, lstVisParams, lstLayerName);

  var uhiLayerName = 'UHI_' + year;
  Map.addLayer(uhi_map, uhiVisParams, uhiLayerName);

  // --- Exporting the Results ---
  Export.image.toDrive({
    image: lst_median_raw,
    description: 'LST_Median_' + year + '_MyCity',
    folder: 'GEE_LST_Exports',
    scale: 30,
    region: hyderabadRegion.geometry(),
    maxPixels: 1e9
  });

  Export.image.toDrive({
    image: uhi_map,
    description: 'UHI_Intensity_' + year + '_MyCity',
    folder: 'GEE_UHI_Exports',
    scale: 30,
    region: hyderabadRegion.geometry(),
    maxPixels: 1e9
  });
});