import { Transaction } from "@mysten/sui/transactions";

export type DeepBookPredictTxConfig = {
  network: "testnet";
  predictPackageId: string;
  predictRegistryId: string;
  predictObjectId: string;
  quoteAssetType: string;
  docsPin: string;
};

export type PredictDirection = "up" | "down";

export type DeepBookPredictTargets = {
  createManager: string;
  deposit: string;
  withdraw: string;
  marketKeyNew: string;
  marketKeyUp: string;
  marketKeyDown: string;
  mint: string;
  redeem: string;
};

export type CopyNextMintIntentInput = {
  direction: PredictDirection;
  oracleId: string;
  expiry: IntegerLike;
  strike: IntegerLike;
  quantity: IntegerLike;
  predictObjectId?: string;
  predictManagerObjectId: string;
  clockObjectId?: string;
  quoteAssetType?: string;
  config?: DeepBookPredictTxConfig;
};

export type DepositQuoteTransactionInput = {
  predictManagerObjectId: string;
  quoteCoinObjectId: string;
  amount: IntegerLike;
  quoteAssetType?: string;
  config?: DeepBookPredictTxConfig;
};

export type WithdrawQuoteBankrollTransactionInput = {
  predictManagerObjectId: string;
  amount: IntegerLike;
  recipientAddress: string;
  quoteAssetType?: string;
  config?: DeepBookPredictTxConfig;
};

export type RedeemPositionTransactionInput = {
  direction: PredictDirection;
  oracleId: string;
  expiry: IntegerLike;
  strike: IntegerLike;
  quantity: IntegerLike;
  predictObjectId?: string;
  predictManagerObjectId: string;
  clockObjectId?: string;
  quoteAssetType?: string;
  config?: DeepBookPredictTxConfig;
};

export type CopyNextMintIntent = {
  kind: "deepbook-predict-copy-next-mint-intent";
  version: 1;
  network: "testnet";
  direction: PredictDirection;
  oracleId: string;
  expiry: string;
  strike: string;
  quantity: string;
  quoteAssetType: string;
  objects: {
    predict: string;
    predictManager: string;
    oracle: string;
    clock: string;
  };
  targets: {
    marketKey: string;
    mint: string;
  };
  transactionPlan: TransactionPlanStep[];
};

export type TransactionPlanStep = {
  target: string;
  typeArguments?: string[];
  arguments: Array<string | boolean>;
};

type IntegerLike = bigint | number | string;

export const DEEPBOOK_PREDICT_TESTNET_TX_CONFIG: DeepBookPredictTxConfig = {
  network: "testnet",
  predictPackageId:
    "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138",
  predictRegistryId:
    "0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64",
  predictObjectId:
    "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a",
  quoteAssetType:
    "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC",
  docsPin: "predict-testnet-4-16",
};

export const DEEPBOOK_PREDICT_TARGETS = buildDeepBookPredictTargets(
  DEEPBOOK_PREDICT_TESTNET_TX_CONFIG,
);

export function parsePredictTxBuilderConfig(
  env: Record<string, string | undefined>,
): DeepBookPredictTxConfig {
  return {
    ...DEEPBOOK_PREDICT_TESTNET_TX_CONFIG,
    predictPackageId:
      env.HOT_HANDS_PREDICT_PACKAGE_ID ??
      DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictPackageId,
    predictRegistryId:
      env.HOT_HANDS_PREDICT_REGISTRY_ID ??
      DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictRegistryId,
    predictObjectId:
      env.HOT_HANDS_PREDICT_OBJECT_ID ??
      DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictObjectId,
    quoteAssetType:
      env.HOT_HANDS_PREDICT_QUOTE_ASSET ??
      DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.quoteAssetType,
  };
}

export function buildDeepBookPredictTargets(
  config: DeepBookPredictTxConfig = DEEPBOOK_PREDICT_TESTNET_TX_CONFIG,
): DeepBookPredictTargets {
  const pkg = config.predictPackageId;

  return {
    createManager: `${pkg}::predict::create_manager`,
    deposit: `${pkg}::predict_manager::deposit`,
    withdraw: `${pkg}::predict_manager::withdraw`,
    marketKeyNew: `${pkg}::market_key::new`,
    marketKeyUp: `${pkg}::market_key::up`,
    marketKeyDown: `${pkg}::market_key::down`,
    mint: `${pkg}::predict::mint`,
    redeem: `${pkg}::predict::redeem`,
  };
}

export function buildCopyNextMintIntent(
  input: CopyNextMintIntentInput,
): CopyNextMintIntent {
  const config = input.config ?? DEEPBOOK_PREDICT_TESTNET_TX_CONFIG;
  const targets = buildDeepBookPredictTargets(config);
  const expiry = toPositiveIntegerString(input.expiry, "expiry");
  const strike = toPositiveIntegerString(input.strike, "strike");
  const quantity = toPositiveIntegerString(input.quantity, "quantity");
  const predictObjectId = input.predictObjectId ?? config.predictObjectId;
  const clockObjectId = input.clockObjectId ?? "0x6";
  const quoteAssetType = input.quoteAssetType ?? config.quoteAssetType;
  const isUp = input.direction === "up";

  assertNonEmpty(input.oracleId, "oracleId");
  assertObjectId(input.oracleId, "oracleId");
  assertObjectId(predictObjectId, "predictObjectId");
  assertObjectId(input.predictManagerObjectId, "predictManagerObjectId");
  assertObjectId(clockObjectId, "clockObjectId");
  assertNonEmpty(quoteAssetType, "quoteAssetType");

  return {
    kind: "deepbook-predict-copy-next-mint-intent",
    version: 1,
    network: config.network,
    direction: input.direction,
    oracleId: input.oracleId,
    expiry,
    strike,
    quantity,
    quoteAssetType,
    objects: {
      predict: predictObjectId,
      predictManager: input.predictManagerObjectId,
      oracle: input.oracleId,
      clock: clockObjectId,
    },
    targets: {
      marketKey: targets.marketKeyNew,
      mint: targets.mint,
    },
    transactionPlan: [
      {
        target: targets.marketKeyNew,
        arguments: [input.oracleId, expiry, strike, isUp],
      },
      {
        target: targets.mint,
        typeArguments: [quoteAssetType],
        arguments: [
          predictObjectId,
          input.predictManagerObjectId,
          input.oracleId,
          "$marketKey",
          quantity,
          clockObjectId,
        ],
      },
    ],
  };
}

export function buildCreatePredictManagerTransaction(
  config: DeepBookPredictTxConfig = DEEPBOOK_PREDICT_TESTNET_TX_CONFIG,
): Transaction {
  const tx = new Transaction();
  const targets = buildDeepBookPredictTargets(config);

  tx.moveCall({
    target: targets.createManager,
  });

  return tx;
}

export function buildDepositQuoteTransaction(
  input: DepositQuoteTransactionInput,
): Transaction {
  const config = input.config ?? DEEPBOOK_PREDICT_TESTNET_TX_CONFIG;
  const targets = buildDeepBookPredictTargets(config);
  const amount = toPositiveIntegerString(input.amount, "amount");
  const quoteAssetType = input.quoteAssetType ?? config.quoteAssetType;

  assertObjectId(input.predictManagerObjectId, "predictManagerObjectId");
  assertObjectId(input.quoteCoinObjectId, "quoteCoinObjectId");
  assertNonEmpty(quoteAssetType, "quoteAssetType");

  const tx = new Transaction();
  const [splitCoin] = tx.splitCoins(tx.object(input.quoteCoinObjectId), [
    tx.pure.u64(amount),
  ]);

  tx.moveCall({
    target: targets.deposit,
    typeArguments: [quoteAssetType],
    arguments: [tx.object(input.predictManagerObjectId), splitCoin],
  });

  return tx;
}

export function buildWithdrawQuoteBankrollTransaction(
  input: WithdrawQuoteBankrollTransactionInput,
): Transaction {
  const config = input.config ?? DEEPBOOK_PREDICT_TESTNET_TX_CONFIG;
  const targets = buildDeepBookPredictTargets(config);
  const amount = toPositiveIntegerString(input.amount, "amount");
  const quoteAssetType = input.quoteAssetType ?? config.quoteAssetType;

  assertObjectId(input.predictManagerObjectId, "predictManagerObjectId");
  assertSuiAddress(input.recipientAddress, "recipientAddress");
  assertNonEmpty(quoteAssetType, "quoteAssetType");

  const tx = new Transaction();
  const withdrawnCoin = tx.moveCall({
    target: targets.withdraw,
    typeArguments: [quoteAssetType],
    arguments: [tx.object(input.predictManagerObjectId), tx.pure.u64(amount)],
  });

  tx.transferObjects([withdrawnCoin], tx.pure.address(input.recipientAddress));

  return tx;
}

export function buildCopyNextMintTransaction(intent: CopyNextMintIntent): Transaction {
  const tx = new Transaction();
  const marketKey = tx.moveCall({
    target: intent.targets.marketKey,
    arguments: [
      tx.pure.id(intent.oracleId),
      tx.pure.u64(intent.expiry),
      tx.pure.u64(intent.strike),
      tx.pure.bool(intent.direction === "up"),
    ],
  });

  tx.moveCall({
    target: intent.targets.mint,
    typeArguments: [intent.quoteAssetType],
    arguments: [
      tx.object(intent.objects.predict),
      tx.object(intent.objects.predictManager),
      tx.object(intent.objects.oracle),
      marketKey,
      tx.pure.u64(intent.quantity),
      intent.objects.clock === "0x6" ? tx.object.clock() : tx.object(intent.objects.clock),
    ],
  });

  return tx;
}

export function buildRedeemPositionTransaction(
  input: RedeemPositionTransactionInput,
): Transaction {
  const config = input.config ?? DEEPBOOK_PREDICT_TESTNET_TX_CONFIG;
  const targets = buildDeepBookPredictTargets(config);
  const expiry = toPositiveIntegerString(input.expiry, "expiry");
  const strike = toPositiveIntegerString(input.strike, "strike");
  const quantity = toPositiveIntegerString(input.quantity, "quantity");
  const predictObjectId = input.predictObjectId ?? config.predictObjectId;
  const clockObjectId = input.clockObjectId ?? "0x6";
  const quoteAssetType = input.quoteAssetType ?? config.quoteAssetType;

  assertObjectId(input.oracleId, "oracleId");
  assertObjectId(predictObjectId, "predictObjectId");
  assertObjectId(input.predictManagerObjectId, "predictManagerObjectId");
  assertObjectId(clockObjectId, "clockObjectId");
  assertNonEmpty(quoteAssetType, "quoteAssetType");

  const tx = new Transaction();
  const marketKey = tx.moveCall({
    target: targets.marketKeyNew,
    arguments: [
      tx.pure.id(input.oracleId),
      tx.pure.u64(expiry),
      tx.pure.u64(strike),
      tx.pure.bool(input.direction === "up"),
    ],
  });

  tx.moveCall({
    target: targets.redeem,
    typeArguments: [quoteAssetType],
    arguments: [
      tx.object(predictObjectId),
      tx.object(input.predictManagerObjectId),
      tx.object(input.oracleId),
      marketKey,
      tx.pure.u64(quantity),
      clockObjectId === "0x6" ? tx.object.clock() : tx.object(clockObjectId),
    ],
  });

  return tx;
}

export function serializeCopyNextMintIntent(intent: CopyNextMintIntent): string {
  return JSON.stringify(intent);
}

export function explainPredictMintDryRunPrerequisites() {
  return {
    ok: false,
    reason:
      "Live Predict dry-run needs funded testnet objects: an owned PredictManager, DUSDC coin object, oracle object, and gas. This package emits SDK transactions but does not discover or fund those objects.",
  };
}

function toPositiveIntegerString(value: IntegerLike, name: string): string {
  const stringValue = String(value);
  if (!/^[1-9]\d*$/.test(stringValue)) {
    throw new Error(`${name} must be a positive integer`);
  }

  return stringValue;
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} must be non-empty`);
  }
}

function assertObjectId(value: string, name: string): void {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error(`${name} must be a Sui object id`);
  }
}

function assertSuiAddress(value: string, name: string): void {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error(`${name} must be a Sui address`);
  }
}
