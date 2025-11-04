// src/common/decorators/rate-limit.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { RateLimitTier } from '../config/rate-limit.config';

export const RATE_LIMIT_KEY = 'rateLimit';

export const RateLimit = (tier: RateLimitTier) =>
  SetMetadata(RATE_LIMIT_KEY, tier);

// Optional: Skip rate limiting for specific endpoints
export const SkipRateLimit = () => SetMetadata('skipRateLimit', true);
