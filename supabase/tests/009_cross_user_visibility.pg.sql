-- pgTAP regression suite for 011_cross_user_visibility.sql.
begin;
select plan(18);
select test.act_as(null, null);
insert into auth.users (id, raw_user_meta_data) values
 ('91000000-0000-0000-0000-000000000001', '{"display_name":"Visibility Admin"}'),
 ('91000000-0000-0000-0000-000000000002', '{"display_name":"User A"}'),
 ('91000000-0000-0000-0000-000000000003', '{"display_name":"User B"}');
update public.profiles set role='admin' where id='91000000-0000-0000-0000-000000000001';
\set adm '''91000000-0000-0000-0000-000000000001'''
\set ua  '''91000000-0000-0000-0000-000000000002'''
\set ub  '''91000000-0000-0000-0000-000000000003'''

select test.act_as(:adm, 'authenticated');
insert into public.categories(scope,type,name,active) values
 ('site','receita','Receitas Visíveis',true), ('site','secao','Seção Ativa',true),
 ('site','secao','Seção Inativa',false)
 returning id, type, active \gset
-- gset above only retains last row, so address fixtures by name below.
select id as site_recipe_cat from public.categories where name='Receitas Visíveis' \gset
select id as active_section from public.categories where name='Seção Ativa' \gset
select id as inactive_section from public.categories where name='Seção Inativa' \gset
insert into public.recipes(scope,status,name,category_id,prep_time,servings,difficulty)
 values ('site','published','Receita Pública A',:'site_recipe_cat',10,2,'Fácil') returning id as public_recipe \gset
insert into public.recipe_categories(recipe_id,category_id,sort_order) values
 (:'public_recipe',:'active_section',0), (:'public_recipe',:'inactive_section',1);

select test.act_as(:ua, 'authenticated');
insert into public.categories(scope,owner_id,type,name) values
 ('personal',:ua,'receita','Categoria Pessoal Igual'), ('personal',:ua,'secao','Seção Pessoal A');
select id as ua_recipe_cat from public.categories where owner_id=:ua and type='receita' \gset
insert into public.recipes(scope,owner_id,status,name,category_id,prep_time,servings,difficulty)
 values ('personal',:ua,'private','Receita Privada A',:'ua_recipe_cat',10,1,'Fácil') returning id as private_recipe \gset

select test.act_as(:ub, 'authenticated');
insert into public.categories(scope,owner_id,type,name) values ('personal',:ub,'receita','Categoria Pessoal Igual');
select is((select count(*) from public.recipes where id=:'public_recipe')::int,1,'user B sees user-independent published recipe');
select is((select count(*) from public.recipes where id=:'private_recipe')::int,0,'user B cannot see user A private recipe');
select is((select count(*) from public.categories where owner_id=:ua)::int,0,'user B cannot see user A personal categories');
select is((select count(*) from public.list_creation_categories() where scope='site' and id=:'active_section')::int,1,'user B creation list includes active public category');
select is((select count(*) from public.list_creation_categories() where scope='site' and id=:'inactive_section')::int,0,'user B creation list excludes inactive public category');
select is((select count(*) from public.list_creation_categories() where scope='personal' and owner_id=:ub)::int,1,'user B creation list includes own category');
select is((select count(*) from public.list_creation_categories() where scope='personal' and owner_id=:ua)::int,0,'user B creation list excludes another owner category');
select is((select count(*) from public.list_creation_categories() where name='Categoria Pessoal Igual')::int,1,'same names do not merge or leak cross-scope IDs');
select is((select count(*) from public.list_public_recipe_sections(array[:'public_recipe']::uuid[]) where slug=(select slug from public.categories where id=:'active_section'))::int,1,'plain user sees active public section');
select is((select count(*) from public.list_public_recipe_sections(array[:'public_recipe']::uuid[]) where slug=(select slug from public.categories where id=:'inactive_section'))::int,0,'inactive public section is excluded');

select test.act_as(:ua, 'authenticated');
select is((select count(*) from public.recipes where id=:'private_recipe')::int,1,'user A sees own private recipe');
select is((select count(*) from public.list_creation_categories() where owner_id=:ua)::int,2,'user A sees both own personal categories');
select lives_ok(format('select public.get_recipe_delete_impact(%L)', :'private_recipe'),'010-compatible recipe impact RPC still works for owner');

select test.act_as(:adm, 'authenticated');
select is((select count(*) from public.recipes where id=:'public_recipe')::int,1,'admin retains public recipe access');
select is((select count(*) from public.recipes where id=:'private_recipe')::int,0,'admin does not gain another user private recipe access');
select is((select count(*) from public.list_creation_categories() where scope='personal')::int,0,'admin does not gain personal categories of others');
select is((select count(*) from public.list_public_recipe_sections(array[:'public_recipe']::uuid[]))::int,1,'admin sees same active public sections as plain users');
select is((select count(*) from public.list_public_recipe_sections('{}'::uuid[]))::int,0,'empty recipe input is a safe empty state');
rollback;
