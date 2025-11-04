// dto/address-search.dto.ts
import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class AddressSearchDto {
  @ApiProperty({ description: 'Search term for address lookup' })
  @IsString()
  q: string;

  @ApiProperty({
    description: 'Country code (ISO2)',
    default: 'CA',
    required: false,
  })
  @IsOptional()
  @IsString()
  country?: string = 'CA';

  @ApiProperty({
    description: 'Maximum number of results',
    default: 10,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

export class CitySearchDto {
  @ApiProperty({ description: 'City name to search for' })
  @IsString()
  q: string;

  @ApiProperty({ description: 'Two-letter province code (e.g., ON, BC)' })
  @IsString()
  province: string;
}

// dto/address-response.dto.ts
export class AddressSearchResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  text: string;

  @ApiProperty()
  highlight: string;

  @ApiProperty()
  cursor: number;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: ['Find', 'Retrieve'] })
  next: 'Find' | 'Retrieve';
}

export class AddressDetailsResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  formattedAddress: string;

  @ApiProperty()
  street: string;

  @ApiProperty()
  city: string;

  @ApiProperty()
  province: string;

  @ApiProperty()
  provinceCode: string;

  @ApiProperty()
  postalCode: string;

  @ApiProperty()
  countryName: string;

  @ApiProperty()
  countryIso2: string;

  @ApiProperty({ required: false })
  buildingNumber?: string;

  @ApiProperty({ required: false })
  company?: string;
}

export class ProvinceDto {
  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;
}

export class PostalCodeValidationDto {
  @ApiProperty()
  postalCode: string;

  @ApiProperty()
  isValid: boolean;

  @ApiProperty()
  format: string;
}
