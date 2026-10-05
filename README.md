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

O banco normalizado mantém `transactions` relacionado por ID às tabelas `expense_types`, `takers`, `locations` e `creditors`. A tabela `app_settings` armazena somente configurações gerais, como moeda e versão do schema; os cadastros são lidos das respectivas tabelas.

As dependências de interface incluem `lucide` para iconografia e `chart.js` para gráficos no frontend JavaScript puro.
