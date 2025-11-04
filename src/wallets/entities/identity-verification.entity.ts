// entities/identity-verification.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { AptPayWebhookEvent } from '../../webhooks/entities/aptpay-webhook-event.entity';

export enum IdentityVerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

@Entity('identity_verifications')
@Index(['userId', 'aptPayVerificationId'], { unique: true })
export class IdentityVerificationEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ name: 'aptpay_verification_id' })
  aptPayVerificationId: string;

  @Column()
  email: string;

  @Column({
    type: 'enum',
    enum: IdentityVerificationStatus,
    default: IdentityVerificationStatus.PENDING,
  })
  status: IdentityVerificationStatus;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt?: Date;

  @Column({ name: 'failed_at', type: 'timestamp', nullable: true })
  failedAt?: Date;

  @Column({ name: 'failure_reason', nullable: true })
  failureReason?: string;

  @Column({ name: 'failure_code', type: 'int', nullable: true })
  failureCode?: number;

  @Column({ type: 'jsonb', nullable: true })
  documentData?: {
    documentNumber: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    fullName: string;
    dateOfBirth: string;
    address: {
      address1: string;
      address2?: string;
      postcode: string;
    };
    documentType: string;
    nationality: string;
    expiryDate: string;
    issuedDate: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  verificationResults?: {
    faceMatch: boolean;
    faceConfidence: number;
    authenticationScore: number;
    verificationPassed: boolean;
    checks: {
      face?: boolean;
      notexpired?: boolean;
      name?: boolean;
      dob?: boolean;
      postcode?: boolean;
      address?: boolean;
    };
    authenticationBreakdown: {
      data_visibility?: { passed: boolean };
      image_quality?: { passed: boolean };
      feature_referencing?: { passed: boolean };
      exif_check?: { passed: boolean; reason?: string };
      publicity_check?: { passed: boolean; reason?: string };
      text_analysis?: { passed: boolean };
      biometric_analysis?: { passed: boolean };
      security_feature_check?: { passed: boolean };
      recapture_check?: { passed: boolean };
    };
    warnings?: string[];
  };

  @Column({ type: 'jsonb', nullable: true })
  amlResults?: any[]; // Store AML check results if present

  @Column({ type: 'jsonb', nullable: true })
  userIpData?: {
    country: string;
    countryCode: string;
    regionName: string;
    city: string;
    zip: string;
    lat: number;
    lon: number;
    mobile: boolean;
    proxy: boolean;
    query: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  verificationMetadata?: {
    sessionId?: string;
    verificationUrl?: string;
    qrCode?: string;
    requireGeoLocation?: boolean;
    initiatedAt?: string;
    userAgent?: string;
    ipAddress?: string;
    completedAt?: string;
    processingDuration?: number; // in seconds
  };

  @Column({ type: 'jsonb' })
  rawData: any; // Store complete webhook payload

  @Column({ name: 'webhook_event_id', nullable: true })
  webhookEventId?: string;

  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => AptPayWebhookEvent, { nullable: true })
  @JoinColumn({ name: 'webhook_event_id' })
  webhookEvent?: AptPayWebhookEvent;
}
