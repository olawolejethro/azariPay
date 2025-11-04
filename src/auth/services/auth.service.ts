// src/auth/services/auth.service.ts

import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
  GoneException,
} from '@nestjs/common';

import { CustomTooManyRequestsException } from '../../common/exceptions/custom-too-many-requests.exception';

import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Not, Repository } from 'typeorm';

import { Gender, User, UserRole } from '../entities/user.entity';
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

import * as bcrypt from 'bcryptjs'; // Updated import to 'bcryptjs'
import { JwtService } from '@nestjs/jwt';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import crypto, { createVerify } from 'crypto';
import { RedisService } from '../../common/redis/redis.service';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { LoggerService } from '../../common/logger/logger.service'; // Updated import
import axios from 'axios';
import { FileStoreService } from 'src/filestore/services/filestore.service';
import { PassThrough } from 'stream';
import { FileStore } from 'src/filestore/entities/filestore.entity';
import { ResendOtpDto } from '../dto/resent-otp.dto';
import { UpdateFcmTokenDto } from 'src/firebase/dtos/fcm-token.dto';
import {
  OnboardingStep,
  OnboardingTrackingService,
} from './onboardingTrackingService';
import { AptPayService } from 'src/wallets/services/aptPay.service';
import { WalletFactory } from 'src/wallets/factories/wallet.factory';
import { changeEmailInitiateDto } from '../dto/change-email-initiate.dto';
import { EmailChangeCompleteDto } from '../dto/email-change-complete.dto';
import { FirebaseService } from 'src/firebase/firebase.service';
import { NotificationService } from 'src/notifications/notifications.service';
import { RefreshToken } from '../entities/refresh-token.entity';
import { EncryptionService } from 'src/common/encryption/encryption.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
    private firebaseService: FirebaseService,
    private notificationsService: NotificationsService,
    private notificationService: NotificationService,
    private encryptionService: EncryptionService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,

    private fileStoreService: FileStoreService,
    private readonly onboardingTrackingService: OnboardingTrackingService,
    private readonly aptPayService: AptPayService, // Assuming you have an AptPayService for AptPay integration
    private readonly WalletFactory: WalletFactory, // Assuming you have a WalletFactory for wallet creation

    private readonly logger: LoggerService, // Updated Logger Injection
  ) {}

  /**
   * Helper method to mask phone number
   */
  private maskPhoneNumber(phoneNumber: string): string {
    if (phoneNumber.length <= 4) return phoneNumber;

    const start = phoneNumber.substring(0, 4);
    const end = phoneNumber.substring(phoneNumber.length - 4);
    const masked = '*'.repeat(phoneNumber.length - 8);

    return `${start}${masked}${end}`;
  }

  private validatePasswordStrength(password: string): boolean {
    // Example criteria: at least 8 characters, 1 number, 1 special character
    const minLength = 8;
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    return password.length >= minLength && hasNumber && hasSpecialChar;
  }
  /**
   * Generates a 6-digit OTP that never starts with 0.
   * @returns A number representing the OTP.
   */
  private generateOtp(): number {
    // Generate first digit (1-9) to ensure OTP never starts with zero
    const firstDigit = Math.floor(1 + Math.random() * 9);

    // Generate remaining 5 digits (0-9)
    const remainingDigits = Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, '0');

    // Combine and convert to number
    return parseInt(`${firstDigit}${remainingDigits}`);
  }
  /**
   * Hashes a plain text password using bcryptjs.
   * @param password - The plain text password to hash.
   * @returns A promise that resolves to the hashed password string.
   */
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10); // 10 salt rounds
  }

  /**
   * Finds a user by their ID.
   * @param userId - The ID of the user to find.
   * @returns A promise that resolves to the User entity or undefined if not found.
   */
  async findUserById(userId: number): Promise<User | undefined> {
    return this.usersRepository.findOne({ where: { id: userId } });
  }

  /**
   * Find user by email using hash
   */
  private async findUserByEmail(email: string): Promise<User | null> {
    const emailHash = this.encryptionService.hash(email);
    return await this.usersRepository.findOne({
      where: { emailHash },
    });
  }

  /**
   * Check if email exists using hash
   */
  private async emailExists(email: string): Promise<boolean> {
    const emailHash = this.encryptionService.hash(email);
    const count = await this.usersRepository.count({ where: { emailHash } });
    return count > 0;
  }

  /**
   * Initiates the signup process by creating a new user and sending an OTP via SMS.
   * @param signupStartDto - Data Transfer Object containing the phone number.
   * @returns An object with a success message.
   * @throws ConflictException if a user with the provided phone number already exists.
   */
  async signupStart(signupStartDto: SignupStartDto) {
    const { phoneNumber } = signupStartDto;

    this.logger.log(
      `Signup initiation for phone number: ${phoneNumber}`,
      'AuthService',
    );

    const existingUser = await this.usersRepository.findOne({
      where: { phoneNumber },
    });

    // Check if user exists
    // if (existingUser) {
    //   this.logger.log(
    //     `User exists for phone number: ${phoneNumber}, checking password status`,
    //     'AuthService',
    //   );

    // Check if KYC is completed (assuming 'SUCCESS' means completed)

    if (existingUser) {
      if (existingUser.pin !== 'null') {
        this.logger.warn(
          `SignUp failed - KYC for user is completed: ${existingUser.id}`,
          'AuthService',
        );
        throw new UnauthorizedException('user already complete onboarding.');
      }
      this.logger.warn(
        `Signup failed - User already exists for phone number: ${phoneNumber}`,
        'AuthService',
      );
      throw new ConflictException(
        'This mobile number is linked to an existing bongo account.please login to continue',
      );
    }

    // Generate OTP (for either new users or existing users without password)
    const otp = this.generateOtp();

    // Store OTP in Redis with TTL (e.g., 3 minutes)
    await this.redisService
      .getClient()
      .set(`otp:${phoneNumber}`, otp.toString(), 'EX', 240);

    // Send OTP via Twilio
    await this.notificationsService.sendSms(
      phoneNumber,
      `Your OTP code is ${otp}`,
    );

    // Create session data to pass to next step
    const sessionData = {
      phoneNumber,
      isExistingUser: existingUser ? true : false,
    };

    // Generate session token
    const sessionToken = Buffer.from(JSON.stringify(sessionData)).toString(
      'base64',
    );

    // 🔥 CREATE ONBOARDING SESSION
    await this.onboardingTrackingService.createOnboardingSession(
      phoneNumber,
      sessionToken,
    );

    // Send OTP to email for debugging/testing
    const subject = 'Your OTP Code';
    const text = `Your OTP code is ${otp}. It is valid for 3 minutes.`;
    const html = `<p>Your OTP code is <b>${otp}</b>. It is valid for 3 minutes.</p>`;

    await this.notificationsService.sendEmail(
      'kiddoprecious@gmail.com',
      subject,
      text,
      html,
    );

    await this.notificationsService.sendEmail(
      'jethroolawole249@gmail.com',
      subject,
      text,
      html,
    );

    this.logger.log(
      `OTP sent to phone number: ${phoneNumber} and OTP is: ${otp}`,
      'AuthService',
    );

    // Return with currentScreen for users without passwords
    return {
      data: {},
      message: `An OTP ${otp} has been sent to your phone number ending with ${phoneNumber.slice(-4)}. OTP: ${otp}`,
      errors: {},
      sessionToken,
    };
  }

  async resendOtp(resendOtpDto: ResendOtpDto) {
    const { phoneNumber } = resendOtpDto;

    this.logger.log(
      `OTP resend request for phone number: ${phoneNumber}`,
      'AuthService',
    );

    // Generate new OTP
    const otp = this.generateOtp();

    // Store new OTP in Redis with TTL (3 minutes)
    await this.redisService
      .getClient()
      .set(`otp:${phoneNumber}`, otp.toString(), 'EX', 240);

    // Send OTP via Twilio
    await this.notificationsService.sendSms(
      phoneNumber,
      `Your new OTP code is ${otp}`,
    );

    // Create session data to pass to next step
    const sessionData = {
      phoneNumber,
    };

    // Generate session token
    const sessionToken = Buffer.from(JSON.stringify(sessionData)).toString(
      'base64',
    );

    // Send OTP to email as well
    const subject = 'Your New OTP Code';
    const text = `Your new OTP code is ${otp}. It is valid for 3 minutes.`;
    const html = `<p>Your new OTP code is <b>${otp}</b>. It is valid for 3 minutes.</p>`;

    await this.notificationsService.sendEmail(
      'kiddoprecious@gmail.com', // This should ideally be the user's email from the database
      subject,
      text,
      html,
    );

    await this.notificationsService.sendEmail(
      'jethroolawole249@gmail.com',
      subject,
      text,
      html,
    );

    this.logger.log(
      `New OTP sent to phone number: ${phoneNumber}`,
      'AuthService',
    );

    return {
      data: {},
      message: `An OTP ${otp} has been sent to your phone number ending with ${phoneNumber.slice(-4)}. OTP: ${otp}`,
      errors: {},
      sessionToken,
    };
  }

  /**
   * Verifies the OTP provided by the user during signup.
   * @param signupVerifyOtpDto - Data Transfer Object containing phone number, OTP, device ID, and metadata.
   * @returns An object containing the onboarding authorization token.
   * @throws UnauthorizedException if the OTP is invalid or expired.
   * @throws NotFoundException if the user does not exist.
   */
  async signupVerifyOtp(signupVerifyOtpDto: SignupVerifyOtpDto) {
    const { phoneNumber, otp, deviceId, deviceMetadata } = signupVerifyOtpDto;

    this.logger.log(
      `OTP verification for phone number: ${phoneNumber}`,
      'AuthService',
    );

    // Check for too many attempts first
    const attemptKey = `signupOtpAttempts:${phoneNumber}`;
    const attempts = await this.redisService.getClient().get(attemptKey);
    const attemptCount = attempts ? parseInt(attempts) : 0;

    if (attemptCount >= 3) {
      this.logger.warn(
        `Signup OTP verification failed - Too many attempts for phone number: ${phoneNumber}`,
        'AuthService',
      );
      // This matches your UI: "Too many incorrect attempts. Try again later."
      throw new CustomTooManyRequestsException(
        'Too many incorrect attempts. Try again later.',
      );
    }

    // Retrieve OTP from Redis
    const storedOtp = await this.redisService
      .getClient()
      .get(`otp:${phoneNumber}`);

    console.log(storedOtp, 'storedOtp');

    // Check if OTP exists (not expired)
    if (!storedOtp) {
      this.logger.warn(
        `OTP verification failed - OTP expired or not found for phone number: ${phoneNumber}`,
        'AuthService',
      );
      // This matches your UI: "This code has expired. Please request a new one"
      throw new GoneException(
        'This code has expired. Please request a new one',
      );
    }

    // Check if OTP matches
    if (storedOtp !== otp.toString()) {
      // Increment attempt counter
      const newAttemptCount = attemptCount + 1;
      await this.redisService
        .getClient()
        .set(attemptKey, newAttemptCount.toString(), 'EX', 300); // 3 minutes expiry

      this.logger.warn(
        `OTP verification failed - Invalid OTP for phone number: ${phoneNumber}, attempt ${newAttemptCount}`,
        'AuthService',
      );

      // Check if this was the 3rd attempt
      if (newAttemptCount >= 3) {
        throw new CustomTooManyRequestsException(
          'Too many incorrect attempts. Try again later.',
        );
      }

      // This matches your UI: "Invalid code please try again"
      throw new BadRequestException('Invalid code please try again');
    }

    // OTP is valid, clear attempt counter and delete OTP from Redis
    await this.redisService.getClient().del(attemptKey);
    await this.redisService.getClient().del(`otp:${phoneNumber}`);

    // 🔥 UPDATE ONBOARDING PROGRESS
    await this.onboardingTrackingService.markPhoneVerified(phoneNumber);

    return {
      // data: {
      //   onboardingAuthorizationToken: user.onboardingAuthorizationToken,
      // },
      message: 'Phone number verified successfully.',
      errors: {},
    };
  }

  /**
   * Generates a JWT token for a user.
   * @param userId - The ID of the user.
   * @param phoneNumber - The phone number of the user.
   * @returns A signed JWT token string.
   */
  // private generateJwtToken(userId: number, phoneNumber: string): string {
  //   const payload = { sub: userId, phoneNumber };
  //   return this.jwtService.sign(payload);
  // }

  /**
   * Saves basic information provided by the user during signup.
   * @param userId - The ID of the user.
   * @param signupBasicInfoDto - Data Transfer Object containing basic user information.
   * @returns An object with the saved user information.
   * @throws NotFoundException if the user does not exist.
   */
  async signupBasicInfo(
    signupBasicInfoDto: SignupBasicInfoDto,
    sessionToken: string,
  ) {
    this.logger.log(`Processing basic info with session token`, 'AuthService');

    // Decode the session token to get phone number
    const sessionData = JSON.parse(
      Buffer.from(sessionToken, 'base64').toString('utf-8'),
    );

    if (!sessionData.phoneNumber) {
      this.logger.warn(
        `Basic info saving failed - Invalid session token`,
        'AuthService',
      );
      throw new UnauthorizedException('Invalid session token.');
    }

    const { phoneNumber } = sessionData;

    const existingUser = await this.findUserByEmail(
      signupBasicInfoDto.interacEmailAddress,
    );

    if (existingUser) {
      throw new ConflictException('A user with this email already exists.');
    }
    // Find user by phone number
    const user = await this.usersRepository.findOne({
      where: { phoneNumber },
    });
    const emailHash = this.encryptionService.hash(
      signupBasicInfoDto.interacEmailAddress,
    );
    // Create a new user
    const newUser = this.usersRepository.create({
      phoneNumber,
      firstName: signupBasicInfoDto.firstName,
      lastName: signupBasicInfoDto.lastName,
      interacEmailAddress: signupBasicInfoDto.interacEmailAddress,
      emailHash,
      address: signupBasicInfoDto.address,
      dateOfBirth: signupBasicInfoDto.dateOfBirth,
      gender: signupBasicInfoDto.gender as unknown as Gender,
      occupation: signupBasicInfoDto.occupation,
      expectedTransactionVolume: signupBasicInfoDto.expectedTransactionVolume,
      role: UserRole.USER,
    });

    // Save the new user
    const savedUser = await this.usersRepository.save(newUser);

    try {
      // Call the WalletFactoryService to create a wallet for the new user
      await this.WalletFactory.createWallet(savedUser.id);
      this.logger.log(
        `Wallet creation initiated for user ID: ${savedUser.id}`,
        'AuthService',
      );
    } catch (error) {
      this.logger.error(
        `Failed to create wallet for user ID: ${savedUser.id} - ${error.message}`,
        'AuthService',
      );
      // Optionally, you can throw or handle the error as needed
    }

    this.logger.log(
      `Basic info saved for user ID: ${savedUser.id}`,
      'AuthService',
    );

    // Generate access token with role included
    const payload = {
      sub: savedUser.id,
      phoneNumber: savedUser.phoneNumber,
      role: savedUser.role, // Include the role in the token
    };
    const accessToken = this.generateJwtToken(
      user.id,
      user.phoneNumber,
      user.tokenVersion, // Include token version
    );

    // Generate refresh token if needed
    const refreshToken = this.jwtService.sign(
      { sub: savedUser.id, role: savedUser.role }, // Include role in refresh token too
      { expiresIn: '7d' },
    );

    // 🔥 UPDATE ONBOARDING PROGRESS
    await this.onboardingTrackingService.markBasicInfoCompleted(
      phoneNumber,
      savedUser.id,
    );

    return {
      data: {
        // id: savedUser.id,
        // firstName: savedUser.firstName,
        // lastName: savedUser.lastName,
        // interacEmailAddress: savedUser.interacEmailAddress,
        // address: savedUser.address.city,
        // dateOfBirth: savedUser.dateOfBirth,
        accessToken,
        refreshToken,
      },
      message: 'Your information has been saved successfully.',
      errors: {},
    };
  }

  /**
   * Sets up the user's password during signup.
   * @param userId - The ID of the user.
   * @param signupPasswordDto - Data Transfer Object containing the new password.
   * @returns An object with a success message.
   * @throws NotFoundException if the user does not exist.
   */
  async signupPassword(userId: number, signupPasswordDto: SignupPasswordDto) {
    this.logger.log(`Setting password for user ID: ${userId}`, 'AuthService');

    const user = await this.findUserById(userId);

    if (!user) {
      this.logger.warn(
        `Password setup failed - User not found for user ID: ${userId}`,
        'AuthService',
      );
      throw new NotFoundException('User not found.');
    }

    // Hash password
    const hashedPassword = await this.hashPassword(signupPasswordDto.password);
    user.password = hashedPassword;

    await this.usersRepository.save(user);

    // 🔥 UPDATE ONBOARDING PROGRESS
    await this.onboardingTrackingService.markPasswordCompleted(
      user.phoneNumber,
    );
    this.logger.log(
      `Password set successfully for user ID: ${user.id}`,
      'AuthService',
    );

    return {
      data: {},
      message: 'Password set successfully.',
      errors: {},
    };
  }

  async getOnboardingStatusByPhoneNumber(phoneNumber: string) {
    this.logger.log(
      `Getting onboarding status for user : ${phoneNumber}`,
      'AuthService',
    );
    // Accept phone number as input, find user, and get userId
    console.log(phoneNumber, 'phoneNumber');
    const user = await this.usersRepository.findOne({
      where: { phoneNumber: phoneNumber },
    });
    console.log(user, 'user');
    if (!user) {
      this.logger.warn(
        `Onboarding status failed - User not found for phone number: ${phoneNumber}`,
        'AuthService',
      );
      return {
        data: {
          shouldResume: false,
          currentStep: null,
        },
        message: 'No active onboarding session found.',
        errors: {},
      };
    }

    const state =
      await this.onboardingTrackingService.getOnboardingStateByUserId(user.id);

    console.log(state, 'state');

    // if (!state || state.currentStep === OnboardingStep.COMPLETED) {

    //   return {
    //     data: {
    //       shouldResume: false,
    //       currentStep: null,
    //     },
    //     message: 'No active onboarding session found.',
    //     errors: {},
    //   };

    // }

    if (!state || state.currentStep === OnboardingStep.COMPLETED) {
      this.logger.warn(
        `User ${phoneNumber} has already completed onboarding or no active session found`,
        'AuthService',
      );
      throw new BadRequestException('User has already completed onboarding');
    }
    return {
      data: {
        shouldResume: true,
        currentStep: state.currentStep,
        data: state.data,
        completedSteps: state.completedSteps,
      },
      message: 'Onboarding status retrieved successfully.',
      errors: {},
    };
  }

  async checkVerificationStatus(userId: number) {
    this.logger.log(
      `Checking verification status for user ID: ${userId}`,
      'AuthService',
    );

    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    // Get current onboarding state
    const onboardingState =
      await this.onboardingTrackingService.getOnboardingState(user.phoneNumber);
    if (!onboardingState) {
      throw new NotFoundException('No active onboarding session found.');
    }

    // Check if already processed
    if (onboardingState.data.verificationStatus === 'success') {
      return {
        data: {
          verificationStatus: 'success',
          currentStep: 'verification_success',
          nextStep: 'biometrics',
        },
        message: 'Verification already completed successfully.',
        errors: {},
      };
    }

    // Check verification status from AptPay or your database
    // You'll need to implement this based on AptPay's status checking API
    const verificationStatus =
      await this.aptPayService.getIdentityVerificationResult(
        user.verification_id,
      );

    if (verificationStatus && verificationStatus.success === 1) {
      const userByVerificationId = await this.usersRepository.findOne({
        where: { verification_id: String(user.verification_id) },
      });
    }

    if (verificationStatus && verificationStatus.success === 1) {
      // Verification successful - update onboarding
      await this.onboardingTrackingService.markVerificationSuccess(
        user.phoneNumber,
      );

      return {
        data: {
          verificationStatus: 'success',
          currentStep: 'verification_success',
          nextStep: 'biometrics',
        },
        message:
          'Verification completed successfully. You can now proceed to biometrics setup.',
        errors: {},
      };
    }
  }
  /**
   * Get onboarding status by identifier (phoneNumber)
   */
  async getOnboardingStatus(identifier: string) {
    this.logger.log(
      `Getting onboarding status for identifier: ${identifier}`,
      'AuthService',
    );

    const resumeInfo =
      await this.onboardingTrackingService.getResumeInfo(identifier);

    if (!resumeInfo || !resumeInfo.shouldResume) {
      return {
        data: {
          shouldResume: false,
          currentStep: null,
        },
        message: 'No active onboarding session found.',
        errors: {},
      };
    }

    // Get additional user info if userId exists
    let userInfo = null;
    const onboardingState =
      await this.onboardingTrackingService.getOnboardingState(identifier);

    if (onboardingState?.userId) {
      const user = await this.findUserById(onboardingState.userId);
      if (user) {
        userInfo = {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          interacEmailAddress: user.interacEmailAddress,
        };
      }
    }

    return {
      data: {
        ...resumeInfo,
        userInfo,
      },
      message: 'Onboarding status retrieved successfully.',
      errors: {},
    };
  }

  /**
   * Generates an access token for performing a liveness check.
   * @param userId - The unique identifier of the user.
   * @param levelName - The verification level for the liveness check (e.g., 'basic-kyc-level').
   * @returns An object containing the generated access token.
   * @throws BadRequestException if the access token generation fails.
   */
  // async getAccessToken(
  //   userId: string,
  //   levelName: string,
  // ): Promise<{ data: any }> {
  //   try {
  //     const axiosInstance = axios.create();
  //     axiosInstance.interceptors.request.use(
  //       this.createSignature,
  //       function (error) {
  //         return Promise.reject(error);
  //       },
  //     );

  //     const sumsubBaseUrl = 'https://api.sumsub.com'; // Use sandbox API endpoint
  //     const appToken =
  //       'sbx:FlEMNT4Z8dD5WtQuyFZHvnXG.syxkIQuGf6WhV63HwCLGGzEEmDMQ7GX0';
  //     const appSecret = 'LlY5bV6xujbUbV1RHVFjvPHQwUVmHMUg';

  //     const reqConfig = {} as any;
  //     reqConfig.baseURL = sumsubBaseUrl;
  //     reqConfig.appSecret = appSecret;

  //     let method = 'post';
  //     let url =
  //       '/resources/accessTokens?userId=' +
  //       encodeURIComponent(userId) +
  //       '&ttlInSecs=' +
  //       1200 +
  //       '&levelName=' +
  //       encodeURIComponent(levelName);

  //     const headers = {
  //       Accept: 'application/json',
  //       'X-App-Token': appToken,
  //     };

  //     reqConfig.method = method;
  //     reqConfig.url = url;
  //     reqConfig.headers = headers;
  //     reqConfig.data = null;

  //     const response = await axiosInstance(reqConfig);

  //     return { data: response.data };
  //   } catch (error) {
  //     console.log(error, 'error');
  //     this.logger.error(
  //       `Sumsub API error: ${JSON.stringify({
  //         error: error.response?.data,
  //         status: error.response?.status,
  //         timestamp: new Date().toISOString(),
  //       })}`,
  //     );

  //     throw new BadRequestException(
  //       error.response?.data?.description || 'Failed to generate access token',
  //     );
  //   }
  // }

  async getAccessToken(
    userId: string,
    levelName: string,
  ): Promise<{ data: any }> {
    try {
      const axiosInstance = axios.create();
      axiosInstance.interceptors.request.use(
        this.createSignature,
        function (error) {
          return Promise.reject(error);
        },
      );

      const sumsubBaseUrl = 'https://api.sumsub.com';
      const appToken =
        'sbx:FlEMNT4Z8dD5WtQuyFZHvnXG.syxkIQuGf6WhV63HwCLGGzEEmDMQ7GX0';
      const appSecret = 'LlY5bV6xujbUbV1RHVFjvPHQwUVmHMUg';

      const reqConfig = {} as any;
      reqConfig.baseURL = sumsubBaseUrl;
      reqConfig.appSecret = appSecret;

      // ✅ Fix: Use GET method instead of POST
      let method = 'post';
      let url = `/resources/accessTokens?userId=${encodeURIComponent(userId)}&ttlInSecs=1200&levelName=${encodeURIComponent(levelName)}`;

      const headers = {
        Accept: 'application/json',
        'X-App-Token': appToken,
      };

      reqConfig.method = method;
      reqConfig.url = url;
      reqConfig.headers = headers;
      // ✅ Fix: Remove data field entirely for GET requests
      // reqConfig.data = null; // Remove this line

      const response = await axiosInstance(reqConfig);
      return { data: response.data };
    } catch (error) {
      console.log(error, 'error');
      this.logger.error(
        `Sumsub API error: ${JSON.stringify({
          error: error.response?.data,
          status: error.response?.status,
          timestamp: new Date().toISOString(),
        })}`,
      );

      throw new BadRequestException(
        error.response?.data?.description || 'Failed to generate access token',
      );
    }
  }

  /**
   * Generates a signature for Sumsub API authentication.
   * @returns request obj.
   */
  private createSignature(config: any) {
    const ts = Math.floor(Date.now() / 1000);
    const appSecret = 'LlY5bV6xujbUbV1RHVFjvPHQwUVmHMUg';

    const method = config.method.toUpperCase();
    const url = config.url;

    // Build signature string: timestamp + method + url (NO BODY for GET requests)
    let signatureString = ts + method + url;

    // ✅ CRITICAL: Only add body for non-GET requests
    if (method !== 'GET' && config.data) {
      if (config.data instanceof FormData) {
        signatureString += config.data.getBuffer();
      } else {
        signatureString += config.data;
      }
    }

    const sig = crypto
      .createHmac('sha256', appSecret)
      .update(signatureString)
      .digest('hex')
      .toLowerCase(); // ✅ CRITICAL: Must be lowercase

    config.headers['X-App-Access-Ts'] = ts;
    config.headers['X-App-Access-Sig'] = sig;

    // Debug logging
    console.log('=== Signature Debug ===');
    console.log('Timestamp:', ts);
    console.log('Method:', method);
    console.log('URL:', url);
    console.log('Full signature string:', signatureString);
    console.log('Generated signature:', sig);
    console.log('======================');

    return config;
  }

  /**
   * Retrieves the liveness verification results for a given applicant.
   * @param applicantId - The unique identifier of the applicant in Sumsub.
   * @returns The liveness verification results.
   * @throws NotFoundException if the applicant or results are not found.
   * @throws BadRequestException for other errors during the API call.
   */
  async getLivenessResults(applicantId: string): Promise<any> {
    try {
      const sumsubBaseUrl = 'https://api.sumsub.com';

      // Generate a JWT for API authentication
      // const jwtToken = this.generateSumsubJwt();
      const jwtToken = 'this.generateSumsubJwt()';

      // Make a GET request to Sumsub API
      const response = await axios.get(
        `${sumsubBaseUrl}/resources/applicants/${applicantId}/checks`,
        {
          headers: {
            Authorization: `Bearer ${jwtToken}`,
          },
        },
      );

      // Return the results
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new NotFoundException('Liveness verification results not found.');
      }

      throw new BadRequestException(
        error.response?.data?.description ||
          'Failed to retrieve verification results.',
      );
    }
  }

  /**
   * Performs a liveness check using biometric data.
   * @param userId - The ID of the user.
   * @param signupLivenessDto - Data Transfer Object containing biometric data.
   * @returns An object with a success message.
   * @throws UnauthorizedException if liveness verification fails.
   */
  async signupLiveness(userId: number, signupLivenessDto: SignupLivenessDto) {
    this.logger.log(
      `Performing liveness check for user ID: ${userId}`,
      'AuthService',
    );

    // Implement liveness check logic using biometric data
    // Integrate with a biometric verification service (e.g., Face++)

    // Example placeholder:
    const isLivenessVerified = true; // Replace with actual verification logic

    if (!isLivenessVerified) {
      this.logger.warn(
        `Liveness check failed for user ID: ${userId}`,
        'AuthService',
      );
      throw new UnauthorizedException('Liveness verification failed.');
    }

    this.logger.log(
      `Liveness verification successful for user ID: ${userId}`,
      'AuthService',
    );

    return {
      data: {},
      message: 'Liveness verification successful.',
      errors: {},
    };
  }

  // // Helper: Generate Sumsub JWT Token
  // private generateSumsubJwt(appToken: string, secretKey: string): string {
  //   const payload = {
  //     sub: appToken, // Subject
  //   };

  //   return this.jwtService.sign(payload, {
  //     secret: secretKey,
  //     expiresIn: '5m', // Token expiration in 5 minutes
  //   });
  // }

  // Helper: Upload Media to Sumsub
  private async uploadMediaToSumsub(
    baseUrl: string,
    jwtToken: string,
    media: string,
    mediaType: string,
  ) {
    try {
      const formData = new FormData();
      const blob = new Blob([Buffer.from(media, 'base64')], {
        type: mediaType,
      });
      formData.append('content', blob, 'media');

      const response = await axios.post(
        `${baseUrl}/resources/storage`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${jwtToken}`,
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        'Failed to upload media to Sumsub.',
        error.response?.data || error.message,
      );
      throw new BadRequestException(
        'Failed to upload media for liveness verification.',
      );
    }
  }

  /**
   * Performs identity verification using provided documents.
   * @param userId - The ID of the user.
   * @param signupIdentityDto - Data Transfer Object containing identity documents.
   * @returns An object with a success message.
   * @throws NotFoundException if the user does not exist.
   * @throws BadRequestException if identity verification fails.
   */
  async signupIdentity(userId: number, signupIdentityDto: SignupIdentityDto) {
    this.logger.log(
      `Performing identity verification for user ID: ${userId}`,
      'AuthService',
    );

    const user = await this.findUserById(userId);

    if (!user) {
      this.logger.warn(
        `Identity verification failed - User not found for user ID: ${userId}`,
        'AuthService',
      );
      throw new NotFoundException('User not found.');
    }

    // Implement identity verification logic
    // Integrate with an identity verification service (e.g., Onfido)

    // Example placeholder:
    const isIdentityVerified = true; // Replace with actual verification logic

    if (!isIdentityVerified) {
      this.logger.warn(
        `Identity verification failed for user ID: ${userId}`,
        'AuthService',
      );
      throw new BadRequestException(
        'Identity verification failed due to invalid documents.',
      );
    }

    this.logger.log(
      `Identity verification completed for user ID: ${userId}`,
      'AuthService',
    );

    return {
      data: {},
      message: 'Identity verification completed successfully.',
      errors: {},
    };
  }

  // ================================
  // SERVICE - Enhanced Signin Implementation
  // ================================
  async signin(signinDto: SigninDto) {
    const { phoneNumber, password, payload, signature } = signinDto;

    this.logger.log(
      `Signin attempt for phone number: ${phoneNumber}`,
      'AuthService',
    );

    // Validate that either password or (payload AND signature) is provided
    if (!password && !(payload && signature)) {
      throw new BadRequestException(
        'Authentication required. Please provide credentials.',
      );
    }

    // ============================================
    // IP-BASED RATE LIMITING (Check First)
    // ============================================
    const ipAttemptKey = `login:attempts:ip:${signinDto.ipAddress}`;
    const ipAttempts = await this.redisService.getClient().get(ipAttemptKey);

    if (ipAttempts && parseInt(ipAttempts) >= 10) {
      this.logger.warn(
        `IP-based rate limit exceeded for IP: ${signinDto.ipAddress}`,
        'AuthService',
      );
      throw new CustomTooManyRequestsException(
        'Too many failed login attempts from this IP address. Please try again later.',
      );
    }

    // ============================================
    // FIND USER
    // ============================================
    const user = await this.usersRepository.findOne({
      where: { phoneNumber },
      select: [
        'id',
        'phoneNumber',
        'password',
        'lockUntil',
        'pin',
        'kycStatus',
        'interacEmailAddress',
        'deviceMetadata',
        'tokenVersion',
      ],
    });

    if (!user) {
      // Increment IP attempts even for invalid phone numbers (prevent enumeration)
      await this.redisService.getClient().incr(ipAttemptKey);
      await this.redisService.getClient().expire(ipAttemptKey, 900); // 15 minutes

      this.logger.warn(
        `Signin failed - User not found for phone number: ${phoneNumber}`,
        'AuthService',
      );

      // Generic error message - don't reveal if phone exists
      throw new UnauthorizedException('Invalid credentials.');
    }

    // ============================================
    // CHECK ACCOUNT LOCKOUT
    // ============================================
    if (user.lockUntil && user.lockUntil > new Date()) {
      this.logger.warn(
        `Signin failed - Account locked for user ID: ${user.id}`,
        'AuthService',
      );
      throw new CustomTooManyRequestsException(
        'Account is locked. Please try again later.',
      );
    }

    // ============================================
    // CHECK ONBOARDING/KYC STATUS
    // ============================================
    const onboardingCompleted =
      user.pin !== null && user.kycStatus === 'SUCCESS';

    if (!onboardingCompleted) {
      this.logger.log(
        `User ${user.id} signed in but onboarding not completed`,
        'AuthService',
      );
    }

    // ============================================
    // GET CURRENT ATTEMPT COUNT FROM REDIS
    // ============================================
    const attemptKey = `login:attempts:user:${user.id}`;
    const currentAttempts = parseInt(
      (await this.redisService.getClient().get(attemptKey)) || '0',
    );

    // ============================================
    // ATTEMPT AUTHENTICATION
    // ============================================
    let isAuthenticated = false;
    let authMethod: 'password' | 'signature' | null = null;

    // Try password authentication first
    if (password) {
      try {
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (isPasswordValid) {
          isAuthenticated = true;
          authMethod = 'password';
          this.logger.log(
            `Password authentication successful for user ID: ${user.id}`,
            'AuthService',
          );
        }
      } catch (error) {
        this.logger.error(
          `Password verification error for user ID: ${user.id}`,
          error.stack,
          'AuthService',
        );
      }
    }

    // Try signature authentication if password didn't authenticate
    if (!isAuthenticated && payload && signature) {
      try {
        const isSignatureValid = await this.verifyUserSignature(
          user.id,
          payload,
          signature,
        );

        if (isSignatureValid) {
          isAuthenticated = true;
          authMethod = 'signature';
          this.logger.log(
            `Biometrics authentication successful for user ID: ${user.id}`,
            'AuthService',
          );
        }
      } catch (error) {
        this.logger.error(
          `Signature verification error for user ID: ${user.id}`,
          error.stack,
          'AuthService',
        );
      }
    }

    // ============================================
    // HANDLE AUTHENTICATION FAILURE
    // ============================================
    if (!isAuthenticated) {
      // Increment user attempt counter in Redis
      const newAttempts = await this.redisService.getClient().incr(attemptKey);

      // Set TTL on first attempt (expires after 15 minutes)
      if (newAttempts === 1) {
        await this.redisService.getClient().expire(attemptKey, 900);
      }

      // Increment IP attempt counter
      await this.redisService.getClient().incr(ipAttemptKey);
      await this.redisService.getClient().expire(ipAttemptKey, 900);

      this.logger.warn(
        `Authentication failed for user ID: ${user.id}. Attempt ${newAttempts}/5`,
        'AuthService',
      );

      // Send warning email at exactly 5 attempts
      if (newAttempts === 5) {
        try {
          await this.notificationsService.sendEmail(
            user.interacEmailAddress,
            'Security Alert: Multiple Failed Login Attempts',
            `We detected 5 failed login attempts on your account. Your account will be locked after one more failed attempt. If this wasn't you, please secure your account immediately.`,
            `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2 style="color: #ff9800;">⚠️ Security Alert</h2>
              <p>We detected <b>5 failed login attempts</b> on your account.</p>
              <p style="color: #d32f2f;"><b>Warning:</b> Your account will be locked after one more failed attempt.</p>
              <p>If this wasn't you, please secure your account immediately by:</p>
              <ul>
                <li>Changing your password</li>
                <li>Enabling two-factor authentication</li>
                <li>Contacting support if needed</li>
              </ul>
              <p><b>Login Details:</b></p>
              <ul>
                <li>Time: ${new Date().toISOString()}</li>
                <li>IP Address: ${signinDto.ipAddress}</li>
                <li>Location: ${signinDto.location}</li>
              </ul>
            </div>
          `,
          );
        } catch (err) {
          this.logger.error(
            `Failed to send failed attempts warning email to user ID: ${user.id} - ${err.message}`,
            'AuthService',
          );
        }
      }

      // Lock account at 5 attempts
      if (newAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await this.usersRepository.save(user);

        this.logger.warn(
          `Account locked due to ${newAttempts} failed attempts for user ID: ${user.id}`,
          'AuthService',
        );

        // Send lockout notification email
        try {
          await this.notificationsService.sendEmail(
            user.interacEmailAddress,
            'Account Locked Due to Failed Login Attempts',
            `Your account has been locked for 1 hour due to multiple failed login attempts. If this wasn't you, please reset your password or contact support immediately.`,
            `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2 style="color: #d32f2f;">🔒 Account Locked</h2>
              <p>Your account has been <b>locked for 1 hour</b> due to multiple failed login attempts.</p>
              <p><b>Lockout Details:</b></p>
              <ul>
                <li>Locked At: ${new Date().toISOString()}</li>
                <li>Unlock At: ${user.lockUntil.toISOString()}</li>
                <li>Failed Attempts: ${newAttempts}</li>
                <li>IP Address: ${signinDto.ipAddress}</li>
                <li>Location: ${signinDto.location}</li>
              </ul>
              <p><b>If this wasn't you:</b></p>
              <ul>
                <li>Reset your password immediately</li>
                <li>Contact support: support@bongopay.com</li>
                <li>Review your account security settings</li>
              </ul>
              <p>Your account will automatically unlock after 1 hour, or you can reset your password to unlock it immediately.</p>
            </div>
          `,
          );
        } catch (err) {
          this.logger.error(
            `Failed to send account lock notification email to user ID: ${user.id} - ${err.message}`,
            'AuthService',
          );
        }

        throw new CustomTooManyRequestsException(
          'Account locked due to multiple failed authentication attempts. Please try again after 1 hour or reset your password.',
        );
      }

      // Generic error message for failed authentication
      throw new UnauthorizedException('Invalid credentials.');
    }

    // ============================================
    // AUTHENTICATION SUCCESSFUL
    // ============================================

    // Clear attempt counters from Redis
    await this.redisService.getClient().del(attemptKey);
    await this.redisService.getClient().del(ipAttemptKey);

    // Reset database lockout fields (redundant safety)
    user.lockUntil = null;

    // ============================================
    // CHECK IP AND LOCATION CHANGES
    // ============================================
    const previousIp = user.deviceMetadata?.ipAddress || null;
    const previousLocation = user.deviceMetadata?.location || null;
    const currentIp = signinDto.ipAddress || null;
    const currentLocation = signinDto.location || null;

    let notifyUser = false;
    let changeDetails = { ipChanged: false, locationChanged: false };

    if (currentIp && previousIp && currentIp !== previousIp) {
      notifyUser = true;
      changeDetails.ipChanged = true;
    }

    if (
      currentLocation &&
      previousLocation &&
      currentLocation !== previousLocation
    ) {
      notifyUser = true;
      changeDetails.locationChanged = true;
    }

    // Send notification if IP or location changed
    if (notifyUser) {
      try {
        await this.notificationsService.sendEmail(
          user.interacEmailAddress,
          'New Login Detected from Different Location',
          `A new login to your account was detected from a different ${changeDetails.ipChanged ? 'IP address' : 'location'}. IP: ${currentIp}, Location: ${currentLocation}. If this wasn't you, please secure your account immediately.`,
          `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #2196F3;">🔔 New Login Detected</h2>
            <p>A new login to your account was detected from a ${changeDetails.ipChanged && changeDetails.locationChanged ? 'different IP address and location' : changeDetails.ipChanged ? 'different IP address' : 'different location'}.</p>
            <p><b>Login Details:</b></p>
            <ul>
              <li>Time: ${new Date().toISOString()}</li>
              <li>IP Address: ${currentIp} ${changeDetails.ipChanged ? '(New)' : ''}</li>
              <li>Location: ${currentLocation} ${changeDetails.locationChanged ? '(New)' : ''}</li>
              <li>Authentication Method: ${authMethod}</li>
            </ul>
            ${
              previousIp || previousLocation
                ? `
              <p><b>Previous Login:</b></p>
              <ul>
                ${previousIp ? `<li>Previous IP: ${previousIp}</li>` : ''}
                ${previousLocation ? `<li>Previous Location: ${previousLocation}</li>` : ''}
              </ul>
            `
                : ''
            }
            <p><b>If this wasn't you:</b></p>
            <ul>
              <li>Change your password immediately</li>
              <li>Enable two-factor authentication</li>
              <li>Contact support: support@bongopay.com</li>
            </ul>
          </div>
        `,
        );

        this.logger.log(
          `Sent IP/location change notification to user ID: ${user.id}`,
          'AuthService',
        );
      } catch (err) {
        this.logger.error(
          `Failed to send new login notification email to user ID: ${user.id} - ${err.message}`,
          'AuthService',
        );
      }
    }
    // ============================================
    // UPDATE DEVICE METADATA
    // ============================================
    const now = new Date();
    console.log(now.toISOString(), 'now');

    // CHECK IF deviceMetadata IS NULL. IF SO, INITIALIZE IT.
    if (!user.deviceMetadata) {
      user.deviceMetadata = {}; // Initialize with an empty object
    }

    user.deviceMetadata.lastLoginAt = now.toISOString();

    if (currentIp) {
      user.deviceMetadata.ipAddress = currentIp;
    }

    if (currentLocation) {
      user.deviceMetadata.location = currentLocation;
    }

    await this.usersRepository.save(user);

    const accessToken = this.generateJwtToken(
      user.id,
      user.phoneNumber,
      user.tokenVersion,
    );
    const refreshToken = await this.createRefreshToken(user.id, {
      deviceName: signinDto.deviceName || 'Unknown Device',
      deviceType: signinDto.deviceType || 'Unknown',
      ipAddress: signinDto.ipAddress,
      location: signinDto.location,
      userAgent: signinDto.userAgent,
    });

    // Store refresh token in Redis with TTL (7 days)
    await this.redisService
      .getClient()
      .set(`refreshToken:${refreshToken}`, user.id.toString(), 'EX', 604800);

    // ============================================
    // CHECK FOR UNREAD NOTIFICATIONS
    // ============================================
    let hasUnreadNotifications = false;
    let unreadCount = 0;

    try {
      hasUnreadNotifications =
        await this.notificationService.hasUnreadNotifications(user.id);

      unreadCount = await this.notificationService.getUnreadNotificationCount(
        user.id,
      );

      this.logger.log(
        `User ${user.id} has ${unreadCount} unread notifications`,
        'AuthService',
      );
    } catch (notificationError) {
      this.logger.error(
        `Failed to check unread notifications for user ID: ${user.id}`,
        notificationError.stack,
        'AuthService',
      );
    }

    // ============================================
    // GENERATE FIREBASE CUSTOM TOKEN
    // ============================================
    let firebaseToken: string | null = null;

    try {
      firebaseToken = await this.firebaseService.createCustomToken(
        user.id.toString(),
        {
          phoneNumber: user.phoneNumber,
          authMethod,
          onboardingCompleted,
          hasUnreadNotifications,
        },
      );

      this.logger.log(
        `Firebase token generated for user ID: ${user.id}`,
        'AuthService',
      );
    } catch (error) {
      this.logger.error(
        `Failed to generate Firebase token for user ID: ${user.id}`,
        error.stack,
        'AuthService',
      );
    }

    // ============================================
    // SUCCESS RESPONSE
    // ============================================
    this.logger.log(
      `Signin successful for user ID: ${user.id} using ${authMethod} authentication`,
      'AuthService',
    );

    return {
      data: {
        id: user.id,
        phoneNumber: user.phoneNumber,
        accessToken,
        refreshToken,
        firebaseToken,
        authMethod,
        onboardingCompleted,
        hasUnreadNotifications,
        unreadNotificationCount: unreadCount,
      },
      message: onboardingCompleted
        ? 'Authentication successful.'
        : 'Authentication successful. Please complete your onboarding process.',
      errors: {},
    };
  }
  /**
   * Generates a unique refresh token using UUID v4.
   * @returns A string representing the refresh token.
   */
  private generateRefreshToken(): string {
    return uuidv4();
  }

  /**
   * Initiates the password reset process by sending an OTP to the user's phone number.
   * @param passwordResetInitiateOtpDto - Data Transfer Object containing the phone number.
   * @returns An object with a success message.
   * @throws NotFoundException if the phone number does not exist.
   */
  async passwordResetInitiateOtp(
    passwordResetInitiateOtpDto: PasswordResetInitiateOtpDto,
  ) {
    const { phoneNumber } = passwordResetInitiateOtpDto;

    this.logger.log(
      `Password reset OTP initiation for phone number: ${phoneNumber}`,
      'AuthService',
    );

    const user = await this.usersRepository.findOne({
      where: { phoneNumber },
    });

    if (!user) {
      this.logger.warn(
        `Password reset initiation failed - Phone number not found: ${phoneNumber}`,
        'AuthService',
      );
      throw new NotFoundException('Phone number not found.');
    }

    // Generate OTP
    const otp = this.generateOtp();

    // Store OTP in Redis with TTL (e.g., 3 minutes)
    await this.redisService
      .getClient()
      .set(`otp:${phoneNumber}`, otp.toString(), 'EX', 240);

    // Send OTP via Twilio
    await this.notificationsService.sendSms(
      phoneNumber,
      `Your password reset OTP is ${otp}`,
    );

    // Send OTP to new email
    const subject = 'Your Email Change OTP';
    const text = `Your OTP code for email change is ${otp}. It is valid for 3 minutes.`;
    const html = `<p>Your OTP code for email change is <b>${otp}</b>. It is valid for 3 minutes.</p>`;

    await this.notificationsService.sendEmail(
      'kiddoprecious@gmail.com',
      subject,
      text,
      html,
    );

    this.logger.log(
      `Password reset OTP sent to phone number: ${phoneNumber} and ${otp}`,
      'AuthService',
    );

    return {
      data: {},
      message: `An OTP has been sent to your phone number OTP ${otp}.`,
      errors: {},
    };
  }

  /**
   * Verifies the OTP provided by the user for password reset.
   * @param passwordResetVerifyOtpDto - Data Transfer Object containing phone number and OTP.
   * @returns An object with a success message.
   * @throws UnauthorizedException if the OTP is invalid or expired.
   */
  async passwordResetVerifyOtp(
    passwordResetVerifyOtpDto: PasswordResetVerifyOtpDto,
  ) {
    const { phoneNumber, otp } = passwordResetVerifyOtpDto;

    this.logger.log(
      `Password reset OTP verification for phone number: ${phoneNumber}`,
      'AuthService',
    );

    // Retrieve OTP from Redis
    const storedOtp = await this.redisService
      .getClient()
      .get(`otp:${phoneNumber}`);

    if (!storedOtp) {
      this.logger.warn(
        `Password reset OTP verification failed - OTP expired or not found for phone number: ${phoneNumber}`,
        'AuthService',
      );
      throw new UnauthorizedException('OTP has expired or is invalid.');
    }

    if (storedOtp !== otp.toString()) {
      this.logger.warn(
        `Password reset OTP verification failed - Invalid OTP for phone number: ${phoneNumber}`,
        'AuthService',
      );
      throw new UnauthorizedException('Invalid OTP.');
    }

    // OTP is valid, delete it from Redis
    await this.redisService.getClient().del(`passwordResetOtp:${phoneNumber}`);
    await this.redisService.getClient().del(`otp:${phoneNumber}`);

    this.logger.log(
      `Password reset OTP verified successfully for phone number: ${phoneNumber}`,
      'AuthService',
    );

    return {
      data: {},
      message: 'OTP verified successfully.',
      errors: {},
    };
  }

  /**
   * Completes the password reset process by setting a new password.
   * @param passwordResetCompleteDto - Data Transfer Object containing phone number, OTP, and new password.
   * @returns An object with a success message.
   * @throws NotFoundException if the user does not exist.
   */
  async passwordResetComplete(
    passwordResetCompleteDto: PasswordResetCompleteDto,
  ) {
    const { phoneNumber, otp, newPassword } = passwordResetCompleteDto;

    this.logger.log(
      `Completing password reset for phone number: ${phoneNumber}`,
      'AuthService',
    );

    const user = await this.usersRepository.findOne({
      where: { phoneNumber },
      select: ['id', 'password', 'phoneNumber'],
    });

    if (!user) {
      this.logger.warn(
        `Password reset completion failed - User not found for phone number: ${phoneNumber}`,
        'AuthService',
      );
      throw new NotFoundException('User not found.');
    }
    if (!user.password) {
      this.logger.warn(
        `Signin failed - User has no password set for phone number: ${phoneNumber}`,
        'AuthService',
      );
      throw new UnauthorizedException(
        'No password set for this user. Please complete onboarding.',
      );
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      this.logger.warn(
        `Password change failed - New password is the same as current password for user }`,
        'AuthService',
      );
      throw new BadRequestException(
        'Unable to update password. Please try a different password.',
      );
    }

    // Hash new password
    const hashedPassword = await this.hashPassword(newPassword);
    user.password = hashedPassword;

    await this.usersRepository.save(user);

    this.logger.log(
      `Password reset completed successfully for user ID: ${user.id}`,
      'AuthService',
    );

    return {
      data: {},
      message: 'Your password has been reset successfully.',
      errors: {},
    };
  }

  /**
   * Enrolls biometric authentication for the user.
   * @param userId - The ID of the user.
   * @param biometricEnrollDto - Data Transfer Object containing biometric data.
   * @returns An object with a success message.
   * @throws BadRequestException if biometric enrollment fails.
   */
  async enrollBiometric(
    userId: number,
    biometricEnrollDto: BiometricEnrollDto,
  ) {
    this.logger.log(
      `Enrolling biometric authentication for user ID: ${userId}`,
      'AuthService',
    );

    // Implement biometric enrollment logic
    // Integrate with a biometric verification service (e.g., Face++)

    // Example placeholder:
    const isBiometricEnrolled = true; // Replace with actual enrollment logic

    if (!isBiometricEnrolled) {
      this.logger.warn(
        `Biometric enrollment failed for user ID: ${userId}`,
        'AuthService',
      );
      throw new BadRequestException(
        'Failed to enroll biometric authentication.',
      );
    }

    this.logger.log(
      `Biometric authentication enrolled successfully for user ID: ${userId}`,
      'AuthService',
    );

    return {
      data: {},
      message: 'Biometric authentication enabled successfully.',
      errors: {},
    };
  }
  /**
   * Disables biometric authentication for the user.
   * @param userId - The ID of the user.
   * @param biometricDisableDto - Data Transfer Object containing biometric disable data.
   * @returns An object with a success message.
   * @throws BadRequestException if biometric disabling fails.
   */
  async disableBiometric(
    userId: number,
    biometricDisableDto: BiometricDisableDto,
  ) {
    this.logger.log(
      `Disabling biometric authentication for user ID: ${userId}`,
      'AuthService',
    );

    // Implement biometric disable logic
    // Integrate with a biometric verification service

    // Example placeholder:
    const isBiometricDisabled = true; // Replace with actual disable logic

    if (!isBiometricDisabled) {
      this.logger.warn(
        `Biometric disable failed for user ID: ${userId}`,
        'AuthService',
      );
      throw new BadRequestException(
        'Failed to disable biometric authentication.',
      );
    }

    this.logger.log(
      `Biometric authentication disabled successfully for user ID: ${userId}`,
      'AuthService',
    );

    return {
      data: {},
      message: 'Biometric authentication disabled successfully.',
      errors: {},
    };
  }

  /**
   * Refreshes the authentication tokens using a refresh token.
   * @param refreshTokenDto - Data Transfer Object containing the refresh token.
   * @returns An object containing new access and refresh tokens.
   * @throws UnauthorizedException if the refresh token is invalid or expired.
   */
  async refreshToken(refreshTokenDto: TokenRefreshDto) {
    const { refreshToken } = refreshTokenDto;

    this.logger.log(
      `Token refresh attempt with refresh token: ${refreshToken}`,
      'AuthService',
    );

    // ============================================
    // 1. CHECK REDIS FIRST (Fast lookup)
    // ============================================
    const userId = await this.redisService
      .getClient()
      .get(`refreshToken:${refreshToken}`);

    if (!userId) {
      this.logger.warn(
        `Token refresh failed - Invalid or expired refresh token: ${refreshToken}`,
        'AuthService',
      );
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    // ============================================
    // 2. VERIFY IN DATABASE (Check if revoked)
    // ============================================
    const tokenRecord = await this.refreshTokenRepository.findOne({
      where: { token: refreshToken, userId: Number(userId) },
    });

    if (!tokenRecord) {
      this.logger.warn(
        `Token refresh failed - Token not found in database: ${refreshToken}`,
        'AuthService',
      );
      throw new UnauthorizedException('Invalid refresh token.');
    }

    // Check if token is revoked
    if (tokenRecord.revoked) {
      this.logger.warn(
        `Token refresh failed - Token has been revoked: ${refreshToken}`,
        'AuthService',
      );
      throw new UnauthorizedException('Refresh token has been revoked.');
    }

    // Check if token is expired
    if (tokenRecord.expiresAt < new Date()) {
      this.logger.warn(
        `Token refresh failed - Token expired: ${refreshToken}`,
        'AuthService',
      );
      throw new UnauthorizedException('Refresh token has expired.');
    }

    // ============================================
    // 3. GET USER WITH TOKEN VERSION
    // ============================================
    const user = await this.usersRepository.findOne({
      where: { id: Number(userId) },
      select: ['id', 'phoneNumber', 'tokenVersion'],
    });

    if (!user) {
      this.logger.warn(
        `Token refresh failed - User not found for refresh token: ${refreshToken}`,
        'AuthService',
      );
      throw new UnauthorizedException('User not found.');
    }

    // ============================================
    // 4. GENERATE NEW TOKENS (Include tokenVersion)
    // ============================================
    const newAccessToken = this.generateJwtToken(
      user.id,
      user.phoneNumber,
      user.tokenVersion, // Include token version
    );
    const newRefreshToken = this.generateRefreshToken();

    // ============================================
    // 5. STORE NEW REFRESH TOKEN (Redis + Database)
    // ============================================
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store in Redis
    await this.redisService
      .getClient()
      .set(`refreshToken:${newRefreshToken}`, user.id.toString(), 'EX', 604800);

    // Store in Database (reuse device info from old token)
    await this.refreshTokenRepository.save({
      token: newRefreshToken,
      userId: user.id,
      deviceName: tokenRecord.deviceName,
      deviceType: tokenRecord.deviceType,
      ipAddress: tokenRecord.ipAddress,
      location: tokenRecord.location,
      userAgent: tokenRecord.userAgent,
      expiresAt,
    });

    // ============================================
    // 6. DELETE OLD REFRESH TOKEN (Redis + Database)
    // ============================================
    // Delete from Redis
    await this.redisService.getClient().del(`refreshToken:${refreshToken}`);

    // Revoke in Database (don't delete, keep for audit)
    await this.refreshTokenRepository.update(
      { id: tokenRecord.id },
      {
        revoked: true,
        revokedAt: new Date(),
        revokedReason: 'token_refreshed',
      },
    );

    // ============================================
    // 7. UPDATE LAST USED TIMESTAMP
    // ============================================
    await this.refreshTokenRepository.update(
      { token: newRefreshToken },
      { lastUsedAt: new Date() },
    );

    this.logger.log(
      `Token refreshed successfully for user ID: ${user.id}`,
      'AuthService',
    );

    return {
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
      message: 'Token refreshed successfully.',
      errors: {},
    };
  }

  /**
   * Validates the user's current password before allowing password change
   * @param userId - The ID of the user.
   * @param passwordChangeInitiateDto - Data Transfer Object containing the current password.
   * @returns An object with a success message.
   * @throws UnauthorizedException if the password is invalid.
   * @throws NotFoundException if the user does not exist.
   */
  async passwordChangeInitiate(
    userId: number,
    passwordChangeInitiateDto: PasswordChangeInitiateDto,
  ): Promise<any> {
    const { currentPassword } = passwordChangeInitiateDto;

    this.logger.log(
      `Password change initiation for user ID: ${userId}`,
      'AuthService',
    );

    // Find the user with their password
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'password', 'phoneNumber'], // Include phoneNumber in the selection
    });

    if (!user) {
      this.logger.warn(
        `Password change initiation failed - User not found: ${userId}`,
        'AuthService',
      );
      throw new NotFoundException('User not found.');
    }

    // Compare the provided password with the stored hash
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isPasswordValid) {
      this.logger.warn(
        `Password change initiation failed - Invalid password for user ID: ${userId}`,
        'AuthService',
      );
      throw new UnauthorizedException('Current Password  is incorrect');
    }

    // Generate OTP for the password change process
    const otp = this.generateOtp();
    const redisKey = `passwordChangeOtp:${userId}`;

    // Store the OTP in Redis with a 3-minute expiry
    await this.redisService.getClient().set(
      redisKey,
      otp.toString(),
      'EX',
      240, // 3 minutes expiry
    );

    // Send OTP to email for debugging/testing
    const subject = 'Your OTP Code';
    const text = `Your OTP code is ${otp}. It is valid for 3 minutes.`;
    const html = `<p>Your OTP code is <b>${otp}</b>. It is valid for 3 minutes.</p>`;

    await this.notificationsService.sendEmail(
      'kiddoprecious@gmail.com',
      subject,
      text,
      html,
    );

    // Send OTP via SMS
    await this.notificationsService.sendSms(
      user.phoneNumber,
      `Your password change OTP is: ${otp}. This code expires in 3 minutes.`,
    );

    // Mask phone number for response
    const maskedPhoneNumber = this.maskPhoneNumber(user.phoneNumber);

    this.logger.log(
      `Password change OTP sent to user ID: ${userId}`,
      'AuthService',
    );

    return {
      data: {
        maskedPhoneNumber,
      },
      message: `An OTP has been sent to your mobile number. ${otp}`,
      errors: {},
    };
  }

  /**
   * Verifies the OTP provided by the user for password change.
   * @param userId - The ID of the user.
   * @param passwordChangeVerifyOtpDto - Data Transfer Object containing the OTP.
   * @returns An object with a success message.
   * @throws UnauthorizedException if the OTP is invalid or expired.
   */
  async passwordChangeVerifyOtp(
    userId: number,
    passwordChangeVerifyOtpDto: PasswordChangeVerifyOtpDto,
  ) {
    const { otp } = passwordChangeVerifyOtpDto;

    this.logger.log(
      `Password change OTP verification for user ID: ${userId}`,
      'AuthService',
    );

    // Use the correct key to fetch OTP from Redis
    const storedOtp = await this.redisService
      .getClient()
      .get(`passwordChangeOtp:${userId}`); // Corrected the key here

    if (!storedOtp) {
      this.logger.warn(
        `Password change OTP verification failed - OTP expired or not found for user ID: ${userId}`,
        'AuthService',
      );
      throw new UnauthorizedException('OTP has expired or is invalid.');
    }

    if (storedOtp !== otp.toString()) {
      this.logger.warn(
        `Password change OTP verification failed - Invalid OTP for user ID: ${userId}`,
        'AuthService',
      );
      throw new UnauthorizedException('Invalid OTP.');
    }

    // OTP is valid, delete it from Redis
    await this.redisService.getClient().del(`passwordChangeOtp:${userId}`);

    this.logger.log(
      `Password change OTP verified successfully for user ID: ${userId}`,
      'AuthService',
    );

    return {
      data: {},
      message: 'OTP verified successfully.',
      errors: {},
    };
  }

  /**
   * Completes the password change process by setting a new password.
   * @param userId - The ID of the user.
   * @param passwordChangeCompleteDto - Data Transfer Object containing the new password.
   * @returns An object with a success message.
   * @throws NotFoundException if the user does not exist.
   */
  async passwordChangeComplete(
    userId: number,
    passwordChangeCompleteDto: PasswordChangeCompleteDto,
  ) {
    const { newPassword } = passwordChangeCompleteDto;

    this.logger.log(
      `Completing password change for user ID: ${userId}`,
      'AuthService',
    );

    // Specifically query for the user WITH the password field
    const userWithPassword = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'password'], // Explicitly select the password field
    });

    if (!userWithPassword) {
      this.logger.warn(
        `Password change completion failed - User not found for user ID: ${userId}`,
        'AuthService',
      );
      throw new NotFoundException('User not found.');
    }

    // Check if new password is the same as current password
    const isSamePassword = await bcrypt.compare(
      newPassword,
      userWithPassword.password,
    );

    if (isSamePassword) {
      this.logger.warn(
        `Password change failed - New password is the same as current password for user ID: ${userId}`,
        'AuthService',
      );
      throw new BadRequestException(
        "Please choose a new password that you haven't used before.",
      );
    }

    // (Optional) Password strength validation - Example check (add more rules as needed)
    const isStrongPassword = this.validatePasswordStrength(newPassword);
    if (!isStrongPassword) {
      this.logger.warn(
        `Password change failed - Weak password for user ID: ${userId}`,
        'AuthService',
      );
      throw new BadRequestException(
        'Your password must meet the required strength criteria.',
      );
    }

    // Hash the new password
    const hashedPassword = await this.hashPassword(newPassword);

    // Update the user's password
    userWithPassword.password = hashedPassword;
    await this.usersRepository.save(userWithPassword);

    this.logger.log(
      `Password changed successfully for user ID: ${userWithPassword.id}`,
      'AuthService',
    );
    await this.logoutAllDevices(userId);
    return {
      data: {},
      message:
        'You have succesfully reset your password please log in to continue.',
      errors: {},
    };
  }

  /**
   * Initiates the email change process by sending an OTP to the new email address.
   * @param userId - The ID of the user.
   * @param emailChangeInitiateDto - Data Transfer Object containing the new email and PIN.
   * @returns An object with a success message.
   * @throws NotFoundException if the user does not exist.
   */
  async emailChangeInitiate(
    userId: number,
    emailChangeInitiateDto: EmailChangeInitiateDto,
  ) {
    const { currentEmail, phoneNumber } = emailChangeInitiateDto;

    this.logger.log(
      `Email change initiation for user ID: ${userId}`,
      'AuthService',
    );

    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      this.logger.warn(
        `Email change initiation failed - User not found for user ID: ${userId}`,
        'AuthService',
      );
      throw new NotFoundException('User not found.');
    }
    // Check if new email already exists for another user

    const currentEmailHash = this.encryptionService.hash(currentEmail);
    const emailExists = await this.usersRepository.findOne({
      where: {
        id: userId,
        emailHash: currentEmailHash,
      },
    });
    // Check if new email already exists for another user
    const phoneExists = await this.usersRepository.findOne({
      where: { id: userId, phoneNumber },
    });

    if (!emailExists) {
      this.logger.warn(
        `Email change initiation failed - Email and phone number already in use: ${currentEmail}, ${phoneNumber}`,
        'AuthService',
      );
      throw new ConflictException('A user with this email does not exist.');
    }

    if (!phoneExists) {
      this.logger.warn(
        `Email change initiation failed - Email and phone number already in use: ${currentEmail}, ${phoneNumber}`,
        'AuthService',
      );
      throw new ConflictException(
        'A user with this phoneNumber does not exist.',
      );
    }

    // Verify PIN
    // Implement PIN verification logic (e.g., check against stored PIN)
    // For demonstration, assume PIN is correct

    // Generate OTP
    const otp = this.generateOtp();
    // Send OTP to old email as well

    // Store OTP in Redis with TTL (e.g., 3 minutes)
    await this.redisService
      .getClient()
      .set(`emailChangeOtp:${userId}`, otp.toString(), 'EX', 240);

    // await this.redisService
    //   .getClient()
    //   .set(`currentEmail:${userId}`, currentEmail.toString(), 'EX', 180);

    // Send OTP to new email
    const subject = 'Your Email Change OTP';
    const text = `Your OTP code for email change is ${otp}. It is valid for 3 minutes.`;
    const html = `<p>Your OTP code for email change is <b>${otp}</b>. It is valid for 3 minutes.</p>`;

    await this.notificationsService.sendEmail(
      'kiddoprecious@gmail.com',
      subject,
      text,
      html,
    );
    if (phoneNumber) {
      // Send OTP via SMS to the phone number
      await this.notificationsService.sendSms(
        phoneNumber,
        `Your email change OTP is ${otp}`,
      );
    }

    if (currentEmail) {
      await this.notificationsService.sendEmail(
        user.interacEmailAddress,
        subject,
        text,
        html,
      );
    }

    this.logger.log(
      `Email change OTP sent to new email: ${user.interacEmailAddress} for user ID: ${userId}`,
      'AuthService',
    );

    return {
      data: {},
      message: `OTP has been sent to your new email address. otp ${otp}`,
      errors: {},
    };
  }

  async changeEmailInitiate(
    sessionToken: string, // Replace phoneNumber with sessionToken
    emailChangeInitiateDto: changeEmailInitiateDto,
  ) {
    const { newEmail } = emailChangeInitiateDto;

    // Decode the session token to get phone number
    try {
      const sessionData = JSON.parse(
        Buffer.from(sessionToken, 'base64').toString('utf-8'),
      );

      if (!sessionData.phoneNumber) {
        this.logger.warn(
          `Email change initiation failed - Invalid session token`,
          'AuthService',
        );
        throw new UnauthorizedException('Invalid session token');
      }

      // ✅ UPDATED: Check using emailHash
      const emailHash = this.encryptionService.hash(newEmail);
      const existingUser = await this.usersRepository.findOne({
        where: { emailHash },
      });

      if (existingUser) {
        throw new ConflictException('A user with this email already exists.');
      }

      const { phoneNumber } = sessionData;

      this.logger.log(
        `Email change initiation for phone number: ${phoneNumber}`,
        'AuthService',
      );

      // Generate OTP
      const otp = this.generateOtp();

      // Use phone number as the key identifier in Redis
      await this.redisService
        .getClient()
        .set(`emailChangeOtp:${phoneNumber}`, otp.toString(), 'EX', 180);

      // Store the new email associated with this phone number
      await this.redisService
        .getClient()
        .set(`newEmail:${phoneNumber}`, newEmail, 'EX', 180);

      // Send OTP to new email
      const subject = 'Your Email Change OTP';
      const text = `Your OTP code for email verification is ${otp}. It is valid for 3 minutes.`;
      const html = `<p>Your OTP code for email verification is <b>${otp}</b>. It is valid for 3 minutes.</p>`;

      await this.notificationsService.sendEmail(newEmail, subject, text, html);

      this.logger.log(
        `Email change OTP sent to new email: ${newEmail} for phone number: ${phoneNumber}`,
        'AuthService',
      );

      return {
        data: {},
        message: `OTP has been sent to your new email address. otp ${otp}`,
        errors: {},
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        `Error decoding session token: ${error.message}`,
        'AuthService',
      );
      throw new BadRequestException('Invalid session data');
    }
  }
  /**
   * Verifies the OTP provided by the user for email change.
   * @param userId - The ID of the user.
   * @param emailChangeVerifyDto - Data Transfer Object containing the OTP.
   * @returns An object with a success message.
   * @throws UnauthorizedException if the OTP is invalid or expired.
   * @throws NotFoundException if the user does not exist.
   */
  async emailChangeVerify(
    userId: number,
    emailChangeVerifyDto: EmailChangeVerifyDto,
  ) {
    const { otp } = emailChangeVerifyDto;

    this.logger.log(
      `Email change OTP verification for user ID: ${userId}`,
      'AuthService',
    );

    const storedOtp = await this.redisService
      .getClient()
      .get(`emailChangeOtp:${userId}`);

    // const newEmail = await this.redisService
    //   .getClient()
    //   .get(`currentEmail:${userId}`);
    // console.log(storedOtp, 'storedOtp');

    if (!storedOtp) {
      this.logger.warn(
        `Email change OTP verification failed - OTP expired or not found for user ID: ${userId}`,
        'AuthService',
      );
      throw new UnauthorizedException('OTP has expired or is invalid.');
    }

    if (storedOtp !== otp.toString()) {
      this.logger.warn(
        `Email change OTP verification failed - Invalid OTP for user ID: ${userId}`,
        'AuthService',
      );
      throw new UnauthorizedException('Invalid OTP.');
    }

    // OTP is valid, delete it from Redis
    await this.redisService.getClient().del(`emailChangeOtp:${userId}`);

    // Update user's email
    // Retrieve the new email from a temporary storage or pass it through the verification process
    // For demonstration, we'll mock it as 'updated@example.com'

    const user = await this.findUserById(userId);

    if (!user) {
      this.logger.warn(
        `Email change verification failed - User not found for user ID: ${userId}`,
        'AuthService',
      );
      throw new NotFoundException('User not found.');
    }

    // user.interacEmailAddress = newEmail;

    // await this.usersRepository.save(user);

    this.logger.log(
      `Email verified successfully to for this user`,
      'AuthService',
    );

    return {
      data: {},
      message: 'Your email has been verified successfully.',
      errors: {},
    };
  }

  async emailChangeComplete(
    userId: number,
    emailChangeCompleteDto: EmailChangeCompleteDto,
  ) {
    const { newEmail, confirmNewEmail } = emailChangeCompleteDto;

    this.logger.log(
      `Email change completion for user ID: ${userId}`,
      'AuthService',
    );

    // Validate that both email fields match
    if (newEmail.toLowerCase() !== confirmNewEmail.toLowerCase()) {
      throw new BadRequestException('New email addresses do not match.');
    }

    // ✅ UPDATED: Check if new email already exists using emailHash (excluding current user)
    const emailHash = this.encryptionService.hash(newEmail);
    const emailExists = await this.usersRepository.findOne({
      where: {
        emailHash,
        id: Not(userId),
      },
    });

    if (emailExists) {
      throw new ConflictException('A user with this email already exists.');
    }

    // Get current user
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    // Update fields
    user.interacEmailAddress = newEmail; // Will be encrypted by transformer on save
    user.emailHash = emailHash;

    // Save (triggers transformers)
    await this.usersRepository.save(user);

    this.logger.log(
      `Email successfully changed for user ID: ${userId} to ${newEmail}`,
      'AuthService',
    );

    // Send confirmation email to new address
    const subject = 'Email Address Changed Successfully';
    const text = `Your email address has been successfully changed to ${newEmail}.`;
    const html = `<p>Your email address has been successfully changed to <b>${newEmail}</b>.</p>`;

    await this.notificationsService.sendEmail(newEmail, subject, text, html);

    return {
      data: {
        newEmail: newEmail,
      },
      message: 'Email address changed successfully.',
      errors: {},
    };
  }

  public async updateKycStarted(userId: string): Promise<User> {
    this.logger.log(
      'info',
      `About to update user kyc started for user ID: ${userId}`,
    );

    const user = await this.usersRepository.findOne({
      where: {
        id: Number(userId),
      },
    });

    if (!user) {
      this.logger.log(
        'error',
        `Update KYC started failed - User not found for user ID: ${userId}`,
      );

      throw new NotFoundException('User not found');
    }

    try {
      const updatedUser = await this.usersRepository.save({
        ...user,
        kycStarted: true,
        kycStartedAt: new Date(),
        kycTrials: (user.kycTrials || 0) + 1,
      });

      this.logger.log(
        'info',
        `KYC started updated successfully for user ID: ${userId}`,
      );

      return updatedUser;
    } catch (error) {
      this.logger.log(
        'error',
        `Error updating KYC started for user ID: ${userId}: ${error}`,
      );

      throw new InternalServerErrorException('Error updating KYC status');
    }
  }

  async verifyEmailChange(sessionToken: string, otp: string) {
    // Decode the session token to get phone number
    try {
      const sessionData = JSON.parse(
        Buffer.from(sessionToken, 'base64').toString('utf-8'),
      );

      if (!sessionData.phoneNumber) {
        this.logger.warn(
          `Email change verification failed - Invalid session token`,
          'AuthService',
        );
        throw new UnauthorizedException('Invalid session token');
      }

      const { phoneNumber } = sessionData;

      this.logger.log(
        `Email change verification for phone number: ${phoneNumber}`,
        'AuthService',
      );

      // Check for too many attempts first
      const attemptKey = `emailChangeAttempts:${phoneNumber}`;
      const attempts = await this.redisService.getClient().get(attemptKey);
      const attemptCount = attempts ? parseInt(attempts) : 0;

      if (attemptCount >= 3) {
        this.logger.warn(
          `Email change verification failed - Too many attempts for phone number: ${phoneNumber}`,
          'AuthService',
        );
        // This matches your UI: "Too many incorrect attempts. Try again later."
        throw new CustomTooManyRequestsException(
          'Too many incorrect attempts. Try again later.',
        );
      }
      // Get stored OTP
      const storedOtp = await this.redisService
        .getClient()
        .get(`emailChangeOtp:${phoneNumber}`);

      // Check if OTP exists (not expired)
      if (!storedOtp) {
        this.logger.warn(
          `Email change verification failed - OTP expired for phone number: ${phoneNumber}`,
          'AuthService',
        );
        // This matches your UI: "This code has expired. Please request a new one"
        throw new GoneException(
          'This code has expired. Please request a new one',
        );
      }

      // Check if OTP matches
      if (storedOtp !== otp) {
        this.logger.warn(
          `Email change verification failed - Invalid OTP for phone number: ${phoneNumber}`,
          'AuthService',
        );
        // This matches your UI: "Invalid code please try again"
        throw new BadRequestException('Invalid code please try again');
      }

      // Get the new email
      const newEmail = await this.redisService
        .getClient()
        .get(`newEmail:${phoneNumber}`);

      if (!newEmail) {
        this.logger.warn(
          `Email change verification failed - Request not found or expired for phone number: ${phoneNumber}`,
          'AuthService',
        );
        throw new NotFoundException(
          'Email change request not found or expired.',
        );
      }

      // Delete Redis keys after successful verification
      await this.redisService.getClient().del(`emailChangeOtp:${phoneNumber}`);
      await this.redisService.getClient().del(`newEmail:${phoneNumber}`);

      this.logger.log(
        `Email changed successfully to ${newEmail} for phone number: ${phoneNumber}`,
        'AuthService',
      );

      return {
        data: {},
        message: 'Your email has been verified successfully.',
        errors: {},
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof GoneException ||
        error instanceof CustomTooManyRequestsException
      ) {
        throw error;
      }
      this.logger.error(
        `Error decoding session token: ${error.message}`,
        'AuthService',
      );
    }
  }

  public async updateKycStatus(data: {
    userId: number;
    status: string;
    kycResponse: string;
    additionalInfo?: string;
    ApplicantId?: string;
  }): Promise<any> {
    const user = await this.usersRepository.findOne({
      where: {
        id: Number(data.userId),
      },
    });

    if (!user) {
      this.logger.log(
        'error',

        JSON.stringify({
          data: user,

          message: 'User not found. Check if externalUserId exists',
        }),
      );

      throw new NotFoundException('User not found');
    }

    // try {
    //   // const updatedUser = await this.usersRepository.save({
    //   //   ...user,
    //   //   kycStatus: data.status,
    //   //   kycResponse:
    //   //     user.kycResponse && user.kycResponse.length > 0
    //   //       ? [...user.kycResponse, data.kycResponse]
    //   //       : [data.kycResponse],
    //   //   kycAdditionalInfo: data.additionalInfo,
    //   //   ApplicantId: data.ApplicantId,
    //   //   kycCompleted: false,
    //   // });
    //   this.logger.log(
    //     'error',

    //     JSON.stringify({
    //       data: user,
    //       message: 'Updated user KYC status successfully.',
    //     }),
    //   );

    //   return updatedUser;
    // } catch (error) {
    //   this.logger.log(
    //     'error',

    //     JSON.stringify({
    //       data: { userId: data.userId, error },

    //       message: 'Error occurred while updating user KYC status',
    //     }),
    //   );

    //   throw new InternalServerErrorException('Failed to update KYC status');
    // }
  }

  public async getUserByApplicantId(ApplicantId: string): Promise<User | null> {
    this.logger.log(
      'info',
      JSON.stringify({
        data: { ApplicantId },

        message: 'Find a User by  Applicant ID',
      }),
    );

    const record = await this.usersRepository.findOne({
      where: {
        ApplicantId,
      },
    });

    if (!record) {
      this.logger.log(
        'info',
        JSON.stringify({
          data: { ApplicantId },

          message: 'No user found with provided  Applicant ID',
        }),
      );
      return null;
    }

    this.logger.log(
      'info',
      JSON.stringify({
        data: record,

        message: 'User found with provided  Applicant ID',
      }),
    );

    return record;
  }

  public async updateApplicantId(
    userId: string,
    ApplicantId: string,
  ): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: {
        id: Number(userId),
      },
    });

    if (!user) {
      this.logger.log('error', 'User Not Found');
      throw new NotFoundException('User not found');
    }

    try {
      const updatedUser = await this.usersRepository.save({
        ...user,
        ApplicantId,
      });

      this.logger.log(
        'info',
        JSON.stringify({
          data: { userId, ApplicantId },

          message: 'About to save user  applicant id',
        }),
      );

      return updatedUser;
    } catch (error) {
      this.logger.error(
        `Error occurred while updating user KYC status for user ID: ${userId}`,

        error,

        'AuthService',
      );

      throw new InternalServerErrorException('Failed to update applicant ID');
    }
  }

  public async updateKycCompleted(data: { userId: number }): Promise<User> {
    this.logger.log(
      'info',

      JSON.stringify({
        data: { userId: data.userId },

        message: 'About to save user  applicant id',
      }),
    );

    const user = await this.usersRepository.findOne({
      where: {
        id: Number(data.userId),
      },
    });

    if (!user) {
      this.logger.log(
        'error',

        JSON.stringify({
          data: user,

          message: 'User not found. ',
        }),
      );
      throw new NotFoundException('User not found');
    }

    try {
      const updatedUser = await this.usersRepository.save({
        ...user,
        kycCompleted: true,
        kycCompletedAt: new Date(),
      });
      this.logger.log(
        'info',

        JSON.stringify({ data: user, message: 'Updated User KYC completed' }),
      );

      return updatedUser;
    } catch (error) {
      this.logger.log(
        'error',

        JSON.stringify({
          data: { userId: data.userId, error },

          message: 'Error occurred while updating user KYC status',
        }),
      );

      throw new InternalServerErrorException(
        'Failed to update KYC completion status',
      );
    }
  }

  async updateFaceIdKey(userId: number, publicKey: string): Promise<boolean> {
    try {
      const result = await this.usersRepository.update(userId, { publicKey });
      return !!result; // Convert to boolean
    } catch (error) {
      this.logger.error(
        `Failed to update face ID key for user ${userId}: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to update face ID key');
    }
  }

  async verifyUserSignature(
    userId: number,
    payload: string,
    signature: string,
  ): Promise<boolean> {
    try {
      const user = await this.findUserById(userId);
      if (!user || !user.publicKey) return false;

      const publicKey = user.publicKey.trim();

      // Try multiple formatting approaches
      const formattingApproaches = [
        // Approach 1: Clean key first and format with line breaks
        () => {
          const cleanKey = publicKey
            .replace(/-----BEGIN PUBLIC KEY-----/g, '')
            .replace(/-----END PUBLIC KEY-----/g, '')
            .replace(/[\r\n\s]/g, '');

          let formattedKey = '-----BEGIN PUBLIC KEY-----\n';
          for (let i = 0; i < cleanKey.length; i += 64) {
            formattedKey += cleanKey.slice(i, i + 64) + '\n';
          }
          formattedKey += '-----END PUBLIC KEY-----';

          return formattedKey;
        },

        // Approach 2: Simple formatting
        () =>
          `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`,

        // Approach 3: Try using the key as-is if it already has headers
        () => (publicKey.includes('BEGIN PUBLIC KEY') ? publicKey : null),
      ];

      for (const formatFn of formattingApproaches) {
        const formattedKey = formatFn();
        if (!formattedKey) continue;

        try {
          const verifier = crypto.createVerify('RSA-SHA256');
          verifier.update(payload);

          // Try direct verification
          if (verifier.verify(formattedKey, signature, 'base64')) {
            return true;
          }

          // Try with buffer conversion
          const sigBuffer = Buffer.from(signature, 'base64');
          if (verifier.verify(formattedKey, sigBuffer)) {
            return true;
          }
        } catch (err) {
          // Try next approach
          console.log(`Key format approach failed: ${err.message}`);
        }
      }

      return false;
    } catch (error) {
      this.logger.error(`Verification error: ${error.message}`);
      return false;
    }
  }

  async updateFcmToken(
    userId: number,
    updateFcmTokenDto: UpdateFcmTokenDto,
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Update FCM token
    user.fcmToken = updateFcmTokenDto.token;
    user.fcmTokenPlatform = updateFcmTokenDto.platform;
    user.fcmTokenUpdatedAt = new Date();

    await this.usersRepository.save(user);

    this.logger.log('info', `FCM token updated for user ${userId}`);
    return user;
  }

  async deleteFcmToken(userId: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Remove FCM token
    user.fcmToken = null;
    user.fcmTokenPlatform = null;
    user.fcmTokenUpdatedAt = null;
    // call push notification
    await this.usersRepository.save(user);

    this.logger.log('info', `FCM token deleted for user ${userId}`);
    return user;
  }

  async findByFcmToken(fcmToken: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { fcmToken } });
  }

  /**
   * Generate JWT with tokenVersion and jti
   */
  private generateJwtToken(
    userId: number,
    phoneNumber: string,
    tokenVersion: number,
  ): string {
    const payload = {
      sub: userId,
      phoneNumber,
      tokenVersion, // Include token version
      jti: uuidv4(), // JWT ID for blacklisting
    };

    return this.jwtService.sign(payload, {
      expiresIn: '40m', // 40 minutes
    });
  }

  /**
   * Create refresh token in BOTH Redis and Database
   */
  private async createRefreshToken(
    userId: number,
    deviceInfo?: {
      deviceName?: string;
      deviceType?: string;
      ipAddress?: string;
      location?: string;
      userAgent?: string;
    },
  ): Promise<string> {
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // 1. Store in Redis (for backward compatibility and speed)
    await this.redisService
      .getClient()
      .set(`refreshToken:${token}`, userId.toString(), 'EX', 604800);

    // 2. Store in Database (for audit trail)
    await this.refreshTokenRepository.save({
      token,
      userId,
      deviceName: deviceInfo?.deviceName,
      deviceType: deviceInfo?.deviceType,
      ipAddress: deviceInfo?.ipAddress,
      location: deviceInfo?.location,
      userAgent: deviceInfo?.userAgent,
      expiresAt,
    });

    return token;
  }

  /**
   * LOGOUT - Hybrid Approach
   */
  async logout(userId: number, accessToken: string, refreshToken: string) {
    this.logger.log(`Logout initiated for user ID: ${userId}`, 'AuthService');

    // 1. Blacklist access token in Redis
    try {
      const decoded = this.jwtService.decode(accessToken) as any;
      const jti = decoded?.jti;
      const exp = decoded?.exp;

      if (jti && exp) {
        const now = Math.floor(Date.now() / 1000);
        const ttl = exp - now;

        if (ttl > 0) {
          await this.redisService
            .getClient()
            .set(`blacklist:token:${jti}`, 'true', 'EX', ttl);
          this.logger.log(
            `Access token blacklisted for user ID: ${userId}`,
            'AuthService',
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to blacklist access token for user ID: ${userId}`,
        error.stack,
        'AuthService',
      );
    }

    // 2. Delete refresh token from Redis
    await this.redisService.getClient().del(`refreshToken:${refreshToken}`);

    // 3. Revoke refresh token in Database
    await this.refreshTokenRepository.update(
      { token: refreshToken, userId },
      {
        revoked: true,
        revokedAt: new Date(),
        revokedReason: 'user_logout',
      },
    );

    this.logger.log(`Logout successful for user ID: ${userId}`, 'AuthService');

    return {
      data: {},
      message: 'Logout successful.',
      errors: {},
    };
  }

  /**
   * LOGOUT ALL DEVICES - Increment token version
   */
  async logoutAllDevices(userId: number) {
    this.logger.log(
      `Logout all devices initiated for user ID: ${userId}`,
      'AuthService',
    );

    // 1. Increment token version (invalidates all existing tokens)
    await this.usersRepository.increment({ id: userId }, 'tokenVersion', 1);

    // 2. Revoke all refresh tokens in Database
    await this.refreshTokenRepository.update(
      { userId, revoked: false },
      {
        revoked: true,
        revokedAt: new Date(),
        revokedReason: 'logout_all_devices',
      },
    );

    // 3. Delete all refresh tokens from Redis
    const allTokens = await this.refreshTokenRepository.find({
      where: { userId, revoked: true },
      select: ['token'],
    });

    if (allTokens.length > 0) {
      const pipeline = this.redisService.getClient().pipeline();
      allTokens.forEach((tokenRecord) => {
        pipeline.del(`refreshToken:${tokenRecord.token}`);
      });
      await pipeline.exec();
    }

    // 4. Send email notification
    const user = await this.findUserById(userId);
    if (user) {
      try {
        await this.notificationsService.sendEmail(
          user.interacEmailAddress,
          'Security Alert: Logged Out from All Devices',
          'You have been logged out from all devices. If you did not perform this action, please secure your account immediately.',
          `<p><b>Security Alert:</b> You have been logged out from all devices.</p><p>If you did not perform this action, please change your password immediately.</p>`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send logout all devices email to user ID: ${userId}`,
          error.stack,
          'AuthService',
        );
      }
    }

    this.logger.log(
      `Logout all devices completed for user ID: ${userId}`,
      'AuthService',
    );

    return {
      data: {},
      message: 'Logged out from all devices successfully.',
      errors: {},
    };
  }

  /**
   * GET ACTIVE SESSIONS
   */
  async getActiveSessions(userId: number) {
    return await this.refreshTokenRepository.find({
      where: {
        userId,
        revoked: false,
        expiresAt: MoreThan(new Date()),
      },
      order: { lastUsedAt: 'DESC' },
      select: [
        'id',
        'deviceName',
        'deviceType',
        'ipAddress',
        'location',
        'createdAt',
        'lastUsedAt',
      ],
    });
  }

  /**
   * REVOKE SPECIFIC SESSION
   */
  async revokeSession(userId: number, sessionId: number) {
    const session = await this.refreshTokenRepository.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Session not found.');
    }

    // Delete from Redis
    await this.redisService.getClient().del(`refreshToken:${session.token}`);

    // Revoke in Database
    await this.refreshTokenRepository.update(
      { id: sessionId },
      {
        revoked: true,
        revokedAt: new Date(),
        revokedReason: 'user_revoked_session',
      },
    );

    return {
      data: {},
      message: 'Session revoked successfully.',
      errors: {},
    };
  }
}
