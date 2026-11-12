-- Polpas Becal — catálogo, estoque, equipe e painel administrativo.
-- Execute no SQL Editor do projeto Supabase. Pode ser executado novamente com segurança
-- (inclusive para atualizar um banco criado com uma versão anterior deste arquivo).

-- 1. Equipe ---------------------------------------------------------------------
-- Quem está nesta tabela acessa o painel. Dois papéis:
--   admin   → produtos, preços, estoque e equipe
--   estoque → consulta e lança entradas, saídas e vendas
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins add column if not exists role text not null default 'admin';
alter table public.admins add column if not exists name text not null default '';
alter table public.admins add column if not exists email text not null default '';
alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins add constraint admins_role_check check (role in ('admin', 'estoque'));
alter table public.admins drop constraint if exists admins_name_check;
alter table public.admins add constraint admins_name_check check (char_length(name) <= 60);
update public.admins a set email = lower(u.email) from auth.users u where a.user_id = u.id and a.email = '';
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.admins where user_id = (select auth.uid()) and role = 'admin') $$;
create or replace function public.is_staff() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.admins where user_id = (select auth.uid())) $$;
create or replace function public.my_role() returns text
  language sql stable security definer set search_path = ''
  as $$ select role from public.admins where user_id = (select auth.uid()) $$;
revoke all on function public.is_admin(), public.is_staff(), public.my_role() from public;
grant execute on function public.is_admin(), public.is_staff() to anon, authenticated;
grant execute on function public.my_role() to authenticated;

drop policy if exists "admins leem o próprio registro" on public.admins;
drop policy if exists "equipe lê" on public.admins;
create policy "equipe lê" on public.admins
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
-- Um administrador não altera nem remove a si mesmo: evita ficar sem nenhum administrador por engano.
drop policy if exists "admins alteram a equipe" on public.admins;
create policy "admins alteram a equipe" on public.admins
  for update to authenticated
  using ((select public.is_admin()) and user_id <> (select auth.uid()))
  with check ((select public.is_admin()) and user_id <> (select auth.uid()));
drop policy if exists "admins removem da equipe" on public.admins;
create policy "admins removem da equipe" on public.admins
  for delete to authenticated using ((select public.is_admin()) and user_id <> (select auth.uid()));

-- Convites: o administrador autoriza um e-mail; a pessoa cria a própria conta (e a própria senha)
-- em /admin/ e entra na equipe quando o e-mail confirmado coincide com o convite.
create table if not exists public.team_invites (
  email text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 120),
  name text not null default '' check (char_length(name) <= 60),
  role text not null default 'estoque' check (role in ('admin', 'estoque')),
  invited_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.team_invites enable row level security;
drop policy if exists "admins gerenciam convites" on public.team_invites;
create policy "admins gerenciam convites" on public.team_invites
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Chamado pelo painel logo após o login. Só vale para e-mail confirmado.
create or replace function public.claim_invite() returns boolean
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

-- 2. Produtos ----------------------------------------------------------------
create table if not exists public.products (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 60),
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 240),
  image text not null default '' check (char_length(image) <= 2000),
  price_cents integer not null check (price_cents between 0 and 1000000),
  unit_label text not null default '100 g' check (char_length(unit_label) between 1 and 20),
  category text not null default 'Clássicos' check (char_length(category) between 2 and 30),
  tone text not null default 'sage' check (tone in ('pink', 'red', 'yellow', 'peach', 'lime', 'sage', 'purple', 'sand')),
  stock integer not null default 0 check (stock between 0 and 100000),
  low_stock integer not null default 20 check (low_stock between 0 and 100000),
  active boolean not null default true,
  featured boolean not null default false,
  sort integer not null default 0 check (sort between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.products enable row level security;

drop policy if exists "loja lê produtos ativos" on public.products;
create policy "loja lê produtos ativos" on public.products
  for select to anon, authenticated using (active or (select public.is_staff()));
drop policy if exists "admins criam produtos" on public.products;
create policy "admins criam produtos" on public.products
  for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "admins alteram produtos" on public.products;
create policy "admins alteram produtos" on public.products
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admins excluem produtos" on public.products;
create policy "admins excluem produtos" on public.products
  for delete to authenticated using ((select public.is_admin()));

create or replace function public.touch_updated_at() returns trigger
  language plpgsql set search_path = ''
  as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- 3. Movimentações de estoque --------------------------------------------------
create table if not exists public.stock_movements (
  id bigint generated always as identity primary key,
  product_id text not null,           -- sem FK: o histórico sobrevive à exclusão do produto
  product_name text not null,
  delta integer not null check (delta <> 0),
  stock_after integer not null check (stock_after >= 0),
  reason text not null check (char_length(reason) between 2 and 40),
  note text not null default '' check (char_length(note) <= 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.stock_movements add column if not exists actor text not null default '';
create index if not exists stock_movements_recent on public.stock_movements (created_at desc);
alter table public.stock_movements enable row level security;

drop policy if exists "admins leem movimentações" on public.stock_movements;
drop policy if exists "equipe lê movimentações" on public.stock_movements;
create policy "equipe lê movimentações" on public.stock_movements
  for select to authenticated using ((select public.is_staff()));
-- Não há política de escrita: movimentações só nascem pelas funções abaixo.
drop policy if exists "admins registram movimentações" on public.stock_movements;

-- Entrada/saída atômica: altera o saldo e registra a movimentação na mesma transação.
-- Roda com privilégios do dono para que o papel "estoque" movimente sem poder editar produtos;
-- por isso confere a equipe explicitamente.
create or replace function public.adjust_stock(p_product_id text, p_delta integer, p_reason text, p_note text default '')
  returns integer language plpgsql security definer set search_path = ''
  as $$
declare
  v_stock integer;
  v_name text;
  v_actor text;
begin
  select coalesce(nullif(name, ''), email) into v_actor from public.admins where user_id = (select auth.uid());
  if not found then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_delta = 0 then raise exception 'A quantidade não pode ser zero.'; end if;
  update public.products set stock = stock + p_delta where id = p_product_id
    returning stock, name into v_stock, v_name;
  if not found then raise exception 'Produto não encontrado.'; end if;
  insert into public.stock_movements (product_id, product_name, delta, stock_after, reason, note, actor)
    values (p_product_id, v_name, p_delta, v_stock, p_reason, coalesce(p_note, ''), v_actor);
  return v_stock;
end $$;
revoke all on function public.adjust_stock(text, integer, text, text) from public, anon;
grant execute on function public.adjust_stock(text, integer, text, text) to authenticated;

-- Venda com vários itens: ou baixa tudo, ou não baixa nada.
-- p_items: [{"id": "morango", "quantity": 2}, ...]
create or replace function public.record_sale(p_items jsonb, p_note text default '')
  returns void language plpgsql security definer set search_path = ''
  as $$
declare
  v_item jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Informe de 1 a 100 itens.';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item ->> 'quantity')::integer <= 0 then raise exception 'Quantidade inválida.'; end if;
    perform public.adjust_stock(v_item ->> 'id', -(v_item ->> 'quantity')::integer, 'Venda', p_note);
  end loop;
end $$;
revoke all on function public.record_sale(jsonb, text) from public, anon;
grant execute on function public.record_sale(jsonb, text) to authenticated;

-- 4. Fotos dos produtos --------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('product-images', 'product-images', true, 1048576, array['image/webp'])
  on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/webp'];

drop policy if exists "admins enviam fotos" on storage.objects;
create policy "admins enviam fotos" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and (select public.is_admin()));
drop policy if exists "admins removem fotos" on storage.objects;
create policy "admins removem fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and (select public.is_admin()));

-- 5. Catálogo inicial (demonstrativo) ------------------------------------------
insert into public.products (id, name, description, image, price_cents, category, tone, stock, featured, sort) values
  ('morango', 'Morango', 'Delicado, marcante e cheio de possibilidades. Vai bem do suco à sobremesa.', '/images/products/morango.webp', 490, 'Clássicos', 'pink', 180, true, 0),
  ('maracuja', 'Maracujá', 'Aquele toque tropical e azedinho que transforma qualquer receita.', '/images/products/maracuja.webp', 450, 'Cítricos', 'yellow', 240, true, 1),
  ('manga', 'Manga', 'Sabor macio e tropical para deixar o seu dia mais gostoso.', '/images/products/manga.webp', 390, 'Clássicos', 'peach', 150, true, 2),
  ('abacaxi', 'Abacaxi', 'Leveza e frescor em um clássico que combina com qualquer momento.', '/images/products/abacaxi.webp', 390, 'Cítricos', 'sand', 120, true, 3),
  ('acerola', 'Acerola', 'Intensa e azedinha, para um suco com personalidade.', '/images/products/acerola.webp', 390, 'Cítricos', 'red', 96, false, 4),
  ('limao', 'Limão', 'Um toque cítrico para refrescar e criar novas combinações.', '/images/products/limao.webp', 350, 'Cítricos', 'lime', 14, false, 5),
  ('abacaxi-hortela', 'Abacaxi com hortelã', 'Uma dupla refrescante para uma pausa no meio da rotina.', '/images/products/abacaxi-hortela.webp', 450, 'Combinações', 'sage', 60, false, 6),
  ('mix-frutas', 'Mix de frutas', 'Uma combinação tropical para variar o sabor do seu dia.', '/images/products/mix-frutas.webp', 490, 'Combinações', 'purple', 8, false, 7),
  ('cajamanga', 'Cajamanga', 'Um sabor tropical especial para quem gosta de descobrir.', '/images/products/cajamanga.webp', 450, 'Clássicos', 'yellow', 72, false, 8),
  ('tamarindo', 'Tamarindo', 'Sabor cheio de identidade, com um azedinho inconfundível.', '/images/products/tamarindo.webp', 450, 'Clássicos', 'sand', 0, false, 9)
on conflict (id) do nothing;

-- 6. Primeiro administrador ----------------------------------------------------
-- Crie o usuário em Authentication → Users → Add user (e-mail e senha) e depois execute,
-- trocando o e-mail e o nome:
--
--   insert into public.admins (user_id, email, name, role)
--   select id, lower(email), 'Seu nome', 'admin' from auth.users where email = 'voce@exemplo.com';
--
-- As demais pessoas são convidadas pelo painel (aba Equipe) e criam a própria conta em /admin/.
-- Mantenha "Confirm email" ligado em Authentication → Sign In / Providers: é a confirmação
-- do e-mail que garante que só o dono do endereço convidado entra na equipe.
