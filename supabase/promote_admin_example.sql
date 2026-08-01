-- Manual admin promotion — run by hand in the Supabase SQL Editor only.
-- This is intentionally NOT reachable from the app's front-end.
--
-- 1. Create your credential normally through the app's signup form.
-- 2. Find its user in Authentication > Users and copy the UUID
--    (do NOT identify it by email — the email is an internal, meaningless
--    technical identifier, not something to search by).
-- 3. Replace the placeholder below and run this single statement.

update public.profiles
set role = 'admin'
where id = 'UUID_DO_USUARIO';
