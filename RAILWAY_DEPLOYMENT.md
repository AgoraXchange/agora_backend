# 🚂 Railway 배포 가이드

## 📋 배포 개요
이 문서는 Agora Backend를 Railway 플랫폼에 배포하는 완전한 가이드입니다.

## 🎯 사전 준비사항

### 1. Railway 계정 설정
1. [Railway.app](https://railway.app)에 접속하여 회원가입
2. GitHub 계정 연동 (권장)
3. 신용카드 등록 (무료 티어: $5/월 크레딧 제공)

### 2. Railway CLI 설치 (선택사항)

#### macOS (Homebrew)
```bash
brew install railway
```

#### Windows/Linux (npm)
```bash
npm install -g @railway/cli
```

#### Curl을 사용한 직접 설치
```bash
# Linux/macOS
curl -fsSL https://railway.app/install.sh | sh

# Windows (PowerShell)
iwr https://railway.app/install.ps1 | iex
```

#### 설치 확인
```bash
railway --version
```

## 🌐 배포 방법 1: GitHub 통합 (권장)

### 1. GitHub 저장소 준비
- 현재 프로젝트를 GitHub에 푸시
- Railway가 접근할 수 있도록 저장소 공개 또는 권한 부여

### 2. Railway 프로젝트 생성
1. Railway 대시보드에서 **"New Project"** 클릭
2. **"Deploy from GitHub repo"** 선택
3. 저장소 선택 및 권한 부여
4. 자동으로 배포 시작

### 3. MongoDB 서비스 추가
1. 프로젝트 캔버스에서 **"+" 버튼** 클릭
2. **"Database"** → **"Add MongoDB"** 선택
3. MongoDB 서비스가 자동으로 프로비저닝됨
4. 연결 URL이 `MONGO_URL` 환경 변수로 자동 생성됨

### 4. 환경 변수 설정
Railway 대시보드의 Variables 탭에서 다음 환경 변수들을 설정:

#### 필수 환경 변수
```bash
# 기본 설정
NODE_ENV=production
PORT=${{PORT}}  # Railway가 자동 할당

# MongoDB (Railway가 자동 제공)
MONGODB_URI=${{MongoDB.MONGO_URL}}
USE_MONGODB=true

# 블록체인 설정
ETHEREUM_RPC_URL=your_ethereum_rpc_url
ORACLE_CONTRACT_ADDRESS=your_contract_address
ORACLE_PRIVATE_KEY_ENCRYPTED=your_encrypted_private_key
ENCRYPTION_KEY=your_encryption_key

# AI 서비스 API 키
OPENAI_API_KEY=your_openai_api_key
CLAUDE_API_KEY=your_claude_api_key
GOOGLE_AI_API_KEY=your_gemini_api_key

# JWT 및 보안 (최소 32자)
JWT_SECRET=your_very_long_jwt_secret_at_least_32_characters
JWT_REFRESH_SECRET=your_very_long_refresh_secret_at_least_32_characters

# CORS 설정
ALLOWED_ORIGINS=https://your-app.railway.app
```

#### 선택적 환경 변수
```bash
# 위원회 AI 시스템
USE_COMMITTEE=false
COMMITTEE_CONSENSUS_METHOD=weighted_voting

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5

# 관리자 계정
ADMIN_USERNAME=admin
ADMIN_PASSWORD=secure_password_here
```

## 🖥️ 배포 방법 2: CLI 배포

### 1. Railway CLI 로그인
```bash
railway login
```

### 2. 프로젝트 초기화
```bash
# 새 프로젝트 생성
railway init

# 또는 기존 프로젝트에 연결
railway link
```

### 3. MongoDB 서비스 추가
```bash
# MongoDB 템플릿 배포
railway add --template mongodb
```

### 4. 환경 변수 설정
```bash
# 개별 설정
railway variables set NODE_ENV=production
railway variables set USE_MONGODB=true
railway variables set MONGODB_URI='${{MongoDB.MONGO_URL}}'
railway variables set ETHEREUM_RPC_URL=your_rpc_url
railway variables set OPENAI_API_KEY=your_openai_key
# ... 나머지 환경 변수들

# 또는 .env 파일에서 일괄 설정
railway variables set --from-env
```

### 5. 배포 실행
```bash
# 배포
railway up

# 배포 후 로그 확인
railway logs
```

## 🏗️ 프로젝트 파일 설명

### railway.json
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "nixpacks",
    "buildCommand": "npm ci && npm run build",
    "watchPatterns": ["src/**", "package.json", "tsconfig.json"]
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### .env.example
Railway 배포에 필요한 모든 환경 변수의 템플릿이 포함되어 있습니다.

## ✅ 배포 후 확인사항

### 1. 서비스 상태 확인
```bash
# CLI 사용
railway status
railway logs

# 브라우저에서
curl https://your-app.railway.app/health
```

### 2. 환경 변수 확인
Railway 대시보드에서 모든 필요한 환경 변수가 설정되었는지 확인

### 3. MongoDB 연결 확인
Railway 대시보드의 MongoDB 서비스에서 연결 상태 및 메트릭 확인

### 4. 도메인 설정
- Railway에서 자동으로 `*.railway.app` 도메인 제공
- 커스텀 도메인 설정: Settings → Domains에서 추가

## 🔧 트러블슈팅

### 빌드 실패
```bash
# 로그 확인
railway logs --deployment

# 일반적인 해결 방법:
# 1. package-lock.json 파일 존재 확인
# 2. Node.js 버전 호환성 확인
# 3. TypeScript 컴파일 에러 확인
```

### 환경 변수 문제
```bash
# 환경 변수 목록 확인
railway variables

# 특정 변수 설정
railway variables set VARIABLE_NAME=value
```

### MongoDB 연결 실패
1. Railway 대시보드에서 MongoDB 서비스 상태 확인
2. `MONGODB_URI=${{MongoDB.MONGO_URL}}` 설정 확인
3. `USE_MONGODB=true` 설정 확인

### 포트 바인딩 실패
- `PORT=${{PORT}}` 환경 변수 설정 확인
- 코드에서 `process.env.PORT` 사용하는지 확인

## 📊 모니터링 및 관리

### 로그 확인
```bash
# 실시간 로그
railway logs --follow

# 특정 서비스 로그
railway logs --service your-service-name
```

### 메트릭 확인
Railway 대시보드에서 다음 메트릭 확인 가능:
- CPU 사용률
- 메모리 사용량
- 네트워크 트래픽
- 요청 수 및 응답 시간

### 스케일링
- **수직 스케일링**: Resources 탭에서 CPU/메모리 조정
- **수평 스케일링**: Replicas 설정 (최대 50개)

## 💰 비용 관리

### 무료 티어
- $5/월 크레딧 제공
- 작은 규모 애플리케이션에 적합

### 요금 계산
- CPU 시간 기반 과금
- 네트워크 사용량
- 저장소 사용량
- Railway 대시보드에서 실시간 사용량 확인

## 🔐 보안 고려사항

### 환경 변수 보안
- 모든 시크릿 키는 Railway의 환경 변수에 저장
- GitHub에는 절대 시크릿 정보 커밋 금지

### 네트워크 보안
- HTTPS 자동 적용
- Private Networking 사용 (서비스 간 통신)
- CORS 설정으로 허용된 도메인만 접근

## 🚀 CI/CD 자동화

### GitHub Actions와 연동
```yaml
# .github/workflows/deploy.yml
name: Deploy to Railway
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Railway
        run: |
          npm install -g @railway/cli
          railway login --token ${{ secrets.RAILWAY_TOKEN }}
          railway up --detach
```

## 📞 지원 및 문서

- [Railway 공식 문서](https://docs.railway.com)
- [Railway Discord 커뮤니티](https://discord.gg/railway)
- [Railway Status 페이지](https://status.railway.app)

---

## 📝 체크리스트

배포 전 확인사항:
- [ ] Railway 계정 생성 및 GitHub 연동
- [ ] 모든 환경 변수 준비
- [ ] API 키들 준비 (OpenAI, Claude, Gemini 등)
- [ ] Ethereum RPC URL 및 컨트랙트 주소 준비
- [ ] Private Key 암호화 완료

배포 후 확인사항:
- [ ] 서비스 정상 실행 확인 (/health 엔드포인트)
- [ ] MongoDB 연결 확인
- [ ] 환경 변수 모두 설정됨
- [ ] 도메인 정상 작동
- [ ] 로그 확인 및 에러 없음
- [ ] API 엔드포인트 테스트 완료

이 가이드를 따라하면 Agora Backend를 Railway에 성공적으로 배포할 수 있습니다! 🎉