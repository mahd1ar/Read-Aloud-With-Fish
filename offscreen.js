const MAX_CHARS = 5000;
const FISH_TTS_URL = "https://api.fish.audio/v1/tts";
const FISH_MODEL = "s2.1-pro-free";

const audioPlayer = document.getElementById("audioPlayer");
let objectUrl = null;

function revokeObjectUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function stopPlayback() {
  audioPlayer.pause();
  audioPlayer.currentTime = 0;
}

async function playText(text, apiKey) {
  if (!text || text.length > MAX_CHARS) return;

  stopPlayback();

  try {
    const response = await fetch(FISH_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        model: FISH_MODEL,
      },
      body: JSON.stringify({ text, format: "mp3", latency: "low" }),
    });

    if (!response.ok) return;

    const blob = await response.blob();
    revokeObjectUrl();
    objectUrl = URL.createObjectURL(blob);
    audioPlayer.src = objectUrl;
    await audioPlayer.play();
  } catch (err) {
    // No UI to surface errors from the offscreen document; the popup remains
    // the place to see request failures for manual playback.
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "read-aloud-play") {
    playText(message.text, message.apiKey);
  } else if (message.type === "read-aloud-stop") {
    stopPlayback();
  }
});
