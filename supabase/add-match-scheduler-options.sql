begin;

alter table public.matches add column if not exists round_label text;
alter table public.matches add column if not exists target_score integer;
alter table public.matches add column if not exists number_of_sets integer;
alter table public.matches add column if not exists restrict_score_updates boolean;
alter table public.matches add column if not exists score_update_before_days integer;
alter table public.matches add column if not exists score_update_after_days integer;
alter table public.matches add column if not exists allow_forfeit boolean;
alter table public.matches add column if not exists forfeit_before_days integer;
alter table public.matches add column if not exists forfeit_after_days integer;

update public.matches
set
  target_score = case when target_score is null or target_score <= 0 then 11 else target_score end,
  number_of_sets = case when number_of_sets is null or number_of_sets <= 0 then 3 else number_of_sets end,
  restrict_score_updates = coalesce(restrict_score_updates, false),
  score_update_before_days = case when score_update_before_days is null or score_update_before_days < 0 then 0 else score_update_before_days end,
  score_update_after_days = case when score_update_after_days is null or score_update_after_days < 0 then 0 else score_update_after_days end,
  allow_forfeit = coalesce(allow_forfeit, true),
  forfeit_before_days = case when forfeit_before_days is null or forfeit_before_days < 0 then 0 else forfeit_before_days end,
  forfeit_after_days = case when forfeit_after_days is null or forfeit_after_days < 0 then 0 else forfeit_after_days end;

alter table public.matches alter column target_score set default 11;
alter table public.matches alter column target_score set not null;
alter table public.matches alter column number_of_sets set default 3;
alter table public.matches alter column number_of_sets set not null;
alter table public.matches alter column restrict_score_updates set default false;
alter table public.matches alter column restrict_score_updates set not null;
alter table public.matches alter column score_update_before_days set default 0;
alter table public.matches alter column score_update_before_days set not null;
alter table public.matches alter column score_update_after_days set default 0;
alter table public.matches alter column score_update_after_days set not null;
alter table public.matches alter column allow_forfeit set default true;
alter table public.matches alter column allow_forfeit set not null;
alter table public.matches alter column forfeit_before_days set default 0;
alter table public.matches alter column forfeit_before_days set not null;
alter table public.matches alter column forfeit_after_days set default 0;
alter table public.matches alter column forfeit_after_days set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'matches_target_score_positive') then
    alter table public.matches add constraint matches_target_score_positive check (target_score > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'matches_number_of_sets_positive') then
    alter table public.matches add constraint matches_number_of_sets_positive check (number_of_sets > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'matches_score_update_before_days_nonnegative') then
    alter table public.matches add constraint matches_score_update_before_days_nonnegative check (score_update_before_days >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'matches_score_update_after_days_nonnegative') then
    alter table public.matches add constraint matches_score_update_after_days_nonnegative check (score_update_after_days >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'matches_forfeit_before_days_nonnegative') then
    alter table public.matches add constraint matches_forfeit_before_days_nonnegative check (forfeit_before_days >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'matches_forfeit_after_days_nonnegative') then
    alter table public.matches add constraint matches_forfeit_after_days_nonnegative check (forfeit_after_days >= 0);
  end if;
end $$;

commit;
