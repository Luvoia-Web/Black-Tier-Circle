/**
 * @file lib/errors.ts
 *
 * Typed application error classes for API and domain layers.
 *
 * Routes catch these classes and map them to `{ success: false, error }`
 * responses. Domain modules must throw these instead of raw strings.
 *
 * @module Errors
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    statusCode: number = 400,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export class AuthError extends AppError {
  constructor(
    code: string,
    message: string,
    statusCode: number = 401,
    details?: unknown,
  ) {
    super(code, message, statusCode, details);
    this.name = 'AuthError';
  }
}

export class TenantError extends AppError {
  constructor(
    code: string,
    message: string,
    statusCode: number = 403,
    details?: unknown,
  ) {
    super(code, message, statusCode, details);
    this.name = 'TenantError';
  }
}

export class WalletError extends AppError {
  constructor(
    code: string,
    message: string,
    statusCode: number = 400,
    details?: unknown,
  ) {
    super(code, message, statusCode, details);
    this.name = 'WalletError';
  }
}

export class PaymentError extends AppError {
  constructor(
    code: string,
    message: string,
    statusCode: number = 400,
    details?: unknown,
  ) {
    super(code, message, statusCode, details);
    this.name = 'PaymentError';
  }
}

export class FulfillmentError extends AppError {
  constructor(
    code: string,
    message: string,
    statusCode: number = 400,
    details?: unknown,
  ) {
    super(code, message, statusCode, details);
    this.name = 'FulfillmentError';
  }
}

export class ValidationError extends AppError {
  constructor(
    code: string,
    message: string,
    statusCode: number = 400,
    details?: unknown,
  ) {
    super(code, message, statusCode, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}
