// VeilAI Chrome Manifest V3 Background Service Worker
// Opens the Split-Brain Side Panel immediately when clicking the extension action icon.

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined && chrome.sidePanel?.open) {
    void chrome.sidePanel.open({ windowId: tab.windowId });
  }
});
