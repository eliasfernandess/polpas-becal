-- Testes transacionais de kits, preço por quantidade, área de entrega e pedido mínimo. Tudo é revertido.
begin;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-c000-00000000000a', 'adm3@teste.local', now()),
  ('00000000-0000-4000-c000-00000000000e', 'est3@teste.local', now());
insert into public.admins (user_id, role, name, email) values
  ('00000000-0000-4000-c000-00000000000a', 'admin', 'Adm Kits', 'adm3@teste.local'),
  ('00000000-0000-4000-c000-00000000000e', 'estoque', 'Est Kits', 'est3@teste.local');

-- Administrador configura
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-c000-00000000000a', true);
do $$
begin
  update public.products set bulk_min = 10, bulk_price_in_cents = 400 where id = 'morango';
  begin
    update public.products set bulk_min = 10, bulk_price_in_cents = 600 where id = 'manga';
    raise exception 'Preço por quantidade maior que o normal aceito';
  exception when check_violation then null; end;
  update public.kits set available = true where id = 'kit-semana';
  insert into public.kits (id, name, price_in_cents, items) values ('duo', 'Duo', 800, '[{"id":"morango","quantity":1},{"id":"limao","quantity":1}]');
  begin
    insert into public.kits (id, name, price_in_cents, items) values ('ruim', 'Ruim', 800, '[{"id":"nao-existe","quantity":1}]');
    raise exception 'Kit com sabor inexistente aceito';
  exception when check_violation then null; end;
  insert into public.delivery_zones (city, district, fee_cents) values ('Uberlândia', 'Centro', 500), ('Uberlândia', 'Santa Mônica', 700);
  begin
    insert into public.delivery_zones (city, district, fee_cents) values ('uberlândia', ' centro ', 100);
    raise exception 'Bairro duplicado aceito';
  exception when unique_violation then null; end;
  update public.store_settings set min_order_cents = 2000 where id;
end $$;
reset role;

-- Função Estoque não mexe nas regras
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-c000-00000000000e', true);
do $$
declare v_rows integer;
begin
  update public.store_settings set min_order_cents = 0 where id;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'Estoque alterou o pedido mínimo'; end if;
  begin
    insert into public.delivery_zones (city, district, fee_cents) values ('Uberlândia', 'Tibery', 0);
    raise exception 'Estoque criou bairro';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Visitante compra
set local role anon;
do $$
begin
  if (select count(*) from public.kits) <> 2 then raise exception 'Visitante não vê os kits ativos'; end if;
  if (select count(*) from public.delivery_zones) <> 2 then raise exception 'Visitante não vê os bairros'; end if;
  -- Preço por quantidade: 10 morangos a R$ 4,00 = R$ 40,00; com 9, vale o preço normal.
  insert into public.orders (id, items, total_in_cents, customer_name, customer_phone, fulfillment)
    values ('20000000-0000-4000-8000-000000000001', '[{"id":"morango","quantity":10}]', 4000, 'Ana', '34999990000', 'retirada');
  begin
    insert into public.orders (id, items, total_in_cents, customer_name, customer_phone, fulfillment)
      values (gen_random_uuid(), '[{"id":"morango","quantity":9}]', 3600, 'Ana', '34999990000', 'retirada');
    raise exception 'Preço por quantidade aplicado abaixo do mínimo';
  exception when check_violation then null; end;
  -- Kit + avulso, entrega no Centro com taxa.
  insert into public.orders (id, items, total_in_cents, customer_name, customer_phone, fulfillment, postal_code, street, street_number, district, city, delivery_fee_cents)
    values ('20000000-0000-4000-8000-000000000002', '[{"id":"kit:kit-semana","quantity":2},{"id":"limao","quantity":1}]', 2 * 2690 + 350,
      'Bia', '34999991111', 'entrega', '38400000', 'Rua A', '1', 'centro', 'Uberlândia', 500);
  begin
    insert into public.orders (id, items, total_in_cents, customer_name, customer_phone, fulfillment, postal_code, street, street_number, district, city, delivery_fee_cents)
      values (gen_random_uuid(), '[{"id":"kit:kit-semana","quantity":1}]', 2690, 'Fora', '34999991111', 'entrega', '38400000', 'Rua A', '1', 'Tibery', 'Uberlândia', 0);
    raise exception 'Entrega fora da área aceita';
  exception when check_violation then null; end;
  begin
    insert into public.orders (id, items, total_in_cents, customer_name, customer_phone, fulfillment, postal_code, street, street_number, district, city, delivery_fee_cents)
      values (gen_random_uuid(), '[{"id":"kit:kit-semana","quantity":1}]', 2690, 'Taxa', '34999991111', 'entrega', '38400000', 'Rua A', '1', 'Centro', 'Uberlândia', 0);
    raise exception 'Taxa adulterada aceita';
  exception when check_violation then null; end;
  begin
    insert into public.orders (id, items, total_in_cents, customer_name, customer_phone, fulfillment, postal_code, street, street_number, district, city, delivery_fee_cents)
      values (gen_random_uuid(), '[{"id":"limao","quantity":1}]', 350, 'Pouco', '34999991111', 'entrega', '38400000', 'Rua A', '1', 'Centro', 'Uberlândia', 500);
    raise exception 'Entrega abaixo do mínimo aceita';
  exception when check_violation then null; end;
  -- Estoque somado: o limão (14 un.) não aguenta 14 avulsos + 1 dentro do kit.
  begin
    insert into public.orders (id, items, total_in_cents, customer_name, customer_phone, fulfillment)
      values (gen_random_uuid(), '[{"id":"limao","quantity":14},{"id":"kit:kit-semana","quantity":1}]', 14 * 350 + 2690, 'Muito', '34999991111', 'retirada');
    raise exception 'Estoque somado de kit e avulso ignorado';
  exception when check_violation then null; end;
end $$;
reset role;

-- Confirmar baixa os sabores de dentro do kit
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-c000-00000000000e', true);
do $$
begin
  if (select delivery_fee_cents from public.orders where id = '20000000-0000-4000-8000-000000000002') <> 500 then raise exception 'Taxa não gravada'; end if;
  perform public.confirm_order('20000000-0000-4000-8000-000000000002');
  if (select stock from public.products where id = 'limao') <> 11 then raise exception 'Limão deveria baixar 3 (2 kits + 1 avulso)'; end if;
  if (select stock from public.products where id = 'cajamanga') <> 70 then raise exception 'Kit não baixou a cajamanga'; end if;
  if (select stock from public.products where id = 'morango') <> 178 then raise exception 'Kit não baixou o morango'; end if;
  perform public.confirm_order('20000000-0000-4000-8000-000000000001');
  if (select stock from public.products where id = 'morango') <> 168 then raise exception 'Pedido por quantidade não baixou o morango'; end if;
end $$;
reset role;

rollback;
select 'Kits, preço por quantidade, área de entrega, taxa, pedido mínimo e estoque somado verificados; transação revertida' as result;
