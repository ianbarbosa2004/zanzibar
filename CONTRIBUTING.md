# Contribuição

## Fluxo de trabalho

1. Faça uma alteração pequena e focada, preservando o contrato da API.
2. Leia os módulos existentes antes de duplicar regras. Regras compartilhadas ficam em `src/shared`, integrações do navegador em `src/client` e integrações do servidor em `src/server`.
3. Atualize ou crie testes para o comportamento alterado.
4. Não inclua credenciais, dados de produção, arquivos JSON de runtime, `node_modules/` ou `dist/`.

## Validação local

Execute os comandos abaixo antes de enviar a alteração:

```bash
npm test
npm run build
node --check app.js
node --check server.js
git diff --check
```

Para mudanças específicas, os testes também podem ser executados por camada:

```bash
npm run test:unit
npm run test:integration
```

Mudanças que envolvem banco de dados devem ser verificadas no fluxo completo: interface, payload da API, repositório e leitura posterior. Não use dados reais para criar testes locais.

## Persistência e produção

O banco de produção é MySQL. O fallback local usa `data.json`, `incomes.json`, `cash-closings.json` e `settings.json`; esses arquivos são runtime, estão no `.gitignore` e não devem ser commitados. Quando `CLAREZA_DB_PASSWORD` ativa o MySQL, `CLAREZA_DB_USER` e `CLAREZA_DB_NAME` também são obrigatórios. Alterações de schema, foreign keys, exclusão ou migração devem preservar dados existentes e ser integradas em `main` antes do deploy.

`transactions` é a tabela consolidada de despesas e receitas. Fechamentos de caixa ficam em `cash_closings`, vinculados a `payment_methods`, e geram uma receita consolidada por data. Os catálogos usam `catalogMetadata` para ordem e status; cadastros inativos não devem aparecer nos formulários, e referências existentes impedem exclusão física.

O procedimento de publicação está em [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
