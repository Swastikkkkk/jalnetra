// JalNetra River Watch worker. Every 3 hours (pg_cron; EventBridge on AWS later): GloFAS 7-day forecast for every
// river point in India, compare with each point's 2025 monsoon, store the result, and open an operator alert for
// each point in WARNING or DANGER with its low-lying riverside villages. Never calls anyone.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { needsAlert, statusOf, summarise, villagesAtRisk, type RiverPoint, type Village } from "./india.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SITE = "https://jalnetra-flood-map.vercel.app";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const { data: tk } = await db.from("jn_config").select("value").eq("key", "cron_token").maybeSingle();
  if (!tk || (req.headers.get("x-cron-token") ?? new URL(req.url).searchParams.get("token")) !== tk.value) return json({ error: "bad token" }, 401);
  const D = await fetch(`${SITE}/india/rivers.json`).then((r) => r.json()) as { points: RiverPoint[] };
  const today = new Date().toISOString().slice(0, 10), sts = [];
  try {
    for (let i = 0; i < D.points.length; i += 90) {
      const ch = D.points.slice(i, i + 90);
      const u = `https://flood-api.open-meteo.com/v1/flood?latitude=${ch.map((p) => p.glat).join(",")}&longitude=${ch.map((p) => p.glng).join(",")}&daily=river_discharge&past_days=3&forecast_days=8`;
      let j: any = null;
      for (let k = 0; k < 4 && !j; k++) { const r = await fetch(u).catch(() => null); if (r?.ok) j = await r.json(); else await new Promise((s) => setTimeout(s, 15000 * (k + 1))); }
      if (!j) throw new Error("GloFAS unavailable");
      (Array.isArray(j) ? j : [j]).forEach((x: any, k: number) => sts.push(statusOf(ch[k], x.daily.time, x.daily.river_discharge, today)));
      if (i + 90 < D.points.length) await new Promise((s) => setTimeout(s, 10000)); // stay under GloFAS/Open-Meteo's 600 calls per minute
    }
  } catch (e) {
    await db.from("jn_river_runs").insert({ points: D.points.length, normal: 0, rising: 0, warning: 0, danger: 0, headline: "unavailable", flagged: [], error: String(e) });
    return json({ error: String(e) }, 502);
  }
  const P = new Map(D.points.map((p) => [p.id, p]));
  const sum = summarise(sts, P);
  const hot = sts.filter((s) => s.status !== "NORMAL");
  let V: Village[] = [];
  if (hot.some((s) => s.status === "WARNING" || s.status === "DANGER")) V = await fetch(`${SITE}/india/villages.json`).then((r) => r.json());
  const flagged = hot.map((s) => { const p = P.get(s.id)!; const vs = villagesAtRisk(s, V.filter((v) => v.p === s.id)); return { id: s.id, river: p.river, near: p.near, state: p.state, lat: p.lat, lng: p.lng, status: s.status, trend: s.trend, alert: needsAlert(s), now: Math.round(s.now), peak: Math.round(s.peak), peakDay: s.peakDay, crossDay: s.crossDay, villages: vs.length, top: vs.slice(0, 25).map((v) => v.n) }; });
  const statuses = sts.map((s) => [s.id, s.status, Math.round(s.now), Math.round(s.peak), s.peakDay, s.crossDay, s.trend]);
  const { data: row } = await db.from("jn_river_runs").insert({ points: sts.length, normal: sum.by.NORMAL, rising: sum.by.RISING, warning: sum.by.WARNING, danger: sum.by.DANGER, headline: sum.headline, flagged, statuses }).select("id").single();
  let created = 0;
  for (const f of flagged.filter((x) => x.alert)) {
    const { data: near } = await db.from("jn_incidents").select("id").eq("incident_type", "river_flood").in("status", ["detected", "alert_created", "approved", "contacted", "evacuating", "escalated"])
      .gte("lat", f.lat - 0.1).lte("lat", f.lat + 0.1).gte("lng", f.lng - 0.1).lte("lng", f.lng + 0.1).limit(1);
    if (near?.length) { await db.from("jn_events").insert({ incident_id: near[0].id, action: "prediction_update", actor: "jalnetra-rivers", note: `${f.status}: peak ${f.peak} m3/s`, data: f }); continue; }
    const why = `GloFAS forecast peak ${f.peak} m3/s ${f.peakDay === 0 ? "today" : `in ${f.peakDay} days`} on the ${f.river} near ${f.near}; ${f.villages} low-lying villages nearby`;
    const { data: ins } = await db.from("jn_incidents").insert({ incident_type: "river_flood", severity: f.status === "DANGER" ? "high" : "medium", confidence: 0.5, lat: f.lat, lng: f.lng, source: "forecast", title: `River Watch: ${f.river} near ${f.near} ${f.status}`, details: { river_watch: f, prediction: { level: f.status, why } }, reported_by: "jalnetra-rivers", status: "alert_created", sla_due: new Date(Date.now() + (f.status === "DANGER" ? 6 : 24) * 3600e3).toISOString() }).select("id").single();
    if (ins) { created++; await db.from("jn_events").insert({ incident_id: ins.id, action: "alert_created", actor: "jalnetra-rivers", note: why }); }
  }
  if (row) await db.from("jn_river_runs").update({ alerts_created: created }).eq("id", row.id);
  return json({ run: row?.id, ...sum.by, headline: sum.headline, alerts_created: created });
});
