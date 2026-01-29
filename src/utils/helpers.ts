import { Address, Bytes, BigInt as GraphBN } from "@graphprotocol/graph-ts";
import { ERC20 } from "../../generated/FilecoinPayV1/ERC20";
import {
  Account,
  Operator,
  OperatorApproval,
  OperatorToken,
  Rail,
  RateChangeQueue,
  Token,
  UserToken,
} from "../../generated/schema";
import {
  DEFAULT_DECIMALS,
  EPOCH_DURATION,
  NATIVE_TOKEN_ADDRESS,
  ZERO_BIG_INT,
} from "./constants";
import {
  getOperatorApprovalEntityId,
  getOperatorTokenEntityId,
  getRailEntityId,
  getRateChangeQueueEntityId,
  getUserTokenEntityId,
} from "./keys";

// Result classes for tracking if entity is new
export class TokenWithIsNew {
  constructor(
    public token: Token,
    public isNew: boolean
  ) {}
}

export class AccountWithIsNew {
  constructor(
    public account: Account,
    public isNew: boolean
  ) {}
}

export class UserTokenWithIsNew {
  constructor(
    public userToken: UserToken,
    public isNew: boolean
  ) {}
}

export class OperatorWithIsNew {
  constructor(
    public operator: Operator,
    public isNew: boolean
  ) {}
}

export class OperatorTokenWithIsNew {
  constructor(
    public operatorToken: OperatorToken,
    public isNew: boolean
  ) {}
}

export class RateChangeQueueWithIsNew {
  constructor(
    public rateChangeQueue: RateChangeQueue,
    public isNew: boolean
  ) {}
}

// Token entity functions
export function getTokenDetails(address: Address): TokenWithIsNew {
  let token = Token.load(address);

  if (!token) {
    token = new Token(address);

    // Check if native token
    if (address.equals(Address.fromBytes(NATIVE_TOKEN_ADDRESS))) {
      token.name = "Filecoin";
      token.symbol = "FIL";
      token.decimals = DEFAULT_DECIMALS;
    } else {
      const erc20Contract = ERC20.bind(address);
      const tokenNameResult = erc20Contract.try_name();
      const tokenSymbolResult = erc20Contract.try_symbol();
      const tokenDecimalsResult = erc20Contract.try_decimals();

      token.name = tokenNameResult.reverted ? "Unknown" : tokenNameResult.value;
      token.symbol = tokenSymbolResult.reverted
        ? "UNKNOWN"
        : tokenSymbolResult.value;
      token.decimals = tokenDecimalsResult.reverted
        ? DEFAULT_DECIMALS
        : GraphBN.fromI32(tokenDecimalsResult.value);
    }

    token.volume = ZERO_BIG_INT;
    token.totalDeposits = ZERO_BIG_INT;
    token.totalWithdrawals = ZERO_BIG_INT;
    token.totalSettledAmount = ZERO_BIG_INT;
    token.userFunds = ZERO_BIG_INT;
    token.operatorCommission = ZERO_BIG_INT;
    token.totalUsers = ZERO_BIG_INT;
    token.totalFees = ZERO_BIG_INT;
    token.accumulatedFees = ZERO_BIG_INT;
    token.totalFilBurnedForFees = ZERO_BIG_INT;

    return new TokenWithIsNew(token, true);
  }

  return new TokenWithIsNew(token, false);
}

// Account entity functions
export function createOrLoadAccountByAddress(
  address: Address
): AccountWithIsNew {
  let account = Account.load(address);

  if (!account) {
    account = new Account(address);
    account.address = address;
    account.totalRails = ZERO_BIG_INT;
    account.totalApprovals = ZERO_BIG_INT;
    account.totalTokens = ZERO_BIG_INT;
    account.save();
    return new AccountWithIsNew(account, true);
  }

  return new AccountWithIsNew(account, false);
}

// UserToken entity functions
export function createOrLoadUserToken(
  account: Address,
  token: Address
): UserTokenWithIsNew {
  const id = getUserTokenEntityId(account, token);
  let userToken = UserToken.load(id);

  if (!userToken) {
    userToken = new UserToken(id);
    userToken.account = account;
    userToken.token = token;
    userToken.funds = ZERO_BIG_INT;
    userToken.lockupCurrent = ZERO_BIG_INT;
    userToken.lockupRate = ZERO_BIG_INT;
    userToken.lockupLastSettledUntilEpoch = ZERO_BIG_INT;
    userToken.lockupLastSettledUntilTimestamp = ZERO_BIG_INT;
    userToken.payout = ZERO_BIG_INT;
    userToken.fundsCollected = ZERO_BIG_INT;
    userToken.save();
    return new UserTokenWithIsNew(userToken, true);
  }

  return new UserTokenWithIsNew(userToken, false);
}

// Operator entity functions
export function createOrLoadOperator(address: Address): OperatorWithIsNew {
  let operator = Operator.load(address);

  if (!operator) {
    operator = new Operator(address);
    operator.address = address;
    operator.totalRails = ZERO_BIG_INT;
    operator.totalApprovals = ZERO_BIG_INT;
    operator.totalTokens = ZERO_BIG_INT;
    operator.save();
    return new OperatorWithIsNew(operator, true);
  }

  return new OperatorWithIsNew(operator, false);
}

// OperatorApproval entity functions
export function createOperatorApproval(
  client: Address,
  operator: Address,
  token: Address,
  lockupAllowance: GraphBN,
  rateAllowance: GraphBN
): OperatorApproval {
  const id = getOperatorApprovalEntityId(client, operator, token);
  const operatorApproval = new OperatorApproval(id);
  operatorApproval.client = client;
  operatorApproval.operator = operator;
  operatorApproval.token = token;
  operatorApproval.lockupAllowance = lockupAllowance;
  operatorApproval.lockupUsage = ZERO_BIG_INT;
  operatorApproval.rateAllowance = rateAllowance;
  operatorApproval.rateUsage = ZERO_BIG_INT;
  operatorApproval.save();

  return operatorApproval;
}

// OperatorToken entity functions
export function createOrLoadOperatorToken(
  operator: Bytes,
  token: Bytes
): OperatorTokenWithIsNew {
  const id = getOperatorTokenEntityId(operator, token);
  let operatorToken = OperatorToken.load(id);

  if (!operatorToken) {
    operatorToken = new OperatorToken(id);
    operatorToken.operator = operator;
    operatorToken.token = token;
    operatorToken.commissionEarned = ZERO_BIG_INT;
    operatorToken.volume = ZERO_BIG_INT;
    operatorToken.lockupAllowance = ZERO_BIG_INT;
    operatorToken.rateAllowance = ZERO_BIG_INT;
    operatorToken.lockupUsage = ZERO_BIG_INT;
    operatorToken.rateUsage = ZERO_BIG_INT;
    operatorToken.settledAmount = ZERO_BIG_INT;
    operatorToken.save();

    return new OperatorTokenWithIsNew(operatorToken, true);
  }

  return new OperatorTokenWithIsNew(operatorToken, false);
}

// Rail entity functions
export function createRail(
  railId: GraphBN,
  payer: Address,
  payee: Address,
  operator: Address,
  token: Address,
  validator: Address,
  settledUpTo: GraphBN,
  commissionRateBps: GraphBN,
  serviceFeeRecipient: Address,
  timestamp: GraphBN
): Rail {
  const rail = new Rail(getRailEntityId(railId));
  rail.railId = railId;
  rail.payer = payer;
  rail.payee = payee;
  rail.operator = operator;
  rail.token = token;
  rail.serviceFeeRecipient = serviceFeeRecipient;
  rail.commissionRateBps = commissionRateBps;
  rail.paymentRate = ZERO_BIG_INT;
  rail.lockupFixed = ZERO_BIG_INT;
  rail.lockupPeriod = ZERO_BIG_INT;
  rail.settledUpto = settledUpTo;
  rail.state = "ZERORATE";
  rail.endEpoch = ZERO_BIG_INT;
  rail.validator = validator;
  rail.totalSettledAmount = ZERO_BIG_INT;
  rail.totalNetPayeeAmount = ZERO_BIG_INT;
  rail.totalCommission = ZERO_BIG_INT;
  rail.totalFees = ZERO_BIG_INT;
  rail.totalSettlements = ZERO_BIG_INT;
  rail.totalOneTimePayments = ZERO_BIG_INT;
  rail.totalRateChanges = ZERO_BIG_INT;
  rail.createdAt = timestamp;
  rail.save();

  return rail;
}

// RateChangeQueue entity functions
export function createRateChangeQueue(
  rail: Rail,
  startEpoch: GraphBN,
  untilEpoch: GraphBN,
  rate: GraphBN
): RateChangeQueueWithIsNew {
  const id = getRateChangeQueueEntityId(rail.railId, startEpoch);
  let rateChangeQueue = RateChangeQueue.load(id);
  const isNew = !rateChangeQueue;

  if (!rateChangeQueue) {
    rateChangeQueue = new RateChangeQueue(id);
  }
  rateChangeQueue.rail = rail.id;
  rateChangeQueue.startEpoch = startEpoch;
  rateChangeQueue.untilEpoch = untilEpoch;
  rateChangeQueue.rate = rate;
  rateChangeQueue.save();

  return new RateChangeQueueWithIsNew(rateChangeQueue, isNew);
}

// Operator usage update functions
export function updateOperatorLockup(
  operatorApproval: OperatorApproval | null,
  oldLockup: GraphBN,
  newLockup: GraphBN
): void {
  if (!operatorApproval) {
    return;
  }

  operatorApproval.lockupUsage = operatorApproval.lockupUsage
    .minus(oldLockup)
    .plus(newLockup);
  if (operatorApproval.lockupUsage.lt(ZERO_BIG_INT)) {
    operatorApproval.lockupUsage = ZERO_BIG_INT;
  }
  operatorApproval.save();
}

export function updateOperatorRate(
  operatorApproval: OperatorApproval | null,
  oldRate: GraphBN,
  newRate: GraphBN
): void {
  if (!operatorApproval) {
    return;
  }

  operatorApproval.rateUsage = operatorApproval.rateUsage
    .minus(oldRate)
    .plus(newRate);
  if (operatorApproval.rateUsage.lt(ZERO_BIG_INT)) {
    operatorApproval.rateUsage = ZERO_BIG_INT;
  }
}

export function updateOperatorTokenLockup(
  operatorToken: OperatorToken | null,
  oldLockup: GraphBN,
  newLockup: GraphBN
): void {
  if (!operatorToken) {
    return;
  }

  operatorToken.lockupUsage = operatorToken.lockupUsage
    .minus(oldLockup)
    .plus(newLockup);
  if (operatorToken.lockupUsage.lt(ZERO_BIG_INT)) {
    operatorToken.lockupUsage = ZERO_BIG_INT;
  }
  operatorToken.save();
}

export function updateOperatorTokenRate(
  operatorToken: OperatorToken | null,
  oldRate: GraphBN,
  newRate: GraphBN
): void {
  if (!operatorToken) {
    return;
  }

  operatorToken.rateUsage = operatorToken.rateUsage.minus(oldRate).plus(newRate);
  if (operatorToken.rateUsage.lt(ZERO_BIG_INT)) {
    operatorToken.rateUsage = ZERO_BIG_INT;
  }
}

// Timestamp calculation helpers
export function getLockupLastSettledUntilTimestamp(
  lockupLastSettledUntilEpoch: GraphBN,
  blockNumber: GraphBN,
  blockTimestamp: GraphBN
): GraphBN {
  if (lockupLastSettledUntilEpoch.equals(blockNumber)) return blockTimestamp;

  return blockTimestamp.minus(
    blockNumber.minus(lockupLastSettledUntilEpoch).times(EPOCH_DURATION)
  );
}

// Check if token is native FIL
export function isNativeToken(tokenAddress: Bytes): boolean {
  return tokenAddress.equals(NATIVE_TOKEN_ADDRESS);
}
