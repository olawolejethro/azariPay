// src/common/exceptions/custom-too-many-requests.exception.ts

import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * CustomTooManyRequestsException
 * 
 * This exception class extends NestJS's HttpException to represent a 429 Too Many Requests error.
 * It is used to indicate that the client has sent too many requests in a given amount of time.
 */
export class CustomTooManyRequestsException extends HttpException {
  /**
   * Constructs a new CustomTooManyRequestsException.
   * @param message Optional custom error message. Defaults to 'Too many requests, please try again later.' if not provided.
   */
  constructor(message?: string) {
    super(
      message || 'Too many requests, please try again later.', 
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
}
