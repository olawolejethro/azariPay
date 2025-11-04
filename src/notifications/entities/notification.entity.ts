import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum NotificationStatus {
  UNREAD = 'UNREAD',
  READ = 'READ',
  DELETED = 'DELETED',
  ALL = 'ALL',
}

export enum NotificationType {
  P2P_TRADE_REQUEST = 'P2P_TRADE_REQUEST',
  PAYMENT_REQUEST = 'PAYMENT_REQUEST',
  TRANSFER_COMPLETE = 'TRANSFER_COMPLETE',
  CURRENCY_CONVERSION = 'CURRENCY_CONVERSION',
  WALLET_FUNDED = 'WALLET_FUNDED',
  KYC_STATUS = 'KYC_STATUS',
  SYSTEM_ANNOUNCEMENT = 'SYSTEM_ANNOUNCEMENT',
  SECURITY_ALERT = 'SECURITY_ALERT',
  CUSTOM = 'CUSTOM',
  TRADE_COMPLETED = 'TRADE_COMPLETED',
  P2P_TRADE_CANCELLED = 'P2P_TRADE_CANCELLED',
  NEW_P2P_TRADE = 'NEW_P2P_TRADE',
  P2P_PAYMENT_CONFIRMATION = 'P2P_PAYMENT_CONFIRMATION',
  P2P_PAYMENT_SENT = 'P2P_PAYMENT_SENT',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'userId' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.UNREAD,
  })
  status: NotificationStatus;

  @Column({
    type: 'enum',
    enum: NotificationType,
    default: NotificationType.CUSTOM,
  })
  type: NotificationType;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, any>;

  @Column({ nullable: true })
  action: string; // Optional URL or deep link to navigate to when clicked

  @Column({ default: false })
  isSent: boolean; // Whether notification was sent as push notification

  @Column({ nullable: true })
  sentAt: Date; // When the push notification was sent

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  // Add the new currency field
  @Column({ nullable: true })
  currency: string; // Currency, e.g., 'USD', 'EUR'

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
