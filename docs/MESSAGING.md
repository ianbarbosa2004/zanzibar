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

## Persistência e proteção

No MySQL, as tabelas `messaging_conversations`,
`messaging_conversation_members`, `messaging_messages`, `messaging_files` e
`messaging_message_files` preservam a separação por usuário. Os bytes dos
arquivos ficam em `CLAREZA_MESSAGING_FILES_DIR` ou, por padrão, em
`.messaging-files/`, fora da raiz pública.

O envio de cada mensagem cria uma entrada em
`messaging_notification_outbox` com o canal `whatsapp`. Nesta fase não há
credencial, chamada externa ou worker de WhatsApp: o outbox apenas prepara o
fluxo para uma integração futura com WhatsApp Cloud API ou Twilio.

O modo local sem MySQL mantém os registros apenas em memória para testes e
desenvolvimento. Ele não transforma o fallback JSON em destino de gravações
operacionais.
