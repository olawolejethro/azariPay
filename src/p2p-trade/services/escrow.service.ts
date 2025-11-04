// src/escrow/services/escrow.service.ts - Enhanced with Fee Integration
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Escrow, EscrowStatus } from '../entities/escrow.entity';
import { NGNWalletEntity } from '../../wallets/entities/NGNwallet.entity';
import { CADWalletEntity } from '../../wallets/entities/CADwallet.entity';
import { User } from '../../auth/entities/user.entity';
import { FeeManagementService } from 'src/metadata/services/fee-management.service';
import { P2PSeller } from 'src/P2P/entities/p2p-seller.entity';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    @InjectRepository(Escrow)
    private readonly escrowRepository: Repository<Escrow>,
    @InjectRepository(NGNWalletEntity)
    private readonly ngnWalletRepository: Repository<NGNWalletEntity>,
    @InjectRepository(CADWalletEntity)
    private readonly cadWalletRepository: Repository<CADWalletEntity>,
    private readonly datasource: DataSource,
    private readonly feeManagementService: FeeManagementService, // Add fee service
  ) {}

  /**
   * Lock seller funds in escrow with fee deduction
   */
  async lockFunds(
    tradeId: number,
    sellerId: number,
    buyerId: number,
    amount: number,
    currency: string,
    reason: string = 'P2P Trade escrow lock',
  ): Promise<{ escrow: Escrow; lockFee: number; totalAmountLocked: number }> {
    const queryRunner = this.datasource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // ✅ ADD THIS: Check if escrow already exists for this trade
      const existingEscrow = await queryRunner.manager.findOne(Escrow, {
        where: { tradeId },
      });

      if (existingEscrow) {
        // await queryRunner.rollbackTransaction();

        if (existingEscrow.status === EscrowStatus.LOCKED) {
          // Return existing escrow info instead of throwing error
          return {
            escrow: existingEscrow,
            lockFee: 0, // You might want to calculate this from metadata
            totalAmountLocked: existingEscrow.amount,
          };
        } else {
          throw new BadRequestException(
            `Escrow already exists for trade ${tradeId} with status: ${existingEscrow.status}`,
          );
        }
      }
      console.log(sellerId);
      // ✅ GET THE SELL ORDER AND CHECK AVAILABLE AMOUNT
      const sellOrder = await queryRunner.manager.findOne(P2PSeller, {
        where: { id: sellerId },
      });

      if (!sellOrder) {
        throw new NotFoundException(
          `Sell order not found for seller ${sellerId}`,
        );
      }
      console.log(sellOrder, 'seller', amount, 'amount');
      if (Number(sellOrder.availableAmount) < Number(amount)) {
        throw new BadRequestException(
          `Insufficient available amount in sell order. Required: ${amount} ${currency}, Available: ${sellOrder.availableAmount} ${currency}`,
        );
      }
      // Calculate escrow lock fee
      const lockFee = await this.feeManagementService.getFeeForTransaction(
        'P2P_ESCROW_LOCK',
        currency,
      );

      // Total amount to lock = trade amount + fee
      const totalAmountToLock = Number(amount) + Number(lockFee);
      // Reduce available amount on seller's order by the trade amount (fee is retained by platform)

      if (Number(sellOrder.availableAmount) < 0) {
        throw new BadRequestException(
          `Insufficient available amount in sell order after locking. Required: ${amount}, Available would become: ${sellOrder.availableAmount}`,
        );
      }

      // sellOrder.availableAmount =
      //   Number(sellOrder.availableAmount) - Number(amount);
      await queryRunner.manager.save(sellOrder);
      // Get seller's wallet
      let sellerWallet: any;
      if (currency.toUpperCase() === 'NGN') {
        sellerWallet = await queryRunner.manager.findOne('NGNWalletEntity', {
          where: { userId: sellOrder.userId },
        });
      } else if (currency.toUpperCase() === 'CAD') {
        sellerWallet = await queryRunner.manager.findOne('CADWalletEntity', {
          where: { userId: sellOrder.userId },
        });
      }
      console.log(
        sellerWallet,
        'seller wallet',
        totalAmountToLock,
        'total amount to lock',
      );
      if (!sellerWallet || Number(sellerWallet.balance) < totalAmountToLock) {
        throw new BadRequestException(
          `Insufficient ${currency} funds. Required: ${totalAmountToLock} (${amount} + ${lockFee} fee), Available: ${sellerWallet.balance}`,
        );
      }

      if (!sellerWallet || Number(sellerWallet.balance) < totalAmountToLock) {
        throw new BadRequestException(
          `Insufficient ${currency} funds. Required: ${totalAmountToLock} (${amount} + ${lockFee} fee), Available: ${sellerWallet.balance}`,
        );
      }

      // Debit seller's wallet for full amount (trade amount + fee)
      sellerWallet.balance = Number(sellerWallet.balance) - totalAmountToLock;
      await queryRunner.manager.save(sellerWallet);

      // Create escrow record - lock trade amount + fee together
      const escrow = queryRunner.manager.create(Escrow, {
        tradeId,
        sellerId: sellOrder.userId,
        buyerId,
        amount: totalAmountToLock, // Lock both trade amount and fee
        currency,
        status: EscrowStatus.LOCKED,
        reason,
        lockedAt: new Date(),
      });

      const savedEscrow = await queryRunner.manager.save(escrow);

      await queryRunner.commitTransaction();

      return {
        escrow: savedEscrow,
        lockFee: lockFee,
        totalAmountLocked: totalAmountToLock,
      };
    } catch (error) {
      console.log('Error locking funds in escrow:', error);
      // await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Release escrow funds to buyer with fee deduction
   */
  async releaseFunds(
    tradeId: number,
    processedBy: number,
    tradeAmount: number, // Original trade amount without fee
    reason: string = 'Trade completed successfully',
  ): Promise<{ escrow: Escrow; businessProfit: number }> {
    const escrow = await this.escrowRepository.findOne({
      where: { tradeId, status: EscrowStatus.LOCKED },
    });

    if (!escrow) {
      throw new NotFoundException(
        `No locked escrow found for trade ${tradeId}`,
      );
    }
    console.log('Escrow found:', escrow);
    console.log('Trade amount:', tradeAmount);
    // ✅ ADD THIS: Check if escrow is already released
    if (escrow.status === EscrowStatus.RELEASED) {
      // Return existing release info instead of throwing error
      const businessProfit = Number(escrow.amount) - Number(tradeAmount);
      return {
        escrow: escrow,
        businessProfit: businessProfit,
      };
    }

    // ✅ ADD THIS: Check if escrow is not in lockable state
    if (escrow.status !== EscrowStatus.LOCKED) {
      throw new BadRequestException(
        `Cannot release escrow for trade ${tradeId}. Current status: ${escrow.status}`,
      );
    }

    const queryRunner = this.datasource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Calculate business profit (fee portion)
      const businessProfit = Number(escrow.amount) - Number(tradeAmount);

      // Get buyer's wallet
      let buyerWallet: any;
      if (escrow.currency.toUpperCase() === 'NGN') {
        buyerWallet = await queryRunner.manager.findOne('NGNWalletEntity', {
          where: { userId: escrow.buyerId },
        });
        // if (!buyerWallet) {
        //   buyerWallet = queryRunner.manager.create('NGNWalletEntity', {
        //     userId: escrow.buyerId,
        //     balance: 0,
        //   });
        // }
      } else if (escrow.currency.toUpperCase() === 'CAD') {
        buyerWallet = await queryRunner.manager.findOne('CADWalletEntity', {
          where: { userId: escrow.buyerId },
        });
        // if (!buyerWallet) {
        //   buyerWallet = queryRunner.manager.create('CADWalletEntity', {
        //     userId: escrow.buyerId,
        //     balance: 0,
        //   });
        // }
      }
      console.log('Buyer wallet :', buyerWallet);
      // Credit buyer with trade amount only (business keeps fee)
      buyerWallet.balance = Number(buyerWallet.balance) + Number(tradeAmount);
      await queryRunner.manager.save(buyerWallet);

      console.log('Buyer wallet after credit:', buyerWallet.balance);
      // Update escrow status
      escrow.status = EscrowStatus.RELEASED;
      escrow.releasedAt = new Date();
      escrow.processedBy = processedBy;
      const updatedEscrow = await queryRunner.manager.save(escrow);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Escrow released: ${tradeAmount} ${escrow.currency} to buyer, ${businessProfit} ${escrow.currency} profit for platform`,
      );

      return {
        escrow: updatedEscrow,
        businessProfit: businessProfit,
      };
    } catch (error) {
      // await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
  // Updated refund funds (no penalty - full refund)
  async refundFunds(
    tradeId: number,
    processedBy: number,
    reason: string = 'Trade cancelled - full refund',
  ): Promise<{ escrow: Escrow; refundedAmount: number }> {
    const escrow = await this.escrowRepository.findOne({
      where: { tradeId, status: EscrowStatus.LOCKED },
    });

    // ✅ ADD THIS: Check if escrow is already refunded
    if (escrow.status === EscrowStatus.REFUNDED) {
      // Return existing refund info instead of throwing error
      return {
        escrow: escrow,
        refundedAmount: Number(escrow.amount),
      };
    }

    // ✅ ADD THIS: Check if escrow is not in refundable state
    if (escrow.status !== EscrowStatus.LOCKED) {
      throw new BadRequestException(
        `Cannot refund escrow for trade ${tradeId}. Current status: ${escrow.status}`,
      );
    }

    const queryRunner = this.datasource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get seller's wallet
      let sellerWallet: any;
      if (escrow.currency.toUpperCase() === 'NGN') {
        sellerWallet = await queryRunner.manager.findOne('NGNWalletEntity', {
          where: { userId: escrow.sellerId },
        });
      } else if (escrow.currency.toUpperCase() === 'CAD') {
        sellerWallet = await queryRunner.manager.findOne('CADWalletEntity', {
          where: { userId: escrow.sellerId },
        });
      }

      // Refund full amount (trade amount + fee) - no penalty
      const fullRefundAmount = Number(escrow.amount);
      sellerWallet.balance = Number(sellerWallet.balance) + fullRefundAmount;

      await queryRunner.manager.save(sellerWallet);
      const sellerOrder = await queryRunner.manager.findOne(P2PSeller, {
        where: { userId: escrow.sellerId },
      });

      // if (sellerOrder) {
      //   // Increase available amount in seller's order
      //   sellerOrder.availableAmount =
      //     Number(sellerOrder.availableAmount) +
      //     (fullRefundAmount -
      //       Number(
      //         await this.feeManagementService.getFeeForTransaction(
      //           'P2P_ESCROW_LOCK',
      //           escrow.currency,
      //         ),
      //       ));
      //   console.log(sellerOrder.availableAmount, 'avalai');
      //   await queryRunner.manager.save(sellerOrder);
      // }
      // Update escrow status
      escrow.status = EscrowStatus.REFUNDED;
      escrow.refundedAt = new Date();
      escrow.processedBy = processedBy;
      const updatedEscrow = await queryRunner.manager.save(escrow);

      // Create seller refund transaction
      // const sellerTransaction = queryRunner.manager.create(
      //   'TransactionEntity',
      //   {
      //     userId: escrow.sellerId,
      //     amount: fullRefundAmount,
      //     currency: escrow.currency,
      //     type: 'ESCROW_REFUND',
      //     reference: `ESCROW_REFUND_${tradeId}`,
      //     description: `Full refund for cancelled trade ${tradeId} (no penalty)`,
      //     status: 'COMPLETED',
      //     balanceAfter: sellerWallet.balance,
      //     metadata: {
      //       tradeId,
      //       escrowId: escrow.id,
      //       fullRefund: true,
      //       refundedAmount: fullRefundAmount,
      //       reason: reason,
      //     },
      //   },
      // );
      // await queryRunner.manager.save(sellerTransaction);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Full refund processed: ${fullRefundAmount} ${escrow.currency} returned to seller`,
      );

      return {
        escrow: updatedEscrow,
        refundedAmount: fullRefundAmount,
      };
    } catch (error) {
      // await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get escrow details by trade ID
   */
  async getEscrowByTradeId(tradeId: number): Promise<Escrow | null> {
    return await this.escrowRepository.findOne({
      where: { tradeId },
      relations: ['seller', 'buyer', 'processedByUser'],
    });
  }

  /**
   * Mark escrow as disputed
   */
  async markAsDisputed(tradeId: number, processedBy: number): Promise<Escrow> {
    const escrow = await this.escrowRepository.findOne({
      where: { tradeId, status: EscrowStatus.LOCKED },
    });

    if (!escrow) {
      throw new NotFoundException(
        `No locked escrow found for trade ${tradeId}`,
      );
    }

    escrow.status = EscrowStatus.DISPUTED;
    escrow.processedBy = processedBy;
    escrow.updatedAt = new Date();

    const updatedEscrow = await this.escrowRepository.save(escrow);

    this.logger.log(
      `Escrow marked as disputed for trade ${tradeId} by user ${processedBy}`,
    );

    return updatedEscrow;
  }

  /**
   * Find any escrow record for a trade (regardless of status)
   * @param tradeId - The trade ID to search for
   * @returns Promise<Escrow | null> - Escrow record or null if not found
   */
  async findEscrowByTrade(tradeId: number): Promise<Escrow | null> {
    try {
      const escrow = await this.escrowRepository.findOne({
        where: {
          tradeId: tradeId,
        },
        relations: ['trade', 'seller', 'buyer'],
        order: {
          lockedAt: 'DESC', // Get the most recent if multiple exist
        },
      });

      return escrow;
    } catch (error) {
      this.logger.error(`Error finding escrow for trade ${tradeId}:`, error);
      throw error;
    }
  }

  // Add these methods to your EscrowService class

  /**
   * Find active escrow record for a specific trade
   * @param tradeId - The trade ID to search for
   * @returns Promise<Escrow | null> - Active escrow record or null if not found
   */
  async findActiveEscrowByTrade(tradeId: number): Promise<Escrow | null> {
    try {
      const escrow = await this.escrowRepository.findOne({
        where: {
          tradeId: tradeId,
          status: EscrowStatus.LOCKED, // Only locked escrows are considered "active"
        },
        relations: ['trade', 'seller', 'buyer'], // Include related entities for context
      });

      if (escrow) {
        this.logger.log(
          `Found active escrow ${escrow.id} for trade ${tradeId}`,
        );
      } else {
        this.logger.log(`No active escrow found for trade ${tradeId}`);
      }

      return escrow;
    } catch (error) {
      this.logger.error(
        `Error finding active escrow for trade ${tradeId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Mark an escrow as disputed
   * @param escrowId - The escrow ID to mark as disputed
   * @param disputeId - The dispute ID that triggered this
   * @returns Promise<Escrow> - Updated escrow record
   */

  /**
   * Optional: Get escrow details for a dispute resolution
   * @param tradeId - The trade ID
   * @returns Promise<Escrow | null> - Escrow details
   */
  async getEscrowForDispute(tradeId: number): Promise<Escrow | null> {
    try {
      const escrow = await this.escrowRepository.findOne({
        where: {
          tradeId: tradeId,
          status: EscrowStatus.DISPUTED,
        },
        relations: ['trade', 'seller', 'buyer'],
      });

      return escrow;
    } catch (error) {
      this.logger.error(
        `Error getting disputed escrow for trade ${tradeId}:`,
        error,
      );
      throw error;
    }
  }
}
