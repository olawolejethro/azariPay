import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export enum NotificationType {
  P2P_TRADE_REQUEST = 'P2P_TRADE_REQUEST',
  PAYMENT_REQUEST = 'PAYMENT_REQUEST',
  TRANSFER_COMPLETE = 'TRANSFER_COMPLETE',
  CURRENCY_CONVERSION = 'CURRENCY_CONVERSION',
  WALLET_FUNDED = 'WALLET_FUNDED',
  KYC_STATUS = 'KYC_STATUS',
  SYSTEM_ANNOUNCEMENT = 'SYSTEM_ANNOUNCEMENT',
  SECURITY_ALERT = 'SECURITY_ALERT',
  CUSTOM = 'CUSTOM',
  TRADE_COMPLETED = 'TRADE_COMPLETED', // Added for trade completion notifications
  P2P_TRADE_CANCELLED = 'P2P_TRADE_CANCELLED', // Added for trade cancellation notifications
  NEW_P2P_TRADE = 'NEW_P2P_TRADE', // Added for new P2P trade notifications
  P2P_PAYMENT_CONFIRMATION = 'P2P_PAYMENT_CONFIRMATION', // Added for payment confirmation notifications
  P2P_PAYMENT_SENT = 'P2P_PAYMENT_SENT', // Added for payment sent notifications
  P2P_DISPUTE_CREATED = 'P2P_DISPUTE_CREATED',
  P2P_DISPUTE_RESOLVED = 'P2P_DISPUTE_RESOLVED',
  P2P_PAYMENT_REMINDER = 'P2P_PAYMENT_REMINDER',
  P2P_RATE_RESET = 'P2P_RATE_RESET',
  P2P_NEGOTIATION_REQUEST = 'P2P_NEGOTIATION_REQUEST',
  P2P_RATE_NEGOTIATION = 'P2P_RATE_NEGOTIATION',
  P2P_NEGOTIATION_CANCELLED = 'P2P_NEGOTIATION_CANCELLED',
  P2P_NEGOTIATION_MESSAGE = 'P2P_NEGOTIATION_MESSAGE',
  p2p_trade_cancelled = 'p2p_trade_cancelled',
  p2p_seller_ready = 'p2p_seller_ready',
  p2p_trade_completed = 'p2p_trade_completed',
  DISPUTE_CREATED = 'DISPUTE_CREATED',
}

export class CreateNotificationDto {
  @IsNumber()
  @IsNotEmpty()
  userId: number; // Target user ID

  @IsEnum(NotificationType)
  @IsNotEmpty()
  type: NotificationType;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>; // Additional data for the notification

  @IsString()
  @IsOptional()
  action?: string; // Deep link or action URL

  @IsBoolean()
  @IsOptional()
  sendPush?: boolean = true; // Whether to send push notification

  @IsString()
  @IsOptional()
  category?: string; // For grouping notifications

  @IsString()
  @IsOptional()
  priority?: 'low' | 'normal' | 'high' = 'normal';
}

// Bulk notification DTO
export class CreateBulkNotificationDto {
  @IsArray()
  @IsNumber({}, { each: true })
  @IsNotEmpty()
  userIds: number[]; // Array of target user IDs

  @IsEnum(NotificationType)
  @IsNotEmpty()
  type: NotificationType;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>;

  @IsString()
  @IsOptional()
  action?: string;

  @IsBoolean()
  @IsOptional()
  sendPush?: boolean = true;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  priority?: 'low' | 'normal' | 'high' = 'normal';
}

// Template-based notification DTO
export class CreateTemplateNotificationDto {
  @IsNumber()
  @IsNotEmpty()
  userId: number;

  @IsEnum(NotificationType)
  @IsNotEmpty()
  type: NotificationType;

  @IsObject()
  @IsOptional()
  templateData?: Record<string, any>; // Data to populate template

  @IsBoolean()
  @IsOptional()
  sendPush?: boolean = true;

  @IsString()
  @IsOptional()
  action?: string;
}

class TestNotificationDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsOptional()
  message?: string;
}
