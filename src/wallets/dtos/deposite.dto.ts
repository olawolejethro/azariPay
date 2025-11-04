// src/wallet/dto/deposit.dto.ts
export class DepositInstructionsResponseDto {
  walletId: string;
  currency: string;
  depositMethods: DepositMethodDto[];
  instructions: Record<string, any>;
  additionalInfo?: Record<string, any>;
}

export class DepositMethodDto {
  id: string;
  name: string;
  type: string;
  processingTime: string;
  minimumAmount: number;
  maximumAmount: number;
  fees: DepositFeeDto[];
  requiredFields: string[];
}

export class DepositFeeDto {
  type: string;
  value: number;
  currency: string;
}
