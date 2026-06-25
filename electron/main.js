'use strict';

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
  globalShortcut,
} = require('electron');
const path  = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

const store = new Store();
const isDev = process.env.NODE_ENV === 'development';

let tray = null;
let win  = null;
let isQuitting = false;   // set true when a real quit is requested (X without close-to-tray, or tray → Quit)
let positioned = false;   // anchor the window lower-right only on first show; respect user moves after

// ── System Prompts ───────────────────────────────────────────────────────────

const CLASSIFY_PROMPT = `You are a prompt complexity classifier. Given a task description, determine whether it requires a simple, standard, or complex prompt structure.

- simple: Creative, conversational, or single-step tasks (e.g. "write a haiku", "draft an email", "explain X simply")
- standard: Tasks with moderate constraints, structure, or domain context (e.g. "write SEO product copy", "summarize with key takeaways", "create a lesson plan")
- complex: Agentic, multi-step, or heavily constrained tasks (e.g. "build a code review agent", "create a data pipeline prompt with retry logic", "design a multi-turn tutoring system")

CRITICAL: Respond with ONLY raw, valid JSON — no markdown fences, no prose. Just the JSON object.

{"tier": "simple" | "standard" | "complex"}`;

const SYSTEM_PROMPT_SIMPLE = `You are a world-class prompt engineer. Given a task description, you produce a focused AI prompt that reads like a contract: decide what "done" looks like, then state it plainly. Keep the whole prompt tight (aim ~150 words) — clarity and structure, not length.

CRITICAL: Respond with ONLY raw, valid JSON — no markdown fences, no prose, no code blocks. Just the JSON object.

Return an object with exactly these 3 string fields (all values must be strings, not nested objects or arrays):

{
  "role": "One sentence defining the AI's identity and primary mission",
  "instructions": "The task stated unambiguously — the precise outcome wanted, plus what NOT to do. If the input could be ambiguous, tell the AI to ask before proceeding rather than guess.",
  "outputFormat": "A concrete output contract — exact structure, length, and tone, so 'done' is unmistakable"
}`;

const SYSTEM_PROMPT_STANDARD = `You are a world-class prompt engineer. Given a task description, you produce a structured AI prompt that reads like a contract: decide the success criteria and output format first, then write to them. Favor structure over length — keep it tight (~150-300 words) and never pad.

Do NOT instruct the target model to "think step by step" or show its reasoning — modern models reason internally and explicit chain-of-thought can degrade them. Use constraints and a clear output contract instead.

CRITICAL: Respond with ONLY raw, valid JSON — no markdown fences, no prose, no code blocks. Just the JSON object.

Return an object with exactly these 5 string fields (all values must be strings, not nested objects or arrays):

{
  "role": "1-2 sentences defining the AI's identity, expertise level, and primary mission",
  "instructions": "The task stated unambiguously with strong action verbs — the precise outcome wanted and the key steps to achieve it",
  "context": "Background, domain knowledge, and the inputs the task depends on. When the real use will include large input data, note that the data should be placed first and the question last.",
  "constraints": "Boundaries and what is explicitly OUT of scope, plus an uncertainty rule — e.g. 'if unsure or the input is ambiguous, ask rather than guess; only make claims grounded in the provided material.'",
  "outputFormat": "An explicit output contract — exact schema/structure, field names, length, tone, with a short example skeleton if helpful"
}`;

const SYSTEM_PROMPT_COMPLEX = `You are a world-class prompt engineer. Given a task description, you produce a comprehensive, structured AI prompt that reads like a contract: define the success criteria and output format first, then write to them. Favor structure and constraints over length — depth comes from precision, not word count.

Do NOT instruct the target model to "think step by step" or narrate its reasoning — modern models reason internally and explicit chain-of-thought can degrade them. Put a short verification pass in the self-check field instead.

CRITICAL: Respond with ONLY raw, valid JSON — no markdown fences, no prose, no code blocks. Just the JSON object.

Return an object with exactly these 7 string fields (all values must be strings, not nested objects or arrays):

{
  "role": "1-2 sentences defining the AI's identity, expertise level, and primary mission",
  "instructions": "The task stated unambiguously with strong action verbs — the precise outcome, the key steps, and the edge cases to handle",
  "context": "Background, domain knowledge, and the inputs the task depends on. For large real input data, note that data goes first and the question last.",
  "constraints": "Boundaries and what is explicitly OUT of scope, plus an uncertainty/abstention rule — e.g. 'if unsure or the input is ambiguous, ask rather than guess; only assert claims grounded in the provided material, and mark anything else [UNCERTAIN].'",
  "outputFormat": "An explicit output contract — exact schema, field names, length, tone, with an example skeleton",
  "examples": "1-2 concrete few-shot examples showing ideal input → output pairs, formatted clearly",
  "selfCheck": "A short verification checklist the AI must pass before finalizing (3-4 bullets), e.g. 'Before finalizing, verify: output matches the format exactly; all success criteria met (flag any misses); claims grounded in the input; nothing out-of-scope added.' This is a check on the result, NOT a reasoning script."
}`;

const SYSTEM_PROMPT_IMAGE = `You are a world-class image-prompt engineer. Given a brief task description, you produce a vivid, descriptive prompt for modern multimodal image generators (SDXL, Qwen-Image, Nano Banana, ComfyUI, Gemini, Grok).

Use natural-language descriptive paragraphs, not comma-separated tag soup. Be concrete and sensory: name colors, materials, light direction, lens choice. Expand the user's brief — do not just rephrase it.

CRITICAL: Respond with ONLY raw, valid JSON — no markdown fences, no prose, no code blocks. Just the JSON object.

Return an object with exactly these 8 string fields (all values must be strings, not nested objects or arrays). Use empty string "" for any field that does not apply.

{
  "subject": "Concrete description of what is in the frame, expanded with sensory detail",
  "style": "Medium and aesthetic — photographic, 3D render, oil painting, anime, etc.",
  "composition": "Framing, angle, perspective, focal point",
  "lighting": "Light source, quality, direction, time of day",
  "mood": "Atmosphere and emotional tone",
  "technical": "Camera/lens for photo, render engine for 3D, model-specific quality hints",
  "negativePrompt": "Things to avoid (mainly for SDXL/ComfyUI). Use empty string if not meaningfully helpful.",
  "assembled": "A single paste-ready descriptive paragraph combining all of the above into prose suitable for any of the listed tools. No headers, no bullet points."
}`;

const SYSTEM_PROMPT_VIDEO = `You are a world-class video-prompt engineer. Given a brief task description, you produce a vivid, descriptive prompt for short-form AI video generators (Sora, Runway, Kling, Veo via Gemini, Grok video, ComfyUI workflows).

Use natural-language descriptive paragraphs, not comma-separated tag soup. Describe motion concretely — what moves, how it moves, where the camera goes. Expand the user's brief — do not just rephrase it.

CRITICAL: Respond with ONLY raw, valid JSON — no markdown fences, no prose, no code blocks. Just the JSON object.

Return an object with exactly these 9 string fields (all values must be strings, not nested objects or arrays). Use empty string "" for any field that does not apply.

{
  "subject": "Scene and characters — what we see in the frame",
  "action": "What happens; the motion itself",
  "cameraMotion": "Pan, dolly, tracking, static, handheld — describe camera movement",
  "style": "Cinematic, animated, documentary, music-video, etc.",
  "lighting": "Light setup, time of day, mood-shaping illumination",
  "mood": "Tone and atmosphere",
  "pacing": "Fast cuts, slow burn, single continuous shot — rhythm of the clip",
  "negativePrompt": "Things to avoid. Use empty string if not meaningfully helpful.",
  "assembled": "A single paste-ready descriptive paragraph combining all of the above into prose suitable for any of the listed tools. No headers, no bullet points."
}`;

const TEMPLATE_MAP = {
  simple:   SYSTEM_PROMPT_SIMPLE,
  standard: SYSTEM_PROMPT_STANDARD,
  complex:  SYSTEM_PROMPT_COMPLEX,
  image:    SYSTEM_PROMPT_IMAGE,
  video:    SYSTEM_PROMPT_VIDEO,
};

// ── JSON extraction ───────────────────────────────────────────────────────────

// Reasoning models (DeepSeek-R1, Qwen3 / QwQ, etc.) wrap their chain of thought
// in <think>…</think> and put the real answer after it. That thinking often
// contains braces and JSON examples, which would wreck brace-based extraction —
// so drop everything up to and including the final </think> before parsing.
function stripReasoning(text) {
  if (!text) return text || '';
  let out = text;
  const close = out.toLowerCase().lastIndexOf('</think>');
  if (close !== -1) out = out.slice(close + '</think>'.length);
  // Remove any remaining complete <think>…</think> blocks defensively.
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '');
  return out;
}

function extractJSON(text) {
  if (text == null) return '';
  text = stripReasoning(text);
  // Strip markdown code fences if the model wraps the JSON
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Find the outermost {...}
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return text.trim();
}

// ── Test Bench rubric + judge parsing (CJS mirror of src/lib/testBench.js) ─────
// Keep in sync with the ESM copy (same convention as extractJSON).

const TEST_BENCH_RUBRIC = `You are a strict prompt-evaluation judge. You are given a PROMPT (an engineered AI prompt) and the OUTPUT a model produced when that prompt was run against a sample task.

Score how well the OUTPUT fulfils the PROMPT's intent, on a 0-10 integer scale:
- 9-10: excellent — follows every instruction, correct format, no drift
- 6-8:  good — minor issues or omissions
- 3-5:  weak — ignores constraints or wrong format
- 0-2:  failing — off-task or unusable

Respond with ONLY raw, valid JSON — no markdown fences, no prose:

{"score": <integer 0-10>, "critique": "<one or two sentences on the single most important issue>", "strengths": ["<short>", "..."], "weaknesses": ["<short>", "..."]}`;

function clampScore(n) {
  const num = typeof n === 'number' ? n : parseFloat(n);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(10, Math.round(num)));
}

function parseJudgement(text) {
  const fallback = { score: null, critique: '', strengths: [], weaknesses: [] };
  if (typeof text !== 'string' || !text.trim()) return fallback;
  const asArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);
  try {
    const obj = JSON.parse(extractJSON(text));
    return {
      score: clampScore(obj.score),
      critique: typeof obj.critique === 'string' ? obj.critique.trim() : '',
      strengths: asArray(obj.strengths),
      weaknesses: asArray(obj.weaknesses),
    };
  } catch {
    const m = text.match(/\bscore\b\D{0,8}(\d{1,2})|(\d{1,2})\s*\/\s*10/i);
    const raw = m ? (m[1] ?? m[2]) : null;
    return { ...fallback, score: clampScore(raw), critique: text.trim().slice(0, 200) };
  }
}

// ── Network ───────────────────────────────────────────────────────────────────
// fetch() has no default timeout, so a hung/slow custom endpoint would block
// forever. Abort after CALL_TIMEOUT_MS so a stalled call surfaces as an error
// (which then triggers the model fallback chain). Generous enough not to kill a
// legitimately slow reasoning model mid-generation.
const CALL_TIMEOUT_MS = 120000;

async function fetchWithTimeout(url, options = {}, ms = CALL_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(ms / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Image / video section maps (CJS mirror of src/lib/utils.js) ───────────────

const IMAGE_SECTIONS_CJS = [
  { key: 'subject',        header: '## Subject' },
  { key: 'style',          header: '## Style' },
  { key: 'composition',    header: '## Composition' },
  { key: 'lighting',       header: '## Lighting' },
  { key: 'mood',           header: '## Mood' },
  { key: 'technical',      header: '## Technical' },
  { key: 'negativePrompt', header: '## Negative Prompt' },
];

const VIDEO_SECTIONS_CJS = [
  { key: 'subject',        header: '## Subject' },
  { key: 'action',         header: '## Action' },
  { key: 'cameraMotion',   header: '## Camera Motion' },
  { key: 'style',          header: '## Style' },
  { key: 'lighting',       header: '## Lighting' },
  { key: 'mood',           header: '## Mood' },
  { key: 'pacing',         header: '## Pacing' },
  { key: 'negativePrompt', header: '## Negative Prompt' },
];

function assembleSectionsCJS(result, sections) {
  if (!result) return '';
  return sections
    .filter(({ key }) => typeof result[key] === 'string' && result[key].trim())
    .map(({ key, header }) => `${header}\n\n${result[key].trim()}`)
    .join('\n\n');
}

// ── Config Migration ─────────────────────────────────────────────────────────

const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_OPENAI_MODEL    = 'gpt-4o-mini';

const DEFAULT_SEND_TARGETS = [
  { name: 'Claude',  url: 'https://claude.ai/new' },
  { name: 'ChatGPT', url: 'https://chatgpt.com' },
  { name: 'Gemini',  url: 'https://gemini.google.com/app' },
];

function migrateConfig() {
  if (!store.get('configMigrated')) {
    const oldProvider = store.get('provider', 'anthropic');
    const oldModel    = store.get('model', DEFAULT_ANTHROPIC_MODEL);

    for (const slot of ['classify', 'generateSimple', 'generateComplex']) {
      if (!store.get(`${slot}.provider`)) {
        store.set(`${slot}.provider`, oldProvider);
        store.set(`${slot}.model`, slot === 'classify' ? DEFAULT_ANTHROPIC_MODEL : oldModel);
      }
    }

    if (!store.get('sendTargets')) {
      store.set('sendTargets', DEFAULT_SEND_TARGETS);
    }

    if (!store.get('history')) {
      store.set('history', []);
    }

    store.delete('provider');
    store.delete('model');

    store.set('configMigrated', true);
  }

  // v2 — backfill `authMethod: 'apiKey'` onto every slot that predates the field.
  if (!store.get('configMigratedV2')) {
    for (const slot of ['classify', 'generateSimple', 'generateComplex']) {
      if (!store.get(`${slot}.authMethod`)) {
        store.set(`${slot}.authMethod`, 'apiKey');
      }
    }
    store.set('configMigratedV2', true);
  }

  // v3 — shared custom endpoint → named-endpoints list. Each model slot now
  // references its own endpoint by id, so different slots can target different
  // servers. The previous single shared endpoint becomes the first named entry.
  if (!store.get('configMigratedV3')) {
    if (!store.get('endpoints')) {
      const id = 'ep-legacy';
      store.set('endpoints', [{
        id,
        name:   'Custom Endpoint',
        url:    store.get('ollamaUrl', 'http://localhost:11434'),
        format: store.get('endpointFormat', 'openai'),
      }]);
      const sharedKey = readEncryptedKey('ollamaApiKey', 'ollamaApiKeyEncrypted');
      if (sharedKey) writeEndpointKey(id, sharedKey);
      for (const slot of ['classify', 'generateSimple', 'generateComplex']) {
        if (store.get(`${slot}.provider`) === 'ollama' && !store.get(`${slot}.endpointId`)) {
          store.set(`${slot}.endpointId`, id);
        }
      }
    }
    store.set('configMigratedV3', true);
  }
}

// ── Key storage (DPAPI-encrypted at rest when available) ──────────────────────

/** Read+decrypt a key stored as either DPAPI ciphertext (base64) or plaintext. */
function readEncryptedKey(valueKey, flagKey) {
  const stored      = store.get(valueKey, '');
  const isEncrypted = store.get(flagKey, false);
  if (!stored) return '';
  if (isEncrypted && safeStorage.isEncryptionAvailable()) {
    try { return safeStorage.decryptString(Buffer.from(stored, 'base64')); } catch { return ''; }
  }
  return stored;
}

/** Persist a key, encrypting via DPAPI when available. */
function writeEncryptedKey(valueKey, flagKey, key) {
  if (!key) {
    store.delete(valueKey);
    store.delete(flagKey);
    return;
  }
  if (safeStorage.isEncryptionAvailable()) {
    store.set(valueKey, safeStorage.encryptString(key).toString('base64'));
    store.set(flagKey, true);
  } else {
    store.set(valueKey, key);
    store.set(flagKey, false);
  }
}

// Per-endpoint API keys live in two parallel maps keyed by endpoint id:
//   endpointKeys     : { [id]: base64-or-plaintext }
//   endpointKeysEnc  : { [id]: boolean }   (true → the value is DPAPI ciphertext)

function readEndpointKey(id) {
  if (!id) return '';
  const keys = store.get('endpointKeys', {});
  const enc  = store.get('endpointKeysEnc', {});
  const stored = keys[id];
  if (!stored) return '';
  if (enc[id] && safeStorage.isEncryptionAvailable()) {
    try { return safeStorage.decryptString(Buffer.from(stored, 'base64')); } catch { return ''; }
  }
  return stored;
}

function writeEndpointKey(id, key) {
  if (!id) return;
  const keys = store.get('endpointKeys', {});
  const enc  = store.get('endpointKeysEnc', {});
  if (!key) {
    delete keys[id];
    delete enc[id];
  } else if (safeStorage.isEncryptionAvailable()) {
    keys[id] = safeStorage.encryptString(key).toString('base64');
    enc[id]  = true;
  } else {
    keys[id] = key;
    enc[id]  = false;
  }
  store.set('endpointKeys', keys);
  store.set('endpointKeysEnc', enc);
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width: 560,
    height: 600,
    show: false,
    frame: false,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    transparent: false,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    // Uncomment to open DevTools during development:
    // win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Close behavior depends on the user's "close to tray" preference:
  //   • on  → hide to tray (the app keeps running in the background)
  //   • off → let the window close, which quits the app (real-app default)
  // A real quit (tray → Quit, or X with the toggle off) sets isQuitting first.
  win.on('close', (e) => {
    if (!isQuitting && store.get('closeToTray', false)) {
      e.preventDefault();
      win.hide();
    }
  });
}

// ── Positioning ───────────────────────────────────────────────────────────────

function getWindowPosition() {
  const { x: wx, y: wy, width: ww, height: wh } = screen.getPrimaryDisplay().workArea;
  const winBounds = win.getBounds();

  // Lower-right corner, 12px from work area edges (above taskbar)
  const x = wx + ww - winBounds.width  - 12;
  const y = wy + wh - winBounds.height - 12;

  return { x, y };
}

function showWindow() {
  // Anchor lower-right on the first show only; afterwards respect wherever the
  // user has moved the window (it's a real, movable app now).
  if (!positioned) {
    const { x, y } = getWindowPosition();
    win.setPosition(x, y, false);
    positioned = true;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function toggleWindow() {
  win.isVisible() ? win.hide() : showWindow();
}

// ── Auto-update (GitHub Releases via electron-updater) ────────────────────────
// autoDownload is off — we surface "update available" and let the user choose to
// download/install (matches "installs automatically if the user wants"). The feed
// comes from the `publish` config in package.json (github ggrace519/prompt-forge).

function sendUpdateStatus(payload) {
  if (win && !win.isDestroyed()) win.webContents.send('update-status', payload);
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;          // ask before downloading
  autoUpdater.autoInstallOnAppQuit = true;   // apply a downloaded update on quit

  autoUpdater.on('checking-for-update', () => sendUpdateStatus({ status: 'checking' }));
  autoUpdater.on('update-available',     (info) => sendUpdateStatus({ status: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => sendUpdateStatus({ status: 'none' }));
  autoUpdater.on('download-progress',    (p) => sendUpdateStatus({ status: 'downloading', percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded',    (info) => sendUpdateStatus({ status: 'downloaded', version: info.version }));
  autoUpdater.on('error',                (err) => sendUpdateStatus({ status: 'error', message: (err && err.message) || String(err) }));

  // Auto-check shortly after launch (production only — dev has no update feed).
  if (!isDev) {
    setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 4000);
  }
}

// ── Sync IPC (must be registered before any window loads) ────────────────────

ipcMain.on('get-theme-sync', (event) => {
  event.returnValue = store.get('theme', 'dark');
});

// ── Single instance ──────────────────────────────────────────────────────────
// A real app should have exactly one instance. If a second launch happens,
// surface the already-running window instead of starting a duplicate.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) showWindow();
  });
}

// ── App ready ─────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Hide from macOS dock (no-op on Windows, harmless)
  if (app.dock) app.dock.hide();

  migrateConfig();

  createWindow();

  // Tray icon
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  const rawIcon  = nativeImage.createFromPath(iconPath);
  const icon     = rawIcon.isEmpty()
    ? nativeImage.createEmpty()
    : rawIcon.resize({ width: 16, height: 16 });

  tray = new Tray(icon);
  tray.setToolTip('PromptForge — Click to open');

  // Left-click: toggle window
  tray.on('click', toggleWindow);

  // Right-click: context menu
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Open PromptForge', click: showWindow },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.popUpContextMenu(menu);
  });

  // Open visibly on launch — this is a real app, not a tray-only popup.
  showWindow();

  // Global summon — bring PromptForge to the front from any app (Raycast-style).
  globalShortcut.register('CommandOrControl+Shift+Space', showWindow);

  // Auto-update — check GitHub Releases shortly after launch.
  setupAutoUpdater();

  // ── Provider call helper ──────────────────────────────────────────────────

  async function callProvider(creds, systemPrompt, userMessage, maxTokens = 16384) {
    const { provider, authMethod, model, apiKey, openaiApiKey, ollamaUrl, ollamaApiKey, endpointFormat } = creds;

    // The `ollama` provider value is a custom user-supplied endpoint. The
    // `endpointFormat` selects which wire protocol to speak against that URL:
    //   'openai'    → POST {url}/v1/chat/completions  (default; broadest compat)
    //   'ollama'    → POST {url}/api/chat             (native Ollama)
    //   'anthropic' → POST {url}/v1/messages          (Anthropic-compatible)
    if (provider === 'ollama') {
      const baseUrl = (ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
      const format = endpointFormat || 'openai';

      if (format === 'anthropic') {
        const headers = { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' };
        if (ollamaApiKey) headers['x-api-key'] = ollamaApiKey;

        const res = await fetchWithTimeout(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Custom endpoint (Anthropic) ${res.status}: ${body}`);
        }
        const data = await res.json();
        const textBlock = (data.content || []).find((b) => b.type === 'text');
        if (!textBlock?.text) throw new Error('Custom endpoint returned no content');
        return textBlock.text;
      }

      if (format === 'ollama') {
        const headers = { 'Content-Type': 'application/json' };
        if (ollamaApiKey) headers['Authorization'] = `Bearer ${ollamaApiKey}`;

        const res = await fetchWithTimeout(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            stream: false,
            // Native Ollama caps generation via options.num_predict — give
            // reasoning models room to finish thinking + emit the answer.
            options: { num_predict: maxTokens },
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Custom endpoint (Ollama) ${res.status}: ${body}`);
        }
        const data = await res.json();
        const content = data.message?.content;
        if (!content) throw new Error('Custom endpoint returned no content');
        return content;
      }

      // OpenAI-compatible (default)
      const headers = { 'Content-Type': 'application/json' };
      if (ollamaApiKey) headers['Authorization'] = `Bearer ${ollamaApiKey}`;

      const res = await fetchWithTimeout(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          stream: false,
          // Headroom so reasoning models don't get cut off mid-<think>.
          max_tokens: maxTokens,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Custom endpoint (OpenAI) ${res.status}: ${body}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Custom endpoint returned no content');
      return content;
    }

    if (provider === 'openai') {
      const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: model || DEFAULT_OPENAI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          stream: false,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`OpenAI ${res.status}: ${body}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('OpenAI returned no content');
      return content;
    }

    // Anthropic — subscription path uses claude-agent-sdk (reads Claude Code creds).
    if (provider === 'anthropic' && authMethod === 'subscription') {
      // Lazy ESM import — main.js is CJS and the agent SDK is ESM-only.
      const { query } = await import('@anthropic-ai/claude-agent-sdk');
      const iter = query({
        prompt: userMessage,
        options: {
          model: model || DEFAULT_ANTHROPIC_MODEL,
          systemPrompt,
          settingSources: [],
          permissionMode: 'bypassPermissions',
          allowedTools: [],
          maxTurns: 1,
        },
      });

      let collected = '';
      let resultText = '';
      for await (const message of iter) {
        if (message.type === 'assistant') {
          for (const block of message.message?.content || []) {
            if (block.type === 'text' && block.text) collected += block.text;
          }
        } else if (message.type === 'result') {
          if (message.subtype === 'success' && typeof message.result === 'string') {
            resultText = message.result;
          } else if (message.subtype !== 'success') {
            throw new Error(`Claude subscription error: ${message.subtype}`);
          }
        }
      }
      const text = resultText || collected;
      if (!text) throw new Error('Claude subscription returned no text');
      return text;
    }

    // Anthropic — API-key path (default).
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || DEFAULT_ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Anthropic ${res.status}: ${body}`);
    }
    const data = await res.json();
    console.log('[callProvider] stop_reason:', data.stop_reason, 'usage:', JSON.stringify(data.usage));
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock?.text) throw new Error('Anthropic returned no text content');
    return textBlock.text;
  }

  /** Resolve credentials for a given slot, including its per-slot endpoint. */
  function getSlotCredentials(slot) {
    const provider = store.get(`${slot}.provider`, 'anthropic');
    const creds = {
      provider,
      authMethod:   store.get(`${slot}.authMethod`, 'apiKey'),
      model:        store.get(`${slot}.model`, DEFAULT_ANTHROPIC_MODEL),
      apiKey:       readEncryptedKey('apiKey', 'apiKeyEncrypted'),
      openaiApiKey: readEncryptedKey('openaiApiKey', 'openaiApiKeyEncrypted'),
    };

    if (provider === 'ollama') {
      const endpointId = store.get(`${slot}.endpointId`, '');
      const endpoints  = store.get('endpoints', []);
      const ep = endpoints.find((e) => e.id === endpointId) || endpoints[0] || {};
      creds.endpointId     = ep.id || '';
      creds.ollamaUrl      = ep.url || 'http://localhost:11434';
      creds.endpointFormat = ep.format || 'openai';
      creds.ollamaApiKey   = readEndpointKey(ep.id);
    }

    return creds;
  }

  /** A stable identity for a model config, so the fallback chain can dedupe. */
  function credsKey(c) {
    return `${c.provider}|${c.authMethod}|${c.endpointId || ''}|${c.model}`;
  }

  /** A short human label for which model produced something. */
  function credsLabel(c) {
    return c.model || c.provider;
  }

  /**
   * Build the ordered fallback list for a slot: the slot's own model first, then
   * the other configured slots' models (deduped). When the primary times out or
   * fails, the next *distinct* configured model is tried.
   */
  function fallbackCandidates(primarySlot) {
    const order = [primarySlot, ...['generateComplex', 'generateSimple', 'classify'].filter((s) => s !== primarySlot)];
    const seen = new Set();
    const candidates = [];
    for (const slot of order) {
      const creds = getSlotCredentials(slot);
      const key = credsKey(creds);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ slot, creds });
    }
    return candidates;
  }

  /**
   * Call the primary slot's model, falling back through the other configured
   * models on timeout/error. Returns the text plus which model actually produced
   * it and whether a fallback was used.
   */
  async function callWithFallback(primarySlot, systemPrompt, userMessage, maxTokens) {
    const candidates = fallbackCandidates(primarySlot);
    let lastErr;
    for (let i = 0; i < candidates.length; i++) {
      const { slot, creds } = candidates[i];
      try {
        const text = await callProvider(creds, systemPrompt, userMessage, maxTokens);
        return { text, creds, usedFallback: i > 0 };
      } catch (err) {
        lastErr = err;
        console.error(`[fallback] ${slot} (${credsLabel(creds)}) failed: ${err.message}`);
      }
    }
    throw lastErr || new Error('All configured models failed');
  }

  // ── IPC Handlers ───────────────────────────────────────────────────────────

  // Generate a structured prompt — classify-then-generate two-call flow
  ipcMain.handle('generate-prompt', async (_event, { task, tier: explicitTier, mode }) => {
    try {
      const isMedia = mode === 'image' || mode === 'video';
      let tier = isMedia ? mode : explicitTier;
      let classifyCreds = null;

      // Step 1: Classify (text mode only; media modes skip classify entirely)
      if (!tier) {
        try {
          const { text: classifyText, creds: usedClassify } =
            await callWithFallback('classify', CLASSIFY_PROMPT, `Classify this task: ${task}`, 50);
          classifyCreds = usedClassify;
          const classifyJson = JSON.parse(extractJSON(classifyText));
          if (['simple', 'standard', 'complex'].includes(classifyJson.tier)) {
            tier = classifyJson.tier;
          } else {
            tier = 'standard';
          }
        } catch (err) {
          console.error('[classify] all models failed, defaulting to standard:', err.message);
          tier = 'standard';
        }
      }

      // Step 2: Generate with the matching template, falling back through the
      // other configured models if the chosen one times out or errors.
      const genSlot = (tier === 'complex') ? 'generateComplex' : 'generateSimple';
      const systemPrompt = TEMPLATE_MAP[tier];

      const { text: textContent, creds: genCreds, usedFallback: generateFellBack } =
        await callWithFallback(genSlot, systemPrompt, `Generate a perfect AI prompt for this task: ${task}`);

      // Parse JSON from model response, repairing common LLM JSON mistakes inside
      // string values: raw control characters and unescaped quote characters.
      function parseModelJSON(text) {
        const raw = extractJSON(text);

        const chars = [];
        let inString = false;
        let escaped = false;

        function nextSignificantChar(source, index) {
          for (let i = index + 1; i < source.length; i++) {
            const ch = source[i];
            if (!/\s/.test(ch)) return ch;
          }
          return '';
        }

        for (let i = 0; i < raw.length; i++) {
          const ch = raw[i];
          if (escaped) { chars.push(ch); escaped = false; continue; }
          if (ch === '\\' && inString) { chars.push(ch); escaped = true; continue; }
          if (ch === '"') {
            if (!inString) {
              inString = true;
              chars.push(ch);
              continue;
            }

            const next = nextSignificantChar(raw, i);
            const isStringTerminator = next === ',' || next === '}' || next === ']' || next === ':';
            if (isStringTerminator) {
              inString = false;
              chars.push(ch);
            } else {
              chars.push('\\"');
            }
            continue;
          }
          if (inString && ch === '\n') { chars.push('\\n'); continue; }
          if (inString && ch === '\r') { continue; }
          if (inString && ch === '\t') { chars.push('\\t'); continue; }
          chars.push(ch);
        }
        const result = chars.join('');
        try {
          return JSON.parse(result);
        } catch {
          // Model likely stopped mid-string. Attempt to repair by closing
          // any open string value and unclosed braces/brackets.
          let repaired = result;
          // If we're inside a string (odd number of unescaped quotes), close it
          let quoteCount = 0;
          let esc = false;
          for (const c of repaired) {
            if (esc) { esc = false; continue; }
            if (c === '\\') { esc = true; continue; }
            if (c === '"') quoteCount++;
          }
          if (quoteCount % 2 !== 0) repaired += '"';
          // Close any open braces/brackets
          let depth = 0;
          esc = false;
          let inStr = false;
          for (const c of repaired) {
            if (esc) { esc = false; continue; }
            if (c === '\\') { esc = true; continue; }
            if (c === '"') { inStr = !inStr; continue; }
            if (inStr) continue;
            if (c === '{' || c === '[') depth++;
            if (c === '}' || c === ']') depth--;
          }
          for (let d = 0; d < depth; d++) repaired += '}';
          return JSON.parse(repaired);
        }
      }

      const parsed = parseModelJSON(textContent);

      // Build the assembled prompt from individual fields if the model didn't
      // already produce one. Image/video templates ask the model to populate
      // `assembled` itself; text templates do not.
      if (!parsed.assembled || !String(parsed.assembled).trim()) {
        if (tier === 'image') {
          parsed.assembled = assembleSectionsCJS(parsed, IMAGE_SECTIONS_CJS);
        } else if (tier === 'video') {
          parsed.assembled = assembleSectionsCJS(parsed, VIDEO_SECTIONS_CJS);
        } else {
          const textSectionMap = [
            ['role',          '## Role'],
            ['instructions',  '## Instructions'],
            ['context',       '## Context'],
            ['constraints',   '## Constraints'],
            ['outputFormat',  '## Output Format'],
            ['examples',      '## Examples'],
            ['selfCheck',     '## Self-Check'],
          ];
          parsed.assembled = textSectionMap
            .filter(([key]) => parsed[key]?.trim())
            .map(([key, header]) => `${header}\n\n${parsed[key].trim()}`)
            .join('\n\n');
        }
      }

      return {
        success: true,
        data: parsed,
        tier,
        classifyProvider: classifyCreds?.provider || null,
        classifyModel: classifyCreds?.model || null,
        generateProvider: genCreds.provider,
        generateModel: genCreds.model,
        generateFellBack: !!generateFellBack,
      };
    } catch (err) {
      console.error('[generate-prompt] error:', err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // Test Bench: run the generated prompt against a sample input on the user's
  // own model, then grade the output with an LLM-as-judge call.
  ipcMain.handle('run-test-bench', async (_event, { assembled, sampleInput, tier }) => {
    try {
      if (!assembled || !assembled.trim()) {
        return { success: false, error: 'No prompt to test.' };
      }

      // 1. Run the prompt on the tier-matched generate slot, with fallback.
      const genSlot = (tier === 'complex') ? 'generateComplex' : 'generateSimple';
      const userMessage = (sampleInput && sampleInput.trim())
        ? sampleInput.trim()
        : 'Perform the task exactly as the system prompt instructs.';
      const { text: output, creds: genCreds, usedFallback: runFellBack } =
        await callWithFallback(genSlot, assembled, userMessage);

      // 2. Grade the output with the cheaper classify slot.
      const judgeCreds = getSlotCredentials('classify');
      const judgeMessage =
        `PROMPT:\n${assembled}\n\nSAMPLE INPUT:\n${userMessage}\n\nOUTPUT:\n${output}`;
      let judgement = { score: null, critique: '', strengths: [], weaknesses: [] };
      try {
        const judgeText = await callProvider(judgeCreds, TEST_BENCH_RUBRIC, judgeMessage, 1024);
        judgement = parseJudgement(judgeText);
      } catch (judgeErr) {
        console.error('[run-test-bench] judge failed:', judgeErr.message);
        judgement.critique = 'Judge call failed; output shown without a score.';
      }

      return {
        success: true,
        output,
        judgement,
        runProvider: genCreds.provider,
        runModel: genCreds.model,
        runFellBack,
      };
    } catch (err) {
      console.error('[run-test-bench] error:', err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // Fetch available models from a custom endpoint. The listing route depends on
  // the wire format: native Ollama lists at /api/tags; OpenAI- and Anthropic-
  // compatible endpoints list at /v1/models ({ data: [{ id }] }).
  ipcMain.handle('fetch-ollama-models', async (_event, { url, apiKey, format, endpointId }) => {
    try {
      const baseUrl = (url || 'http://localhost:11434').replace(/\/+$/, '');
      const fmt = format || 'openai';
      // Fall back to the stored key for this endpoint when the user hasn't typed
      // a new one this session (the key field is blank for already-saved keys).
      if (!apiKey && endpointId) apiKey = readEndpointKey(endpointId);

      if (fmt === 'ollama') {
        const headers = {};
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        const res = await fetch(`${baseUrl}/api/tags`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const models = (data.models || []).map((m) => m.name).filter(Boolean).sort();
        return { success: true, models };
      }

      const headers = {};
      if (fmt === 'anthropic') {
        headers['anthropic-version'] = '2023-06-01';
        if (apiKey) headers['x-api-key'] = apiKey;
      } else if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      const res = await fetch(`${baseUrl}/v1/models`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models = (data.data || []).map((m) => m.id).filter(Boolean).sort();
      return { success: true, models };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // Fetch available models from Anthropic API
  ipcMain.handle('fetch-anthropic-models', async () => {
    try {
      const apiKey = readEncryptedKey('apiKey', 'apiKeyEncrypted');
      if (!apiKey) return { success: true, models: [] };

      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models = (data.data || [])
        .map((m) => m.id)
        .filter(Boolean)
        .sort();
      return { success: true, models };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // Fetch available models from OpenAI API
  ipcMain.handle('fetch-openai-models', async () => {
    try {
      const apiKey = readEncryptedKey('openaiApiKey', 'openaiApiKeyEncrypted');
      if (!apiKey) return { success: true, models: [] };

      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models = (data.data || [])
        .map((m) => m.id)
        .filter((id) => id && /^(gpt-|o\d|chatgpt-)/i.test(id))
        .sort();
      return { success: true, models };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // Persist API key — encrypted via OS-native DPAPI (Windows) / Keychain (macOS).
  // The stored value in config.json is an opaque base64 blob, never the raw key.
  ipcMain.handle('save-api-key', (_event, key) => {
    writeEncryptedKey('apiKey', 'apiKeyEncrypted', key);
    return true;
  });

  ipcMain.handle('get-api-key', () => {
    return readEncryptedKey('apiKey', 'apiKeyEncrypted');
  });

  ipcMain.handle('save-openai-api-key', (_event, key) => {
    writeEncryptedKey('openaiApiKey', 'openaiApiKeyEncrypted', key);
    return true;
  });

  ipcMain.handle('get-openai-api-key', () => {
    return readEncryptedKey('openaiApiKey', 'openaiApiKeyEncrypted');
  });

  // Detect Claude Code CLI for the subscription auth path.
  ipcMain.handle('check-claude-cli-status', async () => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      const cmd = process.platform === 'win32' ? 'claude --version' : 'claude --version';
      exec(cmd, { timeout: 3000, windowsHide: true }, (err, stdout) => {
        if (err) {
          resolve({ installed: false });
          return;
        }
        const version = String(stdout || '').trim().split('\n')[0] || '';
        resolve({ installed: true, version });
      });
    });
  });

  // Write text to the system clipboard
  ipcMain.handle('copy-to-clipboard', (_event, text) => {
    clipboard.writeText(text);
    return true;
  });

  // ── Slot config ─────────────────────────────────────────────────────────────

  ipcMain.handle('get-slot-config', () => {
    function readSlot(slot) {
      return {
        provider:   store.get(`${slot}.provider`, 'anthropic'),
        authMethod: store.get(`${slot}.authMethod`, 'apiKey'),
        model:      store.get(`${slot}.model`, DEFAULT_ANTHROPIC_MODEL),
        endpointId: store.get(`${slot}.endpointId`, ''),
      };
    }
    return {
      classify:        readSlot('classify'),
      generateSimple:  readSlot('generateSimple'),
      generateComplex: readSlot('generateComplex'),
    };
  });

  ipcMain.handle('save-slot-config', (_event, config) => {
    for (const slot of ['classify', 'generateSimple', 'generateComplex']) {
      if (config[slot]) {
        store.set(`${slot}.provider`, config[slot].provider);
        store.set(`${slot}.authMethod`, config[slot].authMethod || 'apiKey');
        store.set(`${slot}.model`, config[slot].model);
        store.set(`${slot}.endpointId`, config[slot].endpointId || '');
      }
    }
    return true;
  });

  // ── Named endpoints ─────────────────────────────────────────────────────────
  // Each endpoint is { id, name, url, format }. Keys are stored separately
  // (DPAPI-encrypted) and never returned to the renderer — only a hasKey flag.

  ipcMain.handle('get-endpoints', () => {
    const endpoints = store.get('endpoints', []);
    return endpoints.map((e) => ({ ...e, hasKey: !!readEndpointKey(e.id) }));
  });

  // Persist endpoint metadata. `keyUpdates` is an optional { [id]: key } map of
  // keys the user typed this session; '' clears a key, undefined leaves it. Keys
  // for endpoints no longer in the list are pruned.
  ipcMain.handle('save-endpoints', (_event, { endpoints, keyUpdates }) => {
    const list = (endpoints || []).map((e) => ({
      id: e.id, name: e.name || '', url: e.url || '', format: e.format || 'openai',
    }));
    store.set('endpoints', list);

    if (keyUpdates && typeof keyUpdates === 'object') {
      for (const [id, key] of Object.entries(keyUpdates)) {
        if (key !== undefined) writeEndpointKey(id, key);
      }
    }

    // Prune keys for removed endpoints.
    const liveIds = new Set(list.map((e) => e.id));
    const keys = store.get('endpointKeys', {});
    const enc  = store.get('endpointKeysEnc', {});
    let pruned = false;
    for (const id of Object.keys(keys)) {
      if (!liveIds.has(id)) { delete keys[id]; delete enc[id]; pruned = true; }
    }
    if (pruned) { store.set('endpointKeys', keys); store.set('endpointKeysEnc', enc); }

    return true;
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

  // Window chrome controls. The X button respects the "close to tray" setting:
  // tray-mode hides; otherwise it quits (real-app default). Minimize is a real
  // OS minimize to the taskbar.
  ipcMain.handle('close-window', () => {
    if (store.get('closeToTray', false)) {
      win.hide();
    } else {
      isQuitting = true;
      win.close();
    }
  });
  ipcMain.handle('minimize-window', () => win.minimize());

  ipcMain.handle('get-close-to-tray', () => store.get('closeToTray', false));
  ipcMain.handle('save-close-to-tray', (_event, value) => {
    store.set('closeToTray', !!value);
    return true;
  });

  // Renderer requests a window resize. Accepts either a number (height only,
  // backwards compatible — width stays at 480) or an object {width, height}.
  // The window grows/shrinks upward (bottom edge fixed) and is clamped to the
  // work area, so tall views (e.g. settings) stay fully on-screen wherever the
  // user has moved the window.
  ipcMain.handle('resize-window', (_event, arg) => {
    const width  = (typeof arg === 'object' && arg && typeof arg.width  === 'number') ? arg.width  : 480;
    let   height = (typeof arg === 'object' && arg && typeof arg.height === 'number') ? arg.height : arg;
    const wa = screen.getPrimaryDisplay().workArea;
    height = Math.min(height, wa.height);
    const b = win.getBounds();
    let y = b.y + b.height - height;            // keep the bottom edge fixed
    y = Math.max(wa.y, Math.min(y, wa.y + wa.height - height));
    let x = Math.max(wa.x, Math.min(b.x, wa.x + wa.width - width));
    win.setBounds({ x, y, width, height });
  });

  // ── Mode + aspect-ratio persistence ────────────────────────────────────────
  ipcMain.handle('get-last-mode', () => store.get('lastMode', 'text'));
  ipcMain.handle('save-last-mode', (_event, mode) => {
    if (['text', 'image', 'video'].includes(mode)) store.set('lastMode', mode);
    return true;
  });

  ipcMain.handle('get-last-aspect-ratio', (_event, mode) => {
    if (mode === 'image') return store.get('lastAspectRatio.image', '1:1');
    if (mode === 'video') return store.get('lastAspectRatio.video', '16:9');
    return '';
  });
  ipcMain.handle('save-last-aspect-ratio', (_event, { mode, ratio }) => {
    if (mode === 'image' || mode === 'video') {
      store.set(`lastAspectRatio.${mode}`, ratio);
    }
    return true;
  });

  // ── Theme ──────────────────────────────────────────────────────────────────
  ipcMain.handle('get-theme', () => store.get('theme', 'dark'));

  ipcMain.handle('save-theme', (_event, theme) => {
    store.set('theme', theme);
    return true;
  });

  // ── Auto-update controls ───────────────────────────────────────────────────
  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.handle('updates-check', async () => {
    if (isDev) return { ok: false, dev: true };
    try { await autoUpdater.checkForUpdates(); return { ok: true }; }
    catch (err) { return { ok: false, error: err.message || String(err) }; }
  });

  ipcMain.handle('updates-download', async () => {
    try { await autoUpdater.downloadUpdate(); return { ok: true }; }
    catch (err) { return { ok: false, error: err.message || String(err) }; }
  });

  ipcMain.handle('updates-install', () => {
    isQuitting = true;            // let the close handler through so the installer can run
    autoUpdater.quitAndInstall();
  });
});

// When the window is actually closed (close-to-tray off), quit the app. In
// tray mode the window hides rather than closes, so this never fires then.
app.on('window-all-closed', () => {
  app.quit();
});

// Release the global summon shortcut on quit.
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
