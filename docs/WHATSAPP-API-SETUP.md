# Configuração externa da WhatsApp Cloud API

Este documento descreve a configuração externa da **WhatsApp Business
Platform - Cloud API**, antes de qualquer implementação no Clareza.

O projeto ainda não possui integração com WhatsApp. Não coloque tokens, App
Secrets, números de produção ou dados de clientes neste arquivo, no Git ou em
mensagens de commit.

## 1. Criar ou confirmar a conta Meta

1. Acesse [Meta for Developers](https://developers.facebook.com/).
2. Faça o registro de desenvolvedor, se necessário.
3. Abra o [Business Settings](https://business.facebook.com/latest/settings).
4. Crie ou selecione o **Business Portfolio** correto.
5. Complete a verificação da empresa quando a Meta solicitar.

O Business Portfolio é o contêiner dos ativos da empresa e é necessário para
usar a WhatsApp Business Platform.

## 2. Criar o aplicativo Meta

1. Acesse o [Meta App Dashboard](https://developers.facebook.com/apps).
2. Clique em **Create App**.
3. Escolha o caso de uso **Connect with customers through WhatsApp**.
4. Informe o nome do aplicativo e o e-mail de contato.
5. Associe o app ao Business Portfolio correto.
6. Confirme a criação.
7. Abra o produto **WhatsApp** no painel do app.

## 3. Criar ou conectar a conta WhatsApp Business

No painel **WhatsApp > API Setup**:

1. Selecione uma conta WhatsApp Business existente ou crie uma nova.
2. Confirme que o app está conectado à conta.
3. Salve o identificador exibido como **WhatsApp Business Account ID**,
   também chamado de **WABA ID** ou Messaging Account ID.

O identificador não é um segredo, mas deve ser mantido junto da configuração
do ambiente correto:

```text
CLAREZA_WHATSAPP_BUSINESS_ACCOUNT_ID
```

## 4. Configurar o número de telefone

Para testes, use o número de teste fornecido pela Meta. Para produção:

1. Abra a seção de números de telefone do WhatsApp Business.
2. Adicione um número empresarial.
3. Confirme o número por SMS ou chamada.
4. Configure o nome de exibição e o perfil da empresa.
5. Aguarde a aprovação do nome, se necessário.
6. Salve o **Phone Number ID**.

O Phone Number ID é diferente do número de telefone exibido:

```text
CLAREZA_WHATSAPP_PHONE_NUMBER_ID
CLAREZA_WHATSAPP_DISPLAY_PHONE_NUMBER
```

Não migre o número principal usado em uma conta pessoal ou no WhatsApp
Business sem confirmar previamente o impacto e a possibilidade de
desvinculação.

## 5. Enviar a primeira mensagem de teste

No painel **WhatsApp > API Setup**:

1. Clique em **Generate access token**.
2. Selecione o número de origem.
3. Cadastre um número de destino autorizado para teste.
4. Clique em **Send message**.
5. Responda à mensagem recebida no WhatsApp.

O token inicial é temporário e serve somente para validar a configuração. Não
o use em produção.

A chamada de envio usa o seguinte formato:

```text
POST https://graph.facebook.com/{API_VERSION}/{PHONE_NUMBER_ID}/messages
```

Exemplo genérico em PowerShell:

```powershell
$headers = @{
  "Authorization" = "Bearer SEU_TOKEN"
  "Content-Type" = "application/json"
}

$body = @{
  messaging_product = "whatsapp"
  recipient_type = "individual"
  to = "5511999999999"
  type = "text"
  text = @{
    preview_url = $false
    body = "Mensagem de teste"
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method Post `
  -Uri "https://graph.facebook.com/API_VERSION/PHONE_NUMBER_ID/messages" `
  -Headers $headers `
  -Body $body
```

Use a versão Graph API vigente indicada no painel e na documentação da Meta.
Não fixe uma versão antiga sem necessidade.

## 6. Criar um System User para produção

O token temporário expira e não deve ser usado pelo Clareza.

1. Abra o [Business Settings](https://business.facebook.com/latest/settings).
2. Entre em **Users > System Users**.
3. Clique em **Add**.
4. Crie um usuário técnico, por exemplo `clareza-whatsapp-api`.
5. Selecione o System User criado.
6. Clique em **Assign Assets**.
7. Atribua o aplicativo Meta e a conta WhatsApp Business.
8. Conceda somente as permissões necessárias.
9. Gere o token para o app.

As permissões normalmente envolvidas são:

```text
business_management
whatsapp_business_messaging
whatsapp_business_management
```

O token deve ser armazenado em um cofre de segredos ou em uma variável
protegida do ambiente de produção:

```text
CLAREZA_WHATSAPP_ACCESS_TOKEN
```

Nunca coloque o token em código, `.env` versionado, Markdown, scripts,
screenshots, commits ou arquivos JSON de runtime.

## 7. Configurar o webhook HTTPS

Será necessária uma URL pública HTTPS, por exemplo:

```text
https://seu-dominio.com/clareza/api/whatsapp/webhook
```

Antes da implementação no Clareza, defina no ambiente seguro:

```text
CLAREZA_WHATSAPP_WEBHOOK_URL
CLAREZA_WHATSAPP_WEBHOOK_VERIFY_TOKEN
CLAREZA_WHATSAPP_APP_SECRET
```

O `WEBHOOK_VERIFY_TOKEN` é um segredo criado pela aplicação para a validação
inicial. Ele é diferente do access token e do App Secret.

### Validação GET

A Meta enviará:

```text
hub.mode
hub.verify_token
hub.challenge
```

O endpoint deve:

1. Confirmar que `hub.mode` é `subscribe`.
2. Comparar `hub.verify_token` com o segredo configurado.
3. Responder HTTP `200` contendo somente `hub.challenge`.
4. Rejeitar a solicitação quando o token não coincidir.

### Eventos POST

O endpoint deve:

1. Aceitar `application/json`.
2. Validar o header `X-Hub-Signature-256`.
3. Calcular HMAC-SHA256 usando o corpo bruto e o App Secret.
4. Comparar a assinatura de forma segura.
5. Rejeitar payload inválido com HTTP `401` ou `403`.
6. Responder rapidamente HTTP `200`.
7. Processar eventos de forma idempotente, pois a Meta pode reenviá-los.

Os eventos incluem mensagens recebidas e estados de mensagens enviadas, como
`sent`, `delivered` e `read`.

## 8. Registrar o webhook no painel Meta

1. Abra **WhatsApp > Configuration** no painel do app.
2. Informe a **Callback URL** HTTPS.
3. Informe o mesmo **Verify Token** configurado no servidor.
4. Clique em **Verify and Save**.
5. Inscreva o app no campo de webhook `messages`.
6. Envie uma mensagem para o número empresarial.
7. Confirme que o POST chega ao servidor.
8. Confirme também os eventos de status das mensagens enviadas.

O endpoint deve ser público, usar certificado TLS válido e não depender de uma
sessão de navegador.

## 9. Regras de mensagens

### Janela de atendimento

Quando o usuário envia uma mensagem para a empresa, abre-se uma janela de
atendimento de 24 horas. Dentro dela, normalmente podem ser enviadas
mensagens livres.

Fora dessa janela, o envio proativo normalmente exige um template aprovado
pela Meta.

### Templates

Crie e aprove templates no WhatsApp Manager para confirmações, lembretes,
alertas financeiros e notificações operacionais. Cada template deve ter:

- nome estável;
- idioma;
- categoria correta;
- corpo aprovado;
- variáveis parametrizadas;
- conteúdo compatível com as políticas da Meta.

O Clareza deve selecionar templates aprovados e validar seus parâmetros. Não
deve montar textos arbitrários para envios fora da janela de atendimento.

### Opt-in e opt-out

Antes de enviar mensagens proativas:

1. Obtenha consentimento explícito do usuário.
2. Registre quando, onde e para qual finalidade o consentimento foi dado.
3. Permita cancelamento ou opt-out.
4. Não use listas compradas ou contatos sem autorização.
5. Não use o WhatsApp para spam.

Uma futura implementação deve manter o consentimento separado das mensagens,
com dados equivalentes a:

```text
user_id
phone_number
purpose
consented_at
revoked_at
source
```

## 10. Separar teste e produção

### Teste

```text
CLAREZA_WHATSAPP_ENABLED=0
CLAREZA_WHATSAPP_ACCESS_TOKEN=(token temporário ou de teste)
CLAREZA_WHATSAPP_BUSINESS_ACCOUNT_ID=(WABA de teste)
CLAREZA_WHATSAPP_PHONE_NUMBER_ID=(número de teste)
CLAREZA_WHATSAPP_WEBHOOK_VERIFY_TOKEN=(segredo de teste)
CLAREZA_WHATSAPP_APP_SECRET=(segredo do app de teste)
```

### Produção

```text
CLAREZA_WHATSAPP_ENABLED=1
CLAREZA_WHATSAPP_ACCESS_TOKEN=(token do System User)
CLAREZA_WHATSAPP_BUSINESS_ACCOUNT_ID=(WABA real)
CLAREZA_WHATSAPP_PHONE_NUMBER_ID=(número real)
CLAREZA_WHATSAPP_WEBHOOK_VERIFY_TOKEN=(segredo forte)
CLAREZA_WHATSAPP_APP_SECRET=(App Secret)
CLAREZA_WHATSAPP_API_VERSION=(versão aprovada)
```

Os valores reais devem ser configurados no Application Manager/cPanel ou no
ambiente seguro equivalente.

## 11. Checklist antes de integrar ao Clareza

- [ ] Business Portfolio criado e correto.
- [ ] App Meta criado com WhatsApp.
- [ ] WhatsApp Business Account conectada.
- [ ] Número empresarial aprovado.
- [ ] WABA ID confirmado.
- [ ] Phone Number ID confirmado.
- [ ] Mensagem de teste enviada e recebida.
- [ ] System User criado.
- [ ] Token de produção gerado.
- [ ] Permissões revisadas.
- [ ] Webhook HTTPS publicado.
- [ ] Validação GET do webhook funcionando.
- [ ] Assinatura `X-Hub-Signature-256` validada.
- [ ] Evento `messages` inscrito.
- [ ] Template aprovado para mensagens fora da janela.
- [ ] Processo de opt-in e opt-out definido.
- [ ] Logs sem tokens, App Secret ou dados desnecessários.
- [ ] Ambientes de teste e produção separados.

## 12. Dados necessários para a futura integração

Quando a configuração externa estiver pronta, a implementação no Clareza
provavelmente precisará destes nomes de configuração:

```text
CLAREZA_WHATSAPP_ENABLED
CLAREZA_WHATSAPP_ACCESS_TOKEN
CLAREZA_WHATSAPP_BUSINESS_ACCOUNT_ID
CLAREZA_WHATSAPP_PHONE_NUMBER_ID
CLAREZA_WHATSAPP_WEBHOOK_VERIFY_TOKEN
CLAREZA_WHATSAPP_APP_SECRET
CLAREZA_WHATSAPP_API_VERSION
```

Não envie os valores secretos. Para iniciar a implementação futura, basta
informar que o app foi criado, o número foi aprovado, o webhook foi validado,
o token está configurado no ambiente do servidor e fornecer o WABA ID e o
Phone Number ID.

## Referências oficiais

- [WhatsApp Cloud API - Get Started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
- [About the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform)
- [Messages Webhook Reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages)
