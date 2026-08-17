-- Supabase-backed catalog presentation preference. This replaces the former
-- device-local card layout setting while keeping profiles as the single source
-- of truth for every authenticated visitor.
alter table public.profiles
  add column if not exists catalog_card_layout text not null default 'carousel'
  check (catalog_card_layout in ('carousel', 'grid'));

comment on column public.profiles.catalog_card_layout is
  'Card presentation used by recipe and product catalog sections.';
