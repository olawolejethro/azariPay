import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { BeneficiaryService } from '../services/beneficiary.service';
import { LoggerService } from 'src/common/logger/logger.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEntity } from '../entities/transaction.entity';
import { EncryptionService } from 'src/common/encryption/encryption.service';

@Controller('api/v1/wallets')
export class BeneficiaryController {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    private readonly beneficiaryService: BeneficiaryService,
    private readonly encryptionService: EncryptionService,
    private readonly logger: LoggerService,
  ) {}

  @Get('allBeneficiaries')
  @UseGuards(JwtAuthGuard)
  async getAllBeneficiaries(@Request() req): Promise<any> {
    const userId = req.user.userId;

    this.logger.log(`Retrieving all beneficiaries for user ${userId}`);

    const beneficiaries =
      await this.beneficiaryService.findAllBeneficiary(userId);

    return {
      data: {
        beneficiaries: beneficiaries.map((beneficiary) => ({
          id: beneficiary.id,
          accountNumber: beneficiary.accountNumber,
          accountName: beneficiary.accountName,
          bankCode: beneficiary.bankCode,
          bankName: beneficiary.bankName,
          countryCode: beneficiary.countryCode,
          isFavorite: beneficiary.isFavorite,
        })),
      },
      message: 'Beneficiaries retrieved successfully.',
      errors: {},
    };
  }

  @Get('transaction/:transactionId/beneficiary')
  @UseGuards(JwtAuthGuard)
  async getBeneficiaryByTransactionId(
    @Request() request,
    @Param('transactionId') transactionId: string,
  ) {
    const userId = request.user.userId;

    try {
      // 1. Find the transaction
      const transactionIdHash = this.encryptionService.hash(transactionId);
      const transaction = await this.transactionRepository.findOne({
        where: {
          transactionIdHash,
          userId: userId,
        },
      });

      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }

      // 2. Extract beneficiary data from transaction metadata
      let beneficiaryData = null;

      if (transaction.currency === 'NGN') {
        // For bank transfers (NGN, etc.)
        beneficiaryData = {
          accountNumber: transaction.metadata?.beneficiary?.accountNo,
          accountName: transaction.metadata?.beneficiary?.fullName,
          bankCode: transaction.metadata?.beneficiary?.bankCode,
          bankName: transaction.metadata.beneficiary.bankName,
          currencyCode: transaction.currency,
        };
      } else if (transaction.currency === 'CAD') {
        // For email transfers (CAD Interac, etc.)
        beneficiaryData = {
          recipientEmail: transaction.metadata.recipientEmail,
          recipientName: transaction.metadata.recipientName,
          bankName: 'Interac e-Transfer',
          accountNumber: transaction.metadata.recipientEmail,
          accountName: transaction.metadata?.recipientName || 'Interac User',
          bankCode: 'INTERAC',
          currencyCode: transaction.currency,
        };
      }

      // 3. Save beneficiary if we found data and it doesn't exist
      let savedBeneficiary = null;
      if (beneficiaryData) {
        savedBeneficiary =
          await this.beneficiaryService.saveBeneficiaryFromTransaction(
            userId,
            beneficiaryData,
          );
      }

      // 4. Return simple response
      return {
        success: true,
        transactionId: transactionId,
        transaction: {
          id: transaction.id,
          amount: transaction.amount,
          currency: transaction.currency,
          status: transaction.status,
          description: transaction.description,
          createdAt: transaction.createdAt,
        },
        beneficiary: savedBeneficiary || beneficiaryData,
        saved: !!savedBeneficiary,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  @Get('beneficiaries')
  @UseGuards(JwtAuthGuard)
  async getWalletBeneficiaries(
    @Request() req,
    @Query('countryCode') countryCode?: string, // Add optional country code filter
  ): Promise<any> {
    const userId = req.user.userId;

    // Validate country code format if provided
    // if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
    //   throw new BadRequestException('Country code must be a valid 2-letter ISO code (e.g., NG, CA, US)');
    // }

    const beneficiaries = await this.beneficiaryService.findByWalletId(
      userId,
      countryCode,
    );

    return {
      data: {
        beneficiaries: beneficiaries.map((beneficiary) => ({
          id: beneficiary.id,
          accountNumber: beneficiary.accountNumber,
          accountName: beneficiary.accountName,
          bankCode: beneficiary.bankCode,
          bankName: beneficiary.bankName,
          countryCode: beneficiary.countryCode,
          isFavorite: beneficiary.isFavorite,
          // Optional: Add metadata for additional info
          transferCount: beneficiary.metadata?.transferCount || 0,
          lastTransferDate: beneficiary.metadata?.lastTransferDate || null,
        })),
        totalCount: beneficiaries.length,
      },
      message: countryCode
        ? `Beneficiaries for country ${countryCode} retrieved successfully.`
        : 'All beneficiaries retrieved successfully.',
      errors: {},
    };
  }

  @Delete('user/:id/beneficiaries')
  @UseGuards(JwtAuthGuard)
  // @Roles('ADMIN') // Restrict this operation to admins only
  async deleteBeneficiariesByUserId(
    @Param('id') id: number,
    @Request() req,
  ): Promise<any> {
    const userId = req.user.userId;
    // Delete the beneficiaries
    const result = await this.beneficiaryService.deleteByUserId(
      Number(id),
      userId,
    );

    return {
      statusCode: HttpStatus.OK,
      data: {
        deletedCount: result.affected || 0,
      },
      message: `Successfully deleted ${result.affected || 0} beneficiaries for user ${userId}`,
    };
  }
}
