import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FileStore } from '../entities/filestore.entity';
import { Repository } from 'typeorm';

describe('FileStoreController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let fileStoreRepository: Repository<FileStore>;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get<JwtService>(JwtService);
    fileStoreRepository = moduleFixture.get<Repository<FileStore>>(
      getRepositoryToken(FileStore),
    );

    await app.init();

    // Create auth token for tests
    authToken = jwtService.sign({ userId: 1, email: 'test@example.com' });
  });

  beforeEach(async () => {
    // Clear the filestore table before each test
    await fileStoreRepository.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/filestore', () => {
    // it('should upload a file successfully', async () => {
    //   const response = await request(app.getHttpServer())
    //     .post('/api/v1/filestore')
    //     .set('Authorization', `Bearer ${authToken}`)
    //     .field(
    //       'fileMetadata',
    //       JSON.stringify({ description: 'User profile picture' }),
    //     )
    //     .attach('file', Buffer.from('test file content'), 'test.jpg')
    //     .expect(HttpStatus.CREATED);

    //   expect(response.body).toMatchObject({
    //     data: {
    //       id: expect.any(Number),
    //       fileUrl: expect.any(String),
    //     },
    //     message: 'Your file has been stored successfully.',
    //     errors: {},
    //   });
    // });

    it('should throw BadRequestException if file is not provided', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/filestore')
        .set('Authorization', `Bearer ${authToken}`)
        .field(
          'fileMetadata',
          JSON.stringify({ description: 'User profile picture' }),
        )
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body.message).toBe('File is required.');
    });
  });

  describe('GET /api/v1/filestore/:fileStoreId', () => {
    let createdFileStore: FileStore;

    beforeEach(async () => {
      // Create a test file record
      createdFileStore = await fileStoreRepository.save({
        fileUrl: `https://test-bucket.s3.region.wasabisys.com/${Date.now()}.jpg`,
        fileMetadata: { description: 'Test file' },
        userId: 1,
      });
    });

    // it('should retrieve a file successfully', async () => {
    //   const response = await request(app.getHttpServer())
    //     .get(`/api/v1/filestore/${createdFileStore.id}`)
    //     .set('Authorization', `Bearer ${authToken}`)
    //     .expect(HttpStatus.OK);

    //   // Add appropriate assertions based on your expected response
    // });

    it('should throw NotFoundException if file does not exist', async () => {
      const nonExistentId = 99999;
      const response = await request(app.getHttpServer())
        .get(`/api/v1/filestore/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.NOT_FOUND);

      expect(response.body.message).toContain('File not found');
    });
  });

  describe('GET /api/v1/filestore/:fileStoreId/metadata', () => {
    let createdFileStore: FileStore;

    beforeEach(async () => {
      // Create a test file record with unique fileUrl
      createdFileStore = await fileStoreRepository.save({
        fileUrl: `https://test-bucket.s3.region.wasabisys.com/${Date.now()}.jpg`,
        fileMetadata: { description: 'Test file' },
        userId: 1,
      });
    });

    it('should retrieve file metadata successfully', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/filestore/${createdFileStore.id}/metadata`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toMatchObject({
        data: {
          fileMetadata: expect.any(Object),
        },
        message: 'Metadata retrieved successfully.',
        errors: {},
      });
    });
  });
});
