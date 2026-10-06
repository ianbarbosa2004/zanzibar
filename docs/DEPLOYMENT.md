# Publicação no cPanel

## Ambiente

O entrypoint do CloudLinux Passenger é `server.js`. A aplicação usa `/clareza/` como caminho base e o servidor precisa receber as variáveis MySQL pelo Application Manager do cPanel. Os nomes das variáveis estão documentados no README; os valores, especialmente a senha, nunca devem ser registrados no Git ou neste arquivo.

O `.htaccess` é administrado pelo cPanel e não deve ser sobrescrito. Dados de produção ficam no MySQL; os arquivos `data.json`, `settings.json` e `incomes.json` são apenas fallback local ou runtime e devem ser preservados.

## Procedimento oficial

Execute a partir de uma cópia limpa do branch `main`:

```powershell
git fetch origin main
git switch main
git pull --ff-only origin main
powershell -NoProfile -ExecutionPolicy Bypass -File .github\scripts\deploy.ps1
```

O script oficial:

- valida o código e gera o build;
- cria backups remotos dos JSON existentes sem colocá-los no Git;
- envia `dist/`, `server.js`, `src/` e os manifestos npm;
- reinstala dependências no ambiente Node do cPanel;
- reinicia o Passenger;
- valida a aplicação e a API online.

Não replique a lógica SFTP em outro script ou comando manual. Se a validação falhar, interrompa o procedimento e preserve a saída do erro para investigação.

## Pós-publicação

Confirme HTTP 200 nas rotas:

```text
https://itsites.com.br/clareza/
https://itsites.com.br/clareza/api/data
```

Depois de mudanças em persistência, valide também uma leitura real dos catálogos, status, ordenação, exclusão e Fechamento de Caixa. Não altere ou exclua registros de produção apenas para testar sem uma estratégia explícita de recuperação.
