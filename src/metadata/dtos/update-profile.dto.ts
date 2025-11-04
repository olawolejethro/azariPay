// src/auth/dto/update-profile.dto.ts
import {
  IsOptional,
  IsString,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

class AddressDto {
  @ApiPropertyOptional({ example: '123 Main St' })
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional({ example: 'Apt 4B' })
  @IsOptional()
  @IsString()
  apartmentNumber?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Lagos State' })
  @IsOptional()
  @IsString()
  stateProvince?: string;

  @ApiPropertyOptional({ example: '100001' })
  @IsOptional()
  @IsString()
  zipCode?: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  lastName?: string;

  address?: any; // Add

  // @ApiPropertyOptional({ type: AddressDto })
  // @IsOptional()
  // @IsObject()
  // @ValidateNested()
  // @Type(() => AddressDto)
  // address?: AddressDto;
}
