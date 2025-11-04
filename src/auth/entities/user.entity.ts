// src/auth/entities/user.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { OnboardingStage } from './onboarding-stage.entity';
import { WalletEntity } from 'src/wallets/entities/wallet.entity';
import { NGNWalletEntity } from 'src/wallets/entities/NGNwallet.entity';
import { TransactionEntity } from 'src/wallets/entities/transaction.entity';
import { Portfolio } from 'src/P2P/entities/porfolio.entity';
import { P2PBuyer } from 'src/P2P/entities/p2p-buyer.entity';
import { P2PSeller } from 'src/P2P/entities/p2p-seller.entity';
import { P2PTrade } from 'src/p2p-trade/entities/p2p-trade.entity';
import { getEncryptedTransformer } from 'src/common/encryption/transformers/encryption-transformer.helper';
import { EncryptionKeyType } from 'src/common/encryption/encryption.service';
import {
  PIIEncrypted,
  AuthEncrypted,
} from 'src/common/encryption/transformers/encrypted-column.transformer';

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export interface DeviceMetadata {
  deviceType?: string;
  operatingSystem?: string;
  browser?: string;
  browserVersion?: string;
  deviceModel?: string;
  screenResolution?: string;
  timezone?: string;
  language?: string;
  userAgent?: string;
  ipAddress?: string;
  location?: string;
  appVersion?: string;
  platform?: string;
  lastLoginAt?: string;
}

export enum Gender {
  MALE = 'MAlE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHERS',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  phoneNumber: string;

  // ENCRYPTED with PII key
  @Column({ type: 'text', nullable: true, transformer: PIIEncrypted })
  firstName?: string;

  @Column({ type: 'text', nullable: true, transformer: PIIEncrypted })
  lastName?: string;

  @Column({ type: 'text', nullable: true, transformer: PIIEncrypted })
  dateOfBirth?: string;

  // EMAIL - Hash for search + Encrypted for storage
  @Column({ nullable: true, unique: true })
  emailHash?: string;

  @Column({ type: 'text', nullable: true, transformer: PIIEncrypted })
  interacEmailAddress?: string;

  // ADDRESS - Encrypted JSON
  @Column({
    type: 'text',
    nullable: true,
    transformer: {
      to: (value: any) => {
        if (!value) return value;
        if (typeof value === 'string' && value.startsWith('PII:')) return value;
        const jsonString = JSON.stringify(value);
        return PIIEncrypted.to(jsonString);
      },
      from: (value: string) => {
        if (!value) return value;
        if (!value.includes(':v')) {
          try {
            return JSON.parse(value); // Parse old unencrypted data
          } catch (error) {
            console.error('Failed to parse address:', value);
            return null; // or return value as-is
          }
        }
        const decrypted = PIIEncrypted.from(value);
        try {
          return JSON.parse(decrypted);
        } catch (error) {
          console.error('Failed to parse decrypted address:', decrypted);
          return null;
        }
      },
    },
  })
  address?: {
    city?: string;
    street?: string;
    zipCode?: string;
    stateProvince?: string;
    apartmentNumber?: string;
  };

  @Column({
    type: 'enum',
    enum: Gender,
    nullable: true,
  })
  gender?: Gender;

  @Column({ nullable: true })
  occupation?: string;

  @Column({ type: 'decimal', precision: 3, scale: 1, default: 0 })
  rating: number;

  @Column({ nullable: true })
  expectedTransactionVolume?: string; // e.g., '1000-5000', '5000-10000', etc.

  @Column({ nullable: true })
  isLocked?: boolean;

  @Column({ nullable: true })
  aptPayIdentityId: string;

  @Column({ nullable: true })
  publicKey: string;

  @Column({ select: false })
  @Exclude()
  password: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({ nullable: true })
  onboardingAuthorizationToken?: string;

  @OneToMany(() => OnboardingStage, (stage) => stage.user)
  onboardingStages: OnboardingStage[];

  @Column({ default: 0 })
  loginAttempts: number;

  @Column({ default: 0 })
  signatureAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  lockUntil: Date;

  @Column({ default: false })
  kycStarted?: boolean;

  @Column({ nullable: true })
  kycStartedAt?: Date;

  @Column({ default: false })
  kycCompleted?: boolean;

  @Column({ default: 'NOT STARTED' })
  kycStatus?: string;

  @Column({ nullable: true })
  kycAdditionalInfo?: string;

  @Column({ nullable: true })
  kycCompletedAt?: Date;

  @Column({
    type: 'jsonb', // For PostgreSQL
    nullable: true,
  })
  deviceMetadata?: DeviceMetadata;

  @Column({ nullable: true })
  ApplicantId?: string;

  @Column({ default: 0 })
  kycTrials?: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: 1 })
  tokenVersion: number;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  verification_id: string;

  @Column({ select: false, nullable: true })
  @Exclude()
  pin?: string;

  @Column({ nullable: true })
  pinUpdatedAt?: Date;

  @Column({ nullable: true })
  country?: string;

  @Column({ nullable: true })
  profilePictureUrl?: string;

  @Column({ type: 'timestamp', nullable: true })
  profilePictureUpdatedAt?: Date;

  @Column({ nullable: true })
  fcmToken: string;

  @Column({ nullable: true })
  fcmTokenPlatform: string; // 'ios', 'android', 'web'

  @Column({ type: 'timestamp', nullable: true })
  fcmTokenUpdatedAt: Date;

  @OneToMany(() => NGNWalletEntity, (wallet) => wallet.user)
  ngnWallets: NGNWalletEntity[];

  @OneToMany(() => Portfolio, (portfolio) => portfolio.user)
  portfolio: Portfolio[];

  @OneToMany(() => P2PBuyer, (p2p_buyer) => p2p_buyer.user)
  p2p_buyer: P2PBuyer[];

  // Updated: Split trades into those where user is buyer and those where user is seller
  @OneToMany(() => P2PTrade, (trade) => trade.buyer)
  buyerTrades: P2PTrade[];

  @OneToMany(() => P2PTrade, (trade) => trade.seller)
  sellerTrades: P2PTrade[];

  @OneToMany(() => P2PSeller, (p2p_seller) => p2p_seller.user)
  p2p_seller: P2PSeller[];

  @OneToMany(() => TransactionEntity, (transaction) => transaction.user)
  transactions: TransactionEntity[];
}
