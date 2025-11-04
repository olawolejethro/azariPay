// src/notifications/notification.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Query,
  UseGuards,
  Request,
  ValidationPipe,
  DefaultValuePipe,
  ParseIntPipe,
  HttpStatus,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { NotificationService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsBoolean,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { NotificationStatus } from './entities/notification.entity';
import { messaging } from 'firebase-admin';
import {
  CreateBulkNotificationDto,
  CreateNotificationDto,
  NotificationType,
} from './dto/create-notification.dto/create-notification.dto';
import { BulkUpdateNotificationDto } from './dto/update-notification.dto/update-notification.dto';
// import { NotificationStatus } from './entities/notification.entity';

class TestNotificationDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsOptional()
  message?: string;
}
@ApiTags('notifications')
@Controller('api/v1/notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // @Post()
  // @UseGuards(JwtAuthGuard)
  // @ApiBearerAuth()
  // @ApiOperation({ summary: 'Create a notification and optionally send push' })
  // async createNotification(
  //   @Body(ValidationPipe) createNotificationDto: CreateNotificationDto,
  // ) {
  //   return this.notificationService.createNotification(createNotificationDto);
  // }

  /**
   * Create a single notification (most flexible)
   */
  @Post('create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a notification for a user' })
  @ApiResponse({
    status: 201,
    description: 'Notification created successfully',
    schema: {
      example: {
        success: true,
        data: {
          notification: {
            id: 123,
            userId: 456,
            title: 'P2P Trade request',
            body: 'You received a P2P request from John Doe',
            type: 'P2P_TRADE_REQUEST',
            status: 'UNREAD',
            createdAt: '2025-01-23T12:00:00.000Z',
          },
          pushSent: true,
        },
        message: 'Notification created and sent successfully',
      },
    },
  })
  async create(
    @Body(ValidationPipe) createNotificationDto: CreateNotificationDto,
    @Request() req,
  ) {
    try {
      // Optional: Check if sender has permission to send to this user
      const senderId = req.user.userId;

      const result = await this.notificationService.create({
        ...createNotificationDto,
        senderId, // Track who sent the notification
      });

      return {
        success: true,
        data: result,
        message: result.pushSent
          ? 'Notification created and sent successfully'
          : 'Notification created but push notification failed',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to create notification',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Helper endpoint to create P2P trade request notification
   */
  @Post('p2p-trade-request')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create P2P trade request notification' })
  async createP2PTradeNotification(
    @Body()
    body: {
      sellerId: number;
      buyerName: string;
      amount: number;
      currency: string;
      tradeId?: string;
    },
    @Request() req,
  ) {
    const senderId = req.user.userId;

    const result = await this.notificationService.create({
      userId: body.sellerId,
      type: NotificationType.P2P_TRADE_REQUEST,
      title: 'P2P Trade request',
      body: `You received a P2P request from ${body.buyerName}`,
      data: {
        tradeId: body.tradeId,
        amount: body.amount,
        currency: body.currency,
        buyerName: body.buyerName,
      },
      action: body.tradeId ? `/p2p/trades/${body.tradeId}` : '/p2p/trades',
      sendPush: true,
      category: 'trade',
      priority: 'high',
      senderId,
    });

    return {
      success: true,
      data: result,
      message: 'P2P trade notification sent',
    };
  }

  /**
   * Create notifications for multiple users (bulk)
   */
  @Post('create-bulk')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create notifications for multiple users' })
  async createBulkNotification(
    @Body(ValidationPipe) createBulkNotificationDto: CreateBulkNotificationDto,
    @Request() req,
  ) {
    try {
      const senderId = req.user.userId;

      const results = await this.notificationService.createBulkNotifications({
        ...createBulkNotificationDto,
        senderId,
      });

      return {
        success: true,
        data: {
          totalSent: results.length,
          successful: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
          results,
        },
        message: 'Bulk notifications processed',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to create bulk notifications',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  //   @Get()
  //   @UseGuards(JwtAuthGuard)
  //   @ApiBearerAuth()
  //   @ApiOperation({ summary: 'Get user notifications' })
  //   @ApiQuery({ name: 'status', enum: NotificationStatus, required: false })
  //   @ApiQuery({ name: 'limit', type: Number, required: false })
  //   @ApiQuery({ name: 'page', type: Number, required: false })
  //   async getUserNotifications(
  //     @Request() req,
  //     @Query('status') status?: NotificationStatus,
  //     @Query('limit', new Transform(({ value }) => parseInt(value)))
  //     limit?: number,
  //     @Query('page', new Transform(({ value }) => parseInt(value))) page?: number,
  //   ) {
  //     return this.notificationService.getUserNotifications(req.user.id, {
  //       status,
  //       limit,
  //       page,
  //     });
  //   }

  /**
   * Mark a single notification as read
   */
  @Put(':id/mark-read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as read successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 123,
          status: 'READ',
          readAt: '2025-01-23T12:00:00.000Z',
        },
        message: 'Notification marked as read',
      },
    },
  })
  async markAsRead(@Param('id', ParseIntPipe) id: number, @Request() req) {
    try {
      const userId = req.user.userId;

      const result = await this.notificationService.markAsRead(id, userId);

      if (!result) {
        throw new NotFoundException(
          'Notification not found or does not belong to user',
        );
      }

      return {
        success: true,
        data: {
          id: result.id,
          status: result.status,
          readAt: result.updatedAt,
        },
        message: 'Notification marked as read',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to mark notification as read',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Mark a single notification as unread
   */
  @Put(':id/mark-unread')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark notification as unread' })
  @ApiParam({ name: 'id', description: 'Notification ID', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as unread successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 123,
          status: 'UNREAD',
          updatedAt: '2025-01-23T12:00:00.000Z',
        },
        message: 'Notification marked as unread',
      },
    },
  })
  async markAsUnread(@Param('id', ParseIntPipe) id: number, @Request() req) {
    try {
      const userId = req.user.userId;

      const result = await this.notificationService.markAsUnread(id, userId);

      if (!result) {
        throw new NotFoundException(
          'Notification not found or does not belong to user',
        );
      }

      return {
        success: true,
        data: {
          id: result.id,
          status: result.status,
          updatedAt: result.updatedAt,
        },
        message: 'Notification marked as unread',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to mark notification as unread',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Mark all notifications as read for current user
   */
  @Put('mark-all-read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as read successfully',
    schema: {
      example: {
        success: true,
        data: {
          updatedCount: 15,
        },
        message: 'All notifications marked as read',
      },
    },
  })
  async markAllAsRead(@Request() req) {
    try {
      const userId = req.user.userId;

      const updatedCount = await this.notificationService.markAllAsRead(userId);

      return {
        success: true,
        data: {
          updatedCount,
        },
        message: `${updatedCount} notifications marked as read`,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to mark all notifications as read',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Mark multiple notifications as read (bulk)
   */
  @Put('mark-bulk-read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark multiple notifications as read' })
  @ApiResponse({
    status: 200,
    description: 'Multiple notifications marked as read successfully',
  })
  async markBulkAsRead(
    @Body(ValidationPipe) bulkUpdateDto: BulkUpdateNotificationDto,
    @Request() req,
  ) {
    try {
      const userId = req.user.userId;

      const results = await this.notificationService.markBulkAsRead(
        bulkUpdateDto.notificationIds,
        userId,
      );

      return {
        success: true,
        data: {
          totalRequested: bulkUpdateDto.notificationIds.length,
          successful: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
          results,
        },
        message: 'Bulk read operation completed',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to mark notifications as read',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Delete a single notification
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete notification' })
  @ApiParam({ name: 'id', description: 'Notification ID', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Notification deleted successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 123,
          deleted: true,
        },
        message: 'Notification deleted successfully',
      },
    },
  })
  async deleteNotification(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ) {
    try {
      const userId = req.user.userId;

      const success = await this.notificationService.deleteNotification(
        id,
        userId,
      );

      if (!success) {
        throw new NotFoundException(
          'Notification not found or does not belong to user',
        );
      }

      return {
        success: true,
        data: {
          id,
          deleted: true,
        },
        message: 'Notification deleted successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to delete notification',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Delete multiple notifications (bulk)
   */
  @Delete('bulk-delete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete multiple notifications' })
  @ApiResponse({
    status: 200,
    description: 'Multiple notifications deleted successfully',
  })
  async deleteBulkNotifications(
    @Body(ValidationPipe) bulkUpdateDto: BulkUpdateNotificationDto,
    @Request() req,
  ) {
    try {
      const userId = req.user.userId;

      const results = await this.notificationService.deleteBulkNotifications(
        bulkUpdateDto.notificationIds,
        userId,
      );

      return {
        success: true,
        data: {
          totalRequested: bulkUpdateDto.notificationIds.length,
          successful: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
          results,
        },
        message: 'Bulk delete operation completed',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to delete notifications',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Delete all read notifications for current user
   */
  @Delete('clear-read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete all read notifications' })
  @ApiResponse({
    status: 200,
    description: 'All read notifications deleted successfully',
  })
  async clearReadNotifications(@Request() req) {
    try {
      const userId = req.user.userId;

      const deletedCount =
        await this.notificationService.clearReadNotifications(userId);

      return {
        success: true,
        data: {
          deletedCount,
        },
        message: `${deletedCount} read notifications cleared`,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to clear read notifications',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('test')
  // @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a test notification' })
  async sendTestNotification(
    @Body(ValidationPipe) testNotificationDto: TestNotificationDto,
  ) {
    console.log('testNotificationDto', testNotificationDto);
    const message = 'Test notification';
    const token =
      'eptqjMD2Q-GM3dLV3Oh_cM:APA91bEdvTR5LnOb9LZh6Ukg8ko4EmBQaMjQf35cmsqpHorGSs0YP57_T4e9NKz_sQDm5MHMpiKQxa4GJCTyMYTjqQf1bEG5SBBueXY2ldsJoTT7YukApgI';
    return this.notificationService.sendTestNotification(token, message);
  }

  /**
   * Retrieve paginated notifications for the authenticated user
   */
  //   @Get()
  //   @ApiOperation({ summary: "Get current user's notifications" })
  //   @ApiQuery({
  //     name: 'status',
  //     enum: NotificationStatus,
  //     required: false,
  //     description: 'Filter by notification status',
  //   })
  //   @ApiQuery({
  //     name: 'limit',
  //     type: Number,
  //     required: false,
  //     description: 'Number of notifications to return (default: 20, max: 100)',
  //   })
  //   @ApiQuery({
  //     name: 'page',
  //     type: Number,
  //     required: false,
  //     description: 'Page number (default: 1)',
  //   })
  //   async getUserNotifications(
  //     @Request() req,
  //     @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  //     @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  //     @Query('status') status?: NotificationStatus,

  //   ) {
  //     try {
  //       // Get user ID from JWT token
  //       const userId = req.user.userId;

  //       // Get notifications using service
  //       const result = await this.notificationService.getUserNotifications(
  //         userId,
  //         { status, limit, page },
  //       );

  //       return {
  //         success: true,
  //         data: {
  //           notifications: result.notifications,
  //           total: result.total,
  //           unreadCount: result.unreadCount,
  //           pagination: result.pagination,
  //         },
  //       };
  //     } catch (error) {
  //       throw new HttpException(
  //         {
  //           success: false,
  //           message: 'Failed to fetch notifications',
  //           error: error.message,
  //         },
  //         HttpStatus.INTERNAL_SERVER_ERROR,
  //       );
  //     }
  //   }

  /**
   * Retrieve a specific notification by ID
   */
  @Get('userNotification')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get user notifications, filterable by status and currency',
  })
  @ApiParam({ name: 'status', required: false, enum: NotificationStatus })
  @ApiParam({
    name: 'currency',
    required: false,
    type: String,
    description: 'Currency of the notification',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Notification not found',
  })
  async getNotificationById(
    @Request() req,
    @Query('status') status?: NotificationStatus,
    @Query('currency') currency?: string,
  ) {
    const userId = req.user.userId;

    const notifications = await this.notificationService.getNotificationById(
      userId,
      status,
      currency,
    );

    return {
      success: true,
      data: notifications, // Even if empty, it will be an empty array, not a 404 error
    };
  }

  /**
   * Get count of unread notifications
   */
  //   @Get('unread/count')
  //   @ApiOperation({ summary: 'Get unread notification count' })
  //   @ApiResponse({
  //     status: HttpStatus.OK,
  //     description: 'Returns the count of unread notifications',
  //   })
  //   async getUnreadCount(@Request() req) {
  //     try {
  //       const userId = req.user.id;

  //       const unreadCount =
  //         await this.notificationService.getUnreadNotificationCount(userId);

  //       return {
  //         success: true,
  //         data: { unreadCount },
  //       };
  //     } catch (error) {
  //       throw new HttpException(
  //         {
  //           success: false,
  //           message: 'Failed to fetch unread notification count',
  //           error: error.message,
  //         },
  //         HttpStatus.INTERNAL_SERVER_ERROR,
  //       );
  //     }
  //   }
}
