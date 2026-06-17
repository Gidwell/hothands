import { describe, expect, test } from "bun:test";
import { LineStyle } from "lightweight-charts";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildOraclePriceChartFitResetKey,
  getOraclePriceChartGridLineOptions,
  getInitialOraclePriceChartView,
  getOraclePriceChartMinBarSpacing,
  getOraclePriceChartRangeOptions,
  OraclePriceChartCard,
  OraclePriceChartModal,
  OraclePriceChartPanel,
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

const marketContext = {
  expiryLabel: "Jun 11, 5:00 PM",
  expiryMs: 1_779_200_000_000,
  selectedSide: "UP" as const,
  selectedStrikeLabel: "$66,950",
  selectedStrikePrice: 66_950,
  strikes: [
    {
      id: "strike-66950",
      label: "$66,950",
      price: 66_950,
      selected: true,
    },
  ],
  timeRemainingLabel: "2h left",
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
    expect(html).toContain("bitcoin.png");
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

  test("renders market settlement controls when chart context is available", () => {
    const html = renderToStaticMarkup(
      <OraclePriceChartModal
        chart={readyChart}
        marketContext={marketContext}
        nowMs={1_779_190_000_000}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain("BTC/USD market chart");
    expect(html).toContain("UP $66,950 resolves Jun 11, 5:00 PM.");
    expect(html).toContain("resolves in 2h 47m");
    expect(html).toContain('data-testid="oracle-chart-range-4H"');
    expect(html).not.toContain('data-testid="oracle-chart-range-6H"');
    expect(html).toContain('data-testid="oracle-chart-settlement-toggle"');
    expect(html).toContain("Settlement");
    expect(html).toContain("UP $66,950");
  });

  test("disables chart range buttons that exceed the available oracle history", () => {
    const shortHistoryChart: OraclePriceChart = {
      ...readyChart,
      points: [
        {
          price: 66_960,
          timestampMs: 1_779_158_000_000,
        },
        {
          price: 66_978.22,
          timestampMs: 1_779_158_900_000,
        },
      ],
    };
    const html = renderToStaticMarkup(<OraclePriceChartPanel chart={shortHistoryChart} />);

    expect(html).toContain('data-testid="oracle-chart-range-1H"');
    expect(html).toContain('data-testid="oracle-chart-range-4H" disabled=""');
    expect(html).toContain('data-testid="oracle-chart-range-24H" disabled=""');
    expect(html).toContain('aria-pressed="true" data-testid="oracle-chart-range-1H"');
  });

  test("keeps longer chart ranges selectable when enough history exists", () => {
    const dayPlusHistory = [
      {
        price: 66_100,
        timestampMs: 1_779_000_000_000,
      },
      {
        price: 66_978.22,
        timestampMs: 1_779_090_000_000,
      },
    ];

    expect(getOraclePriceChartRangeOptions(dayPlusHistory)).toEqual([
      {
        available: true,
        key: "1H",
        label: "1h",
        seconds: 60 * 60,
      },
      {
        available: true,
        key: "4H",
        label: "4h",
        seconds: 4 * 60 * 60,
      },
      {
        available: true,
        key: "24H",
        label: "24h",
        seconds: 24 * 60 * 60,
      },
    ]);
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

  test("resets expanded chart fitting when the range control changes", () => {
    expect(
      buildOraclePriceChartFitResetKey({
        oracleId: "0xoracle",
        rangeKey: "1H",
      }),
    ).not.toBe(
      buildOraclePriceChartFitResetKey({
        oracleId: "0xoracle",
        rangeKey: "4H",
      }),
    );
    expect(
      buildOraclePriceChartFitResetKey({
        oracleId: "0xoracle",
        rangeKey: "24H",
      }),
    ).toBe("0xoracle:24H");
  });

  test("allows the expanded chart to zoom out across dense one-second oracle history", () => {
    expect(getOraclePriceChartMinBarSpacing({ compact: false })).toBeLessThanOrEqual(
      0.03,
    );

    expect(getOraclePriceChartMinBarSpacing({ compact: true })).toBeLessThanOrEqual(
      0.03,
    );
  });

  test("uses subtle dotted grid lines for expanded charts", () => {
    expect(
      getOraclePriceChartGridLineOptions({
        color: "rgba(139, 108, 255, 0.12)",
        compact: false,
      }),
    ).toEqual({
      color: "rgba(139, 108, 255, 0.12)",
      style: LineStyle.Dotted,
      visible: true,
    });

    expect(
      getOraclePriceChartGridLineOptions({
        color: "rgba(139, 108, 255, 0.12)",
        compact: true,
      }).visible,
    ).toBe(false);
  });

  test("defaults expanded charts to the latest four hours when more history exists", () => {
    expect(
      getInitialOraclePriceChartView({
        compact: false,
        pointTimes: [100, 10_000, 20_000, 30_000],
      }),
    ).toEqual({
      mode: "time-range",
      from: 15_600,
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
