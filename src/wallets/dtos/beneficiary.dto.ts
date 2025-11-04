// src/wallet/dto/beneficiary.dto.ts
export class BeneficiaryResponseDto {
  id: string;
  walletId: string;
  type: 'BANK_ACCOUNT' | 'MOBILE_MONEY' | 'WALLET';
  accountNumber?: string;
  accountName?: string;
  bankCode?: string;
  bankName?: string;
  mobileNumber?: string;
  provider?: string;
  countryCode: string;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
}

export class CreateBeneficiaryDto {
  type: 'BANK_ACCOUNT' | 'MOBILE_MONEY' | 'WALLET';
  accountNumber?: string;
  accountName?: string;
  bankCode?: string;
  mobileNumber?: string;
  provider?: string;
  status: 'ACTIVE' | 'INACTIVE';
  countryCode: string;
  currency: string;
}
