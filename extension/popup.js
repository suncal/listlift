// ListLift popup — a generator that works anywhere (for testing) + usage/paywall UI.
let current = null;

async function refreshUsage() {
  const s = await chrome.runtime.sendMessage({ type: "getUsage" });
  const el = document.getElementById("usage");
  if (s.paid) el.textContent = "Unlimited";
  else el.textContent = `${Math.max(0, s.limit - s.used)} free left`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

document.getElementById("go").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const file = document.getElementById("file").files?.[0];
  const kw = document.getElementById("kw").value.trim();
  if (!file && !kw) { status.textContent = "Add a photo or a few words first."; return; }

  status.textContent = "Writing your listing…";
  document.getElementById("result").hidden = true;
  document.getElementById("paywall").hidden = true;

  let image = null, imageMediaType = null;
  if (file) { image = await fileToBase64(file); imageMediaType = file.type; }

  const res = await chrome.runtime.sendMessage({
    type: "generate",
    payload: { image, imageMediaType, keywords: kw }
  });

  if (!res?.ok) {
    if (res?.paywall) {
      status.textContent = "";
      document.getElementById("paywall").hidden = false;
    } else {
      status.textContent = res?.error || "Something went wrong.";
    }
    return;
  }

  current = res.listing;
  document.getElementById("r-title").textContent = current.title || "";
  document.getElementById("r-tags").textContent = (current.tags || []).join(", ");
  document.getElementById("r-desc").textContent = current.description || "";
  document.getElementById("result").hidden = false;
  status.textContent = "Done.";
  refreshUsage();
});

document.querySelectorAll(".copy").forEach((b) =>
  b.addEventListener("click", () => {
    if (!current) return;
    const k = b.dataset.k;
    navigator.clipboard.writeText(k === "tags" ? (current.tags || []).join(", ") : current[k] || "");
    b.textContent = "Copied";
    setTimeout(() => (b.textContent = "Copy"), 1200);
  })
);

document.getElementById("upgrade").addEventListener("click", () => {
  // TODO: wire ExtensionPay / Stripe checkout. For now, dev toggle below simulates paid.
  alert("Checkout coming soon. Use 'I paid (dev toggle)' to test the unlocked flow.");
});

document.getElementById("devpaid").addEventListener("click", async () => {
  const s = await chrome.runtime.sendMessage({ type: "getUsage" });
  await chrome.runtime.sendMessage({ type: "devSetPaid", value: !s.paid });
  refreshUsage();
});

refreshUsage();
