-- Yourcipe — keep native section restoration compatible with display names.
-- Idempotent follow-up for environments where migration 018 was applied.
--
-- Category slugs are always regenerated from `name` by
-- trg_assign_category_slug. Some native vocabulary keys (for example
-- `recomendado`) intentionally differ from the slug of their display name
-- (`Recomendados` -> `recomendados`). Looking only for the vocabulary key
-- therefore attempted to insert the display name again on every import and
-- eventually hit categories_site_slug_uk. Treat the native key and its
-- simplified display name as equivalent, just like the catalog upsert does.
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
    ) native(slug, name, sort_order)
  loop
    update public.categories
      set active = true
      where scope = 'site' and owner_id is null and type = 'secao'
        and (
          slug = v_section.slug
          or public.normalize_catalog_name(name) = public.normalize_catalog_name(v_section.name)
        );
    if not found then
      insert into public.categories(scope, owner_id, type, name, slug, sort_order, active)
      values ('site', null, 'secao', v_section.name, v_section.slug, v_section.sort_order, true);
    end if;
  end loop;
end;
$$;
revoke execute on function public.ensure_native_recipe_sections() from public, anon;
grant execute on function public.ensure_native_recipe_sections() to authenticated;
