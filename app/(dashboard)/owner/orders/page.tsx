/**
 * @file app/(dashboard)/owner/orders/page.tsx
 *
 * Owner order management with tabs and manual fulfillment actions.
 *
 * @module Dashboard
 */

import { Suspense } from 'react';
import { OwnerOrdersBoard } from '@/components/orders/owner-orders-board';
import { asDbClient } from '@/lib/auth/session';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { listOrders } from '@/modules/orders';

export const metadata = { title: 'Orders' };

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export default async function OwnerOrdersPage(): Promise<JSX.Element> {
  const db = asDbClient(createAdminSupabaseClient());
  const orders = await listOrders(db, { limit: 200 });
  const today = startOfToday();
  const stats = {
    totalToday: orders.filter((order) => order.createdAt >= today).length,
    pendingPayment: orders.filter(
      (order) => order.paymentStatus === 'awaiting' || order.paymentStatus === 'pending_verification',
    ).length,
    pendingFulfillment: orders.filter(
      (order) =>
        order.fulfillmentStatus === 'queued' ||
        order.fulfillmentStatus === 'manual_pending' ||
        order.fulfillmentStatus === 'supplier_pending',
    ).length,
    completedToday: orders.filter(
      (order) =>
        order.fulfillmentStatus === 'ready' &&
        order.deliveryStatus === 'sent' &&
        order.updatedAt >= today,
    ).length,
  };

  return (
    <Suspense fallback={null}>
      <OwnerOrdersBoard stats={stats} />
    </Suspense>
  );
}
