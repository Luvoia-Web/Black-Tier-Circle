/**
 * @file app/api/bots/connect/route.ts
 *
 * POST, reseller only. Connects exactly one Telegram bot per tenant.
 * SECURITY: botToken is never returned in the response — not even masked.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { getAppUrl } from '@/lib/env';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { ConnectBotSchema } from '@/lib/validations/bots';
import { assertTenantCanConnectBot, connectBot } from '@/modules/bots';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    assertTenantCanConnectBot(session.tenant.status);
    const parsed = ConnectBotSchema.parse(await readJsonBody(request));
    const connection = await connectBot(asDbClient(session.admin), {
      tenantId: session.tenant.id,
      botToken: parsed.botToken,
    });
    return jsonSuccess({
      username: connection.username,
      telegramBotId: connection.telegramBotId,
      webhookUrl: `${getAppUrl()}/api/webhooks/telegram/${connection.id}`,
      connectedAt: connection.updatedAt.toISOString(),
    });
  } catch (error: unknown) {
    // #region agent log
    fetch('http://127.0.0.1:7919/ingest/7ddaa35c-0c58-42f6-8e24-2b102fb80347',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5914e5'},body:JSON.stringify({sessionId:'5914e5',hypothesisId:'H1',location:'api/bots/connect/route.ts',message:'connect route failed',data:{errorName:error instanceof Error?error.name:'unknown',errorMessage:error instanceof Error?error.message:'unknown',errorCode:typeof error==='object'&&error!==null&&'code' in error?String((error as {code:unknown}).code):''},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return handleRouteError(error);
  }
}
