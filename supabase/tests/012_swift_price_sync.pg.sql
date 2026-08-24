\i supabase/tests/000_local_harness.sql
\i supabase/schema.sql
\i supabase/004_catalog_schema.sql
\i supabase/006_admin_catalog_publishing.sql
\i supabase/015_product_sections.sql
\i supabase/024_swift_price_sync.sql
\i supabase/027_fix_swift_source_price_status.sql
\i supabase/028_harden_swift_price_sync.sql

select plan(7);
insert into public.categories(id,scope,owner_id,type,name,slug,active) values
 ('93000000-0000-0000-0000-000000000001','site',null,'proteina','Bovinos','bovinos',true);
insert into public.products(id,scope,owner_id,name,category_id,unit,price,active,swift_product_url,price_status) values
 ('93000000-0000-0000-0000-000000000002','site',null,'Picanha bovina Swift','93000000-0000-0000-0000-000000000001','kg',10,true,'https://www.swift.com.br/picanha','STALE');

select is(public.apply_swift_price_observation('93000000-0000-0000-0000-000000000002',
 '{"swift_product_url":"https://www.swift.com.br/picanha","swift_product_id":"p1","swift_sku":"s1","regular_price_cents":4990,"pricing_type":"PER_KG","price_unit":"KG","reference_zip_code":"01001000","region":"SP","source_hash":"hash-1","checked_at":"2026-08-24T12:00:00Z"}'::jsonb), true, 'observation reports changed');
select is((select regular_price_cents from public.products where id='93000000-0000-0000-0000-000000000002'),4990,'confirmed product price is updated');
select is((select count(*)::int from public.product_price_history where product_id='93000000-0000-0000-0000-000000000002'),1,'exactly one history row is created');
select throws_ok($$update public.product_price_history set regular_price_cents=1 where product_id='93000000-0000-0000-0000-000000000002'$$,'55000','price_history_is_immutable','history is immutable');
select throws_ok($$select public.apply_swift_price_observation('93000000-0000-0000-0000-000000000002','{"swift_product_url":"https://www.swift.com.br/picanha","regular_price_cents":0,"pricing_type":"PER_KG","price_unit":"KG","reference_zip_code":"01001000","source_hash":"bad","checked_at":"2026-08-24T12:01:00Z"}'::jsonb)$$,'23514',null,'invalid history aborts the transaction');
select is((select regular_price_cents from public.products where id='93000000-0000-0000-0000-000000000002'),4990,'failed history cannot alter confirmed product price');
select is((select count(*)::int from public.begin_swift_price_sync(null)),1,'first batch obtains lock');
select * from finish();
