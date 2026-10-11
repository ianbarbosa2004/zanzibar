# OAuth do Google

## Configuração no Google Cloud Console

1. Abra o [Google Cloud Console](https://console.cloud.google.com/) e selecione
   o projeto que hospedará o Clareza. Se ainda não existir, crie um projeto.
2. Em **APIs e serviços > Tela de consentimento OAuth**, escolha **Externo**,
   informe o nome `Clareza` e o e-mail de suporte. Adicione o e-mail do
   administrador e, se o aplicativo estiver em teste, inclua os usuários de
   teste. Salve e avance pelas etapas.
3. Em **APIs e serviços > Credenciais**, clique em **Criar credenciais >
   ID do cliente OAuth**.
4. Escolha **Aplicativo da Web** e dê um nome identificável, como
   `Clareza produção`.
5. Em **Origens JavaScript autorizadas**, informe a origem sem a barra final,
   por exemplo `https://seudominio.com`.
6. Em **URIs de redirecionamento autorizados**, informe exatamente a URL de
   callback, por exemplo `https://seudominio.com/clareza/auth/google/callback`.
   O caminho deve coincidir com `GOOGLE_REDIRECT_URI`; protocolo, domínio,
   porta e caminho precisam ser idênticos.
7. Clique em **Criar**, copie o **ID do cliente** e guarde o **segredo do
   cliente** em um gerenciador seguro. Nunca os coloque no frontend, Git,
   `data.json`, `settings.json` ou em mensagens.

## Arquivo de segredos fora do deploy

Quando o provedor não disponibilizar o Node.js Selector, crie o arquivo
diretamente no servidor, fora do diretório da aplicação e fora do caminho
sincronizado pelo SFTP. Por exemplo:

```text
/home/USUARIO/clareza-secrets.json
```

Use permissão `600` e o conteúdo abaixo, substituindo os valores:

```json
{
  "GOOGLE_CLIENT_ID": "...",
  "GOOGLE_CLIENT_SECRET": "...",
  "GOOGLE_REDIRECT_URI": "https://seudominio.com/clareza/auth/google/callback",
  "CLAREZA_SESSION_SECRET": "uma-string-aleatoria-longa-e-secreta",
  "CLAREZA_ADMIN_EMAIL": "pbsjr1@gmail.com",
  "CLAREZA_COOKIE_SECURE": "1"
}
```

Por padrão, o Clareza procura `clareza-secrets.json` no diretório home do
usuário que executa o Passenger. Se o arquivo ficar em outro local, o provedor
deve configurar `CLAREZA_SECRETS_FILE` no Passenger apontando para o caminho
absoluto. Essa variável contém somente o caminho; os segredos continuam no
arquivo fora do deploy.

## Variáveis no servidor

Configure no ambiente do Node/Passenger:

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://seudominio.com/clareza/auth/google/callback
CLAREZA_SESSION_SECRET=uma-string-aleatoria-longa-e-secreta
CLAREZA_ADMIN_EMAIL=pbsjr1@gmail.com
CLAREZA_COOKIE_SECURE=1
```

`CLAREZA_SESSION_SECRET` deve ser uma string aleatória longa. O callback e os
segredos existem somente no servidor. Depois de salvar as variáveis, reinicie
o aplicativo Passenger.

O arquivo JSON e as variáveis são alternativas: o arquivo tem prioridade quando
existe. Nunca envie esse arquivo por SFTP, nunca o coloque no Git e nunca o
salve dentro do diretório publicado.

## Primeiro acesso e autorização

1. Acesse o Clareza e clique em **Continuar com Google**.
2. Entre com `pbsjr1@gmail.com`. Esse endereço é o administrador inicial e é
   autorizado automaticamente.
3. Para outra pessoa, peça que ela faça login uma vez. A conta aparecerá em
   **Ferramentas > Autorização de usuários** como bloqueada.
4. O administrador deve clicar em **Autorizar**. Na próxima tentativa, o
   usuário terá acesso.
5. Para remover o acesso, clique em **Bloquear**. Sessões existentes deixam de
   ser aceitas na próxima requisição.

O aplicativo valida o código OAuth no servidor, consulta o endpoint OpenID
UserInfo do Google, armazena somente identidade, autorização e sessões
hash-adas no MySQL e nunca armazena o token de acesso do Google.
