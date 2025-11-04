// src/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const user = await this.usersRepository.findOne({
      where: { id: payload.sub },
      select: ['id', 'phoneNumber', 'tokenVersion'], // Include tokenVersion
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if token version matches
    if (payload.tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedException('Token has been revoked');
    }

    return {
      userId: user.id,
      phoneNumber: user.phoneNumber,
    };
  }
}
