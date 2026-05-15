# Image and Video Prompt Modes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Text / Image / Video mode toggle to PromptForge, with a structured-fields-plus-assembled-string output for image and video prompts targeting modern multimodal tools (SDXL, Qwen-Image, Nano Banana, ComfyUI, Gemini, Grok), in a 640×720 two-column layout.

**Architecture:** A top-level mode toggle in `MainView` selects the output shape. Text mode keeps today's classify→generate flow unchanged. Image/Video mode skips classify, calls the Simple/Standard slot with a media-specific system prompt, and renders structured fields plus an `assembled` paragraph next to an aspect-ratio dropdown. Window resizes to 640×720 in media modes. Persistence: `lastMode`, `lastAspectRatio.image`, `lastAspectRatio.video`.

**Tech Stack:** Electron (CJS main process), React 18 + Vite (ESM renderer), electron-store, Vitest + @testing-library/react.

**Spec:** [`docs/superpowers/specs/2026-05-15-image-video-prompt-mode-design.md`](../specs/2026-05-15-image-video-prompt-mode-design.md)

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `src/lib/utils.js` | Modify | Add `appendAspectRatio`, `IMAGE_SECTIONS`, `VIDEO_SECTIONS`, `assembleSections` |
| `src/lib/promptService.js` | Modify | Add `mode` to `generatePrompt`; widen `resizeWindow` to `(width, height)`; add `getLastMode/saveLastMode`, `getLastAspectRatio/saveLastAspectRatio` |
| `electron/main.js` | Modify | Add `SYSTEM_PROMPT_IMAGE`, `SYSTEM_PROMPT_VIDEO`; route `mode` in `generate-prompt`; widen `resize-window` IPC; add new persistence IPC handlers; inline CJS copies of section maps |
| `electron/preload.js` | Modify | Widen `resizeWindow(width, height)`; add new IPC channels (lastMode, lastAspectRatio) |
| `src/App.jsx` | Modify | Add `ModeToggle`, `AspectRatioSelect`; mode state in `MainView`; per-mode resize; new `TIER_COLORS` entries; per-mode `SECTIONS` lookup; hide tier badge in media modes |
| `src/index.css` | Modify | Two-column grid for media-mode body; mode-toggle styling; aspect-ratio dropdown styling; tier-badge classes for `image` / `video` |
| `tests/utils.test.js` | Modify | Tests for `appendAspectRatio`, `assembleSections` |
| `tests/promptService.test.js` | Modify | Tests for `mode` param, new persistence helpers |
| `tests/App.test.jsx` | Modify | Tests for `ModeToggle`, image-mode flow rendering |

---

## Task 1: Aspect-ratio + section-assembly utilities (TDD)

**Files:**
- Modify: `src/lib/utils.js`
- Test: `tests/utils.test.js`

The image/video `assembled` paragraph comes from the LLM. The user can pick an aspect ratio from a dropdown; we append it client-side in a tool-agnostic way (`--ar 16:9` suffix on a new line — works as readable text for Gemini/Grok and as a parameter hint for SDXL/Midjourney-style tooling). We also need a generic `assembleSections` helper so the renderer can build a fallback `assembled` if a model returns fields but no `assembled`.

- [ ] **Step 1: Read current utils**

Read `src/lib/utils.js` and `tests/utils.test.js` to confirm structure.

- [ ] **Step 2: Write failing tests for `appendAspectRatio`**

Append to `tests/utils.test.js`:

```javascript
import { appendAspectRatio, assembleSections, IMAGE_SECTIONS, VIDEO_SECTIONS } from '../src/lib/utils.js';

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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/utils.test.js`
Expected: FAIL — `appendAspectRatio is not exported` / `IMAGE_SECTIONS is not exported`.

- [ ] **Step 4: Implement utilities**

Append to `src/lib/utils.js`:

```javascript
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

/** Build a markdown-headed assembled paragraph from section values. */
export function assembleSections(result, sections) {
  if (!result) return '';
  return sections
    .filter(({ key }) => typeof result[key] === 'string' && result[key].trim())
    .map(({ key, header }) => `${header}\n\n${result[key].trim()}`)
    .join('\n\n');
}

/** Append a tool-agnostic --ar aspect-ratio suffix to an assembled image/video prompt. */
export function appendAspectRatio(assembled, aspectRatio) {
  if (!assembled) return '';
  if (!aspectRatio) return assembled;
  if (assembled.includes(`--ar ${aspectRatio}`)) return assembled;
  return `${assembled}\n--ar ${aspectRatio}`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/utils.test.js`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils.js tests/utils.test.js
git commit -m "feat: add image/video section maps and aspect-ratio utility"
```

---

## Task 2: Mirror utilities into main.js (CJS)

**Files:**
- Modify: `electron/main.js:84-98`

`extractJSON` is already duplicated between ESM `src/lib/utils.js` and inline CJS `electron/main.js`. Mirror the new section maps and `assembleSections` helper into main.js so the generate handler can build the `assembled` field server-side. (No test step — main.js has no unit-test infra; verified later via the IPC tests in Task 6 and a manual smoke run in Task 12.)

- [ ] **Step 1: Add inline section maps and assembler in main.js**

In `electron/main.js`, immediately after the existing `extractJSON` function (after line 98), insert:

```javascript
// ── Image / video section maps (CJS mirror of src/lib/utils.js) ───────────────

const IMAGE_SECTIONS_CJS = [
  { key: 'subject',        header: '## Subject' },
  { key: 'style',          header: '## Style' },
  { key: 'composition',    header: '## Composition' },
  { key: 'lighting',       header: '## Lighting' },
  { key: 'mood',           header: '## Mood' },
  { key: 'technical',      header: '## Technical' },
  { key: 'negativePrompt', header: '## Negative Prompt' },
];

const VIDEO_SECTIONS_CJS = [
  { key: 'subject',        header: '## Subject' },
  { key: 'action',         header: '## Action' },
  { key: 'cameraMotion',   header: '## Camera Motion' },
  { key: 'style',          header: '## Style' },
  { key: 'lighting',       header: '## Lighting' },
  { key: 'mood',           header: '## Mood' },
  { key: 'pacing',         header: '## Pacing' },
  { key: 'negativePrompt', header: '## Negative Prompt' },
];

function assembleSectionsCJS(result, sections) {
  if (!result) return '';
  return sections
    .filter(({ key }) => typeof result[key] === 'string' && result[key].trim())
    .map(({ key, header }) => `${header}\n\n${result[key].trim()}`)
    .join('\n\n');
}
```

- [ ] **Step 2: Run existing tests to confirm no regression**

Run: `npx vitest run`
Expected: PASS — all existing + Task 1 tests still green.

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat: mirror image/video section maps into main.js (CJS)"
```

---

## Task 3: Add image and video system prompts in main.js

**Files:**
- Modify: `electron/main.js:36-82`

Add two new system prompts targeting modern multimodal tools. They must produce JSON with the exact field names defined in Task 2 (`subject`, `style`, etc., plus `assembled`).

- [ ] **Step 1: Add `SYSTEM_PROMPT_IMAGE`**

In `electron/main.js`, after `SYSTEM_PROMPT_COMPLEX` (after line 76, before `const TEMPLATE_MAP`), insert:

```javascript
const SYSTEM_PROMPT_IMAGE = `You are a world-class image-prompt engineer. Given a brief task description, you produce a vivid, descriptive prompt for modern multimodal image generators (SDXL, Qwen-Image, Nano Banana, ComfyUI, Gemini, Grok).

Use natural-language descriptive paragraphs, not comma-separated tag soup. Be concrete and sensory: name colors, materials, light direction, lens choice. Expand the user's brief — do not just rephrase it.

CRITICAL: Respond with ONLY raw, valid JSON — no markdown fences, no prose, no code blocks. Just the JSON object.

Return an object with exactly these 8 string fields (all values must be strings, not nested objects or arrays). Use empty string "" for any field that does not apply.

{
  "subject": "Concrete description of what is in the frame, expanded with sensory detail",
  "style": "Medium and aesthetic — photographic, 3D render, oil painting, anime, etc.",
  "composition": "Framing, angle, perspective, focal point",
  "lighting": "Light source, quality, direction, time of day",
  "mood": "Atmosphere and emotional tone",
  "technical": "Camera/lens for photo, render engine for 3D, model-specific quality hints",
  "negativePrompt": "Things to avoid (mainly for SDXL/ComfyUI). Use empty string if not meaningfully helpful.",
  "assembled": "A single paste-ready descriptive paragraph combining all of the above into prose suitable for any of the listed tools. No headers, no bullet points."
}`;
```

- [ ] **Step 2: Add `SYSTEM_PROMPT_VIDEO`**

Immediately after `SYSTEM_PROMPT_IMAGE`, insert:

```javascript
const SYSTEM_PROMPT_VIDEO = `You are a world-class video-prompt engineer. Given a brief task description, you produce a vivid, descriptive prompt for short-form AI video generators (Sora, Runway, Kling, Veo via Gemini, Grok video, ComfyUI workflows).

Use natural-language descriptive paragraphs, not comma-separated tag soup. Describe motion concretely — what moves, how it moves, where the camera goes. Expand the user's brief — do not just rephrase it.

CRITICAL: Respond with ONLY raw, valid JSON — no markdown fences, no prose, no code blocks. Just the JSON object.

Return an object with exactly these 9 string fields (all values must be strings, not nested objects or arrays). Use empty string "" for any field that does not apply.

{
  "subject": "Scene and characters — what we see in the frame",
  "action": "What happens; the motion itself",
  "cameraMotion": "Pan, dolly, tracking, static, handheld — describe camera movement",
  "style": "Cinematic, animated, documentary, music-video, etc.",
  "lighting": "Light setup, time of day, mood-shaping illumination",
  "mood": "Tone and atmosphere",
  "pacing": "Fast cuts, slow burn, single continuous shot — rhythm of the clip",
  "negativePrompt": "Things to avoid. Use empty string if not meaningfully helpful.",
  "assembled": "A single paste-ready descriptive paragraph combining all of the above into prose suitable for any of the listed tools. No headers, no bullet points."
}`;
```

- [ ] **Step 3: Extend `TEMPLATE_MAP`**

Modify `electron/main.js:78-82` from:

```javascript
const TEMPLATE_MAP = {
  simple:   SYSTEM_PROMPT_SIMPLE,
  standard: SYSTEM_PROMPT_STANDARD,
  complex:  SYSTEM_PROMPT_COMPLEX,
};
```

to:

```javascript
const TEMPLATE_MAP = {
  simple:   SYSTEM_PROMPT_SIMPLE,
  standard: SYSTEM_PROMPT_STANDARD,
  complex:  SYSTEM_PROMPT_COMPLEX,
  image:    SYSTEM_PROMPT_IMAGE,
  video:    SYSTEM_PROMPT_VIDEO,
};
```

- [ ] **Step 4: Commit**

```bash
git add electron/main.js
git commit -m "feat: add image and video system prompts and template map entries"
```

---

## Task 4: Route `mode` in the generate-prompt IPC handler

**Files:**
- Modify: `electron/main.js:421-565`

Accept an optional `mode` parameter. When `mode === 'image' || mode === 'video'`, skip classification, set `tier = mode`, use the Simple/Standard slot, and use the matching section map for the assembled-string fallback.

- [ ] **Step 1: Update the `generate-prompt` handler signature and classify branch**

In `electron/main.js:421`, change:

```javascript
ipcMain.handle('generate-prompt', async (_event, { task, tier: explicitTier }) => {
    try {
      let tier = explicitTier;
      let classifyCreds = null;

      // Step 1: Classify (unless tier was provided by the user)
      if (!tier) {
```

to:

```javascript
ipcMain.handle('generate-prompt', async (_event, { task, tier: explicitTier, mode }) => {
    try {
      const isMedia = mode === 'image' || mode === 'video';
      let tier = isMedia ? mode : explicitTier;
      let classifyCreds = null;

      // Step 1: Classify (text mode only; media modes skip classify entirely)
      if (!tier) {
```

- [ ] **Step 2: Replace the assembled-string builder block**

In `electron/main.js`, replace the existing `sectionMap` block (currently lines 538-550) — the block that starts with `const sectionMap = [` and ends at the `parsed.assembled = ...join('\n\n');` line — with:

```javascript
      // Build the assembled prompt from individual fields if the model didn't
      // already produce one. Image/video templates ask the model to populate
      // `assembled` itself; text templates do not.
      if (!parsed.assembled || !String(parsed.assembled).trim()) {
        if (tier === 'image') {
          parsed.assembled = assembleSectionsCJS(parsed, IMAGE_SECTIONS_CJS);
        } else if (tier === 'video') {
          parsed.assembled = assembleSectionsCJS(parsed, VIDEO_SECTIONS_CJS);
        } else {
          const textSectionMap = [
            ['role',          '## Role'],
            ['instructions',  '## Instructions'],
            ['context',       '## Context'],
            ['outputFormat',  '## Output Format'],
            ['reasoning',     '## Reasoning Steps'],
            ['examples',      '## Examples'],
            ['reinforcement', '## Remember'],
          ];
          parsed.assembled = textSectionMap
            .filter(([key]) => parsed[key]?.trim())
            .map(([key, header]) => `${header}\n\n${parsed[key].trim()}`)
            .join('\n\n');
        }
      }
```

Note: The original text flow always overwrote `assembled`. The change makes overwrite conditional so image/video can keep the model-produced paragraph. Text mode behavior is preserved because text templates do not return an `assembled` field.

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat: route mode param in generate-prompt; build image/video assembled string"
```

---

## Task 5: Widen `resize-window` IPC to accept width

**Files:**
- Modify: `electron/main.js:757-761`
- Modify: `electron/preload.js:83-84`

Currently width is hardcoded to 480. Image/video mode needs 640.

- [ ] **Step 1: Update main.js resize handler**

In `electron/main.js`, replace lines 757-761:

```javascript
  // Renderer requests a height change (e.g. after results load)
  ipcMain.handle('resize-window', (_event, height) => {
    win.setSize(480, height, false);
    const { x, y } = getWindowPosition();
    win.setPosition(x, y, false);
  });
```

with:

```javascript
  // Renderer requests a window resize. Accepts either a number (height only,
  // backwards compatible — width stays at 480) or an object {width, height}.
  ipcMain.handle('resize-window', (_event, arg) => {
    const width  = (typeof arg === 'object' && arg && typeof arg.width  === 'number') ? arg.width  : 480;
    const height = (typeof arg === 'object' && arg && typeof arg.height === 'number') ? arg.height : arg;
    win.setSize(width, height, false);
    const { x, y } = getWindowPosition();
    win.setPosition(x, y, false);
  });
```

- [ ] **Step 2: Update preload.js bridge**

In `electron/preload.js:83-84`, replace:

```javascript
  resizeWindow: (height) =>
    ipcRenderer.invoke('resize-window', height),
```

with:

```javascript
  resizeWindow: (arg) =>
    ipcRenderer.invoke('resize-window', arg),
```

- [ ] **Step 3: Commit**

```bash
git add electron/main.js electron/preload.js
git commit -m "feat: allow resize-window IPC to set width as well as height"
```

---

## Task 6: Extend promptService — `mode` param + new persistence (TDD)

**Files:**
- Modify: `src/lib/promptService.js`
- Modify: `electron/preload.js`
- Modify: `electron/main.js` (add IPC handlers for new persistence keys)
- Test: `tests/promptService.test.js`

Add `mode` to `generatePrompt`, and add helpers for `lastMode` / `lastAspectRatio`. Widen `resizeWindow` signature.

- [ ] **Step 1: Write failing tests for new promptService surface**

Append to `tests/promptService.test.js` (inside the file, after existing `describe` blocks):

```javascript
describe('generatePrompt with mode', () => {
  it('passes mode in the IPC payload when provided', async () => {
    mockIPC.generatePrompt.mockResolvedValue({
      success: true,
      data: { subject: 'A red fox', assembled: 'A red fox in a meadow' },
      tier: 'image',
      generateProvider: 'anthropic',
      generateModel: 'claude-haiku-4-5-20251001',
    });

    await promptService.generatePrompt('a fox', undefined, 'image');

    expect(mockIPC.generatePrompt).toHaveBeenCalledWith({
      task: 'a fox',
      tier: undefined,
      mode: 'image',
    });
  });

  it('omits mode when not provided (text mode default)', async () => {
    mockIPC.generatePrompt.mockResolvedValue({
      success: true,
      data: { role: 'Assistant' },
      tier: 'simple',
      generateProvider: 'anthropic',
      generateModel: 'claude-haiku-4-5-20251001',
    });

    await promptService.generatePrompt('write a haiku');

    expect(mockIPC.generatePrompt).toHaveBeenCalledWith({
      task: 'write a haiku',
      tier: undefined,
      mode: undefined,
    });
  });
});

describe('mode and aspect-ratio persistence', () => {
  beforeEach(() => {
    mockIPC.getLastMode = vi.fn();
    mockIPC.saveLastMode = vi.fn();
    mockIPC.getLastAspectRatio = vi.fn();
    mockIPC.saveLastAspectRatio = vi.fn();
  });

  it('forwards getLastMode and saveLastMode', async () => {
    mockIPC.getLastMode.mockResolvedValue('image');
    expect(await promptService.getLastMode()).toBe('image');

    await promptService.saveLastMode('video');
    expect(mockIPC.saveLastMode).toHaveBeenCalledWith('video');
  });

  it('forwards getLastAspectRatio and saveLastAspectRatio per mode', async () => {
    mockIPC.getLastAspectRatio.mockResolvedValue('16:9');
    expect(await promptService.getLastAspectRatio('image')).toBe('16:9');
    expect(mockIPC.getLastAspectRatio).toHaveBeenCalledWith('image');

    await promptService.saveLastAspectRatio('video', '9:16');
    expect(mockIPC.saveLastAspectRatio).toHaveBeenCalledWith('video', '9:16');
  });
});

describe('resizeWindow', () => {
  beforeEach(() => {
    mockIPC.resizeWindow = vi.fn();
  });

  it('forwards a numeric height (backwards compatible)', async () => {
    await promptService.resizeWindow(640);
    expect(mockIPC.resizeWindow).toHaveBeenCalledWith(640);
  });

  it('forwards a {width, height} object', async () => {
    await promptService.resizeWindow({ width: 640, height: 720 });
    expect(mockIPC.resizeWindow).toHaveBeenCalledWith({ width: 640, height: 720 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/promptService.test.js`
Expected: FAIL — `generatePrompt` ignores `mode`; `getLastMode` etc. are not exported.

- [ ] **Step 3: Update `src/lib/promptService.js`**

Replace the existing `generatePrompt` (currently lines 23-35):

```javascript
export async function generatePrompt(task, tier) {
  const result = await getIPC().generatePrompt({ task, tier });
  if (!result.success) {
    throw new Error(result.error || 'Unknown error from main process');
  }
  return result;
}
```

with:

```javascript
/**
 * Generate a structured AI prompt.
 * @param {string} task   Plain-language task description
 * @param {string} [tier] Optional tier override — text mode only
 * @param {'text'|'image'|'video'} [mode] Output mode — defaults to text in main process
 */
export async function generatePrompt(task, tier, mode) {
  const result = await getIPC().generatePrompt({ task, tier, mode });
  if (!result.success) {
    throw new Error(result.error || 'Unknown error from main process');
  }
  return result;
}
```

Append to the bottom of `src/lib/promptService.js`:

```javascript
// ── Mode + aspect-ratio persistence ─────────────────────────────────────────

export async function getLastMode() {
  return getIPC().getLastMode();
}

export async function saveLastMode(mode) {
  return getIPC().saveLastMode(mode);
}

export async function getLastAspectRatio(mode) {
  return getIPC().getLastAspectRatio(mode);
}

export async function saveLastAspectRatio(mode, ratio) {
  return getIPC().saveLastAspectRatio(mode, ratio);
}
```

- [ ] **Step 4: Add the new bridge entries to `electron/preload.js`**

In `electron/preload.js`, immediately before the closing `});` (around line 91), insert:

```javascript
  // Mode + aspect-ratio persistence
  getLastMode: () =>
    ipcRenderer.invoke('get-last-mode'),
  saveLastMode: (mode) =>
    ipcRenderer.invoke('save-last-mode', mode),
  getLastAspectRatio: (mode) =>
    ipcRenderer.invoke('get-last-aspect-ratio', mode),
  saveLastAspectRatio: (mode, ratio) =>
    ipcRenderer.invoke('save-last-aspect-ratio', { mode, ratio }),
```

- [ ] **Step 5: Add the corresponding IPC handlers in `electron/main.js`**

In `electron/main.js`, immediately before the `// ── Theme ──` block (just above the `ipcMain.handle('get-theme', ...)` line ~764), insert:

```javascript
  // ── Mode + aspect-ratio persistence ────────────────────────────────────────
  ipcMain.handle('get-last-mode', () => store.get('lastMode', 'text'));
  ipcMain.handle('save-last-mode', (_event, mode) => {
    if (['text', 'image', 'video'].includes(mode)) store.set('lastMode', mode);
    return true;
  });

  ipcMain.handle('get-last-aspect-ratio', (_event, mode) => {
    if (mode === 'image') return store.get('lastAspectRatio.image', '1:1');
    if (mode === 'video') return store.get('lastAspectRatio.video', '16:9');
    return '';
  });
  ipcMain.handle('save-last-aspect-ratio', (_event, { mode, ratio }) => {
    if (mode === 'image' || mode === 'video') {
      store.set(`lastAspectRatio.${mode}`, ratio);
    }
    return true;
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/promptService.test.js`
Expected: PASS — all promptService tests green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/promptService.js electron/preload.js electron/main.js tests/promptService.test.js
git commit -m "feat: add mode param and per-mode aspect-ratio persistence to promptService"
```

---

## Task 7: Add image/video tier colors and ModeToggle component (TDD)

**Files:**
- Modify: `src/App.jsx` — extend `TIER_COLORS`; add `ModeToggle` component
- Modify: `src/index.css` — add `tier-image`, `tier-video`, `mode-toggle` classes
- Test: `tests/App.test.jsx`

- [ ] **Step 1: Inspect existing App.test.jsx**

Read `tests/App.test.jsx` to understand the test conventions (which mocks are set up, how IPC is faked).

- [ ] **Step 2: Write failing test for ModeToggle**

Append to `tests/App.test.jsx`:

```javascript
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
```

If `userEvent` isn't already imported at the top of the test file, add:

```javascript
import userEvent from '@testing-library/user-event';
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/App.test.jsx`
Expected: FAIL — `ModeToggle is not exported from src/App.jsx`.

- [ ] **Step 4: Extend TIER_COLORS**

In `src/App.jsx`, replace the `TIER_COLORS` block (lines 52-56):

```javascript
const TIER_COLORS = {
  simple:   { bg: 'rgba(74, 222, 128, 0.12)', border: 'rgba(74, 222, 128, 0.3)', text: '#4ade80' },
  standard: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', text: '#f59e0b' },
  complex:  { bg: 'rgba(251, 191, 36, 0.12)', border: 'rgba(251, 191, 36, 0.3)', text: '#fbbf24' },
};
```

with:

```javascript
const TIER_COLORS = {
  simple:   { bg: 'rgba(74, 222, 128, 0.12)', border: 'rgba(74, 222, 128, 0.3)', text: '#4ade80' },
  standard: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', text: '#f59e0b' },
  complex:  { bg: 'rgba(251, 191, 36, 0.12)', border: 'rgba(251, 191, 36, 0.3)', text: '#fbbf24' },
  image:    { bg: 'rgba(34, 211, 238, 0.12)', border: 'rgba(34, 211, 238, 0.3)', text: '#22d3ee' },
  video:    { bg: 'rgba(167, 139, 250, 0.12)', border: 'rgba(167, 139, 250, 0.3)', text: '#a78bfa' },
};
```

- [ ] **Step 5: Add and export `ModeToggle` component**

In `src/App.jsx`, immediately above `// ── Shared components ─────` (around line 230), insert:

```javascript
// ── ModeToggle ────────────────────────────────────────────────────────────────

const MODES = [
  { key: 'text',  label: 'Text'  },
  { key: 'image', label: 'Image' },
  { key: 'video', label: 'Video' },
];

export function ModeToggle({ mode, onChange }) {
  return (
    <div className="mode-toggle" role="group" aria-label="Output mode">
      {MODES.map((m) => (
        <button
          key={m.key}
          type="button"
          className={`mode-toggle-btn${mode === m.key ? ' active' : ''}`}
          aria-pressed={mode === m.key}
          onClick={() => onChange(m.key)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Add CSS for ModeToggle and new tier badges**

Read the existing `tier-badge` block in `src/index.css` (search for `.tier-badge` to find it). Append below it:

```css
/* Image and video tier badges (used in history) */
.tier-image {
  background: rgba(34, 211, 238, 0.12);
  border-color: rgba(34, 211, 238, 0.3);
  color: #22d3ee;
}
.tier-video {
  background: rgba(167, 139, 250, 0.12);
  border-color: rgba(167, 139, 250, 0.3);
  color: #a78bfa;
}
.tier-dot.tier-image { background: #22d3ee; }
.tier-dot.tier-video { background: #a78bfa; }

/* Mode toggle (Text / Image / Video) */
.mode-toggle {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--surface-2, #1a1a1a);
  border: 1px solid var(--border, #2a2a2a);
  border-radius: 8px;
  margin-bottom: 8px;
}
.mode-toggle-btn {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-muted, #888);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.mode-toggle-btn:hover {
  color: var(--text, #e5e5e5);
}
.mode-toggle-btn.active {
  background: var(--accent, #f59e0b);
  color: #000;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/App.test.jsx`
Expected: PASS — ModeToggle tests green; existing App tests still green.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/index.css tests/App.test.jsx
git commit -m "feat: add ModeToggle component and image/video tier badge colors"
```

---

## Task 8: Wire mode state into MainView

**Files:**
- Modify: `src/App.jsx` — `MainView`

Add `mode` state, load/save it via the new persistence helpers, render the `ModeToggle` above the input, pass `mode` to `generatePrompt`, and switch the resize call.

- [ ] **Step 1: Add mode state and load it on mount**

In `src/App.jsx` `MainView`, find the existing state block (around line 808-822). Immediately after `const [task, setTask] = useState('');` (line 809), insert:

```javascript
  const [mode, setMode] = useState('text');
  const [aspectRatio, setAspectRatio] = useState('1:1');
```

In the existing `useEffect` that fetches model lists (lines 825-839), add a second `useEffect` immediately above it:

```javascript
  // Load persisted mode + aspect ratio on mount
  useEffect(() => {
    promptService.getLastMode().then((m) => {
      if (['text', 'image', 'video'].includes(m)) setMode(m);
    }).catch(() => {});
  }, []);

  // When mode changes, load the saved aspect ratio for that mode
  useEffect(() => {
    if (mode === 'text') return;
    promptService.getLastAspectRatio(mode).then((r) => {
      if (r) setAspectRatio(r);
    }).catch(() => {});
  }, [mode]);
```

- [ ] **Step 2: Replace the existing window-resize effect**

In `src/App.jsx`, replace the existing `useEffect` block at lines 847-849:

```javascript
  useEffect(() => {
    promptService.resizeWindow(result ? 640 : 320);
  }, [result]);
```

with:

```javascript
  // Window dimensions per mode + state
  useEffect(() => {
    if (mode === 'image' || mode === 'video') {
      promptService.resizeWindow({ width: 640, height: 720 });
    } else {
      promptService.resizeWindow({ width: 480, height: result ? 640 : 320 });
    }
  }, [mode, result]);
```

- [ ] **Step 3: Add a mode-change handler that persists and clears stale results**

Immediately above the existing `async function handleGenerate` definition (around line 851), insert:

```javascript
  function handleModeChange(next) {
    if (next === mode) return;
    setMode(next);
    setResult(null);
    setTier(null);
    setError('');
    promptService.saveLastMode(next).catch(() => {});
  }

  function handleAspectRatioChange(next) {
    setAspectRatio(next);
    if (mode === 'image' || mode === 'video') {
      promptService.saveLastAspectRatio(mode, next).catch(() => {});
    }
  }
```

- [ ] **Step 4: Update `handleGenerate` to pass mode**

In `src/App.jsx`, replace the line inside `handleGenerate` that calls `generatePrompt` (around line 861):

```javascript
      const response = await promptService.generatePrompt(trimmed, overrideTier || undefined);
```

with:

```javascript
      const isMedia = mode === 'image' || mode === 'video';
      const response = await promptService.generatePrompt(
        trimmed,
        isMedia ? undefined : (overrideTier || undefined),
        isMedia ? mode : undefined,
      );
```

- [ ] **Step 5: Render ModeToggle in the input group**

In `src/App.jsx`, find the `<div className="main-body">` block (around line 980). Immediately after the opening `<div className="main-body">` and before `<div className="input-group">`, insert:

```jsx
          <ModeToggle mode={mode} onChange={handleModeChange} />
```

- [ ] **Step 6: Manual smoke check**

Run: `npm run dev`
Manual checks (do these in the running app):
- Toggle appears above the textarea with Text / Image / Video buttons.
- Clicking Image resizes the window to 640×720; clicking Text snaps it back to 480×320.
- Selected mode persists across app restarts.

State exactly which checks passed in your handoff back. If any failed, stop and report.

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: PASS — no regressions.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire ModeToggle into MainView with per-mode resize and persistence"
```

---

## Task 9: AspectRatioSelect component and two-column results layout

**Files:**
- Modify: `src/App.jsx` — add `AspectRatioSelect`, render media-mode layout
- Modify: `src/index.css` — `.media-layout` two-column grid, aspect-ratio dropdown styling

- [ ] **Step 1: Add `AspectRatioSelect` component**

In `src/App.jsx`, immediately after the `ModeToggle` definition added in Task 7, insert:

```javascript
// ── AspectRatioSelect ─────────────────────────────────────────────────────────

const ASPECT_RATIOS = ['16:9', '1:1', '9:16', '4:3', '21:9'];

function AspectRatioSelect({ value, onChange }) {
  return (
    <div className="aspect-ratio-select">
      <label className="aspect-ratio-label" htmlFor="aspect-ratio">
        Aspect ratio
      </label>
      <select
        id="aspect-ratio"
        className="text-input select-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {ASPECT_RATIOS.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Update MainView render to switch layouts by mode**

In `src/App.jsx`, find the `<div className="main-body">` block. Currently it renders the `<div className="input-group">`, the error banner, and `<ResultsPanel ... />` stacked.

Replace the current `result && <ResultsPanel ... />` block (around lines 1053-1064) with:

```jsx
          {result && (mode === 'image' || mode === 'video') && (
            <ResultsPanel
              result={result}
              tier={tier}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onTierChange={(t) => handleGenerate(t)}
              sendTargets={sendTargets}
              toast={toast}
              setToast={setToast}
              mode={mode}
              aspectRatio={aspectRatio}
              onAspectRatioChange={handleAspectRatioChange}
            />
          )}

          {result && mode === 'text' && (
            <ResultsPanel
              result={result}
              tier={tier}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onTierChange={(t) => handleGenerate(t)}
              sendTargets={sendTargets}
              toast={toast}
              setToast={setToast}
              mode={mode}
              aspectRatio={aspectRatio}
              onAspectRatioChange={handleAspectRatioChange}
            />
          )}
```

(Both branches render the same component; the duplication exists only because future visual variants might diverge. If you find this redundant, you may collapse to a single render — keep `mode`, `aspectRatio`, `onAspectRatioChange` props in either case.)

- [ ] **Step 3: Add CSS for AspectRatioSelect**

Append to `src/index.css`:

```css
/* Aspect ratio dropdown */
.aspect-ratio-select {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.aspect-ratio-label {
  font-size: 11px;
  color: var(--text-muted, #888);
  white-space: nowrap;
}
.aspect-ratio-select .select-input {
  flex: 1;
  max-width: 120px;
  font-size: 12px;
  padding: 4px 8px;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: PASS — no regressions. (No new test in this task; rendering changes are exercised in Task 10.)

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/index.css
git commit -m "feat: add AspectRatioSelect and pass mode/aspect-ratio into ResultsPanel"
```

---

## Task 10: Mode-aware ResultsPanel — sections + assembled with aspect ratio

**Files:**
- Modify: `src/App.jsx` — `ResultsPanel`, `BreakdownTab`, `AssembledTab`, `TierBadgeDropdown`
- Test: `tests/App.test.jsx`

`ResultsPanel` currently uses the global `SECTIONS` constant for the breakdown and shows a tier badge that lets the user re-pick simple/standard/complex. In media modes we want:
- Different sections (`IMAGE_SECTIONS` / `VIDEO_SECTIONS` from `src/lib/utils.js`)
- Tier badge hidden (no re-pick)
- Aspect ratio dropdown shown above the assembled text
- The assembled text shown with the aspect-ratio suffix appended

- [ ] **Step 1: Import the new utilities**

At the top of `src/App.jsx`, replace the existing `utils` import or add an import line. The current imports at line 1-3 don't import from `utils.js`. Add a new import line under line 2:

```javascript
import { IMAGE_SECTIONS, VIDEO_SECTIONS, appendAspectRatio } from './lib/utils.js';
```

- [ ] **Step 2: Pick the right section list per mode**

In `src/App.jsx`, replace the `ResultsPanel` definition (currently lines 1186-1223) with:

```javascript
function ResultsPanel({
  result, tier, activeTab, onTabChange, onTierChange,
  sendTargets, toast, setToast,
  mode, aspectRatio, onAspectRatioChange,
}) {
  const isMedia = mode === 'image' || mode === 'video';
  const sections = mode === 'image' ? IMAGE_SECTIONS
                : mode === 'video' ? VIDEO_SECTIONS
                : SECTIONS;

  const displayedAssembled = isMedia
    ? appendAspectRatio(result.assembled, aspectRatio)
    : result.assembled;

  return (
    <div className="results-panel">
      <div className="tab-bar" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'assembled'}
          className={`tab-btn${activeTab === 'assembled' ? ' active' : ''}`}
          onClick={() => onTabChange('assembled')}
        >
          Assembled
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'breakdown'}
          className={`tab-btn${activeTab === 'breakdown' ? ' active' : ''}`}
          onClick={() => onTabChange('breakdown')}
        >
          Breakdown
        </button>
        {tier && !isMedia && (
          <TierBadgeDropdown tier={tier} onTierChange={onTierChange} />
        )}
      </div>

      <div className="tab-content">
        {activeTab === 'assembled' && (
          <>
            {isMedia && (
              <AspectRatioSelect value={aspectRatio} onChange={onAspectRatioChange} />
            )}
            <AssembledTab
              assembled={displayedAssembled}
              sendTargets={sendTargets}
              setToast={setToast}
            />
          </>
        )}
        {activeTab === 'breakdown' && <BreakdownTab result={result} sections={sections} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Make `BreakdownTab` accept a sections prop**

In `src/App.jsx`, replace `BreakdownTab` (currently lines 1317-1340) with:

```javascript
function BreakdownTab({ result, sections = SECTIONS }) {
  const [expanded, setExpanded] = useState({});

  function toggle(key) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const populatedSections = sections.filter(({ key }) => result[key]?.trim());

  return (
    <div className="breakdown-tab">
      {populatedSections.map(({ key, label }) => (
        <SectionCard
          key={key}
          sectionKey={key}
          label={label}
          content={result[key]}
          isExpanded={!!expanded[key]}
          onToggle={() => toggle(key)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write a test for image-mode rendering**

Append to `tests/App.test.jsx` (assumes `App` is exported as default and tests are already set up to mock IPC):

```javascript
describe('Image-mode results render with image sections + aspect ratio', () => {
  // This test exercises ResultsPanel via App. The exact mock setup depends on
  // existing tests/App.test.jsx scaffolding. If App.test.jsx mocks electronAPI
  // directly, mirror that pattern here. The minimum check is that when a
  // result with image fields lands in image mode, the breakdown shows
  // "Subject" and "Style" labels, and the assembled view appends the aspect
  // ratio suffix.
  it('renders image breakdown labels for image-mode results', () => {
    const { ResultsPanel: Panel } = require('../src/App.jsx');
    // If ResultsPanel isn't exported, expose it via a named export above
    // its definition: change `function ResultsPanel(...)` to
    // `export function ResultsPanel(...)`.

    const result = {
      subject: 'A red fox',
      style: 'Watercolor',
      assembled: 'A watercolor painting of a red fox in a snowy meadow',
    };

    const { getByText, queryByText, container } = render(
      <Panel
        result={result}
        tier="image"
        activeTab="breakdown"
        onTabChange={() => {}}
        onTierChange={() => {}}
        sendTargets={[]}
        toast=""
        setToast={() => {}}
        mode="image"
        aspectRatio="16:9"
        onAspectRatioChange={() => {}}
      />
    );

    expect(getByText('Subject')).toBeInTheDocument();
    expect(getByText('Style')).toBeInTheDocument();
    // Tier badge should be hidden in media modes
    expect(queryByText(/^Image$/)).toBeNull();
  });

  it('appends aspect ratio in assembled view', () => {
    const { ResultsPanel: Panel } = require('../src/App.jsx');
    const result = { assembled: 'A red fox in a meadow' };
    const { container } = render(
      <Panel
        result={result}
        tier="image"
        activeTab="assembled"
        onTabChange={() => {}}
        onTierChange={() => {}}
        sendTargets={[]}
        toast=""
        setToast={() => {}}
        mode="image"
        aspectRatio="16:9"
        onAspectRatioChange={() => {}}
      />
    );
    expect(container.textContent).toContain('--ar 16:9');
  });
});
```

If `ResultsPanel` isn't already a named export, add `export` in front of its `function ResultsPanel(...)` definition in `src/App.jsx`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/App.test.jsx`
Expected: PASS — both new tests + all existing tests green.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx tests/App.test.jsx
git commit -m "feat: mode-aware ResultsPanel with image/video sections and aspect-ratio suffix"
```

---

## Task 11: Two-column body layout in media modes

**Files:**
- Modify: `src/App.jsx` — wrap `.main-body` content with mode-aware className
- Modify: `src/index.css` — add `.main-body.media-mode` two-column grid

The 640×720 window has room for input + breakdown on the left and assembled output on the right. Use a CSS grid that activates only in media modes.

- [ ] **Step 1: Add a mode class to `.main-body`**

In `src/App.jsx`, change the `<div className="main-body">` (around line 980) to:

```jsx
<div className={`main-body${mode === 'image' || mode === 'video' ? ' media-mode' : ''}`}>
```

- [ ] **Step 2: Add CSS for the two-column layout**

Append to `src/index.css`:

```css
/* Two-column layout for image/video modes */
.main-body.media-mode {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: start;
}

/* In media mode, error banner spans both columns */
.main-body.media-mode .error-banner {
  grid-column: 1 / -1;
}

/* In media mode, mode-toggle spans both columns */
.main-body.media-mode > .mode-toggle {
  grid-column: 1 / -1;
}
```

- [ ] **Step 3: Manual smoke check**

Run: `npm run dev`

Manual checks:
- In Image or Video mode, the input + (after generation) breakdown sit on the left, results panel on the right.
- In Text mode, the layout is unchanged (single column).
- Toggle and error banner span the full width in media modes.

State which checks passed in your handoff. If layout looks broken (overflow, overlap, mode-toggle squished), report exactly what looks wrong before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/index.css
git commit -m "feat: two-column body layout for image and video modes"
```

---

## Task 12: End-to-end verification (no code changes — verification only)

**Files:** None modified. This task is a verification gate.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all suites green. List the count of passing tests in the handoff.

- [ ] **Step 2: Manual end-to-end smoke test**

Run: `npm run dev`

Required checks (do them in order, do not skip):
1. App launches in last-used mode (defaults to Text on first run).
2. **Text mode:** existing classify→generate flow still works for "write a haiku". Tier badge appears. Breakdown shows role/instructions/etc.
3. **Switch to Image mode:** window resizes to 640×720, two-column layout appears, mode toggle and aspect-ratio dropdown render.
4. Type "a red fox in a snowy meadow" → click Generate. Result returns within ~5s. Breakdown shows Subject / Style / Composition / Lighting / Mood / Technical (and Negative Prompt if populated). Assembled tab shows the prose paragraph followed by `--ar 1:1` (default).
5. Change aspect ratio to `16:9` — assembled text updates immediately to end with `--ar 16:9` (no regeneration). Aspect ratio persists if you switch to Video and back.
6. **Switch to Video mode:** assembled string and breakdown clear. Type "a wave crashing on a beach at sunset" → Generate. Breakdown shows Subject / Action / Camera Motion / Style / Lighting / Mood / Pacing.
7. **History:** open history panel; entries from text + image + video show with their respective tier badges (green/orange/yellow + cyan + purple). Clicking an image entry restores the result.
8. **Restart the app:** mode persists.

State exactly which checks passed and which failed in the handoff. If any failed, stop and report — do not commit.

- [ ] **Step 3: If everything passes, commit a verification marker**

Only commit if every check above passed:

```bash
git commit --allow-empty -m "chore: verify image/video mode end-to-end"
```

---

## Self-Review Notes (engineer reading this plan can skip)

**Spec coverage check:**
- Spec §1 mode toggle → Tasks 7, 8
- Spec §2 generation flow → Tasks 3, 4
- Spec §3 output shape → Tasks 1, 2, 3, 10
- Spec §4 system prompts → Task 3
- Spec §5 UI specifics → Tasks 7, 9, 10
- Spec §6 window resize → Tasks 5, 8
- Spec §7 IPC + persistence → Tasks 4, 5, 6
- Spec §8 extractJSON parity → confirmed unchanged

**Type consistency check:**
- Image fields: `subject`, `style`, `composition`, `lighting`, `mood`, `technical`, `negativePrompt`, `assembled` — match across spec, system prompt (Task 3), section maps (Tasks 1, 2), and tests (Tasks 1, 10).
- Video fields: `subject`, `action`, `cameraMotion`, `style`, `lighting`, `mood`, `pacing`, `negativePrompt`, `assembled` — match across the same.
- `mode` values: `'text' | 'image' | 'video'` — consistent across promptService, main.js, ModeToggle, persistence handlers.
- `resizeWindow` accepts both number (legacy) and `{width, height}` (Tasks 5, 6, 8).
