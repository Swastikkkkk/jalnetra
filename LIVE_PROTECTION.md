# JalNetra live protection mode

JalNetra has two intentionally separate products:

- **Historical replay:** fixed, timestamped Sentinel-1 observations and event data.
- **Live protection:** current rainfall/river signals, modelled potential impact, and
  operator-approved warnings.

The frontend already refreshes the current river and rainfall view from Open-Meteo and
labels village evidence separately from potential impact. It must not call a village
affected from a forecast alone.

## Recommended production pipeline

```text
Supabase scheduled function
  -> fetch timestamped rainfall, river forecast, gauge, and satellite metadata
  -> normalise each source with freshness and coverage
  -> calculate village-level potential impact
  -> write deduplicated candidates to jn_alert_candidates
  -> operator reviews via GET/PATCH /alert-candidates
  -> operator sends Hindi call/SMS
  -> alert and acknowledgement are recorded in the incident history
```

The scheduled function should use a service-side secret and never expose provider
credentials to Vercel. Every source adapter must return `data_unavailable` when it cannot
cover the requested time or location; it must not substitute saved historical values for a
live observation.

## Source contracts

Each adapter should return:

```ts
{
  source: string
  observedAt: string
  fetchedAt: string
  status: 'observed' | 'forecast' | 'unavailable'
  coverage: number
  values: unknown
  sourceUrl?: string
  limitation?: string
}
```

Recommended adapters:

- NASA GPM IMERG: historical and near-real-time rainfall
- GloFAS: river discharge observations/forecasts
- CWC or an authoritative gauge source: local water levels
- Sentinel-1: observed flood-water confirmation
- Sentinel-2: cloud-free optical context
- Copernicus GLO-30: elevation and slope
- ESA WorldCover: land-cover exposure
- WorldPop/GHSL: estimated exposed population

## Alert policy

Forecast/modelled results create a review candidate, not a confirmed affected label.
Only the operator sends a public warning. A warning should include the source timestamp,
confidence/coverage, affected or potential-impact villages, and a safe-place candidate.

The current Vercel Hobby daily cron is suitable for demonstrations, not emergency response.
For operational monitoring, run this scheduler in Supabase or AWS at an hourly or
15-minute cadence and keep the existing incident API contract unchanged.

## Current Supabase deployment

The additive schema is deployed to project `oceaylrebzflgyxfjqfb`. The
`live-protection` Edge Function is deployed and runs from the Supabase cron job
`jalnetra-live-protection` every 15 minutes. The scheduler invokes the function
with a vault-stored secret; provider URLs are intentionally not committed to the
repository.

Until a provider URL is configured, that source is recorded as `unavailable` and
no alert candidate is created from it. Configure these Supabase secrets only from
the project dashboard or CLI:

- `NASA_GPM_FEED_URL`
- `GLOFAS_FEED_URL`
- `CWC_GAUGE_FEED_URL`
- `SENTINEL1_FEED_URL`
- `LIVE_VILLAGES_URL`

The existing authenticated incident API now exposes the review workflow:

- `GET /alert-candidates?status=pending` lists modelled candidates.
- `PATCH /alert-candidates/{id}` with `{ "status": "approved" | "dismissed" | "expired" }`
  records an operator decision. It requires an operator API key.

Approval does not silently claim that a village was flooded. The candidate retains
its source evidence and modelled/potential-impact label; the operator must still
send a warning through the existing alert flow.
