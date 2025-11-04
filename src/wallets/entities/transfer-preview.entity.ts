// src/wallet/entities/transfer-preview.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('transfer_previews')
export class TransferPreviewEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column()
  sourceWalletId: string;

  @Column()
  destinationType: string;

  @Column()
  destinationId: string;

  @Column('decimal', { precision: 20, scale: 8 })
  sourceAmount: number;

  @Column()
  sourceCurrency: string;

  @Column('decimal', { precision: 20, scale: 8 })
  destinationAmount: number;

  @Column()
  destinationCurrency: string;

  @Column('decimal', { precision: 20, scale: 8 })
  exchangeRate: number;

  @Column('jsonb')
  fees: Record<string, any>[];

  @Column('decimal', { precision: 20, scale: 8 })
  totalDebit: number;

  @Column()
  estimatedDeliveryTime: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  expiresAt: Date;

  @Column({ default: true })
  isValid: boolean;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;
}
