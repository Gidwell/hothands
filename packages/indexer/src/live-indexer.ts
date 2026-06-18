import {
  DEEPBOOK_PREDICT_TESTNET_CONFIG,
  createPredictOracleSviClient,
  createPredictReadCanary,
  createPredictTradeHistoryClient,
  type PredictCanaryConfig,
  type PredictNormalizedTradeEvent,
  type PredictOracleSviPoint,
} from "./deepbook-predict";
import {
  DEFAULT_PRICE_POLL_INTERVAL_MS,
  pollDeepBookPredictLatestPrices,
} from "./price-poller";
import type { PredictIndexerReader } from "./postgres-reader";
import type { PredictPruneSummary } from "./prune-predict";
import type { PredictIndexerJobStatus, PredictIndexerWriter } from "./store";

export type DeepBookPredictLiveIndexerIntervals = {
  maintenance: number;
  oracles: number;
  prices: number;
  svi: number;
  positions: number;
  oracleTrades: number;
};

export type DeepBookPredictLiveIndexerCliOptions = {
  backoff: DeepBookPredictLiveIndexerBackoffOptions;
  databaseUrl?: string;
  expiredSeriesPrune?: DeepBookPredictExpiredSeriesPruneOptions;
  intervals: DeepBookPredictLiveIndexerIntervals;
  once: boolean;
  oracleTradeLimit: number;
  startupPriceBackfill?: DeepBookPredictStartupPriceBackfillOptions;
  sviLimit: number;
  tradeLimit: number;
};

export type DeepBookPredictExpiredSeriesPruneOptions = {
  activePriceRawRetentionMs: number;
  batchOracleLimit: number;
  includePriceCandles: boolean;
  maxBatches: number;
  retentionMs: number;
  vacuum: boolean;
};

export type DeepBookPredictStartupPriceBackfillOptions = {
  priceSampleMs: number;
  priceWindowConcurrency: number;
  priceWindowDays: number;
  priceWindowMs: number;
};

export type DeepBookPredictLiveIndexerOnceOptions = {
  config?: PredictCanaryConfig;
  fetchImpl?: typeof fetch;
  intervals?: Partial<DeepBookPredictLiveIndexerIntervals>;
  nowMs?: () => number;
  oracleTradeLimit?: number;
  pruneExpiredSeries?: () => Promise<PredictPruneSummary>;
  sviLimit?: number;
  reader: Pick<PredictIndexerReader, "listBtcOracles" | "listIndexerJobStatuses">;
  tradeLimit?: number;
  writer: PredictIndexerWriter;
};

export type DeepBookPredictLiveIndexerJobSummary = PredictIndexerJobStatus;

export type DeepBookPredictLiveIndexerOnceSummary = {
  jobs: DeepBookPredictLiveIndexerJobSummary[];
};

export type DeepBookPredictLiveIndexerOptions = DeepBookPredictLiveIndexerOnceOptions & {
  backoff?: DeepBookPredictLiveIndexerBackoffOptions;
  onError?: (error: unknown, jobName: string) => void;
  onPoll?: (summary: DeepBookPredictLiveIndexerJobSummary) => void;
};

export type DeepBookPredictLiveIndexer = {
  stop(): void;
};

export type DeepBookPredictLiveIndexerBackoffOptions = {
  jitterRatio?: number;
  maxDelayMs?: number;
  random?: () => number;
  rateLimitFloorMs?: number;
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
  run(previous?: PredictIndexerJobStatus): Promise<LiveIndexerJobResult>;
  source: string;
};

const DEFAULT_POSITIONS_POLL_INTERVAL_MS = 5_000;
const DEFAULT_ORACLE_TRADES_POLL_INTERVAL_MS = 1_000;
const DEFAULT_ORACLES_POLL_INTERVAL_MS = 30_000;
const DEFAULT_MAINTENANCE_POLL_INTERVAL_MS = 60_000;
const DEFAULT_TRADE_LIMIT = 250;
const DEFAULT_ORACLE_TRADE_LIMIT = 50;
const DEFAULT_SVI_LIMIT = 1;
const DEFAULT_PRUNE_BATCH_ORACLE_LIMIT = 100;
const DEFAULT_PRUNE_MAX_BATCHES = 1;
const DEFAULT_ACTIVE_PRICE_RAW_RETENTION_MS = 24 * 60 * 60_000;
const DEFAULT_STARTUP_PRICE_BACKFILL_SAMPLE_MS = 1_000;
const DEFAULT_STARTUP_PRICE_BACKFILL_WINDOW_MS = 60 * 60_000;
const DEFAULT_STARTUP_PRICE_BACKFILL_CONCURRENCY = 2;
const DEFAULT_BACKOFF_JITTER_RATIO = 0.2;
const DEFAULT_BACKOFF_MAX_DELAY_MS = 120_000;
const DEFAULT_RATE_LIMIT_BACKOFF_FLOOR_MS = 5_000;

export const DEFAULT_LIVE_INDEXER_INTERVALS: DeepBookPredictLiveIndexerIntervals = {
  maintenance: DEFAULT_MAINTENANCE_POLL_INTERVAL_MS,
  oracles: DEFAULT_ORACLES_POLL_INTERVAL_MS,
  prices: DEFAULT_PRICE_POLL_INTERVAL_MS,
  svi: DEFAULT_PRICE_POLL_INTERVAL_MS,
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
    backoff: parseBackoffOptions(env),
    databaseUrl: env.DATABASE_URL,
    expiredSeriesPrune: parseExpiredSeriesPruneOptions(parsed, env),
    intervals: {
      maintenance: positiveInt(
        lastValue(parsed, "maintenance-poll-ms") ??
          env.HOT_HANDS_INDEXER_MAINTENANCE_POLL_MS,
        DEFAULT_LIVE_INDEXER_INTERVALS.maintenance,
      ),
      oracles: positiveInt(
        lastValue(parsed, "oracles-poll-ms") ?? env.HOT_HANDS_INDEXER_ORACLES_POLL_MS,
        DEFAULT_LIVE_INDEXER_INTERVALS.oracles,
      ),
      prices: positiveInt(
        lastValue(parsed, "price-poll-ms") ?? env.HOT_HANDS_INDEXER_PRICE_POLL_MS,
        DEFAULT_LIVE_INDEXER_INTERVALS.prices,
      ),
      svi: positiveInt(
        lastValue(parsed, "svi-poll-ms") ?? env.HOT_HANDS_INDEXER_SVI_POLL_MS,
        DEFAULT_LIVE_INDEXER_INTERVALS.svi,
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
    startupPriceBackfill: parseStartupPriceBackfillOptions(env),
    sviLimit: positiveInt(
      lastValue(parsed, "svi-limit") ?? env.HOT_HANDS_INDEXER_SVI_LIMIT,
      DEFAULT_SVI_LIMIT,
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
  pruneExpiredSeries,
  reader,
  sviLimit = DEFAULT_SVI_LIMIT,
  tradeLimit = DEFAULT_TRADE_LIMIT,
  writer,
}: DeepBookPredictLiveIndexerOnceOptions): LiveIndexerJob[] {
  const resolvedIntervals = {
    ...DEFAULT_LIVE_INDEXER_INTERVALS,
    ...intervals,
  };
  const tradeClient = createPredictTradeHistoryClient({ config, fetchImpl });
  const sviClient = createPredictOracleSviClient({ config, fetchImpl });

  const jobs: LiveIndexerJob[] = [
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
      intervalMs: resolvedIntervals.svi,
      jobName: "predict.svi",
      source: "oracles/svi",
      run: async () => {
        const activeOracles = await reader.listBtcOracles({ includeSettled: false });
        const points = await Promise.all(
          activeOracles.map((oracle) =>
            sviClient
              .listOracleSvi(oracle.oracle_id, { limit: sviLimit })
              .catch(() => []),
          ),
        ).then((groups) => groups.flat());
        const rowsWritten = await writer.upsertOracleSvi(points);

        return {
          ...latestSviMetadata(points),
          rowsFetched: points.length,
          rowsWritten,
        };
      },
    },
    {
      intervalMs: resolvedIntervals.positions,
      jobName: "predict.positions.minted",
      source: "positions/minted",
      run: async (previous) => {
        const events = await tradeClient.listMintedPositions({ limit: tradeLimit });
        const newEvents = filterEventsAfterWatermark(events, previous);
        const rowsWritten = await writer.upsertTradeEvents(newEvents);
        if (rowsWritten > 0) {
          await writer.refreshPositionSummaries();
        }

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
      run: async (previous) => {
        const events = await tradeClient.listRedeemedPositions({ limit: tradeLimit });
        const newEvents = filterEventsAfterWatermark(events, previous);
        const rowsWritten = await writer.upsertTradeEvents(newEvents);
        if (rowsWritten > 0) {
          await writer.refreshPositionSummaries();
        }

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
        if (rowsWritten > 0) {
          await writer.refreshPositionSummaries();
        }

        return {
          ...latestTradeMetadata(events),
          rowsFetched: events.length,
          rowsWritten,
        };
      },
    },
  ];

  if (pruneExpiredSeries) {
    jobs.push({
      intervalMs: resolvedIntervals.maintenance,
      jobName: "predict.maintenance.prune_expired_series",
      source: "postgres/expired-oracle-series",
      run: async () => {
        const summary = await pruneExpiredSeries();

        return {
          rowsFetched: summary.prices.batchesRun +
            summary.svi.batchesRun +
            (summary.priceCandles.skipped ? 0 : 1),
          rowsWritten: summary.prices.rowsDeleted +
            summary.svi.rowsDeleted +
            summary.priceCandles.rowsWritten +
            summary.priceCandles.rawRowsDeleted,
        };
      },
    });
  }

  return jobs;
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
    const result = await job.run(previous);
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
    const lastSourceTimestampMs = maxOptionalNumber(
      previous?.lastSourceTimestampMs,
      result.lastSourceTimestampMs,
    );
    const lastCheckpoint = maxOptionalNumber(previous?.lastCheckpoint, result.lastCheckpoint);
    const lagMs =
      result.lastSourceTimestampMs === undefined || lastSourceTimestampMs === undefined
        ? previous?.lagMs
        : Math.max(0, completedAtMs - lastSourceTimestampMs);
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
        ? previous?.lastSourceTimestampMs === undefined
          ? {}
          : { lastSourceTimestampMs: previous.lastSourceTimestampMs }
        : { lastSourceTimestampMs }),
      ...(lastCheckpoint === undefined ? {} : { lastCheckpoint }),
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
      ...(lagMs === undefined ? {} : { lagMs }),
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
  let lastStatus: PredictIndexerJobStatus | undefined;

  const schedule = () => {
    if (!stopped) {
      timer = setTimeout(
        run,
        computeLiveIndexerNextPollDelayMs({
          baseIntervalMs: job.intervalMs,
          backoff: options.backoff,
          status: lastStatus,
        }),
      );
    }
  };
  const run = async () => {
    if (running) {
      schedule();
      return;
    }

    running = true;
    try {
      lastStatus = await runLiveIndexerJob(job, options);
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

export function computeLiveIndexerNextPollDelayMs({
  backoff = {},
  baseIntervalMs,
  status,
}: {
  backoff?: DeepBookPredictLiveIndexerBackoffOptions;
  baseIntervalMs: number;
  status?: PredictIndexerJobStatus;
}): number {
  const jitterRatio = clamp(
    backoff.jitterRatio ?? DEFAULT_BACKOFF_JITTER_RATIO,
    0,
    1,
  );
  const maxDelayMs = Math.max(
    baseIntervalMs,
    backoff.maxDelayMs ?? DEFAULT_BACKOFF_MAX_DELAY_MS,
  );
  const rateLimitFloorMs = Math.max(
    baseIntervalMs,
    backoff.rateLimitFloorMs ?? DEFAULT_RATE_LIMIT_BACKOFF_FLOOR_MS,
  );
  const random = backoff.random ?? Math.random;
  const statusErrorCount =
    status?.status === "error" ? Math.max(1, status.consecutiveErrorCount) : 0;
  const unjitteredDelayMs =
    statusErrorCount === 0
      ? baseIntervalMs
      : Math.min(
          maxDelayMs,
          errorBackoffBaseMs(status, baseIntervalMs, rateLimitFloorMs) *
            2 ** Math.min(statusErrorCount - 1, 8),
        );

  return Math.max(1, Math.round(applyJitter(unjitteredDelayMs, jitterRatio, random)));
}

function errorBackoffBaseMs(
  status: PredictIndexerJobStatus | undefined,
  baseIntervalMs: number,
  rateLimitFloorMs: number,
): number {
  return isRateLimitJobStatus(status) ? rateLimitFloorMs : baseIntervalMs;
}

function isRateLimitJobStatus(status: PredictIndexerJobStatus | undefined): boolean {
  return Boolean(
    status?.status === "error" &&
      status.lastError &&
      /(^|[^0-9])429([^0-9]|$)/.test(status.lastError),
  );
}

function applyJitter(
  delayMs: number,
  jitterRatio: number,
  random: () => number,
): number {
  if (jitterRatio <= 0) {
    return delayMs;
  }

  const sampled = clamp(random(), 0, 1);
  const factor = 1 - jitterRatio + sampled * jitterRatio * 2;
  return delayMs * factor;
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

function filterEventsAfterWatermark(
  events: readonly PredictNormalizedTradeEvent[],
  previous: PredictIndexerJobStatus | undefined,
): PredictNormalizedTradeEvent[] {
  if (previous?.lastSourceTimestampMs === undefined) {
    return [...events];
  }

  return events.filter((event) => event.timestampMs > previous.lastSourceTimestampMs!);
}

function latestSviMetadata(
  points: readonly PredictOracleSviPoint[],
): Pick<LiveIndexerJobResult, "lastCheckpoint" | "lastSourceTimestampMs"> {
  const latest = points.reduce<PredictOracleSviPoint | null>(
    (current, point) =>
      current === null || point.timestampMs > current.timestampMs ? point : current,
    null,
  );

  return latest
    ? {
        ...(latest.checkpoint === undefined ? {} : { lastCheckpoint: latest.checkpoint }),
        lastSourceTimestampMs: latest.timestampMs,
      }
    : {};
}

function maxOptionalNumber(
  left: number | undefined,
  right: number | undefined,
): number | undefined {
  if (left === undefined) {
    return right;
  }

  if (right === undefined) {
    return left;
  }

  return Math.max(left, right);
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
    "maintenance-poll-ms",
    "oracle-trade-limit",
    "oracles-poll-ms",
    "positions-poll-ms",
    "price-poll-ms",
    "price-candle-raw-retention-ms",
    "prune-batch-oracle-limit",
    "prune-max-batches",
    "prune-retention-ms",
    "svi-limit",
    "svi-poll-ms",
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

function nonNegativeInt(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseBackoffOptions(
  env: Record<string, string | undefined>,
): DeepBookPredictLiveIndexerBackoffOptions {
  return {
    jitterRatio: optionalNonNegativeNumber(env.HOT_HANDS_INDEXER_BACKOFF_JITTER_RATIO) ??
      DEFAULT_BACKOFF_JITTER_RATIO,
    maxDelayMs: positiveInt(
      env.HOT_HANDS_INDEXER_BACKOFF_MAX_MS,
      DEFAULT_BACKOFF_MAX_DELAY_MS,
    ),
    rateLimitFloorMs: positiveInt(
      env.HOT_HANDS_INDEXER_RATE_LIMIT_BACKOFF_FLOOR_MS,
      DEFAULT_RATE_LIMIT_BACKOFF_FLOOR_MS,
    ),
  };
}

function parseExpiredSeriesPruneOptions(
  parsed: ParsedArgs,
  env: Record<string, string | undefined>,
): DeepBookPredictExpiredSeriesPruneOptions | undefined {
  if (
    parsed.flags.has("skip-prune-expired-series") ||
    env.HOT_HANDS_INDEXER_PRUNE_EXPIRED_SERIES === "false"
  ) {
    return undefined;
  }

  return {
    activePriceRawRetentionMs: nonNegativeInt(
      lastValue(parsed, "price-candle-raw-retention-ms") ??
        env.HOT_HANDS_INDEXER_PRICE_CANDLE_RAW_RETENTION_MS,
      DEFAULT_ACTIVE_PRICE_RAW_RETENTION_MS,
    ),
    batchOracleLimit: positiveInt(
      lastValue(parsed, "prune-batch-oracle-limit") ??
        env.HOT_HANDS_INDEXER_PRUNE_BATCH_ORACLE_LIMIT,
      DEFAULT_PRUNE_BATCH_ORACLE_LIMIT,
    ),
    includePriceCandles:
      !parsed.flags.has("skip-price-candles") &&
      env.HOT_HANDS_INDEXER_PRICE_CANDLES !== "false",
    maxBatches: positiveInt(
      lastValue(parsed, "prune-max-batches") ??
        env.HOT_HANDS_INDEXER_PRUNE_MAX_BATCHES,
      DEFAULT_PRUNE_MAX_BATCHES,
    ),
    retentionMs: nonNegativeInt(
      lastValue(parsed, "prune-retention-ms") ??
        env.HOT_HANDS_INDEXER_PRUNE_RETENTION_MS,
      0,
    ),
    vacuum:
      parsed.flags.has("prune-vacuum") ||
      env.HOT_HANDS_INDEXER_PRUNE_VACUUM === "true",
  };
}

function parseStartupPriceBackfillOptions(
  env: Record<string, string | undefined>,
): DeepBookPredictStartupPriceBackfillOptions | undefined {
  const priceWindowDays = optionalPositiveNumber(
    env.HOT_HANDS_INDEXER_STARTUP_PRICE_BACKFILL_DAYS,
  );
  if (priceWindowDays === undefined) {
    return undefined;
  }

  return {
    priceSampleMs: positiveInt(
      env.HOT_HANDS_INDEXER_STARTUP_PRICE_SAMPLE_MS,
      DEFAULT_STARTUP_PRICE_BACKFILL_SAMPLE_MS,
    ),
    priceWindowConcurrency: positiveInt(
      env.HOT_HANDS_INDEXER_STARTUP_PRICE_WINDOW_CONCURRENCY,
      DEFAULT_STARTUP_PRICE_BACKFILL_CONCURRENCY,
    ),
    priceWindowDays,
    priceWindowMs: positiveInt(
      env.HOT_HANDS_INDEXER_STARTUP_PRICE_WINDOW_MS,
      DEFAULT_STARTUP_PRICE_BACKFILL_WINDOW_MS,
    ),
  };
}

function optionalPositiveNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function optionalNonNegativeNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
