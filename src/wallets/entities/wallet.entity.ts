// src/wallet/entities/wallet.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
  AfterLoad,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TransactionEntity } from './transaction.entity';
import { User } from 'src/auth/entities/user.entity';

export enum WalletCurrency {
  NGN = 'NGN',
  CAD = 'CAD',
}

export interface IWallet {
  id: string;
  userId: string;
  currency: WalletCurrency;
  isActive: boolean;
  accountNumber?: string;
  balance: number;
}
@Entity('wallets')
export class WalletEntity {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column()
  currency: string;

  @Column('decimal', { precision: 20, scale: 8, default: 0 })
  balance: number;

  @Column({ default: true })
  isActive: boolean;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
