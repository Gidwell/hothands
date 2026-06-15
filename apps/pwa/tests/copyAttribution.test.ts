import { describe, expect, test } from "bun:test";
import {
  COPY_ATTRIBUTION_STORAGE_KEY,
  appendCopyAttributionRecord,
  buildCopyAttributionSourcePositionId,
  formatCopyAttributionLabel,
  parseCopyAttributionRecords,
  readCopyAttributionRecords,
  summarizeCopyAttribution,
  writeCopyAttributionRecords,
  type CopyAttributionRecord,
} from "../src/copyAttribution";

describe("copy attribution", () => {
  test("builds stable source position ids from feed rows", () => {
    expect(
      buildCopyAttributionSourcePositionId({
        expiryMs: 1_779_165_600_000,
        oracleId: "0xoracle",
        rowId: "feed-row-1",
        side: "UP",
        sourceWallet: "0xABC",
        strikeRaw: 62_500_000_000,
      }),
    ).toBe("0xabc:0xoracle:1779165600000:62500000000:UP");
  });

  test("keeps valid stored receipts and ignores malformed values", () => {
    const valid: CopyAttributionRecord = {
      amount: 25,
      copied_position_id: "copier-position",
      copier: "0xcopier",
      id: "copy-1",
      position_id: "source-position",
      source_wallet: "0xsource",
      timestamp: 1_779_158_000_000,
    };

    expect(parseCopyAttributionRecords(JSON.stringify([valid, { amount: "bad" }]))).toEqual([
      valid,
    ]);
    expect(parseCopyAttributionRecords("{not json")).toEqual([]);
  });

  test("summarizes only verified local copy receipts", () => {
    const target = {
      positionId: "0xsource:0xoracle:1779165600000:62500000000:UP",
      sourceWallet: "0xsource",
    };
    expect(summarizeCopyAttribution(target, [])).toEqual({
      amount: 0,
      count: 0,
    });

    const records = appendCopyAttributionRecord(
      [],
      {
        amount: 25,
        copied_position_id: "copier-position",
        copier: "0xcopier",
        position_id: target.positionId,
        source_wallet: target.sourceWallet,
        timestamp: 1_779_158_000_000,
      },
      "copy-1",
    );
    const summary = summarizeCopyAttribution(target, records);

    expect(summary.count).toBe(1);
    expect(summary.amount).toBe(25);
    expect(formatCopyAttributionLabel(summary)).toBe("1 copier · $25");
  });

  test("round-trips receipts through storage", () => {
    const storage = new Map<string, string>();
    const records: CopyAttributionRecord[] = [
      {
        amount: 50,
        copier: "0xcopier",
        id: "copy-1",
        position_id: "source-position",
        source_wallet: "0xsource",
        timestamp: 1_779_158_000_000,
      },
    ];
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };

    writeCopyAttributionRecords(storageLike, records);

    expect(storage.has(COPY_ATTRIBUTION_STORAGE_KEY)).toBe(true);
    expect(readCopyAttributionRecords(storageLike)).toEqual(records);
  });

});
