import { HttpException, HttpStatus, Param } from '@nestjs/common';
import { Controller, Get, Query } from '@nestjs/common';
import { ExchangeRatesApiService } from '../services/exchange-rates-api.service';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@Controller('api/v1/exchange-rates')
@ApiTags('Exchange Rates')
@ApiResponse({ status: 200, description: 'Success' })
export class ExchangeRatesController {
  constructor(
    private readonly exchangeRatesApiService: ExchangeRatesApiService,
  ) {}
  @Get('historical/:date')
  @ApiOperation({
    summary: 'Get historical exchange rates for a specific date',
  })
  @ApiParam({
    name: 'date',
    required: true,
    description: 'Historical date in YYYY-MM-DD format',
    example: '2023-12-24',
  })
  @ApiQuery({
    name: 'base',
    required: false,
    description: 'Base currency code',
    example: 'CAD',
  })
  @ApiQuery({
    name: 'symbols',
    required: false,
    description: 'Comma-separated list of currency codes to include',
    example: 'USD,CAD,EUR',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search term to filter currencies',
    example: 'US',
  })
  async getHistoricalRates(
    @Param('date') date: string,
    @Query('base') base: string = 'USD',
    @Query('symbols') symbols?: string,
    @Query('search') search?: string,
  ): Promise<any> {
    try {
      const symbolsArray = symbols
        ? symbols.split(',').map((s) => s.trim())
        : undefined;
      return await this.exchangeRatesApiService.getHistoricalRates(
        date,
        base,
        symbolsArray,
        search,
      );
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to fetch historical rates',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('latestExchangeRate')
  @ApiOperation({ summary: 'Get latest exchange rates' })
  @ApiResponse({
    status: 200,
    description: 'Latest exchange rates',
    schema: {
      example: {
        success: true,
        timestamp: 1519296206,
        base: 'USD',
        date: '2021-03-17',
        rates: {
          GBP: 0.72007,
          JPY: 107.346001,
          EUR: 0.813399,
        },
      },
    },
  })
  @ApiQuery({
    name: 'base',
    required: false,
    description: 'Base currency code',
    type: String,
    example: 'USD',
  })
  @ApiQuery({
    name: 'symbols',
    required: false,
    description: 'Comma-separated list of currency codes to include',
    type: String,
    example: 'GBP,JPY,EUR',
  })
  async getLatestRates(
    @Query('base') base: string = 'USD',
    @Query('symbols') symbols?: string,
  ): Promise<any> {
    try {
      const symbolsArray = symbols
        ? symbols.split(',').map((s) => s.trim())
        : undefined;
      return await this.exchangeRatesApiService.getLatestRates(
        base,
        symbolsArray,
      );
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to fetch latest rates',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
