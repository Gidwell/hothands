import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ToastStack,
  WalletStatusBar,
  buildWalletToast,
  type AppToast,
  type WalletTransactionState,
} from "../src/App";

describe("toast notifications", () => {
  test("builds a success toast from a sent wallet transaction", () => {
    expect(
      buildWalletToast({
        status: "success",
        label: "Trade transaction sent.",
        digest: "0x1234567890abcdef",
      }),
    ).toEqual({
      groupKey: "wallet-tx",
      kind: "success",
      title: "Done",
      message: "Trade transaction sent.",
      digest: "0x1234567890abcdef",
    });
  });

  test("builds an error toast from a failed wallet action", () => {
    expect(
      buildWalletToast({
        status: "error",
        label: "Connect a Sui testnet wallet first.",
        digest: null,
      }),
    ).toEqual({
      groupKey: "wallet-tx",
      kind: "error",
      title: "Action needed",
      message: "Connect a Sui testnet wallet first.",
      digest: null,
    });
  });

  test("supports info and warning wallet toast states", () => {
    const pendingState: WalletTransactionState = {
      status: "pending",
      label: "Sending trade to wallet...",
      digest: null,
    };
    const warningState: WalletTransactionState = {
      status: "error",
      label: "Deposit bankroll first. Bankroll $0, trade needs $25.",
      digest: null,
    };

    expect(buildWalletToast(pendingState)).toMatchObject({
      kind: "info",
      title: "Wallet request",
    });
    expect(buildWalletToast(warningState)).toMatchObject({
      kind: "warning",
      title: "Check bankroll",
    });
  });

  test("renders a bottom-left stack with dismiss controls", () => {
    const toasts: AppToast[] = [
      {
        id: "toast-success",
        kind: "success",
        title: "Done",
        message: "Copy transaction sent.",
        digest: "0xabcdef123456",
      },
      {
        id: "toast-error",
        kind: "error",
        title: "Action needed",
        message: "Connect a Sui testnet wallet first.",
      },
    ];

    const html = renderToStaticMarkup(
      <ToastStack toasts={toasts} onDismiss={() => undefined} />,
    );

    expect(html).toContain('data-testid="toast-stack"');
    expect(html).toContain('data-testid="toast-success"');
    expect(html).toContain('data-testid="toast-error"');
    expect(html).toContain("Copy transaction sent.");
    expect(html).toContain("Connect a Sui testnet wallet first.");
    expect(html).toContain('aria-label="Dismiss Done"');
    expect(html).toContain('aria-label="Dismiss Action needed"');
  });

  test("keeps wallet transaction notifications out of the wallet bar", () => {
    const html = renderToStaticMarkup(
      <WalletStatusBar
        accountAddress="0x00000000000000000000000000000000000000000000000000000000000000aa"
        connectionStatus="connected"
        networkLabel="testnet"
        predictManagerObjectId="0x000000000000000000000000000000000000000000000000000000000000bbbb"
        predictManagerStatus="ready"
        txState={{ status: "pending", label: "Sending trade to wallet...", digest: null }}
        walletCount={1}
        walletName="Sui Wallet"
        onConnect={() => undefined}
        onCreatePredictManager={() => undefined}
        onDisconnect={() => undefined}
      />,
    );

    expect(html).not.toContain('data-testid="wallet-tx-status"');
    expect(html).not.toContain("Sending trade to wallet...");
  });
});
