// src/currency-conversion/exchange-rates-api/exchange-rates-api.service.ts
import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { RedisService } from '../../../common/redis/redis.service';
import { ExchangeRatesApiResponse } from '../interfaces/exchange-rates-api-response.interface';
import { FeeManagementService } from 'src/metadata/services/fee-management.service';

@Injectable()
export class ExchangeRatesApiService {
  private readonly logger = new Logger(ExchangeRatesApiService.name);
  private readonly baseUrl = 'https://api.exchangeratesapi.io/v1';
  private readonly apiKey: string;
  private readonly axiosInstance: AxiosInstance;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly feeService: FeeManagementService, // Inject FeeService (replace 'any' with actual type if available)
  ) {
    this.apiKey = this.configService.get<string>('EXCHANGE_RATES_API_KEY');
    if (!this.apiKey) {
      this.logger.error(
        'EXCHANGE_RATES_API_KEY is not defined in environment variables',
      );
    }

    // Create axios instance with default configuration
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000, // 10 seconds timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Convert currency using the Exchange Rates API
   * @param from Source currency code
   * @param to Target currency code
   * @param amount Amount to convert
   * @param date Optional date for historical conversion
   * @returns Conversion result
   */
  async convertCurrency(
    from: string,
    to: string,
    amount: number,
    date?: string,
  ): Promise<ExchangeRatesApiResponse> {
    const url = '/convert';

    const params = {
      access_key: this.apiKey,
      from,
      to,
      amount,
      ...(date && { date }),
    };

    try {
      const response = await this.axiosInstance.get(url, { params });
      return response.data;
    } catch (error) {
      this.handleAxiosError(error, 'Failed to convert currency');
      throw new InternalServerErrorException('Failed to convert currency');
    }
  }

  /**
   * Get historical exchange rates for a specific date
   * @param date Date in YYYY-MM-DD format
   * @param base Base currency code
   * @param symbols Optional array of currency codes to include
   * @returns Historical exchange rate data
   */
  async getHistoricalRates(
    date: string,
    base: string = 'USD',
    symbols?: string[],
    search?: string, // Added search parameter
  ): Promise<any> {
    // Validate the date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      this.logger.error(`Invalid date format provided: ${date}`);
      throw new InternalServerErrorException(
        'Invalid date format. Use YYYY-MM-DD format.',
      );
    }

    const params: any = {
      access_key: this.apiKey,
    };

    // Add base currency if provided
    if (base) {
      params.base = base;
    }

    // Add symbols if provided
    if (symbols && symbols.length > 0) {
      params.symbols = symbols.join(',');
    }

    try {
      const response = await this.axiosInstance.get(`/${date}`, { params });
      const data = response.data;

      // Filter rates by search term if provided
      let filteredRates = data.rates;
      if (search && search.trim() !== '' && data.rates) {
        const searchTerm = search.trim().toUpperCase();
        filteredRates = {};

        // Keep only currencies that match the search term
        Object.keys(data.rates).forEach((currency) => {
          if (currency.includes(searchTerm)) {
            filteredRates[currency] = data.rates[currency];
          }
        });
      }

      // Transform rates into array format with two decimal places
      if (data.success && filteredRates) {
        const formattedRates = Object.keys(filteredRates).map((currency) => {
          // Create a single key-value pair object for each currency
          const rateObj = {};
          rateObj[currency] = Number(filteredRates[currency].toFixed(2));
          return rateObj;
        });

        // Return with transformed rates but keep all other fields
        return {
          success: data.success,
          timestamp: data.timestamp,
          historical: data.historical,
          base: data.base,
          date: data.date,
          rates: formattedRates,
          total: formattedRates.length, // Add total count for pagination
          filteredBy: search ? search : null, // Include search term if used
        };
      }

      return data;
    } catch (error) {
      this.handleAxiosError(error, 'Failed to fetch historical rates');
      throw new InternalServerErrorException(
        'Failed to fetch historical rates',
      );
    }
  }

  /**
   * Get historical exchange rates for a date range (timeseries)
   * @param startDate Start date in YYYY-MM-DD format
   * @param endDate End date in YYYY-MM-DD format
   * @param base Base currency code
   * @param symbols Optional array of currency codes to include
   * @returns Timeseries exchange rate data
   */
  async getTimeseriesRates(
    startDate: string,
    endDate: string,
    base: string = 'USD',
    symbols?: string[],
  ): Promise<ExchangeRatesApiResponse> {
    // Validate date formats
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
    ) {
      this.logger.error(
        `Invalid date format provided: ${startDate} or ${endDate}`,
      );
      throw new InternalServerErrorException(
        'Invalid date format. Use YYYY-MM-DD format.',
      );
    }

    const params: any = {
      access_key: this.apiKey,
      start_date: startDate,
      end_date: endDate,
    };

    // Add base currency if provided
    if (base) {
      params.base = base;
    }

    // Add symbols if provided
    if (symbols && symbols.length > 0) {
      params.symbols = symbols.join(',');
    }

    try {
      const response = await this.axiosInstance.get('/timeseries', { params });
      return response.data;
    } catch (error) {
      this.handleAxiosError(error, 'Failed to fetch timeseries rates');
      throw new InternalServerErrorException(
        'Failed to fetch timeseries rates',
      );
    }
  }

  /**
   * Get exchange rate fluctuation data between two dates
   * @param startDate Start date in YYYY-MM-DD format
   * @param endDate End date in YYYY-MM-DD format
   * @param base Base currency code
   * @param symbols Optional array of currency codes to include
   * @returns Fluctuation data
   */
  async getFluctuationData(
    startDate: string,
    endDate: string,
    base: string = 'USD',
    symbols?: string[],
  ): Promise<ExchangeRatesApiResponse> {
    // Validate date formats
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
    ) {
      this.logger.error(
        `Invalid date format provided: ${startDate} or ${endDate}`,
      );
      throw new InternalServerErrorException(
        'Invalid date format. Use YYYY-MM-DD format.',
      );
    }

    const params: any = {
      access_key: this.apiKey,
      start_date: startDate,
      end_date: endDate,
    };

    // Add base currency if provided
    if (base) {
      params.base = base;
    }

    // Add symbols if provided
    if (symbols && symbols.length > 0) {
      params.symbols = symbols.join(',');
    }

    try {
      const response = await this.axiosInstance.get('/fluctuation', { params });
      return response.data;
    } catch (error) {
      this.handleAxiosError(error, 'Failed to fetch fluctuation data');
      throw new InternalServerErrorException(
        'Failed to fetch fluctuation data',
      );
    }
  }

  /**
   * Fallback method in case the primary conversion endpoint fails
   * This uses the latest rates endpoint and calculates the conversion manually
   * @param from Source currency code
   * @param to Target currency code
   * @param amount Amount to convert
   * @param date Optional date for historical conversion
   * @returns Conversion result
   */
  async convertCurrencyFallback(
    from: string,
    to: string,
    amount: number,
    date?: string,
  ): Promise<ExchangeRatesApiResponse> {
    const endpoint = date ? date : 'latest';

    const params = {
      access_key: this.apiKey,
      base: from,
      symbols: to,
    };

    try {
      const response = await this.axiosInstance.get(`/${endpoint}`, { params });
      const data = response.data;

      if (!data.success) {
        throw new InternalServerErrorException(
          `API error: ${data.error?.info || 'Unknown error'}`,
        );
      }

      const rate = data.rates[to];
      const result = amount * rate;

      return {
        success: true,
        query: {
          from,
          to,
          amount,
          ...(date && { date }),
        },
        info: {
          rate,
          timestamp: data.timestamp,
        },
        date: data.date,
        result,
      };
    } catch (error) {
      this.handleAxiosError(error, 'Failed to convert currency (fallback)');
      throw new InternalServerErrorException(
        'Failed to convert currency (fallback)',
      );
    }
  }

  /**
   * Check if the Exchange Rates API is available
   * @returns True if available, false otherwise
   */
  async checkApiStatus(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.get('/latest', {
        params: {
          access_key: this.apiKey,
          base: 'USD',
          symbols: 'EUR',
        },
      });

      return response.data.success === true;
    } catch (error) {
      this.logger.error(`Error checking API status: ${error.message}`);
      return false;
    }
  }

  /**
   * Helper method to handle and log Axios errors
   * @param error The Axios error
   * @param message Custom error message
   */
  private handleAxiosError(error: any, message: string): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      this.logger.error(`${message}: ${axiosError.message}`);

      if (axiosError.response) {
        this.logger.error(
          `Response data: ${JSON.stringify(axiosError.response.data)}`,
        );
        this.logger.error(`Response status: ${axiosError.response.status}`);
      } else if (axiosError.request) {
        this.logger.error('No response received from API');
      }
    } else {
      this.logger.error(`${message}: ${error.message}`);
    }
  }

  /**
   * Get latest exchange rates
   * @param base Base currency code (default: 'USD')
   * @param symbols Optional array of currency codes to include
   * @returns Latest exchange rate data
   */
  async getLatestRates(base: string = 'NGN', symbols?: string[]): Promise<any> {
    // Define major currencies including NGN
    const majorCurrencies = [
      'NGN',
      'USD',
      'EUR',
      'GBP',
      'CAD',
      'JPY',
      'AUD',
      'CHF',
    ];

    const params: any = {
      access_key: this.apiKey,
    };

    // Set base currency
    params.base = base;

    // If no symbols provided, use major currencies
    // If symbols provided, merge with major currencies to ensure they're included
    let currenciesToFetch = majorCurrencies;
    if (symbols && symbols.length > 0) {
      currenciesToFetch = [...new Set([...majorCurrencies, ...symbols])];
    }

    // Remove base currency from symbols (can't convert currency to itself)
    currenciesToFetch = currenciesToFetch.filter(
      (currency) => currency !== base,
    );

    params.symbols = currenciesToFetch.join(',');

    try {
      const response = await this.axiosInstance.get('/latest', { params });
      const data = response.data;

      if (!data.success) {
        throw new Error(data.error?.info || 'Failed to fetch exchange rates');
      }

      // Transform rates and add fee information
      const ratesWithFees = [];

      if (data.rates) {
        for (const currency of Object.keys(data.rates)) {
          const exchangeRate = Number(data.rates[currency]);

          // Get fee for conversion from base currency to this currency
          let feeAmount = 0;
          try {
            feeAmount = await this.feeService.getFeeForTransaction(
              'currency_conversion',
              base,
            );
          } catch (error) {
            // If no fee configuration found, default to 0 (but log it)
            this.logger.warn(
              `No fee configuration found for ${base} currency conversions`,
            );
            feeAmount = 0;
          }

          // Create rate object with fee information
          const rateObj = {};
          rateObj[currency] = {
            rate: Number(exchangeRate.toFixed(6)),
            fee: Number(feeAmount.toFixed(2)),
            feeCurrency: base,
          };

          ratesWithFees.push(rateObj);
        }
      }

      // Return the response with fee-enhanced rates
      return {
        success: data.success,
        timestamp: data.timestamp,
        base: data.base,
        date: data.date,
        rates: ratesWithFees,
      };
    } catch (error) {
      this.logger.error('Failed to fetch latest exchange rates', error);
      this.handleAxiosError(error, 'Failed to fetch latest rates');
      throw new InternalServerErrorException('Failed to fetch latest rates');
    }
  }
}
