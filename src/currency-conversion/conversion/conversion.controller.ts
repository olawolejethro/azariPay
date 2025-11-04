// src/conversion/mobile-conversion.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  ValidationPipe,
  HttpException,
  HttpStatus,
  BadRequestException,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { CurrencyConversionService } from '../conversion/conversion.service';
import { ConvertCurrencyDto } from './dto/convert.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PagaService } from 'src/wallets/services/paga.service';
import { AuthService } from 'src/auth/services/auth.service';

// Response DTO matching the mobile app requirements
export class ConversionResponseDto {
  success: boolean;
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  convertedAmount: number;
  rate: number;
  timestamp: number;
  date: string;
  rateHistory?: {
    [day: string]: {
      rate: number;
      change: number; // percentage change from previous day
    };
  };
}

@ApiTags('convert')
@Controller('api/v1/convert/currency')
export class ConversionController {
  constructor(
    private readonly conversionService: CurrencyConversionService,
    private readonly pagaService: PagaService,
    private readonly authService: AuthService, // Inject AuthService
  ) {}

  @Post('convert')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Convert amount from any supported currency to another',
  })
  @ApiResponse({
    status: 200,
    description: 'Conversion successful',
    schema: {
      example: {
        success: true,
        query: { from: 'NGN', to: 'CAD', amount: 25000 },
        info: { timestamp: 1743509552, rate: 0.00125 },
        date: '2025-09-01',
        result: 31.25,
        feeDetails: {
          feeAmount: 100.0,
          feeCurrency: 'NGN',
          totalDeducted: 25100.0,
          originalAmount: 25000,
          sourceCurrency: 'NGN',
          targetCurrency: 'CAD',
        },
      },
    },
  })
  @ApiQuery({
    name: 'from',
    required: true,
    description: 'Source currency (NGN, CAD, USD, EUR, GBP)',
    example: 'NGN',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'Target currency (NGN, CAD, USD, EUR, GBP)',
    example: 'CAD',
  })
  @ApiQuery({
    name: 'amount',
    required: true,
    description: 'Amount to convert',
    example: 25000,
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Date for historical conversion (YYYY-MM-DD)',
  })
  async convertCurrency(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('amount') amount: number,
    @Req() req,
    @Body()
    transferDto: any & { pin?: string; payload?: string; signature?: string },
    @Query('date') date?: string,
  ): Promise<any> {
    try {
      const userId = req.user.userId;
      const user = await this.authService.findUserById(userId);

      // Check onboarding/KYC status
      const onboardingCompleted =
        user.pin !== null && user.kycStatus === 'SUCCESS';

      if (!onboardingCompleted) {
        throw new BadRequestException(
          'Onboarding not completed. Please complete KYC before conversion of funds.',
        );
      }

      if (!from || !to || !amount) {
        throw new BadRequestException('Missing required parameters');
      }

      // Generate session ID and timestamp
      const sessionId = this.generateSessionId(userId);
      const sessionDateTime = new Date();

      // Call the unified conversion method
      const result = await this.conversionService.convertCurrency(
        userId,
        from.toUpperCase(),
        to.toUpperCase(),
        Number(amount),
        date,
        sessionId,
        sessionDateTime,
      );

      return {
        ...result,
        sessionId: sessionId,
        dateTime: this.formatDateTime(sessionDateTime),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to convert currency',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
  @Post('convertNGN')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Convert amount from one currency to another' })
  @ApiResponse({
    status: 200,
    description: 'Conversion successful',
    schema: {
      example: {
        success: true,
        query: {
          from: 'GBP',
          to: 'JPY',
          amount: 25,
        },
        info: {
          timestamp: 1743509552,
          rate: 192.350469,
        },
        date: '2025-04-01',
        result: 4808.761725,
      },
    },
  })
  @ApiQuery({
    name: 'from',
    required: true,
    description: 'Source currency code',
    example: 'GBP',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'Target currency code',
    example: 'JPY',
  })
  @ApiQuery({
    name: 'amount',
    required: true,
    description: 'Amount to convert',
    example: 25,
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Date for historical conversion (YYYY-MM-DD)',
  })
  async convertNGN(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('amount') amount: number,
    @Req() req,
    @Body()
    transferDto: any & { pin?: string; payload?: string; signature?: string },
    @Query('date') date?: string,
  ): Promise<any> {
    try {
      const userId = req.user.userId;

      const user = await this.authService.findUserById(userId);

      // Check onboarding/KYC status
      const onboardingCompleted =
        user.pin !== null && user.kycStatus === 'SUCCESS';

      if (!onboardingCompleted) {
        throw new BadRequestException(
          'Onboarding not completed. Please complete KYC before convertion of funds.',
        );
      }

      if (!from || !to || !amount) {
        throw new BadRequestException('Missing required parameters');
      }

      // ADD THESE LINES - Generate session ID and timestamp
      const sessionId = this.generateSessionId(userId);
      const sessionDateTime = new Date();

      // MODIFY THIS LINE - Pass session info to service
      const result = await this.conversionService.convertNGN(
        userId,
        from,
        to,
        Number(amount),
        date,
        sessionId, // Add this parameter
        sessionDateTime, // Add this parameter
      );

      // ADD THESE LINES - Add session info to response
      return {
        ...result, // Keep all your existing response
        sessionId: sessionId,
        dateTime: this.formatDateTime(sessionDateTime),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to convert currency',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private generateSessionId(userId: number): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    return `${timestamp}${userId}${random}`.padStart(25, '0');
  }

  private formatDateTime(date: Date): string {
    const options: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Africa/Lagos',
    };

    return date.toLocaleDateString('en-GB', options).replace(',', '.');
  }
  @Get('check')
  @ApiOperation({ summary: 'Convert amount from one currency to another' })
  @ApiResponse({
    status: 200,
    description: 'Conversion successful',
    schema: {
      example: {
        success: true,
        query: {
          from: 'GBP',
          to: 'JPY',
          amount: 25,
        },
        info: {
          timestamp: 1743509552,
          rate: 192.350469,
        },
        date: '2025-04-01',
        result: 4808.761725,
      },
    },
  })
  @ApiQuery({
    name: 'from',
    required: true,
    description: 'Source currency code',
    example: 'GBP',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'Target currency code',
    example: 'JPY',
  })
  @ApiQuery({
    name: 'amount',
    required: true,
    description: 'Amount to convert',
    example: 25,
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Date for historical conversion (YYYY-MM-DD)',
  })
  async checkConvertCurrency(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('amount') amount: number,
    @Query('date') date?: string,
  ): Promise<any> {
    try {
      if (!from || !to || !amount) {
        throw new BadRequestException('Missing required parameters');
      }

      return await this.conversionService.checkConvertCurrency(
        from,
        to,
        Number(amount),
        date,
      );
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to convert currency',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('convertCAD')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Convert amount from one currency to another' })
  @ApiResponse({
    status: 200,
    description: 'Conversion successful',
    schema: {
      example: {
        success: true,
        query: {
          from: 'GBP',
          to: 'JPY',
          amount: 25,
        },
        info: {
          timestamp: 1743509552,
          rate: 192.350469,
        },
        date: '2025-04-01',
        result: 4808.761725,
      },
    },
  })
  @ApiQuery({
    name: 'from',
    required: true,
    description: 'Source currency code',
    example: 'GBP',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'Target currency code',
    example: 'JPY',
  })
  @ApiQuery({
    name: 'amount',
    required: true,
    description: 'Amount to convert',
    example: 25,
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Date for historical conversion (YYYY-MM-DD)',
  })
  async convertCAD(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('amount') amount: number,
    @Req() req,
    @Body()
    transferDto: any & { pin?: string; payload?: string; signature?: string },
    @Query('date') date?: string,
  ): Promise<any> {
    try {
      const userId = req.user.userId;
      const user = await this.authService.findUserById(userId);

      // Check onboarding/KYC status
      const onboardingCompleted =
        user.pin !== null && user.kycStatus === 'SUCCESS';

      if (!onboardingCompleted) {
        throw new BadRequestException(
          'Onboarding not completed. Please complete KYC before converion of funds.',
        );
      }

      if (!from || !to || !amount) {
        throw new BadRequestException('Missing required parameters');
      }

      // ADD THESE LINES - Generate session ID and timestamp
      const sessionId = this.generateSessionId(userId);
      const sessionDateTime = new Date();

      // MODIFY THIS LINE - Pass session info to service
      const result = await this.conversionService.convertCAD(
        userId,
        from,
        to,
        Number(amount),
        date,
        sessionId, // Add this parameter
        sessionDateTime, // Add this parameter
      );

      // ADD THESE LINES - Add session info to response
      return {
        ...result, // Keep all your existing response
        sessionId: sessionId,
        dateTime: this.formatDateTime(sessionDateTime),
      };
    } catch (error) {
      // CHANGED: Just throw BadRequestException with exact error message
      throw new BadRequestException(error.message);
    }
  }
}
