#!/usr/bin/env bun
import {
  createPredictReadCanary,
  parsePredictCanaryConfig,
} from "./deepbook-predict";

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
  stdout: { write: (text: string) => void };
  stderr: { write: (text: string) => void };
};

try {
  const config = parsePredictCanaryConfig(process.env);
  const result = await createPredictReadCanary({ config }).run();

  process.stdout.write(
    [
      "DeepBook Predict read canary passed.",
      `Server: ${config.serverUrl}`,
      `Predict: ${result.predictObjectId}`,
      `Status: ${result.status}`,
      `Quote asset enabled: ${result.quoteAssetEnabled ? "yes" : "no"}`,
      `BTC oracles: ${result.btcOracleCount} (${result.activeBtcOracleCount} active)`,
      result.selectedBtcOracle
        ? `Selected BTC oracle: ${result.selectedBtcOracle.oracle_id} / ${result.selectedBtcOracle.status} / expiry ${result.selectedBtcOracle.expiry}`
        : "Selected BTC oracle: none",
      result.latestPrice
        ? `Latest selected price: spot ${result.latestPrice.spot}`
        : "Latest selected price: none",
    ].join("\n"),
  );
  process.stdout.write("\n");

  if (!result.ok || !result.quoteAssetEnabled || result.btcOracleCount === 0) {
    process.exitCode = 1;
  }
} catch (error) {
  process.exitCode = 1;
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
}
