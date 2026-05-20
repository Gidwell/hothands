import { describe, expect, test } from "bun:test";
import {
  MARKET_HEAT_PREVIEW_ROWS,
  buildMarketHeatPreview,
} from "../src/marketHeatModel";

describe("market heat preview model", () => {
  test("builds a compact external wallet watch preview from captured rows", () => {
    const preview = buildMarketHeatPreview(MARKET_HEAT_PREVIEW_ROWS);

    expect(preview).toEqual({
      title: "Market Heat",
      modeLabel: "Testnet",
      actionLabel: "Watch hand",
      detailLabel: "Observed Predict mints",
      rows: [
        {
          id: "external-0x84d2",
          displayName: "0x84d2...91af",
          manager: "manager 0xb795...3125",
          market: "BTC-USD UP",
          observedMint: "12.4K",
          heatScore: 92,
          preparedCopies: 18,
          actionLabel: "Copy hand",
          status: "copy_ready",
          statusLabel: "Copy ready",
        },
        {
          id: "external-0x28b7",
          displayName: "0x28b7...4c10",
          manager: "manager 0x43af...e64",
          market: "BTC-USD DOWN",
          observedMint: "7.8K",
          heatScore: 87,
          preparedCopies: 11,
          actionLabel: "Watch hand",
          status: "watching",
          statusLabel: "Watching",
        },
      ],
    });
  });
});
