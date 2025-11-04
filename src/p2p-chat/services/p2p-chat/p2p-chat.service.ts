// src/p2p-chat/services/p2p-chat.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import {
  P2PChatMessage,
  TradeStatus,
  MessageType,
} from '../../entities/p2p-chat.entity/p2p-chat.entity';
import {
  CreateMessageDto,
  UpdateTradeStatusDto,
  PaginationQueryDto,
} from '../../dtos/p2p-chat.dto/p2p-chat.dto';
import { FirebaseService } from '../../../firebase/firebase.service';
import { NotificationService } from '../../../notifications/notifications.service';
import { AuthService } from '../../../auth/services/auth.service';
import { P2PTrade } from 'src/p2p-trade/entities/p2p-trade.entity';
import { FileStoreService } from 'src/filestore/services/filestore.service';
import { Negotiation } from 'src/p2p-trade/entities/negotiation.entity';
import { NotificationType } from 'src/notifications/dto/create-notification.dto/create-notification.dto';
import { NegotiationService } from 'src/p2p-trade/services/p2p-trade/negotiation.service';

@Injectable()
export class P2PChatService {
  private readonly logger = new Logger(P2PChatService.name);

  constructor(
    @InjectRepository(P2PTrade)
    private readonly tradeRepository: Repository<P2PTrade>,
    @InjectRepository(P2PChatMessage)
    private readonly messageRepository: Repository<P2PChatMessage>,
    private readonly firebaseService: FirebaseService,
    private readonly fileStoreService: FileStoreService,
    private readonly notificationService: NotificationService,
    private readonly usersService: AuthService,
    private readonly negotiationService: NegotiationService,
  ) {}

  async getTrade(tradeId: number, userId: number): Promise<P2PTrade> {
    const trade = await this.tradeRepository.findOne({
      where: { id: tradeId },
      relations: ['buyer', 'seller'],
    });

    if (!trade) {
      throw new NotFoundException(`Trade with ID ${tradeId} not found`);
    }

    // Check if user is a participant
    if (trade.id !== tradeId) {
      throw new ForbiddenException('You do not have access to this trade');
    }

    return trade;
  }

  async getMessages(
    tradeId: number,
    userId: number,
    paginationQuery: PaginationQueryDto,
  ): Promise<{ messages: P2PChatMessage[]; total: number }> {
    // Verify user has access to this trade
    await this.getTrade(tradeId, userId);

    const { limit = 20, page = 1 } = paginationQuery;
    const skip = (page - 1) * limit;

    const [messages, total] = await this.messageRepository.findAndCount({
      where: { tradeId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip,
      relations: ['sender', 'receiver'],
      select: {
        id: true,
        tradeId: true,
        senderId: true,
        receiverId: true,
        content: true,
        type: true,
        // metadata: true,
        isRead: true,
        createdAt: true,
        updatedAt: true,
        sender: {
          id: true,
          firstName: true,
          lastName: true,
          profilePictureUrl: true,
        },
        receiver: {
          id: true,
          firstName: true,
          lastName: true,
          profilePictureUrl: true,
        },
      },
    });

    // Return messages in chronological order for the client
    return {
      messages: messages.reverse(),
      total,
    };
  }
  async createMessage(
    otherUserId: number,
    tradeId: number,
    userId: number,
    createMessageDto: CreateMessageDto,
  ): Promise<P2PChatMessage> {
    // Get trade and verify access
    const trade = await this.getTrade(tradeId, userId);

    // Create message in database
    const message = this.messageRepository.create({
      tradeId,
      senderId: userId,
      receiverId: otherUserId,
      content: createMessageDto.content,
      type: createMessageDto.type || MessageType.USER,
      metadata: createMessageDto.metadata,
      isRead: false,
    });

    const savedMessage = await this.messageRepository.save(message);

    // Add message to Firebase for real-time updates
    await this.firebaseService.addMessage(tradeId, {
      id: savedMessage.id,
      senderId: userId,
      receiverId: otherUserId,
      content: savedMessage.content,
      type: savedMessage.type,
      metadata: savedMessage.metadata,
      createdAt: savedMessage.createdAt,
    });

    // Send push notification to the other party

    await this.sendMessageNotification(otherUserId, savedMessage, trade);

    return savedMessage;
  }
  async createNegotiationMessage(
    negotiationId: number,
    otherUserId: number,
    userId: number,
    createMessageDto: CreateMessageDto,
  ): Promise<P2PChatMessage> {
    // Get negotiation and verify access
    const negotiation = await this.getNegotiation(negotiationId, userId);

    // Create message in database
    const message = this.messageRepository.create({
      negotiationId,
      senderId: userId,
      receiverId: otherUserId,
      content: createMessageDto.content,
      type: createMessageDto.type || MessageType.USER,
      metadata: createMessageDto.metadata,
      isRead: false,
    });

    const savedMessage = await this.messageRepository.save(message);

    // Add message to Firebase for real-time updates
    await this.firebaseService.addNegotiationMessage(negotiationId, {
      id: savedMessage.id,
      senderId: userId,
      receiverId: otherUserId,
      content: savedMessage.content,
      type: savedMessage.type,
      metadata: savedMessage.metadata,
      createdAt: savedMessage.createdAt,
    });

    // Send push notification to the other party
    await this.sendNegotiationMessageNotification(
      otherUserId,
      savedMessage,
      negotiation,
    );

    return savedMessage;
  }

  async uploadTradeFile(
    tradeId: number,
    file: Express.Multer.File,
    fileType: 'image' | 'document',
    fileMetadata: string,
    userId: number,
  ): Promise<any> {
    try {
      // Validate file type matches declared type
      const isImage = file.mimetype.startsWith('image/');
      if (fileType === 'image' && !isImage) {
        throw new BadRequestException('File is not an image');
      }
      if (fileType === 'document' && isImage) {
        throw new BadRequestException('File is not a document');
      }

      // Parse existing metadata and enhance it
      let metadata: Record<string, any>;
      try {
        metadata = JSON.parse(fileMetadata);
      } catch (error) {
        metadata = {};
      }

      // Add trade-specific metadata
      const enhancedMetadata = {
        ...metadata,
        tradeId: tradeId,
        fileType: fileType,
        originalName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedFor: 'trade_evidence',
        uploadedAt: new Date().toISOString(),
      };

      // Use the FileStoreService to upload
      const uploadResult = await this.fileStoreService.uploadFile(
        {
          file: file,
          fileMetadata: JSON.stringify(enhancedMetadata),
        },
        userId,
      );

      // Get trade to determine the other user
      const trade = await this.getTrade(tradeId, userId);
      const otherUserId =
        trade.buyerId === userId ? trade.sellerId : trade.buyerId;

      // Create a message with the file URL in the chat
      const messageContent =
        fileType === 'image'
          ? `📷 Image: ${file.originalname}`
          : `📄 Document: ${file.originalname}`;

      const messageMetadata = {
        fileId: uploadResult.id,
        fileUrl: uploadResult.fileUrl, // This is the URL that will be in the message
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        fileType: fileType,
        uploadedAt: uploadResult.uploadDate,
      };

      //  the database with the file URL
      const message = await this.createMessage(otherUserId, tradeId, userId, {
        content: messageContent,
        type: fileType === 'image' ? MessageType.IMAGE : MessageType.DOCUMENT,
        metadata: messageMetadata,
      });

      // Log the upload for the trade
      this.logger.log(
        `User ${userId} uploaded ${fileType} for trade ${tradeId}: ${file.originalname}`,
      );

      // Create a system message about the file upload (optional)
      // await this.createSystemMessage(
      //   tradeId,
      //   `A ${fileType} has been uploaded: ${file.originalname}`,
      //   {
      //     fileId: uploadResult.id,
      //     fileUrl: uploadResult.fileUrl,
      //     fileType: fileType,
      //     fileName: file.originalname,
      //   },
      // );

      return uploadResult;
    } catch (error) {
      this.logger.error(`File upload failed: ${error.message}`, error.stack);
      throw error;
    }
  }
  async createSystemMessage(
    tradeId: number,
    content: string,
    metadata?: Record<string, any>,
  ): Promise<P2PChatMessage> {
    // Get trade to ensure it exists
    const trade = await this.tradeRepository.findOne({
      where: { id: tradeId },
    });

    if (!trade) {
      throw new NotFoundException(`Trade with ID ${tradeId} not found`);
    }

    // Create system message
    const message = this.messageRepository.create({
      tradeId,
      senderId: null, // System message has no sender
      content,
      type: MessageType.SYSTEM,
      metadata,
      isRead: false,
    });

    const savedMessage = await this.messageRepository.save(message);

    // Add to Firebase
    await this.firebaseService.addMessage(tradeId, {
      id: savedMessage.id,
      content: savedMessage.content,
      type: savedMessage.type,
      metadata: savedMessage.metadata,
      createdAt: savedMessage.createdAt,
    });

    // Notify both parties (this is a system message, so both should be notified)
    // await this.sendSystemMessageNotification(trade.userId, savedMessage, trade);
    await this.sendSystemMessageNotification(
      trade.sellerId,
      savedMessage,
      trade,
    );

    return savedMessage;
  }

  async updateTradeStatus(
    tradeId: number,
    userId: number,
    updateStatusDto: UpdateTradeStatusDto,
  ): Promise<P2PTrade> {
    // Get trade and verify access
    const trade = await this.getTrade(tradeId, userId);

    // Check permissions based on role and requested status
    this.validateStatusChange(trade, userId, updateStatusDto.status);

    // Update trade status
    trade.status = updateStatusDto.status;

    // Set timestamps based on status
    if (updateStatusDto.status === TradeStatus.PAYMENT_SENT) {
      trade.paymentSentAt = new Date();
    } else if (updateStatusDto.status === TradeStatus.COMPLETED) {
      trade.paymentConfirmedAt = new Date();
    }

    const updatedTrade = await this.tradeRepository.save(trade);

    // Update status in Firebase
    await this.firebaseService.updateTradeStatus(
      tradeId,
      updateStatusDto.status,
    );

    // Create a system message for the status change
    // const statusMessage = this.getStatusChangeMessage(
    //   updateStatusDto.status,
    //   // userId === trade.userId,
    // );
    // await this.createSystemMessage(
    //   tradeId,
    //   statusMessage,
    //   updateStatusDto.metadata,
    // );

    return updatedTrade;
  }

  async markMessageAsRead(
    tradeId: number,
    messageId: number,
    userId: number,
  ): Promise<void> {
    // Verify user has access to this trade
    await this.getTrade(tradeId, userId);

    // Find the message
    const message = await this.messageRepository.findOne({
      where: { id: messageId, tradeId },
    });

    if (!message) {
      throw new NotFoundException(`Message with ID ${messageId} not found`);
    }

    // Update message if not already read
    if (!message.isRead) {
      message.isRead = true;
      await this.messageRepository.save(message);

      // Update in Firebase
      await this.firebaseService.markMessageAsRead(tradeId, messageId, userId);
    }
  }

  async markAllMessagesAsRead(tradeId: number, userId: number): Promise<void> {
    // Verify user has access to this trade
    await this.getTrade(tradeId, userId);

    // Update all unread messages for this trade
    await this.messageRepository.update(
      {
        tradeId,
        isRead: false,
        // Don't mark own messages as read
        // No perfect way to do this in a single query, but this works as an approximation
        senderId: userId === null ? null : Not(userId),
      },
      { isRead: true },
    );

    // The ideal would be to update Firebase as well, but that would require
    // fetching all messages first and updating them individually
  }

  // Helper methods
  private validateStatusChange(
    trade: P2PTrade,
    userId: number,
    newStatus: TradeStatus,
  ): void {
    // Verify status transition is valid
    const validTransitions = this.getValidStatusTransitions(trade.status);
    if (!validTransitions.includes(newStatus)) {
      throw new ForbiddenException(
        `Cannot change status from ${trade.status} to ${newStatus}`,
      );
    }

    // Check if user has permission for this status change
    // if (newStatus === TradeStatus.PAYMENT_SENT && trade.userId !== userId) {
    //   throw new ForbiddenException('Only the buyer can mark payment as sent');
    // }

    if (newStatus === TradeStatus.COMPLETED && trade.sellerId !== userId) {
      throw new ForbiddenException('Only the seller can complete the trade');
    }

    // Either party can cancel or dispute a trade
    // if (
    //   (newStatus === TradeStatus.CANCELLED ||
    //     newStatus === TradeStatus.DISPUTED) &&
    //   trade.buyer !== userId &&
    //   trade.sellerId !== userId
    // ) {
    //   throw new ForbiddenException(
    //     'You do not have permission to change the trade status',
    //   );
    // }
  }

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

  private getStatusChangeMessage(
    status: TradeStatus,
    isBuyer: boolean,
  ): string {
    const actor = isBuyer ? 'Buyer' : 'Seller';

    switch (status) {
      case TradeStatus.PAYMENT_SENT:
        return `${actor} has marked payment as sent. Seller, please confirm once received.`;
      case TradeStatus.COMPLETED:
        return 'Trade completed successfully. Funds have been released to the buyer.';
      case TradeStatus.CANCELLED:
        return `${actor} has cancelled this trade.`;
      case TradeStatus.DISPUTED:
        return `${actor} has raised a dispute for this trade. Support will contact you.`;
      default:
        return `Trade status updated to ${status}.`;
    }
  }

  // Mark negotiation message as read
  async markNegotiationMessageAsRead(
    negotiationId: number,
    messageId: number,
    userId: number,
  ): Promise<void> {
    // Verify user has access to this negotiation
    await this.getNegotiation(negotiationId, userId);

    const message = await this.messageRepository.findOne({
      where: { id: messageId, negotiationId },
    });

    if (!message) {
      throw new NotFoundException(`Message with ID ${messageId} not found`);
    }

    if (!message.isRead) {
      message.isRead = true;
      await this.messageRepository.save(message);

      // Update in Firebase
      await this.firebaseService.markNegotiationMessageAsRead(
        negotiationId,
        messageId,
        userId,
      );
    }
  }

  // Mark all negotiation messages as read
  async markAllNegotiationMessagesAsRead(
    negotiationId: number,
    userId: number,
  ): Promise<void> {
    await this.getNegotiation(negotiationId, userId);

    await this.messageRepository.update(
      {
        negotiationId,
        isRead: false,
        senderId: Not(userId), // Don't mark own messages as read
      },
      { isRead: true },
    );
  }

  async getNegotiationMessages(
    negotiationId: number,
    userId: number,
    paginationQuery: PaginationQueryDto,
  ): Promise<{ messages: P2PChatMessage[]; total: number }> {
    // Verify user has access to this negotiation
    await this.getNegotiation(negotiationId, userId);

    const { limit = 20, page = 1 } = paginationQuery;
    const skip = (page - 1) * limit;

    const [messages, total] = await this.messageRepository.findAndCount({
      where: { negotiationId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip,
      relations: ['sender', 'receiver'],
      select: {
        id: true,
        negotiationId: true,
        senderId: true,
        receiverId: true,
        content: true,
        type: true,
        // metadata: true,
        isRead: true,
        createdAt: true,
        updatedAt: true,
        sender: {
          id: true,
          firstName: true,
          lastName: true,
          profilePictureUrl: true,
        },
        receiver: {
          id: true,
          firstName: true,
          lastName: true,
          profilePictureUrl: true,
        },
      },
    });

    // Return messages in chronological order for the client
    return {
      messages: messages.reverse(),
      total,
    };
  }

  // Helper method to get and verify negotiation access
  async getNegotiation(
    negotiationId: number,
    userId: number,
  ): Promise<Negotiation> {
    // In getNegotiationMessages
    const negotiation = await this.negotiationService.getNegotiationById(
      negotiationId,
      userId,
    );

    if (!negotiation) {
      throw new NotFoundException(
        `Negotiation with ID ${negotiationId} not found`,
      );
    }

    // Check if user is a participant
    if (negotiation.buyerId !== userId && negotiation.sellerId !== userId) {
      throw new ForbiddenException(
        'You do not have access to this negotiation',
      );
    }

    return negotiation;
  }

  // Notification method for negotiation messages
  private async sendNegotiationMessageNotification(
    userId: number,
    message: P2PChatMessage,
    negotiation: Negotiation,
  ): Promise<void> {
    try {
      const sender = await this.usersService.findUserById(message.senderId);
      const senderName = sender
        ? `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'User'
        : 'User';

      // Create notification in database
      await this.notificationService.create({
        userId: userId,
        type: NotificationType.P2P_NEGOTIATION_MESSAGE,
        title: 'New Negotiation Message',
        body: `${senderName}: ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`,
        data: {
          type: 'p2p_negotiation_chat',
          negotiationId: negotiation.id,
          messageId: message.id,
          sellOrderId: negotiation.sellOrderId,
        },
        action: `/negotiations/${negotiation.id}/chat`,
        category: 'negotiation',
        priority: 'medium',
        sendPush: true,
        senderId: message.senderId,
      });

      // Send push notification
      const user = await this.usersService.findUserById(userId);
      if (user?.fcmToken) {
        await this.firebaseService.sendPushNotification(user.fcmToken, {
          title: 'New Negotiation Message',
          body: `${senderName}: ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`,
          data: {
            type: 'p2p_negotiation_chat',
            negotiationId: negotiation.id.toString(),
            messageId: message.id.toString(),
            sellOrderId: negotiation.sellOrderId.toString(),
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to send negotiation message notification: ${error.message}`,
        error.stack,
      );
    }
  }
  private async sendMessageNotification(
    userId: number,
    message: P2PChatMessage,
    trade: P2PTrade,
  ): Promise<void> {
    try {
      // Get the sender's name
      const sender = await this.usersService.findUserById(message.senderId);
      const senderName = sender
        ? `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'User'
        : 'User';

      // Create notification in database
      await this.notificationService.createNotification({
        otherUserId: userId,
        title: 'New P2P Trade Message',
        body: `${senderName}: ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`,
        data: {
          type: 'p2p_chat',
          tradeId: trade.id,
          messageId: message.id,
        },
        action: `/p2p/trades/${trade.id}`,
      });

      // Send push notification
      const user = await this.usersService.findUserById(userId);
      if (user?.fcmToken) {
        await this.firebaseService.sendPushNotification(user.fcmToken, {
          title: 'New P2P Trade Message',
          body: `${senderName}: ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`,
          data: {
            type: 'p2p_chat',
            tradeId: trade.id,
            messageId: message.id,
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to send message notification: ${error.message}`,
        error.stack,
      );
      // Don't throw, as notification failure shouldn't break the flow
    }
  }

  private async sendSystemMessageNotification(
    userId: number,
    message: P2PChatMessage,
    trade: P2PTrade,
  ): Promise<void> {
    try {
      // Create notification in database
      await this.notificationService.createNotification({
        otherUserId: userId,
        title: 'P2P Trade Update',
        body: message.content,
        data: {
          type: 'p2p_chat_system',
          tradeId: trade.id,
          messageId: message.id,
        },
        action: `/p2p/trades/${trade.id}`,
      });

      // Send push notification
      const user = await this.usersService.findUserById(userId);
      if (user?.fcmToken) {
        await this.firebaseService.sendPushNotification(user.fcmToken, {
          title: 'P2P Trade Update',
          body: message.content,
          data: {
            type: 'p2p_chat_system',
            tradeId: trade.id,
            messageId: message.id,
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to send system message notification: ${error.message}`,
        error.stack,
      );
      // Don't throw, as notification failure shouldn't break the flow
    }
  }
}
