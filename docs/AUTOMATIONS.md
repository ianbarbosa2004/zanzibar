# Automações do projeto

Este documento descreve a configuração canônica das automações do Clareza.
As automações são manuais, executam uma por vez e usam somente o projeto
`zanzibar` no checkout de desenvolvimento. A configuração executável deve
permanecer coerente com este documento e com o contrato em
[`AUTOMATION-PROMPTS.md`](AUTOMATION-PROMPTS.md).

## Configuração canônica

| Nome | Modo | Workspace | Fonte | Responsabilidade |
| --- | --- | --- | --- | --- |
| `sincronizar desenvolvimento` | `autopilot` | `branch` | `main` | Alinhar o checkout local com `origin/main`, recuperar contexto e auditar continuidade |
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
- classificar todo staged antes de validar: incorporar somente arquivos
  seguros pertencentes à alteração atual, preservando o conteúdo; retirar do
  escopo arquivos de runtime, segredos, `dist/`, `node_modules/` e
  `.htaccess`; interromper se a origem ou a intenção forem ambíguas;
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

É a primeira automação a executar ao trocar de computador, recuperar uma
sessão/worktree perdida ou suspeitar que o checkout local está desatualizado.
Ela consulta `origin/main`, verifica a identidade do repositório, branch,
remoto e estado do índice, e só aplica uma atualização fast-forward quando não
há alterações locais ambíguas. Nunca sobrescreve, reseta ou remove arquivos
locais. Alterações locais seguras devem ser preservadas e alterações
staged/não staged que possam ser trabalho do usuário interrompem a
sincronização para análise explícita.

Depois de alinhar o código, ela lê `README.md`, `CONTRIBUTING.md`,
`docs/CONTINUITY-PROMPT.md`, `docs/AUTOMATIONS.md`,
`docs/AUTOMATION-PROMPTS.md` e a documentação de deploy, verifica a presença
das quatro automações oficiais e compara seus nomes, projeto, modo, workspace,
intervalo e prompts com o contrato versionado. Se a plataforma permitir
recriação no contexto da execução, deve recriar somente automações ausentes
com esses parâmetros; caso contrário, deve produzir um relatório preciso para
recriação manual, sem criar duplicatas. Ela também instala dependências apenas
se necessário, valida o projeto e registra divergências que exigem decisão.

Essa automação não faz commit, push, PR, merge ou deploy. A atualização de
`main` é feita apenas quando o checkout está seguro e por `git pull --ff-only`;
a publicação online continua exigindo autorização explícita.

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

1. `sincronizar desenvolvimento`, ao iniciar em outra máquina ou após perda
   de sessão/worktree;
2. `atualizar readme`, se houver documentação a atualizar;
3. `atualizar repositorio`, para enviar alterações a `main`;
4. `publicar online`, somente após autorização explícita.

O resultado de uma automação deve ser analisado antes da próxima. Mudanças de
schema, migração, foreign key ou persistência MySQL exigem validação remota
após o deploy autorizado; não existe disparo automático de deploy.
