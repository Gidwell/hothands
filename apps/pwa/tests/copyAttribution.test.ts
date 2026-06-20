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
      copyAmount: 0,
      copyCount: 0,
      count: 0,
      fadeAmount: 0,
      fadeCount: 0,
    });

    const records = appendCopyAttributionRecord(
      [],
      {
        amount: 25,
        copied_position_id: "copier-position",
        copier: "0xcopier",
        mode: "copy",
        position_id: target.positionId,
        source_wallet: target.sourceWallet,
        timestamp: 1_779_158_000_000,
      },
      "copy-1",
    );
    const summary = summarizeCopyAttribution(target, records);

    expect(summary.count).toBe(1);
    expect(summary.copyCount).toBe(1);
    expect(summary.fadeCount).toBe(0);
    expect(summary.amount).toBe(25);
    expect(formatCopyAttributionLabel(summary)).toBe("1C");
  });

  test("does not count copy or fade receipts where the copier is the source wallet", () => {
    const target = {
      positionId: "source-position",
      sourceWallet: "0xsource",
    };
    const records = [
      appendCopyAttributionRecord(
        [],
        {
          amount: 25,
          copier: "0xsource",
          mode: "copy",
          position_id: target.positionId,
          source_wallet: target.sourceWallet,
          timestamp: 1_779_158_000_000,
        },
        "self-copy",
      )[0],
      appendCopyAttributionRecord(
        [],
        {
          amount: 20,
          copier: "0xSOURCE",
          mode: "fade",
          position_id: target.positionId,
          source_wallet: target.sourceWallet,
          timestamp: 1_779_158_100_000,
        },
        "self-fade",
      )[0],
      appendCopyAttributionRecord(
        [],
        {
          amount: 15,
          copier: "0xfollower",
          mode: "copy",
          position_id: target.positionId,
          source_wallet: target.sourceWallet,
          timestamp: 1_779_158_200_000,
        },
        "copy-1",
      )[0],
    ].filter((record): record is CopyAttributionRecord => Boolean(record));

    const summary = summarizeCopyAttribution(target, records);

    expect(summary).toMatchObject({
      amount: 15,
      copyAmount: 15,
      copyCount: 1,
      count: 1,
      fadeAmount: 0,
      fadeCount: 0,
    });
    expect(formatCopyAttributionLabel(summary)).toBe("1C");
  });

  test("formats mixed copy and fade receipts compactly", () => {
    const target = {
      positionId: "source-position",
      sourceWallet: "0xsource",
    };
    const records = [
      appendCopyAttributionRecord(
        [],
        {
          amount: 25,
          copier: "0xcopier",
          mode: "copy",
          position_id: target.positionId,
          source_wallet: target.sourceWallet,
          timestamp: 1_779_158_000_000,
        },
        "copy-1",
      )[0],
      appendCopyAttributionRecord(
        [],
        {
          amount: 20,
          copier: "0xfader",
          mode: "fade",
          position_id: target.positionId,
          source_wallet: target.sourceWallet,
          timestamp: 1_779_158_100_000,
        },
        "fade-1",
      )[0],
    ].filter((record): record is CopyAttributionRecord => Boolean(record));

    const summary = summarizeCopyAttribution(target, records);

    expect(summary).toMatchObject({
      amount: 45,
      copyCount: 1,
      count: 2,
      fadeCount: 1,
    });
    expect(formatCopyAttributionLabel(summary)).toBe("1C/1F");
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
