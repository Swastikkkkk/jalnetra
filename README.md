<p align="center"><img src="public/brand/jalnetra-logo.png" alt="JalNetra" width="340" /></p>

# JalNetra: Because 2 Hours 43 Minutes Is Too Late

> On 26 August 2026 a glacier collapsed above Langtang in Nepal. The flood raced **226 km** to the Indian border.
> The first alarm on the gauge network came **2 h 43 min** after the collapse. By then the gauges near the source had gone dark, still reading normal.
>
> **JalNetra closes that gap**: it watches every river, finds the villages the water will reach, and lets a person approve a Hindi warning call to the village head. Hours earlier.

**Live demo:** https://d1oi8xa605dsj6.cloudfront.net

---

## What it does

| | |
|---|---|
| **Watch** | 681 river points across India, checked every 3 hours against each river's own record |
| **Predict** | Which of 291 villages along the Gandak the water reaches, and when (now, +3, +6, +12, +24 h) |
| **Decide** | A person reviews the map and the advisory, then approves or rejects. Nothing is automatic |
| **Warn** | One Hindi voice call, a spoken advisory, a 3D evacuation route and an AR arrow to the safe place |

The flow of the site: **Home → Glacier story → Live map → Approve → the phone rings.**

## How it runs on AWS

```mermaid
flowchart LR
  OM[Open-Meteo / GloFAS<br/>river forecasts] --> MON
  subgraph AWS[AWS · ap-south-1]
    EB[EventBridge Scheduler<br/>every 3 h] --> MON[Lambda<br/>river monitor]
    MON --> S3[(S3<br/>snapshot · audio)]
    S3 --> CF[CloudFront + WAF]
    MON -- rising river --> SNS[SNS<br/>alerts topic]
    APIGW[API Gateway] --> API[Lambda<br/>API]
    API --> RDS[(RDS PostgreSQL<br/>call ledger · limits)]
    API --> SM[Secrets Manager]
    API --> BR[Bedrock<br/>drafts advisory]
    API --> PO[Polly<br/>Hindi speech]
    API --> LOC[Location Service<br/>walking route]
    API --> RK[Rekognition<br/>flood photo check]
    API --> SF[Step Functions<br/>approval follow-up] --> SNS
    PO --> S3
    API --> CW[CloudWatch]
  end
  CF --> U((Operator · village head))
  U --> APIGW
  API --> VA[AI voice agent] --> PH((Village head's phone))
```

| Service | Job |
|---|---|
| **Lambda** | River monitor, API, approvals, helpers |
| **EventBridge Scheduler** | Runs the monitor every 3 hours |
| **API Gateway** | Public API, throttled |
| **S3 + CloudFront + WAF** | Website, river snapshot, Hindi audio; rate limits and managed rules |
| **RDS PostgreSQL** | Call ledger, per-alert and daily limits |
| **Secrets Manager** | Keys and the one allowed destination number |
| **Bedrock** (Nova Lite) | Fact-bound Hindi and English advisory drafts, always human-reviewed |
| **Polly** (Kajal) | Spoken Hindi advisory, cached in S3 |
| **Location Service** | Real walking routes to the safe place |
| **Rekognition** | First-screen check of a citizen's flood photo |
| **Step Functions + SNS** | After approval: wait, check, escalate. A call is never retried |
| **SQS** | Alert queue with a dead-letter queue |
| **CloudWatch** | Logs, alarms, the `JalNetra-operations` dashboard |
| **IAM, VPC, CDK** | Least-privilege roles, private networking, infrastructure as code |

Full list, resource names and teardown: [`infra/AWS-SERVICES.md`](infra/AWS-SERVICES.md).

## How good is it? (honest numbers)

Tested against real Sentinel-1 radar flood maps from the 2026 event, leaving each radar date out when training:

- Caught **56% and 66%** of the villages the radar later saw flooded, with false alarms
- Ranking skill (AUC) **0.72 to 0.75** (0.5 is a coin flip)
- An early-warning screen, not a guarantee. **A person always decides**

## Safety by design

- No call is ever automatic. Opening or selecting an alert never calls anyone
- A call can reach **only** the configured demo phone. No route accepts a phone number
- One attempt per alert, a cooldown, 3 calls per session and a daily cap, enforced on the server
- "Dispatched" is never shown as "answered". Failed or unknown outcomes stay locked
- Exercise data is labelled EXERCISE everywhere and kept apart from real incidents

## Repo map

| Path | What |
|---|---|
| `src/` | React 19 + TypeScript + Vite site: Home, Glacier story, Live map, Validation, Route and AR |
| `aws-api/` | Lambda API and river monitor, with tests (`npm test`) |
| `infra/` | AWS CDK stack and [`AWS-SERVICES.md`](infra/AWS-SERVICES.md) |
| `pipeline/` | Python scripts that build the flood data from Sentinel and GloFAS |
| `presentation/` | Standalone 3D data-flow scene and the voice-over |

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # single-file dist/index.html
```

API: `cd aws-api && npm install && npm test`. Infrastructure: `cd infra && npm install && npx cdk synth`.

## Data

Sentinel-1 and Sentinel-2 (Microsoft Planetary Computer) · GloFAS river discharge and rain (Open-Meteo) · Copernicus DEM GLO-30 · OpenStreetMap · GeoNames

---

*JalNetra: जल (water) + नेत्र (eye). The eye on the water.*
