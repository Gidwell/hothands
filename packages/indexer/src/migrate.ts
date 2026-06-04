#!/usr/bin/env bun
import { runIndexerMigrations } from "./migrations";
import { createPostgresSqlClient } from "./postgres-client";

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
  stderr: { write: (text: string) => void };
  stdout: { write: (text: string) => void };
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for indexer migrations.");
  }

  const client = createPostgresSqlClient({ databaseUrl });
  try {
    const statementCount = await runIndexerMigrations({ execute: client.execute });
    process.stdout.write(
      `Hot Hands indexer migrations complete. Statements applied: ${statementCount}\n`,
    );
  } finally {
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
