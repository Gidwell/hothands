export type SqlValue = string | number | boolean | null;

export type SqlQueryResult = {
  rows?: readonly Record<string, unknown>[];
  rowCount?: number | null;
};

export type SqlQueryExecutor = (
  statement: string,
  params?: readonly SqlValue[],
) => Promise<SqlQueryResult | readonly Record<string, unknown>[]>;

export type WalletAuthChallenge = {
  challengeId: string;
  wallet: string;
  nonce: string;
  message: string;
  issuedAtMs: number;
  expiresAtMs: number;
  consumedAtMs?: number;
};

export type WalletSession = {
  sessionId: string;
  wallet: string;
  tokenHash: string;
  issuedAtMs: number;
  expiresAtMs: number;
  revokedAtMs?: number;
};

export type WalletFollow = {
  followerWallet: string;
  leaderWallet: string;
  leaderDisplayName?: string;
  createdAtMs: number;
  updatedAtMs: number;
};

export type WalletProfile = {
  wallet: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  xHandle?: string;
  defaultStakeAmountUsd?: number;
  createdAtMs: number;
  updatedAtMs: number;
};

export type UpsertWalletProfileInput = {
  wallet: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  xHandle?: string;
  defaultStakeAmountUsd?: number;
  nowMs: number;
};

export type UpsertWalletFollowInput = {
  followerWallet: string;
  leaderWallet: string;
  leaderDisplayName?: string;
  nowMs: number;
};

export type CopyReceiptMode = "copy" | "fade";
export type CopyReceiptStatus = "prepared" | "submitted" | "failed";
export type CopyReceiptSide = "UP" | "DOWN";

export type CopyReceipt = {
  receiptId: string;
  copierWallet: string;
  sourceWallet: string;
  sourcePositionId: string;
  copiedPositionId?: string;
  mode: CopyReceiptMode;
  status: CopyReceiptStatus;
  oracleId?: string;
  expiryMs?: number;
  strike?: number;
  sourceSide?: CopyReceiptSide;
  executionSide?: CopyReceiptSide;
  amountUsd: number;
  quoteCost?: number;
  transactionDigest?: string;
  createdAtMs: number;
  updatedAtMs: number;
  raw?: Record<string, unknown>;
};

export type ListCopyReceiptsOptions = {
  copierWallet?: string;
  sourcePositionId?: string;
  sourceWallet?: string;
  limit?: number;
};

export type WalletHeatSnapshot = {
  wallet: string;
  scoredAtMs: number;
  heatScore: number;
  source: string;
  components: Record<string, unknown>;
};

export type ListWalletHeatSnapshotsOptions = {
  wallet?: string;
  limit?: number;
};

export type HotHandsAppStore = {
  createWalletAuthChallenge(input: WalletAuthChallenge): Promise<number>;
  consumeWalletAuthChallenge(input: {
    wallet: string;
    nonce: string;
    consumedAtMs: number;
  }): Promise<WalletAuthChallenge | null>;
  upsertWalletSession(input: WalletSession): Promise<number>;
  getWalletSessionByTokenHash(input: {
    tokenHash: string;
    nowMs: number;
  }): Promise<WalletSession | null>;
  revokeWalletSession(input: {
    sessionId: string;
    revokedAtMs: number;
  }): Promise<number>;
  upsertWalletProfile(input: UpsertWalletProfileInput): Promise<number>;
  getWalletProfile(wallet: string): Promise<WalletProfile | null>;
  upsertWalletFollow(input: UpsertWalletFollowInput): Promise<number>;
  deleteWalletFollow(input: {
    followerWallet: string;
    leaderWallet: string;
    nowMs: number;
  }): Promise<number>;
  listWalletFollows(followerWallet: string): Promise<WalletFollow[]>;
  recordCopyReceipt(input: CopyReceipt): Promise<number>;
  listCopyReceipts(options?: ListCopyReceiptsOptions): Promise<CopyReceipt[]>;
  upsertWalletHeatSnapshot(input: WalletHeatSnapshot): Promise<number>;
  listLatestWalletHeatSnapshots(options?: ListWalletHeatSnapshotsOptions): Promise<WalletHeatSnapshot[]>;
};

export function createPostgresHotHandsAppStore({
  execute,
}: {
  execute: SqlQueryExecutor;
}): HotHandsAppStore {
  return {
    createWalletAuthChallenge: async (input) =>
      rowsAffected(await execute(
        [
          "insert into app_wallet_auth_challenges (",
          "  challenge_id, wallet, nonce, message, issued_at_ms, expires_at_ms",
          ")",
          "values ($1, $2, $3, $4, $5, $6)",
          "on conflict (challenge_id) do update set",
          "  wallet = excluded.wallet,",
          "  nonce = excluded.nonce,",
          "  message = excluded.message,",
          "  issued_at_ms = excluded.issued_at_ms,",
          "  expires_at_ms = excluded.expires_at_ms,",
          "  consumed_at_ms = null",
          "returning 1",
        ].join("\n"),
        [
          input.challengeId,
          input.wallet,
          input.nonce,
          input.message,
          input.issuedAtMs,
          input.expiresAtMs,
        ],
      )),
    consumeWalletAuthChallenge: async ({ wallet, nonce, consumedAtMs }) => {
      const result = await execute(
        [
          "update app_wallet_auth_challenges",
          "set consumed_at_ms = $3",
          "where wallet = $1",
          "  and nonce = $2",
          "  and consumed_at_ms is null",
          "  and expires_at_ms >= $3",
          "returning challenge_id, wallet, nonce, message, issued_at_ms, expires_at_ms, consumed_at_ms",
        ].join("\n"),
        [wallet, nonce, consumedAtMs],
      );

      return mapAuthChallengeRow(firstRow(result));
    },
    upsertWalletSession: async (input) =>
      rowsAffected(await execute(
        [
          "insert into app_wallet_sessions (",
          "  session_id, wallet, token_hash, issued_at_ms, expires_at_ms, revoked_at_ms",
          ")",
          "values ($1, $2, $3, $4, $5, $6)",
          "on conflict (session_id) do update set",
          "  wallet = excluded.wallet,",
          "  token_hash = excluded.token_hash,",
          "  issued_at_ms = excluded.issued_at_ms,",
          "  expires_at_ms = excluded.expires_at_ms,",
          "  revoked_at_ms = excluded.revoked_at_ms",
          "returning 1",
        ].join("\n"),
        [
          input.sessionId,
          input.wallet,
          input.tokenHash,
          input.issuedAtMs,
          input.expiresAtMs,
          input.revokedAtMs ?? null,
        ],
      )),
    getWalletSessionByTokenHash: async ({ tokenHash, nowMs }) => {
      const result = await execute(
        [
          "select session_id, wallet, token_hash, issued_at_ms, expires_at_ms, revoked_at_ms",
          "from app_wallet_sessions",
          "where token_hash = $1",
          "  and expires_at_ms > $2",
          "  and revoked_at_ms is null",
          "limit 1",
        ].join("\n"),
        [tokenHash, nowMs],
      );

      return mapWalletSessionRow(firstRow(result));
    },
    revokeWalletSession: async ({ sessionId, revokedAtMs }) =>
      rowsAffected(await execute(
        [
          "update app_wallet_sessions",
          "set revoked_at_ms = $2",
          "where session_id = $1 and revoked_at_ms is null",
          "returning 1",
        ].join("\n"),
        [sessionId, revokedAtMs],
      )),
    upsertWalletProfile: async (input) =>
      rowsAffected(await execute(
        [
          "insert into app_profiles (",
          "  wallet, display_name, bio, avatar_url, x_handle, default_stake_amount_usd, created_at_ms, updated_at_ms",
          ")",
          "values ($1, $2, $3, $4, $5, $6, $7, $7)",
          "on conflict (wallet) do update set",
          "  display_name = coalesce(excluded.display_name, app_profiles.display_name),",
          "  bio = coalesce(excluded.bio, app_profiles.bio),",
          "  avatar_url = coalesce(excluded.avatar_url, app_profiles.avatar_url),",
          "  x_handle = coalesce(excluded.x_handle, app_profiles.x_handle),",
          "  default_stake_amount_usd = coalesce(excluded.default_stake_amount_usd, app_profiles.default_stake_amount_usd),",
          "  updated_at_ms = excluded.updated_at_ms",
          "returning 1",
        ].join("\n"),
        [
          input.wallet,
          input.displayName ?? null,
          input.bio ?? null,
          input.avatarUrl ?? null,
          input.xHandle ?? null,
          input.defaultStakeAmountUsd ?? null,
          input.nowMs,
        ],
      )),
    getWalletProfile: async (wallet) => {
      const result = await execute(
        [
          "select wallet, display_name, bio, avatar_url, x_handle, default_stake_amount_usd, created_at_ms, updated_at_ms",
          "from app_profiles",
          "where wallet = $1",
          "limit 1",
        ].join("\n"),
        [wallet],
      );

      return mapWalletProfileRow(firstRow(result));
    },
    upsertWalletFollow: async (input) =>
      rowsAffected(await execute(
        [
          "insert into app_wallet_follows (",
          "  follower_wallet, leader_wallet, leader_display_name, created_at_ms, updated_at_ms, deleted_at_ms",
          ")",
          "values ($1, $2, $3, $4, $4, null)",
          "on conflict (follower_wallet, leader_wallet) do update set",
          "  leader_display_name = excluded.leader_display_name,",
          "  updated_at_ms = excluded.updated_at_ms,",
          "  deleted_at_ms = null",
          "returning 1",
        ].join("\n"),
        [
          input.followerWallet,
          input.leaderWallet,
          input.leaderDisplayName ?? null,
          input.nowMs,
        ],
      )),
    deleteWalletFollow: async ({ followerWallet, leaderWallet, nowMs }) =>
      rowsAffected(await execute(
        [
          "update app_wallet_follows",
          "set deleted_at_ms = $3, updated_at_ms = $3",
          "where follower_wallet = $1 and leader_wallet = $2 and deleted_at_ms is null",
          "returning 1",
        ].join("\n"),
        [followerWallet, leaderWallet, nowMs],
      )),
    listWalletFollows: async (followerWallet) => {
      const result = await execute(
        [
          "select follower_wallet, leader_wallet, leader_display_name, created_at_ms, updated_at_ms",
          "from app_wallet_follows",
          "where follower_wallet = $1 and deleted_at_ms is null",
          "order by updated_at_ms desc, leader_wallet asc",
        ].join("\n"),
        [followerWallet],
      );

      return rows(result).map(mapWalletFollowRow).filter(isDefined);
    },
    recordCopyReceipt: async (input) =>
      rowsAffected(await execute(
        [
          "insert into app_copy_receipts (",
          "  receipt_id, copier_wallet, source_wallet, source_position_id, copied_position_id,",
          "  mode, status, oracle_id, expiry_ms, strike, source_side, execution_side,",
          "  amount_usd, quote_cost, transaction_digest, created_at_ms, updated_at_ms, raw",
          ")",
          "values (",
          "  $1, $2, $3, $4, $5,",
          "  $6, $7, $8, $9, $10, $11, $12,",
          "  $13, $14, $15, $16, $17, $18::jsonb",
          ")",
          "on conflict (receipt_id) do update set",
          "  status = excluded.status,",
          "  copied_position_id = excluded.copied_position_id,",
          "  quote_cost = excluded.quote_cost,",
          "  transaction_digest = excluded.transaction_digest,",
          "  updated_at_ms = excluded.updated_at_ms,",
          "  raw = excluded.raw",
          "returning 1",
        ].join("\n"),
        [
          input.receiptId,
          input.copierWallet,
          input.sourceWallet,
          input.sourcePositionId,
          input.copiedPositionId ?? null,
          input.mode,
          input.status,
          input.oracleId ?? null,
          input.expiryMs ?? null,
          input.strike ?? null,
          input.sourceSide ?? null,
          input.executionSide ?? null,
          input.amountUsd,
          input.quoteCost ?? null,
          input.transactionDigest ?? null,
          input.createdAtMs,
          input.updatedAtMs,
          JSON.stringify(input.raw ?? {}),
        ],
      )),
    listCopyReceipts: async (options = {}) => {
      const params: SqlValue[] = [];
      const filters: string[] = [];

      if (options.copierWallet) {
        params.push(options.copierWallet);
        filters.push(`copier_wallet = $${params.length}`);
      }

      if (options.sourcePositionId) {
        params.push(options.sourcePositionId);
        filters.push(`source_position_id = $${params.length}`);
      }

      if (options.sourceWallet) {
        params.push(options.sourceWallet);
        filters.push(`source_wallet = $${params.length}`);
      }

      params.push(normalizeLimit(options.limit ?? 50));
      const result = await execute(
        [
          "select receipt_id, copier_wallet, source_wallet, source_position_id, copied_position_id,",
          "mode, status, oracle_id, expiry_ms, strike, source_side, execution_side, amount_usd,",
          "quote_cost, transaction_digest, created_at_ms, updated_at_ms, raw",
          "from app_copy_receipts",
          filters.length > 0 ? `where ${filters.join(" and ")}` : "",
          "order by created_at_ms desc, receipt_id asc",
          `limit $${params.length}`,
        ].filter(Boolean).join("\n"),
        params,
      );

      return rows(result).map(mapCopyReceiptRow).filter(isDefined);
    },
    upsertWalletHeatSnapshot: async (input) =>
      rowsAffected(await execute(
        [
          "insert into app_wallet_heat_snapshots (wallet, scored_at_ms, heat_score, source, components)",
          "values ($1, $2, $3, $4, $5::jsonb)",
          "on conflict (wallet, scored_at_ms) do update set",
          "  heat_score = excluded.heat_score,",
          "  source = excluded.source,",
          "  components = excluded.components",
          "returning 1",
        ].join("\n"),
        [
          input.wallet,
          input.scoredAtMs,
          input.heatScore,
          input.source,
          JSON.stringify(input.components),
        ],
      )),
    listLatestWalletHeatSnapshots: async (options = {}) => {
      const params: SqlValue[] = [];
      const filters: string[] = [];

      if (options.wallet) {
        params.push(options.wallet);
        filters.push(`wallet = $${params.length}`);
      }

      params.push(normalizeLimit(options.limit ?? 100));
      const result = await execute(
        [
          "select distinct on (wallet) wallet, scored_at_ms, heat_score, source, components",
          "from app_wallet_heat_snapshots",
          filters.length > 0 ? `where ${filters.join(" and ")}` : "",
          "order by wallet asc, scored_at_ms desc",
          `limit $${params.length}`,
        ].filter(Boolean).join("\n"),
        params,
      );

      return rows(result).map(mapWalletHeatSnapshotRow).filter(isDefined);
    },
  };
}

function rows(result: SqlQueryResult | readonly Record<string, unknown>[]): readonly Record<string, unknown>[] {
  return isSqlRows(result) ? result : result.rows ?? [];
}

function firstRow(result: SqlQueryResult | readonly Record<string, unknown>[]): Record<string, unknown> | null {
  return rows(result)[0] ?? null;
}

function rowsAffected(result: SqlQueryResult | readonly Record<string, unknown>[]): number {
  if (isSqlRows(result)) {
    return result.length;
  }

  if (typeof result.rowCount === "number") {
    return result.rowCount;
  }

  return result.rows?.length ?? 0;
}

function isSqlRows(
  result: SqlQueryResult | readonly Record<string, unknown>[],
): result is readonly Record<string, unknown>[] {
  return Array.isArray(result);
}

function mapAuthChallengeRow(row: Record<string, unknown> | null): WalletAuthChallenge | null {
  if (!row) {
    return null;
  }

  const challengeId = stringValue(row.challenge_id);
  const wallet = stringValue(row.wallet);
  const nonce = stringValue(row.nonce);
  const message = stringValue(row.message);
  const issuedAtMs = numberValue(row.issued_at_ms);
  const expiresAtMs = numberValue(row.expires_at_ms);
  const consumedAtMs = optionalNumberValue(row.consumed_at_ms);

  if (!challengeId || !wallet || !nonce || !message || issuedAtMs === null || expiresAtMs === null) {
    return null;
  }

  return {
    challengeId,
    wallet,
    nonce,
    message,
    issuedAtMs,
    expiresAtMs,
    ...(consumedAtMs === undefined ? {} : { consumedAtMs }),
  };
}

function mapWalletSessionRow(row: Record<string, unknown> | null): WalletSession | null {
  if (!row) {
    return null;
  }

  const sessionId = stringValue(row.session_id);
  const wallet = stringValue(row.wallet);
  const tokenHash = stringValue(row.token_hash);
  const issuedAtMs = numberValue(row.issued_at_ms);
  const expiresAtMs = numberValue(row.expires_at_ms);
  const revokedAtMs = optionalNumberValue(row.revoked_at_ms);

  if (!sessionId || !wallet || !tokenHash || issuedAtMs === null || expiresAtMs === null) {
    return null;
  }

  return {
    sessionId,
    wallet,
    tokenHash,
    issuedAtMs,
    expiresAtMs,
    ...(revokedAtMs === undefined ? {} : { revokedAtMs }),
  };
}

function mapWalletFollowRow(row: Record<string, unknown>): WalletFollow | null {
  const followerWallet = stringValue(row.follower_wallet);
  const leaderWallet = stringValue(row.leader_wallet);
  const leaderDisplayName = stringValue(row.leader_display_name);
  const createdAtMs = numberValue(row.created_at_ms);
  const updatedAtMs = numberValue(row.updated_at_ms);

  if (!followerWallet || !leaderWallet || createdAtMs === null || updatedAtMs === null) {
    return null;
  }

  return {
    followerWallet,
    leaderWallet,
    ...(leaderDisplayName ? { leaderDisplayName } : {}),
    createdAtMs,
    updatedAtMs,
  };
}

function mapWalletProfileRow(row: Record<string, unknown> | null): WalletProfile | null {
  if (!row) {
    return null;
  }

  const wallet = stringValue(row.wallet);
  const displayName = stringValue(row.display_name);
  const bio = stringValue(row.bio);
  const avatarUrl = stringValue(row.avatar_url);
  const xHandle = stringValue(row.x_handle);
  const defaultStakeAmountUsd = optionalNumberValue(row.default_stake_amount_usd);
  const createdAtMs = numberValue(row.created_at_ms);
  const updatedAtMs = numberValue(row.updated_at_ms);

  if (!wallet || createdAtMs === null || updatedAtMs === null) {
    return null;
  }

  return {
    wallet,
    ...(displayName ? { displayName } : {}),
    ...(bio ? { bio } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(xHandle ? { xHandle } : {}),
    ...(defaultStakeAmountUsd === undefined ? {} : { defaultStakeAmountUsd }),
    createdAtMs,
    updatedAtMs,
  };
}

function mapCopyReceiptRow(row: Record<string, unknown>): CopyReceipt | null {
  const receiptId = stringValue(row.receipt_id);
  const copierWallet = stringValue(row.copier_wallet);
  const sourceWallet = stringValue(row.source_wallet);
  const sourcePositionId = stringValue(row.source_position_id);
  const mode = copyReceiptModeValue(row.mode);
  const status = copyReceiptStatusValue(row.status);
  const amountUsd = numberValue(row.amount_usd);
  const createdAtMs = numberValue(row.created_at_ms);
  const updatedAtMs = numberValue(row.updated_at_ms);

  if (
    !receiptId ||
    !copierWallet ||
    !sourceWallet ||
    !sourcePositionId ||
    !mode ||
    !status ||
    amountUsd === null ||
    createdAtMs === null ||
    updatedAtMs === null
  ) {
    return null;
  }

  return {
    receiptId,
    copierWallet,
    sourceWallet,
    sourcePositionId,
    mode,
    status,
    amountUsd,
    createdAtMs,
    updatedAtMs,
    ...(stringValue(row.copied_position_id) ? { copiedPositionId: stringValue(row.copied_position_id) as string } : {}),
    ...(stringValue(row.oracle_id) ? { oracleId: stringValue(row.oracle_id) as string } : {}),
    ...(optionalNumberValue(row.expiry_ms) === undefined ? {} : { expiryMs: optionalNumberValue(row.expiry_ms) as number }),
    ...(optionalNumberValue(row.strike) === undefined ? {} : { strike: optionalNumberValue(row.strike) as number }),
    ...(copyReceiptSideValue(row.source_side) ? { sourceSide: copyReceiptSideValue(row.source_side) as CopyReceiptSide } : {}),
    ...(copyReceiptSideValue(row.execution_side) ? { executionSide: copyReceiptSideValue(row.execution_side) as CopyReceiptSide } : {}),
    ...(optionalNumberValue(row.quote_cost) === undefined ? {} : { quoteCost: optionalNumberValue(row.quote_cost) as number }),
    ...(stringValue(row.transaction_digest) ? { transactionDigest: stringValue(row.transaction_digest) as string } : {}),
    raw: objectValue(row.raw),
  };
}

function mapWalletHeatSnapshotRow(row: Record<string, unknown>): WalletHeatSnapshot | null {
  const wallet = stringValue(row.wallet);
  const scoredAtMs = numberValue(row.scored_at_ms);
  const heatScore = numberValue(row.heat_score);
  const source = stringValue(row.source);

  if (!wallet || scoredAtMs === null || heatScore === null || !source) {
    return null;
  }

  return {
    wallet,
    scoredAtMs,
    heatScore,
    source,
    components: objectValue(row.components),
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function optionalNumberValue(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : numberValue(value) ?? undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function copyReceiptModeValue(value: unknown): CopyReceiptMode | null {
  return value === "copy" || value === "fade" ? value : null;
}

function copyReceiptStatusValue(value: unknown): CopyReceiptStatus | null {
  return value === "prepared" || value === "submitted" || value === "failed" ? value : null;
}

function copyReceiptSideValue(value: unknown): CopyReceiptSide | null {
  return value === "UP" || value === "DOWN" ? value : null;
}

function normalizeLimit(limit: number): number {
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 50;
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
