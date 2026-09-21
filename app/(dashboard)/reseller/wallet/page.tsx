/**
 * @file app/(dashboard)/reseller/wallet/page.tsx
 *
 * Wallet home now lives under Deposits.
 *
 * @module Dashboard
 */

import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/navigation';

export default function ResellerWalletRedirectPage(): never {
  redirect(ROUTES.reseller.deposits);
}
