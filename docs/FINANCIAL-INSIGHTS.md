# Assistente financeiro: arquitetura e operação

Este documento descreve toda a implementação do assistente financeiro do
Clareza, desde os indicadores determinísticos até as perguntas assistidas por
IA. O recurso é complementar ao fluxo financeiro principal: ele lê dados,
calcula análises e exibe explicações, mas nunca altera transações, cadastros,
fechamentos, limites ou faturamento automaticamente.

## Evolução por fases

### Fase 1 — Indicadores determinísticos

Implementada em `src/shared/financial-insights.js`, com cálculo executado no
servidor a partir das estruturas existentes de `transactions` e `incomes`.
Não envia dados a provedores externos e não cria uma fonte de verdade nova.

Inclui:

- receitas, despesas, saldo e quantidade de lançamentos;
- variações percentuais contra o mês anterior;
- concentração de despesas por categoria e localização;
- concentração de receitas por fonte ou produto;
- recorrência agregada por categoria/fonte, sem descrições;
- anomalias simples para lançamentos acima de três vezes a média do período;
- dias de maior movimentação;
- período explícito no formato `YYYY-MM`.

O escopo `general` exclui receitas e despesas do Buffet. O escopo `buffet`
inclui somente movimentações reconhecidas como Buffet. A resposta geral pode
conter um bloco Buffet separado para permitir visualização independente, mas
esse bloco não altera os totais gerais.

O módulo **Buffet** também possui uma visão operacional própria, com cartões de
receitas, despesas e saldo, lançamentos com observação e fechamentos diário e
mensal. Essa visão usa as mesmas movimentações consolidadas e não altera a
regra de separação dos indicadores: o escopo geral continua excluindo Buffet,
enquanto o escopo `buffet` considera somente essas entradas.

### Fase 2 — Interpretação opcional por IA

A interpretação é opt-in e só ocorre quando o usuário aciona o botão próprio e
confirma o envio. O servidor calcula primeiro os indicadores e envia ao
provedor somente um payload agregado, sem transações brutas, descrições,
credenciais, arquivos runtime ou dados de autenticação.

O prompt é versionado em `src/server/ai/prompts.js`. A resposta esperada é
JSON estruturado com:

- `summary`;
- `insights[]`, contendo título, descrição, severidade e evidências;
- `recommendations[]`, contendo título, descrição, prioridade e ação
  informativa;
- `disclaimer`.

O backend limita tamanho, valida o schema, remove HTML dos textos retornados e
trata timeout, HTTP 429, falhas do provedor, JSON inválido e schema
incompleto. Uma falha nunca é convertida em resposta de sucesso.

### Fase 3 — Histórico de análises

O usuário pode salvar explicitamente a análise exibida. O MySQL armazena:

- usuário autenticado;
- período;
- escopo;
- indicadores agregados;
- resultado da IA, quando houver;
- versão do prompt;
- data de criação.

A tabela `financial_insight_history` é criada de forma não destrutiva durante a
inicialização do banco e possui vínculo com `authorized_users`. O histórico é
isolado por usuário e limitado a 50 registros na consulta. O fallback JSON e o
modo snapshot nunca são transformados em destinos de escrita.

### Fase 4 — Comparações e alertas

O servidor compara de 2 a 12 períodos mensais do mesmo escopo e calcula
tendências de receitas, despesas e saldo. Também retorna alertas determinísticos
para:

- crescimento relevante de despesas;
- queda relevante de receitas;
- saldo negativo após um saldo não negativo;
- anomalias simples detectadas no período.

Alertas são indicadores explicativos, não notificações automáticas nem ações
financeiras.

### Fase 5 — Perguntas assistidas

O usuário pode enviar uma pergunta de até 500 caracteres depois de confirmar
explicitamente o envio. O servidor recalcula os indicadores do período
selecionado e envia somente os agregados junto à pergunta.

A resposta esperada é:

```json
{
  "answer": "string",
  "evidence": ["string"],
  "disclaimer": "string"
}
```

Se os indicadores não permitirem uma conclusão, o provedor deve informar essa
limitação. Perguntas não executam comandos e não alteram dados.

## Arquitetura e fluxo

```text
Dashboard
  -> endpoint protegido
  -> http-server.js
  -> análise determinística compartilhada
  -> payload agregado e redigido
  -> OpenAI ou Gemini (somente servidor, opt-in)
  -> validação/sanitização no backend
  -> resposta para a interface
```

Os principais módulos são:

| Arquivo | Responsabilidade |
| --- | --- |
| `src/shared/financial-insights.js` | Indicadores, comparação, isolamento do Buffet e alertas |
| `src/server/ai/financial-advisor.js` | Chamada ao provedor, limites, timeout e validação |
| `src/server/ai/prompts.js` | Prompts e versão do contrato JSON |
| `src/server/config.js` | Variáveis do ambiente do processo |
| `src/server/http-server.js` | Autenticação, rotas e respostas HTTP |
| `server.js` | Composição do servidor e dependências |
| `app.js` | Controles, confirmação, estados e renderização |
| `src/server/database/repository.js` | Histórico MySQL |

O frontend nunca recebe uma chave de provedor. A autorização continua sendo
aplicada no servidor em todas as rotas protegidas.

## Endpoints

Todos os endpoints abaixo exigem autenticação quando o servidor está com
OAuth configurado.

### Indicadores e interpretação

```text
GET  /clareza/api/financial-insights?month=YYYY-MM&scope=general|buffet
POST /clareza/api/financial-insights
```

O POST aceita:

```json
{
  "month": "2026-10",
  "scope": "general",
  "withAi": true,
  "saveHistory": false
}
```

`withAi` deve ser explicitamente `true` para chamar o provedor. `saveHistory`
deve ser explicitamente `true` para persistir a análise; nesse caso a resposta
usa HTTP `201`.

### Histórico

```text
GET /clareza/api/financial-insights/history?limit=20
```

O limite efetivo é restringido ao intervalo de 1 a 50 e a consulta filtra pelo
usuário autenticado.

### Comparação

```text
GET /clareza/api/financial-insights/compare?month=YYYY-MM&scope=general|buffet&periods=3
```

`periods` é limitado pelo servidor a 2–12 períodos.

### Perguntas

```text
POST /clareza/api/financial-insights/ask
```

Payload:

```json
{
  "month": "2026-10",
  "scope": "general",
  "question": "Por que as despesas variaram?"
}
```

## Configuração do provedor de IA

A configuração é feita exclusivamente nas variáveis de ambiente do processo
Node/Passenger. O projeto não lê arquivo JSON de segredos.

### Variáveis comuns

```text
CLAREZA_AI_ENABLED=1
CLAREZA_AI_PROVIDER=gemini
CLAREZA_AI_MODEL=gemini-3.8-flash
CLAREZA_AI_TIMEOUT_MS=20000
CLAREZA_AI_MAX_OUTPUT_TOKENS=800
CLAREZA_AI_MAX_PAYLOAD_BYTES=24000
```

`CLAREZA_AI_PROVIDER` aceita `openai` ou `gemini`. Se omitida, a aplicação
assume `openai`.

### OpenAI

```text
CLAREZA_AI_API_KEY=<chave da OpenAI>
```

O modelo padrão é `gpt-4o-mini` quando `CLAREZA_AI_MODEL` não é definido.

### Gemini

```text
CLAREZA_GEMINI_API_KEY=<chave do Google AI Studio>
```

O modelo padrão é `gemini-3.8-flash` quando `CLAREZA_AI_MODEL` não é definido.
A chave deve existir somente no Passenger e não deve ser incluída em URLs
registradas, logs, frontend, Git ou arquivos de runtime.

Se o Gemini retornar HTTP 404, confirme no Passenger se
`CLAREZA_AI_MODEL` está vazio ou definido com um identificador disponível, como
`gemini-3.8-flash`. O backend informa o modelo usado sem revelar a chave.

Com IA desabilitada ou sem a chave correspondente, os indicadores
determinísticos continuam disponíveis e a interface informa explicitamente que
a interpretação não está habilitada.

## Privacidade e segurança

- O provedor recebe indicadores agregados e a pergunta autorizada, não a lista
  completa de transações.
- Descrições e PII desnecessária não fazem parte do payload redigido.
- Chaves de OpenAI/Gemini, OAuth, sessão e MySQL ficam no ambiente protegido
  do servidor.
- Nenhuma recomendação executa mutação automaticamente.
- Respostas do provedor são tratadas como dados não confiáveis e passam por
  validação e remoção de HTML.
- O histórico não armazena transações brutas nem prompts completos.
- O Buffet permanece separado do escopo geral.
- O fallback JSON e o snapshot local não recebem gravações de histórico.
- Não versionar chaves, `data.json`, `settings.json`, backups, `dist`,
  `node_modules` ou `.htaccess`.

## Interface e estados

O menu **Análise IA** oferece:

- seleção de escopo geral/Buffet;
- geração de indicadores;
- solicitação confirmada de interpretação;
- comparação dos últimos meses;
- pergunta confirmada à IA;
- salvamento explícito no histórico;
- consulta do histórico por usuário.

A análise fica separada dos menus de resumo e movimentações. Abrir ou
recalcular a tela não altera lançamentos; a interpretação e as perguntas só
chamam o provedor quando o usuário confirma a ação.

Os controles possuem estados de carregamento, desabilitado, vazio e erro. A
interface identifica conteúdo gerado por IA e exibe disclaimer. Nenhum botão de
análise altera dados financeiros.

## Testes e validação

Os testes ficam no runner nativo `node:test`:

- `tests/unit/financial-insights.test.js`: cálculos, variações,
  concentrações, Buffet, recorrência, anomalias e comparação;
- `tests/unit/financial-advisor.test.js`: IA desabilitada, payload agregado,
  sanitização, schema, timeout, rate limit e integração Gemini;
- `tests/integration/financial-insights.test.js`: autenticação, indicadores,
  histórico, comparação e perguntas.

Validação completa:

```powershell
npm.cmd test
npm.cmd run build
node --check app.js
node --check server.js
git diff --check
```

## Limitações atuais

- Os alertas são regras determinísticas simples, não um sistema de
  notificação agendada.
- A análise depende da qualidade e categorização dos dados existentes.
- A IA pode estar indisponível por falta de saldo, rate limit, timeout,
  configuração ausente ou falha do provedor.
- O resultado da IA é informativo e não substitui decisão financeira.
- Não há execução automática de recomendações.
- A retenção do histórico segue a disponibilidade do MySQL; não há rotina
  automática de expurgo implementada.

## Procedimento operacional

Para ativar ou trocar o provedor:

1. Configure as variáveis no Application Manager do cPanel.
2. Reinicie o aplicativo Passenger.
3. Gere indicadores determinísticos no dashboard.
4. Solicite uma interpretação ou pergunta com confirmação explícita.
5. Se houver erro `429`, verifique saldo, faturamento e limites do provedor.
6. Se houver erro de configuração, confirme `CLAREZA_AI_ENABLED`,
   `CLAREZA_AI_PROVIDER` e a chave correspondente.

Alterações de código devem ser validadas localmente e publicadas somente pelo
script oficial `.github/scripts/deploy.ps1`, conforme
`docs/DEPLOYMENT.md`.
