// Instagram Graph API - Reels publish.
// 2 asama: (1) media container olustur  (2) islenince publish et.
// Secret: IG_USER_ID, IG_ACCESS_TOKEN (long-lived Page token).

const IG_USER = process.env.IG_USER_ID || "";
const IG_TOKEN = process.env.IG_ACCESS_TOKEN || "";
const API = "https://graph.facebook.com/v21.0";

export function igReady() { return !!(IG_USER && IG_TOKEN); }

async function post(pathname, body) {
  const url = `${API}${pathname}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, access_token: IG_TOKEN }),
  });
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(`IG ${pathname}: ${JSON.stringify(j.error || j)}`);
  return j;
}

async function get(pathname, params = {}) {
  const qs = new URLSearchParams({ ...params, access_token: IG_TOKEN });
  const res = await fetch(`${API}${pathname}?${qs}`);
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(`IG GET ${pathname}: ${JSON.stringify(j.error || j)}`);
  return j;
}

export async function createReelContainer({ videoUrl, caption, coverUrl }) {
  if (!igReady()) throw new Error("IG env eksik (IG_USER_ID / IG_ACCESS_TOKEN).");
  const body = {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    share_to_feed: true,
  };
  if (coverUrl) body.cover_url = coverUrl;
  const j = await post(`/${IG_USER}/media`, body);
  return j.id; // container id
}

export async function waitForContainerReady(id, { timeoutMs = 180000, pollMs = 4000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const j = await get(`/${id}`, { fields: "status_code,status" });
    if (j.status_code === "FINISHED") return j;
    if (j.status_code === "ERROR" || j.status_code === "EXPIRED") {
      throw new Error(`IG container hata: ${JSON.stringify(j)}`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error("IG container timeout");
}

export async function publishContainer(id) {
  const j = await post(`/${IG_USER}/media_publish`, { creation_id: id });
  return j.id; // media id
}

export async function publishReel({ videoUrl, caption, coverUrl }) {
  const containerId = await createReelContainer({ videoUrl, caption, coverUrl });
  console.log(`  container: ${containerId} — processing bekleniyor...`);
  await waitForContainerReady(containerId);
  const mediaId = await publishContainer(containerId);
  console.log(`  ✓ yayinlandi media_id=${mediaId}`);
  return { containerId, mediaId };
}
