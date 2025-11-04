// src/modules/geographic/controllers/geographic.controller.ts

import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiOkResponse,
} from '@nestjs/swagger';
import axios from 'axios';
import {
  GeographicService,
  PopulatedPlace,
} from '../services/geographic.service';

interface GeographicResponse {
  success: boolean;
  count: number;
  data: PopulatedPlace[];
  source: string;
  province?: string;
}

interface StatisticsResponse {
  success: boolean;
  data: {
    total: number;
    cities: number;
    towns: number;
    villages: number;
    other: number;
  };
  province?: string;
}

@Controller('api/v1/geographic')
@ApiTags('Geographic Data')
export class GeographicController {
  constructor(private readonly geographicService: GeographicService) {}

  @Get('places')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all populated places (cities, towns, villages, hamlets)',
    description:
      'Retrieves comprehensive list of all populated places from official Canadian Geographic Names Database',
  })
  @ApiQuery({
    name: 'province',
    required: false,
    description: 'Province code (e.g., ON, BC, AB)',
    type: String,
  })
  @ApiOkResponse({
    description: 'Successfully retrieved populated places',
    schema: {
      example: {
        success: true,
        count: 1523,
        data: [
          {
            id: 'EXAMPLE123',
            name: 'Bowmanville',
            type: 'town',
            province_code: 'ON',
            province_name: 'Ontario',
            latitude: 43.9128,
            longitude: -78.6928,
            concise: 'TOWN',
            official: true,
            source: 'CGNDB',
          },
        ],
        source: 'Official Canadian Government Data (CGNDB)',
        province: 'ON',
      },
    },
  })
  async getAllPlaces(
    @Query('province') province?: string,
  ): Promise<GeographicResponse> {
    if (province && !this.isValidProvinceCode(province)) {
      throw new BadRequestException(`Invalid province code: ${province}`);
    }

    const places = await this.geographicService.getAllPopulatedPlaces(province);

    return {
      success: true,
      count: places.length,
      data: places,
      source: 'Official Canadian Government Data (CGNDB)',
      ...(province && { province: province.toUpperCase() }),
    };
  }

  @Get('cities')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all cities',
    description: 'Retrieves only places classified as cities',
  })
  @ApiQuery({
    name: 'province',
    required: false,
    description: 'Province code (e.g., ON, BC, AB)',
    type: String,
  })
  @ApiOkResponse({ description: 'Successfully retrieved cities' })
  async getCities(
    @Query('province') province?: string,
  ): Promise<GeographicResponse> {
    if (province && !this.isValidProvinceCode(province)) {
      throw new BadRequestException(`Invalid province code: ${province}`);
    }

    const cities = await this.geographicService.getCities(province);

    return {
      success: true,
      count: cities.length,
      data: cities,
      source: 'Official Canadian Government Data (CGNDB)',
      ...(province && { province: province.toUpperCase() }),
    };
  }

  @Get('towns')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all towns and villages',
    description: 'Retrieves places classified as towns or villages',
  })
  @ApiQuery({
    name: 'province',
    required: false,
    description: 'Province code (e.g., ON, BC, AB)',
    type: String,
  })
  @ApiOkResponse({ description: 'Successfully retrieved towns' })
  async getTowns(
    @Query('province') province?: string,
  ): Promise<GeographicResponse> {
    if (province && !this.isValidProvinceCode(province)) {
      throw new BadRequestException(`Invalid province code: ${province}`);
    }

    const towns = await this.geographicService.getTowns(province);

    return {
      success: true,
      count: towns.length,
      data: towns,
      source: 'Official Canadian Government Data (CGNDB)',
      ...(province && { province: province.toUpperCase() }),
    };
  }

  @Get('villages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all villages and hamlets',
    description: 'Retrieves places classified as villages or hamlets',
  })
  @ApiQuery({
    name: 'province',
    required: false,
    description: 'Province code (e.g., ON, BC, AB)',
    type: String,
  })
  @ApiOkResponse({ description: 'Successfully retrieved villages' })
  async getVillages(
    @Query('province') province?: string,
  ): Promise<GeographicResponse> {
    if (province && !this.isValidProvinceCode(province)) {
      throw new BadRequestException(`Invalid province code: ${province}`);
    }

    const villages = await this.geographicService.getVillages(province);

    return {
      success: true,
      count: villages.length,
      data: villages,
      source: 'Official Canadian Government Data (CGNDB)',
      ...(province && { province: province.toUpperCase() }),
    };
  }

  @Get('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Search for places by name',
    description:
      'Search for populated places by name with optional province filter',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Search term (place name)',
    type: String,
  })
  @ApiQuery({
    name: 'province',
    required: false,
    description: 'Province code (e.g., ON, BC, AB)',
    type: String,
  })
  @ApiOkResponse({
    description: 'Successfully retrieved search results',
    schema: {
      example: {
        success: true,
        count: 2,
        data: [
          {
            id: 'EXAMPLE123',
            name: 'Bowmanville',
            type: 'town',
            province_code: 'ON',
            province_name: 'Ontario',
            latitude: 43.9128,
            longitude: -78.6928,
            concise: 'TOWN',
            official: true,
            source: 'CGNDB',
          },
        ],
        source: 'Official Canadian Government Data (CGNDB)',
        query: 'Bowmanville',
      },
    },
  })
  async searchPlaces(
    @Query('q') searchTerm: string,
    @Query('province') province?: string,
  ): Promise<GeographicResponse & { query: string }> {
    if (!searchTerm || searchTerm.trim().length < 2) {
      throw new BadRequestException(
        'Search term must be at least 2 characters long',
      );
    }

    if (province && !this.isValidProvinceCode(province)) {
      throw new BadRequestException(`Invalid province code: ${province}`);
    }

    const results = await this.geographicService.searchPlaces(
      searchTerm.trim(),
      province,
    );

    return {
      success: true,
      count: results.length,
      data: results,
      source: 'Official Canadian Government Data (CGNDB)',
      query: searchTerm.trim(),
      ...(province && { province: province.toUpperCase() }),
    };
  }

  @Get('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate if a place exists',
    description: 'Check if a place name exists in the official database',
  })
  @ApiQuery({
    name: 'name',
    required: true,
    description: 'Place name to validate',
    type: String,
  })
  @ApiQuery({
    name: 'province',
    required: false,
    description: 'Province code (e.g., ON, BC, AB)',
    type: String,
  })
  @ApiOkResponse({
    description: 'Validation result',
    schema: {
      example: {
        success: true,
        exists: true,
        place_name: 'Bowmanville',
        province: 'ON',
      },
    },
  })
  async validatePlace(
    @Query('name') placeName: string,
    @Query('province') province?: string,
  ): Promise<{
    success: boolean;
    exists: boolean;
    place_name: string;
    province?: string;
  }> {
    if (!placeName || placeName.trim().length < 2) {
      throw new BadRequestException(
        'Place name must be at least 2 characters long',
      );
    }

    if (province && !this.isValidProvinceCode(province)) {
      throw new BadRequestException(`Invalid province code: ${province}`);
    }

    const exists = await this.geographicService.validatePlace(
      placeName.trim(),
      province,
    );

    return {
      success: true,
      exists,
      place_name: placeName.trim(),
      ...(province && { province: province.toUpperCase() }),
    };
  }

  @Get('statistics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get statistics about populated places',
    description: 'Get counts of different types of populated places',
  })
  @ApiQuery({
    name: 'province',
    required: false,
    description: 'Province code (e.g., ON, BC, AB)',
    type: String,
  })
  @ApiOkResponse({
    description: 'Statistics about populated places',
    schema: {
      example: {
        success: true,
        data: {
          total: 1523,
          cities: 45,
          towns: 234,
          villages: 678,
          other: 566,
        },
        province: 'ON',
      },
    },
  })
  async getStatistics(
    @Query('province') province?: string,
  ): Promise<StatisticsResponse> {
    if (province && !this.isValidProvinceCode(province)) {
      throw new BadRequestException(`Invalid province code: ${province}`);
    }

    const stats = await this.geographicService.getPlaceStatistics(province);

    return {
      success: true,
      data: stats,
      ...(province && { province: province.toUpperCase() }),
    };
  }

  @Get('debug')
  //   @HttpCode(HttpStatus.OK)
  //   @ApiOperation({
  //     summary: 'Debug CGNDB API response',
  //     description: 'Test the CGNDB API and see raw response (for development only)'
  //   })
  //   @ApiQuery({
  //     name: 'province',
  //     required: false,
  //     description: 'Province code (e.g., ON, BC, AB)',
  //     type: String,
  //   })
  //   async debugCGNDB(@Query('province') province?: string) {
  //     try {
  //       // Make direct API call to test
  //       const params = new URLSearchParams({
  //         theme: '984',
  //         maxrows: '10'
  //       });

  //       if (province) {
  //         const provinceMap: Record<string, string> = {
  //           'AB': '48', 'BC': '59', 'MB': '46', 'NB': '13',
  //           'NL': '10', 'NS': '12', 'NT': '61', 'NU': '62',
  //           'ON': '35', 'PE': '11', 'QC': '24', 'SK': '47', 'YT': '60'
  //         };
  //         params.append('province', provinceMap[province.toUpperCase()]);
  //       }

  //       const url = `https://geogratis.gc.ca/services/geoname/en/geonames.json?${params}`;

  //       const response = await axios.get(url, {
  //         timeout: 10000,
  //         headers: {
  //           'User-Agent': 'BongoPay-FinTech/1.0',
  //           'Accept': 'application/json'
  //         }
  //       });

  //       return {
  //         success: true,
  //         url: url,
  //         status: response.status,
  //         headers: response.headers,
  //         dataType: typeof response.data,
  //         dataKeys: response.data ? Object.keys(response.data) : [],
  //         isArray: Array.isArray(response.data),
  //         sampleData: JSON.stringify(response.data).substring(0, 500),
  //         fullResponse: response.data
  //       };
  //     } catch (error) {
  //       return {
  //         success: false,
  //         error: error.message,
  //         url: error.config?.url,
  //         status: error.response?.status,
  //         responseData: error.response?.data
  //       };
  //     }
  //   }

  /**
   * Validate province code
   */
  private isValidProvinceCode(code: string): boolean {
    const validCodes = [
      'AB',
      'BC',
      'MB',
      'NB',
      'NL',
      'NS',
      'NT',
      'NU',
      'ON',
      'PE',
      'QC',
      'SK',
      'YT',
    ];
    return validCodes.includes(code.toUpperCase());
  }
}
