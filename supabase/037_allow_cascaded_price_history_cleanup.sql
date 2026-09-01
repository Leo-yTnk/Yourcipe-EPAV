-- Product price observations are immutable while their product exists, but the
-- foreign key deliberately defines ON DELETE CASCADE.  The original immutable
-- trigger also rejected that cascade, causing both Danger Zone cleanup RPCs to
-- roll back whenever a product had Swift price history.
create or replace function public.prevent_price_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A direct DELETE/UPDATE enters at depth 1 and remains forbidden.  The
  -- product_id foreign-key cascade enters this row trigger at a deeper level;
  -- allow that lifecycle delete so a product and its observations stay
  -- consistent with the ON DELETE CASCADE contract.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  raise exception 'price_history_is_immutable' using errcode = '55000';
end;
$$;

