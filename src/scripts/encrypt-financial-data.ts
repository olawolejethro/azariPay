// src/scripts/encrypt-financial-data.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import {
  EncryptionService,
  EncryptionKeyType,
} from '../common/encryption/encryption.service';

async function encryptFinancialData() {
  console.log('🔐 Starting financial data encryption...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const encryptionService = app.get(EncryptionService);

  let totalEncrypted = 0;
  let errors = 0;

  // ============================================
  // 1. ENCRYPT NGN WALLET DATA
  // ============================================
  console.log('📊 Step 1/4: Encrypting NGN wallet data...');

  const ngnWallets = await dataSource.query(`
    SELECT id, "accountReference", "accountNumber", bvn
    FROM ngn_wallets
    WHERE ("accountReference" IS NOT NULL AND "accountReference" NOT LIKE 'FINANCIAL:%')
       OR ("accountNumber" IS NOT NULL AND "accountNumber" NOT LIKE 'FINANCIAL:%')
       OR (bvn IS NOT NULL AND bvn NOT LIKE 'FINANCIAL:%')
  `);

  console.log(`   Found ${ngnWallets.length} NGN wallets to encrypt\n`);

  for (const wallet of ngnWallets) {
    try {
      const encryptedAccountReference = wallet.accountReference
        ? encryptionService.encrypt(
            wallet.accountReference,
            EncryptionKeyType.FINANCIAL,
          )
        : null;
      const accountReferenceHash = wallet.accountReference
        ? encryptionService.hash(wallet.accountReference)
        : null;

      const encryptedAccountNumber = wallet.accountNumber
        ? encryptionService.encrypt(
            wallet.accountNumber,
            EncryptionKeyType.FINANCIAL,
          )
        : null;
      const accountNumberHash = wallet.accountNumber
        ? encryptionService.hash(wallet.accountNumber)
        : null;

      const encryptedBvn = wallet.bvn
        ? encryptionService.encrypt(wallet.bvn, EncryptionKeyType.FINANCIAL)
        : null;
      const bvnHash = wallet.bvn ? encryptionService.hash(wallet.bvn) : null;

      await dataSource.query(
        `
        UPDATE ngn_wallets 
        SET 
          "accountReference" = $1,
          "accountReferenceHash" = $2,
          "accountNumber" = $3,
          "accountNumberHash" = $4,
          bvn = $5,
          "bvnHash" = $6
        WHERE id = $7
      `,
        [
          encryptedAccountReference,
          accountReferenceHash,
          encryptedAccountNumber,
          accountNumberHash,
          encryptedBvn,
          bvnHash,
          wallet.id,
        ],
      );

      totalEncrypted++;
      console.log(`   ✅ Encrypted NGN wallet ${wallet.id}`);
    } catch (error) {
      errors++;
      console.error(
        `   ❌ Error encrypting NGN wallet ${wallet.id}:`,
        error.message,
      );
    }
  }

  // ============================================
  // 2. ENCRYPT CAD WALLET DATA
  // ============================================
  console.log('\n📊 Step 2/4: Encrypting CAD wallet Interac emails...');

  const cadWallets = await dataSource.query(`
    SELECT id, interac_email
    FROM cad_wallet
    WHERE interac_email IS NOT NULL 
      AND interac_email NOT LIKE 'PII:%'
  `);

  console.log(`   Found ${cadWallets.length} CAD wallets to encrypt\n`);

  for (const wallet of cadWallets) {
    try {
      const encryptedInteracEmail = wallet.interac_email
        ? encryptionService.encrypt(wallet.interac_email, EncryptionKeyType.PII)
        : null;

      const interacEmailHash = wallet.interac_email
        ? encryptionService.hash(wallet.interac_email)
        : null;

      await dataSource.query(
        `
        UPDATE cad_wallet 
        SET 
          interac_email = $1,
          "interacEmailHash" = $2
        WHERE id = $3
      `,
        [encryptedInteracEmail, interacEmailHash, wallet.id],
      );

      totalEncrypted++;
      console.log(`   ✅ Encrypted CAD wallet ${wallet.id}`);
    } catch (error) {
      errors++;
      console.error(
        `   ❌ Error encrypting CAD wallet ${wallet.id}:`,
        error.message,
      );
    }
  }

  // ============================================
  // 3. ENCRYPT BENEFICIARY DATA
  // ============================================
  console.log('\n📊 Step 3/4: Encrypting beneficiary data...');

  const beneficiaries = await dataSource.query(`
    SELECT id, "accountNumber", "accountName"
    FROM beneficiaries
    WHERE ("accountNumber" IS NOT NULL AND "accountNumber" NOT LIKE 'FINANCIAL:%')
       OR ("accountName" IS NOT NULL AND "accountName" NOT LIKE 'PII:%')
  `);

  console.log(`   Found ${beneficiaries.length} beneficiaries to encrypt\n`);

  for (const beneficiary of beneficiaries) {
    try {
      const encryptedAccountNumber = beneficiary.accountNumber
        ? encryptionService.encrypt(
            beneficiary.accountNumber,
            EncryptionKeyType.FINANCIAL,
          )
        : null;
      const encryptedAccountName = beneficiary.accountName
        ? encryptionService.encrypt(
            beneficiary.accountName,
            EncryptionKeyType.PII,
          )
        : null;

      await dataSource.query(
        `
        UPDATE beneficiaries 
        SET 
          "accountNumber" = $1,
          "accountName" = $2
        WHERE id = $3
      `,
        [encryptedAccountNumber, encryptedAccountName, beneficiary.id],
      );

      totalEncrypted++;
      console.log(`   ✅ Encrypted beneficiary ${beneficiary.id}`);
    } catch (error) {
      errors++;
      console.error(
        `   ❌ Error encrypting beneficiary ${beneficiary.id}:`,
        error.message,
      );
    }
  }

  // ============================================
  // 4. ENCRYPT TRANSACTION DATA
  // ============================================
  console.log('\n📊 Step 4/4: Encrypting transaction data...');

  const transactions = await dataSource.query(`
    SELECT id, "transactionId", "receiptNumber", reference, "externalReference", "externalTransactionId"
    FROM transactions
    WHERE ("receiptNumber" IS NOT NULL AND "receiptNumber" NOT LIKE 'FINANCIAL:%')
       OR (reference IS NOT NULL AND reference NOT LIKE 'FINANCIAL:%')
       OR ("externalReference" IS NOT NULL AND "externalReference" NOT LIKE 'FINANCIAL:%')
       OR ("externalTransactionId" IS NOT NULL AND "externalTransactionId" NOT LIKE 'FINANCIAL:%')
  `);

  console.log(`   Found ${transactions.length} transactions to encrypt\n`);

  for (const txn of transactions) {
    try {
      const encryptedReceiptNumber = txn.receiptNumber
        ? encryptionService.encrypt(
            txn.receiptNumber,
            EncryptionKeyType.FINANCIAL,
          )
        : null;

      const encryptedReference = txn.reference
        ? encryptionService.encrypt(txn.reference, EncryptionKeyType.FINANCIAL)
        : null;

      const encryptedExternalReference = txn.externalReference
        ? encryptionService.encrypt(
            txn.externalReference,
            EncryptionKeyType.FINANCIAL,
          )
        : null;

      const encryptedExternalTxnId = txn.externalTransactionId
        ? encryptionService.encrypt(
            txn.externalTransactionId,
            EncryptionKeyType.FINANCIAL,
          )
        : null;

      const transactionIdHash = txn.transactionId
        ? encryptionService.hash(txn.transactionId)
        : null;

      await dataSource.query(
        `
        UPDATE transactions 
        SET 
          "receiptNumber" = $1,
          reference = $2,
          "externalReference" = $3,
          "externalTransactionId" = $4,
          "transactionIdHash" = $5
        WHERE id = $6
      `,
        [
          encryptedReceiptNumber,
          encryptedReference,
          encryptedExternalReference,
          encryptedExternalTxnId,
          transactionIdHash,
          txn.id,
        ],
      );

      totalEncrypted++;
      if (txn.id % 100 === 0) {
        console.log(`   ✅ Encrypted ${txn.id} transactions...`);
      }
    } catch (error) {
      errors++;
      console.error(
        `   ❌ Error encrypting transaction ${txn.id}:`,
        error.message,
      );
    }
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n========================================');
  console.log('📈 Encryption Summary:');
  console.log(`   ✅ Total records encrypted: ${totalEncrypted}`);
  console.log(`   ❌ Errors encountered: ${errors}`);
  console.log('========================================\n');

  if (errors === 0) {
    console.log('✅ Financial data encryption completed successfully!');
  } else {
    console.log(
      '⚠️ Encryption completed with some errors. Please review above.',
    );
  }

  await app.close();
}

encryptFinancialData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
