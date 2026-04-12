import { readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { loadEnv } from "./lib/env.mjs";

const root = process.cwd();
loadEnv(root);
const queuePath = path.join(root, "data", "social", "queue.json");
const queue = JSON.parse(await readFile(queuePath, "utf8"));

const enabledChannels = (process.env.SOCIAL_CHANNELS || "telegram")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const failures = [];

for (const channel of enabledChannels) {
  try {
    if (channel === "telegram") {
      await publishTelegram(queue.channels.telegram);
      continue;
    }

    if (channel === "x") {
      await publishX(queue.channels.x);
      continue;
    }

    if (channel === "instagram") {
      console.log("Instagram paylasimi icin gorsel ve caption hazir. Bu surumde otomatik yayin yerine sosyal klasoru kullaniliyor.");
      continue;
    }

    console.log(`Bilinmeyen kanal atlandi: ${channel}`);
  } catch (error) {
    failures.push({ channel, message: error instanceof Error ? error.message : String(error) });
    console.log(`${channel.toUpperCase()} atlandi: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.log(`${failures.length} kanal hatayla tamamlandi, diger paylasimlar devam etti.`);
}

async function publishTelegram(post) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const siteUrl = (process.env.SITE_URL || "https://xn--aktelkarsilastirma-o6b.com").replace(/\/$/, "");

  if (!token || !chatId) {
    console.log("Telegram env bilgileri eksik. Mesaj taslagi queue.json icinde hazir.");
    return;
  }

  const message = `${post.body}\n\nSosyal onizleme: ${siteUrl}/social/`;

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: false,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Telegram gonderimi basarisiz: ${response.status} ${detail}`);
  }

  console.log("Telegram mesaji gonderildi.");
}

async function publishX(post) {
  const consumerKey = process.env.X_CONSUMER_KEY;
  const consumerSecret = process.env.X_CONSUMER_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    console.log("X env bilgileri eksik. Post taslagi queue.json icinde hazir.");
    return;
  }

  const endpoint = "https://api.x.com/2/tweets";
  const text = trimXText(post.body);
  const body = JSON.stringify({ text });
  const authHeader = createOAuthHeader({
    url: endpoint,
    method: "POST",
    consumerKey,
    consumerSecret,
    accessToken,
    accessTokenSecret,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: authHeader,
      "content-type": "application/json",
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 402) {
      throw new Error("X hesabinda API kredisi yok. X paylasimi icin ucretli kredi veya uygun plan gerekiyor.");
    }
    throw new Error(`X gonderimi basarisiz: ${response.status} ${detail}`);
  }

  const payload = await response.json();
  console.log(`X gonderisi paylasildi: ${payload?.data?.id ?? "id-alinamadi"}`);
}

function trimXText(value) {
  const normalized = String(value || "").replace(/\r/g, "").trim();
  if (normalized.length <= 280) return normalized;

  const lines = normalized.split("\n").filter(Boolean);
  const kept = [];

  for (const line of lines) {
    const candidate = [...kept, line].join("\n");
    if (candidate.length > 260) break;
    kept.push(line);
  }

  const compact = kept.join("\n").trim();
  if (compact.length <= 277) return `${compact}\n...`;
  return `${compact.slice(0, 277).trimEnd()}...`;
}

function createOAuthHeader({ url, method, consumerKey, consumerSecret, accessToken, accessTokenSecret }) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  const parameterString = Object.entries(oauthParams)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeRFC3986(key)}=${encodeRFC3986(value)}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    encodeRFC3986(url),
    encodeRFC3986(parameterString),
  ].join("&");

  const signingKey = `${encodeRFC3986(consumerSecret)}&${encodeRFC3986(accessTokenSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  const headerParams = {
    ...oauthParams,
    oauth_signature: signature,
  };

  const header = Object.entries(headerParams)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeRFC3986(key)}="${encodeRFC3986(value)}"`)
    .join(", ");

  return `OAuth ${header}`;
}

function encodeRFC3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}
