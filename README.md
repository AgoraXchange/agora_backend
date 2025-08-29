# Agora Backend - AI Oracle for Ethereum dApp

이더리움 메인넷 dApp을 위한 AI 오라클 백엔드 서비스입니다. Clean Architecture와 DIP(의존성 역전 원칙)를 적용한 모듈화된 구조로 설계되었습니다.

## 🔒 보안 기능

- **JWT 기반 인증/인가**: Access Token과 Refresh Token을 사용한 안전한 인증
- **입력 검증**: Joi를 사용한 모든 API 엔드포인트의 입력 데이터 검증
- **Private Key 암호화**: AES 암호화를 통한 안전한 키 관리
- **Rate Limiting**: DDoS 공격 방지를 위한 요청 제한
- **보안 헤더**: Helmet을 통한 HTTP 보안 헤더 설정
- **CORS 설정**: 허용된 도메인만 접근 가능

## 주요 기능

- 스마트 컨트랙트의 베팅 종료 시점 모니터링
- **위원회 기반 AI 결정 시스템(간소화)**: MoA(Mixture-of-Agents) + Discussion 기반
  - 다중 AI 에이전트(제안자)의 토의와 투표로 승자 결정
  - GPT-5, Claude, Gemini 등 다양한 AI 모델 활용(제안/토의 발언)
  - 규칙 기반/LLM 판정·페어와이즈 비교 제거 → 간단하고 결정적인 합의 절차
  - 합의 절차: 만장일치 목표(반복 토의→투표), 한계 라운드 초과 시 마지막 투표를 단순 다수결로 확정
- 블록체인에 승자 정보 제출 (위원회 결정 메타 포함)
- RESTful API 제공
- 실시간 로깅 및 모니터링
- Graceful Shutdown 지원

## 아키텍처

### Clean Architecture 레이어

```
src/
├── domain/           # 엔티티, 비즈니스 규칙, 인터페이스 정의
│   ├── entities/     # Contract, Party, OracleDecision, CommitteeDecision, AgentProposal
│   ├── repositories/ # 레포지토리 인터페이스
│   ├── services/     # ICommitteeService, IAgentService, IAIService 등
│   └── valueObjects/ # ConsensusResult, ProposalMetadata
├── application/      # 유스케이스, 비즈니스 로직
│   └── useCases/     # DecideWinnerUseCase (단일 AI + 위원회 모드), MonitorContractsUseCase
├── infrastructure/   # 외부 시스템 구현체
│   ├── committee/   # 위원회 시스템
│   │   ├── CommitteeOrchestrator.ts      # 전체 오케스트레이션
│   │   ├── proposers/                    # AI 에이전트들
│   │   │   ├── GPT5Proposer.ts
│   │   │   ├── ClaudeProposer.ts
│   │   │   └── GeminiProposer.ts
│   │   ├── judges/                       # (레거시) 심사 시스템 파일들
│   │   │   ├── RuleBasedJudge.ts         # 규칙 기반 심사 (현 단계 미사용)
│   │   │   ├── LLMJudge.ts              # LLM 기반 심사 (현 단계 미사용)
│   │   │   └── CommitteeJudgeService.ts  # 토의 발언 수집에 일부 재사용 가능
│   │   └── synthesizer/                  # 합의 생성
│   │       └── ConsensusSynthesizer.ts
│   ├── ai/          # 기존 단일 AI 서비스
│   ├── blockchain/  # 이더리움 통신
│   └── repositories/# 레포지토리 구현
└── interfaces/       # 외부 인터페이스
    ├── controllers/  # HTTP 컨트롤러
    └── routes/      # Express 라우트
```

## 설치 및 실행

### 필수 요구사항

- Node.js v16 이상
- npm 또는 yarn
- Ethereum RPC 엔드포인트
- OpenAI API 키 (또는 다른 AI 서비스)

### 설치

```bash
npm install
```

### 환경 설정

`.env.example`을 복사하여 `.env` 파일을 생성하고 필요한 값을 설정:

```bash
cp .env.example .env
```

### Private Key 암호화

보안을 위해 이더리움 Private Key는 암호화하여 저장해야 합니다:

```bash
npm run encrypt-key
```

위 명령을 실행하면 Private Key와 암호화 키를 입력받아 암호화된 키를 생성합니다.
생성된 암호화 키를 `.env` 파일의 `ORACLE_PRIVATE_KEY_ENCRYPTED`에 설정하세요.

### 개발 모드 실행

```bash
npm run dev
```

### 프로덕션 빌드 및 실행

```bash
npm run build
npm start
```

## API 엔드포인트

### 인증 엔드포인트

#### 로그인
```
POST /api/auth/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}
```

#### 토큰 갱신
```
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "string"
}
```

### 오라클 엔드포인트

#### 헬스 체크
```
GET /health
```

#### 승자 결정 요청 (인증 필요)
```
POST /api/oracle/contracts/:contractId/decide-winner
Authorization: Bearer <access_token>
```
- 권한: ADMIN 또는 ORACLE_NODE
- Rate Limit: 분당 10회

#### 결정 결과 조회 (인증 필요)
```
GET /api/oracle/contracts/:contractId/decision
Authorization: Bearer <access_token>
```

#### 승자 지지 논증 JSON 조회 (인증 불필요)
```
GET /api/oracle/contracts/:contractId/winner-arguments?lang=ko|en
```
- 설명: 특정 계약의 위원회 심의가 완료된 후, 승자를 지지하는 3개의 논리적 주장과 그로부터 도출되는 결론을 JSON으로 반환합니다.
- 주의: 위원회 모드(committee) 결정에만 제공되며, 심의 메시지가 메모리에 존재해야 합니다.
- 응답 예시:
```json
{
  "success": true,
  "data": {
    "Jury1": "...",
    "Jury2": "...",
    "Jury3": "...",
    "Conclusion": "..."
  }
}
```

### 심의(Deliberations) 엔드포인트

#### 승자 지지 논증 요약 생성 (인증 필요)
```
GET /api/deliberations/:id/winner-arguments?lang=ko|en
Authorization: Bearer <access_token>
```
- 설명: 승자 결정 시점의 토의/제안 중, 승자를 지지했던 내용들을 모아 Anthropic(Claude)로부터
  논리적으로 재구성된 3개의 주장과 그로부터 귀결되는 결론을 JSON으로 반환합니다.
- 응답 예시:
```json
{
  "success": true,
  "data": {
    "Jury1": "...",
    "Jury2": "...",
    "Jury3": "...",
    "Conclusion": "..."
  }
}
```
- 비고: `ANTHROPIC_API_KEY`가 설정되지 않은 경우 간단한 로컬 폴백 논리로 동일한 스키마를 반환합니다.

## 테스트

```bash
npm test
```

## 스크립트

- `npm run build`: TypeScript 컴파일
- `npm run dev`: 개발 서버 실행
- `npm start`: 프로덕션 서버 실행
- `npm test`: 테스트 실행
- `npm run lint`: ESLint 실행
- `npm run typecheck`: TypeScript 타입 체크
- `npm run encrypt-key`: Private Key 암호화 도구

## 확장 가능성

이 프로젝트는 다음과 같은 확장이 가능하도록 설계되었습니다:

1. **다른 AI 서비스 통합**: `IAIService` 인터페이스 구현
2. **다른 블록체인 지원**: `IBlockchainService` 인터페이스 구현
3. **영구 저장소 추가**: `IContractRepository`, `IOracleDecisionRepository` 구현
4. **추가 비즈니스 로직**: 새로운 Use Case 추가

## 🛡️ 개선된 보안 및 안정성

### 보안 개선사항
- JWT 기반 인증/인가 시스템
- 모든 입력에 대한 Joi 검증
- Private Key AES 암호화
- Rate Limiting (API, 인증, 오라클별 설정)
- Helmet을 통한 보안 헤더
- CORS 화이트리스트

### 안정성 개선사항
- Winston 로깅 시스템
- 글로벌 에러 핸들링
- Graceful Shutdown
- 이벤트 리스너 메모리 누수 방지
- Mutex를 통한 Race Condition 방지
- MongoDB 지원 (선택적)

### 성능 개선사항
- OpenAI 실제 구현
- MongoDB 영구 저장소 옵션
- 비동기 에러 핸들링
- 요청별 상세 로깅

## 환경 변수(위원회/합의 관련)

- `DISCUSSION_ROUNDS`: 1회 토의 내 발언 라운드 수(기본 2)
- `UNANIMOUS_MAX_ROUNDS`: 만장일치 합의를 위한 최대 반복 라운드 수(기본 10)
  - 최대 라운드 초과 시 마지막 투표 결과를 단순 다수결로 승자 결정

## 변경사항 안내(마이그레이션)

- 위원회 단계명이 ‘판정(Judging)’ → ‘토의(Discussion)’로 변경되었습니다.
  - 클라이언트에서 phase 필터를 사용하던 경우 `judging` → `discussion`으로 갱신이 필요합니다.
- 규칙 기반/LLM 판정 및 페어와이즈 비교가 제거되었고, 합의는 토의→투표 반복(만장일치 우선, 다수결 폴백)으로 단순화되었습니다.

## ⚠️ 프로덕션 배포 시 주의사항

1. **환경 변수**: 모든 시크릿 키는 안전하게 관리하세요
2. **Private Key**: 반드시 암호화하여 저장하세요
3. **JWT Secret**: 최소 32자 이상의 강력한 키 사용
4. **MongoDB**: 프로덕션에서는 `USE_MONGODB=true` 설정 권장
5. **Rate Limiting**: 서비스 특성에 맞게 조정
6. **로그 관리**: 로그 파일 크기 및 로테이션 설정 확인

## 🤖 위원회 기반 AI 결정 시스템 (Discussion 기반)

### 절차 개요

본 시스템은 **MoA(Mixture-of-Agents)** 구성의 다중 에이전트가 협의(토의)와 투표를 통해 승자를 확정하는 간소화된 위원회 오라클입니다. 규칙 기반/LLM 판정과 페어와이즈 비교를 제거하고, 다음의 간단한 절차를 따릅니다.

1) 제안(Proposing)
- 여러 에이전트가 각자 승자 제안(승자/근거/증거)을 생성

2) 토의 & 투표(Discussion & Voting)
- 제안자들이 상호 주장 요약(peers)을 바탕으로 설득/반박 발언을 생성하며 입장을 갱신
- 직후 투표를 수행하고, 모든 에이전트가 같은 승자를 선택하면 합의 종료(만장일치)
- 만장일치가 아니면 토의를 반복(DISCUSSION_ROUNDS 내 발언 라운드, 전체 반복은 UNANIMOUS_MAX_ROUNDS 제한)

3) 합의(Consensus)
- 만장일치 도달 시 해당 승자를 확정
- `UNANIMOUS_MAX_ROUNDS`를 초과해도 만장일치 미도달 시 마지막 투표 결과를 단순 다수결로 집계해 승자 확정

### 스트리밍/시각화
- 토의 발언은 평가(evaluation) 메시지, 투표는 vote 메시지, 최종 결정은 synthesis 메시지로 SSE(`/api/deliberations/:id/stream`)에 실시간 전송됩니다.
- API로 집계된 시각화 데이터(투표 분포/타임라인/코스트 등)를 조회할 수 있습니다.
- **GPT-4 Proposer**: 체계적 분석과 논리적 추론에 강점
- **Claude Proposer**: 윤리적 고려사항과 균형잡힌 판단에 중점  
- **Gemini Proposer**: 다각도 분석과 패턴 인식에 특화
- **다양성 주입**: 각기 다른 temperature, 프롬프트 관점, 샘플링 방식 적용

#### 2. **Judge Layer (심사 층)**
- **Rule-Based Judge**: 구조적 품질 평가
  - 완전성(제안의 충실도)
  - 일관성(논리적 모순 검출)
  - 증거 품질(근거의 신뢰성)
  - 명확성(표현의 정확성)
- **LLM Judge**: 지능적 품질 평가  
  - 쌍대 비교를 통한 상대적 우수성 판단
  - 바이어스 완화 기법 적용 (순서 무작위화, 길이 정규화)
  - 다중 라운드 심사로 일관성 확보

#### 3. **Synthesizer Layer (합의 층)**
- **합의 방법론**:
  - `majority`: 단순 다수결
  - `borda`: 순위 기반 점수 집계
  - `weighted_voting`: 에이전트별 성능 가중치 적용  
  - `approval`: 임계값 기반 승인 투표
- **증거 통합**: 승리 제안들의 증거를 관련성/신뢰성 기준으로 병합
- **불확실성 추적**: 잔여 불확실성과 품질 플래그 생성

### 사용 방법

#### 환경 설정

```bash
# 위원회 시스템 활성화
USE_COMMITTEE=true

# 에이전트 설정
COMMITTEE_CONSENSUS_METHOD=weighted_voting
COMMITTEE_MIN_AGENTS=3
COMMITTEE_MAX_PROPOSALS_PER_AGENT=2

# AI 서비스 설정 (실제 API 키 필요)
OPENAI_API_KEY=your_actual_openai_key
ANTHROPIC_API_KEY=your_claude_key
ANTHROPIC_MODEL=claude-sonnet-4-20250514
GOOGLE_API_KEY=your_gemini_key

# 테스트용 (Mock 응답 사용)
OPENAI_FALLBACK_TO_MOCK=true
ANTHROPIC_API_KEY=mock
GOOGLE_API_KEY=mock
```

#### API 사용 예시

```bash
# 위원회 모드로 결정 요청
POST /api/oracle/contracts/contract_123/decide-winner
Authorization: Bearer <access_token>
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

#### 응답 예시

```json
{
  "success": true,
  "winnerId": "partyA",
  "decisionId": "decision_1692819234567_abc123",
  "deliberationMode": "committee",
  "transactionHash": "0x...",
  "committeeMetrics": {
    "totalProposals": 6,
    "deliberationTimeMs": 8450,
    "consensusLevel": 0.83,
    "costBreakdown": {
      "proposerTokens": 3420,
      "judgeTokens": 1890,
      "synthesizerTokens": 760,
      "totalCostUSD": 0.12
    }
  },
  "committeeDecisionId": "committee_contract_123_1692819234567"
}
```

### 주요 특징

#### ✅ **바이어스 완화**
- 순서 무작위화로 위치 편향 제거
- 길이 정규화로 장황함 편향 완화  
- 에이전트 이름 마스킹으로 브랜드 편향 방지
- 다중 라운드 심사로 일관성 검증

#### 📊 **투명한 의사결정**
- 각 에이전트의 제안과 근거 추적
- 심사 과정의 상세 로깅
- 합의 과정의 메트릭 제공
- 대안 선택지와 확률 명시

#### 🔧 **유연한 설정**
- 합의 방법론 선택 가능
- 에이전트별 활성화/비활성화
- 성능 기반 가중치 자동 조정
- Early exit으로 효율성 최적화

#### 🛡️ **품질 보장**  
- 규칙 기반 + LLM 기반 이중 검증
- 신뢰도 추적 및 불확실성 계산
- 인간 검토 권장 플래그
- 소수 의견 및 충돌 증거 감지

### 성능 및 비용

- **평균 응답 시간**: 5-15초 (에이전트 수와 제안 수에 따라)
- **토큰 사용량**: 단일 AI 대비 3-5배 (더 높은 품질 대가)
- **비용 효율성**: 중요한 결정에서 오류 비용 고려시 ROI 양수
- **확장성**: 에이전트 추가/제거로 유연한 확장

### 단일 AI vs 위원회 모드 비교

| 구분 | 단일 AI 모드 | 위원회 모드 |
|------|-------------|-------------|
| 응답 시간 | 1-3초 | 5-15초 |
| 토큰 비용 | 기준 | 3-5배 |
| 결정 품질 | 보통 | 높음 |
| 신뢰도 | 중간 | 높음 |
| 투명성 | 낮음 | 높음 |
| 편향 위험 | 높음 | 낮음 |
| 추천 용도 | 일반적 결정 | 중요한 결정 |

## 🚂 Railway 배포

Railway 플랫폼에 배포하여 클라우드에서 실행할 수 있습니다.

### 빠른 배포
1. [Railway.app](https://railway.app)에서 GitHub 저장소 연결
2. MongoDB 서비스 추가 (프로젝트 캔버스에서 + 버튼 → Database → MongoDB)
3. 환경 변수 설정 (`.env.example` 파일 참조)
4. 자동 배포 완료

### 필수 환경 변수
```bash
NODE_ENV=production
PORT=${{PORT}}
MONGODB_URI=${{MongoDB.MONGO_URL}}
USE_MONGODB=true
ETHEREUM_RPC_URL=your_rpc_url
ORACLE_CONTRACT_ADDRESS=your_contract_address
ORACLE_PRIVATE_KEY_ENCRYPTED=your_encrypted_key
ENCRYPTION_KEY=your_encryption_key
OPENAI_API_KEY=your_openai_key
JWT_SECRET=your_jwt_secret_min_32_chars
ALLOWED_ORIGINS=https://your-app.railway.app
```

### 상세 가이드
Railway 배포에 대한 자세한 내용은 [`RAILWAY_DEPLOYMENT.md`](./RAILWAY_DEPLOYMENT.md) 파일을 참고하세요.

## 라이선스

MIT
