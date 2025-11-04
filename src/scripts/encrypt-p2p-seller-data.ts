// src/scripts/encrypt-p2p-seller-data.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import {
  EncryptionService,
  EncryptionKeyType,
} from '../common/encryption/encryption.service';

async function encryptP2PSellerData() {
  console.log('🔐 Starting P2P Seller data encryption...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const encryptionService = app.get(EncryptionService);

  let totalEncrypted = 0;
  let errors = 0;

  try {
    console.log('📊 Encrypting P2P Seller payment information...');

    const sellers = await dataSource.query(`
      SELECT id, "bankName", "accountNumber", "accountName", "interacEmail"
      FROM p2p_seller
      WHERE ("bankName" IS NOT NULL AND "bankName" NOT LIKE 'PII:%')
         OR ("accountNumber" IS NOT NULL AND "accountNumber" NOT LIKE 'FINANCIAL:%')
         OR ("accountName" IS NOT NULL AND "accountName" NOT LIKE 'PII:%')
         OR ("interacEmail" IS NOT NULL AND "interacEmail" NOT LIKE 'PII:%')
    `);

    console.log(`   Found ${sellers.length} P2P sellers to encrypt\n`);

    for (const seller of sellers) {
      try {
        const encryptedBankName = seller.bankName
          ? encryptionService.encrypt(seller.bankName, EncryptionKeyType.PII)
          : null;

        const encryptedAccountNumber = seller.accountNumber
          ? encryptionService.encrypt(
              seller.accountNumber,
              EncryptionKeyType.FINANCIAL,
            )
          : null;

        const encryptedAccountName = seller.accountName
          ? encryptionService.encrypt(seller.accountName, EncryptionKeyType.PII)
          : null;

        const encryptedInteracEmail = seller.interacEmail
          ? encryptionService.encrypt(
              seller.interacEmail,
              EncryptionKeyType.PII,
            )
          : null;

        await dataSource.query(
          `
          UPDATE p2p_seller 
          SET 
            "bankName" = $1,
            "accountNumber" = $2,
            "accountName" = $3,
            "interacEmail" = $4
          WHERE id = $5
        `,
          [
            encryptedBankName,
            encryptedAccountNumber,
            encryptedAccountName,
            encryptedInteracEmail,
            seller.id,
          ],
        );

        totalEncrypted++;
        console.log(`   ✅ Encrypted P2P seller ${seller.id}`);
      } catch (error) {
        errors++;
        console.error(
          `   ❌ Error encrypting P2P seller ${seller.id}:`,
          error.message,
        );
      }
    }

    console.log('\n========================================');
    console.log('📈 Encryption Summary:');
    console.log(`   ✅ Total records encrypted: ${totalEncrypted}`);
    console.log(`   ❌ Errors encountered: ${errors}`);
    console.log('========================================\n');

    if (errors === 0) {
      console.log('✅ P2P Seller data encryption completed successfully!');
    } else {
      console.log(
        '⚠️ Encryption completed with some errors. Please review above.',
      );
    }
  } catch (error) {
    console.error('\n❌ Fatal error during encryption:', error);
    throw error;
  } finally {
    await app.close();
  }
}

encryptP2PSellerData()
  .then(() => {
    console.log('\n👋 Script finished. Exiting...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
