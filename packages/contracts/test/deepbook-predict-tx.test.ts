import { describe, expect, test } from "bun:test";
import {
  DEEPBOOK_PREDICT_TESTNET_TX_CONFIG,
  DEEPBOOK_PREDICT_TARGETS,
  buildCopyNextMintIntent,
  buildCopyNextMintTransaction,
  buildCreatePredictManagerTransaction,
  buildDepositQuoteTransaction,
  buildRedeemPositionTransaction,
  buildWithdrawQuoteBankrollTransaction,
  explainPredictMintDryRunPrerequisites,
  parsePredictTxBuilderConfig,
  serializeCopyNextMintIntent,
} from "../src/index";

describe("DeepBook Predict transaction config", () => {
  test("centralizes the current public testnet targets with env overrides", () => {
    expect(parsePredictTxBuilderConfig({})).toEqual(DEEPBOOK_PREDICT_TESTNET_TX_CONFIG);
    expect(
      parsePredictTxBuilderConfig({
        HOT_HANDS_PREDICT_PACKAGE_ID: "0x1",
        HOT_HANDS_PREDICT_REGISTRY_ID: "0x2",
        HOT_HANDS_PREDICT_OBJECT_ID: "0x3",
        HOT_HANDS_PREDICT_QUOTE_ASSET: "0x4::quote::QUOTE",
      }),
    ).toEqual({
      ...DEEPBOOK_PREDICT_TESTNET_TX_CONFIG,
      predictPackageId: "0x1",
      predictRegistryId: "0x2",
      predictObjectId: "0x3",
      quoteAssetType: "0x4::quote::QUOTE",
    });
  });

  test("exposes exact Move target strings", () => {
    expect(DEEPBOOK_PREDICT_TARGETS).toEqual({
      createManager:
        "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::predict::create_manager",
      deposit:
        "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::predict_manager::deposit",
      withdraw:
        "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::predict_manager::withdraw",
      marketKeyNew:
        "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::market_key::new",
      marketKeyUp:
        "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::market_key::up",
      marketKeyDown:
        "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::market_key::down",
      mint:
        "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::predict::mint",
      redeem:
        "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::predict::redeem",
    });
  });
});

describe("copy-next binary mint intent", () => {
  test("builds a deterministic serializable UP mint plan", () => {
    expect(
      buildCopyNextMintIntent({
        direction: "up",
        oracleId:
          "0x4444444444444444444444444444444444444444444444444444444444444444",
        expiry: 1_779_193_600,
        strike: 65_000_000_000,
        quantity: 2_500_000,
        predictManagerObjectId:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        clockObjectId: "0x6",
      }),
    ).toEqual({
      kind: "deepbook-predict-copy-next-mint-intent",
      version: 1,
      network: "testnet",
      direction: "up",
      oracleId:
        "0x4444444444444444444444444444444444444444444444444444444444444444",
      expiry: "1779193600",
      strike: "65000000000",
      quantity: "2500000",
      quoteAssetType:
        "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC",
      objects: {
        predict:
          "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a",
        predictManager:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        oracle:
          "0x4444444444444444444444444444444444444444444444444444444444444444",
        clock: "0x6",
      },
      targets: {
        marketKey:
          "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::market_key::new",
        mint:
          "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::predict::mint",
      },
      transactionPlan: [
        {
          target:
            "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::market_key::new",
          arguments: [
            "0x4444444444444444444444444444444444444444444444444444444444444444",
            "1779193600",
            "65000000000",
            true,
          ],
        },
        {
          target:
            "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::predict::mint",
          typeArguments: [
            "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC",
          ],
          arguments: [
            "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a",
            "0x1111111111111111111111111111111111111111111111111111111111111111",
            "0x4444444444444444444444444444444444444444444444444444444444444444",
            "$marketKey",
            "2500000",
            "0x6",
          ],
        },
      ],
    });
  });

  test("builds a DOWN mint plan with explicit objects and quote type", () => {
    const intent = buildCopyNextMintIntent({
      direction: "down",
      oracleId: "0x4444",
      expiry: "1779193600",
      strike: "65000000000",
      quantity: "1",
      predictObjectId:
        "0x2222222222222222222222222222222222222222222222222222222222222222",
      predictManagerObjectId:
        "0x3333333333333333333333333333333333333333333333333333333333333333",
      clockObjectId: "0x6",
      quoteAssetType: "0x4::quote::QUOTE",
    });

    expect(intent.transactionPlan[0]?.arguments.at(-1)).toBe(false);
    expect(intent.objects.predict).toBe(
      "0x2222222222222222222222222222222222222222222222222222222222222222",
    );
    expect(intent.quoteAssetType).toBe("0x4::quote::QUOTE");
  });

  test("serializes a deterministic mint intent payload", () => {
    const intent = buildCopyNextMintIntent({
      direction: "down",
      oracleId: "0x4444",
      expiry: 1,
      strike: 2,
      quantity: 3,
      predictManagerObjectId:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      clockObjectId: "0x6",
    });

    expect(JSON.parse(serializeCopyNextMintIntent(intent))).toEqual(intent);
    expect(serializeCopyNextMintIntent(intent)).toContain(
      '"kind":"deepbook-predict-copy-next-mint-intent"',
    );
  });

  test("rejects invalid copy-next mint inputs", () => {
    const valid = {
      direction: "up" as const,
      oracleId: "0x4444",
      expiry: 1,
      strike: 1,
      quantity: 1,
      predictManagerObjectId:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      clockObjectId: "0x6",
    };

    expect(() => buildCopyNextMintIntent({ ...valid, quantity: 0 })).toThrow(
      "quantity must be a positive integer",
    );
    expect(() => buildCopyNextMintIntent({ ...valid, strike: -1 })).toThrow(
      "strike must be a positive integer",
    );
    expect(() => buildCopyNextMintIntent({ ...valid, expiry: "0" })).toThrow(
      "expiry must be a positive integer",
    );
    expect(() => buildCopyNextMintIntent({ ...valid, oracleId: "btc-oracle" })).toThrow(
      "oracleId must be a Sui object id",
    );
  });
});

describe("DeepBook Predict SDK transaction builders", () => {
  test("builds a create-manager transaction", () => {
    const tx = buildCreatePredictManagerTransaction();
    const commands = moveCalls(tx);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      package: DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictPackageId,
      module: "predict",
      function: "create_manager",
      typeArguments: [],
    });
    expect(typeof tx.serialize()).toBe("string");
  });

  test("builds an existing-manager mint transaction from a serializable intent", () => {
    const intent = buildCopyNextMintIntent({
      direction: "up",
      oracleId:
        "0x4444444444444444444444444444444444444444444444444444444444444444",
      expiry: 1_779_193_600,
      strike: 65_000_000_000,
      quantity: 2_500_000,
      predictManagerObjectId:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
    });
    const tx = buildCopyNextMintTransaction(intent);
    const data = tx.getData();
    const commands = moveCalls(tx);

    expect(commands).toHaveLength(2);
    expect(commands[0]).toMatchObject({
      package: DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictPackageId,
      module: "market_key",
      function: "new",
      typeArguments: [],
      arguments: [
        { Input: 0, type: "pure" },
        { Input: 1, type: "pure" },
        { Input: 2, type: "pure" },
        { Input: 3, type: "pure" },
      ],
    });
    expect(commands[1]).toMatchObject({
      package: DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictPackageId,
      module: "predict",
      function: "mint",
      typeArguments: [DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.quoteAssetType],
      arguments: [
        { Input: 4, type: "object" },
        { Input: 5, type: "object" },
        { Input: 6, type: "object" },
        { Result: 0 },
        { Input: 7, type: "pure" },
        { Input: 8, type: "object" },
      ],
    });
    expect(data.inputs[8]).toMatchObject({
      Object: {
        SharedObject: {
          objectId:
            "0x0000000000000000000000000000000000000000000000000000000000000006",
        },
      },
    });
    expect(typeof tx.serialize()).toBe("string");
  });

  test("builds a quote deposit transaction from an owned quote coin", () => {
    const tx = buildDepositQuoteTransaction({
      predictManagerObjectId:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      quoteCoinObjectId:
        "0x2222222222222222222222222222222222222222222222222222222222222222",
      amount: 2_500_000,
    });
    const data = tx.getData();

    expect(data.commands).toHaveLength(2);
    expect(data.commands[0]).toMatchObject({
      SplitCoins: {
        coin: { Input: 0, type: "object" },
        amounts: [{ Input: 1, type: "pure" }],
      },
    });
    expect(data.commands[1]).toMatchObject({
      MoveCall: {
        package: DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictPackageId,
        module: "predict_manager",
        function: "deposit",
        typeArguments: [DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.quoteAssetType],
        arguments: [
          { Input: 2, type: "object" },
          { NestedResult: [0, 0] },
        ],
      },
    });
    expect(typeof tx.serialize()).toBe("string");
  });

  test("validates quote deposit inputs", () => {
    const valid = {
      predictManagerObjectId:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      quoteCoinObjectId:
        "0x2222222222222222222222222222222222222222222222222222222222222222",
      amount: 1,
    };

    expect(() => buildDepositQuoteTransaction({ ...valid, amount: 0 })).toThrow(
      "amount must be a positive integer",
    );
    expect(() =>
      buildDepositQuoteTransaction({ ...valid, quoteCoinObjectId: "quote-coin" }),
    ).toThrow("quoteCoinObjectId must be a Sui object id");
    expect(() =>
      buildDepositQuoteTransaction({ ...valid, predictManagerObjectId: "manager" }),
    ).toThrow("predictManagerObjectId must be a Sui object id");
  });

  test("builds a quote bankroll withdraw transaction to a recipient", () => {
    const tx = buildWithdrawQuoteBankrollTransaction({
      predictManagerObjectId:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      amount: 2_500_000,
      recipientAddress:
        "0x3333333333333333333333333333333333333333333333333333333333333333",
    });
    const data = tx.getData();

    expect(data.commands).toHaveLength(2);
    expect(data.commands[0]).toMatchObject({
      MoveCall: {
        package: DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictPackageId,
        module: "predict_manager",
        function: "withdraw",
        typeArguments: [DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.quoteAssetType],
        arguments: [
          { Input: 0, type: "object" },
          { Input: 1, type: "pure" },
        ],
      },
    });
    expect(data.commands[1]).toMatchObject({
      TransferObjects: {
        objects: [{ Result: 0 }],
        address: { Input: 2, type: "pure" },
      },
    });
    expect(typeof tx.serialize()).toBe("string");
  });

  test("validates quote bankroll withdraw inputs", () => {
    const valid = {
      predictManagerObjectId:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      amount: 1,
      recipientAddress:
        "0x3333333333333333333333333333333333333333333333333333333333333333",
    };

    expect(() =>
      buildWithdrawQuoteBankrollTransaction({ ...valid, amount: 0 }),
    ).toThrow("amount must be a positive integer");
    expect(() =>
      buildWithdrawQuoteBankrollTransaction({
        ...valid,
        predictManagerObjectId: "manager",
      }),
    ).toThrow("predictManagerObjectId must be a Sui object id");
    expect(() =>
      buildWithdrawQuoteBankrollTransaction({
        ...valid,
        recipientAddress: "recipient",
      }),
    ).toThrow("recipientAddress must be a Sui address");
  });

  test("builds a redeem transaction for an existing UP/DOWN position", () => {
    const tx = buildRedeemPositionTransaction({
      direction: "down",
      oracleId:
        "0x4444444444444444444444444444444444444444444444444444444444444444",
      expiry: 1_779_193_600,
      strike: 65_000_000_000,
      quantity: 2_500_000,
      predictManagerObjectId:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
    });
    const data = tx.getData();
    const commands = moveCalls(tx);

    expect(commands).toHaveLength(2);
    expect(commands[0]).toMatchObject({
      package: DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictPackageId,
      module: "market_key",
      function: "new",
      typeArguments: [],
    });
    expect(commands[1]).toMatchObject({
      package: DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictPackageId,
      module: "predict",
      function: "redeem",
      typeArguments: [DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.quoteAssetType],
      arguments: [
        { Input: 4, type: "object" },
        { Input: 5, type: "object" },
        { Input: 6, type: "object" },
        { Result: 0 },
        { Input: 7, type: "pure" },
        { Input: 8, type: "object" },
      ],
    });
    expect(data.inputs[8]).toMatchObject({
      Object: {
        SharedObject: {
          objectId:
            "0x0000000000000000000000000000000000000000000000000000000000000006",
        },
      },
    });
    expect(typeof tx.serialize()).toBe("string");
  });

  test("validates redeem transaction inputs", () => {
    const valid = {
      direction: "up" as const,
      oracleId:
        "0x4444444444444444444444444444444444444444444444444444444444444444",
      expiry: 1,
      strike: 1,
      quantity: 1,
      predictManagerObjectId:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
    };

    expect(() => buildRedeemPositionTransaction({ ...valid, quantity: 0 })).toThrow(
      "quantity must be a positive integer",
    );
    expect(() =>
      buildRedeemPositionTransaction({ ...valid, oracleId: "btc-oracle" }),
    ).toThrow("oracleId must be a Sui object id");
    expect(() =>
      buildRedeemPositionTransaction({ ...valid, predictManagerObjectId: "manager" }),
    ).toThrow("predictManagerObjectId must be a Sui object id");
  });
});

describe("Predict dry-run guardrail", () => {
  test("documents why live dry-run is still gated", () => {
    expect(explainPredictMintDryRunPrerequisites()).toEqual({
      ok: false,
      reason:
        "Live Predict dry-run needs funded testnet objects: an owned PredictManager, DUSDC coin object, oracle object, and gas. This package emits SDK transactions but does not discover or fund those objects.",
    });
  });
});

function moveCalls(tx: { getData(): { commands: unknown[] } }) {
  return tx
    .getData()
    .commands.map((command) => (command as { MoveCall?: unknown }).MoveCall)
    .filter(Boolean);
}
