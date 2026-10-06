# Automações do projeto

## Regra de branch

As automações devem rodar uma por vez. As automações de documentação podem criar pull requests. A automação `atualizar online` é diferente: ela publica diretamente o checkout local validado, sem criar ou aguardar PR. O usuário deve executá-la quando quiser publicar as alterações locais. Ela nunca deve apagar ou sobrescrever arquivos de dados de produção.

Quando uma implementação envolver schema, migração, foreign key ou persistência MySQL, a automação deve obrigatoriamente executar o deploy oficial e validar a hospedagem/banco antes de considerar a tarefa concluída.

As automações também devem verificar a consistência visual das escritas: formulários de despesas, receitas e cadastros auxiliares só podem confirmar o sucesso depois do `PUT /api/data`; em caso de falha, o estado anterior deve ser restaurado. A verificação inclui inclusão, edição, exclusão, ordenação e ativação ou desativação.

## `atualizar readme main`

Automação manual do projeto `zanzibar`. Trabalha em uma branch de automação, analisa as implementações recentes e atualiza:

- `README.md`
- `CONTRIBUTING.md`
- `docs/DEPLOYMENT.md`
- `docs/CONTINUITY-PROMPT.md`
- `docs/AUTOMATIONS.md`

Executa `npm run build`, depois `npm test`, `node --check app.js`, `node --check server.js` e `git diff --check`. Ao concluir, cria commit com o trailer `Co-authored-by` exigido, envia a branch para `origin`, abre um pull request com `gh pr create` e solicita merge automático com `gh pr merge --auto --squash`. Se houver aprovação humana, conflito ou check falho, interrompe e informa o bloqueio exato. Não deve incluir credenciais, chaves privadas, dados de produção, JSON de runtime, `dist/` ou `node_modules/`.

## `atualizar online main`

Automação manual do projeto `zanzibar`. Publica diretamente o checkout local, sem criar PR, trocar branch, fazer merge ou aguardar o GitHub. O PR fica reservado à integração do código no repositório; esta automação é somente o caminho operacional do cPanel.

O deploy via SFTP deve:

- preservar `data.json`, `settings.json`, `incomes.json` e `cash-closings.json`;
- criar backups remotos dos dados existentes;
- preservar `.htaccess`;
- substituir `dist/`, `server.js`, `src/` e os manifestos npm;
- reinstalar dependências e reiniciar o Passenger;
- validar HTTP 200 e conferir os assets publicados por SHA-256;
- nunca enviar credenciais ou chaves privadas.

As validações locais continuam sendo `npm run build`, `npm test`, `node --check app.js`, `node --check server.js` e `git diff --check`. O deploy deve ser executado a partir do checkout local validado. A proteção de `main` governa a integração por PR; esta automação não cria, troca branch, faz merge ou aguarda o GitHub. O script gera o build, remove somente a `dist/` remota antes de enviar a nova, publica `deploy-version.json` com o SHA local e confirma por HTTP que o cPanel serve esse mesmo SHA. A automação deve registrar a saída `CLAREZA_DEPLOY_COMMIT`; sem essa confirmação, a versão não deve ser considerada publicada. O deploy deve preservar:

- `data.json`, `settings.json`, `incomes.json`, `cash-closings.json` e backups;
- `.htaccess`;
- credenciais e chaves privadas, que nunca podem ser enviadas.

O script deve validar HTTP 200 e comparar os assets remotos por SHA-256. Alterações de schema, migração, foreign key ou persistência MySQL exigem validação remota após o merge; não devem ser consideradas concluídas apenas com o pull request aberto.

### Validação da publicação

Se a ferramenta exibir `deploy-version.json` como `{"type":"Buffer","data":[...]}`, isso é apenas uma serialização da resposta HTTP. A automação deve decodificar os bytes UTF-8 e apresentar o JSON legível, além de comparar o campo `commit` com o SHA do `git rev-parse HEAD` do checkout validado.

## Separação entre publicação e integração

`atualizar online` publica o checkout local diretamente e não faz PR. `atualizar readme main` continua usando branch e PR para alterações de documentação. Essa separação evita bloquear uma publicação operacional por uma regra de proteção da branch.
