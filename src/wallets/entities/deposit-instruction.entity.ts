// src/wallet/entities/deposit-instruction.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('deposit_instructions')
export class DepositInstructionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  walletId: string;

  @Column()
  currency: string;

  @Column()
  type: string;

  @Column('jsonb')
  instructions: Record<string, any>;

  @Column('jsonb', { nullable: true })
  fees: Record<string, any>[];

  @Column('decimal', { precision: 20, scale: 8 })
  minimumAmount: number;

  @Column('decimal', { precision: 20, scale: 8 })
  maximumAmount: number;

  @Column()
  processingTime: string;

  @Column({ default: true })
  isActive: boolean;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
