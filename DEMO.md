# PromptForge Innovation Demos

## Local Prompt Audit

Branch: `innovation/prompt-audit`

### Try it

1. Run `npm install` and `npm run dev`.
2. Generate a text or media prompt.
3. In the **Assembled** result tab, select the **Audit clear** or findings chip beside the copy/send actions.
4. To exercise the rules, generate or edit source material that leads to an email address, `{{variable}}`, provider parameter such as `--ar 16:9`, or a recognizable API-key shape in the assembled output.

### What works

- Entirely local checks for likely API tokens, email addresses, unresolved variables, and common provider-specific parameters.
- Severity-ranked findings with line locations.
- Matched secrets and personal values are never copied into finding objects or diagnostic text.
- Advisory UI never blocks copy or send actions.

### Deliberately deferred

- Broader phone/address detection, which needs careful locale-aware false-positive testing.
- User-configurable rule suppression.
- Auditing manually edited sections, pending editable result support.

### Next increment

Collect opt-in false-positive feedback locally and add narrowly tested rules only where precision remains high.
