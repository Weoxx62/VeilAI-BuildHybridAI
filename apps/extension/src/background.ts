// VeilAI Chrome Manifest V3 Background Service Worker
// Opens the Split-Brain Side Panel on action click or right-click text selection.

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
  if (chrome.contextMenus) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "veilai-shield-selection",
        title: "Shield & Review selection with VeilAI",
        contexts: ["selection"],
      });
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined && chrome.sidePanel?.open) {
    void chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "veilai-shield-selection" && info.selectionText) {
    const selected = info.selectionText.trim().slice(0, 50_000);
    if (!selected) return;
    chrome.storage?.local.set({
      veilaiPendingSelection: {
        text: selected,
        title: tab?.title || "Selected Page Excerpt",
        url: info.pageUrl || tab?.url || "",
        ts: Date.now(),
      },
    });
    if (tab?.windowId !== undefined && chrome.sidePanel?.open) {
      void chrome.sidePanel.open({ windowId: tab.windowId });
    }
  }
});
