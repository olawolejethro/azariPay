// canada-location.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

interface Province {
  geonameId: number;
  name: string;
  countryCode: string;
  lat: number;
  lng: number;
}
@Injectable()
export class CanadaLocationService {
  private readonly geonamesUser: string;

  constructor(private readonly configService: ConfigService) {
    this.geonamesUser = this.configService.get<string>('GEONAMES_USERNAME');
    if (!this.geonamesUser) {
      throw new Error('GEONAMES_USERNAME is required in environment variables');
    }
  }

  async getProvincesFromGeoNames(): Promise<{
    status: string;
    data: Province[];
  }> {
    try {
      const response = await axios.get(
        'https://secure.geonames.org/childrenJSON',
        {
          params: {
            geonameId: 6251999, // Canada
            username: this.geonamesUser,
          },
        },
      );

      const provinces: Province[] = response.data.geonames || [];
      return {
        status: 'success',
        data: provinces,
      };
    } catch (error) {
      console.error(`Error fetching provinces: ${error.message}`);
      throw new HttpException(
        `Failed to fetch provinces: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async getCitiesFromGeoNames(
    provinceCode: string,
  ): Promise<{ status: string; data: any[] }> {
    try {
      const cities: any[] = [];
      let startRow = 0;
      let hasMore = true;

      while (hasMore) {
        const response = await axios.get(
          'https://secure.geonames.org/searchJSON',
          {
            params: {
              country: 'CA',
              adminCode1: provinceCode,
              featureClass: 'P',
              maxRows: 1000,
              startRow,
              username: this.geonamesUser,
            },
          },
        );

        const results = response.data.geonames || [];
        cities.push(...results);

        startRow += 1000;
        hasMore = results.length === 1000;
      }

      // Return wrapped response with status and cities data
      return {
        status: 'success',
        data: cities,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to fetch cities: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async validatePostalWithGeoNames(
    postalCode: string,
    city: string,
    provinceCode: string,
  ): Promise<{
    postalCode: string;
    city: string;
    provinceCode: string;
    isMatch: boolean;
    message: string;
  }> {
    try {
      const response = await axios.get(
        'https://secure.geonames.org/postalCodeSearchJSON',
        {
          params: {
            postalcode: postalCode,
            country: 'CA',
            maxRows: 10,
            username: this.geonamesUser,
          },
        },
      );

      console.log(
        `GeoNames response for postal code ${postalCode}:`,
        response.data,
      );

      const results = response.data.postalCodes || [];

      // Normalize the input for comparison
      const normalizedCity = city.toLowerCase().replace(/\s+/g, '');
      const normalizedProvince = provinceCode.toLowerCase();

      // Debug (optional): log the results
      // console.log(JSON.stringify(results, null, 2));

      const match = results.find((r) => {
        const place = (r.placeName || '').toLowerCase().replace(/\s+/g, '');
        const admin = (r.adminCode1 || '').toLowerCase();

        // Loose match: place name should contain city string OR be equal
        const isCityMatch =
          place.includes(normalizedCity) || normalizedCity.includes(place);

        const isProvinceMatch = admin === normalizedProvince;

        return isCityMatch && isProvinceMatch;
      });

      return {
        postalCode,
        city,
        provinceCode,
        isMatch: !!match,
        message: match
          ? 'Postal code matches the city and province'
          : `Postal code doesn't match the selected province`,
      };
    } catch (error) {
      if (error.response) {
        throw new HttpException(
          `GeoNames API error: ${error.response.data?.status?.message || error.message}`,
          HttpStatus.BAD_REQUEST,
        );
      } else if (error.request) {
        throw new HttpException(
          `No response from GeoNames API: ${error.message}`,
          HttpStatus.BAD_GATEWAY,
        );
      } else {
        throw new HttpException(
          `Failed to validate postal code: ${error.message}`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }
}
