// src/common/guards/custom-throttler.guard.ts
import { Injectable, ExecutionContext, CanActivate } from '@nestjs/common';
// import { ThrottlerException } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { RedisService } from 'src/common/redis/redis.service';

@Injectable()
export class CustomThrottlerGuard implements CanActivate {
  constructor(
    private readonly redisService: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Check if throttling should be skipped
    const skipThrottle = this.reflector.getAllAndOverride<boolean>(
      'skipThrottle',
      [context.getHandler(), context.getClass()],
    );

    if (skipThrottle) {
      return true;
    }

    // Get custom limits from decorator or use defaults
    const handler = context.getHandler();
    const classRef = context.getClass();

    const limit =
      this.reflector.getAllAndOverride<number>('throttle_limit', [
        handler,
        classRef,
      ]) ?? 100;

    const ttl =
      this.reflector.getAllAndOverride<number>('throttle_ttl', [
        handler,
        classRef,
      ]) ?? 60;

    const key = this.generateKey(context, request);
    const { allowed, info } = await this.redisService.checkRateLimit(
      key,
      ttl,
      limit,
    );

    // Add rate limit headers
    response.header('X-RateLimit-Limit', limit.toString());
    response.header('X-RateLimit-Remaining', info.remaining.toString());
    response.header(
      'X-RateLimit-Reset',
      new Date(info.resetTime).toISOString(),
    );

    // if (!allowed) {
    //   response.header('Retry-After', info.ttl.toString());
    //   throw new ThrottlerException('Too Many Requests');
    // }

    return true;
  }

  protected generateKey(context: ExecutionContext, request: any): string {
    const user = request.user;
    const ip = this.getIp(request);
    const controller = context.getClass().name;
    const handler = context.getHandler().name;

    if (user?.id) {
      return `throttle:${controller}:${handler}:user:${user.id}`;
    }
    return `throttle:${controller}:${handler}:ip:${ip}`;
  }

  private getIp(request: any): string {
    return request.ips?.length ? request.ips[0] : request.ip;
  }
}
