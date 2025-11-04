const mockAptPayService = {
  // Basic transaction methods
  processPayment: jest.fn().mockResolvedValue({
    success: true,
    transactionId: 'test-tx-123',
  }),
  verifyTransaction: jest.fn().mockResolvedValue({
    verified: true,
    status: 'COMPLETED',
  }),
  createTransaction: jest.fn().mockResolvedValue({
    id: 'test-tx-123',
    status: 'PENDING',
  }),
  getTransaction: jest.fn().mockResolvedValue({
    id: 'test-tx-123',
    status: 'COMPLETED',
  }),

  // Webhook methods
  processWebhook: jest.fn().mockResolvedValue({
    status: 'processed',
  }),
  verifyWebhookSignature: jest.fn().mockReturnValue(true),

  // Transfer methods (without polling)
  initiateTransfer: jest.fn().mockResolvedValue({
    success: true,
    reference: 'test-ref-123',
  }),
  validateAccount: jest.fn().mockResolvedValue({
    valid: true,
    accountName: 'Test Account',
  }),

  // Payment request methods
  createPaymentRequest: jest.fn().mockResolvedValue({
    id: 'req-123',
    status: 'CREATED',
  }),
  getPaymentRequest: jest.fn().mockResolvedValue({
    id: 'req-123',
    status: 'COMPLETED',
  }),

  // General utility methods
  getTransactionStatus: jest.fn().mockResolvedValue({
    state: 'SUCCEEDED',
    transferFees: 50,
    transactionAmount: 1000,
  }),
  calculateFees: jest.fn().mockResolvedValue(50),

  // Add any other methods your service uses (but NOT polling methods)
};
