import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { DEEPBOOK_PREDICT_TESTNET_CONFIG } from "@hot-hands/indexer";

export type PredictQuoteSide = "UP" | "DOWN";

export interface PredictQuoteRequest {
  oracleId: string;
  expiry: string;
  strike: string;
  side: string;
  spendUsd: string;
  estimatedPrice?: string | null;
}

export interface PredictRedeemQuoteRequest {
  oracleId: string;
  expiry: string;
  strike: string;
  side: string;
  quantity: string;
}

export interface PredictQuote {
  source: "live_testnet";
  market: "BTC-USD";
  oracleId: string;
  expiry: string;
  strike: string;
  side: PredictQuoteSide;
  requestedSpendUsd: number;
  cost: string;
  costUsd: number;
  quantity: string;
  payoutUsd: number;
  maxProfitUsd: number;
  redeemPayout: string;
  redeemPayoutUsd: number;
  effectivePrice: number;
  quoteStatus: "ready";
}

export interface PredictRedeemQuote {
  source: "live_testnet";
  market: "BTC-USD";
  oracleId: string;
  expiry: string;
  strike: string;
  side: PredictQuoteSide;
  quantity: string;
  redeemPayout: string;
  redeemPayoutUsd: number;
  quoteStatus: "ready";
}

export interface PredictQuoteOptions {
  inspectQuantity?: InspectPredictQuoteQuantity;
  maxSearchSteps?: number;
}

export type InspectPredictQuoteQuantity = (
  input: PredictQuoteQuantityInput
) => Promise<PredictQuantityQuote>;

export interface PredictQuoteQuantityInput {
  oracleId: string;
  expiry: bigint;
  strike: bigint;
  side: PredictQuoteSide;
  quantity: bigint;
}

export interface PredictQuantityQuote {
  cost: bigint;
  redeemPayout: bigint;
}

const ZERO_SENDER =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const QUOTE_SCALE = 1_000_000n;

export async function getTestnetPredictQuote(
  request: PredictQuoteRequest,
  { inspectQuantity = inspectPredictQuantityOnTestnet, maxSearchSteps = 8 }: PredictQuoteOptions = {}
): Promise<PredictQuote> {
  const oracleId = parseObjectId(request.oracleId, "oracleId");
  const expiry = parsePositiveBigInt(request.expiry, "expiry");
  const strike = parsePositiveBigInt(request.strike, "strike");
  const side = parseSide(request.side);
  const requestedSpend = parseUsdAtomic(request.spendUsd, "spendUsd");
  const estimatedPrice = parseEstimatedPrice(request.estimatedPrice);
  const quote = await quoteSpendAmount(
    {
      oracleId,
      expiry,
      strike,
      side,
      requestedSpend,
      estimatedPrice
    },
    inspectQuantity,
    maxSearchSteps
  );
  if (quote.cost <= 0n || quote.quantity <= 0n) {
    throw new Error("Predict quote returned a zero-cost amount.");
  }

  return {
    source: "live_testnet",
    market: "BTC-USD",
    oracleId,
    expiry: expiry.toString(),
    strike: strike.toString(),
    side,
    requestedSpendUsd: atomicUsdToNumber(requestedSpend),
    cost: quote.cost.toString(),
    costUsd: atomicUsdToNumber(quote.cost),
    quantity: quote.quantity.toString(),
    payoutUsd: atomicUsdToNumber(quote.quantity),
    maxProfitUsd: atomicUsdToNumber(quote.quantity - quote.cost),
    redeemPayout: quote.redeemPayout.toString(),
    redeemPayoutUsd: atomicUsdToNumber(quote.redeemPayout),
    effectivePrice: Number(quote.cost) / Number(quote.quantity),
    quoteStatus: "ready"
  };
}

export async function getTestnetPredictRedeemQuote(
  request: PredictRedeemQuoteRequest,
  { inspectQuantity = inspectPredictQuantityOnTestnet }: PredictQuoteOptions = {}
): Promise<PredictRedeemQuote> {
  const oracleId = parseObjectId(request.oracleId, "oracleId");
  const expiry = parsePositiveBigInt(request.expiry, "expiry");
  const strike = parsePositiveBigInt(request.strike, "strike");
  const side = parseSide(request.side);
  const quantity = parsePositiveBigInt(request.quantity, "quantity");
  const quote = await inspectQuantity({
    oracleId,
    expiry,
    strike,
    side,
    quantity
  });

  return {
    source: "live_testnet",
    market: "BTC-USD",
    oracleId,
    expiry: expiry.toString(),
    strike: strike.toString(),
    side,
    quantity: quantity.toString(),
    redeemPayout: quote.redeemPayout.toString(),
    redeemPayoutUsd: atomicUsdToNumber(quote.redeemPayout),
    quoteStatus: "ready"
  };
}

async function quoteSpendAmount(
  input: {
    oracleId: string;
    expiry: bigint;
    strike: bigint;
    side: PredictQuoteSide;
    requestedSpend: bigint;
    estimatedPrice: number;
  },
  inspectQuantity: InspectPredictQuoteQuantity,
  maxSearchSteps: number
): Promise<PredictQuantityQuote & { quantity: bigint }> {
  const market = {
    oracleId: input.oracleId,
    expiry: input.expiry,
    strike: input.strike,
    side: input.side
  };
  const initialQuantity = estimateInitialQuantity(input.requestedSpend, input.estimatedPrice);
  let lowQuantity = 1n;
  let lowQuote = await inspectQuantity({ ...market, quantity: lowQuantity });
  let highQuantity = initialQuantity;
  let highQuote = await inspectQuantity({ ...market, quantity: highQuantity });

  while (highQuote.cost < input.requestedSpend && highQuantity < input.requestedSpend * 1000n) {
    lowQuantity = highQuantity;
    lowQuote = highQuote;
    highQuantity *= 2n;
    highQuote = await inspectQuantity({ ...market, quantity: highQuantity });
  }

  if (lowQuote.cost > input.requestedSpend) {
    return { ...lowQuote, quantity: lowQuantity };
  }

  let bestQuantity = lowQuote.cost <= input.requestedSpend ? lowQuantity : 1n;
  let bestQuote = lowQuote.cost <= input.requestedSpend ? lowQuote : await inspectQuantity({
    ...market,
    quantity: bestQuantity
  });

  if (highQuote.cost <= input.requestedSpend) {
    return { ...highQuote, quantity: highQuantity };
  }

  for (let step = 0; step < maxSearchSteps && highQuantity - lowQuantity > 1n; step += 1) {
    const midQuantity = (lowQuantity + highQuantity) / 2n;
    const midQuote = await inspectQuantity({ ...market, quantity: midQuantity });

    if (midQuote.cost <= input.requestedSpend) {
      bestQuantity = midQuantity;
      bestQuote = midQuote;
      lowQuantity = midQuantity;
      continue;
    }

    highQuantity = midQuantity;
  }

  return { ...bestQuote, quantity: bestQuantity };
}

function estimateInitialQuantity(spendAtomic: bigint, estimatedPrice: number): bigint {
  const price = Number.isFinite(estimatedPrice) && estimatedPrice > 0 ? estimatedPrice : 0.5;
  const quantity = BigInt(Math.max(1, Math.round(Number(spendAtomic) / price)));

  return quantity > 0n ? quantity : spendAtomic * 2n;
}

async function inspectPredictQuantityOnTestnet({
  oracleId,
  expiry,
  strike,
  side,
  quantity
}: PredictQuoteQuantityInput): Promise<PredictQuantityQuote> {
  const config = DEEPBOOK_PREDICT_TESTNET_CONFIG;
  const tx = new Transaction();
  const marketKey = tx.moveCall({
    target: `${config.predictPackageId}::market_key::new`,
    arguments: [
      tx.pure.id(oracleId),
      tx.pure.u64(expiry.toString()),
      tx.pure.u64(strike.toString()),
      tx.pure.bool(side === "UP")
    ]
  });

  tx.moveCall({
    target: `${config.predictPackageId}::predict::get_trade_amounts`,
    arguments: [
      tx.object(config.predictObjectId),
      tx.object(oracleId),
      marketKey,
      tx.pure.u64(quantity.toString()),
      tx.object.clock()
    ]
  });

  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl("testnet"),
    network: "testnet"
  });
  const result = await client.devInspectTransactionBlock({
    sender: ZERO_SENDER,
    transactionBlock: tx
  });
  const status = (result.effects as { status?: { status?: string; error?: string } }).status;

  if (status?.status !== "success") {
    throw new Error(status?.error ?? "Predict quote devInspect failed.");
  }

  const returnValues = result.results?.[1]?.returnValues;
  if (!returnValues || returnValues.length < 2) {
    throw new Error("Predict quote did not return cost and payout values.");
  }

  return {
    cost: decodeU64ReturnValue(returnValues[0]),
    redeemPayout: decodeU64ReturnValue(returnValues[1])
  };
}

function decodeU64ReturnValue(value: unknown): bigint {
  if (!Array.isArray(value) || !Array.isArray(value[0])) {
    throw new Error("Predict quote return value is malformed.");
  }

  const bytes = value[0];
  let result = 0n;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (typeof byte !== "number") {
      throw new Error("Predict quote return bytes are malformed.");
    }

    result += BigInt(byte) << BigInt(index * 8);
  }

  return result;
}

function parseObjectId(value: string, name: string): string {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error(`${name} must be a Sui object id.`);
  }

  return value;
}

function parsePositiveBigInt(value: string, name: string): bigint {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return BigInt(value);
}

function parseSide(value: string): PredictQuoteSide {
  if (value !== "UP" && value !== "DOWN") {
    throw new Error("side must be UP or DOWN.");
  }

  return value;
}

function parseEstimatedPrice(value: string | null | undefined): number {
  if (!value) {
    return 0.5;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0.5;
}

function parseUsdAtomic(value: string, name: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) {
    throw new Error(`${name} must be a positive USD amount.`);
  }

  const whole = BigInt(match[1]);
  const decimals = (match[2] ?? "").padEnd(6, "0");
  const atomic = whole * QUOTE_SCALE + BigInt(decimals);
  if (atomic <= 0n) {
    throw new Error(`${name} must be greater than zero.`);
  }

  return atomic;
}

function atomicUsdToNumber(value: bigint): number {
  return Number(value) / Number(QUOTE_SCALE);
}
