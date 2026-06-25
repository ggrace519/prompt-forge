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

/**
 * Run a generated prompt against a sample input and grade it (Test Bench).
 * @returns {Promise<{success:boolean, output?:string, judgement?:object, runProvider?:string, runModel?:string, error?:string}>}
 */
export async function runTestBench(assembled, sampleInput, tier) {
  const result = await getIPC().runTestBench({ assembled, sampleInput, tier });
  if (!result.success) {
    throw new Error(result.error || 'Test bench run failed');
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

// ── Named custom endpoints ──────────────────────────────────────────────────

/** @returns {Promise<Array<{id,name,url,format,hasKey}>>} */
export async function getEndpoints() {
  return getIPC().getEndpoints();
}

/**
 * Persist endpoint metadata + any typed key updates.
 * @param {Array<{id,name,url,format}>} endpoints
 * @param {Object<string,string>} [keyUpdates]  id → new key ('' clears it)
 */
export async function saveEndpoints(endpoints, keyUpdates) {
  return getIPC().saveEndpoints(endpoints, keyUpdates);
}

export async function fetchOllamaModels(url, apiKey, format, endpointId) {
  return getIPC().fetchOllamaModels(url, apiKey, format, endpointId);
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

export async function resizeWindow(height) {
  return getIPC().resizeWindow(height);
}

// ── Close-to-tray preference ────────────────────────────────────────────────

export async function getCloseToTray() {
  return getIPC().getCloseToTray();
}

export async function saveCloseToTray(value) {
  return getIPC().saveCloseToTray(value);
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
