// src/wallet/config/cache.config.ts
export const WALLET_CACHE_CONFIG = {
  // Cache keys prefixes
  PREFIXES: {
    USER_WALLETS: 'user_wallets:',
    WALLET_DETAILS: 'wallet_details:',
    TRANSACTIONS: 'wallet_transactions:',
    BENEFICIARIES: 'wallet_beneficiaries:',
    DEPOSIT_INSTRUCTIONS: 'deposit_instructions:',
    EXCHANGE_RATE: 'exchange_rate:',
    TRANSFER_STATUS: 'transfer_status:',
  },

  // TTL values in seconds
  TTL: {
    DEFAULT: 300, // 5 minutes
    SHORT: 60, // 1 minute
    LONG: 3600, // 1 hour
  },
} as const;
