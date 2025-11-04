// src/metadata/controllers/country.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Put,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiOkResponse,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { CountryService } from '../services/country.service';
import { CountryResponseDto } from '../dtos/CountryResponse.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UpdateProfileDto } from '../dtos/update-profile.dto';
import {
  CompleteAddressEditDto,
  InitiateAddressEditDto,
  VerifyAddressOtpDto,
} from '../dtos/initiate-address-edit.dto';

@Controller('api/v1/metadata')
@ApiTags('Metadata')
export class CountryController {
  constructor(
    private readonly countryService: CountryService,
    // private readonly logger = new Logger(CountryController.name),
  ) {}

  @Get('countries')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all supported countries' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully retrieved countries list',
    type: [CountryResponseDto],
  })
  async getCountries(): Promise<CountryResponseDto[]> {
    return this.countryService.getAllCountries();
  }

  @Get('provinces')
  @ApiOperation({ summary: 'Get all Canadian provinces/states' })
  @ApiOkResponse({ description: 'List of all Canadian provinces' })
  async getProvinces() {
    const provinces = await this.countryService.getProvinces();

    return {
      success: true,
      count: provinces.length,
      data: provinces,
    };
  }

  @Get('cities')
  @ApiOperation({ summary: 'Get all Canadian cities' })
  @ApiQuery({
    name: 'province',
    required: false,
    description: 'Province code (e.g., ON, BC)',
    type: String,
  })
  @ApiOkResponse({ description: 'List of Canadian cities' })
  async getCities(@Query('province') province?: string) {
    const cities = await this.countryService.getCities(province);

    return {
      success: true,
      count: cities.length,
      data: cities,
    };
  }

  @Get('towns')
  @ApiOperation({ summary: 'Get all Canadian towns' })
  @ApiQuery({
    name: 'province',
    required: false,
    description: 'Province code (e.g., ON, BC)',
    type: String,
  })
  @ApiOkResponse({ description: 'List of Canadian towns' })
  async getTowns(@Query('province') province?: string) {
    const towns = await this.countryService.getTowns(province);

    return {
      success: true,
      count: towns.length,
      data: towns,
    };
  }
  // In auth.controller.ts

  @Post('profile/upload-picture')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('profilePicture', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
      fileFilter: (req, file, callback) => {
        // Allow only image files
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return callback(
            new BadRequestException(
              'Only image files are allowed (jpg, jpeg, png, gif, webp)',
            ),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Upload user profile picture' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        profilePicture: {
          type: 'string',
          format: 'binary',
          description: 'Profile picture file (max 5MB)',
        },
      },
      required: ['profilePicture'],
    },
  })
  async uploadProfilePicture(
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.countryService.uploadProfilePicture(req.user.userId, file);
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update user profile information' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string', example: 'John' },
        lastName: { type: 'string', example: 'Doe' },
        address: {
          type: 'object',
          properties: {
            street: { type: 'string', example: '123 Main St' },
            apartmentNumber: { type: 'string', example: 'Apt 4B' },
            city: { type: 'string', example: 'Lagos' },
            stateProvince: { type: 'string', example: 'Lagos State' },
            zipCode: { type: 'string', example: '100001' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    schema: {
      example: {
        data: {
          id: 1,
          firstName: 'John',
          lastName: 'Doe',
          phoneNumber: '+2348012345678',
          interacEmailAddress: 'user@example.com',
          address: {
            street: '123 Main St',
            apartmentNumber: 'Apt 4B',
            city: 'Lagos',
            stateProvince: 'Lagos State',
            zipCode: '100001',
          },
          profilePictureUrl: 'https://bucket.s3.wasabisys.com/profile.jpg',
        },
        message: 'Profile updated successfully',
        errors: {},
      },
    },
  })
  async updateProfile(
    @Request() req,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.countryService.updateProfile(req.user.userId, updateProfileDto);
  }

  /**
   * ================================
   * Edit Address - Step 1: Initiate with new address data
   * ================================
   */
  @Post('edit/address/initiate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Initiate address edit with new address data' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully for address verification.',
    schema: {
      example: {
        data: {
          maskedPhoneNumber: '+234***6789',
          pendingAddress: {
            street: '456 New Street',
            city: 'Abuja',
          },
        },
        message:
          'An OTP has been sent to your mobile number to verify the address change.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'No address changes detected.',
    schema: {
      example: {
        data: {},
        message: 'No address changes detected.',
        errors: {
          address: 'The provided address is the same as your current address.',
        },
      },
    },
  })
  async initiateAddressEdit(@Request() req: any) {
    const userId = req.user.userId;
    // this.logger.log(`Initiating address edit for user ID: ${userId}`);
    return await this.countryService.initiateAddressEdit(userId);
  }

  /**
   * ================================
   * Edit Address - Step 2: Verify OTP
   * ================================
   */
  @Post('edit/address/verify-otp')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Verify OTP for address edit' })
  @ApiResponse({
    status: 200,
    description: 'OTP verified successfully.',
    schema: {
      example: {
        data: {
          editToken: 'edit_token_abc123',
        },
        message:
          'OTP verified successfully. You can now save your new address.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired OTP.',
    schema: {
      example: {
        data: {},
        message: 'Invalid or expired OTP.',
        errors: {
          otp: 'The OTP provided is invalid or has expired.',
        },
      },
    },
  })
  async verifyAddressOtp(
    @Body() verifyAddressOtpDto: VerifyAddressOtpDto,
    @Request() req: any,
  ) {
    const userId = req.user.userId;
    // this.logger.log(`Verifying OTP for address edit - User ID: ${userId}`);
    return await this.countryService.verifyAddressOtp(
      verifyAddressOtpDto,
      userId,
    );
  }

  /**
   * ================================
   * Edit Address - Step 3: Save new address
   * ================================
   */
  @Post('edit/address/complete')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Complete address edit with final address data' })
  @ApiResponse({
    status: 200,
    description: 'Address updated successfully.',
    schema: {
      example: {
        data: {
          address: {
            street: '456 New Street',
            apartmentNumber: 'Unit 2A',
            city: 'Abuja',
            stateProvince: 'FCT',
            zipCode: '900001',
          },
        },
        message: 'Your address has been successfully updated.',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid edit token.',
    schema: {
      example: {
        data: {},
        message: 'Invalid or expired edit token.',
        errors: {
          editToken: 'The edit token is invalid or has expired.',
        },
      },
    },
  })
  async completeAddressEdit(
    @Body() completeAddressEditDto: CompleteAddressEditDto,
    @Request() req: any,
  ) {
    const userId = req.user.userId;
    // this.logger.log(`Completing address edit for user ID: ${userId}`);
    return await this.countryService.completeAddressEdit(
      completeAddressEditDto,
      userId,
    );
  }

  /**
   * ================================
   * Get Current Address
   * ================================
   */
  @Get('current')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user address' })
  @ApiResponse({
    status: 200,
    description: 'Current address retrieved successfully.',
    schema: {
      example: {
        data: {
          address: {
            street: '123 Main Street',
            apartmentNumber: 'Apt 4B',
            city: 'Lagos',
            stateProvince: 'Lagos State',
            zipCode: '100001',
          },
        },
        message: 'Address retrieved successfully.',
        errors: {},
      },
    },
  })
  async getCurrentAddress(@Request() req: any) {
    const userId = req.user.id;
    // this.logger.log(`Getting current address for user ID: ${userId}`);
    return await this.countryService.getCurrentAddress(userId);
  }
}
