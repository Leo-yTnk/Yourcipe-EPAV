-- Repair the two admin cleanup RPCs so current catalogue relationships do
-- not make Danger Zone operations fail with foreign-key violations.

create or replace function public.admin_delete_all_products_and_recipes(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipe_count integer;
  v_product_count integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_password is distinct from 'EPAV_admin_Tk' then
    raise exception 'invalid_confirmation_password' using errcode = '42501';
  end if;

  lock table public.recipes, public.products in access exclusive mode;
  select count(*) into v_recipe_count from public.recipes;
  select count(*) into v_product_count from public.products;
  delete from public.recipes;
  delete from public.products;

  return jsonb_build_object('recipes_deleted', v_recipe_count, 'products_deleted', v_product_count);
end;
$$;

revoke execute on function public.admin_delete_all_products_and_recipes(text) from public, anon;
grant execute on function public.admin_delete_all_products_and_recipes(text) to authenticated;

create or replace function public.admin_delete_inactive_catalog_items(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipe_count integer;
  v_product_count integer;
  v_category_count integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_password is distinct from 'EPAV_admin_Tk' then
    raise exception 'invalid_confirmation_password' using errcode = '42501';
  end if;

  lock table public.recipes, public.products, public.categories in access exclusive mode;

  delete from public.recipes where status = 'archived';
  get diagnostics v_recipe_count = row_count;

  -- Product references are links, so remove them before the inactive product.
  delete from public.recipe_ingredients
  where product_id in (select id from public.products where active is false);
  delete from public.products where active is false;
  get diagnostics v_product_count = row_count;

  -- Section links are disposable. Primary category references are not: retain
  -- an inactive category still used by a remaining recipe/product rather than
  -- aborting and rolling back the entire cleanup.
  delete from public.recipe_categories
  where category_id in (select id from public.categories where active is false);
  delete from public.product_categories
  where category_id in (select id from public.categories where active is false);
  delete from public.categories c
  where c.active is false
    and not exists (select 1 from public.recipes r where r.category_id = c.id)
    and not exists (select 1 from public.products p where p.category_id = c.id);
  get diagnostics v_category_count = row_count;

  return jsonb_build_object('recipes_deleted', v_recipe_count, 'products_deleted', v_product_count, 'categories_deleted', v_category_count);
end;
$$;

revoke execute on function public.admin_delete_inactive_catalog_items(text) from public, anon;
grant execute on function public.admin_delete_inactive_catalog_items(text) to authenticated;
