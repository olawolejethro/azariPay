// src/wallets/entities/cad-wallet.entity.ts

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  BeforeInsert,
  BeforeUpdate,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Check,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { TransactionEntity } from './transaction.entity';
import { WalletCurrency } from '../interfaces/wallet.interface';
import { PIIEncrypted } from 'src/common/encryption/transformers/encrypted-column.transformer';

export enum CADWalletStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  FROZEN = 'frozen',
  SUSPENDED = 'suspended',
}

export enum CADWalletType {
  PERSONAL = 'personal',
  BUSINESS = 'business',
}

@Entity('cad_wallet')
export class CADWalletEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  userId: number;

  // ✅ Add transformer to encrypt
  @Column({
    type: 'text',
    unique: false,
    name: 'interac_email',
    transformer: PIIEncrypted, // ✅ This encrypts on save
  })
  interacEmail: string;

  @Column({
    name: 'interacEmailHash',
    type: 'varchar',
    length: 64,
    unique: true,
    nullable: true,
  })
  @Index()
  interacEmailHash: string;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
  })
  balance: number;

  @Column({
    type: 'enum',
    enum: CADWalletStatus,
    default: CADWalletStatus.ACTIVE,
  })
  status: CADWalletStatus;

  @Column({
    type: 'enum',
    enum: CADWalletType,
    default: CADWalletType.PERSONAL,
  })
  walletType: CADWalletType;

  @Column({ default: WalletCurrency.CAD })
  currency: WalletCurrency.CAD;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
  @OneToMany(() => TransactionEntity, (transaction) => transaction.cadWallet)
  transactions: TransactionEntity[];
}
