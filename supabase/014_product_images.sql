-- Yourcipe — product photo support (Modo de Criação / Catálogo Público).
-- Idempotent. Depends on 004_catalog_schema.sql (public.products).

alter table if exists public.products
  add column if not exists image_url text;
