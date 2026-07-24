-- Adds a per-tournament logo, shown on that tournament's public leaderboard
-- page -- for clubs running leagues for multiple different sports clubs, so
-- each one's leaderboard link can carry its own branding instead of the
-- single club-wide logo from add-club-logo.sql. Run once in the Supabase SQL
-- Editor. Safe to re-run (every statement is idempotent).
--
-- Reuses the club-logos storage bucket and its existing policies (public
-- select, admin-only write) under a tournaments/{id}/ path -- those policies
-- key off bucket_id only, not path, so no new bucket or storage policy is
-- needed. tournaments is already publicly readable (see
-- add-public-leaderboard.sql), so the new column needs no RLS change either.

alter table public.tournaments add column if not exists logo_url text;
