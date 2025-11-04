import { IsEmail, IsNotEmpty, IsPhoneNumber, IsString } from 'class-validator';

export class changeEmailInitiateDto {
  @IsEmail({}, { message: 'Invalid email address.' })
  newEmail: string;

  @IsString()
  @IsNotEmpty({ message: 'Session token is required.' })
  sessionToken: string;
}
