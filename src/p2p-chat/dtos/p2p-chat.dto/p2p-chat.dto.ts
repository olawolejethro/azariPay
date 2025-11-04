export class P2pChatDto {}
// src/p2p-chat/dtos/p2p-chat.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsEnum,
  IsUUID,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  TradeStatus,
  MessageType,
} from '../../entities/p2p-chat.entity/p2p-chat.entity';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMessageDto {
  @ApiProperty({
    description: 'The content of the message',
    example: 'I will be sending the payment now.',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ description: 'user ID', example: 123 })
  @IsNumber()
  @IsOptional()
  otherUserId?: number;

  @ApiProperty({
    description: 'The type of message',
    enum: MessageType,
    default: MessageType.USER,
    required: false,
  })
  @IsEnum(MessageType)
  @IsOptional()
  type?: MessageType;

  @ApiProperty({
    description: 'Optional metadata for the message',
    required: false,
    type: Object,
    example: { key: 'value' },
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateTradeStatusDto {
  @ApiProperty({
    description: 'The new status of the trade',
    enum: TradeStatus,
  })
  @IsEnum(TradeStatus)
  status: TradeStatus;

  @ApiProperty({
    description: 'Optional metadata for the status update',
    required: false,
    type: Object,
    example: { reason: 'Payment completed' },
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class PaginationQueryDto {
  @ApiProperty({
    description: 'Number of items per page',
    default: 20,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiProperty({
    description: 'Page number (starts at 1)',
    default: 1,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;
}
