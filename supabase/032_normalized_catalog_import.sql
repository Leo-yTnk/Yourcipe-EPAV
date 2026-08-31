-- V0.50 — atomic spreadsheet import for first-class pages and sections.
create or replace function public.admin_import_public_catalog(
  p_modes jsonb, p_categories jsonb, p_products jsonb, p_recipes jsonb,
  p_sections jsonb, p_recipe_section_links jsonb, p_product_section_links jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb; v_core jsonb; v_page_id uuid; v_section_id uuid; v_item_id uuid;
  v_mode text; v_sections jsonb := coalesce(p_sections,'[]'::jsonb);
  v_recipe_links jsonb := coalesce(p_recipe_section_links,'[]'::jsonb);
  v_product_links jsonb := coalesce(p_product_section_links,'[]'::jsonb);
  sa int:=0; sr int:=0; si int:=0; sd int:=0; ra int:=0; rr int:=0; ri int:=0; rd int:=0; pa int:=0; pr int:=0; pi int:=0; pd int:=0;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'not_authorized' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_categories,'[]'))<>'array' or jsonb_typeof(coalesce(p_products,'[]'))<>'array' or jsonb_typeof(coalesce(p_recipes,'[]'))<>'array' or jsonb_typeof(v_sections)<>'array' or jsonb_typeof(v_recipe_links)<>'array' or jsonb_typeof(v_product_links)<>'array' then raise exception 'invalid_import_payload'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_categories,'[]')) x where x->>'type' not in ('receita','proteina')) or exists(select 1 from jsonb_array_elements(coalesce(p_recipes,'[]')) x where coalesce(x->'sections','[]') <> '[]'::jsonb) then raise exception 'legacy_import_format_not_supported'; end if;
  foreach v_mode in array array[coalesce(p_modes->>'categories','add'),coalesce(p_modes->>'products','add'),coalesce(p_modes->>'recipes','add'),coalesce(p_modes->>'sections','add'),coalesce(p_modes->>'recipeSections','add'),coalesce(p_modes->>'productSections','add')] loop if v_mode not in ('add','upsert','replace_all') then raise exception 'invalid_import_mode: %',v_mode; end if; end loop;
  -- Full preflight: page, composite section identity, entity reference and duplicate link checks.
  if exists(select 1 from jsonb_array_elements(v_sections) x where x->>'page' not in ('home','recipes','products') or btrim(coalesce(x->>'name',''))='' or (x->>'sort_order')::int<0) then raise exception 'invalid_section'; end if;
  if exists(select 1 from jsonb_array_elements(v_sections) x group by x->>'page',public.slugify(x->>'name') having count(*)>1) then raise exception 'duplicate_section_in_payload'; end if;
  for v_row in select * from jsonb_array_elements(v_recipe_links) loop
    if v_row->>'page' not in ('home','recipes') then raise exception 'invalid_recipe_section_page: %',v_row->>'page'; end if;
    if not exists(select 1 from public.catalog_sections s join public.catalog_pages p on p.id=s.page_id where p.key=v_row->>'page' and s.slug=public.slugify(v_row->>'section')) and not exists(select 1 from jsonb_array_elements(v_sections) x where x->>'page'=v_row->>'page' and public.slugify(x->>'name')=public.slugify(v_row->>'section')) then raise exception 'section_not_found: %/%',v_row->>'page',v_row->>'section'; end if;
    if not exists(select 1 from public.recipes r where r.scope='site' and r.owner_id is null and public.normalize_catalog_name(r.name)=public.normalize_catalog_name(v_row->>'recipe')) and not exists(select 1 from jsonb_array_elements(coalesce(p_recipes,'[]')) x where public.normalize_catalog_name(x->>'name')=public.normalize_catalog_name(v_row->>'recipe')) then raise exception 'recipe_not_found: %',v_row->>'recipe'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(v_recipe_links) x group by x->>'page',public.slugify(x->>'section'),public.normalize_catalog_name(x->>'recipe') having count(*)>1) then raise exception 'duplicate_recipe_section_link'; end if;
  for v_row in select * from jsonb_array_elements(v_product_links) loop
    if v_row->>'page'<>'products' then raise exception 'invalid_product_section_page: %',v_row->>'page'; end if;
    if not exists(select 1 from public.catalog_sections s join public.catalog_pages p on p.id=s.page_id where p.key='products' and s.slug=public.slugify(v_row->>'section')) and not exists(select 1 from jsonb_array_elements(v_sections) x where x->>'page'='products' and public.slugify(x->>'name')=public.slugify(v_row->>'section')) then raise exception 'section_not_found: products/%',v_row->>'section'; end if;
    if not exists(select 1 from public.products q where q.scope='site' and q.owner_id is null and public.normalize_catalog_name(q.name)=public.normalize_catalog_name(v_row->>'product')) and not exists(select 1 from jsonb_array_elements(coalesce(p_products,'[]')) x where public.normalize_catalog_name(x->>'name')=public.normalize_catalog_name(v_row->>'product')) then raise exception 'product_not_found: %',v_row->>'product'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(v_product_links) x group by public.slugify(x->>'section'),public.normalize_catalog_name(x->>'product') having count(*)>1) then raise exception 'duplicate_product_section_link'; end if;

  -- Reuse the proven Swift/taxonomy/recipe importer; section arrays are empty,
  -- so it creates no visual-position associations in legacy category tables.
  select public.admin_import_public_catalog(p_modes,p_categories,p_products,p_recipes) into v_core;

  if p_modes->>'sections'='replace_all' then
    update public.catalog_sections s set active=false,updated_at=now() from public.catalog_pages p where p.id=s.page_id and exists(select 1 from jsonb_array_elements(v_sections)x where x->>'page'=p.key) and not exists(select 1 from jsonb_array_elements(v_sections)x where x->>'page'=p.key and public.slugify(x->>'name')=s.slug); get diagnostics sd=row_count;
  end if;
  for v_row in select * from jsonb_array_elements(v_sections) loop
    select id into v_page_id from public.catalog_pages where key=v_row->>'page';
    select id into v_section_id from public.catalog_sections where page_id=v_page_id and slug=public.slugify(v_row->>'name');
    if v_section_id is null then insert into public.catalog_sections(page_id,name,slug,sort_order,active) values(v_page_id,btrim(v_row->>'name'),public.slugify(v_row->>'name'),(v_row->>'sort_order')::int,(v_row->>'active')::boolean) returning id into v_section_id;sa:=sa+1;
    elsif coalesce(p_modes->>'sections','add')='add' then si:=si+1;
    else update public.catalog_sections set name=btrim(v_row->>'name'),sort_order=(v_row->>'sort_order')::int,active=(v_row->>'active')::boolean,updated_at=now() where id=v_section_id;sr:=sr+1; end if;
  end loop;
  if p_modes->>'recipeSections'='replace_all' then delete from public.catalog_section_recipes l using public.catalog_sections s,public.catalog_pages p where l.section_id=s.id and s.page_id=p.id and exists(select 1 from jsonb_array_elements(v_recipe_links)x where x->>'page'=p.key);get diagnostics rd=row_count;end if;
  for v_row in select * from jsonb_array_elements(v_recipe_links) loop select s.id into v_section_id from public.catalog_sections s join public.catalog_pages p on p.id=s.page_id where p.key=v_row->>'page' and s.slug=public.slugify(v_row->>'section');select id into v_item_id from public.recipes where scope='site' and owner_id is null and public.normalize_catalog_name(name)=public.normalize_catalog_name(v_row->>'recipe') limit 1;if exists(select 1 from public.catalog_section_recipes where section_id=v_section_id and recipe_id=v_item_id) then if coalesce(p_modes->>'recipeSections','add')='add' then ri:=ri+1;else update public.catalog_section_recipes set sort_order=(v_row->>'sort_order')::int where section_id=v_section_id and recipe_id=v_item_id;rr:=rr+1;end if;else insert into public.catalog_section_recipes values(v_section_id,v_item_id,(v_row->>'sort_order')::int);ra:=ra+1;end if;end loop;
  if p_modes->>'productSections'='replace_all' then delete from public.catalog_section_products l using public.catalog_sections s,public.catalog_pages p where l.section_id=s.id and s.page_id=p.id and p.key='products';get diagnostics pd=row_count;end if;
  for v_row in select * from jsonb_array_elements(v_product_links) loop select s.id into v_section_id from public.catalog_sections s join public.catalog_pages p on p.id=s.page_id where p.key='products' and s.slug=public.slugify(v_row->>'section');select id into v_item_id from public.products where scope='site' and owner_id is null and public.normalize_catalog_name(name)=public.normalize_catalog_name(v_row->>'product') limit 1;if exists(select 1 from public.catalog_section_products where section_id=v_section_id and product_id=v_item_id) then if coalesce(p_modes->>'productSections','add')='add' then pi:=pi+1;else update public.catalog_section_products set sort_order=(v_row->>'sort_order')::int where section_id=v_section_id and product_id=v_item_id;pr:=pr+1;end if;else insert into public.catalog_section_products values(v_section_id,v_item_id,(v_row->>'sort_order')::int);pa:=pa+1;end if;end loop;
  return v_core||jsonb_build_object('sections',jsonb_build_object('added',sa,'replaced',sr,'ignored',si,'removed',sd),'recipe_sections',jsonb_build_object('added',ra,'replaced',rr,'ignored',ri,'removed',rd),'product_sections',jsonb_build_object('added',pa,'replaced',pr,'ignored',pi,'removed',pd));
end $$;
revoke execute on function public.admin_import_public_catalog(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.admin_import_public_catalog(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;
