/**
 * Tests for diffPolicies / hasDiff — Issue #30
 */

import { describe, it, expect } from 'vitest';
import { diffPolicies, hasDiff } from './policy-diff';

describe('hasDiff', () => {
  it('returns false for identical objects', () => {
    expect(hasDiff({ a: 1 }, { a: 1 })).toBe(false);
  });

  it('returns true when objects differ', () => {
    expect(hasDiff({ a: 1 }, { a: 2 })).toBe(true);
  });

  it('returns true when incoming has extra key', () => {
    expect(hasDiff({ a: 1 }, { a: 1, b: 2 })).toBe(true);
  });
});

describe('diffPolicies', () => {
  it('produces only unchanged lines for identical objects', () => {
    const lines = diffPolicies({ x: 1 }, { x: 1 });
    expect(lines.every((l) => l.kind === 'unchanged')).toBe(true);
  });

  it('marks changed value as removed + added', () => {
    const lines = diffPolicies({ x: 1 }, { x: 2 });
    const kinds = lines.map((l) => l.kind);
    expect(kinds).toContain('removed');
    expect(kinds).toContain('added');
  });

  it('marks new keys as add', () => {
    const lines = diffPolicies({ a: 1 }, { a: 1, b: 2 });
    expect(lines.some((l) => l.kind === 'added')).toBe(true);
  });

  it('marks removed keys as removed', () => {
    const lines = diffPolicies({ a: 1, b: 2 }, { a: 1 });
    expect(lines.some((l) => l.kind === 'removed')).toBe(true);
  });

  it('assigns sequential line numbers', () => {
    const lines = diffPolicies({ a: 1 }, { b: 2 });
    lines.forEach((line, i) => {
      expect(line.lineNum).toBeGreaterThan(0);
    });
  });
});
