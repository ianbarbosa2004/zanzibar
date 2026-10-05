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

O banco normalizado mantém `transactions` relacionado por ID às tabelas `expense_types`, `takers`, `locations` e `creditors`. A tabela `app_settings` armazena somente configurações escalares gerais (`currency` e `schema_version`), sem campo JSON; os cadastros são lidos das respectivas tabelas. A inicialização garante o tomador `Zanzibar`.

As dependências de interface incluem `lucide` para iconografia e `chart.js` para gráficos no frontend JavaScript puro.

## Publicação no cPanel

O build do Vite é publicado somente em `dist/`. O `server.js` serve essa pasta quando ela existe, portanto os arquivos compilados não precisam ser copiados também para a raiz da aplicação. O deploy envia para a raiz remota apenas o servidor Node, os manifestos de dependências e os arquivos de runtime preservados; `index.html`, `app.js` e `style.css` permanecem como fontes no repositório e são entregues pelo build.
