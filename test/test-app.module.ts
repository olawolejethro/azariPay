// test/test-app.module.ts
import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthController } from '../src/auth/controllers/auth.controller';
import { AuthService } from '../src/auth/services/auth.service';
import { User } from '../src/auth/entities/user.entity';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity';
import { RedisService } from '../src/common/redis/redis.service';
import { LoggerService } from '../src/common/logger/logger.service';
import { NotificationsService } from '../src/common/notifications/notifications.service';
import { NotificationService } from '../src/notifications/notifications.service';
import { FileStoreService } from '../src/filestore/services/filestore.service';
import { EncryptionService } from '../src/common/encryption/encryption.service';
import { RedisMockService } from './e2e-tests/mocks/redis.mock';
import { TwilioMockService } from './e2e-tests/mocks/twillo.mock';
import { JwtAuthGuardMock } from './e2e-tests/mocks/jwt.mock';
import { EncryptionServiceMock } from './e2e-tests/mocks/encryption.mock';
import { GeolocationServiceMock } from './e2e-tests/mocks/geolocation.mock';
import { OnboardingTrackingMockService } from './e2e-tests/mocks/onboarding-tracking.mock';
import { OnboardingTrackingService } from 'src/auth/services/onboardingTrackingService';
import { AptPayService } from 'src/wallets/services/aptPay.service';
import { WalletFactory } from 'src/wallets/factories/wallet.factory';
import { FirebaseService } from 'src/firebase/firebase.service';
import { setEncryptionService } from 'src/common/encryption/transformers/encryption-transformer.helper';
import { GeolocationService } from 'src/common/geolocation.service';

// Mock repositories
// In test/test-app.module.ts
// Update the mockUserRepository object

const mockUserRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
  // ✅ ADD increment method for tokenVersion updates
  increment: jest.fn((criteria, propertyPath, value) => {
    // Mock implementation - just return success
    return Promise.resolve({ affected: 1, raw: [], generatedMaps: [] });
  }),
  // ✅ ADD decrement method (might be needed too)
  decrement: jest.fn((criteria, propertyPath, value) => {
    return Promise.resolve({ affected: 1, raw: [], generatedMaps: [] });
  }),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
    getCount: jest.fn().mockResolvedValue(0),
  })),
};

// In test/test-app.module.ts
// Update mockRefreshTokenRepository

const mockRefreshTokenRepository = {
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]), // ✅ Return empty array instead of undefined
  create: jest.fn().mockImplementation((data) => data),
  save: jest.fn().mockImplementation((token) =>
    Promise.resolve({
      id: 'refresh-token-id-123',
      token: 'mock-refresh-token',
      userId: 1,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      ...token,
    }),
  ),
  update: jest.fn(),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
  remove: jest.fn().mockResolvedValue(undefined),

  // ✅ ADD createQueryBuilder for finding tokens
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]), // Return empty array of tokens
    delete: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 0 }),
  })),
};

// Mock services
const mockLoggerService = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  setContext: jest.fn(),
};

const mockFileStoreService = {
  uploadFile: jest.fn(),
  getFile: jest.fn(),
  deleteFile: jest.fn(),
  uploadBuffer: jest.fn(),
  getFileUrl: jest.fn(),
  deleteFiles: jest.fn(),
};

const mockNotificationService = {
  hasUnreadNotifications: jest.fn().mockResolvedValue(false),
  getUnreadNotificationCount: jest.fn().mockResolvedValue(0),
  createNotification: jest.fn().mockResolvedValue({
    notification: {
      id: 1,
      title: 'Test',
      body: 'Test notification',
      status: 'UNREAD',
    },
    pushSent: true,
  }),
  create: jest.fn().mockResolvedValue({
    notification: { id: 1 },
    pushSent: true,
  }),
  sendTestNotification: jest.fn().mockResolvedValue({
    success: true,
    message: 'Test notification sent',
  }),
  markAsRead: jest.fn().mockResolvedValue({
    id: 1,
    status: 'READ',
  }),
  markAsUnread: jest.fn().mockResolvedValue({
    id: 1,
    status: 'UNREAD',
  }),
  deleteNotification: jest.fn().mockResolvedValue(true),
  getUserNotifications: jest.fn().mockResolvedValue({
    notifications: [],
    total: 0,
    unreadCount: 0,
  }),
  getNotificationById: jest.fn().mockResolvedValue([]),
};

const mockOnboardingTrackingService = {
  createOnboardingSession: jest.fn().mockResolvedValue(undefined),
  saveOnboardingState: jest.fn().mockResolvedValue(undefined),
  getOnboardingStateByUserId: jest.fn().mockResolvedValue(null),
  getOnboardingStateByPhoneNumber: jest.fn().mockResolvedValue(null),
  markPasswordCompleted: jest.fn().mockResolvedValue(undefined),
  trackSignupStep: jest.fn().mockResolvedValue(undefined),
  trackVerificationStep: jest.fn().mockResolvedValue(undefined),
  getOnboardingProgress: jest.fn().mockResolvedValue({
    userId: 1,
    currentStep: 'not_started',
    stepsCompleted: [],
    progress: 0,
    isCompleted: false,
    startedAt: new Date(),
  }),
  completeOnboarding: jest.fn().mockResolvedValue(undefined),
  markPhoneVerificationCompleted: jest.fn().mockResolvedValue(undefined),
  markBasicInfoCompleted: jest.fn().mockResolvedValue(undefined),
  markPhoneVerified: jest.fn().mockResolvedValue({
    phoneNumber: '+1-888-999-1234',
    currentStep: 'PHONE_VERIFIED',
    phoneVerified: true,
    stepsCompleted: ['PHONE_VERIFIED'],
  }),
  updateOnboardingStep: jest.fn().mockResolvedValue({
    phoneNumber: '+1-888-999-1234',
    currentStep: 'PHONE_VERIFIED',
    phoneVerified: true,
    stepsCompleted: ['PHONE_VERIFIED'],
  }),
};

const mockFirebaseService = {
  createCustomToken: jest
    .fn()
    .mockResolvedValue('mock-firebase-custom-token-123'),
  notifyByPush: jest.fn().mockResolvedValue({
    status: true,
    message: 'Success',
    data: 'mock-response-123',
  }),
  sendTestNotification: jest.fn().mockResolvedValue({
    success: true,
    message: 'Test notification sent successfully',
  }),
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
  sendDataNotification: jest.fn().mockResolvedValue(undefined),
  createChatRoom: jest.fn().mockResolvedValue(undefined),
  addMessage: jest.fn().mockResolvedValue(undefined),
  addNegotiationMessage: jest.fn().mockResolvedValue(undefined),
  updateTradeStatus: jest.fn().mockResolvedValue(undefined),
  markMessageAsRead: jest.fn().mockResolvedValue(undefined),
  db: {
    ref: jest.fn().mockReturnValue({
      set: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      once: jest.fn().mockResolvedValue({ val: () => ({}) }),
      push: jest.fn().mockReturnValue({
        set: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  },
  firebaseApp: {
    auth: jest.fn().mockReturnValue({
      createCustomToken: jest
        .fn()
        .mockResolvedValue('mock-firebase-custom-token-123'),
    }),
    messaging: jest.fn().mockReturnValue({
      send: jest.fn().mockResolvedValue('mock-message-id'),
      sendMulticast: jest.fn().mockResolvedValue({
        successCount: 1,
        failureCount: 0,
      }),
    }),
    database: jest.fn().mockReturnValue({
      ref: jest.fn(),
    }),
  },
};

const mockWalletFactory = {
  createWallet: jest.fn().mockResolvedValue({
    id: 'wallet-123',
    balance: 0,
    currency: 'NGN',
    status: 'ACTIVE',
  }),
  getWallet: jest.fn().mockResolvedValue({
    id: 'wallet-123',
    balance: 1000,
    currency: 'NGN',
    status: 'ACTIVE',
  }),
  updateWallet: jest.fn().mockResolvedValue({
    id: 'wallet-123',
    balance: 1500,
    currency: 'NGN',
    status: 'ACTIVE',
  }),
  deactivateWallet: jest.fn().mockResolvedValue({
    id: 'wallet-123',
    status: 'INACTIVE',
  }),
  createCADWallet: jest.fn().mockResolvedValue({
    id: 'cad-wallet-123',
    balance: 0,
    currency: 'CAD',
    status: 'ACTIVE',
  }),
  createNGNWallet: jest.fn().mockResolvedValue({
    id: 'ngn-wallet-123',
    balance: 0,
    currency: 'NGN',
    status: 'ACTIVE',
  }),
};

const mockAptPayService = {
  processPayment: jest.fn().mockResolvedValue({
    success: true,
    transactionId: 'test-tx-123',
  }),
  verifyTransaction: jest.fn().mockResolvedValue({
    verified: true,
    status: 'COMPLETED',
  }),
  createTransaction: jest.fn().mockResolvedValue({
    id: 'test-tx-123',
    status: 'PENDING',
  }),
  getTransaction: jest.fn().mockResolvedValue({
    id: 'test-tx-123',
    status: 'COMPLETED',
  }),
  processWebhook: jest.fn().mockResolvedValue({
    status: 'processed',
  }),
  verifyWebhookSignature: jest.fn().mockReturnValue(true),
  initiateTransfer: jest.fn().mockResolvedValue({
    success: true,
    reference: 'test-ref-123',
  }),
  validateAccount: jest.fn().mockResolvedValue({
    valid: true,
    accountName: 'Test Account',
  }),
  createPaymentRequest: jest.fn().mockResolvedValue({
    id: 'req-123',
    status: 'CREATED',
  }),
  getPaymentRequest: jest.fn().mockResolvedValue({
    id: 'req-123',
    status: 'COMPLETED',
  }),
  getAccessToken: jest.fn().mockResolvedValue({
    access_token: 'mock-access-token',
    expires_in: 3600,
  }),
  createVirtualAccount: jest.fn().mockResolvedValue({
    accountNumber: '1234567890',
    accountReference: 'REF123',
    bankName: 'Test Bank',
  }),
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env.test',
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'test-jwt-secret',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuardMock,
    OnboardingTrackingService,
    {
      provide: getRepositoryToken(User),
      useValue: mockUserRepository,
    },
    {
      provide: getRepositoryToken(RefreshToken),
      useValue: mockRefreshTokenRepository,
    },
    // ✅ GeolocationService - Use class mock
    {
      provide: GeolocationService,
      useClass: GeolocationServiceMock,
    },
    {
      provide: RedisService,
      useClass: RedisMockService,
    },
    {
      provide: LoggerService,
      useValue: mockLoggerService,
    },
    {
      provide: NotificationsService,
      useFactory: () => ({
        sendSms: jest.fn().mockResolvedValue(true),
        sendEmail: jest.fn().mockResolvedValue(true),
        sendWhatsApp: jest.fn().mockResolvedValue(true),
      }),
    },
    {
      provide: NotificationService,
      useValue: mockNotificationService,
    },
    {
      provide: FileStoreService,
      useValue: mockFileStoreService,
    },
    {
      provide: 'TwilioService',
      useClass: TwilioMockService,
    },
    {
      provide: OnboardingTrackingService,
      useValue: mockOnboardingTrackingService,
    },
    {
      provide: AptPayService,
      useValue: mockAptPayService,
    },
    {
      provide: WalletFactory,
      useValue: mockWalletFactory,
    },
    {
      provide: FirebaseService,
      useValue: mockFirebaseService,
    },
    // ✅ Use EncryptionServiceMock that performs REAL encryption
    {
      provide: EncryptionService,
      useClass: EncryptionServiceMock,
    },
  ],
  exports: [AuthService, PassportModule, JwtModule],
})
export class TestAppModule implements OnModuleInit {
  constructor(private encryptionService: EncryptionService) {}

  /**
   * ✅ CRITICAL: Initialize encryption transformers when module loads
   * This ensures transformers can encrypt/decrypt data in tests
   */
  onModuleInit() {
    setEncryptionService(this.encryptionService);
    console.log('✅ Test encryption transformers initialized');
  }
}
