# Instruções persistentes para IA

Estas instruções complementam `CONTRIBUTING.md` e
`docs/CONTINUITY-PROMPT.md`. Não substituem o prompt de continuidade nem
alteram os procedimentos das automações oficiais.

## Contexto do projeto

- Preserve a arquitetura Node.js ES modules, frontend JavaScript puro, Vite,
  MySQL via `mysql2` e CloudLinux Passenger/cPanel.
- `server.js` é o entrypoint de produção; o banco de produção é MySQL.
- Regras compartilhadas ficam em `src/shared`, integrações do navegador em
  `src/client` e integrações do servidor em `src/server`.

## Regras para alterações assistidas por IA

- Faça alterações pequenas, focadas, testáveis e compatíveis com o contrato da
  API.
- Leia o código e os testes relacionados antes de duplicar regras ou criar
  abstrações.
- Preserve dados MySQL, arquivos de runtime, backups, credenciais, chaves
  privadas e `.htaccess`; nunca os inclua em commits ou uploads.
- Não trate JSON local como destino de CRUD quando o MySQL estiver configurado.
- Não instale skills, ferramentas, dependências ou integrações externas
  automaticamente. Valide origem, compatibilidade, escopo e impacto antes de
  qualquer instalação.
- Não faça commit, push, PR, merge ou deploy sem autorização explícita quando
  a tarefa não os solicitar.

## Validação obrigatória

Para alterações de código, execute:

```text
npm.cmd run build
npm.cmd test
node --check app.js
node --check server.js
git diff --check
```

Para alterações somente documentais, execute ao menos `git diff --check` e
confirme que nenhum arquivo funcional foi alterado.

## Publicação

Deploy só pode usar `.github/scripts/deploy.ps1`, após autorização explícita,
com a chave protegida carregada no `ssh-agent`. Nunca automatize ou registre a
passphrase. A publicação deve preservar dados MySQL, runtime, backups e
`.htaccess`, e só pode ser considerada concluída após as validações remotas
documentadas em `docs/DEPLOYMENT.md`.
