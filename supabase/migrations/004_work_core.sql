-- 004_work_core.sql — Phase 2, Brick 2: Generalized Work Object
-- Additive only. Rollback: drop table activity_events, work_assignments, work_items;

create table if not exists work_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  service_id  uuid references services(id),
  title       text not null,
  description text,
  status      text not null default 'open',    -- open | in_progress | blocked | done | cancelled
  priority    text not null default 'normal',  -- low | normal | high | urgent
  source      text not null default 'manual',  -- manual | request | event | schedule | kpi | agent
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table work_items disable row level security;
create index if not exists idx_work_items_org on work_items(org_id);
create index if not exists idx_work_items_service on work_items(service_id);

create table if not exists work_assignments (
  id            uuid primary key default gen_random_uuid(),
  work_item_id  uuid not null references work_items(id) on delete cascade,
  assignee_type text not null,   -- user | team | agent
  assignee_id   uuid not null,   -- profiles.id or groups.id (polymorphic, no FK)
  is_primary    boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table work_assignments disable row level security;
create index if not exists idx_work_assign_item on work_assignments(work_item_id);

create table if not exists activity_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references organizations(id),
  actor_type  text not null default 'user',   -- user | system | agent
  actor_id    uuid,                            -- profiles.id when actor_type = user
  verb        text not null,                   -- work_item.created | work_item.assigned | work_item.status_changed
  entity_type text not null,                   -- work_item
  entity_id   uuid not null,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
alter table activity_events disable row level security;
create index if not exists idx_activity_entity on activity_events(entity_type, entity_id);
create index if not exists idx_activity_org on activity_events(org_id);