alter table public.users
  add column if not exists access_disabled boolean not null default false;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'admin'
      and access_disabled = false
  );
$$;
