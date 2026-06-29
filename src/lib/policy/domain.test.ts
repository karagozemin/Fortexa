import { describe, expect, it } from "vitest";
import { normalizeDomain } from "@/lib/policy/domain";

describe("normalizeDomain", () => {
  it("trims whitespace", () => {
    expect(normalizeDomain("  example.com  ")).toBe("example.com");
    expect(normalizeDomain("\texample.com\n")).toBe("example.com");
  });

  it("converts to lowercase", () => {
    expect(normalizeDomain("EXAMPLE.COM")).toBe("example.com");
    expect(normalizeDomain("ExAmPlE.cOm")).toBe("example.com");
  });

  it("removes trailing dots", () => {
    expect(normalizeDomain("example.com.")).toBe("example.com");
    expect(normalizeDomain("example.com..")).toBe("example.com");
  });

  it("extracts host from URL-like inputs", () => {
    expect(normalizeDomain("https://example.com")).toBe("example.com");
    expect(normalizeDomain("http://example.com/path?query=1")).toBe("example.com");
    expect(normalizeDomain("wss://example.com")).toBe("example.com");
    expect(normalizeDomain("https://sub.example.com/api")).toBe("sub.example.com");
  });

  it("handles valid domains", () => {
    expect(normalizeDomain("example.com")).toBe("example.com");
    expect(normalizeDomain("sub.example.com")).toBe("sub.example.com");
    expect(normalizeDomain("localhost")).toBe("localhost");
    expect(normalizeDomain("my-domain.org")).toBe("my-domain.org");
  });

  it("returns null for malformed domains", () => {
    expect(normalizeDomain("example .com")).toBeNull();
    expect(normalizeDomain("-example.com")).toBeNull();
    expect(normalizeDomain("example.com-")).toBeNull();
    expect(normalizeDomain("https://")).toBeNull();
    expect(normalizeDomain("!@#$%")).toBeNull();
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain(undefined as any)).toBeNull();
    expect(normalizeDomain(null as any)).toBeNull();
  });
});
