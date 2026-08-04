-- Yourcipe — admin spreadsheet import + home section ordering.
-- Idempotent. Depends on 004/006 catalog schema and admin policies.

create or replace function public.normalize_catalog_name(p_text text)
returns text
language sql
stable
set search_path = ''
as $$
  select lower(public.unaccent(btrim(coalesce(p_text, ''))));
$$;

create or replace function public.admin_reorder_home_sections(p_sections jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_order integer;
  v_count integer := 0;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if jsonb_typeof(p_sections) <> 'array' then
    raise exception 'invalid_sections_payload';
  end if;

  for v_item in select * from jsonb_array_elements(p_sections) loop
    v_id := nullif(v_item->>'id', '')::uuid;
    v_order := coalesce((v_item->>'sort_order')::integer, v_count);
    update public.categories
      set sort_order = v_order
      where id = v_id and scope = 'site' and owner_id is null and type = 'secao';
    if found then v_count := v_count + 1; end if;
  end loop;

  return jsonb_build_object('updated', v_count);
end;
$$;
revoke execute on function public.admin_reorder_home_sections(jsonb) from public, anon;
grant execute on function public.admin_reorder_home_sections(jsonb) to authenticated;

create or replace function public.admin_import_public_recipes(p_mode text, p_recipes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := coalesce(p_mode, 'add');
  v_recipe jsonb;
  v_idx integer := 0;
  v_name text;
  v_norm text;
  v_category_id uuid;
  v_recipe_id uuid;
  v_existing_id uuid;
  v_ing jsonb;
  v_sec jsonb;
  v_product_id uuid;
  v_section_id uuid;
  v_added integer := 0;
  v_replaced integer := 0;
  v_ignored integer := 0;
  v_removed integer := 0;
  v_seen text[] := '{}';
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_mode not in ('add', 'upsert', 'replace_all') then
    raise exception 'invalid_import_mode';
  end if;
  if jsonb_typeof(p_recipes) <> 'array' then
    raise exception 'invalid_recipes_payload';
  end if;

  -- Server-side full validation before any mutation.
  for v_recipe in select * from jsonb_array_elements(p_recipes) loop
    v_idx := v_idx + 1;
    v_name := btrim(coalesce(v_recipe->>'name', ''));
    v_norm := public.normalize_catalog_name(v_name);
    if v_name = '' then raise exception 'invalid_recipe_name at item %', v_idx; end if;
    if v_norm = any(v_seen) then raise exception 'duplicate_recipe_name_in_payload: %', v_name; end if;
    v_seen := array_append(v_seen, v_norm);

    select id into v_category_id from public.categories
      where scope = 'site' and owner_id is null and active and type = 'receita'
        and public.normalize_catalog_name(name) = public.normalize_catalog_name(v_recipe->>'category')
      limit 1;
    if v_category_id is null then raise exception 'category_not_found: %', v_recipe->>'category'; end if;

    if jsonb_array_length(coalesce(v_recipe->'ingredients', '[]'::jsonb)) = 0 then
      raise exception 'ingredients_required: %', v_name;
    end if;
    for v_ing in select * from jsonb_array_elements(coalesce(v_recipe->'ingredients', '[]'::jsonb)) loop
      select id into v_product_id from public.products
        where scope = 'site' and owner_id is null and active
          and public.normalize_catalog_name(name) = public.normalize_catalog_name(v_ing->>'product')
        limit 1;
      if v_product_id is null then raise exception 'product_not_found: %', v_ing->>'product'; end if;
      if coalesce((v_ing->>'quantity')::numeric, 0) <= 0 then raise exception 'invalid_ingredient_quantity: %', v_ing->>'product'; end if;
    end loop;

    for v_sec in select * from jsonb_array_elements(coalesce(v_recipe->'sections', '[]'::jsonb)) loop
      select id into v_section_id from public.categories
        where scope = 'site' and owner_id is null and active and type = 'secao'
          and (slug = public.slugify(v_sec#>>'{}') or public.normalize_catalog_name(name) = public.normalize_catalog_name(v_sec#>>'{}'))
        limit 1;
      if v_section_id is null and (v_sec#>>'{}') <> 'destaque' then raise exception 'section_not_found: %', v_sec#>>'{}'; end if;
    end loop;
  end loop;

  if v_mode = 'replace_all' then
    delete from public.recipe_categories rc using public.recipes r where rc.recipe_id = r.id and r.scope = 'site';
    delete from public.recipe_ingredients ri using public.recipes r where ri.recipe_id = r.id and r.scope = 'site';
    delete from public.recipes where scope = 'site' and owner_id is null;
    get diagnostics v_removed = row_count;
  end if;

  for v_recipe in select * from jsonb_array_elements(p_recipes) loop
    v_name := btrim(v_recipe->>'name');
    select id into v_category_id from public.categories
      where scope = 'site' and owner_id is null and active and type = 'receita'
        and public.normalize_catalog_name(name) = public.normalize_catalog_name(v_recipe->>'category') limit 1;
    select id into v_existing_id from public.recipes
      where scope = 'site' and owner_id is null and public.normalize_catalog_name(name) = public.normalize_catalog_name(v_name) limit 1;

    if v_mode = 'add' and v_existing_id is not null then
      v_ignored := v_ignored + 1; continue;
    end if;
    if v_existing_id is not null then
      update public.recipes set
        status = 'published', name = v_name, category_id = v_category_id,
        prep_time = greatest(0, coalesce((v_recipe->>'prep_time')::integer, 0)),
        servings = greatest(0, coalesce((v_recipe->>'servings')::integer, 0)),
        difficulty = coalesce(nullif(v_recipe->>'difficulty', ''), 'Fácil'),
        image_url = nullif(v_recipe->>'image_url', ''), featured = coalesce((v_recipe->>'featured')::boolean, false),
        extras = coalesce(array(select jsonb_array_elements_text(coalesce(v_recipe->'extras','[]'::jsonb))), '{}'),
        instructions = coalesce(array(select jsonb_array_elements_text(coalesce(v_recipe->'instructions','[]'::jsonb))), '{}'),
        tips = coalesce(array(select jsonb_array_elements_text(coalesce(v_recipe->'tips','[]'::jsonb))), '{}')
      where id = v_existing_id returning id into v_recipe_id;
      delete from public.recipe_ingredients where recipe_id = v_recipe_id;
      delete from public.recipe_categories where recipe_id = v_recipe_id;
      v_replaced := v_replaced + 1;
    else
      insert into public.recipes(scope, owner_id, status, name, category_id, prep_time, servings, difficulty, image_url, featured, extras, instructions, tips)
      values ('site', null, 'published', v_name, v_category_id, greatest(0, coalesce((v_recipe->>'prep_time')::integer, 0)), greatest(0, coalesce((v_recipe->>'servings')::integer, 0)), coalesce(nullif(v_recipe->>'difficulty', ''), 'Fácil'), nullif(v_recipe->>'image_url', ''), coalesce((v_recipe->>'featured')::boolean, false), coalesce(array(select jsonb_array_elements_text(coalesce(v_recipe->'extras','[]'::jsonb))), '{}'), coalesce(array(select jsonb_array_elements_text(coalesce(v_recipe->'instructions','[]'::jsonb))), '{}'), coalesce(array(select jsonb_array_elements_text(coalesce(v_recipe->'tips','[]'::jsonb))), '{}'))
      returning id into v_recipe_id;
      v_added := v_added + 1;
    end if;

    v_idx := 0;
    for v_ing in select * from jsonb_array_elements(coalesce(v_recipe->'ingredients', '[]'::jsonb)) loop
      v_idx := v_idx + 1;
      select id into v_product_id from public.products where scope = 'site' and owner_id is null and active and public.normalize_catalog_name(name) = public.normalize_catalog_name(v_ing->>'product') limit 1;
      insert into public.recipe_ingredients(recipe_id, product_id, quantity, sort_order) values (v_recipe_id, v_product_id, (v_ing->>'quantity')::numeric, v_idx);
    end loop;
    v_idx := 0;
    for v_sec in select * from jsonb_array_elements(coalesce(v_recipe->'sections', '[]'::jsonb)) loop
      select id into v_section_id from public.categories where scope = 'site' and owner_id is null and active and type = 'secao' and (slug = public.slugify(v_sec#>>'{}') or public.normalize_catalog_name(name) = public.normalize_catalog_name(v_sec#>>'{}')) limit 1;
      if v_section_id is not null then
        v_idx := v_idx + 1;
        insert into public.recipe_categories(recipe_id, category_id, sort_order) values (v_recipe_id, v_section_id, v_idx) on conflict do nothing;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('added', v_added, 'replaced', v_replaced, 'ignored', v_ignored, 'removed', v_removed);
end;
$$;
revoke execute on function public.admin_import_public_recipes(text, jsonb) from public, anon;
grant execute on function public.admin_import_public_recipes(text, jsonb) to authenticated;
