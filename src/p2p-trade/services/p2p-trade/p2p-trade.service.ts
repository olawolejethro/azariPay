// src/P2P/p2p-trade/services/p2p-trade.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, MoreThan, Repository } from 'typeorm';
import { TradeStatus } from '../../../p2p-chat/entities/p2p-chat.entity/p2p-chat.entity';
import {
  CreateTradeDto,
  UpdateTradeStatusDto,
  TradeFilterDto,
} from '../../dtos/p2p-trade.dto/p2p-trade.dto';
import { FirebaseService } from '../../../firebase/firebase.service';
import { NotificationService } from '../../../notifications/notifications.service';
import { AuthService } from '../../../auth/services/auth.service';
import { P2PTrade } from 'src/p2p-trade/entities/p2p-trade.entity';
import { P2PSeller } from 'src/P2P/entities/p2p-seller.entity';
import { P2PBuyer } from 'src/P2P/entities/p2p-buyer.entity';
import { User } from 'src/auth/entities/user.entity';
import { CancelTradeDto } from 'src/p2p-trade/dtos/cancel-trade.dto';
import { NGNWalletEntity } from 'src/wallets/entities/NGNwallet.entity';
import { CADTransactionEntity } from 'src/wallets/entities/cad-transaction.entity';
import { CADWalletEntity } from 'src/wallets/entities/CADwallet.entity';
import { NotificationType } from 'src/notifications/dto/create-notification.dto/create-notification.dto';
import { EscrowService } from '../escrow.service';
import {
  CreateDisputeDto,
  DisputeResolution,
  ResolveDisputeDto,
} from 'src/p2p-trade/dtos/dispute.dto';
import {
  RateUpdateResponseDto,
  UpdateTradeRateDto,
} from 'src/p2p-trade/dtos/rate-negotiation.dto';
import {
  Negotiation,
  NegotiationStatus,
} from 'src/p2p-trade/entities/negotiation.entity';
import { NegotiationService } from './negotiation.service';
import { P2POrderStatus } from 'src/P2P/dtos/update-p2p-seller.dto';
import { NotificationsService } from 'src/common/notifications/notifications.service';
import { EncryptionService } from 'src/common/encryption/encryption.service';
import { Dispute, DisputeStatus } from 'src/p2p-trade/entities/dispute.entity';

@Injectable()
export class P2PTradeService {
  private readonly MAX_OPEN_TRADES = 3;
  private readonly MAX_OPEN_NEGOTIATIONS = 3;
  private readonly logger = new Logger(P2PTradeService.name);

  constructor(
    @InjectRepository(P2PTrade)
    private readonly tradeRepository: Repository<P2PTrade>,

    @InjectRepository(Dispute)
    private readonly disputeRepository: Repository<Dispute>,

    @InjectRepository(P2PSeller)
    private readonly sellerRepository: Repository<P2PSeller>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(NGNWalletEntity)
    private readonly ngnWalletRepository: Repository<NGNWalletEntity>,
    @InjectRepository(CADWalletEntity)
    private readonly cadWalletRepository: Repository<CADWalletEntity>,

    @InjectRepository(Negotiation)
    private readonly negotiationRepository: Repository<Negotiation>,

    @InjectRepository(P2PBuyer)
    private readonly buyerRepository: Repository<P2PBuyer>,
    private readonly firebaseService: FirebaseService,
    private readonly notificationService: NotificationService,
    private readonly notificationServices: NotificationsService,
    private readonly encryptionService: EncryptionService,
    private readonly usersService: AuthService,
    private readonly negotiationService: NegotiationService, // Replace 'any' with actual NegotiationService type when available
    private readonly escrowService: EscrowService, // Replace 'any' with actual EscrowService type when available
    private readonly datasource: DataSource,
  ) {}

  // src/p2p-trade/services/p2p-trade/p2p-trade.service.ts

  async createTrade(
    userId: number,
    createTradeDto: CreateTradeDto,
  ): Promise<P2PTrade> {
    try {
      // Find the user creating the trade
      const user = await this.usersService.findUserById(userId);
      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }
      console.log(user, 'user');
      // Check onboarding/KYC status
      const onboardingCompleted =
        user.pin !== null && user.kycStatus === 'SUCCESS';
      if (!onboardingCompleted) {
        throw new BadRequestException(
          'Onboarding not completed. Please complete KYC before initiating a p2p trade.',
        );
      }

      let buyerId: number;
      let sellerId: number;
      let buyOrder: P2PBuyer = null;
      let sellOrder: P2PSeller = null;
      let buyer: User;
      let seller: User;
      let negotiationId: number = null;
      let isNegotiated: boolean = false;
      let effectiveRate: number;
      // Determine if user is acting as buyer or seller
      if (createTradeDto.buyOrderId && !createTradeDto.sellOrderId) {
        await this.validateTradeCreationLimits(
          buyerId,
          userId,
          buyer.firstName,
        );

        // SCENARIO 1: Seller creating trade
        buyOrder = await this.buyerRepository.findOne({
          where: { id: createTradeDto.buyOrderId },
          relations: ['user'],
        });

        if (createTradeDto.convertedAmount > buyOrder.availableAmount) {
          throw new BadRequestException(
            `Trade amount ${createTradeDto.convertedAmount} ${createTradeDto.convertedCurrency} exceeds available amount ${buyOrder.availableAmount} ${buyOrder.sellCurrency}`,
          );
        }

        if (!buyOrder) {
          throw new NotFoundException(
            `Buy order with ID ${createTradeDto.buyOrderId} not found`,
          );
        }

        if (buyOrder.userId === userId) {
          throw new BadRequestException('Cannot trade with yourself');
        }

        if (buyOrder.status !== 'PENDING') {
          throw new BadRequestException(
            `Buy order is not available for trading. Current status: ${buyOrder.status}`,
          );
        }

        sellerId = userId;
        buyerId = buyOrder.userId;
        // seller = user;
        buyer =
          buyOrder.user || (await this.usersService.findUserById(buyerId));

        // Check for existing agreed negotiation
        const existingNegotiation =
          await this.negotiationService.getAgreedNegotiation(
            createTradeDto.buyOrderId,
            buyerId,
          );

        if (existingNegotiation) {
          negotiationId = existingNegotiation.id;
          isNegotiated = true;
          effectiveRate = existingNegotiation.proposedRate;
        } else {
          effectiveRate = buyOrder.exchangeRate;
        }

        // Validate seller balance and buyer requirements
        await this.validateUserWalletBalance(
          sellerId,
          createTradeDto.amount,
          createTradeDto.currency,
        );

        // Update buy order
        buyOrder.matchedSellerId = sellerId;
        buyOrder.matchedAt = new Date();
        await this.buyerRepository.save(buyOrder);
      } else if (createTradeDto.sellOrderId && !createTradeDto.buyOrderId) {
        // SCENARIO 2: Buyer creating trade
        sellOrder = await this.sellerRepository.findOne({
          where: { id: createTradeDto.sellOrderId },
          relations: ['user'],
        });

        if (!sellOrder) {
          throw new NotFoundException(
            `Sell order with ID ${createTradeDto.sellOrderId} not found`,
          );
        }

        if (sellOrder.userId === userId) {
          throw new BadRequestException('Cannot trade with yourself');
        }

        if (sellOrder.status !== 'OPEN') {
          throw new BadRequestException(
            `Sell order is not available for trading. Current status: ${sellOrder.status}`,
          );
        }

        buyerId = userId;
        sellerId = sellOrder.userId;
        buyer = user;

        // Check for existing agreed negotiation
        const existingNegotiation =
          await this.negotiationService.getAgreedNegotiation(
            createTradeDto.sellOrderId,
            buyerId,
          );
        if (existingNegotiation) {
          negotiationId = existingNegotiation.id;
          isNegotiated = true;
          effectiveRate = existingNegotiation.proposedRate;
          await this.negotiationService.markAsCompleted(negotiationId);
        } else {
          effectiveRate = sellOrder.exchangeRate;
        }

        const sellCurrency = sellOrder.sellCurrency;
        const minLimit = sellOrder.minTransactionLimit;

        let amountToCheck: number;

        if (sellCurrency === 'CAD') {
          // Seller is selling CAD, check the CAD amount
          amountToCheck =
            createTradeDto.currency === 'CAD'
              ? createTradeDto.amount
              : createTradeDto.convertedAmount;
        } else if (sellCurrency === 'NGN') {
          // Seller is selling NGN, check the NGN amount
          amountToCheck =
            createTradeDto.currency === 'NGN'
              ? createTradeDto.amount
              : createTradeDto.convertedAmount;
        }
        if (amountToCheck < minLimit) {
          throw new BadRequestException(
            `Amount ${amountToCheck} ${sellCurrency} is below minimum transaction limit of ${minLimit} ${sellCurrency}`,
          );
        }

        seller =
          sellOrder.user || (await this.usersService.findUserById(sellerId));

        await this.validateTradeCreationLimits(
          userId,
          sellerId,
          seller.firstName,
        );
        // Update sell order status to ACTIVE
        sellOrder.status = 'ACTIVE';
        sellOrder.isNegotiating = false; // Reset negotiating flag
        sellOrder.awaitingSeller = true;
        sellOrder.matchedBuyerId = buyerId;
        sellOrder.matchedAt = new Date();
        await this.sellerRepository.save(sellOrder);
      } else {
        throw new BadRequestException(
          'Either buyOrderId or sellOrderId must be provided, but not both',
        );
      }

      // Create trade entity with effective rate
      const trade = this.tradeRepository.create({
        buyerId,
        sellerId,
        buyOrderId: createTradeDto.buyOrderId,
        sellOrderId: createTradeDto.sellOrderId,
        amount: createTradeDto.amount,
        currency: createTradeDto.currency,
        convertedAmount: createTradeDto.convertedAmount,
        convertedCurrency: createTradeDto.convertedCurrency,
        rate: effectiveRate, // Use effective rate (negotiated or original)
        paymentMethod: createTradeDto.paymentMethod,
        paymentTimeLimit: createTradeDto.paymentTimeLimit ?? 1440,
        status: TradeStatus.PENDING,
        dateCreated: new Date().toISOString(),
        negotiationId: negotiationId, // Link to negotiation if exists
        isNegotiated: isNegotiated, // Flag for negotiated trades
        buyOrder: buyOrder,
        sellOrder: sellOrder,
        buyer: buyer,
        seller: seller,
      });

      const savedTrade = await this.tradeRepository.save(trade);

      // Fetch complete trade with relations
      const completeTradeWithRelations = await this.tradeRepository.findOne({
        where: { id: savedTrade.id },
        relations: ['buyer', 'seller', 'buyOrder', 'sellOrder', 'negotiation'],
      });

      // Create Firebase chat room
      await this.firebaseService.createChatRoom({
        id: savedTrade.id,
        buyerId,
        sellerId,
        amount: savedTrade.amount,
        currency: savedTrade.currency,
        convertedAmount: savedTrade.convertedAmount,
        convertedCurrency: savedTrade.convertedCurrency,
        rate: effectiveRate, // Use effective rate
        paymentMethod: savedTrade.paymentMethod,
        status: savedTrade.status,
        paymentTimeLimit: savedTrade.paymentTimeLimit,
        // isNegotiated: isNegotiated, // Include negotiation flag
      });
      // Send email notification to seller (if email exists)
      if (seller?.interacEmailAddress) {
        try {
          await this.notificationServices.sendEmail(
            seller.interacEmailAddress,
            'New P2P Trade Request',
            `Hello ${seller.firstName || 'Seller'},\nYou have a new P2P trade request from ${buyer.firstName || 'Buyer'} for ${savedTrade.amount} ${savedTrade.currency}.\nPlease log in to your account to review and proceed.\nTrade ID: ${savedTrade.id}\nThank you,\nBongopay Team`,
            `<p>Hello ${seller.firstName || 'Seller'},</p>
            <p>You have a new P2P trade request from ${buyer.firstName || 'Buyer'} for ${savedTrade.amount} ${savedTrade.currency}.</p>
            <p>Please log in to your account to review and proceed.</p>
            <p>Thank you,<br/>Bongopay Team</p>`,
          );
        } catch (emailError) {
          this.logger.error(
            `Failed to send email notification to seller: ${emailError.message}`,
            emailError.stack,
          );
        }
      }
      // Send appropriate notifications
      if (createTradeDto.buyOrderId) {
        await this.notifyBuyerOfTradeRequest(seller, buyer, savedTrade);
      } else {
        await this.notifyTradeCreation(buyer, seller, savedTrade);
      }

      return completeTradeWithRelations || savedTrade;
    } catch (error) {
      this.logger.error(
        `Failed to create trade: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // Helper method to validate seller balance
  private async validateSellerBalance(
    sellerId: number,
    createTradeDto: CreateTradeDto,
  ): Promise<void> {
    if (createTradeDto.currency === 'CAD') {
      const cadWallet = await this.cadWalletRepository.findOne({
        where: { userId: sellerId },
      });

      if (!cadWallet || cadWallet.balance < createTradeDto.amount) {
        throw new BadRequestException(
          'Insufficient CAD wallet balance for this trade',
        );
      }
    } else if (createTradeDto.currency === 'NGN') {
      const ngnWallet = await this.ngnWalletRepository.findOne({
        where: { userId: sellerId },
      });

      if (!ngnWallet || ngnWallet.balance < createTradeDto.convertedAmount) {
        throw new BadRequestException(
          'Insufficient NGN wallet balance for this trade',
        );
      }
    }
  }

  private async validateUserWalletBalance(
    userId: number,
    amount: number,
    currency: string,
  ) {
    let walletBalance = 0;

    if (currency === 'NGN') {
      const ngnWallet = await this.ngnWalletRepository.findOne({
        where: { userId },
      });
      walletBalance = ngnWallet?.balance || 0;
    } else if (currency === 'CAD') {
      const cadWallet = await this.cadWalletRepository.findOne({
        where: { userId },
      });
      walletBalance = cadWallet?.balance || 0;
    }

    if (walletBalance < amount) {
      throw new BadRequestException(
        `Insufficient wallet balance. Required: ${amount} ${currency}, Available: ${walletBalance} ${currency}`,
      );
    }
  }
  // Helper method to validate trade amounts match order requirements
  private async validateTradeAmounts(
    createTradeDto: CreateTradeDto,
    buyOrder?: P2PBuyer,
    sellOrder?: P2PSeller,
  ): Promise<void> {
    if (buyOrder) {
      // Validating against buy order
      if (createTradeDto.convertedAmount < buyOrder.minTransactionLimit) {
        throw new BadRequestException(
          `Trade amount ${createTradeDto.convertedAmount} ${createTradeDto.convertedCurrency} is below minimum limit ${buyOrder.minTransactionLimit} ${buyOrder.sellCurrency}`,
        );
      }

      if (createTradeDto.convertedAmount > buyOrder.availableAmount) {
        throw new BadRequestException(
          `Trade amount ${createTradeDto.convertedAmount} ${createTradeDto.convertedCurrency} exceeds available amount ${buyOrder.availableAmount} ${buyOrder.sellCurrency}`,
        );
      }

      // Validate exchange rate matches (with some tolerance)
      const rateDifference = Math.abs(
        createTradeDto.rate - buyOrder.exchangeRate,
      );
      if (rateDifference > 0.01) {
        // Allow 0.01 tolerance
        throw new BadRequestException(
          `Exchange rate ${createTradeDto.rate} does not match order rate ${buyOrder.exchangeRate}`,
        );
      }
    }

    if (sellOrder) {
      // Similar validation for sell order
      if (createTradeDto.amount < sellOrder.minTransactionLimit) {
        throw new BadRequestException(
          `Trade amount ${createTradeDto.amount} is below minimum limit ${sellOrder.minTransactionLimit} ${sellOrder.sellCurrency}`,
        );
      }

      if (createTradeDto.amount > sellOrder.availableAmount) {
        throw new BadRequestException(
          `Trade amount ${createTradeDto.amount} exceeds available amount ${sellOrder.availableAmount} ${sellOrder.sellCurrency}`,
        );
      }

      // Validate exchange rate
      const rateDifference = Math.abs(
        createTradeDto.rate - sellOrder.exchangeRate,
      );
      if (rateDifference > 0.01) {
        throw new BadRequestException(
          `Exchange rate ${createTradeDto.rate} does not match order rate ${sellOrder.exchangeRate}`,
        );
      }
    }
  }

  async getTrade(
    tradeId: number,
    userId: number,
    filter?: TradeFilterDto,
  ): Promise<P2PTrade> {
    // Start the query builder for trade fetching
    const queryBuilder = this.tradeRepository
      .createQueryBuilder('trade')
      .where('trade.id = :tradeId', { tradeId });

    // Apply filters if available
    if (filter) {
      this.applyFilters(queryBuilder, filter); // Assuming `applyFilters` handles various filters like status, dates, etc.
    }
    console.log('here');
    // Fetch the trade data from the database
    const trade = await queryBuilder.getOne();
    if (!trade) {
      throw new NotFoundException(`Trade with ID ${tradeId} not found`);
    }

    return trade;
  }

  async getUserTradesAsBuyer(
    userId: number,
    filter?: TradeFilterDto,
  ): Promise<P2PTrade[]> {
    const queryBuilder = this.tradeRepository
      .createQueryBuilder('trade')
      .leftJoinAndSelect('trade.seller', 'seller')
      .where('trade.buyerId = :userId', { userId });

    this.applyFilters(queryBuilder, filter);

    queryBuilder.orderBy('trade.createdAt', 'DESC');

    return await queryBuilder.getMany();
  }

  async getUserTradesAsSeller(
    userId: number,
    filter?: TradeFilterDto,
  ): Promise<{ data: P2PTrade[]; success: boolean }> {
    const queryBuilder = this.tradeRepository
      .createQueryBuilder('trade')
      .leftJoinAndSelect('trade.buyer', 'buyer')
      .where('trade.sellerId = :userId', { userId });

    this.applyFilters(queryBuilder, filter);

    queryBuilder.orderBy('trade.createdAt', 'DESC');

    const trades = await queryBuilder.getMany();
    return {
      data: trades, // Array of trades (or any other relevant data)
      success: true, // Indicates the success of the operation
    };
  }

  // async updateTradeStatus(
  //   tradeId: number,
  //   userId: number,
  //   updateStatusDto: UpdateTradeStatusDto,
  // ): Promise<P2PTrade> {
  //   // Get trade and verify access
  //   const trade = await this.getTrade(tradeId, userId);

  //   // Check permissions based on role and requested status
  //   // this.validateStatusChange(trade, userId, updateStatusDto.status);

  //   // Update trade status
  //   trade.status = updateStatusDto.status;

  //   // Set timestamps based on status
  //   if (updateStatusDto.status === TradeStatus.PAYMENT_SENT) {
  //     trade.paymentSentAt = new Date();
  //   } else if (updateStatusDto.status === TradeStatus.COMPLETED) {
  //     trade.paymentConfirmedAt = new Date();
  //   }

  //   const updatedTrade = await this.tradeRepository.save(trade);

  //   // Update status in Firebase
  //   await this.firebaseService.updateTradeStatus(
  //     Number(tradeId),
  //     updateStatusDto.status,
  //   );

  //   // Send notification to both buyer and seller if trade is cancelled
  //   if (
  //     updateStatusDto.status === TradeStatus.REJECTED ||
  //     updateStatusDto.status === TradeStatus.CANCELLED
  //   ) {
  //     const buyer = await this.userRepository.findOne({
  //       where: { id: trade.buyerId },
  //     });
  //     const seller = await this.userRepository.findOne({
  //       where: { id: trade.sellerId },
  //     });

  //     const cancelMessage = `Trade  has been cancelled by ${buyer?.firstName || 'Buyer'} ${buyer?.lastName || ''} or ${seller?.firstName || 'Seller'} ${seller?.lastName || ''}.`;

  //     // In-app notification to buyer
  //     await this.notificationService.create({
  //       userId: trade.buyerId, // Changed from 'otherUserId' to 'userId'
  //       type: NotificationType.P2P_TRADE_CANCELLED, // Use enum instead of data.type
  //       title: 'Trade Cancelled',
  //       body: `Trade has been cancelled by ${seller?.firstName}`,
  //       data: {
  //         tradeId: trade.id,
  //         sellerId: seller?.id,
  //         amount: trade.amount,
  //         currency: trade.currency,
  //         cancellationReason: 'User cancellation', // Additional context
  //       },
  //       action: `/p2p/trades/${trade.id}`,
  //       category: 'trade',
  //       priority: 'high',
  //       sendPush: true, // Explicit push notification control
  //       senderId: userId, // Track who triggered the notification
  //     });

  //     // In-app notification to seller
  //     await this.notificationService.create({
  //       userId: trade.sellerId, // Changed from 'otherUserId' to 'userId'
  //       type: NotificationType.P2P_TRADE_CANCELLED, // Use enum instead of data.type
  //       title: 'Trade Cancelled',
  //       body: `Trade has been cancelled by ${buyer?.firstName}`,
  //       data: {
  //         tradeId: trade.id,
  //         buyerId: buyer?.id,
  //         amount: trade.amount,
  //         currency: trade.currency,
  //         convertedAmount: trade.convertedAmount,
  //         convertedCurrency: trade.convertedCurrency,
  //         cancellationReason: 'User cancellation',
  //         cancelledBy: 'buyer', // Specify who cancelled
  //       },
  //       action: `/p2p/trades/${trade.id}`,
  //       category: 'trade',
  //       priority: 'high', // High priority for cancellations
  //       sendPush: true,
  //       senderId: trade.buyerId, // Buyer triggered this notification
  //     });
  //     // Push notification to buyer
  //     if (buyer?.fcmToken) {
  //       await this.firebaseService.sendPushNotification(buyer.fcmToken, {
  //         title: 'Trade Cancelled',
  //         body: cancelMessage,
  //         data: {
  //           type: 'p2p_trade_cancelled',
  //           tradeId: trade.id.toString(),
  //         },
  //       });
  //     }

  //     // Push notification to seller
  //     if (seller?.fcmToken) {
  //       await this.firebaseService.sendPushNotification(seller.fcmToken, {
  //         title: 'Trade Cancelled',
  //         body: cancelMessage,
  //         data: {
  //           type: 'p2p_trade_cancelled',
  //           tradeId: trade.id.toString(),
  //         },
  //       });
  //     }
  //   }

  //   // Notify the other party
  //   // await this.notifyStatusChange(updatedTrade, userId);

  //   return updatedTrade;
  // }

  async updateTradeStatus(
    tradeId: number,
    userId: number,
    updateStatusDto: UpdateTradeStatusDto,
  ): Promise<P2PTrade> {
    // Get trade and verify access
    const trade = await this.getTrade(tradeId, userId);

    // Check permissions based on role and requested status
    // this.validateStatusChange(trade, userId, updateStatusDto.status);

    // Update trade status
    trade.status = updateStatusDto.status;

    // Set timestamps based on status
    if (updateStatusDto.status === TradeStatus.PAYMENT_SENT) {
      trade.paymentSentAt = new Date();
    } else if (updateStatusDto.status === TradeStatus.COMPLETED) {
      trade.paymentConfirmedAt = new Date();
    }

    const updatedTrade = await this.tradeRepository.save(trade);
    const sellOrder = await this.sellerRepository.findOne({
      where: { id: trade.sellOrderId },
    });

    // If trade is cancelled, update sell order status back to OPEN

    sellOrder.status = 'OPEN';
    sellOrder.matchedBuyerId = null;
    sellOrder.matchedAt = null;
    sellOrder.isNegotiating = false;
    sellOrder.awaitingSeller = false;
    await this.sellerRepository.save(sellOrder);

    // Update status in Firebase
    await this.firebaseService.updateTradeStatus(
      Number(tradeId),
      updateStatusDto.status,
    );

    // Send notification to both buyer and seller if trade is cancelled
    if (
      updateStatusDto.status === TradeStatus.REJECTED ||
      updateStatusDto.status === TradeStatus.CANCELLED
    ) {
      const buyer = await this.userRepository.findOne({
        where: { id: trade.buyerId },
      });
      const seller = await this.userRepository.findOne({
        where: { id: trade.sellerId },
      });

      // Determine who cancelled and create dynamic messages
      const isBuyerCancelling = userId === trade.buyerId;
      const isSellerCancelling = userId === trade.sellerId;

      const cancellerName = isBuyerCancelling
        ? `${buyer?.firstName || 'Buyer'} ${buyer?.lastName || ''}`.trim()
        : `${seller?.firstName || 'Seller'} ${seller?.lastName || ''}`.trim();

      const cancellerRole = isBuyerCancelling ? 'buyer' : 'seller';

      // Dynamic messages for each recipient
      const buyerMessage = isBuyerCancelling
        ? `You have cancelled your trade for ${trade.amount} ${trade.currency}`
        : `The seller ${seller?.firstName || 'Seller'} has cancelled the trade for ${trade.amount} ${trade.currency}`;

      const sellerMessage = isSellerCancelling
        ? `You have cancelled your trade for ${trade.amount} ${trade.currency}`
        : `The buyer ${buyer?.firstName || 'Buyer'} has cancelled the trade for ${trade.amount} ${trade.currency}`;

      // Enhanced cancellation reason
      const cancellationReason = 'User cancellation';

      // In-app notification to buyer
      await this.notificationService.create({
        userId: trade.buyerId,
        type: NotificationType.P2P_TRADE_CANCELLED,
        title: 'Trade Cancelled',
        body: buyerMessage,
        data: {
          tradeId: trade.id,
          sellerId: seller?.id,
          sellerName:
            `${seller?.firstName || ''} ${seller?.lastName || ''}`.trim(),
          amount: trade.amount,
          currency: trade.currency,
          convertedAmount: trade.convertedAmount,
          convertedCurrency: trade.convertedCurrency,
          cancellationReason: cancellationReason,
          cancelledBy: cancellerRole,
          cancelledByName: cancellerName,
          isSelfCancellation: isBuyerCancelling,
          tradeStatus: updateStatusDto.status,
          cancelledAt: new Date().toISOString(),
        },
        action: `/p2p/trades/${trade.id}`,
        category: 'trade',
        priority: 'high',
        sendPush: true,
        senderId: userId,
      });

      // In-app notification to seller
      await this.notificationService.create({
        userId: trade.sellerId,
        type: NotificationType.P2P_TRADE_CANCELLED,
        title: 'Trade Cancelled',
        body: sellerMessage,
        data: {
          tradeId: trade.id,
          buyerId: buyer?.id,
          buyerName:
            `${buyer?.firstName || ''} ${buyer?.lastName || ''}`.trim(),
          amount: trade.amount,
          currency: trade.currency,
          convertedAmount: trade.convertedAmount,
          convertedCurrency: trade.convertedCurrency,
          cancellationReason: cancellationReason,
          cancelledBy: cancellerRole,
          cancelledByName: cancellerName,
          isSelfCancellation: isSellerCancelling,
          tradeStatus: updateStatusDto.status,
          cancelledAt: new Date().toISOString(),
        },
        action: `/p2p/trades/${trade.id}`,
        category: 'trade',
        priority: 'high',
        sendPush: true,
        senderId: userId,
      });

      // Push notification to buyer (if not the canceller)
      if (buyer?.fcmToken) {
        await this.firebaseService.sendPushNotification(buyer.fcmToken, {
          title: 'Trade Cancelled',
          body: buyerMessage,
          data: {
            type: 'p2p_trade_cancelled',
            tradeId: trade.id.toString(),
            cancelledBy: cancellerRole,
            amount: trade.amount.toString(),
            currency: trade.currency,
          },
        });
      }

      // Push notification to seller (if not the canceller)
      if (seller?.fcmToken) {
        await this.firebaseService.sendPushNotification(seller.fcmToken, {
          title: 'Trade Cancelled',
          body: sellerMessage,
          data: {
            type: 'p2p_trade_cancelled',
            tradeId: trade.id.toString(),
            cancelledBy: cancellerRole,
            amount: trade.amount.toString(),
            currency: trade.currency,
          },
        });
      }

      // Handle escrow refund if trade had escrow locked
      if (
        trade.status === TradeStatus.ACTIVE ||
        trade.status === TradeStatus.PAYMENT_SENT
      ) {
        try {
          // Check if there's an active escrow for this trade
          const escrow = await this.escrowService.findEscrowByTrade(trade.id);
          if (escrow && escrow.status === 'locked') {
            // Refund escrow to seller (no penalty as per your latest requirements)
            await this.escrowService.refundFunds(
              escrow.id,
              userId, // Who triggered the cancellation
              `Trade cancelled by ${cancellerRole}: ${cancellationReason}`,
            );
          }
        } catch (escrowError) {
          this.logger.error(
            `Failed to handle escrow refund for trade ${trade.id}:`,
            escrowError,
          );
          // Continue with cancellation even if escrow refund fails
        }
      }
    }

    return updatedTrade;
  }
  // Helper methods
  private applyFilters(queryBuilder: any, filter?: TradeFilterDto): void {
    if (!filter) return;

    if (filter.status) {
      queryBuilder.andWhere('trade.status = :status', {
        status: filter.status,
      });
    }

    if (filter.startDate) {
      queryBuilder.andWhere('trade.createdAt >= :startDate', {
        startDate: new Date(filter.startDate),
      });
    }

    if (filter.endDate) {
      queryBuilder.andWhere('trade.createdAt <= :endDate', {
        endDate: new Date(filter.endDate),
      });
    }
  }

  // private validateStatusChange(
  //   trade: P2PTrade,
  //   userId: number,
  //   newStatus: TradeStatus,
  // ): void {
  //   // Verify status transition is valid
  //   const validTransitions = this.getValidStatusTransitions(trade.status);
  //   if (!validTransitions.includes(newStatus)) {
  //     throw new ForbiddenException(
  //       `Cannot change status from ${trade.status} to ${newStatus}`,
  //     );
  //   }

  //   // Check if user has permission for this status change
  //   if (newStatus === TradeStatus.PAYMENT_SENT && trade.userId !== userId) {
  //     throw new ForbiddenException('Only the buyer can mark payment as sent');
  //   }

  //   if (newStatus === TradeStatus.COMPLETED && trade.sellerId !== userId) {
  //     throw new ForbiddenException('Only the seller can complete the trade');
  //   }

  //   // Either party can cancel or dispute a trade
  //   if (
  //     (newStatus === TradeStatus.CANCELLED ||
  //       newStatus === TradeStatus.DISPUTED) &&
  //     trade.userId !== userId &&
  //     trade.sellerId !== userId
  //   ) {
  //     throw new ForbiddenException(
  //       'You do not have permission to change the trade status',
  //     );
  //   }
  // }

  private getValidStatusTransitions(currentStatus: TradeStatus): TradeStatus[] {
    switch (currentStatus) {
      case TradeStatus.PENDING:
        return [
          TradeStatus.PAYMENT_SENT,
          TradeStatus.CANCELLED,
          TradeStatus.DISPUTED,
        ];
      case TradeStatus.PAYMENT_SENT:
        return [
          TradeStatus.COMPLETED,
          TradeStatus.CANCELLED,
          TradeStatus.DISPUTED,
        ];
      case TradeStatus.COMPLETED:
        return [TradeStatus.DISPUTED]; // Only disputes after completion
      case TradeStatus.CANCELLED:
        return []; // Terminal state
      case TradeStatus.DISPUTED:
        return [TradeStatus.COMPLETED, TradeStatus.CANCELLED]; // Can be resolved
      default:
        return [];
    }
  }

  private async notifyBuyerOfTradeRequest(
    seller: User,
    buyer: User,
    trade: P2PTrade,
  ): Promise<void> {
    try {
      const sellerName = seller
        ? `${seller.firstName || ''} ${seller.lastName || ''}`.trim() ||
          'Seller'
        : 'Seller';

      const buyOrder = await this.buyerRepository.findOne({
        where: { id: trade.buyOrderId },
      });

      if (buyer.fcmToken) {
        await this.firebaseService.sendPushNotification(buyer.fcmToken, {
          title: 'Someone wants to sell to you!',
          body: `${sellerName} wants to sell ${trade.amount} ${trade.currency}`,
          data: {
            type: 'p2p_trade_request',
            tradeId: trade.id.toString(),
            sellerId: seller.id.toString(),
            action: 'review_seller_request',
          },
        });
      }

      // Log for debugging
      console.log(
        `Notification sent to buyer ${buyer.id} for trade ${trade.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to notify buyer of trade request: ${error.message}`,
        error.stack,
      );
    }
  }
  private async notifyTradeCreation(
    buyer: User,
    seller: User,
    trade: P2PTrade,
  ): Promise<void> {
    try {
      const buyerName = buyer
        ? `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || 'Buyer'
        : 'Buyer';

      // Create notification for seller
      await this.notificationService.create({
        userId: trade.sellerId,
        type: NotificationType.NEW_P2P_TRADE, // Use enum instead of data.type
        title: 'New P2P Trade',
        body: `${buyerName} wants to buy ${trade.amount} ${trade.currency}`,
        data: {
          tradeId: trade.id,
          buyerId: trade.buyerId,
          buyerName: buyerName,
          amount: trade.amount,
          currency: trade.currency,
          convertedAmount: trade.convertedAmount,
          convertedCurrency: trade.convertedCurrency,
          paymentMethod: trade.paymentMethod,
          exchangeRate: trade.rate,
        },
        action: `/p2p/trades/${trade.id}`,
        category: 'trade',
        priority: 'high', // New trade requests are high priority
        sendPush: true,
        senderId: trade.buyerId, // Buyer initiated this trade
      });

      // Send push notification to seller
      const sellerOrder = await this.sellerRepository.findOne({
        where: { id: trade.sellOrderId },
      });

      // const P2PSeller = await this.usersService.findUserById(seller.userId);
      // console.log('jii');
      // console.log(P2PSeller, 'seller');
      if (seller.fcmToken) {
        await this.firebaseService.sendPushNotification(seller.fcmToken, {
          title: 'New P2P Trade',
          body: `${buyerName} wants to buy ${trade.amount} ${sellerOrder.sellCurrency}`,
          data: {
            type: 'p2p_trade_created',
            tradeId: trade.id,
          },
        });
      }
    } catch (error) {
      // this.logger.error(
      //   `Failed to send trade creation notification: ${error.message}`,
      //   error.stack,
      // );
      // Don't throw, as notification failure shouldn't break the flow
    }
  }

  // private async notifyStatusChange(
  //   trade: P2PTrade,
  //   userId: number,
  // ): Promise<void> {
  //   try {
  //     const recipientId =
  //       trade.userId === userId ? trade.sellerId : trade.userId;
  //     const actor = await this.usersService.findUserById(userId);
  //     const actorName = actor
  //       ? `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || 'User'
  //       : 'User';

  //     let title = 'P2P Trade Update';
  //     let body = `Trade status changed to ${trade.status}`;

  //     // Customize message based on status
  //     switch (trade.status) {
  //       case TradeStatus.PAYMENT_SENT:
  //         body = `${actorName} has marked payment as sent`;
  //         break;
  //       case TradeStatus.COMPLETED:
  //         body = 'Trade completed successfully';
  //         break;
  //       case TradeStatus.CANCELLED:
  //         body = `${actorName} has cancelled this trade`;
  //         break;
  //       case TradeStatus.DISPUTED:
  //         body = `${actorName} has raised a dispute for this trade`;
  //         break;
  //     }

  //     // Create notification
  //     await this.notificationService.createNotification({
  //       sellerId: recipientId,
  //       title,
  //       body,
  //       data: {
  //         type: 'p2p_trade_status_update',
  //         tradeId: trade.id,
  //         status: trade.status,
  //       },
  //       action: `/p2p/trades/${trade.id}`,
  //     });

  //     // Send push notification
  //     const recipient = await this.usersService.findUserById(recipientId);
  //     if (recipient?.fcmToken) {
  //       await this.firebaseService.sendPushNotification(recipient.fcmToken, {
  //         title,
  //         body,
  //         data: {
  //           type: 'p2p_trade_status_update',
  //           tradeId: trade.id,
  //           status: trade.status,
  //         },
  //       });
  //     }
  //   } catch (error) {
  //     this.logger.error(
  //       `Failed to send status change notification: ${error.message}`,
  //       error.stack,
  //     );
  //     // Don't throw, as notification failure shouldn't break the flow
  //   }
  // }

  // src/P2P/p2p-trade/services/p2p-trade.service.ts
  // Add this method to your service

  // Modified cancelTradeWithReason method in P2PTradeService

  /**
   * Updated cancelTradeWithReason with fee-aware escrow refund
   */
  async cancelTradeWithReason(
    tradeId: number,
    userId: number,
    cancelDto: CancelTradeDto,
  ): Promise<P2PTrade> {
    const trade = await this.getTrade(tradeId, userId);

    // Can only cancel in certain statuses
    if (
      ![
        TradeStatus.PENDING,
        TradeStatus.PAYMENT_SENT,
        TradeStatus.ACTIVE,
      ].includes(trade.status)
    ) {
      throw new ForbiddenException(
        'Cannot cancel a trade that is already completed or disputed',
      );
    }

    // If payment was sent, require confirmation
    if (trade.status === TradeStatus.PAYMENT_SENT && !cancelDto.noPaymentMade) {
      throw new BadRequestException(
        'You must confirm that no payment was made to cancel a trade in PAYMENT_SENT status',
      );
    }

    // Check if there's an active escrow that needs to be refunded
    let escrowRefunded = false;
    let escrowRefundInfo = null;

    const escrow = await this.escrowService.getEscrowByTradeId(tradeId);

    if (escrow && escrow.status === 'locked') {
      try {
        // Full refund to seller (no penalty)
        const refundResult = await this.escrowService.refundFunds(
          tradeId,
          userId,
          `Trade cancelled by user: ${cancelDto.reason}`,
        );

        escrowRefunded = true;
        escrowRefundInfo = {
          escrowId: refundResult.escrow.id,
          refundedAmount: refundResult.refundedAmount,
          refundedCurrency: refundResult.escrow.currency,
          refundedAt: refundResult.escrow.refundedAt,
          refundedToSeller: refundResult.escrow.sellerId,
        };

        this.logger.log(
          `Escrow funds fully refunded: ${refundResult.refundedAmount} ${refundResult.escrow.currency} to seller for cancelled trade ${tradeId}`,
        );
      } catch (escrowError) {
        this.logger.error(
          `Failed to refund escrow for cancelled trade ${tradeId}: ${escrowError.message}`,
          escrowError.stack,
        );
        throw new BadRequestException(
          `Unable to process escrow refund: ${escrowError.message}. Please contact support.`,
        );
      }
    }

    // Update trade status and cancellation details
    trade.status = TradeStatus.CANCELLED;
    trade.cancellationReason = cancelDto.reason;
    trade.cancelledBy = userId;
    trade.cancelledAt = new Date();

    const updatedTrade = await this.tradeRepository.save(trade);

    // Add this after the trade cancellation logic:

    // Update sell order status back to OPEN to make it available again
    if (trade.sellOrderId) {
      await this.sellerRepository.update(trade.sellOrderId, {
        status: P2POrderStatus.OPEN,
        matchedBuyerId: null,
        matchedAt: null,
        awaitingSeller: false,
        isNegotiating: false,
        updatedAt: new Date(),
      });
    }
    const sellerOrder = await this.sellerRepository.findOne({
      where: { id: trade.sellOrderId },
    });
    sellerOrder.status = 'OPEN';
    sellerOrder.isNegotiating = false;
    sellerOrder.awaitingSeller = false;
    await this.sellerRepository.save(sellerOrder);
    // Update Firebase status
    await this.firebaseService.updateTradeStatus(
      tradeId,
      TradeStatus.CANCELLED,
    );

    // Notify the other party
    const otherUserId =
      trade.buyerId === userId ? trade.sellerId : trade.buyerId;
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const userName = user
      ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User'
      : 'User';

    let cancelMessage = `${userName} cancelled the trade. Reason: ${cancelDto.reason}`;

    if (escrowRefunded && escrowRefundInfo) {
      cancelMessage += ` Seller funds (${escrowRefundInfo.refundedAmount} ${escrowRefundInfo.refundedCurrency}) have been fully refunded with no penalty.`;
    }

    // Send comprehensive cancellation notification
    await this.notificationService.create({
      userId: otherUserId,
      type: NotificationType.p2p_trade_cancelled,
      title: 'Trade Cancelled',
      body: cancelMessage,
      data: {
        tradeId: tradeId,
        cancelledBy: userId,
        cancellationReason: cancelDto.reason,
        amount: trade.amount,
        currency: trade.currency,
        convertedAmount: trade.convertedAmount,
        convertedCurrency: trade.convertedCurrency,
        tradeStatus: 'CANCELLED',
        cancelledAt: new Date().toISOString(),
        escrowRefunded: escrowRefunded,
        escrowRefundInfo: escrowRefundInfo,
        fundsRefundedToSeller: escrowRefunded,
        fullRefund: true,
      },
      action: `/p2p/trades/${tradeId}`,
      category: 'trade',
      priority: 'high',
      sendPush: true,
      senderId: userId,
    });

    return updatedTrade;
  }

  async cancelTrade(
    tradeId: number,
    userId: number,
    // cancelDto: { noPaymentMade: boolean },
  ): Promise<P2PTrade> {
    const trade = await this.getTrade(tradeId, userId);

    // Only allow cancel in certain statuses
    if (
      ![
        TradeStatus.PENDING,
        TradeStatus.PAYMENT_SENT,
        TradeStatus.ACTIVE,
      ].includes(trade.status)
    ) {
      throw new ForbiddenException(
        'Cannot cancel a trade that is already completed or disputed',
      );
    }

    // Require confirmation if payment was marked sent
    // if (trade.status === TradeStatus.PAYMENT_SENT && !cancelDto.noPaymentMade) {
    //   throw new BadRequestException(
    //     'You must confirm that no payment was made to cancel a trade in PAYMENT_SENT status',
    //   );
    // }

    // Handle escrow refund if exists
    let escrowRefunded = false;
    let escrowRefundInfo = null;

    const escrow = await this.escrowService.getEscrowByTradeId(tradeId);

    if (escrow && escrow.status === 'locked') {
      try {
        const refundResult = await this.escrowService.refundFunds(
          tradeId,
          userId,
          'Trade cancelled by user (no reason provided)',
        );

        escrowRefunded = true;
        escrowRefundInfo = {
          escrowId: refundResult.escrow.id,
          refundedAmount: refundResult.refundedAmount,
          refundedCurrency: refundResult.escrow.currency,
          refundedAt: refundResult.escrow.refundedAt,
          refundedToSeller: refundResult.escrow.sellerId,
        };

        this.logger.log(
          `Escrow funds fully refunded: ${refundResult.refundedAmount} ${refundResult.escrow.currency} to seller for cancelled trade ${tradeId}`,
        );
      } catch (escrowError) {
        this.logger.error(
          `Failed to refund escrow for cancelled trade ${tradeId}: ${escrowError.message}`,
          escrowError.stack,
        );
        throw new BadRequestException(
          `Unable to process escrow refund: ${escrowError.message}. Please contact support.`,
        );
      }
    }

    // Update trade details
    trade.status = TradeStatus.CANCELLED;
    trade.cancellationReason = null;
    trade.cancelledBy = userId;
    trade.cancelledAt = new Date();

    const updatedTrade = await this.tradeRepository.save(trade);

    // Reopen seller’s order if applicable
    if (trade.sellOrderId) {
      await this.sellerRepository.update(trade.sellOrderId, {
        status: P2POrderStatus.OPEN,
        matchedBuyerId: null,
        matchedAt: null,
        awaitingSeller: false,
        isNegotiating: false,
        updatedAt: new Date(),
      });
    }

    const sellerOrder = await this.sellerRepository.findOne({
      where: { id: trade.sellOrderId },
    });
    if (sellerOrder) {
      (sellerOrder.status = P2POrderStatus.OPEN),
        (sellerOrder.isNegotiating = false);
      sellerOrder.awaitingSeller = false;
      await this.sellerRepository.save(sellerOrder);
    }

    // Update Firebase
    await this.firebaseService.updateTradeStatus(
      tradeId,
      TradeStatus.CANCELLED,
    );

    // Notify other party
    const otherUserId =
      trade.buyerId === userId ? trade.sellerId : trade.buyerId;
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const userName = user
      ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User'
      : 'User';

    let cancelMessage = `${userName} cancelled the trade.`;

    if (escrowRefunded && escrowRefundInfo) {
      cancelMessage += ` Seller funds (${escrowRefundInfo.refundedAmount} ${escrowRefundInfo.refundedCurrency}) have been fully refunded.`;
    }

    await this.notificationService.create({
      userId: otherUserId,
      type: NotificationType.p2p_trade_cancelled,
      title: 'Trade Cancelled',
      body: cancelMessage,
      data: {
        tradeId,
        cancelledBy: userId,
        cancellationReason: null,
        amount: trade.amount,
        currency: trade.currency,
        convertedAmount: trade.convertedAmount,
        convertedCurrency: trade.convertedCurrency,
        tradeStatus: 'CANCELLED',
        cancelledAt: new Date().toISOString(),
        escrowRefunded,
        escrowRefundInfo,
        fundsRefundedToSeller: escrowRefunded,
        fullRefund: true,
      },
      action: `/p2p/trades/${tradeId}`,
      category: 'trade',
      priority: 'high',
      sendPush: true,
      senderId: userId,
    });

    return updatedTrade;
  }

  /**
   * Check if a user has any open/pending trades with negotiation context
   */
  async checkUserHasOpenTrades(userId: number): Promise<{
    currentTime: string;
    hasOpenTrades: boolean;
    count: number;
    hasActiveNegotiations: boolean;
    negotiationCount: number;
    hasAgreedNegotiations: boolean; // NEW
    agreedNegotiationCount: number;
    agreedNegotiations?: any[];
    // hasActiveSellOrders: boolean; // NEW
    activeSellOrderCount: number; // NEW
    // hasAnyOpenActivity: boolean; // NEW - Overall indicator
    trades?: any[];
    activeNegotiations?: any[];
    activeSellOrders?: any[]; // NEW
    sessionId: any;
  }> {
    // Existing trade query
    const openTrades = await this.tradeRepository
      .createQueryBuilder('trade')
      .leftJoinAndSelect('trade.buyer', 'buyer')
      .leftJoinAndSelect('trade.seller', 'seller')
      .leftJoinAndSelect('trade.sellOrder', 'sellOrder')
      .leftJoinAndSelect('trade.buyOrder', 'buyOrder')
      .leftJoinAndSelect('trade.negotiation', 'negotiation')
      .where(
        '(trade.buyerId = :userId OR trade.sellerId = :userId) AND trade.status IN (:...statuses)',
        {
          userId,
          statuses: [
            TradeStatus.PENDING,
            TradeStatus.PAYMENT_SENT,
            TradeStatus.ACTIVE,
          ],
        },
      )
      .orderBy('trade.createdAt', 'DESC')
      .getMany();

    // Existing negotiation query
    const activeNegotiations = await this.negotiationRepository
      .createQueryBuilder('negotiation')
      .leftJoinAndSelect('negotiation.buyer', 'buyer')
      .leftJoinAndSelect('negotiation.seller', 'seller')
      .leftJoinAndSelect('negotiation.sellOrder', 'sellOrder')
      .where(
        '(negotiation.buyerId = :userId OR negotiation.sellerId = :userId) AND negotiation.status IN (:...statuses)',
        {
          userId,
          statuses: [NegotiationStatus.PENDING, NegotiationStatus.IN_PROGRESS],
        },
      )
      .andWhere('negotiation.expiresAt > :now', { now: new Date() })
      .orderBy('negotiation.createdAt', 'DESC')
      .getMany();

    // NEW: Check for user's sell orders that are currently busy
    const activeSellOrders = await this.sellerRepository
      .createQueryBuilder('sellOrder')
      .leftJoinAndSelect('sellOrder.user', 'user')
      .where('sellOrder.userId = :userId', { userId })
      .andWhere(
        '(sellOrder.awaitingSeller = true OR sellOrder.isNegotiating = true)',
      )
      .andWhere('sellOrder.status IN (:...statuses)', {
        statuses: ['ACTIVE'],
      })
      .orderBy('sellOrder.createdAt', 'DESC')
      .getMany();

    // Transform active sell orders
    // Transform active sell orders
    // const simplifiedSellOrders = activeSellOrders.map((order) => ({
    //   id: order.id,
    //   type: 'sell_order',
    //   userId: order.userId,
    //   sellCurrency: order.sellCurrency,
    //   buyCurrency: order.buyCurrency,
    //   exchangeRate: parseFloat(order.exchangeRate.toString()),
    //   availableAmount: parseFloat(order.availableAmount.toString()),
    //   minTransactionLimit: parseFloat(order.minTransactionLimit.toString()),
    //   transactionDuration: order.transactionDuration,
    //   isActive: order.isActive,
    //   status: order.status,
    //   awaitingSeller: order.awaitingSeller,
    //   isNegotiating: order.isNegotiating,

    //   // Payment details
    //   bankName: order.bankName,
    //   accountNumber: order.accountNumber,
    //   accountName: order.accountName,
    //   interacEmail: order.interacEmail,

    //   // Terms and stats
    //   termsOfPayment: order.termsOfPayment,
    //   completedTrades: order.completedTrades,
    //   totalTrades: order.totalTrades,
    //   totalReviews: order.totalReviews,
    //   rating: parseFloat(order.rating.toString()),
    //   completionRate: parseFloat(order.completionRate.toString()),

    //   // Matching info
    //   matchedBuyerId: order.matchedBuyerId,
    //   matchedAt: order.matchedAt,
    //   completedAt: order.completedAt,

    //   // Activity context
    //   activityType: order.awaitingSeller
    //     ? 'pending_trades'
    //     : 'active_negotiations',
    //   reason: order.awaitingSeller
    //     ? 'You have pending trade requests that need your attention'
    //     : 'Your order is currently being negotiated',

    //   // Seller information
    //   seller: {
    //     id: order.userId,
    //     firstName: order.user?.firstName,
    //     lastName: order.user?.lastName,
    //     fullName:
    //       `${order.user?.firstName || ''} ${order.user?.lastName || ''}`.trim() ||
    //       'Unknown Seller',
    //   },

    //   // Timestamps
    //   createdAt: order.createdAt,
    //   updatedAt: order.updatedAt,
    // }));

    // Existing transformations...
    const simplifiedNegotiations = activeNegotiations.map((negotiation) => {
      const isUserBuyer = negotiation.buyerId === userId;
      const timeRemaining = Math.max(
        0,
        Math.floor(
          (negotiation.expiresAt.getTime() - Date.now()) / (1000 * 60),
        ),
      );

      return {
        id: negotiation.id,
        type: 'negotiation',
        sellOrderId: negotiation.sellOrderId,
        status: negotiation.status,
        originalRate: negotiation.originalRate,
        proposedRate: negotiation.proposedRate,
        rateChange: {
          difference: negotiation.proposedRate - negotiation.originalRate,
          percentage:
            ((negotiation.proposedRate - negotiation.originalRate) /
              negotiation.originalRate) *
            100,
        },
        expiresAt: negotiation.expiresAt,
        timeRemaining: timeRemaining,
        userRole: isUserBuyer ? 'buyer' : 'seller',
        counterparty: {
          id: isUserBuyer ? negotiation.sellerId : negotiation.buyerId,
          name: isUserBuyer
            ? `${negotiation.seller?.firstName || ''} ${negotiation.seller?.lastName || ''}`.trim() ||
              'Seller'
            : `${negotiation.buyer?.firstName || ''} ${negotiation.buyer?.lastName || ''}`.trim() ||
              'Buyer',
        },
        sellOrder: {
          id: negotiation.sellOrder?.id,
          userId: negotiation.sellOrder?.userId,
          sellCurrency: negotiation.sellOrder?.sellCurrency,
          buyCurrency: negotiation.sellOrder?.buyCurrency,
          exchangeRate: parseFloat(
            negotiation.sellOrder?.exchangeRate?.toString() || '0',
          ),
          availableAmount: Math.max(
            0,
            parseFloat(
              negotiation.sellOrder?.availableAmount?.toString() || '0',
            ),
          ),
          minTransactionLimit: parseFloat(
            negotiation.sellOrder?.minTransactionLimit?.toString() || '0',
          ),
          transactionDuration: negotiation.sellOrder?.transactionDuration,
          isActive: negotiation.sellOrder?.isActive,
          status: negotiation.sellOrder?.status,
          awaitingSeller: negotiation.sellOrder?.awaitingSeller,
          isNegotiating: negotiation.sellOrder?.isNegotiating,

          // Payment details
          bankName: negotiation.sellOrder?.bankName,
          accountNumber: negotiation.sellOrder?.accountNumber,
          accountName: negotiation.sellOrder?.accountName,
          interacEmail: negotiation.sellOrder?.interacEmail,

          // Terms and stats
          termsOfPayment: negotiation.sellOrder?.termsOfPayment,
          completedTrades: negotiation.sellOrder?.completedTrades,
          totalTrades: negotiation.sellOrder?.totalTrades,
          totalReviews: negotiation.sellOrder?.totalReviews,
          rating: parseFloat(negotiation.sellOrder?.rating?.toString() || '0'),
          completionRate: parseFloat(
            negotiation.sellOrder?.completionRate?.toString() || '0',
          ),

          // Matching info
          matchedBuyerId: negotiation.sellOrder?.matchedBuyerId,
          matchedAt: negotiation.sellOrder?.matchedAt,
          completedAt: negotiation.sellOrder?.completedAt,

          // Full seller name
          sellerFullName:
            `${negotiation.seller?.firstName || ''} ${negotiation.seller?.lastName || ''}`.trim() ||
            'Unknown Seller',

          // Timestamps
          createdAt: negotiation.sellOrder?.createdAt,
          updatedAt: negotiation.sellOrder?.updatedAt,
        },
        createdAt: negotiation.createdAt,
        updatedAt: negotiation.updatedAt,
      };
    });

    const agreedNegotiations = await this.negotiationRepository
      .createQueryBuilder('negotiation')
      .leftJoinAndSelect('negotiation.buyer', 'buyer')
      .leftJoinAndSelect('negotiation.seller', 'seller')
      .leftJoinAndSelect('negotiation.sellOrder', 'sellOrder')
      .leftJoinAndSelect('sellOrder.user', 'sellerUser')
      .where(
        '(negotiation.buyerId = :userId OR negotiation.sellerId = :userId) AND negotiation.status = :status',
        {
          userId,
          status: NegotiationStatus.AGREED,
        },
      )
      .andWhere('negotiation.tradeCreationDeadline > :now', { now: new Date() })
      .orderBy('negotiation.agreedAt', 'DESC')
      .getMany();

    // Transform AGREED negotiations
    // Transform AGREED negotiations
    const simplifiedAgreedNegotiations = agreedNegotiations.map(
      (negotiation) => {
        const isUserBuyer = negotiation.buyerId === userId;
        const timeToDeadline = Math.max(
          0,
          Math.floor(
            (negotiation.tradeCreationDeadline.getTime() - Date.now()) /
              (1000 * 60),
          ),
        );

        return {
          id: negotiation.id,
          type: 'agreed_negotiation',
          sellOrderId: negotiation.sellOrderId,
          status: negotiation.status,
          originalRate: negotiation.originalRate,
          agreedRate: negotiation.proposedRate,
          rateChange: {
            difference: negotiation.proposedRate - negotiation.originalRate,
            percentage:
              ((negotiation.proposedRate - negotiation.originalRate) /
                negotiation.originalRate) *
              100,
          },
          agreedAt: negotiation.agreedAt?.toISOString() || null,
          agreedBy: negotiation.agreedBy,
          tradeCreationDeadline:
            negotiation.tradeCreationDeadline?.toISOString() || null,
          timeToDeadline: timeToDeadline,
          isDeadlineSoon: timeToDeadline <= 60, // Less than 1 hour
          userRole: isUserBuyer ? 'buyer' : 'seller',
          canCreateTrade: isUserBuyer, // Only buyer can create trade
          counterparty: {
            id: isUserBuyer ? negotiation.sellerId : negotiation.buyerId,
            name: isUserBuyer
              ? `${negotiation.seller?.firstName || ''} ${negotiation.seller?.lastName || ''}`.trim() ||
                'Seller'
              : `${negotiation.buyer?.firstName || ''} ${negotiation.buyer?.lastName || ''}`.trim() ||
                'Buyer',
          },
          sellOrder: {
            id: negotiation.sellOrder?.id,
            userId: negotiation.sellOrder?.userId,
            sellCurrency: negotiation.sellOrder?.sellCurrency,
            buyCurrency: negotiation.sellOrder?.buyCurrency,
            availableAmount: parseFloat(
              negotiation.sellOrder?.availableAmount?.toString() || '0',
            ).toFixed(2),
            exchangeRate: parseFloat(
              negotiation.sellOrder?.exchangeRate?.toString() || '0',
            ).toFixed(2),
            minTransactionLimit: parseFloat(
              negotiation.sellOrder?.minTransactionLimit?.toString() || '0',
            ).toFixed(2),
            transactionDuration: negotiation.sellOrder?.transactionDuration,
            isActive: negotiation.sellOrder?.isActive,
            status: negotiation.sellOrder?.status,
            matchedBuyerId: negotiation.sellOrder?.matchedBuyerId,
            matchedAt: negotiation.sellOrder?.matchedAt,
            completedAt: negotiation.sellOrder?.completedAt,
            completedTrades: negotiation.sellOrder?.completedTrades,
            totalReviews: negotiation.sellOrder?.totalReviews,
            totalTrades: negotiation.sellOrder?.totalTrades,
            bankName: negotiation.sellOrder?.bankName,
            accountNumber: negotiation.sellOrder?.accountNumber,
            accountName: negotiation.sellOrder?.accountName,
            interacEmail: negotiation.sellOrder?.interacEmail,
            completionRate: parseFloat(
              negotiation.sellOrder?.completionRate?.toString() || '0',
            ).toFixed(2),
            termsOfPayment: negotiation.sellOrder?.termsOfPayment,
            rating: parseFloat(
              negotiation.sellOrder?.rating?.toString() || '0',
            ).toFixed(1),
            awaitingSeller: negotiation.sellOrder?.awaitingSeller,
            isNegotiating: negotiation.sellOrder?.isNegotiating,
            createdAt: negotiation.sellOrder?.createdAt,
            updatedAt: negotiation.sellOrder?.updatedAt,
            user: {
              firstName: negotiation.sellOrder?.user?.firstName,
              lastName: negotiation.sellOrder?.user?.lastName,
              rating: parseFloat(
                negotiation.sellOrder?.user?.rating?.toString() || '0',
              ).toFixed(1),
              createdAt: negotiation.sellOrder?.user?.createdAt,
            },
          },
          createdAt: negotiation.createdAt,
          updatedAt: negotiation.updatedAt,
        };
      },
    );
    // Existing trade transformation...
    const simplifiedTrades = openTrades.map((trade) => {
      const isBuyer = trade.buyerId === userId;
      const isSeller = trade.sellerId === userId;

      let effectiveRate = trade.rate;
      let rateSource = 'original';

      if (trade.negotiation) {
        effectiveRate = trade.negotiation.proposedRate;
        rateSource = 'negotiated';
      }

      const tradeData: any = {
        id: trade.id,
        type: 'trade',
        status: trade.status,
        amount: trade.amount,
        currency: trade.currency,
        convertedAmount: trade.convertedAmount,
        convertedCurrency: trade.convertedCurrency,
        paymentMethod: trade.paymentMethod,
        createdAt: trade.acceptedAt ? trade.acceptedAt : trade.createdAt,
        updatedAt: trade.updatedAt,
        isBuyer: isBuyer,
        isSeller: isSeller,
        originalRate: trade.rate,
        effectiveRate: effectiveRate,
        rateSource: rateSource,
        isNegotiated: trade.isNegotiated,
        negotiationId: trade.negotiationId,
        // Split sellOrder into core info and payment details for clarity

        sellOrder: trade.sellOrder
          ? {
              id: trade.sellOrder.id,
              userId: trade.sellOrder.userId,
              sellCurrency: trade.sellOrder.sellCurrency,
              buyCurrency: trade.sellOrder.buyCurrency,
              exchangeRate: trade.sellOrder.exchangeRate,
              availableAmount: trade.sellOrder.availableAmount,
              minTransactionLimit: trade.sellOrder.minTransactionLimit,
              transactionDuration: trade.sellOrder.transactionDuration,
              isActive: trade.sellOrder.isActive,
              status: trade.sellOrder.status,
              awaitingSeller: trade.sellOrder.awaitingSeller,
              isNegotiating: trade.sellOrder.isNegotiating,
              matchedBuyerId: trade.sellOrder.matchedBuyerId,
              matchedAt: trade.sellOrder.matchedAt,
              completedAt: trade.sellOrder.completedAt,
              completedTrades: trade.sellOrder.completedTrades,
              totalTrades: trade.sellOrder.totalTrades,
              totalReviews: trade.sellOrder.totalReviews,
              rating: trade.seller.rating,
              completionRate: trade.sellOrder.completionRate,
              termsOfPayment: trade.sellOrder.termsOfPayment,
              createdAt: trade.sellOrder.createdAt,
              updatedAt: trade.sellOrder.updatedAt,

              // Payment details separated for clarity
              paymentDetails: {
                bankName: trade.sellOrder.bankName,
                accountNumber: trade.sellOrder.accountNumber,
                accountName: trade.sellOrder.accountName,
                interacEmail: trade.sellOrder.interacEmail,
              },
            }
          : null,
        // sellOrder: trade.sellOrder,
        buyOrder: trade.buyOrder,
      };

      if (isBuyer) {
        tradeData.seller = trade.seller
          ? {
              id: trade.seller.id,
              firstName: trade.seller.firstName,
              lastName: trade.seller.lastName,
            }
          : null;
      }

      if (isSeller) {
        tradeData.buyer = trade.buyer
          ? {
              id: trade.buyer.id,
              firstName: trade.buyer.firstName,
              lastName: trade.buyer.lastName,
            }
          : null;
      }

      return tradeData;
    });

    const formattedCurrentTime = new Intl.DateTimeFormat('en-NG', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date());

    // Calculate if user has any open activities
    const hasAnyOpenActivity =
      openTrades.length > 0 ||
      activeNegotiations.length > 0 ||
      activeSellOrders.length > 0;

    const generateSessionId = (): string => {
      const timestamp = Date.now().toString(); // 13 digits
      const random = Math.floor(Math.random() * 100000)
        .toString()
        .padStart(5, '0'); // 5 digits
      return timestamp + random; // 18 digits total
    };

    return {
      sessionId: generateSessionId(),
      hasOpenTrades: openTrades.length > 0,
      hasAgreedNegotiations: agreedNegotiations.length > 0, // NEW
      agreedNegotiationCount: agreedNegotiations.length, // NEW
      count: openTrades.length,
      hasActiveNegotiations: activeNegotiations.length > 0,
      negotiationCount: activeNegotiations.length,
      agreedNegotiations: simplifiedAgreedNegotiations, // NEW
      // hasActiveSellOrders: activeSellOrders.length > 0, // NEW
      activeSellOrderCount: activeSellOrders.length, // NEW
      // hasAnyOpenActivity: hasAnyOpenActivity, // NEW - Overall indicator
      trades: simplifiedTrades,
      activeNegotiations: simplifiedNegotiations,
      // activeSellOrders: simplifiedSellOrders, // NEW
      currentTime: formattedCurrentTime,
    };
  }
  // Updated escrow methods in P2PTradeService to use effective rates
  async getTradeHistory(
    userId: number,
    query: {
      page?: number;
      limit?: number;
      role?: 'buyer' | 'seller';
    },
  ): Promise<{
    trades: any[];
    pagination: any;
  }> {
    // Validate userId to prevent NaN error
    if (isNaN(Number(userId)) || !userId) {
      throw new BadRequestException('Invalid user ID provided');
    }

    const { page = 1, limit = 20, role } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.tradeRepository
      .createQueryBuilder('trade')
      .leftJoinAndSelect('trade.buyer', 'buyer')
      .leftJoinAndSelect('trade.seller', 'seller')
      .leftJoinAndSelect('trade.sellOrder', 'sellOrder')
      .leftJoinAndSelect('trade.buyOrder', 'buyOrder');

    // Apply role-specific filtering
    if (role === 'buyer') {
      queryBuilder.where('trade.buyerId = :userId', { userId });
    } else if (role === 'seller') {
      queryBuilder.where('trade.sellerId = :userId', { userId });
    } else {
      queryBuilder.where(
        '(trade.buyerId = :userId OR trade.sellerId = :userId)',
        { userId },
      );
    }

    // Always filter by completed status only
    queryBuilder.andWhere('trade.status = :status', {
      status: TradeStatus.COMPLETED,
    });

    queryBuilder.orderBy('trade.createdAt', 'DESC').skip(skip).take(limit);

    const [trades, total] = await queryBuilder.getManyAndCount();

    const formattedTrades = trades.map((trade) => {
      const isUserBuyer = trade.buyerId === userId;
      const counterparty = isUserBuyer ? trade.seller : trade.buyer;

      return {
        id: trade.id,
        counterparty: {
          name: `${counterparty?.firstName || ''} ${counterparty?.lastName || ''}`.trim(),
          rating: isUserBuyer
            ? trade.sellOrder?.rating || 0
            : trade.buyOrder?.rating || 0,
        },
        rate: `${trade.rate} ${trade.currency}/${trade.convertedCurrency}`,
        amounts: `${trade.amount} ${trade.currency} / ${trade.convertedAmount} ${trade.convertedCurrency}`,
        status: trade.status,
        // date: this.formatDate(trade.createdAt),
        userRole: isUserBuyer ? 'buyer' : 'seller',
        paymentMethod: trade.paymentMethod,
        createdAt: trade.createdAt,
      };
    });

    return {
      trades: formattedTrades,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  /**
   * Updated notifySellerToProceed with effective rate integration
   */
  async notifySellerToProceed(
    tradeId: number,
    buyerId: number,
  ): Promise<{
    success: boolean;
    message: string;
    trade: P2PTrade;
    escrow?: any;
    fees?: any;
  }> {
    const trade = await this.tradeRepository.findOne({
      where: { id: tradeId },
      relations: ['sellOrder', 'buyOrder', 'seller', 'buyer'],
    });

    if (!trade) {
      throw new NotFoundException(`Trade with ID ${tradeId} not found`);
    }

    if (
      trade.status !== TradeStatus.PENDING &&
      trade.status !== TradeStatus.ACTIVE
    ) {
      throw new ForbiddenException(
        'Can only notify seller for trades in PENDING or ACTIVE status',
      );
    }

    // Update trade status to ACTIVE
    trade.status = TradeStatus.ACTIVE;

    // 🔥 USE EFFECTIVE RATE: Get negotiated rate if available, otherwise original
    const effectiveRate = trade.getEffectiveRate();
    const effectiveAmounts = trade.calculateEffectiveAmounts();

    // Determine escrow lock details based on effective rate calculations
    let lockAmount: number;
    let lockCurrency: string;

    if (trade.sellOrderId) {
      // Scenario 1: Seller created sell order
      lockAmount = effectiveAmounts.baseAmount; // CAD amount based on effective rate
      lockCurrency = effectiveAmounts.baseCurrency; // CAD
    } else if (trade.buyOrderId) {
      // Scenario 2: Buyer created buy order
      lockAmount = effectiveAmounts.quoteAmount; // NGN amount based on effective rate
      lockCurrency = effectiveAmounts.quoteCurrency; // NGN
    } else {
      throw new BadRequestException(
        'Trade must have either sellOrderId or buyOrderId',
      );
    }

    // Lock seller funds in escrow using effective rate calculations
    let escrowResult: any = null;

    try {
      escrowResult = await this.escrowService.lockFunds(
        tradeId,
        trade.sellerId,
        trade.buyerId,
        lockAmount,
        lockCurrency,
        `Escrow lock for P2P trade ${tradeId} - Rate: ${effectiveRate} (${trade.hasNegotiatedRate() ? 'negotiated' : 'original'})`,
      );

      this.logger.log(
        `Escrow created with effective rate ${effectiveRate}: ${lockAmount} ${lockCurrency} locked + ${escrowResult.lockFee} ${lockCurrency} fee for trade ${tradeId}`,
      );
    } catch (escrowError) {
      this.logger.error(
        `Failed to lock funds in escrow: ${escrowError.message}`,
      );
      throw new BadRequestException(
        `Unable to secure seller funds: ${escrowError.message}`,
      );
    }

    const buyer =
      trade.buyer ||
      (await this.userRepository.findOne({ where: { id: buyerId } }));
    const seller =
      trade.seller ||
      (await this.userRepository.findOne({ where: { id: trade.sellerId } }));

    if (!seller) {
      throw new NotFoundException(`Seller not found`);
    }

    const buyerName = buyer
      ? `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || 'Buyer'
      : 'Buyer';

    // Enhanced notification message with rate information
    const rateDescription = trade.hasNegotiatedRate()
      ? `negotiated rate of ${effectiveRate}`
      : `rate of ${effectiveRate}`;

    const notificationMessage = `${buyerName} is ready to send payment. Your funds (${escrowResult.netAmountLocked} ${lockCurrency}) are secured in escrow using ${rateDescription}.`;

    await this.tradeRepository.save(trade);

    // Update buy order completion rate if exists
    if (trade.buyOrderId) {
      const buyOrder = await this.buyerRepository.findOne({
        where: { id: trade.buyOrderId },
      });
      if (buyOrder) {
        buyOrder.completionRate = 30;
        await this.buyerRepository.save(buyOrder);
      }
    }

    // Send enhanced notification with rate details
    await this.notificationService.create({
      userId: trade.sellerId,
      type: NotificationType.P2P_PAYMENT_CONFIRMATION,
      title: 'Payment Confirmation - Funds Secured',
      body: notificationMessage,
      data: {
        tradeId: tradeId,
        buyerId: buyerId,
        buyerName: buyerName,
        // Original trade amounts
        originalAmount: trade.amount,
        originalCurrency: trade.currency,
        originalConvertedAmount: trade.convertedAmount,
        originalConvertedCurrency: trade.convertedCurrency,
        // Effective rate information
        effectiveRate: effectiveRate,
        originalOrderRate: trade.sellOrder?.exchangeRate || trade.rate,
        rateNegotiated: trade.hasNegotiatedRate(),
        rateSource: trade.hasNegotiatedRate() ? 'negotiated' : 'original',
        // Effective amounts
        effectiveBaseAmount: effectiveAmounts.baseAmount,
        effectiveQuoteAmount: effectiveAmounts.quoteAmount,
        effectiveBaseCurrency: effectiveAmounts.baseCurrency,
        effectiveQuoteCurrency: effectiveAmounts.quoteCurrency,
        // Escrow details
        escrowLocked: true,
        escrowAmount: escrowResult.netAmountLocked,
        escrowCurrency: lockCurrency,
        escrowId: escrowResult.escrow.id,
        escrowLockFee: escrowResult.lockFee,
        totalSellerDeduction:
          Number(escrowResult.netAmountLocked) + Number(escrowResult.lockFee),
        // Trade status
        tradeStatus: 'ACTIVE',
        confirmedAt: new Date().toISOString(),
        fundsSecured: true,
      },
      action: `/p2p/trades/${tradeId}`,
      category: 'payment',
      priority: 'high',
      sendPush: true,
      senderId: buyerId,
    });

    return {
      success: true,
      message: `Notification sent successfully. Funds secured in escrow using ${rateDescription}.`,
      trade: trade,
      escrow: escrowResult.escrow,
      fees: {
        lockFee: escrowResult.lockFee,
        netAmountLocked: escrowResult.netAmountLocked,
        totalDeducted:
          Number(escrowResult.netAmountLocked) + Number(escrowResult.lockFee),
        effectiveRate: effectiveRate,
        rateUsed: trade.hasNegotiatedRate() ? 'negotiated' : 'original',
        lockCurrency: lockCurrency,
      },
    };
  }

  /**
   * Updated notifyBuyerToProceed with effective rate integration
   */
  async notifyBuyerToProceed(
    tradeId: number,
    sellerId: number,
  ): Promise<{
    success: boolean;
    message: string;
    trade: P2PTrade;
    escrow?: any;
    fees?: any;
  }> {
    const trade = await this.tradeRepository.findOne({
      where: { id: tradeId },
      relations: ['sellOrder', 'buyOrder', 'seller', 'buyer'],
    });

    if (!trade) {
      throw new NotFoundException(`Trade with ID ${tradeId} not found`);
    }

    if (trade.sellerId !== sellerId) {
      throw new ForbiddenException(
        'Only the seller can send this notification',
      );
    }

    if (
      trade.status !== TradeStatus.PENDING &&
      trade.status !== TradeStatus.ACTIVE
    ) {
      throw new ForbiddenException('oops this trade is not active anymore');
    }
    // Generate current timestamp for acceptedAt
    const acceptedAtTimestamp = new Date();
    // 🔥 USE EFFECTIVE RATE: Get negotiated rate if available, otherwise original
    const effectiveRate = trade.getEffectiveRate();
    const effectiveAmounts = trade.calculateEffectiveAmounts();

    // Determine escrow lock details based on effective rate calculations
    let lockAmount: number;
    let lockCurrency: string;

    if (trade.sellOrderId) {
      // Scenario 1: Seller created sell order
      lockAmount = trade.amount;
      lockCurrency = trade.currency;
    } else if (trade.buyOrderId) {
      // Scenario 2: Buyer created buy order
      lockAmount = effectiveAmounts.quoteAmount; // NGN amount
      lockCurrency = effectiveAmounts.quoteCurrency; // NGN
    } else {
      throw new BadRequestException(
        'Trade must have either sellOrderId or buyOrderId',
      );
    }

    // Lock seller funds in escrow using effective rate calculations
    let escrowResult: any = null;

    try {
      escrowResult = await this.escrowService.lockFunds(
        tradeId,
        trade.sellOrderId,
        trade.buyerId,
        lockAmount,
        lockCurrency,
        `Escrow lock for P2P trade ${tradeId} - Seller ready. Rate: ${effectiveRate} (${trade.hasNegotiatedRate() ? 'negotiated' : 'original'})`,
      );

      this.logger.log(
        `Escrow created by seller with effective rate ${effectiveRate}: ${lockAmount} ${lockCurrency} locked + ${escrowResult.lockFee} ${lockCurrency} fee for trade ${tradeId}`,
      );
    } catch (escrowError) {
      this.logger.error(
        `Failed to lock seller funds in escrow: ${escrowError.message}`,
      );
      throw new BadRequestException(
        `Unable to secure seller funds: ${escrowError.message}`,
      );
    }

    // Update trade status
    trade.status = TradeStatus.ACTIVE;
    trade.acceptedAt = acceptedAtTimestamp;

    const buyer =
      trade.buyer ||
      (await this.userRepository.findOne({ where: { id: trade.buyerId } }));
    const seller =
      trade.seller ||
      (await this.userRepository.findOne({ where: { id: sellerId } }));

    if (!buyer) {
      throw new NotFoundException(`Buyer not found`);
    }

    const sellerName = seller
      ? `${seller.firstName || ''} ${seller.lastName || ''}`.trim() || 'Seller'
      : 'Seller';

    // Enhanced notification message with rate information
    const rateDescription = trade.hasNegotiatedRate()
      ? `negotiated rate of ${effectiveRate}`
      : `rate of ${effectiveRate}`;

    const notificationMessage = `${sellerName} is ready to receive your payment. Seller funds  are secured in escrow using ${rateDescription} for your protection.`;

    await this.tradeRepository.save(trade);

    // Send enhanced notification with rate details
    await this.notificationService.create({
      userId: trade.buyerId,
      type: NotificationType.p2p_seller_ready,
      title: 'Payment Reminder - Seller Funds Secured',
      body: notificationMessage,
      data: {
        tradeId: tradeId,
        sellerId: sellerId,
        sellerName: sellerName,
        // Original trade amounts
        originalAmount: trade.amount,
        originalCurrency: trade.currency,
        originalConvertedAmount: trade.convertedAmount,
        originalConvertedCurrency: trade.convertedCurrency,
        // Effective rate information
        effectiveRate: effectiveRate,
        originalOrderRate: trade.sellOrder?.exchangeRate || trade.rate,
        rateNegotiated: trade.hasNegotiatedRate(),
        rateSource: trade.hasNegotiatedRate() ? 'negotiated' : 'original',
        // Effective amounts
        effectiveBaseAmount: effectiveAmounts.baseAmount,
        effectiveQuoteAmount: effectiveAmounts.quoteAmount,
        effectiveBaseCurrency: effectiveAmounts.baseCurrency,
        effectiveQuoteCurrency: effectiveAmounts.quoteCurrency,
        // Escrow protection details
        escrowLocked: true,
        escrowAmount: escrowResult.netAmountLocked,
        escrowCurrency: lockCurrency,
        escrowId: escrowResult.escrow.id,
        sellerFundsSecured: true,
        buyerProtected: true,
        escrowLockFee: escrowResult.lockFee,
        totalSellerDeduction:
          Number(escrowResult.netAmountLocked) + Number(escrowResult.lockFee),
        // Trade status
        tradeStatus: 'ACTIVE',
        sellerReadyAt: new Date().toISOString(),

        // ✅ ADD THIS: Wrap complete trade object
        tradeInfo: {
          id: trade.id,
          buyerId: trade.buyerId,
          sellerId: trade.sellerId,
          sellOrderId: trade.sellOrderId,
          buyOrderId: trade.buyOrderId,
          dateCreated: trade.dateCreated,
          amount: trade.amount,
          currency: trade.currency,
          convertedAmount: trade.convertedAmount,
          cancellationReason: trade.cancellationReason,
          cancelledBy: trade.cancelledBy,
          cancelledAt: trade.cancelledAt,
          convertedCurrency: trade.convertedCurrency,
          rate: trade.rate,
          paymentMethod: trade.paymentMethod,
          status: trade.status,
          paymentTimeLimit: trade.paymentTimeLimit,
          paymentSentAt: trade.paymentSentAt,
          paymentConfirmedAt: trade.paymentConfirmedAt,
          chatId: trade.chatId,
          createdAt: trade.acceptedAt
            ? trade.acceptedAt.toISOString()
            : trade.createdAt.toISOString(),
          updatedAt: trade.updatedAt,
        },
      },
      action: `/p2p/trades/${tradeId}`,
      category: 'payment',
      priority: 'high',
      sendPush: true,
      senderId: sellerId,
    });

    // After creating the in-app notification, add this:
    // In your notifyBuyerToProceed method, after creating the in-app notification:
    // In your notifyBuyerToProceed method, after creating the in-app notification:
    // In your notifyBuyerToProceed method, after creating the in-app notification:
    // if (buyer.fcmToken) {
    //   await this.firebaseService.sendDataNotification(buyer.fcmToken, {
    //     // Trade core data
    //     id: trade.id?.toString() || '',
    //     buyerId: trade.buyerId?.toString() || '',
    //     sellerId: trade.sellerId?.toString() || '',
    //     sellOrderId: trade.sellOrderId?.toString() || '',

    //     // Trade amounts and currencies
    //     amount: trade.amount?.toString() || '',
    //     currency: trade.currency || '',
    //     convertedAmount: trade.convertedAmount?.toString() || '',
    //     convertedCurrency: trade.convertedCurrency || '',
    //     rate: trade.rate?.toString() || '',

    //     // Trade details
    //     paymentMethod: trade.paymentMethod || '',
    //     status: trade.status || '',
    //     paymentTimeLimit: trade.paymentTimeLimit?.toString() || '',
    //     createdAt: trade.createdAt?.toISOString() || '',
    //     updatedAt: trade.updatedAt?.toISOString() || '',

    //     // Seller payment details (if available)
    //     accountNumber: trade.sellOrder?.accountNumber || '',
    //     bankName: trade.sellOrder?.bankName || '',
    //     accountName: trade.sellOrder?.accountName || '',

    //     // Notification metadata
    //     // type: 'p2p_seller_ready',
    //     timestamp: Date.now().toString(),
    //     action: 'trade_update',
    //     priority: 'high',

    //     // Escrow data (safe access)
    //     escrowLocked: 'true',
    //     escrowAmount: escrowResult?.netAmountLocked?.toString() || '',
    //     escrowId: escrowResult?.escrow?.id?.toString() || '',
    //   });
    // }
    return {
      success: true,
      message: `Notification sent successfully. Seller funds secured in escrow using ${rateDescription}.`,
      trade: trade,
      escrow: escrowResult.escrow,
      fees: {
        lockFee: escrowResult.lockFee,
        netAmountLocked: escrowResult.netAmountLocked,
        totalDeducted:
          Number(escrowResult.netAmountLocked) + Number(escrowResult.lockFee),
        effectiveRate: effectiveRate,
        rateUsed: trade.hasNegotiatedRate() ? 'negotiated' : 'original',
        lockCurrency: lockCurrency,
      },
    };
  }

  /**
   * Buyer notifies seller that payment has been sent
   * @param tradeId - Trade ID
   * @param buyerId - Buyer ID (must match trade's buyer)
   * @returns Success message
   */
  // src/P2P/p2p-trade/services/p2p-trade.service.ts

  /**
   * Buyer notifies seller that payment has been sent
   * @param tradeId - Trade ID
   * @param buyerId - Buyer ID (must match trade's buyer)
   * @returns Success message
   */
  async notifyPaymentSent(
    tradeId: number,
    userId: number,
  ): Promise<{ success: boolean; message: string }> {
    // Get the trade and verify the user is part of it
    const trade = await this.getTrade(tradeId, userId);

    // Determine who is sending the notification and who should receive it
    let sender: User;
    let receiver: User;
    let senderRole: 'buyer' | 'seller';
    let receiverRole: 'buyer' | 'seller';
    let receiverId: number;

    if (trade.buyerId === userId) {
      // BUYER is sending payment notification
      senderRole = 'buyer';
      receiverRole = 'seller';
      receiverId = trade.sellerId;

      sender = await this.userRepository.findOne({ where: { id: userId } });
      receiver = await this.userRepository.findOne({
        where: { id: trade.sellerId },
      });

      if (!receiver) {
        throw new NotFoundException(
          `Seller with ID ${trade.sellerId} not found`,
        );
      }
    } else if (trade.sellerId === userId) {
      // SELLER is sending payment notification
      senderRole = 'seller';
      receiverRole = 'buyer';
      receiverId = trade.buyerId;

      sender = await this.userRepository.findOne({ where: { id: userId } });
      receiver = await this.userRepository.findOne({
        where: { id: trade.buyerId },
      });

      if (!receiver) {
        throw new NotFoundException(`Buyer not found`);
      }
    } else {
      throw new ForbiddenException('You are not part of this trade');
    }

    // Verify trade is in correct status
    if (
      trade.status !== TradeStatus.PENDING &&
      trade.status !== TradeStatus.ACTIVE
    ) {
      throw new ForbiddenException(
        'Can only mark payment as sent for trades in PENDING or ACTIVE status',
      );
    }

    // Update trade status
    trade.status = TradeStatus.PAYMENT_SENT;
    trade.paymentSentAt = new Date();

    // Save updated trade
    const updatedTrade = await this.tradeRepository.save(trade);

    // Update Firebase status
    await this.firebaseService.updateTradeStatus(
      tradeId,
      TradeStatus.PAYMENT_SENT,
    );

    const senderName = sender
      ? `${sender.firstName || ''} ${sender.lastName || ''}`.trim() ||
        (senderRole === 'buyer' ? 'Buyer' : 'Seller')
      : senderRole === 'buyer'
        ? 'Buyer'
        : 'Seller';

    // Create different messages based on who sent payment
    let notificationMessage: string;
    let notificationTitle: string;
    let actionType: string;

    if (senderRole === 'buyer') {
      // Buyer sent payment to seller
      notificationMessage = `${senderName} has sent payment of ${trade.convertedAmount} ${trade.convertedCurrency}. Please check and confirm.`;
      notificationTitle = 'Payment Received';
      actionType = 'verify_payment_received';
    }

    // else {
    // //   // Seller sent payment to buyer
    // //   notificationMessage = `${senderName} has sent payment of ${trade.amount} ${trade.currency}. Please check and confirm.`;
    // //   notificationTitle = 'Payment Received';
    // //   actionType = 'verify_payment_received';
    // // }

    // Create system message in chat if available
    // await this.p2pChatService.createSystemMessage(
    //   tradeId,
    //   notificationMessage,
    //   { type: 'payment_sent', sentBy: senderRole }
    // );

    // Send in-app notification
    // UPDATED: Payment Sent notification
    await this.notificationService.create({
      userId: receiverId, // Changed from 'otherUserId' to 'userId'
      type: NotificationType.P2P_PAYMENT_SENT, // Use enum instead of data.type
      title: notificationTitle,
      body: notificationMessage,
      data: {
        tradeId: tradeId,
        senderId: userId,
        senderRole: senderRole, // 'buyer' or 'seller'
        senderName: senderName,
        receiverRole: receiverRole, // 'seller' or 'buyer'
        amount: senderRole === 'buyer' ? trade.convertedAmount : trade.amount,
        currency:
          senderRole === 'buyer' ? trade.convertedCurrency : trade.currency,
        originalAmount: trade.amount,
        originalCurrency: trade.currency,
        convertedAmount: trade.convertedAmount,
        convertedCurrency: trade.convertedCurrency,
        paymentMethod: trade.paymentMethod,
        tradeStatus: 'PAYMENT_SENT',
        paymentSentAt: new Date().toISOString(),
        // The specific amount that was sent
        sentAmount:
          senderRole === 'buyer' ? trade.convertedAmount : trade.amount,
        sentCurrency:
          senderRole === 'buyer' ? trade.convertedCurrency : trade.currency,
      },
      action: `/p2p/trades/${tradeId}`,
      category: 'payment',
      priority: 'high', // Payment notifications are urgent
      sendPush: true,
      senderId: userId, // Who sent the payment
    });

    // Send push notification with comprehensive data payload
    if (receiver.fcmToken) {
      const dataPayload = {
        type: 'p2p_payment_sent',
        tradeId: tradeId.toString(),
        senderId: userId.toString(),
        senderRole: senderRole,
        senderName: senderName,
        receiverId: receiverId.toString(),
        receiverRole: receiverRole,
        // Include both amounts for flexibility
        amount: trade.amount.toString(),
        currency: trade.currency,
        convertedAmount: trade.convertedAmount.toString(),
        convertedCurrency: trade.convertedCurrency,
        // The specific amount that was sent
        sentAmount:
          senderRole === 'buyer'
            ? trade.convertedAmount.toString()
            : trade.amount.toString(),
        sentCurrency:
          senderRole === 'buyer' ? trade.convertedCurrency : trade.currency,
        timestamp: Date.now().toString(),
        action: actionType,
      };

      await this.firebaseService.sendPushNotification(receiver.fcmToken, {
        title: notificationTitle,
        body: notificationMessage,
        data: dataPayload,
      });
    }

    const successMessage =
      senderRole === 'buyer'
        ? 'Payment notification sent to seller successfully'
        : 'Payment notification sent to buyer successfully';

    return {
      success: true,
      message: successMessage,
    };
  }
  // src/P2P/p2p-trade/services/p2p-trade.service.ts

  /**
   * Seller releases funds to complete the trade
   * @param tradeId - Trade ID
   * @param sellerId - Seller ID (must match trade's seller)
   * @returns Updated trade object
   */
  // src/P2P/p2p-trade/services/p2p-trade.service.ts

  /**
   * Seller releases funds to complete the trade
   * @param tradeId - Trade ID
   * @param sellerId - Seller ID (must match trade's seller)
   * @returns Updated trade object
   */
  async releaseFunds(tradeId: number, userId: number): Promise<P2PTrade> {
    // Get the trade and verify the user is part of it
    const trade = await this.getTrade(tradeId, userId);

    // Determine who is releasing funds
    let releaserRole: 'buyer' | 'seller';
    let receiverRole: 'buyer' | 'seller';
    let receiverId: number;
    let releaseAmount: number;

    if (trade.sellerId === userId) {
      releaserRole = 'seller';
      receiverRole = 'buyer';
      receiverId = trade.buyerId;
      releaseAmount = trade.amount;
    } else if (trade.buyerId === userId) {
      releaserRole = 'buyer';
      receiverRole = 'seller';
      receiverId = trade.sellerId;
      releaseAmount = trade.amount;
    } else {
      throw new ForbiddenException('You are not part of this trade');
    }

    // Verify trade is in PAYMENT_SENT status
    if (trade.status !== TradeStatus.PAYMENT_SENT) {
      throw new ForbiddenException(
        'Can only release funds for trades where payment has been sent',
      );
    }

    // Get releaser's wallet based on currency
    let releaserWallet: NGNWalletEntity | CADWalletEntity;
    if (trade.currency === 'NGN') {
      releaserWallet = await this.ngnWalletRepository.findOne({
        where: { userId: userId },
      });
    } else if (trade.currency === 'CAD') {
      releaserWallet = await this.cadWalletRepository.findOne({
        where: { userId: userId },
      });
    }

    if (!releaserWallet) {
      throw new NotFoundException(
        `${trade.currency} wallet not found for releaser`,
      );
    }

    // Get receiver's wallet based on currency
    let receiverWallet: NGNWalletEntity | CADWalletEntity;
    if (trade.currency === 'NGN') {
      receiverWallet = await this.ngnWalletRepository.findOne({
        where: { userId: receiverId },
      });
    } else if (trade.currency === 'CAD') {
      receiverWallet = await this.cadWalletRepository.findOne({
        where: { userId: receiverId },
      });
    }

    if (!receiverWallet) {
      throw new NotFoundException(
        `${trade.currency} wallet not found for receiver`,
      );
    }

    const queryRunner = this.datasource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Release funds from escrow - this credits the receiver's wallet
      const escrowResult = await this.escrowService.releaseFunds(
        tradeId,
        userId,
        Number(releaseAmount),
        `Trade completed - ${releaserRole} confirmed payment`,
      );

      // Get user details for transactions and notifications
      const releaserUser = await queryRunner.manager.findOne(User, {
        where: { id: userId },
      });
      const receiverUser = await queryRunner.manager.findOne(User, {
        where: { id: receiverId },
      });

      const releaserFullName = releaserUser
        ? `${releaserUser.firstName || ''} ${releaserUser.lastName || ''}`.trim()
        : releaserRole;

      const receiverFullName = receiverUser
        ? `${receiverUser.firstName || ''} ${receiverUser.lastName || ''}`.trim()
        : receiverRole;

      // Helper functions for generating transaction IDs
      function generateReceiptNumber(): string {
        const timestamp = Date.now();
        const random = Math.floor(1000 + Math.random() * 9000);
        return `REC-${timestamp}-${random}`;
      }

      function generateExternalTransactionId(): string {
        const timestamp = Date.now();
        const random = Math.floor(100000 + Math.random() * 900000);
        return `EXT-${timestamp}-${random}`;
      }

      function generateReference(tradeId: number): string {
        const timestamp = Date.now();
        const random = Math.floor(100 + Math.random() * 900);
        return `REF-${tradeId}-${timestamp}-${random}`;
      }

      const sellOrder = await this.sellerRepository.findOne({
        where: { id: trade.sellOrderId },
      });

      if (sellOrder) {
        const newAvailableAmount =
          Number(sellOrder.availableAmount) - Number(trade.amount);

        // Prevent negative available amount
        if (newAvailableAmount < 0) {
          throw new BadRequestException(
            `Cannot complete trade. Insufficient available amount. Available: ${sellOrder.availableAmount} ${sellOrder.sellCurrency}, Required: ${trade.amount} ${sellOrder.sellCurrency}`,
          );
        }

        // Increment counters (only once!)
        sellOrder.totalTrades = (sellOrder.totalTrades || 0) + 1;
        sellOrder.completedTrades = (sellOrder.completedTrades || 0) + 1;

        // Calculate completion rate (will always be <= 100%)
        sellOrder.completionRate =
          sellOrder.totalTrades > 0
            ? Math.round(
                (sellOrder.completedTrades / sellOrder.totalTrades) * 100,
              )
            : 0;

        sellOrder.status = 'OPEN';
        sellOrder.availableAmount = newAvailableAmount;

        await queryRunner.manager.save(sellOrder);
      }
      // Create transaction record for trade completion (releaser perspective)
      const releaserTransaction = queryRunner.manager.create(
        'TransactionEntity',
        {
          userId: userId,
          amount: Number(trade.amount), // No wallet change for releaser (escrow handled it)
          currency: trade.currency,
          type: 'P2P_DEBIT',
          receiptNumber: generateReceiptNumber(),
          reference: generateReference(tradeId),

          referenceHash: this.encryptionService.hash(
            generateReference(tradeId),
          ),

          externalTransactionId: generateExternalTransactionId(),
          description: `P2P trade completion - ${releaserRole} released funds for trade ${tradeId}`,
          status: 'COMPLETED',

          balanceAfter: releaserWallet.balance, // Escrow service manages actual balances
          metadata: {
            tradeId: tradeId,
            receiverId: receiverId,
            convertedAmount: trade.convertedAmount,
            convertedCurrency: trade.convertedCurrency,
            name: releaserFullName,
            receiverRole: receiverRole,
            transactionType: 'trade_completion_release',
            receiver: receiverFullName,
            currency: trade.currency,
            buyOrderId: trade.buyOrderId,
            scenario: `${releaserRole}_completes_trade`,
            escrowId: escrowResult.escrow.id,
            amountReleased: releaseAmount,
            businessProfit: escrowResult.businessProfit,
          },
        },
      );
      await queryRunner.manager.save(releaserTransaction);

      // Create transaction record for receiver (already handled by escrow, this is for record keeping)
      const receiverTransaction = queryRunner.manager.create(
        'TransactionEntity',
        {
          userId: receiverId,
          amount: Number(trade.amount), // Positive for what they received
          currency: trade.currency,
          type: 'P2P_CREDIT',
          receiptNumber: generateReceiptNumber(),
          reference: generateReference(tradeId),
          referenceHash: this.encryptionService.hash(
            generateReference(tradeId),
          ),
          externalTransactionId: generateExternalTransactionId(),
          description: `P2P trade funds received from trade ${tradeId} - from ${releaserRole}`,
          status: 'COMPLETED',
          balanceAfter: receiverWallet.balance, // Escrow service manages actual balances
          metadata: {
            tradeId: tradeId,
            releaserId: userId,
            convertedAmount: trade.convertedAmount,
            convertedCurrency: trade.convertedCurrency,
            name: receiverFullName,
            releaserRole: releaserRole,
            transactionType: 'trade_completion_receive',
            releaser: releaserFullName,
            currency: trade.currency,
            buyOrderId: trade.buyOrderId,
            scenario: `${receiverRole}_receives_from_trade`,
            escrowId: escrowResult.escrow.id,
            amountReceived: releaseAmount,
          },
        },
      );
      await queryRunner.manager.save(receiverTransaction);

      // Update trade status
      trade.status = TradeStatus.COMPLETED;
      trade.paymentConfirmedAt = new Date();

      const updatedTrade = await queryRunner.manager.save(trade);
      await queryRunner.commitTransaction();

      // Update Firebase status
      await this.firebaseService.updateTradeStatus(
        tradeId,
        TradeStatus.COMPLETED,
      );

      // Send notifications
      await this.sendFundReleaseNotifications(
        trade,
        releaserRole,
        releaserUser,
        receiverUser,
        releaseAmount,
        escrowResult.escrow.currency,
        releaseAmount,
        escrowResult.escrow.currency,
      );

      return updatedTrade;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to release funds: ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
  // Helper method for notifications
  private async sendFundReleaseNotifications(
    trade: P2PTrade,
    releaserRole: 'buyer' | 'seller',
    releaserUser: User,
    receiverUser: User,
    releaseAmount: number,
    releaseCurrency: string,
    receiverAmount: number,
    receiverCurrency: string,
  ): Promise<void> {
    const releaserName = releaserUser
      ? `${releaserUser.firstName || ''} ${releaserUser.lastName || ''}`.trim() ||
        releaserRole
      : releaserRole;

    // Notification to receiver
    const receiverMessage = `${releaserName} has confirmed your payment and released ${receiverAmount} ${receiverCurrency} to your wallet.`;

    // Send in-app notification to receiver
    // UPDATED: Trade Completed notification to receiver
    await this.notificationService.create({
      userId: receiverUser.id, // Changed from 'otherUserId' to 'userId'
      type: NotificationType.p2p_trade_completed, // Use enum instead of data.type
      title: 'Trade Completed',
      body: receiverMessage,
      data: {
        tradeId: trade.id,
        releaserId: releaserUser.id,
        releaserRole: releaserRole, // 'buyer' or 'seller'
        releaserName: releaserName,
        receiverRole: releaserRole === 'seller' ? 'buyer' : 'seller',
        receivedAmount: receiverAmount.toString(),
        receivedCurrency: receiverCurrency,
        releasedAmount: releaseAmount.toString(),
        releasedCurrency: releaseCurrency,
        originalAmount: trade.amount,
        originalCurrency: trade.currency,
        convertedAmount: trade.convertedAmount,
        convertedCurrency: trade.convertedCurrency,
        exchangeRate: trade.rate,
        paymentMethod: trade.paymentMethod,
        tradeStatus: 'COMPLETED',
        completedAt: new Date().toISOString(),
        transactionType: 'fund_receive',
        walletUpdated: true, // Indicates wallet balance was updated
      },
      action: `/p2p/trades/${trade.id}`,
      category: 'transaction', // Changed from 'trade' to 'transaction' for completed trades
      priority: 'normal', // Completed trades are informational
      sendPush: true,
      senderId: releaserUser.id, // Who released the funds
    });

    // Send push notification to receiver
    if (receiverUser.fcmToken) {
      const receiverDataPayload = {
        type: 'p2p_trade_completed',
        tradeId: trade.id.toString(),
        releaserId: releaserUser.id.toString(),
        releaserName: releaserName,
        releaserRole: releaserRole,
        receivedAmount: receiverAmount.toString(),
        receivedCurrency: receiverCurrency,
        releasedAmount: releaseAmount.toString(),
        releasedCurrency: releaseCurrency,
        timestamp: Date.now().toString(),
        action: 'trade_completed',
      };

      await this.firebaseService.sendPushNotification(receiverUser.fcmToken, {
        title: 'Trade Completed',
        body: receiverMessage,
        data: receiverDataPayload,
      });
    }

    // Notification to releaser (confirmation)
    if (releaserUser.fcmToken) {
      const releaserMessage = `You have successfully completed the trade and released ${releaseAmount} ${releaseCurrency}.`;

      await this.firebaseService.sendPushNotification(releaserUser.fcmToken, {
        title: 'Trade Completed',
        body: releaserMessage,
        data: {
          type: `p2p_trade_completed_${releaserRole}`,
          tradeId: trade.id.toString(),
          releasedAmount: releaseAmount.toString(),
          releasedCurrency: releaseCurrency,
          receiverId: receiverUser.id.toString(),
          receiverRole: releaserRole === 'seller' ? 'buyer' : 'seller',
        },
      });
    }
  }

  // Modified releaseFundsScenario1 method in P2PTradeService

  /**
   * Updated releaseFundsScenario1 with fee-aware escrow release
   */
  async releaseFundsScenario1(
    tradeId: number,
    userId: number,
  ): Promise<P2PTrade> {
    const trade = await this.getTrade(tradeId, userId);

    // Verify trade is in PAYMENT_SENT status
    if (trade.status !== TradeStatus.PAYMENT_SENT) {
      throw new ForbiddenException(
        'Can only release funds for trades where payment has been sent',
      );
    }

    // Check if escrow exists and is locked
    const escrow = await this.escrowService.getEscrowByTradeId(tradeId);
    if (!escrow || escrow.status !== 'locked') {
      throw new BadRequestException(
        `No locked escrow found for trade ${tradeId}`,
      );
    }

    const queryRunner = this.datasource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    console.log('trade', trade);
    try {
      // Release funds from escrow - business keeps fee
      const releaseResult = await this.escrowService.releaseFunds(
        tradeId,
        userId,
        trade.convertedAmount, // Pass original trade amount
        `Trade completed successfully - Scenario 1`,
      );

      // Update sell order statistics
      const sellOrder = await this.sellerRepository.findOne({
        where: { id: trade.sellOrderId },
      });

      if (sellOrder) {
        sellOrder.totalTrades = (sellOrder.totalTrades || 0) + 1;
        sellOrder.completedTrades = (sellOrder.completedTrades || 0) + 1;
        sellOrder.completionRate =
          sellOrder.totalTrades > 0
            ? Math.round(
                (sellOrder.completedTrades / sellOrder.totalTrades) * 100,
              )
            : 0;
        sellOrder.status = 'OPEN';
        // Deduct from available amount
        sellOrder.availableAmount =
          Number(sellOrder.availableAmount) - Number(trade.amount);
        await queryRunner.manager.save(sellOrder);
      }

      // Create transaction record
      const sellerUser = await queryRunner.manager.findOne(User, {
        where: { id: userId },
      });
      const buyerUser = await queryRunner.manager.findOne(User, {
        where: { id: trade.buyerId },
      });

      // Update trade status
      trade.status = TradeStatus.COMPLETED;
      trade.paymentConfirmedAt = new Date();
      const updatedTrade = await queryRunner.manager.save(trade);

      await queryRunner.commitTransaction();

      // Update Firebase and send notifications
      await this.firebaseService.updateTradeStatus(
        tradeId,
        TradeStatus.COMPLETED,
      );
      await this.sendFundReleaseNotificationsScenario1(
        trade,
        sellerUser,
        buyerUser,
        releaseResult.businessProfit, // Amount buyer received (after fee)
        escrow.currency,
        sellOrder,
        releaseResult,
      );

      return updatedTrade;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to release funds from escrow (Scenario 1): ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Updated releaseFundsScenario2 with fee-aware escrow release
   */
  async releaseFundsScenario2(
    tradeId: number,
    userId: number,
  ): Promise<P2PTrade> {
    const trade = await this.getTrade(tradeId, userId);

    // Verify user is the seller
    if (trade.sellerId !== userId) {
      throw new ForbiddenException(
        'Only the seller can release funds in this scenario',
      );
    }

    // Verify trade has a buyOrderId
    if (!trade.buyOrderId) {
      throw new BadRequestException(
        'This trade does not have a buy order ID - wrong scenario',
      );
    }

    // Verify trade status and escrow
    if (trade.status !== TradeStatus.PAYMENT_SENT) {
      throw new ForbiddenException(
        'Can only release funds for trades where payment has been sent',
      );
    }

    const escrow = await this.escrowService.getEscrowByTradeId(tradeId);
    if (!escrow || escrow.status !== 'locked') {
      throw new BadRequestException(
        `No locked escrow found for trade ${tradeId}`,
      );
    }

    const queryRunner = this.datasource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Release funds from escrow - business keeps fee
      const releaseResult = await this.escrowService.releaseFunds(
        tradeId,
        userId,
        trade.amount, // Pass original trade amount
        `Trade completed successfully - Scenario 2`,
      );

      // Update buy order statistics
      const buyOrder = await this.buyerRepository.findOne({
        where: { id: trade.buyOrderId },
      });

      if (buyOrder) {
        buyOrder.totalTrades = (buyOrder.totalTrades || 0) + 1;
        buyOrder.completedTrades = (buyOrder.completedTrades || 0) + 1;
        buyOrder.completionRate =
          buyOrder.totalTrades > 0
            ? Math.round(
                (buyOrder.completedTrades / buyOrder.totalTrades) * 100,
              )
            : 0;
        await queryRunner.manager.save(buyOrder);
      }

      // Update trade status
      trade.status = TradeStatus.COMPLETED;
      trade.paymentConfirmedAt = new Date();
      const updatedTrade = await queryRunner.manager.save(trade);

      await queryRunner.commitTransaction();

      // Get user details for notifications
      const sellerUser = await this.userRepository.findOne({
        where: { id: userId },
      });
      const buyerUser = await this.userRepository.findOne({
        where: { id: trade.buyerId },
      });

      // Update Firebase and send notifications
      await this.firebaseService.updateTradeStatus(
        tradeId,
        TradeStatus.COMPLETED,
      );
      await this.sendFundReleaseNotificationsScenario2(
        trade,
        sellerUser,
        buyerUser,
        releaseResult.businessProfit, // Amount buyer received (after fee)
        escrow.currency,
        buyOrder,
        releaseResult,
      );

      return updatedTrade;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to release funds from escrow (Scenario 2): ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // Helper method for notifications in Scenario 1
  // Updated sendFundReleaseNotificationsScenario1 method with escrow parameter
  private async sendFundReleaseNotificationsScenario1(
    trade: P2PTrade,
    sellerUser: User,
    buyerUser: User,
    releaseAmount: number,
    releaseCurrency: string,
    sellOrder: any,
    releasedEscrow: any, // Add escrow parameter
  ): Promise<void> {
    const sellerName = sellerUser
      ? `${sellerUser.firstName || ''} ${sellerUser.lastName || ''}`.trim() ||
        'Seller'
      : 'Seller';

    // Notification to buyer - enhanced with escrow information
    const buyerMessage = `${sellerName} has released ${releaseAmount} ${releaseCurrency} from escrow to your wallet. Trade completed successfully!`;

    // Send in-app notification to buyer
    await this.notificationService.create({
      userId: buyerUser.id,
      type: NotificationType.p2p_trade_completed,
      title: 'Trade Completed - Funds Released from Escrow',
      body: buyerMessage,
      data: {
        tradeId: trade.id,
        sellerId: sellerUser.id,
        sellerName: sellerName,
        buyerRole: 'buyer',
        sellerRole: 'seller',
        receivedAmount: releaseAmount.toString(),
        receivedCurrency: releaseCurrency,
        originalTradeAmount: trade.amount,
        originalTradeCurrency: trade.currency,
        convertedAmount: trade.convertedAmount,
        convertedCurrency: trade.convertedCurrency,
        exchangeRate: trade.rate,
        paymentMethod: trade.paymentMethod,
        tradeStatus: 'COMPLETED',
        completedAt: new Date().toISOString(),
        transactionType: 'fund_receive',
        walletUpdated: true,
        scenario: trade.sellOrderId
          ? 'seller_created_sell_order'
          : 'buyer_created_buy_order',
        fundSource: 'escrow_release', // Changed from 'seller_release'
        // 🔥 NEW: Escrow information
        escrowId: releasedEscrow.id,
        escrowStatus: 'released',
        escrowReleaseMethod: 'seller_confirmation',
        escrowSecured: true,
        releasedFromEscrow: true,
        escrowReleasedAt: releasedEscrow.releasedAt,
        escrowOriginalLockAmount: releasedEscrow.amount,
        escrowOriginalLockCurrency: releasedEscrow.currency,
      },
      action: `/p2p/trades/${trade.id}`,
      category: 'transaction',
      priority: 'normal',
      sendPush: true,
      senderId: sellerUser.id,
    });

    // Send push notification to buyer
    if (buyerUser.fcmToken) {
      await this.firebaseService.sendPushNotification(buyerUser.fcmToken, {
        title: 'Trade Completed - Funds Released',
        body: buyerMessage,
        data: {
          type: 'p2p_trade_completed',
          tradeId: trade.id.toString(),
          sellerId: sellerUser.id.toString(),
          sellerName: sellerName,
          receivedAmount: releaseAmount.toString(),
          receivedCurrency: releaseCurrency,
          action: 'trade_completed',
          // 🔥 NEW: Escrow data for push notification
          escrowReleased: 'true',
          escrowId: releasedEscrow.id.toString(),
          escrowAmount: releasedEscrow.amount.toString(),
          escrowCurrency: releasedEscrow.currency,
          fundSource: 'escrow',
        },
      });
    }

    // Confirmation notification to seller - enhanced with escrow info
    if (sellerUser.fcmToken) {
      const sellerMessage = `You have successfully released ${releaseAmount} ${releaseCurrency} from escrow to complete the trade.`;

      await this.firebaseService.sendPushNotification(sellerUser.fcmToken, {
        title: 'Trade Completed - Escrow Released',
        body: sellerMessage,
        data: {
          type: 'p2p_trade_completed',
          tradeId: trade.id.toString(),
          buyerId: buyerUser.id.toString(),
          releasedAmount: releaseAmount.toString(),
          releasedCurrency: releaseCurrency,
          // 🔥 NEW: Escrow confirmation data
          escrowReleased: 'true',
          escrowId: releasedEscrow.id.toString(),
          escrowStatus: 'released',
          action: 'escrow_released',
        },
      });
    }
  }
  // async releaseFundsScenario2(
  //   tradeId: number,
  //   userId: number,
  // ): Promise<P2PTrade> {
  //   // Get the trade and verify the user is part of it
  //   const trade = await this.getTrade(tradeId, userId);

  //   // Verify user is the seller (changed from buyer)
  //   if (trade.sellerId !== userId) {
  //     throw new ForbiddenException(
  //       'Only the seller can release funds in this scenario',
  //     );
  //   }

  //   // Verify trade has a buyOrderId (this scenario applies when buyer created buy order)
  //   if (!trade.buyOrderId) {
  //     throw new BadRequestException(
  //       'This trade does not have a buy order ID - wrong scenario',
  //     );
  //   }

  //   // Get the buy order to determine the currencies involved
  //   const buyOrder = await this.buyerRepository.findOne({
  //     where: { id: trade.buyOrderId },
  //   });

  //   if (!buyOrder) {
  //     throw new NotFoundException(`Buy order not found`);
  //   }

  //   // Get seller's currency from the buy order (what buyer wants to buy is what seller has)
  //   const sellerCurrency = trade.currency; // What buyer wanted to buy = what seller has to sell
  //   const buyerReceiveCurrency = trade.currency; // What buyer will receive

  //   // Verify trade is in PAYMENT_SENT status
  //   if (trade.status !== TradeStatus.PAYMENT_SENT) {
  //     throw new ForbiddenException(
  //       'Can only release funds for trades where payment has been sent',
  //     );
  //   }

  //   // Determine transaction details for Scenario 2 (Seller releases)
  //   const releaserRole = 'seller';
  //   const receiverRole = 'buyer';
  //   const releaserId = trade.sellerId;
  //   const receiverId = trade.buyerId;

  //   // In this scenario: Seller releases their currency (what buyer wanted to buy)
  //   // The amount corresponds to what's in the trade
  //   const releaseAmount = trade.amount; // Original amount in seller's currency
  //   const releaseCurrency = sellerCurrency; // Seller's currency
  //   const receiverAmount = trade.amount; // Same amount buyer receives
  //   const receiverCurrency = buyerReceiveCurrency; // Same currency

  //   console.log(
  //     `Scenario 2 - Seller releases: ${trade.convertedAmount} ${trade.convertedCurrency}`,
  //   );
  //   console.log(
  //     `Buyer receives: ${trade.convertedAmount} ${trade.convertedCurrency}`,
  //   );

  //   // Start a transaction to ensure atomicity
  //   const queryRunner = this.datasource.createQueryRunner();
  //   await queryRunner.connect();
  //   await queryRunner.startTransaction();

  //   try {
  //     let sellerWallet: any;
  //     let buyerWallet: any;

  //     console.log(releaseCurrency, 'release');
  //     // Get seller's wallet (currency they are releasing)
  //     if (releaseCurrency.toUpperCase() === 'NGN') {
  //       sellerWallet = await queryRunner.manager.findOne('NGNWalletEntity', {
  //         where: { userId: releaserId },
  //       });
  //     } else if (releaseCurrency.toUpperCase() === 'CAD') {
  //       sellerWallet = await queryRunner.manager.findOne('CADWalletEntity', {
  //         where: { userId: releaserId },
  //       });
  //     } else {
  //       throw new BadRequestException(
  //         `Unsupported seller currency: ${releaseCurrency}`,
  //       );
  //     }

  //     // Get buyer's wallet (same currency - what they're receiving)
  //     if (receiverCurrency.toUpperCase() === 'NGN') {
  //       buyerWallet = await queryRunner.manager.findOne('NGNWalletEntity', {
  //         where: { userId: receiverId },
  //       });
  //     } else if (receiverCurrency.toUpperCase() === 'CAD') {
  //       buyerWallet = await queryRunner.manager.findOne('CADWalletEntity', {
  //         where: { userId: receiverId },
  //       });
  //     } else {
  //       throw new BadRequestException(
  //         `Unsupported receiver currency: ${receiverCurrency}`,
  //       );
  //     }

  //     // Check if seller wallet exists
  //     if (!sellerWallet) {
  //       throw new NotFoundException(
  //         `Seller ${releaseCurrency} wallet not found`,
  //       );
  //     }

  //     // Check if seller has sufficient funds
  //     if (Number(sellerWallet.balance) < Number(trade.amount)) {
  //       throw new BadRequestException(
  //         `Insufficient ${trade.convertedCurrency} funds in seller wallet`,
  //       );
  //     }

  //     // Debit from seller's wallet (subtract the amount they're releasing)
  //     sellerWallet.balance =
  //       Number(sellerWallet.balance) - Number(trade.amount);

  //     // Deduct releaseAmount from buywallet.availableAmount as well
  //     sellerWallet.availableAmount =
  //       Number(buyerWallet.availableAmount) - Number(trade.amount);
  //     await queryRunner.manager.save(buyerWallet);

  //     // Credit to buyer's wallet (add the amount buyer is receiving)
  //     buyerWallet.balance = Number(buyerWallet.balance) + Number(trade.amount);
  //     await queryRunner.manager.save(buyerWallet);

  //     if (buyOrder) {
  //       // Increment totalTrades and completedTrades
  //       buyOrder.totalTrades = (buyOrder.totalTrades || 0) + 1;
  //       buyOrder.completedTrades = (buyOrder.completedTrades || 0) + 1;

  //       // Calculate completionRate as a percentage (completedTrades / totalTrades) * 100
  //       buyOrder.completionRate =
  //         buyOrder.totalTrades > 0
  //           ? Math.round(
  //               (buyOrder.completedTrades / buyOrder.totalTrades) * 100,
  //             )
  //           : 0;

  //       await queryRunner.manager.save(buyOrder);
  //     }
  //     console.log(
  //       `Seller ${releaseCurrency} balance after debit:`,
  //       sellerWallet.balance,
  //     );
  //     console.log(
  //       `Buyer ${receiverCurrency} balance after credit:`,
  //       buyerWallet.balance,
  //     );

  //     // Get user details for metadata
  //     const sellerUser = await queryRunner.manager.findOne(User, {
  //       where: { id: releaserId },
  //     });
  //     const buyerUser = await queryRunner.manager.findOne(User, {
  //       where: { id: receiverId },
  //     });

  //     const sellerFullName = sellerUser
  //       ? `${sellerUser.firstName || ''} ${sellerUser.lastName || ''}`.trim()
  //       : 'Seller';

  //     const buyerFullName = buyerUser
  //       ? `${buyerUser.firstName || ''} ${buyerUser.lastName || ''}`.trim()
  //       : 'Buyer';

  //     // Create transaction record for seller (debit)
  //     const sellerTransaction = queryRunner.manager.create(
  //       'TransactionEntity',
  //       {
  //         userId: releaserId,
  //         amount: Number(trade.amount), // Negative for debit
  //         currency: releaseCurrency,
  //         type: 'P2P_DEBIT',
  //         reference: `TRADE_${tradeId}`,
  //         description: `P2P trade fund release for trade ${tradeId} (${releaseCurrency}) - Seller to Buyer (Scenario 2)`,
  //         receiptNumber: generateReceiptNumber(),
  //         externalTransactionId: generateExternalTransactionId(),
  //         status: 'COMPLETED',
  //         refrence: generateReference(tradeId),
  //         balanceAfter: sellerWallet.balance,
  //         metadata: {
  //           tradeId: tradeId,
  //           receiverId: receiverId,
  //           convertedAmount: trade.convertedAmount,
  //           convertedCurrency: trade.convertedCurrency,
  //           name: sellerFullName,
  //           receiverRole: 'buyer',
  //           transactionType: 'fund_release_scenario_2',
  //           reciever: buyerFullName,
  //           currency: releaseCurrency,
  //           buyOrderId: trade.buyOrderId,
  //           scenario: 'seller_releases_to_buyer',
  //         },
  //       },
  //     );
  //     await queryRunner.manager.save(sellerTransaction);
  //     /**
  //      * Generate a unique receipt number for a transaction.
  //      * Format: REC-{timestamp}-{random4digits}
  //      */
  //     function generateReceiptNumber(): string {
  //       const timestamp = Date.now();
  //       const random = Math.floor(1000 + Math.random() * 9000);
  //       return `REC-${timestamp}-${random}`;
  //     }

  //     /**
  //      * Generate a unique external transaction ID.
  //      * Format: EXT-{timestamp}-{random6digits}
  //      */
  //     function generateExternalTransactionId(): string {
  //       const timestamp = Date.now();
  //       const random = Math.floor(100000 + Math.random() * 900000);
  //       return `EXT-${timestamp}-${random}`;
  //     }

  //     /**
  //      * Generate a unique reference string for a transaction.
  //      * Format: REF-{tradeId}-{timestamp}-{random3digits}
  //      */
  //     function generateReference(tradeId: number): string {
  //       const timestamp = Date.now();
  //       const random = Math.floor(100 + Math.random() * 900);
  //       return `REF-${tradeId}-${timestamp}-${random}`;
  //     }
  //     // Create transaction record for buyer (credit)
  //     const buyerTransaction = queryRunner.manager.create('TransactionEntity', {
  //       userId: receiverId,
  //       amount: Number(trade.amount), // Positive for credit
  //       currency: receiverCurrency,
  //       type: 'P2P_CREDIT',
  //       receiptNumber: generateReceiptNumber(),
  //       reference: generateReference(tradeId),
  //       externalTransactionId: generateExternalTransactionId(),
  //       description: `P2P trade fund received from trade ${tradeId} (${receiverCurrency}) - from Seller (Scenario 2)`,
  //       status: 'COMPLETED',
  //       balanceAfter: buyerWallet.balance,
  //       metadata: {
  //         tradeId: tradeId,
  //         releaserId: releaserId,
  //         convertedAmount: trade.convertedAmount,
  //         convertedCurrency: trade.convertedCurrency,
  //         name: sellerFullName,
  //         releaserRole: 'seller',
  //         // releaser: sellerFullName,
  //         transactionType: 'fund_receive_scenario_2',
  //         currency: receiverCurrency,
  //         buyOrderId: trade.buyOrderId,
  //         scenario: 'seller_releases_to_buyer',
  //       },
  //     });
  //     await queryRunner.manager.save(buyerTransaction);

  //     // Update trade status
  //     trade.status = TradeStatus.COMPLETED;
  //     trade.paymentConfirmedAt = new Date();

  //     // Save updated trade
  //     const updatedTrade = await queryRunner.manager.save(trade);

  //     // Commit transaction
  //     await queryRunner.commitTransaction();

  //     // Update Firebase status
  //     await this.firebaseService.updateTradeStatus(
  //       tradeId,
  //       TradeStatus.COMPLETED,
  //     );

  //     // Send notifications
  //     await this.sendFundReleaseNotificationsScenario2(
  //       trade,
  //       sellerUser,
  //       buyerUser,
  //       releaseAmount,
  //       releaseCurrency,
  //       buyOrder,
  //     );

  //     return updatedTrade;
  //   } catch (error) {
  //     // Rollback transaction on error
  //     await queryRunner.rollbackTransaction();
  //     this.logger.error(
  //       `Failed to release funds (Scenario 2): ${error.message}`,
  //       error.stack,
  //     );
  //     throw error;
  //   } finally {
  //     // Release query runner
  //     await queryRunner.release();
  //   }
  // }

  // Updated helper method for notifications in Scenario 2 (Seller releases)
  // Updated sendFundReleaseNotificationsScenario2 method with escrow parameter
  private async sendFundReleaseNotificationsScenario2(
    trade: P2PTrade,
    sellerUser: User,
    buyerUser: User,
    releaseAmount: number,
    releaseCurrency: string,
    buyOrder: any,
    releasedEscrow: any, // Add escrow parameter
  ): Promise<void> {
    const sellerName = sellerUser
      ? `${sellerUser.firstName || ''} ${sellerUser.lastName || ''}`.trim() ||
        'Seller'
      : 'Seller';

    // Notification to buyer (they're receiving the funds) - enhanced with escrow information
    const buyerMessage = `${sellerName} has released ${trade.amount} ${trade.currency} from escrow to your wallet. Trade completed successfully!`;

    // Send in-app notification to buyer
    await this.notificationService.create({
      userId: buyerUser.id,
      type: NotificationType.TRADE_COMPLETED,
      title: 'Trade Completed - Funds Released from Escrow',
      body: buyerMessage,
      data: {
        tradeId: trade.id,
        sellerId: sellerUser.id,
        sellerName: sellerName,
        buyerRole: 'buyer',
        sellerRole: 'seller',
        receivedAmount: releaseAmount.toString(),
        receivedCurrency: releaseCurrency,
        // Scenario 2 specific: trade.amount (what buyer originally wanted)
        originalRequestedAmount: trade.amount,
        originalRequestedCurrency: trade.currency,
        convertedAmount: trade.convertedAmount,
        convertedCurrency: trade.convertedCurrency,
        exchangeRate: trade.rate,
        paymentMethod: trade.paymentMethod,
        tradeStatus: 'COMPLETED',
        completedAt: new Date().toISOString(),
        transactionType: 'fund_receive',
        walletUpdated: true,
        scenario: 'scenario_2_seller_releases',
        buyOrderId: trade.buyOrderId, // Since this is scenario 2
        tradeFlow: 'buyer_buy_order_fulfilled',
        fundReleaseMethod: 'escrow_release', // Changed from 'seller_wallet_debit'
        fundSource: 'escrow_release', // Funds came from escrow
        // 🔥 NEW: Escrow information
        escrowId: releasedEscrow.id,
        escrowStatus: 'released',
        escrowReleaseMethod: 'seller_confirmation',
        escrowSecured: true,
        releasedFromEscrow: true,
        escrowReleasedAt: releasedEscrow.releasedAt,
        escrowOriginalLockAmount: releasedEscrow.amount,
        escrowOriginalLockCurrency: releasedEscrow.currency,
        escrowProtectionActive: false, // No longer active since released
      },
      action: `/p2p/trades/${trade.id}`,
      category: 'transaction',
      priority: 'normal',
      sendPush: true,
      senderId: sellerUser.id, // Seller released the funds
    });

    // Send push notification to buyer
    if (buyerUser.fcmToken) {
      await this.firebaseService.sendPushNotification(buyerUser.fcmToken, {
        title: 'Trade Completed - Funds Released',
        body: buyerMessage,
        data: {
          type: 'p2p_trade_completed',
          tradeId: trade.id.toString(),
          sellerId: sellerUser.id.toString(),
          sellerName: sellerName,
          receivedAmount: releaseAmount.toString(),
          receivedCurrency: releaseCurrency,
          action: 'trade_completed',
          // 🔥 NEW: Escrow data for push notification
          escrowReleased: 'true',
          escrowId: releasedEscrow.id.toString(),
          escrowAmount: releasedEscrow.amount.toString(),
          escrowCurrency: releasedEscrow.currency,
          fundSource: 'escrow',
          scenario: 'scenario_2',
        },
      });
    }

    // Confirmation notification to seller (they released the funds) - enhanced with escrow info
    if (sellerUser.fcmToken) {
      const sellerMessage = `You have successfully released ${trade.amount} ${trade.currency} from escrow to complete the trade.`;

      await this.firebaseService.sendPushNotification(sellerUser.fcmToken, {
        title: 'Trade Completed - Escrow Released',
        body: sellerMessage,
        data: {
          type: 'p2p_trade_completed',
          tradeId: trade.id.toString(),
          buyerId: buyerUser.id.toString(),
          releasedAmount: releaseAmount.toString(),
          releasedCurrency: releaseCurrency,
          // 🔥 NEW: Escrow confirmation data
          escrowReleased: 'true',
          escrowId: releasedEscrow.id.toString(),
          escrowStatus: 'released',
          escrowOriginalAmount: releasedEscrow.amount.toString(),
          escrowOriginalCurrency: releasedEscrow.currency,
          action: 'escrow_released',
          scenario: 'scenario_2',
        },
      });
    }
  }

  /**
   * Update the negotiated rate for a trade
   */
  async updateTradeRate(
    tradeId: number,
    sellerId: number,
    updateRateDto: UpdateTradeRateDto,
  ): Promise<RateUpdateResponseDto> {
    // Get the trade with seller order relation
    const trade = await this.tradeRepository.findOne({
      where: { id: tradeId },
      relations: ['sellOrder', 'buyOrder', 'seller', 'buyer'],
    });

    if (!trade) {
      throw new NotFoundException(`Trade with ID ${tradeId} not found`);
    }

    // Verify user is the seller
    if (trade.sellerId !== sellerId) {
      throw new ForbiddenException('Only the seller can update the trade rate');
    }

    // Check if trade status allows rate updates
    if (![TradeStatus.PENDING, TradeStatus.ACTIVE].includes(trade.status)) {
      throw new ForbiddenException(
        `Rate can only be updated for trades in PENDING or ACTIVE status. Current status: ${trade.status}`,
      );
    }

    // Check if escrow is locked (prevents rate changes after commitment)
    const escrow = await this.escrowService.getEscrowByTradeId(tradeId);
    if (escrow && escrow.status === 'locked') {
      throw new ForbiddenException(
        'Cannot update rate after funds are locked in escrow. Rate changes must be made before escrow activation.',
      );
    }

    // Get original rate from seller order
    const originalRate = trade.sellOrder
      ? trade.sellOrder.exchangeRate
      : trade.rate;
    const newRate = updateRateDto.newRate;

    // Validate rate change is within acceptable bounds (20% max deviation)
    const changePercentage = ((newRate - originalRate) / originalRate) * 100;
    const maxDeviation = 20; // 20% maximum allowed deviation

    if (Math.abs(changePercentage) > maxDeviation) {
      throw new BadRequestException(
        `Rate change of ${changePercentage.toFixed(2)}% exceeds maximum allowed deviation of ${maxDeviation}%`,
      );
    }

    // Prevent extremely low rates
    if (newRate < 0.0001) {
      throw new BadRequestException('Exchange rate cannot be less than 0.0001');
    }

    // Store previous effective rate for comparison
    const previousEffectiveRate = trade.getEffectiveRate();

    // Update trade with negotiated rate
    trade.negotiatedRate = newRate;
    trade.rateNegotiatedAt = new Date();
    trade.rateNegotiatedBy = sellerId;
    trade.rateNegotiationReason = updateRateDto.reason || null;

    // Save updated trade
    const updatedTrade = await this.tradeRepository.save(trade);

    // Calculate new amounts using effective rate
    const effectiveAmounts = updatedTrade.calculateEffectiveAmounts();

    // Calculate impact on original amounts
    const originalAmount = trade.amount;
    const originalConvertedAmount = trade.convertedAmount;

    // Recalculate converted amount based on new rate
    let newConvertedAmount: number;
    if (trade.currency === 'CAD') {
      newConvertedAmount = originalAmount * newRate; // CAD to NGN
    } else {
      newConvertedAmount = originalAmount / newRate; // NGN to CAD
    }

    // Prepare response data
    const rateAnalysis = {
      originalRate: originalRate,
      newRate: newRate,
      changeAmount: newRate - originalRate,
      changePercentage: changePercentage,
      direction:
        newRate > originalRate ? ('increase' as const) : ('decrease' as const),
      withinLimits: Math.abs(changePercentage) <= maxDeviation,
      // riskLevel: this.assessRateRiskLevel(Math.abs(changePercentage)),
    };

    const amountImpact = {
      currency: trade.currency,
      originalAmount: originalAmount,
      newCalculatedAmount: effectiveAmounts.baseAmount,
      amountDifference: effectiveAmounts.baseAmount - originalAmount,
      convertedCurrency: trade.convertedCurrency,
      originalConvertedAmount: originalConvertedAmount,
      newConvertedAmount: newConvertedAmount,
      convertedDifference: newConvertedAmount - originalConvertedAmount,
    };

    // Notify buyer about rate change
    await this.notifyBuyerOfRateChange(
      updatedTrade,
      previousEffectiveRate,
      newRate,
      changePercentage,
      updateRateDto.reason,
    );

    // Log rate change for audit
    this.logger.log(
      `Rate negotiated for trade ${tradeId}: ${originalRate} → ${newRate} (${changePercentage.toFixed(2)}% change) by seller ${sellerId}${updateRateDto.reason ? `. Reason: ${updateRateDto.reason}` : ''}`,
    );

    return {
      success: true,
      message: `Trade rate successfully updated from ${originalRate} to ${newRate}`,
      tradeInfo: {
        id: updatedTrade.id,
        originalRate: originalRate,
        negotiatedRate: newRate,
        effectiveRate: updatedTrade.getEffectiveRate(),
        rateNegotiatedAt: updatedTrade.rateNegotiatedAt!,
        rateNegotiatedBy: updatedTrade.rateNegotiatedBy!,
        reason: updatedTrade.rateNegotiationReason,
      },
      rateAnalysis,
      amountImpact,
    };
  }

  /**
   * Helper method to notify buyer of rate changes
   */
  private async notifyBuyerOfRateChange(
    trade: P2PTrade,
    previousRate: number,
    newRate: number,
    changePercentage: number,
    reason?: string,
  ): Promise<void> {
    try {
      const seller =
        trade.seller ||
        (await this.userRepository.findOne({ where: { id: trade.sellerId } }));
      const buyer =
        trade.buyer ||
        (await this.userRepository.findOne({ where: { id: trade.buyerId } }));

      if (!seller || !buyer) return;

      const sellerName =
        `${seller.firstName || ''} ${seller.lastName || ''}`.trim() || 'Seller';
      const direction = newRate > previousRate ? 'increased' : 'decreased';
      const changeSign = newRate > previousRate ? '+' : '';

      let notificationMessage = `${sellerName} has ${direction} the exchange rate from ${previousRate} to ${newRate} (${changeSign}${changePercentage.toFixed(2)}%)`;

      if (reason) {
        notificationMessage += `. Reason: ${reason}`;
      }

      // Send detailed in-app notification
      await this.notificationService.create({
        userId: trade.buyerId,
        type: NotificationType.P2P_RATE_RESET,
        title: 'Exchange Rate Reset',
        body: notificationMessage,
        data: {
          tradeId: trade.id,
          sellerId: trade.sellerId,
          sellerName: sellerName,
          previousNegotiatedRate: previousRate,
          resetToOriginalRate: previousRate,
          resetAt: new Date().toISOString(),
          tradeStatus: trade.status,
        },
        action: `/p2p/trades/${trade.id}`,
        category: 'trade',
        priority: 'medium',
        sendPush: true,
        senderId: trade.sellerId,
      });

      // Send push notification
      if (buyer.fcmToken) {
        await this.firebaseService.sendPushNotification(buyer.fcmToken, {
          title: 'Exchange Rate Reset',
          body: notificationMessage,
          data: {
            type: 'p2p_rate_reset',
            tradeId: trade.id.toString(),
            originalRate: previousRate.toString(),
            previousRate: previousRate.toString(),
          },
        });
      }
    } catch (error) {
      this.logger.error('Failed to notify buyer of rate reset:', error);
    }
  }

  ///////////DISPUTE///////

  /**
   * Create a dispute for a trade
   */
  async createDispute(
    userId: number,
    createDisputeDto: CreateDisputeDto,
  ): Promise<{
    success: boolean;
    message: string;
    dispute: Dispute;
  }> {
    // 1. Find the trade
    const trade = await this.tradeRepository.findOne({
      where: { id: parseInt(createDisputeDto.tradeId) },
      relations: ['buyer', 'seller', 'negotiation'],
    });

    if (!trade) {
      throw new NotFoundException('Trade not found');
    }

    // 2. Verify user is part of the trade
    if (trade.buyerId !== userId && trade.sellerId !== userId) {
      throw new ForbiddenException('You are not part of this trade');
    }

    // 3. Check if dispute already exists for this trade
    const existingDispute = await this.disputeRepository.findOne({
      where: {
        tradeId: trade.id,
        status: In([DisputeStatus.PENDING, DisputeStatus.UNDER_REVIEW]),
      },
    });

    if (existingDispute) {
      throw new BadRequestException(
        'A dispute already exists for this trade. Please wait for resolution.',
      );
    }

    // 4. Verify trade is in a disputable status
    if (
      ![TradeStatus.ACTIVE, TradeStatus.PAYMENT_SENT].includes(trade.status)
    ) {
      throw new BadRequestException(
        `Cannot create dispute for trade with status: ${trade.status}`,
      );
    }

    // 5. Create the dispute
    const dispute = this.disputeRepository.create({
      tradeId: trade.id,
      raisedBy: userId,
      description: createDisputeDto.description,
      amount: createDisputeDto.amount,
      transactionType: createDisputeDto.transactionType,
      screenshots: createDisputeDto.screenshots || [],
      additionalInfo: createDisputeDto.additionalInfo,
      status: DisputeStatus.PENDING,
    });

    const savedDispute = await this.disputeRepository.save(dispute);

    // 6. Update trade status to DISPUTED
    trade.status = TradeStatus.DISPUTED;
    await this.tradeRepository.save(trade);

    // 7. Mark escrow as disputed (if exists)
    try {
      const escrow = await this.escrowService.findActiveEscrowByTrade(trade.id);
      if (escrow) {
        await this.escrowService.markAsDisputed(escrow.id, savedDispute.id);
      }
    } catch (error) {
      this.logger.error(
        `Failed to update escrow for dispute: ${error.message}`,
      );
    }

    // 8. Notify the other party
    const otherUserId =
      trade.buyerId === userId ? trade.sellerId : trade.buyerId;
    const otherUser = await this.userRepository.findOne({
      where: { id: otherUserId },
    });
    const disputeRaiser = await this.userRepository.findOne({
      where: { id: userId },
    });

    await this.notificationService.create({
      userId: otherUserId,
      type: NotificationType.DISPUTE_CREATED,
      title: 'Dispute Created',
      body: `${disputeRaiser.firstName} has raised a dispute on trade ${trade.id}`,
      data: {
        disputeId: savedDispute.id,
        tradeId: trade.id,
        amount: savedDispute.amount,
        raisedBy: userId,
        raisedByName: `${disputeRaiser.firstName} ${disputeRaiser.lastName}`,
      },
      action: `/disputes/${savedDispute.id}`,
      category: 'dispute',
      priority: 'high',
      sendPush: true,
      senderId: userId,
    });
    // 9. Notify admins via email
    try {
      // Find all admin users (assuming role: 'admin')
      // const admins = await this.userRepository.find({
      // where: { role: 'admin' },
      // });

      // for (const admin of admins) {
      // if (admin.email) {
      await this.notificationServices.sendEmail(
        process.env.BREVO_SENDER_EMAIL,

        'New P2P Trade Dispute Created',
        `A new dispute has been raised for trade ID ${trade.id} by ${disputeRaiser.firstName} ${disputeRaiser.lastName}. Reason: ${createDisputeDto.description}`,
        `<p>A new dispute has been raised for trade ID <strong>${trade.id}</strong> by <strong>${disputeRaiser.firstName} ${disputeRaiser.lastName}</strong>.</p>
         <p><strong>Reason:</strong> ${createDisputeDto.description}</p>
         <p>Please review and take necessary action.</p>`,
      );
      // }
      // }
    } catch (emailError) {
      this.logger.error(
        `Failed to send dispute notification email to admins: ${emailError.message}`,
        emailError.stack,
      );
    }
    // 9. Notify admins
    // await this.notifyAdmins(savedDispute, trade, disputeRaiser);

    this.logger.log(
      `Dispute ${savedDispute.id} created for trade ${trade.id} by user ${userId}`,
    );

    return {
      success: true,
      message:
        'Dispute created successfully. An admin will review your case shortly.',
      dispute: savedDispute,
    };
  }

  // private async notifyAdmins(dispute: Dispute, trade: P2PTrade, raisedBy: User) {
  //   // Get all admin users
  //   const admins = await this.userRepository.find({
  //     where: { role: UserRole.ADMIN },
  //   });

  //   for (const admin of admins) {
  //     await this.notificationService.create({
  //       userId: admin.id,
  //       type: NotificationType.ADMIN_DISPUTE_ALERT,
  //       title: 'New Dispute Requires Attention',
  //       body: `${raisedBy.firstName} created a dispute for trade ${trade.id}. `,
  //       data: {
  //         disputeId: dispute.id,
  //         tradeId: trade.id,
  //         amount: dispute.amount,
  //         raisedBy: raisedBy.id,
  //         status: dispute.status,
  //       },
  //       action: `/admin/disputes/${dispute.id}`,
  //       category: 'admin',
  //       priority: 'urgent',
  //       sendPush: true,
  //       senderId: raisedBy.id,
  //     });
  //   }
  // }

  /**
   * Admin resolves a dispute
   */
  // async resolveDispute(
  //   tradeId: number,
  //   adminId: number,
  //   resolveDisputeDto: ResolveDisputeDto,
  // ): Promise<{ success: boolean; message: string; resolution: any }> {
  //   const trade = await this.getTrade(tradeId, adminId);

  //   // Verify trade is disputed
  //   if (trade.status !== TradeStatus.DISPUTED) {
  //     throw new BadRequestException('Trade is not in disputed status');
  //   }

  //   // Check escrow exists and is disputed
  //   const escrow = await this.escrowService.getEscrowByTradeId(tradeId);
  //   if (!escrow || escrow.status !== 'disputed') {
  //     throw new BadRequestException('No disputed escrow found for this trade');
  //   }

  //   const queryRunner = this.datasource.createQueryRunner();
  //   await queryRunner.connect();
  //   await queryRunner.startTransaction();

  //   try {
  //     let resolutionResult: any;

  //     switch (resolveDisputeDto.resolution) {
  //       case DisputeResolution.RELEASE_TO_BUYER:
  //         // Release all funds to buyer
  //         resolutionResult = await this.escrowService.releaseFunds(
  //           tradeId,
  //           adminId,
  //           `Admin resolution: ${resolveDisputeDto.adminComment}`,
  //         );
  //         trade.status = TradeStatus.COMPLETED;
  //         break;

  //       case DisputeResolution.REFUND_TO_SELLER:
  //         // Refund all funds to seller
  //         resolutionResult = await this.escrowService.refundFunds(
  //           tradeId,
  //           adminId,
  //           `Admin resolution: ${resolveDisputeDto.adminComment}`,
  //         );
  //         trade.status = TradeStatus.CANCELLED;
  //         break;

  //       case DisputeResolution.PARTIAL_RELEASE:
  //         // Handle partial release (you'd need to implement this in escrow service)
  //         if (
  //           !resolveDisputeDto.buyerAmount ||
  //           !resolveDisputeDto.sellerAmount
  //         ) {
  //           throw new BadRequestException(
  //             'Buyer and seller amounts required for partial release',
  //           );
  //         }

  //         // For now, this would require additional escrow service methods
  //         // to handle partial releases
  //         throw new BadRequestException('Partial release not yet implemented');

  //       default:
  //         throw new BadRequestException('Invalid resolution type');
  //     }

  //     // Update trade
  //     trade.paymentConfirmedAt = new Date();
  //     await queryRunner.manager.save(trade);

  //     // Create resolution record
  //     const resolution = {
  //       tradeId: tradeId,
  //       resolvedBy: adminId,
  //       resolution: resolveDisputeDto.resolution,
  //       adminComment: resolveDisputeDto.adminComment,
  //       resolvedAt: new Date(),
  //       escrowResult: resolutionResult,
  //     };

  //     await queryRunner.commitTransaction();

  //     // Update Firebase
  //     await this.firebaseService.updateTradeStatus(tradeId, trade.status);

  //     // Notify parties
  //     await this.notifyDisputeResolved(trade, resolution);

  //     this.logger.log(
  //       `Dispute resolved for trade ${tradeId} by admin ${adminId}: ${resolveDisputeDto.resolution}`,
  //     );

  //     return {
  //       success: true,
  //       message: 'Dispute resolved successfully',
  //       resolution: resolution,
  //     };
  //   } catch (error) {
  //     await queryRunner.rollbackTransaction();
  //     this.logger.error(
  //       `Failed to resolve dispute: ${error.message}`,
  //       error.stack,
  //     );
  //     throw error;
  //   } finally {
  //     await queryRunner.release();
  //   }
  // }

  /**
   * Get dispute details for a trade
   */
  async getDisputeDetails(tradeId: number, userId: number): Promise<any> {
    const trade = await this.getTrade(tradeId, userId);

    // Verify user is part of the trade or is admin
    const user = await this.userRepository.findOne({ where: { id: userId } });
    // const isAdmin = user?.role === 'admin'; // Assuming you have role field

    // if (trade.buyerId !== userId && trade.sellerId !== userId && !isAdmin) {
    //   throw new ForbiddenException('You cannot view this dispute');
    // }

    const escrow = await this.escrowService.getEscrowByTradeId(tradeId);

    return {
      tradeId: tradeId,
      tradeStatus: trade.status,
      escrow: escrow,
      // You'd typically fetch from a disputes table here
      // For now, returning escrow info
      disputeStatus: escrow?.status || 'no_dispute',
      canCreateDispute:
        trade.status === TradeStatus.PAYMENT_SENT ||
        trade.status === TradeStatus.ACTIVE,
    };
  }

  /**
   * Notify parties when dispute is created
   */
  private async notifyDisputeCreated(
    trade: P2PTrade,
    createdBy: number,
    dispute: any,
  ): Promise<void> {
    const creatorRole = trade.buyerId === createdBy ? 'buyer' : 'seller';
    const otherUserId =
      trade.buyerId === createdBy ? trade.sellerId : trade.buyerId;

    const creator = await this.userRepository.findOne({
      where: { id: createdBy },
    });
    const creatorName = creator
      ? `${creator.firstName || ''} ${creator.lastName || ''}`.trim()
      : creatorRole;

    // Notify the other party
    await this.notificationService.create({
      userId: otherUserId,
      type: NotificationType.P2P_DISPUTE_CREATED,
      title: 'Trade Dispute Created',
      body: `${creatorName} has created a dispute for this trade. An admin will review and resolve it.`,
      data: {
        tradeId: trade.id,
        disputeReason: dispute.reason,
        disputeDescription: dispute.description,
        createdBy: createdBy,
        creatorRole: creatorRole,
        escrowLocked: true,
        disputeId: dispute.escrowId,
      },
      action: `/p2p/trades/${trade.id}/dispute`,
      category: 'dispute',
      priority: 'high',
      sendPush: true,
      senderId: createdBy,
    });

    // Notify admin (you'd need to identify admin users)
    // This is a placeholder - implement based on your admin system
    const adminMessage = `New P2P trade dispute created for trade ${trade.id} by ${creatorName}. Reason: ${dispute.reason}`;
    this.logger.log(`ADMIN ALERT: ${adminMessage}`);
  }

  /**
   * Notify parties when dispute is resolved
   */
  private async notifyDisputeResolved(
    trade: P2PTrade,
    resolution: any,
  ): Promise<void> {
    const notifyUser = async (userId: number, role: string) => {
      await this.notificationService.create({
        userId: userId,
        type: NotificationType.P2P_DISPUTE_RESOLVED,
        title: 'Trade Dispute Resolved',
        body: `Your trade dispute has been resolved by admin. Resolution: ${resolution.resolution}`,
        data: {
          tradeId: trade.id,
          resolution: resolution.resolution,
          adminComment: resolution.adminComment,
          resolvedAt: resolution.resolvedAt,
          finalTradeStatus: trade.status,
          userRole: role,
        },
        action: `/p2p/trades/${trade.id}`,
        category: 'dispute',
        priority: 'high',
        sendPush: true,
        senderId: resolution.resolvedBy,
      });
    };

    // Notify both buyer and seller
    await notifyUser(trade.buyerId, 'buyer');
    await notifyUser(trade.sellerId, 'seller');
  }

  /**
   * Get user's current open trades and negotiations count (separately)
   */
  async getUserOpenActivitiesCount(userId: number): Promise<{
    tradesCount: number;
    negotiationsCount: number;
  }> {
    // Count active trades (PENDING, ACTIVE, PAYMENT_SENT)
    const tradesCount = await this.tradeRepository.count({
      where: [
        {
          buyerId: userId,
          status: In([
            TradeStatus.PENDING,
            TradeStatus.ACTIVE,
            TradeStatus.PAYMENT_SENT,
          ]),
        },
        {
          sellerId: userId,
          status: In([
            TradeStatus.PENDING,
            TradeStatus.ACTIVE,
            TradeStatus.PAYMENT_SENT,
          ]),
        },
      ],
    });

    // Count active negotiations (PENDING, IN_PROGRESS)
    const negotiationsCount = await this.negotiationRepository.count({
      where: [
        {
          buyerId: userId,
          status: In([
            NegotiationStatus.PENDING,
            NegotiationStatus.IN_PROGRESS,
          ]),
          expiresAt: MoreThan(new Date()),
        },
        {
          sellerId: userId,
          status: In([
            NegotiationStatus.PENDING,
            NegotiationStatus.IN_PROGRESS,
          ]),
          expiresAt: MoreThan(new Date()),
        },
      ],
    });

    return {
      tradesCount,
      negotiationsCount,
    };
  }

  /**
   * Check if user has reached trade limit
   */
  async checkUserTradeLimit(
    userId: number,
    userRole: 'initiator' | 'counterparty' = 'initiator',
  ): Promise<void> {
    const activities = await this.getUserOpenActivitiesCount(userId);

    if (activities.tradesCount >= this.MAX_OPEN_TRADES) {
      const roleMessage =
        userRole === 'initiator'
          ? `You have reached the maximum limit of ${this.MAX_OPEN_TRADES} active trades.`
          : `This user is currently at their maximum limit of ${this.MAX_OPEN_TRADES} active trades.`;

      throw new BadRequestException(
        `${roleMessage} Please complete or cancel existing trades before creating new ones.`,
      );
    }
  }

  /**
   * Check if user has reached negotiation limit
   */
  async checkUserNegotiationLimit(
    userId: number,
    userRole: 'initiator' | 'counterparty' = 'initiator',
  ): Promise<void> {
    const activities = await this.getUserOpenActivitiesCount(userId);

    if (activities.negotiationsCount >= this.MAX_OPEN_NEGOTIATIONS) {
      const roleMessage =
        userRole === 'initiator'
          ? `You have reached the maximum limit of ${this.MAX_OPEN_NEGOTIATIONS} active negotiations.`
          : `This user is currently at their maximum limit of ${this.MAX_OPEN_NEGOTIATIONS} active negotiations.`;

      throw new BadRequestException(
        `${roleMessage} Please complete existing negotiations before starting new ones.`,
      );
    }
  }

  /**
   * Validate TRADE creation limits for both parties
   */
  async validateTradeCreationLimits(
    buyerId: number,
    sellerId: number,
    sellerName?: string,
  ): Promise<void> {
    // Check buyer's TRADE limit (initiator)
    await this.checkUserTradeLimit(buyerId, 'initiator');

    // Check seller's TRADE limit (counterparty)
    try {
      await this.checkUserTradeLimit(sellerId, 'counterparty');
    } catch (error) {
      const sellerDisplayName = sellerName || 'The seller';
      throw new BadRequestException(
        `${sellerDisplayName} is currently at their maximum limit of ${this.MAX_OPEN_TRADES} active trades. Please try again later or choose another seller.`,
      );
    }
  }

  /**
   * Validate NEGOTIATION creation limits for both parties
   */
  async validateNegotiationCreationLimits(
    buyerId: number,
    sellerId: number,
    sellerName?: string,
  ): Promise<void> {
    // Check buyer's NEGOTIATION limit (initiator)
    await this.checkUserNegotiationLimit(buyerId, 'initiator');

    // Check seller's NEGOTIATION limit (counterparty)
    try {
      await this.checkUserNegotiationLimit(sellerId, 'counterparty');
    } catch (error) {
      const sellerDisplayName = sellerName || 'The seller';
      throw new BadRequestException(
        `${sellerDisplayName} is currently busy with ${this.MAX_OPEN_NEGOTIATIONS} active negotiations. Please try again later or choose another seller.`,
      );
    }
  }
}
