alter table public.matches
add column if not exists number_of_sets integer not null default 3 check (number_of_sets > 0),
add column if not exists restrict_score_updates boolean not null default false,
add column if not exists score_update_before_days integer not null default 0 check (score_update_before_days >= 0),
add column if not exists score_update_after_days integer not null default 0 check (score_update_after_days >= 0),
add column if not exists allow_forfeit boolean not null default true,
add column if not exists forfeit_before_days integer not null default 0 check (forfeit_before_days >= 0),
add column if not exists forfeit_after_days integer not null default 0 check (forfeit_after_days >= 0);
