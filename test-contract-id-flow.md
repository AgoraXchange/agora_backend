# ContractId Flow Test Documentation

## Overview
This document demonstrates how the improved contractId handling works in the oracle backend.

## Flow Example

### 1. Contract Creation
When a contract is created on the blockchain with contractId = 0:

```javascript
// Event emitted by smart contract
ContractCreated(
  contractId: 0,  // uint256
  creator: "0x...",
  partyA: "Real Madrid",
  partyB: "Barcelona",
  bettingEndTime: 1234567890
)
```

### 2. Backend Processing
The backend processes this event in `MonitorContractsUseCase`:

```typescript
// Party entities created with contractId:choice format
const partyA = new Party(
  "0:1",  // ID format: contractId:1 for Choice.A
  "",
  "Real Madrid",
  "Real Madrid"
);

const partyB = new Party(
  "0:2",  // ID format: contractId:2 for Choice.B
  "",
  "Barcelona", 
  "Barcelona"
);

// Contract stored with contractId = "0"
const contract = new Contract(
  "0",  // contractId as string
  ...
);
```

### 3. Winner Decision
When AI determines winner, it returns a party ID:

```typescript
// AI returns: "0:1" (Real Madrid wins) or "0:2" (Barcelona wins)
const aiResult = {
  winnerId: "0:1",  // Party A wins
  ...
};
```

### 4. Choice Conversion
The `ChoiceConverter` efficiently parses this:

```typescript
ChoiceConverter.fromPartyId("0:1", "0:1", "0:2")
// Parses "0:1" -> extracts choice value 1 -> returns Choice.A

ChoiceConverter.fromPartyId("0:2", "0:1", "0:2")  
// Parses "0:2" -> extracts choice value 2 -> returns Choice.B
```

### 5. Blockchain Submission
Finally, the winner is submitted to the smart contract:

```typescript
// Calls smart contract
contract.declareWinner(
  "0",        // contractId (uint256)
  Choice.A    // winner (uint8 = 1)
);
```

Which translates to the exact format the smart contract expects:
```solidity
declareWinner(uint256 _contractId, uint8 _winner)
// declareWinner(0, 1)  for Real Madrid
// declareWinner(0, 2)  for Barcelona
```

## Benefits

1. **Clean Numeric IDs**: ContractId stays as numeric string ("0", "1", "2")
2. **Direct Mapping**: Party ID format ("0:1") directly encodes the choice value
3. **No Complex Parsing**: Simple split operation to extract choice
4. **Blockchain Compatible**: Perfectly matches smart contract expectations
5. **Backward Compatible**: Falls back to old comparison if needed

## Testing

To test this flow:

1. Deploy contract (generates contractId = 0)
2. Wait for betting to close
3. Oracle processes and determines winner
4. Check transaction:
   - For Real Madrid win: `declareWinner(0, 1)`
   - For Barcelona win: `declareWinner(0, 2)`