-- Public catalogue readers must not need permission to execute is_admin().
--
-- The original policies combined the public and administrative cases in one
-- expression (`active or public.is_admin()`).  PostgreSQL may evaluate the
-- function for an anonymous reader even when `active` is true, while execute
-- on is_admin() is intentionally restricted to authenticated users.  That
-- made the catalogue fail to load instead of returning the active rows.

drop policy if exists catalog_pages_read on public.catalog_pages;
drop policy if exists catalog_sections_read on public.catalog_sections;

-- Published catalogue navigation is readable by everybody and does not run
-- any privileged function.  Updates made active by an admin therefore become
-- visible to anonymous and authenticated non-admin users immediately.
create policy catalog_pages_public_read
  on public.catalog_pages
  for select
  to anon, authenticated
  using (active);

create policy catalog_sections_public_read
  on public.catalog_sections
  for select
  to anon, authenticated
  using (active);

-- Only authenticated sessions can enter these policies, matching the execute
-- grant on is_admin().  Admins retain preview access to inactive navigation.
create policy catalog_pages_admin_read
  on public.catalog_pages
  for select
  to authenticated
  using (public.is_admin());

create policy catalog_sections_admin_read
  on public.catalog_sections
  for select
  to authenticated
  using (public.is_admin());
