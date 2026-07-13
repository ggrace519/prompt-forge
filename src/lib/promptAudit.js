const RULES = [
  {
    code: 'secret',
    severity: 'high',
    message: 'Possible API key or access token is embedded in this prompt.',
    pattern: /\b(?:sk-(?:ant|proj|live|test)?-?[a-z0-9_-]{16,}|gh[opsu]_[a-z0-9]{20,}|AKIA[A-Z0-9]{16})\b/gi,
  },
  {
    code: 'email',
    severity: 'medium',
    message: 'Possible email address will be included when this prompt is shared.',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  {
    code: 'unresolved-variable',
    severity: 'medium',
    message: 'Unresolved template variable may produce an incomplete result.',
    pattern: /\{\{\s*[a-zA-Z_][\w.-]*\s*\}\}/g,
  },
  {
    code: 'provider-syntax',
    severity: 'low',
    message: 'Provider-specific parameter syntax may not transfer to every model.',
    pattern: /(^|\s)--(?:ar|stylize|chaos|seed|no)\s+\S+/gim,
  },
];

function lineAndColumn(text, index) {
  const before = text.slice(0, index);
  const lines = before.split('\n');
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

export function auditPrompt(value) {
  const text = String(value || '');
  const findings = [];

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(text)) !== null) {
      const offset = rule.code === 'provider-syntax' ? match.index + match[1].length : match.index;
      findings.push({
        code: rule.code,
        severity: rule.severity,
        message: rule.message,
        ...lineAndColumn(text, offset),
      });
      if (match[0].length === 0) rule.pattern.lastIndex += 1;
    }
  }

  return findings.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.severity] - rank[b.severity] || a.line - b.line || a.column - b.column;
  });
}

export function auditStatus(findings) {
  const items = Array.isArray(findings) ? findings : [];
  if (!items.length) return { level: 'clear', label: 'Audit clear' };
  const level = items.some((item) => item.severity === 'high') ? 'high' : 'review';
  return { level, label: `${items.length} ${items.length === 1 ? 'finding' : 'findings'}` };
}
