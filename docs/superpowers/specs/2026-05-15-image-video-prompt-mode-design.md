# Image and Video Prompt Modes — Design

**Date:** 2026-05-15
**Status:** Approved, ready for implementation plan
**Owner:** ggrace@519lab.com

## Summary

Add two new generation modes — **Image** and **Video** — alongside the existing
text-prompt flow. Each produces a structured set of fields tailored to modern
multimodal generation tools (SDXL, Qwen-Image, Nano Banana, ComfyUI, Gemini,
Grok), plus a single paste-ready `assembled` prompt string. Mode is selected by
an explicit top-level toggle; the existing tier auto-classifier runs only in
Text mode.

## Motivation

The current app generates structured JSON prompts intended for chat-style LLMs.
Image and video tools want a fundamentally different output shape: a single
descriptive paragraph (often with optional negative prompt and aspect ratio).
Forcing media prompts through the existing tier flow would produce the wrong
shape; adding a new mode dimension keeps both flows clean.

## Design

### 1. Mode toggle (UI)

A three-way segmented toggle above the task input: **Text** | **Image** |
**Video**. Defaults to **Text**. The toggle is the single source of truth for
output shape — there is no auto-classification across modes.

- **Text** mode: existing UI unchanged (input, tier badge, ResultsPanel with
  current 4 / 6 / 8-field JSON).
- **Image** or **Video** mode: window resizes to 640×720, layout switches to
  two columns (input + structured fields on the left; assembled string +
  aspect-ratio dropdown + copy controls on the right). Tier badge is hidden.

### 2. Generation flow

- **Text mode:** classify call → tier-matched generate call (today's behavior,
  unchanged).
- **Image / Video mode:** **skip classification** entirely. One direct generate
  call using the appropriate template. Saves the classify API call for media
  modes.
- Both Image and Video use the **Simple/Standard slot** for the generate call.
  The Complex slot stays text-only.

### 3. Output shape

**Image mode** returns:

| Field            | Purpose                                                |
|------------------|--------------------------------------------------------|
| `subject`        | What's in the frame, expanded with concrete detail     |
| `style`          | Medium / aesthetic (photographic, 3D, oil paint, anime)|
| `composition`    | Framing, angle, perspective                            |
| `lighting`       | Light source, quality, direction                       |
| `mood`           | Atmosphere, emotional tone                             |
| `technical`      | Camera/lens for photo, render engine for 3D, hints     |
| `negativePrompt` | Things to avoid (mainly SDXL/ComfyUI; may be empty)    |
| `assembled`      | Final paste-ready paragraph                            |

Plus metadata: `tier: 'image'`, `aspectRatio`, `generateProvider`,
`generateModel`.

**Video mode** returns:

| Field            | Purpose                                                |
|------------------|--------------------------------------------------------|
| `subject`        | Scene and characters                                   |
| `action`         | What happens; the motion itself                        |
| `cameraMotion`   | Pan, dolly, tracking, static, handheld                 |
| `style`          | Cinematic, animated, documentary, etc.                 |
| `lighting`       | Light setup                                            |
| `mood`           | Tone and atmosphere                                    |
| `pacing`         | Fast cuts, slow burn, single continuous shot           |
| `negativePrompt` | Things to avoid (may be empty)                         |
| `assembled`      | Final paste-ready paragraph                            |

Plus metadata: `tier: 'video'`, `aspectRatio`, `generateProvider`,
`generateModel`.

The aspect-ratio dropdown value is appended to `assembled` on the fly
(client-side, no regeneration needed).

### 4. System prompts

Two new system prompts are added to `electron/main.js` next to the existing
three:

- `SYSTEM_PROMPT_IMAGE`
- `SYSTEM_PROMPT_VIDEO`

Each instructs the model to:

- Expand the user's brief into vivid, concrete descriptive language (modern
  multimodal style — natural-language paragraphs, not comma-separated tag soup).
- Target compatibility with SDXL, Qwen-Image, Nano Banana, ComfyUI, Gemini,
  Grok (one universal style; no per-tool branches).
- Populate every field plus a final `assembled` paragraph that strings them
  together for paste-and-go use.
- Include `negativePrompt` only when meaningfully helpful; empty string
  otherwise.

Both are added to `TEMPLATE_MAP` keyed by `'image'` and `'video'`.

### 5. UI specifics

- **Aspect-ratio dropdown** (Image + Video): options `16:9`, `1:1`, `9:16`,
  `4:3`, `21:9`. Persists last choice per mode. Appended to `assembled` on the
  fly — never triggers regeneration.
- **Tier badge colors**: extend the existing `TIER_COLORS` map in `App.jsx` with
  entries for `image` (cyan/teal) and `video` (purple) so history entries
  render correctly.
- **Two-column layout**: pure CSS (CSS grid in `index.css`). `App.jsx` stays a
  single file — no new component-tree split.

### 6. Window resize

`resize-window` IPC already accepts arbitrary dimensions. Add a third size
class:

| State              | Dimensions |
|--------------------|------------|
| Text — input       | 480 × 320  |
| Text — results     | 480 × 640  |
| Image / Video      | 640 × 720  |

Window resizes when the mode toggle changes. Image/Video stays at 640×720
throughout — the form is always visible alongside results, no input-vs-results
toggle.

### 7. IPC and persistence

- `generate-prompt` channel gains an optional `mode` parameter
  (`'text'` | `'image'` | `'video'`), defaulting to `'text'`. When `mode !==
  'text'`, classification is skipped and `tier` is set from `mode`.
- New persistence keys (electron-store):
  - `lastMode` — last selected mode
  - `lastAspectRatio.image` — last image aspect ratio
  - `lastAspectRatio.video` — last video aspect ratio
- History schema unchanged. `tier` is already a string field; it accepts
  `'image'` and `'video'` transparently.

### 8. extractJSON parity

`extractJSON` is duplicated in `src/lib/utils.js` and inlined in
`electron/main.js`. No changes needed for this feature — image/video responses
are still JSON. Existing parser handles them as-is.

## Out of scope for v1

- Reference image upload
- Per-tool tuning (Midjourney syntax, ComfyUI nodes, etc.)
- Dedicated Image/Video model slot (reuses Simple/Standard)
- Auto-classify between Text and Image/Video
- Hybrid "looks like an image task" hint banner
- Live preview / actual image or video generation

## Open questions

None at design time. Specifics of system-prompt wording (exact `assembled`
formatting style, aspect-ratio suffix convention) are implementation choices
to make during the build.

## Backward compatibility

- Existing config keeps working unchanged.
- Existing `generate-prompt` callers that omit `mode` get Text mode (current
  behavior).
- Tier classifier code is untouched; only bypassed when `mode !== 'text'`.
- History entries written before this feature retain their original `tier`
  values; new entries may carry `'image'` / `'video'`.
