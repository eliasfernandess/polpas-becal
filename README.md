# Polpas Becal

Vitrine comercial demonstrativa, construída com Next.js 16, React 19, TypeScript estrito, Tailwind CSS 4, Lucide e Zod. Exportação estática sem servidor de aplicação, banco de dados, autenticação de clientes ou pagamentos.

## Executar

Requisitos: Node.js 22 ou superior e npm.

```sh
npm ci
npm run dev
```

Abra http://127.0.0.1:3000. Para conferir o comportamento e os cabeçalhos de **produção**:

```sh
npm run build
npm run preview
```

O diretório public já inclui todas as imagens otimizadas e fontes locais; os arquivos originais do Downloads não são necessários para executar ou publicar.

## Verificações

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit
```

Os testes E2E usam o Google Chrome instalado. Caso não esteja instalado, instale o navegador pelo canal oficial ou ajuste playwright.config.ts para utilizar o Chromium do Playwright. Os testes usam dois perfis (desktop e celular), interceptam o WhatsApp e não enviam mensagens reais. Build é necessário antes dos testes E2E.

As capturas opcionais são habilitadas pela variável SITE_PREVIEW_DIR apontando para um diretório de saída. A suíte normal ignora apenas os testes de captura, mantendo os oito cenários funcionais.

## Experiência implementada

- Início com identidade da marca, fotografias fornecidas, produtos em destaque e apresentação da foodbike.
- Catálogo de dez sabores com busca sem distinção de acentos, filtros, quantidades e indisponibilidade.
- Carrinho em diálogo nativo com retenção de foco, Escape, persistência e atualização entre abas.
- Total calculado em centavos pelo catálogo atual. Armazenamento contém somente identificadores e quantidades; preços adulterados e itens desconhecidos são descartados.
- Pedido pelo link oficial wa.me: unidade, valor unitário, quantidade, subtotal, total estimado e pedido de confirmação.
- Página de eventos e formulário validado com Zod, mensagens próximas aos campos e datas no calendário local.
- WhatsApp aberto com a solicitação preenchida; fallback de link caso o navegador bloqueie a janela. Não há confirmação automática de envio, compra ou reserva.
- Termos, privacidade, 404, metadados, imagem social, sitemap e robots. A demonstração usa noindex/nofollow.

Rotas: /, /produtos/, /eventos/, /privacidade/, /termos/.

## Onde editar

| Conteúdo | Arquivo |
| --- | --- |
| Preços em centavos, unidades, descrições, categorias, destaque e disponibilidade | src/data/products.ts |
| Número do WhatsApp, Instagram e origem do site | src/data/business.ts |
| Validação de orçamento, limites de texto e opções | src/lib/validation.ts |
| Mensagens e validação do destino wa.me | src/lib/whatsapp.ts |
| Regras de carrinho e persistência | src/lib/cart.ts e src/store/cart-store.tsx |
| Cores, tipografia e responsividade | src/app/globals.css |
| Fotografias, marca e arte de eventos | public/images/ |

O arquivo .env.example contém apenas a origem pública opcional NEXT_PUBLIC_SITE_URL. Não são necessários segredos.

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

O formulário permanece na memória da página. Nada é salvo em armazenamento local, banco de dados, logs da aplicação ou analytics. O link do WhatsApp é montado no navegador. Abrir o link encaminha o texto preenchido ao serviço WhatsApp/Meta; a empresa recebe a mensagem quando o visitante a envia. A interface explica esse fluxo e mantém os campos preenchidos enquanto a página estiver aberta.

O carrinho usa a chave becal:cart:v1 no localStorage, exclusivamente para IDs e quantidades. O site continua funcionando em memória se o navegador bloquear o armazenamento. Não há pixels, serviços de analytics, fontes remotas nem embeds do Instagram. A hospedagem poderá tratar dados técnicos; a demonstração privada Sites também usa o mecanismo de acesso da plataforma.

Os documentos iniciais não representam certificação de conformidade com a LGPD.

## Segurança e publicação

A aplicação usa escaping do React, validação estrita, limites de entrada, destino do WhatsApp fixo e links externos com noopener/noreferrer. O formulário não usa uma requisição GET para um servidor próprio. Não existem endpoints de escrita, uploads, pagamento ou cadastro.

O build executa scripts/secure-export.mjs **após** o Next.js e calcula hashes SHA-256 dos scripts inline efetivamente exportados. A CSP de produção não permite unsafe-eval nem unsafe-inline para scripts. style-src permite unsafe-inline por compatibilidade com estilos de componentes e do framework; scripts continuam limitados à mesma origem e aos hashes gerados. A política bloqueia objetos, frames e submissões HTML convencionais; orçamento é tratado por JavaScript local.

São gerados out/_headers e vercel.json contendo CSP, nosniff, Referrer-Policy: no-referrer, frame-ancestors, X-Frame-Options: DENY, Permissions-Policy, HSTS e X-Robots-Tag. O servidor de preview efetivamente os envia, e a suíte E2E confere os principais cabeçalhos. HSTS só produz efeito em HTTPS.

### Hospedagem estática

Publique o conteúdo de out após npm ci e npm run build. Não é necessário next start.

- **Sites:** a identidade privada está em .openai/hosting.json. O conteúdo exportado é empacotado e a versão publicada mantém o acesso privado. A versão demonstrativa não deve ser tornada pública antes das confirmações comerciais.
- **Cloudflare Pages ou hospedagem compatível:** use comando npm run build, saída out e preserve out/_headers.
- **Vercel:** vercel.json é regenerado a cada build com os hashes correspondentes àquela saída. Preserve a configuração gerada na implantação.
- **Nginx/Apache/outros:** importe os cabeçalhos de out/.security-headers.json no servidor; sirva caminhos com barra final pelo respectivo index.html e 404.html para inexistentes.

Cabeçalhos configurados em next.config.ts não seriam aplicados por uma hospedagem puramente estática. Por isso eles são gerados na saída e devem ser efetivamente respeitados pela hospedagem escolhida. Confirme com curl -I os cabeçalhos no domínio final. Não minifique nem altere scripts HTML depois do build, pois isso invalida os hashes da CSP.

Para atualizar a aplicação, refaça o build e publique **toda** a saída atomicamente. O servidor local relê os cabeçalhos a cada requisição para acompanhar recompilações.

Ao aprovar o lançamento: ajustar origem, documentos e dados comerciais; revisar a privacidade da hospedagem; alterar robots.ts, metadata.robots e X-Robots-Tag para indexação conforme a estratégia comercial; e repetir as verificações. O sitemap já contempla todas as páginas.

## Materiais e dependências

As imagens foram fornecidas pelo solicitante e apenas redimensionadas/codificadas para WebP. O logotipo foi mantido. A seção e a página de foodbike usam a foto fornecida pelo solicitante, otimizada em WebP com versões de 800 e 1600 pixels. A interface inteira usa DM Sans, sem serifa, servida localmente e com licença em public/fonts.

scripts/prepare-assets.mjs documenta o mapeamento das imagens originais no computador de criação; só é necessário para reprocessá-las. Os nomes e números impressos nas artes permanecem como recebidos, sem recriação do rótulo.

Versões diretas fixadas e package-lock.json versionado. A configuração de ESLint usa typescript-eslint, react-hooks e jsx-a11y; substituiu eslint-config-next porque sua cadeia de ferramentas incluía uma vulnerabilidade transitiva sem correção disponível no momento da montagem. A auditoria final deve ser repetida a cada atualização.

Referências técnicas: [exportação estática do Next.js](https://nextjs.org/docs/app/guides/static-exports), [CSP no Next.js](https://nextjs.org/docs/app/guides/content-security-policy), [LGPD no Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm).

