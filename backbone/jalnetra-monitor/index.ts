// JalNetra monitoring worker. Runs on a schedule (pg_cron, every 15 min; EventBridge on AWS later):
// fetch live river + rain data, run the same prediction engine the website uses, store the run and its inputs,
// and open an alert for every newly HIGH or CRITICAL village. It never calls anyone: calls need an operator.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { runModel, type ModelParams } from "./core.ts";
import { liveInputs } from "./sources.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lng - a.lng) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
};
const OPEN = ["detected", "analyzing", "alert_created", "approved", "contacted", "evacuating", "escalated"];

Deno.serve(async (req) => {
  const { data: tk } = await db.from("jn_config").select("value").eq("key", "cron_token").maybeSingle();
  const given = req.headers.get("x-cron-token") ?? new URL(req.url).searchParams.get("token");
  if (!tk || given !== tk.value) return json({ error: "bad token" }, 401);
  // model parameters: same model.json the website ships (stored in jn_config; S3 object on AWS later)
  const { data: mj } = await db.from("jn_config").select("value").eq("key", "model_json").maybeSingle();
  const P = (mj ? JSON.parse(mj.value) : await fetch("https://jalnetra-flood-map.vercel.app/model.json").then((r) => r.json())) as ModelParams;
  let inp;
  try { inp = await liveInputs(P); } catch (e) {
    await db.from("jn_model_runs").insert({ mode: "live", issued_for: new Date().toISOString(), model_version: P.version, overall: "UNKNOWN", river: "unknown", rain_level: "unknown", at_risk: 0, counts: {}, stations: [], villages: [], inputs: {}, error: `Live sources unavailable: ${e}` });
    return json({ error: String(e) }, 502);
  }
  const run = runModel(P, inp);
  const V = new Map(P.villages.map((v) => [v.id, v]));
  const flagged = run.villages.filter((v) => v.level !== "LOW").map((r) => {
    const v = V.get(r.id)!;
    return { id: r.id, name: v.name, district: v.district, lat: v.lat, lng: v.lng, level: r.level, p: Math.round(r.pMax * 100) / 100, impactH: r.impactH, window: r.window, score: r.score, conf: r.conf, action: r.action, factors: r.factors.map((f) => ({ label: f.label, pts: Math.round(f.pts), detail: f.detail })) };
  });
  const stations = run.stations.map((s) => ({ name: s.name, label: s.label, q0: Math.round(s.q0), trend: s.trend, h: [0, 3, 6, 12, 24].map((h, k) => ({ h, q: Math.round(s.q[72 + h]), conf: s.conf[k] })) }));
  const { data: row, error } = await db.from("jn_model_runs").insert({
    mode: "live", issued_for: new Date(run.now).toISOString(), model_version: P.version, overall: run.overall, river: run.river, rain_level: run.rainLevel,
    at_risk: run.atRisk, counts: run.counts, stations, villages: flagged, inputs: run.inputs,
  }).select("id").single();
  if (error) return json({ error: error.message }, 500);
  await db.from("jn_env_observations").insert(inp.observations.map((o) => ({ ...o, run_id: row.id, forecast: !!o.forecast })));

  let created = 0;
  for (const f of flagged.filter((x) => x.level === "HIGH" || x.level === "CRITICAL")) {
    const { data: near } = await db.from("jn_incidents").select("id, lat, lng").eq("incident_type", "river_flood").in("status", OPEN)
      .gte("lat", f.lat - 0.03).lte("lat", f.lat + 0.03).gte("lng", f.lng - 0.03).lte("lng", f.lng + 0.03);
    const dup = (near ?? []).find((i) => metres(i, f) <= 3000);
    const why = f.factors.filter((x) => x.pts >= 3).map((x) => `${x.label}: ${x.detail}`).join("; ");
    const prediction = { ...f, why, run_id: row.id, issued_for: new Date(run.now).toISOString(), model_version: P.version };
    if (dup) {
      await db.from("jn_events").insert({ incident_id: dup.id, action: "prediction_update", actor: "jalnetra-monitor", note: `${f.level}, impact ${f.impactH === null ? "not within 48 h" : f.impactH === 0 ? "now" : `~${f.impactH} h`}`, data: { prediction } });
      continue;
    }
    const sev = "high", now = new Date().toISOString();
    const { data: ins } = await db.from("jn_incidents").insert({
      incident_type: "river_flood", severity: sev, confidence: Math.min(1, Math.max(0, f.p)), lat: f.lat, lng: f.lng, observed_at: now, source: "forecast", language: "hi",
      title: `Predicted flood: ${f.name} ${f.level}, impact ${f.impactH === 0 ? "now" : `~${f.impactH} h`}`, details: { village: f.name, district: f.district, prediction }, reported_by: "jalnetra-monitor",
      status: "alert_created", sla_due: new Date(Date.now() + 6 * 3600e3).toISOString(),
    }).select("id").single();
    if (ins) {
      created++;
      await db.from("jn_events").insert([{ incident_id: ins.id, action: "detected", actor: "jalnetra-monitor", note: "Live model run", data: { run_id: row.id } }, { incident_id: ins.id, action: "alert_created", actor: "jalnetra-monitor", note: why, data: { prediction } }]);
    }
  }
  await db.from("jn_model_runs").update({ alerts_created: created }).eq("id", row.id);
  return json({ run_id: row.id, overall: run.overall, river: run.river, at_risk: run.atRisk, alerts_created: created, observations: inp.observations.length });
});
