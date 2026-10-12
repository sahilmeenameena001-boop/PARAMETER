const $ = (id) => document.getElementById(id);
let current = { url: "", title: "" };

async function init() {
  if (location.hash === "#settings") document.body.classList.add("settings");
  $("appUrl").value = await getAppUrl();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  current = { url: tab?.url || "", title: tab?.title || "" };
  $("title").textContent = current.title || "(untitled page)";
  $("url").textContent = current.url;
  if (!/^https?:\/\//i.test(current.url)) { $("send").disabled = true; $("error").textContent = "This page cannot be clipped (only http/https pages)."; return; }
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => String(window.getSelection() || "") });
    $("selection").value = (res?.result || "").trim();
  } catch {
    // Some pages (e.g. the Chrome Web Store) block scripts; the user can paste text instead.
  }
}

$("send").addEventListener("click", async () => {
  $("error").textContent = "";
  try { await sendClip({ ...current, selection: $("selection").value }); window.close(); }
  catch (e) { $("error").textContent = e.message; }
});
$("openSettings").addEventListener("click", () => document.body.classList.add("settings"));
$("save").addEventListener("click", async () => {
  const value = $("appUrl").value.trim() || DEFAULT_APP;
  try { const u = new URL(value); if (!/^https?:$/.test(u.protocol)) throw 0; } catch { $("saved").textContent = "Enter a valid http(s) address."; return; }
  await chrome.storage.sync.set({ appUrl: value });
  $("saved").textContent = "Saved.";
  setTimeout(() => document.body.classList.remove("settings"), 600);
});
init();
