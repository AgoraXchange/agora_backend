# Railway 환경변수 설정 가이드

Railway 공식 문서 분석에 기반한 완전한 환경변수 설정 가이드입니다.

## 🚀 Railway 대시보드에서 환경변수 설정하기

### 방법 1: Variables 탭에서 개별 설정
1. Railway 대시보드 → 프로젝트 선택
2. 서비스 선택 → **"Variables"** 탭 클릭
3. **"New Variable"** 버튼 클릭하여 하나씩 추가

### 방법 2: RAW Editor로 일괄 설정 (권장)
1. Railway 대시보드 → 프로젝트 선택  
2. 서비스 선택 → **"Variables"** 탭 클릭
3. **"RAW Editor"** 버튼 클릭
4. `.env.example` 파일의 필요한 부분을 복사하여 붙여넣기
5. **"Deploy Changes"** 버튼 클릭

## 📋 필수 환경변수 (프로덕션용)

```bash
# 🔐 보안 설정 (필수)
ENCRYPTION_KEY=your-32-character-encryption-key-here
JWT_ACCESS_SECRET=your-jwt-access-secret-key-here
PRIVATE_KEY=your-ethereum-private-key-here

# 🔗 블록체인 설정 (필수)
ETHEREUM_RPC_URL=https://your-ethereum-rpc-url
MAIN_CONTRACT_ADDRESS=0xYourContractAddressHere

# 🚀 Railway 실제 블록체인 활성화 (선택사항)
USE_REAL_BLOCKCHAIN=true

# 🤖 AI 서비스 (최소 하나 필수)
OPENAI_API_KEY=sk-your-openai-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here
GOOGLE_API_KEY=your-google-api-key-here
```

## 🧪 테스트용 기본값 (Degraded 모드)

Railway에서 바로 테스트하려면 다음 기본값들을 사용할 수 있습니다:

```bash
# 서버 설정
NODE_ENV=production
PORT=3000
USE_MONGODB=false
MONITORING_INTERVAL=60000
LOG_LEVEL=info

# 🧪 테스트용 보안 설정 (개발/테스트 전용)
ENCRYPTION_KEY=railway-default-encryption-key-32-characters!!!
JWT_ACCESS_SECRET=railway-default-jwt-secret-key-for-testing-32-chars
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# 🧪 테스트용 블록체인 설정 (Mock 모드)
ETHEREUM_RPC_URL=http://localhost:8545
MAIN_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000

# 🧪 테스트용 Ethereum 폴링 설정
ETHEREUM_POLLING_INTERVAL=10000
FILTER_REFRESH_INTERVAL=240000

# 🧪 테스트용 AI 서비스 (Dummy 키)
OPENAI_API_KEY=dummy-openai-key-for-railway-testing
```

## 🔐 Railway 보안 기능 활용

### Sealed Variables (권장)
민감한 환경변수는 반드시 **Sealed Variables** 로 설정하세요:

1. Variables 탭에서 변수 우측 **3점 메뉴** 클릭
2. **"Seal"** 선택
3. Sealed 후에는 값을 볼 수 없으므로 신중히 설정

**Sealed 권장 변수:**
- `PRIVATE_KEY`
- `ENCRYPTION_KEY` 
- `JWT_ACCESS_SECRET`
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`

### Shared Variables
여러 서비스에서 공통으로 사용하는 값들은 **Project Variables**로 설정:

1. 프로젝트 대시보드에서 **"Variables"** 탭
2. **"Shared"** 섹션에서 공통 변수 설정
3. 각 서비스에서 자동으로 사용 가능

## 🎯 Graceful Degradation (환경변수 없이 배포)

이 애플리케이션은 **Railway Degraded 모드**를 지원합니다:

- ✅ **CryptoService**: 더미 암호화 키로 작동 (경고 로그)
- ✅ **Contract Monitoring**: 블록체인 설정 없으면 자동 비활성화
- ✅ **Health Check**: 항상 200 OK 반환 (degraded 상태 표시)
- ✅ **AI Services**: 최소 하나 있으면 활성화, 없으면 경고
- 🔒 **Blockchain**: 기본적으로 테스트 모드 (실제 자금 보호)

## 🚀 Railway에서 실제 블록체인 기능 사용하기

Railway에서는 보안상 기본적으로 테스트 지갑을 사용합니다. 실제 블록체인과 연동하려면:

### 1단계: 필수 환경변수 설정
```bash
# 실제 블록체인 활성화
USE_REAL_BLOCKCHAIN=true

# 실제 개인키 (Sealed Variable로 설정 권장)
PRIVATE_KEY=0xYourRealPrivateKeyHere

# 실제 RPC URL
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR-PROJECT-ID

# 실제 컨트랙트 주소
MAIN_CONTRACT_ADDRESS=0xYourRealContractAddressHere
```

### 2단계: 보안 설정
1. **Sealed Variables** 사용: `PRIVATE_KEY`는 반드시 Sealed로 설정
2. **테스트 먼저**: testnet(goerli, sepolia)에서 충분히 테스트
3. **소량 자금**: 처음에는 최소한의 ETH만 보관

### 3단계: 로그 확인
배포 후 다음 로그 확인:
- ✅ `🚀 Railway real blockchain mode enabled - using production wallet`
- ❌ `🚂 Using Railway test wallet - blockchain functionality disabled for production safety`

### ⚠️ 중요 주의사항
- 실제 자금이 있는 지갑 사용 시 각별한 주의 필요
- 테스트넷에서 충분히 검증 후 메인넷 사용
- `USE_REAL_BLOCKCHAIN=true` 없으면 자동으로 안전 모드

### Railway 환경변수 우선순위
애플리케이션이 자동으로 다음 순서로 환경변수를 찾습니다:

```bash
JWT_SECRET → JWT_ACCESS_SECRET (fallback)
ORACLE_CONTRACT_ADDRESS → MAIN_CONTRACT_ADDRESS (fallback) 
PRIVATE_KEY → ORACLE_PRIVATE_KEY_ENCRYPTED (fallback)
```

## 🔧 로컬에서 Railway 환경 테스트

Railway CLI를 사용하여 로컬에서 Railway 환경변수로 테스트:

```bash
# Railway CLI 설치
npm install -g @railway/cli

# Railway 로그인
railway login

# 프로젝트 연결
railway link

# Railway 환경변수로 로컬 실행
npm run railway:local

# 환경변수 상태 확인
npm run railway:check

# Railway 변수 목록 보기
npm run railway:variables
```

## 📊 배포 후 모니터링

### 1. 헬스 체크 확인
```bash
curl https://your-app.railway.app/health
```

**예상 응답 (Degraded 모드):**
```json
{
  "status": "starting",
  "ready": false,
  "readiness": {
    "ready": false,
    "components": {
      "ready": 4,
      "total": 5
    },
    "notReadyComponents": ["environment"]
  }
}
```

### 2. Railway 로그 확인
```bash
npm run railway:logs
```

**확인할 로그 메시지:**
- `🚂 Using Railway test wallet - blockchain functionality disabled`
- `ENCRYPTION_KEY missing - using dummy key for degraded mode`
- `Contract monitoring disabled - blockchain configuration missing`
- `Filter not found` - RPC 프로바이더 필터 만료 (정상적인 재시도 발생)

### 3. 환경변수 설정 후 확인
실제 환경변수를 설정한 후 다시 헬스 체크:
```json
{
  "status": "ready",
  "ready": true,
  "readiness": {
    "ready": true,
    "components": {
      "ready": 5,
      "total": 5  
    }
  }
}
```

## ⚠️ 보안 주의사항

- 🔴 **PRIVATE_KEY**: 절대 실제 자금이 있는 지갑 사용 금지
- 🔴 **실제 API 키**: Railway 대시보드에서만 설정, 코드에 포함 금지  
- 🟡 **테스트 키**: 공개된 테스트 키이므로 프로덕션 사용 금지
- 🔵 **Sealed Variables**: 민감한 정보는 반드시 Sealed 처리

## 🛠️ 문제 해결

### Railway에서 서버가 시작되지 않는 경우:
1. `npm run railway:check` 실행하여 환경변수 확인
2. Railway 로그에서 오류 메시지 확인
3. `.env.example` 참조하여 누락된 변수 추가
4. Degraded 모드로라도 시작되는지 확인

### RPC "filter not found" 에러가 발생하는 경우:
1. **정상적인 현상**: Ethereum RPC 필터는 5분 후 자동 만료됨
2. **자동 복구**: 애플리케이션이 자동으로 필터를 재생성하고 재시도함
3. **폴링 간격 조정**:
   ```bash
   ETHEREUM_POLLING_INTERVAL=15000      # 기본 10초 → 15초로 증가
   FILTER_REFRESH_INTERVAL=180000       # 기본 4분 → 3분으로 감소
   ```
4. **로그 확인**: "Recreating event listener" 메시지가 나타나면 정상 작동 중

### 환경변수 설정이 적용되지 않는 경우:
1. **"Deploy Changes"** 버튼 클릭 확인
2. Railway에서 자동 배포 대기 (1-2분)
3. 브라우저 캐시 삭제 후 재확인

### Railway RPC 프로바이더 제한 사항:
- **무료 RPC**: Alchemy, Infura 무료 계정은 요청 수 제한 있음
- **필터 수명**: 대부분의 RPC 프로바이더는 필터를 5분 후 자동 정리
- **권장 설정**: 상용 RPC 서비스 사용 또는 폴링 간격 조정