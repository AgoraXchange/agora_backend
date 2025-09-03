#!/usr/bin/env node

/**
 * Railway 환경변수 검증 스크립트
 * 
 * 사용법:
 *   npm run railway:check
 *   node scripts/check-railway-env.js
 */

const fs = require('fs');
const path = require('path');

// 색상 출력을 위한 ANSI 코드
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function header(text) {
  console.log('\n' + colorize('='.repeat(60), 'cyan'));
  console.log(colorize(`  ${text}`, 'cyan'));
  console.log(colorize('='.repeat(60), 'cyan'));
}

function checkEnvVar(name, fallbackNames = [], required = false) {
  const value = process.env[name];
  const fallbackValue = fallbackNames.find(fallback => process.env[fallback]);
  
  const status = {
    name,
    hasValue: !!(value || fallbackValue),
    value: value || fallbackValue,
    usedFallback: !value && fallbackValue,
    fallbackName: !value && fallbackValue ? fallbackNames.find(f => process.env[f]) : null,
    required
  };
  
  return status;
}

function validateEnvironment() {
  header('Railway 환경변수 검증 결과');
  
  // Railway 환경 감지
  const isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);
  const isDegraded = !isRailway; // 로컬에서는 degraded로 간주
  
  console.log(`환경: ${isRailway ? colorize('Railway', 'green') : colorize('로컬', 'yellow')}`);
  console.log(`모드: ${isDegraded ? colorize('Degraded', 'yellow') : colorize('Full', 'green')}`);
  
  // 환경변수 검증
  const envChecks = [
    // 필수 보안 설정
    { name: 'ENCRYPTION_KEY', required: true, minLength: 32 },
    { 
      name: 'JWT_ACCESS_SECRET', 
      fallbacks: ['JWT_SECRET'], 
      required: true,
      minLength: 32 
    },
    
    // 블록체인 설정
    { name: 'ETHEREUM_RPC_URL', required: isRailway },
    { 
      name: 'MAIN_CONTRACT_ADDRESS', 
      fallbacks: ['ORACLE_CONTRACT_ADDRESS'], 
      required: isRailway 
    },
    { 
      name: 'PRIVATE_KEY', 
      fallbacks: ['ORACLE_PRIVATE_KEY_ENCRYPTED'], 
      required: isRailway,
      sensitive: true
    },
    
    // AI 서비스 (최소 하나 필요)
    { name: 'OPENAI_API_KEY', sensitive: true },
    { name: 'ANTHROPIC_API_KEY', sensitive: true },  
    { name: 'GOOGLE_API_KEY', sensitive: true },
    
    // 선택 설정
    { name: 'NODE_ENV', defaultValue: 'development' },
    { name: 'PORT', defaultValue: '3000' },
    { name: 'USE_MONGODB', defaultValue: 'false' },
    { name: 'MONITORING_INTERVAL', defaultValue: '60000' }
  ];
  
  console.log('\n' + colorize('환경변수 상태:', 'bright'));
  console.log('━'.repeat(60));
  
  let errors = [];
  let warnings = [];
  let hasAnyAIKey = false;
  
  envChecks.forEach(check => {
    const status = checkEnvVar(check.name, check.fallbacks || [], check.required);
    
    // AI 키 중 하나라도 있는지 확인
    if (['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY'].includes(check.name) && status.hasValue) {
      hasAnyAIKey = true;
    }
    
    // 상태 출력
    let statusText = '';
    let nameText = check.name;
    
    if (status.usedFallback) {
      nameText += colorize(` (→ ${status.fallbackName})`, 'blue');
    }
    
    if (status.hasValue) {
      if (check.sensitive && status.value) {
        const maskedValue = status.value.substring(0, 8) + '*'.repeat(Math.max(0, status.value.length - 12)) + status.value.substring(Math.max(8, status.value.length - 4));
        statusText = colorize(`✓ ${maskedValue}`, 'green');
      } else if (status.value && status.value.length > 50) {
        statusText = colorize(`✓ ${status.value.substring(0, 30)}...`, 'green');
      } else {
        statusText = colorize(`✓ ${status.value || 'SET'}`, 'green');
      }
      
      // 길이 검증
      if (check.minLength && status.value && status.value.length < check.minLength) {
        warnings.push(`${check.name}: 값이 너무 짧습니다 (최소 ${check.minLength}자 필요)`);
        statusText += colorize(` (너무 짧음)`, 'yellow');
      }
    } else {
      if (check.required) {
        statusText = colorize('✗ 누락', 'red');
        errors.push(`${check.name}: 필수 환경변수가 설정되지 않았습니다`);
      } else if (check.defaultValue) {
        statusText = colorize(`- 기본값: ${check.defaultValue}`, 'yellow');
      } else {
        statusText = colorize('- 선택사항', 'yellow');
      }
    }
    
    console.log(`${nameText.padEnd(35)} ${statusText}`);
  });
  
  // AI 서비스 검증
  if (!hasAnyAIKey) {
    errors.push('AI_SERVICES: 최소 하나의 AI API 키가 필요합니다 (OPENAI, ANTHROPIC, GOOGLE 중 하나)');
  }
  
  // 결과 요약
  console.log('\n' + colorize('검증 결과:', 'bright'));
  console.log('━'.repeat(60));
  
  if (errors.length === 0) {
    console.log(colorize('✓ 환경변수 검증 통과', 'green'));
  } else {
    console.log(colorize(`✗ ${errors.length}개 오류 발견`, 'red'));
    errors.forEach(error => {
      console.log(colorize(`  • ${error}`, 'red'));
    });
  }
  
  if (warnings.length > 0) {
    console.log(colorize(`⚠ ${warnings.length}개 경고`, 'yellow'));
    warnings.forEach(warning => {
      console.log(colorize(`  • ${warning}`, 'yellow'));
    });
  }
  
  // 권장 사항
  console.log('\n' + colorize('권장 사항:', 'bright'));
  console.log('━'.repeat(60));
  
  if (isRailway) {
    console.log(colorize('✓ Railway 환경에서 실행 중', 'green'));
    console.log('• Variables 탭에서 민감한 정보는 "Sealed" 설정 권장');
    console.log('• 실제 API 키와 개인키 사용 확인');
  } else {
    console.log(colorize('⚠ 로컬 환경에서 실행 중', 'yellow'));
    console.log('• Railway 배포 전 환경변수 설정 확인 필요');
    console.log('• npm run railway:local 로 Railway 환경에서 테스트 가능');
  }
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log(colorize('• 모든 설정이 올바르게 구성되었습니다!', 'green'));
  }
  
  console.log(colorize('\n자세한 설정 방법: RAILWAY_ENV_SETUP.md 참조', 'cyan'));
  
  // 종료 코드
  process.exit(errors.length > 0 ? 1 : 0);
}

// 실행
if (require.main === module) {
  validateEnvironment();
}

module.exports = { validateEnvironment, checkEnvVar };