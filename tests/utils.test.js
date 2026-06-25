import { describe, it, expect } from 'vitest';
import { extractJSON, parseModelJSON, stripReasoning, appendAspectRatio, assembleSections, IMAGE_SECTIONS, VIDEO_SECTIONS } from '../src/lib/utils.js';

// ── Reasoning models ───────────────────────────────────────────────────────────

describe('extractJSON — reasoning models (<think>)', () => {
  it('drops a <think> block and returns the JSON after it', () => {
    const out = '<think>Let me reason about this.</think>{"tier":"simple"}';
    expect(extractJSON(out)).toBe('{"tier":"simple"}');
    expect(JSON.parse(extractJSON(out)).tier).toBe('simple');
  });

  it('handles thinking that itself contains braces / JSON examples', () => {
    // This is the real failure: brace extraction grabbed a "{" inside the
    // thinking, yielding "{...}</think>{...}" → "non-whitespace after JSON".
    const out = '<think>I could output {"tier":"complex"} but it is simple.</think>\n{"tier":"simple"}';
    const parsed = JSON.parse(extractJSON(out));
    expect(parsed.tier).toBe('simple');
  });

  it('stripReasoning returns the answer after the final </think>', () => {
    expect(stripReasoning('<think>a</think>answer').trim()).toBe('answer');
  });

  it('leaves plain (non-thinking) output untouched', () => {
    expect(stripReasoning('{"tier":"standard"}')).toBe('{"tier":"standard"}');
  });
});

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

describe('parseModelJSON', () => {
  it('parses fenced JSON with raw newlines inside string values', () => {
    const raw = '```json\n{"instructions":"line 1\nline 2","role":"writer"}\n```';
    const parsed = parseModelJSON(raw);
    expect(parsed.instructions).toBe('line 1\nline 2');
    expect(parsed.role).toBe('writer');
  });

  it('repairs unescaped quotes inside a string value', () => {
    const raw = '{"outputFormat":"Return fields named "title" and "summary".","role":"editor"}';
    const parsed = parseModelJSON(raw);
    expect(parsed.outputFormat).toBe('Return fields named "title" and "summary".');
    expect(parsed.role).toBe('editor');
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

describe('appendAspectRatio', () => {
  it('appends --ar suffix on a new line when ratio is set', () => {
    expect(appendAspectRatio('a sunset over mountains', '16:9'))
      .toBe('a sunset over mountains\n--ar 16:9');
  });

  it('returns the assembled string unchanged when ratio is empty', () => {
    expect(appendAspectRatio('a sunset', '')).toBe('a sunset');
    expect(appendAspectRatio('a sunset', null)).toBe('a sunset');
    expect(appendAspectRatio('a sunset', undefined)).toBe('a sunset');
  });

  it('returns empty string when assembled is empty', () => {
    expect(appendAspectRatio('', '16:9')).toBe('');
    expect(appendAspectRatio(null, '16:9')).toBe('');
  });

  it('does not double-append when --ar already present', () => {
    expect(appendAspectRatio('a sunset --ar 16:9', '16:9'))
      .toBe('a sunset --ar 16:9');
  });
});

describe('assembleSections', () => {
  it('joins populated sections in order with headers', () => {
    const result = {
      subject: 'A red fox',
      style: 'Watercolor',
      lighting: 'Golden hour',
    };
    const out = assembleSections(result, IMAGE_SECTIONS);
    expect(out).toContain('## Subject\n\nA red fox');
    expect(out).toContain('## Style\n\nWatercolor');
    expect(out).toContain('## Lighting\n\nGolden hour');
    expect(out.indexOf('Subject')).toBeLessThan(out.indexOf('Style'));
  });

  it('skips empty / whitespace-only fields', () => {
    const result = { subject: 'A red fox', style: '   ', lighting: '' };
    const out = assembleSections(result, IMAGE_SECTIONS);
    expect(out).toContain('Subject');
    expect(out).not.toContain('Style');
    expect(out).not.toContain('Lighting');
  });

  it('returns empty string when nothing is populated', () => {
    expect(assembleSections({}, IMAGE_SECTIONS)).toBe('');
  });
});
