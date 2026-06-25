/**
 * testBench.js — pure logic for the Prompt Test Bench (innovation #1, see INNOVATIONS.md).
 *
 * The Test Bench closes PromptForge's loop: after generating a prompt, the user
 * runs it against a sample input on their own configured model, sees the real
 * output, and gets an LLM-as-judge score (0-10) + critique against a fixed rubric.
 *
 * This module holds the provider-agnostic parts the RENDERER needs (parsing the
 * judge's response into a structured verdict, colour/label mapping). The main
 * process keeps an inline CJS copy of RUBRIC + parseJudgement — see electron/main.js,
 * the same convention used for extractJSON. Keep the two in sync.
 */

import { extractJSON } from './utils.js';

// The judge rubric. The model grades OUTPUT against PROMPT's intent and returns
// strict JSON. Mirrors promptfoo's `llm-rubric` and OpenAI's `score_model` grader,
// scaled to a single sample. Keep in sync with electron/main.js.
export const RUBRIC = `You are a strict prompt-evaluation judge. You are given a PROMPT (an engineered AI prompt) and the OUTPUT a model produced when that prompt was run against a sample task.

Score how well the OUTPUT fulfils the PROMPT's intent, on a 0-10 integer scale:
- 9-10: excellent — follows every instruction, correct format, no drift
- 6-8:  good — minor issues or omissions
- 3-5:  weak — ignores constraints or wrong format
- 0-2:  failing — off-task or unusable

Respond with ONLY raw, valid JSON — no markdown fences, no prose:

{"score": <integer 0-10>, "critique": "<one or two sentences on the single most important issue>", "strengths": ["<short>", "..."], "weaknesses": ["<short>", "..."]}`;

/** Clamp/round any value into an integer 0-10, or null if not numeric. */
export function clampScore(n) {
  const num = typeof n === 'number' ? n : parseFloat(n);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(10, Math.round(num)));
}

/**
 * Parse the judge model's response into a structured verdict. Tolerant of
 * markdown fences and prose around the JSON (reuses extractJSON). Falls back to
 * scraping the first "score: N" if JSON parsing fails entirely.
 *
 * @param {string} text
 * @returns {{score:number|null, critique:string, strengths:string[], weaknesses:string[]}}
 */
export function parseJudgement(text) {
  const fallback = { score: null, critique: '', strengths: [], weaknesses: [] };
  if (typeof text !== 'string' || !text.trim()) return fallback;

  const asArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);

  try {
    const obj = JSON.parse(extractJSON(text));
    return {
      score: clampScore(obj.score),
      critique: typeof obj.critique === 'string' ? obj.critique.trim() : '',
      strengths: asArray(obj.strengths),
      weaknesses: asArray(obj.weaknesses),
    };
  } catch {
    // Last-ditch: scrape a "score: N" / "N/10" out of prose.
    const m = text.match(/\bscore\b\D{0,8}(\d{1,2})|(\d{1,2})\s*\/\s*10/i);
    const raw = m ? (m[1] ?? m[2]) : null;
    return { ...fallback, score: clampScore(raw), critique: text.trim().slice(0, 200) };
  }
}

/** Map a 0-10 score to a tier colour key (reuses TIER_COLORS in the UI). */
export function scoreColor(score) {
  if (score == null) return 'standard';
  if (score >= 8) return 'simple';   // green
  if (score >= 5) return 'standard'; // amber
  return 'complex';                  // weak
}

/** Human label for a 0-10 score. */
export function scoreLabel(score) {
  if (score == null) return 'Unscored';
  if (score >= 8) return 'Strong';
  if (score >= 5) return 'Decent';
  return 'Weak';
}
