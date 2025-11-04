// src/scripts/add-reference-hashes.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import { EncryptionService } from '../common/encryption/encryption.service';

async function addReferenceHashes() {
  console.log('🔐 Adding reference hashes to transactions...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const encryptionService = app.get(EncryptionService);

  try {
    // Get all transactions with references but no hash
    const transactions = await dataSource.query(`
      SELECT id, reference
      FROM transactions
      WHERE reference IS NOT NULL 
        AND "referenceHash" IS NULL
        AND reference LIKE 'FINANCIAL:%'
    `);

    console.log(`Found ${transactions.length} transactions to process\n`);

    for (const txn of transactions) {
      try {
        // Decrypt the reference
        const decryptedReference = encryptionService.decrypt(txn.reference);

        // Generate hash
        const referenceHash = encryptionService.hash(decryptedReference);

        // Update transaction
        await dataSource.query(
          `
          UPDATE transactions 
          SET "referenceHash" = $1
          WHERE id = $2
        `,
          [referenceHash, txn.id],
        );

        if (txn.id % 100 === 0) {
          console.log(`✅ Processed ${txn.id} transactions...`);
        }
      } catch (error) {
        console.error(
          `❌ Error processing transaction ${txn.id}:`,
          error.message,
        );
      }
    }

    console.log('\n✅ Reference hashes added successfully!');
  } catch (error) {
    console.error('❌ Fatal error:', error);
    throw error;
  } finally {
    await app.close();
  }
}

addReferenceHashes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
