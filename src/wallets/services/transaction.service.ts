// src/wallets/services/transaction.service.ts

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, DeepPartial, Repository } from 'typeorm';
import {
  TransactionCurrency,
  TransactionEntity,
  TransactionSource,
} from '../entities/transaction.entity';
import { TransactionType } from '../entities/transaction.entity';
import { TransactionStatus } from '../entities/transaction.entity';
import { WalletEntity } from '../entities/wallet.entity';
import { NGNWalletEntity } from '../entities/NGNwallet.entity';
import { CADWalletEntity } from '../entities/CADwallet.entity';
import {
  CreateTransactionDto,
  TransactionFilters,
} from './cad-transaction.service';
import { User } from 'src/auth/entities/user.entity';
import {
  StatementFormat,
  StatementRequestDto,
  WalletType,
} from '../dtos/statement-request.dto';
import * as path from 'path';
import * as fs from 'fs';
import { AuthService } from 'src/auth/services/auth.service';
// import * as PDFDocument from 'pdfkit';
import { Response } from 'express';

// Import PDFKit types for type annotations
import type PDFKit from 'pdfkit';
import { EncryptionService } from 'src/common/encryption/encryption.service';

const PDFDocument = require('pdfkit');
interface RecordTransactionParams {
  wallet: WalletEntity;
  amount: number;
  fee: number;
  type: TransactionType;
  status?: TransactionStatus;
  reference: string;
  description?: string;
  metadata?: {
    payerDetails?: {
      accountNumber?: string;
      payerName?: string;
      paymentMethod?: string;
      referenceNumber?: string;
    };
    fundingReference?: string;
    originalPayload?: any;
  };
}
@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,

    @InjectRepository(CADWalletEntity)
    private readonly cadWalletRepository: Repository<CADWalletEntity>,

    @InjectRepository(NGNWalletEntity)
    private readonly ngnWalletRepository: Repository<NGNWalletEntity>,
    private readonly userService: AuthService,
    private readonly encryptingService: EncryptionService,
    private dataSource: DataSource,

    // Inject DataSource for transactions
  ) {}

  async updateTransactionStatus(
    id: string,
    status: TransactionStatus,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.transactionRepo.update(id, {
      status: status as any,
      metadata: metadata ? { ...metadata } : undefined,
      updatedAt: new Date(),
    });
  }

  async getTransactions(
    walletId: string,
    options?: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
      type?: TransactionType;
      status?: TransactionStatus;
    },
  ): Promise<{ transactions: TransactionEntity[]; total: number }> {
    const queryBuilder = this.transactionRepo
      .createQueryBuilder('transaction')
      .where('transaction.walletId = :walletId', { walletId });

    if (options?.startDate) {
      queryBuilder.andWhere('transaction.timestamp >= :startDate', {
        startDate: options.startDate,
      });
    }

    if (options?.endDate) {
      queryBuilder.andWhere('transaction.timestamp <= :endDate', {
        endDate: options.endDate,
      });
    }

    if (options?.type) {
      queryBuilder.andWhere('transaction.type = :type', { type: options.type });
    }

    if (options?.status) {
      queryBuilder.andWhere('transaction.status = :status', {
        status: options.status,
      });
    }

    const [transactions, total] = await queryBuilder
      .orderBy('transaction.timestamp', 'DESC')
      .skip(options?.offset || 0)
      .take(options?.limit || 10)
      .getManyAndCount();

    return { transactions, total };
  }

  // async getTransactionById(id: string): Promise<TransactionEntity | null> {
  // return this.transactionRepo.findOne({ where: { id } });
  // }

  async createTransaction(transactionData: {
    NgnWalletId?: number;
    userId: number;
    type: string;
    amount: number;
    fee?: number;
    reference: string;
    status?: string;
    description: string;
    currency: TransactionCurrency;
    processedBy?: string;
    source: TransactionSource;
    externalTransactionId?: string;
    metadata?: any;
  }): Promise<TransactionEntity> {
    try {
      const transaction = new TransactionEntity();

      // Set transaction properties
      if (transactionData.NgnWalletId !== undefined) {
        transaction.ngnWalletId = transactionData.NgnWalletId;
      }
      transaction.userId = transactionData.userId;
      transaction.type = transactionData.type as TransactionType;
      transaction.amount = transactionData.amount;
      transaction.fee = transactionData.fee ?? 0;
      transaction.reference = transactionData.reference;
      transaction.referenceHash = this.encryptingService.hash(
        transactionData.reference,
      );
      transaction.status =
        (transactionData.status as TransactionStatus) ??
        TransactionStatus.COMPLETED;
      transaction.description = transactionData.description;
      transaction.metadata = transactionData.metadata;

      // Save to database
      const savedTransaction = await this.transactionRepo.save(transaction);

      this.logger.log('Transaction created successfully', {
        reference: transactionData.reference,
        type: transactionData.type,
        amount: transactionData.amount,
      });

      return savedTransaction;
    } catch (error) {
      this.logger.error('Failed to create transaction', {
        error: error.message,
        reference: transactionData.reference,
      });

      throw new Error(`Failed to create transaction: ${error.message}`);
    }
  }

  async findByReference(reference: string): Promise<TransactionEntity | null> {
    return this.transactionRepo.findOne({
      where: { reference },
    });
  }

  async getTransactionHistory(
    userId: number,
    options: {
      type?: TransactionType;
      status?: TransactionStatus;
      currency?: TransactionCurrency;
      source?: TransactionSource;
      startDate?: Date;
      endDate?: Date;
      search?: string;
      page: number;
      limit: number;
      sortBy?: 'createdAt' | 'amount' | 'balanceAfter';
      sortOrder?: 'ASC' | 'DESC';
    },
  ): Promise<{ transactions: TransactionEntity[]; total: number }> {
    try {
      const {
        type,
        status,
        currency,
        source,
        startDate,
        endDate,
        search,
        page,
        limit,
        sortBy = 'createdAt',
        sortOrder = 'DESC',
      } = options;

      // Create query builder with both wallet joins
      const queryBuilder = this.transactionRepo
        .createQueryBuilder('transaction')
        .leftJoinAndSelect('transaction.ngnWallet', 'ngnWallet')
        .leftJoinAndSelect('transaction.cadWallet', 'cadWallet')
        .leftJoinAndSelect('transaction.user', 'user')
        .where('transaction.userId = :userId', { userId });

      // Filter by transaction type if provided
      if (type) {
        queryBuilder.andWhere('transaction.type = :type', { type });
      }

      // Filter by status if provided
      if (status) {
        queryBuilder.andWhere('transaction.status = :status', { status });
      }

      // Filter by currency if provided
      if (currency) {
        queryBuilder.andWhere('transaction.currency = :currency', { currency });
      }

      // Filter by source if provided
      if (source) {
        queryBuilder.andWhere('transaction.source = :source', { source });
      }

      // Filter by date range if provided
      if (startDate) {
        queryBuilder.andWhere('transaction.createdAt >= :startDate', {
          startDate,
        });
      }

      if (endDate) {
        // Add one day to include the end date fully
        const adjustedEndDate = new Date(endDate);
        adjustedEndDate.setDate(adjustedEndDate.getDate() + 1);
        queryBuilder.andWhere('transaction.createdAt < :endDate', {
          endDate: adjustedEndDate,
        });
      }

      // Enhanced search functionality
      if (search && search.trim() !== '') {
        queryBuilder.andWhere(
          '(' +
            // ✅ Non-encrypted fields - can search with ILIKE
            'transaction.description ILIKE :search OR ' +
            'CAST(transaction.amount AS TEXT) ILIKE :search OR ' +
            'CAST(transaction.currency AS TEXT) ILIKE :search OR ' +
            'CAST(transaction.source AS TEXT) ILIKE :search OR ' +
            'CAST(transaction.status AS TEXT) ILIKE :search OR ' +
            'CAST(transaction.type AS TEXT) ILIKE :search OR ' +
            'CAST(transaction.id AS TEXT) ILIKE :search' +
            ')',
          { search: `%${search}%` },
        );
      }

      // Get total count before pagination
      const total = await queryBuilder.getCount();

      // Add sorting
      queryBuilder.orderBy(`transaction.${sortBy}`, sortOrder);

      // Add secondary sort for consistency
      if (sortBy !== 'createdAt') {
        queryBuilder.addOrderBy('transaction.createdAt', 'DESC');
      }

      // Add pagination
      queryBuilder.skip((page - 1) * limit).take(limit);

      const transactions = await queryBuilder.getMany();

      // Format transactions with enhanced data
      const formattedTransactions = transactions.map((transaction) => ({
        ...transaction,
        // Add computed fields
        isCredit: transaction.type === TransactionType.CREDIT,
        isDebit: transaction.type === TransactionType.DEBIT,
        isPending: transaction.status === TransactionStatus.PENDING,
        isCompleted: transaction.status === TransactionStatus.COMPLETED,
        isFailed: transaction.status === TransactionStatus.FAILED,
        isCAD: transaction.currency === TransactionCurrency.CAD,
        isNGN: transaction.currency === TransactionCurrency.NGN,

        // Wallet information
        walletInfo: {
          walletId:
            transaction.currency === TransactionCurrency.CAD
              ? transaction.cadWalletId
              : transaction.ngnWalletId,
          walletType: transaction.currency,
          currentBalance: transaction.balanceAfter,
          previousBalance: transaction.balanceBefore,
          balanceChange: transaction.balanceAfter - transaction.balanceBefore,
        },

        // Time information

        // Clean metadata
        metadata: transaction.metadata || {},
      }));

      return {
        transactions: formattedTransactions,
        total,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching transaction history for user ${userId}:`,
        error,
      );
      throw new Error(`Failed to fetch transaction history: ${error.message}`);
    }
  }

  async findAllTransactions(options: {
    page: number;
    limit: number;
    sortBy: string;
    sortOrder: 'ASC' | 'DESC';
  }): Promise<{ transactions: TransactionEntity[]; total: number }> {
    try {
      const { page, limit, sortBy, sortOrder } = options;

      // Validate sort field to prevent SQL injection
      const allowedSortFields = ['createdAt', 'amount', 'type', 'status', 'id'];
      const validSortBy = allowedSortFields.includes(sortBy)
        ? sortBy
        : 'createdAt';

      // Create query builder
      const queryBuilder = this.transactionRepo
        .createQueryBuilder('transaction')
        .leftJoinAndSelect('transaction.wallet', 'wallet')
        .leftJoinAndSelect('transaction.user', 'user');

      // Get total count
      const total = await queryBuilder.getCount();

      // Add sorting and pagination
      const transactions = await queryBuilder
        .orderBy(`transaction.${validSortBy}`, sortOrder)
        .skip((page - 1) * limit)
        .take(limit)
        .getMany();

      return { transactions, total };
    } catch (error) {
      this.logger.error('Error finding all transactions', error);
      throw error;
    }
  }
  async deleteByUserId(userId: number): Promise<any> {
    try {
      return await this.transactionRepo.delete({ userId });
    } catch (error) {
      this.logger.error(
        `Error in deleteByUserId: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to delete transactions: ${error.message}`);
    }
  }

  async updateByUserId(
    userId: number,
    updateData: Partial<CADWalletEntity>,
  ): Promise<any> {
    try {
      // Log what's being updated
      this.logger.log(`Updating transactions for user ${userId}`, {
        fieldsToUpdate: Object.keys(updateData),
      });

      // Perform the update
      return await this.cadWalletRepository.update({ userId }, updateData);
    } catch (error) {
      this.logger.error(
        `Error updating transactions: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to update transactions: ${error.message}`);
    }
  }

  async updateTransaction(
    userId: number,
    updateData: Partial<TransactionEntity>,
  ): Promise<any> {
    try {
      // Log what's being updated
      this.logger.log(`Updating transactions for user ${userId}`, {
        fieldsToUpdate: Object.keys(updateData),
      });

      // Perform the update
      return await this.transactionRepo.update({ id: userId }, updateData);
    } catch (error) {
      this.logger.error(
        `Error updating transactions: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to update transactions: ${error.message}`);
    }
  }

  /**
   * Create a new transaction with wallet update
   */
  async createTransactionCAD(
    createDto: CreateTransactionDto,
  ): Promise<TransactionEntity> {
    return await this.dataSource.transaction(async (manager) => {
      let wallet: CADWalletEntity | NGNWalletEntity;
      let currentBalance: number;
      let newBalance: number;

      // Get the appropriate wallet based on currency
      if (createDto.currency === TransactionCurrency.CAD) {
        wallet = await manager.findOne(CADWalletEntity, {
          where: { userId: createDto.userId },
        });
        if (!wallet) {
          throw new NotFoundException(
            `CAD wallet not found for user ${createDto.userId}`,
          );
        }
      } else {
        wallet = await manager.findOne(NGNWalletEntity, {
          where: { userId: createDto.userId },
        });
        if (!wallet) {
          throw new NotFoundException(
            `NGN wallet not found for user ${createDto.userId}`,
          );
        }
      }

      currentBalance = parseFloat(wallet.balance.toString());
      const transactionAmount = parseFloat(createDto.amount.toFixed(2));

      // If you're still having TypeORM issues, try direct instantiation:
      const transaction = new TransactionEntity();
      transaction.userId = createDto.userId;
      transaction.type = createDto.type as unknown as TransactionType;
      transaction.amount = transactionAmount;
      transaction.currency = createDto.currency as TransactionCurrency;
      transaction.source = createDto.source as unknown as TransactionSource;

      transaction.balanceBefore = currentBalance;
      transaction.balanceAfter = newBalance;
      transaction.status = TransactionStatus.COMPLETED;
      transaction.description = createDto.description;
      transaction.reference = createDto.reference;
      transaction.externalTransactionId = createDto.externalTransactionId;
      transaction.metadata = createDto.metadata;
      transaction.fee =
        typeof createDto.fee === 'number'
          ? createDto.fee
          : typeof createDto.fee === 'object' &&
              createDto.fee !== null &&
              'amount' in createDto.fee
            ? Number(createDto.fee.amount)
            : 0;
      transaction.processedBy = createDto.processedBy || 'system';

      // Set wallet ID based on currency
      if (createDto.currency === TransactionCurrency.CAD) {
        transaction.cadWalletId = wallet.id;
      } else {
        transaction.ngnWalletId = wallet.id;
      }

      const savedTransaction = await manager.save(transaction);
      return savedTransaction;
    });
  }

  /**
   * Credit user's wallet (CAD or NGN)
   */
  async creditWallet(
    userId: number,
    amount: number,
    currency: TransactionCurrency,
    source: TransactionSource,
    description?: string,
    reference?: string,
    externalTransactionId?: string,
    metadata?: Record<string, any>,
  ): Promise<TransactionEntity> {
    return await this.createTransaction({
      userId,
      type: TransactionType.CREDIT,
      amount,
      currency,
      source,
      description,
      reference,
      externalTransactionId,
      metadata,
    });
  }

  /**
   * Debit user's wallet (CAD or NGN)
   */
  async debitWallet(
    userId: number,
    amount: number,
    currency: TransactionCurrency,
    source: TransactionSource,
    description?: string,
    reference?: string,
    externalTransactionId?: string,
    metadata?: Record<string, any>,
  ): Promise<TransactionEntity> {
    return await this.createTransaction({
      userId,
      type: TransactionType.DEBIT,
      amount,
      currency,
      source,
      description,
      reference,
      externalTransactionId,
      metadata,
    });
  }

  /**
   * Get user's transaction history with filters
   */
  async getUserTransactions(
    userId: number,
    filters?: Partial<TransactionFilters>,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ transactions: TransactionEntity[]; total: number }> {
    const queryBuilder = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.cadWallet', 'cadWallet')
      .leftJoinAndSelect('transaction.ngnWallet', 'ngnWallet')
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
      if (filters.currency) {
        queryBuilder.andWhere('transaction.currency = :currency', {
          currency: filters.currency,
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
        const referenceHash = this.encryptingService.hash(filters.referenceId);
        queryBuilder.andWhere('transaction.referenceHash = :referenceHash', {
          referenceHash,
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
   * Get user transaction history with search and filters (for API endpoint)
   */
  async getUserTransactionHistory(
    userId: number,
    options: {
      type?: string;
      status?: string;
      currency?: string;
      startDate?: Date;
      endDate?: Date;
      search?: string;
      page: number;
      limit: number;
    },
  ): Promise<{ transactions: any[]; total: number }> {
    const queryBuilder = this.transactionRepo
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

    if (options.currency) {
      queryBuilder.andWhere('transaction.currency = :currency', {
        currency: options.currency,
      });
    }

    if (options.search) {
      const searchTerm = `%${options.search.toLowerCase()}%`;
      queryBuilder.andWhere(
        '(LOWER(transaction.description) LIKE :search OR ' +
          'LOWER(transaction.reference) LIKE :search OR ' +
          'LOWER(transaction.externalTransactionId) LIKE :search)',
        { search: searchTerm },
      );
    }

    if (options.startDate) {
      queryBuilder.andWhere('DATE(transaction.createdAt) >= :startDate', {
        startDate: options.startDate,
      });
    }

    if (options.endDate) {
      queryBuilder.andWhere('DATE(transaction.createdAt) <= :endDate', {
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
      currency: transaction.currency,
      status: transaction.status,
      source: transaction.source,
      description: transaction.description,
      reference: transaction.reference,
      externalTransactionId: transaction.externalTransactionId,
      balanceBefore: Number(
        parseFloat(transaction.balanceBefore?.toString() || '0').toFixed(2),
      ),
      balanceAfter: Number(
        parseFloat(transaction.balanceAfter?.toString() || '0').toFixed(2),
      ),
      fee: Number(parseFloat(transaction.fee?.toString() || '0').toFixed(2)),
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    }));

    return { transactions, total };
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(id: number): Promise<TransactionEntity> {
    const transaction = await this.transactionRepo.findOne({
      where: { id },
      relations: ['user', 'cadWallet', 'ngnWallet'],
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    return transaction;
  }

  /**
   * Get transaction by reference ID
   */
  async getTransactionByReference(
    reference: string,
  ): Promise<TransactionEntity | null> {
    return await this.transactionRepo.findOne({
      where: { reference },
      relations: ['user', 'cadWallet', 'ngnWallet'],
    });
  }

  /**
   * Get transaction by external transaction ID
   */
  async getTransactionByExternalId(
    externalTransactionId: string,
  ): Promise<TransactionEntity | null> {
    console.log(externalTransactionId, 'externalTransactionId');
    return await this.transactionRepo.findOne({
      where: { externalTransactionId },
      relations: ['user', 'cadWallet', 'ngnWallet'],
    });
  }

  /**
   * Get wallet summary for specific currency
   */
  async getWalletSummary(
    userId: number,
    currency: TransactionCurrency,
  ): Promise<{
    balance: number;
    currency: string;
    recentTransactions: TransactionEntity[];
    totalTransactions: number;
  }> {
    let wallet: CADWalletEntity | NGNWalletEntity;

    if (currency === TransactionCurrency.CAD) {
      wallet = await this.cadWalletRepository.findOne({
        where: { userId },
      });
    } else {
      wallet = await this.ngnWalletRepository.findOne({
        where: { userId },
      });
    }

    if (!wallet) {
      throw new NotFoundException(
        `${currency} wallet not found for user ${userId}`,
      );
    }

    const { transactions, total } = await this.getUserTransactions(
      userId,
      { currency },
      10,
      0,
    );

    return {
      balance: parseFloat(wallet.balance.toString()),
      currency,
      recentTransactions: transactions,
      totalTransactions: total,
    };
  }

  /**
   * Create a pending transaction without updating wallet balance
   */
  async createPendingTransaction(createDto: any): Promise<TransactionEntity> {
    // Get user's wallet for validation
    const wallet = await this.cadWalletRepository.findOne({
      where: { userId: createDto.userId },
    });

    if (!wallet) {
      throw new NotFoundException(
        `CAD wallet not found for user ${createDto.userId}`,
      );
    }

    const currentBalance = parseFloat(wallet.balance.toString());
    const transactionAmount = parseFloat(createDto.amount.toFixed(2));

    // Instead of using create(), manually assign properties
    const transaction = new TransactionEntity();
    transaction.userId = createDto.userId;
    transaction.type = createDto.type as unknown as TransactionType;
    transaction.amount = transactionAmount;
    transaction.balanceBefore = currentBalance;
    transaction.balanceAfter = currentBalance;
    transaction.status = TransactionStatus.PENDING;
    transaction.currency = createDto.currency as TransactionCurrency;
    transaction.cadWalletId = createDto.cadWalletId;
    transaction.source = createDto.source as unknown as TransactionSource;
    transaction.description = createDto.description;
    transaction.reference = createDto.reference;
    transaction.referenceHash = createDto.referenceHash;
    transaction.externalTransactionId = createDto.externalTransactionId;
    transaction.transactionId = createDto.transactionId; // *** ADD THIS LINE ***
    transaction.balanceAfter = createDto.balanceAfter; // *** ADD THIS LINE ***
    transaction.balanceBefore = createDto.balanceBefore; // *** ADD THIS LINE ***
    transaction.metadata = createDto.metadata;
    transaction.fee =
      typeof createDto.fee === 'number'
        ? createDto.fee
        : typeof createDto.fee === 'object' &&
            createDto.fee !== null &&
            'amount' in createDto.fee
          ? Number(createDto.fee.amount)
          : 0;
    transaction.processedBy = createDto.processedBy || 'system';

    // Set wallet ID based on currency
    transaction.cadWalletId =
      createDto.currency === TransactionCurrency.CAD ? wallet.id : null;
    transaction.ngnWalletId =
      createDto.currency === TransactionCurrency.NGN ? wallet.id : null;

    const savedTransaction = await this.transactionRepo.save(transaction);

    return savedTransaction;
  }

  /**
   * Complete a pending transaction and update wallet balance
   */
  async completeTransaction(
    transactionId: number,
    completionData?: {
      completedAt?: Date;
      metadata?: Record<string, any>;
    },
  ): Promise<TransactionEntity> {
    return await this.dataSource.transaction(async (manager) => {
      // Get the pending transaction
      const transaction = await manager.findOne(TransactionEntity, {
        where: { id: transactionId },
      });

      if (!transaction) {
        throw new NotFoundException(
          `Transaction with ID ${transactionId} not found`,
        );
      }

      if (transaction.status !== TransactionStatus.PENDING) {
        throw new BadRequestException(
          `Transaction ${transactionId} is not in PENDING status`,
        );
      }

      // Get current wallet balance
      let wallet: CADWalletEntity;

      if (transaction.currency === TransactionCurrency.CAD) {
        wallet = await manager.findOne(CADWalletEntity, {
          where: { id: transaction.cadWalletId },
        });
      }

      if (!wallet) {
        throw new NotFoundException(
          `Wallet not found for transaction ${transactionId}`,
        );
      }

      const currentBalance = parseFloat(wallet.balance.toString());
      const transactionAmount = parseFloat(transaction.amount.toString());
      let newBalance: number;

      // Calculate new balance based on transaction type
      if (transaction.type === TransactionType.CREDIT) {
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
      }

      // Update transaction record
      transaction.balanceBefore = currentBalance;
      transaction.balanceAfter = newBalance;
      transaction.status = TransactionStatus.COMPLETED;
      transaction.completedAt = completionData?.completedAt || new Date();
      transaction.updatedAt = new Date();

      // Update metadata with completion data
      if (completionData?.metadata) {
        transaction.metadata = {
          ...transaction.metadata,
        };
      }

      const updatedTransaction = await manager.save(transaction);

      // Update wallet balance
      wallet.balance = newBalance;
      if (transaction.currency === TransactionCurrency.CAD) {
        await manager.save(CADWalletEntity, wallet as CADWalletEntity);
      }
      this.logger.log(
        `✅ ${transaction.type.toUpperCase()} transaction completed for user ${transaction.userId}: ` +
          `${transaction.type === TransactionType.CREDIT ? '+' : '-'}${transactionAmount} ${transaction.currency} ` +
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
      metadata?: Record<string, any>;
    },
  ): Promise<TransactionEntity> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction with ID ${transactionId} not found`,
      );
    }

    if (transaction.status !== TransactionStatus.PENDING) {
      throw new BadRequestException(
        `Transaction ${transactionId} is not in PENDING status`,
      );
    }

    // Update transaction record to failed
    transaction.status = TransactionStatus.FAILED;
    transaction.failedReason =
      failureData?.failureReason || 'Transaction failed';
    transaction.updatedAt = failureData?.failedAt || new Date();

    // Update metadata with failure data
    if (failureData?.metadata) {
      transaction.metadata = {
        ...transaction.metadata,
        ...failureData.metadata,
      };
    }

    const updatedTransaction = await this.transactionRepo.save(transaction);

    this.logger.log(
      `❌ ${transaction.type.toUpperCase()} transaction failed for user ${transaction.userId}: ` +
        `${transaction.amount} ${transaction.currency} - ${failureData?.failureReason || 'Unknown reason'} (ID: ${transactionId})`,
    );

    return updatedTransaction;
  }

  /**
   * Update transaction status
   */
  async updateTransactionStatusCAD(
    id: number,
    status: TransactionStatus,
    metadata?: Record<string, any>,
  ): Promise<TransactionEntity> {
    const transaction = await this.transactionRepo.findOne({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    // Update status
    transaction.status = status;
    transaction.updatedAt = new Date();

    // Update metadata if provided
    if (metadata) {
      transaction.metadata = {
        ...transaction.metadata,
        ...metadata,
        statusUpdatedAt: new Date().toISOString(),
      };
    }

    const updatedTransaction = await this.transactionRepo.save(transaction);

    this.logger.log(
      `📝 Transaction status updated for ID ${id}: → ${status} ` +
        `(User: ${transaction.userId}, Currency: ${transaction.currency})`,
    );

    return updatedTransaction;
  }

  /**
   * Get transaction statistics for a user
   */
  async getUserTransactionStats(
    userId: number,
    currency?: TransactionCurrency,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalCredits: number;
    totalDebits: number;
    transactionCount: number;
    averageTransaction: number;
  }> {
    const queryBuilder = this.transactionRepo
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.status = :status', {
        status: TransactionStatus.COMPLETED,
      });

    if (currency) {
      queryBuilder.andWhere('transaction.currency = :currency', { currency });
    }

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
        const amount = parseFloat(transaction.amount.toString());
        if (transaction.type === TransactionType.CREDIT) {
          acc.totalCredits += amount;
        } else {
          acc.totalDebits += amount;
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
  // transaction.service.ts - Updated generateStatement method
  async generateStatement(
    userId: number,
    statementRequest: StatementRequestDto,
    res: Response,
  ): Promise<void> {
    try {
      // Validate date range
      const startDate = new Date(statementRequest.startDate + 'T00:00:00.000Z');
      const endDate = new Date(statementRequest.endDate + 'T23:59:59.999Z');
      // Set time to start and end of day

      if (startDate > endDate) {
        throw new BadRequestException('Start date cannot be after end date');
      }

      // Check if date range is not too large (max 1 year)
      const daysDifference =
        (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24);
      if (daysDifference > 365) {
        throw new BadRequestException('Date range cannot exceed 365 days');
      }

      // Get user details
      const user = await this.userService.findUserById(userId);
      if (!user) {
        throw new BadRequestException('User not found');
      }

      // Build where clause based on wallet type filter
      const whereClause: any = {
        userId,
        createdAt: Between(startDate, endDate),
        status: TransactionStatus.COMPLETED,
      };

      // Add currency filter based on wallet type
      if (statementRequest.walletType !== WalletType.ALL) {
        whereClause.currency =
          statementRequest.walletType === WalletType.CAD
            ? TransactionCurrency.CAD
            : TransactionCurrency.NGN;
      }

      // Get filtered transactions
      const transactions = await this.transactionRepo.find({
        where: whereClause,
        order: {
          createdAt: 'DESC',
        },
      });

      if (statementRequest.format === StatementFormat.PDF) {
        await this.generateBongoPDF(
          user,
          transactions,
          startDate,
          endDate,
          statementRequest.walletType,
          res,
        );
      }
      // } else {
      //   await this.generateBongoCSV(
      //     user,
      //     transactions,
      //     startDate,
      //     endDate,
      //     statementRequest.walletType,
      //     res,
      //   );
      // }
    } catch (error) {
      console.log(error, 'error');
      this.logger.error('Error generating statement:', error);
      if (!res.headersSent && !res.destroyed && res.writable) {
        res.status(500).json({ error: 'Failed to generate statement' });
      }
    }
  }

  private async generateBongoPDF(
    user: User,
    transactions: TransactionEntity[],
    startDate: Date,
    endDate: Date,
    walletType: WalletType,
    res: Response,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 0,
          size: 'A4',
          info: {
            Title: 'Bongo Payments Account Statement',
            Author: 'Bongo Payments',
          },
        });

        const chunks: Buffer[] = [];
        let responseHandled = false;

        doc.on('data', (chunk) => {
          if (!responseHandled) {
            chunks.push(chunk);
          }
        });

        doc.on('end', () => {
          if (!responseHandled) {
            responseHandled = true;
            try {
              if (!res.headersSent && res.writable && !res.destroyed) {
                const fileName = `Bongo_Statement_${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}.pdf`;
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader(
                  'Content-Disposition',
                  `attachment; filename="${fileName}"`,
                );

                const pdfBuffer = Buffer.concat(chunks);
                res.send(pdfBuffer);
                resolve();
              }
            } catch (sendError) {
              reject(sendError);
            }
          }
        });

        // Generate the exact layout
        this.createBongoStatementLayout(
          doc,
          user,
          transactions,
          startDate,
          endDate,
          walletType,
        );

        doc.end();
      } catch (setupError) {
        reject(setupError);
      }
    });
  }

  private createBongoStatementLayout(
    doc: any,
    user: User,
    transactions: TransactionEntity[],
    startDate: Date,
    endDate: Date,
    walletType: WalletType,
  ): void {
    const pageWidth = doc.page.width;
    const orange = '#F97316'; // Exact Bongo orange

    // Orange header section (height: 120px)
    doc.rect(0, 0, pageWidth, 120).fill(orange);

    // Add Bongo logo (you can use an actual image here if available)
    // this.drawBongoLogo(doc, 40, 35);

    // Try multiple methods to add the logo
    this.addBongoLogo(doc);

    // BONGO text
    doc
      .fillColor('white')
      .fontSize(36)
      .font('Helvetica-Bold')
      .text('BONGO', 140, 45);

    // PAYMENTS text
    doc
      .fontSize(14)
      .font('Helvetica')
      .fillColor('white')
      .text('PAYMENTS', 140, 85);

    // ACCOUNT STATEMENT text (right aligned)
    doc
      .fillColor('white')
      .fontSize(18)
      .font('Helvetica')
      .text('ACCOUNT STATEMENT', pageWidth - 250, 60);

    // Main content area
    const contentX = 50;
    let currentY = 160;

    // User name - Bold and larger

    const userName =
      user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`.toUpperCase()
        : 'N/A';

    doc
      .fillColor('#1F2937') // Dark gray
      .fontSize(20)
      .font('Helvetica-Bold')
      .text(userName, contentX, currentY);

    currentY += 35;

    // ✅ FIXED: Safely access decrypted address
    const { addressLine1, addressLine2 } = this.formatUserAddress(user);

    doc
      .fillColor('#6B7280')
      .fontSize(11)
      .font('Helvetica')
      .text(addressLine1, contentX, currentY);

    currentY += 15;
    doc.text(addressLine2, contentX, currentY);

    currentY += 35;
    // Phone Number label
    doc
      .fillColor('#9CA3AF') // Light gray
      .fontSize(10)
      .text('Phone Number', contentX, currentY);

    currentY += 15;

    // Phone Number value
    doc
      .fillColor('#1F2937')
      .fontSize(12)
      .font('Helvetica')
      .text(user.phoneNumber || 'Not provided', contentX, currentY);
    // Right column - Date information
    const rightColumnX = pageWidth - 240;
    let rightY = 195;

    // Date label
    doc.fillColor('#9CA3AF').fontSize(10).text('Date', rightColumnX, rightY);

    rightY += 15;

    // Date range
    doc
      .fillColor('#1F2937')
      .fontSize(12)
      .text(
        `${this.formatStatementDate(startDate)} to ${this.formatStatementDate(endDate)}`,
        rightColumnX,
        rightY,
      );

    rightY += 35;

    // Date Generated label
    doc
      .fillColor('#9CA3AF')
      .fontSize(10)
      .text('Date Generated', rightColumnX, rightY);

    rightY += 15;

    // Date Generated value
    doc
      .fillColor('#1F2937')
      .fontSize(12)
      .text(this.formatStatementDate(new Date()), rightColumnX, rightY);

    currentY += 40;

    // Wallet Summary Section
    const summary = this.calculateWalletSummary(transactions, walletType);
    const walletLabel = walletType === WalletType.ALL ? 'Combined' : walletType;

    doc
      .fillColor('#9CA3AF')
      .fontSize(11)
      .font('Helvetica')
      .text(`${walletLabel} Wallet Summary`, contentX, currentY);

    currentY += 20;

    // Credit amount (Green)
    doc
      .fillColor('#10B981')
      .fontSize(14)
      .font('Helvetica')
      .text('Credit: ', contentX, currentY);

    const creditSymbol = walletType === WalletType.NGN ? '₦' : '$';
    doc
      .fillColor('#10B981')
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(
        `${creditSymbol}${this.formatAmount(summary.totalCredit)}`,
        contentX + 60,
        currentY,
      );

    // Debit amount (Red) - positioned to the right
    doc
      .fillColor('#EF4444')
      .fontSize(14)
      .font('Helvetica')
      .text('Debit: ', contentX + 250, currentY);

    const debitSymbol = walletType === WalletType.NGN ? '₦' : '$';
    doc
      .fillColor('#EF4444')
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(
        `${debitSymbol}${this.formatAmount(summary.totalDebit)}`,
        contentX + 300,
        currentY,
      );

    currentY += 40;

    // Transaction table
    this.createTransactionTable(
      doc,
      transactions,
      contentX,
      currentY,
      walletType,
    );
  }

  private addBongoLogo(doc: any): void {
    const logoAdded =
      this.tryAddLogoFromFile(doc) ||
      this.tryAddLogoFromBase64(doc) ||
      this.addFallbackLogo(doc);

    if (!logoAdded) {
      console.error('Failed to add logo to PDF');
    }
  }

  private tryAddLogoFromFile(doc: any): boolean {
    try {
      // Try different path resolutions
      const possiblePaths = [
        path.join(__dirname, '../../assets/bongo-logo.png'),
        path.join(process.cwd(), 'src/assets/bongo-logo.png'),
        path.join(__dirname, '../../../src/assets/bongo-logo.png'),
      ];

      for (const logoPath of possiblePaths) {
        if (fs.existsSync(logoPath)) {
          console.log('Logo found at:', logoPath);
          doc.image(logoPath, 45, 35, {
            width: 65,
            height: 65,
            align: 'center',
            valign: 'center',
          });
          return true;
        }
      }

      console.log('Logo file not found in any of the expected paths');
      return false;
    } catch (error) {
      console.error('Error loading logo from file:', error);
      return false;
    }
  }

  private tryAddLogoFromBase64(doc: any): boolean {
    try {
      // Use embedded base64 logo if available
      // Uncomment and use if you have the base64 version
      // if (BONGO_LOGO_BASE64) {
      //   doc.image(BONGO_LOGO_BASE64, 45, 35, {
      //     width: 65,
      //     height: 65
      //   });
      //   return true;
      // }
      return false;
    } catch (error) {
      console.error('Error loading logo from base64:', error);
      return false;
    }
  }

  private addFallbackLogo(doc: any): boolean {
    try {
      // Create a stylized fallback logo
      // White circle background
      doc.circle(77, 67, 32).fillAndStroke('white', 'white');

      // Orange "B" with flame effect
      doc
        .fillColor('#F97316')
        .fontSize(36)
        .font('Helvetica-Bold')
        .text('B', 63, 48);

      // Small flame decoration
      doc
        .moveTo(70, 45)
        .bezierCurveTo(65, 35, 75, 30, 77, 35)
        .bezierCurveTo(79, 30, 89, 35, 84, 45)
        .fill('#F97316');

      return true;
    } catch (error) {
      console.error('Error creating fallback logo:', error);
      return false;
    }
  }

  // private drawBongoLogo(doc: any, x: number, y: number): void {
  //   // Draw the stylized flame/bull logo
  //   // White circle background
  //   doc.circle(x + 35, y + 35, 35).fill('white');

  //   // Draw simplified flame/bull icon
  //   doc
  //     .fillColor('#F97316')
  //     .fontSize(24)
  //     .text('🔥', x + 22, y + 25);

  //   // "B" in the center
  //   doc
  //     .fillColor('#F97316')
  //     .fontSize(18)
  //     .font('Helvetica-Bold')
  //     .text('B', x + 28, y + 28);
  // }

  private createTransactionTable(
    doc: any,
    transactions: TransactionEntity[],
    startX: number,
    startY: number,
    walletType: WalletType,
  ): void {
    const pageWidth = doc.page.width;
    const tableWidth = pageWidth - startX * 2;

    // Table headers
    const headers = ['Date', 'Type', 'Description', 'Amount', 'Balance'];
    const columnWidths = [80, 60, 180, 80, 80];
    const columnX = [
      startX,
      startX + 80,
      startX + 140,
      startX + 320,
      startX + 400,
    ];

    // Header row with light gray background
    doc.rect(startX - 10, startY, tableWidth + 20, 25).fill('#F9FAFB');

    // Draw header text
    doc.fillColor('#6B7280').fontSize(9).font('Helvetica');

    headers.forEach((header, i) => {
      doc.text(header, columnX[i], startY + 8);
    });

    // Draw horizontal line under header
    doc
      .moveTo(startX - 10, startY + 25)
      .lineTo(startX + tableWidth + 10, startY + 25)
      .stroke('#E5E7EB');

    // Transaction rows
    let rowY = startY + 35;
    const rowHeight = 25;

    transactions.forEach((transaction, index) => {
      // Check if we need a new page
      if (rowY + rowHeight > doc.page.height - 60) {
        doc.addPage();

        // Repeat orange header on new page
        doc.rect(0, 0, pageWidth, 60).fill('#F97316');

        doc
          .fillColor('white')
          .fontSize(14)
          .font('Helvetica-Bold')
          .text('BONGO PAYMENTS', 40, 25);

        doc
          .fontSize(10)
          .text('ACCOUNT STATEMENT (Continued)', pageWidth - 200, 25);

        rowY = 80;

        // Repeat table header
        doc.rect(startX - 10, rowY, tableWidth + 20, 25).fill('#F9FAFB');

        doc.fillColor('#6B7280').fontSize(9).font('Helvetica');

        headers.forEach((header, i) => {
          doc.text(header, columnX[i], rowY + 8);
        });

        doc
          .moveTo(startX - 10, rowY + 25)
          .lineTo(startX + tableWidth + 10, rowY + 25)
          .stroke('#E5E7EB');

        rowY += 35;
      }

      const amount = this.safeToNumber(transaction.amount);
      const balance = this.safeToNumber(transaction.balanceAfter);
      const currency = transaction.currency || 'CAD';
      const symbol = currency === 'NGN' ? '₦' : '$';

      // Date column
      doc
        .fillColor('#374151')
        .fontSize(9)
        .font('Helvetica')
        .text(this.formatTableDate(transaction.createdAt), columnX[0], rowY);

      // Type column
      const isCredit =
        transaction.type === 'CREDIT' ||
        transaction.type === 'DEPOSIT' ||
        transaction.type === 'P2P_CREDIT';

      doc.text(isCredit ? 'Credit' : 'Debit', columnX[1], rowY);

      // Description column
      const description = transaction.description || 'P2P transfer...';
      doc.text(this.truncateText(description, 35), columnX[2], rowY);

      // Amount column
      const amountText = `${symbol}${Math.abs(amount).toFixed(2)}`;
      doc.fillColor('#374151').text(amountText, columnX[3], rowY);

      // Balance column
      doc
        .fillColor('#374151')
        .text(`${symbol}${balance.toFixed(2)}`, columnX[4], rowY);

      // Draw subtle line between rows
      if (index < transactions.length - 1) {
        doc
          .moveTo(startX, rowY + 18)
          .lineTo(startX + tableWidth, rowY + 18)
          .stroke('#F3F4F6');
      }

      rowY += rowHeight;
    });
  }

  private formatUserAddress(user: User): {
    addressLine1: string;
    addressLine2: string;
  } {
    try {
      // ✅ Check if address exists and is properly decrypted
      if (!user.address) {
        return {
          addressLine1: 'Address not provided',
          addressLine2: '',
        };
      }

      // ✅ Check if address is still encrypted (string starting with PII:)
      if (typeof user.address === 'string') {
        const addrStr = user.address as string;
        if (addrStr.startsWith('PII:')) {
          this.logger.error('Address data is still encrypted');
          return {
            addressLine1: 'Address unavailable',
            addressLine2: '',
          };
        }
        // If it's a string but not encrypted, try to parse as JSON
        try {
          user.address = JSON.parse(addrStr);
        } catch {
          return {
            addressLine1: 'Invalid address format',
            addressLine2: '',
          };
        }
      }

      // ✅ Now address should be an object
      const addr = user.address;

      // Build address line 1: street and apartment
      const streetParts = [addr.street, addr.apartmentNumber].filter(
        (part) => part && part.trim() !== '',
      );
      const addressLine1 =
        streetParts.length > 0
          ? streetParts.join(', ')
          : 'Address not provided';

      // Build address line 2: city, state/province, zip, country
      const locationParts = [
        addr.city,
        addr.stateProvince,
        addr.zipCode,
      ].filter((part) => part && part.trim() !== '');

      const location = locationParts.join(', ');
      const countryPart = user.country || '';

      const addressLine2 = [location, countryPart]
        .filter((part) => part && part.trim() !== '')
        .join(' ');

      return {
        addressLine1: addressLine1 || 'Address not provided',
        addressLine2: addressLine2 || '',
      };
    } catch (error) {
      this.logger.error('Error formatting user address:', error);
      return {
        addressLine1: 'Address unavailable',
        addressLine2: '',
      };
    }
  }
  // In formatStatementDate method, ensure proper date handling
  private formatStatementDate(date: Date): string {
    // Use UTC methods to avoid timezone issues
    const d = new Date(date);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const month = months[d.getUTCMonth()];
    const year = d.getUTCFullYear();

    return `${day} ${month}, ${year}`;
  }

  private formatTableDate(date: Date): string {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const months = [
      'Jan', // index 0 = January
      'Feb', // index 1 = February
      'Mar', // index 2 = March
      'Apr', // index 3 = April
      'May', // index 4 = May
      'Jun', // index 5 = June
      'Jul', // index 6 = July
      'Aug', // index 7 = August
      'Sep', // index 8 = September
      'Oct', // index 9 = October
      'Nov', // index 10 = November
      'Dec', // index 11 = December
    ];
    const month = months[d.getMonth()];
    const year = d.getFullYear();

    return `${day} ${month}, ${year}`;
  }
  private formatAmount(amount: number): string {
    // Format with comma separator
    return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  private calculateWalletSummary(
    transactions: TransactionEntity[],
    walletType: WalletType,
  ): any {
    let totalCredit = 0;
    let totalDebit = 0;

    transactions.forEach((transaction) => {
      const amount = Math.abs(this.safeToNumber(transaction.amount));

      const isCredit =
        transaction.type === 'CREDIT' ||
        transaction.type === 'DEPOSIT' ||
        transaction.type === 'P2P_CREDIT';

      if (isCredit) {
        totalCredit += amount;
      } else {
        totalDebit += amount;
      }
    });

    // Default to 1,100,000 if no transactions (as shown in your example)
    return {
      totalCredit: totalCredit || 0,
      totalDebit: totalDebit || 0,
      totalCount: transactions.length,
    };
  }

  private safeToNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  private truncateText(text: string, maxLength: number): string {
    return text.length > maxLength
      ? text.substring(0, maxLength - 3) + '...'
      : text;
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  }
}
