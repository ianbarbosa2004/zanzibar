const telegramApiUrl = (token, method) => `https://api.telegram.org/bot${token}/${method}`;

function assertTelegramResponse(response, method) {
  if (!response.ok) throw new Error(`Telegram ${method} retornou HTTP ${response.status}.`);
  return response.json().then((body) => {
    if (!body?.ok) throw new Error(`Telegram ${method} recusou a solicitação.`);
    return body;
  });
}

export async function sendTelegramMessage({ token, chatId, text, fetchImpl = fetch }) {
  const response = await fetchImpl(telegramApiUrl(token, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: String(chatId), text }),
  });
  return assertTelegramResponse(response, "sendMessage");
}

export async function sendTelegramDocument({ token, chatId, file, caption, fetchImpl = fetch }) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("caption", caption);
  form.set("document", new Blob([file.bytes], { type: file.mimeType || "application/octet-stream" }), file.name);
  const response = await fetchImpl(telegramApiUrl(token, "sendDocument"), { method: "POST", body: form });
  return assertTelegramResponse(response, "sendDocument");
}

export async function sendTelegramOutboxEvent({ token, event, fetchImpl = fetch }) {
  if (event.eventType === "new_message") {
    return sendTelegramMessage({ token, chatId: event.chatId, text: event.body, fetchImpl });
  }
  for (const file of event.files) {
    await sendTelegramDocument({
      token,
      chatId: event.chatId,
      file,
      caption: event.body || `Novo arquivo: ${file.name}`,
      fetchImpl,
    });
  }
}
