import { IsMobilePhone, IsString } from 'class-validator';

export class ResendOtpDto {
  @IsString()
  @IsMobilePhone()
  phoneNumber: string;
}
