-- Irreversible emergency cleanup for Products and Recipes only.
-- Authorization and the confirmation password are checked in the database;
-- hiding the UI is deliberately not treated as a security boundary.
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

  -- Serialize against catalog writes and delete recipes first because
  -- recipe_ingredients intentionally restricts deletion of used products.
  lock table public.recipes, public.products in access exclusive mode;
  select count(*) into v_recipe_count from public.recipes;
  select count(*) into v_product_count from public.products;
  delete from public.recipes;
  delete from public.products;

  return jsonb_build_object(
    'recipes_deleted', v_recipe_count,
    'products_deleted', v_product_count
  );
end;
$$;

revoke execute on function public.admin_delete_all_products_and_recipes(text) from public, anon;
grant execute on function public.admin_delete_all_products_and_recipes(text) to authenticated;
