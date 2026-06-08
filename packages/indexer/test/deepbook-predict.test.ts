import { describe, expect, test } from "bun:test";
import {
  DEEPBOOK_PREDICT_TESTNET_CONFIG,
  buildPredictServerUrl,
  computeMarketHeat,
  createPredictOraclePriceClient,
  createPredictOracleSviClient,
  createPredictTradeHistoryClient,
  createPredictReadCanary,
  normalizePredictOraclePriceRow,
  normalizePredictOracleSviRow,
  normalizePredictTradeRow,
  parsePredictCanaryConfig,
  selectBestBtcOracle,
} from "../src/deepbook-predict";

describe("DeepBook Predict read canary config", () => {
  test("uses current public testnet integration targets with env overrides", () => {
    expect(parsePredictCanaryConfig({})).toEqual(DEEPBOOK_PREDICT_TESTNET_CONFIG);
    expect(
      parsePredictCanaryConfig({
        HOT_HANDS_PREDICT_SERVER_URL: "https://predict.example.test/api/",
        HOT_HANDS_PREDICT_OBJECT_ID: "0xabc",
        HOT_HANDS_PREDICT_QUOTE_ASSET:
          "0x2::demo::DUSDC",
        HOT_HANDS_PREDICT_BTC_ONLY: "false",
      }),
    ).toEqual({
      ...DEEPBOOK_PREDICT_TESTNET_CONFIG,
      serverUrl: "https://predict.example.test/api",
      predictObjectId: "0xabc",
      quoteAssetType: "0x2::demo::DUSDC",
      btcOnly: false,
    });
  });

  test("builds normalized Predict server URLs", () => {
    expect(buildPredictServerUrl("https://predict.example.test/api/", "/status")).toBe(
      "https://predict.example.test/api/status",
    );
    expect(buildPredictServerUrl("https://predict.example.test", "predicts/0x1/state")).toBe(
      "https://predict.example.test/predicts/0x1/state",
    );
  });
});

describe("DeepBook Predict BTC oracle selection", () => {
  test("prefers active BTC oracles, then newest expiry when no active oracle exists", () => {
    expect(
      selectBestBtcOracle([
        btcOracle({ oracle_id: "settled-new", expiry: 30, status: "settled" }),
        btcOracle({ oracle_id: "active-old", expiry: 10, status: "active" }),
        btcOracle({ oracle_id: "eth-active", underlying_asset: "ETH", expiry: 40, status: "active" }),
        btcOracle({ oracle_id: "active-new", expiry: 20, status: "active" }),
      ]),
    ).toMatchObject({
      oracle_id: "active-new",
      status: "active",
    });

    expect(
      selectBestBtcOracle([
        btcOracle({ oracle_id: "settled-old", expiry: 10, status: "settled" }),
        btcOracle({ oracle_id: "settled-new", expiry: 30, status: "settled" }),
      ]),
    ).toMatchObject({
      oracle_id: "settled-new",
    });
  });
});

describe("DeepBook Predict read canary", () => {
  test("reads status, state, oracles, and latest BTC price from injected fetch", async () => {
    const requests: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);

      if (url.endsWith("/status")) {
        return jsonResponse({
          status: "OK",
          latest_onchain_checkpoint: 100,
          max_checkpoint_lag: 2,
        });
      }

      if (url.endsWith("/state")) {
        return jsonResponse({
          predict_id: DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId,
          quote_assets: [DEEPBOOK_PREDICT_TESTNET_CONFIG.quoteAssetType.replace(/^0x/, "")],
        });
      }

      if (url.endsWith("/oracles")) {
        return jsonResponse([
          btcOracle({ oracle_id: "settled", expiry: 10, status: "settled" }),
          btcOracle({ oracle_id: "active-btc", expiry: 60, activated_at: 0, status: "active" }),
        ]);
      }

      if (url.endsWith("/prices/latest")) {
        return jsonResponse({
          oracle_id: "active-btc",
          spot: 64_200_000_000,
          forward: 64_300_000_000,
          checkpoint: 101,
        });
      }

      return jsonResponse({ error: "not_found" }, 404);
    };

    const result = await createPredictReadCanary({ fetchImpl }).run();

    expect(result).toMatchObject({
      ok: true,
      status: "OK",
      quoteAssetEnabled: true,
      btcOracleCount: 2,
      activeBtcOracleCount: 1,
      selectedBtcOracle: {
        oracle_id: "active-btc",
        status: "active",
      },
      availableBtcMarkets: [
        {
          oracleId: "active-btc",
          expiry: 60,
          expiryMs: 60_000,
          intervalLabel: "1m",
          status: "active",
          active: true,
          minStrike: 50_000_000_000,
          tickSize: 1_000_000,
          strikeCandidate: 64_300_000_000,
          latestPrice: {
            oracle_id: "active-btc",
            spot: 64_200_000_000,
          },
        },
      ],
      latestPrice: {
        oracle_id: "active-btc",
        spot: 64_200_000_000,
      },
    });
    expect(requests).toEqual([
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/status`,
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/predicts/${DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId}/state`,
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/predicts/${DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId}/oracles`,
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/oracles/active-btc/prices/latest`,
    ]);
  });

  test("lists active BTC market candidates ordered by expiry with current strike candidates", async () => {
    const requests: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);

      if (url.endsWith("/status")) {
        return jsonResponse({ status: "OK" });
      }

      if (url.endsWith("/state")) {
        return jsonResponse({
          predict_id: DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId,
          quote_assets: [DEEPBOOK_PREDICT_TESTNET_CONFIG.quoteAssetType],
        });
      }

      if (url.endsWith("/oracles")) {
        return jsonResponse([
          btcOracle({
            oracle_id: "btc-15m",
            expiry: 1_779_158_400,
            activated_at: 1_779_157_500,
            min_strike: 50_000_000_000,
            tick_size: 1_000_000,
            status: "active",
          }),
          btcOracle({
            oracle_id: "btc-1h",
            expiry: 1_779_161_100,
            activated_at: 1_779_157_500,
            min_strike: 50_000_000_000,
            tick_size: 5_000_000,
            status: "active",
          }),
          btcOracle({
            oracle_id: "btc-settled",
            expiry: 1_779_150_000,
            status: "settled",
          }),
          btcOracle({
            oracle_id: "eth-15m",
            underlying_asset: "ETH",
            expiry: 1_779_158_400,
            activated_at: 1_779_157_500,
            status: "active",
          }),
        ]);
      }

      if (url.endsWith("/oracles/btc-15m/prices/latest")) {
        return jsonResponse({
          oracle_id: "btc-15m",
          spot: 64_202_300_000,
          checkpoint: 101,
        });
      }

      if (url.endsWith("/oracles/btc-1h/prices/latest")) {
        return jsonResponse({
          oracle_id: "btc-1h",
          spot: 64_212_300_000,
          forward: 64_250_500_000,
          checkpoint: 102,
        });
      }

      return jsonResponse({ error: "not_found" }, 404);
    };

    const result = await createPredictReadCanary({ fetchImpl }).run();

    expect(result.activeBtcOracleCount).toBe(2);
    expect(result.selectedBtcOracle?.oracle_id).toBe("btc-1h");
    expect(result.latestPrice?.oracle_id).toBe("btc-1h");
    expect(result.availableBtcMarkets).toEqual([
      {
        oracleId: "btc-15m",
        expiry: 1_779_158_400,
        expiryMs: 1_779_158_400_000,
        intervalLabel: "15m",
        status: "active",
        active: true,
        minStrike: 50_000_000_000,
        tickSize: 1_000_000,
        strikeCandidate: 64_202_000_000,
        latestPrice: {
          oracle_id: "btc-15m",
          spot: 64_202_300_000,
          checkpoint: 101,
        },
      },
      {
        oracleId: "btc-1h",
        expiry: 1_779_161_100,
        expiryMs: 1_779_161_100_000,
        intervalLabel: "1h",
        status: "active",
        active: true,
        minStrike: 50_000_000_000,
        tickSize: 5_000_000,
        strikeCandidate: 64_250_000_000,
        latestPrice: {
          oracle_id: "btc-1h",
          spot: 64_212_300_000,
          forward: 64_250_500_000,
          checkpoint: 102,
        },
      },
    ]);
    expect(requests).toContain(
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/oracles/btc-15m/prices/latest`,
    );
    expect(requests).toContain(
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/oracles/btc-1h/prices/latest`,
    );
  });
});

describe("DeepBook Predict trade-history normalization", () => {
  test("normalizes captured public minted, redeemed, and oracle trade rows", () => {
    expect(normalizePredictTradeRow(capturedMintedRow)).toEqual({
      eventId: "mint:0xmintdigest:7",
      kind: "mint",
      actor: "0xtrader-hot",
      trader: "0xtrader-hot",
      managerId: "manager-btc-72k",
      oracleId: "btc-2026-05-19",
      expiryMs: 1_779_158_400_000,
      strike: 72_000_000_000,
      isUp: true,
      quantity: 3,
      cost: 1_200_000,
      payout: undefined,
      transactionDigest: "0xmintdigest",
      checkpoint: 4242,
      timestampMs: 1_779_070_800_000,
      source: "positions/minted",
    });

    expect(normalizePredictTradeRow(capturedRedeemedRow)).toMatchObject({
      eventId: "redeem:0xredeemdigest:3",
      kind: "redeem",
      actor: "0xtrader-hot",
      managerId: "manager-btc-72k",
      oracleId: "btc-2026-05-19",
      cost: undefined,
      payout: 1_800_000,
      source: "positions/redeemed",
    });

    expect(normalizePredictTradeRow(capturedOracleTradeRow)).toMatchObject({
      eventId: "mint:0xoracledigest:11",
      kind: "mint",
      actor: "0xtrader-warm",
      managerId: "manager-btc-75k",
      oracleId: "btc-2026-05-19",
      cost: 400_000,
      source: "trades/oracle",
    });
  });

  test("reads trade-history endpoints through injected fetch without live network calls", async () => {
    const requests: string[] = [];
    const client = createPredictTradeHistoryClient({
      fetchImpl: async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);

        if (url.includes("/positions/minted")) {
          return jsonResponse([capturedMintedRow]);
        }

        if (url.endsWith("/positions/redeemed")) {
          return jsonResponse([capturedRedeemedRow]);
        }

        if (url.endsWith("/trades/btc-2026-05-19")) {
          return jsonResponse([capturedOracleTradeRow]);
        }

        return jsonResponse({ error: "not_found" }, 404);
      },
    });

    await expect(client.listMintedPositions()).resolves.toEqual([
      normalizePredictTradeRow(capturedMintedRow),
    ]);
    await expect(client.listMintedPositions({ limit: 5000 })).resolves.toEqual([
      normalizePredictTradeRow(capturedMintedRow),
    ]);
    await expect(client.listRedeemedPositions()).resolves.toEqual([
      normalizePredictTradeRow(capturedRedeemedRow),
    ]);
    await expect(client.listOracleTrades("btc-2026-05-19")).resolves.toEqual([
      normalizePredictTradeRow(capturedOracleTradeRow),
    ]);

    expect(requests).toEqual([
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/positions/minted`,
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/positions/minted?limit=5000`,
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/positions/redeemed`,
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/trades/btc-2026-05-19`,
    ]);
  });

  test("reads oracle price history for charting through injected fetch", async () => {
    const requests: string[] = [];
    const client = createPredictOraclePriceClient({
      fetchImpl: async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);

        if (url.endsWith("/oracles/btc-2026-05-19/prices?limit=10000")) {
          return jsonResponse({
            prices: [
              {
                oracle_id: "btc-2026-05-19",
                spot: "72050000000",
                forward: "72070000000",
                checkpoint: "4251",
                checkpoint_timestamp_ms: "1779070860000",
              },
              {
                oracleId: "btc-2026-05-19",
                spot: 72_000_000_000,
                timestamp_ms: 1_779_070_800_000,
              },
            ],
          });
        }

        return jsonResponse({ error: "not_found" }, 404);
      },
    });

    await expect(client.listOraclePrices("btc-2026-05-19", { limit: 10_000 })).resolves.toEqual([
      {
        oracleId: "btc-2026-05-19",
        spot: 72_000_000_000,
        timestampMs: 1_779_070_800_000,
        source: "oracles/prices",
      },
      {
        oracleId: "btc-2026-05-19",
        spot: 72_050_000_000,
        forward: 72_070_000_000,
        checkpoint: 4251,
        timestampMs: 1_779_070_860_000,
        source: "oracles/prices",
      },
    ]);
    expect(
      normalizePredictOraclePriceRow(
        {
          spot: "72050000000",
          checkpoint_timestamp_ms: "1779070860000",
        },
        "btc-2026-05-19",
      ),
    ).toMatchObject({
      oracleId: "btc-2026-05-19",
      spot: 72_050_000_000,
      timestampMs: 1_779_070_860_000,
    });

    expect(requests).toEqual([
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/oracles/btc-2026-05-19/prices?limit=10000`,
    ]);
  });

  test("reads and normalizes oracle SVI history through injected fetch", async () => {
    const requests: string[] = [];
    const client = createPredictOracleSviClient({
      fetchImpl: async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);

        if (url.endsWith("/oracles/btc-2026-05-19/svi?limit=1000")) {
          return jsonResponse({
            rows: [
              {
                event_digest: "0xsvidigest",
                event_index: 9,
                oracle_id: "btc-2026-05-19",
                a: "1",
                b: "2",
                rho: "3",
                rho_negative: true,
                m: "5",
                m_negative: false,
                sigma: "7",
                checkpoint: "4252",
                checkpoint_timestamp_ms: "1779070870000",
              },
            ],
          });
        }

        return jsonResponse({ error: "not_found" }, 404);
      },
    });

    await expect(client.listOracleSvi("btc-2026-05-19", { limit: 1000 })).resolves.toEqual([
      {
        eventId: "svi:0xsvidigest:9",
        oracleId: "btc-2026-05-19",
        a: 1,
        b: 2,
        rho: 3,
        rhoNegative: 1,
        m: 5,
        mNegative: 0,
        sigma: 7,
        checkpoint: 4252,
        timestampMs: 1_779_070_870_000,
        source: "oracles/svi",
      },
    ]);
    expect(
      normalizePredictOracleSviRow(
        {
          oracle_id: "btc-2026-05-19",
          a: "1",
          b: "2",
          rho: "3",
          rho_negative: true,
          m: "5",
          m_negative: false,
          sigma: "7",
          checkpoint_timestamp_ms: "1779070870000",
        },
        "btc-2026-05-19",
      ),
    ).toMatchObject({
      eventId: "svi:btc-2026-05-19:1779070870000",
      oracleId: "btc-2026-05-19",
      rhoNegative: 1,
      mNegative: 0,
      sigma: 7,
      timestampMs: 1_779_070_870_000,
    });

    expect(requests).toEqual([
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/oracles/btc-2026-05-19/svi?limit=1000`,
    ]);
  });
});

describe("DeepBook Predict market heat scoring", () => {
  test("groups external traders by manager and ranks hot recent realized activity", () => {
    const events = [
      normalizePredictTradeRow(capturedMintedRow),
      normalizePredictTradeRow(capturedRedeemedRow),
      normalizePredictTradeRow({
        ...capturedOracleTradeRow,
        trader: "0xtrader-warm",
        cost: "400000",
        quantity: "1",
        timestamp_ms: 1_779_070_700_000,
      }),
      normalizePredictTradeRow({
        ...capturedRedeemedRow,
        owner: undefined,
        executor: "0xtrader-warm",
        manager_id: "manager-btc-75k",
        strike: "75000000000",
        is_up: false,
        payout: "0",
        digest: "0xwarmredeem",
        event_seq: 4,
      }),
    ];

    expect(computeMarketHeat(events, { nowMs: 1_779_071_000_000 })).toEqual([
      {
        trader: "0xtrader-hot",
        managerId: "manager-btc-72k",
        hotScore: 81,
        eventCount: 2,
        mintCount: 1,
        redeemCount: 1,
        recentWinCount: 1,
        realizedPnl: 600_000,
        observedVolume: 1_200_000,
        lastSeenMs: 1_779_070_900_000,
      },
      {
        trader: "0xtrader-warm",
        managerId: "manager-btc-75k",
        hotScore: 10,
        eventCount: 2,
        mintCount: 1,
        redeemCount: 1,
        recentWinCount: 0,
        realizedPnl: -400_000,
        observedVolume: 400_000,
        lastSeenMs: 1_779_070_900_000,
      },
    ]);
  });
});

function btcOracle(overrides: Record<string, unknown>) {
  return {
    predict_id: DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId,
    oracle_id: "btc-oracle",
    underlying_asset: "BTC",
    expiry: 1,
    min_strike: 50_000_000_000,
    tick_size: 1_000_000,
    status: "settled",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const capturedMintedRow = {
  event_digest: "0xmintdigest",
  event_index: 7,
  trader: "0xtrader-hot",
  manager_id: "manager-btc-72k",
  oracle_id: "btc-2026-05-19",
  expiry_ms: "1779158400000",
  strike: "72000000000",
  is_up: true,
  quantity: "3",
  cost: "1200000",
  checkpoint: "4242",
  checkpoint_timestamp_ms: "1779070800000",
};

const capturedRedeemedRow = {
  event_digest: "0xredeemdigest",
  event_index: 3,
  owner: "0xtrader-hot",
  executor: "0xexecutor",
  manager_id: "manager-btc-72k",
  oracle_id: "btc-2026-05-19",
  expiry_ms: "1779158400000",
  strike: "72000000000",
  is_up: true,
  quantity: "3",
  payout: "1800000",
  checkpoint: "4250",
  checkpoint_timestamp_ms: "1779070900000",
};

const capturedOracleTradeRow = {
  digest: "0xoracledigest",
  event_seq: 11,
  kind: "minted",
  trader: "0xtrader-warm",
  manager_id: "manager-btc-75k",
  oracle_id: "btc-2026-05-19",
  expiry: "1779158400",
  strike: "75000000000",
  is_up: false,
  quantity: "1",
  cost: "400000",
  checkpoint: "4245",
  timestamp_ms: "1779070850000",
};
