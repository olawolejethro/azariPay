// src/filestore/dto/retrieve-file.dto.ts

import { IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class RetrieveFileDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  fileStoreId: number;
}
