# Automações do projeto

Este documento descreve a configuração canônica das automações do Clareza.
As automações são manuais, executam uma por vez e usam somente o projeto
`zanzibar` no checkout de desenvolvimento. A configuração executável deve
permanecer coerente com este documento e com o contrato em
[`AUTOMATION-PROMPTS.md`](AUTOMATION-PROMPTS.md).

## Configuração canônica

| Nome | Modo | Workspace | Fonte | Responsabilidade |
| --- | --- | --- | --- | --- |
| `sincronizar desenvolvimento` | `autopilot` | `branch` | `main` | Fechar o trabalho neste computador ou retomar o trabalho em outro |
| `atualizar readme` | `autopilot` | `branch` | `main` | Atualizar Markdown afetado e enviar diretamente para `main` |
| `atualizar repositorio` | `autopilot` | `branch` | `main` | Integrar código, testes, configuração e documentação diretamente em `main` |
| `publicar online` | `autopilot` | `branch` | `main` | Publicar no cPanel, sem PR ou merge |

Todas são do projeto `zanzibar`, têm intervalo `manual`, ambiente local e
devem operar no checkout de desenvolvimento. Para preservar a fonte única,
não use `worktree`, cópia temporária, checkout alternativo ou outro projeto.
Em ambiente local, não configure `remote_branch`: a plataforma rejeita esse
campo; a instrução de usar `main` permanece no prompt da automação.
O push direto é permitido apenas para `main`; nunca use `git push --force`,
`--force-with-lease` ou exclusão da branch.

Os IDs atuais nesta máquina são apenas referências e não devem ser copiados
como identidade em outro computador:

```text
atualizar readme                      44b14191-be48-4dae-ae7a-e1eb6f724ad4
atualizar repositorio                 969bb8c6-f0ea-4a36-9b0e-3a63013e49e0
publicar online                       04efbea0-6c86-41b6-aeb2-40a8af6d2afb
DESATIVADA - atualizar readme         f7019883-139f-4da0-9a81-86b4d1ac8209
```

Ao configurar outro computador, crie as automações pelos nomes e parâmetros
da tabela, usando os prompts versionados em
[`AUTOMATION-PROMPTS.md`](AUTOMATION-PROMPTS.md). O `projectId` e os IDs das
execuções podem ser diferentes; o comportamento e o texto dos prompts não.

## Migração de automações antigas

`DESATIVADA - atualizar readme` não faz parte da configuração canônica. Ela é
uma duplicata antiga da automação de documentação e deve ser excluída no
painel. Não execute essa automação. O prefixo `DESATIVADA -` é uma marcação
visual para facilitar a identificação até a exclusão manual. Use somente as
quatro automações sem esse prefixo.

## Regras comuns

As automações devem:

- preservar `data.json`, `settings.json`, `incomes.json`,
  `cash-closings.json`, `monthly-cash-closings.json`, `limits.json`,
  snapshots, backups, `dist/`, `node_modules/`, credenciais, chaves privadas
  e `.htaccess`;
- iniciar com `git status --short`, `git diff --cached` e `git diff`, para
  identificar alterações staged ou não staged deixadas por uma execução
  anterior;
- tratar o checkout local como fonte prioritária: classificar staged, não
  staged e não rastreados antes de consultar ou aplicar o remoto; incorporar
  alterações locais seguras, inclusive staged deixado por outra sessão,
  preservando seu conteúdo; retirar do escopo arquivos de runtime, segredos,
  `dist/`, `node_modules/` e `.htaccess`; interromper se a origem ou a
  intenção forem ambíguas;
- executar as validações previstas no prompt antes de declarar sucesso;
- interromper em caso de erro, divergência, segredo ou arquivo de runtime
  inesperado, preservando a saída completa;
- atualizar a documentação quando uma mudança alterar o contrato operacional;
- não criar PR vazio nem executar push destrutivo.

As automações nunca devem usar `git reset --hard`, `git checkout --`, `git
clean` ou qualquer comando para apagar silenciosamente trabalho staged ou não
staged. O índice só pode ser considerado resolvido quando não houver arquivos
staged inesperados e o commit/push correspondente tiver sido concluído. A
automação online não altera o índice: se ainda houver staged após as etapas de
integração, deve parar antes do deploy e informar os arquivos pendentes.

Alterações visuais, correções de código e mudanças de documentação não geram
deploy automaticamente. PR, merge e deploy dependem de solicitação explícita
do usuário, respeitando a responsabilidade de cada automação abaixo.

## `sincronizar desenvolvimento`

Esta é uma automação de **duas operações simples**, executada manualmente.
Ela não revisa documentação nem recria automações durante a sincronização.

**Para interromper o trabalho neste computador:** execute-a enquanto houver
alterações do desenvolvimento. Ela verifica os arquivos, executa build/testes,
faz um commit de checkpoint com o trailer padrão e executa
`git push origin main`. Ao terminar, informa o SHA que o outro computador deve
usar. Arquivos de runtime, segredos, `dist/`, `node_modules/` e `.htaccess`
nunca entram no checkpoint.

**Para continuar o trabalho em outro computador:** execute-a com o checkout
limpo. Ela verifica remoto e branch, executa `git fetch origin main` e usa
somente `git pull --ff-only origin main` quando o computador local estiver
atrás. Depois roda as validações e informa o SHA sincronizado. Se houver
qualquer alteração local, ela não faz pull nem sobrescreve arquivos: informa
os caminhos para que o usuário execute primeiro a operação de interrupção.

Ela nunca usa `reset --hard`, `checkout --`, `restore`, `clean`, force push,
PR, merge ou deploy. As quatro automações oficiais e seus prompts são
mantidos pela documentação versionada e recriados separadamente quando
necessário.

## `atualizar readme`

Analisa as implementações recentes, commits, PRs mesclados e o estado do
repositório. Atualiza somente os Markdown afetados, principalmente
`README.md`, `CONTRIBUTING.md` e `docs/*.md`. Executa build, testes,
verificações de sintaxe e `git diff --check`. Quando houver documentação real,
cria commit com o trailer exigido e faz push direto para `origin/main`.
Não cria PR, não faz merge e não executa deploy.

## `atualizar repositorio`

Analisa o checkout e o histórico, integra somente alterações pertencentes ao
projeto e executa as validações obrigatórias. Quando houver mudanças reais,
cria commit com o trailer exigido e faz push direto para `origin/main`.
Confirma que `origin/main` é a versão oficial. Não cria PR, não faz merge e
não executa deploy.

## `publicar online`

Publica somente o estado validado de `main` usando o script oficial
`.github/scripts/deploy.ps1`. Não cria PR, não faz merge, não troca branch e
não usa arquivos de outro checkout. Deve validar `CLAREZA_DEPLOY_COMPLETED`,
HTTP 200, API, `deploy-version.json` e os hashes dos assets. O deploy
preserva dados MySQL, arquivos de runtime, backups e `.htaccess`; nunca envia
credenciais, chaves privadas ou `node_modules`.

## Ordem operacional

Quando o usuário solicitar integração e publicação, a ordem é:

1. `sincronizar desenvolvimento`, para fechar o trabalho atual ou retomá-lo
   em outro computador;
2. `atualizar readme`, se houver documentação a atualizar;
3. `atualizar repositorio`, para enviar alterações a `main`;
4. `publicar online`, somente após autorização explícita.

O resultado de uma automação deve ser analisado antes da próxima. Mudanças de
schema, migração, foreign key ou persistência MySQL exigem validação remota
após o deploy autorizado; não existe disparo automático de deploy.
