// src/P2P/entities/p2p-buyer.entity.ts
import { User } from 'src/auth/entities/user.entity';
import { P2PTrade } from 'src/p2p-trade/entities/p2p-trade.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

@Entity('p2p_buyer') // Explicitly specify the table name
export class P2PBuyer {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true, length: 100 })
  bankName: string;

  @Column()
  userId: number;

  @Column({ default: 0 })
  completedTrades: number;

  @Column({
    type: 'enum',
    enum: ['CAD', 'NGN'],
    default: 'CAD',
  })
  buyCurrency: string;

  @Column({ type: 'decimal', precision: 3, scale: 1, default: 0 })
  rating: number;

  @Column({
    type: 'enum',
    enum: ['CAD', 'NGN'],
    default: 'NGN',
  })
  sellCurrency: string;

  @Column({ default: 0 })
  totalTrades: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  completionRate: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  availableAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  exchangeRate: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  minTransactionLimit: number;

  @Column({ type: 'integer' })
  transactionDuration: number; // in minutes

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 'PENDING' })
  status: string; // PENDING, MATCHED, COMPLETED, CANCELLED

  @Column({ nullable: true })
  matchedSellerId: number;

  @Column({ type: 'timestamp', nullable: true })
  matchedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => P2PTrade, (trade) => trade.buyer)
  trades: P2PTrade[];
}
