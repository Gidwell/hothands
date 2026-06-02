import {
  buildCopyNextMintIntent,
  buildCopyNextMintTransaction,
  buildRedeemPositionTransaction as buildDeepBookRedeemPositionTransaction,
} from "@hot-hands/contracts";
import type { Transaction } from "@mysten/sui/transactions";
import type {
  TradeMarketLadderRow,
  TradeQuote,
} from "./marketHeatModel";
import type { PredictPortfolioPosition } from "./predictPortfolio";

export type BuildTradeMintTransactionInput = {
  predictManagerObjectId: string;
  market: TradeMarketLadderRow;
  quote: TradeQuote;
};

export function buildTradeMintTransaction({
  predictManagerObjectId,
  market,
  quote,
}: BuildTradeMintTransactionInput): Transaction {
  assertQuoteMatchesMarket(market, quote);

  return buildCopyNextMintTransaction(
    buildCopyNextMintIntent({
      direction: quote.side === "UP" ? "up" : "down",
      oracleId: market.oracleId,
      expiry: market.expiry,
      strike: market.strikeRaw,
      quantity: quote.quantity,
      predictManagerObjectId,
    }),
  );
}

export function buildPortfolioRedeemTransaction({
  position,
  predictManagerObjectId,
}: {
  position: PredictPortfolioPosition;
  predictManagerObjectId: string;
}): Transaction {
  return buildDeepBookRedeemPositionTransaction({
    direction: position.direction === "UP" ? "up" : "down",
    oracleId: position.oracleId,
    expiry: position.expiry,
    strike: position.strike,
    quantity: position.quantity,
    predictManagerObjectId,
  });
}

function assertQuoteMatchesMarket(market: TradeMarketLadderRow, quote: TradeQuote): void {
  if (quote.oracleId !== market.oracleId) {
    throw new Error("Quote oracle does not match the selected market.");
  }

  if (quote.expiry !== String(market.expiry)) {
    throw new Error("Quote expiry does not match the selected market.");
  }

  if (quote.strike !== String(market.strikeRaw)) {
    throw new Error("Quote strike does not match the selected market.");
  }
}
