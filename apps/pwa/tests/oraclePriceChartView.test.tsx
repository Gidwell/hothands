import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getInitialOraclePriceChartView,
  getOraclePriceChartMinBarSpacing,
  OraclePriceChartCard,
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
  test("renders a compact twenty-four hour change beside the mini chart", () => {
    const html = renderToStaticMarkup(
      <OraclePriceChartCard
        chart={readyChart}
        fallbackPriceLabel="$60,910"
        onOpen={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="oracle-mini-chart-change"');
    expect(html).toContain("BTC/USD");
    expect(html).toContain("$66,978");
    expect(html).toContain("+0.03%");
    expect(html).toContain("24h");
    expect(html).not.toContain("DeepBook oracle price");
  });

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

    expect(getOraclePriceChartMinBarSpacing({ compact: true })).toBeLessThanOrEqual(
      0.03,
    );
  });

  test("defaults expanded charts to the latest six hours when more history exists", () => {
    expect(
      getInitialOraclePriceChartView({
        compact: false,
        pointTimes: [100, 10_000, 20_000, 30_000],
      }),
    ).toEqual({
      mode: "time-range",
      from: 8_400,
      to: 30_000,
    });
  });

  test("extends expanded market charts through the settlement time", () => {
    expect(
      getInitialOraclePriceChartView({
        compact: false,
        expiryTime: 45_000_000,
        pointTimes: [10_000, 20_000, 30_000],
        rangeSeconds: 60 * 60,
      }),
    ).toEqual({
      mode: "time-range",
      from: 26_400,
      to: 45_900,
    });
  });

  test("defaults feed mini charts to the latest fifteen minutes when more history exists", () => {
    expect(
      getInitialOraclePriceChartView({
        compact: true,
        pointTimes: [100, 1_000, 1_900, 2_000],
      }),
    ).toEqual({
      mode: "time-range",
      from: 1_100,
      to: 2_000,
    });
  });

  test("fits short-history charts instead of forcing an expanded range", () => {
    expect(
      getInitialOraclePriceChartView({
        compact: false,
        pointTimes: [1_900, 2_000],
      }),
    ).toEqual({ mode: "fit-content" });
  });
});
