import { asDbClient, requireReseller, requireRole } from '@/lib/auth/session';
import { probeChainProviders } from '@/integrations/bsc/verify';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { listWalletTopups, topupHealth } from '@/modules/topups/admin';
import { PUBLIC_ADDRESS_NOTE } from '@/lib/eth-address';

export const dynamic = 'force-dynamic';

const STATUSES = new Set(['all', 'pending', 'credited', 'expired', 'failed', 'rejected']);

async function scope(): Promise<{ db: ReturnType<typeof asDbClient>; tenantId: string | null }> {
  const session = await requireRole(['owner', 'reseller']);
  if (session.profile.role === 'owner') {
    return { db: asDbClient(session.admin), tenantId: null };
  }
  const reseller = await requireReseller();
  return { db: asDbClient(reseller.admin), tenantId: reseller.tenant.id };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { db, tenantId } = await scope();
    const url = new URL(request.url);
    const status = url.searchParams.get('status') ?? 'all';
    const page = Number(url.searchParams.get('page') ?? '1');
    const query = url.searchParams.get('q') ?? '';
    const list = await listWalletTopups(db, tenantId, {
      status: STATUSES.has(status) ? status : 'all',
      query,
      page: Number.isFinite(page) ? page : 1,
    });
    const health = url.searchParams.get('health') === '0' ? null : await topupHealth(db, tenantId, probeChainProviders);
    return jsonSuccess({ health, ...list, note: PUBLIC_ADDRESS_NOTE });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
