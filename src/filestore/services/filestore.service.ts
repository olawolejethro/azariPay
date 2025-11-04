// src/filestore/services/filestore.service.ts

import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { FileStore } from '../entities/filestore.entity';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { UploadFileDto } from '../dto/upload-file.dto';
import { RetrieveFileDto } from '../dto/retrieve-file.dto';
import { GetFileMetadataDto } from '../dto/get-file-metadata.dto'; // Ensure this DTO exists
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from '../../common/logger/logger.service';

/**
 * Service responsible for handling file storage operations,
 * including uploading to and retrieving from Wasabi (S3-compatible storage),
 * as well as managing file metadata.
 */
@Injectable()
export class FileStoreService {
  constructor(
    @InjectRepository(FileStore)
    private readonly fileStoreRepository: Repository<FileStore>,
    private readonly configService: ConfigService,
    private readonly s3Client: S3Client,
    private readonly logger: LoggerService, // LoggerService is properly injected
  ) {
    this.s3Client = new S3Client({
      region: 'eu-west-1',
      endpoint: `https://s3.eu-west-1.wasabisys.com`, // Add this!
      credentials: {
        accessKeyId: this.configService.get<string>('WASABI_ACCESS_KEY'),
        secretAccessKey: this.configService.get<string>('WASABI_SECRET_KEY'),
      },
      forcePathStyle: true, // Add this for Wasabi compatibility
    });
  }

  /**
   * Extracts the file extension from a filename.
   * @param filename The name of the file.
   * @returns The file extension, including the dot (e.g., '.jpg'). Returns an empty string if no extension is found.
   */
  private getFileExtension(filename: string): string {
    const index = filename.lastIndexOf('.');
    return index !== -1 ? filename.slice(index) : '';
  }

  /**
   * Uploads a file to Wasabi and saves its metadata in the database.
   * @param uploadFileDto The data transfer object containing the file and its metadata.
   * @param userId The ID of the user uploading the file.
   * @returns The saved FileStore entity.
   */
  async uploadFile(
    uploadFileDto: UploadFileDto,
    userId: number,
  ): Promise<FileStore> {
    const { file, fileMetadata } = uploadFileDto;

    console.log(
      this.configService.get<string>('WASABI_REGION'),
      'what is going on',
    );

    // Validate and parse fileMetadata
    let parsedMetadata: Record<string, any>;
    try {
      parsedMetadata = JSON.parse(fileMetadata);
    } catch (error) {
      this.logger.warn(
        `Invalid fileMetadata JSON: ${fileMetadata}`,
        'FileStoreService',
      );
      throw new BadRequestException('Invalid JSON for fileMetadata.');
    }

    // Generate unique file key
    const fileKey = `${uuidv4()}${this.getFileExtension(file.originalname)}`;

    // Get bucket name
    const bucket = this.configService.get<string>('WASABI_BUCKET_NAME');
    if (!bucket) {
      throw new Error('WASABI_BUCKET_NAME is not configured');
    }

    // Upload file to Wasabi
    try {
      const putCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        // Add metadata if needed
        Metadata: {
          'uploaded-by': userId.toString(),
          'original-name': file.originalname,
        },
      });

      await this.s3Client.send(putCommand);

      this.logger.log(
        `File uploaded to Wasabi with key: ${fileKey}`,
        'FileStoreService',
      );
    } catch (error) {
      console.log(error, 'error');
      this.logger.error(
        `Failed to upload file to Wasabi: ${error.message}`,
        error.stack,
        'FileStoreService',
      );
      throw new InternalServerErrorException('Failed to upload file.');
    }

    // Generate file URL
    const region = this.configService.get<string>('WASABI_REGION');
    console.log(region, 'reguin');
    const fileUrl = `https://${bucket}.s3.${region}.wasabisys.com/${fileKey}`;

    // Save file information in the database
    const newFile = this.fileStoreRepository.create({
      fileUrl,
      fileMetadata: parsedMetadata,
      userId,
    });

    try {
      const savedFile = await this.fileStoreRepository.save(newFile);
      this.logger.log(
        `File metadata saved with ID: ${savedFile.id}`,
        'FileStoreService',
      );
      return savedFile;
    } catch (error) {
      console.log(error, 'erree');
      // If database save fails, try to delete the uploaded file

      this.logger.error(
        `Failed to save file metadata: ${error.message}`,
        'FileStoreService',
      );
      throw new InternalServerErrorException('Failed to save file metadata.');
    }
  }

  /**
   * Retrieves a file from Wasabi based on the provided FileStore ID.
   * @param dto The data transfer object containing the FileStore ID.
   * @returns An object containing ContentType, Metadata, and the readable stream (Body).
   */
  async retrieveFile(dto: RetrieveFileDto): Promise<{
    ContentType: string;
    Metadata: Record<string, string>;
    Body: Readable;
  }> {
    const fileStore = await this.fileStoreRepository.findOne({
      where: { id: dto.fileStoreId },
    });
    if (!fileStore) {
      this.logger.warn(
        `File not found for fileStoreId: ${dto.fileStoreId}`,
        'FileStoreService',
      );
      throw new NotFoundException(
        `File not found for fileStoreId: ${dto.fileStoreId}`,
      );
    }

    const bucket = this.configService.get<string>('WASABI_BUCKET_NAME');
    const key = fileStore.fileUrl.split('/').pop(); // Extract the filename from the URL

    if (!key) {
      this.logger.error(
        `Invalid fileUrl: ${fileStore.fileUrl}`,
        'FileStoreService',
      );
      throw new InternalServerErrorException('Invalid file URL.');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      const response = await this.s3Client.send(command);

      const readableStream = response.Body as Readable;

      // Optional: Log the retrieval attempt
      this.logger.log(
        `File retrieved from Wasabi with key: ${key}`,
        'FileStoreService',
      );

      return {
        ContentType: response.ContentType || 'application/octet-stream',
        Metadata: response.Metadata || {},
        Body: readableStream,
      };
    } catch (error) {
      this.logger.error(
        `Failed to retrieve file from Wasabi: ${error.message}`,
        'FileStoreService',
      );
      throw new InternalServerErrorException(
        `Failed to retrieve file from Wasabi: ${error.message}`,
      );
    }
  }

  /**
   * Retrieves file metadata based on the provided FileStore ID.
   * @param dto The data transfer object containing the FileStore ID.
   * @returns The file metadata as a record.
   */
  async getFileMetadata(dto: GetFileMetadataDto): Promise<Record<string, any>> {
    const fileStore = await this.fileStoreRepository.findOne({
      where: { id: dto.fileStoreId },
    });
    if (!fileStore) {
      this.logger.warn(
        `File metadata not found for fileStoreId: ${dto.fileStoreId}`,
        'FileStoreService',
      );
      throw new NotFoundException(
        `File metadata not found for fileStoreId: ${dto.fileStoreId}`,
      );
    }

    this.logger.log(
      `File metadata retrieved for fileStoreId: ${dto.fileStoreId}`,
      'FileStoreService',
    );
    return fileStore.fileMetadata;
  }
}
