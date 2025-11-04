// src/wallet/entities/exchange-rate.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('exchange_rates')
export class ExchangeRateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  sourceCurrency: string;

  @Column()
  @Index()
  targetCurrency: string;

  @Column('decimal', { precision: 20, scale: 8 })
  rate: number;

  @Column('decimal', { precision: 20, scale: 8 })
  inverseRate: number;

  @Column()
  provider: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  @Index()
  timestamp: Date;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;
}
