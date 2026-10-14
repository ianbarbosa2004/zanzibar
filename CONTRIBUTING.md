# Contribuição

## Fluxo de trabalho

1. Ao pausar neste computador, execute `sincronizar desenvolvimento` para
   validar, criar um checkpoint e enviar as alterações para `origin/main`. Ao
   iniciar em outro computador, execute a mesma automação com checkout limpo
   para baixar com `git pull --ff-only`; ela nunca apaga alterações locais.
2. Faça uma alteração pequena e focada, preservando o contrato da API.
3. Leia os módulos existentes antes de duplicar regras. Regras compartilhadas ficam em `src/shared`, integrações do navegador em `src/client` e integrações do servidor em `src/server`.
4. Atualize ou crie testes para o comportamento alterado.
5. Não inclua credenciais, dados de produção, arquivos JSON de runtime
   (`data.json`, `settings.json`, `incomes.json`, `cash-closings.json`,
   `monthly-cash-closings.json`, `limits.json` e snapshots), a pasta
   `.messaging-files/`, `node_modules/`, `dist/` ou arquivos de anexos locais.

## Validação local

Execute os comandos abaixo antes de enviar a alteração:

```bash
npm run build
npm test
node --check app.js
node --check server.js
git diff --check
```

No Windows, prefira `npm.cmd run build` e `npm.cmd test` quando a política de
execução bloquear `npm.ps1`.

Para mudanças específicas, os testes também podem ser executados por camada:

```bash
npm run test:unit
npm run test:integration
```

Mudanças que envolvem banco de dados devem ser verificadas no fluxo completo: interface, payload da API, repositório e leitura posterior. Não use dados reais para criar testes locais.

Toda operação de escrita da interface — despesa, receita ou cadastro auxiliar — deve tratar a persistência como transacional também no estado visual: preserve o estado anterior antes da mutação, confirme o sucesso do `PUT` antes de apresentar a operação como concluída e restaure o estado anterior quando a API falhar. A regra vale igualmente para edição, exclusão, ordenação e ativação de cadastros.

Ao adicionar paginação a uma nova listagem, mantenha seu estado separado dos estados de filtros e listagens existentes. Não use a coleção inteira de `paginationState` para renderizar uma família específica de componentes: um estado de paginação sem painel correspondente pode lançar uma exceção após uma gravação bem-sucedida e mascarar o sucesso da API.

## Skills recomendadas para o Clareza

Estas referências podem orientar a evolução do repositório e o uso de
assistentes de IA:

As instruções persistentes para assistência de IA ficam em
[`.github/copilot-instructions.md`](.github/copilot-instructions.md). Elas
complementam este documento e `docs/CONTINUITY-PROMPT.md`, sem substituí-los.
O inventário de skills, configuração do Copilot, CodeRabbit e SkillDB está em
[`docs/AI-TOOLS.md`](docs/AI-TOOLS.md).

- **AI Ready** — [skill](https://github.com/github/awesome-copilot/blob/main/skills/ai-ready/SKILL.md):
  manter o repositório preparado para IA, com contexto e práticas adequadas
  para agentes.
- **Code Review** — [skill](https://github.com/coderabbitai/skills/blob/main/skills/code-review/SKILL.md):
  apoiar revisões de qualidade, riscos e manutenção do código.
- **Javascript Typescript Jest** — [skill](https://github.com/github/awesome-copilot/blob/main/skills/javascript-typescript-jest/SKILL.md):
  opção futura para o projeto. O Clareza usa `node:test` atualmente e não deve
  migrar para Jest sem decisão explícita.

As URLs acima são referências de instalação e consulta; nenhum recurso externo
deve ser instalado automaticamente. Antes de instalar ou habilitar qualquer
skill, ferramenta ou integração, valide sua origem, compatibilidade, escopo e
impacto no projeto.

## Persistência e produção

O banco de produção é MySQL. O fallback local usa `data.json`, `settings.json`,
`incomes.json`, `cash-closings.json`, `monthly-cash-closings.json` e
`limits.json`; o modo de snapshot usa `local-snapshot.json`. Esses arquivos
são runtime e não devem ser commitados. Alterações de schema, foreign keys,
exclusão ou migração devem preservar dados existentes e ser enviadas
diretamente para `main` somente após as validações locais. O deploy não é
disparado automaticamente: só publique quando o usuário solicitar, usando
exclusivamente `.github/scripts/deploy.ps1`, e considere a alteração
operacionalmente concluída somente após a validação remota documentada em
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

O procedimento de publicação está em [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Antes de executar o deploy no Windows, carregue a chave autorizada no
`ssh-agent` com o procedimento documentado. O script valida essa condição
antes do build e falha de forma explícita quando a identidade não está
disponível; nunca registre ou automatize a passphrase.

Para testar dados reais localmente, use somente o snapshot descartável
documentado em [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), com
`CLAREZA_LOCAL_SNAPSHOT=1`. Esse modo não pode ser usado em produção e
bloqueia gravações.

As exportações CSV são uma operação local de leitura: os arquivos são montados
no navegador a partir dos dados já carregados e não criam gravações ou rotas
adicionais no servidor. Ao alterar seus campos, filtros ou regras de
fechamento, atualize a documentação e valide a saída com os testes e o build
existentes.

Mensagens privadas e anexos exigem autenticação e autorização por conversa.
Uploads têm limite de 10 MB e devem permanecer fora da raiz pública. O vínculo
e as notificações Telegram são opcionais; consulte
[`docs/MESSAGING.md`](docs/MESSAGING.md) antes de alterar rotas, tabelas,
outbox ou o worker `scripts/process-telegram-outbox.js`.

### Indicadores financeiros

O guia completo de arquitetura, endpoints, configuração de OpenAI/Gemini,
privacidade, fases e validação está em
[docs/FINANCIAL-INSIGHTS.md](docs/FINANCIAL-INSIGHTS.md). Consulte-o antes de
alterar qualquer superfície do assistente.

Os indicadores do menu **Análise IA** são determinísticos e calculados no servidor.
O escopo geral exclui Buffet; a análise Buffet é solicitada separadamente.
Não exponha descrições ou PII desnecessária na resposta. Mudanças nessa área
devem manter testes unitários e de integração para cálculo, autenticação,
períodos inválidos e estados vazios.

A interpretação por IA é opcional, server-only e não pode executar mutações.
Testes devem cobrir payload agregado, chave ausente, resposta JSON inválida,
timeout, rate limit e schema incompleto.
