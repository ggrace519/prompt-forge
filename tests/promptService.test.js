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

// ── Theme ────────────────────────────────────────────────────────────────────

describe('getTheme', () => {
  it('returns stored theme from IPC', async () => {
    mockIPC.getTheme = vi.fn().mockResolvedValue('light');
    const result = await promptService.getTheme();
    expect(result).toBe('light');
  });
});

describe('saveTheme', () => {
  it('calls saveTheme on IPC bridge', async () => {
    mockIPC.saveTheme = vi.fn().mockResolvedValue(true);
    const result = await promptService.saveTheme('dark');
    expect(mockIPC.saveTheme).toHaveBeenCalledWith('dark');
    expect(result).toBe(true);
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

// ── generatePrompt with mode ──────────────────────────────────────────────────

describe('generatePrompt with mode', () => {
  it('passes mode in the IPC payload when provided', async () => {
    mockIPC.generatePrompt.mockResolvedValue({
      success: true,
      data: { subject: 'A red fox', assembled: 'A red fox in a meadow' },
      tier: 'image',
      generateProvider: 'anthropic',
      generateModel: 'claude-haiku-4-5-20251001',
    });

    await promptService.generatePrompt('a fox', undefined, 'image');

    expect(mockIPC.generatePrompt).toHaveBeenCalledWith({
      task: 'a fox',
      tier: undefined,
      mode: 'image',
    });
  });

  it('omits mode when not provided (text mode default)', async () => {
    mockIPC.generatePrompt.mockResolvedValue({
      success: true,
      data: { role: 'Assistant' },
      tier: 'simple',
      generateProvider: 'anthropic',
      generateModel: 'claude-haiku-4-5-20251001',
    });

    await promptService.generatePrompt('write a haiku');

    expect(mockIPC.generatePrompt).toHaveBeenCalledWith({
      task: 'write a haiku',
      tier: undefined,
      mode: undefined,
    });
  });
});

// ── Mode + aspect-ratio persistence ──────────────────────────────────────────

describe('mode and aspect-ratio persistence', () => {
  beforeEach(() => {
    mockIPC.getLastMode = vi.fn();
    mockIPC.saveLastMode = vi.fn();
    mockIPC.getLastAspectRatio = vi.fn();
    mockIPC.saveLastAspectRatio = vi.fn();
  });

  it('forwards getLastMode and saveLastMode', async () => {
    mockIPC.getLastMode.mockResolvedValue('image');
    expect(await promptService.getLastMode()).toBe('image');

    await promptService.saveLastMode('video');
    expect(mockIPC.saveLastMode).toHaveBeenCalledWith('video');
  });

  it('forwards getLastAspectRatio and saveLastAspectRatio per mode', async () => {
    mockIPC.getLastAspectRatio.mockResolvedValue('16:9');
    expect(await promptService.getLastAspectRatio('image')).toBe('16:9');
    expect(mockIPC.getLastAspectRatio).toHaveBeenCalledWith('image');

    await promptService.saveLastAspectRatio('video', '9:16');
    expect(mockIPC.saveLastAspectRatio).toHaveBeenCalledWith('video', '9:16');
  });
});

// ── resizeWindow ──────────────────────────────────────────────────────────────

describe('resizeWindow', () => {
  beforeEach(() => {
    mockIPC.resizeWindow = vi.fn();
  });

  it('forwards a numeric height (backwards compatible)', async () => {
    await promptService.resizeWindow(640);
    expect(mockIPC.resizeWindow).toHaveBeenCalledWith(640);
  });

  it('forwards a {width, height} object', async () => {
    await promptService.resizeWindow({ width: 640, height: 720 });
    expect(mockIPC.resizeWindow).toHaveBeenCalledWith({ width: 640, height: 720 });
  });
});

// ── Named endpoints ───────────────────────────────────────────────────────────

describe('named endpoints', () => {
  beforeEach(() => {
    mockIPC.fetchOllamaModels = vi.fn();
    mockIPC.getEndpoints = vi.fn();
    mockIPC.saveEndpoints = vi.fn();
  });

  it('threads url, key, format, and endpoint id through to fetchOllamaModels', async () => {
    mockIPC.fetchOllamaModels.mockResolvedValue({ success: true, models: ['llama3'] });
    await promptService.fetchOllamaModels('http://host:1234', 'key-abc', 'anthropic', 'ep-1');
    expect(mockIPC.fetchOllamaModels).toHaveBeenCalledWith('http://host:1234', 'key-abc', 'anthropic', 'ep-1');
  });

  it('reads the endpoint list', async () => {
    const eps = [{ id: 'ep-1', name: 'Home', url: 'http://h', format: 'openai', hasKey: true }];
    mockIPC.getEndpoints.mockResolvedValue(eps);
    expect(await promptService.getEndpoints()).toEqual(eps);
  });

  it('persists endpoint metadata + key updates', async () => {
    mockIPC.saveEndpoints.mockResolvedValue(true);
    const meta = [{ id: 'ep-1', name: 'Home', url: 'http://h', format: 'openai' }];
    await promptService.saveEndpoints(meta, { 'ep-1': 'sk-new' });
    expect(mockIPC.saveEndpoints).toHaveBeenCalledWith(meta, { 'ep-1': 'sk-new' });
  });
});

// ── Close-to-tray preference ──────────────────────────────────────────────────

describe('close-to-tray preference', () => {
  beforeEach(() => {
    mockIPC.getCloseToTray = vi.fn();
    mockIPC.saveCloseToTray = vi.fn();
  });

  it('reads the saved preference', async () => {
    mockIPC.getCloseToTray.mockResolvedValue(true);
    expect(await promptService.getCloseToTray()).toBe(true);
  });

  it('persists the preference', async () => {
    mockIPC.saveCloseToTray.mockResolvedValue(true);
    await promptService.saveCloseToTray(false);
    expect(mockIPC.saveCloseToTray).toHaveBeenCalledWith(false);
  });
});
