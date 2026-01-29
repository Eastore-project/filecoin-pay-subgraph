import {
  assert,
  describe,
  test,
  clearStore,
  beforeEach,
  afterAll,
  createMockedFunction,
  newMockEvent,
} from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  handleRailCreated,
  handleRailSettled,
  handleRailOneTimePaymentProcessed,
} from "../src/filecoin-pay";
import {
  RailCreated as RailCreatedEvent,
  RailSettled as RailSettledEvent,
  RailOneTimePaymentProcessed as RailOneTimePaymentProcessedEvent,
} from "../generated/FilecoinPayV1/FilecoinPayV1";

// Test addresses
const PAYER_ADDRESS = Address.fromString(
  "0x0000000000000000000000000000000000000001"
);
const PAYEE_ADDRESS = Address.fromString(
  "0x0000000000000000000000000000000000000002"
);
const OPERATOR_ADDRESS = Address.fromString(
  "0x0000000000000000000000000000000000000003"
);
const TOKEN_ADDRESS = Address.fromString(
  "0x0000000000000000000000000000000000000004"
);
const VALIDATOR_ADDRESS = Address.fromString(
  "0x0000000000000000000000000000000000000005"
);
const SERVICE_FEE_RECIPIENT = Address.fromString(
  "0x0000000000000000000000000000000000000006"
);

// Helper to create RailCreated event
function createRailCreatedEvent(
  railId: BigInt,
  payer: Address,
  payee: Address,
  token: Address,
  operator: Address,
  validator: Address,
  serviceFeeRecipient: Address,
  commissionRateBps: BigInt
): RailCreatedEvent {
  let mockEvent = newMockEvent();
  let event = changetype<RailCreatedEvent>(mockEvent);

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam(
      "railId",
      ethereum.Value.fromUnsignedBigInt(railId)
    )
  );
  event.parameters.push(
    new ethereum.EventParam("payer", ethereum.Value.fromAddress(payer))
  );
  event.parameters.push(
    new ethereum.EventParam("payee", ethereum.Value.fromAddress(payee))
  );
  event.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
  );
  event.parameters.push(
    new ethereum.EventParam("operator", ethereum.Value.fromAddress(operator))
  );
  event.parameters.push(
    new ethereum.EventParam("validator", ethereum.Value.fromAddress(validator))
  );
  event.parameters.push(
    new ethereum.EventParam(
      "serviceFeeRecipient",
      ethereum.Value.fromAddress(serviceFeeRecipient)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "commissionRateBps",
      ethereum.Value.fromUnsignedBigInt(commissionRateBps)
    )
  );

  return event;
}

// Helper to create RailSettled event
function createRailSettledEvent(
  railId: BigInt,
  totalSettledAmount: BigInt,
  totalNetPayeeAmount: BigInt,
  operatorCommission: BigInt,
  networkFee: BigInt,
  settledUpTo: BigInt
): RailSettledEvent {
  let mockEvent = newMockEvent();
  let event = changetype<RailSettledEvent>(mockEvent);

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam(
      "railId",
      ethereum.Value.fromUnsignedBigInt(railId)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "totalSettledAmount",
      ethereum.Value.fromUnsignedBigInt(totalSettledAmount)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "totalNetPayeeAmount",
      ethereum.Value.fromUnsignedBigInt(totalNetPayeeAmount)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "operatorCommission",
      ethereum.Value.fromUnsignedBigInt(operatorCommission)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "networkFee",
      ethereum.Value.fromUnsignedBigInt(networkFee)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "settledUpTo",
      ethereum.Value.fromUnsignedBigInt(settledUpTo)
    )
  );

  return event;
}

// Helper to create RailOneTimePaymentProcessed event
function createRailOneTimePaymentProcessedEvent(
  railId: BigInt,
  netPayeeAmount: BigInt,
  operatorCommission: BigInt,
  networkFee: BigInt
): RailOneTimePaymentProcessedEvent {
  let mockEvent = newMockEvent();
  let event = changetype<RailOneTimePaymentProcessedEvent>(mockEvent);

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam(
      "railId",
      ethereum.Value.fromUnsignedBigInt(railId)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "netPayeeAmount",
      ethereum.Value.fromUnsignedBigInt(netPayeeAmount)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "operatorCommission",
      ethereum.Value.fromUnsignedBigInt(operatorCommission)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "networkFee",
      ethereum.Value.fromUnsignedBigInt(networkFee)
    )
  );

  return event;
}

// Mock ERC20 contract calls
function mockERC20Calls(tokenAddress: Address): void {
  createMockedFunction(tokenAddress, "name", "name():(string)").returns([
    ethereum.Value.fromString("Test Token"),
  ]);
  createMockedFunction(tokenAddress, "symbol", "symbol():(string)").returns([
    ethereum.Value.fromString("TEST"),
  ]);
  createMockedFunction(tokenAddress, "decimals", "decimals():(uint8)").returns([
    ethereum.Value.fromI32(18),
  ]);
}

describe("FilecoinPayV1 Subgraph", () => {
  beforeEach(() => {
    clearStore();
    mockERC20Calls(TOKEN_ADDRESS);
  });

  afterAll(() => {
    clearStore();
  });

  describe("handleRailCreated", () => {
    test("creates Rail entity with correct fields", () => {
      let railId = BigInt.fromI32(1);
      let commissionRateBps = BigInt.fromI32(100);

      let event = createRailCreatedEvent(
        railId,
        PAYER_ADDRESS,
        PAYEE_ADDRESS,
        TOKEN_ADDRESS,
        OPERATOR_ADDRESS,
        VALIDATOR_ADDRESS,
        SERVICE_FEE_RECIPIENT,
        commissionRateBps
      );

      handleRailCreated(event);

      let railEntityId = Bytes.fromByteArray(Bytes.fromBigInt(railId));
      assert.entityCount("Rail", 1);
      assert.fieldEquals(
        "Rail",
        railEntityId.toHexString(),
        "railId",
        railId.toString()
      );
      assert.fieldEquals("Rail", railEntityId.toHexString(), "state", "ZERORATE");
      assert.fieldEquals(
        "Rail",
        railEntityId.toHexString(),
        "commissionRateBps",
        commissionRateBps.toString()
      );
    });

    test("creates Account entities for payer and payee", () => {
      let event = createRailCreatedEvent(
        BigInt.fromI32(1),
        PAYER_ADDRESS,
        PAYEE_ADDRESS,
        TOKEN_ADDRESS,
        OPERATOR_ADDRESS,
        VALIDATOR_ADDRESS,
        SERVICE_FEE_RECIPIENT,
        BigInt.fromI32(100)
      );

      handleRailCreated(event);

      assert.entityCount("Account", 2);
      assert.fieldEquals(
        "Account",
        PAYER_ADDRESS.toHexString(),
        "totalRails",
        "1"
      );
      assert.fieldEquals(
        "Account",
        PAYEE_ADDRESS.toHexString(),
        "totalRails",
        "1"
      );
    });

    test("creates Operator entity", () => {
      let event = createRailCreatedEvent(
        BigInt.fromI32(1),
        PAYER_ADDRESS,
        PAYEE_ADDRESS,
        TOKEN_ADDRESS,
        OPERATOR_ADDRESS,
        VALIDATOR_ADDRESS,
        SERVICE_FEE_RECIPIENT,
        BigInt.fromI32(100)
      );

      handleRailCreated(event);

      assert.entityCount("Operator", 1);
      assert.fieldEquals(
        "Operator",
        OPERATOR_ADDRESS.toHexString(),
        "totalRails",
        "1"
      );
    });

    test("creates Token entity with metadata", () => {
      let event = createRailCreatedEvent(
        BigInt.fromI32(1),
        PAYER_ADDRESS,
        PAYEE_ADDRESS,
        TOKEN_ADDRESS,
        OPERATOR_ADDRESS,
        VALIDATOR_ADDRESS,
        SERVICE_FEE_RECIPIENT,
        BigInt.fromI32(100)
      );

      handleRailCreated(event);

      assert.entityCount("Token", 1);
      assert.fieldEquals(
        "Token",
        TOKEN_ADDRESS.toHexString(),
        "name",
        "Test Token"
      );
      assert.fieldEquals(
        "Token",
        TOKEN_ADDRESS.toHexString(),
        "symbol",
        "TEST"
      );
      assert.fieldEquals(
        "Token",
        TOKEN_ADDRESS.toHexString(),
        "decimals",
        "18"
      );
      assert.fieldEquals(
        "Token",
        TOKEN_ADDRESS.toHexString(),
        "totalFees",
        "0"
      );
      // assert.fieldEquals(
      //   "Token",
      //   TOKEN_ADDRESS.toHexString(),
      //   "accumulatedFees",
      //   "0"
      // );
    });

    test("updates PaymentsMetric", () => {
      let event = createRailCreatedEvent(
        BigInt.fromI32(1),
        PAYER_ADDRESS,
        PAYEE_ADDRESS,
        TOKEN_ADDRESS,
        OPERATOR_ADDRESS,
        VALIDATOR_ADDRESS,
        SERVICE_FEE_RECIPIENT,
        BigInt.fromI32(100)
      );

      handleRailCreated(event);

      assert.entityCount("PaymentsMetric", 1);
      assert.fieldEquals(
        "PaymentsMetric",
        Bytes.fromUTF8("global").toHexString(),
        "totalRails",
        "1"
      );
      assert.fieldEquals(
        "PaymentsMetric",
        Bytes.fromUTF8("global").toHexString(),
        "totalZeroRateRails",
        "1"
      );
    });
  });

  describe("handleRailSettled", () => {
    test("creates Settlement entity with fee tracking", () => {
      // First create a rail
      let railId = BigInt.fromI32(1);
      let createEvent = createRailCreatedEvent(
        railId,
        PAYER_ADDRESS,
        PAYEE_ADDRESS,
        TOKEN_ADDRESS,
        OPERATOR_ADDRESS,
        VALIDATOR_ADDRESS,
        SERVICE_FEE_RECIPIENT,
        BigInt.fromI32(100)
      );
      handleRailCreated(createEvent);

      // Then settle it
      let totalSettledAmount = BigInt.fromI32(1000);
      let totalNetPayeeAmount = BigInt.fromI32(985);
      let operatorCommission = BigInt.fromI32(10);
      let networkFee = BigInt.fromI32(5);
      let settledUpTo = BigInt.fromI32(200);

      let settleEvent = createRailSettledEvent(
        railId,
        totalSettledAmount,
        totalNetPayeeAmount,
        operatorCommission,
        networkFee,
        settledUpTo
      );

      handleRailSettled(settleEvent);

      assert.entityCount("Settlement", 1);
    });
  });

  describe("handleRailOneTimePaymentProcessed", () => {
    test("creates OneTimePayment entity", () => {
      // First create a rail
      let railId = BigInt.fromI32(1);
      let createEvent = createRailCreatedEvent(
        railId,
        PAYER_ADDRESS,
        PAYEE_ADDRESS,
        TOKEN_ADDRESS,
        OPERATOR_ADDRESS,
        VALIDATOR_ADDRESS,
        SERVICE_FEE_RECIPIENT,
        BigInt.fromI32(100)
      );
      handleRailCreated(createEvent);

      // Process one-time payment
      let netPayeeAmount = BigInt.fromI32(985);
      let operatorCommission = BigInt.fromI32(10);
      let networkFee = BigInt.fromI32(5);

      let paymentEvent = createRailOneTimePaymentProcessedEvent(
        railId,
        netPayeeAmount,
        operatorCommission,
        networkFee
      );

      handleRailOneTimePaymentProcessed(paymentEvent);

      assert.entityCount("OneTimePayment", 1);
    });
  });
});
