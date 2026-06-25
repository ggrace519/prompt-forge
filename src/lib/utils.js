/**
 * utils.js — pure utility functions shared between the renderer and tests.
 *
 * NOTE: electron/main.js keeps its own inline copy (CommonJS process).
 * Keep the two in sync if you change the logic here.
 */

/**
 * Strip a reasoning model's chain of thought. Models like DeepSeek-R1 and
 * Qwen3 / QwQ wrap their thinking in <think>…</think> and put the real answer
 * after it; that thinking often contains braces and JSON examples that would
 * wreck brace-based extraction. Drop everything up to and including the final
 * </think>, then remove any remaining complete blocks.
 *
 * @param {string | null | undefined} text
 * @returns {string}
 */
export function stripReasoning(text) {
  if (!text) return text || '';
  let out = text;
  const close = out.toLowerCase().lastIndexOf('</think>');
  if (close !== -1) out = out.slice(close + '</think>'.length);
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '');
  return out;
}

/**
 * Extract a JSON object string from a model response.
 *
 * Handles four real-world cases:
 *   1. Raw JSON string
 *   2. JSON wrapped in ```json … ``` or ``` … ``` markdown fences
 *   3. JSON embedded somewhere inside prose text
 *   4. JSON preceded by a reasoning model's <think>…</think> block
 *
 * @param {string | null | undefined} text
 * @returns {string} The extracted JSON string, or '' for falsy input
 */
export function extractJSON(text) {
  if (text == null) return '';

  // Case 4 — drop reasoning-model thinking first
  text = stripReasoning(text).trim();

  // Case 2 — if the WHOLE response is wrapped in a markdown fence, strip the
  // wrapper lines. Only a fence at the very start counts: never match a fence
  // embedded in the content (e.g. a ```ts code block inside a JSON string
  // value), which previously hijacked extraction and yielded "ts\n// src/…".
  if (text.startsWith('```')) {
    text = text.replace(/^```[^\n]*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }

  // Case 3 / Case 1 — take the outermost { … }. Robust even when string values
  // contain code with braces or backtick fences, since those sit between the
  // first { and the last }.
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }

  return text.trim();
}

/**
 * Parse model-emitted JSON that may contain raw control characters or
 * unescaped quotes inside string values.
 *
 * @param {string | null | undefined} text
 * @returns {any}
 */
export function parseModelJSON(text) {
  const raw = extractJSON(text);
  const chars = [];
  let inString = false;
  let escaped = false;

  const nextSignificantChar = (source, index) => {
    for (let i = index + 1; i < source.length; i++) {
      const ch = source[i];
      if (!/\s/.test(ch)) return ch;
    }
    return '';
  };

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (escaped) {
      chars.push(ch);
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      chars.push(ch);
      escaped = true;
      continue;
    }

    if (ch === '"') {
      if (!inString) {
        inString = true;
        chars.push(ch);
        continue;
      }

      const next = nextSignificantChar(raw, i);
      const isStringTerminator = next === ',' || next === '}' || next === ']' || next === ':';
      if (isStringTerminator) {
        inString = false;
        chars.push(ch);
      } else {
        chars.push('\\"');
      }
      continue;
    }

    if (inString && ch === '\n') {
      chars.push('\\n');
      continue;
    }

    if (inString && ch === '\r') {
      continue;
    }

    if (inString && ch === '\t') {
      chars.push('\\t');
      continue;
    }

    chars.push(ch);
  }

  return JSON.parse(chars.join(''));
}

// Section maps for image and video modes — used to build the assembled paragraph
// when the model returns fields without one, and to drive the breakdown UI.
export const IMAGE_SECTIONS = [
  { key: 'subject',        label: 'Subject',         header: '## Subject' },
  { key: 'style',          label: 'Style',           header: '## Style' },
  { key: 'composition',    label: 'Composition',     header: '## Composition' },
  { key: 'lighting',       label: 'Lighting',        header: '## Lighting' },
  { key: 'mood',           label: 'Mood',            header: '## Mood' },
  { key: 'technical',      label: 'Technical',       header: '## Technical' },
  { key: 'negativePrompt', label: 'Negative Prompt', header: '## Negative Prompt' },
];

export const VIDEO_SECTIONS = [
  { key: 'subject',        label: 'Subject',         header: '## Subject' },
  { key: 'action',         label: 'Action',          header: '## Action' },
  { key: 'cameraMotion',   label: 'Camera Motion',   header: '## Camera Motion' },
  { key: 'style',          label: 'Style',           header: '## Style' },
  { key: 'lighting',       label: 'Lighting',        header: '## Lighting' },
  { key: 'mood',           label: 'Mood',            header: '## Mood' },
  { key: 'pacing',         label: 'Pacing',          header: '## Pacing' },
  { key: 'negativePrompt', label: 'Negative Prompt', header: '## Negative Prompt' },
];

/**
 * Build a markdown-headed assembled paragraph from section values.
 *
 * @param {Record<string, string>} result  — object of field values keyed by section key
 * @param {Array<{key: string, header: string}>} sections  — ordered section map (IMAGE_SECTIONS or VIDEO_SECTIONS)
 * @returns {string}
 */
export function assembleSections(result, sections) {
  if (!result) return '';
  return sections
    .filter(({ key }) => typeof result[key] === 'string' && result[key].trim())
    .map(({ key, header }) => `${header}\n\n${result[key].trim()}`)
    .join('\n\n');
}

/**
 * Append a tool-agnostic --ar aspect-ratio suffix to an assembled image/video prompt.
 * Works as readable text for Gemini/Grok and as a parameter hint for SDXL/Midjourney-style tooling.
 *
 * @param {string | null | undefined} assembled  — the assembled prompt text
 * @param {string | null | undefined} aspectRatio — e.g. '16:9', '1:1'
 * @returns {string}
 */
export function appendAspectRatio(assembled, aspectRatio) {
  if (!assembled) return '';
  if (!aspectRatio) return assembled;
  if (assembled.includes(`--ar ${aspectRatio}`)) return assembled;
  return `${assembled}\n--ar ${aspectRatio}`;
}
