import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { ReferralQuerySchema } from '@/lib/validations/growth';
import { listGrowthReferrals } from '@/modules/referrals/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    assertRateLimit(`growth:${session.user.id}`, 30);
    const url = new URL(request.url);
    const query = ReferralQuerySchema.parse({
      status: url.searchParams.get('status') ?? 'all',
      page: url.searchParams.get('page') ?? '1',
      pageSize: url.searchParams.get('pageSize') ?? '20',
    });
    const data = await listGrowthReferrals(
      asDbClient(session.admin),
      session.tenant.id,
      query.status,
      query.page,
      query.pageSize,
    );
    return jsonSuccess(data);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
