const MENU_READ = "read-aloud-selection";
const MENU_STOP = "read-aloud-stop";

// onInstalled alone is unreliable for unpacked reloads, so rebuild the menus on
// every service worker start. removeAll() first avoids duplicate-id failures.
function registerMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_READ,
      title: 'READ ALOUD: "%s"',
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: MENU_STOP,
      title: "STOP READING ALOUD",
      contexts: ["selection", "page"],
    });
  });
}

registerMenus();
chrome.runtime.onInstalled.addListener(registerMenus);
chrome.runtime.onStartup.addListener(registerMenus);

async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (existing.length > 0) return;

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play Fish Audio text-to-speech output triggered from the right-click menu.",
  });
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === MENU_STOP) {
    await ensureOffscreenDocument();
    chrome.runtime.sendMessage({ type: "read-aloud-stop" }).catch(() => {});
    return;
  }

  if (info.menuItemId !== MENU_READ) return;

  const text = (info.selectionText || "").trim();
  if (!text) return;

  const { fishApiKey } = await chrome.storage.local.get("fishApiKey");
  if (!fishApiKey) {
    chrome.runtime.openOptionsPage();
    return;
  }

  await ensureOffscreenDocument();
  chrome.runtime.sendMessage({
    type: "read-aloud-play",
    text,
    apiKey: fishApiKey,
  }).catch(() => {});
});
