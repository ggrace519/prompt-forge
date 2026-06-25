'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Apply saved theme class before first paint to prevent flash
try {
  const savedTheme = ipcRenderer.sendSync('get-theme-sync');
  if (savedTheme === 'light') {
    document.documentElement.classList.add('light');
  }
} catch {
  // Handler not yet registered — fall through to dark (the default)
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Prompt generation (two-call flow)
  generatePrompt: (config) =>
    ipcRenderer.invoke('generate-prompt', config),

  // API key (shared Anthropic key)
  saveApiKey: (key) =>
    ipcRenderer.invoke('save-api-key', key),
  getApiKey: () =>
    ipcRenderer.invoke('get-api-key'),

  // Shared OpenAI key
  saveOpenaiApiKey: (key) =>
    ipcRenderer.invoke('save-openai-api-key', key),
  getOpenaiApiKey: () =>
    ipcRenderer.invoke('get-openai-api-key'),
  fetchOpenaiModels: () =>
    ipcRenderer.invoke('fetch-openai-models'),

  // Claude Code CLI status (for subscription auth)
  checkClaudeCliStatus: () =>
    ipcRenderer.invoke('check-claude-cli-status'),

  // Clipboard
  copyToClipboard: (text) =>
    ipcRenderer.invoke('copy-to-clipboard', text),

  // Slot config (classify, generateSimple, generateComplex)
  getSlotConfig: () =>
    ipcRenderer.invoke('get-slot-config'),
  saveSlotConfig: (config) =>
    ipcRenderer.invoke('save-slot-config', config),

  // Named custom endpoints
  getEndpoints: () =>
    ipcRenderer.invoke('get-endpoints'),
  saveEndpoints: (endpoints, keyUpdates) =>
    ipcRenderer.invoke('save-endpoints', { endpoints, keyUpdates }),
  fetchOllamaModels: (url, apiKey, format, endpointId) =>
    ipcRenderer.invoke('fetch-ollama-models', { url, apiKey, format, endpointId }),
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
  resizeWindow: (arg) =>
    ipcRenderer.invoke('resize-window', arg),

  // Close-to-tray preference
  getCloseToTray: () =>
    ipcRenderer.invoke('get-close-to-tray'),
  saveCloseToTray: (value) =>
    ipcRenderer.invoke('save-close-to-tray', value),

  // Mode + aspect-ratio persistence
  getLastMode: () =>
    ipcRenderer.invoke('get-last-mode'),
  saveLastMode: (mode) =>
    ipcRenderer.invoke('save-last-mode', mode),
  getLastAspectRatio: (mode) =>
    ipcRenderer.invoke('get-last-aspect-ratio', mode),
  saveLastAspectRatio: (mode, ratio) =>
    ipcRenderer.invoke('save-last-aspect-ratio', { mode, ratio }),

  // Theme
  getTheme: () =>
    ipcRenderer.invoke('get-theme'),
  saveTheme: (theme) =>
    ipcRenderer.invoke('save-theme', theme),
});
