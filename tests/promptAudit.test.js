import { describe, expect, it } from 'vitest';
import { auditPrompt, auditStatus } from '../src/lib/promptAudit.js';

describe('auditPrompt', () => {
  it('detects sensitive and unresolved content without returning the matched value', () => {
    const secret = `sk-ant-${'a'.repeat(24)}`;
    const findings = auditPrompt(`Email me at person@example.com\nKey: ${secret}\nHello {{name}}`);

    expect(findings.map((item) => item.code)).toEqual(['secret', 'email', 'unresolved-variable']);
    expect(JSON.stringify(findings)).not.toContain(secret);
    expect(findings[0]).toMatchObject({ line: 2, severity: 'high' });
  });

  it('flags portable prompt parameters but not ordinary double hyphens', () => {
    expect(auditPrompt('portrait --ar 16:9').map((item) => item.code)).toEqual(['provider-syntax']);
    expect(auditPrompt('Use a dash -- like this.')).toEqual([]);
  });

  it('returns no findings for an ordinary structured prompt', () => {
    expect(auditPrompt('## Role\nYou are a concise technical editor.')).toEqual([]);
    expect(auditStatus([])).toEqual({ level: 'clear', label: 'Audit clear' });
  });
});
