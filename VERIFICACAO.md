# Verificação da entrega

Atualização de 21/10/2026: interface com DM Sans sem serifa e foto da foodbike fornecida pelo solicitante. Build, lint e os 58 testes unitários passaram novamente. As quatro verificações de captura visual e responsividade/cabeçalhos passaram em desktop e celular, incluindo todas as rotas em 320 px. Os fluxos comerciais não foram alterados nesta atualização.

Execução em 20/10/2026, horário de São Paulo.

| Verificação | Resultado |
| --- | --- |
| ESLint com regras TypeScript, React Hooks e acessibilidade | Passou, sem avisos |
| TypeScript estrito | Passou |
| Vitest | 58 testes passaram, 4 arquivos |
| Playwright: fluxos de desktop e celular | 8 cenários funcionais passaram |
| Playwright: capturas desktop e celular | 2 cenários de captura passaram |
| Rotas em 320 px | Início, catálogo, eventos, privacidade e termos sem rolagem horizontal nos dois perfis |
| Build de produção | Exportação estática concluída para todas as rotas |
| npm audit | 0 vulnerabilidades conhecidas |
| Busca por padrões reconhecíveis de credenciais na saída pública | 23 arquivos HTML/JS/CSS verificados, sem ocorrências |
| Cabeçalhos na prévia de produção | CSP com hashes, nosniff, bloqueio de frames e ausência de unsafe-eval verificados |

Carrinho: inclusão, alteração, remoção, estado vazio, persistência após recarregar, quantidades inválidas, limite e itens desatualizados testados. Pedido codificado com acentos, subtotais e total estimado conferido.

Eventos: campos obrigatórios, datas de calendário e passado, seleções, limites, opcionais e orçamento com acentos testados. O teste de navegador confirma que os dados do formulário não entram no armazenamento persistente nem em requisições externas antes do redirecionamento.

As chamadas do WhatsApp foram interceptadas nos testes; nenhuma mensagem foi enviada. A aparência foi conferida por capturas das três páginas principais em desktop e celular, além da inspeção da prévia no navegador.

Limites: a suíte não substitui auditoria formal WCAG, revisão jurídica ou avaliação das práticas operacionais da empresa. Não foi realizada contratação, compra, integração financeira, medição de tráfego real ou certificação de Core Web Vitals. Confirmar os cabeçalhos e o comportamento no domínio público definitivo, além dos dados comerciais listados no README.
