// pin-management.service.ts
import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../common/redis/redis.service';
import { NotificationsService } from '../../common/notifications/notifications.service';
// import { CryptoService } from '../common/services/crypto.service';
import * as bcrypt from 'bcryptjs'; // Updated import to 'bcryptjs'

import {
  SetPinDto,
  ChangePinInitiateDto,
  ChangePinCompleteDto,
  ResetPinInitiateDto,
  ResetPinCompleteDto,
  VerifyOtpDto,
} from '../dto/pin.dto';
import { User } from 'src/auth/entities/user.entity';

@Injectable()
export class PinManagementService {
  private readonly logger = new Logger(PinManagementService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly redisService: RedisService,
    private readonly notificationsService: NotificationsService,
    // private readonly cryptoService: CryptoService,
  ) {}

  /**
   * Generate a 6-digit OTP
   */
  private generateOtp(): number {
    return Math.floor(100000 + Math.random() * 900000);
  }

  /**
   * Hash PIN using bcrypt
   */
  private async hashPin(pin: string): Promise<string> {
    const saltRounds = 10;
    return await bcrypt.hash(pin, saltRounds);
  }

  /**
   * Verify PIN using bcrypt
   */
  private async verifyPin(pin: string, hashedPin: string): Promise<boolean> {
    return await bcrypt.compare(pin, hashedPin);
  }

  /**
   * Finds a user by their ID.
   * @param userId - The ID of the user to find.
   * @returns A promise that resolves to the User entity or undefined if not found.
   */
  //   async findUserById(userId: number): Promise<User | undefined> {
  //     return this.userRepository.findOne({ where: { id: userId } });
  //   }

  /**
   * Set initial PIN
   */
  async setPin(setPinDto: SetPinDto, userId: any): Promise<any> {
    const existingUser = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'pin'], // Include pin in selection
    });

    if (existingUser.pin) {
      this.logger.warn(
        `PIN already set for user ID: ${userId}`,
        'PinManagementService',
      );
      throw new ConflictException(
        'PIN already set. Use change PIN to update your PIN.',
      );
    }

    const hashedPin = await this.hashPin(setPinDto.pin);

    await this.userRepository.update(userId, {
      pin: hashedPin,
      pinUpdatedAt: new Date(),
    });

    this.logger.log(
      `PIN set successfully for user ID: ${userId}`,
      'PinManagementService',
    );

    return {
      data: {},
      message: 'PIN set successfully.',
      errors: {},
    };
  }

  /**
   * Initiate PIN change
   */
  async initiatePinChange(
    changePinInitiateDto: ChangePinInitiateDto,
    userId: any,
  ): Promise<any> {
    const existingUser = await this.userRepository.findOne({
      where: { phoneNumber: changePinInitiateDto.phoneNumber },
      select: ['id', 'phoneNumber', 'pin'],
    });

    if (!existingUser) {
      throw new NotFoundException('Phone number not found.');
    }

    if (existingUser.id !== userId) {
      throw new BadRequestException(
        'Phone number does not match authenticated user.',
      );
    }

    // Generate and store OTP
    const otp = this.generateOtp();
    const redisKey = `pinChangeOtp:${userId}`;

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
      existingUser.phoneNumber,
      `Your PIN change OTP is: ${otp}`,
    );

    this.logger.log(
      `PIN change OTP sent to user ID: ${userId}`,
      'PinManagementService',
    );

    return {
      data: {},
      message: `An OTP has been sent to your phone number. OTP ${otp}`,
      errors: {},
    };
  }

  /**
   * Complete PIN change
   */
  async completePinChange(
    changePinCompleteDto: ChangePinCompleteDto,
    userId: any,
  ): Promise<any> {
    const redisKey = `pinChangeOtp:${userId}`;
    const storedOtp = await this.redisService.getClient().get(redisKey);

    if (!storedOtp || storedOtp !== changePinCompleteDto.otp.toString()) {
      throw new UnauthorizedException('Invalid or expired OTP.');
    }

    const hashedPin = await this.hashPin(changePinCompleteDto.newPin);

    await this.userRepository.update(userId, {
      pin: hashedPin,
      pinUpdatedAt: new Date(),
    });

    // Clean up OTP
    await this.redisService.getClient().del(redisKey);

    this.logger.log(
      `PIN changed successfully for user ID: ${userId}`,
      'PinManagementService',
    );

    return {
      data: {},
      message: 'PIN changed successfully.',
      errors: {},
    };
  }

  /**
   * Step 1: Initiate PIN reset with current PIN verification
   */
  async initiatePinReset(
    resetPinInitiateDto: ResetPinInitiateDto,
    userId: number,
  ): Promise<any> {
    const existingUser = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'phoneNumber', 'pin'],
    });

    if (!existingUser) {
      throw new NotFoundException('User not found.');
    }

    // Verify current PIN
    const isPinValid = await this.verifyPin(
      resetPinInitiateDto.currentPin,
      existingUser.pin,
    );
    if (!isPinValid) {
      throw new BadRequestException('Invalid current PIN.');
    }

    // Generate and store OTP
    const otp = this.generateOtp();
    const redisKey = `pinResetOtp:${userId}`;

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
      existingUser.phoneNumber,
      `Your PIN reset OTP is: ${otp}. This code expires in 3 minutes.`,
    );

    // Mask phone number for response
    const maskedPhoneNumber = this.maskPhoneNumber(existingUser.phoneNumber);

    this.logger.log(
      `PIN reset OTP sent to user ID: ${userId}`,
      'PinManagementService',
    );

    return {
      data: {
        maskedPhoneNumber,
      },
      message: `An OTP has been sent to your mobile number.${otp}`,
      errors: {},
    };
  }

  /**
   * Step 2: Verify OTP and generate reset token
   */
  async verifyResetOtp(
    verifyOtpDto: VerifyOtpDto,
    userId: number,
  ): Promise<any> {
    const existingUser = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'phoneNumber'],
    });

    if (!existingUser) {
      throw new NotFoundException('User not found.');
    }

    const redisKey = `pinResetOtp:${userId}`;
    const storedOtp = await this.redisService.getClient().get(redisKey);

    if (!storedOtp || storedOtp !== verifyOtpDto.otp.toString()) {
      throw new BadRequestException('Invalid or expired OTP.');
    }

    // Generate reset token
    const resetToken = this.generateResetToken();
    const resetTokenKey = `pinResetToken:${userId}`;

    // Store reset token for 10 minutes
    await this.redisService.getClient().set(
      resetTokenKey,
      resetToken,
      'EX',
      240, // 3 minutes expiry
    );

    // Clean up OTP
    await this.redisService.getClient().del(redisKey);

    this.logger.log(
      `OTP verified successfully for PIN reset - User ID: ${userId}`,
      'PinManagementService',
    );

    return {
      data: {
        resetToken,
      },
      message: 'OTP verified successfully. You can now set a new PIN.',
      errors: {},
    };
  }

  /**
   * Step 3: Complete PIN reset with new PIN
   */
  async completePinReset(
    resetPinCompleteDto: ResetPinCompleteDto,
    userId: number,
  ): Promise<any> {
    const existingUser = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'phoneNumber'],
    });

    if (!existingUser) {
      throw new NotFoundException('User not found.');
    }

    // Verify PIN confirmation
    if (resetPinCompleteDto.newPin !== resetPinCompleteDto.confirmPin) {
      throw new BadRequestException('PIN confirmation does not match.');
    }

    // Verify reset token
    const resetTokenKey = `pinResetToken:${userId}`;
    const storedToken = await this.redisService.getClient().get(resetTokenKey);

    if (!storedToken || storedToken !== resetPinCompleteDto.resetToken) {
      throw new BadRequestException('Invalid or expired reset token.');
    }

    // Hash new PIN
    const hashedPin = await this.hashPin(resetPinCompleteDto.newPin);

    // Update PIN in database
    await this.userRepository.update(existingUser.id, {
      pin: hashedPin,
      pinUpdatedAt: new Date(),
    });

    // Clean up reset token
    await this.redisService.getClient().del(resetTokenKey);

    // Send confirmation SMS
    await this.notificationsService.sendSms(
      existingUser.phoneNumber,
      'Your transaction PIN has been successfully reset.',
    );

    this.logger.log(
      `PIN reset completed successfully for user ID: ${existingUser.id}`,
      'PinManagementService',
    );

    return {
      data: {},
      message: 'Your transaction PIN has been successfully reset.',
      errors: {},
    };
  }

  /**
   * Helper method to generate reset token
   */
  private generateResetToken(): string {
    return `reset_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

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

  /**
   * Verify PIN (utility method that can be exported for other services)
   */
  async verifyUserPin(userId: number, pin: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'pin'],
    });

    if (!user || !user.pin) {
      return false;
    }

    return await this.verifyPin(pin, user.pin);
  }
}
