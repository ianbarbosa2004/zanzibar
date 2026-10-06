# Automações do projeto

## Regra de branch

As automações nunca devem fazer commit, push ou deploy diretamente na branch protegida `main`. Antes de trabalhar, devem fazer `fetch` de `origin`, garantir que o checkout esteja em `main` e verificar o estado local. Se `main` estiver divergente de `origin/main`, mas sem alterações não commitadas, devem preservar o commit local em uma branch de backup nomeada com data, alinhar `main` a `origin/main` e registrar essa ação; nunca devem descartar commits silenciosamente. Se houver alterações não commitadas, devem interromper e informar o erro. A publicação em produção só pode ocorrer a partir de `main` exatamente igual a `origin/main`, depois que o pull request tiver sido mesclado.

Quando uma implementação envolver schema, migração, foreign key ou persistência MySQL, a automação deve obrigatoriamente executar o deploy oficial e validar a hospedagem/banco antes de considerar a tarefa concluída.

As automações também devem verificar a consistência visual das escritas: formulários de despesas, receitas e cadastros auxiliares só podem confirmar o sucesso depois do `PUT /api/data`; em caso de falha, o estado anterior deve ser restaurado. A verificação inclui inclusão, edição, exclusão, ordenação e ativação ou desativação.

## `atualizar readme main`

Automação manual do projeto `zanzibar`. Trabalha em uma branch de automação, analisa as implementações recentes e atualiza:

- `README.md`
- `CONTRIBUTING.md`
- `docs/DEPLOYMENT.md`
- `docs/CONTINUITY-PROMPT.md`

Executa `npm run build`, depois `npm test`, `node --check app.js`, `node --check server.js` e `git diff --check`. Ao concluir, cria commit com o trailer `Co-authored-by` exigido, envia a branch para `origin` e abre um pull request contra `main` com `gh pr create`. Não executa deploy: alterações de documentação devem ser revisadas e mescladas pelo pull request. Não deve incluir credenciais, chaves privadas, dados de produção, JSON de runtime, `dist/` ou `node_modules/`.

## `atualizar online main`

Automação manual do projeto `zanzibar`. Trabalha em uma branch de automação e executa as validações locais. Ela não publica a partir da branch: cria um pull request contra `main`. Depois do merge, a publicação deve ser feita pela automação de deploy, exclusivamente pelo `.github/scripts/deploy.ps1`.

O deploy via SFTP deve:

- preservar `data.json`, `settings.json`, `incomes.json` e `cash-closings.json`;
- criar backups remotos dos dados existentes;
- preservar `.htaccess`;
- substituir `dist/`, `server.js`, `src/` e os manifestos npm;
- reinstalar dependências e reiniciar o Passenger;
- validar HTTP 200 e conferir os assets publicados por SHA-256;
- nunca enviar credenciais ou chaves privadas.

As validações locais continuam sendo `npm run build`, `npm test`, `node --check app.js`, `node --check server.js` e `git diff --check`. O deploy, após o merge, deve ser executado a partir de `main` sincronizada com `origin/main`. O workspace da automação deve ser preparado antes da execução: branch `main`, status limpo e `HEAD` igual a `origin/main`. O script oficial bloqueia commits divergentes, publica `deploy-version.json` com o SHA do commit e confirma por HTTP que o cPanel serve esse mesmo SHA. A automação deve registrar a saída `CLAREZA_DEPLOY_COMMIT`; sem essa confirmação, a versão não deve ser considerada publicada. O deploy deve preservar:

- `data.json`, `settings.json`, `incomes.json`, `cash-closings.json` e backups;
- `.htaccess`;
- credenciais e chaves privadas, que nunca podem ser enviadas.

O script deve validar HTTP 200 e comparar os assets remotos por SHA-256. Alterações de schema, migração, foreign key ou persistência MySQL exigem validação remota após o merge; não devem ser consideradas concluídas apenas com o pull request aberto.

### Resultado da execução mais recente

A execução `0756a554-bbd0-4563-8636-799eb423c830` foi concluída com sucesso após o merge do PR #32. O cPanel confirmou:

```json
{"branch":"main","commit":"3f800abf97b83609d33c29a98a3df9c9226e2da9"}
```

Se a ferramenta exibir esse conteúdo como `{"type":"Buffer","data":[...]}`, isso é apenas uma serialização da resposta HTTP. A automação deve decodificar os bytes UTF-8 e apresentar o JSON acima, além de comparar o campo `commit` com `git rev-parse origin/main`.

## Automação legada

As execuções anteriores que fizeram commit direto em `main` ou usaram branches de workspace compartilhadas são apenas histórico. Não devem ser reutilizadas. As configurações atuais exigem branch de automação, pull request e deploy somente após o merge.
