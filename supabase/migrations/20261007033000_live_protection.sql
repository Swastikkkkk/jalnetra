create table if not exists public.jn_live_observations (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  observed_at timestamptz,
  fetched_at timestamptz not null default now(),
  status text not null check (status in ('observed', 'forecast', 'unavailable')),
  coverage numeric not null default 0 check (coverage >= 0 and coverage <= 1),
  values jsonb not null default '{}'::jsonb,
  source_url text,
  limitation text,
  created_at timestamptz not null default now()
);

create index if not exists jn_live_observations_source_time
  on public.jn_live_observations (source, fetched_at desc);

create table if not exists public.jn_alert_candidates (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  title text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed', 'expired')),
  source text not null,
  observed_at timestamptz,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  villages jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jn_alert_candidates_status
  on public.jn_alert_candidates (status, created_at desc);

create table if not exists public.jn_alert_cooldowns (
  fingerprint text primary key,
  last_sent_at timestamptz not null,
  channel text not null,
  incident_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.jn_alert_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.jn_alert_candidates(id) on delete cascade,
  contact_id uuid references public.jn_contacts(id) on delete set null,
  status text not null check (status in ('sent', 'acknowledged', 'no_response', 'failed')),
  acknowledged_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

alter table public.jn_live_observations enable row level security;
alter table public.jn_alert_candidates enable row level security;
alter table public.jn_alert_cooldowns enable row level security;
alter table public.jn_alert_acknowledgements enable row level security;
