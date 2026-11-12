-- Testes transacionais de pedidos com cliente/entrega e do acompanhamento no painel. Tudo é revertido.
begin;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-b000-00000000000e', 'est2@teste.local', now()),
  ('00000000-0000-4000-b000-00000000000f', 'fora2@teste.local', now());
insert into public.admins (user_id, role, name, email) values
  ('00000000-0000-4000-b000-00000000000e', 'estoque', 'Est Pedidos', 'est2@teste.local');

-- Visitante faz pedidos
set local role anon;
do $$
begin
  insert into public.orders (id, items, total_in_cents, customer_name, customer_phone, fulfillment, postal_code, street, street_number, district, city)
    values ('10000000-0000-4000-8000-000000000001', '[{"id":"morango","quantity":2}]', 980, 'Ana Cliente', '34999990000', 'entrega', '38400000', 'Rua das Frutas', '10', 'Centro', 'Uberlândia');
  insert into public.orders (id, items, total_in_cents, customer_name, customer_phone, fulfillment)
    values ('10000000-0000-4000-8000-000000000002', '[{"id":"manga","quantity":1}]', 390, 'Bia', '3433334444', 'retirada');
  begin
    insert into public.orders (id, items, total_in_cents, customer_name, customer_phone, fulfillment)
      values (gen_random_uuid(), '[{"id":"manga","quantity":1}]', 390, 'Sem Endereço', '34999990000', 'entrega');
    raise exception 'Entrega sem endereço aceita';
  exception when check_violation then null; end;
  begin
    insert into public.orders (id, items, total_in_cents, customer_name, customer_phone, fulfillment)
      values (gen_random_uuid(), '[{"id":"manga","quantity":1}]', 390, 'Telefone Ruim', '123', 'retirada');
    raise exception 'Telefone inválido aceito';
  exception when check_violation then null; end;
  begin
    insert into public.orders (id, items, total_in_cents, fulfillment)
      values (gen_random_uuid(), '[{"id":"manga","quantity":1}]', 390, 'retirada');
    raise exception 'Pedido sem nome aceito';
  exception when check_violation then null; end;
  begin perform 1 from public.orders; raise exception 'Visitante lê pedidos';
  exception when insufficient_privilege then null; end;
  begin perform public.confirm_order('10000000-0000-4000-8000-000000000001'); raise exception 'Visitante confirma pedido';
  exception when insufficient_privilege then null; end;
  insert into public.event_requests (id, name, event_type, event_date, guests, location, customer_phone)
    values (gen_random_uuid(), 'Festa Teste', 'Aniversário', '2099-05-10', 'Até 50', 'Salão', '34999991111');
end $$;
reset role;

-- Conta fora da equipe não vê nada
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-00000000000f', true);
do $$
begin
  if (select count(*) from public.orders) <> 0 then raise exception 'Conta de fora lê pedidos'; end if;
  if (select count(*) from public.event_requests) <> 0 then raise exception 'Conta de fora lê orçamentos'; end if;
  begin perform public.confirm_order('10000000-0000-4000-8000-000000000001'); raise exception 'Conta de fora confirma pedido';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Equipe (função Estoque) acompanha e confirma
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-00000000000e', true);
do $$
declare v_rows integer;
begin
  if (select count(*) from public.orders) <> 2 then raise exception 'Equipe não vê os pedidos'; end if;
  if (select customer_name from public.orders where id = '10000000-0000-4000-8000-000000000001') <> 'Ana Cliente' then raise exception 'Cliente não gravado'; end if;
  if (select count(*) from public.event_requests where customer_phone = '34999991111') <> 1 then raise exception 'Telefone do orçamento não gravado'; end if;
  update public.event_requests set status = 'quoted' where customer_phone = '34999991111';

  update public.orders set status = 'contacted' where id = '10000000-0000-4000-8000-000000000002';
  begin
    update public.orders set status = 'confirmed' where id = '10000000-0000-4000-8000-000000000002';
    raise exception 'Pedido confirmado sem baixar estoque';
  exception when insufficient_privilege then null; end;

  perform public.confirm_order('10000000-0000-4000-8000-000000000001');
  if (select status from public.orders where id = '10000000-0000-4000-8000-000000000001') <> 'confirmed' then raise exception 'Pedido não confirmado'; end if;
  if (select stock from public.products where id = 'morango') <> 178 then raise exception 'Confirmação não baixou o estoque'; end if;
  if not exists (select 1 from public.stock_movements where reason = 'Venda' and note like 'Pedido 10000000 · Ana Cliente') then raise exception 'Movimentação do pedido sem referência'; end if;
  begin perform public.confirm_order('10000000-0000-4000-8000-000000000001'); raise exception 'Pedido confirmado duas vezes';
  exception when invalid_parameter_value then null; end;
  update public.orders set status = 'cancelled' where id = '10000000-0000-4000-8000-000000000001';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'Pedido confirmado foi alterado'; end if;

  update public.orders set status = 'cancelled' where id = '10000000-0000-4000-8000-000000000002';
  begin perform public.confirm_order('10000000-0000-4000-8000-000000000002'); raise exception 'Pedido cancelado confirmado';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

rollback;
select 'Pedidos com cliente e entrega, acompanhamento e confirmação com baixa de estoque verificados; transação revertida' as result;
