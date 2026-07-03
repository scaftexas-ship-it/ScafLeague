insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000000001', 'SCAF League')
on conflict do nothing;

-- Create auth users in Supabase Auth first, then add matching public.users rows
-- with role = 'admin' or 'player'.
