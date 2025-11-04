import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between } from 'typeorm';
import {
  CADTransactionEntity,
  CADTransactionType,
  CADTransactionStatus,
  CADTransactionSource,
} from '../entities/cad-transaction.entity';
import { CADWalletEntity } from '../entities/CADwallet.entity';
import { User } from '../../auth/entities/user.entity';
import { TransactionType } from '../entities/transaction.entity';

export interface CreateTransactionDto {
  userId: number;
  type: CADTransactionType;
  amount: number;
  source: CADTransactionSource;
  description?: string;
  referenceId?: string;
  externalTransactionId?: string;
  metadata?: Record<string, any>;
  feeAmount?: number;
  processedBy?: string;
  currency?: string; // Optional, default to 'CAD'
  walletId?: number; // Optional, used for manual transactions
  balanceBefore?: number; // Optional, used for manual transactions
  balanceAfter?: number; // Optional, used for manual transactions
  createdAt?: Date; // Optional, used for manual transactions
  updatedAt?: Date; // Optional, used for manual transactions
  completedAt?: Date; // Optional, used for manual transactions
  failedAt?: Date; // Optional, used for manual transactions
  aptPayStatus?: string; // Optional, used for manual transactions
  settledPayload?: any; // Optional, used for manual transactions
  failedPayload?: any; // Optional, used for manual transactions
  fee?: {
    type: string;
    amount: number;
    currency?: string; // Optional, default to 'CAD'
    description?: string;
  };
  reference?: string; // Optional, used for manual transactions
}

export interface TransactionFilters {
  userId?: number;
  type?: CADTransactionType;
  status?: CADTransactionStatus;
  source?: CADTransactionSource;
  startDate?: Date;
  endDate?: Date;
  referenceId?: string;
  externalTransactionId?: string;
  currency?: string; // Optional, default to 'CAD'
  refrenceId?: string; // Optional, used for manual transactions
}

@Injectable()
export class CADTransactionService {
  private readonly logger = new Logger(CADTransactionService.name);

  constructor(
    @InjectRepository(CADTransactionEntity)
    private transactionRepository: Repository<CADTransactionEntity>,
    @InjectRepository(CADWalletEntity)
    private walletRepository: Repository<CADWalletEntity>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private dataSource: DataSource,
  ) {}

  /**
   * Create a new CAD transaction with wallet update
   */
  async createTransaction(
    createDto: CreateTransactionDto,
  ): Promise<CADTransactionEntity> {
    return await this.dataSource.transaction(async (manager) => {
      // Get user's wallet
      const wallet = await manager.findOne(CADWalletEntity, {
        where: { userId: createDto.userId },
      });

      if (!wallet) {
        throw new NotFoundException(
          `CAD wallet not found for user ${createDto.userId}`,
        );
      }

      const currentBalance = parseFloat(wallet.balance.toString());
      const transactionAmount = parseFloat(createDto.amount.toFixed(2));
      let newBalance: number;

      // Calculate new balance based on transaction type
      if (createDto.type === CADTransactionType.CREDIT) {
        newBalance = parseFloat(
          (currentBalance + transactionAmount).toFixed(2),
        );
      } else {
        // Check if user has sufficient balance for debit
        if (currentBalance < transactionAmount) {
          throw new BadRequestException(
            `Insufficient balance. Current: ${currentBalance}, Required: ${transactionAmount}`,
          );
        }
        newBalance = parseFloat(
          (currentBalance - transactionAmount).toFixed(2),
        );
      }

      // Create transaction record
      const transaction = manager.create(CADTransactionEntity, {
        userId: createDto.userId,
        walletId: wallet.id,
        type: createDto.type,
        amount: transactionAmount,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        status: CADTransactionStatus.COMPLETED,
        source: createDto.source,
        description: createDto.description,
        referenceId: createDto.referenceId,
        externalTransactionId: createDto.externalTransactionId,
        metadata: createDto.metadata,
        feeAmount: createDto.feeAmount || 0,
        processedBy: createDto.processedBy || 'system',
      });

      // Save transaction first
      const savedTransaction = await manager.save(
        CADTransactionEntity,
        transaction,
      );

      // Update wallet balance
      wallet.balance = newBalance;
      await manager.save(CADWalletEntity, wallet);

      this.logger.log(
        `💳 ${createDto.type.toUpperCase()} transaction created for user ${createDto.userId}: ` +
          `${createDto.type === CADTransactionType.CREDIT ? '+' : '-'}${transactionAmount} ` +
          `(${currentBalance} → ${newBalance}) - ${createDto.source} - Transaction ID: ${savedTransaction.id}`,
      );

      return savedTransaction;
    });
  }

  /**
   * Credit user's wallet
   */
  async creditWallet(
    userId: number,
    amount: number,
    source: CADTransactionSource,
    description?: string,
    referenceId?: string,
    externalTransactionId?: string,
    metadata?: Record<string, any>,
  ): Promise<CADTransactionEntity> {
    return await this.createTransaction({
      userId,
      type: CADTransactionType.CREDIT,
      amount,
      source,
      description,
      referenceId,
      externalTransactionId,
      metadata,
    });
  }

  /**
   * Debit user's wallet
   */
  async debitWallet(
    userId: number,
    amount: number,
    source: CADTransactionSource,
    description?: string,
    referenceId?: string,
    externalTransactionId?: string,
    metadata?: Record<string, any>,
  ): Promise<CADTransactionEntity> {
    return await this.createTransaction({
      userId,
      type: CADTransactionType.DEBIT,
      amount,
      source,
      description,
      referenceId,
      externalTransactionId,
      metadata,
    });
  }

  /**
   * Get user's transaction history
   */
  async getUserTransactions(
    userId: number,
    filters?: Partial<TransactionFilters>,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ transactions: CADTransactionEntity[]; total: number }> {
    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.wallet', 'wallet')
      .where('transaction.userId = :userId', { userId });

    // Apply filters
    if (filters) {
      if (filters.type) {
        queryBuilder.andWhere('transaction.type = :type', {
          type: filters.type,
        });
      }
      if (filters.status) {
        queryBuilder.andWhere('transaction.status = :status', {
          status: filters.status,
        });
      }
      if (filters.source) {
        queryBuilder.andWhere('transaction.source = :source', {
          source: filters.source,
        });
      }
      if (filters.startDate && filters.endDate) {
        queryBuilder.andWhere(
          'transaction.createdAt BETWEEN :startDate AND :endDate',
          {
            startDate: filters.startDate,
            endDate: filters.endDate,
          },
        );
      }
      if (filters.referenceId) {
        queryBuilder.andWhere('transaction.referenceId = :referenceId', {
          referenceId: filters.referenceId,
        });
      }
      if (filters.externalTransactionId) {
        queryBuilder.andWhere(
          'transaction.externalTransactionId = :externalTransactionId',
          {
            externalTransactionId: filters.externalTransactionId,
          },
        );
      }
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Get transactions with pagination
    const transactions = await queryBuilder
      .orderBy('transaction.createdAt', 'DESC')
      .limit(limit)
      .offset(offset)
      .getMany();

    return { transactions, total };
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(id: number): Promise<CADTransactionEntity> {
    const transaction = await this.transactionRepository.findOne({
      where: { id },
      relations: ['user', 'wallet'],
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    return transaction;
  }

  /**
   * Get transaction by reference ID
   */
  async getTransactionByReferenceId(
    referenceId: string,
  ): Promise<CADTransactionEntity | null> {
    return await this.transactionRepository.findOne({
      where: { referenceId },
      relations: ['user', 'wallet'],
    });
  }

  /**
   * Get transaction by external transaction ID (APT Pay ID)
   */
  async getTransactionByExternalId(
    externalTransactionId: string,
  ): Promise<CADTransactionEntity | null> {
    return await this.transactionRepository.findOne({
      where: { externalTransactionId },
      relations: ['user', 'wallet'],
    });
  }

  /**
   * Get user's wallet balance and recent transactions
   */
  async getWalletSummary(userId: number): Promise<{
    balance: number;
    currency: string;
    recentTransactions: CADTransactionEntity[];
    totalTransactions: number;
  }> {
    const wallet = await this.walletRepository.findOne({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException(`CAD wallet not found for user ${userId}`);
    }

    const { transactions, total } = await this.getUserTransactions(
      userId,
      {},
      10,
      0,
    );

    return {
      balance: parseFloat(wallet.balance.toString()),
      currency: 'CAD',
      recentTransactions: transactions,
      totalTransactions: total,
    };
  }

  /**
   * Get transaction statistics for a user
   */
  async getUserTransactionStats(
    userId: number,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalCredits: number;
    totalDebits: number;
    transactionCount: number;
    averageTransaction: number;
  }> {
    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.status = :status', {
        status: CADTransactionStatus.COMPLETED,
      });

    if (startDate && endDate) {
      queryBuilder.andWhere(
        'transaction.createdAt BETWEEN :startDate AND :endDate',
        {
          startDate,
          endDate,
        },
      );
    }

    const transactions = await queryBuilder.getMany();

    const stats = transactions.reduce(
      (acc, transaction) => {
        if (transaction.type === CADTransactionType.CREDIT) {
          acc.totalCredits += parseFloat(transaction.amount.toString());
        } else {
          acc.totalDebits += parseFloat(transaction.amount.toString());
        }
        acc.transactionCount++;
        return acc;
      },
      { totalCredits: 0, totalDebits: 0, transactionCount: 0 },
    );

    return {
      ...stats,
      averageTransaction:
        stats.transactionCount > 0
          ? (stats.totalCredits + stats.totalDebits) / stats.transactionCount
          : 0,
    };
  }

  /**
   * Create a pending transaction without updating wallet balance
   */
  async createPendingTransaction(
    createDto: CreateTransactionDto,
  ): Promise<CADTransactionEntity> {
    // Get user's wallet for validation
    const wallet = await this.walletRepository.findOne({
      where: { userId: createDto.userId },
    });

    if (!wallet) {
      throw new NotFoundException(
        `CAD wallet not found for user ${createDto.userId}`,
      );
    }

    const currentBalance = parseFloat(wallet.balance.toString());
    const transactionAmount = parseFloat(createDto.amount.toFixed(2));

    // Create pending transaction record (no wallet update)
    const transaction = this.transactionRepository.create({
      userId: createDto.userId,
      walletId: wallet.id,
      type: createDto.type,
      amount: transactionAmount,
      balanceBefore: currentBalance,
      balanceAfter: currentBalance, // No change yet
      status: CADTransactionStatus.PENDING,
      source: createDto.source,
      description: createDto.description,
      referenceId: createDto.referenceId,
      externalTransactionId: createDto.externalTransactionId,
      metadata: createDto.metadata,
      feeAmount: createDto.feeAmount || 0,
      processedBy: createDto.processedBy || 'system',
    });

    const savedTransaction = await this.transactionRepository.save(transaction);

    this.logger.log(
      `📋 PENDING ${createDto.type.toUpperCase()} transaction created for user ${createDto.userId}: ` +
        `${transactionAmount} - ${createDto.source} (ID: ${savedTransaction.id})`,
    );

    return savedTransaction;
  }

  /**
   * Complete a pending transaction and update wallet balance
   */
  async completeTransaction(
    transactionId: number,
    completionData?: {
      completedAt?: Date;
      aptPayStatus?: string;
      settledPayload?: any;
    },
  ): Promise<CADTransactionEntity> {
    return await this.dataSource.transaction(async (manager) => {
      // Get the pending transaction
      const transaction = await manager.findOne(CADTransactionEntity, {
        where: { id: transactionId },
        relations: ['wallet'],
      });

      if (!transaction) {
        throw new NotFoundException(
          `Transaction with ID ${transactionId} not found`,
        );
      }

      if (transaction.status !== CADTransactionStatus.PENDING) {
        throw new BadRequestException(
          `Transaction ${transactionId} is not in PENDING status`,
        );
      }

      // Get current wallet balance
      const wallet = await manager.findOne(CADWalletEntity, {
        where: { id: transaction.walletId },
      });

      if (!wallet) {
        throw new NotFoundException(
          `Wallet not found for transaction ${transactionId}`,
        );
      }

      const currentBalance = parseFloat(wallet.balance.toString());
      const transactionAmount = parseFloat(transaction.amount.toString());
      let newBalance: number;

      // Calculate new balance based on transaction type
      if (transaction.type === CADTransactionType.CREDIT) {
        newBalance = parseFloat(
          (currentBalance + transactionAmount).toFixed(2),
        );
      } else {
        // Check if user has sufficient balance for debit
        if (currentBalance < transactionAmount) {
          throw new BadRequestException(
            `Insufficient balance. Current: ${currentBalance}, Required: ${transactionAmount}`,
          );
        }
        newBalance = parseFloat(
          (currentBalance - transactionAmount).toFixed(2),
        );
      }

      // Update transaction record
      transaction.balanceBefore = currentBalance;
      transaction.balanceAfter = newBalance;
      transaction.status = CADTransactionStatus.COMPLETED;
      transaction.updatedAt = completionData?.completedAt || new Date();

      // Update metadata with completion data
      if (completionData) {
        transaction.metadata = {
          ...transaction.metadata,
          completedAt: completionData.completedAt?.toISOString(),
          aptPayStatus: completionData.aptPayStatus,
          settledPayload: completionData.settledPayload,
        };
      }

      const updatedTransaction = await manager.save(transaction);

      // Update wallet balance
      wallet.balance = newBalance;
      await manager.save(CADWalletEntity, wallet);

      this.logger.log(
        `✅ ${transaction.type.toUpperCase()} transaction completed for user ${transaction.userId}: ` +
          `${transaction.type === CADTransactionType.CREDIT ? '+' : '-'}${transactionAmount} ` +
          `(${currentBalance} → ${newBalance}) - ID: ${transactionId}`,
      );

      return updatedTransaction;
    });
  }

  /**
   * Fail a pending transaction (no wallet update)
   */
  async failTransaction(
    transactionId: number,
    failureData?: {
      failedAt?: Date;
      failureReason?: string;
      errorCode?: string;
      errorDescription?: string;
      aptPayStatus?: string;
      failedPayload?: any;
    },
  ): Promise<CADTransactionEntity> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction with ID ${transactionId} not found`,
      );
    }

    if (transaction.status !== CADTransactionStatus.PENDING) {
      throw new BadRequestException(
        `Transaction ${transactionId} is not in PENDING status`,
      );
    }

    // Update transaction record to failed
    transaction.status = CADTransactionStatus.FAILED;
    transaction.updatedAt = failureData?.failedAt || new Date();

    // Update metadata with failure data
    if (failureData) {
      transaction.metadata = {
        ...transaction.metadata,
        failedAt: failureData.failedAt?.toISOString(),
        failureReason: failureData.failureReason,
        errorCode: failureData.errorCode,
        errorDescription: failureData.errorDescription,
        aptPayStatus: failureData.aptPayStatus,
        failedPayload: failureData.failedPayload,
      };
    }

    const updatedTransaction =
      await this.transactionRepository.save(transaction);

    this.logger.log(
      `❌ ${transaction.type.toUpperCase()} transaction failed for user ${transaction.userId}: ` +
        `${transaction.amount} - ${failureData?.failureReason || 'Unknown reason'} (ID: ${transactionId})`,
    );

    return updatedTransaction;
  }

  /**
   * Update transaction status
   */
  async updateTransactionStatus(
    id: number,
    status: CADTransactionStatus,
    metadata?: Record<string, any>,
  ): Promise<CADTransactionEntity> {
    const transaction = await this.transactionRepository.findOne({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    // Update status
    transaction.status = status;

    // Update processed timestamp based on status
    if (status === CADTransactionStatus.COMPLETED) {
      transaction.updatedAt = new Date();
    } else if (status === CADTransactionStatus.FAILED) {
      transaction.updatedAt = new Date();
    }

    // Update metadata if provided
    if (metadata) {
      transaction.metadata = {
        ...transaction.metadata,
        ...metadata,
        statusUpdatedAt: new Date().toISOString(),
      };
    }

    const updatedTransaction =
      await this.transactionRepository.save(transaction);

    this.logger.log(
      `📝 Transaction status updated for ID ${id}: → ${status} ` +
        `(User: ${transaction.userId})`,
    );

    return updatedTransaction;
  }

  // Add this to your CADTransactionService

  // In your CADTransactionService
  async getUserTransactionHistory(
    userId: number,
    options: {
      type?: string;
      status?: string;
      startDate?: Date;
      endDate?: Date;
      search?: string;
      page: number;
      limit: number;
    },
  ): Promise<{ transactions: any[]; total: number }> {
    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId });

    // Apply filters
    if (options.type) {
      queryBuilder.andWhere('transaction.type = :type', { type: options.type });
    }

    if (options.status) {
      queryBuilder.andWhere('transaction.status = :status', {
        status: options.status,
      });
    }

    if (options.search) {
      const searchTerm = `%${options.search.toLowerCase()}%`;
      queryBuilder.andWhere(
        '(LOWER(transaction.description) LIKE :search OR ' +
          'LOWER(transaction.referenceId) LIKE :search OR ' +
          'LOWER(transaction.externalTransactionId) LIKE :search)',
        { search: searchTerm },
      );
    }

    if (options.startDate) {
      queryBuilder.andWhere('transaction.createdAt >= :startDate', {
        startDate: options.startDate,
      });
    }

    if (options.endDate) {
      queryBuilder.andWhere('transaction.createdAt <= :endDate', {
        endDate: options.endDate,
      });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Get transactions with pagination
    const offset = (options.page - 1) * options.limit;
    const rawTransactions = await queryBuilder
      .orderBy('transaction.createdAt', 'DESC')
      .limit(options.limit)
      .offset(offset)
      .getMany();

    // Format transactions
    const transactions = rawTransactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: Number(parseFloat(transaction.amount.toString()).toFixed(2)),
      status: transaction.status,
      source: transaction.source,
      description: transaction.description,
      referenceId: transaction.referenceId,
      externalTransactionId: transaction.externalTransactionId,
      balanceBefore: Number(
        parseFloat(transaction.balanceBefore?.toString() || '0').toFixed(2),
      ),
      balanceAfter: Number(
        parseFloat(transaction.balanceAfter?.toString() || '0').toFixed(2),
      ),
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    }));

    return { transactions, total };
  }
}
