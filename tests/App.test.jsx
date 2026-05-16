import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.jsx';

// ── Mock the entire service layer ─────────────────────────────────────────────
// App never touches window.electronAPI directly — all calls go through
// promptService, so mocking that module is sufficient.

vi.mock('../src/lib/promptService.js', () => ({
  getApiKey:           vi.fn(),
  saveApiKey:          vi.fn(),
  getOpenaiApiKey:     vi.fn(),
  saveOpenaiApiKey:    vi.fn(),
  fetchOpenaiModels:   vi.fn(),
  checkClaudeCliStatus: vi.fn(),
  generatePrompt:      vi.fn(),
  copyToClipboard:     vi.fn(),
  closeWindow:         vi.fn(),
  minimizeWindow:      vi.fn(),
  resizeWindow:        vi.fn(),
  getSlotConfig:       vi.fn(),
  saveSlotConfig:      vi.fn(),
  getOllamaUrl:        vi.fn(),
  saveOllamaUrl:       vi.fn(),
  getOllamaApiKey:     vi.fn(),
  saveOllamaApiKey:    vi.fn(),
  fetchOllamaModels:   vi.fn(),
  fetchAnthropicModels: vi.fn(),
  getSendTargets:      vi.fn(),
  saveSendTargets:     vi.fn(),
  openExternalUrl:     vi.fn(),
  getHistory:          vi.fn(),
  saveHistoryEntry:    vi.fn(),
  clearHistory:        vi.fn(),
  getTheme:            vi.fn(),
  saveTheme:           vi.fn(),
  getLastMode:         vi.fn(),
  saveLastMode:        vi.fn(),
  getLastAspectRatio:  vi.fn(),
  saveLastAspectRatio: vi.fn(),
}));

import * as promptService from '../src/lib/promptService.js';

const DEFAULT_MODEL    = 'claude-haiku-4-5-20251001';
const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

/** Set sensible defaults for every getter so tests don't need to repeat them. */
function setupDefaultMocks() {
  promptService.getApiKey.mockResolvedValue('');
  promptService.getOpenaiApiKey.mockResolvedValue('');
  promptService.fetchOpenaiModels.mockResolvedValue({ success: true, models: ['gpt-4o-mini'] });
  promptService.checkClaudeCliStatus.mockResolvedValue({ installed: false });
  promptService.getSlotConfig.mockResolvedValue({
    classify:        { provider: 'anthropic', authMethod: 'apiKey', model: 'claude-haiku-4-5-20251001' },
    generateSimple:  { provider: 'anthropic', authMethod: 'apiKey', model: 'claude-haiku-4-5-20251001' },
    generateComplex: { provider: 'anthropic', authMethod: 'apiKey', model: 'claude-haiku-4-5-20251001' },
    ollamaUrl: 'http://localhost:11434',
  });
  promptService.getOllamaUrl.mockResolvedValue('http://localhost:11434');
  promptService.getOllamaApiKey.mockResolvedValue('');
  promptService.fetchOllamaModels.mockResolvedValue({ success: true, models: [] });
  promptService.fetchAnthropicModels.mockResolvedValue({ success: true, models: ['claude-sonnet-4-5-20250514'] });
  promptService.getSendTargets.mockResolvedValue([
    { name: 'Claude', url: 'https://claude.ai/new' },
    { name: 'ChatGPT', url: 'https://chatgpt.com' },
    { name: 'Gemini', url: 'https://gemini.google.com/app' },
  ]);
  promptService.getHistory.mockResolvedValue([]);
  promptService.getTheme.mockResolvedValue('dark');
  promptService.saveTheme.mockResolvedValue(true);
  promptService.getLastMode.mockResolvedValue('text');
  promptService.saveLastMode.mockResolvedValue(true);
  promptService.getLastAspectRatio.mockResolvedValue('1:1');
  promptService.saveLastAspectRatio.mockResolvedValue(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
  document.documentElement.classList.remove('light');
});


// ── Initial routing ───────────────────────────────────────────────────────────

describe('App — initial routing', () => {
  it('shows Settings view when no API key is stored', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('sk-ant-api03-...')).toBeInTheDocument();
    });
  });

  it('shows Main view when an API key is stored', async () => {
    promptService.getApiKey.mockResolvedValue('sk-ant-real-key');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Describe your task/)).toBeInTheDocument();
    });
  });

  it('shows Settings when getApiKey rejects', async () => {
    promptService.getApiKey.mockRejectedValue(new Error('store error'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('sk-ant-api03-...')).toBeInTheDocument();
    });
  });
});

// ── Settings → Main transition ────────────────────────────────────────────────

describe('App — Settings view', () => {
  beforeEach(() => {
    promptService.getApiKey.mockResolvedValue('');
    promptService.saveApiKey.mockResolvedValue(true);
    promptService.saveOllamaUrl.mockResolvedValue(true);
    promptService.saveOllamaApiKey.mockResolvedValue(true);
    promptService.saveSlotConfig.mockResolvedValue(true);
    promptService.saveSendTargets.mockResolvedValue(true);
  });

  it('Save button is disabled while the input is empty', async () => {
    render(<App />);

    await waitFor(() => screen.getByPlaceholderText('sk-ant-api03-...'));

    expect(screen.getByRole('button', { name: /Save & Continue/i })).toBeDisabled();
  });

  it('Save button enables once a key is typed', async () => {
    render(<App />);

    await waitFor(() => screen.getByPlaceholderText('sk-ant-api03-...'));

    fireEvent.change(screen.getByPlaceholderText('sk-ant-api03-...'), {
      target: { value: 'sk-ant-test' },
    });

    expect(screen.getByRole('button', { name: /Save & Continue/i })).not.toBeDisabled();
  });

  it('does not show a back button when no key exists (first-time setup)', async () => {
    render(<App />);

    await waitFor(() => screen.getByPlaceholderText('sk-ant-api03-...'));

    expect(screen.queryByRole('button', { name: /Back/i })).not.toBeInTheDocument();
  });

  it('navigates to Main view after saving', async () => {
    render(<App />);

    await waitFor(() => screen.getByPlaceholderText('sk-ant-api03-...'));

    fireEvent.change(screen.getByPlaceholderText('sk-ant-api03-...'), {
      target: { value: 'sk-ant-test-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Describe your task/)).toBeInTheDocument();
    });

    expect(promptService.saveApiKey).toHaveBeenCalledWith('sk-ant-test-key');
  });
});

// ── Main view ─────────────────────────────────────────────────────────────────

describe('App — Main view', () => {
  beforeEach(() => {
    promptService.getApiKey.mockResolvedValue('sk-ant-stored');
    promptService.saveHistoryEntry.mockResolvedValue(true);
  });

  it('Generate button is disabled when textarea is empty', async () => {
    render(<App />);

    await waitFor(() => screen.getByPlaceholderText(/Describe your task/));

    expect(screen.getByRole('button', { name: /Generate Prompt/i })).toBeDisabled();
  });

  it('calls generatePrompt with the task on submit', async () => {
    const MOCK_RESULT = {
      success: true,
      data: {
        role: 'Writer', instructions: 'Write clearly', context: 'Blog',
        outputFormat: 'Markdown', reasoning: '1. Think', examples: 'Q→A',
        reinforcement: 'Be concise', assembled: '## Role\nWriter',
      },
      tier: 'simple',
      generateProvider: 'anthropic',
      generateModel: DEFAULT_MODEL,
    };
    promptService.generatePrompt.mockResolvedValue(MOCK_RESULT);

    render(<App />);

    await waitFor(() => screen.getByPlaceholderText(/Describe your task/));

    fireEvent.change(screen.getByPlaceholderText(/Describe your task/), {
      target: { value: 'Write a blog post about AI' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Generate Prompt/i }));

    await waitFor(() => {
      expect(promptService.generatePrompt).toHaveBeenCalledWith(
        'Write a blog post about AI',
        undefined,
        undefined,
      );
    });
  });

  it('shows the assembled prompt after a successful generation', async () => {
    promptService.generatePrompt.mockResolvedValue({
      success: true,
      data: {
        role: 'r', instructions: 'i', context: 'c',
        outputFormat: 'f', reasoning: 'rs', examples: 'ex',
        reinforcement: 're', assembled: 'THE FULL PROMPT TEXT',
      },
      tier: 'simple',
      generateProvider: 'anthropic',
      generateModel: DEFAULT_MODEL,
    });

    render(<App />);
    await waitFor(() => screen.getByPlaceholderText(/Describe your task/));

    fireEvent.change(screen.getByPlaceholderText(/Describe your task/), {
      target: { value: 'some task' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Generate Prompt/i }));

    await waitFor(() => {
      expect(screen.getByText('THE FULL PROMPT TEXT')).toBeInTheDocument();
    });
  });

  it('shows an error banner when generation fails', async () => {
    promptService.generatePrompt.mockRejectedValue(new Error('401 Unauthorized'));

    render(<App />);
    await waitFor(() => screen.getByPlaceholderText(/Describe your task/));

    fireEvent.change(screen.getByPlaceholderText(/Describe your task/), {
      target: { value: 'some task' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Generate Prompt/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('401 Unauthorized');
    });
  });

  it('gear icon navigates back to Settings', async () => {
    render(<App />);
    await waitFor(() => screen.getByPlaceholderText(/Describe your task/));

    fireEvent.click(screen.getByTitle('Settings'));

    await waitFor(() => {
      // With an existing key, the placeholder shows "(saved)" instead of the key hint
      expect(screen.getByPlaceholderText(/saved/)).toBeInTheDocument();
    });
  });

  it('back button appears in Settings when navigating from Main', async () => {
    render(<App />);
    await waitFor(() => screen.getByPlaceholderText(/Describe your task/));

    fireEvent.click(screen.getByTitle('Settings'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
    });
  });

  it('back button returns to Main view without saving', async () => {
    render(<App />);
    await waitFor(() => screen.getByPlaceholderText(/Describe your task/));

    fireEvent.click(screen.getByTitle('Settings'));
    await waitFor(() => screen.getByRole('button', { name: /Back/i }));

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Describe your task/)).toBeInTheDocument();
    });
    expect(promptService.saveApiKey).not.toHaveBeenCalled();
  });
});

// ── Theme toggle ─────────────────────────────────────────────────────────────

describe('App — theme toggle', () => {
  it('renders a theme toggle button in main view', async () => {
    promptService.getApiKey.mockResolvedValue('sk-ant-real-key');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTitle('Switch to light mode')).toBeInTheDocument();
    });
  });

  it('toggles theme class on html element when clicked', async () => {
    promptService.getApiKey.mockResolvedValue('sk-ant-real-key');

    render(<App />);

    const toggle = await waitFor(() => screen.getByTitle('Switch to light mode'));
    fireEvent.click(toggle);

    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(promptService.saveTheme).toHaveBeenCalledWith('light');
  });

  it('toggles back to dark when clicked again', async () => {
    promptService.getApiKey.mockResolvedValue('sk-ant-real-key');

    render(<App />);

    const toggle = await waitFor(() => screen.getByTitle('Switch to light mode'));
    fireEvent.click(toggle);

    // Now should show "Switch to dark mode"
    const darkToggle = screen.getByTitle('Switch to dark mode');
    fireEvent.click(darkToggle);

    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(promptService.saveTheme).toHaveBeenCalledWith('dark');
  });
});

// ── ModeToggle ────────────────────────────────────────────────────────────────

import { ModeToggle } from '../src/App.jsx';

describe('ModeToggle', () => {
  it('renders three options and highlights the current mode', () => {
    const { getByRole } = render(
      <ModeToggle mode="image" onChange={() => {}} />
    );
    const text  = getByRole('button', { name: /text/i });
    const image = getByRole('button', { name: /image/i });
    const video = getByRole('button', { name: /video/i });

    expect(text).toBeInTheDocument();
    expect(image).toHaveAttribute('aria-pressed', 'true');
    expect(video).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the picked mode', async () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <ModeToggle mode="text" onChange={onChange} />
    );
    await userEvent.click(getByRole('button', { name: /image/i }));
    expect(onChange).toHaveBeenCalledWith('image');
  });
});
