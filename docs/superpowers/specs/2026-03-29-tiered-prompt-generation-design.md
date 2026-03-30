# Tiered Prompt Generation, Per-Slot Model Config, Send to Provider, and Prompt History

**Date:** 2026-03-29
**Status:** Design approved

---

## Problem

PromptForge uses a single 8-field prompt template for all tasks. This is overkill for simple tasks (creative, conversational) where filler sections like reasoning chains and reinforcement dilute the output. It also locks users into a single provider/model for all work, and provides no way to send generated prompts to external chat interfaces or recall past generations.

## Solution Overview

1. **Three-tier prompt templates** with automatic classification
2. **Two-call flow** — classify then generate with the matching template
3. **Per-slot provider/model configuration** — independent settings for classify, simple+standard generation, and complex generation
4. **Send to provider** — copy prompt to clipboard and open a chat UI in the browser
5. **Prompt history** — persist and recall past generations

---

## 1. Three Tiers

### Simple

For creative, conversational, or single-step tasks (e.g. "write a haiku about cats", "draft a polite rejection email").

**Fields returned:** `role`, `instructions`, `outputFormat`, `assembled`

### Standard

For tasks with moderate constraints or structure (e.g. "write a product description with SEO keywords", "summarize this document in bullet points with key takeaways").

**Fields returned:** `role`, `instructions`, `context`, `outputFormat`, `reasoning`, `assembled`

### Complex

For agentic, multi-step, or heavily constrained tasks (e.g. "build a code review agent", "create a data extraction pipeline prompt with retry logic").

**Fields returned:** all 8 — `role`, `instructions`, `context`, `outputFormat`, `reasoning`, `examples`, `reinforcement`, `assembled`

---

## 2. Classification Call

A lightweight first API call that evaluates the user's task and returns a tier before generation begins.

- **System prompt:** Short and directive — instructs the model to classify task complexity and return JSON.
- **Response schema:** `{ "tier": "simple" | "standard" | "complex" }`
- **Model:** Uses the user's configured classification slot (see Section 3).
- **Token budget:** `max_tokens: 50` — the response is a single JSON object.
- **Provider routing:** Routes through whichever provider (Anthropic or Ollama) is configured for the classification slot.
- **Fallback:** If classification fails (parse error, network issue), default to `"standard"`.

---

## 3. Generation Call

After classification returns a tier, the generate call fires with the matching template.

- **Three template constants** in `main.js`: `SYSTEM_PROMPT_SIMPLE`, `SYSTEM_PROMPT_STANDARD`, `SYSTEM_PROMPT_COMPLEX`.
- **Template selection:** Simple lookup — `{ simple: SYSTEM_PROMPT_SIMPLE, standard: SYSTEM_PROMPT_STANDARD, complex: SYSTEM_PROMPT_COMPLEX }`.
- **Tier override:** When the user selects a different tier and re-generates, the renderer sends `{ task, tier }`. The classification call is skipped — goes straight to generate with the specified template.
- **Slot routing:** Simple and standard tiers use the `generateSimple` slot config. Complex tier uses the `generateComplex` slot config.
- **Response shape:** `{ success, data, tier }` — the tier is included so the renderer can display it and support override.

---

## 4. Per-Slot Provider/Model Configuration

Three independent configuration slots, each with its own provider and model selection:

| Slot | Purpose |
|------|---------|
| **Classification** | Runs the classify call |
| **Simple & Standard Generation** | Generates prompts for simple and standard tiers |
| **Complex Generation** | Generates prompts for the complex tier |

Simple and Standard share a slot because the difference is template-driven, not model-capability-driven.

### Shared Ollama Server Config

Ollama URL and API key are configured once (not per-slot). Each slot that uses Ollama picks a model from the shared server.

### Storage Keys (electron-store)

- `ollamaUrl`, `ollamaApiKey` / `ollamaApiKeyEncrypted` — shared Ollama server config
- `apiKey`, `apiKeyEncrypted` — shared Anthropic API key
- `classify.provider`, `classify.model` — classification slot
- `generateSimple.provider`, `generateSimple.model` — simple & standard generation slot
- `generateComplex.provider`, `generateComplex.model` — complex generation slot

### Migration

On first launch after update, if old single-provider config exists (`provider`, `model`), all three slots are populated with those values. Old keys are then removed.

---

## 5. Settings UI

### Layout

1. **Shared Ollama config** at top — server URL + optional API key
2. **Three collapsible sections:**
   - Classification Model — provider toggle (Anthropic / Ollama) + model dropdown
   - Simple & Standard Generation — same widget
   - Complex Generation — same widget
3. **Send targets** section — manage provider list for "Send to..." feature (see Section 7)
4. **Save & Continue** button saves all slots at once

### Per-Section Widget

- Anthropic / Ollama provider toggle (existing tab-style buttons)
- Model dropdown (Anthropic: hardcoded MODELS list; Ollama: fetched from shared server)
- Fetch Models button per Ollama dropdown (fetches from the shared server URL)

---

## 6. Main Window Changes

### Model Override Row

Below the textarea, a collapsible row (collapsed by default) toggled by a sliders/tune icon:

- **Classify model** — compact dropdown showing current provider + model (maps to `classify` slot)
- **Simple & Standard model** — compact dropdown (maps to `generateSimple` slot)
- **Complex model** — compact dropdown (maps to `generateComplex` slot)

Defaults to settings values. Changes here **persist to settings** immediately via `save-slot-config` — the override row is an inline settings editor, not a per-request override.

### Tier Badge

After generation, a pill badge appears near the results showing "Simple", "Standard", or "Complex". Clicking it reveals the three tier options. Selecting a different tier re-fires `generate-prompt` with `{ task, tier }`, skipping classification.

### Two-Step Loading States

The Generate button shows:
1. "Classifying..." during the classification call
2. "Generating..." during the generation call

When the user provides an explicit tier override, only "Generating..." is shown.

### Existing Model Badge

The top bar model badge shows the model that was actually used for the most recent generation. Before any generation has occurred, it shows the `generateSimple` slot model as the default.

---

## 7. Send to Provider

### Provider List

A configurable set of destinations, each a name + URL. Defaults ship out of the box:

| Name | URL |
|------|-----|
| Claude | `https://claude.ai/new` |
| ChatGPT | `https://chatgpt.com` |
| Gemini | `https://gemini.google.com/app` |

Users can add custom entries (name + URL) in settings.

### UX

In the results panel (next to the existing Copy All button), a "Send to..." button or a row of small provider icons. Clicking one:

1. Copies the assembled prompt to clipboard
2. Opens the URL in the default browser via `shell.openExternal`
3. Shows a brief toast notification: "Prompt copied — paste into chat"

### Storage

`sendTargets` array in electron-store: `[{ name: string, url: string }]`

---

## 8. Prompt History

### What's Stored

Each generation saves to an array in electron-store:

```json
{
  "task": "the user's input",
  "tier": "simple | standard | complex",
  "result": { /* the full prompt object */ },
  "classifyProvider": "anthropic | ollama",
  "classifyModel": "model-name",
  "generateProvider": "anthropic | ollama",
  "generateModel": "model-name",
  "timestamp": "2026-03-29T14:30:00Z"
}
```

### UI

A clock/history icon in the top bar. Clicking it shows a scrollable list of past generations:
- Task text (truncated)
- Tier badge
- Timestamp

Clicking an entry restores it into the results panel. The user can re-generate from a history entry with a different tier.

### Limits

Capped at 50 entries. Oldest entries dropped first when the cap is reached.

---

## 9. IPC Channels

### Changed

- `generate-prompt` — gains optional `tier` param. When absent: classify-then-generate. When present: skip classification, generate with specified template.

### New

- `save-slot-config` / `get-slot-config` — read/write the three slot configurations
- `get-send-targets` / `save-send-targets` — read/write the send-to-provider list
- `open-external-url` — wraps `shell.openExternal` for the send-to-provider flow
- `get-history` / `save-history-entry` / `clear-history` — prompt history CRUD

### Removed

- `save-provider` / `get-provider` — replaced by slot-based config
- `save-model` / `get-model` — replaced by slot-based config

---

## 10. File Changes

All changes are in existing files. No new files.

| File | Changes |
|------|---------|
| `electron/main.js` | Three template constants, classifier system prompt, two-call flow in `generate-prompt` handler, new IPC handlers for slots/history/send targets, migration logic, `shell.openExternal` import |
| `electron/preload.js` | New IPC bridge methods for slot config, history, send targets, open external URL |
| `src/lib/promptService.js` | New exports wrapping the new IPC channels |
| `src/App.jsx` | Settings UI rewrite (three slot sections, shared Ollama config, send targets), model override row, tier badge with override, two-step loading states, send-to-provider buttons, history panel, toast notification |
| `src/index.css` | Styles for tier badge, override row, send-to buttons, toast, history panel, collapsible settings sections |

---

## Out of Scope

- Prompt editing (user can edit after pasting)
- Favorites/pinning (can add later on top of history)
- Pre-filled URL parameters for providers (fragile, undocumented)
- Template customization by the user
- New files / module extraction (stays in `main.js`)
