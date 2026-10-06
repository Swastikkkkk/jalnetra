import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type SourceStatus = "observed" | "forecast" | "unavailable";
type SourceResult = {
  source: string;
  observedAt: string | null;
  fetchedAt: string;
  status: SourceStatus;
  coverage: number;
  values: unknown;
  sourceUrl?: string;
  limitation?: string;
};
type Village = { id: string; name: string; lat: number; lng: number; district?: string; inCorr?: boolean; corrDist?: number };

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const now = () => new Date().toISOString();

async function sourceFetch(source: string, envName: string, status: SourceStatus): Promise<SourceResult> {
  const fetchedAt = now();
  const url = Deno.env.get(envName);
  if (!url) return { source, observedAt: null, fetchedAt, status: "unavailable", coverage: 0, values: {}, limitation: `${envName} is not configured` };
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) return { source, observedAt: null, fetchedAt, status: "unavailable", coverage: 0, values: {}, sourceUrl: url, limitation: `Provider returned HTTP ${response.status}` };
    const values = await response.json();
    return { source, observedAt: values.observed_at ?? values.time ?? null, fetchedAt, status, coverage: Number(values.coverage ?? 1), values, sourceUrl: url };
  } catch (error) {
    return { source, observedAt: null, fetchedAt, status: "unavailable", coverage: 0, values: {}, sourceUrl: url, limitation: String(error) };
  }
}

async function villages(): Promise<Village[]> {
  const url = Deno.env.get("LIVE_VILLAGES_URL");
  if (!url) return [];
  const response = await fetch(url);
  if (!response.ok) return [];
  const value = await response.json();
  return Array.isArray(value) ? value : value.villages ?? [];
}

function fingerprint(villageIds: string[], sourceTime: string) {
  return `${sourceTime}:${villageIds.sort().join(",")}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const expected = Deno.env.get("LIVE_PROTECTION_SECRET");
  const suppliedSecret = req.headers.get("x-live-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || suppliedSecret !== expected) return json({ error: "Unauthorized" }, 401);

  const [rain, river, gauge, radar, villageData] = await Promise.all([
    sourceFetch("NASA GPM IMERG", "NASA_GPM_FEED_URL", "observed"),
    sourceFetch("GloFAS", "GLOFAS_FEED_URL", "forecast"),
    sourceFetch("CWC/local gauge", "CWC_GAUGE_FEED_URL", "observed"),
    sourceFetch("Sentinel-1", "SENTINEL1_FEED_URL", "observed"),
    villages(),
  ]);
  const fetched = [rain, river, gauge, radar];
  await db.from("jn_live_observations").insert(fetched.map(x => ({
    source: x.source, observed_at: x.observedAt, fetched_at: x.fetchedAt, status: x.status,
    coverage: x.coverage, values: x.values, source_url: x.sourceUrl ?? null, limitation: x.limitation ?? null,
  })));

  const riverValues = river.values as { warning?: boolean; peak_ratio?: number; observed_at?: string } ?? {};
  const radarValues = radar.values as { affected_villages?: string[]; observed_at?: string } ?? {};
  const observedVillageIds = new Set(radarValues.affected_villages ?? []);
  const candidates = villageData.filter(v => v.inCorr || observedVillageIds.has(v.id)).map(v => ({
    id: v.id, name: v.name, district: v.district ?? null,
    evidence: observedVillageIds.has(v.id) ? "observed_satellite" : "potential_impact",
    status: observedVillageIds.has(v.id) ? "observed" : "modelled",
  }));
  if (river.status === "forecast" && riverValues.warning && candidates.length) {
    const ids = candidates.map(v => v.id);
    const observedAt = riverValues.observed_at ?? river.observedAt ?? now();
    const { error } = await db.from("jn_alert_candidates").upsert({
      fingerprint: fingerprint(ids, observedAt), title: "Upstream river forecast requires review",
      severity: Number(riverValues.peak_ratio ?? 0) >= 1 ? "high" : "medium", source: "GloFAS",
      observed_at: observedAt, confidence: Math.min(1, Number(riverValues.peak_ratio ?? 0.5)),
      villages: candidates, evidence: { rain, river, gauge, radar }, expires_at: new Date(Date.now() + 24 * 3600e3).toISOString(),
      updated_at: now(),
    }, { onConflict: "fingerprint" });
    if (error) return json({ error: error.message }, 500);
  }
  return json({ ok: true, fetched, candidateVillages: candidates.length, sources: fetched.map(x => ({ source: x.source, status: x.status, limitation: x.limitation })) });
});
