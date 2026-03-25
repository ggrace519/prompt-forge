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
