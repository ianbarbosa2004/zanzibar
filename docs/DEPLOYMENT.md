# Publicação no cPanel

## Ambiente

O entrypoint do CloudLinux Passenger é `server.js`. A aplicação usa `/clareza/` como caminho base e o servidor precisa receber as variáveis MySQL pelo Application Manager do cPanel. Os nomes das variáveis estão documentados no README; os valores, especialmente a senha, nunca devem ser registrados no Git ou neste arquivo.

O `.htaccess` é administrado pelo cPanel e não deve ser sobrescrito. Dados de produção ficam no MySQL; os arquivos `data.json`, `settings.json`, `incomes.json`, `cash-closings.json` e `monthly-cash-closings.json` não são enviados e devem ser preservados. O CRUD de produção grava somente por SQL no MySQL.

## Procedimento oficial

### Migrações MySQL

Qualquer alteração que crie ou modifique tabelas, colunas, índices, foreign keys, migrações de dados ou rotinas de persistência MySQL deve preservar os dados existentes e passar pelas validações locais antes do push direto para `main`. O deploy deve usar exclusivamente `.github/scripts/deploy.ps1` e validar a aplicação e o schema efetivamente disponíveis em produção. Commits locais não substituem a publicação; porém, a publicação não é automática. Após um deploy autorizado, a tarefa só pode ser considerada operacionalmente concluída depois de `CLAREZA_DEPLOY_COMPLETED`, HTTP/API `200`, confirmação de `deploy-version.json` e validação remota da funcionalidade migrada.

Execute a partir do checkout local que contém a versão que deve ser publicada. Não é necessário criar, mesclar ou aguardar um pull request para executar o deploy operacional. O fluxo normal do repositório usa push direto autorizado para `main`; PR não faz parte do fluxo obrigatório. Antes de publicar, confirme que o código foi validado e que o checkout não contém arquivos de runtime ou credenciais destinados ao upload:

```powershell
npm run build
npm test
node --check app.js
node --check server.js
git diff --check
powershell -NoProfile -ExecutionPolicy Bypass -File .github\scripts\deploy.ps1
```

Alterações de código locais são permitidas e são justamente o conteúdo a ser publicado diretamente. O script gera `dist/` localmente, remove somente a pasta `dist/` remota e envia o novo build. `data.json`, `settings.json`, `incomes.json`, `cash-closings.json`, `limits.json`, backups e `.htaccess` são preservados no servidor; nenhum desses arquivos deve ser incluído no upload como parte do build.

A proteção de `main` permite push direto autorizado, mas continua bloqueando
force push e exclusão da branch. Ela não é substituída pelo deploy operacional.
O script publica o checkout local escolhido, sem criar, mesclar ou aguardar PR.
Depois do upload, ele publica `deploy-version.json` com o SHA do commit e
confirma por HTTP que o cPanel está servindo esse mesmo SHA. A saída
`CLAREZA_DEPLOY_COMMIT` é a referência da versão efetivamente publicada.

O script oficial:

- valida o código e gera o build;
- cria backups remotos dos JSON existentes sem colocá-los no Git;
- envia `dist/`, `server.js`, `src/` e os manifestos npm;
- reinstala dependências no ambiente Node do cPanel;
- reinicia o Passenger;
- valida a aplicação e a API online.
- confirma que o commit publicado é o mesmo commit usado pelo checkout local validado.

### Validação resiliente do Passenger

Após reiniciar o Passenger, o script consulta a página principal, a API e
`deploy-version.json`. O CloudLinux pode responder `503 Service Unavailable`
por alguns segundos enquanto a aplicação reinicia ou enquanto os processos
estão ocupados. Por isso, cada consulta é repetida automaticamente até cinco
vezes, aguardando cinco segundos entre as tentativas.

Uma resposta `503` isolada não confirma falha no deploy. Aguarde o script
concluir todas as tentativas e considere a publicação válida somente quando ele
exibir `CLAREZA_DEPLOY_COMPLETED`. Se todas as tentativas falharem, verifique
primeiro a disponibilidade das rotas e os logs do Passenger antes de executar
um novo deploy:

```powershell
Invoke-WebRequest -UseBasicParsing https://itsites.com.br/clareza/
Invoke-WebRequest -UseBasicParsing https://itsites.com.br/clareza/api/data
```

Quando essas rotas retornarem `200`, confira também
`https://itsites.com.br/clareza/deploy-version.json` e compare o campo `commit`
com `git rev-parse HEAD` no checkout publicado.

## Teste local sem deploy

Para validar a interface com dados atuais sem alterar o MySQL e sem publicar,
gere um snapshot pela API e inicie o servidor em modo protegido:

```powershell
npm.cmd run dev:local-snapshot
```

Esse modo lê apenas `local-snapshot.json`, um arquivo temporário ignorado pelo
Git. O pool MySQL não é criado e todos os endpoints de escrita são bloqueados.
O script de deploy não envia esse arquivo. A passphrase, credenciais e URLs
com segredos nunca devem ser gravadas no snapshot ou na linha de comando.
Para atualizar somente o arquivo, sem iniciar o servidor, execute
`.github\scripts\create-local-snapshot.ps1` diretamente.

### Autenticação SFTP

O script usa a chave SSH protegida por senha em `~/.ssh/clareza_cpanel_deploy`. Carregue-a no `ssh-agent` antes do deploy. Para usar outro arquivo ou ajustar o destino sem editar o script, defina:

```powershell
$env:CLAREZA_SSH_KEY = "$HOME\.ssh\clareza_cpanel_deploy"
$env:CLAREZA_SFTP_HOST = "itsites.com.br"
$env:CLAREZA_SFTP_USER = "itsitescom"
$env:CLAREZA_SFTP_ROOT = "/home1/itsitescom/public_html/clareza"
```

No Windows, ative o serviço e carregue a chave com:

```powershell
Set-Service -Name ssh-agent -StartupType Manual
Start-Service -Name ssh-agent
ssh-add "$HOME\.ssh\clareza_cpanel_deploy"
```

O script verifica essa identidade antes de iniciar o build. Se o serviço estiver
parado ou a chave não estiver carregada, ele interrompe imediatamente e mostra
o comando necessário, sem tentar publicar arquivos ou expor a passphrase.
A passphrase não deve ser salva em variáveis de ambiente, scripts ou tarefas
agendadas.

Cadastre o conteúdo do arquivo `.pub` correspondente em **cPanel > SSH Access > Manage SSH Keys > Import Key > Authorization**, antes de executar o deploy. A chave privada nunca deve ser commitada ou enviada ao servidor.

Não replique a lógica SFTP em outro script ou comando manual. Se a validação falhar, interrompa o procedimento e preserve a saída do erro para investigação.

## Pós-publicação

Confirme HTTP 200 nas rotas:

```text
https://itsites.com.br/clareza/
https://itsites.com.br/clareza/api/data
```

Depois de mudanças em persistência, valide também uma leitura real dos catálogos, status, ordenação, exclusão, Fechamento de Caixa e Fechamento do mês. Não altere ou exclua registros de produção apenas para testar sem uma estratégia explícita de recuperação. Se o MySQL estiver indisponível, o servidor deve bloquear gravações CRUD e retornar `503`, nunca gravar um fallback JSON.

Para conferir rapidamente a versão servida:

```powershell
Invoke-WebRequest -UseBasicParsing https://itsites.com.br/clareza/deploy-version.json
```

O resultado esperado é JSON UTF-8 com `branch` e `commit`. Algumas interfaces podem representar a resposta como um objeto `Buffer`; nesse caso, decodifique os bytes com UTF-8 antes de avaliar o SHA. Não considere a publicação inválida por causa desse formato de apresentação: compare o campo `commit` com o SHA do `git rev-parse HEAD` do checkout validado.
