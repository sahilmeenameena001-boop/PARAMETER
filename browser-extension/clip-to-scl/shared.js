// Shared helpers for popup and background. The clip is placed in the URL fragment (#clip=...),
// which the browser never sends to any server; the SCL page reads it locally.
const DEFAULT_APP = "http://127.0.0.1:3000";
const MAX_SELECTION = 20000;

function encodeClip(clip) {
  const json = JSON.stringify(clip);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAppUrl() {
  const { appUrl } = await chrome.storage.sync.get({ appUrl: DEFAULT_APP });
  return String(appUrl || DEFAULT_APP).replace(/\/+$/, "");
}

async function sendClip({ url, title, selection }) {
  if (!/^https?:\/\//i.test(url || "")) throw new Error("Only http(s) pages can be clipped.");
  const clip = { url, title: (title || "").slice(0, 300), selection: (selection || "").slice(0, MAX_SELECTION), clippedAt: new Date().toISOString() };
  const app = await getAppUrl();
  await chrome.tabs.create({ url: `${app}/dashboard/professional-intelligence#clip=${encodeClip(clip)}` });
}
