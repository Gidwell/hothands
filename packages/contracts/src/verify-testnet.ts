#!/usr/bin/env bun
import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl,
} from "@mysten/sui/jsonRpc";
import { buildCreatePredictManagerTransaction } from "./index";

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
  stdout: { write: (text: string) => void };
  stderr: { write: (text: string) => void };
};

const DEFAULT_DEV_INSPECT_SENDER =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

try {
  const client = new SuiJsonRpcClient({
    network: "testnet",
    url:
      process.env.HOT_HANDS_SUI_TESTNET_RPC_URL ??
      getJsonRpcFullnodeUrl("testnet"),
  });
  const sender =
    process.env.HOT_HANDS_DEV_INSPECT_SENDER ?? DEFAULT_DEV_INSPECT_SENDER;
  const tx = buildCreatePredictManagerTransaction();
  const result = await client.devInspectTransactionBlock({
    sender,
    transactionBlock: tx,
  });
  const status = result.effects.status;

  process.stdout.write(
    [
      "DeepBook Predict transaction canary passed.",
      `Network: testnet`,
      `Sender: ${sender}`,
      `Create manager dev-inspect: ${status.status}`,
      `Command results: ${result.results?.length ?? 0}`,
    ].join("\n"),
  );
  process.stdout.write("\n");

  if (status.status !== "success") {
    process.exitCode = 1;
  }
} catch (error) {
  process.exitCode = 1;
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
}
