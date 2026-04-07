export type SqlMigration = {
  id: string;
  sql: string;
};

export const STORAGE_MIGRATIONS: SqlMigration[] = [
  {
    id: "001_initial_storage",
    sql: `
      CREATE TABLE IF NOT EXISTS fortexa_wallets (
        user_id TEXT PRIMARY KEY,
        public_key TEXT NOT NULL,
        source TEXT NOT NULL,
        provider TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fortexa_audit_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL
      );

      CREATE INDEX IF NOT EXISTS fortexa_audit_entries_user_ts_idx
      ON fortexa_audit_entries (user_id, timestamp DESC);

      CREATE TABLE IF NOT EXISTS fortexa_usage (
        user_id TEXT PRIMARY KEY,
        spent_xlm DOUBLE PRECISION NOT NULL,
        tool_calls INTEGER NOT NULL,
        last_updated TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fortexa_policy_state (
        id SMALLINT PRIMARY KEY,
        version INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        policy JSONB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fortexa_policy_history (
        version INTEGER PRIMARY KEY,
        updated_at TIMESTAMPTZ NOT NULL,
        updated_by TEXT,
        policy JSONB NOT NULL
      );
    `,
  },
];
