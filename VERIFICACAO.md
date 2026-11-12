# Verificação da integração — 12/11/2026

- Build estático, lint e TypeScript aprovados.
- 64 testes unitários aprovados.
- 12 cenários E2E aprovados em desktop e mobile (8 fluxos principais e 4 verificações de falha/repetição).
- Fluxo real navegador → Supabase → confirmação em tela verificado com um pedido e um orçamento sintéticos; nenhuma mensagem foi enviada ao WhatsApp.
- API pública retorna dez produtos; leitura de pedidos/orçamentos é negada. Total adulterado é recusado.
- `supabase/tests/access.sql` validou em transação: catálogo, inserções, preço, indisponibilidade, status protegido, duplicação de UUID, proibição de leitura/escrita e data de evento. A transação foi revertida.
- RLS habilitado nas três tabelas. Advisor de segurança sem avisos. O advisor de desempenho informou apenas os índices de data ainda sem uso em tabelas recém-criadas ([referência](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)).
- Catálogo mobile continua com três produtos por linha, com preços e controles usando o catálogo do banco.

O projeto Supabase foi criado em São Paulo, com custo de criação cotado em US$ 0/mês. Por autorização do usuário, `giovanna-surprise` foi pausado para liberar a vaga gratuita. A pausa de `totem_4264` foi recusada pelo provedor por hibernação.

Os testes comuns de navegador interceptam gravações para evitar dados fictícios em produção. Os registros dos testes reais são removidos depois da conferência. A ausência de avisos do advisor não substitui uma auditoria de segurança ou revisão jurídica/comercial.

# Verificação da união com o painel — 13/11/2026

Mesclagem de `codex/mobile-tres-produtos` com o novo visual, o painel `/admin/` e o orçamento por etapas.

- Lint e TypeScript aprovados; 110 testes unitários aprovados.
- E2E em desktop e mobile, nos dois modos de build: **16 aprovados sem Supabase** (loja, orçamento, painel, vendas, convites, 320 px) e **18 aprovados com Supabase simulado** (pedido e orçamento registrados, retentativa sem duplicar, falha do catálogo sem preços locais e sem perder o carrinho, banco sem a migração de estoque, produto esgotado, três produtos por linha).
- As duas migrações e os testes `access.sql` e `painel.sql` foram executados em Postgres 17 embutido (PGlite) com papéis `anon`/`authenticated` e stubs de `auth`/`storage`; um teste de mutação (dar ao papel Estoque permissão de gravar `stock`) foi detectado.
- **Não verificado contra o projeto Supabase real:** a migração `20261113120000_painel_estoque_equipe.sql` ainda precisa ser aplicada (`npx supabase db push`), e login, convites e envio de fotos dependem dela.

# Cabeçalho e rodapé escuros, 2 por linha e animações — 13/11/2026

- Celular volta a 2 produtos por linha (cards compactos, botões com 42 px de altura).
- Cabeçalho e rodapé em verde escuro (#17301f); carrinho em amarelo; cabeçalho encolhe com sombra ao rolar.
- Animações: entrada das seções e dos cards ao rolar (em cascata), abertura da página inicial, polpas flutuando, etapas do orçamento deslizando, contador do carrinho e ícones reagindo ao toque. Nada fica escondido sem JavaScript, e tudo é desligado com "reduzir movimento".
- 110 testes unitários; E2E aprovados nos dois modos (16 sem Supabase, 18 com Supabase simulado). Capturas conferidas em desktop e celular, incluindo que nenhum elemento animado fica invisível após rolar a página.

# Checkout com dados do cliente, painel redesenhado e pedidos — 14/11/2026

- Erro "column products.sort does not exist" do painel corrigido (ordenação por `sort_order`).
- Checkout em etapas com nome, telefone e endereço; orçamento da foodbike com telefone. Textos de demonstração removidos da loja.
- Painel redesenhado (menu lateral, Início, Pedidos, Orçamentos, Produtos, Movimentações, Equipe); confirmação de pedido baixa o estoque via `confirm_order`.
- Home com as fotos novas (vertical no computador, horizontal no celular).
- As três migrações e os testes `access.sql`, `painel.sql` e `pedidos.sql` executados em Postgres embutido (PGlite); unitários e E2E aprovados nos dois modos. Capturas conferidas, incluindo o painel com pedidos de exemplo.
- Não reproduzido: carrinho em branco relatado (Chrome, WebKit e iPhone simulado exibiram normalmente, local e em produção).
- **Pendente no Supabase real:** aplicar `20261114120000_pedidos_clientes.sql`.
