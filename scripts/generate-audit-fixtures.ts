import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { computeEntryHash, GENESIS_HASH } from "../src/lib/audit/hash-chain";
import type { AuditEntry, AgentAction } from "../src/lib/types/domain";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, "fixtures");

function makeAction(id: string): AgentAction {
  return {
    id,
    name: "pay",
    kind: "api_payment",
    target: "GDEST3XZHS7SQCD3NELG6AV47BPUOZCTBM2TKEGP5LYELXQHEBSCCZ",
    domain: "stellar.org",
    amountXLM: 10,
  };
}

function buildChain(count: number): AuditEntry[] {
  const entries: AuditEntry[] = [];
  let previousHash = GENESIS_HASH;
  for (let i = 0; i < count; i++) {
    const base = {
      id: `entry-${i + 1}`,
      timestamp: `2024-01-01T00:0${i}:00.000Z`,
      action: makeAction(`action-${i + 1}`),
      decision: "APPROVE" as const,
      explanation: "Within policy limits",
      triggeredPolicies: [] as string[],
      riskFindings: [] as string[],
    };
    const entryHash = computeEntryHash({ ...base, previousHash });
    entries.push({ ...base, previousHash, entryHash });
    previousHash = entryHash;
  }
  return entries;
}

function write(name: string, data: unknown): void {
  writeFileSync(resolve(FIXTURES_DIR, name), JSON.stringify(data, null, 2) + "\n");
  console.log(`  wrote ${name}`);
}

mkdirSync(FIXTURES_DIR, { recursive: true });
console.log(`Writing fixtures to ${FIXTURES_DIR} ...`);

const chain = buildChain(3);

write("valid-chain.json", chain);
write("valid-mine-export.json", { scope: "mine", entries: buildChain(2) });
write("valid-all-export.json", {
  scope: "all",
  entriesByUser: { "user-a": buildChain(2), "user-b": buildChain(1) },
});
write("tampered-field.json", chain.map((e, i) =>
  i === 1 ? { ...e, explanation: "tampered explanation" } : e
));
write("deleted-entry.json", [chain[0]!, chain[2]!]);
write("reordered-entries.json", [
  chain[0]!,
  { ...chain[1]!, timestamp: chain[2]!.timestamp },
  { ...chain[2]!, timestamp: chain[1]!.timestamp },
]);

console.log("Done.");