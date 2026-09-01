-- Permanent, admin-only cleanup of catalog rows explicitly marked inactive.
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
  select count(*) into v_recipe_count from public.recipes where status = 'archived';
  select count(*) into v_product_count from public.products where active = false;
  select count(*) into v_category_count from public.categories where active = false;

  -- Dependent junction rows are disposable catalog links. Primary category
  -- references are removed with their inactive recipe/product below.
  delete from public.recipes where status = 'archived';
  delete from public.recipe_ingredients where product_id in (select id from public.products where active = false);
  delete from public.products where active = false;
  delete from public.recipe_categories where category_id in (select id from public.categories where active = false);
  delete from public.product_categories where category_id in (select id from public.categories where active = false);
  delete from public.categories where active = false;

  return jsonb_build_object('recipes_deleted', v_recipe_count, 'products_deleted', v_product_count, 'categories_deleted', v_category_count);
end;
$$;

revoke execute on function public.admin_delete_inactive_catalog_items(text) from public, anon;
grant execute on function public.admin_delete_inactive_catalog_items(text) to authenticated;
