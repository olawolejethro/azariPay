// entities/cad-transaction.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { CADWalletEntity } from '../../wallets/entities/CADwallet.entity';

export enum CADTransactionType {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

export enum CADTransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum CADTransactionSource {
  REQUEST_PAY_RECEIVED = 'request_pay_received',
  DISBURSEMENT_SENT = 'disbursement_sent',
  DISBURSEMENT_REFUND = 'disbursement_refund',
  REQUEST_PAY_REFUND = 'request_pay_refund',
  MANUAL_ADJUSTMENT = 'manual_adjustment',
  FEE_CHARGE = 'fee_charge',
  SYSTEM_CREDIT = 'system_credit',
}

@Entity('cad_transactions')
export class CADTransactionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'userId' })
  @Index()
  userId: number;

  @Column({ name: 'walletId' })
  @Index()
  walletId: number;

  @Column({
    type: 'enum',
    enum: CADTransactionType,
  })
  @Index()
  type: CADTransactionType;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
  })
  amount: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    name: 'balanceBefore',
  })
  balanceBefore: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    name: 'balanceAfter',
  })
  balanceAfter: number;

  @Column({
    type: 'enum',
    enum: CADTransactionStatus,
    default: CADTransactionStatus.PENDING,
  })
  @Index()
  status: CADTransactionStatus;

  @Column({
    type: 'enum',
    enum: CADTransactionSource,
  })
  @Index()
  source: CADTransactionSource;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string;

  @Column({ name: 'referenceId', nullable: true })
  @Index()
  referenceId?: string; // APT Pay transaction ID or internal reference

  @Column({ name: 'externalTransactionId', nullable: true })
  @Index()
  externalTransactionId?: string; // APT Pay ID

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ name: 'feeAmount', type: 'decimal', precision: 20, scale: 2, default: 0 })
  feeAmount: number;

  @Column({ name: 'processedBy', nullable: true })
  processedBy?: string; // System user or admin who processed

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => CADWalletEntity)
  @JoinColumn({ name: 'walletId' })
  wallet: CADWalletEntity;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamp' })
  updatedAt: Date;
}