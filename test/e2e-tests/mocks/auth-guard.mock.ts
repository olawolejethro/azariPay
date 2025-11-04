// test/mocks/jwt-auth-guard.mock.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuardMock implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Get the request from context
    const request = context.switchToHttp().getRequest();

    // Extract authorization header
    const authHeader = request.headers.authorization;

    if (authHeader && authHeader.split(' ')[0] === 'Bearer') {
      const token = authHeader.split(' ')[1];

      // For testing, we'll just set a mock user in the request
      // In a real guard, we'd validate the token
      request.user = {
        userId: 1,
        phoneNumber: '+1-888-999-1234',
      };

      return true;
    }

    return false;
  }
}
