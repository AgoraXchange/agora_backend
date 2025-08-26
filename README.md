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
- **위원회 기반 AI 결정 시스템**: MoA(Mixture-of-Agents) + LLM-as-Judge 아키텍처
  - 다중 AI 에이전트의 협의 및 토론을 통한 승자 결정
  - GPT-5, Claude, Gemini 등 다양한 AI 모델 활용
  - 규칙 기반 + LLM 기반 심사 시스템
  - 가중 투표, 보르다 카운트, 다수결 등 다양한 합의 메커니즘
- 블록체인에 승자 정보 제출 (상세한 위원회 결정 증명 포함)
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
│   │   ├── judges/                       # 심사 시스템
│   │   │   ├── RuleBasedJudge.ts         # 규칙 기반 심사
│   │   │   ├── LLMJudge.ts              # LLM 기반 심사
│   │   │   └── CommitteeJudgeService.ts  # 통합 심사 서비스
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
- OpenAI 실제 구현 (GPT-4 지원)
- MongoDB 영구 저장소 옵션
- 비동기 에러 핸들링
- 요청별 상세 로깅

## ⚠️ 프로덕션 배포 시 주의사항

1. **환경 변수**: 모든 시크릿 키는 안전하게 관리하세요
2. **Private Key**: 반드시 암호화하여 저장하세요
3. **JWT Secret**: 최소 32자 이상의 강력한 키 사용
4. **MongoDB**: 프로덕션에서는 `USE_MONGODB=true` 설정 권장
5. **Rate Limiting**: 서비스 특성에 맞게 조정
6. **로그 관리**: 로그 파일 크기 및 로테이션 설정 확인

## 🤖 위원회 기반 AI 결정 시스템 (MoA + LLM-as-Judge)

### 시스템 개요

본 시스템은 **MoA(Mixture-of-Agents)**와 **LLM-as-Judge** 기법을 결합하여 단일 AI의 한계를 극복하고, 다중 AI 에이전트의 협의와 심사를 통해 더 정확하고 신뢰할 수 있는 결정을 내리는 위원회 기반 오라클 시스템입니다.

### 아키텍처 구조

```
┌─────────────── 1층: 제안자(Proposers) ───────────────┐
│  GPT-4        Claude        Gemini    (다양한 관점/샘플링) │
│   └─제안 N개  └─제안 N개    └─제안 N개                 │
└──────────────────────────────────────────────────────┘
                    │ (모든 후보 제안)
                    ▼
┌─────────────── 2층: 심사단(Judges) ─────────────────┐
│ 규칙기반 점수(구조/일관성)  +  LLM 쌍대비교(품질평가)    │
│  ↳ 바이어스 완화: 순서랜덤/길이정규화/근거필수         │
└──────────────────────────────────────────────────────┘
                    │ (랭킹/점수, 신뢰도)
                    ▼
┌─────────────── 3층: 합의/합성(Synthesizer) ──────────┐
│  다수결·보르다·가중투표(신뢰가중) → 최종 답안 + 근거    │
└──────────────────────────────────────────────────────┘
```

### 핵심 구성 요소

#### 1. **Proposer Layer (제안자 층)**
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
CLAUDE_API_KEY=your_claude_key  
GOOGLE_AI_API_KEY=your_gemini_key

# 테스트용 (Mock 응답 사용)
OPENAI_FALLBACK_TO_MOCK=true
CLAUDE_API_KEY=mock
GOOGLE_AI_API_KEY=mock
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

## 라이선스

ISC
