import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SubmitReportDto } from '../dtos/reportTransaction.dto';
import { In, Not, Repository } from 'typeorm';
import { UploadFileDto } from 'src/filestore/dto/upload-file.dto';
import { User } from 'src/auth/entities/user.entity';
import { TransactionReport } from '../entities/reportTransaction.entity';
import { TransactionEntity } from '../entities/transaction.entity';
import { EmailService } from 'src/common/notifications/email.service';
import { NotificationService } from 'src/notifications/notifications.service';
import { FileStoreService } from 'src/filestore/services/filestore.service';

// Service - Updated to use FileStoreService
@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(TransactionReport)
    private reportRepository: Repository<TransactionReport>,
    @InjectRepository(TransactionEntity)
    private transactionRepository: Repository<TransactionEntity>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private notificationService: NotificationService,
    private emailService: EmailService,
    private fileStoreService: FileStoreService, // Inject your existing service
  ) {}

  async submitReport(
    userId: number,
    submitReportDto: SubmitReportDto,
    uploadReceipt?: Express.Multer.File,
  ) {
    try {
      // Validate that the transaction exists and belongs to the user
      const transaction = await this.transactionRepository.findOne({
        where: {
          //   id: submitReportDto.transactionId,
          userId: userId,
        },
      });

      if (!transaction) {
        throw new BadRequestException(
          'Transaction not found or does not belong to you',
        );
      }

      // Check if report already exists for this transaction
      //   const existingReport = await this.reportRepository.findOne({
      //     where: {
      //       transactionId: submitReportDto.transactionId,
      //       userId: userId,
      //       status: Not(In(['RESOLVED', 'CLOSED', 'CANCELLED'])),
      //     },
      //   });

      //   if (existingReport) {
      //     throw new BadRequestException(
      //       'A report for this transaction is already pending',
      //     );
      //   }

      // Get user details
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      // Generate report reference number
      const reportRef = this.generateReportReference();

      // Handle receipt upload using your existing FileStoreService
      let uploadReceiptUrl = null;
      if (uploadReceipt) {
        try {
          // Create UploadFileDto compatible with your existing service
          const uploadFileDto: UploadFileDto = {
            file: uploadReceipt,
            fileMetadata: JSON.stringify({
              reportReference: reportRef,
              transactionId: submitReportDto.transactionId,
              transactionType: submitReportDto.transactionType,
              uploadType: 'transaction_report_receipt',
              uploadedAt: new Date().toISOString(),
              originalFileName: uploadReceipt.originalname,
              fileSize: uploadReceipt.size,
              mimeType: uploadReceipt.mimetype,
            }),
          };

          // Use your existing FileStoreService to upload to Wasabi
          const uploadedFile = await this.fileStoreService.uploadFile(
            uploadFileDto,
            userId,
          );
          uploadReceiptUrl = uploadedFile.fileUrl; // Use the Wasabi S3 URL

          console.log(`Receipt uploaded to Wasabi: ${uploadReceiptUrl}`);
        } catch (uploadError) {
          console.error('Failed to upload receipt to Wasabi:', uploadError);
          throw new BadRequestException(
            'Failed to upload receipt. Please try again.',
          );
        }
      } else if (submitReportDto.uploadReceipt) {
        // If URL is provided directly (existing file)
        uploadReceiptUrl = submitReportDto.uploadReceipt;
      }

      // Create the report - only using fields from UI
      const report = this.reportRepository.create({
        userId,
        transactionType: submitReportDto.transactionType, // Exactly as entered (e.g., "P2P Trade")
        transactionId: submitReportDto.transactionId, // Exactly as entered (e.g., "1234678nv78l78")
        uploadReceipt: uploadReceiptUrl, // Wasabi S3 URL
        moreInformation: submitReportDto.moreInformation, // Matches UI field name
        status: 'PENDING',
      });

      const savedReport = await this.reportRepository.save(report);

      // Send confirmation notification to user
      await this.sendReportConfirmation(user, savedReport, transaction);

      // Notify admin team
      //   await this.notifyAdminTeam(savedReport, user, transaction);

      // Send email confirmation
      await this.sendEmailConfirmation(user, savedReport);

      return {
        success: true,
        reportId: savedReport.id,
        reportReference: reportRef,
        status: 'PENDING',
        message:
          'Report submitted successfully. You will receive updates via notification.',
        transactionType: savedReport.transactionType,
        transactionId: savedReport.transactionId,
        receiptUrl: uploadReceiptUrl, // Include the Wasabi URL in response
        submittedAt: savedReport.createdAt,
        nextSteps: [
          'Our team will review your report within 24 hours',
          'You may be contacted for additional information',
          'Check your notifications for updates',
        ],
        supportContact: {
          email: 'support@bongopay.com',
          phone: '+1-800-BONGO-PAY',
          liveChat: 'Available 24/7 in app',
        },
      };
    } catch (error) {
      console.error('Error submitting report:', error);
      throw new HttpException(
        error.message || 'Failed to submit report',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getUserReports(userId: number, query: any) {
    const { page = 1, limit = 10, status } = query;

    const whereClause: any = { userId };

    if (status) {
      whereClause.status = status;
    }

    const [reports, total] = await this.reportRepository.findAndCount({
      where: whereClause,
      relations: ['transaction'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      reports: reports.map((report) => ({
        id: report.id,
        transactionType: report.transactionType, // As entered in UI (e.g., "P2P Trade")
        transactionId: report.transactionId, // As entered in UI (e.g., "1234678nv78l78")
        uploadReceipt: report.uploadReceipt, // File path if uploaded
        moreInformation: report.moreInformation, // Additional info provided
        status: report.status,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        transaction: {
          amount: report.transaction?.amount,
          currency: report.transaction?.currency,
          description: report.transaction?.description,
          createdAt: report.transaction?.createdAt,
        },
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
      },
    };
  }

  async getReportById(userId: number, reportId: number) {
    const report = await this.reportRepository.findOne({
      where: { id: reportId, userId },
      relations: ['transaction', 'user'],
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    return {
      id: report.id,
      transactionType: report.transactionType, // As entered in UI (e.g., "P2P Trade")
      transactionId: report.transactionId, // As entered in UI (e.g., "1234678nv78l78")
      uploadReceipt: report.uploadReceipt, // File path/URL
      moreInformation: report.moreInformation, // Additional details
      status: report.status,
      adminNotes: report.adminNotes,
      resolution: report.resolution,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      resolvedAt: report.resolvedAt,
      transaction: {
        amount: report.transaction?.amount,
        currency: report.transaction?.currency,
        description: report.transaction?.description,
        type: report.transaction?.type,
        createdAt: report.transaction?.createdAt,
      },
    };
  }

  async cancelReport(userId: number, reportId: number) {
    const report = await this.reportRepository.findOne({
      where: { id: reportId, userId, status: 'PENDING' },
    });

    if (!report) {
      throw new NotFoundException('Report not found or cannot be cancelled');
    }

    report.status = 'CANCELLED';
    report.updatedAt = new Date();

    await this.reportRepository.save(report);

    return {
      success: true,
      message: 'Report cancelled successfully',
    };
  }

  private generateReportReference(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `RPT-${timestamp.slice(-6)}${random}`;
  }

  private async sendReportConfirmation(
    user: User,
    report: TransactionReport,
    transaction: TransactionEntity,
  ) {
    // Implementation for sending push notification
    const notification = {
      userId: user.id,
      title: 'Report Submitted',
      body: `Your report for transaction ${transaction.id} has been submitted and is being reviewed.`,
      data: {
        type: 'REPORT_CONFIRMATION',
        reportId: report.id,
        transactionId: transaction.id,
      },
    };

    // await this.notificationService.createNotification(notification);
  }

  private async notifyAdminTeam(
    report: TransactionReport,
    user: User,
    transaction: TransactionEntity,
  ) {
    // Implementation for notifying admin team
    console.log(
      `New report submitted by ${user.firstName} ${user.lastName} for transaction ${transaction.id}`,
    );
  }

  private async sendEmailConfirmation(user: User, report: TransactionReport) {
    // Send email using your existing interface
    const emailSubject = 'Report Confirmation - BongoPay';
    const emailText = `Dear ${user.firstName || 'Valued Customer'},

Your transaction report has been successfully submitted and is now being reviewed by our team.

Report Details:
- Report ID: ${report.id}
- Transaction Type: ${report.transactionType}
- Transaction ID: ${report.transactionId}
- Status: ${report.status}
- Submitted: ${report.createdAt}

Our team will review your report within 24 hours and you will receive updates via notifications.

If you have any questions, please contact our support team:
- Email: support@bongopay.com
- Phone: +1-800-BONGO-PAY

Thank you for using BongoPay.

Best regards,
BongoPay Support Team`;

    const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #FF9F40, #F97316); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">BongoPay</h1>
        <p style="color: white; margin: 10px 0 0 0;">Report Confirmation</p>
      </div>
      
      <div style="padding: 30px; background: #f8f9fa;">
        <h2 style="color: #333; margin-bottom: 20px;">Report Successfully Submitted</h2>
        
        <p>Dear ${user.firstName || 'Valued Customer'},</p>
        
        <p>Your transaction report has been successfully submitted and is now being reviewed by our team.</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #FF9F40; margin-top: 0;">Report Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
         
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Transaction Type:</strong></td>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${report.transactionType}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Transaction ID:</strong></td>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${report.transactionId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Status:</strong></td>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${report.status}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Submitted:</strong></td>
              <td style="padding: 8px 0;">${report.createdAt}</td>
            </tr>
          </table>
        </div>
        
        <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="color: #1976d2; margin-top: 0;">Next Steps</h4>
          <ul style="color: #333; margin: 0; padding-left: 20px;">
            <li>Our team will review your report within 24 hours</li>
            <li>You may be contacted for additional information</li>
            <li>Check your notifications for updates</li>
          </ul>
        </div>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h4 style="color: #FF9F40; margin-top: 0;">Support Contact</h4>
          <p style="margin: 5px 0;"><strong>Email:</strong> support@bongopay.com</p>
          <p style="margin: 5px 0;"><strong>Phone:</strong> +1-800-BONGO-PAY</p>
          <p style="margin: 5px 0;"><strong>Live Chat:</strong> Available 24/7 in app</p>
        </div>
        
        <p>Thank you for using BongoPay.</p>
        
        <p style="margin-top: 30px;">
          Best regards,<br>
          <strong>BongoPay Support Team</strong>
        </p>
      </div>
      
      <div style="background: #333; padding: 20px; text-align: center;">
        <p style="color: #ccc; margin: 0; font-size: 12px;">
          This email was sent regarding your BongoPay account. Please do not reply to this email.
        </p>
      </div>
    </div>`;

    try {
      await this.emailService.sendEmail(
        user.interacEmailAddress, // Use available email
        emailSubject,
        emailText,
        emailHtml,
      );

      console.log(
        `Report confirmation email sent to ${user.interacEmailAddress}`,
      );
    } catch (emailError) {
      console.error('Failed to send report confirmation email:', emailError);
      // Don't throw error - email failure shouldn't fail the report submission
    }
  }

  private getEstimatedResolutionTime(): string {
    // Since UI doesn't specify report type/priority, use general timeframe
    return '2-3 business days';
  }
}
