#!/usr/bin/env bun
import { runIndexerMigrations } from "./migrations";
import { createPostgresSqlClient } from "./postgres-client";

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
  stderr: { write: (text: string) => void };
  stdout: { write: (text: string) => void };
};

const MIGRATION_LOCK_ID = 8_509_867_121;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for indexer migrations.");
  }

  const client = createPostgresSqlClient({ databaseUrl });
  try {
    await client.execute("select pg_advisory_lock($1::bigint)", [MIGRATION_LOCK_ID]);
    const statementCount = await runIndexerMigrations({ execute: client.execute });
    process.stdout.write(
      `Hot Hands indexer migrations complete. Statements applied: ${statementCount}\n`,
    );
  } finally {
    await client.execute("select pg_advisory_unlock($1::bigint)", [MIGRATION_LOCK_ID]).catch(() => {
      // Closing the connection also releases advisory locks; this is best-effort cleanup.
    });
    await client.close();
  }
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  try {
    await main();
  } catch (error) {
    process.exitCode = 1;
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  }
}
