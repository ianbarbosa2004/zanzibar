# Prompts técnicos das automações

Este arquivo é o contrato versionado dos prompts da configuração canônica
descrita em [`AUTOMATIONS.md`](AUTOMATIONS.md). Ao recriar as automações em
outro computador, copie os prompts abaixo sem trocar a fonte de arquivos.
A configuração salva na plataforma é executável; se divergir deste contrato,
corrija a configuração antes da próxima execução.

## Parâmetros comuns

- Projeto: `zanzibar`
- Ambiente: local
- Intervalo: `manual`
- Modo: `autopilot`
- Workspace: `branch`
- Branch operacional: `main`
- Fonte: somente o checkout de desenvolvimento
- Proibido: `worktree`, cópia, checkout alternativo e outro projeto
- Push: somente `git push origin main`, nunca force push ou exclusão da branch

Em ambiente local, deixe `remote_branch` vazio. A plataforma rejeita esse
campo para esse tipo de ambiente; o prompt é que determina o uso de `main`.
Os IDs do projeto e das automações são específicos de cada computador.

Antes de qualquer build, teste, commit, push ou deploy, execute `git status
--short`, `git diff --cached` e `git diff`. O checkout local é a fonte
prioritária: classifique e preserve primeiro todo staged, não staged e não
rastreado. Incorpore alterações locais seguras pertencentes ao projeto,
inclusive staged deixado por outra sessão, sem substituir seu conteúdo por
uma cópia remota. Não inclua runtime, snapshots, backups, `dist/`,
`node_modules/`, credenciais, chaves privadas ou `.htaccess`. Se a origem,
intenção ou segurança de qualquer arquivo for ambígua, pare e informe o
caminho exato. Nunca use `git reset --hard`, `git checkout --`, `git clean`
ou equivalente para apagar alterações.

## `sincronizar desenvolvimento`

```text
Use somente o checkout local do projeto zanzibar, na branch main. Esta
automação tem duas operações e deve escolher uma pelo estado do checkout.

OPERAÇÃO 1 — FECHAR TRABALHO NESTE COMPUTADOR
Se houver arquivos staged, não staged ou novos que pertençam ao
desenvolvimento, trate o checkout local como a versão a preservar. Execute
git status --short, git diff --cached, git diff e git diff --check. Não inclua
data.json, settings.json, incomes.json, cash-closings.json,
monthly-cash-closings.json, limits.json, snapshots, backups, dist,
node_modules, credenciais, chaves privadas ou .htaccess. Se houver dúvida
sobre qualquer arquivo, pare e informe o caminho. Caso esteja seguro, execute
npm.cmd run build, npm.cmd test, node --check app.js e node --check server.js.
Faça um commit de checkpoint com
Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com> e
execute somente git push origin main. Informe o SHA publicado. Não faça PR,
merge, deploy ou force push.

OPERAÇÃO 2 — CONTINUAR TRABALHO EM OUTRO COMPUTADOR
Se o checkout estiver limpo, confirme git remote -v, git branch --show-current
e o remoto ianbarbosa2004/zanzibar. Execute git fetch origin main, compare
git rev-parse HEAD com git rev-parse origin/main e, se estiver atrás, execute
somente git pull --ff-only origin main. Depois execute npm.cmd run build,
npm.cmd test, node --check app.js, node --check server.js e git diff --check.
Após o pull (ou após confirmar que HEAD já está atualizado), leia integralmente
README.md, CONTRIBUTING.md, docs/CONTINUITY-PROMPT.md, docs/AUTOMATIONS.md,
docs/AUTOMATION-PROMPTS.md e docs/DEPLOYMENT.md. Extraia as diretrizes,
restrições, prompts, decisões de arquitetura e procedimentos recém baixados e
assuma esse conteúdo como o contexto operacional vigente desta sessão/worktree.
Se houver mudança de diretriz, obedeça à versão baixada a partir desse ponto e
registre no relatório quais regras foram incorporadas. Não edite, reescreva,
reformate, reverta ou faça commit desses Markdown durante esta automação:
incorporar o conteúdo é uma leitura operacional, não a tarefa de atualizar
readme. Informe o SHA sincronizado. Se houver qualquer alteração local, não
faça pull nem leia uma versão remota por cima: informe os caminhos e instrua o
usuário a executar primeiro a operação 1.
Se houver divergência de histórico, branch incorreta, remoto incorreto ou
falha de rede, pare sem resolver destrutivamente.

Em ambas as operações nunca use git reset --hard, git checkout --, git restore,
git clean, force push, PR, merge ou deploy. A leitura dos Markdown ocorre
somente depois de o estado seguro ser confirmado; ela serve para incorporar
diretrizes, não para decidir a operação nem para alterar a documentação. A
conferência ou recriação das quatro automações é uma tarefa separada e usa
este arquivo como contrato.
```

## `atualizar readme`

```text
Use somente o checkout de desenvolvimento do projeto zanzibar, em branch main,
como fonte única dos arquivos. Não use worktrees, cópias ou checkouts
alternativos. Analise as implementações recentes, commits, PRs mesclados e o
estado do repositório. Atualize os arquivos Markdown afetados (README.md,
CONTRIBUTING.md e docs/*.md relacionados) com as atualizações, melhorias e
diretrizes reais do sistema. Não faça um PR vazio: só crie commit se houver
mudanças documentais reais. Preserve dados, backups, dist, node_modules,
credenciais, chaves privadas e .htaccess. Execute npm.cmd run build, npm.cmd
test, node --check app.js, node --check server.js e git diff --check. Quando
houver mudanças, faça commit com Co-authored-by: Copilot App
<223556219+Copilot@users.noreply.github.com> e faça push direto para
origin/main. Não use force push nem exclua a branch. Não crie PR, não faça
merge e não faça deploy.
```

Antes do commit, confirme que não restam staged inesperados. Alterações
seguras da própria documentação deixadas por execução anterior devem ser
incorporadas no mesmo commit, nunca descartadas silenciosamente.

## `atualizar repositorio`

```text
Use somente o checkout de desenvolvimento do projeto zanzibar, em branch main,
como fonte única dos arquivos. Não use worktrees, cópias ou checkouts
alternativos. Integre no repositório apenas as alterações de desenvolvimento
pertencentes ao projeto, preservando runtime, dados, backups, dist,
node_modules, credenciais, chaves privadas e .htaccess. Execute npm.cmd run
build, npm.cmd test, node --check app.js, node --check server.js e git
diff --check. Quando houver mudanças reais, faça commit com
Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com> e faça
push direto para origin/main. Se não houver mudanças, informe que main já está
atualizado. Não use force push nem exclua a branch. Não crie PR, não faça
merge e não faça deploy.
```

Antes do commit, confirme que não restam staged inesperados. Alterações
seguras do próprio desenvolvimento deixadas por execução anterior devem ser
incorporadas no commit, nunca descartadas silenciosamente.

## `publicar online`

```text
Use somente o checkout de desenvolvimento do projeto zanzibar, em branch main,
como fonte única dos arquivos. Não use worktrees, cópias ou checkouts
alternativos. Publique no cPanel apenas o estado validado de main, depois da
integração do repositório e da documentação. Execute npm.cmd test, node
--check app.js, node --check server.js e depois somente
powershell.exe -NoProfile -ExecutionPolicy Bypass -File
.github\scripts\deploy.ps1. Preserve dados, backups e .htaccess; nunca envie
credenciais, chaves privadas, JSON de runtime ou node_modules. Emita e valide
CLAREZA_DEPLOY_COMPLETED, HTTP 200, a API, deploy-version.json e os hashes
dos assets. Não crie PR nem faça merge. Antes do deploy, confirme que o
checkout de `main` e o índice estão limpos; se houver staged ou não staged
pendente, pare sem publicar e informe os arquivos.
```

## Regras de execução

As automações são manuais e devem rodar uma por vez. Em qualquer falha,
divergência ou comportamento inesperado, interrompa, preserve a saída,
corrija a causa, atualize a documentação afetada e só então libere nova
tentativa. Não automatize a passphrase da chave SSH. Não faça deploy por
inferência: a publicação exige solicitação explícita do usuário.
