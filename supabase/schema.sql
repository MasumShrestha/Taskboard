-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Each board is one row; its columns/cards/sprints live in the `data` JSON document.

create table if not exists public.boards (
  id         text primary key,
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists boards_owner_idx on public.boards (owner);

alter table public.boards enable row level security;

-- Each user can only see and change their own boards.
create policy "own boards: select" on public.boards for select using (owner = auth.uid());
create policy "own boards: insert" on public.boards for insert with check (owner = auth.uid());
create policy "own boards: update" on public.boards for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy "own boards: delete" on public.boards for delete using (owner = auth.uid());
