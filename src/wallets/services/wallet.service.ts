// src/wallet/services/wallet.service.ts
import {
  Injectable,
  NotFoundException,
  Logger,
  // CACHE_MANAGER,
  Inject,
  UnauthorizedException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
// import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { WalletEntity } from '../entities/wallet.entity';
import {
  WalletDetailsResponseDto,
  WalletResponseDto,
} from '../dtos/wallet-response.dto';
import { TransactionEntity } from '../entities/transaction.entity';
import { WALLET_CACHE_CONFIG } from '../config/cache.config';
import {
  TransactionQueryDto,
  TransactionResponseDto,
  TransactionStatus,
  TransactionType,
} from '../dtos/transaction.dto';
import { DepositInstructionsResponseDto } from '../dtos/deposite.dto';
import { DepositInstructionEntity } from '../entities/deposit-instruction.entity';
import {
  ConversionRequestDto,
  ConversionResponseDto,
} from '../dtos/conversion.dto';
import { CountryEntity } from 'src/metadata/entities/country.entity';
import { RedisService } from 'src/common/redis/redis.service';
import { SupportedCountryResponseDto } from '../dtos/country-supported.dto';
import { PaginatedResponseDto } from '../dtos/pagination.dto';
import { BeneficiaryResponseDto } from '../dtos/beneficiary.dto';
import { BeneficiaryEntity } from '../entities/beneficiary.entity';
import { WalletFactory } from '../factories/wallet.factory';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private readonly CACHE_KEY_PREFIX = 'wallet:supported_countries';
  private readonly CACHE_PREFIX = 'wallet:transactions';
  private readonly CACHE_PREFIX_TRANSACTION = 'transactions';
  private readonly CACHE_PREFIX_BENEFICIARY = 'user:beneficiaries';
  private readonly CACHE_TTL = 300; // 5 minutes
  // private readonly CACHE_TTL = 24 * 60 * 60; // 24 hours

  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepository: Repository<WalletEntity>,
    // @Inject(CACHE_MANAGER)
    // private readonly cacheManager: Cache,
    @InjectRepository(TransactionEntity)
    @InjectRepository(DepositInstructionEntity)
    @InjectRepository(BeneficiaryEntity)
    @InjectRepository(CountryEntity)
    private readonly redisService: RedisService,
  ) {}

  async findAllByUserId(userId: string): Promise<any> {
    //   try {
    //     // Try to get from cache first
    //     const cacheKey = `${WALLET_CACHE_CONFIG.PREFIXES.USER_WALLETS}${userId}`;
    //     const cachedWallets =
    //       await this.cacheManager.get<WalletResponseDto[]>(cacheKey);
    //     if (cachedWallets) {
    //       this.logger.debug(`Cache hit for user wallets: ${userId}`);
    //       return cachedWallets;
    //     }
    //     // If not in cache, get from database
    //     const wallets = await this.walletRepository.find({
    //       where: { userId },
    //       order: { createdAt: 'DESC' },
    //     });
    //     if (!wallets.length) {
    //       this.logger.debug(`No wallets found for user: ${userId}`);
    //       return [];
    //     }
    //     // Transform to DTO
    //     const walletsDto = wallets.map((wallet) => this.toWalletDto(wallet));
    //     // Cache the result
    //     await this.cacheManager.set(cacheKey, walletsDto, this.CACHE_TTL);
    //     return walletsDto;
    //   } catch (error) {
    //     this.logger.error(`Error retrieving wallets for user ${userId}:`, error);
    //     throw error;
    //   }
  }

  private toWalletDto(wallet: WalletEntity): WalletResponseDto {
    return {
      id: wallet.id,
      userId: wallet.userId,
      currency: wallet.currency,
      balance: wallet.balance,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }

  async invalidateUserBeneficiariesCache(userId: string): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}:${userId}`;
    await this.redisService.deleteKey(cacheKey);
    this.logger.debug(`Invalidated beneficiaries cache for user ${userId}`);
  }
}
