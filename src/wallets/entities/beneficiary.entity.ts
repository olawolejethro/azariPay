// src/wallets/entities/beneficiary.entity.ts
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
import { NGNWalletEntity } from './NGNwallet.entity';
import { User } from 'src/auth/entities/user.entity';
import {
  FinancialEncrypted,
  PIIEncrypted,
} from 'src/common/encryption/transformers/encrypted-column.transformer';

@Entity('beneficiaries')
export class BeneficiaryEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  walletId: number;

  @ManyToOne(() => NGNWalletEntity, { nullable: true })
  @JoinColumn({ name: 'walletId' })
  wallet: NGNWalletEntity;

  // ✅ ENCRYPT: Bank account number (FINANCIAL)
  @Column({ type: 'text', transformer: FinancialEncrypted })
  accountNumber: string;

  // ✅ ENCRYPT: Account holder name (PII)
  @Column({ type: 'text', transformer: PIIEncrypted })
  accountName: string;

  // Bank code (not sensitive - used for routing)
  @Column()
  bankCode: string;

  @Column({ nullable: true })
  countryCode: string;

  @Column({ nullable: true })
  bankName: string;

  @Column({ default: false })
  isFavorite: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: true })
  isActive: boolean;
}
