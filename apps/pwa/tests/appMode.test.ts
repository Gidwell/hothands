import { describe, expect, test } from "bun:test";
import { getInitialPreviewMode } from "../src/App";

describe("app preview mode", () => {
  test("defaults to testnet mode when an API base URL is configured", () => {
    expect(getInitialPreviewMode("http://127.0.0.1:8789")).toBe("market");
  });

  test("keeps replay mode when testnet API config is absent", () => {
    expect(getInitialPreviewMode(undefined)).toBe("replay");
    expect(getInitialPreviewMode("")).toBe("replay");
  });
});
