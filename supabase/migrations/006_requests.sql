-- 006_requests.sql — Phase 2, Brick 3: Requests (Intake & Triage)
-- Additive only. Rollback: alter table work_items drop column request_id; drop table requests;

create table if not exists requests (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  service_id   uuid references services(id),
  title        text not null,
  details      text,
  channel      text not null default 'manual',   -- manual | email | phone | portal
  status       text not null default 'new',      -- new | triaged | in_progress | resolved | closed | rejected
  priority     text,                             -- low | normal | high | urgent (set at triage)
  requested_by uuid references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table requests disable row level security;
create index if not exists idx_requests_org on requests(org_id);
create index if not exists idx_requests_status on requests(status);

alter table work_items add column if not exists request_id uuid references requests(id);