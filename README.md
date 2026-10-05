# Clareza

Aplicação web para organização financeira pessoal e empresarial. O sistema registra despesas e receitas, calcula o saldo mensal, permite administrar cadastros auxiliares e persiste os dados em MySQL no ambiente de produção ou em arquivos JSON durante o desenvolvimento local.

## Funcionalidades

- Registro, edição, busca, filtros e paginação de despesas.
- Registro e edição de receitas com fonte e data.
- Saldo mensal calculado como receitas menos despesas.
- Categorias, tomadores, locais, credores e fontes de receita.
- Exportação das movimentações.
- Persistência MySQL com migração da estrutura legada de receitas.
- Fallback para JSON local quando o MySQL não está configurado.
- Interface compilada pelo Vite e servida pelo Node.js.

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

Antes de publicar, execute:

```bash
npm test
npm run build
node --check app.js
node --check server.js
git diff --check
```

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

`src/server/http-server.js` é uma fábrica testável do servidor HTTP. `server.js` permanece pequeno para manter a compatibilidade com o Passenger. O armazenamento é selecionado por `src/server/data-store.js`: MySQL quando configurado e JSON local caso contrário.

A refatoração da aplicação é incremental. Regras de domínio devem ficar em `src/shared`, integrações de navegador em `src/client` e integrações de servidor em `src/server`. Novas funcionalidades devem preservar o contrato da API e incluir testes na camada adequada.

## Persistência local

Sem `CLAREZA_DB_PASSWORD`, o desenvolvimento usa estes arquivos na raiz:

- `data.json`
- `settings.json`
- `incomes.json`

Eles são arquivos de runtime ignorados pelo Git. Os arquivos `*.example.json`, quando presentes, servem como referência de estrutura. Não coloque credenciais ou dados reais nesses arquivos.

## Banco MySQL

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

Nunca versionar senhas, arquivos de produção ou dumps do banco.

## API HTTP

As principais rotas são:

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/clareza/api/data` | Lê transações, receitas derivadas e configurações |
| `PUT` | `/clareza/api/data` | Valida e persiste o estado completo |
| `GET` | `/clareza/` | Entrega a aplicação compilada |

O caminho `/clareza` é o padrão e pode ser alterado por `CLAREZA_BASE_PATH`. O payload mantém compatibilidade com clientes antigos que enviam transações e receitas separadamente. Payloads inválidos retornam `400`; falhas internas retornam `500`.

## Publicação no cPanel

O entrypoint do Passenger é `server.js`. O diretório remoto usado pelo projeto é:

```text
/home1/itsitescom/public_html/clareza
```

O script oficial de publicação é:

```powershell
.\.github\scripts\deploy.ps1
```

Ele valida `app.js` e `server.js`, executa o build, faz backup de `data.json` e `settings.json`, envia `dist/`, `server.js`, `src/` e os manifestos npm, remove os arquivos legados da raiz, reinicia o Passenger e valida:

```text
https://itsites.com.br/clareza/
https://itsites.com.br/clareza/api/data
```

No cPanel, configure a aplicação Node.js para iniciar `server.js`, use a versão Node compatível e mantenha as variáveis MySQL no Application Manager. O `.htaccess` existente não deve ser sobrescrito pelo deploy.

## Contribuição

1. Faça uma alteração pequena e focada.
2. Reutilize módulos existentes antes de duplicar regras.
3. Adicione ou atualize testes.
4. Execute `npm test`, `npm run build` e `git diff --check`.
5. Não inclua runtime, credenciais ou artefatos gerados no commit.
