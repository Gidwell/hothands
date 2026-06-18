import type { SqlExecutor } from "./postgres-store";

export type IndexerMigration = {
  name: string;
  sql: string;
};

const INDEXER_MIGRATION_FILES = [
  "0001_indexer_foundation.sql",
  "0002_app_social.sql",
  "0003_price_candles_1m.sql",
];

declare const Bun: {
  file: (path: string) => {
    text: () => Promise<string>;
  };
};

declare const process: {
  cwd: () => string;
};

export function listMigrationSqlFiles(fileNames: readonly string[]): string[] {
  return fileNames
    .filter((fileName) => /^\d+_.+\.sql$/.test(fileName))
    .sort((left, right) => left.localeCompare(right));
}

export async function readIndexerMigrationFiles(
  directory = defaultMigrationsDir(),
): Promise<IndexerMigration[]> {
  const fileNames = listMigrationSqlFiles(INDEXER_MIGRATION_FILES);

  return Promise.all(
    fileNames.map(async (name) => ({
      name,
      sql: await Bun.file(`${directory.replace(/\/+$/, "")}/${name}`).text(),
    })),
  );
}

function defaultMigrationsDir(): string {
  const cwd = process.cwd().replace(/\/+$/, "");

  return cwd.endsWith("/packages/indexer")
    ? `${cwd}/migrations`
    : `${cwd}/packages/indexer/migrations`;
}

export async function runIndexerMigrations({
  execute,
  migrations,
}: {
  execute: SqlExecutor;
  migrations?: readonly IndexerMigration[];
}): Promise<number> {
  const resolvedMigrations = migrations ?? await readIndexerMigrationFiles();
  let statementCount = 0;

  for (const migration of [...resolvedMigrations].sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    for (const statement of splitSqlStatements(migration.sql)) {
      await execute(statement, []);
      statementCount += 1;
    }
  }

  return statementCount;
}

export function splitSqlStatements(sql: string): string[] {
  return sql
    .split("\n")
    .map((line) => line.replace(/^\s*--.*$/, ""))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}
