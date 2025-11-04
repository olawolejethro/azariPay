// src/negotiations/entities/negotiation.entity.ts
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
import { P2PSeller } from '../../P2P/entities/p2p-seller.entity';
import { P2PTrade } from '../../p2p-trade/entities/p2p-trade.entity'; // Fix the import path

export enum NegotiationStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  AGREED = 'agreed',
  DECLINED = 'declined',
  EXPIRED = 'expired',
  COMPLETED = 'completed',
}

@Entity('negotiations')
export class Negotiation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  sellOrderId: number;

  @Column()
  buyerId: number;

  @Column()
  sellerId: number;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  proposedRate: number;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  originalRate: number;

  @Column({
    type: 'enum',
    enum: NegotiationStatus,
    default: NegotiationStatus.PENDING,
  })
  status: NegotiationStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'timestamp', nullable: true })
  agreedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @Column({ nullable: true })
  agreedBy: number; // User ID who accepted

  @Column({ nullable: true })
  tradeId: number;

  @Column({ type: 'timestamp', nullable: true })
  tradeCreationDeadline: Date; // Must create trade by this time (24 hours)

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => P2PSeller)
  @JoinColumn({ name: 'sellOrderId' })
  sellOrder: P2PSeller;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'buyerId' })
  buyer: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sellerId' })
  seller: User;

  // ✅ FIXED: This should reference 'tradeId' column, not 'convertedToTradeId'
  @ManyToOne(() => P2PTrade, { nullable: true })
  @JoinColumn({ name: 'tradeId' }) // Changed from 'convertedToTradeId' to 'tradeId'
  trade: P2PTrade; // Changed from 'convertedTrade' to 'trade'
}
