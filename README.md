# Filecoin Pay Subgraph

A subgraph that indexes the `FilecoinPayV1` contract and provides all the data exposed by the events.

## Table of Contents

- [Features](#features)
- [Entity Overview](#entity-overview)
- [Key Design Decisions](#key-design-decisions)
- [Development](#development)
- [Deployment](#deployment)
- [Network Configuration](#network-configuration)
- [GraphQL Query Examples](#graphql-query-examples)
- [Contributing](#contributing)
- [License](#license)

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
- For ERC20 rails: fee accumulates in `Token.accumulatedFees` for Dutch auction purchase via `burnForFees`
- `PaymentsMetric.totalFilBurned` tracks all FIL burned (native settlements + auction purchases)

### Fee Auction Tracking (burnForFees)
The subgraph tracks Dutch auction purchases via a call handler for the `burnForFees` function:
- `FeeAuctionPurchase` entity records each auction purchase
- `Token.accumulatedFees` tracks fees pending auction (ERC20 tokens)
- `Token.totalFilBurnedForFees` tracks FIL burned to purchase token fees
- `PaymentsMetric.totalFeeAuctionPurchases` counter

**Goldsky Call Handler Support**: Call handlers are only supported on Filecoin mainnet in Goldsky. For testnet deployments, use the `testnet` branch which excludes call handlers.

> **Note: Fee-on-transfer tokens are not supported.** The contract handles fee-on-transfer tokens by deducting the actual balance change ([`FilecoinPayV1.sol:1785-1786`](../filecoin-pay/src/FilecoinPayV1.sol#L1785-L1786)), but the subgraph uses the `requested` parameter since call handlers don't have access to the actual transfer amount. For standard tokens like USDC/axlUSDC, `actual == requested`, so tracking is accurate. See [`src/filecoin-pay.ts:808`](src/filecoin-pay.ts#L808) for implementation details.


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

Call handlers are only supported on Filecoin mainnet in Goldsky. Use the appropriate branch:
- **Mainnet**: `main` branch (includes `burnForFees` call handler)
- **Testnet**: `testnet` branch (no call handlers)

```bash
# Install Goldsky CLI
curl https://goldsky.com | sh

# Login
goldsky login

# Deploy to Calibration (use testnet branch)
git checkout testnet
NETWORK=calibration pnpm build
goldsky subgraph deploy filecoin-pay-calibration/1.0.0 --path .

# Deploy to Mainnet (use main branch)
git checkout main
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
    accumulatedFees
    totalFilBurnedForFees
  }
}
```

### Get Fee Auction Purchases
```graphql
query {
  feeAuctionPurchases(orderBy: blockTimestamp, orderDirection: desc, first: 10) {
    token { symbol }
    recipient
    amountPurchased
    filBurned
    blockTimestamp
  }
}
```

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies** with `pnpm install`
3. **Make your changes** and ensure code follows existing patterns
4. **Run tests** with `pnpm test` and ensure they pass
5. **Build** with `pnpm build` to verify compilation
6. **Submit a pull request** with a clear description of changes

### Development Workflow

```bash
# Install dependencies
pnpm install

# Generate types after schema changes
pnpm codegen

# Run tests
pnpm test

# Build for verification
pnpm build
```

### Branch Strategy

- `main` - Production branch with call handlers (for mainnet)
- `testnet` - Testnet branch without call handlers (Goldsky limitation)

When making changes that affect both branches, ensure compatibility or update both accordingly.

## License

MIT
