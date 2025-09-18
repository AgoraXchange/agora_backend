# Oracle API Documentation

## Mark Contract Ended

Endpoint: `POST /api/oracle/contracts/{contractId}/ended`

This endpoint is used to mark a contract as ended and close betting on the blockchain.

### Request Format

**URL Parameters:**
- `contractId` (string): The contract ID as a numeric string

**Request Body (JSON):**
```json
{
  "contractId": 41,
  "endedAt": "2025-01-18T22:43:00Z",
  "bettingEndTime": 1737238980,
  "chainId": 84532
}
```

**Required Fields:**
- `contractId` (number): Must match the contractId in the URL path
- `endedAt` (string): ISO date string when the contract ended
- `bettingEndTime` (number): Unix timestamp in seconds when betting should end
- `chainId` (number): Blockchain chain ID (e.g., 84532 for Base Sepolia)

### Example curl Request

```bash
curl -X POST http://localhost:3001/api/oracle/contracts/41/ended \
  -H "Content-Type: application/json" \
  -d '{
    "contractId": 41,
    "endedAt": "2025-01-18T22:43:00Z",
    "bettingEndTime": 1737238980,
    "chainId": 84532
  }'
```

### Response Format

**Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "contractId": "41",
    "action": "closed",
    "idempotent": false,
    "transactionHash": "0x..."
  }
}
```

**Validation Error (400 Bad Request):**
```json
{
  "success": false,
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "body.contractId",
      "message": "\"body.contractId\" is required"
    }
  ]
}
```

### Error Handling

The endpoint handles blockchain errors gracefully:
- If the smart contract transaction fails, the endpoint continues processing
- Local contract state is updated even if blockchain operations fail
- Detailed error logging provides insight into transaction failures

Common blockchain error reasons:
- Contract already closed (status != 0)
- Oracle address not authorized
- Contract does not exist
- Insufficient gas or network issues

### Notes

- The endpoint is idempotent for the same `contractId` and `bettingEndTime`
- Blockchain failures do not prevent the endpoint from completing successfully
- The oracle continues processing even when smart contract interactions fail