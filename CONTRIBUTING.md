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

Toda operação de escrita da interface — despesa, receita ou cadastro auxiliar — deve tratar a persistência como transacional também no estado visual: preserve o estado anterior antes da mutação, confirme o sucesso do `PUT` antes de apresentar a operação como concluída e restaure o estado anterior quando a API falhar. A regra vale igualmente para edição, exclusão, ordenação e ativação de cadastros.

## Persistência e produção

O banco de produção é MySQL. O fallback local usa `data.json`, `incomes.json` e `settings.json`; esses arquivos são runtime e não devem ser commitados. Alterações de schema, foreign keys, exclusão ou migração devem preservar dados existentes, ser integradas em `main` e obrigatoriamente publicadas na hospedagem/banco de dados ao concluir a tarefa. Não considere a implementação concluída enquanto o deploy e a validação remota não terminarem.

O procedimento de publicação está em [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
