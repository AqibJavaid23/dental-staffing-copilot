-- 003_service_catalog.sql — Phase 2, Brick 1: Service Catalog
-- Additive only. Rollback: drop table services;

create table if not exists services (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  name        text not null,
  department  text,
  description text,
  status      text not null default 'active',   -- 'active' | 'archived'
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
alter table services disable row level security;

-- Seed. CONFIRMED with George:
insert into services (code, name, department, description, sort_order) values
  ('provider_recruiting', 'Provider Recruiting & Sourcing', 'Talent & Recruiting', 'Sourcing, outreach, and recruiting of dentists and hygienists.', 10),
  ('practice_coaching',   'Practice Coaching & Support',    'Client Success',      'Ongoing coaching, check-ins, and support for client practices.', 20)
on conflict (code) do nothing;

-- SUGGESTED extras (confirm with George — edit or delete before running):
insert into services (code, name, department, description, sort_order) values
  ('billing_rcm',  'Billing & Revenue Cycle', 'Revenue Cycle', 'Claims, billing, and revenue-cycle management.', 30),
  ('scheduling',   'Scheduling & Front Desk', 'Operations',    'Scheduling and front-desk / patient coordination support.', 40),
  ('marketing',    'Marketing & Growth',      'Marketing',     'Marketing, campaigns, and growth support.', 50)
on conflict (code) do nothing;