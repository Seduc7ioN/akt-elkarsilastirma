// Claude Vision ile brosur sayfasinda urun bbox tespiti.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_VISION_MODEL || "claude-sonnet-4-5-20250929";

export async function detectBboxes(imageBuffer, mediaType, productNames) {
  // productNames: [{id, name}]; Claude'dan {id, x, y, w, h} listesi iste
  const list = productNames.map((p, i) => `${i + 1}. ${p.name}`).join("\n");
  const prompt = `Bu bir süpermarket aktüel broşür sayfasıdır. Asağıda listelenen ürünleri görselin üzerinde tespit et. Her ürün için normalize (0.0-1.0) bounding box koordinatları ver.

Ürün listesi:
${list}

Çıktı formatı — SADECE JSON, başka metin yok:
{"detections":[{"index":1,"x":0.12,"y":0.34,"w":0.18,"h":0.22},...]}

Kurallar:
- index: yukaridaki listedeki 1-based sira numarasi.
- x,y: ürün kutusunun SOL ÜST köşe koordinatı (sayfa boyutuna oranli).
- w,h: kutunun genisligi/yuksekligi.
- 0 <= x,y,w,h <= 1 ve x+w <= 1 ve y+h <= 1.
- Sayfada GÖRÜNMEYEN ürünleri çıktıya DAHIL ETME.
- Belirsiz/şüpheli tespit varsa dahil etme, atla. Sadece net gördüklerini ver.`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: imageBuffer.toString("base64") } },
        { type: "text", text: prompt },
      ],
    }],
  });

  const text = resp.content.map((b) => b.type === "text" ? b.text : "").join("\n");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Vision: JSON bulunamadi. Cevap: " + text.slice(0, 200));
  let parsed;
  try { parsed = JSON.parse(m[0]); } catch (e) { throw new Error("Vision: JSON parse: " + e.message); }
  const dets = Array.isArray(parsed.detections) ? parsed.detections : [];
  const out = [];
  for (const d of dets) {
    const idx = Number(d.index);
    if (!Number.isFinite(idx) || idx < 1 || idx > productNames.length) continue;
    const x = Number(d.x), y = Number(d.y), w = Number(d.w), h = Number(d.h);
    if (![x, y, w, h].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) continue;
    if (x + w > 1.001 || y + h > 1.001 || w <= 0 || h <= 0) continue;
    out.push({ productId: productNames[idx - 1].id, x, y, w, h });
  }
  return { detections: out, usage: resp.usage };
}
