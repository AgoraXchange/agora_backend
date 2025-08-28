import { logger } from '../infrastructure/logging/Logger';

interface RequiredEnvVars {
  // Server configuration
  PORT?: string;
  NODE_ENV?: string;
  
  // Database configuration
  USE_MONGODB?: string;
  MONGODB_URI?: string;
  
  // Blockchain configuration
  ETHEREUM_NETWORK?: string;
  ETHEREUM_RPC_URL?: string;
  ORACLE_CONTRACT_ADDRESS?: string;
  PRIVATE_KEY?: string;
  
  // AI Services configuration
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  
  // JWT configuration
  JWT_SECRET?: string;
  
  // Monitoring
  MONITORING_INTERVAL?: string;
  
  // Ethereum Polling Configuration
  ETHEREUM_POLLING_INTERVAL?: string;
  FILTER_REFRESH_INTERVAL?: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Detects if running in Railway environment
 */
export function isRailwayEnvironment(): boolean {
  return !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);
}

/**
 * Helper function to get environment variable with fallback names
 */
function getEnvVar(names: string[]): string | undefined {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return undefined;
}

/**
 * Validates required environment variables for Railway deployment
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check critical variables with fallback names
  const jwtSecret = getEnvVar(['JWT_SECRET', 'JWT_ACCESS_SECRET']);
  if (!jwtSecret) {
    errors.push('Missing JWT secret (JWT_SECRET or JWT_ACCESS_SECRET)');
  }
  
  const contractAddress = getEnvVar(['ORACLE_CONTRACT_ADDRESS', 'MAIN_CONTRACT_ADDRESS']);
  if (!contractAddress) {
    errors.push('Missing contract address (ORACLE_CONTRACT_ADDRESS or MAIN_CONTRACT_ADDRESS)');
  }
  
  const privateKey = getEnvVar(['PRIVATE_KEY', 'ORACLE_PRIVATE_KEY_ENCRYPTED']);
  if (!privateKey) {
    errors.push('Missing private key (PRIVATE_KEY or ORACLE_PRIVATE_KEY_ENCRYPTED)');
  }
  
  if (!process.env.ETHEREUM_RPC_URL) {
    errors.push('Missing critical environment variable: ETHEREUM_RPC_URL');
  }
  
  // Check encryption key
  if (!process.env.ENCRYPTION_KEY) {
    errors.push('Missing critical environment variable: ENCRYPTION_KEY');
  } else if (process.env.ENCRYPTION_KEY.length < 32) {
    errors.push('ENCRYPTION_KEY must be at least 32 characters long');
  }
  
  // Check AI service keys (at least one should be present)
  const aiKeys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY'];
  const hasAnyAIKey = aiKeys.some(key => process.env[key]);
  
  if (!hasAnyAIKey) {
    errors.push('At least one AI service API key must be configured (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY)');
  }
  
  // MongoDB validation
  if (process.env.USE_MONGODB === 'true' && !process.env.MONGODB_URI) {
    errors.push('MONGODB_URI is required when USE_MONGODB is true');
  }
  
  // Port validation
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT);
    if (isNaN(port) || port < 1 || port > 65535) {
      warnings.push(`Invalid PORT value: ${process.env.PORT}. Using default 3000.`);
    }
  }
  
  // Monitoring interval validation
  if (process.env.MONITORING_INTERVAL) {
    const interval = parseInt(process.env.MONITORING_INTERVAL);
    if (isNaN(interval) || interval < 1000) {
      warnings.push(`Invalid MONITORING_INTERVAL: ${process.env.MONITORING_INTERVAL}. Should be >= 1000ms.`);
    }
  }
  
  // Ethereum polling interval validation
  if (process.env.ETHEREUM_POLLING_INTERVAL) {
    const interval = parseInt(process.env.ETHEREUM_POLLING_INTERVAL);
    if (isNaN(interval) || interval < 1000) {
      warnings.push(`Invalid ETHEREUM_POLLING_INTERVAL: ${process.env.ETHEREUM_POLLING_INTERVAL}. Should be >= 1000ms.`);
    }
  }
  
  // Filter refresh interval validation
  if (process.env.FILTER_REFRESH_INTERVAL) {
    const interval = parseInt(process.env.FILTER_REFRESH_INTERVAL);
    if (isNaN(interval) || interval < 30000) {
      warnings.push(`Invalid FILTER_REFRESH_INTERVAL: ${process.env.FILTER_REFRESH_INTERVAL}. Should be >= 30000ms (30 seconds).`);
    }
  }
  
  // Ethereum network validation
  const validNetworks = ['mainnet', 'goerli', 'sepolia', 'polygon', 'mumbai', 'localhost'];
  if (process.env.ETHEREUM_NETWORK && !validNetworks.includes(process.env.ETHEREUM_NETWORK)) {
    warnings.push(`Unknown ETHEREUM_NETWORK: ${process.env.ETHEREUM_NETWORK}. Valid options: ${validNetworks.join(', ')}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Logs environment validation results and exits if critical errors found
 */
export function validateAndExitOnErrors(): void {
  logger.info('Validating environment configuration...');
  
  const result = validateEnvironment();
  
  // Log warnings
  result.warnings.forEach(warning => {
    logger.warn(`Environment warning: ${warning}`);
  });
  
  // Log errors
  result.errors.forEach(error => {
    logger.error(`Environment error: ${error}`);
  });
  
  if (!result.isValid) {
    logger.error('Environment validation failed. Cannot start server.');
    logger.error('Please check your environment variables and try again.');
    process.exit(1);
  }
  
  logger.info('Environment validation passed.');
  
  // Log current configuration (without sensitive values)
  const config = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || '3000',
    USE_MONGODB: process.env.USE_MONGODB || 'false',
    ETHEREUM_NETWORK: process.env.ETHEREUM_NETWORK || 'not set',
    MONITORING_INTERVAL: process.env.MONITORING_INTERVAL || '60000ms',
    ETHEREUM_POLLING_INTERVAL: process.env.ETHEREUM_POLLING_INTERVAL || '10000ms',
    FILTER_REFRESH_INTERVAL: process.env.FILTER_REFRESH_INTERVAL || '240000ms',
    AI_SERVICES: {
      OPENAI: !!process.env.OPENAI_API_KEY,
      ANTHROPIC: !!process.env.ANTHROPIC_API_KEY,
      GOOGLE: !!process.env.GOOGLE_API_KEY
    }
  };
  
  logger.info('Current configuration:', config);
}

/**
 * Validates environment with graceful degradation for Railway deployment
 * Allows server to start with reduced functionality instead of exiting
 */
export function validateWithGracefulDegradation(): ValidationResult {
  logger.info('Validating environment configuration with graceful degradation...');
  
  const result = validateEnvironment();
  const isRailway = isRailwayEnvironment();
  
  // Log warnings
  result.warnings.forEach(warning => {
    logger.warn(`Environment warning: ${warning}`);
  });
  
  // Log errors but don't exit in Railway environment
  result.errors.forEach(error => {
    if (isRailway) {
      logger.warn(`Environment degraded: ${error}`);
    } else {
      logger.error(`Environment error: ${error}`);
    }
  });
  
  if (!result.isValid) {
    if (isRailway) {
      logger.warn('Environment validation failed but continuing in degraded mode for Railway deployment');
      logger.warn('Some features may be disabled. Please configure missing environment variables for full functionality.');
    } else {
      logger.error('Environment validation failed. Cannot start server.');
      logger.error('Please check your environment variables and try again.');
      process.exit(1);
    }
  } else {
    logger.info('Environment validation passed.');
  }
  
  // Log current configuration (without sensitive values)
  const config = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || '3000',
    USE_MONGODB: process.env.USE_MONGODB || 'false',
    ETHEREUM_NETWORK: process.env.ETHEREUM_NETWORK || 'not set',
    MONITORING_INTERVAL: process.env.MONITORING_INTERVAL || '60000ms',
    ETHEREUM_POLLING_INTERVAL: process.env.ETHEREUM_POLLING_INTERVAL || '10000ms',
    FILTER_REFRESH_INTERVAL: process.env.FILTER_REFRESH_INTERVAL || '240000ms',
    RAILWAY_ENV: isRailway,
    DEGRADED_MODE: !result.isValid && isRailway,
    AI_SERVICES: {
      OPENAI: !!process.env.OPENAI_API_KEY,
      ANTHROPIC: !!process.env.ANTHROPIC_API_KEY,
      GOOGLE: !!process.env.GOOGLE_API_KEY
    }
  };
  
  logger.info('Current configuration:', config);
  
  return result;
}

/**
 * Gets environment-specific defaults with fallback mappings
 */
export function getEnvDefaults() {
  return {
    PORT: process.env.PORT || '3000',
    NODE_ENV: process.env.NODE_ENV || 'development',
    MONITORING_INTERVAL: parseInt(process.env.MONITORING_INTERVAL || '60000'),
    ETHEREUM_POLLING_INTERVAL: parseInt(process.env.ETHEREUM_POLLING_INTERVAL || '10000'),
    FILTER_REFRESH_INTERVAL: parseInt(process.env.FILTER_REFRESH_INTERVAL || '240000'),
    USE_MONGODB: process.env.USE_MONGODB === 'true',
    ETHEREUM_NETWORK: process.env.ETHEREUM_NETWORK || 'goerli',
    JWT_SECRET: getEnvVar(['JWT_SECRET', 'JWT_ACCESS_SECRET']),
    ORACLE_CONTRACT_ADDRESS: getEnvVar(['ORACLE_CONTRACT_ADDRESS', 'MAIN_CONTRACT_ADDRESS']),
    HAS_BLOCKCHAIN_CONFIG: !!(process.env.ETHEREUM_RPC_URL && getEnvVar(['ORACLE_CONTRACT_ADDRESS', 'MAIN_CONTRACT_ADDRESS']))
  };
}