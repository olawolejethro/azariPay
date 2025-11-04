import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BeneficiaryEntity } from '../entities/beneficiary.entity';
import { Repository } from 'typeorm';
import { LoggerService } from 'src/common/logger/logger.service';
import { NGNWalletEntity } from '../entities/NGNwallet.entity';
import { CADWalletEntity } from '../entities/CADwallet.entity';

@Injectable()
export class BeneficiaryService {
  constructor(
    @InjectRepository(BeneficiaryEntity)
    private readonly beneficiaryRepository: Repository<BeneficiaryEntity>,
    @InjectRepository(NGNWalletEntity)
    private readonly ngnWalletRepository: Repository<NGNWalletEntity>,
    @InjectRepository(CADWalletEntity)
    private readonly cadWalletRepository: Repository<CADWalletEntity>,

    private readonly logger: LoggerService,
  ) {
    this.logger = logger;
  }

  async saveBeneficiaryFromTransaction(userId: number, beneficiaryData: any) {
    try {
      // Get user's wallet
      const wallet = await this.ngnWalletRepository.findOne({
        where: { userId: userId },
      });

      if (!wallet) {
        console.log('No wallet found for user, cannot save beneficiary');
        return null;
      }

      // Check if beneficiary already exists
      // const existingBeneficiary = await this.findExistingBeneficiary(userId, beneficiaryData);

      // if (existingBeneficiary) {
      //   console.log('Beneficiary already exists:', existingBeneficiary.id);
      //   return existingBeneficiary;
      // }
      console.log(beneficiaryData, 'beneficiaryData');
      // Create new beneficiary
      const newBeneficiary = this.beneficiaryRepository.create({
        userId: userId,
        walletId: wallet.id,
        accountNumber: beneficiaryData.accountNumber || '',
        accountName: beneficiaryData.accountName || '',
        bankCode: beneficiaryData.bankCode || '',
        bankName: beneficiaryData.bankName || '',
        countryCode: beneficiaryData.currencyCode,
        metadata: {
          recipientEmail: beneficiaryData.recipientEmail || null,
          recipientName: beneficiaryData.recipientName || null,
          transferType: beneficiaryData.type || 'unknown',
          savedFromTransaction: true,
          savedAt: new Date().toISOString(),
        },
      });

      const savedBeneficiary =
        await this.beneficiaryRepository.save(newBeneficiary);
      // console.log('New beneficiary saved:', savedBeneficiary.id);

      return savedBeneficiary;
    } catch (error) {
      console.error('Error saving beneficiary:', error);
      return null; // Don't fail the whole request if save fails
    }
  }

  private async findExistingBeneficiary(userId: number, beneficiaryData: any) {
    // For bank transfers
    if (beneficiaryData.accountNumber && beneficiaryData.bankCode) {
      return await this.beneficiaryRepository.findOne({
        where: {
          userId: userId,
          accountNumber: beneficiaryData.accountNumber,
          bankCode: beneficiaryData.bankCode,
          isActive: true,
        },
      });
    }

    // For email transfers - check in metadata
    if (beneficiaryData.recipientEmail) {
      return await this.beneficiaryRepository
        .createQueryBuilder('beneficiary')
        .where('beneficiary.userId = :userId', { userId })
        .andWhere('beneficiary.isActive = :isActive', { isActive: true })
        .andWhere("beneficiary.metadata->>'recipientEmail' = :email", {
          email: beneficiaryData.recipientEmail,
        })
        .getOne();
    }

    return null;
  }

  async findAllBeneficiary(userId: number): Promise<BeneficiaryEntity[]> {
    return this.beneficiaryRepository.find({
      where: {
        userId,
        isActive: true,
      },
      order: {
        isFavorite: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  async findByWalletId(
    userId: number,
    countryCode?: string,
  ): Promise<BeneficiaryEntity[]> {
    // Build query conditions
    const whereConditions: any = {
      userId,
      isActive: true,
    };

    // Add country filter if provided
    if (countryCode) {
      whereConditions.countryCode = countryCode.toUpperCase();
    }

    // Get all beneficiaries for this user (optionally filtered by country)
    const beneficiaries = await this.beneficiaryRepository.find({
      where: whereConditions,
      order: {
        isFavorite: 'DESC', // Favorites first
        createdAt: 'DESC',
      },
    });

    // Create a map to remove duplicates by account number + bank code
    const uniqueBeneficiaries = new Map();

    for (const beneficiary of beneficiaries) {
      const key = `${beneficiary.accountNumber}-${beneficiary.bankCode}`;

      // If this is a duplicate, only keep it if it's a favorite and the existing one isn't
      if (uniqueBeneficiaries.has(key)) {
        const existing = uniqueBeneficiaries.get(key);
        if (beneficiary.isFavorite && !existing.isFavorite) {
          uniqueBeneficiaries.set(key, beneficiary);
        }
      } else {
        uniqueBeneficiaries.set(key, beneficiary);
      }
    }

    // Convert back to array
    const allBeneficiaries = Array.from(uniqueBeneficiaries.values());

    // Sort by favorite status and then by name
    return allBeneficiaries.sort((a, b) => {
      // First sort by favorite status (favorites first)
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      // Then sort by account name
      return a.accountName.localeCompare(b.accountName);
    });
  }

  async deleteByUserId(id: number, userId: number): Promise<any> {
    try {
      return await this.beneficiaryRepository.delete({ id, userId });
    } catch (error) {
      this.logger.error(
        `Error in deleteByUserId: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to delete beneficiaries: ${error.message}`);
    }
  }
}
