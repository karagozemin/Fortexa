import { Networks } from "@stellar/stellar-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  inferStellarNetworkProfile,
  resolveStellarNetworkConfig,
} from "@/lib/stellar/network-config";

const ENV_KEYS = ["STELLAR_HORIZON_URL", "STELLAR_NETWORK_PASSPHRASE"] as const;

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

describe("resolveStellarNetworkConfig", () => {
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    envSnapshot = saveEnv();
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("accepts testnet Horizon with the default testnet passphrase", () => {
    process.env.STELLAR_HORIZON_URL = "https://horizon-testnet.stellar.org";
    delete process.env.STELLAR_NETWORK_PASSPHRASE;

    const config = resolveStellarNetworkConfig();
    expect(config.ok).toBe(true);
    if (config.ok) {
      expect(config.profile).toBe("testnet");
      expect(config.networkPassphrase).toBe(Networks.TESTNET);
    }
  });

  it("accepts public Horizon with the public passphrase", () => {
    process.env.STELLAR_HORIZON_URL = "https://horizon.stellar.org";
    process.env.STELLAR_NETWORK_PASSPHRASE = Networks.PUBLIC;

    const config = resolveStellarNetworkConfig();
    expect(config.ok).toBe(true);
    if (config.ok) {
      expect(config.profile).toBe("public");
      expect(config.networkPassphrase).toBe(Networks.PUBLIC);
    }
  });

  it("rejects testnet Horizon with the public passphrase", () => {
    process.env.STELLAR_HORIZON_URL = "https://horizon-testnet.stellar.org";
    process.env.STELLAR_NETWORK_PASSPHRASE = Networks.PUBLIC;

    const config = resolveStellarNetworkConfig();
    expect(config.ok).toBe(false);
    if (!config.ok) {
      expect(config.error).toContain("STELLAR_HORIZON_URL");
      expect(config.error).toContain("STELLAR_NETWORK_PASSPHRASE");
    }
  });

  it("rejects public Horizon with the testnet passphrase", () => {
    process.env.STELLAR_HORIZON_URL = "https://horizon.stellar.org";
    process.env.STELLAR_NETWORK_PASSPHRASE = Networks.TESTNET;

    const config = resolveStellarNetworkConfig();
    expect(config.ok).toBe(false);
    if (!config.ok) {
      expect(config.error).toContain("public/mainnet");
      expect(config.error).toContain("STELLAR_NETWORK_PASSPHRASE");
    }
  });

  it("allows custom/local Horizon overrides with an explicit passphrase", () => {
    process.env.STELLAR_HORIZON_URL = "https://horizon-mock.test";
    process.env.STELLAR_NETWORK_PASSPHRASE = Networks.TESTNET;

    expect(inferStellarNetworkProfile(process.env.STELLAR_HORIZON_URL)).toBe("custom");
    const config = resolveStellarNetworkConfig();
    expect(config.ok).toBe(true);
    if (config.ok) {
      expect(config.profile).toBe("custom");
      expect(config.networkPassphrase).toBe(Networks.TESTNET);
    }
  });
});
