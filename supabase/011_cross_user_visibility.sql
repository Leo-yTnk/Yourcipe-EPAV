-- Yourcipe — canonical cross-account visibility reads.
-- Apply after 010. Idempotent: policies/functions/grants are replaced.
-- 009/010 deletion RPCs are intentionally not changed.

-- Reassert the two independent, permissive SELECT paths.  In particular,
-- admin access is additive (006), never a replacement for public/owner read.
drop policy if exists "categories_select_personal" on public.categories;
create policy "categories_select_personal" on public.categories for select to authenticated
  using (scope = 'personal' and owner_id = auth.uid());
drop policy if exists "categories_select_public" on public.categories;
create policy "categories_select_public" on public.categories for select to anon, authenticated
  using (scope = 'site' and active is true);

drop policy if exists "recipes_select_personal" on public.recipes;
create policy "recipes_select_personal" on public.recipes for select to authenticated
  using (scope = 'personal' and owner_id = auth.uid());
drop policy if exists "recipes_select_public" on public.recipes;
create policy "recipes_select_public" on public.recipes for select to anon, authenticated
  using (scope = 'site' and status = 'published');

grant select on public.categories, public.recipes, public.recipe_categories to anon, authenticated;

-- One source for creation-form categories. IDs are never collapsed by name:
-- equal names in different scopes remain distinct choices with their real ID.
create or replace function public.list_creation_categories()
returns setof public.categories
language sql
stable
security invoker
set search_path = public
as $$
  select c.*
  from public.categories c
  where (c.scope = 'site' and c.active is true)
     or (c.scope = 'personal' and c.owner_id = auth.uid())
  order by c.scope, c.name, c.id
$$;
revoke execute on function public.list_creation_categories() from public;
grant execute on function public.list_creation_categories() to authenticated;

-- Home must have the same public section vocabulary for anon, user and admin.
-- A direct embedded SELECT is subtly role-dependent because 006 lets admins
-- also see inactive categories. This definer function deliberately narrows
-- its result to active public sections attached to published public recipes.
create or replace function public.list_public_recipe_sections(p_recipe_ids uuid[])
returns table(recipe_id uuid, slug text)
language sql
stable
security definer
set search_path = public
as $$
  select rc.recipe_id, c.slug
  from public.recipe_categories rc
  join public.recipes r on r.id = rc.recipe_id
  join public.categories c on c.id = rc.category_id
  where rc.recipe_id = any(coalesce(p_recipe_ids, '{}'::uuid[]))
    and r.scope = 'site' and r.status = 'published'
    and c.scope = 'site' and c.type = 'secao' and c.active is true
  order by rc.recipe_id, rc.sort_order, c.id
$$;
revoke execute on function public.list_public_recipe_sections(uuid[]) from public;
grant execute on function public.list_public_recipe_sections(uuid[]) to anon, authenticated;
