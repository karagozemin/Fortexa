import { runWithDatabase } from "../src/lib/storage/db";

async function main() {
  const migrated = await runWithDatabase("manual-db-migrate", async (pool) => {
    await pool.query("SELECT 1");
    return true;
  });

  if (!migrated.available) {
    throw new Error("DATABASE_URL is not configured or DB connection failed.");
  }

  console.log("Database migrations are up to date.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Database migration failed.");
  process.exit(1);
});
