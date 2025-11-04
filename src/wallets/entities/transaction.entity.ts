// src/wallets/entities/transaction.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { WalletEntity } from './wallet.entity';
import { User } from 'src/auth/entities/user.entity';
import { NGNWalletEntity } from './NGNwallet.entity';
import { CADWalletEntity } from './CADwallet.entity';
import { FinancialEncrypted } from 'src/common/encryption/transformers/encrypted-column.transformer';

export enum TransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  P2P_CREDIT = 'P2P_CREDIT',
  P2P_DEBIT = 'P2P_DEBIT',
  DEBIT_CONVERSION = 'DEBIT_CONVERSION',
  CREDIT_CONVERSION = 'CREDIT_CONVERSION',
  TRANSFER = 'TRANSFER',
  CONVERSION = 'CONVERSION',
  P2P_TRADE_RELEASE = 'P2P_TRADE_RELEASE',
  P2P_TRADE_CANCEL = 'P2P_TRADE_CANCEL',
  P2P_TRADE_RECEIVED = 'P2P_TRADE_RECEIVED',
  ESCROW_LOCK = 'ESCROW_LOCK',
  ESCROW_RELEASE = 'ESCROW_RELEASE',
  ESCROW_REFUND = 'ESCROW_REFUND',
  REFUND = 'REFUND',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum TransactionCurrency {
  NGN = 'NGN',
  CAD = 'CAD',
}

export enum TransactionSource {
  PAGA_DEPOSIT = 'PAGA_DEPOSIT',
  PAGA_WITHDRAWAL = 'PAGA_WITHDRAWAL',
  PAGA_TRANSFER = 'PAGA_TRANSFER',
  MANUAL_CREDIT = 'MANUAL_CREDIT',
  MANUAL_DEBIT = 'MANUAL_DEBIT',
  REQUEST_PAY_RECEIVED = 'REQUEST_PAY_RECEIVED',
  DISBURSEMENT_SENT = 'DISBURSEMENT_SENT',
  DISBURSEMENT_REFUND = 'DISBURSEMENT_REFUND',
  CURRENCY_CONVERSION = 'CURRENCY_CONVERSION',
  SYSTEM_ADJUSTMENT = 'SYSTEM_ADJUSTMENT',
  FEE_CHARGE = 'FEE_CHARGE',
  REFUND = 'REFUND',
  SYSTEM = 'SYSTEM',
}

interface TransactionFee {
  type: string;
  amount: number;
  currency: TransactionCurrency;
  description?: string;
}

@Entity('transactions')
export class TransactionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => NGNWalletEntity, (wallet) => wallet.transactions, {
    nullable: true,
  })
  @JoinColumn({ name: 'ngnWalletId' })
  ngnWallet: NGNWalletEntity;

  @Column({ nullable: true })
  ngnWalletId: number;

  @ManyToOne(() => CADWalletEntity, { nullable: true })
  @JoinColumn({ name: 'cadWalletId' })
  cadWallet: CADWalletEntity;

  @Column({ nullable: true })
  cadWalletId: number;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column('decimal', { precision: 20, scale: 2 })
  amount: number;

  @Column('decimal', { precision: 20, scale: 2, default: 0 })
  fee: number;

  @Column({
    type: 'enum',
    enum: TransactionCurrency,
  })
  @Index()
  currency: TransactionCurrency;

  @Column({
    type: 'enum',
    enum: TransactionSource,
    nullable: true,
  })
  @Index()
  source: TransactionSource;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  @Index()
  status: TransactionStatus;

  // Transaction ID - Add hash for searching
  @Column({
    unique: false, // Remove unique constraint
    nullable: true,
  })
  transactionId: string;

  @Column({
    name: 'transactionIdHash',
    type: 'varchar',
    length: 64,
    unique: true,
    nullable: true,
  })
  @Index()
  transactionIdHash: string;

  // ❌ NOT ENCRYPTED - Needed for audit queries
  @Column('decimal', { precision: 20, scale: 2, nullable: true })
  balanceBefore: number;

  @Column('decimal', { precision: 20, scale: 2, nullable: true })
  balanceAfter: number;

  // ✅ ENCRYPT: Receipt number (FINANCIAL)
  @Column({
    nullable: true,
    type: 'text',
    comment: 'Receipt number from payment provider (encrypted)',
    transformer: FinancialEncrypted,
  })
  receiptNumber: string;

  // ✅ ENCRYPT: Internal reference (FINANCIAL)
  @Column({
    nullable: true,
    type: 'text',
    transformer: FinancialEncrypted,
  })
  reference: string;

  // ✅ ADD: Hash for searching by reference
  @Column({
    name: 'referenceHash',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  @Index()
  referenceHash: string;

  // ✅ ENCRYPT: External reference (FINANCIAL)
  @Column({
    nullable: true,
    type: 'text',
    transformer: FinancialEncrypted,
  })
  externalReference: string;

  // ✅ ENCRYPT: External transaction ID (FINANCIAL)
  @Column({
    nullable: true,
    type: 'text',
    comment: 'External transaction ID from AptPay, Paga, etc. ()',
    // transformer: FinancialEncrypted,
  })
  externalTransactionId: string;

  // ✅ ADD: Hash for searching by external reference
  @Column({
    name: 'externalReferenceHash',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  @Index()
  externalReferenceHash: string;

  @Column({
    nullable: true,
    type: 'varchar',
    length: 255,
    comment: 'Detailed status message or error description',
  })
  statusMessage: string;

  @Column({
    nullable: true,
    type: 'int',
    comment: 'Request ID used for transaction status queries',
  })
  requestId: number;

  @Column({
    nullable: true,
    type: 'varchar',
    length: 50,
    comment: 'External provider transaction state',
  })
  state: string;

  @Column({
    nullable: true,
    type: 'varchar',
    length: 50,
    comment: 'Internal processing state',
  })
  internalState: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  failedReason: string;

  @Column({ nullable: true })
  sourceType: string;

  @Column({
    nullable: true,
    type: 'varchar',
    length: 100,
    comment: 'Who or what processed this transaction',
  })
  processedBy: string;

  @Column('jsonb', { nullable: true })
  fees: TransactionFee[];

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  statusHistory: {
    status: TransactionStatus;
    timestamp: Date;
    reason?: string;
  }[];

  @Column({ type: 'jsonb', nullable: true })
  responseData: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date;
}
