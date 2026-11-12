-- Preço por quantidade, kits, área de entrega com taxa por bairro e pedido mínimo.
-- Evolui 20261114120000_pedidos_clientes.sql sem apagar dados. Execute uma vez.

-- 1. Preço por quantidade no produto ----------------------------------------------------
-- bulk_min = 0: sem preço por quantidade. Ex.: bulk_min 10 + bulk_price 400 = "a partir de 10 un., R$ 4,00 cada".
alter table public.products
  add column bulk_min integer not null default 0 check (bulk_min = 0 or bulk_min between 2 and 999),
  add column bulk_price_in_cents integer not null default 0 check (bulk_price_in_cents between 0 and 1000000);
alter table public.products add constraint products_bulk_check
  check (bulk_min = 0 or (bulk_price_in_cents > 0 and bulk_price_in_cents < price_in_cents));
grant insert (bulk_min, bulk_price_in_cents), update (bulk_min, bulk_price_in_cents) on public.products to authenticated;

-- 2. Kits ------------------------------------------------------------------------------
-- items: [{"id": "morango", "quantity": 1}, ...]. Vender um kit baixa o estoque de cada sabor.
create table public.kits (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 55),
  name text not null check (char_length(name) between 2 and 60 and name !~ '[[:cntrl:]]'),
  description text not null default '' check (char_length(description) <= 240 and description !~ '[[:cntrl:]]'),
  image text not null default '' check (
    image = ''
    or image ~ '^/images/[a-zA-Z0-9/_.-]+[.](webp|png|jpg)$'
    or image ~ '^https://[a-z0-9-]+[.]supabase[.]co/storage/v1/object/public/product-images/[A-Za-z0-9._-]+$'
  ),
  price_in_cents integer not null check (price_in_cents between 1 and 1000000),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 20),
  available boolean not null default true,
  featured boolean not null default false,
  sort_order integer not null default 0 check (sort_order between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.kits enable row level security;
revoke all on public.kits from anon, authenticated;
grant select on public.kits to anon, authenticated;
grant insert, update, delete on public.kits to authenticated;
create policy kits_read_public on public.kits for select to anon using (available);
create policy kits_read_team on public.kits for select to authenticated using (available or (select public.is_staff()));
create policy kits_write on public.kits for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create trigger kits_touch before update on public.kits for each row execute function public.touch_updated_at();

create function private.validate_kit() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  entry jsonb;
  seen text[] := array[]::text[];
begin
  for entry in select value from jsonb_array_elements(new.items) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry -> 'id') <> 'string'
       or jsonb_typeof(entry -> 'quantity') <> 'number' or (entry ->> 'quantity') !~ '^[1-9][0-9]?$' then
      raise exception 'Item do kit inválido.' using errcode = '23514';
    end if;
    if entry ->> 'id' = any(seen) then raise exception 'Sabor repetido no kit.' using errcode = '23514'; end if;
    if not exists (select 1 from public.products where id = entry ->> 'id') then
      raise exception 'O kit tem um sabor que não existe.' using errcode = '23514';
    end if;
    seen := array_append(seen, entry ->> 'id');
  end loop;
  return new;
end $$;
revoke all on function private.validate_kit() from public, anon, authenticated;
create trigger validate_kit_before_write before insert or update on public.kits
  for each row execute function private.validate_kit();

-- 3. Área de entrega e regras da loja ------------------------------------------------------
create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  city text not null check (char_length(btrim(city)) between 2 and 60 and city !~ '[[:cntrl:]]'),
  district text not null check (char_length(btrim(district)) between 2 and 60 and district !~ '[[:cntrl:]]'),
  fee_cents integer not null default 0 check (fee_cents between 0 and 100000),
  available boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 100000),
  created_at timestamptz not null default now()
);
create unique index delivery_zones_unique on public.delivery_zones (lower(btrim(city)), lower(btrim(district)));
alter table public.delivery_zones enable row level security;
revoke all on public.delivery_zones from anon, authenticated;
grant select on public.delivery_zones to anon, authenticated;
grant insert (id, city, district, fee_cents, available, sort_order), update (city, district, fee_cents, available, sort_order), delete
  on public.delivery_zones to authenticated;
create policy zones_read_public on public.delivery_zones for select to anon using (available);
create policy zones_read_team on public.delivery_zones for select to authenticated using (available or (select public.is_staff()));
create policy zones_write on public.delivery_zones for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Uma linha só, com as regras de entrega e retirada.
create table public.store_settings (
  id boolean primary key default true check (id),
  delivery_enabled boolean not null default true,
  pickup_enabled boolean not null default true,
  min_order_cents integer not null default 0 check (min_order_cents between 0 and 1000000),
  updated_at timestamptz not null default now(),
  check (delivery_enabled or pickup_enabled)
);
insert into public.store_settings default values on conflict do nothing;
alter table public.store_settings enable row level security;
revoke all on public.store_settings from anon, authenticated;
grant select on public.store_settings to anon, authenticated;
grant update (delivery_enabled, pickup_enabled, min_order_cents) on public.store_settings to authenticated;
create policy settings_read on public.store_settings for select to anon, authenticated using (true);
create policy settings_write on public.store_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create trigger store_settings_touch before update on public.store_settings for each row execute function public.touch_updated_at();

-- 4. Taxa no pedido --------------------------------------------------------------------------
-- null = taxa a combinar (sem bairros cadastrados) ou retirada.
alter table public.orders add column delivery_fee_cents integer check (delivery_fee_cents is null or delivery_fee_cents between 0 and 100000);
grant insert (delivery_fee_cents) on public.orders to anon, authenticated;

-- 5. Validação do pedido: kits, preço por quantidade, estoque somado, entrega e mínimo ----------
create or replace function private.validate_order() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  entry jsonb;
  component jsonb;
  product public.products%rowtype;
  kit public.kits%rowtype;
  settings public.store_settings%rowtype;
  zone public.delivery_zones%rowtype;
  quantity integer;
  unit_price integer;
  total bigint := 0;
  snapshot jsonb := '[]'::jsonb;
  components jsonb;
  demand jsonb := '{}'::jsonb;
  seen text[] := array[]::text[];
  pid text;
  units integer;
begin
  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) not between 1 and 100 then
    raise exception 'Invalid order items' using errcode = '23514';
  end if;
  for entry in select value from jsonb_array_elements(new.items) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry -> 'id') <> 'string'
       or jsonb_typeof(entry -> 'quantity') <> 'number'
       or (entry ->> 'quantity') !~ '^[1-9][0-9]?$' then
      raise exception 'Invalid item or quantity' using errcode = '23514';
    end if;
    if entry ->> 'id' = any(seen) then raise exception 'Duplicate product' using errcode = '23514'; end if;
    seen := array_append(seen, entry ->> 'id');
    quantity := (entry ->> 'quantity')::integer;

    if entry ->> 'id' like 'kit:%' then
      select * into kit from public.kits where id = substr(entry ->> 'id', 5) and available;
      if not found then raise exception 'Product unavailable' using errcode = '23514'; end if;
      components := '[]'::jsonb;
      for component in select value from jsonb_array_elements(kit.items) loop
        select * into product from public.products where id = component ->> 'id';
        if not found then raise exception 'Product unavailable' using errcode = '23514'; end if;
        demand := jsonb_set(demand, array[product.id], to_jsonb(coalesce((demand ->> product.id)::integer, 0) + (component ->> 'quantity')::integer * quantity));
        components := components || jsonb_build_array(jsonb_build_object('id', product.id, 'name', product.name, 'quantity', (component ->> 'quantity')::integer));
      end loop;
      total := total + kit.price_in_cents::bigint * quantity;
      snapshot := snapshot || jsonb_build_array(jsonb_build_object(
        'id', entry ->> 'id', 'kind', 'kit', 'name', kit.name, 'unitLabel', 'kit',
        'priceInCents', kit.price_in_cents, 'quantity', quantity, 'components', components));
    else
      select * into product from public.products where id = entry ->> 'id' and available;
      if not found then raise exception 'Product unavailable' using errcode = '23514'; end if;
      unit_price := case when product.bulk_min > 0 and quantity >= product.bulk_min then product.bulk_price_in_cents else product.price_in_cents end;
      demand := jsonb_set(demand, array[product.id], to_jsonb(coalesce((demand ->> product.id)::integer, 0) + quantity));
      total := total + unit_price::bigint * quantity;
      snapshot := snapshot || jsonb_build_array(jsonb_build_object(
        'id', product.id, 'kind', 'product', 'name', product.name, 'unitLabel', product.unit_label,
        'priceInCents', unit_price, 'quantity', quantity));
    end if;
  end loop;

  -- Sabores avulsos e dentro de kits somam no mesmo estoque.
  for pid, units in select key, value::integer from jsonb_each_text(demand) loop
    if (select stock from public.products where id = pid) < units then
      raise exception 'Insufficient stock' using errcode = '23514';
    end if;
  end loop;

  if new.total_in_cents is distinct from total then
    raise exception 'Prices changed. Refresh the catalog.' using errcode = '23514';
  end if;

  select * into settings from public.store_settings where id;
  if new.fulfillment = 'entrega' then
    if found and not settings.delivery_enabled then raise exception 'Delivery unavailable' using errcode = '23514'; end if;
    if found and total < settings.min_order_cents then raise exception 'Below minimum order' using errcode = '23514'; end if;
    if exists (select 1 from public.delivery_zones where available) then
      select * into zone from public.delivery_zones
        where available and lower(btrim(city)) = lower(btrim(new.city)) and lower(btrim(district)) = lower(btrim(new.district));
      if not found then raise exception 'Outside delivery area' using errcode = '23514'; end if;
      if new.delivery_fee_cents is distinct from zone.fee_cents then raise exception 'Delivery fee changed. Refresh the page.' using errcode = '23514'; end if;
    elsif new.delivery_fee_cents is not null then
      raise exception 'Delivery fee not configured' using errcode = '23514';
    end if;
  elsif new.fulfillment = 'retirada' then
    if found and not settings.pickup_enabled then raise exception 'Pickup unavailable' using errcode = '23514'; end if;
    new.delivery_fee_cents := null;
  end if;

  new.items := snapshot;
  return new;
end;
$$;
revoke all on function private.validate_order() from public, anon, authenticated;

-- 6. Confirmar pedido: kits baixam cada sabor ------------------------------------------------
create or replace function public.confirm_order(p_order_id uuid) returns void
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
  with lines as (
    select value as item from jsonb_array_elements(v_order.items)
  ), expanded as (
    select item ->> 'id' as id, (item ->> 'quantity')::integer as units from lines
      where coalesce(item ->> 'kind', 'product') <> 'kit'
    union all
    select c ->> 'id', (c ->> 'quantity')::integer * (l.item ->> 'quantity')::integer
      from lines l cross join lateral jsonb_array_elements(l.item -> 'components') as c
      where l.item ->> 'kind' = 'kit'
  )
  select jsonb_agg(jsonb_build_object('id', id, 'quantity', units)) into v_items
    from (select id, sum(units)::integer as units from expanded group by id) as totals;
  perform public.record_sale(v_items,
    'Pedido ' || left(p_order_id::text, 8) || coalesce(' · ' || nullif(btrim(v_order.customer_name), ''), ''));
  update public.orders set status = 'confirmed', confirmed_at = now() where id = p_order_id;
end $$;
revoke all on function public.confirm_order(uuid) from public, anon;
grant execute on function public.confirm_order(uuid) to authenticated;

-- 7. Exemplo: kit oculto, para revisar o preço no painel e mostrar na loja ---------------------
insert into public.kits (id, name, description, price_in_cents, items, available, featured, sort_order)
select 'kit-semana', 'Kit semana', 'Sete sabores para variar o suco todo dia.', 2690,
  '[{"id":"morango","quantity":1},{"id":"maracuja","quantity":1},{"id":"manga","quantity":1},{"id":"abacaxi","quantity":1},{"id":"acerola","quantity":1},{"id":"limao","quantity":1},{"id":"cajamanga","quantity":1}]'::jsonb,
  false, true, 0
where (select count(*) from public.products where id in ('morango','maracuja','manga','abacaxi','acerola','limao','cajamanga')) = 7
on conflict (id) do nothing;
