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
 * Generate a structured AI prompt.
 * @param {string} task   Plain-language task description
 * @param {string} [tier] Optional tier override — text mode only
 * @param {'text'|'image'|'video'} [mode] Output mode — defaults to text in main process
 * @returns {Promise<{ success: boolean, data: object, tier: string, classifyProvider?: string, classifyModel?: string, generateProvider: string, generateModel: string }>}
 */
export async function generatePrompt(task, tier, mode) {
  const result = await getIPC().generatePrompt({ task, tier, mode });
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

// ── Shared OpenAI key ───────────────────────────────────────────────────────

export async function saveOpenaiApiKey(key) {
  return getIPC().saveOpenaiApiKey(key);
}

export async function getOpenaiApiKey() {
  return getIPC().getOpenaiApiKey();
}

export async function fetchOpenaiModels() {
  return getIPC().fetchOpenaiModels();
}

// ── Claude Code CLI (for subscription auth) ─────────────────────────────────

export async function checkClaudeCliStatus() {
  return getIPC().checkClaudeCliStatus();
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

export async function fetchAnthropicModels() {
  return getIPC().fetchAnthropicModels();
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

// ── Theme ───────────────────────────────────────────────────────────────────

export async function getTheme() {
  return getIPC().getTheme();
}

export async function saveTheme(theme) {
  return getIPC().saveTheme(theme);
}

// ── Window controls ─────────────────────────────────────────────────────────

export async function closeWindow() {
  return getIPC().closeWindow();
}

export async function minimizeWindow() {
  return getIPC().minimizeWindow();
}

/**
 * Resize the popup window.
 * @param {number | {width?: number, height?: number}} arg
 *   A number sets height only (width stays 480); an object sets both.
 */
export async function resizeWindow(arg) {
  return getIPC().resizeWindow(arg);
}

// ── Mode + aspect-ratio persistence ─────────────────────────────────────────

export async function getLastMode() {
  return getIPC().getLastMode();
}

export async function saveLastMode(mode) {
  return getIPC().saveLastMode(mode);
}

export async function getLastAspectRatio(mode) {
  return getIPC().getLastAspectRatio(mode);
}

export async function saveLastAspectRatio(mode, ratio) {
  return getIPC().saveLastAspectRatio(mode, ratio);
}
