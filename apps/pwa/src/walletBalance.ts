import { DEEPBOOK_PREDICT_TESTNET_TX_CONFIG } from "@hot-hands/contracts";
import {
  getJsonRpcFullnodeUrl,
  SuiJsonRpcClient,
} from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";

export const DUSDC_COIN_TYPE = DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.quoteAssetType;
const DUSDC_SCALE = 1_000_000n;

export type DusdcBalanceClient = {
  getBalance(input: {
    owner: string;
    coinType: string;
  }): Promise<{
    balance:
      | {
          balance?: string;
          coinBalance?: string;
          addressBalance?: string;
        }
      | undefined;
  }>;
};

export type PredictManagerBankrollClient = {
  getObject?: unknown;
  devInspectTransactionBlock?: unknown;
};

export type DusdcDepositCoin = {
  coinObjectId: string;
  coinObjectIds: string[];
  balance: string;
};

export type DusdcDepositCoinClient = {
  getCoins(input: {
    owner: string;
    coinType: string;
    cursor?: string | null;
    limit?: number;
  }): Promise<{
    data: Array<{
      coinObjectId?: string;
      balance?: string;
      coinBalance?: string;
    }>;
    hasNextPage?: boolean;
    nextCursor?: string | null;
  }>;
};

export async function loadDusdcBalanceLabel({
  client,
  owner,
}: {
  client: DusdcBalanceClient;
  owner: string;
}): Promise<string> {
  const response = await client.getBalance({
    owner,
    coinType: DUSDC_COIN_TYPE,
  });
  const atomicBalance =
    response.balance?.balance ??
    response.balance?.coinBalance ??
    response.balance?.addressBalance ??
    "0";

  return formatDusdcBalance(atomicBalance);
}

export async function loadPredictManagerBankrollLabel({
  client,
  fallbackClient,
  predictManagerObjectId,
  sender,
}: {
  client: PredictManagerBankrollClient;
  fallbackClient?: PredictManagerBankrollClient;
  predictManagerObjectId: string;
  sender?: string;
}): Promise<string> {
  const atomicBalance = await loadPredictManagerBankrollAtomic({
    client,
    fallbackClient,
    predictManagerObjectId,
    sender,
  });

  return formatDusdcBalance(atomicBalance);
}

export async function loadPredictManagerBankrollAtomic({
  client,
  fallbackClient,
  predictManagerObjectId,
  sender,
}: {
  client: PredictManagerBankrollClient;
  fallbackClient?: PredictManagerBankrollClient;
  predictManagerObjectId: string;
  sender?: string;
}): Promise<bigint> {
  const response = await getPredictManagerObject(client, predictManagerObjectId);
  const atomicBalance = readAtomicBalanceField(response.data?.content);

  if (atomicBalance !== null) {
    return atomicBalance;
  }

  const inspectClient =
    isFunction(client.devInspectTransactionBlock)
      ? client
      : fallbackClient ?? createPredictManagerBankrollClient();
  if (!isFunction(inspectClient.devInspectTransactionBlock)) {
    return 0n;
  }

  const devInspectTransactionBlock =
    inspectClient.devInspectTransactionBlock as (input: {
      sender: string;
      transactionBlock: Transaction;
    }) => Promise<{
      results?: Array<{
        returnValues?: unknown[];
      }>;
    }>;

  return loadPredictManagerBankrollAtomicByMoveCall({
    devInspectTransactionBlock: (input) =>
      devInspectTransactionBlock.call(inspectClient, input),
    predictManagerObjectId,
    sender,
  });
}

export async function selectDusdcDepositCoin({
  amount,
  client = createDusdcDepositCoinClient(),
  owner,
}: {
  amount: string | bigint;
  client?: DusdcDepositCoinClient;
  owner: string;
}): Promise<DusdcDepositCoin> {
  const targetAmount = typeof amount === "bigint" ? amount : parseAtomicBalance(amount);
  const selectedCoins: Array<{
    balance: bigint;
    coinObjectId: string;
  }> = [];
  let selectedBalance = 0n;
  let cursor: string | null = null;

  do {
    const response = await client.getCoins({
      owner,
      coinType: DUSDC_COIN_TYPE,
      cursor,
      limit: 50,
    });
    const candidateCoins = response.data
      .flatMap((candidate) => {
        if (!candidate.coinObjectId) {
          return [];
        }

        return [
          {
            balance: parseAtomicBalance(candidate.balance ?? candidate.coinBalance ?? "0"),
            coinObjectId: candidate.coinObjectId,
          },
        ];
      })
      .filter((candidate) => candidate.balance > 0n)
      .sort((left, right) => {
        if (left.balance === right.balance) {
          return left.coinObjectId.localeCompare(right.coinObjectId);
        }

        return left.balance < right.balance ? 1 : -1;
      });

    for (const candidate of candidateCoins) {
      if (selectedBalance >= targetAmount) {
        break;
      }

      selectedCoins.push(candidate);
      selectedBalance += candidate.balance;
    }

    if (selectedBalance >= targetAmount || !response.hasNextPage) {
      break;
    }

    cursor = response.nextCursor ?? null;
  } while (cursor !== null);

  if (selectedBalance < targetAmount || selectedCoins.length === 0) {
    throw new Error("Not enough DUSDC available to deposit.");
  }

  return {
    coinObjectId: selectedCoins[0].coinObjectId,
    coinObjectIds: selectedCoins.map((coin) => coin.coinObjectId),
    balance: selectedBalance.toString(),
  };
}

export function usdToDusdcAtomic(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Deposit amount must be positive.");
  }

  return String(BigInt(Math.round(amount * Number(DUSDC_SCALE))));
}

async function loadPredictManagerBankrollAtomicByMoveCall({
  devInspectTransactionBlock,
  predictManagerObjectId,
  sender,
}: {
  devInspectTransactionBlock: (input: {
    sender: string;
    transactionBlock: Transaction;
  }) => Promise<{
    results?: Array<{
      returnValues?: unknown[];
    }>;
  }>;
  predictManagerObjectId: string;
  sender?: string;
}): Promise<bigint> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictPackageId}::predict_manager::balance`,
    typeArguments: [DUSDC_COIN_TYPE],
    arguments: [tx.object(predictManagerObjectId)],
  });

  const result = await devInspectTransactionBlock({
    sender: sender ?? "0x0000000000000000000000000000000000000000000000000000000000000000",
    transactionBlock: tx,
  });

  return readU64ReturnValue(result.results?.[0]?.returnValues?.[0]) ?? 0n;
}

async function getPredictManagerObject(
  client: PredictManagerBankrollClient,
  predictManagerObjectId: string,
): Promise<{
  data?:
    | {
        content?: unknown;
      }
    | undefined;
}> {
  if (!isFunction(client.getObject)) {
    throw new Error("Sui client cannot load PredictManager objects.");
  }

  const getObject = client.getObject as (input: unknown) => Promise<{
    data?:
      | {
          content?: unknown;
        }
      | undefined;
  }>;

  try {
    return await getObject.call(client, {
      id: predictManagerObjectId,
      options: {
        showContent: true,
      },
    });
  } catch (error) {
    return getObject.call(client, {
      objectId: predictManagerObjectId,
      options: {
        showContent: true,
      },
    });
  }
}

function createDusdcDepositCoinClient(): DusdcDepositCoinClient {
  return new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl("testnet"),
    network: "testnet",
  }) as unknown as DusdcDepositCoinClient;
}

function createPredictManagerBankrollClient(): PredictManagerBankrollClient {
  return new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl("testnet"),
    network: "testnet",
  }) as unknown as PredictManagerBankrollClient;
}

export function formatDusdcBalance(atomicBalance: string | bigint): string {
  const atomic =
    typeof atomicBalance === "bigint" ? atomicBalance : parseAtomicBalance(atomicBalance);
  if (atomic === 0n) {
    return "$0";
  }

  if (atomic < 10_000n) {
    return `$${formatAtomicUnits(atomic, 6)}`;
  }

  const cents = (atomic + 5_000n) / 10_000n;
  const whole = cents / 100n;
  const fractional = cents % 100n;

  if (fractional === 0n) {
    return `$${whole.toLocaleString("en-US")}`;
  }

  return `$${whole.toLocaleString("en-US")}.${fractional.toString().padStart(2, "0")}`;
}

function parseAtomicBalance(value: string): bigint {
  return /^\d+$/.test(value) ? BigInt(value) : 0n;
}

function readAtomicBalanceField(content: unknown): bigint | null {
  const fields = readMoveObjectFields(content);
  if (!fields) {
    return null;
  }

  return (
    readAtomicField(fields.bankroll) ??
    readAtomicField(fields.balance) ??
    readAtomicField(fields.available) ??
    readAtomicField(fields.quoteBalance) ??
    readAtomicField(fields.quote_balance)
  );
}

function readMoveObjectFields(content: unknown): Record<string, unknown> | null {
  if (!content || typeof content !== "object") {
    return null;
  }

  const dataType = "dataType" in content ? (content as { dataType?: unknown }).dataType : null;
  if (dataType !== "moveObject") {
    return null;
  }

  const fields = "fields" in content ? (content as { fields?: unknown }).fields : null;
  return fields && typeof fields === "object" ? (fields as Record<string, unknown>) : null;
}

function readAtomicField(value: unknown): bigint | null {
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value);
  }

  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }

  return null;
}

function readU64ReturnValue(value: unknown): bigint | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const bytes = Array.isArray(value[0]) ? value[0] : value;
  if (!bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    return null;
  }

  return (bytes as number[]).reduceRight(
    (total, byte) => (total << 8n) + BigInt(byte),
    0n,
  );
}

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

function formatAtomicUnits(value: bigint, decimals: number): string {
  const scale = DUSDC_SCALE;
  const whole = value / scale;
  const fractional = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");

  return fractional ? `${whole.toString()}.${fractional}` : whole.toString();
}
