-- Painel administrativo: estoque, movimentações, vendas, equipe e fotos dos produtos.
-- Evolui o banco de 20261112150046_catalog_orders_quotes.sql sem recriar tabelas nem apagar dados.
--
-- Convenção mantida da primeira migração: em public.products, `available` é a visibilidade
-- na loja. Agora a loja também exige estoque (`stock`) para vender.

-- 1. Equipe ------------------------------------------------------------------------
-- admin   → produtos, preços, fotos, estoque, vendas e equipe
-- estoque → consulta o painel e lança entradas, saídas, contagens e vendas
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'estoque' check (role in ('admin', 'estoque')),
  name text not null default '' check (char_length(name) <= 60),
  email text not null default '' check (char_length(email) <= 120),
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
grant select, update (role, name), delete on public.admins to authenticated;

-- Funções auxiliares das políticas. Ficam em public porque as políticas de usuários
-- autenticados as chamam; só respondem sobre quem está chamando.
create function public.is_admin() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.admins where user_id = (select auth.uid()) and role = 'admin') $$;
create function public.is_staff() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.admins where user_id = (select auth.uid())) $$;
create function public.my_role() returns text
  language sql stable security definer set search_path = ''
  as $$ select role from public.admins where user_id = (select auth.uid()) $$;
revoke all on function public.is_admin(), public.is_staff(), public.my_role() from public, anon;
grant execute on function public.is_admin(), public.is_staff(), public.my_role() to authenticated;

create policy team_read on public.admins
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
-- Um administrador não altera nem remove a si mesmo: a loja nunca fica sem administrador por engano.
create policy team_update on public.admins
  for update to authenticated
  using ((select public.is_admin()) and user_id <> (select auth.uid()))
  with check ((select public.is_admin()) and user_id <> (select auth.uid()));
create policy team_delete on public.admins
  for delete to authenticated using ((select public.is_admin()) and user_id <> (select auth.uid()));

-- Convites: o administrador autoriza um e-mail; a pessoa cria a própria conta em /admin/ e
-- entra na equipe quando o e-mail confirmado coincide com o convite.
create table public.team_invites (
  email text primary key check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' and char_length(email) <= 120),
  name text not null default '' check (char_length(name) <= 60),
  role text not null default 'estoque' check (role in ('admin', 'estoque')),
  invited_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.team_invites enable row level security;
revoke all on public.team_invites from anon, authenticated;
grant select, insert (email, name, role), delete on public.team_invites to authenticated;
create policy invites_admin on public.team_invites
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Chamado pelo painel logo após o login. Só vale para e-mail confirmado.
create function public.claim_invite() returns boolean
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_email text;
  v_invite public.team_invites%rowtype;
begin
  select lower(email) into v_email from auth.users
    where id = (select auth.uid()) and email_confirmed_at is not null;
  if v_email is null then return false; end if;
  select * into v_invite from public.team_invites where email = v_email;
  if not found then return false; end if;
  insert into public.admins (user_id, role, name, email)
    values ((select auth.uid()), v_invite.role, v_invite.name, v_email)
    on conflict (user_id) do nothing;
  delete from public.team_invites where email = v_email;
  return true;
end $$;
revoke all on function public.claim_invite() from public, anon;
grant execute on function public.claim_invite() to authenticated;

-- 2. Produtos: estoque, fotos do painel e escrita pela administração --------------------
alter table public.products
  add column stock integer not null default 0 check (stock between 0 and 100000),
  add column low_stock integer not null default 20 check (low_stock between 0 and 100000),
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

-- Fotos enviadas pelo painel ficam no bucket público product-images. Sem foto: ''.
alter table public.products drop constraint if exists products_image_check;
alter table public.products add constraint products_image_check check (
  image = ''
  or image ~ '^/images/[a-zA-Z0-9/_.-]+[.](webp|png|jpg)$'
  or image ~ '^https://[a-z0-9-]+[.]supabase[.]co/storage/v1/object/public/product-images/[A-Za-z0-9._-]+$'
);
alter table public.products drop constraint if exists products_tone_check;
alter table public.products add constraint products_tone_check
  check (tone in ('pink', 'red', 'yellow', 'peach', 'lime', 'sage', 'purple', 'sand'));
alter table public.products add constraint products_sort_order_check check (sort_order between 0 and 100000);

create function public.touch_updated_at() returns trigger
  language plpgsql set search_path = ''
  as $$ begin new.updated_at := now(); return new; end $$;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- Visitantes veem só o que está à venda; a equipe vê também os ocultos.
drop policy if exists catalog_read on public.products;
create policy catalog_read_public on public.products for select to anon using (available);
create policy catalog_read_team on public.products for select to authenticated using (available or (select public.is_staff()));
create policy catalog_insert on public.products for insert to authenticated with check ((select public.is_admin()));
create policy catalog_update on public.products for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy catalog_delete on public.products for delete to authenticated using ((select public.is_admin()));
-- O estoque não entra aqui: só muda por adjust_stock, que registra cada movimentação.
grant insert (id, name, description, image, price_in_cents, unit_label, category, available, featured, tone, sort_order, low_stock)
  on public.products to authenticated;
grant update (name, description, image, price_in_cents, unit_label, category, available, featured, tone, sort_order, low_stock)
  on public.products to authenticated;
grant delete on public.products to authenticated;

-- Estoque inicial demonstrativo, aplicado uma única vez sobre o catálogo original.
-- As quantidades reais devem ser lançadas no painel (aba Produtos → Movimentar → Contagem).
update public.products p set stock = v.stock, tone = v.tone, available = true
from (values
  ('morango', 180, 'pink'), ('maracuja', 240, 'yellow'), ('manga', 150, 'peach'), ('abacaxi', 120, 'sand'),
  ('acerola', 96, 'red'), ('limao', 14, 'lime'), ('abacaxi-hortela', 60, 'sage'), ('mix-frutas', 8, 'purple'),
  ('cajamanga', 72, 'yellow'), ('tamarindo', 0, 'sand')
) as v (id, stock, tone)
where p.id = v.id;

-- 3. Movimentações de estoque ------------------------------------------------------------
create table public.stock_movements (
  id bigint generated always as identity primary key,
  product_id text not null,           -- sem FK: o histórico sobrevive à exclusão do produto
  product_name text not null,
  delta integer not null check (delta <> 0),
  stock_after integer not null check (stock_after >= 0),
  reason text not null check (char_length(reason) between 2 and 40),
  note text not null default '' check (char_length(note) <= 200),
  actor text not null default '' check (char_length(actor) <= 120),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index stock_movements_recent on public.stock_movements (created_at desc);
alter table public.stock_movements enable row level security;
revoke all on public.stock_movements from anon, authenticated;
grant select on public.stock_movements to authenticated;
create policy movements_read on public.stock_movements for select to authenticated using ((select public.is_staff()));
-- Sem política de escrita: movimentações só nascem pelas funções abaixo.

-- Entrada/saída atômica: altera o saldo e registra a movimentação na mesma transação.
-- Roda com privilégios do dono para que o papel "estoque" movimente sem poder editar
-- produtos; por isso confere a equipe explicitamente.
create function public.adjust_stock(p_product_id text, p_delta integer, p_reason text, p_note text default '')
  returns integer language plpgsql security definer set search_path = ''
  as $$
declare
  v_stock integer;
  v_name text;
  v_actor text;
begin
  select coalesce(nullif(name, ''), email) into v_actor from public.admins where user_id = (select auth.uid());
  if not found then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'A quantidade não pode ser zero.' using errcode = '22023'; end if;
  update public.products set stock = stock + p_delta where id = p_product_id
    returning stock, name into v_stock, v_name;
  if not found then raise exception 'Produto não encontrado.' using errcode = 'P0002'; end if;
  insert into public.stock_movements (product_id, product_name, delta, stock_after, reason, note, actor)
    values (p_product_id, v_name, p_delta, v_stock, p_reason, coalesce(p_note, ''), v_actor);
  return v_stock;
end $$;
revoke all on function public.adjust_stock(text, integer, text, text) from public, anon;
grant execute on function public.adjust_stock(text, integer, text, text) to authenticated;

-- Venda com vários itens: ou baixa tudo, ou não baixa nada.
-- p_items: [{"id": "morango", "quantity": 2}, ...]
create function public.record_sale(p_items jsonb, p_note text default '')
  returns void language plpgsql security definer set search_path = ''
  as $$
declare
  v_item jsonb;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Informe de 1 a 100 itens.' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item -> 'quantity') is distinct from 'number' or (v_item ->> 'quantity') !~ '^[1-9][0-9]{0,5}$' then
      raise exception 'Quantidade inválida.' using errcode = '22023';
    end if;
    perform public.adjust_stock(v_item ->> 'id', -(v_item ->> 'quantity')::integer, 'Venda', p_note);
  end loop;
end $$;
revoke all on function public.record_sale(jsonb, text) from public, anon;
grant execute on function public.record_sale(jsonb, text) to authenticated;

-- 4. Pedidos do site respeitam o estoque ----------------------------------------------------
-- Mesma validação da primeira migração, agora recusando quantidade acima do estoque.
-- O pedido continua sendo só uma intenção: quem baixa o estoque é a venda registrada no painel.
create or replace function private.validate_order() returns trigger
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
    quantity := (entry->>'quantity')::integer;
    select * into product from public.products where id = entry->>'id' and available;
    if not found then raise exception 'Product unavailable' using errcode = '23514'; end if;
    if product.stock < quantity then raise exception 'Insufficient stock' using errcode = '23514'; end if;
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

-- 5. Fotos dos produtos ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('product-images', 'product-images', true, 1048576, array['image/webp'])
  on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/webp'];
create policy product_images_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy product_images_delete on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and (select public.is_admin()));

-- 6. Primeiro administrador ----------------------------------------------------------------
-- Crie o usuário em Authentication → Users → Add user (e-mail e senha) e execute no SQL Editor,
-- trocando e-mail e nome:
--
--   insert into public.admins (user_id, email, name, role)
--   select id, lower(email), 'Seu nome', 'admin' from auth.users where email = 'voce@exemplo.com';
--
-- As demais pessoas são convidadas pelo painel (aba Equipe) e criam a própria conta em /admin/.
-- Mantenha "Confirm email" ligado em Authentication → Sign In / Providers.
