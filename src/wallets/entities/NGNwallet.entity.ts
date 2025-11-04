// src/wallets/entities/NGNwallet.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Check,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { TransactionEntity } from './transaction.entity';
import { WalletCurrency } from '../interfaces/wallet.interface';
import { FinancialEncrypted } from 'src/common/encryption/transformers/encrypted-column.transformer';

export enum NGNWalletStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  FROZEN = 'frozen',
  SUSPENDED = 'suspended',
}

export enum NGNWalletType {
  INDIVIDUAL = 'individual',
  BUSINESS = 'business',
}

@Entity('ngn_wallets')
@Check(`"balance" >= 0`)
export class NGNWalletEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  userId: number;

  // ✅ ENCRYPT: Account reference (FINANCIAL)
  @Column({
    name: 'accountReference',
    type: 'text',
    unique: false, // ⚠️ Can't have unique constraint on encrypted fields
    nullable: false,
    transformer: FinancialEncrypted,
    comment: 'Unique reference number for wallet transactions (encrypted)',
  })
  accountReference: string;

  // ✅ Add hash for searching by accountReference
  @Column({
    name: 'accountReferenceHash',
    type: 'varchar',
    length: 64,
    unique: true,
    nullable: true,
  })
  @Index()
  accountReferenceHash: string;

  // ✅ ENCRYPT: Account number (FINANCIAL)
  @Column({
    name: 'accountNumber',
    type: 'text',
    unique: false, // ⚠️ Can't have unique constraint on encrypted fields
    nullable: true,
    transformer: FinancialEncrypted,
    comment: 'Nigerian bank account number (encrypted)',
  })
  accountNumber: string;

  // ✅ Add hash for searching by accountNumber
  @Column({
    name: 'accountNumberHash',
    type: 'varchar',
    length: 64,
    unique: true,
    nullable: true,
  })
  @Index()
  accountNumberHash: string;

  // ✅ ENCRYPT: BVN (FINANCIAL - HIGHLY SENSITIVE!)
  @Column({
    name: 'bvn',
    type: 'text',
    nullable: true,
    transformer: FinancialEncrypted,
    comment: 'Bank Verification Number for Nigerian accounts (encrypted)',
  })
  bvn: string;

  // ✅ Add hash for searching by BVN
  @Column({
    name: 'bvnHash',
    type: 'varchar',
    length: 64,
    unique: true,
    nullable: true,
  })
  @Index()
  bvnHash: string;

  @Column({ default: WalletCurrency.NGN })
  currency: WalletCurrency.NGN;

  @Column({ nullable: true })
  referenceNumber?: string;

  // ⚠️ NOT ENCRYPTED - Needed for queries and calculations
  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    comment: 'Wallet balance in Nigerian Naira (NGN)',
  })
  balance: number;

  @Column({
    type: 'enum',
    enum: NGNWalletStatus,
    default: NGNWalletStatus.ACTIVE,
  })
  status: NGNWalletStatus;

  @Column({
    type: 'enum',
    enum: NGNWalletType,
    default: NGNWalletType.INDIVIDUAL,
  })
  walletType: NGNWalletType;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Indicates if the wallet is verified with required KYC',
  })
  isVerified: boolean;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Additional metadata for wallet operations',
  })
  metadata?: Record<string, any>;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @OneToMany(() => TransactionEntity, (transaction) => transaction.ngnWalletId)
  transactions: TransactionEntity[];
}
