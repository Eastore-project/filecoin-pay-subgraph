import { BigInt as GraphBN, Bytes } from "@graphprotocol/graph-ts";

// Filecoin block time is ~30 seconds
export const EPOCH_DURATION = GraphBN.fromU32(30);

// GraphQL BigInt constants
export const ZERO_BIG_INT = GraphBN.zero();
export const ONE_BIG_INT = GraphBN.fromI32(1);
export const DEFAULT_DECIMALS = GraphBN.fromU32(18);

// Metrics entity IDs
export const PAYMENTS_METRIC_ID = "global";

// Native token address (FIL)
export const NATIVE_TOKEN_ADDRESS = Bytes.fromHexString(
  "0x0000000000000000000000000000000000000000"
);
