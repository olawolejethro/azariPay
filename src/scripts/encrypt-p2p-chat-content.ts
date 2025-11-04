// src/scripts/encrypt-p2p-chat-content.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import {
  EncryptionService,
  EncryptionKeyType,
} from '../common/encryption/encryption.service';

async function encryptP2PChatContent() {
  console.log('🔐 Starting P2P chat content encryption...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const encryptionService = app.get(EncryptionService);

  let totalEncrypted = 0;
  let errors = 0;

  try {
    // ✅ Get all messages where content is not encrypted
    const messages = await dataSource.query(`
      SELECT id, content
      FROM p2p_chat_messages
      WHERE content IS NOT NULL 
        AND content NOT LIKE 'SENSITIVE:%'
    `);

    console.log(`Found ${messages.length} messages to encrypt\n`);

    for (const message of messages) {
      try {
        // ✅ Encrypt content only
        const encryptedContent = encryptionService.encrypt(
          message.content,
          EncryptionKeyType.SENSITIVE,
        );

        await dataSource.query(
          `
          UPDATE p2p_chat_messages 
          SET content = $1
          WHERE id = $2
        `,
          [encryptedContent, message.id],
        );

        totalEncrypted++;
        if (totalEncrypted % 100 === 0) {
          console.log(`   ✅ Encrypted ${totalEncrypted} messages...`);
        }
      } catch (error) {
        errors++;
        console.error(
          `   ❌ Error encrypting message ${message.id}:`,
          error.message,
        );
      }
    }

    console.log('\n========================================');
    console.log('📈 Encryption Summary:');
    console.log(`   ✅ Total messages encrypted: ${totalEncrypted}`);
    console.log(`   ❌ Errors encountered: ${errors}`);
    console.log('========================================\n');

    if (errors === 0) {
      console.log('✅ P2P chat content encryption completed successfully!');
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

encryptP2PChatContent()
  .then(() => {
    console.log('\n👋 Script finished. Exiting...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
