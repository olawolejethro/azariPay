import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { User } from 'src/auth/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { NGNWalletEntity } from '../entities/NGNwallet.entity';
// import { TransactionEntity } from '../entities/transaction.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  TransactionEntity,
  TransactionType,
  TransactionStatus,
} from '../entities/transaction.entity';
import e from 'express';
import { PagaService } from './paga.service';
import { LoggerService } from 'src/common/logger/logger.service';
import { BeneficiaryEntity } from '../entities/beneficiary.entity';
import { stringify } from 'querystring';
import { AuthService } from 'src/auth/services/auth.service';
import { FirebaseService } from 'src/firebase/firebase.service';
import { Notification } from 'src/notifications/entities/notification.entity';
import { EncryptionService } from 'src/common/encryption/encryption.service';
// import { TransactionType } from '../interfaces/wallet.interface';

@Injectable()
export class DotBankService {
  private readonly apiClient: AxiosInstance;
  private readonly logger: LoggerService;
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(NGNWalletEntity)
    private readonly ngnWalletRepository: Repository<NGNWalletEntity>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(BeneficiaryEntity)
    private readonly beneficiaryRepository: Repository<BeneficiaryEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    private readonly configService: ConfigService,
    private readonly pagaservice: PagaService,
    private readonly encryptionService: EncryptionService,
    // private readonly authService: AuthService,
    private readonly firebaseService: FirebaseService,
  ) {
    this.baseUrl =
      this.configService.get<string>('DOTBANK_API_URL') ||
      'https://gateway.dotbank.africa';
    this.clientId = this.configService.get<string>('DOTBANK_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('DOTBANK_CLIENT_SECRET');

    this.apiClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000, // 15 seconds timeout
      headers: {
        Accept: 'application/json',
      },
    });
  }

  /**
   * Generate an access token from DotBank API
   * @returns Token response object with access_token
   */
  async getAccessToken() {
    try {
      // Create Basic Auth credentials
      const auth = Buffer.from(
        `${this.clientId}:${this.clientSecret}`,
      ).toString('base64');

      const response = await this.apiClient.post(
        '/oauth2/token',
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${auth}`,
          },
        },
      );

      return response.data;
    } catch (error) {
      console.log(error, 'error');
      // Handle different error scenarios
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const message =
        error.response?.data?.error_description || 'Failed to get access token';

      throw new HttpException(
        {
          status,
          error: message,
        },
        status,
      );
    }
  }

  /**
   * Create a virtual account
   * @param userData User data for virtual account creation
   * @param userId ID of the authenticated user
   * @returns Created virtual account data
   */
  async createVirtualAccount(userData: any, userId: number) {
    try {
      // First get the token
      const tokenResponse = await this.getAccessToken();
      const token = tokenResponse.access_token;

      // Fetch user data from repository
      const userDetails = await this.getUserDetails(userId);
      const stringedUserId = userId.toString();
      // Merge user details with provided data
      const virtualAccountData = {
        ...userData,
        firstname: userDetails.firstName || 'first',
        lastname: userDetails.lastName || 'last',
        dateOfBirth: userDetails.dateOfBirth || userData.dateOfBirth,
        gender: userDetails.gender,
        externalId: stringedUserId, // Use userId as the external ID
      };
      // If userData.gender is 'OTHER', hard code as 'FEMALE'
      if (userData.gender === 'OTHERS') {
        virtualAccountData.gender = 'FEMALE';
      }
      // Use the token to create a virtual account
      const response = await this.apiClient.post('/vaas', virtualAccountData, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      // Create NGN wallet from virtual account data
      // const wallet = await this.createNGNWallet(userId, response.data);

      console.log(response.data, 'response.data');
      return {
        virtualAccount: response.data,
      };
    } catch (error) {
      console.log(error, 'error');
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const message =
        error.response?.data?.message || 'Failed to create virtual account';

      throw new HttpException(
        {
          status,
          error: message,
        },
        status,
      );
    }
  }
  /**
   * Create NGN wallet from virtual account data
   * @param userId User ID as number
   * @param virtualAccountData Virtual account data from DotBank
   * @returns Created NGN wallet
   */
  private async createNGNWallet(userId: number, virtualAccountData: any) {
    try {
      // Check if user already has an NGN wallet
      const existingWallet = this.ngnWalletRepository.find({
        where: { userId },
        relations: ['user'],
      });

      if (existingWallet) {
        throw new HttpException(
          'User already has an NGN wallet',
          HttpStatus.CONFLICT,
        );
      }

      // Create a new NGN wallet
      return this.ngnWalletRepository.create(virtualAccountData);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to create NGN wallet: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  /**
   * Get user details from repository
   * @param userId User ID
   * @returns User details
   */
  private async getUserDetails(userId: number) {
    // TODO: Replace with actual implementation using your user repository
    // Example implementation:
    return this.userRepository.findOne({ where: { id: userId } });
  }

  /**
   * Start polling for transaction status
   * @param transactionRef DotBank transaction reference
   * @param userId User ID associated with transaction
   * @param metadata Additional transaction metadata
   */
  private async startPollingTransaction(
    transactionRef: string,
    transferFees: number,
    userId: number,
    requestId: number,
    transactionId: string, // *** ADD TRANSACTION ID PARAMETER ***
    metadata: any = {},
  ) {
    // *** CREATE PENDING TRANSACTION WITH TRANSACTION ID ***
    await this.createPendingTransaction(
      transactionRef,
      userId,
      requestId,
      transactionId, // *** PASS TRANSACTION ID ***
      metadata,
    );

    // Track if balance has been updated to prevent multiple updates
    let balanceUpdated = false;
    let beneficiarySaved = false;

    // Create a promise that resolves when we get a final status
    return new Promise(async (resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 8; // 8 attempts × 20 seconds = 160 seconds (2 minutes 40 seconds)
      const pollInterval = 20000;

      // Function to poll status
      const checkStatus = async () => {
        try {
          // Get transaction status
          const statusResponse = await this.getTransactionStatus(
            transactionRef,
            requestId,
          );

          // *** UPDATE TRANSACTION STATUS WITH TRANSACTION ID ***
          await this.updateTransactionStatus(transactionRef, statusResponse);

          // Check if we've reached a final state
          if (
            ['SUCCEEDED', 'FAILED', 'REJECTED', 'DO_NOT_HONOR'].includes(
              statusResponse.state,
            )
          ) {
            // We have a final status
            const isSuccess = statusResponse.state === 'SUCCEEDED';

            // Send notification if transfer is successful or failed
            try {
              const user = await this.userRepository.findOne({
                where: { id: userId },
              });
              if (user && user.fcmToken) {
                const formattedAmount = new Intl.NumberFormat('en-NG', {
                  style: 'currency',
                  currency: 'NGN',
                }).format(metadata.amount);
                let notificationTitle = '';
                let notificationBody = '';

                if (isSuccess) {
                  notificationTitle = 'Transfer Successful';
                  notificationBody = `Your transfer of ${formattedAmount} to ${metadata.beneficiary?.fullName || ''} was successful.`;
                } else {
                  // Notification for failure
                  notificationTitle = 'Transfer Failed';
                  notificationBody = `Your transfer of ${formattedAmount} to ${metadata.beneficiary?.fullName || ''} failed.`;
                }
                const notificationPayload = {
                  notification: {
                    title: notificationTitle,
                    body: notificationBody,
                  },
                  data: {
                    type: 'transfer',
                    transactionId: transactionId, // *** ADD TRANSACTION ID ***
                    timestamp: new Date().toISOString(),
                  },
                  token: user.fcmToken,
                };

                await this.firebaseService.notifyByPush(notificationPayload);

                const notification = await this.notificationRepository.create({
                  userId: userId,
                  title: notificationTitle,
                  body: notificationBody,
                  data: {
                    transactionRef: transactionRef,
                    transactionId: transactionId, // *** ADD TRANSACTION ID ***
                    amount: metadata.amount,
                    beneficiaryName: metadata.beneficiary?.fullName,
                    beneficiaryAccount: metadata.beneficiary?.accountNo,
                    status: 'COMPLETED',
                    timestamp: new Date().toISOString(),
                    type: 'transfer',
                  },
                  action: `/transactions/${transactionRef}`,
                });
                await this.notificationRepository.save(notification);
              }
            } catch (notificationError) {
              this.logger.error(
                'Failed to send push notification:',
                notificationError,
              );
            }

            // Update wallet balance and save beneficiary only when transaction succeeds
            if (isSuccess && !balanceUpdated) {
              balanceUpdated = true; // Set flag to prevent duplicate updates

              // *** MARK TRANSACTION AS COMPLETED WITH TRANSACTION ID ***
              await this.markTransactionAsCompleted(transactionRef);
            }

            resolve({
              success: isSuccess,
              transactionId: transactionId, // *** TRANSACTION ID AT THE TOP ***
              state: statusResponse.state,
              fullResponse: statusResponse,

              // Add the requested fields
              fullName: metadata.beneficiary?.fullName || '',
              amount: metadata.amount,
              accountNumber: metadata.beneficiary?.accountNo || '',
              transactionRef: transactionRef,

              // Include additional useful information
              bankCode: metadata.beneficiary?.bankCode || '',
              remarks: metadata.remarks || '',
              fees: statusResponse.transferFees || 0,
              totalAmount:
                statusResponse.transactionAmount +
                (statusResponse.transferFees || 0),

              // Final transaction details
              finalDetails: {
                transactionId: transactionId,
                status: statusResponse.state,
                completedAt: new Date().toISOString(),
                isSuccessful: isSuccess,
              },
            });

            return; // Exit function
          }

          // Not a final status yet, check if we've reached max attempts
          attempts++;
          if (attempts >= maxAttempts) {
            // Timeout - resolve with latest status but indicate timeout
            resolve({
              success: false,
              transactionId: transactionId, // *** TRANSACTION ID AT THE TOP ***
              status: 'TIMEOUT',
              message: 'Transfer status check timed out',
              fullResponse: statusResponse,
              transactionRef: transactionRef,

              // Timeout details
              timeoutDetails: {
                transactionId: transactionId,
                attempts: attempts,
                maxAttempts: maxAttempts,
                lastStatus: statusResponse.state || 'UNKNOWN',
                timedOutAt: new Date().toISOString(),
              },
            });
            return;
          }

          // Schedule next check
          setTimeout(checkStatus, pollInterval);
        } catch (error) {
          // Error during status check
          attempts++;
          if (attempts >= maxAttempts) {
            reject(
              new Error(
                'Failed to determine transfer status after multiple attempts',
              ),
            );
          } else {
            // Try again
            setTimeout(checkStatus, pollInterval);
          }
        }
      };

      // Start checking
      checkStatus();
    });
  }

  /**
   * Mark a transaction as completed in the database to prevent duplicate processing
   */
  private async markTransactionAsCompleted(
    transactionRef: string,
  ): Promise<void> {
    try {
      // ✅ Generate hash from reference
      const referenceHash = this.encryptionService.hash(transactionRef);

      // ✅ Search using hash
      await this.transactionRepository.update(
        { referenceHash }, // ✅ Use hash instead of reference
        {
          status: TransactionStatus.COMPLETED,
          completedAt: new Date(),
        },
      );
    } catch (error) {
      this.logger.error(
        `Error marking transaction as completed: ${error.message}`,
      );
    }
  }

  /**
   * Create initial pending transaction record
   */
  private async createPendingTransaction(
    transactionRef: string,
    userId: number,
    requestId: number,
    transactionId: string, // *** ADD TRANSACTION ID PARAMETER ***
    metadata: any,
  ) {
    const wallets = await this.pagaservice.findWalletsByUserId(userId);
    if (!wallets || wallets.length === 0) {
      throw new Error('No wallet found for this user');
    }
    const wallet = wallets[0];
    const transaction = this.transactionRepository.create({
      ngnWalletId: wallet.id,
      userId: userId,
      type: TransactionType.DEBIT,
      transactionId,
      externalReference: transactionRef,
      externalReferenceHash: this.encryptionService.hash(transactionRef),
      requestId: requestId,
      status: TransactionStatus.PROCESSING,
      state: 'RUNNING', // Add DotBank state
      internalState: 'SUBMITTED', // Add DotBank internalState
      statusMessage: 'Initiated',
      amount: metadata.amount,
      fee: 0,
      currency: metadata.currency || 'NGN',
      description: metadata.remarks || 'Fund transfer',
      metadata: {
        ...metadata,
        initialRequestId: requestId,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Add this to see the SQL being executed
    const saveResult = await this.transactionRepository.save(transaction);
  }

  /**
   * Update transaction with new status
   */
  private async updateTransactionStatus(
    transactionRef: string,
    statusData: any,
  ) {
    try {
      const externalReferenceHash = this.encryptionService.hash(transactionRef);
      const transaction = await this.transactionRepository.findOne({
        where: { externalReferenceHash },
      });

      if (!transaction) {
        this.logger.warn(`Transaction ${transactionRef} not found for update`);
        return;
      }

      // Update basic status fields
      transaction.state = statusData.state;
      transaction.internalState = statusData.internalState;
      transaction.statusMessage = statusData.statusMessage;
      transaction.updatedAt = new Date();

      // Update our internal status enum
      if (statusData.state === 'SUCCEEDED') {
        transaction.status = TransactionStatus.COMPLETED;
        transaction.completedAt = new Date();
      } else if (
        ['FAILED', 'REJECTED', 'DO_NOT_HONOR'].includes(statusData.state)
      ) {
        transaction.status = TransactionStatus.FAILED;
      } else {
        transaction.status = TransactionStatus.PROCESSING;
      }

      // Save receipt number if present
      if (statusData.receiptNumber) {
        transaction.receiptNumber = statusData.receiptNumber;
      }

      // Store full response in metadata
      if (!transaction.metadata) {
        transaction.metadata = {};
      }
      transaction.metadata.lastStatusUpdate = statusData;

      const newTransaction = await this.transactionRepository.save(transaction);
    } catch (error) {
      this.logger.error(
        `Failed to update transaction ${transactionRef}: ${error.message}`,
      );
    }
  }

  /**
   * Background job to retry polling for any pending transactions
   * Runs every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handlePendingTransactions() {
    try {
      // Find transactions that are still in initial states and not being actively polled
      const pendingTransactions = await this.transactionRepository.find({
        where: {
          status: TransactionStatus.PENDING,
          // Ensure we only pick up transactions created in the last 24 hours
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });

      this.logger.log(
        `Found ${pendingTransactions.length} pending transactions to poll`,
      );

      // Start polling each transaction again
      for (const transaction of pendingTransactions) {
        if (
          !this.activePollingTransactions.has(transaction.externalReference)
        ) {
          this.logger.log(
            `Resuming polling for transaction ${transaction.externalReference}`,
          );
          this.startPollingTransaction(
            transaction.externalReference,
            transaction.fee,
            transaction.userId,
            transaction.requestId,
            transaction.transactionId, // *** ADD TRANSACTION ID ***
            transaction.metadata,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error in pending transaction cron job: ${error.message}`,
      );
    }
  }

  /**
   * Get transaction status from DotBank API
   * @param transactionRef Transaction reference
   * @returns Transaction status response
   */
  // Get transaction status from DotBank API
  async getTransactionStatus(transactionRef: string, requestId: number) {
    try {
      // First get the token
      const tokenResponse = await this.getAccessToken();
      const token = tokenResponse.access_token;

      console.log(
        `Making status query: reference=${transactionRef}, id=${requestId}`,
      );

      // Use the token to get transaction status
      const response = await this.apiClient.get(
        `/transfers/tsq?id=${requestId}&reference=${transactionRef}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      console.log(`Got status response:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`Error getting transaction status: ${error.message}`);
      if (error.response) {
        console.error(`Response data:`, error.response.data);
        console.error(`Response status:`, error.response.status);
      }
      throw error;
    }
  }
  // Set of transaction reference IDs currently being polled
  private activePollingTransactions = new Set<string>();

  /**
   * Get list of banks from DotBank API
   * @returns Array of bank objects
   */
  async getBanks() {
    try {
      // First get the token
      const tokenResponse = await this.getAccessToken();
      const token = tokenResponse.access_token;

      // Use the token to get the banks list
      const response = await this.apiClient.get('banking/banks', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Ensure we have data to sort
      let banks = response.data;

      // Sort banks alphabetically by name
      if (banks && Array.isArray(banks)) {
        // Add null check for name property
        banks = banks.sort((a, b) => {
          // Handle missing name properties
          const nameA = a.name ? a.name.toUpperCase() : '';
          const nameB = b.name ? b.name.toUpperCase() : '';

          return nameA.localeCompare(nameB);
        });
      }

      // Wrap the sorted banks in a banks object
      return {
        banks: banks,
        responseCode: '00', // Success code
        responseMessage: 'Operation successful',
      };
    } catch (error) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const message =
        error.response?.data?.message || 'Failed to retrieve banks list';

      throw new HttpException(
        {
          status,
          error: message,
        },
        status,
      );
    }
  }

  /**
   * Generates a random transaction reference number similar to: 1000332502031223499340479564445
   *
   * Format breakdown:
   * - Prefix: 1000
   * - Timestamp component (date/time)
   * - Random numeric sequence
   *
   * @returns A string containing the generated transaction reference
   */
  private generateTransactionReference(): string {
    // Fixed prefix (matches the example)
    const prefix = '1000';

    // Current date/time components
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hour = now.getHours().toString().padStart(2, '0');
    const minute = now.getMinutes().toString().padStart(2, '0');
    const second = now.getSeconds().toString().padStart(2, '0');

    // Timestamp portion YYMMDDHHMM
    const timestamp = `${year}${month}${day}${hour}${minute}${second}`;

    // Generate random numeric sequence (15 digits)
    const randomPart = Array.from({ length: 15 }, () =>
      Math.floor(Math.random() * 10),
    ).join('');

    // Combine all parts
    return `${prefix}${timestamp}${randomPart}`;
  }

  /**
   * Submit a fund transfer
   * @param transferDto Transfer data
   * @param userId User ID
   * @returns Transfer response
   */

  async submitTransfer(transferDto: any, userId: number) {
    try {
      // First get the token
      const tokenResponse = await this.getAccessToken();
      const token = tokenResponse.access_token;

      // Generate a unique transaction reference
      const transactionRef = this.generateTransactionReference();

      // *** GENERATE NUMERIC TRANSACTION ID ***
      const transactionId = this.generateNumericTransactionId();

      // Get merchant details (constant sender)
      const merchantDetails = this.getMerchantDetails();

      // *** GET BANK NAME FROM BANK CODE USING YOUR EXISTING DOTBANK SERVICE ***
      let beneficiaryBankName = transferDto.beneficiary?.bankName || '';
      let beneficiaryBankCategory = null;
      console.log(
        `Beneficiary bank code: ${transferDto.beneficiary?.bankCode}`,
      );
      if (transferDto.beneficiary?.bankCode) {
        try {
          const bankDetails = await this.getBankByCode(
            transferDto.beneficiary.bankCode,
          );

          if (bankDetails) {
            beneficiaryBankName = bankDetails.name;
            beneficiaryBankCategory = bankDetails.category;

            // Update the beneficiary object with the fetched bank details
            transferDto.beneficiary.bankName = beneficiaryBankName;
            transferDto.beneficiary.bankCategory = beneficiaryBankCategory;

            console.log(
              `Resolved bank: ${beneficiaryBankName} (${beneficiaryBankCategory}) for code: ${transferDto.beneficiary.bankCode}`,
            );
          } else {
            console.warn(
              `Bank not found for code: ${transferDto.beneficiary.bankCode}`,
            );
            beneficiaryBankName = `Bank (${transferDto.beneficiary.bankCode})`;
          }
        } catch (bankError) {
          console.error('Failed to resolve bank details:', bankError);
          // Continue with the transfer even if bank name resolution fails
          beneficiaryBankName =
            transferDto.beneficiary?.bankName ||
            `Bank (${transferDto.beneficiary.bankCode})`;
        }
      }

      // Optional: Validate that a bank was found if bank code was provided
      if (transferDto.beneficiary?.bankCode && !beneficiaryBankName) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: `Invalid or unknown bank code: ${transferDto.beneficiary.bankCode}`,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Create the full transfer payload
      const transferPayload = {
        amount: transferDto.amount,
        remarks: transferDto.remarks || 'transfer',
        channel: 'TELLER',
        transactionRef,
        sender: {
          accountNo: merchantDetails.accountNo,
          fullName: merchantDetails.fullName,
          bankCode: merchantDetails.bankCode,
          bankName: merchantDetails.bankName,
          kycLevel: merchantDetails.kycLevel,
          narration: merchantDetails.narration,
        },
        beneficiary: {
          ...transferDto.beneficiary,
          bankName: beneficiaryBankName, // *** ENSURE BANK NAME IS INCLUDED ***
        },
      };

      // Find wallet with lock to prevent concurrent updates
      const wallets = await this.pagaservice.findWalletsByUserId(userId);
      if (!wallets || wallets.length === 0) {
        throw new Error('No wallet found for this user');
      }

      const wallet = wallets[0]; // Use the first wallet found
      const transferFees = 10;
      // Verify funds are available before deducting
      const totalAmount = Number(transferDto.amount) + (transferFees || 0);

      // if (wallet.balance < totalAmount) {
      //   throw new Error('Insufficient funds in wallet');
      // }
      // Update wallet balance
      wallet.balance -= totalAmount;
      await this.ngnWalletRepository.save(wallet);

      // Use the token to submit the transfer
      const response = await this.apiClient.post(
        '/transfers/submit',
        transferPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        },
      );

      // Send push notification for successful transfer initiation
      let notificationStatus = {
        sent: false,
        details: null,
      };

      try {
        // Get the user to access their FCM token
        const user = await this.userRepository.findOne({
          where: { id: userId },
        });
        if (user && user.fcmToken) {
          // Format amount with currency symbol
          const formattedAmount = new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
          }).format(transferDto.amount);

          // Create notification payload with the correct FCM structure
          const notificationPayload = {
            notification: {
              title: 'Transfer Initiated',
              body: `Your transfer of ${formattedAmount} to ${transferDto.beneficiary?.fullName} at ${beneficiaryBankName} is being processed.`, // *** INCLUDE RESOLVED BANK NAME ***
            },
            data: {
              type: 'transfer',
              transactionId: transactionId,
              timestamp: new Date().toISOString(),
            },
            token: user.fcmToken,
          };

          // Send the push notification
          const notificationResult =
            await this.firebaseService.notifyByPush(notificationPayload);

          console.log(notificationResult, 'notificationResult');
          // Update notification status
          notificationStatus = {
            sent: notificationResult.status,
            details: {
              title: notificationPayload.notification.title,
              message: notificationPayload.notification.body,
              type: notificationPayload.data.type,
              data: notificationPayload.data,
            },
          };

          // Create notification in database and send push notification
          const notification = await this.notificationRepository.create({
            userId: userId,
            title: 'Transfer Initiated',
            body: `Your transfer of ${formattedAmount} to ${transferDto.beneficiary?.fullName} at ${beneficiaryBankName} is being processed.`,
            currency: 'NGN',
            data: {
              transactionRef: response.data.transactionRef,
              transactionId: transactionId,
              amount: transferDto.amount,
              beneficiaryName: transferDto.beneficiary?.fullName,
              beneficiaryAccount: transferDto.beneficiary?.accountNo,
              beneficiaryBankName: beneficiaryBankName, // *** ADD RESOLVED BANK NAME ***
              beneficiaryBankCode: transferDto.beneficiary?.bankCode,
              beneficiaryBankCategory: beneficiaryBankCategory, // *** ADD BANK CATEGORY ***
              status: 'PROCESSING',
              timestamp: new Date().toISOString(),
              type: 'transfer',
            },
            action: `/transactions/${response.data.transactionRef}`,
          });
          console.log(notification, 'notification');
          await this.notificationRepository.save(notification);
        }
      } catch (notificationError) {
        // Log the error but don't fail the transaction if notification fails
        console.error('Failed to send push notification:', notificationError);
      }

      // *** PASS TRANSACTION ID TO POLLING FUNCTION ***
      // Start polling in the background without awaiting it
      this.startPollingTransaction(
        response.data.transactionRef,
        response.data.transferFees,
        userId,
        response.data.requestId,
        transactionId,
        {
          amount: transferDto.amount,
          transactionType: 'TRANSFER',
          currency: 'NGN',
          beneficiary: {
            ...transferDto.beneficiary,
            bankName: beneficiaryBankName, // *** INCLUDE RESOLVED BANK NAME ***
            bankCategory: beneficiaryBankCategory, // *** INCLUDE BANK CATEGORY ***
          },
          remarks: transferDto.remarks,
          channel: transferDto.channel,
        },
      );

      // Immediately return the initial response to the client
      return {
        success: true,
        transactionId: transactionId,
        state: 'PROCESSING',
        fullResponse: response.data,

        // Add the requested fields with resolved bank name
        fullName: transferDto.beneficiary?.fullName || '',
        amount: transferDto.amount,
        accountNumber: transferDto.beneficiary?.accountNo || '',
        transactionRef: response.data.transactionRef,

        // Include additional useful information
        bankCode: transferDto.beneficiary?.bankCode || '',
        remarks: transferDto.remarks || '',
        fees: response.data.transferFees || 0,
        bankName: beneficiaryBankName, // *** RESOLVED BANK NAME FROM DOTBANK SERVICE ***
        bankCategory: beneficiaryBankCategory, // *** BANK CATEGORY FROM DOTBANK SERVICE ***
        totalAmount:
          Number(transferDto.amount) + (response.data.transferFees || 0),

        // Add message indicating the transaction is still processing
        message: 'Transfer initiated successfully and is being processed',

        // Include notification information
        notification: notificationStatus,

        // Transaction details for easy access
        transferDetails: {
          transactionId: transactionId,
          amount: transferDto.amount,
          recipientName: transferDto.beneficiary?.fullName || '',
          accountNumber: transferDto.beneficiary?.accountNo || '',
          bankCode: transferDto.beneficiary?.bankCode || '',
          bankName: beneficiaryBankName, // *** RESOLVED BANK NAME ***
          bankCategory: beneficiaryBankCategory, // *** BANK CATEGORY ***
          date: new Date().toISOString(),
        },

        // Enhanced bank information
        bankDetails: beneficiaryBankCategory
          ? {
              code: transferDto.beneficiary?.bankCode,
              name: beneficiaryBankName,
              category: beneficiaryBankCategory,
            }
          : null,
      };
    } catch (error) {
      console.log(error, 'error');
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const message =
        error.response?.data?.message || 'Failed to submit transfer';

      throw new HttpException(
        {
          status,
          error: message,
        },
        status,
      );
    }
  }

  // *** ADD TRANSACTION ID GENERATION METHOD ***
  private generateNumericTransactionId(): string {
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `${timestamp}${randomSuffix}`;
  }

  /**
   * Get merchant constant details
   * @returns Merchant details object
   */
  private getMerchantDetails() {
    // These are the constant sender details
    return {
      accountNo: '1006696629',
      bankCode: '090470',
      bankName: 'DOTMFB',
      fullName: 'BONGO TECHNOLOGIES LIMITED',
      kycLevel: '1',
      narration: 'test',
    };
  }

  /**
   * Save transfer record to database
   * @param userId User ID
   * @param transferData Transfer data
   * @param responseData API response data
   */
  private async saveTransferRecord(
    userId: string,
    transferData: any,
    responseData: any,
  ) {
    // This would save the transaction record to your database
    // Implementation depends on your data model
    console.log(
      `Transfer record saved for user ${userId}, reference: ${transferData.transactionRef}`,
    );
    return true;
  }

  /**
   * Process a payment transaction
   * @param paymentData Payment transaction data
   * @returns Payment processing result
   */
  async processPayment(paymentData: any) {
    try {
      // First get the token
      const tokenResponse = await this.getAccessToken();
      const token = tokenResponse.access_token;

      // Use the token to process the payment
      const response = await this.apiClient.post(
        '/payments', // Adjust the endpoint if needed
        paymentData,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        },
      );

      return response.data;
    } catch (error) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const message =
        error.response?.data?.message || 'Failed to process payment';

      throw new HttpException(
        {
          status,
          error: message,
        },
        status,
      );
    }
  }
  /**
   * Get account details from DotBank API
   * @param accountNo Account number
   * @param bankCode Bank code
   * @returns Account details
   */
  async getAccountDetails(accountNo: string, bankCode: string) {
    try {
      // First get the token
      const tokenResponse = await this.getAccessToken();
      const token = tokenResponse.access_token;
      console.log(accountNo, bankCode, 'bad');
      // Build the exact URL as shown in your Postman screenshot
      const fullUrl = `${this.baseUrl}/banking/account-info?accountNo=${accountNo}&bankCode=${bankCode}`;

      console.log('Making direct request ', fullUrl);

      // Use axios directly to avoid any base URL issues
      const response = await axios.get(fullUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Account info request failed:', error.message);

      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }

      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const message =
        error.response?.data?.message || 'Failed to retrieve account details';

      throw new HttpException(
        {
          status,
          error: message,
        },
        status,
      );
    }
  }

  /**
   * Get bank details by bank code
   * @param bankCode Bank code
   * @returns Bank details or null if not found
   */
  async getBankByCode(bankCode: string) {
    try {
      // Get all banks
      const banks = await this.getBanks();
      console.log(banks, 'banks');
      // Find the bank with matching code
      const bank = banks.banks.find((bank) => bank.code === bankCode);

      if (!bank) {
        return null;
      }

      return {
        code: bank.code,
        name: bank.name,
        category: bank.category,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get bank by code ${bankCode}: ${error.message}`,
      );
      throw new HttpException(
        'Failed to retrieve bank information',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
// function CustomCron(EVERY_5_MINUTES: any): (target: DotBankService, propertyKey: "handlePendingTransactions", descriptor: TypedPropertyDescriptor<() => Promise<void>>) => void | TypedPropertyDescriptor<...> {
//   throw new Error('Function not implemented.');
// }
