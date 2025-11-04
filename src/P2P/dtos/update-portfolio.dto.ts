// src/P2P/dto/update-portfolio.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreatePortfolioDto } from '../dtos/portfolio.dto';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePortfolioDto extends PartialType(CreatePortfolioDto) {
  @ApiProperty({
    description: 'Portfolio active status',
    required: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
