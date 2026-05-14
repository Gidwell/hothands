import type { Trader } from "./mockData";

export type CopyTableState = {
  selectedTraderId: string;
  copyAmount: number;
  isArmed: boolean;
};

export type CopyReceiptPreview = {
  leader: string;
  market: string;
  amount: string;
  label: "Copy next signal";
  status: "Armed" | "Disarmed";
  summary: string;
};

export type CopyMarket = {
  pair: string;
};

export const COPY_AMOUNT_MIN = 25;
export const COPY_AMOUNT_MAX = 1_000;
export const COPY_AMOUNT_STEP = 50;
export const COPY_AMOUNT_DEFAULT = 250;

export function createInitialCopyState(traders: Trader[]): CopyTableState {
  return {
    selectedTraderId: traders[0]?.id ?? "",
    copyAmount: COPY_AMOUNT_DEFAULT,
    isArmed: false,
  };
}

export function clampCopyAmount(amount: number): number {
  if (!Number.isFinite(amount)) {
    return COPY_AMOUNT_DEFAULT;
  }

  return Math.min(COPY_AMOUNT_MAX, Math.max(COPY_AMOUNT_MIN, Math.round(amount)));
}

export function setCopyAmount(state: CopyTableState, amount: number): CopyTableState {
  return {
    ...state,
    copyAmount: clampCopyAmount(amount),
  };
}

export function stepCopyAmount(
  state: CopyTableState,
  direction: -1 | 1,
): CopyTableState {
  return setCopyAmount(state, state.copyAmount + direction * COPY_AMOUNT_STEP);
}

export function toggleCopyArmed(state: CopyTableState): CopyTableState {
  return {
    ...state,
    isArmed: !state.isArmed,
  };
}

export function selectHotTrader(
  state: CopyTableState,
  traderId: string,
  traders: Trader[],
): CopyTableState {
  if (!traders.some((trader) => trader.id === traderId)) {
    return state;
  }

  return {
    ...state,
    selectedTraderId: traderId,
  };
}

export function getSelectedTrader(state: CopyTableState, traders: Trader[]): Trader {
  return (
    traders.find((trader) => trader.id === state.selectedTraderId) ??
    traders[0] ?? {
      id: "",
      name: "No leader",
      handle: "",
      avatar: "--",
      role: "Signal desk",
      streak: 0,
      hotScore: 0,
      roi: "0%",
      copied: 0,
      signal: "Waiting for signal",
      tableRead: "No active market read",
      tone: "gold",
    }
  );
}

export function formatCopyAmount(amount: number): string {
  return `$${clampCopyAmount(amount).toLocaleString()}`;
}

export function getCopyReceiptPreview(
  state: CopyTableState,
  traders: Trader[],
  market: CopyMarket,
): CopyReceiptPreview {
  const trader = getSelectedTrader(state, traders);
  const amount = formatCopyAmount(state.copyAmount);
  const status = state.isArmed ? "Armed" : "Disarmed";

  return {
    leader: trader.name,
    market: market.pair,
    amount,
    label: "Copy next signal",
    status,
    summary: state.isArmed
      ? `${trader.name} on ${market.pair}, up to ${amount} when the next signal lands.`
      : `${trader.name} selected on ${market.pair}. Arm copy to use up to ${amount} on the next signal.`,
  };
}
