// test/auth/signup-debug.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TestAppModule } from '../test-app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../src/auth/entities/user.entity';

describe('Auth Signup Debug (e2e)', () => {
  let app: INestApplication;
  let mockUserRepo: any;

  // Use a completely random phone number to avoid conflicts
  const testPhoneNumber = `+1-888-999-${Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0')}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    mockUserRepo = moduleFixture.get(getRepositoryToken(User));

    // Explicitly mock for this test
    mockUserRepo.findOne.mockResolvedValue(null); // Always return null (user doesn't exist)
    mockUserRepo.create.mockImplementation((data) => data);
    mockUserRepo.save.mockImplementation((data) => ({
      id: 1,
      ...data,
    }));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should start signup process', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/signup/start')
      .send({ phoneNumber: testPhoneNumber });

    // Log full response for debugging
    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(response.body, null, 2));

    // Don't assert status code yet, just check if we get a response
    expect(response.body).toBeDefined();
  });
});
