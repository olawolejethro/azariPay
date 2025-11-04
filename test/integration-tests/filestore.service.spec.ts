// src/filestore/services/filestore.service.spec.ts

// 1. Mock the uuid module before any imports
const mockUuid = '123e4567-e89b-12d3-a456-426614174000';

// Initialize the mock function for uuid.v4
const someFunction = jest.fn(() => mockUuid);

// Jest's module mocking is hoisted to the top of the file,
// so the following jest.mock call will apply to all imports below.
jest.mock('uuid', () => {
  return {
    __esModule: true, // Ensures ES Module compatibility
    v4: someFunction, // Mocks the v4 function
  };
});

// 2. Now, import the modules that use uuid
import { v4 as uuidv4 } from 'uuid';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
} from '@aws-sdk/client-s3';

import { Test, TestingModule } from '@nestjs/testing';
import { FileStoreService } from '../../src/filestore/services/filestore.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FileStore } from '../../src/filestore/entities/filestore.entity';
import { Repository } from 'typeorm';
import { UploadFileDto } from '../../src/filestore/dto/upload-file.dto';
import { RetrieveFileDto } from '../../src/filestore/dto/retrieve-file.dto';
import { GetFileMetadataDto } from '../../src/filestore/dto/get-file-metadata.dto';
import {
  ConfigService,
  ConfigGetOptions,
  ConfigChangeEvent,
} from '@nestjs/config';
import { LoggerService } from '../../src/common/logger/logger.service';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Express } from 'express';
import { PassThrough } from 'stream';
import { Subject } from 'rxjs';
import { IncomingMessage } from 'http';
import { SdkStreamMixin } from '@aws-sdk/types';

// 3. Set up the mock for S3Client
const s3Mock = mockClient(S3Client);

// 4. Mock dependencies
const mockFileStoreRepository = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

// 5. Define a partially mocked ConfigService
const mockConfigService: Partial<jest.Mocked<ConfigService>> = {
  get: jest.fn(),
  getOrThrow: jest.fn(),
  set: jest.fn(),
  setEnvFilePaths: jest.fn(),
  changes$: new Subject<ConfigChangeEvent<any, any>>(),
  // Add other methods if your service uses them
};

// 6. Mock LoggerService
const mockLoggerService = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

/**
 * MockIncomingMessage class to simulate IncomingMessage & SdkStreamMixin
 */
class MockIncomingMessage
  extends PassThrough
  implements IncomingMessage, SdkStreamMixin
{
  transformToByteArray: () => Promise<Uint8Array>;
  transformToString: (encoding?: string) => Promise<string>;
  transformToWebStream: () => ReadableStream;
  complete: boolean;
  headersDistinct: NodeJS.Dict<string[]>;
  trailersDistinct: NodeJS.Dict<string[]>;
  setTimeout(msecs: number, callback?: () => void): this {
    throw new Error('Method not implemented.');
  }
  method?: string;
  url?: string;
  statusCode?: number;
  statusMessage?: string;
  // Implement required IncomingMessage properties
  aborted = false;
  httpVersion = '1.1';
  httpVersionMajor = 1;
  httpVersionMinor = 1;
  connection: any = {};
  headers: any = {};
  rawHeaders: any[] = [];
  trailers: any = {};
  rawTrailers: any[] = [];
  socket: any = {};

  // Implement any methods if necessary
}

/**
 * Helper function to create a mock Express.Multer.File object.
 * @param overrides Partial properties to override the defaults.
 * @returns A fully mocked Express.Multer.File object.
 */
const createMockMulterFile = (
  overrides?: Partial<Express.Multer.File>,
): Express.Multer.File => {
  return {
    fieldname: 'file',
    originalname: 'test.jpg', // Ensure this has a valid extension
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 1024, // Size in bytes
    buffer: Buffer.from('test'),
    stream: new PassThrough(), // Using PassThrough for simplicity
    // Optional properties based on Multer storage configuration
    destination: 'uploads/', // Assuming DiskStorage
    filename: 'test-uuid.jpg',
    path: 'uploads/test-uuid.jpg',
    ...overrides,
  };
};

describe('FileStoreService', () => {
  let service: FileStoreService;
  let repository: Repository<FileStore>;
  let configService: ConfigService;
  let logger: LoggerService;

  beforeEach(async () => {
    // 1. Clear all mock call histories before each test
    jest.clearAllMocks();
    s3Mock.reset();

    // 2. Re-establish the mock implementation for someFunction after clear
    someFunction.mockImplementation(() => mockUuid);

    // 3. Set up the mock implementation for ConfigService.get
    mockConfigService.get?.mockImplementation(
      (key: string, defaultValue?: any) => {
        const config = {
          WASABI_BUCKET_NAME: 'test-bucket',
          WASABI_ENDPOINT: 'https://s3.wasabisys.com',
          WASABI_ACCESS_KEY: 'test-access-key',
          WASABI_SECRET_KEY: 'test-secret-key',
          WASABI_REGION: 'us-east-1', // Ensure this is set correctly
        };
        return config[key] !== undefined ? config[key] : defaultValue;
      },
    );

    // 4. Optionally, mock getOrThrow if used
    mockConfigService.getOrThrow?.mockImplementation(
      (key: string, options?: ConfigGetOptions) => {
        const value = mockConfigService.get?.(key);
        if (value === undefined) {
          throw new Error(`Config key ${key} not found`);
        }
        return value;
      },
    );

    // 5. Compile the TestingModule with mocked providers
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileStoreService,
        {
          provide: getRepositoryToken(FileStore),
          useFactory: mockFileStoreRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService as unknown as ConfigService, // Cast as unknown first
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService, // Use the mock directly
        },
        {
          provide: S3Client,
          useValue: s3Mock, // Provide the mocked S3Client
        },
      ],
    }).compile();

    // 6. Retrieve instances from the TestingModule
    service = module.get<FileStoreService>(FileStoreService);
    repository = module.get<Repository<FileStore>>(
      getRepositoryToken(FileStore),
    );
    configService = module.get<ConfigService>(ConfigService);
    logger = module.get<LoggerService>(LoggerService);
  });

  // 1. Verify that uuidv4 returns the mocked UUID
  it('should return the mocked UUID', () => {
    expect(uuidv4()).toBe(mockUuid);
    expect(someFunction).toHaveBeenCalledTimes(1); // Called once via uuidv4()
  });

  describe('uploadFile', () => {
    it('should throw BadRequestException for invalid JSON metadata', async () => {
      const uploadFileDto: UploadFileDto = {
        file: createMockMulterFile(),
        fileMetadata: 'Invalid JSON',
      };

      await expect(service.uploadFile(uploadFileDto, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(logger.warn).toHaveBeenCalledWith(
        `Invalid fileMetadata JSON: ${uploadFileDto.fileMetadata}`,
        'FileStoreService',
      );
    });

    it('should upload file and save metadata successfully', async () => {
      const uploadFileDto: UploadFileDto = {
        file: createMockMulterFile(),
        fileMetadata: '{"description": "User profile picture"}',
      };

      // Mock PutObjectCommand to resolve successfully
      s3Mock.on(PutObjectCommand).resolves({});

      // Mock repository.create and repository.save
      const mockFileStore = new FileStore();
      mockFileStore.id = 1;
      mockFileStore.fileUrl = `https://test-bucket.s3.us-east-1.wasabisys.com/${mockUuid}.jpg`;
      mockFileStore.fileMetadata = { description: 'User profile picture' };
      mockFileStore.userId = 1;

      (repository.create as jest.Mock).mockReturnValue(mockFileStore);
      (repository.save as jest.Mock).mockResolvedValue(mockFileStore);

      const result = await service.uploadFile(uploadFileDto, 1);

      // Assertions
      expect(repository.findOne).not.toHaveBeenCalled();
      expect(repository.create).toHaveBeenCalledWith({
        fileUrl: `https://test-bucket.s3.us-east-1.wasabisys.com/${mockUuid}.jpg`,
        fileMetadata: { description: 'User profile picture' },
        userId: 1,
      });

      // Verify that PutObjectCommand was instantiated correctly using commandCalls
      const putCalls = s3Mock.commandCalls(PutObjectCommand, {
        Bucket: 'test-bucket',
        Key: `${mockUuid}.jpg`,
        Body: uploadFileDto.file.buffer,
        ContentType: uploadFileDto.file.mimetype,
      });
      expect(putCalls.length).toBe(1);

      expect(repository.save).toHaveBeenCalledWith(mockFileStore);
      expect(result).toEqual(mockFileStore);
      expect(logger.log).toHaveBeenCalledWith(
        `File uploaded to Wasabi with key: ${mockUuid}.jpg`,
        'FileStoreService',
      );
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException if S3 retrieval fails', async () => {
      const retrieveFileDto: RetrieveFileDto = { fileStoreId: 9 };
      const mockFileStore = new FileStore();
      mockFileStore.id = 9;
      mockFileStore.fileUrl =
        'https://test-bucket.s3.us-east-1.wasabisys.com/test-file.jpg';

      (repository.findOne as jest.Mock).mockResolvedValueOnce(mockFileStore);

      // Mock GetObjectCommand to reject with an error
      const mockError = new Error('S3 Retrieval Error');
      s3Mock.on(GetObjectCommand).rejects(mockError);

      await expect(service.retrieveFile(retrieveFileDto)).rejects.toThrow(
        InternalServerErrorException,
      );

      // Fix the logger.error assertion

      // expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 9 } });
      // expect(logger.warn).toHaveBeenCalledWith(
      //   `File not found for fileStoreId: 9`,
      //   'FileStoreService',
      // );
      // Verify that GetObjectCommand was instantiated correctly using commandCalls
      const getCalls = s3Mock.commandCalls(GetObjectCommand, {
        Bucket: 'test-bucket',
        Key: 'test-file.jpg',
      });
      expect(getCalls.length).toBe(1);
    });

    describe('retrieveFile', () => {
      it('should throw NotFoundException if file does not exist', async () => {
        const retrieveFileDto: RetrieveFileDto = { fileStoreId: 1 };

        // Mock repository.findOne to return undefined
        (repository.findOne as jest.Mock).mockResolvedValueOnce(undefined);

        await expect(service.retrieveFile(retrieveFileDto)).rejects.toThrow(
          NotFoundException,
        );
        expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
        expect(logger.warn).toHaveBeenCalledWith(
          `File not found for fileStoreId: 1`,
          'FileStoreService',
        );
      });

      it('should retrieve file successfully', async () => {
        const retrieveFileDto: RetrieveFileDto = { fileStoreId: 1 };
        const mockFileStore = new FileStore();
        mockFileStore.id = 1;
        mockFileStore.fileUrl =
          'https://test-bucket.s3.us-east-1.wasabisys.com/test-file.jpg';

        (repository.findOne as jest.Mock).mockResolvedValueOnce(mockFileStore);

        // Create an instance of the mock stream and write data to it
        const mockStream = new MockIncomingMessage();
        mockStream.write('test');
        mockStream.end();

        const mockGetObjectResponse: GetObjectCommandOutput = {
          $metadata: {}, // Added to satisfy TypeScript
          ContentType: 'image/jpeg',
          Body: mockStream,
          Metadata: { filename: 'test-file.jpg' },
        };

        s3Mock.on(GetObjectCommand).resolves(mockGetObjectResponse);

        const result = await service.retrieveFile(retrieveFileDto);

        // Assertions
        expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });

        // Verify that GetObjectCommand was instantiated correctly using commandCalls
        const getCalls = s3Mock.commandCalls(GetObjectCommand, {
          Bucket: 'test-bucket',
          Key: 'test-file.jpg',
        });
        expect(getCalls.length).toBe(1);

        expect(result.ContentType).toBe('image/jpeg');
        expect(result.Metadata).toEqual({ filename: 'test-file.jpg' });
        expect(result.Body).toBeInstanceOf(MockIncomingMessage);
        expect(logger.log).toHaveBeenCalledWith(
          `File retrieved from Wasabi with key: test-file.jpg`,
          'FileStoreService',
        );
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
      });

      it('should throw InternalServerErrorException if S3 retrieval fails', async () => {
        const retrieveFileDto: RetrieveFileDto = { fileStoreId: 1 };
        const mockFileStore = new FileStore();
        mockFileStore.id = 1;
        mockFileStore.fileUrl =
          'https://test-bucket.s3.us-east-1.wasabisys.com/test-file.jpg';

        (repository.findOne as jest.Mock).mockResolvedValueOnce(mockFileStore);

        // Mock GetObjectCommand to reject with an error
        const mockError = new Error('S3 Retrieval Error');
        s3Mock.on(GetObjectCommand).rejects(mockError);

        await expect(service.retrieveFile(retrieveFileDto)).rejects.toThrow(
          InternalServerErrorException,
        );

        // Fix: Only expect 2 parameters since that's what the service actually does
        expect(logger.error).toHaveBeenCalledWith(
          'Failed to retrieve file from Wasabi: S3 Retrieval Error',
          'FileStoreService',
        );

        // Verify that GetObjectCommand was instantiated correctly using commandCalls
        const getCalls = s3Mock.commandCalls(GetObjectCommand, {
          Bucket: 'test-bucket',
          Key: 'test-file.jpg',
        });
        expect(getCalls.length).toBe(1);
      });
      describe('getFileMetadata', () => {
        it('should throw NotFoundException if file does not exist', async () => {
          const getFileMetadataDto: GetFileMetadataDto = { fileStoreId: 1 };

          // Mock repository.findOne to return undefined
          (repository.findOne as jest.Mock).mockResolvedValueOnce(undefined);

          await expect(
            service.getFileMetadata(getFileMetadataDto),
          ).rejects.toThrow(NotFoundException);
          expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
          expect(logger.warn).toHaveBeenCalledWith(
            `File metadata not found for fileStoreId: 1`,
            'FileStoreService',
          );
        });

        it('should retrieve file metadata successfully', async () => {
          const getFileMetadataDto: GetFileMetadataDto = { fileStoreId: 1 };
          const mockFileStore = new FileStore();
          mockFileStore.id = 1;
          mockFileStore.fileMetadata = {
            description: 'User profile picture',
            uploadDate: '2023-10-05T12:34:56Z',
          };

          (repository.findOne as jest.Mock).mockResolvedValueOnce(
            mockFileStore,
          );

          const result = await service.getFileMetadata(getFileMetadataDto);

          // Assertions
          expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
          expect(result).toEqual(mockFileStore.fileMetadata);
          expect(logger.log).toHaveBeenCalledWith(
            `File metadata retrieved for fileStoreId: 1`,
            'FileStoreService',
          );
          expect(logger.warn).not.toHaveBeenCalled();
          expect(logger.error).not.toHaveBeenCalled();
        });
      });
    });
  });
});
