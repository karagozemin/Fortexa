import { describe, expect, it } from 'vitest';
import { sanitizeCsvCell } from '@/utils/csv.utils';

describe('sanitizeCsvCell', () => {
  it('prepends a single quote for dangerous prefixes', () => {
    const inputs = ['=SUM(A1)', '+1', '-foo', '@bar'];
    const expected = ["'=SUM(A1)", "'+1", "'-foo", "'@bar"]; // note the leading single quote
    inputs.forEach((input, idx) => {
      expect(sanitizeCsvCell(input)).toBe(expected[idx]);
    });
  });

  it('leaves safe strings unchanged', () => {
    expect(sanitizeCsvCell('Hello World')).toBe('Hello World');
    expect(sanitizeCsvCell('12345')).toBe('12345');
    expect(sanitizeCsvCell('=')).toBe("'="); // even a single '=' should be quoted
  });

  it('converts null/undefined to empty string', () => {
    expect(sanitizeCsvCell(null)).toBe('');
    expect(sanitizeCsvCell(undefined)).toBe('');
  });
});
