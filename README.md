# PromptForge

A Windows system tray app that turns plain task descriptions into structured, production-ready AI prompts using Claude.

![PromptForge popup window showing a generated prompt](https://via.placeholder.com/480x640/1a1a1a/7c6af7?text=PromptForge)

## Features

- Lives silently in the system tray — no taskbar clutter
- Left-click the tray icon to pop up the 480×640 window
- Right-click for "Open PromptForge" / "Quit"
- Describe any task → get a structured prompt with 7 named sections
- **Assembled** tab: one-click copy of the complete, paste-ready prompt
- **Breakdown** tab: collapsible cards for each section with individual copy buttons
- API key stored locally via `electron-store` (never sent anywhere except Anthropic)

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- An Anthropic API key → [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)

### Install & Run (Development)

```bash
npm install        # also auto-generates assets/tray-icon.png
npm run dev        # starts Vite dev server + Electron
```

The app will appear in your system tray. Click the purple icon to open the popup.
Enter your Anthropic API key the first time — it will be remembered.

### Package for Windows

```bash
npm run build
```

Output is in `release/`. The `.exe` installer is in `release/PromptForge Setup *.exe`.

> **Note on the tray icon for production builds:**
> `electron-builder` requires a `.ico` file for the Windows executable icon.
> Run `npm install electron-icon-builder --save-dev` and add a build step, or convert
> `assets/tray-icon.png` to `assets/tray-icon.ico` manually (e.g. with GIMP, Paint.NET,
> or [icoconvert.com](https://icoconvert.com)), then update the `"icon"` field in
> `package.json` → `build.win` to `"assets/tray-icon.ico"`.

---

## Project Structure

```
prompt-forge-pro/
├── electron/
│   ├── main.js          # Electron main process — tray, window, IPC handlers, Anthropic call
│   └── preload.js       # contextBridge: exposes window.electronAPI to the renderer
├── src/
│   ├── App.jsx          # React UI (Settings view + Main view + Results tabs)
│   ├── main.jsx         # React entry point
│   ├── index.css        # Full dark-theme stylesheet (CSS variables)
│   └── lib/
│       └── promptService.js  # Platform abstraction layer (swap for React Native)
├── scripts/
│   └── create-icon.js   # Generates placeholder tray icon PNG at postinstall
├── assets/
│   └── tray-icon.png    # 16×16 PNG tray icon (auto-generated; replace with real art)
├── index.html           # Vite HTML entry point
├── vite.config.js       # Vite config (base: './' for Electron file:// loading)
└── package.json         # Scripts, deps, electron-builder config
```

---

## Prompt Structure

Each generation returns 8 named fields:

| Field           | Description |
|-----------------|-------------|
| `role`          | The AI's identity and primary mission |
| `instructions`  | Numbered directives with action verbs, tone, constraints |
| `context`       | Background knowledge and situational grounding |
| `outputFormat`  | Exact output schema or skeleton |
| `reasoning`     | Step-by-step chain-of-thought to follow |
| `examples`      | 1–2 few-shot input/output pairs |
| `reinforcement` | Critical rules restated at the end |
| `assembled`     | The complete, copy-paste-ready combined prompt |

---

## Portability (React Native / Web)

All business logic lives in `src/lib/promptService.js`.
React components never call `window.electronAPI` directly.

To port to React Native, replace the body of `promptService.js` with direct
`@anthropic-ai/sdk` calls and your platform's storage/clipboard APIs.
No component code changes are needed.

---

## npm Scripts

| Script          | What it does |
|-----------------|--------------|
| `npm run dev`   | Vite dev server + Electron (hot-reload) |
| `npm run build` | Production Vite build + electron-builder packaging |
| `npm start`     | Launch Electron against the last production build |
| `node scripts/create-icon.js` | Re-generate the placeholder tray icon |

---

## Troubleshooting

**The tray icon doesn't appear**
Make sure `assets/tray-icon.png` exists. Run `node scripts/create-icon.js` to regenerate it.

**API errors / 401**
Double-check your API key in the Settings view (gear icon). Keys start with `sk-ant-`.

**Window appears off-screen**
This can happen with multi-monitor setups. The window is clamped to the primary display's work area. Restart the app to re-anchor the position.

**`electron-builder` fails on icon**
Provide a `.ico` file (see packaging note above).
