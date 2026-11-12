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
