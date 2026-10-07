# ListLift — AI Etsy Listing Writer (Chrome extension)

Write a full, SEO-optimized Etsy listing — title, all 13 tags, description —
from a product photo, in one click. Built to run solo from anywhere.

## What's here
```
listlift/
├── manifest.json      MV3 manifest
├── background.js      usage metering + paywall + calls the AI proxy  ← set PROXY_URL here
├── content.js/.css    inline ✨ button + panel on Etsy editor pages
├── popup.html/.js/.css generator that works anywhere (for testing) + paywall UI
├── proxy/
│   ├── worker.js      Cloudflare Worker that holds the AI key & returns the listing
│   └── wrangler.toml  deploy config
└── README.md
```

## Architecture (why a proxy)
The AI API key must **never** ship inside an extension (users can read it). So the
extension calls a tiny serverless proxy you own; the proxy holds the key and calls
the model. Cost per listing on Claude Haiku is a fraction of a cent → healthy
margin at $9/mo.

## Setup — 15 minutes
### 1. Deploy the AI proxy
```bash
cd proxy
npm i -g wrangler
wrangler login
wrangler secret put ANTHROPIC_API_KEY   # paste an Anthropic API key
wrangler deploy
```
Copy the printed URL, e.g. `https://listlift-proxy.yourname.workers.dev`.

### 2. Point the extension at it
In `background.js`, set:
```js
const PROXY_URL = "https://listlift-proxy.yourname.workers.dev/generate";
```
Also confirm `manifest.json` `host_permissions` covers your worker domain
(`https://*.workers.dev/*` is already included).

### 3. Load the extension
1. Chrome → `chrome://extensions` → toggle **Developer mode** (top right).
2. **Load unpacked** → select this `listlift/` folder.
3. Pin ListLift. Click the icon → upload a photo → **Write my listing**.

### 4. Test
- Popup generator works on any page (fast way to test the AI).
- On an Etsy listing editor page, the ✨ button appears bottom-right for inline fill.
- Free tier = 3 listings, then the paywall shows. Use **"I paid (dev toggle)"**
  in the popup footer to test the unlocked flow.

## Before publishing (open items)
- [ ] **Icons** — add 16/48/128px PNGs and reference them in `manifest.json`
      (`action.default_icon` + `icons`). Chrome Web Store requires them.
- [ ] **Real payments** — replace the dev toggle with [ExtensionPay](https://extensionpay.com)
      (built for extensions) or Stripe. Wire the `#upgrade` button + set `paid` on success.
- [ ] **Verify Etsy DOM** — confirm the live selectors in `content.js`
      `fillEtsyFields()` (title input / description textarea) and the editor URL
      heuristic. Etsy changes its DOM; clipboard fallback covers misses.
- [ ] **Confirm Etsy tag rules** — currently assumes 13 tags / 20 chars each.
- [ ] **Model cost check** — measure tokens per listing to lock margin at $9/mo.
- [ ] **Store listing copy + 5 screenshots** — draft in ../LISTLIFT_BUILD_PLAN.md.

## Roadmap after v1 ships
- A/B the paywall (3 vs 5 free; $7 vs $9).
- "Regenerate title only" / tone options once conversion is proven.
- Chrome Store SEO: title keywords, reviews prompt, Product Hunt + r/Etsy launch.
```
Scoreboard: installs → activations → paid conversions → MRR.
```
