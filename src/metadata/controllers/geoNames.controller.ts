// canada-location.controller.ts
import {
  Controller,
  Get,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { CanadaLocationService } from '../services/geoNames.service';

interface Province {
  geonameId: number;
  name: string;
  countryCode: string;
  lat: number;
  lng: number;
}
@ApiTags('GeoNames Location Lookup')
@Controller('api/v1/location')
export class CanadaLocationController {
  constructor(private readonly locationService: CanadaLocationService) {}

  @Get('provinces')
  @ApiOperation({ summary: 'Fetch provinces in Canada from GeoNames' })
  @ApiResponse({ status: 200, description: 'List of provinces in Canada' })
  async getProvinces(): Promise<{ status: string; data: Province[] }> {
    try {
      // Await the asynchronous call to fetch provinces
      const provinces = await this.locationService.getProvincesFromGeoNames();

      // Return wrapped response with the fetched data
      return {
        status: 'success', // You can add metadata here if needed
        data: provinces.data, // Access the actual data from the response
      };
    } catch (error) {
      // Handle errors if the service call fails
      throw new HttpException(
        `Failed to fetch provinces: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('cities')
  @ApiOperation({
    summary: 'Fetch cities and towns in a Canadian province from GeoNames',
  })
  @ApiQuery({
    name: 'provinceCode',
    description: 'Province code (GeoNames adminCode1)',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'List of cities and towns in the province',
  })
  async getCities(@Query('provinceCode') provinceCode: string) {
    if (!provinceCode) {
      throw new HttpException(
        'provinceCode is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // Await the result from getCitiesFromGeoNames
      const citiesResponse =
        await this.locationService.getCitiesFromGeoNames(provinceCode);

      // Return wrapped response with status and data
      return {
        status: 'success',
        data: citiesResponse.data, // Wrap the cities inside the data field
      };
    } catch (error) {
      throw new HttpException(
        `Failed to fetch cities: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('validate-postal-location')
  @ApiOperation({
    summary:
      'Validate if a postal code matches a city and province using GeoNames',
  })
  @ApiQuery({
    name: 'postalCode',
    description: 'Canadian postal code',
    required: true,
  })
  @ApiQuery({ name: 'city', description: 'City name', required: true })
  @ApiQuery({
    name: 'provinceCode',
    description: 'Province code (GeoNames adminCode1)',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Validation result' })
  async validatePostalMatch(
    @Query('postalCode') postalCode: string,
    @Query('city') city: string,
    @Query('provinceCode') provinceCode: string,
  ) {
    const provinceMap: Record<string, string> = {
      '01': 'AB',
      '02': 'BC',
      '03': 'MB',
      '04': 'NB',
      '05': 'NL',
      '07': 'NS',
      '08': 'ON',
      '09': 'PE',
      '10': 'QC',
      '11': 'SK',
      '12': 'YT',
      '13': 'NT',
      '14': 'NU',
    };

    const expectedProvinceIso = provinceMap[provinceCode];
    if (!expectedProvinceIso) {
      throw new HttpException('Invalid provinceCode', HttpStatus.BAD_REQUEST);
    }

    return this.locationService.validatePostalWithGeoNames(
      postalCode,
      city,
      expectedProvinceIso,
    );
  }
}
