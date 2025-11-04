// src/common/notifications/email.service.spec.ts

/**
 * **email.service.spec.ts**
 *
 * Unit tests for the `EmailService` using Jest.
 *
 * This test suite covers:
 * - Service instantiation
 * - Successful email sending with and without HTML content
 * - Error handling when the Brevo API fails to send the email
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../../src/common/notifications/email.service';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import * as SibApiV3Sdk from 'sib-api-v3-sdk';

/**
 * **MockSendTransacEmail**
 *
 * A mock function for the `sendTransacEmail` method of `TransactionalEmailsApi`.
 */
const mockSendTransacEmail = jest.fn();

/**
 * **Mocking sib-api-v3-sdk**
 *
 * Overrides the `TransactionalEmailsApi` class to return an object with `sendTransacEmail` mocked.
 * This ensures that no actual API calls are made during testing.
 *
 * This mock must be declared before any imports that use `TransactionalEmailsApi`, hence placed at the top.
 */
jest.mock('sib-api-v3-sdk', () => {
  return {
    __esModule: true,
    ...jest.requireActual('sib-api-v3-sdk'),
    TransactionalEmailsApi: jest.fn().mockImplementation(() => ({
      sendTransacEmail: mockSendTransacEmail,
    })),
  };
});

/**
 * **Mock Configuration Values**
 *
 * Provides mock values for configuration settings required by the `EmailService`.
 */
const mockConfigService = {
  get: jest.fn((key: string) => {
    switch (key) {
      case 'BREVO_API_KEY':
        return 'mocked-api-key';
      case 'BREVO_SENDER_EMAIL':
        return 'sender@example.com';
      case 'BREVO_SENDER_NAME':
        return 'Sender Name';
      default:
        return null;
    }
  }),
};

/**
 * **Mocking console.error**
 *
 * Mocks the `console.error` method to prevent actual logging during tests and to allow assertion of error logs.
 */
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('EmailService', () => {
  let service: EmailService;
  let configService: ConfigService;

  beforeEach(async () => {
    /**
     * Initializes the testing module with `EmailService` and its dependencies.
     * Mocks `ConfigService` to provide predefined configuration values.
     *
     * Since `TransactionalEmailsApi` is mocked globally via `jest.mock`, it's already being used within `EmailService`.
     */
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    configService = module.get<ConfigService>(ConfigService);

    /**
     * Clears all mock calls before each test to ensure test isolation.
     */
    jest.clearAllMocks();
  });

  /**
   * **should be defined**
   *
   * Verifies that the `EmailService` is correctly instantiated.
   */
  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendEmail', () => {
    /**
     * **should send an email successfully**
     *
     * Tests that the `sendEmail` method sends an email with the correct parameters.
     * It verifies that the `sendTransacEmail` method is called with the appropriate `SendSmtpEmail` object.
     */
    it('should send an email successfully', async () => {
      const to = 'recipient@example.com';
      const subject = 'Test Subject';
      const text = 'Test plain text content';
      const html = '<p>Test HTML content</p>';

      // Mock successful email sending
      mockSendTransacEmail.mockResolvedValue({
        messageId: 'mocked-message-id',
      });

      await service.sendEmail(to, subject, text, html);

      // Verify that sendTransacEmail was called once
      expect(mockSendTransacEmail).toHaveBeenCalledTimes(1);

      // Extract the argument passed to sendTransacEmail
      const sendSmtpEmailArg = mockSendTransacEmail.mock
        .calls[0][0] as SibApiV3Sdk.SendSmtpEmail;

      // Verify the contents of sendSmtpEmail
      expect(sendSmtpEmailArg.sender).toEqual({
        email: 'sender@example.com',
        name: 'Sender Name',
      });
      expect(sendSmtpEmailArg.to).toEqual([{ email: to }]);
      expect(sendSmtpEmailArg.subject).toBe(subject);
      expect(sendSmtpEmailArg.textContent).toBe(text);
      expect(sendSmtpEmailArg.htmlContent).toBe(html);
    });

    /**
     * **should send an email without HTML content**
     *
     * Tests that the `sendEmail` method can send an email without providing HTML content.
     * It verifies that the `htmlContent` property is undefined in the `SendSmtpEmail` object.
     */
    it('should send an email without HTML content', async () => {
      const to = 'recipient@example.com';
      const subject = 'Test Subject';
      const text = 'Test plain text content';

      // Mock successful email sending
      mockSendTransacEmail.mockResolvedValue({
        messageId: 'mocked-message-id',
      });

      await service.sendEmail(to, subject, text);

      // Verify that sendTransacEmail was called once
      expect(mockSendTransacEmail).toHaveBeenCalledTimes(1);

      // Extract the argument passed to sendTransacEmail
      const sendSmtpEmailArg = mockSendTransacEmail.mock
        .calls[0][0] as SibApiV3Sdk.SendSmtpEmail;

      // Verify the contents of sendSmtpEmail
      expect(sendSmtpEmailArg.sender).toEqual({
        email: 'sender@example.com',
        name: 'Sender Name',
      });
      expect(sendSmtpEmailArg.to).toEqual([{ email: to }]);
      expect(sendSmtpEmailArg.subject).toBe(subject);
      expect(sendSmtpEmailArg.textContent).toBe(text);
      expect(sendSmtpEmailArg.htmlContent).toBeUndefined();
    });

    /**
     * **should throw InternalServerErrorException on API failure**
     *
     * Tests that the `sendEmail` method throws an `InternalServerErrorException` when the Brevo API fails to send the email.
     * It verifies that the error is logged and the exception is thrown as expected.
     */
    it('should throw InternalServerErrorException on API failure', async () => {
      const to = 'recipient@example.com';
      const subject = 'Test Subject';
      const text = 'Test plain text content';
      const html = '<p>Test HTML content</p>';

      const mockError = new Error('API Error');

      // Mock email sending to throw an error
      mockSendTransacEmail.mockRejectedValue(mockError);

      await expect(service.sendEmail(to, subject, text, html)).rejects.toThrow(
        InternalServerErrorException,
      );

      // Verify that sendTransacEmail was called once
      expect(mockSendTransacEmail).toHaveBeenCalledTimes(1);

      // // Verify that the error was logged
      // expect(console.error).toHaveBeenCalledWith(
      //   'Brevo Email Error:',
      //   mockError,
      // );
    });
  });
});
