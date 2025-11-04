import {
  BadRequestException,
  Body,
  Injectable,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { AuthService } from 'src/auth/services/auth.service';
import { last } from 'rxjs';

@Injectable()
export class AptPayService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
  ) {}

  /**
   * Retrieves user data and formats it for AptPay identity creation
   */
  async prepareIdentityPayload(userId: number) {
    // Query the user from your database
    const user = await this.userRepository.findOne({
      where: { id: userId },
      //   relations: ['address', 'profile'], // Include any related entities you need
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }
    // Transform user data to AptPay format
    const identityPayload = {
      individual: true,
      first_name: user.firstName,
      last_name: user.lastName,
      street: user.address.street,
      city: user.address.city,
      zip: user.address.zipCode,
      country: user.country, // Fixed: Use 'CA' for Canada
      email: user.interacEmailAddress,
      clientId: user.id, // Or another unique identifier in your system
      // province: user.address.city,
      // phone: user.phoneNumber,
    };

    // Add optional fields if available
    // if (user.dateOfBirth) {
    //   identityPayload['dateOfBirth'] = user.dateOfBirth;
    // }

    // if (user.phoneNumber) {
    //   identityPayload['phone'] = user.phoneNumber;
    // }

    // if (user.) {
    //   identityPayload['individual'] = false;
    //   identityPayload['business_name'] = user.businessName;
    // }

    return identityPayload;
  }

  /**
   * Calculates the HMAC-SHA512 hash for AptPay authentication
   */
  calculateBodyHash(requestBody: string): string {
    const secretKey = this.configService.get('APTPAY_SECRET_KEY');
    return crypto
      .createHmac('sha512', secretKey)
      .update(requestBody)
      .digest('hex');
  }

  /**
   * Creates an identity in AptPay for the user
   */
  async createAptPayIdentity(userId: number) {
    // Get user data in the correct format
    const identityPayload = await this.prepareIdentityPayload(userId);

    //  const existingUser=await this.userService.findUserById(userId);

    //   // Check if the user already has an AptPay identity
    //   if (existingUser.aptPayIdentityId) {
    //     throw new BadRequestException(
    //       `User with ID ${userId} already has an AptPay identity`,
    //     );
    //   }

    // Convert to JSON string for hash calculation and request body
    const requestBody = JSON.stringify(identityPayload);

    // Calculate body hash
    const bodyHash = this.calculateBodyHash(requestBody);

    // AptPay API details
    const apiUrl = 'https://sec.sandbox.aptpay.com/identities/add';
    const clientKey = this.configService.get('APTPAY_CLIENT_KEY');

    try {
      // Make API request to AptPay using axios
      const response = await axios.post(apiUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          AptPayApiKey: clientKey,
          'body-hash': bodyHash,
        },
      });

      // Store the AptPay identity ID in your user record
      await this.userRepository.update(userId, {
        aptPayIdentityId: response.data.id,
      });

      return {
        success: true,
        identityId: response.data.id,
        status: response.data.status,
      };
    } catch (error) {
      console.error(
        'AptPay identity creation failed:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  /**
   * Updates an existing identity in AptPay
   */
  async updateIdentity(
    aptPayIdentityId: string,
    updateData: any,
  ): Promise<any> {
    // Convert to JSON string for hash calculation and request body
    const requestBody = JSON.stringify(updateData);

    // Calculate body hash
    const bodyHash = this.calculateBodyHash(requestBody);

    // AptPay API details
    const apiUrl = `https://sec.sandbox.aptpay.com/identities/${aptPayIdentityId}`;
    const clientKey = this.configService.get('APTPAY_CLIENT_KEY');

    try {
      // Make API request to AptPay
      const response = await axios.put(apiUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          AptPayApiKey: clientKey,
          'body-hash': bodyHash,
        },
      });

      return {
        success: true,
        status: response.status,
        message: 'Identity updated successfully',
      };
    } catch (error) {
      console.error(
        'AptPay identity update failed:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  /**
   * Retrieves a list of all identities from AptPay
   */
  async getIdentities(): Promise<any> {
    // AptPay API details
    const apiUrl = 'https://sec.sandbox.aptpay.com/identities';
    const clientKey = this.configService.get('APTPAY_CLIENT_KEY');

    // For GET requests, we typically pass an empty string to the hash function
    // const bodyHash = this.calculateBodyHash();

    try {
      // Make API request to AptPay
      const response = await axios.get(apiUrl, {
        headers: {
          'Content-Type': 'application/json',
          AptPayApiKey: clientKey,
          //   'body-hash': bodyHash,
        },
      });

      return response.data;
    } catch (error) {
      console.error(
        'Failed to retrieve AptPay identities:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  /**
   * Creates a disbursement (payment) to a user's bank account
   */

  async createDisbursement(data: {
    amount: number;
    interacEmail: string;
    recipientName: string;
    note?: string;
    identityId: string;
    disbursementNumber: string;
    referenceId: string;
  }): Promise<any> {
    const apiUrl = `${this.configService.get('APTPAY_API_URL')}/disbursements/add`;
    const clientKey = this.configService.get('APTPAY_CLIENT_KEY');
    const aptToken = this.configService.get('APTPAY_TOKEN');

    // Prepare the request payload for AptPay API
    const requestPayload = {
      amount: data.amount.toFixed(2),
      transactionType: 'INTERAC',
      disbursementNumber: data.disbursementNumber,
      identityId: data.identityId,
      referenceId: data.referenceId,
      recipientEmail: data.interacEmail,
      recipientName: data.recipientName,
      note: data.note || '',
    };

    // Convert to JSON string for hash calculation and request body
    const requestBody = JSON.stringify(requestPayload);

    // Calculate body hash
    const bodyHash = this.calculateBodyHash(requestBody);

    try {
      // Make API request to AptPay
      const response = await axios.post(apiUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          AptPayApiKey: clientKey,
          'body-hash': bodyHash,
          aptoken: aptToken,
        },
      });

      return {
        success: true,
        data: response.data,
        disbursementId: response.data.id,
        status: response.data.status,
        message: 'Disbursement created successfully',
      };
    } catch (error) {
      console.error(
        'Failed to create disbursement:',
        error.response?.data || error.message,
      );

      // Return structured error response
      return {
        success: false,
        message:
          error.response?.data?.message ||
          error.message ||
          'Disbursement failed',
        errors: error.response?.data?.errors || error.message,
        data: error.response?.data || null,
      };
    }
  }
  /**
   * Creates a Request Pay transaction
   */
  async createRequestPayTransaction(data: {
    amount: number;
    identityId: string;
    referenceId: string;
    email?: string; // Added to match the Figma design
    firstName?: string; // Added to match the Figma design
    lastName?: string; // Added to match the Figma design
  }): Promise<any> {
    const apiUrl = `${this.configService.get('APTPAY_API_URL')}/request-pay/create`;
    const clientKey = this.configService.get('APTPAY_CLIENT_KEY');

    // Prepare request data
    const requestData: any = {
      amount: data.amount,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      referenceId: data.referenceId,
    };

    // Convert to JSON string for hash calculation and request body
    const requestBody = JSON.stringify(requestData);

    // Calculate body hash
    const bodyHash = this.calculateBodyHash(requestBody);

    try {
      // Make API request to AptPay
      const response = await axios.post(apiUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          AptPayApiKey: clientKey,
          'body-hash': bodyHash,
        },
      });

      console.log(response.data, 'response from aptpay request pay');

      return {
        success: true,
        data: response.data,
        senderEmail: data.email,
        transactionId: response.data.id,
        referenceId: response.data.referenceId,
        message: 'Request Pay transaction created successfully',
      };
    } catch (error) {
      console.error(
        'Failed to create Request Pay transaction:',
        error.response?.data || error.message,
      );
      return error.response?.data;
    }
  }
  /**
   * Registers or updates a webhook URL with AptPay
   */
  async registerWebhook(webhookUrl: string): Promise<any> {
    // const apiUrl = `${this.configService.get('APTPAY_API_URL')}/webhook`;
    const apiUrl = 'https://sec.sandbox.aptpay.com/webhook';
    const clientKey = this.configService.get('APTPAY_CLIENT_KEY');
    console.log(apiUrl, 'apiUrl from aptpay service');
    const requestData = {
      url: webhookUrl,
    };

    // Convert to JSON string for hash calculation and request body
    const requestBody = JSON.stringify(requestData);

    // Calculate body hash
    const bodyHash = this.calculateBodyHash(requestBody);

    try {
      // Make API request to AptPay
      const response = await axios.post(apiUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          AptPayApiKey: clientKey,
          'body-hash': bodyHash,
        },
      });

      console.log(`AptPay webhook registered successfully: ${webhookUrl}`);

      return {
        success: true,
        status: response.data.status,
      };
    } catch (error) {
      console.error(
        `Failed to register AptPay webhook: ${error.response?.data || error.message}`,
      );
      throw error;
    }
  }

  /**
   * Generates a verification link for identity verification
   */
  async generateVerificationLink(
    userId: number,
    email: string,
    requireGeoLocation: boolean = true,
  ): Promise<any> {
    const apiUrl = `${this.configService.get('APTPAY_API_URL')}/identity/vp/sendverificationlink`;
    const clientKey = this.configService.get('APTPAY_CLIENT_KEY');

    const payload = {
      email,
      requireGeoLocation,
    };

    // Convert to JSON string for hash calculation and request body
    const requestBody = JSON.stringify(payload);

    // Calculate body hash
    const bodyHash = this.calculateBodyHash(requestBody);

    try {
      // Make API request to AptPay
      const response = await axios.post(apiUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          AptPayApiKey: clientKey,
          'body-hash': bodyHash,
        },
      });

      console.log(userId, 'userId from aptpay service');
      await this.userRepository.update(userId, {
        verification_id: response.data.id,
      });
      // console.log(`Verification link generated for email: ${link}`);

      return {
        success: true,
        verificationId: response.data.id,
        verificationUrl: response.data.url,
        qrCode: response.data.qrcode,
        session: response.data.session,
      };
    } catch (error) {
      console.error(
        `Failed to generate verification link: ${error.response?.data || error.message}`,
      );
      throw error;
    }
  }

  /**
   * Gets the status of a verification session
   */
  async getVerificationStatus(sessionId: string): Promise<any> {
    const apiUrl = `${this.configService.get('APTPAY_API_URL')}/identity/vp/status/${sessionId}`;
    const clientKey = this.configService.get('APTPAY_CLIENT_KEY');

    // For GET requests, calculate hash with empty string
    const bodyHash = this.calculateBodyHash('');

    try {
      // Make API request to AptPay
      const response = await axios.get(apiUrl, {
        headers: {
          'Content-Type': 'application/json',
          AptPayApiKey: clientKey,
          'body-hash': bodyHash,
        },
      });

      return {
        success: true,
        status: response.data.status,
        details: response.data,
      };
    } catch (error) {
      console.error(
        `Failed to get verification status: ${error.response?.data || error.message}`,
      );
      throw error;
    }
  }

  /**
   * Gets the detailed result of an identity verification by ID
   */
  async getIdentityVerificationResult(
    verificationId: number | string,
  ): Promise<any> {
    const apiUrl = `${this.configService.get('APTPAY_API_URL')}/identity/vp/verification?id=${verificationId}`;
    const clientKey = this.configService.get('APTPAY_CLIENT_KEY');

    // For GET requests, calculate hash with empty string
    const bodyHash = this.calculateBodyHash('');

    try {
      // Make API request to AptPay
      const response = await axios.get(apiUrl, {
        headers: {
          'Content-Type': 'application/json',
          AptPayApiKey: clientKey,
          'body-hash': bodyHash,
        },
      });

      // If verification is successful, update user's kycStatus and other fields
      if (response.data.success === 1) {
        const user = await this.userRepository.findOne({
          where: { verification_id: String(verificationId) },
        });
        if (user) {
          await this.userRepository.update(user.id, {
            kycStatus: 'SUCCESS',
          });
        }
      }
      console.log(
        `Retrieved identity verification result for ID: ${verificationId}`,
      );

      return response.data;
    } catch (error) {
      console.error(
        `Failed to get identity verification result: ${error.response?.data || error.message}`,
      );
      throw error;
    }
  }
}
