-- Bootstraps the first admin. Run after creating a user in Supabase Auth
-- (via the Supabase dashboard's Authentication > Users > Add user, since
-- this app has no sign-up form). Replace the email address below.
--
-- Unlike a plain UPDATE, this creates the public.users row if it doesn't
-- exist yet (nothing else does -- there's no trigger on auth.users and no
-- in-app sign-up flow), and reuses an existing club instead of creating a
-- new one on every run.

do $$
declare
  v_club_id uuid;
  v_user_id uuid;
  v_email text := 'admin@example.com'; -- change this
  v_full_name text;
begin
  select id into v_club_id from public.clubs order by created_at limit 1;
  if v_club_id is null then
    insert into public.clubs (name) values ('My Club') returning id into v_club_id;
  end if;

  select id, coalesce(raw_user_meta_data->>'full_name', email)
  into v_user_id, v_full_name
  from auth.users
  where email = v_email;

  if v_user_id is null then
    raise exception 'No auth.users row found for email %. Create that user in Supabase Auth first.', v_email;
  end if;

  insert into public.users (id, club_id, role, full_name, email, access_disabled)
  values (v_user_id, v_club_id, 'admin', v_full_name, v_email, false)
  on conflict (id) do update
  set role = 'admin', club_id = excluded.club_id, access_disabled = false;
end $$;
