/**
 * Owner Bot Studio. The owner row has a null tenant id.
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { readStudio, writeStudio } from '@/modules/store-config/access';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const session = await requireOwner();
    const studio = await readStudio(asDbClient(session.admin), 'owner', null);
    return jsonSuccess(studio);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    assertRateLimit(`bot-studio:${session.user.id}`, 30);
    const saved = await writeStudio(asDbClient(session.admin), 'owner', null, await readJsonBody(request), session.user.id);
    return jsonSuccess(saved);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
