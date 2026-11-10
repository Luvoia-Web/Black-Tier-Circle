/**
 * Plain-text product card fields. Supplier hints are read only from explicit keys.
 * Product titles are never parsed for a duration or a warranty.
 */

import { ValidationError } from '@/lib/errors';

const DURATION_KEYS = ['duration', 'durationText', 'duration_text'] as const;
const WARRANTY_KEYS = ['warranty', 'warrantyText', 'warranty_text'] as const;
const TYPE_KEYS = ['typeLabel', 'type_label'] as const;

export type CardHints = {
  readonly durationText: string | null;
  readonly warrantyText: string | null;
  readonly typeLabel: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Accepts a short plain string. Empty, "N/A", and markup become null.
 * Values longer than 60 characters become null so a supplier payload cannot throw.
 */
export function hintCardText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.replace(/[\r\n\t]+/g, ' ').trim();
  if (trimmed.length === 0 || trimmed.length > 60) {
    return null;
  }
  if (/[<>]/.test(trimmed)) {
    return null;
  }
  const lowered = trimmed.toLowerCase();
  if (lowered === 'n/a' || lowered === 'null' || lowered === 'undefined' || lowered === 'none') {
    return null;
  }
  return trimmed;
}

/**
 * Owner input. Empty clears the field. Anything over 60 characters or with markup is rejected.
 */
export function normalizeCardText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.replace(/[\r\n\t]+/g, ' ').trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > 60 || /[<>]/.test(trimmed)) {
    throw new ValidationError('INVALID_CARD_TEXT', 'Use 60 characters of plain text or less');
  }
  const lowered = trimmed.toLowerCase();
  if (lowered === 'n/a' || lowered === 'null' || lowered === 'undefined') {
    return null;
  }
  return trimmed;
}

function firstHint(row: Record<string, unknown> | null, keys: readonly string[]): string | null {
  if (!row) {
    return null;
  }
  for (const key of keys) {
    const hint = hintCardText(row[key]);
    if (hint) {
      return hint;
    }
  }
  return null;
}

/**
 * Reads duration, warranty, and type label from a supplier object or from supplier_metadata.
 * `name`, `title`, and `productType` are ignored.
 */
export function readCardHints(source: unknown): CardHints {
  const row = asRecord(source);
  const nested = asRecord(row?.supplierMetadata) ?? asRecord(row?.supplier_metadata);
  return {
    durationText: firstHint(nested, DURATION_KEYS) ?? firstHint(row, DURATION_KEYS),
    warrantyText: firstHint(nested, WARRANTY_KEYS) ?? firstHint(row, WARRANTY_KEYS),
    typeLabel: firstHint(nested, TYPE_KEYS) ?? firstHint(row, TYPE_KEYS),
  };
}
