# Clareza

Aplicação web para organização financeira pessoal e empresarial. O sistema registra despesas e receitas, calcula o saldo mensal, permite administrar cadastros auxiliares e persiste os dados diretamente em MySQL. Arquivos JSON são somente leitura/fallback de desenvolvimento; nunca são destino de CRUD quando o MySQL está configurado.

## Funcionalidades

- Registro, edição, busca, filtros e paginação de despesas.
- Registro e edição de receitas com fonte e data.
- Importação em lote de despesas e receitas por CSV, com pré-visualização e validação por linha.
- Slugs técnicos, sem acentos, para identificar cadastros auxiliares sem substituir os nomes exibidos.
- Saldo mensal calculado como receitas menos despesas.
- Resumo do mês em três colunas, com Vendas e cada outra fonte de receita
  detalhadas separadamente, despesas Casa/Zanzibar/Empréstimos empilhadas e
  saldo destacado.
- Módulo **Buffet** separado, com entradas, saídas, observações, cartões de
  receitas/despesas/saldo e fechamentos diário e mensal por período.
- Categorias, tomadores, locais, credores e fontes de receita.
- Interface organizada por resumo, movimentações, vendas, relatórios e cadastros, incluindo a área de Empréstimos.
- Menu **Análise IA** para indicadores financeiros, comparações, histórico e perguntas assistidas, sem mutações automáticas.
- Mensagens privadas entre usuários autorizados, com anexos protegidos e integração opcional com Telegram.
- Ambiente de **Tarefas** organizado por dia: novas tarefas ficam em aberto e,
  ao marcar uma tarefa, ela é arquivada no arquivo do próprio dia; os botões
  de dia anterior e próximo dia permitem navegar sem editar a data manualmente.
- Visualizador autenticado de Markdown dentro do menu **Ferramentas**, usando
  os documentos versionados do próprio checkout.
- Limites e metas mensais com meta, orçamento, previsão, patamar, resultado e status de fechamento.
- Persistência MySQL com migração da estrutura legada de receitas.
- Leitura de fallback JSON para desenvolvimento local, sem gravação CRUD quando o MySQL está indisponível.
- Interface compilada pelo Vite e servida pelo Node.js.
- Autenticação OAuth do Google com sessões HttpOnly e autorização administrativa.
- Menu de conta autenticada com nome, e-mail e foto oficial do perfil Google,
  além das ações de gerenciamento da conta e saída.
- Exportação em CSV de receitas, despesas por área, empréstimos e fechamentos
  diários ou mensais, usando os nomes exibidos na interface.
- Assets do frontend versionados pelo hash do Vite; o HTML é revalidado a cada
  acesso para disponibilizar atualizações sem limpeza manual do cache.

## Stack

- Node.js com módulos ES.
- JavaScript no frontend, sem framework de UI.
- Vite para build.
- MySQL via `mysql2`.
- Chart.js, Lucide e Open Props para interface e visualizações.
- CloudLinux Passenger/Application Manager no cPanel.

## Requisitos

- Node.js 22 ou compatível com a versão do projeto.
- npm.
- MySQL opcional para desenvolvimento local e necessário para persistência de produção.

## Instalação e desenvolvimento

```bash
npm install
npm run dev
```

Por padrão, o servidor escuta na porta `4173` e usa o caminho base `/clareza`:

```text
http://localhost:4173/clareza/
```

É possível alterar a porta e o caminho:

```bash
PORT=4174 CLAREZA_BASE_PATH=/clareza npm run dev
```

No PowerShell:

```powershell
$env:PORT = "4174"
$env:CLAREZA_BASE_PATH = "/clareza"
npm run dev
```

## Scripts

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Inicia o servidor local |
| `npm start` | Inicia o servidor em modo de produção |
| `npm run build` | Gera o frontend em `dist/` |
| `npm run preview` | Inicia o servidor para validar o build |
| `npm test` | Executa todos os testes |
| `npm run test:unit` | Executa testes de funções e adaptadores isolados |
| `npm run test:integration` | Executa testes HTTP com servidor efêmero |

Antes de abrir uma alteração, execute:

```bash
npm run build
npm test
node --check app.js
node --check server.js
git diff --check
```

## Autenticação Google

A configuração passo a passo do Google Cloud Console, os URIs de callback e as
variáveis obrigatórias estão em [`docs/GOOGLE-OAUTH.md`](docs/GOOGLE-OAUTH.md).
O administrador inicial é `pbsjr1@gmail.com`; a autorização de outras contas
é feita em **Ferramentas > Autorização de usuários**.

Após o login, o menu da conta usa os dados `name`, `email` e `picture`
retornados pelo endpoint OpenID UserInfo do Google. A foto é armazenada no
cadastro autorizado para reaparecer nas sessões seguintes; se não puder ser
carregada, a interface usa a inicial do nome como fallback. O administrador
não aparece na lista de contas gerenciáveis.

Cada sessão HttpOnly dura no máximo sete dias e também expira após 15 minutos
sem atividade. Enquanto a página está visível, interações do usuário e o
retorno à aba ativa enviam heartbeat para `POST /api/auth/heartbeat`; se a
sessão perder a validade, o acesso é solicitado novamente. A administração de
usuários exibe **Online** quando existe uma sessão autorizada vigente e, nos
demais casos, mostra a data do último login.

No Windows, use `npm.cmd` quando a política de execução bloquear
`npm.ps1`:

```powershell
npm.cmd run build
npm.cmd test
```

## Diretrizes operacionais vigentes

- O checkout de desenvolvimento é a fonte única para alterações e
  automações; não use worktrees, cópias ou checkouts alternativos como fonte.
- `main` é a versão oficial do repositório e recebe alterações por push
  direto autorizado. O force push e a exclusão da branch continuam bloqueados.
- O push normal é `git push origin main`; não use `--force` nem
  `--force-with-lease`.
- Alterações visuais não exigem PR, merge ou deploy por padrão. PR, merge e
  publicação online somente devem ocorrer após solicitação explícita.
- A publicação usa exclusivamente `.github/scripts/deploy.ps1`, preserva
  dados MySQL, arquivos de runtime, backups e `.htaccess`, e nunca envia
  `data.json`, `settings.json`, `node_modules`, credenciais ou chaves privadas.
- O servidor envia `index.html` com `no-cache` e os arquivos JS/CSS hashados
  pelo Vite com cache imutável de longo prazo. A troca do nome do asset a cada
  build evita que o navegador mantenha código antigo após uma publicação.
- As automações oficiais são `sincronizar desenvolvimento`, `atualizar
  readme`, `atualizar repositorio` e `publicar online`; a configuração
  reproduzível está em
  [`docs/AUTOMATIONS.md`](docs/AUTOMATIONS.md) e
  [`docs/AUTOMATION-PROMPTS.md`](docs/AUTOMATION-PROMPTS.md).
- Ao trocar de computador ou recuperar uma sessão perdida, execute primeiro
  `sincronizar desenvolvimento`. Ela pergunta se a intenção é finalizar o
  trabalho neste computador ou retomar/continuar o trabalho. Para pausar, ela
  cria um checkpoint, valida e envia o trabalho para `origin/main`; para
  retomar, exige checkout limpo,
  baixa com `git pull --ff-only`, lê os Markdown operacionais e incorpora suas
  diretrizes à sessão antes de continuar. Ela nunca sobrescreve trabalho local,
  usa force push ou faz deploy. Depois, compara e sincroniza as quatro
  automações oficiais com os prompts e parâmetros versionados, sem duplicar
  automações nem executar a marcada `DESATIVADA -`; incorporar diretrizes não
  altera os arquivos Markdown.
- Em uma sessão do Copilot já aberta, o mesmo procedimento pode ser acionado
  diretamente pelo chat com `Finalizar trabalho neste computador` ou
  `Retomar/continuar trabalho neste computador`. Isso evita depender de uma
  pergunta interativa em uma execução separada da automação.

## Arquitetura

```text
server.js                 # Entry point do Passenger/cPanel
app.js                    # Bootstrap e interface do navegador
src/
  client/                 # Cliente HTTP, estado e localStorage
  server/                 # HTTP, arquivos estáticos, armazenamento e MySQL
  shared/                 # Regras de domínio compartilhadas
tests/
  unit/                   # Testes isolados
  integration/             # Testes das rotas HTTP
dist/                     # Saída gerada pelo Vite, não versionada
```

`src/server/http-server.js` é uma fábrica testável do servidor HTTP. `server.js` permanece pequeno para manter a compatibilidade com o Passenger. O carregamento usa MySQL quando configurado; se o MySQL estiver indisponível, o sistema pode ler os arquivos JSON locais, mas bloqueia qualquer gravação financeira para evitar perda ou divergência de dados. O menu **Mensagens** restringe conversas e downloads ao usuário autenticado e aos membros da conversa; anexos de até 10 MB ficam fora da raiz pública. As tarefas são isoladas por usuário e persistidas na tabela `task_items`; no modo sem banco, a implementação mantém apenas um armazenamento de sessão em memória.

O menu **Ferramentas > Documentação** lista e exibe os arquivos Markdown
versionados no checkout por meio de endpoints protegidos. A lista percorre os
documentos do projeto, incluindo `.github/` e `.agents/`, mas exclui diretórios
de dependências, build, Git e backups. O conteúdo é escapado antes da
renderização no navegador; a visualização é informativa e não substitui os
arquivos Markdown canônicos.

Formulários CRUD não enviam mais um snapshot completo do estado. Cada operação chama um endpoint específico, que executa SQL parametrizado e confirma a transação antes de atualizar a interface:

- `/api/transactions`: despesas e receitas;
- `/api/cash-closings`: fechamentos diários;
- `/api/monthly-cash-closings`: fechamentos mensais;
- `/api/billings`: recalcula a tabela mensal de faturamento;
- `/api/limits`: limites e metas;
- `/api/catalogs`: inclusão, edição, exclusão, ativação e ordenação de cadastros auxiliares.

As operações compostas usam transações MySQL. Falhas retornam `503` e não são representadas como sucesso no navegador. Não existe endpoint global de escrita: o estado só pode ser alterado pelos endpoints CRUD específicos.

A tabela `billings` consolida vendas por mês e ano. Períodos históricos usam `monthly_cash_closings`; o mês corrente usa `cash_closings`. O campo `average_ticket` é calculado como `amount / sale_count` (zero quando não há vendas). O fechamento diário recalcula automaticamente o período correspondente, e a página **Faturamento** oferece o botão **Atualizar faturamento** para uma recomposição completa. Alterações nessa funcionalidade que envolvam schema ou persistência MySQL devem ser integradas em `main` e publicadas pelo script oficial somente após autorização explícita, com validação remota.

Receitas técnicas criadas a partir de fechamentos diários podem não ter uma
linha correspondente em `income_sources`. Nessa leitura, a API apresenta a
origem técnica `Vendas`/`vendas`, sem criar catálogo duplicado nem alterar o
CRUD direto no MySQL.

A refatoração da aplicação é incremental. Regras de domínio devem ficar em `src/shared`, integrações de navegador em `src/client` e integrações de servidor em `src/server`. Novas funcionalidades devem preservar o contrato da API e incluir testes na camada adequada.

### Importação CSV

Na página **Ferramentas**, use **Importar transações** para carregar lançamentos sem alterar os demais dados. `descrição`, `valor` e `data` são obrigatórios; `tipo`, `tipo de despesa`, `tomador`, `local`, `credor`, `fonte` e `id` são opcionais. O importador aceita separadores `;` ou `,`, valores como `1.234,56` e datas `DD/MM/AAAA` ou `AAAA-MM-DD`. Linhas inválidas ficam fora da gravação e são listadas antes da confirmação.

Na mesma página, **Importar fechamentos de caixa** recebe uma linha por forma de recebimento, com as colunas `data`, `forma_de_recebimento`, `vendas` e `valor` (`id` é opcional). O arquivo de exemplo está disponível em `public/modelo-fechamentos-caixa.csv`. As linhas podem conter várias datas; os totais de vendas são sincronizados com as receitas de vendas de cada dia.

O modelo também está disponível diretamente em [`modelo-transacoes.csv`](./modelo-transacoes.csv).

### Exportação CSV

Na seção **Ferramentas > Exportação**, os botões baixam os registros atualmente
disponíveis para receitas, despesas de **Casa**, **Zanzibar**, **Empréstimos**,
fechamentos diários e fechamentos mensais. Os arquivos são gerados no
navegador, usam `;` como separador, codificação UTF-8 com BOM e valores
formatados para leitura (`pt-BR`); não incluem IDs de relacionamento. As
despesas respeitam os dados exibidos na área correspondente, e os fechamentos
mensais combinam o mês corrente com os registros históricos conforme a regra de
`cash_closings` e `monthly_cash_closings`.

Os cadastros auxiliares mantêm `name` para exibição e um `slug` técnico único, gerado automaticamente (por exemplo, `Alimentação` → `alimentacao`). A importação pode informar os nomes visíveis ou as colunas correspondentes com sufixo `_slug`.

## Persistência local

Sem `CLAREZA_DB_PASSWORD`, o desenvolvimento usa estes arquivos na raiz:

- `data.json`
- `settings.json`
- `incomes.json`
- `cash-closings.json`
- `monthly-cash-closings.json`
- `limits.json`
- `local-snapshot.json` (somente no modo de snapshot)

Eles são arquivos de runtime ignorados pelo Git. Os arquivos `*.example.json`, quando presentes, servem como referência de estrutura. Não coloque credenciais ou dados reais nesses arquivos.

## Banco MySQL

O assistente financeiro e sua evolução por fases estão documentados em
[docs/FINANCIAL-INSIGHTS.md](docs/FINANCIAL-INSIGHTS.md). O recurso usa
indicadores determinísticos server-side, histórico opcional no MySQL,
comparações, alertas e interpretação assistida por OpenAI ou Gemini, sempre
sem alterar lançamentos automaticamente.

Mensagens privadas, anexos, vínculo com Telegram e o consumidor de
notificações estão documentados em [docs/MESSAGING.md](docs/MESSAGING.md).
Quando habilitado, o worker `scripts/process-telegram-outbox.js` deve ser
executado por cron no ambiente do Passenger; o token e o segredo do webhook
ficam somente nas variáveis de ambiente.

O visualizador interno de documentação não cria uma cópia de conteúdo nem uma
fonte de configuração: ele lê os Markdown publicados pelo deploy. Alterações
operacionais devem ser feitas nos arquivos canônicos e validadas pelo fluxo
normal de documentação.

Configure as variáveis no ambiente do processo Node.js:

```text
CLAREZA_DB_HOST=localhost
CLAREZA_DB_PORT=3306
CLAREZA_DB_NAME=itsitescom_clareza
CLAREZA_DB_USER=itsitescom_clareza_user
CLAREZA_DB_PASSWORD=(senha somente no ambiente)
```

Quando configurado, o servidor cria e migra as tabelas necessárias. O modelo consolidado usa uma única tabela `transactions`, com `id` numérico sequencial, `type` igual a `expense` ou `income` e `client_id` para manter a identidade do lançamento no navegador. Receitas usam `income_source_id`; os campos exclusivos de despesas aceitam `NULL` para receitas. A tabela legada `incomes` é migrada para `transactions` durante a inicialização. As tabelas possuem `created_at` e `updated_at`; a data efetiva informada pelo usuário fica em `transaction_date`.

O cadastro `payment_methods` mantém formas de pagamento comuns, como Dinheiro, Pix, cartões, boleto e transferência bancária, para uso futuro nos fechamentos de caixa diários. Ele não é vinculado à tabela `transactions` nem aos formulários de receitas e despesas.
A tabela `cash_closings` registra os fechamentos diários com data, forma de recebimento, quantidade de vendas e valor total, vinculando cada registro ao catálogo `payment_methods`.
A tabela `monthly_cash_closings` é independente de `cash_closings`: armazena mês, ano, forma de recebimento, quantidade de vendas e valor total, e só é alterada pelo formulário próprio de fechamento mensal. Não existe sincronização automática entre as duas tabelas.
A tabela `limits` registra o planejamento mensal com `month`, `year`, `target`, `budget`, `forecast`, `patamar`, `result` e `closed`. Os cinco valores financeiros usam `DECIMAL(12,2)`, o fechamento usa `TINYINT(1)` com padrão `0`, e cada período (`year` + `month`) é único. O `result` é calculado como `target - budget - forecast - patamar`. A tabela também mantém `id`, `client_id`, `created_at` e `updated_at`.
Na interface, os limites ficam na seção **Ferramentas**, com o formulário **Limites e Metas**, valores de meta, orçamento, previsão e resultado, status de fechamento controlado pela lógica, edição e paginação.
Os cadastros auxiliares usam `display_order` e `is_active` quando aplicável. Registros inativos não aparecem em formulários ou filtros; a exclusão física só ocorre quando não há referência em `transactions` ou `cash_closings`.
- A tabela `task_items` registra tarefas por usuário e data, com `status` `active`
  ou `archived`. O endpoint protegido `/api/tasks` lista e cria tarefas; marcar
  uma tarefa usa `PUT /api/tasks/:id` e grava `completed_at`, mantendo o item
  no arquivo do dia. O título aceita de 1 a 240 caracteres e a data é
  normalizada no servidor. Sem MySQL, as tarefas ficam somente no armazenamento
  de memória da sessão e não são gravadas nos arquivos JSON.
As mensagens privadas usam `messaging_conversations`,
`messaging_conversation_members`, `messaging_messages`, `messaging_files`,
`messaging_message_files` e `messaging_notification_outbox`. Os bytes dos
anexos ficam em `CLAREZA_MESSAGING_FILES_DIR` ou em `.messaging-files/`, nunca
em uma pasta pública. O worker do Telegram envia eventos separados para texto
e arquivo e encerra o pool MySQL ao terminar.

Nunca versionar senhas, arquivos de produção ou dumps do banco.

Qualquer implementação que altere o schema, as migrações, as foreign keys ou a persistência MySQL deve ser publicada na hospedagem/banco de dados ao final da tarefa, usando exclusivamente o script oficial de deploy. A tarefa só está concluída após a validação remota.

O deploy operacional publica diretamente o checkout local validado no cPanel e não depende de pull request ou merge. A proteção de `main` se aplica à integração no GitHub; a publicação operacional não cria, mescla ou aguarda PR. Alterações de código locais são o conteúdo do deploy; o script remove somente a `dist/` remota antes de enviar o novo build, preserva os arquivos de runtime, os backups e `.htaccess`, e confirma a versão servida pelo endpoint `deploy-version.json`.

### Teste local com snapshot do MySQL

Para testar alterações com dados atuais sem publicar nem conectar o servidor
local ao MySQL, gere um snapshot descartável da API de leitura:

```powershell
npm.cmd run dev:local-snapshot
```

Esse comando atualiza o snapshot e inicia o servidor em uma única operação.
O modo `CLAREZA_LOCAL_SNAPSHOT=1` é a identificação explícita de execução
local: o servidor lê `local-snapshot.json`, não cria pool MySQL e bloqueia
todas as escritas. O arquivo é ignorado pelo Git, não é enviado pelo script de
deploy e deve ser removido quando não for mais necessário. O snapshot pode
receber outra origem definindo `CLAREZA_SNAPSHOT_URL`; nunca coloque
credenciais nessa URL. Para apenas atualizar o arquivo sem iniciar o servidor,
execute diretamente `create-local-snapshot.ps1`.

Após o reinício do Passenger, as validações HTTP do deploy são repetidas
automaticamente para tolerar respostas transitórias `503 Service Unavailable`.
A publicação só deve ser considerada concluída quando o script exibir
`CLAREZA_DEPLOY_COMPLETED`.

### Autenticação do deploy no Windows

O deploy SFTP usa a chave protegida `~/.ssh/clareza_cpanel_deploy`, autorizada
no cPanel para o usuário SSH `itsitescom`. A passphrase não fica no repositório,
em variáveis de ambiente ou em tarefas agendadas: a chave deve ser carregada
manualmente no `ssh-agent` antes da publicação:

```powershell
Set-Service -Name ssh-agent -StartupType Manual
Start-Service -Name ssh-agent
ssh-add "$HOME\.ssh\clareza_cpanel_deploy"
```

O script verifica `ssh-agent` e `ssh-add -l` antes de iniciar o build. Se a
identidade não estiver disponível, ele interrompe sem fazer upload e informa
esses comandos. Não use a chave privada `.ppk` ou a passphrase em argumentos,
logs ou arquivos versionados. O procedimento completo está em
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Consistência de persistência na interface

Inclusões, edições, exclusões, alterações de ordem e ativações ou desativações de cadastros só podem ser confirmadas visualmente depois que o endpoint CRUD específico retornar sucesso. O frontend preserva uma cópia independente do estado anterior; se a persistência falhar, restaura essa cópia, atualiza a interface e informa o erro. Esse rollback visual evita que um registro não salvo no MySQL permaneça aparentando estar salvo.

Os estados auxiliares de paginação devem ser consumidos somente pelo renderer da listagem correspondente. Misturar estados de paginação de seções diferentes pode lançar uma exceção durante o redesenho pós-gravação, fazendo uma operação persistida parecer ter falhado.

## Prompt inicial para continuidade

O Clareza é uma aplicação de organização financeira pessoal e empresarial: registra despesas, receitas e fechamentos de caixa, com Node.js em módulos ES, JavaScript puro, Vite, MySQL e Passenger. A API lê MySQL quando configurado; JSON local é apenas fallback de leitura/desenvolvimento e não recebe operações CRUD.

O modelo MySQL principal é formado por `transactions`, `cash_closings` e pelos catálogos `expense_types`, `takers`, `locations`, `creditors`, `payment_methods` e `income_sources`, além de `app_settings`. `transactions` mantém foreign keys para os catálogos de lançamento; `cash_closings.payment_method_id` referencia `payment_methods.id`. Ao persistir, insira primeiro os nomes novos dos catálogos, depois atualize `display_order` e `is_active`. Registros inativos não aparecem nos formulários; não exclua fisicamente um cadastro referenciado por `transactions` ou `cash_closings`.

O Fechamento de Caixa registra data, forma de recebimento, quantidade de vendas e total, e também compõe a receita do dia. O Fechamento do mês usa a tabela independente `monthly_cash_closings`. A ordenação dos catálogos compatíveis pode ser alterada por arraste e deve ser confirmada pelo botão **Salvar Ordem**. Em investigações, siga o fluxo ponta a ponta (interface, estado, API, persistência e retorno), acrescente testes unitários e de integração, proteja dados de produção e nunca exponha credenciais ou arquivos de runtime. O deploy deve ocorrer somente pelo script oficial `.github/scripts/deploy.ps1`.

## API HTTP

As principais rotas são:

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/clareza/api/data` | Lê transações, receitas derivadas e configurações |
| `GET` | `/clareza/api/documentation` | Lista os Markdown publicados para o visualizador interno |
| `GET` | `/clareza/api/documentation/:path` | Lê um Markdown publicado, com validação de caminho |
| `GET` | `/clareza/api/tasks?date=YYYY-MM-DD` | Lista as tarefas do usuário autenticado para um dia |
| `POST` | `/clareza/api/tasks` | Cria uma tarefa aberta para a data informada |
| `PUT` | `/clareza/api/tasks/:id` | Arquiva uma tarefa aberta do usuário autenticado |
| `GET` | `/clareza/api/financial-insights` | Calcula indicadores determinísticos do período |
| `POST` | `/clareza/api/financial-insights` | Calcula indicadores e, opcionalmente, chama IA ou salva histórico |
| `GET` | `/clareza/api/financial-insights/history` | Lista o histórico do usuário autenticado |
| `GET` | `/clareza/api/financial-insights/compare` | Compara períodos mensais do mesmo escopo |
| `POST` | `/clareza/api/financial-insights/ask` | Envia pergunta assistida com indicadores agregados |
| `GET` | `/clareza/api/messaging/conversations` | Lista as conversas privadas do usuário autenticado |
| `POST` | `/clareza/api/messaging/files` | Recebe anexo multipart de até 10 MB |
| `GET` | `/clareza/api/messaging/files/:id` | Baixa anexo autorizado da conversa |
| `POST` | `/clareza/api/messaging/conversations/:id/messages` | Envia texto e anexos autorizados |
| `POST` | `/clareza/api/telegram/link-code` | Gera código temporário para vincular o Telegram |
| `POST` | `/clareza/api/telegram/test` | Envia teste autenticado ao Telegram vinculado |
| `PUT` | `/clareza/api/transactions` | Insere ou atualiza uma despesa/receita |
| `PUT` | `/clareza/api/cash-closings` | Grava um fechamento diário e sua receita correspondente |
| `PUT` | `/clareza/api/monthly-cash-closings` | Grava os registros mensais do período editado |
| `PUT` | `/clareza/api/limits` | Insere ou atualiza um limite |
| `PUT` | `/clareza/api/catalogs` | Executa uma operação SQL de catálogo |
| `GET` | `/clareza/` | Entrega a aplicação compilada |

O caminho `/clareza` é o padrão e pode ser alterado por `CLAREZA_BASE_PATH`. O payload mantém compatibilidade com clientes antigos que enviam transações e receitas separadamente. Payloads inválidos retornam `400`; falhas internas retornam `500`.

## Documentação operacional

- [Contribuição e validação](CONTRIBUTING.md)
- [Publicação no cPanel](docs/DEPLOYMENT.md)
- [Mensagens privadas e Telegram](docs/MESSAGING.md)
- [Assistente financeiro](docs/FINANCIAL-INSIGHTS.md)
- [Regras das automações](docs/AUTOMATIONS.md)
- [Contrato técnico dos prompts](docs/AUTOMATION-PROMPTS.md)
- [Prompt de continuidade para novas sessões](docs/CONTINUITY-PROMPT.md)
