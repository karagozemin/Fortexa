/**
 * PolicyImportExport
 *
 * Augments the existing policy editor with:
 *  - Export: downloads current policy as policy.json
 *  - Import: file picker or paste area → validate → diff preview → save
 *
 * Rules:
 *  - Viewer role: export only, import button disabled
 *  - Validation errors shown inline, current policy never mutated on error
 *  - Diff shown before save; save only available after clean validation
 *
 * Issue: #30
 */

'use client';

import { useRef, useState } from 'react';
import { Download, Upload, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { validatePolicyImport, downloadPolicyJson, type PolicyConfig } from '@/lib/validation/policy-import';
import { PolicyDiffViewer } from './PolicyDiffViewer';

// ── Types ────────────────────────────────────────────────────────────────    (policy: PolicyConfig) => Promise<void> | void;
}

type ImportPhase =
  | { stage: 'idle' }
  | { stage: 'error';   message: string; fieldErrors?: Record<string, string[]> }
  | { stage: 'preview'; policy: PolicyConfig }
  | { stage: 'saving' }
  | { stage: 'saved' };

// ── Component ─────────────────────────────────────────────────────────────────

export function PolicyImportExport({ currentPolicy, role, onImport }: Props) {
  const fileInputRef            = useRef<HTMLInputElement>(null);
  const [phase, setPhase]       = useState<ImportPhase>({ stage: 'idle' });
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const canImport = role !== 'viewer';

  // ── Export ─────────────────────────────────────────────────idatePolicyImport(raw);
    if (!result.ok) {
      setPhase({ stage: 'error', message: result.error, fieldErrors: result.fieldErrors });
      return;
    }
    setPhase({ stage: 'preview', policy: result.policy });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => processRawInput(ev.target?.result as string);
    reader.readAsText(file);
    // Reset so the same file can be re-selected after an error
    e.target.value = '';
  }

  function handlePasteSubmit() {
    processRawInput(pasteText);
  }

  async function handleSave() {
    if (phase.stage !== 'preview') return;
    setPhase({ stage: 'saving' });
    try {
      await onImport(phase.policy);
      setPhase({ stage: 'saved' });
      setTimeout(() => setPhase({ stage: 'idle' }), 2000);
    } catch (err) {
      setPhase({
        stage: 'error',
        message: err instanceof Error ? err.message : 'Failed to save policy.',
      });
    }
  }

  function handleReset() {
    setPhase({ stage: 'idle' });
    setPasteText('');
    setPasteMode(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-200">Import / Export</h3>

        <div className="flex gap-2">
          {/* Export — always available */}
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md
                       text-xs font-medium
                       bg-gray-700 text-gray-200 hover:bg-gray-600
           
                       transition-colors"
          >
            <Download size={14} aria-hidden="true" />
            Export JSON
          </button>

          {/* Import — disabled for viewers */}
          {canImport && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md
                           text-xs font-medium
                           bg-indigo-600 text-white hover:bg-indigo-500
                           focus-visible:outline focus-visible:outline-2
                           focus-visible:outline-offset-2 focus-visible:outline-indigo-400
                           transition-colors"
              >
                <Upload size={14} aria-hidden="true" />
                Import file
              </button>

              <button
                type="button"
                onClick={() => setPasteMode((v) => !v)}
                clsName="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md
                           text-xs font-medium
                           bg-gray-700 text-gray-200 hover:bg-gray-600
                           focus-visible:outline focus-visible:outline-2
                           focus-visible:outline-offset-2 focus-visible:outline-indigo-500
                           transition-colors"
              >
                Paste JSON
              </button>
            </>
          )}

          {role === 'viewer' && (
            <span className="text-xs text-gray-500 italic self-center">
              Viewer — export only
            </span>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Import policy JSON file"
          onChange={handleFileChange}
        />
      </div>

      {/* ── Paste area ── */}
      {pasteMode && p === 'idle' && (
        <div className="space-y-2">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder='Paste policy JSON here…'
            rows={8}
            className="w-full rounded-md border border-gray-600 bg-gray-800
                       text-gray-200 text-xs font-mono p-3 resize-y
                       focus-visible:outline focus-visible:outline-2
                       focus-visible:outline-indigo-500 focus-visible:outline-offset-0"
            aria-label="Paste policy JSON"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePasteSubmit}
              disabled={!pasteText.trim()}
              className="px-3 py-1.5 rounded-md text-xs font-medium
                         bg-indigo-600 text-white hover:bg-indigo-500
                         disabled:opacity-40 disabled:cursor-not-allowed
                         transition-colors"
          >
              Validate &amp; preview
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 rounded-md text-xs font-medium
                         bg-gray-700 text-gray-300 hover:bg-gray-600
                         transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Error state ── */}
      {phase.stage === 'error' && (
        <div className="rounded-lg border border-red-700 bg-red-950 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle size={15} className="text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-red-300 text-xs font-medium">{phase.message}</p>
                {phase.fieldErrors && (
                  <ul className="mt-1.5 space-y-0.5">
            {Object.entries(phase.fieldErrors).map(([field, msgs]) => (
                      <li key={field} className="text-red-400 text-xs font-mono">
                        <span className="font-semibold">{field}:</span>{' '}
                        {msgs.join(', ')}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              aria-label="Dismiss error"
              className="text-red-400 hover:text-red-200 shrink-0"
            >
              <X size={14} />
            </button>
          </div>
          <p className="text-red-500 text-xs pl-5">
            Current policy was not modified.
          </p>
        </div>
      )}

      {/* ── Diff preview ── */}
      {phase.stage === 'preview' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            Review the changes below, then save to          </p>

          <PolicyDiffViewer current={currentPolicy} incoming={phase.policy} />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1.5 rounded-md text-xs font-medium
                         bg-indigo-600 text-white hover:bg-indigo-500
                         focus-visible:outline focus-visible:outline-2
                         focus-visible:outline-offset-2 focus-visible:outline-indigo-400
                         transition-colors"
            >
              Save policy
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 rounded-md text-xs font-medium
                         bg-gray-700 text-gray-300 hover:bg-gray-600
                         transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Saving ── */}
  se.stage === 'saving' && (
        <p className="text-xs text-gray-400 animate-pulse">Saving policy…</p>
      )}

      {/* ── Saved confirmation ── */}
      {phase.stage === 'saved' && (
        <div className="flex items-center gap-2 text-green-400 text-xs">
          <CheckCircle2 size={14} aria-hidden="true" />
          Policy saved successfully.
        </div>
      )}
    </div>
  );
}
