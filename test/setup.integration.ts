// test/setup.integration.ts

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { JwtAuthGuardMock } from './e2e-tests/mocks/auth-guard.mock';

// Determine the absolute path to the .env.test.local file
const envFilePath = path.resolve(__dirname, '../.env.test.local');
dotenv.config({ path: envFilePath });

// Set test-specific environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRATION = '1h';
process.env.JWT_REFRESH_EXPIRATION = '7d';

// Increase test timeout
jest.setTimeout(30000);

// Mock the JWT Auth Guard to always return true (allow all requests)
jest.mock('../src/auth/guards/jwt-auth.guard', () => {
  return {
    JwtAuthGuard: jest.fn().mockImplementation(() => {
      return {
        canActivate: (context) => {
          // Get the request object
          const request = context.switchToHttp().getRequest();

          // Set the user in the request (this is what passport would normally do)
          request.user = {
            userId: 1,
            phoneNumber: '+1-888-999-4810',
          };

          return true;
        },
      };
    }),
  };
});
// Mock bcryptjs for password operations
jest.mock('bcryptjs', () => {
  return {
    hash: jest
      .fn()
      .mockImplementation((password) => Promise.resolve(`hashed_${password}`)),
    compare: jest.fn().mockImplementation(() => Promise.resolve(true)),
  };
});
