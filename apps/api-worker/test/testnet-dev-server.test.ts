import { describe, expect, test } from "bun:test";
import { createTestnetDevServerFetch } from "../src/testnet-dev-server";

describe("testnet API dev server harness", () => {
  test("serves market heat through the live-first projection with deterministic fallback", async () => {
    const fetchHandler = createTestnetDevServerFetch({
      fetchImpl: async () => {
        throw new Error("local testnet offline");
      }
    });

    const response = await fetchHandler(
      new Request("http://127.0.0.1:8789/testnet/market-heat")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = await response.json();
    expect(body.source).toBe("captured_testnet");
    expect(body.mode).toBe("testnet");
    expect(body.rows).toBeArray();
    expect(body.rows.length).toBeGreaterThan(0);
  });
});
