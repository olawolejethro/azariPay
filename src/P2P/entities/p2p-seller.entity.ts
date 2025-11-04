// src/P2P/entities/p2p-seller.entity.ts
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
  Index,
} from 'typeorm';
import {
  PIIEncrypted,
  FinancialEncrypted,
} from 'src/common/encryption/transformers/encrypted-column.transformer';

@Entity('p2p_seller')
export class P2PSeller {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  @Index()
  userId: number;

  @Column({
    type: 'enum',
    enum: ['CAD', 'NGN'],
    default: 'NGN',
  })
  sellCurrency: string;

  @Column({
    type: 'enum',
    enum: ['CAD', 'NGN'],
    default: 'CAD',
  })
  buyCurrency: string;

  // ❌ NOT ENCRYPTED - Needed for matching/queries
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  availableAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  exchangeRate: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  minTransactionLimit: number;

  @Column({ type: 'integer' })
  transactionDuration: number; // in minutes

  @Column({ default: true })
  @Index()
  isActive: boolean;

  @Column({ default: 'PENDING' })
  @Index()
  status: string; // PENDING, MATCHED, COMPLETED, CANCELLED

  @Column({ nullable: true })
  matchedBuyerId: number;

  @Column({ type: 'timestamp', nullable: true })
  matchedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ default: 0 })
  completedTrades: number;

  @Column({ default: 0 })
  totalReviews: number;

  @Column({ default: 0 })
  totalTrades: number;

  // ============================================
  // 🔐 ENCRYPTED PAYMENT INFORMATION
  // ============================================

  // ✅ ENCRYPT: Bank name (PII)
  @Column({
    type: 'text',
    nullable: true,
    transformer: PIIEncrypted,
  })
  bankName: string;

  // ✅ ENCRYPT: Account number (FINANCIAL)
  @Column({
    type: 'text',
    nullable: true,
    transformer: FinancialEncrypted,
  })
  accountNumber: string;

  // ✅ ENCRYPT: Account holder name (PII)
  @Column({
    type: 'text',
    nullable: true,
    transformer: PIIEncrypted,
  })
  accountName: string;

  // ✅ ENCRYPT: Interac email (PII)
  @Column({
    type: 'text',
    nullable: true,
    transformer: PIIEncrypted,
  })
  interacEmail: string;

  // ============================================

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  completionRate: number;

  @Column({ type: 'text', nullable: true })
  termsOfPayment: string;

  @Column({ type: 'decimal', precision: 3, scale: 1, default: 0 })
  rating: number;

  @Column({ default: false })
  awaitingSeller: boolean;

  @Column({ default: false })
  isNegotiating: boolean;

  @OneToMany(() => P2PTrade, (trade) => trade.seller)
  trades: P2PTrade[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
