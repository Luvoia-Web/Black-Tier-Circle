/**
 * @file lib/clipboard.ts
 *
 * Browser clipboard helper with a fallback for older browsers.
 *
 * Used by the order detail drawer copy buttons so operators can copy
 * order IDs, payment refs, and delivered content without leaving the page.
 *
 * @module Clipboard
 */

/**
 * Copies plain text to the clipboard.
 *
 * @param text - Value to copy
 * @returns Whether the copy succeeded
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyWithTextareaFallback(text);
  }
}

/**
 * Copies via a temporary textarea when the Clipboard API is unavailable.
 *
 * @param text - Value to copy
 * @returns Whether `document.execCommand('copy')` succeeded
 */
function copyWithTextareaFallback(text: string): boolean {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.left = '-9999px';
  document.body.appendChild(field);
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(field);
  }
}
