import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export enum DisputeResolution {
  RELEASE_TO_BUYER = 'release_to_buyer',
  REFUND_TO_SELLER = 'refund_to_seller',
  PARTIAL_RELEASE = 'partial_release',
}

export class CreateDisputeDto {
  @IsString()
  @MaxLength(50)
  transactionType: string;

  @Transform(({ value }) => parseFloat(value)) // Transform string to number
  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  tradeId: string;

  @IsString()
  @MaxLength(2000)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  additionalInfo?: string;

  // This will be populated by the controller after file upload
  @IsOptional()
  @IsArray()
  screenshots?: string[];
}

export class ResolveDisputeDto {
  @ApiProperty({ enum: DisputeResolution })
  @IsEnum(DisputeResolution)
  resolution: DisputeResolution;

  @ApiProperty()
  @IsString()
  adminComment: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  buyerAmount?: number; // For partial release

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  sellerAmount?: number; // For partial release
}
