// src/p2p-chat/entities/p2p-chat.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../../auth/entities/user.entity';
import { P2PBuyer } from 'src/P2P/entities/p2p-buyer.entity';
import { P2PSeller } from 'src/P2P/entities/p2p-seller.entity';
import { P2PTrade } from '../../../p2p-trade/entities/p2p-trade.entity';
import { Negotiation } from 'src/p2p-trade/entities/negotiation.entity';
import { SensitiveEncrypted } from 'src/common/encryption/transformers/encrypted-column.transformer';

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
  FILE = 'FILE',
  IMAGE = 'IMAGE',
  DOCUMENT = 'DOCUMENT',
}

@Entity('p2p_chat_messages')
export class P2PChatMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'tradeId', nullable: true })
  tradeId: number;

  @ManyToOne(() => P2PTrade, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tradeId' })
  trade: P2PTrade;
  @Column({ nullable: true })
  negotiationId: number;

  @ManyToOne(() => Negotiation)
  @JoinColumn({ name: 'negotiationId' })
  negotiation: Negotiation;

  @Column({ name: 'senderId', nullable: true })
  senderId: number;

  @Column({ name: 'receiverId', nullable: true })
  receiverId: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'senderId' })
  sender: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'receiverId' })
  receiver: User;

  // ✅ ENCRYPT: Message content (SENSITIVE)
  @Column({
    type: 'text',
    transformer: SensitiveEncrypted,
  })
  content: string;
  @Column({
    type: 'enum',
    enum: MessageType,
    default: MessageType.USER,
  })
  type: MessageType;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ default: false })
  isRead: boolean;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
