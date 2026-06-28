/**
 * PolicyDiffViewer
 *
 * Renders a human-readable diff between the current and incoming policy.
 * Green lines = added, red = removed, grey = unchanged.
 * Collapsible unchanged regions keep the view scannable.
 *
 * Issue: #30
 */

'use client';

import { useMemo, useState } from 'react';
import { diffPolicies, hasDiff, type DiffLine } from '@/lib/policy-diff';

interface Props {
  current:  unknown;
  incoming: unknown;
}

const CONTEXT_LINES = 3; // unchanged lines to show around each change

export function PolicyDiffViewer({ current, incoming }: Props) {
  const [showAll, setShowAll] = useState(false);

  const lines = useMemo(() => diffPolicies(current, incoming), [current, incoming]);
  const changed = useMemo(() => hasDiff(current, incoming), [current, incoming]);

  if (!changed) {
    return (
      <p className="text-sm text-gray-500 italic px-3 py-2">
        No changes — imported policy is ideical to the current one.
      </p>
    );
  }

  // Compute which line indices to show (changed lines + context)
  const changedIndices = new Set(
    lines
      .map((l, i) => (l.kind !== 'unchanged' ? i : -1))
      .filter((i) => i !== -1)
  );

  const visibleIndices = new Set<number>();
  if (!showAll) {
    changedIndices.forEach((ci) => {
      for (let offset = -CONTEXT_LINES; offset <= CONTEXT_LINES; offset++) {
        const idx = ci + offset;
        if (idx >= 0 && idx < lines.length) visibleIndices.add(idx);
      }
    });
  }

  const renderLine = (line: DiffLine, index: number) => {
    const styles: Record<DiffLine['kind'], string> = {
      added:     'bg-green-950 text-green-300 border-l-2 border-green-500',
      removed:   'bg-red-950   text-red-300   border-l-2 border-red-500',
      unchanged: 'text-gray-500',
    };
    const prefix: Record<DiffLine['kind'], string> = {
      added:     '+ ',
      removed:   '- ',
      unchanged: '  ',
    };

    return (
      <div
        key={index}
        className={`flex gap-3 px-3 py-0.5 font-mono text-xs leading-5 ${styles[line.kind]}`}
      >
        <span className="select-none w-8 text-right shrink-0 text-gray-600">
          {line.lineNum}
        </span>
        <span className="select-none w-4 shrink-0">{prefix[line.kind]}</span>
        <span className="whitespace-pre">{line.text}</span>
      </div>
    );
  };

  const displayLines = showAll ? lines : lines.filter((_, i) => visibleIndices.has(i));

  // Insert ellipsis markers between non-contiguous visible blocks
  const withEllipsis: Array<DiffLine | 'ellipsis'> = [];
  if (!showAll) {
    let lastVisibleIdx = -1;
    lines.forEach((line, i) => {
      if (visibleIndices.has(i)) {
        if (lastVisibleIdx !== -1 && i > lastVisibleIdx + 1) {
          withEllipsis.push('ellipsis');
        }
        withEllipsis.push(line);
        lastVisibleIdx = i;
      }
    });
  }

  const toRender = showAll ? lines : withEllipsis;

  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-gray-300 font-medium">Policy diff</span>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-gray-400 hover:text-gray-200 text-xs underline underline-offset-2"
        >
          {showAll ? 'Collapse unchanged' : 'Show all lines'}
        </button>
      </div>

      {/* Diff body */}
      <div className="bg-gray-900 overflow-auto max-h-96">
        {toRender.map((item, i) =>
          item === 'ellipsis' ? (
            <div
              key={`ellipsis-${i}`}
              className="px-3 py-0.5 text-gray-600 font-mono text-xs select-none"
            >
              ···
            </div>
          ) : (
            renderLine(item, i)
          )
        )}
      </div>

      {/* Summary */}
      <div className="px-3 py-2 bg-gray-800 border-t bor-gray-700 flex gap-4 text-xs">
        <span className="text-green-400">
          +{lines.filter((l) => l.kind === 'added').length} added
        </span>
        <span className="text-red-400">
          −{lines.filter((l) => l.kind === 'removed').length} removed
        </span>
      </div>
    </div>
  );
}
