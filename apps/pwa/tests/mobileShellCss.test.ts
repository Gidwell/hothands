import { describe, expect, test } from "bun:test";

describe("mobile shell CSS", () => {
  test("removes the desktop phone frame in narrow mobile viewports", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();

    expect(css).toContain("@media (max-width: 600px)");
    expect(css).toContain("place-items: stretch");
    expect(css).toContain("padding: 0");
    expect(css).toContain("width: 100%");
    expect(css).toContain("border-radius: 0");
    expect(css).toContain("box-shadow: none");
  });

  test("uses a compact two-column account summary on mobile", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();

    expect(css).toContain(".account-summary {");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(css).toContain("grid-column: auto;");
  });

  test("lets compact chart taps reach the mini chart button", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();

    expect(css).toContain(".oracle-mini-chart .oracle-chart-shell");
    expect(css).toContain(".oracle-mini-chart .oracle-chart-canvas");
    expect(css).toContain("pointer-events: none;");
  });

  test("keeps mobile portfolio history rows inside the viewport", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();

    expect(css).toContain("minmax(68px, 0.86fr) minmax(46px, 0.58fr) minmax(40px, 0.48fr)");
    expect(css).toContain("minmax(48px, 0.56fr) minmax(44px, 0.5fr)");
    expect(css).toContain(".portfolio-history-pnl {\n    min-width: 0;");
    expect(css).toContain(".portfolio-table-cell-positive");
    expect(css).toContain(".portfolio-table-cell-negative");
    expect(css).toContain(".portfolio-history-pnl-positive strong");
    expect(css).toContain(".portfolio-history-pnl-negative strong");
    expect(css).toContain(".portfolio-row > .portfolio-action-cell");
    expect(css).toContain(".portfolio-history-row > :nth-child(4)");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) 44px 46px 66px;");
    expect(css).toContain(".portfolio-row > .portfolio-table-cell:nth-child(5)");
    expect(css).toContain("grid-column: 4;");
    expect(css).toContain(
      ".portfolio-history-table-head span:nth-child(4),\n  .portfolio-history-table-head span:nth-child(5) {\n    text-align: right;",
    );
    expect(css).not.toContain(
      ".portfolio-history-table-head span:nth-child(4),\n  .portfolio-history-table-head span:nth-child(5) {\n    font-size: 0;",
    );
  });

  test("keeps mobile wallet leaderboard columns balanced", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();

    expect(css).toContain("grid-template-columns: 26px minmax(78px, 0.9fr) 60px 52px 32px 40px;");
    expect(css).toContain("grid-template-columns: 26px minmax(66px, 0.8fr) 50px 58px 52px 30px 40px;");
    expect(css).toContain("grid-template-columns: 26px minmax(78px, 0.9fr) 50px 58px 52px 30px;");
    expect(css).toContain(".wallet-leaderboard-streak-positive");
    expect(css).toContain(".wallet-leaderboard-streak-negative");
    expect(css).toContain(".wallet-leaderboard-profile-button strong");
    expect(css).toContain("text-overflow: ellipsis;");
  });

  test("keeps wallet leaderboard board tabs on one row", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();

    expect(css).toContain(".wallet-leaderboard-tabs {\n  grid-template-columns: repeat(3, minmax(0, 1fr));");
  });

  test("keeps the primary trade action in the purple design system", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();

    expect(css).toContain(".bottom-nav .bottom-nav-trade-action");
    expect(css).toContain(".bottom-nav .bottom-nav-trade-action::before");
    expect(css).toContain(".bottom-nav .bottom-nav-trade-action::after");
    expect(css).toContain("background: var(--hh-accent);");
    expect(css).toContain("background: var(--hh-accent-strong);");
    expect(css).toContain("background: conic-gradient(");
    expect(css).toContain("#ff5bd8");
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(css).toContain("animation: trade-action-heat 3.8s ease-in-out infinite;");
    expect(css).toContain("will-change: opacity, transform;");
    expect(css).toContain("@keyframes trade-action-heat");
    expect(css).not.toContain("#ffb000");
    expect(css).not.toContain("#ff6b2b");
    expect(css).not.toContain("radial-gradient(circle at 32% 22%");
  });

  test("uses compact chart controls for the embedded trade chart", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();

    expect(css).toContain(".oracle-chart-panel .oracle-chart-range-controls");
    expect(css).toContain(".oracle-expanded-chart.oracle-chart-panel-visual");
    expect(css).toContain("border-radius: 999px;");
    expect(css).toContain("min-height: 198px;");
  });

  test("keeps the trade chart sticky above the payout profiles", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();

    expect(css).toContain(".trade-oracle-chart-panel {");
    expect(css).toContain("position: sticky;");
    expect(css).toContain("top: 8px;");
    expect(css).toContain("z-index: 8;");
  });

  test("lets the feed market bucket rail use the full mobile width before scrolling", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();

    expect(css).toContain(".market-heat-heading {");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(css).toContain("width: 100%;");
    expect(css).toContain(".market-heat-heading-title p {\n  cursor: default;\n  font-size: 1.5rem;");
    expect(css).toContain(".market-heat-controls {");
    expect(css).toContain("width: min(86%, 372px);");
    expect(css).toContain("grid-template-columns: repeat(3, minmax(98px, 1fr));");
    expect(css).toContain("min-height: 46px;");
    expect(css).toContain("font-size: 0.86rem;");
    expect(css).toContain(".market-heat-expiry-group > .trade-expiry-rail {");
    expect(css).toContain("overflow-x: auto;");
    expect(css).toContain("overflow-y: visible;");
  });
});
