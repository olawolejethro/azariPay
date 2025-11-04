import { MigrationInterface, QueryRunner } from 'typeorm';

// ✅ Timestamp FIRST, then name
export class DecryptExternalTransactionIds1729493847123
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add a temporary column
    await queryRunner.query(`
      ALTER TABLE "transactions" 
      ADD COLUMN "externalTransactionIdTemp" VARCHAR(255)
    `);

    // 2. Change original column type
    await queryRunner.query(`
      ALTER TABLE "transactions" 
      ALTER COLUMN "externalTransactionId" TYPE VARCHAR(255)
    `);

    // 3. Add index
    await queryRunner.query(`
      CREATE INDEX "IDX_externalTransactionId" 
      ON "transactions" ("externalTransactionId")
    `);

    console.log(`
      ⚠️  MANUAL STEP REQUIRED:
      Run the decryption script to populate plain text values:
      npm run decrypt-external-ids
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_externalTransactionId"`);
    await queryRunner.query(`
      ALTER TABLE "transactions" 
      ALTER COLUMN "externalTransactionId" TYPE TEXT
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions" 
      DROP COLUMN IF EXISTS "externalTransactionIdTemp"
    `);
  }
}
