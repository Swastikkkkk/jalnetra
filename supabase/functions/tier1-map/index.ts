import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const layers: Record<string, string> = {
  flood: "sentinel1_observed_flood_polygons.geojson",
  admin1: "admin_level1.geojson",
  admin2: "admin_level2.geojson",
  villages: "village_sentinel1_evidence.geojson",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "content-type": "application/json", "cache-control": "public, max-age=300" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return json({ error: "GET required" }, 405);
  const requested = new URL(req.url).searchParams.get("layer");
  if (!requested) return json({ layers: Object.keys(layers) });
  const path = layers[requested];
  if (!path) return json({ error: "Unknown layer", allowed: Object.keys(layers) }, 400);
  const { data, error } = await db.storage.from("jalnetra-tier1").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return json({ error: error?.message ?? "Layer unavailable" }, 503);
  return json({ layer: requested, source: requested === "flood" || requested === "villages" ? "Sentinel-1" : "FAO GAUL", evidenceStatus: requested === "flood" || requested === "villages" ? "observed" : "reference", url: data.signedUrl, expiresIn: 3600 });
});
