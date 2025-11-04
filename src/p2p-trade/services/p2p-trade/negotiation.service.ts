import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/auth/entities/user.entity';
import { FirebaseService } from 'src/firebase/firebase.service';
import { NotificationType } from 'src/notifications/dto/create-notification.dto/create-notification.dto';
import { NotificationService } from 'src/notifications/notifications.service';
import {
  RespondToNegotiationDto,
  UpdateNegotiationRateDto,
} from 'src/p2p-trade/dtos/negotiation.dto';
import {
  Negotiation,
  NegotiationStatus,
} from 'src/p2p-trade/entities/negotiation.entity';
import { P2PSeller } from 'src/P2P/entities/p2p-seller.entity';
import { In, MoreThan, Repository } from 'typeorm';
import { P2PTradeService } from './p2p-trade.service';

@Injectable()
export class NegotiationService {
  private readonly MAX_OPEN_TRADES = 3;
  private readonly MAX_OPEN_NEGOTIATIONS = 3;
  private readonly logger = new Logger(NegotiationService.name);
  constructor(
    @InjectRepository(Negotiation)
    private readonly negotiationRepository: Repository<Negotiation>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(P2PSeller)
    private readonly sellerRepository: Repository<P2PSeller>,
    private readonly notificationService: NotificationService,
    // private readonly P2PTradeService: P2PTradeService, // Assuming TradeService is defined elsewhere
    private readonly firebaseService: FirebaseService,
  ) {}

  /**
   * Get user's current open trades and negotiations count (separately)
   */
  async getUserOpenActivitiesCount(userId: number): Promise<{
    negotiationsCount: number;
  }> {
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
      negotiationsCount,
    };
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
  async createNegotiation(
    sellOrderId: number,
    buyerId: number,
  ): Promise<Negotiation> {
    const sellOrder = await this.sellerRepository.findOne({
      where: { id: sellOrderId },
      relations: ['user'],
    });

    if (!sellOrder) {
      throw new NotFoundException('Sell order not found');
    }
    await this.validateNegotiationCreationLimits(
      buyerId,
      sellOrder.userId,
      sellOrder.user.firstName,
    );
    // Set isNegotiating to true on the sell order
    sellOrder.isNegotiating = true;
    await this.sellerRepository.save(sellOrder);
    // if (sellOrder.userId === buyerId) {
    //   throw new BadRequestException('Cannot negotiate with your own order');
    // }

    // Check for existing active negotiation
    const existingNegotiation = await this.negotiationRepository.findOne({
      where: {
        sellOrderId,
        buyerId,
        status: In([
          NegotiationStatus.PENDING,
          NegotiationStatus.IN_PROGRESS,
          NegotiationStatus.AGREED,
        ]),
      },
    });

    if (existingNegotiation) {
      throw new BadRequestException('Active negotiation already exists');
    }
    // Prevent buyer from creating another negotiation for any sell order unless previous one is completed/declined/expired
    const activeNegotiation = await this.negotiationRepository.findOne({
      where: {
        buyerId,
        status: In([
          NegotiationStatus.PENDING,
          NegotiationStatus.IN_PROGRESS,
          NegotiationStatus.AGREED,
        ]),
      },
    });

    if (activeNegotiation) {
      throw new BadRequestException(
        'You already have an active negotiation. Please complete or cancel it before starting a new one.',
      );
    }
    const negotiation = this.negotiationRepository.create({
      sellOrderId,
      buyerId,
      sellerId: sellOrder.userId,
      proposedRate: sellOrder.exchangeRate,
      originalRate: sellOrder.exchangeRate,
      status: NegotiationStatus.PENDING,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });

    const savedNegotiation = await this.negotiationRepository.save(negotiation);

    await this.firebaseService.createNegotiationChatRoom({
      negotiationId: savedNegotiation.id,
      buyerId: buyerId,
      sellerId: sellOrder.userId,
      sellOrderId: sellOrderId,
      originalRate: sellOrder.exchangeRate,
      status: 'negotiating',
    });
    // 🔥 ADD THIS: Notify seller about negotiation request
    await this.notifySellerOfNegotiationRequest(
      savedNegotiation,
      sellOrder.user,
    );

    return savedNegotiation;
  }

  // 🔥 ADD THIS METHOD: Notification helper
  private async notifySellerOfNegotiationRequest(
    negotiation: Negotiation,
    seller: User,
  ): Promise<void> {
    try {
      // Get buyer details
      const buyer = await this.userRepository.findOne({
        where: { id: negotiation.buyerId },
      });

      const buyerName = buyer
        ? `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || 'Buyer'
        : 'Buyer';

      const notificationMessage = `${buyerName} wants to negotiate the exchange rate for your sell order (Current rate: ${negotiation.originalRate})`;

      // Send in-app notification
      await this.notificationService.create({
        userId: negotiation.sellerId,
        type: NotificationType.P2P_NEGOTIATION_REQUEST,
        title: 'Rate Negotiation Request',
        body: notificationMessage,
        data: {
          negotiationId: negotiation.id,
          sellOrderId: negotiation.sellOrderId,
          buyerId: negotiation.buyerId,
          buyerName: buyerName,
          originalRate: negotiation.originalRate,
          currentRate: negotiation.proposedRate,
          expiresAt: negotiation.expiresAt.toISOString(),
          timeRemaining: Math.floor(
            (negotiation.expiresAt.getTime() - Date.now()) / (1000 * 60),
          ), // minutes
        },
        action: `/negotiations/${negotiation.id}`,
        category: 'negotiation',
        priority: 'medium',
        sendPush: true,
        senderId: negotiation.buyerId,
      });

      // Send push notification if seller has FCM token
      if (seller.fcmToken) {
        await this.firebaseService.sendPushNotification(seller.fcmToken, {
          title: 'New Rate Negotiation',
          body: notificationMessage,
          data: {
            type: 'p2p_negotiation_request',
            negotiationId: negotiation.id.toString(),
            sellOrderId: negotiation.sellOrderId.toString(),
            buyerId: negotiation.buyerId.toString(),
            buyerName: buyerName,
            originalRate: negotiation.originalRate.toString(),
            action: 'view_negotiation',
          },
        });
      }

      this.logger.log(
        `Negotiation request notification sent to seller ${negotiation.sellerId} for negotiation ${negotiation.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to notify seller of negotiation request: ${error.message}`,
        error.stack,
      );
      // Don't throw - notification failure shouldn't break negotiation creation
    }
  }

  async updateNegotiationRate(
    negotiationId: number,
    sellerId: number,
    updateDto: UpdateNegotiationRateDto,
  ): Promise<Negotiation> {
    const negotiation = await this.negotiationRepository.findOne({
      where: { id: negotiationId, sellerId },
      relations: ['buyer', 'seller', 'sellOrder'],
    });

    if (!negotiation) {
      throw new NotFoundException(
        'Negotiation not found or you are not authorized to update it',
      );
    }

    // Check if negotiation is still active
    if (
      ![NegotiationStatus.PENDING, NegotiationStatus.IN_PROGRESS].includes(
        negotiation.status,
      )
    ) {
      throw new BadRequestException(
        'Cannot update rate for completed or expired negotiation',
      );
    }

    // Check if negotiation has expired
    if (new Date() > negotiation.expiresAt) {
      negotiation.status = NegotiationStatus.EXPIRED;
      await this.negotiationRepository.save(negotiation);
      throw new BadRequestException(
        'This negotiation has expired. Please start a new one.',
      );
    }

    // Validate rate change (20% max deviation from original)
    const changePercentage = Math.abs(
      ((updateDto.proposedRate - negotiation.originalRate) /
        negotiation.originalRate) *
        100,
    );

    if (changePercentage > 20) {
      throw new BadRequestException(
        `Rate change of ${changePercentage.toFixed(2)}% exceeds maximum allowed deviation of 20%`,
      );
    }

    // Prevent extremely low rates
    if (updateDto.proposedRate < 0.0001) {
      throw new BadRequestException('Exchange rate cannot be less than 0.0001');
    }

    // Store previous rate for notifications
    const previousRate = negotiation.proposedRate;

    // Update negotiation
    negotiation.proposedRate = updateDto.proposedRate;
    negotiation.notes = updateDto.notes;
    negotiation.status = NegotiationStatus.IN_PROGRESS;
    negotiation.updatedAt = new Date();

    const updatedNegotiation =
      await this.negotiationRepository.save(negotiation);

    // Notify buyer of rate update
    await this.notifyBuyerOfRateUpdate(updatedNegotiation, previousRate);

    // Log the rate update
    this.logger.log(
      `Negotiation ${negotiationId}: Rate updated from ${previousRate} to ${updateDto.proposedRate} by seller ${sellerId}`,
    );

    return updatedNegotiation;
  }

  async respondToNegotiation(
    negotiationId: number,
    buyerId: number,
    responseDto: RespondToNegotiationDto,
  ): Promise<{
    success: boolean;
    message: string;
    negotiation: Negotiation;
    sellOrder: any; // Added sell order data
  }> {
    const negotiation = await this.negotiationRepository.findOne({
      where: { id: negotiationId, buyerId },
      relations: ['buyer', 'seller', 'sellOrder'], // Include sellOrder relation
    });

    if (!negotiation) {
      throw new NotFoundException(
        'Negotiation not found or you are not authorized to respond',
      );
    }
    // Set isNegotiating to false on the sell order
    if (negotiation.sellOrder) {
      negotiation.sellOrder.isNegotiating = false;
      await this.sellerRepository.save(negotiation.sellOrder);
    }
    // Validate negotiation status and expiry
    if (
      ![NegotiationStatus.PENDING, NegotiationStatus.IN_PROGRESS].includes(
        negotiation.status,
      )
    ) {
      throw new BadRequestException(
        'Cannot respond to completed or cancelled negotiation',
      );
    }

    if (new Date() > negotiation.expiresAt) {
      negotiation.status = NegotiationStatus.EXPIRED;
      await this.negotiationRepository.save(negotiation);
      throw new BadRequestException('This negotiation has expired');
    }

    // Update negotiation based on response

    negotiation.status = NegotiationStatus.AGREED;
    negotiation.agreedAt = new Date();

    negotiation.notes = responseDto.notes;
    negotiation.updatedAt = new Date();

    const now = new Date();
    const deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    negotiation.agreedBy = buyerId;
    negotiation.tradeCreationDeadline = deadline;

    const updatedNegotiation =
      await this.negotiationRepository.save(negotiation);

    // Notify seller of response
    await this.notifySellerOfResponse(
      updatedNegotiation,
      responseDto.action,
      responseDto.notes,
    );

    return {
      success: true,
      message:
        'Rate accepted! You can now proceed to create a trade with the agreed rate.',
      negotiation: updatedNegotiation,
      sellOrder: {
        id: negotiation.sellOrder.id,
        userId: negotiation.sellOrder.userId,
        sellCurrency: negotiation.sellOrder.sellCurrency,
        buyCurrency: negotiation.sellOrder.buyCurrency,
        availableAmount: negotiation.sellOrder.availableAmount.toString(),

        exchangeRate: negotiation.sellOrder.exchangeRate,
        minTransactionLimit: negotiation.sellOrder.minTransactionLimit,

        transactionDuration: parseFloat(
          negotiation.sellOrder.transactionDuration.toString(),
        ),
        status: negotiation.sellOrder.status,
        isActive: negotiation.sellOrder.isActive,

        bankName: negotiation.sellOrder.bankName,
        accountNumber: negotiation.sellOrder.accountNumber,
        accountName: negotiation.sellOrder.accountName,
        interacEmail: negotiation.sellOrder.interacEmail,
        termsOfPayment: parseFloat(
          negotiation.sellOrder.termsOfPayment.toString(),
        ),
        completedTrades: parseFloat(
          negotiation.sellOrder.completedTrades.toString(),
        ),
        totalTrades: parseFloat(negotiation.sellOrder.totalTrades.toString()),
        totalReviews: parseFloat(negotiation.sellOrder.totalReviews.toString()),
        rating: parseFloat(negotiation.sellOrder.rating.toString()),
        completionRate: parseFloat(
          negotiation.sellOrder.completionRate.toString(),
        ),
        user: {
          firstName: negotiation.seller.firstName,
          lastName: negotiation.seller.lastName,
        },

        createdAt: negotiation.sellOrder.createdAt,
        updatedAt: negotiation.sellOrder.updatedAt,
      },
    };
    // sellOrder: negotiation.sellOrder, // Return sell order data
  }

  private async notifySellerOfResponse(
    negotiation: Negotiation,
    action: 'accept',
    notes?: string,
  ): Promise<void> {
    try {
      const buyer =
        negotiation.buyer ||
        (await this.userRepository.findOne({
          where: { id: negotiation.buyerId },
        }));
      const seller =
        negotiation.seller ||
        (await this.userRepository.findOne({
          where: { id: negotiation.sellerId },
        }));

      if (!buyer || !seller) {
        this.logger.warn(
          `Missing user data for negotiation response notification on negotiation ${negotiation.id}`,
        );
        return;
      }

      const buyerName =
        `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || 'Buyer';

      let notificationTitle: string;
      let notificationMessage: string;
      let notificationType: NotificationType;

      // Calculate time remaining
      const timeRemaining = Math.max(
        0,
        Math.floor(
          (negotiation.expiresAt.getTime() - Date.now()) / (1000 * 60),
        ),
      );

      // Send detailed in-app notification
      await this.notificationService.create({
        userId: negotiation.sellerId,
        type: 'accepted_negotiation' as NotificationType,
        title: 'Negotiation Response Received',
        body: `${buyerName} has accepted your proposed rate of ${negotiation.proposedRate}.`,
        data: {
          negotiationId: negotiation.id,
          sellOrderId: negotiation.sellOrderId,
          buyerId: negotiation.buyerId,
          buyerName: buyerName,
          action: action,
          proposedRate: negotiation.proposedRate,
          originalRate: negotiation.originalRate,
          status: negotiation.status,
          notes: notes || null,
          respondedAt: new Date().toISOString(),
          timeRemainingMinutes: timeRemaining,
          // Next steps based on action
          canCreateTrade: action === 'accept',
        },
        action:
          action === 'accept'
            ? `/negotiations/${negotiation.id}/create-trade`
            : `/negotiations/${negotiation.id}`,
        category: 'negotiation',
        priority: action === 'accept' ? 'high' : 'medium',
        sendPush: true,
        senderId: negotiation.buyerId,
      });

      // Send push notification
      if (seller.fcmToken) {
        await this.firebaseService.sendPushNotification(seller.fcmToken, {
          title: notificationTitle,
          body: notificationMessage,
          data: {
            type:
              action === 'accept' ? 'p2p_rate_accepted' : 'p2p_rate_declined',
            negotiationId: negotiation.id.toString(),
            sellOrderId: negotiation.sellOrderId.toString(),
            buyerId: negotiation.buyerId.toString(),
            buyerName: buyerName,
            action: action,
            proposedRate: negotiation.proposedRate.toString(),
            status: negotiation.status,
            notes: notes || '',
            timeRemaining: timeRemaining.toString(),
          },
        });
      }

      this.logger.log(
        `Response notification sent to seller ${negotiation.sellerId} for negotiation ${negotiation.id}: ${action}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to notify seller of negotiation response: ${error.message}`,
        error.stack,
      );
    }
  }

  async markAsCompleted(negotiationId: number): Promise<void> {
    await this.negotiationRepository.update(negotiationId, {
      status: NegotiationStatus.COMPLETED,
      updatedAt: new Date(),
    });
  }

  async getAgreedNegotiation(
    sellOrderId: number,
    buyerId: number,
  ): Promise<Negotiation | null> {
    return await this.negotiationRepository.findOne({
      where: {
        sellOrderId,
        buyerId,
        status: NegotiationStatus.AGREED,
      },
    });
  }

  // Add this method to NegotiationService
  async getUserActiveNegotiations(userId: number): Promise<Negotiation[]> {
    return await this.negotiationRepository.find({
      where: [
        {
          buyerId: userId,
          status: In([
            NegotiationStatus.PENDING,
            NegotiationStatus.IN_PROGRESS,
            NegotiationStatus.AGREED,
          ]),
        },
        {
          sellerId: userId,
          status: In([
            NegotiationStatus.PENDING,
            NegotiationStatus.IN_PROGRESS,
            NegotiationStatus.AGREED,
          ]),
        },
      ],
      relations: ['buyer', 'seller', 'sellOrder'],
      order: { createdAt: 'DESC' },
    });
  }

  private async notifyBuyerOfRateUpdate(
    negotiation: Negotiation,
    previousRate: number,
  ): Promise<void> {
    try {
      // Get user details
      const buyer =
        negotiation.buyer ||
        (await this.userRepository.findOne({
          where: { id: negotiation.buyerId },
        }));
      const seller =
        negotiation.seller ||
        (await this.userRepository.findOne({
          where: { id: negotiation.sellerId },
        }));

      if (!buyer || !seller) {
        this.logger.warn(`Missing user data for negotiation ${negotiation.id}`);
        return;
      }

      const sellerName =
        `${seller.firstName || ''} ${seller.lastName || ''}`.trim() || 'Seller';
      const changePercentage =
        ((negotiation.proposedRate - negotiation.originalRate) /
          negotiation.originalRate) *
        100;
      const direction =
        negotiation.proposedRate > previousRate ? 'increased' : 'decreased';
      const changeSign = negotiation.proposedRate > previousRate ? '+' : '';

      // Calculate payment impact for buyer
      const sellOrder = negotiation.sellOrder;
      let paymentImpact = '';

      if (sellOrder) {
        const baseAmount = 1000; // Example amount for calculation
        const originalPayment =
          sellOrder.sellCurrency === 'CAD'
            ? baseAmount * negotiation.originalRate
            : baseAmount / negotiation.originalRate;
        const newPayment =
          sellOrder.sellCurrency === 'CAD'
            ? baseAmount * negotiation.proposedRate
            : baseAmount / negotiation.proposedRate;

        const paymentDiff = newPayment - originalPayment;
        paymentImpact =
          paymentDiff > 0
            ? `You'll pay ${Math.abs(paymentDiff).toFixed(2)} more`
            : `You'll pay ${Math.abs(paymentDiff).toFixed(2)} less`;
      }

      let notificationMessage = `${sellerName} has ${direction} the rate from ${previousRate} to ${negotiation.proposedRate} (${changeSign}${Math.abs(changePercentage).toFixed(2)}%)`;

      if (negotiation.notes) {
        notificationMessage += `. ${negotiation.notes}`;
      }

      // Calculate time remaining
      const timeRemaining = Math.max(
        0,
        Math.floor(
          (negotiation.expiresAt.getTime() - Date.now()) / (1000 * 60),
        ),
      );

      // Send detailed in-app notification
      await this.notificationService.create({
        userId: negotiation.buyerId,
        type: NotificationType.P2P_RATE_NEGOTIATION,
        title: 'Rate Updated in Negotiation',
        body: notificationMessage,
        data: {
          negotiationId: negotiation.id,
          sellOrderId: negotiation.sellOrderId,
          sellerId: negotiation.sellerId,
          sellerName: sellerName,
          // Rate information
          originalRate: negotiation.originalRate,
          previousRate: previousRate,
          newRate: negotiation.proposedRate,
          changePercentage: changePercentage.toFixed(2),
          direction: direction,
          // Negotiation details
          notes: negotiation.notes,
          status: negotiation.status,
          expiresAt: negotiation.expiresAt.toISOString(),
          timeRemainingMinutes: timeRemaining,
          // Payment impact
          paymentImpact: paymentImpact,
          // Actions available
          canAccept: true,
          canDecline: true,
          canCounter: false, // Buyer typically accepts/declines, doesn't counter
        },
        action: `/negotiations/${negotiation.id}`,
        category: 'negotiation',
        priority: 'high',
        sendPush: true,
        senderId: negotiation.sellerId,
      });

      // Send push notification
      if (buyer.fcmToken) {
        await this.firebaseService.sendPushNotification(buyer.fcmToken, {
          title: 'Rate Updated',
          body: `${sellerName} updated the rate to ${negotiation.proposedRate}. ${paymentImpact}`,
          data: {
            type: 'p2p_rate_updated',
            negotiationId: negotiation.id.toString(),
            sellOrderId: negotiation.sellOrderId.toString(),
            originalRate: negotiation.originalRate.toString(),
            previousRate: previousRate.toString(),
            newRate: negotiation.proposedRate.toString(),
            changePercentage: changePercentage.toFixed(2),
            direction: direction,
            timeRemaining: timeRemaining.toString(),
            action: 'review_rate_update',
          },
        });
      }

      this.logger.log(
        `Rate update notification sent to buyer ${negotiation.buyerId} for negotiation ${negotiation.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to notify buyer of rate update: ${error.message}`,
        error.stack,
      );
      // Don't throw - notification failure shouldn't break rate update
    }
  }

  // Add to NegotiationService
  async cancelNegotiation(
    negotiationId: number,
    userId: number,
    reason?: string,
  ): Promise<{ success: boolean; message: string; negotiation: Negotiation }> {
    const negotiation = await this.negotiationRepository.findOne({
      where: { id: negotiationId },
      relations: ['buyer', 'seller', 'sellOrder'],
    });

    if (!negotiation) {
      throw new NotFoundException('Negotiation not found');
    }
    // Set isNegotiating to false on the sell order if it exists
    if (negotiation.sellOrder) {
      negotiation.sellOrder.isNegotiating = false;
      await this.sellerRepository.save(negotiation.sellOrder);
    }
    // Verify user is part of the negotiation
    if (negotiation.buyerId !== userId && negotiation.sellerId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to cancel this negotiation',
      );
    }

    // Check if negotiation can be cancelled
    if (
      ![NegotiationStatus.PENDING, NegotiationStatus.IN_PROGRESS].includes(
        negotiation.status,
      )
    ) {
      throw new BadRequestException(
        `Cannot cancel negotiation with status: ${negotiation.status}. Only pending or in-progress negotiations can be cancelled.`,
      );
    }

    // Check if negotiation has already expired
    if (new Date() > negotiation.expiresAt) {
      negotiation.status = NegotiationStatus.EXPIRED;
      await this.negotiationRepository.save(negotiation);
      throw new BadRequestException('This negotiation has already expired');
    }

    // Determine who is cancelling
    const cancellerRole = negotiation.buyerId === userId ? 'buyer' : 'seller';
    const otherUserId =
      negotiation.buyerId === userId
        ? negotiation.sellerId
        : negotiation.buyerId;

    // Update negotiation status
    negotiation.status = NegotiationStatus.DECLINED;
    negotiation.notes = reason
      ? `Cancelled by ${cancellerRole}: ${reason}`
      : `Cancelled by ${cancellerRole}`;
    negotiation.updatedAt = new Date();

    const cancelledNegotiation =
      await this.negotiationRepository.save(negotiation);

    // Notify the other party
    await this.notifyNegotiationCancelled(
      cancelledNegotiation,
      userId,
      otherUserId,
      cancellerRole,
      reason,
    );

    // Log the cancellation
    this.logger.log(
      `Negotiation ${negotiationId} cancelled by ${cancellerRole} (${userId})${reason ? `. Reason: ${reason}` : ''}`,
    );

    return {
      success: true,
      message: `Negotiation cancelled successfully. The other party has been notified.`,
      negotiation: cancelledNegotiation,
    };
  }

  async getNegotiationById(
    negotiationId: number,
    userId: number,
  ): Promise<Negotiation> {
    const negotiation = await this.negotiationRepository.findOne({
      where: { id: negotiationId },
      relations: ['buyer', 'seller', 'sellOrder'],
    });

    if (!negotiation) {
      throw new NotFoundException(
        `Negotiation with ID ${negotiationId} not found`,
      );
    }

    // Verify user is part of the negotiation
    if (negotiation.buyerId !== userId && negotiation.sellerId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to view this negotiation',
      );
    }

    return negotiation;
  }
  /**
   * Notify the other party when negotiation is cancelled
   */
  private async notifyNegotiationCancelled(
    negotiation: Negotiation,
    cancellerId: number,
    otherUserId: number,
    cancellerRole: 'buyer' | 'seller',
    reason?: string,
  ): Promise<void> {
    try {
      // Get user details
      const canceller = await this.userRepository.findOne({
        where: { id: cancellerId },
      });
      const otherUser = await this.userRepository.findOne({
        where: { id: otherUserId },
      });

      if (!canceller || !otherUser) {
        this.logger.warn(
          `Missing user data for cancellation notification on negotiation ${negotiation.id}`,
        );
        return;
      }

      const cancellerName =
        `${canceller.firstName || ''} ${canceller.lastName || ''}`.trim() ||
        (cancellerRole === 'buyer' ? 'Buyer' : 'Seller');

      let notificationMessage = `${cancellerName} has cancelled the rate negotiation`;
      if (reason) {
        notificationMessage += `. Reason: ${reason}`;
      }

      // Calculate time that was remaining
      const timeRemaining = Math.max(
        0,
        Math.floor(
          (negotiation.expiresAt.getTime() - Date.now()) / (1000 * 60),
        ),
      );

      // Send detailed in-app notification
      await this.notificationService.create({
        userId: otherUserId,
        type: NotificationType.P2P_NEGOTIATION_CANCELLED,
        title: 'Negotiation Cancelled',
        body: notificationMessage,
        data: {
          negotiationId: negotiation.id,
          sellOrderId: negotiation.sellOrderId,
          cancellerId: cancellerId,
          cancellerRole: cancellerRole,
          cancellerName: cancellerName,
          reason: reason || null,
          // Negotiation details at time of cancellation
          proposedRate: negotiation.proposedRate,
          originalRate: negotiation.originalRate,
          timeRemainingAtCancellation: timeRemaining,
          cancelledAt: new Date().toISOString(),
          // User can still negotiate if they want
          canStartNewNegotiation: true,
          sellOrderStillAvailable: true,
        },
        action: `/sell-orders/${negotiation.sellOrderId}`,
        category: 'negotiation',
        priority: 'medium',
        sendPush: true,
        senderId: cancellerId,
      });

      // Send push notification
      if (otherUser.fcmToken) {
        await this.firebaseService.sendPushNotification(otherUser.fcmToken, {
          title: 'Negotiation Cancelled',
          body: notificationMessage,
          data: {
            type: 'p2p_negotiation_cancelled',
            negotiationId: negotiation.id.toString(),
            sellOrderId: negotiation.sellOrderId.toString(),
            cancellerId: cancellerId.toString(),
            cancellerRole: cancellerRole,
            cancellerName: cancellerName,
            reason: reason || '',
            action: 'view_sell_order',
          },
        });
      }

      this.logger.log(
        `Cancellation notification sent to ${cancellerRole === 'buyer' ? 'seller' : 'buyer'} ${otherUserId} for negotiation ${negotiation.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to notify negotiation cancellation: ${error.message}`,
        error.stack,
      );
      // Don't throw - notification failure shouldn't break cancellation
    }
  }
}
