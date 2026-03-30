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
} = require('electron');
const path  = require('path');
const Store = require('electron-store');

const store = new Store();
const isDev = process.env.NODE_ENV === 'development';

let tray = null;
let win  = null;

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

// ── JSON extraction ───────────────────────────────────────────────────────────

function extractJSON(text) {
  if (text == null) return '';
  // Strip markdown code fences if Claude wraps the JSON
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

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width: 480,
    height: 320,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
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

  // Hide on focus loss instead of closing
  win.on('blur', () => {
    if (win && win.isVisible()) win.hide();
  });

  // Intercept close to prevent window destruction — only quit via tray menu
  win.on('close', (e) => {
    e.preventDefault();
    win.hide();
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
  const { x, y } = getWindowPosition();
  win.setPosition(x, y, false);
  win.show();
  win.focus();
}

function toggleWindow() {
  win.isVisible() ? win.hide() : showWindow();
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

  // Left-click: toggle popup
  tray.on('click', toggleWindow);

  // Right-click: context menu
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Open PromptForge', click: showWindow },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          win.removeAllListeners('close');
          app.quit();
        },
      },
    ]);
    tray.popUpContextMenu(menu);
  });

  // ── IPC Handlers ───────────────────────────────────────────────────────────

  // Generate a structured prompt via Anthropic or Ollama
  ipcMain.handle('generate-prompt', async (_event, { task, apiKey, model, provider = 'anthropic', ollamaUrl = '', ollamaApiKey = '' }) => {
    try {
      let textContent;

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
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `Generate a perfect AI prompt for this task: ${task}` },
            ],
            stream: false,
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Ollama ${res.status}: ${body}`);
        }
        const data = await res.json();
        textContent = data.choices?.[0]?.message?.content;
        if (!textContent) throw new Error('Ollama returned no content');
      } else {
        // Dynamic import handles both ESM and CJS builds of the SDK
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey });

        const response = await client.messages.create({
          model: model || 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Generate a perfect AI prompt for this task: ${task}` }],
        });

        // Find the text block by type — don't assume content[0] is always text
        const textBlock = response.content.find((b) => b.type === 'text');
        if (!textBlock?.text) throw new Error('Anthropic returned no text content — the model may have stopped early');
        textContent = textBlock.text;
      }

      const jsonText = extractJSON(textContent);
      const parsed   = JSON.parse(jsonText);
      return { success: true, data: parsed };
    } catch (err) {
      console.error('[generate-prompt] error:', err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // Fetch available models from an Ollama server
  ipcMain.handle('fetch-ollama-models', async (_event, { url, apiKey }) => {
    try {
      const baseUrl = (url || 'http://localhost:11434').replace(/\/+$/, '');
      const headers = {};
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(`${baseUrl}/api/tags`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models = (data.models || []).map((m) => m.name).filter(Boolean).sort();
      return { success: true, models };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // Persist API key — encrypted via OS-native DPAPI (Windows) / Keychain (macOS)
  // The stored value in config.json is an opaque base64 blob, never the raw key.
  ipcMain.handle('save-api-key', (_event, key) => {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(key);
      store.set('apiKey', encrypted.toString('base64'));
      store.set('apiKeyEncrypted', true);
    } else {
      // Encryption unavailable (rare — e.g. headless Linux with no keyring).
      // Store plaintext and flag it so get-api-key doesn't try to decrypt.
      store.set('apiKey', key);
      store.set('apiKeyEncrypted', false);
    }
    return true;
  });

  // Retrieve and decrypt the API key
  ipcMain.handle('get-api-key', () => {
    const stored      = store.get('apiKey', '');
    const isEncrypted = store.get('apiKeyEncrypted', false);
    if (!stored) return '';
    if (isEncrypted && safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(Buffer.from(stored, 'base64'));
      } catch {
        // Blob is unreadable (e.g. different OS user or corrupted); force re-entry.
        store.delete('apiKey');
        store.delete('apiKeyEncrypted');
        return '';
      }
    }
    return stored; // plaintext fallback path
  });

  // Write text to the system clipboard
  ipcMain.handle('copy-to-clipboard', (_event, text) => {
    clipboard.writeText(text);
    return true;
  });

  // Ollama configuration
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

  // Window chrome controls
  ipcMain.handle('close-window',    () => win.hide());
  ipcMain.handle('minimize-window', () => win.hide());

  // Renderer requests a height change (e.g. after results load)
  ipcMain.handle('resize-window', (_event, height) => {
    win.setSize(480, height, false);
    const { x, y } = getWindowPosition();
    win.setPosition(x, y, false);
  });
});

// Keep the process alive when the popup window is hidden
app.on('window-all-closed', (e) => {
  e.preventDefault();
});
