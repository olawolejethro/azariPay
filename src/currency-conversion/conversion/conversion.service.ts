// src/currency-conversion/currency-conversion.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { RedisService } from '../../common/redis/redis.service';
import {
  ConvertCurrencyDto,
  ConversionResultDto,
  MobileConvertDto,
  MobileConversionResponseDto,
} from './dto/convert.dto';
import { ExchangeRatesApiResponse } from '../exchange-rates-api/interfaces/exchange-rates-api-response.interface';
import { PagaService } from 'src/wallets/services/paga.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NGNWalletEntity } from 'src/wallets/entities/NGNwallet.entity';
import { CADWalletEntity } from 'src/wallets/entities/CADwallet.entity';
import { DataSource } from 'typeorm';
import { User } from 'src/auth/entities/user.entity';
import { FeeManagementService } from 'src/metadata/services/fee-management.service';
import { EncryptionService } from 'src/common/encryption/encryption.service';
import {
  TransactionEntity,
  TransactionStatus,
  TransactionType,
} from 'src/wallets/entities/transaction.entity';

@Injectable()
export class CurrencyConversionService {
  private readonly logger = new Logger(CurrencyConversionService.name);
  private readonly baseUrl = 'https://api.exchangeratesapi.io/v1';
  private readonly apiKey: string;
  private readonly axiosInstance: AxiosInstance;

  constructor(
    @InjectRepository(NGNWalletEntity)
    private readonly ngnWalletRepository: Repository<NGNWalletEntity>,
    @InjectRepository(CADWalletEntity)
    private readonly cadWalletRepository: Repository<CADWalletEntity>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly feeService: FeeManagementService,
    private readonly encryptionService: EncryptionService,
    private readonly pagaService: PagaService, // Inject your PagaService or other wallet service
    private readonly dataSource: DataSource, // Inject DataSource here
  ) {
    this.apiKey = this.configService.get<string>('EXCHANGE_RATES_API_KEY');
    if (!this.apiKey) {
      this.logger.error(
        'EXCHANGE_RATES_API_KEY is not defined in environment variables',
      );
    }

    // Create an Axios instance with default configuration
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 50000, // 10 seconds timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Convert currency using the Exchange Rates API and update user's wallet
   * @param userId User ID for wallet lookup
   * @param from Source currency code
   * @param to Target currency code
   * @param amount Amount to convert
   * @param date Optional date for historical conversion
   * @returns Conversion result with updated wallet info
   */

  async convertNGN(
    userId: number,
    from: string,
    to: string,
    amount: number,
    date?: string,
    sessionId?: string,
    sessionDateTime?: Date,
  ): Promise<any> {
    const url = '/convert';

    const params = {
      access_key: this.apiKey,
      from,
      to,
      amount,
      ...(date && { date }),
    };

    // Start a transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validate currencies are supported
      const supportedFromCurrencies = ['NGN', 'USD', 'EUR', 'GBP']; // Add more as needed
      const supportedToCurrencies = ['CAD', 'USD', 'EUR', 'GBP', 'NGN']; // Add more as needed

      if (!supportedFromCurrencies.includes(from)) {
        throw new Error(`Source currency ${from} is not supported`);
      }

      if (!supportedToCurrencies.includes(to)) {
        throw new Error(`Target currency ${to} is not supported`);
      }

      // Get user's source currency wallet
      const sourceWallet = await this.getWalletByCurrency(userId, from);
      if (!sourceWallet) {
        throw new Error(`No ${from} wallet found for this user`);
      }

      // Get user's destination currency wallet
      const destinationWallet = await this.getWalletByCurrency(userId, to);
      if (!destinationWallet) {
        throw new Error(`No ${to} wallet found for this user`);
      }

      // GET FEE - Based on transaction type and source currency
      const feeAmount = await this.feeService.getFeeForTransaction(
        'currency_conversion',
        from,
      );

      // Calculate total amount needed (original amount + fee)
      const totalAmountNeeded = Number((amount + feeAmount).toFixed(2));

      // Check if user has sufficient balance including fee
      if (sourceWallet.balance < totalAmountNeeded) {
        throw new Error(
          `Insufficient fund. Required: ${this.getCurrencySymbol(from)}${totalAmountNeeded} (Amount: ${this.getCurrencySymbol(from)}${amount} + Fee: ${this.getCurrencySymbol(from)}${feeAmount}), Available: ${this.getCurrencySymbol(from)}${sourceWallet.balance}`,
        );
      }

      // Check minimum conversion amount (equivalent of 10 in target currency)
      const minTargetAmount = 10.0;

      // Get current exchange rate for minimum amount check
      const rateResponse = await this.axiosInstance.get('/convert', {
        params: {
          access_key: this.apiKey,
          from: from,
          to: to,
          amount: 1,
        },
      });

      const exchangeRate = rateResponse.data?.info?.rate;
      if (!exchangeRate) {
        throw new Error(
          `Unable to fetch ${from} to ${to} exchange rate for minimum amount check`,
        );
      }

      const minSourceAmount = minTargetAmount / exchangeRate;
      if (amount < minSourceAmount) {
        throw new Error(
          `Minimum amount is ${this.getCurrencySymbol(to)}${minTargetAmount} (equivalent to ${this.getCurrencySymbol(from)}${minSourceAmount.toFixed(2)})`,
        );
      }

      // Make the conversion API call
      const response = await this.axiosInstance.get(url, { params });
      const conversionResult = response.data;

      if (!conversionResult.success) {
        throw new Error(
          `Currency conversion failed: ${conversionResult.error?.info || 'Unknown error'}`,
        );
      }

      // Format the conversion result to exactly two decimal places
      const convertedAmount = Number(conversionResult.result.toFixed(2));
      const formattedRate = Number(conversionResult.info.rate);

      // Convert wallet balances to numbers first
      const currentSourceBalance = parseFloat(sourceWallet.balance.toString());
      const currentDestBalance = parseFloat(
        destinationWallet.balance.toString(),
      );

      // Calculate new balances (deduct original amount + fee from source wallet)
      const newSourceBalance = Number(
        (currentSourceBalance - totalAmountNeeded).toFixed(2),
      );
      const newDestBalance = Number(
        (currentDestBalance + convertedAmount).toFixed(2),
      );

      // Update wallet balances using query runner
      sourceWallet.balance = newSourceBalance;
      destinationWallet.balance = newDestBalance;

      await queryRunner.manager.save(sourceWallet);
      await queryRunner.manager.save(destinationWallet);

      // Get user details
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      const userFullName = user
        ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
        : 'User';

      // Generate unique identifiers for the conversion
      const conversionId = `CONV_${Date.now()}_${userId}`;
      const timestamp = Date.now();

      // Generate receipt numbers
      const debitReceiptNumber = this.generateReceiptNumber('DEBIT', timestamp);
      const creditReceiptNumber = this.generateReceiptNumber(
        'CREDIT',
        timestamp,
      );
      const feeReceiptNumber = this.generateReceiptNumber('FEE', timestamp);

      // Generate external transaction IDs
      const debitExternalTxId = this.generateExternalTransactionId(
        'DEBIT',
        timestamp,
      );
      const creditExternalTxId = this.generateExternalTransactionId(
        'CREDIT',
        timestamp,
      );
      const feeExternalTxId = this.generateExternalTransactionId(
        'FEE',
        timestamp,
      );

      const reference = this.generateReference(conversionId);

      // Create debit transaction record for source wallet (original amount only)
      const debitTransaction = queryRunner.manager.create('TransactionEntity', {
        userId: userId,
        amount: Number(amount),
        currency: from,
        type: 'DEBIT_CONVERSION',
        reference: reference,
        referenceHash: reference
          ? this.encryptionService.hash(reference)
          : null,
        description: `Currency conversion from ${from} to ${to} - Amount debited: ${this.getCurrencySymbol(from)}${amount}`,
        receiptNumber: debitReceiptNumber,
        externalTransactionId: debitExternalTxId,
        status: 'COMPLETED',
        refrence: reference,
        balanceAfter: newSourceBalance,
        metadata: {
          conversionId: conversionId,
          transactionType: 'currency_conversion_debit',
          fromCurrency: from,
          toCurrency: to,
          originalAmount: amount,
          convertedAmount: convertedAmount,
          exchangeRate: formattedRate,
          userName: userFullName,
          conversionTimestamp: new Date().toISOString(),
          apiProvider: 'fixer_api',
          receivingWallet: `${destinationWallet.currency} wallet`,
          sessionId: sessionId,
          feeAmount: feeAmount,
        },
      });
      await queryRunner.manager.save(debitTransaction);

      // Create fee transaction record
      // const feeTransaction = queryRunner.manager.create('TransactionEntity', {
      //   userId: userId,
      //   amount: Number(feeAmount),
      //   currency: from,
      //   type: 'FEE_CONVERSION',
      //   reference: reference,
      //   description: `Conversion fee for ${from} to ${to} transaction - Fee: ${this.getCurrencySymbol(from)}${feeAmount}`,
      //   receiptNumber: feeReceiptNumber,
      //   externalTransactionId: feeExternalTxId,
      //   status: 'COMPLETED',
      //   refrence: reference,
      //   balanceAfter: newSourceBalance,
      //   metadata: {
      //     conversionId: conversionId,
      //     transactionType: 'currency_conversion_fee',
      //     fromCurrency: from,
      //     toCurrency: to,
      //     originalAmount: amount,
      //     feeAmount: feeAmount,
      //     userName: userFullName,
      //     conversionTimestamp: new Date().toISOString(),
      //     sessionId: sessionId,
      //   },
      // });
      // await queryRunner.manager.save(feeTransaction);

      // Create credit transaction record for destination wallet
      const creditTransaction = queryRunner.manager.create(
        'TransactionEntity',
        {
          userId: userId,
          amount: Number(convertedAmount),
          currency: to,
          type: 'CREDIT_CONVERSION',
          reference: reference,
          referenceHash: reference
            ? this.encryptionService.hash(reference)
            : null,
          description: `Currency conversion from ${from} to ${to} - Amount credited: ${this.getCurrencySymbol(to)}${convertedAmount}`,
          receiptNumber: creditReceiptNumber,
          externalTransactionId: creditExternalTxId,
          status: 'COMPLETED',
          refrence: reference,
          balanceAfter: newDestBalance,
          metadata: {
            conversionId: conversionId,
            transactionType: 'currency_conversion_credit',
            fromCurrency: from,
            toCurrency: to,
            originalAmount: amount,
            convertedAmount: convertedAmount,
            exchangeRate: formattedRate,
            userName: userFullName,
            conversionTimestamp: new Date().toISOString(),
            apiProvider: 'fixer_api',
            sessionId: sessionId,
            relatedFeeAmount: feeAmount,
          },
        },
      );
      await queryRunner.manager.save(creditTransaction);

      // Commit the transaction
      await queryRunner.commitTransaction();

      this.logger.log(
        `💱 Currency conversion completed for user ${userId}: ${this.getCurrencySymbol(from)}${amount} → ${this.getCurrencySymbol(to)}${convertedAmount} (Rate: ${formattedRate}, Fee: ${this.getCurrencySymbol(from)}${feeAmount})`,
      );

      const formattedResult = {
        ...conversionResult,
        result: convertedAmount,
        info: {
          ...conversionResult.info,
          rate: formattedRate,
        },
        feeDetails: {
          feeAmount: feeAmount,
          feeCurrency: from,
          totalDeducted: totalAmountNeeded,
          originalAmount: amount,
          sourceCurrency: from,
          targetCurrency: to,
        },
      };
      formattedResult.receivingWallet = `${destinationWallet.currency} wallet`;

      return formattedResult;
    } catch (error) {
      // Rollback transaction on error
      await queryRunner.rollbackTransaction();

      this.logger.error(
        `Currency conversion error: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(error.message);
    } finally {
      // Release query runner
      await queryRunner.release();
    }
  }

  async convertCurrency(
    userId: number,
    from: string,
    to: string,
    amount: number,
    date?: string,
    sessionId?: string,
    sessionDateTime?: Date,
  ): Promise<any> {
    const url = '/convert';

    const params = {
      access_key: this.apiKey,
      from,
      to,
      amount,
      ...(date && { date }),
    };

    // Start a transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validate currencies are supported
      const supportedFromCurrencies = ['NGN', 'CAD', 'USD', 'EUR', 'GBP'];
      const supportedToCurrencies = ['CAD', 'NGN', 'USD', 'EUR', 'GBP'];

      if (!supportedFromCurrencies.includes(from)) {
        throw new Error(`Source currency ${from} is not supported`);
      }

      if (!supportedToCurrencies.includes(to)) {
        throw new Error(`Target currency ${to} is not supported`);
      }

      // Get user's source currency wallet
      const sourceWallet = await this.getWalletByCurrency(userId, from);
      if (!sourceWallet) {
        throw new Error(`No ${from} wallet found for this user`);
      }

      // Get user's destination currency wallet
      const destinationWallet = await this.getWalletByCurrency(userId, to);
      if (!destinationWallet) {
        throw new Error(`No ${to} wallet found for this user`);
      }

      // GET FEE - Based on transaction type and source currency
      const feeAmount = await this.feeService.getFeeForTransaction(
        'currency_conversion',
        from,
      );

      // Calculate total amount needed (original amount + fee)
      const totalAmountNeeded = Number((amount + feeAmount).toFixed(2));

      // Check if user has sufficient balance including fee
      if (sourceWallet.balance < totalAmountNeeded) {
        throw new Error(
          `Insufficient fund. Required: ${this.getCurrencySymbol(from)}${totalAmountNeeded} (Amount: ${this.getCurrencySymbol(from)}${amount} + Fee: ${this.getCurrencySymbol(from)}${feeAmount}), Available: ${this.getCurrencySymbol(from)}${sourceWallet.balance}`,
        );
      }

      // Dynamic minimum conversion amount check
      const minTargetAmount = 10.0;

      // Get current exchange rate for minimum amount check
      const rateResponse = await this.axiosInstance.get('/convert', {
        params: {
          access_key: this.apiKey,
          from: from,
          to: to,
          amount: 1,
        },
      });

      const exchangeRate = rateResponse.data?.info?.rate;
      if (!exchangeRate) {
        throw new Error(
          `Unable to fetch ${from} to ${to} exchange rate for minimum amount check`,
        );
      }

      const minSourceAmount = minTargetAmount / exchangeRate;
      if (amount < minSourceAmount) {
        throw new Error(
          `Minimum amount is ${this.getCurrencySymbol(to)}${minTargetAmount} (equivalent to ${this.getCurrencySymbol(from)}${minSourceAmount.toFixed(2)})`,
        );
      }

      // Make the conversion API call
      const response = await this.axiosInstance.get(url, { params });
      const conversionResult = response.data;

      if (!conversionResult.success) {
        throw new Error(
          `Currency conversion failed: ${conversionResult.error?.info || 'Unknown error'}`,
        );
      }

      // Format the conversion result to exactly two decimal places
      const convertedAmount = Number(conversionResult.result.toFixed(2));
      const formattedRate = Number(conversionResult.info.rate);

      // Convert wallet balances to numbers first
      const currentSourceBalance = parseFloat(sourceWallet.balance.toString());
      const currentDestBalance = parseFloat(
        destinationWallet.balance.toString(),
      );

      // Calculate new balances (deduct original amount + fee from source wallet)
      const newSourceBalance = Number(
        (currentSourceBalance - totalAmountNeeded).toFixed(2),
      );
      const newDestBalance = Number(
        (currentDestBalance + convertedAmount).toFixed(2),
      );

      // Update wallet balances using query runner
      sourceWallet.balance = newSourceBalance;
      destinationWallet.balance = newDestBalance;

      await queryRunner.manager.save(sourceWallet);
      await queryRunner.manager.save(destinationWallet);

      // Get user details
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      const userFullName = user
        ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
        : 'User';

      // Generate unique identifiers for the conversion
      const conversionId = `CONV_${Date.now()}_${userId}`;
      const timestamp = Date.now();

      // Generate receipt numbers
      const debitReceiptNumber = this.generateReceiptNumber('DEBIT', timestamp);
      const creditReceiptNumber = this.generateReceiptNumber(
        'CREDIT',
        timestamp,
      );
      const feeReceiptNumber = this.generateReceiptNumber('FEE', timestamp);

      // Generate external transaction IDs
      const debitExternalTxId = this.generateExternalTransactionId(
        'DEBIT',
        timestamp,
      );
      const creditExternalTxId = this.generateExternalTransactionId(
        'CREDIT',
        timestamp,
      );
      const feeExternalTxId = this.generateExternalTransactionId(
        'FEE',
        timestamp,
      );

      const reference = this.generateReference(conversionId);

      // Create debit transaction record for source wallet (original amount only)
      const debitTransaction = queryRunner.manager.create(TransactionEntity, {
        userId: userId,
        amount: Number(amount),
        currency: from as any, // or cast properly based on your currency enum
        type: TransactionType.DEBIT_CONVERSION, // ✅ Use enum, not string
        reference: reference,
        referenceHash: reference
          ? this.encryptionService.hash(reference)
          : null,
        description: `Currency conversion from ${from} to ${to} - Amount debited: ${this.getCurrencySymbol(from)}${amount}`,
        receiptNumber: debitReceiptNumber,
        externalTransactionId: debitExternalTxId,
        status: TransactionStatus.COMPLETED, // ✅ Use enum, not string
        balanceAfter: newSourceBalance,
        metadata: {
          conversionId: conversionId,
          transactionType: 'currency_conversion_debit',
          fromCurrency: from,
          toCurrency: to,
          originalAmount: amount,
          convertedAmount: convertedAmount,
          exchangeRate: formattedRate,
          userName: userFullName,
          conversionTimestamp: new Date().toISOString(),
          apiProvider: 'exchanche_rates_api',
          receivingWallet: `${destinationWallet.currency} wallet`,
          sessionId: sessionId,
          feeAmount: feeAmount,
        },
      });
      await queryRunner.manager.save(debitTransaction);

      // ✅ CORRECT - Credit Transaction
      const creditTransaction = queryRunner.manager.create(TransactionEntity, {
        userId: userId,
        amount: Number(convertedAmount),
        currency: to as any, // or cast properly based on your currency enum
        type: TransactionType.CREDIT_CONVERSION, // ✅ Use enum, not string
        reference: reference,
        referenceHash: reference
          ? this.encryptionService.hash(reference)
          : null,
        description: `Currency conversion from ${from} to ${to} - Amount credited: ${this.getCurrencySymbol(to)}${convertedAmount}`,
        receiptNumber: creditReceiptNumber,
        externalTransactionId: creditExternalTxId,
        status: TransactionStatus.COMPLETED, // ✅ Use enum, not string
        balanceAfter: newDestBalance,
        metadata: {
          conversionId: conversionId,
          transactionType: 'currency_conversion_credit',
          fromCurrency: from,
          toCurrency: to,
          originalAmount: amount,
          convertedAmount: convertedAmount,
          exchangeRate: formattedRate,
          userName: userFullName,
          conversionTimestamp: new Date().toISOString(),
          apiProvider: 'fixer_api',
          sessionId: sessionId,
          relatedFeeAmount: feeAmount,
        },
      });
      await queryRunner.manager.save(creditTransaction);

      // Commit the transaction
      await queryRunner.commitTransaction();

      this.logger.log(
        `💱 Currency conversion completed for user ${userId}: ${this.getCurrencySymbol(from)}${amount} → ${this.getCurrencySymbol(to)}${convertedAmount} (Rate: ${formattedRate}, Fee: ${this.getCurrencySymbol(from)}${feeAmount})`,
      );

      const formattedResult = {
        ...conversionResult,
        result: convertedAmount,
        info: {
          ...conversionResult.info,
          rate: formattedRate,
        },
        feeDetails: {
          feeAmount: feeAmount,
          feeCurrency: from,
          totalDeducted: totalAmountNeeded,
          originalAmount: amount,
          sourceCurrency: from,
          targetCurrency: to,
        },
      };
      formattedResult.receivingWallet = `${destinationWallet.currency} wallet`;

      return formattedResult;
    } catch (error) {
      // Rollback transaction on error
      await queryRunner.rollbackTransaction();

      this.logger.error(
        `Currency conversion error: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(error.message);
    } finally {
      // Release query runner
      await queryRunner.release();
    }
  }
  // Helper function to get wallet by currency
  private async getWalletByCurrency(
    userId: number,
    currency: string,
  ): Promise<any> {
    switch (currency.toUpperCase()) {
      case 'NGN':
        const ngnWallets = await this.pagaService.findWalletsByUserId(userId);
        return ngnWallets && ngnWallets.length > 0 ? ngnWallets[0] : null;

      case 'CAD':
        const cadWallets = await this.pagaService.getCADwalletById(userId);
        return cadWallets && cadWallets.length > 0 ? cadWallets[0] : null;

      case 'USD':
        // Implement USD wallet retrieval
        // const usdWallets = await this.pagaService.getUSDwalletById(userId);
        // return usdWallets && usdWallets.length > 0 ? usdWallets[0] : null;
        throw new Error('USD wallet support not yet implemented');

      case 'EUR':
        // Implement EUR wallet retrieval
        // const eurWallets = await this.pagaService.getEURwalletById(userId);
        // return eurWallets && eurWallets.length > 0 ? eurWallets[0] : null;
        throw new Error('EUR wallet support not yet implemented');

      case 'GBP':
        // Implement GBP wallet retrieval
        // const gbpWallets = await this.pagaService.getGBPwalletById(userId);
        // return gbpWallets && gbpWallets.length > 0 ? gbpWallets[0] : null;
        throw new Error('GBP wallet support not yet implemented');

      default:
        throw new Error(`Unsupported currency: ${currency}`);
    }
  }

  // Helper function to get currency symbols
  private getCurrencySymbol(currency: string): string {
    const symbols = {
      NGN: '₦',
      CAD: '$',
      USD: '$',
      EUR: '€',
      GBP: '£',
    };

    return symbols[currency.toUpperCase()] || currency.toUpperCase() + ' ';
  }
  /**
   * Convert currency using the Exchange Rates API
   * @param from Source currency code
   * @param to Target currency code
   * @param amount Amount to convert
   * @param date Optional date for historical conversion
   * @returns Conversion result
   */

  async checkConvertCurrency(
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
      const data = response.data;

      // Format the result and rate to two decimal places
      if (data.success && data.result) {
        data.result = Number(data.result.toFixed(2));
      }

      if (data.success && data.info && data.info.rate) {
        data.info.rate = Number(data.info.rate.toFixed(2));
      }

      return data;
    } catch (error) {
      throw new InternalServerErrorException('Failed to convert currency');
    }
  }

  /**
   * Convert CAD to NGN with wallet updates
   */
  async convertCAD(
    userId: number,
    from: string,
    to: string,
    amount: number,
    date?: string,
    sessionId?: string,
    sessionDateTime?: Date,
  ): Promise<any> {
    const url = '/convert';

    const params = {
      access_key: this.apiKey,
      from,
      to,
      amount,
      ...(date && { date }),
    };

    // Start a transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validate conversion direction
      if (from !== 'CAD' || to !== 'NGN') {
        throw new Error('This endpoint only supports CAD to NGN conversion');
      }

      // Get user's CAD wallet
      const cadWallet = await this.pagaService.getCADwalletById(userId);
      if (!cadWallet) {
        throw new Error('No CAD wallet found for this user');
      }
      const sourceWallet = cadWallet[0];

      // Get user's NGN wallet
      const ngnWallets = await this.pagaService.findWalletsByUserId(userId);
      if (!ngnWallets || ngnWallets.length === 0) {
        throw new Error('No NGN wallet found for this user');
      }
      const destinationWallet = ngnWallets[0];

      // GET FEE - Based on source currency (CAD)
      const feeAmount = await this.feeService.getFeeForTransaction(
        'currency_conversion',
        from,
      );

      // Calculate total amount needed (original amount + fee)
      const totalAmountNeeded = Number((amount + feeAmount).toFixed(2));

      // Check if user has sufficient balance including fee
      if (sourceWallet.balance < totalAmountNeeded) {
        throw new Error(
          `Insufficient fund. Required: $${totalAmountNeeded} (Amount: $${amount} + Fee: $${feeAmount}), Available: $${sourceWallet.balance}`,
        );
      }

      // Check minimum conversion amount for CAD
      if (amount < 10) {
        throw new Error('Minimum amount is 10 CAD');
      }

      // Make the conversion API call
      const response = await this.axiosInstance.get(url, { params });
      const conversionResult = response.data;

      if (!conversionResult.success) {
        throw new Error(
          `Currency conversion failed: ${conversionResult.error?.info || 'Unknown error'}`,
        );
      }

      // Format the conversion result to exactly two decimal places
      const convertedAmount = Number(conversionResult.result.toFixed(2));
      const formattedRate = Number(conversionResult.info.rate);

      // Convert string/Decimal values to numbers first
      const currentCadBalance = parseFloat(sourceWallet.balance.toString());
      const currentNgnBalance = parseFloat(
        destinationWallet.balance.toString(),
      );

      // Calculate new balances (deduct original amount + fee from CAD wallet)
      const newCadBalance = Number(
        (currentCadBalance - totalAmountNeeded).toFixed(2),
      );
      const newNgnBalance = Number(
        (currentNgnBalance + convertedAmount).toFixed(2),
      );

      // Update wallet balances using query runner
      sourceWallet.balance = newCadBalance;
      destinationWallet.balance = newNgnBalance;

      await queryRunner.manager.save(sourceWallet);
      await queryRunner.manager.save(destinationWallet);

      // Get user details for transaction metadata
      const user = await this.userRepository.findOne({ where: { id: userId } });

      const userFullName = user
        ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
        : 'User';

      // Generate unique identifiers for the conversion
      const conversionId = `CONV_${Date.now()}_${userId}`;
      const timestamp = Date.now();

      // Generate receipt numbers
      const debitReceiptNumber = this.generateReceiptNumber('DEBIT', timestamp);
      const creditReceiptNumber = this.generateReceiptNumber(
        'CREDIT',
        timestamp,
      );
      const feeReceiptNumber = this.generateReceiptNumber('FEE', timestamp);

      // Generate external transaction IDs
      const debitExternalTxId = this.generateExternalTransactionId(
        'DEBIT',
        timestamp,
      );
      const creditExternalTxId = this.generateExternalTransactionId(
        'CREDIT',
        timestamp,
      );
      const feeExternalTxId = this.generateExternalTransactionId(
        'FEE',
        timestamp,
      );

      const reference = this.generateReference(conversionId);

      // Create debit transaction record for CAD wallet (original amount only)
      const debitTransaction = queryRunner.manager.create('TransactionEntity', {
        userId: userId,
        amount: Number(amount),
        currency: from, // CAD
        type: 'DEBIT_CONVERSION',
        reference: reference,
        referenceHash: reference
          ? this.encryptionService.hash(reference)
          : null,
        description: `Currency conversion from ${from} to ${to} - Amount debited: $${amount}`,
        receiptNumber: debitReceiptNumber,
        externalTransactionId: debitExternalTxId,
        status: 'COMPLETED',
        refrence: reference,
        balanceAfter: newCadBalance,
        metadata: {
          conversionId: conversionId,
          transactionType: 'currency_conversion_debit',
          fromCurrency: from,
          toCurrency: to,
          originalAmount: amount,
          convertedAmount: convertedAmount,
          exchangeRate: formattedRate,
          userName: userFullName,
          conversionTimestamp: new Date().toISOString(),
          apiProvider: 'fixer_api',
          receivingWallet: `${destinationWallet.currency} wallet`,
          sessionId: sessionId,
          feeAmount: feeAmount,
        },
      });
      await queryRunner.manager.save(debitTransaction);

      // Create fee transaction record
      // const feeTransaction = queryRunner.manager.create('TransactionEntity', {
      //   userId: userId,
      //   amount: Number(feeAmount),
      //   currency: from, // CAD
      //   type: 'FEE_CONVERSION',
      //   reference: reference,
      //   description: `Conversion fee for ${from} to ${to} transaction - Fee: $${feeAmount}`,
      //   receiptNumber: feeReceiptNumber,
      //   externalTransactionId: feeExternalTxId,
      //   status: 'COMPLETED',
      //   refrence: reference,
      //   balanceAfter: newCadBalance,
      //   metadata: {
      //     conversionId: conversionId,
      //     transactionType: 'currency_conversion_fee',
      //     fromCurrency: from,
      //     toCurrency: to,
      //     originalAmount: amount,
      //     feeAmount: feeAmount,
      //     userName: userFullName,
      //     conversionTimestamp: new Date().toISOString(),
      //     sessionId: sessionId,
      //   },
      // });
      // await queryRunner.manager.save(feeTransaction);

      // Create credit transaction record for NGN wallet (destination)
      const creditTransaction = queryRunner.manager.create(
        'TransactionEntity',
        {
          userId: userId,
          amount: Number(convertedAmount),
          currency: to, // NGN
          type: 'CREDIT_CONVERSION',
          reference: reference,
          referenceHash: reference
            ? this.encryptionService.hash(reference)
            : null,
          description: `Currency conversion from ${from} to ${to} - Amount credited: ₦${convertedAmount}`,
          receiptNumber: creditReceiptNumber,
          externalTransactionId: creditExternalTxId,
          status: 'COMPLETED',
          refrence: reference,
          balanceAfter: newNgnBalance,
          metadata: {
            conversionId: conversionId,
            transactionType: 'currency_conversion_credit',
            fromCurrency: from,
            toCurrency: to,
            originalAmount: amount,
            convertedAmount: convertedAmount,
            exchangeRate: formattedRate,
            userName: userFullName,
            conversionTimestamp: new Date().toISOString(),
            apiProvider: 'fixer_api',
            sessionId: sessionId,
            relatedFeeAmount: feeAmount,
          },
        },
      );
      await queryRunner.manager.save(creditTransaction);

      // Commit the transaction
      await queryRunner.commitTransaction();

      this.logger.log(
        `💱 Currency conversion completed for user ${userId}: $${amount} → ₦${convertedAmount} (Rate: ${formattedRate}, Fee: $${feeAmount})`,
      );

      const formattedResult = {
        ...conversionResult,
        result: convertedAmount,
        info: {
          ...conversionResult.info,
          rate: formattedRate,
        },
        feeDetails: {
          feeAmount: feeAmount,
          feeCurrency: from, // CAD
          totalDeducted: totalAmountNeeded,
          originalAmount: amount,
          sourceCurrency: from,
          targetCurrency: to,
        },
      };
      formattedResult.receivingWallet = `${destinationWallet.currency} wallet`;

      return formattedResult;
    } catch (error) {
      // Rollback transaction on error
      await queryRunner.rollbackTransaction();

      this.logger.error(
        `Currency conversion error: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(error.message);
    } finally {
      // Release query runner
      await queryRunner.release();
    }
  }

  // FIXED: Updated helper methods to generate unique identifiers
  private generateReceiptNumber(
    type: 'DEBIT' | 'CREDIT' | 'FEE',
    timestamp: number,
  ): string {
    const randomSuffix = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `RCP${type}_${timestamp}_${randomSuffix}`;
  }

  private generateExternalTransactionId(
    type: 'DEBIT' | 'CREDIT' | 'FEE',
    timestamp: number,
  ): string {
    const randomSuffix = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `EXT${type}_${timestamp}_${randomSuffix}`;
  }

  private generateReference(identifier: string): string {
    return `REF_${identifier}_${Date.now()}`;
  }
  //   /**
  //    * Convert currency with Redis caching
  //    */
  //   async convertCurrency(
  //     convertDto: ConvertCurrencyDto,
  //   ): Promise<ConversionResultDto> {
  //     const { from, to, amount, date } = convertDto;

  //     // Create cache key based on parameters
  //     const cacheKey = `convert:${from}:${to}:${amount}:${date || 'latest'}`;

  //     // Try to get from cache first
  //     const cachedResult = await this.redisService.getClient().get(cacheKey);
  //     if (cachedResult) {
  //       this.logger.debug(`Cache hit for ${cacheKey}`);
  //       return JSON.parse(cachedResult);
  //     }

  //     this.logger.debug(`Cache miss for ${cacheKey}`);

  //     try {
  //       // Try the primary conversion endpoint
  //       const result = await this.callConversionApi(from, to, amount, date);

  //       // Cache the result for 1 hour
  //       if (result.success) {
  //         await this.redisService
  //           .getClient()
  //           .set(cacheKey, JSON.stringify(result), 'EX', 3600);
  //       }

  //       return result;
  //     } catch (error) {
  //       this.logger.warn(
  //         `Primary conversion failed, trying fallback: ${error.message}`,
  //       );

  //       try {
  //         // Try fallback method if primary fails
  //         const fallbackResult = await this.callConversionApiFallback(
  //           from,
  //           to,
  //           amount,
  //           date,
  //         );

  //         // Cache the fallback result
  //         if (fallbackResult.success) {
  //           await this.redisService
  //             .getClient()
  //             .set(cacheKey, JSON.stringify(fallbackResult), 'EX', 3600);
  //         }

  //         return fallbackResult;
  //       } catch (fallbackError) {
  //         this.logger.error(
  //           `Fallback conversion also failed: ${fallbackError.message}`,
  //         );
  //         throw fallbackError;
  //       }
  //     }
  //   }

  /**
   * Call the conversion API directly using Axios
   */
  private async callConversionApi(
    from: string,
    to: string,
    amount: number,
    date?: string,
  ): Promise<any> {
    // Tracking API call limit in Redis
    const apiLimitKey = `api_calls:${new Date().toISOString().split('T')[0]}`;
    const currentCalls = await this.redisService.getClient().get(apiLimitKey);
    const maxCallsPerDay = this.configService.get<number>(
      'MAX_API_CALLS_PER_DAY',
      1000,
    );

    if (currentCalls && parseInt(currentCalls, 10) >= maxCallsPerDay) {
      this.logger.warn(
        `API call limit reached: ${currentCalls}/${maxCallsPerDay}`,
      );
      throw new BadRequestException('API call limit reached for today.');
    }

    const params = {
      access_key: this.apiKey,
      from,
      to,
      amount,
      ...(date && { date }),
    };

    try {
      const response = await this.axiosInstance.get('/convert', { params });

      // Increment API call counter
      await this.redisService.getClient().incr(apiLimitKey);
      // Set expiration if key is new (86400 seconds = 24 hours)
      await this.redisService.getClient().expire(apiLimitKey, 86400);

      return response.data;
    } catch (error) {
      this.logger.error(`Error in callConversionApi: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fallback method in case the primary conversion endpoint fails
   */
  private async callConversionApiFallback(
    from: string,
    to: string,
    amount: number,
    date?: string,
  ): Promise<any> {
    const endpoint = date ? 'historical' : 'latest';

    // Check API call limit in Redis
    const apiLimitKey = `api_calls:${new Date().toISOString().split('T')[0]}`;
    const currentCalls = await this.redisService.getClient().get(apiLimitKey);
    const maxCallsPerDay = this.configService.get<number>(
      'MAX_API_CALLS_PER_DAY',
      1000,
    );

    if (currentCalls && parseInt(currentCalls, 10) >= maxCallsPerDay) {
      this.logger.warn(
        `API call limit reached: ${currentCalls}/${maxCallsPerDay}`,
      );
      throw new BadRequestException('API call limit reached for today.');
    }

    const params = {
      access_key: this.apiKey,
      base: from,
      symbols: to,
      ...(date && { date }),
    };

    try {
      const response = await this.axiosInstance.get(`/${endpoint}`, { params });
      const data = response.data;

      // Increment API call counter
      await this.redisService.getClient().incr(apiLimitKey);
      // Set expiration if key is new (86400 seconds = 24 hours)
      await this.redisService.getClient().expire(apiLimitKey, 86400);

      if (!data.success) {
        throw new Error(`API error: ${data.error?.info || 'Unknown error'}`);
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
      this.logger.error(`Error in callConversionApiFallback: ${error.message}`);
      throw error;
    }
  }

  //   /**
  //    * Mobile app specific conversion with rate history
  //    */
  //   async convertForMobile(
  //     convertDto: MobileConvertDto,
  //   ): Promise<MobileConversionResponseDto> {
  //     try {
  //       // Create a session ID for this conversion
  //       const sessionId = `mobile_conversion_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  //       // Use existing conversion method
  //       const conversionResult = await this.convertCurrency({
  //         from: convertDto.fromCurrency,
  //         to: convertDto.toCurrency,
  //         amount: convertDto.amount,
  //       });

  //       // Get rate history for the last 7 days
  //       const rateHistory = await this.getRateHistoryForWeek(
  //         convertDto.fromCurrency,
  //         convertDto.toCurrency,
  //       );

  //       // Store the conversion result in Redis for potential followup operations
  //       // with a 30-minute TTL
  //       await this.redisService.getClient().set(
  //         `mobile_conversion:${sessionId}`,
  //         JSON.stringify({
  //           fromCurrency: convertDto.fromCurrency,
  //           toCurrency: convertDto.toCurrency,
  //           rate: conversionResult.info.rate,
  //           timestamp: conversionResult.info.timestamp,
  //           date: conversionResult.date,
  //         }),
  //         'EX',
  //         1800,
  //       );

  //       // Format the response to match mobile app requirements
  //       return {
  //         success: conversionResult.success,
  //         fromCurrency: convertDto.fromCurrency,
  //         toCurrency: convertDto.toCurrency,
  //         amount: convertDto.amount,
  //         convertedAmount: conversionResult.result,
  //         rate: conversionResult.info.rate,
  //         timestamp: conversionResult.info.timestamp,
  //         date: conversionResult.date,
  //         rateHistory,
  //         sessionId, // Return the session ID for potential followup operations
  //       };
  //     } catch (error) {
  //       this.logger.error(`Failed to convert for mobile: ${error.message}`);
  //       throw error;
  //     }
  //   }

  /**
   * Get rate history for the last 7 days using Redis cache
//    */
  //   private async getRateHistoryForWeek(
  //     fromCurrency: string,
  //     toCurrency: string,
  //   ): Promise<any> {
  //     // Create cache key for rate history
  //     const cacheKey = `rate_history:${fromCurrency}:${toCurrency}`;

  //     // Try to get from cache first
  //     const cachedHistory = await this.redisService.getClient().get(cacheKey);
  //     if (cachedHistory) {
  //       this.logger.debug(`Cache hit for rate history ${cacheKey}`);
  //       return JSON.parse(cachedHistory);
  //     }

  //     this.logger.debug(`Cache miss for rate history ${cacheKey}`);

  //     const rateHistory = {};
  //     const today = new Date();
  //     let previousRate = null;

  //     // Get rates for last 7 days
  //     for (let i = 6; i >= 0; i--) {
  //       const date = new Date(today);
  //       date.setDate(date.getDate() - i);
  //       const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format

  //       const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
  //         date.getDay()
  //       ];

  //       try {
  //         // Get historical rate for this day
  //         const historicalResult = await this.convertCurrency({
  //           from: fromCurrency,
  //           to: toCurrency,
  //           amount: 1, // We just need the rate
  //           date: dateStr,
  //         });

  //         const rate = historicalResult.info.rate;

  //         // Calculate change from previous day
  //         let change = 0;
  //         if (previousRate !== null) {
  //           change = ((rate - previousRate) / previousRate) * 100;
  //         }

  //         rateHistory[dayName] = {
  //           rate,
  //           change,
  //         };

  //         previousRate = rate;
  //       } catch (error) {
  //         this.logger.error(
  //           `Failed to get rate for ${dateStr}: ${error.message}`,
  //         );
  //         // Use a dummy value if we can't get the real rate
  //         rateHistory[dayName] = {
  //           rate: previousRate || 1,
  //           change: 0,
  //         };
  //       }
  //     }

  //     // Cache the rate history for 1 hour
  //     await this.redisService
  //       .getClient()
  //       .set(cacheKey, JSON.stringify(rateHistory), 'EX', 3600);

  //     return rateHistory;
  //   }

  //   /**
  //    * Get supported currencies with caching
  //    */
  //   async getSupportedCurrencies(): Promise<{ code: string; name: string }[]> {
  //     // Cache key for currencies
  //     const cacheKey = 'supported_currencies';

  //     // Try to get from cache first
  //     const cachedCurrencies = await this.redisService.getClient().get(cacheKey);
  //     if (cachedCurrencies) {
  //       return JSON.parse(cachedCurrencies);
  //     }

  //     // Most commonly used currencies with their names
  //     const currencies = [
  //       { code: 'USD', name: 'US Dollar' },
  //       { code: 'EUR', name: 'Euro' },
  //       { code: 'GBP', name: 'British Pound' },
  //       { code: 'JPY', name: 'Japanese Yen' },
  //       { code: 'AUD', name: 'Australian Dollar' },
  //       { code: 'CAD', name: 'Canadian Dollar' },
  //       { code: 'CHF', name: 'Swiss Franc' },
  //       { code: 'CNY', name: 'Chinese Yuan' },
  //       { code: 'SEK', name: 'Swedish Krona' },
  //       { code: 'NZD', name: 'New Zealand Dollar' },
  //       { code: 'MXN', name: 'Mexican Peso' },
  //       { code: 'SGD', name: 'Singapore Dollar' },
  //       { code: 'HKD', name: 'Hong Kong Dollar' },
  //       { code: 'NOK', name: 'Norwegian Krone' },
  //       { code: 'KRW', name: 'South Korean Won' },
  //       { code: 'TRY', name: 'Turkish Lira' },
  //       { code: 'RUB', name: 'Russian Ruble' },
  //       { code: 'INR', name: 'Indian Rupee' },
  //       { code: 'BRL', name: 'Brazilian Real' },
  //       { code: 'ZAR', name: 'South African Rand' },
  //     ];

  //     // Cache the result for 24 hours
  //     await this.redisService
  //       .getClient()
  //       .set(cacheKey, JSON.stringify(currencies), 'EX', 86400);

  //     return currencies;
  //   }

  //   /**
  //    * Track user conversion history (optional feature)
  //    */
  //   async trackConversion(userId: number, conversionData: any): Promise<void> {
  //     if (!userId) return;

  //     const userHistoryKey = `user_conversions:${userId}`;

  //     // Add conversion to user history list in Redis
  //     // We keep only the last 10 conversions
  //     await this.redisService.getClient().lpush(
  //       userHistoryKey,
  //       JSON.stringify({
  //         ...conversionData,
  //         timestamp: Date.now(),
  //       }),
  //     );

  //     // Trim the list to keep only the most recent 10 items
  //     await this.redisService.getClient().ltrim(userHistoryKey, 0, 9);

  //     // Set expiration to 30 days if key is new
  //     await this.redisService.getClient().expire(userHistoryKey, 2592000);
  //   }

  //   /**
  //    * Get user conversion history (optional feature)
  //    */
  //   async getUserConversionHistory(userId: number): Promise<any[]> {
  //     if (!userId) {
  //       throw new NotFoundException('User ID is required');
  //     }

  //     const userHistoryKey = `user_conversions:${userId}`;

  //     // Get all items from the list
  //     const historyItems = await this.redisService
  //       .getClient()
  //       .lrange(userHistoryKey, 0, -1);

  //     if (!historyItems || historyItems.length === 0) {
  //       return [];
  //     }

  //     // Parse each item
  //     return historyItems.map((item) => JSON.parse(item));
  //   }

  //   /**
  //    * Check if API rate limit is approaching and warn
  //    */
  //   async checkApiRateLimit(): Promise<{
  //     limit: number;
  //     used: number;
  //     remaining: number;
  //   }> {
  //     const apiLimitKey = `api_calls:${new Date().toISOString().split('T')[0]}`;
  //     const currentCalls = await this.redisService.getClient().get(apiLimitKey);
  //     const maxCallsPerDay = this.configService.get<number>(
  //       'MAX_API_CALLS_PER_DAY',
  //       1000,
  //     );

  //     const used = currentCalls ? parseInt(currentCalls, 10) : 0;
  //     const remaining = maxCallsPerDay - used;

  //     if (remaining < maxCallsPerDay * 0.1) {
  //       // Less than 10% remaining
  //       this.logger.warn(
  //         `API call limit is approaching: ${used}/${maxCallsPerDay}`,
  //       );
  //     }

  //     return {
  //       limit: maxCallsPerDay,
  //       used,
  //       remaining,
  //     };
  //   }
}
