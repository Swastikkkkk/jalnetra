insert into storage.buckets (id, name, public)
values ('jalnetra-tier1', 'jalnetra-tier1', false)
on conflict (id) do update set public = excluded.public;

create table if not exists public.jn_tier1_assets (
  asset_key text primary key,
  storage_path text not null,
  source text not null,
  evidence_status text not null check (evidence_status in ('observed', 'modelled', 'historical_context')),
  updated_at timestamptz not null default now()
);

alter table public.jn_tier1_assets enable row level security;

insert into public.jn_tier1_assets (asset_key, storage_path, source, evidence_status)
values
  ('sentinel1_flood_polygons', 'sentinel1_observed_flood_polygons.geojson', 'Sentinel-1', 'observed'),
  ('sentinel1_village_evidence', 'village_sentinel1_evidence.geojson', 'Sentinel-1', 'observed'),
  ('admin_level1', 'admin_level1.geojson', 'FAO GAUL', 'observed'),
  ('admin_level2', 'admin_level2.geojson', 'FAO GAUL', 'observed'),
  ('gpm_rainfall', 'gpm_rainfall_summary.tif', 'NASA GPM IMERG', 'observed'),
  ('dem_slope', 'copernicus_dem_slope.tif', 'Copernicus GLO-30', 'modelled')
on conflict (asset_key) do update set storage_path = excluded.storage_path, updated_at = now();
