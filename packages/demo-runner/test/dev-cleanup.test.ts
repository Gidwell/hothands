import { describe, expect, test } from "bun:test";
import {
  parseDevStatePids,
  parseHotHandsDevPids,
  parseLsofPids,
} from "../src/dev-cleanup";

describe("testnet dev cleanup", () => {
  test("parses unique listener PIDs from lsof output", () => {
    expect(
      parseLsofPids([
        "COMMAND   PID    USER   FD   TYPE DEVICE SIZE/OFF NODE NAME",
        "bun     71933 sorzech    4u  IPv4 0xabc      0t0  TCP 127.0.0.1:8789 (LISTEN)",
        "node    71936 sorzech   20u  IPv4 0xdef      0t0  TCP 127.0.0.1:5176 (LISTEN)",
        "bun     71933 sorzech    5u  IPv4 0xghi      0t0  TCP 127.0.0.1:8789 (LISTEN)",
      ].join("\n")),
    ).toEqual([71933, 71936]);
  });

  test("ignores empty and malformed lsof rows", () => {
    expect(parseLsofPids("COMMAND PID\n\nnot-a-real-row\n")).toEqual([]);
  });

  test("parses orphaned Hot Hands dev commands even when no port is listening", () => {
    expect(
      parseHotHandsDevPids(
        [
          " 5445     1 bun run --cwd apps/pwa dev -- --host 127.0.0.1 --port 5190",
          " 5446  5445 node /repo/node_modules/.bin/vite --host 0.0.0.0 --host 127.0.0.1 --port 5190",
          " 5416     1 bun packages/indexer/src/live.ts",
          " 7777     1 node unrelated-server.js --port 5190",
        ].join("\n"),
        {
          apiPort: 8791,
          pwaPort: 5190,
          repoRoot: "/repo",
        },
      ),
    ).toEqual([5416, 5445, 5446]);
  });

  test("parses exact launcher-owned PIDs from the dev pidfile", () => {
    expect(
      parseDevStatePids(
        JSON.stringify({
          version: 1,
          createdAt: "2026-06-04T18:00:00.000Z",
          cwd: "/repo",
          processes: [
            {
              command: ["bun", "apps/api-worker/src/testnet-dev-server.ts"],
              name: "api",
              pid: 71933,
            },
            {
              command: ["bun", "run", "--cwd", "apps/pwa", "dev"],
              name: "pwa",
              pid: 71936,
            },
          ],
        }),
      ),
    ).toEqual([71933, 71936]);
  });

  test("ignores malformed dev pidfile rows", () => {
    expect(
      parseDevStatePids(
        JSON.stringify({
          version: 1,
          processes: [
            { name: "api", pid: 0 },
            { name: "pwa", pid: "not-a-number" },
            null,
          ],
        }),
      ),
    ).toEqual([]);
  });

  test("parses orphaned Vite esbuild services under the repo root", () => {
    expect(
      parseHotHandsDevPids(
        [
          " 77836     1 /repo/node_modules/vite/node_modules/esbuild/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.7 --ping",
          " 77837     1 /other/node_modules/vite/node_modules/esbuild/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.7 --ping",
        ].join("\n"),
        {
          apiPort: 8791,
          pwaPort: 5190,
          repoRoot: "/repo",
        },
      ),
    ).toEqual([77836]);
  });
});
