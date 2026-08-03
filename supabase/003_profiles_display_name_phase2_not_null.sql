-- Yourcipe — profiles.display_name, PHASE 2 of 2.
-- DO NOT RUN THIS UNTIL A HUMAN HAS CONFIRMED there are zero rows with
-- display_name IS NULL in the target project (staging first, production
-- only after the same confirmation is repeated there).
--
-- Run this manually to check first:
--   select count(*) from public.profiles where display_name is null;
-- It must return 0 before proceeding.
--
-- This file is defensive: if any NULL remains, the DO block below raises
-- and the ALTER TABLE never runs, so it is safe to attempt even if the
-- backfill isn't finished yet — it just fails loudly instead of doing
-- nothing or, worse, succeeding on a placeholder value nobody approved.

do $$
declare
  v_remaining integer;
begin
  select count(*) into v_remaining from public.profiles where display_name is null;
  if v_remaining > 0 then
    raise exception 'display_name backfill incomplete: % row(s) still have display_name IS NULL. '
      'Do not proceed until every existing account has completed its profile '
      '(via the app''s "complete your profile" gate) or a human has explicitly '
      'decided a value per account. This script will not invent names.', v_remaining;
  end if;
end $$;

alter table public.profiles
  alter column display_name set not null;
