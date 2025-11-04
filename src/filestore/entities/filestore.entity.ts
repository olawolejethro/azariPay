// src/filestore/entities/filestore.entity.ts

import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
  } from 'typeorm';
  
  @Entity('filestores')
  export class FileStore {
    @PrimaryGeneratedColumn()
    id: number;
  
    @Column({ unique: true })
    fileUrl: string;
  
    @Column('json')
    fileMetadata: Record<string, any>;
  
    @CreateDateColumn()
    uploadDate: Date;
  
    @Column()
    userId: number; // Assuming files are associated with users
  
    @UpdateDateColumn()
    updatedAt: Date;
  }
  