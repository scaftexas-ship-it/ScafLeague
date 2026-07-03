with selected_club as (
  select coalesce(
    (
      select club_id
      from public.users
      where lower(email) = lower('scaftexas@gmail.com')
        and club_id is not null
      limit 1
    ),
    (
      select id
      from public.clubs
      order by created_at
      limit 1
    )
  ) as id
),
created_club as (
  insert into public.clubs (name)
  select 'SCAF League'
  where not exists (select 1 from selected_club where id is not null)
  returning id
),
target_club as (
  select id from selected_club where id is not null
  union all
  select id from created_club
  limit 1
),
target_auth_users as (
  select
    auth_user.id,
    auth_user.email,
    case lower(auth_user.email)
      when 'scaftexas@gmail.com' then 'SCAF Admin'
      when 'rbalakr@gmail.com' then 'R Balakr'
      else auth_user.email
    end as full_name
  from auth.users auth_user
  where lower(auth_user.email) in (
    lower('scaftexas@gmail.com'),
    lower('rbalakr@gmail.com')
  )
)
insert into public.users (id, club_id, role, full_name, email)
select
  target_auth_users.id,
  target_club.id,
  'admin'::public.user_role,
  target_auth_users.full_name,
  target_auth_users.email
from target_auth_users
cross join target_club
on conflict (id) do update
set
  club_id = excluded.club_id,
  role = 'admin'::public.user_role,
  full_name = excluded.full_name,
  email = excluded.email
returning id, club_id, role, full_name, email;

select requested.email as missing_auth_user
from (
  values
    ('scaftexas@gmail.com'),
    ('rbalakr@gmail.com')
) as requested(email)
where not exists (
  select 1
  from auth.users auth_user
  where lower(auth_user.email) = lower(requested.email)
);
