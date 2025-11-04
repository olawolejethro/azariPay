// entities/aptpay-webhook-event.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('aptpay_webhook_events')
export class AptPayWebhookEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'apt_pay_id' })
  @Index()
  aptPayId: string; // APT Pay transaction ID

  @Column({ nullable: true })
  balance: string;

  @Column()
  @Index()
  entity: string; // 'disbursement' or 'request_pay'

  @Column()
  @Index()
  status: string; // 'OK', 'SETTLED', 'FAILED', etc.

  @Column({ nullable: true })
  date?: string;

  @Column({ name: 'error_code', nullable: true })
  errorCode?: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ name: 'raw_payload', type: 'json' })
  rawPayload: any;

  @Column({ name: 'processing_status' })
  @Index()
  processingStatus: 'pending' | 'processed' | 'failed';

  @Column({ name: 'error_message', nullable: true })
  errorMessage?: string;

  @Column({ name: 'user_id', nullable: true })
  @Index()
  userId?: number;

  @Column({ name: 'reference_id', nullable: true })
  @Index()
  referenceId?: string;

  @CreateDateColumn({ name: 'received_at' })
  receivedAt: Date;

  @Column({ name: 'processed_at', nullable: true })
  processedAt?: Date;

  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;
}