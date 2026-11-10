/**
 * Reseller Bot Studio. The tenant always comes from the session.
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { readStudio, writeStudio } from '@/modules/store-config/access';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const session = await requireReseller();
    const studio = await readStudio(asDbClient(session.admin), 'reseller', session.tenant.id);
    return jsonSuccess(studio);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    assertRateLimit(`bot-studio:${session.user.id}`, 30);
    const saved = await writeStudio(
      asDbClient(session.admin),
      'reseller',
      session.tenant.id,
      await readJsonBody(request),
      session.user.id,
    );
    return jsonSuccess(saved);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
