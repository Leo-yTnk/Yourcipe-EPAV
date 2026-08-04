-- Yourcipe — administrator-controlled, globally synchronized Home section order.
-- Apply after 011. Earlier migrations remain unchanged.
create or replace function public.reorder_site_sections(p_section_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected integer;
  v_distinct integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.is_admin() then raise exception 'not_admin'; end if;

  select count(*) into v_expected
  from public.categories where scope = 'site' and type = 'secao';
  select count(distinct id) into v_distinct from unnest(coalesce(p_section_ids, '{}'::uuid[])) id;

  -- Require the complete set. A stale/partial client must refetch rather than
  -- accidentally resetting omitted or newly-created sections.
  if cardinality(coalesce(p_section_ids, '{}'::uuid[])) <> v_expected
     or v_distinct <> v_expected
     or exists (
       select 1 from unnest(coalesce(p_section_ids, '{}'::uuid[])) id
       where not exists (
         select 1 from public.categories c
         where c.id = id and c.scope = 'site' and c.type = 'secao'
       )
     ) then
    raise exception 'stale_section_order';
  end if;

  update public.categories c
  set sort_order = ordered.ordinality::integer * 10,
      updated_at = now(), updated_by = auth.uid()
  from unnest(p_section_ids) with ordinality ordered(id, ordinality)
  where c.id = ordered.id;
end;
$$;
revoke execute on function public.reorder_site_sections(uuid[]) from public;
grant execute on function public.reorder_site_sections(uuid[]) to authenticated;
