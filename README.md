# Polpas Becal

Vitrine Next.js 16 / React 19 com catálogo, pedidos e orçamentos no Supabase, painel de estoque em `/admin/` e hospedagem estática na Vercel. No celular, o catálogo mostra dois produtos por linha.

## Executar

Node.js 24 e npm. Execute `npm ci`, copie `.env.example` para `.env.local` e configure a URL do projeto e a chave **publishable** do Supabase. Nunca use `service_role` ou `sb_secret` no navegador. Depois, `npm run dev` ou `npm run build` seguido de `npm run preview`.

Sem as duas variáveis do Supabase, tudo roda em **modo demonstração**: a loja usa `src/data/products.ts`, os pedidos vão direto para o WhatsApp sem gravar nada e o painel abre sem login, guardando as alterações só naquele navegador. Deploys na Vercel exigem as variáveis e falham se elas faltarem. Com Supabase configurado, uma falha de conexão mostra erro: a loja nunca volta silenciosamente aos preços demonstrativos.

## Integração

- Vercel: projeto `polpas-becal`, conectado a `eliasfernandess/polpas-becal`; Node 24; build `npm run build`.
- Supabase: projeto `polpas-becal` (`zcxojunqupnpujhhplnb`), região São Paulo (`sa-east-1`).
- Variáveis públicas: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`.
- Migrações versionadas em `supabase/migrations/`, aplicadas em ordem:
  1. `20261112150046_catalog_orders_quotes.sql`: catálogo, pedidos e orçamentos.
  2. `20261113120000_painel_estoque_equipe.sql`: estoque, movimentações, vendas, equipe, convites e fotos. Acrescenta colunas e permissões **sem recriar tabelas nem apagar dados**, e lança um estoque inicial nos dez sabores.
  3. `20261114120000_pedidos_clientes.sql`: nome, telefone e entrega/retirada nos pedidos, telefone nos orçamentos, leitura de pedidos e orçamentos pela equipe e `confirm_order` (confirma e baixa o estoque).
- Para aplicar: `npx supabase link --project-ref zcxojunqupnpujhhplnb` (uma vez) e `npx supabase db push`. Sem a CLI, cole cada arquivo no SQL Editor e marque-o como aplicado depois (`npx supabase migration repair --status applied <versão>`). Enquanto a migração 2 faltar, a loja vende sem limite de estoque; enquanto a 3 faltar, os pedidos são registrados sem os dados do cliente (que seguem na mensagem do WhatsApp) e o painel avisa que falta a migração.
- `products`: visitantes leem só o que está à venda (`available`); a equipe vê também os ocultos. Só administradores criam e editam produtos. O estoque (`stock`) não pode ser gravado diretamente: só muda pelas funções `adjust_stock` e `record_sale`, que registram cada movimentação.
- `orders`: visitantes podem inserir apenas ID aleatório, itens e total estimado. Um trigger verifica disponibilidade, **estoque** e quantidades, recalcula o total e grava um retrato dos produtos e preços. O cliente não pode ler, alterar ou excluir pedidos, nem definir o status. Um pedido é só uma intenção: quem baixa o estoque é a venda registrada no painel.
- `event_requests`: visitantes podem inserir somente os campos do orçamento. O banco verifica campos obrigatórios, limites, opções e data.
- O estado inicial de pedidos e orçamentos é `pending_whatsapp`. A equipe acompanha os registros no Table Editor do Supabase e atualiza o status após o contato. Não há confirmação automática de compra, pagamento ou reserva.
- Repetir uma tentativa de envio na mesma página reutiliza o UUID, evitando duplicação caso a resposta se perca. Ao alterar os dados, uma nova solicitação é criada.

## Painel administrativo (/admin/)

Menu lateral com seis seções (no celular, vira uma gaveta):

- **Início:** pedidos e orçamentos novos, sabores para repor e o resumo dos últimos 30 dias.
- **Pedidos:** cada pedido do site com cliente, telefone (abre o WhatsApp), itens, total e entrega ou retirada. Marque como *em contato*, *cancelado* ou **Confirmar pedido**, que baixa o estoque de todos os itens de uma vez. Novos pedidos aparecem sozinhos a cada minuto.
- **Orçamentos:** pedidos de orçamento da foodbike, com situação (novo, em contato, orçado, confirmado, cancelado).
- **Produtos:** cadastro com foto, preço, categoria, cor, destaque e alerta de estoque baixo; ocultar, excluir, movimentar (entrada, saída, contagem) e exportar CSV.
- **Movimentações:** histórico com busca, filtros, autoria e exportação CSV.
- **Equipe** (só administradores): contas, funções e convites.

**Registrar venda** baixa vários sabores de uma vez, para vendas que não vieram pelo site.

## Checkout

O carrinho tem etapas: sacola → seus dados (nome e telefone) → entrega ou retirada → endereço (só na entrega: CEP, rua, número, complemento, bairro, cidade) → confirmar. Telefone e CEP são formatados ao digitar, os campos usam o preenchimento automático do navegador e cada etapa valida só os próprios campos. Com Supabase, **Registrar pedido** grava o pedido e abre o WhatsApp com a referência; sem Supabase, vai direto para o WhatsApp. Os dados do cliente ficam só na memória da página.

### Contas e funções

| Função | Pode |
| --- | --- |
| Administrador | Tudo: produtos, preços, fotos, estoque, vendas e equipe |
| Estoque | Consultar o painel e lançar entradas, saídas, contagens e vendas |

Primeiro administrador: crie o usuário em **Authentication → Users → Add user** e execute no SQL Editor, trocando e-mail e nome:

```sql
insert into public.admins (user_id, email, name, role)
select id, lower(email), 'Seu nome', 'admin' from auth.users where email = 'voce@exemplo.com';
```

Os demais entram por convite: o administrador abre **Equipe → Convidar pessoa** com nome, e-mail e função. O painel **não envia e-mail**: avise a pessoa para abrir `/admin/`, escolher “Recebi um convite” e criar a própria senha com o mesmo e-mail. Ela entra na equipe ao confirmar o e-mail e fazer login. Mantenha o cadastro por e-mail habilitado e **Confirm email** ligado (Authentication → Sign In / Providers), e inclua `https://<domínio>/admin/` nas URLs de redirecionamento (Authentication → URL Configuration). Contas criadas sem convite não acessam nada. Um administrador não altera nem remove a própria conta.

## Verificar

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Os testes SQL (`supabase/tests/`) cobrem loja, painel e pedidos. Os testes E2E usam Chrome e se adaptam ao build: sem Supabase, cobrem o modo demonstração e o painel; com Supabase, interceptam todas as chamadas ao banco (nenhum pedido fictício é criado) e cobrem registro, falhas, retentativa e banco sem a migração de estoque. Testes SQL transacionais fazem rollback: `access.sql` (loja), `painel.sql` (equipe, funções, convites, estoque e vendas) e `pedidos.sql` (cliente, entrega e confirmação de pedidos).

## Hospedagem e segurança

O build exporta `out/` e calcula hashes CSP dos scripts inline. A CSP permite conexão e imagens somente da própria origem e do projeto Supabase configurado. Na Vercel, o Build Output API publica arquivos e cabeçalhos gerados **no mesmo build**, evitando hashes antigos. `out/_headers` e `out/.security-headers.json` atendem outras hospedagens e o preview local.

RLS está habilitado em todas as tabelas públicas. A chave publishable identifica o projeto, não um usuário; as permissões do banco são a fronteira de acesso. Os endpoints de envio são públicos, como os formulários: para tráfego público intenso, monitore abuso e acrescente proteção contra automação conforme a operação exigir.

Os textos de demonstração foram retirados da loja. O site ainda está com `noindex/nofollow` (não aparece no Google): para liberar a indexação, ajuste `src/app/robots.ts`, `metadata.robots` em `src/app/layout.tsx` e o cabeçalho `X-Robots-Tag` em `scripts/secure-export.mjs`.

## Onde editar

- Layout e responsividade: `src/app/globals.css` (loja) e `src/app/admin/admin.css` (painel).
- Catálogo, preços e estoque em produção: painel `/admin/` (tabela `public.products`).
- Telefone, Instagram e origem: `src/data/business.ts`.
- Validações do formulário: `src/lib/validation.ts`; limites também estão nas migrações.
- Conexão e gravações: `src/lib/supabase.ts`, `src/lib/submissions.ts`, `src/lib/catalog.ts` e `src/lib/admin-repo.ts`.
- Estado do catálogo e do carrinho: `src/store/`.

## Informações comerciais pendentes

Antes de lançamento público, confirmar com a empresa:

1. Telefone **+55 34 99649-3471** (informado no briefing; há outros números nas artes fornecidas).
2. Perfil **@polpasbecal** e autorização para uso do nome, logotipo e fotografias.
3. Sabores efetivamente vendidos, composição e alegação “100% fruta / natural”.
4. Preço oficial, peso comercial e estoque de cada item: os valores iniciais vieram do catálogo de exemplo e devem ser conferidos no painel (Produtos → Editar e Movimentar → Contagem).
5. Área de atendimento, entrega, retirada, pedido mínimo e condições de venda.
6. Existência, aparência e estrutura da foodbike, cidades atendidas, equipe, duração e condições de contratação. A foto da foodbike foi fornecida para a apresentação e não substitui a confirmação da estrutura disponível.
7. Razão social, CNPJ, endereço e responsável pelo tratamento, sem inventar esses dados.
8. Canal oficial de privacidade, bases legais e rotinas de retenção/atendimento no WhatsApp, com revisão jurídica dos documentos.
9. Hospedagem definitiva e domínio antes de atualizar metadados e permitir indexação.

O protótipo não possui depoimentos, números de clientes, promessas de entrega ou pacotes inventados.

## Privacidade

Pedidos e orçamentos são registrados para atendimento antes da continuação no WhatsApp. A empresa deverá definir retenção, canal de atendimento dos direitos dos titulares e práticas de exclusão. As páginas de privacidade e termos descrevem esse fluxo. Não existem pagamentos, pixels de marketing ou autenticação de clientes; as contas do painel são só da equipe. Fotografias e fontes permanecem locais, exceto fotos novas enviadas pelo painel, que ficam no Storage do Supabase.
