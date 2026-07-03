alter table public.matches
  add column if not exists target_score integer not null default 11;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'matches_target_score_positive'
      and conrelid = 'public.matches'::regclass
  ) then
    alter table public.matches
      add constraint matches_target_score_positive check (target_score > 0);
  end if;
end $$;
