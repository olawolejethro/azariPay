import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFeeDto {
  @ApiProperty({ example: 'currency_conversion' })
  @IsNotEmpty()
  @IsString()
  transaction_type: string;

  @ApiProperty({ example: 'NGN' })
  @IsNotEmpty()
  @IsString()
  currency: string;

  @ApiProperty({ example: 100.0 })
  @IsNotEmpty()
  @IsNumber()
  fee_value: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  effective_from?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  effective_until?: Date;
}

export class UpdateFeeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  fee_value?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  effective_until?: Date;
}
