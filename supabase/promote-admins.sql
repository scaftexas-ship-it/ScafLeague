-- Run this in the Supabase SQL Editor.
-- It makes both emails admins for the same club.

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000000001', 'SCAF League')
on conflict (id) do nothing;

insert into public.users (id, club_id, role, full_name, email)
select
  auth_user.id,
  '00000000-0000-0000-0000-000000000001',
  'admin',
  case lower(auth_user.email)
    when 'scaftexas@gmail.com' then 'SCAF Admin'
    when 'rbalakr@gmail.com' then 'R Balakr'
    else auth_user.email
  end,
  auth_user.email
from auth.users auth_user
where lower(auth_user.email) in ('scaftexas@gmail.com', 'rbalakr@gmail.com')
on conflict (id) do update
set
  club_id = excluded.club_id,
  role = 'admin',
  full_name = excluded.full_name,
  email = excluded.email;

select
  users.email,
  users.role,
  users.club_id
from public.users users
where lower(users.email) in ('scaftexas@gmail.com', 'rbalakr@gmail.com')
order by users.email;

select requested.email as auth_account_not_found
from (
  values
    ('scaftexas@gmail.com'),
    ('rbalakr@gmail.com')
) as requested(email)
where not exists (
  select 1
  from auth.users auth_user
  where lower(auth_user.email) = requested.email
);
