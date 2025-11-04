import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitReportDto {
  @IsNotEmpty()
  @IsString()
  transactionType: string; // "P2P Trade" as shown in UI

  @IsNotEmpty()
  @IsString()
  transactionId: string; // "1234678nv78l78" format as shown in UI

  @IsOptional()
  @IsString()
  uploadReceipt?: string; // URL of uploaded document (matches "Upload Receipt" field)

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  moreInformation?: string; // Matches "More information" field from UI
}
