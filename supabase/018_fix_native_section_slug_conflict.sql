-- Fix native-section restoration after 017: category slugs are derived from
-- their display names by trg_assign_category_slug, so existence checks must
-- use the same derived slug rather than the spreadsheet tag key.
create or replace function public.ensure_native_recipe_sections()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_section record;
begin
  for v_section in
    select * from (values
      ('recomendado', 'Recomendados', 0),
      ('pratico', 'Práticos para o Dia a Dia', 1),
      ('ocasiao', 'Ocasiões Especiais', 2),
      ('rapido', 'Pronto em 30 Minutos', 3),
      ('churrasco', 'Direto da Churrasqueira', 4),
      ('petisco', 'Petiscos para Compartilhar', 5)
    ) native(tag, name, sort_order)
  loop
    update public.categories
      set active = true
      where scope = 'site' and owner_id is null and type = 'secao'
        and slug = public.slugify(v_section.name);
    if not found then
      insert into public.categories(scope, owner_id, type, name, slug, sort_order, active)
      values ('site', null, 'secao', v_section.name, public.slugify(v_section.name), v_section.sort_order, true);
    end if;
  end loop;
end;
$$;
revoke execute on function public.ensure_native_recipe_sections() from public, anon;
grant execute on function public.ensure_native_recipe_sections() to authenticated;
