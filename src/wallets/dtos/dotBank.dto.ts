import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VirtualAccountDto {
  @ApiProperty({
    example: '1990-05-15',
    description: 'Date of birth in YYYY-MM-DD format',
  })
  @IsString()
  @IsNotEmpty()
  dateOfBirth: string;

  @ApiProperty({
    example: 'CUST-12345',
    description: 'External identifier for the customer',
  })
  @IsString()
  @IsNotEmpty()
  externalId: string;

  @ApiProperty({
    example: 'John',
    description: 'First name of the account holder',
  })
  @IsString()
  @IsNotEmpty()
  firstname: string;

  @ApiProperty({
    example: 'MALE',
    description: 'Gender of the account holder',
    enum: ['MALE', 'FEMALE'],
  })
  @IsEnum(['MALE', 'FEMALE'])
  @IsNotEmpty()
  gender: string;

  @ApiProperty({
    example: 'Doe',
    description: 'Last name of the account holder',
  })
  @IsString()
  @IsNotEmpty()
  lastname: string;
}

export class AccountPartyDto {
  @ApiProperty({ example: '0123456789', description: 'Account number' })
  @IsString()
  @IsNotEmpty()
  accountNo: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'Full name of the account holder',
  })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ example: '044', description: 'Bank code' })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({
    example: 'Payment for services',
    description: 'Transaction narration',
  })
  @IsString()
  @IsNotEmpty()
  narration: string;

  @ApiProperty({ example: '1', description: 'KYC level of the account' })
  @IsString()
  @IsNotEmpty()
  kycLevel: string;

  @ApiProperty({
    example: '12345678901',
    description: 'Bank Verification Number (BVN)',
  })
  @IsString()
  @IsNotEmpty()
  bankVerificationNumber: string;
}

export enum TransactionChannel {
  TELLER = 'TELLER',
  INTERNET_BANKING = 'INTERNET_BANKING',
  MOBILE = 'MOBILE',
  POS = 'POS',
  ATM = 'ATM',
  WEB = 'WEB',
  USSD = 'USSD',
  CORPORATE = 'CORPORATE',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA',
  AGENCY_BANKING = 'AGENCY_BANKING',
  VIRTUAL_ACCOUNT = 'VIRTUAL_ACCOUNT',
  THIRD_PARTY = 'THIRD_PARTY',
  OTHERS = 'OTHERS',
  NQR = 'NQR',
}

export class PaymentTransactionDto {
  @ApiProperty({ example: 1000, description: 'Transaction amount' })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({
    example: 'Payment for services',
    description: 'Transaction remarks',
  })
  @IsString()
  @IsNotEmpty()
  remarks: string;

  @ApiProperty({
    example: 'INTERNET_BANKING',
    description: 'Transaction channel',
    enum: TransactionChannel,
  })
  @IsEnum(TransactionChannel)
  @IsNotEmpty()
  channel: TransactionChannel;

  @ApiProperty({
    example: 'TXN-12345',
    description: 'Unique transaction reference',
  })
  @IsString()
  @IsNotEmpty()
  transactionRef: string;

  @ApiProperty({ example: '0123456789', description: 'Source account number' })
  @IsString()
  @IsNotEmpty()
  sourceAccountNo: string;

  @ApiProperty({ example: 'TRANSFER', description: 'Transaction category' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({
    example: 'Lagos, Nigeria',
    description: 'Transaction location',
  })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({ description: 'Sender account details' })
  @ValidateNested()
  @Type(() => AccountPartyDto)
  @IsNotEmpty()
  sender: AccountPartyDto;

  @ApiProperty({ description: 'Beneficiary account details' })
  @ValidateNested()
  @Type(() => AccountPartyDto)
  @IsNotEmpty()
  beneficiary: AccountPartyDto;
}
