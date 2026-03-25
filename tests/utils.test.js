import { describe, it, expect } from 'vitest';
import { extractJSON } from '../src/lib/utils.js';

// ── Happy paths ───────────────────────────────────────────────────────────────

describe('extractJSON — raw JSON', () => {
  it('returns a bare JSON string unchanged', () => {
    const raw = '{"role":"assistant"}';
    expect(extractJSON(raw)).toBe(raw);
  });

  it('handles multi-field JSON', () => {
    const obj = { role: 'r', instructions: 'i', assembled: 'a' };
    const parsed = JSON.parse(extractJSON(JSON.stringify(obj)));
    expect(parsed.instructions).toBe('i');
    expect(parsed.assembled).toBe('a');
  });

  it('handles deeply nested values', () => {
    const obj = { outer: { inner: 'value' } };
    const parsed = JSON.parse(extractJSON(JSON.stringify(obj)));
    expect(parsed.outer.inner).toBe('value');
  });
});

describe('extractJSON — markdown fences', () => {
  it('strips ```json … ``` fences', () => {
    const raw = '```json\n{"role":"fenced"}\n```';
    expect(JSON.parse(extractJSON(raw)).role).toBe('fenced');
  });

  it('strips plain ``` … ``` fences', () => {
    const raw = '```\n{"a":1}\n```';
    expect(JSON.parse(extractJSON(raw)).a).toBe(1);
  });

  it('handles leading/trailing whitespace inside fences', () => {
    const raw = '```json\n\n  {"b":2}  \n\n```';
    expect(JSON.parse(extractJSON(raw)).b).toBe(2);
  });
});

describe('extractJSON — JSON embedded in prose', () => {
  it('extracts JSON from surrounding text', () => {
    const raw = 'Here is the result: {"role":"inline"} — that is all.';
    expect(JSON.parse(extractJSON(raw)).role).toBe('inline');
  });

  it('uses the outermost braces when there is extra text on both sides', () => {
    const raw = 'Prefix {"key":"val"} suffix';
    expect(JSON.parse(extractJSON(raw)).key).toBe('val');
  });

  it('handles newlines and indentation in the embedded object', () => {
    const raw = 'Output:\n{\n  "role": "r",\n  "assembled": "a"\n}\nDone.';
    const parsed = JSON.parse(extractJSON(raw));
    expect(parsed.role).toBe('r');
  });
});

// ── Edge / error cases ────────────────────────────────────────────────────────

describe('extractJSON — edge cases', () => {
  it('returns "" for null', () => {
    expect(extractJSON(null)).toBe('');
  });

  it('returns "" for undefined', () => {
    expect(extractJSON(undefined)).toBe('');
  });

  it('returns trimmed text when no JSON object is found', () => {
    expect(extractJSON('  no braces here  ')).toBe('no braces here');
  });

  it('returns "" for an empty string', () => {
    expect(extractJSON('')).toBe('');
  });

  it('does not confuse a lone { with valid JSON', () => {
    // extractJSON does string extraction only — parsing is the caller's job.
    // A string with { but no } should return '' (start found, end not found correctly).
    const result = extractJSON('text { no close');
    // start=5, end=5 (same), end > start is false → falls through to trim
    expect(result).toBe('text { no close');
  });
});
