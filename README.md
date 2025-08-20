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
- AI를 통한 당사자 A/B 중 승자 결정
- 블록체인에 승자 정보 제출
- RESTful API 제공
- 실시간 로깅 및 모니터링
- Graceful Shutdown 지원

## 아키텍처

### Clean Architecture 레이어

```
src/
├── domain/           # 엔티티, 비즈니스 규칙, 인터페이스 정의
│   ├── entities/     # Contract, Party, OracleDecision
│   ├── repositories/ # 레포지토리 인터페이스
│   └── services/     # 외부 서비스 인터페이스
├── application/      # 유스케이스, 비즈니스 로직
│   └── useCases/     # DecideWinnerUseCase, MonitorContractsUseCase
├── infrastructure/   # 외부 시스템 구현체
│   ├── ai/          # AI 서비스 구현
│   ├── blockchain/  # 이더리움 통신
│   └── repositories/# 레포지토리 구현
└── interfaces/       # 외부 인터페이스
    ├── controllers/  # HTTP 컨트롤러
    └── routes/      # Express 라우트
```

### 주요 설계 원칙

- **의존성 역전 원칙(DIP)**: 도메인 레이어가 인프라 레이어에 의존하지 않음
- **느슨한 결합**: 인터페이스를 통한 모듈 간 통신
- **관심사 분리**: 각 레이어가 명확한 책임을 가짐

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

## 라이선스

ISC