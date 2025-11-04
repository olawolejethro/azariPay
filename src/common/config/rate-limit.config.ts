// src/common/rate-limit/rate-limit.config.ts
export enum RateLimitTier {
  AUTH = 'auth',
  SENSITIVE = 'sensitive',
  GENERAL = 'general',
  READ = 'read',
}

export interface RateLimitConfig {
  points: number;
  duration: number;
  blockDuration: number;
  keyPrefix: string;
}

export const RATE_LIMIT_CONFIGS: Record<RateLimitTier, RateLimitConfig> = {
  [RateLimitTier.AUTH]: {
    points: 5,
    duration: 900, // 15 minutes
    blockDuration: 3600, // 1 hour
    keyPrefix: 'ratelimit:auth',
  },
  [RateLimitTier.SENSITIVE]: {
    points: 10,
    duration: 3600, // 1 hour
    blockDuration: 7200, // 2 hours
    keyPrefix: 'ratelimit:sensitive',
  },
  [RateLimitTier.GENERAL]: {
    points: 100,
    duration: 900, // 15 minutes
    blockDuration: 900, // 15 minutes
    keyPrefix: 'ratelimit:general',
  },
  [RateLimitTier.READ]: {
    points: 60,
    duration: 60, // 1 minute
    blockDuration: 300, // 5 minutes
    keyPrefix: 'ratelimit:read',
  },
};

// Endpoint-specific overrides (optional)
export const ENDPOINT_RATE_LIMITS: Record<string, Partial<RateLimitConfig>> = {
  'POST:/api/v1/auth/signin': {
    points: 5,
    duration: 900,
    blockDuration: 3600,
  },
  'POST:/api/v1/auth/signup/start': {
    points: 3,
    duration: 900,
    blockDuration: 3600,
  },
  'POST:/api/v1/auth/password-reset/initiate-otp': {
    points: 3,
    duration: 900,
    blockDuration: 3600,
  },
  'POST:/api/v1/wallet/transfer': {
    points: 10,
    duration: 3600,
    blockDuration: 7200,
  },
};
