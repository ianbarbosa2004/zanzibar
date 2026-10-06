# Automações do projeto

## Regra de branch

As duas automações utilizam diretamente a branch `main`. Antes de trabalhar, devem fazer `fetch` e `pull --ff-only origin main`. Elas não devem criar, usar ou publicar em branches separadas.

Quando uma implementação envolver schema, migração, foreign key ou persistência MySQL, a automação deve obrigatoriamente executar o deploy oficial e validar a hospedagem/banco antes de considerar a tarefa concluída.

As automações também devem verificar a consistência visual das escritas: formulários de despesas, receitas e cadastros auxiliares só podem confirmar o sucesso depois do `PUT /api/data`; em caso de falha, o estado anterior deve ser restaurado. A verificação inclui inclusão, edição, exclusão, ordenação e ativação ou desativação.

## `atualizar readme main`

Automação manual do projeto `zanzibar`. Trabalha diretamente em `main`, analisa as implementações recentes e atualiza:

- `README.md`
- `CONTRIBUTING.md`
- `docs/DEPLOYMENT.md`
- `docs/CONTINUITY-PROMPT.md`

Antes de publicar, executa `npm test`, `npm run build`, `node --check app.js`, `node --check server.js` e `git diff --check`. Se a alteração envolver MySQL, deve executar também `.github/scripts/deploy.ps1` e validar a hospedagem/banco. Não deve incluir credenciais, chaves privadas, dados de produção, JSON de runtime, `dist/` ou `node_modules/`.

### Teste realizado

- Execução: `d7917be5-de6d-468a-bed5-2d1a663dcd25`
- Resultado: concluída
- Commit gerado: `b292620` (`docs: alinhar documentação ao fluxo atual`)
- Branch: `main` (regra atual; o teste original usou uma branch separada antes desta correção)
- Validações: concluídas pela automação

## `atualizar online main`

Automação manual do projeto `zanzibar`. Trabalha diretamente em `main`, executa as validações locais e publica somente pelo `.github/scripts/deploy.ps1`.

O deploy via SFTP deve:

- preservar `data.json`, `settings.json`, `incomes.json` e `cash-closings.json`;
- criar backups remotos dos dados existentes;
- preservar `.htaccess`;
- substituir `dist/`, `server.js`, `src/` e os manifestos npm;
- reinstalar dependências e reiniciar o Passenger;
- validar HTTP 200 e conferir os assets publicados por SHA-256;
- nunca enviar credenciais ou chaves privadas.

### Teste realizado

- Execução: `24591c94-661a-411a-93be-35d0c9c9a708`
- Resultado: concluída
- Branch de execução do teste original: `ianbarbosa2004-atualizar-clareza`
- Validação posterior: `https://itsites.com.br/clareza/` e `/clareza/api/data` retornaram HTTP 200.
- Os hashes SHA-256 dos assets locais e remotos foram iguais:
  - `assets/index-Cw99lKRh.css`
  - `assets/index-O30-vBSe.js`

## Observação de manutenção

A execução original ocorreu a partir de `main`, mas foi materializada em uma branch de workspace separada e usou a versão anterior do script de deploy. As automações corrigidas (`atualizar readme main` e `atualizar online main`) usam `workspace_type: branch` e trabalham diretamente em `main`. As automações antigas devem ser consideradas legadas e não devem ser executadas.
