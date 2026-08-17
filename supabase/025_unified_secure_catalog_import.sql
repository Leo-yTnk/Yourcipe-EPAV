-- Yourcipe V0.43 — unified, transaction-safe catalogue import with Swift identity.
-- Apply after 024. This replaces the single catalogue RPC; PostgreSQL executes
-- validation and all three entity groups atomically, so any error rolls back all changes.
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
      where scope = 'site' and owner_id is null and type = 'secao'
        and slug = v_section.slug;
    if not found then
      insert into public.categories(scope, owner_id, type, name, slug, sort_order, active)
      values ('site', null, 'secao', v_section.name, v_section.slug, v_section.sort_order, true);
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
    if btrim(coalesce(v_item->>'name', '')) = '' or coalesce(v_item->>'type', '') not in ('proteina', 'receita', 'secao') then raise exception 'invalid_category'; end if;
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
