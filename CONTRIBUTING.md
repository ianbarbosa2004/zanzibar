# Contribuição

## Fluxo de trabalho

1. Ao iniciar em outro computador ou após perder uma sessão/worktree, execute
   `sincronizar desenvolvimento` para alinhar com `origin/main` sem apagar
   alterações locais e conferir as diretrizes operacionais.
2. Faça uma alteração pequena e focada, preservando o contrato da API.
3. Leia os módulos existentes antes de duplicar regras. Regras compartilhadas ficam em `src/shared`, integrações do navegador em `src/client` e integrações do servidor em `src/server`.
4. Atualize ou crie testes para o comportamento alterado.
5. Não inclua credenciais, dados de produção, arquivos JSON de runtime (`data.json`, `settings.json`, `incomes.json`, `cash-closings.json` e `limits.json`), `node_modules/` ou `dist/`.

## Validação local

Execute os comandos abaixo antes de enviar a alteração:

```bash
npm run build
npm test
node --check app.js
node --check server.js
git diff --check
```

No Windows, prefira `npm.cmd run build` e `npm.cmd test` quando a política de
execução bloquear `npm.ps1`.

Para mudanças específicas, os testes também podem ser executados por camada:

```bash
npm run test:unit
npm run test:integration
```

Mudanças que envolvem banco de dados devem ser verificadas no fluxo completo: interface, payload da API, repositório e leitura posterior. Não use dados reais para criar testes locais.

Toda operação de escrita da interface — despesa, receita ou cadastro auxiliar — deve tratar a persistência como transacional também no estado visual: preserve o estado anterior antes da mutação, confirme o sucesso do `PUT` antes de apresentar a operação como concluída e restaure o estado anterior quando a API falhar. A regra vale igualmente para edição, exclusão, ordenação e ativação de cadastros.

Ao adicionar paginação a uma nova listagem, mantenha seu estado separado dos estados de filtros e listagens existentes. Não use a coleção inteira de `paginationState` para renderizar uma família específica de componentes: um estado de paginação sem painel correspondente pode lançar uma exceção após uma gravação bem-sucedida e mascarar o sucesso da API.

## Persistência e produção

O banco de produção é MySQL. O fallback local usa `data.json`, `settings.json`, `incomes.json` e `cash-closings.json`; esses arquivos são runtime e não devem ser commitados. Alterações de schema, foreign keys, exclusão ou migração devem preservar dados existentes e ser enviadas diretamente para `main` somente após as validações locais. O deploy não é disparado automaticamente: só publique quando o usuário solicitar, usando exclusivamente `.github/scripts/deploy.ps1`, e considere a alteração operacionalmente concluída somente após a validação remota documentada em [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

O procedimento de publicação está em [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Antes de executar o deploy no Windows, carregue a chave autorizada no
`ssh-agent` com o procedimento documentado. O script valida essa condição
antes do build e falha de forma explícita quando a identidade não está
disponível; nunca registre ou automatize a passphrase.

Para testar dados reais localmente, use somente o snapshot descartável
documentado em [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), com
`CLAREZA_LOCAL_SNAPSHOT=1`. Esse modo não pode ser usado em produção e
bloqueia gravações.
