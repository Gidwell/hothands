import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OraclePriceChartModal } from "../src/OraclePriceChart";
import type { OraclePriceChart } from "../src/oraclePriceChartModel";

const readyChart: OraclePriceChart = {
  detail: "DeepBook Predict oracle price used for BTC market settlement.",
  latestPrice: 66_978.22,
  latestPriceLabel: "$66,978",
  marketLabel: "BTC/USD",
  oracleId: "0xoracle",
  points: [
    {
      price: 66_960,
      timestampMs: 1_779_158_000_000,
    },
    {
      price: 66_978.22,
      timestampMs: 1_779_158_060_000,
    },
  ],
  source: "live_testnet",
  sourceLabel: "Live Testnet",
  status: "ready",
  title: "DeepBook BTC oracle price",
};

describe("OraclePriceChartModal", () => {
  test("places trading controls below the expanded chart", () => {
    const html = renderToStaticMarkup(
      <OraclePriceChartModal chart={readyChart} onClose={() => undefined}>
        <section data-testid="expanded-chart-trade">Trade this market</section>
      </OraclePriceChartModal>,
    );

    expect(html).toContain('data-testid="expanded-chart-actions"');
    expect(html).toContain('data-testid="expanded-chart-trade"');
    expect(html.indexOf('data-testid="oracle-expanded-chart"')).toBeLessThan(
      html.indexOf('data-testid="expanded-chart-actions"'),
    );
  });

  test("shows muted TradingView attribution inside the expanded chart", () => {
    const html = renderToStaticMarkup(
      <OraclePriceChartModal chart={readyChart} onClose={() => undefined} />,
    );

    expect(html).toContain('aria-label="TradingView Lightweight Charts attribution"');
    expect(html).toContain("TradingView");
    expect(html).not.toContain("Chart renderer:");
  });
});
