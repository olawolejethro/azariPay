// src/common/redis/redis.service.ts

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { LoggerService } from '../logger/logger.service';

/**
 * RedisService manages the Redis client connection for the application.
 * It provides methods to interact with Redis, such as setting and getting keys.
 */
/**
 * Information about the current rate limit status.
 */
export interface RateLimitInfo {
  count: number;
  remaining: number;
  resetTime: number;
  ttl: number;
  isBlocked: boolean;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis;

  /**
   * Initializes the Redis client using configuration from environment variables.
   *
   * @param configService - Provides access to environment variables.
   * @param logger - Service for logging information and errors.
   */
  constructor(
    private configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.client = new Redis({
      host: this.configService.get<string>('REDIS_HOST'),
      port: this.configService.get<number>('REDIS_PORT'),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      // Additional Redis configurations if needed
    });

    // Handle Redis client errors
    this.client.on('error', (err: Error) => {
      this.logger.error(err, 'RedisService');
    });
  }

  /**
   * Retrieves the Redis client instance.
   *
   * Example Usage:
   * ```typescript
   * const client = this.redisService.getClient();
   * await client.set('key', 'value');
   * const value = await client.get('key');
   * ```
   *
   * @returns Redis client instance.
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Gracefully shuts down the Redis client when the module is destroyed.
   */
  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
      this.logger.log(
        'Redis client disconnected successfully.',
        'RedisService',
      );
    } catch (error) {
      this.logger.error(error, 'RedisService');
    }
  }

  /**
   * Sets a key-value pair in Redis with an optional TTL.
   *
   * Example Usage:
   * ```typescript
   * const success = await this.redisService.setKey('key', 'value', 300);
   * ```
   *
   * @param key - The key to set.
   * @param value - The value to associate with the key.
   * @param ttlSeconds - Time-to-live in seconds.
   * @returns Boolean indicating success.
   */
  async setKey(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<boolean> {
    try {
      if (ttlSeconds) {
        return (await this.client.set(key, value, 'EX', ttlSeconds)) === 'OK';
      }
      return (await this.client.set(key, value)) === 'OK';
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        'RedisService',
      );
      return false;
    }
  }

  /**
   * Retrieves the value associated with a key from Redis.
   *
   * Example Usage:
   * ```typescript
   * const value = await this.redisService.getKey('key');
   * ```
   *
   * @param key - The key to retrieve.
   * @returns The value associated with the key, or null if not found.
   */
  async getKey(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        'RedisService',
      );
      return null;
    }
  }

  /**
   * Deletes a key from Redis.
   *
   * Example Usage:
   * ```typescript
   * const deletedCount = await this.redisService.deleteKey('key');
   * ```
   *
   * @param key - The key to delete.
   * @returns The number of keys that were removed.
   */
  async deleteKey(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        'RedisService',
      );
      return 0;
    }
  }

  /**
   * Checks and increments rate limit for a given key.
   *
   * Example Usage:
   * ```typescript
   * const result = await this.redisService.checkRateLimit('auth:login:user123', 300, 5);
   * if (!result.allowed) {
   *   throw new TooManyRequestsException(`Try again in ${result.info.ttl} seconds`);
   * }
   * ```
   *
   * @param key - The rate limit key (e.g., 'auth:login:userId' or 'api:ip:192.168.1.1')
   * @param windowSeconds - Time window in seconds
   * @param maxRequests - Maximum requests allowed in the time window
   * @returns Object with allowed status and rate limit info
   */
  async checkRateLimit(
    key: string,
    windowSeconds: number,
    maxRequests: number,
  ): Promise<{ allowed: boolean; info: RateLimitInfo }> {
    try {
      const rateLimitKey = `rate_limit:${key}`;
      const blockKey = `rate_limit:block:${key}`;

      // Check if user is blocked
      const isBlocked = await this.client.get(blockKey);
      if (isBlocked) {
        const ttl = await this.client.ttl(blockKey);
        return {
          allowed: false,
          info: {
            count: maxRequests,
            remaining: 0,
            resetTime: Date.now() + ttl * 1000,
            ttl,
            isBlocked: true,
          },
        };
      }

      // Use Redis pipeline for atomic operations
      const multi = this.client.multi();
      multi.incr(rateLimitKey);
      multi.expire(rateLimitKey, windowSeconds, 'NX'); // Only set expiry if key doesn't exist
      multi.ttl(rateLimitKey);

      const results = await multi.exec();

      if (!results) {
        throw new Error('Redis transaction failed');
      }

      const count = results[0][1] as number;
      const ttl = results[2][1] as number;
      const remaining = Math.max(0, maxRequests - count);
      const resetTime = Date.now() + ttl * 1000;

      const allowed = count <= maxRequests;

      // If limit exceeded, optionally block the user
      if (!allowed && count === maxRequests + 1) {
        // First time exceeding limit - could implement blocking logic here
        this.logger.warn(`Rate limit exceeded for key: ${key}`, 'RedisService');
      }

      return {
        allowed,
        info: {
          count,
          remaining,
          resetTime,
          ttl,
          isBlocked: false,
        },
      };
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        'RedisService.checkRateLimit',
      );
      // On error, allow the request but log it
      return {
        allowed: true,
        info: {
          count: 0,
          remaining: maxRequests,
          resetTime: Date.now() + windowSeconds * 1000,
          ttl: windowSeconds,
          isBlocked: false,
        },
      };
    }
  }

  /**
   * Gets current rate limit info without incrementing.
   *
   * Example Usage:
   * ```typescript
   * const info = await this.redisService.getRateLimitInfo('auth:login:user123', 5);
   * console.log(`Remaining attempts: ${info.remaining}`);
   * ```
   *
   * @param key - The rate limit key
   * @param maxRequests - Maximum requests allowed
   * @returns Current rate limit info
   */
  async getRateLimitInfo(
    key: string,
    maxRequests: number,
  ): Promise<RateLimitInfo> {
    try {
      const rateLimitKey = `rate_limit:${key}`;
      const blockKey = `rate_limit:block:${key}`;

      // Check if blocked
      const isBlocked = await this.client.exists(blockKey);
      if (isBlocked) {
        const ttl = await this.client.ttl(blockKey);
        return {
          count: maxRequests,
          remaining: 0,
          resetTime: Date.now() + ttl * 1000,
          ttl,
          isBlocked: true,
        };
      }

      const [count, ttl] = await Promise.all([
        this.client.get(rateLimitKey),
        this.client.ttl(rateLimitKey),
      ]);

      const currentCount = parseInt(count || '0', 10);
      const remaining = Math.max(0, maxRequests - currentCount);

      return {
        count: currentCount,
        remaining,
        resetTime: ttl > 0 ? Date.now() + ttl * 1000 : Date.now(),
        ttl: ttl > 0 ? ttl : 0,
        isBlocked: false,
      };
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        'RedisService.getRateLimitInfo',
      );
      return {
        count: 0,
        remaining: maxRequests,
        resetTime: Date.now(),
        ttl: 0,
        isBlocked: false,
      };
    }
  }

  /**
   * Blocks a key for a specified duration (for severe violations).
   *
   * Example Usage:
   * ```typescript
   * await this.redisService.blockRateLimit('auth:login:user123', 3600); // Block for 1 hour
   * ```
   *
   * @param key - The key to block
   * @param blockDurationSeconds - How long to block in seconds
   * @returns Success status
   */
  async blockRateLimit(
    key: string,
    blockDurationSeconds: number,
  ): Promise<boolean> {
    try {
      const blockKey = `rate_limit:block:${key}`;
      return await this.setKey(blockKey, '1', blockDurationSeconds);
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        'RedisService.blockRateLimit',
      );
      return false;
    }
  }

  /**
   * Resets rate limit for a key.
   *
   * Example Usage:
   * ```typescript
   * await this.redisService.resetRateLimit('auth:login:user123');
   * ```
   *
   * @param key - The rate limit key to reset
   * @returns Number of keys deleted
   */
  async resetRateLimit(key: string): Promise<number> {
    try {
      const rateLimitKey = `rate_limit:${key}`;
      const blockKey = `rate_limit:block:${key}`;

      const deleted = await this.client.del(rateLimitKey, blockKey);

      if (deleted > 0) {
        this.logger.log(`Rate limit reset for key: ${key}`, 'RedisService');
      }

      return deleted;
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        'RedisService.resetRateLimit',
      );
      return 0;
    }
  }

  /**
   * Bulk check multiple rate limits (useful for complex operations).
   *
   * Example Usage:
   * ```typescript
   * const limits = await this.redisService.checkMultipleRateLimits([
   *   { key: 'wallet:transfer:user123', window: 60, limit: 10 },
   *   { key: 'global:transfer:daily', window: 86400, limit: 100 }
   * ]);
   * const allAllowed = limits.every(l => l.allowed);
   * ```
   *
   * @param checks - Array of rate limit checks to perform
   * @returns Array of results for each check
   */
  async checkMultipleRateLimits(
    checks: Array<{ key: string; window: number; limit: number }>,
  ): Promise<Array<{ key: string; allowed: boolean; info: RateLimitInfo }>> {
    try {
      const results = await Promise.all(
        checks.map(async (check) => {
          const result = await this.checkRateLimit(
            check.key,
            check.window,
            check.limit,
          );
          return {
            key: check.key,
            ...result,
          };
        }),
      );
      return results;
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        'RedisService.checkMultipleRateLimits',
      );
      return checks.map((check) => ({
        key: check.key,
        allowed: true,
        info: {
          count: 0,
          remaining: check.limit,
          resetTime: Date.now() + check.window * 1000,
          ttl: check.window,
          isBlocked: false,
        },
      }));
    }
  }

  // Add more utility methods as needed
}
