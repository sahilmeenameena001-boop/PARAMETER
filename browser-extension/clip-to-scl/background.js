importScripts("shared.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "clip-selection", title: "Clip selection to SCL", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "clip-page", title: "Clip this page to SCL", contexts: ["page", "link"] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.menuItemId === "clip-page" && info.linkUrl ? info.linkUrl : info.pageUrl || tab?.url;
  try {
    await sendClip({ url, title: info.linkUrl ? "" : tab?.title, selection: info.menuItemId === "clip-selection" ? info.selectionText : "" });
  } catch (e) {
    console.warn("Clip to SCL:", e.message);
  }
});
