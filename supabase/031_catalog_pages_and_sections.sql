-- Yourcipe V0.49 — normalize the catalogue navigation.
--
-- Sections used to be stored as special category types (`secao_*`).  That
-- made a taxonomy row responsible for both classifying content and deciding
-- where it appeared in the UI.  Pages, their sections and their contents are
-- now first-class records.  The old rows are retained (inactive) so existing
-- deployments can be upgraded without breaking historical foreign keys.

create table public.catalog_pages (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('home', 'recipes', 'products')),
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalog_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.catalog_pages(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  slug text not null check (btrim(slug) <> ''),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_id, slug)
);

create table public.catalog_section_recipes (
  section_id uuid not null references public.catalog_sections(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (section_id, recipe_id)
);

create table public.catalog_section_products (
  section_id uuid not null references public.catalog_sections(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (section_id, product_id)
);

create index catalog_sections_page_order_idx on public.catalog_sections(page_id, sort_order);
create index catalog_section_recipes_recipe_idx on public.catalog_section_recipes(recipe_id);
create index catalog_section_products_product_idx on public.catalog_section_products(product_id);

insert into public.catalog_pages(key, name, sort_order) values
  ('home', 'Home', 0), ('recipes', 'Receitas', 1), ('products', 'Produtos', 2)
on conflict (key) do update set name = excluded.name, sort_order = excluded.sort_order;

-- Copy the current configuration.  A legacy `secao` always represented Home.
insert into public.catalog_sections(page_id, name, slug, sort_order, active)
select p.id, c.name, c.slug, c.sort_order, c.active
from public.categories c
join public.catalog_pages p on p.key = case c.type
  when 'secao_receita' then 'recipes'
  when 'secao_produto' then 'products'
  else 'home'
end
where c.scope = 'site' and c.type in ('secao', 'secao_home', 'secao_receita', 'secao_produto')
on conflict (page_id, slug) do update set
  name = excluded.name, sort_order = excluded.sort_order, active = excluded.active;

insert into public.catalog_section_recipes(section_id, recipe_id, sort_order)
select s.id, rc.recipe_id, rc.sort_order
from public.recipe_categories rc
join public.categories c on c.id = rc.category_id
join public.catalog_pages p on p.key = case when c.type = 'secao_receita' then 'recipes' else 'home' end
join public.catalog_sections s on s.page_id = p.id and s.slug = c.slug
where c.type in ('secao', 'secao_home', 'secao_receita')
on conflict do nothing;

insert into public.catalog_section_products(section_id, product_id, sort_order)
select s.id, pc.product_id, pc.sort_order
from public.product_categories pc
join public.categories c on c.id = pc.category_id
join public.catalog_pages p on p.key = 'products'
join public.catalog_sections s on s.page_id = p.id and s.slug = c.slug
where c.type = 'secao_produto'
on conflict do nothing;

update public.categories set active = false
where scope = 'site' and type in ('secao', 'secao_home', 'secao_receita', 'secao_produto');

alter table public.catalog_pages enable row level security;
alter table public.catalog_sections enable row level security;
alter table public.catalog_section_recipes enable row level security;
alter table public.catalog_section_products enable row level security;

create policy catalog_pages_read on public.catalog_pages for select to anon, authenticated using (active or public.is_admin());
create policy catalog_sections_read on public.catalog_sections for select to anon, authenticated using (active or public.is_admin());
create policy catalog_section_recipes_read on public.catalog_section_recipes for select to anon, authenticated using (true);
create policy catalog_section_products_read on public.catalog_section_products for select to anon, authenticated using (true);
grant select on public.catalog_pages, public.catalog_sections, public.catalog_section_recipes, public.catalog_section_products to anon, authenticated;

create or replace function public.admin_assign_catalog_section_item(p_section_id uuid, p_item_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_page text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select p.key into v_page from public.catalog_sections s join public.catalog_pages p on p.id = s.page_id where s.id = p_section_id;
  if v_page is null then raise exception 'section_not_found'; end if;
  if v_page = 'products' then
    insert into public.catalog_section_products(section_id, product_id, sort_order)
    values (p_section_id, p_item_id, coalesce((select max(sort_order) + 1 from public.catalog_section_products where section_id = p_section_id), 0)) on conflict do nothing;
  else
    insert into public.catalog_section_recipes(section_id, recipe_id, sort_order)
    values (p_section_id, p_item_id, coalesce((select max(sort_order) + 1 from public.catalog_section_recipes where section_id = p_section_id), 0)) on conflict do nothing;
  end if;
end; $$;
revoke execute on function public.admin_assign_catalog_section_item(uuid, uuid) from public, anon;
grant execute on function public.admin_assign_catalog_section_item(uuid, uuid) to authenticated;

create or replace function public.admin_reorder_catalog_sections(p_page_key text, p_sections jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_count integer := 0;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_page_key not in ('home', 'recipes', 'products') or jsonb_typeof(p_sections) <> 'array' then raise exception 'invalid_sections_payload'; end if;
  for v_item in select * from jsonb_array_elements(p_sections) loop
    update public.catalog_sections s set sort_order = (v_item->>'sort_order')::integer, updated_at = now()
    from public.catalog_pages p where s.page_id = p.id and p.key = p_page_key and s.id = (v_item->>'id')::uuid;
    if found then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end; $$;
revoke execute on function public.admin_reorder_catalog_sections(text, jsonb) from public, anon;
grant execute on function public.admin_reorder_catalog_sections(text, jsonb) to authenticated;
