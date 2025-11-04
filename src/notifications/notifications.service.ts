// src/notifications/notification.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { AuthService } from '../auth/services/auth.service';
import {
  Notification,
  NotificationStatus,
} from './entities/notification.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { P2PSeller } from 'src/P2P/entities/p2p-seller.entity';
import { NotificationType } from './dto/create-notification.dto/create-notification.dto';
import { User } from 'src/auth/entities/user.entity';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(P2PSeller)
    private readonly sellerRepository: Repository<P2PSeller>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly firebaseService: FirebaseService,
    // private readonly usersService: AuthService,
  ) {}

  /**
   * Create notification in database and optionally send as push notification
   */
  async createNotification(params: {
    otherUserId: number;
    title: string;
    body: string;
    imageUrl?: string;
    data?: Record<string, any>;
    action?: string;
    sendPush?: boolean;
  }): Promise<{ notification: Notification; pushSent: boolean }> {
    try {
      // Create notification in database
      const notification = await this.notificationRepository.create({
        userId: params.otherUserId,
        title: params.title,
        body: params.body,
        imageUrl: params.imageUrl,
        data: params.data,
        action: params.action,
        isSent: false, // Will update if push is sent
      });

      let pushSent = false;

      // Send push notification if requested
      if (params.sendPush !== false) {
        const seller = await this.sellerRepository.findOne({
          where: { id: params.otherUserId },
        });
        // const user = await this.usersService.findUserById(params.sellerId);
        console.log(seller.user.fcmToken, 'seller.user.fcmToken');
        if (seller.user.fcmToken) {
          const result = await this.firebaseService.notifyByPush({
            notification: {
              title: params.title,
              body: params.body,
              imageUrl: params.imageUrl,
            },
            data: {
              notificationId: String(notification.id),
              ...(params.data ? this.stringifyDataValues(params.data) : {}),
              action: params.action || '',
            },
            token: seller.user.fcmToken,
          });

          pushSent = result.status;

          // Update notification with sent status
          if (pushSent) {
            notification.isSent = true;
            notification.sentAt = new Date();
            await this.notificationRepository.save(notification);
          }
        }
      }

      return { notification, pushSent };
    } catch (error) {
      // this.logger.error(`Error creating notification: ${error.message}`);
      // throw error;
    }
  }

  /**
   * Create a single notification (enhanced)
   */
  async create(params: {
    userId: number;
    type: NotificationType;
    title: string;
    body: string;
    imageUrl?: string;
    data?: Record<string, any>;
    action?: string;
    sendPush?: boolean;
    category?: string;
    priority?: string;
    senderId?: number;
    currency?: string;
  }): Promise<{ notification: Notification; pushSent: boolean }> {
    try {
      // Get user FCM token
      const user = await this.userRepository.findOne({
        where: { id: params.userId },
        select: ['id', 'fcmToken', 'fcmTokenPlatform'],
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${params.userId} not found`);
      }

      // Create notification in database
      const notification = this.notificationRepository.create({
        userId: params.userId,
        title: params.title,
        body: params.body,
        imageUrl: params.imageUrl,
        data: {
          ...params.data,
          type: params.type,
          category: params.category,
          priority: params.priority,
          senderId: params.senderId,
        },
        action: params.action,
        status: NotificationStatus.UNREAD,
        isSent: false,
      });

      const savedNotification =
        await this.notificationRepository.save(notification);

      let pushSent = false;

      // Send push notification if requested and user has FCM token
      if (params.sendPush !== false && user.fcmToken) {
        try {
          const result = await this.firebaseService.notifyByPush({
            notification: {
              title: params.title,
              body: params.body,
              imageUrl: params.imageUrl,
            },
            data: {
              notificationId: String(savedNotification.id),
              type: params.type,
              action: params.action || '',
              category: params.category || '',
              priority: params.priority || 'normal',
              ...(params.data ? this.stringifyDataValues(params.data) : {}),
            },
            token: user.fcmToken,
          });

          pushSent = result.status;

          if (pushSent) {
            savedNotification.isSent = true;
            savedNotification.sentAt = new Date();
            await this.notificationRepository.save(savedNotification);
          }
        } catch (pushError) {
          this.logger.error(
            `Failed to send push notification: ${pushError.message}`,
          );
        }
      }

      return { notification: savedNotification, pushSent };
    } catch (error) {
      this.logger.error(`Error creating notification: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create bulk notifications
   */
  async createBulkNotifications(params: {
    userIds: number[];
    type: NotificationType;
    title: string;
    body: string;
    imageUrl?: string;
    data?: Record<string, any>;
    action?: string;
    sendPush?: boolean;
    category?: string;
    priority?: string;
    senderId?: number;
  }): Promise<
    Array<{
      userId: number;
      success: boolean;
      notification?: Notification;
      error?: string;
    }>
  > {
    const results = [];

    for (const userId of params.userIds) {
      try {
        const result = await this.create({
          ...params,
          userId,
        });

        results.push({
          userId,
          success: true,
          notification: result.notification,
        });
      } catch (error) {
        results.push({
          userId,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Get a specific notification by ID
   *
   * @param id - The notification ID
   * @param markAsRead - Whether to mark as read when fetching
   * @returns The notification object
   */
  async getNotificationById(
    userId: number,
    status?: NotificationStatus,
    currency?: string,
  ): Promise<Notification[]> {
    try {
      const where: any = { userId };

      if (status) {
        where.status = status;
      }

      if (currency) {
        where.currency = currency;
      }

      const notifications = await this.notificationRepository.find({
        where,
        order: { createdAt: 'DESC' },
      });

      // Instead of throwing a NotFoundException, return an empty array if no notifications are found
      if (!notifications || notifications.length === 0) {
        return []; // Return an empty array when no notifications are found
      }

      return notifications;
    } catch (error) {
      this.logger.error(
        `Error getting notifications: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Send a test notification
   */
  async sendTestNotification(
    token: string,
    message: string = 'Test notification',
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.firebaseService.notifyByPush({
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

  /**
   * Helper to stringify all data values for FCM
   */
  private stringifyDataValues(
    data: Record<string, any>,
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(data)) {
      result[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }

    return result;
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(
    notificationId: number,
    userId: number,
  ): Promise<Notification | null> {
    try {
      const notification = await this.notificationRepository.findOne({
        where: { id: notificationId, userId },
      });

      if (!notification) {
        return null;
      }

      notification.status = NotificationStatus.READ;
      notification.updatedAt = new Date();

      return await this.notificationRepository.save(notification);
    } catch (error) {
      this.logger.error(`Error marking notification as read: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mark a single notification as unread
   */
  async markAsUnread(
    notificationId: number,
    userId: number,
  ): Promise<Notification | null> {
    try {
      const notification = await this.notificationRepository.findOne({
        where: { id: notificationId, userId },
      });

      if (!notification) {
        return null;
      }

      notification.status = NotificationStatus.UNREAD;
      notification.updatedAt = new Date();

      return await this.notificationRepository.save(notification);
    } catch (error) {
      this.logger.error(
        `Error marking notification as unread: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: number): Promise<number> {
    try {
      const result = await this.notificationRepository.update(
        {
          userId,
          status: NotificationStatus.UNREAD,
        },
        {
          status: NotificationStatus.READ,
          updatedAt: new Date(),
        },
      );

      return result.affected || 0;
    } catch (error) {
      this.logger.error(
        `Error marking all notifications as read: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Mark multiple notifications as read (bulk)
   */
  async markBulkAsRead(
    notificationIds: number[],
    userId: number,
  ): Promise<Array<{ id: number; success: boolean; error?: string }>> {
    const results = [];

    for (const id of notificationIds) {
      try {
        const result = await this.markAsRead(id, userId);
        results.push({
          id,
          success: !!result,
        });
      } catch (error) {
        results.push({
          id,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Delete a single notification
   */
  async deleteNotification(
    notificationId: number,
    userId: number,
  ): Promise<boolean> {
    try {
      const result = await this.notificationRepository.delete({
        id: notificationId,
        userId,
      });

      return (result.affected || 0) > 0;
    } catch (error) {
      this.logger.error(`Error deleting notification: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if user has unread notifications
   */
  async hasUnreadNotifications(userId: number): Promise<boolean> {
    try {
      const unreadCount = await this.notificationRepository.count({
        where: {
          userId,
          status: NotificationStatus.UNREAD,
        },
      });

      return unreadCount > 0;
    } catch (error) {
      this.logger.error(
        `Error checking unread notifications: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get count of unread notifications for user
   */
  async getUnreadNotificationCount(userId: number): Promise<number> {
    try {
      return await this.notificationRepository.count({
        where: {
          userId,
          status: NotificationStatus.UNREAD,
        },
      });
    } catch (error) {
      this.logger.error(
        `Error getting unread notification count: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get unread notifications summary (count + recent notifications)
   */
  async getUnreadNotificationsSummary(
    userId: number,
    limit: number = 5,
  ): Promise<{
    hasUnread: boolean;
    count: number;
    recentNotifications: Notification[];
  }> {
    try {
      const [count, recentNotifications] = await Promise.all([
        this.getUnreadNotificationCount(userId),
        this.notificationRepository.find({
          where: {
            userId,
            status: NotificationStatus.UNREAD,
          },
          order: { createdAt: 'DESC' },
          take: limit,
        }),
      ]);

      return {
        hasUnread: count > 0,
        count,
        recentNotifications,
      };
    } catch (error) {
      this.logger.error(
        `Error getting unread notifications summary: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Delete multiple notifications (bulk)
   */
  async deleteBulkNotifications(
    notificationIds: number[],
    userId: number,
  ): Promise<Array<{ id: number; success: boolean; error?: string }>> {
    const results = [];

    for (const id of notificationIds) {
      try {
        const success = await this.deleteNotification(id, userId);
        results.push({
          id,
          success,
        });
      } catch (error) {
        results.push({
          id,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Delete all read notifications for a user
   */
  async clearReadNotifications(userId: number): Promise<number> {
    try {
      const result = await this.notificationRepository.delete({
        userId,
        status: NotificationStatus.READ,
      });

      return result.affected || 0;
    } catch (error) {
      this.logger.error(`Error clearing read notifications: ${error.message}`);
      throw error;
    }
  }
}
