// entities/payment-request.entity.ts
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

export enum PaymentRequestStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

@Entity('paymentRequests')
export class PaymentRequestEntity {
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

  @Column({ name: 'senderEmail' })
  senderEmail: string;

  @Column({ name: 'recipientName', nullable: true })
  recipientName?: string;

  @Column({ name: 'aptPayTransactionId', unique: true, nullable: true })
  @Index()
  aptPayTransactionId: string;

  @Column({ name: 'referenceId' })
  @Index()
  referenceId: string;

  @Column({
    type: 'enum',
    enum: PaymentRequestStatus,
    default: PaymentRequestStatus.PENDING,
  })
  @Index()
  status: PaymentRequestStatus;

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

  @Column({ name: 'expiredAt', nullable: true })
  expiredAt?: Date;

  @Column({ name: 'failureReason', nullable: true })
  failureReason?: string;

  @Column({
    name: 'receivedAmount',
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
  })
  receivedAmount?: number;

  @Column({ name: 'transactionId', nullable: true })
  transactionId?: number; // Link to CAD transaction

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
