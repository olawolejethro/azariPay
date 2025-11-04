// src/wallet/guards/wallet-owner.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletEntity } from '../entities/wallet.entity';

@Injectable()
export class WalletOwnerGuard implements CanActivate {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepository: Repository<WalletEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const walletId = request.params.walletId;
    const userId = request.user.userId;

    if (!walletId || !userId) {
      throw new UnauthorizedException('Invalid request parameters');
    }

    const wallet = await this.walletRepository.findOne({
      where: { id: walletId },
    });

    if (!wallet) {
      return false;
    }

    if (wallet.userId !== userId) {
      throw new UnauthorizedException('Not authorized to access this wallet');
    }

    return true;
  }
}
