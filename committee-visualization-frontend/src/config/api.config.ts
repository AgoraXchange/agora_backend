export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
  WS_URL: import.meta.env.VITE_WS_URL || 'ws://localhost:3000',
  AUTH_TOKEN_KEY: import.meta.env.VITE_AUTH_TOKEN_KEY || 'oracle_auth_token',
  MOCK_MODE: import.meta.env.VITE_MOCK_MODE === 'true',
  DEBUG: import.meta.env.VITE_DEBUG === 'true',
  TIMEOUT: 10000, // 10 seconds
  RETRY_ATTEMPTS: 3,
  SSE_RETRY_INTERVAL: 1000 // 1 second
};

export const API_ENDPOINTS = {
  // Auth endpoints
  LOGIN: '/auth/login',
  REFRESH: '/auth/refresh',
  LOGOUT: '/auth/logout',

  // Oracle endpoints
  DECIDE_WINNER: (contractId: string) => `/oracle/contracts/${contractId}/decide-winner`,
  START_DELIBERATION: (contractId: string) => `/oracle/contracts/${contractId}/start-deliberation`,
  GET_DECISION: (contractId: string) => `/oracle/contracts/${contractId}/decision`,

  // Deliberation endpoints
  GET_DELIBERATION: (deliberationId: string) => `/deliberations/${deliberationId}`,
  STREAM_DELIBERATION: (deliberationId: string) => `/deliberations/${deliberationId}/stream`,
  GET_MESSAGES: (deliberationId: string) => `/deliberations/${deliberationId}/messages`,
  EXPORT_DELIBERATION: (deliberationId: string) => `/deliberations/${deliberationId}/export`,

  // Test endpoints (if available)
  GENERATE_TEST_CONTRACT: '/test/generate-contract'
};

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
} as const;