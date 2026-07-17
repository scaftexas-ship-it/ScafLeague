-- Adds an optional DUPR rating field to player profiles. Run once in the
-- Supabase SQL Editor. Safe to re-run.
--
-- DUPR (Dynamic Universal Pickleball Rating) is only relevant to pickleball
-- players; it's a free-text, optional field alongside the existing generic
-- "rating" column, not required for any sport.

alter table public.player_profiles add column if not exists dupr_rating text;
