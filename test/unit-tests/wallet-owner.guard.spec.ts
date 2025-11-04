// src/wallet/__tests__/guards/wallet-owner.guard.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WalletOwnerGuard } from '../../src/wallets/guards/wallet-owner.guard';
import { WalletEntity } from '../../src/wallets/entities/wallet.entity';

describe('WalletOwnerGuard', () => {
  let guard: WalletOwnerGuard;
  let mockWalletRepository;

  const mockWallet = {
    id: 'wallet-123',
    userId: 'user-123',
  };

  beforeEach(async () => {
    mockWalletRepository = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletOwnerGuard,
        {
          provide: getRepositoryToken(WalletEntity),
          useValue: mockWalletRepository,
        },
      ],
    }).compile();

    guard = module.get<WalletOwnerGuard>(WalletOwnerGuard);
  });

  it('should allow access for wallet owner', async () => {
    // Arrange
    mockWalletRepository.findOne.mockResolvedValue(mockWallet);
    const context = createMockExecutionContext('wallet-123', 'user-123');

    // Act
    const result = await guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
  });

  it('should deny access for non-owner', async () => {
    // Arrange
    mockWalletRepository.findOne.mockResolvedValue(mockWallet);
    const context = createMockExecutionContext('wallet-123', 'different-user');

    // Act & Assert
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should handle non-existent wallet', async () => {
    // Arrange
    mockWalletRepository.findOne.mockResolvedValue(null);
    const context = createMockExecutionContext(
      'non-existent-wallet',
      'user-123',
    );

    // Act
    const result = await guard.canActivate(context);

    // Assert
    expect(result).toBe(false);
  });
});

// Helper function to create mock execution context
function createMockExecutionContext(
  walletId: string,
  userId: string,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        params: { walletId },
        user: { userId },
      }),
    }),
  } as ExecutionContext;
}
