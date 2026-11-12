-- Pedidos com nome, telefone e entrega; pedidos e orçamentos no painel.
-- Evolui 20261113120000_painel_estoque_equipe.sql sem apagar dados. Pedidos e orçamentos
-- antigos ficam como "nao_informado" / telefone vazio.

-- 1. Cliente e entrega no pedido -------------------------------------------------------
alter table public.orders
  add column customer_name text not null default '' check (char_length(customer_name) <= 80 and customer_name !~ '[[:cntrl:]]'),
  add column customer_phone text not null default '' check (customer_phone ~ '^([1-9][1-9][0-9]{8,9})?$'),
  add column fulfillment text not null default 'nao_informado' check (fulfillment in ('nao_informado', 'entrega', 'retirada')),
  add column postal_code text not null default '' check (postal_code ~ '^([0-9]{8})?$'),
  add column street text not null default '' check (char_length(street) <= 120 and street !~ '[[:cntrl:]]'),
  add column street_number text not null default '' check (char_length(street_number) <= 12 and street_number !~ '[[:cntrl:]]'),
  add column complement text not null default '' check (char_length(complement) <= 60 and complement !~ '[[:cntrl:]]'),
  add column district text not null default '' check (char_length(district) <= 60 and district !~ '[[:cntrl:]]'),
  add column city text not null default '' check (char_length(city) <= 60 and city !~ '[[:cntrl:]]'),
  add column confirmed_at timestamptz,
  add column updated_at timestamptz not null default now();

-- Pedido novo exige nome e telefone; entrega exige endereço completo.
alter table public.orders add constraint orders_customer_check check (
  fulfillment = 'nao_informado'
  or (char_length(btrim(customer_name)) >= 2 and customer_phone <> '')
);
alter table public.orders add constraint orders_address_check check (
  fulfillment <> 'entrega'
  or (postal_code <> '' and char_length(btrim(street)) >= 3 and btrim(street_number) <> ''
      and char_length(btrim(district)) >= 2 and char_length(btrim(city)) >= 2)
);
grant insert (customer_name, customer_phone, fulfillment, postal_code, street, street_number, complement, district, city)
  on public.orders to anon, authenticated;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- 2. Telefone no orçamento da foodbike ----------------------------------------------------
alter table public.event_requests
  add column customer_phone text not null default '' check (customer_phone ~ '^([1-9][1-9][0-9]{8,9})?$'),
  add column updated_at timestamptz not null default now();
grant insert (customer_phone) on public.event_requests to anon, authenticated;
create trigger event_requests_touch before update on public.event_requests
  for each row execute function public.touch_updated_at();

-- 3. A equipe acompanha pedidos e orçamentos ------------------------------------------------
grant select on public.orders, public.event_requests to authenticated;
grant update (status) on public.orders, public.event_requests to authenticated;

create policy orders_team_read on public.orders
  for select to authenticated using ((select public.is_staff()));
-- "Confirmado" só por confirm_order, que baixa o estoque; pedido confirmado não volta atrás.
create policy orders_team_update on public.orders
  for update to authenticated
  using ((select public.is_staff()) and status <> 'confirmed')
  with check ((select public.is_staff()) and status <> 'confirmed');

create policy event_requests_team_read on public.event_requests
  for select to authenticated using ((select public.is_staff()));
create policy event_requests_team_update on public.event_requests
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));

-- Confirma o pedido e baixa do estoque todos os itens de uma vez (ou nenhum).
create function public.confirm_order(p_order_id uuid) returns void
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_order public.orders%rowtype;
  v_items jsonb;
begin
  if not public.is_staff() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  if v_order.status = 'confirmed' then raise exception 'Este pedido já foi confirmado.' using errcode = '22023'; end if;
  if v_order.status = 'cancelled' then raise exception 'Este pedido foi cancelado.' using errcode = '22023'; end if;
  select jsonb_agg(jsonb_build_object('id', item ->> 'id', 'quantity', (item ->> 'quantity')::integer))
    into v_items from jsonb_array_elements(v_order.items) as item;
  perform public.record_sale(v_items,
    'Pedido ' || left(p_order_id::text, 8) || coalesce(' · ' || nullif(btrim(v_order.customer_name), ''), ''));
  update public.orders set status = 'confirmed', confirmed_at = now() where id = p_order_id;
end $$;
revoke all on function public.confirm_order(uuid) from public, anon;
grant execute on function public.confirm_order(uuid) to authenticated;
