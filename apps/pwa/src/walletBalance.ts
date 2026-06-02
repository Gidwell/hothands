import { DEEPBOOK_PREDICT_TESTNET_TX_CONFIG } from "@hot-hands/contracts";

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

function formatAtomicUnits(value: bigint, decimals: number): string {
  const scale = DUSDC_SCALE;
  const whole = value / scale;
  const fractional = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");

  return fractional ? `${whole.toString()}.${fractional}` : whole.toString();
}
