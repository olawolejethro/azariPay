// test/e2e-tests/mocks/geolocation.mock.ts

import { Injectable } from '@nestjs/common';

@Injectable()
export class GeolocationServiceMock {
  /**
   * Mock implementation of getLocationFromIp
   * Returns test location data for any IP address
   */
  async getLocationFromIp(ipAddress: string): Promise<{
    city: string;
    region: string;
    country: string;
    latitude?: number;
    longitude?: number;
    countryCode?: string;
    timezone?: string;
  }> {
    // Return consistent test data
    return {
      city: 'Test City',
      region: 'Test Region',
      country: 'Test Country',
      countryCode: 'TC',
      latitude: 0,
      longitude: 0,
      timezone: 'UTC',
    };
  }

  /**
   * Mock implementation of validateLocation
   * Always returns true in tests
   */
  async validateLocation(
    userLocation: any,
    requestLocation: any,
  ): Promise<boolean> {
    // In tests, always validate successfully
    return true;
  }

  /**
   * Mock implementation of getCountryFromIp
   * Returns test country code
   */
  async getCountryFromIp(ipAddress: string): Promise<string> {
    return 'TC'; // Test Country
  }

  /**
   * Mock implementation of isLocationSuspicious
   * Returns false in tests (no suspicious activity)
   */
  async isLocationSuspicious(
    userId: number,
    currentLocation: any,
  ): Promise<boolean> {
    return false;
  }

  /**
   * Mock implementation of calculateDistance
   * Returns a test distance
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    // Return a small distance for tests
    return 10; // 10 km
  }

  /**
   * Mock implementation of formatLocation
   * Returns formatted location string
   */
  formatLocation(location: any): string {
    return `${location.city}, ${location.region}, ${location.country}`;
  }
}
