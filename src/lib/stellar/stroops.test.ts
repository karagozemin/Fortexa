import { describe, expect, it } from "vitest";

import {
  parseXlmNumberToStroops,
  parseXlmToStroops,
  stroopsToXlmString,
  STROOPS_PER_XLM,
  toNearestStroops,
} from "@/lib/stellar/stroops";

function stroopsOf(value: string): bigint {
  const parsed = parseXlmToStroops(value);
  if (!parsed.ok) {
    throw new Error(`expected ${value} to parse, got ${parsed.code}`);
  }
  return parsed.stroops;
}

describe("parseXlmToStroops", () => {
  it("reads whole and fractional amounts exactly", () => {
    expect(stroopsOf("1")).toBe(10_000_000n);
    expect(stroopsOf("0.1")).toBe(1_000_000n);
    expect(stroopsOf("0.0000001")).toBe(1n);
    expect(stroopsOf("123.4567891")).toBe(1_234_567_891n);
  });

  it("does not lose precision on values a double cannot hold", () => {
    // 0.1 and 0.2 are both inexact in binary floating point; their stroop
    // counts are not.
    expect(stroopsOf("0.1") + stroopsOf("0.2")).toBe(stroopsOf("0.3"));
    expect(stroopsOf("1.1") + stroopsOf("2.2")).toBe(stroopsOf("3.3"));
  });

  it("rejects amounts finer than one stroop", () => {
    expect(parseXlmToStroops("0.00000001")).toEqual({ ok: false, code: "excess_precision" });
    expect(parseXlmToStroops("1.12345678")).toEqual({ ok: false, code: "excess_precision" });
  });

  it("treats trailing zeros as exact, not as excess precision", () => {
    // "1.50000000" writes eight decimals but names a value that is exactly
    // 15,000,000 stroops, which Stellar itself accepts.
    expect(stroopsOf("1.50000000")).toBe(15_000_000n);
    expect(stroopsOf("2.00000000000")).toBe(20_000_000n);
  });

  it("reads exponent notation exactly", () => {
    expect(stroopsOf("1e-7")).toBe(1n);
    expect(stroopsOf("1.5e2")).toBe(1_500_000_000n);
    expect(parseXlmToStroops("1e-8")).toEqual({ ok: false, code: "excess_precision" });
  });

  it("rejects negatives and non-decimal input", () => {
    expect(parseXlmToStroops("-1")).toEqual({ ok: false, code: "negative" });
    expect(parseXlmToStroops("")).toEqual({ ok: false, code: "not_a_decimal" });
    expect(parseXlmToStroops(".5")).toEqual({ ok: false, code: "not_a_decimal" });
    expect(parseXlmToStroops("abc")).toEqual({ ok: false, code: "not_a_decimal" });
    expect(parseXlmToStroops("1,5")).toEqual({ ok: false, code: "not_a_decimal" });
  });

  it("holds large values without drift", () => {
    // Beyond 2^53 stroops, where a double can no longer count individual units.
    const huge = stroopsOf("1000000000.0000001");
    expect(huge).toBe(10_000_000_000_000_001n);
    expect(huge - 1n).toBe(stroopsOf("1000000000"));
    expect(stroopsToXlmString(huge)).toBe("1000000000.0000001");
  });
});

describe("parseXlmNumberToStroops", () => {
  it("reads a double through its shortest decimal form", () => {
    expect(parseXlmNumberToStroops(0.1)).toEqual({ ok: true, stroops: 1_000_000n });
    expect(parseXlmNumberToStroops(25)).toEqual({ ok: true, stroops: 250_000_000n });
  });

  it("refuses a double that does not land on a stroop", () => {
    // 0.1 + 0.2 === 0.30000000000000004, an amount nobody chose.
    expect(parseXlmNumberToStroops(0.1 + 0.2)).toEqual({
      ok: false,
      code: "excess_precision",
    });
  });

  it("refuses non-finite values", () => {
    expect(parseXlmNumberToStroops(Number.NaN)).toEqual({ ok: false, code: "not_finite" });
    expect(parseXlmNumberToStroops(Number.POSITIVE_INFINITY)).toEqual({
      ok: false,
      code: "not_finite",
    });
  });
});

describe("toNearestStroops", () => {
  it("keeps exact values exact", () => {
    expect(toNearestStroops(0.1)).toBe(1_000_000n);
    expect(toNearestStroops(120)).toBe(1_200_000_000n);
  });

  it("rounds drifted values to the nearest stroop", () => {
    expect(toNearestStroops(0.1 + 0.2)).toBe(3_000_000n);
    expect(toNearestStroops(1.1 + 2.2)).toBe(33_000_000n);
  });

  it("rounds halves away from zero", () => {
    expect(toNearestStroops(0.00000005)).toBe(1n);
    expect(toNearestStroops(0.00000004)).toBe(0n);
  });
});

describe("stroopsToXlmString", () => {
  it("always renders seven decimals", () => {
    expect(stroopsToXlmString(0n)).toBe("0.0000000");
    expect(stroopsToXlmString(1n)).toBe("0.0000001");
    expect(stroopsToXlmString(STROOPS_PER_XLM)).toBe("1.0000000");
    expect(stroopsToXlmString(1_234_567_891n)).toBe("123.4567891");
  });

  it("round-trips through parsing", () => {
    for (const value of ["0.0000001", "1.0000000", "99999.9999999", "100000.0000000"]) {
      expect(stroopsToXlmString(stroopsOf(value))).toBe(value);
    }
  });
});
