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

Em ambiente local, deixe `remote_branch` vazio. A plataforma rejeita esse
campo para esse tipo de ambiente; o prompt é que determina o uso de `main`.
Os IDs do projeto e das automações são específicos de cada computador.

## `atualizar readme desenvolvimento`

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
origin/main. Não crie PR, não faça merge e não faça deploy.
```

## `atualizar repositorio desenvolvimento`

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
atualizado. Não crie PR, não faça merge e não faça deploy.
```

## `publicar online desenvolvimento`

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
dos assets. Não crie PR nem faça merge.
```

## Regras de execução

As automações são manuais e devem rodar uma por vez. Em qualquer falha,
divergência ou comportamento inesperado, interrompa, preserve a saída,
corrija a causa, atualize a documentação afetada e só então libere nova
tentativa. Não automatize a passphrase da chave SSH. Não faça deploy por
inferência: a publicação exige solicitação explícita do usuário.
