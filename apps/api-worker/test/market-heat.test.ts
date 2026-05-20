import { describe, expect, test } from "bun:test";
import worker, { type Env } from "../src/index";

describe("testnet market heat endpoint", () => {
  test("returns a captured read-only market heat projection for the PWA", async () => {
    const response = await worker.fetch(
      new Request("https://api.hot-hands.test/testnet/market-heat"),
      {} as Env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = await response.json();
    expect(body).toMatchObject({
      source: "captured_testnet",
      title: expect.any(String),
      mode: expect.any(String),
      detail: expect.any(String)
    });
    expect(body.rows).toBeArray();
    expect(body.rows.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(body.rows[0]).sort()).toEqual([
      "heatScore",
      "id",
      "manager",
      "market",
      "observedMint",
      "preparedCopies",
      "side",
      "status",
      "wallet"
    ]);
    expect(body.rows[0]).toEqual({
      id: expect.any(String),
      wallet: expect.any(String),
      manager: expect.any(String),
      market: expect.any(String),
      side: expect.stringMatching(/^(UP|DOWN)$/),
      observedMint: expect.any(Number),
      heatScore: expect.any(Number),
      preparedCopies: expect.any(Number),
      status: expect.stringMatching(/^(copy_ready|watching)$/)
    });
  });

  test("answers CORS preflight for local PWA reads", async () => {
    const response = await worker.fetch(
      new Request("https://api.hot-hands.test/testnet/market-heat", {
        method: "OPTIONS"
      }),
      {} as Env
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
  });
});
