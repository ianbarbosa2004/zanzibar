# Mensagens privadas

O Clareza possui um núcleo de comunicação privada entre usuários autorizados.
As conversas são individuais: cada conversa tem exatamente dois membros e o
servidor verifica a participação do usuário em toda leitura, gravação e
download.

## Rotas

- `GET /api/messaging/users`: lista usuários autorizados disponíveis.
- `GET /api/messaging/conversations`: lista as conversas do usuário autenticado.
- `POST /api/messaging/conversations`: cria ou reutiliza uma conversa privada.
- `GET /api/messaging/conversations/:id/messages`: lista mensagens da conversa.
- `POST /api/messaging/conversations/:id/messages`: envia texto e associa anexos.
- `POST /api/messaging/files`: recebe um arquivo multipart de até 10 MB.
- `GET /api/messaging/files/:id`: baixa um arquivo somente quando o usuário é
  dono ou membro da conversa que o utiliza.
- `POST /api/telegram/link-code`: gera um código de vinculação válido por 15
  minutos para o usuário autenticado.
- `POST /api/telegram/test`: envia uma mensagem de teste para o Telegram
  vinculado ao usuário autenticado, sem criar mensagem interna ou outbox.
- `POST /api/telegram/webhook`: recebe `/vincular CÓDIGO` do bot Telegram,
  protegido pelo header `X-Telegram-Bot-Api-Secret-Token`.

### Teste autenticado

Com o usuário autenticado no Clareza e o Telegram já vinculado, execute no
console do navegador:

```js
fetch("/clareza/api/telegram/test", { method: "POST" })
  .then((response) => response.json())
  .then(console.log);
```

A resposta esperada é `{"sent":true}` e a mensagem deve chegar ao chat
vinculado. Esse teste usa as variáveis carregadas pelo processo Passenger,
não cria usuário, conversa, mensagem interna nem entrada no outbox. O teste
real foi confirmado após a publicação da integração.

## Persistência e proteção

No MySQL, as tabelas `messaging_conversations`,
`messaging_conversation_members`, `messaging_messages`, `messaging_files` e
`messaging_message_files` preservam a separação por usuário. Os bytes dos
arquivos ficam em `CLAREZA_MESSAGING_FILES_DIR` ou, por padrão, em
`.messaging-files/`, fora da raiz pública.

O envio de mensagens cria entradas em `messaging_notification_outbox` separadas
por evento: `new_message` para texto e `new_file` para anexos. O consumidor
`scripts/process-telegram-outbox.js` deve ser executado por cron no ambiente
do Passenger quando as notificações estiverem habilitadas. Ele envia texto por
`sendMessage`, arquivos por `sendDocument` e registra o resultado no outbox.

Configure, somente no ambiente do Passenger, sem versionar valores:

- `CLAREZA_TELEGRAM_BOT_TOKEN`: token do BotFather, usado somente pelo worker.
- `CLAREZA_TELEGRAM_WEBHOOK_SECRET`: segredo usado para validar o webhook.
- `CLAREZA_TELEGRAM_NOTIFICATIONS_ENABLED=0`: mantém os envios desativados.
  Use `1` somente após configurar o token e o cron.

Quando habilitado, configure um cron no cPanel para executar o consumidor:

```bash
cd /home1/itsitescom/public_html/clareza
/home1/itsitescom/nodevenv/public_html/clareza/22/bin/node scripts/process-telegram-outbox.js
```

O consumidor termina após processar o lote disponível e pode ser executado
periodicamente. Falhas são registradas no outbox sem expor o token.

O modo local sem MySQL mantém os registros apenas em memória para testes e
desenvolvimento. Ele não transforma o fallback JSON em destino de gravações
operacionais.
