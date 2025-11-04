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
import { P2PTrade } from '../../p2p-trade/entities/p2p-trade.entity';

export enum DisputeStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  RESOLVED = 'resolved',
  REJECTED = 'rejected',
  ESCALATED = 'escalated',
}

@Entity('disputes')
export class Dispute {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tradeId: number;

  @Column()
  raisedBy: number; // User who created the dispute

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: number;

  @Column()
  transactionType: string;

  @Column({ type: 'jsonb', nullable: true })
  screenshots: string[]; // Array of image URLs

  @Column({ type: 'text', nullable: true })
  additionalInfo: string;

  @Column({
    type: 'enum',
    enum: DisputeStatus,
    default: DisputeStatus.PENDING,
  })
  status: DisputeStatus;

  @Column({ type: 'text', nullable: true })
  adminNotes: string;

  @Column({ nullable: true })
  resolvedBy: number; // Admin who resolved

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date;

  @Column({ type: 'text', nullable: true })
  resolution: string; // Resolution details

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => P2PTrade)
  @JoinColumn({ name: 'tradeId' })
  trade: P2PTrade;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'raisedBy' })
  raisedByUser: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'resolvedBy' })
  resolvedByUser: User;
}
