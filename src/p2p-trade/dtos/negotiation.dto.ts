// src/negotiations/dtos/negotiation.dto.ts
import { IsNumber, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateNegotiationRateDto {
  @ApiProperty({ description: 'New proposed rate' })
  @IsNumber({ maxDecimalPlaces: 4 })
  proposedRate: number;

  @ApiProperty({ description: 'Optional notes', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RespondToNegotiationDto {
  @ApiProperty({ description: 'Response action', enum: ['accept', 'decline'] })
  action: 'accept';

  @ApiProperty({ description: 'Optional response notes', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
