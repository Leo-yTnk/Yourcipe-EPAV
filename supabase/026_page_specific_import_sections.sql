-- Yourcipe V0.44 — page-specific sections in the transactional catalogue import.
-- Apply after 025. Replaces the import helpers/RPCs so category validation and
-- recipe-tag resolution use the section types introduced by migration 023.
create or replace function public.ensure_native_recipe_sections()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_section record;
begin
  for v_section in
    select * from (values
      ('recomendado', 'Recomendados', 0),
      ('pratico', 'Práticos para o Dia a Dia', 1),
      ('ocasiao', 'Ocasiões Especiais', 2),
      ('rapido', 'Pronto em 30 Minutos', 3),
      ('churrasco', 'Direto da Churrasqueira', 4),
      ('petisco', 'Petiscos para Compartilhar', 5)
    ) native(slug, name, sort_order)
  loop
    update public.categories
      set active = true
      where scope = 'site' and owner_id is null and type = 'secao_home'
        and slug = v_section.slug;
    if not found then
      insert into public.categories(scope, owner_id, type, name, slug, sort_order, active)
      values ('site', null, 'secao_home', v_section.name, v_section.slug, v_section.sort_order, true);
    end if;
  end loop;
end;
$$;
revoke execute on function public.ensure_native_recipe_sections() from public, anon;
grant execute on function public.ensure_native_recipe_sections() to authenticated;

create or replace function public.admin_import_public_catalog(
  p_modes jsonb,
  p_categories jsonb,
  p_products jsonb,
  p_recipes jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_mode text := coalesce(p_modes->>'categories', 'add');
  v_product_mode text := coalesce(p_modes->>'products', 'add');
  v_recipe_mode text := coalesce(p_modes->>'recipes', 'add');
  v_item jsonb;
  v_id uuid;
  v_category_id uuid;
  v_category_added integer := 0; v_category_replaced integer := 0; v_category_ignored integer := 0; v_category_removed integer := 0;
  v_product_added integer := 0; v_product_replaced integer := 0; v_product_ignored integer := 0; v_product_removed integer := 0;
  v_recipe_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_category_mode not in ('add', 'upsert', 'replace_all') or v_product_mode not in ('add', 'upsert', 'replace_all') or v_recipe_mode not in ('add', 'upsert', 'replace_all') then raise exception 'invalid_import_mode'; end if;
  if jsonb_typeof(coalesce(p_categories, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_products, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_recipes, '[]'::jsonb)) <> 'array' then raise exception 'invalid_import_payload'; end if;

  -- Reject ambiguous payloads before changing anything. These checks repeat
  -- browser validation because the client is not a security boundary.
  if exists (select 1 from jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) x group by public.normalize_catalog_name(x->>'name') having count(*) > 1) then raise exception 'duplicate_product_name_in_payload'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) x where nullif(btrim(x->>'swift_product_url'), '') is not null group by lower(btrim(x->>'swift_product_url')) having count(*) > 1) then raise exception 'duplicate_swift_url_in_payload'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) x where nullif(btrim(x->>'swift_sku'), '') is not null group by lower(btrim(x->>'swift_sku')) having count(*) > 1) then raise exception 'duplicate_swift_sku_in_payload'; end if;

  -- Validate category and product rows before changing anything. Recipe rows
  -- receive the same all-before-mutation validation in the recipe RPC below.
  for v_item in select * from jsonb_array_elements(coalesce(p_categories, '[]'::jsonb)) loop
    if btrim(coalesce(v_item->>'name', '')) = '' or coalesce(v_item->>'type', '') not in ('proteina', 'receita', 'secao_home', 'secao_receita', 'secao_produto') then raise exception 'invalid_category'; end if;
  end loop;
  for v_item in select * from jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) loop
    if btrim(coalesce(v_item->>'name', '')) = '' or coalesce(v_item->>'unit', '') not in ('kg', 'un', 'pacote', 'caixa', 'pote') or (nullif(v_item->>'price', '') is not null and (v_item->>'price')::numeric < 0) or btrim(coalesce(v_item->>'image_url', '')) !~* '^https?://[^[:space:]]+$' then raise exception 'invalid_product: %', v_item->>'name'; end if;
    if nullif(btrim(v_item->>'swift_product_url'), '') is not null and btrim(v_item->>'swift_product_url') !~ '^https://www\.swift\.com\.br/[^?#]+$' then raise exception 'invalid_swift_product_url: %', v_item->>'name'; end if;
    if not exists (select 1 from public.products p where p.scope='site' and p.owner_id is null and public.normalize_catalog_name(p.name)=public.normalize_catalog_name(v_item->>'name')) and nullif(btrim(v_item->>'swift_product_url'), '') is null then raise exception 'swift_url_required: %', v_item->>'name'; end if;
    if exists (select 1 from public.products p where p.scope='site' and p.owner_id is null and public.normalize_catalog_name(p.name)<>public.normalize_catalog_name(v_item->>'name') and (lower(p.swift_product_url)=lower(btrim(v_item->>'swift_product_url')) or (nullif(btrim(v_item->>'swift_sku'), '') is not null and lower(p.swift_sku)=lower(btrim(v_item->>'swift_sku'))))) then raise exception 'swift_identity_conflict: %', v_item->>'name'; end if;
    if not exists (select 1 from public.categories c where c.scope = 'site' and c.owner_id is null and c.type = 'proteina' and (c.slug = public.slugify(v_item->>'category') or public.normalize_catalog_name(c.name) = public.normalize_catalog_name(v_item->>'category')))
       and not exists (select 1 from jsonb_array_elements(coalesce(p_categories, '[]'::jsonb)) x where x->>'type' = 'proteina' and (public.slugify(x->>'name') = public.slugify(v_item->>'category') or public.normalize_catalog_name(x->>'name') = public.normalize_catalog_name(v_item->>'category'))) then raise exception 'category_not_found: %', v_item->>'category'; end if;
  end loop;

  if v_category_mode = 'replace_all' then
    update public.categories c set active = false, updated_at = now(), updated_by = auth.uid()
      where c.scope = 'site' and c.owner_id is null and not exists (
        select 1 from jsonb_array_elements(coalesce(p_categories, '[]'::jsonb)) x
        where x->>'type' = c.type and (public.slugify(x->>'name') = c.slug or public.normalize_catalog_name(x->>'name') = public.normalize_catalog_name(c.name)));
    get diagnostics v_category_removed = row_count;
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_categories, '[]'::jsonb)) loop
    select id into v_id from public.categories where scope = 'site' and owner_id is null and type = v_item->>'type' and (slug = public.slugify(v_item->>'name') or public.normalize_catalog_name(name) = public.normalize_catalog_name(v_item->>'name'))
      order by (slug = public.slugify(v_item->>'name')) desc
      limit 1;
    if v_id is not null and v_category_mode = 'add' then v_category_ignored := v_category_ignored + 1;
    elsif v_id is not null then update public.categories set name = btrim(v_item->>'name'), active = true, updated_at = now(), updated_by = auth.uid() where id = v_id; v_category_replaced := v_category_replaced + 1;
    else insert into public.categories(scope, owner_id, type, name, slug, active, created_by, updated_by) values ('site', null, v_item->>'type', btrim(v_item->>'name'), public.slugify(v_item->>'name'), true, auth.uid(), auth.uid()); v_category_added := v_category_added + 1; end if;
  end loop;

  if v_product_mode = 'replace_all' then
    update public.products p set active = false, updated_at = now(), updated_by = auth.uid()
      where p.scope = 'site' and p.owner_id is null and not exists (select 1 from jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) x where public.normalize_catalog_name(x->>'name') = public.normalize_catalog_name(p.name));
    get diagnostics v_product_removed = row_count;
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) loop
    select id into v_category_id from public.categories where scope = 'site' and owner_id is null and active and type = 'proteina' and (slug = public.slugify(v_item->>'category') or public.normalize_catalog_name(name) = public.normalize_catalog_name(v_item->>'category')) order by (slug = public.slugify(v_item->>'category')) desc limit 1;
    if v_category_id is null then raise exception 'active_category_not_found: %', v_item->>'category'; end if;
    select id into v_id from public.products where scope = 'site' and owner_id is null and public.normalize_catalog_name(name) = public.normalize_catalog_name(v_item->>'name') limit 1;
    if v_id is not null and v_product_mode = 'add' then v_product_ignored := v_product_ignored + 1;
    elsif v_id is not null then update public.products set name = btrim(v_item->>'name'), category_id = v_category_id, unit = v_item->>'unit', price = case when nullif(v_item->>'price', '') is null or (price_source = 'SWIFT' and price_last_success_at is not null) then price else (v_item->>'price')::numeric end, image_url = btrim(v_item->>'image_url'), swift_product_url = nullif(btrim(v_item->>'swift_product_url'), ''), swift_sku = nullif(btrim(v_item->>'swift_sku'), ''), price_status = case when nullif(btrim(v_item->>'swift_product_url'), '') is null then 'MISSING_SOURCE'::public.product_price_status else 'STALE'::public.product_price_status end, price_error = null, active = true, updated_at = now(), updated_by = auth.uid() where id = v_id; v_product_replaced := v_product_replaced + 1;
    else insert into public.products(scope, owner_id, name, category_id, unit, price, image_url, swift_product_url, swift_sku, price_status, active, created_by, updated_by) values ('site', null, btrim(v_item->>'name'), v_category_id, v_item->>'unit', coalesce(nullif(v_item->>'price', '')::numeric, 0), btrim(v_item->>'image_url'), nullif(btrim(v_item->>'swift_product_url'), ''), nullif(btrim(v_item->>'swift_sku'), ''), 'STALE'::public.product_price_status, true, auth.uid(), auth.uid()); v_product_added := v_product_added + 1; end if;
  end loop;

  -- Native spreadsheet tags are application vocabulary. Restore their
  -- backing rows even when Categorias is omitted (or replace_all disabled
  -- them), then let the recipe importer resolve the stable native slugs.
  perform public.ensure_native_recipe_sections();
  v_recipe_result := public.admin_import_public_recipes(v_recipe_mode, coalesce(p_recipes, '[]'::jsonb));
  return jsonb_build_object(
    'categories', jsonb_build_object('added', v_category_added, 'replaced', v_category_replaced, 'ignored', v_category_ignored, 'removed', v_category_removed),
    'products', jsonb_build_object('added', v_product_added, 'replaced', v_product_replaced, 'ignored', v_product_ignored, 'removed', v_product_removed),
    'recipes', v_recipe_result);
end;
$$;
revoke execute on function public.admin_import_public_catalog(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.admin_import_public_catalog(jsonb, jsonb, jsonb, jsonb) to authenticated;


-- Database-level collision protection closes races between concurrent imports,
-- manual edits and the Swift synchronizer.
create unique index if not exists products_site_swift_url_uk on public.products (lower(swift_product_url)) where scope='site' and owner_id is null and swift_product_url is not null;
create unique index if not exists products_site_swift_sku_uk on public.products (lower(swift_sku)) where scope='site' and owner_id is null and swift_sku is not null;


-- Recipe tags may reference only Home or Recipes sections. The same predicate
-- is used during preflight validation and association creation.
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
        where scope = 'site' and owner_id is null and active and type in ('secao_receita', 'secao_home')
          and (
            slug = public.slugify(v_sec#>>'{}')
            or public.normalize_catalog_name(name) = public.normalize_catalog_name(v_sec#>>'{}')
            or public.normalize_catalog_name(name) = public.normalize_catalog_name(
              case v_sec#>>'{}'
                when 'recomendado' then 'Recomendados'
                when 'pratico' then 'Práticos para o Dia a Dia'
                when 'ocasiao' then 'Ocasiões Especiais'
                when 'rapido' then 'Pronto em 30 Minutos'
                when 'churrasco' then 'Direto da Churrasqueira'
                when 'petisco' then 'Petiscos para Compartilhar'
                else v_sec#>>'{}'
              end
            )
          )
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
      select id into v_section_id from public.categories where scope = 'site' and owner_id is null and active and type in ('secao_receita', 'secao_home') and (
            slug = public.slugify(v_sec#>>'{}')
            or public.normalize_catalog_name(name) = public.normalize_catalog_name(v_sec#>>'{}')
            or public.normalize_catalog_name(name) = public.normalize_catalog_name(
              case v_sec#>>'{}'
                when 'recomendado' then 'Recomendados'
                when 'pratico' then 'Práticos para o Dia a Dia'
                when 'ocasiao' then 'Ocasiões Especiais'
                when 'rapido' then 'Pronto em 30 Minutos'
                when 'churrasco' then 'Direto da Churrasqueira'
                when 'petisco' then 'Petiscos para Compartilhar'
                else v_sec#>>'{}'
              end
            )
          ) limit 1;
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
