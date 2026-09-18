# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chrome Manifest V3 extension ("Read Aloud") that speaks highlighted page text using the Fish Audio TTS API. Deliberately **not** published to the Chrome Web Store — it is installed via Load Unpacked only.

## Commands

There is no build system, package manager, dependency tree, or test suite. Files are loaded by Chrome exactly as they sit on disk.

```bash
node --check background.js        # syntax-check a script before asking the user to reload

# render a page to inspect CSS changes without loading the extension
chromium --headless --disable-gpu --screenshot=/tmp/preview.png --window-size=420,520 \
  "file://$(pwd)/popup.html"
```

Reloading after a change: `chrome://extensions` → refresh icon on the extension card. Two gotchas that cause "my change didn't apply":
- Pages already open before the reload do **not** get the context menu; the tab must be reloaded too.
- Service-worker errors surface only in the "service worker" console linked from the extension card, not the page console.

## Architecture

### Two separate, duplicated playback paths

The extension can speak text through either of two entry points, and **each does its own `fetch` to Fish Audio**:

1. **Popup path** — `popup.html`/`popup.js`. Pulls the selection via `chrome.scripting.executeScript`, then streams audio through `MediaSource` with a fully-buffered fallback (some Chrome/codec combos fail mid-stream). Has real UI: error box, loading dots, play/pause/stop.
2. **Context-menu path** — `background.js` → `offscreen.html`/`offscreen.js`. Buffered playback only, and failures are swallowed silently because an offscreen document has no UI.

`FISH_TTS_URL`, `FISH_MODEL` (`s2.1-pro-free`), and `MAX_CHARS` (5000) are **duplicated constants in `popup.js` and `offscreen.js`**. Changing the model, endpoint, or limit requires editing both.

Fish Audio quirk: the model is passed as an HTTP **header** named `model`, not a body field.

### Why the offscreen document exists

MV3 service workers have no DOM, so they cannot construct an `Audio` element. `background.js` therefore creates an offscreen document (`reasons: ["AUDIO_PLAYBACK"]`) to do the actual playing, guarded by `chrome.runtime.getContexts` so only one exists. Communication is one-way `chrome.runtime.sendMessage` with two message types:

- `{ type: "read-aloud-play", text, apiKey }`
- `{ type: "read-aloud-stop" }`

Both sends are `.catch()`-ed — the document may not have its listener attached yet, and an unhandled rejection kills the worker turn.

### Context-menu registration

`registerMenus()` is called at **service-worker top level** plus on `onInstalled` and `onStartup`, always preceded by `contextMenus.removeAll()`. This is deliberate: `onInstalled` does not fire reliably when an unpacked extension is reloaded, and re-creating an existing id throws. Do not "simplify" this back to a single `onInstalled` listener.

### State

The only persisted state is `fishApiKey` in `chrome.storage.local`, written by `options.js` and read independently by `popup.js` and `background.js`.

## Design system

`Design.md` is the source of truth for visuals: a **vaporwave palette executed as pixel art**. Non-obvious rules baked into the CSS:

- Fonts are self-hosted in `fonts/` (Press Start 2P for display, VT323 for body, JetBrains Mono fallback). Extension CSP blocks CDN fonts — never link Google Fonts.
- `popup.css` and `options.css` **duplicate** their `@font-face` blocks and `:root` token set. Keep them in sync.
- Pixel-art execution means: `border-radius: 0 !important` globally, `image-rendering: pixelated`, solid non-blurred offset box-shadows, `steps()` transition timing, and a `.scanlines` overlay div that each HTML page must include.
- Per `Design.md`: no pure-white backgrounds, no rounded corners, no soft glows.

## README

`README.md` is bilingual (English, then Farsi under the `---` divider). Content changes must be applied to **both** halves.
