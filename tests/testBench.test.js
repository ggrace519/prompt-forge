import { describe, it, expect } from 'vitest';
import { parseJudgement, clampScore, scoreColor, scoreLabel, RUBRIC } from '../src/lib/testBench.js';

describe('clampScore', () => {
  it('clamps and rounds into 0..10', () => {
    expect(clampScore(7)).toBe(7);
    expect(clampScore(7.6)).toBe(8);
    expect(clampScore(-3)).toBe(0);
    expect(clampScore(99)).toBe(10);
    expect(clampScore('8')).toBe(8);
  });
  it('returns null for non-numeric', () => {
    expect(clampScore('abc')).toBeNull();
    expect(clampScore(undefined)).toBeNull();
    expect(clampScore(NaN)).toBeNull();
  });
});

describe('parseJudgement — clean JSON', () => {
  it('parses a well-formed verdict', () => {
    const v = parseJudgement('{"score": 8, "critique": "Good but verbose.", "strengths": ["clear role"], "weaknesses": ["no examples"]}');
    expect(v.score).toBe(8);
    expect(v.critique).toBe('Good but verbose.');
    expect(v.strengths).toEqual(['clear role']);
    expect(v.weaknesses).toEqual(['no examples']);
  });

  it('strips markdown fences around the JSON', () => {
    const v = parseJudgement('```json\n{"score": 9, "critique": "Excellent."}\n```');
    expect(v.score).toBe(9);
    expect(v.critique).toBe('Excellent.');
    expect(v.strengths).toEqual([]); // missing arrays default to []
  });

  it('clamps an out-of-range score from the model', () => {
    expect(parseJudgement('{"score": 15, "critique": "x"}').score).toBe(10);
    expect(parseJudgement('{"score": -2, "critique": "x"}').score).toBe(0);
  });

  it('ignores non-string entries in strengths/weaknesses', () => {
    const v = parseJudgement('{"score": 5, "strengths": ["ok", 42, ""], "weaknesses": null}');
    expect(v.strengths).toEqual(['ok']);
    expect(v.weaknesses).toEqual([]);
  });
});

describe('parseJudgement — degraded input', () => {
  it('scrapes a score out of prose when JSON parsing fails', () => {
    const v = parseJudgement('The prompt is decent. Score: 6 out of 10 overall.');
    expect(v.score).toBe(6);
    expect(v.critique).toMatch(/decent/i);
  });

  it('scrapes the N/10 form', () => {
    expect(parseJudgement('I would rate this 7/10.').score).toBe(7);
  });

  it('returns a null-score fallback for empty/garbage', () => {
    expect(parseJudgement('').score).toBeNull();
    expect(parseJudgement(null).score).toBeNull();
    expect(parseJudgement('no number here at all').score).toBeNull();
  });
});

describe('scoreColor / scoreLabel', () => {
  it('maps scores to colour tiers', () => {
    expect(scoreColor(9)).toBe('simple');
    expect(scoreColor(6)).toBe('standard');
    expect(scoreColor(3)).toBe('complex');
    expect(scoreColor(null)).toBe('standard');
  });
  it('maps scores to labels', () => {
    expect(scoreLabel(10)).toBe('Strong');
    expect(scoreLabel(5)).toBe('Decent');
    expect(scoreLabel(1)).toBe('Weak');
    expect(scoreLabel(null)).toBe('Unscored');
  });
});

describe('RUBRIC', () => {
  it('is a non-trivial instruction string asking for JSON', () => {
    expect(typeof RUBRIC).toBe('string');
    expect(RUBRIC.length).toBeGreaterThan(100);
    expect(RUBRIC).toMatch(/score/i);
    expect(RUBRIC).toMatch(/json/i);
  });
});
