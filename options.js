const apiKeyInput = document.getElementById("apiKey");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");

async function loadApiKey() {
  const { fishApiKey } = await chrome.storage.local.get("fishApiKey");
  if (fishApiKey) {
    apiKeyInput.value = fishApiKey;
  }
}

async function saveApiKey() {
  const value = apiKeyInput.value.trim();
  await chrome.storage.local.set({ fishApiKey: value });
  statusEl.textContent = "SAVED.";
  setTimeout(() => {
    statusEl.textContent = "";
  }, 2000);
}

saveBtn.addEventListener("click", saveApiKey);

loadApiKey();
