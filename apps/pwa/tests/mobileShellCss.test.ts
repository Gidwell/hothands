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

    expect(css).toContain("minmax(88px, 1.18fr) minmax(56px, 0.75fr) minmax(38px, 0.5fr)");
    expect(css).toContain("minmax(42px, 0.56fr) minmax(36px, 0.48fr)");
    expect(css).toContain(".portfolio-history-pnl {\n    min-width: 0;");
    expect(css).toContain(".portfolio-history-table-head span:nth-child(4)::after");
    expect(css).toContain('content: "Return";');
    expect(css).toContain('content: "P/L";');
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

  test("keeps the trade chart sticky above the strike ladder", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();

    expect(css).toContain(".trade-oracle-chart-panel {");
    expect(css).toContain("position: sticky;");
    expect(css).toContain("top: 8px;");
    expect(css).toContain("z-index: 8;");
  });
});
