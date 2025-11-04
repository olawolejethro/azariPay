// src/filestore/controllers/filestore.controller.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { FileStoreController } from './filestore.controller';
import { FileStoreService } from '../services/filestore.service';
import { UploadFileDto } from '../dto/upload-file.dto';
import { RetrieveFileDto } from '../dto/retrieve-file.dto';
import { GetFileMetadataDto } from '../dto/get-file-metadata.dto';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ExecutionContext } from '@nestjs/common';
import { Response } from 'express';
import { PassThrough } from 'stream';
import { IncomingMessage } from 'http';

/**
 * MockIncomingMessage class to simulate IncomingMessage & SdkStreamMixin
 */
class MockIncomingMessage extends PassThrough implements IncomingMessage {
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

  // Implement any required methods or properties if necessary
}

describe('FileStoreController', () => {
  let controller: FileStoreController;
  let service: FileStoreService;

  const mockFileStoreService = () => ({
    uploadFile: jest.fn(),
    retrieveFile: jest.fn(),
    getFileMetadata: jest.fn(),
  });

  const mockJwtAuthGuard = {
    canActivate: jest.fn((context: ExecutionContext) => true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FileStoreController],
      providers: [
        {
          provide: FileStoreService,
          useFactory: mockFileStoreService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    controller = module.get<FileStoreController>(FileStoreController);
    service = module.get<FileStoreService>(FileStoreService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('uploadFile', () => {
    it('should throw BadRequestException if file is not provided', async () => {
      const uploadFileDto: UploadFileDto = {
        file: null,
        fileMetadata: '{"description": "Test"}',
      };

      const mockRequest = {
        user: {
          userId: 1,
        },
      };

      // Type casting null as Express.Multer.File to satisfy TypeScript
      await expect(
        controller.uploadFile(
          null as unknown as Express.Multer.File,
          uploadFileDto.fileMetadata,
          mockRequest,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(service.uploadFile).not.toHaveBeenCalled();
    });

    it('should upload file successfully', async () => {
      const uploadFileDto: UploadFileDto = {
        file: {
          originalname: 'test.jpg',
          buffer: Buffer.from('test'),
          mimetype: 'image/jpeg',
          fieldname: 'file',
          encoding: '7bit',
          size: 1024,
          stream: new PassThrough(), // Using PassThrough for simplicity
          destination: 'uploads/',
          filename: 'test-uuid.jpg',
          path: 'uploads/test-uuid.jpg',
        },
        fileMetadata: '{"description": "User profile picture"}',
      };

      const mockFileStore = {
        id: 1,
        fileUrl: 'https://test-bucket.s3.us-east-1.wasabisys.com/test-uuid.jpg',
      };

      (service.uploadFile as jest.Mock).mockResolvedValueOnce(mockFileStore);

      const mockRequest = {
        user: {
          userId: 1,
        },
      };

      const response = await controller.uploadFile(
        uploadFileDto.file,
        uploadFileDto.fileMetadata,
        mockRequest,
      );

      expect(service.uploadFile).toHaveBeenCalledWith(uploadFileDto, 1);
      expect(response).toEqual({
        data: {
          id: 1,
          fileUrl:
            'https://test-bucket.s3.us-east-1.wasabisys.com/test-uuid.jpg',
        },
        message: 'Your file has been stored successfully.',
        errors: {},
      });
    });
  });

  describe('retrieveFile', () => {
    it('should throw NotFoundException if file does not exist', async () => {
      const retrieveFileDto: RetrieveFileDto = { fileStoreId: 1 };

      // Mock the service to throw NotFoundException
      (service.retrieveFile as jest.Mock).mockRejectedValueOnce(
        new NotFoundException('File not found'),
      );

      const mockResponse: Partial<Response> = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await expect(
        controller.retrieveFile(
          retrieveFileDto.fileStoreId,
          mockResponse as Response,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(service.retrieveFile).toHaveBeenCalledWith(retrieveFileDto);
      expect(mockResponse.setHeader).not.toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.send).not.toHaveBeenCalled();
    });

    it('should retrieve file successfully', async () => {
      const retrieveFileDto: RetrieveFileDto = { fileStoreId: 1 };
      const mockFileStore = {
        ContentType: 'image/jpeg',
        Body: new MockIncomingMessage(),
        Metadata: { filename: 'test.jpg' },
      };

      // Mock the pipe method on the Body
      mockFileStore.Body.pipe = jest.fn();

      // Write data to the mock stream
      mockFileStore.Body.write('test');
      mockFileStore.Body.end();

      (service.retrieveFile as jest.Mock).mockResolvedValueOnce(mockFileStore);

      const mockResponse: Partial<Response> = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        // No need to mock 'pipe' on the response
      };

      await controller.retrieveFile(
        retrieveFileDto.fileStoreId,
        mockResponse as Response,
      );

      expect(service.retrieveFile).toHaveBeenCalledWith(retrieveFileDto);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'image/jpeg',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="test.jpg"',
      );
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      // Verify that the stream was piped to the response
      expect(mockFileStore.Body.pipe).toHaveBeenCalledWith(mockResponse);
    });

    it('should handle service throwing NotFoundException', async () => {
      const retrieveFileDto: RetrieveFileDto = { fileStoreId: 1 };

      // Mock the service to throw NotFoundException
      (service.retrieveFile as jest.Mock).mockRejectedValueOnce(
        new NotFoundException('File not found'),
      );

      const mockResponse: Partial<Response> = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await expect(
        controller.retrieveFile(
          retrieveFileDto.fileStoreId,
          mockResponse as Response,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(service.retrieveFile).toHaveBeenCalledWith(retrieveFileDto);
      expect(mockResponse.setHeader).not.toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.send).not.toHaveBeenCalled();
    });
  });

  describe('getFileMetadata', () => {
    it('should throw NotFoundException if file does not exist', async () => {
      const getFileMetadataDto: GetFileMetadataDto = { fileStoreId: 1 };

      // Mock the service to throw NotFoundException
      (service.getFileMetadata as jest.Mock).mockRejectedValueOnce(
        new NotFoundException('Metadata not found'),
      );

      await expect(
        controller.getFileMetadata(getFileMetadataDto.fileStoreId),
      ).rejects.toThrow(NotFoundException);

      expect(service.getFileMetadata).toHaveBeenCalledWith(getFileMetadataDto);
    });

    it('should retrieve file metadata successfully', async () => {
      const getFileMetadataDto: GetFileMetadataDto = { fileStoreId: 1 };
      const mockMetadata = {
        description: 'User profile picture',
        uploadDate: '2023-10-05T12:34:56Z',
      };

      (service.getFileMetadata as jest.Mock).mockResolvedValueOnce(
        mockMetadata,
      );

      const response = await controller.getFileMetadata(
        getFileMetadataDto.fileStoreId,
      );

      expect(service.getFileMetadata).toHaveBeenCalledWith(getFileMetadataDto);
      expect(response).toEqual({
        data: {
          fileMetadata: mockMetadata,
        },
        message: 'Metadata retrieved successfully.',
        errors: {},
      });
    });
  });
});
