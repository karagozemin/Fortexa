import { afterEach, describe, expect, it } from "vitest";

import {
  getRequestTimestampSkewConfig,
  validateRequestTimestamp,
} from "@/lib/stellar/request-timestamp-skew";

const NOW = Date.parse("2026-01-01T00:00:00.000Z");

describe("validateRequestTimestamp", () => {
  afterEach(() => {
    delete process.env.FORTEXA_REQUEST_TIMESTAMP_MAX_PAST_SKEW_SECONDS;
    delete process.env.FORTEXA_REQUEST_TIMESTAMP_MAX_FUTURE_SKEW_SECONDS;
  });

  describe("valid timestamps", () => {
    it("accepts the current timestamp", () => {
      const result = validateRequestTimestamp(NOW, { nowMs: NOW });
      expect(result.ok).toBe(true);
    });

    it("accepts a timestamp comfortably within the past window", () => {
      const result = validateRequestTimestamp(NOW - 10_000, {
        nowMs: NOW,
        maxPastSkewSeconds: 60,
      });
      expect(result.ok).toBe(true);
    });

    it("accepts a timestamp comfortably within the future window", () => {
      const result = validateRequestTimestamp(NOW + 5_000, {
        nowMs: NOW,
        maxFutureSkewSeconds: 30,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("stale timestamps", () => {
    it("rejects a timestamp one millisecond past the max-past boundary", () => {
      const result = validateRequestTimestamp(NOW - 60_001, {
        nowMs: NOW,
        maxPastSkewSeconds: 60,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("stale");
        expect(result.skewMs).toBe(60_001);
        expect(result.maxAllowedMs).toBe(60_000);
      }
    });

    it("rejects a timestamp far in the past", () => {
      const result = validateRequestTimestamp(NOW - 10 * 60_000, {
        nowMs: NOW,
        maxPastSkewSeconds: 60,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("stale");
      }
    });
  });

  describe("future timestamps", () => {
    it("rejects a timestamp one millisecond past the max-future boundary", () => {
      const result = validateRequestTimestamp(NOW + 30_001, {
        nowMs: NOW,
        maxFutureSkewSeconds: 30,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("future");
        expect(result.skewMs).toBe(30_001);
        expect(result.maxAllowedMs).toBe(30_000);
      }
    });

    it("rejects a timestamp implausibly far in the future", () => {
      const result = validateRequestTimestamp(NOW + 60 * 60_000, {
        nowMs: NOW,
        maxFutureSkewSeconds: 30,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("future");
      }
    });
  });

  describe("boundary behavior (inclusive at both edges)", () => {
    it("accepts a timestamp exactly at the max-past boundary", () => {
      const result = validateRequestTimestamp(NOW - 60_000, {
        nowMs: NOW,
        maxPastSkewSeconds: 60,
      });
      expect(result.ok).toBe(true);
    });

    it("accepts a timestamp exactly at the max-future boundary", () => {
      const result = validateRequestTimestamp(NOW + 30_000, {
        nowMs: NOW,
        maxFutureSkewSeconds: 30,
      });
      expect(result.ok).toBe(true);
    });

    it("rejects one millisecond outside the max-past boundary but accepts one millisecond inside it", () => {
      const justOutside = validateRequestTimestamp(NOW - 60_001, {
        nowMs: NOW,
        maxPastSkewSeconds: 60,
      });
      const justInside = validateRequestTimestamp(NOW - 59_999, {
        nowMs: NOW,
        maxPastSkewSeconds: 60,
      });

      expect(justOutside.ok).toBe(false);
      expect(justInside.ok).toBe(true);
    });

    it("rejects one millisecond outside the max-future boundary but accepts one millisecond inside it", () => {
      const justOutside = validateRequestTimestamp(NOW + 30_001, {
        nowMs: NOW,
        maxFutureSkewSeconds: 30,
      });
      const justInside = validateRequestTimestamp(NOW + 29_999, {
        nowMs: NOW,
        maxFutureSkewSeconds: 30,
      });

      expect(justOutside.ok).toBe(false);
      expect(justInside.ok).toBe(true);
    });
  });

  describe("invalid input", () => {
    it("rejects a non-finite timestamp", () => {
      const result = validateRequestTimestamp(Number.NaN, { nowMs: NOW });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("invalid");
      }
    });

    it("rejects an infinite timestamp", () => {
      const result = validateRequestTimestamp(Number.POSITIVE_INFINITY, { nowMs: NOW });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("invalid");
      }
    });
  });

  describe("configurable window", () => {
    it("uses the configured maxPastSkewSeconds/maxFutureSkewSeconds env vars when no override is passed", () => {
      process.env.FORTEXA_REQUEST_TIMESTAMP_MAX_PAST_SKEW_SECONDS = "5";
      process.env.FORTEXA_REQUEST_TIMESTAMP_MAX_FUTURE_SKEW_SECONDS = "2";

      expect(validateRequestTimestamp(NOW - 5_000, { nowMs: NOW }).ok).toBe(true);
      expect(validateRequestTimestamp(NOW - 5_001, { nowMs: NOW }).ok).toBe(false);
      expect(validateRequestTimestamp(NOW + 2_000, { nowMs: NOW }).ok).toBe(true);
      expect(validateRequestTimestamp(NOW + 2_001, { nowMs: NOW }).ok).toBe(false);
    });

    it("an explicit per-call override takes priority over the env-configured window", () => {
      process.env.FORTEXA_REQUEST_TIMESTAMP_MAX_PAST_SKEW_SECONDS = "5";

      const result = validateRequestTimestamp(NOW - 10_000, {
        nowMs: NOW,
        maxPastSkewSeconds: 60,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("getRequestTimestampSkewConfig", () => {
    it("returns the documented defaults when nothing is configured", () => {
      expect(getRequestTimestampSkewConfig()).toEqual({
        maxPastSkewSeconds: 60,
        maxFutureSkewSeconds: 30,
      });
    });

    it("falls back to the default when an env var is non-numeric", () => {
      process.env.FORTEXA_REQUEST_TIMESTAMP_MAX_PAST_SKEW_SECONDS = "not-a-number";
      expect(getRequestTimestampSkewConfig().maxPastSkewSeconds).toBe(60);
    });

    it("falls back to the default when an env var is zero or negative", () => {
      process.env.FORTEXA_REQUEST_TIMESTAMP_MAX_FUTURE_SKEW_SECONDS = "0";
      expect(getRequestTimestampSkewConfig().maxFutureSkewSeconds).toBe(30);

      process.env.FORTEXA_REQUEST_TIMESTAMP_MAX_FUTURE_SKEW_SECONDS = "-10";
      expect(getRequestTimestampSkewConfig().maxFutureSkewSeconds).toBe(30);
    });

    it("truncates a fractional env value down to whole seconds", () => {
      process.env.FORTEXA_REQUEST_TIMESTAMP_MAX_PAST_SKEW_SECONDS = "45.9";
      expect(getRequestTimestampSkewConfig().maxPastSkewSeconds).toBe(45);
    });
  });
});
