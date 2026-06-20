export const COPY_ATTRIBUTION_STORAGE_KEY = "hot-hands-copy-attribution-records";
const MAX_STORED_COPY_ATTRIBUTIONS = 200;

export type CopyAttributionMode = "copy" | "fade";

export type CopyAttributionRecord = {
  id: string;
  copier: string;
  source_wallet: string;
  position_id: string;
  amount: number;
  timestamp: number;
  mode?: CopyAttributionMode;
  copied_position_id?: string;
};

export type CopyAttributionInput = Omit<CopyAttributionRecord, "id">;

export type CopyAttributionTarget = {
  positionId: string;
  sourceWallet: string;
};

export type CopyAttributionSummary = {
  amount: number;
  count: number;
  copyAmount: number;
  copyCount: number;
  fadeAmount: number;
  fadeCount: number;
};

type CopyAttributionStorage = Pick<Storage, "getItem" | "setItem">;

export function buildCopyAttributionSourcePositionId({
  expiryMs,
  oracleId,
  rowId,
  side,
  sourceWallet,
  strikeRaw,
}: {
  expiryMs: number;
  oracleId?: string | null;
  rowId: string;
  side: "UP" | "DOWN";
  sourceWallet: string;
  strikeRaw?: number | null;
}): string {
  const normalizedWallet = sourceWallet.trim().toLowerCase();
  const normalizedOracle = (oracleId ?? rowId).trim();
  const normalizedStrike =
    typeof strikeRaw === "number" && Number.isFinite(strikeRaw)
      ? Math.trunc(strikeRaw)
      : "unknown";
  const normalizedExpiry = Number.isFinite(expiryMs) ? Math.trunc(expiryMs) : "unknown";

  return [
    normalizedWallet || "unknown-wallet",
    normalizedOracle || rowId,
    normalizedExpiry,
    normalizedStrike,
    side,
  ].join(":");
}

export function readCopyAttributionRecords(
  storage: CopyAttributionStorage | null | undefined,
): CopyAttributionRecord[] {
  if (!storage) {
    return [];
  }

  return parseCopyAttributionRecords(storage.getItem(COPY_ATTRIBUTION_STORAGE_KEY));
}

export function writeCopyAttributionRecords(
  storage: CopyAttributionStorage | null | undefined,
  records: CopyAttributionRecord[],
): void {
  if (!storage) {
    return;
  }

  storage.setItem(
    COPY_ATTRIBUTION_STORAGE_KEY,
    JSON.stringify(records.slice(0, MAX_STORED_COPY_ATTRIBUTIONS)),
  );
}

export function parseCopyAttributionRecords(serialized: string | null): CopyAttributionRecord[] {
  if (!serialized) {
    return [];
  }

  try {
    const parsed = JSON.parse(serialized);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(parseCopyAttributionRecord)
      .filter((record): record is CopyAttributionRecord => record !== null)
      .slice(0, MAX_STORED_COPY_ATTRIBUTIONS);
  } catch {
    return [];
  }
}

export function appendCopyAttributionRecord(
  records: CopyAttributionRecord[],
  input: CopyAttributionInput,
  id = `copy-${Date.now()}-${records.length + 1}`,
): CopyAttributionRecord[] {
  const record = parseCopyAttributionRecord({ ...input, id });

  if (!record) {
    return records;
  }

  return [record, ...records].slice(0, MAX_STORED_COPY_ATTRIBUTIONS);
}

export function summarizeCopyAttribution(
  target: CopyAttributionTarget,
  records: CopyAttributionRecord[],
): CopyAttributionSummary {
  const normalizedWallet = target.sourceWallet.toLowerCase();
  const localRecords = records.filter(
    (record) =>
      record.position_id === target.positionId &&
      record.source_wallet.toLowerCase() === normalizedWallet &&
      record.copier.toLowerCase() !== normalizedWallet,
  );

  return {
    count: localRecords.length,
    amount: localRecords.reduce(
      (total, record) => total + (Number.isFinite(record.amount) ? record.amount : 0),
      0,
    ),
    copyCount: localRecords.filter((record) => (record.mode ?? "copy") === "copy").length,
    copyAmount: localRecords.reduce(
      (total, record) =>
        (record.mode ?? "copy") === "copy" && Number.isFinite(record.amount)
          ? total + record.amount
          : total,
      0,
    ),
    fadeCount: localRecords.filter((record) => record.mode === "fade").length,
    fadeAmount: localRecords.reduce(
      (total, record) =>
        record.mode === "fade" && Number.isFinite(record.amount)
          ? total + record.amount
          : total,
      0,
    ),
  };
}

export function formatCopyAttributionLabel(summary: CopyAttributionSummary): string {
  const copyCount = Math.max(0, Math.floor(summary.copyCount ?? summary.count));
  const fadeCount = Math.max(0, Math.floor(summary.fadeCount ?? 0));
  const labels = [
    copyCount > 0 ? `${copyCount.toLocaleString("en-US")}C` : null,
    fadeCount > 0 ? `${fadeCount.toLocaleString("en-US")}F` : null,
  ].filter((label): label is string => Boolean(label));

  return labels.length ? labels.join("/") : "0C";
}

export function formatCopyAttributionDetailLabel(summary: CopyAttributionSummary): string {
  const copyCount = Math.max(0, Math.floor(summary.copyCount ?? summary.count));
  const fadeCount = Math.max(0, Math.floor(summary.fadeCount ?? 0));
  const labels = [
    copyCount > 0
      ? `${copyCount.toLocaleString("en-US")} ${copyCount === 1 ? "copy" : "copies"}`
      : null,
    fadeCount > 0
      ? `${fadeCount.toLocaleString("en-US")} ${fadeCount === 1 ? "fade" : "fades"}`
      : null,
  ].filter((label): label is string => Boolean(label));

  return labels.length ? labels.join(" - ") : "0 copies";
}

export function formatCopyAttributionAmount(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;

  return `$${safeAmount.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(safeAmount) ? 0 : 2,
  })}`;
}

function parseCopyAttributionRecord(value: unknown): CopyAttributionRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<CopyAttributionRecord>;
  const id = stringValue(record.id);
  const copier = stringValue(record.copier);
  const sourceWallet = stringValue(record.source_wallet);
  const positionId = stringValue(record.position_id);
  const amount = finiteNumber(record.amount);
  const timestamp = finiteNumber(record.timestamp);
  const mode = copyAttributionModeValue(record.mode);
  const copiedPositionId = stringValue(record.copied_position_id);

  if (!id || !copier || !sourceWallet || !positionId || amount === null || timestamp === null) {
    return null;
  }

  return {
    id,
    copier,
    source_wallet: sourceWallet,
    position_id: positionId,
    amount,
    timestamp,
    ...(mode ? { mode } : {}),
    ...(copiedPositionId ? { copied_position_id: copiedPositionId } : {}),
  };
}

function copyAttributionModeValue(value: unknown): CopyAttributionMode | null {
  return value === "copy" || value === "fade" ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
