# zanzibar

Aplicação local para registro e análise de despesas.

## Dados locais

`data.json` e `settings.json` são arquivos de runtime e não são versionados. Eles são criados automaticamente pelo servidor e permanecem preservados durante atualizações do repositório. Os arquivos `data.example.json` e `settings.example.json` documentam a estrutura inicial esperada.

## Banco MySQL

Em produção, configure estas variáveis no Application Manager/Passenger do cPanel:

```text
CLAREZA_DB_HOST=localhost
CLAREZA_DB_PORT=3306
CLAREZA_DB_NAME=itsitescom_clareza
CLAREZA_DB_USER=itsitescom_clareza_user
CLAREZA_DB_PASSWORD=(senha configurada somente no ambiente)
```

Quando `CLAREZA_DB_PASSWORD` estiver presente, o servidor cria as tabelas necessárias e migra os dados dos arquivos JSON apenas se o banco estiver vazio. Sem essas variáveis, o desenvolvimento local continua usando JSON.

O banco normalizado mantém todas as movimentações em `transactions`, diferenciadas por `type` (`expense` ou `income`). Despesas usam relações com `expense_types`, `takers`, `locations` e `creditors`; receitas usam `income_source_id` para `income_sources`. Os campos exclusivos de despesas aceitam `NULL` para receitas. Instalações existentes migram a antiga tabela `incomes` para `transactions` e a removem após a migração. A tabela `app_settings` armazena somente configurações escalares gerais (`currency` e `schema_version`), sem campo JSON; a inicialização garante o tomador `Zanzibar` e a fonte `Salário`.

As dependências de interface incluem `lucide` para iconografia e `chart.js` para gráficos no frontend JavaScript puro. A interface apresenta receitas com descrição, valor, fonte, data, filtros, paginação, edição e saldo mensal (receitas menos despesas).

## Estrutura do código

```text
src/
  client/                 # API, estado e persistência do navegador
  server/                 # HTTP, arquivos estáticos, armazenamento e banco
  shared/                 # Regras de domínio reutilizadas pelos dois lados
tests/
  unit/                   # Funções puras e adaptadores isolados
  integration/             # API HTTP em servidor efêmero
server.js                 # Entry point do Passenger/cPanel
app.js                    # Bootstrap atual da interface Vite
```

A refatoração é incremental: cada extração preserva o contrato da API e é acompanhada por testes. Novos módulos devem preferir funções pequenas e sem dependência de DOM, banco ou ambiente global; integrações ficam nas camadas `client` e `server`.

Os testes podem ser executados separadamente:

```bash
npm run test:unit
npm run test:integration
npm test
```

## Publicação no cPanel

O build do Vite é publicado somente em `dist/`. O `server.js` serve essa pasta quando ela existe, portanto os arquivos compilados não precisam ser copiados também para a raiz da aplicação. O deploy envia para a raiz remota apenas o servidor Node, os manifestos de dependências e os arquivos de runtime preservados; `index.html`, `app.js` e `style.css` permanecem como fontes no repositório e são entregues pelo build.
