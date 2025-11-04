// pin.controller.ts
import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PinManagementService } from '../services/pin-management.service';
import {
  SetPinDto,
  ChangePinInitiateDto,
  ChangePinCompleteDto,
  ResetPinInitiateDto,
  ResetPinCompleteDto,
  VerifyOtpDto,
} from '../dto/pin.dto';
import { LoggerService } from 'src/common/logger/logger.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { OnboardingTrackingService } from 'src/auth/services/onboardingTrackingService';

@ApiTags('PIN Management')
@Controller('api/v1/users/pin')
export class PinManagementController {
  constructor(
    private readonly pinService: PinManagementService,
    private readonly onboardingTrackingService: OnboardingTrackingService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * ================================
   * Set Wallet PIN
   * ================================
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set initial wallet PIN' })
  @ApiResponse({
    status: 200,
    description: 'PIN set successfully.',
    schema: {
      example: {
        data: {},
        message: 'PIN set successfully.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'PIN already set.',
    schema: {
      example: {
        data: {},
        message: 'PIN already set. Use change PIN to update your PIN.',
        errors: {},
      },
    },
  })
  async setWalletPin(@Body() setPinDto: SetPinDto, @Request() req) {
    const userId = req.user.userId;

    this.logger.log(`Setting wallet PIN for user: ${userId}`);

    try {
      // Set the PIN through your existing PIN service
      const result = await this.pinService.setPin(setPinDto, userId);

      // If PIN was set successfully, update onboarding tracking
      // if (result && !result.errors) {
      //   this.logger.log(
      //     `PIN set successfully for user: ${userId}, updating onboarding state`,
      //   );

      // Update onboarding tracking to mark PIN as completed
      const onboardingState =
        await this.onboardingTrackingService.markPinCompleted(userId);
      if (onboardingState) {
        this.logger.log(
          `Onboarding state updated for user: ${userId}, current step:onBoardingCompleted: ${onboardingState.onboardingCompleted}`,
        );
      } else {
        this.logger.warn(`Could not find onboarding state for user: ${userId}`);
      }
      // }

      return result;
    } catch (error) {
      this.logger.error(`Error setting PIN for user: ${userId}`, error);
      throw error;
    }
  }

  /**
   * ================================
   * Change PIN - Initiate
   * ================================
   */
  @Post('change/initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate PIN change process' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully.',
    schema: {
      example: {
        data: {},
        message: 'An OTP has been sent to your phone number.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Phone number not found.',
    schema: {
      example: {
        data: {},
        message: 'Phone number not found.',
        errors: {
          phoneNumber: 'No account associated with this phone number.',
        },
      },
    },
  })
  async changePinInitiate(
    @Body() changePinInitiateDto: ChangePinInitiateDto,
    @Request() req,
  ) {
    const userId = req.user.userId;
    this.logger.log(`Initiating PIN change for user: ${userId}`);
    return await this.pinService.initiatePinChange(
      changePinInitiateDto,
      userId,
    );
  }

  /**
   * ================================
   * Change PIN - Complete
   * ================================
   */
  @Post('change/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Complete PIN change process' })
  @ApiResponse({
    status: 200,
    description: 'PIN changed successfully.',
    schema: {
      example: {
        data: {},
        message: 'PIN changed successfully.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid OTP.',
    schema: {
      example: {
        data: {},
        message: 'Invalid or expired OTP.',
        errors: {
          otp: 'The OTP provided is invalid or has expired.',
        },
      },
    },
  })
  async changePinComplete(
    @Body() changePinCompleteDto: ChangePinCompleteDto,
    @Request() req,
  ) {
    const userId = req.user.userId;
    this.logger.log(`Completing PIN change for user: ${userId}`);
    return await this.pinService.completePinChange(
      changePinCompleteDto,
      userId,
    );
  }

  /**
   * ================================
   * Reset PIN - Step 1: Initiate with current PIN
   * ================================
   */
  @Post('reset/initiate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Initiate PIN reset with current PIN verification' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully after PIN verification.',
    schema: {
      example: {
        data: {
          maskedPhoneNumber: '+234***6789',
        },
        message: 'An OTP has been sent to your mobile number.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid current PIN.',
    schema: {
      example: {
        data: {},
        message: 'Invalid current PIN.',
        errors: {
          currentPin: 'The current PIN provided is incorrect.',
        },
      },
    },
  })
  async resetPinInitiate(
    @Body() resetPinInitiateDto: ResetPinInitiateDto,
    @Request() req: any,
  ) {
    const userId = req.user.userId;
    this.logger.log(`Initiating PIN reset for user ID: ${userId}`);
    return await this.pinService.initiatePinReset(resetPinInitiateDto, userId);
  }

  /**
   * ================================
   * Reset PIN - Step 2: Verify OTP
   * ================================
   */
  @Post('reset/verify-otp')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Verify OTP for PIN reset' })
  @ApiResponse({
    status: 200,
    description: 'OTP verified successfully.',
    schema: {
      example: {
        data: {
          resetToken: 'reset_token_abc123',
        },
        message: 'OTP verified successfully. You can now set a new PIN.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired OTP.',
    schema: {
      example: {
        data: {},
        message: 'Invalid or expired OTP.',
        errors: {
          otp: 'The OTP provided is invalid or has expired.',
        },
      },
    },
  })
  async verifyResetOtp(
    @Body() verifyOtpDto: VerifyOtpDto,
    @Request() req: any,
  ) {
    const userId = req.user.userId;
    this.logger.log(`Verifying OTP for PIN reset - User ID: ${userId}`);
    return await this.pinService.verifyResetOtp(verifyOtpDto, userId);
  }

  /**
   * ================================
   * Reset PIN - Step 3: Complete with new PIN
   * ================================
   */
  @Post('reset/complete')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Complete PIN reset with new PIN' })
  @ApiResponse({
    status: 200,
    description: 'PIN reset successfully.',
    schema: {
      example: {
        data: {},
        message: 'Your transaction PIN has been successfully reset.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid reset token or PIN mismatch.',
    schema: {
      example: {
        data: {},
        message: 'PIN confirmation does not match.',
        errors: {
          confirmPin: 'The PIN confirmation does not match the new PIN.',
        },
      },
    },
  })
  async resetPinComplete(
    @Body() resetPinCompleteDto: ResetPinCompleteDto,
    @Request() req: any,
  ) {
    const userId = req.user.userId;
    this.logger.log(`Completing PIN reset for user ID: ${userId}`);
    return await this.pinService.completePinReset(resetPinCompleteDto, userId);
  }
}
