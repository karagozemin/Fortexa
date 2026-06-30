import type { PolicyConfig } from "@/lib/types/domain";

export type DiffChangeType = "added" | "removed" | "modified" | "unchanged";

export interface DiffChange {
  type: DiffChangeType;
  path: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface PolicyDiff {
  changes: DiffChange[];
  hasChanges: boolean;
  summary: {
    added: number;
    removed: number;
    modified: number;
  };
}

/**
 * Generate a human-readable diff between two policies.
 * Returns detailed changes organized by field.
 */
export function generatePolicyDiff(
  oldPolicy: PolicyConfig,
  newPolicy: PolicyConfig
): PolicyDiff {
  const changes: DiffChange[] = [];

  // Compare numeric fields
  const numericFields: (keyof PolicyConfig)[] = [
    "perTxCapXLM",
    "dailyCapXLM",
    "maxToolCallsPerDay",
    "riskThreshold",
  ];

  for (const field of numericFields) {
    const oldValue = oldPolicy[field];
    const newValue = newPolicy[field];

    if (oldValue !== newValue) {
      changes.push({
        type: "modified",
        path: field,
        oldValue,
        newValue,
      });
    }
  }

  // Compare allowed hours
  const oldHours = oldPolicy.allowedHours;
  const newHours = newPolicy.allowedHours;

  if (
    oldHours?.start !== newHours?.start ||
    oldHours?.end !== newHours?.end
  ) {
    changes.push({
      type: "modified",
      path: "allowedHours",
      oldValue: oldHours,
      newValue: newHours,
    });
  }

  // Compare array fields
  const arrayFields: (keyof PolicyConfig)[] = [
    "allowedDomains",
    "blockedDomains",
    "allowedTools",
    "blockedTools",
  ];

  for (const field of arrayFields) {
    const oldArray = (oldPolicy[field] as string[]) || [];
    const newArray = (newPolicy[field] as string[]) || [];

    const oldSet = new Set(oldArray);
    const newSet = new Set(newArray);

    // Check for additions
    for (const item of newArray) {
      if (!oldSet.has(item)) {
        changes.push({
          type: "added",
          path: `${field}[${item}]`,
          newValue: item,
        });
      }
    }

    // Check for removals
    for (const item of oldArray) {
      if (!newSet.has(item)) {
        changes.push({
          type: "removed",
          path: `${field}[${item}]`,
          oldValue: item,
        });
      }
    }
  }

  const summary = {
    added: changes.filter((c) => c.type === "added").length,
    removed: changes.filter((c) => c.type === "removed").length,
    modified: changes.filter((c) => c.type === "modified").length,
  };

  return {
    changes,
    hasChanges: changes.length > 0,
    summary,
  };
}

/**
 * Format a diff change into a human-readable string.
 */
export function formatDiffChange(change: DiffChange): string {
  switch (change.type) {
    case "added":
      return `➕ Added to ${change.path}: ${change.newValue}`;
    case "removed":
      return `➖ Removed from ${change.path}: ${change.oldValue}`;
    case "modified":
      return `🔄 Changed ${change.path}: ${change.oldValue} → ${change.newValue}`;
    case "unchanged":
      return `✓ No change to ${change.path}`;
  }
}

/**
 * Group diff changes by category for UI display.
 */
export function groupDiffChanges(diff: PolicyDiff): Record<string, DiffChange[]> {
  const grouped: Record<string, DiffChange[]> = {
    "Caps & Thresholds": [],
    "Allowed Domains": [],
    "Blocked Domains": [],
    "Allowed Tools": [],
    "Blocked Tools": [],
    Other: [],
  };

  for (const change of diff.changes) {
    if (
      change.path === "perTxCapXLM" ||
      change.path === "dailyCapXLM" ||
      change.path === "maxToolCallsPerDay" ||
      change.path === "riskThreshold" ||
      change.path === "allowedHours"
    ) {
      grouped["Caps & Thresholds"].push(change);
    } else if (change.path.startsWith("allowedDomains")) {
      grouped["Allowed Domains"].push(change);
    } else if (change.path.startsWith("blockedDomains")) {
      grouped["Blocked Domains"].push(change);
    } else if (change.path.startsWith("allowedTools")) {
      grouped["Allowed Tools"].push(change);
    } else if (change.path.startsWith("blockedTools")) {
      grouped["Blocked Tools"].push(change);
    } else {
      grouped["Other"].push(change);
    }
  }

  // Remove empty categories
  return Object.fromEntries(
    Object.entries(grouped).filter(([, changes]) => changes.length > 0)
  );
}
