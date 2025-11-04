import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
// import { User } from '../../../auth/entities/user.entity';
import { P2PBuyer } from 'src/P2P/entities/p2p-buyer.entity';
import { P2PSeller } from 'src/P2P/entities/p2p-seller.entity';
import { User } from 'src/auth/entities/user.entity';
import { Negotiation } from './negotiation.entity';

export enum TradeStatus {
  PENDING = 'PENDING',
  PAYMENT_SENT = 'PAYMENT_SENT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  DISPUTED = 'DISPUTED',
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED',
}

export enum MessageType {
  USER = 'USER',
  SYSTEM = 'SYSTEM',
  NOTIFICATION = 'NOTIFICATION',
}

@Entity('p2p_trades')
export class P2PTrade {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'buyerId' })
  buyer: User;

  @Column()
  buyerId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sellerId' })
  seller: User;

  @Column()
  sellerId: number;

  @Column({ nullable: true })
  sellOrderId: number;

  @Column({ nullable: true })
  buyOrderId: number;

  @ManyToOne(() => P2PSeller)
  @JoinColumn({ name: 'sellOrderId' })
  sellOrder: P2PSeller;

  @Column({ name: 'dateCreated', type: 'varchar', length: 50, nullable: true })
  dateCreated: string;

  @Column({ name: 'acceptedAt', nullable: true })
  acceptedAt: Date;

  @ManyToOne(() => P2PBuyer, { nullable: true }) // ✅ FIXED: Now points to P2PBuyer
  @JoinColumn({ name: 'buyOrderId' })
  buyOrder: P2PBuyer; // ✅ FIXED: Type matches the relation

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: number;

  @Column()
  currency: string;

  @Column({
    name: 'convertedAmount',
    type: 'decimal',
    precision: 18,
    scale: 2,
  })
  convertedAmount: number;

  @Column({ nullable: true })
  cancellationReason: string;

  @Column({ nullable: true })
  cancelledBy: number; // User ID who cancelled

  @Column({ nullable: true })
  cancelledAt: Date;

  @Column({ name: 'convertedCurrency' })
  convertedCurrency: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  rate: number;

  // 🔥 NEW: Negotiated rate fields
  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  negotiatedRate: number | null; // Custom negotiated rate, null = use original

  @Column({ type: 'timestamp', nullable: true })
  rateNegotiatedAt: Date | null; // When rate was negotiated

  @Column({ nullable: true })
  rateNegotiatedBy: number | null; // Who negotiated the rate (seller ID)

  @Column({ type: 'text', nullable: true })
  rateNegotiationReason: string | null; // Why rate was changed
  @Column({ name: 'paymentMethod' })
  paymentMethod: string;

  @Column({
    type: 'enum',
    enum: TradeStatus,
    default: TradeStatus.PENDING,
  })
  status: TradeStatus;

  @Column({ nullable: true })
  negotiationId: number;

  @Column({ default: false })
  isNegotiated: boolean;

  @ManyToOne(() => Negotiation)
  @JoinColumn({ name: 'negotiationId' })
  negotiation: Negotiation;

  @Column({ name: 'paymentTimeLimit', type: 'int', default: 1440 }) // in minutes (default 24 hours)
  paymentTimeLimit: number;

  @Column({ name: 'paymentSentAt', nullable: true })
  paymentSentAt: Date;

  @Column({ name: 'paymentConfirmedAt', nullable: true })
  paymentConfirmedAt: Date;

  @Column({ name: 'chatId', nullable: true })
  chatId: string;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;

  getEffectiveRate(): number {
    if (this.isNegotiated && this.negotiation) {
      return this.negotiation.proposedRate;
    }
    return this.rate;
  }

  hasNegotiation(): boolean {
    return this.isNegotiated && this.negotiationId !== null;
  }

  /**
   * Check if rate has been negotiated
   */
  hasNegotiatedRate(): boolean {
    return this.negotiatedRate !== null;
  }

  /**
   * Get detailed rate information
   */
  getRateInfo(): {
    originalRate: number;
    currentRate: number;
    isNegotiated: boolean;
    changeAmount?: number;
    changePercentage?: number;
    negotiatedAt?: Date;
    negotiatedBy?: number;
    reason?: string;
  } {
    const originalRate = this.rate;
    const currentRate = this.getEffectiveRate();
    const isNegotiated = this.hasNegotiatedRate();

    const result: any = {
      originalRate,
      currentRate,
      isNegotiated,
    };

    if (isNegotiated) {
      result.changeAmount = currentRate - originalRate;
      result.changePercentage =
        ((currentRate - originalRate) / originalRate) * 100;
      result.negotiatedAt = this.rateNegotiatedAt;
      result.negotiatedBy = this.rateNegotiatedBy;
      result.reason = this.rateNegotiationReason;
    }

    return result;
  }
  /**
   * Fixed calculateEffectiveAmounts method in P2PTrade entity
   */
  calculateEffectiveAmounts(): {
    effectiveRate: number;
    baseAmount: number;
    quoteAmount: number;
    baseCurrency: string;
    quoteCurrency: string;
  } {
    const effectiveRate = this.getEffectiveRate();

    // Validate that we have valid values
    if (!effectiveRate || effectiveRate <= 0) {
      throw new Error('Invalid effective rate for calculation');
    }

    if (!this.amount || this.amount <= 0) {
      throw new Error('Invalid trade amount for calculation');
    }

    // Determine base and quote currencies and amounts
    let baseAmount: number;
    let quoteAmount: number;
    let baseCurrency: string;
    let quoteCurrency: string;

    if (this.currency === 'CAD') {
      // Trade amount is in CAD
      baseAmount = Number(this.amount); // CAD amount
      quoteAmount = Number(this.amount) * Number(effectiveRate); // NGN equivalent
      baseCurrency = 'CAD';
      quoteCurrency = 'NGN';
    } else if (this.currency === 'NGN') {
      // Trade amount is in NGN
      baseAmount = Number(this.amount) / Number(effectiveRate); // CAD equivalent
      quoteAmount = Number(this.amount); // NGN amount
      baseCurrency = 'CAD';
      quoteCurrency = 'NGN';
    } else {
      throw new Error(`Unsupported currency: ${this.currency}`);
    }

    // Ensure we have valid numbers before calling toFixed
    if (isNaN(baseAmount) || isNaN(quoteAmount)) {
      throw new Error('Invalid calculation result - NaN values detected');
    }

    return {
      effectiveRate: Number(effectiveRate),
      baseAmount: Number(baseAmount.toFixed(2)),
      quoteAmount: Number(quoteAmount.toFixed(2)),
      baseCurrency,
      quoteCurrency,
    };
  }
}
