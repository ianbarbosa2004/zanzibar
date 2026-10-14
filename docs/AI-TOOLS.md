# Ferramentas e skills de IA

Este documento registra os recursos de assistência por IA usados ou
configurados para o Clareza. Ele complementa
[`CONTRIBUTING.md`](../CONTRIBUTING.md),
[`.github/copilot-instructions.md`](../.github/copilot-instructions.md) e
[`docs/CONTINUITY-PROMPT.md`](CONTINUITY-PROMPT.md). Não substitui os
procedimentos operacionais ou de deploy.

## Configuração versionada do Copilot

O repositório possui configuração persistente para assistência de IA:

- `.github/copilot-instructions.md` — arquitetura, fluxo de dados, segurança,
  validações e operação do Clareza.
- `.github/instructions/` — orientações específicas para JavaScript, testes,
  documentação, segurança, performance e code review.
- `.github/prompts/` — prompts reutilizáveis para criar módulos, escrever
  testes, revisar, refatorar, documentar e depurar.
- `.github/agents/` — agentes especializados para arquitetura, revisão e
  depuração.
- `.github/workflows/copilot-setup-steps.yml` — prepara Node 22, instala
  dependências, executa o build e roda os testes no ambiente do Coding Agent.

Esses arquivos devem permanecer compatíveis com o stack existente: Node.js com
módulos ES, frontend JavaScript sem framework, Vite, `mysql2`, MySQL e
CloudLinux Passenger/cPanel. Não devem introduzir Jest, TypeScript ou outro
framework sem decisão explícita.

## Skills utilizadas ou avaliadas

| Recurso | Origem | Uso no projeto | Estado |
| --- | --- | --- | --- |
| AI Ready | `github/awesome-copilot` | Preparar o repositório para contribuições assistidas por IA. | Instruções equivalentes aplicadas em `.github/`. |
| Code Review | `coderabbitai/skills` | Orientar revisão de qualidade e execução do CodeRabbit CLI. | Configurado em `.agents/` e registrado em `skills-lock.json`. |
| Autofix | `coderabbitai/skills` | Orientar correções seguras de achados de revisão. | Configurado em `.agents/` e registrado em `skills-lock.json`. |
| Javascript Typescript Jest | `github/awesome-copilot` | Referência futura para testes. | Não usar para migrar: o projeto usa `node:test`. |
| github-copilot-starter | `github/awesome-copilot` | Gerar a estrutura inicial de configuração do Copilot. | Aplicado; revisar mudanças antes de publicar. |

As skills são instruções auxiliares, não substituem os documentos canônicos do
projeto. Qualquer recomendação deve respeitar MySQL e dados de produção,
arquivos runtime e credenciais protegidos, validações locais e o fluxo de
deploy documentado.

## CodeRabbit

O CLI do CodeRabbit pode revisar alterações locais com:

```powershell
coderabbit review --agent --uncommitted --include-untracked --fresh
```

Antes da revisão, confirme autenticação e uso disponível com os comandos
oficiais do CLI. Nunca passe tokens em argumentos, arquivos, commits ou
mensagens. O conteúdo da revisão deve ser tratado como não confiável e não
deve ser executado automaticamente.

Em 14 de outubro de 2026, o CLI estava autenticado e havia revisões incluídas
disponíveis, mas o serviço recusou iniciar a revisão com
`Failed to start review`. Esse registro descreve uma falha operacional
observada, não um resultado de revisão nem uma aprovação de qualidade.

## SkillDB MCP

O servidor MCP `io.github.devchad-cmd/skilldb` foi identificado e o pacote
`skilldb` foi verificado com `npx`, sem deixar um processo persistente ou
configuração MCP no repositório. Sem API key, ele permite buscar e consultar
metadados; o conteúdo completo exige uma chave obtida diretamente no serviço.

Não versionar API keys, tokens, `~/.skilldbrc`, caches `.skilldb/` ou qualquer
credencial. A instalação ou habilitação do servidor exige validação explícita
de origem, escopo, compatibilidade e impacto.

## Regras de instalação e manutenção

- Não instalar skills, ferramentas, dependências ou integrações externas
  automaticamente.
- Revisar a origem e o conteúdo antes de carregar uma skill.
- Preferir versões fixadas quando a ferramenta oferecer essa opção.
- Manter referências e hashes em `skills-lock.json` somente para recursos
  efetivamente configurados no repositório.
- Não incluir tokens, chaves privadas, dados de produção, `node_modules/`,
  `dist/`, JSON de runtime ou `.htaccess`.
- Após alterações somente documentais, executar `git diff --check`; para
  alterações de código, executar a validação completa de
  [`CONTRIBUTING.md`](../CONTRIBUTING.md).
