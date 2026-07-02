import { describe, it, expect } from "vitest";
import { truncateMiddle, formatNumber, formatCurrency, formatPct } from "@/lib/utils/format";

describe("truncateMiddle", () => {
  it("returns value unchanged when short enough", () => {
    expect(truncateMiddle("GABC1234")).toBe("GABC1234");
  });

  it("returns value unchanged at exact threshold", () => {
    expect(truncateMiddle("GABCDEF123456", 6, 6)).toBe("GABCDEF123456");
  });

  it("truncates when longer than threshold", () => {
    expect(truncateMiddle("GABCDEF1234567890", 6, 6)).toBe("GABCDE...567890");
  });

  it("preserves prefix and suffix for a normal stellar key", () => {
    const key = "GDEVXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    const result = truncateMiddle(key, 8, 8);
    expect(result).toBe("GDEVXXXX...XXXXXXXX");
    expect(result.startsWith("GDEV")).toBe(true);
    expect(result.endsWith("XXXXXXXX")).toBe(true);
  });

  it("returns empty string unchanged", () => {
    expect(truncateMiddle("")).toBe("");
  });

  it("uses custom left and right values", () => {
    expect(truncateMiddle("ABCDEFGHIJKLMNOP", 4, 4)).toBe("ABCD...MNOP");
  });
});

describe("formatNumber", () => {
  it("formats normal values correctly", () => {
    expect(formatNumber(1234.56)).toBe("1,234.56");
    expect(formatNumber(1000)).toBe("1,000");
  });

  it("handles zero correctly", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("handles edge cases and non-finite inputs", () => {
    expect(formatNumber(NaN)).toBe("0");
    expect(formatNumber(Infinity)).toBe("0");
    expect(formatNumber(-Infinity)).toBe("0");
  });

  it("respects decimal configuration", () => {
    expect(formatNumber(1.234, 1, 1)).toBe("1.2");
  });
});

describe("formatCurrency", () => {
  it("formats standard amounts", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });

  it("handles zero correctly", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("handles edge cases and non-finite inputs", () => {
    expect(formatCurrency(NaN)).toBe("$0.00");
    expect(formatCurrency(Infinity)).toBe("$0.00");
  });

  it("supports alternate currencies", () => {
    // Note: Node's Intl support may vary, but basic EUR symbol should work
    const eur = formatCurrency(100, "EUR");
    expect(eur.includes("100.00")).toBe(true);
    expect(eur.includes("€")).toBe(true);
  });
});

describe("formatPct", () => {
  it("formats normal values correctly", () => {
    expect(formatPct(0.1234)).toBe("12.34%");
    expect(formatPct(1)).toBe("100.00%");
  });

  it("handles zero correctly", () => {
    expect(formatPct(0)).toBe("0.00%");
  });

  it("handles edge cases and non-finite inputs", () => {
    expect(formatPct(NaN)).toBe("0.00%");
    expect(formatPct(Infinity)).toBe("0.00%");
  });
});
