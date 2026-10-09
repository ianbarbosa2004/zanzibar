# Automações do projeto

## Regra de branch

As automações devem rodar uma por vez. A automação `atualizar online` é diferente: ela publica diretamente o checkout local validado, sem criar ou aguardar PR. O usuário deve executá-la quando quiser publicar as alterações locais. Ela nunca deve apagar ou sobrescrever arquivos de dados de produção, incluindo os JSON de runtime `data.json`, `settings.json`, `incomes.json`, `cash-closings.json`, `monthly-cash-closings.json` e `limits.json`.

Quando uma implementação envolver schema, migração, foreign key ou persistência MySQL, a automação deve sinalizar a necessidade de publicação e validação remota pelo script oficial antes de considerar a tarefa concluída. O deploy não é executado por esta rotina de documentação. Se a publicação falhar, deve parar e informar o bloqueio exato; não deve repetir ou declarar sucesso automaticamente.

As automações também devem verificar a consistência visual das escritas: formulários de despesas, receitas, fechamentos, limites e cadastros auxiliares só podem confirmar o sucesso depois do endpoint CRUD específico retornar sucesso; em caso de falha, o estado anterior deve ser restaurado. A verificação inclui inclusão, edição, exclusão, ordenação e ativação ou desativação.

Fechamentos diários são operações por data: a gravação substitui os itens da data e atualiza a receita técnica **Vendas** na mesma transação. Fechamentos mensais permanecem independentes. Alterações nesses fluxos devem verificar também a leitura inicial de receitas antigas sem origem, o recálculo de faturamento e a edição por `id` ou `client_id`.

O contrato técnico versionado dos prompts está em [`docs/AUTOMATION-PROMPTS.md`](AUTOMATION-PROMPTS.md). A configuração executável da automação deve permanecer coerente com esse documento.

## `atualizar repo`

Integra alterações de código, testes, configuração e documentação por pull request protegido contra `main`. Deve analisar o checkout e o histórico local/remoto, incorporar somente arquivos seguros, executar as validações obrigatórias, aguardar o merge e confirmar que `origin/main` é a versão oficial. Não executa deploy no cPanel.

## `atualizar readme desenvolvimento`

Automação manual do projeto `zanzibar`. Trabalha diretamente no checkout de desenvolvimento em `main`, analisa as implementações recentes e atualiza:

- `README.md`
- `CONTRIBUTING.md`
- `docs/DEPLOYMENT.md`
- `docs/CONTINUITY-PROMPT.md`
- `docs/AUTOMATIONS.md`
- `docs/AUTOMATION-PROMPTS.md`

Executa `npm.cmd run build`, `npm.cmd test`, `node --check app.js`, `node --check server.js` e `git diff --check`. Analisa o checkout de desenvolvimento em `main` como fonte única, não usa worktree ou cópia alternativa e só cria commit quando houver mudança documental real. O commit usa o trailer `Co-authored-by` exigido e é enviado diretamente com `git push origin main`; não usa force push, não exclui a branch, não cria PR, não faz merge e não executa deploy.

## `atualizar online`

Automação manual do projeto `zanzibar`. Publica diretamente o checkout local, sem criar PR, trocar branch, fazer merge ou aguardar o GitHub. O PR fica reservado à integração do código no repositório; esta automação é somente o caminho operacional do cPanel.

O deploy via SFTP deve:

- verificar a chave protegida no `ssh-agent` antes do build e interromper com instrução clara quando ela não estiver carregada;
- preservar `data.json`, `settings.json`, `incomes.json`, `cash-closings.json`, `monthly-cash-closings.json` e `limits.json`;
- criar backups remotos dos dados existentes;
- preservar `.htaccess`;
- substituir `dist/`, `server.js`, `src/` e os manifestos npm;
- reinstalar dependências e reiniciar o Passenger;
- validar HTTP 200 e conferir os assets publicados por SHA-256;
- nunca enviar credenciais ou chaves privadas.

A passphrase da chave nunca pode ser salva em arquivo, variável de ambiente,
argumento, log ou tarefa agendada. O usuário deve carregá-la manualmente com
`ssh-add` quando necessário; o script oficial não deve tentar contornar essa
proteção.

As validações locais continuam sendo `npm.cmd run build`, `npm.cmd test`, `node --check app.js`, `node --check server.js` e `git diff --check`. O deploy deve ser executado a partir do checkout local validado. Esta automação não cria, troca branch, faz merge ou aguarda o GitHub. O script gera o build, remove somente a `dist/` remota antes de enviar a nova, publica `deploy-version.json` com o SHA local e confirma por HTTP que o cPanel serve esse mesmo SHA. A automação deve registrar a saída `CLAREZA_DEPLOY_COMMIT`; sem essa confirmação, a versão não deve ser considerada publicada. O deploy deve preservar:

- `data.json`, `settings.json`, `incomes.json`, `cash-closings.json`, `monthly-cash-closings.json`, `limits.json` e backups;
- `.htaccess`;
- credenciais e chaves privadas, que nunca podem ser enviadas.

O script deve validar HTTP 200 e comparar os assets remotos por SHA-256. Alterações de schema, migração, foreign key ou persistência MySQL exigem validação remota após o merge; não devem ser consideradas concluídas apenas com o pull request aberto.

### Validação da publicação

Se a ferramenta exibir `deploy-version.json` como `{"type":"Buffer","data":[...]}`, isso é apenas uma serialização da resposta HTTP. A automação deve decodificar os bytes UTF-8 e apresentar o JSON legível, além de comparar o campo `commit` com o SHA do `git rev-parse HEAD` do checkout validado.

Durante a reinicialização do Passenger, a automação pode receber
temporariamente `503 Service Unavailable` na etapa de validação. O script
oficial repete as consultas da página, da API e de `deploy-version.json` até
cinco vezes, aguardando cinco segundos entre as tentativas. Uma resposta `503`
isolada não deve ser tratada como falha definitiva nem deve iniciar outro
deploy em paralelo. A publicação somente é confirmada quando a saída contém
`CLAREZA_DEPLOY_COMPLETED`; se todas as tentativas falharem, preservar a saída
completa e investigar a disponibilidade do Passenger antes de uma nova
execução.

## Separação entre publicação e integração

`atualizar online` publica o checkout local diretamente e não faz PR. `atualizar readme` continua usando branch e PR para alterações de documentação. Essa separação evita bloquear uma publicação operacional por uma regra de proteção da branch.
