# A Guide to Building Effective Prompts

A general reference for writing prompts that get reliable, high-quality output from modern LLMs (Claude, GPT, Gemini). Grounded in Anthropic's prompting docs and 2026 field consensus.

---

## The core idea: a prompt is a contract, not persuasion

The biggest shift in how the field thinks about prompts: a good prompt isn't clever wording or a magic phrase. It's a **typed interface with a clear definition of "done."** Most prompt failures come from ambiguity — an undefined target — not from model limitations. Decide what success looks like *before* you write the prompt, and most of the prompt writes itself.

The single most-cited best practice for 2026 is exactly this: **write your success criteria and an output contract first.**

---

## The seven building blocks

A reliable prompt assembles some subset of these. Not every prompt needs all seven — match the components to the stakes.

| Block | What it does | When to include |
|---|---|---|
| **Role** | Sets perspective, tone, expertise | Domain tasks; one sentence is enough |
| **Task / goal** | The actual ask, stated unambiguously | Always |
| **Context / inputs** | The data, background, or material to work from | When the task depends on specifics |
| **Constraints** | Boundaries + what's explicitly out of scope | When failure is expensive |
| **Output format** | Exact structure, length, tone, schema | Whenever format matters |
| **Examples** | 1–3 samples of what "good" looks like | When format must be consistent |
| **Uncertainty rule** | Permission to say "unknown" or ask | To cut hallucination |

### 1. Role — cheap and powerful
A single sentence of role assignment ("You are a contract lawyer drafting a risk assessment") measurably shifts tone, depth, and accuracy on domain tasks. It's one of the highest-return-per-token moves available. Don't overstack it ("expert lawyer AND data scientist AND…") — pick the perspective that actually serves the task.

### 2. Task — describe the outcome precisely
Vague: "tell me about renewable energy." Precise: "Write a 200-word summary of the benefits of renewable energy, highlighting solar and wind." The precise version removes the model's need to guess what you meant.

### 3. Context — give it, but don't drown it
Provide what the task genuinely needs. For large inputs, **put the data at the top and your actual question at the bottom** — querying *after* the data can improve quality by up to ~30% on complex multi-document inputs. Use delimiters (XML-ish tags) to separate your rules from the data they operate on, so the model never mistakes quoted content for an instruction.

### 4. Constraints — narrow the solution space
State both what to do and what *not* to do. Explicit exclusions ("don't add features beyond X," "don't include preamble") are also a cost-control mechanism — they stop the model over-building. Negative constraints ("never use condescending language") are among the highest-leverage lines in a prompt.

### 5. Output format — make "done" concrete
"Be concise and professional" is vague. An example output isn't. Specify format (JSON / markdown / prose), length, tone, and structure. If you need machine-parseable output, most major APIs now offer **structured-output / JSON-schema modes** that force valid JSON at the decoding level — use those instead of the old "respond only with JSON" plea.

### 6. Examples — show, don't describe
Examples communicate what instructions can't. The rule of thumb: **one example shows the pattern, two confirm it, three make it reliable.** Reach for examples the moment you see the model drift in formatting, over-explain, or under-explain. One concrete example beats five adjectives.

### 7. Uncertainty rule — the cheapest hallucination control
Add an explicit out: "If you're unsure, say so." "If the input is ambiguous, ask before proceeding." "Only make claims grounded in the provided text; mark anything else as [UNCERTAIN]." This single line reliably reduces confident-sounding errors with zero added tooling.

---

## Structure: how to lay it out

**Use labeled sections, not a wall of text.** Models process structured prompts far more reliably than prose blobs. A widely-used layout:

```
## INSTRUCTIONS   what to do
## CONTEXT/INPUTS the data or material
## CONSTRAINTS    scope, exclusions, uncertainty rule
## OUTPUT FORMAT  the contract / schema
```

For Claude specifically, **XML-style tags** (`<instructions>`, `<context>`, `<example>`) work especially well — the model is tuned to parse them and they cleanly prevent it from confusing examples with instructions. The exact tag names don't matter; consistency and clear boundaries do.

**Order:** static content first (instructions, examples), variable content last (the specific query/data). This also unlocks prompt caching on the major APIs — large cost/latency savings when you run a prompt repeatedly.

---

## Length: structure beats length, and length can hurt

This surprises people: **longer is not better, and past a point it's actively worse.** Research found LLM reasoning starts degrading around **3,000 tokens** of prompt — well below the technical maximum. The practical sweet spot for most tasks is **150–300 words.** Depth comes from structure and constraints, not word count. If a prompt feels bloated, cut before you add.

---

## The 2026 shift: don't hand-write "think step by step"

The trick that defined 2023 prompting now backfires on the current generation. **Reasoning models (Claude Opus 4.x, o-series, Gemini Pro) already think step-by-step internally.** Telling them to "show your work step by step" duplicates that work and can *degrade* the answer. Give the task and constraints, then get out of the way.

Keep explicit chain-of-thought only for **cheaper, non-reasoning models** (e.g. Haiku/Flash/mini tiers), where prompting the steps still lifts accuracy on multi-step work.

---

## Add a self-check

For anything important, append a short evaluator the model must pass before finalizing — 3–4 bullets, not a reasoning script:

```
Before finalizing, verify:
- [ ] Output matches the requested format exactly
- [ ] All success criteria are met (flag any misses)
- [ ] Claims are grounded in the input; unsupported ones marked [UNCERTAIN]
- [ ] Nothing out-of-scope was added
```

This is different from hand-written chain-of-thought: it's a *verification pass on the result*, which still helps even on reasoning models.

---

## Treat prompts like code

For anything you'll reuse or ship:
- **Version them.** A prompt is an artifact; track changes.
- **Test against a small eval set.** One good output proves nothing — judge revisions against several real cases, not a single lucky run.
- **Set temperature deliberately.** Low (0.0–0.3) for factual/consistent work; higher (0.7–1.0) for creative/varied. The default is often wrong for your task.
- **Pin model versions** in production — model behavior shifts between releases.

---

## Model-specific notes

The principles are universal; the dialects differ slightly:

| Model | Responds best to |
|---|---|
| **Claude** | "Contract-style" prompts; XML tags; explicit critique/verification steps |
| **GPT** | Explicit formatting + constraints; strong at structured output and code; good at inferring intent from minimal context (try zero-shot first) |
| **Gemini** | Clear input labeling (especially multimodal); explicit verification steps; generally prefers a few-shot example |

There is **no universal "best" formatting** — different models reward different patterns, which is another reason to test rather than assume.

---

## The golden rule

Show your prompt to a colleague with minimal context on the task and ask them to follow it. **If they're confused, the model will be too.** A prompt is just unusually literal instructions to a capable, fast, amnesiac collaborator — clarity, structure, and a clear definition of "done" do almost all the work.

---

## Quick checklist

```
☐ Did I decide what "done" looks like before writing?
☐ Role set (if it helps)?
☐ Task stated unambiguously?
☐ Inputs provided, with data-up-top / query-at-bottom for big inputs?
☐ Constraints + out-of-scope stated?
☐ Output format concrete (ideally with an example)?
☐ Uncertainty / abstention rule included?
☐ Sections labeled, not a prose blob?
☐ Under ~300 words unless the task truly needs more?
☐ No hand-written "think step by step" on a reasoning model?
☐ Self-check appended (for important prompts)?
☐ Tested against more than one case (for reused prompts)?
```
