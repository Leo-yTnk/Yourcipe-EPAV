\i supabase/tests/000_local_harness.sql
\i supabase/schema.sql
\i supabase/002_profiles_display_name_phase1.sql
\i supabase/004_catalog_schema.sql
\i supabase/006_admin_catalog_publishing.sql
\i supabase/012_admin_import_and_home_order.sql
\i supabase/014_product_images.sql
\i supabase/015_product_sections.sql
\i supabase/017_native_import_sections.sql
\i supabase/018_collision_safe_import.sql
\i supabase/019_native_section_name_equivalence.sql
\i supabase/020_native_recipe_section_resolution.sql
\i supabase/023_page_specific_sections.sql
\i supabase/024_swift_price_sync.sql
\i supabase/025_unified_secure_catalog_import.sql
\i supabase/026_page_specific_import_sections.sql
\i supabase/027_fix_swift_source_price_status.sql
\i supabase/031_catalog_pages_and_sections.sql
\i supabase/032_normalized_catalog_import.sql
\i supabase/033_catalog_import_contract_v0100.sql

select plan(11);

insert into auth.users (id) values ('94000000-0000-0000-0000-000000000001');
update public.profiles set role='admin' where id='94000000-0000-0000-0000-000000000001';
select test.act_as('94000000-0000-0000-0000-000000000001','authenticated');

select lives_ok($$select public.admin_import_public_catalog(
  '{"categories":"add","products":"add","recipes":"add","sections":"add","recipeSections":"add","productSections":"add"}',
  '[{"type":"proteina","name":"Bovinos"},{"type":"receita","name":"Bovina"}]',
  '[{"name":"Picanha Swift","category":"Bovinos","unit":"kg","price":null,"image_url":"https://example.com/picanha.jpg","swift_product_url":"https://www.swift.com.br/picanha-v0100","swift_sku":"V0100"}]',
  '[{"name":"Picanha Assada","category":"Bovina","prep_time":50,"servings":6,"difficulty":"Fácil","image_url":"https://example.com/receita.jpg","featured":true,"ingredients":[{"product":"Picanha Swift","quantity":1}],"sections":[],"extras":[],"instructions":["Asse."],"tips":[]}]',
  '[{"page":"home","name":"Destaques","sort_order":0,"active":true},{"page":"recipes","name":"Bovinas","sort_order":0,"active":true},{"page":"products","name":"Churrasco","sort_order":0,"active":true}]',
  '[{"page":"home","section":"Destaques","recipe":"Picanha Assada","sort_order":1},{"page":"recipes","section":"Bovinas","recipe":"Picanha Assada","sort_order":1}]',
  '[{"page":"products","section":"Churrasco","product":"Picanha Swift","sort_order":1}]'
)$$, 'a joint six-sheet import resolves entities created in the same transaction');
select is((select count(*)::int from public.catalog_section_recipes),2,'recipe links are inserted');
select is((select count(*)::int from public.catalog_section_products),1,'product links are inserted');

select throws_ok($$select public.admin_import_public_catalog('{}','[]','[]','[]','[]','[{"page":"home","section":"Destaques","recipe":"Inexistente","sort_order":0}]','[]')$$,'P0001','recipe_not_found: Inexistente','a genuinely missing recipe is rejected');
select throws_ok($$select public.admin_import_public_catalog('{}','[]','[]','[]','[]','[]','[{"page":"products","section":"Churrasco","product":"Inexistente","sort_order":0}]')$$,'P0001','product_not_found: Inexistente','a genuinely missing product is rejected');
select throws_ok($$select public.admin_import_public_catalog('{}','[]','[]','[]','[]','[{"page":"home","section":"Destaques","sort_order":0}]','[]')$$,'P0001','recipe_reference_missing','a missing recipe property has a structural error');
select throws_ok($$select public.admin_import_public_catalog('{}','[]','[]','[]','[]','[]','[{"page":"products","section":"Churrasco","sort_order":0}]')$$,'P0001','product_reference_missing','a missing product property has a structural error');
select throws_ok($$select public.admin_import_public_catalog('{}','[]','[]','[]','[]','[{"page":"home","section":"Destaques","recipe":"Picanha Assada","sort_order":0},{"page":"home","section":"Destaques","recipe":"Picanha Assada","sort_order":1}]','[]')$$,'P0001','duplicate_recipe_section_link','duplicate links remain rejected');

select throws_ok($$select public.admin_import_public_catalog('{}','[{"type":"proteina","name":"Rollback"}]','[]','[]','[]','[{"page":"home","section":"Destaques","recipe":"Ainda Inexistente","sort_order":0}]','[]')$$,'P0001','recipe_not_found: Ainda Inexistente','a failed preflight rejects the complete import');
select is((select count(*)::int from public.categories where name='Rollback'),0,'failed preflight applies no partial category mutation');
select is((select count(*)::int from public.products where name='Picanha Swift' and swift_product_url='https://www.swift.com.br/picanha-v0100'),1,'joint import preserves the Swift product identity');

select * from finish();
