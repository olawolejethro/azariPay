// test/mocks/onboarding-tracking.mock.ts
import { Injectable } from '@nestjs/common';

// In-memory store for onboarding tracking data
const onboardingStore = new Map<
  number,
  {
    userId: number;
    currentStep: string;
    stepsCompleted: string[];
    progress: number;
    startedAt: Date;
    completedAt?: Date;
    metadata?: Record<string, any>;
  }
>();

@Injectable()
export class OnboardingTrackingMockService {
  /**
   * Track a signup step for a user
   */
  async trackSignupStep(
    userId: number,
    step: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const existing = onboardingStore.get(userId) || {
      userId,
      currentStep: step,
      stepsCompleted: [],
      progress: 0,
      startedAt: new Date(),
      metadata: {},
    };

    // Add step to completed if not already there
    if (!existing.stepsCompleted.includes(step)) {
      existing.stepsCompleted.push(step);
    }

    existing.currentStep = step;
    existing.metadata = { ...existing.metadata, ...metadata };
    existing.progress = this.calculateProgress(existing.stepsCompleted);

    onboardingStore.set(userId, existing);
  }

  /**
   * Track verification step for a user
   */
  async trackVerificationStep(
    userId: number,
    verificationType: string,
    status: 'started' | 'completed' | 'failed',
    metadata?: Record<string, any>,
  ): Promise<void> {
    const stepName = `verification_${verificationType}_${status}`;
    await this.trackSignupStep(userId, stepName, {
      verificationType,
      verificationStatus: status,
      ...metadata,
    });
  }

  /**
   * Get onboarding progress for a user
   */
  async getOnboardingProgress(userId: number): Promise<{
    userId: number;
    currentStep: string;
    stepsCompleted: string[];
    progress: number;
    isCompleted: boolean;
    startedAt: Date;
    completedAt?: Date;
  }> {
    const data = onboardingStore.get(userId);

    if (!data) {
      return {
        userId,
        currentStep: 'not_started',
        stepsCompleted: [],
        progress: 0,
        isCompleted: false,
        startedAt: new Date(),
      };
    }

    return {
      ...data,
      isCompleted: data.progress >= 100,
    };
  }

  /**
   * Mark onboarding as complete for a user
   */
  async completeOnboarding(
    userId: number,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const existing = onboardingStore.get(userId);

    if (existing) {
      existing.currentStep = 'completed';
      existing.progress = 100;
      existing.completedAt = new Date();
      existing.metadata = { ...existing.metadata, ...metadata };

      if (!existing.stepsCompleted.includes('completed')) {
        existing.stepsCompleted.push('completed');
      }

      onboardingStore.set(userId, existing);
    } else {
      // Create completed record if none exists
      onboardingStore.set(userId, {
        userId,
        currentStep: 'completed',
        stepsCompleted: ['completed'],
        progress: 100,
        startedAt: new Date(),
        completedAt: new Date(),
        metadata: metadata || {},
      });
    }
  }

  /**
   * Get all users' onboarding data (useful for testing)
   */
  async getAllOnboardingData(): Promise<
    Array<{
      userId: number;
      currentStep: string;
      stepsCompleted: string[];
      progress: number;
      isCompleted: boolean;
      startedAt: Date;
      completedAt?: Date;
    }>
  > {
    const results = [];

    for (const [userId, data] of onboardingStore.entries()) {
      results.push({
        ...data,
        isCompleted: data.progress >= 100,
      });
    }

    return results;
  }

  /**
   * Calculate progress percentage based on completed steps
   */
  private calculateProgress(stepsCompleted: string[]): number {
    const totalSteps = [
      'phone_verification',
      'otp_verification',
      'basic_info',
      'password_setup',
      'kyc_verification',
      'completed',
    ];

    const completedCount = stepsCompleted.filter((step) =>
      totalSteps.includes(step),
    ).length;

    return Math.min(
      Math.round((completedCount / totalSteps.length) * 100),
      100,
    );
  }

  // Helper methods for testing

  /**
   * Set test data directly (useful for test setup)
   */
  async setTestData(
    userId: number,
    data: {
      currentStep: string;
      stepsCompleted: string[];
      progress?: number;
      metadata?: Record<string, any>;
    },
  ): Promise<void> {
    onboardingStore.set(userId, {
      userId,
      currentStep: data.currentStep,
      stepsCompleted: data.stepsCompleted,
      progress: data.progress || this.calculateProgress(data.stepsCompleted),
      startedAt: new Date(),
      metadata: data.metadata || {},
    });
  }

  /**
   * Clear all test data
   */
  async clearAll(): Promise<void> {
    onboardingStore.clear();
  }

  /**
   * Clear data for specific user
   */
  async clearUser(userId: number): Promise<void> {
    onboardingStore.delete(userId);
  }

  /**
   * Check if user exists in tracking
   */
  async hasUser(userId: number): Promise<boolean> {
    return onboardingStore.has(userId);
  }

  /**
   * Get raw data for a user (for debugging)
   */
  async getRawData(userId: number): Promise<any> {
    return onboardingStore.get(userId) || null;
  }
}
