import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class SumsubService {
  private readonly logger = new Logger(SumsubService.name);
  private readonly baseURL =
    process.env.SUMSUB_API_URL || 'https://api.sumsub.com';
  private readonly appToken = process.env.SUMSUB_APP_TOKEN;
  private readonly appSecret = process.env.SUMSUB_SECRET_KEY;

  constructor() {
    // Validate required environment variables
    if (!this.appToken || !this.appSecret) {
      this.logger.error('Missing required Sumsub environment variables');
      throw new Error(
        'SUMSUB_APP_TOKEN and SUMSUB_APP_SECRET must be set in environment variables',
      );
    }

    this.logger.log('Sumsub service initialized successfully');
    this.logger.log(`Using Sumsub API URL: ${this.baseURL}`);
  }

  /**
   * Creates the signature for Sumsub API authentication
   */
  private createSignature = (config: any) => {
    const ts = Math.floor(Date.now() / 1000);
    const method = config.method.toUpperCase();
    const url = config.url;

    // Build signature string according to Sumsub documentation
    let signatureString = `${ts}${method}${url}`;

    // Add body for POST/PUT requests, skip for GET requests
    if (method !== 'GET' && config.data) {
      const body =
        typeof config.data === 'string'
          ? config.data
          : JSON.stringify(config.data);
      signatureString += body;
    }

    // Generate HMAC-SHA256 signature (must be lowercase)
    const signature = crypto
      .createHmac('sha256', this.appSecret)
      .update(signatureString)
      .digest('hex')
      .toLowerCase();

    // Add authentication headers
    config.headers['X-App-Access-Ts'] = ts.toString();
    config.headers['X-App-Access-Sig'] = signature;

    this.logger.debug(`Signature created for ${method} ${url}`);
    this.logger.debug(`Timestamp: ${ts}`);
    this.logger.debug(`Signature string: ${signatureString}`);
    this.logger.debug(`Generated signature: ${signature}`);

    return config;
  };

  /**
   * Generates an access token for performing verification checks (using SDK endpoint)
   */
  async getAccessToken(
    userId: string,
    levelName: string,
    ttlInSecs: number = 1200,
    applicantEmail?: string,
    applicantPhone?: string,
  ): Promise<{ data: any }> {
    try {
      // Create axios instance with interceptor
      const axiosInstance = axios.create({
        baseURL: this.baseURL,
      });

      // Add request interceptor for signature
      axiosInstance.interceptors.request.use(this.createSignature, (error) =>
        Promise.reject(error),
      );

      // Use the SDK endpoint with JSON body
      const url = `/resources/accessTokens/sdk`;

      // Prepare request body
      const requestBody = {
        userId: userId,
        levelName: levelName,
        ttlInSecs: ttlInSecs,
        ...(applicantEmail || applicantPhone
          ? {
              applicantIdentifiers: {
                ...(applicantEmail && { email: applicantEmail }),
                ...(applicantPhone && { phone: applicantPhone }),
              },
            }
          : {}),
      };

      this.logger.log(
        `Requesting SDK access token for user: ${userId}, level: ${levelName}`,
      );

      const response = await axiosInstance.post(url, requestBody, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-App-Token': this.appToken,
        },
      });

      this.logger.log(
        `Access token generated successfully for user: ${userId}`,
      );
      return { data: response.data };
    } catch (error) {
      this.logger.error(
        `Sumsub API error: ${JSON.stringify({
          error: error.response?.data,
          status: error.response?.status,
          timestamp: new Date().toISOString(),
        })}`,
      );

      throw new BadRequestException(
        error.response?.data?.description || 'Failed to generate access token',
      );
    }
  }

  /**
   * Alternative method using direct axios call without interceptor
   */
  async getAccessTokenDirect(
    userId: string,
    levelName: string,
    ttlInSecs: number = 1200,
  ): Promise<{ data: any }> {
    try {
      const method = 'GET';
      const url = `/resources/accessTokens?userId=${encodeURIComponent(userId)}&ttlInSecs=${ttlInSecs}&levelName=${encodeURIComponent(levelName)}`;
      const body = '';
      const ts = Math.floor(Date.now() / 1000);

      // Create signature string: timestamp + method + url + body
      const signatureString = `${ts}${method}${url}${body}`;

      // Generate HMAC-SHA256 signature
      const signature = crypto
        .createHmac('sha256', this.appSecret)
        .update(signatureString)
        .digest('hex');

      const headers = {
        Accept: 'application/json',
        'X-App-Token': this.appToken,
        'X-App-Access-Ts': ts.toString(),
        'X-App-Access-Sig': signature,
      };

      this.logger.debug(`Direct request signature details:`);
      this.logger.debug(`Method: ${method}`);
      this.logger.debug(`URL: ${url}`);
      this.logger.debug(`Body: "${body}"`);
      this.logger.debug(`Timestamp: ${ts}`);
      this.logger.debug(`Signature string: "${signatureString}"`);
      this.logger.debug(`Generated signature: ${signature}`);

      const response = await axios.get(`${this.baseURL}${url}`, { headers });

      this.logger.log(
        `Access token generated successfully for user: ${userId}`,
      );
      return { data: response.data };
    } catch (error) {
      this.logger.error(
        `Sumsub API error: ${JSON.stringify({
          error: error.response?.data,
          status: error.response?.status,
          timestamp: new Date().toISOString(),
        })}`,
      );

      throw new BadRequestException(
        error.response?.data?.description || 'Failed to generate access token',
      );
    }
  }

  /**
   * Get applicant status
   */
  async getApplicantStatus(applicantId: string): Promise<any> {
    try {
      const axiosInstance = axios.create({
        baseURL: this.baseURL,
      });

      axiosInstance.interceptors.request.use(this.createSignature, (error) =>
        Promise.reject(error),
      );

      const url = `/resources/applicants/${applicantId}/status`;

      const response = await axiosInstance.get(url, {
        headers: {
          Accept: 'application/json',
          'X-App-Token': this.appToken,
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to get applicant status: ${error.response?.data?.description}`,
      );
      throw new BadRequestException(
        error.response?.data?.description || 'Failed to get applicant status',
      );
    }
  }
}
