import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('countries')
export class CountryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 2 })
  @Index()
  countryCode: string;

  @Column()
  countryName: string;

  @Column({ type: 'jsonb', nullable: true })
  localizedNames: Record<string, string>;

  @Column({ type: 'jsonb', default: [] })
  supportedCurrencies: string[];

  @Column({ type: 'jsonb', default: [] })
  supportedFeatures: string[];

  @Column({ type: 'jsonb', default: [] })
  transferMethods: {
    id: string;
    type: string;
    name: string;
    localizedNames?: Record<string, string>;
    supportedCurrencies: string[];
    minimumAmount: number;
    maximumAmount: number;
    processingTime: string;
    requirements: string[];
    fees: {
      type: string;
      value: number;
      currency: string;
      description?: string;
    }[];
    metadata?: Record<string, any>;
  }[];

  @Column({ type: 'jsonb', nullable: true })
  requirements: {
    documentTypes?: string[];
    verificationType?: string;
    addressFormat?: {
      required: string[];
      optional: string[];
    };
    idNumberFormat?: string;
    phoneNumberFormat?: string;
    restrictions?: {
      minAge?: number;
      maxDailyTransactions?: number;
      maxMonthlyVolume?: number;
    };
  };

  @Column({ type: 'jsonb', nullable: true })
  complianceInfo: {
    kycRequired: boolean;
    sanctionsChecks: boolean;
    restrictedActivities?: string[];
    regulatoryAuthorities?: string[];
    licenseRequired?: boolean;
  };

  @Column({ default: true })
  @Index()
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    timezone?: string;
    region?: string;
    subRegion?: string;
    dialCode?: string;
    flagEmoji?: string;
    riskLevel?: string;
    supportContact?: {
      email?: string;
      phone?: string;
      hours?: string;
    };
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastVerifiedAt: Date;

  @Column({ nullable: true })
  verifiedBy: string;
}
