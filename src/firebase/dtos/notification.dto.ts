import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

// Standard Firebase notification structure
export class NotificationDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string; // Renamed from message

  @IsString()
  @IsOptional()
  imageUrl?: string; // Renamed from image
}

// Main DTO for sending push notifications
export class SendPushNotificationDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @ValidateNested()
  @Type(() => NotificationDto)
  notification: NotificationDto;

  @IsObject()
  @IsOptional()
  data?: Record<string, string>; // Combines itemId, type, and info into a standard data object
}
