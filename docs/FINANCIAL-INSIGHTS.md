# Indicadores financeiros determinísticos

A Fase 1 da análise financeira calcula indicadores no servidor a partir dos
dados já existentes. Não há chamada a provedor externo, persistência nova ou
alteração do schema MySQL.

## Escopo e período

`GET` ou `POST /clareza/api/financial-insights` exige autenticação e recebe
um período explícito no formato `YYYY-MM`. O escopo `general` exclui receitas
e despesas do Buffet. O escopo `buffet` analisa somente as movimentações do
Buffet. O endpoint retorna erro de validação quando o período ou o escopo são
inválidos.

## Métricas

- receitas, despesas, saldo e quantidade de lançamentos;
- variação percentual contra o mês anterior, com indicação quando não existe
  base de comparação;
- concentração por categoria, localização e fonte;
- recorrência agregada por categoria/fonte, sem descrições;
- possíveis anomalias simples, usando lançamentos acima de três vezes a média;
- dias de maior movimentação;
- bloco Buffet separado da visão geral.

Os valores são indicadores de apoio, não recomendações automáticas. A tela
explica o período comparado, o critério de anomalia e exibe estados de
carregamento, vazio e erro. Nenhuma ação financeira é executada pela análise.

## Interpretação opcional por IA

A interpretação por IA é uma etapa posterior e opt-in. Ela só é solicitada
pelo botão próprio, após confirmação explícita, via `POST` com `withAi: true`.
O servidor envia apenas indicadores agregados, nunca descrições, credenciais,
arquivos runtime ou dados de autenticação. A chave fica somente no ambiente
Node/Passenger. Respostas JSON são validadas e erros de timeout, limite,
provedor ou schema inválido são expostos sem fallback enganoso. A IA não pode
alterar transações, cadastros ou fechamentos.

Configure `CLAREZA_AI_ENABLED`, `CLAREZA_AI_PROVIDER` e opcionalmente
`CLAREZA_AI_API_KEY` (OpenAI) ou `CLAREZA_GEMINI_API_KEY` (Gemini), além de
`CLAREZA_AI_MODEL`, `CLAREZA_AI_TIMEOUT_MS`, `CLAREZA_AI_MAX_OUTPUT_TOKENS` e
`CLAREZA_AI_MAX_PAYLOAD_BYTES` fora do repositório. A integração pode
permanecer desabilitada sem afetar os indicadores determinísticos.

## Histórico (Fase 3)

O botão **Salvar no histórico** grava explicitamente a análise atual no MySQL,
associada ao usuário autenticado. O endpoint
`GET /clareza/api/financial-insights/history` lista até 50 análises do
usuário. São armazenados período, escopo, indicadores agregados, eventual
resultado da IA e versão do prompt; transações brutas e descrições não são
armazenadas. O fallback JSON e o modo snapshot não se tornam graváveis.

## Comparações e perguntas (Fases 4 e 5)

O endpoint `GET /clareza/api/financial-insights/compare` compara até 12
períodos mensais do mesmo escopo e retorna tendências, alertas de crescimento
de despesas, queda de receitas, saldo negativo e anomalias simples. O Buffet
continua isolado e nunca é incorporado ao escopo geral.

O endpoint protegido `POST /clareza/api/financial-insights/ask` aceita uma
pergunta de até 500 caracteres. O servidor calcula os indicadores do período e,
quando a IA está habilitada, envia somente esses agregados e a pergunta ao
provedor. A resposta é validada e exibida como informativa; nenhuma pergunta
pode alterar transações, cadastros, fechamentos ou histórico automaticamente.

## Privacidade e validação

A resposta não inclui descrições dos lançamentos nem PII desnecessária. A
implementação reutiliza as estruturas de `transactions` e `incomes`, sem
criar fonte de verdade adicional. Valide com:

```powershell
npm.cmd test
npm.cmd run build
node --check app.js
node --check server.js
git diff --check
```
