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

    expect(css).toContain("minmax(96px, 1.45fr) minmax(58px, 0.85fr) minmax(36px, 0.52fr)");
    expect(css).toContain("minmax(24px, 0.36fr) minmax(24px, 0.36fr)");
    expect(css).toContain(".portfolio-history-pnl {\n    min-width: 0;");
    expect(css).toContain(".portfolio-history-table-head span:nth-child(4)::after");
    expect(css).toContain('content: "Pay";');
    expect(css).toContain('content: "P/L";');
  });
});
