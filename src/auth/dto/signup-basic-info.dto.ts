// src/auth/dto/signup-basic-info.dto.ts
import {
  IsString,
  IsEmail,
  Matches,
  IsOptional,
  ValidateNested,
  IsDateString,
  IsEnum,
  IsNotEmpty,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHERS',
}

class AddressDto {
  @IsString()
  street: string;

  @IsString()
  apartmentNumber: string;

  @IsString()
  city: string;

  @IsString()
  stateProvince: string;

  @Matches(/^[A-Za-z]\d[A-Za-z]\s\d[A-Za-z]\d$/, {
    message: 'ZIP Code must be in Canadian postal code format (e.g., M2A 1A1).',
  })
  zipCode: string;
}
// Enums for the new fields
export enum Occupation {
  // Healthcare & Medical
  CHIROPRACTOR = 'Chiropractor',
  DENTIST = 'Dentist',
  DIETITIAN = 'Dietitian',
  OPTOMETRIST = 'Optometrist',
  PHARMACIST = 'Pharmacist',
  PHYSICIAN = 'Physician',
  PODIATRIST = 'Podiatrist',
  THERAPIST = 'Therapist',
  NURSE = 'Nurse',
  VETERINARIAN = 'Veterinarian',

  // Engineering & Technology
  ENGINEERING_MANAGER = 'Engineering Manager',
  SOFTWARE_ENGINEER = 'Software Engineer',
  MECHANICAL_ENGINEER = 'Mechanical Engineer',
  ELECTRICAL_ENGINEER = 'Electrical Engineer',
  CIVIL_ENGINEER = 'Civil Engineer',
  DATA_SCIENTIST = 'Data Scientist',

  // Business & Finance
  ACCOUNTANT = 'Accountant',
  FINANCIAL_ADVISOR = 'Financial Advisor',
  BUSINESS_ANALYST = 'Business Analyst',
  PROJECT_MANAGER = 'Project Manager',
  CONSULTANT = 'Consultant',
  SALES_REPRESENTATIVE = 'Sales Representative',
  MARKETING_MANAGER = 'Marketing Manager',

  // Education & Research
  TEACHER = 'Teacher',
  PROFESSOR = 'Professor',
  RESEARCHER = 'Researcher',
  LIBRARIAN = 'Librarian',

  // Legal & Government
  LAWYER = 'Lawyer',
  PARALEGAL = 'Paralegal',
  GOVERNMENT_EMPLOYEE = 'Government Employee',

  // Arts & Media
  DESIGNER = 'Designer',
  ARTIST = 'Artist',
  WRITER = 'Writer',
  PHOTOGRAPHER = 'Photographer',

  // Service Industry
  CHEF = 'Chef',
  HAIRSTYLIST = 'Hairstylist',
  FITNESS_TRAINER = 'Fitness Trainer',

  // General Categories
  STUDENT = 'Student',
  SELF_EMPLOYED = 'Self-employed',
  BUSINESS_OWNER = 'Business Owner',
  FREELANCER = 'Freelancer',
  RETIRED = 'Retired',
  HOMEMAKER = 'Homemaker',
  UNEMPLOYED = 'Unemployed',
  OTHER = 'Other',
}

export enum ExpectedTransactionVolume {
  FROM_0_TO_4999 = '0 CAD - 4,999 CAD',
  FROM_5000_TO_9999 = '5,000 CAD - 9,999 CAD',
  FROM_10000_TO_49999 = '10,000 CAD - 49,999 CAD',
}
export enum ExpectedTransactionVolume {
  UNDER_1000 = 'Under $1,000',
  FROM_1000_TO_5000 = '$1,000 - $5,000',
  FROM_5000_TO_10000 = '$5,000 - $10,000',
  FROM_10000_TO_25000 = '$10,000 - $25,000',
  FROM_25000_TO_50000 = '$25,000 - $50,000',
  FROM_50000_TO_100000 = '$50,000 - $100,000',
  OVER_100000 = 'Over $100,000',
}

export class SignupBasicInfoDto {
  @IsString()
  @Matches(/^[A-Za-z\-\s]+$/, {
    message: 'First name can only contain letters, hyphens, and spaces.',
  })
  @Transform(({ value }) => value.trim())
  firstName: string;

  @IsString()
  @Matches(/^[A-Za-z\-\s]+$/, {
    message: 'Last name can only contain letters, hyphens, and spaces.',
  })
  @Transform(({ value }) => value.trim())
  lastName: string;

  @IsEmail({}, { message: 'Invalid email address.' })
  interacEmailAddress: string;

  @IsEnum(Gender, { message: 'Gender must be a valid option.' })
  @IsNotEmpty({ message: 'Gender is required.' })
  gender: Gender;

  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @IsOptional()
  @IsString()
  referralCode?: string;

  @IsDateString({}, { message: 'Date of birth must be a valid date.' })
  dateOfBirth: string;

  @IsString()
  @IsNotEmpty({ message: 'Session token is required.' })
  sessionToken: string;

  // New fields for occupation and transaction volume
  @IsEnum(Occupation, { message: 'Occupation must be a valid option.' })
  @IsNotEmpty({ message: 'Occupation is required.' })
  occupation: Occupation;

  @IsEnum(ExpectedTransactionVolume, {
    message: 'Expected transaction volume must be a valid option.',
  })
  @IsNotEmpty({ message: 'Expected monthly transaction volume is required.' })
  expectedTransactionVolume: ExpectedTransactionVolume;
}
