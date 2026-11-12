# Polpas Becal

Vitrine Next.js 16 / React 19 com catálogo, pedidos e orçamentos no Supabase e hospedagem estática na Vercel. O layout mobile exibe três produtos por linha até 650 px.

## Executar

Node.js 24 e npm. Execute `npm ci`, copie `.env.example` para `.env.local` e configure a URL do projeto e a chave **publishable** do Supabase. Nunca utilize `service_role` ou `sb_secret` no cliente. Execute `npm run dev` ou `npm run build` seguido de `npm run preview`.

Sem as duas variáveis Supabase, o modo local demonstrativo usa `src/data/products.ts` e encaminha mensagens sem gravar no banco. Deploys na Vercel exigem as duas variáveis e falham se elas faltarem. Com Supabase configurado, falhas de conexão mostram erro; o catálogo não retorna silenciosamente aos preços demonstrativos.

## Integração

- Vercel: projeto `polpas-becal`, conectado a `eliasfernandess/polpas-becal`; Node 24; build `npm run build`.
- Supabase: projeto `polpas-becal` (`zcxojunqupnpujhhplnb`), região São Paulo (`sa-east-1`).
- Variáveis públicas: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`.
- Migração versionada em `supabase/migrations/`. Inclui os dez produtos demonstrativos originais.
- `products`: leitura pública com RLS; alterações somente pela administração no painel Supabase. Preços em centavos; imagens apontam para arquivos locais em `public/images/`.
- `orders`: visitantes podem inserir apenas ID aleatório, itens e total estimado. Um trigger com `SECURITY INVOKER` verifica disponibilidade e quantidades, recalcula o total e grava um retrato dos produtos/preços. Alterações de preço exigem atualizar o catálogo antes de registrar. O cliente não pode ler, alterar ou excluir pedidos, nem definir o status.
- `event_requests`: visitantes podem inserir somente os campos do orçamento. Leitura e alterações são restritas à administração. O banco verifica campos obrigatórios, limites, opções e data.
- O estado inicial dos registros é `pending_whatsapp`. A equipe acompanha os registros no Table Editor do Supabase e atualiza o status após o contato. Não há confirmação automática de compra, pagamento ou reserva.
- Repetir uma tentativa de envio na mesma página reutiliza um UUID, evitando duplicação caso a resposta se perca. Ao alterar os dados, uma nova solicitação é criada.
- Os formulários informam que os dados serão salvos. O carrinho persiste apenas IDs e quantidades no navegador; dados pessoais não são gravados em localStorage/sessionStorage.

## Verificar

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Os testes E2E usam Chrome. Instale-o pelo Playwright se necessário. As chamadas de gravação são interceptadas nos testes automatizados comuns para evitar pedidos fictícios em produção; a conexão real e as políticas do banco devem ser verificadas separadamente. Testes SQL transacionais ficam em `supabase/tests/` e fazem rollback.

## Hospedagem e segurança

O build exporta `out/` e calcula hashes CSP dos scripts inline. A CSP permite conexão somente à própria origem e ao projeto Supabase configurado. Na Vercel, o Build Output API publica arquivos e cabeçalhos gerados **no mesmo build**, evitando hashes antigos. `out/_headers` e `out/.security-headers.json` atendem outras hospedagens e o preview local.

RLS está habilitado em todas as tabelas públicas. A chave publishable identifica o projeto, não um usuário; as permissões do banco são a fronteira de acesso. Nenhuma chave privada é necessária no navegador. Os endpoints de envio são públicos, como os formulários: para tráfego público intenso, monitore abuso e acrescente proteção contra automação conforme a operação exigir.

O site continua demonstrativo, com `noindex/nofollow` e os avisos comerciais. A proteção de acesso configurada na Vercel deve ser preservada até o lançamento aprovado.

## Onde editar

- Layout e responsividade: `src/app/globals.css`.
- Catálogo em produção: tabela `public.products` no Supabase.
- Telefone, Instagram e origem: `src/data/business.ts`.
- Validações do formulário: `src/lib/validation.ts`; limites também estão na migração SQL.
- Conexão e gravações: `src/lib/supabase.ts` e `src/lib/submissions.ts`.
- Estado do catálogo/carrinho: `src/store/`.

## Informações comerciais pendentes

Antes de lançamento público, confirmar com a empresa:

1. Telefone **+55 34 99649-3471** (informado no briefing; há outros números nas artes fornecidas).
2. Perfil **@polpasbecal** e autorização para uso do nome, logotipo e fotografias.
3. Sabores efetivamente vendidos, composição e alegação “100% fruta / natural”.
4. Preço oficial, peso comercial e disponibilidade de cada item. **Todos os preços, unidades de 100 g e estados de disponibilidade cadastrados são demonstrativos.** Tamarindo aparece indisponível apenas para demonstrar esse estado.
5. Área de atendimento, entrega, retirada, pedido mínimo e condições de venda.
6. Existência, aparência e estrutura da foodbike, cidades atendidas, equipe, duração e condições de contratação. A foto da foodbike foi fornecida para a apresentação e não substitui a confirmação da estrutura disponível.
7. Razão social, CNPJ, endereço e responsável pelo tratamento, sem inventar esses dados.
8. Canal oficial de privacidade, bases legais e rotinas de retenção/atendimento no WhatsApp, com revisão jurídica dos documentos.
9. Hospedagem definitiva e domínio antes de atualizar metadados e permitir indexação.

O protótipo não possui depoimentos, números de clientes, promessas de entrega ou pacotes inventados.


## Privacidade

Pedidos e orçamentos são registrados para atendimento antes da continuação no WhatsApp. A empresa deverá definir retenção, canal de atendimento dos direitos dos titulares e práticas de exclusão. As páginas de privacidade e termos descrevem esse fluxo. Não existem pagamentos, pixels de marketing ou autenticação de clientes. Fotografias e fontes permanecem locais.
