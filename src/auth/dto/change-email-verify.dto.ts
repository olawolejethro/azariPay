import { IsNotEmpty, IsString } from 'class-validator';

export class changeEmailVerifyDto {
  @IsString()
  @IsNotEmpty({ message: 'Session token is required.' })
  sessionToken: string;

  @IsString()
  @IsNotEmpty({ message: 'OTP is required.' })
  otp: string;
}
