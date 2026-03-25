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
 *
 * @param {string} task    Plain-language description of the AI task
 * @param {string} apiKey  Anthropic API key
 * @returns {Promise<{
 *   role: string,
 *   instructions: string,
 *   context: string,
 *   outputFormat: string,
 *   reasoning: string,
 *   examples: string,
 *   reinforcement: string,
 *   assembled: string,
 * }>}
 */
export async function generatePrompt(task, apiKey, model, provider = 'anthropic', ollamaUrl = '', ollamaApiKey = '') {
  const result = await getIPC().generatePrompt({ task, apiKey, model, provider, ollamaUrl, ollamaApiKey });
  if (!result.success) {
    throw new Error(result.error || 'Unknown error from main process');
  }
  return result.data;
}

/**
 * Persist the Anthropic API key to local storage (electron-store).
 * @param {string} key
 */
export async function saveApiKey(key) {
  return getIPC().saveApiKey(key);
}

/**
 * Retrieve the persisted API key.
 * @returns {Promise<string>} Stored key or empty string
 */
export async function getApiKey() {
  return getIPC().getApiKey();
}

/**
 * Write text to the system clipboard.
 * @param {string} text
 */
export async function copyToClipboard(text) {
  return getIPC().copyToClipboard(text);
}

/** @param {string} model */
export async function saveModel(model) {
  return getIPC().saveModel(model);
}

/** @returns {Promise<string>} */
export async function getModel() {
  return getIPC().getModel();
}

export async function saveProvider(provider) { return getIPC().saveProvider(provider); }
export async function getProvider()           { return getIPC().getProvider(); }

export async function saveOllamaUrl(url)      { return getIPC().saveOllamaUrl(url); }
export async function getOllamaUrl()          { return getIPC().getOllamaUrl(); }

export async function saveOllamaApiKey(key)   { return getIPC().saveOllamaApiKey(key); }
export async function getOllamaApiKey()       { return getIPC().getOllamaApiKey(); }

export async function saveOllamaModel(model)  { return getIPC().saveOllamaModel(model); }
export async function getOllamaModel()        { return getIPC().getOllamaModel(); }

/** @param {string} url @param {string} apiKey */
export async function fetchOllamaModels(url, apiKey) {
  return getIPC().fetchOllamaModels(url, apiKey);
}

export async function closeWindow() {
  return getIPC().closeWindow();
}

export async function minimizeWindow() {
  return getIPC().minimizeWindow();
}

/** @param {number} height */
export async function resizeWindow(height) {
  return getIPC().resizeWindow(height);
}
