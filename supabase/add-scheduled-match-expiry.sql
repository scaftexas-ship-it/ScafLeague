-- Cancels expired matches on a schedule, instead of only when somebody opens
-- the app. Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Today the only thing that expires matches is reconcileExpiredMatches(), which
-- fires on page load in the admin workspace and the player workspace. That's
-- fine while people are using the app, but if nobody signs in for a week those
-- matches sit in 'scheduled' and standings keep treating them as still to play.
-- This adds a nightly pg_cron job so expiry happens on its own. The page-load
-- path stays -- it gives immediate consistency when someone does visit, and both
-- paths use identical rules so they can never disagree.
--
-- Rule, matching lib/league-rules.ts expireUnplayedMatches() and
-- lib/admin-data.ts reconcileExpiredMatches() exactly:
--   status in ('scheduled', 'score_submitted') and extension_week_end < <today>
--
-- <today> is the UTC date, because the app derives it from
-- new Date().toISOString().slice(0, 10) (see todayIso() in lib/format.ts).
-- Keeping UTC here is deliberate: matching the client is more important than
-- matching Central time, since a mismatch would make the two paths cancel
-- different sets of matches. The job is scheduled overnight in Texas so the
-- local day is genuinely over by the time it runs.

-- 1. Enable pg_cron. Can also be done from Dashboard -> Database -> Extensions.
create extension if not exists pg_cron;

-- 2. The expiry itself, as a function so the cron command stays trivial and the
--    rule lives in exactly one place in the database.
create or replace function public.cancel_expired_matches()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cancelled_count integer;
begin
  update public.matches
     set status = 'cancelled'
   where status in ('scheduled', 'score_submitted')
     and extension_week_end < (now() at time zone 'utc')::date;

  get diagnostics cancelled_count = row_count;
  return cancelled_count;
end;
$$;

-- Cron runs this as the job owner, so no client ever needs to call it.
revoke all on function public.cancel_expired_matches() from public;
revoke all on function public.cancel_expired_matches() from anon;
revoke all on function public.cancel_expired_matches() from authenticated;

-- 3. Schedule it nightly at 08:17 UTC (~2-3am Central, after the local day has
--    ended). Unschedule first so re-running this file doesn't stack duplicate
--    jobs. Off-the-hour minute on purpose -- :00 is the busiest slot.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cancel-expired-matches') then
    perform cron.unschedule('cancel-expired-matches');
  end if;
end
$$;

select cron.schedule('cancel-expired-matches', '17 8 * * *', $$select public.cancel_expired_matches();$$);

-- Check on it later with:
--   select jobid, jobname, schedule, active from cron.job;
--   select jobid, status, return_message, start_time
--     from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'cancel-expired-matches')
--    order by start_time desc limit 10;
