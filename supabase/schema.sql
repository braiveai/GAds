-- ============================================
-- Architect (by BRAIVE) - Supabase schema v1
-- ============================================
-- Run this in the Supabase SQL editor.

-- Extensions
create extension if not exists "uuid-ossp";

-- ============================================
-- BUILDS table
-- ============================================
-- One row per campaign architecture the agency creates.
-- For demo we hardcode agency_user_id = 'demo'; later this links to auth.users.
create table if not exists public.builds (
  id uuid primary key default uuid_generate_v4(),
  agency_user_id text not null default 'demo',
  brand_name text,
  brand_url text,
  status text not null default 'draft' check (status in ('draft','in_review','approved','live','archived')),
  -- Brief stage data
  brief jsonb,
  user_context jsonb default '{}'::jsonb,
  brand_guidelines text default '',
  name_suffix text default 'SA',
  account_negatives jsonb default '[]'::jsonb,
  channels jsonb default '["Search"]'::jsonb,
  lean_value int default 50,
  campaign_count int default 0,
  prioritized_angles jsonb default '[]'::jsonb,
  discovered_pages jsonb default '[]'::jsonb,
  selected_pages jsonb default '[]'::jsonb,
  pinned_pages jsonb default '[]'::jsonb,
  -- Architecture
  strategy_summary text default '',
  campaigns jsonb default '[]'::jsonb,
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists builds_agency_user_id_idx on public.builds(agency_user_id);
create index if not exists builds_status_idx on public.builds(status);
create index if not exists builds_updated_at_idx on public.builds(updated_at desc);

-- ============================================
-- REVIEWS table
-- ============================================
-- One row per /r/[token] link generated for a build.
create table if not exists public.reviews (
  id uuid primary key default uuid_generate_v4(),
  build_id uuid not null references public.builds(id) on delete cascade,
  token text not null unique,
  client_email text,
  email_subject text,
  email_body text,
  campaigns_snapshot jsonb,
  strategy_summary_snapshot text,
  brand_url_snapshot text,
  created_at timestamptz not null default now(),
  last_viewed_at timestamptz,
  completed_at timestamptz,
  general_feedback text
);

create index if not exists reviews_token_idx on public.reviews(token);
create index if not exists reviews_build_id_idx on public.reviews(build_id);

-- ============================================
-- APPROVALS table
-- ============================================
-- One row per approval action by the client.
-- scope: 'build' | 'campaign' | 'adgroup' | 'variation'
create table if not exists public.approvals (
  id uuid primary key default uuid_generate_v4(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  scope text not null check (scope in ('build','campaign','adgroup','variation')),
  scope_id text,
  status text not null check (status in ('approved','note','reset')),
  note_text text,
  created_at timestamptz not null default now()
);

create index if not exists approvals_review_id_idx on public.approvals(review_id);
create index if not exists approvals_scope_idx on public.approvals(scope, scope_id);

-- ============================================
-- TRIGGER: updated_at on builds
-- ============================================
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists builds_touch_updated_at on public.builds;
create trigger builds_touch_updated_at
  before update on public.builds
  for each row execute procedure public.touch_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
-- For demo we keep RLS off and rely on service-role key from server.
-- Anon key never touches these tables directly - all writes go via API routes.
-- When auth lands we'll flip RLS on.

alter table public.builds disable row level security;
alter table public.reviews disable row level security;
alter table public.approvals disable row level security;

-- ============================================
-- VIEWS
-- ============================================
-- Convenient view for the dashboard listing
create or replace view public.builds_with_review_summary as
select
  b.id,
  b.agency_user_id,
  b.brand_name,
  b.brand_url,
  b.status,
  b.created_at,
  b.updated_at,
  b.archived_at,
  jsonb_array_length(b.campaigns) as campaign_count,
  (select count(*) from public.reviews r where r.build_id = b.id) as review_count,
  (select max(r.last_viewed_at) from public.reviews r where r.build_id = b.id) as last_client_view,
  (
    select count(*) from public.approvals a
    join public.reviews r on a.review_id = r.id
    where r.build_id = b.id and a.status = 'approved'
  ) as approval_count,
  (
    select count(*) from public.approvals a
    join public.reviews r on a.review_id = r.id
    where r.build_id = b.id and a.status = 'note'
  ) as note_count
from public.builds b;
