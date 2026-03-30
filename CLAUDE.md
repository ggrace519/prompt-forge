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
electron/main.js      # Main process: tray, BrowserWindow, IPC handlers, Anthropic/Ollama calls
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

## Conventions

- **Single-file React UI.** All components live in `App.jsx` — no component directory tree. Icon components (`IconGear`, `IconCopy`, etc.) are inline SVGs defined at the top of the file.
- **Inline SVG icons** — no icon library dependency.
- **CSS custom properties** for theming (dark only). Accent color: `#7c6af7`. Font: system-ui for UI, Consolas/Cascadia Code for code.
- **Window dimensions:** 480px wide, height toggles between 320 (input) and 640 (results) via `resizeWindow` IPC.
- **Window chrome** is custom (frameless) — minimize hides to tray, close hides to tray. Real quit is via tray context menu.
- **IPC pattern:** `ipcMain.handle` / `ipcRenderer.invoke` for all communication. Channel names use kebab-case (`generate-prompt`, `save-api-key`).
- **Prompt output** is a JSON object with 8 string fields: `role`, `instructions`, `context`, `outputFormat`, `reasoning`, `examples`, `reinforcement`, `assembled`.
- **Tests** live in `tests/` (not `__tests__`), use Vitest + jsdom + @testing-library/react. Setup in `tests/setup.js`.
- **No TypeScript.** Plain JS with JSDoc annotations where helpful.
- **Default model:** `claude-haiku-4-5-20251001`.
