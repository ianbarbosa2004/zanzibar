# Publicação no cPanel

## Ambiente

O entrypoint do CloudLinux Passenger é `server.js`. A aplicação usa `/clareza/` como caminho base e o servidor precisa receber as variáveis MySQL pelo Application Manager do cPanel. Os nomes das variáveis estão documentados no README; os valores, especialmente a senha, nunca devem ser registrados no Git ou neste arquivo.

O `.htaccess` é administrado pelo cPanel e não deve ser sobrescrito. Dados de produção ficam no MySQL; os arquivos `data.json`, `settings.json` e `incomes.json` são apenas fallback local ou runtime e devem ser preservados.

## Procedimento oficial

Execute somente a partir de uma cópia limpa do branch `main`, depois que o pull request tiver sido mesclado:

```powershell
git fetch origin main
git switch main
git pull --ff-only origin main
powershell -NoProfile -ExecutionPolicy Bypass -File .github\scripts\deploy.ps1
```

O script bloqueia a publicação se `HEAD` não for exatamente igual a `origin/main`. Depois do upload, ele publica `deploy-version.json` com o SHA do commit e confirma por HTTP que o cPanel está servindo esse mesmo SHA. A saída `CLAREZA_DEPLOY_COMMIT` é a referência da versão efetivamente publicada.

O script oficial:

- valida o código e gera o build;
- cria backups remotos dos JSON existentes sem colocá-los no Git;
- envia `dist/`, `server.js`, `src/` e os manifestos npm;
- reinstala dependências no ambiente Node do cPanel;
- reinicia o Passenger;
- valida a aplicação e a API online.
- confirma que o commit publicado é o mesmo commit de `origin/main`.

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

Cadastre o conteúdo do arquivo `.pub` correspondente em **cPanel > SSH Access > Manage SSH Keys > Import Key > Authorization**, antes de executar o deploy. A chave privada nunca deve ser commitada ou enviada ao servidor.

Não replique a lógica SFTP em outro script ou comando manual. Se a validação falhar, interrompa o procedimento e preserve a saída do erro para investigação.

## Pós-publicação

Confirme HTTP 200 nas rotas:

```text
https://itsites.com.br/clareza/
https://itsites.com.br/clareza/api/data
```

Depois de mudanças em persistência, valide também uma leitura real dos catálogos, status, ordenação, exclusão e Fechamento de Caixa. Não altere ou exclua registros de produção apenas para testar sem uma estratégia explícita de recuperação.

Para conferir rapidamente a versão servida:

```powershell
Invoke-WebRequest -UseBasicParsing https://itsites.com.br/clareza/deploy-version.json
```
