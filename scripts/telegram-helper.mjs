import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "./lib/env.mjs";

const root = process.cwd();
loadEnv(root);
const mode = (process.argv[2] || "doctor").toLowerCase();
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const queuePath = path.join(root, "data", "social", "queue.json");

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN eksik. .env dosyasina ekleyin.");
  process.exit(1);
}

if (mode === "doctor") {
  await doctor();
} else if (mode === "updates") {
  await updates();
} else if (mode === "test") {
  await testMessage();
} else {
  console.error(`Bilinmeyen komut: ${mode}`);
  process.exit(1);
}

async function doctor() {
  const response = await api("getMe");
  console.log("Bot dogrulandi:");
  console.log(JSON.stringify(response.result, null, 2));
  if (chatId) {
    console.log(`TELEGRAM_CHAT_ID hazir: ${chatId}`);
  } else {
    console.log("TELEGRAM_CHAT_ID henuz yok. once botunuza /start gonderin, sonra `npm run telegram:updates` calistirin.");
  }
}

async function updates() {
  const response = await api("getUpdates");
  const simplified = (response.result || []).map((item) => {
    const message = item.message || item.channel_post || item.edited_channel_post || {};
    const chat = message.chat || {};
    return {
      update_id: item.update_id,
      chat_id: chat.id,
      chat_title: chat.title,
      chat_type: chat.type,
      text: message.text,
      from: message.from?.username,
    };
  });
  console.log(JSON.stringify(simplified, null, 2));
}

async function testMessage() {
  if (!chatId) {
    console.error("TELEGRAM_CHAT_ID eksik. once `npm run telegram:updates` ile chat id bulun.");
    process.exit(1);
  }

  let message = "Aktuel Karsilastirma test mesaji.";
  try {
    const queue = JSON.parse(await readFile(queuePath, "utf8"));
    message = queue.channels?.telegram?.body || message;
  } catch {}

  const response = await api("sendMessage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: false,
    }),
  });

  console.log("Telegram test mesaji gonderildi.");
  console.log(JSON.stringify({ message_id: response.result?.message_id, chat: response.result?.chat }, null, 2));
}

async function api(method, options = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, options);
  const body = await response.text();
  let json;

  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(`Telegram yaniti parse edilemedi: ${body}`);
  }

  if (!response.ok || !json.ok) {
    throw new Error(`Telegram API hatasi: ${response.status} ${body}`);
  }

  return json;
}
