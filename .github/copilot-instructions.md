# Instruções persistentes para IA

Estas instruções complementam `README.md`, `CONTRIBUTING.md` e
`docs/CONTINUITY-PROMPT.md`. As automações oficiais e seus prompts canônicos
estão em `docs/AUTOMATIONS.md` e `docs/AUTOMATION-PROMPTS.md`; não os
substitua nem crie automações duplicadas.

## Contexto e arquitetura

- Clareza é uma aplicação de finanças pessoais e empresariais em Node.js com
  módulos ES, frontend JavaScript sem framework, Vite, `mysql2` e
  CloudLinux Passenger/cPanel.
- `server.js` é deliberadamente pequeno e é o entrypoint de produção.
  `src/server/http-server.js` fornece a fábrica de servidor usada pelos testes;
  `src/server/data-store.js` seleciona o modo de armazenamento e delega ao
  repositório MySQL ou ao fallback JSON.
- `src/client` contém cliente HTTP, estado, `localStorage` e persistência
  visual; `src/server` contém autenticação, roteamento HTTP, arquivos estáticos,
  configuração e persistência; `src/shared` contém regras de domínio,
  normalização, datas, CSV, catálogos e formatação compartilhadas pelas duas
  camadas.
- O frontend compilado pelo Vite é servido pelo mesmo servidor Node. O padrão
  é `/clareza/`, configurável por `CLAREZA_BASE_PATH`; `dist/` é saída gerada,
  não fonte.
- A API lê MySQL quando `CLAREZA_DB_PASSWORD` está configurado. Sem MySQL, os
  arquivos JSON locais são fallback de leitura/desenvolvimento; não são destino
  de CRUD quando o banco está configurado. O modo de snapshot local também é
  somente leitura e bloqueia gravações.

### Fluxo de dados que deve ser preservado

As operações devem ser rastreadas de ponta a ponta:
interface → estado do cliente → endpoint específico → repositório/transação
MySQL → nova leitura → renderização. Não existe endpoint global de escrita.
Use os endpoints CRUD específicos para transações, fechamentos diários,
fechamentos mensais, faturamento, limites e catálogos.

- `transactions` é a tabela consolidada de despesas e receitas; não crie uma
  segunda fonte de verdade nem duplique regras entre `transactions` e
  `incomes`.
- `cash_closings` referencia `payment_methods` e gera a receita consolidada do
  dia. `monthly_cash_closings` é independente e só é alterada pelo formulário
  de fechamento mensal.
- A tabela `billings` consolida vendas por mês; o mês corrente usa
  `cash_closings` e períodos históricos usam `monthly_cash_closings`.
- Catálogos mantêm `name` para exibição e `slug` técnico. Quando aplicável,
  `display_order` controla a ordem e `is_active` controla a disponibilidade.
  Ao persistir operações compostas, insira catálogos novos antes de atualizar
  ordem/status; só exclua fisicamente registros sem referências.
- Limites calculam `result` como `target - budget - forecast - patamar`.
- Rotas protegidas exigem autenticação Google; autorização administrativa deve
  continuar sendo aplicada no servidor, não apenas ocultada na interface.

## Comandos de desenvolvimento e validação

Instale dependências e inicie o servidor local:

```powershell
npm.cmd install
npm.cmd run dev
```

O servidor escuta na porta `4173` e usa `/clareza` por padrão. Para testar
dados atuais sem conectar o desenvolvimento ao MySQL, use o snapshot descartável:

```powershell
npm.cmd run dev:local-snapshot
```

Scripts disponíveis:

| Comando | Uso |
| --- | --- |
| `npm.cmd run build` | Compila o frontend para `dist/` |
| `npm.cmd test` | Executa toda a suíte nativa `node:test` |
| `npm.cmd run test:unit` | Executa `tests/unit` |
| `npm.cmd run test:integration` | Executa `tests/integration` |
| `node --test tests/unit/finance.test.js` | Executa um arquivo de teste específico |
| `node --test tests/integration/http-server.test.js` | Executa um teste de integração específico |
| `node --check app.js` | Verifica a sintaxe do bootstrap do navegador |
| `node --check server.js` | Verifica a sintaxe do entrypoint do servidor |
| `git diff --check` | Detecta erros de whitespace no diff |

Não há script de lint separado. A validação equivalente exigida pelo projeto
é build, testes, verificações `node --check` e `git diff --check`. O CI em
`.github/workflows/ci.yml` usa Node 22, `npm ci`, `npm run build` e `npm test`.
No Windows, prefira `npm.cmd` quando a política de execução bloquear
`npm.ps1`.

Para qualquer alteração de código, execute:

```powershell
npm.cmd run build
npm.cmd test
node --check app.js
node --check server.js
git diff --check
```

Para alterações somente documentais, execute ao menos `git diff --check` e
confirme que nenhum arquivo funcional foi alterado.

## Convenções de implementação

- Faça alterações pequenas, focadas, testáveis e compatíveis com o contrato
  HTTP existente. Leia o módulo relacionado e os testes antes de extrair
  abstrações ou duplicar uma regra.
- Regras de domínio novas devem ficar em `src/shared`; não coloque lógica
  específica do navegador no servidor nem lógica de persistência no frontend.
- O estado da interface deve preservar uma cópia independente antes de toda
  escrita. Só confirme visualmente depois do sucesso do endpoint; em caso de
  falha, restaure o estado anterior, redesenhe e mostre o erro.
- Estados de paginação são específicos de cada renderer/listagem. Não use o
  estado de paginação de uma seção para renderizar outra, pois isso pode lançar
  exceções durante o redesenho após uma gravação bem-sucedida.
- Escritas MySQL devem usar o repositório existente, SQL parametrizado e
  transações para operações compostas. Erros de persistência devem retornar
  erro HTTP explícito, nunca uma resposta com aparência de sucesso.
- Mantenha compatibilidade com payloads antigos que enviam transações e
  receitas separadamente; normalize e deduplicate no ponto compartilhado
  apropriado.
- Testes de regras isoladas ficam em `tests/unit`; testes do contrato HTTP e
  do servidor ficam em `tests/integration`. Para mudanças de banco valide o
  fluxo completo sem usar dados reais.
- O HTML recebe `no-cache`; assets JS/CSS com hash do Vite recebem cache
  imutável. Preserve essa política ao alterar `src/server/http-server.js` ou
  `src/server/static-files.js`.

## Segurança, arquivos protegidos e operação

- Nunca versione ou envie credenciais, dados de produção, dumps, chaves
  privadas, `node_modules/`, `dist/`, `.htaccess` ou arquivos JSON de runtime
  (`data.json`, `settings.json`, `incomes.json`, `cash-closings.json`,
  `monthly-cash-closings.json`, `limits.json` e snapshots).
- Não instale skills, ferramentas, dependências ou integrações externas
  automaticamente. Valide origem, compatibilidade, escopo e impacto antes de
  qualquer instalação.
- Não faça commit, push, PR, merge ou deploy sem autorização explícita quando
  a tarefa não os solicitar. O checkout local é a fonte única; não use
  worktrees, cópias ou checkouts alternativos como fonte de alterações.
- `main` é a branch oficial. O push normal autorizado é `git push origin main`;
  nunca use `--force`, `--force-with-lease`, `reset --hard`, `checkout --` ou
  `git clean` para apagar trabalho.
- Deploy só pode usar `.github/scripts/deploy.ps1`, após autorização explícita,
  com a chave protegida carregada manualmente no `ssh-agent`. Nunca automatize,
  registre ou solicite a passphrase. O deploy deve preservar MySQL, runtime,
  backups e `.htaccess`, e só termina após as validações remotas de
  `docs/DEPLOYMENT.md`, incluindo `CLAREZA_DEPLOY_COMPLETED`.
- Alterações de schema, migrações, foreign keys ou persistência MySQL exigem
  validação remota após um deploy explicitamente autorizado; não faça deploy
  automaticamente por inferência.

## Configuração complementar do Copilot

Use as instruções com escopo em `.github/instructions/` para JavaScript,
testes, documentação, segurança, performance e revisão. Os prompts reutilizáveis
estão em `.github/prompts/` e os agentes especializados em `.github/agents/`.
O workflow `.github/workflows/copilot-setup-steps.yml` reproduz o ambiente
Node 22 do CI com `npm ci`, build e testes.
