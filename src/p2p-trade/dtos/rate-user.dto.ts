import {
  IsNumber,
  IsString,
  IsOptional,
  Min,
  Max,
  IsInt,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RateUserDto {
  @ApiProperty({ description: 'User ID being rated' })
  @IsNotEmpty()
  @IsNumber()
  ratedUserId: number;

  @ApiProperty({ description: 'Trade ID for this rating', required: false })
  @IsNotEmpty()
  @IsNumber()
  tradeId?: number;

  @ApiProperty({
    description: 'Rating value (1-5 stars)',
    minimum: 1,
    maximum: 5,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsNotEmpty()
  rating: number;

  @ApiProperty({ description: 'Optional feedback text', required: false })
  @IsOptional()
  @IsString()
  feedback?: string;
}
