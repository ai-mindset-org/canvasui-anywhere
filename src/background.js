// Клик по иконке или хоткей: если контент-скрипт уже на странице, просим его
// переключить панель, иначе инжектим его в первый раз.
async function toggle(tab) {
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "cua:toggle" });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
    } catch (error) {
      console.warn("[canvasui-anywhere] cannot inject into this tab", error);
    }
  }
}

chrome.action.onClicked.addListener((tab) => toggle(tab));
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-panel") toggle(tab);
});
