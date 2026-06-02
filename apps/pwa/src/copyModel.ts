import type { Trader } from "./mockData";

export type CopyTableState = {
  selectedTraderId: string;
  copyAmount: number;
  isArmed: boolean;
  copyStatus: "idle" | "waiting" | "submitted";
};

export type CopyReceiptPreview = {
  leader: string;
  market: string;
  amount: string;
  label: "Copy next signal";
  status: "Waiting" | "Disarmed" | "Copied once";
  summary: string;
};

export type CopyMarket = {
  pair: string;
};

export const COPY_AMOUNT_MIN = 0.01;
export const COPY_AMOUNT_MAX = 1_000;
export const COPY_AMOUNT_STEP = 5;
export const COPY_AMOUNT_DEFAULT = 25;

export function createInitialCopyState(traders: Trader[]): CopyTableState {
  return {
    selectedTraderId: traders[0]?.id ?? "",
    copyAmount: COPY_AMOUNT_DEFAULT,
    isArmed: false,
    copyStatus: "idle",
  };
}

export function clampCopyAmount(amount: number): number {
  if (!Number.isFinite(amount)) {
    return COPY_AMOUNT_DEFAULT;
  }

  const cents = Math.round(amount * 100) / 100;

  return Math.min(COPY_AMOUNT_MAX, Math.max(COPY_AMOUNT_MIN, cents));
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
  const shouldArm = !state.isArmed;

  return {
    ...state,
    isArmed: shouldArm,
    copyStatus: shouldArm ? "waiting" : "idle",
  };
}

export function markCopySubmitted(state: CopyTableState): CopyTableState {
  if (!state.isArmed && state.copyStatus !== "waiting") {
    return state;
  }

  return {
    ...state,
    isArmed: false,
    copyStatus: "submitted",
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
    isArmed: traderId === state.selectedTraderId ? state.isArmed : false,
    copyStatus: traderId === state.selectedTraderId ? state.copyStatus : "idle",
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
  const clampedAmount = clampCopyAmount(amount);

  return `$${clampedAmount.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(clampedAmount) ? 0 : 2,
  })}`;
}

export function getCopyReceiptPreview(
  state: CopyTableState,
  traders: Trader[],
  market: CopyMarket,
): CopyReceiptPreview {
  const trader = getSelectedTrader(state, traders);
  const amount = formatCopyAmount(state.copyAmount);
  const status =
    state.copyStatus === "submitted"
      ? "Copied once"
      : state.isArmed
        ? "Waiting"
        : "Disarmed";

  return {
    leader: trader.name,
    market: market.pair,
    amount,
    label: "Copy next signal",
    status,
    summary:
      state.copyStatus === "submitted"
        ? `${amount} copied once from ${trader.name}. Re-arm to copy another future signal.`
        : state.isArmed
          ? `Waiting for ${trader.name}'s next ${market.pair} signal. No trade until you confirm.`
          : `${trader.name} selected on ${market.pair}. Arm copy to use up to ${amount} on the next signal.`,
  };
}
