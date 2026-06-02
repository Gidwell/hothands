export const POST_WALLET_REFRESH_DELAYS_MS = [1_500, 5_000] as const;

export type WalletFinalityClient = {
  waitForTransaction?: unknown;
};

export async function waitForWalletTransactionFinality({
  client,
  digest,
}: {
  client: WalletFinalityClient;
  digest: string | null;
}): Promise<void> {
  if (!digest || typeof client.waitForTransaction !== "function") {
    return;
  }

  try {
    const waitForTransaction = client.waitForTransaction as (input: {
      digest: string;
    }) => Promise<unknown>;
    await waitForTransaction.call(client, { digest });
  } catch {
    // A delayed refresh still catches most wallet/indexing lag if waiting fails.
  }
}

export function schedulePostWalletRefresh({
  refresh,
  setTimer = globalThis.setTimeout,
}: {
  refresh: () => void;
  setTimer?: (callback: () => void, delay: number) => unknown;
}): void {
  refresh();

  for (const delay of POST_WALLET_REFRESH_DELAYS_MS) {
    setTimer(refresh, delay);
  }
}
