# Tiered Prompt Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-template prompt generation with a classify-then-generate two-call flow using three tier-specific templates, per-slot model configuration, send-to-provider, and prompt history.

**Architecture:** Two-call flow in `electron/main.js` — a lightweight classify call picks a tier (simple/standard/complex), then a generate call uses the matching template. Three independent model config slots are stored in electron-store. The renderer shows the auto-selected tier as a badge with override capability, a collapsible model override row, send-to-provider buttons, and a history panel. All communication stays in `promptService.js`.

**Tech Stack:** Electron (CommonJS main process), React 18 (ESM renderer), Vite, electron-store, Anthropic SDK, Ollama OpenAI-compatible API, Vitest + @testing-library/react.

---

### Task 1: Add Three Tier Templates and Classifier Prompt to main.js

**Files:**
- Modify: `electron/main.js:23-40` (replace `SYSTEM_PROMPT` with four constants)

- [ ] **Step 1: Write the classifier and three template constants**

Replace the existing `SYSTEM_PROMPT` constant (lines 23-40) with these four constants:

```javascript
// ── System Prompts ───────────────────────────────────────────────────────────

const CLASSIFY_PROMPT = `You are a prompt complexity classifier. Given a task description, determine whether it requires a simple, standard, or complex prompt structure.

- simple: Creative, conversational, or single-step tasks (e.g. "write a haiku", "draft an email", "explain X simply")
- standard: Tasks with moderate constraints, structure, or domain context (e.g. "write SEO product copy", "summarize with key takeaways", "create a lesson plan")
- complex: Agentic, multi-step, or heavily constrained tasks (e.g. "build a code review agent", "create a data pipeline prompt with retry logic", "design a multi-turn tutoring system")

CRITICAL: Respond with ONLY raw, valid JSON — no markdown fences, no prose. Just the JSON object.

{"tier": "simple" | "standard" | "complex"}`;

const SYSTEM_PROMPT_SIMPLE = `You are a world-class prompt engineer. When given a task description, you produce a focused, concise AI prompt.

CRITICAL: Respond with ONLY raw, valid JSON — no markdown fences, no prose, no code blocks. Just the JSON object.

Return an object with exactly these 4 string fields (all values must be strings, not nested objects or arrays):

{
  "role": "1-2 sentences defining the AI's identity and primary mission",
  "instructions": "Clear directives covering tone, format, and key constraints",
  "outputFormat": "What the output should look like — length, style, structure",
  "assembled": "The COMPLETE, copy-paste-ready prompt combining all sections above with clear ## markdown headers: ## Role, ## Instructions, ## Output Format"
}`;

const SYSTEM_PROMPT_STANDARD = `You are a world-class prompt engineer. When given a task description, you produce a structured AI prompt with appropriate depth.

CRITICAL: Respond with ONLY raw, valid JSON — no markdown fences, no prose, no code blocks. Just the JSON object.

Return an object with exactly these 6 string fields (all values must be strings, not nested objects or arrays):

{
  "role": "2-3 sentences defining the AI's identity, expertise level, and primary mission",
  "instructions": "Numbered directives using strong action verbs. Cover tone, format, constraints, edge cases, and what NOT to do.",
  "context": "Background information, domain knowledge, and situational context that grounds and constrains the AI's responses",
  "outputFormat": "Explicit output contract — exact schema, field names, length, style, sections, and an example skeleton if helpful",
  "reasoning": "Numbered chain-of-thought steps the AI should follow internally before producing output",
  "assembled": "The COMPLETE, copy-paste-ready master prompt combining all sections above with clear ## markdown headers: ## Role, ## Instructions, ## Context, ## Output Format, ## Reasoning Steps"
}`;

const SYSTEM_PROMPT_COMPLEX = `You are a world-class prompt engineer. When given a task description, you produce a comprehensive, structured AI prompt.

CRITICAL: Respond with ONLY raw, valid JSON — no markdown fences, no prose, no code blocks. Just the JSON object.

Return an object with exactly these 8 string fields (all values must be strings, not nested objects or arrays):

{
  "role": "2-3 sentences defining the AI's identity, expertise level, and primary mission",
  "instructions": "Numbered directives using strong action verbs. Cover tone, format, constraints, edge cases, and what NOT to do.",
  "context": "Background information, domain knowledge, and situational context that grounds and constrains the AI's responses",
  "outputFormat": "Explicit output contract — exact schema, field names, length, style, sections, and an example skeleton if helpful",
  "reasoning": "Numbered chain-of-thought steps the AI should follow internally before producing output",
  "examples": "1-2 concrete few-shot examples showing ideal input → output pairs, formatted clearly",
  "reinforcement": "The 3-5 most critical rules restated concisely to lock in compliance at the end of the prompt",
  "assembled": "The COMPLETE, copy-paste-ready master prompt combining all sections above with clear ## markdown headers: ## Role, ## Instructions, ## Context, ## Output Format, ## Reasoning Steps, ## Examples, ## Remember"
}`;

const TEMPLATE_MAP = {
  simple:   SYSTEM_PROMPT_SIMPLE,
  standard: SYSTEM_PROMPT_STANDARD,
  complex:  SYSTEM_PROMPT_COMPLEX,
};
```

- [ ] **Step 2: Verify the app still starts**

Run: `npm run dev`

Expected: App launches. The `generate-prompt` handler still references `SYSTEM_PROMPT` which no longer exists — that's expected to break. We'll fix it in Task 3.

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat: add classifier prompt and three tier templates"
```

---

### Task 2: Add Slot Config and Migration IPC Handlers to main.js

**Files:**
- Modify: `electron/main.js:3` (add `shell` to imports)
- Modify: `electron/main.js:269-277` (replace save-model/get-model handlers)
- Modify: `electron/main.js:285-319` (replace save-provider and Ollama config handlers)

- [ ] **Step 1: Add `shell` to the Electron imports**

Change line 3 from:

```javascript
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  screen,
  ipcMain,
  clipboard,
  nativeImage,
  safeStorage,
} = require('electron');
```

To:

```javascript
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  screen,
  ipcMain,
  clipboard,
  nativeImage,
  safeStorage,
  shell,
} = require('electron');
```

- [ ] **Step 2: Add migration function before `createWindow`**

Insert before the `function createWindow()` line (line 60):

```javascript
// ── Config Migration ─────────────────────────────────────────────────────────

const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

const DEFAULT_SEND_TARGETS = [
  { name: 'Claude',  url: 'https://claude.ai/new' },
  { name: 'ChatGPT', url: 'https://chatgpt.com' },
  { name: 'Gemini',  url: 'https://gemini.google.com/app' },
];

function migrateConfig() {
  if (store.get('configMigrated')) return;

  const oldProvider = store.get('provider', 'anthropic');
  const oldModel    = store.get('model', DEFAULT_ANTHROPIC_MODEL);

  // Populate all three slots with the old single config
  for (const slot of ['classify', 'generateSimple', 'generateComplex']) {
    if (!store.get(`${slot}.provider`)) {
      store.set(`${slot}.provider`, oldProvider);
      store.set(`${slot}.model`, slot === 'classify' ? DEFAULT_ANTHROPIC_MODEL : oldModel);
    }
  }

  // Initialize send targets if not present
  if (!store.get('sendTargets')) {
    store.set('sendTargets', DEFAULT_SEND_TARGETS);
  }

  // Initialize history if not present
  if (!store.get('history')) {
    store.set('history', []);
  }

  // Clean up old keys
  store.delete('provider');
  store.delete('model');

  store.set('configMigrated', true);
}
```

- [ ] **Step 3: Call `migrateConfig()` at the start of `app.whenReady`**

Change:

```javascript
app.whenReady().then(() => {
  // Hide from macOS dock (no-op on Windows, harmless)
  if (app.dock) app.dock.hide();

  createWindow();
```

To:

```javascript
app.whenReady().then(() => {
  // Hide from macOS dock (no-op on Windows, harmless)
  if (app.dock) app.dock.hide();

  migrateConfig();
  createWindow();
```

- [ ] **Step 4: Replace the old provider/model IPC handlers with slot-based ones**

Remove these handlers (lines 269-277 and 285-319):
- `save-model` / `get-model`
- `save-provider` / `get-provider`
- `save-ollama-url` / `get-ollama-url`
- `save-ollama-api-key` / `get-ollama-api-key`
- `save-ollama-model` / `get-ollama-model`

Replace with:

```javascript
  // ── Slot config ─────────────────────────────────────────────────────────────

  ipcMain.handle('get-slot-config', () => {
    return {
      classify: {
        provider: store.get('classify.provider', 'anthropic'),
        model:    store.get('classify.model', DEFAULT_ANTHROPIC_MODEL),
      },
      generateSimple: {
        provider: store.get('generateSimple.provider', 'anthropic'),
        model:    store.get('generateSimple.model', DEFAULT_ANTHROPIC_MODEL),
      },
      generateComplex: {
        provider: store.get('generateComplex.provider', 'anthropic'),
        model:    store.get('generateComplex.model', DEFAULT_ANTHROPIC_MODEL),
      },
      ollamaUrl: store.get('ollamaUrl', 'http://localhost:11434'),
    };
  });

  ipcMain.handle('save-slot-config', (_event, config) => {
    for (const slot of ['classify', 'generateSimple', 'generateComplex']) {
      if (config[slot]) {
        store.set(`${slot}.provider`, config[slot].provider);
        store.set(`${slot}.model`, config[slot].model);
      }
    }
    if (config.ollamaUrl !== undefined) {
      store.set('ollamaUrl', config.ollamaUrl);
    }
    return true;
  });

  // Ollama server config — shared across slots
  ipcMain.handle('save-ollama-url', (_event, url) => { store.set('ollamaUrl', url); return true; });
  ipcMain.handle('get-ollama-url',  () => store.get('ollamaUrl', 'http://localhost:11434'));

  ipcMain.handle('save-ollama-api-key', (_event, key) => {
    if (!key) {
      store.delete('ollamaApiKey');
      store.delete('ollamaApiKeyEncrypted');
      return true;
    }
    if (safeStorage.isEncryptionAvailable()) {
      store.set('ollamaApiKey', safeStorage.encryptString(key).toString('base64'));
      store.set('ollamaApiKeyEncrypted', true);
    } else {
      store.set('ollamaApiKey', key);
      store.set('ollamaApiKeyEncrypted', false);
    }
    return true;
  });
  ipcMain.handle('get-ollama-api-key', () => {
    const stored      = store.get('ollamaApiKey', '');
    const isEncrypted = store.get('ollamaApiKeyEncrypted', false);
    if (!stored) return '';
    if (isEncrypted && safeStorage.isEncryptionAvailable()) {
      try { return safeStorage.decryptString(Buffer.from(stored, 'base64')); } catch { return ''; }
    }
    return stored;
  });

  // ── Send targets ────────────────────────────────────────────────────────────

  ipcMain.handle('get-send-targets', () => {
    return store.get('sendTargets', DEFAULT_SEND_TARGETS);
  });

  ipcMain.handle('save-send-targets', (_event, targets) => {
    store.set('sendTargets', targets);
    return true;
  });

  ipcMain.handle('open-external-url', (_event, url) => {
    shell.openExternal(url);
    return true;
  });

  // ── Prompt history ──────────────────────────────────────────────────────────

  const HISTORY_MAX = 50;

  ipcMain.handle('get-history', () => {
    return store.get('history', []);
  });

  ipcMain.handle('save-history-entry', (_event, entry) => {
    const history = store.get('history', []);
    history.unshift(entry);
    if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
    store.set('history', history);
    return true;
  });

  ipcMain.handle('clear-history', () => {
    store.set('history', []);
    return true;
  });
```

- [ ] **Step 5: Commit**

```bash
git add electron/main.js
git commit -m "feat: add slot config, migration, send targets, and history IPC handlers"
```

---

### Task 3: Rewrite the generate-prompt Handler With Two-Call Flow

**Files:**
- Modify: `electron/main.js:162-216` (rewrite `generate-prompt` handler)

- [ ] **Step 1: Extract a reusable `callProvider` helper**

Insert before the IPC handlers section (before line 160):

```javascript
  // ── Provider call helper ──────────────────────────────────────────────────

  async function callProvider(provider, model, apiKey, ollamaUrl, ollamaApiKey, systemPrompt, userMessage, maxTokens = 4096) {
    if (provider === 'ollama') {
      const baseUrl = (ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
      const headers = { 'Content-Type': 'application/json' };
      if (ollamaApiKey) headers['Authorization'] = `Bearer ${ollamaApiKey}`;

      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          stream: false,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Ollama ${res.status}: ${body}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Ollama returned no content');
      return content;
    }

    // Anthropic path
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: model || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock?.text) throw new Error('Anthropic returned no text content');
    return textBlock.text;
  }

  /** Resolve credentials for a given slot. */
  function getSlotCredentials(slot) {
    const provider = store.get(`${slot}.provider`, 'anthropic');
    const model    = store.get(`${slot}.model`, DEFAULT_ANTHROPIC_MODEL);
    const apiKey   = (() => {
      const stored      = store.get('apiKey', '');
      const isEncrypted = store.get('apiKeyEncrypted', false);
      if (!stored) return '';
      if (isEncrypted && safeStorage.isEncryptionAvailable()) {
        try { return safeStorage.decryptString(Buffer.from(stored, 'base64')); } catch { return ''; }
      }
      return stored;
    })();
    const ollamaUrl = store.get('ollamaUrl', 'http://localhost:11434');
    const ollamaApiKey = (() => {
      const stored      = store.get('ollamaApiKey', '');
      const isEncrypted = store.get('ollamaApiKeyEncrypted', false);
      if (!stored) return '';
      if (isEncrypted && safeStorage.isEncryptionAvailable()) {
        try { return safeStorage.decryptString(Buffer.from(stored, 'base64')); } catch { return ''; }
      }
      return stored;
    })();
    return { provider, model, apiKey, ollamaUrl, ollamaApiKey };
  }
```

- [ ] **Step 2: Rewrite the `generate-prompt` handler**

Replace the existing `generate-prompt` handler (lines 162-216) with:

```javascript
  // Generate a structured prompt — classify-then-generate two-call flow
  ipcMain.handle('generate-prompt', async (_event, { task, tier: explicitTier }) => {
    try {
      let tier = explicitTier;
      let classifyCreds = null;

      // Step 1: Classify (unless tier was provided by the user)
      if (!tier) {
        classifyCreds = getSlotCredentials('classify');
        try {
          const classifyText = await callProvider(
            classifyCreds.provider, classifyCreds.model,
            classifyCreds.apiKey, classifyCreds.ollamaUrl, classifyCreds.ollamaApiKey,
            CLASSIFY_PROMPT,
            `Classify this task: ${task}`,
            50,
          );
          const classifyJson = JSON.parse(extractJSON(classifyText));
          if (['simple', 'standard', 'complex'].includes(classifyJson.tier)) {
            tier = classifyJson.tier;
          } else {
            tier = 'standard';
          }
        } catch (err) {
          console.error('[classify] fallback to standard:', err.message);
          tier = 'standard';
        }
      }

      // Step 2: Generate with the matching template
      const genSlot = (tier === 'complex') ? 'generateComplex' : 'generateSimple';
      const genCreds = getSlotCredentials(genSlot);
      const systemPrompt = TEMPLATE_MAP[tier];

      const textContent = await callProvider(
        genCreds.provider, genCreds.model,
        genCreds.apiKey, genCreds.ollamaUrl, genCreds.ollamaApiKey,
        systemPrompt,
        `Generate a perfect AI prompt for this task: ${task}`,
        4096,
      );

      const jsonText = extractJSON(textContent);
      const parsed   = JSON.parse(jsonText);

      return {
        success: true,
        data: parsed,
        tier,
        classifyProvider: classifyCreds?.provider || null,
        classifyModel: classifyCreds?.model || null,
        generateProvider: genCreds.provider,
        generateModel: genCreds.model,
      };
    } catch (err) {
      console.error('[generate-prompt] error:', err);
      return { success: false, error: err.message || String(err) };
    }
  });
```

- [ ] **Step 3: Remove the old single-provider IPC handlers that are no longer needed**

Delete these handlers if they still exist (they reference old `save-provider`, `get-provider`, `save-model`, `get-model`):
- `save-provider` / `get-provider`
- `save-model` / `get-model`

(These should have been removed in Task 2 Step 4, but verify they're gone.)

- [ ] **Step 4: Verify the main process has no syntax errors**

Run: `node -c electron/main.js`

Expected: No output (syntax OK).

- [ ] **Step 5: Commit**

```bash
git add electron/main.js
git commit -m "feat: rewrite generate-prompt as two-call classify-then-generate flow"
```

---

### Task 4: Update Preload Bridge

**Files:**
- Modify: `electron/preload.js` (replace old IPC methods with new ones)

- [ ] **Step 1: Rewrite the preload bridge**

Replace the entire contents of `electron/preload.js` with:

```javascript
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Prompt generation (two-call flow)
  generatePrompt: (config) =>
    ipcRenderer.invoke('generate-prompt', config),

  // API key (shared Anthropic key)
  saveApiKey: (key) =>
    ipcRenderer.invoke('save-api-key', key),
  getApiKey: () =>
    ipcRenderer.invoke('get-api-key'),

  // Clipboard
  copyToClipboard: (text) =>
    ipcRenderer.invoke('copy-to-clipboard', text),

  // Slot config (classify, generateSimple, generateComplex)
  getSlotConfig: () =>
    ipcRenderer.invoke('get-slot-config'),
  saveSlotConfig: (config) =>
    ipcRenderer.invoke('save-slot-config', config),

  // Shared Ollama server config
  saveOllamaUrl: (url) =>
    ipcRenderer.invoke('save-ollama-url', url),
  getOllamaUrl: () =>
    ipcRenderer.invoke('get-ollama-url'),
  saveOllamaApiKey: (key) =>
    ipcRenderer.invoke('save-ollama-api-key', key),
  getOllamaApiKey: () =>
    ipcRenderer.invoke('get-ollama-api-key'),
  fetchOllamaModels: (url, apiKey) =>
    ipcRenderer.invoke('fetch-ollama-models', { url, apiKey }),

  // Send targets
  getSendTargets: () =>
    ipcRenderer.invoke('get-send-targets'),
  saveSendTargets: (targets) =>
    ipcRenderer.invoke('save-send-targets', targets),
  openExternalUrl: (url) =>
    ipcRenderer.invoke('open-external-url', url),

  // Prompt history
  getHistory: () =>
    ipcRenderer.invoke('get-history'),
  saveHistoryEntry: (entry) =>
    ipcRenderer.invoke('save-history-entry', entry),
  clearHistory: () =>
    ipcRenderer.invoke('clear-history'),

  // Window controls
  closeWindow: () =>
    ipcRenderer.invoke('close-window'),
  minimizeWindow: () =>
    ipcRenderer.invoke('minimize-window'),
  resizeWindow: (height) =>
    ipcRenderer.invoke('resize-window', height),
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/preload.js
git commit -m "feat: update preload bridge with slot config, history, and send target channels"
```

---

### Task 5: Update promptService.js

**Files:**
- Modify: `src/lib/promptService.js` (replace old exports with new slot-based API)

- [ ] **Step 1: Rewrite promptService.js**

Replace the entire contents of `src/lib/promptService.js` with:

```javascript
/**
 * promptService.js — Platform abstraction layer for PromptForge
 *
 * All React components call this module exclusively.
 * No component ever touches window.electronAPI directly.
 *
 * Portability contract:
 *   To migrate to React Native or a plain web app, replace the
 *   getIPC() body with direct @anthropic-ai/sdk calls and native
 *   clipboard/storage APIs.  The component tree needs zero changes.
 */

function getIPC() {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI;
  }
  throw new Error(
    'electronAPI bridge unavailable. ' +
    'Are you running inside Electron with contextIsolation + preload?'
  );
}

/**
 * Generate a structured AI prompt for the given task.
 * @param {string} task  Plain-language description of the AI task
 * @param {string} [tier]  Optional tier override — skips classification when provided
 * @returns {Promise<{ data: object, tier: string, classifyProvider?: string, classifyModel?: string, generateProvider: string, generateModel: string }>}
 */
export async function generatePrompt(task, tier) {
  const result = await getIPC().generatePrompt({ task, tier });
  if (!result.success) {
    throw new Error(result.error || 'Unknown error from main process');
  }
  return result;
}

// ── API key (shared Anthropic key) ──────────────────────────────────────────

export async function saveApiKey(key) {
  return getIPC().saveApiKey(key);
}

export async function getApiKey() {
  return getIPC().getApiKey();
}

// ── Clipboard ───────────────────────────────────────────────────────────────

export async function copyToClipboard(text) {
  return getIPC().copyToClipboard(text);
}

// ── Slot config ─────────────────────────────────────────────────────────────

export async function getSlotConfig() {
  return getIPC().getSlotConfig();
}

export async function saveSlotConfig(config) {
  return getIPC().saveSlotConfig(config);
}

// ── Shared Ollama server config ─────────────────────────────────────────────

export async function saveOllamaUrl(url) { return getIPC().saveOllamaUrl(url); }
export async function getOllamaUrl()     { return getIPC().getOllamaUrl(); }

export async function saveOllamaApiKey(key) { return getIPC().saveOllamaApiKey(key); }
export async function getOllamaApiKey()     { return getIPC().getOllamaApiKey(); }

export async function fetchOllamaModels(url, apiKey) {
  return getIPC().fetchOllamaModels(url, apiKey);
}

// ── Send targets ────────────────────────────────────────────────────────────

export async function getSendTargets() {
  return getIPC().getSendTargets();
}

export async function saveSendTargets(targets) {
  return getIPC().saveSendTargets(targets);
}

export async function openExternalUrl(url) {
  return getIPC().openExternalUrl(url);
}

// ── Prompt history ──────────────────────────────────────────────────────────

export async function getHistory() {
  return getIPC().getHistory();
}

export async function saveHistoryEntry(entry) {
  return getIPC().saveHistoryEntry(entry);
}

export async function clearHistory() {
  return getIPC().clearHistory();
}

// ── Window controls ─────────────────────────────────────────────────────────

export async function closeWindow() {
  return getIPC().closeWindow();
}

export async function minimizeWindow() {
  return getIPC().minimizeWindow();
}

export async function resizeWindow(height) {
  return getIPC().resizeWindow(height);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/promptService.js
git commit -m "feat: update promptService with slot config, history, and send target APIs"
```

---

### Task 6: Update Tests for New promptService API

**Files:**
- Modify: `tests/promptService.test.js` (update mock and tests for new API shape)
- Modify: `tests/App.test.jsx` (update mock for new service API — just enough to not break, full UI tests come later)

- [ ] **Step 1: Rewrite promptService.test.js**

Replace the entire contents of `tests/promptService.test.js` with:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as promptService from '../src/lib/promptService.js';

// ── Mock IPC bridge ───────────────────────────────────────────────────────────

const mockIPC = {
  generatePrompt:   vi.fn(),
  saveApiKey:       vi.fn(),
  getApiKey:        vi.fn(),
  copyToClipboard:  vi.fn(),
  getSlotConfig:    vi.fn(),
  saveSlotConfig:   vi.fn(),
  getSendTargets:   vi.fn(),
  saveSendTargets:  vi.fn(),
  openExternalUrl:  vi.fn(),
  getHistory:       vi.fn(),
  saveHistoryEntry: vi.fn(),
  clearHistory:     vi.fn(),
};

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value:        mockIPC,
    writable:     true,
    configurable: true,
  });
  vi.clearAllMocks();
});

// ── generatePrompt ────────────────────────────────────────────────────────────

describe('generatePrompt', () => {
  const MOCK_RESULT = {
    success: true,
    data: { role: 'Assistant', instructions: 'Do X', assembled: '## Role\nAssistant' },
    tier: 'simple',
    generateProvider: 'anthropic',
    generateModel: 'claude-haiku-4-5-20251001',
  };

  it('resolves with the full result on success (auto-classify)', async () => {
    mockIPC.generatePrompt.mockResolvedValue(MOCK_RESULT);

    const result = await promptService.generatePrompt('write a haiku');

    expect(result).toEqual(MOCK_RESULT);
    expect(mockIPC.generatePrompt).toHaveBeenCalledWith({
      task: 'write a haiku',
      tier: undefined,
    });
  });

  it('passes explicit tier to skip classification', async () => {
    mockIPC.generatePrompt.mockResolvedValue({ ...MOCK_RESULT, tier: 'complex' });

    await promptService.generatePrompt('build a code review agent', 'complex');

    expect(mockIPC.generatePrompt).toHaveBeenCalledWith({
      task: 'build a code review agent',
      tier: 'complex',
    });
  });

  it('throws the error message returned by the main process', async () => {
    mockIPC.generatePrompt.mockResolvedValue({ success: false, error: 'Rate limited' });

    await expect(promptService.generatePrompt('task'))
      .rejects.toThrow('Rate limited');
  });

  it('throws a default message when error field is absent', async () => {
    mockIPC.generatePrompt.mockResolvedValue({ success: false });

    await expect(promptService.generatePrompt('task'))
      .rejects.toThrow('Unknown error from main process');
  });
});

// ── Slot config ───────────────────────────────────────────────────────────────

describe('getSlotConfig / saveSlotConfig', () => {
  it('retrieves slot config from IPC', async () => {
    const config = {
      classify: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
      generateSimple: { provider: 'ollama', model: 'llama3.2' },
      generateComplex: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      ollamaUrl: 'http://localhost:11434',
    };
    mockIPC.getSlotConfig.mockResolvedValue(config);

    expect(await promptService.getSlotConfig()).toEqual(config);
  });

  it('saves slot config via IPC', async () => {
    mockIPC.saveSlotConfig.mockResolvedValue(true);

    await promptService.saveSlotConfig({
      classify: { provider: 'ollama', model: 'phi3' },
    });

    expect(mockIPC.saveSlotConfig).toHaveBeenCalledWith({
      classify: { provider: 'ollama', model: 'phi3' },
    });
  });
});

// ── Send targets ──────────────────────────────────────────────────────────────

describe('send targets', () => {
  it('retrieves send targets', async () => {
    const targets = [{ name: 'Claude', url: 'https://claude.ai/new' }];
    mockIPC.getSendTargets.mockResolvedValue(targets);

    expect(await promptService.getSendTargets()).toEqual(targets);
  });

  it('opens an external URL', async () => {
    mockIPC.openExternalUrl.mockResolvedValue(true);

    await promptService.openExternalUrl('https://claude.ai/new');

    expect(mockIPC.openExternalUrl).toHaveBeenCalledWith('https://claude.ai/new');
  });
});

// ── History ───────────────────────────────────────────────────────────────────

describe('history', () => {
  it('retrieves history', async () => {
    mockIPC.getHistory.mockResolvedValue([]);

    expect(await promptService.getHistory()).toEqual([]);
  });

  it('saves a history entry', async () => {
    mockIPC.saveHistoryEntry.mockResolvedValue(true);
    const entry = { task: 'test', tier: 'simple', timestamp: '2026-03-29T00:00:00Z' };

    await promptService.saveHistoryEntry(entry);

    expect(mockIPC.saveHistoryEntry).toHaveBeenCalledWith(entry);
  });

  it('clears history', async () => {
    mockIPC.clearHistory.mockResolvedValue(true);

    await promptService.clearHistory();

    expect(mockIPC.clearHistory).toHaveBeenCalledOnce();
  });
});

// ── saveApiKey / getApiKey (unchanged) ───────────────────────────────────────

describe('saveApiKey / getApiKey', () => {
  it('delegates to IPC', async () => {
    mockIPC.saveApiKey.mockResolvedValue(true);
    await promptService.saveApiKey('sk-ant-my-key');
    expect(mockIPC.saveApiKey).toHaveBeenCalledWith('sk-ant-my-key');
  });

  it('returns stored key', async () => {
    mockIPC.getApiKey.mockResolvedValue('sk-ant-stored');
    expect(await promptService.getApiKey()).toBe('sk-ant-stored');
  });
});

// ── IPC bridge unavailable ────────────────────────────────────────────────────

describe('when electronAPI is not present', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electronAPI', {
      value:        undefined,
      writable:     true,
      configurable: true,
    });
  });

  it('generatePrompt throws a descriptive error', async () => {
    await expect(promptService.generatePrompt('task'))
      .rejects.toThrow('electronAPI bridge unavailable');
  });

  it('getSlotConfig throws a descriptive error', async () => {
    await expect(promptService.getSlotConfig())
      .rejects.toThrow('electronAPI bridge unavailable');
  });
});
```

- [ ] **Step 2: Update the App.test.jsx mock to match the new service API**

Replace the `vi.mock` block at the top of `tests/App.test.jsx` (lines 10-29) with:

```javascript
vi.mock('../src/lib/promptService.js', () => ({
  getApiKey:          vi.fn(),
  saveApiKey:         vi.fn(),
  generatePrompt:     vi.fn(),
  copyToClipboard:    vi.fn(),
  closeWindow:        vi.fn(),
  minimizeWindow:     vi.fn(),
  resizeWindow:       vi.fn(),
  getSlotConfig:      vi.fn(),
  saveSlotConfig:     vi.fn(),
  getOllamaUrl:       vi.fn(),
  saveOllamaUrl:      vi.fn(),
  getOllamaApiKey:    vi.fn(),
  saveOllamaApiKey:   vi.fn(),
  fetchOllamaModels:  vi.fn(),
  getSendTargets:     vi.fn(),
  saveSendTargets:    vi.fn(),
  openExternalUrl:    vi.fn(),
  getHistory:         vi.fn(),
  saveHistoryEntry:   vi.fn(),
  clearHistory:       vi.fn(),
}));
```

Also update `setupDefaultMocks` (lines 37-45) to:

```javascript
function setupDefaultMocks() {
  promptService.getApiKey.mockResolvedValue('');
  promptService.getSlotConfig.mockResolvedValue({
    classify: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
    generateSimple: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
    generateComplex: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
    ollamaUrl: 'http://localhost:11434',
  });
  promptService.getOllamaUrl.mockResolvedValue('http://localhost:11434');
  promptService.getOllamaApiKey.mockResolvedValue('');
  promptService.fetchOllamaModels.mockResolvedValue({ success: true, models: [] });
  promptService.getSendTargets.mockResolvedValue([
    { name: 'Claude', url: 'https://claude.ai/new' },
    { name: 'ChatGPT', url: 'https://chatgpt.com' },
    { name: 'Gemini', url: 'https://gemini.google.com/app' },
  ]);
  promptService.getHistory.mockResolvedValue([]);
}
```

Note: The existing App tests will need further updates once the UI is rewritten in Tasks 7-10. For now, comment out the test bodies that reference removed APIs (like `getProvider`, `getModel`, `saveProvider`, `saveOllamaModel`) and mark them with `it.skip` so the test file still passes. These will be rewritten alongside the UI.

- [ ] **Step 3: Run tests to verify promptService tests pass**

Run: `npm test`

Expected: `promptService.test.js` and `utils.test.js` pass. `App.test.jsx` tests that were skipped show as skipped.

- [ ] **Step 4: Commit**

```bash
git add tests/promptService.test.js tests/App.test.jsx
git commit -m "test: update promptService tests for new slot-based API"
```

---

### Task 7: Rewrite App.jsx — Settings View

**Files:**
- Modify: `src/App.jsx` (rewrite `SettingsView` component and `App` state initialization)

This is the largest UI change. The settings view goes from a single provider/model pair to shared Ollama config + three collapsible slot sections + send targets management.

- [ ] **Step 1: Rewrite the App component state and initialization**

Replace the `App` component (lines 126-204) with one that loads slot config instead of individual provider/model values. The `App` component should:

- Load `getApiKey`, `getSlotConfig`, `getOllamaUrl`, `getOllamaApiKey`, `getSendTargets`, `getHistory` on mount
- Store `slotConfig`, `ollamaUrl`, `ollamaApiKey`, `sendTargets`, `history` in state
- Determine `view` based on whether Anthropic key exists or at least one Ollama slot is configured
- Pass all config down to `SettingsView` and `MainView`

Key state shape:

```javascript
const [slotConfig, setSlotConfig] = useState(null);
const [apiKey, setApiKey] = useState('');
const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
const [ollamaApiKey, setOllamaApiKey] = useState('');
const [sendTargets, setSendTargets] = useState([]);
const [history, setHistory] = useState([]);
```

- [ ] **Step 2: Rewrite SettingsView**

The new `SettingsView` has:
- Shared Ollama config at top (URL + API key) — always visible
- Shared Anthropic API key field — always visible
- Three collapsible `SlotConfigSection` components: Classify, Simple & Standard, Complex
- Each `SlotConfigSection` has: provider toggle (Anthropic/Ollama), model dropdown
- Send targets management section: list of name+URL pairs, add/remove buttons
- Save & Continue button

Create an inline `SlotConfigSection` component that accepts `{ label, slotKey, provider, model, ollamaModels, anthropicModels, onChange }` props.

- [ ] **Step 3: Verify the settings view renders**

Run: `npm run dev`

Expected: App launches, settings view shows shared config at top, three collapsible slot sections, send targets section, and Save & Continue button.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: rewrite SettingsView with per-slot config and send targets"
```

---

### Task 8: Rewrite App.jsx — MainView With Tier Badge, Override Row, and Two-Step Loading

**Files:**
- Modify: `src/App.jsx` (rewrite `MainView` component)

- [ ] **Step 1: Rewrite MainView**

The new `MainView` needs:

**State:**
```javascript
const [task, setTask] = useState('');
const [loading, setLoading] = useState(false);
const [loadingStep, setLoadingStep] = useState(''); // 'classifying' | 'generating'
const [result, setResult] = useState(null);
const [tier, setTier] = useState(null);
const [error, setError] = useState('');
const [errorKey, setErrorKey] = useState(0);
const [activeTab, setActiveTab] = useState('assembled');
const [showOverride, setShowOverride] = useState(false);
```

**Generate flow:**
```javascript
async function handleGenerate(overrideTier) {
  const trimmed = task.trim();
  if (!trimmed || loading) return;
  setLoading(true);
  setError('');
  setResult(null);
  setTier(null);

  try {
    if (!overrideTier) setLoadingStep('classifying');
    else setLoadingStep('generating');

    const response = await promptService.generatePrompt(trimmed, overrideTier || undefined);

    setLoadingStep('generating');
    // The main process already did both calls — response has the final data
    setResult(response.data);
    setTier(response.tier);
    setActiveTab('assembled');

    // Save to history
    promptService.saveHistoryEntry({
      task: trimmed,
      tier: response.tier,
      result: response.data,
      classifyProvider: response.classifyProvider,
      classifyModel: response.classifyModel,
      generateProvider: response.generateProvider,
      generateModel: response.generateModel,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    setError(err.message || 'Something went wrong.');
    setErrorKey((k) => k + 1);
  } finally {
    setLoading(false);
    setLoadingStep('');
  }
}
```

**Two-step loading implementation:** Since both API calls happen in `main.js` as a single IPC round-trip, the renderer can't switch from "Classifying..." to "Generating..." mid-call without an extra notification. To implement this properly:

1. Add a `webContents.send('classify-done', { tier })` call in the `generate-prompt` handler between the classify and generate calls.
2. In preload, expose: `onClassifyDone: (callback) => ipcRenderer.on('classify-done', (_e, data) => callback(data))`
3. In promptService: `export function onClassifyDone(callback) { return getIPC().onClassifyDone(callback); }`
4. In MainView, register the listener before calling `generatePrompt`. When fired, update `setLoadingStep('generating')` and `setTier(data.tier)`.

This gives real two-step feedback:
- Button shows "Classifying..." immediately on click
- After classify completes, button switches to "Generating..." and the tier badge appears early
- After generate completes, results populate

When the user provides an explicit tier override, only "Generating..." is shown (no classify call).

**Tier badge:** After results, show a clickable pill badge displaying the tier. Clicking reveals a dropdown with Simple/Standard/Complex. Selecting a different tier calls `handleGenerate(selectedTier)`.

**Model override row:** Below textarea, a collapsible row toggled by a sliders icon. Shows three compact dropdowns for the three slots. Changes call `promptService.saveSlotConfig()` immediately.

**Top bar model badge:** Shows `slotConfig.generateSimple.model` by default, or the model that was actually used after a generation (from `response.generateModel`).

- [ ] **Step 2: Add `IconSliders` and `IconClock` icon components**

Add at the top of App.jsx alongside the other icon components:

```javascript
function IconSliders() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <line x1="4" y1="21" x2="4" y2="14"/>
      <line x1="4" y1="10" x2="4" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12" y2="3"/>
      <line x1="20" y1="21" x2="20" y2="16"/>
      <line x1="20" y1="12" x2="20" y2="3"/>
      <line x1="1" y1="14" x2="7" y2="14"/>
      <line x1="9" y1="8" x2="15" y2="8"/>
      <line x1="17" y1="16" x2="23" y2="16"/>
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

function IconSend() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}
```

- [ ] **Step 3: Verify the main view works end-to-end**

Run: `npm run dev`

Expected: Type a task, click Generate. Button shows "Classifying..." then results appear with a tier badge. Clicking the badge allows re-generating with a different tier.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add tier badge, model override row, and two-step loading to MainView"
```

---

### Task 9: Add Send-to-Provider and History UI

**Files:**
- Modify: `src/App.jsx` (add send-to-provider buttons in results, add history panel)

- [ ] **Step 1: Add send-to-provider buttons to the AssembledTab**

In the `AssembledTab` component, add a row of send-to buttons below the Copy All button. Each button:
1. Calls `promptService.copyToClipboard(assembled)`
2. Calls `promptService.openExternalUrl(target.url)`
3. Shows a toast "Prompt copied — paste into chat"

The send targets come from props (loaded in App from `getSendTargets`).

Add a `Toast` component — a simple fixed-position div that auto-hides after 2.5 seconds:

```javascript
function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return <div className="toast" role="status">{message}</div>;
}
```

- [ ] **Step 2: Add history panel**

Add a `HistoryPanel` component that renders when a `showHistory` state is true in `MainView`. Toggled by the clock icon in the top bar.

```javascript
function HistoryPanel({ history, onSelect, onClear, onClose }) {
  return (
    <div className="history-panel">
      <div className="history-header">
        <span className="history-title">History</span>
        <div className="history-actions">
          {history.length > 0 && (
            <button className="btn btn-secondary" onClick={onClear} style={{ fontSize: 11, padding: '3px 8px' }}>
              Clear
            </button>
          )}
          <button className="icon-btn small" onClick={onClose} aria-label="Close history">
            <IconX />
          </button>
        </div>
      </div>
      {history.length === 0 ? (
        <p className="history-empty">No history yet</p>
      ) : (
        <div className="history-list">
          {history.map((entry, i) => (
            <button key={i} className="history-entry" onClick={() => onSelect(entry)}>
              <span className="history-task">{entry.task}</span>
              <div className="history-meta">
                <span className={`tier-badge tier-${entry.tier}`}>{entry.tier}</span>
                <span className="history-time">
                  {new Date(entry.timestamp).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

When a history entry is selected, restore it into the results panel: `setResult(entry.result)`, `setTier(entry.tier)`, `setTask(entry.task)`.

- [ ] **Step 3: Verify send-to and history work**

Run: `npm run dev`

Expected:
- After generation, send-to buttons appear. Clicking one copies to clipboard and opens the URL.
- History icon shows past generations. Clicking one restores it.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add send-to-provider buttons and prompt history panel"
```

---

### Task 10: Add CSS Styles for New UI Elements

**Files:**
- Modify: `src/index.css` (add styles for tier badge, override row, send-to buttons, toast, history panel)

- [ ] **Step 1: Add tier badge styles**

Append to `src/index.css`:

```css
/* ── Tier badge ────────────────────────────────────────────────────────────── */

.tier-badge {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-radius: 10px;
  padding: 2px 8px;
  cursor: pointer;
  transition: background var(--transition), border-color var(--transition);
  user-select: none;
}

.tier-simple {
  color: var(--success);
  background: rgba(74, 222, 128, 0.1);
  border: 1px solid rgba(74, 222, 128, 0.25);
}

.tier-standard {
  color: var(--accent);
  background: var(--accent-dim);
  border: 1px solid rgba(124, 106, 247, 0.25);
}

.tier-complex {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.25);
}

.tier-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--surface-2);
  border: 1px solid var(--border-focus);
  border-radius: var(--radius);
  overflow: hidden;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.tier-option {
  display: block;
  width: 100%;
  padding: 6px 12px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  font-family: var(--font-ui);
  text-align: left;
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.tier-option:hover {
  background: var(--surface-3);
  color: var(--text);
}

.tier-option.active {
  color: var(--accent);
}
```

- [ ] **Step 2: Add model override row styles**

```css
/* ── Model override row ────────────────────────────────────────────────────── */

.override-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 11px;
  font-family: var(--font-ui);
  cursor: pointer;
  padding: 2px 0;
  transition: color var(--transition);
}

.override-toggle:hover {
  color: var(--text-muted);
}

.override-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0 4px;
}

.override-slot {
  display: flex;
  align-items: center;
  gap: 6px;
}

.override-label {
  font-size: 10px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  min-width: 70px;
  flex-shrink: 0;
}

.override-select {
  flex: 1;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 4px 8px;
  font-size: 11px;
  font-family: var(--font-ui);
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23808080' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  padding-right: 22px;
  cursor: pointer;
}
```

- [ ] **Step 3: Add send-to-provider styles**

```css
/* ── Send to provider ──────────────────────────────────────────────────────── */

.send-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.btn-send {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-muted);
  font-size: 11px;
  font-family: var(--font-ui);
  cursor: pointer;
  transition: background var(--transition), color var(--transition), border-color var(--transition);
  white-space: nowrap;
}

.btn-send:hover {
  background: var(--surface-3);
  color: var(--text);
  border-color: var(--border-focus);
}
```

- [ ] **Step 4: Add toast styles**

```css
/* ── Toast ─────────────────────────────────────────────────────────────────── */

.toast {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface-3);
  color: var(--text);
  font-size: 12px;
  padding: 7px 14px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-focus);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  z-index: 100;
  animation: toast-in 0.2s ease;
}

@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
```

- [ ] **Step 5: Add history panel styles**

```css
/* ── History panel ─────────────────────────────────────────────────────────── */

.history-panel {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  flex: 1;
  min-height: 0;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.history-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}

.history-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.history-empty {
  padding: 20px;
  text-align: center;
  color: var(--text-dim);
  font-size: 12px;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.history-list::-webkit-scrollbar { width: 4px; }
.history-list::-webkit-scrollbar-track { background: transparent; }
.history-list::-webkit-scrollbar-thumb {
  background: var(--border-focus);
  border-radius: 2px;
}

.history-entry {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-family: var(--font-ui);
  text-align: left;
  cursor: pointer;
  transition: background var(--transition);
}

.history-entry:hover {
  background: var(--surface);
}

.history-entry:last-child {
  border-bottom: none;
}

.history-task {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.history-time {
  font-size: 10px;
  color: var(--text-dim);
}
```

- [ ] **Step 6: Add collapsible settings section styles**

```css
/* ── Settings collapsible sections ─────────────────────────────────────────── */

.settings-section {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.settings-section-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 10px;
  background: var(--surface);
  border: none;
  color: var(--text);
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-ui);
  cursor: pointer;
  text-align: left;
  transition: background var(--transition);
}

.settings-section-toggle:hover {
  background: var(--surface-2);
}

.settings-section-body {
  padding: 10px;
  background: var(--bg);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ── Send target management ────────────────────────────────────────────────── */

.send-target-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.send-target-row .text-input {
  flex: 1;
  padding: 5px 8px;
  font-size: 12px;
}

.send-target-remove {
  background: transparent;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius);
  transition: color var(--transition), background var(--transition);
}

.send-target-remove:hover {
  color: var(--error);
  background: var(--error-dim);
}
```

- [ ] **Step 7: Run the app and visually verify all new styles**

Run: `npm run dev`

Expected: All new UI elements are styled consistently with the existing dark theme.

- [ ] **Step 8: Commit**

```bash
git add src/index.css
git commit -m "feat: add styles for tier badge, override row, send-to, toast, and history"
```

---

### Task 11: Rewrite App Tests for New UI

**Files:**
- Modify: `tests/App.test.jsx` (rewrite tests for the new UI)

- [ ] **Step 1: Rewrite the App.test.jsx test suite**

The existing tests reference old APIs (`getProvider`, `getModel`, `saveProvider`, etc.). Rewrite each describe block to match the new component behavior:

**Initial routing tests:** Load based on `getApiKey` + `getSlotConfig`. If no API key and no Ollama model configured, show settings.

**Settings view tests:** Verify the three collapsible slot sections render. Verify save persists via `saveSlotConfig`.

**Main view tests:**
- Verify `generatePrompt` is called with `{ task }` (no tier) for auto-classify
- Verify tier badge appears after generation
- Verify clicking a different tier calls `generatePrompt` with `{ task, tier }`
- Verify loading states show "Classifying..." then result

**History tests:** Verify history icon opens panel, entries are clickable, clear works.

**Send-to tests:** Verify send buttons appear, clicking one calls `copyToClipboard` + `openExternalUrl`.

Key mock setup for generate tests:

```javascript
promptService.generatePrompt.mockResolvedValue({
  success: true,
  data: { role: 'r', instructions: 'i', assembled: 'THE PROMPT' },
  tier: 'simple',
  generateProvider: 'anthropic',
  generateModel: 'claude-haiku-4-5-20251001',
});
```

Note: The `generatePrompt` mock now returns the full response object (with `tier`, `data`, etc.) since `promptService.generatePrompt` no longer unwraps — it returns the full `{ success, data, tier, ... }` object.

- [ ] **Step 2: Run all tests**

Run: `npm test`

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/App.test.jsx
git commit -m "test: rewrite App tests for tiered generation, history, and send-to"
```

---

### Task 12: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md to reflect the new architecture**

Key updates:
- Document the three-tier system and two-call flow
- Document per-slot model configuration
- Document the new IPC channels (slot config, history, send targets)
- Update the prompt output description (variable fields per tier)
- Note the `TEMPLATE_MAP` and `CLASSIFY_PROMPT` constants

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for tiered prompt generation architecture"
```

---

### Task 13: Final Integration Test

**Files:** None — manual verification

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: All tests pass.

- [ ] **Step 2: Run the app end-to-end**

Run: `npm run dev`

Verify:
1. First launch shows settings with three slot sections
2. Configure Anthropic API key, save
3. Type a simple task ("write a haiku") → tier badge shows "Simple", 4 fields in breakdown
4. Type a complex task ("build a code review agent") → tier badge shows "Complex", 8 fields in breakdown
5. Click tier badge → select different tier → re-generates
6. Model override row expands, shows three dropdowns, changes persist
7. Send-to buttons copy and open browser
8. History icon shows past generations, clicking restores one
9. Settings correctly persist and reload across restarts

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: tiered prompt generation — complete implementation"
```
