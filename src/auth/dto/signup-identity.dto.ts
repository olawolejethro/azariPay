// src/auth/dto/signup-identity.dto.ts
import { IsString, IsIn, IsInt } from 'class-validator';

export class SignupIdentityDto {
  @IsString()
  @IsIn(['drivers_license', 'passport', 'id_card'], {
    message: 'Invalid identity category.',
  })
  identityCategory: string;

  @IsString()
  originCountryOfIdentity: string;

  @IsInt({ message: 'identityFileStoreId must be an integer.' })
  identityFileStoreId: number;
}
