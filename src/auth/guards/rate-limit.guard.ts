// src/common/guards/rate-limit.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RedisService } from 'src/common/redis/redis.service';
import { RATE_LIMIT_KEY } from 'src/common/decorators/rate-limit.decorator';
import {
  ENDPOINT_RATE_LIMITS,
  RateLimitConfig,
  RATE_LIMIT_CONFIGS,
  RateLimitTier,
} from 'src/common/config/rate-limit.config';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Check if rate limiting should be skipped
    const skipRateLimit = this.reflector.getAllAndOverride<boolean>(
      'skipRateLimit',
      [context.getHandler(), context.getClass()],
    );

    if (skipRateLimit) {
      return true;
    }

    // Get rate limit tier from decorator
    const tier = this.reflector.getAllAndOverride<RateLimitTier>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no tier specified, apply default general rate limit
    const effectiveTier = tier || RateLimitTier.GENERAL;
    const config = this.getConfig(request, effectiveTier);
    const key = this.generateKey(request, effectiveTier, config.keyPrefix);

    // Check and consume rate limit
    const result = await this.checkRateLimit(key, config);

    // Add rate limit headers
    response.header('X-RateLimit-Limit', config.points.toString());
    response.header('X-RateLimit-Remaining', result.remaining.toString());
    response.header(
      'X-RateLimit-Reset',
      new Date(result.resetTime).toISOString(),
    );

    if (!result.allowed) {
      response.header('Retry-After', result.retryAfter.toString());

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: this.getCustomMessage(effectiveTier),
          error: 'Too Many Requests',
          retryAfter: result.retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private getConfig(request: any, tier: RateLimitTier): RateLimitConfig {
    const baseConfig = RATE_LIMIT_CONFIGS[tier];
    const endpoint = `${request.method}:${request.route?.path || request.url}`;

    // Check for endpoint-specific override
    const override = ENDPOINT_RATE_LIMITS[endpoint];

    return override ? { ...baseConfig, ...override } : baseConfig;
  }

  private generateKey(
    request: any,
    tier: RateLimitTier,
    prefix: string,
  ): string {
    const user = request.user;
    const ip = this.getIp(request);
    const endpoint = `${request.method}:${request.route?.path || request.url}`;

    // Different key strategies based on tier
    if (tier === RateLimitTier.AUTH) {
      // Auth endpoints: Rate limit by IP only (before authentication)
      return `${prefix}:ip:${ip}:${endpoint}`;
    }

    // Other endpoints: Use userId if authenticated, otherwise IP
    const identifier = user?.userId ? `user:${user.userId}` : `ip:${ip}`;
    return `${prefix}:${identifier}:${endpoint}`;
  }

  private async checkRateLimit(
    key: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const redis = this.redisService.getClient();
    const now = Date.now();

    // Check if currently blocked
    const blockKey = `${key}:blocked`;
    const blocked = await redis.get(blockKey);

    if (blocked) {
      const ttl = await redis.ttl(blockKey);
      return {
        allowed: false,
        remaining: 0,
        resetTime: now + ttl * 1000,
        retryAfter: ttl,
      };
    }

    // Get current count
    const current = await redis.get(key);
    const count = current ? parseInt(current) : 0;

    // Check if limit exceeded
    if (count >= config.points) {
      // Block the key for blockDuration
      await redis.set(blockKey, '1', 'EX', config.blockDuration);

      return {
        allowed: false,
        remaining: 0,
        resetTime: now + config.blockDuration * 1000,
        retryAfter: config.blockDuration,
      };
    }

    // Increment counter
    if (count === 0) {
      // First request - set key with expiration
      await redis.set(key, '1', 'EX', config.duration);
    } else {
      // Increment existing key
      await redis.incr(key);
    }

    const ttl = await redis.ttl(key);

    return {
      allowed: true,
      remaining: config.points - count - 1,
      resetTime: now + ttl * 1000,
      retryAfter: 0,
    };
  }

  private getCustomMessage(tier: RateLimitTier): string {
    const messages: Record<RateLimitTier, string> = {
      [RateLimitTier.AUTH]:
        'Too many authentication attempts. Please try again later.',
      [RateLimitTier.SENSITIVE]:
        'Too many requests to sensitive endpoint. Please slow down.',
      [RateLimitTier.GENERAL]:
        'Rate limit exceeded. Please try again in a few minutes.',
      [RateLimitTier.READ]:
        'Too many requests. Please reduce request frequency.',
    };

    return messages[tier] || 'Rate limit exceeded.';
  }

  private getIp(request: any): string {
    return (
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      request.ip ||
      'unknown'
    );
  }
}
