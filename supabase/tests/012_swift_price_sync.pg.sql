\i supabase/tests/000_local_harness.sql
\i supabase/schema.sql
\i supabase/004_catalog_schema.sql
\i supabase/006_admin_catalog_publishing.sql
\i supabase/015_product_sections.sql
\i supabase/024_swift_price_sync.sql
\i supabase/027_fix_swift_source_price_status.sql
\i supabase/028_harden_swift_price_sync.sql
\i supabase/029_swift_price_sync_leases.sql

select plan(19);
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
select is((select count(*)::int from public.begin_swift_price_sync(null,300) where disposition='started'),1,'first batch obtains leased lock');
select is((select count(*)::int from public.begin_swift_price_sync('new-request',300) where disposition='active_conflict'),1,'second real sync receives active conflict');
select is((select count(*)::int from public.swift_price_sync_runs where finished_at is null),1,'active conflict leaves original run intact');

select public.finish_swift_price_sync((select id from public.swift_price_sync_runs where finished_at is null),'{}','{"lifecycle":"forced_after_lock"}','failed','unexpected_test');
select is((select outcome from public.swift_price_sync_runs order by id desc limit 1),'failed','post-lock internal error is finalized');
select is((select count(*)::int from public.begin_swift_price_sync('after-error',300) where disposition='started'),1,'a new sync starts after internal error cleanup');
select public.finish_swift_price_sync((select id from public.swift_price_sync_runs where finished_at is null),'{}','{}','completed',null);

select is((select count(*)::int from public.begin_swift_price_sync('idempotent',300) where disposition='started'),1,'idempotent request starts once');
select is((select count(*)::int from public.begin_swift_price_sync('idempotent',300) where disposition='duplicate_active'),1,'active duplicate is deterministic');
select public.finish_swift_price_sync((select id from public.swift_price_sync_runs where request_key='idempotent'),'{}','{}','completed',null);
select is((select count(*)::int from public.begin_swift_price_sync('idempotent',300) where disposition='duplicate_finished'),1,'finished duplicate does not create another run');
select is((select count(*)::int from public.swift_price_sync_runs where request_key='idempotent'),1,'idempotency creates exactly one run');

select is((select count(*)::int from public.begin_swift_price_sync('abandoned',60) where disposition='started'),1,'run that will be abandoned starts');
update public.swift_price_sync_runs set lease_expires_at=now()-interval '1 second' where request_key='abandoned';
select is((select count(*)::int from public.begin_swift_price_sync('recovery',300) where disposition='recovered_and_started'),1,'expired lease is recovered atomically');
select is((select outcome from public.swift_price_sync_runs where request_key='abandoned'),'abandoned','recovered run remains in audit history');
select is((select recovered_by_run_id is not null from public.swift_price_sync_runs where request_key='abandoned'),true,'recovery records the successor run');
select * from finish();
