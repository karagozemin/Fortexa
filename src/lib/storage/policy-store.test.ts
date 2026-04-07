import { describe, expect, it } from "vitest";

import { getPolicyConfig, getPolicyHistory, rollbackPolicyVersion, updatePolicyConfig } from "@/lib/storage/policy-store";

describe("policy store versioning", () => {
  it("increments version and supports rollback", async () => {
    const current = await getPolicyConfig();

    const updated = await updatePolicyConfig(
      {
        ...current.policy,
        perTxCapXLM: current.policy.perTxCapXLM + 1,
      },
      "policy-store-test"
    );

    expect(updated.version).toBeGreaterThan(current.version);

    const history = await getPolicyHistory(5);
    expect(history.length).toBeGreaterThan(0);

    const rollback = await rollbackPolicyVersion(current.version, "policy-store-test-rollback");
    expect(rollback.policy.perTxCapXLM).toBe(current.policy.perTxCapXLM);
  });
});
