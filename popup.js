const MAX_CHARS = 5000;
const FISH_TTS_URL = "https://api.fish.audio/v1/tts";
const FISH_MODEL = "s2.1-pro-free";

const selectionTextEl = document.getElementById("selectionText");
const errorBoxEl = document.getElementById("errorBox");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");
const loadingEl = document.getElementById("loading");
const audioPlayer = document.getElementById("audioPlayer");
const optionsLink = document.getElementById("optionsLink");

let selectedText = "";
let objectUrl = null;

function showError(message) {
  errorBoxEl.textContent = message;
  errorBoxEl.classList.remove("hidden");
}

function clearError() {
  errorBoxEl.textContent = "";
  errorBoxEl.classList.add("hidden");
}

const dotsEl = document.querySelector(".dots");
let dotsInterval = null;

function setLoading(isLoading) {
  loadingEl.classList.toggle("hidden", !isLoading);
  playBtn.disabled = isLoading || !selectedText;

  if (isLoading) {
    let count = 0;
    dotsInterval = setInterval(() => {
      count = (count + 1) % 4;
      dotsEl.textContent = ".".repeat(count);
    }, 300);
  } else if (dotsInterval) {
    clearInterval(dotsInterval);
    dotsInterval = null;
    dotsEl.textContent = "";
  }
}

function revokeObjectUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

async function loadSelectedText() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      showError("Could not access the current tab.");
      return;
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString(),
    });

    selectedText = (result && result.result ? result.result : "").trim();

    if (!selectedText) {
      selectionTextEl.textContent = "NO TEXT SELECTED. HIGHLIGHT TEXT ON THE PAGE, THEN REOPEN THIS POPUP.";
      selectionTextEl.classList.add("placeholder");
      playBtn.disabled = true;
      return;
    }

    selectionTextEl.textContent = selectedText;
    selectionTextEl.classList.remove("placeholder");
    playBtn.disabled = false;
  } catch (err) {
    showError("Could not read the page selection. Try reloading the page and selecting text again.");
  }
}

async function getApiKey() {
  const { fishApiKey } = await chrome.storage.local.get("fishApiKey");
  return fishApiKey || "";
}

async function playSelectedText() {
  clearError();

  if (!selectedText) {
    showError("No text selected.");
    return;
  }

  if (selectedText.length > MAX_CHARS) {
    showError(`Selection is too long (${selectedText.length} characters). Please select at most ${MAX_CHARS} characters.`);
    return;
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    showError("No Fish Audio API key set. Click 'Set API key' below.");
    return;
  }

  setLoading(true);
  stopBtn.disabled = false;

  try {
    const response = await fetch(FISH_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        model: FISH_MODEL,
      },
      body: JSON.stringify({
        text: selectedText,
        format: "mp3",
        latency: "low",
      }),
    });

    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson && errJson.message) {
          message = errJson.message;
        }
      } catch (_) {
        // response wasn't JSON; keep the generic message
      }
      showError(message);
      setLoading(false);
      stopBtn.disabled = true;
      return;
    }

    pauseBtn.disabled = false;

    if (window.MediaSource && MediaSource.isTypeSupported("audio/mpeg") && response.body) {
      try {
        await streamAudio(response);
      } catch (streamErr) {
        // Streaming can fail on some Chrome/codec combos; fall back to buffering.
        await playFullyBuffered(await fetch(FISH_TTS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            model: FISH_MODEL,
          },
          body: JSON.stringify({ text: selectedText, format: "mp3", latency: "low" }),
        }));
      }
    } else {
      await playFullyBuffered(response);
    }
  } catch (err) {
    showError("Network error while contacting Fish Audio. Check your connection and API key.");
    stopBtn.disabled = true;
  } finally {
    setLoading(false);
  }
}

async function playFullyBuffered(response) {
  const blob = await response.blob();
  revokeObjectUrl();
  objectUrl = URL.createObjectURL(blob);
  audioPlayer.src = objectUrl;
  await audioPlayer.play();
}

function appendBuffer(sourceBuffer, chunk) {
  return new Promise((resolve, reject) => {
    const onUpdateEnd = () => {
      sourceBuffer.removeEventListener("error", onError);
      resolve();
    };
    const onError = (e) => {
      sourceBuffer.removeEventListener("updateend", onUpdateEnd);
      reject(e);
    };
    sourceBuffer.addEventListener("updateend", onUpdateEnd, { once: true });
    sourceBuffer.addEventListener("error", onError, { once: true });
    sourceBuffer.appendBuffer(chunk);
  });
}

function streamAudio(response) {
  return new Promise((resolve, reject) => {
    const mediaSource = new MediaSource();
    revokeObjectUrl();
    objectUrl = URL.createObjectURL(mediaSource);
    audioPlayer.src = objectUrl;

    mediaSource.addEventListener(
      "sourceopen",
      async () => {
        let sourceBuffer;
        try {
          sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
        } catch (e) {
          reject(e);
          return;
        }

        const reader = response.body.getReader();
        let playbackStarted = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            await appendBuffer(sourceBuffer, value);

            if (!playbackStarted) {
              playbackStarted = true;
              audioPlayer.play().catch(() => {});
            }
          }

          if (mediaSource.readyState === "open") {
            mediaSource.endOfStream();
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      },
      { once: true }
    );
  });
}

function pausePlayback() {
  audioPlayer.pause();
}

function stopPlayback() {
  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  pauseBtn.disabled = true;
  stopBtn.disabled = true;
}

audioPlayer.addEventListener("ended", () => {
  pauseBtn.disabled = true;
  stopBtn.disabled = true;
});

playBtn.addEventListener("click", playSelectedText);
pauseBtn.addEventListener("click", pausePlayback);
stopBtn.addEventListener("click", stopPlayback);

optionsLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

loadSelectedText();
