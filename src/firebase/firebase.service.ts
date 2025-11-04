import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import {
  TradeStatus,
  MessageType,
} from '../p2p-chat/entities/p2p-chat.entity/p2p-chat.entity';
import { LoggerService } from 'src/common/logger/logger.service';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

export interface NotificationTarget {
  type: 'token' | 'topic' | 'condition';
  value: string;
}

@Injectable()
export class FirebaseService {
  private firebaseApp: admin.app.App;
  private db: admin.database.Database;

  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
  ) {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    try {
      if (!admin.apps.length) {
        const serviceAccount = {
          projectId: this.configService.get<string>('FIREBASE_PROJECT_ID'),
          clientEmail: this.configService.get<string>('FIREBASE_CLIENT_EMAIL'),
          privateKey: this.configService
            .get<string>('FIREBASE_PRIVATE_KEY')
            .replace(/\\n/g, '\n'),
        };
        // console.log(this.configService.get<string>('FIREBASE_PRIVATE_KEY'));
        // console.log(this.configService.get<string>('FIREBASE_CLIENT_EMAIL'));
        // console.log(this.configService.get<string>('FIREBASE_PROJECT_ID'));
        // console.log(this.configService.get<string>('FIREBASE_DATABASE_URL'));
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(
            serviceAccount as admin.ServiceAccount,
          ),
          databaseURL: this.configService.get<string>('FIREBASE_DATABASE_URL'),
        });

        console.log('Firebase initialized successfully');
      } else {
        this.firebaseApp = admin.app();
      }

      this.db = this.firebaseApp.database();
    } catch (error) {
      console.log(error, 'error');
      this.logger.error(
        `Failed to initialize Firebase: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // --- General Notification Methods ---

  public async notifyByPush(payload: {
    notification: {
      title: string;
      body: string;
      imageUrl?: string;
    };
    data?: Record<string, string>;
    token: string;
  }): Promise<{
    status: boolean;
    message: string;
    data: any;
  }> {
    try {
      this.logger.log(`Sending push notification to token: ${payload.token}`);
      const validatedData = {};
      if (payload.data) {
        Object.entries(payload.data).forEach(([key, value]) => {
          validatedData[key] = String(value); // FCM requires values to be strings
        });
      }

      const fcmPayload = {
        notification: payload.notification,
        data: validatedData,
        token: payload.token,
      };

      const firebaseResponse = await this.firebaseApp
        .messaging()
        .send(fcmPayload);
      return {
        status: true,
        message: 'Success',
        data: firebaseResponse,
      };
    } catch (error: any) {
      return {
        status: false,
        message: error.message,
        data: error.message,
      };
    }
  }

  async createCustomToken(uid: string, claims?: object): Promise<string> {
    try {
      return await this.firebaseApp.auth().createCustomToken(uid, claims);
    } catch (error) {
      this.logger.error(
        `Failed to create custom token: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
  public async sendTestNotification(
    token: string,
    message: string = 'Test notification',
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.notifyByPush({
      notification: {
        title: 'Test Notification',
        body: message,
      },
      data: {
        type: 'test',
        timestamp: new Date().toISOString(),
      },
      token,
    });

    return {
      success: result.status,
      message: result.status
        ? 'Test notification sent successfully'
        : result.message,
    };
  }

  // --- Firebase Chat Methods ---

  public async createChatRoom(trade: {
    id: number;
    buyerId: number;
    sellerId: number;
    amount: number;
    currency: string;
    convertedAmount: number;
    convertedCurrency: string;
    rate: number;
    paymentMethod: string;
    status: TradeStatus;
    paymentTimeLimit?: number;
  }): Promise<void> {
    try {
      const chatRef = this.db.ref(`p2pTrades/${trade.id}`);

      await chatRef.set({
        tradeId: trade.id,
        participants: {
          buyer: trade.buyerId.toString(),
          seller: trade.sellerId.toString(),
        },
        tradeDetails: {
          amount: trade.amount,
          currency: trade.currency,
          convertedAmount: trade.convertedAmount,
          convertedCurrency: trade.convertedCurrency,
          rate: trade.rate,
          paymentMethod: trade.paymentMethod,
          status: trade.status,
          paymentTimeLimit: trade.paymentTimeLimit || 1440, // Default 24 hours
        },
        createdAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });
    } catch (error) {
      // this.logger.error(
      //   `Failed to create chat room: ${error.message}`,
      //   error.stack,
      // );
      throw error;
    }
  }

  // In firebase.service.ts - Update the addMessage method

  public async addMessage(
    tradeId: number,
    message: {
      id: number;
      senderId?: number;
      receiverId?: number;
      content: string;
      type: MessageType;
      metadata?: Record<string, any>;
      createdAt: Date;
    },
  ): Promise<void> {
    try {
      const messageRef = this.db.ref(
        `p2pTrades/${tradeId}/messages/${message.id}`,
      );

      // Clean the data to remove undefined values
      const messageData: any = {
        id: message.id,
        senderId: message.senderId?.toString() || 'SYSTEM',
        content: message.content,
        type: message.type,
        timestamp: message.createdAt.getTime(),
        isRead: false,
      };

      // Only add metadata if it exists and has values
      if (message.metadata && Object.keys(message.metadata).length > 0) {
        // Filter out undefined values from metadata
        messageData.metadata = Object.fromEntries(
          Object.entries(message.metadata).filter(([_, v]) => v !== undefined),
        );
      }

      await messageRef.set(messageData);

      // Update trade's lastMessage fields
      await this.db.ref(`p2pTrades/${tradeId}`).update({
        lastMessage: message.content,
        lastMessageTime: message.createdAt.getTime(),
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });

      console.log(`Message ${message.id} added to trade ${tradeId}`);
    } catch (error) {
      console.log(error, 'error');
      this.logger.error(`Failed to add message: ${error.message}`, error.stack);
      throw error;
    }
  }

  public async updateTradeStatus(
    tradeId: number,
    status: TradeStatus,
  ): Promise<void> {
    try {
      await this.db.ref(`p2pTrades/${tradeId}/tradeDetails`).update({ status });
      await this.db.ref(`p2pTrades/${tradeId}`).update({
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });

      this.logger.log(`Updated trade ${tradeId} status to ${status}`);
    } catch (error) {
      this.logger.error(
        `Failed to update trade status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  public async sendPushNotification(
    token: string,
    notification: {
      title: string;
      body: string;
      data?: Record<string, any>;
    },
  ): Promise<void> {
    try {
      console.log('Sending push notification:', notification);
      await this.firebaseApp.messaging().send({
        token: token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data
          ? this.convertToStringValues(notification.data)
          : undefined,
      });
    } catch (error) {
      // this.logger.error(
      //   `Failed to send push notification: ${error.message}`,
      //   error.stack,
      // );
    }
  }

  async markMessageAsRead(
    tradeId: number,
    messageId: number,
    userId: number,
  ): Promise<void> {
    try {
      await this.db.ref(`p2pTrades/${tradeId}/messages/${messageId}`).update({
        isRead: true,
        [`readBy/${userId}`]: admin.database.ServerValue.TIMESTAMP,
      });

      this.logger.log(`Message ${messageId} marked as read by user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to mark message as read: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // Add these methods to your existing FirebaseService class

  public async createNegotiationChatRoom(negotiation: {
    negotiationId: number;
    buyerId: number;
    sellerId: number;
    sellOrderId: number;
    originalRate: number;
    status: string;
  }): Promise<void> {
    try {
      const chatRef = this.db.ref(
        `p2pNegotiations/${negotiation.negotiationId}`,
      );

      await chatRef.set({
        negotiationId: negotiation.negotiationId,
        participants: {
          buyer: negotiation.buyerId.toString(),
          seller: negotiation.sellerId.toString(),
        },
        negotiationDetails: {
          sellOrderId: negotiation.sellOrderId,
          originalRate: negotiation.originalRate,
          currentRate: negotiation.originalRate,
          status: negotiation.status,
        },
        createdAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });

      this.logger.log(
        `Created negotiation chat room for negotiation ${negotiation.negotiationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create negotiation chat room: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  public async addNegotiationMessage(
    negotiationId: number,
    message: {
      id: number;
      senderId?: number;
      receiverId?: number;
      content: string;
      type: MessageType;
      metadata?: Record<string, any>;
      createdAt: Date;
    },
  ): Promise<void> {
    try {
      const messageRef = this.db.ref(
        `p2pNegotiations/${negotiationId}/messages/${message.id}`,
      );

      const messageData: any = {
        id: message.id,
        senderId: message.senderId?.toString() || 'SYSTEM',
        receiverId: message.receiverId?.toString() || null,
        content: message.content,
        type: message.type,
        timestamp: message.createdAt.getTime(),
        isRead: false,
      };

      if (message.metadata && Object.keys(message.metadata).length > 0) {
        messageData.metadata = Object.fromEntries(
          Object.entries(message.metadata).filter(([_, v]) => v !== undefined),
        );
      }

      await messageRef.set(messageData);

      // Update negotiation's lastMessage fields
      await this.db.ref(`p2pNegotiations/${negotiationId}`).update({
        lastMessage: message.content,
        lastMessageTime: message.createdAt.getTime(),
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });

      this.logger.log(
        `Message ${message.id} added to negotiation ${negotiationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add negotiation message: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  public async updateNegotiationStatus(
    negotiationId: number,
    status: string,
    currentRate?: number,
  ): Promise<void> {
    try {
      const updateData: any = { status };

      if (currentRate !== undefined) {
        updateData.currentRate = currentRate;
      }

      await this.db
        .ref(`p2pNegotiations/${negotiationId}/negotiationDetails`)
        .update(updateData);
      await this.db.ref(`p2pNegotiations/${negotiationId}`).update({
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });

      this.logger.log(
        `Updated negotiation ${negotiationId} status to ${status}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update negotiation status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  public async markNegotiationMessageAsRead(
    negotiationId: number,
    messageId: number,
    userId: number,
  ): Promise<void> {
    try {
      await this.db
        .ref(`p2pNegotiations/${negotiationId}/messages/${messageId}`)
        .update({
          isRead: true,
          [`readBy/${userId}`]: admin.database.ServerValue.TIMESTAMP,
        });

      this.logger.log(
        `Negotiation message ${messageId} marked as read by user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to mark negotiation message as read: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // Method to migrate negotiation chat to trade chat when trade is created
  public async linkNegotiationToTrade(
    negotiationId: number,
    tradeId: number,
  ): Promise<void> {
    try {
      // Add trade reference to negotiation chat
      await this.db.ref(`p2pNegotiations/${negotiationId}`).update({
        linkedTradeId: tradeId,
        linkedAt: admin.database.ServerValue.TIMESTAMP,
      });

      // Add negotiation reference to trade chat
      await this.db.ref(`p2pTrades/${tradeId}`).update({
        linkedNegotiationId: negotiationId,
        negotiationHistory: true,
      });

      this.logger.log(
        `Linked negotiation ${negotiationId} to trade ${tradeId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to link negotiation to trade: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
  // Helper method to convert all object values to strings (FCM requirement)
  private convertToStringValues(
    obj: Record<string, any>,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return result;
  }

  // src/firebase/firebase.service.ts
  // Add this method to your existing FirebaseService

  /**
   * Send a data-only notification that will not display in the notification drawer
   * but can be processed by the app if it's running
   *
   * @param token - FCM token of the recipient device
   * @param data - Data payload to send (will be converted to strings)
   * @returns Promise that resolves when notification is sent
   */
  public async sendDataNotification(
    token: string,
    data: Record<string, any>,
  ): Promise<void> {
    try {
      // Ensure all values are strings as FCM requires
      const stringifiedData = this.convertToStringValuess(data);

      // Create the message
      const message = {
        token,
        // No notification payload (this makes it a data-only message)
        data: stringifiedData,
        // For iOS, set content-available flag to process in the background
        apns: {
          headers: {
            'apns-priority': '5', // Use normal priority (5) instead of high (10)
          },
          payload: {
            aps: {
              'content-available': 1,
            },
          },
        },
        // For Android, use high priority to ensure immediate delivery
        // android: {
        //   priority: 'high',
        // },
      };

      console.log('Sending data notification:', data);

      // Send the message
      await this.firebaseApp.messaging().send(message);

      this.logger.log(`Data notification sent to token ${token}`);
    } catch (error) {
      this.logger.error(
        `Failed to send data notification: ${error.message}`,
        error.stack,
      );
      // Don't throw the error - we don't want notification failures to break the flow
    }
  }

  /**
   * Convert all object values to strings (required by FCM)
   * @param obj - Object with mixed value types
   * @returns Object with all values as strings
   */
  private convertToStringValuess(
    obj: Record<string, any>,
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        result[key] = '';
      } else if (typeof value === 'object') {
        result[key] = JSON.stringify(value);
      } else {
        result[key] = String(value);
      }
    }

    return result;
  }
}
