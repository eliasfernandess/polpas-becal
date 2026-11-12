-- Testes transacionais do painel (equipe, estoque, vendas, convites). Tudo é revertido no final.
-- Execute como postgres no SQL Editor, depois das migrações.
begin;

-- Contas fictícias: administrador, estoque, desconhecido, convidado confirmado e não confirmado.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-a000-00000000000a', 'adm@teste.local', now()),
  ('00000000-0000-4000-a000-00000000000e', 'est@teste.local', now()),
  ('00000000-0000-4000-a000-00000000000f', 'fora@teste.local', now()),
  ('00000000-0000-4000-a000-000000000001', 'convidada@teste.local', now()),
  ('00000000-0000-4000-a000-000000000002', 'semconfirmar@teste.local', null);
insert into public.admins (user_id, role, name, email) values
  ('00000000-0000-4000-a000-00000000000a', 'admin', 'Adm Teste', 'adm@teste.local'),
  ('00000000-0000-4000-a000-00000000000e', 'estoque', 'Est Teste', 'est@teste.local');

-- Visitante
set local role anon;
do $$
begin
  if (select count(*) from public.products) <> 10 then raise exception 'Visitante deveria ver os 10 sabores'; end if;
  if exists (select 1 from public.products where not available) then raise exception 'Visitante vê produto oculto'; end if;
  begin perform 1 from public.stock_movements; raise exception 'Visitante lê movimentações';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.admins; raise exception 'Visitante lê a equipe';
  exception when insufficient_privilege then null; end;
  begin perform public.adjust_stock('morango', 1, 'Produção', ''); raise exception 'Visitante movimenta estoque';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.orders (id, items, total_in_cents) values (gen_random_uuid(), '[{"id":"limao","quantity":15}]', 5250);
    raise exception 'Pedido acima do estoque aceito';
  exception when check_violation then null; end;
  insert into public.orders (id, items, total_in_cents) values (gen_random_uuid(), '[{"id":"limao","quantity":14}]', 4900);
end $$;
reset role;

-- Conta sem vínculo com a equipe
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000000f', true);
do $$
begin
  if public.my_role() is not null then raise exception 'Conta de fora tem função'; end if;
  if public.claim_invite() then raise exception 'Conta sem convite entrou na equipe'; end if;
  if (select count(*) from public.stock_movements) <> 0 then raise exception 'Conta de fora lê movimentações'; end if;
  if (select count(*) from public.admins) <> 0 then raise exception 'Conta de fora lê a equipe'; end if;
  begin perform public.adjust_stock('morango', 5, 'Produção', ''); raise exception 'Conta de fora movimenta estoque';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.products (id, name, description, image, price_in_cents, category, tone) values ('intrusa', 'Intrusa', '', '', 100, 'Clássicos', 'sage');
    raise exception 'Conta de fora cria produto';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Função Estoque
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000000e', true);
do $$
begin
  if public.my_role() <> 'estoque' then raise exception 'Função estoque não reconhecida'; end if;
  if public.adjust_stock('limao', 10, 'Reposição', 'lote teste') <> 24 then raise exception 'Saldo da reposição incorreto'; end if;
  perform public.record_sale('[{"id":"limao","quantity":4},{"id":"morango","quantity":1}]', 'pedido teste');
  if (select stock from public.products where id = 'limao') <> 20 then raise exception 'Venda não baixou o limão'; end if;
  if (select stock from public.products where id = 'morango') <> 179 then raise exception 'Venda não baixou o morango'; end if;
  begin
    perform public.record_sale('[{"id":"limao","quantity":1},{"id":"manga","quantity":999}]', '');
    raise exception 'Venda acima do estoque aceita';
  exception when check_violation then null; end;
  if (select stock from public.products where id = 'limao') <> 20 then raise exception 'Venda recusada baixou parte do estoque'; end if;
  if (select count(*) from public.stock_movements where actor = 'Est Teste') <> 3 then raise exception 'Movimentações sem autoria'; end if;
  update public.products set price_in_cents = 1 where id = 'morango';
  if (select price_in_cents from public.products where id = 'morango') = 1 then raise exception 'Estoque alterou preço'; end if;
  begin update public.products set stock = 0 where id = 'morango'; raise exception 'Estoque gravado sem movimentação';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.team_invites (email, name, role) values ('x@teste.local', 'X', 'admin');
    raise exception 'Estoque criou convite';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Administrador
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000000a', true);
do $$
declare v_rows integer;
begin
  if public.my_role() <> 'admin' then raise exception 'Administrador não reconhecido'; end if;
  insert into public.products (id, name, description, image, price_in_cents, category, tone, low_stock, sort_order)
    values ('goiaba', 'Goiaba', 'Teste', '', 550, 'Clássicos', 'red', 10, 10);
  if public.adjust_stock('goiaba', 30, 'Cadastro', 'Estoque inicial') <> 30 then raise exception 'Estoque inicial incorreto'; end if;
  update public.products set price_in_cents = 600, available = false where id = 'goiaba';
  if (select price_in_cents from public.products where id = 'goiaba') <> 600 then raise exception 'Administrador não alterou preço'; end if;
  begin
    update public.products set image = 'https://evil.test/foto.png' where id = 'goiaba';
    raise exception 'Imagem de host externo aceita';
  exception when check_violation then null; end;
  update public.products set image = 'https://abcd.supabase.co/storage/v1/object/public/product-images/goiaba-1.webp' where id = 'goiaba';
  if (select count(*) from public.admins) <> 2 then raise exception 'Administrador não vê a equipe'; end if;
  insert into public.team_invites (email, name, role) values ('convidada@teste.local', 'Convidada', 'estoque'), ('semconfirmar@teste.local', 'Sem confirmar', 'admin');
  update public.admins set role = 'admin' where user_id = '00000000-0000-4000-a000-00000000000e';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Administrador não alterou função'; end if;
  update public.admins set role = 'estoque' where user_id = '00000000-0000-4000-a000-00000000000a';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'Administrador rebaixou a si mesmo'; end if;
  delete from public.admins where user_id = '00000000-0000-4000-a000-00000000000a';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'Administrador removeu a si mesmo'; end if;
end $$;
reset role;

-- Visitante não vê o produto oculto pelo administrador
set local role anon;
do $$
begin
  if exists (select 1 from public.products where id = 'goiaba') then raise exception 'Produto oculto visível'; end if;
end $$;
reset role;

-- Convites
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true);
do $$
begin
  if public.claim_invite() then raise exception 'E-mail não confirmado entrou na equipe'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000001', true);
do $$
begin
  if not public.claim_invite() then raise exception 'Convite confirmado não aceito'; end if;
  if public.my_role() <> 'estoque' then raise exception 'Convite com função errada'; end if;
end $$;
reset role;

rollback;
select 'Equipe, funções, convites, estoque, vendas e restrições do painel verificados; transação revertida' as result;
