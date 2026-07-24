create table if not exists public.asana_sync_state (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  last_synced_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asana_sync_events (
  event_key text primary key,
  contact_id uuid,
  created_at timestamptz not null default now()
);

grant all on public.asana_sync_state to service_role;
grant all on public.asana_sync_events to service_role;

alter table public.asana_sync_state enable row level security;
alter table public.asana_sync_events enable row level security;

create policy "Authenticated can read asana sync state"
  on public.asana_sync_state for select to authenticated using (true);
create policy "Authenticated can read asana sync events"
  on public.asana_sync_events for select to authenticated using (true);

create index if not exists idx_asana_sync_events_created_at on public.asana_sync_events(created_at);