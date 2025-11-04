// src/webhooks/dto/paga-payment.dto.ts

import {
  IsString,
  IsNotEmpty,
  ValidateNested,
  IsOptional,
  IsNumber,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PayerDetailsDto {
  @IsString()
  @IsOptional()
  paymentReferenceNumber: string;

  @IsString()
  @IsOptional()
  paymentMethod: string;

  @IsString()
  @IsOptional()
  payerName: string | null;

  @IsString()
  @IsOptional()
  payerBankName: string;

  @IsString()
  @IsOptional()
  payerBankAccountNumber: string | null;
}

export class PaymentNotificationDto {
  @IsString()
  @IsNotEmpty()
  statusCode: string;

  @IsString()
  @IsNotEmpty()
  statusMessage: string;

  @IsString()
  @IsNotEmpty()
  transactionReference: string;

  @IsString()
  @IsNotEmpty()
  fundingPaymentReference: string;

  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @IsString()
  @IsNotEmpty()
  accountName: string;

  @IsString()
  @IsOptional()
  financialIdentificationNumber: string | null;

  @IsString()
  @IsNotEmpty()
  amount: string;

  @IsString()
  @IsNotEmpty()
  clearingFeeAmount: string;

  @IsString()
  @IsNotEmpty()
  transferFeeAmount: string;

  @IsString()
  @IsOptional()
  transferBankName: string;

  @IsString()
  @IsOptional()
  transferBankAccountNumber: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PayerDetailsDto)
  payerDetails: PayerDetailsDto;

  @IsString()
  @IsNotEmpty()
  hash: string;
}
