import { createHash } from "node:crypto";

import type { AuditEntry } from "@/lib/types/domain";

export const GENESIS_HASH = "0".repeat(64);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, canonicalize(obj[k])])
    );
  }
  return value ?? null;
}

/**
 * Produces a deterministic SHA-256 hex digest over the entry's meaningful fields
 * and the previousHash that links it to the prior entry. Object keys are sorted
 * recursively so DB-stored and file-stored entries produce the same hash.
 */
export function computeEntryHash(
  entry: Omit<AuditEntry, "entryHash"> & { previousHash: string }
): string {
  const input = {
    id: entry.id,
    timestamp: entry.timestamp,
    action: entry.action,
    decision: entry.decision,
    explanation: entry.explanation,
    triggeredPolicies: entry.triggeredPolicies,
    riskFindings: entry.riskFindings,
    stellarTxHash: entry.stellarTxHash ?? null,
    previousHash: entry.previousHash,
  };

  return createHash("sha256")
    .update(JSON.stringify(canonicalize(input)), "utf8")
    .digest("hex");
}

export type ChainVerificationResult =
  | { valid: true; checkedCount: number; legacyCount: number }
  | {
      valid: false;
      reason: string;
      entryId?: string;
      index?: number;
      checkedCount: number;
      legacyCount: number;
    };

/**
 * Verifies the integrity of an audit hash chain.
 *
 * Entries are sorted chronologically before verification so the caller does not
 * need to pre-sort. Entries without entryHash/previousHash are treated as
 * legacy (pre-chain) entries and skipped gracefully without breaking the
 * verification of newer hashed entries.
 *
 * Returns { valid: false } when:
 *  - a hashed entry's previousHash does not match the prior hashed entry's hash
 *    (detects reordering or deletion)
 *  - a hashed entry's entryHash does not match a fresh recomputation
 *    (detects field modification)
 */
export function verifyHashChain(entries: AuditEntry[]): ChainVerificationResult {
  const sorted = [...entries].sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0
  );

  let expectedPreviousHash = GENESIS_HASH;
  let checkedCount = 0;
  let legacyCount = 0;

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i]!;

    if (!entry.entryHash || !entry.previousHash) {
      legacyCount++;
      continue;
    }

    if (entry.previousHash !== expectedPreviousHash) {
      return {
        valid: false,
        reason:
          "previousHash mismatch — entry may be reordered or a prior entry was deleted",
        entryId: entry.id,
        index: i,
        checkedCount,
        legacyCount,
      };
    }

    const recomputed = computeEntryHash({ ...entry, previousHash: entry.previousHash });
    if (entry.entryHash !== recomputed) {
      return {
        valid: false,
        reason: "entryHash mismatch — entry content may have been modified",
        entryId: entry.id,
        index: i,
        checkedCount,
        legacyCount,
      };
    }

    expectedPreviousHash = entry.entryHash;
    checkedCount++;
  }

  return { valid: true, checkedCount, legacyCount };
}
