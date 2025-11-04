// src/common/redis/redis.service.spec.ts

/**
 * Mocked LoggerService methods
 * Provides mock implementations for LoggerService's methods.
 */
const mockedLoggerService = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
};

/**
 * Interface defining the mocked Redis client methods
 * Ensures TypeScript recognizes the structure of the mocked Redis client.
 */
interface MockRedis {
  on: jest.Mock;
  set: jest.Mock;
  get: jest.Mock;
  del: jest.Mock;
  quit: jest.Mock;
}

/**
 * Variable to hold the mocked Redis instance
 * Assigned within the jest.mock factory.
 */
let mockRedis: MockRedis;

/**
 * Mock Implementation for ioredis
 * Overrides the Redis constructor to return the mockedRedis instance.
 * The `__esModule` flag is set to true to correctly mock ES6 default exports.
 * This must be placed **before** importing the RedisService to ensure the mock is applied correctly.
 */
jest.mock('ioredis', () => ({
  __esModule: true, // Indicates that it's an ES6 module
  default: jest.fn().mockImplementation(() => {
    mockRedis = {
      on: jest.fn(),
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      quit: jest.fn(),
    };
    return mockRedis;
  }),
}));

/**
 * Mock Implementation for LoggerService
 * Overrides the LoggerService to return the mockedLoggerService.
 * This must be placed **before** importing the RedisService to ensure the mock is applied correctly.
 */
jest.mock('../../src/common/logger/logger.service', () => ({
  LoggerService: jest.fn().mockImplementation(() => mockedLoggerService),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../../src/common/redis/redis.service';
import Redis from 'ioredis';
import { LoggerService } from '../../src/common/logger/logger.service';
import { ConfigService } from '@nestjs/config';

describe('RedisService', () => {
  let service: RedisService;
  let redisInstance: Redis;
  let configService: ConfigService;

  beforeEach(async () => {
    /**
     * Initializes the testing module with RedisService.
     * Mocks ConfigService to provide necessary configuration values.
     * Retrieves an instance of RedisService for testing.
     */
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              switch (key) {
                case 'REDIS_HOST':
                  return 'localhost';
                case 'REDIS_PORT':
                  return 6379;
                case 'REDIS_PASSWORD':
                  return 'password';
                default:
                  return null;
              }
            }),
          },
        },
        {
          provide: LoggerService,
          useValue: mockedLoggerService,
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    redisInstance = service.getClient();
    configService = module.get<ConfigService>(ConfigService);

    /**
     * Clears all mock calls before each test to ensure test isolation.
     */
    jest.clearAllMocks();
  });

  /**
   * Verifies that the RedisService is defined and instantiated correctly.
   */
  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getClient', () => {
    /**
     * Tests that the getClient method returns the Redis client instance.
     *
     * Example Usage:
     * ```typescript
     * const client = this.redisService.getClient();
     * ```
     *
     * @returns Redis client instance.
     */
    it('should return the Redis client instance', () => {
      const client = service.getClient();
      expect(client).toBe(redisInstance);
    });
  });

  describe('setKey', () => {
    /**
     * Tests that the setKey method calls Redis's set method with correct parameters and returns true on success.
     *
     * Example Usage:
     * ```typescript
     * const success = await this.redisService.setKey('key', 'value', 300);
     * ```
     *
     * @param key - The key to set.
     * @param value - The value to associate with the key.
     * @param ttlSeconds - Time-to-live in seconds.
     * @returns Boolean indicating success.
     */
    it('should call redis.set with key, value, EX, ttlSeconds and return true', async () => {
      const key = 'testKey';
      const value = 'testValue';
      const ttlSeconds = 300;

      // Mock Redis set method to return 'OK'
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.setKey(key, value, ttlSeconds);

      expect(mockRedis.set).toHaveBeenCalledWith(key, value, 'EX', ttlSeconds);
      expect(result).toBe(true);
      expect(mockedLoggerService.error).not.toHaveBeenCalled();
    });

    /**
     * Tests that the setKey method calls Redis's set method without TTL and returns true on success.
     *
     * Example Usage:
     * ```typescript
     * const success = await this.redisService.setKey('key', 'value');
     * ```
     *
     * @param key - The key to set.
     * @param value - The value to associate with the key.
     * @returns Boolean indicating success.
     */
    it('should call redis.set with key and value without TTL and return true', async () => {
      const key = 'testKey';
      const value = 'testValue';

      // Mock Redis set method to return 'OK'
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.setKey(key, value);

      expect(mockRedis.set).toHaveBeenCalledWith(key, value);
      expect(result).toBe(true);
      expect(mockedLoggerService.error).not.toHaveBeenCalled();
    });

    /**
     * Tests that the setKey method logs an error and returns false when Redis's set method throws an error.
     *
     * Example Usage:
     * ```typescript
     * const success = await this.redisService.setKey('key', 'value', 300);
     * ```
     *
     * @param key - The key to set.
     * @param value - The value to associate with the key.
     * @param ttlSeconds - Time-to-live in seconds.
     * @returns Boolean indicating failure.
     */
    it('should log an error and return false when redis.set throws an error', async () => {
      const key = 'testKey';
      const value = 'testValue';
      const ttlSeconds = 300;
      const error = new Error('Redis set error');

      // Mock Redis set method to throw an error
      mockRedis.set.mockRejectedValue(error);

      const result = await service.setKey(key, value, ttlSeconds);

      expect(mockRedis.set).toHaveBeenCalledWith(key, value, 'EX', ttlSeconds);
      expect(result).toBe(false);
      expect(mockedLoggerService.error).toHaveBeenCalledWith(
        error,
        'RedisService',
      );
    });
  });

  describe('getKey', () => {
    /**
     * Tests that the getKey method calls Redis's get method with correct parameters and returns the value.
     *
     * Example Usage:
     * ```typescript
     * const value = await this.redisService.getKey('key');
     * ```
     *
     * @param key - The key to retrieve.
     * @returns The value associated with the key, or null if not found.
     */
    it('should call redis.get with key and return the value', async () => {
      const key = 'testKey';
      const value = 'testValue';

      // Mock Redis get method to return the value
      mockRedis.get.mockResolvedValue(value);

      const result = await service.getKey(key);

      expect(mockRedis.get).toHaveBeenCalledWith(key);
      expect(result).toBe(value);
      expect(mockedLoggerService.error).not.toHaveBeenCalled();
    });

    /**
     * Tests that the getKey method calls Redis's get method and returns null when the key is not found.
     *
     * Example Usage:
     * ```typescript
     * const value = await this.redisService.getKey('nonExistentKey');
     * ```
     *
     * @param key - The key to retrieve.
     * @returns Null if the key is not found.
     */
    it('should call redis.get with key and return null if key does not exist', async () => {
      const key = 'nonExistentKey';

      // Mock Redis get method to return null
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getKey(key);

      expect(mockRedis.get).toHaveBeenCalledWith(key);
      expect(result).toBeNull();
      expect(mockedLoggerService.error).not.toHaveBeenCalled();
    });

    /**
     * Tests that the getKey method logs an error and returns null when Redis's get method throws an error.
     *
     * Example Usage:
     * ```typescript
     * const value = await this.redisService.getKey('key');
     * ```
     *
     * @param key - The key to retrieve.
     * @returns Null indicating failure.
     */
    it('should log an error and return null when redis.get throws an error', async () => {
      const key = 'testKey';
      const error = new Error('Redis get error');

      // Mock Redis get method to throw an error
      mockRedis.get.mockRejectedValue(error);

      const result = await service.getKey(key);

      expect(mockRedis.get).toHaveBeenCalledWith(key);
      expect(result).toBeNull();
      expect(mockedLoggerService.error).toHaveBeenCalledWith(
        error,
        'RedisService',
      );
    });
  });

  describe('deleteKey', () => {
    /**
     * Tests that the deleteKey method calls Redis's del method with correct parameters and returns the number of keys deleted.
     *
     * Example Usage:
     * ```typescript
     * const deletedCount = await this.redisService.deleteKey('key');
     * ```
     *
     * @param key - The key to delete.
     * @returns The number of keys that were removed.
     */
    it('should call redis.del with key and return the number of keys deleted', async () => {
      const key = 'testKey';
      const deletedCount = 1;

      // Mock Redis del method to return the number of keys deleted
      mockRedis.del.mockResolvedValue(deletedCount);

      const result = await service.deleteKey(key);

      expect(mockRedis.del).toHaveBeenCalledWith(key);
      expect(result).toBe(deletedCount);
      expect(mockedLoggerService.error).not.toHaveBeenCalled();
    });

    /**
     * Tests that the deleteKey method calls Redis's del method and returns 0 when the key does not exist.
     *
     * Example Usage:
     * ```typescript
     * const deletedCount = await this.redisService.deleteKey('nonExistentKey');
     * ```
     *
     * @param key - The key to delete.
     * @returns 0 indicating no keys were removed.
     */
    it('should call redis.del with key and return 0 if key does not exist', async () => {
      const key = 'nonExistentKey';
      const deletedCount = 0;

      // Mock Redis del method to return 0
      mockRedis.del.mockResolvedValue(deletedCount);

      const result = await service.deleteKey(key);

      expect(mockRedis.del).toHaveBeenCalledWith(key);
      expect(result).toBe(deletedCount);
      expect(mockedLoggerService.error).not.toHaveBeenCalled();
    });

    /**
     * Tests that the deleteKey method logs an error and returns 0 when Redis's del method throws an error.
     *
     * Example Usage:
     * ```typescript
     * const deletedCount = await this.redisService.deleteKey('key');
     * ```
     *
     * @param key - The key to delete.
     * @returns 0 indicating failure.
     */
    it('should log an error and return 0 when redis.del throws an error', async () => {
      const key = 'testKey';
      const error = new Error('Redis del error');

      // Mock Redis del method to throw an error
      mockRedis.del.mockRejectedValue(error);

      const result = await service.deleteKey(key);

      expect(mockRedis.del).toHaveBeenCalledWith(key);
      expect(result).toBe(0);
      expect(mockedLoggerService.error).toHaveBeenCalledWith(
        error,
        'RedisService',
      );
    });
  });

  describe('onModuleDestroy', () => {
    /**
     * Tests that the onModuleDestroy method calls Redis's quit method and logs a success message.
     *
     * Example Usage:
     * ```typescript
     * await this.redisService.onModuleDestroy();
     * ```
     *
     * @returns void
     */
    it('should call redis.quit and log success message', async () => {
      // Mock Redis quit method to resolve successfully
      mockRedis.quit.mockResolvedValue(undefined);

      await service.onModuleDestroy();

      expect(mockRedis.quit).toHaveBeenCalled();
      expect(mockedLoggerService.log).toHaveBeenCalledWith(
        'Redis client disconnected successfully.',
        'RedisService',
      );
      expect(mockedLoggerService.error).not.toHaveBeenCalled();
    });

    /**
     * Tests that the onModuleDestroy method logs an error when Redis's quit method throws an error.
     *
     * Example Usage:
     * ```typescript
     * await this.redisService.onModuleDestroy();
     * ```
     *
     * @returns void
     */
    it('should log an error when redis.quit throws an error', async () => {
      const error = new Error('Redis quit error');

      // Mock Redis quit method to throw an error
      mockRedis.quit.mockRejectedValue(error);

      await service.onModuleDestroy();

      expect(mockRedis.quit).toHaveBeenCalled();
      expect(mockedLoggerService.log).not.toHaveBeenCalled();
      expect(mockedLoggerService.error).toHaveBeenCalledWith(
        error,
        'RedisService',
      );
    });
  });
});
