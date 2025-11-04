// src/auth/controllers/auth.controller.ts

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  Query,
  Get,
  NotFoundException,
  Param,
  Put,
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
  Delete,
} from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { SignupStartDto } from '../dto/signup-start.dto';
import { SignupVerifyOtpDto } from '../dto/signup-verify-otp.dto';
import { SignupBasicInfoDto } from '../dto/signup-basic-info.dto';
import { SignupPasswordDto } from '../dto/signup-password.dto';
import { SignupLivenessDto } from '../dto/signup-liveness.dto';
import { SignupIdentityDto } from '../dto/signup-identity.dto';
import { SigninDto } from '../dto/signin.dto';
import { PasswordResetInitiateOtpDto } from '../dto/password-reset-initiate-otp.dto';
import { PasswordResetVerifyOtpDto } from '../dto/password-reset-verify-otp.dto';
import { PasswordResetCompleteDto } from '../dto/password-reset-complete.dto';
import { BiometricEnrollDto } from '../dto/biometric-enroll.dto';
import { BiometricDisableDto } from '../dto/biometric-disable.dto';
import { TokenRefreshDto } from '../dto/token-refresh.dto';
import { PasswordChangeInitiateDto } from '../dto/password-change-initiate.dto';
import { PasswordChangeVerifyOtpDto } from '../dto/password-change-verify-otp.dto';
import { PasswordChangeCompleteDto } from '../dto/password-change-complete.dto';
import { EmailChangeInitiateDto } from '../dto/email-change-initiate.dto';
import { EmailChangeVerifyDto } from '../dto/email-change-verify.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { LoggerService } from '../../common/logger/logger.service'; // Updated import
import { createVerify } from 'crypto';

import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { ResendOtpDto } from '../dto/resent-otp.dto';
import { changeEmailInitiateDto } from '../dto/change-email-initiate.dto';
import { changeEmailVerifyDto } from '../dto/change-email-verify.dto';
import { EmailChangeCompleteDto } from '../dto/email-change-complete.dto';
import { GeolocationService } from 'src/common/geolocation.service';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { RateLimit } from 'src/common/decorators/rate-limit.decorator';
import { RateLimitTier } from 'src/common/config/rate-limit.config';

@ApiTags('Auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly geolocationService: GeolocationService, // New service injection
    private readonly logger: LoggerService, // Updated injection
  ) {}

  /**
   * ================================
   * SignUp - Start
   * ================================
   */
  @Post('signup/start')
  @UseGuards(RateLimitGuard)
  @RateLimit(RateLimitTier.AUTH)
  @ApiOperation({ summary: 'Initiate user signup by sending OTP' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully.',
    schema: {
      example: {
        data: {},
        message: 'An OTP has been sent to your phone number ending with 4444.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'User already exists.',
    schema: {
      example: {
        statusCode: 409,
        message: 'A user with this phone number already exists.',
        error: 'Conflict',
      },
    },
  })
  async signupStart(
    @Body(new ValidationPipe()) signupStartDto: SignupStartDto,
  ) {
    this.logger.log(
      `Signup initiation for phone number: ${signupStartDto.phoneNumber}`,
      'AuthController',
    );
    const response = await this.authService.signupStart(signupStartDto);

    return response;
  }

  /**
   * ================================
   * resent - OTP
   * ================================
   */

  @Post('resend-otp')
  async resendOtp(@Body() resendOtpDto: ResendOtpDto) {
    return this.authService.resendOtp(resendOtpDto);
  }
  /**
   * ================================
   * SignUp - Verify OTP
   * ================================
   */
  @Post('signup/verify-otp')
  @UseGuards(RateLimitGuard)
  @RateLimit(RateLimitTier.AUTH)
  @ApiOperation({ summary: 'Verify OTP for user signup' })
  @ApiResponse({
    status: 200,
    description: 'OTP verified successfully.',
    schema: {
      example: {
        data: {
          onboardingAuthorizationToken: 'jwt-token',
        },
        message: 'OTP verified successfully.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired OTP.',
    schema: {
      example: {
        statusCode: 401,
        message: 'OTP has expired or is invalid.',
        error: 'Unauthorized',
      },
    },
  })
  async signupVerifyOtp(
    @Body(new ValidationPipe()) signupVerifyOtpDto: SignupVerifyOtpDto,
  ) {
    this.logger.log(
      `OTP verification for phone number: ${signupVerifyOtpDto.phoneNumber}`,
      'AuthController',
    );
    const response = await this.authService.signupVerifyOtp(signupVerifyOtpDto);
    return response;
  }

  /**
   * ================================
   * SignUp - Basic Information
   * ================================
   */
  // @UseGuards(JwtAuthGuard)
  @Post('signup/basicinfo')
  @UseGuards(RateLimitGuard)
  @RateLimit(RateLimitTier.AUTH)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit basic information during signup' })
  @ApiResponse({
    status: 200,
    description: 'Basic information saved successfully.',
    schema: {
      example: {
        data: {
          id: 1,
          firstName: 'John',
          lastName: 'Doe',
          interacEmailAddress: 'john.doe@example.com',
          address: {
            street: '123 Main St',
            apartmentNumber: 'A1',
            city: 'Metropolis',
            stateProvince: 'State',
            zipCode: '123456',
          },
          dateOfBirth: '1990-01-01',
        },
        message: 'Your information has been saved successfully.',
        errors: {},
      },
    },
  })
  async signupBasicInfo(
    @Body(new ValidationPipe()) signupBasicInfoDto: SignupBasicInfoDto,
  ) {
    this.logger.log(
      `Basic info submission with session token`,
      'AuthController',
    );

    if (!signupBasicInfoDto.sessionToken) {
      throw new UnauthorizedException('Session token is required');
    }

    const response = await this.authService.signupBasicInfo(
      signupBasicInfoDto,
      signupBasicInfoDto.sessionToken,
    );

    return response;
  }

  /**
   * ================================
   * SignUp - Password Setup
   * ================================
   */
  @Post('signup/passwordinfo')
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit(RateLimitTier.AUTH)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set password during signup' })
  @ApiResponse({
    status: 200,
    description: 'Password set successfully.',
    schema: {
      example: {
        data: {},
        message: 'Password set successfully.',
        errors: {},
      },
    },
  })
  async signupPassword(
    @Body(new ValidationPipe()) signupPasswordDto: SignupPasswordDto,
    @Request() req,
  ) {
    const userId = req.user.userId;
    this.logger.log(`Password setup for user ID: ${userId}`, 'AuthController');
    const response = await this.authService.signupPassword(
      userId,
      signupPasswordDto,
    );
    return response;
  }

  /**
   * ================================
   * Get Onboarding Status - Resume Functionality
   * ================================
   */
  @Post('onboarding/status')
  @ApiOperation({
    summary: 'Get current onboarding status for resume functionality',
  })
  @ApiResponse({
    status: 200,
    description: 'Onboarding status retrieved successfully.',
    schema: {
      example: {
        data: {
          shouldResume: true,
          currentStep: 'basic_info',
          completedSteps: ['phone_verification', 'phone_verified'],
          data: {
            phoneVerified: true,
            basicInfoCompleted: false,
          },
        },
        message: 'Onboarding status retrieved successfully.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'No active onboarding session.',
    schema: {
      example: {
        data: {
          shouldResume: false,
          currentStep: null,
        },
        message: 'No active onboarding session found.',
        errors: {},
      },
    },
  })
  @Post('onboarding/status')
  @ApiOperation({
    summary: 'Get current onboarding status for resume functionality',
  })
  async getOnboardingStatus(@Body('phoneNumber') phoneNumber: string) {
    this.logger.log(
      `Onboarding status request with phoneNumber: ${phoneNumber}`,
      'AuthController',
    );
    console.log(phoneNumber, 'phoneNumber');
    const response =
      await this.authService.getOnboardingStatusByPhoneNumber(phoneNumber);
    return response;
  }
  /**
   * ================================
   * SignUp - Liveness Check
   * ================================
   */
  @UseGuards(JwtAuthGuard)
  @Post('signup/liveness')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perform liveness check during signup' })
  @ApiResponse({
    status: 200,
    description: 'Liveness verification successful.',
    schema: {
      example: {
        data: {},
        message: 'Liveness verification successful.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Liveness verification failed.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Liveness verification failed.',
        error: 'Unauthorized',
      },
    },
  })
  async signupLiveness(
    @Body(new ValidationPipe()) signupLivenessDto: SignupLivenessDto,
    @Request() req,
  ) {
    const userId = req.user.userId;
    this.logger.log(`Liveness check for user ID: ${userId}`, 'AuthController');
    const response = await this.authService.signupLiveness(
      userId,
      signupLivenessDto,
    );
    return response;
  }

  /**
   * ================================
   * Get Liveness Access Token
   * ================================
   */
  @UseGuards(JwtAuthGuard)
  @Get('liveness/access-token')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get access token for liveness check' })
  @ApiResponse({
    status: 200,
    description: 'Access token retrieved successfully.',
    schema: {
      example: {
        data: {
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
        message: 'Access token retrieved successfully.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Failed to retrieve access token.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Failed to retrieve access token.',
        error: 'Bad Request',
      },
    },
  })
  async getLivenessAccessToken(
    @Query('levelName') levelName: string,
    @Request() req,
  ) {
    const userId = req.user.userId;
    this.logger.log(
      `Generating liveness access token for user ID: ${userId}`,
      'AuthController',
    );
    const data = await this.authService.getAccessToken(userId, levelName);
    return {
      data,
      message: 'Access token retrieved successfully.',
      errors: {},
    };
  }

  /**
   * ================================
   * Get Liveness Verification Results
   * ================================
   */
  @UseGuards(JwtAuthGuard)
  @Get('liveness/results')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retrieve liveness verification results' })
  @ApiResponse({
    status: 200,
    description: 'Liveness verification results retrieved successfully.',
    schema: {
      example: {
        data: {
          applicantId: '123456789',
          checks: [
            {
              id: 'check-id-123',
              type: 'liveness',
              status: 'completed',
              result: {
                reviewAnswer: 'GREEN',
                reviewRejectType: null,
              },
            },
          ],
        },
        message: 'Liveness verification results retrieved successfully.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Liveness verification results not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Liveness verification results not found.',
        error: 'Not Found',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Failed to retrieve liveness verification results.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Failed to retrieve liveness verification results.',
        error: 'Bad Request',
      },
    },
  })
  async getLivenessResults(
    @Query('applicantId') applicantId: string,
    @Request() req,
  ) {
    const userId = req.user.userId;
    this.logger.log(
      `Retrieving liveness verification results for user ID: ${userId}, applicant ID: ${applicantId}`,
      'AuthController',
    );

    const results = await this.authService.getLivenessResults(applicantId);
    return {
      data: results,
      message: 'Liveness verification results retrieved successfully.',
      errors: {},
    };
  }

  /**
   * ================================
   * SignUp - Identity Verification
   * ================================
   */
  @UseGuards(JwtAuthGuard)
  @Post('signup/identity')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify identity during signup' })
  @ApiResponse({
    status: 200,
    description: 'Identity verification completed successfully.',
    schema: {
      example: {
        data: {},
        message: 'Identity verification completed successfully.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Identity verification failed.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Identity verification failed due to invalid documents.',
        error: 'Bad Request',
      },
    },
  })
  async signupIdentity(
    @Body(new ValidationPipe()) signupIdentityDto: SignupIdentityDto,
    @Request() req,
  ) {
    const userId = req.user.userId;
    this.logger.log(
      `Identity verification for user ID: ${userId}`,
      'AuthController',
    );
    const response = await this.authService.signupIdentity(
      userId,
      signupIdentityDto,
    );
    return response;
  }
  /**
   * ================================
   * SignIn with Password or Digital Signature
   * ================================
   */
  @Post('signin')
  // @UseGuards(RateLimitGuard)
  // @RateLimit(RateLimitTier.AUTH)
  @ApiOperation({
    summary: 'User sign-in with password or digital signature',
    description:
      'Authenticate using password or digital signature. Either password OR (payload + signature) is required.',
  })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful.',
    schema: {
      example: {
        data: {
          id: 1,
          phoneNumber: '+1-888-999-4444',
          accessToken: 'jwt-access-token',
          refreshToken: 'uuid-refresh-token',
          firebaseToken: 'firebase-custom-token',
          authMethod: 'password', // or 'signature'
        },
        message: 'Authentication successful.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication failed.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Incorrect phone number or credentials.',
        error: 'Unauthorized',
      },
    },
  })
  async signin(
    @Body(new ValidationPipe()) signinDto: SigninDto,
    @Request() req,
  ) {
    this.logger.log(
      `Signin attempt for phone number: ${signinDto.phoneNumber}`,
      'AuthController',
    );

    // Step 1: Extract the client's IP address
    const ipAddress =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip;

    // Step 2: Use the new service to get the real-time location from the IP
    const location = await this.geolocationService.getLocationFromIp(ipAddress);

    // Step 3: Assign the fetched data to the DTO
    signinDto.ipAddress = ipAddress;
    signinDto.location = location;

    // Step 4: Continue with your existing logic
    const response = await this.authService.signin(signinDto);
    return response;
  }

  /**
   * ================================
   * Password Reset - Initiate OTP
   * ================================
   */
  @Post('password-reset/initiate-otp')
  @UseGuards(RateLimitGuard)
  @RateLimit(RateLimitTier.AUTH)
  @ApiOperation({ summary: 'Initiate password reset by sending OTP' })
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
        statusCode: 404,
        message: 'Phone number not found.',
        error: 'Not Found',
      },
    },
  })
  async passwordResetInitiateOtp(
    @Body(new ValidationPipe())
    passwordResetInitiateOtpDto: PasswordResetInitiateOtpDto,
  ) {
    this.logger.log(
      `Password reset OTP initiation for phone number: ${passwordResetInitiateOtpDto.phoneNumber}`,
      'AuthController',
    );
    const response = await this.authService.passwordResetInitiateOtp(
      passwordResetInitiateOtpDto,
    );
    return response;
  }

  /**
   * ================================
   * Password Reset - Verify OTP
   * ================================
   */
  @Post('password-reset/verify-otp')
  @UseGuards(RateLimitGuard)
  @RateLimit(RateLimitTier.AUTH)
  @ApiOperation({ summary: 'Verify OTP for password reset' })
  @ApiResponse({
    status: 200,
    description: 'OTP verified successfully.',
    schema: {
      example: {
        data: {},
        message: 'OTP verified successfully.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired OTP.',
    schema: {
      example: {
        statusCode: 401,
        message: 'OTP has expired or is invalid.',
        error: 'Unauthorized',
      },
    },
  })
  async passwordResetVerifyOtp(
    @Body(new ValidationPipe())
    passwordResetVerifyOtpDto: PasswordResetVerifyOtpDto,
  ) {
    this.logger.log(
      `Password reset OTP verification for phone number: ${passwordResetVerifyOtpDto.phoneNumber}`,
      'AuthController',
    );
    const response = await this.authService.passwordResetVerifyOtp(
      passwordResetVerifyOtpDto,
    );
    return response;
  }

  /**
   * ================================
   * Password Reset - Complete
   * ================================
   */
  @Post('password-reset/complete')
  @ApiOperation({ summary: 'Complete password reset' })
  @ApiResponse({
    status: 200,
    description: 'Password reset completed successfully.',
    schema: {
      example: {
        data: {},
        message: 'Your password has been reset successfully.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'User not found.',
        error: 'Not Found',
      },
    },
  })
  async passwordResetComplete(
    @Body(new ValidationPipe())
    passwordResetCompleteDto: PasswordResetCompleteDto,
  ) {
    this.logger.log(
      `Password reset completion for phone number: ${passwordResetCompleteDto.phoneNumber}`,
      'AuthController',
    );
    const response = await this.authService.passwordResetComplete(
      passwordResetCompleteDto,
    );
    return response;
  }

  /**
   * ================================
   * Biometric Authentication - Enroll
   * ================================
   */
  @UseGuards(JwtAuthGuard)
  @Post('biometric/enroll')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enroll biometric authentication' })
  @ApiResponse({
    status: 200,
    description: 'Biometric authentication enabled successfully.',
    schema: {
      example: {
        data: {},
        message: 'Biometric authentication enabled successfully.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Failed to enroll biometric authentication.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Failed to enroll biometric authentication.',
        error: 'Bad Request',
      },
    },
  })
  async enrollBiometric(
    @Body(new ValidationPipe()) biometricEnrollDto: BiometricEnrollDto,
    @Request() req,
  ) {
    const userId = req.user.userId;
    this.logger.log(
      `Biometric enrollment for user ID: ${userId}`,
      'AuthController',
    );
    const response = await this.authService.enrollBiometric(
      userId,
      biometricEnrollDto,
    );
    return response;
  }

  /**
   * ================================
   * Biometric Authentication - Disable
   * ================================
   */
  @UseGuards(JwtAuthGuard)
  @Post('biometric/disable')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable biometric authentication' })
  @ApiResponse({
    status: 200,
    description: 'Biometric authentication disabled successfully.',
    schema: {
      example: {
        data: {},
        message: 'Biometric authentication disabled successfully.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Failed to disable biometric authentication.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Failed to disable biometric authentication.',
        error: 'Bad Request',
      },
    },
  })
  async disableBiometric(
    @Body(new ValidationPipe()) biometricDisableDto: BiometricDisableDto,
    @Request() req,
  ) {
    const userId = req.user.userId;
    this.logger.log(
      `Biometric disable request for user ID: ${userId}`,
      'AuthController',
    );
    const response = await this.authService.disableBiometric(
      userId,
      biometricDisableDto,
    );
    return response;
  }

  /**
   * ================================
   * Token Refresh
   * ================================
   */
  @Post('token/refresh')
  @UseGuards(RateLimitGuard)
  @RateLimit(RateLimitTier.READ)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully.',
    schema: {
      example: {
        data: {
          accessToken: 'new-jwt-access-token',
          refreshToken: 'new-uuid-refresh-token',
        },
        message: 'Token refreshed successfully.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid or expired refresh token.',
        error: 'Unauthorized',
      },
    },
  })
  async refreshToken(
    @Body(new ValidationPipe()) tokenRefreshDto: TokenRefreshDto,
  ) {
    this.logger.log(`Token refresh attempt.`, 'AuthController');
    const response = await this.authService.refreshToken(tokenRefreshDto);
    return response;
  }

  /**
   * ================================
   * Password Change - Initiate
   * ================================
   */
  @UseGuards(JwtAuthGuard)
  @UseGuards(RateLimitGuard)
  @RateLimit(RateLimitTier.AUTH)
  @Post('password-change/initiate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Validate current password before password change' })
  @ApiResponse({
    status: 200,
    description: 'Password validated successfully.',
    schema: {
      example: {
        data: {
          passwordChangeToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
        message:
          'Current password verified successfully. You can now change your password.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid password.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Current password is incorrect.',
        error: 'Unauthorized',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'User not found.',
        error: 'Not Found',
      },
    },
  })
  async passwordChangeInitiate(
    @Body(new ValidationPipe())
    passwordChangeInitiateDto: PasswordChangeInitiateDto,
    @Request() req,
  ) {
    const userId = req.user.userId;
    this.logger.log(
      `Password change initiation for user ID: ${userId}`,
      'AuthController',
    );
    const response = await this.authService.passwordChangeInitiate(
      userId,
      passwordChangeInitiateDto,
    );
    return response;
  }
  /**
   * ================================
   * Password Change - Verify OTP
   * ================================
   */
  @UseGuards(JwtAuthGuard)
  @Post('password-change/verify')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify OTP for password change' })
  @ApiResponse({
    status: 200,
    description: 'OTP verified successfully.',
    schema: {
      example: {
        data: {},
        message: 'OTP verified successfully.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired OTP.',
    schema: {
      example: {
        statusCode: 401,
        message: 'OTP has expired or is invalid.',
        error: 'Unauthorized',
      },
    },
  })
  async passwordChangeVerifyOtp(
    @Body(new ValidationPipe())
    passwordChangeVerifyOtpDto: PasswordChangeVerifyOtpDto,
    @Request() req,
  ) {
    const userId = req.user.userId;
    this.logger.log(
      `Password change OTP verification for user ID: ${userId}`,
      'AuthController',
    );
    const response = await this.authService.passwordChangeVerifyOtp(
      userId,
      passwordChangeVerifyOtpDto,
    );
    return response;
  }

  /**
   * ================================
   * Password Change - Complete
   * ================================
   */
  @UseGuards(JwtAuthGuard)
  @Post('password-change/complete')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Complete password change' })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully.',
    schema: {
      example: {
        data: {},
        message: 'Your password has been changed successfully.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'User not found.',
        error: 'Not Found',
      },
    },
  })
  async passwordChangeComplete(
    @Body(new ValidationPipe())
    passwordChangeCompleteDto: PasswordChangeCompleteDto,
    @Request() req,
  ) {
    const userId = req.user.userId;

    console.log(userId, 'userId');
    this.logger.log(
      `Password change completion for user ID: ${userId}`,
      'AuthController',
    );
    const response = await this.authService.passwordChangeComplete(
      userId,
      passwordChangeCompleteDto,
    );
    return response;
  }

  /**
   * ================================
   * Logout
   * ================================
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout user and invalidate current session' })
  @ApiResponse({
    status: 200,
    description: 'Logout successful.',
    schema: {
      example: {
        data: {},
        message: 'Logout successful.',
        errors: {},
      },
    },
  })
  async logout(@Request() req, @Body() body: { refreshToken: string }) {
    const userId = req.user.userId;
    const accessToken = req.headers.authorization?.replace('Bearer ', '');

    this.logger.log(`Logout attempt for user ID: ${userId}`, 'AuthController');

    const response = await this.authService.logout(
      userId,
      accessToken,
      body.refreshToken,
    );

    return response;
  }

  /**
   * ================================
   * Logout from All Devices
   * ================================
   */
  @Post('logout-all-devices')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout from all devices' })
  @ApiResponse({
    status: 200,
    description: 'Logged out from all devices successfully.',
    schema: {
      example: {
        data: {},
        message: 'Logged out from all devices successfully.',
        errors: {},
      },
    },
  })
  async logoutAllDevices(@Request() req) {
    const userId = req.user.userId;

    this.logger.log(
      `Logout all devices attempt for user ID: ${userId}`,
      'AuthController',
    );

    const response = await this.authService.logoutAllDevices(userId);

    return response;
  }

  /**
   * ================================
   * Get Active Sessions
   * ================================
   */
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all active sessions' })
  @ApiResponse({
    status: 200,
    description: 'Active sessions retrieved successfully.',
  })
  async getActiveSessions(@Request() req) {
    const userId = req.user.userId;

    const sessions = await this.authService.getActiveSessions(userId);

    return {
      data: sessions,
      message: 'Active sessions retrieved successfully.',
      errors: {},
    };
  }

  /**
   * ================================
   * Revoke Specific Session
   * ================================
   */
  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiResponse({
    status: 200,
    description: 'Session revoked successfully.',
  })
  async revokeSession(@Request() req, @Param('sessionId') sessionId: number) {
    const userId = req.user.userId;

    const response = await this.authService.revokeSession(userId, sessionId);

    return response;
  }

  /**
   * ================================
   * Email Change - Initiate
   * ================================
   */
  @UseGuards(JwtAuthGuard)
  @UseGuards(RateLimitGuard)
  @RateLimit(RateLimitTier.AUTH)
  @Post('email-change/initiate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate email change by sending OTP' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully.',
    schema: {
      example: {
        data: {},
        message: 'OTP has been sent to your new email address.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'User not found.',
        error: 'Not Found',
      },
    },
  })
  async emailChangeInitiate(
    @Body(new ValidationPipe()) emailChangeInitiateDto: EmailChangeInitiateDto,
    @Request() req,
  ) {
    const userId = req.user.userId;
    this.logger.log(
      `Email change initiation for user ID: ${userId}`,
      'AuthController',
    );
    const response = await this.authService.emailChangeInitiate(
      userId,
      emailChangeInitiateDto,
    );
    return response;
  }

  @Post('change-email/initiate')
  @UseGuards(RateLimitGuard)
  @RateLimit(RateLimitTier.AUTH)
  @ApiOperation({ summary: 'Initiate email change by sending OTP' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully.',
    schema: {
      example: {
        data: {},
        message: 'OTP has been sent to your new email address.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'User not found.',
        error: 'Not Found',
      },
    },
  })
  async changeEmailInitiate(
    @Body(new ValidationPipe()) emailChangeInitiateDto: changeEmailInitiateDto,
  ) {
    const { sessionToken } = emailChangeInitiateDto;

    this.logger.log(
      `Email change initiation with session token`,
      'AuthController',
    );

    const response = await this.authService.changeEmailInitiate(
      sessionToken,
      emailChangeInitiateDto,
    );

    return response;
  }

  /**
   * ================================
   * Email Change - Verify
   * ================================
   */
  @UseGuards(JwtAuthGuard)
  @UseGuards(RateLimitGuard)
  @RateLimit(RateLimitTier.AUTH)
  @Post('email-change/verify')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify OTP for email change' })
  @ApiResponse({
    status: 200,
    description: 'Email updated successfully.',
    schema: {
      example: {
        data: {},
        message: 'Your email has been updated successfully.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired OTP.',
    schema: {
      example: {
        statusCode: 401,
        message: 'OTP has expired or is invalid.',
        error: 'Unauthorized',
      },
    },
  })
  async emailChangeVerify(
    @Body(new ValidationPipe()) emailChangeVerifyDto: EmailChangeVerifyDto,
    @Request() req,
  ) {
    const userId = req.user.userId;
    this.logger.log(
      `Email change OTP verification for user ID: ${userId}`,
      'AuthController',
    );
    const response = await this.authService.emailChangeVerify(
      userId,
      emailChangeVerifyDto,
    );
    return response;
  }

  @Post('change-email/verify')
  @ApiOperation({ summary: 'Verify OTP for email change' })
  @ApiResponse({
    status: 200,
    description: 'Email changed successfully.',
    schema: {
      example: {
        data: { email: 'newemail@example.com' },
        message: 'Your email has been changed successfully.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid OTP.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid OTP.',
        error: 'Unauthorized',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Email change request not found or expired.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Email change request not found or expired.',
        error: 'Not Found',
      },
    },
  })
  async verifyEmailChange(
    @Body(new ValidationPipe()) emailChangeVerifyDto: changeEmailVerifyDto,
  ) {
    this.logger.log(`Email change verification`, 'AuthController');

    const response = await this.authService.verifyEmailChange(
      emailChangeVerifyDto.sessionToken,
      emailChangeVerifyDto.otp,
    );

    return response;
  }

  @Post('email-change/complete')
  @UseGuards(JwtAuthGuard)
  async emailChangeComplete(
    @Body() emailChangeCompleteDto: EmailChangeCompleteDto,
    @Request() req,
  ) {
    return this.authService.emailChangeComplete(
      req.user.userId,
      emailChangeCompleteDto,
    );
  }

  /**
   * ================================
   * Update Face ID Key
   * ================================
   */
  @Put('face-id-key')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update user face ID public key' })
  @ApiResponse({ status: 200, description: 'Face ID key updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateFaceIdKey(
    @Request() req,
    @Body() updateData: { publicKey: string },
  ) {
    const userId = req.user.userId;

    // Validate the public key
    if (!updateData.publicKey) {
      throw new BadRequestException('Public key is required');
    }

    // Update the face ID key
    const result = await this.authService.updateFaceIdKey(
      userId,
      updateData.publicKey,
    );

    if (!result) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      message: 'Face ID public key updated successfully',
    };
  }
}
