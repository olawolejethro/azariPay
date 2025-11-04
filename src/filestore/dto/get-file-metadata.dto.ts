// src/filestore/dto/get-file-metadata.dto.ts

import { IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class GetFileMetadataDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  fileStoreId: number;
}
