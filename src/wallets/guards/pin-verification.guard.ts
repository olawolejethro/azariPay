// src/wallet/guards/pin-verification.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class PinVerificationGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const pin = request.body.pin;

    if (!pin) {
      throw new UnauthorizedException('PIN is required');
    }

    // In a real application, you would verify the PIN against the user's stored PIN
    // This is just a placeholder implementation
    try {
      const userPin = await this.getUserPin(request.user.userId);
      const isValid = await bcrypt.compare(pin, userPin);

      if (!isValid) {
        throw new UnauthorizedException('Invalid PIN');
      }

      return true;
    } catch (error) {
      throw new UnauthorizedException('PIN verification failed');
    }
  }

  private async getUserPin(userId: string): Promise<string> {
    // In a real application, this would fetch the user's hashed PIN from the database
    // This is just a placeholder
    return '$2b$10$somehashedpin';
  }
}
