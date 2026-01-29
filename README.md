# Filecoin Pay Subgraph

A subgraph that indexes the `FilecoinPayV1` contract, providing data for the `filecoin-pay-explorer` and `autocap-dashboard`.

## Features

- **Complete event indexing** - All 11 contract events
- **OneTimePayment entity** - Separate tracking for one-time payments (distinct from rate-based settlements)
- **Fee tracking** - Settlement tracks `fee` (0.5% in rail's token)
- **Multi-network support** - Templated configs for Mainnet and Calibration testnet

## Entity Overview

### Primary Entities
| Entity | ID Scheme | Purpose |
|--------|-----------|---------|
| `Token` | `address` | Token metadata + aggregate metrics + fee tracking |
| `Account` | `address` | Payer/payee accounts |
| `Operator` | `address` | Service operators |
| `Rail` | `railId` | Payment channels |
| `UserToken` | `account+token` | Per-account token balances/lockup |
| `OperatorToken` | `operator+token` | Per-operator token stats |
| `OperatorApproval` | `client+operator+token` | Approval settings |

### Event Entities (Immutable)
| Entity | ID Scheme | Purpose |
|--------|-----------|---------|
| `Settlement` | `txHash+logIndex` | Rate-based settlement records with fee tracking |
| `OneTimePayment` | `txHash+logIndex` | One-time payment records |
| `LockupModification` | `txHash+logIndex` | Lockup change history |
| `RateChangeQueue` | `railId+startEpoch` | Historical rate changes |

### Global Metrics
| Entity | ID Scheme | Purpose |
|--------|-----------|---------|
| `PaymentsMetric` | `"global"` | Global singleton for expensive-to-compute counters |

**Note:** Time-based metrics (daily/weekly aggregations) are not pre-computed. They can be derived via GraphQL queries with timestamp filters on the indexed data.

## Key Design Decisions

### Fee Tracking
- `Settlement.fee` / `OneTimePayment.fee` = 0.5% taken from payment in rail's token
- For native FIL rails: fee is burned directly (`Token.totalFees` = FIL burned, `PaymentsMetric.totalFilBurned` increases)
- For ERC20 rails: fee goes to the contract for Dutch auction purchase
- `PaymentsMetric.totalFilBurned` currently only tracks native FIL burns from settlements/one-time payments

### Future: Fee Auction Tracking (TODO)
Once a `FeesPurchased` event is added to the contract, the following will be implemented:
- `FeeAuctionPurchase` entity to track Dutch auction purchases
- `Token.accumulatedFees` to track fees pending auction (ERC20 tokens)
- `Token.totalFilBurnedForFees` to track FIL burned to purchase token fees
- `PaymentsMetric.totalFeeAuctionPurchases` counter


### OneTimePayment Entity
One-time payments are tracked separately from rate-based settlements:
- `OneTimePayment` entity captures individual one-time payments
- `Rail.totalOneTimePayments` counts them
- Both one-time payments and settlements contribute to `Rail.totalSettledAmount`

### Minimal Pre-aggregation
The subgraph focuses on indexing contract events accurately. Only `PaymentsMetric` is pre-computed for expensive global counters. Time-based analytics can be computed at query time:

```graphql
# Example: Get daily settlements
query DailySettlements($dayStart: BigInt!, $dayEnd: BigInt!) {
  settlements(where: { blockTimestamp_gte: $dayStart, blockTimestamp_lt: $dayEnd }) {
    totalSettledAmount
    fee
  }
}
```

## Development

### Prerequisites
- Node.js 18+
- pnpm
- [Goldsky CLI](https://docs.goldsky.com/get-started/cli) (for deployment)

### Setup
```bash
pnpm install
pnpm codegen
pnpm build
```

### Build for Specific Network
```bash
NETWORK=calibration pnpm build  # Calibration testnet
NETWORK=mainnet pnpm build      # Mainnet
```

### Testing
```bash
pnpm test
pnpm test:coverage
```

## Deployment

### Goldsky

```bash
# Install Goldsky CLI
curl https://goldsky.com | sh

# Login
goldsky login

# Deploy to Calibration
NETWORK=calibration pnpm build
goldsky subgraph deploy filecoin-pay-calibration/1.0.0 --path .

# Deploy to Mainnet
NETWORK=mainnet pnpm build
goldsky subgraph deploy filecoin-pay-mainnet/1.0.0 --path .
```

## Network Configuration

Edit `config/networks.json`:

```json
{
  "calibration": {
    "network": "filecoin-testnet",
    "address": "0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0",
    "startBlock": 3120649
  },
  "mainnet": {
    "network": "filecoin",
    "address": "0x23b1e018F08BB982348b15a86ee926eEBf7F4DAa",
    "startBlock": 5421337
  }
}
```

## GraphQL Query Examples

### Get Global Metrics
```graphql
query {
  paymentsMetric(id: "global") {
    totalRails
    totalFilBurned
    totalRailSettlements
    totalOneTimePayments
    totalActiveRails
    uniquePayers
    uniquePayees
  }
}
```

### Get Active Rails
```graphql
query {
  rails(where: { state: ACTIVE }, orderBy: createdAt, orderDirection: desc) {
    railId
    paymentRate
    payer { address }
    payee { address }
    token { symbol }
    totalSettledAmount
    totalFees
  }
}
```

### Get Settlements in Time Range
```graphql
query GetSettlementsInRange($start: BigInt!, $end: BigInt!) {
  settlements(
    where: { blockTimestamp_gte: $start, blockTimestamp_lt: $end }
    orderBy: blockTimestamp
    orderDirection: desc
  ) {
    rail { railId }
    totalSettledAmount
    fee
    blockTimestamp
  }
}
```

### Get Token Fee Tracking
```graphql
query {
  tokens {
    symbol
    totalFees
  }
}
```

## License

Apache-2.0 OR MIT
