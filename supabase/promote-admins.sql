-- Run after your first user signs up through Supabase Auth, to create their
-- club and promote them to admin. Replace the email address below.

with new_club as (
  insert into public.clubs (name) values ('My Club') returning id
)
update public.users
set role = 'admin', club_id = (select id from new_club)
where email = 'admin@example.com';
