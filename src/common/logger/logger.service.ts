// src/common/logger/logger.service.ts

import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';

import { join } from 'path';
import * as fs from 'fs';

@Injectable()
export class LoggerService implements NestLoggerService {
  private logger: winston.Logger;

  constructor(private configService: ConfigService) {
    const logLevel = this.configService.get<string>('LOG_LEVEL') || 'info';
    const logDir = this.configService.get<string>('LOG_DIR') || 'logs';

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    this.logger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      transports: [
        // Console Transport
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),

        // Combined Transport: All log levels
        new winston.transports.File({
          filename: join(logDir, 'combined.txt'),
          level: 'silly', // Captures all levels (silly is the lowest)
        }),

        // Logs Transport: info and above
        new winston.transports.File({
          filename: join(logDir, 'logs.txt'),
          level: 'info', // Captures info, warn, and error
        }),

        // Errors Transport: error only
        new winston.transports.File({
          filename: join(logDir, 'errors.txt'),
          level: 'error', // Captures error only
        }),
      ],
      exitOnError: false, // Do not exit on handled exceptions
    });
  }

  /**
   * Logs informational messages.
   * 
   * @param message - The message to log.
   * @param context - Optional context for the log.
   */
  log(message: string, context?: string): void {
    this.logger.info({ message, context });
  }

  /**
   * Logs error messages.
   * 
   * @param message - The error message to log.
   * @param trace - The stack trace or additional details.
   * @param context - Optional context for the log.
   */
  error(message: string, trace?: string, context?: string): void;

  /**
   * Logs Error objects.
   * 
   * @param error - The Error object to log.
   * @param context - Optional context for the log.
   */
  error(error: Error, context?: string): void;

  /**
   * Implementation of the overloaded error method.
   * Determines the type of the first argument and logs accordingly.
   * 
   * @param arg1 - Either a string message or an Error object.
   * @param arg2 - Either the trace string or the context string.
   * @param arg3 - The context string (only applicable if arg1 is a string).
   */
  error(arg1: string | Error, arg2?: string, arg3?: string): void {
    if (arg1 instanceof Error) {
      const error = arg1;
      const context = arg2 || 'Application';
      const trace = error.stack || 'No stack trace available';
      this.logger.error({ message: error.message, trace, context });
    } else {
      const message = arg1;
      const trace = arg2 || '';
      const context = arg3 || 'Application';
      this.logger.error({ message, trace, context });
    }
  }

  /**
   * Logs warning messages.
   * 
   * @param message - The warning message to log.
   * @param context - Optional context for the log.
   */
  warn(message: string, context?: string): void {
    this.logger.warn({ message, context });
  }

  /**
   * Logs debug messages.
   * 
   * @param message - The debug message to log.
   * @param context - Optional context for the log.
   */
  debug?(message: string, context?: string): void {
    this.logger.debug?.({ message, context });
  }

  /**
   * Logs verbose messages.
   * 
   * @param message - The verbose message to log.
   * @param context - Optional context for the log.
   */
  verbose?(message: string, context?: string): void {
    this.logger.verbose?.({ message, context });
  }
}
