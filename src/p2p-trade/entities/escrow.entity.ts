// src/escrow/entities/escrow.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { P2PTrade } from './p2p-trade.entity';

export enum EscrowStatus {
  LOCKED = 'locked',
  RELEASED = 'released',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed',
}

@Entity('escrows')
export class Escrow {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tradeId: number;

  @Column()
  sellerId: number;

  @Column()
  buyerId: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'enum', enum: EscrowStatus, default: EscrowStatus.LOCKED })
  status: EscrowStatus;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @CreateDateColumn()
  lockedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  releasedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  refundedAt: Date;

  @Column({ nullable: true })
  processedBy: number;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => P2PTrade)
  @JoinColumn({ name: 'tradeId' })
  trade: P2PTrade;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sellerId' })
  seller: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'buyerId' })
  buyer: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'processedBy' })
  processedByUser: User;
}
