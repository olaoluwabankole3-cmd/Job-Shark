-- Job-Shark initial Supabase schema.
-- Run this in the SQL Editor of the dedicated Job-Shark Supabase project.
-- Every user-owned table is protected by RLS; browser clients use only the publishable key.

create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  target_role text not null default '',
  country text not null default '',
  work_types text not null default '',
  skills text not null default '',
  cv_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  company text not null,
  url text not null,
  location text not null default '',
  work_type text not null default 'Full-time',
  salary text not null default '',
  source text not null default 'Added manually',
  fit_score integer not null default 0 check (fit_score between 0 and 100),
  eligibility_status text not null default 'Not verified',
  skills text[] not null default '{}',
  status text not null default 'needs-review'
    check (status in ('discovered', 'needs-review', 'approved', 'submitted', 'interview', 'rejected')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_opportunities_user_status_idx
  on public.job_opportunities(user_id, status);
create index if not exists job_opportunities_user_created_idx
  on public.job_opportunities(user_id, created_at desc);

create table if not exists public.application_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.job_opportunities(id) on delete cascade,
  event_type text not null,
  details text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists application_events_user_job_created_idx
  on public.application_events(user_id, job_id, created_at desc);

alter table public.user_profiles enable row level security;
alter table public.job_opportunities enable row level security;
alter table public.application_events enable row level security;

-- Each signed-in user can access only their own records.
create policy "Users manage their own profile"
  on public.user_profiles for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Users manage their own jobs"
  on public.job_opportunities for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users manage their own application events"
  on public.application_events for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.job_opportunities j
      where j.id = job_id and j.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.user_profiles to authenticated;
grant select, insert, update, delete on public.job_opportunities to authenticated;
grant select, insert, update, delete on public.application_events to authenticated;

-- Private CV bucket. Store uploads under <user-uuid>/<filename>.
insert into storage.buckets (id, name, public)
values ('job-shark-cvs', 'job-shark-cvs', false)
on conflict (id) do nothing;

create policy "Users can view their own CVs"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'job-shark-cvs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can upload their own CVs"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'job-shark-cvs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can update their own CVs"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'job-shark-cvs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'job-shark-cvs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can delete their own CVs"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'job-shark-cvs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
