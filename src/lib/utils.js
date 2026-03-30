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
