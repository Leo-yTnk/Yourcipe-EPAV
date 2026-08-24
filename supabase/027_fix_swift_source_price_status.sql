-- Keep manual Swift source updates type-safe. PostgreSQL resolves the branches
-- of CASE as text unless the enum type is made explicit.
create or replace function public.set_product_swift_source(p_product_id uuid, p_url text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_url is not null and p_url !~ '^https://www\.swift\.com\.br/[^?#]+$' then raise exception 'invalid_swift_product_url'; end if;
  update public.products
  set swift_product_url = p_url,
      price_status = case
        when p_url is null then 'MISSING_SOURCE'::public.product_price_status
        else 'STALE'::public.product_price_status
      end,
      price_error = null
  where id = p_product_id and scope = 'site';
  if not found then raise exception 'product_not_found'; end if;
end $$;

revoke all on function public.set_product_swift_source(uuid,text) from public;
grant execute on function public.set_product_swift_source(uuid,text) to authenticated;
