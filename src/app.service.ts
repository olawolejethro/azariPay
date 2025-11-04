import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  /**
   * Generates an HMAC-SHA512 hash for AptPay API requests
   * @param requestBody The request body as an object
   * @param secretKey The AptPay secret key
   * @returns The generated hash as a hex string
   */
  generateBodyHash(requestBody: Record<any, any>, secretKey: string): string {
    const requestBodyString = JSON.stringify(requestBody);

    const bodyHash: string = crypto
      .createHmac('sha512', secretKey)
      .update(requestBodyString)
      .digest('hex');

    return bodyHash;
  }

  calculateHmacSha512(payload: string, secretKey: string): string {
    return crypto.createHmac('sha512', secretKey).update(payload).digest('hex');
  }
  /**
   * Example method to create a transaction hash
   */
  createTransactionHash(): string {
    // The payload JSON string
    const payload = JSON.stringify({
      individual: true,
      first_name: 'Test',
      last_name: 'Testington',
      dateOfBirth: '1988-01-01',
      country: 'CA',
      street: 'DONORA DR',
      city: 'Toronto',
      zip: 'M4B 1B3',
      clientId: 1,
    });

    const secretKey = 'e*vM!ONuH6aem-G';

    return this.calculateHmacSha512(payload, secretKey);
  }
}
