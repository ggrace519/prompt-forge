import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as promptService from '../src/lib/promptService.js';

// ── Mock IPC bridge ───────────────────────────────────────────────────────────

const mockIPC = {
  generatePrompt:  vi.fn(),
  saveApiKey:      vi.fn(),
  getApiKey:       vi.fn(),
  copyToClipboard: vi.fn(),
  saveModel:       vi.fn(),
  getModel:        vi.fn(),
};

beforeEach(() => {
  // Attach the mock bridge; reset call history before each test
  Object.defineProperty(window, 'electronAPI', {
    value:        mockIPC,
    writable:     true,
    configurable: true,
  });
  vi.clearAllMocks();
});

// ── generatePrompt ────────────────────────────────────────────────────────────

describe('generatePrompt', () => {
  const MOCK_DATA = {
    role: 'Assistant', instructions: 'Do X', context: 'Ctx',
    outputFormat: 'JSON', reasoning: '1. Think', examples: 'A→B',
    reinforcement: 'Always do X', assembled: '## Role\nAssistant',
  };

  it('resolves with the data payload on success', async () => {
    mockIPC.generatePrompt.mockResolvedValue({ success: true, data: MOCK_DATA });

    const result = await promptService.generatePrompt('write a blog post', 'sk-test', 'claude-haiku-4-5-20251001');

    expect(result).toEqual(MOCK_DATA);
    expect(mockIPC.generatePrompt).toHaveBeenCalledOnce();
    expect(mockIPC.generatePrompt).toHaveBeenCalledWith({
      task: 'write a blog post',
      apiKey: 'sk-test',
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
      ollamaUrl: '',
      ollamaApiKey: '',
    });
  });

  it('throws the error message returned by the main process', async () => {
    mockIPC.generatePrompt.mockResolvedValue({ success: false, error: 'Rate limited' });

    await expect(promptService.generatePrompt('task', 'key', 'model'))
      .rejects.toThrow('Rate limited');
  });

  it('throws a default message when error field is absent', async () => {
    mockIPC.generatePrompt.mockResolvedValue({ success: false });

    await expect(promptService.generatePrompt('task', 'key', 'model'))
      .rejects.toThrow('Unknown error from main process');
  });

  it('propagates IPC-level rejections (e.g. network down)', async () => {
    mockIPC.generatePrompt.mockRejectedValue(new Error('IPC channel closed'));

    await expect(promptService.generatePrompt('task', 'key', 'model'))
      .rejects.toThrow('IPC channel closed');
  });
});

// ── saveApiKey / getApiKey ────────────────────────────────────────────────────

describe('saveApiKey', () => {
  it('delegates to IPC saveApiKey with the provided key', async () => {
    mockIPC.saveApiKey.mockResolvedValue(true);

    await promptService.saveApiKey('sk-ant-my-key');

    expect(mockIPC.saveApiKey).toHaveBeenCalledOnce();
    expect(mockIPC.saveApiKey).toHaveBeenCalledWith('sk-ant-my-key');
  });
});

describe('getApiKey', () => {
  it('returns whatever the IPC bridge returns', async () => {
    mockIPC.getApiKey.mockResolvedValue('sk-ant-stored');

    const key = await promptService.getApiKey();

    expect(key).toBe('sk-ant-stored');
  });

  it('returns empty string when no key is stored', async () => {
    mockIPC.getApiKey.mockResolvedValue('');

    expect(await promptService.getApiKey()).toBe('');
  });
});

// ── saveModel / getModel ──────────────────────────────────────────────────────

describe('saveModel / getModel', () => {
  it('saves a model ID', async () => {
    mockIPC.saveModel.mockResolvedValue(true);

    await promptService.saveModel('claude-sonnet-4-5');

    expect(mockIPC.saveModel).toHaveBeenCalledWith('claude-sonnet-4-5');
  });

  it('retrieves the saved model ID', async () => {
    mockIPC.getModel.mockResolvedValue('claude-sonnet-4-5');

    expect(await promptService.getModel()).toBe('claude-sonnet-4-5');
  });
});

// ── copyToClipboard ───────────────────────────────────────────────────────────

describe('copyToClipboard', () => {
  it('delegates the text to the IPC bridge', async () => {
    mockIPC.copyToClipboard.mockResolvedValue(true);

    await promptService.copyToClipboard('Hello world');

    expect(mockIPC.copyToClipboard).toHaveBeenCalledWith('Hello world');
  });
});

// ── IPC bridge unavailable ────────────────────────────────────────────────────

describe('when electronAPI is not present', () => {
  beforeEach(() => {
    // Remove the bridge for these tests
    Object.defineProperty(window, 'electronAPI', {
      value:        undefined,
      writable:     true,
      configurable: true,
    });
  });

  it('getApiKey throws a descriptive error', async () => {
    await expect(promptService.getApiKey())
      .rejects.toThrow('electronAPI bridge unavailable');
  });

  it('generatePrompt throws a descriptive error', async () => {
    await expect(promptService.generatePrompt('task', 'key', 'model'))
      .rejects.toThrow('electronAPI bridge unavailable');
  });

  it('copyToClipboard throws a descriptive error', async () => {
    await expect(promptService.copyToClipboard('text'))
      .rejects.toThrow('electronAPI bridge unavailable');
  });
});
