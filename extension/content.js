// ListLift content script — injects the inline "Write my listing" button on Etsy
// editor pages and renders results in-page so the seller never copy-pastes.

(function () {
  // Heuristic: only show on listing create/edit surfaces of the shop manager.
  const p = location.pathname.toLowerCase();
  const looksLikeEditor =
    p.includes("/listings/create") ||
    p.includes("/tools/listings") ||
    p.includes("/your/shops") ||
    p.includes("shop_manager");
  if (!looksLikeEditor) return;
  if (document.getElementById("listlift-fab")) return;

  // ── Floating action button ────────────────────────────────────────────────
  const fab = document.createElement("button");
  fab.id = "listlift-fab";
  fab.type = "button";
  fab.textContent = "✨ Write my listing";
  document.body.appendChild(fab);
  fab.addEventListener("click", openPanel);

  // ── Panel ──────────────────────────────────────────────────────────────────
  function openPanel() {
    if (document.getElementById("listlift-panel")) {
      document.getElementById("listlift-panel").style.display = "flex";
      return;
    }
    const panel = document.createElement("div");
    panel.id = "listlift-panel";
    panel.innerHTML = `
      <div class="ll-head">
        <span>ListLift</span>
        <button id="ll-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="ll-body">
        <label class="ll-label">Product photo</label>
        <input id="ll-file" type="file" accept="image/*" />
        <label class="ll-label">A few words (optional)</label>
        <input id="ll-kw" type="text" placeholder="e.g. handmade ceramic mug, boho" />
        <button id="ll-go" type="button" class="ll-primary">Write my listing</button>
        <div id="ll-status" class="ll-status"></div>
        <div id="ll-result" class="ll-result" hidden>
          <div class="ll-field"><h4>Title <button class="ll-copy" data-k="title">Copy</button></h4><p id="ll-title"></p></div>
          <div class="ll-field"><h4>Tags <button class="ll-copy" data-k="tags">Copy</button></h4><p id="ll-tags"></p></div>
          <div class="ll-field"><h4>Description <button class="ll-copy" data-k="description">Copy</button></h4><p id="ll-desc"></p></div>
          <button id="ll-fill" type="button" class="ll-primary">Fill Etsy fields</button>
        </div>
      </div>`;
    document.body.appendChild(panel);

    panel.querySelector("#ll-close").addEventListener("click", () => (panel.style.display = "none"));
    panel.querySelector("#ll-go").addEventListener("click", run);
    panel.querySelectorAll(".ll-copy").forEach((b) =>
      b.addEventListener("click", () => {
        const k = b.dataset.k;
        navigator.clipboard.writeText(k === "tags" ? current.tags.join(", ") : current[k] || "");
        b.textContent = "Copied";
        setTimeout(() => (b.textContent = "Copy"), 1200);
      })
    );
    panel.querySelector("#ll-fill").addEventListener("click", fillEtsyFields);
  }

  let current = null;

  async function run() {
    const status = document.getElementById("ll-status");
    const fileEl = document.getElementById("ll-file");
    const kw = document.getElementById("ll-kw").value.trim();
    const file = fileEl.files?.[0];
    if (!file && !kw) {
      status.textContent = "Add a photo or a few words first.";
      return;
    }
    status.textContent = "Writing your listing…";
    document.getElementById("ll-result").hidden = true;

    let image = null, imageMediaType = null;
    if (file) {
      image = await fileToBase64(file);
      imageMediaType = file.type;
    }

    const res = await chrome.runtime.sendMessage({
      type: "generate",
      payload: { image, imageMediaType, keywords: kw }
    });

    if (!res?.ok) {
      if (res?.paywall) {
        status.innerHTML = `You've used your ${res.limit} free listings. <a href="#" id="ll-upgrade">Upgrade to unlimited →</a>`;
        document.getElementById("ll-upgrade")?.addEventListener("click", (e) => {
          e.preventDefault();
          // TODO: wire ExtensionPay/Stripe checkout here.
          alert("Checkout coming soon. (Dev: use the popup's 'I paid (dev)' toggle to test.)");
        });
      } else {
        status.textContent = res?.error || "Something went wrong.";
      }
      return;
    }

    current = res.listing;
    document.getElementById("ll-title").textContent = current.title || "";
    document.getElementById("ll-tags").textContent = (current.tags || []).join(", ");
    document.getElementById("ll-desc").textContent = current.description || "";
    document.getElementById("ll-result").hidden = false;
    const left = res.paid ? "unlimited" : `${Math.max(0, res.limit - res.used)} free left`;
    status.textContent = `Done — ${left}.`;
  }

  // Best-effort auto-fill. Etsy's DOM changes often, so this tries several
  // selectors and falls back to clipboard. Verify selectors against live Etsy.
  function fillEtsyFields() {
    if (!current) return;
    const set = (el, val) => {
      if (!el) return false;
      el.focus();
      el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    };
    const titleEl =
      document.querySelector('input[name="title"]') ||
      document.querySelector('#listing-title-input') ||
      document.querySelector('input[maxlength="140"]');
    const descEl =
      document.querySelector('textarea[name="description"]') ||
      document.querySelector('#listing-description-input') ||
      document.querySelector("textarea");

    const okTitle = set(titleEl, current.title);
    const okDesc = set(descEl, current.description);

    if (!okTitle || !okDesc) {
      navigator.clipboard.writeText(
        `TITLE:\n${current.title}\n\nTAGS:\n${(current.tags || []).join(", ")}\n\nDESCRIPTION:\n${current.description}`
      );
      document.getElementById("ll-status").textContent =
        "Couldn't find all Etsy fields — full listing copied to clipboard instead.";
    } else {
      document.getElementById("ll-status").textContent =
        "Title + description filled. Tags copied — paste them into the tags box.";
      navigator.clipboard.writeText((current.tags || []).join(", "));
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]); // strip data: prefix
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
})();
