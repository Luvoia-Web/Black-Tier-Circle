/**
 * @file app/api/assistant/route.ts
 *
 * Streams a Black Tier Circle Remy AI assistant reply from Groq.
 *
 * @module Api
 */

import { asDbClient, requireReseller, requireRole } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import {
  isNoiseMemoryText,
  recallCustomerExperience,
  resolveCustomerMemoryBank,
  retainCommerceExperience,
  type MemoryEvidence,
} from '@/lib/hindsight';
import { handleRouteError, readJsonBody } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limiter';
import { buildRemyLiveContext, buildRemySystemPrompt } from '@/modules/platform/remy-context';
import { getTenantByUserId } from '@/modules/tenants';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireRole(['owner', 'reseller']);
    const rate = await consumeRateLimit({
      key: `assistant:chat:${session.user.id}`,
      limit: 30,
      windowMs: 60_000,
      fail: 'closed',
    });
    if (!rate.allowed) {
      throw new AppError('RATE_LIMITED', 'Too many messages sent. Please wait a minute.', 429);
    }

    const body = BodySchema.parse(await readJsonBody(request));
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new AppError('ASSISTANT_UNAVAILABLE', 'Add GROQ_API_KEY to enable Remy AI', 503);
    }

    const userMessage = [...body.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    const chatRole = session.profile.role === 'reseller' ? 'reseller' : 'owner';
    const db = asDbClient(session.admin);
    let scopedTenantId: string | null = null;
    if (chatRole === 'reseller') {
      const reseller = await requireReseller();
      scopedTenantId = reseller.tenant.id;
    }

    const [liveContext, memory] = await Promise.all([
      buildRemyLiveContext(db, {
        role: chatRole,
        tenantId: scopedTenantId,
        timezone: session.profile.timezone,
      }),
      loadCustomerMemory(session, userMessage, scopedTenantId),
    ]);
    const system = buildRemySystemPrompt(chatRole, liveContext, memory.memories);

    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        max_tokens: 1024,
        stream: true,
        messages: [{ role: 'system', content: system }, ...body.messages],
      }),
    });

    if (!upstream.ok || upstream.body === null) {
      const detail = await upstream.text();
      throw new AppError('ASSISTANT_FAILED', detail.slice(0, 180) || 'Assistant request failed', 502);
    }

    const memoryPowered = memory.memories.length > 0;
    await asDbClient(session.admin).from('audit_log').insert({
      actor_id: session.user.id,
      tenant_id: chatRole === 'reseller' ? memory.tenantId : null,
      action: 'assistant.chat',
      target_type: 'assistant',
      target_id: null,
      reason: userMessage.slice(0, 200) || 'Remy AI question',
      after_val: {
        role: chatRole,
        messageCount: body.messages.length,
        memoryPowered,
      },
    });

    const prelude = `data: ${JSON.stringify({
      type: 'memory_context',
      memoryPowered,
      notice: memory.notice,
      memories: memory.memories.slice(0, 5).map((item) => ({ text: item.text })),
    })}\n\n`;
    const encoder = new TextEncoder();
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let aiResponse = '';
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(prelude));
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) {
              break;
            }
            buffer += decoder.decode(chunk.value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) {
                continue;
              }
              const payload = trimmed.slice(5).trim();
              if (!payload || payload === '[DONE]') {
                continue;
              }
              try {
                const event = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const text = event.choices?.[0]?.delta?.content;
                if (typeof text !== 'string' || text.length === 0) {
                  continue;
                }
                aiResponse += text;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'content_block_delta', delta: { text } })}\n\n`,
                  ),
                );
              } catch {
                // Ignore keep-alive lines from the upstream stream.
              }
            }
          }
          controller.close();
        } catch (error: unknown) {
          controller.error(error);
        } finally {
          if (memory.bankId && aiResponse.trim().length > 0 && !isNoiseMemoryText(aiResponse)) {
            void retainCommerceExperience(
              memory.bankId,
              `chat-${Date.now()}`,
              `User asked: ${userMessage.slice(0, 200)} | Response summary: ${aiResponse.slice(0, 200)}`,
              ['kind:support_resolution'],
              { channel: 'chatbot' },
            ).catch(() => undefined);
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Memory-Powered': memoryPowered ? 'true' : 'false',
      },
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

async function loadCustomerMemory(
  session: Awaited<ReturnType<typeof requireRole>>,
  userMessage: string,
  resellerTenantId: string | null,
): Promise<{ tenantId: string | null; bankId: string | null; memories: MemoryEvidence[]; notice: string | null }> {
  const missing = memoryConfigNotice();
  let tenantId: string | null = resellerTenantId;
  const customerId = session.user.id;
  if (!tenantId && session.profile.role !== 'reseller') {
    try {
      const tenant = await getTenantByUserId(asDbClient(session.admin), session.user.id);
      tenantId = tenant.id;
    } catch {
      tenantId = null;
    }
  }

  if (tenantId && userMessage.trim().length > 0 && !missing) {
    const bankId = resolveCustomerMemoryBank(tenantId, customerId);
    try {
      const memories = await recallCustomerExperience(bankId, userMessage, {
        budget: 'low',
        timeoutMs: 1200,
      });
      if (memories.length > 0) {
        return { tenantId, bankId, memories, notice: null };
      }
    } catch {
      return {
        tenantId,
        bankId,
        memories: [],
        notice: 'The memory service did not respond. Remy will answer without recalled memory.',
      };
    }
  }

  return {
    tenantId,
    bankId: tenantId ? resolveCustomerMemoryBank(tenantId, customerId) : null,
    memories: [],
    notice: missing,
  };
}

function memoryConfigNotice(): string | null {
  if (process.env.HINDSIGHT_ENABLED !== 'true') {
    return 'The memory service is turned off. Remy will answer without recalling past buyers.';
  }
  if (!process.env.HINDSIGHT_API_KEY || !(process.env.HINDSIGHT_API_URL || process.env.HINDSIGHT_BASE_URL)) {
    return 'The memory service is missing its key or URL. Remy will answer without recalled memory.';
  }
  return null;
}
