import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';

export enum OnboardingStep {
  PHONE_VERIFICATION = 'phone_verification',
  PHONE_VERIFIED = 'phone_verified',
  BASIC_INFO = 'basic_info',
  PASSWORD_SETUP = 'password_setup',
  PIN_SETUP = 'pin_setup',
  VERIFICATION_INITIATED = 'verification_initiated',
  VERIFICATION_FAILED = 'verification_failed',
  VERIFICATION_PENDING = 'verification_pending',
  VERIFICATION_SUCCESS = 'verification_success',
  BIOMETRICS = 'biometrics',
  LIVENESS_CHECK = 'liveness_check',
  IDENTITY_VERIFICATION = 'identity_verification',
  COMPLETED = 'completed',
}

export interface OnboardingState {
  phoneNumber: string;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  userId?: number;
  sessionToken?: string;
  data: {
    phoneVerified?: boolean;
    basicInfoCompleted?: boolean;
    passwordSet?: boolean;
    livenessCompleted?: boolean;
    identityCompleted?: boolean;
    accessToken?: string;
    refreshToken?: string;
    verificationInitiated?: boolean;
    verificationId?: string;
    verificationUrl?: string;
    verificationStatus?: string;
    pinSet?: boolean;
    verificationCompleted?: boolean;
  };
  createdAt: string;
  lastUpdated: string;
}

@Injectable()
export class OnboardingTrackingService {
  private readonly ONBOARDING_TTL = 8640000; // 100 days in seconds
  private readonly KEY_PREFIX = 'onboarding';

  constructor(
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate access token
   */
  private generateAccessToken(payload: any): string {
    return this.jwtService.sign(payload, {
      expiresIn: '100d', // 100 days
      secret: this.configService.get('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * Generate refresh token
   */
  private generateRefreshToken(payload: any): string {
    return this.jwtService.sign(payload, {
      expiresIn: '7d', // 7 days
      secret: this.configService.get('JWT_REFRESH_SECRET'),
    });
  }

  /**
   * Get onboarding key for Redis
   */
  private getOnboardingKey(identifier: string): string {
    return `${this.KEY_PREFIX}:${identifier}`;
  }

  /**
   * Create initial onboarding session
   */
  async createOnboardingSession(
    phoneNumber: string,
    sessionToken: string,
  ): Promise<OnboardingState> {
    const onboardingState: OnboardingState = {
      phoneNumber,
      currentStep: OnboardingStep.PHONE_VERIFICATION,
      completedSteps: [],
      sessionToken,
      data: {},
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    await this.saveOnboardingState(phoneNumber, onboardingState);
    return onboardingState;
  }

  /**
   * Get onboarding state by phone number or session token
   */
  async getOnboardingState(
    identifier: string,
  ): Promise<OnboardingState | null> {
    try {
      const stateJson = await this.redisService
        .getClient()
        .get(this.getOnboardingKey(identifier));

      if (!stateJson) {
        return null;
      }

      return JSON.parse(stateJson) as OnboardingState;
    } catch (error) {
      console.error('Error getting onboarding state:', error);
      return null;
    }
  }

  /**
   * Save onboarding state to Redis
   */
  async saveOnboardingState(
    identifier: string,
    state: OnboardingState,
  ): Promise<void> {
    state.lastUpdated = new Date().toISOString();

    await this.redisService
      .getClient()
      .setex(
        this.getOnboardingKey(identifier),
        this.ONBOARDING_TTL,
        JSON.stringify(state),
      );
  }

  /**
   * Update onboarding step
   */
  async updateOnboardingStep(
    identifier: string,
    newStep: OnboardingStep,
    data?: Partial<OnboardingState['data']>,
  ): Promise<OnboardingState | null> {
    const currentState = await this.getOnboardingState(identifier);

    if (!currentState) {
      return null;
    }

    // Add current step to completed steps if not already there
    if (!currentState.completedSteps.includes(currentState.currentStep)) {
      currentState.completedSteps.push(currentState.currentStep);
    }

    // Update state
    currentState.currentStep = newStep;
    if (data) {
      currentState.data = { ...currentState.data, ...data };
    }

    await this.saveOnboardingState(identifier, currentState);
    return currentState;
  }

  /**
   * Mark phone as verified
   */
  async markPhoneVerified(
    phoneNumber: string,
  ): Promise<OnboardingState | null> {
    return this.updateOnboardingStep(
      phoneNumber,
      OnboardingStep.PHONE_VERIFIED,
      { phoneVerified: true },
    );
  }

  /**
   * Mark basic info completed and generate tokens
   */
  async markBasicInfoCompleted(
    phoneNumber: string,
    userId: number,
  ): Promise<OnboardingState | null> {
    const payload = {
      userId,
      phoneNumber,
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    const state = await this.updateOnboardingStep(
      phoneNumber,
      OnboardingStep.BASIC_INFO,
      {
        basicInfoCompleted: true,
        accessToken,
        refreshToken,
      },
    );

    if (state) {
      state.userId = userId;
      await this.saveOnboardingState(phoneNumber, state);
    }

    return state;
  }

  /**
   * Mark PIN setup completed
   */
  async markPinCompleted(userId: number): Promise<{
    state: OnboardingState | null;
    onboardingCompleted: boolean;
    shouldResume: boolean;
  }> {
    const state = await this.getOnboardingStateByUserId(userId);
    if (!state) {
      return {
        state: null,
        onboardingCompleted: false,
        shouldResume: false,
      };
    }

    // Update to PIN_SETUP step and mark PIN as set
    const updatedState = await this.updateOnboardingStep(
      state.phoneNumber,
      OnboardingStep.PIN_SETUP,
      { pinSet: true },
    );

    if (!updatedState) {
      return {
        state: null,
        onboardingCompleted: false,
        shouldResume: false,
      };
    }

    // Mark onboarding as completed since PIN is the final step
    const completedState = await this.updateOnboardingStep(
      state.phoneNumber,
      OnboardingStep.COMPLETED,
      {},
    );

    return {
      state: completedState,
      onboardingCompleted: true,
      shouldResume: false,
    };
  }

  /**
   * Mark verification initiated
   */
  async markVerificationInitiated(
    phoneNumber: string,
    verificationId: string,
    verificationUrl: string,
  ): Promise<OnboardingState | null> {
    return this.updateOnboardingStep(
      phoneNumber,
      OnboardingStep.VERIFICATION_INITIATED,
      {
        verificationInitiated: true,
        verificationId,
        verificationUrl,
        verificationStatus: 'pending',
      },
    );
  }

  /**
   * Mark verification as pending (user started verification)
   */
  async markVerificationPending(
    phoneNumber: string,
  ): Promise<OnboardingState | null> {
    return this.updateOnboardingStep(
      phoneNumber,
      OnboardingStep.VERIFICATION_PENDING,
      {
        verificationStatus: 'pending',
      },
    );
  }

  /**
   * Mark verification as successful
   */
  async markVerificationSuccess(
    phoneNumber: string,
  ): Promise<OnboardingState | null> {
    return this.updateOnboardingStep(
      phoneNumber,
      OnboardingStep.VERIFICATION_SUCCESS,
      {
        verificationCompleted: true,
        verificationStatus: 'success',
      },
    );
  }

  /**
   * Mark password setup completed
   */
  async markPasswordCompleted(
    phoneNumber: string,
  ): Promise<OnboardingState | null> {
    return this.updateOnboardingStep(
      phoneNumber,
      OnboardingStep.PASSWORD_SETUP,
      { passwordSet: true },
    );
  }

  /**
   * Mark verification as failed - user needs to retry
   */
  async markVerificationFailed(
    phoneNumber: string,
  ): Promise<OnboardingState | null> {
    return this.updateOnboardingStep(
      phoneNumber,
      OnboardingStep.VERIFICATION_FAILED,
      {
        verificationStatus: 'failed',
        verificationCompleted: false, // Reset so they can retry
      },
    );
  }

  /**
   * Mark liveness check completed
   */
  async markLivenessCompleted(userId: number): Promise<OnboardingState | null> {
    const state = await this.getOnboardingStateByUserId(userId);
    if (!state) return null;

    return this.updateOnboardingStep(
      state.phoneNumber,
      OnboardingStep.LIVENESS_CHECK,
      { livenessCompleted: true },
    );
  }

  /**
   * Mark identity verification completed
   */
  async markIdentityCompleted(userId: number): Promise<OnboardingState | null> {
    const state = await this.getOnboardingStateByUserId(userId);
    if (!state) return null;

    return this.updateOnboardingStep(
      state.phoneNumber,
      OnboardingStep.IDENTITY_VERIFICATION,
      { identityCompleted: true },
    );
  }

  /**
   * Complete onboarding and cleanup
   */
  async completeOnboarding(userId: number): Promise<void> {
    const state = await this.getOnboardingStateByUserId(userId);
    if (!state) return;

    // Mark as completed
    await this.updateOnboardingStep(
      state.phoneNumber,
      OnboardingStep.COMPLETED,
      {},
    );

    // Optional: Delete after short delay to allow for any final checks
    setTimeout(async () => {
      await this.deleteOnboardingState(state.phoneNumber);
    }, 60000); // Delete after 1 minute
  }

  /**
   * Get onboarding state by user ID (scan through Redis keys)
   */
  async getOnboardingStateByUserId(
    userId: number,
  ): Promise<OnboardingState | null> {
    try {
      const keys = await this.redisService
        .getClient()
        .keys(`${this.KEY_PREFIX}:*`);

      for (const key of keys) {
        const stateJson = await this.redisService.getClient().get(key);
        if (stateJson) {
          const state = JSON.parse(stateJson) as OnboardingState;
          if (state.userId === userId) {
            return state;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error getting onboarding state by user ID:', error);
      return null;
    }
  }

  /**
   * Delete onboarding state
   */
  async deleteOnboardingState(identifier: string): Promise<void> {
    await this.redisService.getClient().del(this.getOnboardingKey(identifier));
  }

  /**
   * Get resume information for frontend
   */
  async getResumeInfo(identifier: string): Promise<{
    shouldResume: boolean;
    currentStep: OnboardingStep;
    data: any;
    completedSteps: OnboardingStep[];
  } | null> {
    const state = await this.getOnboardingState(identifier);

    if (!state || state.currentStep === OnboardingStep.COMPLETED) {
      return null;
    }

    return {
      shouldResume: true,
      currentStep: state.currentStep,
      data: state.data,
      completedSteps: state.completedSteps,
    };
  }

  /**
   * Check if user can proceed to specific step
   */
  canProceedToStep(
    currentStep: OnboardingStep,
    targetStep: OnboardingStep,
    completedSteps: OnboardingStep[],
  ): boolean {
    const stepOrder = [
      OnboardingStep.PHONE_VERIFICATION,
      OnboardingStep.PHONE_VERIFIED,
      OnboardingStep.BASIC_INFO,
      OnboardingStep.PASSWORD_SETUP,
      OnboardingStep.LIVENESS_CHECK,
      OnboardingStep.IDENTITY_VERIFICATION,
      OnboardingStep.COMPLETED,
    ];

    const currentIndex = stepOrder.indexOf(currentStep);
    const targetIndex = stepOrder.indexOf(targetStep);

    // Can only proceed to next step or current step
    return targetIndex <= currentIndex + 1;
  }

  /**
   * Clean up expired onboarding sessions (manual cleanup if needed)
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const keys = await this.redisService
        .getClient()
        .keys(`${this.KEY_PREFIX}:*`);

      let deletedCount = 0;
      const now = new Date();

      for (const key of keys) {
        const stateJson = await this.redisService.getClient().get(key);
        if (stateJson) {
          const state = JSON.parse(stateJson) as OnboardingState;
          const createdAt = new Date(state.createdAt);
          const daysDiff =
            (now.getTime() - createdAt.getTime()) / (1000 * 3600 * 24);

          // Delete sessions older than 100 days
          if (daysDiff > 100) {
            await this.redisService.getClient().del(key);
            deletedCount++;
          }
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      return 0;
    }
  }
}
