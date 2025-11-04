// test/mocks/twilio.mock.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class TwilioMockService {
  async sendSms(to: string, message: string): Promise<any> {
    console.log(`[MOCK] SMS to ${to}: ${message}`);
    return {
      sid: 'MOCK_SID_' + Math.random().toString(36).substring(7),
      status: 'sent',
      to,
      body: message,
    };
  }
}
