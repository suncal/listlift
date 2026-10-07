// ListLift background service worker (MV3)
// Core responsibilities: usage metering (free-tier paywall) + calling the AI proxy.
// The proxy holds the AI API key. NEVER put an API key in this file — it ships to users.

// ── CONFIG ─────────────────────────────────────────────────────────────────
// After you deploy proxy/worker.js to Cloudflare, paste its URL here:
const PROXY_URL = "https://listlift-proxy.YOUR-SUBDOMAIN.workers.dev/generate";
const FREE_LIMIT = 3; // free listings before the paywall
// ───────────────────────────────────────────────────────────────────────────

async function getState() {
  const { used = 0, paid = false } = await chrome.storage.local.get(["used", "paid"]);
  return { used, paid };
}

async function generate({ image, imageMediaType, keywords }) {
  const { used, paid } = await getState();

  if (!paid && used >= FREE_LIMIT) {
    return { ok: false, paywall: true, used, limit: FREE_LIMIT };
  }

  let resp;
  try {
    resp = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, imageMediaType, keywords })
    });
  } catch (e) {
    return { ok: false, error: "Network error reaching the AI service. Is PROXY_URL set in background.js?" };
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    return { ok: false, error: `AI service error (${resp.status}). ${detail.slice(0, 180)}` };
  }

  let listing;
  try {
    listing = await resp.json();
  } catch (e) {
    return { ok: false, error: "AI service returned an unexpected response." };
  }

  // Meter the successful generation.
  await chrome.storage.local.set({ used: used + 1 });

  return { ok: true, listing, used: used + 1, limit: FREE_LIMIT, paid };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "generate") {
    generate(msg.payload).then(sendResponse);
    return true; // async
  }
  if (msg?.type === "getUsage") {
    getState().then((s) => sendResponse({ ...s, limit: FREE_LIMIT }));
    return true;
  }
  // Dev helper: mark as paid locally (real paywall = ExtensionPay/Stripe, added later).
  if (msg?.type === "devSetPaid") {
    chrome.storage.local.set({ paid: !!msg.value }).then(() => sendResponse({ ok: true }));
    return true;
  }
});
