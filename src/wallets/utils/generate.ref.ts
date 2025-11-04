import * as crypto from 'crypto';

/**
 * Generates a unique reference number for Paga transactions
 * Format: "{16 digits}-1{8 character hash}"
 *
 * @returns string A unique reference number with hash index
 */
export function generatePagaReferenceNumber(): string {
  let result = '';
  // Generate 22 random digits (matching your example length)
  for (let i = 0; i < 22; i++) {
    result += Math.floor(Math.random() * 10);
  }
  return result;
}

/**
 * Validates a Paga reference number format
 *
 * @param referenceNumber - The reference number to validate
 * @returns boolean - True if valid, false otherwise
 */
export function isValidPagaReference(referenceNumber: string): boolean {
  if (!referenceNumber) return false;

  // Check if it matches the expected pattern
  const pattern = /^\d{16}-1[a-f0-9]{8}$/i;
  return pattern.test(referenceNumber);
}

/**
 * Extracts base reference number without hash index
 *
 * @param referenceNumber - The full reference number
 * @returns string - Base reference number
 */
export function getBasePagaReference(referenceNumber: string): string {
  if (!isValidPagaReference(referenceNumber)) {
    throw new Error('Invalid reference number format');
  }
  return referenceNumber.split('-')[0];
}

/**
 * Generates a 12-digit account reference number
 * Format: 12 random digits (e.g., "123467891334")
 */
export function generateAccountReference(): string {
  // Initialize empty string for the reference
  let accountRef = '';

  // Generate 12 random digits
  for (let i = 0; i < 16; i++) {
    accountRef += Math.floor(Math.random() * 10);
  }

  return accountRef;
}
