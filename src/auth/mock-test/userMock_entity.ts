// src/auth/test/mocks/user.entity.mock.ts

import { UserRole } from '../entities/user.entity';

export class MockUser {
  id: number;
  phoneNumber: string;
  password: string;
  loginAttempts: number = 0;
  lockUntil: Date | null = null;
  firstName: string | null = null;
  lastName: string | null = null;
  interacEmailAddress: string | null = null;
  address: string | null = null;
  dateOfBirth: string | null = null;
  role: UserRole = UserRole.USER;
  onboardingAuthorizationToken: string | null = null;
  kycStatus: string | null = null;
  kycResponse: string[] = [];
  kycAdditionalInfo: string | null = null;
  ApplicantId: string | null = null;
  kycCompleted: boolean = false;
  kycCompletedAt: Date | null = null;
  kycStarted: boolean = false;
  kycStartedAt: Date | null = null;
  kycTrials: number = 0;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(partial?: Partial<MockUser>) {
    Object.assign(this, partial);
  }
}
