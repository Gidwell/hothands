import {
  DEEPBOOK_PREDICT_TESTNET_CONFIG,
  createPredictReadCanary,
  createPredictTradeHistoryClient,
  type PredictCanaryConfig,
  type PredictNormalizedTradeEvent,
} from "./deepbook-predict";
import {
  DEFAULT_PRICE_POLL_INTERVAL_MS,
  pollDeepBookPredictLatestPrices,
} from "./price-poller";
import type { PredictIndexerReader } from "./postgres-reader";
import type { PredictIndexerJobStatus, PredictIndexerWriter } from "./store";

export type DeepBookPredictLiveIndexerIntervals = {
  oracles: number;
  prices: number;
  positions: number;
  oracleTrades: number;
};

export type DeepBookPredictLiveIndexerCliOptions = {
  databaseUrl?: string;
  intervals: DeepBookPredictLiveIndexerIntervals;
  once: boolean;
  oracleTradeLimit: number;
  tradeLimit: number;
};

export type DeepBookPredictLiveIndexerOnceOptions = {
  config?: PredictCanaryConfig;
  fetchImpl?: typeof fetch;
  intervals?: Partial<DeepBookPredictLiveIndexerIntervals>;
  nowMs?: () => number;
  oracleTradeLimit?: number;
  reader: Pick<PredictIndexerReader, "listBtcOracles" | "listIndexerJobStatuses">;
  tradeLimit?: number;
  writer: PredictIndexerWriter;
};

export type DeepBookPredictLiveIndexerJobSummary = PredictIndexerJobStatus;

export type DeepBookPredictLiveIndexerOnceSummary = {
  jobs: DeepBookPredictLiveIndexerJobSummary[];
};

export type DeepBookPredictLiveIndexerOptions = DeepBookPredictLiveIndexerOnceOptions & {
  onError?: (error: unknown, jobName: string) => void;
  onPoll?: (summary: DeepBookPredictLiveIndexerJobSummary) => void;
};

export type DeepBookPredictLiveIndexer = {
  stop(): void;
};

type LiveIndexerJobResult = {
  lastCheckpoint?: number;
  lastSourceTimestampMs?: number;
  rowsFetched: number;
  rowsWritten: number;
};

type LiveIndexerJob = {
  intervalMs: number;
  jobName: string;
  run(): Promise<LiveIndexerJobResult>;
  source: string;
};

const DEFAULT_POSITIONS_POLL_INTERVAL_MS = 1_000;
const DEFAULT_ORACLE_TRADES_POLL_INTERVAL_MS = 1_000;
const DEFAULT_ORACLES_POLL_INTERVAL_MS = 30_000;
const DEFAULT_TRADE_LIMIT = 5_000;
const DEFAULT_ORACLE_TRADE_LIMIT = 500;

export const DEFAULT_LIVE_INDEXER_INTERVALS: DeepBookPredictLiveIndexerIntervals = {
  oracles: DEFAULT_ORACLES_POLL_INTERVAL_MS,
  prices: DEFAULT_PRICE_POLL_INTERVAL_MS,
  positions: DEFAULT_POSITIONS_POLL_INTERVAL_MS,
  oracleTrades: DEFAULT_ORACLE_TRADES_POLL_INTERVAL_MS,
};

export function parseLiveIndexerCliOptions({
  argv,
  env,
}: {
  argv: readonly string[];
  env: Record<string, string | undefined>;
}): DeepBookPredictLiveIndexerCliOptions {
  const parsed = parseArgs(argv);

  return {
    databaseUrl: env.DATABASE_URL,
    intervals: {
      oracles: positiveInt(
        lastValue(parsed, "oracles-poll-ms") ?? env.HOT_HANDS_INDEXER_ORACLES_POLL_MS,
        DEFAULT_LIVE_INDEXER_INTERVALS.oracles,
      ),
      prices: positiveInt(
        lastValue(parsed, "price-poll-ms") ?? env.HOT_HANDS_INDEXER_PRICE_POLL_MS,
        DEFAULT_LIVE_INDEXER_INTERVALS.prices,
      ),
      positions: positiveInt(
        lastValue(parsed, "positions-poll-ms") ?? env.HOT_HANDS_INDEXER_POSITIONS_POLL_MS,
        DEFAULT_LIVE_INDEXER_INTERVALS.positions,
      ),
      oracleTrades: positiveInt(
        lastValue(parsed, "trades-poll-ms") ?? env.HOT_HANDS_INDEXER_TRADES_POLL_MS,
        DEFAULT_LIVE_INDEXER_INTERVALS.oracleTrades,
      ),
    },
    once: parsed.flags.has("once"),
    oracleTradeLimit: positiveInt(
      lastValue(parsed, "oracle-trade-limit") ?? env.HOT_HANDS_INDEXER_ORACLE_TRADE_LIMIT,
      DEFAULT_ORACLE_TRADE_LIMIT,
    ),
    tradeLimit: positiveInt(
      lastValue(parsed, "trade-limit") ?? env.HOT_HANDS_INDEXER_TRADE_LIMIT,
      DEFAULT_TRADE_LIMIT,
    ),
  };
}

export async function runDeepBookPredictLiveIndexerOnce(
  options: DeepBookPredictLiveIndexerOnceOptions,
): Promise<DeepBookPredictLiveIndexerOnceSummary> {
  const jobs = createLiveIndexerJobs(options);
  const summaries: DeepBookPredictLiveIndexerJobSummary[] = [];

  for (const job of jobs) {
    summaries.push(await runLiveIndexerJob(job, options));
  }

  return { jobs: summaries };
}

export function startDeepBookPredictLiveIndexer(
  options: DeepBookPredictLiveIndexerOptions,
): DeepBookPredictLiveIndexer {
  const jobs = createLiveIndexerJobs(options);
  const stops = jobs.map((job) => startLiveIndexerJobLoop(job, options));

  return {
    stop() {
      for (const stop of stops) {
        stop();
      }
    },
  };
}

function createLiveIndexerJobs({
  config = DEEPBOOK_PREDICT_TESTNET_CONFIG,
  fetchImpl = fetch,
  intervals = {},
  oracleTradeLimit = DEFAULT_ORACLE_TRADE_LIMIT,
  reader,
  tradeLimit = DEFAULT_TRADE_LIMIT,
  writer,
}: DeepBookPredictLiveIndexerOnceOptions): LiveIndexerJob[] {
  const resolvedIntervals = {
    ...DEFAULT_LIVE_INDEXER_INTERVALS,
    ...intervals,
  };
  const tradeClient = createPredictTradeHistoryClient({ config, fetchImpl });

  return [
    {
      intervalMs: resolvedIntervals.oracles,
      jobName: "predict.oracles",
      source: "predicts/oracles",
      run: async () => {
        const canary = await createPredictReadCanary({ config, fetchImpl }).run();
        const rowsWritten = await writer.upsertOracles(canary.btcOracles);

        return {
          lastCheckpoint: canary.latestOnchainCheckpoint,
          rowsFetched: canary.btcOracles.length,
          rowsWritten,
        };
      },
    },
    {
      intervalMs: resolvedIntervals.prices,
      jobName: "predict.prices",
      source: "oracles/prices/latest",
      run: async () => {
        const summary = await pollDeepBookPredictLatestPrices({
          config,
          fetchImpl,
          reader,
          writer,
        });

        return {
          ...(summary.latestCheckpoint === undefined ? {} : { lastCheckpoint: summary.latestCheckpoint }),
          ...(summary.latestSourceTimestampMs === undefined
            ? {}
            : { lastSourceTimestampMs: summary.latestSourceTimestampMs }),
          rowsFetched: summary.fetchedPriceCount,
          rowsWritten: summary.upsertedPriceCount,
        };
      },
    },
    {
      intervalMs: resolvedIntervals.positions,
      jobName: "predict.positions.minted",
      source: "positions/minted",
      run: async () => {
        const events = await tradeClient.listMintedPositions({ limit: tradeLimit });
        const rowsWritten = await writer.upsertTradeEvents(events);
        await writer.refreshPositionSummaries();

        return {
          ...latestTradeMetadata(events),
          rowsFetched: events.length,
          rowsWritten,
        };
      },
    },
    {
      intervalMs: resolvedIntervals.positions,
      jobName: "predict.positions.redeemed",
      source: "positions/redeemed",
      run: async () => {
        const events = await tradeClient.listRedeemedPositions({ limit: tradeLimit });
        const rowsWritten = await writer.upsertTradeEvents(events);
        await writer.refreshPositionSummaries();

        return {
          ...latestTradeMetadata(events),
          rowsFetched: events.length,
          rowsWritten,
        };
      },
    },
    {
      intervalMs: resolvedIntervals.oracleTrades,
      jobName: "predict.trades.active_oracles",
      source: "trades/active-oracles",
      run: async () => {
        const activeOracles = await reader.listBtcOracles({ includeSettled: false });
        const events = await Promise.all(
          activeOracles.map((oracle) =>
            tradeClient
              .listOracleTrades(oracle.oracle_id, { limit: oracleTradeLimit })
              .catch(() => []),
          ),
        ).then((groups) => groups.flat());
        const rowsWritten = await writer.upsertTradeEvents(events);
        await writer.refreshPositionSummaries();

        return {
          ...latestTradeMetadata(events),
          rowsFetched: events.length,
          rowsWritten,
        };
      },
    },
  ];
}

async function runLiveIndexerJob(
  job: LiveIndexerJob,
  {
    nowMs = Date.now,
    onError,
    onPoll,
    reader,
    writer,
  }: Pick<
    DeepBookPredictLiveIndexerOptions,
    "nowMs" | "onError" | "onPoll" | "reader" | "writer"
  >,
): Promise<DeepBookPredictLiveIndexerJobSummary> {
  const startedAtMs = nowMs();
  const previous = await findPreviousJobStatus(reader, job.jobName);

  try {
    const result = await job.run();
    const completedAtMs = nowMs();
    const sourceAdvanced = Boolean(
      result.lastSourceTimestampMs !== undefined &&
        previous?.lastSourceTimestampMs !== undefined &&
        result.lastSourceTimestampMs > previous.lastSourceTimestampMs,
    );
    const firstSourceTimestamp = Boolean(
      result.lastSourceTimestampMs !== undefined &&
        previous?.lastSourceTimestampMs === undefined,
    );
    const observedUpdateGapMs =
      sourceAdvanced &&
      result.lastSourceTimestampMs !== undefined &&
      previous?.lastSourceTimestampMs !== undefined
        ? result.lastSourceTimestampMs - previous.lastSourceTimestampMs
        : undefined;
    const status: PredictIndexerJobStatus = {
      jobName: job.jobName,
      source: job.source,
      pollIntervalMs: job.intervalMs,
      status: "ok",
      lastPollStartedAtMs: startedAtMs,
      lastPollCompletedAtMs: completedAtMs,
      lastSuccessAtMs: completedAtMs,
      ...(sourceAdvanced || firstSourceTimestamp
        ? { lastNewDataAtMs: completedAtMs }
        : previous?.lastNewDataAtMs === undefined
          ? {}
          : { lastNewDataAtMs: previous.lastNewDataAtMs }),
      ...(result.lastSourceTimestampMs === undefined
        ? {}
        : { lastSourceTimestampMs: result.lastSourceTimestampMs }),
      ...(result.lastCheckpoint === undefined
        ? previous?.lastCheckpoint === undefined
          ? {}
          : { lastCheckpoint: previous.lastCheckpoint }
        : { lastCheckpoint: result.lastCheckpoint }),
      rowsFetched: result.rowsFetched,
      rowsWritten: result.rowsWritten,
      totalRowsWritten: (previous?.totalRowsWritten ?? 0) + result.rowsWritten,
      consecutiveErrorCount: 0,
      ...(observedUpdateGapMs === undefined
        ? previous?.observedUpdateGapMs === undefined
          ? {}
          : { observedUpdateGapMs: previous.observedUpdateGapMs }
        : { observedUpdateGapMs }
      ),
      ...(result.lastSourceTimestampMs === undefined
        ? {}
        : { lagMs: Math.max(0, completedAtMs - result.lastSourceTimestampMs) }),
      updatedAtMs: completedAtMs,
    };

    await writer.upsertIndexerJobStatus(status);
    onPoll?.(status);
    return status;
  } catch (error) {
    const completedAtMs = nowMs();
    const status: PredictIndexerJobStatus = {
      jobName: job.jobName,
      source: job.source,
      pollIntervalMs: job.intervalMs,
      status: "error",
      lastPollStartedAtMs: startedAtMs,
      lastPollCompletedAtMs: completedAtMs,
      ...(previous?.lastSuccessAtMs === undefined
        ? {}
        : { lastSuccessAtMs: previous.lastSuccessAtMs }),
      ...(previous?.lastNewDataAtMs === undefined
        ? {}
        : { lastNewDataAtMs: previous.lastNewDataAtMs }),
      ...(previous?.lastSourceTimestampMs === undefined
        ? {}
        : { lastSourceTimestampMs: previous.lastSourceTimestampMs }),
      ...(previous?.lastCheckpoint === undefined
        ? {}
        : { lastCheckpoint: previous.lastCheckpoint }),
      rowsFetched: 0,
      rowsWritten: 0,
      totalRowsWritten: previous?.totalRowsWritten ?? 0,
      consecutiveErrorCount: (previous?.consecutiveErrorCount ?? 0) + 1,
      lastError: error instanceof Error ? error.message : String(error),
      ...(previous?.observedUpdateGapMs === undefined
        ? {}
        : { observedUpdateGapMs: previous.observedUpdateGapMs }),
      ...(previous?.lagMs === undefined ? {} : { lagMs: previous.lagMs }),
      updatedAtMs: completedAtMs,
    };

    await writer.upsertIndexerJobStatus(status);
    onError?.(error, job.jobName);
    onPoll?.(status);
    return status;
  }
}

async function findPreviousJobStatus(
  reader: Pick<PredictIndexerReader, "listIndexerJobStatuses">,
  jobName: string,
): Promise<PredictIndexerJobStatus | undefined> {
  return (await reader.listIndexerJobStatuses()).find(
    (status) => status.jobName === jobName,
  );
}

function startLiveIndexerJobLoop(
  job: LiveIndexerJob,
  options: DeepBookPredictLiveIndexerOptions,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  const schedule = () => {
    if (!stopped) {
      timer = setTimeout(run, job.intervalMs);
    }
  };
  const run = async () => {
    if (running) {
      schedule();
      return;
    }

    running = true;
    try {
      await runLiveIndexerJob(job, options);
    } finally {
      running = false;
      schedule();
    }
  };

  void run();

  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
    }
  };
}

function latestTradeMetadata(
  events: readonly PredictNormalizedTradeEvent[],
): Pick<LiveIndexerJobResult, "lastCheckpoint" | "lastSourceTimestampMs"> {
  const latest = events.reduce<PredictNormalizedTradeEvent | null>(
    (current, event) =>
      current === null || event.timestampMs > current.timestampMs ? event : current,
    null,
  );

  return latest
    ? {
        ...(latest.checkpoint === undefined ? {} : { lastCheckpoint: latest.checkpoint }),
        lastSourceTimestampMs: latest.timestampMs,
      }
    : {};
}

type ParsedArgs = {
  flags: Set<string>;
  values: Map<string, string[]>;
};

function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string[]>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith("--")) {
      continue;
    }

    const raw = arg.slice(2);
    const equalsIndex = raw.indexOf("=");
    if (equalsIndex >= 0) {
      pushValue(values, raw.slice(0, equalsIndex), raw.slice(equalsIndex + 1));
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--") && expectsValue(raw)) {
      pushValue(values, raw, next);
      index += 1;
    } else {
      flags.add(raw);
    }
  }

  return { flags, values };
}

function expectsValue(key: string): boolean {
  return [
    "oracle-trade-limit",
    "oracles-poll-ms",
    "positions-poll-ms",
    "price-poll-ms",
    "trade-limit",
    "trades-poll-ms",
  ].includes(key);
}

function lastValue(parsed: ParsedArgs, key: string): string | undefined {
  return parsed.values.get(key)?.at(-1);
}

function pushValue(values: Map<string, string[]>, key: string, value: string) {
  values.set(key, [...(values.get(key) ?? []), value]);
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
