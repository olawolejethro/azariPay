// src/modules/country/country.service.ts

import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  SUPPORTED_COUNTRIES,
  CountryData,
  getAllCountries,
  getCountryByCode,
  getCountriesByCurrency,
} from '../../common/constants/countries.constant';
import { City, State } from 'country-state-city'; // Ensure this is the correct module for City and State
import { FileStoreService } from 'src/filestore/services/filestore.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/auth/entities/user.entity';
import { UploadFileDto } from 'src/filestore/dto/upload-file.dto';
import { UpdateProfileDto } from '../dtos/update-profile.dto';
import { RedisService } from 'src/common/redis/redis.service';
import { NotificationsService } from 'src/common/notifications/notifications.service';
import {
  CompleteAddressEditDto,
  InitiateAddressEditDto,
  VerifyAddressOtpDto,
} from '../dtos/initiate-address-edit.dto';

@Injectable()
export class CountryService {
  private readonly CACHE_KEY = 'countries';
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly CANADA_ISO = 'CA';
  private readonly PROVINCES_CACHE_KEY = 'canadian_provinces';
  private readonly CITIES_CACHE_KEY = 'canadian_cities';
  protected readonly logger = new Logger(CountryService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private fileStoreService: FileStoreService,
    private redisService: RedisService,
    private notificationsService: NotificationsService,
  ) {}

  async getAllCountries(): Promise<CountryData[]> {
    // Try to get from cache first
    let countries = await this.cacheManager.get<CountryData[]>(this.CACHE_KEY);

    if (!countries) {
      // If not in cache, get from constants and store
      countries = getAllCountries();
      await this.cacheManager.set(this.CACHE_KEY, countries, this.CACHE_TTL);
    }

    return countries;
  }

  async getCountryByCode(code: string): Promise<CountryData | undefined> {
    const countries = await this.getAllCountries();
    return countries.find((country) => country.code === code.toUpperCase());
  }

  async getCountriesByCurrency(currencyCode: string): Promise<CountryData[]> {
    const countries = await this.getAllCountries();
    return countries.filter(
      (country) => country.currencyCode === currencyCode.toUpperCase(),
    );
  }

  async isValidCountryCode(code: string): Promise<boolean> {
    return !!SUPPORTED_COUNTRIES[code.toUpperCase()];
  }

  async isValidCurrencyCode(currencyCode: string): Promise<boolean> {
    const countries = await this.getAllCountries();
    return countries.some(
      (country) => country.currencyCode === currencyCode.toUpperCase(),
    );
  }

  /**
   * Get all Canadian provinces/states
   */
  async getProvinces() {
    // Try to get from cache first
    const cachedProvinces = await this.cacheManager.get(
      this.PROVINCES_CACHE_KEY,
    );
    if (cachedProvinces) {
      return cachedProvinces;
    }

    // Get provinces from package
    const provinces = State.getStatesOfCountry(this.CANADA_ISO).map(
      (province) => ({
        name: province.name,
        code: province.isoCode,
        latitude: province.latitude,
        longitude: province.longitude,
      }),
    );

    // Store in cache
    await this.cacheManager.set(this.PROVINCES_CACHE_KEY, provinces, {
      ttl: 86400,
    }); // 24 hours

    return provinces;
  }

  /**
   * Get Canadian cities, optionally filtered by province
   */
  async getCities(provinceCode?: string) {
    // Generate cache key based on parameters
    const cacheKey = provinceCode
      ? `${this.CITIES_CACHE_KEY}_${provinceCode}`
      : this.CITIES_CACHE_KEY;

    // Try to get from cache first
    const cachedCities = await this.cacheManager.get(cacheKey);
    if (cachedCities) {
      return cachedCities;
    }

    let cities = [];

    if (provinceCode) {
      // Get cities for a specific province
      cities = City.getCitiesOfState(this.CANADA_ISO, provinceCode).map(
        (city) => ({
          name: city.name,
          province_code: provinceCode,
          latitude: city.latitude,
          longitude: city.longitude,
        }),
      );
    } else {
      // Get all Canadian cities
      const provinces = await this.getProvinces();

      // For each province, get its cities
      cities = provinces.flatMap((province) => {
        return City.getCitiesOfState(this.CANADA_ISO, province.code).map(
          (city) => ({
            name: city.name,
            province_name: province.name,
            province_code: province.code,
            latitude: city.latitude,
            longitude: city.longitude,
          }),
        );
      });
    }

    // Store in cache
    await this.cacheManager.set(cacheKey, cities, { ttl: 3600 }); // 1 hour

    return cities;
  }

  /**
   * Get Canadian towns, optionally filtered by province
   * Towns are defined as settlements with population < 10,000 or specific municipal types
   */
  async getTowns(provinceCode?: string) {
    // Generate cache key based on parameters
    const TOWNS_CACHE_KEY = 'canadian_towns';
    const cacheKey = provinceCode
      ? `${TOWNS_CACHE_KEY}_${provinceCode}`
      : TOWNS_CACHE_KEY;

    // Try to get from cache first
    const cachedTowns = await this.cacheManager.get(cacheKey);
    if (cachedTowns) {
      return cachedTowns;
    }

    let towns = [];

    try {
      if (provinceCode) {
        // Get all cities for a specific province, then filter for towns
        const allCities = City.getCitiesOfState(this.CANADA_ISO, provinceCode);

        towns = allCities
          .filter((city) => this.isTown(city))
          .map((town) => ({
            name: town.name,
            province_code: provinceCode,
            latitude: town.latitude,
            longitude: town.longitude,
            type: 'town',
          }));
      } else {
        // Get all Canadian towns across all provinces
        const provinces = await this.getProvinces();

        towns = provinces.flatMap((province) => {
          const allCities = City.getCitiesOfState(
            this.CANADA_ISO,
            province.code,
          );

          return allCities
            .filter((city) => this.isTown(city))
            .map((town) => ({
              name: town.name,
              province_name: province.name,
              province_code: province.code,
              latitude: town.latitude,
              longitude: town.longitude,
              type: 'town',
            }));
        });
      }

      // Store in cache
      await this.cacheManager.set(cacheKey, towns, { ttl: 3600 }); // 1 hour

      this.logger.log(
        `Retrieved ${towns.length} towns${provinceCode ? ` for province ${provinceCode}` : ' for all provinces'}`,
        'CountryService',
      );

      return towns;
    } catch (error) {
      this.logger.error(
        `Failed to retrieve towns${provinceCode ? ` for province ${provinceCode}` : ''}: ${error.message}`,
        'CountryService',
      );
      throw new InternalServerErrorException('Failed to retrieve towns data');
    }
  }

  /**
   * Helper method to determine if a settlement should be classified as a town
   * You can customize this logic based on your business requirements
   */
  private isTown(city: any): boolean {
    // Since country-state-city doesn't provide population data,
    // we'll use name patterns and known town indicators

    const townIndicators = [
      'town',
      'township',
      'village',
      'hamlet',
      'settlement',
      'community',
      'station',
    ];

    const cityIndicators = ['city', 'metropolitan', 'capital'];

    const lowerName = city.name.toLowerCase();

    // If explicitly contains city indicators, it's not a town
    if (cityIndicators.some((indicator) => lowerName.includes(indicator))) {
      return false;
    }

    // If contains town indicators, it's likely a town
    if (townIndicators.some((indicator) => lowerName.includes(indicator))) {
      return true;
    }

    // For ambiguous cases, you might want to maintain a whitelist/blacklist
    // or integrate with Statistics Canada data for more accurate classification

    // Default: assume smaller settlements are towns (this is a simplified approach)
    // You may want to refine this logic based on your specific needs
    return true;
  }

  async uploadProfilePicture(
    userId: number,
    file: Express.Multer.File,
  ): Promise<{
    data: { profilePictureUrl: string };
    message: string;
    errors: {};
  }> {
    this.logger.log(
      `Uploading profile picture for user ID: ${userId} ${file}`,
      'AuthService',
    );

    try {
      // Find user
      const user = await this.usersRepository.findOne({
        where: { id: userId },
      });
      if (!user) {
        this.logger.warn(
          `User not found for profile picture upload: ${userId}`,
          'AuthService',
        );
        throw new NotFoundException('User not found');
      }

      // Prepare metadata for the profile picture
      const fileMetadata = {
        type: 'profile_picture',
        userId: userId,
        uploadedAt: new Date().toISOString(),
        originalName: file.originalname,
      };

      // Create UploadFileDto
      const uploadFileDto: UploadFileDto = {
        file: file,
        fileMetadata: JSON.stringify(fileMetadata), // FileStoreService expects stringified JSON
      };

      // Upload using existing FileStoreService method
      const uploadedFile = await this.fileStoreService.uploadFile(
        uploadFileDto,
        userId,
      );

      // Delete old profile picture if exists
      // if (user.profilePictureUrl) {
      //   try {
      //     // You might want to also delete the old FileStore record
      //     const oldFileStore = await this.fileStoreService.(user.profilePictureUrl);
      //     if (oldFileStore) {
      //       await this.fileStoreService.deleteFile(oldFileStore.id);
      //     }
      //   } catch (error) {
      //     this.logger.warn(`Failed to delete old profile picture: ${error.message}`, 'AuthService');
      //   }
      // }

      // Update user with new profile picture URL
      user.profilePictureUrl = uploadedFile.fileUrl;
      user.profilePictureUpdatedAt = new Date();
      await this.usersRepository.save(user);

      this.logger.log(
        `Profile picture uploaded successfully for user ID: ${userId}`,
        'AuthService',
      );

      return {
        data: {
          profilePictureUrl: uploadedFile.fileUrl,
        },
        message: 'Profile picture uploaded successfully',
        errors: {},
      };
    } catch (error) {
      console.log(error, 'err');
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Profile picture upload failed for user ID ${userId}: ${error.message}`,
        'countryService',
      );
      throw new InternalServerErrorException(
        'Failed to upload profile picture',
      );
    }
  }

  async updateProfile(
    userId: number,
    updateProfileDto: UpdateProfileDto,
  ): Promise<{
    data: Partial<User>;
    message: string;
    errors: {};
  }> {
    this.logger.log(`Updating profile for user ID: ${userId}`, 'AuthService');

    try {
      const user = await this.usersRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Update allowed fields
      if (updateProfileDto.firstName !== undefined) {
        user.firstName = updateProfileDto.firstName;
      }

      if (updateProfileDto.lastName !== undefined) {
        user.lastName = updateProfileDto.lastName;
      }

      // ✅ Fixed: Properly merge address object
      if (updateProfileDto.address !== undefined) {
        user.address = {
          ...(user.address || {}), // Handle null/undefined address
          ...updateProfileDto.address,
        };
      }

      // Using save() will trigger transformers (encrypt firstName, lastName, address)
      const updatedUser = await this.usersRepository.save(user);

      this.logger.log(
        `Profile updated successfully for user ID: ${userId}`,
        'AuthService',
      );

      return {
        data: {
          id: updatedUser.id,
          firstName: updatedUser.firstName, // Auto-decrypted
          lastName: updatedUser.lastName, // Auto-decrypted
          phoneNumber: updatedUser.phoneNumber,
          interacEmailAddress: updatedUser.interacEmailAddress, // Auto-decrypted
          profilePictureUrl: updatedUser.profilePictureUrl,
          dateOfBirth: updatedUser.dateOfBirth, // Auto-decrypted
          gender: updatedUser.gender,
          address: updatedUser.address, // Auto-decrypted
        },
        message: 'Profile updated successfully',
        errors: {},
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Failed to update profile for user ID ${userId}: ${error.message}`,
        'AuthService',
      );
      throw new InternalServerErrorException('Failed to update profile');
    }
  }
  /**
   * Step 1: Initiate address edit - just send OTP
   */
  async initiateAddressEdit(userId: number): Promise<any> {
    const existingUser = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'phoneNumber'],
    });

    if (!existingUser) {
      throw new NotFoundException('User not found.');
    }

    // Generate and store OTP
    const otp = this.generateOtp();
    const redisKey = `addressEditOtp:${userId}`;

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
      `Your address update OTP is: ${otp}. This code expires in 3 minutes.`,
    );

    // Mask phone number for response
    const maskedPhoneNumber = this.maskPhoneNumber(existingUser.phoneNumber);

    this.logger.log(
      `Address edit OTP sent to user ID: ${userId}`,
      'AddressService',
    );

    return {
      data: {
        maskedPhoneNumber,
      },
      message: `An OTP has been sent to your mobile number to verify address changes.${otp}`,
      errors: {},
    };
  }

  /**
   * Step 2: Verify OTP and generate edit token
   */
  async verifyAddressOtp(
    verifyAddressOtpDto: VerifyAddressOtpDto,
    userId: number,
  ): Promise<any> {
    const existingUser = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'phoneNumber'],
    });

    if (!existingUser) {
      throw new NotFoundException('User not found.');
    }

    const redisKey = `addressEditOtp:${userId}`;
    const storedOtp = await this.redisService.getClient().get(redisKey);
    console.log(storedOtp, 'storedOtp');

    if (!storedOtp || storedOtp !== verifyAddressOtpDto.otp.toString()) {
      throw new BadRequestException('Invalid or expired OTP.');
    }

    // Generate edit token
    const editToken = this.generateEditToken();
    const editTokenKey = `addressEditToken:${userId}`;

    // Store edit token for 10 minutes
    await this.redisService.getClient().set(
      editTokenKey,
      editToken,
      'EX',
      240, // 3 minutes expiry
    );

    // Clean up OTP
    await this.redisService.getClient().del(redisKey);

    this.logger.log(
      `OTP verified successfully for address edit - User ID: ${userId}`,
      'AddressService',
    );

    return {
      data: {
        editToken,
      },
      message: 'OTP verified successfully. You can now save your new address.',
      errors: {},
    };
  }

  /**
   * Step 3: Complete address edit with final address data
   */
  async completeAddressEdit(
    completeAddressEditDto: CompleteAddressEditDto,
    userId: number,
  ): Promise<any> {
    const existingUser = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'phoneNumber', 'address'],
    });

    if (!existingUser) {
      throw new NotFoundException('User not found.');
    }

    // Verify edit token
    const editTokenKey = `addressEditToken:${userId}`;
    const storedToken = await this.redisService.getClient().get(editTokenKey);

    if (!storedToken || storedToken !== completeAddressEditDto.editToken) {
      throw new BadRequestException('Invalid or expired edit token.');
    }

    // Prepare final address (exclude editToken)
    const { editToken, ...finalAddressData } = completeAddressEditDto;
    const finalAddress = this.cleanAddressObject(finalAddressData);

    // Update address in database
    await this.usersRepository.update(userId, {
      address: finalAddress,
    });

    // Clean up tokens and pending data
    await this.redisService.getClient().del(editTokenKey);
    await this.redisService.getClient().del(`pendingAddress:${userId}`);

    // Send confirmation SMS
    await this.notificationsService.sendSms(
      existingUser.phoneNumber,
      'Your address has been successfully updated.',
    );

    this.logger.log(
      `Address updated successfully for user ID: ${userId}`,
      'AddressService',
    );

    return {
      data: {
        address: this.filterNonEmptyFields(finalAddress),
      },
      message: 'Your address has been successfully updated.',
      errors: {},
    };
  }

  /**
   * Get current address
   */
  async getCurrentAddress(userId: number): Promise<any> {
    const existingUser = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'address'],
    });

    if (!existingUser) {
      throw new NotFoundException('User not found.');
    }

    return {
      data: {
        address: existingUser.address || {},
      },
      message: 'Address retrieved successfully.',
      errors: {},
    };
  }

  /**
   * Helper method to generate edit token
   */
  private generateEditToken(): string {
    return `edit_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
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
   * Helper method to generate 6-digit OTP
   */
  private generateOtp(): number {
    return Math.floor(100000 + Math.random() * 900000);
  }

  /**
   * Helper method to clean address object (remove empty strings and undefined)
   */
  private cleanAddressObject(addressData: any): any {
    const cleaned = {};
    Object.keys(addressData).forEach((key) => {
      if (addressData[key] && addressData[key].toString().trim() !== '') {
        cleaned[key] = addressData[key].toString().trim();
      }
    });
    return cleaned;
  }

  /**
   * Helper method to filter non-empty fields for response
   */
  private filterNonEmptyFields(address: any): any {
    const filtered = {};
    Object.keys(address).forEach((key) => {
      if (address[key]) {
        filtered[key] = address[key];
      }
    });
    return filtered;
  }

  /**
   * Helper method to compare addresses
   */
  private areAddressesEqual(current: any, newAddr: any): boolean {
    const currentCleaned = this.cleanAddressObject(current);
    const newCleaned = this.cleanAddressObject(newAddr);

    return JSON.stringify(currentCleaned) === JSON.stringify(newCleaned);
  }
}
