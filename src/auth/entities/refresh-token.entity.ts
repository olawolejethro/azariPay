// src/auth/entities/refresh-token.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  token: string;

  @Column()
  @Index()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  deviceName: string;

  @Column({ nullable: true })
  deviceType: string; // 'iOS', 'Android', 'Web'

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  location: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  expiresAt: Date;

  @Column({ nullable: true })
  lastUsedAt: Date;

  @Column({ default: false })
  revoked: boolean;

  @Column({ nullable: true })
  revokedAt: Date;

  @Column({ nullable: true })
  revokedReason: string; // 'user_logout', 'logout_all_devices', 'password_change', 'security_event'
}
