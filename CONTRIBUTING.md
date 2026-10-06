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

O banco de produção é MySQL. O fallback local usa `data.json`, `incomes.json` e `settings.json`; esses arquivos são runtime e não devem ser commitados. Alterações de schema, foreign keys, exclusão ou migração devem preservar dados existentes e ser integradas em `main` antes do deploy.

O procedimento de publicação está em [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
