# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Windows desktop Electron app (taskbar + optional tray) that turns plain task descriptions into structured AI prompts. Supports Anthropic via API key, Anthropic via Claude Code subscription (`@anthropic-ai/claude-agent-sdk`), OpenAI via API key, and user-defined **named endpoints** — each a URL + wire format (OpenAI-compatible, native-Ollama, or Anthropic-compatible) + optional key — that each model slot can target independently. React 18 renderer, Vite build, frameless 480px-wide window anchored to the lower-right corner of the primary display.

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
electron/main.js      # Main process: tray, BrowserWindow, IPC handlers, two-call flow, provider dispatch (Anthropic API, Anthropic subscription via agent-sdk, OpenAI, Ollama)
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

Each slot stores `{ provider, authMethod, model, endpointId }`:

- `provider` — `'anthropic'` | `'openai'` | `'ollama'`
- `authMethod` — `'apiKey'` | `'subscription'` (only meaningful for `anthropic`; everything else is `'apiKey'`)
- `model` — model id string
- `endpointId` — for `provider: 'ollama'`, references which **named endpoint** this slot uses

The `'ollama'` provider value means a **named custom endpoint** (kept named `ollama` for backward compatibility). Endpoints are stored as a list `endpoints: [{ id, name, url, format }]` (`format`: `'openai'` (default) | `'ollama'` | `'anthropic'`). Each slot picks an endpoint by `endpointId` + a `model`, so **different slots can target different servers**. Per-endpoint API keys are stored separately in `endpointKeys`/`endpointKeysEnc` maps (DPAPI-encrypted at rest), keyed by endpoint id, and never returned to the renderer (only a `hasKey` flag).

Shared across slots: Anthropic API key, OpenAI API key (DPAPI-encrypted). Endpoint URLs/formats are plaintext; endpoint keys are encrypted per id.

### Provider Dispatch

`callProvider(creds, systemPrompt, userMessage)` in `electron/main.js` switches on `(provider, authMethod)`:

| provider | authMethod | Path |
|----------|-----------|------|
| `anthropic` | `apiKey` | `fetch('https://api.anthropic.com/v1/messages')` |
| `anthropic` | `subscription` | Lazy `await import('@anthropic-ai/claude-agent-sdk')`, `query()` with `settingSources: []`, `permissionMode: 'bypassPermissions'`, `allowedTools: []`, `maxTurns: 1`. Reads OAuth creds from the local Claude Code CLI install. |
| `openai` | `apiKey` | `fetch('https://api.openai.com/v1/chat/completions')` with bearer auth |
| `ollama` (named endpoint) | `apiKey` | Resolves the slot's endpoint (by `endpointId`) → url + format + key, then routes by `format`: `'openai'` → `fetch('${url}/v1/chat/completions')` (bearer); `'ollama'` → `fetch('${url}/api/chat')` (bearer, native response shape); `'anthropic'` → `fetch('${url}/v1/messages')` (`x-api-key` + `anthropic-version`) |

The agent SDK is ESM and main.js is CJS — the dynamic `import()` is the bridge. First subscription call has ~1-2s cold-import overhead.

## Conventions

- **Single-file React UI.** All components live in `App.jsx` — no component directory tree. Icon components (`IconGear`, `IconCopy`, `IconSliders`, `IconClock`, etc.) are inline SVGs defined at the top of the file.
- **Inline SVG icons** — no icon library dependency.
- **CSS custom properties** for theming. Dark is default; light theme is opt-in via `html.light` class on `<html>`. Accent color: `#f59e0b` (fire orange), hover `#ea580c`, active `#d97706`. Font: system-ui for UI, Consolas/Cascadia Code for code.
- **Pre-paint theme flash prevention.** `preload.js` reads the saved theme via the *synchronous* `get-theme-sync` IPC channel and applies `html.light` before the renderer's first paint. The handler must be registered **before** `app.whenReady()` (a previous regression crashed IPC when registered later). Runtime theme toggles use the async `get-theme` / `save-theme` channels.
- **Window dimensions:** 480px wide, height toggles between 320 (input) and 640 (results) via `resizeWindow` IPC.
- **Window chrome** is custom (frameless) — minimize hides to tray, close hides to tray. Real quit is via tray context menu.
- **IPC pattern:** `ipcMain.handle` / `ipcRenderer.invoke` for all communication. Channel names use kebab-case (`generate-prompt`, `save-slot-config`).
- **Prompt output** is a JSON object with variable fields per tier (4, 6, or 8 string fields) plus `tier`, `generateProvider`, `generateModel` metadata.
- **Tests** live in `tests/` (not `__tests__`), use Vitest + jsdom + @testing-library/react. Setup in `tests/setup.js`.
- **No TypeScript.** Plain JS with JSDoc annotations where helpful.
- **Default model:** `claude-haiku-4-5-20251001` (Anthropic), `gpt-4o-mini` (OpenAI).
- **Config migration:** `migrateConfig()` runs on every launch with three flags:
  - `configMigrated` — converts old single-provider config to three slots (legacy upgrade).
  - `configMigratedV2` — backfills `authMethod: 'apiKey'` onto every slot that predates the field.
  - `configMigratedV3` — converts the old shared custom endpoint (`ollamaUrl`/`endpointFormat`/`ollamaApiKey`) into the first entry of the named `endpoints` list and stamps each `ollama` slot with its `endpointId`.
- **Slot encoding for `<select>` options:** For most providers the form is `<provider>:<authMethod>:<model>`; for `ollama` the middle field carries the **endpoint id** instead: `ollama:<endpointId>:<model>`. Decoder splits on the first two `:` only, since model names may contain `:` (e.g., `llama3:8b`). See `encodeSlot` / `decodeSlot` in `App.jsx`.

### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `generate-prompt` | invoke | Two-call classify+generate flow. Accepts `{task, tier?}` |
| `save-api-key` / `get-api-key` | invoke | Shared Anthropic API key (encrypted) |
| `save-openai-api-key` / `get-openai-api-key` | invoke | Shared OpenAI API key (encrypted) |
| `get-slot-config` / `save-slot-config` | invoke | Three-slot `{provider, authMethod, model, endpointId}` configuration |
| `get-endpoints` / `save-endpoints` | invoke | Named endpoints `[{id,name,url,format}]`. `get` adds a `hasKey` flag; `save` takes `{endpoints, keyUpdates}` (id→key map, '' clears) and prunes keys for removed endpoints. Keys are never returned. |
| `fetch-ollama-models` | invoke | List models from an endpoint `{url, apiKey, format, endpointId}`. Falls back to the stored key when `apiKey` is blank. Route depends on format: `/api/tags` (ollama) or `/v1/models` (openai/anthropic) |
| `fetch-anthropic-models` | invoke | List available Anthropic models (uses shared API key) |
| `fetch-openai-models` | invoke | List available OpenAI models (uses shared OpenAI key, filters to `gpt-*` / `o*` / `chatgpt-*`) |
| `check-claude-cli-status` | invoke | Probe local `claude --version` via `child_process.exec` (3s timeout). Returns `{installed, version?}` for the subscription auth indicator. |
| `get-send-targets` / `save-send-targets` | invoke | Send-to-provider destination list |
| `open-external-url` | invoke | Opens URL in default browser |
| `get-history` / `save-history-entry` / `clear-history` | invoke | Prompt generation history (50 cap) |
| `copy-to-clipboard` | invoke | Write to system clipboard |
| `close-window` / `minimize-window` / `resize-window` | invoke | Window controls |
| `get-theme` / `save-theme` | invoke | Async theme persistence (`'dark'` \| `'light'`) |
| `get-theme-sync` | sendSync | One-shot synchronous read in `preload.js` to avoid theme flash before first paint. Handler must be registered before `app.whenReady()` |
