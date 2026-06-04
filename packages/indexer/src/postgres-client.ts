import postgres from "postgres";
import type { SqlExecutor } from "./postgres-store";
import type { SqlQueryExecutor } from "./postgres-reader";

export type PostgresSqlClient = {
  execute: SqlExecutor & SqlQueryExecutor;
  close(): Promise<void>;
};

export type PostgresSqlClientOptions = {
  databaseUrl: string;
  maxConnections?: number;
};

export function createPostgresSqlClient({
  databaseUrl,
  maxConnections = 1,
}: PostgresSqlClientOptions): PostgresSqlClient {
  const sql = postgres(databaseUrl, { max: maxConnections });
  const execute: SqlExecutor & SqlQueryExecutor = async (statement, params = []) => {
    const rows = await sql.unsafe(statement, [...params] as never[]);
    const result = rows as readonly Record<string, unknown>[] & { count?: number };

    return {
      rows: [...result],
      rowCount: typeof result.count === "number" ? result.count : result.length,
    };
  };

  return {
    execute,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}
