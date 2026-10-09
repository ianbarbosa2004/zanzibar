# Prompts técnicos das automações

Este documento versiona o contrato operacional dos prompts configurados nas automações do projeto. A configuração salva da automação é a fonte executável; quando divergir deste documento, deve ser atualizada antes de uma nova execução.

## Regras comuns

As automações são manuais e devem rodar uma por vez. O resultado de uma automação deve ser analisado antes da próxima.

Ao ocorrer erro, exceção, bloqueio, divergência ou comportamento inesperado:

1. interromper e preservar a saída completa;
2. corrigir a causa sem mascarar a falha;
3. executar os testes afetados;
4. incorporar a correção pelo fluxo apropriado;
5. atualizar a documentação afetada;
6. somente então liberar nova tentativa ou próxima automação.

Nunca versionar ou enviar `data.json`, `settings.json`, `incomes.json`, `cash-closings.json`, `limits.json`, backups, `dist/`, `node_modules`, credenciais, chaves privadas ou `.htaccess`.

## `atualizar repo`

Integra o desenvolvimento e mantém uma única versão oficial em `main`. Deve inspecionar o checkout, `origin/main` e o histórico local/remoto; preservar alterações locais seguras; interromper diante de arquivos ambíguos, dados de produção ou segredos; incorporar somente commits relevantes; executar `npm run build`, `npm test`, `node --check app.js`, `node --check server.js` e `git diff --check`; criar PR protegido contra `main`, solicitar merge automático e aguardar a confirmação. Depois do merge, deve confirmar que `origin/main` é a versão oficial. Não executa deploy no cPanel.

Para arquivos estáticos, deve normalizar `/` e `\`, rejeitar caminhos que escapem da raiz pública, incluindo `../package.json` e `..\package.json`, preservar os testes de arquivo existente e de tentativa de escape e não recriar o workflow obsoleto do GitHub Pages. O CRUD de produção permanece no MySQL; JSON, backups, `dist/`, `node_modules`, credenciais, chaves privadas e `.htaccess` ficam fora do fluxo de integração.

## `atualizar readme`

Analisa código, commits, PRs mesclados e o estado do repositório. Atualiza somente os Markdown afetados entre `README.md`, `CONTRIBUTING.md`, `docs/DEPLOYMENT.md`, `docs/CONTINUITY-PROMPT.md`, `docs/AUTOMATIONS.md` e `docs/AUTOMATION-PROMPTS.md`. Deve executar build, testes, verificações de sintaxe e `git diff --check`, criar PR e solicitar merge automático. No Windows, se `npm run build` falhar porque a política de execução bloqueou `npm.ps1`, deve repetir o mesmo comando como `npm.cmd run build` ou por `powershell.exe -NoProfile -ExecutionPolicy Bypass`; deve registrar a ocorrência e o comando alternativo usado, sem tratar o bloqueio do shell como falha do projeto. Não executa nem dispara deploy.

Essa automação não altera código nem publica no cPanel. O checkout
documental segue as regras de branch e PR contra `main`; a publicação direta
é responsabilidade exclusiva de `atualizar online`.

## `atualizar online`

Publica diretamente no cPanel o checkout local validado. Não cria, inspeciona, aguarda ou mescla PR; também não faz pull, push, switch de branch ou reset Git. Executa as validações prévias e somente o script oficial `.github/scripts/deploy.ps1`. A proteção de `main` continua valendo apenas para a integração no GitHub.

Antes do build, deve confirmar que a chave protegida
`~/.ssh/clareza_cpanel_deploy` está carregada no `ssh-agent`. Se `ssh-agent`
estiver parado ou `ssh-add -l` não retornar uma identidade, interromper e
orientar o usuário a executar `Start-Service ssh-agent` e
`ssh-add "$HOME\.ssh\clareza_cpanel_deploy"` em um PowerShell apropriado.
Nunca solicitar, registrar, armazenar ou passar a passphrase por argumento,
variável de ambiente, log ou automação agendada.

O script gera o build local, remove e recria somente `dist/` remoto, substitui o conteúdo de `src/`, `server.js` e os manifestos npm, preserva dados, backups e `.htaccess`, reinstala dependências, reinicia o Passenger, valida HTTP, API, SHA-256 dos assets e `deploy-version.json` e emite `CLAREZA_DEPLOY_COMMIT`. Qualquer falha interrompe o deploy; a correção deve ser incorporada e documentada antes de nova tentativa.

A automação deve considerar que o Passenger pode retornar `503 Service
Unavailable` por alguns segundos após o reinício. O script oficial já repete
as consultas HTTP até cinco vezes, com intervalo de cinco segundos. Não iniciar
uma segunda execução enquanto a primeira ainda estiver validando e não
classificar um `503` isolado como falha definitiva. A confirmação obrigatória é
`CLAREZA_DEPLOY_COMPLETED`; sem esse marcador, preservar a saída e investigar
antes de liberar nova tentativa.

## Relação entre os documentos

- `docs/AUTOMATIONS.md` explica o fluxo e as responsabilidades;
- `docs/AUTOMATION-PROMPTS.md` registra este contrato técnico;
- `docs/DEPLOYMENT.md` detalha a publicação no cPanel;
- `.github/github-app.yml` e a configuração das automações fornecem a execução.
