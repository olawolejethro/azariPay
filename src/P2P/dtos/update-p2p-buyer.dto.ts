// src/P2P/dto/update-p2p-buyer.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateP2PBuyerDto } from './create-p2p-buyer.dto';

export enum P2POrderStatus {
  PENDING = 'PENDING',
  MATCHED = 'MATCHED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class UpdateP2PBuyerDto extends PartialType(CreateP2PBuyerDto) {
  @ApiProperty({
    description: 'Order active status',
    required: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description: 'Order status',
    required: false,
    enum: P2POrderStatus,
    example: 'PENDING',
  })
  @IsOptional()
  @IsEnum(P2POrderStatus)
  status?: P2POrderStatus;
}
