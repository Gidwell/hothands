import { describe, expect, test } from "bun:test";
import {
  listMigrationSqlFiles,
  readIndexerMigrationFiles,
  runIndexerMigrations,
  splitSqlStatements,
} from "../src/migrations";

describe("Predict indexer migrations", () => {
  test("lists SQL migration files in deterministic order", () => {
    expect(
      listMigrationSqlFiles([
        "notes.md",
        "0002_add_profiles.sql",
        "0001_indexer_foundation.sql",
      ]),
    ).toEqual(["0001_indexer_foundation.sql", "0002_add_profiles.sql"]);
  });

  test("loads app-owned social and auth migrations after the indexer foundation", async () => {
    const migrations = await readIndexerMigrationFiles();

    expect(migrations.map((migration) => migration.name)).toEqual([
      "0001_indexer_foundation.sql",
      "0002_app_social.sql",
    ]);
    expect(migrations[1]?.sql).toContain("create table if not exists app_wallet_sessions");
    expect(migrations[1]?.sql).toContain("create table if not exists app_copy_receipts");
    expect(migrations[1]?.sql).toContain("create table if not exists app_wallet_heat_snapshots");
  });

  test("splits migration files into executable SQL statements", () => {
    expect(
      splitSqlStatements(`
        -- ignored comment
        create table if not exists one (id text primary key);

        create index if not exists one_id_idx on one (id);
      `),
    ).toEqual([
      "create table if not exists one (id text primary key)",
      "create index if not exists one_id_idx on one (id)",
    ]);
  });

  test("runs migration files in order through the provided executor", async () => {
    const executed: string[] = [];

    const count = await runIndexerMigrations({
      execute: async (statement) => {
        executed.push(statement);
        return { rowCount: 0 };
      },
      migrations: [
        {
          name: "0002_second.sql",
          sql: "create table if not exists second (id text primary key);",
        },
        {
          name: "0001_first.sql",
          sql: "create table if not exists first (id text primary key);",
        },
      ],
    });

    expect(count).toBe(2);
    expect(executed).toEqual([
      "create table if not exists first (id text primary key)",
      "create table if not exists second (id text primary key)",
    ]);
  });
});
