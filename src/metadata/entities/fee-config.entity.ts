import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('fee_configurations')
// @Index('IDX_fee_config_transaction_type', ['transaction_type'])
// @Index('IDX_fee_config_active_effective', [
//   'is_active',
//   'effective_from',
//   'effective_until',
// ])
// @Index('IDX_fee_config_currency', ['currency'])
// @Index('IDX_fee_config_user_tier', ['user_tier'])
export class FeeConfiguration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    name: 'transaction_type',
    type: 'varchar',
    length: 100,
    nullable: false,
    comment:
      'Type of transaction (e.g., transfer, withdrawal, deposit, currency_exchange)',
  })
  transaction_type: string;

  @Column({
    name: 'transaction_subtype',
    type: 'varchar',
    length: 100,
    nullable: true,
    comment:
      'Subtype for more granular fee control (e.g., domestic_transfer, international_transfer)',
  })
  transaction_subtype?: string;

  @Column({
    name: 'fee_type',
    type: 'enum',
    enum: ['fixed', 'percentage', 'tiered', 'hybrid'],
    default: 'fixed',
    nullable: false,
    comment: 'Type of fee calculation',
  })
  fee_type: string;

  @Column({
    name: 'fee_value',
    type: 'decimal',
    precision: 15,
    scale: 4,
    nullable: false,
    comment: 'Fee amount (fixed amount or percentage value)',
  })
  fee_value: number;

  @Column({
    name: 'minimum_fee',
    type: 'decimal',
    precision: 15,
    scale: 4,
    nullable: true,
    comment: 'Minimum fee amount (used with percentage fees)',
  })
  minimum_fee?: number;

  @Column({
    name: 'maximum_fee',
    type: 'decimal',
    precision: 15,
    scale: 4,
    nullable: true,
    comment: 'Maximum fee amount (used with percentage fees)',
  })
  maximum_fee?: number;

  @Column({
    type: 'varchar',
    length: 3,
    nullable: false,
    default: 'USD',
    comment: 'Currency code (ISO 4217)',
  })
  currency: string;

  @Column({
    name: 'amount_range_min',
    type: 'decimal',
    precision: 15,
    scale: 4,
    nullable: true,
    comment: 'Minimum transaction amount for this fee to apply',
  })
  amount_range_min?: number;

  @Column({
    name: 'amount_range_max',
    type: 'decimal',
    precision: 15,
    scale: 4,
    nullable: true,
    comment: 'Maximum transaction amount for this fee to apply',
  })
  amount_range_max?: number;

  @Column({
    name: 'user_tier',
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'User tier/category (e.g., basic, premium, vip)',
  })
  user_tier?: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Transaction channel (e.g., mobile, web, api)',
  })
  channel?: string;

  @Column({
    name: 'is_active',
    type: 'boolean',
    default: true,
    nullable: false,
    comment: 'Whether this fee configuration is active',
  })
  is_active: boolean;

  @Column({
    name: 'effective_from',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    nullable: false,
    comment: 'Date from when this fee is effective',
  })
  effective_from: Date;

  @Column({
    name: 'effective_until',
    type: 'timestamp',
    nullable: true,
    comment: 'Date until when this fee is effective (null for indefinite)',
  })
  effective_until?: Date;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Description of the fee configuration',
  })
  description?: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Additional configuration data in JSON format',
  })
  metadata?: any;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    nullable: false,
  })
  created_at: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    nullable: false,
  })
  updated_at: Date;

  @Column({
    name: 'created_by',
    type: 'uuid',
    nullable: true,
    comment: 'ID of user who created this configuration',
  })
  created_by?: string;
}
