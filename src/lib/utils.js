/**
 * utils.js — pure utility functions shared between the renderer and tests.
 *
 * NOTE: electron/main.js keeps its own inline copy (CommonJS process).
 * Keep the two in sync if you change the logic here.
 */

/**
 * Extract a JSON object string from a Claude API response.
 *
 * Handles three real-world cases:
 *   1. Raw JSON string
 *   2. JSON wrapped in ```json … ``` or ``` … ``` markdown fences
 *   3. JSON embedded somewhere inside prose text
 *
 * @param {string | null | undefined} text
 * @returns {string} The extracted JSON string, or '' for falsy input
 */
export function extractJSON(text) {
  if (text == null) return '';

  // Case 2 — strip markdown fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  // Case 3 / Case 1 — find outermost { … }
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }

  return text.trim();
}

/**
 * Parse model-emitted JSON that may contain raw control characters or
 * unescaped quotes inside string values. If the model stopped mid-output
 * (truncated response), the open string and any unclosed braces/brackets
 * are repaired before a second parse attempt.
 *
 * Mirrors the inline implementation in electron/main.js (CommonJS process).
 * Keep the two in sync if you change the logic here.
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

  const result = chars.join('');
  try {
    return JSON.parse(result);
  } catch {
    // Model likely stopped mid-string. Repair by closing any open string
    // value and unclosed braces/brackets, then parse again.
    let repaired = result;

    // If we're inside a string (odd number of unescaped quotes), close it.
    let quoteCount = 0;
    let esc = false;
    for (const c of repaired) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') quoteCount++;
    }
    if (quoteCount % 2 !== 0) repaired += '"';

    // Close any open braces/brackets (ignoring those inside strings).
    let depth = 0;
    esc = false;
    let inStr = false;
    for (const c of repaired) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{' || c === '[') depth++;
      if (c === '}' || c === ']') depth--;
    }
    for (let d = 0; d < depth; d++) repaired += '}';

    return JSON.parse(repaired);
  }
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
