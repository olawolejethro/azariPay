import { IsArray, IsNumber } from 'class-validator';

export class UpdateNotificationStatusDto {
  @IsNumber()
  notificationId: number;
}

export class BulkUpdateNotificationDto {
  @IsArray()
  @IsNumber({}, { each: true })
  notificationIds: number[];
}
