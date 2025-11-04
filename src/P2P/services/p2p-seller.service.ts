// src/P2P/services/p2p-seller.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { P2PSeller } from '../entities/p2p-seller.entity';
import { CreateP2PSellerDto } from '../dtos/create-p2p-seller.dto';
import { UpdateP2PSellerDto } from '../dtos/update-p2p-seller.dto';
import { User } from 'src/auth/entities/user.entity';
import { CADWalletEntity } from 'src/wallets/entities/CADwallet.entity';
import { NGNWalletEntity } from 'src/wallets/entities/NGNwallet.entity';
import { NotificationService } from 'src/notifications/notifications.service';
import { FirebaseService } from 'src/firebase/firebase.service';
import { NotificationType } from 'src/notifications/dto/create-notification.dto/create-notification.dto';
import { P2PTrade, TradeStatus } from 'src/p2p-trade/entities/p2p-trade.entity';
import { Logger } from '@nestjs/common';
import { NegotiationService } from 'src/p2p-trade/services/p2p-trade/negotiation.service';
import {
  Negotiation,
  NegotiationStatus,
} from 'src/p2p-trade/entities/negotiation.entity';
import { GetSellerOrdersFilterDto } from '../dtos/getSeller.dto';

export enum P2POrderStatus {
  PENDING = 'PENDING',
  MATCHED = 'MATCHED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  OPEN = 'OPEN',
  DRAFT = 'DRAFT',
}

@Injectable()
export class P2PSellerService {
  private readonly logger = new Logger(P2PSellerService.name);
  constructor(
    @InjectRepository(P2PSeller)
    private p2pSellerRepository: Repository<P2PSeller>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Negotiation)
    private negotiationRepository: Repository<Negotiation>,

    @InjectRepository(P2PTrade)
    private tradeRepository: Repository<P2PTrade>,
    @InjectRepository(CADWalletEntity)
    private cadWalletRepo: Repository<CADWalletEntity>,
    @InjectRepository(NGNWalletEntity)
    private ngnWalletRepo: Repository<NGNWalletEntity>,
    private notificationService: NotificationService,
    private firebaseService: FirebaseService,
    private negotiationService: NegotiationService, // Use actual type if available
  ) {}

  async create(
    userId: number,
    createP2PSellerDto: CreateP2PSellerDto,
  ): Promise<P2PSeller> {
    // Check if user exists
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Check onboarding/KYC status
    const onboardingCompleted =
      user.pin !== null && user.kycStatus === 'SUCCESS';

    if (!onboardingCompleted) {
      throw new BadRequestException(
        'Onboarding not completed. Please complete KYC before creating an order.',
      );
    }

    // Validate currency pair
    if (createP2PSellerDto.sellCurrency === createP2PSellerDto.buyCurrency) {
      throw new BadRequestException(
        'Sell currency and buy currency cannot be the same',
      );
    }

    // Get wallets
    const cadWallet = await this.cadWalletRepo.findOne({ where: { userId } });
    const ngnWallet = await this.ngnWalletRepo.findOne({ where: { userId } });

    if (!cadWallet) {
      throw new NotFoundException(
        `CAD wallet for user with ID ${userId} not found`,
      );
    }

    if (!ngnWallet) {
      throw new NotFoundException(
        `NGN wallet for user with ID ${userId} not found`,
      );
    }
    // Minimum amount check for CAD and NGN
    if (
      createP2PSellerDto.sellCurrency === 'CAD' &&
      createP2PSellerDto.availableAmount < 100
    ) {
      throw new BadRequestException('Minimum available amount for CAD is 100');
    }
    if (
      createP2PSellerDto.sellCurrency === 'NGN' &&
      createP2PSellerDto.availableAmount < 100000
    ) {
      throw new BadRequestException(
        'Minimum available amount for NGN is 100,000',
      );
    }
    // Validate wallet balance only if publishing (drafts don't need balance validation)
    const action = createP2PSellerDto.action;

    if (action === 'publish') {
      if (createP2PSellerDto.sellCurrency === 'CAD') {
        if (createP2PSellerDto.availableAmount > cadWallet.balance) {
          throw new BadRequestException(
            `Available amount exceeds CAD wallet balance for user with ID ${userId}`,
          );
        }
      }

      if (createP2PSellerDto.sellCurrency === 'NGN') {
        if (createP2PSellerDto.availableAmount > ngnWallet.balance) {
          throw new BadRequestException(
            `Available amount exceeds NGN wallet balance for user with ID ${userId}`,
          );
        }
      }
    }

    // Validate minimum transaction limit
    if (
      createP2PSellerDto.minTransactionLimit >
      createP2PSellerDto.availableAmount
    ) {
      throw new BadRequestException(
        'Minimum transaction limit cannot exceed available amount',
      );
    }

    // Determine status based on action
    const orderStatus =
      action === 'publish' ? P2POrderStatus.OPEN : P2POrderStatus.DRAFT;

    // Create new P2P seller order
    const sellerOrder = this.p2pSellerRepository.create({
      ...createP2PSellerDto,
      userId,
      status: orderStatus,
      totalTrades: 0,
      completedTrades: 0,
      totalReviews: 0,
      rating: 0,
    });

    // Remove action from saved data (don't store it in DB)
    // No need to delete sellerOrder.action as it's not part of the entity

    return this.p2pSellerRepository.save(sellerOrder);
  }
  async findAll(userId: number): Promise<P2PSeller[]> {
    return this.p2pSellerRepository.find({
      where: { userId },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  // async findPublic(
  //   userId?: number,
  //   sellCurrency?: string,
  //   buyCurrency?: string,
  //   rating?: number,
  //   exchangeRate?: number,
  //   completionTime?: number,
  //   sortBy: string = 'rating',
  //   sortOrder: 'ASC' | 'DESC' = 'DESC',
  //   search?: string,
  //   skip: number = 0,
  //   limit: number = 10,
  // ): Promise<{ data: P2PSeller[]; total: number }> {
  //   // Build query for active sell orders
  //   const queryBuilder = this.p2pSellerRepository
  //     .createQueryBuilder('seller')
  //     .leftJoinAndSelect('seller.user', 'user')
  //     .select(['seller', 'user.firstName', 'user.lastName'])
  //     .where('seller.status = :status', { status: 'OPEN' });

  //   // Add currency filters if provided

  //   if (search) {
  //     queryBuilder.andWhere(
  //       `(
  //     LOWER(user.firstName) LIKE :search OR
  //     LOWER(user.lastName) LIKE :search OR
  //     LOWER(seller.accountName) LIKE :search OR
  //     LOWER(seller.bankName) LIKE :search OR
  //     CAST(seller.exchangeRate AS TEXT) LIKE :search OR
  //     CAST(seller.minTransactionLimit AS TEXT) LIKE :search
  //   )`,
  //       { search: `%${search.toLowerCase()}%` },
  //     );
  //   }

  //   // Exclude the current user's orders
  //   if (userId !== undefined) {
  //     queryBuilder.andWhere('seller.userId != :userId', { userId });
  //   }

  //   if (sellCurrency) {
  //     queryBuilder.andWhere('seller.sellCurrency = :sellCurrency', {
  //       sellCurrency,
  //     });
  //   }

  //   if (buyCurrency) {
  //     queryBuilder.andWhere('seller.buyCurrency = :buyCurrency', {
  //       buyCurrency,
  //     });
  //   }

  //   // Add rating filter if provided
  //   if (rating !== undefined) {
  //     queryBuilder.andWhere('seller.rating = :rating', { rating });
  //   }

  //   // Add exchange rate filter if provided
  //   if (exchangeRate !== undefined) {
  //     queryBuilder.andWhere('seller.exchangeRate = :exchangeRate', {
  //       exchangeRate,
  //     });
  //   }

  //   // Add completion time filter if provided
  //   if (completionTime !== undefined) {
  //     queryBuilder.andWhere('seller.transactionDuration = :completionTime', {
  //       completionTime,
  //     });
  //   }

  //   // Determine sorting field
  //   let orderByField = 'seller.rating';
  //   switch (sortBy) {
  //     case 'exchangeRate':
  //       orderByField = 'seller.exchangeRate';
  //       break;
  //     case 'completionTime':
  //       orderByField = 'seller.transactionDuration';
  //       break;
  //     case 'rating':
  //     default:
  //       orderByField = 'seller.rating';
  //       break;
  //   }

  //   // Apply sorting
  //   queryBuilder.orderBy(orderByField, sortOrder);
  //   queryBuilder.skip(skip).take(limit);
  //   const [data, total] = await queryBuilder.getManyAndCount();

  //   return { data, total };
  // }

  async findPublic(
    userId?: number,
    sellCurrency?: string,
    buyCurrency?: string,
    rating?: number,
    exchangeRate?: number,
    completionTime?: number,
    sortBy: string = 'recommended',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
    search?: string,
    skip: number = 0,
    limit: number = 10,
  ): Promise<{ data: P2PSeller[]; total: number }> {
    // Build query for active sell orders
    const queryBuilder = this.p2pSellerRepository
      .createQueryBuilder('seller')
      .leftJoinAndSelect('seller.user', 'user')
      .select([
        'seller',
        'user.firstName',
        'user.lastName',
        'user.rating',
        'user.createdAt',
      ])
      .where('seller.status = :status', { status: 'OPEN' })
      .andWhere('seller.availableAmount > :minAmount', { minAmount: 0 }); // ADD THIS LINE

    // Add search functionality
    if (search) {
      queryBuilder.andWhere(
        `(
      CAST(seller.exchangeRate AS TEXT) LIKE :search OR
      CAST(seller.minTransactionLimit AS TEXT) LIKE :search OR
      CAST(seller.rating AS TEXT) LIKE :search OR
      CAST(seller.completionRate AS TEXT) LIKE :search OR
      seller.sellCurrency LIKE :search OR
      seller.buyCurrency LIKE :search OR
      seller.status LIKE :search
    )`,
        { search: `%${search.toLowerCase()}%` },
      );
    }

    // Exclude the current user's orders
    if (userId !== undefined) {
      queryBuilder.andWhere('seller.userId != :userId', { userId });
    }

    if (sellCurrency) {
      queryBuilder.andWhere('seller.sellCurrency = :sellCurrency', {
        sellCurrency,
      });
    }

    if (buyCurrency) {
      queryBuilder.andWhere('seller.buyCurrency = :buyCurrency', {
        buyCurrency,
      });
    }

    // Rating range filter - 4.0 returns 4.0 to 4.9
    if (rating !== undefined) {
      const ratingFloor = Math.floor(rating);
      const ratingCeiling = ratingFloor + 0.9;

      queryBuilder.andWhere(
        'user.rating >= :ratingMin AND user.rating <= :ratingMax',
        {
          ratingMin: ratingFloor,
          ratingMax: ratingCeiling,
        },
      );
    }

    if (exchangeRate !== undefined) {
      queryBuilder.andWhere('seller.exchangeRate = :exchangeRate', {
        exchangeRate,
      });
    }

    if (completionTime !== undefined) {
      queryBuilder.andWhere('seller.transactionDuration = :completionTime', {
        completionTime,
      });
    }

    // Determine sorting logic
    if (sortBy === 'recommended') {
      // Recommended sorting:
      // 1. completedTrades DESC (most completed trades first)
      // 2. completionRate DESC (highest success rate first)
      // 3. user.createdAt ASC (oldest account first for tie-breaking)
      queryBuilder
        .orderBy('seller.completedTrades', 'DESC')
        .addOrderBy('seller.completionRate', 'DESC')
        .addOrderBy('user.createdAt', 'ASC');
    } else {
      // Other sorting options
      let orderByField = 'user.rating';
      switch (sortBy) {
        case 'exchangeRate':
          orderByField = 'seller.exchangeRate';
          break;
        case 'completionTime':
          orderByField = 'seller.transactionDuration';
          break;
        case 'rating':
          orderByField = 'user.rating';
          break;
        case 'completedTrades':
          orderByField = 'seller.completedTrades';
          break;
        case 'completionRate':
          orderByField = 'seller.completionRate';
          break;
        default:
          orderByField = 'user.rating';
          break;
      }
      queryBuilder.orderBy(orderByField, sortOrder);
    }

    queryBuilder.skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    // Transform the data to replace seller.rating with user.rating
    const transformedData = data.map((seller) => ({
      ...seller,
      rating: seller.user?.rating || 0,
    }));

    return { data: transformedData, total };
  }

  async findOne(userId: number, id: number): Promise<P2PSeller> {
    // Ensure id is a valid number
    if (isNaN(id) || id <= 0) {
      throw new BadRequestException(`Invalid P2P sell order ID: ${id}`);
    }

    const sellerOrder = await this.p2pSellerRepository.findOne({
      where: { id, userId },
    });

    if (!sellerOrder) {
      throw new NotFoundException(`P2P sell order with ID ${id} not found`);
    }

    return sellerOrder;
  }

  async getSellerOrders(
    userId: number,
    filterDto: GetSellerOrdersFilterDto,
  ): Promise<{
    orders: P2PSeller[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      status,
      awaitingSeller,
      isNegotiating,
      limit = 20,
      page = 1,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = filterDto;

    const skip = (page - 1) * limit;

    const queryBuilder = this.p2pSellerRepository
      .createQueryBuilder('sellOrder')
      .where('sellOrder.userId = :userId', { userId })
      .andWhere('sellOrder.status IN (:...statuses)', {
        statuses: ['ACTIVE', 'DRAFT', 'OPEN'],
      })
      .orderBy(`sellOrder.${sortBy}`, sortOrder)
      .take(limit)
      .skip(skip);

    // Apply status filter if provided
    if (status) {
      queryBuilder.andWhere('sellOrder.status = :status', { status });
    }

    // Apply awaitingSeller filter if provided
    if (awaitingSeller !== undefined) {
      queryBuilder.andWhere('sellOrder.awaitingSeller = :awaitingSeller', {
        awaitingSeller,
      });
    }

    // Apply isNegotiating filter if provided
    if (isNegotiating !== undefined) {
      queryBuilder.andWhere('sellOrder.isNegotiating = :isNegotiating', {
        isNegotiating,
      });
    }

    const [orders, total] = await queryBuilder.getManyAndCount();

    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async calculateConversionWithNegotiation(
    sellerId: number,
    userId: number,
    amount: number,
    fromCurrency?: string,
    toCurrency?: string,
  ) {
    // Find the seller/sell order
    const seller = await this.p2pSellerRepository.findOne({
      where: { id: sellerId },
      relations: ['user'],
    });

    if (!seller) {
      throw new NotFoundException(`Seller with ID ${sellerId} not found`);
    }

    // Set default currencies based on seller's configuration
    const actualFromCurrency = fromCurrency || seller.buyCurrency;
    const actualToCurrency = toCurrency || seller.sellCurrency;

    // Check for active negotiation with this user
    let activeNegotiation = null;
    let effectiveRate = seller.exchangeRate; // Default to seller's rate
    let isUsingNegotiatedRate = false;
    if (userId) {
      try {
        // Check if current user has an AGREED negotiation with this seller
        activeNegotiation = await this.negotiationService.getAgreedNegotiation(
          sellerId, // This should be sellOrderId
          userId, // This should be buyerId
        );
        if (activeNegotiation && activeNegotiation.status === 'agreed') {
          effectiveRate = activeNegotiation.proposedRate;
          isUsingNegotiatedRate = true;
        }
      } catch (error) {
        // If negotiation service fails, continue with original rate
        this.logger.warn(
          `Failed to check negotiation for user ${userId} and seller ${sellerId}: ${error.message}`,
        );
      }
    }

    // Validate currency support
    if (
      (actualFromCurrency !== seller.sellCurrency &&
        actualFromCurrency !== seller.buyCurrency) ||
      (actualToCurrency !== seller.sellCurrency &&
        actualToCurrency !== seller.buyCurrency)
    ) {
      throw new BadRequestException(
        `Seller doesn't support conversion between ${actualFromCurrency} and ${actualToCurrency}`,
      );
    }

    // Calculate conversion using effective rate
    let convertedAmount: number;
    let fromAmount: number;
    let toAmount: number;

    if (actualFromCurrency === 'NGN' && actualToCurrency === 'CAD') {
      // NGN to CAD: divide by rate
      fromAmount = amount;
      toAmount = amount / effectiveRate;
      convertedAmount = Math.round(toAmount * 100) / 100;
    } else if (actualFromCurrency === 'CAD' && actualToCurrency === 'NGN') {
      // CAD to NGN: multiply by rate
      fromAmount = amount;
      toAmount = amount * effectiveRate;
      convertedAmount = Math.round(toAmount * 100) / 100;
    } else {
      throw new BadRequestException(
        `Unsupported currency conversion: ${actualFromCurrency} to ${actualToCurrency}`,
      );
    }

    // Check seller's available amount
    if (
      actualToCurrency === 'CAD' &&
      convertedAmount > seller.availableAmount
    ) {
      throw new BadRequestException(
        `Amount exceeds seller's available amount of ${seller.availableAmount} ${actualToCurrency}`,
      );
    }

    // Prepare response with negotiation details
    const response: any = {
      fromAmount: fromAmount,
      fromCurrency: actualFromCurrency,
      toAmount: convertedAmount,
      toCurrency: actualToCurrency,
      rate: effectiveRate,
      rateSource: isUsingNegotiatedRate ? 'negotiated' : 'seller_original',
      isUsingNegotiatedRate: isUsingNegotiatedRate,
      originalSellerRate: seller.exchangeRate,
      sellerId: seller.id,
      sellerAvailableAmount: seller.availableAmount,
      withinLimits: convertedAmount <= seller.availableAmount,
    };

    // Add negotiation details if applicable
    if (isUsingNegotiatedRate && activeNegotiation) {
      const originalAmount =
        actualFromCurrency === 'NGN'
          ? amount / seller.exchangeRate
          : amount * seller.exchangeRate;

      const difference = convertedAmount - originalAmount;
      const percentageChange =
        ((effectiveRate - seller.exchangeRate) / seller.exchangeRate) * 100;

      response.negotiationId = activeNegotiation.id;
      response.rateComparison = {
        originalRate: seller.exchangeRate,
        negotiatedRate: effectiveRate,
        difference:
          Math.round((effectiveRate - seller.exchangeRate) * 100) / 100,
        percentageChange: Math.round(percentageChange * 100) / 100,
        buyerImpact: difference > 0 ? 'pays_more' : 'pays_less',
        amountDifference: Math.round(Math.abs(difference) * 100) / 100,
      };
    }

    return response;
  }

  async requestNegotiation(
    sellOrderId: number,
    buyerId: number,
  ): Promise<{ success: boolean; message: string }> {
    // Get the sell order with seller information
    const sellOrder = await this.p2pSellerRepository.findOne({
      where: { id: sellOrderId },
      relations: ['user'],
    });

    if (!sellOrder) {
      throw new NotFoundException(
        `Sell order with ID ${sellOrderId} not found`,
      );
    }

    // Check if sell order is available for trading
    if (sellOrder.status !== 'PENDING') {
      throw new BadRequestException(
        `Sell order is not available for negotiation. Current status: ${sellOrder.status}`,
      );
    }

    // Prevent self-negotiation
    if (sellOrder.userId === buyerId) {
      throw new ForbiddenException(
        'You cannot negotiate with your own sell order',
      );
    }

    // Get buyer information
    const buyer = await this.userRepository.findOne({
      where: { id: buyerId },
    });

    if (!buyer) {
      throw new NotFoundException('Buyer not found');
    }

    const buyerName =
      `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || 'Buyer';
    const sellerId = sellOrder.userId;

    // Simple notification message
    const notificationMessage = `${buyerName} wants to negotiate on your sell order (${sellOrder.availableAmount} ${sellOrder.sellCurrency} at ${sellOrder.exchangeRate} rate)`;

    // Send in-app notification to seller
    await this.notificationService.create({
      userId: sellerId,
      type: NotificationType.P2P_NEGOTIATION_REQUEST,
      title: 'Someone wants to negotiate!',
      body: notificationMessage,
      data: {
        sellOrderId: sellOrderId,
        buyerId: buyerId,
        buyerName: buyerName,
        sellerAmount: sellOrder.availableAmount,
        sellerRate: sellOrder.exchangeRate,
        sellCurrency: sellOrder.sellCurrency,
        buyCurrency: sellOrder.buyCurrency,
        requestType: 'negotiation_interest',
        canStartTrade: true,
      },
      action: `/p2p/sell-orders/${sellOrderId}`,
      category: 'negotiation',
      priority: 'medium',
      sendPush: true,
      senderId: buyerId,
    });

    // Send push notification to seller
    if (sellOrder.user && sellOrder.user.fcmToken) {
      await this.firebaseService.sendPushNotification(sellOrder.user.fcmToken, {
        title: 'Negotiation Interest',
        body: `${buyerName} wants to negotiate on your sell order`,
        data: {
          type: 'p2p_negotiation_request',
          sellOrderId: sellOrderId.toString(),
          buyerId: buyerId.toString(),
          buyerName: buyerName,
          action: 'view_order',
        },
      });
    }

    // this.logger.log(
    //   `Negotiation interest: Buyer ${buyerId} (${buyerName}) wants to negotiate with seller ${sellerId} on order ${sellOrderId}`
    // );

    return {
      success: true,
      message: `Negotiation request sent to seller successfully. They can now contact you to discuss terms.`,
    };
  }

  async update(
    userId: number,
    id: number,
    updateP2PSellerDto: UpdateP2PSellerDto,
  ): Promise<P2PSeller> {
    // Validate ID
    if (isNaN(id) || id <= 0) {
      throw new BadRequestException(`Invalid P2P sell order ID: ${id}`);
    }

    const sellerOrder = await this.findOne(userId, id);

    // Check if order can be updated (allow updating DRAFT and OPEN orders)
    // if (![P2POrderStatus.DRAFT, P2POrderStatus.OPEN, P2POrderStatus.PENDING].includes(sellerOrder.status)) {
    //   throw new BadRequestException(
    //     `Cannot update a sell order with status: ${sellerOrder.status}`,
    //   );
    // }

    // Validate currency pair if changed
    const newSellCurrency =
      updateP2PSellerDto.sellCurrency ?? sellerOrder.sellCurrency;
    const newBuyCurrency =
      updateP2PSellerDto.buyCurrency ?? sellerOrder.buyCurrency;

    if (newSellCurrency === newBuyCurrency) {
      throw new BadRequestException(
        'Sell currency and buy currency cannot be the same',
      );
    }

    // Validate minimum transaction limit
    const newAvailableAmount =
      updateP2PSellerDto.availableAmount ?? sellerOrder.availableAmount;
    const newMinTransactionLimit =
      updateP2PSellerDto.minTransactionLimit ?? sellerOrder.minTransactionLimit;
    if (newMinTransactionLimit > newAvailableAmount) {
      throw new BadRequestException(
        'Minimum transaction limit cannot exceed available amount',
      );
    }

    // Determine new status based on action
    let newStatus = sellerOrder.status; // Keep current status by default
    const action = updateP2PSellerDto.action;

    if (action) {
      if (action === 'publish') {
        // Validate wallet balance when publishing
        await this.validateWalletBalance(
          userId,
          newSellCurrency,
          newAvailableAmount,
        );
        newStatus = P2POrderStatus.OPEN;
      } else if (action === 'draft') {
        newStatus = P2POrderStatus.DRAFT;
      }
    }

    // Update the order
    const updateData = { ...updateP2PSellerDto };
    delete updateData.action; // Remove action from data to be saved

    this.p2pSellerRepository.merge(sellerOrder, updateData);
    sellerOrder.status = newStatus;

    return this.p2pSellerRepository.save(sellerOrder);
  }

  // Helper method to validate wallet balance
  private async validateWalletBalance(
    userId: number,
    sellCurrency: string,
    availableAmount: number,
  ): Promise<void> {
    if (sellCurrency === 'CAD') {
      const cadWallet = await this.cadWalletRepo.findOne({ where: { userId } });
      if (!cadWallet || availableAmount > cadWallet.balance) {
        throw new BadRequestException(
          `Available amount exceeds CAD wallet balance`,
        );
      }
    }

    if (sellCurrency === 'NGN') {
      const ngnWallet = await this.ngnWalletRepo.findOne({ where: { userId } });
      if (!ngnWallet || availableAmount > ngnWallet.balance) {
        throw new BadRequestException(
          `Available amount exceeds NGN wallet balance`,
        );
      }
    }
  }
  async cancel(userId: number, id: number): Promise<P2PSeller> {
    // Ensure id is a valid number
    if (isNaN(id) || id <= 0) {
      throw new BadRequestException(`Invalid P2P sell order ID: ${id}`);
    }

    const sellerOrder = await this.findOne(userId, id);

    // Check if order can be cancelled - allow DRAFT, OPEN, and PENDING
    const cancellableStatuses = [
      P2POrderStatus.DRAFT,
      P2POrderStatus.OPEN,
      P2POrderStatus.PENDING,
    ];

    // if (!cancellableStatuses.includes(sellerOrder.status)) {
    //   throw new BadRequestException(
    //     `Cannot cancel a sell order with status: ${sellerOrder.status}. Only orders with status DRAFT, OPEN, or PENDING can be cancelled.`,
    //   );
    // }

    // Check if order has active negotiations or trades
    const hasActiveNegotiations = await this.checkActiveNegotiations(id);
    const hasActiveTrades = await this.checkActiveTrades(id);

    if (hasActiveNegotiations) {
      throw new BadRequestException(
        'Cannot cancel order with active negotiations. Please resolve or cancel negotiations first.',
      );
    }

    if (hasActiveTrades) {
      throw new BadRequestException(
        'Cannot cancel order with active trades. Please complete or cancel trades first.',
      );
    }

    // Update status to cancelled
    sellerOrder.status = P2POrderStatus.CANCELLED;
    sellerOrder.isActive = false;
    // sellerOrder.cancelledAt = new Date();

    return this.p2pSellerRepository.save(sellerOrder);
  }

  // Helper method to check for active negotiations
  private async checkActiveNegotiations(sellOrderId: number): Promise<boolean> {
    const activeNegotiations = await this.negotiationRepository.count({
      where: {
        sellOrderId,
        status: In([
          NegotiationStatus.PENDING,
          NegotiationStatus.IN_PROGRESS,
          NegotiationStatus.AGREED,
        ]),
      },
    });

    return activeNegotiations > 0;
  }

  // Helper method to check for active trades
  private async checkActiveTrades(sellOrderId: number): Promise<boolean> {
    const activeTrades = await this.tradeRepository.count({
      where: {
        sellOrderId,
        status: In([
          TradeStatus.PENDING,
          TradeStatus.ACTIVE,
          TradeStatus.PAYMENT_SENT,
        ]),
      },
    });

    return activeTrades > 0;
  }
}
