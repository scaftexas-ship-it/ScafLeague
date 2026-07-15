-- Adds club logo support to an already-provisioned project. Run once in the
-- Supabase SQL Editor. Safe to re-run (every statement is idempotent).

alter table public.clubs add column if not exists logo_url text;

drop policy if exists "anyone can read club branding" on public.clubs;
create policy "anyone can read club branding" on public.clubs for select using (true);

insert into storage.buckets (id, name, public) values ('club-logos', 'club-logos', true)
on conflict (id) do nothing;

drop policy if exists "anyone can view club logos" on storage.objects;
create policy "anyone can view club logos" on storage.objects for select using (bucket_id = 'club-logos');

drop policy if exists "admins manage club logos" on storage.objects;
create policy "admins manage club logos" on storage.objects for all
  using (bucket_id = 'club-logos' and public.is_admin())
  with check (bucket_id = 'club-logos' and public.is_admin());
