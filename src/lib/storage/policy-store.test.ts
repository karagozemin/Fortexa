import { describe, expect, it } from "vitest";

import {
  PolicyVersionConflict,
  getPolicyConfig,
  getPolicyHistory,
  rollbackPolicyVersion,
  updatePolicyConfig,
} from "@/lib/storage/policy-store";

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

  it("rejects stale saves and surfaces current version metadata via PolicyVersionConflict", async () => {
    const current = await getPolicyConfig();
    const baselineVersion = current.version;

    // Bump the version once so the next read shows a newer "current".
    await updatePolicyConfig(
      {
        ...current.policy,
        perTxCapXLM: current.policy.perTxCapXLM + 7,
      },
      "policy-store-conflict-setup",
    );

    const refreshed = await getPolicyConfig();
    expect(refreshed.version).toBeGreaterThan(baselineVersion);

    let captured: unknown = null;
    try {
      await updatePolicyConfig(
        {
          ...current.policy,
          perTxCapXLM: 1234,
        },
        "policy-store-conflict-attempt",
        { expectedVersion: baselineVersion },
      );
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(PolicyVersionConflict);
    const conflict = captured as PolicyVersionConflict;
    expect(conflict.expectedVersion).toBe(baselineVersion);
    expect(conflict.currentVersion).toBe(refreshed.version);
    expect(typeof conflict.currentUpdatedAt).toBe("string");
  });

  it("allows saves with matching expectedVersion to proceed and toggles history correctly", async () => {
    const current = await getPolicyConfig();
    const startVersion = current.version;
    const initialHistoryCount = (await getPolicyHistory(100)).length;

    const updated = await updatePolicyConfig(
      {
        ...current.policy,
        perTxCapXLM: current.policy.perTxCapXLM + 3,
      },
      "policy-store-conflict-matching",
      { expectedVersion: startVersion },
    );

    expect(updated.version).toBe(startVersion + 1);

    const afterHistory = await getPolicyHistory(100);
    expect(afterHistory.length).toBe(initialHistoryCount + 1);
  });

  it("saves that conflict do NOT pollute the version history (rejection observed, history unchanged)", async () => {
    const baseline = await getPolicyConfig();
    const historyBefore = (await getPolicyHistory(100)).length;

    await updatePolicyConfig(
      {
        ...baseline.policy,
        perTxCapXLM: baseline.policy.perTxCapXLM + 11,
      },
      "policy-store-conflict-bump",
    );

    const nowVersion = (await getPolicyConfig()).version;

    await expect(
      updatePolicyConfig(
        { ...baseline.policy, perTxCapXLM: 999_999 },
        "policy-store-conflict-loser",
        { expectedVersion: baseline.version },
      ),
    ).rejects.toBeInstanceOf(PolicyVersionConflict);

    const historyAfter = await getPolicyHistory(100);
    // +1 from the legitimate bump, no extra row for the rejected attempt.
    expect(historyAfter.length).toBe(historyBefore + 1);
    expect((await getPolicyConfig()).version).toBe(nowVersion);
  });
});
