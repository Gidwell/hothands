import { describe, expect, test } from "bun:test";
import {
  findIndexedPredictManagerForOwner,
  findPredictManagerForOwner,
  PREDICT_MANAGER_CREATED_EVENT_TYPE,
} from "../src/predictManager";

describe("PredictManager discovery", () => {
  test("finds the newest manager created for a connected owner", async () => {
    const calls: unknown[] = [];
    const managerId = await findPredictManagerForOwner({
      owner:
        "0x00000000000000000000000000000000000000000000000000000000000000aa",
      client: {
        queryEvents: async (input) => {
          calls.push(input);
          return {
            data: [
              {
                parsedJson: {
                  owner:
                    "0x00000000000000000000000000000000000000000000000000000000000000bb",
                  manager_id: "0xmanager-b",
                },
              },
              {
                parsedJson: {
                  owner:
                    "0x00000000000000000000000000000000000000000000000000000000000000aa",
                  manager_id: "0xmanager-a",
                },
              },
            ],
            hasNextPage: false,
            nextCursor: null,
          };
        },
      },
    });

    expect(calls).toEqual([
      {
        query: {
          MoveEventType: PREDICT_MANAGER_CREATED_EVENT_TYPE,
        },
        cursor: null,
        limit: 50,
        order: "descending",
      },
    ]);
    expect(managerId).toBe("0xmanager-a");
  });

  test("returns null when no manager event belongs to the owner", async () => {
    const managerId = await findPredictManagerForOwner({
      owner:
        "0x00000000000000000000000000000000000000000000000000000000000000aa",
      client: {
        queryEvents: async () => ({
          data: [
            {
              parsedJson: {
                owner:
                  "0x00000000000000000000000000000000000000000000000000000000000000bb",
                manager_id: "0xmanager-b",
              },
            },
          ],
          hasNextPage: false,
          nextCursor: null,
        }),
      },
    });

    expect(managerId).toBeNull();
  });

  test("recovers a manager id from indexed wallet trade events", async () => {
    const urls: string[] = [];
    const managerId = await findIndexedPredictManagerForOwner({
      apiBaseUrl: "https://api.hot-hands.test",
      owner:
        "0x00000000000000000000000000000000000000000000000000000000000000aa",
      fetcher: async (url) => {
        urls.push(url.toString());
        if (url.toString().includes("eventType=mint")) {
          return new Response(JSON.stringify({ data: [] }));
        }

        return new Response(
          JSON.stringify({
            data: [
              {
                parsedJson: {
                  manager_id:
                    "0x0000000000000000000000000000000000000000000000000000000000000abc",
                },
              },
            ],
          }),
        );
      },
    });

    expect(urls).toEqual([
      "https://api.hot-hands.test/testnet/portfolio-events?wallet=0x00000000000000000000000000000000000000000000000000000000000000aa&eventType=mint&limit=1",
      "https://api.hot-hands.test/testnet/portfolio-events?wallet=0x00000000000000000000000000000000000000000000000000000000000000aa&eventType=redeem&limit=1",
    ]);
    expect(managerId).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000abc",
    );
  });
});
