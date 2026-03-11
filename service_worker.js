// service_worker.js
async function enableSidePanelForTab(tabId) {
  try {
    await chrome.sidePanel.setOptions({
      tabId,
      path: "sidepanel/sidepanel.html",
      enabled: true
    });
  } catch (e) {
    console.warn("sidePanel.setOptions failed:", e?.message || e);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  console.log("ChatGPT SidePanel Dev Agent installed.");
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) if (t.id) await enableSidePanelForTab(t.id);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") enableSidePanelForTab(tabId);
});
chrome.tabs.onCreated.addListener((tab) => { if (tab.id) enableSidePanelForTab(tab.id); });

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (tab.id) {
      await enableSidePanelForTab(tab.id);
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  } catch (e) {
    console.warn("sidePanel.open failed:", e?.message || e);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "SW_PING") {
    sendResponse({ ok: true, ts: Date.now() });
    return true;
  }
});
