// import { Injectable, Logger } from '@nestjs/common';
// import { Cron } from '@nestjs/schedule';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository, IsNull, Not } from 'typeorm';
// import { NGNWalletEntity } from '../entities/NGNwallet.entity';
// import { CADWalletEntity } from '../entities/CADwallet.entity';
// import { AptPayService } from './aptPay.service';
// import { DotBankService } from './dot.bank.service';
// import { User } from 'src/auth/entities/user.entity';

// @Injectable()
// export class ThirdPartyRetryService {
//   private readonly logger = new Logger(ThirdPartyRetryService.name);
//   private readonly MAX_RETRY_ATTEMPTS = 5;
//   private readonly BATCH_SIZE = 50;
//   private readonly DELAY_BETWEEN_CALLS = 1000; // 1 second

//   constructor(
//     @InjectRepository(NGNWalletEntity)
//     private ngnWalletRepo: Repository<NGNWalletEntity>,
//     @InjectRepository(CADWalletEntity)
//     private cadWalletRepo: Repository<CADWalletEntity>,
//     private dotBankService: DotBankService,
//     private aptPaymentService: AptPayService,
//     @InjectRepository(User)
//     private userRepository: Repository<User>,
//   ) {}

//   // Run once daily at 3 AM
//   @Cron('0 3 * * *')
//   async retryFailedThirdPartyServices() {
//     this.logger.log('🔄 Starting daily third-party service retry job');

//     const startTime = Date.now();
//     const results = {
//       dotBankRetries: { attempted: 0, successful: 0, failed: 0 },
//       aptPayRetries: { attempted: 0, successful: 0, failed: 0 },
//       errors: [],
//     };

//     try {
//       // Process DotBank failures
//       await this.retryDotBankFailures(results);

//       // Process AptPay failures
//       await this.retryAptPayFailures(results);

//       // Log final results
//       const duration = Date.now() - startTime;
//       this.logger.log(`✅ Retry job completed in ${duration}ms`, {
//         results,
//         duration,
//       });

//       // Send alert if too many failures
//       if (results.errors.length > 10) {
//         await this.sendOpsAlert(
//           'High failure rate in third-party retry job',
//           results,
//         );
//       }
//     } catch (error) {
//       this.logger.error('❌ Critical error in retry job', error.stack);
//       await this.sendOpsAlert('Third-party retry job failed', {
//         error: error.message,
//       });
//     }
//   }

//   private async retryDotBankFailures(results: any) {
//     this.logger.log('🏦 Processing DotBank failures...');

//     // Find NGN wallets without account numbers
//     const walletsWithoutAccounts = await this.ngnWalletRepo.find({
//       where: [{ accountNumber: IsNull() }, { accountNumber: '' }],
//       take: this.BATCH_SIZE,
//     });

//     this.logger.log(
//       `Found ${walletsWithoutAccounts.length} wallets without DotBank accounts`,
//     );

//     for (const wallet of walletsWithoutAccounts) {
//       try {
//         // Check retry attempts
//         const retryCount =
//           wallet.metadata?.thirdPartyServices?.dotBank?.retryCount || 0;

//         if (retryCount >= this.MAX_RETRY_ATTEMPTS) {
//           this.logger.warn(
//             `Max retries reached for user ${wallet.userId}, skipping`,
//           );
//           continue;
//         }

//         results.dotBankRetries.attempted++;

//         // Get user data
//         const user = await this.userRepository.findOne({
//           where: { id: wallet.userId },
//         });

//         if (!user) {
//           this.logger.error(`User ${wallet.userId} not found`);
//           results.errors.push(`User ${wallet.userId} not found`);
//           continue;
//         }

//         this.logger.log(
//           `Retrying DotBank for user ${wallet.userId} (attempt ${retryCount + 1})`,
//         );

//         // Retry DotBank virtual account creation
//         const virtualAccountData = {
//           firstname: user.firstName,
//           lastname: user.lastName,
//           dateOfBirth: user.dateOfBirth || '1990-01-01',
//           gender: user.gender,
//           externalId: wallet.userId.toString(),
//         };

//         const virtualAccountResult =
//           await this.dotBankService.createVirtualAccount(
//             virtualAccountData,
//             wallet.userId,
//           );

//         if (virtualAccountResult?.virtualAccount?.accountNo) {
//           // Success! Update wallet
//           await this.ngnWalletRepo.update(wallet.id, {
//             accountNumber: virtualAccountResult.virtualAccount.accountNo,
//             metadata: {
//               ...wallet.metadata,
//               thirdPartyServices: {
//                 ...wallet.metadata?.thirdPartyServices,
//                 dotBank: {
//                   status: 'SUCCESS',
//                   accountNumber: virtualAccountResult.virtualAccount.accountNo,
//                   retriedAt: new Date().toISOString(),
//                   retryCount: retryCount + 1,
//                 },
//               },
//             },
//           });

//           results.dotBankRetries.successful++;
//           this.logger.log(
//             `✅ DotBank account created for user ${wallet.userId}: ${virtualAccountResult.virtualAccount.accountNo}`,
//           );
//         } else {
//           throw new Error('No account number in response');
//         }

//         // Delay between API calls
//         await this.delay(this.DELAY_BETWEEN_CALLS);
//       } catch (error) {
//         results.dotBankRetries.failed++;
//         this.logger.error(
//           `Failed to create DotBank account for user ${wallet.userId}`,
//           error.message,
//         );

//         // Update retry metadata
//         await this.updateFailureMetadata(wallet, 'dotBank', error.message);
//         results.errors.push(`DotBank user ${wallet.userId}: ${error.message}`);
//       }
//     }
//   }

//   private async retryAptPayFailures(results: any) {
//     this.logger.log('💳 Processing AptPay failures...');

//     // Find wallets where AptPay failed
//     const walletsWithAptPayFailure = await this.ngnWalletRepo
//       .createQueryBuilder('wallet')
//       .where(
//         `wallet.metadata->>'thirdPartyServices'->>'aptPay'->>'status' = :status`,
//         {
//           status: 'FAILED',
//         },
//       )
//       .take(this.BATCH_SIZE)
//       .getMany();

//     // Also check CAD wallets
//     const cadWalletsWithAptPayFailure = await this.cadWalletRepo
//       .createQueryBuilder('wallet')
//       .where(
//         `wallet.metadata->>'thirdPartyServices'->>'aptPay'->>'status' = :status`,
//         {
//           status: 'FAILED',
//         },
//       )
//       .take(this.BATCH_SIZE)
//       .getMany();

//     // Get unique user IDs
//     const userIds = new Set([
//       ...walletsWithAptPayFailure.map((w) => w.userId),
//       ...cadWalletsWithAptPayFailure.map((w) => w.userId),
//     ]);

//     this.logger.log(`Found ${userIds.size} users with AptPay failures`);

//     for (const userId of userIds) {
//       try {
//         // Get the wallets for this user
//         const ngnWallet = walletsWithAptPayFailure.find(
//           (w) => w.userId === userId,
//         );
//         const cadWallet = cadWalletsWithAptPayFailure.find(
//           (w) => w.userId === userId,
//         );

//         // Check retry attempts
//         const retryCount =
//           ngnWallet?.metadata?.thirdPartyServices?.aptPay?.retryCount ||
//           cadWallet?.metadata?.thirdPartyServices?.aptPay?.retryCount ||
//           0;

//         if (retryCount >= this.MAX_RETRY_ATTEMPTS) {
//           this.logger.warn(
//             `Max AptPay retries reached for user ${userId}, skipping`,
//           );
//           continue;
//         }

//         results.aptPayRetries.attempted++;

//         this.logger.log(
//           `Retrying AptPay for user ${userId} (attempt ${retryCount + 1})`,
//         );

//         // Retry AptPay identity creation
//         await this.aptPaymentService.createAptPayIdentity(userId);

//         // Update both wallets if successful
//         const updateData = {
//           metadata: {
//             thirdPartyServices: {
//               aptPay: {
//                 status: 'SUCCESS',
//                 retriedAt: new Date().toISOString(),
//                 retryCount: retryCount + 1,
//               },
//             },
//           },
//         };

//         if (ngnWallet) {
//           await this.ngnWalletRepo.update(ngnWallet.id, {
//             metadata: {
//               ...ngnWallet.metadata,
//               thirdPartyServices: {
//                 ...ngnWallet.metadata?.thirdPartyServices,
//                 aptPay: updateData.metadata.thirdPartyServices.aptPay,
//               },
//             },
//           });
//         }

//         if (cadWallet) {
//           await this.cadWalletRepo.update(cadWallet.id, {
//             metadata: {
//               ...cadWallet.metadata,
//               thirdPartyServices: {
//                 ...cadWallet.metadata?.thirdPartyServices,
//                 aptPay: updateData.metadata.thirdPartyServices.aptPay,
//               },
//             },
//           });
//         }

//         results.aptPayRetries.successful++;
//         this.logger.log(`✅ AptPay identity created for user ${userId}`);

//         // Delay between API calls
//         await this.delay(this.DELAY_BETWEEN_CALLS);
//       } catch (error) {
//         results.aptPayRetries.failed++;
//         this.logger.error(
//           `Failed to create AptPay identity for user ${userId}`,
//           error.message,
//         );

//         // Update failure metadata for both wallets
//         if (ngnWallet) {
//           await this.updateFailureMetadata(ngnWallet, 'aptPay', error.message);
//         }
//         if (cadWallet) {
//           await this.updateFailureMetadata(cadWallet, 'aptPay', error.message);
//         }

//         results.errors.push(`AptPay user ${userId}: ${error.message}`);
//       }
//     }
//   }

//   private async updateFailureMetadata(
//     wallet: NGNWalletEntity | CADWalletEntity,
//     service: 'dotBank' | 'aptPay',
//     errorMessage: string,
//   ) {
//     const currentMetadata = wallet.metadata || {};
//     const currentServices = currentMetadata.thirdPartyServices || {};
//     const currentServiceData = currentServices[service] || {};

//     const updatedMetadata = {
//       ...currentMetadata,
//       thirdPartyServices: {
//         ...currentServices,
//         [service]: {
//           ...currentServiceData,
//           status: 'FAILED',
//           lastRetryAt: new Date().toISOString(),
//           retryCount: (currentServiceData.retryCount || 0) + 1,
//           lastError: errorMessage,
//         },
//       },
//     };

//     if (wallet instanceof NGNWalletEntity) {
//       await this.ngnWalletRepo.update(wallet.id, { metadata: updatedMetadata });
//     } else {
//       await this.cadWalletRepo.update(wallet.id, { metadata: updatedMetadata });
//     }
//   }

//   private delay(ms: number): Promise<void> {
//     return new Promise((resolve) => setTimeout(resolve, ms));
//   }

//   private async sendOpsAlert(subject: string, data: any) {
//     // Implement your alerting mechanism here
//     // Could be email, Slack, PagerDuty, etc.
//     this.logger.error(`OPS ALERT: ${subject}`, data);
//   }

//   // Manual trigger endpoint for testing
//   async manualRetryForUser(userId: number) {
//     this.logger.log(`Manual retry triggered for user ${userId}`);

//     const ngnWallet = await this.ngnWalletRepo.findOne({ where: { userId } });
//     const cadWallet = await this.cadWalletRepo.findOne({ where: { userId } });

//     if (!ngnWallet && !cadWallet) {
//       throw new Error('No wallets found for user');
//     }

//     const results = {
//       dotBank: null,
//       aptPay: null,
//     };

//     // Retry DotBank if needed
//     if (ngnWallet && !ngnWallet.accountNumber) {
//       try {
//         const user = await this.userRepository.findOne({
//           where: { id: userId },
//         });
//         const virtualAccountResult =
//           await this.dotBankService.createVirtualAccount(
//             {
//               firstname: user.firstName,
//               lastname: user.lastName,
//               dateOfBirth: user.dateOfBirth || '1990-01-01',
//               gender: user.gender,
//               externalId: userId.toString(),
//             },
//             userId,
//           );

//         if (virtualAccountResult?.virtualAccount?.accountNo) {
//           await this.ngnWalletRepo.update(ngnWallet.id, {
//             accountNumber: virtualAccountResult.virtualAccount.accountNo,
//           });
//           results.dotBank = 'SUCCESS';
//         }
//       } catch (error) {
//         results.dotBank = `FAILED: ${error.message}`;
//       }
//     }

//     // Retry AptPay if needed
//     const needsAptPay =
//       ngnWallet?.metadata?.thirdPartyServices?.aptPay?.status === 'FAILED' ||
//       cadWallet?.metadata?.thirdPartyServices?.aptPay?.status === 'FAILED';

//     if (needsAptPay) {
//       try {
//         await this.aptPaymentService.createAptPayIdentity(userId);
//         results.aptPay = 'SUCCESS';
//       } catch (error) {
//         results.aptPay = `FAILED: ${error.message}`;
//       }
//     }

//     return results;
//   }
// }
