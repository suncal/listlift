// ListLift AI proxy — Cloudflare Worker.
// Holds the AI API key (as a Worker secret) and returns a structured Etsy listing.
// Deploy: `wrangler deploy`; set secret: `wrangler secret put ANTHROPIC_API_KEY`.
//
// Uses Claude Haiku (cheap + vision-capable) to protect margin at $9/mo.
// Swap MODEL / provider freely — the extension only expects JSON {title, tags[], description}.

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `You are an expert Etsy SEO copywriter. Given a product photo and/or a few keywords, produce ONE optimized Etsy listing.
Return ONLY valid JSON, no markdown, with exactly this shape:
{"title": string, "tags": string[13], "description": string}
Rules:
- title: <=140 chars, front-load the highest-intent buyer keywords, human-readable, no keyword spam.
- tags: exactly 13, each <=20 chars, lowercase, multi-word long-tail phrases, no duplicates, no punctuation.
- description: 120-200 words, structure = hook line, what it is / key details, materials or specs, care or usage, a short call to action. Plain text with line breaks.`;

function cors(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
    ...extra
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors() });

    let body;
    try { body = await request.json(); } catch { return json({ error: "Bad JSON" }, 400); }
    const { image, imageMediaType, keywords } = body || {};
    if (!image && !keywords) return json({ error: "Provide an image or keywords." }, 400);

    const userContent = [];
    if (image) {
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: imageMediaType || "image/jpeg", data: image }
      });
    }
    userContent.push({
      type: "text",
      text: keywords
        ? `Keywords/notes from the seller: ${keywords}. Write the listing.`
        : `Write the listing based on the product photo.`
    });

    let aiResp;
    try {
      aiResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM,
          messages: [{ role: "user", content: userContent }]
        })
      });
    } catch (e) {
      return json({ error: "Upstream AI request failed." }, 502);
    }

    if (!aiResp.ok) {
      const t = await aiResp.text().catch(() => "");
      return json({ error: `AI error ${aiResp.status}: ${t.slice(0, 200)}` }, 502);
    }

    const data = await aiResp.json();
    const text = data?.content?.[0]?.text || "";
    const listing = extractJson(text);
    if (!listing?.title) return json({ error: "Could not parse listing.", raw: text.slice(0, 300) }, 502);

    // Normalize: guarantee 13 tags max, trim.
    listing.tags = (listing.tags || []).slice(0, 13).map((t) => String(t).slice(0, 20));
    return json(listing, 200);
  }
};

function extractJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: cors() });
}
