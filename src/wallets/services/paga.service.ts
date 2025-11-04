// src/shared/services/paga.service.ts

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { generatePagaReferenceNumber } from '../utils/generate.ref';
import * as bcrypt from 'bcryptjs';

interface PagaAccountRequest {
  accountReference: string;
  referenceNumber: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  callbackUrl?: string;
}

interface ValidateBankAccountRequest {
  amount: number;
  destinationBankUUID: string;
  destinationBankAccountNumber: string;
  currency?: string;
}

interface ValidateBankAccountResponse {
  referenceNumber: string;
  responseCode: string;
  message: string;
  accountNumber: string;
  accountName?: string;
  bankId: string;
  bankName?: string;
  isValidated: boolean;
}
interface BankListResponse {
  responseCode: string;
  message: string;
  banks: Array<{
    uuid: string;
    name: string;
    code: string;
  }>;
}
interface BankDepositRequest {
  amount: number;
  destinationBankUUID: string;
  destinationBankAccountNumber: string;
  remarks?: string;
  currency?: string;
}

interface ValidateMoneyTransferRequest {
  referenceNumber: string;
  amount: number;
  currency: string;
  destinationAccount: string;
}
interface PagaAccountResponse {
  referenceNumber: string;
  accountReference: string;
  accountNumber: string;
  accountName: string;
  status: string;
  responseCode: string;
  message: string;
}

interface BankDepositResponse {
  referenceNumber: string;
  responseCode: string;
  message: string;
  transactionId?: string;
  status: string;
}

interface TransferRequest {
  amount: number;
  currency?: string;
  destinationBankUUID: string;
  destinationBankAccountNumber: string;
  remarks?: string;
}

interface TransferResponse {
  referenceNumber: string;
  responseCode: string | number;
  message: string;
  transactionId?: string;
  status: string;
  recipientName?: string;
  amount?: number | string;
  fee?: number;
  currency?: string;
  destinationAccountHolderNameAtBank?: string;
  remark?: string; // Added remark field
  sessionId?: string;
  vat?: number;
  destinationBankAccount: number | string;
}

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NGNWalletEntity } from '../entities/NGNwallet.entity';
import { BeneficiaryEntity } from '../entities/beneficiary.entity';
import { User } from 'src/auth/entities/user.entity';
import { TransactionService } from './transaction.service';
import {
  TransactionCurrency,
  TransactionEntity,
  TransactionStatus,
  TransactionType,
} from '../entities/transaction.entity';
import { CADWalletEntity } from '../entities/CADwallet.entity';

@Injectable()
export class PagaService {
  private readonly logger = new Logger(PagaService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly pagaBusinessAxiosInstance: AxiosInstance;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(NGNWalletEntity)
    private readonly ngnWalletRepository: Repository<NGNWalletEntity>,
    @InjectRepository(CADWalletEntity)
    private readonly cadWalletRepository: Repository<CADWalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transctionRepository: Repository<TransactionEntity>,
    @InjectRepository(BeneficiaryEntity)
    private readonly beneficiaryRepository: Repository<BeneficiaryEntity>,
    private readonly configService: ConfigService,
  ) {
    const baseURL = this.configService.get<string>('PAGA_API_URL');
    const pagaBussinessBaseUrl = this.configService.get<string>(
      'PAGA_BUSINESS_API_URL',
    );
    const principal = this.configService.get<string>('PAGA_PRINCIPAL');
    const publickey = this.configService.get<string>('PAGA_API_PUBLIC_KEY');
    const secretKey = this.configService.get<string>('PAGA_API_SECTRET_KEY');
    const credentials = `${publickey}:${secretKey}`;
    const token = Buffer.from(credentials).toString('base64');

    this.axiosInstance = axios.create({
      timeout: 180000,
      maxRedirects: 5,
      responseType: 'json',
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        // Accept: 'application/json',
        principal: publickey,
        credentials: secretKey,
        Authorization: `Basic ${token}`,
      },
    });

    this.pagaBusinessAxiosInstance = axios.create({
      timeout: 180000,
      maxRedirects: 5,
      responseType: 'json',
      baseURL: pagaBussinessBaseUrl,
      headers: {
        'Content-Type': 'application/json',
        // Accept: 'application/json',
        principal: publickey,
        credentials: secretKey,
        Authorization: `Basic ${token}`,
      },
    });

    // Add response interceptor for logging
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error(
          'Paga API Error',
          error.response?.data || error.message,
        );
        throw error;
      },
    );
  }

  /**
   * Generates SHA-512 hash for Paga request parameters
   */
  private generateHash(params: string[]): string {
    const hashKey = this.configService.get<string>('PAGA_HASH_KEY');
    const concatenatedParams = params.join('');

    return crypto.createHash('sha512').update(concatenatedParams).digest('hex');
  }

  /**
   * Registers a persistent payment account with Paga
   */
  async registerAccount(data: any): Promise<any> {
    try {
      const payload = {
        referenceNumber: data.referenceNumber,
        phoneNumber: data.phoneNumber,
        firstName: data.firstName,
        lastName: data.lastName,
        accountName: `${data.firstName} ${data.lastName}`,
        accountReference: data.accountReference,
        callbackUrl: data.callbackUrl,
      };

      const hashParams = [
        payload.referenceNumber,
        payload.accountReference,
        payload.callbackUrl,
        this.configService.get<string>('PAGA_HASH_KEY'),
      ];

      const hash = this.generateHash(hashParams);

      const response = await this.axiosInstance.post(
        '/registerPersistentPaymentAccount',
        payload,
        {
          headers: {
            hash: hash,
          },
        },
      );

      return {
        referenceNumber: payload.referenceNumber,
        accountReference: payload.accountReference,
        accountNumber: response.data.accountNumber,
        accountName: payload.accountName,
        statusMessage: response.data.statusMessage,
        statusCode: response.data.statusCode,
      };
    } catch (error) {
      this.logger.error(
        'Error registering account',
        error.response?.data || error,
      );
      throw error;
    }
  }

  /**
   * Deposits money to a bank account
   */
  async depositToBank(data: BankDepositRequest): Promise<BankDepositResponse> {
    try {
      const referenceNumber = generatePagaReferenceNumber();

      const payload = {
        referenceNumber,
        amount: data.amount.toString(),
        currency: data.currency || 'NGN',
        destinationBankUUID: data.destinationBankUUID,
        destinationBankAccountNumber: data.destinationBankAccountNumber,
        remarks: data.remarks || 'Bank Deposit',
      };

      // Generate hash
      const hashParams = [
        payload.referenceNumber,
        payload.amount,
        payload.destinationBankUUID,
        payload.destinationBankAccountNumber,
      ];

      const hash = this.generateHash(hashParams);

      this.logger.debug('Initiating bank deposit', {
        referenceNumber,
        amount: data.amount,
        bankUUID: data.destinationBankUUID,
      });

      const response = await this.axiosInstance.post(
        '/paga-webservices/business-rest/secured/depositToBank',
        payload,
        {
          headers: { hash },
        },
      );

      return {
        referenceNumber: payload.referenceNumber,
        responseCode: response.data.responseCode,
        message: response.data.message,
        transactionId: response.data.transactionId,
        status: response.data.status,
      };
    } catch (error) {
      this.logger.error(
        'Error processing bank deposit',
        error.response?.data || error,
      );
      throw error;
    }
  }

  /**
   * Gets the status of a deposit transaction
   */
  async getDepositStatus(referenceNumber: string): Promise<{
    status: string;
    message: string;
    transactionId?: string;
  }> {
    try {
      const hash = this.generateHash([referenceNumber]);

      const response = await this.axiosInstance.get(
        `/paga-webservices/business-rest/secured/depositToBank/status/${referenceNumber}`,
        {
          headers: { hash },
        },
      );

      return {
        status: response.data.status,
        message: response.data.message,
        transactionId: response.data.transactionId,
      };
    } catch (error) {
      this.logger.error(
        'Error fetching deposit status',
        error.response?.data || error,
      );
      throw error;
    }
  }

  /**
   * Transfer money to a bank account
   */
  async transfer(
    data: TransferRequest,
    userId: number,
    pin: string,
  ): Promise<TransferResponse> {
    const publickey = this.configService.get<string>('PAGA_API_PUBLIC_KEY');
    const secretKey = this.configService.get<string>('PAGA_API_SECTRET_KEY');
    try {
      // Get user details to include sender name
      const user = await this.userRepository.findOne({ where: { id: userId } });
      const senderName = user
        ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
        : 'User';
      const referenceNumber = generatePagaReferenceNumber();

      // Append sender name to remarks
      const remarks = data.remarks
        ? `${data.remarks} - From: ${senderName}`
        : `Bank Transfer - From: ${senderName}`;

      const payload = {
        referenceNumber,
        amount: data.amount.toString(),
        currency: data.currency || 'NGN',
        destinationBankUUID: data.destinationBankUUID,
        destinationBankAccountNumber: data.destinationBankAccountNumber,
        remarks: remarks,
      };

      // Generate hash for the request
      const hashParams = [
        payload.referenceNumber,
        payload.amount,
        payload.destinationBankUUID,
        payload.destinationBankAccountNumber,
        this.configService.get<string>('PAGA_HASH_KEY'),
      ];

      const hash = this.generateHash(hashParams);

      this.logger.debug('Initiating bank transfer', {
        referenceNumber,
        amount: data.amount,
        bankUUID: data.destinationBankUUID,
        payload: JSON.stringify(payload), // Add this for debugging
      });

      const response = await this.pagaBusinessAxiosInstance.post(
        '/paga-webservices/business-rest/secured/depositToBank',
        payload,
        {
          headers: {
            // 'Content-Type': 'application/json',a
            // principal: publickey,
            // credentials: secretKey,
            hash: hash,
          },
        },
      );

      console.log(response.data, 'response');
      this.logger.debug('Transfer response', {
        referenceNumber,
        responseCode: response.data.responseCode,
      });
      if (response.data.responseCode === 0) {
        // Update wallet balance
        const wallets = await this.findWalletsByUserId(userId);
        if (!wallets || wallets.length === 0) {
          throw new Error('No wallet found for this user');
        }
        const wallet = wallets[0]; // Use the first wallet found
        wallet.balance -= data.amount + response.data.fee;
        await this.ngnWalletRepository.save(wallet);
        // Create transaction record
        const transaction = new TransactionEntity(); // Add this line to create a new instance

        transaction.ngnWalletId = wallet.id;
        transaction.userId = userId;
        transaction.type = TransactionType.DEBIT;
        transaction.amount = data.amount;
        transaction.reference = referenceNumber;
        transaction.status = TransactionStatus.COMPLETED;
        transaction.fee = response.data.fee;
        transaction.description = remarks;
        transaction.currency = TransactionCurrency.NGN;
        transaction.metadata = {
          destinationBank: data.destinationBankUUID,
          destinationAccount: data.destinationBankAccountNumber,
          destinationAccountHolderNameAtBank:
            response.data.destinationAccountHolderNameAtBank,
          transactionId: response.data.transactionId,
          sessionId: response.data.sessionId,
          vat: response.data.vat,
          fee: response.data.fee,
        };

        await this.transctionRepository.save(transaction);

        this.logger.log('Wallet balance updated and transaction created', {
          walletId: wallet.id,
          newBalance: wallet.balance,
          transactionId: transaction.id,
        });
      }

      // Save the beneficiary if saveBeneficiary flag is true
      // Check if this beneficiary already exists
      const existingBeneficiary = await this.beneficiaryRepository.findOne({
        where: {
          userId,
          accountNumber: data.destinationBankAccountNumber,
          bankCode: data.destinationBankUUID,
        },
      });

      if (!existingBeneficiary) {
        const wallets = await this.findWalletsByUserId(userId);
        if (!wallets || wallets.length === 0) {
          throw new Error('No wallet found for this user');
        }

        const wallet = wallets[0]; // Use the first wallet found
        // wallet.balance -= data.amount;
        // await this.ngnWalletRepository.save(wallet);
        // Create new beneficiary
        const beneficiary = new BeneficiaryEntity();
        beneficiary.userId = userId;
        beneficiary.walletId = wallet.id;
        beneficiary.accountNumber = data.destinationBankAccountNumber;
        beneficiary.accountName =
          response.data.destinationAccountHolderNameAtBank;
        beneficiary.bankCode = data.destinationBankUUID;
        beneficiary.isFavorite = false;

        await this.beneficiaryRepository.save(beneficiary);

        this.logger.log('Beneficiary saved', {
          userId,
          accountNumber: data.destinationBankAccountNumber,
          accountName: response.data.destinationAccountHolderNameAtBank,
        });
      }

      // Transform the response to match the TransferResponse interface
      return {
        referenceNumber: response.data.referenceNumber,
        responseCode: response.data.responseCode,
        message: response.data.message,
        transactionId: response.data.transactionId,
        status: response.data.responseCode === 0 ? 'SUCCESS' : 'FAILED',
        recipientName: response.data.destinationAccountHolderNameAtBank,
        amount: data.amount,
        fee: response.data.fee,
        currency: response.data.currency || 'NGN',
        destinationAccountHolderNameAtBank:
          response.data.destinationAccountHolderNameAtBank,
        sessionId: response.data.sessionId,
        vat: response.data.vat,
        destinationBankAccount: data.destinationBankAccountNumber,

        remark: remarks,
      };
    } catch (error) {
      this.logger.error(
        'Error processing transfer',
        error.response?.data || error,
      );
      throw new Error(
        error.response?.data?.message || 'Failed to process transfer',
      );
    }
  }

  /**
   * Get transfer status
   */
  async getTransferStatus(referenceNumber: string): Promise<{
    status: string;
    message: string;
    transactionId?: string;
  }> {
    try {
      const hash = this.generateHash([referenceNumber]);

      const response = await this.axiosInstance.get(
        `/paga-webservices/business-rest/secured/depositToBank/status/${referenceNumber}`,
        {
          headers: {
            'Content-Type': 'application/json',
            principal: this.configService.get<string>('PAGA_PRINCIPAL'),
            credentials: this.configService.get<string>('PAGA_CREDENTIALS'),
            hash: hash,
          },
        },
      );

      return {
        status: response.data.status,
        message: response.data.message,
        transactionId: response.data.transactionId,
      };
    } catch (error) {
      this.logger.error(
        'Error fetching transfer status',
        error.response?.data || error,
      );
      throw error;
    }
  }

  /**
   * Get list of banks
   */
  async getBanks(): Promise<BankListResponse> {
    const publickey = this.configService.get<string>('PAGA_API_PUBLIC_KEY');
    const secretKey = this.configService.get<string>('PAGA_API_SECTRET_KEY');
    const credentials = `${publickey}:${secretKey}`;
    const token = Buffer.from(credentials).toString('base64');
    try {
      const referenceNumber = generatePagaReferenceNumber();

      // Generate hash for the request
      const hash = this.generateHash([
        referenceNumber,
        this.configService.get<string>('PAGA_HASH_KEY'),
      ]);

      this.logger.debug('Fetching bank list', { referenceNumber });

      const response = await this.axiosInstance.post(
        '/banks',
        {
          referenceNumber,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Basic ${token}`,
            Hash: hash,
          },
        },
      );

      this.logger.debug('Bank list response received', {
        referenceNumber,
        responseCode: response.data.responseCode,
      });

      // Sort the banks alphabetically by name if the banks array exists
      if (response.data.banks && Array.isArray(response.data.banks)) {
        response.data.banks.sort((a, b) => {
          // Sort by name property - adjust if your bank object uses a different property
          return a.name.localeCompare(b.name);
        });
      }

      return response.data;
    } catch (error) {
      this.logger.error(
        'Error fetching bank list',
        error.response?.data || error,
      );
      throw error;
    }
  }

  /**
   * Validate bank account details before transfer
   */
  async validateBankAccount(
    data: ValidateBankAccountRequest,
  ): Promise<ValidateBankAccountResponse> {
    try {
      const referenceNumber = generatePagaReferenceNumber();

      const payload = {
        referenceNumber,
        amount: data.amount.toString(),
        currency: data.currency || 'NGN',
        destinationBankUUID: data.destinationBankUUID,
        destinationBankAccountNumber: data.destinationBankAccountNumber,
      };

      // Generate hash
      const hashParams = [
        payload.referenceNumber,
        payload.amount,
        payload.destinationBankUUID,
        payload.destinationBankAccountNumber,
      ];

      const hash = this.generateHash(hashParams);

      this.logger.debug('Validating bank account', {
        referenceNumber,
        bankUUID: data.destinationBankUUID,
        accountNumber: data.destinationBankAccountNumber,
      });

      const response = await this.axiosInstance.post(
        '/validateBankAccount',
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Basic ${this.configService.get<string>('PAGA_BASIC_AUTH')}`,
            Hash: hash,
          },
        },
      );

      this.logger.debug('Bank account validation response', {
        referenceNumber,
        responseCode: response.data.responseCode,
      });

      const isValidated = response.data.responseCode === '0';

      return {
        referenceNumber: payload.referenceNumber,
        responseCode: response.data.responseCode,
        message: response.data.message,
        accountNumber: data.destinationBankAccountNumber,
        accountName: response.data.accountName,
        bankId: data.destinationBankUUID,
        bankName: response.data.bankName,
        isValidated,
      };
    } catch (error) {
      this.logger.error(
        'Error validating bank account',
        error.response?.data || error,
      );

      // Return structured error response
      return {
        referenceNumber: generatePagaReferenceNumber(),
        responseCode: error.response?.data?.responseCode || '99',
        message:
          error.response?.data?.message || 'Bank account validation failed',
        accountNumber: data.destinationBankAccountNumber,
        bankId: data.destinationBankUUID,
        isValidated: false,
      };
    }
  }

  async getPersistentPaymentAccount(
    referenceNumber: string,
    accountIdentifier: string,
  ): Promise<any> {
    const publicKey = this.configService.get<string>('PAGA_API_PUBLIC_KEY');
    const secretKey = this.configService.get<string>('PAGA_API_SECTRET_KEY');

    try {
      // Create payload
      const payload = {
        referenceNumber,
        accountIdentifier,
      };

      // Generate hash for the request
      const hashParams = [
        referenceNumber,
        accountIdentifier,
        this.configService.get<string>('PAGA_HASH_KEY'),
      ];

      const hash = this.generateHash(hashParams);

      this.logger.debug('Querying persistent payment account', {
        referenceNumber,
        accountIdentifier,
      });

      const response = await this.axiosInstance.post(
        '/getPersistentPaymentAccount',
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
            hash: hash,
          },
        },
      );

      this.logger.debug('Persistent payment account response', {
        referenceNumber,
        status: response.status,
      });

      return response.data;
    } catch (error) {
      this.logger.error(
        'Error retrieving persistent payment account',
        error.response?.data || error,
      );
      throw new Error(
        error.response?.data?.message ||
          'Failed to retrieve persistent payment account',
      );
    }
  }

  async validateMoneyTransfer(data: any): Promise<any> {
    const publicKey = this.configService.get<string>('PAGA_API_PUBLIC_KEY');
    const secretKey = this.configService.get<string>('PAGA_API_SECTRET_KEY');

    try {
      // Create payload
      const payload = {
        referenceNumber: data.referenceNumber,
        amount: data.amount.toString(),
        currency: data.currency || 'NGN',
        destinationAccount: data.destinationAccount,
      };

      // Generate hash for the request
      const hashParams = [
        payload.referenceNumber,
        payload.amount,
        payload.destinationAccount,
        this.configService.get<string>('PAGA_HASH_KEY'),
      ];

      const hash = this.generateHash(hashParams);

      this.logger.debug('Validating money transfer', {
        referenceNumber: payload.referenceNumber,
        amount: data.amount,
        destinationAccount: data.destinationAccount,
      });

      const response = await this.pagaBusinessAxiosInstance.post(
        '/paga-webservices/business-rest/secured/validateMoneyTransfer',
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            principal: publicKey,
            credentials: secretKey,
            hash: hash,
          },
        },
      );

      this.logger.debug('Validation response', {
        referenceNumber: payload.referenceNumber,
        status: response.status,
      });

      return response.data;
    } catch (error) {
      this.logger.error(
        'Error validating money transfer',
        error.response?.data || error,
      );
      throw new Error(
        error.response?.data?.message || 'Failed to validate money transfer',
      );
    }
  }

  async validateDepositToBank(requestData: any): Promise<any> {
    try {
      const publicKey = this.configService.get<string>('PAGA_API_PUBLIC_KEY');
      const secretKey = this.configService.get<string>('PAGA_API_SECTRET_KEY');
      const hashKey = this.configService.get<string>('PAGA_HASH_KEY');

      // Create the exact payload structure from the documentation
      const payload = {
        referenceNumber: requestData.referenceNumber,
        amount: requestData.amount.toString(),
        currency: requestData.currency || 'NGN',
        destinationBankUUID: requestData.destinationBankUUID,
        destinationBankAccountNumber: requestData.destinationBankAccountNumber,
        // recipientPhoneNumber: requestData.recipientPhoneNumber || '',
        // recipientMobileOperatorCode:
        //   requestData.recipientMobileOperatorCode || '',
        // recipientEmail: requestData.recipientEmail || '',
        // recipientName: requestData.recipientName || '',
        // locale: requestData.locale || '',
      };
      // Generate hash using required parameters
      const hashParams = [
        payload.referenceNumber,
        payload.amount,
        payload.destinationBankUUID,
        payload.destinationBankAccountNumber,
        hashKey,
      ];

      const hash = this.generateHash(hashParams);

      this.logger.debug('Validating deposit to bank', {
        referenceNumber: payload.referenceNumber,
        destinationBankUUID: payload.destinationBankUUID,
      });

      const response = await this.pagaBusinessAxiosInstance.post(
        '/paga-webservices/business-rest/secured/validateDepositToBank',
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            principal: publicKey,
            credentials: secretKey,
            hash: hash,
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        'Error validating deposit to bank',
        error.response?.data || error,
      );

      throw new Error(
        error.response?.data?.message || 'Failed to validate deposit to bank',
      );
    }
  }

  /**
   * Helper method to validate bank account before transfer
   * Returns true if account is valid, false otherwise
   */
  async isValidBankAccount(
    accountNumber: string,
    bankUUID: string,
    amount?: number,
  ): Promise<boolean> {
    try {
      const validation = await this.validateBankAccount({
        amount: amount || 100, // Minimum amount for validation
        destinationBankUUID: bankUUID,
        destinationBankAccountNumber: accountNumber,
      });

      return validation.isValidated;
    } catch (error) {
      this.logger.error(
        'Error in bank account validation check',
        error.response?.data || error,
      );
      return false;
    }
  }

  async verifyTransactionPin(userId: number, pin: string): Promise<boolean> {
    try {
      // Find the user with their PIN
      const user = await this.userRepository.findOne({
        where: { id: userId },
        select: ['id', 'pin'], // Explicitly select pin field which might be excluded by default
      });
      // Check if user exists and has a PIN set
      if (!user || !user.pin) {
        this.logger.warn(`User ${userId} has no PIN set`);
        return false;
      }

      // Compare the provided PIN with the stored hash
      const isPinValid = await bcrypt.compare(pin, user.pin);

      if (!isPinValid) {
        this.logger.warn(`Invalid PIN provided for user ${userId}`);
      }

      return isPinValid;
    } catch (error) {
      this.logger.error(
        `Error verifying transaction PIN: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  async getBankByUUID(bankUUID: string): Promise<any> {
    try {
      // First get all banks
      const bankListResponse = await this.getBanks();

      // Check if the response has banks
      if (!bankListResponse.banks || !Array.isArray(bankListResponse.banks)) {
        throw new Error('Unable to retrieve bank list from Paga');
      }

      // Find the specific bank by UUID
      const bank = bankListResponse.banks.find(
        (bank) => bank.uuid === bankUUID,
      );

      if (!bank) {
        throw new NotFoundException(`Bank with UUID ${bankUUID} not found`);
      }

      return bank;
    } catch (error) {
      this.logger.error(`Error retrieving bank by UUID ${bankUUID}`, error);
      throw error;
    }
  }
  /**
   * Get bank account name
   * Returns account name if valid, null otherwise
   */
  async getBankAccountName(
    accountNumber: string,
    bankUUID: string,
  ): Promise<string | null> {
    try {
      const validation = await this.validateBankAccount({
        amount: 100, // Minimum amount for validation
        destinationBankUUID: bankUUID,
        destinationBankAccountNumber: accountNumber,
      });

      return validation.accountName || null;
    } catch (error) {
      this.logger.error(
        'Error fetching bank account name',
        error.response?.data || error,
      );
      return null;
    }
  }

  async getAccountBalance(requestData: any): Promise<any> {
    try {
      const publicKey = this.configService.get<string>('PAGA_API_PUBLIC_KEY');
      const secretKey = this.configService.get<string>('PAGA_API_SECTRET_KEY');
      const hashKey = this.configService.get<string>('PAGA_HASH_KEY');

      // Create payload according to the documentation
      const payload = {
        referenceNumber: requestData.referenceNumber,
        accountPrincipal: requestData.accountPrincipal || null,
        accountCredentials: requestData.accountCredentials || null,
        sourceOfFunds: requestData.sourceOfFunds || null,
        locale: requestData.locale || null,
      };

      // Generate hash for the request - only using referenceNumber
      const hashParams = [payload.referenceNumber, hashKey];

      const hash = this.generateHash(hashParams);

      this.logger.debug('Checking account balance', {
        referenceNumber: payload.referenceNumber,
      });

      const response = await this.pagaBusinessAxiosInstance.post(
        '/paga-webservices/business-rest/secured/accountBalance',
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            principal: publicKey,
            credentials: secretKey,
            hash: hash,
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        'Error checking account balance',
        error.response?.data || error,
      );

      throw new Error(
        error.response?.data?.message || 'Failed to check account balance',
      );
    }
  }

  // This for transfer to 3rd party accoount
  async moneyTransfer(requestData: any): Promise<any> {
    try {
      const publicKey = this.configService.get<string>('PAGA_API_PUBLIC_KEY');
      const secretKey = this.configService.get<string>('PAGA_API_SECTRET_KEY');
      const hashKey = this.configService.get<string>('PAGA_HASH_KEY');

      // Create payload according to the documentation
      const payload = {
        referenceNumber: requestData.referenceNumber,
        amount: requestData.amount.toString(),
        currency: requestData.currency || 'NGN',
        destinationAccount: requestData.destinationAccount,
        destinationBank: requestData.destinationBank || '',
        withdrawalCode: requestData.withdrawalCode || false,
        sourceOfFunds: requestData.sourceOfFunds || 'PAGA',
        transferReference:
          requestData.transferReference || requestData.referenceNumber,
        suppressRecipientMsg: requestData.suppressRecipientMsg || false,
        locale: requestData.locale || '',
        alternateSenderName: requestData.alternateSenderName || '',
        minRecipientKYCLevel: requestData.minRecipientKYCLevel || '',
        holdingPeriod: requestData.holdingPeriod || null,
      };

      // Generate hash for the request
      const hashParams = [
        payload.referenceNumber,
        payload.amount,
        payload.destinationAccount,
        hashKey,
      ];

      const hash = this.generateHash(hashParams);

      this.logger.debug('Initiating money transfer', {
        referenceNumber: payload.referenceNumber,
        amount: payload.amount,
        destinationAccount: payload.destinationAccount,
      });

      const response = await this.axiosInstance.post(
        '/paga-webservices/business-rest/secured/moneyTransfer',
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            principal: publicKey,
            credentials: secretKey,
            hash: hash,
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        'Error processing money transfer',
        error.response?.data || error,
      );

      throw new Error(
        error.response?.data?.message || 'Failed to process money transfer',
      );
    }
  }

  // In your service
  async findWalletsByUserId(userId: number): Promise<NGNWalletEntity[]> {
    const wallets = await this.ngnWalletRepository.find({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    // Modify entity instances in-place instead of creating new objects
    wallets.forEach((wallet) => {
      if (wallet.user && typeof wallet.user.address === 'string') {
        try {
          if ((wallet.user.address as string).startsWith('{')) {
            wallet.user.address = JSON.parse(wallet.user.address as string);
          }
        } catch (e) {
          // Handle parse error
        }
      }
    });

    return wallets; // Still returns entity instances
  }

  async getCADwalletById(userId: number): Promise<CADWalletEntity[]> {
    return this.cadWalletRepository.find({
      where: { userId },
      relations: ['user'],
    });
  }
}
