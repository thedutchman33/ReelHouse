-- Reelhouse — Phase 2 follow-up: server-side series tracking
-- ---------------------------------------------------------------------------
-- Tracking used to live only in the browser's localStorage, so a followed
-- series disappeared on another device (and when storage was cleared) even
-- though the watchlist and watch history followed the account. This table gives
-- tracking the same account-scoped persistence, and adds a small append-only
-- analytics stream for adoption measurement.
--
-- Apply after 0001_init.sql in the Supabase SQL editor or with `supabase db
-- push` (the app degrades to local-only tracking until then).

-- -------------------------------- tracked ----------------------------------
create table if not exists public.tracked (
  user_id        uuid not null references auth.users (id) on delete cascade,
  media_id       text not null,
  -- Denormalized MediaSummary snapshot so Following renders without a TMDB
  -- round-trip, using the same shape as watchlist.media_snapshot.
  media_snapshot jsonb not null default '{}'::jsonb,
  -- all = every new episode, premieres = season premieres only, off = follow
  -- the show but suppress alerts.
  notify         text not null default 'all'
                 check (notify in ('all', 'premieres', 'off')),
  -- The client is the source of truth for when the show was followed, so the
  -- one-time localStorage → server migration preserves original timestamps.
  tracked_at     timestamptz not null default now(),
  primary key (user_id, media_id)
);

create index if not exists tracked_user_tracked_idx
  on public.tracked (user_id, tracked_at desc);

-- ----------------------------- tracking_events -----------------------------
-- Append-only analytics: follows, unfollows, alert changes and notification
-- clicks. Never updated, only inserted.
create table if not exists public.tracking_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  media_id   text,
  event_type text not null
             check (event_type in ('track', 'untrack', 'preference', 'notification_click', 'notification_open')),
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tracking_events_user_created_idx
  on public.tracking_events (user_id, created_at desc);

-- ============================ ROW-LEVEL SECURITY ===========================
alter table public.tracked         enable row level security;
alter table public.tracking_events enable row level security;

-- tracked: full CRUD limited to the owner.
drop policy if exists "tracked: owner all" on public.tracked;
create policy "tracked: owner all" on public.tracked
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- tracking_events: owner may insert and read their own; no update/delete.
drop policy if exists "tracking events: owner read"   on public.tracking_events;
drop policy if exists "tracking events: owner insert" on public.tracking_events;
create policy "tracking events: owner read" on public.tracking_events
  for select using (auth.uid() = user_id);
create policy "tracking events: owner insert" on public.tracking_events
  for insert with check (auth.uid() = user_id);
