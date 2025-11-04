// src/auth/entities/onboarding-stage.entity.ts
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    CreateDateColumn,
  } from 'typeorm';
  import { User } from './user.entity';
  
  @Entity('onboarding_stages')
  export class OnboardingStage {
    @PrimaryGeneratedColumn()
    id: number;
  
    @ManyToOne(() => User, (user) => user.onboardingStages, { onDelete: 'CASCADE' })
    user: User;
  
    @Column()
    stageName: string;
  
    @Column({ default: false })
    isCompleted: boolean;
  
    @CreateDateColumn()
    createdAt: Date;
  }
  