import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TransactionEntity } from './transaction.entity';
import { User } from 'src/auth/entities/user.entity';

@Entity('transaction_reports')
export class TransactionReport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  transactionType: string; // Exactly as entered in UI (e.g., "P2P Trade")

  @Column()
  transactionId: string; // Exactly as entered in UI (e.g., "1234678nv78l78")

  @Column({ nullable: true })
  uploadReceipt: string; // File path or URL for uploaded receipt

  @Column({ type: 'text', nullable: true })
  moreInformation: string; // Additional information provided by user

  @Column({ default: 'PENDING' })
  status: string; // PENDING, INVESTIGATING, RESOLVED, CLOSED

  @Column({ nullable: true })
  assignedTo: number; // Admin user ID who handles the report

  @Column({ type: 'text', nullable: true })
  adminNotes: string; // Internal admin notes

  @Column({ type: 'text', nullable: true })
  resolution: string; // Final resolution details

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  resolvedAt: Date;

  // Relations
  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => TransactionEntity, { nullable: true })
  @JoinColumn({ name: 'transactionId', referencedColumnName: 'id' })
  transaction: TransactionEntity;
}
