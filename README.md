# Agora Backend — AI Oracle for Ethereum dApp

Clean, modular backend for an Ethereum dApp with an AI oracle that can determine winners either via a single AI or via a committee of agents (Mixture‑of‑Agents). The architecture follows Clean Architecture and the Dependency Inversion Principle (DIP).

## Security

- JWT authentication/authorization with access and refresh tokens
- Input validation for every endpoint (Joi)
- Encrypted private key management (AES)
- Global and per‑route rate limiting
- Secure HTTP headers (Helmet)
- CORS whitelist

## Features

- Contract monitoring and on‑chain winner declaration
- Committee‑based AI decision system (MoA with discussion + voting)
  - Multiple AI agents propose and iteratively refine positions via peer‑aware discussion
  - Unanimity‑first consensus; if not reached within a cap, fallback to simple majority
  - GPT‑5, Claude, Gemini proposers (toggleable)
  - Rich deliberation visualization (SSE stream, messages, metrics)
- On‑chain winner submission (with committee metadata/proof)
- RESTful APIs, structured logs, graceful shutdown

## Architecture

```
src/
├── domain/                # Entities, domain services and value objects
│   ├── entities/          # Contract, Party, OracleDecision, CommitteeDecision, AgentProposal
│   ├── repositories/      # Repository interfaces
│   ├── services/          # ICommitteeService, IAgentService, IAIService, etc.
│   └── valueObjects/      # ConsensusResult, DeliberationVisualization, DeliberationMessage
├── application/           # Use cases
│   └── useCases/          # DecideWinnerUseCase, MonitorContractsUseCase
├── infrastructure/        # External implementations
│   ├── committee/         # Committee orchestration
│   │   ├── CommitteeOrchestrator.ts
│   │   ├── proposers/     # GPT5Proposer, ClaudeProposer, GeminiProposer
│   │   ├── judges/        # RuleBasedJudge, LLMJudge, CommitteeJudgeService
│   │   └── synthesizer/   # ConsensusSynthesizer (for legacy/alt methods)
│   ├── ai/                # Single‑AI service
│   ├── blockchain/        # Ethereum integration
│   └── repositories/      # In‑memory and MongoDB repositories
└── interfaces/            # HTTP interfaces
    ├── controllers/
    └── routes/
```

## Setup

### Requirements

- Node.js ≥ 16
- npm or yarn
- Ethereum RPC endpoint
- AI API keys (OpenAI, Anthropic, Google) as needed

### Install

```
npm install
```

### Configure

Create a `.env` from the example and fill values:

```
cp .env.example .env
```

Optionally encrypt your Ethereum private key:

```
npm run encrypt-key
```

Set the resulting encrypted value to `ORACLE_PRIVATE_KEY_ENCRYPTED` in `.env`.

### Run

Development:

```
npm run dev
```

Production:

```
npm run build
npm start
```

## Environment Variables

Core toggles:

- `USE_COMMITTEE=true` — enable committee mode by default
- `COMMITTEE_CONSENSUS_METHOD=weighted_voting|majority|borda` — synthesis method (visualization metadata)
- `PROPOSER_GPT5_ENABLED=true|false`, `PROPOSER_CLAUDE_ENABLED=true|false`, `PROPOSER_GEMINI_ENABLED=true|false`
- `UNANIMOUS_MAX_ROUNDS=10` — max voting rounds to try for unanimity before majority fallback
- `DISCUSSION_ROUNDS=2` — per round, how many peer‑aware stance updates each agent performs

AI keys:

- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`

Blockchain:

- `ETHEREUM_RPC_URL`, `MAIN_CONTRACT_ADDRESS` (or `ORACLE_CONTRACT_ADDRESS`)
- `BLOCKCHAIN_MOCK_MODE=true|false` — mock submissions/listeners
- `USE_REAL_BLOCKCHAIN=true|false` — allow real chain in managed environments

MongoDB (optional):

- `USE_MONGODB=true` and a valid `MONGODB_URI`

## API

Base: the app mounts routes under `/api/auth`, `/api/oracle`, and `/api/deliberations`.

### Health

```
GET /health
```

### Auth

```
POST /api/auth/login
POST /api/auth/refresh
```

### Oracle

- Decide winner (auth: ADMIN or ORACLE_NODE):

```
POST /api/oracle/contracts/:contractId/decide-winner
Authorization: Bearer <token>
Content-Type: application/json

{
  "forceCommitteeMode": true,
  "committeeConfig": {
    "minProposals": 3,
    "maxProposalsPerAgent": 2,
    "consensusThreshold": 0.8,
    "enableEarlyExit": true
  }
}
```

- Start async deliberation (auth):

```
POST /api/oracle/contracts/:contractId/start-deliberation
```

Returns `{ deliberationId }` immediately; consume SSE at `/api/deliberations/:deliberationId/stream`.

- Public winner arguments by contract:

```
GET /api/oracle/contracts/:contractId/winner-arguments?lang=en|ko
```

Builds three jury arguments and a conclusion supporting the chosen winner (uses Claude if available; otherwise a local fallback).

- Public: idempotent “ended” notifier (closes betting on‑chain when appropriate):

```
POST /api/oracle/contracts/:contractId/ended
Content-Type: application/json

{
  "contractId": 31,
  "endedAt": "2025-09-02T23:16:00.000Z",
  "bettingEndTime": 1756822571,
  "chainId": 11155111
}
```

### Deliberations

- Get full visualization (auth):

```
GET /api/deliberations/:id
```

- Real‑time SSE stream (no auth; the `:id` acts as a token):

```
GET /api/deliberations/:id/stream
```

- Paginated messages (auth):

```
GET /api/deliberations/:id/messages?phase=proposing|discussion|consensus|completed&agentId=...
```

- Winner arguments by deliberation (auth):

```
GET /api/deliberations/:id/winner-arguments
```

- Export report (auth):

```
GET /api/deliberations/:id/export?format=json|csv
```

## Committee Flow (Discussion → Voting → Consensus)

- Proposing: agents generate initial proposals for Party A or B with rationales and evidence
- Discussion rounds: each round, every agent updates a single “anchor” proposal using peer summaries (`DISCUSSION_ROUNDS`)
- Voting per round: the latest winner from each agent is cast; if all choices are the same, unanimity is achieved and deliberation stops
- Consensus: if unanimity isn’t reached after `UNANIMOUS_MAX_ROUNDS`, select the majority winner; evidence is merged from supporting proposals
- Visualization: messages, votes, synthesis and metrics are streamed over SSE and available via the visualization endpoints

## Testing

```
npm test
```

## Scripts

- `npm run build` — TypeScript build
- `npm run dev` — dev server
- `npm start` — production start
- `npm test` — run tests
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript type check
- `npm run encrypt-key` — private key encryption tool

## Production Notes

- Keep secrets in env vars or a secret manager
- Store private keys encrypted; never commit plaintext keys
- Use a strong `JWT_SECRET` (≥ 32 chars)
- Enable MongoDB for persistence in production
- Review rate limits and logging retention

## License

ISC

