import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeeConfiguration } from '../entities/fee-config.entity';
import { CreateFeeDto, UpdateFeeDto } from '../dtos/fee-management.dto';
import { EmailService } from 'src/common/notifications/email.service';

@Injectable()
export class FeeManagementService {
  private readonly logger = new Logger(FeeManagementService.name);
  constructor(
    @InjectRepository(FeeConfiguration)
    private readonly feeConfigRepository: Repository<FeeConfiguration>,
    private readonly emailService: EmailService, // Replace 'any' with your actual EmailService type
  ) {}

  async createFeeConfiguration(
    createFeeDto: CreateFeeDto,
  ): Promise<FeeConfiguration> {
    try {
      // Check if similar configuration already exists
      const existingConfig = await this.feeConfigRepository.findOne({
        where: {
          transaction_type: createFeeDto.transaction_type,
          currency: createFeeDto.currency,
          is_active: true,
        },
      });

      // if (existingConfig) {
      //   throw new BadRequestException(
      //     `Active fee configuration already exists for ${createFeeDto.transaction_type} in ${createFeeDto.currency}`,
      //   );
      // }

      const feeConfig = this.feeConfigRepository.create(createFeeDto);
      return await this.feeConfigRepository.save(feeConfig);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to create fee configuration');
    }
  }

  async getAllFeeConfigurations(filters: {
    transactionType?: string;
    currency?: string;
    isActive?: boolean;
  }): Promise<FeeConfiguration[]> {
    const query = this.feeConfigRepository.createQueryBuilder('fee');

    if (filters.transactionType) {
      query.andWhere('fee.transaction_type = :transactionType', {
        transactionType: filters.transactionType,
      });
    }

    if (filters.currency) {
      query.andWhere('fee.currency = :currency', {
        currency: filters.currency,
      });
    }

    if (filters.isActive !== undefined) {
      query.andWhere('fee.is_active = :isActive', {
        isActive: filters.isActive,
      });
    }

    query.orderBy('fee.created_at', 'DESC');

    return await query.getMany();
  }

  async getFeeConfigurationById(id: number): Promise<FeeConfiguration> {
    const feeConfig = await this.feeConfigRepository.findOne({ where: { id } });

    if (!feeConfig) {
      throw new NotFoundException(`Fee configuration with ID ${id} not found`);
    }

    return feeConfig;
  }

  async updateFeeConfiguration(
    id: number,
    updateFeeDto: UpdateFeeDto,
  ): Promise<FeeConfiguration> {
    const feeConfig = await this.getFeeConfigurationById(id);

    Object.assign(feeConfig, updateFeeDto);

    return await this.feeConfigRepository.save(feeConfig);
  }

  async deleteFeeConfiguration(id: number): Promise<{ message: string }> {
    const feeConfig = await this.getFeeConfigurationById(id);

    await this.feeConfigRepository.remove(feeConfig);

    return { message: 'Fee configuration deleted successfully' };
  }

  async getFeeForTransactionType(
    transactionType: string,
    currency: string,
  ): Promise<{ feeAmount: number; feeConfig: FeeConfiguration }> {
    const feeConfig = await this.feeConfigRepository
      .createQueryBuilder('fee')
      .where('fee.transaction_type = :transactionType', { transactionType })
      .andWhere('fee.currency = :currency', { currency })
      .andWhere('fee.is_active = :isActive', { isActive: true })
      .andWhere('fee.effective_from <= :now', { now: new Date() })
      .andWhere('(fee.effective_until IS NULL OR fee.effective_until > :now)', {
        now: new Date(),
      })
      .orderBy('fee.created_at', 'DESC')
      .getOne();

    if (!feeConfig) {
      throw new NotFoundException(
        `No active fee configuration found for ${transactionType} in ${currency}`,
      );
    }

    return {
      feeAmount: Number(feeConfig.fee_value),
      feeConfig,
    };
  }

  async getFeeForTransaction(
    transactionType: string,
    currency: string,
  ): Promise<number> {
    const feeConfig = await this.feeConfigRepository
      .createQueryBuilder('fee')
      .where('fee.transaction_type = :transactionType', { transactionType })
      .andWhere('fee.currency = :currency', { currency })
      .andWhere('fee.is_active = :isActive', { isActive: true })
      // .andWhere('fee.effective_from <= :now', { now: new Date() })
      // .andWhere('(fee.effective_until IS NULL OR fee.effective_until > :now)', { now: new Date() })
      // .orderBy('fee.created_at', 'DESC')
      .getOne();

    if (!feeConfig) {
      throw new Error('No fee configuration found for this transaction');
    }

    const feeValue = Number(feeConfig.fee_value);

    // CRITICAL CHECK - This must block the transaction
    if (feeValue === 0) {
      this.logger.error(
        `🚨 ZERO FEE DETECTED! Blocking transaction for ${transactionType} in ${currency}`,
      );
      await this.notifySupport(transactionType, currency, feeConfig);
      throw new BadRequestException(
        'Fee configuration error. Support has been notified. Please try again later.',
      );
    }

    return feeValue;
  }

  // Support notification method
  private async notifySupport(
    transactionType: string,
    currency: string,
    feeConfig: any,
  ): Promise<void> {
    try {
      // Log the error
      this.logger.error(
        `CRITICAL: Zero fee configuration detected for ${transactionType} in ${currency}. Config ID: ${feeConfig.id}`,
      );

      // Prepare email content
      const supportEmail =
        process.env.BREVO_SENDER_EMAIL || 'support@yourapp.com';
      const subject = 'URGENT: Zero Fee Configuration Detected';

      const textContent = `
URGENT: Zero Fee Configuration Detected

Dear Support Team,

A critical issue has been detected in the fee configuration system.

Details:
- Transaction Type: ${transactionType}
- Currency: ${currency}
- Fee Configuration ID: ${feeConfig.id}
- Fee Value: ${feeConfig.fee_value}
- Timestamp: ${new Date().toISOString()}
- Description: ${feeConfig.description || 'No description provided'}
- Effective From: ${feeConfig.effective_from}
- Effective Until: ${feeConfig.effective_until || 'Indefinite'}

A user attempted to perform a transaction, but the fee configuration returned 0, which indicates a potential configuration error.

IMMEDIATE ACTION REQUIRED:
1. Review the fee configuration with ID: ${feeConfig.id}
2. Update the fee_value to the correct amount
3. Verify no other configurations have zero fees
4. Check if this was intentional (promotional period, etc.)

Please resolve this issue immediately to prevent transaction processing disruptions.

Best regards,
System Alert - Fintech Platform
    `.trim();

      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .details { background-color: #f8f9fa; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0; }
          .actions { background-color: #fff3cd; padding: 15px; border: 1px solid #ffeaa7; border-radius: 5px; }
          .footer { background-color: #6c757d; color: white; padding: 10px; text-align: center; font-size: 12px; }
          .urgent { color: #dc3545; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🚨 URGENT: Zero Fee Configuration Detected</h1>
        </div>
        
        <div class="content">
          <p>Dear Support Team,</p>
          
          <p class="urgent">A critical issue has been detected in the fee configuration system.</p>
          
          <div class="details">
            <h3>📋 Issue Details:</h3>
            <ul>
              <li><strong>Transaction Type:</strong> ${transactionType}</li>
              <li><strong>Currency:</strong> ${currency}</li>
              <li><strong>Fee Configuration ID:</strong> ${feeConfig.id}</li>
              <li><strong>Fee Value:</strong> ${feeConfig.fee_value}</li>
              <li><strong>Timestamp:</strong> ${new Date().toISOString()}</li>
              <li><strong>Description:</strong> ${feeConfig.description || 'No description provided'}</li>
              <li><strong>Effective From:</strong> ${feeConfig.effective_from}</li>
              <li><strong>Effective Until:</strong> ${feeConfig.effective_until || 'Indefinite'}</li>
            </ul>
          </div>
          
          <p>A user attempted to perform a transaction, but the fee configuration returned <span class="urgent">0</span>, which indicates a potential configuration error.</p>
          
          <div class="actions">
            <h3>⚡ IMMEDIATE ACTION REQUIRED:</h3>
            <ol>
              <li>Review the fee configuration with ID: <strong>${feeConfig.id}</strong></li>
              <li>Update the fee_value to the correct amount</li>
              <li>Verify no other configurations have zero fees</li>
              <li>Check if this was intentional (promotional period, etc.)</li>
            </ol>
          </div>
          
          <p class="urgent">Please resolve this issue immediately to prevent transaction processing disruptions.</p>
          
          <p>Best regards,<br>
          System Alert - Fintech Platform</p>
        </div>
        
        <div class="footer">
          This is an automated system alert. Please do not reply to this email.
        </div>
      </body>
      </html>
    `;

      // Send email using your email service
      await this.emailService.sendEmail(
        supportEmail,
        subject,
        textContent,
        htmlContent,
      );

      this.logger.log(
        `Support notification email sent successfully for zero fee config: ${feeConfig.id}`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to notify support about zero fee configuration',
        error,
      );

      // Optional: You might want to store this in a database table for manual review
      // await this.saveFailedNotification(transactionType, currency, feeConfig, error.message);
    }
  }
}
