import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getOraclePriceChartMinBarSpacing,
  OraclePriceChartModal,
  shouldAutoFitOraclePriceChart,
} from "../src/OraclePriceChart";
import type { OraclePriceChart } from "../src/oraclePriceChartModel";

const readyChart: OraclePriceChart = {
  detail: "DeepBook Predict oracle price used for BTC market settlement.",
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

  test("keeps transient chart metadata out of the modal", () => {
    const html = renderToStaticMarkup(
      <OraclePriceChartModal chart={readyChart} onClose={() => undefined} />,
    );

    expect(html).not.toContain("Updated ");
    expect(html).not.toContain("of oracle history");
  });

  test("preserves expanded chart zoom after the first price dataset", () => {
    expect(
      shouldAutoFitOraclePriceChart({
        compact: false,
        hasFitInitialData: false,
        pointCount: 2,
      }),
    ).toBe(true);

    expect(
      shouldAutoFitOraclePriceChart({
        compact: false,
        hasFitInitialData: true,
        pointCount: 3,
      }),
    ).toBe(false);

    expect(
      shouldAutoFitOraclePriceChart({
        compact: true,
        hasFitInitialData: true,
        pointCount: 3,
      }),
    ).toBe(true);
  });

  test("allows the expanded chart to zoom out across dense one-second oracle history", () => {
    expect(getOraclePriceChartMinBarSpacing({ compact: false })).toBeLessThanOrEqual(
      0.03,
    );

    expect(getOraclePriceChartMinBarSpacing({ compact: true })).toBeGreaterThan(
      getOraclePriceChartMinBarSpacing({ compact: false }),
    );
  });
});
