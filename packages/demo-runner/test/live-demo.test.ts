import { describe, expect, test } from "bun:test";
import { produceRealtimeActivityTraceById } from "../src/index";
import {
  buildActivityEndpoint,
  parsePushActivityArgs,
  pushRealtimeActivity,
} from "../src/live-demo";

describe("live demo activity push", () => {
  test("parses push activity arguments for repeatable local demos", () => {
    expect(
      parsePushActivityArgs([
        "trap-streak",
        "--worker-url",
        "http://127.0.0.1:9000/",
        "--table-id",
        "btc-custom",
        "--step",
        "3",
        "--interval-ms",
        "0",
      ]),
    ).toEqual({
      scenarioId: "trap-streak",
      workerUrl: "http://127.0.0.1:9000/",
      tableId: "btc-custom",
      step: 3,
      from: 0,
      intervalMs: 0,
    });

    expect(parsePushActivityArgs([])).toMatchObject({
      scenarioId: "opening-night",
      workerUrl: "http://127.0.0.1:8788",
      from: 0,
      intervalMs: 650,
    });
  });

  test("posts selected fixture activity to the worker endpoint one frame at a time", async () => {
    const trace = produceRealtimeActivityTraceById("opening-night");
    const posts: Array<{ url: string; body: unknown; headers: unknown }> = [];

    const result = await pushRealtimeActivity({
      scenarioId: "opening-night",
      workerUrl: "http://127.0.0.1:8788/",
      from: 1,
      count: 2,
      intervalMs: 0,
      fetchImpl: async (input, init) => {
        posts.push({
          url: String(input),
          body: JSON.parse(String(init?.body)),
          headers: init?.headers,
        });

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      sleep: async () => {},
    });

    expect(result).toEqual({
      scenarioId: "opening-night",
      tableId: "btc-15m",
      workerUrl: "http://127.0.0.1:8788/",
      postedCount: 2,
      postedEvents: ["copy_submitted", "copy_executed"],
    });
    expect(posts.map((post) => post.url)).toEqual([
      "http://127.0.0.1:8788/tables/btc-15m/activity",
      "http://127.0.0.1:8788/tables/btc-15m/activity",
    ]);
    expect(posts[0]?.body).toEqual([trace[1]]);
    expect(posts[1]?.body).toEqual([trace[2]]);
    expect(posts[0]?.headers).toEqual({
      "content-type": "application/json",
    });
  });
});

describe("live demo worker endpoint", () => {
  test("builds a normalized table activity endpoint", () => {
    expect(buildActivityEndpoint("http://127.0.0.1:8788/", "btc-15m")).toBe(
      "http://127.0.0.1:8788/tables/btc-15m/activity",
    );
  });
});
