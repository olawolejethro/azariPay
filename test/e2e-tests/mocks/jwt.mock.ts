// test/mocks/jwt-auth-guard.mock.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtAuthGuardMock {
  // Just return true for all requests in tests
  canActivate() {
    return true;
  }
}
