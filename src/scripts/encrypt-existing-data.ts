// src/scripts/encrypt-existing-data.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { DataSource } from 'typeorm';
import { EncryptionService } from '../common/encryption/encryption.service';
import { User } from 'src/auth/entities/user.entity';

async function encryptExistingData() {
  console.log('🔐 Starting data encryption script...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const encryptionService = app.get(EncryptionService);

  const userRepo = dataSource.getRepository(User);

  // Fetch all users
  const users = await userRepo.find();

  console.log(`📊 Found ${users.length} users to process\n`);

  let encryptedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const user of users) {
    try {
      let needsUpdate = false;

      // Check if email needs hashing
      if (user.interacEmailAddress && !user.emailHash) {
        user.emailHash = encryptionService.hash(user.interacEmailAddress);
        needsUpdate = true;
        console.log(`  → Generating email hash for user ${user.id}`);
      }

      // Check if firstName is already encrypted
      if (user.firstName && !user.firstName.startsWith('PII:')) {
        needsUpdate = true;
        console.log(`  → Will encrypt firstName for user ${user.id}`);
      }

      // Check if lastName is already encrypted
      if (user.lastName && !user.lastName.startsWith('PII:')) {
        needsUpdate = true;
        console.log(`  → Will encrypt lastName for user ${user.id}`);
      }

      // Check if dateOfBirth is already encrypted
      if (user.dateOfBirth && !user.dateOfBirth.toString().startsWith('PII:')) {
        needsUpdate = true;
        console.log(`  → Will encrypt dateOfBirth for user ${user.id}`);
      }

      // Check if interacEmailAddress is already encrypted
      if (
        user.interacEmailAddress &&
        !user.interacEmailAddress.startsWith('PII:')
      ) {
        needsUpdate = true;
        console.log(`  → Will encrypt email for user ${user.id}`);
      }

      // Check if address is already encrypted
      if (user.address && typeof user.address === 'object') {
        needsUpdate = true;
        console.log(`  → Will encrypt address for user ${user.id}`);
      }

      if (needsUpdate) {
        await userRepo.save(user);
        encryptedCount++;
        console.log(`✅ Encrypted data for user ${user.id}\n`);
      } else {
        skippedCount++;
        console.log(`⏭️  User ${user.id} already encrypted, skipped\n`);
      }
    } catch (error) {
      errorCount++;
      console.error(
        `❌ Error encrypting user ${user.id}:`,
        error.message,
        '\n',
      );
    }
  }

  console.log('\n========================================');
  console.log('📈 Encryption Summary:');
  console.log(`   Total users: ${users.length}`);
  console.log(`   ✅ Encrypted: ${encryptedCount}`);
  console.log(`   ⏭️  Skipped: ${skippedCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log('========================================\n');

  await app.close();
}

encryptExistingData()
  .then(() => {
    console.log('✅ Encryption script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Encryption script failed:', error);
    process.exit(1);
  });
