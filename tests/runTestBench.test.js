import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as promptService from '../src/lib/promptService.js';

// Mirror the IPC-bridge mock pattern in promptService.test.js, scoped to the
// runTestBench boundary (innovation #1).

const mockIPC = { runTestBench: vi.fn() };

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: mockIPC, writable: true, configurable: true,
  });
  vi.clearAllMocks();
});

describe('promptService.runTestBench', () => {
  it('passes assembled/sample/tier through to IPC and returns the result', async () => {
    const MOCK = {
      success: true,
      output: 'a haiku here',
      judgement: { score: 9, critique: 'Great.', strengths: ['format'], weaknesses: [] },
      runModel: 'claude-haiku-4-5-20251001',
    };
    mockIPC.runTestBench.mockResolvedValue(MOCK);

    const res = await promptService.runTestBench('## Role\nPoet', 'autumn', 'simple');

    expect(mockIPC.runTestBench).toHaveBeenCalledWith({
      assembled: '## Role\nPoet', sampleInput: 'autumn', tier: 'simple',
    });
    expect(res.judgement.score).toBe(9);
    expect(res.output).toBe('a haiku here');
  });

  it('throws with the main-process error message on failure', async () => {
    mockIPC.runTestBench.mockResolvedValue({ success: false, error: 'No prompt to test.' });
    await expect(promptService.runTestBench('', '', 'simple')).rejects.toThrow('No prompt to test.');
  });

  it('throws a default message when no error field is present', async () => {
    mockIPC.runTestBench.mockResolvedValue({ success: false });
    await expect(promptService.runTestBench('x', '', 'standard')).rejects.toThrow(/test bench/i);
  });
});
