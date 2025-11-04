// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { LoggerService } from './common/logger/logger.service';
import { json, urlencoded } from 'express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { EncryptionService } from './common/encryption/encryption.service';
import { setEncryptionService } from './common/encryption/transformers/encrypted-column.transformer';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const logger = app.get(LoggerService);
  app.useLogger(logger);

  // ✅ Add console.log to verify this runs
  console.log('🔍 Attempting to initialize encryption transformers...');

  const encryptionService = app.get(EncryptionService);
  setEncryptionService(encryptionService);

  console.log('✅ Encryption transformers initialization complete');
  // Set secure HTTP headers
  app.use(helmet());

  // Configure raw body capture for webhook signature verification
  // This must be BEFORE the global json middleware
  app.use(
    '/webhooks/sumsub-kyc',
    json({
      limit: '10mb',
      verify: (req: any, res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  // Global JSON and URL-encoded parsers (for non-webhook routes)
  app.use(json({ limit: '80mb' }));
  app.use(urlencoded({ extended: true, limit: '80mb' }));

  // Enable CORS with specific origins
  app.enableCors({
    origin: ['https://your-frontend-domain.com', 'http://localhost:3000'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('BongoPay Auth API')
    .setDescription('API documentation for BongoPay Authentication Module')
    .setVersion('1.0')
    .addBearerAuth()
    .addServer('https://bongopay-api.peachblossoms.ng', 'Production')
    .addServer('http://localhost:3000', 'Development')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = 3001;

  await app.listen(port);

  logger.log(
    `🚀 Application is running on: ${await app.getUrl()}`,
    'Bootstrap',
  );
  logger.log(
    `📚 Swagger docs available at: ${await app.getUrl()}/api/docs`,
    'Bootstrap',
  );
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
});
