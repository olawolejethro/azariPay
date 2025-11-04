import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { P2POrderStatus } from './update-p2p-seller.dto';
import { Transform, Type } from 'class-transformer';
export class GetSellerOrdersFilterDto {
  @IsOptional()
  @IsEnum(P2POrderStatus)
  @ApiProperty({
    enum: P2POrderStatus,
    required: false,
    description: 'Filter by order status',
    example: 'OPEN',
  })
  status?: P2POrderStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @ApiProperty({
    required: false,
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Number of orders per page',
  })
  limit?: number = 20;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({
    required: false,
    default: 1,
    minimum: 1,
    description: 'Page number',
  })
  page?: number = 1;

  @IsOptional()
  @IsEnum(['createdAt', 'updatedAt', 'exchangeRate'])
  @ApiProperty({
    enum: ['createdAt', 'updatedAt', 'exchangeRate'],
    required: false,
    default: 'createdAt',
    description: 'Sort by field',
  })
  sortBy?: 'createdAt' | 'updatedAt' | 'exchangeRate' = 'createdAt';

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @ApiProperty({
    type: 'boolean',
    required: false,
    description: 'Filter by orders awaiting seller response',
    example: true,
  })
  awaitingSeller?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @ApiProperty({
    type: 'boolean',
    required: false,
    description: 'Filter by orders with active negotiations',
    example: false,
  })
  isNegotiating?: boolean;

  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  @ApiProperty({
    enum: ['ASC', 'DESC'],
    required: false,
    default: 'DESC',
    description: 'Sort order',
  })
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
