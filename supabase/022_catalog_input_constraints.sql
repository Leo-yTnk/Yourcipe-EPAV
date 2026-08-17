-- V0.41: enforce the same catalog boundaries in the trusted database layer.
-- NOT VALID keeps deployment safe when legacy rows need cleanup while still
-- enforcing each new INSERT/UPDATE. Validate after the audit query in STAGING.

alter table public.categories
  add constraint categories_name_length_ck
  check (char_length(btrim(name)) between 1 and 120) not valid;

alter table public.products
  add constraint products_name_length_ck
  check (char_length(btrim(name)) between 1 and 120) not valid,
  add constraint products_image_url_http_ck
  check (image_url is null or (char_length(image_url) <= 2048 and image_url ~* '^https?://[^[:space:]]+$')) not valid;

alter table public.recipes
  add constraint recipes_name_length_ck
  check (char_length(btrim(name)) between 1 and 120) not valid,
  add constraint recipes_image_url_http_ck
  check (image_url is null or (char_length(image_url) <= 2048 and image_url ~* '^https?://[^[:space:]]+$')) not valid;
