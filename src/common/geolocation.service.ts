// src/common/services/geolocation.service.ts
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class GeolocationService {
  private readonly logger = new Logger(GeolocationService.name);

  async getLocationFromIp(ipAddress: string): Promise<string> {
    // For localhost, an IP lookup isn't possible. You can return a mock location.
    if (ipAddress === '::1' || ipAddress === '127.0.0.1') {
      return 'Localhost';
    }

    try {
      // Use a reliable, free-tier IP geolocation service like ipapi.co
      const response = await axios.get(`https://ipapi.co/${ipAddress}/json/`);
      const { city, country_name } = response.data;
      if (city && country_name) {
        return `${city}, ${country_name}`;
      } else {
        return country_name || 'Unknown';
      }
    } catch (error) {
      this.logger.error(
        `Geolocation lookup failed for IP ${ipAddress}: ${error.message}`,
      );
      return 'Unknown';
    }
  }
}
