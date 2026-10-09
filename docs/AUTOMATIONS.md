# Automações do projeto

Este documento descreve a configuração canônica das automações do Clareza.
As automações são manuais, executam uma por vez e usam somente o projeto
`zanzibar` no checkout de desenvolvimento. A configuração executável deve
permanecer coerente com este documento e com o contrato em
[`AUTOMATION-PROMPTS.md`](AUTOMATION-PROMPTS.md).

## Configuração canônica

| Nome | Modo | Workspace | Fonte | Responsabilidade |
| --- | --- | --- | --- | --- |
| `atualizar readme desenvolvimento` | `autopilot` | `branch` | `main` | Atualizar Markdown afetado e enviar diretamente para `main` |
| `atualizar repositorio desenvolvimento` | `autopilot` | `branch` | `main` | Integrar código, testes, configuração e documentação diretamente em `main` |
| `publicar online desenvolvimento` | `autopilot` | `branch` | `main` | Publicar no cPanel, sem PR ou merge |

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
atualizar readme desenvolvimento       f7019883-139f-4da0-9a81-86b4d1ac8209
atualizar repositorio desenvolvimento  969bb8c6-f0ea-4a36-9b0e-3a63013e49e0
publicar online desenvolvimento        04efbea0-6c86-41b6-aeb2-40a8af6d2afb
```

Ao configurar outro computador, crie as automações pelos nomes e parâmetros
da tabela, usando os prompts versionados em
[`AUTOMATION-PROMPTS.md`](AUTOMATION-PROMPTS.md). O `projectId` e os IDs das
execuções podem ser diferentes; o comportamento e o texto dos prompts não.

## Migração de automações antigas

As automações antigas abaixo não fazem parte da configuração canônica:

- `atualizar readme corrigido`;
- `atualizar repo corrigido`;
- `atualizar online corrigido`.

Elas foram criadas como `worktree` e podem usar uma cópia sem as dependências
do desenvolvimento. Não as execute. Renomeá-las com o prefixo
`DESATIVADA -` é somente uma identificação visual; confirme no painel de
automações que estão desabilitadas. Se a plataforma não aceitar a alteração
de `enabled` ou não permitir removê-las, mantenha-as sem execução e use apenas
as três automações canônicas.

## Regras comuns

As automações devem:

- preservar `data.json`, `settings.json`, `incomes.json`,
  `cash-closings.json`, `monthly-cash-closings.json`, `limits.json`,
  snapshots, backups, `dist/`, `node_modules/`, credenciais, chaves privadas
  e `.htaccess`;
- executar as validações previstas no prompt antes de declarar sucesso;
- interromper em caso de erro, divergência, segredo ou arquivo de runtime
  inesperado, preservando a saída completa;
- atualizar a documentação quando uma mudança alterar o contrato operacional;
- não criar PR vazio nem executar push destrutivo.

Alterações visuais, correções de código e mudanças de documentação não geram
deploy automaticamente. PR, merge e deploy dependem de solicitação explícita
do usuário, respeitando a responsabilidade de cada automação abaixo.

## `atualizar readme desenvolvimento`

Analisa as implementações recentes, commits, PRs mesclados e o estado do
repositório. Atualiza somente os Markdown afetados, principalmente
`README.md`, `CONTRIBUTING.md` e `docs/*.md`. Executa build, testes,
verificações de sintaxe e `git diff --check`. Quando houver documentação real,
cria commit com o trailer exigido e faz push direto para `origin/main`.
Não cria PR, não faz merge e não executa deploy.

## `atualizar repositorio desenvolvimento`

Analisa o checkout e o histórico, integra somente alterações pertencentes ao
projeto e executa as validações obrigatórias. Quando houver mudanças reais,
cria commit com o trailer exigido e faz push direto para `origin/main`.
Confirma que `origin/main` é a versão oficial. Não cria PR, não faz merge e
não executa deploy.

## `publicar online desenvolvimento`

Publica somente o estado validado de `main` usando o script oficial
`.github/scripts/deploy.ps1`. Não cria PR, não faz merge, não troca branch e
não usa arquivos de outro checkout. Deve validar `CLAREZA_DEPLOY_COMPLETED`,
HTTP 200, API, `deploy-version.json` e os hashes dos assets. O deploy
preserva dados MySQL, arquivos de runtime, backups e `.htaccess`; nunca envia
credenciais, chaves privadas ou `node_modules`.

## Ordem operacional

Quando o usuário solicitar integração e publicação, a ordem é:

1. `atualizar readme desenvolvimento`, se houver documentação a atualizar;
2. `atualizar repositorio desenvolvimento`, para enviar alterações a `main`;
3. `publicar online desenvolvimento`, somente após autorização explícita.

O resultado de uma automação deve ser analisado antes da próxima. Mudanças de
schema, migração, foreign key ou persistência MySQL exigem validação remota
após o deploy autorizado; não existe disparo automático de deploy.
