# PromptForge

A Windows desktop app that turns a plain task description into a structured,
production-ready AI prompt. Built on Electron + React, with a focus on a fast,
keyboard-driven, single-window workflow.

PromptForge is provider-agnostic: point it at **Anthropic**, **OpenAI**, your
**Claude Code subscription**, or any **custom endpoint** (OpenAI-compatible,
native Ollama, or Anthropic-compatible), and mix different models across the
generation steps.

---

## Features

- **Tiered, two-call generation** — a lightweight *classify* call picks the
  prompt complexity (simple / standard / complex), then a *generate* call writes
  the prompt with the matching template.
- **Guide-aligned prompts** — templates follow [`prompt-building-guide.md`](./prompt-building-guide.md):
  a clear output contract, an uncertainty/abstention rule, a self-check pass, and
  **no hand-written chain-of-thought** (modern reasoning models do it internally).
- **Named endpoints, per-slot** — define multiple endpoints (URL + wire format +
  key) and assign a different model to *Classify*, *Simple/Standard*, and
  *Complex* — e.g. a local Ollama box for classify, a cloud model for generation.
- **Model fallback** — if a model times out or errors, generation falls through
  to your other configured models; every result is badged with the model that
  produced it.
- **Reasoning-model aware** — strips `<think>…</think>` blocks before parsing, so
  DeepSeek-R1 / Qwen3 / QwQ-style models work cleanly.
- **Image & video modes** — descriptive prompts for image (SDXL, Qwen-Image,
  Gemini, …) and short-form video generators, with an aspect-ratio helper.
- **Test Bench** — run the generated prompt against a sample input on your own
  model and get a 0–10 LLM-as-judge score with critique.
- **Command palette** (`Ctrl/⌘+K`), global summon (`Ctrl+Shift+Space`),
  **New Prompt** (`Ctrl/⌘+N`), light/dark themes, and prompt history.
- **In-app auto-update** from GitHub Releases — checks on launch, then installs
  when you choose.
- **Keys encrypted at rest** via OS-native DPAPI (Windows) / Keychain; the
  renderer never sees decrypted keys.

---

## Getting started

### Prerequisites
- Node.js ≥ 18
- A provider credential — an [Anthropic API key](https://console.anthropic.com/settings/keys),
  an [OpenAI API key](https://platform.openai.com/api-keys), a running Claude Code
  CLI (for subscription auth), or a reachable custom endpoint.

### Develop
```bash
npm install      # also generates the placeholder tray icon
npm run dev      # Vite dev server (5173) + Electron with hot-reload
npm test         # Vitest run
```
On first launch, open **Settings** (gear icon) and add a key or endpoint.

### Package (Windows installer)
```bash
npm run build    # Vite build + electron-builder → release/PromptForge Setup *.exe
```

### Release (publish to GitHub for auto-update)
```bash
# bump "version" in package.json first, then:
GH_TOKEN=<token> npm run release   # builds + publishes installer + latest.yml to GitHub Releases
```
The packaged app reads its update feed from the `build.publish` config
(`github` → `ggrace519/prompt-forge`) and shows an in-app update banner when a
newer release is available.

> **Windows SmartScreen:** releases are not yet code-signed, so Windows may show
> *"Windows protected your PC."* To install, click **More info → Run anyway**.
> Code signing is planned for a future release.

---

## Providers & per-slot models

Each of the three generation slots stores `{ provider, model, … }`:

| Provider | Auth | How it's called |
|---|---|---|
| `anthropic` | API key | `api.anthropic.com/v1/messages` |
| `anthropic` | subscription | local Claude Code CLI via `@anthropic-ai/claude-agent-sdk` |
| `openai` | API key | `api.openai.com/v1/chat/completions` |
| custom endpoint | optional key | per-endpoint URL; wire format `openai` / `ollama` / `anthropic` |

Named endpoints + per-slot assignment let you mix models freely. Keys are stored
DPAPI-encrypted; endpoint URLs/formats are plain config.

---

## Architecture

```
electron/main.js      # main process: tray/window, IPC, two-call flow, provider dispatch, auto-updater
electron/preload.js   # contextBridge → window.electronAPI (named channels only)
src/App.jsx           # single-file React UI (Settings | Main → Results tabs)
src/lib/promptService.js  # platform-abstraction boundary — all renderer↔main calls go through here
src/lib/utils.js      # pure helpers (extractJSON w/ reasoning-strip, section assembly)
```
See [`CLAUDE.md`](./CLAUDE.md) for the full architecture and conventions.

---

## Contributing

This repo uses a GitHub flow:

1. **Open an issue** describing the change.
2. **Branch** off `main` (`feat/…`, `fix/…`, `chore/…`).
3. **Open a PR** referencing the issue. **CI** (GitHub Actions) runs tests + a
   renderer build on every PR.
4. **Merge** once CI is green.

Run `npm test` before pushing. New features need tests; bug fixes need a
regression test.

---

## License

Business Source License 1.1 (BUSL-1.1) — see [`LICENSE`](./LICENSE).
Non-production use is free; production use is permitted except offering
PromptForge as a competing commercial prompt-engineering product/service. The
license converts to **MIT** on the Change Date (2029-03-30).

Copyright © 2026 519lab.com, a registered trade name of Onward Investment LLC.
