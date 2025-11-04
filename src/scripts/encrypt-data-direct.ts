// src/scripts/encrypt-data-direct.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import {
  EncryptionService,
  EncryptionKeyType,
} from '../common/encryption/encryption.service';

async function encryptDataDirect() {
  console.log('🔐 Starting direct SQL encryption...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const encryptionService = app.get(EncryptionService);

  // Get all users with plain text data (using camelCase column names)
  const users = await dataSource.query(`
    SELECT id, "firstName", "lastName", "dateOfBirth", "interacEmailAddress", address
    FROM users
    WHERE "firstName" NOT LIKE 'PII:%'
       OR "lastName" NOT LIKE 'PII:%'
       OR "interacEmailAddress" NOT LIKE 'PII:%'
  `);

  console.log(`Found ${users.length} users to encrypt\n`);

  for (const user of users) {
    try {
      // Encrypt each field
      const encryptedFirstName = user.firstName
        ? encryptionService.encrypt(user.firstName, EncryptionKeyType.PII)
        : null;

      const encryptedLastName = user.lastName
        ? encryptionService.encrypt(user.lastName, EncryptionKeyType.PII)
        : null;

      const encryptedEmail = user.interacEmailAddress
        ? encryptionService.encrypt(
            user.interacEmailAddress,
            EncryptionKeyType.PII,
          )
        : null;

      const encryptedDob = user.dateOfBirth
        ? encryptionService.encrypt(user.dateOfBirth, EncryptionKeyType.PII)
        : null;

      const encryptedAddress = user.address
        ? encryptionService.encrypt(
            JSON.stringify(user.address),
            EncryptionKeyType.PII,
          )
        : null;

      // Generate email hash
      const emailHash = user.interacEmailAddress
        ? encryptionService.hash(user.interacEmailAddress)
        : null;

      // Update database directly with encrypted values (using camelCase)
      await dataSource.query(
        `
        UPDATE users 
        SET 
          "firstName" = $1,
          "lastName" = $2,
          "dateOfBirth" = $3,
          "interacEmailAddress" = $4,
          address = $5,
          "emailHash" = $6
        WHERE id = $7
      `,
        [
          encryptedFirstName,
          encryptedLastName,
          encryptedDob,
          encryptedEmail,
          encryptedAddress,
          emailHash,
          user.id,
        ],
      );

      console.log(`✅ Encrypted user ${user.id}`);
    } catch (error) {
      console.error(`❌ Error encrypting user ${user.id}:`, error.message);
    }
  }

  console.log('\n✅ Encryption complete!');
  await app.close();
}

encryptDataDirect()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
