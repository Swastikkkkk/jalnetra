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
  -> POST only new candidate incidents to /incidents
  -> operator reviews in the dashboard
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
