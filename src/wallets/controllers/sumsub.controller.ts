import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  UseGuards,
  Request,
  Logger,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { SumsubService } from '../services/sumsub.service';
import { AuthService } from 'src/auth/services/auth.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

// DTOs for request/response validation
export class GenerateAccessTokenDto {
  levelName: string;
  email?: string;
  phone?: string;
  ttlInSecs?: number;
}

export class AccessTokenResponseDto {
  data: {
    token: string;
    userId: string;
  };
  message: string;
  errors: Record<string, any>;
}

export class ApplicantStatusResponseDto {
  data: {
    reviewStatus: string;
    reviewResult?: {
      reviewAnswer: string;
    };
    inspectionId?: string;
    applicantId: string;
  };
  message: string;
  errors: Record<string, any>;
}

@ApiTags('Sumsub Verification')
@Controller('api/v1/auth/sumsub')
export class SumsubController {
  private readonly logger = new Logger(SumsubController.name);

  constructor(
    private readonly sumsubService: SumsubService,
    private readonly userService: AuthService, // Add UserService injection
  ) {}

  /**
   * ================================
   * Generate Liveness Access Token
   * ================================
   */
  @UseGuards(JwtAuthGuard)
  @Get('liveness/access-token')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate access token for liveness verification',
    description:
      'Creates a Sumsub access token for SDK initialization and liveness checks. Automatically fetches user email and phone from database.',
  })
  @ApiQuery({
    name: 'levelName',
    required: true,
    description: 'Verification level name (e.g., basic-kyc-level)',
    example: 'basic-kyc-level',
  })
  @ApiQuery({
    name: 'overrideEmail',
    required: false,
    description:
      'Override email address (optional - will use database email if not provided)',
    example: '[email protected]',
  })
  @ApiQuery({
    name: 'overridePhone',
    required: false,
    description:
      'Override phone number (optional - will use database phone if not provided)',
    example: '+1-234-567-8900',
  })
  @ApiQuery({
    name: 'ttl',
    required: false,
    description: 'Token time-to-live in seconds (default: 1200)',
    example: 1200,
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Access token generated successfully',
    type: AccessTokenResponseDto,
    schema: {
      example: {
        data: {
          token: '_act-eyJhbGciOiJub25lIn0.eyJqdGkiOiJfYWN0LTZmODI2ZTU0...',
          userId: '12345',
        },
        message: 'Access token generated successfully',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid parameters or Sumsub API error',
    schema: {
      example: {
        statusCode: 400,
        message: 'Failed to generate access token',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid JWT token',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found in database',
    schema: {
      example: {
        statusCode: 404,
        message: 'User not found',
        error: 'Not Found',
      },
    },
  })
  async getLivenessAccessToken(
    @Query('levelName') levelName: string,
    @Query('overrideEmail') overrideEmail?: string,
    @Query('overridePhone') overridePhone?: string,
    @Query('ttl') ttl?: number,
    @Request() req?: any,
  ): Promise<AccessTokenResponseDto> {
    const userId = req.user.userId.toString();
    const ttlInSecs = ttl || 1200;

    this.logger.log(
      `Generating liveness access token for user: ${userId}, level: ${levelName}`,
    );

    try {
      // Fetch user details from database
      const user = await this.userService.findUserById(userId);

      if (!user) {
        this.logger.error(`User not found with ID: ${userId}`);
        throw new NotFoundException('User not found');
      }

      // Use override values if provided, otherwise use database values
      const email = user.interacEmailAddress;
      const phone = user.phoneNumber;

      this.logger.log(
        `Using email: ${email ? '***@***.***' : 'none'}, phone: ${phone ? '***-***-****' : 'none'} for user: ${userId}`,
      );

      const result = await this.sumsubService.getAccessToken(
        userId,
        levelName,
        ttlInSecs,
        email,
        phone,
      );

      this.logger.log(
        `Access token generated successfully for user: ${userId}`,
      );

      return {
        data: result.data,
        message: 'Access token generated successfully',
        errors: {},
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate access token for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * ================================
   * Generate General Access Token
   * ================================
   */
  @UseGuards(JwtAuthGuard)
  @Post('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate access token with body parameters',
    description:
      'Creates a Sumsub access token using request body for more complex configurations',
  })
  @ApiBody({
    type: GenerateAccessTokenDto,
    description: 'Access token generation parameters',
    schema: {
      example: {
        levelName: 'basic-kyc-level',
        email: '[email protected]',
        phone: '+1-234-567-8900',
        ttlInSecs: 1200,
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Access token generated successfully',
    type: AccessTokenResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid body parameters',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid JWT token',
  })
  async generateAccessToken(
    @Body() generateTokenDto: GenerateAccessTokenDto,
    @Request() req?: any,
  ): Promise<AccessTokenResponseDto> {
    const userId = req.user.userId.toString();
    const { levelName, email, phone, ttlInSecs = 1200 } = generateTokenDto;

    this.logger.log(
      `Generating access token for user: ${userId}, level: ${levelName}`,
    );

    try {
      const result = await this.sumsubService.getAccessToken(
        userId,
        levelName,
        ttlInSecs,
        email,
        phone,
      );

      this.logger.log(
        `Access token generated successfully for user: ${userId}`,
      );

      return {
        data: result.data,
        message: 'Access token generated successfully',
        errors: {},
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate access token for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * ================================
   * Get Applicant Status
   * ================================
   */
  @UseGuards(JwtAuthGuard)
  @Get('applicant/:applicantId/status')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get applicant verification status',
    description: 'Retrieves the current verification status of an applicant',
  })
  @ApiParam({
    name: 'applicantId',
    description: 'Sumsub applicant identifier',
    example: '5cb56e8e0a975a35f333cb83',
  })
  @ApiResponse({
    status: 200,
    description: 'Applicant status retrieved successfully',
    type: ApplicantStatusResponseDto,
    schema: {
      example: {
        data: {
          reviewStatus: 'completed',
          reviewResult: {
            reviewAnswer: 'GREEN',
          },
          inspectionId: '5cb56e8e0a975a35f333cb84',
          applicantId: '5cb56e8e0a975a35f333cb83',
        },
        message: 'Applicant status retrieved successfully',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid applicant ID',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid JWT token',
  })
  @ApiResponse({
    status: 404,
    description: 'Applicant not found',
  })
  async getApplicantStatus(
    @Param('applicantId') applicantId: string,
    @Request() req?: any,
  ): Promise<ApplicantStatusResponseDto> {
    const userId = req.user.userId;

    this.logger.log(
      `Getting applicant status for applicantId: ${applicantId}, requested by user: ${userId}`,
    );

    try {
      const result = await this.sumsubService.getApplicantStatus(applicantId);

      this.logger.log(
        `Applicant status retrieved successfully for applicant: ${applicantId}`,
      );

      return {
        data: result,
        message: 'Applicant status retrieved successfully',
        errors: {},
      };
    } catch (error) {
      this.logger.error(
        `Failed to get applicant status for ${applicantId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * ================================
   * Webhook Endpoint (Optional)
   * ================================
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sumsub webhook endpoint',
    description: 'Receives verification status updates from Sumsub',
  })
  @ApiBody({
    description: 'Sumsub webhook payload',
    schema: {
      example: {
        applicantId: '5cb56e8e0a975a35f333cb83',
        inspectionId: '5cb56e8e0a975a35f333cb84',
        correlationId: 'req-ec508a2a-fa33-4dd2-b93d-fcade2967e03',
        externalUserId: '12672',
        type: 'applicantReviewed',
        reviewResult: {
          reviewAnswer: 'GREEN',
        },
        reviewStatus: 'completed',
        createdAtMs: '2020-02-21 13:23:19.111',
        clientId: 'SumsubClient',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid webhook payload',
  })
  async handleWebhook(@Body() webhookData: any): Promise<{ status: string }> {
    this.logger.log('Received Sumsub webhook');
    this.logger.debug(`Webhook data: ${JSON.stringify(webhookData)}`);

    try {
      // TODO: Implement webhook signature verification
      // TODO: Process the webhook data based on your business logic

      const { applicantId, type, reviewResult, reviewStatus } = webhookData;

      this.logger.log(
        `Processing webhook for applicant ${applicantId}: ${type} - ${reviewStatus}`,
      );

      // Example: Update your database with the verification result
      if (type === 'applicantReviewed' && reviewResult) {
        this.logger.log(
          `Applicant ${applicantId} review completed with result: ${reviewResult.reviewAnswer}`,
        );

        // TODO: Update your user verification status in your database
        // await this.userService.updateVerificationStatus(applicantId, reviewResult.reviewAnswer);
      }

      return { status: 'success' };
    } catch (error) {
      this.logger.error(`Webhook processing failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * ================================
   * Health Check
   * ================================
   */
  @Get('health')
  @ApiOperation({
    summary: 'Sumsub service health check',
    description: 'Checks if Sumsub service is accessible',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    schema: {
      example: {
        status: 'healthy',
        timestamp: '2025-08-13T12:00:00.000Z',
        service: 'sumsub',
      },
    },
  })
  async healthCheck(): Promise<{
    status: string;
    timestamp: string;
    service: string;
  }> {
    this.logger.log('Sumsub health check requested');

    try {
      // TODO: You could implement a simple API call to Sumsub to verify connectivity
      // For now, just return healthy status

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'sumsub',
      };
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'sumsub',
      };
    }
  }
}
