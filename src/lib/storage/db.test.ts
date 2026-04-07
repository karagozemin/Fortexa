import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, endMock, poolCtorMock } = vi.hoisted(() => {
  const query = vi.fn();
  const end = vi.fn().mockResolvedValue(undefined);
  const ctor = vi.fn(function MockPool() {
    return {
      query,
      end,
    };
  });

  return {
    queryMock: query,
    endMock: end,
    poolCtorMock: ctor,
  };
});

vi.mock("pg", () => ({
  Pool: poolCtorMock,
}));

import { __resetDatabaseForTests, runWithDatabase } from "@/lib/storage/db";

describe("db storage helper", () => {
  beforeEach(async () => {
    queryMock.mockReset();
    endMock.mockClear();
    poolCtorMock.mockClear();
    delete process.env.DATABASE_URL;
    await __resetDatabaseForTests();
  });

  it("returns unavailable when DATABASE_URL is absent", async () => {
    const result = await runWithDatabase("no-db", async () => "ok");
    expect(result.available).toBe(false);
    expect(poolCtorMock).not.toHaveBeenCalled();
  });

  it("runs migrations before action when DB is configured", async () => {
    process.env.DATABASE_URL = "postgres://fortexa:test@localhost:5432/fortexa";

    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id") && sql.includes("fortexa_schema_migrations")) {
        return { rows: [] };
      }

      return { rows: [] };
    });

    const result = await runWithDatabase("with-db", async () => 123);

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.value).toBe(123);
    }

    expect(
      queryMock.mock.calls.some(
        (call) => typeof call[0] === "string" && call[0].includes("fortexa_schema_migrations")
      )
    ).toBe(true);

    expect(
      queryMock.mock.calls.some(
        (call) => typeof call[0] === "string" && call[0].includes("CREATE TABLE IF NOT EXISTS fortexa_wallets")
      )
    ).toBe(true);
  });
});
