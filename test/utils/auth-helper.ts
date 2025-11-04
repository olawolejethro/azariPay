// test/utils/auth-helper.ts

import { AuthService } from '../../src/auth/services/auth.service';

export const getTestUserToken = async (
  authService: AuthService,
): Promise<string> => {
  // First create a test user
  const testUser = {
    phoneNumber: '+1-888-999-4444',
    password: 'TestPass123!',
  };

  // Register and get token
  try {
    // First try to sign in if user exists
    const signinResult = await authService.signin(testUser);
    return signinResult.data.accessToken;
  } catch (error) {
    // If user doesn't exist, create one
    await authService.signupStart({
      phoneNumber: testUser.phoneNumber,
    });

    const verifyResult = await authService.signupVerifyOtp({
      phoneNumber: testUser.phoneNumber,
      otp: 123456, // We'll need to handle this with Redis mock
      deviceId: 'test-device',
      deviceMetadata: {
        os: 'test',
        osVersion: '1.0',
        deviceManufacturer: 'test',
      },
    });

    // Complete signup with required info
    const token = verifyResult.data.onboardingAuthorizationToken;

    await authService.signupBasicInfo(1, {
      firstName: 'Test',
      lastName: 'User',
      interacEmailAddress: 'test@example.com',
      address: {
        street: '123 Test St',
        apartmentNumber: '1A',
        city: 'Test City',
        stateProvince: 'Test State',
        zipCode: '123456',
      },
      dateOfBirth: '1990-01-01',
    });

    await authService.signupPassword(1, {
      password: testUser.password,
    });

    // Now sign in to get the actual access token
    const signinResult = await authService.signin(testUser);
    return signinResult.data.accessToken;
  }
};
