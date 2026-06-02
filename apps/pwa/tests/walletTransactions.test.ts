import { describe, expect, test } from "bun:test";
import { DEEPBOOK_PREDICT_TESTNET_TX_CONFIG } from "@hot-hands/contracts";
import {
  buildPortfolioRedeemTransaction,
  buildTradeMintTransaction,
} from "../src/walletTransactions";

const market = {
  id: "btc-2h-72000",
  oracleId: "0x4444444444444444444444444444444444444444444444444444444444444444",
  pairLabel: "BTC/USD",
  intervalLabel: "2h",
  roundLabel: "2h round",
  expiry: 1_779_172_200_000,
  expiryMs: 1_779_172_200_000,
  expiryTimeLabel: "May 18, 23:30 PDT",
  timeRemainingLabel: "2h left",
  strike: 72_000,
  strikeRaw: 72_000_000_000,
  strikeLabel: "$72,000",
  moneynessLabel: "+$950 vs spot",
  activityLabel: "No recent trades",
  uniqueWalletCount: 0,
  tradeCount: 0,
  distinctStrikeCount: 0,
  volumeUsd: 0,
  volumeLabel: "$0",
  up: {
    walletCount: 0,
    tradeCount: 0,
    volumeUsd: 0,
    volumeLabel: "$0",
  },
  down: {
    walletCount: 0,
    tradeCount: 0,
    volumeUsd: 0,
    volumeLabel: "$0",
  },
};

const quote = {
  source: "live_testnet",
  market: "BTC-USD",
  oracleId: "0x4444444444444444444444444444444444444444444444444444444444444444",
  expiry: "1779172200000",
  strike: "72000000000",
  side: "UP",
  requestedSpendUsd: 25,
  cost: "24980000",
  costUsd: 24.98,
  quantity: "49960000",
  payoutUsd: 49.96,
  maxProfitUsd: 24.98,
  redeemPayout: "24100000",
  redeemPayoutUsd: 24.1,
  effectivePrice: 0.5,
  quoteStatus: "ready" as const,
};

describe("wallet transaction helpers", () => {
  test("builds a DeepBook Predict mint transaction from a quoted trade row", () => {
    const tx = buildTradeMintTransaction({
      predictManagerObjectId:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      market,
      quote,
    });

    const moveCalls = tx
      .getData()
      .commands.map((command) => (command as { MoveCall?: unknown }).MoveCall)
      .filter(Boolean);

    expect(moveCalls).toHaveLength(2);
    expect(moveCalls[0]).toMatchObject({
      package: DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictPackageId,
      module: "market_key",
      function: "new",
    });
    expect(moveCalls[1]).toMatchObject({
      package: DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictPackageId,
      module: "predict",
      function: "mint",
      typeArguments: [DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.quoteAssetType],
    });
    expect(typeof tx.serialize()).toBe("string");
  });

  test("rejects mismatched quote and market inputs before wallet signing", () => {
    expect(() =>
      buildTradeMintTransaction({
        predictManagerObjectId:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        market,
        quote: {
          ...quote,
          oracleId:
            "0x5555555555555555555555555555555555555555555555555555555555555555",
        },
      }),
    ).toThrow("Quote oracle does not match the selected market.");
  });

  test("builds a redeem transaction from a portfolio row", () => {
    const tx = buildPortfolioRedeemTransaction({
      predictManagerObjectId:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      position: {
        actionLabel: "Claim",
        costBasisLabel: "$1.80",
        direction: "DOWN",
        expiry: 1_779_193_600,
        expiryMs: 1_779_193_600_000,
        expiryTimeLabel: "May 18, 2026, 9:46 PM",
        id: "position",
        isExpired: true,
        managerId:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        maxPayoutLabel: "$4",
        oracleId:
          "0x4444444444444444444444444444444444444444444444444444444444444444",
        quantity: "4000000",
        statusLabel: "Expired",
        strike: "65000000000",
        strikeLabel: "$65,000.00",
        timeLabel: "Expired",
      },
    });
    const moveCalls = tx
      .getData()
      .commands.map((command) => (command as { MoveCall?: unknown }).MoveCall)
      .filter(Boolean);

    expect(moveCalls[1]).toMatchObject({
      package: DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictPackageId,
      module: "predict",
      function: "redeem",
      typeArguments: [DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.quoteAssetType],
    });
    expect(typeof tx.serialize()).toBe("string");
  });
});
