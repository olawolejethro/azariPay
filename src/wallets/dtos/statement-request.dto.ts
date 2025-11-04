// src/wallets/dtos/statement-request.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

import { Transform } from 'class-transformer';

export enum StatementFormat {
  PDF = 'PDF',
  CSV = 'CSV',
}

export enum WalletType {
  CAD = 'CAD',
  NGN = 'NGN',
  ALL = 'ALL',
}

// Custom validator to check if date is not in the future
@ValidatorConstraint({ name: 'IsNotFutureDate', async: false })
export class IsNotFutureDateConstraint implements ValidatorConstraintInterface {
  validate(dateString: string, args: ValidationArguments) {
    if (!dateString) return false;

    // Get today's date at midnight (start of day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Parse the input date
    const inputDate = new Date(dateString);
    inputDate.setHours(0, 0, 0, 0);

    // Check if input date is not after today
    return inputDate <= today;
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} cannot be in the future. Please select today's date or earlier.`;
  }
}

// Alternative: Custom validator that allows today but not tomorrow
@ValidatorConstraint({ name: 'IsNotTomorrow', async: false })
export class IsNotTomorrowConstraint implements ValidatorConstraintInterface {
  validate(dateString: string, args: ValidationArguments) {
    if (!dateString) return false;

    // Get tomorrow's date at midnight
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    // Parse the input date
    const inputDate = new Date(dateString);
    inputDate.setHours(0, 0, 0, 0);

    // Check if input date is before tomorrow
    return inputDate < tomorrow;
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} cannot be tomorrow or later. Maximum allowed date is today.`;
  }
}

// Custom decorator for easier use
export function IsNotFutureDate(validationOptions?: any) {
  return Validate(IsNotFutureDateConstraint, validationOptions);
}

export function IsNotTomorrow(validationOptions?: any) {
  return Validate(IsNotTomorrowConstraint, validationOptions);
}

// Your DTO with validation
export class StatementRequestDto {
  @ApiProperty({
    description:
      'Start date for the statement (YYYY-MM-DD). Cannot be in the future.',
    example: '2024-01-01',
  })
  @IsDateString()
  @Transform(({ value }) => value.split('T')[0]) // Ensure only date part
  @IsNotFutureDate({ message: 'Start date cannot be in the future' })
  startDate: string;

  @ApiProperty({
    description: 'Wallet type to filter transactions',
    enum: WalletType,
    example: WalletType.ALL,
    default: WalletType.ALL,
  })
  @IsEnum(WalletType)
  walletType: WalletType = WalletType.ALL;

  @ApiProperty({
    description:
      'End date for the statement (YYYY-MM-DD). Cannot be in the future.',
    example: '2024-12-31',
  })
  @IsDateString()
  @Transform(({ value }) => value.split('T')[0]) // Ensure only date part
  @IsNotFutureDate({ message: 'End date cannot be in the future' })
  endDate: string;

  @ApiProperty({
    enum: StatementFormat,
    description: 'Format of the statement (PDF or CSV)',
    example: StatementFormat.PDF,
  })
  @IsEnum(StatementFormat)
  format: StatementFormat;
}
