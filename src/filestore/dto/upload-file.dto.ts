// src/filestore/dto/upload-file.dto.ts

import { IsNotEmpty, IsString } from 'class-validator';

export class UploadFileDto {
  @IsNotEmpty()
  file: Express.Multer.File;

  @IsNotEmpty()
  @IsString()
  fileMetadata: string; // JSON string
}
