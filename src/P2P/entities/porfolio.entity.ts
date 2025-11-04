// portfolio.entity.ts
import { User } from 'src/auth/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

@Entity()
export class Portfolio {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.portfolio)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @Column({
    type: 'enum',
    enum: ['CAD', 'NGN'],
    default: 'CAD',
  })
  currency: string;

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

  @Column({ default: 0 })
  successfulTrades: number;

  @Column({ default: 0 })
  totalReviews: number;

  @Column({ type: 'decimal', precision: 3, scale: 1, default: 0 })
  rating: number;

  // Added fields for bank account information
  @Column({ nullable: true })
  bankName: string;

  @Column({ nullable: true })
  accountNumber: string;

  @Column({ nullable: true })
  accountName: string;

  // Added field for Interac email
  @Column({ nullable: true })
  interacEmail: string;

  // Added field for payment terms
  @Column({ type: 'text', nullable: true })
  termsOfPayment: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
