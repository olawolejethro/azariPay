// src/users/users.controller.ts
import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  Patch,
} from '@nestjs/common';
import { UpdateFcmTokenDto } from './dtos/fcm-token.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthService } from 'src/auth/services/auth.service';
import { FirebaseService } from './firebase.service';
import { SendPushNotificationDto } from './dtos/notification.dto';

// class SendPushNotificationDto {
//   token: string;
//   title: string;
//   message: string;
//   image?: string;
//   itemId: string;
//   type?: string;
//   info?: { [key: string]: any };
// }
@ApiTags('notifications')
@Controller('api/v1/notifications')
export class FirebaseController {
  constructor(
    private readonly authService: AuthService,
    private readonly fireBaseService: FirebaseService,
  ) {}

  @Post('send')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send push notification to a specific FCM token' })
  @ApiResponse({ status: 200, description: 'Notification sent successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async sendPushNotification(
    @Body(ValidationPipe) notificationDto: SendPushNotificationDto,
  ) {
    const result = await this.fireBaseService.notifyByPush({
      notification: notificationDto.notification,
      data: notificationDto.data,
      token: notificationDto.token,
    });

    return result;
  }
  @Patch('fcm-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add/Update FCM token for the current user' })
  @ApiResponse({
    status: 200,
    description: 'FCM token added/updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateFcmToken(
    @Request() req,
    @Body() updateFcmTokenDto: UpdateFcmTokenDto,
  ) {
    const user = await this.authService.updateFcmToken(
      req.user.userId,
      updateFcmTokenDto,
    );
    return {
      message: 'FCM token updated successfully',
      fcmToken: user.fcmToken,
      platform: user.fcmTokenPlatform,
      updatedAt: user.fcmTokenUpdatedAt,
    };
  }

  @Delete('fcm-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete FCM token for the current user' })
  @ApiResponse({ status: 200, description: 'FCM token deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteFcmToken(@Request() req) {
    await this.authService.deleteFcmToken(req.user.userId);
    return {
      message: 'FCM token deleted successfully',
    };
  }

  @Post('test')
  // @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a test notification to verify FCM setup' })
  async sendTestNotification(
    @Body() payload: { token: string; message?: string },
  ) {
    return this.fireBaseService.sendTestNotification(
      payload.token,
      payload.message,
    );
  }
}
