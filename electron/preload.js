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
  fetchAnthropicModels: () =>
    ipcRenderer.invoke('fetch-anthropic-models'),

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
