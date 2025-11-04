import { User } from 'src/auth/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { P2PTrade } from './p2p-trade.entity';

@Entity('p2p_ratings')
export class P2PRating {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'raterId' })
  rater: User;

  @Column()
  raterId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'ratedUserId' })
  ratedUser: User;

  @Column()
  ratedUserId: number;

  @ManyToOne(() => P2PTrade, { nullable: true })
  @JoinColumn({ name: 'tradeId' })
  trade: P2PTrade;

  @Column({ nullable: true })
  tradeId: number;

  @Column({ type: 'int', comment: 'Rating from 1-5 stars' })
  rating: number;

  @Column({ type: 'text', nullable: true })
  feedback: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
