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
});
