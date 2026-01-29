import { BigInt as GraphBN } from "@graphprotocol/graph-ts";
import { PaymentsMetric } from "../../generated/schema";
import { ONE_BIG_INT, ZERO_BIG_INT } from "./constants";
import { getPaymentsMetricEntityId } from "./keys";

// Load or create the global PaymentsMetric singleton
export function loadOrCreatePaymentsMetric(): PaymentsMetric {
  const id = getPaymentsMetricEntityId();
  let metric = PaymentsMetric.load(id);

  if (!metric) {
    metric = new PaymentsMetric(id);
    metric.totalRails = ZERO_BIG_INT;
    metric.totalOperators = ZERO_BIG_INT;
    metric.totalTokens = ZERO_BIG_INT;
    metric.totalAccounts = ZERO_BIG_INT;
    metric.totalFilBurned = ZERO_BIG_INT;
    metric.totalRailSettlements = ZERO_BIG_INT;
    metric.totalOneTimePayments = ZERO_BIG_INT;
    metric.totalZeroRateRails = ZERO_BIG_INT;
    metric.totalActiveRails = ZERO_BIG_INT;
    metric.totalTerminatedRails = ZERO_BIG_INT;
    metric.totalFinalizedRails = ZERO_BIG_INT;
    // TODO: after the burnforfee event
    // metric.totalFeeAuctionPurchases = ZERO_BIG_INT;
    metric.uniquePayers = ZERO_BIG_INT;
    metric.uniquePayees = ZERO_BIG_INT;
  }

  return metric;
}

// Update functions for PaymentsMetric

export function incrementTotalRails(): void {
  const metric = loadOrCreatePaymentsMetric();
  metric.totalRails = metric.totalRails.plus(ONE_BIG_INT);
  metric.totalZeroRateRails = metric.totalZeroRateRails.plus(ONE_BIG_INT);
  metric.save();
}

export function incrementTotalOperators(): void {
  const metric = loadOrCreatePaymentsMetric();
  metric.totalOperators = metric.totalOperators.plus(ONE_BIG_INT);
  metric.save();
}

export function incrementTotalTokens(): void {
  const metric = loadOrCreatePaymentsMetric();
  metric.totalTokens = metric.totalTokens.plus(ONE_BIG_INT);
  metric.save();
}

export function incrementTotalAccounts(count: GraphBN = ONE_BIG_INT): void {
  const metric = loadOrCreatePaymentsMetric();
  metric.totalAccounts = metric.totalAccounts.plus(count);
  metric.save();
}

export function incrementUniquePayers(): void {
  const metric = loadOrCreatePaymentsMetric();
  metric.uniquePayers = metric.uniquePayers.plus(ONE_BIG_INT);
  metric.save();
}

export function incrementUniquePayees(): void {
  const metric = loadOrCreatePaymentsMetric();
  metric.uniquePayees = metric.uniquePayees.plus(ONE_BIG_INT);
  metric.save();
}

export function incrementTotalSettlements(): void {
  const metric = loadOrCreatePaymentsMetric();
  metric.totalRailSettlements = metric.totalRailSettlements.plus(ONE_BIG_INT);
  metric.save();
}

export function incrementTotalOneTimePayments(): void {
  const metric = loadOrCreatePaymentsMetric();
  metric.totalOneTimePayments = metric.totalOneTimePayments.plus(ONE_BIG_INT);
  metric.save();
}
// TODO: after the burnforfee event
// export function incrementTotalFeeAuctionPurchases(): void {
//   const metric = loadOrCreatePaymentsMetric();
//   metric.totalFeeAuctionPurchases = metric.totalFeeAuctionPurchases.plus(ONE_BIG_INT);
//   metric.save();
// }

export function addFilBurned(amount: GraphBN): void {
  if (amount.equals(ZERO_BIG_INT)) return;
  const metric = loadOrCreatePaymentsMetric();
  metric.totalFilBurned = metric.totalFilBurned.plus(amount);
  metric.save();
}

export function updateRailStateMetrics(
  previousState: string,
  newState: string
): void {
  if (previousState === newState) return;

  const metric = loadOrCreatePaymentsMetric();

  // Handle state transitions
  if (newState === "ACTIVE" && previousState === "ZERORATE") {
    metric.totalZeroRateRails = metric.totalZeroRateRails.minus(ONE_BIG_INT);
    metric.totalActiveRails = metric.totalActiveRails.plus(ONE_BIG_INT);
  } else if (newState === "TERMINATED") {
    metric.totalActiveRails = metric.totalActiveRails.minus(ONE_BIG_INT);
    metric.totalTerminatedRails = metric.totalTerminatedRails.plus(ONE_BIG_INT);
  } else if (newState === "FINALIZED") {
    metric.totalTerminatedRails = metric.totalTerminatedRails.minus(ONE_BIG_INT);
    metric.totalFinalizedRails = metric.totalFinalizedRails.plus(ONE_BIG_INT);
  }

  metric.save();
}
