/**
 * policy-diff.ts
 *
 * Produces a human-readable line diff between two policy objects.
 * Uses JSON pretty-print + a simple line-by-line comparison so there
 * is no heavy diff library dependency.
 *
 * Issue: #30
 */

export interface DiffLine {
  kind:    'unchanged' | 'added' | 'removed';
  lineNum: number;
  text:    string;
}

/**
 * Compare two arbitrary objects by their pretty-printed JSON representation.
 * Returns an array of DiffLine entries for rendering.
 */
export function diffPolicies(
  current: unknown,
  incoming: unknown,
): DiffLine[] {
  const currentLines  = JSON.stringify(current,  null, 2).split('\n');
  const incomingLines = JSON.stringify(incoming, null, 2).split('\n');

  const maxLen = Math.max(currentLines.length, incomingLines.length);
  const result: DiffLine[] = [];

  for (let i = 0; i < maxLen; i++) {
    const cur = currentLines[i];
    const inc = incomingLines[i];

    if (cur === undefined) {
      result.push({ kind: 'added',     lineNum: i + 1, text: inc });
    } else if (inc === undefined) {
      result.push({ kind: 'removed',   lineNum: i + 1, text: cur });
    } else if (cur === inc) {
      result.push({ kind: 'unchanged', lineNum: i + 1, text: cur });
    } else {
      result.push({ kind: 'removed',   lineNum: i + 1, text: cur });
      result.push({ kind: 'added',     lineNum: i + 1, text: inc });
    }
  }

  return result;
}

/** Returns true if there are any actual changes between the two policies. */
export function hasDiff(current: unknown, incoming: unknown): boolean {
  return JSON.stringify(current) !== JSON.stringify(incoming);
}
