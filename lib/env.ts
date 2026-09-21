/**
 * @file lib/env.ts
 *
 * Environment helpers for server scripts and invite URLs.
 *
 * @module Env
 */

import { ValidationError } from '@/lib/errors';

/**
 * Returns a required environment variable.
 *
 * @param name - Variable name
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ValidationError('MISSING_ENV', `${name} is not set`);
  }
  return value;
}

/**
 * Public application origin used to build invite links.
 */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
}
