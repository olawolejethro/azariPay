import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateFcmTokenDto {
  @ApiProperty({
    description: 'FCM device token',
    example: 'eQ23sdXYZ:APA91bHDdj...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'Device platform',
    example: 'ios',
    enum: ['ios', 'android', 'web'],
  })
  @IsString()
  @IsIn(['ios', 'android', 'web'])
  platform: string;
}
