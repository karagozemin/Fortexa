import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSelfChecks } from "@/lib/config/self-check";

const ENV_KEYS = [
  "STELLAR_HORIZON_URL",
  "STELLAR_NETWORK_PASSPHRASE",
  "NEXT_PUBLIC_STELLAR_EXPLORER_URL",
  "NEXT_PUBLIC_COORDINATOR_URL",
  "NEXT_PUBLIC_CONTRACT_IDS",
  "NEXT_PUBLIC_STELLAR_DESTINATION",
] as const;

function saveEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
}

describe("runSelfChecks", () => {
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    envSnapshot = saveEnv();
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("returns pass for default testnet configuration", () => {
    process.env.STELLAR_HORIZON_URL = "https://horizon-testnet.stellar.org";
    delete process.env.STELLAR_NETWORK_PASSPHRASE;

    const checks = runSelfChecks(false);
    const ids = checks.map((c) => c.id);

    expect(ids).toContain("network-mode");
    expect(ids).toContain("horizon-url");
    expect(ids).toContain("passphrase-consistency");
    expect(ids).toContain("explorer-url");
    expect(ids).toContain("mainnet-flag");
    expect(ids).toContain("placeholder-values");
    expect(ids).toContain("coordinator-url");
    expect(ids).toContain("contract-ids");

    const modeCheck = checks.find((c) => c.id === "network-mode");
    expect(modeCheck?.status).toBe("pass");

    const horizonCheck = checks.find((c) => c.id === "horizon-url");
    expect(horizonCheck?.status).toBe("pass");

    const passphraseCheck = checks.find((c) => c.id === "passphrase-consistency");
    expect(passphraseCheck?.status).toBe("pass");

    const mainnetCheck = checks.find((c) => c.id === "mainnet-flag");
    expect(mainnetCheck?.status).toBe("pass");
  });

  it("flags public/mainnet as warn on network-mode", () => {
    process.env.STELLAR_HORIZON_URL = "https://horizon.stellar.org";
    process.env.STELLAR_NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";

    const checks = runSelfChecks(false);
    const modeCheck = checks.find((c) => c.id === "network-mode");
    expect(modeCheck?.status).toBe("warn");
    expect(modeCheck?.detail).toBe("Public / mainnet");

    const mainnetCheck = checks.find((c) => c.id === "mainnet-flag");
    expect(mainnetCheck?.status).toBe("warn");
  });

  it("fails passphrase consistency when testnet URL uses public passphrase", () => {
    process.env.STELLAR_HORIZON_URL = "https://horizon-testnet.stellar.org";
    process.env.STELLAR_NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";

    const checks = runSelfChecks(false);
    const passphraseCheck = checks.find((c) => c.id === "passphrase-consistency");
    expect(passphraseCheck?.status).toBe("fail");
  });

  it("warns missing horizon URL", () => {
    delete process.env.STELLAR_HORIZON_URL;

    const checks = runSelfChecks(false);
    const horizonCheck = checks.find((c) => c.id === "horizon-url");
    expect(horizonCheck?.status).toBe("fail");
  });

  it("detects placeholder values in public env and fails in production", () => {
    process.env.NEXT_PUBLIC_STELLAR_DESTINATION = "your-destination-key";

    const devChecks = runSelfChecks(false);
    const devPlaceholder = devChecks.find((c) => c.id === "placeholder-values");
    expect(devPlaceholder?.status).toBe("warn");

    const prodChecks = runSelfChecks(true);
    const prodPlaceholder = prodChecks.find((c) => c.id === "placeholder-values");
    expect(prodPlaceholder?.status).toBe("fail");
  });

  it("passes placeholder check when no placeholders are present", () => {
    delete process.env.NEXT_PUBLIC_STELLAR_DESTINATION;

    const checks = runSelfChecks(true);
    const placeholderCheck = checks.find((c) => c.id === "placeholder-values");
    expect(placeholderCheck?.status).toBe("pass");
  });

  it("reflects configured coordinator URL when set", () => {
    process.env.NEXT_PUBLIC_COORDINATOR_URL = "https://coordinator.example.com";

    const checks = runSelfChecks(false);
    const coordinatorCheck = checks.find((c) => c.id === "coordinator-url");
    expect(coordinatorCheck?.status).toBe("pass");
    expect(coordinatorCheck?.detail).toBe("https://coordinator.example.com");
  });

  it("reflects configured contract IDs when set", () => {
    process.env.NEXT_PUBLIC_CONTRACT_IDS = "CAAAA... BBBBB...";

    const checks = runSelfChecks(false);
    const contractCheck = checks.find((c) => c.id === "contract-ids");
    expect(contractCheck?.status).toBe("pass");
  });

  it("reflects explorer URL when set", () => {
    process.env.NEXT_PUBLIC_STELLAR_EXPLORER_URL = "https://stellar.expert/explorer/testnet";

    const checks = runSelfChecks(false);
    const explorerCheck = checks.find((c) => c.id === "explorer-url");
    expect(explorerCheck?.status).toBe("pass");
    expect(explorerCheck?.detail).toBe("https://stellar.expert/explorer/testnet");
  });
});
