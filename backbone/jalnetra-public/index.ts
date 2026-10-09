// Public, read-only status for the website: latest River Watch scan (all of India) and latest Gandak model run.
// No key needed: it only exposes model output computed from public data. Cached 5 minutes.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const H = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json", "Cache-Control": "public, max-age=300" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...H, "Access-Control-Allow-Headers": "content-type" } });
  const [{ data: river }, { data: gandak }] = await Promise.all([
    db.from("jn_river_runs").select("id, created_at, points, normal, rising, warning, danger, headline, flagged, statuses, alerts_created").is("error", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("jn_model_runs").select("id, created_at, overall, river, rain_level, at_risk, alerts_created").eq("mode", "live").is("error", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return new Response(JSON.stringify({ river, gandak, now: new Date().toISOString() }), { headers: H });
});
