
create table if not exists name_candidates (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  name text not null,
  reading text not null,
  strokes_text text,
  stroke_total integer,
  char_count integer,
  memo text,
  tags text[] default '{}',
  actor text,
  owner_device_id text,
  status text default 'candidate',
  meaning text,
  nanori text,
  stroke_order text,
  like_mako boolean default false,
  like_nae boolean default false,
  created_at timestamptz default now()
);

alter table name_candidates add column if not exists status text default 'candidate';
alter table name_candidates add column if not exists meaning text;
alter table name_candidates add column if not exists nanori text;
alter table name_candidates add column if not exists stroke_order text;
alter table name_candidates add column if not exists like_mako boolean default false;
alter table name_candidates add column if not exists like_nae boolean default false;

create table if not exists name_comments (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  candidate_id uuid references name_candidates(id) on delete cascade,
  actor text,
  owner_device_id text,
  comment text not null,
  created_at timestamptz default now()
);

create table if not exists name_history (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  actor text,
  owner_device_id text,
  action text not null,
  candidate_name text,
  candidate_reading text,
  detail text,
  created_at timestamptz default now()
);

alter table name_candidates enable row level security;
alter table name_comments enable row level security;
alter table name_history enable row level security;

drop policy if exists "anon candidates read" on name_candidates;
drop policy if exists "anon candidates insert" on name_candidates;
drop policy if exists "anon candidates update" on name_candidates;
drop policy if exists "anon candidates delete" on name_candidates;
drop policy if exists "anon comments read" on name_comments;
drop policy if exists "anon comments insert" on name_comments;
drop policy if exists "anon comments delete" on name_comments;
drop policy if exists "anon history read" on name_history;
drop policy if exists "anon history insert" on name_history;
drop policy if exists "anon history delete" on name_history;

create policy "anon candidates read" on name_candidates for select using (true);
create policy "anon candidates insert" on name_candidates for insert with check (true);
create policy "anon candidates update" on name_candidates for update using (true);
create policy "anon candidates delete" on name_candidates for delete using (true);
create policy "anon comments read" on name_comments for select using (true);
create policy "anon comments insert" on name_comments for insert with check (true);
create policy "anon comments delete" on name_comments for delete using (true);
create policy "anon history read" on name_history for select using (true);
create policy "anon history insert" on name_history for insert with check (true);
create policy "anon history delete" on name_history for delete using (true);
