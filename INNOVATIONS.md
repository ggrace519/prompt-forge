# Innovation Proposals — PromptForge UI/UX Revamp
*Generated 2026-06-24 · based on commit 2554027 (branch `feature/custom-endpoint-format`)*

## How this codebase stands today

PromptForge is a genuinely solid 480px Windows prompt tool: a clean classify→generate
two-call flow, four provider paths (Anthropic API/subscription, OpenAI, named custom
endpoints), DPAPI-encrypted keys, per-slot endpoints, reasoning-model parsing, and a
real-app window (taskbar, single-instance, resizable). 76 passing tests. The recent
pass already added auto-resize input, a classify→generate step indicator, collapsible
settings, and the breakdown expand-all.

Where it's ordinary — and what this revamp targets:
- **It still *looks and behaves* like a cramped corner popup** even though it's now a
  real resizable window. Layout, density, and motion don't use the space or the moment.
- **The generated prompt is a read-only blob.** You copy it and leave. No in-place
  editing, no "make it more concise," no iteration — the one thing a prompt *tool*
  should own.
- **It's mouse-only.** No command palette, no global summon, shortcuts undiscoverable.
- **Blank-canvas friction.** Empty input, empty history, and "no result yet" are dead
  walls, not on-ramps.
- **The model picker is three opaque `provider:auth:model` dropdowns**; results don't
  say which model produced them.

## What the best in this space are doing

(From a 5-stream research sweep — sources inline per proposal.)

- **Prompt tools** (Anthropic Console *Prompt Improver*, OpenAI *Generate*, Latitude
  *Refiner*, PromptHub) converge on: feedback-driven **Refine** (free-text feedback →
  reviewable rewrite), **editable output blocks** (not a blob), `{{variable}}` templating
  with auto-detected fields, and one-click named enhancers. Notably, OpenAI's and
  Anthropic's canonical generated-prompt anatomy **independently matches PromptForge's
  simple(4)/standard(6)/complex(8) field tiers** — the structure is already industry-standard.
- **Keyboard-first desktop** (Raycast, Linear, Arc): one chord (⌘K/Ctrl+K) → search-to-act,
  palette shows recents on empty, inline shortcut hints, global summon + blur-to-hide.
  `cmdk` is the canonical lib (14.9 KB) but a fixed ~8-action set is cheaper hand-rolled.
- **Motion** (Linear, Raycast, Vercel): purposeful, <400ms, CSS-first, reduced-motion-gated.
  Skeletons for content loads (not spinners), copy→checkmark morph, the **View Transitions
  API** for state swaps (zero library), and *no* open animation on a high-frequency popup.
- **Empty states / onboarding** (NN/g): example-task **suggestion pills** at the input
  kill blank-canvas paralysis; the four empty-state types (first-use / cleared / no-result
  / error) each need distinct copy + a single CTA.
- **Local-first AI** (Raycast AI, LM Studio, Open WebUI): provider-grouped model picker
  with Speed/Context hints, badge each result with the model that produced it, async-probe
  endpoints with explicit verified/unreachable status — never hang on a dead URL.

## Proposals (ranked)

### 1. Command palette (Ctrl+K) + global summon
**Category:** DX · wow
**Impact 5 · Novelty 5 · Effort 3 · Fit 5**

**The idea.** A `Ctrl+K` palette over the window: fuzzy-search every action — Generate,
Refine, switch tier (Simple/Standard/Complex), copy, open History, open Settings, toggle
theme, switch result tab — each row showing its keybinding. Empty input shows recent
actions. Pair with an Electron `globalShortcut` (e.g. `Ctrl+Shift+Space`) that summons the
window from anywhere. This is the single move that makes the app feel *elite* and turns a
mouse-only popup into a keyboard instrument.
**Inspired by.** Raycast / Linear / Arc command palette + Action Panel
([Raycast](https://www.pixelmatters.com/insights/raycast-for-software-engineers),
[Linear "invisible details"](https://medium.com/linear-app/invisible-details-2ca718b41a44));
`globalShortcut` summon ([Multi blog](https://multi.app/blog/nailing-the-activation-behavior-of-a-spotlight-raycast-like-command-palette)).
**Implementation sketch.** Dependency-free (≈150 lines): a `CommandPalette` component in
`App.jsx` — a fixed overlay + filtered list driven by an `actions` array `{id,label,hint,run}`,
arrow-key nav, Enter to run, Esc to close, simple substring/initials match. A `useCommandPalette`
hook holds open state + a global `keydown` for `Ctrl/⌘+K`. Actions are wired to existing
handlers (`handleGenerate`, tier change, `copyToClipboard`, `setShowHistory`, `onOpenSettings`,
`toggleTheme`). Add `globalShortcut.register('CommandOrControl+Shift+Space', showWindow)` in
`main.js` `whenReady`, `unregisterAll()` on quit. cmdk (14.9 KB) is the drop-in alternative if
fuzzy ranking matters later.
**Effort.** ~1 day. Risk: focus management — trap focus in the palette, restore on close.
**First step.** `CommandPalette` + `useCommandPalette` with a static action list; wire `Ctrl+K`.

### 2. Feedback-driven "Refine" — iterate on the generated prompt
**Category:** feature · wow
**Impact 5 · Novelty 4 · Effort 3 · Fit 5**

**The idea.** A **Refine** action on the results panel: type free-text feedback ("make it
more concise", "for expert users", "add an output schema"), and the app re-runs a
critique→rewrite call on the *current* prompt and shows the new version. This is the highest-value
borrow from the best tools and the natural extension of the existing tier-override+regenerate —
it closes the loop a prompt *tool* should own, and fits a 480px column far better than version trees.
**Inspired by.** Anthropic [Prompt Improver](https://claude.com/blog/prompt-improver),
Latitude [Refiner](https://latitudellms.mintlify.app/guides/evaluations/prompt-suggestions),
PromptHub Iterator.
**Implementation sketch.** New IPC `refine-prompt({ sections, tier, feedback })` in `main.js`
reusing `getSlotCredentials`/`callProvider`: a single call with a "you are a prompt critic;
apply this feedback; return the same JSON fields, minimal targeted edits" system prompt, parsed
with the existing `parseModelJSON` (already reasoning-model-safe). Renderer adds a Refine input +
button under the Assembled tab and replaces `result` with the revision (push the old one to
history). Quick-feedback pills ("Concise", "More detail", "Add examples") seed common cases.
**Effort.** ~1 day. Risk: drift — constrain with "minimal edits, preserve intent."
**First step.** `refine-prompt` handler + a `refinePrompt` service wrapper; then the UI.

### 3. Editable generated sections (drop the read-only blob)
**Category:** feature · DX
**Impact 4 · Novelty 3 · Effort 2 · Fit 5**

**The idea.** Make each generated section (role, instructions, …) **editable in place** in the
Breakdown tab; edits re-assemble the final prompt live. Today the output is read-only — you can't
fix one word without leaving for an external editor.
**Inspired by.** OpenAI Generate dropping output into [editable blocks](https://developers.openai.com/api/docs/guides/prompt-generation).
**Implementation sketch.** `BreakdownTab` swaps each `<pre>` for an auto-resizing `<textarea>`
bound to a local editable copy of `result`; a pure `assembleSections()` (already in `utils.js`)
recomputes the Assembled text on change. "Reset to generated" restores the original.
**Effort.** ~0.5 day. Risk: keeping Assembled ↔ sections in sync (one source of truth: the edited copy).
**First step.** Local editable `result` state in `ResultsPanel`; textarea-ize `SectionCard`.

### 4. Onboarding & empty states + example-task pills
**Category:** UX
**Impact 4 · Novelty 3 · Effort 2 · Fit 5**

**The idea.** Replace the dead walls with on-ramps: 3-4 **specific** clickable example-task
pills under the input ("Write a cold outreach email", "Build a code-review agent", …) that
fill the box; distinct empty states for first-run, "no result yet" (a result-card skeleton that
previews what's coming), and cleared history; and an inline "Ctrl+Enter to generate" hint.
**Inspired by.** NN/g [use-case prompt suggestions](https://www.nngroup.com/articles/designing-use-case-prompt-suggestions/)
and [empty-state design](https://www.nngroup.com/articles/empty-state-interface-design/).
**Implementation sketch.** A `TASK_EXAMPLES` array → pill row rendered when `task` is empty and
there's no result. An `EmptyResult` skeleton component shown in the results area before first
generate. History panel's empty case gets reassuring copy + a "Generate your first prompt" CTA.
**Effort.** ~0.5 day. Risk: none. Pure additive.
**First step.** `TASK_EXAMPLES` pills under the textarea.

### 5. Motion & feel pass — skeleton, copy-morph, view transitions
**Category:** wow · UX
**Impact 4 · Novelty 3 · Effort 2 · Fit 5**

**The idea.** A cohesive, *lightweight* motion language: a **result-card skeleton** during the
classify→generate wait (instead of just the button spinner), a **copy→checkmark morph** as the
signature confirm beat, the **View Transitions API** to crossfade the input↔results swap, and a
global `prefers-reduced-motion` gate with all motion ≤400ms on `transform`/`opacity` only. No
animation library.
**Inspired by.** [View Transitions API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using),
NN/g [skeleton screens](https://www.nngroup.com/articles/skeleton-screens/),
Raycast "instant > animated", [reduced-motion (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion).
**Implementation sketch.** `EmptyResult`/`SkeletonResult` shown while `loading`; wrap the
view swap in `document.startViewTransition?.()`; CSS `@keyframes` for the copy checkmark
stroke-draw + a `@media (prefers-reduced-motion: reduce)` block that zeroes durations.
**Effort.** ~0.5–1 day. Risk: low; all CSS-first and feature-detected.
**First step.** Add the reduced-motion gate + skeleton component.

### 6. Provider-grouped model picker + result model badge
**Category:** UX
**Impact 3 · Novelty 3 · Effort 3 · Fit 4**

**The idea.** Turn the three opaque `provider:auth:model` dropdowns into a decision aid:
group by provider/endpoint (already grouped via optgroups — extend with the *active* model shown
prominently), and **badge every result** with which provider+model produced it (the data —
`generateProvider`/`generateModel` — is already returned and stored in history, just not surfaced
on the result). Async-probe endpoints with explicit verified/unreachable status so a dead local
URL never hangs the picker.
**Inspired by.** [Raycast AI model picker](https://manual.raycast.com/ai/models),
[LM Studio](https://lmstudio.ai/blog/lmstudio-v0.3.3), Open WebUI connection status.
**Implementation sketch.** A small `result-model-badge` in `ResultsPanel` reading
`result`/response metadata; a status dot on each endpoint card from a debounced async probe.
**Effort.** ~0.5–1 day. Risk: low.
**First step.** Surface `generateModel` as a badge on the result header.

### 7. `{{variable}}` templating with a fill-in panel
**Category:** feature
**Impact 3 · Novelty 3 · Effort 3 · Fit 4**

**The idea.** Detect `{{placeholders}}` in the generated prompt (the universal convention) and
render a small fill-in panel so a generated prompt becomes a reusable template before copying.
**Inspired by.** OpenAI/Anthropic/PromptHub `{{variable}}` standard + auto-surfaced fields.
**Implementation sketch.** Pure `extractVariables(text)`/`fillVariables(text, values)` in a new
`src/lib/template.js` (unit-tested); when present, the Assembled tab shows inputs and "Copy All"
copies the filled version.
**Effort.** ~1 day. **First step.** `src/lib/template.js` + tests.

## Killed ideas (and why)

- **Full version tree / eval grid (Helicone Experiments style).** Too heavy for a 480px column;
  the Refine loop (#2) captures the iteration value at the right size.
- **Framer Motion / a motion library.** ~25-34 KB gzip for entrance/hover that CSS `@keyframes`
  on `transform`/`opacity` do GPU-accelerated and free. Killed on weight.
- **Animated popup open/close.** Raycast principle: a high-frequency window should open *instantly*.
- **Multi-pane "real app" redesign (sidebar + main).** Tempting now that it's a real window, but it
  fights the deliberate single-column focus; the palette (#1) gives navigation without the bloat.
- **Bundling cmdk just for ~8 fixed actions.** Hand-rolled palette is lighter and fully themable.

## Suggested order of attack

Build the **cohesive interaction+feel revamp first** — #1 (command palette + global summon),
#4 (empty states + example pills), and #5 (motion pass) ship together as one visible leap and
share a design language. Then #2 (Refine) and #3 (editable sections) form the "iterate on your
prompt" story (both reuse existing plumbing). #6 and #7 are independent polish that can land any
time. #1, #4, #5 are pure-renderer and low-risk; #2/#3 touch the main process lightly.
