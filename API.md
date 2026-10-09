# JalNetra incident API

One API for every part of JalNetra. Each part sends what it detects; the operator dashboard shows everything in one place and moves it through the lifecycle.

Base URL (prototype, Supabase Edge Function; final version moves to AWS API Gateway + Lambda with the same contract):
`https://oceaylrebzflgyxfjqfb.supabase.co/functions/v1/jalnetra-api`

Every request needs your team key in the header `x-jalnetra-key` (keys are in TEAM_KEYS.txt, shared privately).

## Send an incident
`POST /incidents`

```json
{
  "incident_type": "waterlogging",        // river_flood | waterlogging | pothole | leak
  "severity": "medium",                   // low | medium | high
  "confidence": 0.82,                     // 0..1, optional (default 0.5)
  "lat": 25.6093, "lng": 85.1376,
  "source": "dashcam",                    // satellite | forecast | cctv | dashcam | app | whatsapp | sms | call | sensor
  "observed_at": "2026-10-06T10:32:00Z",  // optional, defaults to now
  "language": "hi",                       // optional
  "title": "Knee-deep water at Boring Road junction",
  "evidence_url": "https://.../frame123.jpg",
  "details": { "depth_level": "medium", "rain_confirmed": true }   // anything part-specific
}
```

Response `201` with `{ "merged": false, "incident": {...} }`.
If an open incident of the same type already exists within 150 m (3 km for river floods) in the last 6 hours, the report is merged into it instead: `200` with `merged: true`, its `reports` count goes up and confidence rises.

Errors come back as `{ "error": "...", "details": [...] }` with status 400 (bad body), 401 (bad key), 403, 404 or 409.

curl:
```
curl -X POST "$API/incidents" -H "x-jalnetra-key: $KEY" -H "content-type: application/json" \
  -d '{"incident_type":"pothole","severity":"low","lat":25.61,"lng":85.14,"source":"app","title":"Pothole near bus stand"}'
```

Python:
```python
import requests
r = requests.post(f"{API}/incidents", headers={"x-jalnetra-key": KEY}, json={
    "incident_type": "leak", "severity": "high", "confidence": 0.9, "lat": 25.6, "lng": 85.1,
    "source": "sensor", "title": "Zone 3 losing 6% of inflow", "details": {"loss_pct": 6.1, "litres_per_day": 1800}})
print(r.status_code, r.json())
```

## Read incidents
- `GET /incidents?type=leak,pothole&status=detected,approved&bbox=84,25,86,27&limit=200`
- `GET /incidents/{id}` returns the incident plus its full history (`events`).
Each incident carries `overdue: true` when its SLA has passed and it is still open.

## Lifecycle (operator key only)
`PATCH /incidents/{id}` with `{ "status": "approved", "note": "optional" }`

| From | Allowed next |
| --- | --- |
| detected | approved, rejected |
| approved | ticketed, rejected |
| ticketed | fixed_claimed, escalated |
| fixed_claimed | verified, reopened |
| reopened | ticketed, escalated |
| escalated | ticketed, fixed_claimed |

SLA starts when the incident is created: 6 h (high), 24 h (medium), 72 h (low). Reopening restarts it.

## Health
`GET /health` (no key needed)

## Evidence (any key)
`POST /incidents/{id}/evidence` with `{ "note": "Re-check with Sentinel-1 ...", "data": {...}, "evidence_url": "..." }`
Adds proof to the incident's history without changing its status. The flood part uses this to attach each newer radar pass (`pipeline/reverify.py`).

## Contacts (operator to add, anyone to read)
- `GET /contacts?lat=26.12&lng=84.93&km=25` returns contacts sorted by distance.
- `POST /contacts` with `{ "name": "...", "role": "sarpanch|asha|ngo|official|volunteer", "phone": "+91XXXXXXXXXX", "place_name": "...", "district": "...", "lat": 26.1, "lng": 84.9 }`

## Warnings (operator)
- `GET /telephony` returns `{ "call": "omnidimension" | "twilio" | "not_configured", "demo_phone": "+91******0402" }`.
- `POST /incidents/{id}/alerts` with
  `{ "contact_ids": ["..."], "message": "Hindi text", "channel": "call" | "sms", "demo": true, "context": { "place", "title", "source", "observed", "safe_place" } }`
  - Calls go through the OmniDimension agent "JalNetra Flood Alert" (Hindi). It speaks `message` first, then answers questions using `context`. Config rows in `jn_config`: `omnidim_key`, `omnidim_agent`, `omnidim_from`.
  - `demo: true` also calls `jn_config.alert_phone`, so you can demo with zero contacts.
  - SMS (and calls when OmniDimension is not set) fall back to Twilio (`twilio_sid`, `twilio_token`, `twilio_from`). With neither, alerts are logged as `not_configured`.
- `GET /incidents/{id}/alerts` lists what was sent and what failed.


## Live prediction (v2026.10)

### Lifecycle for river floods
`detected > analyzing > alert_created > approved > contacted > evacuating > resolved > verified` (plus `rejected`, `reopened`, `escalated`).
Civic issues (potholes, waterlogging, leaks) keep `detected > approved > ticketed > fixed_claimed > verified`.
- `POST /incidents` with `"source": "forecast", "status": "alert_created"` creates a prediction alert that waits for an operator. Nothing is called automatically.
- A successful call on an `approved` flood incident moves it to `contacted` automatically.

### Model runs
- `GET /model/latest?mode=live` latest run of the monitoring worker (overall risk, river trend, counts per horizon, flagged villages with factors).
- `GET /model/runs` last 50 runs (summary).
- Worker: Supabase function `jalnetra-monitor`, called every 15 min by pg_cron (`x-cron-token` header). It fetches GloFAS + Open-Meteo, runs `engine/core.ts` (same file as the website), stores the run in `jn_model_runs`, every input in `jn_env_observations` (ts, lat, lng, source, type, value, unit, confidence, forecast), and opens `alert_created` incidents for HIGH/CRITICAL villages. AWS later: EventBridge rule + Lambda, model.json in S3.

### Calls
- `POST /incidents/{id}/alerts` accepts `context: { village, risk, impact_time, safe_place, route, model_updated, simulated, ... }`. The OmniDimension agent answers questions ("हमें कहाँ जाना चाहिए?", "बाढ़ कब तक आ सकती है?", "कौन सा रास्ता सुरक्षित है?") only from these facts.
- After the call: `jn_alerts.call_status`, `summary`, `transcript`, `questions`, `outcome` are filled by the OmniDimension post-call webhook (`POST /hooks/omnidim?token=...`) and by a sync on `GET /incidents/{id}/alerts`.

### The model (transparent, replaceable)
- `src/engine/core.ts`: river forecast per station = damped trend + water arriving from upstream (6.78 km/h, fitted to 2026 peak timing) + rain response (15 m3/s per mm, peak 36 h later) blended with the GloFAS forecast when live. Horizons +3/+6/+12/+24 h with a confidence band.
- Village flood probability: logistic model on ln(72 h max flow / 4000), lowest ground within 500 m, village height, distance to channel. Fitted to which villages Sentinel-1 saw flooded on 26 Sep, 29 Sep, 3 Oct 2026 (`predict/calib3.py`). Leave-one-date-out coefficients are stored for validation.
- Flood extent: pixel logistic model on the same flow plus height above channel and distance (`predict/calib5.py`), shown where probability >= 15%.
- Risk score 0-100 = probability 45 + time to impact 15 + low ground 10 + near river 10 + river rising 10 + rain 10. CRITICAL needs probability >= 50%, score >= 65 and impact <= 12 h.
- Depth is not estimated (no stage gauge or hydraulic model). Population is not estimated (no data loaded).
