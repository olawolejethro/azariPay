// src/currency-conversion/interfaces/exchange-rates-api-response.interface.ts

/**
 * Interface for Exchange Rates API responses
 */
export interface ExchangeRatesApiResponse {
  /**
   * Whether the request was successful
   */
  success: boolean;

  /**
   * Whether the request was for historical data (optional)
   */
  historical?: boolean;

  /**
   * Whether the request was for a timeseries (optional)
   */
  timeseries?: boolean;

  /**
   * Whether the request was for fluctuation data (optional)
   */
  fluctuation?: boolean;

  /**
   * The date of the exchange rates
   */
  date?: string;

  /**
   * The start date for timeseries or fluctuation (optional)
   */
  start_date?: string;

  /**
   * The end date for timeseries or fluctuation (optional)
   */
  end_date?: string;

  /**
   * The UNIX timestamp when the rates were collected
   */
  timestamp?: number;

  /**
   * The base currency code
   */
  base?: string;

  /**
   * The exchange rates
   */
  rates?: {
    [currencyCode: string]:
      | number
      | {
          [date: string]: number;
        }
      | {
          start_rate: number;
          end_rate: number;
          change: number;
          change_pct: number;
        };
  };

  /**
   * The query parameters (for conversion)
   */
  query?: {
    from: string;
    to: string;
    amount: number;
    date?: string;
  };

  /**
   * The conversion result (for conversion)
   */
  result?: number;

  /**
   * Additional rate information (for conversion)
   */
  info?: {
    rate: number;
    timestamp: number;
  };

  /**
   * Error information (if success is false)
   */
  error?: {
    code: number;
    info: string;
  };
}
