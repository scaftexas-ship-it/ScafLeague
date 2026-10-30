-- Walkathon: let players back-date steps up to 92 days (about three months),
-- up from 7. Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Replaces one function and nothing else: the trigger that calls it already
-- exists, tables and data are untouched. The app allows the same 92 days
-- (STEP_BACKDATE_DAYS in lib/walkathon.ts), so run this BEFORE or right after
-- the app update -- until then the database still refuses anything older than
-- 7 days, with the message "Steps can only be logged up to 7 days back."

create or replace function public.walkathon_validate_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  window_start date;
  window_end date;
  wk date;
begin
  select w.start_date, w.end_date into window_start, window_end
  from public.walkathons w where w.id = new.walkathon_id;

  if new.entry_date < window_start or new.entry_date > window_end then
    raise exception 'That date is outside the walkathon (% to %).', window_start, window_end
      using errcode = 'check_violation';
  end if;

  -- Backdating window: about three months (92 days), for people who join late
  -- or only sync their watch now and then. Admins are exempt so someone can
  -- still correct the record after the fact.
  if not public.is_admin() then
    -- Both sides now read the clock in US Central, so the day of slack is
    -- only for a player whose device is set to another zone -- without it,
    -- anyone travelling east would be told their own today is in the future.
    -- A day of slack cannot be used to log a week ahead.
    if new.entry_date > (now() at time zone 'America/Chicago')::date + 1 then
      raise exception 'You can''t log steps for a date in the future.'
        using errcode = 'check_violation';
    end if;

    -- For a weekly total the clock starts when the week ENDED, not when it
    -- began, so a week stays postable for the whole window after it finishes.
    if (case when new.covers_week then new.entry_date + 6 else new.entry_date end) < (now() at time zone 'America/Chicago')::date - 92 then
      raise exception 'Steps can only be logged up to 92 days back.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Computed here rather than read from new.week_start. week_start is a
  -- GENERATED column and Postgres fills those in AFTER before-triggers run,
  -- so new.week_start is still null at this point -- comparing against it
  -- silently matched nothing and let a weekly total sit on top of the same
  -- week's daily entries, double counting both.
  wk := (date_trunc('week', new.entry_date::timestamp))::date;

  if new.covers_week then
    if exists (
      select 1 from public.walkathon_step_entries e
      where e.walkathon_id = new.walkathon_id and e.player_id = new.player_id
        and e.id <> new.id and not e.covers_week and e.week_start = wk
    ) then
      raise exception 'You already logged individual days in that week. Remove them before posting a weekly total.'
        using errcode = 'check_violation';
    end if;
  else
    if exists (
      select 1 from public.walkathon_step_entries e
      where e.walkathon_id = new.walkathon_id and e.player_id = new.player_id
        and e.id <> new.id and e.covers_week and e.week_start = wk
    ) then
      raise exception 'You already posted a weekly total for that week. Remove it before logging single days.'
        using errcode = 'check_violation';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
