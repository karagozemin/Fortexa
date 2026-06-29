import { describe, it, expect } from "vitest";
import { truncateMiddle } from "@/lib/utils/format";

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
