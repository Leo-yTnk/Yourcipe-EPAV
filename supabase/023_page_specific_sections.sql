-- Yourcipe — page-specific catalog sections.
-- Separates the former ambiguous `secao` category into Home, Recipes and
-- Products so each page of the visual editor has its own vocabulary/order.

alter table public.categories drop constraint if exists categories_type_check;
alter table public.categories add constraint categories_type_check check (
  type in ('proteina', 'receita', 'secao', 'secao_home', 'secao_receita', 'secao_produto')
);

-- `secao` historically powered Home, so preserve its meaning during upgrade.
update public.categories set type = 'secao_home' where type = 'secao';

create or replace function public.enforce_recipe_categories_reference()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_recipe public.recipes%rowtype; v_cat public.categories%rowtype;
begin
  select * into v_recipe from public.recipes where id = new.recipe_id;
  if not found then raise exception 'recipe_categories.recipe_id % does not exist', new.recipe_id; end if;
  select * into v_cat from public.categories where id = new.category_id;
  if not found then raise exception 'recipe_categories.category_id % does not exist', new.category_id; end if;
  if v_cat.type not in ('secao_home', 'secao_receita') then
    raise exception 'recipe_categories.category_id must reference a Home or Recipes section';
  end if;
  if not public.validate_reference_scope(v_recipe.scope, v_recipe.owner_id, v_cat.scope, v_cat.owner_id, v_cat.active) then
    raise exception 'recipe_categories.category_id references a category outside the allowed scope';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_recipe_categories_reference() from public;

create or replace function public.list_public_recipe_sections(p_recipe_ids uuid[])
returns table(recipe_id uuid, slug text)
language sql stable security definer set search_path = public as $$
  select rc.recipe_id, c.slug
  from public.recipe_categories rc
  join public.recipes r on r.id = rc.recipe_id
  join public.categories c on c.id = rc.category_id
  where rc.recipe_id = any(coalesce(p_recipe_ids, '{}'::uuid[]))
    and r.scope = 'site' and r.status = 'published'
    and c.scope = 'site' and c.type in ('secao_home', 'secao_receita') and c.active is true
  order by rc.recipe_id, rc.sort_order, c.id
$$;
revoke execute on function public.list_public_recipe_sections(uuid[]) from public;
grant execute on function public.list_public_recipe_sections(uuid[]) to anon, authenticated;

create or replace function public.admin_reorder_home_sections(p_sections jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_id uuid; v_order integer; v_count integer := 0;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if jsonb_typeof(p_sections) <> 'array' then raise exception 'invalid_sections_payload'; end if;
  for v_item in select * from jsonb_array_elements(p_sections) loop
    v_id := nullif(v_item->>'id', '')::uuid; v_order := coalesce((v_item->>'sort_order')::integer, v_count);
    update public.categories set sort_order = v_order where id = v_id and scope = 'site' and owner_id is null and type = 'secao_home';
    if found then v_count := v_count + 1; end if;
  end loop;
  return jsonb_build_object('updated', v_count);
end;
$$;
revoke execute on function public.admin_reorder_home_sections(jsonb) from public, anon;
grant execute on function public.admin_reorder_home_sections(jsonb) to authenticated;

create or replace function public.admin_reorder_recipe_sections(p_sections jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_id uuid; v_order integer; v_count integer := 0;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if jsonb_typeof(p_sections) <> 'array' then raise exception 'invalid_sections_payload'; end if;
  for v_item in select * from jsonb_array_elements(p_sections) loop
    v_id := nullif(v_item->>'id', '')::uuid; v_order := coalesce((v_item->>'sort_order')::integer, v_count);
    update public.categories set sort_order = v_order where id = v_id and scope = 'site' and owner_id is null and type = 'secao_receita';
    if found then v_count := v_count + 1; end if;
  end loop;
  return jsonb_build_object('updated', v_count);
end;
$$;
revoke execute on function public.admin_reorder_recipe_sections(jsonb) from public, anon;
grant execute on function public.admin_reorder_recipe_sections(jsonb) to authenticated;

-- Keep hard-delete replacement validation page-specific as well.
create or replace function public.delete_category_resolved(
  p_category_id uuid,
  p_resolution jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_category record;
  v_row jsonb;
  v_target record;
  v_replacement record;
  v_seen_products uuid[] := '{}';
  v_seen_recipes uuid[] := '{}';
  v_seen_sections uuid[] := '{}';
  v_seen_product_sections uuid[] := '{}';
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_category from public.categories where id = p_category_id for update;
  if not found then
    raise exception 'category_not_found';
  end if;

  if v_category.scope = 'personal' then
    if v_category.owner_id is distinct from v_uid then
      raise exception 'not_owner';
    end if;
  elsif v_category.scope = 'site' then
    if not public.is_admin() then
      raise exception 'not_admin';
    end if;
  else
    raise exception 'unknown_scope';
  end if;

  -- ---- products.category_id (required) ----
  for v_row in select * from jsonb_array_elements(coalesce(p_resolution->'products', '[]'::jsonb))
  loop
    select * into v_target from public.products where id = (v_row->>'id')::uuid and category_id = p_category_id for update;
    if not found then continue; end if;
    select * into v_replacement from public.categories where id = (v_row->>'replacement_category_id')::uuid;
    if not found then raise exception 'replacement_category_not_found'; end if;
    if v_replacement.id = p_category_id then raise exception 'replacement_category_same_as_deleted'; end if;
    if v_replacement.type <> 'proteina' then raise exception 'replacement_category_wrong_type'; end if;
    update public.products set category_id = v_replacement.id where id = v_target.id;
    v_seen_products := array_append(v_seen_products, v_target.id);
  end loop;

  if exists (select 1 from public.products where category_id = p_category_id) then
    raise exception 'unresolved_product_references';
  end if;

  -- ---- recipes.category_id (required) ----
  for v_row in select * from jsonb_array_elements(coalesce(p_resolution->'recipes', '[]'::jsonb))
  loop
    select * into v_target from public.recipes where id = (v_row->>'id')::uuid and category_id = p_category_id for update;
    if not found then continue; end if;
    select * into v_replacement from public.categories where id = (v_row->>'replacement_category_id')::uuid;
    if not found then raise exception 'replacement_category_not_found'; end if;
    if v_replacement.id = p_category_id then raise exception 'replacement_category_same_as_deleted'; end if;
    if v_replacement.type <> 'receita' then raise exception 'replacement_category_wrong_type'; end if;
    update public.recipes set category_id = v_replacement.id where id = v_target.id;
    v_seen_recipes := array_append(v_seen_recipes, v_target.id);
  end loop;

  if exists (select 1 from public.recipes where category_id = p_category_id) then
    raise exception 'unresolved_recipe_references';
  end if;

  -- ---- recipe_categories.category_id (optional: replace or remove) ----
  for v_row in select * from jsonb_array_elements(coalesce(p_resolution->'sections', '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.recipe_categories
      where recipe_id = (v_row->>'recipe_id')::uuid and category_id = p_category_id
    ) then
      continue;
    end if;
    if v_row->>'action' = 'replace' then
      select * into v_replacement from public.categories where id = (v_row->>'replacement_category_id')::uuid;
      if not found then raise exception 'replacement_category_not_found'; end if;
      if v_replacement.id = p_category_id then raise exception 'replacement_category_same_as_deleted'; end if;
      if v_replacement.type <> v_category.type then raise exception 'replacement_category_wrong_type'; end if;
      insert into public.recipe_categories (recipe_id, category_id, sort_order)
        select recipe_id, v_replacement.id, sort_order from public.recipe_categories
        where recipe_id = (v_row->>'recipe_id')::uuid and category_id = p_category_id
        on conflict (recipe_id, category_id) do nothing;
      delete from public.recipe_categories
        where recipe_id = (v_row->>'recipe_id')::uuid and category_id = p_category_id;
    elsif v_row->>'action' = 'remove' then
      delete from public.recipe_categories
        where recipe_id = (v_row->>'recipe_id')::uuid and category_id = p_category_id;
    else
      raise exception 'invalid_section_action:%', coalesce(v_row->>'action', 'null');
    end if;
    v_seen_sections := array_append(v_seen_sections, (v_row->>'recipe_id')::uuid);
  end loop;

  if exists (select 1 from public.recipe_categories where category_id = p_category_id) then
    raise exception 'unresolved_section_references';
  end if;

  -- ---- product_categories.category_id (optional: replace or remove) ----
  for v_row in select * from jsonb_array_elements(coalesce(p_resolution->'product_sections', '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.product_categories
      where product_id = (v_row->>'product_id')::uuid and category_id = p_category_id
    ) then
      continue;
    end if;
    if v_row->>'action' = 'replace' then
      select * into v_replacement from public.categories where id = (v_row->>'replacement_category_id')::uuid;
      if not found then raise exception 'replacement_category_not_found'; end if;
      if v_replacement.id = p_category_id then raise exception 'replacement_category_same_as_deleted'; end if;
      if v_replacement.type <> 'secao_produto' then raise exception 'replacement_category_wrong_type'; end if;
      insert into public.product_categories (product_id, category_id, sort_order)
        select product_id, v_replacement.id, sort_order from public.product_categories
        where product_id = (v_row->>'product_id')::uuid and category_id = p_category_id
        on conflict (product_id, category_id) do nothing;
      delete from public.product_categories
        where product_id = (v_row->>'product_id')::uuid and category_id = p_category_id;
    elsif v_row->>'action' = 'remove' then
      delete from public.product_categories
        where product_id = (v_row->>'product_id')::uuid and category_id = p_category_id;
    else
      raise exception 'invalid_product_section_action:%', coalesce(v_row->>'action', 'null');
    end if;
    v_seen_product_sections := array_append(v_seen_product_sections, (v_row->>'product_id')::uuid);
  end loop;

  if exists (select 1 from public.product_categories where category_id = p_category_id) then
    raise exception 'unresolved_product_section_references';
  end if;

  delete from public.categories where id = p_category_id;

  return jsonb_build_object('action', 'deleted', 'category_id', p_category_id);
end;
$$;

revoke execute on function public.delete_category_resolved(uuid, jsonb) from public;
grant execute on function public.delete_category_resolved(uuid, jsonb) to authenticated;
