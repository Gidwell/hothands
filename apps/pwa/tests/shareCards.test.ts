import { describe, expect, test } from "bun:test";
import {
  buildHotHandsShareText,
  buildShareToXUrl,
  type HotHandsShareCardInput,
} from "../src/shareCards";

const profileCard: HotHandsShareCardInput = {
  kind: "profile",
  title: "0x4a2c...9b9e",
  walletLabel: "0x4a2c...9b9e",
  walletAddress: "0x4a2cc121769d36c23dad6bb2b5382eb9aeb870fcf4022746b1aacb25948e9b9e",
  stats: [
    { label: "Heat", value: "82" },
    { label: "Win rate", value: "94%" },
    { label: "PnL", value: "+$24.69" },
    { label: "Streak", value: "13 wins" },
  ],
  copiedLabel: "Copied by 11 | $490 copied",
  url: "http://127.0.0.1:5176",
};

describe("share cards", () => {
  test("builds profile share text with stats, copied volume, and URL", () => {
    const text = buildHotHandsShareText(profileCard);

    expect(text).toContain("0x4a2c...9b9e on Hot Hands");
    expect(text).toContain("Heat: 82");
    expect(text).toContain("Win rate: 94%");
    expect(text).toContain("PnL: +$24.69");
    expect(text).toContain("Copied by 11");
    expect(text).toContain("http://127.0.0.1:5176");
  });

  test("builds call share text and X intent URL", () => {
    const card: HotHandsShareCardInput = {
      ...profileCard,
      kind: "call",
      title: "UP BTC/USD call",
      call: {
        direction: "UP",
        expiry: "Jun 12, 2026, 5:00 PM",
        strike: "$61,182",
      },
    };
    const text = buildHotHandsShareText(card);
    const intent = new URL(buildShareToXUrl(card));

    expect(text).toContain("UP $61,182 exp Jun 12, 2026, 5:00 PM");
    expect(intent.origin).toBe("https://twitter.com");
    expect(intent.pathname).toBe("/intent/tweet");
    expect(intent.searchParams.get("text")).toBe(text);
  });
});
