-- Yourcipe — Dados tab sales records.
-- One row per sale, owned by the authenticated user that created it.

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sale_date date not null default current_date,
  value numeric(12,2) not null check (value > 0),
  ipc integer not null default 0 check (ipc >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sales enable row level security;

-- Keep this migration self-contained: older projects do not define a
-- generic public.set_updated_at() helper, so sales owns its trigger function.
create or replace function public.set_sales_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at := old.created_at;
  new.owner_id := old.owner_id;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.set_sales_updated_at() from public;

drop trigger if exists trg_sales_updated_at on public.sales;
create trigger trg_sales_updated_at
  before update on public.sales
  for each row execute function public.set_sales_updated_at();

drop policy if exists "sales_select_own" on public.sales;
create policy "sales_select_own"
  on public.sales for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "sales_insert_own" on public.sales;
create policy "sales_insert_own"
  on public.sales for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "sales_update_own" on public.sales;
create policy "sales_update_own"
  on public.sales for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "sales_delete_own" on public.sales;
create policy "sales_delete_own"
  on public.sales for delete
  to authenticated
  using (owner_id = auth.uid());

grant select, insert, update, delete on public.sales to authenticated;
