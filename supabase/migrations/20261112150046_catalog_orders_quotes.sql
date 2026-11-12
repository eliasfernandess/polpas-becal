-- Public catalog; guest submissions are write-only. No customer data is readable anonymously.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.products (
  id text primary key check (id ~ '^[a-z0-9-]{1,60}$'),
  name text not null check (char_length(name) between 1 and 80),
  description text not null check (char_length(description) <= 400),
  image text not null check (image ~ '^/images/[a-zA-Z0-9/_-]+[.](webp|png|jpg)$'),
  price_in_cents integer not null check (price_in_cents between 0 and 1000000),
  unit_label text not null default '100 g' check (char_length(unit_label) between 1 and 30),
  category text not null check (char_length(category) between 1 and 40),
  available boolean not null default true,
  featured boolean not null default false,
  tone text not null check (tone in ('pink','yellow','peach','sage','sand')),
  sort_order integer not null default 0
);
alter table public.products enable row level security;
revoke all on public.products from anon, authenticated;
grant select on public.products to anon, authenticated;
create policy catalog_read on public.products for select to anon, authenticated using (true);

create table public.orders (
  id uuid primary key,
  created_at timestamptz not null default now(),
  status text not null default 'pending_whatsapp' check (status in ('pending_whatsapp','contacted','confirmed','cancelled')),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100),
  total_in_cents bigint not null check (total_in_cents between 0 and 9900000000)
);
create index orders_created_at_idx on public.orders (created_at desc);
alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;
grant insert (id, items, total_in_cents) on public.orders to anon, authenticated;
create policy guest_order_insert on public.orders for insert to anon, authenticated with check (status = 'pending_whatsapp');

-- Runs with the caller's permissions and reads only the publicly readable catalog.
-- Prices, product snapshots and quantities are verified inside the same transaction.
create function private.validate_order() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  entry jsonb;
  product public.products%rowtype;
  quantity integer;
  total bigint := 0;
  snapshot jsonb := '[]'::jsonb;
  seen text[] := array[]::text[];
begin
  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) not between 1 and 100 then
    raise exception 'Invalid order items' using errcode = '23514';
  end if;
  for entry in select value from jsonb_array_elements(new.items) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry->'id') <> 'string'
       or jsonb_typeof(entry->'quantity') <> 'number'
       or not (entry ? 'id' and entry ? 'quantity')
       or (entry->>'quantity') !~ '^[1-9][0-9]?$' then
      raise exception 'Invalid item or quantity' using errcode = '23514';
    end if;
    if entry->>'id' = any(seen) then raise exception 'Duplicate product' using errcode = '23514'; end if;
    select * into product from public.products where id = entry->>'id' and available;
    if not found then raise exception 'Product unavailable' using errcode = '23514'; end if;
    quantity := (entry->>'quantity')::integer;
    total := total + product.price_in_cents::bigint * quantity;
    snapshot := snapshot || jsonb_build_array(jsonb_build_object(
      'id', product.id, 'name', product.name, 'unitLabel', product.unit_label,
      'priceInCents', product.price_in_cents, 'quantity', quantity));
    seen := array_append(seen, product.id);
  end loop;
  if new.total_in_cents is distinct from total then
    raise exception 'Prices changed. Refresh the catalog.' using errcode = '23514';
  end if;
  new.items := snapshot;
  return new;
end;
$$;
revoke all on function private.validate_order() from public, anon, authenticated;
create trigger validate_order_before_insert before insert on public.orders for each row execute function private.validate_order();

create table public.event_requests (
  id uuid primary key,
  created_at timestamptz not null default now(),
  status text not null default 'pending_whatsapp' check (status in ('pending_whatsapp','contacted','quoted','confirmed','cancelled')),
  name text not null check (char_length(btrim(name)) between 2 and 80 and name !~ '[[:cntrl:]]'),
  event_type text not null check (event_type in ('Aniversário','Casamento','Evento corporativo','Formatura','Outros')),
  event_date date not null check (event_date >= (now() at time zone 'America/Sao_Paulo')::date and event_date < date '2101-01-01'),
  guests text not null check (guests in ('Até 50','De 51 a 100','De 101 a 200','Acima de 200')),
  location text not null check (char_length(btrim(location)) between 3 and 160 and location !~ '[[:cntrl:]]'),
  event_time time,
  duration text not null default '' check (duration in ('','Até 2 horas','De 2 a 4 horas','Mais de 4 horas','A combinar')),
  notes text not null default '' check (char_length(notes) <= 600)
);
create index event_requests_created_at_idx on public.event_requests (created_at desc);
alter table public.event_requests enable row level security;
revoke all on public.event_requests from anon, authenticated;
grant insert (id, name, event_type, event_date, guests, location, event_time, duration, notes) on public.event_requests to anon, authenticated;
create policy guest_event_insert on public.event_requests for insert to anon, authenticated with check (status = 'pending_whatsapp');

-- Initial catalog values remain demonstrative, as in the original site.
insert into public.products (id,name,description,image,price_in_cents,unit_label,category,available,featured,tone,sort_order) values
('morango','Morango','Delicado, marcante e cheio de possibilidades. Vai bem do suco à sobremesa.','/images/products/morango.webp',490,'100 g','Clássicos',true,true,'pink',0),
('maracuja','Maracujá','Aquele toque tropical e azedinho que transforma qualquer receita.','/images/products/maracuja.webp',450,'100 g','Cítricos',true,true,'yellow',1),
('manga','Manga','Sabor macio e tropical para deixar o seu dia mais gostoso.','/images/products/manga.webp',390,'100 g','Clássicos',true,true,'peach',2),
('abacaxi','Abacaxi','Leveza e frescor em um clássico que combina com qualquer momento.','/images/products/abacaxi.webp',390,'100 g','Cítricos',true,true,'sage',3),
('acerola','Acerola','Intensa e azedinha, para um suco com personalidade.','/images/products/acerola.webp',390,'100 g','Cítricos',true,false,'pink',4),
('limao','Limão','Um toque cítrico para refrescar e criar novas combinações.','/images/products/limao.webp',350,'100 g','Cítricos',true,false,'sage',5),
('abacaxi-hortela','Abacaxi com hortelã','Uma dupla refrescante para uma pausa no meio da rotina.','/images/products/abacaxi-hortela.webp',450,'100 g','Combinações',true,false,'sage',6),
('mix-frutas','Mix de frutas','Uma combinação tropical para variar o sabor do seu dia.','/images/products/mix-frutas.webp',490,'100 g','Combinações',true,false,'peach',7),
('cajamanga','Cajamanga','Um sabor tropical especial para quem gosta de descobrir.','/images/products/cajamanga.webp',450,'100 g','Clássicos',true,false,'yellow',8),
('tamarindo','Tamarindo','Sabor cheio de identidade, com um azedinho inconfundível.','/images/products/tamarindo.webp',450,'100 g','Clássicos',false,false,'sand',9);
