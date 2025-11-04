// entities/disbursement.entity.ts
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

export enum DisbursementStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum DisbursementType {
  TRANSFER = 'transfer',
  WITHDRAWAL = 'withdrawal',
  REFUND = 'refund',
}

@Entity('disbursements')
export class DisbursementEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'userId' })
  @Index()
  userId: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
  })
  amount: number;

  @Column({ name: 'recipientEmail' })
  recipientEmail: string;

  @Column({ name: 'recipientName' })
  recipientName: string;

  @Column({ name: 'aptPayTransactionId', unique: true, nullable: true })
  @Index()
  aptPayTransactionId: string;

  @Column({ name: 'referenceId' })
  @Index()
  referenceId: string;

  @Column({ name: 'disbursementNumber' })
  @Index()
  disbursementNumber: string;

  @Column({
    type: 'enum',
    enum: DisbursementStatus,
    default: DisbursementStatus.PENDING,
  })
  @Index()
  status: DisbursementStatus;

  @Column({
    type: 'enum',
    enum: DisbursementType,
    default: DisbursementType.TRANSFER,
  })
  @Index()
  type: DisbursementType;

  @Column({ nullable: true })
  note?: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ name: 'initiatedAt', nullable: true })
  initiatedAt?: Date;

  @Column({ name: 'completedAt', nullable: true })
  completedAt?: Date;

  @Column({ name: 'failedAt', nullable: true })
  failedAt?: Date;

  @Column({ name: 'failureReason', nullable: true })
  failureReason?: string;

  @Column({ name: 'errorCode', nullable: true })
  errorCode?: string;

  @Column({
    name: 'finalAmount',
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
  })
  finalAmount?: number;

  @Column({ name: 'transactionId', nullable: true })
  transactionId?: number; // Link to CAD transaction

  @Column({ name: 'refund_transaction_id', nullable: true })
  refundTransactionId?: number; // Link to refund CAD transaction

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
