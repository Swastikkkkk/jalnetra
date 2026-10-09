update public.jn_tier1_assets
set storage_path = 'copernicus_dem_slope_overview.tif', updated_at = now()
where asset_key = 'dem_slope';
