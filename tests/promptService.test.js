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
