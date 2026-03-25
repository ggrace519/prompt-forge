'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Exposes a minimal, typed IPC bridge to the renderer via window.electronAPI.
 * No direct Node/Electron APIs are exposed — all access is through named channels.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Ask the main process to call the Anthropic API and return structured JSON.
   * @param {string} task      Plain-language description of the desired AI task
   * @param {string} apiKey    Anthropic API key
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  generatePrompt: (config) =>
    ipcRenderer.invoke('generate-prompt', config),

  /**
   * Persist the API key via electron-store.
   * @param {string} key
   * @returns {Promise<true>}
   */
  saveApiKey: (key) =>
    ipcRenderer.invoke('save-api-key', key),

  /**
   * Retrieve the persisted API key.
   * @returns {Promise<string>} Stored key, or empty string
   */
  getApiKey: () =>
    ipcRenderer.invoke('get-api-key'),

  /**
   * Write arbitrary text to the system clipboard.
   * @param {string} text
   * @returns {Promise<true>}
   */
  copyToClipboard: (text) =>
    ipcRenderer.invoke('copy-to-clipboard', text),

  saveModel: (model) =>
    ipcRenderer.invoke('save-model', model),

  getModel: () =>
    ipcRenderer.invoke('get-model'),

  saveProvider: (provider) =>
    ipcRenderer.invoke('save-provider', provider),

  getProvider: () =>
    ipcRenderer.invoke('get-provider'),

  saveOllamaUrl: (url) =>
    ipcRenderer.invoke('save-ollama-url', url),

  getOllamaUrl: () =>
    ipcRenderer.invoke('get-ollama-url'),

  saveOllamaApiKey: (key) =>
    ipcRenderer.invoke('save-ollama-api-key', key),

  getOllamaApiKey: () =>
    ipcRenderer.invoke('get-ollama-api-key'),

  saveOllamaModel: (model) =>
    ipcRenderer.invoke('save-ollama-model', model),

  getOllamaModel: () =>
    ipcRenderer.invoke('get-ollama-model'),

  fetchOllamaModels: (url, apiKey) =>
    ipcRenderer.invoke('fetch-ollama-models', { url, apiKey }),

  closeWindow: () =>
    ipcRenderer.invoke('close-window'),

  minimizeWindow: () =>
    ipcRenderer.invoke('minimize-window'),

  resizeWindow: (height) =>
    ipcRenderer.invoke('resize-window', height),
});
