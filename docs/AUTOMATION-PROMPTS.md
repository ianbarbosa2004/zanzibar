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
Use somente o checkout de desenvolvimento do projeto zanzibar, em branch main,
como fonte local e origin/main como versão oficial. Esta automação serve para
trocar entre dois computadores, recuperar uma sessão ou worktree perdido e
reconstruir o contexto operacional sem perda de informação. Não use worktrees,
cópias, checkouts alternativos ou outro projeto.

Antes de alterar qualquer arquivo, execute e registre:
git remote -v
git branch --show-current
git status --short
git diff --cached
git diff
git log -1 --oneline
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main

Confirme que o remoto aponta para o repositório oficial
ianbarbosa2004/zanzibar e que a branch é main. Classifique toda alteração
staged, não staged e não rastreada. Nunca use git reset --hard, git checkout --,
git clean, git restore, force push ou qualquer comando que apague trabalho.
Não sobrescreva nem remova arquivos locais. Compare o conteúdo local com
origin/main antes de decidir. Se as alterações locais forem seguras, coerentes
com a tarefa e não contiverem segredos ou runtime, elas prevalecem: execute as
validações, incorpore o staged e o não staged seguro, faça commit e push direto
para origin/main. Registre no relatório os arquivos e a decisão. Se a origem,
intenção ou segurança não puder ser confirmada, pare e preserve tudo.

Somente quando o checkout estiver limpo, atualize com `git pull --ff-only
origin main` se HEAD estiver atrás de origin/main. Se houver divergência de
histórico, branch incorreta, remoto incorreto ou falha de rede, pare sem tentar
resolver destrutivamente e explique a ação manual necessária. Se HEAD já
estiver em origin/main, confirme que não há atualização pendente.

Após a sincronização segura, leia integralmente README.md, CONTRIBUTING.md,
docs/CONTINUITY-PROMPT.md, docs/AUTOMATIONS.md, docs/AUTOMATION-PROMPTS.md e
docs/DEPLOYMENT.md. Extraia as regras atuais de arquitetura, validação,
persistência MySQL, deploy, proteção de dados, staged, branch e automações.
Compare a configuração disponível na plataforma com as quatro automações
oficiais: sincronizar desenvolvimento, atualizar readme, atualizar
repositorio e publicar online. Confira nome, projeto zanzibar, ambiente local,
modo autopilot, workspace branch, intervalo manual, uso exclusivo de main e
conteúdo do prompt. A automação com prefixo DESATIVADA - deve continuar
excluída e nunca ser executada.

Se uma automação oficial estiver ausente e a plataforma fornecer uma operação
segura para recriá-la, recrie somente a ausente usando os prompts versionados
em docs/AUTOMATION-PROMPTS.md, sem duplicar automações existentes. Se não for
possível recriar pela execução atual, produza uma lista precisa com nome,
parâmetros e prompt que devem ser recriados manualmente. Nunca altere, exclua
ou renomeie uma automação existente sem confirmação explícita.

Verifique package.json, arquivos de configuração do Vite/Node e a presença de
dependências instaladas. Não instale nada sem necessidade; se node_modules
estiver ausente, execute npm.cmd install somente quando isso for indispensável
para validar o projeto. Execute npm.cmd run build, npm.cmd test, node --check
app.js, node --check server.js e git diff --check quando o checkout estiver
íntegro. A sincronização pode fazer commit e push direto somente das alterações
locais seguras previamente analisadas; não cria PR, não faz merge e não faz
deploy. Não altere data.json,
settings.json, outros arquivos de runtime, snapshots, backups, dist,
node_modules, credenciais, chaves privadas ou .htaccess. Finalize com um
relatório contendo SHA local, SHA de origin/main, arquivos preservados,
divergências encontradas, automações conferidas/recriadas e validações
executadas.
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
