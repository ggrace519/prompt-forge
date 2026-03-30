# CLAUDE.md — PromptForge

## What This Is

Windows system-tray Electron app that turns plain task descriptions into structured AI prompts via the Anthropic API or a local Ollama server. React 18 renderer, Vite build, frameless 480px-wide popup anchored to the lower-right corner of the primary display.

## Commands

```bash
npm run dev          # Vite dev server (port 5173) + Electron with hot-reload
npm run build        # Production Vite build + electron-builder (.exe in release/)
npm start            # Launch Electron against last production build
npm test             # Vitest run (one-shot)
npm run test:watch   # Vitest watch mode
npm run test:coverage # Vitest with V8 coverage (covers src/lib/**)
```

## Architecture

```
electron/main.js      # Main process: tray, BrowserWindow, IPC handlers, two-call flow, Anthropic/Ollama calls
electron/preload.js   # contextBridge — exposes window.electronAPI (named IPC channels only)
src/lib/promptService.js  # Platform abstraction — ALL renderer↔main communication goes through here
src/lib/utils.js      # Pure utilities (extractJSON); main.js has its own inline copy (CommonJS)
src/App.jsx           # Single-file React UI: App → SettingsView | MainView → ResultsPanel
src/index.css         # Full dark-theme stylesheet using CSS custom properties
```

### Key Boundaries

- **Components never touch `window.electronAPI` directly.** Everything routes through `promptService.js`. This is the portability contract — swap that file to run on React Native or web.
- **Main process uses CommonJS** (`require`). Renderer uses ESM (`import`).
- **`extractJSON` is duplicated** in `src/lib/utils.js` (ESM) and `electron/main.js` (inline CJS). Keep both in sync.
- **API keys are encrypted** at rest via `safeStorage` (DPAPI on Windows). Stored as base64 blobs in electron-store config, never plaintext (unless encryption is unavailable).
- **Credentials are resolved server-side.** The renderer sends only `{ task, tier }` to `generate-prompt`. The main process reads slot configs and decrypts keys internally.

### Tiered Prompt Generation

The app uses a **two-call flow**: classify then generate.

1. **Classify call** — lightweight API call determines task tier: `simple`, `standard`, or `complex`. Falls back to `standard` on error.
2. **Generate call** — fires with the tier-matched template (`TEMPLATE_MAP[tier]`).

**Three tiers:**
- **Simple** (4 fields): `role`, `instructions`, `outputFormat`, `assembled`
- **Standard** (6 fields): adds `context`, `reasoning`
- **Complex** (8 fields): adds `examples`, `reinforcement`

Users can override the auto-classified tier and re-generate.

### Per-Slot Model Configuration

Three independent model config slots stored in electron-store:

| Slot | Storage prefix | Purpose |
|------|---------------|---------|
| Classification | `classify.*` | Runs the classify call |
| Simple & Standard | `generateSimple.*` | Generates simple/standard prompts |
| Complex | `generateComplex.*` | Generates complex prompts |

Each slot has `provider` (anthropic/ollama) and `model`. Ollama URL and API key are shared across slots. Anthropic API key is shared across slots.

## Conventions

- **Single-file React UI.** All components live in `App.jsx` — no component directory tree. Icon components (`IconGear`, `IconCopy`, `IconSliders`, `IconClock`, etc.) are inline SVGs defined at the top of the file.
- **Inline SVG icons** — no icon library dependency.
- **CSS custom properties** for theming (dark only). Accent color: `#7c6af7`. Font: system-ui for UI, Consolas/Cascadia Code for code.
- **Window dimensions:** 480px wide, height toggles between 320 (input) and 640 (results) via `resizeWindow` IPC.
- **Window chrome** is custom (frameless) — minimize hides to tray, close hides to tray. Real quit is via tray context menu.
- **IPC pattern:** `ipcMain.handle` / `ipcRenderer.invoke` for all communication. Channel names use kebab-case (`generate-prompt`, `save-slot-config`).
- **Prompt output** is a JSON object with variable fields per tier (4, 6, or 8 string fields) plus `tier`, `generateProvider`, `generateModel` metadata.
- **Tests** live in `tests/` (not `__tests__`), use Vitest + jsdom + @testing-library/react. Setup in `tests/setup.js`.
- **No TypeScript.** Plain JS with JSDoc annotations where helpful.
- **Default model:** `claude-haiku-4-5-20251001`.
- **Config migration:** On first launch after update, `migrateConfig()` converts old single-provider config to three slots. Controlled by `configMigrated` flag in electron-store.

### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `generate-prompt` | invoke | Two-call classify+generate flow. Accepts `{task, tier?}` |
| `save-api-key` / `get-api-key` | invoke | Shared Anthropic API key (encrypted) |
| `get-slot-config` / `save-slot-config` | invoke | Three-slot model configuration |
| `save-ollama-url` / `get-ollama-url` | invoke | Shared Ollama server URL |
| `save-ollama-api-key` / `get-ollama-api-key` | invoke | Shared Ollama API key (encrypted) |
| `fetch-ollama-models` | invoke | List models from Ollama server |
| `get-send-targets` / `save-send-targets` | invoke | Send-to-provider destination list |
| `open-external-url` | invoke | Opens URL in default browser |
| `get-history` / `save-history-entry` / `clear-history` | invoke | Prompt generation history (50 cap) |
| `copy-to-clipboard` | invoke | Write to system clipboard |
| `close-window` / `minimize-window` / `resize-window` | invoke | Window controls |
