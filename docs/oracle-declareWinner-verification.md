# Oracle declareWinner Format Verification

## Expected Smart Contract Format

```solidity
function declareWinner(uint256 _contractId, uint8 _winner) external onlyOracle {
    // _winner values:
    // 0 = None
    // 1 = A
    // 2 = B
}
```

## Current Oracle Implementation

### 1. ABI Definition (EthereumService.ts)
```typescript
this.contractABI = [
  "function declareWinner(uint256 _contractId, uint8 _winner) external",
  // ... other functions
]
```

### 2. Function Call (EthereumService.ts:221)
```typescript
async declareWinner(contractId: string, winner: Choice): Promise<string> {
  const contract = new ethers.Contract(contractAddress, this.contractABI, this.wallet);
  const tx = await contract.declareWinner(contractId, winner);
  // ...
}
```

### 3. Choice Enum Definition (Choice.ts)
```typescript
export enum Choice {
  NONE = 0,
  A = 1,
  B = 2
}
```

## Verification Result: ✅ PERFECT MATCH

The oracle's implementation **exactly matches** the expected smart contract format:

| Aspect | Expected | Actual | Match |
|--------|----------|---------|--------|
| Function Name | `declareWinner` | `declareWinner` | ✅ |
| Parameter 1 Type | `uint256` | `string` → auto-converted to `uint256` by ethers.js | ✅ |
| Parameter 1 Name | `_contractId` | `contractId` | ✅ |
| Parameter 2 Type | `uint8` | `Choice` enum (TypeScript number) | ✅ |
| Parameter 2 Name | `_winner` | `winner` | ✅ |
| Value 0 | None | `Choice.NONE = 0` | ✅ |
| Value 1 | A | `Choice.A = 1` | ✅ |
| Value 2 | B | `Choice.B = 2` | ✅ |

## Technical Details

1. **Type Conversion**: ethers.js automatically handles the conversion:
   - `contractId` (string) → `uint256` via BigNumber conversion
   - `winner` (Choice enum) → `uint8` (TypeScript enums compile to numbers)

2. **Usage Flow**:
   ```
   DecideWinnerUseCase.execute()
   ↓
   blockchainService.declareWinner(contract.id, winnerChoice)
   ↓
   contract.declareWinner(contractId, winner) // ethers.js call
   ↓
   Smart Contract receives: (uint256, uint8)
   ```

3. **Example Transaction Data**:
   - Contract ID "41" → `0x0000000000000000000000000000000000000000000000000000000000000029`
   - Winner Choice.A → `0x01`
   - Full calldata: `declareWinner(41, 1)`

## Conclusion

The oracle's smart contract call format is **completely compatible** with the expected schema. No changes are needed as the implementation correctly:

1. Uses the exact function signature expected by the smart contract
2. Maps Choice enum values correctly (0=NONE, 1=A, 2=B)
3. Relies on ethers.js for proper type conversion
4. Maintains consistency throughout the codebase

The current implementation is production-ready and will interact correctly with the deployed smart contract.