-- pgTAP for 012_home_section_order.sql. Run after the existing local chain + 011 + 012.
begin;
select plan(7);
select test.act_as(null, null);
insert into auth.users (id, raw_user_meta_data) values
 ('92000000-0000-0000-0000-000000000001', '{"display_name":"Order Admin"}'),
 ('92000000-0000-0000-0000-000000000002', '{"display_name":"Order User"}');
update public.profiles set role='admin' where id='92000000-0000-0000-0000-000000000001';
\set adm '''92000000-0000-0000-0000-000000000001'''
\set usr '''92000000-0000-0000-0000-000000000002'''

select test.act_as(:adm, 'authenticated');
insert into public.categories(scope,type,name,active,sort_order) values
 ('site','secao','Order A',true,10), ('site','secao','Order B',true,20), ('site','secao','Order C',false,30);
select array_agg(id order by sort_order) ids from public.categories where scope='site' and type='secao' \gset
select lives_ok(format('select public.reorder_site_sections(%L::uuid[])', array[(:'ids'::uuid[])[2],(:'ids'::uuid[])[1],(:'ids'::uuid[])[3]]), 'admin can reorder the complete section set atomically');
select is((select name from public.categories where scope='site' and type='secao' order by sort_order limit 1), 'Order B', 'new first section is persisted');
select is((select count(distinct sort_order) from public.categories where scope='site' and type='secao')::int, 3, 'persisted sort positions are distinct');
select throws_like(format('select public.reorder_site_sections(%L::uuid[])', array[(:'ids'::uuid[])[1]]), 'stale_section_order', 'partial/stale lists are rejected');
select throws_like(format('select public.reorder_site_sections(%L::uuid[])', array[(:'ids'::uuid[])[1],(:'ids'::uuid[])[1],(:'ids'::uuid[])[3]]), 'stale_section_order', 'duplicate ids are rejected');

select test.act_as(:usr, 'authenticated');
select throws_like(format('select public.reorder_site_sections(%L::uuid[])', :'ids'::uuid[]), 'not_admin', 'plain user cannot reorder Home sections');
select is((select string_agg(name, ',' order by sort_order) from public.categories where scope='site' and type='secao' and active), 'Order B,Order A', 'plain users observe the synchronized active order');
rollback;
