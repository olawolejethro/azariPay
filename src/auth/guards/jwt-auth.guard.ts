// src/auth/guards/jwt-auth.guard.ts
import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from 'src/common/redis/redis.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First, validate token signature and expiration (passport strategy)
    const isValid = await super.canActivate(context);

    if (!isValid) {
      return false;
    }

    // Second, check if token is blacklisted
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedException('Token not provided');
    }

    try {
      // Decode token to get jti
      const decoded = this.jwtService.decode(token) as any;
      const jti = decoded?.jti;

      if (!jti) {
        throw new UnauthorizedException('Invalid token format');
      }

      // Check Redis blacklist
      const isBlacklisted = await this.redisService
        .getClient()
        .get(`blacklist:token:${jti}`);

      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid token');
    }
  }
}
