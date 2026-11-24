-- Reelhouse Music — listener preferences
-- ---------------------------------------------------------------------------
-- Apply after 0003_music.sql. This is a new table only; it does not alter any
-- existing library row or policy.
--
-- Genre preferences are explicit signals chosen by the listener. They are
-- combined client-side with likes, follows, recently played tracks and
-- playlist genres to build recommendations. The table is intentionally small:
-- one row per listener, owner-only RLS, no public reads.
-- ---------------------------------------------------------------------------

create table if not exists public.user_music_preferences (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  favorite_genres text[] not null default '{}'::text[],
  updated_at      timestamptz not null default now(),
  constraint user_music_preferences_genres_count
    check (cardinality(favorite_genres) <= 8),
  constraint user_music_preferences_genres_size
    check (cardinality(favorite_genres) = 0 or char_length(array_to_string(favorite_genres, '')) <= 480)
);

drop trigger if exists touch_user_music_preferences on public.user_music_preferences;
create trigger touch_user_music_preferences
  before update on public.user_music_preferences
  for each row execute function public.touch_updated_at();

alter table public.user_music_preferences enable row level security;

drop policy if exists "music preferences: owner all" on public.user_music_preferences;
create policy "music preferences: owner all" on public.user_music_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
