import {
  createPostgresPredictIndexerReader,
  type PredictIndexerReader,
} from "@hot-hands/indexer";
import {
  createPostgresSqlClient,
  type PostgresSqlClient,
} from "@hot-hands/indexer/src/postgres-client";
import {
  createPostgresHotHandsAppStore,
  type HotHandsAppStore,
} from "./app-storage";
import {
  createIndexedOraclePriceHistoryLoader,
  type IndexedOraclePriceHistoryLoader,
} from "./oracle-prices";

export type IndexerReaders = {
  appStore: HotHandsAppStore;
  indexedOraclePriceHistoryLoader: IndexedOraclePriceHistoryLoader;
  reader: PredictIndexerReader;
  close(): Promise<void>;
};

export function createIndexerReadersFromDatabaseUrl(databaseUrl: string): IndexerReaders {
  const client = createPostgresSqlClient({ databaseUrl });
  return createIndexerReadersFromSqlClient(client);
}

export function createIndexerReadersFromSqlClient(client: PostgresSqlClient): IndexerReaders {
  const reader = createPostgresPredictIndexerReader({ execute: client.execute });

  return {
    appStore: createPostgresHotHandsAppStore({ execute: client.execute }),
    indexedOraclePriceHistoryLoader: createIndexedOraclePriceHistoryLoader(reader),
    reader,
    close: client.close,
  };
}
