import { Address, Bytes, log } from "@graphprotocol/graph-ts";
import {
  AccountLockupSettled as AccountLockupSettledEvent,
  BurnForFeesCall,
  DepositRecorded as DepositRecordedEvent,
  OperatorApprovalUpdated as OperatorApprovalUpdatedEvent,
  RailCreated as RailCreatedEvent,
  RailFinalized as RailFinalizedEvent,
  RailLockupModified as RailLockupModifiedEvent,
  RailOneTimePaymentProcessed as RailOneTimePaymentProcessedEvent,
  RailRateModified as RailRateModifiedEvent,
  RailSettled as RailSettledEvent,
  RailTerminated as RailTerminatedEvent,
  WithdrawRecorded as WithdrawRecordedEvent,
} from "../generated/FilecoinPayV1/FilecoinPayV1";
import {
  Account,
  FeeAuctionPurchase,
  LockupModification,
  OneTimePayment,
  OperatorApproval,
  Rail,
  Settlement,
  Token,
  UserToken,
} from "../generated/schema";
import { NATIVE_TOKEN_ADDRESS, ONE_BIG_INT, ZERO_BIG_INT } from "./utils/constants";
import {
  createOrLoadAccountByAddress,
  createOrLoadOperator,
  createOrLoadOperatorToken,
  createOrLoadUserToken,
  createRail,
  createRateChangeQueue,
  getLockupLastSettledUntilTimestamp,
  getTokenDetails,
  isNativeToken,
  updateOperatorLockup,
  updateOperatorRate,
  updateOperatorTokenLockup,
  updateOperatorTokenRate,
} from "./utils/helpers";
import {
  getFeeAuctionPurchaseEntityId,
  getLockupModificationEntityId,
  getOneTimePaymentEntityId,
  getRailEntityId,
  getSettlementEntityId,
} from "./utils/keys";
import {
  addFilBurned,
  incrementTotalAccounts,
  incrementTotalFeeAuctionPurchases,
  incrementTotalOneTimePayments,
  incrementTotalOperators,
  incrementTotalRails,
  incrementTotalSettlements,
  incrementTotalTokens,
  incrementUniquePayees,
  incrementUniquePayers,
  updateRailStateMetrics,
} from "./utils/metrics";

// ==================== Event Handlers ====================

export function handleAccountLockupSettled(
  event: AccountLockupSettledEvent
): void {
  const tokenAddress = event.params.token;
  const ownerAddress = event.params.owner;
  const lockupLastSettledUntilEpoch = event.params.lockupLastSettledAt;

  const userTokenId = ownerAddress.concat(tokenAddress);
  const userToken = UserToken.load(userTokenId);

  if (!userToken) {
    log.debug("[handleAccountLockupSettled] UserToken not found for id: {}", [
      userTokenId.toHexString(),
    ]);
    return;
  }

  userToken.lockupCurrent = event.params.lockupCurrent;
  userToken.lockupRate = event.params.lockupRate;
  userToken.lockupLastSettledUntilEpoch = lockupLastSettledUntilEpoch;
  userToken.lockupLastSettledUntilTimestamp = getLockupLastSettledUntilTimestamp(
    lockupLastSettledUntilEpoch,
    event.block.number,
    event.block.timestamp
  );

  userToken.save();
}

export function handleOperatorApprovalUpdated(
  event: OperatorApprovalUpdatedEvent
): void {
  const tokenAddress = event.params.token;
  const clientAddress = event.params.client;
  const operatorAddress = event.params.operator;
  const isApproved = event.params.approved;
  const rateAllowance = event.params.rateAllowance;
  const lockupAllowance = event.params.lockupAllowance;
  const maxLockupPeriod = event.params.maxLockupPeriod;

  const clientAccount = Account.load(clientAddress);

  let isNewApproval = false;

  const operatorWithIsNew = createOrLoadOperator(operatorAddress);
  const operator = operatorWithIsNew.operator;
  const isNewOperator = operatorWithIsNew.isNew;

  const operatorTokenWithIsNew = createOrLoadOperatorToken(
    operator.id,
    tokenAddress
  );
  const operatorToken = operatorTokenWithIsNew.operatorToken;
  const isNewOperatorToken = operatorTokenWithIsNew.isNew;

  const id = clientAddress.concat(operator.id).concat(tokenAddress);
  let operatorApproval = OperatorApproval.load(id);

  if (!operatorApproval) {
    isNewApproval = true;
    operatorApproval = new OperatorApproval(id);
    operatorApproval.client = clientAddress;
    operatorApproval.operator = operatorAddress;
    operatorApproval.token = tokenAddress;
    operatorApproval.lockupAllowance = ZERO_BIG_INT;
    operatorApproval.lockupUsage = ZERO_BIG_INT;
    operatorApproval.rateUsage = ZERO_BIG_INT;

    operator.totalApprovals = operator.totalApprovals.plus(ONE_BIG_INT);
    if (clientAccount) {
      clientAccount.totalApprovals =
        clientAccount.totalApprovals.plus(ONE_BIG_INT);
      clientAccount.save();
    }
  }

  operator.totalTokens = isNewOperatorToken
    ? operator.totalTokens.plus(ONE_BIG_INT)
    : operator.totalTokens;

  operatorToken.lockupAllowance = lockupAllowance;
  operatorToken.rateAllowance = rateAllowance;

  operatorApproval.rateAllowance = rateAllowance;
  operatorApproval.lockupAllowance = lockupAllowance;
  operatorApproval.isApproved = isApproved;
  operatorApproval.maxLockupPeriod = maxLockupPeriod;

  operator.save();
  operatorApproval.save();
  operatorToken.save();

  // Update global metrics
  if (isNewOperator) {
    incrementTotalOperators();
  }
}

export function handleRailCreated(event: RailCreatedEvent): void {
  const railId = event.params.railId;
  const payeeAddress = event.params.payee;
  const payerAddress = event.params.payer;
  const validator = event.params.validator;
  const tokenAddress = event.params.token;
  const operatorAddress = event.params.operator;
  const commissionRateBps = event.params.commissionRateBps;
  const serviceFeeRecipient = event.params.serviceFeeRecipient;

  // Ensure token exists
  const tokenWithIsNew = getTokenDetails(tokenAddress);
  const token = tokenWithIsNew.token;
  const isNewToken = tokenWithIsNew.isNew;
  token.save();

  const payerAccountWithIsNew = createOrLoadAccountByAddress(payerAddress);
  const payerAccount = payerAccountWithIsNew.account;
  const isNewPayer = payerAccount.totalRails.equals(ZERO_BIG_INT);
  const isNewPayerAccount = payerAccountWithIsNew.isNew;

  const payeeAccountWithIsNew = createOrLoadAccountByAddress(payeeAddress);
  const payeeAccount = payeeAccountWithIsNew.account;
  const isNewPayee = payeeAccount.totalRails.equals(ZERO_BIG_INT);
  const isNewPayeeAccount = payeeAccountWithIsNew.isNew;

  const operatorWithIsNew = createOrLoadOperator(operatorAddress);
  const operator = operatorWithIsNew.operator;
  const isNewOperator = operatorWithIsNew.isNew;

  payerAccount.totalRails = payerAccount.totalRails.plus(ONE_BIG_INT);
  payeeAccount.totalRails = payeeAccount.totalRails.plus(ONE_BIG_INT);
  operator.totalRails = operator.totalRails.plus(ONE_BIG_INT);

  const rail = createRail(
    railId,
    payerAddress,
    payeeAddress,
    operatorAddress,
    tokenAddress,
    validator,
    event.block.number,
    commissionRateBps,
    serviceFeeRecipient,
    event.block.timestamp
  );

  payerAccount.save();
  payeeAccount.save();
  operator.save();

  // Update global metrics
  incrementTotalRails();
  if (isNewPayerAccount) incrementTotalAccounts();
  if (isNewPayeeAccount) incrementTotalAccounts();
  if (isNewPayer) incrementUniquePayers();
  if (isNewPayee) incrementUniquePayees();
  if (isNewOperator) incrementTotalOperators();
  if (isNewToken) incrementTotalTokens();
}

export function handleRailTerminated(event: RailTerminatedEvent): void {
  const railId = event.params.railId;

  const rail = Rail.load(getRailEntityId(railId));

  if (!rail) {
    log.warning("[handleRailTerminated] Rail not found for railId: {}", [
      railId.toString(),
    ]);
    return;
  }

  const previousRailState = rail.state;
  rail.state = "TERMINATED";
  rail.endEpoch = event.params.endEpoch;

  const payerToken = UserToken.load(rail.payer.concat(rail.token));
  if (payerToken) {
    payerToken.lockupRate = payerToken.lockupRate.minus(rail.paymentRate);
    payerToken.save();
  }

  rail.save();

  // Update global metrics
  updateRailStateMetrics(previousRailState, "TERMINATED");
}

export function handleRailLockupModified(event: RailLockupModifiedEvent): void {
  const railId = event.params.railId;
  const oldLockupPeriod = event.params.oldLockupPeriod;
  const newLockupPeriod = event.params.newLockupPeriod;
  const oldLockupFixed = event.params.oldLockupFixed;
  const newLockupFixed = event.params.newLockupFixed;

  const rail = Rail.load(Bytes.fromByteArray(Bytes.fromBigInt(railId)));

  if (!rail) {
    log.warning("[handleRailLockupModified] Rail not found for railId: {}", [
      railId.toString(),
    ]);
    return;
  }

  // Create LockupModification record
  const lockupModificationId = getLockupModificationEntityId(
    event.transaction.hash,
    event.logIndex
  );
  const lockupModification = new LockupModification(lockupModificationId);
  lockupModification.rail = rail.id;
  lockupModification.oldLockupPeriod = oldLockupPeriod;
  lockupModification.newLockupPeriod = newLockupPeriod;
  lockupModification.oldLockupFixed = oldLockupFixed;
  lockupModification.newLockupFixed = newLockupFixed;
  lockupModification.blockNumber = event.block.number;
  lockupModification.blockTimestamp = event.block.timestamp;
  lockupModification.transactionHash = event.transaction.hash;
  lockupModification.save();

  const isTerminated = rail.state === "TERMINATED";
  const payerToken = UserToken.load(rail.payer.concat(rail.token));
  const operatorApprovalId = rail.payer.concat(rail.operator).concat(rail.token);
  const operatorApproval = OperatorApproval.load(operatorApprovalId);
  const operatorToken = createOrLoadOperatorToken(
    rail.operator,
    rail.token
  ).operatorToken;

  rail.lockupFixed = newLockupFixed;
  if (!isTerminated) {
    rail.lockupPeriod = newLockupPeriod;
  }
  rail.save();

  if (!payerToken) {
    return;
  }

  let oldLockup = oldLockupFixed;
  let newLockup = newLockupFixed;

  if (!isTerminated) {
    oldLockup = oldLockupFixed.plus(rail.paymentRate.times(oldLockupPeriod));
    newLockup = newLockupFixed.plus(rail.paymentRate.times(newLockupPeriod));
  }

  updateOperatorLockup(operatorApproval, oldLockup, newLockup);
  updateOperatorTokenLockup(operatorToken, oldLockup, newLockup);
}

export function handleRailRateModified(event: RailRateModifiedEvent): void {
  const railId = event.params.railId;
  const oldRate = event.params.oldRate;
  const newRate = event.params.newRate;

  const rail = Rail.load(getRailEntityId(railId));

  if (!rail) {
    log.warning("[handleRailRateModified] Rail not found for railId: {}", [
      railId.toString(),
    ]);
    return;
  }

  if (
    oldRate.equals(ZERO_BIG_INT) &&
    newRate.gt(ZERO_BIG_INT) &&
    rail.state !== "ACTIVE"
  ) {
    const previousState = rail.state;
    rail.state = "ACTIVE";

    // Update global metrics
    updateRailStateMetrics(previousState, "ACTIVE");
  }

  const rateChangeQueue = rail.rateChangeQueue.load();
  if (
    oldRate.notEqual(newRate) &&
    rail.settledUpto.notEqual(event.block.number)
  ) {
    if (oldRate.equals(ZERO_BIG_INT) && rateChangeQueue.length === 0) {
      rail.settledUpto = event.block.number;
    } else {
      if (
        rateChangeQueue.length === 0 ||
        event.block.number.notEqual(
          rateChangeQueue[rateChangeQueue.length - 1].untilEpoch
        )
      ) {
        const startEpoch =
          rateChangeQueue.length === 0
            ? rail.settledUpto
            : rateChangeQueue[rateChangeQueue.length - 1].untilEpoch;
        const isNew = createRateChangeQueue(
          rail,
          startEpoch,
          event.block.number,
          oldRate
        ).isNew;
        rail.totalRateChanges = rail.totalRateChanges.plus(
          isNew ? ONE_BIG_INT : ZERO_BIG_INT
        );
      }
    }
  }

  rail.paymentRate = newRate;
  rail.save();

  const operatorApprovalId = rail.payer
    .concat(rail.operator)
    .concat(rail.token);
  const operatorApproval = OperatorApproval.load(operatorApprovalId);
  const operatorToken = createOrLoadOperatorToken(
    rail.operator,
    rail.token
  ).operatorToken;

  const payerToken = UserToken.load(rail.payer.concat(rail.token));

  if (!operatorApproval) {
    log.warning(
      "[handleRailRateModified] Operator approval not found for railId: {}",
      [railId.toString()]
    );
    return;
  }

  const isTerminated = rail.state === "TERMINATED";
  if (!isTerminated) {
    updateOperatorRate(operatorApproval, oldRate, newRate);
    updateOperatorTokenRate(operatorToken, oldRate, newRate);

    if (payerToken) {
      payerToken.lockupRate = payerToken.lockupRate.minus(oldRate).plus(newRate);
      payerToken.save();
    }
  }

  if (oldRate.notEqual(newRate)) {
    let effectiveLockupPeriod = ZERO_BIG_INT;
    if (isTerminated) {
      effectiveLockupPeriod = rail.endEpoch.minus(event.block.number);
      if (effectiveLockupPeriod.lt(ZERO_BIG_INT)) {
        effectiveLockupPeriod = ZERO_BIG_INT;
      }
    } else if (payerToken) {
      effectiveLockupPeriod = rail.lockupPeriod.minus(
        event.block.number.minus(payerToken.lockupLastSettledUntilEpoch)
      );
    }
    if (effectiveLockupPeriod.gt(ZERO_BIG_INT)) {
      const oldLockup = oldRate.times(effectiveLockupPeriod);
      const newLockup = newRate.times(effectiveLockupPeriod);
      updateOperatorLockup(operatorApproval, oldLockup, newLockup);
      updateOperatorTokenLockup(operatorToken, oldLockup, newLockup);
      return;
    }
  }
  operatorApproval.save();
  operatorToken.save();
}

export function handleRailSettled(event: RailSettledEvent): void {
  const railId = event.params.railId;
  const totalSettledAmount = event.params.totalSettledAmount;
  const totalNetPayeeAmount = event.params.totalNetPayeeAmount;
  const operatorCommission = event.params.operatorCommission;
  const networkFee = event.params.networkFee;
  const timestamp = event.block.timestamp;
  const blockNumber = event.block.number;

  const rail = Rail.load(getRailEntityId(railId));

  if (!rail) {
    log.warning("[handleRailSettled] Rail not found for railId: {}", [
      railId.toString(),
    ]);
    return;
  }

  // Update rail aggregate data
  rail.totalSettledAmount = rail.totalSettledAmount.plus(totalSettledAmount);
  rail.totalNetPayeeAmount = rail.totalNetPayeeAmount.plus(totalNetPayeeAmount);
  rail.totalCommission = rail.totalCommission.plus(operatorCommission);
  rail.totalFees = rail.totalFees.plus(networkFee);
  rail.totalSettlements = rail.totalSettlements.plus(ONE_BIG_INT);
  rail.settledUpto = event.params.settledUpTo;

  // Create Settlement entity
  const settlementId = getSettlementEntityId(
    event.transaction.hash,
    event.logIndex
  );
  const settlement = new Settlement(settlementId);
  const operatorToken = createOrLoadOperatorToken(
    rail.operator,
    rail.token
  ).operatorToken;

  settlement.rail = rail.id;
  settlement.totalSettledAmount = totalSettledAmount;
  settlement.totalNetPayeeAmount = totalNetPayeeAmount;
  settlement.operatorCommission = operatorCommission;
  settlement.fee = networkFee; // 0.5% fee in rail's token
  settlement.settledUpto = event.params.settledUpTo;
  settlement.blockNumber = blockNumber;
  settlement.blockTimestamp = timestamp;
  settlement.transactionHash = event.transaction.hash;

  operatorToken.settledAmount =
    operatorToken.settledAmount.plus(totalSettledAmount);
  operatorToken.volume = operatorToken.volume.plus(totalSettledAmount);
  operatorToken.commissionEarned =
    operatorToken.commissionEarned.plus(operatorCommission);

  // Update funds for payer, payee, and service fee recipient
  const payerToken = UserToken.load(rail.payer.concat(rail.token));
  const payeeToken = createOrLoadUserToken(
    Address.fromBytes(rail.payee),
    Address.fromBytes(rail.token)
  ).userToken;
  const serviceFeeRecipientUserToken = createOrLoadUserToken(
    Address.fromBytes(rail.serviceFeeRecipient),
    Address.fromBytes(rail.token)
  ).userToken;
  const token = Token.load(rail.token);

  // Determine if FIL is burned directly (for native token) or fees accumulate
  let filBurned = ZERO_BIG_INT;
  if (isNativeToken(rail.token)) {
    // For native FIL, fee is burned directly
    filBurned = networkFee;
  } else {
    // For ERC20 tokens, fee accumulates for auction
    if (token) {
      token.accumulatedFees = token.accumulatedFees.plus(networkFee);
    }
  }
  
  if (token) {
    // userFunds decreases by networkFee (fee leaves the user pool)
    // commission stays in user pool (moves from payer to service fee recipient)
    token.userFunds = token.userFunds.minus(networkFee);
    token.totalSettledAmount = token.totalSettledAmount.plus(totalSettledAmount);
    token.totalFees = token.totalFees.plus(networkFee);
    token.volume = token.volume.plus(totalSettledAmount);
    token.operatorCommission = token.operatorCommission.plus(operatorCommission);
    token.save();
  }

  if (payerToken) {
    payerToken.funds = payerToken.funds.minus(totalSettledAmount);
    payerToken.payout = payerToken.payout.plus(totalSettledAmount);
    payerToken.save();
  }

  if (payeeToken) {
    payeeToken.funds = payeeToken.funds.plus(totalNetPayeeAmount);
    payeeToken.fundsCollected =
      payeeToken.fundsCollected.plus(totalNetPayeeAmount);
    payeeToken.save();
  }

  // Credit service fee recipient with commission
  if (serviceFeeRecipientUserToken) {
    serviceFeeRecipientUserToken.funds =
      serviceFeeRecipientUserToken.funds.plus(operatorCommission);
    serviceFeeRecipientUserToken.save();
  }

  rail.save();
  settlement.save();
  operatorToken.save();

  // Update global metrics
  incrementTotalSettlements();
  addFilBurned(filBurned);
}

export function handleDepositRecorded(event: DepositRecordedEvent): void {
  const tokenAddress = event.params.token;
  const accountAddress = event.params.to;
  const amount = event.params.amount;

  const tokenWithIsNew = getTokenDetails(tokenAddress);
  const token = tokenWithIsNew.token;
  const isNewToken = tokenWithIsNew.isNew;

  const accountWithIsNew = createOrLoadAccountByAddress(accountAddress);
  const account = accountWithIsNew.account;
  const isNewAccount = accountWithIsNew.isNew;

  const userTokenWithIsNew = createOrLoadUserToken(accountAddress, tokenAddress);
  const userToken = userTokenWithIsNew.userToken;
  const isNewUserToken = userTokenWithIsNew.isNew;

  token.userFunds = token.userFunds.plus(amount);
  token.totalDeposits = token.totalDeposits.plus(amount);
  token.volume = token.volume.plus(amount);
  token.totalUsers = isNewUserToken
    ? token.totalUsers.plus(ONE_BIG_INT)
    : token.totalUsers;
  token.save();

  if (isNewUserToken) {
    account.totalTokens = account.totalTokens.plus(ONE_BIG_INT);
    account.save();
  }

  userToken.funds = userToken.funds.plus(amount);
  userToken.save();

  // Update global metrics
  if (isNewAccount) incrementTotalAccounts();
  if (isNewToken) incrementTotalTokens();
}

export function handleWithdrawRecorded(event: WithdrawRecordedEvent): void {
  const tokenAddress = event.params.token;
  const accountAddress = event.params.from;
  const amount = event.params.amount;

  const userTokenId = accountAddress.concat(tokenAddress);
  const userToken = UserToken.load(userTokenId);
  if (!userToken) {
    log.warning("[handleWithdrawRecorded] UserToken not found for id: {}", [
      userTokenId.toHexString(),
    ]);
    return;
  }
  userToken.funds = userToken.funds.minus(amount);
  const token = Token.load(userToken.token);
  if (token) {
    token.userFunds = token.userFunds.minus(amount);
    token.totalWithdrawals = token.totalWithdrawals.plus(amount);
    token.volume = token.volume.plus(amount);
    token.save();
  }
  userToken.save();
}

export function handleRailOneTimePaymentProcessed(
  event: RailOneTimePaymentProcessedEvent
): void {
  const railId = event.params.railId;
  const netPayeeAmount = event.params.netPayeeAmount;
  const operatorCommission = event.params.operatorCommission;
  const networkFee = event.params.networkFee;
  const grossAmount = operatorCommission.plus(netPayeeAmount).plus(networkFee);

  const rail = Rail.load(getRailEntityId(railId));

  if (!rail) {
    log.warning(
      "[handleRailOneTimePaymentProcessed] Rail not found for railId: {}",
      [railId.toString()]
    );
    return;
  }

  // Create OneTimePayment entity (NEW)
  const oneTimePaymentId = getOneTimePaymentEntityId(
    event.transaction.hash,
    event.logIndex
  );
  const oneTimePayment = new OneTimePayment(oneTimePaymentId);
  oneTimePayment.rail = rail.id;
  oneTimePayment.netPayeeAmount = netPayeeAmount;
  oneTimePayment.operatorCommission = operatorCommission;
  oneTimePayment.fee = networkFee;
  oneTimePayment.grossAmount = grossAmount;
  oneTimePayment.blockNumber = event.block.number;
  oneTimePayment.blockTimestamp = event.block.timestamp;
  oneTimePayment.transactionHash = event.transaction.hash;
  oneTimePayment.save();

  // Update rail aggregates (one-time payments are also settlements)
  rail.lockupFixed = rail.lockupFixed.minus(grossAmount);
  rail.totalSettledAmount = rail.totalSettledAmount.plus(grossAmount);
  rail.totalNetPayeeAmount = rail.totalNetPayeeAmount.plus(netPayeeAmount);
  rail.totalCommission = rail.totalCommission.plus(operatorCommission);
  rail.totalFees = rail.totalFees.plus(networkFee);
  rail.totalOneTimePayments = rail.totalOneTimePayments.plus(ONE_BIG_INT);
  rail.save();

  const payerToken = UserToken.load(rail.payer.concat(rail.token));
  const payeeToken = createOrLoadUserToken(
    Address.fromBytes(rail.payee),
    Address.fromBytes(rail.token)
  ).userToken;
  const serviceFeeRecipientUserToken = createOrLoadUserToken(
    Address.fromBytes(rail.serviceFeeRecipient),
    Address.fromBytes(rail.token)
  ).userToken;
  const token = Token.load(rail.token);

  // Determine if FIL is burned directly or fees accumulate
  let filBurned = ZERO_BIG_INT;
  if (isNativeToken(rail.token)) {
    filBurned = networkFee;
  } else {
    if (token) {
      token.accumulatedFees = token.accumulatedFees.plus(networkFee);
    }
  }

  if (token) {
    token.userFunds = token.userFunds.minus(networkFee);
    token.totalSettledAmount = token.totalSettledAmount.plus(grossAmount);
    token.totalFees = token.totalFees.plus(networkFee);
    token.volume = token.volume.plus(grossAmount);
    token.operatorCommission = token.operatorCommission.plus(operatorCommission);
    token.save();
  }
  if (payerToken) {
    payerToken.funds = payerToken.funds.minus(grossAmount);
    payerToken.payout = payerToken.payout.plus(grossAmount);
    payerToken.save();
  }
  if (payeeToken) {
    payeeToken.funds = payeeToken.funds.plus(netPayeeAmount);
    payeeToken.fundsCollected = payeeToken.fundsCollected.plus(netPayeeAmount);
    payeeToken.save();
  }
  if (serviceFeeRecipientUserToken) {
    serviceFeeRecipientUserToken.funds =
      serviceFeeRecipientUserToken.funds.plus(operatorCommission);
    serviceFeeRecipientUserToken.save();
  }

  const operatorApprovalId = rail.payer
    .concat(rail.operator)
    .concat(rail.token);
  const operatorApproval = OperatorApproval.load(operatorApprovalId);
  const operatorToken = createOrLoadOperatorToken(
    rail.operator,
    rail.token
  ).operatorToken;

  if (!operatorApproval) {
    log.warning(
      "[handleRailOneTimePaymentProcessed] Operator approval not found for railId: {}",
      [railId.toString()]
    );
    return;
  }

  // Match contract logic: floor lockupAllowance at 0
  operatorApproval.lockupAllowance = grossAmount.gt(operatorApproval.lockupAllowance)
    ? ZERO_BIG_INT
    : operatorApproval.lockupAllowance.minus(grossAmount);
  operatorApproval.lockupUsage = operatorApproval.lockupUsage.minus(grossAmount);
  // Apply same floor logic for aggregate tracking
  operatorToken.lockupAllowance = grossAmount.gt(operatorToken.lockupAllowance)
    ? ZERO_BIG_INT
    : operatorToken.lockupAllowance.minus(grossAmount);
  operatorToken.lockupUsage = operatorToken.lockupUsage.minus(grossAmount);
  operatorToken.commissionEarned =
    operatorToken.commissionEarned.plus(operatorCommission);
  operatorToken.volume = operatorToken.volume.plus(grossAmount);
  operatorToken.settledAmount = operatorToken.settledAmount.plus(grossAmount);
  operatorApproval.save();
  operatorToken.save();

  // Update global metrics
  incrementTotalOneTimePayments();
  addFilBurned(filBurned);
}

export function handleRailFinalized(event: RailFinalizedEvent): void {
  const railId = event.params.railId;

  const rail = Rail.load(getRailEntityId(railId));

  if (!rail) {
    log.warning("[handleRailFinalized] Rail not found for railId: {}", [
      railId.toString(),
    ]);
    return;
  }

  const previousState = rail.state;

  const operatorApprovalId = rail.payer
    .concat(rail.operator)
    .concat(rail.token);
  const operatorApproval = OperatorApproval.load(operatorApprovalId);
  const operatorToken = createOrLoadOperatorToken(
    rail.operator,
    rail.token
  ).operatorToken;
  const oldLockup = rail.lockupFixed.plus(
    rail.lockupPeriod.times(rail.paymentRate)
  );
  updateOperatorLockup(operatorApproval, oldLockup, ZERO_BIG_INT);
  updateOperatorTokenLockup(operatorToken, oldLockup, ZERO_BIG_INT);

  rail.state = "FINALIZED";
  rail.save();

  // Update global metrics
  updateRailStateMetrics(previousState, "FINALIZED");
}

// ==================== Call Handlers ====================

export function handleBurnForFees(call: BurnForFeesCall): void {
  const tokenAddress = call.inputs.token;
  const recipient = call.inputs.recipient;
  const requested = call.inputs.requested;
  const filBurned = call.transaction.value;

  const token = Token.load(tokenAddress);
  if (!token) {
    log.warning("[handleBurnForFees] Token not found for address: {}", [
      tokenAddress.toHexString(),
    ]);
    return;
  }

  // Create FeeAuctionPurchase entity
  const purchaseId = getFeeAuctionPurchaseEntityId(
    call.transaction.hash,
    call.transaction.index.toI32()
  );
  const purchase = new FeeAuctionPurchase(purchaseId);
  purchase.token = tokenAddress;
  purchase.recipient = recipient;
  purchase.amountPurchased = requested;
  purchase.filBurned = filBurned;
  purchase.blockNumber = call.block.number;
  purchase.blockTimestamp = call.block.timestamp;
  purchase.transactionHash = call.transaction.hash;
  purchase.save();

  // Update token metrics
  token.accumulatedFees = token.accumulatedFees.minus(requested);
  token.totalFilBurnedForFees = token.totalFilBurnedForFees.plus(filBurned);
  token.save();

  // Update global metrics
  incrementTotalFeeAuctionPurchases();
  addFilBurned(filBurned);
}
